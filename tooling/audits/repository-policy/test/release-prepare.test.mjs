import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertBundleRetention,
  assertExactArchiveEntries,
  assertExactDependencyGraph,
  assertExactExportList,
  assertInstalledCandidate,
  assertNoPublicSurfaceLeaks,
  assertPackedFileBoundary,
  assertSingleInstalledVersion,
  assertStylesheetAssetUrls,
  bundledModulePackage,
  buildReleaseCorrelation,
  collectInstalledClosure,
  createUpstreamNameMatcher,
  deriveCurrentExportSurface,
  deriveExpectedPackageEntries,
  deriveVisualContract,
  digestFileSet,
  findModuleSideEffects,
  findPinnedDuplicateVersions,
  findPublicSurfaceLeaks,
  isolatedPackageManagerEnvironment,
  nodeBundledCli,
  readGeneratedOutputNames,
  readLockedIntegrity,
  readRetainedEvidence,
  readRetainedReviewEvidence,
  replaceVersions,
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
  // Avatar, Image, SelectNative and motion outputs prove the list tracks the generator rather than a copy.
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
  for (const name of modules) assert.deepEqual(findModuleSideEffects(readFileSync(join(generatedRoot, name), 'utf8')), [], name);
});

test('the module side-effect allowlist rejects import-time work', () => {
  const allowed = `import React from 'react';
    import { parseDate } from 'date';
    export { A } from './a.mjs';
    export * from './b.mjs';
    function f() { window.x = 1; }
    class C extends Base { static size = 2; method() {} }
    const n = 1, s = 'x', fn = () => window.y, set = new Set(['a']), map = new WeakMap();
    const Context = React.createContext(null);
    export const Button = React.forwardRef(function Button() { return null; });
    const frozen = Object.freeze({ open: Object.freeze({ duration: 0.2 }), list: ['a'] });
    const choose = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
    const date = /*#__PURE__*/ parseDate('2000-01-01');
    Button.displayName = 'Button';
    Button.Root = Button;
    export default function Root() {}`;
  assert.deepEqual(findModuleSideEffects(allowed), []);
  for (const source of [
    "import './register.css';",
    'if (typeof window !== "undefined") window.x = 1;',
    'const x = register();',
    'export const y = install();',
    'export default install();',
    "Button.displayName = (track(), 'Button');",
    'Button.displayName = name();',
    'window.muxui = {};',
    'register();',
    'const x = /*#__PURE__*/ wrap(register());',
    'const x = Object.freeze(register());',
    'class C { static { register(); } }',
    'class C { static value = register(); }',
    'class C extends mixin(Base) {}',
    'const x = [...items];',
    'const x = { [key()]: 1 };',
    'const x = new Registry();',
    'for (const x of []) {}',
  ]) {
    assert.equal(findModuleSideEffects(source).length, 1, source);
  }
});

// A local registry records the Authorization header npm sends: the host's
// token reaches it from an ordinary environment, never from the isolated one.
test('clean-consumer installs send no host registry auth', async () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-auth-'));
  const authorizations = [];
  const server = createServer((request, response) => {
    authorizations.push(request.headers.authorization ?? null);
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end('{}');
  });
  try {
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const registry = `http://127.0.0.1:${server.address().port}/`;
    const home = join(root, 'home');
    const consumer = join(root, 'consumer');
    mkdirSync(home);
    mkdirSync(consumer);
    writeFileSync(join(home, '.npmrc'), `${registry.slice('http:'.length)}:_authToken=host-secret-token\n`);
    const userConfig = join(root, 'empty-userconfig');
    const globalConfig = join(root, 'empty-globalconfig');
    writeFileSync(userConfig, '');
    writeFileSync(globalConfig, '');
    const host = { ...process.env, HOME: home, USERPROFILE: home, YARN_NPM_AUTH_TOKEN: 'host-secret-token', npm_config_userconfig: join(home, '.npmrc') };
    const whoami = (environment) => new Promise((done) => {
      execFile(process.execPath, [nodeBundledCli('npm'), 'whoami', `--registry=${registry}`], { cwd: consumer, env: environment, timeout: 60_000 }, (error, stdout, stderr) => done(stderr));
    });
    await whoami(host);
    assert.ok(authorizations.includes('Bearer host-secret-token'), 'control: the host token reaches an ordinary npm call');
    const isolated = isolatedPackageManagerEnvironment(host, { userConfig, globalConfig });
    assert.equal(Object.keys(isolated).some((name) => /^yarn_/iu.test(name)), false);
    authorizations.length = 0;
    assert.match(await whoami(isolated), /ENEEDAUTH/u, 'npm finds no credentials in the isolated environment');
    assert.equal(authorizations.some((value) => value !== null), false, 'the isolated environment sends no credentials');
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a matrix consumer must install the exact packed candidate', () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-installed-candidate-'));
  try {
    const candidate = join(root, 'contents', 'package');
    const consumer = join(root, 'consumer');
    const installed = join(consumer, 'node_modules', '@muxui', 'react');
    for (const directory of [candidate, installed]) {
      mkdirSync(join(directory, 'generated'), { recursive: true });
      writeFileSync(join(directory, 'package.json'), '{"name":"@muxui/react"}\n');
      writeFileSync(join(directory, 'NOTICE'), 'Copyright (c) 2026 Andrew\n');
      writeFileSync(join(directory, 'generated', 'index.mjs'), 'export {};\n');
    }
    // An unhoisted dependency nested by the package manager is not candidate content.
    mkdirSync(join(installed, 'node_modules', 'nested'), { recursive: true });
    writeFileSync(join(installed, 'node_modules', 'nested', 'package.json'), '{}\n');
    assert.deepEqual(assertInstalledCandidate(consumer, '@muxui/react', candidate), { installed: realpathSync(installed), files: 3 });

    writeFileSync(join(installed, 'NOTICE'), 'Copyright (c) 2025 Andrew\n');
    assert.throws(() => assertInstalledCandidate(consumer, '@muxui/react', candidate), (error) => {
      assert.match(error.message, /^R1_EXIT_CONSUMER_MATRIX_CANDIDATE_MISMATCH: /u);
      const details = JSON.parse(error.message.slice(error.message.indexOf('{')));
      assert.deepEqual([details.missing, details.changed, details.added], [[], ['NOTICE'], []]);
      return true;
    });

    rmSync(join(consumer, 'node_modules'), { recursive: true });
    assert.throws(() => assertInstalledCandidate(consumer, '@muxui/react', candidate), (error) => {
      assert.match(error.message, /^R1_EXIT_CONSUMER_MATRIX_CANDIDATE_MISMATCH: /u);
      assert.equal(JSON.parse(error.message.slice(error.message.indexOf('{'))).installed, null);
      return true;
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pinned duplicate versions are reported for every exact runtime pin', () => {
  const closure = new Map([
    ['@internationalized/date', ['3.12.3', '3.12.4']],
    ['@tiptap/core', ['3.31.4']],
    ['motion', ['13.4.0', '13.5.0']],
  ]);
  assert.deepEqual(findPinnedDuplicateVersions(closure, { '@internationalized/date': '3.12.3', '@tiptap/core': '3.31.4', motion: '^13.4.0' }), [
    { name: '@internationalized/date', pinned: '3.12.3', versions: ['3.12.3', '3.12.4'] },
  ]);
});

// Real packed-contract inputs: the canonical token source, generated
// stylesheets, the locked Lucide edge, and generated runtime modules.
function currentVisualInputs() {
  const generatedRoot = join(packageRoot, 'generated');
  const generatedFiles = readdirSync(generatedRoot).sort();
  const lockfile = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  const generated = (suffix) => generatedFiles.filter((name) => name.endsWith(suffix))
    .map((name) => ({ path: `generated/${name}`, bytes: readFileSync(join(generatedRoot, name)) }));
  return {
    tokenSource: { path: 'catalog/tokens/default-theme.json', bytes: readFileSync(join(repositoryRoot, 'catalog/tokens/default-theme.json')) },
    stylesheets: generated('.css'),
    lucide: { version: manifest.dependencies['lucide-react'], integrity: readLockedIntegrity(lockfile, 'lucide-react', manifest.dependencies['lucide-react']) },
    modules: generated('.mjs'),
  };
}

// Test helper: names each input whose identity differs between two visual contracts.
function changedVisualInputs(before, after) {
  const changed = [];
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  if (!same(before.inputs.tokens, after.inputs.tokens)) changed.push('tokens');
  if (!same(before.inputs.stylesheets, after.inputs.stylesheets)) changed.push('stylesheets');
  for (const key of ['version', 'integrity', 'icons', 'modules']) {
    if (!same(before.inputs.lucide[key], after.inputs.lucide[key])) changed.push(`lucide.${key}`);
  }
  if (before.digest !== after.digest && changed.length === 0) changed.push('digest');
  return changed;
}

const replaceModule = (inputs, path, transform) => inputs.modules.map((module) => (module.path === path
  ? { ...module, bytes: Buffer.from(transform(module.bytes.toString('utf8'))) }
  : module));

test('lockfile integrity is read for the exact package version', () => {
  const lockfile = readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  assert.match(readLockedIntegrity(lockfile, 'lucide-react', '1.37.0'), /^sha512-LPsB4rD1/u);
  assert.match(readLockedIntegrity(lockfile, '@internationalized/date', '3.12.4'), /^sha512-M1dE/u);
  assert.equal(readLockedIntegrity(lockfile, 'lucide-react', '1.37'), undefined);
  assert.equal(readLockedIntegrity(lockfile, 'lucide-react', '0.0.0'), undefined);
});

test('a token, stylesheet, Lucide version, icon mapping, or icon call-site change moves the visual contract identity', () => {
  const inputs = currentVisualInputs();
  const baseline = deriveVisualContract(inputs);
  assert.equal(baseline.comparison, 'none-recorded', 'the identity records no visual baseline');
  assert.deepEqual(deriveVisualContract(currentVisualInputs()), baseline, 'unchanged inputs reproduce the identity');
  assert.ok(baseline.inputs.lucide.icons['generated/components.mjs'].includes('chevron-down'));
  assert.ok(baseline.inputs.lucide.modules.some(({ path }) => path === 'generated/components.mjs'));

  const tokenSource = JSON.parse(inputs.tokenSource.bytes.toString('utf8'));
  tokenSource.tokens['semantic.action.background'].alias = 'semantic.color.color-70';
  const tokenChanged = deriveVisualContract({ ...inputs, tokenSource: { ...inputs.tokenSource, bytes: Buffer.from(JSON.stringify(tokenSource)) } });
  assert.deepEqual(changedVisualInputs(baseline, tokenChanged), ['tokens']);

  const stylesheets = inputs.stylesheets.map((sheet) => (sheet.path === 'generated/styles.css'
    ? { ...sheet, bytes: Buffer.from(sheet.bytes.toString('utf8').replace(/border-radius:\s*[^;]+;/u, 'border-radius: 0;')) }
    : sheet));
  assert.notDeepEqual(stylesheets, inputs.stylesheets, 'the fixture changes stylesheet geometry');
  assert.deepEqual(changedVisualInputs(baseline, deriveVisualContract({ ...inputs, stylesheets })), ['stylesheets']);

  assert.deepEqual(changedVisualInputs(baseline, deriveVisualContract({ ...inputs, lucide: { ...inputs.lucide, version: '1.38.0' } })), ['lucide.version']);

  const remapped = replaceModule(inputs, 'generated/components.mjs', (source) => source.replaceAll('icons/chevron-down.mjs', 'icons/chevron-up.mjs'));
  assert.deepEqual(changedVisualInputs(baseline, deriveVisualContract({ ...inputs, modules: remapped })), ['lucide.icons', 'lucide.modules']);

  // Call-site geometry and accessibility semantics live in the importing module bytes.
  for (const [from, to] of [["size: 12 }", "size: 14 }"], ["'aria-hidden': 'true', focusable: 'false', size: 12", "focusable: 'false', size: 12"]]) {
    const callSite = replaceModule(inputs, 'generated/components.mjs', (source) => {
      assert.ok(source.includes(from), from);
      return source.replace(from, to);
    });
    assert.deepEqual(changedVisualInputs(baseline, deriveVisualContract({ ...inputs, modules: callSite })), ['lucide.modules'], to);
  }

  const barrel = replaceModule(inputs, 'generated/components.mjs', (source) => `import { X } from 'lucide-react';\n${source}`);
  assert.throws(() => deriveVisualContract({ ...inputs, modules: barrel }), /R1_EXIT_VISUAL_CONTRACT_INVALID: generated\/components\.mjs imports lucide-react;/u);
  assert.throws(() => deriveVisualContract({ ...inputs, lucide: { version: '^1.37.0', integrity: inputs.lucide.integrity } }), /R1_EXIT_VISUAL_CONTRACT_INVALID/u);
  assert.throws(() => deriveVisualContract({ ...inputs, modules: [] }), /R1_EXIT_VISUAL_CONTRACT_INVALID/u);
});

test('a milestone without a retained evidence index stops the R1 exit', () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-retained-evidence-'));
  try {
    mkdirSync(join(root, 'tests/evidence/r1.1'), { recursive: true });
    writeFileSync(join(root, 'tests/evidence/r1.1/index.json'), '{}');
    assert.deepEqual(readRetainedEvidence(root, ['R1.1']).map(({ milestone, path }) => [milestone, path]), [['R1.1', 'tests/evidence/r1.1/index.json']]);
    assert.throws(() => readRetainedEvidence(root, ['R1.1', 'R1.2']), /R1_EXIT_RETAINED_EVIDENCE_MISSING: R1\.2 logged evidence has no retained index/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(readRetainedEvidence(repositoryRoot, ['R1.1', 'R1.2', 'R1.3', 'R1.4', 'R1.5']).length, 5);
  assert.deepEqual(readRetainedReviewEvidence(repositoryRoot).map(({ milestones, path }) => [milestones, path]), [[['R1.2', 'R1.3', 'R1.4'], 'tests/evidence/r1-retro-review/index.json']]);
  assert.throws(() => readRetainedReviewEvidence(repositoryRoot, 'tests/evidence/missing/index.json'), /R1_EXIT_RETAINED_REVIEW_MISSING/u);
});

test('retained review evidence fails closed on its authority, lanes, digests, and resolutions', () => {
  const root = mkdtempSync(join(tmpdir(), 'muxui-retained-review-'));
  const lanes = ['r1.2-fields', 'r1.3a-collections', 'r1.3b-pickers', 'r1.4-overlays'];
  const sha = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const fixed = { id: 'H1', resolution: { status: 'fixed', fixCommit: 'a'.repeat(40) } };
  const accepted = { id: 'L3', resolution: { status: 'accepted-unfixed', fixCommit: null, reason: 'no change', acceptedBy: 'Andrew / ndrewtran' } };
  // Writes the four lanes (the first with `findings`) and an index; `index` overrides fields.
  const write = ({ findings = [fixed, accepted], index = {}, tamper = false } = {}) => {
    mkdirSync(join(root, 'tests/evidence/r1-retro-review/records'), { recursive: true });
    const records = lanes.map((lane, offset) => {
      const path = `tests/evidence/r1-retro-review/records/${lane}.json`;
      const bytes = JSON.stringify({ findings: offset === 0 ? findings : [fixed] });
      writeFileSync(join(root, path), bytes);
      return { reviewId: lane, path, sha256: sha(tamper && offset === 0 ? `${bytes} ` : bytes) };
    });
    writeFileSync(join(root, 'tests/evidence/r1-retro-review/index.json'), JSON.stringify({
      authority: 'muxui:decision:0022:amendment:01', milestones: ['R1.2', 'R1.3', 'R1.4'], records, ...index,
    }));
  };
  try {
    mkdirSync(join(root, 'decisions'), { recursive: true });
    writeFileSync(join(root, 'decisions/0022-rc1-assistive-technology-non-claim.md'), '# Decision 0022\n\n- Decision owner: Andrew / `ndrewtran`\n');
    write();
    assert.equal(readRetainedReviewEvidence(root).length, 1);
    write({ index: { authority: 'muxui:decision:0022' } });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_AUTHORITY_INVALID/u);
    write({ index: { milestones: undefined } });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_MILESTONES_INVALID/u);
    write({ index: { records: [] } });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_LANES_INVALID/u);
    write({ index: { records: undefined } });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_LANES_INVALID/u);
    write({ tamper: true });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_DIGEST_MISMATCH/u);
    write({ findings: [fixed, { id: 'M2', resolution: { status: 'pending', fixCommit: null } }] });
    assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_PENDING: .*M2/u);
    for (const resolution of [
      { status: 'fixed', fixCommit: 'abc1234' },
      { status: 'accepted-unfixed', fixCommit: null, reason: '', acceptedBy: 'Andrew / ndrewtran' },
      { status: 'accepted-unfixed', fixCommit: null, reason: 'no change', acceptedBy: 'root agent' },
      { status: 'declined', fixCommit: null },
    ]) {
      write({ findings: [fixed, { id: 'L1', resolution }] });
      assert.throws(() => readRetainedReviewEvidence(root), /R1_EXIT_RETAINED_REVIEW_RESOLUTION_INVALID: .*L1/u, JSON.stringify(resolution));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the release manifest correlates exact source, lockfile, generated, catalog, binding, and evidence identities', () => {
  const binding = 'muxui:component:button#web.react';
  const digest = `sha256:${'a'.repeat(64)}`;
  const options = {
    source: { revision: '1'.repeat(40), tree: '2'.repeat(40) },
    lockfile: { path: 'pnpm-lock.yaml', bytes: Buffer.from('lockfileVersion: 9.0\n') },
    generated: [{ path: 'generated/index.mjs', bytes: Buffer.from('export {};\n') }, { path: 'generated/styles.css', bytes: Buffer.from('.muxui-button{}\n') }],
    catalogPackage: {
      name: '@muxui/catalog',
      catalogVersion: '2.0.0',
      catalogDigest: digest,
      queryApiVersion: '2.1.0',
      sourceRevision: digest,
      platformSafetyContract: { digest, version: '1.0.0' },
      tokenRequirementSets: { [`${binding}:web.react`]: digest },
      platformSafetyRequirementSets: { [`${binding}:web.react`]: digest },
    },
    catalogBundle: {
      catalogDigest: digest,
      schemaVersion: '2.1.0',
      artifacts: [
        { id: 'muxui:component:button', kind: 'component', bindingSpecRevisions: { 'web.react': digest } },
        { id: 'muxui:token:default-theme', kind: 'token', contentRevision: digest, record: { tokenContractVersion: '5.0.0' } },
      ],
    },
    bindings: [binding],
    workspacePackages: [{ name: '@muxui/react', version: '0.1.0-alpha.0', private: true }, { name: '@muxui/catalog', version: '2.0.0', private: true }],
    retainedEvidence: [{ milestone: 'R1.5', path: 'tests/evidence/r1.5/index.json', bytes: Buffer.from('{}') }],
    reviewEvidence: [{ milestones: ['R1.2', 'R1.3', 'R1.4'], path: 'tests/evidence/r1-retro-review/index.json', bytes: Buffer.from('{}') }],
    activeExceptions: [],
    visualContract: { comparison: 'none-recorded', digest, inputs: {} },
  };
  const correlation = buildReleaseCorrelation(options);
  assert.deepEqual(buildReleaseCorrelation(options), correlation, 'correlation is deterministic');
  assert.deepEqual(correlation.source, options.source);
  assert.match(correlation.lockfile.sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.deepEqual(correlation.generatedOutputs, digestFileSet(options.generated));
  assert.deepEqual(correlation.catalog, {
    name: '@muxui/catalog', version: '2.0.0', digest, schemaVersion: '2.1.0', queryApiVersion: '2.1.0', sourceRevision: digest,
    platformSafetyContract: { digest, version: '1.0.0' },
  });
  assert.deepEqual(correlation.tokens, { id: 'muxui:token:default-theme', contentRevision: digest, tokenContractVersion: '5.0.0' });
  assert.deepEqual(correlation.bindings, [{ binding, specRevision: digest, tokenRequirementSet: digest, platformSafetyRequirementSet: digest }]);
  assert.deepEqual(correlation.packages.map(({ name }) => name), ['@muxui/catalog', '@muxui/react']);
  assert.deepEqual(correlation.evidence.capturedCiEvidence.map(({ milestone }) => milestone), ['R1.5']);
  assert.deepEqual(correlation.evidence.retainedReviewEvidence.map(({ path }) => path), ['tests/evidence/r1-retro-review/index.json']);
  assert.deepEqual(correlation.evidence.activeExceptions, []);

  const changedGenerated = buildReleaseCorrelation({ ...options, generated: [options.generated[0], { path: 'generated/styles.css', bytes: Buffer.from('.muxui-button{color:red}\n') }] });
  assert.notEqual(changedGenerated.generatedOutputs.digest, correlation.generatedOutputs.digest, 'one generated byte moves the output identity');

  const unbound = { ...options.catalogBundle, artifacts: [options.catalogBundle.artifacts[1]] };
  assert.throws(() => buildReleaseCorrelation({ ...options, catalogBundle: unbound }), /R1_EXIT_CORRELATION_INVALID: .*specRevision/u);
  assert.throws(() => buildReleaseCorrelation({ ...options, source: { revision: 'HEAD', tree: options.source.tree } }), /R1_EXIT_CORRELATION_INVALID/u);
  assert.throws(() => buildReleaseCorrelation({ ...options, catalogBundle: { ...options.catalogBundle, catalogDigest: `sha256:${'b'.repeat(64)}` } }), /R1_EXIT_CORRELATION_INVALID/u);
  assert.throws(() => buildReleaseCorrelation({ ...options, retainedEvidence: [] }), /R1_EXIT_CORRELATION_INVALID/u);
  assert.throws(() => buildReleaseCorrelation({ ...options, reviewEvidence: [] }), /R1_EXIT_CORRELATION_INVALID/u);
});

// npm-publish.yml: candidate version rule, preflight, and propagation-tolerant read-back.
const npmPublication = await import('../src/npm-publication.mjs');

test('candidate versions are 0.1.0-rc.N with N >= 1, and fix forward to rc.N+1', () => {
  assert.equal(npmPublication.parseCandidateVersion('0.1.0-rc.1'), 1);
  assert.equal(npmPublication.parseCandidateVersion('0.1.0-rc.12'), 12);
  assert.equal(npmPublication.fixForwardVersion('0.1.0-rc.2'), '0.1.0-rc.3');
  for (const invalid of ['0.1.0-rc.0', '0.1.0-rc.01', '0.1.0', '0.1.0-alpha.3', '0.2.0-rc.1', ' 0.1.0-rc.2', '0.1.0-rc.2\n', '', undefined]) {
    assert.throws(() => npmPublication.parseCandidateVersion(invalid), /not an admitted candidate version/u, String(invalid));
  }
  assert.equal(npmPublication.meetsMinimumNpm('11.17.0'), true);
  assert.equal(npmPublication.meetsMinimumNpm('11.5.1'), true);
  assert.equal(npmPublication.meetsMinimumNpm('11.5.0'), false);
  assert.equal(npmPublication.meetsMinimumNpm('10.9.9'), false);
  assert.equal(npmPublication.meetsMinimumNpm('12.0.0'), true);
});

const publishedRc1 = { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.1' }, versions: { '0.1.0-rc.1': {} } };

test('the registry preflight admits a first rc.1, or rc.N+1 over next=rc.N', () => {
  const classify = (version, versionStatus, packument) => npmPublication.classifyPreflight({ version, versionStatus, packument });
  assert.deepEqual(classify('0.1.0-rc.1', 404, null), { kind: 'first', latest: '', next: '' });
  assert.deepEqual(classify('0.1.0-rc.2', 404, publishedRc1), { kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1' });
  assert.throws(() => classify('0.1.0-rc.2', 404, null), /only 0\.1\.0-rc\.1 can be a first publish/u);
  assert.throws(() => classify('0.1.0-rc.1', 200, publishedRc1), /already on the registry/u);
  assert.throws(() => classify('0.1.0-rc.1', 404, publishedRc1), /listed in the packument/u);
  assert.throws(() => classify('0.1.0-rc.2', 500, publishedRc1), /HTTP 500/u);
  assert.throws(() => classify('0.1.0-rc.2', 404, { ...publishedRc1, 'dist-tags': { ...publishedRc1['dist-tags'], beta: '0.1.0-rc.1' } }), /exactly latest and next/u);
  assert.throws(() => classify('0.1.0-rc.2', 404, { ...publishedRc1, 'dist-tags': { latest: '0.1.0-rc.1' } }), /exactly latest and next/u);
  const rc3 = { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.3' }, versions: { '0.1.0-rc.1': {}, '0.1.0-rc.3': {} } };
  assert.throws(() => classify('0.1.0-rc.2', 404, rc3), /must be the fix-forward of next/u);
  // Only rc.N+1 over next=rc.N: skipping an rc stops for a decision.
  assert.throws(() => classify('0.1.0-rc.3', 404, publishedRc1), /must be the fix-forward of next \(rc\.N\+1\); next points at 0\.1\.0-rc\.1/u);
  assert.throws(() => classify('0.1.0-rc.2', 404, { ...publishedRc1, 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.0' } }), /not a published version/u);
  assert.throws(() => npmPublication.assertNoDrift({ kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1' }, { kind: 'later', latest: '0.1.0-rc.2', next: '0.1.0-rc.1' }), /latest changed since the preflight/u);
});

// A scripted registry: each URL serves its responses in order, repeating the last.
function scriptedRegistry(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const queue = routes[url];
    assert.ok(queue, `unexpected fetch ${url}`);
    const { status, body = null } = queue.length > 1 ? queue.shift() : queue[0];
    return { status, json: async () => body };
  };
  return { calls, io: { fetch, sleep: async () => {}, log: () => {}, intervalMs: 0 } };
}

test('the read-back waits out registry propagation, then requires next and an unchanged latest', async () => {
  const integrity = 'sha512-candidate';
  const versionDocument = { dist: { integrity, attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } };
  const versionUrl = 'https://registry.npmjs.org/@muxui/react/0.1.0-rc.2';
  const packageUrl = 'https://registry.npmjs.org/@muxui/react';
  const recorded = { kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1' };
  const published = { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.2' } };
  const readBack = (routes, options = {}) => {
    const registry = scriptedRegistry(routes);
    return { registry, result: npmPublication.readBack({ version: '0.1.0-rc.2', expectedIntegrity: integrity, recorded }, { ...registry.io, ...options }) };
  };

  // The version document 404s, then the packument is stale (old next) before it updates.
  const { registry, result } = readBack({
    [versionUrl]: [{ status: 404 }, { status: 503 }, { status: 200, body: versionDocument }],
    [packageUrl]: [{ status: 200, body: publishedRc1 }, { status: 200, body: publishedRc1 }, { status: 200, body: published }],
  });
  assert.deepEqual(await result, { integrity, predicateType: 'https://slsa.dev/provenance/v1', distTags: published['dist-tags'] });
  assert.deepEqual(registry.calls, [versionUrl, versionUrl, versionUrl, packageUrl, packageUrl, packageUrl]);

  await assert.rejects(readBack({ [versionUrl]: [{ status: 404 }] }, { versionAttempts: 3 }).result, /did not appear after 3 attempts/u);
  await assert.rejects(readBack({
    [versionUrl]: [{ status: 200, body: versionDocument }],
    [packageUrl]: [{ status: 200, body: publishedRc1 }],
  }, { tagAttempts: 4 }).result, /dist-tags next=0\.1\.0-rc\.2 did not appear after 4 attempts/u);
  await assert.rejects(readBack({ [versionUrl]: [{ status: 200, body: { dist: { ...versionDocument.dist, integrity: 'sha512-other' } } }] }).result, /has sha512-other/u);
  await assert.rejects(readBack({ [versionUrl]: [{ status: 200, body: { dist: { integrity } } }] }).result, /no SLSA provenance/u);
  // latest moving, or next moving elsewhere, is drift and stops without waiting.
  for (const tags of [{ latest: '0.1.0-rc.2', next: '0.1.0-rc.2' }, { latest: '0.1.0-rc.1', next: '0.1.0-rc.9' }, { ...published['dist-tags'], beta: '0.1.0-rc.2' }]) {
    const drift = readBack({ [versionUrl]: [{ status: 200, body: versionDocument }], [packageUrl]: [{ status: 200, body: { 'dist-tags': tags } }] });
    await assert.rejects(drift.result, /Any dist-tag drift stops for a decision/u);
    assert.equal(drift.registry.calls.filter((url) => url === packageUrl).length, 1);
  }
  await assert.rejects(readBack({ [versionUrl]: [{ status: 200, body: versionDocument }], [packageUrl]: [{ status: 404 }] }).result, /404 after publishing over an existing package/u);
});

test('the read-back times out each request and retries thrown requests and 429 within its budget', async () => {
  const integrity = 'sha512-candidate';
  const versionDocument = { dist: { integrity, attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } };
  const published = { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.2' } };
  const signals = [];
  const responses = [
    new Error('fetch failed'),
    { status: 429 },
    { status: 200, body: versionDocument },
    Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    { status: 503 },
    { status: 200, body: published },
  ];
  const logged = [];
  const fetch = async (_url, { signal }) => {
    signals.push(signal);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { status: next.status, json: async () => next.body ?? null };
  };
  const recorded = { kind: 'later', latest: '0.1.0-rc.1', next: '0.1.0-rc.1' };
  const result = await npmPublication.readBack({ version: '0.1.0-rc.2', expectedIntegrity: integrity, recorded }, { fetch, sleep: async () => {}, log: (line) => logged.push(line), intervalMs: 0 });
  assert.deepEqual(result.distTags, published['dist-tags']);
  assert.equal(signals.length, 6);
  assert.ok(signals.every((signal) => signal instanceof AbortSignal), 'every request carries a timeout signal');
  assert.equal(logged.filter((line) => line.startsWith('Request to ')).length, 2);

  // Thrown requests still count against the attempt budget.
  const failing = async () => {
    throw new Error('fetch failed');
  };
  await assert.rejects(npmPublication.readBack({ version: '0.1.0-rc.2', expectedIntegrity: integrity, recorded }, { fetch: failing, sleep: async () => {}, log: () => {}, intervalMs: 0, versionAttempts: 3 }), /did not appear after 3 attempts/u);
  // The preflight does not retry: a failed request fails closed.
  await assert.rejects(npmPublication.preflight('0.1.0-rc.2', { fetch: failing }), /fetch failed/u);
});

test('version rewrites apply in one pass at version boundaries', () => {
  const rewrites = new Map([['0.1.0-rc.1', '0.1.0-rc.2'], ['0.1.0-rc.2', '0.1.0-rc.3']]);
  assert.equal(
    replaceVersions('deprecate 0.1.0-rc.1, publish 0.1.0-rc.2, keep 0.1.0-rc.10 and 10.1.0-rc.1; pnpm add ./muxui-react-0.1.0-rc.1.tgz', rewrites),
    'deprecate 0.1.0-rc.2, publish 0.1.0-rc.3, keep 0.1.0-rc.10 and 10.1.0-rc.1; pnpm add ./muxui-react-0.1.0-rc.2.tgz',
  );
  assert.equal(replaceVersions('"version":"0.1.0-alpha.0"', new Map([['0.1.0-alpha.0', '0.1.0-rc.2']])), '"version":"0.1.0-rc.2"');
  const identity = new Map([['0.1.0-rc.1', '0.1.0-rc.1'], ['0.1.0-rc.2', '0.1.0-rc.2']]);
  assert.equal(replaceVersions('0.1.0-rc.1 then 0.1.0-rc.2', identity), '0.1.0-rc.1 then 0.1.0-rc.2');
});

test('the npm publication CLI reads its environment and writes step outputs and the summary', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-npm-publication-'));
  try {
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    writeFileSync(output, '');
    writeFileSync(summary, '');
    const integrity = 'sha512-candidate';
    const { io } = scriptedRegistry({
      'https://registry.npmjs.org/@muxui/react/0.1.0-rc.2': [{ status: 404 }, { status: 404 }, { status: 200, body: { dist: { integrity, attestations: { provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } } }],
      'https://registry.npmjs.org/@muxui/react': [{ status: 200, body: publishedRc1 }, { status: 200, body: publishedRc1 }, { status: 200, body: { 'dist-tags': { latest: '0.1.0-rc.1', next: '0.1.0-rc.2' } } }],
    });
    const lines = [];
    const run = (command, environment) => npmPublication.main(command, { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, VERSION: '0.1.0-rc.2', ...environment }, { ...io, log: (line) => lines.push(line) });

    await run('preflight');
    assert.equal(readFileSync(output, 'utf8'), 'kind=later\nlatest=0.1.0-rc.1\nnext=0.1.0-rc.1\n');
    assert.deepEqual(lines.splice(0), ['@muxui/react@0.1.0-rc.2: 404 (no collision)', '@muxui/react dist-tags latest=0.1.0-rc.1 next=0.1.0-rc.1']);

    const recorded = { PRE_KIND: 'later', PRE_LATEST: '0.1.0-rc.1', PRE_NEXT: '0.1.0-rc.1' };
    await run('recheck', recorded);
    assert.deepEqual(lines.splice(0), ['No drift since the preflight: @muxui/react dist-tags latest=0.1.0-rc.1 next=0.1.0-rc.1']);

    await run('read-back', { ...recorded, EXPECTED_SHA512: integrity });
    assert.deepEqual(lines.splice(0), [
      `dist.integrity: ${integrity}`,
      'provenance: https://slsa.dev/provenance/v1',
      'dist-tags: {"latest":"0.1.0-rc.1","next":"0.1.0-rc.2"}',
    ]);
    assert.match(readFileSync(summary, 'utf8'), /^### Published @muxui\/react@0\.1\.0-rc\.2\n/u);

    // A missing or unknown PRE_KIND means the preflight output never reached this step.
    assert.deepEqual(npmPublication.recordedFromEnvironment({ PRE_KIND: 'first' }), { kind: 'first', latest: '', next: '' });
    for (const kind of [undefined, '', 'later ']) assert.throws(() => npmPublication.recordedFromEnvironment({ PRE_KIND: kind }), /PRE_KIND must be first or later/u);
    await assert.rejects(run('unknown'), /Expected validate-version/u);
    // Without GITHUB_OUTPUT, outputs are skipped rather than written elsewhere.
    npmPublication.writeOutputs({}, { kind: 'first' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a first publish read-back accepts the registry setting latest to the new version', () => {
  const recorded = { kind: 'first', latest: '', next: '' };
  const judge = (packument) => npmPublication.judgeDistTags({ version: '0.1.0-rc.1', recorded, packument });
  assert.equal(judge(null), 'wait');
  assert.equal(judge(publishedRc1), 'done');
  assert.throws(() => judge({ 'dist-tags': { latest: '0.1.0-rc.1' } }), /drift/u);
});
