import { canonicalDigest, canonicalJson } from './canonical.mjs';

const CONTRACT_SCHEMA = 'muxui-platform-safety-contract-v1';
const REQUIREMENT_SET_SCHEMA_VERSION = '1.0.0';
const VALIDATION_PROFILE_BY_RUNTIME_PROFILE = Object.freeze({
  ios: 'native.ios',
  android: 'native.android',
  'native.react-native-web': 'native.react-native-web',
});

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function closedObject(value, fields) {
  return isObject(value) && Object.keys(value).every((field) => fields.includes(field));
}

export class PlatformSafetyContractError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'PlatformSafetyContractError';
    this.code = code;
    this.details = Object.freeze(structuredClone(details));
  }
}

function fail(code, message, details) {
  throw new PlatformSafetyContractError(code, message, details);
}

const PROFILE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;

/**
 * Returns the first problem with one disposition entry, or undefined. A registry default or a resolved
 * entry states a reason only when it is not applicable; a binding override always states one, because
 * it departs from the default.
 */
function dispositionProblem(entry, registryIds, { override }) {
  const invalid = (message, details = {}) => ({
    code: 'MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID',
    message,
    details,
  });
  if (!isObject(entry)) return invalid('requirement disposition must be an object');
  const prematureFields = ['availability', 'evidence', 'evidenceStatus', 'fulfilled', 'support']
    .filter((field) => Object.hasOwn(entry, field));
  if (prematureFields.length > 0) {
    return {
      code: 'MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT',
      message: 'G1.0 declarations cannot contain behavior, evidence, support, or availability results',
      details: { fields: prematureFields },
    };
  }
  if (!closedObject(entry, ['id', 'disposition', 'reason'])) {
    return invalid('requirement disposition has unknown fields', { requirementId: entry.id });
  }
  if (!registryIds.has(entry.id)) {
    return {
      code: 'MUXUI_PLATFORM_SAFETY_REQUIREMENT_UNKNOWN',
      message: `unknown requirement ${entry.id}`,
      details: { requirementId: entry.id },
    };
  }
  const details = { requirementId: entry.id };
  if (!['required', 'not-applicable'].includes(entry.disposition)) {
    return invalid(`${entry.id} has an invalid disposition`, details);
  }
  const hasReason = typeof entry.reason === 'string' && entry.reason.length > 0;
  if (!hasReason && (override || entry.disposition === 'not-applicable')) {
    return invalid(
      override ? `${entry.id} override needs a reason` : `${entry.id} needs a not-applicable reason`,
      details,
    );
  }
  if (!override && entry.disposition === 'required' && entry.reason !== undefined) {
    return invalid(`${entry.id} required disposition must omit reason`, details);
  }
  return undefined;
}

function readDefaultSet(entries, registryIds, where, { unsupported }) {
  const contractInvalid = (message, details = {}) => fail(
    'MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID',
    `defaults for ${where}: ${message}`,
    { defaults: where, ...details },
  );
  if (!Array.isArray(entries)) contractInvalid('must be an array');
  const seen = new Set();
  const resolved = entries.map((entry) => {
    const problem = dispositionProblem(entry, registryIds, { override: false });
    if (problem) contractInvalid(problem.message, problem.details);
    if (seen.has(entry.id)) contractInvalid(`duplicate requirement ${entry.id}`, { requirementId: entry.id });
    if (unsupported && entry.disposition !== 'not-applicable') {
      contractInvalid(`${entry.id} must be not-applicable for an unsupported binding`, { requirementId: entry.id });
    }
    seen.add(entry.id);
    return Object.freeze({ ...entry });
  });
  const missing = [...registryIds].filter((id) => !seen.has(id));
  if (missing.length > 0) contractInvalid('is incomplete', { requirementIds: missing });
  return Object.freeze(resolved);
}

/**
 * The registry carries the default disposition set per implemented profile (a binding ID, or the
 * runtime-profile key of a nested profile) and one set for any unsupported binding or profile.
 */
function readDefaults(defaults, registryIds) {
  if (
    !closedObject(defaults, ['profiles', 'unsupported'])
    || !isObject(defaults.profiles)
  ) {
    fail('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', 'the registry defaults are malformed');
  }
  const profiles = new Map(Object.entries(defaults.profiles).map(([profile, entries]) => {
    if (!PROFILE_KEY.test(profile)) {
      fail('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', `defaults name an invalid profile ${profile}`, { profile });
    }
    return [profile, readDefaultSet(entries, registryIds, profile, { unsupported: false })];
  }));
  return Object.freeze({
    profiles,
    unsupported: readDefaultSet(defaults.unsupported, registryIds, 'unsupported', { unsupported: true }),
  });
}

export function validatePlatformSafetyContract(contract) {
  if (
    !closedObject(contract, ['schema', 'contractVersion', 'requirements', 'defaults'])
    || contract.schema !== CONTRACT_SCHEMA
    || !/^\d+\.\d+\.\d+$/.test(contract.contractVersion ?? '')
    || !Array.isArray(contract.requirements)
    || contract.requirements.length === 0
  ) {
    fail('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', 'the architecture registry is malformed');
  }
  const ids = new Set();
  for (const [index, requirement] of contract.requirements.entries()) {
    if (
      !closedObject(requirement, ['id', 'meaning', 'boundary'])
      || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(requirement.id ?? '')
      || typeof requirement.meaning !== 'string'
      || requirement.meaning.length === 0
      || typeof requirement.boundary !== 'string'
      || requirement.boundary.length === 0
    ) {
      fail('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', `requirements/${index} is malformed`, { index });
    }
    if (ids.has(requirement.id)) {
      fail('MUXUI_PLATFORM_SAFETY_CONTRACT_INVALID', `duplicate registry ID ${requirement.id}`, {
        requirementId: requirement.id,
      });
    }
    ids.add(requirement.id);
  }
  const value = structuredClone(contract);
  return Object.freeze({
    value: Object.freeze(value),
    requirementIds: Object.freeze(contract.requirements.map(({ id }) => id)),
    defaults: readDefaults(contract.defaults, ids),
    digest: canonicalDigest(contract),
  });
}

function expectedProfiles(bindingId, binding) {
  const runtimeProfiles = Object.entries(binding.runtimeProfiles ?? {});
  if (runtimeProfiles.length === 0) {
    return [{ profile: bindingId, validationProfile: undefined, unsupported: binding.strategy === 'unsupported' }];
  }
  return runtimeProfiles.map(([profile, runtimeProfile]) => ({
    profile,
    validationProfile: runtimeProfile.validationProfile
      ?? VALIDATION_PROFILE_BY_RUNTIME_PROFILE[profile],
    unsupported: runtimeProfile.strategy === 'unsupported',
  }));
}

/**
 * Reads a binding's override declarations: one per profile, naming only the requirements whose
 * disposition departs from that profile's registry default. Returns profile -> (requirement ID -> entry).
 * `reject` throws with the binding's label in the message.
 */
function readOverrides({ binding, registryIds, expectedByProfile, reject }) {
  const authored = binding.platformSafety;
  if (authored === undefined) return new Map();
  if (!Array.isArray(authored) || authored.length === 0) {
    reject(
      'MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID',
      'platformSafety must list at least one override, or be omitted to take the defaults',
    );
  }
  const overrides = new Map();
  for (const declaration of authored) {
    if (!closedObject(declaration, ['profile', 'validationProfile', 'requirements'])) {
      reject('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', 'has a malformed declaration');
    }
    const { profile } = declaration;
    if (overrides.has(profile)) {
      reject('MUXUI_PLATFORM_SAFETY_DECLARATION_DUPLICATE', `duplicate profile ${profile}`, { profile });
    }
    const expected = expectedByProfile.get(profile);
    if (!expected) {
      reject('MUXUI_PLATFORM_SAFETY_PROFILE_INVALID', `wrong profile ${profile}`, { profile });
    }
    if (declaration.validationProfile !== expected.validationProfile) {
      reject('MUXUI_PLATFORM_SAFETY_PROFILE_INVALID', `wrong validation profile for ${profile}`, {
        profile,
        required: expected.validationProfile ?? null,
        actual: declaration.validationProfile ?? null,
      });
    }
    if (!Array.isArray(declaration.requirements) || declaration.requirements.length === 0) {
      reject(
        'MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID',
        `${profile} requirements must list at least one override`,
        { profile },
      );
    }
    const entries = new Map();
    for (const entry of declaration.requirements) {
      if (entries.has(entry?.id)) {
        reject('MUXUI_PLATFORM_SAFETY_REQUIREMENT_DUPLICATE', `duplicate requirement ${entry.id}`, {
          profile,
          requirementId: entry.id,
        });
      }
      const problem = dispositionProblem(entry, registryIds, { override: true });
      if (problem) reject(problem.code, `${profile}: ${problem.message}`, { profile, ...problem.details });
      if (expected.unsupported && entry.disposition !== 'not-applicable') {
        reject(
          'MUXUI_PLATFORM_SAFETY_PREMATURE_FULFILLMENT',
          `unsupported profile ${profile} cannot require ${entry.id}`,
          { profile, requirementId: entry.id },
        );
      }
      entries.set(entry.id, { id: entry.id, disposition: entry.disposition, reason: entry.reason });
    }
    overrides.set(profile, entries);
  }
  return overrides;
}

/**
 * Resolves each profile's dispositions as the registry default plus the binding's overrides, and
 * derives one requirement set per profile. A binding with no `platformSafety` takes the defaults.
 * `owner` (the component ID) is only added to error messages.
 */
export function compilePlatformSafetyRequirementSets({ contract, bindingId, binding, owner }) {
  const identity = validatePlatformSafetyContract(contract);
  const label = owner === undefined ? bindingId : `${owner}#${bindingId}`;
  const reject = (code, message, details) => fail(code, `${label}: ${message}`, { bindingId, ...details });
  if (!isObject(binding)) reject('MUXUI_PLATFORM_SAFETY_DECLARATION_INVALID', 'is not a binding');
  const profiles = expectedProfiles(bindingId, binding);
  const overrides = readOverrides({
    binding,
    registryIds: new Set(identity.requirementIds),
    expectedByProfile: new Map(profiles.map((profile) => [profile.profile, profile])),
    reject,
  });
  const sets = profiles.map(({ profile, validationProfile, unsupported }) => {
    const defaults = unsupported ? identity.defaults.unsupported : identity.defaults.profiles.get(profile);
    if (defaults === undefined) {
      reject(
        'MUXUI_PLATFORM_SAFETY_DEFAULT_MISSING',
        `the registry has no default for the implemented profile ${profile}`,
        { profile },
      );
    }
    const profileOverrides = overrides.get(profile) ?? new Map();
    for (const [id, override] of profileOverrides) {
      if (defaults.find((entry) => entry.id === id).disposition === override.disposition) {
        reject(
          'MUXUI_PLATFORM_SAFETY_OVERRIDE_RESTATES_DEFAULT',
          `profile ${profile} restates the default ${override.disposition} for ${id}; `
            + 'state an entry only to override the default',
          { profile, requirementId: id },
        );
      }
    }
    const declaration = {
      bindingId,
      profile,
      ...(validationProfile === undefined ? {} : { validationProfile }),
      requirements: defaults
        .map((entry) => profileOverrides.get(entry.id) ?? entry)
        .map(({ id, disposition, reason }) => ({
          id,
          disposition,
          ...(reason === undefined ? {} : { reason }),
        }))
        .sort((left, right) => compareText(left.id, right.id)),
    };
    const preimage = {
      schemaVersion: REQUIREMENT_SET_SCHEMA_VERSION,
      contractVersion: contract.contractVersion,
      contractDigest: identity.digest,
      bindingId,
      profile,
      ...(validationProfile === undefined ? {} : { validationProfile }),
      declarationRevision: canonicalDigest(declaration),
      dispositions: declaration.requirements,
    };
    return [profile, Object.freeze({ ...preimage, digest: canonicalDigest(preimage) })];
  });
  return Object.freeze(Object.fromEntries(sets));
}

export function assertPlatformSafetyRequirementSet({
  contract,
  bindingId,
  binding,
  profile,
  requirementSet,
}) {
  const expected = compilePlatformSafetyRequirementSets({ contract, bindingId, binding })[profile];
  if (!expected || canonicalJson(requirementSet) !== canonicalJson(expected)) {
    fail(
      'MUXUI_PLATFORM_SAFETY_CONSUMER_WEAKENED',
      `${bindingId}:${profile} does not match the binding-owned requirement set`,
      {
        bindingId,
        profile,
        requiredDigest: expected?.digest ?? null,
        actualDigest: requirementSet?.digest ?? null,
      },
    );
  }
  return requirementSet;
}
