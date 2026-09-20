import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { SelectNativeBrowserFixture } from '../fixtures/select-native-browser-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

test('SelectNative hydrates as a native form control and preserves browser focus/reset behavior', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { SelectNativeBrowserFixture } from '/test/fixtures/select-native-browser-fixture.mjs';
    import '/src/styles/base.css';
    import '/src/supplemental/styles.css';
    import '/src/supplemental/select-native.css';
    hydrateRoot(document.getElementById('root'), React.createElement(SelectNativeBrowserFixture));`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><div id="root">${renderToString(React.createElement(SelectNativeBrowserFixture))}</div><script type="module" src="/select-native-browser-entry.mjs"></script></body></html>`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'muxui-select-native-vite-'));
  const server = await createServer({
    configFile: false,
    root: join(repositoryRoot, 'packages/react'),
    cacheDir,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/supplemental/select-native.mjs'], include: ['react', 'react-dom/client', 'react-aria'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'select-native-fixture',
      resolveId(id) {
        if (id === '/select-native-browser-entry.mjs') return fileURLToPath(new URL('../fixtures/select-native-browser-entry.mjs', import.meta.url));
      },
      load(id) {
        if (id === fileURLToPath(new URL('../fixtures/select-native-browser-entry.mjs', import.meta.url))) return entry;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/select-native.html') {
            response.setHeader('content-type', 'text/html');
            response.end(html);
          } else next();
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/select-native.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'SELECT');
    assert.deepEqual(errors, []);

    const select = page.locator('#panel');
    assert.equal(await select.getAttribute('title'), 'Saved panel URL');
    assert.equal(await select.getAttribute('size'), null);
    assert.equal(await select.getAttribute('data-size'), 'sm');
    assert.equal(await select.evaluate((node) => getComputedStyle(node).appearance), 'auto');
    assert.equal(await select.locator('option').count(), 3);
    assert.equal(await select.locator('optgroup').getAttribute('label'), 'Workspaces');
    assert.equal(await select.getAttribute('aria-labelledby') !== null, true);
    assert.equal(await select.getAttribute('aria-describedby') !== null, true);

    await select.selectOption('research');
    assert.equal(await page.locator('#selected').textContent(), 'research');
    assert.equal(await page.locator('#last-change').textContent(), 'research');
    await select.focus();
    assert.equal(await select.evaluate((node) => document.activeElement === node), true);
    await page.locator('#submit').click();
    assert.equal(await page.locator('#submitted').textContent(), 'research');
    await page.locator('#reset').click();
    assert.equal(await select.inputValue(), 'inbox');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
