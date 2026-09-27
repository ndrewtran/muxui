import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { fixture } from '../fixtures/calendar-selection-motion-fixture.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

async function chromePath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function documentHtml() {
  return `<!doctype html><html data-muxui-motion="full" data-muxui-color-scheme="light"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"><link rel="stylesheet" href="/packages/react/src/styles/collections.css"><style>
    :root { --muxui-semantic-motion-state-duration: 900ms; --muxui-semantic-motion-state-transition-spring-visual-duration: 900ms; }
    body { margin: 40px; background: var(--muxui-semantic-surface-canvas); }
    main { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 32px; }
  </style></head><body><div id="root">${renderToString(fixture())}</div><script type="module" src="/packages/react/test/fixtures/calendar-selection-motion-fixture.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false, root: repositoryRoot, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'calendar-selection-motion-proof', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/calendar-selection-motion.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(documentHtml());
      });
    } }],
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${server.httpServer.address().port}/calendar-selection-motion.html` };
}

function cell(page, calendar, day) {
  return page.locator(`#${calendar} .muxui-calendar-cell`).filter({ hasText: new RegExp(`^${day}$`, 'u') });
}

async function center(locator) {
  const rect = await locator.boundingBox();
  assert.ok(rect, 'date cell is visible');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function markerCenter(locator) {
  const rect = await locator.boundingBox();
  assert.ok(rect, 'selected date background is visible');
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function waitForMarkerAlignment(page, calendar) {
  await page.waitForFunction((id) => {
    const root = document.querySelector(`#${id}`);
    const marker = root?.querySelector('.muxui-calendar-selection');
    const cellNode = marker?.parentElement;
    if (!marker || !cellNode) return false;
    const circle = marker.getBoundingClientRect();
    const target = cellNode.getBoundingClientRect();
    return Math.abs(circle.left + circle.width / 2 - (target.left + target.width / 2)) < 1
      && Math.abs(circle.top + circle.height / 2 - (target.top + target.height / 2)) < 1;
  }, calendar);
}

async function markerIsAligned(page, calendar) {
  return page.locator(`#${calendar} .muxui-calendar-selection`).evaluate((marker) => {
    const circle = marker.getBoundingClientRect();
    const target = marker.parentElement.getBoundingClientRect();
    return Math.abs(circle.left + circle.width / 2 - (target.left + target.width / 2)) < 1
      && Math.abs(circle.top + circle.height / 2 - (target.top + target.height / 2)) < 1;
  });
}

async function paintScale(locator) {
  return locator.evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    if (transform === 'none') return { x: 1, y: 1 };
    const matrix = new DOMMatrixReadOnly(transform);
    return { x: Math.hypot(matrix.a, matrix.b), y: Math.hypot(matrix.c, matrix.d) };
  });
}

async function waitForTravelCompletion(page, calendar) {
  await page.waitForFunction((id) => {
    const marker = document.querySelector(`#${id} .muxui-calendar-selection`);
    const paint = marker?.querySelector('.muxui-calendar-selection-paint');
    if (!marker || !paint || marker.hasAttribute('data-selection-traveling')) return false;
    const transform = getComputedStyle(paint).transform;
    if (transform === 'none') return true;
    const matrix = new DOMMatrixReadOnly(transform);
    return Math.abs(Math.hypot(matrix.a, matrix.b) - 1) < 0.01
      && Math.abs(Math.hypot(matrix.c, matrix.d) - 1) < 0.01;
  }, calendar);
}

async function waitForFrames(page, count = 2) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

test('Calendar selection circle travels within a month, resets across dates/pages, and preserves semantics', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    const staticMarkup = renderToString(fixture());
    assert.match(staticMarkup, /class="muxui-calendar-selection"/u, 'SSR paints the selected circle before effects');
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, locale: 'en-US', reducedMotion: 'no-preference' });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => window.__muxuiCalendarSelectionProof);
    } catch {
      assert.fail(`Calendar fixture failed to hydrate: ${JSON.stringify({ errors, html: await page.locator('#root').innerHTML() })}`);
    }

    const primary = page.locator('#primary');
    const secondary = page.locator('#secondary');
    assert.equal(await page.locator('.muxui-calendar-selection').count(), 3, 'each Calendar instance has its own selected background');
    await waitForMarkerAlignment(page, 'primary');
    const selectedForeground = await cell(page, 'secondary', 14).evaluate((node) => getComputedStyle(node).color);
    const secondaryBefore = await markerCenter(secondary.locator('.muxui-calendar-selection'));
    const source = cell(page, 'primary', 14);
    const target = cell(page, 'primary', 16);
    const sourceLabel = source.locator('.muxui-calendar-date');
    const targetLabel = target.locator('.muxui-calendar-date');
    const targetForegroundBeforeClick = await targetLabel.evaluate((node) => getComputedStyle(node).color);
    const sourceLabelBefore = await sourceLabel.boundingBox();
    const targetLabelBefore = await targetLabel.boundingBox();

    await target.click();
    assert.equal(await target.getAttribute('data-selected'), 'true', 'RAC selection updates immediately');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), '16', 'focus stays on the actual selected date');
    assert.deepEqual(await page.evaluate(() => window.__muxuiCalendarSelectionProof.changes), ['2026-02-16'], 'onChange is not delayed by motion');
    await waitForFrames(page);
    const targetForegroundAtStart = await targetLabel.evaluate((node) => getComputedStyle(node).color);
    const colorTransition = await target.evaluate((node) => {
      const animation = node.getAnimations().find((entry) => entry.transitionProperty === 'color');
      return animation ? {
        duration: animation.effect.getTiming().duration,
        currentTime: animation.currentTime,
        playState: animation.playState,
      } : null;
    });
    const marker = primary.locator('.muxui-calendar-selection');
    assert.equal(await marker.getAttribute('data-selection-traveling'), 'true', 'shared indicator travel has started');
    assert.ok(colorTransition && colorTransition.playState === 'running', 'selected foreground transition starts with date selection');
    assert.ok(colorTransition.duration >= 850, 'selected foreground uses the Calendar state-motion duration');
    assert.notEqual(targetForegroundAtStart, targetForegroundBeforeClick, 'new selected label begins changing colour immediately');
    assert.notEqual(targetForegroundAtStart, selectedForeground, 'new selected label is still transitioning while the indicator moves');
    await page.waitForTimeout(120);
    const traveling = await markerCenter(marker);
    const sourceCenter = await center(source);
    const targetCenter = await center(target);
    assert.ok(traveling.y > sourceCenter.y + 1 && traveling.y < targetCenter.y - 1, 'circle visibly crosses rows between selected days');
    assert.ok(traveling.x > targetCenter.x + 1, 'circle also moves horizontally across the grid');
    const sourceLabelAfter = await sourceLabel.boundingBox();
    const targetLabelAfter = await targetLabel.boundingBox();
    assert.ok(Math.abs(sourceLabelAfter.y - sourceLabelBefore.y) < 0.5, 'old date text remains anchored while the circle travels');
    assert.ok(Math.abs(targetLabelAfter.y - targetLabelBefore.y) < 0.5, 'new date text remains anchored while the circle travels');
    const movingScale = await paintScale(marker.locator('.muxui-calendar-selection-paint'));
    assert.ok(movingScale.x > 1.03 && movingScale.y < 0.97, 'selection paint squishes while its outer circle travels');
    assert.deepEqual(await markerCenter(secondary.locator('.muxui-calendar-selection')), secondaryBefore, 'other Calendar instances do not retarget');
    await waitForMarkerAlignment(page, 'primary');
    await waitForTravelCompletion(page, 'primary');
    await page.waitForFunction(() => {
      const selected = document.querySelector('#primary .muxui-calendar-cell[data-selected]');
      const label = selected?.querySelector('.muxui-calendar-date');
      return label && getComputedStyle(label).color === getComputedStyle(selected).color;
    });
    const targetForegroundAfterTravel = await targetLabel.evaluate((node) => getComputedStyle(node).color);
    assert.equal(targetForegroundAfterTravel, selectedForeground, 'selected foreground finishes as the circle settles');
    const settledScale = await paintScale(marker.locator('.muxui-calendar-selection-paint'));
    assert.ok(Math.abs(settledScale.x - 1) < 0.01 && Math.abs(settledScale.y - 1) < 0.01, 'selection paint returns to a true circle');

    const interruptedTarget = cell(page, 'primary', 18);
    await interruptedTarget.click();
    await page.waitForTimeout(60);
    await page.evaluate(() => window.__muxuiCalendarSelectionProof.clearPrimary());
    await page.waitForFunction(() => document.querySelector('#primary .muxui-calendar-cell[data-selected]')?.textContent === '16');
    await page.evaluate(() => window.__muxuiCalendarSelectionProof.setPrimaryMotionPolicy('always'));
    await waitForFrames(page);
    await interruptedTarget.click();
    await waitForFrames(page);
    assert.equal(await interruptedTarget.getAttribute('data-selected'), 'true');
    const resetMarker = primary.locator('.muxui-calendar-selection');
    assert.equal(await resetMarker.getAttribute('data-selection-traveling'), null, 'controlled deselection during travel clears the moving date before a no-motion reselect');
    assert.equal(await markerIsAligned(page, 'primary'), true, 'reselect under consumer reduced policy snaps without stale travel state');
    const resetScale = await paintScale(resetMarker.locator('.muxui-calendar-selection-paint'));
    assert.ok(Math.abs(resetScale.x - 1) < 0.01 && Math.abs(resetScale.y - 1) < 0.01, 'no-motion reselect does not retain the squish');
    await page.evaluate(() => window.__muxuiCalendarSelectionProof.setPrimaryMotionPolicy('never'));
    await waitForFrames(page);

    await page.locator('#primary .muxui-calendar-next').click();
    await page.waitForFunction(() => !document.querySelector('#primary .muxui-calendar-grid').parentElement.style.height);
    assert.match(await page.locator('#primary .muxui-calendar-heading').textContent(), /March 2026/u);
    const marchTarget = cell(page, 'primary', 10);
    await marchTarget.click();
    await waitForFrames(page);
    const markerAfterPageChange = await markerCenter(primary.locator('.muxui-calendar-selection'));
    const marchTargetCenter = await center(marchTarget);
    assert.ok(Math.abs(markerAfterPageChange.x - marchTargetCenter.x) < 1 && Math.abs(markerAfterPageChange.y - marchTargetCenter.y) < 1, 'the first in-page selection after paging snaps to its date');
    assert.equal(await marchTarget.getAttribute('data-selected'), 'true', 'the first in-page selection after paging snaps to its date');
    assert.equal(await primary.locator('.muxui-calendar-selection').getAttribute('data-selection-traveling'), null, 'page change does not start indicator squish');
    const pageResetScale = await paintScale(primary.locator('.muxui-calendar-selection-paint'));
    assert.ok(Math.abs(pageResetScale.x - 1) < 0.01 && Math.abs(pageResetScale.y - 1) < 0.01, 'page change keeps the selection paint circular');

    await page.locator('#date-picker .muxui-date-trigger').click();
    const pickerSelected = page.locator('.muxui-date-popover .muxui-calendar-cell[data-selected]');
    await pickerSelected.waitFor();
    const pickerPaint = await pickerSelected.evaluate((node) => ({
      background: getComputedStyle(node).backgroundColor,
      foreground: getComputedStyle(node).color,
      marker: node.querySelector('.muxui-calendar-selection'),
    }));
    assert.equal(pickerPaint.marker, null, 'DatePicker keeps its existing non-motion calendar renderer');
    assert.notEqual(pickerPaint.background, 'rgba(0, 0, 0, 0)', 'DatePicker selected background keeps its non-motion fallback');
    await page.keyboard.press('Escape');
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForFrames(page);
    const reducedTarget = cell(page, 'primary', 11);
    await reducedTarget.click();
    await waitForFrames(page);
    assert.equal(await markerIsAligned(page, 'primary'), true, 'system reduced motion aligns on the first frames');
    assert.equal(await page.locator('#primary .muxui-calendar-selection').evaluate((node) => node.getAnimations().length), 0, 'system reduced motion keeps the selection instant');
    const reducedScale = await paintScale(page.locator('#primary .muxui-calendar-selection-paint'));
    assert.ok(Math.abs(reducedScale.x - 1) < 0.01 && Math.abs(reducedScale.y - 1) < 0.01, 'system reduced motion never squishes the selection');

    const parentReducedTarget = cell(page, 'parent-reduced-motion', 16);
    await parentReducedTarget.click();
    await waitForFrames(page);
    assert.equal(await markerIsAligned(page, 'parent-reduced-motion'), true, 'a consumer MotionConfig reduced policy disables Calendar movement');
    assert.equal(await page.locator('#parent-reduced-motion .muxui-calendar-selection').evaluate((node) => node.getAnimations().length), 0, 'consumer reduced policy does not create layout animations');
    assert.equal(await page.locator('#parent-reduced-motion .muxui-calendar-selection').getAttribute('data-selection-traveling'), null, 'consumer reduced policy suppresses indicator travel state');
    const parentReducedScale = await paintScale(page.locator('#parent-reduced-motion .muxui-calendar-selection-paint'));
    assert.ok(Math.abs(parentReducedScale.x - 1) < 0.01 && Math.abs(parentReducedScale.y - 1) < 0.01, 'consumer reduced policy never squishes the selection');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const rapidFirst = cell(page, 'primary', 12);
    const rapidLast = cell(page, 'primary', 13);
    await rapidFirst.click();
    await page.waitForTimeout(60);
    await rapidLast.click();
    assert.equal(await rapidLast.getAttribute('data-selected'), 'true', 'rapid selection immediately targets the latest date');
    assert.equal(await page.evaluate(() => window.__muxuiCalendarSelectionProof.changes.at(-1)), '2026-03-13');
    await waitForMarkerAlignment(page, 'primary');
    await waitForTravelCompletion(page, 'primary');
    assert.deepEqual(errors, [], 'hydration and motion complete without runtime errors');

    await page.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
