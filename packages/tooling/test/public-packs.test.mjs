import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, resolve } from 'node:path';
import test, { after } from 'node:test';

// Decision 0032 item 5: the entries each packed manifest exposes, and the files its tarball holds beyond them.
const packagesRoot = resolve(import.meta.dirname, '../..');
const specs = {
  schema: {
    name: '@muxui/schema',
    entries: ['.', './schemas/*', './types'],
    dependencies: [],
    excluded: ['src/generate.mjs'],
  },
  catalog: {
    name: '@muxui/catalog',
    entries: ['.', './search', './bundle', './catalog.json', './catalog-package.json', './token-section-page-budget-profile.json'],
    dependencies: ['@muxui/schema'],
    workspaceOnly: ['./compiler', './pattern-imports', './pattern-content'],
    // The tooling pnpm adapter reads these beside the bundle by path; nothing imports them.
    sidecars: ['generated/catalog.json.provenance', 'generated/catalog-package.json.provenance'],
    excluded: [
      'src/compiler.mjs', 'src/pattern-imports.mjs', 'src/pattern-content.mjs', 'src/completeness.mjs',
      'src/generate.mjs', 'catalog-sources.json',
    ],
  },
  tooling: {
    name: '@muxui/tooling',
    entries: ['.', './resolver', './registry', './types'],
    bin: { muxui: './bin/muxui.mjs' },
    dependencies: ['@muxui/catalog', '@muxui/schema', 'semver'],
    workspaceOnly: ['./authoring'],
    excluded: ['src/registry.mjs', 'src/generate.mjs', 'src/authoring.mjs', 'command-registry.json'],
  },
};
const METADATA = ['README.md', 'LICENSE', 'package.json'];
// Static `import ... from`, `export ... from`, and `import 'x'` statements at the start of a line.
const MODULE_SPECIFIER = /^(?:(?:import|export)\s[^'"`;]*?\bfrom|import)\s*['"]([^'"]+)['"]/gmu;

const scratch = [];
after(async () => {
  for (const directory of scratch) await rm(directory, { recursive: true, force: true });
});

/**
 * `pnpm pack` of one package into its own temp directory, extracted for reading. Lifecycle scripts stay off because
 * `prepack` regenerates projections in the checkout, which would race the other tests that read them.
 */
async function pack(slug) {
  const destination = await mkdtemp(join(tmpdir(), `muxui-pack-${slug}-`));
  scratch.push(destination);
  const packed = spawnSync('pnpm', [
    '--config.ignore-scripts=true', '--config.engine-strict=false',
    'pack', '--json', '--pack-destination', destination,
  ], { cwd: join(packagesRoot, slug), encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const { filename, files } = JSON.parse(packed.stdout);
  const root = join(destination, 'package');
  await mkdir(root);
  const extracted = spawnSync('tar', ['-xzf', filename, '-C', root, '--strip-components=1'], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  return {
    root,
    files: new Set(files.map(({ path }) => path)),
    manifest: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')),
  };
}

const packed = {};
for (const slug of Object.keys(specs)) packed[specs[slug].name] = await pack(slug);

const targetsOf = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targetsOf));
const entryExists = (exports, subpath) => Object.keys(exports).some((key) => (
  key === subpath || (key.endsWith('/*') && subpath.startsWith(key.slice(0, -1)))
));

/** The `exports` and `bin` targets as tarball paths; a wildcard target expands to the files under its prefix. */
function entryFiles({ manifest, files }) {
  const code = [];
  const data = [];
  for (const target of [...targetsOf(manifest.exports), ...targetsOf(manifest.bin ?? {})]) {
    const path = posix.normalize(target);
    const matches = path.endsWith('*') ? [...files].filter((file) => file.startsWith(path.slice(0, -1))) : [path];
    assert.ok(matches.length > 0 && matches.every((file) => files.has(file)), `${target} is not in the tarball`);
    (/\.(?:mjs|d\.m?ts)$/u.test(path) ? code : data).push(...matches);
  }
  return { code, data };
}

/** Every tarball file the public entries reach through static imports, asserting each import stays public and packed. */
async function importClosure(name, entries) {
  const { root, files, manifest } = packed[name];
  const reached = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (reached.has(file)) continue;
    assert.ok(files.has(file), `${name}: ${file} is imported by a public entry but is not in the tarball`);
    reached.add(file);
    if (!/\.(?:mjs|d\.m?ts)$/u.test(file)) continue;
    for (const [, specifier] of (await readFile(join(root, file), 'utf8')).matchAll(MODULE_SPECIFIER)) {
      if (specifier.startsWith('.')) {
        queue.push(posix.join(posix.dirname(file), specifier));
      } else if (!specifier.startsWith('node:')) {
        const segments = specifier.split('/');
        const packageName = segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
        const subpath = ['.', ...segments.slice(packageName.split('/').length)].join('/');
        assert.ok(Object.hasOwn(manifest.dependencies ?? {}, packageName), `${name}: ${file} imports ${specifier}, which is not a packed dependency`);
        if (packed[packageName]) {
          assert.ok(entryExists(packed[packageName].manifest.exports, subpath), `${name}: ${file} imports ${specifier}, which is not a public entry`);
        }
      }
    }
  }
  return reached;
}

/**
 * Decision 0032 item 3: a field a consumer can install names a Mux UI package only along an allowed edge, so
 * `@muxui/tokens` and parked packages never appear there; no field keeps a `workspace:` specifier. `devDependencies`
 * stay free of the edge rule because no package manager installs a dependency's development dependencies.
 */
function dependencyProblems(manifest, allowedEdges) {
  const problems = [];
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (range.startsWith('workspace:')) problems.push(`${field} ${dependency} keeps its workspace specifier`);
      if (field !== 'devDependencies' && dependency.startsWith('@muxui/') && !allowedEdges.includes(dependency)) {
        problems.push(`${field} ${dependency} is not an allowed Mux UI edge`);
      }
    }
  }
  return problems;
}

test('P2.1 the packed dependency rule refuses Mux UI edges outside Decision 0032 in every installable field', () => {
  const allowed = ['@muxui/schema'];
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(dependencyProblems({ [field]: { '@muxui/tokens': '0.6.0' } }, allowed), [`${field} @muxui/tokens is not an allowed Mux UI edge`]);
    assert.deepEqual(dependencyProblems({ [field]: { '@muxui/scale': '1.0.0' } }, allowed), [`${field} @muxui/scale is not an allowed Mux UI edge`]);
    assert.deepEqual(dependencyProblems({ [field]: { '@muxui/schema': 'workspace:*' } }, allowed), [`${field} @muxui/schema keeps its workspace specifier`]);
    assert.deepEqual(dependencyProblems({ [field]: { '@muxui/schema': '0.6.0', semver: '7.8.5' } }, allowed), []);
  }
  assert.deepEqual(dependencyProblems({ devDependencies: { '@muxui/tokens': '0.6.0' } }, allowed), []);
  assert.deepEqual(dependencyProblems({ devDependencies: { '@muxui/tokens': 'workspace:*' } }, allowed), ['devDependencies @muxui/tokens keeps its workspace specifier']);
});

for (const [slug, spec] of Object.entries(specs)) {
  test(`P2.1 packed ${spec.name} exposes only its public entries and the files they need`, async () => {
    const { manifest, files } = packed[spec.name];
    const source = JSON.parse(await readFile(join(packagesRoot, slug, 'package.json'), 'utf8'));

    assert.deepEqual(Object.keys(manifest.exports).sort(), [...spec.entries].sort());
    assert.deepEqual(manifest.bin, spec.bin);
    for (const entry of spec.workspaceOnly ?? []) {
      assert.ok(Object.hasOwn(source.exports, entry), `${spec.name} keeps ${entry} for workspace consumers`);
      assert.equal(Object.hasOwn(manifest.exports, entry), false, `${entry} is packed`);
    }
    for (const excluded of spec.excluded) assert.equal(files.has(excluded), false, `${excluded} is packed`);
    assert.deepEqual([...files].filter((file) => /^(?:test|node_modules)\//u.test(file)), []);

    assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), spec.dependencies);
    assert.deepEqual(dependencyProblems(manifest, spec.dependencies.filter((name) => name.startsWith('@muxui/'))), []);

    // Everything packed is metadata, an entry, a file an entry imports, or a declared sidecar.
    const { code, data } = entryFiles(packed[spec.name]);
    const needed = new Set([...METADATA, ...data, ...(spec.sidecars ?? []), ...await importClosure(spec.name, code)]);
    assert.deepEqual([...files].filter((file) => !needed.has(file)), []);
    for (const file of spec.sidecars ?? []) assert.ok(files.has(file), `${file} is not in the tarball`);
  });
}
