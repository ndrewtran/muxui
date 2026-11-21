import assert from 'node:assert/strict';
import test from 'node:test';
import { contrastRatio, over } from '../support/contrast.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A standalone ToggleButton shows a pressed fill while a pointer holds it, apart from rest, hover and selected, in both
// schemes; a grouped one keeps the group's paint. The quiet variant draws no outline and no selected fill, its selected
// text is a real luminance step stronger than its rest text. Under forced colours both variants use system colours: a
// selected one is HighlightText on Highlight, a disabled one GrayText at full opacity, and keyboard focus a Highlight outline.
// preventFocusOnPress leaves focus and the text selection in an editor on a pointer press, and the keyboard still
// focuses the tool. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ToggleButton } from '/src/components.ts';
import { ToggleButtonGroup } from '/src/toggle-button-group.ts';

const h = React.createElement;
const pin = () => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
  h('path', { d: 'M8 2v8M4 6h8', stroke: 'currentColor', strokeWidth: 2 }));
const scheme = (name) => h('section', { key: name, id: name, 'data-muxui-color-scheme': name },
  h(ToggleButton, { id: name + '-off' }, 'Bold'),
  h(ToggleButton, { id: name + '-on', defaultSelected: true }, 'Bold'),
  h(ToggleButton, { id: name + '-disabled', disabled: true }, 'Bold'),
  h(ToggleButton, { id: name + '-quiet-off', variant: 'quiet', 'aria-label': 'Pin' }, pin()),
  h(ToggleButton, { id: name + '-quiet-on', variant: 'quiet', defaultSelected: true, 'aria-label': 'Pin' }, pin()),
  h(ToggleButton, { id: name + '-quiet-disabled', variant: 'quiet', disabled: true, 'aria-label': 'Pin' }, pin()),
  h(ToggleButtonGroup, { 'aria-label': 'Alignment', selectionMode: 'multiple' },
    h(ToggleButton, { id: 'left', 'data-probe': name + '-grouped' }, 'Left'),
    h(ToggleButton, { id: 'right' }, 'Right')));

createRoot(document.getElementById('root')).render(h('main', null,
  scheme('light'),
  scheme('dark'),
  h('section', { 'data-muxui-color-scheme': 'light' },
    h('div', { id: 'editor', contentEditable: true, suppressContentEditableWarning: true }, 'Some words to format'),
    h(ToggleButton, { id: 'kept', preventFocusOnPress: true }, 'Bold'),
    h(ToggleButton, { id: 'taken' }, 'Italic'))));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: `<link rel="stylesheet" href="/generated/styles.css"><style>
    section { display: flex; gap: 8px; padding: 16px; background: var(--muxui-semantic-surface-canvas); }
  </style>`,
  body: '<div id="root"></div>',
  entry: '/toggle-button-entry.mjs',
});

/** Opens the fixture with its motion reduced, so a colour is read without a transition in flight. */
async function openPage(engine) {
  const { url, close } = await startServer({
    entries: ['src/components.ts', 'src/toggle-button-group.ts'],
    pages: { '/': page },
    modules: { '/toggle-button-entry.mjs': entry },
  });
  const browser = await launchBrowser(engine);
  const tab = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await tab.goto(`${url}/`, { waitUntil: 'load' });
  await tab.locator('#taken').waitFor();
  await awaitFontsAndFrames(tab);
  return { tab, errors, close: async () => { await browser.close(); await close(); } };
}

/** A control's computed paint, each colour as sRGB channels (canvas resolves color-mix and any colour space). */
function paintOf(tab, selector) {
  return tab.evaluate((target) => {
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const parse = (text) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = '#000000';
      canvas.fillStyle = text;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const element = document.querySelector(target);
    const style = getComputedStyle(element);
    return {
      background: parse(style.backgroundColor),
      backgroundImage: style.backgroundImage,
      outline: parse(style.outlineColor),
      color: parse(style.color),
      ground: parse(getComputedStyle(element.closest('section')).backgroundColor),
      pressed: element.hasAttribute('data-muxui-state-pressed'),
      ariaPressed: element.getAttribute('aria-pressed'),
    };
  }, selector);
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// The fill a control shows: its colour and any layer over it (a selected hover adds a tint layer).
const fill = ({ background, backgroundImage }) => ({ background, backgroundImage });

/** The paint at rest, under the pointer, and while the pointer is held down, without changing the selection. */
async function restHoverPressed(tab, selector) {
  await tab.mouse.move(0, 0);
  await awaitFontsAndFrames(tab);
  const rest = await paintOf(tab, selector);
  const box = await tab.locator(selector).boundingBox();
  await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await awaitFontsAndFrames(tab);
  const hover = await paintOf(tab, selector);
  await tab.mouse.down();
  await awaitFontsAndFrames(tab);
  const pressed = await paintOf(tab, selector);
  // Leave before releasing, so the press is cancelled and the selection stays as it was.
  await tab.mouse.move(0, 0);
  await tab.mouse.up();
  await awaitFontsAndFrames(tab);
  return { rest, hover, pressed };
}

for (const engine of browserEngines()) {
  test(`A standalone ToggleButton has a pressed fill apart from rest and hover, and a grouped one does not, in ${engine}`, { timeout: 120_000 }, async () => {
    const { tab, errors, close } = await openPage(engine);
    try {
      for (const scheme of ['light', 'dark']) {
        for (const id of [`${scheme}-off`, `${scheme}-on`]) {
          const { rest, hover, pressed } = await restHoverPressed(tab, `#${id}`);
          assert.equal(pressed.pressed, true, `${id} reports the press`);
          assert.ok(!same(fill(rest), fill(hover)), `${id} hover differs from rest`);
          assert.ok(!same(fill(pressed), fill(hover)) && !same(fill(pressed), fill(rest)), `${id} pressed differs from rest and hover`);
          assert.equal(pressed.backgroundImage, 'none', `${id} pressed clears the hover layer`);
          assert.equal((await paintOf(tab, `#${id}`)).ariaPressed, rest.ariaPressed, `${id} keeps its selection after a cancelled press`);
          const text = contrastRatio(pressed.color, over(pressed.background, pressed.ground));
          assert.ok(text >= 4.5, `${id} pressed label contrast ${text.toFixed(2)}:1`);
        }
        // Space held on the focused control shows the same pressed fill, and its release toggles it.
        const id = `${scheme}-off`;
        await tab.mouse.move(0, 0);
        await tab.locator(`#${id}`).focus();
        const before = await paintOf(tab, `#${id}`);
        await tab.keyboard.down('Space');
        await awaitFontsAndFrames(tab);
        const held = await paintOf(tab, `#${id}`);
        await tab.keyboard.up('Space');
        assert.equal(held.pressed, true, `${id} reports a held Space as pressed`);
        assert.ok(!same(fill(held), fill(before)), `${id} Space-held fill differs from its rest fill`);
        assert.equal((await paintOf(tab, `#${id}`)).ariaPressed, 'true', `${id} toggles when Space is released`);
        await tab.keyboard.press('Space');
        const grouped = await restHoverPressed(tab, `[data-probe="${scheme}-grouped"]`);
        assert.equal(grouped.pressed.pressed, true, 'the grouped button reports the press');
        assert.ok(same(fill(grouped.pressed), fill(grouped.hover)), `${scheme} grouped button keeps the group's paint when pressed`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test(`A quiet ToggleButton draws no outline or selected fill and steps its text colour, in ${engine}`, { timeout: 120_000 }, async () => {
    const { tab, errors, close } = await openPage(engine);
    try {
      for (const scheme of ['light', 'dark']) {
        const off = await restHoverPressed(tab, `#${scheme}-quiet-off`);
        const on = await restHoverPressed(tab, `#${scheme}-quiet-on`);
        assert.equal(off.rest.ariaPressed, 'false');
        assert.equal(on.rest.ariaPressed, 'true');
        for (const [name, paint] of [['off', off.rest], ['on', on.rest]]) {
          assert.equal(paint.background.a, 0, `${scheme} quiet ${name} has no fill`);
          assert.equal(paint.outline.a, 0, `${scheme} quiet ${name} has no outline`);
        }
        // The caller's glyph or label change is the cue that is not colour; the text colour adds a lightness step, not
        // only a change of hue (about 2.1:1 in light and 1.5:1 in dark with the default theme).
        const step = contrastRatio(on.rest.color, over(off.rest.color, off.rest.ground));
        assert.ok(step >= 1.4, `${scheme} quiet selected text steps from rest by ${step.toFixed(2)}:1`);
        assert.ok(contrastRatio(on.rest.color, on.rest.ground) >= 3, `${scheme} quiet selected glyph reads on its ground`);
        assert.ok(contrastRatio(off.rest.color, off.rest.ground) >= 3, `${scheme} quiet glyph reads on its ground`);
        for (const [name, run] of [['off', off], ['on', on]]) {
          assert.ok(run.hover.background.a > 0, `${scheme} quiet ${name} hover has a fill`);
          assert.ok(!same(run.pressed.background, run.hover.background), `${scheme} quiet ${name} pressed differs from hover`);
          assert.equal(run.pressed.outline.a, 0, `${scheme} quiet ${name} pressed draws no outline`);
        }
      }
      // A keyboard focus ring stays visible when the outline and fill are gone.
      await tab.locator('#light-quiet-on').focus();
      await tab.keyboard.press('Shift+Tab');
      await tab.keyboard.press('Tab');
      const ring = await tab.locator('#light-quiet-on').evaluate((element) => ({
        focused: document.activeElement === element,
        shadow: getComputedStyle(element).boxShadow,
      }));
      assert.equal(ring.focused, true);
      assert.notEqual(ring.shadow, 'none', 'the quiet ToggleButton shows a focus ring');
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test(`A default or quiet ToggleButton uses system colours under forced colours, in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { tab, errors, close } = await openPage(engine);
    try {
      await tab.emulateMedia({ forcedColors: 'active' });
      if (!(await tab.evaluate(() => matchMedia('(forced-colors: active)').matches))) {
        t.skip(`${engine} does not emulate forced colours`);
        return;
      }
      const system = await tab.evaluate(() => {
        const probe = document.createElement('span');
        document.body.append(probe);
        const read = (color) => { probe.style.color = color; return getComputedStyle(probe).color; };
        const colors = { ButtonText: read('ButtonText'), Highlight: read('Highlight'), HighlightText: read('HighlightText'), GrayText: read('GrayText') };
        probe.remove();
        return colors;
      });
      const read = (id) => tab.locator(`#${id}`).evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color, outline: style.outlineColor, opacity: style.opacity };
      });
      for (const scheme of ['light', 'dark']) {
        for (const variant of ['', 'quiet-']) {
          const name = `${scheme} ${variant || 'default-'}`;
          const off = await read(`${scheme}-${variant}off`);
          assert.deepEqual([off.color, off.outline], [system.ButtonText, system.ButtonText], `${name}text and edge are ButtonText`);
          const on = await read(`${scheme}-${variant}on`);
          assert.deepEqual([on.background, on.color], [system.Highlight, system.HighlightText], `${name}selected is Highlight`);
          const disabled = await read(`${scheme}-${variant}disabled`);
          assert.deepEqual([disabled.color, disabled.outline, disabled.opacity], [system.GrayText, system.GrayText, '1'], `${name}disabled is GrayText at full opacity`);
        }
      }
      const focusRing = (id) => tab.locator(`#${id}`).evaluate((element) => ({ active: document.activeElement === element, outline: getComputedStyle(element).outlineColor, width: getComputedStyle(element).outlineWidth }));
      // Keyboard focus, unselected and selected, then the quiet one. The first button is reached from the second, since
      // Shift+Tab from the first leaves the page.
      await tab.locator('#light-on').focus();
      await tab.keyboard.press('Shift+Tab');
      assert.deepEqual(await focusRing('light-off'), { active: true, outline: system.Highlight, width: '2px' }, 'the default focus outline is Highlight');
      await tab.keyboard.press('Tab');
      assert.deepEqual(await focusRing('light-on'), { active: true, outline: system.Highlight, width: '2px' }, 'the selected default focus outline is Highlight');
      await tab.locator('#light-quiet-off').focus();
      await tab.keyboard.press('Shift+Tab');
      await tab.keyboard.press('Tab');
      assert.deepEqual(await focusRing('light-quiet-off'), { active: true, outline: system.Highlight, width: '2px' }, 'the quiet focus outline is Highlight');
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });

  test(`preventFocusOnPress keeps focus and the text selection on a pointer press, and the keyboard still focuses, in ${engine}`, { timeout: 120_000 }, async () => {
    const { tab, errors, close } = await openPage(engine);
    try {
      const selectWord = () => tab.evaluate(() => {
        const editor = document.getElementById('editor');
        editor.focus();
        const range = document.createRange();
        range.setStart(editor.firstChild, 5);
        range.setEnd(editor.firstChild, 10);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      const state = (id) => tab.evaluate((target) => ({
        active: document.activeElement?.id ?? null,
        selected: getSelection().toString(),
        pressed: document.getElementById(target).getAttribute('aria-pressed'),
      }), id);

      await selectWord();
      await tab.locator('#kept').click();
      assert.deepEqual(await state('kept'), { active: 'editor', selected: 'words', pressed: 'true' }, 'a pointer press leaves focus and the selection in the editor');

      // The default still takes focus on a pointer press, so the case above is the option's doing.
      await selectWord();
      await tab.locator('#taken').click();
      assert.equal((await state('taken')).active, 'taken');

      // The keyboard reaches the tool and toggles it, with a visible ring.
      await tab.locator('#editor').focus();
      await tab.keyboard.press('Tab');
      const ring = await tab.locator('#kept').evaluate((element) => ({ focused: document.activeElement === element, shadow: getComputedStyle(element).boxShadow }));
      assert.equal(ring.focused, true, 'Tab focuses the tool');
      assert.notEqual(ring.shadow, 'none', 'the focused tool shows its ring');
      await tab.keyboard.press('Space');
      assert.equal((await state('kept')).pressed, 'false', 'Space toggles the focused tool');
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
}
