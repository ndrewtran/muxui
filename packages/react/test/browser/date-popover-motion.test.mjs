import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { Button } from '../../src/button.mjs';
import { DatePicker, DateRangePicker } from '../../src/fields.mjs';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function dateDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(DatePicker, {
    label: 'Due date',
    defaultValue: '2026-08-26',
    open: false,
  })));
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">', bodyAttributes: 'style="margin: 96px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);"', body, entry: '/packages/react/test/fixtures/date-popover-motion-browser-entry.mjs' });
}

function buttonDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(Button, null, 'Save')));
  return pageShell({ body, entry: '/packages/react/test/fixtures/button-only-browser-entry.mjs' });
}

function rangeDocument() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(DateRangePicker, {
    label: 'Date range',
    defaultValue: { start: '2026-08-20', end: '2026-08-26' },
    open: false,
  })));
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">', bodyAttributes: 'style="margin: 96px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);"', body, entry: '/packages/react/test/fixtures/date-range-popover-motion-browser-entry.mjs' });
}

async function waitForHydration(page) {
  await page.waitForFunction(() => document.documentElement.dataset.muxuiDatePopoverHydrated === 'true', undefined, { timeout: 5_000 });
}

async function openCalendar(page) {
  await page.locator('.muxui-date-trigger').click();
  await page.locator('.muxui-date-popover').waitFor();
}

async function closeCalendarWithEscape(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const node = document.querySelector('.muxui-date-popover');
    return node?.hasAttribute('data-exiting') && node.getAnimations().length === 2;
  });
  const exit = await readEntryMotion(page);
  assert.equal(exit.animationName, 'none', 'Motion owns exit without a CSS keyframe');
  assert.deepEqual(exit.animations.map(({ duration, easing }) => ({ duration, easing })), [
    { duration: 120, easing: 'cubic-bezier(0.42, 0, 1, 1)' },
    { duration: 120, easing: 'cubic-bezier(0.42, 0, 1, 1)' },
  ], 'both exit channels use the exit duration and dismiss easing');
  await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.matches('.muxui-date-trigger')), true, 'Escape restores trigger focus');
}

async function closeReducedCalendar(page, label) {
  const started = Date.now();
  await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
  await page.locator('.muxui-date-popover').waitFor({ state: 'detached', timeout: 250 });
  assert.ok(Date.now() - started < 100, `${label} popup exit is immediate`);
}

async function readEntryMotion(page) {
  return page.locator('.muxui-date-popover').evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      animationName: style.animationName,
      reduced: node.hasAttribute('data-muxui-date-popover-reduced'),
      opacity: style.opacity,
      transform: style.transform,
      transformY: new DOMMatrixReadOnly(style.transform).m42,
      animations: node.getAnimations().map((animation) => ({
        duration: animation.effect?.getComputedTiming().duration,
        easing: animation.effect?.getComputedTiming().easing,
        playState: animation.playState,
        keyframes: animation.effect?.getKeyframes(),
      })),
    };
  });
}

async function settleEntry(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.muxui-date-popover');
    if (!node) return false;
    const style = getComputedStyle(node);
    return style.opacity === '1' && new DOMMatrixReadOnly(style.transform).m42 === 0
      && node.getAnimations().every((animation) => animation.playState === 'finished');
  });
  return readEntryMotion(page);
}

async function readDatePopoverShadow(page) {
  return page.locator('.muxui-date-popover').evaluate((node) => {
    const reference = document.createElement('div');
    reference.style.boxShadow = '0 4px 16px color-mix(in srgb, var(--muxui-semantic-color-neutral-100) 10%, transparent)';
    document.body.append(reference);
    const referenceShadow = getComputedStyle(reference).boxShadow;
    const actualShadow = getComputedStyle(node).boxShadow;
    reference.remove();
    return { actualShadow, referenceShadow };
  });
}

// Serialized into the page by recordFrames, so it must stay self-contained.
function samplePopover() {
  const node = document.querySelector('.muxui-date-popover');
  if (!node) return null;
  const style = getComputedStyle(node);
  return {
    opacity: style.opacity,
    transformY: new DOMMatrixReadOnly(style.transform).m42,
    animations: node.getAnimations().map((animation) => ({
      duration: animation.effect?.getComputedTiming().duration,
      easing: animation.effect?.getComputedTiming().easing,
      keyframes: animation.effect?.getKeyframes().map(({ opacity, transform }) => ({ opacity, transform })),
    })),
  };
}

// Opens the popup with an 800ms reveal and returns the first recorded frame that is
// visibly in flight (or the last frame, for the assertion message).
async function recordSlowedEntry(page) {
  const recording = await recordFrames(page, samplePopover);
  await openCalendar(page);
  const inFlight = ({ opacity, transformY, animations }) => animations.some(({ duration }) => Number(duration) === 800)
    && opacity !== '1' && transformY > -4 && transformY < 0;
  await recording.waitFor(({ frames }) => frames.some(({ opacity, transformY, animations }) => animations.some(({ duration }) => Number(duration) === 800)
    && opacity !== '1' && transformY > -4 && transformY < 0), { timeout: 2_000 }).catch(() => {});
  const frames = await recording.stop();
  return frames.find(inFlight) ?? frames.at(-1) ?? { animations: [] };
}

function assertEntryMotion(entry) {
  const fade = entry.animations.find(({ keyframes }) => keyframes.some((frame) => frame.opacity !== undefined));
  const travel = entry.animations.find(({ keyframes }) => keyframes.some((frame) => frame.transform !== undefined));
  assert.equal(fade?.duration, 200, 'opacity uses the reveal duration');
  assert.equal(fade?.easing, 'cubic-bezier(0, 0, 0.58, 1)', 'opacity uses reveal easing');
  assert.match(travel?.easing ?? '', /^linear\(/u, 'travel uses the sampled Motion spring');
}

async function capturePopup(page, path) {
  const box = await page.locator('.muxui-date-popover').boundingBox();
  assert.ok(box, `popup has geometry for ${path}`);
  await page.screenshot({ path, clip: box });
}

test('date popup Motion entry and exit retain RAC focus, dismissal, and cleanup', { timeout: 120_000 }, async () => {
  const { url, close } = await startServer({
    root: 'repository',
    pages: { '/date-popover-motion.html': dateDocument, '/button-only.html': buttonDocument, '/date-range-popover-motion.html': rangeDocument },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`));
    await page.goto(`${url}/date-popover-motion.html`, { waitUntil: 'networkidle' });
    try {
      await waitForHydration(page);
    } catch (error) {
      throw new Error(`${error.message}; page errors: ${errors.join(' | ')}`);
    }
    assert.equal(await page.locator('.muxui-date-popover').count(), 0, 'SSR and hydration begin closed');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openCalendar(page);
    assert.equal(await page.locator('.muxui-date-picker-popover').count(), 1, 'DatePicker popup carries its canonical family selector');
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) > 0));
    const fullEntry = await readEntryMotion(page);
    assert.equal(fullEntry.animationName, 'none', 'entry is owned by Motion, not a second CSS animation');
    assertEntryMotion(fullEntry);
    const fullSettled = await settleEntry(page);
    assert.equal(fullSettled.opacity, '1');
    assert.equal(fullSettled.transformY, 0);
    const lightShadow = await readDatePopoverShadow(page);
    assert.equal(lightShadow.actualShadow, lightShadow.referenceShadow, 'light popover matches the original 10% neutral-100 shadow recipe');
    assert.match(lightShadow.actualShadow, /0px 4px 16px 0px$/u, 'light popover shadow retains its offset and blur');
    await page.evaluate(() => { document.documentElement.dataset.muxuiColorScheme = 'dark'; });
    const darkShadow = await readDatePopoverShadow(page);
    assert.equal(darkShadow.actualShadow, darkShadow.referenceShadow, 'dark popover matches the original mode-resolved shadow recipe');
    assert.match(darkShadow.actualShadow, /0px 4px 16px 0px$/u, 'dark popover shadow retains its offset and blur');
    await page.evaluate(() => { document.documentElement.dataset.muxuiColorScheme = 'light'; });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.activeElement?.matches('.muxui-calendar-cell[data-focus-visible]'));
    const muxFocus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
    });
    assert.equal(muxFocus.outlineStyle, 'none', 'Calendar keyboard focus replaces the user-agent outline');
    assert.notEqual(muxFocus.boxShadow, 'none', 'Calendar keeps its token-backed Mux focus rings');
    await page.emulateMedia({ forcedColors: 'active' });
    const forcedColorsFocus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return {
        active: matchMedia('(forced-colors: active)').matches,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    assert.equal(forcedColorsFocus.active, true);
    assert.equal(forcedColorsFocus.outlineStyle, 'solid', 'forced colors retain a system focus outline');
    assert.equal(forcedColorsFocus.outlineWidth, '2px');
    await page.emulateMedia({ forcedColors: 'none' });
    await capturePopup(page, '/tmp/muxui-date-popover-full-light.png');
    await closeCalendarWithEscape(page);

    const secondRecording = await recordFrames(page, samplePopover);
    await openCalendar(page);
    await secondRecording.waitFor(({ frames }) => frames.some(({ opacity, transformY }) => Number(opacity) < 1 && transformY < 0), { timeout: 2_000 }).catch(() => {});
    const secondFrames = await secondRecording.stop();
    const secondEntry = secondFrames.find(({ opacity, transformY }) => Number(opacity) < 1 && transformY < 0);
    assert.ok(secondEntry && Number(secondEntry.opacity) < 1 && secondEntry.transformY < 0, `a fresh node replays entry after a completed close: ${JSON.stringify(secondFrames)}`);
    assertEntryMotion(secondEntry);
    await page.mouse.click(8, 8);
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.matches('.muxui-date-trigger')), true, 'outside dismissal restores trigger focus');

    await openCalendar(page);
    await settleEntry(page);
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-exit-duration', '800ms');
      window.__muxuiDatePopoverSetOpen(false);
    });
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-date-popover');
      return node?.hasAttribute('data-exiting') && node.getAnimations().length === 2;
    });
    await page.evaluate(async () => {
      const node = document.querySelector('.muxui-date-popover');
      window.__muxuiRetainedDatePopover = node;
      const animations = node.getAnimations();
      animations.forEach((animation) => animation.pause());
      animations[0].finish();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator('.muxui-date-popover[data-exiting]').count(), 1, 'one completed channel cannot release the retained popup');
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-exit-duration');
      window.__muxuiDatePopoverSetOpen(true);
    });
    await page.waitForFunction(() => !document.querySelector('.muxui-date-popover')?.hasAttribute('data-exiting'));
    await settleEntry(page);
    assert.equal(await page.evaluate(() => document.querySelector('.muxui-date-popover') === window.__muxuiRetainedDatePopover), true, 'cancelled exit callbacks cannot remove or replace the reopened node');
    await closeCalendarWithEscape(page);

    await openCalendar(page);
    await page.evaluate(() => {
      window.__muxuiDatePopoverSetOpen(false);
      window.setTimeout(() => window.__muxuiDatePopoverSetOpen(true), 24);
    });
    await page.locator('.muxui-date-popover').waitFor();
    await page.waitForFunction(() => !document.querySelector('.muxui-date-popover')?.hasAttribute('data-exiting') && document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 200));
    const rapidStarted = await readEntryMotion(page);
    assertEntryMotion(rapidStarted);
    const rapidSettled = await settleEntry(page);
    assert.equal(rapidSettled.opacity, '1', 'rapid close/reopen settles at the open target');
    assert.equal(await page.locator('.muxui-date-popover').count(), 1);
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(true));
    await page.locator('.muxui-date-popover').waitFor();
    await page.evaluate(() => window.__muxuiDatePopoverUnmount());
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.muxui-date-popover').count(), 0, 'unmount removes the popup and Motion cleanup leaves no node');

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.evaluate(() => document.querySelector('link[href*="styles.css"]')?.remove());
    await openCalendar(page);
    const missingStyles = await readEntryMotion(page);
    assert.equal(missingStyles.opacity, '1', 'missing token styles leave the popup visible');
    assert.deepEqual(missingStyles.animations, [], 'missing token styles do not start a parallel fallback animation');
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '800ms');
    });
    const slowedSystemEntry = await recordSlowedEntry(page);
    assert.equal(slowedSystemEntry.animations.some(({ duration }) => Number(duration) === 800), true, 'system reduction test starts from a slowed entry');
    assert.ok(slowedSystemEntry.opacity !== '1' && slowedSystemEntry.transformY > -4 && slowedSystemEntry.transformY < 0, `slowed entry is visibly in flight: ${JSON.stringify(slowedSystemEntry)}`);
    const systemReductionStarted = Date.now();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-date-popover');
      return node?.hasAttribute('data-muxui-date-popover-reduced')
        && getComputedStyle(node).opacity === '1'
        && new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 === 0
        && node.getAnimations().every((animation) => Number(animation.effect?.getComputedTiming().duration) <= 1);
    }, undefined, { timeout: 150 });
    assert.ok(Date.now() - systemReductionStarted < 150, 'system reduction settles the active entry before the slowed token completes');
    const systemReducedDuringEntry = await readEntryMotion(page);
    assert.equal(systemReducedDuringEntry.reduced, true, 'system reduction marks an open popup for its exit path');
    assert.equal(systemReducedDuringEntry.opacity, '1', 'system reduction settles an active entry');
    assert.equal(systemReducedDuringEntry.transformY, 0, 'system reduction settles the entry position');
    assert.equal(systemReducedDuringEntry.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduction stops the active entry');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Give a wrongly replayed entry time to start before asserting there is none.
    await page.waitForTimeout(120);
    const systemRestoredWhileOpen = await readEntryMotion(page);
    assert.equal(systemRestoredWhileOpen.reduced, false, 'restoring system motion clears the private reduced marker');
    assert.equal(systemRestoredWhileOpen.animations.some(({ duration }) => Number(duration) > 1), false, 'restoring system motion does not replay an open entry');
    assert.equal(systemRestoredWhileOpen.opacity, '1', `restoring system motion keeps the popup settled: ${JSON.stringify(systemRestoredWhileOpen)}`);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-reveal-duration');
      window.__muxuiDatePopoverSetOpen(false);
    });
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.getElementById('root').removeAttribute('data-muxui-motion');
      document.documentElement.style.setProperty('--muxui-semantic-motion-reveal-duration', '800ms');
    });
    const slowedNestedEntry = await recordSlowedEntry(page);
    assert.equal(slowedNestedEntry.animations.some(({ duration }) => Number(duration) === 800), true, 'nested reduction test starts from a slowed entry');
    assert.ok(slowedNestedEntry.opacity !== '1' && slowedNestedEntry.transformY > -4 && slowedNestedEntry.transformY < 0, `slowed nested entry is visibly in flight: ${JSON.stringify(slowedNestedEntry)}`);
    const nestedReductionStarted = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const node = document.querySelector('.muxui-date-popover');
      return node?.hasAttribute('data-muxui-date-popover-reduced')
        && node.getAnimations().every((animation) => Number(animation.effect?.getComputedTiming().duration) <= 1)
        && getComputedStyle(node).opacity === '1'
        && new DOMMatrixReadOnly(getComputedStyle(node).transform).m42 === 0;
    }, undefined, { timeout: 150 });
    assert.ok(Date.now() - nestedReductionStarted < 150, 'nested reduction settles the active entry before the slowed token completes');
    const nestedReducedDuringEntry = await readEntryMotion(page);
    assert.equal(nestedReducedDuringEntry.reduced, true, 'nested reduction marks an open popup for its exit path');
    assert.equal(nestedReducedDuringEntry.opacity, '1', 'nested reduction settles an active entry');
    assert.equal(nestedReducedDuringEntry.transformY, 0, 'nested reduction settles the entry position');
    assert.equal(nestedReducedDuringEntry.animations.some(({ duration }) => Number(duration) > 1), false, 'nested reduction stops the active entry');
    await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));
    // Give a wrongly replayed entry time to start before asserting there is none.
    await page.waitForTimeout(120);
    const nestedRestoredWhileOpen = await readEntryMotion(page);
    assert.equal(nestedRestoredWhileOpen.reduced, false, 'restoring nested motion clears the private reduced marker');
    assert.equal(nestedRestoredWhileOpen.animations.some(({ duration }) => Number(duration) > 1), false, 'restoring nested motion does not replay an open entry');
    assert.equal(nestedRestoredWhileOpen.opacity, '1', `restoring nested motion keeps the popup settled: ${JSON.stringify(nestedRestoredWhileOpen)}`);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-reveal-duration');
    });
    await closeCalendarWithEscape(page);

    // A slowed exit must remain mounted until both Motion channels complete,
    // and either reduction source must release that retained node immediately.
    for (const reduction of ['system', 'nested']) {
      await openCalendar(page);
      await settleEntry(page);
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--muxui-semantic-motion-exit-duration', '800ms');
        window.__muxuiDatePopoverSetOpen(false);
      });
      await page.waitForFunction(() => {
        const node = document.querySelector('.muxui-date-popover');
        return node?.hasAttribute('data-exiting') && Number(getComputedStyle(node).opacity) < 0.99;
      });
      const exiting = await readEntryMotion(page);
      assert.equal(exiting.animations.length, 2, 'both Motion exit channels remain attached');
      assert.ok(exiting.animations.every(({ duration }) => duration === 800));
      if (reduction === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
      await page.locator('.muxui-date-popover').waitFor({ state: 'detached', timeout: 250 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => {
        document.getElementById('root').removeAttribute('data-muxui-motion');
        document.documentElement.style.removeProperty('--muxui-semantic-motion-exit-duration');
      });
    }

    await page.reload({ waitUntil: 'networkidle' });
    await waitForHydration(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCalendar(page);
    const systemReducedImmediate = await readEntryMotion(page);
    assert.equal(systemReducedImmediate.reduced, true, 'system reduced mode marks the popup for reduced exit');
    assert.equal(systemReducedImmediate.opacity, '1', 'system reduced mode leaves the popup visible immediately');
    assert.equal(systemReducedImmediate.transformY, 0, 'system reduced mode leaves the popup at its settled position');
    assert.equal(systemReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced mode starts no meaningful entry animation');
    const systemReduced = await settleEntry(page);
    assert.equal(systemReduced.opacity, '1');
    assert.equal(systemReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'system reduced mode settles without entry movement');
    await capturePopup(page, '/tmp/muxui-date-popover-reduced-light.png');
    await closeReducedCalendar(page, 'system reduced');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
    await openCalendar(page);
    const explicitReducedImmediate = await readEntryMotion(page);
    assert.equal(explicitReducedImmediate.reduced, true, 'explicit reduced mode marks the popup for reduced exit');
    assert.equal(explicitReducedImmediate.opacity, '1', 'explicit reduced mode leaves the popup visible immediately');
    assert.equal(explicitReducedImmediate.transformY, 0, 'explicit reduced mode leaves the popup at its settled position');
    assert.equal(explicitReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'explicit reduced mode starts no meaningful entry animation');
    const explicitReduced = await settleEntry(page);
    assert.equal(explicitReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'explicit reduced mode settles without entry movement');
    await closeReducedCalendar(page, 'explicit reduced');

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'full');
      document.getElementById('root').setAttribute('data-muxui-motion', 'reduced');
    });
    await openCalendar(page);
    const nestedReducedImmediate = await readEntryMotion(page);
    assert.equal(nestedReducedImmediate.reduced, true, 'nested reduced mode marks the popup for reduced exit');
    assert.equal(nestedReducedImmediate.opacity, '1', 'nested reduced mode leaves the popup visible immediately');
    assert.equal(nestedReducedImmediate.transformY, 0, 'nested reduced mode leaves the popup at its settled position');
    assert.equal(nestedReducedImmediate.animations.some(({ duration }) => Number(duration) > 1), false, 'nested reduced mode starts no meaningful entry animation');
    const nestedReduced = await settleEntry(page);
    assert.equal(nestedReduced.animations.some(({ duration }) => Number(duration) > 1), false, 'the popup effective body scope can select reduced mode');
    await closeReducedCalendar(page, 'nested reduced');

    await page.evaluate(() => {
      document.getElementById('root').removeAttribute('data-muxui-motion');
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
      document.documentElement.setAttribute('data-muxui-motion', 'full');
    });
    await openCalendar(page);
    await page.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) > 0));
    await settleEntry(page);
    await capturePopup(page, '/tmp/muxui-date-popover-full-dark.png');
    await page.evaluate(() => window.__muxuiDatePopoverSetOpen(false));
    await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });

    await page.evaluate(() => {
      document.documentElement.setAttribute('data-muxui-motion', 'reduced');
      document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
    });
    await openCalendar(page);
    await settleEntry(page);
    await capturePopup(page, '/tmp/muxui-date-popover-reduced-dark.png');

    assert.deepEqual(errors, [], errors.join('\n'));

    const buttonPage = await browser.newPage();
    await buttonPage.goto(`${url}/button-only.html`, { waitUntil: 'networkidle' });
    await buttonPage.waitForFunction(() => document.documentElement.dataset.muxuiButtonHydrated === 'true');
    const buttonResources = await buttonPage.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    assert.equal(buttonResources.some((name) => /(?:motion|framer-motion)/u.test(name)), false, `Button-only consumer did not load motion: ${buttonResources.join('\n')}`);
    await buttonPage.close();

    const rangePage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const rangeErrors = [];
    rangePage.on('pageerror', (error) => rangeErrors.push(error.message));
    rangePage.on('console', (message) => { if (message.type() === 'error') rangeErrors.push(message.text()); });
    await rangePage.goto(`${url}/date-range-popover-motion.html`, { waitUntil: 'networkidle' });
    await rangePage.waitForFunction(() => document.documentElement.dataset.muxuiDateRangePopoverHydrated === 'true');
    await rangePage.locator('.muxui-date-range-control .muxui-date-trigger').click();
    await rangePage.locator('.muxui-date-popover').waitFor();
    assert.equal(await rangePage.locator('.muxui-date-range-picker-popover').count(), 1, 'DateRangePicker popup carries its canonical family selector');
    await rangePage.waitForFunction(() => document.querySelector('.muxui-date-popover')?.getAnimations().some((animation) => Number(animation.effect?.getComputedTiming().duration) === 200));
    const rangeEntry = await readEntryMotion(rangePage);
    assertEntryMotion(rangeEntry);
    await rangePage.keyboard.press('ArrowRight');
    assert.equal(await rangePage.locator('.muxui-date-popover').count(), 1, 'keyboard calendar navigation keeps the range popup open');
    await closeCalendarWithEscape(rangePage);
    const rangeActive = await rangePage.evaluate(() => ({
      className: document.activeElement?.getAttribute('class'),
      tagName: document.activeElement?.tagName,
    }));
    assert.equal(rangeActive.className?.includes('muxui-date-trigger'), true, `range Escape restores trigger focus: ${JSON.stringify(rangeActive)}`);
    assert.deepEqual(rangeErrors, [], rangeErrors.join('\n'));
    await rangePage.close();
  } finally {
    await browser?.close();
    await close();
  }
});
