import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';

const requiredReleaseRoots = Object.freeze([
  'generated',
  'assets',
  'README.md',
  'LICENSE',
  'NOTICE',
  'package.json',
  'licenses',
]);

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

function normalizePath(value) {
  return value.replace(/\\/gu, '/').replace(/^package\//u, '').replace(/\/$/u, '');
}

function isDeclared(relativePath, manifestFile) {
  const normalized = normalizePath(manifestFile);
  return relativePath === normalized || relativePath.startsWith(`${normalized}/`);
}

export function assertPackedFileBoundary({ entries, manifestFiles, requiredEntries = [] }) {
  const actualEntries = [...entries].sort();
  const manifest = [...manifestFiles];
  const duplicates = actualEntries.filter((entry, index) => entry === actualEntries[index - 1]);
  if (duplicates.length !== 0) fail('R1_EXIT_PACK_CONTENT_INVALID', `duplicate archive entries: ${duplicates.join(', ')}`);

  for (const required of requiredReleaseRoots) {
    if (!manifest.includes(required)) fail('R1_EXIT_PACK_CONTENT_INVALID', `manifest files omit required release entry: ${required}`);
  }

  for (const required of requiredEntries) {
    if (!actualEntries.includes(required)) fail('R1.5_PACK_CONTENT_MISSING', required);
  }

  for (const entry of actualEntries) {
    if (!entry.startsWith('package/') || entry.endsWith('/') || entry.includes('/../')) {
      fail('R1_EXIT_PACK_CONTENT_INVALID', entry);
    }
    const relative = normalizePath(entry);
    if (!manifest.some((file) => isDeclared(relative, file))) {
      fail('R1.5_PACK_CONTENT_INVALID', `archive entry is outside the declared package boundary: ${entry}`);
    }
  }

  for (const manifestFile of manifest) {
    if (!actualEntries.some((entry) => isDeclared(normalizePath(entry), manifestFile))) {
      fail('R1.5_PACK_CONTENT_MISSING', `declared package entry is absent: ${manifestFile}`);
    }
  }

  for (const requiredDirectory of ['generated', 'assets', 'licenses']) {
    if (!actualEntries.some((entry) => normalizePath(entry).startsWith(`${requiredDirectory}/`))) {
      fail('R1.5_PACK_CONTENT_MISSING', `${requiredDirectory}/`);
    }
  }

  return actualEntries;
}

export function assertExactArchiveEntries(actual, expected, code = 'R1.5_PACK_CONTENT_INVALID') {
  const actualEntries = [...actual].sort();
  const expectedEntries = [...expected].sort();
  if (actualEntries.length !== expectedEntries.length
    || actualEntries.some((entry, index) => entry !== expectedEntries[index])) {
    const missing = expectedEntries.filter((entry) => !actualEntries.includes(entry));
    const unexpected = actualEntries.filter((entry) => !expectedEntries.includes(entry));
    const duplicates = actualEntries.filter((entry, index) => entry === actualEntries[index - 1]);
    fail(code, `archive entries differ from the expected package set; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}; duplicate: ${duplicates.join(', ') || 'none'}`);
  }
  return actualEntries;
}

export function assertStylesheetAssetUrls({ stylesheet, stylesheetEntry, entries, entrySizes }) {
  const localUrls = [...stylesheet.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/gu)]
    .map(([, doubleQuoted, singleQuoted, bare]) => doubleQuoted ?? singleQuoted ?? bare)
    .filter((url) => !/^(?:data:|https?:|#)/u.test(url));
  if (localUrls.length === 0) fail('R1.5_PACK_STYLE_ASSET_MISSING', 'stylesheet contains no local asset URLs');

  for (const url of localUrls) {
    const relative = url.split(/[?#]/u, 1)[0];
    const archiveEntry = posix.normalize(posix.join(posix.dirname(stylesheetEntry), relative));
    if (!archiveEntry.startsWith('package/') || archiveEntry.includes('/../')) {
      fail('R1.5_PACK_STYLE_ASSET_MISSING', `stylesheet URL escapes the package: ${url}`);
    }
    if (!entries.includes(archiveEntry)) fail('R1.5_PACK_STYLE_ASSET_MISSING', archiveEntry);
    const size = entrySizes instanceof Map ? entrySizes.get(archiveEntry) : entrySizes?.[archiveEntry];
    if (!Number.isFinite(size) || size <= 0) fail('R1.5_PACK_STYLE_ASSET_MISSING', archiveEntry);
  }
}

export function assertExactDependencyGraph(actual, expected) {
  const actualNames = Object.keys(actual ?? {}).sort();
  const expectedNames = Object.keys(expected ?? {}).sort();
  if (actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
    || expectedNames.some((name) => actual[name] !== expected[name])) {
    fail('R1_EXIT_PACK_MANIFEST_INVALID', `runtime dependency graph drifted: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

export function assertExactExportList(actual, expected, code = 'R1.5_PACK_EXPORT_SURFACE_INVALID') {
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    fail(code, `expected ${expected.join(', ')}, received ${actual.join(', ')}`);
  }
}

export function deriveCurrentExportSurface({ historicalFamilies, supplementalComponents }) {
  const canonicalHistoricalExports = historicalFamilies.map(({ corePublicFamily }) => corePublicFamily);
  const sortedSupplementalComponents = supplementalComponents.slice().sort((left, right) => left.slug.localeCompare(right.slug));
  const supplementalExports = sortedSupplementalComponents.map(({ export: { name } }) => name);
  const currentComponentExports = [...canonicalHistoricalExports, ...supplementalExports];
  const currentRootExports = [
    ...canonicalHistoricalExports,
    ...sortedSupplementalComponents.filter(({ export: { module } }) => module === '.').map(({ export: { name } }) => name),
  ];
  const isolatedExportModules = sortedSupplementalComponents
    .filter(({ export: { module } }) => module !== '.')
    .map(({ export: { name, module } }) => `${name}:${module}`);
  return { canonicalHistoricalExports, currentComponentExports, currentRootExports, isolatedExportModules };
}

// The React generator's output map is the single owner of the packed generated/ file set.
export function readGeneratedOutputNames(packageRoot) {
  const result = spawnSync(process.execPath, ['src/generate.mjs', '--list-outputs'], { cwd: packageRoot, encoding: 'utf8' });
  if (result.status !== 0) fail('R1.5_PACK_GENERATED_OUTPUTS_UNAVAILABLE', result.stderr || result.stdout);
  let names;
  try {
    names = JSON.parse(result.stdout);
  } catch (error) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', `generator --list-outputs did not print JSON: ${error.message}`);
  }
  if (!Array.isArray(names) || names.length === 0) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', 'generator --list-outputs must print a non-empty array');
  }
  if (new Set(names).size !== names.length) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', 'generator --list-outputs printed duplicate names');
  }
  const invalid = names.filter((name) => typeof name !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/u.test(name));
  if (invalid.length !== 0) {
    fail('R1.5_PACK_GENERATED_OUTPUTS_INVALID', `generated output names must be flat lowercase file names: ${invalid.map(String).join(', ')}`);
  }
  return names.sort();
}

export function deriveExpectedPackageEntries({ generatedOutputs, fixedEntries, trackedEntries }) {
  return [
    ...generatedOutputs.map((name) => `package/generated/${name}`),
    ...fixedEntries,
    ...trackedEntries,
  ].sort();
}

export { requiredReleaseRoots };

// Node's node_modules lookup: every ancestor that is not itself a node_modules directory.
function findInstalledPackage(fromDirectory, name) {
  for (let directory = fromDirectory; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name);
    if (basename(directory) !== 'node_modules' && existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(directory) === directory) return null;
  }
}

/**
 * Walks the installed runtime closure of `rootName` from a consumer through
 * Node's node_modules lookup, so npm, pnpm, and yarn node-modules layouts agree.
 * Installed peers are followed; `excludedNames` (the consumer-owned React peers)
 * are not. Returns a sorted Map of package name to its installed versions.
 */
export function collectInstalledClosure(consumerRoot, rootName, { excludedNames = [] } = {}) {
  const excluded = new Set(excludedNames);
  const rootDirectory = findInstalledPackage(consumerRoot, rootName);
  if (!rootDirectory) fail('R1_EXIT_CONSUMER_GRAPH_INVALID', `${rootName} is not installed in ${consumerRoot}`);
  const versions = new Map();
  const visited = new Set();
  const pending = [rootDirectory];
  while (pending.length !== 0) {
    const directory = pending.pop();
    if (visited.has(directory)) continue;
    visited.add(directory);
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (!versions.has(manifest.name)) versions.set(manifest.name, new Set());
    versions.get(manifest.name).add(manifest.version);
    // An optionalDependencies entry overrides the same name in dependencies.
    const optional = new Set(Object.keys(manifest.optionalDependencies ?? {}));
    const edges = [
      ...Object.keys(manifest.dependencies ?? {}).map((name) => [name, !optional.has(name)]),
      ...[...optional, ...Object.keys(manifest.peerDependencies ?? {})].map((name) => [name, false]),
    ];
    for (const [name, required] of edges) {
      if (excluded.has(name)) continue;
      const next = findInstalledPackage(directory, name);
      if (next) pending.push(next);
      else if (required) fail('R1_EXIT_CONSUMER_GRAPH_INVALID', `${manifest.name} cannot resolve its dependency ${name}`);
    }
  }
  return new Map([...versions].sort(([left], [right]) => left.localeCompare(right))
    .map(([name, set]) => [name, [...set].sort()]));
}

export function assertSingleInstalledVersion(closure, name, code) {
  const versions = closure.get(name) ?? [];
  if (versions.length !== 1) {
    fail(code, `expected exactly one installed ${name} version, found ${versions.length === 0 ? 'none' : versions.join(', ')}`);
  }
  return versions[0];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Builds the upstream-name matcher for the public surface. A scoped name or a bare
 * scope such as `@tiptap/` matches the whole scope; hyphenated or dotted names match
 * anywhere as names; plain words
 * such as `motion` or `marked` match only in specifier form (quoted, `name/x`,
 * or `name@1`) so prose like "typography and motion tokens" stays allowed.
 */
export function createUpstreamNameMatcher(packageNames, tokens = ['UNSTABLE_']) {
  const scopes = new Set();
  const distinctive = new Set();
  const plain = new Set();
  for (const name of packageNames) {
    if (name.startsWith('@')) scopes.add(name.slice(0, name.indexOf('/') + 1));
    else if (/[-.]/u.test(name)) distinctive.add(name);
    else plain.add(name);
  }
  const sources = [
    ...[...scopes].map((scope) => `(?<![\\w@/.-])${escapeRegExp(scope)}[\\w.-]+`),
    ...[...distinctive].map((name) => `(?<![\\w@/.-])${escapeRegExp(name)}(?![\\w-])`),
    ...[...plain].map((name) => `(?<=['"\`])${escapeRegExp(name)}(?=['"\`/@])|(?<![\\w@/.-])${escapeRegExp(name)}(?:@\\d|/[a-z])`),
    ...tokens.map(escapeRegExp),
  ];
  return new RegExp(sources.join('|'), 'gu');
}

function jsonPathMatches(path, pattern) {
  return path === pattern || path.startsWith(`${pattern}.`) || path.startsWith(`${pattern}[`);
}

function collectJsonLeaks(value, path, matcher, allowedPaths, findings, file) {
  if (allowedPaths.some((pattern) => jsonPathMatches(path, pattern))) return;
  if (Array.isArray(value)) {
    value.forEach((child) => collectJsonLeaks(child, `${path}[]`, matcher, allowedPaths, findings, file));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (allowedPaths.some((pattern) => jsonPathMatches(childPath, pattern))) continue;
      for (const [match] of key.matchAll(matcher)) findings.push({ file, location: `${childPath} (key)`, match });
      collectJsonLeaks(child, childPath, matcher, allowedPaths, findings, file);
    }
    return;
  }
  if (typeof value === 'string') {
    for (const [match] of value.matchAll(matcher)) findings.push({ file, location: path, match });
  }
}

const moduleSpecifierPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|<reference\s+types\s*=\s*)(['"])([^'"]+)\1/gu;

/**
 * Finds upstream names on the public surface. `declarations` may reference only
 * relative files and `allowedSpecifiers`; `entries` may not re-export a bare
 * specifier; `texts` and `json` guidance must not name an upstream package
 * outside `allowedJsonPaths` (dependency disclosure and donor provenance).
 */
export function findPublicSurfaceLeaks({
  declarations = [],
  entries = [],
  texts = [],
  json = [],
  matcher,
  allowedSpecifiers = ['react', 'react-dom'],
}) {
  const findings = [];
  const allowed = new Set(allowedSpecifiers);
  const bare = (specifier) => !specifier.startsWith('.') && !specifier.startsWith('/');
  const isAllowed = (specifier) => allowed.has(specifier) || [...allowed].some((name) => specifier.startsWith(`${name}/`));
  for (const { file, text } of declarations) {
    for (const [, , specifier] of text.matchAll(moduleSpecifierPattern)) {
      if (bare(specifier) && !isAllowed(specifier)) findings.push({ file, location: 'module specifier', match: specifier });
    }
    for (const [match] of text.matchAll(matcher)) findings.push({ file, location: 'declaration text', match });
  }
  for (const { file, text } of entries) {
    for (const [statement, , specifier] of text.matchAll(/\bexport\s+(?:\*|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s*(['"])([^'"]+)\1/gu)) {
      if (bare(specifier)) findings.push({ file, location: 'public re-export', match: statement });
    }
  }
  for (const { file, text } of texts) {
    for (const [match] of text.matchAll(matcher)) findings.push({ file, location: 'guidance text', match });
  }
  for (const { file, value, allowedJsonPaths = [] } of json) {
    collectJsonLeaks(value, '$', matcher, allowedJsonPaths, findings, file);
  }
  return findings;
}

export function assertNoPublicSurfaceLeaks(options) {
  const findings = findPublicSurfaceLeaks(options);
  if (findings.length !== 0) {
    fail('R1_EXIT_PACK_PUBLIC_LEAK', `upstream implementation detail leaked through the public surface: ${findings
      .map(({ file, location, match }) => `${file} ${location}: ${match}`).join('; ')}`);
  }
}

/** Maps a bundled module id to its installed package name, or null for consumer files. */
export function bundledModulePackage(id) {
  const normalized = id.replace(/\\/gu, '/').replace(/^\0/u, '');
  const index = normalized.lastIndexOf('/node_modules/');
  if (index === -1) return null;
  const segments = normalized.slice(index + '/node_modules/'.length).split('/');
  return segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

/**
 * Asserts a consumer bundle keeps `required` module ids and drops every
 * `forbidden` group; each forbidden entry names a label and a module-id test.
 */
export function assertBundleRetention({ modules, required = [], forbidden = [], code = 'R1_EXIT_PACK_TREE_SHAKING_FAILED' }) {
  const ids = modules.map(({ id }) => id.replace(/\\/gu, '/'));
  const missing = required.filter(({ test }) => !ids.some((id) => test(id))).map(({ label }) => label);
  const retained = forbidden.flatMap(({ label, test }) => {
    const hits = ids.filter((id) => test(id));
    return hits.length === 0 ? [] : [`${label} (${hits.slice(0, 3).join(', ')}${hits.length > 3 ? `, +${hits.length - 3} more` : ''})`];
  });
  if (missing.length !== 0 || retained.length !== 0) {
    fail(code, `required: ${missing.join(', ') || 'present'}; retained: ${retained.join('; ') || 'none'}`);
  }
}

/** Sums rendered bytes per installed package, with package-local files grouped under `self`. */
export function summarizeBundleModules(modules, self) {
  const totals = new Map();
  for (const { id, bytes } of modules) {
    const name = bundledModulePackage(id) ?? self;
    totals.set(name, (totals.get(name) ?? 0) + bytes);
  }
  return [...totals].sort(([, left], [, right]) => right - left);
}
