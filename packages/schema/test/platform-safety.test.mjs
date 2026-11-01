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

// The registry defaults only web.react today; nested native profiles take their defaults from the
// activating decision, so the nested-profile tests extend a copy of the registry.
const nativeDefault = platformSafetyRequirementIds.map((id) => (
  id.startsWith('system.')
    ? { id, disposition: 'not-applicable', reason: 'Web system modes do not apply to native.' }
    : { id, disposition: 'required' }
));
const nativeContract = {
  ...contract,
  defaults: {
    ...contract.defaults,
    profiles: { ...contract.defaults.profiles, ios: nativeDefault, android: nativeDefault },
  },
};

function expectCode(code, callback, ...messagePatterns) {
  assert.throws(callback, (error) => (
    error instanceof PlatformSafetyContractError
    && error.code === code
    && messagePatterns.every((pattern) => pattern.test(error.message))
  ));
}

function webBinding() {
  return structuredClone(component().bindings['web.react']);
}

function unsupportedBinding() {
  return { schemaVersion: '2.0.0', strategy: 'unsupported', reason: 'No responsible implementation exists.' };
}

function compileWeb(binding, bindingId = 'web.react') {
  return compilePlatformSafetyRequirementSets({ contract, bindingId, binding });
}

const override = (profile, ...requirements) => [{ profile, requirements }];

// Registry sets are null-prototype parses; requirement sets list the same entries sorted by ID.
const sortedById = (entries) => entries
  .map((entry) => ({ ...entry }))
  .sort((left, right) => (left.id < right.id ? -1 : 1));

test('E-G1.0-07 the registry carries defaults and generated types read the same source', () => {
  const identity = validatePlatformSafetyContract(contract);
  assert.deepEqual(platformSafetyRequirementIds, contract.requirements.map(({ id }) => id));
  assert.equal(identity.digest, canonicalDigest(contract));
  assert.deepEqual([...identity.defaults.profiles.keys()], ['web.react']);

  const missingDefaults = structuredClone(contract);
  delete missingDefaults.defaults;
  expectCode('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', () => validatePlatformSafetyContract(missingDefaults));

  const incomplete = structuredClone(contract);
  incomplete.defaults.profiles['web.react'].pop();
  expectCode('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', () => validatePlatformSafetyContract(incomplete), /web\.react/);

  const unsupportedRequires = structuredClone(contract);
  unsupportedRequires.defaults.unsupported[0] = { id: 'system.forced-colors', disposition: 'required' };
  expectCode(
    'MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID',
    () => validatePlatformSafetyContract(unsupportedRequires),
    /unsupported/,
  );

  const unknownDefault = structuredClone(contract);
  unknownDefault.defaults.profiles['web.react'][0].id = 'system.unknown';
  expectCode('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', () => validatePlatformSafetyContract(unknownDefault));
});

test('E-G1.0-07 a default names only a binding ID or nested runtime-profile key the schemas declare', () => {
  // The vocabulary is the schemas' BindingId and RuntimeProfileId, so a typo cannot define a default nothing reads.
  for (const profile of ['web.recat', 'windows']) {
    const unknownProfile = structuredClone(contract);
    unknownProfile.defaults.profiles[profile] = structuredClone(unknownProfile.defaults.profiles['web.react']);
    expectCode(
      'MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID',
      () => validatePlatformSafetyContract(unknownProfile),
      new RegExp(`unknown profile ${profile.replace('.', '\\.')};`),
    );
  }
  // The binding IDs and nested keys the schemas do declare are accepted.
  assert.doesNotThrow(() => validatePlatformSafetyContract(nativeContract));
});

test('E-G1.0-07 a binding that states nothing takes the registry default', () => {
  const binding = webBinding();
  assert.equal(Object.hasOwn(binding, 'platformSafety'), false);
  validateFamily('binding', binding);
  const sets = compileWeb(binding);
  assert.deepEqual(Object.keys(sets), ['web.react']);
  const set = sets['web.react'];
  assert.equal(set.contractVersion, contract.contractVersion);
  assert.equal(set.contractDigest, validatePlatformSafetyContract(contract).digest);
  assert.equal(set.requirements, undefined);
  assert.deepEqual(set.dispositions, sortedById(contract.defaults.profiles['web.react']));
  assert.doesNotThrow(() => assertPlatformSafetyRequirementSet({
    contract, bindingId: 'web.react', binding, profile: 'web.react', requirementSet: set,
  }));
});

test('E-G1.0-07 an unsupported binding or profile takes the unsupported default, never a claim', () => {
  const binding = unsupportedBinding();
  validateFamily('binding', binding);
  const set = compileWeb(binding, 'native.react-native')['native.react-native'];
  assert.equal(set.profile, 'native.react-native');
  assert.deepEqual(set.dispositions, sortedById(contract.defaults.unsupported));
  assert.equal(set.dispositions.every(({ disposition }) => disposition === 'not-applicable'), true);

  // An implemented binding of a profile with no registry default fails closed.
  expectCode(
    'MUXUI_PLATFORM_SAFETY_DEFAULT_MISSING',
    () => compileWeb(webBinding(), 'web.html'),
    /web\.html/,
  );

  const nativeSets = compilePlatformSafetyRequirementSets({
    contract: nativeContract,
    bindingId: 'native.react-native',
    binding: component().bindings['native.react-native'],
  });
  assert.deepEqual(Object.keys(nativeSets).sort(), ['android', 'ios', 'native.react-native-web']);
  assert.equal(nativeSets.ios.validationProfile, 'native.ios');
  assert.equal(nativeSets.ios.dispositions.find(({ id }) => id === 'native.font-metrics').disposition, 'required');
  assert.equal(
    nativeSets['native.react-native-web'].dispositions.every(({ disposition }) => disposition === 'not-applicable'),
    true,
  );
});

test('E-G1.0-07 an override with a reason replaces one disposition and moves every digest', () => {
  const base = compileWeb(webBinding())['web.react'];
  const binding = webBinding();
  binding.platformSafety = override('web.react', {
    id: 'system.forced-colors',
    disposition: 'not-applicable',
    reason: 'The component paints no color of its own.',
  });
  validateFamily('binding', binding);
  const set = compileWeb(binding)['web.react'];
  assert.deepEqual(
    set.dispositions.find(({ id }) => id === 'system.forced-colors'),
    { id: 'system.forced-colors', disposition: 'not-applicable', reason: 'The component paints no color of its own.' },
  );
  assert.deepEqual(
    set.dispositions.filter(({ id }) => id !== 'system.forced-colors'),
    base.dispositions.filter(({ id }) => id !== 'system.forced-colors'),
  );
  assert.notEqual(set.declarationRevision, base.declarationRevision);
  assert.notEqual(set.digest, base.digest);

  const revision = (value, requirementSet) => bindingSpecRevision({
    component: Object.assign(component(), { bindings: { 'web.react': value } }),
    bindingId: 'web.react',
    tokenSources: [tokenSource()],
    platformSafetyRequirementSets: [requirementSet],
  });
  const reassessed = structuredClone(binding);
  reassessed.platformSafety[0].requirements[0].reason += ' Reassessed.';
  assert.notEqual(revision(reassessed, compileWeb(reassessed)['web.react']), revision(binding, set));
  assert.notEqual(revision(binding, set), revision(webBinding(), base));

  // A nested runtime profile takes its own default and overrides it by its runtime-profile key.
  const native = component().bindings['native.react-native'];
  native.platformSafety = override('ios', {
    id: 'native.font-metrics',
    disposition: 'not-applicable',
    reason: 'The control draws a fixed-size glyph.',
  });
  native.platformSafety[0].validationProfile = 'native.ios';
  validateFamily('binding', native);
  const nativeSets = compilePlatformSafetyRequirementSets({
    contract: nativeContract, bindingId: 'native.react-native', binding: native,
  });
  assert.equal(nativeSets.ios.dispositions.find(({ id }) => id === 'native.font-metrics').disposition, 'not-applicable');
  assert.equal(nativeSets.android.dispositions.find(({ id }) => id === 'native.font-metrics').disposition, 'required');
});

test('E-G1.0-07 an override that restates a default is rejected, naming the binding and requirement', () => {
  const sameAsDefault = webBinding();
  sameAsDefault.platformSafety = override('web.react', {
    id: 'layout.direction',
    disposition: 'required',
    reason: 'Direction is required.',
  });
  validateFamily('binding', sameAsDefault);
  expectCode(
    'MUXUI_PLATFORM_SAFETY_OVERRIDE_RESTATES_DEFAULT',
    () => compileWeb(sameAsDefault),
    /web\.react/,
    /layout\.direction/,
  );

  // A new reason does not make it an override: the disposition is what differs.
  const rewordedNotApplicable = webBinding();
  rewordedNotApplicable.platformSafety = override('web.react', {
    id: 'native.dynamic-color',
    disposition: 'not-applicable',
    reason: 'Reworded.',
  });
  expectCode(
    'MUXUI_PLATFORM_SAFETY_OVERRIDE_RESTATES_DEFAULT',
    () => compileWeb(rewordedNotApplicable),
    /native\.dynamic-color/,
  );

  const restatedUnsupported = unsupportedBinding();
  restatedUnsupported.platformSafety = override('native.react-native', {
    id: 'system.high-contrast',
    disposition: 'not-applicable',
    reason: 'Unsupported.',
  });
  expectCode(
    'MUXUI_PLATFORM_SAFETY_OVERRIDE_RESTATES_DEFAULT',
    () => compileWeb(restatedUnsupported, 'native.react-native'),
    /native\.react-native/,
    /system\.high-contrast/,
  );
});

test('E-G1.0-07 an override without a reason is rejected by the schema and the compiler', () => {
  for (const disposition of ['not-applicable', 'required']) {
    const binding = webBinding();
    binding.platformSafety = override('web.react', {
      id: disposition === 'required' ? 'native.dynamic-color' : 'system.forced-colors',
      disposition,
    });
    assert.throws(() => validateFamily('binding', binding), /MUXUI_SCHEMA_INVALID/);
    expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', () => compileWeb(binding), /reason/);
  }
});

test('E-G1.0-07 rejects unknown, invalid, duplicate, wrong-profile, and empty declarations', () => {
  const requirement = {
    id: 'native.dynamic-color',
    disposition: 'required',
    reason: 'Hosted in a native webview.',
  };
  const withOverride = (change) => {
    const binding = webBinding();
    binding.platformSafety = override('web.react', { ...requirement });
    change(binding.platformSafety);
    return binding;
  };

  const unknown = withOverride((declarations) => { declarations[0].requirements[0].id = 'system.unknown'; });
  assert.throws(() => validateFamily('binding', unknown), /MUXUI_SCHEMA_INVALID/);
  expectCode('MUXUI_PLATFORM_SAFETY_REQUIREMENT_UNKNOWN', () => compileWeb(unknown));

  const invalidDisposition = withOverride((declarations) => {
    declarations[0].requirements[0].disposition = 'optional';
  });
  assert.throws(() => validateFamily('binding', invalidDisposition), /MUXUI_SCHEMA_INVALID/);
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', () => compileWeb(invalidDisposition));

  const duplicateRequirement = withOverride((declarations) => {
    declarations[0].requirements.push({ ...requirement });
  });
  expectCode('MUXUI_PLATFORM_SAFETY_REQUIREMENT_DUPLICATE', () => compileWeb(duplicateRequirement));

  const wrongProfile = withOverride((declarations) => { declarations[0].profile = 'web.html'; });
  expectCode('MUXUI_PLATFORM_SAFETY_PROFILE_INVALID', () => compileWeb(wrongProfile));

  const wrongValidationProfile = withOverride((declarations) => {
    declarations[0].validationProfile = 'native.ios';
  });
  expectCode('MUXUI_PLATFORM_SAFETY_PROFILE_INVALID', () => compileWeb(wrongValidationProfile));

  const duplicateProfile = withOverride((declarations) => {
    declarations.push(structuredClone(declarations[0]));
  });
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_DUPLICATE', () => compileWeb(duplicateProfile));

  // An empty list is not a second spelling of "no overrides": omit the field.
  const emptyList = webBinding();
  emptyList.platformSafety = [];
  assert.throws(() => validateFamily('binding', emptyList), /MUXUI_SCHEMA_INVALID/);
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', () => compileWeb(emptyList));
  const emptyRequirements = withOverride((declarations) => { declarations[0].requirements = []; });
  expectCode('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', () => compileWeb(emptyRequirements));
});

test('E-G1.0-07 rejects consumer weakening and premature fulfillment', () => {
  const binding = webBinding();
  const set = compileWeb(binding)['web.react'];
  const weakened = structuredClone(set);
  weakened.dispositions.find(({ disposition }) => disposition === 'required').disposition = 'not-applicable';
  expectCode('MUXUI_PLATFORM_SAFETY_CONSUMER_WEAKENED', () => assertPlatformSafetyRequirementSet({
    contract, bindingId: 'web.react', binding, profile: 'web.react', requirementSet: weakened,
  }));

  const premature = webBinding();
  premature.platformSafety = override('web.react', {
    id: 'native.dynamic-color',
    disposition: 'required',
    reason: 'Hosted in a native webview.',
    fulfilled: true,
  });
  expectCode('MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT', () => compileWeb(premature));

  // An unsupported binding or profile claims nothing, so it cannot require anything.
  const unsupportedRequires = unsupportedBinding();
  unsupportedRequires.platformSafety = override('native.react-native', {
    id: 'layout.direction',
    disposition: 'required',
    reason: 'Claimed early.',
  });
  expectCode(
    'MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT',
    () => compileWeb(unsupportedRequires, 'native.react-native'),
  );

  const native = component().bindings['native.react-native'];
  native.platformSafety = override('native.react-native-web', {
    id: 'layout.direction',
    disposition: 'required',
    reason: 'Claimed early.',
  });
  native.platformSafety[0].validationProfile = 'native.react-native-web';
  expectCode('MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT', () => compilePlatformSafetyRequirementSets({
    contract: nativeContract, bindingId: 'native.react-native', binding: native,
  }));
});
