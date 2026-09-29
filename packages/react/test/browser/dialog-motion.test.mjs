import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { Dialog } from '../../src/overlays.mjs';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

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
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">', bodyAttributes: 'style="margin:0;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)"', body, entry: '/packages/react/test/fixtures/dialog-motion-browser-entry.mjs' });
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

// Serialized into the page by recordFrames, so it must stay self-contained.
function samplePanel() {
  const node = document.querySelector('.muxui-dialog');
  const backdrop = document.querySelector('.muxui-dialog-backdrop');
  if (!node) return null;
  const style = getComputedStyle(node);
  const backdropStyle = backdrop && getComputedStyle(backdrop);
  return {
    opacity: Number(style.opacity),
    y: Number.parseFloat(style.getPropertyValue('--muxui-modal-y')) || 0,
    scale: Number.parseFloat(style.getPropertyValue('--muxui-modal-scale')) || 1,
    backdropExiting: backdrop?.hasAttribute('data-exiting') ?? false,
    backdropDuration: backdropStyle?.transitionDuration,
    backdropEasing: backdropStyle?.transitionTimingFunction,
  };
}

function isMidFlight({ opacity, y, scale }) {
  return opacity > 0 && opacity < 1 && y < 0 && y > -8 && scale > 0.97 && scale < 1;
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
  const { url, close } = await startServer({ root: 'repository', pages: { '/dialog-motion.html': dialogDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/dialog-motion.html`, { waitUntil: 'networkidle' });
    await waitForHydration(page);
    assert.equal(await page.locator('.muxui-dialog').count(), 0, 'SSR and hydration begin closed');

    const entryRecording = await recordFrames(page, samplePanel);
    await openTriggered(page);
    await waitForPanelEntry(page);
    assert.equal(await page.locator('.muxui-dialog-backdrop').evaluate((node) => getComputedStyle(node).transitionDuration), '0.18s', 'backdrop uses modal entry duration');
    await settleEntry(page);
    const entryFrames = await entryRecording.stop();
    const entry = entryFrames.find(isMidFlight) ?? {};
    assert.ok(entry.opacity > 0 && entry.opacity < 1, `entry fades in: ${JSON.stringify(entryFrames)}`);
    assert.ok(entry.y < 0 && entry.y > -8, `entry translates toward center: ${JSON.stringify(entry)}`);
    assert.ok(entry.scale > 0.97 && entry.scale < 1, `entry scales toward the settled panel: ${JSON.stringify(entry)}`);
    const settledEntry = await readMotion(page);
    assert.equal(settledEntry.opacity, 1);
    assert.ok(Math.abs(settledEntry.y) < 1, `entry settles at y=0: ${JSON.stringify(settledEntry)}`);
    assert.ok(Math.abs(settledEntry.scale - 1) < 0.001, `entry settles at scale=1: ${JSON.stringify(settledEntry)}`);
    assert.ok(Math.abs(settledEntry.centeredX - settledEntry.viewportX) < 1, 'settled dialog remains horizontally centered');
    assert.ok(Math.abs(settledEntry.centeredY - settledEntry.viewportY) < 1, 'settled dialog remains vertically centered');
    await page.screenshot({ path: '/tmp/muxui-dialog-motion-full-light.png' });
    assert.equal(await page.locator('.muxui-dialog').evaluate((node) => node.contains(document.activeElement)), true, 'opening moves focus into the dialog');

    const exitRecording = await recordFrames(page, samplePanel);
    await page.keyboard.press('Escape');
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });
    const exitFrames = (await exitRecording.stop()).filter(({ backdropExiting }) => backdropExiting);
    const exit = exitFrames.find(isMidFlight) ?? {};
    assert.ok(exit.opacity < 1, `exit fades out: ${JSON.stringify(exitFrames)}`);
    assert.ok(exit.y < 0 && exit.y > -8, `exit translates upward: ${JSON.stringify(exit)}`);
    assert.ok(exit.scale < 1 && exit.scale > 0.97, `exit scales down: ${JSON.stringify(exit)}`);
    assert.equal(exit.backdropDuration, '0.12s', 'backdrop uses modal exit duration');
    assert.equal(exit.backdropEasing, 'cubic-bezier(0.16, 1, 0.3, 1)', 'backdrop uses modal easing');
    await page.waitForFunction(() => document.activeElement?.classList.contains('muxui-dialog-trigger'));
    assert.equal(await page.locator('.muxui-dialog-trigger').evaluate((node) => document.activeElement === node), true, 'Escape restores trigger focus');

    await page.evaluate(() => window.__muxuiDialogSetModeOpen('rejected'));
    await page.locator('.muxui-dialog').waitFor();
    await settleEntry(page);
    await page.locator('.muxui-dialog-close').click();
    // Negative check: a rejected close must not start an exit, which has no event to await.
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
    // Let the entry progress mid-flight before reducing it.
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
    // Let the exit progress mid-flight before reducing it.
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
    // Let the entry progress mid-flight before unmounting it.
    await page.waitForTimeout(40);
    const capturedStyle = await page.evaluate(() => {
      window.__muxuiDialogCaptured = document.querySelector('.muxui-dialog');
      return window.__muxuiDialogCaptured?.style.cssText;
    });
    await page.evaluate(() => window.__muxuiDialogUnmount());
    await page.locator('.muxui-dialog').waitFor({ state: 'detached' });
    const detachedStyle = await page.evaluate(() => window.__muxuiDialogCaptured?.style.cssText);
    // Negative check: give any stray Motion write after unmount time to land.
    await page.waitForTimeout(240);
    const laterDetachedStyle = await page.evaluate(() => window.__muxuiDialogCaptured?.style.cssText);
    assert.equal(typeof capturedStyle, 'string', 'active panel captured before unmount');
    assert.equal(typeof detachedStyle, 'string', 'detached panel style captured after unmount cleanup');
    assert.equal(laterDetachedStyle, detachedStyle, 'detached panel remains unchanged after unmount cleanup');
    assert.deepEqual(errors, [], errors.join(' | '));
  } finally {
    await browser?.close();
    await close();
  }
});
