import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import donorCrosswalk from '../../../catalog/react-r1-6/donor-crosswalk.json' with { type: 'json' };

/**
 * The finite report is a retained input to a later Mux-only replay. Keep the
 * schema marker separate from the diagnostic runner's implementation version
 * so a report cannot accidentally be consumed as an older capture format.
 */
export const FINITE_CAPTURE_REPORT_SCHEMA = 'muxui-react-r1-6-finite-capture-integrity-v1';

export const FINITE_CAPTURE_MODES = Object.freeze(['light', 'dark']);

export const FINITE_REPLAY_FACT_KEYS = Object.freeze([
  'styleFacts',
  'facts',
  'actualNamedAnatomyParts',
  'fonts',
  'motion',
  'lifecycle',
  'rawPNG',
]);

export const PINNED_FINITE_DONOR = Object.freeze({
  repository: donorCrosswalk.donor.repository,
  commit: donorCrosswalk.donor.commit,
  tree: donorCrosswalk.donor.tree,
  styleTree: donorCrosswalk.donor.styleTree,
  usage: donorCrosswalk.donor.usage,
  dependency: donorCrosswalk.donor.dependency,
});

const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const missing = Symbol('missing');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function valueAt(value, key) {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : missing;
}

function formatPath(path) {
  return path || '<root>';
}

function exactDifferences(expected, actual, path = '') {
  if (expected === missing || actual === missing) {
    return expected === actual ? [] : [`${formatPath(path)} is ${actual === missing ? 'missing' : 'unexpected'}`];
  }
  if (expected instanceof Uint8Array || actual instanceof Uint8Array) {
    if (!(expected instanceof Uint8Array) || !(actual instanceof Uint8Array) || expected.length !== actual.length) return [`${formatPath(path)} differs`];
    for (let index = 0; index < expected.length; index += 1) {
      if (expected[index] !== actual[index]) return [`${formatPath(path)} differs`];
    }
    return [];
  }
  if (Object.is(expected, actual)) return [];
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') return [`${formatPath(path)} differs`];
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual) || expected.length !== actual.length) return [`${formatPath(path)} differs`];
    return expected.flatMap((value, index) => exactDifferences(value, actual[index], `${path}[${index}]`));
  }
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .flatMap((key) => exactDifferences(valueAt(expected, key), valueAt(actual, key), path ? `${path}.${key}` : key));
}

function assertExact(expected, actual, message) {
  const differences = exactDifferences(expected, actual);
  if (differences.length > 0) throw new Error(`${message}: ${differences.slice(0, 8).join('; ')}`);
  return true;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function sha256Bytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('finite capture bytes must be a Uint8Array');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function sha256Json(value) {
  return sha256Bytes(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

/** Validate the path before it is joined to a retained report directory. */
export function assertReportRelativePath(value, name = 'artifact path') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\\') || isAbsolute(value)) {
    throw new Error(`${name} must be a non-empty report-relative path`);
  }
  const normalized = value.split('/').join(sep);
  if (normalized === '.' || normalized.startsWith(`..${sep}`) || normalized.includes(`${sep}..${sep}`) || normalized.endsWith(`${sep}..`)) {
    throw new Error(`${name} must stay inside the report directory`);
  }
  if (normalize(normalized) !== normalized) throw new Error(`${name} must be normalized and report-relative`);
  return value;
}

async function assertNoSymlink(root, candidate, name) {
  const child = relative(root, candidate);
  if (!child || isAbsolute(child) || child.startsWith(`..${sep}`) || child === '..') throw new Error(`${name} escapes the report directory`);
  let current = root;
  for (const part of child.split(sep)) {
    current = join(current, part);
    const stat = await lstat(current).catch((error) => {
      if (error?.code === 'ENOENT') throw new Error(`${name} is missing`);
      throw error;
    });
    if (stat.isSymbolicLink()) throw new Error(`${name} must not use a symbolic link`);
  }
}

async function checkedArtifactPath(reportDirectory, relativePath) {
  assertReportRelativePath(relativePath);
  const root = await realpath(reportDirectory).catch(() => { throw new Error('retained report directory is missing'); });
  const candidate = resolve(root, relativePath);
  await assertNoSymlink(root, candidate, 'retained artifact path');
  const stat = await lstat(candidate).catch(() => { throw new Error(`retained artifact is missing: ${relativePath}`); });
  if (!stat.isFile()) throw new Error(`retained artifact is not a regular file: ${relativePath}`);
  return { root, candidate };
}

/**
 * Read one retained artifact only after proving that its path and every path
 * component remain inside the report directory. The digest is always computed
 * from the bytes read from disk.
 */
export async function readRetainedArtifact(reportDirectory, relativePath, expectedSha256) {
  if (!digestPattern.test(expectedSha256 ?? '')) throw new Error('retained artifact must declare a SHA-256 digest');
  const { candidate } = await checkedArtifactPath(reportDirectory, relativePath);
  const bytes = await readFile(candidate);
  const actualSha256 = sha256Bytes(bytes);
  if (actualSha256 !== expectedSha256) throw new Error(`retained artifact bytes are corrupt: ${relativePath}`);
  return { path: relativePath, sha256: actualSha256, byteLength: bytes.byteLength, bytes };
}

export function artifactRecord(relativePath, bytes) {
  assertReportRelativePath(relativePath);
  return { path: relativePath, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength };
}

export async function buildContentManifest(rootDirectory, relativePaths) {
  if (!Array.isArray(relativePaths) || relativePaths.length === 0) throw new Error('content manifest needs at least one path');
  const paths = [...relativePaths].sort();
  if (new Set(paths).size !== paths.length) throw new Error('content manifest contains duplicate paths');
  const entries = [];
  for (const path of paths) {
    const { candidate } = await checkedArtifactPath(rootDirectory, path);
    const bytes = await readFile(candidate);
    const artifact = { path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength };
    entries.push({ path: artifact.path, sha256: artifact.sha256, byteLength: artifact.byteLength });
  }
  return entries;
}

function normalizedAction(action) {
  return action === undefined ? null : action;
}

export function assertCaptureInput(result, scenario) {
  if (!isRecord(result?.input)) throw new Error(`finite capture ${result?.scenario ?? '<unknown>'} must retain props and action input`);
  if (!Object.hasOwn(result.input, 'props') || !Object.hasOwn(result.input, 'action')) throw new Error(`finite capture ${result.scenario} must retain explicit props and action values`);
  assertExact(scenario?.props ?? {}, result.input.props, `finite capture ${result.scenario} props do not match the requested scenario`);
  assertExact(normalizedAction(scenario?.action), result.input.action, `finite capture ${result.scenario} action does not match the requested scenario`);
}

/**
 * Ensure every requested scenario/mode appears once and only once. This is
 * deliberately independent of a report's summary counters.
 */
export function assertFiniteInventory({ scenarios, modes = FINITE_CAPTURE_MODES, results }) {
  if (!Array.isArray(scenarios) || !Array.isArray(results)) throw new TypeError('finite inventory requires scenarios and results arrays');
  if (scenarios.length === 0) throw new Error('finite inventory must request at least one scenario');
  const scenarioById = new Map();
  for (const scenario of scenarios) {
    if (!isRecord(scenario) || typeof scenario.id !== 'string' || scenario.id.length === 0) throw new Error('finite scenario IDs must be non-empty strings');
    if (scenarioById.has(scenario.id)) throw new Error(`finite inventory has duplicate scenario ${scenario.id}`);
    scenarioById.set(scenario.id, scenario);
  }
  if (modes.length === 0 || new Set(modes).size !== modes.length || modes.some((mode) => !FINITE_CAPTURE_MODES.includes(mode))) throw new Error('finite inventory modes are invalid or duplicated');
  const expected = new Set(scenarios.flatMap(({ id }) => modes.map((mode) => `${id}\0${mode}`)));
  const seen = new Set();
  for (const result of results) {
    if (!isRecord(result) || typeof result.scenario !== 'string' || typeof result.mode !== 'string') throw new Error('finite result must name a scenario and mode');
    const key = `${result.scenario}\0${result.mode}`;
    if (!expected.has(key)) throw new Error(`finite result is outside the requested inventory: ${result.scenario}/${result.mode}`);
    if (seen.has(key)) throw new Error(`finite inventory has duplicate result ${result.scenario}/${result.mode}`);
    seen.add(key);
    assertCaptureInput(result, scenarioById.get(result.scenario));
  }
  const missingResults = [...expected].filter((key) => !seen.has(key)).map((key) => key.replace('\0', '/'));
  if (missingResults.length > 0) throw new Error(`finite inventory is missing results: ${missingResults.join(', ')}`);
  return { requested: scenarios.length, modes: [...modes], captureCount: results.length, complete: true };
}

export function assertFiniteReportSchema(report) {
  if (!isRecord(report) || report.schema !== FINITE_CAPTURE_REPORT_SCHEMA) throw new Error(`finite report schema must be ${FINITE_CAPTURE_REPORT_SCHEMA}`);
  return true;
}

export function assertPinnedFiniteDonor(actual) {
  if (!isRecord(actual)) throw new Error('finite paired report is missing donor identity');
  for (const [key, expected] of Object.entries(PINNED_FINITE_DONOR)) {
    if (actual[key] !== expected) throw new Error(`finite paired donor ${key} is not pinned to the Mux-owned crosswalk`);
  }
  return true;
}

function pathValue(value, path) {
  return path.split('.').reduce((current, key) => current === missing ? missing : valueAt(current, key), value);
}

/**
 * Compare the complete normalized binding used to produce a retained report.
 * Callers should include source/tool/fixture/props/action/font/browser records
 * in that binding; no commit identity is treated as a substitute for content.
 */
export function assertReferenceBinding(referenceBinding, currentBinding, { requiredPaths = [] } = {}) {
  if (!isRecord(referenceBinding) || !isRecord(currentBinding)) throw new Error('finite reference binding must be an object');
  for (const path of requiredPaths) {
    if (pathValue(referenceBinding, path) === missing) throw new Error(`finite reference binding is missing ${path}`);
    if (pathValue(currentBinding, path) === missing) throw new Error(`current finite binding is missing ${path}`);
  }
  assertExact(referenceBinding, currentBinding, 'finite reference report is stale');
  return true;
}

export function compareReplayFacts(reference, actual) {
  const issues = [];
  if (!isRecord(reference) || !isRecord(actual)) return { pass: false, issues: ['replay facts must be objects'] };
  for (const key of FINITE_REPLAY_FACT_KEYS) {
    const expected = valueAt(reference, key);
    const received = valueAt(actual, key);
    if (expected === missing || received === missing || expected === undefined || received === undefined) {
      issues.push(`${key} is missing`);
      continue;
    }
    issues.push(...exactDifferences(expected, received, key));
  }
  return { pass: issues.length === 0, issues };
}

function factObject(value, name) {
  if (!isRecord(value) || Object.keys(value).length === 0) return `${name} is missing or empty`;
  return null;
}

/** Reject providers that merely return a non-empty marker instead of facts. */
export function assertReplayFactShape(facts, name = 'finite replay facts') {
  if (!isRecord(facts)) throw new Error(`${name} must be an object`);
  for (const key of FINITE_REPLAY_FACT_KEYS) {
    if (!Object.hasOwn(facts, key)) throw new Error(`${name}.${key} is missing`);
  }
  const styleIssue = factObject(facts.styleFacts, `${name}.styleFacts`);
  if (styleIssue || typeof facts.styleFacts.selector !== 'string' || !isRecord(facts.styleFacts.properties) || Object.keys(facts.styleFacts.properties).length === 0) throw new Error(styleIssue ?? `${name}.styleFacts must name a selector and properties`);
  const factsIssue = factObject(facts.facts, `${name}.facts`);
  if (factsIssue) throw new Error(factsIssue);
  const anatomyIssue = Array.isArray(facts.actualNamedAnatomyParts)
    ? (facts.actualNamedAnatomyParts.length === 0 ? `${name}.actualNamedAnatomyParts is missing or empty` : null)
    : factObject(facts.actualNamedAnatomyParts, `${name}.actualNamedAnatomyParts`);
  if (anatomyIssue) throw new Error(anatomyIssue);
  if (!isRecord(facts.motion) || typeof facts.motion.reducedMotion !== 'boolean' || !Array.isArray(facts.motion.animations)) throw new Error(`${name}.motion must retain reduced-motion and animation facts`);
  if (facts.lifecycle !== null && !isRecord(facts.lifecycle)) throw new Error(`${name}.lifecycle must be an object or explicit null`);
  if (!isRecord(facts.rawPNG) || !digestPattern.test(facts.rawPNG.sha256 ?? '') || !Number.isInteger(facts.rawPNG.width) || facts.rawPNG.width <= 0 || !Number.isInteger(facts.rawPNG.height) || facts.rawPNG.height <= 0) throw new Error(`${name}.rawPNG must retain digest and dimensions`);
  if (!Array.isArray(facts.fonts) || facts.fonts.length === 0) throw new Error(`${name}.fonts must retain per-case font facts`);
  return true;
}

export function assertReplayFacts(reference, actual) {
  assertReplayFactShape(reference, 'reference finite replay facts');
  assertReplayFactShape(actual, 'actual finite replay facts');
  const comparison = compareReplayFacts(reference, actual);
  if (!comparison.pass) throw new Error(`finite replay facts differ: ${comparison.issues.slice(0, 8).join('; ')}`);
  return comparison;
}

export function assertAllowedRequests(requests, allowedOrigins) {
  if (!Array.isArray(requests)) throw new TypeError('blocked request inventory must be an array');
  const allowed = new Set((allowedOrigins ?? []).map((origin) => new URL(origin).origin));
  const unexpected = [];
  for (const request of requests) {
    const value = typeof request === 'string' ? request : request?.url;
    if (typeof value !== 'string') {
      unexpected.push(String(value));
      continue;
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      unexpected.push(value);
      continue;
    }
    if (url.protocol === 'data:' || allowed.has(url.origin)) continue;
    unexpected.push(value);
  }
  if (unexpected.length > 0) throw new Error(`finite capture made unexpected requests: ${unexpected.join(', ')}`);
  return true;
}

export function captureFingerprint(before, after) {
  const differences = exactDifferences(before, after);
  return { stable: differences.length === 0, invalidatedSource: differences.length > 0, differences };
}

export function assertStableCaptureFingerprint(before, after) {
  const result = captureFingerprint(before, after);
  if (!result.stable) throw new Error(`finite capture inputs changed during capture; source invalidated: ${result.differences.slice(0, 8).join('; ')}`);
  return result;
}

export function assertMuxOnlySourceBoundary(sources) {
  if (!Array.isArray(sources)) throw new TypeError('Mux-only source boundary requires source strings');
  for (const [index, source] of sources.entries()) {
    if (typeof source !== 'string') throw new TypeError(`Mux-only source ${index} must be text`);
    const clean = stripComments(source);
    const violation = moduleSpecifiers(source)
      .map((specifier) => boundaryViolation(source, specifier))
      .find(Boolean);
    if (violation || /\b(?:fetch|XMLHttpRequest)\s*(?:\(|\.)/u.test(clean)) throw new Error(`Mux-only source ${index} crosses the Tale or network boundary`);
  }
  return true;
}

const staticImportPattern = /^\s*(?:import\s+(?:[\s\S]*?\sfrom\s+)?|export\s+[\s\S]*?\sfrom\s+)['"]([^'"]+)['"]/gim;
const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const commonJsRequirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const forbiddenFilesystemSpecifiers = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process']);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/[^\r\n]*$/gmu, '');
}

function moduleSpecifiers(source) {
  const clean = stripComments(source);
  return [...clean.matchAll(staticImportPattern), ...clean.matchAll(dynamicImportPattern), ...clean.matchAll(commonJsRequirePattern)]
    .map((match) => match[1])
    .filter((specifier, index, all) => all.indexOf(specifier) === index);
}

function boundaryViolation(source, specifier) {
  if (specifier.startsWith('@tale-ui/') || specifier === '@tale-ui' || /(?:^|[\\/])tale-ui(?:[\\/]|$)|\/Users\/admin\/Projects\/tale-ui/u.test(specifier)) {
    return `Tale import ${specifier}`;
  }
  if (forbiddenFilesystemSpecifiers.has(specifier)) return `filesystem import ${specifier}`;
  if (/^https?:\/\//u.test(specifier)) return `network import ${specifier}`;
  const clean = stripComments(source);
  if (/\b(?:fetch|XMLHttpRequest)\s*(?:\(|\.)/u.test(clean)) return 'runtime network request';
  return undefined;
}

async function resolveLocalModule(fromPath, specifier) {
  const base = resolve(fromPath, '..', specifier);
  const candidates = isAbsolute(specifier) || /\.[a-z0-9]+$/iu.test(specifier)
    ? [base]
    : [base, `${base}.mjs`, `${base}.js`, `${base}.json`, `${base}.css`, join(base, 'index.mjs')];
  for (const candidate of candidates) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error(`Mux-only runtime import is missing: ${specifier} from ${fromPath}`);
}

function pathInside(root, candidate) {
  const child = relative(root, candidate);
  return child && !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`);
}

/**
 * Walk the executable local import closure used by Mux-only replay. Package
 * imports remain external module edges; local imports are resolved and checked
 * transitively so a Tale or filesystem edge cannot hide behind a helper file.
 */
export async function assertMuxOnlyRuntimeClosure({ rootDirectory, entryPaths }) {
  if (typeof rootDirectory !== 'string' || !Array.isArray(entryPaths) || entryPaths.length === 0) {
    throw new TypeError('Mux-only runtime closure needs a root directory and entry paths');
  }
  const root = await realpath(rootDirectory).catch(() => { throw new Error('Mux-only runtime root is missing'); });
  const visited = new Set();
  const files = [];
  const visit = async (inputPath) => {
    const filePath = await realpath(inputPath).catch(() => { throw new Error(`Mux-only runtime entry is missing: ${inputPath}`); });
    if (!pathInside(root, filePath)) throw new Error(`Mux-only runtime import escapes its owned root: ${filePath}`);
    if (visited.has(filePath)) return;
    visited.add(filePath);
    files.push(relative(root, filePath).split(sep).join('/'));
    const source = await readFile(filePath, 'utf8');
    const clean = stripComments(source);
    for (const specifier of moduleSpecifiers(source)) {
      const violation = boundaryViolation(source, specifier);
      if (violation) throw new Error(`Mux-only runtime closure crosses boundary in ${filePath}: ${violation}`);
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue;
      const nextPath = await resolveLocalModule(filePath, specifier);
      await visit(nextPath);
    }
    if (/\b(?:fetch|XMLHttpRequest)\s*(?:\(|\.)/u.test(clean)) throw new Error(`Mux-only runtime closure crosses boundary in ${filePath}: runtime network request`);
  };
  for (const entryPath of entryPaths) await visit(entryPath);
  return { files: files.sort() };
}
