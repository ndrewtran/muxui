import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import * as M from '../../generated/index.mjs';
import { Markdown } from '../../generated/markdown.js';
import { TextEditor } from '../../generated/text-editor.js';
import { renderCatalogExamples } from '../support/catalog-example-renders.mjs';
import { classGrammar } from '../support/class-vocabulary.mjs';
import { renderClientFixture } from '../support/render-client-fixture.mjs';
import { clientFixtures } from '../support/styling-fixtures.mjs';
import { readCatalog } from '../support/styling-inventory.mjs';
import { describe, exceptionFor, markCaller, unclassedNodes } from '../support/unclassed-elements.mjs';
import { launchBrowser, packageRoot, repositoryRoot } from './harness.mjs';

// A Mux UI part takes its box sizing, margins, typography and size from Mux UI, never from the page it sits in. Every canonical React
// example is server-rendered once and placed on two pages that differ only in the host's own CSS: `bare` has the package's
// styles.css and themes.css; `reset` adds the host's CSS: the universal box-sizing and margin reset most sites ship, and foreign
// typography on the bare element types a component renders with (`li`, `tr`, `summary`, `span`, ...), in a layer ordered before Mux
// UI's layers, and body typography unlike the browser's and Mux UI's. Three things are compared between the pages:
//   - parts: for each element that carries a Mux UI class, and its ::before and ::after when it renders one, the computed box sizing,
//     margins and typography. A difference is a value the part left to the page (an inherited font, a browser-default margin, a
//     content-box the host's reset turns into a border-box).
//   - wrappers: the typography of each element a component renders without a class, which the caller did not create. These are the
//     library wrappers listed in support/unclassed-elements.mjs (a GridList's cell, an editor's paragraphs, a token field's segments).
//     A wrapper holds a part's text or content, so a font taken from the host shows in the text or in the line box around it.
//   - sizes: the width and height of each Mux UI part that nothing the caller created can size: none below it, none among its siblings
//     (a flex row stretches a part to its tallest neighbour), and none above it (a caller's grid or border-box sets the room it
//     has). The caller's own elements take the host's rules by design, and a part around them follows; a part without them has nothing
//     but Mux UI's own markup to follow. A line box that a wrapper's font stretches shows here, whichever element it sits in.
// Which elements are the caller's: the example is rendered with every native element its JSX creates marked `data-caller`
// (support/caller-marked-jsx-runtime.mjs), and the fixtures' `h` marks theirs, so the markup tells them from the component's.
//
// Which classes are Mux UI's: the closed class vocabulary (support/class-vocabulary.mjs) built from the catalog's component slugs,
// the grammar the emission test holds every emitted class to. The part map lists only the documented hooks, not the internal parts
// the examples also emit, and a class an example defines for itself (`muxui-number-field-sizing-example`) is outside the grammar.
//
// Each example is placed twice on each page: bare, and nested, inside a Mux UI container with a consumer element between them
// (`<div class="muxui-card"><div class="host-wrap">`, the consumer element marked as the caller's). On the reset page `.host-wrap`
// carries typography unlike the browser's and Mux UI's; on the bare page it carries none. A part whose parent is a consumer element is the edge of Mux UI's own markup, so it
// must take Mux UI's typography and not the consumer's, whatever Mux UI element sits further up.
//
// Three states the examples never render are placed beside them, in the markup a client render ends in (support/render-client-fixture.mjs):
// DataDiff with no rows, whose message sits under an extra tr, PromptComposer with its suggestion menu open, whose labels sit under a
// span, and TextEditor with a document, whose paragraphs, headings, lists and marks Tiptap renders. The server-rendered guard cannot
// reach them, and they are where a wrapper without a class let the host in. TagGroup and GridList items and a TokenField value are in
// the examples.
//
// Chromium only, two pages, no server: the fixtures are static markup, so neither script nor layout beyond the browser's own is needed.
const properties = ['box-sizing', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'font-family', 'font-size', 'line-height'];
const typography = ['font-family', 'font-size', 'line-height'];
const size = ['width', 'height'];

// Parts that take a property from their surroundings on purpose. `part` is the label the failure list prints for the element
// (its classes without modifiers, so `.muxui-button.muxui-link` is another part), `reason` is where the behaviour is declared.
const inheritsByDesign = [
  { part: '.muxui-link', properties: ['font-size', 'line-height', 'width', 'height'], reason: 'An inline Link sets `font-size: inherit` so it matches the text around it; its line-height is a multiple of that size, and its size follows.' },
];

// The reset layer sits before every Mux UI layer, so it loses to anything Mux UI declares and shows only what a part left undeclared.
// The element types are the ones components render around their parts (and the ones a library renders without a class, and the
// ones a document renders in an editor, below): a part that declares no font of its own would take the host's here, instead of its
// parent's.
// The body typography is the page's own unlayered CSS: Mux UI's body defaults (`:where(body)` in muxui.components) are meant to be
// overridden by the page, and a layered body rule would lose to them, so no part could ever show a font taken from the host.
const hostTypes = 'span, div, p, ul, ol, li, table, tr, td, th, details, summary';
// The inline and block types a document renders. Only the three compared properties: the `font` shorthand also resets the weight and
// style the browser gives `strong` and `em`, which a Mux UI part that wants them states for itself.
const documentTypes = 'blockquote, pre, code, a, strong, em, u, s';
const hostCss = `@layer host-reset {
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  ${hostTypes} { font: 30px/normal Impact, fantasy; }
  ${documentTypes} { font-family: Impact, fantasy; font-size: 30px; line-height: normal; }
}
body { font-family: Impact, fantasy; font-size: 18px; line-height: 2; }
.host-wrap { font: 30px/normal Impact, fantasy; }`;

/** The example markup on a page of the package's CSS; `host` adds the host's CSS before it. The figure has a default margin and no Mux UI class. */
const documentOf = ({ examples, stylesheet, themes, host }) => {
  // A fixed width, so a part that fills its container is as wide on both pages whatever the page's margins are.
  const section = (name, inner) => `<section data-example="${name}" style="width:640px;box-sizing:content-box">${inner}</section>`;
  return '<!doctype html><html data-muxui-color-scheme="light"><head><meta charset="utf-8">'
    + (host ? `<style>@layer host-reset, muxui.tokens, muxui.components, muxui.utilities;</style><style>${hostCss}</style>` : '')
    // Sizes are read, so a running animation (a spinner's rotation) is held at its first frame on both pages.
    + `<style>${stylesheet}</style><style>${themes}</style><style>*,*::before,*::after{animation-play-state:paused!important;transition:none!important}</style></head><body><figure id="control">control</figure><span id="control-type">control</span>`
    + examples.map(({ name, html }) => section(name, html)
      + section(`${name}#nested`, `<div class="muxui-card"><div class="host-wrap" data-caller="">${html}</div></div>`)).join('')
    + '</body></html>';
};

/** Runs in the page: the classes it carries. */
const classesOf = () => [...new Set([...document.querySelectorAll('[class]')].flatMap((element) => [...element.classList]))];

/**
 * Runs in the page: the computed values of every element with a class in `owned`, and of its rendered ::before and ::after (`parts`);
 * the typography of the wrappers `wrappers` names by their position among the example's elements (`wrappers`); and the width and
 * height of each owned element that nothing the caller created can size (`sizes`).
 */
function measure({ owned, properties: names, typography: fontNames, size: sizeNames, wrappers }) {
  const mux = new Set(owned);
  // An `auto` margin resolves to a used length that follows the box's width, so a margin is read as its computed value, which keeps
  // `auto`. The computed style map has no pseudo-elements, so theirs are read resolved.
  const read = (style, element) => names.map((name) => (element && name.startsWith('margin-') ? String(element.computedStyleMap().get(name)) : style.getPropertyValue(name)));
  const partLabel = (classes) => classes.filter((name) => !name.includes('--')).map((name) => `.${name}`).join('') || `.${classes[0]}`;
  const parts = [];
  const sizes = [];
  document.querySelectorAll('body *').forEach((element, index) => {
    const classes = [...element.classList].filter((name) => mux.has(name));
    if (classes.length === 0) return;
    const example = element.closest('[data-example]').dataset.example;
    for (const pseudo of ['', '::before', '::after']) {
      const style = getComputedStyle(element, pseudo || null);
      // A pseudo-element without generated content is not rendered, whatever the cascade says about it.
      if (pseudo !== '' && (style.content === 'none' || style.content === 'normal' || style.display === 'none')) continue;
      parts.push({ key: `${index}${pseudo}`, example, part: partLabel(classes), pseudo, values: read(style, pseudo === '' ? element : null) });
    }
    // The parent's subtree holds the part and its siblings; the consumer element of the nested placement is the harness's, not the caller's.
    if (element.parentElement.querySelector('[data-caller]') === null && element.parentElement.closest('[data-caller]:not(.host-wrap)') === null) {
      const box = element.getBoundingClientRect();
      sizes.push({ key: String(index), example, part: partLabel(classes), pseudo: '', values: [box.width.toFixed(2), box.height.toFixed(2)] });
    }
  });
  // Where the example's own elements start: the section, or the consumer element between the Mux UI container and the example.
  const counts = {};
  const wrapperRows = [];
  document.querySelectorAll('section[data-example]').forEach((section) => {
    const example = section.dataset.example;
    const elements = [...(section.querySelector('.host-wrap') ?? section).querySelectorAll('*')];
    counts[example] = elements.length;
    for (const { at, part } of wrappers[example.split('#')[0]] ?? []) {
      const style = getComputedStyle(elements[at]);
      wrapperRows.push({ key: `${example}:${at}`, example, part, pseudo: '', values: fontNames.map((name) => style.getPropertyValue(name)) });
    }
  });
  const control = document.getElementById('control');
  const wrap = document.querySelector('.host-wrap');
  const type = document.getElementById('control-type');
  return { parts, sizes, wrappers: wrapperRows, counts, control: read(getComputedStyle(control), control), type: read(getComputedStyle(type), type), wrap: read(getComputedStyle(wrap), wrap) };
}

/**
 * The elements of `html` that a component rendered without a class and nothing hides, found in a parse of the markup: the position of
 * each among the markup's elements, and a name for the failure list. An exception that is `hidden` renders nothing; one that is
 * `boxless` has no text or box of its own, and the guard compares the parts below it instead.
 */
function wrappersOf(html, isMuxClass) {
  const { document } = new JSDOM(`<!doctype html><body>${html}`).window;
  const positions = new Map([...document.body.querySelectorAll('*')].map((element, index) => [element, index]));
  const wrappers = unclassedNodes(document.body, { isClass: isMuxClass }).flatMap((element) => {
    const exception = exceptionFor(element);
    return exception?.hidden || exception?.boxless ? [] : [{ at: positions.get(element), part: describe(element) }];
  });
  return { count: positions.size, wrappers };
}

/** The states placed beside the examples, by the name they get on the page and the fixture that renders them. */
const states = [
  ['data-diff/no-rows', 'DataDiff with no rows'],
  ['prompt-composer/open-suggestions', 'PromptComposer with suggestions'],
  ['text-editor/document', 'TextEditor with a document'],
];

let browser;
let pages;
let counts;
before(async () => {
  const [stylesheet, themes, catalog] = await Promise.all([
    readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8'),
    readFile(resolve(packageRoot, 'generated/themes.css'), 'utf8'),
    readCatalog(repositoryRoot),
  ]);
  const slugs = [...catalog.anatomy.keys()];
  const examples = await renderCatalogExamples(slugs, { markCallerElements: true });
  // Before the browser starts: a client render installs and removes a jsdom window on the globals.
  const lib = { h: markCaller(React.createElement), M, TextEditor, Markdown };
  for (const [name, fixtureName] of states) {
    const fixture = clientFixtures.find((candidate) => candidate.name === fixtureName);
    const { errors, html } = await renderClientFixture(fixture, lib);
    assert.deepEqual(errors, [], fixtureName);
    examples.push({ name, html });
  }
  const isMuxClass = classGrammar(slugs);
  const found = new Map(examples.map(({ name, html }) => [name, wrappersOf(html, isMuxClass)]));
  const wrappers = Object.fromEntries([...found].map(([name, { wrappers: list }]) => [name, list]));
  browser = await launchBrowser();
  const open = async (host) => {
    const page = await browser.newPage();
    await page.setContent(documentOf({ examples, stylesheet, themes, host }));
    // Sizes are read, so the page's fonts are settled first.
    await page.evaluate(() => document.fonts.ready);
    return page;
  };
  const bare = await open(false);
  const owned = (await bare.evaluate(classesOf)).filter(isMuxClass);
  const reset = await open(true);
  const args = { owned, properties, typography, size, wrappers };
  pages = { bare: await bare.evaluate(measure, args), reset: await reset.evaluate(measure, args) };
  await Promise.all([bare.close(), reset.close()]);
  // The parse the wrappers were found in and the page agree on the elements, or a position would name another element.
  counts = { page: pages.bare.counts, parse: Object.fromEntries([...found].map(([name, { count }]) => [name, count])) };
});
after(async () => {
  await browser?.close();
});

/** The differences between the pages, one per property: `{ example, family, kind, part, pseudo, property, bare, reset }`. */
function leaks() {
  const found = [];
  const compare = (kind, list, other, names) => {
    const resetRows = new Map(other.map((row) => [row.key, row]));
    for (const bare of list) {
      const reset = resetRows.get(bare.key);
      assert.ok(reset, `${bare.example}: ${bare.key} renders on the bare page and not on the reset page`);
      names.forEach((property, at) => {
        if (bare.values[at] === reset.values[at]) return;
        if (inheritsByDesign.some((entry) => entry.part === bare.part && entry.properties.includes(property))) return;
        found.push({ example: bare.example, family: bare.example.split('/')[0], kind, part: bare.part, pseudo: bare.pseudo, property, bare: bare.values[at], reset: reset.values[at] });
      });
    }
  };
  compare('part', pages.bare.parts, pages.reset.parts, properties);
  compare('wrapper', pages.bare.wrappers, pages.reset.wrappers, typography);
  compare('size', pages.bare.sizes, pages.reset.sizes, size);
  return found;
}

/** Groups by family, then lists each distinct (part, pseudo-element, property, bare, reset) once, with how many elements show it. */
function report(found) {
  const totals = Object.entries(Object.groupBy(found, ({ kind, property }) => `${kind} ${property}`)).map(([property, list]) => `${property} ${list.length}`).join(', ');
  const groups = [...Map.groupBy(found, ({ family }) => family)].sort(([a], [b]) => a.localeCompare(b)).map(([family, list]) => {
    const lines = new Map();
    for (const { example, kind, part, pseudo, property, bare, reset } of list) {
      const line = `${kind === 'part' ? '' : `${kind} `}${part}${pseudo}  ${property}  bare ${bare}  reset ${reset}`;
      const seen = lines.get(line) ?? { count: 0, example };
      seen.count += 1;
      lines.set(line, seen);
    }
    return `${family}\n${[...lines].sort(([a], [b]) => a.localeCompare(b)).map(([line, { count, example }]) => `  ${line}  (${count}, first in ${example})`).join('\n')}`;
  });
  return `by kind and property: ${totals}\n${groups.join('\n')}`;
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
  assert.ok(pages.bare.parts.length > 1000, `${pages.bare.parts.length} Mux UI elements and pseudo-elements were measured`);
  assert.ok(pages.bare.sizes.length > 500, `${pages.bare.sizes.length} Mux UI parts without caller content around them were sized`);
  for (const [name] of states) assert.ok(pages.bare.parts.some((row) => row.example.startsWith(name)), `${name} is measured`);
  assert.deepEqual(counts.page, { ...counts.parse, ...Object.fromEntries(Object.entries(counts.parse).map(([name, count]) => [`${name}#nested`, count])) }, 'the markup parses to the same elements in the page');
});

test('the wrappers a library renders around the data-driven labels, the document and the typed text are held to Mux UI too', () => {
  // The wrappers the reviewed leaks lived in: a TagGroup and a GridList cell, a TokenField segment, and the nodes of an editor's document.
  const wrapperPart = (example, text) => pages.bare.wrappers.some((row) => row.example === example && row.part === text);
  assert.ok(wrapperPart('tag-group/basic', '<div> in <div.muxui-tag-group__tag>'), 'a TagGroup cell is compared');
  assert.ok(wrapperPart('grid-list/basic', '<div> in <div.muxui-grid-list__item>'), 'a GridList cell is compared');
  assert.ok(wrapperPart('token-field/basic', '<span> in <div.muxui-token-field__input>'), 'a TokenField segment is compared');
  for (const tag of ['p', 'h1', 'ul', 'li', 'blockquote', 'pre', 'code', 'strong']) {
    assert.ok(pages.bare.wrappers.some((row) => row.example === 'text-editor/document' && row.part.startsWith(`<${tag}>`)), `an editor <${tag}> is compared`);
  }
  assert.ok(pages.bare.wrappers.length > 100, `${pages.bare.wrappers.length} wrappers were compared`);
});

test('no Mux UI part or library wrapper takes box sizing, margins, typography or size from the host page', () => {
  const found = leaks();
  assert.equal(found.length, 0, `${found.length} values change when the host adds its reset and typography (part, pseudo-element, property, bare, reset):\n${report(found)}`);
});
