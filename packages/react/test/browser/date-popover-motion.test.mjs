import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { Button } from '../../src/button.mjs';
import { DatePicker, DateRangePicker } from '../../src/fields.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');
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

function dateDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(DatePicker, {
    label: 'Due date',
    defaultValue: '2026-08-26',
    open: false,
  })));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"></head><body style="margin: 96px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);">${body}<script type="module" src="/packages/react/test/fixtures/date-popover-motion-browser-entry.mjs"></script></body></html>`;
}

function buttonDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(Button, null, 'Save')));
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body>${body}<script type="module" src="/packages/react/test/fixtures/button-only-browser-entry.mjs"></script></body></html>`;
}

function rangeDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(DateRangePicker, {
    label: 'Date range',
    defaultValue: { start: '2026-08-20', end: '2026-08-26' },
    open: false,
  })));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"></head><body style="margin: 96px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);">${body}<script type="module" src="/packages/react/test/fixtures/date-range-popover-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'date-popover-motion-fixtures',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/date-popover-motion.html') {
            response.setHeader('content-type', 'text/html');
            response.end(dateDocument());
            return;
          }
          if (request.url === '/button-only.html') {
            response.setHeader('content-type', 'text/html');
            response.end(buttonDocument());
            return;
          }
          if (request.url === '/date-range-popover-motion.html') {
            response.setHeader('content-type', 'text/html');
            response.end(rangeDocument());
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

async function waitForHydration(page) {
  await page.waitForFunction(() => document.documentElement.dataset.muxuiDatePopoverHydrated === 'true', undefined, { timeout: 5_000 });
}

async function openCalendar(page) {
  await page.locator('.muxui-date-trigger').click();
  await page.locator('.muxui-date-popover').waitFor();
}

async function closeCalendarWithEscape(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.hasAttribute('data-exiting') === true);
  assert.equal(await page.locator('.muxui-date-popover').evaluate((node) => getComputedStyle(node).animationName), 'muxui-date-popover-fade-out');
  await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.muxui-date-trigger')), true, 'Escape restores trigger focus');
}

async function closeReducedCalendar(page, label) {
  const started = Date.now();
  await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
  await page.locator('.muxui-date-popover').waitFor({ state: 'detached', timeout: 250 });
  assert.ok(Date.now() - started < 100, `${label} popup exit is immediate`);
}

async function readEntryMotion(page) {
  return page.locator('.muxui-date-popover').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      reduced: node.hasAttribute('data-muxui-date-popover-reduced'),
      opacity: style.opacity,
      transform: style.transform,
      transformY: new DOMMatrixReadOnly(style.transform).m42,
      animations: node.getAnimations().map((animation) => ({
        duration: animation.effect?.getComputedTiming().duration,
        easing: animation.effect?.getComputedTiming().easing,
        playState: animation.playState,
      })),
    };
  });
}

async function settleEntry(page) {
  await page.waitForTimeout(220);
  return readEntryMotion(page);
}

async function capturePopup(page, path) {
  const box = await page.locator('.muxui-date-popover').boundingBox();
  assert.ok(box, `popup has geometry for ${path}`);
  await page.screenshot({ path, clip: box });
}

test('DatePicker popup entry uses Mux tokens while RAC owns exit, focus, dismissal, and cleanup', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`));
    await page.goto(`${url}/date-popover-motion.html`, { waitUntil: 'networkidle' });
    try {
      await waitForHydration(page);
    } catch (error) {
      throw new Error(`${error.message}; page errors: ${errors.join(' | ')}`);
    }
    assert.equal(await page.locator('.muxui-date-popover').count(), 0, 'SSR and hydration begin closed');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openCalendar(page);
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) > 0));
    const fullEntry = await readEntryMotion(page);
    assert.equal(fullEntry.animationName, 'none', 'entry is owned by Motion, not a second CSS animation');
    assert.deepEqual(fullEntry.animations.map(({ duration, easing }) => ({ duration, easing })), [
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    ], `full mode uses the exact resolved interaction token: ${JSON.stringify(fullEntry)}`);
    const fullSettled = await settleEntry(page);
    assert.equal(fullSettled.opacity, '1');
    assert.equal(fullSettled.transformY, 0);
    await capturePopup(page, '/tmp/muxui-date-popover-full-light.png');
    await closeCalendarWithEscape(page);

    await openCalendar(page);
    await page.mouse.click(8, 8);
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.matches('.muxui-date-trigger')), true, 'outside dismissal restores trigger focus');

    await openCalendar(page);
    await page.evaluate(() => {
      window.__muxuiDatePopoverSetOpen(false);
      window.setTimeout(() => window.__muxuiDatePopoverSetOpen(true), 24);
    });
    await page.locator('.muxui-date-popover').waitFor();
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 150));
    const rapidStarted = await readEntryMotion(page);
    assert.deepEqual(rapidStarted.animations.map(({ duration, easing }) => ({ duration, easing })), [
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    ], 'rapid reopen starts a fresh token-resolved entry');
    const rapidSettled = await settleEntry(page);
    assert.equal(rapidSettled.opacity, '1', 'rapid close/reopen settles at the open target');
    assert.equal(await page.locator('.muxui-date-popover').count(), 1);
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(true));
    await page.locator('.muxui-date-popover').waitFor();
    await page.evaluate(() => window.__muxuiDatePopoverUnmount());
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.muxui-date-popover').count(), 0, 'unmount removes the popup and Motion cleanup leaves no node');

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.evaluate(() => document.querySelector('link[href*="styles.css"]')?.remove());
    await openCalendar(page);
    const missingStyles = await readEntryMotion(page);
    assert.equal(missingStyles.opacity, '1', 'missing token styles leave the popup visible');
    assert.deepEqual(missingStyles.animations, [], 'missing token styles do not start a parallel fallback animation');
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-duration', '800ms');
    });
    await openCalendar(page);
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 800));
    await page.waitForTimeout(80);
    const slowedSystemEntry = await readEntryMotion(page);
    assert.equal(slowedSystemEntry.animations.some(({ duration }) => Number(duration) === 800), true, 'system reduction test starts from a slowed entry');
    assert.ok(slowedSystemEntry.opacity !== '1' && slowedSystemEntry.transformY > -4 && slowedSystemEntry.transformY < 0, `slowed entry is visibly in flight: ${JSON.stringify(slowedSystemEntry)}`);
    const systemReductionStarted = Date.now();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-date-popover');
      return node?.hasAttribute('data-muxui-date-popover-reduced')
        && getComputedStyle(node).opacity === '1'
        && new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 === 0
        && node.getAnimations().every((animation) => Number(animation.effect?.getComputedTiming().duration) <= 1);
    }, undefined, { timeout: 150 });
    assert.ok(Date.now() - systemReductionStarted < 150, 'system reduction settles the active entry before the slowed token completes');
    const systemReducedDuringEntry = await readEntryMotion(page);
    assert.equal(systemReducedDuringEntry.reduced, true, 'system reduction marks an open popup for its exit path');
    assert.equal(systemReducedDuringEntry.opacity, '1', 'system reduction settles an active entry');
    assert.equal(systemReducedDuringEntry.transformY, 0, 'system reduction settles the entry position');
    assert.equal(systemReducedDuringEntry.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduction stops the active entry');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(120);
    const systemRestoredWhileOpen = await readEntryMotion(page);
    assert.equal(systemRestoredWhileOpen.reduced, false, 'restoring system motion clears the private reduced marker');
    assert.equal(systemRestoredWhileOpen.animations.some(({ duration }) => Number(duration) > 1), false, 'restoring system motion does not replay an open entry');
    assert.equal(systemRestoredWhileOpen.opacity, '1', `restoring system motion keeps the popup settled: ${JSON.stringify(systemRestoredWhileOpen)}`);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-interaction-duration');
      window.__muxuiDatePopoverSetOpen(false);
    });
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.getElementById('root').removeAttribute('data-muxui-motion');
      document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-duration', '800ms');
    });
    await openCalendar(page);
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 800));
    await page.waitForTimeout(80);
    const slowedNestedEntry = await readEntryMotion(page);
    assert.equal(slowedNestedEntry.animations.some(({ duration }) => Number(duration) === 800), true, 'nested reduction test starts from a slowed entry');
    assert.ok(slowedNestedEntry.opacity !== '1' && slowedNestedEntry.transformY > -4 && slowedNestedEntry.transformY < 0, `slowed nested entry is visibly in flight: ${JSON.stringify(slowedNestedEntry)}`);
    const nestedReductionStarted = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-date-popover');
      return node?.hasAttribute('data-muxui-date-popover-reduced')
        && node.getAnimations().every((animation) => Number(animation.effect?.getComputedTiming().duration) <= 1)
        && getComputedStyle(node).opacity === '1'
        && new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 === 0;
    }, undefined, { timeout: 150 });
    assert.ok(Date.now() - nestedReductionStarted < 150, 'nested reduction settles the active entry before the slowed token completes');
    const nestedReducedDuringEntry = await readEntryMotion(page);
    assert.equal(nestedReducedDuringEntry.reduced, true, 'nested reduction marks an open popup for its exit path');
    assert.equal(nestedReducedDuringEntry.opacity, '1', 'nested reduction settles an active entry');
    assert.equal(nestedReducedDuringEntry.transformY, 0, 'nested reduction settles the entry position');
    assert.equal(nestedReducedDuringEntry.animations.some(({ duration }) => Number(duration) > 1), false, 'nested reduction stops the active entry');
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));
    await page.waitForTimeout(120);
    const nestedRestoredWhileOpen = await readEntryMotion(page);
    assert.equal(nestedRestoredWhileOpen.reduced, false, 'restoring nested motion clears the private reduced marker');
    assert.equal(nestedRestoredWhileOpen.animations.some(({ duration }) => Number(duration) > 1), false, 'restoring nested motion does not replay an open entry');
    assert.equal(nestedRestoredWhileOpen.opacity, '1', `restoring nested motion keeps the popup settled: ${JSON.stringify(nestedRestoredWhileOpen)}`);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-interaction-duration');
    });
    await closeCalendarWithEscape(page);

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCalendar(page);
    const systemReducedImmediate = await readEntryMotion(page);
    assert.equal(systemReducedImmediate.reduced, true, 'system reduced mode marks the popup for reduced exit');
    assert.equal(systemReducedImmediate.opacity, '1', 'system reduced mode leaves the popup visible immediately');
    assert.equal(systemReducedImmediate.transformY, 0, 'system reduced mode leaves the popup at its settled position');
    assert.equal(systemReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced mode starts no meaningful entry animation');
    const systemReduced = await settleEntry(page);
    assert.equal(systemReduced.opacity, '1');
    assert.equal(systemReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced mode settles without entry movement');
    await capturePopup(page, '/tmp/muxui-date-popover-reduced-light.png');
    await closeReducedCalendar(page, 'system reduced');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
    await openCalendar(page);
    const explicitReducedImmediate = await readEntryMotion(page);
    assert.equal(explicitReducedImmediate.reduced, true, 'explicit reduced mode marks the popup for reduced exit');
    assert.equal(explicitReducedImmediate.opacity, '1', 'explicit reduced mode leaves the popup visible immediately');
    assert.equal(explicitReducedImmediate.transformY, 0, 'explicit reduced mode leaves the popup at its settled position');
    assert.equal(explicitReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'explicit reduced mode starts no meaningful entry animation');
    const explicitReduced = await settleEntry(page);
    assert.equal(explicitReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'explicit reduced mode settles without entry movement');
    await closeReducedCalendar(page, 'explicit reduced');

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.getElementById('root').setAttribute('data-muxui-motion', 'reduced');
    });
    await openCalendar(page);
    const nestedReducedImmediate = await readEntryMotion(page);
    assert.equal(nestedReducedImmediate.reduced, true, 'nested reduced mode marks the popup for reduced exit');
    assert.equal(nestedReducedImmediate.opacity, '1', 'nested reduced mode leaves the popup visible immediately');
    assert.equal(nestedReducedImmediate.transformY, 0, 'nested reduced mode leaves the popup at its settled position');
    assert.equal(nestedReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'nested reduced mode starts no meaningful entry animation');
    const nestedReduced = await settleEntry(page);
    assert.equal(nestedReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'the popup effective body scope can select reduced mode');
    await closeReducedCalendar(page, 'nested reduced');

    await page.evaluate(() => {
      document.getElementById('root').removeAttribute('data-muxui-motion');
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
    });
    await openCalendar(page);
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) > 0));
    await settleEntry(page);
    await capturePopup(page, '/tmp/muxui-date-popover-full-dark.png');
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'reduced');
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
    });
    await openCalendar(page);
    await settleEntry(page);
    await capturePopup(page, '/tmp/muxui-date-popover-reduced-dark.png');

    assert.deepEqual(errors, [], errors.join('\n'));

    const buttonPage = await browser.newPage();
    await buttonPage.goto(`${url}/button-only.html`, { waitUntil: 'networkidle' });
    await buttonPage.waitForFunction(() => document.documentElement.dataset.muxuiButtonHydrated === 'true');
    const buttonResources = await buttonPage.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    assert.equal(buttonResources.some((name) => /(?:motion|framer-motion)/u.test(name)), false, `Button-only consumer did not load motion: ${buttonResources.join('\n')}`);
    await buttonPage.close();

    const rangePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const rangeErrors = [];
    rangePage.on('pageerror', (error) => rangeErrors.push(error.message));
    rangePage.on('console', (message) => { if (message.type() === 'error') rangeErrors.push(message.text()); });
    await rangePage.goto(`${url}/date-range-popover-motion.html`, { waitUntil: 'networkidle' });
    await rangePage.waitForFunction(() => document.documentElement.dataset.muxuiDateRangePopoverHydrated === 'true');
    await rangePage.locator('.muxui-date-range-control .muxui-date-trigger').click();
    await rangePage.locator('.muxui-date-popover').waitFor();
    await rangePage.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 150));
    const rangeEntry = await readEntryMotion(rangePage);
    assert.deepEqual(rangeEntry.animations.map(({ duration, easing }) => ({ duration, easing })), [
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
      { duration: 150, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    ], 'DateRangePicker shares the token-resolved entry');
    await rangePage.keyboard.press('ArrowRight');
    assert.equal(await rangePage.locator('.muxui-date-popover').count(), 1, 'keyboard calendar navigation keeps the range popup open');
    await rangePage.keyboard.press('Escape');
    await rangePage.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    const rangeActive = await rangePage.evaluate(() => ({
      className: document.activeElement?.getAttribute('class'),
      tagName: document.activeElement?.tagName,
    }));
    assert.equal(rangeActive.className?.includes('muxui-date-trigger'), true, `range Escape restores trigger focus: ${JSON.stringify(rangeActive)}`);
    assert.deepEqual(rangeErrors, [], rangeErrors.join('\n'));
    await rangePage.close();
  } finally {
    await browser?.close();
    await server.close();
  }
});
