import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  SchemaValidationError,
  authoringMetadata,
  authoringMetadataDigest,
  bindingContentRevision,
  bindingContentRevisionPreimage,
  bindingSpecRevision,
  bindingSpecRevisionPreimage,
  canonicalDigest,
  contentRevision,
  contentRevisionPreimage,
  loadFieldOwnershipRegistry,
  patternRevisionPreimage,
  resolveAuthoringField,
  validateAuthoringMetadata,
} from '../src/index.mjs';
import {
  component,
  example,
  specifiedPattern,
  tokenSource,
  variantExample,
} from './fixtures.mjs';

async function schemaDocument(name) {
  return JSON.parse(await readFile(
    resolve(import.meta.dirname, `../schemas/${name}`),
    'utf8',
  ));
}

test('E-G0.5-04: schema-owned metadata drives completion, effects, revisions, and owners', () => {
  const declarations = validateAuthoringMetadata();
  assert.ok(declarations.length > 30);
  assert.match(authoringMetadataDigest(), /^sha256:[a-f0-9]{64}$/u);
  assert.equal(authoringMetadata('component').some(({ field }) => field === 'summary'), true);

  const lifecycle = resolveAuthoringField('component', '$/lifecycle');
  assert.deepEqual(lifecycle.completion.values, [
    'experimental',
    'stable',
    'deprecated',
    'removed',
  ]);
  assert.equal(lifecycle.owner, 'component-contract');
  assert.equal(lifecycle.effects.replace, 'incompatible');

  const defaultValue = resolveAuthoringField(
    'component',
    '$/bindings/web.react/api/defaults/disabled',
  );
  assert.equal(defaultValue.field, 'defaults');
  assert.equal(defaultValue.owner, 'binding-contract');
  assert.deepEqual(defaultValue.revisionAxes, ['binding-content', 'binding-spec']);
});

test('E-G0.5-04: authoring resolves family files only through the canonical schema contract', async () => {
  const source = await readFile(resolve(import.meta.dirname, '../src/authoring.mjs'), 'utf8');
  assert.doesNotMatch(source, /(?:binding|component)\.schema\.json/u);
  assert.ok(authoringMetadata('binding').every(({ family }) => family === 'binding'));
  assert.ok(authoringMetadata('component').every(({ family }) => family === 'component'));
});
test('E-G0.5-02: revision preimages are the exact inputs hashed by existing digest functions', () => {
  const concept = component();
  const binding = concept.bindings['web.react'];
  const normative = example();
  const token = tokenSource();
  const source = '<Button disabled={false}>Save</Button>\n';
  const specInput = {
    component: concept,
    bindingId: 'web.react',
    examples: [normative],
    exampleSources: { [normative.id]: source },
    tokenSources: [token],
  };
  assert.equal(
    contentRevision('component', concept),
    canonicalDigest(contentRevisionPreimage('component', concept)),
  );
  assert.equal(
    bindingContentRevision(binding),
    canonicalDigest(bindingContentRevisionPreimage(binding)),
  );
  assert.equal(
    bindingSpecRevision(specInput),
    canonicalDigest(bindingSpecRevisionPreimage(specInput)),
  );
});

function firstProperty(pointer) {
  const match = /^#\/properties\/([^/]+)/u.exec(pointer);
  return match?.[1].replaceAll('~1', '/').replaceAll('~0', '~') ?? null;
}

function finalProperty(pointer) {
  const match = /\/properties\/([^/]+)$/u.exec(pointer);
  return match?.[1].replaceAll('~1', '/').replaceAll('~0', '~') ?? null;
}

test('E-G0.5-02: every declared revision axis matches its digest preimage membership', () => {
  const concept = component();
  const preimage = bindingSpecRevisionPreimage({
    component: concept,
    bindingId: 'web.react',
    tokenSources: [tokenSource()],
  });
  const componentSpecFields = new Set(Object.keys(preimage.component));
  const bindingSpecFields = new Set(Object.keys(preimage.binding));
  // The specified pattern carries every optional field, so the preimage lists them all.
  // `variants` enter as the ordered example revisions beside the pattern fields.
  const patternSpecFields = new Set([
    ...Object.keys(patternRevisionPreimage({
      pattern: specifiedPattern(),
      examples: [variantExample()],
      exampleSources: { [variantExample().id]: '<GridList />\n' },
    }).pattern),
    'variants',
  ]);
  // An example enters a revision as its whole-record content revision, so a field is in a
  // preimage when the record that preimage folds carries it. A bound example folds into the
  // binding spec only when normative, and a variant folds into its pattern; neither carries
  // the other's fields, so the per-field annotation may over-claim but must never under-claim.
  const sourceBytes = '<Button disabled={false}>Save</Button>\n';
  const bound = example();
  const variant = variantExample();
  const revisionOf = (record) => contentRevision('example', record, { sourceBytes });
  const [normative] = bindingSpecRevisionPreimage({
    component: component(),
    bindingId: 'web.react',
    examples: [bound],
    exampleSources: { [bound.id]: sourceBytes },
    tokenSources: [tokenSource()],
  }).normativeExamples;
  const [listed] = patternRevisionPreimage({
    pattern: specifiedPattern(),
    examples: [variant],
    exampleSources: { [variant.id]: sourceBytes },
  }).variants;
  const exampleFolds = {
    content: Object.keys(contentRevisionPreimage('example', bound, { sourceBytes }).record),
    'binding-spec': normative.revision === revisionOf(bound) ? Object.keys(bound) : [],
    'pattern-spec': listed.revision === revisionOf(variant) ? Object.keys(variant) : [],
  };
  const declarations = validateAuthoringMetadata();

  for (const declaration of declarations.filter(({ family }) => family === 'example')) {
    const field = firstProperty(declaration.schemaPointer);
    for (const [axis, fields] of Object.entries(exampleFolds)) {
      if (fields.includes(field)) {
        assert.ok(declaration.revisionAxes.includes(axis), `example${declaration.schemaPointer} omits ${axis}`);
      }
    }
    assert.ok(
      declaration.revisionAxes.every((axis) => Object.hasOwn(exampleFolds, axis)),
      `example${declaration.schemaPointer} declares an axis no example folds into`,
    );
  }

  for (const declaration of declarations.filter(({ family }) => family !== 'example')) {
    let expected;
    if (declaration.schema === 'pattern.schema.json') {
      expected = [
        'content',
        ...(patternSpecFields.has(firstProperty(declaration.schemaPointer)) ? ['pattern-spec'] : []),
      ];
    } else if (declaration.schema === 'component.schema.json') {
      const field = firstProperty(declaration.schemaPointer);
      expected = [
        'content',
        ...(componentSpecFields.has(field) || field === 'bindings' ? ['binding-spec'] : []),
      ];
    } else {
      assert.equal(declaration.schema, 'binding.schema.json');
      const rootField = firstProperty(declaration.schemaPointer);
      const definitionField = declaration.schemaPointer.startsWith('#/$defs/')
        ? finalProperty(declaration.schemaPointer)
        : null;
      const inBindingSpec = bindingSpecFields.has(rootField)
        || definitionField !== null
        || bindingSpecFields.has(finalProperty(declaration.schemaPointer));
      expected = ['binding-content', ...(inBindingSpec ? ['binding-spec'] : [])];
    }
    assert.deepEqual(
      declaration.revisionAxes,
      expected,
      `${declaration.schema}${declaration.schemaPointer}`,
    );
  }
});

test('E-G0.5-02: corrected identity and runtime-profile fields change observed spec digests', () => {
  const baseline = component();
  const tokenSources = [tokenSource()];
  const digest = (record, bindingId) => bindingSpecRevision({
    component: record,
    bindingId,
    tokenSources,
  });

  const renamed = structuredClone(baseline);
  renamed.id = 'muxui:component:button-renamed';
  assert.notEqual(digest(baseline, 'web.react'), digest(renamed, 'web.react'));
  assert.deepEqual(
    resolveAuthoringField('component', '$/id').revisionAxes,
    ['content', 'binding-spec'],
  );

  const revisedReason = structuredClone(baseline);
  revisedReason.bindings['native.react-native']
    .runtimeProfiles['native.react-native-web'].reason += ' Reassessed.';
  assert.notEqual(
    digest(baseline, 'native.react-native'),
    digest(revisedReason, 'native.react-native'),
  );
  assert.deepEqual(
    resolveAuthoringField(
      'component',
      '$/bindings/native.react-native/runtimeProfiles/native.react-native-web/reason',
    ).revisionAxes,
    ['binding-content', 'binding-spec'],
  );

  const addedAlternative = structuredClone(baseline);
  addedAlternative.bindings['native.react-native']
    .runtimeProfiles['native.react-native-web'].alternative = baseline.id;
  assert.notEqual(
    digest(baseline, 'native.react-native'),
    digest(addedAlternative, 'native.react-native'),
  );
  assert.deepEqual(
    resolveAuthoringField(
      'component',
      '$/bindings/native.react-native/runtimeProfiles/native.react-native-web/alternative',
    ).revisionAxes,
    ['binding-content', 'binding-spec'],
  );

  const editorial = structuredClone(baseline);
  editorial.bindings['web.react'].editorialNotes = ['Clarified implementation note.'];
  assert.notEqual(
    bindingContentRevision(baseline.bindings['web.react']),
    bindingContentRevision(editorial.bindings['web.react']),
  );
  assert.equal(digest(baseline, 'web.react'), digest(editorial, 'web.react'));
});

test('E-G0.5-04 negative: a new stable field cannot bypass authoring and ownership coupling', async () => {
  const componentSchema = await schemaDocument('component.schema.json');
  const bindingSchema = await schemaDocument('binding.schema.json');
  const ownership = structuredClone(loadFieldOwnershipRegistry());
  const baselineCount = validateAuthoringMetadata().length;
  componentSchema.required.push('newStableField');
  componentSchema.properties.newStableField = { type: 'string', minLength: 1 };
  assert.throws(
    () => validateAuthoringMetadata({
      schemas: {
        'binding.schema.json': bindingSchema,
        'component.schema.json': componentSchema,
      },
      ownership,
    }),
    (error) => {
      assert.ok(error instanceof SchemaValidationError);
      assert.equal(error.code, 'MUXUI_SCHEMA_INVALID');
      assert.match(error.message, /missing x-muxui-authoring metadata/u);
      return true;
    },
  );

  componentSchema.properties.newStableField['x-muxui-authoring'] = {
    effect: 'incompatible',
    revisionAxes: ['content'],
  };
  ownership.fields.push({
    class: 'authored',
    name: 'newStableField',
    owner: 'component-contract',
    schema: 'component.schema.json',
    schemaPointer: '#/properties/newStableField',
  });
  const coupled = validateAuthoringMetadata({
    schemas: {
      'binding.schema.json': bindingSchema,
      'component.schema.json': componentSchema,
    },
    ownership,
  });
  assert.equal(coupled.length, baselineCount + 1);
  assert.deepEqual(
    coupled.find(({ field }) => field === 'newStableField').revisionAxes,
    ['content'],
  );
});

test('E-G0.5-04 negative: schema-bearing keywords and references cannot hide authorable fields', async () => {
  const [baselineComponent, bindingSchema, ownership] = await Promise.all([
    schemaDocument('component.schema.json'),
    schemaDocument('binding.schema.json'),
    structuredClone(loadFieldOwnershipRegistry()),
  ]);
  const payload = (field) => ({
    type: 'object',
    properties: { [field]: { type: 'string' } },
  });
  const mapKeywords = ['$defs', 'patternProperties', 'dependentSchemas'];
  const arrayKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
  const singleKeywords = [
    'items', 'additionalProperties', 'propertyNames', 'contains',
    'not', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties',
  ];
  for (const keyword of [...mapKeywords, ...arrayKeywords, ...singleKeywords]) {
    const componentSchema = structuredClone(baselineComponent);
    const field = `hidden${keyword.replaceAll(/[^a-z]/giu, '')}`;
    if (mapKeywords.includes(keyword)) {
      componentSchema.$defs = {
        ...(componentSchema.$defs ?? {}),
        [`probe-${keyword}`]: keyword === '$defs'
          ? payload(field)
          : { [keyword]: { probe: payload(field) } },
      };
    } else if (arrayKeywords.includes(keyword)) {
      componentSchema.$defs = {
        ...(componentSchema.$defs ?? {}),
        [`probe-${keyword}`]: { [keyword]: [payload(field)] },
      };
    } else {
      componentSchema.$defs = {
        ...(componentSchema.$defs ?? {}),
        [`probe-${keyword}`]: { [keyword]: payload(field) },
      };
    }
    assert.throws(
      () => validateAuthoringMetadata({
        schemas: {
          'binding.schema.json': bindingSchema,
          'component.schema.json': componentSchema,
        },
        ownership,
      }),
      (error) => error instanceof SchemaValidationError
        && error.code === 'MUXUI_SCHEMA_INVALID'
        && error.message.includes('missing x-muxui-authoring metadata'),
      keyword,
    );
  }

  const componentSchema = structuredClone(baselineComponent);
  componentSchema.allOf = [{ $ref: 'hidden-authoring.schema.json' }];
  assert.throws(
    () => validateAuthoringMetadata({
      schemas: {
        'binding.schema.json': bindingSchema,
        'component.schema.json': componentSchema,
        'hidden-authoring.schema.json': payload('hiddenReference'),
      },
      ownership,
    }),
    (error) => error instanceof SchemaValidationError
      && error.message.includes('missing x-muxui-authoring metadata'),
  );
});
