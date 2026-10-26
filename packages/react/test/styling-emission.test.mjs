// Decision 0031 item 19: every documented class is emitted, on the right element, in a fixture of its own family. The part map says
// which class each of the 448 anatomy entries carries; this test renders the family and looks for `selectorOf(row)` in what it
// rendered. 19 rows have no element (`none`). The other 429 are proven by
//   - the family's canonical examples, server-rendered (302 rows), or else
//   - an explicit fixture of support/styling-fixtures.mjs in the state that shows the part: invalid, open, with a selection (127 rows).
// A fixture of another family never proves a row (a class on a DatePicker's button does not prove the button's own part), a
// fixture that throws or logs a React error fails, and so does a row that no fixture reaches, an unknown row, and a fixture for a
// family the table lacks. The classes every fixture renders are also held to the closed vocabulary, which is the check that sees
// a name built at run time (see styling-tokens.test.mjs for the same grammar on CSS and source), each against only the exemptions of
// its own example (a runtime fixture has none). The canonical examples are held to the same standard as the fixtures: a React
// warning or an exception while one renders fails.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import * as M from '../generated/index.mjs';
import { Markdown } from '../generated/markdown.js';
import { TextEditor } from '../generated/text-editor.js';
import { captured, renderCatalogExamples } from './support/catalog-example-renders.mjs';
import { emittedFindings, readAuthored, vocabularyFindings } from './support/class-vocabulary.mjs';
import { createDom } from './support/dom.mjs';
import { readCatalog } from './support/styling-inventory.mjs';
import { callerElementFixtures, clientFixtures, hookOnlyFixtures } from './support/styling-fixtures.mjs';
import { partRows, selectorOf } from './support/styling-parts.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const catalog = await readCatalog(repositoryRoot);
const slugs = [...catalog.anatomy.keys()];
const lib = { h: React.createElement, M, TextEditor, Markdown };
const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const rowKey = (row) => `${row.family}.${row.part}`;

// Tier 1: every canonical example of every family, server-rendered (support/catalog-example-renders.mjs).
const examples = await renderCatalogExamples(slugs);
const documentOf = (html) => new JSDOM(`<!doctype html><body>${html}`).window.document;
const exampleDocuments = examples.map((example) => ({ ...example, document: documentOf(example.html) }));

// Tiers 2 to 4: a fixture is client-rendered in a fresh jsdom window, driven by its steps, and the family's selectors are looked for
// after the render and after each step (an overlay closes, a toast leaves). A console error is a failure, never a skipped row.
/** jsdom has no layout: every element reports the size, and the observer reports it as soon as it observes a target. */
function sizeLayout(window, { width, height }) {
  for (const [name, value] of [['offsetHeight', height], ['offsetWidth', width], ['clientHeight', height], ['clientWidth', width], ['scrollHeight', height * 10]]) {
    Object.defineProperty(window.HTMLElement.prototype, name, { configurable: true, get: () => value });
  }
  class SizedObserver {
    constructor(callback) { this.callback = callback; }
    // Asynchronous, so the virtualizer is not asked to flush inside the lifecycle that started the observation.
    observe(target) { setTimeout(() => this.callback([{ target, contentRect: { width, height }, borderBoxSize: [{ inlineSize: width, blockSize: height }] }], this), 0); }
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = SizedObserver;
  globalThis.ResizeObserver = SizedObserver;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON() {} });
}

async function renderFixture({ element, steps = [], layout }, selectors) {
  const { dom, restore } = createDom('<div id="root"></div>', { layoutStubs: true });
  const { window } = dom;
  const { document } = window;
  const errors = [];
  const consoleError = console.error;
  console.error = (...messages) => errors.push(String(messages[0]).slice(0, 160));
  const matched = new Set();
  const classes = new Set();
  const observe = () => {
    for (const selector of selectors) if (document.querySelector(selector) !== null) matched.add(selector);
    for (const node of document.querySelectorAll('[class]')) for (const name of node.classList) if (name.startsWith('muxui-')) classes.add(name);
  };
  if (layout) sizeLayout(window, layout);
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(element(lib)));
    await act(async () => sleep(40));
    observe();
    for (const step of steps) {
      await act(async () => { await step({ window, document, sleep }); });
      await act(async () => sleep(60));
      observe();
    }
  } catch (error) {
    errors.push(`threw: ${String(error?.message ?? error).slice(0, 160)}`);
  } finally {
    console.error = consoleError;
    try { await act(async () => root.unmount()); } catch { /* unmounting is not what is being proven */ }
    await sleep(30);
    restore();
  }
  return { matched, classes, errors };
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
  // The sizes the plan measured: 429 rows with an element, 302 by canonical examples and 127 by an explicit fixture.
  const withElement = partRows.filter((row) => row.disposition !== 'none');
  const byExample = withElement.filter((row) => exampleDocuments.some(({ family, document }) => family === row.family && document.querySelector(selectorOf(row)) !== null));
  assert.deepEqual([withElement.length, byExample.length, withElement.length - byExample.length], [429, 302, 127]);
  assert.equal(exampleDocuments.length, 217);
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
