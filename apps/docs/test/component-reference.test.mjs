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
const packageFacts = (runtimeSources = []) => ({
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

test('usage keeps every declared entry and sources add a runtime file only where one is declared', () => {
  const intent = { useWhen: ['Acting', 'Grouping'], avoidWhen: ['Navigation', 'For primary text'] };
  const plain = componentReference({ artifact: record({ intent }), examples, packageFacts: packageFacts() });
  assert.deepEqual(plain.usage, intent);
  assert.deepEqual(plain.sources.map(({ label }) => label), ['Component record', 'Examples', 'Package imports']);
  const supplemental = componentReference({ artifact: record(), examples, packageFacts: packageFacts([['card', 'packages/react/src/supplemental/index.mjs']]) });
  assert.deepEqual(supplemental.sources.find(({ label }) => label === 'Runtime')?.paths, ['packages/react/src/supplemental/index.mjs']);
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

test('usage guides are related by the declared id', () => {
  assert.equal(usageGuideId('muxui:component:icon-button'), 'muxui:guide:icon-button-usage');
});

test('package facts verify the descriptor, supplemental mapping and stylesheet against the manifest', () => {
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
    const supplemental = { schema: 'muxui-react-r1-6-supplemental-components-v2', components: [{ slug: 'markdown', runtimeSource: 'packages/react/src/markdown/index.mjs' }] };
    const files = (overrides = {}) => {
      write('packages/react/package.json', overrides.manifest ?? manifest);
      write('packages/react/generated/descriptor.json', overrides.descriptor ?? descriptor);
      write('catalog/react-r1-6/supplemental-components.json', overrides.supplemental ?? supplemental);
    };
    files();
    const facts = readReactPackageFacts(root);
    assert.deepEqual(facts.bindings.get('muxui:component:markdown#web.react'), { export: 'Markdown', specifier: '@muxui/react/markdown' });
    assert.equal(facts.runtimeSources.get('markdown'), 'packages/react/src/markdown/index.mjs');
    files({ manifest: { ...manifest, exports: { '.': {}, './styles.css': {} } } });
    assert.throws(() => readReactPackageFacts(root), /imports from \.\/markdown, which packages\/react\/package\.json does not export/u);
    files({ manifest: { ...manifest, exports: { '.': {}, './markdown': {} } } });
    assert.throws(() => readReactPackageFacts(root), /does not export \.\/styles\.css/u);
    files({ supplemental: { ...supplemental, schema: 'older' } });
    assert.throws(() => readReactPackageFacts(root), /is not muxui-react-r1-6-supplemental-components-v2/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
