import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  assertBundleRetention,
  assertExactArchiveEntries,
  assertExactDependencyGraph,
  assertExactExportList,
  assertPackedFileBoundary,
  assertNoPublicSurfaceLeaks,
  assertSingleInstalledVersion,
  assertStylesheetAssetUrls,
  bundledModulePackage,
  collectInstalledClosure,
  createUpstreamNameMatcher,
  deriveCurrentExportSurface,
  deriveExpectedPackageEntries,
  readGeneratedOutputNames,
  summarizeBundleModules,
} from './release-proof.mjs';
import { discoverWorkspacePackages } from './workspace-packages.mjs';
import { readSupplementalMapping } from '../../../../packages/react/src/supplemental-mapping.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packages = await discoverWorkspacePackages(repositoryRoot);
const reactVersionPattern = /^0\.1\.0-alpha\.(?:0|[1-9]\d*)$/u;
const candidateVersion = '0.1.0-rc.1';
const candidateArchiveName = `muxui-react-${candidateVersion}.tgz`;
const candidateManifestName = `muxui-react-${candidateVersion}.release-manifest.json`;
// Rollback fixes forward with the next rc, so later candidates name the right successor.
const candidateRc = /^(?<base>\d+\.\d+\.\d+)-rc\.(?<rc>\d+)$/u.exec(candidateVersion)?.groups;
if (!candidateRc) throw new Error(`R1_EXIT_CANDIDATE_VERSION_INVALID: ${candidateVersion} is not an rc version`);
const fixForwardVersion = `${candidateRc.base}-rc.${Number(candidateRc.rc) + 1}`;
const preparationToolPath = 'tooling/audits/repository-policy/src/release-prepare.mjs';
const r15Closure = JSON.parse(readFileSync(resolve(repositoryRoot, 'catalog/react-r1-5/closure.json'), 'utf8'));
const documentedSupportingExports = ['ToastProvider', 'useToast', 'useCommandPalette'];
const expectedPeerDependencies = {
  react: '>=19.2.0 <20',
  'react-dom': '>=19.2.0 <20',
};
// Only stylesheets have import-time effects, so bundlers may drop unused JS modules.
const expectedSideEffects = ['*.css'];
const expectedCandidatePublishConfig = {
  access: 'public',
  tag: 'next',
  registry: 'https://registry.npmjs.org',
};
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

function assertSingleTiptapCore(consumer, label) {
  const closure = collectInstalledClosure(consumer, '@muxui/react', { excludedNames: Object.keys(expectedPeerDependencies) });
  const version = assertSingleInstalledVersion(closure, '@tiptap/core', 'R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW');
  const skewed = [...closure].filter(([name, versions]) => name.startsWith('@tiptap/') && versions.length > 1);
  if (skewed.length !== 0) {
    console.log(`${label}: note, other Tiptap packages resolve to several versions: ${skewed.map(([name, versions]) => `${name}@${versions.join('|')}`).join(', ')}`);
  }
  return { closure, version };
}

// Resolves a proof tool pinned by the React package's devDependencies, so release
// proof adds no dependency and the clean consumers keep only the packed runtime graph.
function resolvePinnedTool(name) {
  const requireFromReact = createRequire(join(reactPackageRoot, 'package.json'));
  const manifestPath = requireFromReact.resolve(`${name}/package.json`);
  const toolManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (toolManifest.version !== manifest.devDependencies?.[name]) {
    fail('R1_EXIT_PACK_PROOF_TOOL_UNAVAILABLE', `expected the pinned ${name} ${manifest.devDependencies?.[name]}, found ${toolManifest.version}`);
  }
  const entry = toolManifest.exports?.['.'];
  const relative = typeof entry === 'string' ? entry : entry?.import ?? entry?.default ?? toolManifest.main;
  return { version: toolManifest.version, url: pathToFileURL(join(dirname(manifestPath), relative)).href };
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

// Drops the npm_* script context (and any npm token) that `pnpm release:prepare` exports,
// so each clean consumer installs with its package manager's own defaults.
function cleanPackageManagerEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:npm_|PNPM_SCRIPT_SRC_DIR$|INIT_CWD$)/iu.test(name)));
}

function packageManagerCandidates() {
  const execPath = process.env.npm_execpath ?? '';
  const pnpm = /pnpm/iu.test(execPath) ? [process.execPath, execPath] : ['pnpm'];
  return [
    { name: 'pnpm', command: pnpm },
    { name: 'npm', command: ['npm'] },
    { name: 'yarn', command: ['yarn'] },
  ];
}

function runPackageManager(command, args, options) {
  return spawnSync(command[0], [...command.slice(1), ...args], { encoding: 'utf8', stdio: 'pipe', ...options });
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

function rewriteGeneratedVersion(source, fromVersion, toVersion) {
  const lines = source.split('\n');
  if (source.startsWith('/* @generated-from:')) {
    const body = lines.slice(3).join('\n').replaceAll(fromVersion, toVersion);
    const digest = sha256(` */\n${body}`);
    lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${digest}`);
    return `${lines.slice(0, 3).join('\n')}\n${body}`;
  }
  if (source.startsWith('// @generated-from:') || source.startsWith('<!-- @generated-from:')) {
    const body = lines.slice(2).join('\n').replaceAll(fromVersion, toVersion);
    const digest = sha256(body);
    lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${digest}`);
    return `${lines.slice(0, 2).join('\n')}\n${body}`;
  }
  return source.replaceAll(fromVersion, toVersion);
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

function rewriteProvenance(source, target, fromVersion, toVersion) {
  const lines = source.split('\n');
  const body = lines.slice(2).join('\n');
  const declaration = JSON.parse(body);
  declaration.sha256 = `sha256:${sha256(target)}`;
  const rewrittenBody = JSON.stringify(declaration).replaceAll(fromVersion, toVersion) + '\n';
  lines[1] = lines[1].replace(/sha256:[0-9a-f]+/u, `sha256:${sha256(rewrittenBody)}`);
  return `${lines.slice(0, 2).join('\n')}\n${rewrittenBody}`;
}

function writeString(buffer, value, offset, length) {
  buffer.write(String(value).slice(0, length), offset, length, 'utf8');
}

function octal(value, length) {
  const digits = Math.max(0, length - 1);
  return `${Number(value).toString(8).padStart(digits, '0')}\0`;
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  writeString(header, path, 0, 100);
  writeString(header, octal(0o644, 8), 100, 8);
  writeString(header, octal(0, 8), 108, 8);
  writeString(header, octal(0, 8), 116, 8);
  writeString(header, octal(size, 12), 124, 12);
  writeString(header, octal(0, 12), 136, 12);
  header.fill(0x20, 148, 156);
  writeString(header, '0', 156, 1);
  writeString(header, 'ustar\0', 257, 6);
  writeString(header, '00', 263, 2);
  const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
  writeString(header, `${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return header;
}

function packageFiles(packageRoot, prefix = 'package') {
  return readdirSync(packageRoot, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const absolute = join(packageRoot, entry.name);
      const archivePath = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return packageFiles(absolute, archivePath);
      if (!entry.isFile()) fail('R1_EXIT_PACK_CONTENT_INVALID', archivePath);
      return [{ absolute, archivePath }];
    });
}

function deterministicArchive(packageRoot) {
  const chunks = [];
  for (const { absolute, archivePath } of packageFiles(packageRoot)) {
    const bytes = readFileSync(absolute);
    chunks.push(tarHeader(archivePath, bytes.length), bytes);
    const remainder = bytes.length % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
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
const publishable = packages.filter(({ manifest }) => manifest.private !== true);

if (publishable.length !== 0) {
  console.error(
    `FOUNDATION_RELEASE_FORBIDDEN: packages cannot become publishable before an exact external publish authorization: ${publishable.map(({ name }) => name).join(', ')}`,
  );
  process.exit(1);
}

if (reactCandidate.length !== 1) {
  console.error('R1_EXIT_PUBLICATION_GUARD_INVALID: exactly one private R1.5 React source candidate is required');
  process.exit(1);
}

const reactPackage = reactCandidate[0];
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

const temp = mkdtempSync(join(tmpdir(), 'muxui-r1-5-release-'));
try {
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
  const candidateManifest = JSON.parse(readFileSync(join(candidatePackage, 'package.json'), 'utf8'));
  candidateManifest.version = candidateVersion;
  candidateManifest.private = false;
  candidateManifest.scripts = { ...candidateManifest.scripts };
  delete candidateManifest.scripts.prepack;
  delete candidateManifest.scripts.prepublishOnly;
  candidateManifest.publishConfig = expectedCandidatePublishConfig;
  writeFileSync(join(candidatePackage, 'package.json'), `${JSON.stringify(sortedJsonValue(candidateManifest), null, 2)}\n`);
  for (const entry of expectedGeneratedEntries) {
    const relative = entry.slice('package/'.length);
    if (relative.endsWith('.provenance')) continue;
    const path = join(candidatePackage, relative);
    const original = readFileSync(path, 'utf8');
    let rewritten = rewriteGeneratedVersion(original, manifest.version, candidateVersion);
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
    } else if (relative === 'generated/compatibility.mjs') {
      rewritten = rewriteGeneratedBody(rewritten, (body) => {
        const publication = '"publication":{"candidateVersion":"0.1.0-rc.1","private":true,"requires":["explicit external publish authorization"],"status":"disabled"}';
        const preparedPublication = '"publication":{"candidateVersion":"0.1.0-rc.1","private":false,"requires":["explicit external publish authorization"],"status":"prepared","mutationPerformed":false}';
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
    writeFileSync(path, rewriteProvenance(original, target, manifest.version, candidateVersion));
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
    || packedManifest.scripts?.prepack !== undefined
    || packedManifest.scripts?.prepublishOnly !== undefined
    || stableJson(packedManifest.publishConfig) !== stableJson(expectedCandidatePublishConfig)) {
    fail('R1_EXIT_PACK_MANIFEST_INVALID', 'name, version, privacy, runtime graph, peers, exports, files, side effects, lifecycle, or publish config drifted');
  }
  const packedManifestText = JSON.stringify(packedManifest);
  for (const forbidden of ['workspace:', '@muxui/web']) {
    if (packedManifestText.includes(forbidden)) fail('R1.5_PACK_MANIFEST_INVALID', `forbidden package reference: ${forbidden}`);
  }

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
    '"publication":{"candidateVersion":"0.1.0-rc.1","private":false,"requires":["explicit external publish authorization"],"status":"prepared","mutationPerformed":false}',
    'R1_EXIT_PACK_RELEASE_METADATA_INVALID',
  );
  const metadataFailures = [
    ['dependencies', stableJson(release.packageDependencies) === stableJson(expectedRuntimeDependencies)],
    ['peers', stableJson(release.peerDependencies) === stableJson(expectedPeerDependencies)],
    ['exports', stableJson(release.packageExports) === stableJson(manifest.exports)],
    ['files', stableJson(release.packageFiles) === stableJson(manifest.files)],
    ['schema', release.publicationPreparation?.schema === 'muxui-r1-exit-publication-preparation-v1'],
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
  assertIncludes(readme, '@muxui/react@0.1.0-rc.1', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, 'next', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(notice, 'Copyright (c) 2025 Andrew', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Lucide', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Copyright (c) 2013-present Cole Bemis', 'R1.5_PACK_NOTICE_INVALID');
  for (const name of currentComponentExports) {
    const slug = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    assertIncludes(styles, `.muxui-${slug}`, 'R1.5_PACK_STYLE_MISSING');
  }

  const consumer = join(temp, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({
    name: 'muxui-r1-5-clean-consumer', private: true, type: 'module',
    dependencies: { '@muxui/react': `file:../muxui-react-${candidateVersion}.tgz`, react: '19.2.8', 'react-dom': '19.2.8' },
  }, null, 2)}\n`);
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  if (install.status !== 0) fail('R1.5_PACK_CONSUMER_INSTALL_FAILED', tail(install.stderr || install.stdout));

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
    await import(new URL('./fields.mjs', packageEntry));
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
  const consumerCheck = spawnSync(process.execPath, ['--input-type=module', '--eval', consumerScript], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: 'pipe',
  });
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
  const offlineGraph = assertSingleTiptapCore(consumer, 'R1 exit offline consumer');
  console.log(`R1 exit offline consumer resolves @tiptap/core ${offlineGraph.version} across ${offlineGraph.closure.size} runtime packages`);

  // Public declaration surface, re-exports, and generated guidance name no upstream package.
  const upstreamNames = [...requiredUpstreamNames, ...[...offlineGraph.closure.keys()].filter((name) => name !== '@muxui/react')];
  const generatedEntries = entries.filter((entry) => entry.startsWith('package/generated/'));
  const publicJsTargets = Object.values(packedManifest.exports)
    .map((target) => (typeof target === 'string' ? target : target.default))
    .filter((target) => target.endsWith('.mjs'))
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
  for (const file of ['render-examples.mjs', 'hydrate-examples.mjs', 'export-fixtures.mjs']) copyConsumerTool(consumer, file);
  planModules.push({ file: 'export-fixtures.mjs', components: ['ToastFixture', 'LightboxPartsFixture'] });
  const componentModules = ['@muxui/react', ...new Set(isolatedExportModules.map((entry) => `@muxui/react/${entry.split(':')[1].slice(2)}`))];
  writeFileSync(join(consumer, 'ssr-plan.json'), `${JSON.stringify({
    modules: planModules,
    exportModules: componentModules,
    valueChecks: { file: 'export-fixtures.mjs', name: 'checkValueExports' },
  })}\n`);
  const serverRender = spawnSync(process.execPath, ['render-examples.mjs', 'ssr-plan.json', 'ssr-result.json'], { cwd: consumer, encoding: 'utf8', stdio: 'pipe' });
  if (serverRender.status !== 0) fail('R1_EXIT_PACK_SSR_FAILED', tail(serverRender.stderr || serverRender.stdout || `exited with ${serverRender.signal ?? serverRender.status}`));
  const serverResult = JSON.parse(readFileSync(join(consumer, 'ssr-result.json'), 'utf8'));
  const covered = new Set([...exampleCoverage, ...serverResult.valueExports, ...serverResult.renders.flatMap(({ covers }) => covers)]);
  const uncovered = Object.entries(serverResult.exportKeys)
    .flatMap(([specifier, names]) => names.map((name) => `${specifier}:${name}`))
    .filter((name) => !covered.has(name));
  if (uncovered.length !== 0) fail('R1_EXIT_PACK_SSR_COVERAGE_MISSING', `runtime exports with no SSR example, fixture, or value check: ${uncovered.join(', ')}`);
  if (!Number.isFinite(serverResult.ssrMilliseconds) || serverResult.ssrMilliseconds > budgets.ssrMilliseconds) {
    fail('R1.5_PACK_PERFORMANCE_BUDGET_EXCEEDED', JSON.stringify({ exampleSsrMilliseconds: serverResult.ssrMilliseconds, budgets }));
  }
  const hydration = spawnSync(process.execPath, ['hydrate-examples.mjs', 'ssr-result.json', 'hydration-result.json', resolvePinnedTool('jsdom').url], { cwd: consumer, encoding: 'utf8', stdio: 'pipe' });
  if (hydration.status !== 0) fail('R1_EXIT_PACK_HYDRATION_MISMATCH', tail(hydration.stderr || hydration.stdout || `exited with ${hydration.signal ?? hydration.status}`));
  const hydrationResult = JSON.parse(readFileSync(join(consumer, 'hydration-result.json'), 'utf8'));
  const consoleNotes = hydrationResult.results.filter(({ consoleErrors }) => consoleErrors.length !== 0);
  const exportCount = Object.values(serverResult.exportKeys).reduce((sum, names) => sum + names.length, 0);
  console.log(`R1 exit packed SSR/hydration: ${serverResult.renders.length} renders (${planModules.length - 1} catalog examples plus fixtures) cover ${exportCount} runtime exports across ${componentModules.join(', ')}; SSR ${serverResult.ssrMilliseconds.toFixed(2)}ms / ${budgets.ssrMilliseconds}ms; ${hydrationResult.results.length} hydrations without mismatch`);
  for (const { id, consoleErrors } of consoleNotes) console.log(`R1 exit hydration note ${id}: ${consoleErrors[0]}`);

  // Tree-shaking: a Button-only consumer keeps Button's own package modules and their
  // installed dependency closure, nothing else; its stylesheet import must survive.
  const installedPackage = realpathSync(join(consumer, 'node_modules/@muxui/react'));
  const buttonModules = new Set();
  const buttonImports = new Set();
  for (const pending = ['generated/button.mjs']; pending.length !== 0;) {
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
    required: [{ label: '@muxui/react generated/button.mjs', test: (id) => packageModule(id) === 'generated/button.mjs' }],
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

  // Online clean-consumer install matrix: each available package manager installs the exact tarball from the public registry.
  for (const { name, command } of packageManagerCandidates()) {
    const environment = { ...cleanPackageManagerEnvironment(), npm_config_engine_strict: 'false' };
    // Probe outside the repository so a Corepack shim ignores the workspace packageManager pin.
    const probe = runPackageManager(command, ['--version'], { cwd: temp, env: environment });
    if (probe.status !== 0 || probe.error) {
      if (name === 'pnpm') fail('R1_EXIT_CONSUMER_MATRIX_UNAVAILABLE', 'pnpm is required for the online consumer matrix');
      console.log(`R1 exit consumer matrix ${name}: skipped; ${name} is not available (${probe.error?.code ?? tail(probe.stderr || probe.stdout, 200).trim()})`);
      continue;
    }
    const version = probe.stdout.trim();
    const matrixConsumer = join(temp, `matrix-${name}`);
    mkdirSync(matrixConsumer);
    copyFileSync(archive, join(matrixConsumer, candidateArchiveName));
    writeFileSync(join(matrixConsumer, 'package.json'), `${JSON.stringify({
      name: `muxui-r1-exit-${name}-consumer`, private: true, type: 'module',
      dependencies: { '@muxui/react': `file:./${candidateArchiveName}`, react: '19.2.8', 'react-dom': '19.2.8' },
    }, null, 2)}\n`);
    let installArgs;
    if (name === 'pnpm') installArgs = ['install', '--ignore-scripts', '--no-frozen-lockfile', '--registry=https://registry.npmjs.org/'];
    else if (name === 'npm') installArgs = ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'];
    else if (Number.parseInt(version, 10) >= 2) {
      writeFileSync(join(matrixConsumer, '.yarnrc.yml'), 'nodeLinker: node-modules\nenableScripts: false\nenableTelemetry: false\nenableImmutableInstalls: false\nnpmRegistryServer: "https://registry.npmjs.org"\n');
      writeFileSync(join(matrixConsumer, 'yarn.lock'), '');
      installArgs = ['install'];
    } else installArgs = ['install', '--ignore-scripts', '--ignore-engines', '--non-interactive', '--registry', 'https://registry.npmjs.org/'];
    const install = runPackageManager(command, installArgs, { cwd: matrixConsumer, env: environment, timeout: 600_000 });
    if (install.status !== 0) fail('R1_EXIT_CONSUMER_MATRIX_INSTALL_FAILED', `${name} ${version}: ${tail(install.error?.message || install.stderr || install.stdout)}`);
    copyConsumerTool(matrixConsumer, 'matrix-smoke.mjs');
    const smoke = spawnSync(process.execPath, ['matrix-smoke.mjs', JSON.stringify(packedManifest.exports)], { cwd: matrixConsumer, encoding: 'utf8', stdio: 'pipe' });
    if (smoke.status !== 0) fail('R1_EXIT_CONSUMER_MATRIX_IMPORT_FAILED', `${name} ${version}: ${tail(smoke.stderr || smoke.stdout)}`);
    const smokeResult = JSON.parse(smoke.stdout.trim().split('\n').at(-1));
    const { closure, version: tiptapCore } = assertSingleTiptapCore(matrixConsumer, `R1 exit consumer matrix ${name}`);
    console.log(`R1 exit consumer matrix ${name} ${version}: online install, ${smokeResult.imported.length} subpaths imported, ${smokeResult.resolved.length} stylesheets resolved, SSR ${smokeResult.rendered.join(' and ')}, one @tiptap/core ${tiptapCore} across ${closure.size} runtime packages`);
  }

  const publishDryRun = spawnSync('npm', ['publish', archive, '--dry-run', '--registry=https://registry.npmjs.org'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  if (publishDryRun.status !== 0) {
    fail('R1_EXIT_PACK_PUBLISH_DRY_RUN_FAILED', publishDryRun.stderr || publishDryRun.stdout);
  }
  if (!publishDryRun.stdout.includes(`+ @muxui/react@${candidateVersion}`)) {
    fail('R1_EXIT_PACK_PUBLISH_DRY_RUN_FAILED', 'npm did not report the exact candidate package tuple');
  }
  console.log('R1 exit npm publish dry-run passed without lifecycle hooks or registry mutation');

  const releaseManifest = {
    schema: 'muxui-r1-exit-publication-preparation-v1',
    package: {
      name: packedManifest.name,
      version: packedManifest.version,
      private: packedManifest.private,
      dependencies: packedManifest.dependencies,
      peerDependencies: packedManifest.peerDependencies,
      exports: packedManifest.exports,
      files: packedManifest.files,
      publishConfig: packedManifest.publishConfig,
      componentExports: currentComponentExports,
      supportingExports: documentedSupportingExports,
      publicExports: currentPublicExports,
    },
    source: {
      path: 'packages/react',
      revision: sourceRevision,
      version: manifest.version,
      private: manifest.private,
      generatedFrom: ['packages/react/src/generate.mjs', 'catalog/react-r1-5/closure.json'],
      preparationTool: {
        path: preparationToolPath,
        sha256: `sha256:${sha256(readFileSync(resolve(repositoryRoot, preparationToolPath)))}`,
      },
      provenance: {
        intent: 'source, generated projections, and provenance sidecars are correlated; registry provenance is not claimed by local preparation',
        generatedEntries: expectedGeneratedEntries,
      },
    },
    artifact: {
      file: candidateArchiveName,
      bytes: archiveBytes.length,
      sha256: `sha256:${sha256(archiveBytes)}`,
      shasum: sha1(archiveBytes),
      integrity: integrity(archiveBytes),
      compression: 'gzip',
    },
    files: expectedPackageEntries,
    guidance: {
      descriptor: { path: 'generated/descriptor.json', version: descriptor.version, exports: descriptor.exports.length },
      release: { path: 'generated/release.json', version: release.version, exports: release.componentExports.length },
      compatibility: { path: 'generated/compatibility.mjs', version: candidateVersion },
      readme: { path: 'README.md', candidateVersion, distTag: 'next' },
      correlation: 'all generated/package guidance resolves to the exact candidate package tuple',
    },
    publication: {
      status: 'prepared',
      registry: 'https://registry.npmjs.org',
      distTag: 'next',
      authorization: 'required-external-human-authorization',
      command: 'npm publish <candidate-tarball> --tag next --access public --provenance --registry=https://registry.npmjs.org',
      provenance: 'required-at-publication',
      mutationPerformed: false,
    },
    preflight: {
      status: 'required-before-publication',
      registry: 'https://registry.npmjs.org',
      checks: [
        {
          name: 'namespace ownership',
          command: 'npm whoami --registry=https://registry.npmjs.org',
          status: 'pending',
          policy: 'the authenticated publisher must be authorized for @muxui/react',
        },
        {
          name: 'version collision',
          command: `npm view @muxui/react@${candidateVersion} version --registry=https://registry.npmjs.org`,
          status: 'pending',
          policy: 'an existing version is a hard stop; never overwrite or republish it',
        },
        {
          name: 'next dist-tag collision',
          command: 'npm view @muxui/react dist-tags --json --registry=https://registry.npmjs.org',
          status: 'pending',
          policy: 'for a first publish, expect E404 because the package is absent; any existing next or latest is a hard stop for review',
          laterPublish: 'only after a prior publication, record the prior next pointer before any separately authorized mutation',
        },
        {
          name: 'publish authorization drift',
          command: 'npm whoami --registry=https://registry.npmjs.org',
          status: 'pending',
          policy: 'recheck identity immediately before npm publish and stop on drift',
        },
      ],
      mutationPerformed: false,
    },
    evidence: {
      'E-R1-EXIT-01': {
        status: 'candidate-prepared',
        assertion: 'exact tarball, dependency/export/file tuple, generated guidance, offline install/import, and SSR pass',
      },
      'E-R1-EXIT-02': {
        status: 'partial-prepublication',
        assertion: 'sha256, npm shasum, integrity, source revision, and preparation-tool identity are recorded; registry provenance remains pending',
      },
      'E-R1-EXIT-03': {
        status: 'pending-post-publication',
        assertion: 'requires a separately authorized npm publication and clean published-package consumer verification',
      },
      'E-R1-EXIT-04': {
        status: 'pending-post-publication',
        assertion: 'next dist-tag observation; rollback prepared, not exercised: verifies next, confirms latest is not claimed, and confirms the fix-forward path is ready',
      },
    },
    rollback: {
      status: 'prepared-not-exercised',
      trigger: ['published consumer verification failure', 'integrity/provenance mismatch'],
      steps: [
        `stop further publication and preserve the immutable ${candidateVersion} version and manifest`,
        `with Andrew's separate explicit authorization, run npm deprecate on @muxui/react@${candidateVersion} with a message naming the failure and its fixed successor`,
        `fix forward by publishing a corrected ${fixForwardVersion} to next through a separately authorized publication`,
        `optional, only after ${fixForwardVersion} is verified and with Andrew's separate explicit authorization at the time: re-point latest from the deprecated ${candidateVersion} to ${fixForwardVersion}`,
        'retain the candidate artifact and failed verification for audit; latest is otherwise not claimed or promoted (the registry sets latest on first publish) and stable is not promoted',
      ],
      forbidden: [
        'overwrite or republish the immutable package version',
        'unpublish, except for a security or legal problem inside the npm 72-hour no-dependents window with explicit human authorization',
        `claim or promote latest, other than the separately authorized fix-forward re-point from ${candidateVersion} to ${fixForwardVersion}; the registry sets latest on first publish`,
        'promote stable support',
      ],
    },
  };
  const outputDirectory = mkdtempSync(join(tmpdir(), 'muxui-r1-exit-output-'));
  writeFileSync(join(outputDirectory, candidateArchiveName), archiveBytes);
  writeFileSync(join(outputDirectory, candidateManifestName), `${JSON.stringify(releaseManifest)}\n`);
  if (statSync(join(outputDirectory, candidateArchiveName)).size !== archiveBytes.length) {
    fail('R1_EXIT_ARTIFACT_WRITE_FAILED', 'candidate tarball size changed after persistence');
  }
  console.log(`R1 exit artifacts written to ${outputDirectory}`);
  console.log(JSON.stringify(releaseManifest));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`R1 exit release preparation passed for ${candidateVersion}; source @muxui/react remains private and unpublished.`);
