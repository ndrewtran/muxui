import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'parse5';
import { expectedEventGroups, renderedEventGroups } from '../scripts/event-groups.mjs';
import { attributeValue, elements } from '../scripts/html-tree.mjs';
import { INVENTORY_SCHEMA, REFERENCE_SCHEMA } from '../../../packages/react/reference-reader/model.mjs';
import { componentDeclarations, componentReference, readDeclarationReference, readReactPackageFacts, usageGuideId } from '../../component-reference.mjs';

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
const repositoryRoot = resolve(import.meta.dirname, '../../..');

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

test('the docs checker holds each part\'s event group to its owner heading, its event list and the anatomy order', () => {
  const partApis = [['section', { member: 'Section', events: [] }], ['item', { member: 'Item', events: ['pick'] }], ['row', { member: 'Row', events: ['drop'] }]];
  const group = (owner, part, events) => `<h3><code>${owner}</code></h3><p data-fact="binding.api.partApis.${part}.events">${events.map((event) => `<code class="inline-code">${event}</code>`).join('')}</p>`;
  const rendered = (...groups) => renderedEventGroups(elements(parse(`<html><body><section id="events"><h2>Events</h2><p data-fact="binding.api.events"><code class="inline-code">select</code></p>${groups.join('')}</section></body></html>`))
    .find((node) => attributeValue(node, 'id') === 'events'));
  const expected = expectedEventGroups('ListBox', partApis);
  assert.deepEqual(expected, ['ListBox.Item', 'binding.api.partApis.item.events', 'ListBox.Row', 'binding.api.partApis.row.events'], 'a part with no events has no group');
  assert.deepEqual(rendered(group('ListBox.Item', 'item', ['pick']), group('ListBox.Row', 'row', ['drop'])), expected);
  // Each of these is a docs page the checker must refuse.
  const refused = {
    'a renamed owner heading': rendered(group('ListBox.Wrong', 'item', ['pick']), group('ListBox.Row', 'row', ['drop'])),
    'a missing owner heading': rendered('<p data-fact="binding.api.partApis.item.events"><code class="inline-code">pick</code></p>', group('ListBox.Row', 'row', ['drop'])),
    'a missing event list': rendered('<h3><code>ListBox.Item</code></h3>', group('ListBox.Row', 'row', ['drop'])),
    'a missing part group': rendered(group('ListBox.Item', 'item', ['pick'])),
    'groups out of anatomy order': rendered(group('ListBox.Row', 'row', ['drop']), group('ListBox.Item', 'item', ['pick'])),
    'a heading over another part\'s list': rendered(group('ListBox.Item', 'row', ['drop']), group('ListBox.Row', 'item', ['pick'])),
    'a group for a part with no events': rendered(group('ListBox.Section', 'section', []), group('ListBox.Item', 'item', ['pick']), group('ListBox.Row', 'row', ['drop'])),
    'an extra heading': rendered(group('ListBox.Item', 'item', ['pick']), '<h3><code>ListBox.Extra</code></h3>', group('ListBox.Row', 'row', ['drop'])),
  };
  for (const [label, groups] of Object.entries(refused)) assert.notDeepEqual(groups, expected, label);
  // With no part events there are no groups, and a stray heading is refused.
  assert.deepEqual(expectedEventGroups('ListBox', [['section', { member: 'Section', events: [] }]]), []);
  assert.deepEqual(rendered(), []);
  assert.notDeepEqual(rendered('<h3><code>ListBox.Item</code></h3>'), []);
});

// ---- the declaration reference ---------------------------------------------------------------------
// Decision 0031 typed rendering reads the types of a component from the declarations the package ships, through
// the committed reference. This module exposes that data; nothing renders it yet, so a reader of the shared
// reference that does not ask for it sees what it saw before.

const ids = (node, found = new Set()) => {
  if (Array.isArray(node)) node.forEach((item) => ids(item, found));
  else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'refs') value.forEach((id) => found.add(id));
      else ids(value, found);
    }
  }
  return found;
};
const declared = (artifactId) => componentDeclarations({
  artifact: { id: artifactId },
  packageFacts: readReactPackageFacts(repositoryRoot),
  declarations: readDeclarationReference(repositoryRoot),
});
const partOf = (declarations, member = null) => declarations.export.parts.find((part) => part.member === member);
const memberOf = (part, name) => part.members.find((candidate) => candidate.name === name);

test('the declaration reference loads as the schemas the reader writes, and each renderer binding finds its component in it', () => {
  assert.equal(INVENTORY_SCHEMA, 'muxui-declaration-inventory-v1');
  assert.equal(REFERENCE_SCHEMA, 'muxui-declaration-reference-v1');
  const declarations = readDeclarationReference(repositoryRoot);
  const facts = readReactPackageFacts(repositoryRoot);
  assert.deepEqual([...declarations.files.keys()].sort(), Object.keys(declarations.inventory.owners).sort());
  assert.ok(facts.bindings.size >= 84);
  for (const ref of facts.bindings.keys()) {
    const found = componentDeclarations({ artifact: { id: ref.slice(0, ref.indexOf('#')) }, packageFacts: facts, declarations });
    assert.ok(found.export.parts.length > 0, `${ref} has parts`);
    assert.equal(found.source, `packages/react/reference/${found.owner}.json`);
    // A reader never has to look a type up elsewhere: every Mux UI type the export names is printed with it.
    const known = new Set(found.types.map(({ id }) => id));
    for (const id of ids(found.export)) assert.ok(known.has(id), `${ref} names ${id}, which its types do not print`);
  }
});

test('a component\'s share keeps "not declared" apart from a declared never, and leaves absent comments absent', () => {
  // Virtualizer: the stack requires an accessible name and declares no aria-labelledby; the grid declares both as never.
  const [stack, grid] = partOf(declared('muxui:component:virtualizer')).alternatives;
  assert.deepEqual(stack.members.find(({ name }) => name === 'aria-label'), { name: 'aria-label', type: 'string' }, 'required, and no comment to show');
  assert.equal(stack.members.some(({ name }) => name === 'aria-labelledby'), false, 'not declared');
  assert.deepEqual(grid.members.filter(({ name }) => name.startsWith('aria-')).map(({ name, optional, never }) => [name, optional, never]), [['aria-label', true, true], ['aria-labelledby', true, true]]);
  assert.deepEqual([stack.ref, grid.ref], [{ type: 'HTMLDivElement' }, { never: true }]);
  // The declarations have no comment for these members, so the data has none, and nothing stands in.
  const dialog = partOf(declared('muxui:component:dialog'));
  assert.equal('doc' in memberOf(dialog, 'aria-describedby'), false);
  assert.equal(dialog.alternatives.length, 3);
  const iconButton = partOf(declared('muxui:component:icon-button'));
  for (const name of ['children', 'style']) assert.equal('doc' in memberOf(iconButton, name), false, `IconButton ${name}`);
  const switchField = declared('muxui:component:switch-field').export.parts;
  assert.ok(switchField.every((part) => part.members.every((member) => !('doc' in member))));
  assert.deepEqual(Object.fromEntries(switchField.map(({ member, ref }) => [member, ref.type])), { Root: 'HTMLDivElement', Button: 'HTMLLabelElement', Thumb: 'HTMLSpanElement', Description: 'HTMLElement', Error: 'HTMLElement' });
  // A generic part names its binder and the host element its ref follows.
  const text = partOf(declared('muxui:component:text'));
  assert.deepEqual([text.typeParameters[0].name, text.typeParameters[0].default, text.ref.type], ['T', "'span'", 'HTMLElementTagNameMap[T]']);
});

test('the shared reference carries the declarations only when asked, and nothing else changes', () => {
  const plain = componentReference({ artifact: record(), examples, packageFacts: packageFacts() });
  assert.equal('declarations' in plain, false);
  const declarations = readDeclarationReference(repositoryRoot);
  const merged = componentReference({ artifact: record(), examples, packageFacts: packageFacts(), declarations });
  assert.deepEqual(Object.keys(merged), [...Object.keys(plain).slice(0, -1), 'declarations', 'sources'], 'one field, before the sources');
  const { declarations: added, ...rest } = merged;
  assert.deepEqual(rest, plain);
  assert.equal(added.export.name, 'Card');
  assert.deepEqual(JSON.parse(JSON.stringify(added)), added, 'plain JSON, so Storybook can embed it as it embeds the rest');
});

test('the declaration reference is refused when it is not what the inventory promises', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'muxui-declaration-reference-'));
  try {
    const write = (path, value) => {
      mkdirSync(dirname(resolve(root, path)), { recursive: true });
      writeFileSync(resolve(root, path), JSON.stringify(value));
    };
    const inventory = { schema: INVENTORY_SCHEMA, package: '@muxui/react', entries: [{ key: '.', exports: [{ name: 'Card', kind: 'value', owner: 'card', module: 'card' }] }], owners: { card: 'card.json' } };
    const file = { schema: REFERENCE_SCHEMA, owner: 'card', sources: {}, exports: [], types: [] };
    const write2 = (overrides = {}) => {
      write('packages/react/reference/inventory.json', overrides.inventory ?? inventory);
      write('packages/react/reference/card.json', overrides.file ?? file);
    };
    write2();
    const declarations = readDeclarationReference(root);
    assert.throws(() => componentDeclarations({ artifact: { id: 'muxui:component:card' }, packageFacts: packageFacts(), declarations }), /does not hold Card from \. as a component/u);
    assert.throws(() => componentDeclarations({ artifact: { id: 'muxui:component:absent' }, packageFacts: packageFacts(), declarations }), /renderer descriptor has no export for muxui:component:absent#web\.react/u);
    const markdown = { ...packageFacts(), bindings: new Map([['muxui:component:markdown#web.react', { export: 'Markdown', specifier: '@muxui/react/markdown' }]]) };
    assert.throws(() => componentDeclarations({ artifact: { id: 'muxui:component:markdown' }, packageFacts: markdown, declarations }), /no export Markdown from \.\/markdown/u);
    write2({ inventory: { ...inventory, schema: 'older' } });
    assert.throws(() => readDeclarationReference(root), /inventory\.json is not muxui-declaration-inventory-v1/u);
    write2({ file: { ...file, schema: 'older' } });
    assert.throws(() => readDeclarationReference(root), /card\.json is not muxui-declaration-reference-v1/u);
    write2({ file: { ...file, owner: 'sidebar' } });
    assert.throws(() => readDeclarationReference(root), /card\.json is for sidebar, not card/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
