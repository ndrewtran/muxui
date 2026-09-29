import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { ColorArea, ColorSlider, ColorSwatch, ColorWheel, Virtualizer } from '../../src/collections.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function Fixture() {
  return React.createElement('div', { id: 'proof-fixture' },
    React.createElement(ColorArea, {
      'aria-label': 'Read-only color area',
      defaultValue: '#ff0000',
      readOnly: true,
      onChange: () => {},
    }),
    React.createElement(ColorSlider, {
      'aria-label': 'Read-only red channel',
      channel: 'red',
      defaultValue: '#ff0000',
      readOnly: true,
      onChange: () => {},
    }),
    React.createElement(ColorWheel, {
      'aria-label': 'Read-only color wheel',
      defaultValue: '#ff0000',
      innerRadius: 20,
      outerRadius: 40,
      readOnly: true,
      onChange: () => {},
    }),
    React.createElement(ColorSwatch, { color: '#ff0000', disabled: true }),
    React.createElement(Virtualizer, {
      'aria-label': 'Overscan proof list',
      height: 120,
      itemHeight: 40,
      items: Array.from({ length: 50 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` })),
      overscan: 2,
    }),
  );
}

function fixtureDocument() {
  const body = renderToStaticMarkup(React.createElement('div', { id: 'root' }, React.createElement(Fixture)));
  return pageShell({ head: `<style>
    body { margin: 0; }
    .muxui-color-area { width: 220px; height: 160px; }
    .muxui-color-slider { width: 220px; }
    .muxui-color-slider-track { height: 24px; }
    .muxui-color-wheel { width: 96px; height: 96px; }
  </style>`, body, entry: '/packages/react/test/fixtures/read-only-colors-virtualizer-browser-entry.mjs' });
}

test('real browser proves read-only color controls, disabled swatch semantics, and fixed overscan', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', pages: { '/read-only-colors-virtualizer.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/read-only-colors-virtualizer.html`, { waitUntil: 'networkidle' });
    await page.locator('.muxui-color-area').waitFor();
    assert.deepEqual(errors, [], errors.join('\n'));

    const readOnlyTargets = page.locator('.muxui-color-area input[type="range"], .muxui-color-slider input[type="range"], .muxui-color-wheel input[type="range"]');
    const targetCount = await readOnlyTargets.count();
    assert.ok(targetCount >= 4, `expected color controls to expose range targets, got ${targetCount}`);
    const initialValues = await readOnlyTargets.evaluateAll((targets) => targets.map((target) => target.value));
    for (let index = 0; index < targetCount; index += 1) {
      const target = readOnlyTargets.nth(index);
      await target.focus();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-readonly')), 'true');
      await target.press('ArrowRight');
      await target.press('End');
      await target.evaluate((node) => {
        for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
          node.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
        }
      });
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-readonly')), 'true');
    }
    assert.deepEqual(await readOnlyTargets.evaluateAll((targets) => targets.map((target) => target.value)), initialValues);
    assert.deepEqual(await page.evaluate(() => globalThis.__muxuiReadOnlyColorChanges), []);

    const disabledSwatch = page.locator('.muxui-color-swatch[data-disabled="true"]');
    await disabledSwatch.waitFor({ state: 'attached' });
    assert.equal(await disabledSwatch.getAttribute('role'), 'img');
    assert.equal(await disabledSwatch.getAttribute('data-disabled'), 'true');

    const viewport = page.locator('.muxui-virtualizer');
    await viewport.waitFor();
    await page.locator('.muxui-virtualizer-item').first().waitFor();
    const initialLayout = await viewport.evaluate((node) => ({
      blockSize: getComputedStyle(node).blockSize,
      items: [...node.querySelectorAll('[role="option"]')].map((item) => item.textContent),
    }));
    assert.equal(initialLayout.blockSize, '120px');
    assert.deepEqual(initialLayout.items, ['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4']);

    await viewport.evaluate((node) => {
      node.scrollTop = 400;
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelector('.muxui-virtualizer')?.querySelector('[role="option"]')?.textContent === 'Item 8');
    const scrolledLayout = await viewport.evaluate((node) => ({
      blockSize: getComputedStyle(node).blockSize,
      items: [...node.querySelectorAll('[role="option"]')].map((item) => item.textContent),
    }));
    assert.equal(scrolledLayout.blockSize, initialLayout.blockSize);
    assert.deepEqual(scrolledLayout.items, ['Item 8', 'Item 9', 'Item 10', 'Item 11', 'Item 12', 'Item 13', 'Item 14']);
  } finally {
    await browser?.close();
    await close();
  }
});
