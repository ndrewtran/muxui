import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
// The picker imports the generated themes module, so the tests read the built package.
import { ThemePicker } from '../generated/theme-picker.js';
import { MUXUI_THEME_ACTION_BACKGROUNDS, MUXUI_THEME_PRESETS } from '../generated/themes.mjs';
import { createDom } from './support/dom.mjs';

const h = React.createElement;
const ids = MUXUI_THEME_PRESETS.map(({ id }) => id);
const standard = MUXUI_THEME_PRESETS.filter(({ collection }) => collection === 'standard');
const monochrome = MUXUI_THEME_PRESETS.filter(({ collection }) => collection === 'monochrome');

const parse = (element) => new JSDOM(renderToString(element)).window.document;
const radios = (doc = document) => [...doc.querySelectorAll('input[type="radio"]')];
const checked = (doc = document) => radios(doc).filter((radio) => radio.checked).map((radio) => radio.value);
const nameOf = (doc, radio) => radio.getAttribute('aria-label') ?? radio.closest('label').textContent;

/** Runs `run` against a ThemePicker rendered in a fresh jsdom page. */
async function inPage(props, run) {
  const { restore } = createDom();
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(h(ThemePicker, props)));
    await run({ root, render: (next) => act(async () => root.render(h(ThemePicker, next))) });
  } finally {
    await act(async () => root.unmount());
    restore();
  }
}

/** Presses `key` on the focused radio, as a keyboard would. */
async function press(key) {
  await act(async () => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

async function focusOn(id) {
  await act(async () => radios().find((radio) => radio.value === id).focus());
}

test('ThemePicker renders one named radio group of every preset, grouped under visible headings', () => {
  const doc = parse(h(ThemePicker));
  const group = doc.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute('aria-label'), 'Theme');
  assert.ok(group.classList.contains('muxui-theme-picker'));
  assert.deepEqual(radios(doc).map((radio) => radio.value), ids, 'the package order, with no Random');
  assert.deepEqual([...doc.querySelectorAll('.muxui-theme-picker__heading')].map((heading) => heading.textContent), ['Standard', 'Monochrome']);
  const grids = [...doc.querySelectorAll('.muxui-theme-picker__grid')];
  assert.deepEqual(grids.map((grid) => radios(grid.ownerDocument).filter((radio) => grid.contains(radio)).length), [standard.length, monochrome.length]);
  assert.deepEqual(checked(doc), [], 'nothing is selected without a value');
  assert.equal(nameOf(doc, radios(doc)[0]), 'Harbour');
  assert.equal(parse(h(ThemePicker, { 'aria-label': 'Site theme' })).querySelector('[role="radiogroup"]').getAttribute('aria-label'), 'Site theme');
  assert.equal(parse(h(ThemePicker, { 'aria-labelledby': 'heading' })).querySelector('[role="radiogroup"]').getAttribute('aria-labelledby'), 'heading');
});

test('ThemePicker adds Random before the groups only when asked', () => {
  const without = parse(h(ThemePicker, { random: false }));
  assert.equal(without.querySelector('.muxui-theme-picker__option--random'), null);
  const doc = parse(h(ThemePicker, { random: true, defaultValue: 'random' }));
  assert.deepEqual(radios(doc).map((radio) => radio.value), ['random', ...ids]);
  const random = doc.querySelector('.muxui-theme-picker__option--random');
  assert.equal(random.textContent, 'Random');
  assert.ok(random.querySelector('.muxui-theme-picker__swatch svg'), 'a shuffle glyph sits where a preset has its colour');
  assert.equal(random.compareDocumentPosition(doc.querySelector('.muxui-theme-picker__group')) & 4, 4, 'Random comes before the first group');
  assert.deepEqual(checked(doc), ['random']);
});

test('ThemePicker names a repeated preset name with its collection and keeps the visible label', () => {
  const doc = parse(h(ThemePicker));
  const named = radios(doc).map((radio) => [radio.value, nameOf(doc, radio)]).filter(([, name]) => name.includes('Terracotta'));
  assert.deepEqual(named, [['standard-terracotta', 'Terracotta'], ['monochrome-terracotta', 'Monochrome Terracotta']]);
  const mono = radios(doc).find((radio) => radio.value === 'monochrome-terracotta');
  assert.equal(mono.closest('label').querySelector('.muxui-theme-picker__name').textContent, 'Terracotta');
  assert.deepEqual(radios(doc).filter((radio) => radio.hasAttribute('aria-label')).map((radio) => radio.value), ['monochrome-terracotta']);
});

test('ThemePicker carries each preset colour for both schemes on its swatch, with no theme stylesheet', () => {
  const doc = parse(h(ThemePicker));
  const swatches = [...doc.querySelectorAll('.muxui-theme-picker__swatch')];
  assert.equal(swatches.length, ids.length);
  swatches.forEach((swatch, index) => {
    const { light, dark } = MUXUI_THEME_ACTION_BACKGROUNDS[MUXUI_THEME_PRESETS[index].id];
    const style = swatch.getAttribute('style');
    assert.ok(style.includes(`--muxui-theme-picker-swatch-light:${light}`), style);
    assert.ok(style.includes(`--muxui-theme-picker-swatch-dark:${dark}`), style);
    assert.match(light, /^#[0-9a-f]{6}$/u);
    assert.notEqual(light, dark);
  });
});

test('ThemePicker hydrates the server markup without a mismatch', async () => {
  const props = { random: true, defaultValue: 'standard-fern' };
  const markup = renderToString(h(ThemePicker, props));
  const { restore } = createDom(`<div id="root">${markup}</div>`);
  let root;
  try {
    const errors = [];
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), h(ThemePicker, props), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    assert.deepEqual(checked(), ['standard-fern']);
  } finally {
    await act(async () => root?.unmount());
    restore();
  }
});

test('an uncontrolled ThemePicker selects what the user picks and reports the theme ID', async () => {
  const changes = [];
  await inPage({ defaultValue: 'standard-harbour', random: true, onChange: (value) => changes.push(value) }, async () => {
    assert.deepEqual(checked(), ['standard-harbour']);
    await act(async () => radios().find((radio) => radio.value === 'monochrome-teal').click());
    assert.deepEqual(checked(), ['monochrome-teal']);
    await act(async () => radios().find((radio) => radio.value === 'random').click());
    assert.deepEqual(checked(), ['random']);
    assert.deepEqual(changes, ['monochrome-teal', 'random']);
  });
});

test('a controlled ThemePicker shows the value it is given and leaves the choice to the page', async () => {
  const changes = [];
  await inPage({ value: 'standard-lagoon', onChange: (value) => changes.push(value) }, async ({ render }) => {
    await act(async () => radios().find((radio) => radio.value === 'standard-fern').click());
    assert.deepEqual(changes, ['standard-fern']);
    assert.deepEqual(checked(), ['standard-lagoon']);
    await render({ value: 'standard-fern' });
    assert.deepEqual(checked(), ['standard-fern']);
  });
});

test('ThemePicker keeps a tab stop when Random is removed while it is chosen, and selects it again if it returns', async () => {
  const tabStops = () => radios().filter((radio) => radio.tabIndex === 0).map((radio) => radio.value);
  // With nothing selected React Aria leaves the group enterable, which a picker that never had a choice shows too.
  let unselected;
  await inPage({}, async () => { unselected = tabStops(); });
  assert.ok(unselected.length > 0, 'a picker with no choice can be entered');
  for (const controlled of [false, true]) {
    const changes = [];
    const props = (random) => ({ random, ...(controlled ? { value: 'random' } : {}), onChange: (value) => changes.push(value) });
    await inPage(props(true), async ({ render }) => {
      if (!controlled) await act(async () => radios().find((radio) => radio.value === 'random').click());
      assert.deepEqual([checked(), tabStops()], [['random'], ['random']], `controlled ${controlled}: Random is the one tab stop while it is chosen`);
      const reported = [...changes];
      await render(props(false));
      assert.deepEqual([checked(), tabStops()], [[], unselected], `controlled ${controlled}: the group is enterable again`);
      assert.deepEqual(changes, reported, `controlled ${controlled}: the picker reports no change of its own`);
      await render(props(true));
      assert.deepEqual([checked(), tabStops()], [['random'], ['random']], `controlled ${controlled}: the chosen Random is selected again`);
    });
  }
});

test('ThemePicker only reports: it writes nothing to the document, its root, or storage', async () => {
  const before = { html: null, storage: null };
  await inPage({ defaultValue: 'standard-harbour' }, async () => {
    before.html = document.documentElement.outerHTML.replace(/<body>[\s\S]*<\/body>/u, '');
    await act(async () => radios().find((radio) => radio.value === 'standard-fern').click());
    assert.equal(document.documentElement.outerHTML.replace(/<body>[\s\S]*<\/body>/u, ''), before.html);
    assert.equal(document.documentElement.hasAttribute('data-muxui-theme'), false);
    assert.equal(window.localStorage.length, 0);
    assert.equal(document.cookie, '');
  });
});

test('a disabled ThemePicker ignores input', async () => {
  const changes = [];
  await inPage({ disabled: true, random: true, onChange: (value) => changes.push(value) }, async () => {
    assert.equal(radios().every((radio) => radio.disabled), true);
    await act(async () => radios()[1].click());
    assert.deepEqual(changes, []);
  });
});

// The rows, with Random on a row of its own: the keyboard moves a row of four at a time, across the headings.
test('ThemePicker arrow keys move by one and by a row of four, across the group headings', async () => {
  await inPage({ random: true, defaultValue: 'standard-harbour' }, async () => {
    await focusOn('standard-harbour');
    await press('ArrowRight');
    assert.deepEqual(checked(), ['standard-lagoon']);
    await press('ArrowDown');
    assert.deepEqual(checked(), ['standard-terracotta'], 'one row down keeps the column');
    await press('ArrowDown');
    assert.deepEqual(checked(), ['monochrome-forest'], 'the next row is under the Monochrome heading');
    assert.equal(document.activeElement.value, 'monochrome-forest', 'focus follows the selection');
    await press('ArrowUp');
    assert.deepEqual(checked(), ['standard-terracotta']);
    await press('ArrowLeft');
    assert.deepEqual(checked(), ['standard-wildflower']);
    await press('ArrowLeft');
    assert.deepEqual(checked(), ['standard-violet-dusk'], 'Left moves by one, to the end of the row above');
  });
});

test('ThemePicker Up and Down treat Random as a row of its own and stop at the first and last row', async () => {
  await inPage({ random: true, defaultValue: 'standard-blueprint' }, async () => {
    await focusOn('standard-blueprint');
    await press('ArrowUp');
    assert.deepEqual(checked(), ['random'], 'the first preset row sits under Random');
    await press('ArrowUp');
    assert.deepEqual(checked(), ['random'], 'nothing is above Random');
    await press('ArrowDown');
    assert.deepEqual(checked(), ['standard-harbour'], 'Random leads to the start of the first row');
    await press('ArrowLeft');
    assert.deepEqual(checked(), ['random']);
    await press('ArrowLeft');
    assert.deepEqual(checked(), ['monochrome-terracotta'], 'Left and Right wrap through every option');
    await press('ArrowDown');
    assert.deepEqual(checked(), ['monochrome-terracotta'], 'nothing is below the last row');
  });
});

test('ThemePicker Up and Down take the last option of a row that is too short for the column', async () => {
  await inPage({ defaultValue: 'monochrome-mountain-meadow' }, async () => {
    await focusOn('monochrome-mountain-meadow');
    await press('ArrowDown');
    assert.deepEqual(checked(), [monochrome.at(-1).id]);
  });
});

test('ThemePicker Home and End go to the first and last option, which Random leads when it is on', async () => {
  await inPage({ random: true, defaultValue: 'standard-fern' }, async () => {
    await focusOn('standard-fern');
    await press('Home');
    assert.deepEqual(checked(), ['random']);
    await press('End');
    assert.deepEqual(checked(), [ids.at(-1)]);
  });
  await inPage({ defaultValue: 'standard-fern' }, async () => {
    await focusOn('standard-fern');
    await press('Home');
    assert.deepEqual(checked(), [ids[0]]);
  });
});
