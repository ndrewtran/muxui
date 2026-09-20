import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertExactArchiveEntries,
  assertExactDependencyGraph,
  assertExactExportList,
  assertPackedFileBoundary,
  assertStylesheetAssetUrls,
  deriveCurrentExportSurface,
} from '../src/release-proof.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packageRoot = join(repositoryRoot, 'packages/react');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const manifestFiles = ['generated', 'assets', 'README.md', 'LICENSE', 'NOTICE', 'package.json', 'licenses'];
const requiredEntries = [
  'package/assets/fonts/Inter[opsz,wght].ttf',
  'package/assets/fonts/OFL.txt',
  'package/licenses/lucide.ISC-MIT.txt',
];
const validEntries = [
  'package/generated/index.mjs',
  ...requiredEntries,
  'package/README.md',
  'package/LICENSE',
  'package/NOTICE',
  'package/package.json',
];

function packageFiles(root, prefix) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(root, entry.name);
    const archivePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return packageFiles(absolute, archivePath);
    assert.equal(statSync(absolute).isFile(), true, archivePath);
    return [archivePath];
  });
}

function parseGeneratedJson(source) {
  return JSON.parse(source.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
}

test('release proof accepts the current declared package boundary', () => {
  assert.deepEqual(
    assertPackedFileBoundary({ entries: validEntries, manifestFiles, requiredEntries }),
    [...validEntries].sort(),
  );
});

test('release proof accepts the current React package source boundary', () => {
  const entries = [
    ...manifest.files.filter((file) => !['generated', 'assets', 'licenses'].includes(file)).map((file) => `package/${file}`),
    ...packageFiles(join(packageRoot, 'generated'), 'package/generated'),
    ...packageFiles(join(packageRoot, 'assets'), 'package/assets'),
    ...packageFiles(join(packageRoot, 'licenses'), 'package/licenses'),
  ];
  const required = [
    ...packageFiles(join(packageRoot, 'assets'), 'package/assets'),
    ...packageFiles(join(packageRoot, 'licenses'), 'package/licenses'),
  ];
  assert.equal(assertPackedFileBoundary({ entries, manifestFiles: manifest.files, requiredEntries: required }).length, entries.length);
});

test('current generated descriptor and release metadata use the canonical full export order', () => {
  const historicalSnapshot = JSON.parse(readFileSync(join(repositoryRoot, 'catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json'), 'utf8'));
  const supplementalComponents = JSON.parse(readFileSync(join(repositoryRoot, 'catalog/react-r1-6/supplemental-components.json'), 'utf8')).components;
  const surface = deriveCurrentExportSurface({
    historicalFamilies: historicalSnapshot.families,
    supplementalComponents,
  });
  const contract = parseGeneratedJson(readFileSync(join(packageRoot, 'generated/r1-6-contract.json'), 'utf8'));
  const descriptor = parseGeneratedJson(readFileSync(join(packageRoot, 'generated/descriptor.json'), 'utf8'));
  const release = parseGeneratedJson(readFileSync(join(packageRoot, 'generated/release.json'), 'utf8'));

  assert.deepEqual(contract.current.rootExports, surface.currentRootExports);
  assert.deepEqual(contract.current.subpaths.map(({ export: name, module }) => `${name}:${module}`), surface.isolatedExportModules);
  assert.deepEqual(descriptor.bindings.map(({ export: name }) => name), surface.currentComponentExports);
  assert.deepEqual(release.componentExports.map(({ name }) => name), surface.currentComponentExports);
  assert.deepEqual(
    surface.currentComponentExports.filter((name) => ['Lightbox', 'Markdown', 'MultiSelect'].includes(name)),
    ['Lightbox', 'Markdown', 'MultiSelect'],
    'isolated exports retain their canonical position among supplemental families',
  );
});

test('release proof resolves every local stylesheet URL to a nonempty archive asset', () => {
  const entries = [
    ...manifest.files.filter((file) => !['generated', 'assets', 'licenses'].includes(file)).map((file) => `package/${file}`),
    ...packageFiles(join(packageRoot, 'generated'), 'package/generated'),
    ...packageFiles(join(packageRoot, 'assets'), 'package/assets'),
    ...packageFiles(join(packageRoot, 'licenses'), 'package/licenses'),
  ];
  const entrySizes = Object.fromEntries(entries.map((entry) => [
    entry,
    statSync(join(packageRoot, entry.slice('package/'.length))).size,
  ]));
  const stylesheet = readFileSync(join(packageRoot, 'generated/styles.css'), 'utf8');
  assertStylesheetAssetUrls({
    stylesheet,
    stylesheetEntry: 'package/generated/styles.css',
    entries,
    entrySizes,
  });
  assert.throws(
    () => assertStylesheetAssetUrls({
      stylesheet: stylesheet.replace('../assets/fonts/Inter[opsz,wght].ttf', '../assets/fonts/missing.ttf'),
      stylesheetEntry: 'package/generated/styles.css',
      entries,
      entrySizes,
    }),
    /R1\.5_PACK_STYLE_ASSET_MISSING/u,
  );
});

test('release proof rejects missing bundled font, dependency, or license notice', () => {
  assert.throws(
    () => assertPackedFileBoundary({
      entries: validEntries.filter((entry) => !entry.endsWith('Inter[opsz,wght].ttf')),
      manifestFiles,
      requiredEntries,
    }),
    /R1\.5_PACK_CONTENT_MISSING/u,
  );
  assert.throws(
    () => assertExactDependencyGraph({ react: '^19.2.0' }, { react: '^19.2.0', 'react-dom': '^19.2.0' }),
    /R1_EXIT_PACK_MANIFEST_INVALID/u,
  );
  assert.throws(
    () => assertPackedFileBoundary({
      entries: validEntries.filter((entry) => !entry.endsWith('lucide.ISC-MIT.txt')),
      manifestFiles,
      requiredEntries,
    }),
    /R1\.5_PACK_CONTENT_MISSING/u,
  );
});

test('release proof rejects unexpected descendants and missing generated module or sidecar', () => {
  for (const extra of ['package/generated/private.mjs', 'package/assets/fonts/private.ttf', 'package/licenses/private.txt']) {
    assert.throws(
      () => assertExactArchiveEntries([...validEntries, extra], validEntries),
      /R1\.5_PACK_CONTENT_INVALID/u,
    );
  }
  const expectedGenerated = [...validEntries, 'package/generated/index.d.ts', 'package/generated/index.mjs.provenance'];
  assertExactArchiveEntries(expectedGenerated, expectedGenerated);
  for (const missing of ['package/generated/index.d.ts', 'package/generated/index.mjs.provenance']) {
    assert.throws(
      () => assertExactArchiveEntries(expectedGenerated.filter((entry) => entry !== missing), expectedGenerated),
      /R1\.5_PACK_CONTENT_INVALID/u,
    );
  }
});

test('release proof rejects private archive files and export drift', () => {
  assert.throws(
    () => assertPackedFileBoundary({ entries: [...validEntries, 'package/src/private.mjs'], manifestFiles, requiredEntries }),
    /R1\.5_PACK_CONTENT_INVALID/u,
  );
  assert.throws(
    () => assertExactExportList(['Button'], ['Button', 'IconButton'], 'R1.6_PACK_EXPORT_SURFACE_INVALID'),
    /R1\.6_PACK_EXPORT_SURFACE_INVALID/u,
  );
});
