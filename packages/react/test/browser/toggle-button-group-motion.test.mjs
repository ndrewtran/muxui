import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { ToggleButtonGroupMotionFixture } from '../fixtures/toggle-button-group-motion-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function documentHtml() {
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: `<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/components.css"><style>
    :root { --muxui-semantic-motion-state-duration: 1200ms; --muxui-semantic-motion-state-transition-duration: 1200ms; --muxui-semantic-motion-state-transition-spring-visual-duration: 1200ms; }
    body { margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong); font-family: system-ui, sans-serif; }
    main { display: grid; gap: 20px; max-width: 760px; }
    section { display: grid; gap: 8px; justify-items: start; }
    output { font-size: 12px; }
  </style>`, body: `<div id="root">${renderToString(React.createElement(ToggleButtonGroupMotionFixture))}</div>`, entry: '/test/fixtures/toggle-button-group-motion-browser-entry.mjs' });
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

// Serialized into the page by recordFrames, so it must stay self-contained.
function sampleTravel(selector) {
  const root = document.querySelector(selector);
  const buttons = [...root.querySelectorAll(':scope > .muxui-toggle-button')];
  const selected = buttons.filter((button) => button.hasAttribute('data-selected')
    || button.getAttribute('aria-checked') === 'true'
    || button.getAttribute('aria-pressed') === 'true');
  const indicator = root.querySelector('.muxui-toggle-button-group-motion-indicator');
  const rect = (node) => {
    const value = node?.getBoundingClientRect();
    return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
  };
  if (!indicator) return null;
  return {
    trailing: root.hasAttribute('data-muxui-toggle-motion-trailing'),
    buttonBackgrounds: buttons.map((button) => getComputedStyle(button).backgroundColor),
    indicator: rect(indicator),
    selectedRects: selected.map(rect),
  };
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
  const { url, close } = await startServer({ entries: ['test/fixtures/toggle-button-group-motion-browser-entry.mjs'], pages: { '/toggle-button-group-motion.html': documentHtml() } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/toggle-button-group-motion.html`, { waitUntil: 'networkidle' });
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
    await page.waitForFunction((selector) => getComputedStyle(document.querySelectorAll(`${selector} > .muxui-toggle-button`)[1]).backgroundColor !== 'rgba(0, 0, 0, 0)', primary);
    const restingUnselectedHover = await readGroup(page, primary);
    assert.notEqual(restingUnselectedHover.buttonBackgrounds[1], 'rgba(0, 0, 0, 0)', 'unselected hover should retain its resting background');

    const travelRecording = await recordFrames(page, sampleTravel, primary);
    await page.evaluate(() => window.__toggleSetPrimary('two'));
    await waitForSelected(page, primary, 'Two');
    await waitForAlignment(page, primary);
    const travelFrames = (await travelRecording.stop()).filter(({ trailing }) => trailing);
    // Assert on the widest trailing frame: the stretch peak is brief.
    const inFlight = travelFrames.reduce((widest, frame) => (frame.indicator.width > (widest?.indicator.width ?? -1) ? frame : widest), null);
    assert.equal(inFlight?.trailing, true, `trailing travel is recorded: ${JSON.stringify(travelFrames)}`);
    assert.equal(inFlight.buttonBackgrounds[1], 'rgba(0, 0, 0, 0)', 'hover paint should not cover the outgoing moving fill');
    assert.ok(inFlight.indicator && initial.indicator);
    assert.ok(inFlight.indicator.left !== initial.indicator.left, 'fill should physically move toward the next button');
    assert.ok(inFlight.indicator.width > Math.max(initial.indicator.width, inFlight.selectedRects[0].width) + 0.2,
      `trailing travel should briefly stretch the fill: ${JSON.stringify({ initial, inFlight })}`);
    const settledTwo = await readGroup(page, primary);
    assertRectsClose(settledTwo.indicator, settledTwo.selectedRects[0], 'fill should settle exactly on target');

    // Reverse in the same frame that records the moving fill, then read the fill
    // one frame after the reversal commits.
    const reversalRecording = await recordFrames(page, (selector, state) => {
      const root = document.querySelector(selector);
      const rect = root.querySelector('.muxui-toggle-button-group-motion-indicator')?.getBoundingClientRect();
      const indicator = rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
      const selected = [...root.querySelectorAll(':scope > .muxui-toggle-button')]
        .find((button) => button.hasAttribute('data-selected') || button.getAttribute('aria-checked') === 'true' || button.getAttribute('aria-pressed') === 'true')
        ?.textContent.trim();
      if (!state.started) {
        state.started = true;
        state.startLeft = indicator?.left;
        window.__toggleSetPrimary('long');
        return null;
      }
      if (!state.reversed) {
        if (selected !== 'Longer selection' || !indicator || Math.abs(indicator.left - state.startLeft) < 0.5) return null;
        state.reversed = true;
        window.__toggleSetPrimary('one');
        return { phase: 'beforeReverse', indicator };
      }
      if (selected !== 'One' || state.afterReverse) return null;
      state.committedFrames = (state.committedFrames ?? 0) + 1;
      if (state.committedFrames < 2) return null;
      state.afterReverse = true;
      return { phase: 'afterReverse', indicator };
    }, primary);
    await reversalRecording.waitFor(({ state }) => state.afterReverse);
    const reversalFrames = await reversalRecording.stop();
    const beforeReverse = reversalFrames.find(({ phase }) => phase === 'beforeReverse');
    const afterReverse = reversalFrames.find(({ phase }) => phase === 'afterReverse');
    assert.ok(beforeReverse?.indicator && afterReverse?.indicator);
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
    // Negative check: a required group must not clear its only selection, which has no event to await.
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
    // Negative check: a disabled group must not change selection, which has no event to await.
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
    await close();
  }
});
