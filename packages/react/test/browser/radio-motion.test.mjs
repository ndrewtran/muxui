import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { RadioMotionFixture } from '../fixtures/radio-motion-fixture.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');

async function chromePath() {
  const candidates = [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function documentHtml() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(RadioMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/collections.css"><link rel="stylesheet" href="/src/supplemental/styles.css"><style>
    :root { --muxui-semantic-motion-state-duration: 800ms; }
    body { margin: 40px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    main { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 32px; }
    .muxui-radio-group { gap: 6px; }
  </style></head><body>${body}<script type="module" src="/test/fixtures/radio-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/radio-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion/react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{ name: 'radio-motion-proof', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/radio-motion.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(documentHtml());
      });
    } }],
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${server.httpServer.address().port}/radio-motion.html` };
}

const group = (page, id) => page.locator(`#${id} [role="radiogroup"]`);
const input = (page, id, value) => page.locator(`#${id} input[type="radio"][value="${value}"]`);

async function activate(page, id, value) {
  await input(page, id, value).evaluate((node) => node.click());
}

async function center(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, 'expected a visible radio indicator');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function selectedIndicator(page, id) {
  return page.locator(`#${id} input[type="radio"]:checked`).evaluate((node) => {
    const owner = node.closest('.muxui-radio, .muxui-radio-field__button');
    const indicator = owner?.querySelector('.muxui-radio-indicator, .muxui-radio-field__indicator');
    const rect = indicator?.getBoundingClientRect();
    return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
  });
}

async function waitForAlignment(page, id) {
  await page.waitForFunction((groupId) => {
    const inputNode = document.querySelector(`#${groupId} input[type="radio"]:checked`);
    const dot = document.querySelector(`#${groupId} .muxui-radio-motion-dot`);
    const owner = inputNode?.closest('.muxui-radio, .muxui-radio-field__button');
    const indicator = owner?.querySelector('.muxui-radio-indicator, .muxui-radio-field__indicator');
    if (!dot || !indicator) return false;
    const dotRect = dot.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    return Math.abs(dotRect.left + dotRect.width / 2 - (indicatorRect.left + indicatorRect.width / 2)) < 1
      && Math.abs(dotRect.top + dotRect.height / 2 - (indicatorRect.top + indicatorRect.height / 2)) < 1;
  }, id, { timeout: 5000 });
}

async function waitForFrames(page, count = 2) {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

async function assertAlignedNow(page, id, message) {
  const aligned = await page.evaluate((groupId) => {
    const inputNode = document.querySelector(`#${groupId} input[type="radio"]:checked`);
    const dot = document.querySelector(`#${groupId} .muxui-radio-motion-dot`);
    const owner = inputNode?.closest('.muxui-radio, .muxui-radio-field__button');
    const indicator = owner?.querySelector('.muxui-radio-indicator, .muxui-radio-field__indicator');
    if (!dot || !indicator) return false;
    const dotRect = dot.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    return Math.abs(dotRect.left + dotRect.width / 2 - (indicatorRect.left + indicatorRect.width / 2)) < 1
      && Math.abs(dotRect.top + dotRect.height / 2 - (indicatorRect.top + indicatorRect.height / 2)) < 1;
  }, id);
  assert.equal(aligned, true, message);
}

async function waitForReducedDot(page, id) {
  await page.waitForFunction((groupId) => {
    const dot = document.querySelector(`#${groupId} .muxui-radio-motion-dot`);
    return Boolean(dot && !dot.hasAttribute('style'));
  }, id);
}

async function assertForcedDotContrast(page, id, message) {
  const contrast = await page.locator(`#${id} .muxui-radio-motion-dot`).evaluate((node) => ({
    dot: getComputedStyle(node).backgroundColor,
    indicator: getComputedStyle(node.parentElement).backgroundColor,
    adjustment: getComputedStyle(node).forcedColorAdjust,
  }));
  assert.notEqual(contrast.dot, contrast.indicator, message);
  assert.equal(contrast.adjustment, 'none', `${message} uses local forced-color adjustment`);
}

test('RadioGroup Motion moves one scoped dot while preserving RAC state and reduced modes', { timeout: 90_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiRadioHydrated === 'true');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('[role="radiogroup"]').count(), 6);
    assert.equal(await page.locator('.muxui-radio-motion-dot').count(), 6);
    assert.equal(await group(page, 'compound').locator('.muxui-radio-motion-dot').count(), 1, 'compound RadioField gets the same travelling dot');

    const controlledBefore = await center(group(page, 'controlled').locator('.muxui-radio-motion-dot'));
    await activate(page, 'controlled', 'two');
    await page.waitForTimeout(120);
    const controlledDuring = await center(group(page, 'controlled').locator('.muxui-radio-motion-dot'));
    assert.ok(controlledDuring.y > controlledBefore.y + 1, 'dot visibly leaves the first indicator during travel');
    assert.ok(controlledDuring.y < controlledBefore.y + 30, 'dot is still between indicators during travel');
    await waitForAlignment(page, 'controlled');
    const controlledAfter = await selectedIndicator(page, 'controlled');
    const controlledDotAfter = await center(group(page, 'controlled').locator('.muxui-radio-motion-dot'));
    assert.ok(controlledAfter);
    assert.ok(Math.abs(controlledDotAfter.y - controlledAfter.y) < 1, 'dot settles on the selected indicator');
    assert.equal(await page.locator('#controlled input[type="radio"]:checked').inputValue(), 'two');
    assert.deepEqual(await page.evaluate(() => window.__muxuiRadioProof.changes.current), ['two']);

    await activate(page, 'compound', 'two');
    await waitForAlignment(page, 'compound');
    assert.equal(await page.locator('#compound input[type="radio"]:checked').inputValue(), 'two');
    await activate(page, 'uncontrolled', 'two');
    await waitForAlignment(page, 'uncontrolled');
    assert.equal(await page.locator('#uncontrolled input[type="radio"]:checked').inputValue(), 'two');
    assert.equal(await page.locator('.muxui-radio-motion-dot').count(), 6, 'groups keep independent dot instances');

    const keyboard = group(page, 'keyboard');
    await input(page, 'keyboard', 'one').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await keyboard.locator('input[type="radio"]:checked').inputValue(), 'two');
    await page.keyboard.press('ArrowDown');
    assert.equal(await keyboard.locator('input[type="radio"]:checked').inputValue(), 'four', 'native keyboard navigation skips disabled radios');
    assert.equal(await input(page, 'keyboard', 'three').isDisabled(), true);

    const horizontalBefore = await center(group(page, 'horizontal').locator('.muxui-radio-motion-dot'));
    await input(page, 'horizontal', 'one').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await group(page, 'horizontal').locator('input[type="radio"]:checked').inputValue(), 'two', 'horizontal keyboard navigation follows the inline axis');
    await page.waitForTimeout(120);
    const horizontalDuring = await center(group(page, 'horizontal').locator('.muxui-radio-motion-dot'));
    assert.ok(horizontalDuring.x > horizontalBefore.x + 1, 'horizontal dot travels along the inline axis');
    await waitForAlignment(page, 'horizontal');

    await activate(page, 'read-only', 'two');
    assert.equal(await page.locator('#read-only input[type="radio"]:checked').inputValue(), 'one');
    await page.locator('#radio-form').evaluate((form) => form.reset());
    await page.waitForTimeout(50);
    assert.equal(await page.locator('#uncontrolled input[type="radio"]:checked').inputValue(), 'one', 'form reset restores uncontrolled state');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
    await activate(page, 'controlled', 'one');
    await page.waitForTimeout(60);
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
    await waitForFrames(page);
    await assertAlignedNow(page, 'controlled', 'explicit reduced mode settles a midflight dot immediately');
    await activate(page, 'controlled', 'two');
    await waitForFrames(page);
    await assertAlignedNow(page, 'controlled', 'explicit reduced mode keeps a new selection instant');
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitForReducedDot(page, 'controlled');
    await activate(page, 'controlled', 'one');
    await waitForFrames(page);
    await assertAlignedNow(page, 'controlled', 'OS reduced mode is instant');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await activate(page, 'controlled', 'two');
    await page.waitForTimeout(40);
    await activate(page, 'controlled', 'one');
    await waitForAlignment(page, 'controlled');
    assert.equal(await page.locator('#controlled input[type="radio"]:checked').inputValue(), 'one', 'rapid retarget settles on the latest selection');

    await page.emulateMedia({ forcedColors: 'active' });
    await assertForcedDotContrast(page, 'controlled', 'forced colors keep the direct selected dot visible');
    await assertForcedDotContrast(page, 'compound', 'forced colors keep the compound selected dot visible');
    const proofDirectory = process.env.MUXUI_RADIO_MOTION_PROOF_DIR;
    if (proofDirectory) {
      await mkdir(proofDirectory, { recursive: true });
      await page.screenshot({ path: resolve(proofDirectory, 'forced-colors.png'), fullPage: true, animations: 'disabled' });
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
    await waitForReducedDot(page, 'controlled');
    await waitForFrames(page);
    await assertForcedDotContrast(page, 'controlled', 'forced colors keep the reduced direct dot visible');
    await assertForcedDotContrast(page, 'compound', 'forced colors keep the reduced compound dot visible');
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
    await page.emulateMedia({ forcedColors: 'none' });

    if (proofDirectory) {
      await mkdir(proofDirectory, { recursive: true });
      await page.screenshot({ path: resolve(proofDirectory, 'light.png'), fullPage: true, animations: 'disabled' });
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
      await page.screenshot({ path: resolve(proofDirectory, 'dark.png'), fullPage: true, animations: 'disabled' });
    }

    await page.evaluate(() => window.__muxuiRadioProof.unmount());
    await page.waitForSelector('#radio-unmounted', { state: 'attached' });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
