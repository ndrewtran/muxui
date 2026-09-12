import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { discoverWorkspacePackages } from './workspace-packages.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packages = await discoverWorkspacePackages(repositoryRoot);
const reactVersionPattern = /^0\.1\.0-alpha\.(?:0|[1-9]\d*)$/u;
const candidateVersion = '0.1.0-rc.1';
const candidateArchiveName = `muxui-react-${candidateVersion}.tgz`;
const candidateManifestName = `muxui-react-${candidateVersion}.release-manifest.json`;
const preparationToolPath = 'tooling/audits/repository-policy/src/release-prepare.mjs';
const r15Closure = JSON.parse(readFileSync(resolve(repositoryRoot, 'catalog/react-r1-5/closure.json'), 'utf8'));
const deliveredExports = [
  'Button', 'Breadcrumbs', 'Checkbox', 'Disclosure', 'DisclosureGroup', 'Group',
  'Link', 'Meter', 'ProgressBar', 'Separator', 'ToggleButton',
  'Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker',
  'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField',
  'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch',
  'ColorSwatchPicker', 'ColorWheel', 'ComboBox', 'GridList', 'ListBox', 'Menu',
  'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup',
  'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tree', 'Virtualizer',
  'DropZone', 'FileTrigger', 'Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip',
];
const supportingExports = ['ToastProvider', 'useToast'];
const expectedRuntimeDependencies = {
  '@internationalized/date': '3.12.3',
  'lucide-react': '1.37.0',
  'react-aria-components': '1.20.0',
};
const expectedPeerDependencies = {
  react: '>=19.2.0 <20',
  'react-dom': '>=19.2.0 <20',
};
const expectedCandidatePublishConfig = {
  access: 'public',
  tag: 'next',
  registry: 'https://registry.npmjs.org',
};
const expectedGeneratedEntries = [
  'package/generated/button.mjs',
  'package/generated/compatibility.mjs',
  'package/generated/choice-context.mjs',
  'package/generated/components.mjs',
  'package/generated/collections.mjs',
  'package/generated/descriptor.json',
  'package/generated/descriptor.json.provenance',
  'package/generated/fields.mjs',
  'package/generated/index.d.ts',
  'package/generated/index.mjs',
  'package/generated/lightbox.d.ts',
  'package/generated/lightbox.mjs',
  'package/generated/markdown.d.ts',
  'package/generated/markdown.mjs',
  'package/generated/overlays.mjs',
  'package/generated/r1-5-closure.json',
  'package/generated/r1-5-closure.json.provenance',
  'package/generated/r1-6-contract.json',
  'package/generated/r1-6-contract.json.provenance',
  'package/generated/release.json',
  'package/generated/release.json.provenance',
  'package/generated/resizable.d.ts',
  'package/generated/resizable.mjs',
  'package/generated/styles.css',
  'package/generated/supplemental.css',
  'package/generated/supplemental.d.ts',
  'package/generated/supplemental.mjs',
  'package/generated/testing.mjs',
  'package/generated/text-editor.d.ts',
  'package/generated/text-editor.mjs',
  'package/generated/toggle-button-context.mjs',
];
const expectedPackageEntries = [
  ...expectedGeneratedEntries,
  'package/LICENSE',
  'package/NOTICE',
  'package/README.md',
  'package/package.json',
];

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
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

function readArchiveFile(archive, path) {
  const result = spawnSync('tar', ['-xOzf', archive, path], { encoding: 'utf8' });
  if (result.status !== 0) fail('R1.5_PACK_CONTENT_MISSING', path);
  return result.stdout;
}

function parseGeneratedJson(source) {
  return JSON.parse(source.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
}

function equalEntries(actual, expected) {
  return actual.length === expected.length
    && actual.every((entry, index) => entry === expected[index]);
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

const sourceRevisionResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
const sourceStatusResult = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
if (sourceRevisionResult.status !== 0 || sourceStatusResult.status !== 0) {
  fail('R1_EXIT_SOURCE_IDENTITY_UNAVAILABLE', sourceRevisionResult.stderr || sourceStatusResult.stderr);
}
if (sourceStatusResult.stdout.trim() !== '') {
  fail('R1_EXIT_DIRTY_WORKTREE', 'commit the complete candidate before creating its exact release artifact');
}
const sourceRevision = sourceRevisionResult.stdout.trim();

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
  const expectedEntries = [...expectedPackageEntries].sort();
  if (!equalEntries(entries, expectedEntries)) {
    fail('R1.5_PACK_CONTENT_INVALID', `expected ${expectedEntries.join(', ')}, received ${entries.join(', ')}`);
  }
  if (entries.some((entry) => entry.startsWith('package/src/') || entry.startsWith('package/test/'))) {
    fail('R1.5_PACK_PRIVATE_SOURCE_LEAK', 'private source or tests entered the archive');
  }

  const packedManifest = JSON.parse(readArchiveFile(archive, 'package/package.json'));
  if (packedManifest.name !== '@muxui/react'
    || packedManifest.version !== candidateVersion
    || packedManifest.private !== false
    || stableJson(packedManifest.dependencies) !== stableJson(expectedRuntimeDependencies)
    || stableJson(packedManifest.peerDependencies) !== stableJson(expectedPeerDependencies)
    || stableJson(packedManifest.exports) !== stableJson(manifest.exports)
    || stableJson(packedManifest.files) !== stableJson(manifest.files)
    || packedManifest.scripts?.prepack !== undefined
    || packedManifest.scripts?.prepublishOnly !== undefined
    || stableJson(packedManifest.publishConfig) !== stableJson(expectedCandidatePublishConfig)) {
    fail('R1_EXIT_PACK_MANIFEST_INVALID', 'name, version, privacy, runtime graph, peers, exports, files, lifecycle, or publish config drifted');
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
  if (!equalEntries(deliveredExports, descriptor.bindings.map(({ export: name }) => name))
    || !equalEntries(deliveredExports, release.componentExports.map(({ name }) => name))
    || closure.families?.length !== 53
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
  for (const name of [...deliveredExports, ...supportingExports]) assertIncludes(readme, name, 'R1.5_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, 'web.react', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, '@muxui/react@0.1.0-rc.1', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(readme, 'next', 'R1_EXIT_PACK_GUIDANCE_MISSING');
  assertIncludes(notice, 'Copyright (c) 2025 Andrew', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Lucide', 'R1.5_PACK_NOTICE_INVALID');
  assertIncludes(notice, 'Copyright (c) 2013-present Cole Bemis', 'R1.5_PACK_NOTICE_INVALID');
  for (const name of deliveredExports) {
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
  if (install.status !== 0) fail('R1.5_PACK_CONSUMER_INSTALL_FAILED', install.stderr);

  const consumerScript = `
    import { performance } from 'node:perf_hooks';
    import React from 'react';
    import {renderToString} from 'react-dom/server';
    const importStarted = performance.now();
    const entry = await import('@muxui/react');
    const packedImportMilliseconds = performance.now() - importStarted;
    const compatibility = await import('@muxui/react/compatibility');
    const testing = await import('@muxui/react/testing');
    const expected = ${JSON.stringify(['reactCompatibility', ...deliveredExports, ...supportingExports])};
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([...expected].sort())) throw new Error('exact public export surface');
    if (compatibility.reactCompatibility.version !== '${candidateVersion}') throw new Error('compatibility version');
    if (compatibility.reactCompatibility.support !== 'unproved; R1.5 React exports only') throw new Error('compatibility support');
    if (testing.reactPlatformSafetyFixture.componentSupportClaim !== 'none') throw new Error('support claim');
    const packageEntry = await import.meta.resolve('@muxui/react');
    await import(new URL('./fields.mjs', packageEntry));
    if (!import.meta.resolve('@muxui/react/styles.css').endsWith('/generated/styles.css')) throw new Error('styles resolution');
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
      componentExports: deliveredExports,
      supportingExports,
      publicExports: ['reactCompatibility', ...deliveredExports, ...supportingExports],
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
          command: 'npm view @muxui/react@0.1.0-rc.1 version --registry=https://registry.npmjs.org',
          status: 'pending',
          policy: 'an existing version is a hard stop; never overwrite or republish it',
        },
        {
          name: 'next dist-tag collision',
          command: 'npm view @muxui/react dist-tags --json --registry=https://registry.npmjs.org',
          status: 'pending',
          policy: 'record the prior next pointer before any separately authorized mutation',
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
        assertion: 'requires a separately authorized next dist-tag observation and rollback exercise',
      },
    },
    rollback: {
      status: 'prepared-not-exercised',
      trigger: ['published consumer verification failure', 'integrity/provenance mismatch', 'dist-tag drift'],
      steps: [
        'stop further publication and preserve the immutable rc.1 version and manifest',
        're-read the registry and record the prior verified next pointer',
        'restore that pointer through a separately authorized dist-tag mutation',
        'retain the candidate artifact and failed verification for audit; do not mutate latest or stable',
      ],
      forbidden: ['delete or overwrite the immutable package version', 'mutate latest', 'promote stable support'],
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
