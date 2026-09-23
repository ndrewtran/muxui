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
  const consumerFocusStyle = `@scope (.range-consumer) { :scope :is(button, .muxui-range-calendar-cell):focus-visible { outline: 2px solid var(--muxui-semantic-focus-ring); outline-offset: 2px; } }`;
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/fields.css"><link rel="stylesheet" href="/src/styles/collections.css"><style>${consumerFocusStyle}</style></head><body style="margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);"><div class="range-consumer">${body}</div><script type="module" src="/test/fixtures/range-selection-motion-browser-entry.mjs"></script></body></html>`;
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
    const endpoint = root.querySelector('[data-muxui-range-provisional-endpoint]');
    const endpointStyle = endpoint ? getComputedStyle(endpoint) : null;
    const endpointRect = rect(endpoint);
    return {
      selecting: root.hasAttribute('data-muxui-range-selecting'),
      anchor: root.querySelector('[data-muxui-range-anchor]')?.getAttribute('data-muxui-date') ?? null,
      endpoint: root.querySelector('[data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') ?? null,
      endpointRect,
      unavailable: rect(root.querySelector('[data-muxui-date="2026-08-10"]')),
      bands: [...root.querySelectorAll('[data-muxui-range-band]')].map((node) => ({
        rect: rect(node),
        animations: node.getAnimations().map((animation) => animation.effect?.getComputedTiming().duration),
        cap: node.getAttribute('data-muxui-range-band-cap'),
        containsEndpoint: (() => {
          const bandRect = rect(node);
          if (!endpointRect || !bandRect) return false;
          const centerX = (endpointRect.left + endpointRect.right) / 2;
          const centerY = (endpointRect.top + endpointRect.bottom) / 2;
          return centerX >= bandRect.left && centerX <= bandRect.right && centerY >= bandRect.top && centerY <= bandRect.bottom;
        })(),
        radius: (() => {
          const style = getComputedStyle(node);
          return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
        })(),
      })),
      anchorStyle: root.querySelector('[data-muxui-range-anchor]') ? getComputedStyle(root.querySelector('[data-muxui-range-anchor]')).backgroundColor : null,
      endpointStyle: endpointStyle?.boxShadow ?? null,
      endpointRadius: endpointStyle ? [endpointStyle.borderTopLeftRadius, endpointStyle.borderTopRightRadius, endpointStyle.borderBottomRightRadius, endpointStyle.borderBottomLeftRadius] : null,
      endpointBorder: endpointStyle?.borderStyle ?? null,
      endpointOutline: endpointStyle?.outlineStyle ?? null,
    };
  });
}

function overlaps(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function assertBandCap(band, expected, label) {
  assert.ok(band, `${label} has a band cap`);
  assert.ok(['left', 'right', 'both'].includes(expected), `${label} has an explicit expected cap`);
  assert.equal(band.cap, expected, `${label} reports the expected physical cap`);
  const capRadius = band.rect.height / 2;
  const radii = band.radius.map((value) => Number.parseFloat(value));
  const assertRadius = (index) => assert.ok(Math.abs(radii[index] - capRadius) < 0.1 || radii[index] > capRadius, `${label} uses a full-height cap radius`);
  const assertSharp = (index) => assert.equal(radii[index], 0, `${label} keeps row-wrap corners sharp`);
  if (expected === 'left' || expected === 'both') {
    assertRadius(0);
    assertRadius(3);
  }
  if (expected === 'right' || expected === 'both') {
    assertRadius(1);
    assertRadius(2);
  }
  if (expected === 'left') {
    assertSharp(1);
    assertSharp(2);
  }
  if (expected === 'right') {
    assertSharp(0);
    assertSharp(3);
  }
}

function endpointBand(current) {
  return current.bands.find(({ containsEndpoint }) => containsEndpoint);
}

async function waitForEndpointBand(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('.muxui-range-selection-motion');
    const endpoint = root?.querySelector('[data-muxui-range-provisional-endpoint]');
    if (!endpoint) return false;
    const endpointRect = endpoint.getBoundingClientRect();
    const centerX = (endpointRect.left + endpointRect.right) / 2;
    const centerY = (endpointRect.top + endpointRect.bottom) / 2;
    return [...root.querySelectorAll('[data-muxui-range-band]')].some((band) => {
      const bandRect = band.getBoundingClientRect();
      return centerX >= bandRect.left && centerX <= bandRect.right && centerY >= bandRect.top && centerY <= bandRect.bottom;
    });
  }, undefined, { timeout: 2_000 });
}

async function samplePointerTransition(page, fromDate, toDate) {
  const from = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${fromDate}"]`);
  const to = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${toDate}"]`);
  const fromRect = await from.boundingBox();
  const toRect = await to.boundingBox();
  assert.ok(fromRect && toRect, `pointer transition has visible cells: ${fromDate} -> ${toDate}`);
  await page.evaluate(() => {
    window.__muxuiRangePointerFrames = [];
    window.__muxuiRangeFirstPointerEventAt = null;
    const started = performance.now();
    const markPointerEvent = () => {
      if (window.__muxuiRangeFirstPointerEventAt === null) window.__muxuiRangeFirstPointerEventAt = Math.round(performance.now() - started);
    };
    window.__muxuiRangePointerEventMarker = markPointerEvent;
    for (const eventType of ['pointerover', 'pointermove', 'pointerdown']) document.addEventListener(eventType, markPointerEvent, true);
    const sample = () => {
      const root = document.querySelector('.muxui-range-selection-motion');
      const cells = [...(root?.querySelectorAll('.muxui-range-calendar-cell[data-muxui-date]') ?? [])].map((node) => {
        const style = getComputedStyle(node);
        return {
          date: node.getAttribute('data-muxui-date'),
          hovered: node.matches(':hover'),
          focused: node.matches(':focus'),
          focusVisible: node.matches(':focus-visible'),
          dataFocusVisible: node.hasAttribute('data-focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          boxShadow: style.boxShadow,
        };
      });
      window.__muxuiRangePointerFrames.push({
        pointerMode: root?.hasAttribute('data-muxui-range-pointer-mode') ?? false,
        afterPointerEvent: window.__muxuiRangeFirstPointerEventAt !== null,
        t: Math.round(performance.now() - started),
        cells,
      });
      if (performance.now() - started < 320) window.requestAnimationFrame(sample);
    };
    window.requestAnimationFrame(sample);
  });
  await page.mouse.move(fromRect.x + fromRect.width / 2, fromRect.y + fromRect.height / 2);
  await page.mouse.move(toRect.x + toRect.width / 2, toRect.y + toRect.height / 2, { steps: 16 });
  await page.waitForTimeout(340);
  return page.evaluate(() => {
    const result = {
      frames: window.__muxuiRangePointerFrames ?? [],
      firstPointerEventAt: window.__muxuiRangeFirstPointerEventAt,
    };
    for (const eventType of ['pointerover', 'pointermove', 'pointerdown']) document.removeEventListener(eventType, window.__muxuiRangePointerEventMarker, true);
    delete window.__muxuiRangePointerFrames;
    delete window.__muxuiRangeFirstPointerEventAt;
    delete window.__muxuiRangePointerEventMarker;
    return result;
  });
}

function assertPointerTransition({ frames, firstPointerEventAt }, label) {
  assert.ok(frames.length >= 4, `${label} samples multiple animation frames`);
  assert.notEqual(firstPointerEventAt, null, `${label} records a real pointer event independently of the Mux marker`);
  assert.ok(frames.some(({ pointerMode }) => pointerMode), `${label} enters Mux pointer mode`);
  for (const frame of frames) {
    if (!frame.afterPointerEvent) continue;
    for (const cell of frame.cells) {
      if (!cell.hovered && !cell.focused) continue;
      assert.equal(cell.outlineStyle, 'none', `${label} ${cell.date} has no pointer outline at ${frame.t}ms`);
      assert.equal(cell.boxShadow, 'none', `${label} ${cell.date} has no pointer focus shadow at ${frame.t}ms`);
    }
  }
}

async function readKeyboardFocus(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || !node.matches('.muxui-range-calendar-cell')) return null;
    const style = getComputedStyle(node);
    return {
      date: node.getAttribute('data-muxui-date'),
      pointerMode: Boolean(node.closest('.muxui-range-selection-motion')?.hasAttribute('data-muxui-range-pointer-mode')),
      dataFocusVisible: node.hasAttribute('data-focus-visible'),
      focusVisible: node.matches(':focus-visible'),
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
    };
  });
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

    const checkCapScenario = async (anchor, endpoint, expected, label) => {
      const capPage = await browser.newPage({ viewport: { width: 1100, height: 800 } });
      capPage.on('pageerror', (error) => errors.push(error.message));
      capPage.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      try {
        await capPage.goto(`${url}/range-selection-motion.html`, { waitUntil: 'networkidle' });
        await capPage.waitForFunction(() => document.documentElement.dataset.muxuiRangeSelectionHydrated === 'true');
        await capPage.evaluate(() => window.__muxuiRangeSetOpen(true));
        await capPage.locator('.muxui-date-popover').waitFor();
        await capPage.locator(`.muxui-range-calendar-cell[data-muxui-date="${anchor}"]`).click();
        await capPage.waitForFunction(() => document.querySelector('.muxui-range-selection-motion')?.hasAttribute('data-muxui-range-selecting'));
        await capPage.locator(`.muxui-range-calendar-cell[data-muxui-date="${endpoint}"]`).hover();
        await capPage.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, endpoint);
        await waitForEndpointBand(capPage);
        const current = await readRange(capPage);
        assertBandCap(endpointBand(current), expected, label);
        return current;
      } finally {
        await capPage.close();
      }
    };

    const forwardCaps = await checkCapScenario('2026-08-11', '2026-08-26', 'right', 'forward multi-row endpoint band');
    const interiorBand = forwardCaps.bands.find(({ cap, containsEndpoint }) => !containsEndpoint && cap === null);
    assert.ok(interiorBand, 'forward range keeps an unchanged interior row');
    assert.deepEqual(interiorBand.radius, ['0px', '0px', '0px', '0px'], 'forward range keeps interior row-wrap corners sharp');
    await checkCapScenario('2026-08-26', '2026-08-19', 'left', 'reverse multi-row endpoint band');

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
    const forwardPointerFrames = await samplePointerTransition(page, '2026-08-26', weekWrapDate);
    assertPointerTransition(forwardPointerFrames, 'forward pointer transition');
    await weekWrapCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, weekWrapDate);
    await waitForEndpointBand(page);
    current = await readRange(page);
    assert.equal(current.anchor, '2026-08-26');
    assert.equal(current.endpoint, weekWrapDate);
    assert.ok(current.bands.length >= 2, `week-wrap range uses multiple row bands: ${JSON.stringify(current)}`);
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'forward hover never calls onChange');
    assert.match(current.anchorStyle ?? '', /rgb\(/u, 'anchor remains a solid selection');
    assert.equal(current.endpointStyle, 'none', 'forward provisional endpoint has no hover stroke');
    assert.deepEqual(current.endpointRadius, ['0px', '9999px', '9999px', '0px'], 'forward provisional endpoint keeps the outer radius');
    assert.equal(current.endpointBorder, 'none', 'forward provisional endpoint has no border');
    assert.equal(current.endpointOutline, 'none', 'forward provisional endpoint has no hover outline');
    const forwardEndpointBand = endpointBand(current);
    assert.ok(forwardEndpointBand, `forward week-wrap endpoint band has a cap: ${JSON.stringify(current.bands)}`);
    assertBandCap(forwardEndpointBand, 'both', 'forward week-wrap endpoint band');

    const sameRowCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${sameRowDate}"]`);
    const interiorPointerFrames = await samplePointerTransition(page, weekWrapDate, sameRowDate);
    assertPointerTransition(interiorPointerFrames, 'endpoint leave transition');
    await sameRowCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, sameRowDate);
    await waitForEndpointBand(page);
    current = await readRange(page);
    assertBandCap(endpointBand(current), 'both', 'forward same-row endpoint band');

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '800ms'));
    const reverseCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${reverseDate}"]`);
    const reversePointerFrames = await samplePointerTransition(page, sameRowDate, reverseDate);
    assertPointerTransition(reversePointerFrames, 'reverse pointer transition');
    await reverseCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, reverseDate);
    await waitForEndpointBand(page);
    current = await readRange(page);
    assert.equal(current.anchor, '2026-08-26', 'reverse hover preserves the current anchor');
    assert.equal(current.endpoint, reverseDate);
    assert.equal(await page.locator('#range-change-count').textContent(), '0', 'reverse hover never commits');
    assert.equal(current.endpointStyle, 'none', 'reverse provisional endpoint has no hover stroke');
    assert.deepEqual(current.endpointRadius, ['9999px', '0px', '0px', '9999px'], 'reverse provisional endpoint keeps the outer radius');
    assert.equal(current.endpointBorder, 'none', 'reverse provisional endpoint has no border');
    assert.equal(current.endpointOutline, 'none', 'reverse provisional endpoint has no hover outline');
    const reverseEndpointBand = endpointBand(current);
    assert.ok(reverseEndpointBand, `reverse week-wrap endpoint band has a cap: ${JSON.stringify(current.bands)}`);
    assertBandCap(reverseEndpointBand, 'both', 'reverse week-wrap endpoint band');

    const reverseSameRowDate = [...visibleCells].reverse().find(({ date, disabled, unavailable, top }) => date < '2026-08-26' && !disabled && !unavailable && top === anchorGeometry.top)?.date;
    assert.ok(reverseSameRowDate, 'range fixture needs a selectable reverse same-row date');
    const reverseSameRowCell = page.locator(`.muxui-range-calendar-cell[data-muxui-date="${reverseSameRowDate}"]`);
    await reverseSameRowCell.hover();
    await page.waitForFunction((date) => document.querySelector('.muxui-range-selection-motion [data-muxui-range-provisional-endpoint]')?.getAttribute('data-muxui-date') === date, reverseSameRowDate);
    await waitForEndpointBand(page);
    current = await readRange(page);
    assertBandCap(endpointBand(current), 'both', 'reverse same-row endpoint band');

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
    const keyboardFocus = await readKeyboardFocus(page);
    assert.ok(keyboardFocus?.date, 'keyboard navigation leaves a focused range cell');
    assert.equal(keyboardFocus.pointerMode, false, 'keyboard navigation clears pointer mode before focus moves');
    assert.equal(keyboardFocus.dataFocusVisible, true, 'keyboard navigation keeps RAC focus visibility');
    assert.equal(keyboardFocus.focusVisible, true, 'keyboard navigation keeps native focus visibility');
    assert.notEqual(keyboardFocus.boxShadow, 'none', 'keyboard navigation keeps the visible focus ring');
    await page.emulateMedia({ forcedColors: 'active' });
    const forcedColorsFocus = await readKeyboardFocus(page);
    assert.equal(forcedColorsFocus?.dataFocusVisible, true, 'forced colors keeps RAC keyboard focus visibility');
    assert.notEqual(forcedColorsFocus?.outlineStyle, 'none', 'forced colors keeps a visible keyboard outline');
    await page.emulateMedia({ forcedColors: 'none' });

    const keyboardPointerFrames = await samplePointerTransition(page, keyboardFocus.date, sameRowDate);
    assertPointerTransition(keyboardPointerFrames, 'keyboard-to-pointer transition');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.activeElement?.matches('.muxui-range-calendar-cell[data-focus-visible]'));
    const focusAfterPointer = await readKeyboardFocus(page);
    assert.equal(focusAfterPointer.pointerMode, false, 'keyboard input clears pointer mode after pointer hover');
    assert.equal(focusAfterPointer.dataFocusVisible, true, 'keyboard focus remains visible after pointer hover');
    assert.notEqual(focusAfterPointer.boxShadow, 'none', 'keyboard focus ring returns after pointer hover');

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
