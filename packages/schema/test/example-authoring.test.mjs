import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  SchemaValidationError,
  authoringMetadata,
  bindingSpecRevision,
  contentRevisionPreimage,
  loadFieldOwnershipRegistry,
  patternRevision,
  resolveAuthoringField,
  validateAuthoringMetadata,
} from '../src/index.mjs';
import {
  component,
  example,
  pattern,
  tokenSource,
  variantExample,
} from './fixtures.mjs';

async function schemaDocument(name) {
  return JSON.parse(await readFile(
    resolve(import.meta.dirname, `../schemas/${name}`),
    'utf8',
  ));
}

const source = '<Button>Save</Button>\n';

test('E-BL1-02: example is an authoring family whose fields resolve to their owner, effects, and axes', async () => {
  const schema = await schemaDocument('example.schema.json');
  const topLevel = authoringMetadata('example')
    .filter(({ schemaPointer }) => /^#\/properties\/[^/]+$/u.test(schemaPointer))
    .map(({ field }) => field);
  assert.deepEqual(topLevel.sort(), Object.keys(schema.properties).sort());
  assert.ok(authoringMetadata('example').every(({ family, schema: file }) => (
    family === 'example' && file === 'example.schema.json'
  )));

  // The orphan-example issue cites `$/binding`; its owner now resolves.
  const binding = resolveAuthoringField('example', '$/binding');
  assert.equal(binding.owner, 'example-contract');
  assert.equal(binding.schemaPointer, '#/properties/binding');
  assert.equal(binding.effects.add, 'incompatible');
  assert.equal(
    resolveAuthoringField('example', '$/binding/ref').schemaPointer,
    '#/properties/binding/properties/ref',
  );
  const summary = resolveAuthoringField('example', '$/summary');
  assert.equal(summary.effects.replace, 'editorial');
  assert.deepEqual(summary.autofixes, ['trim-outer-whitespace']);
  assert.equal(resolveAuthoringField('example', '$/extensions/muxui.experimental.x').effects.add, 'compatible');
  assert.equal(resolveAuthoringField('example', '$/source').effects.replace, 'incompatible');
});

test('E-BL1-02: every example field folds into the content revision that both spec revisions fold in', async () => {
  const schema = await schemaDocument('example.schema.json');
  const full = { ...example(), extensions: { 'muxui.experimental.note': true } };
  const preimage = contentRevisionPreimage('example', full, { sourceBytes: source });
  // The preimage is the whole record, so no declared field can sit outside it.
  assert.deepEqual(Object.keys(preimage.record).sort(), Object.keys(schema.properties).sort());
  for (const declaration of authoringMetadata('example')) {
    assert.deepEqual(declaration.revisionAxes, ['content', 'binding-spec', 'pattern-spec']);
  }

  const spec = (record, bytes = source) => bindingSpecRevision({
    component: component(),
    bindingId: 'web.react',
    examples: [record],
    exampleSources: { [record.id]: bytes },
    tokenSources: [tokenSource()],
  });
  const bound = example();
  assert.notEqual(spec(bound), spec({ ...bound, name: 'Renamed' }));
  assert.notEqual(spec(bound), spec(bound, `${source}// edited\n`));

  const variant = variantExample();
  const patternOf = (record, bytes = source) => patternRevision({
    pattern: pattern(),
    examples: [record],
    exampleSources: { [record.id]: bytes },
  });
  assert.notEqual(patternOf(variant), patternOf({ ...variant, name: 'Renamed' }));
  assert.notEqual(patternOf(variant), patternOf(variant, `${source}// edited\n`));
});

for (const family of ['pattern', 'example']) {
  test(`E-BL1-02 negative: a new ${family} field cannot bypass authoring and ownership coupling`, async () => {
    const file = `${family}.schema.json`;
    const document = await schemaDocument(file);
    const ownership = structuredClone(loadFieldOwnershipRegistry());
    const baselineCount = validateAuthoringMetadata().length;
    const failure = (schemas, ownershipView = ownership) => {
      try {
        validateAuthoringMetadata({ schemas: { [file]: schemas }, ownership: ownershipView });
      } catch (error) {
        assert.ok(error instanceof SchemaValidationError);
        return error;
      }
      return assert.fail('metadata unexpectedly validated');
    };

    const topLevel = structuredClone(document);
    topLevel.properties.newStableField = { type: 'string', minLength: 1 };
    assert.match(failure(topLevel).message, /missing x-muxui-authoring metadata/u);

    // A nested property is as visible as a top-level one.
    const nested = structuredClone(document);
    const container = family === 'pattern'
      ? nested.properties.participants.items
      : nested.properties.binding;
    container.properties.newNestedField = { type: 'string' };
    assert.match(failure(nested).message, /missing x-muxui-authoring metadata/u);

    // Annotated but unowned still fails; owner and annotation together pass.
    topLevel.properties.newStableField['x-muxui-authoring'] = {
      effect: 'incompatible',
      revisionAxes: ['content'],
    };
    assert.equal(failure(topLevel).code, 'MUXUI_FIELD_OWNERSHIP_INVALID');
    ownership.fields.push({
      class: 'authored',
      name: 'newStableField',
      owner: `${family}-contract`,
      schema: file,
      schemaPointer: '#/properties/newStableField',
    });
    const coupled = validateAuthoringMetadata({ schemas: { [file]: topLevel }, ownership });
    assert.equal(coupled.length, baselineCount + 1);
    assert.deepEqual(
      coupled.find(({ field }) => field === 'newStableField').revisionAxes,
      ['content'],
    );
  });
}
