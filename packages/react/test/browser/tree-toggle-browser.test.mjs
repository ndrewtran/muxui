import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import React from 'react';
import { createPortal } from 'react-dom';
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

function Fixture({ mode = 'chevron' } = {}) {
  if (mode === 'row') return React.createElement(RowFixture);
  if (mode === 'row-controlled') return React.createElement(RowFixture, { controlled: true });
  if (mode === 'row-multiple') return React.createElement(RowFixture, { selectionMode: 'multiple' });
  if (mode === 'row-none') return React.createElement(RowFixture, { selectionMode: 'none' });
  if (mode === 'row-disabled-tree') return React.createElement(RowFixture, { disabled: true });
  return React.createElement(Tree, {
    'aria-label': 'Tree toggle proof',
    items,
    expansionTrigger: 'chevron',
  });
}

function PortalLabel() {
  const [portalMounted, setPortalMounted] = React.useState(false);
  React.useEffect(() => setPortalMounted(true), []);
  return React.createElement(React.Fragment, null,
    React.createElement('span', null, 'Portal row'),
    portalMounted ? createPortal(React.createElement('span', { className: 'portal-surface' }, 'Portal surface'), document.body) : null);
}

const rowItems = [
  {
    id: 'row-parent',
    label: 'Row parent',
    children: [{ id: 'row-child', label: 'Row child' }],
  },
  {
    id: 'row-controls',
    label: React.createElement(React.Fragment, null,
      React.createElement('button', { type: 'button', className: 'nested-button' }, 'Nested button'),
      React.createElement('a', { href: '#nested-link', className: 'nested-link' }, 'Nested link')),
    children: [{ id: 'row-controls-child', label: 'Controls child' }],
  },
  {
    id: 'row-portal-parent',
    label: React.createElement(PortalLabel),
    children: [{ id: 'row-portal-child', label: 'Portal child' }],
  },
  { id: 'row-leaf', label: 'Row leaf' },
  {
    id: 'row-disabled-parent',
    label: 'Disabled row parent',
    disabled: true,
    children: [{ id: 'row-disabled-child', label: 'Disabled row child' }],
  },
];

function RowFixture({ controlled = false, selectionMode = 'single', disabled = false }) {
  const [expandedIds, setExpandedIds] = React.useState([]);
  const [expandedChangeCount, setExpandedChangeCount] = React.useState(0);
  const [selectionChangeCount, setSelectionChangeCount] = React.useState(0);
  const [actionCount, setActionCount] = React.useState(0);
  const treeProps = {
    'aria-label': 'Tree row expansion proof',
    items: rowItems,
    selectionMode,
    disabled,
    ...(controlled ? { expandedIds } : { defaultExpandedIds: [] }),
    ...(selectionMode === 'multiple' ? { defaultSelectedIds: ['row-leaf'] } : {}),
    onExpandedChange: (next) => {
      setExpandedChangeCount((count) => count + 1);
      if (controlled) setExpandedIds(next);
    },
    onSelectionChange: () => setSelectionChangeCount((count) => count + 1),
    onAction: () => setActionCount((count) => count + 1),
  };
  return React.createElement('div', {
    id: 'row-fixture',
    'data-expanded-change-count': expandedChangeCount,
    'data-selection-change-count': selectionChangeCount,
    'data-action-count': actionCount,
  }, React.createElement(Tree, treeProps));
}

function fixtureDocument(mode = 'chevron') {
  const body = renderToStaticMarkup(React.createElement('div', { id: 'root' }, React.createElement(Fixture, { mode })));
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
          if (request.url?.split('?')[0] === '/tree-toggle.html') {
            response.statusCode = 200;
            response.setHeader('content-type', 'text/html');
            const mode = new URL(request.url, 'http://127.0.0.1').searchParams.get('mode') ?? 'chevron';
            response.end(fixtureDocument(mode));
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
    const parentLabel = parent.locator('.muxui-tree-item-label');
    await toggle.waitFor();
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.equal(await toggle.getAttribute('aria-label'), 'Toggle');
    assert.equal(await toggle.getAttribute('aria-disabled'), null);
    assert.equal(await parent.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('[aria-level="2"]').count(), 0);
    await parentLabel.click();
    await page.waitForTimeout(50);
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

    const fixtureUrl = `http://127.0.0.1:${address.port}/tree-toggle.html`;
    await page.goto(`${fixtureUrl}?mode=row`, { waitUntil: 'networkidle' });
    const rowTree = page.locator('.muxui-tree');
    const rowParent = rowTree.locator('.muxui-tree-item[data-key="row-parent"]');
    const rowParentLabel = rowParent.locator('.muxui-tree-item-label');
    await rowParentLabel.waitFor();
    assert.equal(await rowParent.getAttribute('data-expanded'), null);
    assert.equal(await rowTree.locator('[data-key="row-child"]').count(), 0);

    await rowParentLabel.click();
    await rowTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await rowParent.getAttribute('data-expanded'), 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '1');

    await rowParentLabel.click();
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item[data-key="row-parent"]')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '2');

    const rowBox = await rowParent.boundingBox();
    const rowContentBox = await rowParent.locator('.muxui-tree-item-content').boundingBox();
    assert.ok(rowBox && rowContentBox && rowBox.width > 0 && rowBox.height > 0);
    assert.ok(rowContentBox.x > rowBox.x, 'tree row should retain its leading padding area');
    await page.mouse.click(rowBox.x + 1, rowBox.y + rowBox.height / 2);
    await rowTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '3');

    await rowParent.locator('.muxui-tree-toggle').click();
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item[data-key="row-parent"]')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '4');

    const portalRow = rowTree.locator('.muxui-tree-item[data-key="row-portal-parent"]');
    const portalSurface = page.locator('.portal-surface');
    await portalSurface.waitFor();
    await portalSurface.click();
    assert.equal(await portalRow.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '4');
    await portalRow.locator('.muxui-tree-item-label').click();
    await rowTree.locator('[data-key="row-portal-child"]').waitFor();
    assert.equal(await portalRow.getAttribute('data-expanded'), 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '5');
    await portalRow.locator('.muxui-tree-toggle').click();
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item[data-key="row-portal-parent"]')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '6');

    const leaf = rowTree.locator('.muxui-tree-item[data-key="row-leaf"]');
    await leaf.locator('.muxui-tree-item-content').click();
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '6');

    const disabledRow = rowTree.locator('.muxui-tree-item[data-key="row-disabled-parent"]');
    await disabledRow.locator('.muxui-tree-item-content').click({ force: true });
    assert.equal(await disabledRow.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '6');

    const controlsRow = rowTree.locator('.muxui-tree-item[data-key="row-controls"]');
    await controlsRow.locator('.nested-button').click();
    assert.equal(await controlsRow.getAttribute('data-expanded'), null);
    await controlsRow.locator('.nested-link').click();
    assert.equal(await controlsRow.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '6');

    await rowParent.focus();
    await rowParent.press('ArrowRight');
    await rowTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await rowParent.getAttribute('data-expanded'), 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '7');
    await rowParent.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item[data-key="row-parent"]')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '8');

    await page.goto(`${fixtureUrl}?mode=row-disabled-tree`, { waitUntil: 'networkidle' });
    const disabledTree = page.locator('.muxui-tree');
    const disabledTreeParent = disabledTree.locator('.muxui-tree-item[data-key="row-parent"]');
    await disabledTreeParent.locator('.muxui-tree-item-label').click({ force: true });
    assert.equal(await disabledTreeParent.getAttribute('data-expanded'), null);
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '0');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-selection-change-count'), '0');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-action-count'), '0');

    await page.goto(`${fixtureUrl}?mode=row-controlled`, { waitUntil: 'networkidle' });
    const controlledTree = page.locator('.muxui-tree');
    const controlledParent = controlledTree.locator('.muxui-tree-item[data-key="row-parent"]');
    await controlledParent.locator('.muxui-tree-item-label').click();
    await controlledTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '1');
    await controlledParent.locator('.muxui-tree-item-label').click();
    await page.waitForFunction(() => document.querySelector('.muxui-tree-item[data-key="row-parent"]')?.getAttribute('data-expanded') !== 'true');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-expanded-change-count'), '2');

    await page.goto(`${fixtureUrl}?mode=row-multiple`, { waitUntil: 'networkidle' });
    const multipleTree = page.locator('.muxui-tree');
    const multipleParent = multipleTree.locator('.muxui-tree-item[data-key="row-parent"]');
    await multipleParent.locator('.muxui-tree-item-label').click();
    await multipleTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await multipleParent.getAttribute('data-expanded'), 'true');
    assert.notEqual(await page.locator('#row-fixture').getAttribute('data-selection-change-count'), '0');

    await page.goto(`${fixtureUrl}?mode=row-none`, { waitUntil: 'networkidle' });
    const noneTree = page.locator('.muxui-tree');
    const noneParent = noneTree.locator('.muxui-tree-item[data-key="row-parent"]');
    await noneParent.locator('.muxui-tree-item-label').click();
    await noneTree.locator('[data-key="row-child"]').waitFor();
    assert.equal(await page.locator('#row-fixture').getAttribute('data-selection-change-count'), '0');
    assert.equal(await page.locator('#row-fixture').getAttribute('data-action-count'), '1');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
