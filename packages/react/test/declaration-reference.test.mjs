// The committed declaration reference, packages/react/reference/ (Decision 0031 typed rendering).
//
// It is a projection of the declarations the package ships, so these tests hold five promises:
//   1. It is fresh: it is exactly what the shipped declarations read to under TypeScript 7 and 6, and a change to a
//      declaration of any kind changes it and fails the drift check.
//   2. It is complete: every export-map entry is listed, every public export has exactly one owner and is in it.
//   3. It stays out of the package, and out of the README, whose rows list props only.
//   4. It agrees with the catalog's web.react API wherever both speak, and every difference is explained.
//   5. The compiler agrees with what it says: alternatives, optionality, `never` against not declared, literal
//      values, refs, native envelopes and generic arity, and a deliberately wrong model is caught.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { typescript7Host } from '../reference-reader/host-typescript7.mjs';
import { INVENTORY_SCHEMA, REFERENCE_SCHEMA, UNTYPED_ENTRIES } from '../reference-reader/model.mjs';
import { referenceOutputs, syncFiles } from '../reference-reader/sync.mjs';
import { DERIVED_API_COMPONENTS } from '../api-extraction/derived-apis.mjs';
import { consumerTsc, typeScript7Tsc } from './support/declaration-surface.mjs';
import { typescript6Host } from './support/reference-host-typescript6.mjs';
import { realInputs } from './support/reference-inputs.mjs';
import { crossCheckAuthored, crossCheckDerived, loadReference, referenceDirectory, repositoryRoot } from './support/reference-catalog.mjs';
import { WITNESSES, buildProbe, runProbe } from './support/reference-probes.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const { declarations, manifest, families } = realInputs();
const { inventory, files } = loadReference();
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const clone = (map) => new Map([...map].map(([name, file]) => [name, structuredClone(file)]));

const committed = () => new Map(readdirSync(referenceDirectory).sort().map((name) => [name, readFileSync(join(referenceDirectory, name), 'utf8')]));
const read = (changed = declarations, host = typescript7Host) => referenceOutputs({ outputs: new Map(Object.entries(changed)), manifest, families, host });

// ---- 1. fresh -------------------------------------------------------------------------------------

test('the committed reference is what the shipped declarations read to, under TypeScript 7 and under TypeScript 6', () => {
  const expected = committed();
  for (const host of [typescript7Host, typescript6Host]) {
    const fresh = read(declarations, host);
    assert.deepEqual([...fresh.keys()].sort(), [...expected.keys()].sort(), `${host.name}: the output set`);
    for (const [name, text] of fresh) assert.equal(text, expected.get(name), `${host.name}: ${name}`);
  }
});

const replaced = (file, from, to) => (all) => {
  assert.ok(all[file].includes(from), `${file} no longer contains the text this change edits: ${from}`);
  return { ...all, [file]: all[file].replace(from, to) };
};

// One change of each kind to a shipped declaration. Each must change the model, in the owner's file, and fail the check.
const CHANGES = [
  ['a member becomes required', replaced('button.d.ts', 'variant?: ButtonVariant;', 'variant: ButtonVariant;'), 'button.json'],
  ['a literal value is removed', replaced('button.d.ts', " | 'inverse'", ''), 'button.json'],
  ['a member type changes', replaced('virtualizer.d.ts', 'height?: number;', 'height?: string;'), 'virtualizer.json'],
  ['a ref type changes', replaced('virtualizer.d.ts', '(VirtualizerStackProps & RefAttributes<HTMLDivElement>)', '(VirtualizerStackProps & RefAttributes<HTMLElement>)'), 'virtualizer.json'],
  ['a comment changes', replaced('resizable.d.ts', 'How many percent an arrow key moves a handle.', 'How many percent an arrow key moves a panel.'), 'resizable.json'],
  ['an alternative is removed', (all) => ({ ...all, 'code-block.d.ts': all['code-block.d.ts'].replace(/ \| \{\n {4}mode: 'diff';[^}]*\}/u, '') }), 'code-block.json'],
];

for (const [kind, change, owner] of CHANGES) {
  test(`freshness: ${kind}, and the model and the drift check both see it`, async () => {
    const mutated = change(declarations);
    assert.notDeepEqual(mutated, declarations, 'the change edits a declaration');
    const expected = read(mutated);
    const before = committed();
    const changed = [...expected.keys()].filter((name) => expected.get(name) !== before.get(name));
    assert.ok(changed.includes(owner), `${owner} changes; changed: ${changed.join(', ')}`);
    await assert.rejects(syncFiles({ directory: referenceDirectory, expected, checking: true }), /^Error: MUXUI_REACT_GENERATED_DRIFT: reference\/[\w-]+\.json$/u);
  });
}

for (const [kind, code, change] of [
  ['an export no owner claims', 'OWNERSHIP', (all) => ({ ...all, 'index.d.ts': `${all['index.d.ts']}export declare const Unowned: number;\n` })],
  ['a declaration that does not compile', 'DIAGNOSTICS', (all) => ({ ...all, 'index.d.ts': `${all['index.d.ts']}export declare const Broken: Missing;\n` })],
]) {
  test(`freshness: ${kind} stops generation by name instead of producing a model`, () => {
    assert.throws(() => read(change(declarations)), new RegExp(`MUXUI_REACT_REFERENCE_${code}`, 'u'));
  });
}

test('the drift check names an edited, a missing and an unexpected file, and the write pass repairs all three', async () => {
  const expected = committed();
  const directory = mkdtempSync(join(tmpdir(), 'muxui-reference-drift-'));
  try {
    cpSync(referenceDirectory, directory, { recursive: true });
    await syncFiles({ directory, expected, checking: true });
    writeFileSync(join(directory, 'button.json'), `${expected.get('button.json')} `);
    await assert.rejects(syncFiles({ directory, expected, checking: true }), /MUXUI_REACT_GENERATED_DRIFT: reference\/button\.json$/u);
    unlinkSync(join(directory, 'button.json'));
    await assert.rejects(syncFiles({ directory, expected, checking: true }), /MUXUI_REACT_GENERATED_DRIFT: reference\/button\.json$/u);
    writeFileSync(join(directory, 'button.json'), expected.get('button.json'));
    writeFileSync(join(directory, 'stale.json'), '{}\n');
    await assert.rejects(syncFiles({ directory, expected, checking: true }), /MUXUI_REACT_GENERATED_DRIFT: reference\/stale\.json is not a declaration reference output$/u);
    writeFileSync(join(directory, 'inventory.json'), '{}\n');
    await syncFiles({ directory, expected, checking: false });
    await syncFiles({ directory, expected, checking: true });
    assert.deepEqual(readdirSync(directory).sort(), [...expected.keys()].sort());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---- 2. complete ----------------------------------------------------------------------------------

test('the inventory lists every export-map entry in order, and classifies each untyped one with its reason', () => {
  assert.equal(inventory.schema, INVENTORY_SCHEMA);
  assert.deepEqual(inventory.entries.map(({ key }) => key), Object.keys(manifest.exports));
  const untyped = inventory.entries.filter(({ untyped: flag }) => flag);
  assert.deepEqual(Object.fromEntries(untyped.map(({ key, reason }) => [key, reason])), UNTYPED_ENTRIES);
  for (const entry of inventory.entries) {
    assert.equal(entry.untyped === true, typeof manifest.exports[entry.key].types !== 'string', `${entry.key} is untyped exactly when the manifest names no declarations`);
  }
});

test('the inventory holds the same exports as the public-surface check, by name and kind, on every typed entry', () => {
  const surface = readJson(join(packageRoot, 'test/fixtures/public-surface-inventory.json'));
  let total = 0;
  for (const entry of inventory.entries.filter(({ untyped }) => !untyped)) {
    const expected = { types: new Set(), values: new Set() };
    for (const record of [surface.baseline[entry.key], surface.added[entry.key]]) {
      record?.types.forEach((name) => expected.types.add(name));
      record?.values.forEach((name) => expected.values.add(name));
    }
    const types = new Set(entry.exports.filter(({ kind }) => kind.includes('type')).map(({ name }) => name));
    const values = new Set(entry.exports.filter(({ kind }) => kind.includes('value')).map(({ name }) => name));
    assert.deepEqual([...types].sort(), [...expected.types].sort(), `${entry.key} types`);
    assert.deepEqual([...values].sort(), [...expected.values].sort(), `${entry.key} values`);
    total += types.size + values.size;
  }
  assert.ok(total >= 427, `the inventory covers ${total} subjects`);
});

test('every public export has one owner whose file holds it, and every file says whose it is and where it was generated from', () => {
  for (const [name, file] of files) {
    assert.equal(file.schema, REFERENCE_SCHEMA, name);
    assert.equal(`${file.owner}.json`, name, name);
    assert.equal(inventory.owners[file.owner], name, `${name} is listed in the inventory`);
    for (const [module, source] of Object.entries(file.sources)) {
      assert.ok(statSync(join(repositoryRoot, source)).isFile(), `${name}: ${module} was generated from ${source}, which exists`);
    }
  }
  assert.deepEqual(Object.values(inventory.owners).sort(), [...files.keys()].sort(), 'no owner file is unlisted');
  let held = 0;
  for (const entry of inventory.entries.filter(({ untyped }) => !untyped)) {
    for (const item of entry.exports) {
      const file = files.get(`${item.owner}.json`);
      assert.ok(file, `${entry.key} ${item.name}: owner ${item.owner} has a file`);
      if (item.kind.includes('value')) {
        const matches = file.exports.filter(({ name, entry: key }) => name === item.name && key === entry.key);
        assert.equal(matches.length, 1, `${entry.key} ${item.name} is a value held once by ${item.owner}`);
      }
      if (item.kind.includes('type')) {
        const matches = file.types.filter((type) => type.public?.some(({ entry: key, name }) => key === entry.key && name === item.name));
        assert.equal(matches.length, 1, `${entry.key} ${item.name} is a type held once by ${item.owner}`);
      }
      held += 1;
    }
  }
  assert.ok(held > 0);
  // Nothing is held that the inventory does not list.
  for (const file of files.values()) {
    for (const item of file.exports) {
      assert.ok(inventory.entries.find(({ key }) => key === item.entry)?.exports.some(({ name, owner }) => name === item.name && owner === file.owner), `${file.owner} holds ${item.entry} ${item.name}, which the inventory does not give it`);
    }
  }
});

test('each family file holds its own family and the shared files hold what no family owns', () => {
  const slugs = new Set(families.map(({ slug }) => slug));
  const extra = [...files.keys()].map((name) => name.replace(/\.json$/u, '')).filter((owner) => !slugs.has(owner));
  assert.deepEqual(extra.sort(), ['package-level', 'shared']);
  for (const family of families) {
    const file = files.get(`${family.slug}.json`);
    assert.ok(file?.exports.some(({ name }) => name === family.exportName), `${family.slug} holds ${family.exportName}`);
  }
});

// ---- 3. outside the package and the README --------------------------------------------------------

test('reference/ is not in the package: not in files, not behind an export, and not in what npm would pack', () => {
  assert.ok(!manifest.files.some((entry) => /^\.?\/?reference/u.test(entry)), 'files');
  assert.ok(!JSON.stringify(manifest.exports).includes('reference'), 'exports');
  const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: packageRoot, encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const paths = JSON.parse(packed.stdout)[0].files.map(({ path }) => path);
  assert.ok(paths.length > 100 && paths.includes('package.json'), 'the pack lists the package');
  assert.deepEqual(paths.filter((path) => path.startsWith('reference')), []);
  assert.deepEqual(paths.filter((path) => !/^(?:generated|assets|licenses)\/|^(?:README\.md|LICENSE|NOTICE|package\.json)$/u.test(path)), [], 'only the files the manifest lists');
});

test('the README rows list props only: names, never types, alternatives, refs or native envelopes', () => {
  const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8');
  const rows = readme.split('\n').filter((line) => /^\| [A-Z]\w* \| experimental \| /u.test(line));
  assert.equal(rows.length, readdirSync(join(repositoryRoot, 'catalog/components')).length, 'one row per catalog component');
  const name = '[A-Za-z][\\w-]*';
  const list = `${name}(?:, ${name})*`;
  const cell = new RegExp(`^(?:${list}|none)(?:; ${name}: ${list})*$`, 'u');
  for (const row of rows) {
    const columns = row.split(/(?<!\\)\|/u).slice(1, -1).map((text) => text.trim());
    assert.equal(columns.length, 5, row);
    assert.match(columns[4], cell, `${columns[0]}'s props cell`);
  }
});

// ---- 4. the catalog -------------------------------------------------------------------------------

const labelOnly = ['autocomplete', 'calendar', 'checkbox-group', 'color-area', 'color-field', 'color-slider', 'combo-box', 'date-field', 'date-picker', 'date-range-picker', 'number-field', 'radio-group', 'range-calendar', 'search-field', 'select', 'slider', 'switch', 'tag-group', 'text-field', 'time-field', 'token-field'];

// Every difference between the catalog's derived web.react API and the declarations that remains after the
// comparison, by class. Each class is verified where the difference is found (reference-catalog.mjs), so a
// difference that stops being true, or a new one, fails here.
const EXPLAINED_DIFFERENCES = [
  // The arm of a props type re-declares the member without its comment (Omit drops it), so the comment the
  // catalog carries is the one on the same-named member of the family's OwnProps type, which the model keeps.
  ...[...labelOnly.map((slug) => `${slug}.label`), 'resizable.sizes', 'resizable.defaultSizes', 'dialog.title', 'code-block.mode', 'code-block.source', 'code-block.before', 'code-block.after', 'virtualizer.layout', 'virtualizer.children', 'select.description']
    .map((key) => `own-props-comment ${key}`),
  // Select's arms re-declare errorMessage with a comment of their own, so the declaration and the catalog say different things.
  'arm-comment select.errorMessage',
  // The catalog spells the lib type without its namespace; the model names it as the declaration does.
  'lib-namespace meter.formatOptions',
  'lib-namespace number-field.formatOptions',
  // The catalog expands React's UIEventHandler<E> alias; the declaration names it (equal, per the probes).
  'event-alias virtualizer.scroll',
  // The catalog flattens the members an interface inherits; the model lists the interface's bases and its own members.
  'flattened-bases table.MuxUITableColumn',
  'flattened-bases table.MuxUITableRow',
  'flattened-bases tree.MuxUITreeItem',
  'flattened-bases tag-group.TagGroupItem',
  // Layout only: one line against several, a trailing member separator, and the name of an index signature's key.
  'type-layout data-diff.DataDiffRow',
  'type-layout data-diff.DataDiffValues',
  'type-layout form.MuxUIValidationErrors',
  'type-layout resizable.ResizableSizes',
  'type-layout text-editor.TextEditorMark',
  'type-layout text-editor.TextEditorSelectionRequest',
].sort();

test('the declarations and the catalog agree on every prop, event and named type of the 66 derived families, bar the explained differences', () => {
  const result = crossCheckDerived({ files });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.counts, { families: 66, parts: 79, props: 583, events: 96, types: 135, references: 135 });
  assert.deepEqual(result.differences, EXPLAINED_DIFFERENCES);
  assert.equal(DERIVED_API_COMPONENTS.length, result.counts.families);
});

const partOf = (map, file, exportName, member = null) => map.get(file).exports.find(({ name }) => name === exportName).parts.find((part) => (part.member ?? null) === member);

// Each change makes the model disagree with the catalog in one way, and the check must say so.
const CATALOG_CONTROLS = [
  ['a required prop becomes optional', (map) => { partOf(map, 'disclosure.json', 'Disclosure').members.find(({ name }) => name === 'title').optional = true; }, /disclosure\.title: catalog required true, declared false/u],
  ['a prop type changes', (map) => { partOf(map, 'resizable.json', 'Resizable').members.find(({ name }) => name === 'keyboardStep').type = 'string'; }, /resizable\.keyboardStep: catalog type number, declared string/u],
  ['a finite value is lost', (map) => { const member = partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'variant'); member.values = member.values.slice(1); }, /button\.variant: catalog enum/u],
  ['a prop is no longer declared', (map) => { const part = partOf(map, 'button.json', 'Button'); part.members = part.members.filter(({ name }) => name !== 'pending'); }, /button\.pending: no alternative of the callable declares it/u],
  ['an event handler changes its signature', (map) => { partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'onActivate').type = '() => void'; }, /button\.activate: catalog event type/u],
  ['a comment changes', (map) => { partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'pending').doc = 'Something else.'; }, /^arm-comment button\.pending$/u],
  ['a comment is lost', (map) => { delete partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'pending').doc; }, /^own-props-comment button\.pending$/u],
  ['an inherited member is no longer reachable', (map) => { map.get('tag-group.json').types.find(({ name }) => name === 'TagGroupItem').extends = undefined; }, /tag-group\.TagGroupItem: catalog members/u],
  ['a part goes missing', (map) => { const entry = map.get('menu.json').exports.find(({ name }) => name === 'Menu'); entry.parts = entry.parts.filter(({ member }) => member !== 'Item'); }, /menu\.item: the model has no part Menu\.Item/u],
  ['a named type goes missing', (map) => { const file = map.get('resizable.json'); file.types = file.types.filter(({ name }) => name !== 'ResizableChange'); }, /resizable\.ResizableChange: not in the model/u],
];

for (const [change, mutate, expected] of CATALOG_CONTROLS) {
  test(`the catalog check can fail: ${change}`, () => {
    const mutated = clone(files);
    mutate(mutated);
    // A change is caught as a problem, or as a difference the pinned list does not hold.
    const { problems, differences } = crossCheckDerived({ files: mutated });
    const raised = [...problems, ...differences.filter((difference) => !EXPLAINED_DIFFERENCES.includes(difference))];
    assert.ok(raised.some((entry) => expected.test(entry)), `${expected}\n${raised.join('\n')}`);
  });
}

const AUTHORED = ['alert-dialog', 'button-group', 'card', 'checkbox-field', 'color-mode-toggle', 'command-palette', 'header-nav', 'input', 'input-tags', 'multi-select', 'payment-input', 'progress-circle', 'radio-field', 'sidebar', 'switch-field', 'tag-select', 'text', 'text-area'];
const hookOption = (type) => ({ hook: 'useCommandPalette', type });

// The 18 families whose web.react API is still authored list prop names only. Each name is owned by the one part
// that declares it; these 35 are not, and the table says why and where they are carried instead. The table is
// transitional: a family that moves to a derived API leaves it, and a stale entry fails.
const AUTHORED_OWNERS = {
  'alert-dialog.disabled': { parts: ['Trigger', 'Close'] },
  'alert-dialog.onActivate': { parts: ['Trigger', 'Close'] },
  'button-group.aria-label': { native: 'ButtonGroup' },
  'button-group.aria-labelledby': { native: 'ButtonGroup' },
  'card.variant': { parts: ['Root', 'Button'] },
  'card.padding': { parts: ['Root', 'Button'] },
  'checkbox-field.disabled': { parts: ['Root', 'Button'] },
  'command-palette.closeOnSelect': { parts: ['Root', 'Item'] },
  'command-palette.disabled': { parts: ['Trigger', 'Close', 'ClearButton', 'Item'] },
  'command-palette.onActivate': { parts: ['Trigger', 'Close', 'ClearButton', 'Item'] },
  'command-palette.commands': hookOption('UseCommandPaletteOptions'),
  'command-palette.query': hookOption('UseCommandPaletteOptions'),
  'command-palette.defaultQuery': hookOption('UseCommandPaletteOptions'),
  'command-palette.onQueryChange': hookOption('UseCommandPaletteOptions'),
  'command-palette.filter': hookOption('UseCommandPaletteOptions'),
  'command-palette.sort': hookOption('UseCommandPaletteOptions'),
  'command-palette.groupBy': hookOption('UseCommandPaletteOptions'),
  'command-palette.getGroupTitle': hookOption('UseCommandPaletteOptions'),
  'command-palette.onAction': hookOption('UseCommandPaletteOptions'),
  'command-palette.close': hookOption('UseCommandPaletteOptions'),
  'command-palette.onError': hookOption('UseCommandPaletteOptions'),
  'header-nav.aria-label': { native: 'Root' },
  'input.type': { native: 'Input' },
  'input.placeholder': { native: 'Input' },
  'multi-select.disabled': { parts: ['Root', 'Item'] },
  'radio-field.disabled': { parts: ['Root', 'Button'] },
  'sidebar.label': { parts: ['Section', 'NavButton'] },
  'sidebar.current': { parts: ['NavItem', 'NavButton'] },
  'sidebar.items': { parts: ['NavItem', 'AccountMenu'] },
  'sidebar.icon': { parts: ['NavItem', 'NavButton'] },
  'switch-field.disabled': { parts: ['Root', 'Button'] },
  'tag-select.disabled': { parts: ['Root', 'Item'] },
  'text-area.rows': { native: 'TextArea' },
  'text-area.maxLength': { native: 'TextArea' },
  'text-area.placeholder': { native: 'TextArea' },
};
// The catalog lists these channels but not their `on` handler among the props; the handler is declared on the root.
const UNLISTED_EVENTS = new Set(['text-area.change']);

test('every prop of the 18 authored families has an owner in the declarations: one part, or a listed reason', () => {
  const result = crossCheckAuthored({ files, table: AUTHORED_OWNERS, authored: AUTHORED, unlistedEvents: UNLISTED_EVENTS });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.counts, { families: 18, props: 187, unique: 152, listed: 35, events: 25 });
  const ownedElsewhere = Object.keys(AUTHORED_OWNERS).length;
  assert.equal(ownedElsewhere, result.counts.listed);
});

test('the authored owner table can fail: a wrong part list, a native claim nothing carries, a hook that does not declare it, a stale entry', () => {
  const check = (table, unlisted = UNLISTED_EVENTS) => crossCheckAuthored({ files, table, authored: AUTHORED, unlistedEvents: unlisted }).problems;
  assert.match(check({ ...AUTHORED_OWNERS, 'card.variant': { parts: ['Root'] } }).join('\n'), /card\.variant: declared by Root, Button, the table says Root/u);
  assert.match(check({ ...AUTHORED_OWNERS, 'input.type': { native: 'NoSuchPart' } }).join('\n'), /input\.type: NoSuchPart has no native attribute envelope that carries it/u);
  assert.match(check({ ...AUTHORED_OWNERS, 'command-palette.commands': { hook: 'useCommandPalette', type: 'UseCommandPaletteReturn' } }).join('\n'), /command-palette\.commands: useCommandPalette \(UseCommandPaletteReturn\) does not declare it/u);
  assert.match(check({ ...AUTHORED_OWNERS, 'card.gone': { parts: ['Root'] } }).join('\n'), /card\.gone: the table lists a prop the catalog no longer has/u);
  const without = { ...AUTHORED_OWNERS };
  delete without['sidebar.items'];
  assert.match(check(without).join('\n'), /sidebar\.items: declared by NavItem, AccountMenu and the table does not say why/u);
  assert.match(check(AUTHORED_OWNERS, new Set()).join('\n'), /text-area\.change: the props do not list onChange, and nothing explains it/u);
});

// ---- 5. the compiler ------------------------------------------------------------------------------

const typedEntries = inventory.entries.filter(({ untyped }) => !untyped).map(({ key }) => key);
// The claims the authored families make about the native attribute envelope of a part, checked by the compiler.
const NATIVE_CLAIMS = Object.entries(AUTHORED_OWNERS).filter(([, listed]) => listed.native).map(([key, listed]) => {
  const [slug, prop] = key.split(/\.(.+)/u);
  const file = files.get(`${slug}.json`);
  const entry = file.exports.find(({ kind }) => kind === 'component');
  const part = entry.parts.find((candidate) => (candidate.member ?? entry.name) === listed.native);
  return { file: `${slug}.json`, export: entry.name, member: part.member ?? null, key: prop };
});

const CONFIGURATIONS = [
  ['TypeScript 7', typeScript7Tsc(), false],
  ['TypeScript 7', typeScript7Tsc(), true],
  ['TypeScript 6', consumerTsc(), false],
  ['TypeScript 6', consumerTsc(), true],
];

let fullProbe;
const probeOfEverything = () => (fullProbe ??= buildProbe({ files, entries: typedEntries, declares: NATIVE_CLAIMS }));

for (const [compiler, tsc, exact] of CONFIGURATIONS) {
  test(`the compiler agrees with the reference and with the hand-written witnesses: ${compiler}, exactOptionalPropertyTypes ${exact ? 'on' : 'off'}`, () => {
    const probe = probeOfEverything();
    assert.ok(probe.probes.length > 1400, `${probe.probes.length} probes`);
    assert.equal(probe.probes.filter(({ id }) => id.startsWith('witness ')).length, WITNESSES.length + 1);
    assert.deepEqual(runProbe({ probe, tsc, exactOptionalPropertyTypes: exact, declarations, manifest }), []);
  });
}

const sampleOf = (...names) => (file) => names.includes(file.owner);
const MODEL_MUTANTS = [
  // The Resizable mutant of the validation: it keeps every minimal required, empty and pair sample valid, yet
  // `defaultSizes` alone, legal in the declarations, is no longer allowed by the model.
  ['an optional value is lost (the Resizable mutant)', (map) => { const member = partOf(map, 'resizable.json', 'Resizable').alternatives[1].members.find(({ name }) => name === 'defaultSizes'); member.never = true; member.type = 'never'; }],
  ['an alternative is lost', (map) => { partOf(map, 'resizable.json', 'Resizable').alternatives.pop(); }],
  ['a forbidden member is widened', (map) => { const member = partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[1].members.find(({ name }) => name === 'height'); delete member.never; member.type = 'number'; }],
  ['a name that is not declared is called declared never', (map) => { partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[0].members.push({ name: 'aria-labelledby', optional: true, never: true, type: 'never' }); }],
  ['a declared never is forgotten', (map) => { const alternative = partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[1]; alternative.members = alternative.members.filter(({ name }) => name !== 'aria-labelledby'); }],
  ['a ref is detached', (map) => { partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[0].ref = { never: true }; }],
  ['a literal value is dropped', (map) => { const member = partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'variant'); member.values = member.values.slice(1); }],
  ['a required member is made optional', (map) => { partOf(map, 'text.json', 'Text').alternatives[1].members.find(({ name }) => name === 'variant').optional = true; }],
  ['a generic default is wrong', (map) => { partOf(map, 'text.json', 'Text').typeParameters[0].default = "'a'"; }],
  ['a native envelope is wrong', (map) => { partOf(map, 'resizable.json', 'Resizable').natives[0].type = 'React.AnchorHTMLAttributes<HTMLAnchorElement>'; }],
];

for (const [change, mutate] of MODEL_MUTANTS) {
  test(`the probes can fail: ${change}`, () => {
    const mutated = clone(files);
    mutate(mutated);
    const include = sampleOf('resizable', 'virtualizer', 'button', 'text');
    const control = buildProbe({ files, entries: typedEntries, include, witnesses: false });
    assert.deepEqual(runProbe({ probe: control, tsc: typeScript7Tsc(), exactOptionalPropertyTypes: false, declarations, manifest }), [], 'the unchanged model passes the same probes');
    const probe = buildProbe({ files: mutated, entries: typedEntries, include, witnesses: false });
    const failures = runProbe({ probe, tsc: typeScript7Tsc(), exactOptionalPropertyTypes: false, declarations, manifest });
    assert.ok(failures.length > 0, 'the compiler rejects the changed model');
  });
}

test('the probes can fail: a native claim on the wrong part', () => {
  const claim = { file: 'input.json', export: 'Input', member: 'Input', key: 'type' };
  const run = (declares) => runProbe({
    probe: buildProbe({ files, entries: typedEntries, include: () => false, declares, witnesses: false }),
    tsc: typeScript7Tsc(), exactOptionalPropertyTypes: false, declarations, manifest,
  });
  assert.deepEqual(run([claim]), [], 'Input.Input carries type');
  assert.equal(run([{ ...claim, member: 'Label' }]).length, 1, 'Input.Label, which extends HTMLAttributes, does not');
});

test('the hand-written witnesses can fail: a wrong expectation is reported by name', () => {
  const witnesses = buildProbe({ files, entries: typedEntries, include: () => false });
  const wrong = { ...witnesses, probes: witnesses.probes.map((probe) => (probe.id === 'witness <Resizable />' ? { ...probe, expect: { loose: 'error', exact: 'error' } } : probe)) };
  const failures = runProbe({ probe: wrong, tsc: typeScript7Tsc(), exactOptionalPropertyTypes: false, declarations, manifest });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /witness <Resizable \/>: expected error, the compiler says ok/u);
});
