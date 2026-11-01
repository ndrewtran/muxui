import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, join, posix, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { API_VERSION } from '@muxui/schema';
import {
  assertBundleRetention,
  assertExactArchiveEntries,
  assertExactDependencyGraph,
  assertExactExportList,
  assertInstalledCandidate,
  assertPackedFileBoundary,
  assertNoPublicSurfaceLeaks,
  assertSingleInstalledVersion,
  assertStylesheetAssetUrls,
  bundledModulePackage,
  collectInstalledClosure,
  createUpstreamNameMatcher,
  deriveCurrentExportSurface,
  deriveExpectedPackageEntries,
  derivePreparation,
  findModuleSideEffects,
  findPinnedDuplicateVersions,
  isolatedPackageManagerEnvironment,
  nodeBundledCli,
  readGeneratedOutputNames,
  readRetainedEvidence,
  readRetainedReviewEvidence,
  replaceVersions,
  summarizeBundleModules,
} from './release-proof.mjs';
import { canonicalJson } from './canonical-json.mjs';
import { deterministicArchive, readArchive } from './release-archive.mjs';
import { RETAINED_EVIDENCE_MILESTONES, buildPortfolioManifest, committedFileReader, releaseIdFor, verifyPortfolioRelease } from './release-manifest.mjs';
import {
  CANDIDATE_PUBLISH_CONFIG,
  assertCatalogRangeBound,
  assertPackedPackage,
  findDescriptorExportProblems,
  rewritePackedManifest,
  stampDescriptorProvenance,
} from './release-package.mjs';
import { PORTFOLIO_MANIFEST_FILE, PUBLISH_SET_FILE, parseReleaseVersions, readPublishSet, readSourceVersions, tarballFileName } from './release-set.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';
import { assertPatternVariantMarkup } from './pattern-variant-markup.mjs';
import { patternVariantExamples } from './pattern-variants.mjs';
import { resolvePinnedTool as resolvePinnedToolIn } from './pinned-tool.mjs';
import { fixForwardVersion, parseCandidateVersion } from './npm-publication.mjs';
import { readSupplementalMapping } from '../../../../packages/react/src/supplemental-mapping.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packages = await discoverWorkspacePackages(repositoryRoot);
const reactVersionPattern = /^0\.1\.0-alpha\.(?:0|[1-9]\d*)$/u;
// Release preparation packs the declared publish set (Decision 0032): one rc version for each member, given as
// `MUXUI_RELEASE_VERSIONS=<name>=<version>,...` (the npm-publish workflow's version inputs). Without it each member
// takes the first rc of its source version, so a local `pnpm release:prepare` runs as it always has.
const publishSet = readPublishSet(repositoryRoot);
const versions = parseReleaseVersions(process.env.MUXUI_RELEASE_VERSIONS, publishSet, readSourceVersions(publishSet, repositoryRoot));
const candidateVersion = versions.get('@muxui/react');
try {
  parseCandidateVersion(candidateVersion);
} catch (error) {
  throw new Error(`R1_EXIT_CANDIDATE_VERSION_INVALID: ${error.message}`);
}
// Decision 0032 item 8: tooling's catalog range is bound to the query API major tooling reads.
assertCatalogRangeBound({ catalogVersion: versions.get('@muxui/catalog'), queryApiVersion: API_VERSION });
const candidateArchiveName = tarballFileName('@muxui/react', candidateVersion);
// Rollback fixes forward with the next rc, so later candidates name the right successor.
const fixForwardCandidate = fixForwardVersion(candidateVersion);
const preparationToolPath = 'tooling/audits/repository-policy/src/release-prepare.mjs';
const r15Closure = JSON.parse(readFileSync(resolve(repositoryRoot, 'catalog/react-r1-5/closure.json'), 'utf8'));
// The generator declares the source candidate (catalog closure) and its fix-forward;
// the packed copy rewrites both to the input candidate and its fix-forward.
const sourceCandidateVersion = r15Closure.publication.candidateVersion;
const candidateVersionRewrites = new Map([
  [sourceCandidateVersion, candidateVersion],
  [fixForwardVersion(sourceCandidateVersion), fixForwardCandidate],
]);
const documentedSupportingExports = ['ToastProvider', 'useToast', 'useCommandPalette'];
const expectedPeerDependencies = {
  react: '>=19.2.0 <20',
  'react-dom': '>=19.2.0 <20',
};
// Only stylesheets have import-time effects, so bundlers may drop unused JS modules.
const expectedSideEffects = ['*.css'];
const expectedCandidatePublishConfig = CANDIDATE_PUBLISH_CONFIG;
const fixedPackageEntries = Object.freeze([
  'package/LICENSE',
  'package/NOTICE',
  'package/README.md',
  'package/package.json',
]);

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

const consumerToolRoot = resolve(import.meta.dirname, 'release-consumer');
// Upstream names the public surface must never expose, alongside the installed runtime closure.
const requiredUpstreamNames = [
  'react-aria', 'react-aria-components', 'react-stately', '@react-aria/', '@react-stately/', '@react-types/',
  'motion', '@tiptap/', 'marked', 'lucide-react', '@internationalized/',
];
// Dependency disclosure and historical donor provenance may name upstream packages.
const allowedGuidanceJsonPaths = {
  'generated/release.json': ['$.packageDependencies'],
  'generated/r1-5-closure.json': ['$.upstream', '$.families[].root'],
  'generated/compatibility.mjs': ['$.reactCompatibility.upstream'],
};

function tail(value, length = 4000) {
  const text = String(value ?? '');
  return text.length > length ? `...${text.slice(-length)}` : text;
}

function copyConsumerTool(consumer, file) {
  copyFileSync(join(consumerToolRoot, file), join(consumer, file));
}

// Duplicate versions of exact runtime pins found in clean consumers; recorded in the manifest.
const duplicateVersionWarnings = [];

// Walks a consumer's installed runtime graph: exactly one @tiptap/core is required,
// and every other exact-pinned dependency resolving to several versions is a warning.
function checkConsumerGraph(consumer, label) {
  const closure = collectInstalledClosure(consumer, '@muxui/react', { excludedNames: Object.keys(expectedPeerDependencies) });
  const version = assertSingleInstalledVersion(closure, '@tiptap/core', 'R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW');
  for (const duplicate of findPinnedDuplicateVersions(closure, expectedRuntimeDependencies)) {
    duplicateVersionWarnings.push({ consumer: label, ...duplicate });
    console.log(`R1 exit warning (${label}): ${duplicate.name} is pinned to ${duplicate.pinned} but installs ${duplicate.versions.join(', ')}`);
  }
  return { closure, version };
}

// Child processes that run consumer code or package managers; every one is bounded.
function runChild(label, command, args, { timeout = 300_000, ...options } = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, timeout, ...options });
  if (result.error?.code === 'ETIMEDOUT' || (result.signal === 'SIGTERM' && result.status === null)) {
    fail('R1_EXIT_CHILD_PROCESS_TIMEOUT', `${label} exceeded ${timeout}ms`);
  }
  return result;
}

function childOutput(result) {
  return tail(result.error?.message || result.stderr || result.stdout || `exited with ${result.signal ?? result.status}`);
}

// Resolves a proof tool pinned by the React package's devDependencies; see pinned-tool.mjs.
function resolvePinnedTool(name) {
  return resolvePinnedToolIn({ packageRoot: reactPackageRoot, manifest, name, fail });
}

function exampleImports(source) {
  const names = [];
  for (const [, typeOnly, clause, specifier] of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"](@muxui\/react(?:\/[^'"]+)?)['"]/gu)) {
    if (typeOnly) continue;
    for (const part of clause.split(',').map((value) => value.trim()).filter(Boolean)) {
      if (part.startsWith('type ')) continue;
      names.push(`${specifier}:${part.split(/\s+as\s+/u)[0]}`);
    }
  }
  return names;
}

const yarnVersion = '1.22.22';
const workspacePnpmVersion = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')).packageManager.replace(/^pnpm@/u, '');

// The workspace's pinned pnpm for consumers outside the workspace: the pnpm running
// this script, else the pin through Corepack (a bare `pnpm` there is Corepack's floating default).
function pinnedPnpmCommand() {
  const execPath = process.env.npm_execpath ?? '';
  return /pnpm/iu.test(execPath) ? [process.execPath, execPath] : [process.execPath, nodeBundledCli('corepack'), `pnpm@${workspacePnpmVersion}`];
}

// The pinned package managers of the online matrix; every one is required.
function packageManagerMatrix() {
  return [
    { name: 'pnpm', command: pinnedPnpmCommand(), expectedVersion: workspacePnpmVersion },
    { name: 'npm', command: [process.execPath, nodeBundledCli('npm')] },
    { name: 'yarn', command: [process.execPath, nodeBundledCli('corepack'), `yarn@${yarnVersion}`], expectedVersion: yarnVersion },
  ];
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha1(value) {
  return createHash('sha1').update(value).digest('hex');
}

function integrity(value) {
  return `sha512-${createHash('sha512').update(value).digest('base64')}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedJsonValue(value[key])]));
  }
  return value;
}

const extractedArchives = new Map();

// Reads members from one full extraction: bsdtar treats member arguments as globs,
// so bracketed names such as `Inter[opsz,wght].ttf` never match a direct `tar -xO`.
function readArchiveBytes(archive, path) {
  let root = extractedArchives.get(archive);
  if (!root) {
    root = `${archive}-contents`;
    mkdirSync(root);
    const result = spawnSync('tar', ['-xzf', archive, '-C', root], { encoding: 'utf8' });
    if (result.status !== 0) fail('R1.5_PACK_ARCHIVE_MISSING', result.stderr);
    extractedArchives.set(archive, root);
  }
  try {
    return readFileSync(join(root, path));
  } catch {
    return fail('R1.5_PACK_CONTENT_MISSING', path);
  }
}

function readArchiveFile(archive, path) {
  return readArchiveBytes(archive, path).toString('utf8');
}

function parseGeneratedJson(source) {
  return JSON.parse(source.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
}

function equalSet(actual, expected) {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && [...actual].sort().every((entry, index) => entry === [...expected].sort()[index]);
}

function assertIncludes(value, expected, code) {
  if (!value.includes(expected)) fail(code, expected);
}

function rewriteGeneratedVersion(source, rewrites) {
  const lines = source.split('\n');
  if (source.startsWith('/* @generated-from:')) {
    const body = replaceVersions(lines.slice(3).join('\n'), rewrites);
    const digest = sha256(` */\n${body}`);
    lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${digest}`);
    return `${lines.slice(0, 3).join('\n')}\n${body}`;
  }
  if (source.startsWith('// @generated-from:') || source.startsWith('<!-- @generated-from:')) {
    const body = replaceVersions(lines.slice(2).join('\n'), rewrites);
    const digest = sha256(body);
    lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${digest}`);
    return `${lines.slice(0, 2).join('\n')}\n${body}`;
  }
  return replaceVersions(source, rewrites);
}

function rewriteGeneratedBody(source, transform) {
  const lines = source.split('\n');
  const bodyStart = source.startsWith('/* @generated-from:') ? 3 : 2;
  const body = transform(lines.slice(bodyStart).join('\n'));
  const digest = sha256(source.startsWith('/* @generated-from:') ? ` */\n${body}` : body);
  const digestLine = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${digest}`);
  return `${lines[0]}\n${digestLine}\n${source.startsWith('/* @generated-from:') ? ` */\n` : ''}${body}`;
}

function rewriteGeneratedJson(source, transform) {
  return rewriteGeneratedBody(source, (body) => `${JSON.stringify(transform(JSON.parse(body)))}\n`);
}

function rewriteProvenance(source, target, rewrites) {
  const lines = source.split('\n');
  const body = lines.slice(2).join('\n');
  const declaration = JSON.parse(body);
  declaration.sha256 = `sha256:${sha256(target)}`;
  const rewrittenBody = replaceVersions(JSON.stringify(declaration), rewrites) + '\n';
  lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${sha256(rewrittenBody)}`);
  return `${lines.slice(0, 2).join('\n')}\n${rewrittenBody}`;
}

function trackedPackageEntries(sourceRevision, sourcePath) {
  const result = spawnSync('git', ['ls-tree', '-r', '--name-only', sourceRevision, '--', sourcePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail('R1_EXIT_SOURCE_IDENTITY_UNAVAILABLE', result.stderr || sourcePath);
  const sourcePrefix = 'packages/react/';
  const entries = result.stdout.trim().split('\n').filter(Boolean).map((entry) => {
    if (!entry.startsWith(sourcePrefix)) fail('R1_EXIT_SOURCE_IDENTITY_INVALID', entry);
    return `package/${entry.slice(sourcePrefix.length)}`;
  });
  if (entries.length === 0) fail('R1_EXIT_SOURCE_IDENTITY_INVALID', `no tracked files under ${sourcePath}`);
  return entries.sort();
}

function readSourceIdentity() {
  const revisionResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const statusResult = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (revisionResult.status !== 0 || statusResult.status !== 0) {
    fail('R1_EXIT_SOURCE_IDENTITY_UNAVAILABLE', revisionResult.stderr || statusResult.stderr);
  }
  return { revision: revisionResult.stdout.trim(), status: statusResult.stdout.trim() };
}

function assertSourceIdentity(expectedRevision, stage) {
  const identity = readSourceIdentity();
  if (identity.revision !== expectedRevision) {
    fail('R1_EXIT_SOURCE_IDENTITY_CHANGED', `${stage}: expected ${expectedRevision}, received ${identity.revision}`);
  }
  if (identity.status !== '') {
    fail('R1_EXIT_DIRTY_WORKTREE', `${stage}: source changed while preparing the exact release artifact`);
  }
}

const sourceDescriptor = parseGeneratedJson(readFileSync(resolve(repositoryRoot, 'packages/react/generated/descriptor.json'), 'utf8'));
const sourceCurrentContract = parseGeneratedJson(readFileSync(resolve(repositoryRoot, 'packages/react/generated/r1-6-contract.json'), 'utf8'));
const currentFamilySnapshot = JSON.parse(readFileSync(resolve(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'), 'utf8'));
const supplementalComponents = readSupplementalMapping(repositoryRoot);
const historicalExports = sourceDescriptor.historical.bindings.map(({ export: exportName }) => exportName);
const {
  canonicalHistoricalExports,
  currentComponentExports,
  currentRootExports,
  isolatedExportModules,
} = deriveCurrentExportSurface({
  historicalFamilies: currentFamilySnapshot.families,
  supplementalComponents,
});
assertExactExportList(sourceCurrentContract.current.rootExports, currentRootExports, 'R1.6_PACK_EXPORT_SURFACE_INVALID');
assertExactExportList(
  sourceCurrentContract.current.subpaths.map(({ export: name, module }) => `${name}:${module}`),
  isolatedExportModules,
  'R1.6_PACK_EXPORT_SURFACE_INVALID',
);
const sourcePublicModule = await import(pathToFileURL(resolve(repositoryRoot, 'packages/react/generated/index.mjs')).href);
const currentPublicExports = Object.keys(sourcePublicModule).sort();

const reactCandidate = packages.filter(({ name, manifest }) => (
  name === '@muxui/react' && reactVersionPattern.test(manifest.version)
));
// Only members of the publish set may be packed for publication; every other workspace package stays private.
const publishSetNames = new Set(publishSet.packages.map(({ name }) => name));
const publishable = packages.filter(({ name, manifest }) => manifest.private !== true && !publishSetNames.has(name));

if (publishable.length !== 0) {
  console.error(
    `FOUNDATION_RELEASE_FORBIDDEN: packages cannot become publishable before an exact external publish authorization: ${publishable.map(({ name }) => name).join(', ')}`,
  );
  process.exit(1);
}

// A member's source manifest stays private: packing sets `private: false` on the candidate copy only.
const sourcePackages = publishSet.packages.map((entry) => ({
  entry,
  workspace: packages.find(({ name, path }) => name === entry.name && path === entry.path),
}));
const publicSources = sourcePackages.filter(({ workspace }) => workspace?.manifest.private !== true);
if (publicSources.length !== 0) {
  console.error(
    `FOUNDATION_RELEASE_FORBIDDEN: publish-set sources must stay private until an exact external publish authorization: ${publicSources.map(({ entry }) => entry.name).join(', ')}`,
  );
  process.exit(1);
}

if (reactCandidate.length !== 1) {
  console.error('R1_EXIT_PUBLICATION_GUARD_INVALID: exactly one private R1.5 React source candidate is required');
  process.exit(1);
}

const reactPackage = reactCandidate[0];
const reactEntry = publishSet.packages.find(({ name }) => name === '@muxui/react');
const reactPackageRoot = resolve(repositoryRoot, 'packages/react');
const manifest = reactPackage.manifest;
const expectedRuntimeDependencies = { ...manifest.dependencies };
if (manifest.private !== true || manifest.scripts?.prepublishOnly !== 'node src/publish-guard.mjs') {
  console.error('R1_EXIT_PUBLICATION_GUARD_INVALID: the source candidate must remain private with its fail-closed prepublish guard');
  process.exit(1);
}

const publicationGuard = spawnSync(process.execPath, ['src/publish-guard.mjs'], {
  cwd: reactPackageRoot,
  encoding: 'utf8',
});
if (publicationGuard.status === 0 || !publicationGuard.stderr.includes('MUXUI_REACT_R15_PUBLISH_FORBIDDEN')) {
  fail('R1_EXIT_PUBLICATION_GUARD_INVALID', 'direct publication must remain fail-closed');
}

const sourceIdentity = readSourceIdentity();
if (sourceIdentity.status !== '') {
  fail('R1_EXIT_DIRTY_WORKTREE', 'commit the complete candidate before creating its exact release artifact');
}
const sourceRevision = sourceIdentity.revision;
const trackedAssetEntries = trackedPackageEntries(sourceRevision, 'packages/react/assets');
const trackedLicenseEntries = trackedPackageEntries(sourceRevision, 'packages/react/licenses');
const requiredAssetAndLicenseEntries = [...trackedAssetEntries, ...trackedLicenseEntries];
const sourceTreeResult = spawnSync('git', ['rev-parse', `${sourceRevision}^{tree}`], { cwd: repositoryRoot, encoding: 'utf8' });
if (sourceTreeResult.status !== 0) fail('R1_EXIT_SOURCE_IDENTITY_UNAVAILABLE', sourceTreeResult.stderr);
const sourceTree = sourceTreeResult.stdout.trim();
// One commit and these exact versions name the release; the React descriptor records it at pack time.
const releaseId = releaseIdFor({
  revision: sourceRevision,
  published: publishSet.packages.map(({ name }) => ({ name, version: versions.get(name) })),
});

// The catalog's generated files embed its package version (`catalogVersion`, ids, digest, release record), so the
// candidate takes them from a compile for the rc, written outside the checkout.
function compileCatalogCandidate(candidatePackage, version, workDirectory) {
  const output = join(workDirectory, 'catalog-generated');
  const compiled = spawnSync(process.execPath, ['packages/catalog/src/generate.mjs', '--package-version', version, '--output-directory', output], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (compiled.status !== 0) fail('P2_1_CATALOG_COMPILE_FAILED', childOutput(compiled));
  const compiledNames = readdirSync(join(output, 'generated')).sort();
  const packedNames = readdirSync(join(candidatePackage, 'generated')).sort();
  if (stableJson(compiledNames) !== stableJson(packedNames)) {
    fail('P2_1_CATALOG_COMPILE_FAILED', `compiled ${compiledNames.join(', ')} but the package packs ${packedNames.join(', ')}`);
  }
  for (const name of compiledNames) copyFileSync(join(output, 'generated', name), join(candidatePackage, 'generated', name));
}

// Packs a publish-set member other than React from its source tree and rewrites the tarball into its candidate
// (the rc manifest and, for the catalog, the files compiled for the rc), then audits it (E-P2.1-01).
function packSupportPackage(entry, destination) {
  const { workspace } = sourcePackages.find((candidate) => candidate.entry === entry);
  const source = workspace.manifest;
  const workDirectory = join(destination, `pack-${basename(entry.path)}`);
  mkdirSync(workDirectory);
  // Generation precedes preparation, so packing runs no lifecycle scripts.
  const packed = spawnSync('pnpm', ['--config.ignore-scripts=true', '--config.engine-strict=false', 'pack', '--pack-destination', workDirectory], {
    cwd: resolve(repositoryRoot, entry.path),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (packed.status !== 0) fail('P2_1_PACK_FAILED', `${entry.name}: ${tail(packed.stderr)}`);
  const extractedRoot = join(workDirectory, 'extracted');
  mkdirSync(extractedRoot);
  const unpacked = spawnSync('tar', ['-xzf', join(workDirectory, tarballFileName(entry.name, source.version)), '-C', extractedRoot], { encoding: 'utf8' });
  if (unpacked.status !== 0) fail('P2_1_PACK_ARCHIVE_MISSING', `${entry.name}: ${unpacked.stderr}`);
  const candidatePackage = join(extractedRoot, 'package');
  const manifestPath = join(candidatePackage, 'package.json');
  writeFileSync(manifestPath, `${JSON.stringify(sortedJsonValue(rewritePackedManifest({
    packed: JSON.parse(readFileSync(manifestPath, 'utf8')),
    entry,
    versions,
    sourceRevision,
  })), null, 2)}\n`);
  if (entry.name === '@muxui/catalog') compileCatalogCandidate(candidatePackage, versions.get(entry.name), workDirectory);
  const archiveBytes = deterministicArchive(candidatePackage);
  const archive = join(destination, tarballFileName(entry.name, versions.get(entry.name)));
  writeFileSync(archive, archiveBytes);
  const entries = [...readArchive(archiveBytes).keys()].sort();
  assertPackedPackage({ entry, source, packed: JSON.parse(readFileSync(manifestPath, 'utf8')), entries, versions, sourceRevision });
  return { entry, archive, archiveBytes, candidateRoot: candidatePackage };
}

const temp = mkdtempSync(join(tmpdir(), 'muxui-r1-5-release-'));
try {
  const supportPackages = publishSet.packages.filter(({ name }) => name !== '@muxui/react').map((entry) => packSupportPackage(entry, temp));
  assertSourceIdentity(sourceRevision, 'after packing schema, catalog, and tooling');
  console.log(`P2.1 packed and audited ${supportPackages.map(({ entry }) => `${entry.name}@${versions.get(entry.name)}`).join(', ')}`);

  const packed = spawnSync('pnpm', ['pack', '--pack-destination', temp], {
    cwd: reactPackageRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  if (packed.status !== 0) fail('R1.5_PACK_FAILED', packed.stderr);
  const sourceArchive = join(temp, `muxui-react-${manifest.version}.tgz`);
  const sourceListing = spawnSync('tar', ['-tzf', sourceArchive], { encoding: 'utf8' });
  if (sourceListing.status !== 0) fail('R1.5_PACK_ARCHIVE_MISSING', sourceListing.stderr);
  const sourceEntries = sourceListing.stdout.trim().split('\n').filter((entry) => entry && !entry.endsWith('/')).sort();
  assertSourceIdentity(sourceRevision, 'after prepack');
  const rendererCheck = spawnSync(process.execPath, ['src/generate.mjs', '--check'], {
    cwd: reactPackageRoot,
    encoding: 'utf8',
  });
  if (rendererCheck.status !== 0) fail('R1_EXIT_GENERATION_IDENTITY_INVALID', rendererCheck.stderr || rendererCheck.stdout);
  assertSourceIdentity(sourceRevision, 'after renderer generation check');
  const generatedOutputs = readGeneratedOutputNames(reactPackageRoot);
  const expectedGeneratedEntries = generatedOutputs.map((name) => `package/generated/${name}`);
  const expectedPackageEntries = deriveExpectedPackageEntries({
    generatedOutputs,
    fixedEntries: fixedPackageEntries,
    trackedEntries: requiredAssetAndLicenseEntries,
  });
  assertExactArchiveEntries(sourceEntries, expectedPackageEntries);
  assertPackedFileBoundary({
    entries: sourceEntries,
    manifestFiles: manifest.files,
    requiredEntries: requiredAssetAndLicenseEntries,
  });
  const candidateRoot = join(temp, 'candidate');
  mkdirSync(candidateRoot);
  const extracted = spawnSync('tar', ['-xzf', sourceArchive, '-C', candidateRoot], { encoding: 'utf8' });
  if (extracted.status !== 0) fail('R1.5_PACK_ARCHIVE_MISSING', extracted.stderr);
  const candidatePackage = join(candidateRoot, 'package');
  const candidateManifest = rewritePackedManifest({
    packed: JSON.parse(readFileSync(join(candidatePackage, 'package.json'), 'utf8')),
    entry: reactEntry,
    versions,
    sourceRevision,
  });
  writeFileSync(join(candidatePackage, 'package.json'), `${JSON.stringify(sortedJsonValue(candidateManifest), null, 2)}\n`);
  // The source alpha becomes the candidate; the generator's declared candidate
  // and fix-forward become the input candidate and its fix-forward.
  const versionRewrites = new Map([[manifest.version, candidateVersion], ...candidateVersionRewrites]);
  const readmePath = join(candidatePackage, 'README.md');
  writeFileSync(readmePath, rewriteGeneratedVersion(readFileSync(readmePath, 'utf8'), candidateVersionRewrites));
  for (const entry of expectedGeneratedEntries) {
    const relative = entry.slice('package/'.length);
    if (relative.endsWith('.provenance')) continue;
    const path = join(candidatePackage, relative);
    const original = readFileSync(path, 'utf8');
    let rewritten = rewriteGeneratedVersion(original, versionRewrites);
    if (relative === 'generated/release.json') {
      const releaseValue = JSON.parse(rewritten);
      rewritten = `${JSON.stringify({
        ...releaseValue,
        packagePrivate: false,
        publication: { ...releaseValue.publication, status: 'prepared', mutationPerformed: false },
        publicationPreparation: {
          ...releaseValue.publicationPreparation,
          status: 'prepared',
          authorization: 'required-external-human-authorization',
          mutationPerformed: false,
        },
      })}\n`;
    } else if (relative === 'generated/r1-5-closure.json') {
      rewritten = rewriteGeneratedJson(rewritten, (value) => ({
        ...value,
        publication: {
          ...value.publication,
          private: false,
          status: 'prepared',
          mutationPerformed: false,
        },
        families: value.families.map((family) => ({ ...family, packed: { ...family.packed, private: false } })),
      }));
    } else if (relative === 'generated/renderer-descriptor.json') {
      // The renderer descriptor records the release and commit it was packed for (read, never compared, by the resolver).
      rewritten = stampDescriptorProvenance(rewritten, { releaseId, sourceCommit: sourceRevision });
    } else if (relative === 'generated/compatibility.mjs') {
      rewritten = rewriteGeneratedBody(rewritten, (body) => {
        const publication = `"publication":{"candidateVersion":"${candidateVersion}","private":true,"requires":["explicit external publish authorization"],"status":"disabled"}`;
        const preparedPublication = `"publication":{"candidateVersion":"${candidateVersion}","private":false,"requires":["explicit external publish authorization"],"status":"prepared","mutationPerformed":false}`;
        const prepared = body.replace(publication, preparedPublication);
        if (prepared === body) fail('R1_EXIT_PACK_RELEASE_METADATA_INVALID', 'compatibility publication metadata was not transformed');
        return prepared;
      });
    }
    writeFileSync(path, rewritten);
  }
  for (const entry of expectedGeneratedEntries.filter((value) => value.endsWith('.provenance'))) {
    const relative = entry.slice('package/'.length);
    const path = join(candidatePackage, relative);
    const target = readFileSync(join(candidatePackage, relative.replace(/\.provenance$/u, '')), 'utf8');
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, rewriteProvenance(original, target, versionRewrites));
  }
  const archive = join(temp, candidateArchiveName);
  const archiveBytes = deterministicArchive(candidatePackage);
  writeFileSync(archive, archiveBytes);
  const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  if (listing.status !== 0) fail('R1.5_PACK_ARCHIVE_MISSING', listing.stderr);
  const entries = listing.stdout.trim().split('\n').filter((entry) => !entry.endsWith('/')).sort();
  assertExactArchiveEntries(entries, expectedPackageEntries);
  assertPackedFileBoundary({
    entries,
    manifestFiles: manifest.files,
    requiredEntries: requiredAssetAndLicenseEntries,
  });
  if (entries.some((entry) => entry.startsWith('package/src/') || entry.startsWith('package/test/'))) {
    fail('R1.5_PACK_PRIVATE_SOURCE_LEAK', 'private source or tests entered the archive');
  }

  const packedManifest = JSON.parse(readArchiveFile(archive, 'package/package.json'));
  assertExactDependencyGraph(packedManifest.dependencies, expectedRuntimeDependencies);
  if (packedManifest.name !== '@muxui/react'
    || packedManifest.version !== candidateVersion
    || packedManifest.private !== false
    || stableJson(packedManifest.peerDependencies) !== stableJson(expectedPeerDependencies)
    || stableJson(packedManifest.exports) !== stableJson(manifest.exports)
    || stableJson(packedManifest.files) !== stableJson(manifest.files)
    || stableJson(manifest.sideEffects) !== stableJson(expectedSideEffects)
    || stableJson(packedManifest.sideEffects) !== stableJson(expectedSideEffects)
    || packedManifest.scripts !== undefined
    || stableJson(packedManifest.publishConfig) !== stableJson(expectedCandidatePublishConfig)) {
    fail('R1_EXIT_PACK_MANIFEST_INVALID', 'name, version, privacy, runtime graph, peers, exports, files, side effects, lifecycle, or publish config drifted');
  }
  const packedManifestText = JSON.stringify(packedManifest);
  for (const forbidden of ['workspace:', '@muxui/web']) {
    if (packedManifestText.includes(forbidden)) fail('R1.5_PACK_MANIFEST_INVALID', `forbidden package reference: ${forbidden}`);
  }
  assertPackedPackage({ entry: reactEntry, source: manifest, packed: packedManifest, entries, versions, sourceRevision });

  const publicEntry = readArchiveFile(archive, 'package/generated/index.mjs');
  const publicTypes = readArchiveFile(archive, 'package/generated/index.d.ts');
  for (const forbidden of ['react-aria-components', '@internationalized/date', 'react-stately', 'UNSTABLE_']) {
    if (publicEntry.includes(forbidden) || publicTypes.includes(forbidden)) {
      fail('R1.5_PACK_PUBLIC_LEAK', `upstream implementation detail leaked through the public surface: ${forbidden}`);
    }
  }
  const descriptor = JSON.parse(readArchiveFile(archive, 'package/generated/descriptor.json'));
  const release = JSON.parse(readArchiveFile(archive, 'package/generated/release.json'));
  const compatibility = readArchiveFile(archive, 'package/generated/compatibility.mjs');
  const closure = parseGeneratedJson(readArchiveFile(archive, 'package/generated/r1-5-closure.json'));
  assertExactExportList(descriptor.bindings.map(({ export: name }) => name), currentComponentExports, 'R1.6_PACK_EXPORT_SURFACE_INVALID');
  assertExactExportList(release.componentExports.map(({ name }) => name), currentComponentExports, 'R1.6_PACK_EXPORT_SURFACE_INVALID');
  assertExactExportList(
    descriptor.bindings.filter(({ module }) => module === '.').map(({ export: name }) => name),
    currentRootExports,
    'R1.6_PACK_EXPORT_SURFACE_INVALID',
  );
  assertExactExportList(
    descriptor.bindings.filter(({ module }) => module !== '.').map(({ export: name, module }) => `${name}:${module}`),
    isolatedExportModules,
    'R1.6_PACK_EXPORT_SURFACE_INVALID',
  );
  assertExactExportList(
    release.componentExports.filter(({ module }) => module === '.').map(({ name }) => name),
    currentRootExports,
    'R1.6_PACK_EXPORT_SURFACE_INVALID',
  );
  assertExactExportList(
    release.componentExports.filter(({ module }) => module !== '.').map(({ name, module }) => `${name}:${module}`),
    isolatedExportModules,
    'R1.6_PACK_EXPORT_SURFACE_INVALID',
  );
  assertExactExportList(descriptor.historical?.bindings?.map(({ export: name }) => name) ?? [], historicalExports, 'R1.5_PACK_EXPORT_SURFACE_INVALID');
  assertExactExportList(closure.families?.map(({ export: { name } }) => name) ?? [], canonicalHistoricalExports, 'R1.5_PACK_EXPORT_SURFACE_INVALID');
  if (closure.families?.length !== 53
    || closure.publication?.private !== false
    || closure.publication?.status !== 'prepared'
    || closure.publication?.mutationPerformed !== false
    || closure.families.some(({ packed }) => packed?.private !== false)) {
    fail('R1.5_PACK_EXPORT_SURFACE_INVALID', 'descriptor, release, closure, and public export surfaces disagree');
  }
  if (release.packagePrivate !== false
    || release.publication?.status !== 'prepared'
    || release.publication?.mutationPerformed !== false
    || release.publicationPreparation?.status !== 'prepared'
    || release.publicationPreparation?.authorization !== 'required-external-human-authorization'
    || release.publicationPreparation?.mutationPerformed !== false
    || stableJson(release.runtimeProfiles) !== stableJson(['web.react'])
    || release.version !== candidateVersion
    || descriptor.version !== candidateVersion
    || closure.version !== candidateVersion
    || !compatibility.includes(`"version":"${candidateVersion}"`)
    || !compatibility.includes('unproved; R1.5 React exports only')) {
    fail('R1_EXIT_PACK_RELEASE_METADATA_INVALID', 'support, publication, runtime, or package boundary drifted');
  }
  assertIncludes(
    compatibility,
    `"publication":{"candidateVersion":"${candidateVersion}","private":false,"requires":["explicit external publish authorization"],"status":"prepared","mutationPerformed":false}`,
    'R1_EXIT_PACK_RELEASE_METADATA_INVALID',
  );
  const metadataFailures = [
    ['dependencies', stableJson(release.packageDependencies) === stableJson(expectedRuntimeDependencies)],
    ['peers', stableJson(release.peerDependencies) === stableJson(expectedPeerDependencies)],
    ['exports', stableJson(release.packageExports) === stableJson(manifest.exports)],
    ['files', stableJson(release.packageFiles) === stableJson(manifest.files)],
    ['schema', release.publicationPreparation?.schema === 'muxui-portfolio-release-v1'],
    ['publishSet', release.publicationPreparation?.publishSet === PUBLISH_SET_FILE],
    ['candidateVersion', release.publicationPreparation?.candidateVersion === candidateVersion],
    ['registry', release.publicationPreparation?.registry === 'https://registry.npmjs.org'],
    ['distTag', release.publicationPreparation?.distTag === 'next'],
    ['preparationTool', release.publicationPreparation?.preparationTool === preparationToolPath],
    ['publishCommand', release.publicationPreparation?.publishCommand === 'npm publish <candidate-tarball> --tag next --access public --provenance --registry=https://registry.npmjs.org'],
    ['provenance', release.publicationPreparation?.provenance === 'required-at-publication'],
    ['sourcePrivate', release.publicationPreparation?.source?.private === true],
    ['preflight', release.publicationPreparation?.preflight?.status === 'required-before-publication'],
    ['evidence', stableJson(release.publicationPreparation?.evidence) === stableJson({
      'E-R1-EXIT-01': 'candidate-preparation',
      'E-R1-EXIT-02': 'candidate-integrity-prepared-registry-provenance-pending',
      'E-R1-EXIT-03': 'pending-post-publication',
      'E-R1-EXIT-04': 'pending-post-publication',
    })],
  ].filter(([, valid]) => !valid).map(([name]) => name);
  if (metadataFailures.length !== 0) {
    fail('R1_EXIT_PACK_RELEASE_METADATA_INVALID', `release metadata does not correlate the candidate package tuple: ${metadataFailures.join(', ')}`);
  }

  const readme = readArchiveFile(archive, 'package/README.md');
  const notice = readArchiveFile(archive, 'package/NOTICE');
  const styles = readArchiveFile(archive, 'package/generated/styles.css');
  const archiveEntrySizes = new Map(requiredAssetAndLicenseEntries.map((entry) => [
    entry,
    readArchiveBytes(archive, entry).length,
  ]));
  assertStylesheetAssetUrls({
    stylesheet: styles,
    stylesheetEntry: 'package/generated/styles.css',
    entries,
    entrySizes: archiveEntrySizes,
  });
  for (const name of [...currentComponentExports, ...documentedSupportingExports]) assertIncludes(readme, name, 'R1.5_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, 'web.react', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, `@muxui/react@${candidateVersion}`, 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, `./muxui-react-${candidateVersion}.tgz`, 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, 'next', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(notice, 'Copyright (c) 2026 Andrew', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Lucide', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, '@internationalized/date', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Copyright (c) 2013-present Cole Bemis', 'R1.5_PACK_NOTICE_INVALID');
  for (const name of currentComponentExports) {
    const slug = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    assertIncludes(styles, `.muxui-${slug}`, 'R1.5_PACK_STYLE_MISSING');
  }

  const consumerManifest = `${JSON.stringify({
    name: 'muxui-r1-5-clean-consumer', private: true, type: 'module',
    dependencies: { '@muxui/react': `file:../muxui-react-${candidateVersion}.tgz`, react: '19.2.8', 'react-dom': '19.2.8' },
  }, null, 2)}\n`;
  const [consumerPnpm, ...consumerPnpmArguments] = pinnedPnpmCommand();
  const consumerEnvironment = { ...process.env, npm_config_engine_strict: 'false' };
  // The offline install below resolves the registry packages from pnpm's cache, so an
  // online install of the same manifest fills that cache first, in a sibling directory.
  // It must not depend on an earlier check having done so: a dry run that reuses main's
  // CI skips the check graph (Decision 0030).
  const warmConsumer = mkdtempSync(join(temp, 'consumer-warm-'));
  writeFileSync(join(warmConsumer, 'package.json'), consumerManifest);
  const warm = runChild('consumer cache warm-up install', consumerPnpm, [...consumerPnpmArguments, 'install', '--ignore-scripts'], {
    cwd: warmConsumer,
    env: consumerEnvironment,
    timeout: 600_000,
  });
  if (warm.status !== 0) fail('R1_EXIT_CONSUMER_CACHE_WARMUP_FAILED', childOutput(warm));
  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), consumerManifest);
  const install = runChild('offline consumer install', consumerPnpm, [...consumerPnpmArguments, 'install', '--offline', '--ignore-scripts'], {
    cwd: consumer,
    env: consumerEnvironment,
  });
  if (install.status !== 0) fail('R1.5_PACK_CONSUMER_INSTALL_FAILED', childOutput(install));

  const consumerScript = `
    import { performance } from 'node:perf_hooks';
    import { access } from 'node:fs/promises';
    import { fileURLToPath } from 'node:url';
    import React from 'react';
    import {renderToString} from 'react-dom/server';
    const importStarted = performance.now();
    const entry = await import('@muxui/react');
    const packedImportMilliseconds = performance.now() - importStarted;
    const compatibility = await import('@muxui/react/compatibility');
    const themes = await import('@muxui/react/themes');
    const testing = await import('@muxui/react/testing');
    const expected = ${JSON.stringify(currentPublicExports)};
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([...expected].sort())) throw new Error('exact public export surface');
    if (compatibility.reactCompatibility.version !== '${candidateVersion}') throw new Error('compatibility version');
    if (compatibility.reactCompatibility.support !== 'unproved; R1.5 React exports only') throw new Error('compatibility support');
    if (testing.reactPlatformSafetyFixture.componentSupportClaim !== 'none') throw new Error('support claim');
    const packageEntry = await import.meta.resolve('@muxui/react');
    await import(new URL('./fields.js', packageEntry));
    if (!import.meta.resolve('@muxui/react/styles.css').endsWith('/generated/styles.css')) throw new Error('styles resolution');
    if (!import.meta.resolve('@muxui/react/themes.css').endsWith('/generated/themes.css')) throw new Error('themes stylesheet resolution');
    if (!Array.isArray(themes.MUXUI_THEME_PRESETS) || themes.MUXUI_THEME_PRESETS.length !== 15) throw new Error('themes metadata');
    if (themes.MUXUI_DEFAULT_THEME_PRESET_ID !== 'standard-harbour') throw new Error('themes default preset');
    const isolated = await Promise.all(['markdown', 'text-editor'].map((subpath) => import('@muxui/react/' + subpath)));
    if (typeof isolated[0].Markdown !== 'object' && typeof isolated[0].Markdown !== 'function') throw new Error('markdown subpath resolution');
    if (typeof isolated[1].TextEditor !== 'object' && typeof isolated[1].TextEditor !== 'function') throw new Error('text-editor subpath resolution');
    for (const relative of ${JSON.stringify(requiredAssetAndLicenseEntries.map((entry) => entry.slice('package/'.length)))}) {
      await access(fileURLToPath(new URL('../' + relative, packageEntry)));
    }
    for (const relative of ['generated/themes.css', 'generated/themes.d.ts', 'generated/themes.mjs']) {
      await access(fileURLToPath(new URL('../' + relative, packageEntry)));
    }
    const {
      Autocomplete, Breadcrumbs, Button, Calendar, Checkbox, CheckboxGroup, DateField, DatePicker,
      DateRangePicker, Disclosure, DisclosureGroup, Form, Group, Link, Meter, NumberField,
      ProgressBar, RangeCalendar, SearchField, Separator, Switch, TextField, TimeField, ToggleButton,
      DropZone, FileTrigger, Dialog, Popover, PreviewTrigger, ToastProvider, Tooltip,
    } = entry;
    const ssrStarted = performance.now();
    const rendered = renderToString(React.createElement(Form, {method: 'post'},
      React.createElement(Button, null, 'Save'),
      React.createElement(Breadcrumbs, {'aria-label': 'Path', items: [{label: 'Home', href: '/'}]}),
      React.createElement(Checkbox, {name: 'enabled', value: 'yes'}, 'Enabled'),
      React.createElement(CheckboxGroup, {label: 'Alerts', name: 'alerts'}, React.createElement(Checkbox, {value: 'email'}, 'Email')),
      React.createElement(Disclosure, {title: 'Details'}, 'Details'),
      React.createElement(DisclosureGroup, null, React.createElement(Disclosure, {title: 'More'}, 'More')),
      React.createElement(Group, {role: 'group', 'aria-label': 'Group'}, 'Group'),
      React.createElement(Link, {href: '/'}, 'Home'),
      React.createElement(Meter, {label: 'Storage', value: 2}),
      React.createElement(ProgressBar, {label: 'Upload', value: 2}),
      React.createElement(Separator),
      React.createElement(ToggleButton, null, 'Toggle'),
      React.createElement(Autocomplete, {label: 'City', items: ['Melbourne'], defaultValue: 'Mel'}),
      React.createElement(Calendar, {label: 'Calendar', value: '2026-08-26'}),
      React.createElement(DateField, {label: 'Birthday', name: 'date', value: '2026-08-26'}),
      React.createElement(DatePicker, {label: 'Due date', name: 'due', value: '2026-08-26'}),
      React.createElement(DateRangePicker, {label: 'Trip', startName: 'rangeStart', endName: 'rangeEnd', value: {start: '2026-08-26', end: '2026-09-01'}}),
      React.createElement(NumberField, {label: 'Quantity', name: 'quantity', value: 2}),
      React.createElement(RangeCalendar, {label: 'Range calendar', value: {start: '2026-08-26', end: '2026-09-01'}}),
      React.createElement(SearchField, {label: 'Search', name: 'query', value: 'MuxUI'}),
      React.createElement(Switch, {label: 'Enabled', name: 'switch'}),
      React.createElement(TextField, {label: 'Name', name: 'name', value: 'MuxUI'}),
      React.createElement(TimeField, {label: 'Start', name: 'time', value: '09:30'}),
      React.createElement(DropZone, {'aria-label': 'Upload files'}, 'Drop files here'),
      React.createElement(FileTrigger, null, 'Choose files'),
      React.createElement(Dialog, {title: 'Closed dialog', open: false}, 'Dialog content'),
      React.createElement(Popover, {'aria-label': 'Details', trigger: React.createElement('button', {type: 'button'}, 'Details')}, 'Popover content'),
      React.createElement(PreviewTrigger, {'aria-label': 'Preview', trigger: React.createElement('button', {type: 'button'}, 'Preview')}, 'Preview content'),
      React.createElement(Tooltip, {trigger: React.createElement('button', {type: 'button'}, 'Help'), content: 'Helpful information'}),
      React.createElement(ToastProvider, null),
    ));
    const ssrMilliseconds = performance.now() - ssrStarted;
    for (const marker of ['<form', 'Calendar', 'Range calendar', 'August 2026', 'name="date"', 'name="due"', 'name="rangeStart"', 'name="rangeEnd"', 'name="time"', '2026-08-26', '09:30:00']) if (!rendered.includes(marker)) throw new Error('render/form/temporal behavior');
    let rejected = false;
    try { await import('@muxui/react/button'); } catch (error) { rejected = error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'; }
    if (!rejected) throw new Error('undeclared component subpath resolved');
    console.log(JSON.stringify({ packedImportMilliseconds, ssrMilliseconds }));
  `;
  const consumerCheck = runChild('offline consumer import', process.execPath, ['--input-type=module', '--eval', consumerScript], { cwd: consumer });
  if (consumerCheck.status !== 0) fail('R1.5_PACK_CONSUMER_IMPORT_FAILED', consumerCheck.stderr || consumerCheck.stdout);
  const measurementLine = consumerCheck.stdout.trim().split('\n').filter(Boolean).at(-1);
  const measurements = JSON.parse(measurementLine ?? '{}');
  const budgets = r15Closure.performance?.budgets ?? {};
  if (!Number.isFinite(measurements.packedImportMilliseconds)
    || !Number.isFinite(measurements.ssrMilliseconds)
    || measurements.packedImportMilliseconds > budgets.packedImportMilliseconds
    || measurements.ssrMilliseconds > budgets.ssrMilliseconds) {
    fail('R1.5_PACK_PERFORMANCE_BUDGET_EXCEEDED', JSON.stringify({ measurements, budgets }));
  }
  console.log(`R1.5 packed import ${measurements.packedImportMilliseconds.toFixed(2)}ms / ${budgets.packedImportMilliseconds}ms; SSR ${measurements.ssrMilliseconds.toFixed(2)}ms / ${budgets.ssrMilliseconds}ms`);

  // The offline consumer must resolve one editor engine, as the online matrix does.
  const offlineGraph = checkConsumerGraph(consumer, 'offline pnpm');
  console.log(`R1 exit offline consumer resolves @tiptap/core ${offlineGraph.version} across ${offlineGraph.closure.size} runtime packages`);

  // Public declaration surface, re-exports, and generated guidance name no upstream package.
  const upstreamNames = [...requiredUpstreamNames, ...[...offlineGraph.closure.keys()].filter((name) => name !== '@muxui/react')];
  const generatedEntries = entries.filter((entry) => entry.startsWith('package/generated/'));
  const publicJsTargets = Object.values(packedManifest.exports)
    .map((target) => (typeof target === 'string' ? target : target.default))
    .filter((target) => /\.m?js$/u.test(target))
    .map((target) => `package/${target.slice(2)}`);
  const guidanceJsonFiles = ['descriptor.json', 'release.json', 'r1-5-closure.json', 'r1-6-contract.json']
    .map((name) => `generated/${name}`)
    .map((file) => ({ file, value: parseGeneratedJson(readArchiveFile(archive, `package/${file}`)), allowedJsonPaths: allowedGuidanceJsonPaths[file] }));
  const guidanceModules = await Promise.all(['compatibility.mjs', 'testing.mjs', 'themes.mjs'].map(async (name) => {
    const file = `generated/${name}`;
    return { file, value: { ...(await import(pathToFileURL(join(candidatePackage, file)).href)) }, allowedJsonPaths: allowedGuidanceJsonPaths[file] };
  }));
  assertNoPublicSurfaceLeaks({
    declarations: generatedEntries.filter((entry) => entry.endsWith('.d.ts')).map((entry) => ({ file: entry, text: readArchiveFile(archive, entry) })),
    entries: publicJsTargets.map((entry) => ({ file: entry, text: readArchiveFile(archive, entry) })),
    texts: [
      { file: 'package/README.md', text: readme },
      { file: 'package/generated/index.mjs', text: publicEntry },
    ],
    json: [...guidanceJsonFiles, ...guidanceModules],
    matcher: createUpstreamNameMatcher(upstreamNames),
    // Declarations may self-reference the package, as icon-button.d.ts does for ButtonProps.
    allowedSpecifiers: ['react', 'react-dom', '@muxui/react'],
  });
  console.log(`R1 exit public-surface leak scan passed for ${upstreamNames.length} upstream names across ${generatedEntries.filter((entry) => entry.endsWith('.d.ts')).length} declarations, ${publicJsTargets.length} public entries, README, and ${guidanceJsonFiles.length + guidanceModules.length} guidance projections`);

  // `sideEffects: ["*.css"]` holds only while no packed JS module runs code at import time.
  const packedModules = generatedEntries.filter((entry) => /\.m?js$/u.test(entry));
  const sideEffectFindings = packedModules.flatMap((entry) => findModuleSideEffects(readArchiveFile(archive, entry)).map((finding) => `${entry}: ${finding}`));
  if (sideEffectFindings.length !== 0) fail('R1_EXIT_PACK_SIDE_EFFECTS_INVALID', sideEffectFindings.join('; '));
  console.log(`R1 exit side-effect scan passed for ${packedModules.length} packed JS modules`);

  // SSR every canonical catalog example and fixture on the packed artifact, then hydrate it in jsdom.
  const { version: viteVersion, url: viteUrl } = resolvePinnedTool('vite');
  const vite = await import(viteUrl);
  mkdirSync(join(consumer, 'examples'));
  const planModules = [];
  const exampleCoverage = new Set();
  for (const binding of descriptor.bindings) {
    const slug = binding.binding.split('#', 1)[0].slice('muxui:component:'.length);
    const sourceRoot = resolve(repositoryRoot, `catalog/components/${slug}/examples/react`);
    const files = existsSync(sourceRoot) ? readdirSync(sourceRoot).filter((file) => file.endsWith('.tsx')).sort() : [];
    if (files.length === 0) fail('R1_EXIT_PACK_SSR_COVERAGE_MISSING', `${binding.export} has no canonical React example`);
    for (const file of files) {
      const sourcePath = join(sourceRoot, file);
      const source = readFileSync(sourcePath, 'utf8');
      for (const name of exampleImports(source)) exampleCoverage.add(name);
      const { code } = await vite.transformWithOxc(source, sourcePath, { lang: 'tsx', jsx: { runtime: 'automatic' } });
      const output = `examples/${slug}--${file.replace(/\.tsx$/u, '.mjs')}`;
      writeFileSync(join(consumer, output), code);
      planModules.push({ file: output });
    }
  }
  // Pattern ("block") variants render in the same packed consumer (E-BL1-03).
  const variants = await patternVariantExamples(repositoryRoot);
  if (variants.length === 0) fail('R1_EXIT_PACK_SSR_COVERAGE_MISSING', 'the catalog declares no pattern variant example');
  // Variants stay out of exampleCoverage: a runtime export needs its own component example.
  for (const variant of variants) {
    const { code } = await vite.transformWithOxc(variant.text, resolve(repositoryRoot, variant.source), { lang: 'tsx', jsx: { runtime: 'automatic' } });
    const output = `examples/pattern-${variant.patternSlug}--${variant.variantSlug}.mjs`;
    writeFileSync(join(consumer, output), code);
    planModules.push({ file: output, measuredLayout: true });
  }
  for (const file of ['render-examples.mjs', 'hydrate-examples.mjs', 'export-fixtures.mjs']) copyConsumerTool(consumer, file);
  planModules.push({ file: 'export-fixtures.mjs', components: ['ToastFixture', 'LightboxPartsFixture'] });
  const componentModules = ['@muxui/react', ...new Set(isolatedExportModules.map((entry) => `@muxui/react/${entry.split(':')[1].slice(2)}`))];
  writeFileSync(join(consumer, 'ssr-plan.json'), `${JSON.stringify({
    modules: planModules,
    exportModules: componentModules,
    valueChecks: { file: 'export-fixtures.mjs', name: 'checkValueExports' },
  })}\n`);
  // Server and client both use React's development build, which reports mismatches and provides act.
  const developmentEnvironment = { ...process.env, NODE_ENV: 'development' };
  const serverRender = runChild('packed SSR render', process.execPath, ['render-examples.mjs', 'ssr-plan.json', 'ssr-result.json'], { cwd: consumer, env: developmentEnvironment });
  if (serverRender.status !== 0) fail('R1_EXIT_PACK_SSR_FAILED', childOutput(serverRender));
  const serverResult = JSON.parse(readFileSync(join(consumer, 'ssr-result.json'), 'utf8'));
  const covered = new Set([...exampleCoverage, ...serverResult.valueExports, ...serverResult.renders.flatMap(({ covers }) => covers)]);
  const uncovered = Object.entries(serverResult.exportKeys)
    .flatMap(([specifier, names]) => names.map((name) => `${specifier}:${name}`))
    .filter((name) => !covered.has(name));
  if (uncovered.length !== 0) fail('R1_EXIT_PACK_SSR_COVERAGE_MISSING', `runtime exports with no SSR example, fixture, or value check: ${uncovered.join(', ')}`);
  if (!Number.isFinite(serverResult.ssrMilliseconds) || serverResult.ssrMilliseconds > budgets.ssrMilliseconds) {
    fail('R1.5_PACK_PERFORMANCE_BUDGET_EXCEEDED', JSON.stringify({ exampleSsrMilliseconds: serverResult.ssrMilliseconds, budgets }));
  }
  const hydration = runChild('packed hydration', process.execPath, ['hydrate-examples.mjs', 'ssr-result.json', 'hydration-result.json', resolvePinnedTool('jsdom').url], { cwd: consumer, env: developmentEnvironment });
  // The hydration script exits 3 only for mismatches; any other failure is the script's own.
  if (hydration.status === 3) fail('R1_EXIT_PACK_HYDRATION_MISMATCH', childOutput(hydration));
  if (hydration.status !== 0) fail('R1_EXIT_PACK_HYDRATION_SCRIPT_FAILED', childOutput(hydration));
  const hydrationResult = JSON.parse(readFileSync(join(consumer, 'hydration-result.json'), 'utf8'));
  // A variant that rendered nothing hydrates without a mismatch, so require the markup and rows it expects.
  for (const variant of variants) {
    const file = `examples/pattern-${variant.patternSlug}--${variant.variantSlug}.mjs`;
    const render = serverResult.renders.find((candidate) => candidate.file === file);
    const hydrated = hydrationResult.results.find(({ id }) => id === render?.id);
    if (!render || !hydrated) fail('R1_EXIT_PACK_SSR_COVERAGE_MISSING', `${variant.variantId} has no packed render or hydration result`);
    assertPatternVariantMarkup({ variantId: variant.variantId, html: render.html, serverRows: hydrated.serverRows, hydratedRows: hydrated.hydratedRows, fail: (_code, detail) => fail('R1_EXIT_PACK_SSR_VARIANT_EMPTY', detail) });
  }
  const consoleNotes = hydrationResult.results.filter(({ consoleErrors }) => consoleErrors.length !== 0);
  const exportCount = Object.values(serverResult.exportKeys).reduce((sum, names) => sum + names.length, 0);
  console.log(`R1 exit packed SSR/hydration: ${serverResult.renders.length} renders (${planModules.length - 1 - variants.length} component examples, ${variants.length} pattern variants, plus fixtures) cover ${exportCount} runtime exports across ${componentModules.join(', ')}; SSR ${serverResult.ssrMilliseconds.toFixed(2)}ms / ${budgets.ssrMilliseconds}ms; ${hydrationResult.results.length} hydrations without mismatch`);
  for (const { id, consoleErrors } of consoleNotes) console.log(`R1 exit hydration note ${id}: ${consoleErrors[0]}`);

  // Tree-shaking: a Button-only consumer keeps Button's own package modules and their
  // installed dependency closure, nothing else; its stylesheet import must survive.
  const installedPackage = realpathSync(join(consumer, 'node_modules/@muxui/react'));
  const buttonModules = new Set();
  const buttonImports = new Set();
  for (const pending = ['generated/button.js']; pending.length !== 0;) {
    const relative = pending.pop();
    if (buttonModules.has(relative)) continue;
    buttonModules.add(relative);
    for (const [, specifier] of readFileSync(join(installedPackage, relative), 'utf8').matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/gmu)) {
      if (specifier.startsWith('.')) pending.push(posix.join(posix.dirname(relative), specifier));
      else buttonImports.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
    }
  }
  const peerNames = Object.keys(expectedPeerDependencies);
  const buttonPackages = new Set([...buttonImports].filter((name) => !peerNames.includes(name)).flatMap((name) => [
    ...collectInstalledClosure(installedPackage, name, { excludedNames: peerNames }).keys(),
  ]));
  writeFileSync(join(consumer, 'tree-shaking-entry.mjs'), "import '@muxui/react/styles.css';\nimport { Button } from '@muxui/react';\nexport { Button };\n");
  let bundle;
  try {
    bundle = await vite.build({
      root: consumer,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry: join(consumer, 'tree-shaking-entry.mjs'), formats: ['es'], fileName: 'tree-shaking' },
        rollupOptions: { external: [/^react(?:\/|$)/u, /^react-dom(?:\/|$)/u] },
      },
    });
  } catch (error) {
    fail('R1_EXIT_PACK_TREE_SHAKING_FAILED', `bundle failed: ${error.message}`);
  }
  const bundleOutput = [bundle].flat().flatMap(({ output }) => output);
  const bundleModules = bundleOutput
    .filter(({ type }) => type === 'chunk')
    .flatMap(({ modules }) => Object.entries(modules))
    .filter(([, { renderedLength }]) => renderedLength > 0)
    .map(([id, { renderedLength }]) => ({ id, bytes: renderedLength }));
  const packageModule = (id) => (bundledModulePackage(id) === '@muxui/react' ? id.replace(/\\/gu, '/').split('/@muxui/react/').at(-1) : null);
  assertBundleRetention({
    modules: bundleModules,
    required: [{ label: '@muxui/react generated/button.js', test: (id) => packageModule(id) === 'generated/button.js' }],
    forbidden: [
      { label: 'Tiptap editor engine', test: (id) => /^(?:@tiptap\/|prosemirror-)/u.test(bundledModulePackage(id) ?? '') },
      { label: 'Markdown parser', test: (id) => bundledModulePackage(id) === 'marked' },
      { label: 'Motion runtime', test: (id) => ['motion', 'motion-dom', 'motion-utils', 'framer-motion'].includes(bundledModulePackage(id)) },
      { label: 'Lucide', test: (id) => bundledModulePackage(id) === 'lucide-react' },
      { label: 'unrelated @muxui/react modules', test: (id) => packageModule(id) !== null && !buttonModules.has(packageModule(id)) },
      { label: 'packages outside the Button dependency closure', test: (id) => {
        const name = bundledModulePackage(id);
        return name !== null && name !== '@muxui/react' && !buttonPackages.has(name);
      } },
    ],
  });
  const bundleCss = bundleOutput.filter(({ type, fileName }) => type === 'asset' && fileName.endsWith('.css')).map(({ source }) => String(source)).join('\n');
  if (!bundleCss.includes('.muxui-button')) fail('R1_EXIT_PACK_TREE_SHAKING_FAILED', 'the @muxui/react/styles.css import did not survive bundling');
  const bundleBytes = bundleModules.reduce((sum, { bytes }) => sum + bytes, 0);
  console.log(`R1 exit tree-shaking (vite ${viteVersion}, Button only): ${bundleBytes} rendered JS bytes from ${bundleModules.length} modules; @muxui/react keeps only ${[...buttonModules].join(', ')}; packages: ${summarizeBundleModules(bundleModules, 'consumer').map(([name, bytes]) => `${name} ${bytes}`).join(', ')}; stylesheet ${bundleCss.length} bytes kept`);

  // Online clean-consumer install matrix: pnpm, npm, and yarn each install the exact
  // tarball from the public registry with no host configuration or credentials.
  const userConfig = join(temp, 'empty-userconfig');
  const globalConfig = join(temp, 'empty-globalconfig');
  writeFileSync(userConfig, '');
  writeFileSync(globalConfig, '');
  const environment = isolatedPackageManagerEnvironment(process.env, { userConfig, globalConfig });
  const matrixResults = [];
  for (const { name, command, expectedVersion } of packageManagerMatrix()) {
    // Probe outside the repository so Corepack ignores the workspace packageManager pin.
    const probe = runChild(`${name} version probe`, command[0], [...command.slice(1), '--version'], { cwd: temp, env: environment, timeout: 120_000 });
    const version = probe.stdout?.trim();
    if (probe.status !== 0) fail('R1_EXIT_CONSUMER_MATRIX_UNAVAILABLE', `${name}: ${childOutput(probe)}`);
    if (expectedVersion && version !== expectedVersion) fail('R1_EXIT_CONSUMER_MATRIX_UNAVAILABLE', `${name} must be the pinned ${expectedVersion}, found ${version}`);
    const matrixConsumer = join(temp, `matrix-${name}`);
    mkdirSync(matrixConsumer);
    copyFileSync(archive, join(matrixConsumer, candidateArchiveName));
    writeFileSync(join(matrixConsumer, 'package.json'), `${JSON.stringify({
      name: `muxui-r1-exit-${name}-consumer`, private: true, type: 'module',
      dependencies: { '@muxui/react': `file:./${candidateArchiveName}`, react: '19.2.8', 'react-dom': '19.2.8' },
    }, null, 2)}\n`);
    const configCheck = runChild(`${name} config check`, process.execPath, [nodeBundledCli('npm'), 'config', 'get', 'userconfig'], { cwd: matrixConsumer, env: environment, timeout: 60_000 });
    if (configCheck.stdout?.trim() !== userConfig) fail('R1_EXIT_CONSUMER_MATRIX_AUTH_LEAK', `${name} consumer reads ${configCheck.stdout?.trim() || 'an unknown'} user config`);
    const installArgs = {
      pnpm: ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org/'],
      npm: ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'],
      // yarn 1 caches a file: tarball by name and version, so a fresh cache keeps it from
      // installing an earlier build of the same candidate version.
      yarn: ['install', '--ignore-scripts', '--ignore-engines', '--non-interactive', '--no-default-rc', '--cache-folder', join(temp, 'yarn-cache'), '--registry', 'https://registry.npmjs.org/'],
    }[name];
    const install = runChild(`${name} consumer install`, command[0], [...command.slice(1), ...installArgs], { cwd: matrixConsumer, env: environment, timeout: 600_000 });
    if (install.status !== 0) fail('R1_EXIT_CONSUMER_MATRIX_INSTALL_FAILED', `${name} ${version}: ${childOutput(install)}`);
    assertInstalledCandidate(matrixConsumer, '@muxui/react', join(`${archive}-contents`, 'package'));
    copyConsumerTool(matrixConsumer, 'matrix-smoke.mjs');
    const smoke = runChild(`${name} consumer smoke`, process.execPath, ['matrix-smoke.mjs', JSON.stringify(packedManifest.exports)], { cwd: matrixConsumer });
    if (smoke.status !== 0) fail('R1_EXIT_CONSUMER_MATRIX_IMPORT_FAILED', `${name} ${version}: ${childOutput(smoke)}`);
    const smokeResult = JSON.parse(smoke.stdout.trim().split('\n').at(-1));
    const { closure, version: tiptapCore } = checkConsumerGraph(matrixConsumer, `${name} ${version}`);
    matrixResults.push({ packageManager: name, version, tiptapCore, runtimePackages: closure.size });
    console.log(`R1 exit consumer matrix ${name} ${version}: online install, ${smokeResult.imported.length} subpaths imported, ${smokeResult.resolved.length} stylesheets resolved, SSR ${smokeResult.rendered.join(' and ')}, one @tiptap/core ${tiptapCore} across ${closure.size} runtime packages`);
  }

  // The whole tuple, in publish order, as it will be written.
  const tuple = new Map(publishSet.packages.map(({ name }) => {
    const support = supportPackages.find(({ entry }) => entry.name === name);
    return [name, support ?? { archive, archiveBytes, candidateRoot: join(`${archive}-contents`, 'package') }];
  }));

  // Isolated consumer of the whole set: every tarball installs together, every public entry imports, and the
  // renderer descriptor names only members its package really exports (E-P2.1-01 and -02). The set is not on the
  // registry, so the tarballs also stand in for the ranges its members declare on each other.
  const setSpecifiers = Object.fromEntries(publishSet.packages.map(({ name }) => [name, `file:./${tarballFileName(name, versions.get(name))}`]));
  const setConsumer = join(temp, 'consumer-set');
  mkdirSync(setConsumer);
  for (const [name, { archiveBytes: bytes }] of tuple) writeFileSync(join(setConsumer, tarballFileName(name, versions.get(name))), bytes);
  writeFileSync(join(setConsumer, 'package.json'), `${JSON.stringify({
    name: 'muxui-p2-1-set-consumer', private: true, type: 'module',
    dependencies: { ...setSpecifiers, react: '19.2.8', 'react-dom': '19.2.8' },
    pnpm: { overrides: setSpecifiers },
  }, null, 2)}\n`);
  const [setPnpm, ...setPnpmArguments] = pinnedPnpmCommand();
  const setInstall = runChild('publish-set consumer install', setPnpm, [...setPnpmArguments, 'install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org/'], {
    cwd: setConsumer,
    env: environment,
    timeout: 600_000,
  });
  if (setInstall.status !== 0) fail('P2_1_SET_CONSUMER_INSTALL_FAILED', childOutput(setInstall));
  for (const [name, { candidateRoot }] of tuple) assertInstalledCandidate(setConsumer, name, candidateRoot);
  copyConsumerTool(setConsumer, 'set-entries.mjs');
  const setEntries = runChild('publish-set entry imports', process.execPath, ['set-entries.mjs', JSON.stringify(publishSet.packages.map(({ name }) => name))], { cwd: setConsumer });
  if (setEntries.status !== 0) fail('P2_1_SET_CONSUMER_IMPORT_FAILED', childOutput(setEntries));
  const { exportNames, resolved: resolvedEntries } = JSON.parse(setEntries.stdout.trim().split('\n').at(-1));

  const installedReact = join(setConsumer, 'node_modules/@muxui/react');
  const installedDescriptor = JSON.parse(readFileSync(join(installedReact, packedManifest.muxUi.rendererDescriptor), 'utf8'));
  const moduleExports = new Map(Object.entries(exportNames));
  const descriptorProblems = findDescriptorExportProblems(installedDescriptor, moduleExports, { packageName: '@muxui/react' });
  if (descriptorProblems.length !== 0) fail('P2_1_DESCRIPTOR_EXPORT_MISSING', descriptorProblems.join('; '));
  if (installedDescriptor.provenance?.releaseId !== releaseId || installedDescriptor.provenance?.sourceCommit !== sourceRevision) {
    fail('P2_1_DESCRIPTOR_PROVENANCE_INVALID', 'the packed descriptor does not record this release and commit');
  }
  // The audit must stay able to fail: the right member under another subpath is not an export.
  const crossed = structuredClone(installedDescriptor);
  crossed.bindings['muxui:component:button#web.react'].export = '@muxui/react/markdown#Button';
  if (findDescriptorExportProblems(crossed, moduleExports, { packageName: '@muxui/react' }).length !== 1) fail('P2_1_DESCRIPTOR_AUDIT_INERT', '@muxui/react/markdown#Button was accepted');
  console.log(`P2.1 set consumer: ${tuple.size} tarballs installed together, ${Object.keys(exportNames).length} entries imported and ${resolvedEntries.length} resolved, ${Object.keys(installedDescriptor.bindings).length} descriptor bindings export their members`);

  // Rehearse the publish of every tarball in order; npm reports the exact tuple without lifecycle hooks or a registry write.
  for (const [name, { archive: file }] of tuple) {
    const publishDryRun = spawnSync('npm', ['publish', file, '--dry-run', '--registry=https://registry.npmjs.org'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, npm_config_engine_strict: 'false' },
    });
    if (publishDryRun.status !== 0) {
      fail('R1_EXIT_PACK_PUBLISH_DRY_RUN_FAILED', `${name}: ${publishDryRun.stderr || publishDryRun.stdout}`);
    }
    if (!publishDryRun.stdout.includes(`+ ${name}@${versions.get(name)}`)) {
      fail('R1_EXIT_PACK_PUBLISH_DRY_RUN_FAILED', `npm did not report ${name}@${versions.get(name)}`);
    }
  }
  console.log(`R1 exit npm publish dry-run passed for ${[...tuple.keys()].join(', ')} without lifecycle hooks or registry mutation`);

  // The retained evidence is validated as the checkout holds it (fail closed); the manifest binds it as committed.
  readRetainedEvidence(repositoryRoot, RETAINED_EVIDENCE_MILESTONES);
  readRetainedReviewEvidence(repositoryRoot);
  const readCommitted = committedFileReader(sourceRevision, repositoryRoot);
  // The manifest recomputes the React correlation from the tarballs and the committed lockfile and token source.
  const releaseManifest = buildPortfolioManifest({
    publishSet,
    artifacts: new Map([...tuple].map(([name, { archiveBytes: bytes }]) => [name, bytes])),
    source: { revision: sourceRevision, tree: sourceTree },
    readCommitted,
    // Which checks stand behind this candidate, and what the consumer proofs saw (Decision 0030). Not part of the digest.
    preparation: {
      ...derivePreparation(process.env, sourceRevision),
      tool: { path: preparationToolPath, sha256: `sha256:${sha256(readFileSync(resolve(repositoryRoot, preparationToolPath)))}` },
      verification: {
        reactOnlineMatrix: matrixResults,
        publishSetConsumer: { packageManager: 'pnpm', entriesImported: Object.keys(exportNames).length, entriesResolved: resolvedEntries.length },
        warnings: { duplicateDependencyVersions: duplicateVersionWarnings },
      },
    },
  });
  // The retained indexes and the lockfile were read from the worktree for validation; bind them to the commit.
  assertSourceIdentity(sourceRevision, 'after release correlation');
  const { react, evidence } = releaseManifest;
  console.log(`R1 exit correlation: ${react.bindings.length} binding-spec revisions, ${react.generatedOutputs.entries.length} generated outputs, ${evidence.capturedCiEvidence.length} captured CI evidence indexes, ${evidence.retainedReviewEvidence.length} retained review evidence index, visual contract ${react.visualContract.digest}`);
  const outputDirectory = mkdtempSync(join(tmpdir(), 'muxui-r1-exit-output-'));
  for (const [name, { archiveBytes: bytes }] of tuple) writeFileSync(join(outputDirectory, tarballFileName(name, versions.get(name))), bytes);
  writeFileSync(join(outputDirectory, PORTFOLIO_MANIFEST_FILE), `${canonicalJson(releaseManifest)}\n`);
  // What was written, read back, must verify as the release this commit prepares.
  verifyPortfolioRelease({
    manifest: JSON.parse(readFileSync(join(outputDirectory, PORTFOLIO_MANIFEST_FILE), 'utf8')),
    artifacts: new Map(publishSet.packages.map(({ name }) => [name, readFileSync(join(outputDirectory, tarballFileName(name, versions.get(name))))])),
    publishSet,
    expected: { revision: sourceRevision, tree: sourceTree },
    readCommitted,
  });
  for (const [name, { archiveBytes: bytes }] of tuple) {
    if (statSync(join(outputDirectory, tarballFileName(name, versions.get(name)))).size !== bytes.length) {
      fail('R1_EXIT_ARTIFACT_WRITE_FAILED', `${name} tarball size changed after persistence`);
    }
  }
  console.log(`R1 exit artifacts written to ${outputDirectory}`);
  console.log(JSON.stringify(releaseManifest));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`R1 exit release preparation passed for ${publishSet.packages.map(({ name }) => `${name}@${versions.get(name)}`).join(', ')}; the sources remain private and unpublished.`);
