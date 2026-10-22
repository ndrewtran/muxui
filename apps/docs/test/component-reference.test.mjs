import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { componentReference, readReactPackageFacts, usageGuideId } from '../../component-reference.mjs';

const requirement = (token, extra = {}) => ({ token, requirement: 'required', ...extra });
const record = ({ requirements = [requirement('component.card.background')], obligations = ['Expose state'], binding = obligations, intent } = {}) => ({
  id: 'muxui:component:card',
  source: { record: 'catalog/components/card/artifact.json' },
  intent,
  anatomy: ['root'],
  states: ['idle'],
  accessibility: { nameRequired: false, obligations },
  bindings: {
    'web.react': {
      api: { events: ['activate'] },
      behavior: ['Activation requests one action'],
      accessibility: binding,
      tokenRecipe: { source: 'muxui:token:default-theme', requirements },
    },
  },
});
const packageFacts = (runtimeSources = [['card', 'packages/react/src/components.mjs']]) => ({
  packageName: '@muxui/react',
  manifestPath: 'packages/react/package.json',
  stylesheet: '@muxui/react/styles.css',
  bindings: new Map([['muxui:component:card#web.react', { export: 'Card', specifier: '@muxui/react' }]]),
  runtimeSources: new Map(runtimeSources),
});
const examples = [{ source: { content: 'catalog/components/card/examples/react/basic.tsx' } }];

test('imports name the descriptor export, its module specifier and the package stylesheet', () => {
  const { imports } = componentReference({ artifact: record(), examples, packageFacts: packageFacts() });
  assert.equal(imports.code, "import '@muxui/react/styles.css';\nimport { Card } from '@muxui/react';\n");
  assert.throws(
    () => componentReference({ artifact: { ...record(), id: 'muxui:component:absent' }, examples, packageFacts: packageFacts() }),
    /no export for muxui:component:absent#web.react/u,
  );
});

test('usage keeps every declared entry and sources always name the runtime file', () => {
  const intent = { useWhen: ['Acting', 'Grouping'], avoidWhen: ['Navigation', 'For primary text'] };
  const reference = componentReference({ artifact: record({ intent }), examples, packageFacts: packageFacts() });
  assert.deepEqual(reference.usage, intent);
  assert.deepEqual(reference.sources, [
    { label: 'Component record', paths: ['catalog/components/card/artifact.json'] },
    { label: 'Examples', paths: ['catalog/components/card/examples/react/basic.tsx'] },
    { label: 'Runtime', paths: ['packages/react/src/components.mjs'] },
    { label: 'Package imports', paths: ['packages/react/package.json'] },
  ]);
  assert.throws(() => componentReference({ artifact: record(), examples, packageFacts: packageFacts([]) }), /no runtime source for muxui:component:card/u);
});

test('the React binding accessibility list shows only when it differs from the component obligations', () => {
  const same = componentReference({ artifact: record({ obligations: ['A'], binding: ['A'] }), examples, packageFacts: packageFacts() });
  assert.deepEqual(same.accessibility.binding, []);
  const different = componentReference({ artifact: record({ obligations: ['A'], binding: ['B'] }), examples, packageFacts: packageFacts() });
  assert.deepEqual(different.accessibility.binding, ['B']);
});

test('token requirements group by their first two segments only when the recipe is long', () => {
  const short = [requirement('component.card.background'), requirement('semantic.control.size-md')];
  assert.deepEqual(componentReference({ artifact: record({ requirements: short }), examples, packageFacts: packageFacts() }).styling.tokenGroups, [{ tokens: short }]);
  const long = [
    ...Array.from({ length: 5 }, (_, index) => requirement(`component.card.part-${index}`)),
    requirement('semantic.focus.ring', { requirement: 'optional', profiles: ['web.react'] }),
    ...Array.from({ length: 3 }, (_, index) => requirement(`component.card.extra-${index}`)),
  ];
  const groups = componentReference({ artifact: record({ requirements: long }), examples, packageFacts: packageFacts() }).styling.tokenGroups;
  assert.deepEqual(groups.map(({ prefix, tokens }) => [prefix, tokens.length]), [['component.card', 8], ['semantic.focus', 1]]);
});

test('a compound lists each part that owns props under its owner, in anatomy order, and a single-part component lists none', () => {
  const block = (member, props, events = [], defaults = {}) => ({ member, props, events, defaults });
  const compound = (partApis) => {
    const artifact = record();
    artifact.anatomy = ['root', 'section', 'header', 'item'];
    // A compiled record keys its parts in any order; item comes before section here.
    artifact.bindings['web.react'].api = { events: ['activate'], partApis };
    return artifact;
  };
  const partApis = { item: block('Item', ['id', 'disabled'], ['pick'], { disabled: false }), section: block('Section', ['title']) };
  const { parts, events } = componentReference({ artifact: compound(partApis), examples, packageFacts: packageFacts() });
  assert.deepEqual(events, ['activate'], 'the root events stay the root\'s');
  assert.deepEqual(parts.map(({ part, owner, props, events: partEvents, defaults }) => [part, owner, props, partEvents, defaults]), [
    ['section', 'Card.Section', ['title'], [], {}],
    ['item', 'Card.Item', ['id', 'disabled'], ['pick'], { disabled: false }],
  ]);
  assert.deepEqual(componentReference({ artifact: record(), examples, packageFacts: packageFacts() }).parts, []);
  assert.deepEqual(componentReference({ artifact: compound(undefined), examples, packageFacts: packageFacts() }).parts, []);
  // The owner names the export the descriptor lists, so a renamed export renames every part.
  const renamed = { ...packageFacts(), bindings: new Map([['muxui:component:card#web.react', { export: 'Panel', specifier: '@muxui/react' }]]) };
  assert.deepEqual(componentReference({ artifact: compound(partApis), examples, packageFacts: renamed }).parts.map(({ owner }) => owner), ['Panel.Section', 'Panel.Item']);
});

test('usage guides are related by the declared id', () => {
  assert.equal(usageGuideId('muxui:component:icon-button'), 'muxui:guide:icon-button-usage');
});

test('package facts verify the descriptor, renderer contract and stylesheet against the manifest', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'muxui-component-reference-'));
  try {
    const write = (path, value) => {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      writeFileSync(resolve(root, path), JSON.stringify(value));
    };
    const manifest = { name: '@muxui/react', exports: { '.': {}, './markdown': {}, './styles.css': {} } };
    const descriptor = { package: '@muxui/react', bindings: [
      { binding: 'muxui:component:card#web.react', export: 'Card', module: '.' },
      { binding: 'muxui:component:markdown#web.react', export: 'Markdown', module: './markdown' },
    ] };
    const contract = { schema: 'muxui-react-r1-6-contract-v1', components: [{ slug: 'markdown', source: 'packages/react/src/markdown/index.ts' }] };
    const files = (overrides = {}) => {
      write('packages/react/package.json', overrides.manifest ?? manifest);
      write('packages/react/generated/descriptor.json', overrides.descriptor ?? descriptor);
      // The generated contract carries two marker comment lines ahead of its JSON.
      mkdirSync(resolve(root, 'packages/react/generated'), { recursive: true });
      writeFileSync(resolve(root, 'packages/react/generated/r1-6-contract.json'), `// @generated-from: x\n// @generated-content-sha256: y\n${JSON.stringify(overrides.contract ?? contract)}`);
    };
    files();
    const facts = readReactPackageFacts(root);
    assert.deepEqual(facts.bindings.get('muxui:component:markdown#web.react'), { export: 'Markdown', specifier: '@muxui/react/markdown' });
    assert.equal(facts.runtimeSources.get('markdown'), 'packages/react/src/markdown/index.ts');
    files({ manifest: { ...manifest, exports: { '.': {}, './styles.css': {} } } });
    assert.throws(() => readReactPackageFacts(root), /imports from \.\/markdown, which packages\/react\/package\.json does not export/u);
    files({ manifest: { ...manifest, exports: { '.': {}, './markdown': {} } } });
    assert.throws(() => readReactPackageFacts(root), /does not export \.\/styles\.css/u);
    files({ contract: { ...contract, schema: 'older' } });
    assert.throws(() => readReactPackageFacts(root), /is not muxui-react-r1-6-contract-v1/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
