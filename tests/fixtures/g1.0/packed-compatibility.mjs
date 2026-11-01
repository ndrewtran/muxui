import { canonicalJson } from '../../../packages/schema/src/index.mjs';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(message) {
  throw new Error(`G1_0_PACKED_COMPATIBILITY_INVALID: ${message}`);
}

function profileMap(requirementSets, bindingIdentity, profiles) {
  const expected = [...profiles].sort(compareText);
  const mapped = Object.fromEntries(expected.map((profile) => {
    const identity = `${bindingIdentity}:${profile}`;
    const digest = requirementSets[identity];
    if (typeof digest !== 'string') fail(`missing ${identity}`);
    return [profile, digest];
  }));
  return mapped;
}

function catalogProfileMap(requirementSets, bindingIdentity) {
  const prefix = `${bindingIdentity}:`;
  return Object.fromEntries(Object.entries(requirementSets)
    .filter(([identity]) => identity.startsWith(prefix))
    .map(([identity, digest]) => [identity.slice(prefix.length), digest])
    .sort(([left], [right]) => compareText(left, right)));
}

// The catalog records a renderer's minor line, not one build of it.
function compatibleVersionRange(version) {
  const [major, minor] = version.split('.');
  return `^${major}.${minor}.0-0`;
}

export function assertPackedCompatibilityFixture(fixture) {
  if (fixture.classification !== 'test-only-synthetic') fail('classification must remain test-only');
  if (
    fixture.release.sourceRevision !== fixture.catalog.sourceRevision
    || fixture.release.catalog.id !== fixture.catalog.id
    || fixture.release.catalog.version !== fixture.catalog.version
    || fixture.release.catalog.digest !== fixture.catalog.catalogDigest
  ) fail('release catalog tuple does not match the packed catalog anchor');

  const descriptors = new Map(fixture.descriptors.map((descriptor) => [descriptor.id, descriptor]));
  for (const releaseBinding of fixture.release.bindings) {
    const descriptor = descriptors.get(releaseBinding.descriptor);
    const described = descriptor?.bindings[releaseBinding.binding];
    if (!described) fail(`missing descriptor binding ${releaseBinding.binding}`);
    for (const field of [
      'specRevision',
      'tokenRequirementSetDigests',
      'platformSafetyRequirementSetDigests',
    ]) {
      if (canonicalJson(described[field]) !== canonicalJson(releaseBinding[field])) {
        fail(`${releaseBinding.binding} release ${field} does not match its descriptor`);
      }
    }
    const catalogTokens = catalogProfileMap(
      fixture.catalog.tokenRequirementSets,
      releaseBinding.binding,
    );
    const catalogSafety = catalogProfileMap(
      fixture.catalog.platformSafetyRequirementSets,
      releaseBinding.binding,
    );
    if (canonicalJson(catalogTokens) !== canonicalJson(releaseBinding.tokenRequirementSetDigests)) {
      fail(`${releaseBinding.binding} token map does not match the catalog package`);
    }
    if (
      canonicalJson(catalogSafety)
      !== canonicalJson(releaseBinding.platformSafetyRequirementSetDigests)
    ) fail(`${releaseBinding.binding} platform-safety map does not match the catalog package`);
  }
  return fixture;
}

export function createPackedCompatibilityFixture({ source, catalogPackage, catalogBundle }) {
  if (
    source.schema !== 'core-ui-g1.0-packed-compatibility-source-v1'
    || source.classification !== 'test-only-synthetic-pack-input'
  ) fail('pack source is not the closed G1.0 test fixture');
  const releaseId = `${source.release.idPrefix}:${catalogBundle.sourceRevision}`;
  const descriptors = source.descriptors.map((input) => ({
    id: input.id,
    descriptorVersion: '1.0.0-test-fixture',
    classification: 'test-only-synthetic',
    package: input.package,
    version: input.version,
    bindingSchemaRange: input.bindingSchemaRange,
    tokenContractRange: input.tokenContractRange,
    bindings: Object.fromEntries(input.bindings.map((bindingInput) => {
      const artifact = catalogBundle.artifacts.find(({ id }) => id === bindingInput.artifact);
      const binding = artifact?.record.bindings[bindingInput.binding];
      if (!artifact || !binding) fail(`missing ${bindingInput.artifact}#${bindingInput.binding}`);
      const bindingIdentity = `${bindingInput.artifact}#${bindingInput.binding}`;
      return [bindingIdentity, {
        specRevision: artifact.bindingSpecRevisions[bindingInput.binding],
        export: bindingInput.export,
        lifecycle: binding.lifecycle,
        strategy: binding.strategy,
        tokenRequirementSetDigests: profileMap(
          catalogPackage.tokenRequirementSets,
          bindingIdentity,
          bindingInput.tokenProfiles,
        ),
        platformSafetyRequirementSetDigests: profileMap(
          catalogPackage.platformSafetyRequirementSets,
          bindingIdentity,
          bindingInput.platformSafetyProfiles,
        ),
      }];
    })),
  })).sort((left, right) => compareText(left.id, right.id));
  const releaseBindings = descriptors.flatMap((descriptor) => Object.entries(descriptor.bindings)
    .map(([binding, definition]) => ({
      descriptor: descriptor.id,
      binding,
      package: descriptor.package,
      versionRange: compatibleVersionRange(descriptor.version),
      specRevision: definition.specRevision,
      tokenRequirementSetDigests: definition.tokenRequirementSetDigests,
      platformSafetyRequirementSetDigests: definition.platformSafetyRequirementSetDigests,
    }))).sort((left, right) => compareText(left.binding, right.binding));
  return assertPackedCompatibilityFixture({
    schema: 'core-ui-g1.0-packed-compatibility-fixture-v1',
    classification: 'test-only-synthetic',
    catalog: {
      id: `@core-ui/catalog@${catalogPackage.version}:${catalogPackage.catalogDigest}`,
      version: catalogPackage.version,
      catalogDigest: catalogPackage.catalogDigest,
      sourceRevision: catalogPackage.sourceRevision,
      tokenRequirementSets: catalogPackage.tokenRequirementSets,
      platformSafetyRequirementSets: catalogPackage.platformSafetyRequirementSets,
    },
    descriptors,
    release: {
      id: releaseId,
      releaseVersion: source.release.releaseVersion,
      schemaVersion: source.release.schemaVersion,
      queryApiVersion: source.release.queryApiVersion,
      tokenContractVersion: source.release.tokenContractVersion,
      sourceRevision: catalogPackage.sourceRevision,
      catalog: {
        id: `@core-ui/catalog@${catalogPackage.version}:${catalogPackage.catalogDigest}`,
        version: catalogPackage.version,
        digest: catalogPackage.catalogDigest,
      },
      bindings: releaseBindings,
    },
  });
}
