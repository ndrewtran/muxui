import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { ColorSliderMotionFixture } from '../fixtures/color-slider-motion-fixture.mjs';

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
  const body = renderToString(React.createElement(ColorSliderMotionFixture));
  return `<!doctype html><html data-muxui-motion="full" data-muxui-color-scheme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><style>
    body { margin: 40px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    #root { display: flex; flex-direction: column; gap: 28px; align-items: start; }
    .muxui-color-slider { width: 260px; }
    .muxui-color-slider:has(#vertical) { width: 15px; }
    #vertical { height: 120px; }
  </style></head><body><div id="root">${body}</div><script type="module" src="/test/fixtures/color-slider-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false, root: packageRoot, logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/color-slider-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion/react', 'motion/react-m'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{ name: 'color-slider-motion-proof', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/color-slider-motion.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(documentHtml());
      });
    } }],
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${server.httpServer.address().port}/color-slider-motion.html` };
}

const input = (page, id = 'controlled') => page.locator(`#${id} input[type="range"]`);
const track = (page, id = 'controlled') => page.locator(`#${id}.muxui-color-slider-track`);
const wheelInput = (page) => page.locator('#wheel');
const wheelTrack = (page) => page.locator('.muxui-color-wheel-track');
const wheelThumb = (page) => page.locator('.muxui-color-wheel-thumb');

async function center(locator) {
  const rect = await locator.boundingBox();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function waitForFace(page, predicate, id = 'controlled', component = 'slider') {
  await page.waitForFunction(({ id, predicate, component }) => {
    const root = component === 'wheel'
      ? document.getElementById(id)?.closest('.muxui-color-wheel')
      : document.getElementById(id);
    const prefix = component === 'wheel' ? 'muxui-color-wheel' : 'muxui-color-slider';
    const matrix = new DOMMatrixReadOnly(getComputedStyle(root.querySelector(`.${prefix}-thumb-face`)).transform);
    const visual = new DOMMatrixReadOnly(getComputedStyle(root.querySelector(`.${prefix}-thumb-visual`)).transform);
    const opacity = Number(getComputedStyle(root.querySelector(`.${prefix}-thumb-halo`)).opacity);
    if (predicate === 'hover') return matrix.a > 1.02;
    if (predicate === 'press') return matrix.a < 0.995;
    if (predicate === 'travel') return Math.abs(visual.m41) + Math.abs(visual.m42) > 2;
    if (predicate === 'position') return Math.abs(visual.m41) + Math.abs(visual.m42) < 0.1;
    return Math.abs(matrix.a - 1) < 0.001 && opacity < 0.001 && Math.abs(visual.m41) + Math.abs(visual.m42) < 0.1;
  }, { id, predicate, component }, { timeout: 2500 });
}

test('ColorSlider A preserves native interaction with finite, reduced-motion-safe decoration', { timeout: 90_000 }, async (t) => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 850 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const reset = async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__colorSliderProof));
    };

    await t.test('hydrates, presses and releases; click travel never delays value or direct dragging', async () => {
      await reset();
      assert.deepEqual(errors, []);
      assert.equal(await input(page).count(), 1);
      assert.equal(await page.evaluate(() => window.__colorSliderProof.ref.current === document.getElementById('controlled').parentElement), true);
      const thumb = page.locator('#controlled .muxui-color-slider-thumb');
      assert.equal(await thumb.evaluate((node) => getComputedStyle(node).borderTopColor), 'rgba(0, 0, 0, 0)');
      const origin = await center(thumb);
      await page.mouse.move(origin.x, origin.y);
      await waitForFace(page, 'hover');
      if (process.env.MUXUI_COLOR_SLIDER_PROOF_DIR) {
        await page.screenshot({ path: `${process.env.MUXUI_COLOR_SLIDER_PROOF_DIR}/light.png` });
        await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
        await page.screenshot({ path: `${process.env.MUXUI_COLOR_SLIDER_PROOF_DIR}/dark.png` });
        await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'light'));
      }
      await page.mouse.down();
      await waitForFace(page, 'press');
      await page.mouse.up();
      await waitForFace(page, 'hover');
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle');

      const rect = await track(page).boundingBox();
      const destination = { x: rect.x + rect.width * 0.9, y: rect.y + rect.height / 2 };
      await page.mouse.move(destination.x, destination.y);
      await page.mouse.down();
      await waitForFace(page, 'travel');
      assert.ok(Number(await input(page).inputValue()) >= 228, 'RAC commits the new value during decorative travel');
      assert.ok(Math.abs((await center(thumb)).x - destination.x) < 2, 'the actual hit target has already moved');

      await page.mouse.move(rect.x + rect.width * 0.5, destination.y);
      await waitForFace(page, 'position');
      assert.ok(Math.abs(Number(await input(page).inputValue()) - 128) <= 2);
      await page.mouse.move(rect.x - 30, destination.y);
      assert.equal(await input(page).inputValue(), '0');
      await page.mouse.move(rect.x + rect.width + 30, destination.y);
      assert.equal(await input(page).inputValue(), '255');
      await page.mouse.move(rect.x + rect.width * 0.25, destination.y);
      assert.ok(Math.abs(Number(await input(page).inputValue()) - 64) <= 2);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle');
      assert.ok((await page.evaluate(() => window.__colorSliderProof.changes.current)).every((value) => typeof value === 'string'));

      await page.mouse.click(destination.x, destination.y);
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle');
      assert.ok(Number(await input(page).inputValue()) >= 228);
    });

    await t.test('keeps keyboard, RTL, vertical, focus, read-only and disabled behavior', async () => {
      await reset();
      await input(page).focus();
      await page.keyboard.down('ArrowRight');
      await waitForFace(page, 'press');
      assert.equal(await input(page).inputValue(), '65');
      assert.equal(await page.locator('#controlled .muxui-color-slider-thumb').getAttribute('data-focus-visible'), 'true');
      assert.notEqual(await page.locator('#controlled .muxui-color-slider-thumb').evaluate((node) => getComputedStyle(node).boxShadow), 'none');
      await page.keyboard.up('ArrowRight');
      await waitForFace(page, 'idle');
      for (const id of ['controlled', 'uncontrolled', 'rtl', 'vertical']) {
        await input(page, id).press('End');
        assert.equal(await input(page, id).inputValue(), '255');
        await input(page, id).press('Home');
        assert.equal(await input(page, id).inputValue(), '0');
      }
      await input(page, 'rtl').press('ArrowLeft');
      assert.equal(await input(page, 'rtl').inputValue(), '1');
      await input(page, 'vertical').press('ArrowUp');
      assert.equal(await input(page, 'vertical').inputValue(), '1');
      const vertical = await track(page, 'vertical').boundingBox();
      await page.mouse.move(vertical.x + vertical.width / 2, vertical.y + vertical.height * 0.1);
      await page.mouse.down();
      await waitForFace(page, 'travel', 'vertical');
      assert.ok(Number(await input(page, 'vertical').inputValue()) >= 228);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle', 'vertical');

      for (const options of [{ readOnly: true }, { disabled: true }]) {
        await page.evaluate((value) => window.__colorSliderProof.setOptions(value), options);
        const before = await input(page).inputValue();
        const point = await center(track(page));
        await page.mouse.click(point.x, point.y);
        if (options.disabled) await page.keyboard.press('End');
        else await input(page).press('End');
        assert.equal(await input(page).inputValue(), before);
        await waitForFace(page, 'idle');
      }
      const pickerBefore = await input(page, 'picker').inputValue();
      await input(page, 'picker').press('End');
      assert.equal(await input(page, 'picker').getAttribute('aria-readonly'), 'true');
      assert.equal(await input(page, 'picker').inputValue(), pickerBefore);
      assert.equal(await input(page, 'disabled').isDisabled(), true);
    });

    await t.test('ColorWheel mirrors finite hover, press, release, keyboard, disabled and reduced states', async () => {
      await reset();
      assert.equal(await wheelInput(page).count(), 1);
      assert.equal(await page.evaluate(() => window.__colorWheelProof.ref.current === document.querySelector('.muxui-color-wheel')), true);
      const thumb = wheelThumb(page);
      const origin = await center(thumb);
      const proofDir = process.env.MUXUI_COLOR_SLIDER_PROOF_DIR;
      const captureWheel = async (name) => {
        if (!proofDir) return;
        const box = await page.locator('.muxui-color-wheel').boundingBox();
        await page.screenshot({ path: `${proofDir}/wheel-${name}.png`, clip: box });
      };
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle', 'wheel', 'wheel');
      await captureWheel('light-idle');
      await page.mouse.move(origin.x, origin.y);
      await waitForFace(page, 'hover', 'wheel', 'wheel');
      await captureWheel('light-hover');
      await page.mouse.down();
      await waitForFace(page, 'press', 'wheel', 'wheel');
      await captureWheel('light-pressed');
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle', 'wheel', 'wheel');
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
      await captureWheel('dark-idle');
      await page.mouse.move(origin.x, origin.y);
      await waitForFace(page, 'hover', 'wheel', 'wheel');
      await captureWheel('dark-hover');
      await page.mouse.down();
      await waitForFace(page, 'press', 'wheel', 'wheel');
      await captureWheel('dark-pressed');
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle', 'wheel', 'wheel');
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'light'));

      const rect = await wheelTrack(page).boundingBox();
      const centerPoint = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      const ringRadius = rect.width / 2 - 6;
      const top = { x: centerPoint.x, y: centerPoint.y - ringRadius };
      const right = { x: centerPoint.x + ringRadius, y: centerPoint.y };
      await page.mouse.move(top.x, top.y);
      await page.mouse.down();
      await waitForFace(page, 'press', 'wheel', 'wheel');
      const topValue = Number(await wheelInput(page).inputValue());
      await page.mouse.move(right.x, right.y);
      await page.waitForFunction((before) => Number(document.querySelector('#wheel').value) !== before, topValue);
      await page.mouse.up();
      await page.mouse.move(0, 0);
      await waitForFace(page, 'idle', 'wheel', 'wheel');
      assert.ok((await page.evaluate(() => window.__colorWheelProof.changes.current)).every((value) => typeof value === 'string'));

      await wheelInput(page).focus();
      const keyboardBefore = Number(await wheelInput(page).inputValue());
      await page.keyboard.down('ArrowRight');
      await waitForFace(page, 'press', 'wheel', 'wheel');
      assert.notEqual(Number(await wheelInput(page).inputValue()), keyboardBefore);
      await page.keyboard.up('ArrowRight');
      await waitForFace(page, 'idle', 'wheel', 'wheel');

      for (const options of [{ readOnly: true }, { disabled: true }]) {
        await page.evaluate((value) => window.__colorWheelProof.setOptions(value), options);
        await page.mouse.move(0, 0);
        await waitForFace(page, 'idle', 'wheel', 'wheel');
        const before = await wheelInput(page).inputValue();
        await page.mouse.click(top.x, top.y);
        await wheelInput(page).press('End');
        assert.equal(await wheelInput(page).inputValue(), before);
        await waitForFace(page, 'idle', 'wheel', 'wheel');
      }

      await page.evaluate(() => window.__colorWheelProof.setOptions({}));
      await page.waitForFunction(() => !document.querySelector('#wheel').disabled);
      for (const mode of ['system', 'explicit']) {
        await page.emulateMedia({ reducedMotion: mode === 'system' ? 'reduce' : 'no-preference' });
        if (mode === 'explicit') await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
        await page.evaluate(() => window.__colorWheelProof.setValue('#406699'));
        await page.waitForFunction(() => Number(document.querySelector('#wheel').value) > 200);
        const before = Number(await wheelInput(page).inputValue());
        await wheelInput(page).focus();
        await page.keyboard.press('ArrowRight');
        await waitForFace(page, 'idle', 'wheel', 'wheel');
        assert.notEqual(Number(await wheelInput(page).inputValue()), before);
        if (mode === 'explicit') await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    });

    await t.test('honors both reduced modes and unmount cleanup', async () => {
      await reset();
      for (const mode of ['system', 'explicit']) {
        if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
        else {
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
        }
        const rect = await track(page).boundingBox();
        await input(page).press('Home');
        await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height / 2);
        await page.mouse.down();
        await waitForFace(page, 'idle');
        assert.ok(Number(await input(page).inputValue()) >= 202);
        await page.mouse.up();
      }
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
      await input(page).press('Home');
      const rect = await track(page).boundingBox();
      await page.mouse.move(rect.x + rect.width * 0.9, rect.y + rect.height / 2);
      await page.mouse.down();
      await waitForFace(page, 'travel');
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
      await waitForFace(page, 'idle');
      await page.mouse.up();

      await page.emulateMedia({ forcedColors: 'active' });
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-color-scheme', 'dark'));
      const border = await page.locator('#controlled .muxui-color-slider-thumb-face').evaluate((node) => {
        const style = getComputedStyle(node);
        return { width: style.borderWidth, style: style.borderStyle };
      });
      assert.deepEqual(border, { width: '2px', style: 'solid' });
      const wheelBorder = await page.locator('.muxui-color-wheel-thumb-face').evaluate((node) => {
        const style = getComputedStyle(node);
        return { width: style.borderWidth, style: style.borderStyle };
      });
      assert.deepEqual(wheelBorder, { width: '2px', style: 'solid' });
      await page.emulateMedia({ forcedColors: 'none' });
      await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
      const point = await center(page.locator('#controlled .muxui-color-slider-thumb'));
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await waitForFace(page, 'press');
      await page.evaluate(() => window.__colorSliderRoot.unmount());
      await page.mouse.move(700, 700);
      await page.mouse.up();
      assert.equal(await page.locator('.muxui-color-slider').count(), 0);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    await t.test('touch dragging stays direct and touch cancellation releases the decoration', async () => {
      const touchPage = await browser.newPage({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
      touchPage.on('pageerror', (error) => errors.push(error.message));
      try {
        await touchPage.goto(url, { waitUntil: 'networkidle' });
        await touchPage.waitForFunction(() => Boolean(window.__colorSliderProof));
        const cdp = await touchPage.context().newCDPSession(touchPage);
        const rect = await track(touchPage).boundingBox();
        const y = rect.y + rect.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + rect.width * 0.8, y }] });
        await waitForFace(touchPage, 'press');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + rect.width * 0.3, y }] });
        await waitForFace(touchPage, 'position');
        assert.ok(Math.abs(Number(await input(touchPage).inputValue()) - 77) <= 2);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await waitForFace(touchPage, 'idle');
        assert.equal(await touchPage.locator('#controlled .muxui-color-slider-thumb').getAttribute('data-dragging'), null);
        assert.deepEqual(errors, [], errors.join('\n'));
      } finally { await touchPage.close(); }
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});
