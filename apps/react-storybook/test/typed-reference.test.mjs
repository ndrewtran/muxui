import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandPalette } from '@muxui/react';
import { ComponentDocs } from '../.storybook/component-docs-page.mjs';
import manifest from '../.storybook/generated/manifest.mjs';
import { componentDeclarations, readDeclarationReference, readReactPackageFacts } from '../../component-reference.mjs';
import { typedReference } from '../src/component-docs.mjs';
import { sourceProblems, textEditorExports, textEditorFunctions, textEditorNative, textEditorProps, textEditorRef, textEditorTypes } from './text-editor-declarations.mjs';
import { STORY_API_PARTS, argTypesForBinding, storyApi } from '../src/storybook-factory.mjs';

// The typed reference on every family Docs page (Decision 0031). What the page should show is read here straight from
// the committed declaration reference, the catalog and the package manifest, never from the projection under test, and
// computed with this file's own grouping, so a page that drops, adds or alters a row fails.
const h = React.createElement;
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const { JSDOM } = createRequire(resolve(repositoryRoot, 'packages/react/package.json'))('jsdom');
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const packageName = readJson('packages/react/package.json').name;
const inventory = readJson('packages/react/reference/inventory.json');
const ownerFile = (owner) => readJson(`packages/react/reference/${inventory.owners[owner]}`);

const blocks = {
  Title: () => h('h1', null, 'Title'),
  Primary: () => h('div', { 'data-block': 'primary' }),
  Controls: () => h('div', { 'data-block': 'controls' }),
  Source: ({ code }) => h('pre', null, code),
  Markdown: ({ children }) => h('div', { 'data-block': 'markdown' }, children),
  Anchor: 'a',
};

const slugOf = (family) => family.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
const specifier = (key) => key === '.' ? packageName : `${packageName}${key.slice(1)}`;
const importOf = (name, kind, key) => `import ${kind === 'type' ? 'type ' : ''}{ ${name} } from '${specifier(key)}';`;
/** A finite value as the page writes it: a string in single quotes, anything else as JSON. */
const literal = (value) => typeof value === 'string' ? `'${value}'` : JSON.stringify(value);
const texts = (nodes) => [...nodes].map((node) => node.textContent);

/** The Docs entry of a family: the one its generated story module embeds. */
async function entryOf({ family, tranche }) {
  const { default: meta } = await import(`../.storybook/generated/${tranche.replaceAll('.', '-').toLowerCase()}-${slugOf(family)}.stories.mjs`);
  return meta.parameters.muxuiReference;
}

const pageOf = (entry) => new JSDOM(renderToStaticMarkup(h(ComponentDocs, { entry, blocks }))).window.document;

/** The family's artifact and the binding the catalog gives its React API. */
function catalogOf(family) {
  const { artifact } = catalog.getArtifact({ id: `muxui:component:${slugOf(family)}`, platform: 'web.react', detail: 'full' }).data;
  return { artifact, api: artifact.bindings['web.react'].api };
}

/** The owner of a family's own export: the file the inventory keeps its declarations in. */
function ownerOf(family) {
  return inventory.entries.flatMap((entry) => entry.exports ?? []).find(({ name }) => name === family).owner;
}

/** Every export the inventory gives `owner`, with the record the owner's file holds for it. */
function ownedExports(owner) {
  const file = ownerFile(owner);
  return {
    file,
    exports: inventory.entries.flatMap((entry) => (entry.exports ?? []).map((item) => ({ ...item, entry: entry.key })))
      .filter((item) => item.owner === owner)
      .map((item) => ({
        ...item,
        record: item.kind === 'type' ? null : file.exports.find(({ name, entry }) => name === item.name && entry === item.entry),
      })),
  };
}

/**
 * How an alternative is named in the "Applies when" column, from its members alone: the member the alternatives tell apart
 * by disjoint finite values, else the members only this one requires, else `otherwise`. Written here, not read from the page.
 */
function alternativeName(alternatives, index) {
  const own = alternatives[index];
  const byName = alternatives.map(({ members }) => new Map(members.map((member) => [member.name, member])));
  for (const member of own.members) {
    if (member.never === true || member.values === undefined) continue;
    const siblings = byName.map((map) => map.get(member.name));
    if (siblings.some((sibling) => sibling === undefined || sibling.never === true || sibling.values === undefined || sibling.values.length === 0)) continue;
    const every = siblings.flatMap((sibling) => sibling.values);
    if (new Set(every).size === every.length) return `${member.name} = ${member.values.map(literal).join(' | ')}`;
  }
  const only = own.members.filter((member) => member.optional !== true && member.never !== true && byName.some((map, other) => {
    const sibling = map.get(member.name);
    return other !== index && (sibling === undefined || sibling.optional === true || sibling.never === true);
  }));
  return only.length > 0 ? `requires ${only.map(({ name }) => name).join(', ')}` : 'otherwise';
}

/** The names of all the alternatives of a part; two that read alike are numbered. */
function alternativeNames(alternatives) {
  const names = alternatives.map((_, index) => alternativeName(alternatives, index));
  return names.map((name, index) => names.indexOf(name) === names.lastIndexOf(name) ? name : `${name} (${index + 1})`);
}

/**
 * What a part's table must show: its columns, and per group its label, rows (with the "Applies when" cell), closing rows and
 * the order they come in, from the part's members and alternatives alone. A member declared `never` is no row, and a group
 * ends with its closing rows: what it declares `never` ("not allowed"), then what only its siblings declare ("not declared").
 */
function expectedTable(part) {
  const alternatives = part.alternatives ?? [];
  const row = (member, applies) => ({
    name: member.name,
    applies,
    state: member.optional === true ? 'optional' : 'required',
    type: member.type,
    values: member.values !== undefined && member.values.map(literal).join(' | ') !== member.type ? member.values.map(literal).join(' | ') : null,
    doc: member.doc ?? '',
  });
  const refText = (ref) => ref === undefined ? null : ref === null ? 'none declared' : ref.never === true ? `not allowed, ${ref.required === true ? 'ref: never' : 'ref?: never'}` : ref.type;
  const nativeText = (natives) => natives === undefined ? null : natives.map(({ type, omit }) => `${type}${omit?.length > 0 ? ` except ${omit.join('')}` : ''}`).join('');
  const group = (label, members, applies, notDeclared, ref, native) => {
    const rows = members.filter(({ never }) => never !== true).map((member) => row(member, applies));
    const notAllowed = members.filter(({ never }) => never === true).map(({ name }) => name);
    const closing = [
      ...(notAllowed.length > 0 ? [{ state: 'not allowed', names: notAllowed }] : []),
      ...(notDeclared.length > 0 ? [{ state: 'not declared', names: notDeclared }] : []),
    ];
    return { label, rows, closing, order: [...(label === null ? [] : ['group']), ...rows.map(() => 'row'), ...closing.map(() => 'closing')], ref, native };
  };
  if (alternatives.length === 0) return { columns: 5, groups: [group(null, part.members ?? [], null, [], null, null)] };
  const declared = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))];
  const names = alternativeNames(alternatives);
  return {
    columns: 6,
    groups: [
      ...((part.members ?? []).length > 0 ? [group('Common', part.members, 'always', [], null, null)] : []),
      ...alternatives.map(({ members, ref, natives }, index) => group(
        names[index], members, names[index], declared.filter((name) => !members.some((member) => member.name === name)), refText(ref), nativeText(natives),
      )),
    ],
  };
}

const cellsOf = (row) => [...row.children].filter((cell) => cell.localName === 'th' || cell.localName === 'td');
const columnSpan = (cell) => Number(cell.getAttribute('colspan') ?? 1);
/** How many columns a table row spans: its cells, each counted by its colspan. */
const spanOf = (row) => cellsOf(row).reduce((total, cell) => total + columnSpan(cell), 0);
/** The column a cell starts in, counting the colspans before it. */
const startOf = (row, cell) => cellsOf(row).slice(0, cellsOf(row).indexOf(cell)).reduce((total, other) => total + columnSpan(other), 0);

/** The key a body cell carries for the header word it answers to; the first column (Prop) holds the name in a row header. */
const cellKeys = { 'Applies when': 'applies', Type: 'type', Required: 'required', Default: 'default', Description: 'description' };

/**
 * The table a part shows, read the way a reader sees it: the words of its header, the label of each group, the words in each
 * cell, the order of the rows, and how many columns every row spans. Every cell is read from under the header it sits in
 * (colspans counted), and must carry the key of that header, so a cell moved to another column is a difference. A cell that
 * is missing reads as null, so the page's difference is reported and nothing here throws.
 */
function renderedTable(partNode) {
  const table = partNode.querySelector('table.muxui-docs-table');
  const headRow = table?.querySelector('thead tr');
  const head = headRow === null || headRow === undefined ? null : { words: cellsOf(headRow).map((cell) => cell.textContent), span: spanOf(headRow) };
  const requiredAt = head === null ? -1 : head.words.indexOf('Required');
  const starts = headRow === null || headRow === undefined ? [] : cellsOf(headRow).map((cell) => startOf(headRow, cell));
  /** The cell of a row that starts in the column the header `word` names: what a reader finds under that header. */
  const under = (tr, word) => {
    const column = head === null ? -1 : head.words.indexOf(word);
    return column < 0 ? undefined : cellsOf(tr).find((cell) => startOf(tr, cell) === starts[column]);
  };
  const keyOf = (cell) => cell === undefined ? 'nothing' : cell.getAttribute('data-cell') ?? (cell.localName === 'th' ? 'the name' : 'an unnamed cell');
  const layout = [];
  const groups = [...(table?.querySelectorAll('tbody') ?? [])].map((body) => {
    const trs = [...body.children].filter((child) => child.localName === 'tr');
    const kind = (tr) => tr.classList.contains('muxui-docs-group') ? 'group' : tr.classList.contains('muxui-docs-closing') ? 'closing' : tr.hasAttribute('data-prop') ? 'row' : 'other';
    const header = trs.find((tr) => kind(tr) === 'group');
    const refs = [...(header?.querySelectorAll('.muxui-docs-group-ref') ?? [])].map((node) => node.textContent);
    for (const tr of trs) {
      const at = `${partNode.getAttribute('data-part')} ${kind(tr) === 'group' ? `group ${header?.querySelector('th')?.firstChild?.textContent}` : kind(tr) === 'closing' ? 'closing row' : `row ${tr.getAttribute('data-prop')}`}`;
      if (head !== null && spanOf(tr) !== head.span) layout.push(`${at} spans ${spanOf(tr)} columns, the table has ${head.span}`);
      if (head === null) continue;
      if (kind(tr) === 'row') {
        // A row answers to every header: the name under Prop, then each cell under the word it carries the key of.
        for (const word of head.words) {
          const expectedKey = word === 'Prop' ? 'the name' : cellKeys[word];
          if (keyOf(under(tr, word)) !== expectedKey) layout.push(`${at} has ${keyOf(under(tr, word))} under ${word}, expected ${expectedKey}`);
        }
      }
      if (kind(tr) === 'group' && (cellsOf(tr).length !== 1 || cellsOf(tr)[0].localName !== 'th' || startOf(tr, cellsOf(tr)[0]) !== 0)) layout.push(`${at} is not one heading cell from the first column`);
      if (kind(tr) === 'closing') {
        // The names fill the columns before Required, the state sits under Required, and Default and Description stay empty.
        const state = tr.querySelector('td[data-cell="required"]');
        if (state === null || startOf(tr, state) !== requiredAt) layout.push(`${at} puts its state in column ${state === null ? 'none' : startOf(tr, state)}, under ${requiredAt}`);
        if (cellsOf(tr)[0] === undefined || startOf(tr, cellsOf(tr)[0]) !== 0 || keyOf(under(tr, 'Prop')) !== 'an unnamed cell') layout.push(`${at} does not start its names in the first column`);
        for (const word of ['Default', 'Description']) {
          const cell = under(tr, word);
          if (keyOf(cell) !== 'an unnamed cell' || cell.textContent !== '') layout.push(`${at} has ${keyOf(cell)}${cell === undefined ? '' : ` "${cell.textContent}"`} under ${word}, expected an empty cell`);
        }
      }
    }
    return {
      label: header === undefined ? null : header.querySelector('th')?.firstChild?.textContent ?? null,
      rows: trs.filter((tr) => kind(tr) === 'row').map((row) => ({
        name: under(row, 'Prop')?.querySelector('.muxui-docs-name')?.textContent ?? null,
        applies: under(row, 'Applies when')?.textContent ?? null,
        state: under(row, 'Required')?.firstChild?.textContent ?? null,
        type: [...(under(row, 'Type')?.children ?? [])].find((child) => child.localName === 'code')?.textContent ?? null,
        values: under(row, 'Type')?.querySelector('.muxui-docs-values')?.textContent ?? null,
        doc: under(row, 'Description')?.textContent ?? null,
      })),
      closing: trs.filter((tr) => kind(tr) === 'closing').map((tr) => ({
        // The word a reader sees in the Required column, and the names in the first cell; the marker must say the same.
        state: under(tr, 'Required')?.textContent ?? null,
        names: texts(under(tr, 'Prop')?.querySelectorAll('code') ?? []),
        marker: tr.hasAttribute('data-not-allowed') ? 'not allowed' : tr.hasAttribute('data-not-declared') ? 'not declared' : null,
      })),
      order: trs.map(kind),
      // An alternative's own ref and native envelope sit in its group's heading.
      ref: refs.find((value) => value.startsWith('Ref '))?.slice(4) ?? null,
      native: refs.find((value) => value.startsWith('Native '))?.slice(7) ?? null,
    };
  });
  return { head, groups, layout };
}

const partNodes = (page) => [...page.querySelectorAll('.muxui-docs-reference [data-part]')].filter((node) => node.localName !== 'tr');
const labelOf = (exported, part) => part.member === null ? exported.name : `${exported.name}.${part.member}`;

/** Every problem the page has against the declaration reference: an export, import, part, meta line or row that differs. */
function pageProblems(page, owner) {
  const problems = [];
  const { file, exports } = ownedExports(owner);

  // The index of parts and related exports: every export the inventory gives the owner, with its kind and exact import.
  const expectedIndex = exports.flatMap(({ name, kind, entry, record, reason }) => [
    [name, record?.kind ?? 'type', importOf(name, kind, entry), reason ?? ''],
    ...(record?.kind === 'component' ? record.parts.filter(({ member }) => member !== null).map(({ member }) => [`${name}.${member}`, 'part', importOf(name, kind, entry), '']) : []),
  ].map((cells) => cells.join(' | ')));
  const renderedIndex = [...page.querySelectorAll('table.muxui-docs-exports tbody tr')].map((row) => [
    row.querySelector('th').textContent, row.querySelectorAll('td')[0].textContent, row.querySelector('td code').textContent,
    row.querySelector('.muxui-docs-reason')?.textContent ?? '',
  ].join(' | '));
  if (JSON.stringify([...renderedIndex].sort()) !== JSON.stringify([...expectedIndex].sort())) {
    problems.push(`the parts and related exports are ${JSON.stringify(renderedIndex.sort())}, expected ${JSON.stringify(expectedIndex.sort())}`);
  }

  const nodes = new Map(partNodes(page).map((node) => [node.getAttribute('data-part'), node]));
  const expectedParts = exports.flatMap(({ record }) => record?.kind === 'component' ? record.parts.map((part) => [labelOf(record, part), part, record]) : []);
  if (JSON.stringify([...nodes.keys()].sort()) !== JSON.stringify(expectedParts.map(([label]) => label).sort())) {
    problems.push(`the parts are ${JSON.stringify([...nodes.keys()].sort())}, expected ${JSON.stringify(expectedParts.map(([label]) => label).sort())}`);
  }
  for (const [label, part, record] of expectedParts) {
    const node = nodes.get(label);
    if (node === undefined) continue;
    const meta = (name) => node.querySelector(`[data-meta="${name}"]`);
    if (meta('import')?.textContent !== importOf(record.name, 'value', record.entry)) problems.push(`${label} import is ${meta('import')?.textContent}`);
    // An alias is the same component as the part it names (the export itself, or a sibling member), so it shows that part's surface.
    const canonical = part.sameAs === undefined ? part : record.parts.find(({ member }) => member === (part.sameAs === record.name ? null : part.sameAs));
    if (canonical === undefined || canonical.sameAs !== undefined) {
      problems.push(`${label} is the same as ${part.sameAs}, which the reference does not hold as a part of its own`);
      continue;
    }
    const alternativeRefs = (canonical.alternatives ?? []).some((alternative) => alternative.ref !== undefined);
    if (canonical.ref !== undefined && canonical.ref !== null && canonical.ref.never !== true && meta('ref')?.textContent !== canonical.ref.type) problems.push(`${label} ref is ${meta('ref')?.textContent}, expected ${canonical.ref.type}`);
    if (canonical.ref?.never === true && !meta('ref')?.textContent.includes(canonical.ref.required === true ? 'ref: never' : 'ref?: never')) problems.push(`${label} ref should be never`);
    if ((canonical.ref === undefined || canonical.ref === null) && !alternativeRefs && meta('ref')?.textContent !== 'none declared') problems.push(`${label} should say it declares no ref, not ${meta('ref')?.textContent}`);
    const natives = (canonical.natives ?? []).map(({ type, omit }) => `${type}${omit?.length > 0 ? ` except ${omit.join('')}` : ''}`).join('');
    if (canonical.natives !== undefined && meta('native')?.textContent !== natives) problems.push(`${label} native is ${meta('native')?.textContent}, expected ${natives}`);
    if (canonical.natives === undefined && !(canonical.alternatives ?? []).some((alternative) => alternative.natives !== undefined) && meta('native')?.textContent !== 'none declared') problems.push(`${label} should say it declares no native surface, not ${meta('native')?.textContent}`);
    const generics = (canonical.typeParameters ?? []).map(({ name, constraint, default: fallback }) => `${name}${constraint ? ` extends ${constraint}` : ''}${fallback ? ` = ${fallback}` : ''}`).join(', ');
    if (meta('generics')?.textContent !== (canonical.typeParameters === undefined ? undefined : generics)) problems.push(`${label} generics are ${meta('generics')?.textContent}`);
    if (part.sameAs !== undefined) {
      const target = page.getElementById(meta('same-as')?.querySelector('a[href^="#"]')?.getAttribute('href').slice(1) ?? '');
      if (meta('same-as')?.textContent !== labelOf(record, canonical) || target?.getAttribute('data-part') !== labelOf(record, canonical) || node.querySelector('table') !== null) problems.push(`${label} should be the same as ${labelOf(record, canonical)}, linked to it, and list no table; it says ${meta('same-as')?.textContent}`);
      continue;
    }
    const expected = expectedTable(part);
    const rendered = renderedTable(node);
    const words = ['Prop', ...(expected.columns === 6 ? ['Applies when'] : []), 'Type', 'Required', 'Default', 'Description'];
    if (JSON.stringify(rendered.head) !== JSON.stringify({ words, span: expected.columns })) problems.push(`${label} header is ${JSON.stringify(rendered.head)}, expected ${JSON.stringify({ words, span: expected.columns })}`);
    problems.push(...rendered.layout);
    for (const [index, group] of expected.groups.entries()) {
      // The marker on a closing row is only a hook; the visible word is what a reader sees, and the two must agree.
      const shown = rendered.groups[index] === undefined ? undefined : { ...rendered.groups[index], closing: rendered.groups[index].closing.map(({ state, names, marker }) => ({ state, names, ...(marker !== state && { marker }) })) };
      if (JSON.stringify(shown) !== JSON.stringify({ ...group, order: group.order })) problems.push(`${label} group ${group.label ?? 'props'} differs: rendered ${JSON.stringify(shown)}, expected ${JSON.stringify(group)}`);
    }
    if (rendered.groups.length !== expected.groups.length) problems.push(`${label} has ${rendered.groups.length} groups, expected ${expected.groups.length}`);
  }

  // The functions and values, with their exact signatures or types.
  for (const { name, entry, record } of exports) {
    if (record?.kind !== 'function' && record?.kind !== 'value') continue;
    const node = page.querySelector(`.muxui-docs-reference [data-export="${name}"]:not(tr)`);
    const shown = node?.querySelector(`[data-meta="${record.kind === 'function' ? 'signature' : 'type'}"]`)?.textContent;
    if (shown !== (record.kind === 'function' ? record.signature : record.type)) problems.push(`${name} shows ${shown}`);
    if (node?.querySelector('[data-meta="import"]')?.textContent !== importOf(name, 'value', entry)) problems.push(`${name} import differs`);
    if ((node?.querySelector('[data-fact="typed.doc"]')?.textContent ?? undefined) !== record.doc) problems.push(`${name} comment differs`);
  }

  // Every type the page prints is a declaration of the owner's file, printed as written; a link leads to a printed type.
  const printed = new Map(file.types.map((type) => [type.name, type.text]));
  for (const node of page.querySelectorAll('[data-type]')) {
    if (printed.get(node.getAttribute('data-type')) !== node.querySelector('pre').textContent) problems.push(`type ${node.getAttribute('data-type')} is not printed as declared`);
  }
  for (const link of page.querySelectorAll('.muxui-docs-reference a[href^="#"]')) {
    if (page.getElementById(link.getAttribute('href').slice(1)) === null) problems.push(`${link.textContent} links to ${link.getAttribute('href')}, which the page does not hold`);
  }
  for (const { name, kind, entry } of exports.filter(({ kind: item }) => item === 'type')) {
    const printedHere = [...page.querySelectorAll('[data-type]')].find((node) => node.getAttribute('data-type') === name);
    if (printedHere === undefined || !texts(printedHere.querySelectorAll('.muxui-docs-import code')).includes(importOf(name, kind, entry))) problems.push(`type ${name} does not print its import`);
  }
  return problems;
}

test('every family Docs page lists its parts and related exports and shows each part as the declarations wrote it', async () => {
  let parts = 0;
  let rows = 0;
  for (const record of manifest.families) {
    const page = pageOf(await entryOf(record));
    assert.deepEqual(pageProblems(page, ownerOf(record.family)), [], `${record.family} typed reference`);
    parts += partNodes(page).length;
    rows += page.querySelectorAll('.muxui-docs-reference tr[data-prop]').length;
  }
  assert.equal(manifest.families.length, 84);
  // The reference holds 211 parts in 109 component, function and value exports, and every one is on its family's page.
  assert.equal(parts, 211);
  assert.ok(rows > 1000, `the 84 pages show ${rows} rows`);
});

test('every rendered default is the catalog\'s, every executed catalog default is shown, and an authored one says so', async () => {
  let executed = 0;
  let authored = 0;
  for (const record of manifest.families) {
    const page = pageOf(await entryOf(record));
    const { api } = catalogOf(record.family);
    const provenance = api.propDetails === undefined ? 'authored' : 'executed';
    // The catalog block that owns a part of the family's own export: its partApis entry, or the root's for the export and its Root.
    const blockOf = (member) => Object.values(api.partApis ?? {}).find((block) => block.member === member) ?? (member === null || member === 'Root' ? api : undefined);
    const shown = new Map();
    for (const node of partNodes(page)) {
      const [exportName, member = null] = node.getAttribute('data-part').split('.');
      for (const row of node.querySelectorAll('tr[data-prop]')) {
        const cell = row.querySelector('[data-cell="default"]');
        const code = cell.querySelector('code');
        const mark = cell.querySelector('.muxui-docs-authored');
        if (code === null) {
          assert.equal(mark, null, `${record.family} ${node.getAttribute('data-part')} ${row.getAttribute('data-prop')} no default, no mark`);
          continue;
        }
        assert.equal(exportName, record.family, `${record.family} shows a default only on its own export`);
        const block = blockOf(member);
        const name = row.getAttribute('data-prop');
        assert.ok(block !== undefined && Object.hasOwn(block.defaults ?? {}, name), `${record.family} ${node.getAttribute('data-part')} ${name} default is not the catalog's`);
        assert.equal(code.textContent, literal(block.defaults[name]), `${record.family} ${name} default`);
        assert.equal(mark?.textContent ?? null, provenance === 'authored' ? 'authored' : null, `${record.family} ${name} provenance`);
        shown.set(`${block === api ? 'root' : block.member}.${name}`, true);
        if (provenance === 'authored') authored += 1; else executed += 1;
      }
    }
    if (provenance === 'executed') {
      for (const [key, block] of [['root', api], ...Object.values(api.partApis ?? {}).map((part) => [part.member, part])]) {
        for (const name of Object.keys(block.defaults ?? {})) assert.ok(shown.has(`${key}.${name}`), `${record.family} shows the catalog default of ${key}.${name}`);
      }
    }
    const caption = page.querySelector('[data-fact="typed.provenance"]').textContent;
    assert.match(caption, provenance === 'authored' ? /authored by hand, so each is marked authored/u : /each is the default its source executes/u, `${record.family} says where its defaults come from`);
  }
  assert.ok(executed > 100 && authored > 10, `${executed} executed and ${authored} authored defaults are shown`);
});

test('a callback row names the event channel the catalog reports through it', async () => {
  let channels = 0;
  for (const record of manifest.families) {
    const page = pageOf(await entryOf(record));
    const { api } = catalogOf(record.family);
    for (const node of partNodes(page)) {
      const [exportName, member = null] = node.getAttribute('data-part').split('.');
      if (exportName !== record.family) {
        assert.equal(node.querySelector('[data-event]'), null, `${node.getAttribute('data-part')} is not the family's own export`);
        continue;
      }
      const block = Object.values(api.partApis ?? {}).find((part) => part.member === member) ?? (member === null || member === 'Root' ? api : undefined);
      const names = new Set([...node.querySelectorAll('tr[data-prop]')].map((row) => row.getAttribute('data-prop')));
      const expected = Object.fromEntries((block?.events ?? [])
        .map((channel) => [block.eventDetails?.[channel]?.prop ?? `on${channel[0].toUpperCase()}${channel.slice(1)}`, channel])
        .filter(([prop]) => names.has(prop)));
      const shown = Object.fromEntries([...node.querySelectorAll('tr[data-prop] [data-event]')].map((badge) => [badge.closest('tr').getAttribute('data-prop'), badge.getAttribute('data-event')]));
      assert.deepEqual(shown, expected, `${node.getAttribute('data-part')} events`);
      channels += Object.keys(shown).length;
    }
  }
  assert.ok(channels > 100, `${channels} callback rows name their channel`);
});

test('the hard cases show their alternatives, refs, generics and flat exports as the declarations wrote them', async () => {
  const page = async (family) => pageOf(await entryOf(manifest.families.find((record) => record.family === family)));
  const part = (document, label) => partNodes(document).find((node) => node.getAttribute('data-part') === label);
  const groupLabels = (node) => [...node.querySelectorAll('table.muxui-docs-table tbody')].map((body) => body.getAttribute('data-group'));
  const closing = (node, state) => [...node.querySelectorAll(`tr[data-${state}]`)].map((row) => row.getAttribute(`data-${state}`));

  // Dialog: a title permits both aria names; without one the two names exclude each other. Three alternatives, each closing with what it forbids.
  const dialog = part(await page('Dialog'), 'Dialog');
  assert.deepEqual(groupLabels(dialog), ['Common', 'requires title', 'requires aria-label', 'requires aria-labelledby']);
  assert.deepEqual(closing(dialog, 'not-allowed'), ['title,aria-labelledby', 'title,aria-label']);
  assert.deepEqual(closing(dialog, 'not-declared'), []);

  // IconButton: both aria names together are valid, so each alternative requires one and leaves the other optional.
  const iconButton = part(await page('IconButton'), 'IconButton');
  assert.deepEqual(groupLabels(iconButton), ['Common', 'requires aria-label', 'requires aria-labelledby']);
  assert.equal(iconButton.querySelector('[data-meta="ref"]').textContent, 'HTMLButtonElement');
  assert.ok(iconButton.querySelector('[data-meta="native"]').textContent.startsWith('React.ButtonHTMLAttributes<HTMLButtonElement> except children'));

  // Resizable: neither, either or the default sizes, never both; the flat parts are exports of their own.
  const resizableDocument = await page('Resizable');
  const resizable = part(resizableDocument, 'Resizable');
  assert.deepEqual(groupLabels(resizable), ['Common', 'requires sizes', 'otherwise']);
  assert.deepEqual(closing(resizable, 'not-allowed'), ['defaultSizes', 'sizes']);
  assert.deepEqual([...resizableDocument.querySelectorAll('div.muxui-docs-export')].map((node) => node.getAttribute('data-export')), ['Resizable', 'ResizableHandle', 'ResizablePanel']);
  assert.match(resizableDocument.querySelector('div[data-export="ResizablePanel"] h3').textContent, /related export/u);
  assert.equal(part(resizableDocument, 'ResizablePanel').querySelector('[data-meta="ref"]').textContent, 'none declared');

  // Text: a generic whose ref depends on `as`, three visual alternatives named by their finite `variant`.
  const text = part(await page('Text'), 'Text');
  assert.equal(text.querySelector('[data-meta="generics"]').textContent, "T extends TextElement = 'span'");
  assert.equal(text.querySelector('[data-meta="ref"]').textContent, 'HTMLElementTagNameMap[T]');
  assert.ok(text.querySelector('[data-meta="native"]').textContent.startsWith('React.ComponentPropsWithoutRef<T> except as'));
  assert.deepEqual(groupLabels(text), ['Common', "variant = 'body'", "variant = 'display' | 'heading' | 'title'", "variant = 'label' | 'expressive' | 'mono'"]);
  const sizeOf = (index) => text.querySelectorAll('table tbody')[index].querySelector('tr[data-prop="size"] [data-cell="type"]').textContent;
  assert.equal(sizeOf(2), "Exclude<TextSize, 'xs'>'sm' | 'md' | 'lg'", 'the display, heading and title sizes leave xs out');

  // Virtualizer: each layout is its own group with its own ref; "not declared" stays apart from "not allowed".
  const virtualizer = part(await page('Virtualizer'), 'Virtualizer');
  assert.deepEqual(groupLabels(virtualizer), ['Common', "layout = 'stack'", "layout = 'grid'"]);
  const [, stack, grid] = [...virtualizer.querySelectorAll('table tbody')];
  assert.equal(stack.querySelector('.muxui-docs-group-ref').textContent, 'Ref HTMLDivElement');
  assert.equal(grid.querySelector('.muxui-docs-group-ref').textContent, 'Ref not allowed, ref?: never');
  assert.equal(stack.querySelector('tr[data-not-allowed]').getAttribute('data-not-allowed'), 'children,minItemWidth,maxItemWidth,estimatedItemHeight,maxColumns');
  assert.equal(stack.querySelector('tr[data-not-declared]').getAttribute('data-not-declared'), 'aria-labelledby');
  assert.equal(grid.querySelector('tr[data-not-declared]'), null);
  assert.ok(grid.querySelector('tr[data-not-allowed]').getAttribute('data-not-allowed').split(',').includes('aria-labelledby'));
  // The default stack does not appear on the grid, which does not admit it.
  assert.equal(grid.querySelector('tr[data-prop="layout"] [data-cell="default"]').textContent, 'none listed');
  assert.equal(stack.querySelector('tr[data-prop="layout"] [data-cell="default"]').textContent, "'stack'");

  // DataDiff: no alternatives, and two members declared `never`. They are no rows; one closing row names them and ends the table.
  const dataDiff = part(await page('DataDiff'), 'DataDiff');
  assert.deepEqual(groupLabels(dataDiff), ['props']);
  const dataDiffRows = [...dataDiff.querySelectorAll('tbody tr')];
  assert.ok(!dataDiffRows.some((row) => ['children', 'dangerouslySetInnerHTML'].includes(row.getAttribute('data-prop'))), 'a never member is not an optional row');
  assert.deepEqual(closing(dataDiff, 'not-allowed'), ['children,dangerouslySetInnerHTML']);
  assert.equal(dataDiffRows.at(-1).getAttribute('data-not-allowed'), 'children,dangerouslySetInnerHTML', 'the closing row ends the table');
  assert.equal(dataDiffRows.at(-1).querySelector('[data-cell="required"]').textContent, 'not allowed');

  // The optional `never` explanation appears on a page that has one, and only there.
  assert.ok((await page('Virtualizer')).querySelector('[data-fact="typed.never"]'));
  assert.equal((await page('Button')).querySelector('[data-fact="typed.never"]'), null);
});

test('an aliased part shows the generics, ref and native surface of the part it is the same as, in every family', async () => {
  let aliases = 0;
  for (const record of manifest.families) {
    const page = pageOf(await entryOf(record));
    const { exports } = ownedExports(ownerOf(record.family));
    for (const { record: exported } of exports) {
      for (const part of exported?.kind === 'component' ? exported.parts.filter(({ sameAs }) => sameAs !== undefined) : []) {
        const node = partNodes(page).find((candidate) => candidate.getAttribute('data-part') === labelOf(exported, part));
        const canonical = partNodes(page).find((candidate) => candidate.getAttribute('data-part') === (part.sameAs === exported.name ? exported.name : `${exported.name}.${part.sameAs}`));
        assert.ok(canonical !== undefined, `${labelOf(exported, part)} names a part the page has`);
        for (const meta of ['ref', 'native', 'generics']) {
          assert.equal(node.querySelector(`[data-meta="${meta}"]`)?.textContent, canonical.querySelector(`[data-meta="${meta}"]`)?.textContent, `${labelOf(exported, part)} ${meta} is its canonical part's`);
        }
        assert.ok(!/none declared/u.test(node.querySelector('[data-meta="ref"]').textContent) || /none declared/u.test(canonical.querySelector('[data-meta="ref"]').textContent));
        assert.equal(node.querySelector('[data-meta="same-as"]').textContent, canonical.getAttribute('data-part'));
        aliases += 1;
      }
    }
  }
  assert.equal(aliases, 1, 'TextEditor.Root is the one alias in the reference');
  // TextEditor.Root is the component itself, so it has the component's ref and attribute surface.
  const page = pageOf(await entryOf(manifest.families.find(({ family }) => family === 'TextEditor')));
  const root = partNodes(page).find((node) => node.getAttribute('data-part') === 'TextEditor.Root');
  assert.equal(root.querySelector('[data-meta="same-as"]').textContent, 'TextEditor');
  assert.equal(root.querySelector('[data-meta="ref"]').textContent, 'TextEditorHandle');
  assert.equal(root.querySelector('[data-meta="native"]').textContent, 'React.HTMLAttributes<HTMLDivElement> except valuedefaultValueonChange');
  assert.deepEqual(texts(root.querySelectorAll('[data-meta="native"] code')), ['React.HTMLAttributes<HTMLDivElement>', 'value', 'defaultValue', 'onChange']);
});

// A change to the rendered page itself, with the model unchanged, is what a reader would see differently: the checker reads the
// words in a cell, the order of the rows and the columns each row spans, so each of these must fail it on the part it changed.
test('a rendered page changed by hand fails the checker with a problem on the part it changed, and never crashes it', async () => {
  const problemsOf = async (family, change) => {
    const page = pageOf(await entryOf(manifest.families.find((record) => record.family === family)));
    change?.(page);
    return pageProblems(page, ownerOf(family));
  };
  const part = (page, label) => partNodes(page).find((node) => node.getAttribute('data-part') === label);
  const body = (page, label, group) => [...part(page, label).querySelectorAll('tbody')].find((node) => node.getAttribute('data-group') === group);
  const rowsIn = (node) => [...node.querySelectorAll('tr[data-prop]')];
  const closingIn = (node) => [...node.querySelectorAll('tr.muxui-docs-closing')];
  const cell = (row, name) => row.querySelector(`[data-cell="${name}"]`);
  /** Moves the cell `second` before the cell `first` in a row, so two neighbouring cells trade places and keep their keys. */
  const swapped = (row, first, second) => cell(row, first).before(cell(row, second));
  const dataCells = (page, label) => [...part(page, label).querySelectorAll('tbody tr[data-prop]')];
  const mutations = [
    {
      label: 'the visible state of a not allowed row reads "optional" (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'stack' differs"],
      change: (page) => { cell(closingIn(body(page, 'Virtualizer', "layout = 'stack'")).at(0), 'required').textContent = 'optional'; },
    },
    {
      label: 'the visible state of a not declared row reads "not allowed" (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'stack' differs"],
      change: (page) => { cell(closingIn(body(page, 'Virtualizer', "layout = 'stack'")).at(-1), 'required').textContent = 'not allowed'; },
    },
    {
      label: 'the visible state of a row reads "required" where the model says optional (Dialog)', family: 'Dialog', expect: ['Dialog group Common differs'],
      change: (page) => { cell(rowsIn(body(page, 'Dialog', 'Common'))[1], 'required').firstChild.textContent = 'required'; },
    },
    {
      label: 'a closing row moves before the rows of its group (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'stack' differs", '"order":["group","closing"'],
      change: (page) => {
        const tbody = body(page, 'Virtualizer', "layout = 'stack'");
        const [first] = rowsIn(tbody);
        first.before(closingIn(tbody)[0]);
      },
    },
    {
      label: 'a closing row moves above its group heading (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'stack' differs"],
      change: (page) => { const tbody = body(page, 'Virtualizer', "layout = 'stack'"); tbody.prepend(closingIn(tbody)[0]); },
    },
    {
      label: 'two rows swap places (IconButton)', family: 'IconButton', expect: ['IconButton group Common differs'],
      change: (page) => { const [first, second] = rowsIn(body(page, 'IconButton', 'Common')); first.before(second); },
    },
    {
      label: 'a row loses its type cell (IconButton)', family: 'IconButton', expect: ['IconButton row ', 'spans 5 columns, the table has 6'],
      change: (page) => cell(rowsIn(body(page, 'IconButton', 'Common'))[0], 'type').remove(),
    },
    {
      label: 'a row loses its state cell (Dialog)', family: 'Dialog', expect: ['Dialog row ', 'spans 5 columns, the table has 6'],
      change: (page) => cell(rowsIn(body(page, 'Dialog', 'Common'))[0], 'required').remove(),
    },
    {
      label: 'the word of a closing row and its marker disagree (Dialog)', family: 'Dialog', expect: ['Dialog group requires aria-label differs'],
      change: (page) => { const row = closingIn(body(page, 'Dialog', 'requires aria-label'))[0]; row.removeAttribute('data-not-allowed'); row.setAttribute('data-not-declared', 'x'); },
    },
    {
      label: 'the closing row of a table with no alternatives is removed (DataDiff)', family: 'DataDiff', expect: ['DataDiff group props differs'],
      change: (page) => closingIn(part(page, 'DataDiff')).forEach((row) => row.remove()),
    },
    {
      label: 'the closing row of a five-column table spans the six columns of another (DataDiff)', family: 'DataDiff', expect: ['DataDiff closing row spans 6 columns, the table has 5'],
      change: (page) => closingIn(part(page, 'DataDiff'))[0].querySelector('td').setAttribute('colspan', '3'),
    },
    {
      label: 'a closing row loses its last cell (Virtualizer)', family: 'Virtualizer', expect: ['Virtualizer closing row spans 5 columns, the table has 6'],
      change: (page) => closingIn(body(page, 'Virtualizer', "layout = 'stack'"))[0].lastElementChild.remove(),
    },
    {
      label: 'a closing row puts its state under another column (Virtualizer)', family: 'Virtualizer', expect: ['Virtualizer closing row puts its state in column 2, under 3'],
      change: (page) => {
        const row = closingIn(body(page, 'Virtualizer', "layout = 'stack'"))[0];
        row.firstElementChild.setAttribute('colspan', '2');
        row.lastElementChild.setAttribute('colspan', '2');
      },
    },
    {
      label: 'a group heading spans too few columns (Dialog)', family: 'Dialog', expect: ['Dialog group requires title spans 5 columns, the table has 6'],
      change: (page) => body(page, 'Dialog', 'requires title').querySelector('tr.muxui-docs-group th').setAttribute('colspan', '5'),
    },
    {
      label: 'a column is added to every row and to the header (IconButton)', family: 'IconButton', expect: ['IconButton header is', '"Extra"'],
      change: (page) => {
        const table = part(page, 'IconButton').querySelector('table');
        table.querySelector('thead tr').append(Object.assign(page.createElement('th'), { textContent: 'Extra' }));
        for (const row of table.querySelectorAll('tbody tr')) row.append(page.createElement('td'));
      },
    },
    {
      label: 'a column is added to the rows and not to the header (IconButton)', family: 'IconButton', expect: ['spans 7 columns, the table has 6'],
      change: (page) => { for (const row of part(page, 'IconButton').querySelectorAll('tbody tr[data-prop]')) row.append(page.createElement('td')); },
    },
    {
      // The cells keep their keys and words and only change columns, so the words under each header are what differs.
      label: 'the Type and Required cells swap places in every prop row (IconButton)', family: 'IconButton',
      expect: ['IconButton row ', 'has required under Type, expected type', 'has type under Required, expected required', 'IconButton group Common differs'],
      change: (page) => { for (const row of part(page, 'IconButton').querySelectorAll('tr[data-prop]')) swapped(row, 'type', 'required'); },
    },
    {
      label: 'the Default and Description cells swap places in every prop row (Dialog)', family: 'Dialog',
      expect: ['Dialog row ', 'has description under Default, expected default', 'has default under Description, expected description', 'Dialog group '],
      change: (page) => { for (const row of part(page, 'Dialog').querySelectorAll('tr[data-prop]')) swapped(row, 'default', 'description'); },
    },
    {
      label: 'an "Applies when" cell swaps places with the Type cell (Virtualizer)', family: 'Virtualizer',
      expect: ["Virtualizer row ", 'has type under Applies when, expected applies', 'has applies under Type, expected type', "Virtualizer group layout = 'grid' differs"],
      change: (page) => swapped(rowsIn(body(page, 'Virtualizer', "layout = 'grid'"))[0], 'applies', 'type'),
    },
    {
      label: 'a group heading becomes two cells (Dialog)', family: 'Dialog', expect: ['is not one heading cell from the first column'],
      change: (page) => {
        const heading = body(page, 'Dialog', 'requires title').querySelector('tr.muxui-docs-group th');
        heading.colSpan -= 1;
        heading.after(page.createElement('td'));
      },
    },
    {
      label: 'a closing row puts its state before its names (Virtualizer)', family: 'Virtualizer', expect: ['closing row puts its state in column 0, under 3'],
      change: (page) => { const closing = closingIn(body(page, 'Virtualizer', "layout = 'stack'"))[0]; closing.prepend(cell(closing, 'required')); },
    },
    {
      label: 'a closing row writes under Default (Virtualizer)', family: 'Virtualizer', expect: ['closing row has an unnamed cell "left over" under Default, expected an empty cell'],
      change: (page) => { closingIn(body(page, 'Virtualizer', "layout = 'stack'"))[0].children[2].textContent = 'left over'; },
    },
    {
      label: 'a "Applies when" cell is changed (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'grid' differs"],
      change: (page) => { cell(rowsIn(body(page, 'Virtualizer', "layout = 'grid'"))[0], 'applies').firstChild.textContent = "layout = 'stack'"; },
    },
    {
      label: 'an "Applies when" cell says always in an alternative (Virtualizer)', family: 'Virtualizer', expect: ["Virtualizer group layout = 'stack' differs"],
      change: (page) => { cell(rowsIn(body(page, 'Virtualizer', "layout = 'stack'"))[0], 'applies').textContent = 'always'; },
    },
    {
      label: 'a group is relabelled (Dialog)', family: 'Dialog', expect: ['Dialog group '],
      change: (page) => { body(page, 'Dialog', 'requires title').querySelector('tr.muxui-docs-group th').firstChild.textContent = 'otherwise'; },
    },
    {
      label: 'a header word is changed (Text)', family: 'Text', expect: ['Text header is'],
      change: (page) => { part(page, 'Text').querySelector('thead th:nth-child(5)').textContent = 'Optional'; },
    },
    {
      label: 'an aliased part says it declares no ref (TextEditor.Root)', family: 'TextEditor', expect: ['TextEditor.Root ref is none declared, expected TextEditorHandle'],
      change: (page) => { part(page, 'TextEditor.Root').querySelector('[data-meta="ref"]').textContent = 'none declared'; },
    },
  ];
  const unchanged = (await Promise.all([...new Set(mutations.map(({ family }) => family))].map((family) => problemsOf(family)))).flat();
  assert.deepEqual(unchanged, [], 'the pages these changes start from pass the checker');
  const failures = [];
  for (const { label, family, expect, change } of mutations) {
    let problems;
    try {
      problems = await problemsOf(family, change);
    } catch (error) {
      failures.push(`${label}: the checker crashed (${error.message}) instead of naming the difference`);
      continue;
    }
    if (problems.length === 0) failures.push(`${label}: no problem`);
    for (const fragment of expect) if (!problems.some((problem) => problem.includes(fragment))) failures.push(`${label}: no problem contains "${fragment}"; got ${problems.map((problem) => `"${problem.slice(0, 140)}"`).join(', ') || 'nothing'}`);
  }
  assert.deepEqual(failures, []);
});

/** The exports and public types the reference files for the package-level and shared owners hold, which no family page lists. */
function unownedSubjects() {
  const subjects = [];
  for (const owner of ['package-level', 'shared']) {
    const file = ownerFile(owner);
    for (const { name, entry, kind } of file.exports) subjects.push(`${entry}:${kind === 'type' ? 'type' : 'value'}:${name}`);
    // The file also prints the types its exports reach, which another owner exports; only its own are held here.
    for (const { public: where, owner: typeOwner } of file.types) for (const { entry, name } of typeOwner === owner ? where ?? [] : []) subjects.push(`${entry}:type:${name}`);
  }
  return subjects;
}

/**
 * Every difference between the exports and parts the Docs pages list and the public surface inventory the public-surface check
 * records, which the reference's own inventory is held against, not read from it. Each export or part is on exactly one page, or
 * is one of those the package-level and shared reference files hold, which every page points to.
 */
function coverageProblems(documents) {
  const fixture = readJson('packages/react/test/fixtures/public-surface-inventory.json');
  const expected = [];
  for (const [key, subjects] of Object.entries(fixture.baseline)) {
    const added = fixture.added[key] ?? {};
    for (const kind of ['types', 'values']) {
      for (const name of [...subjects[kind], ...(added[kind] ?? [])]) expected.push(`${key}:${kind === 'types' ? 'type' : 'value'}:${name}`);
    }
    for (const name of [...subjects.parts, ...(added.parts ?? [])]) expected.push(`${key}:part:${name}`);
  }
  const keyOf = (importText) => {
    const [, , , from] = /^import (type )?\{ (\w+) \} from '([^']+)';$/u.exec(importText) ?? [];
    return from === packageName ? '.' : `.${from?.slice(packageName.length)}`;
  };
  const shown = documents.flatMap((page) => [...page.querySelectorAll('table.muxui-docs-exports tbody tr')].map((row) => {
    const kind = row.querySelectorAll('td')[0].textContent;
    return `${keyOf(row.querySelector('td code').textContent)}:${kind === 'type' ? 'type' : kind === 'part' ? 'part' : 'value'}:${row.querySelector('th').textContent}`;
  }));
  const held = unownedSubjects();
  const problems = [];
  const seen = new Set();
  for (const item of shown) { if (seen.has(item)) problems.push(`${item} is listed twice`); seen.add(item); }
  for (const item of expected) if (!seen.has(item) && !held.includes(item)) problems.push(`${item} is on no page`);
  for (const item of seen) if (!expected.includes(item)) problems.push(`${item} is not in the public surface`);
  for (const item of held) if (seen.has(item)) problems.push(`${item} is on a page and in a package reference file`);
  return { problems, count: shown.length, held: held.length };
}

const allPages = async () => Promise.all(manifest.families.map(async (record) => pageOf(await entryOf(record))));

test('every export and part of the package is on exactly one Docs page or in the reference files the pages point to, against the public surface inventory', async () => {
  const { problems, count, held } = coverageProblems(await allPages());
  assert.deepEqual(problems, []);
  assert.equal(held, 35, 'the 11 package-level exports and the 24 shared types');
  assert.equal(count + held, 318 + 109 + 132, 'the 318 types, 109 values and 132 parts of the public surface');
});

test('each Docs page points to the two reference files that hold the package-level exports and the shared types', async () => {
  const urls = ['package-level', 'shared'].map((owner) => `https://github.com/ndrewtran/muxui/blob/main/packages/react/reference/${inventory.owners[owner]}`);
  for (const record of manifest.families) {
    const links = [...pageOf(await entryOf(record)).querySelectorAll('[data-fact="typed.package"] a')];
    assert.deepEqual(links.map((link) => link.getAttribute('href')), urls, `${record.family} destination links`);
    assert.deepEqual(links.map((link) => link.textContent), ['package-level.json', 'shared.json']);
  }
  // The files hold exactly the exports the inventory gives those two owners.
  const owned = inventory.entries.flatMap((entry) => (entry.exports ?? []).filter(({ owner }) => ['package-level', 'shared'].includes(owner))
    .map(({ name, kind }) => `${entry.key}:${kind === 'type' ? 'type' : 'value'}:${name}`));
  assert.deepEqual([...unownedSubjects()].sort(), owned.sort());
});

/** The generated story module of a family. */
const moduleOf = ({ family, tranche }) => import(`../.storybook/generated/${tranche.replaceAll('.', '-').toLowerCase()}-${slugOf(family)}.stories.mjs`);

test('the Controls describe each prop with its member comment and its declared type, and name a merged part as the owner', async () => {
  let described = 0;
  let typed = 0;
  let undeclared = 0;
  let categories = 0;
  let differing = 0;
  let total = 0;
  for (const record of manifest.families) {
    const module = await moduleOf(record);
    const { api } = catalogOf(record.family);
    const component = ownerFile(ownerOf(record.family)).exports.find(({ name }) => name === record.family);
    // The blocks the adapter reads, root first, as STORY_API_PARTS names them for the family.
    const blocksOfFamily = [
      { member: null, root: true, block: api },
      ...(STORY_API_PARTS[record.family] ?? []).filter((key) => api.partApis?.[key]).map((key) => ({ member: api.partApis[key].member, root: false, block: api.partApis[key] })),
    ];
    // Every non-never declaration of `name` in the owner's parts, and how a Control types it: the one declaration, or where
    // alternatives declare it differently the union of what they accept, written here from the declarations alone.
    const declarations = (owner, name) => component.parts
      .filter(({ member }) => owner.root ? member === null || member === 'Root' : member === owner.member)
      .flatMap((part) => [...(part.members ?? []), ...(part.alternatives ?? []).flatMap((alternative) => alternative.members)])
      .filter((member) => member.name === name && member.never !== true);
    const declaration = (owner, name) => declarations(owner, name)[0];
    const controlType = (owner, name) => {
      const all = declarations(owner, name);
      const types = [...new Set(all.map(({ type }) => type))];
      if (types.length === 1) return types[0];
      if (all.every(({ values }) => values !== undefined)) return [...new Set(all.flatMap(({ values }) => values))].map(literal).join(' | ');
      return types.map((type) => type.includes('=>') ? `(${type})` : type).join(' | ');
    };
    total += module.default.parameters.muxuiApi.props.length;
    for (const name of module.default.parameters.muxuiApi.props) {
      const owner = blocksOfFamily.find((candidate) => candidate.block.props.includes(name) && declaration(candidate, name) !== undefined);
      // The Docs page's Controls come from the primary story, whose own argTypes take precedence over the meta's.
      for (const argTypes of [module.default.argTypes, module.Default?.argTypes].filter(Boolean)) {
        const control = argTypes[name];
        if (owner === undefined) {
          assert.equal(control.description, undefined, `${record.family}.${name} has no declaration, so no description`);
          assert.ok(['MuxUI callback', 'React element', 'function', undefined].includes(control.table.type?.summary), `${record.family}.${name} keeps no invented type`);
          assert.equal(control.table.category, undefined);
          continue;
        }
        const member = declaration(owner, name);
        assert.equal(control.description, member.doc, `${record.family}.${name} description`);
        assert.equal(control.table.type.summary, controlType(owner, name), `${record.family}.${name} type`);
        if (new Set(declarations(owner, name).map(({ type }) => type)).size > 1) differing += 1;
        assert.equal(control.table.category, owner.root ? undefined : `${record.family}.${owner.member}`, `${record.family}.${name} owner`);
      }
      if (owner === undefined) { undeclared += 1; continue; }
      const member = declaration(owner, name);
      typed += 1;
      if (member.doc !== undefined) described += 1;
      if (!owner.root) categories += 1;
    }
  }
  assert.ok(typed > 600 && described > 400, `${typed} Controls rows are typed, ${described} described`);
  // Every Controls row is typed by the model or left alone: the 58 that no part declares belong to authored families.
  assert.equal(undeclared, 58, 'the props of the authored families that no part declares');
  assert.equal(typed + undeclared, total, 'every Controls row is typed or left alone');
  assert.ok(differing > 0, 'some props are declared differently by different alternatives, as Text\'s variant and size are');
  // Menu's popup (six props), list (items) and submenu (delay), which the adapter folds into the root's Controls.
  assert.equal(categories, 8, 'merged-part rows name their owner');
});

test('a Control of a prop that alternatives declare differently offers the union, as Text\'s variant does', async () => {
  const { default: meta } = await moduleOf(manifest.families.find(({ family }) => family === 'Text'));
  // Each alternative declares a part of the variants, so a Control that typed the first one alone would say 'body'.
  assert.equal(meta.argTypes.variant.table.type.summary, "'body' | 'display' | 'heading' | 'title' | 'label' | 'expressive' | 'mono'");
  assert.deepEqual([...meta.argTypes.variant.options].sort(), ['body', 'display', 'expressive', 'heading', 'label', 'mono', 'title'], 'the Control offers every variant the summary names');
  assert.equal(meta.argTypes.size.table.type.summary, "'xs' | 'sm' | 'md' | 'lg'");
  assert.equal(meta.argTypes.variant.table.defaultValue.summary, 'body', 'the catalog still supplies the executed default');
  // A type declared the same everywhere stays as written.
  assert.equal(meta.argTypes.color.table.type.summary, 'TextColor');
});

test('a Controls row without a model has no description, and one with a model but no comment has none either', async () => {
  const { default: meta } = await moduleOf(manifest.families.find(({ family }) => family === 'IconButton'));
  const binding = { export: 'IconButton', api: catalogOf('IconButton').api };
  const without = argTypesForBinding(binding);
  assert.deepEqual(Object.keys(without), storyApi(binding).props);
  for (const control of Object.values(without)) assert.equal(control.description, undefined);
  // IconButton's own `children` has no comment in its declarations, and Controls does not list it.
  assert.equal(meta.argTypes.disabled.description, 'Applies the native disabled attribute: the IconButton is neither focusable nor activatable.');
  assert.equal(meta.argTypes.variant.table.type.summary, 'ButtonVariant');
  assert.equal(meta.argTypes.size.table.defaultValue.summary, 'md', 'the catalog still supplies the executed default');
});

test('the CommandPalette page states which parts need a Root ancestor, and the implementation agrees', async () => {
  const fact = 'Trigger, Backdrop, Close, Input, ListBox, and Item throw outside Root, because they read its context; Root renders without any of them.';
  const named = ['Trigger', 'Backdrop', 'Close', 'Input', 'ListBox', 'Item'];
  // The canonical record says it, so both references do.
  assert.ok(catalogOf('CommandPalette').artifact.bindings['web.react'].behavior.includes(fact));
  const page = pageOf(await entryOf(manifest.families.find(({ family }) => family === 'CommandPalette')));
  assert.ok(texts(page.querySelectorAll('#behavior [data-fact="binding.behavior"] li')).includes(fact));
  // Every part rendered outside a Root: exactly the named ones throw for the missing Root.
  const props = { ListBox: { 'aria-label': 'Results' }, Collection: { items: [], children: () => null }, Item: { id: 'a', title: 'A' } };
  const needsRoot = Object.keys(CommandPalette).filter((part) => {
    try {
      renderToStaticMarkup(h(CommandPalette[part], props[part] ?? {}));
      return false;
    } catch (error) {
      assert.match(error.message, /must be used inside CommandPalette\.Root/u, `${part} fails only for the missing Root`);
      return true;
    }
  });
  assert.deepEqual(needsRoot.sort(), [...named].sort());
  assert.doesNotThrow(() => renderToStaticMarkup(h(CommandPalette.Root, null)), 'Root renders with none of its parts');
});

// ---- The four records the typed reference closes, and what an omission does to the checks ----

const packageFacts = readReactPackageFacts(repositoryRoot);

/** A copy of the declaration reference that `mutate` has changed. Nothing on disk changes. */
function mutatedReference(mutate) {
  const reference = readDeclarationReference(repositoryRoot);
  const copy = { inventory: structuredClone(reference.inventory), files: new Map([...reference.files].map(([owner, file]) => [owner, structuredClone(file)])) };
  mutate(copy);
  return copy;
}

/** The Docs page of `family` as its typed reference reads from `declarations`; generation throws when they no longer agree. */
async function pageFrom(family, declarations) {
  const { artifact, api } = catalogOf(family);
  const typed = typedReference({ share: componentDeclarations({ artifact, packageFacts, declarations }), declarations, packageName, primary: family, api });
  return pageOf({ ...await entryOf(manifest.families.find((record) => record.family === family)), typed });
}

/** The first thing that fails when `mutate` changes the reference: generation, or `check` of the page it renders. Null when nothing does. */
async function failureOf(family, mutate, check = (page) => pageProblems(page, ownerOf(family))) {
  let page;
  try {
    page = await pageFrom(family, mutatedReference(mutate));
  } catch (error) {
    return `generation: ${error.message}`;
  }
  return check(page)[0] ?? null;
}

const partOf = (copy, owner, exportName, member) => copy.files.get(owner).exports.find(({ name }) => name === exportName).parts.find((part) => part.member === member);
const dropExport = (copy, owner, name) => {
  const file = copy.files.get(owner);
  file.exports = file.exports.filter((item) => item.name !== name);
};
const dropInventory = (copy, name) => {
  for (const entry of copy.inventory.entries) if (entry.exports) entry.exports = entry.exports.filter((item) => item.name !== name);
};

const rowsOf = (node) => new Map([...node.querySelectorAll('tr[data-prop]')].map((row) => [row.getAttribute('data-prop'), {
  required: row.querySelector('[data-cell="required"]').firstChild.textContent === 'required',
  type: row.querySelector('[data-cell="type"] > code').textContent,
}]));
const refOf = (node) => node.querySelector('[data-meta="ref"]')?.textContent;
const nativeOf = (node) => node.querySelector('[data-meta="native"]')?.textContent;
const printedType = (page, name) => [...page.querySelectorAll('[data-type]')].find((node) => node.getAttribute('data-type') === name)?.querySelector('pre').textContent;

/** Each pin is what the ledger record asks the page to show, written out here by hand; it lists what differs. */
const pins = {
  'DISCLOSURE-01': (page) => {
    const problems = [];
    const nodes = partNodes(page);
    if (nodes.map((node) => node.getAttribute('data-part')).join() !== 'Disclosure') problems.push('Disclosure has one part and no Title part');
    if ([...page.querySelectorAll('[data-part], [data-export]')].some((node) => /Title$/u.test(node.getAttribute('data-part') ?? node.getAttribute('data-export')))) problems.push('there is a Disclosure.Title');
    const rows = rowsOf(nodes[0]);
    const expected = {
      title: [true, 'React.ReactNode'], children: [false, 'React.ReactNode'], expanded: [false, 'boolean'], defaultExpanded: [false, 'boolean'],
      disabled: [false, 'boolean'], id: [false, 'string'], onExpandedChange: [false, '(expanded: boolean) => void'],
    };
    for (const [name, [required, type]] of Object.entries(expected)) {
      const row = rows.get(name);
      if (row?.required !== required || row?.type !== type) problems.push(`Disclosure ${name} is ${JSON.stringify(row)}, expected ${required ? 'required' : 'optional'} ${type}`);
    }
    if (refOf(nodes[0]) !== 'HTMLDivElement') problems.push(`Disclosure ref is ${refOf(nodes[0])}`);
    return problems;
  },
  'SWITCH-FIELD-01': (page) => {
    const problems = [];
    const expectedRefs = { Root: 'HTMLDivElement', Button: 'HTMLLabelElement', Thumb: 'HTMLSpanElement', Description: 'HTMLElement', Error: 'HTMLElement' };
    for (const [member, ref] of Object.entries(expectedRefs)) {
      const node = partNodes(page).find((candidate) => candidate.getAttribute('data-part') === `SwitchField.${member}`);
      if (refOf(node) !== ref) problems.push(`SwitchField.${member} ref is ${refOf(node)}, expected ${ref}`);
    }
    const root = rowsOf(partNodes(page).find((candidate) => candidate.getAttribute('data-part') === 'SwitchField.Root'));
    for (const [name, type] of [['onChange', '(checked: boolean) => void'], ['name', 'string'], ['value', 'string']]) {
      if (root.get(name)?.type !== type) problems.push(`SwitchField.Root ${name} is ${root.get(name)?.type}, expected ${type}`);
    }
    return problems;
  },
  'TEXT-AREA-01': (page) => {
    const problems = [];
    const part = (label) => partNodes(page).find((candidate) => candidate.getAttribute('data-part') === label);
    if (refOf(part('TextArea.Root')) !== 'HTMLDivElement') problems.push(`TextArea.Root ref is ${refOf(part('TextArea.Root'))}`);
    if (refOf(part('TextArea.TextArea')) !== 'HTMLTextAreaElement') problems.push(`TextArea.TextArea ref is ${refOf(part('TextArea.TextArea'))}`);
    if (nativeOf(part('TextArea.TextArea')) !== 'React.TextareaHTMLAttributes<HTMLTextAreaElement>') problems.push(`TextArea.TextArea native is ${nativeOf(part('TextArea.TextArea'))}`);
    if (rowsOf(part('TextArea.Root')).get('onChange')?.type !== '(value: string) => void') problems.push('TextArea.Root onChange is not (value: string) => void');
    return problems;
  },
  // The 32 exports of @muxui/react/text-editor, each as text-editor-declarations.mjs writes it, which holds them against the source.
  'TEXT-EDITOR-02': (page) => {
    const problems = [];
    const listed = [...page.querySelectorAll('table.muxui-docs-exports tbody tr[data-export]')];
    const subpath = `from '${packageName}/text-editor';`;
    if (!listed.every((row) => row.querySelector('td code').textContent.endsWith(subpath))) problems.push('an export of the text-editor section is not imported from its subpath');
    const shown = listed.map((row) => `${row.querySelector('th').textContent}:${row.querySelectorAll('td')[0].textContent}`).sort();
    const expected = textEditorExports.map((name) => `${name}:${name === 'TextEditor' ? 'component' : name in textEditorFunctions ? 'function' : 'type'}`).sort();
    if (JSON.stringify(shown) !== JSON.stringify(expected)) problems.push(`the exports are ${shown.filter((item) => !expected.includes(item)).join()} instead of ${expected.filter((item) => !shown.includes(item)).join()}`);
    const component = partNodes(page).find((candidate) => candidate.getAttribute('data-part') === 'TextEditor');
    if (refOf(component) !== textEditorRef) problems.push(`TextEditor ref is ${refOf(component)}, expected ${textEditorRef}`);
    const native = `${textEditorNative.type} except ${textEditorNative.omit.join('')}`;
    if (nativeOf(component) !== native) problems.push(`TextEditor native is ${nativeOf(component)}, expected ${native}`);
    const props = [...component.querySelectorAll('tr[data-prop]')].map((row) => [row.getAttribute('data-prop'), row.querySelector('[data-cell="type"] > code').textContent, row.querySelector('[data-cell="required"]').firstChild.textContent]);
    const expectedProps = textEditorProps.map(([name, type]) => [name, type, 'optional']);
    if (JSON.stringify(props) !== JSON.stringify(expectedProps)) problems.push(`the props are ${JSON.stringify(props.filter((row, index) => JSON.stringify(row) !== JSON.stringify(expectedProps[index])))}, expected ${JSON.stringify(expectedProps.filter((row, index) => JSON.stringify(row) !== JSON.stringify(props[index])))}`);
    const root = partNodes(page).find((candidate) => candidate.getAttribute('data-part') === 'TextEditor.Root');
    if (root?.querySelector('[data-meta="same-as"]')?.textContent !== 'TextEditor' || refOf(root) !== textEditorRef || nativeOf(root) !== native) problems.push(`TextEditor.Root is ${root?.querySelector('[data-meta="same-as"]')?.textContent} with ref ${refOf(root)} and native ${nativeOf(root)}`);
    for (const [name, signature] of Object.entries(textEditorFunctions)) {
      const shownSignature = page.querySelector(`div[data-export="${name}"] [data-meta="signature"]`)?.textContent;
      if (shownSignature !== signature) problems.push(`${name} is ${shownSignature}, expected ${signature}`);
    }
    for (const [name, declaration] of Object.entries(textEditorTypes)) {
      const printed = printedType(page, name);
      if (printed !== declaration) problems.push(`type ${name} is printed as ${JSON.stringify(printed)}, expected ${JSON.stringify(declaration)}`);
      const node = [...page.querySelectorAll('[data-type]')].find((candidate) => candidate.getAttribute('data-type') === name);
      if (!texts(node?.querySelectorAll('.muxui-docs-import code') ?? []).includes(`import type { ${name} } from '${packageName}/text-editor';`)) problems.push(`type ${name} does not print its import`);
    }
    return problems;
  },
};

const pinFamilies = { 'DISCLOSURE-01': 'Disclosure', 'SWITCH-FIELD-01': 'SwitchField', 'TEXT-AREA-01': 'TextArea', 'TEXT-EDITOR-02': 'TextEditor' };

test('the four records pin what their pages show, against the shipped declarations where they can be', async () => {
  for (const [record, family] of Object.entries(pinFamilies)) {
    const page = pageOf(await entryOf(manifest.families.find((item) => item.family === family)));
    assert.deepEqual(pins[record](page), [], record);
  }
  // The pinned TextEditor declarations are the source's, read without the reference.
  assert.deepEqual(sourceProblems(repositoryRoot), []);
  assert.equal(textEditorExports.length, 32);
});

test('a model that changes what a record pins fails the pin, as an omission from the reference fails the page checks', async () => {
  const text = (copy, name, change) => { const type = copy.files.get('text-editor').types.find((item) => item.name === name); type.text = change(type.text); };
  const mutations = [
    // The record pins, each broken in the model.
    ['DISCLOSURE-01', 'Disclosure', 'title becomes optional', (copy) => { partOf(copy, 'disclosure', 'Disclosure', null).members.find(({ name }) => name === 'title').optional = true; }],
    ['DISCLOSURE-01', 'Disclosure', 'a Title part appears', (copy) => { const part = partOf(copy, 'disclosure', 'Disclosure', null); copy.files.get('disclosure').exports[0].parts.push({ ...structuredClone(part), member: 'Title' }); }],
    ['SWITCH-FIELD-01', 'SwitchField', 'Button becomes HTMLButtonElement', (copy) => { partOf(copy, 'switch-field', 'SwitchField', 'Button').ref = { type: 'HTMLButtonElement' }; }],
    ['SWITCH-FIELD-01', 'SwitchField', 'Root loses its onChange payload', (copy) => { partOf(copy, 'switch-field', 'SwitchField', 'Root').members.find(({ name }) => name === 'onChange').type = '() => void'; }],
    ['TEXT-AREA-01', 'TextArea', 'the textarea ref becomes HTMLInputElement', (copy) => { partOf(copy, 'text-area', 'TextArea', 'TextArea').ref = { type: 'HTMLInputElement' }; }],
    ['TEXT-AREA-01', 'TextArea', 'the native surface loses its element', (copy) => { partOf(copy, 'text-area', 'TextArea', 'TextArea').natives[0].type = 'React.TextareaHTMLAttributes<HTMLElement>'; }],
    ['TEXT-EDITOR-02', 'TextEditor', 'a helper is deleted', (copy) => { dropExport(copy, 'text-editor', 'isTextEditorDocument'); dropInventory(copy, 'isTextEditorDocument'); }],
    ['TEXT-EDITOR-02', 'TextEditor', 'the selection request loses its promise', (copy) => { const member = partOf(copy, 'text-editor', 'TextEditor', null).members.find(({ name }) => name === 'onSelectionRequest'); member.type = member.type.replace(' | Promise<unknown>', ''); }],
    ['TEXT-EDITOR-02', 'TextEditor', 'a command arm is lost', (copy) => text(copy, 'TextEditorCommand', (value) => value.replace("type: 'image';", "type: 'picture';"))],
    ['TEXT-EDITOR-02', 'TextEditor', 'the selection actions lose close', (copy) => text(copy, 'TextEditorSelectionActions', (value) => value.replace('close(): void;', ''))],
    // A return type, a payload field or a callback changes where only the printed declaration shows it.
    ['TEXT-EDITOR-02', 'TextEditor', 'the handle executes to a number', (copy) => text(copy, 'TextEditorHandle', (value) => value.replace('execute(command: TextEditorCommand): boolean', 'execute(command: TextEditorCommand): number'))],
    ['TEXT-EDITOR-02', 'TextEditor', 'the link command takes a number href', (copy) => text(copy, 'TextEditorCommand', (value) => value.replace("type: 'link';\n  href: string;", "type: 'link';\n  href: number;"))],
    ['TEXT-EDITOR-02', 'TextEditor', 'a selection replace returns a number', (copy) => text(copy, 'TextEditorSelectionActions', (value) => value.replace('replace(content: string | TextEditorDocument): boolean', 'replace(content: string | TextEditorDocument): number'))],
    ['TEXT-EDITOR-02', 'TextEditor', 'a selection action id is a number', (copy) => text(copy, 'TextEditorSelectionAction', (value) => value.replace('id: string;', 'id: number;'))],
    ['TEXT-EDITOR-02', 'TextEditor', 'a type is not exported any more', (copy) => { dropInventory(copy, 'TextEditorMark'); }],
    ['TEXT-EDITOR-02', 'TextEditor', 'onChange reports a string', (copy) => { partOf(copy, 'text-editor', 'TextEditor', null).members.find(({ name }) => name === 'onChange').type = '(value: string) => void'; }],
    ['TEXT-EDITOR-02', 'TextEditor', 'a prop is lost', (copy) => { const part = partOf(copy, 'text-editor', 'TextEditor', null); part.members = part.members.filter(({ name }) => name !== 'limit'); }],
    ['TEXT-EDITOR-02', 'TextEditor', 'the ref is the element', (copy) => { partOf(copy, 'text-editor', 'TextEditor', null).ref = { type: 'HTMLDivElement' }; }],
    ['TEXT-EDITOR-02', 'TextEditor', 'the native surface keeps onChange', (copy) => { partOf(copy, 'text-editor', 'TextEditor', null).natives[0].omit.pop(); }],
    ['TEXT-EDITOR-02', 'TextEditor', 'Root stops being an alias', (copy) => { delete partOf(copy, 'text-editor', 'TextEditor', 'Root').sameAs; }],
    ['TEXT-EDITOR-02', 'TextEditor', 'a function returns a number', (copy) => { const item = copy.files.get('text-editor').exports.find(({ name }) => name === 'normalizeTextEditorDocument'); item.signature = item.signature.replace('): TextEditorDocument', '): number'); }],
  ];
  for (const [record, family, name, mutate] of mutations) {
    assert.notEqual(await failureOf(family, mutate, pins[record]), null, `${record}: ${name} must fail its pin`);
  }
  // The pinned declarations are held against the source: a source that declares any of them differently fails that check.
  const source = readFileSync(resolve(repositoryRoot, 'packages/react/src/text-editor/index.ts'), 'utf8');
  for (const [from, to] of [
    ['execute(command: TextEditorCommand): boolean', 'execute(command: TextEditorCommand): number'],
    ["{ type: 'link'; href: string }", "{ type: 'link'; href: number }"],
    ['replace(content: string | TextEditorDocument): boolean;', 'replace(content: string | TextEditorDocument): number;'],
    ['  id: string;\n  label: string;', '  id: number;\n  label: string;'],
    ['limit?: number;', 'limit?: string;'],
    ['export function isTextEditorDocument(value: unknown): value is TextEditorDocument', 'export function isTextEditorDocument(value: unknown): boolean'],
    ['RefAttributes<TextEditorHandle>', 'RefAttributes<HTMLDivElement>'],
  ]) {
    assert.ok(source.includes(from), `the source holds ${from}`);
    assert.notDeepEqual(sourceProblems(repositoryRoot, source.replace(from, to)), [], `a source with ${to} must fail the source check`);
  }
  // Negative control: an untouched copy passes both.
  for (const [record, family] of Object.entries(pinFamilies)) {
    assert.equal(await failureOf(family, () => {}, pins[record]), null, `${record} passes on the committed reference`);
    assert.equal(await failureOf(family, () => {}), null, `${family} passes the page checks on the committed reference`);
  }
});

test('deleting a part, a hook, a helper, a ref or an import from a copy of the reference fails the checks', async () => {
  const cases = [
    ['a part', 'SwitchField', (copy) => { const record = copy.files.get('switch-field').exports.find(({ name }) => name === 'SwitchField'); record.parts = record.parts.filter(({ member }) => member !== 'Thumb'); }],
    ['a hook from the file', 'Toast', (copy) => dropExport(copy, 'toast', 'useToast')],
    ['a hook from the inventory', 'Toast', (copy) => dropInventory(copy, 'useToast')],
    ['a helper from the file', 'TextEditor', (copy) => dropExport(copy, 'text-editor', 'normalizeTextEditorDocument')],
    ['a helper from the inventory', 'TextEditor', (copy) => dropInventory(copy, 'normalizeTextEditorDocument')],
    ['a flat part', 'Resizable', (copy) => dropExport(copy, 'resizable', 'ResizablePanel')],
    ['a ref', 'SwitchField', (copy) => { delete partOf(copy, 'switch-field', 'SwitchField', 'Button').ref; }],
    ['a ref of an alternative', 'Virtualizer', (copy) => { delete copy.files.get('virtualizer').exports[0].parts[0].alternatives[0].ref; }],
    ['an import', 'TextEditor', (copy) => { copy.inventory.entries.find(({ key }) => key === './text-editor').key = './editor'; }],
    ['an exported type', 'IconButton', (copy) => { const file = copy.files.get('icon-button'); file.types = file.types.filter(({ name }) => name !== 'IconButtonProps'); }],
    ['an alternative', 'Dialog', (copy) => { partOf(copy, 'dialog', 'Dialog', null).alternatives.pop(); }],
    ['a member', 'IconButton', (copy) => { const part = partOf(copy, 'icon-button', 'IconButton', null); part.members = part.members.filter(({ name }) => name !== 'size'); }],
    ['a generic', 'Text', (copy) => { delete partOf(copy, 'text', 'Text', null).typeParameters; }],
    ['a member declared never from a part with no alternatives', 'DataDiff', (copy) => { const part = partOf(copy, 'data-diff', 'DataDiff', null); part.members = part.members.filter(({ name }) => name !== 'dangerouslySetInnerHTML'); }],
    ['the ref of the part an alias is the same as', 'TextEditor', (copy) => { delete partOf(copy, 'text-editor', 'TextEditor', null).ref; }],
    ['the native surface of the part an alias is the same as', 'TextEditor', (copy) => { partOf(copy, 'text-editor', 'TextEditor', null).natives[0].omit.pop(); }],
    ['an alias that names no part', 'TextEditor', (copy) => { partOf(copy, 'text-editor', 'TextEditor', 'Root').sameAs = 'Nowhere'; }],
    ['the never of a member of a part with no alternatives', 'DataDiff', (copy) => { delete partOf(copy, 'data-diff', 'DataDiff', null).members.find(({ name }) => name === 'children').never; }],
  ];
  for (const [name, family, mutate] of cases) {
    assert.notEqual(await failureOf(family, mutate), null, `deleting ${name} must fail the page checks`);
  }

  // The public surface inventory finds the same omissions in the pages taken together.
  const pages = await allPages();
  const swap = async (family, mutate) => {
    const index = manifest.families.findIndex((record) => record.family === family);
    const copy = [...pages];
    try {
      copy[index] = await pageFrom(family, mutatedReference(mutate));
    } catch {
      return null;
    }
    return coverageProblems(copy).problems;
  };
  assert.deepEqual(coverageProblems(pages).problems, [], 'the committed pages cover the public surface');
  for (const [name, family, mutate, expected] of [
    ['a part', 'SwitchField', cases[0][2], '.:part:SwitchField.Thumb is on no page'],
    ['a hook', 'Toast', cases[2][2], '.:value:useToast is on no page'],
    ['a helper', 'TextEditor', cases[4][2], './text-editor:value:normalizeTextEditorDocument is on no page'],
    ['an import', 'TextEditor', cases[8][2], './editor:value:TextEditor is not in the public surface'],
  ]) {
    const problems = await swap(family, mutate);
    assert.ok(problems === null || problems.includes(expected), `${name}: ${expected} (got ${JSON.stringify(problems)})`);
    assert.notEqual(problems === null ? 'generation fails' : problems.length === 0 ? null : 'problems', null, name);
  }
});
