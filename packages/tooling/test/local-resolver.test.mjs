import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve as resolvePath } from 'node:path';
import test from 'node:test';
import { canonicalJson, parseJsonStrict, validateFamily } from '@muxui/schema';
import { RESOLVER_ERROR_PRECEDENCE } from '../src/local-resolver.mjs';
import { resolvePnpmProjectCatalog } from '../src/pnpm-adapter.mjs';
import { runCli } from '../src/cli.mjs';
import { compileFixtureBundle } from './pattern-fixture.mjs';
import { packWorkspacePackage, writeProjection } from './support/packed-tuple.mjs';
import { corpus, directGraph, resolve } from './support/resolver-corpus.mjs';

const repositoryRoot = resolvePath(import.meta.dirname, '../../..');

async function writeJson(path, value) {
  await writeFile(path, `${canonicalJson(value)}\n`);
}

const tokenDigest = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const safetyDigest = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

/**
 * The renderer descriptor and catalog identity for a renderer that installs `installed` of the catalog's `bindings` (web.react
 * binding refs). Like the real catalog, the release lists every binding; a renderer that lacks one is simply missing it.
 */
function rendererDocuments(bundle, bindings, installed) {
  const artifactOf = (binding) => bundle.artifacts.find(({ id }) => id === binding.split('#')[0]);
  const specRevisionOf = (binding) => artifactOf(binding).bindingSpecRevisions[binding.split('#')[1]];
  const descriptor = {
    id: 'renderer-react-compatible',
    descriptorVersion: '1.0.0',
    package: '@muxui/react',
    version: '1.0.1',
    bindingSchemaRange: '^3.0.0',
    tokenContractRange: '^2.0.0',
    bindings: Object.fromEntries(installed.map((binding) => {
      const [id] = binding.split('#');
      return [binding, {
        specRevision: specRevisionOf(binding),
        export: `@muxui/react/${id.split(':').at(-1)}#${artifactOf(binding).name}`,
        lifecycle: 'experimental',
        strategy: 'direct',
        tokenRequirementSetDigests: { 'web.react': tokenDigest },
        platformSafetyRequirementSetDigests: { 'web.react': safetyDigest },
      }];
    })),
  };
  const identity = {
    schema: 'muxui-catalog-package-v2',
    name: '@muxui/catalog',
    version: '2.1.0',
    catalogVersion: '2.1.0',
    catalogDigest: bundle.catalogDigest,
    queryApiVersion: bundle.apiVersion,
    supportedQueryApiVersions: ['2.1.0'],
    schemaRange: '^3.0.0',
    sourceRevision: bundle.sourceRevision,
    provenance: { kind: 'source-revision', value: bundle.sourceRevision },
    tokenRequirementSets: Object.fromEntries(bindings.map((binding) => [`${binding}:web.react`, tokenDigest])),
    platformSafetyContract: {
      version: bundle.platformSafetyContract.contractVersion,
      digest: bundle.platformSafetyContractDigest,
    },
    platformSafetyRequirementSets: Object.fromEntries(bindings.map((binding) => [`${binding}:web.react`, safetyDigest])),
    releaseManifest: {
      id: `muxui-release:1.0.1:${bundle.sourceRevision}`,
      releaseVersion: '1.0.1',
      schemaVersion: '3.0.0',
      queryApiVersion: '2.1.0',
      tokenContractVersion: '2.0.0',
      sourceRevision: bundle.sourceRevision,
      catalog: {
        id: `@muxui/catalog@2.1.0:${bundle.catalogDigest}`,
        version: '2.1.0',
        digest: bundle.catalogDigest,
      },
      bindings: bindings.map((binding) => ({
        descriptor: descriptor.id,
        binding,
        package: '@muxui/react',
        versionRange: '^1.0.0-0',
        exportName: artifactOf(binding).name,
        specRevision: specRevisionOf(binding),
        tokenRequirementSetDigests: { 'web.react': tokenDigest },
        platformSafetyRequirementSetDigests: { 'web.react': safetyDigest },
      })),
    },
    bundle: './catalog.json',
  };
  return { descriptor, identity };
}

/**
 * Writes a pnpm project under `fixtureRoot` whose catalog package holds `bundle`
 * (`writeBundle` copies its files) and whose renderer package can install any of
 * `bindings`, all of which the release lists. `installed` is the subset the
 * renderer descriptor provides. The returned `descriptor` and `identity` stay mutable: change them,
 * `write()` them back, or `install(list)` a different subset.
 */
async function createRendererProject(fixtureRoot, { bundle, writeBundle, bindings, installed = bindings }) {
  const catalogRoot = join(fixtureRoot, 'catalog');
  const rendererRoot = join(fixtureRoot, 'renderer');
  const generatedCatalog = join(catalogRoot, 'generated');
  const generatedRenderer = join(rendererRoot, 'generated');
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
    version: '2.1.0',
    private: true,
    muxUi: { catalogPackage: './generated/catalog-package.json' },
  });
  await writeJson(join(rendererRoot, 'package.json'), {
    name: '@muxui/react',
    version: '1.0.1',
    private: true,
    exports: Object.fromEntries(bindings.map((binding) => {
      const slug = binding.split('#')[0].split(':').at(-1);
      return [`./${slug}`, `./${slug}.mjs`];
    })),
    muxUi: { rendererDescriptor: './generated/renderer-descriptor.json' },
  });
  await writeBundle(generatedCatalog);
  const project = {
    path: relative(process.cwd(), fixtureRoot).split('\\').join('/'),
    ...rendererDocuments(bundle, bindings, installed),
    async write() {
      await writeProjection(
        join(generatedCatalog, 'catalog-package.json'),
        'packages/catalog/generated/catalog-package.json',
        project.identity,
      );
      await writeProjection(
        join(generatedRenderer, 'renderer-descriptor.json'),
        'packages/react/generated/renderer-descriptor.json',
        project.descriptor,
      );
    },
    async install(list) {
      Object.assign(project, rendererDocuments(bundle, bindings, list));
      await project.write();
    },
  };
  await project.write();
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  assert.equal(install.status, 0, install.stderr);
  return project;
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

const reactDescriptor = (value) => value.rendererDescriptors.find(({ id }) => id === 'renderer-react-compatible');

/** The renderer package of the corpus' direct graph, installed and locked at `version`. */
function installRenderer(value, version) {
  const graph = directGraph(value);
  reactDescriptor(value).version = version;
  for (const list of [graph.installed, graph.lockfile]) {
    list.find(({ name }) => name === '@muxui/react').version = version;
  }
  return graph;
}

test('binding compatibility survives a catalog-only or renderer-only change', async () => {
  // Catalog-only: rebuilt from other sources, so its source revision, release id and digest differ while the bindings do not.
  const rebuilt = await corpus();
  const graph = directGraph(rebuilt);
  const catalog = rebuilt.catalogs.find(({ id }) => id === 'catalog-compatible');
  const release = rebuilt.releaseManifests.find(({ id }) => id === catalog.releaseManifest);
  const digest = `sha256:${'4'.repeat(64)}`;
  const sourceRevision = `sha256:${'3'.repeat(64)}`;
  Object.assign(catalog, { catalogDigest: digest, sourceRevision, releaseManifest: 'release-compatible-rebuilt' });
  catalog.provenance.value = sourceRevision;
  Object.assign(release, { id: 'release-compatible-rebuilt', sourceRevision });
  release.catalog.digest = digest;
  graph.installed.find(({ fixture }) => fixture === catalog.id).observedDigest = digest;
  const catalogOnly = resolve(rebuilt, graph);
  assert.equal(catalogOnly.type, 'success');
  assert.equal(catalogOnly.releaseManifest.id, 'release-compatible-rebuilt');

  // Renderer-only: a later build inside the binding's range, with the same descriptor content.
  const upgraded = await corpus();
  const rendererOnly = resolve(upgraded, installRenderer(upgraded, '1.0.7'));
  assert.equal(rendererOnly.type, 'success');
  assert.equal(rendererOnly.resolution.targetPackages['@muxui/react'], '1.0.7');
});

test('binding compatibility rejects a renderer build outside the binding version range', async () => {
  // The range is `^1.0.0-0`: another major, an earlier minor line, and a prerelease of a later minor are all outside it.
  for (const version of ['2.0.0', '0.9.0', '1.1.0-rc.1']) {
    const value = await corpus();
    const result = resolve(value, installRenderer(value, version));
    assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE', version);
    assert.deepEqual(
      result.error.details.compatibilityFailures.map(({ dimension, required, actual }) => [dimension, required, actual]),
      [['renderer-package', '@muxui/react@^1.0.0-0', `@muxui/react@${version}`]],
      version,
    );
    validateFamily('query-envelope', result);
  }
});

test('binding compatibility requires the descriptor export to be the binding component', async () => {
  for (const member of ['Slider', 'DefinitelyMissing']) {
    for (const specifier of ['@muxui/react/button', '@muxui/react']) {
      const value = await corpus();
      reactDescriptor(value).bindings['muxui:component:button#web.react'].export = `${specifier}#${member}`;
      const result = resolve(value, directGraph(value));
      assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE', `${specifier}#${member}`);
      assert.deepEqual(
        result.error.details.compatibilityFailures.map(({ dimension, required, actual }) => [dimension, required, actual]),
        [['export', '@muxui/react[/<subpath>]#Button', `${specifier}#${member}`]],
      );
    }
  }
  // Another package, or no member at all, is not the binding either.
  for (const identity of ['@muxui/other/button#Button', '@muxui/react/button']) {
    const value = await corpus();
    reactDescriptor(value).bindings['muxui:component:button#web.react'].export = identity;
    assert.deepEqual(
      resolve(value, directGraph(value)).error.details.compatibilityFailures.map(({ dimension }) => dimension),
      ['export'],
      identity,
    );
  }
});

test('a descriptor\'s pack-time provenance is accepted and never compared', async () => {
  const plain = await corpus();
  const baseline = resolve(plain, directGraph(plain));
  assert.equal(baseline.type, 'success');
  // Whatever release and commit the renderer was packed for, the resolution is the same as without them.
  for (const provenance of [
    { releaseId: 'muxui-portfolio:a', sourceCommit: 'a'.repeat(40) },
    { releaseId: 'muxui-portfolio:b', sourceCommit: 'b'.repeat(40) },
  ]) {
    const value = await corpus();
    reactDescriptor(value).provenance = provenance;
    assert.deepEqual(resolve(value, directGraph(value)), baseline);
  }
  // The shape stays closed: provenance names the release and the commit and nothing else.
  const value = await corpus();
  reactDescriptor(value).provenance = { releaseId: 'muxui-portfolio:a', sourceCommit: 'a'.repeat(40), catalogDigest: 'x' };
  assert.throws(() => resolve(value, directGraph(value)), /MUXUI_RESOLVER_INPUT_INVALID: .*provenance has unknown field catalogDigest/u);
});

test('binding compatibility reports a descriptor field the renderer left out as incompatible', async () => {
  for (const [field, dimension] of [
    ['specRevision', 'binding-spec'],
    ['export', 'export'],
    ['tokenRequirementSetDigests', 'token'],
    ['platformSafetyRequirementSetDigests', 'platform-safety'],
  ]) {
    const value = await corpus();
    delete reactDescriptor(value).bindings['muxui:component:button#web.react'][field];
    const result = resolve(value, directGraph(value));
    assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE', field);
    assert.deepEqual(
      result.error.details.compatibilityFailures.map((failure) => [failure.dimension, failure.actual]),
      [[dimension, 'missing']],
      field,
    );
    validateFamily('query-envelope', result);
  }
});

test('resolver ranges keep prerelease versions on their own line', async () => {
  // `^2.1.0-rc.1` admits later builds of 2.1.0 but not the prerelease line of 2.2.0, for the project-declared catalog range too.
  for (const [version, admitted] of [['2.1.0-rc.2', true], ['2.1.0', true], ['2.2.0-rc.1', false]]) {
    const value = await corpus();
    const graph = directGraph(value);
    const consumer = graph.workspaces.find(({ path }) => path === graph.selectedWorkspace);
    consumer.catalogRange = '^2.1.0-rc.1';
    const catalog = value.catalogs.find(({ id }) => id === 'catalog-compatible');
    Object.assign(catalog, { version, catalogVersion: version });
    value.releaseManifests.find(({ id }) => id === catalog.releaseManifest).catalog.version = version;
    for (const list of [graph.installed, graph.lockfile]) {
      list.find(({ name, workspace }) => name === '@muxui/catalog' && workspace === graph.selectedWorkspace).version = version;
    }
    const result = resolve(value, graph);
    if (admitted) assert.equal(result.type, 'success', version);
    else assert.equal(result.error.code, 'MUXUI_CATALOG_DECLARATION_DRIFT', version);
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
  const malformedQuery = structuredClone(value.graphs[0]);
  malformedQuery.request.queryApiVersion = 'latest';
  assert.throws(() => resolve(value, malformedQuery), /MUXUI_RESOLVER_INPUT_INVALID/);

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

test('E-G0.4 resolver takes pnpm store paths as relative paths and still rejects escapes', async () => {
  const value = await corpus();
  // pnpm's isolated layout: node_modules/.pnpm/@muxui+catalog@2.1.0/node_modules/@muxui/catalog
  const storePath = ({ workspace, name, version }) => (
    `${workspace === '.' ? '' : `${workspace}/`}node_modules/.pnpm/${name.replace('/', '+')}@${version}/node_modules/${name}`
  );

  const direct = structuredClone(value.graphs.find(({ id }) => id === 'selected-direct-compatible'));
  for (const item of direct.installed) item.relativePath = storePath(item);
  assert.equal(resolve(value, direct).type, 'success');

  // A rejected path is reported as a placeholder, an accepted one verbatim.
  const reportedPaths = (paths) => {
    const ambiguous = structuredClone(value.graphs.find(({ id }) => id === 'catalog-resolution-ambiguous'));
    ambiguous.installed.filter(({ kind }) => kind === 'catalog').forEach((item, index) => { item.relativePath = paths[index]; });
    return resolve(value, ambiguous).error.details.candidates.map(({ relativePath }) => relativePath);
  };
  const catalogs = value.graphs.find(({ id }) => id === 'catalog-resolution-ambiguous').installed.filter(({ kind }) => kind === 'catalog');
  const stored = catalogs.map(storePath);
  assert.deepEqual(reportedPaths(stored), [...stored].sort());
  assert.deepEqual(
    reportedPaths(['apps/../../escape/node_modules/@muxui/catalog', '/abs/node_modules/@muxui/catalog']),
    ['invalid-relative-path', 'invalid-relative-path'],
  );

  // The adapter's project path check shares the rule.
  for (const project of ['../escape', '/abs/project']) {
    assert.equal(resolvePnpmProjectCatalog({ project }).error.code, 'MUXUI_PROJECT_NOT_FOUND', project);
  }
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
  assert.deepEqual(response.meta.resolution.targetPackages, { '@muxui/catalog': '2.1.0' });
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
  const binding = 'muxui:component:button#web.react';
  try {
    const sourceCatalogRoot = resolvePath(import.meta.dirname, '../../catalog');
    const bundle = JSON.parse(await readFile(
      join(sourceCatalogRoot, 'generated/catalog.json'),
      'utf8',
    ));
    const fixture = await createRendererProject(fixtureRoot, {
      bundle,
      bindings: [binding],
      writeBundle: async (generatedCatalog) => {
        await cp(
          join(sourceCatalogRoot, 'generated/catalog.json'),
          join(generatedCatalog, 'catalog.json'),
        );
        await cp(
          join(sourceCatalogRoot, 'generated/catalog.json.provenance'),
          join(generatedCatalog, 'catalog.json.provenance'),
        );
      },
    });
    const { descriptor, identity, path: project } = fixture;
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
    await fixture.write();
    const incompatible = resolvePnpmProjectCatalog({ project, bindings: [binding] });
    assert.equal(incompatible.type, 'error');
    assert.equal(incompatible.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
    const cliIncompatible = runCli([
      'get', 'muxui:component:button', '--project', project,
      '--platform', 'web.react', '--json',
    ]);
    assert.equal(cliIncompatible.exitCode, 16);

    descriptor.bindings[binding].export = '@muxui/react/button#Button';
    identity.schema = 'muxui-catalog-package-v2-unknown';
    await fixture.write();
    const unknownIdentity = resolvePnpmProjectCatalog({ project, bindings: [binding] });
    assert.equal(unknownIdentity.type, 'error');
    assert.equal(unknownIdentity.error.code, 'MUXUI_CATALOG_INTEGRITY_MISMATCH');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('E-BL1-07 an installed tuple that lacks a required participant binding hides the pattern and its variants', async () => {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.bl1-pnpm-fixture-'));
  const [patternId, cssId, virtualizedId] = [
    'muxui:pattern:poster-grid',
    'muxui:example:poster-grid-css',
    'muxui:example:poster-grid-virtualized',
  ];
  const bindings = ['button', 'grid-list', 'virtualizer'].map((slug) => `muxui:component:${slug}#web.react`);
  const [button, grid] = bindings;
  try {
    const bundle = await compileFixtureBundle();
    const fixture = await createRendererProject(fixtureRoot, {
      bundle,
      bindings,
      installed: [button],
      writeBundle: (generatedCatalog) => writeProjection(
        join(generatedCatalog, 'catalog.json'),
        'packages/catalog/generated/catalog.json',
        bundle,
      ),
    });
    // `list` and `search` filter project-wide discovery to the bindings the renderer provides.
    const discover = () => {
      const resolved = resolvePnpmProjectCatalog({
        project: fixture.path, platform: 'web.react', filterBindings: true,
      });
      assert.equal(resolved.type, 'success');
      const { api } = resolved;
      return {
        listed: api.listArtifacts({ kind: 'pattern', platform: 'web.react' }).data.items.map(({ id }) => id),
        searched: api.searchArtifacts({ query: 'poster', platform: 'web.react', limit: 100 }).data.items.map(({ id }) => id),
        examples: api.getArtifact({ id: patternId, section: 'examples', platform: 'web.react' }),
        variants: [cssId, virtualizedId].map((id) => api.getArtifact({ id, platform: 'web.react' }).type),
      };
    };

    // The renderer lacks grid-list, a required participant.
    const lacking = discover();
    assert.deepEqual(lacking.listed, []);
    assert.deepEqual(lacking.searched.filter((id) => [patternId, cssId, virtualizedId].includes(id)), []);
    assert.equal(lacking.examples.error.code, 'MUXUI_ARTIFACT_NOT_FOUND');
    assert.deepEqual(lacking.variants, ['error', 'error']);
    assert.deepEqual(
      JSON.parse(runCli(['list', 'pattern', '--project', fixture.path, '--platform', 'web.react', '--json']).stdout).data.items,
      [],
    );

    // With grid-list installed the pattern and both variants appear; optional virtualizer is not needed.
    await fixture.install([button, grid]);
    const installed = discover();
    assert.deepEqual(installed.listed, [patternId]);
    assert.ok(installed.searched.includes(patternId));
    assert.deepEqual(installed.examples.data.value.map(({ id }) => id), [cssId, virtualizedId]);
    assert.deepEqual(installed.variants, ['artifact.detail', 'artifact.detail']);
    assert.deepEqual(
      JSON.parse(runCli(['list', 'pattern', '--project', fixture.path, '--platform', 'web.react', '--json']).stdout)
        .data.items.map(({ id }) => id),
      [patternId],
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

const reactPackageRoot = resolvePath(import.meta.dirname, '../../react');

/**
 * A consumer that has only the tarball and the runtime `dependencies` and `peerDependencies` it declares, in a fresh
 * directory under the OS temp directory (no checkout `node_modules` above it). Each dependency is linked on its own
 * from the checkout's install, whose store layout resolves its transitive dependencies; `withheld` leaves one out.
 */
async function createIsolatedConsumer(tarball, withheld) {
  const root = await mkdtemp(join(tmpdir(), 'muxui-packed-consumer-'));
  const modules = join(root, 'node_modules');
  const packageRoot = join(modules, '@muxui/react');
  await mkdir(packageRoot, { recursive: true });
  const extracted = spawnSync('tar', ['-xzf', tarball, '-C', packageRoot, '--strip-components=1'], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const { dependencies = {}, peerDependencies = {} } = parseJsonStrict(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  for (const name of Object.keys({ ...dependencies, ...peerDependencies }).filter((dependency) => dependency !== withheld)) {
    await mkdir(dirname(join(modules, name)), { recursive: true });
    await symlink(await realpath(join(reactPackageRoot, 'node_modules', name)), join(modules, name));
  }
  await writeJson(join(root, 'package.json'), { type: 'module' });
  return root;
}

/** Imports each `[specifier, names]` from the consumer through Node's own resolution, reporting missing names or the import error. */
function importFromConsumer(root, checks) {
  const script = `
    const report = [];
    for (const [specifier, names] of ${JSON.stringify(checks)}) {
      try {
        const loaded = await import(specifier);
        report.push({ specifier, missing: names.filter((name) => loaded[name] === undefined) });
      } catch (error) {
        report.push({ specifier, error: error.code, message: error.message });
      }
    }
    console.log(JSON.stringify(report));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1));
}

/**
 * A pnpm project over this repository's own generated catalog, copied as an installed package is, and a `@muxui/react`
 * linked from `rendererRoot`. Nothing about the release tuple is fixture data: the catalog's own release record lists
 * the renderer's bindings, and the descriptor under test is the one at `rendererRoot`.
 */
async function createReactProject(fixtureRoot, rendererRoot) {
  const catalogSource = resolvePath(import.meta.dirname, '../../catalog/generated');
  const catalogRoot = join(fixtureRoot, 'catalog');
  await mkdir(join(catalogRoot, 'generated'), { recursive: true });

  const manifest = parseJsonStrict(await readFile(join(rendererRoot, 'package.json'), 'utf8'));
  const bundle = parseJsonStrict(await readFile(join(catalogSource, 'catalog.json'), 'utf8'));
  const identity = parseJsonStrict(await readFile(join(catalogSource, 'catalog-package.json'), 'utf8'));
  // The canonical binding set is the release record's, and each binding's module is its packed binding record's.
  const contract = JSON.parse((await readFile(join(rendererRoot, 'generated/r1-6-contract.json'), 'utf8'))
    .split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
  const moduleOf = new Map(contract.components.map(({ binding, module }) => [binding, module]));
  const nameOf = new Map(bundle.artifacts.map(({ id, name }) => [`${id}#web.react`, name]));
  const canonical = identity.releaseManifest.bindings
    .map(({ binding }) => {
      const module = moduleOf.get(binding);
      assert.ok(module, `${binding} has a binding record`);
      const name = nameOf.get(binding);
      return { binding, module, name, export: `${manifest.name}${module === '.' ? '' : module.slice(1)}#${name}` };
    })
    .sort((left, right) => compareBindings(left.binding, right.binding));

  await writeJson(join(fixtureRoot, 'package.json'), {
    name: 'react-packed-fixture',
    version: '1.0.0',
    private: true,
    packageManager: 'pnpm@10.33.0',
    dependencies: { '@muxui/catalog': 'workspace:*', [manifest.name]: `link:./${relative(fixtureRoot, rendererRoot)}` },
  });
  await writeFile(join(fixtureRoot, 'pnpm-workspace.yaml'), 'packages:\n  - catalog\n');
  await writeJson(join(catalogRoot, 'package.json'), {
    name: '@muxui/catalog',
    version: identity.version,
    private: true,
    muxUi: { catalogPackage: './generated/catalog-package.json' },
  });
  for (const file of ['catalog.json', 'catalog-package.json']) {
    for (const name of [file, `${file}.provenance`]) await cp(join(catalogSource, name), join(catalogRoot, 'generated', name));
  }
  const install = spawnSync('pnpm', ['install', '--offline', '--ignore-scripts'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
  assert.equal(install.status, 0, install.stderr);
  return { path: relative(process.cwd(), fixtureRoot).split('\\').join('/'), manifest, canonical };
}

/** The same project over the packed `@muxui/react`: `pnpm pack` output extracted with its manifest untouched. */
async function createPackedReactProject(fixtureRoot) {
  const packedRoot = join(fixtureRoot, 'renderer');
  await mkdir(packedRoot);
  const tarball = packWorkspacePackage('react', fixtureRoot);
  const extracted = spawnSync('tar', ['-xzf', tarball, '-C', packedRoot, '--strip-components=1'], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  const project = await createReactProject(fixtureRoot, packedRoot);

  const descriptorFile = 'generated/renderer-descriptor.json';
  const originals = Object.fromEntries(await Promise.all([descriptorFile, `${descriptorFile}.provenance`].map(
    async (file) => [file, await readFile(join(packedRoot, file), 'utf8')],
  )));
  return {
    ...project,
    tarball,
    descriptor: parseJsonStrict(originals[descriptorFile]),
    /** Replaces the packed descriptor with `value`, under a provenance sidecar that matches it. */
    writeDescriptor: (value) => writeProjection(
      join(packedRoot, descriptorFile),
      'packages/react/generated/renderer-descriptor.json',
      value,
    ),
    async restoreDescriptor() {
      for (const [file, text] of Object.entries(originals)) await writeFile(join(packedRoot, file), text);
    },
    dropPointer: () => {
      const { muxUi: _pointer, ...withoutPointer } = project.manifest;
      return writeJson(join(packedRoot, 'package.json'), withoutPointer);
    },
  };
}

function compareBindings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

test('E-G0.4 pnpm adapter reads the packed @muxui/react renderer descriptor', async () => {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.g0-4-react-packed-'));
  let consumer;
  try {
    const fixture = await createPackedReactProject(fixtureRoot);
    const { canonical, descriptor, manifest, path: project } = fixture;
    const bindings = canonical.map(({ binding }) => binding);

    // The packed descriptor describes exactly the bindings the catalog's own release record lists, and the packed
    // manifest points at it. The descriptor names no catalog release.
    assert.ok(bindings.length > 0);
    assert.equal(manifest.muxUi.rendererDescriptor, './generated/renderer-descriptor.json');
    assert.deepEqual(Object.keys(descriptor.bindings).sort(compareBindings), bindings);
    assert.equal(Object.hasOwn(descriptor, 'releaseProvenance'), false);

    // Every indexed export loads through the public specifiers (the package root and each subpath a binding uses),
    // by Node's own resolution of the export map, in a consumer that has only the tarball and its declared dependencies.
    const checks = new Map();
    for (const { export: identity, name } of canonical) {
      const [specifier] = identity.split('#');
      checks.set(specifier, [...(checks.get(specifier) ?? []), name]);
    }
    consumer = await createIsolatedConsumer(fixture.tarball);
    assert.deepEqual(
      importFromConsumer(consumer, [...checks]),
      [...checks.keys()].map((specifier) => ({ specifier, missing: [] })),
    );

    const resolved = resolvePnpmProjectCatalog({ project, bindings });
    assert.equal(resolved.type, 'success');
    assert.equal(
      resolved.api.getArtifact({
        id: 'muxui:component:button',
        platform: 'web.react',
        detail: 'compact',
        purpose: null,
        section: null,
      }).meta.resolution.targetPackages['@muxui/react'],
      manifest.version,
    );

    const compatibilityFailure = (dimension) => {
      const result = resolvePnpmProjectCatalog({ project, bindings });
      assert.equal(result.type, 'error');
      assert.equal(result.error.code, 'MUXUI_CATALOG_INCOMPATIBLE');
      assert.deepEqual(
        [...new Set(result.error.details.compatibilityFailures.map((failure) => failure.dimension))],
        [dimension],
      );
    };
    const mutated = (mutate) => {
      const value = structuredClone(descriptor);
      mutate(value);
      return fixture.writeDescriptor(value);
    };

    await mutated((value) => { value.extra = true; });
    assert.throws(() => resolvePnpmProjectCatalog({ project, bindings }), /MUXUI_RESOLVER_INPUT_INVALID: .* unknown field extra/u);

    await mutated((value) => { value.bindings[bindings[0]].specRevision = `sha256:${'0'.repeat(64)}`; });
    compatibilityFailure('binding-spec');
    await mutated((value) => { delete value.bindings[bindings[0]].specRevision; });
    compatibilityFailure('binding-spec');

    // An export identity the package's export map does not name hides the whole descriptor.
    await mutated((value) => { value.bindings[bindings[0]].export = '@muxui/react/unmapped#Button'; });
    compatibilityFailure('renderer-package');
    await mutated((value) => { delete value.bindings[bindings[0]].export; });
    compatibilityFailure('renderer-package');

    // A member of the package's export map that is not the binding's component: another real member, or none at all.
    for (const member of ['Slider', 'DefinitelyMissing']) {
      await mutated((value) => { value.bindings[bindings[0]].export = `${manifest.name}#${member}`; });
      compatibilityFailure('export');
    }

    await fixture.restoreDescriptor();
    assert.equal(resolvePnpmProjectCatalog({ project, bindings }).type, 'success');
    await fixture.dropPointer();
    compatibilityFailure('renderer-package');
  } finally {
    if (consumer) await rm(consumer, { recursive: true, force: true });
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('the real catalog resolves the workspace @muxui/react with no injected release bindings', async () => {
  await mkdir(join(process.cwd(), 'fixtures'), { recursive: true });
  const fixtureRoot = await mkdtemp(join(process.cwd(), 'fixtures/.react-workspace-'));
  try {
    const { canonical, manifest, path: project } = await createReactProject(fixtureRoot, reactPackageRoot);
    const button = runCli(['get', 'muxui:component:button', '--project', project, '--platform', 'web.react', '--json']);
    assert.equal(button.exitCode, 0);
    assert.equal(JSON.parse(button.stdout).meta.resolution.targetPackages['@muxui/react'], manifest.version);

    // Every binding the catalog lists resolves against the descriptor: its spec revision, digests and export member all agree.
    const everything = resolvePnpmProjectCatalog({ project, bindings: canonical.map(({ binding }) => binding) });
    assert.equal(everything.type, 'success');
    assert.ok(canonical.length > 1);

    // Project-wide discovery keeps the component now that the installed renderer provides its binding.
    const listed = JSON.parse(runCli(['list', '--project', project, '--platform', 'web.react', '--json']).stdout);
    assert.ok(listed.data.items.some(({ id }) => id === 'muxui:component:button'));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

// The control for the isolated consumer: the same setup, minus one dependency the package declares and imports.
test('E-G0.4 a packed consumer without a declared dependency cannot import the package', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'muxui-packed-tarball-'));
  const consumers = [];
  try {
    const tarball = packWorkspacePackage('react', scratch);
    const check = [['@muxui/react/markdown', ['Markdown']]];
    consumers.push(await createIsolatedConsumer(tarball));
    assert.deepEqual(importFromConsumer(consumers[0], check), [{ specifier: '@muxui/react/markdown', missing: [] }]);
    consumers.push(await createIsolatedConsumer(tarball, 'marked'));
    const [report] = importFromConsumer(consumers[1], check);
    assert.equal(report.error, 'ERR_MODULE_NOT_FOUND');
    assert.match(report.message, /'marked'/u);
  } finally {
    await Promise.all([scratch, ...consumers].map((path) => rm(path, { recursive: true, force: true })));
  }
});
