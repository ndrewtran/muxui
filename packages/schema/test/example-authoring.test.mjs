import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  SchemaValidationError,
  authoringMetadata,
  bindingSpecRevision,
  bindingSpecRevisionPreimage,
  contentRevision,
  contentRevisionPreimage,
  loadFieldOwnershipRegistry,
  patternRevision,
  resolveAuthoringField,
  validateAuthoringMetadata,
  validateCatalogRecords,
} from '../src/index.mjs';
import {
  component,
  example,
  gridList,
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
// An editorial example may only serve explanation, so it cannot guide generation.
const editorialExample = () => example({ guidanceImpact: 'editorial', purposes: ['explanation'] });

/** The revisions that can fold an example beside its content: a bound one into a binding spec, a variant into its pattern. */
const boundSpecInput = (record, bytes = source) => ({
  component: component(),
  bindingId: 'web.react',
  examples: [record],
  exampleSources: { [record.id]: bytes },
  tokenSources: [tokenSource()],
});
const boundSpec = (record, bytes) => bindingSpecRevision(boundSpecInput(record, bytes));
const variantSpec = (record, bytes = source) => patternRevision({
  pattern: pattern(),
  examples: [record],
  exampleSources: { [record.id]: bytes },
});

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

test('E-BL1-02: an example folds into the content revision whole, so its declared axes are a conservative superset', async () => {
  const schema = await schemaDocument('example.schema.json');
  const full = { ...example(), extensions: { 'muxui.experimental.note': true } };
  const preimage = contentRevisionPreimage('example', full, { sourceBytes: source });
  // The preimage is the whole record, so no declared field can sit outside it.
  assert.deepEqual(Object.keys(preimage.record).sort(), Object.keys(schema.properties).sort());

  // Each scenario: the example, the spec revision that can fold it, its axis, and whether it does.
  // A bound example folds into the binding spec only when normative; a variant always folds into its pattern.
  const scenarios = [
    { label: 'normative bound example', record: example(), spec: boundSpec, axis: 'binding-spec', folds: true },
    { label: 'editorial bound example', record: editorialExample(), spec: boundSpec, axis: 'binding-spec', folds: false },
    { label: 'pattern variant', record: variantExample(), spec: variantSpec, axis: 'pattern-spec', folds: true },
  ];
  // One edit per declared field; `binding` exists only on bound examples.
  const edits = {
    name: (record) => ({ record: { ...record, name: 'Renamed' }, bytes: source }),
    summary: (record) => ({ record: { ...record, summary: 'Reworded.' }, bytes: source }),
    lifecycle: (record) => ({ record: { ...record, lifecycle: 'stable' }, bytes: source }),
    complexity: (record) => ({ record: { ...record, complexity: 'advanced' }, bytes: source }),
    source: (record) => ({ record: { ...record, source: `${record.source}.moved` }, bytes: source }),
    extensions: (record) => ({ record: { ...record, extensions: { 'muxui.experimental.note': true } }, bytes: source }),
    'source bytes': (record) => ({ record, bytes: `${source}// edited\n` }),
    binding: (record) => ({
      record: { ...record, binding: { ...record.binding, preference: 1 } },
      bytes: source,
    }),
  };

  for (const { label, record, spec, axis, folds } of scenarios) {
    for (const [name, edit] of Object.entries(edits)) {
      if (name === 'binding' && record.binding === undefined) continue;
      const { record: edited, bytes } = edit(record);
      const moved = new Set();
      if (contentRevision('example', record, { sourceBytes: source })
        !== contentRevision('example', edited, { sourceBytes: bytes })) moved.add('content');
      if (spec(record) !== spec(edited, bytes)) moved.add(axis);
      // Every revision an edit actually moves is declared, so the annotation never under-approximates.
      // It is per field, not per example kind, so it may declare more (a variant has no binding to fold).
      const field = name === 'source bytes' ? 'source' : name;
      const declared = resolveAuthoringField('example', `$/${field}`).revisionAxes;
      for (const observed of moved) assert.ok(declared.includes(observed), `${label} ${name} moves ${observed}`);
      assert.ok(moved.has('content'), `${label} ${name} moves the content revision`);
      assert.equal(moved.has(axis), folds, `${label} ${name} ${axis}`);
    }
  }
});

test('E-BL1-02: an editorial bound example never moves the binding spec revision, though its fields declare binding-spec', () => {
  const editorial = editorialExample();
  // Only a normative example enters the preimage, so an editorial one leaves it unchanged...
  assert.deepEqual(bindingSpecRevisionPreimage(boundSpecInput(editorial)).normativeExamples, []);
  assert.equal(boundSpec(editorial), boundSpec({ ...editorial, name: 'Renamed' }));
  assert.equal(boundSpec(editorial), boundSpec(editorial, `${source}// edited\n`));
  // ...while the same example turned normative does move it, so the guidance impact alone decides.
  const normative = example();
  assert.notEqual(boundSpec(normative), boundSpec({ ...normative, name: 'Renamed' }));
  // The per-field annotation cannot see the guidance impact, so it over-claims for editorial examples.
  assert.ok(resolveAuthoringField('example', '$/name').revisionAxes.includes('binding-spec'));
});

test('E-BL1-02: a bound example cannot also be a pattern variant, so a binding never reaches the pattern revision', () => {
  const bound = { ...example(), id: variantExample().id, source: variantExample().source };
  assert.throws(
    () => validateCatalogRecords([component(), gridList(), bound, pattern(), tokenSource()]),
    /has two owners/u,
  );
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
