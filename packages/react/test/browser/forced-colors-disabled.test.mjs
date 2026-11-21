import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Under forced colours a disabled item keeps full opacity, because dimming only lowers contrast in a mode meant to
// raise it, and its text takes the system GrayText colour, so it still reads as disabled beside an enabled item. An
// enabled item keeps its colour. A disabled item that is selected keeps its selected colours in the families whose
// selected rule paints the Highlight pair, and takes GrayText in the rest. Each disabled item is read where its text
// paints, since a descendant with its own colour does not inherit the item's.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs) that can emulate forced colours.

const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { ColorArea, ColorSlider, ColorSwatchPicker, ColorWheel, ComboBox, GridList, ListBox, Menu, RadioGroup, Select, Slider, Table, Tabs, Tree } from '/src/collections.mjs';
  import '/generated/styles.css';
  const h = React.createElement;
  const items = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two', disabled: true }];
  const rows = [{ id: 'one', values: { name: 'One' } }, { id: 'two', values: { name: 'Two' }, disabled: true }];
  const columns = [{ id: 'name', label: 'Name', isRowHeader: true }];
  const cases = {
    collections: () => h('div', null,
      h(ListBox, { 'aria-label': 'List', items }),
      h(GridList, { 'aria-label': 'Grid', items }),
      h(Table, { 'aria-label': 'Table', columns, rows }),
      h(Tree, { 'aria-label': 'Tree', items }),
      h(Tabs, { 'aria-label': 'Tabs', items }),
      h(RadioGroup, { label: 'Radio', options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two', disabled: true }] }),
      h(Slider, { label: 'Slider', disabled: true }),
      h(ColorArea, { label: 'Area', defaultValue: '#f00', disabled: true }),
      h(ColorSlider, { label: 'Hue', channel: 'hue', colorSpace: 'hsl', defaultValue: '#f00', disabled: true }),
      h(ColorWheel, { 'aria-label': 'Wheel', defaultValue: '#f00', disabled: true }),
      h(ColorSwatchPicker, { 'aria-label': 'Swatches', items: [{ id: 'red', color: '#f00' }, { id: 'blue', color: '#00f', disabled: true }] })),
    // Wholly disabled collections whose first item is selected.
    selected: () => h('div', null,
      h(ListBox, { 'aria-label': 'List', items, disabled: true, selectionMode: 'single', defaultSelectedIds: ['one'] }),
      h(GridList, { 'aria-label': 'Grid', items, disabled: true, selectionMode: 'single', defaultSelectedIds: ['one'] }),
      h(Table, { 'aria-label': 'Table', columns, rows, disabled: true, selectionMode: 'single', defaultSelectedIds: ['one'] }),
      h(Tree, { 'aria-label': 'Tree', items, disabled: true, selectionMode: 'single', defaultSelectedIds: ['one'] }),
      h(Tabs, { 'aria-label': 'Tabs', items, disabled: true, variant: 'underline' }),
      h(RadioGroup, { label: 'Radio', disabled: true, defaultValue: 'one', options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] })),
    menu: () => h(Menu.Root, { defaultOpen: true },
      h(Menu.Trigger, null, 'Actions'),
      h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Actions', items }))),
    'combo-box': () => h(ComboBox, { label: 'Town', items }),
    select: () => h(Select, { label: 'Town', items }),
    // Lists whose disabled option is the selected one.
    'combo-box-selected': () => h(ComboBox, { label: 'Town', items, selectedId: 'two', value: 'Two' }),
    'select-selected': () => h(Select, { label: 'Town', items, defaultValue: 'two' }),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

let server;
before(async () => {
  server = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/forced-colors.html': pageShell({ body: '<div id="root"></div>', entry: '/forced-colors-entry.mjs' }) },
    modules: { '/forced-colors-entry.mjs': entry },
  });
});
after(async () => {
  await server?.close();
});

// Each matched element's disabled hook, opacity, and the colour of the element that paints its first text.
const read = (page, selector) => page.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
  const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (child) => (child.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) }).nextNode();
  return {
    disabled: node.hasAttribute('data-muxui-state-disabled') || node.getAttribute('aria-disabled') === 'true',
    opacity: Number(getComputedStyle(node).opacity),
    text: text ? getComputedStyle(text.parentElement).color : undefined,
  };
}));

for (const engine of browserEngines()) {
  test(`disabled collection items keep full opacity and take GrayText under forced colours in ${engine}`, { skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
    const browser = await launchBrowser(engine);
    const page = await browser.newPage();
    try {
      await page.emulateMedia({ forcedColors: 'active' });
      const open = async (name) => {
        await page.goto(`${server.url}/forced-colors.html?case=${name}`, { waitUntil: 'load' });
        await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, name);
        await awaitFontsAndFrames(page);
      };
      const system = (name) => page.evaluate((value) => {
        const probe = document.body.appendChild(document.createElement('span'));
        probe.style.color = value;
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, name);

      // An enabled item and a disabled one: the disabled one is undimmed and GrayText, the enabled one is not GrayText.
      const pair = async (family, selector, { textColor = true } = {}) => {
        const grayText = await system('GrayText');
        const [enabled, disabled, ...rest] = await read(page, selector);
        assert.deepEqual(rest, [], `${family}: two items`);
        assert.deepEqual([enabled.disabled, disabled.disabled], [false, true], `${family}: the second item is disabled`);
        assert.deepEqual([enabled.opacity, disabled.opacity], [1, 1], `${family}: no item is dimmed`);
        if (!textColor) return;
        assert.equal(disabled.text, grayText, `${family}: the disabled item's text is GrayText`);
        assert.notEqual(enabled.text, grayText, `${family}: the enabled item's text is not GrayText`);
      };
      // A disabled control with no enabled sibling: undimmed, every part of it. Its label keeps CanvasText, as a disabled field's does.
      const whole = async (family, selector) => {
        const parts = await read(page, selector);
        assert.ok(parts.length > 0, `${family}: rendered`);
        assert.ok(parts.every(({ disabled }) => disabled), `${family}: disabled`);
        assert.deepEqual(parts.map(({ opacity }) => opacity), parts.map(() => 1), `${family}: no part is dimmed`);
      };

      await open('collections');
      await pair('ListBox', '.muxui-list-box__item');
      await pair('GridList', '.muxui-grid-list__item');
      await pair('Table', '.muxui-table__row');
      await pair('Tree', '.muxui-tree__item');
      await pair('Tabs', '.muxui-tabs__tab');
      await pair('RadioGroup', '.muxui-radio-group__radio');
      // Swatches carry no text, so only their opacity says anything.
      await pair('ColorSwatchPicker', '.muxui-color-swatch-picker__item', { textColor: false });
      await whole('Slider', '.muxui-slider');
      await whole('ColorArea', '.muxui-color-area, .muxui-color-area__thumb');
      await whole('ColorSlider', '.muxui-color-slider, .muxui-color-slider__thumb');
      await whole('ColorWheel', '.muxui-color-wheel, .muxui-color-wheel__thumb');

      await open('menu');
      await page.locator('.muxui-menu__item').first().waitFor();
      await pair('Menu', '.muxui-menu__item');

      await open('combo-box');
      await page.locator('.muxui-combo-box__trigger').click();
      await page.locator('.muxui-combo-box__option').first().waitFor();
      await pair('ComboBox', '.muxui-combo-box__option');

      await open('select');
      await page.locator('.muxui-select__trigger').click();
      await page.locator('.muxui-select__option').first().waitFor();
      await pair('Select', '.muxui-select__option');

      // A disabled item that is selected: never GrayText on a Highlight fill, and GrayText where there is none.
      await open('selected');
      const grayText = await system('GrayText');
      const highlightText = await system('HighlightText');
      for (const [family, selector, keepsSelected] of [
        ['ListBox', '.muxui-list-box__item', true],
        ['Table', '.muxui-table__row', true],
        ['Tabs', '.muxui-tabs__tab', true],
        ['GridList', '.muxui-grid-list__item', false],
        ['Tree', '.muxui-tree__item', false],
        ['RadioGroup', '.muxui-radio-group__radio', false],
      ]) {
        const [selected] = await read(page, selector);
        assert.deepEqual([selected.disabled, selected.opacity], [true, 1], `${family}: the selected disabled item is undimmed`);
        if (keepsSelected) assert.notEqual(selected.text, grayText, `${family}: the selected disabled item keeps its selected colours`);
        else assert.equal(selected.text, grayText, `${family}: the selected disabled item's text is GrayText`);
      }
      assert.equal((await read(page, '.muxui-list-box__item'))[0].text, highlightText, 'ListBox: the selected disabled item keeps HighlightText');
      for (const [family, name, part] of [['ComboBox', 'combo-box-selected', 'combo-box'], ['Select', 'select-selected', 'select']]) {
        await open(name);
        await page.locator(`.muxui-${part}__trigger`).click();
        await page.locator(`.muxui-${part}__option`).first().waitFor();
        const [, selected] = await read(page, `.muxui-${part}__option`);
        const marked = await page.locator(`.muxui-${part}__option`).nth(1).getAttribute('aria-selected');
        assert.deepEqual([selected.disabled, marked, selected.opacity], [true, 'true', 1], `${family}: the selected disabled option is undimmed`);
        assert.equal(selected.text, grayText, `${family}: the selected disabled option's text is GrayText`);
      }
    } finally {
      await browser.close();
    }
  });
}
