import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { TagSelect } from '../../src/supplemental/index.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const virtualEntryId = fileURLToPath(new URL('./.tag-select-focus-entry.mjs', import.meta.url));
const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function findChrome() {
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

function TagSelectFocusFixture() {
  const items = [
    { id: 'alpha', label: 'Alpha' },
    { id: 'beta', label: 'Beta' },
  ];
  const [selectedKeys, setSelectedKeys] = React.useState(() => new Set(['alpha', 'beta']));
  React.useEffect(() => {
    window.__resetTagSelect = () => setSelectedKeys(new Set(['alpha', 'beta']));
    return () => { delete window.__resetTagSelect; };
  }, []);
  return React.createElement(React.Fragment, null,
    React.createElement(TagSelect.Root, {
      label: 'Tags',
      items,
      selectedKeys,
      onSelectionChange: setSelectedKeys,
    }, (item) => React.createElement(TagSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    React.createElement('output', { 'data-testid': 'selected' }, [...selectedKeys].join('|')));
}

const browserEntry = `import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TagSelect } from '/src/supplemental/index.mjs';
${TagSelectFocusFixture.toString()}
hydrateRoot(document.getElementById('root'), React.createElement(TagSelectFocusFixture));
document.documentElement.dataset.ready = 'true';
`;

const html = `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"></head><body><div id="root">${renderToString(React.createElement(TagSelectFocusFixture))}</div><script type="module" src="/tag-select-focus-entry.mjs"></script></body></html>`;

test('TagSelect chip removal keeps ComboBox focus and popup behavior independent', { timeout: 60_000 }, async () => {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    optimizeDeps: {
      entries: ['src/supplemental/index.mjs'],
      include: ['react', 'react-dom/client', 'react-aria-components'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'tag-select-focus-entry',
      resolveId(id) {
        if (id === '/tag-select-focus-entry.mjs') return virtualEntryId;
      },
      load(id) {
        if (id === virtualEntryId) return browserEntry;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== '/tag-select-focus.html') return next();
          response.setHeader('content-type', 'text/html');
          response.end(html);
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.ok(address && typeof address === 'object');
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${address.port}/tag-select-focus.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && window.__resetTagSelect);

    await page.getByRole('button', { name: 'Remove Beta', exact: true }).click();
    await page.getByTestId('selected').filter({ hasText: /^alpha$/u }).waitFor();
    assert.equal(await page.locator('.muxui-tag-select__popup').count(), 0, 'pointer removal does not open the ComboBox popup');

    await page.evaluate(() => window.__resetTagSelect());
    const input = page.getByRole('combobox', { name: 'Tags' });
    await input.focus();
    await page.keyboard.press('Escape');
    await page.locator('.muxui-tag-select__popup').waitFor({ state: 'detached' });
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    await input.press('Home');
    await input.press('Backspace');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Beta');
    await page.keyboard.press('Space');
    await page.getByTestId('selected').filter({ hasText: /^alpha$/u }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Alpha');
    assert.equal(await page.locator('.muxui-tag-select__popup').count(), 0, 'Space removal restores previous-chip focus without opening the ComboBox');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
