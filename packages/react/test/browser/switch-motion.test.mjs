import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { SwitchMotionFixture } from '../fixtures/switch-motion-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function indicatorState(page, selector = '#primary-switch') {
  return page.locator(`${selector} .muxui-switch-indicator`).evaluate((node) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return {
      transform: getComputedStyle(node).transform,
      inlineTransform: node.style.transform,
      x: matrix.m41,
      scaleX: Math.hypot(matrix.m11, matrix.m12),
      scaleY: Math.hypot(matrix.m21, matrix.m22),
      animations: node.getAnimations().map((animation) => animation.playState),
    };
  });
}

function switchGeometry(page, selector = '#primary-switch') {
  return page.locator(`${selector} .muxui-switch`).evaluate((node) => {
    const track = getComputedStyle(node, '::before');
    const indicator = node.querySelector('.muxui-switch-indicator');
    const thumb = indicator ? getComputedStyle(indicator) : null;
    return {
      trackWidth: Number.parseFloat(track.width),
      trackHeight: Number.parseFloat(track.height),
      trackBoxSizing: track.boxSizing,
      thumbWidth: Number.parseFloat(thumb?.width ?? '0'),
      thumbOffset: indicator?.offsetLeft ?? 0,
      thumbTravel: Number.parseFloat(track.width) - ((indicator?.offsetLeft ?? 0) * 2) - Number.parseFloat(thumb?.width ?? '0'),
    };
  });
}

async function waitForSettled(page, expectedSelected, selector = '#primary-switch') {
  await page.waitForFunction(({ target, expected }) => {
    const node = document.querySelector(`${target} .muxui-switch-indicator`);
    const switchNode = document.querySelector(`${target} .muxui-switch`);
    return node && switchNode && switchNode.hasAttribute('data-selected') === expected
      && !node.style.transform && node.getAnimations().every((animation) => animation.playState === 'finished');
  }, { target: selector, expected: expectedSelected });
}

test('Switch motion preserves native states, press feedback, RTL travel, and reduced motion', { timeout: 90_000 }, async () => {
  const html = `<!doctype html><html data-muxui-motion="full" data-muxui-color-scheme="light"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"></head><body><div id="root">${renderToString(React.createElement(SwitchMotionFixture))}</div><script type="module" src="/packages/react/test/fixtures/switch-motion-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: {
      entries: ['packages/react/test/fixtures/switch-motion-browser-entry.mjs'],
      include: ['react', 'react-dom/client', 'react-aria-components'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'switch-motion-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/switch-motion.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(html);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 600 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/switch-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.switchMotionReady === 'true');

    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(await page.locator('.muxui-switch').count(), 5);
    assert.equal(await page.locator('#disabled-off-switch input').isDisabled(), true);
    assert.equal(await page.locator('#disabled-on-switch input').isDisabled(), true);
    assert.equal(await page.locator('#readonly-switch input').getAttribute('aria-readonly'), 'true');
    const initial = await indicatorState(page);
    assert.equal(initial.inlineTransform, '');
    assert.ok(Math.abs(initial.x) < 0.5, `off state starts at the balanced inset: ${JSON.stringify(initial)}`);
    const geometry = await switchGeometry(page);
    assert.deepEqual(geometry, {
      trackWidth: 40,
      trackHeight: 22,
      trackBoxSizing: 'border-box',
      thumbWidth: 14,
      thumbOffset: 4,
      thumbTravel: 18,
    }, 'the host track and thumb keep balanced 4px insets with 18px travel');

    const primaryInput = page.locator('#primary-switch input');
    await primaryInput.focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#primary-switch .muxui-switch')?.hasAttribute('data-pressed'));
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch-indicator');
      if (!node) return false;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return Math.hypot(matrix.m11, matrix.m12) > 1.02 && Math.hypot(matrix.m21, matrix.m22) < 0.98;
    });
    const pressed = await indicatorState(page);
    assert.ok(pressed.scaleX > 1.02 && pressed.scaleY < 0.98, `press state compresses the thumb: ${JSON.stringify(pressed)}`);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch-indicator');
      return node?.style.transform && node.getAnimations().some((animation) => animation.playState === 'running');
    });
    const moving = await indicatorState(page);
    assert.ok(moving.animations.includes('running'), `selection uses an in-flight Motion animation: ${JSON.stringify(moving)}`);
    await waitForSettled(page, true);
    const selected = await indicatorState(page);
    assert.ok(Math.abs(selected.x - 18) < 1, `selected state uses the balanced 18px travel: ${JSON.stringify(selected)}`);
    assert.equal(selected.inlineTransform, '');

    await primaryInput.focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#primary-switch .muxui-switch')?.hasAttribute('data-pressed'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const systemReducedPress = await page.locator('#primary-switch .muxui-switch-indicator').evaluate((node) => {
      node.setAttribute('data-motion-pressed', '');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const result = {
        scaleX: Math.hypot(matrix.m11, matrix.m12),
        scaleY: Math.hypot(matrix.m21, matrix.m22),
      };
      node.removeAttribute('data-motion-pressed');
      return result;
    });
    assert.ok(Math.abs(systemReducedPress.scaleX - 1) < 0.001 && Math.abs(systemReducedPress.scaleY - 1) < 0.001,
      `system reduced motion overrides an active press marker: ${JSON.stringify(systemReducedPress)}`);
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch-indicator');
      return node && node.closest('.muxui-switch')?.hasAttribute('data-pressed') && !node.style.transform && node.getAnimations().length === 0;
    });
    await page.keyboard.up('Space');
    await waitForSettled(page, false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.evaluate(() => {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('data-muxui-direction', 'rtl');
    });
    await primaryInput.focus();
    await page.keyboard.press('Space');
    await waitForSettled(page, true);
    const rtlSelected = await indicatorState(page);
    assert.ok(Math.abs(rtlSelected.x + 18) < 1, `RTL selected state travels toward inline end: ${JSON.stringify(rtlSelected)}`);

    await page.evaluate(() => {
      document.documentElement.removeAttribute('dir');
      document.documentElement.removeAttribute('data-muxui-direction');
    });
    await primaryInput.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch-indicator');
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      return switchNode && !switchNode.hasAttribute('data-selected') && node?.style.transform
        && node.getAnimations().some((animation) => animation.playState === 'running');
    });
    await page.evaluate(() => document.getElementById('switch-motion-fixture').setAttribute('data-muxui-motion', 'reduced'));
    const explicitReducedPress = await page.locator('#primary-switch .muxui-switch-indicator').evaluate((node) => {
      node.setAttribute('data-motion-pressed', '');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const result = {
        scaleX: Math.hypot(matrix.m11, matrix.m12),
        scaleY: Math.hypot(matrix.m21, matrix.m22),
      };
      node.removeAttribute('data-motion-pressed');
      return result;
    });
    assert.ok(Math.abs(explicitReducedPress.scaleX - 1) < 0.001 && Math.abs(explicitReducedPress.scaleY - 1) < 0.001,
      `explicit reduced motion overrides an active press marker: ${JSON.stringify(explicitReducedPress)}`);
    await page.waitForFunction(() => {
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      const indicator = document.querySelector('#primary-switch .muxui-switch-indicator');
      return switchNode && !switchNode.hasAttribute('data-selected') && indicator && !indicator.style.transform;
    });
    const reducedOff = await indicatorState(page);
    assert.equal(reducedOff.animations.length, 0, 'explicit reduced motion stops an in-flight Motion animation');
    assert.ok(Math.abs(reducedOff.x) < 1, `reduced motion settles the interrupted state immediately: ${JSON.stringify(reducedOff)}`);

    await primaryInput.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      const indicator = document.querySelector('#primary-switch .muxui-switch-indicator');
      return switchNode?.hasAttribute('data-selected') && indicator && !indicator.style.transform;
    });
    const reducedOn = await indicatorState(page);
    assert.equal(reducedOn.animations.length, 0, 'reduced motion keeps subsequent selection changes instant');
    assert.ok(Math.abs(reducedOn.x - 18) < 1, `reduced motion settles the selected state immediately: ${JSON.stringify(reducedOn)}`);

    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
