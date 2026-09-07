import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Slider } from '../../src/collections.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

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
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,read-only-slider"><style>.muxui-slider { width: 400px; } .muxui-slider-track { height: 24px; }</style></head><body>${body}<script type="module" src="/packages/react/test/fixtures/read-only-slider-browser-entry.mjs"></script></body></html>`;
}

test('real browser read-only Slider blocks keyboard and pointer changes while retaining focus', { timeout: 90_000 }, async () => {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'read-only-slider-fixture-document',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/read-only-slider.html') {
            response.statusCode = 200;
            response.setHeader('content-type', 'text/html');
            response.end(fixtureDocument());
            return;
          }
          next();
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(typeof address, 'object');
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${address.port}/read-only-slider.html`, { waitUntil: 'networkidle' });

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
    await server.close();
  }
});
