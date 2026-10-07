import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PATTERN_CATEGORY_GROUPS,
  SchemaValidationError,
  contentRevision,
  patternGroup,
  patternRevision,
  relationEdges,
  resolveAuthoringField,
  validateCatalogRecords,
  validateFamily,
  validateRelationRegistry,
} from '../src/index.mjs';
import { loadJsonDocument } from '../src/contracts.mjs';
import {
  example,
  gridList,
  pattern,
  patternRecords,
  specifiedPattern,
  variantExample,
  webPlatformSafety,
} from './fixtures.mjs';

const patternId = 'muxui:pattern:poster-grid';
const variantId = 'muxui:example:poster-grid-css';
const variantSource = '<GridList aria-label="Posters" />\n';

function failure(records) {
  try {
    validateCatalogRecords(records);
  } catch (error) {
    assert.ok(error instanceof SchemaValidationError);
    return error;
  }
  return assert.fail('records unexpectedly validated');
}

/** Replaces the fixture pattern with a mutated copy and returns the validation failure. */
function patternFailure(mutate) {
  const record = pattern();
  mutate(record);
  return failure(patternRecords().map((item) => (item.kind === 'pattern' ? record : item)));
}

/** Owner names come from field ownership and are resolved through authoring metadata. */
function ownerOf(path) {
  return resolveAuthoringField('pattern', path).owner;
}

function assertIssue(error, { code, artifactId, path, message }) {
  assert.equal(error.code, code);
  const issue = error.issues.find((candidate) => (
    candidate.path === path && message.test(candidate.message)
  ));
  assert.ok(issue, `${path} ${message} in ${JSON.stringify(error.issues)}`);
  assert.equal(issue.artifactId, artifactId);
}

test('E-BL1-01: a valid pattern and its variant example validate and derive one example-of edge', () => {
  const graph = validateCatalogRecords(patternRecords());
  assert.deepEqual(
    relationEdges(graph.records).filter(({ type }) => type === 'example-of'),
    [{ type: 'example-of', source: variantId, target: patternId }],
  );
  const specified = validateCatalogRecords(
    patternRecords().map((item) => (item.kind === 'pattern' ? specifiedPattern() : item)),
  );
  assert.equal(specified.records.length, 5);
  // A component-bound example keeps its binding edge and needs no pattern.
  const bound = validateCatalogRecords([...patternRecords(), example()]);
  assert.deepEqual(
    relationEdges(bound.records).filter(({ source }) => source === example().id),
    [{ type: 'example-of', source: example().id, target: 'muxui:component:button#web.react' }],
  );
});

test('E-BL1-01 negative: the closed schema names the earliest owner for each record error', () => {
  const cases = [
    {
      label: 'unknown field',
      mutate: (record) => { record.layout = 'grid'; },
      path: '$/layout',
      message: /is an unknown field/u,
    },
    {
      label: 'category outside the enum',
      mutate: (record) => { record.category = 'dashboards'; },
      path: '$/category',
      message: /must be one of/u,
      owner: 'pattern-contract',
    },
    {
      label: 'authored group',
      mutate: (record) => { record.group = 'application'; },
      path: '$/group',
      message: /derived or proved and cannot be authored/u,
    },
    {
      label: 'authored patternRevision',
      mutate: (record) => { record.patternRevision = 'sha256:0'; },
      path: '$/patternRevision',
      message: /derived or proved and cannot be authored/u,
    },
    {
      label: 'lifecycle beyond experimental',
      mutate: (record) => { record.lifecycle = 'stable'; },
      path: '$/lifecycle',
      message: /must be one of experimental/u,
      owner: 'pattern-contract',
    },
    {
      label: 'no variants',
      mutate: (record) => { record.variants = []; },
      path: '$/variants',
      message: /at least 1 items/u,
      owner: 'pattern-contract',
    },
    {
      label: 'duplicate variant in one pattern',
      mutate: (record) => { record.variants.push({ example: variantId }); },
      path: '$/variants/1/example',
      message: /listed more than once/u,
      owner: 'pattern-contract',
    },
    {
      label: 'unsupported platform',
      mutate: (record) => { record.platforms = ['web.html']; },
      path: '$/platforms/0',
      message: /must be one of web\.react/u,
      owner: 'pattern-contract',
    },
    {
      label: 'duplicate participant role',
      mutate: (record) => { record.participants[1].role = 'list'; },
      path: '$/participants/1/role',
      message: /declared more than once/u,
      owner: 'pattern-contract',
    },
    {
      label: 'relation to an undeclared role',
      mutate: (record) => { record.relations = [{ type: 'contains', source: 'list', target: 'footer' }]; },
      path: '$/relations/0/target',
      message: /not a declared participant role/u,
      owner: 'pattern-contract',
    },
    {
      label: 'invariant on an undeclared role',
      mutate: (record) => { record.invariants = [{ role: 'footer', rule: 'at-most-one' }]; },
      path: '$/invariants/0/role',
      message: /not a declared participant role/u,
      owner: 'pattern-contract',
    },
    {
      label: 'enum default outside its values',
      mutate: (record) => {
        record.parameters = { density: { type: 'enum', values: ['a', 'b'], default: 'c' } };
      },
      path: '$/parameters/density/default',
      message: /one of the declared values/u,
      owner: 'pattern-contract',
    },
  ];
  for (const { label, mutate, path, message, owner } of cases) {
    const error = patternFailure(mutate);
    assertIssue(error, { code: 'MUXUI_SCHEMA_INVALID', artifactId: patternId, path, message });
    // Fields declared by the schema resolve through authoring metadata. An
    // unknown or reserved field has no property, so it takes the error path;
    // owner resolution for reserved fields arrives with authoring support.
    if (['unknown field', 'authored group', 'authored patternRevision'].includes(label)) {
      assert.throws(() => ownerOf(path), SchemaValidationError, label);
    } else {
      assert.equal(ownerOf(path), owner, label);
    }
  }
});

test('E-BL1-01 negative: the artifact graph names the pattern field that owns each error', () => {
  const graphCases = [
    {
      label: 'unknown participant',
      records: () => patternRecords().filter(({ id }) => id !== 'muxui:component:grid-list'),
      artifactId: patternId,
      path: '$/participants/0/component',
      message: /muxui:component:grid-list does not exist/u,
    },
    {
      label: 'participant without a web.react binding',
      records: () => {
        const noReact = gridList();
        delete noReact.bindings['web.react'];
        return patternRecords().map((item) => (item.id === noReact.id ? noReact : item));
      },
      artifactId: patternId,
      path: '$/participants/0/component',
      message: /no implemented web\.react binding/u,
    },
    {
      label: 'participant with an unsupported web.react binding',
      records: () => {
        const unsupported = gridList();
        unsupported.bindings['web.react'] = {
          schemaVersion: '2.0.0',
          strategy: 'unsupported',
          reason: 'Not implemented for React.',
          platformSafety: webPlatformSafety('web.react'),
        };
        return patternRecords().map((item) => (item.id === unsupported.id ? unsupported : item));
      },
      artifactId: patternId,
      path: '$/participants/0/component',
      message: /no implemented web\.react binding/u,
    },
    {
      label: 'missing variant example',
      records: () => patternRecords().filter(({ id }) => id !== variantId),
      artifactId: patternId,
      path: '$/variants/0/example',
      message: /muxui:example:poster-grid-css does not exist/u,
    },
    {
      label: 'variant listed by a second pattern',
      records: () => [
        ...patternRecords(),
        { ...pattern(), id: 'muxui:pattern:poster-wall', name: 'Poster wall' },
      ],
      artifactId: 'muxui:pattern:poster-wall',
      path: '$/variants/0/example',
      message: /already a variant of muxui:pattern:poster-grid/u,
    },
    {
      label: 'component binding plus variant listing',
      records: () => patternRecords().map((item) => (
        item.id === variantId ? { ...example(), id: variantId } : item
      )),
      artifactId: patternId,
      path: '$/variants/0/example',
      message: /has two owners/u,
    },
    {
      label: 'orphan example',
      records: () => [...patternRecords(), variantExample('poster-grid-orphan')],
      artifactId: 'muxui:example:poster-grid-orphan',
      path: '$/binding',
      message: /has no owner: bind it to a component or list it in one pattern's variants/u,
    },
  ];
  for (const { label, records, artifactId, path, message } of graphCases) {
    const error = failure(records());
    assertIssue(error, { code: 'MUXUI_RELATION_INVALID', artifactId, path, message });
    if (artifactId.startsWith('muxui:pattern:')) {
      assert.equal(ownerOf(path), 'pattern-contract', label);
    }
  }
});

test('E-BL1-01: example-of rows exclude each other and name their owners', () => {
  const rows = validateRelationRegistry().relations.filter(({ type }) => type === 'example-of');
  assert.deepEqual(
    rows.map(({ target, owner, minimum, maximum, exclusiveWith }) => (
      { target, owner, minimum, maximum, exclusiveWith }
    )),
    [
      { target: 'binding', owner: 'binding-example-relation', minimum: 0, maximum: 1, exclusiveWith: ['pattern'] },
      { target: 'pattern', owner: 'pattern.variants', minimum: 0, maximum: 1, exclusiveWith: ['binding'] },
    ],
  );
  // `minimum: 0` must not read as "orphans allowed": each row says who enforces exactly one owner.
  for (const { description } of rows) {
    assert.match(description, /not an orphan allowance/u);
    assert.match(description, /validateCatalogRecords/u);
  }
});

test('E-BL1-01: the category-group map owns the derived group for every category', () => {
  const categories = loadJsonDocument('pattern.schema.json').properties.category.enum;
  const grouped = Object.values(PATTERN_CATEGORY_GROUPS).flat();
  assert.deepEqual([...grouped].sort(), [...categories].sort());
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual(Object.keys(PATTERN_CATEGORY_GROUPS), ['application', 'marketing']);
  assert.equal(patternGroup('collections'), 'application');
  assert.equal(patternGroup('logo-cloud'), 'marketing');
  for (const category of categories) {
    validateFamily('pattern', { ...pattern(), category });
    assert.ok(patternGroup(category), category);
  }
});

test('E-BL1-01: patternRevision follows normative fields and variant bytes, not editorial fields', () => {
  const input = (record = pattern(), source = variantSource, examples = [variantExample()]) => ({
    pattern: record,
    examples,
    exampleSources: Object.fromEntries(examples.map(({ id }) => [id, source])),
  });
  const baseline = patternRevision(input());
  const editorial = {
    ...pattern(),
    name: 'Poster wall',
    summary: 'Another summary.',
    keywords: ['posters'],
    category: 'features',
    workflowValue: 'Different value.',
  };
  assert.equal(patternRevision(input(editorial)), baseline);
  assert.notEqual(contentRevision('pattern', editorial), contentRevision('pattern', pattern()));

  const normative = [
    (record) => { record.participants[0].requirement = 'optional'; },
    (record) => { record.accessibility = ['Announce selection changes.']; },
    (record) => { record.unsupported = []; },
    (record) => { record.intent.useWhen = ['Browsing posters']; },
    (record) => { record.relations = [{ type: 'contains', source: 'list', target: 'action' }]; },
    (record) => { record.invariants = [{ role: 'list', rule: 'exactly-one' }]; },
    (record) => { record.parameters = { selectable: { type: 'boolean', default: false } }; },
  ];
  for (const mutate of normative) {
    const record = pattern();
    mutate(record);
    assert.notEqual(patternRevision(input(record)), baseline);
  }
  // An absent optional field and an empty one are the same pattern.
  const emptied = { ...pattern(), relations: [], invariants: [], parameters: {} };
  assert.equal(patternRevision(input(emptied)), baseline);
  assert.notEqual(patternRevision(input(pattern(), `${variantSource}// edited\n`)), baseline);
  const renamedVariant = { ...variantExample(), summary: 'Edited variant summary.' };
  assert.notEqual(patternRevision(input(pattern(), variantSource, [renamedVariant])), baseline);

  const second = variantExample('poster-grid-virtualized');
  const forward = { ...pattern(), variants: [{ example: variantId }, { example: second.id }] };
  const reversed = { ...pattern(), variants: [{ example: second.id }, { example: variantId }] };
  const examples = [variantExample(), second];
  assert.notEqual(
    patternRevision(input(forward, variantSource, examples)),
    patternRevision(input(reversed, variantSource, examples)),
  );
  assert.throws(
    () => patternRevision(input(pattern(), variantSource, [])),
    /MUXUI_RELATION_INVALID: missing variant example/u,
  );
});
