import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { InteractionMotionFixture } from '../fixtures/interaction-motion-fixture.mjs';

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
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(InteractionMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/base.css"><link rel="stylesheet" href="/src/styles/components.css"><link rel="stylesheet" href="/src/styles/overlays.css"><link rel="stylesheet" href="/src/styles/fields.css"><link rel="stylesheet" href="/src/styles/collections.css"><link rel="stylesheet" href="/src/supplemental/styles.css"></head><body style="margin: 32px; display: flex; flex-direction: column; gap: 24px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);">${body}<script type="module" src="/test/fixtures/interaction-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: {
      entries: ['src/components.mjs', 'src/overlays.mjs', 'src/supplemental/index.mjs'],
      include: ['react', 'react-dom/client', 'react-aria-components'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(packageRoot, '../..')] } },
    plugins: [{
      name: 'interaction-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/interaction-motion.html') {
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

async function readMetrics(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      top: rect.top,
      left: rect.left,
      opacity: Number(style.opacity),
      translate: style.translate,
      transform: style.transform,
      modalY: Number.parseFloat(style.getPropertyValue('--muxui-modal-y')) || 0,
      modalScale: Number.parseFloat(style.getPropertyValue('--muxui-modal-scale')) || 1,
      styleHeight: node.style.height,
      styleOverflow: node.style.overflow,
      hidden: node.hasAttribute('hidden'),
      ariaHidden: node.getAttribute('aria-hidden'),
      inert: node.hasAttribute('inert') || node.inert === true,
      reduced: node.hasAttribute('data-muxui-motion-reduced'),
      entering: node.hasAttribute('data-entering'),
      exiting: node.hasAttribute('data-exiting') || node.hasAttribute('data-muxui-toast-exiting'),
    };
  });
}

async function readDisclosureLayout(page, selector) {
  return page.locator(selector).evaluate((panel) => {
    const host = panel.parentElement;
    const content = panel.firstElementChild;
    if (!host || !content) throw new Error('Disclosure motion wrapper is incomplete.');
    const hostStyle = getComputedStyle(host);
    const contentStyle = getComputedStyle(content);
    const number = (value) => Number.parseFloat(value) || 0;
    return {
      panelHeight: panel.getBoundingClientRect().height,
      hostHeight: host.getBoundingClientRect().height,
      contentHeight: content.getBoundingClientRect().height,
      hostPaddingTop: number(hostStyle.paddingTop),
      hostPaddingBottom: number(hostStyle.paddingBottom),
      contentPaddingTop: number(contentStyle.paddingTop),
      contentPaddingBottom: number(contentStyle.paddingBottom),
      contentPaddingLeft: number(contentStyle.paddingLeft),
      contentPaddingRight: number(contentStyle.paddingRight),
      styleHeight: panel.style.height,
    };
  });
}

async function waitForDisclosureIntermediate(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    const full = node?.firstElementChild?.scrollHeight ?? 0;
    const height = node?.getBoundingClientRect().height ?? 0;
    return full > 0 && height > 0.5 && height < full - 0.5;
  }, selector, { timeout: 1800 });
}

async function waitForDisclosureOpen(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    const host = node?.parentElement;
    return Boolean(node)
      && !node.hasAttribute('aria-hidden')
      && !node.hasAttribute('inert')
      && !node.style.height
      && !node.style.overflow
      && !host?.hasAttribute('hidden');
  }, selector, { timeout: 5000 });
}

async function waitForDisclosureClosed(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    const host = node?.parentElement;
    return Boolean(node)
      && (node.getBoundingClientRect().height ?? 1) <= 0.5
      && node.getAttribute('aria-hidden') === 'true'
      && node.hasAttribute('inert')
      && host?.hasAttribute('hidden');
  }, selector, { timeout: 5000 });
}

async function waitForEntry(page, selector, independentTranslate = false) {
  await page.waitForFunction(([value, usesTranslate]) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity);
    const translate = style.translate;
    const transform = style.transform;
    return opacity < 0.99
      || (translate !== 'none' && translate !== '0px 0px')
      || (!usesTranslate && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)');
  }, [selector, independentTranslate], { timeout: 1800 });
}

async function waitForModalIntermediate(page, selector) {
  const handle = await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity);
    const y = Number.parseFloat(style.getPropertyValue('--muxui-modal-y'));
    const scale = Number.parseFloat(style.getPropertyValue('--muxui-modal-scale'));
    if (!(Number.isFinite(opacity) && opacity > 0 && opacity < 1
      && Number.isFinite(y) && y > -8 && y < 0
      && Number.isFinite(scale) && scale > 0.97 && scale < 1)) return false;
    return { opacity, modalY: y, modalScale: scale };
  }, selector, { timeout: 1800 });
  try {
    return await handle.jsonValue();
  } finally {
    await handle.dispose();
  }
}

async function waitForSettledVisual(page, selector, independentTranslate = false) {
  await page.waitForFunction(([value, usesTranslate]) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) >= 0.999
      && /^(?:none|0px(?: 0px)?)$/u.test(style.translate)
      && (usesTranslate || /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u.test(style.transform));
  }, [selector, independentTranslate], { timeout: 5000 });
}

async function waitForReflow(page, selector) {
  await page.waitForFunction((value) => {
    const node = document.querySelector(value);
    if (!node) return false;
    const style = getComputedStyle(node);
    return style.translate !== 'none' && style.translate !== '0px 0px';
  }, selector, { timeout: 1800 });
}

function disclosurePanel(id) {
  return `[data-motion-id="${id}"] .muxui-disclosure-motion-panel`;
}

function toastSelector(id) {
  return `.muxui-toast.interaction-toast-${id}`;
}

test('primary interaction surfaces expose real motion lifecycles and preserve public semantics', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // The source CSS intentionally keeps the package font URL; this harness has no asset server.
      if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
    });

    await page.goto(`${url}/interaction-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiInteractionMotionHydrated === 'true');
    assert.deepEqual(errors, [], 'SSR hydration has no browser errors');
    assert.equal(await page.locator('.muxui-alert-dialog__popup, .muxui-command-palette__popup').count(), 0, 'modal popups begin closed after hydration');
    assert.equal(await page.locator('.muxui-toast').count(), 0, 'toast queue begins empty after hydration');

    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--muxui-semantic-motion-content-resize-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-reveal-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-exit-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-interaction-duration', '900ms');
    });

    const primaryTrigger = page.locator('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger');
    const primaryPanel = disclosurePanel('primary-disclosure');
    assert.equal((await readMetrics(page, primaryPanel)).ariaHidden, 'true', 'closed disclosure is aria-hidden');
    await primaryTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'true');
    await waitForDisclosureIntermediate(page, primaryPanel);
    const opening = await readMetrics(page, primaryPanel);
    const openingFullHeight = await page.locator(primaryPanel).evaluate((node) => node.firstElementChild.scrollHeight);
    assert.ok(opening.height > 0 && opening.height < openingFullHeight, 'disclosure expand has an in-flight measured height');
    await waitForDisclosureOpen(page, primaryPanel);
    const naturalHeight = await page.locator(primaryPanel).evaluate((node) => node.getBoundingClientRect().height);
    assert.ok(naturalHeight > 0, 'open disclosure has natural height');
    assert.equal((await readMetrics(page, primaryPanel)).styleHeight, '', 'open disclosure releases inline height');

    await primaryTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'false');
    await waitForDisclosureIntermediate(page, primaryPanel);
    const closing = await readMetrics(page, primaryPanel);
    assert.ok(closing.height > 0 && closing.height < naturalHeight, 'disclosure collapse has an in-flight measured height');
    await waitForDisclosureClosed(page, primaryPanel);

    await primaryTrigger.click();
    await page.waitForTimeout(80);
    await primaryTrigger.click();
    await page.waitForTimeout(80);
    await primaryTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'true');
    await waitForDisclosureIntermediate(page, primaryPanel);
    await waitForDisclosureOpen(page, primaryPanel);
    assert.ok((await page.locator(primaryPanel).evaluate((node) => node.getBoundingClientRect().height)) > 0, 'rapid disclosure toggle settles open');

    const firstGroupTrigger = page.locator('[data-motion-id="group-first"] .muxui-disclosure-trigger');
    const secondGroupTrigger = page.locator('[data-motion-id="group-second"] .muxui-disclosure-trigger');
    await firstGroupTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="group-first"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'true');
    await secondGroupTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="group-second"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'true'
      && document.querySelector('[data-motion-id="group-first"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'false');

    await page.waitForFunction(() => typeof window.__interactionToastAdd === 'function');
    await page.evaluate(() => {
      window.__interactionToastAdd('toast-a', 5000);
      window.__interactionToastAdd('toast-b', 5000);
    });
    await page.locator(toastSelector('toast-a')).waitFor();
    await page.locator(toastSelector('toast-b')).waitFor();
    await waitForEntry(page, toastSelector('toast-a'));
    await waitForSettledVisual(page, toastSelector('toast-a'));
    await waitForSettledVisual(page, toastSelector('toast-b'));
    const toastBBefore = await readMetrics(page, toastSelector('toast-b'));

    await page.evaluate(() => {
      window.__interactionToastAdd('toast-c', 5000);
    });
    await page.locator(toastSelector('toast-c')).waitFor();
    await page.locator(toastSelector('toast-c')).waitFor({ state: 'attached' });
    assert.equal(await page.locator(toastSelector('toast-a')).count(), 0, 'the oldest toast is queued outside the visible region');
    await page.evaluate(() => window.__interactionToastRemove('toast-a'));
    await page.waitForFunction(() => window.__interactionToastDismisses?.['toast-a'] === 1, undefined, { timeout: 5000 });
    assert.equal(await page.locator(toastSelector('toast-a')).count(), 0, 'queued toast can be removed without becoming visible');

    await page.evaluate(() => window.__interactionToastRemove('toast-c'));
    await page.waitForFunction(() => {
      const node = [...document.querySelectorAll('.muxui-toast')].find((item) => item.textContent.includes('toast-c'));
      if (!node) return false;
      const style = getComputedStyle(node);
      return node.hasAttribute('data-muxui-toast-exiting') && Number(style.opacity) > 0 && Number(style.opacity) < 1;
    }, undefined, { timeout: 1800 });
    await page.locator(toastSelector('toast-c')).waitFor({ state: 'detached', timeout: 5000 });
    await waitForReflow(page, toastSelector('toast-b'));
    const toastBAfter = await readMetrics(page, toastSelector('toast-b'));
    assert.notEqual(Math.round(toastBAfter.top), Math.round(toastBBefore.top), 'remaining toast reflows after the exiting toast leaves');
    await waitForSettledVisual(page, toastSelector('toast-b'));
    await page.waitForFunction(() => window.__interactionToastDismisses?.['toast-c'] === 1, undefined, { timeout: 5000 });

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '200ms'));
    await page.evaluate(() => window.__interactionToastAdd('toast-pause', 650));
    const pauseToast = page.locator(toastSelector('toast-pause'));
    await pauseToast.waitFor();
    await pauseToast.hover();
    await page.waitForTimeout(900);
    assert.equal(await pauseToast.count(), 1, 'hover pauses the toast timer');
    assert.equal(await page.evaluate(() => window.__interactionToastDismisses?.['toast-pause'] ?? 0), 0, 'paused toast is not dismissed while hovered');
    await page.mouse.move(20, 900);
    await pauseToast.waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => window.__interactionToastDismisses?.['toast-pause'] === 1, undefined, { timeout: 5000 });

    const tagRoot = '[data-motion-id="tag-select"]';
    const tagPopup = '.muxui-tag-select__popup';
    const tagInput = `${tagRoot} .muxui-tag-select__input`;
    const tagBeta = `${tagRoot} .muxui-tag-select__tag:has(button[aria-label="Remove Beta"])`;
    const tagAlphaUpdated = `${tagRoot} .muxui-tag-select__tag:has(button[aria-label="Remove Alpha updated"])`;
    const tagBetaBefore = await readMetrics(page, tagBeta);
    await page.evaluate(() => window.__interactionUpdateTagLabel());
    await page.locator(tagAlphaUpdated).waitFor();
    assert.equal(await page.locator(`${tagRoot} .muxui-tag-select__tag`).count(), 2, 'same-ID tag label update preserves the selected chip');
    await waitForSettledVisual(page, tagAlphaUpdated);
    await page.locator(`${tagAlphaUpdated} .muxui-tag-select__tag-remove`).click();
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-motion-id="tag-select"]');
      const node = [...root.querySelectorAll('.muxui-tag-select__tag')].find((item) => item.textContent.includes('Alpha updated'));
      if (!node) return false;
      const opacity = Number(getComputedStyle(node).opacity);
      return root.querySelectorAll('.muxui-tag-select__tag').length >= 2
        && node.getAttribute('aria-hidden') === 'true'
        && opacity > 0 && opacity < 1;
    }, undefined, { timeout: 1800 });
    await page.locator(tagAlphaUpdated).waitFor({ state: 'detached', timeout: 5000 });
    await waitForReflow(page, tagBeta);
    const tagBetaAfter = await readMetrics(page, tagBeta);
    assert.notEqual(Math.round(tagBetaAfter.left), Math.round(tagBetaBefore.left), 'remaining tag chip reflows after removal');
    await waitForSettledVisual(page, tagBeta);

    await page.evaluate(() => window.__interactionResetTags());
    await page.locator(`${tagRoot} .muxui-tag-select__tag`).nth(1).waitFor();
    await page.locator(tagInput).focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Beta');
    await page.keyboard.press('Space');
    await page.locator(`${tagRoot} .muxui-tag-select__tag:has(.muxui-tag-select__tag-text:text-is("Beta"))`).waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Alpha updated');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator(tagInput).evaluate((node) => document.activeElement === node), true, 'tag keyboard navigation returns to the input');

    await page.keyboard.press('Escape');
    await page.locator(tagPopup).waitFor({ state: 'detached' });
    await primaryTrigger.focus();
    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '900ms'));
    await page.locator(tagInput).focus();
    await page.locator(tagPopup).waitFor();
    await waitForEntry(page, tagPopup);
    await waitForSettledVisual(page, tagPopup);
    await page.keyboard.press('Escape');
    await page.locator(tagPopup).waitFor({ state: 'detached' });

    const multiTrigger = page.locator('[data-motion-id="multi-select"] .muxui-multi-select__trigger');
    const multiPopup = '.muxui-multi-select__popup';
    await multiTrigger.click();
    await page.locator(multiPopup).waitFor();
    await waitForEntry(page, multiPopup);
    await waitForSettledVisual(page, multiPopup);
    await page.keyboard.press('Escape');
    await page.locator(multiPopup).waitFor({ state: 'detached' });

    await page.evaluate(() => document.documentElement.style.removeProperty('--muxui-semantic-motion-exit-duration'));
    const alertTrigger = page.locator('#interaction-alert-trigger');
    const alertPopup = '.muxui-alert-dialog__popup';
    const alertBackdrop = '.muxui-alert-dialog__backdrop';
    await alertTrigger.click();
    await page.locator(alertPopup).waitFor();
    assert.equal(await page.locator(alertPopup).evaluate((node) => !node.closest('#root')), true, 'alert dialog popup is retained in a portal');
    await waitForEntry(page, alertPopup, true);
    const alertOpening = await waitForModalIntermediate(page, alertPopup);
    assert.ok(alertOpening.modalY < 0 && alertOpening.modalY > -8, `alert entry uses the accepted y amplitude: ${JSON.stringify(alertOpening)}`);
    assert.ok(alertOpening.modalScale > 0.97 && alertOpening.modalScale < 1, `alert entry uses the accepted scale amplitude: ${JSON.stringify(alertOpening)}`);
    assert.equal(await page.locator(alertPopup).evaluate((node) => node.contains(document.activeElement)), true, 'alert dialog traps focus inside the portal');
    await waitForSettledVisual(page, alertPopup, true);
    const alertSettled = await readMetrics(page, alertPopup);
    assert.ok(Math.abs(alertSettled.modalY) < 0.01 && Math.abs(alertSettled.modalScale - 1) < 0.0001, 'alert entry settles at the modal target');
    await page.locator('.muxui-alert-dialog__close').click();
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return node?.hasAttribute('data-exiting') && getComputedStyle(node).transitionDuration === '0.12s';
    }, alertBackdrop, { timeout: 1800 });
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return node && Number(getComputedStyle(node).opacity) > 0 && Number(getComputedStyle(node).opacity) < 1;
    }, alertPopup, { timeout: 1800 });
    await page.locator(alertPopup).waitFor({ state: 'detached', timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'interaction-alert-trigger', 'alert close restores focus to the trigger');

    await alertTrigger.click();
    await page.locator(alertPopup).waitFor();
    await waitForEntry(page, alertPopup, true);
    await page.waitForFunction((selector) => document.querySelector(selector)?.hasAttribute('data-muxui-motion-reduced') !== true, alertPopup);
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction((selectors) => {
      const [popupSelector, backdropSelector] = selectors;
      const popup = document.querySelector(popupSelector);
      const backdrop = document.querySelector(backdropSelector);
      if (!popup || !backdrop) return false;
      const popupStyle = getComputedStyle(popup);
      const backdropStyle = getComputedStyle(backdrop);
      return popup.hasAttribute('data-muxui-motion-reduced')
        && Number(popupStyle.opacity) >= 0.999
        && Math.abs(Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-y')) || 0) < 0.01
        && Math.abs((Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-scale')) || 1) - 1) < 0.0001
        && Number(backdropStyle.opacity) >= 0.999
        && !backdrop.hasAttribute('data-entering')
        && !backdrop.hasAttribute('data-exiting');
    }, [alertPopup, alertBackdrop], { timeout: 500 });
    await page.locator('.muxui-alert-dialog__close').click();
    await page.locator(alertPopup).waitFor({ state: 'detached', timeout: 1500 });
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const commandTrigger = page.locator('#interaction-command-trigger');
    const commandPopup = '.muxui-command-palette__popup';
    const commandBackdrop = '.muxui-command-palette__backdrop';
    await commandTrigger.click();
    await page.locator(commandPopup).waitFor();
    assert.equal(await page.locator(commandPopup).evaluate((node) => !node.closest('#root')), true, 'command palette popup is retained in a portal');
    await waitForEntry(page, commandPopup, true);
    const commandOpening = await waitForModalIntermediate(page, commandPopup);
    assert.ok(commandOpening.modalY < 0 && commandOpening.modalY > -8, `command palette entry uses the accepted y amplitude: ${JSON.stringify(commandOpening)}`);
    assert.ok(commandOpening.modalScale > 0.97 && commandOpening.modalScale < 1, `command palette entry uses the accepted scale amplitude: ${JSON.stringify(commandOpening)}`);
    assert.equal(await page.locator(commandPopup).evaluate((node) => node.contains(document.activeElement)), true, 'command palette focuses its portalled input');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction((selectors) => {
      const [popupSelector, backdropSelector] = selectors;
      const popup = document.querySelector(popupSelector);
      const backdrop = document.querySelector(backdropSelector);
      if (!popup || !backdrop) return false;
      const popupStyle = getComputedStyle(popup);
      const backdropStyle = getComputedStyle(backdrop);
      return popup.hasAttribute('data-muxui-motion-reduced')
        && Number(popupStyle.opacity) >= 0.999
        && Math.abs(Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-y')) || 0) < 0.01
        && Math.abs((Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-scale')) || 1) - 1) < 0.0001
        && Number(backdropStyle.opacity) >= 0.999
        && !backdrop.hasAttribute('data-entering')
        && !backdrop.hasAttribute('data-exiting');
    }, [commandPopup, commandBackdrop], { timeout: 500 });
    await page.keyboard.press('Escape');
    await page.locator(commandPopup).waitFor({ state: 'detached', timeout: 1500 });
    await page.waitForFunction(() => document.activeElement?.id === 'interaction-command-trigger', undefined, { timeout: 1500 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'interaction-command-trigger', 'command palette close restores focus to its trigger');

    await page.evaluate(() => window.__interactionUnmount());
    await page.locator('#interaction-unmounted').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.muxui-disclosure-motion-panel, .muxui-toast, .muxui-alert-dialog__popup, .muxui-command-palette__popup').count(), 0, 'unmount releases interaction surfaces');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('Toast origin reduction and late disclosure growth settle without flashes', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.setDefaultTimeout(8000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
    });

    await page.goto(`${url}/interaction-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiInteractionMotionHydrated === 'true');
    await page.waitForFunction(() => typeof window.__interactionToastAdd === 'function');
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--muxui-semantic-motion-content-resize-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-reveal-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-exit-duration', '900ms');
      root.style.setProperty('--muxui-semantic-motion-interaction-duration', '900ms');
      document.getElementById('root').setAttribute('data-muxui-motion', 'reduced');
      window.__interactionToastAdd('toast-mount-reduced', 5000);
    });

    const mountToastSelector = toastSelector('toast-mount-reduced');
    const mountToast = page.locator(mountToastSelector);
    await mountToast.waitFor();
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      return node.hasAttribute('data-muxui-motion-reduced')
        && Number(style.opacity) >= 0.999
        && /^(?:none|0px(?: 0px)?)$/u.test(style.translate)
        && /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u.test(style.transform);
    }, mountToastSelector, { timeout: 1000 });
    const mountCloseStarted = Date.now();
    await page.evaluate(() => window.__interactionToastRemove('toast-mount-reduced'));
    await mountToast.waitFor({ state: 'detached', timeout: 1000 });
    assert.ok(Date.now() - mountCloseStarted < 500, 'reduced Toast mounted under #root closes immediately');
    await page.waitForFunction(() => window.__interactionToastDismisses?.['toast-mount-reduced'] === 1, undefined, { timeout: 1000 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__interactionToastDismisses?.['toast-mount-reduced'] ?? 0), 1, 'reduced Toast mount dismisses once');
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));

    await page.evaluate(() => window.__interactionToastAdd('toast-runtime-reduced', 5000));
    const runtimeToastSelector = toastSelector('toast-runtime-reduced');
    const runtimeToast = page.locator(runtimeToastSelector);
    await runtimeToast.waitFor();
    await waitForEntry(page, runtimeToastSelector);
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      return node.hasAttribute('data-muxui-motion-reduced')
        && Number(style.opacity) >= 0.999
        && /^(?:none|0px(?: 0px)?)$/u.test(style.translate)
        && /^(?:none|matrix\(1, 0, 0, 1, 0, 0\))$/u.test(style.transform);
    }, runtimeToastSelector, { timeout: 1000 });
    const runtimeCloseStarted = Date.now();
    await page.evaluate(() => window.__interactionToastRemove('toast-runtime-reduced'));
    await runtimeToast.waitFor({ state: 'detached', timeout: 1000 });
    assert.ok(Date.now() - runtimeCloseStarted < 500, 'runtime reduced Toast closes immediately');
    await page.waitForFunction(() => window.__interactionToastDismisses?.['toast-runtime-reduced'] === 1, undefined, { timeout: 1000 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__interactionToastDismisses?.['toast-runtime-reduced'] ?? 0), 1, 'runtime reduced Toast dismisses once');
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));

    const primaryTrigger = page.locator('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger');
    const primaryPanel = disclosurePanel('primary-disclosure');
    await primaryTrigger.click();
    await page.waitForFunction(() => document.querySelector('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger')?.getAttribute('aria-expanded') === 'true');
    await waitForDisclosureIntermediate(page, primaryPanel);
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      const full = node?.firstElementChild?.scrollHeight ?? 0;
      const height = node?.getBoundingClientRect().height ?? 0;
      return Boolean(node?.style.height) && full > 0 && height > full * 0.85 && height < full - 0.5;
    }, primaryPanel, { timeout: 1500 });
    const beforeGrowth = await readMetrics(page, primaryPanel);
    const beforeGrowthFull = await page.locator(primaryPanel).evaluate((node) => node.firstElementChild.scrollHeight);
    assert.ok(beforeGrowth.height > 0 && beforeGrowth.height < beforeGrowthFull, 'late growth starts during the open spring');
    await page.evaluate(() => window.__interactionGrowDisclosure());
    await page.waitForFunction((selector) => document.querySelector(selector)?.textContent.includes('Late content arrives') === true, primaryPanel, { timeout: 1000 });
    const growthSamples = await page.evaluate((selector) => new Promise((resolve) => {
      const node = document.querySelector(selector);
      const samples = [];
      const started = performance.now();
      const sample = () => {
        samples.push(node?.getBoundingClientRect().height ?? 0);
        if (performance.now() - started < 350) requestAnimationFrame(sample);
        else resolve(samples);
      };
      requestAnimationFrame(sample);
    }), primaryPanel);
    assert.ok(growthSamples.length > 2 && Math.min(...growthSamples) > 0.5, `late disclosure growth never flashes to zero: ${JSON.stringify(growthSamples)}`);
    await waitForDisclosureOpen(page, primaryPanel);
    const grown = await readMetrics(page, primaryPanel);
    const grownNaturalHeight = await page.locator(primaryPanel).evaluate((node) => node.firstElementChild.scrollHeight);
    assert.ok(grown.height >= grownNaturalHeight - 1, 'late disclosure growth settles at natural height');
    assert.equal(grown.styleHeight, '', 'late disclosure growth releases inline height');
    assert.equal(grown.styleOverflow, '', 'late disclosure growth releases clipping');
    assert.equal(grown.ariaHidden, null, 'grown disclosure remains visible to accessibility APIs');
    assert.equal(grown.inert, false, 'grown disclosure remains interactive');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('Disclosure soft reveal preserves initial paint, focus, resizing and reduced semantics', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 960, height: 900 } });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}/interaction-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__interactionSetDisclosure === 'function');

    const controlledPanel = disclosurePanel('controlled-disclosure');
    const controlledTrigger = page.locator('[data-motion-id="controlled-disclosure"] .muxui-disclosure-trigger');
    const contentSelector = `${controlledPanel} > .muxui-disclosure-motion-content`;
    const initial = await readMetrics(page, contentSelector);
    assert.equal(initial.opacity, 1, 'initial expanded content is fully readable after hydration');
    assert.equal(initial.transform, 'none', 'initial expanded content has no entrance transform');
    assert.equal((await readMetrics(page, controlledPanel)).styleHeight, '', 'initial expanded height stays intrinsic');

    await page.locator('#disclosure-content-action').focus();
    await page.evaluate(() => window.__interactionSetDisclosure(false));
    await waitForDisclosureIntermediate(page, controlledPanel);
    assert.equal(await controlledTrigger.getAttribute('aria-expanded'), 'false');
    assert.equal(await controlledTrigger.evaluate((node) => node === document.activeElement), true, 'controlled collapse returns focus before content is hidden');
    const closing = await readMetrics(page, controlledPanel);
    assert.equal(closing.inert, true, 'collapsing content immediately leaves keyboard navigation');
    assert.equal(closing.ariaHidden, 'true', 'collapsing content immediately leaves the accessibility tree');
    const standaloneGeometry = await page.locator(controlledPanel).evaluate((node) => ({
      panel: node.getBoundingClientRect().height,
      host: node.parentElement.getBoundingClientRect().height,
    }));
    assert.ok(Math.abs(standaloneGeometry.host - standaloneGeometry.panel) < 1, `standalone gap collapses inside the measured panel: ${JSON.stringify(standaloneGeometry)}`);
    await waitForDisclosureClosed(page, controlledPanel);

    await controlledTrigger.press('Enter');
    await page.waitForFunction((selector) => {
      const content = document.querySelector(selector);
      const style = getComputedStyle(content);
      return Number(style.opacity) > 0.82 && Number(style.opacity) < 1 && style.transform !== 'none';
    }, contentSelector);
    await waitForDisclosureOpen(page, controlledPanel);
    await waitForSettledVisual(page, contentSelector);
    await controlledTrigger.press('Space');
    await waitForDisclosureClosed(page, controlledPanel);

    const primaryPanel = disclosurePanel('primary-disclosure');
    await page.locator('[data-motion-id="primary-disclosure"] .muxui-disclosure-trigger').click();
    await waitForDisclosureOpen(page, primaryPanel);
    const beforeResize = (await readMetrics(page, primaryPanel)).height;
    await page.evaluate(() => window.__interactionGrowDisclosure());
    await waitForDisclosureIntermediate(page, primaryPanel);
    assert.ok((await readMetrics(page, primaryPanel)).height >= beforeResize - 1, 'settled content growth starts from its previous natural height');
    await waitForDisclosureOpen(page, primaryPanel);
    assert.ok((await readMetrics(page, primaryPanel)).height > beforeResize);
    await page.setViewportSize({ width: 390, height: 900 });
    await waitForDisclosureOpen(page, primaryPanel);
    const afterWidthChange = await readMetrics(page, primaryPanel);
    assert.equal(afterWidthChange.styleOverflow, '', 'narrow content is unclipped after resizing');
    assert.ok(afterWidthChange.height > beforeResize, 'copy reflows at narrow widths');

    await page.evaluate(() => {
      document.documentElement.dataset.muxuiColorScheme = 'dark';
      window.__interactionSetMultiple(true);
    });
    const first = page.locator('[data-motion-id="group-first"] .muxui-disclosure-trigger');
    const second = page.locator('[data-motion-id="group-second"] .muxui-disclosure-trigger');
    await first.click();
    await second.click();
    assert.equal(await first.getAttribute('aria-expanded'), 'true');
    assert.equal(await second.getAttribute('aria-expanded'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Disabled disclosure', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Disabled grouped disclosure', exact: true }).isDisabled(), true);

    const firstPanel = disclosurePanel('group-first');
    const firstContent = `${firstPanel} > .muxui-disclosure-panel`;
    await page.addStyleTag({ content: '[data-motion-id="group-first"] .muxui-disclosure-panel { padding: 14px; }' });
    await waitForDisclosureOpen(page, firstPanel);
    const allSidePadding = await readDisclosureLayout(page, firstPanel);
    assert.equal(allSidePadding.hostPaddingTop, 0, 'the RAC region host owns no top padding');
    assert.equal(allSidePadding.hostPaddingBottom, 0, 'the RAC region host owns no bottom padding');
    assert.equal(allSidePadding.contentPaddingTop, 14, 'all-side user padding stays on measured content');
    assert.equal(allSidePadding.contentPaddingBottom, 14, 'all-side user padding stays on measured content');
    assert.ok(Math.abs(allSidePadding.panelHeight - allSidePadding.contentHeight) < 1, 'expanded panel height includes content padding');

    await page.locator(firstContent).evaluate((node) => { node.style.padding = '9px 14px 23px'; });
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return Boolean(node?.style.height) && Number.parseFloat(node.style.height) > 0;
    }, firstPanel);
    await waitForDisclosureOpen(page, firstPanel);
    const asymmetricPadding = await readDisclosureLayout(page, firstPanel);
    assert.equal(asymmetricPadding.contentPaddingTop, 9, 'asymmetric top padding is retained');
    assert.equal(asymmetricPadding.contentPaddingBottom, 23, 'asymmetric bottom padding is retained');
    assert.ok(Math.abs(asymmetricPadding.panelHeight - asymmetricPadding.contentHeight) < 1, 'open retarget settles at the padded content height');

    await first.click();
    await waitForDisclosureIntermediate(page, firstPanel);
    const closingLayout = await readDisclosureLayout(page, firstPanel);
    assert.ok(Math.abs(closingLayout.hostHeight - closingLayout.panelHeight) < 1, 'group spacing collapses with the panel instead of snapping away at the end');
    await waitForDisclosureClosed(page, firstPanel);
    const closedLayout = await readDisclosureLayout(page, firstPanel);
    assert.ok(closedLayout.hostHeight <= 0.5, `closed group host has no residual padding: ${JSON.stringify(closedLayout)}`);
    assert.equal(closedLayout.hostPaddingTop, 0, 'closed group host has no top padding');
    assert.equal(closedLayout.hostPaddingBottom, 0, 'closed group host has no bottom padding');

    await page.locator(firstContent).evaluate((node) => { node.style.padding = '0.5em 1em 1.25em'; });
    await first.click();
    await waitForDisclosureIntermediate(page, firstPanel);
    const openingBeforePaddingChange = await readDisclosureLayout(page, firstPanel);
    assert.ok(openingBeforePaddingChange.panelHeight > 0.5, 'relative padding opening starts above zero');
    await page.locator(firstContent).evaluate((node) => { node.style.padding = '0.75em 1em 1.5em'; });
    await page.waitForFunction((selector) => {
      const node = document.querySelector(selector);
      return Boolean(node?.style.height) && Number.parseFloat(node.style.height) > 0;
    }, firstPanel);
    const openingAfterPaddingChange = await readDisclosureLayout(page, firstPanel);
    assert.ok(openingAfterPaddingChange.panelHeight >= openingBeforePaddingChange.panelHeight - 2, 'opening padding retarget does not restart from zero');
    await waitForDisclosureOpen(page, firstPanel);
    const relativePadding = await readDisclosureLayout(page, firstPanel);
    assert.ok(relativePadding.contentPaddingBottom > relativePadding.contentPaddingTop, 'font-relative padding keeps its unequal block sizes');

    await first.click();
    await waitForDisclosureIntermediate(page, firstPanel);
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await waitForDisclosureClosed(page, firstPanel);
    await first.click();
    await waitForDisclosureOpen(page, firstPanel);
    const reducedContent = await readMetrics(page, `${firstPanel} > .muxui-disclosure-motion-content`);
    assert.equal(reducedContent.opacity, 1);
    assert.equal(reducedContent.transform, 'none');
    assert.equal(await first.locator('.muxui-disclosure-trigger-icon').evaluate((node) => node.style.transform), 'rotate(180deg)', 'reduced chevron immediately matches expansion');

    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await first.click();
    await waitForDisclosureClosed(page, firstPanel);
    await first.click();
    await waitForDisclosureOpen(page, firstPanel);
    assert.equal((await readMetrics(page, `${firstPanel} > .muxui-disclosure-motion-content`)).transform, 'none');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
