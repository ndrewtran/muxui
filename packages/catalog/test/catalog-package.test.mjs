import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canonicalDigest, parseJsonStrict, validateFamily } from '@muxui/schema';
import { createCatalogApi, migrateCatalogPackageV1ToV2 } from '../src/index.mjs';
import {
  assertPackedCompatibilityFixture,
  createPackedCompatibilityFixture,
} from '../../../tests/fixtures/g1.0/packed-compatibility.mjs';

async function readJson(relativePath) {
  return parseJsonStrict(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
}

function projectHistoricalPackSource(source) {
  return {
    ...source,
    descriptors: source.descriptors.map((descriptor) => ({
      ...descriptor,
      bindings: descriptor.bindings.map((binding) => ({
        ...binding,
        artifact: binding.artifact.replace(/^core:/u, 'muxui:'),
      })),
    })),
  };
}

test('E-G0.4 package layout binds package, catalog, API, schema, digest, and source identity', async () => {
  const packageManifest = await readJson('../package.json');
  const identity = await readJson('../generated/catalog-package.json');
  const bundle = await readJson('../generated/catalog.json');
  const { catalogDigest: _catalogDigest, ...preimage } = bundle;
  assert.equal(packageManifest.muxUi.catalogPackage, './generated/catalog-package.json');
  assert.equal(identity.schema, 'muxui-catalog-package-v2');
  assert.equal(identity.name, packageManifest.name);
  assert.equal(identity.version, packageManifest.version);
  assert.equal(identity.catalogVersion, packageManifest.version);
  assert.equal(identity.catalogVersion, bundle.catalogVersion);
  assert.equal(identity.catalogDigest, canonicalDigest(preimage));
  assert.equal(identity.catalogDigest, bundle.catalogDigest);
  assert.equal(identity.queryApiVersion, bundle.apiVersion);
  assert.deepEqual(identity.supportedQueryApiVersions, ['1.1.0', '1.2.0', '2.0.0']);
  assert.deepEqual(identity.supportedQueryApiVersions, bundle.supportedQueryApiVersions);
  assert.equal(identity.releaseManifest.queryApiVersion, identity.queryApiVersion);
  assert.equal(identity.schemaRange, '^2.0.0');
  assert.equal(identity.sourceRevision, bundle.sourceRevision);
  assert.equal(identity.provenance.kind, 'source-revision');
  assert.equal(identity.provenance.value, bundle.sourceRevision);
  assert.equal(identity.releaseManifest.catalog.id.startsWith('@muxui/catalog@'), true);
  assert.equal(identity.releaseManifest.catalog.digest, bundle.catalogDigest);
  assert.equal(identity.releaseManifest.sourceRevision, bundle.sourceRevision);
  const tokenSource = bundle.artifacts.find(({ kind }) => kind === 'token');
  assert.ok(tokenSource, 'catalog bundle must include its canonical token source');
  assert.equal(
    identity.releaseManifest.tokenContractVersion,
    tokenSource.record.tokenContractVersion,
  );
  assert.deepEqual(identity.releaseManifest.bindings, []);
  const component = bundle.artifacts.find(({ id }) => id === 'muxui:component:button');
  for (const [key, set] of Object.entries(component.tokenRequirementSets)) {
    const [bindingId, profile] = key.split(':');
    assert.equal(
      identity.tokenRequirementSets[`muxui:component:button#${bindingId}:${profile}`],
      set.digest,
    );
  }
  assert.equal(identity.platformSafetyContract.version, '1.0.0');
  assert.equal(
    identity.platformSafetyContract.digest,
    bundle.platformSafetyContractDigest,
  );
  for (const [key, set] of Object.entries(component.platformSafetyRequirementSets)) {
    assert.equal(
      identity.platformSafetyRequirementSets[`muxui:component:button#${key}`],
      set.digest,
    );
  }
  assert.equal(identity.bundle, './catalog.json');
});

test('TALE-TOKEN-A descriptor v1-to-v2 migration is deterministic and idempotent', async () => {
  const current = await readJson('../generated/catalog-package.json');
  const historical = structuredClone(current);
  historical.schema = 'muxui-catalog-package-v1';
  delete historical.supportedQueryApiVersions;
  const migrated = migrateCatalogPackageV1ToV2(historical);
  assert.equal(migrated.schema, 'muxui-catalog-package-v2');
  assert.deepEqual(migrated.supportedQueryApiVersions, [historical.queryApiVersion]);
  assert.deepEqual(migrateCatalogPackageV1ToV2(migrated), migrated);
  assert.throws(
    () => migrateCatalogPackageV1ToV2({ schema: 'muxui-catalog-package-v2' }),
    /MUXUI_CATALOG_PACKAGE_INVALID/,
  );
});

test('E-G0.4 installed-local resolution context is catalog-owned response metadata', async () => {
  const bundle = await readJson('../generated/catalog.json');
  const resolution = {
    authority: 'installed-local',
    compatibility: 'exact',
    catalogSource: 'project',
    sourceRevision: bundle.sourceRevision,
    targetPackages: { '@muxui/catalog': bundle.catalogVersion },
    muxuiVersion: '0.0.0',
  };
  const api = createCatalogApi(bundle, { resolution });
  const responses = [
    api.getManifest({ detail: 'full' }),
    api.listArtifacts({ detail: 'brief', limit: 1 }),
    api.searchArtifacts({ query: 'button', detail: 'brief', limit: 1 }),
    api.getArtifact({ id: 'muxui:component:button', detail: 'compact' }),
  ];
  for (const response of responses) {
    validateFamily('query-envelope', response);
    assert.equal(response.meta.authority, 'installed-local');
    assert.equal(response.meta.catalogVersion, bundle.catalogVersion);
    assert.equal(response.meta.catalogDigest, bundle.catalogDigest);
    assert.equal(response.meta.resolution.authority, 'installed-local');
    assert.equal(response.meta.resolution.compatibility, 'exact');
    assert.equal(response.meta.resolution.catalogSource, 'project');
    assert.deepEqual(response.meta.resolution.targetPackages, {
      '@muxui/catalog': bundle.catalogVersion,
    });
  }
  assert.throws(() => createCatalogApi(bundle, {
    resolution: { ...resolution, sourceRevision: 'sha256:0000000000000000000000000000000000000000000000000000000000000000' },
  }), /MUXUI_CATALOG_RESOLUTION_CONTEXT_INVALID/);
  assert.throws(() => createCatalogApi(bundle, {
    resolution: { ...resolution, unverified: true },
  }), /MUXUI_CATALOG_RESOLUTION_CONTEXT_INVALID/);
  assert.throws(() => createCatalogApi(bundle, {
    resolution: { ...resolution, targetPackages: {} },
  }), /MUXUI_CATALOG_RESOLUTION_CONTEXT_INVALID/);
});

test('E-G1.0-04 catalog exposes resolved requirement sets matching packed descriptors', async () => {
  const bundle = await readJson('../generated/catalog.json');
  const identity = await readJson('../generated/catalog-package.json');
  const api = createCatalogApi(bundle);
  const response = api.getArtifact({
    id: 'muxui:component:button',
    platform: 'web.react',
    section: 'styling',
    detail: 'full',
  });
  validateFamily('query-envelope', response);
  const set = response.data.value.requirementSets['web.react:web.react'];
  assert.equal(set.requirements.every(({ token }) => token.startsWith('component.button.')), true);
  assert.equal(
    set.digest,
    identity.tokenRequirementSets['muxui:component:button#web.react:web.react'],
  );
  assert.equal(
    set.digest,
    bundle.artifacts.find(({ id }) => id === 'muxui:component:button')
      .tokenRequirementSets['web.react:web.react'].digest,
  );
});

test('E-G1.0-04 test pack projection binds catalog, descriptors, and release maps', async () => {
  const bundle = await readJson('../generated/catalog.json');
  const identity = await readJson('../generated/catalog-package.json');
  const source = projectHistoricalPackSource(await readJson(
    '../../../tests/fixtures/g1.0/packed-compatibility-source.json',
  ));
  const fixture = createPackedCompatibilityFixture({
    source,
    catalogPackage: identity,
    catalogBundle: bundle,
  });
  assert.doesNotThrow(() => assertPackedCompatibilityFixture(fixture));
  assert.equal(fixture.descriptors.length, 3);
  assert.equal(fixture.release.bindings.length, 3);

  for (const field of [
    'tokenRequirementSetDigests',
    'platformSafetyRequirementSetDigests',
  ]) {
    const stale = structuredClone(fixture);
    const releaseBinding = stale.release.bindings.find(
      ({ binding }) => binding === 'muxui:component:button#web.react',
    );
    const profile = Object.keys(releaseBinding[field])[0];
    const digest = `sha256:${'0'.repeat(64)}`;
    releaseBinding[field][profile] = digest;
    stale.descriptors.find(({ id }) => id === releaseBinding.descriptor)
      .bindings[releaseBinding.binding][field][profile] = digest;
    assert.throws(
      () => assertPackedCompatibilityFixture(stale),
      /does not match the catalog package/,
    );
  }
});

test('E-G1.0-04 query validation rejects open fallback and dependency closure facts', async () => {
  const bundle = await readJson('../generated/catalog.json');
  const response = createCatalogApi(bundle).getArtifact({
    id: 'muxui:component:button',
    platform: 'web.react',
    detail: 'full',
  });
  const arbitraryFallback = structuredClone(response);
  arbitraryFallback.data.artifact.tokenRequirementSets['web.react:web.react']
    .requirements[0].fallback = { arbitrary: true };
  assert.throws(() => validateFamily('query-envelope', arbitraryFallback), /MUXUI_SCHEMA_INVALID/);

  const arbitraryClosure = structuredClone(response);
  arbitraryClosure.data.artifact.tokenRequirementSets['web.react:web.react'].closure[0] = {
    modelSelectedCanonicalFact: true,
  };
  assert.throws(() => validateFamily('query-envelope', arbitraryClosure), /MUXUI_SCHEMA_INVALID/);

  const contradictoryValue = structuredClone(response);
  const valueEntry = contradictoryValue.data.artifact
    .tokenRequirementSets['web.react:web.react'].closure[0];
  valueEntry.type = 'dimension';
  valueEntry.unit = 'px';
  valueEntry.resolved = 'not-a-dimension';
  assert.throws(() => validateFamily('query-envelope', contradictoryValue), /MUXUI_SCHEMA_INVALID/);

  const contradictoryLayer = structuredClone(response);
  contradictoryLayer.data.artifact.tokenRequirementSets['web.react:web.react']
    .closure.find(({ token }) => token.startsWith('reference.')).layer = 'component';
  assert.throws(() => validateFamily('query-envelope', contradictoryLayer), /MUXUI_SCHEMA_INVALID/);
});

test('E-G1.0-07 catalog and package expose exact platform-safety set digests', async () => {
  const bundle = await readJson('../generated/catalog.json');
  const identity = await readJson('../generated/catalog-package.json');
  const api = createCatalogApi(bundle);
  const response = api.getArtifact({
    id: 'muxui:component:button',
    platform: 'web.react',
    section: 'styling',
    detail: 'full',
  });
  validateFamily('query-envelope', response);
  const set = response.data.value.platformSafetyRequirementSets['web.react:web.react'];
  assert.equal(set.contractDigest, identity.platformSafetyContract.digest);
  assert.equal(
    set.digest,
    identity.platformSafetyRequirementSets['muxui:component:button#web.react:web.react'],
  );
  assert.equal(Object.hasOwn(set, 'support'), false);
  assert.equal(Object.hasOwn(set, 'evidence'), false);

  const unknownRequirement = structuredClone(response);
  unknownRequirement.data.value.platformSafetyRequirementSets['web.react:web.react']
    .dispositions[0].id = 'system.unknown';
  assert.throws(
    () => validateFamily('query-envelope', unknownRequirement),
    /MUXUI_SCHEMA_INVALID/,
  );
});
