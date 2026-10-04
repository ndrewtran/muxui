import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// Each read-only control sits between two buttons so Tab and Shift+Tab can
// prove focus leaves it in both directions.
function ReadOnlyKeyboardFixture() {
  const h = React.createElement;
  const swatches = [{ id: 'red', color: '#ff0000' }, { id: 'green', color: '#00ff00' }, { id: 'blue', color: '#0000ff' }];
  const cases = [
    ['slider', h('form', { id: 'slider-form' }, h(Slider, { 'aria-label': 'Volume', name: 'volume', readOnly: true, defaultValue: 50 }))],
    ['color-slider', h(ColorSlider, { 'aria-label': 'Red', readOnly: true, defaultValue: '#804020' })],
    ['color-area', h(ColorArea, { 'aria-label': 'Color area', readOnly: true, defaultValue: '#804020' })],
    ['color-wheel', h(ColorWheel, { 'aria-label': 'Hue', readOnly: true, defaultValue: 'hsl(30, 100%, 50%)' })],
    ['swatch-picker', h(ColorSwatchPicker, { 'aria-label': 'Swatches', readOnly: true, defaultValue: '#ff0000', items: swatches })],
    ['picker-area', h(ColorPicker, { readOnly: true, defaultValue: '#804020' }, h(ColorArea, { 'aria-label': 'Picker area' }))],
    ['picker-slider', h(ColorPicker, { readOnly: true, defaultValue: '#804020' }, h(ColorSlider, { 'aria-label': 'Picker red' }))],
    ['picker-swatches', h(ColorPicker, { readOnly: true, defaultValue: '#ff0000' }, h(ColorSwatchPicker, { 'aria-label': 'Picker swatches', items: swatches }))],
  ];
  return h('main', null, cases.map(([id, control]) => h('section', { key: id, id, style: { margin: '16px 0' } },
    h('button', { type: 'button', className: 'before' }, `Before ${id}`),
    control,
    h('button', { type: 'button', className: 'after' }, `After ${id}`))));
}

test('real browser read-only sliders, colour controls, and pickers release Tab and Shift+Tab', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { ColorArea, ColorPicker, ColorSlider, ColorSwatchPicker, ColorWheel, Slider } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${ReadOnlyKeyboardFixture.toString()}
    createRoot(document.getElementById('root')).render(React.createElement(ReadOnlyKeyboardFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/read-only-keyboard.html': pageShell({ body: '<div id="root"></div>', entry: '/read-only-keyboard-entry.mjs' }) },
    modules: { '/read-only-keyboard-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 2400 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/read-only-keyboard.html`, { waitUntil: 'networkidle' });
    await page.locator('#picker-swatches .after').waitFor();
    const focusedClass = () => page.evaluate(() => document.activeElement?.className ?? '');
    const focusedOption = () => page.evaluate(() => document.activeElement?.getAttribute('role') === 'option' ? document.activeElement.getAttribute('data-key') : null);
    // Hidden range inputs carry slider values; listboxes report the selected option.
    const state = (id) => page.evaluate((sectionId) => {
      const section = document.getElementById(sectionId);
      return [...section.querySelectorAll('input[type="range"], [role="option"][aria-selected="true"]')]
        .map((node) => node.value ?? node.getAttribute('data-key')).join('|');
    }, id);

    for (const id of ['slider', 'color-slider', 'color-area', 'color-wheel', 'swatch-picker', 'picker-area', 'picker-slider', 'picker-swatches']) {
      const swatches = id.includes('swatch');
      await page.locator(`#${id} .before`).focus();
      await page.keyboard.press('Tab');
      const initial = await state(id);
      const control = await page.evaluate(() => document.activeElement?.closest('section')?.id);
      assert.equal(control, id, `${id} control receives Tab focus`);
      assert.doesNotMatch(await focusedClass(), /before|after/u, `${id} focus is on the control`);

      if (swatches) {
        const first = await focusedOption();
        await page.keyboard.press('ArrowRight');
        assert.notEqual(await focusedOption(), first, `${id} arrows still move focus between swatches`);
        // Selection keys stay blocked with any modifier held.
        for (const modifier of ['', 'Shift+', 'Alt+', 'Control+', 'Meta+']) {
          await page.keyboard.press(`${modifier}Enter`);
          await page.keyboard.press(`${modifier}Space`);
        }
      } else {
        // React Aria adjusts on these keys whatever modifier is held, so all are blocked.
        for (const modifier of ['', 'Shift+', 'Alt+', 'Control+', 'Meta+']) {
          for (const key of ['ArrowRight', 'ArrowUp', 'PageUp', 'Home', 'End']) await page.keyboard.press(`${modifier}${key}`);
        }
      }
      assert.equal(await state(id), initial, `${id} keeps its read-only value`);
      if (id === 'slider') assert.equal(await page.evaluate(() => new FormData(document.querySelector('#slider-form')).get('volume')), '50', 'read-only FormData stays unchanged');

      await page.keyboard.press('Tab');
      assert.match(await focusedClass(), /after/u, `${id} releases Tab`);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement?.closest('section')?.id), id);
      assert.doesNotMatch(await focusedClass(), /before|after/u, `${id} takes Shift+Tab focus back`);
      await page.keyboard.press('Shift+Tab');
      assert.match(await focusedClass(), /before/u, `${id} releases Shift+Tab`);
    }
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
