import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { LightboxMotionFixture } from '../fixtures/lightbox-motion-fixture.mjs';

const packageRoot = resolve(import.meta.dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');
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
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(LightboxMotionFixture)));
  return `<!doctype html><html data-muxui-color-scheme="light" data-muxui-motion="full"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/supplemental/lightbox.css"></head><body style="margin:0;background:var(--muxui-semantic-surface-canvas);color:var(--muxui-semantic-content-strong)">${body}<script type="module" src="/test/fixtures/lightbox-motion-browser-entry.mjs"></script></body></html>`;
}

async function startServer() {
  const server = await createServer({
    configFile: false,
    root: packageRoot,
    logLevel: 'error',
    resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { entries: ['src/supplemental/lightbox.mjs'], include: ['react', 'react-dom/client', 'react-aria-components', 'motion'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{
      name: 'lightbox-motion-fixture',
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url === '/lightbox-motion.html') {
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

async function waitForHydration(page) {
  await page.waitForFunction(() => document.documentElement.dataset.muxuiLightboxHydrated === 'true', undefined, { timeout: 5_000 });
}

async function readShell(page) {
  return page.locator('.muxui-lightbox-popup').evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      opacity: Number(style.opacity),
      translate: style.translate,
      transform: style.transform,
      exiting: node.hasAttribute('data-exiting'),
      reduced: node.hasAttribute('data-muxui-lightbox-reduced'),
      centeredX: rect.left + rect.width / 2,
      centeredY: rect.top + rect.height / 2,
      viewportX: window.innerWidth / 2,
      viewportY: window.innerHeight / 2,
      animations: node.getAnimations().map((animation) => ({
        duration: animation.effect?.getComputedTiming().duration,
        playState: animation.playState,
      })),
      keyframes: node.getAnimations().flatMap((animation) => animation.effect?.getKeyframes().map(({ opacity, translate }) => ({ opacity, translate })) ?? []),
    };
  });
}

function translateY(value) {
  const match = /^\s*-?(?:\d+\.?\d*|\.\d+)px(?:\s+(-?(?:\d+\.?\d*|\.\d+))px)?/u.exec(String(value ?? ''));
  return Number(match?.[1] ?? 0);
}

async function waitForShellSettled(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.muxui-lightbox-popup');
    if (!node) return false;
    const style = getComputedStyle(node);
    return Number(style.opacity) >= 0.99 && (style.translate === 'none' || style.translate === '0px' || style.translate === '0px 0px');
  }, undefined, { timeout: 3_000 });
}

async function waitForCrossfade(page) {
  await page.waitForFunction(() => {
    const layers = [...document.querySelectorAll('.muxui-lightbox-content-layer')];
    if (layers.length !== 2) return false;
    const opacities = layers.map((node) => Number(getComputedStyle(node).opacity));
    return opacities.some((opacity) => opacity > 0 && opacity < 1);
  }, undefined, { timeout: 1_000 });
}

test('Lightbox motion retains RAC lifecycle, crossfades images, interrupts safely, and settles reduced scopes', { timeout: 120_000 }, async () => {
  const { server, url } = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference' });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/lightbox-motion.html`, { waitUntil: 'networkidle' });
    await waitForHydration(page);
    assert.equal(await page.locator('.muxui-lightbox-popup').count(), 0, 'SSR and hydration begin closed');

    const trigger = page.getByRole('button', { name: 'Open lightbox' });
    const entryRecording = await recordFrames(page, () => {
      const node = document.querySelector('.muxui-lightbox-popup');
      if (!node) return null;
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), translate: style.translate };
    });
    await trigger.click();
    const popup = page.locator('.muxui-lightbox-popup');
    await popup.waitFor();
    await waitForShellSettled(page);
    const entryFrames = await entryRecording.stop();
    const entry = entryFrames.find(({ opacity, translate }) => opacity > 0 && opacity < 1 && translateY(translate) > 0);
    assert.ok(entry && entry.opacity > 0 && entry.opacity < 1, `entry fades in: ${JSON.stringify(entryFrames)}`);
    const entryY = translateY(entry.translate);
    assert.ok(entryY > 0 && entryY < 120, `entry follows the approved 120px geometry: ${JSON.stringify(entry)}`);
    const settledEntry = await readShell(page);
    assert.equal(settledEntry.opacity, 1);
    assert.ok(Math.abs(settledEntry.centeredX - settledEntry.viewportX) < 1, 'settled popup remains horizontally centered');
    assert.ok(Math.abs(settledEntry.centeredY - settledEntry.viewportY) < 1, 'settled popup remains vertically centered');
    assert.equal(await popup.locator('img[data-image-key="one"]').getAttribute('alt'), 'First image');
    assert.equal(await popup.evaluate((node) => node.contains(document.activeElement)), true, 'opening moves focus into the dialog');

    const exitRecording = await recordFrames(page, () => {
      const node = document.querySelector('.muxui-lightbox-popup');
      if (!node || !document.querySelector('.muxui-lightbox-backdrop')?.hasAttribute('data-exiting')) return null;
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), translate: style.translate };
    });
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    const exitFrames = await exitRecording.stop();
    assert.ok(exitFrames.length > 0, 'the shell remains mounted during exit');
    const exit = exitFrames.find(({ opacity, translate }) => opacity < 1 && /-/u.test(translate));
    assert.ok(exit && exit.opacity < 1, `exit fades out: ${JSON.stringify(exitFrames)}`);
    assert.match(exit.translate, /-/u, `exit moves upward: ${JSON.stringify(exit)}`);
    assert.equal(await trigger.evaluate((node) => document.activeElement === node), true, 'Escape restores trigger focus');

    await trigger.click();
    await popup.waitFor();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.muxui-lightbox-popup')).opacity) < 0.99, undefined, { timeout: 1_000 });
    // Close, then reopen in the same frame that records visible exit progress, so the
    // interrupted values and the interruption cannot drift apart on slow runners.
    const interruptRecording = await recordFrames(page, (_, state) => {
      const node = document.querySelector('.muxui-lightbox-popup');
      if (!state.closed) {
        state.closed = true;
        window.__muxuiLightboxSetOpen(false);
        return null;
      }
      if (!node) return null;
      const style = getComputedStyle(node);
      const frame = { opacity: Number(style.opacity), translate: style.translate };
      const exiting = document.querySelector('.muxui-lightbox-backdrop')?.hasAttribute('data-exiting') === true;
      if (!state.reopened) {
        if (!exiting) return null;
        state.exitStartOpacity ??= frame.opacity;
        if (frame.opacity >= state.exitStartOpacity) return null;
        state.reopened = true;
        window.__muxuiLightboxSetOpen(true);
        return { phase: 'midExit', ...frame };
      }
      return exiting ? null : { phase: 'reopened', ...frame };
    });
    await page.waitForFunction(() => document.querySelector('.muxui-lightbox-popup') && !document.querySelector('.muxui-lightbox-backdrop')?.hasAttribute('data-exiting'), undefined, { timeout: 1_000 });
    await waitForShellSettled(page);
    const interruptFrames = await interruptRecording.stop();
    const midExit = interruptFrames.find(({ phase }) => phase === 'midExit');
    const reopened = interruptFrames.find(({ phase }) => phase === 'reopened');
    assert.ok(midExit && reopened, `reopen interrupts a recorded exit: ${JSON.stringify(interruptFrames)}`);
    const midExitY = translateY(midExit.translate);
    assert.ok(midExit.opacity > 0 && midExit.opacity < 1, `reopen captures a live mid-exit opacity: ${JSON.stringify(midExit)}`);
    assert.ok(Number.isFinite(midExitY), `reopen captures a live mid-exit translate: ${JSON.stringify(midExit)}`);
    const reopenedY = translateY(reopened.translate);
    assert.ok(reopened.opacity > 0 && reopened.opacity < 0.99, `reopen starts from interrupted opacity: ${JSON.stringify({ midExit, reopened })}`);
    assert.ok(Math.abs(reopened.opacity - midExit.opacity) < 0.3, `reopen stays near interrupted opacity: ${JSON.stringify({ midExit, reopened })}`);
    assert.ok(Math.abs(reopenedY - midExitY) < 36, `reopen stays near interrupted translate: ${JSON.stringify({ midExit, reopened })}`);
    assert.equal(await page.locator('.muxui-lightbox-popup').count(), 1, 'close/reopen keeps one shell');

    // Navigate A→B, then to C in the same frame that records B mid-crossfade.
    const rapidRecording = await recordFrames(page, (_, state) => {
      const layers = [...document.querySelectorAll('.muxui-lightbox-content-layer')].map((node) => ({
        key: node.querySelector('img')?.dataset.imageKey,
        current: node.classList.contains('muxui-lightbox-content-layer--current'),
        ariaHidden: node.getAttribute('aria-hidden'),
        opacity: Number(getComputedStyle(node).opacity),
      }));
      if (!state.started) {
        state.started = true;
        window.__muxuiLightboxSetSelected('two');
        return null;
      }
      const two = layers.find(({ key }) => key === 'two');
      if (!state.rapid) {
        if (layers.length !== 2 || !two || two.opacity < 0.2 || two.opacity >= 1) return null;
        state.rapid = true;
        window.__muxuiLightboxSetSelected('three');
        return { phase: 'crossfade', layers };
      }
      const isCurrent = (expected) => layers.length === 3 && layers.some(({ key, current }) => current && key === expected);
      if (!state.duringRapid) {
        if (!isCurrent('three')) return null;
        state.duringRapid = true;
        window.__muxuiLightboxSetSelected('two');
        return { phase: 'duringRapid', layers };
      }
      if (state.reversed || !isCurrent('two')) return null;
      state.reversed = true;
      return { phase: 'reversed', layers };
    });
    await rapidRecording.waitFor(({ state }) => state.reversed, { timeout: 1_000 });
    const rapidFrames = await rapidRecording.stop();
    const beforeRapid = rapidFrames.find(({ phase }) => phase === 'crossfade')?.layers;
    const duringRapid = rapidFrames.find(({ phase }) => phase === 'duringRapid')?.layers;
    const reversed = rapidFrames.find(({ phase }) => phase === 'reversed')?.layers;
    assert.ok(beforeRapid && duringRapid && reversed, `rapid navigation records every phase: ${JSON.stringify(rapidFrames)}`);
    assert.equal(beforeRapid[0].ariaHidden, 'true', 'outgoing image is hidden from announcements');
    assert.equal(beforeRapid[0].key, 'one');
    assert.equal(beforeRapid[1].key, 'two');
    const crossfade = beforeRapid.map(({ opacity }) => opacity);
    assert.ok(crossfade.some((opacity) => opacity > 0 && opacity < 1), `navigation crossfades both layers: ${JSON.stringify(crossfade)}`);
    const beforeRapidTwo = beforeRapid.find(({ key }) => key === 'two')?.opacity ?? 0;
    assert.ok(beforeRapidTwo > 0 && beforeRapidTwo < 1, `A→B is in flight before rapid navigation: ${JSON.stringify(beforeRapid)}`);
    const duringRapidTwo = duringRapid.find(({ key }) => key === 'two')?.opacity ?? 1;
    assert.ok(duringRapidTwo > 0 && duringRapidTwo < 0.95, `B keeps its in-flight opacity while C enters: ${JSON.stringify(duringRapid)}`);
    const layers = page.locator('.muxui-lightbox-content-layer');
    const reversedTwo = reversed.find(({ key }) => key === 'two')?.opacity ?? 0;
    assert.ok(reversedTwo > 0.02, `reverse navigation resumes B from its retained opacity: ${JSON.stringify(reversed)}`);
    await page.waitForFunction(() => document.querySelectorAll('.muxui-lightbox-content-layer--outgoing').length === 0, undefined, { timeout: 1_000 });
    assert.equal(await layers.count(), 1, 'all retired rapid-navigation layers are cleaned up');
    assert.equal(await popup.locator('img[data-image-key="two"]').count(), 1, 'reverse navigation keeps the selected image');

    await popup.press('ArrowRight');
    await waitForCrossfade(page);
    await page.locator('.muxui-lightbox-content-layer--outgoing').waitFor({ state: 'detached' });
    assert.equal(await popup.locator('img[data-image-key="three"]').count(), 1, 'keyboard navigation keeps the current image');
    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
      const popupNode = document.querySelector('.muxui-lightbox-popup');
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ clientX: 100 }] });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 20 }] });
      popupNode?.dispatchEvent(start);
      popupNode?.dispatchEvent(end);
    });
    await waitForCrossfade(page);
    await page.locator('.muxui-lightbox-content-layer--outgoing').waitFor({ state: 'detached' });
    assert.equal(await popup.locator('img[data-image-key="two"]').count(), 1, 'RTL swipe preserves existing previous navigation semantics');

    await page.evaluate(() => {
      document.documentElement.dir = 'ltr';
      document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '800ms');
      document.documentElement.style.setProperty('--muxui-semantic-motion-exit-duration', '800ms');
      document.documentElement.style.setProperty('--muxui-semantic-motion-interaction-duration', '800ms');
      document.getElementById('lightbox-origin').setAttribute('data-muxui-motion', 'full');
      window.__muxuiLightboxSetOpen(false);
    });
    await popup.waitFor({ state: 'detached' });
    await page.evaluate(() => window.__muxuiLightboxSetOpen(true));
    await popup.waitFor();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.muxui-lightbox-popup')).opacity) < 0.99, undefined, { timeout: 1_000 });
    const reducedStarted = Date.now();
    await page.locator('#lightbox-origin').evaluate((node) => node.setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-lightbox-popup');
      if (!node) return false;
      const style = getComputedStyle(node);
      return node.hasAttribute('data-muxui-lightbox-reduced')
        && Number(style.opacity) >= 0.99
        && (style.translate === 'none' || style.translate === '0px' || style.translate === '0px 0px');
    }, undefined, { timeout: 300 });
    assert.ok(Date.now() - reducedStarted < 300, 'explicit reduction settles interrupted entry promptly');
    await page.evaluate(() => window.__muxuiLightboxSetOpen(false));
    await popup.waitFor({ state: 'detached', timeout: 150 });

    await page.locator('#lightbox-origin').evaluate((node) => node.setAttribute('data-muxui-motion', 'full'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.__muxuiLightboxSetOpen(true));
    await popup.waitFor();
    const systemReduced = await readShell(page);
    assert.equal(systemReduced.opacity, 1, 'system reduced entry is immediately visible');
    assert.ok(['none', '0px', '0px 0px'].includes(systemReduced.translate), 'system reduced entry is immediately settled');
    assert.equal(systemReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced entry has no meaningful animation');
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached', timeout: 150 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-reveal-duration');
      document.documentElement.style.removeProperty('--muxui-semantic-motion-exit-duration');
      document.documentElement.style.removeProperty('--muxui-semantic-motion-interaction-duration');
      window.__muxuiLightboxSetOpen(true);
    });
    await popup.waitFor();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.muxui-lightbox-popup')).opacity) < 0.99, undefined, { timeout: 1_000 });
    const capturedStyle = await page.evaluate(() => {
      window.__muxuiLightboxCaptured = document.querySelector('.muxui-lightbox-popup');
      return window.__muxuiLightboxCaptured?.style.cssText;
    });
    await page.evaluate(() => window.__muxuiLightboxUnmount());
    await page.locator('#lightbox-unmounted').waitFor({ state: 'attached' });
    await popup.waitFor({ state: 'detached' });
    const detachedStyle = await page.evaluate(() => window.__muxuiLightboxCaptured?.style.cssText);
    await page.waitForTimeout(250);
    const laterDetachedStyle = await page.evaluate(() => window.__muxuiLightboxCaptured?.style.cssText);
    assert.equal(typeof capturedStyle, 'string', 'active shell captured before unmount');
    assert.equal(typeof detachedStyle, 'string', 'detached shell style captured after unmount cleanup');
    assert.equal(laterDetachedStyle, detachedStyle, 'detached shell receives no later Motion writes');
    assert.deepEqual(errors, [], errors.join(' | '));
  } finally {
    await browser?.close();
    await server.close();
  }
});
