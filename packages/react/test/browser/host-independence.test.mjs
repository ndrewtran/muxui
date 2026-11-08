import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import React from 'react';
import * as M from '../../generated/index.mjs';
import { renderCatalogExamples } from '../support/catalog-example-renders.mjs';
import { classGrammar } from '../support/class-vocabulary.mjs';
import { renderClientFixture } from '../support/render-client-fixture.mjs';
import { clientFixtures } from '../support/styling-fixtures.mjs';
import { readCatalog } from '../support/styling-inventory.mjs';
import { launchBrowser, packageRoot, repositoryRoot } from './harness.mjs';

// A Mux UI part takes its box sizing, margins and typography from Mux UI, never from the page it sits in. Every canonical React
// example is server-rendered once and placed on two pages that differ only in the host's own CSS: `bare` has the package's
// styles.css and themes.css; `reset` adds the host's CSS: the universal box-sizing and margin reset most sites ship, and foreign
// typography on the bare element types a component renders with (`li`, `tr`, `summary`, `span`, ...), in a layer ordered before Mux
// UI's layers, and body typography unlike the browser's and Mux UI's. For each element that carries a Mux UI
// class, and its ::before and ::after when it renders one, the computed values must be equal on both pages: a difference is a value
// the part left to the page (an inherited font, a browser-default margin, a content-box the host's reset turns into a border-box).
//
// Which classes are Mux UI's: the closed class vocabulary (support/class-vocabulary.mjs) built from the catalog's component slugs,
// the grammar the emission test holds every emitted class to. The part map lists only the documented hooks, not the internal parts
// the examples also emit, and a class an example defines for itself (`muxui-number-field-sizing-example`) is outside the grammar.
//
// Each example is placed twice on each page: bare, and nested, inside a Mux UI container with a consumer element between them
// (`<div class="muxui-card"><div class="host-wrap">`). On the reset page `.host-wrap` carries typography unlike the browser's and
// Mux UI's; on the bare page it carries none. A part whose parent is a consumer element is the edge of Mux UI's own markup, so it
// must take Mux UI's typography and not the consumer's, whatever Mux UI element sits further up.
//
// Two states the examples never render are placed beside them, in the markup a client render ends in (support/render-client-fixture.mjs):
// DataDiff with no rows, whose message sits under an extra tr, and PromptComposer with its suggestion menu open, whose labels sit under
// a span. The server-rendered guard cannot reach them, and they are where a wrapper without a class let the host in.
//
// Chromium only, two pages, no server: the fixtures are static markup, so computed style needs neither script nor layout.
const properties = ['box-sizing', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'font-family', 'font-size', 'line-height'];

// Parts that take a property from their surroundings on purpose. `part` is the label the failure list prints for the element
// (its classes without modifiers, so `.muxui-button.muxui-link` is another part), `reason` is where the behaviour is declared.
const inheritsByDesign = [
  { part: '.muxui-link', properties: ['font-size', 'line-height'], reason: 'An inline Link sets `font-size: inherit` so it matches the text around it; its line-height is a multiple of that size.' },
];

// The reset layer sits before every Mux UI layer, so it loses to anything Mux UI declares and shows only what a part left undeclared.
// The element types are the ones components render around their parts (and the ones a library renders without a class): a part that
// declares no font of its own would take the host's here, instead of its parent's.
// The body typography is the page's own unlayered CSS: Mux UI's body defaults (`:where(body)` in muxui.components) are meant to be
// overridden by the page, and a layered body rule would lose to them, so no part could ever show a font taken from the host.
const hostTypes = 'span, div, p, ul, ol, li, table, tr, td, th, details, summary';
const hostCss = `@layer host-reset {
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  ${hostTypes} { font: 30px/normal Impact, fantasy; }
}
body { font-family: Impact, fantasy; font-size: 18px; line-height: 2; }
.host-wrap { font: 30px/normal Impact, fantasy; }`;

/** The example markup on a page of the package's CSS; `host` adds the host's CSS before it. The figure has a default margin and no Mux UI class. */
const documentOf = ({ examples, stylesheet, themes, host }) => '<!doctype html><html data-muxui-color-scheme="light"><head><meta charset="utf-8">'
  + (host ? `<style>@layer host-reset, muxui.tokens, muxui.components, muxui.utilities;</style><style>${hostCss}</style>` : '')
  + `<style>${stylesheet}</style><style>${themes}</style></head><body><figure id="control">control</figure><span id="control-type">control</span>`
  + examples.map(({ name, html }) => `<section data-example="${name}">${html}</section>`
    + `<section data-example="${name}#nested"><div class="muxui-card"><div class="host-wrap">${html}</div></div></section>`).join('')
  + '</body></html>';

/** Runs in the page: the classes it carries. */
const classesOf = () => [...new Set([...document.querySelectorAll('[class]')].flatMap((element) => [...element.classList]))];

/** Runs in the page: the computed values of every element with a class in `owned`, and of its rendered ::before and ::after. */
function measure({ owned, properties: names }) {
  const mux = new Set(owned);
  // An `auto` margin resolves to a used length that follows the box's width, so a margin is read as its computed value, which keeps
  // `auto`. The computed style map has no pseudo-elements, so theirs are read resolved.
  const read = (style, element) => names.map((name) => (element && name.startsWith('margin-') ? String(element.computedStyleMap().get(name)) : style.getPropertyValue(name)));
  const rows = [];
  document.querySelectorAll('body *').forEach((element, index) => {
    const classes = [...element.classList].filter((name) => mux.has(name));
    if (classes.length === 0) return;
    for (const pseudo of ['', '::before', '::after']) {
      const style = getComputedStyle(element, pseudo || null);
      // A pseudo-element without generated content is not rendered, whatever the cascade says about it.
      if (pseudo !== '' && (style.content === 'none' || style.content === 'normal' || style.display === 'none')) continue;
      rows.push({ key: `${index}${pseudo}`, example: element.closest('[data-example]').dataset.example, classes, pseudo, values: read(style, pseudo === '' ? element : null) });
    }
  });
  const control = document.getElementById('control');
  const wrap = document.querySelector('.host-wrap');
  const type = document.getElementById('control-type');
  return { rows, control: read(getComputedStyle(control), control), type: read(getComputedStyle(type), type), wrap: read(getComputedStyle(wrap), wrap) };
}

/** The states placed beside the examples, by the name they get on the page and the fixture that renders them. */
const states = [
  ['data-diff/no-rows', 'DataDiff with no rows'],
  ['prompt-composer/open-suggestions', 'PromptComposer with suggestions'],
];

let browser;
let pages;
before(async () => {
  const [stylesheet, themes, catalog] = await Promise.all([
    readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8'),
    readFile(resolve(packageRoot, 'generated/themes.css'), 'utf8'),
    readCatalog(repositoryRoot),
  ]);
  const slugs = [...catalog.anatomy.keys()];
  const examples = await renderCatalogExamples(slugs);
  // Before the browser starts: a client render installs and removes a jsdom window on the globals.
  const lib = { h: React.createElement, M };
  for (const [name, fixtureName] of states) {
    const fixture = clientFixtures.find((candidate) => candidate.name === fixtureName);
    const { errors, html } = await renderClientFixture(fixture, lib);
    assert.deepEqual(errors, [], fixtureName);
    examples.push({ name, html });
  }
  const isMuxClass = classGrammar(slugs);
  browser = await launchBrowser();
  const open = async (host) => {
    const page = await browser.newPage();
    await page.setContent(documentOf({ examples, stylesheet, themes, host }));
    return page;
  };
  const bare = await open(false);
  const owned = (await bare.evaluate(classesOf)).filter(isMuxClass);
  const reset = await open(true);
  pages = { bare: await bare.evaluate(measure, { owned, properties }), reset: await reset.evaluate(measure, { owned, properties }) };
  await Promise.all([bare.close(), reset.close()]);
});
after(async () => {
  await browser?.close();
});

/** The differences between the pages, one per property: `{ example, family, part, pseudo, property, bare, reset }`. */
function leaks() {
  const resetRows = new Map(pages.reset.rows.map((row) => [row.key, row]));
  const found = [];
  for (const bare of pages.bare.rows) {
    const reset = resetRows.get(bare.key);
    assert.ok(reset, `${bare.example}: ${bare.key} renders on the bare page and not on the reset page`);
    // The BEM element (or, for a root, the family class) names the part; an element that is two parts names both.
    const part = bare.classes.filter((name) => !name.includes('--')).map((name) => `.${name}`).join('') || `.${bare.classes[0]}`;
    properties.forEach((property, at) => {
      if (bare.values[at] === reset.values[at]) return;
      if (inheritsByDesign.some((entry) => entry.part === part && entry.properties.includes(property))) return;
      found.push({ example: bare.example, family: bare.example.split('/')[0], part, pseudo: bare.pseudo, property, bare: bare.values[at], reset: reset.values[at] });
    });
  }
  return found;
}

/** Groups by family, then lists each distinct (part, pseudo-element, property, bare, reset) once, with how many elements show it. */
function report(found) {
  const totals = Object.entries(Object.groupBy(found, ({ property }) => property)).map(([property, list]) => `${property} ${list.length}`).join(', ');
  const groups = [...Map.groupBy(found, ({ family }) => family)].sort(([a], [b]) => a.localeCompare(b)).map(([family, list]) => {
    const lines = new Map();
    for (const { example, part, pseudo, property, bare, reset } of list) {
      const line = `${part}${pseudo}  ${property}  bare ${bare}  reset ${reset}`;
      const seen = lines.get(line) ?? { count: 0, example };
      seen.count += 1;
      lines.set(line, seen);
    }
    return `${family}\n${[...lines].sort(([a], [b]) => a.localeCompare(b)).map(([line, { count, example }]) => `  ${line}  (${count}, first in ${example})`).join('\n')}`;
  });
  return `by property: ${totals}\n${groups.join('\n')}`;
}

test('the host CSS reaches the page, so a part that took a value from it would show', () => {
  const [bareBox, bareMargin, , , , , bareSize, bareLine] = pages.bare.control;
  const [resetBox, resetMargin, , , , , resetSize, resetLine] = pages.reset.control;
  const [, , , , , , wrapSize, wrapLine] = pages.reset.wrap;
  const [, , , , , , typeSize, typeLine] = pages.reset.type;
  assert.notEqual(bareBox, resetBox, 'the reset sets box-sizing on an unclassed figure');
  assert.notEqual(bareMargin, resetMargin, 'the reset removes the figure margin');
  assert.deepEqual([resetSize, resetLine], ['18px', '36px'], 'the page typography applies to an unclassed figure');
  assert.deepEqual([typeSize, typeLine], ['30px', 'normal'], 'the host\'s element-type rule reaches an unclassed span');
  assert.deepEqual([pages.bare.type[6], pages.bare.type[7]], [bareSize, bareLine], 'and none on the bare page');
  assert.notEqual(bareSize, resetSize);
  assert.notEqual(bareLine, resetLine);
  assert.deepEqual([wrapSize, wrapLine], ['30px', 'normal'], 'the consumer element between a Mux UI container and the example carries its own typography');
  assert.deepEqual([pages.bare.wrap[6], pages.bare.wrap[7]], [bareSize, bareLine], 'and none on the bare page');
  assert.ok(pages.bare.rows.length > 1000, `${pages.bare.rows.length} Mux UI elements and pseudo-elements were measured`);
  for (const [name] of states) assert.ok(pages.bare.rows.some((row) => row.example.startsWith(name)), `${name} is measured`);
});

test('no Mux UI part takes box sizing, margins or typography from the host page', () => {
  const found = leaks();
  assert.equal(found.length, 0, `${found.length} values change when the host adds its reset and typography (part, pseudo-element, property, bare, reset):\n${report(found)}`);
});
