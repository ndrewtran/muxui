import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Tree } from '../../src/collections.mjs';

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

const items = [
  {
    id: 'parent',
    label: 'Parent',
    children: [{ id: 'child', label: 'Child' }],
  },
  {
    id: 'disabled-parent',
    label: 'Disabled parent',
    disabled: true,
    children: [{ id: 'disabled-child', label: 'Disabled child' }],
  },
];

function Fixture() {
  return React.createElement(Tree, {
    'aria-label': 'Tree toggle proof',
    items,
  });
}

function fixtureDocument() {
  const body = renderToStaticMarkup(React.createElement('div', { id: 'root' }, React.createElement(Fixture)));
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,tree-toggle"><style>
    body { margin: 0; }
    .muxui-tree { width: 320px; }
  </style></head><body>${body}<script type="module" src="/packages/react/test/fixtures/tree-toggle-browser-entry.mjs"></script></body></html>`;
}

test('real browser expands Tree from the visible caret and preserves disabled behavior', { timeout: 90_000 }, async () => {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: {
      force: true,
      // The middleware HTML is virtual, so scan its real entry before browser requests.
      entries: ['packages/react/test/fixtures/tree-toggle-browser-entry.mjs'],
      include: ['react', 'react-dom', 'react-dom/client'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'tree-toggle-fixture-document',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/tree-toggle.html') {
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
    await page.goto(`http://127.0.0.1:${address.port}/tree-toggle.html`, { waitUntil: 'networkidle' });
    const parent = page.locator('.muxui-tree-item').first();
    const toggle = parent.locator('.muxui-tree-toggle');
    const content = parent.locator('.muxui-tree-item-content');
    await toggle.waitFor();
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.equal(await toggle.getAttribute('aria-label'), 'Toggle');
    assert.equal(await toggle.getAttribute('aria-disabled'), null);
    assert.equal(await parent.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('[aria-level="2"]').count(), 0);

    const geometry = await page.evaluate(() => {
      const contentNode = document.querySelector('.muxui-tree-item-content');
      const toggleNode = document.querySelector('.muxui-tree-toggle');
      if (!contentNode || !toggleNode) throw new Error('Tree toggle proof nodes missing');
      const contentRect = contentNode.getBoundingClientRect();
      const toggleRect = toggleNode.getBoundingClientRect();
      const styles = getComputedStyle(contentNode, '::before');
      const x = contentRect.left + Number.parseFloat(getComputedStyle(contentNode).paddingLeft) + toggleRect.width / 2;
      const y = toggleRect.top + toggleRect.height / 2;
      return {
        x,
        y,
        contentLeft: contentRect.left,
        toggleLeft: toggleRect.left,
        toggleWidth: toggleRect.width,
        toggleHeight: toggleRect.height,
        pseudoContent: styles.content,
        pseudoOpacity: styles.opacity,
        hitTag: document.elementFromPoint(x, y)?.tagName,
        hitButtonClass: document.elementFromPoint(x, y)?.closest('button')?.className,
      };
    });
    assert.equal(geometry.pseudoContent, '"▶"');
    assert.equal(geometry.pseudoOpacity, '1');
    assert.ok(geometry.toggleWidth >= 12, `caret hit area too narrow: ${geometry.toggleWidth}`);
    assert.ok(geometry.toggleHeight > 0, 'caret hit area has no height');
    assert.ok(Math.abs(geometry.toggleLeft - geometry.contentLeft) < 20, 'caret hit area is detached from its row');
    assert.match(String(geometry.hitTag), /^(BUTTON|svg|path)$/u);
    assert.equal(geometry.hitButtonClass, 'muxui-tree-toggle');

    await page.mouse.click(geometry.x, geometry.y);
    await page.locator('[aria-level="2"]').first().waitFor();
    assert.equal(await parent.getAttribute('data-expanded'), 'true');

    await toggle.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'muxui-tree-toggle');
    await toggle.press('Enter');
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('[aria-level="2"]').count(), 0);
    await toggle.press(' ');
    await page.locator('[aria-level="2"]').first().waitFor();
    assert.equal(await parent.getAttribute('data-expanded'), 'true');

    const disabledParent = page.locator('.muxui-tree-item[data-key="disabled-parent"]');
    const disabledToggle = disabledParent.locator('.muxui-tree-toggle');
    await disabledToggle.waitFor({ state: 'attached' });
    assert.equal(await disabledToggle.getAttribute('data-disabled'), 'true');
    const disabledGeometry = await disabledToggle.boundingBox();
    assert.ok(disabledGeometry && disabledGeometry.width >= 12 && disabledGeometry.height > 0);
    await disabledToggle.click({ force: true });
    await page.waitForTimeout(50);
    assert.equal(await disabledParent.getAttribute('data-expanded'), null);
    assert.equal(await disabledParent.locator('[aria-level="2"]').count(), 0);
  } finally {
    await browser?.close();
    await server.close();
  }
});
