import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { PopoverMotionFixture } from '../fixtures/popover-motion-fixture.mjs';

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
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(PopoverMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/fields.css"><link rel="stylesheet" href="/src/styles/collections.css"></head><body style="margin: 32px; display: flex; gap: 24px; flex-direction: column; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);">${body}<script type="module" src="/test/fixtures/popover-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/fields.mjs', 'src/collections.mjs'], include: ['react', 'react-dom/client', 'react-aria-components'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{
      name: 'popover-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/popover-motion.html') {
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

async function readMotion(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      opacity: Number(style.opacity),
      translate: style.translate,
      transform: style.transform,
      exiting: node.hasAttribute('data-exiting'),
      reduced: node.hasAttribute('data-muxui-motion-reduced'),
    };
  });
}

async function waitForEntry(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) < 0.99 || (style.translate !== 'none' && style.translate !== '0px 0px');
  }, selector, { timeout: 1000 });
}

async function waitForSettled(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) >= 0.9999 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate);
  }, selector, { timeout: 3000 });
}

async function waitForMenuOverlay(page, label, { aligned = false, identity = false, timeout = 3000 } = {}) {
  await page.waitForFunction(({ expectedLabel, shouldAlign, shouldBeIdentity }) => {
    const item = document.activeElement;
    const overlay = item?.closest('.muxui-menu')?.querySelector(':scope > [data-muxui-menu-focus]');
    if (item?.textContent?.trim() !== expectedLabel || !item.hasAttribute('data-focused') || !overlay || overlay.hidden) return false;
    const transform = getComputedStyle(overlay).transform;
    if (shouldBeIdentity && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') return false;
    if (!shouldAlign) return true;
    const itemRect = item.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return Math.abs(itemRect.left - overlayRect.left) < 0.75
      && Math.abs(itemRect.top - overlayRect.top) < 0.75
      && Math.abs(itemRect.width - overlayRect.width) < 0.75
      && Math.abs(itemRect.height - overlayRect.height) < 0.75;
  }, { expectedLabel: label, shouldAlign: aligned, shouldBeIdentity: identity }, { timeout });
}

async function waitForMenuTravel(page, label) {
  await page.waitForFunction((expectedLabel) => {
    const item = document.activeElement;
    const overlay = item?.closest('.muxui-menu')?.querySelector(':scope > [data-muxui-menu-focus]');
    const transform = overlay && getComputedStyle(overlay).transform;
    return item?.textContent?.trim() === expectedLabel && item.hasAttribute('data-focused')
      && overlay && !overlay.hidden && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
  }, label, { timeout: 1500 });
}

test('field and collection popovers use the shared placement-aware Motion lifecycle', { timeout: 90_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/popover-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiPopoverMotionHydrated === 'true');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('.muxui-menu-popup, .muxui-select-popover, .muxui-combo-box-popover, .muxui-autocomplete-popover').count(), 0, 'SSR and hydration begin popovers closed');
    assert.match(await page.locator('html').getAttribute('data-muxui-popover-refs'), /DIV/u);

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '800ms'));
    const cases = [
      { trigger: '#motion-menu-trigger', popup: '.muxui-menu-popup' },
      { trigger: '.muxui-select-trigger', popup: '.muxui-select-popover' },
      { trigger: '.muxui-combo-box-trigger', popup: '.muxui-combo-box-popover' },
    ];
    for (const { trigger, popup } of cases) {
      await page.locator(trigger).click();
      await page.locator(popup).waitFor();
      await waitForEntry(page, popup);
      const entry = await readMotion(page, popup);
      assert.ok(entry.opacity < 1 || entry.translate !== 'none', `${popup} has a finite entry transition`);
      await waitForSettled(page, popup);
      assert.ok((await readMotion(page, popup)).opacity >= 0.9999, `${popup} settles visible`);
      await page.keyboard.press('Escape');
      await page.locator(popup).waitFor({ state: 'detached' });
    }

    const autocompleteInput = page.locator('.muxui-autocomplete .muxui-field-input');
    await autocompleteInput.focus();
    const autocompletePopup = '.muxui-autocomplete-popover';
    await page.locator(autocompletePopup).waitFor();
    await waitForEntry(page, autocompletePopup);
    await waitForSettled(page, autocompletePopup);
    await page.keyboard.press('Escape');
    await page.locator(autocompletePopup).waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '1200ms');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
    });
    await page.locator('#motion-menu-trigger').click();
    await page.locator('.muxui-menu-popup').waitFor();
    assert.equal(await page.locator('.muxui-menu-popup').evaluate((node) => !node.closest('#root')), true, 'menu popup remains portalled outside the React root');
    await waitForEntry(page, '.muxui-menu-popup');
    const reducedStarted = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-menu-popup');
      if (!node) return false;
      const style = getComputedStyle(node);
      return node.hasAttribute('data-muxui-motion-reduced') && Number(style.opacity) >= 0.99 && /^(?:none|0px(?: 0px)?)$/u.test(style.translate);
    }, undefined, { timeout: 300 });
    assert.ok(Date.now() - reducedStarted < 300, 'explicit reduced mode settles a popover during entry');
    await page.keyboard.press('Escape');
    await page.locator('.muxui-menu-popup').waitFor({ state: 'detached' });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      const root = document.getElementById('root');
      root.setAttribute('data-muxui-motion', 'reduced');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.documentElement.style.setProperty('--muxui-semantic-motion-state-transition-duration', '800ms');
      document.documentElement.style.setProperty('--muxui-semantic-motion-state-transition-spring-visual-duration', '800ms');
    });

    await page.locator('#motion-menu-trigger').click();
    const menuPopup = page.locator('.muxui-menu-popup').first();
    await menuPopup.waitFor();
    await page.waitForFunction(() => {
      const popups = [...document.querySelectorAll('.muxui-menu-popup')];
      return popups.length === 1 && popups.every((node) => node.hasAttribute('data-muxui-motion-reduced'));
    });
    await page.getByRole('menuitem', { name: 'One', exact: true }).focus();
    await waitForMenuOverlay(page, 'One', { aligned: true, identity: true });
    await page.keyboard.press('ArrowDown');
    await waitForMenuOverlay(page, 'More actions', { aligned: true, identity: true });
    const submenuOpenedAt = Date.now();
    await page.keyboard.press('ArrowRight');
    await waitForMenuOverlay(page, 'Two', { aligned: true, identity: true, timeout: 300 });
    assert.ok(Date.now() - submenuOpenedAt < 300, 'nested Menu overlay inherits trigger-local reduced motion');
    assert.equal(await menuPopup.evaluate((node) => node.hasAttribute('data-muxui-motion-reduced')), true);

    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'full'));
    await page.waitForFunction(() => [...document.querySelectorAll('.muxui-menu-popup')].every((node) => !node.hasAttribute('data-muxui-motion-reduced')));
    await waitForMenuOverlay(page, 'Two', { aligned: true, identity: true });
    await page.keyboard.press('ArrowDown');
    await waitForMenuTravel(page, 'Three');

    const motionReducedAt = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => document.querySelector('.muxui-menu-popup')?.hasAttribute('data-muxui-motion-reduced'));
    await waitForMenuOverlay(page, 'Three', { aligned: true, identity: true, timeout: 300 });
    assert.ok(Date.now() - motionReducedAt < 300, 'trigger-local reduced mode settles the nested Menu overlay during travel');

    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'full'));
    await page.waitForFunction(() => [...document.querySelectorAll('.muxui-menu-popup')].every((node) => !node.hasAttribute('data-muxui-motion-reduced')));
    await page.keyboard.press('ArrowUp');
    await waitForMenuTravel(page, 'Two');

    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-reveal-duration');
      document.documentElement.style.removeProperty('--muxui-semantic-motion-state-transition-duration');
      document.documentElement.style.removeProperty('--muxui-semantic-motion-state-transition-spring-visual-duration');
      window.__muxuiPopoverUnmount();
    });
    await page.locator('#popover-unmounted').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.muxui-menu-popup, .muxui-select-popover, .muxui-combo-box-popover, .muxui-autocomplete-popover').count(), 0, 'unmount removes all popup shells');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
