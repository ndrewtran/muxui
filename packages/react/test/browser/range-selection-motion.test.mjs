import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { RangeSelectionMotionFixture } from '../fixtures/range-selection-motion-fixture.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const chromeCandidates = [
  process.env.MUXUI_CHROME_EXECUTABLE,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function chromePath() {
  for (const path of chromeCandidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function documentHtml() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(RangeSelectionMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/fields.css"><link rel="stylesheet" href="/src/styles/collections.css"></head><body style="margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);">${body}<script type="module" src="/test/fixtures/range-selection-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/fields.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{
      name: 'range-selection-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/range-selection-motion.html') {
            response.setHeader('content-type', 'text/html');
            response.end(documentHtml());
            return;
          }
          next();
        });
      },
    }],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  assert.ok(address?.port);
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function readRange(page) {
  return page.locator('.muxui-range-selection-motion').evaluate((root) => {
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
    };
    return {
      selecting: root.hasAttribute('data-muxui-range-selecting'),
      anchor: root.querySelector('[data-muxui-range-anchor]')?.getAttribute('data-muxui-date') ?? null,
      endpoint: root.querySelector('[data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') ?? null,
      unavailable: rect(root.querySelector('[data-muxui-date="2026-08-10"]')),
      bands: [...root.querySelectorAll('[data-muxui-range-band]')].map((node) => ({
        rect: rect(node),
        animations: node.getAnimations().map((animation) => animation.effect?.getComputedTiming().duration),
      })),
      anchorStyle: root.querySelector('[data-muxui-range-anchor]') ? getComputedStyle(root.querySelector('[data-muxui-range-anchor]')).backgroundColor : null,
      endpointStyle: root.querySelector('[data-muxui-range-provisional-endpoint]') ? getComputedStyle(root.querySelector('[data-muxui-range-provisional-endpoint]')).boxShadow : null,
    };
  });
}

function overlaps(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

test('DateRangePicker Motion paints RAC provisional ranges row by row without committing hover', { timeout: 90_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/range-selection-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiRangeSelectionHydrated === 'true');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('.muxui-range-selection-motion').count(), 0, 'closed range popover stays absent after SSR/hydration');

    await page.evaluate(() => window.__muxuiRangeSetOpen(true));
    await page.locator('.muxui-date-popover').waitFor();
    const anchorCell = page.locator('.muxui-range-calendar-cell[data-muxui-date="2026-08-26"]');
    await anchorCell.click();
    await page.waitForFunction(() => document.querySelector('.muxui-range-selection-motion')?.hasAttribute('data-muxui-range-selecting'));
    let current = await readRange(page);
    assert.equal(current.anchor, '2026-08-26');
    assert.equal(current.endpoint, null, 'the fixed anchor has no provisional outline before a hover endpoint');
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'starting an anchor does not commit a range');

    const visibleCells = await page.locator('.muxui-range-calendar-cell[data-muxui-date]').evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        date: node.getAttribute('data-muxui-date'),
        disabled: node.hasAttribute('data-disabled'),
        unavailable: node.hasAttribute('data-unavailable'),
        top: rect.top,
      };
    }));
    const anchorGeometry = visibleCells.find(({ date }) => date === '2026-08-26');
    const weekWrapDate = visibleCells.find(({ date, disabled, unavailable, top }) => date > '2026-08-26' && !disabled && !unavailable && top > anchorGeometry.top)?.date;
    const reverseDate = [...visibleCells].reverse().find(({ date, disabled, unavailable, top }) => date < '2026-08-26' && !disabled && !unavailable && top < anchorGeometry.top)?.date;
    const splitDate = visibleCells.find(({ date, disabled, unavailable }) => date > '2026-08-28' && !disabled && !unavailable)?.date;
    const sameRowDate = visibleCells.find(({ date, disabled, unavailable, top }) => date > '2026-08-26' && date < weekWrapDate && !disabled && !unavailable && top === anchorGeometry.top)?.date;
    assert.ok(weekWrapDate && reverseDate && splitDate && sameRowDate, `range fixture needs selectable forward, reverse, and split dates: ${JSON.stringify(visibleCells)}`);
    const weekWrapCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${weekWrapDate}"]`);
    await weekWrapCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, weekWrapDate);
    current = await readRange(page);
    assert.equal(current.anchor, '2026-08-26');
    assert.equal(current.endpoint, weekWrapDate);
    assert.ok(current.bands.length >= 2, `week-wrap range uses multiple row bands: ${JSON.stringify(current)}`);
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'forward hover never calls onChange');
    assert.match(current.anchorStyle ?? '', /rgb\(/u, 'anchor remains a solid selection');
    assert.match(current.endpointStyle ?? '', /inset/u, 'provisional endpoint remains outlined');

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '800ms'));
    const reverseCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${reverseDate}"]`);
    await reverseCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, reverseDate);
    current = await readRange(page);
    assert.equal(current.anchor, '2026-08-26', 'reverse hover preserves the current anchor');
    assert.equal(current.endpoint, reverseDate);
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'reverse hover never commits');

    const unavailableCell = page.locator('.muxui-range-calendar-cell[data-muxui-date="2026-08-10"]');
    assert.equal(await unavailableCell.getAttribute('data-unavailable'), 'true', 'RAC owns unavailable state');
    await unavailableCell.focus();
    assert.notEqual(await page.locator('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]').getAttribute('data-muxui-date'), '2026-08-10', 'unavailable focus cannot become a provisional endpoint');
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'unavailable focus does not commit a range');
    const splitCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${splitDate}"]`);
    await splitCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, splitDate);
    current = await readRange(page);
    assert.equal(current.endpoint, splitDate);
    assert.equal(await page.locator('#range-change-count').textContent(), '0');
    assert.ok(current.unavailable && current.bands.every(({ rect }) => !rect || !overlaps(rect, current.unavailable)), 'unavailable cells are excluded from the provisional band');

    const keyboardEndpoint = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${splitDate}"]`);
    await keyboardEndpoint.focus();
    await page.keyboard.press('ArrowLeft');
    const endpointBeforeKeyboard = current.endpoint;
    await page.waitForFunction((date) => {
      const next = document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date');
      return next && next !== date;
    }, endpointBeforeKeyboard);
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'keyboard focus changes do not commit');

    // A row segment may disappear and return before its semantic exit finishes.
    // The returning segment must reclaim the live node instead of being removed
    // by the stale exit completion.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-exit-duration', '1200ms');
      window.__muxuiRangeSetOpen(true);
    });
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${weekWrapDate}"]`).hover();
    await page.waitForFunction(() => {
      const root = document.querySelector('.muxui-range-selection-motion');
      return (root?.querySelectorAll('[data-muxui-range-band]').length ?? 0) >= 2;
    });
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${sameRowDate}"]`).hover();
    await page.waitForFunction(() => {
      const bands = [...document.querySelectorAll('.muxui-range-selection-motion [data-muxui-range-band]')];
      return bands.length >= 2 && bands.some((node) => {
        const opacity = Number.parseFloat(getComputedStyle(node).opacity);
        return opacity > 0 && opacity < 1;
      });
    }, undefined, { timeout: 800 });
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${weekWrapDate}"]`).hover();
    await page.waitForFunction((date) => {
      const root = document.querySelector('.muxui-range-selection-motion');
      return root?.querySelector('[data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date
        && root.querySelectorAll('[data-muxui-range-band]').length >= 2;
    }, weekWrapDate);
    await page.waitForTimeout(1300);
    assert.ok(await page.locator('[data-muxui-range-band]').count() >= 2, 'stale row exit cannot remove a segment that returned');

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '1200ms');
      document.documentElement.style.removeProperty('--muxui-semantic-motion-exit-duration');
    });
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${sameRowDate}"]`).hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, sameRowDate);
    const reducedStarted = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const root = document.querySelector('.muxui-range-selection-motion');
      if (!root?.hasAttribute('data-muxui-range-selection-reduced')) return false;
      return [...root.querySelectorAll('[data-muxui-range-band]')].every((node) => node.style.opacity === '1');
    }, undefined, { timeout: 300 });
    assert.ok(Date.now() - reducedStarted < 300, 'explicit reduced mode settles range movement immediately');
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${sameRowDate}"]`).hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, sameRowDate);
    await page.locator(`.muxui-range-calendar-cell[data-muxui-date="${weekWrapDate}"]`).hover();
    const systemReducedStarted = Date.now();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const root = document.querySelector('.muxui-range-selection-motion');
      return root?.hasAttribute('data-muxui-range-selection-reduced')
        && [...root.querySelectorAll('[data-muxui-range-band]')].every((node) => node.style.opacity === '1');
    }, undefined, { timeout: 300 });
    assert.ok(Date.now() - systemReducedStarted < 300, 'system reduced mode settles range movement immediately');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration');
      window.__muxuiRangeUnmount();
    });
    await page.locator('#range-unmounted').waitFor({ state: 'attached' });
    assert.equal(await page.locator('[data-muxui-range-band]').count(), 0, 'unmount removes transient range bands');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
