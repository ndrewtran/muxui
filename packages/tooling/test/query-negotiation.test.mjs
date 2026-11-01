import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { compare, satisfies } from 'semver';
import {
  API_VERSION,
  QUERY_API_VERSIONS,
  SCHEMA_READ_RANGE,
  SCHEMA_VERSION,
  canonicalDigest,
  canonicalJson,
  negotiateQueryApiVersion,
  parseJsonStrict,
  validateFamily,
} from '@muxui/schema';
import { runCli } from '../src/cli.mjs';
import { resolvePnpmProjectCatalog } from '../src/pnpm-adapter.mjs';
import { writeProjection } from './support/packed-tuple.mjs';
import { corpus, directGraph, resolve } from './support/resolver-corpus.mjs';

// E-P2.1-05: what a CLI reads is resolver negotiation against the project-declared catalog, tested apart from the range
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

const unreadMajor = {
  catalog: { queryApiVersion: '3.0.0', supportedQueryApiVersions: ['3.0.0'] },
  release: { queryApiVersion: '3.0.0' },
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

test('E-P2.1-05 negotiation picks the highest shared query API version and ignores the rest', () => {
  assert.ok(QUERY_API_VERSIONS.every((version, index) => index === 0 || compare(QUERY_API_VERSIONS[index - 1], version) < 0));
  assert.ok(satisfies(SCHEMA_VERSION, SCHEMA_READ_RANGE));
  assert.equal(negotiateQueryApiVersion(['1.1.0', '1.2.0', API_VERSION, '3.0.0', 'not-a-version']), API_VERSION);
  assert.equal(negotiateQueryApiVersion(['1.1.0', '1.2.0', '3.0.0']), undefined);
  assert.equal(negotiateQueryApiVersion(['2.2.0', '2.1.0', '1.2.0'], ['2.1.0', '2.2.0']), '2.2.0');
  assert.equal(negotiateQueryApiVersion(['2.1.0', '3.0.0'], ['2.1.0', '2.2.0']), '2.1.0');
});

test('E-P2.1-05 the current contract is read', async () => {
  const result = await resolveDirect({
    catalog: { queryApiVersion: API_VERSION, supportedQueryApiVersions: [...QUERY_API_VERSIONS] },
    release: { queryApiVersion: API_VERSION, schemaVersion: SCHEMA_VERSION },
  });
  assert.equal(result.type, 'success');
  assert.equal(result.resolution.authority, 'installed-local');
});

test('E-P2.1-05 the retained G0.4 corpus keeps its older tuples and its unsupported-request graph', async () => {
  const value = await corpus();
  const retained = value.catalogs.find(({ id }) => id === 'catalog-compatible');
  assert.deepEqual(retained.supportedQueryApiVersions, ['1.1.0', '1.2.0', '2.1.0']);
  const graph = value.graphs.find(({ id }) => id === 'query-api-version-unsupported');
  assert.equal(resolve(value, graph).error.code, graph.expected.code);
  assert.equal(resolve(value, directGraph(value)).type, 'success');
});

test('E-P2.1-05 supported older and newer tuples are read', async () => {
  const cases = [
    ['an older catalog that lists only the shared version', { catalog: { supportedQueryApiVersions: ['2.1.0'] } }],
    ['a catalog that lists retired and future versions around the shared one', {
      catalog: { supportedQueryApiVersions: ['1.2.0', '2.1.0', '2.2.0', '3.0.0'] },
    }],
    ['a catalog whose current query API tooling does not read', {
      catalog: { queryApiVersion: '2.2.0', supportedQueryApiVersions: ['2.1.0', '2.2.0'] },
      release: { queryApiVersion: '2.2.0' },
    }],
    ['a schema minor above the base', { release: { schemaVersion: '3.1.0' } }],
  ];
  for (const [label, change] of cases) {
    const result = await resolveDirect(change);
    assert.equal(result.type, 'success', label);
    assert.equal(result.resolution.compatibility, 'exact', label);
  }
});

test('E-P2.1-05 a schema-incompatible catalog and an unsupported query API major are MUXUI_CATALOG_INCOMPATIBLE', async () => {
  const cases = [
    ['a query API major tooling does not read', unreadMajor, 'query-api'],
    ['a catalog that supports only retired query APIs', {
      catalog: { queryApiVersion: '1.2.0', supportedQueryApiVersions: ['1.1.0', '1.2.0'] },
      release: { queryApiVersion: '1.2.0' },
    }, 'query-api'],
    ['a schema above the readable range', { release: { schemaVersion: '4.0.0' } }, 'schema'],
    ['a catalog that needs a newer reader', { catalog: { schemaRange: '^3.1.0' } }, 'schema'],
    ['a superseded schema major', { catalog: { schemaRange: '^2.0.0' }, release: { schemaVersion: '2.0.0' } }, 'schema'],
  ];
  for (const [label, change, dimension] of cases) assertIncompatible(await resolveDirect(change), dimension, label);
});

test('E-P2.1-05 an explicit query API version is rejected only when tooling cannot serve it', async () => {
  const served = await resolveDirect({ request: { queryApiVersion: API_VERSION } });
  assert.equal(served.type, 'success');
  // The retained catalog lists 1.2.0, and a newer catalog lists 2.2.0: tooling reads neither.
  for (const [label, change] of [
    ['a retired version the catalog still lists', { request: { queryApiVersion: '1.2.0' } }],
    ['a newer version the catalog lists', {
      request: { queryApiVersion: '2.2.0' },
      catalog: { supportedQueryApiVersions: ['2.1.0', '2.2.0'] },
    }],
  ]) {
    const result = await resolveDirect(change);
    assert.equal(result.error.code, 'MUXUI_QUERY_API_VERSION_UNSUPPORTED', label);
    assert.deepEqual(result.error.details.compatibilityFailures.map(({ dimension }) => dimension), ['query-api'], label);
    validateFamily('query-envelope', result);
  }
  // Without a request, a catalog with nothing in common is incompatible, not an unsupported request.
  assertIncompatible(await resolveDirect(unreadMajor), 'query-api', 'no request');
});

test('E-P2.1-05 the CLI has no reader for a retired query API version', () => {
  const { exitCode, stdout } = runCli(['manifest', '--query-api-version', '1.2.0', '--json']);
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(stdout).error.code, 'MUXUI_QUERY_INVALID');
});

test('E-P2.1-05 prerelease catalogs with different base versions resolve by declared compatibility, not by the range', async () => {
  // Decision 0032 item 8: tooling's own range on the catalog, `^2.1.0-rc.1`, admits 2.1.0-rc.2 but not 2.2.0-rc.1.
  const toolingRange = '^2.1.0-rc.1';
  for (const [version, inToolingRange] of [['2.1.0-rc.2', true], ['2.2.0-rc.1', false]]) {
    assert.equal(satisfies(version, toolingRange), inToolingRange, version);
    const read = await resolveDirect({ version });
    assert.equal(read.type, 'success', version);
    assert.equal(read.resolution.targetPackages['@muxui/catalog'], version);
    // The catalog's own declaration decides both ways: a prerelease inside the range is still rejected when incompatible.
    assertIncompatible(await resolveDirect({ version, ...unreadMajor }), 'query-api', version);
    assertIncompatible(await resolveDirect({ version, release: { schemaVersion: '4.0.0' } }), 'schema', version);
  }
});

const generatedCatalog = new URL('../../catalog/generated/', import.meta.url);

/**
 * Installs a pnpm project whose only dependency is a catalog package derived from the real one with another contract
 * tuple (the bundle is rebuilt and re-digested, so it stays internally consistent). `identity` stays mutable: change it
 * and `write()` it back.
 */
async function installCatalogProject(fixtureRoot, { version, apiVersion, supported, schemaVersion }) {
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

test('E-P2.1-05 an installed prerelease catalog from a newer query line is read at the version tooling serves', async () => {
  await withCatalogProject({
    version: '2.2.0-rc.1',
    apiVersion: '2.2.0',
    supported: ['1.2.0', '2.1.0', '2.2.0'],
    schemaVersion: '3.1.0',
  }, async (project) => {
    const { exitCode, stdout } = runCli(['manifest', '--project', project.path, '--detail', 'brief', '--json']);
    assert.equal(exitCode, 0);
    const response = JSON.parse(stdout);
    assert.equal(response.apiVersion, API_VERSION);
    assert.equal(response.meta.resolution.targetPackages['@muxui/catalog'], '2.2.0-rc.1');

    // The catalog lists 2.2.0, but tooling cannot serve it: an explicit request for it is the one UNSUPPORTED case.
    const requested = resolvePnpmProjectCatalog({ project: project.path, queryApiVersion: '2.2.0' });
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

test('E-P2.1-05 an installed catalog with an unsupported query API major returns MUXUI_CATALOG_INCOMPATIBLE', async () => {
  await withCatalogProject({
    version: '2.1.0-rc.2',
    apiVersion: '3.0.0',
    supported: ['3.0.0'],
    schemaVersion: SCHEMA_VERSION,
  }, (project) => {
    const resolved = resolvePnpmProjectCatalog({ project: project.path });
    assertIncompatible(resolved, 'query-api', 'adapter');
    const { exitCode, stdout } = runCli(['manifest', '--project', project.path, '--json']);
    assert.equal(exitCode, 16);
    assert.equal(JSON.parse(stdout).error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
  });
});
