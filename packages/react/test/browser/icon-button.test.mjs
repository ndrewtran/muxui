import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { IconButtonFixture } from '../fixtures/icon-button-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

test('IconButton hydrates, activates by keyboard, preserves pending focus/name/size, and submits forms', { timeout: 90_000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${renderToString(React.createElement(IconButtonFixture))}</div><script type="module" src="/packages/react/test/fixtures/icon-button-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false, root: repositoryRoot, logLevel: 'error',
    optimizeDeps: { entries: ['packages/react/test/fixtures/icon-button-browser-entry.mjs'], include: ['react', 'react-dom/client'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'icon-button-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/icon-button.html') return next();
        response.setHeader('content-type', 'text/html'); response.end(html);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/icon-button.html`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('data-ready'), 'BUTTON');
    const action = page.getByRole('button', { name: 'Close panel', exact: true });
    await action.focus();
    await action.press('Enter');
    await action.press(' ');
    assert.equal(await page.locator('#count').textContent(), '2');
    const before = await action.boundingBox();
    await page.locator('#toggle-pending').click();
    await action.focus();
    await action.press('Enter');
    await action.press(' ');
    assert.equal(await page.locator('#count').textContent(), '2');
    assert.equal(await action.evaluate((node) => document.activeElement === node), true);
    const after = await action.boundingBox();
    assert.equal(after.width, before.width); assert.equal(after.height, before.height);
    assert.equal(await action.getAttribute('aria-busy'), 'true');
    assert.equal(await page.getByRole('button', { name: 'External label', exact: true }).count(), 1);
    assert.equal(await page.locator('#disabled').isDisabled(), true);
    await page.locator('#disabled').click({ force: true });
    assert.equal(await page.locator('#count').textContent(), '2');
    await page.locator('#toggle-pending').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#labelled').evaluate((node) => document.activeElement === node), true);
    for (const mode of ['light', 'dark']) {
      await page.locator('html').evaluate((node, value) => node.setAttribute('data-muxui-color-scheme', value), mode);
      const widths = [];
      for (const size of ['sm', 'md', 'lg']) {
        const box = await page.locator(`#size-${size}`).boundingBox();
        const buttonMinimum = await page.locator(`#button-${size}`).evaluate((node) => parseFloat(getComputedStyle(node).minHeight));
        assert.equal(box.width, box.height, `${mode}/${size} must be square`);
        assert.ok(box.width >= 24, `${mode}/${size} target is too small`);
        assert.equal(box.height, buttonMinimum, `${mode}/${size} follows Button minimum size`);
        widths.push(box.width);
      }
      assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
    }
    assert.equal(await action.locator('.muxui-button-spinner').evaluate((node) => getComputedStyle(node).animationName), 'none');
    await page.getByRole('button', { name: 'Save form', exact: true }).click();
    assert.equal(await page.locator('#submitted').textContent(), 'save');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
