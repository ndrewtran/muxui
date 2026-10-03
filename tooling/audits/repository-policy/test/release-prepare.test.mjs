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
  deriveExpectedPackageEntries,
  readGeneratedOutputNames,
} from '../src/release-proof.mjs';
import { readSupplementalMapping } from '../../../../packages/react/src/supplemental-mapping.mjs';

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
  const supplementalComponents = readSupplementalMapping(repositoryRoot);
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

test('release proof derives the exact generated archive set from the React generator outputs', () => {
  const generatedOutputs = readGeneratedOutputNames(packageRoot);
  // Decision 0018 and 0019 outputs prove the list tracks the generator rather than a copy.
  for (const name of ['avatar.mjs', 'image.d.ts', 'select-native.mjs', 'motion.mjs', 'motion-components.mjs', 'tabs-motion.mjs']) {
    assert.ok(generatedOutputs.includes(name), name);
  }
  const generatedOnDisk = packageFiles(join(packageRoot, 'generated'), 'package/generated').sort();
  assert.deepEqual(generatedOutputs.map((name) => `package/generated/${name}`), generatedOnDisk);

  const fixedEntries = ['package/LICENSE', 'package/NOTICE', 'package/README.md', 'package/package.json'];
  const expected = deriveExpectedPackageEntries({ generatedOutputs, fixedEntries, trackedEntries: requiredEntries });
  const packed = [...generatedOnDisk, ...fixedEntries, ...requiredEntries];
  assert.deepEqual(assertExactArchiveEntries(packed, expected), [...packed].sort());

  const omitted = deriveExpectedPackageEntries({
    generatedOutputs: generatedOutputs.filter((name) => name !== 'motion.mjs'),
    fixedEntries,
    trackedEntries: requiredEntries,
  });
  assert.throws(() => assertExactArchiveEntries(packed, omitted), /R1\.5_PACK_CONTENT_INVALID: .*unexpected: package\/generated\/motion\.mjs/u);
  assert.throws(
    () => assertExactArchiveEntries(packed.filter((entry) => entry !== 'package/generated/avatar.mjs'), expected),
    /R1\.5_PACK_CONTENT_INVALID: .*missing: package\/generated\/avatar\.mjs;/u,
  );
  assert.throws(
    () => assertExactArchiveEntries([...packed, 'package/generated/stale.mjs'], expected),
    /R1\.5_PACK_CONTENT_INVALID: .*unexpected: package\/generated\/stale\.mjs;/u,
  );
  assert.throws(() => assertExactArchiveEntries([...packed, packed[0]], expected), /duplicate: /u);
});
