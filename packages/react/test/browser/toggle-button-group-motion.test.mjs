import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { ToggleButtonGroupMotionFixture } from '../fixtures/toggle-button-group-motion-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const packageRoot = resolve(repositoryRoot, 'packages/react');

async function chromePath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

async function startServer() {
  const html = `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/components.css"><style>
    :root { --muxui-semantic-motion-state-duration: 1200ms; --muxui-semantic-motion-state-transition-duration: 1200ms; --muxui-semantic-motion-state-transition-spring-visual-duration: 1200ms; }
    body { margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); font-family: system-ui, sans-serif; }
    main { display: grid; gap: 20px; max-width: 760px; }
    section { display: grid; gap: 8px; justify-items: start; }
    output { font-size: 12px; }
  </style></head><body><div id="root">${renderToString(React.createElement(ToggleButtonGroupMotionFixture))}</div><script type="module" src="/test/fixtures/toggle-button-group-motion-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    cacheDir: await mkdtemp(join(tmpdir(), 'muxui-toggle-button-group-motion-vite-')),
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['test/fixtures/toggle-button-group-motion-browser-entry.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion/react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'toggle-button-group-motion-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/toggle-button-group-motion.html') {
          response.setHeader('content-type', 'text/html');
          response.end(html);
          return;
        }
        next();
      });
    } }],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.equal(typeof address, 'object');
  assert.ok(address?.port);
  return { server, cacheDir: server.config.cacheDir, url: `http://127.0.0.1:${address.port}/toggle-button-group-motion.html` };
}

function assertRectsClose(actual, expected, message = 'rectangles should align') {
  assert.ok(actual && expected, message);
  for (const key of ['left', 'top', 'width', 'height']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.75, `${message}: ${key} ${actual[key]} vs ${expected[key]}`);
  }
}

async function readGroup(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const buttons = [...root.querySelectorAll(':scope > .muxui-toggle-button')];
    const selected = buttons.filter((button) => button.hasAttribute('data-selected')
      || button.getAttribute('aria-checked') === 'true'
      || button.getAttribute('aria-pressed') === 'true');
    const indicator = root.querySelector('.muxui-toggle-button-group-motion-indicator');
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
    };
    return {
      selected: selected.map((button) => button.textContent.trim()),
      selectedRects: selected.map(rect),
      buttons: buttons.map(rect),
      buttonBackgrounds: buttons.map((button) => getComputedStyle(button).backgroundColor),
      indicator: rect(indicator),
      indicatorBackground: indicator ? getComputedStyle(indicator).backgroundColor : null,
      indicatorOpacity: indicator ? getComputedStyle(indicator).opacity : null,
      selectedBackground: selected[0] ? getComputedStyle(selected[0]).backgroundColor : null,
      selectedOpacity: selected[0] ? getComputedStyle(selected[0]).opacity : null,
      foregroundCount: root.querySelectorAll('.muxui-toggle-button-group-motion-label').length,
      internalCount: root.querySelectorAll('[data-muxui-toggle-motion-internal]').length,
      ready: root.hasAttribute('data-muxui-toggle-motion-ready'),
      reduced: root.hasAttribute('data-muxui-toggle-motion-reduced'),
      trailing: root.hasAttribute('data-muxui-toggle-motion-trailing'),
      motion: root.getAttribute('data-muxui-toggle-motion'),
    };
  });
}

async function waitForSelected(page, selector, text) {
  await page.waitForFunction(({ rootSelector, expected }) => {
    const root = document.querySelector(rootSelector);
    return [...(root?.querySelectorAll(':scope > .muxui-toggle-button') ?? [])]
      .some((button) => (button.hasAttribute('data-selected') || button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true')
        && button.textContent.trim() === expected);
  }, { rootSelector: selector, expected: text });
}

async function waitForAlignment(page, selector) {
  await page.waitForFunction((rootSelector) => {
    const root = document.querySelector(rootSelector);
    const selected = [...(root?.querySelectorAll(':scope > .muxui-toggle-button') ?? [])]
      .find((button) => button.hasAttribute('data-selected') || button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true');
    const indicator = root?.querySelector('.muxui-toggle-button-group-motion-indicator');
    if (!selected || !indicator || getComputedStyle(indicator).opacity === '0') return false;
    const a = selected.getBoundingClientRect();
    const b = indicator.getBoundingClientRect();
    return Math.abs(a.left - b.left) < 0.75 && Math.abs(a.top - b.top) < 0.75
      && Math.abs(a.width - b.width) < 0.75 && Math.abs(a.height - b.height) < 0.75;
  }, selector);
}

test('ToggleButtonGroup selection fill follows state with a restrained trailing stretch', { timeout: 90_000 }, async () => {
  const serverMarkup = renderToString(React.createElement(ToggleButtonGroupMotionFixture));
  assert.equal(serverMarkup.includes('data-muxui-toggle-motion'), false);
  const { server, cacheDir, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.toggleButtonGroupMotionHydrated === 'true');
    assert.deepEqual(errors, []);

    const primary = '#primary-toggle';
    const initial = await readGroup(page, primary);
    assert.deepEqual(initial.selected, ['One']);
    assert.equal(initial.motion, 'single');
    assert.equal(initial.internalCount, 2);
    assert.equal(initial.foregroundCount, 3);
    assert.equal(initial.ready, true);
    assertRectsClose(initial.indicator, initial.selectedRects[0], 'initial fill should cover selected button');

    await page.locator(`${primary} > .muxui-toggle-button`).first().hover();
    const selectedHover = await readGroup(page, primary);
    assert.notEqual(selectedHover.indicatorBackground, initial.indicatorBackground, 'selected hover should use the existing neutral90 fill token');
    await page.mouse.move(0, 0);

    await page.locator(`${primary} > .muxui-toggle-button`).nth(1).hover();
    await page.waitForTimeout(180);
    const restingUnselectedHover = await readGroup(page, primary);
    assert.notEqual(restingUnselectedHover.buttonBackgrounds[1], 'rgba(0, 0, 0, 0)', 'unselected hover should retain its resting background');

    await page.evaluate(() => window.__toggleSetPrimary('two'));
    await waitForSelected(page, primary, 'Two');
    await page.waitForFunction(() => document.querySelector('#primary-toggle[data-muxui-toggle-motion-trailing]'));
    await page.waitForTimeout(90);
    const inFlight = await readGroup(page, primary);
    assert.equal(inFlight.trailing, true);
    assert.equal(inFlight.buttonBackgrounds[1], 'rgba(0, 0, 0, 0)', 'hover paint should not cover the outgoing moving fill');
    assert.ok(inFlight.indicator && initial.indicator);
    assert.ok(inFlight.indicator.left !== initial.indicator.left, 'fill should physically move toward the next button');
    assert.ok(inFlight.indicator.width > Math.max(initial.indicator.width, inFlight.selectedRects[0].width) + 0.2,
      `trailing travel should briefly stretch the fill: ${JSON.stringify({ initial, inFlight })}`);
    await waitForAlignment(page, primary);
    const settledTwo = await readGroup(page, primary);
    assertRectsClose(settledTwo.indicator, settledTwo.selectedRects[0], 'fill should settle exactly on target');

    await page.evaluate(() => window.__toggleSetPrimary('long'));
    await waitForSelected(page, primary, 'Longer selection');
    await page.waitForTimeout(35);
    const beforeReverse = await readGroup(page, primary);
    await page.evaluate(() => window.__toggleSetPrimary('one'));
    await waitForSelected(page, primary, 'One');
    await page.waitForTimeout(20);
    const afterReverse = await readGroup(page, primary);
    assert.ok(beforeReverse.indicator && afterReverse.indicator);
    assert.ok(Math.abs(afterReverse.indicator.left - beforeReverse.indicator.left) < 28,
      `reversal should continue from the rendered position: ${JSON.stringify({ beforeReverse, afterReverse })}`);
    await waitForAlignment(page, primary);

    await page.evaluate(() => window.__toggleClearPrimary());
    await page.waitForFunction(() => ![...document.querySelectorAll('#primary-toggle > .muxui-toggle-button')]
      .some((button) => button.hasAttribute('data-selected') || button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true'));
    await page.waitForFunction(() => !document.querySelector('#primary-toggle[data-muxui-toggle-motion-ready]'));
    const cleared = await readGroup(page, primary);
    assert.equal(cleared.indicatorOpacity, '0');
    assert.equal(cleared.ready, false);
    await page.evaluate(() => window.__toggleSetPrimary('one'));
    await waitForSelected(page, primary, 'One');
    await waitForAlignment(page, primary);

    await page.evaluate(() => document.querySelector('#primary-toggle').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => document.querySelector('#primary-toggle[data-muxui-toggle-motion-reduced]'));
    await page.evaluate(() => window.__toggleSetPrimary('long'));
    await waitForSelected(page, primary, 'Longer selection');
    await waitForAlignment(page, primary);
    const reduced = await readGroup(page, primary);
    assert.equal(reduced.reduced, true);
    assert.equal(reduced.trailing, false);
    assertRectsClose(reduced.indicator, reduced.selectedRects[0], 'reduced motion should settle immediately');
    await page.evaluate(() => document.querySelector('#primary-toggle').removeAttribute('data-muxui-motion'));
    await page.waitForFunction(() => !document.querySelector('#primary-toggle[data-muxui-toggle-motion-reduced]'));

    const multiple = '#multiple-toggle';
    const multipleInitial = await readGroup(page, multiple);
    assert.equal(multipleInitial.motion, null);
    assert.equal(multipleInitial.internalCount, 0);
    assert.equal(multipleInitial.foregroundCount, 0);
    await page.evaluate(() => window.__toggleSetMultiple(['long']));
    await page.waitForFunction(() => document.querySelectorAll('#multiple-toggle > .muxui-toggle-button[data-selected]').length === 1);
    const multipleNext = await readGroup(page, multiple);
    assert.deepEqual(multipleNext.selected, ['Longer selection']);
    assert.equal(multipleNext.indicator, null);

    const required = '#required-toggle';
    await page.locator(`${required} > .muxui-toggle-button`).first().click();
    await page.waitForTimeout(30);
    assert.deepEqual((await readGroup(page, required)).selected, ['One']);

    const vertical = '#vertical-toggle';
    await page.evaluate(() => window.__toggleSetVertical('long'));
    await waitForSelected(page, vertical, 'Longer selection');
    await waitForAlignment(page, vertical);
    const verticalState = await readGroup(page, vertical);
    assertRectsClose(verticalState.indicator, verticalState.selectedRects[0], 'vertical fill should settle on target');
    assert.ok(verticalState.selectedRects[0].top > verticalState.buttons[0].top);

    const rtl = '#rtl-toggle';
    await page.evaluate(() => window.__toggleSetPrimary('long'));
    await waitForSelected(page, rtl, 'Longer selection');
    await waitForAlignment(page, rtl);
    const rtlState = await readGroup(page, rtl);
    assertRectsClose(rtlState.indicator, rtlState.selectedRects[0], 'RTL fill should settle on target');

    await page.evaluate(() => window.__toggleSetPrimary('one'));
    await waitForSelected(page, primary, 'One');
    const beforeResize = await readGroup(page, primary);
    await page.locator(`${primary} > .muxui-toggle-button`).nth(1).evaluate((button) => { button.style.paddingInline = '80px'; });
    await page.waitForFunction(() => {
      const button = document.querySelectorAll('#primary-toggle > .muxui-toggle-button')[1];
      return button && button.getBoundingClientRect().width > 150;
    });
    await page.evaluate(() => window.__toggleSetPrimary('long'));
    await waitForSelected(page, primary, 'Longer selection');
    await waitForAlignment(page, primary);
    const resized = await readGroup(page, primary);
    assert.ok(resized.selectedRects[0].width > beforeResize.selectedRects[0].width);
    assertRectsClose(resized.indicator, resized.selectedRects[0], 'resize should remap the fill to measured target');

    await page.evaluate(() => window.__toggleSetPrimary('one'));
    await waitForSelected(page, primary, 'One');
    const focusedButton = page.locator(`${primary} > .muxui-toggle-button`).nth(2);
    await focusedButton.focus();
    assert.equal(await focusedButton.evaluate((button) => document.activeElement === button), true);
    await page.keyboard.press('Space');
    await waitForSelected(page, primary, 'Two');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('#primary-toggle[data-muxui-toggle-motion-reduced]'));
    await page.evaluate(() => window.__toggleSetPrimary('one'));
    await waitForSelected(page, primary, 'One');
    await waitForAlignment(page, primary);
    const systemReduced = await readGroup(page, primary);
    assert.equal(systemReduced.reduced, true);
    assert.equal(systemReduced.trailing, false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => !document.querySelector('#primary-toggle[data-muxui-toggle-motion-reduced]'));

    const disabled = '#disabled-toggle';
    const disabledInitial = await readGroup(page, disabled);
    assert.equal(disabledInitial.motion, null);
    await page.locator(`${disabled} > .muxui-toggle-button`).nth(1).click({ force: true });
    await page.waitForTimeout(20);
    assert.deepEqual((await readGroup(page, disabled)).selected, ['One']);

    const disabledChild = await readGroup(page, '#disabled-child-toggle');
    assert.equal(disabledChild.motion, 'single');
    assert.equal(disabledChild.ready, false);
    assert.equal(disabledChild.indicatorOpacity, '0');
    assert.notEqual(disabledChild.selectedBackground, 'rgba(0, 0, 0, 0)');
    assert.ok(Number.parseFloat(disabledChild.selectedOpacity) < 1);
  } finally {
    await browser?.close();
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
