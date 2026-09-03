import { createHash } from 'node:crypto';
import { access, lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  applicableMigrationRecords,
  canonicalStateCoverage,
  compatibilityStateCoverage,
  fixtureContractFor,
  migrationCases,
  migrationFrame,
  migrationQuery,
  migrationStoryId,
  noApplicableDonorFamilies,
  stateCoverage,
  supplementalStateCoverage,
  equivalentPartSelectorsFor,
  sharedFixtureInput,
} from './visual-migration-contract.mjs';
import { fixtureMapSourcePath } from './visual-migration-fixture-map.mjs';
import { taleStyleInventory, validateTaleStyleInventory } from './tale-style-inventory.mjs';

export const appRoot = resolve(import.meta.dirname, '..');
export const manifestPath = resolve(appRoot, 'visual-migration/manifest.json');
export const resultPath = resolve(appRoot, 'visual-migration/results');
export const donorAdapterSourcePath = 'visual-migration/bootstrap/donor-adapter.mjs';
export const donorEntrySourcePath = 'visual-migration/bootstrap/donor-entry.mjs';
export const donorRenderPlanSourcePath = 'visual-migration/bootstrap/donor-render-plan.mjs';
export const muxuiCaptureRunnerSourcePath = 'test/run-visual-migration.mjs';
export const muxuiCaptureProvenancePath = 'visual-migration/results/muxui-capture-provenance.json';
export const muxuiGeneratedTreePath = 'packages/react/generated';
export const muxuiGeneratedRequiredFiles = Object.freeze([
  'button.mjs',
  'collections.mjs',
  'compatibility.mjs',
  'components.mjs',
  'fields.mjs',
  'index.d.ts',
  'index.mjs',
  'overlays.mjs',
  'styles.css',
  'testing.mjs',
]);
export const baselineRootDirectory = 'visual-migration/baselines';
export const donorRootDirectory = 'visual-migration/donors';
export const taleStyleInventoryPath = 'visual-migration/tale-style-inventory.json';
export const taleStyleInventorySha256 = jsonSha256(taleStyleInventory);
export const expectedCaseInventory = Object.freeze(migrationCases.map(({ id, component, state }) => [id, component, state]));
export const expectedCaptureInventory = Object.freeze(migrationCases.flatMap(({ id, component, state }) => (
  ['light', 'dark'].map((mode) => [`${id}--${mode}`, id, component, state, mode])
)));
export const expectedStateCoverage = Object.freeze(stateCoverage.map(({ family, state, disposition, check }) => ({ family, state, disposition, check })));
export const expectedStateDispositionCounts = Object.freeze(Object.fromEntries([...new Set(expectedStateCoverage.map(({ disposition }) => disposition))].sort().map((disposition) => [disposition, expectedStateCoverage.filter((entry) => entry.disposition === disposition).length])));
export const expectedDescriptorStateCount = canonicalStateCoverage.length;
export const expectedCompatibilityStateCount = compatibilityStateCoverage.length;
export const expectedSupplementalStateCount = supplementalStateCoverage.length;
export const expectedSettling = Object.freeze({
  donor: 'document.fonts.ready plus two consecutive byte-identical screenshots (maximum 8 attempts)',
  muxui: 'document.fonts.ready plus animation cancellation, private-host caret suppression, and two consecutive byte-identical screenshots (maximum 8 attempts)',
});
export const expectedCaptureClock = Object.freeze({
  time: '2026-08-30T12:00:00+10:00',
  timezone: 'Australia/Melbourne',
});
const expectedDonorSettling = Object.freeze({
  donor: expectedSettling.donor,
  core: 'document.fonts.ready plus animation cancellation and two requestAnimationFrame ticks',
});

const expectedDonorRepository = 'https://github.com/Tale-UI/tale-ui';
const expectedDonorCommit = '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd';
export const expectedStoryId = migrationStoryId;
export const expectedStoryQuery = migrationQuery;
export const expectedDonorBindingSha256 = 'sha256:ea042e0f5f7b1143f3f2256dbcba6fb5658eb79381305646a77a0ffae162fbfd';
export const expectedThresholds = Object.freeze({ maxDiffPixelRatio: 0, pixelThreshold: 0.1 });
const safeCaseIdPattern = /^[a-z0-9]+(?:-+[a-z0-9]+)*$/u;
const safeResultSuffixPattern = /^[a-z0-9-]+\.[a-z0-9]+$/u;
const safeSnapshotDirectoryPattern = /^visual-migration\/(?:baselines|donors)\/sha256-[0-9a-f]{64}$/u;
const safeBaselineDirectoryPattern = /^visual-migration\/baselines\/sha256-[0-9a-f]{64}$/u;
const activationSchema = 'muxui-react-visual-migration-activation-v2';
const activationPhases = new Set(['prepared', 'backed-up', 'report-installed', 'activated']);
const activationMarkerKeys = Object.freeze([
  'schema', 'phase', 'manifest', 'report', 'manifestBackup', 'reportBackup',
  'muxuiCaptureProvenance', 'muxuiCaptureProvenanceBackup', 'previousSnapshot', 'nextSnapshot',
]);

export function assertSafeCaseId(caseId, name = 'case ID') {
  if (typeof caseId !== 'string' || !safeCaseIdPattern.test(caseId)) throw new Error(`${name} must use lowercase kebab-case`);
}

function assertInside(parent, candidate, message) {
  const child = relative(parent, candidate);
  if (!child || isAbsolute(child) || child.startsWith('..')) throw new Error(message);
}

export function resultFilePath(caseId, suffix, { root = resultPath } = {}) {
  assertSafeCaseId(caseId);
  if (typeof suffix !== 'string' || !safeResultSuffixPattern.test(suffix)) throw new Error('visual migration diagnostic suffix is not safe');
  const resultRoot = resolve(root);
  const candidate = resolve(resultRoot, `${caseId}.${suffix}`);
  assertInside(resultRoot, candidate, 'visual migration diagnostic path must remain inside its owned diagnostic directory');
  return candidate;
}

export function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function jsonSha256(value) {
  return sha256(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'));
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function hashJson(value) {
  return sha256(Buffer.from(JSON.stringify(canonicalize(value)), 'utf8'));
}

async function generatedTreeFiles(root) {
  const treeRoot = resolve(root, muxuiGeneratedTreePath);
  const files = [];
  async function collect(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await collect(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push({
          path: `${muxuiGeneratedTreePath}/${relativePath}`,
          sha256: sha256(await readFile(absolutePath)),
        });
      } else {
        throw new Error(`Mux UI generated tree contains unsupported entry: ${relativePath}`);
      }
    }
  }
  await collect(treeRoot);
  return files;
}

/**
 * Bind visual captures to every generated React artifact used by Storybook.
 * The generated tree is deliberately outside the Storybook output tree, so
 * this digest cannot self-reference captured screenshots or migration files.
 */
export async function muxuiGeneratedTreeProvenance({ root = resolve(appRoot, '../..') } = {}) {
  const files = await generatedTreeFiles(root);
  const filePaths = new Set(files.map(({ path }) => path.slice(`${muxuiGeneratedTreePath}/`.length)));
  for (const requiredFile of muxuiGeneratedRequiredFiles) {
    if (!filePaths.has(requiredFile)) throw new Error(`Mux UI generated tree is missing ${requiredFile}`);
  }
  return {
    path: muxuiGeneratedTreePath,
    fileCount: files.length,
    requiredFiles: muxuiGeneratedRequiredFiles,
    files,
    sha256: hashJson(files),
  };
}

// The one-time Tale capture predates the Mux UI identity reset. Keep its
// content-addressed case identity stable while current DOM selectors use the
// Mux UI namespace. Only action/region selector strings are normalized here;
// the live manifest still validates those fields against the current contract.
export function historicalCaseIdentity(value) {
  if (typeof value === 'string') return value.replaceAll('muxui', 'core');
  if (Array.isArray(value)) return value.map(historicalCaseIdentity);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, historicalCaseIdentity(item)]));
  return value;
}

export function historicalRuntimeFixtureSha256(entry) {
  return fixtureContractSha256(historicalCaseIdentity(sharedFixtureInput(entry)));
}

export function donorBindingSha256(manifest) {
  return hashJson(manifest.cases.map(({ id, component, state, donor }) => ({ id, component, state, donor })));
}

export function fixtureContractSha256(contract) {
  return hashJson(contract);
}

export function assertSafeSnapshotDirectory(directory, name = 'manifest snapshot directory') {
  if (typeof directory !== 'string' || !safeSnapshotDirectoryPattern.test(directory)) throw new Error(`${name} must be a content-addressed visual-migration snapshot directory`);
}

function contentAddressedDirectory(hashes, root, ids) {
  if (!Array.isArray(hashes) || hashes.length !== ids.length || hashes.some((value) => !/^sha256:[0-9a-f]{64}$/u.test(value))) throw new Error(`visual migration snapshot requires one SHA-256 identity for each pinned ${ids.length}-capture set`);
  const orderedSet = ids.map((id, index) => ({ id, sha256: hashes[index] }));
  const digest = sha256(Buffer.from(JSON.stringify(orderedSet), 'utf8')).slice('sha256:'.length);
  const directory = `${root}/sha256-${digest}`;
  assertSafeSnapshotDirectory(directory, 'visual migration snapshot directory');
  return directory;
}

export function snapshotDirectoryForHashes(hashes) {
  return contentAddressedDirectory(hashes, baselineRootDirectory, expectedCaptureInventory.map(([id]) => id));
}

export function donorDirectoryForHashes(hashes) {
  return contentAddressedDirectory(hashes, donorRootDirectory, expectedCaptureInventory.map(([id]) => id));
}

export async function readManifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
}

function assertRegion(region, name) {
  if (!region || typeof region !== 'object' || !['component', 'viewport'].includes(region.capture)) throw new Error(`${name}.region.capture must be component or viewport`);
  assertString(region.selector, `${name}.region.selector`);
  if (!Array.isArray(region.requiredSelectors) || region.requiredSelectors.length === 0 || region.requiredSelectors.some((selector) => typeof selector !== 'string' || selector.length === 0)) throw new Error(`${name}.region.requiredSelectors must list required semantic parts`);
}

function assertStyleFacts(styleFacts, name) {
  if (!styleFacts || typeof styleFacts !== 'object') throw new Error(`${name}.styleFacts must be an object`);
  assertString(styleFacts.selector, `${name}.styleFacts.selector`);
  if (styleFacts.pseudo !== undefined) assertString(styleFacts.pseudo, `${name}.styleFacts.pseudo`);
  if (!styleFacts.properties || typeof styleFacts.properties !== 'object' || Object.keys(styleFacts.properties).length === 0) throw new Error(`${name}.styleFacts.properties must contain at least one fact`);
  for (const [property, expected] of Object.entries(styleFacts.properties)) {
    assertString(property, `${name}.styleFacts property`);
    if (typeof expected === 'string') continue;
    if (!expected || typeof expected !== 'object' || typeof expected.value !== 'number') throw new Error(`${name}.styleFacts.${property} must be a string or numeric expectation`);
    if (expected.tolerance !== undefined && typeof expected.tolerance !== 'number') throw new Error(`${name}.styleFacts.${property}.tolerance must be numeric`);
  }
}

function assertDonor(donor, name) {
  if (!donor || typeof donor !== 'object') throw new Error(`${name}.donor must be an object`);
  assertString(donor.storyId, `${name}.donor.storyId`);
  assertString(donor.selector, `${name}.donor.selector`);
  assertString(donor.source, `${name}.donor.source`);
  assertString(donor.sourceSha256, `${name}.donor.sourceSha256`);
  assertString(donor.runtimeFixtureSha256, `${name}.donor.runtimeFixtureSha256`);
  if (!/^sha256:[0-9a-f]{64}$/u.test(donor.sourceSha256)) throw new Error(`${name}.donor.sourceSha256 must be a SHA-256 identity`);
  if (!/^sha256:[0-9a-f]{64}$/u.test(donor.runtimeFixtureSha256)) throw new Error(`${name}.donor.runtimeFixtureSha256 must be a SHA-256 identity`);
  assertStyleFacts(donor.styleFacts, `${name}.donor`);
  if (!donor.artifacts || typeof donor.artifacts !== 'object') throw new Error(`${name}.donor.artifacts must contain light and dark captures`);
  for (const mode of ['light', 'dark']) {
    const artifact = donor.artifacts[mode];
    if (!artifact || typeof artifact !== 'object') throw new Error(`${name}.donor.artifacts.${mode} is required`);
    assertString(artifact.path, `${name}.donor.artifacts.${mode}.path`);
    assertString(artifact.sha256, `${name}.donor.artifacts.${mode}.sha256`);
    if (!/^sha256:[0-9a-f]{64}$/u.test(artifact.sha256)) throw new Error(`${name}.donor.artifacts.${mode}.sha256 must be a SHA-256 identity`);
    assertStyleFacts(artifact.equivalentPart, `${name}.donor.artifacts.${mode}.equivalentPart`);
    if (artifact.semanticRegion) assertRegion(artifact.semanticRegion, `${name}.donor.artifacts.${mode}.semanticRegion`);
  }
}

function comparablePixels(result) {
  const { diffBytes, ...comparison } = result;
  return comparison;
}

function assertSamePixels(actual, expected, name) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${name} does not match the independently recomputed PNG comparison`);
}

async function readJsonInside(root, path, name) {
  assertString(path, `${name}.path`);
  const absolute = resolve(root, path);
  assertInside(root, absolute, `${name}.path must remain inside the repository`);
  await assertNoSymlinkEscape(root, absolute, name);
  return JSON.parse(await readFile(absolute, 'utf8'));
}

export function assertManifestIdentity(manifest) {
  if (manifest?.donor?.repository !== expectedDonorRepository || manifest?.donor?.commit !== expectedDonorCommit) throw new Error('visual migration donor identity does not match the pinned repository and commit');
  if (manifest?.storyId !== expectedStoryId || JSON.stringify(manifest?.storyQuery) !== JSON.stringify(expectedStoryQuery)) throw new Error('visual migration Storybook entry must use the pinned generated story and private fixture query');
  if (!Array.isArray(manifest?.cases) || manifest.cases.length !== expectedCaseInventory.length) throw new Error(`visual migration case inventory must contain the exact ${expectedCaseInventory.length} semantic cases`);
  for (const [index, [id, component, state]] of expectedCaseInventory.entries()) {
    const entry = manifest.cases[index];
    if (entry?.id !== id || entry.component !== component || entry.state !== state) throw new Error(`visual migration case inventory drift at position ${index + 1}: expected ${id}`);
  }
  const identity = donorBindingSha256(manifest);
  if (manifest.donorBindingSha256 !== identity) throw new Error('visual migration donor provenance identity does not match the ordered semantic bindings');
  if (identity !== expectedDonorBindingSha256) throw new Error('visual migration donor binding does not match the pinned donor artifact contract');
}

export function updateManifestIdentity(manifest, { baselineSha256, capture, muxuiCaptureRunnerSourceSha256 } = {}) {
  assertManifestIdentity(manifest);
  if (!Array.isArray(baselineSha256) || baselineSha256.length !== expectedCaptureInventory.length) throw new Error('visual migration update requires one SHA-256 identity for each light/dark capture');
  if (muxuiCaptureRunnerSourceSha256 !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(muxuiCaptureRunnerSourceSha256)) throw new Error('visual migration update requires a valid Mux UI capture runner source SHA-256');
  const next = structuredClone(manifest);
  if (capture) next.capture = { ...next.capture, ...structuredClone(capture) };
  if (muxuiCaptureRunnerSourceSha256 !== undefined) next.bootstrap.muxuiCaptureRunnerSourceSha256 = muxuiCaptureRunnerSourceSha256;
  for (const [index, [, caseId, , , mode]] of expectedCaptureInventory.entries()) {
    const entry = next.cases.find(({ id }) => id === caseId);
    entry.baseline[mode].sha256 = baselineSha256[index];
  }
  return next;
}

export function captureEnvironmentMismatches(actual, expected) {
  const mismatches = [];
  const fields = [
    ['browser.name', actual?.browser?.name, expected?.browser?.name],
    ['browser.version', actual?.browser?.version, expected?.browser?.version],
    ['browser.executableSha256', actual?.browser?.executableSha256, expected?.browser?.executableSha256],
    ['platform', actual?.platform, expected?.platform],
    ['architecture', actual?.architecture, expected?.architecture],
    ['osVersion', actual?.osVersion, expected?.osVersion],
    ['osBuildVersion', actual?.osBuildVersion, expected?.osBuildVersion],
  ];
  for (const [field, actualValue, expectedValue] of fields) if (actualValue !== expectedValue) mismatches.push(`${field} expected ${expectedValue}, got ${actualValue ?? 'unknown'}`);
  return mismatches;
}

export function assertCaptureEnvironment(actual, expected) {
  const mismatches = captureEnvironmentMismatches(actual, expected);
  if (mismatches.length > 0) throw new Error(`capture environment mismatch: ${mismatches.join('; ')}`);
}

async function assertSnapshotFileSet(snapshotPath, entries, pathForEntry = (entry) => entry.baseline) {
  const expectedNames = new Set(entries.map((entry) => pathForEntry(entry).split('/').pop()));
  const actualNames = await readdir(snapshotPath);
  if (actualNames.length !== expectedNames.size || actualNames.some((name) => !expectedNames.has(name))) throw new Error(`visual migration snapshot must contain exactly ${expectedNames.size} pinned PNG files`);
}

export async function validateSnapshotFiles(snapshotPath, entries, { root = appRoot } = {}) {
  await assertNoSymlinkEscape(root, snapshotPath, 'visual migration snapshot');
  await assertSnapshotFileSet(snapshotPath, entries, (entry) => entry.baseline ?? `${entry.id}.png`);
  for (const entry of entries) {
    assertSafeCaseId(entry.id, 'snapshot case ID');
    const filename = (entry.baseline ?? `${entry.id}.png`).split('/').pop();
    const filePath = resolve(snapshotPath, filename);
    await assertNoSymlinkEscape(root, filePath, `${entry.id} snapshot`);
    const bytes = await readFile(filePath);
    const expectedHash = entry.baselineSha256 ?? entry.sha256;
    if (expectedHash && sha256(bytes) !== expectedHash) throw new Error(`${entry.id} snapshot SHA-256 does not match its manifest identity`);
    const image = PNG.sync.read(bytes);
    if (image.width < 1 || image.height < 1) throw new Error(`${entry.id} snapshot has no pixels`);
  }
}

function assertTemporarySnapshotPath(root, path, name) {
  const relativePath = relative(resolve(root), resolve(path)).split(sep).join('/');
  if (!/^visual-migration\/baselines\/\.snapshot-[^/]+$/u.test(relativePath)) throw new Error(`${name} must be a contained temporary baseline directory`);
}

async function assertSnapshotMutationPaths(root, { snapshotPath, temporarySnapshotPath, activeSnapshotPath }) {
  const visualRoot = resolve(root, 'visual-migration');
  await assertNoSymlinkEscape(root, visualRoot, 'visual migration root');
  await assertNoSymlinkEscape(root, resolve(visualRoot, 'baselines'), 'visual migration baselines');
  await assertNoSymlinkEscape(root, resolve(visualRoot, 'donors'), 'visual migration donors');
  for (const [path, name] of [[snapshotPath, 'candidate baseline'], [activeSnapshotPath, 'active baseline']]) {
    assertSafeSnapshotDirectory(relative(resolve(root), resolve(path)).split(sep).join('/'), name);
    await assertNoSymlinkEscape(root, path, name);
  }
  if (temporarySnapshotPath !== undefined) {
    assertTemporarySnapshotPath(root, temporarySnapshotPath, 'temporary baseline');
    await assertNoSymlinkEscape(root, temporarySnapshotPath, 'temporary baseline');
  }
}

/** Validate snapshot destinations before a staging directory is created. */
export async function assertVisualMigrationSnapshotPaths({ root = appRoot, snapshotPath, activeSnapshotPath, temporarySnapshotPath } = {}) {
  await assertSnapshotMutationPaths(root, { snapshotPath, activeSnapshotPath, temporarySnapshotPath });
}

export async function materializeSnapshotDirectory({ snapshotPath, temporarySnapshotPath, activeSnapshotPath, entries, root = appRoot }) {
  const finalPath = resolve(snapshotPath);
  const activePath = resolve(activeSnapshotPath);
  await assertSnapshotMutationPaths(root, { snapshotPath: finalPath, temporarySnapshotPath, activeSnapshotPath: activePath });
  try {
    await validateSnapshotFiles(finalPath, entries, { root });
    return { reused: true };
  } catch (error) {
    if (error?.code !== 'ENOENT' || finalPath === activePath) throw error;
  }
  let moved = false;
  try {
    await assertSnapshotMutationPaths(root, { snapshotPath: finalPath, temporarySnapshotPath, activeSnapshotPath: activePath });
    await rename(temporarySnapshotPath, finalPath);
    moved = true;
    await validateSnapshotFiles(finalPath, entries, { root });
    return { reused: false };
  } catch (error) {
    if (moved) {
      await assertSnapshotMutationPaths(root, { snapshotPath: finalPath, temporarySnapshotPath, activeSnapshotPath: activePath });
      await rm(finalPath, { recursive: true, force: true });
    }
    throw error;
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function activationPaths(root) {
  const visualRoot = resolve(root, 'visual-migration');
  const manifest = resolve(root, 'visual-migration/manifest.json');
  const report = resolve(root, 'visual-migration/results/comparison.json');
  const muxuiCaptureProvenance = resolve(root, muxuiCaptureProvenancePath);
  return {
    marker: resolve(visualRoot, '.activation-v2.json'),
    manifest,
    report,
    manifestBackup: `${manifest}.previous`,
    reportBackup: `${report}.previous`,
    muxuiCaptureProvenance,
    muxuiCaptureProvenanceBackup: `${muxuiCaptureProvenance}.previous`,
  };
}

async function assertNoSymlinkEscape(root, candidate, name) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const child = relative(rootPath, candidatePath);
  if (!child || isAbsolute(child) || child.startsWith('..')) throw new Error(`${name} must remain inside the migration root`);
  const rootStat = await lstat(rootPath);
  if (rootStat.isSymbolicLink()) throw new Error('visual migration activation root must not be a symbolic link');
  let current = rootPath;
  for (const segment of child.split(sep)) {
    current = join(current, segment);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`${name} must not traverse a symbolic link`);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
}

async function assertActivationMutationPaths(root, paths, { previousSnapshot, nextSnapshot, temporaryManifest, temporaryReport, temporaryMuxui } = {}) {
  const visualRoot = resolve(root, 'visual-migration');
  await assertNoSymlinkEscape(root, visualRoot, 'visual migration root');
  await assertNoSymlinkEscape(root, resolve(visualRoot, 'results'), 'visual migration results');
  await assertNoSymlinkEscape(root, resolve(visualRoot, 'baselines'), 'visual migration baselines');
  await assertNoSymlinkEscape(root, resolve(visualRoot, 'donors'), 'visual migration donors');
  const files = [
    ['marker', paths.marker], ['manifest', paths.manifest], ['report', paths.report],
    ['manifestBackup', paths.manifestBackup], ['reportBackup', paths.reportBackup],
    ['muxuiCaptureProvenance', paths.muxuiCaptureProvenance],
    ['muxuiCaptureProvenanceBackup', paths.muxuiCaptureProvenanceBackup],
    ['temporaryManifest', temporaryManifest], ['temporaryReport', temporaryReport], ['temporaryMuxui', temporaryMuxui],
  ];
  for (const [name, path] of files) {
    if (path === undefined) continue;
    assertInside(resolve(root), resolve(path), `activation ${name} path must remain inside the repository`);
    await assertNoSymlinkEscape(root, path, `activation ${name}`);
  }
  for (const [path, name] of [[previousSnapshot, 'previous baseline'], [nextSnapshot, 'next baseline']]) {
    if (path === undefined) continue;
    assertSafeSnapshotDirectory(relative(resolve(root), resolve(path)).split(sep).join('/'), name);
    await assertNoSymlinkEscape(root, path, name);
  }
}

/** Validate all paths the activation transaction may touch before it mutates anything. */
export async function assertVisualMigrationActivationPaths(root = appRoot, { manifest, nextManifest } = {}) {
  const paths = activationPaths(root);
  const previousSnapshot = manifest?.baselineDirectory ? resolve(root, manifest.baselineDirectory) : undefined;
  const nextSnapshot = nextManifest?.baselineDirectory ? resolve(root, nextManifest.baselineDirectory) : undefined;
  const visualRoot = resolve(root, 'visual-migration');
  await assertActivationMutationPaths(root, paths, {
    previousSnapshot,
    nextSnapshot,
    temporaryManifest: resolve(visualRoot, `.manifest.activation-${process.pid}`),
    temporaryReport: resolve(visualRoot, `.comparison.activation-${process.pid}`),
    temporaryMuxui: resolve(visualRoot, `.muxui-capture-provenance.activation-${process.pid}`),
  });
  return paths;
}

function assertCanonicalActivationFile(value, expected, name) {
  if (typeof value !== 'string' || value !== expected) throw new Error(`activation marker ${name} must equal its canonical path`);
}

function assertCanonicalBaselineSnapshot(value, root, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`activation marker ${name} must be an absolute canonical path`);
  const candidate = resolve(value);
  if (candidate !== value) throw new Error(`activation marker ${name} must not contain traversal`);
  const relativePath = relative(resolve(root), candidate).split(sep).join('/');
  if (!safeBaselineDirectoryPattern.test(relativePath)) throw new Error(`activation marker ${name} must identify a contained content-addressed baseline`);
  return candidate;
}

/**
 * Parse and validate the recovery marker before any recovery mutation. The
 * marker stores absolute paths only as an integrity aid; every file path is
 * still derived from the trusted root and every snapshot identity is checked
 * against the canonical baseline directory shape.
 */
async function readValidatedActivationMarker(root) {
  const paths = activationPaths(root);
  await assertNoSymlinkEscape(root, paths.marker, 'activation marker');
  const marker = JSON.parse(await readFile(paths.marker, 'utf8'));
  if (!marker || typeof marker !== 'object' || Array.isArray(marker)) throw new Error('visual migration activation marker must be an object');
  const keys = Object.keys(marker).sort();
  if (keys.length !== activationMarkerKeys.length || keys.some((key, index) => key !== [...activationMarkerKeys].sort()[index])) {
    throw new Error('visual migration activation marker has an unexpected schema');
  }
  if (marker.schema !== activationSchema || !activationPhases.has(marker.phase)) throw new Error('visual migration activation marker has an unknown schema or phase');
  for (const [field, expected] of Object.entries(paths)) {
    if (field === 'marker') continue;
    assertCanonicalActivationFile(marker[field], expected, field);
    await assertNoSymlinkEscape(root, expected, `activation marker ${field}`);
  }
  const previousSnapshot = assertCanonicalBaselineSnapshot(marker.previousSnapshot, root, 'previousSnapshot');
  const nextSnapshot = assertCanonicalBaselineSnapshot(marker.nextSnapshot, root, 'nextSnapshot');
  await assertNoSymlinkEscape(root, previousSnapshot, 'activation marker previousSnapshot');
  await assertNoSymlinkEscape(root, nextSnapshot, 'activation marker nextSnapshot');
  return { marker, markerPath: paths.marker, paths: { ...paths, previousSnapshot, nextSnapshot } };
}

function activationMarkerFor(paths, phase) {
  return {
    schema: activationSchema,
    phase,
    manifest: paths.manifest,
    report: paths.report,
    manifestBackup: paths.manifestBackup,
    reportBackup: paths.reportBackup,
    muxuiCaptureProvenance: paths.muxuiCaptureProvenance,
    muxuiCaptureProvenanceBackup: paths.muxuiCaptureProvenanceBackup,
    previousSnapshot: paths.previousSnapshot,
    nextSnapshot: paths.nextSnapshot,
  };
}

async function syncPath(path) {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(path) {
  try {
    await syncPath(path);
  } catch (error) {
    if (!['EINVAL', 'EBADF', 'ENOTSUP'].includes(error?.code)) throw error;
  }
}

async function writeJsonAndSync(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await syncPath(temporaryPath);
  await rename(temporaryPath, path);
  await syncDirectory(dirname(path));
}

async function validatePng(root, path, expectedHash, name) {
  assertString(path, `${name}.path`);
  const absolute = resolve(root, path);
  assertInside(root, absolute, `${name}.path must remain inside the repository`);
  await assertNoSymlinkEscape(root, absolute, name);
  const bytes = await readFile(absolute);
  if (sha256(bytes) !== expectedHash) throw new Error(`${name} SHA-256 does not match its content`);
  const image = PNG.sync.read(bytes);
  if (image.width < 1 || image.height < 1) throw new Error(`${name} has no pixels`);
}

async function validateMuxuiCaptureProvenance(manifest, { root = appRoot, provenance: suppliedProvenance } = {}) {
  const identity = manifest.bootstrap?.muxuiCaptureProvenance;
  if (!identity || identity.path !== muxuiCaptureProvenancePath || !/^sha256:[0-9a-f]{64}$/u.test(identity.sha256)) {
    throw new Error('visual migration manifest must retain immutable Mux UI capture provenance');
  }
  const provenance = suppliedProvenance ?? await readJsonInside(root, identity.path, 'manifest.bootstrap.muxuiCaptureProvenance');
  if (jsonSha256(provenance) !== identity.sha256) throw new Error('visual migration Mux UI capture provenance SHA-256 does not match its content');
  const fixtureSource = await readFile(resolve(root, 'src/migration-visual.fixture.mjs'));
  const factorySource = await readFile(resolve(root, 'src/storybook-factory.mjs'));
  const fixtureMapSource = await readFile(resolve(root, fixtureMapSourcePath));
  const muxuiCaptureRunnerSource = await readFile(resolve(root, muxuiCaptureRunnerSourcePath));
  const fixtureSourceSha256 = sha256(fixtureSource);
  const factorySourceSha256 = sha256(factorySource);
  const fixtureMapSourceSha256 = sha256(fixtureMapSource);
  const muxuiCaptureRunnerSourceSha256 = sha256(muxuiCaptureRunnerSource);
  const generatedTree = await muxuiGeneratedTreeProvenance({ root: resolve(root, '../..') });
  if (provenance?.schema !== 'muxui-react-visual-migration-muxui-capture-v2'
    || provenance.directory !== manifest.baselineDirectory
    || provenance.caseCount !== migrationCases.length
    || provenance.captureCount !== expectedCaptureInventory.length
    || provenance.fixtureContractSha256 !== manifest.fixtureContract.caseSha256
    || provenance.muxuiFixtureSourceSha256 !== fixtureSourceSha256
    || provenance.muxuiFactorySourceSha256 !== factorySourceSha256
    || provenance.muxuiFixtureMapSourceSha256 !== fixtureMapSourceSha256
    || provenance.muxuiCaptureRunnerSourceSha256 !== muxuiCaptureRunnerSourceSha256
    || JSON.stringify(provenance.muxuiGeneratedTree) !== JSON.stringify(generatedTree)
    || JSON.stringify(provenance.settling) !== JSON.stringify(expectedSettling)
    || JSON.stringify(provenance.captureEnvironment) !== JSON.stringify(manifest.capture)
    || !Array.isArray(provenance.captures)
    || provenance.captures.length !== expectedCaptureInventory.length) {
    throw new Error('visual migration Mux UI capture provenance does not match the canonical contract');
  }
  const captures = new Map(provenance.captures.map((capture) => [capture.captureId, capture]));
  if (captures.size !== expectedCaptureInventory.length) throw new Error('visual migration Mux UI capture provenance must contain each capture exactly once');
  for (const [captureId, caseId, component, state, mode] of expectedCaptureInventory) {
    const entry = manifest.cases.find(({ id }) => id === caseId);
    const capture = captures.get(captureId);
    const expectedStyleFacts = entry.styleFactsByMode?.[mode] ?? entry.styleFacts;
    const expectedEquivalentPart = entry.equivalentPartFacts.muxuiByMode[mode];
    if (!capture
      || capture.caseId !== caseId
      || capture.component !== component
      || capture.state !== state
      || capture.mode !== mode
      || capture.selector !== entry.selector
      || JSON.stringify(capture.action) !== JSON.stringify(entry.action)
      || JSON.stringify(capture.region) !== JSON.stringify(entry.region)
      || JSON.stringify(capture.frame) !== JSON.stringify(entry.fixture.frame)
      || capture.fixtureContractSha256 !== entry.fixtureContractSha256
      || capture.runtimeFixtureSha256 !== entry.runtimeFixtureSha256
      || JSON.stringify(canonicalize(capture.fixture)) !== JSON.stringify(canonicalize(entry.fixture))
      || capture.baseline?.path !== entry.baseline[mode].path
      || capture.baseline?.sha256 !== entry.baseline[mode].sha256
      || capture.sha256 !== entry.baseline[mode].sha256
      || JSON.stringify(capture.captureEnvironment) !== JSON.stringify(manifest.capture)
      || JSON.stringify(capture.styleFacts) !== JSON.stringify(expectedStyleFacts)
      || JSON.stringify(capture.equivalentPart) !== JSON.stringify(expectedEquivalentPart)) {
      throw new Error(`${captureId} Mux UI capture provenance must bind the canonical fixture, action, selectors, styles, environment, and baseline PNG`);
    }
    assertStyleFacts(capture.styleFacts, `${captureId}.styleFacts`);
    assertStyleFacts(capture.equivalentPart, `${captureId}.equivalentPart`);
  }
  return provenance;
}

export async function validateManifest(manifest, { root = appRoot, allowMissingMuxuiCaptureProvenance = false, allowMuxuiCaptureRunnerSourceDrift = false, allowMuxuiSettlingDrift = false, muxuiCaptureProvenance: suppliedMuxuiCaptureProvenance } = {}) {
  if ((allowMuxuiCaptureRunnerSourceDrift || allowMuxuiSettlingDrift) && !allowMissingMuxuiCaptureProvenance) throw new Error('Mux UI capture runner or settling drift is available only during update-only validation');
  validateTaleStyleInventory();
  if (manifest?.schema !== 'muxui-react-visual-migration-manifest-v2' || manifest.version !== 2) throw new Error('visual migration manifest has an unknown schema or version');
  assertManifestIdentity(manifest);
  if (!manifest.donor || typeof manifest.donor !== 'object' || !/^https:\/\//u.test(manifest.donor.repository) || !/^[0-9a-f]{40}$/u.test(manifest.donor.commit)) throw new Error('manifest.donor must pin an HTTPS repository and a full commit');
  if (!manifest.fixtureContract || manifest.fixtureContract.frame?.viewport?.width !== migrationFrame.viewport.width || manifest.fixtureContract.frame?.viewport?.height !== migrationFrame.viewport.height) throw new Error('manifest.fixtureContract must pin the shared semantic frame');
  const fixtureContractIdentity = hashJson(migrationCases.map(({ id, component, state, fixture, action, region }) => ({
    id,
    component,
    state,
    fixture,
    action: historicalCaseIdentity(action),
    region: historicalCaseIdentity(region),
  })));
  if (manifest.fixtureContract.caseSha256 !== fixtureContractIdentity) throw new Error('manifest.fixtureContract must retain the canonical case fixture/action/region identity');
  if (manifest.comparisonResult !== 'visual-migration/results/comparison.json') throw new Error('manifest.comparisonResult must retain the sealed one-time comparison report');
  if (!manifest.bootstrap || manifest.bootstrap.adapterSource !== donorAdapterSourcePath || !/^sha256:[0-9a-f]{64}$/u.test(manifest.bootstrap.adapterSourceSha256)) throw new Error('visual migration manifest must retain the reviewable donor adapter source identity');
  const adapterSource = await readFile(resolve(root, donorAdapterSourcePath));
  if (sha256(adapterSource) !== manifest.bootstrap.adapterSourceSha256) throw new Error('visual migration donor adapter source SHA-256 does not match its content');
  for (const [field, sourcePath] of [['entrySourceSha256', donorEntrySourcePath], ['renderPlanSourceSha256', donorRenderPlanSourcePath], ['captureSourceSha256', 'visual-migration/bootstrap/capture.mjs']]) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.bootstrap[field])) throw new Error(`visual migration manifest must retain the ${field} identity`);
    const source = await readFile(resolve(root, sourcePath));
    if (sha256(source) !== manifest.bootstrap[field]) throw new Error(`visual migration ${field} does not match its retained source`);
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(manifest.bootstrap.muxuiCaptureRunnerSourceSha256)) throw new Error('visual migration manifest must retain the Mux UI capture runner identity');
  const muxuiCaptureRunnerSource = await readFile(resolve(root, muxuiCaptureRunnerSourcePath));
  if (!allowMuxuiCaptureRunnerSourceDrift && sha256(muxuiCaptureRunnerSource) !== manifest.bootstrap.muxuiCaptureRunnerSourceSha256) throw new Error('visual migration Mux UI capture runner source SHA-256 does not match its content');
  if (!manifest.bootstrap.tale || manifest.bootstrap.tale.commit !== expectedDonorCommit || !/^[0-9a-f]{40}$/u.test(manifest.bootstrap.tale.tree) || !/^sha256:[0-9a-f]{64}$/u.test(manifest.bootstrap.tale.sourceSha256) || manifest.bootstrap.tale.styleInventoryPath !== taleStyleInventoryPath || manifest.bootstrap.tale.styleInventorySha256 !== taleStyleInventorySha256) throw new Error('visual migration manifest must retain the pinned Tale source and complete style-inventory identity');
  if (!manifest.bootstrap.captureProvenance || manifest.bootstrap.captureProvenance.path !== 'visual-migration/results/donor-capture-provenance.json' || !/^sha256:[0-9a-f]{64}$/u.test(manifest.bootstrap.captureProvenance.sha256)) throw new Error('visual migration manifest must retain immutable donor capture provenance');
  const provenanceAbsolutePath = resolve(root, manifest.bootstrap.captureProvenance.path);
  await assertNoSymlinkEscape(root, provenanceAbsolutePath, 'manifest.bootstrap.captureProvenance');
  const provenanceBytes = await readFile(provenanceAbsolutePath);
  if (sha256(provenanceBytes) !== manifest.bootstrap.captureProvenance.sha256) throw new Error('visual migration donor capture provenance SHA-256 does not match its content');
  const provenance = JSON.parse(provenanceBytes);
  const fixtureMapSource = await readFile(resolve(root, fixtureMapSourcePath));
  const fixtureMapSourceSha256 = sha256(fixtureMapSource);
  if (provenance?.schema !== 'core-ui-react-visual-migration-donor-capture-v2' || provenance.donor?.commit !== expectedDonorCommit || provenance.directory !== manifest.donorArtifactDirectory || provenance.caseCount !== migrationCases.length || provenance.captureCount !== expectedCaptureInventory.length || provenance.fixtureContractSha256 !== manifest.fixtureContract.caseSha256 || provenance.adapterSourceSha256 !== manifest.bootstrap.adapterSourceSha256 || provenance.entrySourceSha256 !== manifest.bootstrap.entrySourceSha256 || provenance.renderPlanSourceSha256 !== manifest.bootstrap.renderPlanSourceSha256 || provenance.captureSourceSha256 !== manifest.bootstrap.captureSourceSha256 || provenance.fixtureMapSourceSha256 !== fixtureMapSourceSha256 || provenance.fixtureMapSourceSha256 !== manifest.bootstrap.fixtureMapSourceSha256 || provenance.tale?.tree !== manifest.bootstrap.tale?.tree || provenance.tale?.sourceSha256 !== manifest.bootstrap.tale?.sourceSha256 || JSON.stringify(provenance.settling) !== JSON.stringify(expectedDonorSettling) || !Array.isArray(provenance.captures) || provenance.captures.length !== expectedCaptureInventory.length) throw new Error('visual migration donor capture provenance does not match the canonical contract');
  const provenanceCaptures = new Map(provenance.captures.map((capture) => [capture.captureId, capture]));
  for (const [captureId, caseId, , , mode] of expectedCaptureInventory) {
    const capture = provenanceCaptures.get(captureId);
    const entry = manifest.cases.find(({ id }) => id === caseId);
    if (!capture || capture.caseId !== caseId || capture.mode !== mode || capture.sha256 !== entry.donor.artifacts[mode].sha256 || capture.fixtureContractSha256 !== entry.fixtureContractSha256 || capture.runtimeFixtureSha256 !== entry.runtimeFixtureSha256 || capture.donorSource !== donorEntrySourcePath || JSON.stringify(capture.semanticRegion) !== JSON.stringify(entry.donor.artifacts[mode].semanticRegion) || JSON.stringify(capture.equivalentPart) !== JSON.stringify(entry.donor.artifacts[mode].equivalentPart)) throw new Error(`${captureId} donor provenance must bind the canonical fixture, donor source, semantic parts, runtimeFixtureSha256, and emitted PNG`);
  }
  if (!manifest.capture || manifest.capture.viewport?.width !== 1000 || manifest.capture.viewport?.height !== 700 || manifest.capture.deviceScaleFactor !== 1 || JSON.stringify(manifest.capture.modes) !== JSON.stringify(['light', 'dark']) || manifest.capture.reducedMotion !== true || (!allowMuxuiSettlingDrift && JSON.stringify(manifest.capture.settling) !== JSON.stringify(expectedSettling))) throw new Error('manifest.capture must pin the shared 1000x700 light/dark reduced-motion capture and settling contract');
  if (JSON.stringify(manifest.capture.clock) !== JSON.stringify(expectedCaptureClock)) throw new Error('manifest.capture must pin the deterministic donor-date browser clock');
  if (!manifest.capture.background || manifest.capture.background.light !== '#ffffff' || manifest.capture.background.dark !== '#000000') throw new Error('manifest.capture must pin light/dark frame backgrounds');
  if (!manifest.capture.browser || typeof manifest.capture.browser.name !== 'string' || typeof manifest.capture.browser.version !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(manifest.capture.browser.executableSha256) || manifest.capture.platform !== 'darwin' || manifest.capture.architecture !== 'arm64' || typeof manifest.capture.osVersion !== 'string' || typeof manifest.capture.osBuildVersion !== 'string') throw new Error('manifest.capture must record the pinned browser and macOS environment');
  assertSafeSnapshotDirectory(manifest.baselineDirectory, 'manifest.baselineDirectory');
  assertSafeSnapshotDirectory(manifest.donorArtifactDirectory, 'manifest.donorArtifactDirectory');
  if (!manifest.thresholds || manifest.thresholds.maxDiffPixelRatio !== expectedThresholds.maxDiffPixelRatio || manifest.thresholds.pixelThreshold !== expectedThresholds.pixelThreshold) throw new Error('manifest.thresholds must retain the pinned fail-closed pixel thresholds');
  if (!manifest.coverage || manifest.coverage.caseCount !== migrationCases.length || manifest.coverage.comparisonCount !== expectedCaptureInventory.length || manifest.coverage.applicableFamilyCount !== 51 || JSON.stringify(manifest.coverage.noApplicableDonor) !== JSON.stringify(noApplicableDonorFamilies) || !Array.isArray(manifest.coverage.families) || manifest.coverage.families.length !== 51 || manifest.coverage.canonicalStateCount !== expectedDescriptorStateCount || manifest.coverage.compatibilityStateCount !== expectedCompatibilityStateCount || manifest.coverage.supplementalStateCount !== expectedSupplementalStateCount || manifest.coverage.stateCoverageCount !== expectedStateCoverage.length || JSON.stringify(manifest.coverage.stateDispositions) !== JSON.stringify(expectedStateDispositionCounts) || JSON.stringify(manifest.coverage.stateCoverage) !== JSON.stringify(expectedStateCoverage)) throw new Error('visual migration coverage metadata must describe every canonical state, explicit disposition, and all 51 applicable families');
  const ids = new Set();
  const baselineEntries = [];
  const canonicalCases = new Map(migrationCases.map((entry) => [entry.id, entry]));
  for (const [index, entry] of manifest.cases.entries()) {
    const name = `manifest.cases[${index}]`;
    const canonicalCase = canonicalCases.get(entry.id);
    assertSafeCaseId(entry.id, `${name}.id`);
    if (ids.has(entry.id)) throw new Error(`duplicate visual migration case ${entry.id}`);
    ids.add(entry.id);
    if (entry.component !== expectedCaseInventory[index][1] || entry.state !== expectedCaseInventory[index][2] || !canonicalCase) throw new Error(`${name} does not match the canonical case inventory`);
    assertString(entry.selector, `${name}.selector`);
    if (entry.selector !== canonicalCase.selector) throw new Error(`${name}.selector must equal the canonical case selector`);
    if (JSON.stringify(canonicalize(entry.fixture)) !== JSON.stringify(canonicalize(canonicalCase.fixture))) throw new Error(`${name}.fixture must equal the canonical shared fixture contract`);
    if (JSON.stringify(entry.action) !== JSON.stringify(canonicalCase.action)) throw new Error(`${name}.action must equal the canonical matched state action`);
    assertRegion(entry.region, name);
    if (JSON.stringify(canonicalize(entry.region)) !== JSON.stringify(canonicalize(canonicalCase.region))) throw new Error(`${name}.region must equal the canonical semantic-region contract`);
    if (!entry.fixture || !entry.fixtureContractSha256 || fixtureContractSha256(entry.fixture) !== entry.fixtureContractSha256) throw new Error(`${name}.fixture does not match its immutable fixture-contract identity`);
    if (entry.runtimeFixtureSha256 !== historicalRuntimeFixtureSha256(entry)) throw new Error(`${name}.runtimeFixtureSha256 must equal the shared adapter fixture input`);
    assertStyleFacts(entry.styleFacts, name);
    if (!entry.styleFactsByMode || typeof entry.styleFactsByMode !== 'object') {
      if (!allowMissingMuxuiCaptureProvenance) throw new Error(`${name}.styleFactsByMode must retain runtime MuxUI frame facts for both modes`);
    } else {
      for (const mode of ['light', 'dark']) assertStyleFacts(entry.styleFactsByMode[mode], `${name}.styleFactsByMode.${mode}`);
    }
    if (!entry.equivalentPartFacts || typeof entry.equivalentPartFacts !== 'object') throw new Error(`${name}.equivalentPartFacts must record computed facts for equivalent parts`);
    assertStyleFacts(entry.equivalentPartFacts.donor, `${name}.equivalentPartFacts.donor`);
    assertStyleFacts(entry.equivalentPartFacts.muxui, `${name}.equivalentPartFacts.muxui`);
    if (!entry.equivalentPartFacts.muxuiByMode || typeof entry.equivalentPartFacts.muxuiByMode !== 'object') throw new Error(`${name}.equivalentPartFacts.muxuiByMode must retain runtime MuxUI facts for both modes`);
    for (const mode of ['light', 'dark']) {
      assertStyleFacts(entry.equivalentPartFacts.muxuiByMode[mode], `${name}.equivalentPartFacts.muxuiByMode.${mode}`);
      if (entry.equivalentPartFacts.muxuiByMode[mode].selector !== entry.equivalentPartFacts.muxui.selector || JSON.stringify(entry.equivalentPartFacts.muxuiByMode[mode].properties) !== JSON.stringify(entry.equivalentPartFacts.muxui.properties)) throw new Error(`${name}.equivalentPartFacts.muxuiByMode.${mode} must equal its sealed MuxUI mapped-part facts`);
    }
    const [canonicalMuxuiPartSelector, canonicalDonorPartSelector] = equivalentPartSelectorsFor(entry.component, entry.state);
    if (entry.equivalentPartFacts.muxui.selector !== canonicalMuxuiPartSelector || entry.equivalentPartFacts.donor.selector !== canonicalDonorPartSelector) throw new Error(`${name}.equivalentPartFacts selectors must equal the canonical mapped semantic parts`);
    assertDonor(entry.donor, name);
    if (entry.donor.source !== donorEntrySourcePath) throw new Error(`${name}.donor.source must equal the retained donor entry source`);
    if (entry.donor.sourceSha256 !== manifest.bootstrap.entrySourceSha256) throw new Error(`${name}.donor.sourceSha256 must bind the retained donor entry source`);
    if (entry.donor.runtimeFixtureSha256 !== entry.runtimeFixtureSha256) throw new Error(`${name}.donor.runtimeFixtureSha256 must equal the shared adapter fixture input`);
    if (!Array.isArray(entry.adaptations) || entry.adaptations.length === 0 || entry.adaptations.some((adaptation) => !adaptation.part || !adaptation.reason || adaptation.excludedFromPixelRegion === true)) throw new Error(`${name}.adaptations must explain family/case-specific anatomy without excluding component pixels`);
    for (const mode of ['light', 'dark']) {
      const baseline = entry.baseline?.[mode];
      if (!baseline || !baseline.path || !/^sha256:[0-9a-f]{64}$/u.test(baseline.sha256)) throw new Error(`${name}.baseline.${mode} must include a content identity`);
      const expectedPath = `${manifest.baselineDirectory}/${entry.id}--${mode}.png`;
      if (baseline.path !== expectedPath) throw new Error(`${name}.baseline.${mode}.path must match its pinned capture file`);
      await validatePng(root, baseline.path, baseline.sha256, `${name}.baseline.${mode}`);
      baselineEntries.push({ id: `${entry.id}--${mode}`, baseline: baseline.path, baselineSha256: baseline.sha256 });
      const donorArtifact = entry.donor.artifacts[mode];
      const expectedDonorPath = `${manifest.donorArtifactDirectory}/${entry.id}--${mode}.png`;
      if (donorArtifact.path !== expectedDonorPath) throw new Error(`${name}.donor.artifacts.${mode}.path must match its pinned capture file`);
      await validatePng(root, donorArtifact.path, donorArtifact.sha256, `${name}.donor.artifacts.${mode}`);
      if (donorArtifact.equivalentPart.selector !== entry.equivalentPartFacts.donor.selector || JSON.stringify(donorArtifact.equivalentPart.properties) !== JSON.stringify(entry.equivalentPartFacts.donor.properties)) throw new Error(`${name}.donor.artifacts.${mode}.equivalentPart must equal the runtime Tale mapped-part facts`);
    }
  }
  const baselineRoot = resolve(root, manifest.baselineDirectory);
  await assertSnapshotFileSet(baselineRoot, baselineEntries);
  if (manifest.baselineDirectory !== snapshotDirectoryForHashes(baselineEntries.map(({ baselineSha256 }) => baselineSha256))) throw new Error('manifest.baselineDirectory must match the ordered Mux UI capture content hash');
  const donorRoot = resolve(root, manifest.donorArtifactDirectory);
  const donorEntries = expectedCaptureInventory.map(([captureId, caseId, , , mode]) => ({ id: captureId, baseline: `${manifest.donorArtifactDirectory}/${captureId}.png`, baselineSha256: manifest.cases.find(({ id }) => id === caseId).donor.artifacts[mode].sha256 }));
  await assertSnapshotFileSet(donorRoot, donorEntries);
  if (manifest.donorArtifactDirectory !== donorDirectoryForHashes(donorEntries.map(({ baselineSha256 }) => baselineSha256))) throw new Error('manifest.donorArtifactDirectory must match the ordered donor capture content hash');
  if (!allowMissingMuxuiCaptureProvenance) await validateMuxuiCaptureProvenance(manifest, { root, provenance: suppliedMuxuiCaptureProvenance });
  return manifest;
}

/**
 * Recompute the sealed donor/MuxUI comparison from every PNG pair. The report
 * is evidence, not authority: a substituted report or artifact cannot make a
 * mismatched pair pass.
 */
export async function validateSealedComparison(manifest, { root = appRoot, report: suppliedReport, muxuiCaptureProvenance: suppliedMuxuiCaptureProvenance } = {}) {
  const report = suppliedReport ?? await readJsonInside(root, manifest.comparisonResult, 'manifest.comparisonResult');
  if (report?.schema !== 'muxui-react-visual-migration-comparison-v1') throw new Error('sealed visual migration comparison has an unknown schema');
  if (JSON.stringify(report.donor) !== JSON.stringify(manifest.donor) || report.fixture?.caseSha256 !== manifest.fixtureContract.caseSha256 || JSON.stringify(report.capture) !== JSON.stringify(manifest.capture) || JSON.stringify(report.thresholds) !== JSON.stringify(manifest.thresholds) || JSON.stringify(report.donorCaptureProvenance) !== JSON.stringify(manifest.bootstrap.captureProvenance) || JSON.stringify(report.muxuiCaptureProvenance) !== JSON.stringify(manifest.bootstrap.muxuiCaptureProvenance)) throw new Error('sealed visual migration comparison identity does not match the manifest');
  const muxuiCaptureProvenance = await validateMuxuiCaptureProvenance(manifest, { root, provenance: suppliedMuxuiCaptureProvenance });
  const muxuiCaptures = new Map(muxuiCaptureProvenance.captures.map((capture) => [capture.captureId, capture]));
  const expectedEntries = new Map(manifest.cases.map((entry) => [entry.id, entry]));
  const expectedPairs = expectedCaptureInventory.map(([captureId, caseId, component, state, mode]) => ({ captureId, caseId, component, state, mode }));
  if (!Array.isArray(report.comparisons) || report.comparisons.length !== expectedPairs.length) throw new Error(`sealed visual migration comparison must contain exactly ${expectedPairs.length} PNG pairs`);
  let pass = 0;
  let failed = 0;
  for (const [index, expected] of expectedPairs.entries()) {
    const result = report.comparisons[index];
    if (!result || result.id !== expected.caseId || result.component !== expected.component || result.state !== expected.state || result.mode !== expected.mode) throw new Error(`sealed comparison inventory drift at pair ${index + 1}`);
    const entry = expectedEntries.get(expected.caseId);
    const donorArtifact = entry.donor.artifacts[expected.mode];
    const muxuiArtifact = entry.baseline[expected.mode];
    const donorBytes = await readFile(resolve(root, donorArtifact.path));
    const muxuiBytes = await readFile(resolve(root, muxuiArtifact.path));
    const donorHash = sha256(donorBytes);
    const muxuiHash = sha256(muxuiBytes);
    if (donorHash !== donorArtifact.sha256 || muxuiHash !== muxuiArtifact.sha256) throw new Error(`${expected.captureId} artifact hash changed after manifest validation`);
    if (result.artifacts?.donor?.path !== donorArtifact.path || result.artifacts?.donor?.sha256 !== donorHash || result.artifacts?.muxui?.path !== muxuiArtifact.path || result.artifacts?.muxui?.sha256 !== muxuiHash) throw new Error(`${expected.captureId} report artifact provenance does not match the independently hashed PNGs`);
    const pixels = comparePngs(donorBytes, muxuiBytes, manifest.thresholds);
    assertSamePixels(result.pixelComparison, comparablePixels(pixels), `${expected.captureId}.pixelComparison`);
    if (result.componentRegion?.status !== 'compared' || result.componentRegion.pass !== pixels.pass || JSON.stringify(result.componentRegion.dimensions) !== JSON.stringify(pixels.dimensions) || Object.hasOwn(result.componentRegion, 'excludedFromPixelRegion')) throw new Error(`${expected.captureId}.componentRegion must compare the complete semantic region`);
    assertSamePixels(result.componentRegion.pixelComparison, comparablePixels(pixels), `${expected.captureId}.componentRegion.pixelComparison`);
    if (result.normalizedFrameComparison?.diagnosticOnly !== true) throw new Error(`${expected.captureId}.normalizedFrameComparison must remain diagnostic-only`);
    // `styleFacts` describes the normalized frame itself and is independently
    // validated as a required manifest fact. It is not the equivalent-part
    // selector, so compare only the mapped parts here.
    const frameFacts = entry.styleFactsByMode?.[expected.mode] ?? entry.styleFacts;
    const frameMismatches = compareStyleFacts(muxuiCaptures.get(expected.captureId).styleFacts.properties, frameFacts);
    const equivalentMismatches = compareStyleFacts(entry.equivalentPartFacts.muxui.properties, { properties: entry.equivalentPartFacts.donor.properties });
    const expectedPass = pixels.pass && frameMismatches.length === 0 && equivalentMismatches.length === 0;
    if (JSON.stringify(result.styleComparison?.frame) !== JSON.stringify({ pass: frameMismatches.length === 0, selector: frameFacts.selector, properties: frameFacts.properties }) || JSON.stringify(result.styleComparison?.equivalentPart?.donor) !== JSON.stringify(entry.equivalentPartFacts.donor) || JSON.stringify(result.styleComparison?.equivalentPart?.muxui) !== JSON.stringify(entry.equivalentPartFacts.muxui) || JSON.stringify(result.styleComparison?.equivalentPart?.runtimeDonor) !== JSON.stringify(donorArtifact.equivalentPart) || JSON.stringify(result.styleComparison?.equivalentPart?.runtimeMuxui) !== JSON.stringify(entry.equivalentPartFacts.muxuiByMode[expected.mode]) || result.styleComparison?.frame?.pass !== (frameMismatches.length === 0) || result.styleComparison?.equivalentPart?.pass !== (equivalentMismatches.length === 0) || result.pass !== expectedPass) throw new Error(`${expected.captureId} report status or mapped style facts do not match independently recomputed pixels/styles (frame=${JSON.stringify(result.styleComparison?.frame)}, expectedFrame=${JSON.stringify({ pass: frameMismatches.length === 0, selector: frameFacts.selector, properties: frameFacts.properties })}, frameMismatches=${JSON.stringify(frameMismatches)}, equivalentMismatches=${JSON.stringify(equivalentMismatches)}, reportPass=${result.pass}, expectedPass=${expectedPass})`);
    if (expectedPass) pass += 1;
    else failed += 1;
  }
  const expectedCounts = { families: 51, noApplicableDonor: 2, semanticCases: migrationCases.length, comparisons: expectedPairs.length, pass, failed };
  if (JSON.stringify(report.counts) !== JSON.stringify(expectedCounts)) throw new Error('sealed visual migration comparison aggregate counts do not match independently recomputed pairs');
  if (report.coverage?.applicableFamilyCount !== 51 || report.coverage?.caseCount !== migrationCases.length || report.coverage?.comparisonCount !== expectedPairs.length || JSON.stringify(report.coverage?.noApplicableDonor) !== JSON.stringify(noApplicableDonorFamilies) || report.coverage?.canonicalStateCount !== expectedDescriptorStateCount || report.coverage?.compatibilityStateCount !== expectedCompatibilityStateCount || report.coverage?.supplementalStateCount !== expectedSupplementalStateCount || report.coverage?.stateCoverageCount !== expectedStateCoverage.length || JSON.stringify(report.coverage?.stateDispositions) !== JSON.stringify(expectedStateDispositionCounts) || JSON.stringify(report.coverage?.stateCoverage) !== JSON.stringify(expectedStateCoverage)) throw new Error('sealed visual migration comparison coverage is not canonical');
  const expectedStatus = failed === 0 ? 'passed' : 'genuine-component-region-mismatches-require-review';
  if (report.status !== expectedStatus) throw new Error(`sealed visual migration comparison status must be ${expectedStatus}`);
  return { report, counts: expectedCounts };
}

function numericPixels(value) {
  const match = String(value).trim().match(/^(-?\d+(?:\.\d+)?)px$/u);
  return match ? Number(match[1]) : undefined;
}

export function compareStyleFacts(actual, expected) {
  const mismatches = [];
  for (const [property, expectation] of Object.entries(expected.properties)) {
    const value = actual[property];
    if (typeof expectation === 'string') {
      if (value !== expectation) mismatches.push(`${property}: expected ${expectation}, got ${value}`);
      continue;
    }
    const numeric = numericPixels(value);
    const tolerance = expectation.tolerance ?? 0.01;
    if (numeric === undefined || Math.abs(numeric - expectation.value) > tolerance) mismatches.push(`${property}: expected ${expectation.value}±${tolerance}px, got ${value}`);
  }
  return mismatches;
}

export function comparePngs(expectedBytes, actualBytes, { maxDiffPixelRatio = expectedThresholds.maxDiffPixelRatio, pixelThreshold = expectedThresholds.pixelThreshold } = {}) {
  const expected = PNG.sync.read(expectedBytes);
  const actual = PNG.sync.read(actualBytes);
  if (expected.width !== actual.width || expected.height !== actual.height) return { pass: false, mismatchedPixels: expected.width * expected.height, diffPixelRatio: 1, dimensions: { expected: [expected.width, expected.height], actual: [actual.width, actual.height] } };
  const diff = new PNG({ width: expected.width, height: expected.height });
  const mismatchedPixels = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: pixelThreshold });
  const totalPixels = expected.width * expected.height;
  const diffPixelRatio = totalPixels === 0 ? 1 : mismatchedPixels / totalPixels;
  return { pass: diffPixelRatio <= maxDiffPixelRatio, mismatchedPixels, diffPixelRatio, dimensions: { expected: [expected.width, expected.height], actual: [actual.width, actual.height] }, diffBytes: PNG.sync.write(diff) };
}

function normalizedFrameProbe(donorBytes, muxuiBytes, thresholds) {
  const donor = PNG.sync.read(donorBytes);
  const muxui = PNG.sync.read(muxuiBytes);
  if (donor.width < 12 || donor.height < 12 || muxui.width < 12 || muxui.height < 12) return { pass: false, mismatchedPixels: 1, diffPixelRatio: 1, dimensions: [12, 12], region: 'normalized-frame-background', diagnosticOnly: true };
  const crop = (image) => {
    const frame = new PNG({ width: 12, height: 12 });
    PNG.bitblt(image, frame, 0, 0, 12, 12, 0, 0);
    return PNG.sync.write(frame);
  };
  const probe = comparePngs(crop(donor), crop(muxui), thresholds);
  const { diffBytes, dimensions, ...result } = probe;
  return { ...result, dimensions: [12, 12], region: 'normalized-frame-background', diagnosticOnly: true };
}

/** Build the immutable one-time report from sealed donor/MuxUI artifacts. */
export async function buildComparisonReport(manifest, { root = appRoot } = {}) {
  const comparisons = [];
  const adaptations = [];
  const grouped = new Map();
  for (const [captureId, caseId, component, state, mode] of expectedCaptureInventory) {
    const entry = manifest.cases.find(({ id }) => id === caseId);
    const donor = entry.donor.artifacts[mode];
    const muxui = entry.baseline[mode];
    const donorBytes = await readFile(resolve(root, donor.path));
    const muxuiBytes = await readFile(resolve(root, muxui.path));
    const pixelComparison = comparablePixels(comparePngs(donorBytes, muxuiBytes, manifest.thresholds));
    const frameFacts = entry.styleFactsByMode?.[mode] ?? entry.styleFacts;
    const frame = { pass: true, selector: frameFacts.selector, properties: frameFacts.properties };
    const equivalentPart = {
      pass: compareStyleFacts(entry.equivalentPartFacts.donor.properties, { properties: entry.equivalentPartFacts.muxui.properties }).length === 0,
      status: 'supplemental',
      donor: entry.equivalentPartFacts.donor,
      muxui: entry.equivalentPartFacts.muxui,
      runtimeDonor: donor.equivalentPart,
      runtimeMuxui: entry.equivalentPartFacts.muxuiByMode?.[mode] ?? entry.equivalentPartFacts.muxui,
      reason: entry.equivalentPartFacts.adaptation,
    };
    const pass = pixelComparison.pass && frame.pass && equivalentPart.pass;
    comparisons.push({
      id: caseId,
      component,
      state,
      mode,
      pass,
      pixelComparison,
      componentRegion: {
        status: 'compared',
        pass: pixelComparison.pass,
        dimensions: pixelComparison.dimensions,
        pixelComparison,
        reason: entry.adaptations.map(({ reason }) => reason).join(' '),
      },
      styleComparison: { frame, equivalentPart },
      artifacts: { donor, muxui },
      normalizedFrameComparison: normalizedFrameProbe(donorBytes, muxuiBytes, manifest.thresholds),
    });
    for (const adaptation of entry.adaptations) adaptations.push({ id: caseId, component, state, part: adaptation.part, reason: adaptation.reason });
    const group = grouped.get(component) ?? { component, comparisons: 0, failed: 0, dimensionMismatches: 0, maxDiffPixelRatio: 0 };
    group.comparisons += 1;
    if (!pass) group.failed += 1;
    if (JSON.stringify(pixelComparison.dimensions.expected) !== JSON.stringify(pixelComparison.dimensions.actual)) group.dimensionMismatches += 1;
    group.maxDiffPixelRatio = Math.max(group.maxDiffPixelRatio, pixelComparison.diffPixelRatio);
    grouped.set(component, group);
  }
  const pass = comparisons.filter(({ pass: resultPass }) => resultPass).length;
  const failed = comparisons.length - pass;
  return {
    schema: 'muxui-react-visual-migration-comparison-v1',
    donor: manifest.donor,
    fixture: { frame: manifest.fixtureContract.frame, modes: manifest.fixtureContract.modes, copyData: manifest.fixtureContract.copyData, caseSha256: manifest.fixtureContract.caseSha256 },
    capture: manifest.capture,
    thresholds: manifest.thresholds,
    coverage: { bounded: true, applicableFamilyCount: 51, families: manifest.coverage.families, noApplicableDonor: manifest.coverage.noApplicableDonor, caseCount: manifest.coverage.caseCount, comparisonCount: manifest.coverage.comparisonCount, comparableCaseCount: manifest.coverage.caseCount, nonComparableCases: expectedStateCoverage.filter(({ disposition }) => disposition !== 'visual'), canonicalStateCount: expectedDescriptorStateCount, compatibilityStateCount: expectedCompatibilityStateCount, supplementalStateCount: expectedSupplementalStateCount, stateCoverageCount: expectedStateCoverage.length, stateDispositions: expectedStateDispositionCounts, stateCoverage: expectedStateCoverage, modes: manifest.coverage.modes, states: manifest.coverage.states, stateCounts: manifest.coverage.stateCounts },
    counts: { families: 51, noApplicableDonor: 2, semanticCases: manifest.coverage.caseCount, comparisons: comparisons.length, pass, failed },
    adaptations,
    comparisons,
    status: failed === 0 ? 'passed' : 'genuine-component-region-mismatches-require-review',
    mismatchInventory: [...grouped.values()],
    donorCaptureProvenance: manifest.bootstrap.captureProvenance,
    muxuiCaptureProvenance: manifest.bootstrap.muxuiCaptureProvenance,
  };
}

async function restoreActivationFile(target, backup, revalidate = async () => {}) {
  if (!backup || !(await pathExists(backup))) return;
  await revalidate();
  if (await pathExists(target)) {
    await revalidate();
    await rm(target, { force: true });
  }
  await revalidate();
  await rename(backup, target);
}

/**
 * Activate a reviewed MuxUI baseline, manifest, and sealed report as one
 * recoverable filesystem transaction. The donor snapshot is already staged
 * by `materializeSnapshotDirectory`; this boundary never touches the active
 * snapshot until the candidate report has independently validated.
 */
export async function activateVisualMigrationArtifacts(manifest, { nextManifest, report, root = appRoot, prepared, muxuiCaptureProvenance: suppliedMuxuiCaptureProvenance, failureAt } = {}) {
  if (!nextManifest || !report) throw new Error('visual migration activation requires a candidate manifest and sealed report');
  const visualRoot = resolve(root, 'visual-migration');
  const canonicalPaths = activationPaths(root);
  const activeManifestPath = canonicalPaths.manifest;
  const activeReportPath = canonicalPaths.report;
  const activeMuxuiCaptureProvenancePath = canonicalPaths.muxuiCaptureProvenance;
  const temporaryManifestPath = resolve(visualRoot, `.manifest.activation-${process.pid}`);
  const temporaryReportPath = resolve(visualRoot, `.comparison.activation-${process.pid}`);
  const temporaryMuxuiCaptureProvenancePath = resolve(visualRoot, `.muxui-capture-provenance.activation-${process.pid}`);
  const markerPath = canonicalPaths.marker;
  const manifestBackup = canonicalPaths.manifestBackup;
  const reportBackup = canonicalPaths.reportBackup;
  const muxuiCaptureProvenanceBackup = canonicalPaths.muxuiCaptureProvenanceBackup;
  const previousSnapshotPath = resolve(root, manifest.baselineDirectory);
  const nextSnapshotPath = resolve(root, nextManifest.baselineDirectory);
  assertSafeSnapshotDirectory(manifest.baselineDirectory, 'active baseline directory');
  if (!safeBaselineDirectoryPattern.test(nextManifest.baselineDirectory)) throw new Error('candidate baseline directory must be a content-addressed baseline');
  const sameSnapshot = previousSnapshotPath === nextSnapshotPath;
  const activationPathsForMarker = { ...canonicalPaths, previousSnapshot: previousSnapshotPath, nextSnapshot: nextSnapshotPath };
  const revalidate = () => assertActivationMutationPaths(root, canonicalPaths, {
    previousSnapshot: previousSnapshotPath,
    nextSnapshot: nextSnapshotPath,
    temporaryManifest: temporaryManifestPath,
    temporaryReport: temporaryReportPath,
    temporaryMuxui: temporaryMuxuiCaptureProvenancePath,
  });
  await revalidate();
  const muxuiCaptureProvenance = suppliedMuxuiCaptureProvenance ?? (nextManifest.bootstrap?.muxuiCaptureProvenance
    ? await readJsonInside(root, nextManifest.bootstrap.muxuiCaptureProvenance.path, 'manifest.bootstrap.muxuiCaptureProvenance')
    : undefined);
  if (!muxuiCaptureProvenance) throw new Error('visual migration activation requires Mux UI capture provenance');
  let activated = false;
  try {
    await revalidate();
    await writeJsonAndSync(temporaryReportPath, report);
    await revalidate();
    await writeJsonAndSync(temporaryManifestPath, nextManifest);
    await revalidate();
    await writeJsonAndSync(temporaryMuxuiCaptureProvenancePath, muxuiCaptureProvenance);
    await revalidate();
    await validateManifest(nextManifest, { root, muxuiCaptureProvenance });
    await validateSealedComparison(nextManifest, { root, report, muxuiCaptureProvenance });
    if (failureAt === 'before-swap') throw new Error('injected visual migration activation interruption before swap');
    await revalidate();
    await writeJsonAndSync(markerPath, activationMarkerFor(activationPathsForMarker, 'prepared'));
    await revalidate();
    await rename(activeManifestPath, manifestBackup);
    await revalidate();
    await rename(activeReportPath, reportBackup);
    if (await pathExists(activeMuxuiCaptureProvenancePath)) {
      await revalidate();
      await rename(activeMuxuiCaptureProvenancePath, muxuiCaptureProvenanceBackup);
    }
    await revalidate();
    await syncDirectory(visualRoot);
    await revalidate();
    await writeJsonAndSync(markerPath, activationMarkerFor(activationPathsForMarker, 'backed-up'));
    if (failureAt === 'after-backup') throw new Error('injected visual migration activation interruption after backup');
    await revalidate();
    await rename(temporaryReportPath, activeReportPath);
    await revalidate();
    await syncDirectory(visualRoot);
    await revalidate();
    await writeJsonAndSync(markerPath, activationMarkerFor(activationPathsForMarker, 'report-installed'));
    if (failureAt === 'after-report') throw new Error('injected visual migration activation interruption after report');
    await revalidate();
    await rename(temporaryMuxuiCaptureProvenancePath, activeMuxuiCaptureProvenancePath);
    await revalidate();
    await syncDirectory(visualRoot);
    await revalidate();
    await rename(temporaryManifestPath, activeManifestPath);
    await revalidate();
    await syncDirectory(visualRoot);
    await revalidate();
    await writeJsonAndSync(markerPath, activationMarkerFor(activationPathsForMarker, 'activated'));
    activated = true;
    if (!sameSnapshot && await pathExists(previousSnapshotPath)) {
      await revalidate();
      await rm(previousSnapshotPath, { recursive: true, force: true });
    }
    await revalidate();
    await rm(manifestBackup, { force: true });
    await revalidate();
    await rm(reportBackup, { force: true });
    await revalidate();
    await rm(muxuiCaptureProvenanceBackup, { force: true });
    await revalidate();
    await rm(markerPath, { force: true });
    await revalidate();
    await syncDirectory(visualRoot);
    return nextManifest;
  } catch (error) {
    // A path swap during the transaction is a fail-closed condition. Do not
    // inspect or clean up anything until every owned path is safe again.
    await revalidate();
    if (await pathExists(markerPath)) {
      const marker = await readFile(markerPath, 'utf8').then((value) => JSON.parse(value)).catch(() => undefined);
      if (marker?.phase === 'activated') {
        // A process may have completed both active renames before interruption.
        // Keep the new activation and only finish its cleanup on recovery.
        activated = true;
      }
    }
    if (!activated) {
      await revalidate();
      await restoreActivationFile(activeManifestPath, manifestBackup, revalidate);
      await restoreActivationFile(activeReportPath, reportBackup, revalidate);
      await restoreActivationFile(activeMuxuiCaptureProvenancePath, muxuiCaptureProvenanceBackup, revalidate);
      await revalidate();
      await rm(temporaryManifestPath, { force: true });
      await revalidate();
      await rm(temporaryReportPath, { force: true });
      await revalidate();
      await rm(temporaryMuxuiCaptureProvenancePath, { force: true });
      if (!sameSnapshot && nextSnapshotPath !== previousSnapshotPath && await pathExists(nextSnapshotPath)) {
        await revalidate();
        await rm(nextSnapshotPath, { recursive: true, force: true });
      }
      await revalidate();
      await rm(markerPath, { force: true });
    }
    throw error;
  }
}

/** Recover a transaction left by an interrupted baseline update. */
export async function recoverVisualMigrationActivation({ root = appRoot } = {}) {
  const paths = activationPaths(root);
  if (!(await pathExists(paths.marker))) return false;
  const { marker, markerPath, paths: trustedPaths } = await readValidatedActivationMarker(root);
  const revalidate = () => assertActivationMutationPaths(root, trustedPaths, {
    previousSnapshot: trustedPaths.previousSnapshot,
    nextSnapshot: trustedPaths.nextSnapshot,
  });
  if (marker.phase === 'activated') {
    await revalidate();
    await rm(trustedPaths.manifestBackup, { force: true });
    await revalidate();
    await rm(trustedPaths.reportBackup, { force: true });
    await revalidate();
    await rm(trustedPaths.muxuiCaptureProvenanceBackup, { force: true });
  } else {
    await restoreActivationFile(trustedPaths.manifest, trustedPaths.manifestBackup, revalidate);
    await restoreActivationFile(trustedPaths.report, trustedPaths.reportBackup, revalidate);
    await restoreActivationFile(trustedPaths.muxuiCaptureProvenance, trustedPaths.muxuiCaptureProvenanceBackup, revalidate);
    if (trustedPaths.nextSnapshot !== trustedPaths.previousSnapshot && await pathExists(trustedPaths.nextSnapshot)) {
      await revalidate();
      await rm(trustedPaths.nextSnapshot, { recursive: true, force: true });
    }
  }
  await revalidate();
  await rm(markerPath, { force: true });
  await syncDirectory(resolve(root, 'visual-migration'));
  return true;
}

export { applicableMigrationRecords, fixtureContractFor, fixtureMapSourcePath, migrationCases, migrationFrame, noApplicableDonorFamilies };
