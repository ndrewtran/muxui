import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { SliderMotionFixture } from '../fixtures/slider-motion-fixture.mjs';

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
  const body = renderToString(React.createElement(SliderMotionFixture));
  return `<!doctype html><html data-muxui-motion="full" data-muxui-color-scheme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><style>
    body { margin: 40px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); }
    #root { display: flex; flex-direction: column; gap: 28px; align-items: start; }
    .muxui-slider { width: 260px; }
    #vertical { min-block-size: 160px; }
  </style></head><body><div id="root">${body}</div><script type="module" src="/test/fixtures/slider-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false, root: packageRoot, logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/slider-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion/react', 'motion/react-m'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{ name: 'slider-motion-proof', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/slider-motion.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(documentHtml());
      });
    } }],
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${server.httpServer.address().port}/slider-motion.html` };
}

const input = (page, id = 'controlled') => page.locator(`#${id} input[type="range"]`);
const thumb = (page, id = 'controlled') => page.locator(`#${id} .muxui-slider-thumb`);
const track = (page, id = 'controlled') => page.locator(`#${id} .muxui-slider-track`);

async function center(locator) {
  const rect = await locator.boundingBox();
  assert.ok(rect);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

async function waitForScale(page, predicate, id = 'controlled') {
  await page.waitForFunction(({ id, predicate }) => {
    const node = document.querySelector(`#${id} .muxui-slider-thumb-face`);
    if (!node) return false;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return predicate === 'pressed'
      ? matrix.a > 1.01 && matrix.d < 0.99
      : predicate === 'vertical-pressed'
        ? matrix.a < 0.99 && matrix.d > 1.01
        : Math.abs(matrix.a - 1) < 0.001 && Math.abs(matrix.d - 1) < 0.001;
  }, { id, predicate }, { timeout: 2500 });
}

test('numeric Slider A keeps RAC semantics while adding finite tactile thumb motion', { timeout: 90_000 }, async (t) => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const reset = async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__sliderMotionProof));
    };

    await t.test('hydrates, preserves immediate value/position, and springs tactile press back', async () => {
      await reset();
      assert.deepEqual(errors, []);
      assert.equal(await input(page).inputValue(), '60');
      assert.equal(await page.evaluate(() => window.__sliderMotionProof.ref.current === document.getElementById('controlled')), true);
      const origin = await center(thumb(page));
      await page.mouse.move(origin.x, origin.y);
      await page.mouse.down();
      await waitForScale(page, 'pressed');
      await page.mouse.up();
      await waitForScale(page, 'rest');
      const range = await track(page).boundingBox();
      assert.ok(range);
      const destination = { x: range.x + range.width * 0.9, y: range.y + range.height / 2 };
      await page.mouse.move(destination.x, destination.y);
      await page.mouse.down();
      assert.ok(Number(await input(page).inputValue()) >= 85, 'RAC value updates during drag');
      assert.ok(Math.abs((await center(thumb(page))).x - destination.x) < 2, 'RAC position updates immediately');
      await page.evaluate(() => window.__sliderMotionProof.setOptions({ readOnly: true }));
      await waitForScale(page, 'rest');
      await page.mouse.up();
      await page.evaluate(() => window.__sliderMotionProof.setOptions({}));
      await waitForScale(page, 'rest');
      assert.ok((await page.evaluate(() => window.__sliderMotionProof.changes.current)).every(Number.isFinite));
      assert.ok((await page.evaluate(() => window.__sliderMotionProof.ends.current)).length >= 1, 'RAC emits changeEnd after the drag');
    });

    await t.test('keeps keyboard, vertical, disabled, and read-only behavior intact', async () => {
      await reset();
      await input(page).focus();
      await page.keyboard.down('ArrowRight');
      await waitForScale(page, 'pressed');
      assert.equal(await input(page).inputValue(), '61');
      assert.equal(await thumb(page).getAttribute('data-focus-visible'), 'true');
      assert.notEqual(await thumb(page).evaluate((node) => getComputedStyle(node).boxShadow), 'none');
      await page.keyboard.up('ArrowRight');
      await waitForScale(page, 'rest');

      await input(page, 'vertical').focus();
      await page.keyboard.down('ArrowUp');
      await waitForScale(page, 'vertical-pressed', 'vertical');
      assert.equal(await input(page, 'vertical').inputValue(), '41');
      await page.keyboard.up('ArrowUp');
      await waitForScale(page, 'rest', 'vertical');

      for (const id of ['disabled', 'read-only']) {
        const before = await input(page, id).inputValue();
        await input(page, id).focus();
        await page.keyboard.press('End');
        assert.equal(await input(page, id).inputValue(), before);
        await waitForScale(page, 'rest', id);
      }
    });

    await t.test('removes spring animation in system and explicit reduced modes, and cleans up unmount', async () => {
      await reset();
      for (const mode of ['system', 'explicit']) {
        if (mode === 'system') {
          await page.evaluate(() => document.documentElement.removeAttribute('data-muxui-motion'));
          await page.emulateMedia({ reducedMotion: 'reduce' });
        } else {
          await page.emulateMedia({ reducedMotion: 'no-preference' });
          await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
        }
        const point = await center(thumb(page));
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.waitForFunction(() => {
          const node = document.querySelector('#controlled .muxui-slider-thumb-face');
          return node && getComputedStyle(node).transform === 'none';
        });
        await page.mouse.up();
        await waitForScale(page, 'rest');
        await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'full'));
        await page.emulateMedia({ reducedMotion: 'no-preference' });
      }
      await page.evaluate(() => window.__sliderMotionRoot.unmount());
      await page.mouse.move(700, 700);
      await page.mouse.up();
      assert.equal(await page.locator('.muxui-slider').count(), 0);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    await t.test('touch cancellation releases the decorative press state', async () => {
      const touchPage = await browser.newPage({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
      touchPage.on('pageerror', (error) => errors.push(error.message));
      try {
        await touchPage.goto(url, { waitUntil: 'networkidle' });
        await touchPage.waitForFunction(() => Boolean(window.__sliderMotionProof));
        const cdp = await touchPage.context().newCDPSession(touchPage);
        const range = await track(touchPage).boundingBox();
        assert.ok(range);
        const y = range.y + range.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: range.x + range.width * 0.7, y }] });
        await waitForScale(touchPage, 'pressed');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await waitForScale(touchPage, 'rest');
        await input(touchPage).focus();
        await touchPage.keyboard.down('ArrowRight');
        await waitForScale(touchPage, 'pressed');
        await touchPage.keyboard.up('ArrowRight');
        await waitForScale(touchPage, 'rest');
      } finally {
        await touchPage.close();
      }
    });
  } finally {
    await browser?.close();
    await server.close();
  }
});
