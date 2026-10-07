import { canonicalDigest, sha256Digest } from './canonical.mjs';
import { validateCatalogRecords, validateFamily } from './validation.mjs';

export function contentRevisionPreimage(family, record, { sourceBytes, schemas, ownership } = {}) {
  validateFamily(family, record, { schemas, ownership });
  if (family === 'example') {
    if (typeof sourceBytes !== 'string' && !Buffer.isBuffer(sourceBytes)) {
      throw new Error(`MUXUI_RELATION_INVALID: missing executable source bytes for ${record.id}`);
    }
    return { record, sourceDigest: sha256Digest(sourceBytes) };
  }
  return record;
}

export function contentRevision(family, record, options = {}) {
  return canonicalDigest(contentRevisionPreimage(family, record, options));
}

export function bindingContentRevisionPreimage(binding, { schemas, ownership } = {}) {
  validateFamily('binding', binding, { schemas, ownership });
  return binding;
}

export function bindingContentRevision(binding, options = {}) {
  return canonicalDigest(bindingContentRevisionPreimage(binding, options));
}

export function bindingSpecRevisionPreimage({
  component,
  bindingId,
  examples = [],
  exampleSources = {},
  tokenSources = [],
  tokenRequirementSets = [],
  platformSafetyRequirementSets = [],
  schemas,
  ownership,
}) {
  validateCatalogRecords([component, ...examples, ...tokenSources], { schemas, ownership });
  const binding = Object.hasOwn(component.bindings, bindingId)
    ? component.bindings[bindingId]
    : undefined;
  if (!binding) throw new Error(`MUXUI_RELATION_INVALID: missing ${component.id}#${bindingId}`);
  const bindingRef = `${component.id}#${bindingId}`;
  const normativeExamples = examples
    .filter((example) => (
      example.binding?.ref === bindingRef
      && example.binding.guidanceImpact === 'normative'
    ))
    .map((example) => ({
      id: example.id,
      revision: contentRevision('example', example, {
        sourceBytes: exampleSources[example.id],
        schemas,
        ownership,
      }),
      relation: example.binding,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  let tokenRequirements;
  if (binding.strategy !== 'unsupported') {
    const tokenSource = tokenSources.find((record) => record.id === binding.tokenRecipe.source);
    if (!tokenSource) throw new Error(`MUXUI_RELATION_INVALID: missing ${binding.tokenRecipe.source}`);
    tokenRequirements = {
      source: tokenSource.id,
      tokenContractVersion: tokenSource.tokenContractVersion,
      recipe: binding.tokenRecipe,
      resolvedSets: [...tokenRequirementSets]
        .map(({ profile, digest }) => ({ profile, digest }))
        .sort((left, right) => left.profile.localeCompare(right.profile)),
    };
  }
  const platformSafetyRequirements = [...platformSafetyRequirementSets]
    .map(({ profile, validationProfile, digest, contractVersion, contractDigest }) => ({
      profile,
      ...(validationProfile === undefined ? {} : { validationProfile }),
      digest,
      contractVersion,
      contractDigest,
    }))
    .sort((left, right) => left.profile.localeCompare(right.profile));
  return {
    component: {
      id: component.id,
      lifecycle: component.lifecycle,
      intent: component.intent,
      anatomy: component.anatomy,
      states: component.states,
      accessibility: component.accessibility,
    },
    binding: binding.strategy === 'unsupported'
      ? {
        strategy: binding.strategy,
        reason: binding.reason,
        ...(binding.alternative === undefined ? {} : { alternative: binding.alternative }),
        platformSafety: binding.platformSafety,
      }
      : {
        lifecycle: binding.lifecycle,
        strategy: binding.strategy,
        api: binding.api,
        behavior: binding.behavior,
        accessibility: binding.accessibility,
        runtimeProfiles: binding.runtimeProfiles,
        tokenRecipe: binding.tokenRecipe,
        platformSafety: binding.platformSafety,
      },
    normativeExamples,
    ...(tokenRequirements === undefined ? {} : { tokenRequirements }),
    platformSafetyRequirements,
  };
}

export function bindingSpecRevision(input) {
  return canonicalDigest(bindingSpecRevisionPreimage(input));
}

/**
 * The normative pattern fields plus each variant example's content revision
 * (record and source bytes), in authored variant order. Editorial fields
 * (name, summary, keywords, category, workflowValue) stay out.
 */
export function patternRevisionPreimage({
  pattern,
  examples = [],
  exampleSources = {},
  schemas,
  ownership,
}) {
  validateFamily('pattern', pattern, { schemas, ownership });
  const variants = pattern.variants.map(({ example: id }) => {
    const example = examples.find((candidate) => candidate.id === id);
    if (!example) throw new Error(`MUXUI_RELATION_INVALID: missing variant example ${id}`);
    return {
      id,
      revision: contentRevision('example', example, {
        sourceBytes: exampleSources[id],
        schemas,
        ownership,
      }),
    };
  });
  const optional = Object.fromEntries(
    ['relations', 'invariants', 'parameters']
      .filter((field) => pattern[field] !== undefined)
      .map((field) => [field, pattern[field]]),
  );
  return {
    pattern: {
      id: pattern.id,
      lifecycle: pattern.lifecycle,
      platforms: pattern.platforms,
      intent: pattern.intent,
      participants: pattern.participants,
      accessibility: pattern.accessibility,
      unsupported: pattern.unsupported,
      ...optional,
    },
    variants,
  };
}

export function patternRevision(input) {
  return canonicalDigest(patternRevisionPreimage(input));
}
