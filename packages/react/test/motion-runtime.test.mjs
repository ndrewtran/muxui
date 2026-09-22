import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { resolvedMotionSpring, resolvedMotionTransition } from '../src/motion.mjs';

const generatedStyles = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');

function resolveEasing(easing) {
  const dom = new JSDOM('<!doctype html><div id="motion"></div>');
  const node = dom.window.document.querySelector('#motion');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-duration', '200ms');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-easing', easing);
  const previousWindow = globalThis.window;
  globalThis.window = dom.window;
  try {
    return resolvedMotionTransition(node, null)?.ease ?? null;
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    dom.window.close();
  }
}

function resolveSpring() {
  const dom = new JSDOM('<!doctype html><div id="motion"></div>');
  const node = dom.window.document.querySelector('#motion');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-duration', '600ms');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-easing', 'linear');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-spring-visual-duration', '2s');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-spring-bounce', '0.2');
  const previousWindow = globalThis.window;
  globalThis.window = dom.window;
  try {
    return resolvedMotionSpring(node, null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    dom.window.close();
  }
}

test('motion adapter accepts step easing and rejects malformed raw CSS curves', () => {
  const stepStart = resolveEasing('step-start');
  assert.equal(stepStart?.(0), 1);
  assert.equal(stepStart?.(0.5), 1);

  const stepEnd = resolveEasing('step-end');
  assert.equal(stepEnd?.(0), 0);
  assert.equal(stepEnd?.(1), 1);

  assert.equal(resolveEasing('linear(0,,1)'), null);
  assert.equal(resolveEasing('cubic-bezier(-0.1, 0, 1, 1)'), null);
  assert.equal(resolveEasing('cubic-bezier(0, 0, 1.1, 1)'), null);
});

test('resolved springs retain total duration separately from visual duration', () => {
  const spring = resolveSpring();
  assert.equal(spring?.duration, 0.6);
  assert.equal(spring?.visualDuration, 2);
  assert.equal(spring?.bounce, 0.2);
});

test('generated reduced motion projection carries derived spring duration and easing', () => {
  const reduced = generatedStyles.match(/\[data-muxui-motion='reduced'\] \{([\s\S]*?)\n\}/u)?.[1] ?? '';
  assert.match(reduced, /--muxui-semantic-motion-state-transition-spring-duration: 0ms;/u);
  assert.match(reduced, /--muxui-semantic-motion-state-transition-spring-easing: linear;/u);
  assert.match(reduced, /--muxui-semantic-motion-dismiss-transition-spring-duration: 0ms;/u);
  assert.match(reduced, /--muxui-semantic-motion-dismiss-transition-spring-easing: linear;/u);
});

test('system reduced motion takes precedence before spring settings are consumed', () => {
  const dom = new JSDOM('<!doctype html><div id="motion"></div>');
  const node = dom.window.document.querySelector('#motion');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-duration', '200ms');
  node.style.setProperty('--muxui-semantic-motion-interaction-transition-easing', 'ease');
  const previousWindow = globalThis.window;
  dom.window.matchMedia = (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' });
  globalThis.window = dom.window;
  try {
    assert.equal(resolvedMotionSpring(node, null), null);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    dom.window.close();
  }
});
