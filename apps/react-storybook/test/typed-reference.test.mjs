import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComponentDocs } from '../.storybook/component-docs-page.mjs';
import manifest from '../.storybook/generated/manifest.mjs';
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
  if (alternatives.length === 0) return [{ rows: (part.members ?? []).map(row), notAllowed: [], notDeclared: [] }];
  const declared = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))];
  return [
    ...((part.members ?? []).length > 0 ? [{ rows: part.members.map(row), notAllowed: [], notDeclared: [] }] : []),
    ...alternatives.map(({ members }) => ({
      rows: members.filter(({ never }) => never !== true).map(row),
      notAllowed: members.filter(({ never }) => never === true).map(({ name }) => name),
      notDeclared: declared.filter((name) => !members.some((member) => member.name === name)),
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
