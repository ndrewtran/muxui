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
import { crossCheckDerived, loadReference, referenceDirectory, repositoryRoot } from './support/reference-catalog.mjs';
import { checkTypeParameters } from './support/reference-defaults.mjs';
import { PROBE_HEADER, WITNESSES, buildProbe, runProbe } from './support/reference-probes.mjs';

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
  ['a ref that cannot be passed becomes one that must not be omitted', replaced('virtualizer.d.ts', '    ref?: never;', '    ref: never;'), 'virtualizer.json'],
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

// The probes compile a file's types as one namespace, and a page lists them by name, so two types of one name in a
// file would be one name for two declarations. The check turns one into a named failure instead of a compiler's
// "Duplicate identifier".
const duplicateNames = (map) => [...map].flatMap(([fileName, file]) => {
  const ids = new Map();
  for (const type of file.types ?? []) ids.set(type.name, [...(ids.get(type.name) ?? []), type.id]);
  return [...ids].filter(([, same]) => same.length > 1).map(([name, same]) => `${fileName}: ${name} is ${same.join(' and ')}`);
});

test('an owner file holds each type name once', () => {
  assert.deepEqual(duplicateNames(files), []);
  const mutated = clone(files);
  const file = mutated.get('button.json');
  file.types.push({ ...file.types[0], id: `elsewhere#${file.types[0].name}` });
  assert.deepEqual(duplicateNames(mutated), [`button.json: ${file.types[0].name} is ${file.types[0].id} and elsewhere#${file.types[0].name}`]);
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
  ...[...labelOnly.map((slug) => `${slug}.label`), 'resizable.sizes', 'resizable.defaultSizes', 'dialog.title', 'code-block.mode', 'code-block.source', 'code-block.before', 'code-block.after', 'virtualizer.layout', 'virtualizer.children', 'select.description', 'text.variant', 'text.size']
    .map((key) => `own-props-comment ${key}`),
  // Select's arms re-declare errorMessage with a comment of their own, so the declaration and the catalog say different things.
  'arm-comment select.errorMessage',
  // A type parameter is recorded at its constraint (D3): the catalog writes Text's `as` as TextElement, MultiSelect's items as Iterable<MultiSelectItem> and TagSelect's as TagSelectItem[], and the declaration through the parameter T.
  'binder-constraint multi-select.items',
  'binder-constraint tag-select.getItemLabel',
  'binder-constraint tag-select.items',
  'binder-constraint text.as',
  // The catalog spells the lib type without its namespace; the model names it as the declaration does.
  'lib-namespace meter.formatOptions',
  'lib-namespace number-field.formatOptions',
  // The catalog expands React's UIEventHandler<E> and ChangeEventHandler<E> aliases; the declaration names them (equal, per the probes).
  'event-alias sidebar.search.change',
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
  'type-layout sidebar.SidebarNavEntry',
  'type-layout text-editor.TextEditorMark',
  'type-layout text-editor.TextEditorSelectionRequest',
].sort();

test('the declarations and the catalog agree on every prop, event and named type of the 84 derived families, bar the explained differences', () => {
  const result = crossCheckDerived({ files });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.counts, { families: 84, parts: 124, props: 757, events: 122, types: 151, references: 151 });
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

// ---- 5. the compiler ------------------------------------------------------------------------------

const typedEntries = inventory.entries.filter(({ untyped }) => !untyped).map(({ key }) => key);

const CONFIGURATIONS = [
  ['TypeScript 7', typeScript7Tsc(), false],
  ['TypeScript 7', typeScript7Tsc(), true],
  ['TypeScript 6', consumerTsc(), false],
  ['TypeScript 6', consumerTsc(), true],
];

let fullProbe;
const probeOfEverything = () => (fullProbe ??= buildProbe({ files, entries: typedEntries }));

for (const [compiler, tsc, exact] of CONFIGURATIONS) {
  test(`the compiler agrees with the reference and with the hand-written witnesses: ${compiler}, exactOptionalPropertyTypes ${exact ? 'on' : 'off'}`, () => {
    const probe = probeOfEverything();
    assert.ok(probe.probes.length > 9000, `${probe.probes.length} probes`);
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
  // The next ones keep every name right and get a type, a value, a flag or a ref wrong.
  // The Text ref is right for the default element only, so it takes a second instantiation to see it.
  ['a ref type is wrong for another element (the Text ref)', (map) => { partOf(map, 'text.json', 'Text').ref.type = 'HTMLSpanElement'; }],
  ['a member type is wrong (the ListBox items)', (map) => { partOf(map, 'list-box.json', 'ListBox').members.find(({ name }) => name === 'items').type = 'string[]'; }],
  ['a native envelope names the wrong element (the Input.Input native)', (map) => { partOf(map, 'input.json', 'Input', 'Input').natives[0].type = 'React.InputHTMLAttributes<HTMLButtonElement>'; }],
  ['a member type no longer matches its values (the CodeBlock mode)', (map) => { partOf(map, 'code-block.json', 'CodeBlock').alternatives[1].members.find(({ name }) => name === 'mode').type = "'code'"; }],
  ['a member value list no longer matches its type (the CodeBlock mode)', (map) => { partOf(map, 'code-block.json', 'CodeBlock').alternatives[1].members.find(({ name }) => name === 'mode').values = ['code', 'diff']; }],
  ['a member is called required that is optional', (map) => { delete partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'variant').optional; }],
  ['a member is called readonly that is not', (map) => { partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'variant').readonly = true; }],
  ['a listed undefined is forgotten (the Menu.Trigger disabled)', (map) => { delete partOf(map, 'menu.json', 'Menu', 'Trigger').members.find(({ name }) => name === 'disabled').explicitUndefined; }],
  ['an undefined is invented', (map) => { partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'className').explicitUndefined = true; }],
  ['a ref is called required that is optional', (map) => { partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[1].ref = { never: true, required: true }; }],
  // TextEditor holds the constructs the extractor learned last: a non-empty tuple, nested methods, a Promise of unknown.
  ['a tuple loses its required first element (the TextEditor document)', (map) => { const type = map.get('text-editor.json').types.find(({ name }) => name === 'TextEditorDocument'); type.text = type.text.replace('[TextEditorBlockNode, ...TextEditorBlockNode[]]', 'TextEditorBlockNode[]'); }],
  ['a Promise of unknown is narrowed (the TextEditor selection request)', (map) => { const member = partOf(map, 'text-editor.json', 'TextEditor').members.find(({ name }) => name === 'onSelectionRequest'); member.type = member.type.replace('Promise<unknown>', 'Promise<string>'); }],
  ['a nested method loses an optional parameter (the TextEditor image request)', (map) => { const member = partOf(map, 'text-editor.json', 'TextEditor').members.find(({ name }) => name === 'onImageRequest'); member.type = member.type.replace('insertImage(src: string, alt?: string): boolean', 'insertImage(src: string): boolean'); }],
  // A finite domain whose values were lost: the declaration still lists them, so the model is incomplete.
  ['a finite domain loses its values (the CodeBlock diff mode)', (map) => { delete partOf(map, 'code-block.json', 'CodeBlock').alternatives[1].members.find(({ name }) => name === 'mode').values; }],
  // These two read alike and differ only in what can be written, which only exactOptionalPropertyTypes tells apart.
  ['a member that takes nothing is said to take undefined (the Virtualizer grid height)', (map) => { const member = partOf(map, 'virtualizer.json', 'Virtualizer').alternatives[1].members.find(({ name }) => name === 'height'); delete member.never; member.type = 'undefined'; }, { exactOnly: true }],
  ['an optional member is said to list undefined (the Button className)', (map) => { const member = partOf(map, 'button.json', 'Button').members.find(({ name }) => name === 'className'); member.type = 'string | undefined'; member.explicitUndefined = true; }, { exactOnly: true }],
];

const MUTANT_SAMPLE = sampleOf('resizable', 'virtualizer', 'button', 'text', 'list-box', 'input', 'code-block', 'menu', 'text-editor');
const unchangedModelFails = new Map();
const probesFail = (mapOfFiles, exact) => runProbe({
  probe: buildProbe({ files: mapOfFiles, entries: typedEntries, include: MUTANT_SAMPLE, witnesses: false }),
  tsc: typeScript7Tsc(), exactOptionalPropertyTypes: exact, declarations, manifest,
});

for (const [change, mutate, { exactOnly = false } = {}] of MODEL_MUTANTS) {
  test(`the probes can fail: ${change}`, () => {
    // exactOptionalPropertyTypes is the mode that tells these apart, so a change that reads alike is run in it.
    for (const exact of exactOnly ? [true] : [false]) {
      if (!unchangedModelFails.has(exact)) unchangedModelFails.set(exact, probesFail(files, exact));
      assert.deepEqual(unchangedModelFails.get(exact), [], 'the unchanged model passes the same probes');
      const mutated = clone(files);
      mutate(mutated);
      assert.ok(probesFail(mutated, exact).length > 0, `the compiler rejects the changed model${exact ? ' under exactOptionalPropertyTypes' : ''}`);
      // The two modes differ only for these: without exactOptionalPropertyTypes the changed model reads the same.
      if (exactOnly) assert.deepEqual(probesFail(mutated, false), [], 'it passes without exactOptionalPropertyTypes, which cannot tell it apart');
    }
  });
}

// The probes instantiate a generic part at the model's own default, so a default that is valid but wrong passes
// them. The compiler is asked what the declaration says instead, and nothing from the model is passed as an argument.
test('the default and constraint of every type parameter are the declaration\'s own, as the compiler reads them', () => {
  const { checked, failures } = checkTypeParameters({ files, entries: typedEntries, declarations, manifest });
  assert.deepEqual(failures, []);
  assert.equal(checked, 12, 'six generic parts, each with a default and a constraint to compare');
});

for (const [change, mutate, expected] of [
  ['a default that is valid but wrong (the Text element)', (map) => { partOf(map, 'text.json', 'Text').typeParameters[0].default = "'p'"; }, /Text: T has the default "span" in the declaration, and the model says "p"/u],
  ['a default that is lost (MultiSelect.Root)', (map) => { delete partOf(map, 'multi-select.json', 'MultiSelect', 'Root').typeParameters[0].default; }, /MultiSelect\.Root: T has the default MultiSelectItem in the declaration, and the model says none/u],
  ['a constraint that is invented (a CommandPalette part)', (map) => { partOf(map, 'command-palette.json', 'CommandPalette', 'ListBox').typeParameters[0].constraint = 'string'; }, /CommandPalette\.ListBox: T has no constraint in the declaration, and the model says string/u],
  ['a constraint that is narrowed (the Text elements)', (map) => { partOf(map, 'text.json', 'Text').typeParameters[0].constraint = "'p' | 'span'"; delete partOf(map, 'text.json', 'Text').typeParameters[0].refs; }, /Text: T has the constraint TextElement in the declaration/u],
]) {
  test(`the type parameter check can fail: ${change}`, () => {
    const mutated = clone(files);
    mutate(mutated);
    const { failures } = checkTypeParameters({ files: mutated, entries: typedEntries, declarations, manifest });
    assert.equal(failures.length, 1, failures.join('\n'));
    assert.match(failures[0], expected);
  });
}

// The probes' own vocabulary, read off known shapes (the shipped model has no readonly member to show it on).
test('the probe vocabulary tells optional, required, never, readonly and an any apart', () => {
  const claims = [
    ["type S0 = { readonly a: 1; b?: 2; c: never; d?: never; e?: undefined };", 'ok'],
    ["type S1 = Assert<Mut<Sig<S0, 'a'>, 'required/live/readonly'>>;", 'ok'],
    ["type S2 = Assert<Mut<Sig<S0, 'b'>, 'optional/live'>>;", 'ok'],
    ["type S3 = Assert<Mut<Sig<S0, 'c'>, 'required/never'>>;", 'ok'],
    ["type S4 = Assert<Mut<Sig<S0, 'd'>, 'optional/never'>>;", 'ok'],
    ["type S5 = Assert<Mut<Sig<S0, 'e'>, 'optional/never'>>;", 'ok'],
    ["type S6 = Assert<Mut<Sig<S0, 'f'>, 'absent'>>;", 'ok'],
    ["type S7 = Assert<Mut<Sig<S0, 'a'>, 'required/live'>>;", 'error'],
    ["type S8 = Assert<Mut<Ty<any>, string>>;", 'error'],
    ["type S9 = Assert<Mut<Ty<string[]>, readonly string[]>>;", 'error'],
  ];
  const source = `${[...PROBE_HEADER, ...claims.map(([line]) => line)].join('\n')}\n`;
  const first = PROBE_HEADER.length;
  const probe = { source, probes: claims.slice(1).map(([, expect], at) => ({ id: claims[at + 1][0], line: first + at + 2, expect })) };
  for (const exact of [false, true]) assert.deepEqual(runProbe({ probe, tsc: typeScript7Tsc(), exactOptionalPropertyTypes: exact, declarations, manifest }), []);
});

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
