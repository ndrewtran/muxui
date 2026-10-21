import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Mux draws a SearchField's clear action, so the cancel button Chromium and
// WebKit add to a search input must not paint beside it. The native button lives
// in the input's UA shadow tree, so the proof reads pixels: between the text and
// Mux's clear button the field must be one flat background. Runs in every engine
// named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SearchField } from '/src/fields.ts';

createRoot(document.getElementById('root')).render(React.createElement(SearchField, { label: 'Search', defaultValue: 'mux' }));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root" style="width: 420px"></div>',
  entry: '/search-field-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`SearchField paints one clear action once it has text in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/fields.ts'],
      pages: { '/search-field.html': page },
      modules: { '/search-field-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 700, height: 300 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/search-field.html`, { waitUntil: 'networkidle' });
      const input = tab.getByRole('searchbox', { name: 'Search' });
      const clear = tab.getByRole('button', { name: 'Clear search' });
      await clear.waitFor();

      // Chromium shows its cancel button only while the input is focused or hovered,
      // WebKit whenever the field has text, so read both a blurred and a focused field.
      const stripColors = async () => {
        await tab.mouse.move(0, 0);
        const inputBox = await input.boundingBox();
        const clearBox = await clear.boundingBox();
        const x = Math.round(inputBox.x + inputBox.width / 2);
        const strip = { x, y: Math.round(inputBox.y) + 4, width: Math.round(clearBox.x) - 2 - x, height: Math.round(inputBox.height) - 8 };
        assert.ok(strip.width > 40, `the strip between the text and Mux's clear button is measurable: ${JSON.stringify(strip)}`);
        const image = await tab.screenshot({ clip: strip, caret: 'hide', animations: 'disabled' });
        return tab.evaluate(async (base64) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0);
          const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
          const seen = new Set();
          for (let index = 0; index < data.length; index += 4) seen.add(`${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`);
          return [...seen];
        }, image.toString('base64'));
      };
      await tab.evaluate(() => document.activeElement?.blur());
      assert.equal((await stripColors()).length, 1, 'a blurred field paints only its background before Mux\'s clear button');
      await input.focus();
      assert.equal((await stripColors()).length, 1, 'a focused field paints only its background before Mux\'s clear button');

      // The one remaining action still clears the field.
      await clear.click();
      assert.equal(await input.inputValue(), '');
      await clear.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
