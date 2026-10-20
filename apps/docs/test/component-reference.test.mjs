import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { accessibilityGuideId, accessibilityGuideSections, componentReference, readReactPackageFacts, usageGuideId } from '../../component-reference.mjs';

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
    const contract = { schema: 'muxui-react-r1-6-contract-v1', components: [{ slug: 'markdown', source: 'packages/react/src/markdown/index.mjs' }] };
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
    assert.equal(facts.runtimeSources.get('markdown'), 'packages/react/src/markdown/index.mjs');
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

test('the accessibility sections are cut from the guide by heading and nothing else is added', () => {
  const guide = [
    '# Accessibility', '', 'Intro.', '', '## Support status', '', 'Experimental.', 'No claim.', '',
    '## Names', '', 'A name.', '', '## Verification', '', 'Test it.', '```md', '## Support status', '```', '',
  ].join('\n');
  assert.deepEqual(accessibilityGuideSections(guide), [
    { heading: 'Support status', markdown: 'Experimental.\nNo claim.' },
    { heading: 'Verification', markdown: 'Test it.\n```md\n## Support status\n```' },
  ]);
  assert.throws(() => accessibilityGuideSections('## Verification\n\nTest it.'), /exactly one "Support status" section, found 0/u);
  assert.throws(() => accessibilityGuideSections('## Support status\n\nA.\n\n## Support status\n\nB.\n\n## Verification\n\nC.'), /exactly one "Support status" section, found 2/u);
  assert.throws(() => accessibilityGuideSections('## Support status\n\n## Verification\n\nC.'), /"Support status" section is empty/u);
});

test('the canonical accessibility guide supplies the sections both surfaces show', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const record = JSON.parse(readFileSync(resolve(root, 'catalog/guides/accessibility.json'), 'utf8'));
  assert.equal(record.id, accessibilityGuideId);
  const file = readFileSync(resolve(root, record.source), 'utf8');
  const sections = accessibilityGuideSections(file);
  assert.deepEqual(sections.map(({ heading }) => heading), ['Support status', 'Verification']);
  // Each section is a verbatim part of the guide file that Starlight renders whole, so neither surface can word it differently.
  for (const { markdown } of sections) assert.ok(file.includes(markdown));
  // The projection keeps the guide's own non-claim and the consumer's testing duty.
  assert.match(sections[0].markdown, /makes no assistive-technology\s+support claim/u);
  assert.match(sections[1].markdown, /Test the interaction with keyboard navigation and a screen reader in the\s+consumer application/u);
});
