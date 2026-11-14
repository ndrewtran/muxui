// Decision 0031 item 19: every documented class is emitted, on the right element, in a fixture of its own family. The part map says
// which class each of the 457 anatomy entries carries; this test renders the family and looks for `selectorOf(row)` in what it
// rendered. 19 rows have no element (`none`). The other 438 are proven by
//   - the family's canonical examples, server-rendered (314 rows), or else
//   - an explicit fixture of support/styling-fixtures.mjs in the state that shows the part: invalid, open, with a selection (124 rows).
// A fixture of another family never proves a row (a class on a DatePicker's button does not prove the button's own part), a
// fixture that throws or logs a React error fails, and so does a row that no fixture reaches, an unknown row, and a fixture for a
// family the table lacks. The classes every fixture renders are also held to the closed vocabulary, which is the check that sees
// a name built at run time (see styling-tokens.test.mjs for the same grammar on CSS and source), each against only the exemptions of
// its own example (a runtime fixture has none). The canonical examples are held to the same standard as the fixtures: a React
// warning or an exception while one renders fails.
// The same renders prove the other half of the class rule: every native element a component renders carries a Mux UI class
// (support/unclassed-elements.mjs). The examples' JSX and the fixtures' `h` mark the elements the caller creates, so an unmarked
// element without a class is Mux UI's own or a library's, and the exceptions are listed there with their reasons and the rules that
// keep the host's element-type rules out of them (the host-independence browser test compares them across a bare and a host page).
// The fixtures cover the states the examples do not render (an open menu, an empty table, an editor with a document). A scan of the
// source (support/unclassed-sources.mjs) covers the rest: every state of every call that creates a native element with a literal tag.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { renderToString } from 'react-dom/server';
import * as M from '../generated/index.mjs';
import { Markdown } from '../generated/markdown.js';
import { TextEditor } from '../generated/text-editor.js';
import { captured, renderCatalogExamples } from './support/catalog-example-renders.mjs';
import { classGrammar, emittedFindings, readAuthored, vocabularyFindings } from './support/class-vocabulary.mjs';
import { renderClientFixture } from './support/render-client-fixture.mjs';
import { readCatalog } from './support/styling-inventory.mjs';
import { callerElementFixtures, clientFixtures, hookOnlyFixtures } from './support/styling-fixtures.mjs';
import { partRows, selectorOf } from './support/styling-parts.ts';
import { markCaller, unclassableElements, unclassedElements } from './support/unclassed-elements.mjs';
import { unclassedSites } from './support/unclassed-sources.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const catalog = await readCatalog(repositoryRoot);
const slugs = [...catalog.anatomy.keys()];
const isClass = classGrammar(slugs);
// `h` marks the elements a fixture creates as the caller's, as the examples' JSX is marked, so the markup tells them from Mux UI's own.
const lib = { h: markCaller(React.createElement), M, TextEditor, Markdown };
const rowKey = (row) => `${row.family}.${row.part}`;

// Tier 1: every canonical example of every family, server-rendered (support/catalog-example-renders.mjs).
const examples = await renderCatalogExamples(slugs, { markCallerElements: true });
const documentOf = (html) => new JSDOM(`<!doctype html><body>${html}`).window.document;
const exampleDocuments = examples.map((example) => ({ ...example, document: documentOf(example.html) }));

// Tiers 2 to 4: a fixture is client-rendered in a fresh jsdom window, driven by its steps (support/render-client-fixture.mjs), and the
// family's selectors are looked for after the render and after each step (an overlay closes, a toast leaves). A console error is a
// failure, never a skipped row.
async function renderFixture(fixture, selectors) {
  const matched = new Set();
  const classes = new Set();
  const unclassed = new Set();
  const { errors } = await renderClientFixture(fixture, lib, (document) => {
    for (const selector of selectors) if (document.querySelector(selector) !== null) matched.add(selector);
    for (const node of document.querySelectorAll('[class]')) for (const name of node.classList) if (name.startsWith('muxui-')) classes.add(name);
    for (const finding of unclassedElements(document.body, { isClass })) unclassed.add(finding);
  });
  return { matched, classes, unclassed, errors };
}

const rowsOf = (family) => partRows.filter((row) => row.family === family && row.disposition !== 'none');
const fixtureRuns = [];
for (const fixture of clientFixtures) {
  const rows = rowsOf(fixture.family);
  const selectors = rows.map(selectorOf);
  fixtureRuns.push({ ...fixture, ...(await renderFixture(fixture, selectors)) });
}
const hookOnlyRuns = [];
for (const [key, fixture] of Object.entries(hookOnlyFixtures)) {
  const row = partRows.find((candidate) => rowKey(candidate) === key);
  hookOnlyRuns.push({ key, ...fixture, row, ...(await renderFixture(fixture, row ? [selectorOf(row)] : [])) });
}

/** What a family's fixtures show: each is a name and a test for a selector. Only the row's own family is ever consulted. */
const observationsOf = (documents, runs) => {
  const byFamily = new Map();
  const add = (family, entry) => byFamily.set(family, [...(byFamily.get(family) ?? []), entry]);
  for (const { family, name, document } of documents) add(family, { name, matches: (selector) => document.querySelector(selector) !== null });
  for (const { family, name, matched } of runs) add(family, { name, matches: (selector) => matched.has(selector) });
  return byFamily;
};
const observations = observationsOf(exampleDocuments, fixtureRuns);

/** The rows with an element that no fixture of the row's own family reaches, each with the fixtures tried. */
function unprovenRows(rows, byFamily) {
  const failures = [];
  for (const row of rows) {
    if (row.disposition === 'none') continue;
    const selector = selectorOf(row);
    const tried = byFamily.get(row.family) ?? [];
    if (!tried.some(({ matches }) => matches(selector))) {
      failures.push(`${rowKey(row)}: ${selector} is in none of ${tried.length} fixtures (${tried.slice(0, 6).map(({ name }) => name).join(', ')}${tried.length > 6 ? ', ...' : ''})`);
    }
  }
  return failures;
}

test('every part-map row with an element is emitted by a fixture of its own family', () => {
  assert.deepEqual(unprovenRows(partRows, observations), []);
  // 438 rows with an element: 314 by canonical examples (including Sidebar's Divider, NavButton and FeatureCard), 124 by an explicit fixture.
  const withElement = partRows.filter((row) => row.disposition !== 'none');
  const byExample = withElement.filter((row) => exampleDocuments.some(({ family, document }) => family === row.family && document.querySelector(selectorOf(row)) !== null));
  assert.deepEqual([withElement.length, byExample.length, withElement.length - byExample.length], [438, 314, 124]);
  assert.equal(exampleDocuments.length, 220);
});

test('every row that has no element says why, and no fixture stands in for one', () => {
  const none = partRows.filter((row) => row.disposition === 'none');
  assert.equal(none.length, 19);
  for (const row of none) assert.ok(row.reason && selectorOf(row) === undefined, `${rowKey(row)} names a reason and no selector`);
});

test('no example or fixture throws or logs a React warning or error, and every fixture belongs to a family of the part map and says what it shows', () => {
  assert.deepEqual(examples.concat(fixtureRuns, hookOnlyRuns).filter(({ errors }) => errors.length > 0).map(({ name, errors }) => `${name}: ${errors[0]}`), []);
  // The capture sees what it should: an unkeyed list, an exception and a console.warn each count, and the console is restored.
  const { error, warn } = console;
  const unkeyed = captured(() => renderToString(React.createElement(() => [React.createElement('b'), React.createElement('b')])));
  assert.match(unkeyed.messages.join(), /unique "key" prop/u);
  assert.match(captured(() => { throw new Error('boom'); }).messages.join(), /threw: boom/u);
  assert.deepEqual(captured(() => { console.warn('careful'); return ''; }).messages, ['careful']);
  assert.ok(console.error === error && console.warn === warn, 'the console is restored');
  const families = new Set(partRows.map((row) => row.family));
  const names = new Set();
  for (const { family, name, state } of fixtureRuns) {
    assert.ok(families.has(family), `${name}: ${family} is not a family of the part map`);
    assert.ok(state, `${name} records the state it covers`);
    assert.ok(!names.has(`${family} ${name}`), `${name} is listed twice`);
    names.add(`${family} ${name}`);
  }
});

test('every hookOnly row has a fixture that emits it, and no other row has one', () => {
  const hookOnly = partRows.filter((row) => row.hookOnly !== undefined).map(rowKey).sort();
  assert.deepEqual(Object.keys(hookOnlyFixtures).sort(), hookOnly);
  for (const { key, row, matched } of hookOnlyRuns) assert.ok(row && matched.has(selectorOf(row)), `${key}: ${selectorOf(row)} is emitted by its fixture`);
});

test('every class a fixture renders is in the closed vocabulary and spelled by CSS or source, each against its own exemptions', async () => {
  const authored = await readAuthored(packageRoot);
  const { findings, spelled } = vocabularyFindings({ css: authored.css, sources: authored.sources, slugs });
  assert.deepEqual(findings, []);
  const classesOf = (document) => new Set([...document.querySelectorAll('[class]')].flatMap((node) => [...node.classList]).filter((name) => name.startsWith('muxui-')));
  // An example may define classes for itself in a <style> block (NumberField's sizing example); no other example or fixture may use them.
  const emitted = new Set();
  const problems = [];
  for (const { name, document, owned } of exampleDocuments) {
    const classes = classesOf(document);
    for (const each of classes) emitted.add(each);
    problems.push(...emittedFindings(classes, { spelled, slugs, owned }).map((finding) => `${name}: ${finding}`));
  }
  for (const { name, classes } of fixtureRuns.concat(hookOnlyRuns)) {
    for (const each of classes) emitted.add(each);
    problems.push(...emittedFindings(classes, { spelled, slugs }).map((finding) => `${name}: ${finding}`));
  }
  assert.ok(emitted.size > 500, `the fixtures render ${emitted.size} distinct classes`);
  assert.deepEqual(problems, []);
  // Controls: a legacy dash class and a class nothing spells fail; so does an exemption that belongs to another example.
  const check = (names, owned) => emittedFindings(new Set([...emitted, ...names]), { spelled, slugs, owned }).join();
  assert.match(check(['muxui-separator-vertical']), /emitted muxui-separator-vertical is not a valid class/u);
  assert.match(check(['muxui-tabs__ghost']), /emitted muxui-tabs__ghost is not spelled by CSS or source/u);
  const sizing = exampleDocuments.find(({ owned }) => owned.has('muxui-number-field-sizing-case'));
  assert.ok(sizing, 'the NumberField sizing example defines a class for itself');
  assert.equal(emittedFindings(classesOf(sizing.document), { spelled, slugs, owned: sizing.owned }).length, 0);
  assert.match(emittedFindings(classesOf(sizing.document), { spelled, slugs }).join(), /emitted muxui-number-field-sizing-case is not a valid class/u);
  const card = exampleDocuments.find(({ family }) => family === 'card');
  const injected = new Set([...classesOf(card.document), 'muxui-number-field-sizing-case']);
  assert.match(emittedFindings(injected, { spelled, slugs, owned: card.owned }).join(), /emitted muxui-number-field-sizing-case is not a valid class/u);
});

test('every element a component renders carries a Mux UI class, in each example and in each state a fixture shows', () => {
  // One line per distinct element, with how many times it appears and where it first does.
  const seen = new Map();
  const note = (name, findings) => findings.forEach((finding) => seen.set(finding, { count: (seen.get(finding)?.count ?? 0) + 1, first: seen.get(finding)?.first ?? name }));
  for (const { name, document } of exampleDocuments) note(name, unclassedElements(document.body, { isClass }));
  for (const { name, unclassed } of fixtureRuns.concat(hookOnlyRuns)) note(name, [...unclassed]);
  assert.deepEqual([...seen].map(([finding, { count, first }]) => `${finding} (${count}, first in ${first})`).sort(), []);
});

test('no source creates a native element without a className, in any state', async () => {
  const { sources } = await readAuthored(packageRoot);
  assert.deepEqual(unclassedSites(sources), []);
  // The check sees a bare element, an element with props and no className, and an element of an aliased creator; it passes a classed
  // element, an svg internal, and props it cannot read.
  const mutant = `import { h } from './part-utils.ts';
    const e = React.createElement;
    e('li', null, 'a'); e('li', { key: 1 }, 'b'); h('span', { 'aria-hidden': true }); React.createElement(cond ? 'th' : 'td', { scope: 'row' });
    e('li', { className: 'x' }); e('path', { d: 'M0' }); e('div', { ...props }); e('div', rootProps); e(Item, null);`;
  assert.deepEqual(unclassedSites({ 'mutant.ts': mutant }), ['mutant.ts:3 <li>', 'mutant.ts:3 <li>', 'mutant.ts:3 <span>', 'mutant.ts:3 <th|td>']);
});

test('the rendered class check sees an unmarked unclassed element and a lost class, and excepts only a library\'s own wrappers', async () => {
  const check = (html, root = documentOf(html).body) => unclassedElements(root, { isClass });
  const caller = '<p data-caller="">own</p>';
  assert.deepEqual(check(`<div class="muxui-card">${caller}<ul class="muxui-card__list"><li class="muxui-card__item">a</li></ul></div>`), []);
  assert.deepEqual(check('<div class="muxui-card"><ul class="muxui-card__list"><li>a</li></ul></div>'), ['<li> in <ul.muxui-card__list>']);
  assert.deepEqual(check('<div class="muxui-card"><span class="not-mux">a</span></div>'), ['<span> in <div.muxui-card>']);
  // An svg internal passes under a classed svg and fails under an unclassed one.
  assert.deepEqual(check('<svg class="muxui-icon"><path d="M0"></path></svg>'), []);
  assert.deepEqual(check('<svg><path d="M0"></path></svg>'), ['<svg> in <body>', '<path> in <svg>']);
  // A hidden exception covers what is below it; a wrapper that holds parts or content is excepted by the library's signature only.
  assert.deepEqual(check('<span hidden="" data-focus-scope-start="true"></span><template></template>'), []);
  assert.deepEqual(check('<div style="border:0;clip-path:inset(50%)"><p>Heading</p></div>'), []);
  assert.deepEqual(check('<table class="muxui-calendar__grid"><tbody class="muxui-calendar__grid-body"><tr><td><div class="muxui-calendar__cell">1</div></td></tr></tbody></table>'), []);
  assert.deepEqual(check('<table class="muxui-data-diff__table"><tbody class="muxui-data-diff__body"><tr><td class="muxui-data-diff__cell">1</td></tr></tbody></table>'), ['<tr> in <tbody.muxui-data-diff__body>']);
  const wrapper = '<div data-overlay-container="true"><div class="muxui-tooltip">Tip</div></div>';
  assert.deepEqual(check(wrapper), []);
  assert.deepEqual(check('<ol class="react-aria-ToastList"><li style="display: contents;">x</li></ol>'), []);
  assert.deepEqual(check('<div role="gridcell" style="display:contents">Text</div>'), []);
  // The same wrapper without the library's signature is Mux UI's own element, and needs a class.
  assert.deepEqual(check('<div><div class="muxui-tooltip">Tip</div></div>'), ['<div> in <body>']);
  // Every exception says why, and is exactly one of invisible, boxless, or kept off the host by rules whose selectors the source CSS spells.
  assert.ok(unclassableElements.every(({ name, reason, ...kinds }) => name && reason.length > 40
    && [kinds.hidden, kinds.boxless, kinds.rules].filter((kind) => kind !== undefined).length === 1));
  const sourceCss = Object.values((await readAuthored(packageRoot)).css).join('\n');
  for (const { name, rules = [] } of unclassableElements) {
    for (const selector of rules) assert.ok(sourceCss.includes(selector), `${name}: the source CSS has no rule for ${selector}`);
  }
});

test('a composed row whose element can be the caller\'s says so, and exactly the rows with such a fixture do', () => {
  const flagged = partRows.filter((row) => row.callerSupplied !== undefined).map(rowKey).sort();
  assert.deepEqual(Object.keys(callerElementFixtures).sort(), flagged);
  for (const [key, fixture] of Object.entries(callerElementFixtures)) {
    const row = partRows.find((candidate) => rowKey(candidate) === key);
    assert.ok(row?.composedOf, `${key} is a composed row`);
    const root = `muxui-${row.composedOf}`;
    const pick = (build) => {
      const { html, messages } = captured(() => renderToString(build(lib)));
      assert.deepEqual(messages, [], `${key} renders without a warning`);
      return documentOf(html).querySelector(selectorOf(row));
    };
    // The Mux-rendered element carries the composed root class; the caller's native button carries the hook and not that class.
    assert.ok(pick(fixture.mux)?.classList.contains(root), `${key}: the Mux element carries ${root}`);
    const native = pick(fixture.native);
    assert.ok(native !== null && native.localName === 'button', `${key}: the caller's button carries the hook`);
    assert.ok(!native.classList.contains(root), `${key}: the caller's button does not carry ${root}`);
  }
});

test('the emission check refuses a missing fixture, another family\'s fixture, an unknown row and a lost qualifier', () => {
  const without = (family) => new Map([...observations].filter(([key]) => key !== family));
  const unproven = (rows, byFamily = observations) => unprovenRows(rows, byFamily).join('\n');
  // A family with no fixture fails for every row with an element, and names the fixtures it tried.
  assert.match(unproven(partRows, without('lightbox')), /lightbox\.backdrop: \.muxui-lightbox__backdrop is in none of 0 fixtures/u);
  assert.match(unproven(partRows, new Map([...observations, ['lightbox', observations.get('lightbox').filter(({ name }) => !/open/u.test(name))]])), /lightbox\.popup/u);
  // A fixture of another family proves nothing: the DatePicker's button is not a CommandPalette part.
  const foreign = new Map([...without('command-palette'), ['dialog', [...observations.get('dialog'), { name: 'foreign', matches: () => true }]]]);
  assert.match(unproven(partRows.filter((row) => row.family === 'command-palette'), foreign), /command-palette\.popup/u);
  // A row the table does not have is not emitted by anything.
  assert.match(unproven([{ family: 'dialog', part: 'ghost', disposition: 'class', hook: 'muxui-dialog__ghost' }]), /dialog\.ghost: \.muxui-dialog__ghost is in none of/u);
  // A qualified row proves its qualifier: the live region without role=status, and the card without a button element.
  const qualified = (family, key, change) => {
    const mutated = exampleDocuments.filter((example) => example.family === family).map((example) => ({ ...example, document: documentOf(change(example.html)) }));
    return unproven(partRows.filter((row) => rowKey(row) === key), observationsOf(mutated, []));
  };
  assert.match(qualified('code-block', 'code-block.status', (html) => html.replaceAll(' role="status"', '')), /code-block\.status: \.muxui-code-block__status\[role="status"\] is in none of/u);
  assert.match(qualified('card', 'card.button', (html) => html.replaceAll('<button', '<div').replaceAll('</button>', '</div>')), /card\.button: button\.muxui-card is in none of/u);
  assert.equal(qualified('card', 'card.button', (html) => html), '');
});

test('resolved CSS-selected hooks have runtime writers even when catalog SSR examples do not observe them', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const cell = (family, states) => states.map((state) => `.muxui-${family}__cell[data-muxui-state-${state}]`);
  const cases = [
    { family: 'calendar', selectors: cell('calendar', ['outside-month', 'today', 'unavailable']), element: ({ h, M }) => h(M.Calendar, { label: 'Date', defaultValue: day, unavailableDateMatcher: () => true }) },
    { family: 'range-calendar', selectors: cell('range-calendar', ['outside-month', 'today', 'unavailable', 'selection-start', 'selection-end']), element: ({ h, M }) => h(M.RangeCalendar, { label: 'Dates', defaultValue: { start: day, end: day }, unavailableDateMatcher: () => true }) },
    { family: 'color-mode-toggle', selectors: ['.muxui-color-mode-toggle[data-muxui-state-selected]'], element: ({ h, M }) => h(M.ColorModeToggle, { mode: 'dark' }) },
    { family: 'color-picker', selectors: ['.muxui-color-field[data-muxui-state-invalid]', '.muxui-color-field[data-muxui-state-required]'], element: ({ h, M }) => h(M.ColorPicker, null, h(M.ColorField, { label: 'Color', invalid: true, required: true })) },
    { family: 'combo-box', selectors: ['.muxui-combo-box[data-muxui-state-required]', '.muxui-combo-box__option[data-muxui-state-selected]'], element: ({ h, M }) => h(M.ComboBox, { label: 'City', items: ['A'], defaultSelectedId: 'A', required: true }), steps: [({ window, document }) => {
      const button = document.querySelector('.muxui-combo-box__trigger');
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) button.dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
    }] },
    { family: 'command-palette', selectors: ['.muxui-command-palette__input[data-muxui-state-invalid]'], element: ({ h, M }) => {
      const C = M.CommandPalette;
      return h(C.Root, { open: true, onOpenChange() {} }, h(C.Trigger, null, 'Commands'), h(C.Backdrop, null, h(C.Popup, { 'aria-label': 'Commands' }, h(C.Title, null, 'Commands'), h(C.Content, null,
        h(C.SearchField, null, h(C.Input, { 'aria-label': 'Search', 'aria-invalid': true })),
        h(C.ListBox, { 'aria-label': 'Results' }, h(C.Item, { id: 'a', title: 'A' }))))));
    } },
    { family: 'prompt-composer', selectors: ['.muxui-prompt-composer[data-muxui-state-invalid]'], element: ({ h, M }) => h(M.PromptComposer, { 'aria-label': 'Message', error: 'Failed' }) },
    { family: 'select', selectors: ['.muxui-select[data-muxui-state-required]'], element: ({ h, M }) => h(M.Select, { label: 'City', items: ['A'], required: true }) },
  ];
  // Resolved placement needs browser geometry; the two remaining supported hooks are proved with live portals in browser/styling-recipes.test.mjs.
  assert.equal(cases.flatMap(({ selectors }) => selectors).length, 16);
  for (const fixture of cases) {
    const result = await renderFixture(fixture, fixture.selectors);
    assert.deepEqual(result.errors, [], fixture.family);
    assert.deepEqual([...result.matched].sort(), [...fixture.selectors].sort(), `${fixture.family}: supported public target actually emits each resolved hook`);
  }
});
