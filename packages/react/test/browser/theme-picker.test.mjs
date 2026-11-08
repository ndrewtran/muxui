import assert from 'node:assert/strict';
import test from 'node:test';
import { MUXUI_THEME_ACTION_BACKGROUNDS, MUXUI_THEME_PRESETS } from '../../generated/themes.mjs';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

// One picker in the page's own scheme, one inside a scope that sets the opposite scheme, and buttons around them
// to measure the tab stops. The page loads styles.css and never themes.css.
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ThemePicker } from '/generated/theme-picker.js';
const e = React.createElement;
const root = createRoot(document.querySelector('#root'));
window.changes = [];
let generation = 0;
// Each mount is a fresh picker, so an uncontrolled one starts from its own defaultValue.
window.mount = (props = {}) => flushSync(() => root.render(e('main', null,
  e('button', { id: 'before' }, 'Before'),
  e('div', { id: 'page' }, e(ThemePicker, { key: generation++, onChange: (value) => window.changes.push(value), ...props })),
  e('button', { id: 'after' }, 'After'),
  e('div', { id: 'island', 'data-muxui-color-scheme': 'light' }, e(ThemePicker, { 'aria-label': 'Island theme' })),
)));
window.mount({ random: true, defaultValue: 'standard-harbour' });
document.documentElement.dataset.ready = 'true';
`;
const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root" style="inline-size:320px"></div>',
  entry: '/theme-picker-entry.mjs',
});

const rgb = (hex) => `rgb(${[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;

test('ThemePicker keeps one tab stop, moves and selects by arrow keys, and shows its swatches in the scheme in force', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['generated/theme-picker.js'], pages: { '/theme-picker.html': page }, modules: { '/theme-picker-entry.mjs': entry } });
  const browser = await launchBrowser();
  try {
    const tab = await browser.newPage({ viewport: { width: 480, height: 900 } });
    const errors = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await tab.goto(`${server.url}/theme-picker.html`, { waitUntil: 'load' });
    await tab.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    await awaitFontsAndFrames(tab);

    const group = tab.locator('#page [role="radiogroup"]');
    const focused = () => tab.evaluate(() => document.activeElement.value || document.activeElement.id);
    const selected = () => tab.evaluate(() => document.querySelector('#page input:checked')?.value ?? null);

    // The page carries no preset stylesheet, and the group has a name, a layout of four columns, and Random on a row of its own.
    assert.equal(await tab.evaluate(() => [...document.styleSheets].some((sheet) => /themes\.css/u.test(sheet.href ?? ''))), false);
    assert.equal(await group.getAttribute('aria-label'), 'Theme');
    const box = (selector) => tab.locator(selector).first().boundingBox();
    const options = await tab.locator('#page .muxui-theme-picker__grid').first().locator('.muxui-theme-picker__option').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    assert.equal(new Set(options.map(({ top }) => Math.round(top))).size, 2, 'eight Standard presets make two rows of four');
    assert.equal(new Set(options.slice(0, 4).map(({ top }) => Math.round(top))).size, 1);
    const random = await box('#page .muxui-theme-picker__option--random');
    const grid = await box('#page .muxui-theme-picker__grid');
    assert.ok(random.y + random.height <= grid.y && random.width > grid.width / 2, 'Random is a row above the grid');

    // Names: a repeated name carries its collection; the visible label does not.
    assert.equal(await tab.locator('#page').getByRole('radio', { name: 'Monochrome Terracotta' }).count(), 1);
    assert.equal(await tab.locator('#page').getByRole('radio', { name: 'Terracotta', exact: true }).count(), 1);

    // One tab stop: Tab enters on the selected option and the next Tab leaves the whole group.
    await tab.locator('#before').focus();
    await tab.keyboard.press('Tab');
    assert.equal(await focused(), 'standard-harbour');
    assert.notEqual(await tab.locator('#page input:focus').locator('xpath=ancestor::label').evaluate((node) => getComputedStyle(node).outlineStyle), 'none', 'a keyboard focus ring');
    await tab.keyboard.press('Tab');
    assert.equal(await focused(), 'after');
    await tab.keyboard.press('Shift+Tab');
    assert.equal(await focused(), 'standard-harbour');

    // Arrow keys move focus and select; Up and Down move by a row, across the headings.
    await tab.keyboard.press('ArrowRight');
    assert.deepEqual([await focused(), await selected()], ['standard-lagoon', 'standard-lagoon']);
    await tab.keyboard.press('ArrowDown');
    assert.deepEqual([await focused(), await selected()], ['standard-terracotta', 'standard-terracotta']);
    await tab.keyboard.press('ArrowDown');
    assert.deepEqual([await focused(), await selected()], ['monochrome-forest', 'monochrome-forest']);
    await tab.keyboard.press('ArrowUp');
    await tab.keyboard.press('ArrowUp');
    await tab.keyboard.press('ArrowUp');
    assert.deepEqual([await focused(), await selected()], ['random', 'random'], 'Random is the row above the first preset row');
    await tab.keyboard.press('End');
    assert.equal(await selected(), 'monochrome-terracotta');
    await tab.keyboard.press('Home');
    assert.equal(await selected(), 'random');
    assert.deepEqual(await tab.evaluate(() => window.changes), ['standard-lagoon', 'standard-terracotta', 'monochrome-forest', 'standard-terracotta', 'standard-lagoon', 'random', 'monochrome-terracotta', 'random']);

    // Nothing selected: Tab still enters the group once.
    await tab.evaluate(() => window.mount({ random: true }));
    await tab.locator('#before').focus();
    await tab.keyboard.press('Tab');
    assert.equal(await focused(), 'random');
    await tab.keyboard.press('Tab');
    assert.equal(await focused(), 'after');
    await tab.evaluate(() => window.mount({ random: true, defaultValue: 'standard-fern' }));

    // The selected swatch has a ring, and the page's scheme picks which colour every swatch shows.
    const swatch = (scope, id) => tab.locator(`${scope} label:has(input[value="${id}"]) .muxui-theme-picker__swatch`);
    assert.notEqual(await swatch('#page', 'standard-fern').evaluate((node) => getComputedStyle(node).boxShadow), 'none');
    assert.equal(await swatch('#page', 'standard-harbour').evaluate((node) => getComputedStyle(node).boxShadow), 'none');
    for (const scheme of ['light', 'dark']) {
      await tab.evaluate((value) => { document.documentElement.dataset.muxuiColorScheme = value; }, scheme);
      for (const { id } of MUXUI_THEME_PRESETS) {
        const actionBackground = MUXUI_THEME_ACTION_BACKGROUNDS[id];
        assert.equal(await swatch('#page', id).evaluate((node) => getComputedStyle(node).backgroundColor), rgb(actionBackground[scheme]), `${id} in ${scheme}`);
        // A scope that sets its own scheme wins over the page's.
        assert.equal(await swatch('#island', id).evaluate((node) => getComputedStyle(node).backgroundColor), rgb(actionBackground.light), `${id} in a light scope`);
      }
    }

    // Forced colors keep the theme's colour and outline the selection; reduced motion drops the swatch transition.
    await tab.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    const forced = await swatch('#page', 'standard-fern').evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, outline: style.outlineStyle, transition: style.transitionDuration };
    });
    assert.deepEqual(forced, { background: rgb(MUXUI_THEME_ACTION_BACKGROUNDS['standard-fern'].dark), outline: 'solid', transition: '0s' });

    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
