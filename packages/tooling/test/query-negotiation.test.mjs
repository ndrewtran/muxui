import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { satisfies } from 'semver';
import {
  API_VERSION,
  QUERY_API_VERSIONS,
  SCHEMA_READ_RANGE,
  SCHEMA_VERSION,
  canonicalDigest,
  canonicalJson,
  isQueryApiVersion,
  negotiateQueryApiVersion,
  parseJsonStrict,
  validateFamily,
} from '@muxui/schema';
import { runCli } from '../src/cli.mjs';
import { resolvePnpmProjectCatalog } from '../src/pnpm-adapter.mjs';
import { writeProjection } from './support/packed-tuple.mjs';
import { corpus, directGraph, resolve } from './support/resolver-corpus.mjs';

// What a CLI reads is resolver negotiation against the project-declared catalog, tested apart from the range
// tooling declares on `@muxui/catalog`. The resolver cases edit the contract fields of the retained G0.4 catalog; the
// pnpm cases install catalog packages derived from the real one.

/** Resolves the corpus' direct graph after changing the fields of its catalog, release, request, or installed version. */
async function resolveDirect({ catalog = {}, release = {}, request = {}, version } = {}) {
  const value = await corpus();
  const graph = directGraph(value);
  const target = value.catalogs.find(({ id }) => id === graph.expected.catalog);
  const manifest = value.releaseManifests.find(({ id }) => id === target.releaseManifest);
  Object.assign(target, catalog);
  Object.assign(manifest, release);
  Object.assign(graph.request, request);
  if (version !== undefined) {
    Object.assign(target, { version, catalogVersion: version });
    manifest.catalog.version = version;
    graph.workspaces.find(({ path }) => path === graph.selectedWorkspace).catalogRange = version;
    for (const list of [graph.installed, graph.lockfile]) {
      list.find(({ name, workspace }) => name === '@muxui/catalog' && workspace === graph.selectedWorkspace).version = version;
    }
  }
  return resolve(value, graph);
}

const [schemaMajor, schemaMinor] = SCHEMA_VERSION.split('.').map(Number);
const laterPatch = `${schemaMajor}.${schemaMinor}.1`;
const laterMinor = `${schemaMajor}.${schemaMinor + 1}.0`;
const unreadMajor = {
  catalog: { queryApiVersion: '4.0.0', supportedQueryApiVersions: ['4.0.0'] },
  release: { queryApiVersion: '4.0.0' },
};

function assertIncompatible(result, dimension, label) {
  assert.equal(result.type, 'error', label);
  assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE', label);
  assert.deepEqual(
    [...new Set(result.error.details.compatibilityFailures.map((failure) => failure.dimension))],
    [dimension],
    label,
  );
  assert.deepEqual(result.error.details.secondaryFailures, [], label);
  validateFamily('query-envelope', result);
}

test('negotiation picks the highest shared query API version by SemVer precedence and ignores the rest', () => {
  assert.ok(satisfies(SCHEMA_VERSION, SCHEMA_READ_RANGE));
  assert.ok(satisfies(laterPatch, SCHEMA_READ_RANGE));
  assert.ok(!satisfies(laterMinor, SCHEMA_READ_RANGE));
  assert.equal(negotiateQueryApiVersion(['1.1.0', '1.2.0', API_VERSION, '4.0.0']), API_VERSION);
  assert.equal(negotiateQueryApiVersion(['1.1.0', '1.2.0', '4.0.0']), undefined);
  assert.equal(negotiateQueryApiVersion(['2.2.0', '2.1.0', '1.2.0'], ['2.1.0', '2.2.0']), '2.2.0');
  assert.equal(negotiateQueryApiVersion(['2.1.0', '3.0.0'], ['2.1.0', '2.2.0']), '2.1.0');
  // Precedence, not list order or text order: rc.10 follows rc.2, and a release follows its prereleases.
  for (const readable of [['2.1.0-rc.2', '2.1.0-rc.10'], ['2.1.0-rc.10', '2.1.0-rc.2']]) {
    assert.equal(negotiateQueryApiVersion(readable, readable), '2.1.0-rc.10');
  }
  const chain = [
    '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0',
  ];
  chain.slice(1).forEach((version, index) => {
    for (const pair of [[chain[index], version], [version, chain[index]]]) {
      assert.equal(negotiateQueryApiVersion(pair, pair), version, pair.join(' vs '));
    }
  });
  // Build metadata is valid and never part of precedence, so `alpha+build.1` is `alpha`, which sorts below `alpha.1`.
  for (const pair of [['2.1.0-alpha+build.1', '2.1.0-alpha.1'], ['2.1.0-alpha.1', '2.1.0-alpha+build.1']]) {
    assert.equal(negotiateQueryApiVersion(pair, pair), '2.1.0-alpha.1', pair.join(' vs '));
  }
  // Numeric identifiers compare exactly, beyond the 53 bits a Number holds, in the core and in a prerelease.
  for (const [low, high] of [
    ['2.1.0-rc.9007199254740992', '2.1.0-rc.9007199254740993'],
    ['2.1.9007199254740992', '2.1.9007199254740993'],
  ]) {
    for (const pair of [[low, high], [high, low]]) assert.equal(negotiateQueryApiVersion(pair, pair), high, pair.join(' vs '));
  }
  assert.ok(['2.1.0', '2.2.0-rc.1', '0.1.0', '3.0.0+build.1', '2.1.0-alpha+build.1'].every(isQueryApiVersion));
  assert.ok(['not-a-version', '2.1', '02.1.0', '2.1.0+', 'v2.1.0', '', 2.1, null].every((value) => !isQueryApiVersion(value)));
});

test('the current contract is read', async () => {
  const result = await resolveDirect({
    catalog: { queryApiVersion: API_VERSION, supportedQueryApiVersions: [...QUERY_API_VERSIONS] },
    release: { queryApiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION },
  });
  assert.equal(result.type, 'success');
  assert.equal(result.resolution.authority, 'installed-local');
});

test('the retained G0.4 corpus keeps its older tuples and its unsupported-request graph', async () => {
  const value = await corpus();
  const retained = value.catalogs.find(({ id }) => id === 'catalog-compatible');
  assert.deepEqual(retained.supportedQueryApiVersions, ['1.1.0', '1.2.0', '3.0.0']);
  const graph = value.graphs.find(({ id }) => id === 'query-api-version-unsupported');
  assert.equal(resolve(value, graph).error.code, graph.expected.code);
  assert.equal(resolve(value, directGraph(value)).type, 'success');
});

test('supported older and newer tuples are read', async () => {
  const cases = [
    ['an older catalog that lists only the shared version', { catalog: { supportedQueryApiVersions: ['3.0.0'] } }],
    ['a catalog that lists retired and future versions around the shared one', {
      catalog: { supportedQueryApiVersions: ['1.2.0', '3.0.0', '3.1.0', '4.0.0'] },
    }],
    ['a catalog whose current query API tooling does not read', {
      catalog: { queryApiVersion: '3.1.0', supportedQueryApiVersions: ['3.0.0', '3.1.0'] },
      release: { queryApiVersion: '3.1.0' },
    }],
    ['a valid but unknown prerelease in the list', { catalog: { supportedQueryApiVersions: ['3.0.0', '3.1.0-rc.1'] } }],
    ['an unknown version with build metadata', { catalog: { supportedQueryApiVersions: ['3.0.0', '4.0.0+build.1'] } }],
    ['the current schema', { release: { schemaVersion: SCHEMA_VERSION } }],
    ['a later patch of the current schema', { release: { schemaVersion: laterPatch } }],
  ];
  for (const [label, change] of cases) {
    const result = await resolveDirect(change);
    assert.equal(result.type, 'success', label);
    assert.equal(result.resolution.compatibility, 'exact', label);
  }
});

test('a schema-incompatible catalog and an unsupported query API major are MUXUI_CATALOG_INCOMPATIBLE', async () => {
  const cases = [
    ['a query API major tooling does not read', unreadMajor, 'query-api'],
    ['a catalog that supports only retired query APIs', {
      catalog: { queryApiVersion: '1.2.0', supportedQueryApiVersions: ['1.1.0', '1.2.0'] },
      release: { queryApiVersion: '1.2.0' },
    }, 'query-api'],
    ['a schema minor tooling does not implement', { release: { schemaVersion: laterMinor } }, 'schema'],
    ['a schema above the readable range', { release: { schemaVersion: `${schemaMajor + 1}.0.0` } }, 'schema'],
    ['a catalog that needs a newer reader', { catalog: { schemaRange: '^4.1.0' } }, 'schema'],
    ['a superseded schema major', { catalog: { schemaRange: '^3.0.0' }, release: { schemaVersion: '3.0.0' } }, 'schema'],
  ];
  for (const [label, change, dimension] of cases) assertIncompatible(await resolveDirect(change), dimension, label);
});

test('an explicit query API version is rejected only when tooling cannot serve it', async () => {
  const served = await resolveDirect({ request: { queryApiVersion: API_VERSION } });
  assert.equal(served.type, 'success');
  // The retained catalog lists 1.2.0, and a newer catalog lists 3.1.0: tooling reads neither.
  for (const [label, change] of [
    ['a retired version the catalog still lists', { request: { queryApiVersion: '1.2.0' } }],
    ['a newer version the catalog lists', {
      request: { queryApiVersion: '3.1.0' },
      catalog: { supportedQueryApiVersions: ['3.0.0', '3.1.0'] },
    }],
  ]) {
    const result = await resolveDirect(change);
    assert.equal(result.error.code, 'MUXUI_QUERY_API_VERSION_UNSUPPORTED', label);
    assert.deepEqual(result.error.details.compatibilityFailures.map(({ dimension }) => dimension), ['query-api'], label);
    validateFamily('query-envelope', result);
  }
  // Tooling can serve the version, or negotiates one, but the catalog has nothing in common: incompatible, not unsupported.
  assertIncompatible(await resolveDirect(unreadMajor), 'query-api', 'no request');
  assertIncompatible(await resolveDirect({ ...unreadMajor, request: { queryApiVersion: API_VERSION } }), 'query-api', 'explicit current');
});

test('a malformed query API version is invalid input, a well-formed unknown one is not', async () => {
  const malformed = [
    ['a malformed current version', { catalog: { queryApiVersion: 'not-a-version', supportedQueryApiVersions: ['not-a-version'] } }],
    ['a malformed entry beside a readable one', { catalog: { supportedQueryApiVersions: ['not-a-version', API_VERSION] } }],
    ['a malformed request', { request: { queryApiVersion: 'not-a-version' } }],
  ];
  for (const [label, change] of malformed) {
    await assert.rejects(resolveDirect(change), /MUXUI_RESOLVER_INPUT_INVALID/u, label);
  }
});

test('the CLI has no reader for a retired query API version', () => {
  const { exitCode, stdout } = runCli(['manifest', '--query-api-version', '1.2.0', '--json']);
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(stdout).error.code, 'MUXUI_QUERY_INVALID');
});

test('prerelease catalogs with different base versions resolve by declared compatibility, not by the range', async () => {
  // Tooling's own range on the catalog, `^3.0.0-rc.1`, admits 3.0.0-rc.2 but not 3.1.0-rc.1.
  const toolingRange = '^3.0.0-rc.1';
  for (const [version, inToolingRange] of [['3.0.0-rc.2', true], ['3.1.0-rc.1', false]]) {
    assert.equal(satisfies(version, toolingRange), inToolingRange, version);
    const read = await resolveDirect({ version });
    assert.equal(read.type, 'success', version);
    assert.equal(read.resolution.targetPackages['@muxui/catalog'], version);
    // The catalog's own declaration decides both ways: a prerelease inside the range is still rejected when incompatible.
    assertIncompatible(await resolveDirect({ version, ...unreadMajor }), 'query-api', version);
    assertIncompatible(await resolveDirect({ version, release: { schemaVersion: laterMinor } }), 'schema', version);
  }
});

const generatedCatalog = new URL('../../catalog/generated/', import.meta.url);

/**
 * Installs a pnpm project whose only dependency is a catalog package derived from the real one with another contract
 * tuple (the bundle is rebuilt and re-digested, so it stays internally consistent). `identity` stays mutable: change it
 * and `write()` it back.
 */
async function installCatalogProject(fixtureRoot, { version, apiVersion, supported, schemaVersion, shape }) {
  const bundle = parseJsonStrict(await readFile(new URL('catalog.json', generatedCatalog), 'utf8'));
  const identity = parseJsonStrict(await readFile(new URL('catalog-package.json', generatedCatalog), 'utf8'));
  const { catalogDigest: _previous, ...preimage } = bundle;
  const derived = {
    ...preimage,
    catalogVersion: version,
    apiVersion,
    supportedQueryApiVersions: supported,
    schemaVersion,
  };
  shape?.(derived);
  const catalogDigest = canonicalDigest(derived);
  const catalogRoot = join(fixtureRoot, 'catalog');
  const generated = join(catalogRoot, 'generated');
  await mkdir(generated, { recursive: true });
  const writeJson = (path, value) => writeFile(path, `${canonicalJson(value)}\n`);
  await writeJson(join(fixtureRoot, 'package.json'), {
    name: 'p2-1-negotiation-fixture',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@10.33.0',
    dependencies: { '@muxui/catalog': 'workspace:*' },
  });
  await writeFile(join(fixtureRoot, 'pnpm-workspace.yaml'), 'packages:\n  - catalog\n');
  await writeJson(join(catalogRoot, 'package.json'), {
    name: '@muxui/catalog',
    version,
    private: true,
    muxUi: { catalogPackage: './generated/catalog-package.json' },
  });
  await writeProjection(
    join(generated, 'catalog.json'),
    'packages/catalog/generated/catalog.json',
    { ...derived, catalogDigest },
  );
  const project = {
    path: relative(process.cwd(), fixtureRoot).split('\\').join('/'),
    identity: {
      ...identity,
      version,
      catalogVersion: version,
      catalogDigest,
      queryApiVersion: apiVersion,
      supportedQueryApiVersions: supported,
      releaseManifest: {
        ...identity.releaseManifest,
        schemaVersion,
        queryApiVersion: apiVersion,
        catalog: { id: `@muxui/catalog@${version}:${catalogDigest}`, version, digest: catalogDigest },
      },
    },
    write: () => writeProjection(
      join(generated, 'catalog-package.json'),
      'packages/catalog/generated/catalog-package.json',
      project.identity,
    ),
  };
  await project.write();
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts', '--no-frozen-lockfile'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  assert.equal(install.status, 0, install.stderr);
  return project;
}

/** Runs `check` against a catalog project, then removes only the directory created here. */
async function withCatalogProject(options, check) {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.p2-1-negotiation-'));
  try {
    await check(await installCatalogProject(fixtureRoot, options));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test('an installed prerelease catalog from a newer query line is read at the version tooling serves', async () => {
  await withCatalogProject({
    version: '3.1.0-rc.1',
    apiVersion: '3.1.0',
    supported: ['1.2.0', '3.0.0', '3.1.0', '4.0.0+build.1'],
    schemaVersion: SCHEMA_VERSION,
  }, async (project) => {
    const { exitCode, stdout } = runCli(['manifest', '--project', project.path, '--detail', 'brief', '--json']);
    assert.equal(exitCode, 0);
    const response = JSON.parse(stdout);
    assert.equal(response.apiVersion, API_VERSION);
    assert.equal(response.meta.resolution.targetPackages['@muxui/catalog'], '3.1.0-rc.1');

    // The catalog lists 3.1.0, but tooling cannot serve it: an explicit request for it is the one UNSUPPORTED case.
    const requested = resolvePnpmProjectCatalog({ project: project.path, queryApiVersion: '3.1.0' });
    assert.equal(requested.error.code, 'MUXUI_QUERY_API_VERSION_UNSUPPORTED');
    assert.equal(resolvePnpmProjectCatalog({ project: project.path, queryApiVersion: API_VERSION }).type, 'success');

    // A superseded package format has no reader: it is an integrity failure, not a lossy read.
    project.identity.schema = 'muxui-catalog-package-v1';
    await project.write();
    const superseded = resolvePnpmProjectCatalog({ project: project.path });
    assert.equal(superseded.error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
    assert.ok(superseded.error.details.candidates[0].rejectionReasons.includes('catalog-package-schema-mismatch'));
  });
});

test('an installed catalog with an unsupported query API major returns MUXUI_CATALOG_INCOMPATIBLE', async () => {
  await withCatalogProject({
    version: '4.0.0-rc.1',
    apiVersion: '4.0.0',
    supported: ['4.0.0'],
    schemaVersion: SCHEMA_VERSION,
  }, (project) => {
    assertIncompatible(resolvePnpmProjectCatalog({ project: project.path }), 'query-api', 'adapter');
    // Naming the version tooling serves does not turn the catalog's missing support into an unsupported request.
    for (const args of [[], ['--query-api-version', API_VERSION]]) {
      const { exitCode, stdout } = runCli(['get', 'muxui:component:button', '--project', project.path, ...args, '--json']);
      assert.equal(exitCode, 16, args.join(' '));
      assert.equal(JSON.parse(stdout).error.code, 'MUXUI_CATALOG_INCOMPATIBLE', args.join(' '));
    }
  });
});

test('an installed catalog on a newer schema minor is incompatible, not an integrity mismatch', async () => {
  await withCatalogProject({
    version: '3.0.0-rc.2',
    apiVersion: API_VERSION,
    supported: [API_VERSION],
    schemaVersion: laterMinor,
    // The minor's new optional field, which this build's closed record schemas reject.
    shape: (bundle) => { bundle.artifacts.find(({ kind }) => kind === 'component').record.laterOptionalField = true; },
  }, (project) => {
    assertIncompatible(resolvePnpmProjectCatalog({ project: project.path }), 'schema', 'adapter');
    const { exitCode, stdout } = runCli(['manifest', '--project', project.path, '--json']);
    assert.equal(exitCode, 16);
    assert.equal(JSON.parse(stdout).error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
  });
});

test('an installed catalog on an unreadable schema is never inspected for records', async () => {
  await withCatalogProject({
    version: '3.0.0-rc.2',
    apiVersion: API_VERSION,
    supported: [API_VERSION],
    schemaVersion: `${schemaMajor + 1}.0.0`,
    // A later major reshapes the bundle: there is no `artifacts` list to read bindings from.
    shape: (bundle) => { bundle.records = bundle.artifacts; delete bundle.artifacts; },
  }, (project) => {
    assertIncompatible(
      resolvePnpmProjectCatalog({ project: project.path, artifact: 'muxui:component:button', platform: 'web.react' }),
      'schema',
      'adapter',
    );
    const { exitCode, stdout } = runCli(['get', 'muxui:component:button', '--project', project.path, '--platform', 'web.react', '--json']);
    assert.equal(exitCode, 16);
    assert.equal(JSON.parse(stdout).error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
  });
});

test('an installed catalog that lists a malformed query API version fails integrity', async () => {
  await withCatalogProject({
    version: '3.0.0-rc.2',
    apiVersion: API_VERSION,
    supported: ['not-a-version', API_VERSION],
    schemaVersion: SCHEMA_VERSION,
  }, (project) => {
    const { error } = resolvePnpmProjectCatalog({ project: project.path });
    assert.equal(error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
    // Both the package identity and the bundle itself refuse the entry.
    const { rejectionReasons } = error.details.candidates[0];
    assert.ok(rejectionReasons.includes('catalog-package-schema-mismatch'));
    assert.ok(rejectionReasons.includes('catalog-bundle-invalid'));
  });
});
