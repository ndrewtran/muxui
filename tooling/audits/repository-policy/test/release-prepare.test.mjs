import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'acorn';
import {
  assertBundleRetention,
  assertExactArchiveEntries,
  assertExactDependencyGraph,
  assertExactExportList,
  assertNoPublicSurfaceLeaks,
  assertPackedFileBoundary,
  assertSingleInstalledVersion,
  assertStylesheetAssetUrls,
  bundledModulePackage,
  collectInstalledClosure,
  createUpstreamNameMatcher,
  deriveCurrentExportSurface,
  deriveExpectedPackageEntries,
  findPublicSurfaceLeaks,
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

const upstreamNames = ['react-aria', 'react-aria-components', '@react-aria/', 'motion', '@tiptap/', 'marked', 'lucide-react', '@internationalized/', 'prosemirror-view'];

test('public-surface leak scan finds upstream names in declarations, re-exports, and guidance', () => {
  const matcher = createUpstreamNameMatcher(upstreamNames);
  const findings = findPublicSurfaceLeaks({
    declarations: [
      { file: 'a.d.ts', text: "import type { Key } from '@react-types/shared';\nexport type P = { value: CalendarDate };" },
      { file: 'b.d.ts', text: "import type { Editor } from '@tiptap/core';\nexport type Q = UNSTABLE_Toast;" },
      { file: 'c.d.ts', text: "import * as React from 'react';\nimport type { ButtonProps } from './button.js';" },
    ],
    entries: [{ file: 'index.mjs', text: "export { Button } from './button.mjs';\nexport * from 'lucide-react';" }],
    texts: [{ file: 'README.md', text: 'Spacing, typography, motion, and density stay themeable. Install `marked` or motion/react.' }],
    json: [{ file: 'release.json', value: { packageDependencies: { marked: '13.0.3' }, notes: ['Uses react-aria-components internally'] }, allowedJsonPaths: ['$.packageDependencies'] }],
    matcher,
  });
  assert.deepEqual(findings.map(({ file, location, match }) => `${file}|${location}|${match}`), [
    'a.d.ts|module specifier|@react-types/shared',
    'b.d.ts|module specifier|@tiptap/core',
    'b.d.ts|declaration text|@tiptap/core',
    'b.d.ts|declaration text|UNSTABLE_',
    "index.mjs|public re-export|export * from 'lucide-react'",
    'README.md|guidance text|marked',
    'README.md|guidance text|motion/r',
    'release.json|$.notes[]|react-aria-components',
  ]);
  assert.throws(() => assertNoPublicSurfaceLeaks({ texts: [{ file: 'README.md', text: 'see @internationalized/date' }], matcher }), /R1_EXIT_PACK_PUBLIC_LEAK: .*README\.md guidance text: @internationalized\/date/u);
});

test('the current React declarations and guidance pass the public-surface leak scan', () => {
  const generatedRoot = join(packageRoot, 'generated');
  const generatedFiles = readdirSync(generatedRoot);
  const read = (name) => readFileSync(join(generatedRoot, name), 'utf8');
  assertNoPublicSurfaceLeaks({
    declarations: generatedFiles.filter((name) => name.endsWith('.d.ts')).map((name) => ({ file: name, text: read(name) })),
    entries: ['index.mjs', 'compatibility.mjs', 'themes.mjs', 'testing.mjs', 'text-editor.mjs', 'markdown.mjs'].map((name) => ({ file: name, text: read(name) })),
    texts: [{ file: 'README.md', text: readFileSync(join(packageRoot, 'README.md'), 'utf8') }, { file: 'index.mjs', text: read('index.mjs') }],
    json: [
      { file: 'release.json', value: parseGeneratedJson(read('release.json')), allowedJsonPaths: ['$.packageDependencies'] },
      { file: 'r1-5-closure.json', value: parseGeneratedJson(read('r1-5-closure.json')), allowedJsonPaths: ['$.upstream', '$.families[].root'] },
      { file: 'descriptor.json', value: parseGeneratedJson(read('descriptor.json')) },
      { file: 'r1-6-contract.json', value: parseGeneratedJson(read('r1-6-contract.json')) },
    ],
    matcher: createUpstreamNameMatcher([...upstreamNames, ...Object.keys(manifest.dependencies)]),
    allowedSpecifiers: ['react', 'react-dom', '@muxui/react'],
  });
});

function writePackage(directory, manifestValue) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifestValue));
}

test('installed closure follows nested and symlinked layouts and rejects editor engine skew', () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-closure-'));
  try {
    // npm-style hoisting with one nested duplicate under an extension.
    const npm = join(root, 'npm');
    writePackage(join(npm, 'node_modules/@muxui/react'), { name: '@muxui/react', version: '1.0.0', dependencies: { '@tiptap/core': '3.31.4', '@tiptap/starter-kit': '3.31.4' }, peerDependencies: { react: '19' } });
    writePackage(join(npm, 'node_modules/react'), { name: 'react', version: '19.2.8' });
    writePackage(join(npm, 'node_modules/@tiptap/core'), { name: '@tiptap/core', version: '3.31.4' });
    writePackage(join(npm, 'node_modules/@tiptap/starter-kit'), { name: '@tiptap/starter-kit', version: '3.31.4', dependencies: { '@tiptap/extension-bold': '^3.31.4' } });
    writePackage(join(npm, 'node_modules/@tiptap/extension-bold'), { name: '@tiptap/extension-bold', version: '3.32.0', peerDependencies: { '@tiptap/core': '^3.32.0' } });
    writePackage(join(npm, 'node_modules/@tiptap/extension-bold/node_modules/@tiptap/core'), { name: '@tiptap/core', version: '3.32.0' });
    const skewed = collectInstalledClosure(npm, '@muxui/react', { excludedNames: ['react', 'react-dom'] });
    assert.deepEqual(skewed.get('@tiptap/core'), ['3.31.4', '3.32.0']);
    assert.equal(skewed.has('react'), false);
    assert.throws(() => assertSingleInstalledVersion(skewed, '@tiptap/core', 'R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW'), /R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW: expected exactly one installed @tiptap\/core version, found 3\.31\.4, 3\.32\.0/u);

    // pnpm-style virtual store reached through symlinks.
    const pnpm = join(root, 'pnpm');
    const store = (name, version) => join(pnpm, `node_modules/.pnpm/${name.replace('/', '+')}@${version}/node_modules/${name}`);
    writePackage(store('@muxui/react', '1.0.0'), { name: '@muxui/react', version: '1.0.0', dependencies: { '@tiptap/core': '3.31.4' } });
    writePackage(store('@tiptap/core', '3.31.4'), { name: '@tiptap/core', version: '3.31.4' });
    const muxuiModules = dirname(dirname(store('@muxui/react', '1.0.0')));
    mkdirSync(join(muxuiModules, '@tiptap'), { recursive: true });
    symlinkSync(store('@tiptap/core', '3.31.4'), join(muxuiModules, '@tiptap/core'));
    mkdirSync(join(pnpm, 'node_modules/@muxui'), { recursive: true });
    symlinkSync(store('@muxui/react', '1.0.0'), join(pnpm, 'node_modules/@muxui/react'));
    const single = collectInstalledClosure(pnpm, '@muxui/react');
    assert.equal(assertSingleInstalledVersion(single, '@tiptap/core', 'R1_EXIT_CONSUMER_TIPTAP_CORE_SKEW'), '3.31.4');
    assert.throws(() => collectInstalledClosure(join(root, 'empty'), '@muxui/react'), /R1_EXIT_CONSUMER_GRAPH_INVALID/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('bundle retention maps module ids to packages and rejects retained heavy modules', () => {
  const pnpmId = '/tmp/c/node_modules/.pnpm/@tiptap+core@3.31.4/node_modules/@tiptap/core/dist/index.js';
  assert.equal(bundledModulePackage(pnpmId), '@tiptap/core');
  assert.equal(bundledModulePackage('/tmp/c/node_modules/marked/lib/marked.esm.js'), 'marked');
  assert.equal(bundledModulePackage('/tmp/c/entry.mjs'), null);
  const button = { id: '/tmp/c/node_modules/@muxui/react/generated/button.mjs', bytes: 10 };
  const options = {
    required: [{ label: 'button', test: (id) => id.endsWith('/generated/button.mjs') }],
    forbidden: [{ label: 'Tiptap', test: (id) => bundledModulePackage(id)?.startsWith('@tiptap/') }],
  };
  assertBundleRetention({ modules: [button], ...options });
  assert.throws(() => assertBundleRetention({ modules: [button, { id: pnpmId, bytes: 5 }], ...options }), /R1_EXIT_PACK_TREE_SHAKING_FAILED: required: present; retained: Tiptap/u);
  assert.throws(() => assertBundleRetention({ modules: [], ...options }), /required: button;/u);
});

// Bundlers may drop any packed JS module a consumer does not import; only stylesheets
// carry side effects. A new import-time effect needs the declaration widened first.
test('the React package declares only stylesheets as side effects and generated modules have none', () => {
  assert.deepEqual(manifest.sideEffects, ['*.css']);
  const generatedRoot = join(packageRoot, 'generated');
  const modules = readdirSync(generatedRoot).filter((name) => name.endsWith('.mjs'));
  assert.ok(modules.length > 0);
  for (const name of modules) {
    const { body } = parse(readFileSync(join(generatedRoot, name), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    for (const node of body) {
      if (node.type === 'ImportDeclaration') {
        assert.notEqual(node.specifiers.length, 0, `${name} has a side-effect import of ${node.source.value}`);
        continue;
      }
      if (node.type !== 'ExpressionStatement') continue;
      // Only component metadata such as `Button.displayName = 'Button'` may run at import.
      const { expression } = node;
      assert.equal(expression.type, 'AssignmentExpression', `${name} runs a top-level expression`);
      assert.equal(expression.left.type, 'MemberExpression', `${name} assigns outside a component`);
      assert.ok(['displayName', 'Root'].includes(expression.left.property.name), `${name} assigns ${expression.left.property.name} at import`);
    }
  }
});
