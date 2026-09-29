import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { Slider } from '../../src/collections.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function fixtureDocument() {
  const body = renderToStaticMarkup(React.createElement('div', { id: 'root' }, React.createElement(Slider, {
    'aria-label': 'Read-only volume',
    defaultValue: 50,
    max: 100,
    min: 0,
    onChange: () => {},
    readOnly: true,
    step: 1,
  })));
  return pageShell({ head: '<style>.muxui-slider { width: 400px; } .muxui-slider-track { height: 24px; }</style>', body, entry: '/packages/react/test/fixtures/read-only-slider-browser-entry.mjs' });
}

test('real browser read-only Slider blocks keyboard and pointer changes while retaining focus', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', pages: { '/read-only-slider.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/read-only-slider.html`, { waitUntil: 'networkidle' });

    const slider = page.locator('.muxui-slider input[type="range"]');
    await slider.waitFor();
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.equal(await slider.inputValue(), '50');
    assert.equal(await slider.getAttribute('aria-readonly'), 'true');
    await slider.focus();
    const inputId = await slider.getAttribute('id');
    assert.equal(await page.evaluate(() => document.activeElement?.id), inputId);

    for (const key of ['ArrowRight', 'End', 'ArrowLeft', 'Home']) await page.keyboard.press(key);
    assert.equal(await slider.inputValue(), '50');
    assert.deepEqual(await page.evaluate(() => globalThis.__muxuiReadOnlySliderChanges), []);
    assert.equal(await page.evaluate(() => document.activeElement?.id), inputId);

    const track = page.locator('.muxui-slider-track');
    const box = await track.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.up();
    assert.equal(await slider.inputValue(), '50');
    assert.deepEqual(await page.evaluate(() => globalThis.__muxuiReadOnlySliderChanges), []);
    assert.equal(await page.evaluate(() => document.activeElement?.id), inputId);
  } finally {
    await browser?.close();
    await close();
  }
});
