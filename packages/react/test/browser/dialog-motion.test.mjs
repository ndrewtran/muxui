import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { Dialog } from '../../src/overlays.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
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

function dialogDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' },
    React.createElement('div', { id: 'dialog-scope', 'data-muxui-motion': 'full' },
      React.createElement(Dialog, {
        title: 'Review changes',
        description: 'These changes will be saved.',
        trigger: React.createElement('button', { type: 'button' }, 'Open dialog'),
        open: false,
        onOpenChange: () => {},
      }, React.createElement('p', null, 'Dialog body')),
    ),
  ));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"></head><body style="margin:0;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)">${body}<script type="module" src="/packages/react/test/fixtures/dialog-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'dialog-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/dialog-motion.html') {
            response.setHeader('content-type', 'text/html');
            response.end(dialogDocument());
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
  await page.waitForFunction(() => document.documentElement.dataset.muxuiDialogHydrated === 'true', undefined, { timeout: 5_000 });
}

async function readMotion(page) {
  return page.locator('.muxui-dialog').evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const y = Number.parseFloat(style.getPropertyValue('--muxui-modal-y')) || 0;
    const scale = Number.parseFloat(style.getPropertyValue('--muxui-modal-scale')) || 1;
    return {
      opacity: Number(style.opacity),
      y,
      scale,
      transform: style.transform,
      translate: style.getPropertyValue('--muxui-modal-y'),
      centeredX: rect.left + rect.width / 2,
      centeredY: rect.top + rect.height / 2,
      viewportX: window.innerWidth / 2,
      viewportY: window.innerHeight / 2,
      reduced: node.hasAttribute('data-muxui-dialog-reduced'),
      animations: node.getAnimations().map((animation) => ({
        duration: animation.effect?.getComputedTiming().duration,
        easing: animation.effect?.getComputedTiming().easing,
        playState: animation.playState,
      })),
      keyframes: node.getAnimations().flatMap((animation) => animation.effect?.getKeyframes().map(({ opacity, translate, scale }) => ({ opacity, translate, scale })) ?? []),
    };
  });
}

async function openTriggered(page) {
  await page.locator('.muxui-dialog-trigger').click();
  await page.locator('.muxui-dialog').waitFor();
}

async function closeAndWait(page, timeout = 500) {
  await page.keyboard.press('Escape');
  await page.locator('.muxui-dialog').waitFor({ state: 'detached', timeout });
}

async function settleEntry(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.muxui-dialog');
    if (!panel || panel.getAnimations().some((animation) => animation.playState !== 'finished')) return false;
    const style = getComputedStyle(panel);
    return Math.abs(Number(style.opacity) - 1) < 0.0001
      && Math.abs(Number.parseFloat(style.getPropertyValue('--muxui-modal-y')) || 0) < 0.01
      && Math.abs((Number.parseFloat(style.getPropertyValue('--muxui-modal-scale')) || 1) - 1) < 0.0001;
  });
}

async function waitForPanelEntry(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.muxui-dialog');
    if (!panel) return false;
    const y = Number.parseFloat(getComputedStyle(panel).getPropertyValue('--muxui-modal-y'));
    return Number.isFinite(y) && y < 0;
  });
}

async function waitForPanelExit(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector('.muxui-dialog');
    return panel && Number(getComputedStyle(panel).opacity) < 1;
  });
}

test('Dialog motion owns panel pixels while RAC retains lifecycle, dismissal, focus, and reduced cleanup', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/dialog-motion.html`, { waitUntil: 'networkidle' });
    await waitForHydration(page);
    assert.equal(await page.locator('.muxui-dialog').count(), 0, 'SSR and hydration begin closed');

    await openTriggered(page);
    await waitForPanelEntry(page);
    await page.waitForTimeout(45);
    const entry = await readMotion(page);
    assert.ok(entry.opacity > 0 && entry.opacity < 1, `entry fades in: ${JSON.stringify(entry)}`);
    assert.ok(entry.y < 0 && entry.y > -8, `entry translates toward center: ${JSON.stringify(entry)}`);
    assert.ok(entry.scale > 0.97 && entry.scale < 1, `entry scales toward the settled panel: ${JSON.stringify(entry)}`);
    assert.equal(await page.locator('.muxui-dialog-backdrop').evaluate((node) => getComputedStyle(node).transitionDuration), '0.18s', 'backdrop uses modal entry duration');
    await settleEntry(page);
    const settledEntry = await readMotion(page);
    assert.equal(settledEntry.opacity, 1);
    assert.ok(Math.abs(settledEntry.y) < 1, `entry settles at y=0: ${JSON.stringify(settledEntry)}`);
    assert.ok(Math.abs(settledEntry.scale - 1) < 0.001, `entry settles at scale=1: ${JSON.stringify(settledEntry)}`);
    assert.ok(Math.abs(settledEntry.centeredX - settledEntry.viewportX) < 1, 'settled dialog remains horizontally centered');
    assert.ok(Math.abs(settledEntry.centeredY - settledEntry.viewportY) < 1, 'settled dialog remains vertically centered');
    await page.screenshot({ path: '/tmp/muxui-dialog-motion-full-light.png' });
    assert.equal(await page.locator('.muxui-dialog').evaluate((node) => node.contains(document.activeElement)), true, 'opening moves focus into the dialog');

    await page.keyboard.press('Escape');
    await waitForPanelExit(page);
    await page.waitForTimeout(35);
    const exit = await readMotion(page);
    assert.ok(exit.opacity < 1, `exit fades out: ${JSON.stringify(exit)}`);
    assert.ok(exit.y < 0 && exit.y > -8, `exit translates upward: ${JSON.stringify(exit)}`);
    assert.ok(exit.scale < 1 && exit.scale > 0.97, `exit scales down: ${JSON.stringify(exit)}`);
    const exitBackdrop = await page.locator('.muxui-dialog-backdrop').evaluate((node) => {
      const style = getComputedStyle(node);
      return { duration: style.transitionDuration, easing: style.transitionTimingFunction };
    });
    assert.equal(exitBackdrop.duration, '0.12s', 'backdrop uses modal exit duration');
    assert.equal(exitBackdrop.easing, 'cubic-bezier(0.16, 1, 0.3, 1)', 'backdrop uses modal easing');
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('muxui-dialog-trigger'));
    assert.equal(await page.locator('.muxui-dialog-trigger').evaluate((node) => document.activeElement === node), true, 'Escape restores trigger focus');

    await page.evaluate(() => window.__muxuiDialogSetModeOpen('rejected'));
    await page.locator('.muxui-dialog').waitFor();
    await settleEntry(page);
    await page.locator('.muxui-dialog-close').click();
    await page.waitForTimeout(35);
    assert.equal(await page.locator('.muxui-dialog').count(), 1, 'a rejected controlled close leaves the dialog open');
    assert.equal(await page.locator('.muxui-dialog-backdrop').getAttribute('data-exiting'), null, 'a rejected close does not enter exit state');
    const rejectedMotion = await readMotion(page);
    assert.equal(rejectedMotion.opacity, 1, 'a rejected close leaves panel opacity settled');
    assert.ok(Math.abs(rejectedMotion.y) < 1 && Math.abs(rejectedMotion.scale - 1) < 0.001, 'a rejected close leaves panel geometry settled');
    assert.equal((await page.evaluate(() => window.__muxuiDialogChanges)).at(-1), false, 'the rejected close still reports the dismissal request');
    await page.evaluate(() => window.__muxuiDialogSetMode('trigger'));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-modal-enter-duration', '800ms');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      const scope = document.getElementById('dialog-scope');
      scope.setAttribute('data-muxui-motion', 'full');
    });
    await page.evaluate(() => window.__muxuiDialogSetMode('no-trigger'));
    await page.evaluate(() => window.__muxuiDialogSetOpen(true));
    await page.locator('.muxui-dialog').waitFor();
    await waitForPanelEntry(page);
    await page.waitForTimeout(50);
    await page.locator('#dialog-scope').evaluate((node) => node.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const panel = document.querySelector('.muxui-dialog');
      const backdrop = document.querySelector('.muxui-dialog-backdrop');
      return panel?.hasAttribute('data-muxui-dialog-reduced')
        && backdrop?.hasAttribute('data-muxui-dialog-reduced')
        && getComputedStyle(panel).opacity === '1'
        && Math.abs(Number.parseFloat(getComputedStyle(panel).getPropertyValue('--muxui-modal-y')) || 0) < 0.01
        && Math.abs((Number.parseFloat(getComputedStyle(panel).getPropertyValue('--muxui-modal-scale')) || 1) - 1) < 0.0001;
    }, undefined, { timeout: 250 });
    const nestedReduced = await readMotion(page);
    assert.equal(nestedReduced.reduced, true, 'nested explicit reduction marks the portaled panel');
    assert.ok(Math.abs(nestedReduced.y) < 1, `nested reduction settles the interrupted entry: ${JSON.stringify(nestedReduced)}`);
    const reducedCloseStarted = Date.now();
    await page.evaluate(() => window.__muxuiDialogSetOpen(false));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached', timeout: 150 });
    assert.ok(Date.now() - reducedCloseStarted < 150, 'nested reduced close detaches immediately');

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.documentElement.style.setProperty('--muxui-semantic-motion-modal-enter-duration', '180ms');
      document.documentElement.style.setProperty('--muxui-semantic-motion-exit-duration', '800ms');
      const scope = document.getElementById('dialog-scope');
      scope.setAttribute('data-muxui-motion', 'full');
      window.__muxuiDialogSetMode('no-trigger');
    });
    await page.evaluate(() => window.__muxuiDialogSetOpen(true));
    await page.locator('.muxui-dialog').waitFor();
    await waitForPanelEntry(page);
    await settleEntry(page);
    await page.screenshot({ path: '/tmp/muxui-dialog-motion-full-dark.png' });
    await page.evaluate(() => window.__muxuiDialogSetOpen(false));
    await waitForPanelExit(page);
    await page.waitForTimeout(40);
    const slowedExitReductionStarted = Date.now();
    await page.locator('#dialog-scope').evaluate((node) => node.setAttribute('data-muxui-motion', 'reduced'));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached', timeout: 200 });
    assert.ok(Date.now() - slowedExitReductionStarted < 200, 'reduction during a slowed exit detaches promptly');

    await page.evaluate(() => {
      document.querySelector('link[href*="styles.css"]')?.remove();
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.getElementById('dialog-scope').setAttribute('data-muxui-motion', 'full');
      window.__muxuiDialogSetMode('no-trigger');
    });
    await page.evaluate(() => window.__muxuiDialogSetOpen(true));
    await page.locator('.muxui-dialog').waitFor();
    const missingStyles = await readMotion(page);
    assert.equal(missingStyles.opacity, 1, 'missing styles leave a no-trigger dialog statically visible');
    assert.equal(missingStyles.transform, 'none', 'missing styles preserve natural static positioning');
    assert.deepEqual(missingStyles.animations, [], 'missing styles do not start Motion');
    const missingStylesCloseStarted = Date.now();
    await page.evaluate(() => window.__muxuiDialogSetOpen(false));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached', timeout: 100 });
    assert.ok(Date.now() - missingStylesCloseStarted < 100, 'missing styles detach a no-trigger dialog immediately');

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openTriggered(page);
    const systemReduced = await readMotion(page);
    assert.equal(systemReduced.opacity, 1, 'system reduced entry is immediately visible');
    assert.ok(Math.abs(systemReduced.y) < 1, `system reduced entry is immediately centered: ${JSON.stringify(systemReduced)}`);
    assert.equal(systemReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced entry starts no meaningful animation');
    await closeAndWait(page, 150);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__muxuiDialogSetModeOpen('dismissablefalse'));
    await page.locator('.muxui-dialog').waitFor();
    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    assert.equal(await page.locator('.muxui-dialog').count(), 1, 'dismissable=false blocks Escape and outside dismissal');
    assert.equal(await page.locator('.muxui-dialog-close').count(), 0, 'dismissable=false removes the close button');
    await page.evaluate(() => window.__muxuiDialogSetOpen(false));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-modal-enter-duration');
      window.__muxuiDialogSetMode('trigger');
    });
    await openTriggered(page);
    await waitForPanelEntry(page);
    await page.evaluate(() => {
      window.__muxuiDialogSetOpen(false);
      window.setTimeout(() => window.__muxuiDialogSetOpen(true), 24);
    });
    await page.locator('.muxui-dialog').waitFor();
    await page.waitForFunction(() => !document.querySelector('.muxui-dialog-backdrop')?.hasAttribute('data-exiting'));
    await settleEntry(page);
    const reopened = await readMotion(page);
    assert.equal(reopened.opacity, 1, 'rapid close/reopen settles open');
    assert.ok(Math.abs(reopened.y) < 1, 'rapid close/reopen settles centered');
    assert.equal(await page.locator('.muxui-dialog').count(), 1);
    await page.evaluate(() => window.__muxuiDialogSetOpen(false));
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });
    await openTriggered(page);
    await waitForPanelEntry(page);
    await page.waitForTimeout(40);
    const capturedStyle = await page.evaluate(() => {
      window.__muxuiDialogCaptured = document.querySelector('.muxui-dialog');
      return window.__muxuiDialogCaptured?.style.cssText;
    });
    await page.evaluate(() => window.__muxuiDialogUnmount());
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });
    const detachedStyle = await page.evaluate(() => window.__muxuiDialogCaptured?.style.cssText);
    await page.waitForTimeout(240);
    const laterDetachedStyle = await page.evaluate(() => window.__muxuiDialogCaptured?.style.cssText);
    assert.equal(typeof capturedStyle, 'string', 'active panel captured before unmount');
    assert.equal(typeof detachedStyle, 'string', 'detached panel style captured after unmount cleanup');
    assert.equal(laterDetachedStyle, detachedStyle, 'detached panel remains unchanged after unmount cleanup');
    assert.deepEqual(errors, [], errors.join(' | '));
  } finally {
    await browser?.close();
    await server.close();
  }
});
