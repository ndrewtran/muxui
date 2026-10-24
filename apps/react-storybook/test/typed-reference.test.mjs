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

/** The rows a part's table should hold, as groups, from the part's members and alternatives alone. */
function expectedGroups(part) {
  const row = (member) => ({
    name: member.name,
    required: member.optional !== true,
    type: member.type,
    values: member.values !== undefined && member.values.map(literal).join(' | ') !== member.type ? member.values.map(literal).join(' | ') : null,
    doc: member.doc ?? '',
  });
  const alternatives = part.alternatives ?? [];
  if (alternatives.length === 0) return [{ rows: (part.members ?? []).map(row), notAllowed: [], notDeclared: [], ref: null, native: null }];
  const declared = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))];
  const refText = (ref) => ref === undefined ? null : ref === null ? 'none declared' : ref.never === true ? `not allowed, ${ref.required === true ? 'ref: never' : 'ref?: never'}` : ref.type;
  const nativeText = (natives) => natives === undefined ? null : natives.map(({ type, omit }) => `${type}${omit?.length > 0 ? ` except ${omit.join('')}` : ''}`).join('');
  return [
    ...((part.members ?? []).length > 0 ? [{ rows: part.members.map(row), notAllowed: [], notDeclared: [], ref: null, native: null }] : []),
    ...alternatives.map(({ members, ref, natives }) => ({
      rows: members.filter(({ never }) => never !== true).map(row),
      notAllowed: members.filter(({ never }) => never === true).map(({ name }) => name),
      notDeclared: declared.filter((name) => !members.some((member) => member.name === name)),
      ref: refText(ref),
      native: nativeText(natives),
    })),
  ];
}

/** The groups a rendered part table holds, read the same way. */
function renderedGroups(partNode) {
  return [...partNode.querySelectorAll('table.muxui-docs-table tbody')].map((body) => ({
    rows: [...body.querySelectorAll('tr[data-prop]')].map((row) => ({
      name: row.getAttribute('data-prop'),
      required: row.querySelector('[data-cell="required"]').firstChild.textContent === 'required',
      type: row.querySelector('[data-cell="type"] > code').textContent,
      values: row.querySelector('[data-cell="type"] .muxui-docs-values')?.textContent ?? null,
      doc: row.querySelector('[data-cell="description"]').textContent,
    })),
    notAllowed: (body.querySelector('tr[data-not-allowed]')?.getAttribute('data-not-allowed') ?? '').split(',').filter(Boolean),
    notDeclared: (body.querySelector('tr[data-not-declared]')?.getAttribute('data-not-declared') ?? '').split(',').filter(Boolean),
    // An alternative's own ref and native envelope sit in its group's heading.
    ref: [...body.querySelectorAll('.muxui-docs-group-ref')].map((node) => node.textContent).find((value) => value.startsWith('Ref '))?.slice(4) ?? null,
    native: [...body.querySelectorAll('.muxui-docs-group-ref')].map((node) => node.textContent).find((value) => value.startsWith('Native '))?.slice(7) ?? null,
  }));
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
    const alternativeRefs = (part.alternatives ?? []).some((alternative) => alternative.ref !== undefined);
    if (part.ref !== undefined && part.ref !== null && part.ref.never !== true && meta('ref')?.textContent !== part.ref.type) problems.push(`${label} ref is ${meta('ref')?.textContent}, expected ${part.ref.type}`);
    if (part.ref?.never === true && !meta('ref')?.textContent.includes(part.ref.required === true ? 'ref: never' : 'ref?: never')) problems.push(`${label} ref should be never`);
    if ((part.ref === undefined || part.ref === null) && !alternativeRefs && meta('ref')?.textContent !== 'none declared') problems.push(`${label} should say it declares no ref`);
    const natives = (part.natives ?? []).map(({ type, omit }) => `${type}${omit?.length > 0 ? ` except ${omit.join('')}` : ''}`).join('');
    if (part.natives !== undefined && meta('native')?.textContent !== natives) problems.push(`${label} native is ${meta('native')?.textContent}, expected ${natives}`);
    const generics = (part.typeParameters ?? []).map(({ name, constraint, default: fallback }) => `${name}${constraint ? ` extends ${constraint}` : ''}${fallback ? ` = ${fallback}` : ''}`).join(', ');
    if (meta('generics')?.textContent !== (part.typeParameters === undefined ? undefined : generics)) problems.push(`${label} generics are ${meta('generics')?.textContent}`);
    if (part.sameAs !== undefined) {
      if (meta('same-as')?.textContent !== `${record.name}.${part.sameAs}` || node.querySelector('table') !== null) problems.push(`${label} should be the same as ${part.sameAs} and list no table`);
      continue;
    }
    const expected = expectedGroups(part);
    const rendered = renderedGroups(node);
    if (JSON.stringify(rendered) !== JSON.stringify(expected)) {
      const at = expected.findIndex((group, index) => JSON.stringify(group) !== JSON.stringify(rendered[index]));
      problems.push(`${label} table differs in group ${at}: rendered ${JSON.stringify(rendered[at])}, expected ${JSON.stringify(expected[at])}`);
    }
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

  // The optional `never` explanation appears on a page that has one, and only there.
  assert.ok((await page('Virtualizer')).querySelector('[data-fact="typed.never"]'));
  assert.equal((await page('Button')).querySelector('[data-fact="typed.never"]'), null);
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
  for (const record of manifest.families) {
    const module = await moduleOf(record);
    const { api } = catalogOf(record.family);
    const component = ownerFile(ownerOf(record.family)).exports.find(({ name }) => name === record.family);
    // The blocks the adapter reads, root first, as STORY_API_PARTS names them for the family.
    const blocksOfFamily = [
      { member: null, root: true, block: api },
      ...(STORY_API_PARTS[record.family] ?? []).filter((key) => api.partApis?.[key]).map((key) => ({ member: api.partApis[key].member, root: false, block: api.partApis[key] })),
    ];
    const declaration = (owner, name) => component.parts
      .filter(({ member }) => owner.root ? member === null || member === 'Root' : member === owner.member)
      .flatMap((part) => [...(part.members ?? []), ...(part.alternatives ?? []).flatMap((alternative) => alternative.members)])
      .find((member) => member.name === name && member.never !== true);
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
        assert.equal(control.table.type.summary, member.type, `${record.family}.${name} type`);
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
  // The 60 catalog props no part declares, less Menu's open and defaultOpen, which its Root part does.
  assert.equal(undeclared, 58, 'the props of the authored families that no part declares');
  // Menu's popup (six props), list (items) and submenu (delay), which the adapter folds into the root's Controls.
  assert.equal(categories, 8, 'merged-part rows name their owner');
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
  'TEXT-EDITOR-02': (page) => {
    const problems = [];
    const fixture = readJson('packages/react/test/fixtures/public-surface-inventory.json').baseline['./text-editor'];
    const listed = [...page.querySelectorAll('table.muxui-docs-exports tbody tr[data-export]')];
    const subpath = `from '${packageName}/text-editor';`;
    if (listed.length !== 32 || !listed.every((row) => row.querySelector('td code').textContent.endsWith(subpath))) problems.push(`the text-editor section lists ${listed.length} exports, not all 32 from its subpath`);
    const names = listed.map((row) => row.querySelector('th').textContent).sort();
    const expectedNames = [...fixture.types, ...fixture.values].sort();
    if (JSON.stringify(names) !== JSON.stringify(expectedNames)) problems.push(`the exports differ from the inventory: ${names.filter((name) => !expectedNames.includes(name)).concat(expectedNames.filter((name) => !names.includes(name)))}`);
    const signature = (name) => page.querySelector(`div[data-export="${name}"] [data-meta="signature"]`)?.textContent;
    if (signature('isTextEditorDocument') !== 'isTextEditorDocument(value: unknown): value is TextEditorDocument') problems.push(`isTextEditorDocument is ${signature('isTextEditorDocument')}`);
    if (signature('normalizeTextEditorDocument') !== 'normalizeTextEditorDocument(value: unknown): TextEditorDocument') problems.push(`normalizeTextEditorDocument is ${signature('normalizeTextEditorDocument')}`);
    const command = printedType(page, 'TextEditorCommand') ?? '';
    for (const arm of ["type: 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock' | 'unlink' | 'generate'", "type: 'align'", "type: 'color'", "type: 'fontFamily'", "type: 'fontSize'", "type: 'link'", "type: 'image'"]) {
      if (!command.includes(arm)) problems.push(`TextEditorCommand lacks ${arm}`);
    }
    const actions = printedType(page, 'TextEditorSelectionActions') ?? '';
    for (const member of ['readonly selection', 'readonly signal: AbortSignal', 'replace(', 'insertAfter(', 'close(): void']) {
      if (!actions.includes(member)) problems.push(`TextEditorSelectionActions lacks ${member}`);
    }
    const props = rowsOf(partNodes(page).find((candidate) => candidate.getAttribute('data-part') === 'TextEditor'));
    for (const [name, type] of Object.entries({
      onLinkRequest: '(actions: TextEditorActionCallbacks) => void',
      onImageRequest: '(actions: { insertImage(src: string, alt?: string): boolean }) => void',
      onColorRequest: '(actions: { setColor(value: string): boolean }) => void',
      onGenerate: '() => void',
      onSelectionRequest: '(request: TextEditorSelectionRequest, actions: TextEditorSelectionActions) => void | Promise<unknown>',
    })) {
      if (props.get(name)?.type !== type) problems.push(`TextEditor ${name} is ${props.get(name)?.type}`);
    }
    if (refOf(partNodes(page).find((candidate) => candidate.getAttribute('data-part') === 'TextEditor')) !== 'TextEditorHandle') problems.push('TextEditor ref is not TextEditorHandle');
    return problems;
  },
};

const pinFamilies = { 'DISCLOSURE-01': 'Disclosure', 'SWITCH-FIELD-01': 'SwitchField', 'TEXT-AREA-01': 'TextArea', 'TEXT-EDITOR-02': 'TextEditor' };

test('the four records pin what their pages show, against the shipped declarations where they can be', async () => {
  for (const [record, family] of Object.entries(pinFamilies)) {
    const page = pageOf(await entryOf(manifest.families.find((item) => item.family === family)));
    assert.deepEqual(pins[record](page), [], record);
  }
  // The pinned TextEditor signatures are the ones the package ships, read without the reference.
  const shipped = readFileSync(resolve(repositoryRoot, 'packages/react/generated/text-editor.d.ts'), 'utf8').replace(/[\s;]+/gu, '');
  for (const text of [
    'onLinkRequest?:(actions:TextEditorActionCallbacks)=>void',
    'onImageRequest?:(actions:{insertImage(src:string,alt?:string):boolean})=>void',
    'onColorRequest?:(actions:{setColor(value:string):boolean})=>void',
    'onGenerate?:()=>void',
    'onSelectionRequest?:(request:TextEditorSelectionRequest,actions:TextEditorSelectionActions)=>void|Promise<unknown>',
    'declarefunctionisTextEditorDocument(value:unknown):valueisTextEditorDocument',
    'declarefunctionnormalizeTextEditorDocument(value:unknown):TextEditorDocument',
  ]) assert.ok(shipped.includes(text), `the shipped declarations say ${text}`);
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
  ];
  for (const [record, family, name, mutate] of mutations) {
    assert.notEqual(await failureOf(family, mutate, pins[record]), null, `${record}: ${name} must fail its pin`);
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
