import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { platformSafetyRequirementIds } from '../generated/platform-safety-contract.mjs';
import {
  PlatformSafetyContractError,
  assertPlatformSafetyRequirementSet,
  bindingSpecRevision,
  canonicalDigest,
  compilePlatformSafetyRequirementSets,
  parseJsonStrict,
  validateFamily,
  validatePlatformSafetyContract,
} from '../src/index.mjs';
import { component, tokenSource } from './fixtures.mjs';

const contract = parseJsonStrict(await readFile(
  new URL('../../../strategy/platform-safety-contract.json', import.meta.url),
  'utf8',
));

function expectCode(code, callback) {
  assert.throws(callback, (error) => (
    error instanceof PlatformSafetyContractError && error.code === code
  ));
}

function webBinding() {
  return structuredClone(component().bindings['web.react']);
}

test('E-G1.0-07 compiles closed binding-owned requirement sets without behavior claims', () => {
  const identity = validatePlatformSafetyContract(contract);
  assert.deepEqual(
    platformSafetyRequirementIds,
    contract.requirements.map(({ id }) => id),
  );
  assert.equal(identity.digest, canonicalDigest(contract));
  const sets = compilePlatformSafetyRequirementSets({
    contract,
    bindingId: 'web.react',
    binding: webBinding(),
  });
  assert.deepEqual(Object.keys(sets), ['web.react']);
  assert.equal(sets['web.react'].contractVersion, contract.contractVersion);
  assert.equal(sets['web.react'].contractDigest, identity.digest);
  assert.equal(sets['web.react'].requirements, undefined);
  assert.equal(sets['web.react'].dispositions.length, contract.requirements.length);
  assert.doesNotThrow(() => assertPlatformSafetyRequirementSet({
    contract,
    bindingId: 'web.react',
    binding: webBinding(),
    profile: 'web.react',
    requirementSet: sets['web.react'],
  }));
});

test('E-G1.0-07 rejects unknown, missing, duplicate, and wrong-profile declarations', () => {
  const unknown = webBinding();
  unknown.platformSafety[0].requirements[0].id = 'system.unknown';
  assert.throws(() => validateFamily('binding', unknown), /MUXUI_SCHEMA_INVALID/);
  expectCode('MUXUI_PLATFORM_SAFETY_REQUIREMENT_UNKNOWN', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: unknown,
  }));

  const missingRequirement = webBinding();
  missingRequirement.platformSafety[0].requirements.pop();
  expectCode('MUXUI_PLATFORM_SAFETY_REQUIREMENT_MISSING', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: missingRequirement,
  }));

  const duplicateRequirement = webBinding();
  duplicateRequirement.platformSafety[0].requirements.push(
    structuredClone(duplicateRequirement.platformSafety[0].requirements[0]),
  );
  expectCode('MUXUI_PLATFORM_SAFETY_REQUIREMENT_DUPLICATE', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: duplicateRequirement,
  }));

  const wrongProfile = webBinding();
  wrongProfile.platformSafety[0].profile = 'web.html';
  expectCode('MUXUI_PLATFORM_SAFETY_PROFILE_INVALID', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: wrongProfile,
  }));

  const duplicateProfile = webBinding();
  duplicateProfile.platformSafety.push(structuredClone(duplicateProfile.platformSafety[0]));
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_DUPLICATE', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: duplicateProfile,
  }));

  const missingProfile = webBinding();
  missingProfile.platformSafety = [];
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_MISSING', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: missingProfile,
  }));
});

test('E-G1.0-07 an unsupported native binding declares platform safety under its own binding ID', () => {
  const binding = {
    schemaVersion: '2.0.0',
    strategy: 'unsupported',
    reason: 'No responsible implementation exists.',
    platformSafety: [{
      profile: 'native.react-native',
      requirements: contract.requirements.map(({ id }) => ({
        id,
        disposition: 'not-applicable',
        reason: 'The binding is unsupported.',
      })),
    }],
  };
  validateFamily('binding', binding);
  const set = compilePlatformSafetyRequirementSets({
    contract, bindingId: 'native.react-native', binding,
  })['native.react-native'];
  assert.equal(set.profile, 'native.react-native');
  assert.equal(set.dispositions.every(({ disposition }) => disposition === 'not-applicable'), true);
});

test('E-G1.0-07 unsupported top-level bindings retain a complete declaration and digest', () => {
  const binding = {
    schemaVersion: '2.0.0',
    strategy: 'unsupported',
    reason: 'No implementation is available in G1.0.',
    platformSafety: [{
      profile: 'web.react',
      requirements: contract.requirements.map(({ id }) => ({
        id,
        disposition: 'not-applicable',
        reason: 'The binding is unsupported in G1.0.',
      })),
    }],
  };
  validateFamily('binding', binding);
  const set = compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding,
  })['web.react'];
  assert.equal(set.dispositions.every(({ disposition }) => disposition === 'not-applicable'), true);

  const missing = structuredClone(binding);
  delete missing.platformSafety;
  assert.throws(() => validateFamily('binding', missing), /MUXUI_SCHEMA_INVALID/);

  const required = structuredClone(binding);
  required.platformSafety[0].requirements[0] = {
    id: required.platformSafety[0].requirements[0].id,
    disposition: 'required',
  };
  expectCode('MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT', () => (
    compilePlatformSafetyRequirementSets({ contract, bindingId: 'web.react', binding: required })
  ));

  const concept = component();
  concept.bindings['web.react'] = binding;
  const baseRevision = bindingSpecRevision({
    component: concept,
    bindingId: 'web.react',
    tokenSources: [tokenSource()],
    platformSafetyRequirementSets: [set],
  });
  const revised = structuredClone(concept);
  revised.bindings['web.react'].platformSafety[0].requirements[0].reason += ' Reassessed.';
  const revisedSet = compilePlatformSafetyRequirementSets({
    contract,
    bindingId: 'web.react',
    binding: revised.bindings['web.react'],
  })['web.react'];
  assert.notEqual(bindingSpecRevision({
    component: revised,
    bindingId: 'web.react',
    tokenSources: [tokenSource()],
    platformSafetyRequirementSets: [revisedSet],
  }), baseRevision);
});

test('E-G1.0-07 rejects consumer weakening and premature fulfillment', () => {
  const binding = webBinding();
  const set = compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding,
  })['web.react'];
  const weakened = structuredClone(set);
  weakened.dispositions.find(({ disposition }) => disposition === 'required').disposition = 'not-applicable';
  expectCode('MUXUI_PLATFORM_SAFETY_CONSUMER_WEAKENED', () => assertPlatformSafetyRequirementSet({
    contract,
    bindingId: 'web.react',
    binding,
    profile: 'web.react',
    requirementSet: weakened,
  }));

  const premature = webBinding();
  premature.platformSafety[0].requirements[0].fulfilled = true;
  expectCode('MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'web.react', binding: premature,
  }));

  const native = structuredClone(component().bindings['native.react-native']);
  const unsupportedRequirement = native.platformSafety
    .find(({ profile }) => profile === 'native.react-native-web').requirements[0];
  unsupportedRequirement.disposition = 'required';
  delete unsupportedRequirement.reason;
  expectCode('MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT', () => compilePlatformSafetyRequirementSets({
    contract, bindingId: 'native.react-native', binding: native,
  }));
});
