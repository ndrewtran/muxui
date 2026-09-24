import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { TooltipMotionFixture } from '../fixtures/tooltip-motion-fixture.mjs';

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
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(TooltipMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body { margin: 0; }</style></head><body>${body}<script type="module" src="/test/fixtures/tooltip-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/tooltip-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{
      name: 'tooltip-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/tooltip-motion.html') {
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

async function readMotion(page) {
  return page.locator('.muxui-tooltip').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      opacity: Number(style.opacity),
      translate: style.translate,
      scale: style.scale,
      filter: style.filter,
      placement: node.getAttribute('data-placement'),
      entering: node.hasAttribute('data-entering'),
      exiting: node.hasAttribute('data-exiting'),
    };
  });
}

async function waitForMotion(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.muxui-tooltip');
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) < 0.99
      || style.translate !== 'none' && style.translate !== '0px 0px'
      || style.scale !== 'none' && style.scale !== '1'
      || style.filter !== 'none';
  }, undefined, { timeout: 1500 });
}

async function readEnteringScaleTarget(page) {
  return page.locator('.muxui-tooltip').evaluate((node) => {
    const probe = node.cloneNode(false);
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    probe.setAttribute('data-entering', '');
    probe.removeAttribute('data-exiting');
    probe.style.setProperty('transition', 'none', 'important');
    probe.style.setProperty('visibility', 'hidden');
    probe.style.setProperty('pointer-events', 'none');
    node.parentElement.append(probe);
    const scale = getComputedStyle(probe).scale;
    probe.remove();
    return scale;
  });
}

async function waitForSettled(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.muxui-tooltip');
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) >= 0.999
      && /^(?:none|0px(?: 0px)?)$/u.test(style.translate)
      && /^(?:none|1)$/u.test(style.scale)
      && style.filter === 'none';
  }, undefined, { timeout: 3000 });
}

async function configure(page, nextOpen, nextPlacement = 'top', nextShouldFlip = false, nextPosition = 'center', nextRefMode = 'object') {
  await page.evaluate(({ nextOpen: open, nextPlacement: placement, nextShouldFlip: shouldFlip, nextPosition: position, nextRefMode: refMode }) => window.__tooltipConfigure({ nextOpen: open, nextPlacement: placement, nextShouldFlip: shouldFlip, nextPosition: position, nextRefMode: refMode }), { nextOpen, nextPlacement, nextShouldFlip, nextPosition, nextRefMode });
}

async function readRefs(page) {
  return page.evaluate(() => window.__tooltipReadRefs());
}

test('Tooltip motion is finite, placement-aware, reduced-safe, and preserves RAC semantics', { timeout: 90_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/tooltip-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiTooltipMotionHydrated === 'true');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('.muxui-tooltip').count(), 0, 'SSR and hydration begin closed');

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-feedback-duration', '800ms'));
    await page.locator('#tooltip-trigger').focus();
    await configure(page, true, 'top');
    const tooltip = page.locator('.muxui-tooltip');
    await tooltip.waitFor();
    await waitForMotion(page);
    const entry = await readMotion(page);
    assert.equal(entry.placement, 'top');
    assert.ok(entry.opacity < 1 || entry.entering, 'entry changes opacity before settling');
    assert.ok(Number.parseFloat(entry.translate.split(/\s+/u)[1]) > 4, 'top entry rises from an 8px offset');
    assert.equal(await readEnteringScaleTarget(page), '0.9', 'entering style targets the approved scale');
    assert.ok(Number(entry.scale) >= 0.9 && Number(entry.scale) <= 1, `computed scale is the current entry sample: ${entry.scale}`);
    assert.match(entry.filter, /blur\(5px\)/u, 'entry starts with finite blur');
    assert.equal(await page.locator('#tooltip-trigger').getAttribute('aria-describedby'), await tooltip.getAttribute('id'));
    assert.equal((await readRefs(page)).objectAttached, true, 'object refs receive the mounted tooltip node');
    await waitForSettled(page);
    assert.ok((await readMotion(page)).opacity >= 0.999);

    await configure(page, false);
    await page.waitForFunction(() => document.querySelector('.muxui-tooltip')?.hasAttribute('data-exiting') || Number(getComputedStyle(document.querySelector('.muxui-tooltip')).opacity) < 0.99);
    await tooltip.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#tooltip-trigger').getAttribute('aria-describedby'), null);
    assert.equal((await readRefs(page)).objectAttached, false, 'object refs clear after tooltip detach');

    await configure(page, true, 'top', true, 'top-edge');
    await tooltip.waitFor();
    await waitForMotion(page);
    const flippedEntry = await readMotion(page);
    assert.equal(flippedEntry.placement, 'bottom', 'top placement flips below a top-edge trigger');
    assert.ok(Number.parseFloat(flippedEntry.translate.split(/\s+/u)[1]) < -4, 'flipped entry uses the bottom placement vector');
    await waitForSettled(page);

    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });

    await configure(page, true, 'bottom');
    await tooltip.waitFor();
    await waitForMotion(page);
    const bottomEntry = await readMotion(page);
    assert.equal(bottomEntry.placement, 'bottom');
    assert.ok(Number.parseFloat(bottomEntry.translate.split(/\s+/u)[1]) < -4, 'bottom entry rises toward the trigger');
    await waitForSettled(page);

    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });
    await configure(page, true, 'start');
    await tooltip.waitFor();
    await waitForMotion(page);
    const leftEntry = await readMotion(page);
    assert.equal(leftEntry.placement, 'left');
    assert.ok(Number.parseFloat(leftEntry.translate.split(/\s+/u)[0]) > 4, 'left entry moves inward from the placement edge');
    await waitForSettled(page);

    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });
    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-feedback-duration', '800ms'));
    await configure(page, true, 'start');
    await tooltip.waitFor();
    await waitForMotion(page);
    await configure(page, false);
    await configure(page, true, 'end');
    await tooltip.waitFor();
    await waitForSettled(page);
    assert.equal((await readMotion(page)).placement, 'right');

    await page.evaluate(() => document.getElementById('tooltip-trigger').setAttribute('data-muxui-motion', 'reduced'));
    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await configure(page, true, 'top');
    await tooltip.waitFor();
    await waitForSettled(page);
    assert.ok((await readMotion(page)).opacity >= 0.999);
    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });

    await page.evaluate(() => document.getElementById('tooltip-trigger').removeAttribute('data-muxui-motion'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await configure(page, true, 'top');
    await tooltip.waitFor();
    await waitForMotion(page);
    await tooltip.evaluate((node) => { node.style.opacity = '0.97'; });
    assert.equal(await tooltip.evaluate((node) => node.style.opacity), '0.97');
    await page.evaluate(() => document.getElementById('tooltip-trigger').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-tooltip');
      if (!node) return false;
      const style = getComputedStyle(node);
      return Number(style.opacity) >= 0.999 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate) && style.filter === 'none';
    }, undefined, { timeout: 300 });
    await page.evaluate(() => document.getElementById('tooltip-trigger').removeAttribute('data-muxui-motion'));
    await page.waitForFunction(() => document.querySelector('.muxui-tooltip')?.style.opacity === '0.97');
    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });

    await configure(page, true, 'top', false, 'center', 'callback');
    await tooltip.waitFor();
    await waitForSettled(page);
    let refEvents = (await readRefs(page)).events;
    assert.equal(refEvents.filter(({ type }) => type === 'set').length, 1, 'callback refs receive the mounted tooltip node');
    await configure(page, false);
    await tooltip.waitFor({ state: 'detached' });
    refEvents = (await readRefs(page)).events;
    assert.equal(refEvents.filter(({ type }) => type === 'cleanup').length, 1, 'callback ref cleanup runs once on detach');

    await configure(page, true, 'top', false, 'center', 'callback');
    await tooltip.waitFor();
    await waitForSettled(page);
    await page.evaluate(() => window.__tooltipUnmount());
    await page.locator('#tooltip-unmounted').waitFor({ state: 'attached' });
    refEvents = await page.evaluate(() => [...window.__tooltipRefEvents]);
    assert.equal(refEvents.filter(({ type }) => type === 'cleanup').length, 2, 'callback ref cleanup runs once on unmount');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
