import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ARTIFACT_REF_PATTERN,
  ERROR_CODES,
  SchemaValidationError,
  assertAppendOnlyErrorCodes,
  bindingContentRevision,
  bindingSpecRevision,
  canonicalDigest,
  canonicalJson,
  classifySchemaChange,
  contentRevision,
  migrateTokenSourceV2ToV2_1,
  negotiateSchemaVersion,
  parseArtifactRef,
  parseJsonStrict,
  relationEdges,
  sha256Digest,
  validateCatalogRecords,
  validateContractDocument,
  validateFamily,
  validateFieldOwnershipRegistry,
  validateRelationRegistry,
} from '../src/index.mjs';
import {
  allRecords,
  capability,
  component,
  example,
  guide,
  tokenSource,
} from './fixtures.mjs';

const normativeExampleSource = '<Button disabled={false}>Save</Button>\n';

function revisionInput({
  concept,
  bindingId = 'web.react',
  examples = [],
  tokenSources = [],
  exampleSources = {},
}) {
  return { component: concept, bindingId, examples, tokenSources, exampleSources };
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof SchemaValidationError);
    assert.equal(error.code, code);
    return true;
  };
}

function validationIssues(family, value) {
  try {
    validateFamily(family, value);
  } catch (error) {
    assert.ok(error instanceof SchemaValidationError);
    return error.issues;
  }
  assert.fail(`${family} unexpectedly validated`);
}

function sectionCursor(payload) {
  const bytes = canonicalJson(payload);
  return `c1.${Buffer.from(bytes, 'utf8').toString('base64url')}.${sha256Digest(bytes).slice(7)}`;
}

function countLexemes(value) {
  return canonicalJson(value).match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

test('R1 contract schema exposes only the current Mux UI identity', async () => {
  const schema = JSON.parse(await readFile(
    resolve(import.meta.dirname, '../schemas/react-r1.schema.json'),
    'utf8',
  ));
  assert.doesNotMatch(JSON.stringify(schema), new RegExp(`${['core', 'ui'].join('-')}-react-`, 'u'));

  for (const file of ['upstream-snapshot.json', 'upstream-exports.json']) {
    const historical = JSON.parse(await readFile(
      resolve(import.meta.dirname, `../../../catalog/react-r1-0/${file}`),
      'utf8',
    ));
    assert.throws(
      () => validateContractDocument('react-r1.schema.json', historical),
      expectCode('MUXUI_SCHEMA_INVALID'),
      file,
    );
  }
  const retired = { schema: `${['core', 'ui'].join('-')}-react-retired-v1` };
  assert.throws(() => validateContractDocument('react-r1.schema.json', retired), expectCode('MUXUI_SCHEMA_INVALID'));
});

test('E-G0.1-01: minimum records, envelopes, diagnostics, ownership, and relations validate', () => {
  const graph = validateCatalogRecords(allRecords());
  assert.equal(graph.records.length, 5);
  assert.equal(relationEdges(graph.records).length, 8);
  assert.equal(validateRelationRegistry().relations.length, 4);
  const ownership = validateFieldOwnershipRegistry();
  assert.equal(ownership.classes.length, 3);
  assert.ok(ownership.fields.length > 100);
  const nestedStrategy = component();
  nestedStrategy.bindings['web.react'].api.defaults.strategy = 'compact';
  nestedStrategy.bindings['web.react'].extensions = {
    'muxui.experimental.g01-proof': { strategy: 'memo' },
  };
  assert.equal(validateCatalogRecords([nestedStrategy, tokenSource()]).records.length, 2);
  const missingOwnership = structuredClone(ownership);
  missingOwnership.fields.pop();
  assert.throws(
    () => validateFieldOwnershipRegistry(missingOwnership),
    expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
  );
  const duplicateOwnership = structuredClone(ownership);
  duplicateOwnership.fields.push(structuredClone(duplicateOwnership.fields[0]));
  assert.throws(
    () => validateFieldOwnershipRegistry(duplicateOwnership),
    expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
  );
  const misowned = structuredClone(ownership);
  misowned.fields[0].owner = 'not-the-canonical-owner';
  assert.throws(
    () => validateFieldOwnershipRegistry(misowned),
    expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
  );
  for (const schema of [
    'binding.schema.json',
    'component.schema.json',
    'query-envelope.schema.json',
  ]) {
    const missingSchema = structuredClone(ownership);
    missingSchema.governedSchemas = missingSchema.governedSchemas.filter(
      (entry) => entry.file !== schema,
    );
    missingSchema.fields = missingSchema.fields.filter((field) => field.schema !== schema);
    assert.throws(
      () => validateFieldOwnershipRegistry(missingSchema),
      expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
    );
  }
  for (const name of ownership.reservedFields.map((field) => field.name)) {
    const missingReserved = structuredClone(ownership);
    missingReserved.reservedFields = missingReserved.reservedFields.filter(
      (field) => field.name !== name,
    );
    assert.throws(
      () => validateFieldOwnershipRegistry(missingReserved),
      expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
    );
    for (const mutation of [
      { owner: 'not-the-canonical-owner' },
      { class: 'authored' },
      { forbiddenInAuthoredSource: false },
    ]) {
      const mutatedReserved = structuredClone(ownership);
      Object.assign(
        mutatedReserved.reservedFields.find((field) => field.name === name),
        mutation,
      );
      assert.throws(
        () => validateFieldOwnershipRegistry(mutatedReserved),
        expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
      );
    }
  }
  for (const mutation of [
    { owner: 'coordinated-mutated-owner' },
    { class: 'proved' },
  ]) {
    const coordinatedMutation = structuredClone(ownership);
    Object.assign(
      coordinatedMutation.governedSchemas.find(
        (context) => context.file === 'component.schema.json',
      ),
      mutation,
    );
    for (const field of coordinatedMutation.fields.filter(
      (entry) => entry.schema === 'component.schema.json',
    )) {
      Object.assign(field, mutation);
    }
    assert.throws(
      () => validateFieldOwnershipRegistry(coordinatedMutation),
      expectCode('MUXUI_FIELD_OWNERSHIP_INVALID'),
    );
  }
  assert.deepEqual(parseArtifactRef('muxui:component:button'), {
    value: 'muxui:component:button',
    kind: 'component',
    slug: 'button',
  });
  assert.match('muxui:pattern:form', new RegExp(ARTIFACT_REF_PATTERN));
  assert.throws(
    () => parseArtifactRef('muxui:pattern:form', { requireEnabledRecordKind: true }),
    /record behavior is unavailable in G0\.1/,
  );

  const bindingContent = bindingContentRevision(component().bindings['web.react']);
  assert.match(bindingContent, /^sha256:[a-f0-9]{64}$/);
  validateFamily('query-envelope', {
    apiVersion: '1.1.0',
    type: 'artifact.detail',
    data: {
      artifact: {
        id: 'muxui:component:button',
        kind: 'component',
        source: { record: 'catalog/components/button/artifact.json' },
      },
    },
    meta: {
      schemaVersion: '1.1.0',
      authority: 'advisory',
      revisions: {
        conceptContent: `sha256:${'1'.repeat(64)}`,
        bindingContent,
        bindingSpec: `sha256:${'2'.repeat(64)}`,
      },
      muxuiVersion: '0.0.0',
      catalogVersion: '0.0.0',
      catalogDigest: `sha256:${'3'.repeat(64)}`,
      sourceRevision: `sha256:${'4'.repeat(64)}`,
      resolution: {
        authority: 'advisory',
        compatibility: 'unresolved',
        catalogSource: 'package',
        sourceRevision: `sha256:${'4'.repeat(64)}`,
        revisions: {
          conceptContent: `sha256:${'1'.repeat(64)}`,
          bindingContent,
          bindingSpec: `sha256:${'2'.repeat(64)}`,
        },
        targetPackages: {},
      },
      platform: 'web.react',
      detail: 'full',
      truncated: false,
      nextCursor: null,
    },
    warnings: [],
    futureOptionalMember: true,
  });
  validateFamily('diagnostic', {
    code: 'MUXUI_SCHEMA_INVALID',
    ruleId: 'schema.record.valid',
    message: 'The record is invalid.',
    retryable: false,
    details: {},
  });
});

test('E-G0.1-01 negative: unknown, duplicate, invalid-relation, and unowned fields fail closed', () => {
  const unknown = component();
  unknown.unowned = true;
  assert.throws(() => validateFamily('component', unknown), expectCode('MUXUI_SCHEMA_INVALID'));

  const duplicate = component();
  assert.throws(
    () => validateCatalogRecords([duplicate, structuredClone(duplicate), tokenSource()]),
    expectCode('MUXUI_ARTIFACT_ID_INVALID'),
  );

  for (const hostileKind of ['toString', 'constructor', '__proto__']) {
    const invalidKind = component();
    invalidKind.kind = hostileKind;
    assert.throws(
      () => validateCatalogRecords([invalidKind, tokenSource()]),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
  }

  const badRelation = example();
  badRelation.binding.ref = 'muxui:component:missing#web.react';
  assert.throws(
    () => validateCatalogRecords([component(), badRelation, tokenSource()]),
    expectCode('MUXUI_RELATION_INVALID'),
  );

  const unowned = component();
  unowned.bindings['web.react'].contentRevision = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateFamily('component', unowned), expectCode('MUXUI_SCHEMA_INVALID'));

  const mismatchedValidationProfile = component();
  mismatchedValidationProfile.bindings['native.react-native'].runtimeProfiles.ios.validationProfile =
    'native.android';
  assert.throws(
    () => validateCatalogRecords([mismatchedValidationProfile, tokenSource()]),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );

  const impossibleApplicability = example();
  impossibleApplicability.binding.runtimeProfiles = ['ios'];
  assert.throws(
    () => validateCatalogRecords([component(), impossibleApplicability, tokenSource()]),
    expectCode('MUXUI_RELATION_INVALID'),
  );

  const unsupportedApplicability = example();
  unsupportedApplicability.binding.ref = 'muxui:component:button#native.react-native';
  unsupportedApplicability.binding.runtimeProfiles = ['native.react-native-web'];
  assert.throws(
    () => validateCatalogRecords([component(), unsupportedApplicability, tokenSource()]),
    expectCode('MUXUI_RELATION_INVALID'),
  );

  const crossBindingProfile = component();
  crossBindingProfile.bindings['web.react'].runtimeProfiles.ios = {
    strategy: 'adapted',
    lifecycle: 'experimental',
    validationProfile: 'native.ios',
  };
  assert.throws(
    () => validateCatalogRecords([crossBindingProfile, tokenSource()]),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );

  const missingNativeDisposition = component();
  delete missingNativeDisposition.bindings['native.react-native'].runtimeProfiles.android;
  assert.throws(
    () => validateCatalogRecords([missingNativeDisposition, tokenSource()]),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );

  const unsupportedBinding = {
    schemaVersion: '2.0.0',
    strategy: 'unsupported',
    reason: 'No responsible implementation exists.',
    platformSafety: component().bindings['web.react'].platformSafety.map((declaration) => ({
      ...declaration,
      requirements: declaration.requirements.map(({ id }) => ({
        id,
        disposition: 'not-applicable',
        reason: 'The binding is unsupported in G1.0.',
      })),
    })),
  };
  assert.deepEqual(validateFamily('binding', unsupportedBinding), unsupportedBinding);
  const componentWithUnsupportedBinding = component();
  componentWithUnsupportedBinding.bindings['web.react'] = unsupportedBinding;
  assert.equal(
    validateCatalogRecords([componentWithUnsupportedBinding, tokenSource()]).records.length,
    2,
  );
  assert.throws(
    () => validateCatalogRecords([
      componentWithUnsupportedBinding,
      example(),
      tokenSource(),
    ]),
    expectCode('MUXUI_RELATION_INVALID'),
  );
  assert.throws(
    () => validateFamily('binding', {
      schemaVersion: '2.0.0',
      strategy: 'unsupported',
      alternative: 'muxui:component:button',
    }),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  assert.throws(
    () => validateFamily('binding', { schemaVersion: '2.0.0', strategy: 'unsupported' }),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  assert.throws(
    () => validateFamily('binding', { ...unsupportedBinding, lifecycle: 'experimental' }),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  for (const field of ['reason', 'alternative']) {
    assert.throws(
      () => validateFamily('binding', {
        ...component().bindings['web.react'],
        [field]: field === 'reason' ? 'Not applicable.' : 'muxui:component:button',
      }),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
    const implementedProfile = component().bindings['native.react-native'].runtimeProfiles.ios;
    assert.throws(
      () => validateFamily('binding', {
        ...component().bindings['native.react-native'],
        runtimeProfiles: {
          ...component().bindings['native.react-native'].runtimeProfiles,
          ios: {
            ...implementedProfile,
            [field]: field === 'reason' ? 'Not applicable.' : 'muxui:component:button',
          },
        },
      }),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
  }
  const alternativeOnlyProfile = component().bindings['native.react-native'];
  alternativeOnlyProfile.runtimeProfiles['native.react-native-web'] = {
    strategy: 'unsupported',
    alternative: 'muxui:component:button',
  };
  assert.throws(
    () => validateFamily('binding', alternativeOnlyProfile),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  const forbiddenUnsupportedFields = {
    api: { props: [], events: [], parts: [], defaults: {} },
    behavior: [],
    accessibility: [],
    tokenRecipe: { source: 'muxui:token:default-theme', requirements: [] },
    runtimeProfiles: {
      ios: {
        strategy: 'adapted',
        lifecycle: 'experimental',
        validationProfile: 'native.ios',
      },
    },
  };
  for (const [field, fieldValue] of Object.entries(forbiddenUnsupportedFields)) {
    assert.throws(
      () => validateFamily('binding', { ...unsupportedBinding, [field]: fieldValue }),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
  }

  const danglingPrerequisite = example();
  danglingPrerequisite.prerequisites = ['muxui:component:missing'];
  assert.throws(
    () => validateCatalogRecords([component(), danglingPrerequisite, tokenSource()]),
    expectCode('MUXUI_RELATION_INVALID'),
  );

  const danglingAlternative = component();
  danglingAlternative.bindings['web.react'] = {
    ...unsupportedBinding,
    alternative: 'muxui:component:missing',
  };
  assert.throws(
    () => validateCatalogRecords([danglingAlternative, tokenSource()]),
    expectCode('MUXUI_RELATION_INVALID'),
  );

  const unsupportedProfileExample = example();
  unsupportedProfileExample.binding.runtimeProfiles = ['ios'];
  assert.throws(
    () => validateCatalogRecords([
      componentWithUnsupportedBinding,
      unsupportedProfileExample,
      tokenSource(),
    ]),
    expectCode('MUXUI_RELATION_INVALID'),
  );
});

test('E-G0.5-01: discriminated binding branches retain exact required-field diagnostics', () => {
  const supportedRequiredPaths = [
    '$/lifecycle',
    '$/api',
    '$/behavior',
    '$/accessibility',
    '$/tokenRecipe',
    '$/platformSafety',
    '$/runtimeProfiles',
  ];
  for (const strategy of ['direct', 'adapted', 'native-alternative']) {
    const issues = validationIssues('binding', { schemaVersion: '2.0.0', strategy });
    for (const path of supportedRequiredPaths) {
      assert.ok(issues.some((issue) => issue.path === path), `${strategy}: ${path}`);
    }
    assert.equal(issues.some((issue) => issue.path === '$/reason'), false, strategy);
    assert.equal(
      issues.some((issue) => issue.message.includes('must equal "unsupported"')),
      false,
      strategy,
    );
  }

  const unsupportedIssues = validationIssues('binding', {
    schemaVersion: '2.0.0',
    strategy: 'unsupported',
  });
  assert.ok(unsupportedIssues.some((issue) => issue.path === '$/reason'));
  assert.ok(unsupportedIssues.some((issue) => issue.path === '$/platformSafety'));
  assert.equal(unsupportedIssues.some((issue) => issue.path === '$/api'), false);

  for (const strategy of ['direct', 'adapted', 'native-alternative']) {
    const record = component().bindings['native.react-native'];
    record.runtimeProfiles.ios = { strategy };
    const issues = validationIssues('binding', record);
    assert.ok(issues.some((issue) => issue.path === '$/runtimeProfiles/ios/lifecycle'), strategy);
    assert.ok(
      issues.some((issue) => issue.path === '$/runtimeProfiles/ios/validationProfile'),
      strategy,
    );
    assert.equal(
      issues.some((issue) => issue.path === '$/runtimeProfiles/ios/reason'),
      false,
      strategy,
    );
  }

  const runtimeUnsupported = component().bindings['native.react-native'];
  runtimeUnsupported.runtimeProfiles['native.react-native-web'] = { strategy: 'unsupported' };
  const runtimeIssues = validationIssues('binding', runtimeUnsupported);
  assert.ok(runtimeIssues.some(
    (issue) => issue.path === '$/runtimeProfiles/native.react-native-web/reason',
  ));
});

test('E-G0.1-02: canonical bytes ignore key order and whitespace but preserve meaning', () => {
  const first = parseJsonStrict('{"b":"line\\r\\nvalue","a":1}');
  const second = parseJsonStrict(' { "a" : 1, "b" : "line\\nvalue" } ');
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(canonicalDigest(first), canonicalDigest(second));
  assert.notEqual(canonicalDigest(first), canonicalDigest({ ...first, a: 2 }));
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), /JSON_DUPLICATE_KEY/);
  assert.throws(() => parseJsonStrict('{\u00a0"a":1}'), /JSON_PARSE_INVALID/);
  assert.throws(() => parseJsonStrict('{\f"a":1}'), /JSON_PARSE_INVALID/);
  assert.throws(() => parseJsonStrict('{"value":9007199254740993}'), /JSON_NUMBER_LOSSY/);
  assert.throws(() => parseJsonStrict('{"value":0.10000000000000001}'), /JSON_NUMBER_LOSSY/);
  const prototypeObject = parseJsonStrict('{"__proto__":{"polluted":true}}');
  assert.equal(Object.getPrototypeOf(prototypeObject), null);
  assert.equal(Object.hasOwn(prototypeObject, '__proto__'), true);
  const topLevelPrototype = parseJsonStrict(
    `${JSON.stringify(component()).slice(0, -1)},"__proto__":{"polluted":true}}`,
  );
  assert.throws(
    () => validateFamily('component', topLevelPrototype),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  const nestedPrototype = parseJsonStrict(
    JSON.stringify(component()).replace(
      '"defaults":{"disabled":false}',
      '"defaults":{"disabled":false,"__proto__":{"polluted":true}}',
    ),
  );
  assert.throws(
    () => validateFamily('component', nestedPrototype),
    expectCode('MUXUI_SCHEMA_INVALID'),
  );
  for (const inheritedKey of [
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__defineGetter__',
    '__lookupSetter__',
  ]) {
    const hostileRecord = parseJsonStrict(
      `${JSON.stringify(component()).slice(0, -1)},${JSON.stringify(inheritedKey)}:true}`,
    );
    assert.throws(
      () => validateFamily('component', hostileRecord),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );

    const hostileBinding = component();
    hostileBinding.bindings[inheritedKey] = structuredClone(
      hostileBinding.bindings['web.react'],
    );
    assert.throws(
      () => validateFamily('component', hostileBinding),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );

    const hostileRuntimeProfile = component();
    hostileRuntimeProfile.bindings['native.react-native'].runtimeProfiles[inheritedKey] = {
      strategy: 'adapted',
      lifecycle: 'experimental',
      validationProfile: 'native.ios',
    };
    assert.throws(
      () => validateFamily('component', hostileRuntimeProfile),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
  }
  assert.throws(
    () => canonicalJson({ 'line\r\n': 1, 'line\n': 2 }),
    /CANONICAL_KEY_COLLISION/,
  );
});

test('E-G0.1-03: editorial content and normative binding closure affect the correct revision', () => {
  const concept = component();
  const token = tokenSource();
  const normative = example();
  const baseContent = contentRevision('component', concept);
  const baseSpec = bindingSpecRevision({
    ...revisionInput({
      concept,
      examples: [normative],
      tokenSources: [token],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  });
  assert.throws(
    () => bindingSpecRevision({
      ...revisionInput({ concept, examples: [normative], tokenSources: [token] }),
    }),
    /missing executable source bytes/,
  );

  const editorialConcept = structuredClone(concept);
  editorialConcept.summary = 'Editorially clarified immediate-action guidance.';
  assert.notEqual(contentRevision('component', editorialConcept), baseContent);
  assert.equal(bindingSpecRevision({
    ...revisionInput({
      concept: editorialConcept,
      examples: [normative],
      tokenSources: [token],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  }), baseSpec);

  const inertExtension = structuredClone(concept);
  inertExtension.extensions = {
    'muxui.experimental.g01-proof': { note: 'inert', strategy: 'memo' },
  };
  assert.notEqual(contentRevision('component', inertExtension), baseContent);
  assert.equal(bindingSpecRevision({
    ...revisionInput({
      concept: inertExtension,
      examples: [normative],
      tokenSources: [token],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  }), baseSpec);

  const stableExtension = structuredClone(inertExtension);
  stableExtension.lifecycle = 'stable';
  assert.throws(() => validateFamily('component', stableExtension), /requires experimental lifecycle/);

  const normativeBinding = structuredClone(concept);
  normativeBinding.bindings['web.react'].api.defaults.disabled = true;
  assert.notEqual(bindingSpecRevision({
    ...revisionInput({
      concept: normativeBinding,
      examples: [normative],
      tokenSources: [token],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  }), baseSpec);

  assert.notEqual(bindingSpecRevision({
    ...revisionInput({
      concept,
      examples: [normative],
      tokenSources: [token],
      exampleSources: { [normative.id]: `${normativeExampleSource}// normative change\n` },
    }),
  }), baseSpec);

  const editorialToken = structuredClone(token);
  editorialToken.summary = 'Editorially clarified token guidance.';
  editorialToken.tokens['reference.color.black'].value = '#ffffff';
  assert.equal(bindingSpecRevision({
    ...revisionInput({
      concept,
      examples: [normative],
      tokenSources: [editorialToken],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  }), baseSpec);

  const normativeTokenContract = structuredClone(token);
  normativeTokenContract.tokenContractVersion = '1.2.0';
  assert.notEqual(bindingSpecRevision({
    ...revisionInput({
      concept,
      examples: [normative],
      tokenSources: [normativeTokenContract],
      exampleSources: { [normative.id]: normativeExampleSource },
    }),
  }), baseSpec);

  const unsafeTokenNumber = structuredClone(token);
  unsafeTokenNumber.tokens['reference.color.black'].value = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => contentRevision('token-source', unsafeTokenNumber),
    /CANONICAL_NUMBER_INVALID/,
  );

  const unsafeDefault = structuredClone(concept);
  unsafeDefault.bindings['web.react'].api.defaults.disabled = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => bindingSpecRevision({
      ...revisionInput({
        concept: unsafeDefault,
        examples: [normative],
        tokenSources: [token],
        exampleSources: { [normative.id]: normativeExampleSource },
      }),
    }),
    /CANONICAL_NUMBER_INVALID/,
  );

  const editorialExample = example({ guidanceImpact: 'editorial', purposes: ['explanation'] });
  editorialExample.summary = 'An editorial explanation only.';
  assert.equal(bindingSpecRevision({
    ...revisionInput({
      concept,
      examples: [editorialExample],
      tokenSources: [token],
    }),
  }), bindingSpecRevision({
    ...revisionInput({ concept, examples: [], tokenSources: [token] }),
  }));

  const forbiddenDowngrade = example({ guidanceImpact: 'editorial', purposes: ['generation'] });
  assert.throws(
    () => validateFamily('example', forbiddenDowngrade),
    /implementation-relevant examples must be normative/,
  );
});

test('E-G0.1-04: package/source locations remain derived and generated types retain owner linkage', async () => {
  for (const record of [component(), example(), guide(), capability(), tokenSource()]) {
    record.sourceLocation = 'packages/incorrect';
    assert.throws(
      () => validateFamily(record.kind === 'token' ? 'token-source' : record.kind, record),
      expectCode('MUXUI_SCHEMA_INVALID'),
    );
  }
  const generated = await readFile(resolve(import.meta.dirname, '../generated/types.d.ts'), 'utf8');
  assert.match(generated, /@generated-from: packages\/schema\/schemas\/type-projection\.json/);
  assert.match(generated, /export type ArtifactKind/);
});

test('token-source 2.0 to 2.1 migration is explicit, omission-preserving, and idempotent', () => {
  const legacy = tokenSource();
  legacy.schemaVersion = '2.0.0';
  const omitted = migrateTokenSourceV2ToV2_1(legacy);
  assert.equal(omitted.schemaVersion, '2.1.0');
  assert.equal(Object.hasOwn(omitted, 'sourceCrosswalk'), false);
  assert.deepEqual(migrateTokenSourceV2ToV2_1(omitted), omitted);
  assert.deepEqual(migrateTokenSourceV2ToV2_1(legacy, { dryRun: true }), {
    from: '2.0.0',
    to: '2.1.0',
    changed: true,
    readRewrite: false,
    sourceCrosswalk: 'omitted',
  });

  const sourceCrosswalk = {
    baseline: {
      repository: 'muxui/reference',
      revision: 'a'.repeat(40),
      path: 'packages/tokens/tokens.json',
      sha256: `sha256:${'b'.repeat(64)}`,
      baseFontSizePx: 16,
      declarationOccurrences: 1,
      customPropertyOccurrences: 0,
      uniqueCustomPropertyNames: 0,
      nonCustomPropertyOccurrences: 1,
    },
    entries: [{
      occurrence: { ordinal: 1, file: '_base.css', selector: 'html', name: 'font-size', value: '100%' },
      disposition: 'reject',
      reason: 'An HTML root style is not a portable token declaration.',
      targets: {
        'web.html': 'rejected',
        'web.react': 'rejected',
        'native.ios': 'rejected',
        'native.android': 'rejected',
        'native.react-native-web': 'rejected',
      },
    }],
    groups: [],
  };
  const migrated = migrateTokenSourceV2ToV2_1(legacy, { sourceCrosswalk });
  assert.deepEqual(migrated.sourceCrosswalk, sourceCrosswalk);
  assert.deepEqual(migrateTokenSourceV2ToV2_1(migrated, { sourceCrosswalk }), migrated);
  assert.throws(
    () => migrateTokenSourceV2ToV2_1(migrated, { sourceCrosswalk: { ...sourceCrosswalk, extra: true } }),
    expectCode('MUXUI_SCHEMA_MIGRATION_REQUIRED'),
  );
  assert.throws(
    () => migrateTokenSourceV2ToV2_1(legacy, { dryRun: 'true' }),
    expectCode('MUXUI_SCHEMA_MIGRATION_REQUIRED'),
  );
});

test('section-page grammar is closed, typed, and position-safe', () => {
  const page = {
    schemaVersion: '1.2.0',
    responseType: 'artifact.detail.section-page',
    meta: {
      queryApiVersion: '1.2.0',
      catalogVersion: '0.1.0',
      catalogDigest: `sha256:${'a'.repeat(64)}`,
      tokenSourceContentRevision: `sha256:${'b'.repeat(64)}`,
      artifactId: 'muxui:token:default-theme',
      section: 'tokens',
      selectorDigest: `sha256:${'c'.repeat(64)}`,
    },
    entries: {
      status: 'available',
      items: [{
        id: 'reference.color.black',
        definition: {
          layer: 'reference',
          type: 'color',
          unit: 'hex',
          meaning: 'Pinned black reference value.',
          overridePolicy: 'fixed',
          value: '#000000',
        },
      }],
    },
    page: {
      position: 0,
      returned: 1,
      remaining: 0,
      nextCursor: null,
      entryTokens: 20,
      densePageBudget: 2048,
    },
    diagnostics: [],
  };
  assert.doesNotThrow(() => validateFamily('section-page', page));
  assert.doesNotThrow(() => validateFamily('query-envelope', page));

  const continued = structuredClone(page);
  continued.page.remaining = 1;
  continued.page.nextCursor = sectionCursor({
    catalogDigest: continued.meta.catalogDigest,
    nextPosition: 1,
    queryApiVersion: continued.meta.queryApiVersion,
    section: continued.meta.section,
    selectorDigest: continued.meta.selectorDigest,
    tokenSourceContentRevision: continued.meta.tokenSourceContentRevision,
  });
  assert.doesNotThrow(() => validateFamily('section-page', continued));

  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.entries.status = 1; },
    (value) => { value.entries.reason = 'not-allowed-when-available'; },
    (value) => { value.entries.tokenSourceSchemaVersion = '2.0.0'; },
    (value) => { value.page.returned = 0; },
    (value) => { value.page.remaining = 1; },
    (value) => { value.page.position = 4294967295; value.page.returned = 1; },
    (value) => { value.meta.catalogVersion = '1'.repeat(65); },
    (value) => { value.meta.catalogVersion = 'not-semver'; },
    (value) => { value.meta.artifactId = `muxui:token:${'a-'.repeat(130)}a`; },
    (value) => { value.page.remaining = 1; value.page.nextCursor = 'c1.e30.0000000000000000000000000000000000000000000000000000000000000000'; },
  ]) {
    const invalid = structuredClone(page);
    mutate(invalid);
    assert.throws(() => validateFamily('section-page', invalid), /MUXUI_SCHEMA_INVALID/);
  }

  const terminal = structuredClone(page);
  terminal.entries.items = [];
  terminal.page = {
    position: 4294967295,
    returned: 0,
    remaining: 0,
    nextCursor: null,
    entryTokens: 0,
    densePageBudget: 2048,
  };
  assert.doesNotThrow(() => validateFamily('section-page', terminal));

  const absent = structuredClone(page);
  absent.meta.section = 'source-crosswalk';
  absent.entries = {
    status: 'absent',
    reason: 'token-source-schema-does-not-declare-source-crosswalk',
    tokenSourceSchemaVersion: '2.0.0',
    items: [],
  };
  absent.page = {
    position: 0,
    returned: 0,
    remaining: 0,
    nextCursor: null,
    entryTokens: 0,
    densePageBudget: 2048,
  };
  assert.doesNotThrow(() => validateFamily('section-page', absent));

  const omitted = structuredClone(absent);
  omitted.entries.reason = 'token-source-omits-source-crosswalk';
  omitted.entries.tokenSourceSchemaVersion = '2.1.0';
  assert.doesNotThrow(() => validateFamily('section-page', omitted));

  const sourceCrosswalk = structuredClone(page);
  sourceCrosswalk.meta.section = 'source-crosswalk';
  sourceCrosswalk.entries.items = [{
    occurrence: {
      ordinal: 1,
      file: '_base.css',
      selector: 'html',
      name: 'font-size',
      value: '100%',
    },
    disposition: 'reject',
    reason: 'This is an HTML root style, not a portable token declaration.',
    targets: {
      'web.html': 'rejected',
      'web.react': 'rejected',
      'native.ios': 'rejected',
      'native.android': 'rejected',
      'native.react-native-web': 'rejected',
    },
  }];
  sourceCrosswalk.page.entryTokens = countLexemes(sourceCrosswalk.entries.items[0]);
  assert.doesNotThrow(() => validateFamily('section-page', sourceCrosswalk));

  const ordinalTie = structuredClone(sourceCrosswalk);
  const tiedEntry = structuredClone(ordinalTie.entries.items[0]);
  tiedEntry.occurrence.name = '--muxui-font-size';
  tiedEntry.occurrence.value = '1rem';
  ordinalTie.entries.items = [ordinalTie.entries.items[0], tiedEntry]
    .sort((left, right) => {
      const leftBytes = canonicalJson(left);
      const rightBytes = canonicalJson(right);
      return leftBytes < rightBytes ? -1 : leftBytes > rightBytes ? 1 : 0;
    });
  ordinalTie.page.returned = ordinalTie.entries.items.length;
  ordinalTie.page.entryTokens = ordinalTie.entries.items.reduce(
    (total, entry) => total + countLexemes(entry),
    0,
  );
  assert.doesNotThrow(() => validateFamily('section-page', ordinalTie));
  const reversedOrdinalTie = structuredClone(ordinalTie);
  reversedOrdinalTie.entries.items.reverse();
  assert.throws(() => validateFamily('section-page', reversedOrdinalTie), /MUXUI_SCHEMA_INVALID/);
  const duplicateOrdinalTie = structuredClone(ordinalTie);
  duplicateOrdinalTie.entries.items[1] = structuredClone(duplicateOrdinalTie.entries.items[0]);
  duplicateOrdinalTie.page.entryTokens = duplicateOrdinalTie.entries.items.reduce(
    (total, entry) => total + countLexemes(entry),
    0,
  );
  assert.throws(() => validateFamily('section-page', duplicateOrdinalTie), /MUXUI_SCHEMA_INVALID/);

  for (const mutate of [
    (value) => { value.entries.items[0].muxuiTokenId = 'reference.color.black'; },
    (value) => { value.entries.items[0].occurrence.ordinal = 0; },
    (value) => { value.entries.items[0].targets['web.html'] = 'invented'; },
    (value) => { value.meta.section = 'tokens'; },
  ]) {
    const invalid = structuredClone(sourceCrosswalk);
    mutate(invalid);
    assert.throws(() => validateFamily('section-page', invalid), /MUXUI_SCHEMA_INVALID/);
  }

  const wrongCursorBinding = structuredClone(continued);
  wrongCursorBinding.meta.selectorDigest = `sha256:${'d'.repeat(64)}`;
  assert.throws(() => validateFamily('section-page', wrongCursorBinding), /MUXUI_SCHEMA_INVALID/);
  const tamperedCursor = structuredClone(continued);
  tamperedCursor.page.nextCursor = `${continued.page.nextCursor.slice(0, -1)}${continued.page.nextCursor.endsWith('0') ? '1' : '0'}`;
  assert.throws(() => validateFamily('section-page', tamperedCursor), /MUXUI_SCHEMA_INVALID/);
});

test('page budget profile grammar is closed and internally bounded', async () => {
  const profile = parseJsonStrict(await readFile(
    resolve(import.meta.dirname, '../../catalog/token-section-page-budget-profile.json'),
    'utf8',
  ));
  assert.doesNotThrow(() => validateFamily('token-section-page-budget-profile', profile));
  for (const mutate of [
    (value) => { value.unowned = true; },
    (value) => { value.cursorBindings.reverse(); },
    (value) => { value.maximumEntryTokens -= 1; },
    (value) => { value.defaultItemLimit = value.maximumItemLimit + 1; },
    (value) => { value.normalizedWorstCaseEnvelopeSha256 = 'not-a-digest'; },
    (value) => { value.id = 'muxui-token-section-page-budget-1-2-0'; },
    (value) => { value.queryApiVersion = '1.2.0'; },
  ]) {
    const invalid = structuredClone(profile);
    mutate(invalid);
    assert.throws(
      () => validateFamily('token-section-page-budget-profile', invalid),
      /MUXUI_SCHEMA_INVALID/,
    );
  }
});

test('E-G0.1-05: schema evolution and append-only response policy enforce declared effects', () => {
  assert.equal(classifySchemaChange('description-or-annotation').versionEffect, 'patch');
  assert.equal(classifySchemaChange('optional-stable-field').versionEffect, 'minor');
  assert.equal(classifySchemaChange('required-field').versionEffect, 'major');
  assert.equal(classifySchemaChange('field-removal').migration, 'deprecate-in-minor-remove-next-major');
  for (const inheritedChangeType of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => classifySchemaChange(inheritedChangeType),
      expectCode('MUXUI_SCHEMA_VERSION_UNSUPPORTED'),
    );
  }
  assert.deepEqual(
    negotiateSchemaVersion('1.2.3', { minimum: '1.0.0', maximumExclusive: '2.0.0' }),
    { version: '1.2.3', compatibility: 'readable' },
  );
  assert.throws(
    () => negotiateSchemaVersion('2.0.0', { minimum: '1.0.0', maximumExclusive: '2.0.0' }),
    expectCode('MUXUI_SCHEMA_VERSION_UNSUPPORTED'),
  );
  assert.deepEqual(assertAppendOnlyErrorCodes(ERROR_CODES, [...ERROR_CODES, 'MUXUI_NEW_CODE']), [
    ...ERROR_CODES,
    'MUXUI_NEW_CODE',
  ]);
  assert.throws(
    () => assertAppendOnlyErrorCodes(ERROR_CODES, ERROR_CODES.slice(1)),
    expectCode('MUXUI_SCHEMA_VERSION_UNSUPPORTED'),
  );
});
