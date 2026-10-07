import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canonicalDigest,
  parseJsonStrict,
} from '../../../packages/schema/src/index.mjs';

const CORPUS_SCHEMA = 'core-ui-resolver-fixture-corpus-v1';
const ERROR_PRECEDENCE = [
  'CORE_PROJECT_NOT_FOUND',
  'CORE_CATALOG_NOT_DECLARED',
  'CORE_CATALOG_NOT_INSTALLED',
  'CORE_CATALOG_DECLARATION_DRIFT',
  'CORE_CATALOG_INTEGRITY_MISMATCH',
  'CORE_CATALOG_RESOLUTION_AMBIGUOUS',
  'CORE_QUERY_API_VERSION_UNSUPPORTED',
  'CORE_CATALOG_INCOMPATIBLE',
];
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

function fail(message) {
  throw new Error(`CORE_RESOLVER_FIXTURE_INVALID: ${message}`);
}

function object(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be an object`);
  }
  return value;
}

function closed(value, allowed, name) {
  object(value, name);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${name} has unknown field ${unexpected[0]}`);
}

function required(value, keys, name) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${name} is missing ${key}`);
  }
}

function relativePath(value, name) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.split('/').includes('..')
  ) {
    fail(`${name} must be workspace-relative`);
  }
}

function uniqueBy(values, key, name) {
  if (!Array.isArray(values)) fail(`${name} must be an array`);
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value[key])) fail(`${name} has duplicate ${key} ${value[key]}`);
    seen.add(value[key]);
  }
}

function sortedIds(values, name) {
  const ids = values.map(({ id }) => id);
  assert.deepEqual(ids, [...ids].sort(), `${name} must use stable id ordering`);
}

function validateCatalog(catalog) {
  const fields = [
    'id', 'name', 'version', 'catalogVersion', 'catalogDigest', 'queryApiVersion',
    'supportedQueryApiVersions',
    'schemaRange', 'sourceRevision', 'provenance', 'releaseManifest',
    'tokenRequirementSets', 'platformSafetyRequirementSets',
  ];
  closed(catalog, fields, `catalog ${catalog.id ?? '<unknown>'}`);
  required(catalog, fields, `catalog ${catalog.id ?? '<unknown>'}`);
  if (catalog.name !== '@core-ui/catalog') fail(`${catalog.id} has the wrong package name`);
  if (!SEMVER.test(catalog.version) || catalog.catalogVersion !== catalog.version) {
    fail(`${catalog.id} package and catalog versions must match`);
  }
  if (!DIGEST.test(catalog.catalogDigest) || !DIGEST.test(catalog.sourceRevision)) {
    fail(`${catalog.id} has an invalid digest`);
  }
  closed(catalog.provenance, ['kind', 'value'], `${catalog.id}.provenance`);
  required(catalog.provenance, ['kind', 'value'], `${catalog.id}.provenance`);
  if (
    catalog.provenance.kind !== 'source-revision'
    || catalog.provenance.value !== catalog.sourceRevision
  ) {
    fail(`${catalog.id} provenance must bind its source revision`);
  }
  for (const field of ['tokenRequirementSets', 'platformSafetyRequirementSets']) {
    object(catalog[field], `${catalog.id}.${field}`);
    if (!Object.values(catalog[field]).every((digest) => DIGEST.test(digest))) {
      fail(`${catalog.id}.${field} has an invalid digest`);
    }
  }
}

function validateDescriptor(descriptor) {
  const fields = [
    'id', 'descriptorVersion', 'package', 'version', 'bindingSchemaRange',
    'tokenContractRange', 'releaseProvenance', 'bindings',
  ];
  closed(descriptor, fields, `descriptor ${descriptor.id ?? '<unknown>'}`);
  required(descriptor, fields, `descriptor ${descriptor.id ?? '<unknown>'}`);
  if (!SEMVER.test(descriptor.descriptorVersion) || !SEMVER.test(descriptor.version)) {
    fail(`${descriptor.id} has an invalid version`);
  }
  object(descriptor.bindings, `${descriptor.id}.bindings`);
  if (Object.keys(descriptor.bindings).length === 0) fail(`${descriptor.id} has no bindings`);
  for (const [bindingId, binding] of Object.entries(descriptor.bindings)) {
    if (!/^core:component:[a-z0-9-]+#(?:web\.[a-z-]+|native\.[a-z-]+)$/.test(bindingId)) {
      fail(`${descriptor.id} has invalid binding ${bindingId}`);
    }
    const bindingFields = [
      'specRevision', 'export', 'lifecycle', 'strategy', 'tokenRequirementSetDigests',
      'platformSafetyRequirementSetDigests',
    ];
    closed(binding, bindingFields, `${descriptor.id}.${bindingId}`);
    required(binding, bindingFields, `${descriptor.id}.${bindingId}`);
    if (
      !DIGEST.test(binding.specRevision)
      || !Object.values(binding.tokenRequirementSetDigests).every((digest) => DIGEST.test(digest))
      || !Object.values(binding.platformSafetyRequirementSetDigests).every((digest) => DIGEST.test(digest))
    ) {
      fail(`${descriptor.id}.${bindingId} has an invalid revision`);
    }
    if (!binding.export.startsWith(`${descriptor.package}/`)) {
      fail(`${descriptor.id}.${bindingId} export does not belong to its package`);
    }
  }
}

function validateRelease(release, catalogs, descriptors) {
  const fields = [
    'id', 'releaseVersion', 'schemaVersion', 'queryApiVersion',
    'tokenContractVersion', 'sourceRevision', 'catalog', 'bindings',
  ];
  closed(release, fields, `release ${release.id ?? '<unknown>'}`);
  required(release, fields, `release ${release.id ?? '<unknown>'}`);
  if (!DIGEST.test(release.sourceRevision)) fail(`${release.id} has invalid source revision`);
  closed(release.catalog, ['id', 'version', 'digest'], `${release.id}.catalog`);
  required(release.catalog, ['id', 'version', 'digest'], `${release.id}.catalog`);
  const catalog = catalogs.get(release.catalog.id);
  if (
    !catalog
    || catalog.version !== release.catalog.version
    || catalog.catalogDigest !== release.catalog.digest
    || catalog.sourceRevision !== release.sourceRevision
    || catalog.releaseManifest !== release.id
  ) {
    fail(`${release.id} catalog tuple does not match its package`);
  }
  if (!Array.isArray(release.bindings) || release.bindings.length === 0) {
    fail(`${release.id} must aggregate at least one binding`);
  }
  for (const binding of release.bindings) {
    const bindingFields = [
      'descriptor', 'binding', 'package', 'version', 'export', 'specRevision',
      'tokenRequirementSetDigests',
      'platformSafetyRequirementSetDigests',
    ];
    closed(binding, bindingFields, `${release.id}.binding`);
    required(binding, bindingFields, `${release.id}.binding`);
    const descriptor = descriptors.get(binding.descriptor);
    const described = descriptor?.bindings[binding.binding];
    if (
      !descriptor
      || descriptor.releaseProvenance !== release.id
      || descriptor.package !== binding.package
      || descriptor.version !== binding.version
      || described?.export !== binding.export
      || described?.specRevision !== binding.specRevision
      || JSON.stringify(described?.tokenRequirementSetDigests) !== JSON.stringify(binding.tokenRequirementSetDigests)
      || JSON.stringify(described?.platformSafetyRequirementSetDigests) !== JSON.stringify(binding.platformSafetyRequirementSetDigests)
    ) {
      fail(`${release.id} binding tuple does not match ${binding.descriptor}`);
    }
  }
}

function validateExpected(expected, codes, catalogs, releases, graphId) {
  object(expected, `${graphId}.expected`);
  if (expected.type === 'success') {
    const fields = ['type', 'authority', 'catalog', 'releaseManifest'];
    closed(expected, fields, `${graphId}.expected`);
    required(expected, fields, `${graphId}.expected`);
    if (
      expected.authority !== 'installed-local'
      || !catalogs.has(expected.catalog)
      || !releases.has(expected.releaseManifest)
    ) {
      fail(`${graphId} has an invalid success tuple`);
    }
    return;
  }
  const fields = ['type', 'code', 'secondaryCodes', 'nextCommand'];
  closed(expected, fields, `${graphId}.expected`);
  required(expected, fields, `${graphId}.expected`);
  if (expected.type !== 'error' || !codes.has(expected.code)) {
    fail(`${graphId} has an invalid primary error`);
  }
  if (!Array.isArray(expected.secondaryCodes)) fail(`${graphId} secondaryCodes must be an array`);
  const primaryIndex = ERROR_PRECEDENCE.indexOf(expected.code);
  for (const code of expected.secondaryCodes) {
    if (!codes.has(code) || ERROR_PRECEDENCE.indexOf(code) <= primaryIndex) {
      fail(`${graphId} secondary code ${code} violates precedence`);
    }
  }
  closed(
    expected.nextCommand,
    ['command', 'effect', 'requiresConfirmation'],
    `${graphId}.expected.nextCommand`,
  );
  required(
    expected.nextCommand,
    ['command', 'effect', 'requiresConfirmation'],
    `${graphId}.expected.nextCommand`,
  );
  if (
    expected.nextCommand.effect !== 'read-only'
    || expected.nextCommand.requiresConfirmation !== false
    || !expected.nextCommand.command.startsWith('pnpm ')
  ) {
    fail(`${graphId} must use a privacy-safe read-only next command`);
  }
}

export function validateResolverFixtureCorpus(corpus) {
  const topFields = [
    'schema', 'packageManager', 'errorPrecedence', 'catalogs',
    'rendererDescriptors', 'releaseManifests', 'graphs',
  ];
  closed(corpus, topFields, 'corpus');
  required(corpus, topFields, 'corpus');
  if (corpus.schema !== CORPUS_SCHEMA) fail('unsupported corpus schema');
  closed(corpus.packageManager, ['name', 'version', 'lockfileVersion'], 'packageManager');
  required(corpus.packageManager, ['name', 'version', 'lockfileVersion'], 'packageManager');
  if (
    corpus.packageManager.name !== 'pnpm'
    || corpus.packageManager.version !== '10.33.0'
    || corpus.packageManager.lockfileVersion !== '9.0'
  ) {
    fail('Foundation fixtures must use the accepted pnpm toolchain');
  }
  assert.deepEqual(corpus.errorPrecedence, ERROR_PRECEDENCE);

  uniqueBy(corpus.catalogs, 'id', 'catalogs');
  uniqueBy(corpus.rendererDescriptors, 'id', 'rendererDescriptors');
  uniqueBy(corpus.releaseManifests, 'id', 'releaseManifests');
  uniqueBy(corpus.graphs, 'id', 'graphs');
  sortedIds(corpus.catalogs, 'catalogs');
  sortedIds(corpus.rendererDescriptors, 'rendererDescriptors');
  sortedIds(corpus.releaseManifests, 'releaseManifests');
  sortedIds(corpus.graphs, 'graphs');

  for (const catalog of corpus.catalogs) validateCatalog(catalog);
  for (const descriptor of corpus.rendererDescriptors) validateDescriptor(descriptor);
  const catalogs = new Map(corpus.catalogs.map((value) => [value.id, value]));
  const descriptors = new Map(corpus.rendererDescriptors.map((value) => [value.id, value]));
  for (const release of corpus.releaseManifests) {
    validateRelease(release, catalogs, descriptors);
  }
  const releases = new Map(corpus.releaseManifests.map((value) => [value.id, value]));
  const codes = new Set(ERROR_PRECEDENCE);

  for (const graph of corpus.graphs) {
    const fields = [
      'id', 'selectedWorkspace', 'workspaceRoot', 'workspaces', 'lockfile',
      'installed', 'caches', 'request', 'expected',
    ];
    closed(graph, fields, `graph ${graph.id ?? '<unknown>'}`);
    required(graph, fields, `graph ${graph.id ?? '<unknown>'}`);
    relativePath(graph.selectedWorkspace, `${graph.id}.selectedWorkspace`);
    relativePath(graph.workspaceRoot, `${graph.id}.workspaceRoot`);
    uniqueBy(graph.workspaces, 'path', `${graph.id}.workspaces`);
    for (const workspace of graph.workspaces) {
      const workspaceFields = ['path', 'name', 'packageManager', 'catalogRange'];
      closed(workspace, workspaceFields, `${graph.id}.workspace`);
      required(workspace, workspaceFields, `${graph.id}.workspace`);
      relativePath(workspace.path, `${graph.id}.workspace.path`);
    }
    for (const lock of graph.lockfile) {
      const lockFields = ['workspace', 'name', 'version', 'integrity'];
      closed(lock, lockFields, `${graph.id}.lockfile`);
      required(lock, lockFields, `${graph.id}.lockfile`);
      relativePath(lock.workspace, `${graph.id}.lockfile.workspace`);
    }
    for (const installed of graph.installed) {
      const installedFields = [
        'workspace', 'name', 'version', 'kind', 'fixture', 'relativePath',
        'observedDigest',
      ];
      closed(installed, installedFields, `${graph.id}.installed`);
      required(installed, installedFields, `${graph.id}.installed`);
      relativePath(installed.workspace, `${graph.id}.installed.workspace`);
      relativePath(installed.relativePath, `${graph.id}.installed.relativePath`);
      const fixture = installed.kind === 'catalog'
        ? catalogs.get(installed.fixture)
        : descriptors.get(installed.fixture);
      const fixturePackage = installed.kind === 'catalog' ? fixture?.name : fixture?.package;
      if (!fixture || fixturePackage !== installed.name || fixture.version !== installed.version) {
        fail(`${graph.id} installed package does not match ${installed.fixture}`);
      }
    }
    for (const cache of graph.caches) {
      const cacheFields = [
        'catalog', 'version', 'digest', 'relativePath', 'provenanceVerified',
      ];
      closed(cache, cacheFields, `${graph.id}.cache`);
      required(cache, cacheFields, `${graph.id}.cache`);
      relativePath(cache.relativePath, `${graph.id}.cache.relativePath`);
      const catalog = catalogs.get(cache.catalog);
      if (
        !catalog
        || catalog.version !== cache.version
        || catalog.catalogDigest !== cache.digest
      ) {
        fail(`${graph.id} cache does not match ${cache.catalog}`);
      }
    }
    closed(graph.request, ['bindings', 'cache', 'queryApiVersion'], `${graph.id}.request`);
    required(graph.request, ['bindings', 'cache'], `${graph.id}.request`);
    if (!Array.isArray(graph.request.bindings)) {
      fail(`${graph.id} request bindings must be an array`);
    }
    if (
      graph.request.bindings.length === 0
      && graph.request.queryApiVersion === undefined
    ) {
      fail(`${graph.id} request must name a binding or query API version`);
    }
    if (
      graph.request.queryApiVersion !== undefined
      && !['1.1.0', '1.2.0', '2.1.0'].includes(graph.request.queryApiVersion)
    ) {
      fail(`${graph.id} request queryApiVersion is not admitted`);
    }
    if (graph.request.cache !== null) {
      closed(graph.request.cache, ['version', 'digest'], `${graph.id}.request.cache`);
      required(graph.request.cache, ['version', 'digest'], `${graph.id}.request.cache`);
      if (!SEMVER.test(graph.request.cache.version) || !DIGEST.test(graph.request.cache.digest)) {
        fail(`${graph.id} explicit cache selection must name version and digest`);
      }
    }
    validateExpected(graph.expected, codes, catalogs, releases, graph.id);
  }

  const exercised = corpus.graphs
    .filter(({ expected }) => expected.type === 'error')
    .map(({ expected }) => expected.code);
  assert.deepEqual([...new Set(exercised)].sort(), [...ERROR_PRECEDENCE].sort());
  const direct = corpus.graphs.find(({ id }) => id === 'selected-direct-compatible');
  assert.ok(direct.workspaces.some(({ path }) => path === '.'));
  assert.ok(direct.workspaces.some(({ path }) => path === 'apps/sibling'));
  assert.ok(direct.caches.some(({ catalog }) => catalog === 'catalog-newer'));
  assert.equal(direct.expected.catalog, 'catalog-compatible');

  return Object.freeze({ corpus, digest: canonicalDigest(corpus) });
}

async function readCorpus() {
  const bytes = await readFile(new URL('corpus.json', import.meta.url), 'utf8');
  return parseJsonStrict(bytes);
}

test('G0.4 entry corpus provides deterministic renderer and package-graph fixtures', async () => {
  const first = validateResolverFixtureCorpus(await readCorpus());
  const second = validateResolverFixtureCorpus(await readCorpus());
  assert.equal(first.digest, second.digest);
  assert.equal(first.corpus.rendererDescriptors.length, 3);
  assert.equal(first.corpus.graphs.length, 10);
});

test('G0.4 entry corpus rejects malformed or duplicate fixture authority', async () => {
  const corpus = await readCorpus();
  const mutations = [
    (value) => { value.undocumented = true; },
    (value) => { value.packageManager.name = 'npm'; },
    (value) => { value.catalogs[0].catalogVersion = '2.0.0'; },
    (value) => { value.releaseManifests[0].bindings[0].specRevision = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'; },
    (value) => { value.graphs[0].selectedWorkspace = '/private/consumer'; },
    (value) => { value.graphs[0].expected.code = 'CORE_UNDECLARED_ERROR'; },
    (value) => { value.graphs.push(structuredClone(value.graphs[0])); },
  ];
  for (const mutate of mutations) {
    const malformed = structuredClone(corpus);
    mutate(malformed);
    assert.throws(() => validateResolverFixtureCorpus(malformed));
  }
});

test('G0.4 entry fixtures remain test-only and expose no consumer-local authority', async () => {
  const corpusBytes = await readFile(new URL('corpus.json', import.meta.url), 'utf8');
  const packageManifest = parseJsonStrict(await readFile(
    new URL('../../../packages/tooling/package.json', import.meta.url),
    'utf8',
  ));
  assert.ok(Object.values(packageManifest.exports).every((path) => !path.includes('/test/')));
  assert.doesNotMatch(corpusBytes, /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\|credential|password|token=|https?:\/\/[^\s"]+\?)/i);
});
