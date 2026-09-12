import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve as resolvePath } from 'node:path';
import test from 'node:test';
import { canonicalJson, parseJsonStrict, validateFamily } from '@muxui/schema';
import {
  RESOLVER_ERROR_PRECEDENCE,
  resolveCatalogGraph,
} from '../src/local-resolver.mjs';
import { resolvePnpmProjectCatalog } from '../src/pnpm-adapter.mjs';
import { runCli } from '../src/cli.mjs';

const repositoryRoot = resolvePath(import.meta.dirname, '../../..');

function projectCurrentIdentity(value) {
  if (typeof value === 'string') {
    return value
      .replaceAll('core-ui', 'muxui')
      .replaceAll('Core UI', 'Mux UI')
      .replaceAll('core:', 'muxui:')
      .replaceAll('@core-ui/', '@muxui/')
      .replaceAll('coreVersion', 'muxuiVersion')
      .replaceAll('CORE_', 'MUXUI_');
  }
  if (Array.isArray(value)) return value.map(projectCurrentIdentity);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      projectCurrentIdentity(key),
      projectCurrentIdentity(item),
    ]));
  }
  return value;
}

async function corpus() {
  const historicalCorpus = parseJsonStrict(await readFile(
    new URL('../../../tests/fixtures/g0.4/corpus.json', import.meta.url),
    'utf8',
  ));
  return projectCurrentIdentity(historicalCorpus);
}

function resolve(value, graph) {
  const { expected: _expected, ...normalizedGraph } = graph;
  return resolveCatalogGraph({
    packageManager: value.packageManager,
    catalogs: value.catalogs,
    rendererDescriptors: value.rendererDescriptors,
    releaseManifests: value.releaseManifests,
    graph: normalizedGraph,
  });
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function writeJson(path, value) {
  await writeFile(path, `${canonicalJson(value)}\n`);
}

async function writeProjection(path, canonicalPath, value) {
  const bytes = `${canonicalJson(value)}\n`;
  const body = `${canonicalJson({ path: canonicalPath, sha256: sha256(bytes) })}\n`;
  await writeFile(path, bytes);
  await writeFile(
    `${path}.provenance`,
    `// @generated-from: synthetic-g0.4-adapter-fixture\n// @generated-content-sha256: ${sha256(body)}\n${body}`,
  );
}

test('E-G0.4 resolver matrix selects only direct or explicitly addressed catalog authority', async () => {
  const value = await corpus();
  for (const graph of value.graphs) {
    const first = resolve(value, graph);
    const second = resolve(value, graph);
    assert.deepEqual(first, second, `${graph.id} must be deterministic`);
    if (graph.expected.type === 'success') {
      assert.equal(first.type, 'success', graph.id);
      assert.equal(first.resolution.authority, graph.expected.authority, graph.id);
      assert.equal(first.resolution.compatibility, 'exact', graph.id);
      assert.equal(first.catalog.id, graph.expected.catalog, graph.id);
      assert.equal(first.releaseManifest.id, graph.expected.releaseManifest, graph.id);
      assert.equal(first.catalog.id, graph.request.cache ? 'catalog-compatible' : graph.expected.catalog);
      continue;
    }
    assert.equal(first.type, 'error', graph.id);
    assert.equal(first.error.code, graph.expected.code, graph.id);
    assert.deepEqual(
      first.error.details.secondaryFailures.map(({ code }) => code),
      graph.expected.secondaryCodes,
      graph.id,
    );
    assert.equal(
      JSON.stringify(first.error.nextCommand),
      JSON.stringify(graph.expected.nextCommand),
      graph.id,
    );
    validateFamily('query-envelope', first);
  }
  assert.deepEqual(value.errorPrecedence, RESOLVER_ERROR_PRECEDENCE);
});

test('E-G0.4 resolver verifies provenance material instead of trusting fixture flags', async () => {
  const value = await corpus();
  const graph = structuredClone(value.graphs.find(({ id }) => id === 'explicit-cache-compatible'));
  graph.caches.forEach((cache) => { cache.provenanceVerified = false; });
  const resolved = resolve(value, graph);
  assert.equal(resolved.type, 'success');

  const catalog = value.catalogs.find(({ id }) => id === resolved.catalog.id);
  catalog.provenance.value = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const rejected = resolve(value, graph);
  assert.equal(rejected.error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
});

test('E-G1.0-07 resolver rejects a weakened platform-safety requirement digest', async () => {
  const value = await corpus();
  const descriptor = value.rendererDescriptors.find(
    ({ id }) => id === 'renderer-react-compatible',
  );
  descriptor.bindings['muxui:component:button#web.react']
    .platformSafetyRequirementSetDigests['web.react'] = `sha256:${'0'.repeat(64)}`;
  const graph = value.graphs.find(({ id }) => id === 'selected-direct-compatible');
  const result = resolve(value, graph);
  assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
  assert.equal(
    result.error.details.compatibilityFailures.some(
      ({ dimension }) => dimension === 'platform-safety',
    ),
    true,
  );
});

test('E-G1.0-04 compatibility rejects one changed native profile digest', async () => {
  for (const [field, profile, dimension] of [
    ['tokenRequirementSetDigests', 'native.ios', 'token'],
    ['platformSafetyRequirementSetDigests', 'android', 'platform-safety'],
  ]) {
    const value = await corpus();
    value.rendererDescriptors.find(({ id }) => id === 'renderer-native-compatible')
      .bindings['muxui:component:button#native.react-native'][field][profile]
      = `sha256:${'0'.repeat(64)}`;
    const graph = value.graphs.find(({ id }) => id === 'selected-direct-compatible');
    const result = resolve(value, graph);
    assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
    assert.equal(
      result.error.details.compatibilityFailures.some((failure) => failure.dimension === dimension),
      true,
    );
  }
});

test('E-G1.0-04 compatibility rejects jointly stale descriptor and release maps', async () => {
  for (const [field, profile, dimension] of [
    ['tokenRequirementSetDigests', 'web.react', 'token'],
    ['platformSafetyRequirementSetDigests', 'web.react', 'platform-safety'],
  ]) {
    const value = await corpus();
    const staleDigest = `sha256:${'0'.repeat(64)}`;
    value.rendererDescriptors.find(({ id }) => id === 'renderer-react-compatible')
      .bindings['muxui:component:button#web.react'][field][profile] = staleDigest;
    value.releaseManifests.find(({ id }) => id === 'release-compatible')
      .bindings.find(({ binding }) => binding === 'muxui:component:button#web.react')
      [field][profile] = staleDigest;
    const graph = value.graphs.find(({ id }) => id === 'selected-direct-compatible');
    const result = resolve(value, graph);
    assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
    assert.equal(
      result.error.details.compatibilityFailures.some((failure) => failure.dimension === dimension),
      true,
    );
  }
});

test('E-G0.4 explicit cache remains subordinate to manifest and lock authority', async () => {
  const value = await corpus();
  const baseline = value.graphs.find(({ id }) => id === 'explicit-cache-compatible');
  const cases = [
    ['out-of-range', (graph) => {
      graph.workspaces.find(({ path }) => path === graph.selectedWorkspace).catalogRange = '^2.0.0';
    }],
    ['lock-mismatch', (graph) => {
      graph.lockfile.find(({ name }) => name === '@muxui/catalog').version = '1.1.0';
    }],
    ['installed-mismatch', (graph) => {
      graph.installed.push({
        workspace: graph.selectedWorkspace,
        name: '@muxui/catalog',
        version: '1.1.0',
        kind: 'catalog',
        fixture: 'catalog-newer',
        relativePath: `${graph.selectedWorkspace}/node_modules/@muxui/catalog`,
        observedDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      });
    }],
    ['duplicate-lock', (graph) => {
      graph.lockfile.push(structuredClone(
        graph.lockfile.find(({ name }) => name === '@muxui/catalog'),
      ));
    }],
    ['duplicate-installed', (graph) => {
      for (const suffix of ['a', 'b']) graph.installed.push({
        workspace: graph.selectedWorkspace,
        name: '@muxui/catalog',
        version: '1.0.0',
        kind: 'catalog',
        fixture: 'catalog-compatible',
        relativePath: `${graph.selectedWorkspace}/node_modules-${suffix}/@muxui/catalog`,
        observedDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      });
    }],
    ['installed-integrity-mismatch', (graph) => {
      graph.lockfile.find(({ name }) => name === '@muxui/catalog').integrity = 'sha512:locked';
      graph.installed.push({
        workspace: graph.selectedWorkspace,
        name: '@muxui/catalog',
        version: '1.0.0',
        kind: 'catalog',
        fixture: 'catalog-compatible',
        relativePath: `${graph.selectedWorkspace}/node_modules/@muxui/catalog`,
        observedDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        integrity: 'sha512:installed',
      });
    }],
  ];
  for (const [name, mutate] of cases) {
    const graph = structuredClone(baseline);
    mutate(graph);
    const result = resolve(value, graph);
    assert.equal(result.type, 'error', name);
    assert.equal(result.error.code, 'MUXUI_CATALOG_DECLARATION_DRIFT', name);
  }
});

test('G0.4 production resolver input rejects duplicate or undeclared normalized identities', async () => {
  const value = await corpus();
  const duplicate = structuredClone(value);
  duplicate.catalogs.push(structuredClone(duplicate.catalogs[0]));
  assert.throws(
    () => resolve(duplicate, duplicate.graphs[0]),
    /MUXUI_RESOLVER_INPUT_INVALID/,
  );
  const unknown = structuredClone(value.graphs[0]);
  unknown.undocumented = true;
  assert.throws(() => resolve(value, unknown), /MUXUI_RESOLVER_INPUT_INVALID/);

  const tilde = structuredClone(value.graphs.find(({ id }) => id === 'selected-direct-compatible'));
  tilde.workspaces.find(({ path }) => path === tilde.selectedWorkspace).catalogRange = '~1.0.0';
  assert.equal(resolve(value, tilde).type, 'success');

  const duplicateBinding = structuredClone(value);
  duplicateBinding.releaseManifests[0].bindings.push(
    structuredClone(duplicateBinding.releaseManifests[0].bindings[0]),
  );
  assert.throws(
    () => resolve(duplicateBinding, duplicateBinding.graphs[0]),
    /MUXUI_RESOLVER_INPUT_INVALID/,
  );
  const descriptorDrift = structuredClone(value);
  descriptorDrift.releaseManifests[0].bindings[0].descriptor = 'renderer-unknown';
  const descriptorDriftGraph = descriptorDrift.graphs.find(
    ({ id }) => id === 'selected-direct-compatible',
  );
  assert.equal(
    resolve(descriptorDrift, descriptorDriftGraph).error.code,
    'MUXUI_CATALOG_INCOMPATIBLE',
  );
});

test('E-G0.4 resolver diagnostics are relative and privacy-safe', async () => {
  const value = await corpus();
  for (const graph of value.graphs) {
    const bytes = JSON.stringify(resolve(value, graph));
    assert.doesNotMatch(bytes, /(?:\/Users\/|\/home\/|[A-Za-z]:\\\\|credential|password|token=)/iu);
    assert.doesNotMatch(bytes, /https?:\/\/[^\s"]+\?/iu);
  }
  const hostile = structuredClone(value.graphs[0]);
  hostile.selectedWorkspace = '/Users/example/private-consumer';
  const hostileBytes = JSON.stringify(resolve(value, hostile));
  assert.doesNotMatch(hostileBytes, /private-consumer|\/Users\//u);
  assert.equal(JSON.parse(hostileBytes).error.code, 'MUXUI_PROJECT_NOT_FOUND');
});

test('E-G0.4 pnpm adapter resolves the selected direct package and drives the CLI', () => {
  const root = resolvePnpmProjectCatalog();
  assert.equal(root.type, 'success');
  assert.equal(root.package.name, '@muxui/catalog');
  assert.equal(root.package.version, root.package.catalogVersion);
  const response = JSON.parse(runCli(['manifest', '--json']).stdout);
  assert.equal(response.meta.authority, 'installed-local');
  assert.equal(response.meta.resolution.catalogSource, 'project');
  assert.equal(
    response.meta.resolution.targetPackages['@muxui/catalog'],
    root.package.version,
  );

  const selected = JSON.parse(runCli([
    'manifest', '--project', '.', '--json',
  ]).stdout);
  assert.equal(selected.meta.authority, 'installed-local');
  assert.equal(selected.meta.catalogDigest, root.package.catalogDigest);
});

test('E-G0.4 CLI requires exact bindings and filters project-wide discovery', () => {
  const detail = runCli([
    'get', 'muxui:component:button', '--platform', 'web.react', '--json',
  ]);
  assert.equal(detail.exitCode, 16);
  assert.equal(JSON.parse(detail.stdout).error.code, 'MUXUI_CATALOG_INCOMPATIBLE');

  const discovery = runCli(['list', '--platform', 'web.react', '--json']);
  assert.equal(discovery.exitCode, 0);
  const response = JSON.parse(discovery.stdout);
  assert.equal(response.meta.authority, 'installed-local');
  assert.deepEqual(response.meta.resolution.targetPackages, { '@muxui/catalog': '2.0.0' });
  assert.equal(response.data.items.some(({ id }) => id === 'muxui:component:button'), false);
  assert.equal(response.data.items.some(({ id }) => id === 'muxui:example:button-basic-react'), false);
});

test('E-G0.4 pnpm adapter fails closed for missing projects and cache tuples', () => {
  const missing = runCli(['manifest', '--project', 'does-not-exist', '--json']);
  assert.equal(missing.exitCode, 10);
  assert.equal(JSON.parse(missing.stdout).error.code, 'MUXUI_PROJECT_NOT_FOUND');
  const absolute = runCli([
    'manifest', '--project', '/Users/example/private-consumer', '--json',
  ]);
  assert.equal(absolute.exitCode, 2);
  assert.equal(JSON.parse(absolute.stdout).error.code, 'MUXUI_QUERY_INVALID');
  assert.doesNotMatch(absolute.stdout, /\/Users\/|private-consumer/u);
  const hostile = runCli([
    'manifest', '--project', 'does-not-exist;echo-unsafe', '--json',
  ]);
  assert.equal(hostile.exitCode, 2);
  assert.doesNotMatch(hostile.stdout, /echo-unsafe|;/u);

  const selected = resolvePnpmProjectCatalog();
  assert.equal(selected.type, 'success');
  const cache = runCli([
    'manifest',
    '--catalog-version', selected.package.version,
    '--catalog-digest', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '--json',
  ]);
  assert.equal(cache.exitCode, 14);
  assert.equal(JSON.parse(cache.stdout).error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
  assert.doesNotMatch(cache.stdout, /\/Users\//u);
});

test('E-G0.4 pnpm adapter translates malformed project JSON into one typed response', async () => {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.g0-4-malformed-'));
  try {
    await writeFile(join(fixtureRoot, 'package.json'), '{not-json\n');
    const project = relative(process.cwd(), fixtureRoot).split('\\').join('/');
    const result = runCli(['manifest', '--project', project, '--json']);
    assert.equal(result.exitCode, 10);
    assert.equal(JSON.parse(result.stdout).error.code, 'MUXUI_PROJECT_NOT_FOUND');
    assert.doesNotMatch(result.stdout, /\/Users\//u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('E-G0.4 pnpm adapter admits only an exact verified cache tuple', async () => {
  const toolingRoot = resolvePath(import.meta.dirname, '..');
  const catalogRoot = resolvePath(import.meta.dirname, '../../catalog');
  const project = relative(process.cwd(), toolingRoot).split('\\').join('/') || '.';
  const identity = JSON.parse(await readFile(
    join(catalogRoot, 'generated/catalog-package.json'),
    'utf8',
  ));
  const cachePath = join(
    toolingRoot,
    '.cache/muxui/catalogs',
    identity.version,
    identity.catalogDigest.replace(/^sha256:/u, ''),
  );
  const created = !existsSync(cachePath);
  try {
    if (created) {
      await mkdir(join(cachePath, 'generated'), { recursive: true });
      await cp(join(catalogRoot, 'package.json'), join(cachePath, 'package.json'));
      await cp(
        join(catalogRoot, 'generated/catalog-package.json'),
        join(cachePath, 'generated/catalog-package.json'),
      );
      await cp(
        join(catalogRoot, 'generated/catalog-package.json.provenance'),
        join(cachePath, 'generated/catalog-package.json.provenance'),
      );
      await cp(
        join(catalogRoot, 'generated/catalog.json'),
        join(cachePath, 'generated/catalog.json'),
      );
      await cp(
        join(catalogRoot, 'generated/catalog.json.provenance'),
        join(cachePath, 'generated/catalog.json.provenance'),
      );
    }
    const result = runCli([
      'manifest', '--project', project,
      '--catalog-version', identity.version,
      '--catalog-digest', identity.catalogDigest,
      '--json',
    ]);
    assert.equal(result.exitCode, 0);
    const response = JSON.parse(result.stdout);
    assert.equal(response.meta.resolution.catalogSource, 'cache');
    assert.equal(response.meta.catalogDigest, identity.catalogDigest);
    if (created) {
      await appendFile(join(cachePath, 'generated/catalog.json'), ' ');
      const tampered = runCli([
        'manifest', '--project', project,
        '--catalog-version', identity.version,
        '--catalog-digest', identity.catalogDigest,
        '--json',
      ]);
      assert.equal(tampered.exitCode, 14);
      assert.equal(JSON.parse(tampered.stdout).error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
    }
  } finally {
    if (created) await rm(cachePath, { recursive: true, force: true });
  }
});

test('E-G0.4 pnpm adapter normalizes renderer packages into the single resolver', async () => {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.g0-4-pnpm-fixture-'));
  const catalogRoot = join(fixtureRoot, 'catalog');
  const rendererRoot = join(fixtureRoot, 'renderer');
  const generatedCatalog = join(catalogRoot, 'generated');
  const generatedRenderer = join(rendererRoot, 'generated');
  const binding = 'muxui:component:button#web.react';
  try {
    await mkdir(generatedCatalog, { recursive: true });
    await mkdir(generatedRenderer, { recursive: true });
    await writeJson(join(fixtureRoot, 'package.json'), {
      name: 'g0-4-pnpm-fixture',
      version: '1.0.0',
      private: true,
      packageManager: 'pnpm@10.33.0',
      dependencies: {
        '@muxui/catalog': 'workspace:*',
        '@muxui/react': 'workspace:*',
      },
    });
    await writeFile(join(fixtureRoot, 'pnpm-workspace.yaml'), "packages:\n  - catalog\n  - renderer\n");
    await writeJson(join(catalogRoot, 'package.json'), {
      name: '@muxui/catalog',
      version: '2.0.0',
      private: true,
      muxUi: { catalogPackage: './generated/catalog-package.json' },
    });
    await writeJson(join(rendererRoot, 'package.json'), {
      name: '@muxui/react',
      version: '1.0.1',
      private: true,
      exports: { './button': './button.mjs' },
      muxUi: { rendererDescriptor: './generated/renderer-descriptor.json' },
    });
    const sourceCatalogRoot = resolvePath(import.meta.dirname, '../../catalog');
    const bundle = JSON.parse(await readFile(
      join(sourceCatalogRoot, 'generated/catalog.json'),
      'utf8',
    ));
    await cp(
      join(sourceCatalogRoot, 'generated/catalog.json'),
      join(generatedCatalog, 'catalog.json'),
    );
    await cp(
      join(sourceCatalogRoot, 'generated/catalog.json.provenance'),
      join(generatedCatalog, 'catalog.json.provenance'),
    );
    const descriptor = {
      id: 'renderer-react-compatible',
      descriptorVersion: '1.0.0',
      package: '@muxui/react',
      version: '1.0.1',
      bindingSchemaRange: '^2.0.0',
      tokenContractRange: '^2.0.0',
      releaseProvenance: `muxui-release:1.0.1:${bundle.sourceRevision}`,
      bindings: {
        [binding]: {
          specRevision: bundle.artifacts.find(({ id }) => id === 'muxui:component:button')
            .bindingSpecRevisions['web.react'],
          export: '@muxui/react/button',
          lifecycle: 'experimental',
          strategy: 'direct',
          tokenRequirementSetDigests: {
            'web.react': 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          },
          platformSafetyRequirementSetDigests: {
            'web.react': 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          },
        },
      },
    };
    const identity = {
      schema: 'muxui-catalog-package-v2',
      name: '@muxui/catalog',
      version: '2.0.0',
      catalogVersion: '2.0.0',
      catalogDigest: bundle.catalogDigest,
      queryApiVersion: bundle.apiVersion,
      supportedQueryApiVersions: ['1.1.0', '1.2.0', '2.0.0'],
      schemaRange: '^2.0.0',
      sourceRevision: bundle.sourceRevision,
      provenance: { kind: 'source-revision', value: bundle.sourceRevision },
      tokenRequirementSets: {
        [`${binding}:web.react`]: descriptor.bindings[binding]
          .tokenRequirementSetDigests['web.react'],
      },
      platformSafetyContract: {
        version: bundle.platformSafetyContract.contractVersion,
        digest: bundle.platformSafetyContractDigest,
      },
      platformSafetyRequirementSets: {
        [`${binding}:web.react`]: descriptor.bindings[binding]
          .platformSafetyRequirementSetDigests['web.react'],
      },
      releaseManifest: {
        id: descriptor.releaseProvenance,
        releaseVersion: '1.0.1',
        schemaVersion: '2.1.0',
        queryApiVersion: '2.0.0',
        tokenContractVersion: '2.0.0',
        sourceRevision: bundle.sourceRevision,
        catalog: {
          id: `@muxui/catalog@2.0.0:${bundle.catalogDigest}`,
          version: '2.0.0',
          digest: bundle.catalogDigest,
        },
        bindings: [{
          descriptor: descriptor.id,
          binding,
          package: '@muxui/react',
          version: '1.0.1',
          export: descriptor.bindings[binding].export,
          specRevision: descriptor.bindings[binding].specRevision,
          tokenRequirementSetDigests: descriptor.bindings[binding].tokenRequirementSetDigests,
          platformSafetyRequirementSetDigests:
            descriptor.bindings[binding].platformSafetyRequirementSetDigests,
        }],
      },
      bundle: './catalog.json',
    };
    await writeProjection(
      join(generatedCatalog, 'catalog-package.json'),
      'packages/catalog/generated/catalog-package.json',
      identity,
    );
    await writeProjection(
      join(generatedRenderer, 'renderer-descriptor.json'),
      'packages/react/generated/renderer-descriptor.json',
      descriptor,
    );
    const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
      cwd: fixtureRoot,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr);
    const project = relative(process.cwd(), fixtureRoot).split('\\').join('/');
    const resolved = resolvePnpmProjectCatalog({ project, bindings: [binding] });
    assert.equal(resolved.type, 'success');
    const response = resolved.api.getArtifact({
      id: 'muxui:component:button',
      platform: 'web.react',
      detail: 'compact',
      purpose: null,
      section: null,
    });
    assert.equal(response.meta.resolution.targetPackages['@muxui/react'], '1.0.1');
    const cliSuccess = runCli([
      'get', 'muxui:component:button', '--project', project,
      '--platform', 'web.react', '--json',
    ]);
    assert.equal(cliSuccess.exitCode, 0);
    assert.equal(
      JSON.parse(cliSuccess.stdout).meta.resolution.targetPackages['@muxui/react'],
      '1.0.1',
    );

    descriptor.bindings[binding].export = '@muxui/react/unsafe-drift';
    await writeProjection(
      join(generatedRenderer, 'renderer-descriptor.json'),
      'packages/react/generated/renderer-descriptor.json',
      descriptor,
    );
    const incompatible = resolvePnpmProjectCatalog({ project, bindings: [binding] });
    assert.equal(incompatible.type, 'error');
    assert.equal(incompatible.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
    const cliIncompatible = runCli([
      'get', 'muxui:component:button', '--project', project,
      '--platform', 'web.react', '--json',
    ]);
    assert.equal(cliIncompatible.exitCode, 16);

    descriptor.bindings[binding].export = '@muxui/react/button';
    await writeProjection(
      join(generatedRenderer, 'renderer-descriptor.json'),
      'packages/react/generated/renderer-descriptor.json',
      descriptor,
    );
    identity.schema = 'muxui-catalog-package-v2-unknown';
    await writeProjection(
      join(generatedCatalog, 'catalog-package.json'),
      'packages/catalog/generated/catalog-package.json',
      identity,
    );
    const unknownIdentity = resolvePnpmProjectCatalog({ project, bindings: [binding] });
    assert.equal(unknownIdentity.type, 'error');
    assert.equal(unknownIdentity.error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
