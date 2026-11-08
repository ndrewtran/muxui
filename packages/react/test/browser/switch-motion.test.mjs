import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Switch } from '../../src/fields.ts';
import { SwitchField } from '../../src/supplemental/switch-field.ts';
import { SwitchMotionFixture } from '../fixtures/switch-motion-fixture.mjs';
import { awaitFontsAndFrames, launchBrowser, packageRoot, pageShell, startServer } from './harness.mjs';

function indicatorState(page, selector = '#primary-switch') {
  return page.locator(`${selector} .muxui-switch__indicator`).evaluate((node) => {
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
    const indicator = node.querySelector('.muxui-switch__indicator');
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
    const node = document.querySelector(`${target} .muxui-switch__indicator`);
    const switchNode = document.querySelector(`${target} .muxui-switch`);
    return node && switchNode && switchNode.hasAttribute('data-muxui-state-selected') === expected
      && !node.style.transform && node.getAnimations().every((animation) => animation.playState === 'finished');
  }, { target: selector, expected: expectedSelected });
}

test('Switch motion preserves native states, press feedback, RTL travel, and reduced motion', { timeout: 90_000 }, async () => {
  const html = pageShell({ attributes: 'data-muxui-motion="full" data-muxui-color-scheme="light"', head: '<link rel="stylesheet" href="/packages/react/generated/styles.css">', body: `<div id="root">${renderToString(React.createElement(SwitchMotionFixture))}</div>`, entry: '/packages/react/test/fixtures/switch-motion-browser-entry.mjs' });
  const { url, close } = await startServer({ root: 'repository', entries: ['packages/react/test/fixtures/switch-motion-browser-entry.mjs'], pages: { '/switch-motion.html': html } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 720, height: 600 }, reducedMotion: 'no-preference' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/switch-motion.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.switchMotionReady === 'true');
    await awaitFontsAndFrames(page);

    assert.equal(errors.length, 0, errors.join('\n'));
    // Five Switches, and the SwitchField Button, which carries Switch's class.
    assert.equal(await page.locator('.muxui-switch').count(), 6);
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
    await page.waitForFunction(() => document.querySelector('#primary-switch .muxui-switch')?.hasAttribute('data-muxui-state-pressed'));
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch__indicator');
      if (!node) return false;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return Math.hypot(matrix.m11, matrix.m12) > 1.02 && Math.hypot(matrix.m21, matrix.m22) < 0.98;
    });
    const pressed = await indicatorState(page);
    assert.ok(pressed.scaleX > 1.02 && pressed.scaleY < 0.98, `press state compresses the thumb: ${JSON.stringify(pressed)}`);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch__indicator');
      return node?.style.transform && node.getAnimations().some((animation) => animation.playState === 'running');
    });
    const moving = await indicatorState(page);
    assert.ok(moving.animations.includes('running'), `selection uses an in-flight Motion animation: ${JSON.stringify(moving)}`);
    await waitForSettled(page, true);
    const selected = await indicatorState(page);
    assert.ok(Math.abs(selected.x - 18) < 1, `selected state uses the balanced 18px travel: ${JSON.stringify(selected)}`);
    assert.equal(selected.inlineTransform, '');

    // SwitchField's Thumb is the same motion indicator: it presses in, then travels the same 18px with a Motion animation.
    const fieldInput = page.locator('#primary-field input');
    await fieldInput.focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-field .muxui-switch__indicator');
      if (!node) return false;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return Math.hypot(matrix.m11, matrix.m12) > 1.02 && Math.hypot(matrix.m21, matrix.m22) < 0.98;
    });
    await page.keyboard.up('Space');
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-field .muxui-switch__indicator');
      return node?.style.transform && node.getAnimations().some((animation) => animation.playState === 'running');
    });
    await waitForSettled(page, true, '#primary-field');
    const fieldSelected = await indicatorState(page, '#primary-field');
    assert.ok(Math.abs(fieldSelected.x - 18) < 1, `SwitchField's selected thumb travels the same 18px: ${JSON.stringify(fieldSelected)}`);
    assert.equal(fieldSelected.inlineTransform, '');

    await primaryInput.focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#primary-switch .muxui-switch')?.hasAttribute('data-muxui-state-pressed'));
    await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch__indicator');
      return node?.hasAttribute('data-muxui-motion-pressed')
        && node.getAnimations().some((animation) => animation.playState === 'running'
          && animation.effect?.getKeyframes().some((frame) => frame.transform !== undefined));
    });
    const pressedAnimation = await page.locator('#primary-switch .muxui-switch__indicator').evaluate((node) => {
      const animation = node.getAnimations().find((candidate) => candidate.playState === 'running'
        && candidate.effect?.getKeyframes().some((frame) => frame.transform !== undefined));
      if (!animation) return null;
      window.__switchPressAnimationOutcome = animation.finished.then(
        () => 'finished',
        (error) => error?.name === 'AbortError' ? 'cancelled' : `rejected:${error?.name ?? 'unknown'}`,
      );
      window.__switchPressAnimationNode = node;
      window.__switchReducedStableFrames = 0;
      return { playState: animation.playState, keyframes: animation.effect?.getKeyframes() };
    });
    assert.ok(pressedAnimation?.playState === 'running' && pressedAnimation.keyframes?.some((frame) => frame.transform !== undefined),
      'pressed state starts a running transform spring before system reduced motion is enabled');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => window.__switchPressAnimationOutcome), 'cancelled',
      'system reduced motion cancels the active press animation instead of allowing it to finish');
    const systemReducedPressHandle = await page.waitForFunction(() => {
      const node = document.querySelector('#primary-switch .muxui-switch__indicator');
      if (!node) {
        window.__switchReducedStableFrames = 0;
        return false;
      }
      const initialMatrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const ready = node.closest('.muxui-switch')?.hasAttribute('data-muxui-state-pressed')
        && !node.hasAttribute('data-muxui-motion-pressed') && !node.style.transform
        && Math.abs(Math.hypot(initialMatrix.m11, initialMatrix.m12) - 1) < 0.001
        && Math.abs(Math.hypot(initialMatrix.m21, initialMatrix.m22) - 1) < 0.001
        && node.getAnimations().length === 0
        && node === window.__switchPressAnimationNode && node.isConnected;
      if (!ready) {
        window.__switchReducedStableFrames = 0;
        return false;
      }
      window.__switchReducedStableFrames += 1;
      if (window.__switchReducedStableFrames < 2) return false;
      node.setAttribute('data-muxui-motion-pressed', '');
      const style = getComputedStyle(node);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const result = {
        scaleX: Math.hypot(matrix.m11, matrix.m12),
        scaleY: Math.hypot(matrix.m21, matrix.m22),
      };
      node.removeAttribute('data-muxui-motion-pressed');
      return result;
    }, undefined, { timeout: 3000 });
    const systemReducedPress = await systemReducedPressHandle.jsonValue();
    assert.ok(Math.abs(systemReducedPress.scaleX - 1) < 0.001 && Math.abs(systemReducedPress.scaleY - 1) < 0.001,
      `system reduced motion overrides an active press marker: ${JSON.stringify(systemReducedPress)}`);
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
      const node = document.querySelector('#primary-switch .muxui-switch__indicator');
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      return switchNode && !switchNode.hasAttribute('data-muxui-state-selected') && node?.style.transform
        && node.getAnimations().some((animation) => animation.playState === 'running');
    });
    await page.evaluate(() => document.getElementById('switch-motion-fixture').setAttribute('data-muxui-motion', 'reduced'));
    const explicitReducedPress = await page.locator('#primary-switch .muxui-switch__indicator').evaluate((node) => {
      node.setAttribute('data-muxui-motion-pressed', '');
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const result = {
        scaleX: Math.hypot(matrix.m11, matrix.m12),
        scaleY: Math.hypot(matrix.m21, matrix.m22),
      };
      node.removeAttribute('data-muxui-motion-pressed');
      return result;
    });
    assert.ok(Math.abs(explicitReducedPress.scaleX - 1) < 0.001 && Math.abs(explicitReducedPress.scaleY - 1) < 0.001,
      `explicit reduced motion overrides an active press marker: ${JSON.stringify(explicitReducedPress)}`);
    await page.waitForFunction(() => {
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      const indicator = document.querySelector('#primary-switch .muxui-switch__indicator');
      return switchNode && !switchNode.hasAttribute('data-muxui-state-selected') && indicator && !indicator.style.transform;
    });
    const reducedOff = await indicatorState(page);
    assert.equal(reducedOff.animations.length, 0, 'explicit reduced motion stops an in-flight Motion animation');
    assert.ok(Math.abs(reducedOff.x) < 1, `reduced motion settles the interrupted state immediately: ${JSON.stringify(reducedOff)}`);

    await primaryInput.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const switchNode = document.querySelector('#primary-switch .muxui-switch');
      const indicator = document.querySelector('#primary-switch .muxui-switch__indicator');
      return switchNode?.hasAttribute('data-muxui-state-selected') && indicator && !indicator.style.transform;
    });
    const reducedOn = await indicatorState(page);
    assert.equal(reducedOn.animations.length, 0, 'reduced motion keeps subsequent selection changes instant');
    assert.ok(Math.abs(reducedOn.x - 18) < 1, `reduced motion settles the selected state immediately: ${JSON.stringify(reducedOn)}`);

    assert.equal(errors.length, 0, errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

// SwitchField draws its switch with Switch's own classes and component tokens, so each pair below must paint the
// same track, thumb, label and text on any host. Cases cover the rest states; `variants` cover the pointer, focus,
// press, scheme, direction and media states. State attributes are set by hand on both: the CSS reads only them.
// The last case wraps a long label in a narrow column under a root that sets its own line height: the label's lines must keep
// Mux UI's line height in both, not the root's.
const parityCases = [
  ['off', {}],
  ['on', { selected: true }],
  ['invalid off', { invalid: true }],
  ['invalid on', { selected: true, invalid: true }],
  ['disabled on', { selected: true, disabled: true }],
  ['wrapped label off', { label: 'A long notification label which wraps over multiple lines', width: 200, style: { lineHeight: 2.5 } }],
];

function SwitchParityFixture() {
  const copy = { description: 'Send product updates by email.', error: 'Notifications must be on.' };
  return React.createElement('main', null, parityCases.map(([name, { selected = false, invalid, disabled, label = 'Notifications', width = 240, style }]) => React.createElement('section', { key: name, 'data-case': name, style: { display: 'flex', gap: 48, width: 560, marginBlock: 16 } },
    React.createElement('div', { 'data-kind': 'switch', style: { width } },
      React.createElement(Switch, { label, description: copy.description, errorMessage: copy.error, defaultSelected: selected, invalid, disabled, style })),
    React.createElement('div', { 'data-kind': 'field', style: { width } },
      React.createElement(SwitchField.Root, { defaultChecked: selected, invalid, disabled, style },
        React.createElement(SwitchField.Button, null, React.createElement(SwitchField.Thumb), label),
        React.createElement(SwitchField.Description, null, copy.description),
        React.createElement(SwitchField.Error, null, copy.error))))));
}

const parityVariants = [
  { name: 'rest' },
  { name: 'hover', labelAttributes: ['data-muxui-state-hovered'] },
  { name: 'focus-visible', labelAttributes: ['data-muxui-state-focus-visible'] },
  { name: 'pressed', labelAttributes: ['data-muxui-state-pressed'], thumbAttributes: ['data-muxui-motion-pressed'] },
  { name: 'dark', scheme: 'dark' },
  { name: 'rtl', dir: 'rtl' },
  { name: 'forced colours', media: { forcedColors: 'active' } },
  { name: 'reduced motion', media: { reducedMotion: 'reduce' } },
];

// The two ways a host can lay down the box model: none (Storybook) and a layered reset that reaches pseudo-elements (Starlight).
const parityHosts = [
  ['bare page', ''],
  ['reset page', '@layer host-reset, muxui.tokens, muxui.components, muxui.utilities;\n@layer host-reset { *, *::before, *::after { box-sizing: border-box; margin: 0; } }'],
];

/** Runs in the page: applies one variant, then measures each pair's track, thumb, label, description and error. */
function measureParity({ scheme = 'light', dir = 'ltr', labelAttributes = [], thumbAttributes = [] }) {
  document.documentElement.setAttribute('data-muxui-color-scheme', scheme);
  document.documentElement.setAttribute('dir', dir);
  // The markup is not hydrated, so none of these is present until a variant sets it.
  for (const node of document.querySelectorAll('[data-muxui-state-hovered], [data-muxui-state-focus-visible], [data-muxui-state-pressed], [data-muxui-motion-pressed]')) {
    for (const name of ['data-muxui-state-hovered', 'data-muxui-state-focus-visible', 'data-muxui-state-pressed', 'data-muxui-motion-pressed']) node.removeAttribute(name);
  }
  for (const label of document.querySelectorAll('.muxui-switch, .muxui-switch-field__button')) {
    for (const name of labelAttributes) label.setAttribute(name, '');
    for (const name of thumbAttributes) label.querySelector('.muxui-switch__indicator, .muxui-switch-field__thumb').setAttribute(name, '');
  }
  const round = (value) => Math.round(Number.parseFloat(value) * 100) / 100;
  const pick = (style, names) => Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  const measure = (section, kind) => {
    const root = section.querySelector(`[data-kind="${kind}"] .muxui-switch-field`);
    const field = kind === 'field';
    const label = root.querySelector(field ? '.muxui-switch-field__button' : '.muxui-switch');
    const thumb = label.querySelector(field ? '.muxui-switch-field__thumb' : '.muxui-switch__indicator');
    const track = getComputedStyle(label, '::before');
    const rtl = getComputedStyle(label).direction === 'rtl';
    const box = label.getBoundingClientRect();
    const edge = rtl ? box.right : box.left;
    // Distances run from the track's inline start, whichever way the page reads.
    const along = (x) => round(rtl ? edge - x : x - edge);
    const trackWidth = round(track.width) + (track.boxSizing === 'border-box' ? 0 : round(track.borderLeftWidth) * 2);
    const trackHeight = round(track.height) + (track.boxSizing === 'border-box' ? 0 : round(track.borderTopWidth) * 2);
    const thumbBox = thumb.getBoundingClientRect();
    const text = document.createTreeWalker(label, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.selectNodeContents(text);
    const textBox = range.getBoundingClientRect();
    const below = (selector) => {
      const node = root.querySelector(selector);
      if (!node) return null;
      const nodeBox = node.getBoundingClientRect();
      return { x: along(rtl ? nodeBox.right : nodeBox.left), y: round(nodeBox.top - box.bottom), ...pick(getComputedStyle(node), ['color', 'font-family', 'font-size', 'line-height', 'margin-left', 'margin-right']) };
    };
    return {
      track: { width: trackWidth, height: trackHeight, ...pick(track, ['box-sizing', 'border-top-width', 'border-top-color', 'background-color', 'background-image', 'border-radius', 'box-shadow', 'transition-property']) },
      thumb: { start: along(rtl ? thumbBox.right : thumbBox.left), end: round(trackWidth - along(rtl ? thumbBox.left : thumbBox.right)), width: round(thumbBox.width), height: round(thumbBox.height), centre: round(thumbBox.top + thumbBox.height / 2 - (box.top + box.height / 2)), ...pick(getComputedStyle(thumb), ['background-color', 'box-shadow', 'border-radius', 'transform', 'transition-property']) },
      // `text` is the element that holds the label's text: Switch's label span, or the SwitchField Button itself.
      label: { textStart: along(rtl ? textBox.right : textBox.left), height: round(box.height), ...pick(getComputedStyle(label), ['color', 'opacity', 'cursor', 'font-family', 'font-size', 'font-weight', 'padding-inline-start', 'column-gap', 'min-block-size']), text: pick(getComputedStyle(text.parentElement), ['color', 'font-family', 'font-size', 'font-weight', 'line-height']) },
      description: below(field ? '.muxui-switch-field__description' : '.muxui-field-description'),
      error: below(field ? '.muxui-switch-field__error' : '.muxui-field-error'),
    };
  };
  return [...document.querySelectorAll('[data-case]')].map((section) => ({ name: section.dataset.case, switch: measure(section, 'switch'), field: measure(section, 'field') }));
}

test('SwitchField paints the same switch as Switch on a bare page and under a host reset', { timeout: 90_000 }, async () => {
  const styles = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const markup = renderToString(React.createElement(SwitchParityFixture));
  let browser;
  try {
    browser = await launchBrowser();
    for (const [host, reset] of parityHosts) {
      const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
      await page.setContent(pageShell({ attributes: 'data-muxui-color-scheme="light"', head: `<style>${reset}</style><style>${styles}</style>`, body: markup }));
      await awaitFontsAndFrames(page);
      for (const variant of parityVariants) {
        await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference', ...variant.media });
        const rows = await page.evaluate(measureParity, variant);
        assert.equal(rows.length, parityCases.length);
        for (const { name, switch: expected, field } of rows) {
          assert.deepEqual(field, expected, `${host}, ${variant.name}, ${name}: SwitchField differs from Switch`);
          if (variant.name !== 'rest') continue;
          // Switch's balanced geometry: a 40x22 track whose 14px thumb sits 4px from the edge it rests against.
          assert.deepEqual([field.track.width, field.track.height, field.thumb.width, field.thumb.height], [40, 22, 14, 14], `${host}, ${name}: track and thumb size`);
          assert.equal(name.endsWith('off') ? field.thumb.start : field.thumb.end, 4, `${host}, ${name}: thumb inset`);
          // Mux UI's text line height is 1.5 x 16px, whatever the root around the label sets, and the wrapped label has more than one line.
          assert.equal(field.label.text['line-height'], '24px', `${host}, ${name}: label line height`);
          if (name.startsWith('wrapped')) assert.ok(field.label.height >= 48 && field.label.height % 24 === 0, `${host}, ${name}: ${field.label.height}px is whole 24px lines, at least two`);
        }
      }
      await page.close();
    }
  } finally {
    await browser?.close();
  }
});
