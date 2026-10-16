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
  for (const role of ['state', 'dismiss', 'modal', 'modal-dismiss']) {
    assert.match(reduced, new RegExp(`--muxui-semantic-motion-${role}-transition-spring-duration: 0ms;`, 'u'), role);
    assert.match(reduced, new RegExp(`--muxui-semantic-motion-${role}-transition-spring-easing: linear;`, 'u'), role);
  }
});

const rootBlock = generatedStyles.match(/:root \{([\s\S]*?)\n\}/u)?.[1] ?? '';
const rootDeclarations = new Map([...rootBlock.matchAll(/^ {2}(--[a-z0-9-]+): (.+);$/gmu)].map(([, name, value]) => [name, value]));
const resolveVar = (value) => value.replace(/var\((--[a-z0-9-]+)\)/gu, (_, name) => resolveVar(rootDeclarations.get(name)));
const SPRING_ROLES = ['interaction', 'state', 'dismiss', 'reveal', 'content-resize', 'modal', 'modal-dismiss'];

test('shipped composites are each role spring settle duration and curve', () => {
  for (const role of SPRING_ROLES) {
    const prefix = `--muxui-semantic-motion-${role}-transition`;
    assert.equal(rootDeclarations.get(prefix), `var(${prefix}-duration) var(${prefix}-easing)`, role);
    assert.equal(rootDeclarations.get(`${prefix}-duration`), `var(${prefix}-spring-duration)`, role);
    assert.equal(rootDeclarations.get(`${prefix}-easing`), `var(${prefix}-spring-easing)`, role);
    assert.match(resolveVar(rootDeclarations.get(`${prefix}-easing`)), /^linear\(0, .+, 1\)$/u, role);
  }
});

test('every shipped CSS transition and animation names a role composite', () => {
  // Progress roles keep their own duration and easing; their loops are not springs.
  const declarations = [...generatedStyles.matchAll(/(?<![-\w])(?:transition|animation):[^;{}]*;/gu)]
    .map(([declaration]) => declaration)
    .filter((declaration) => !/^(?:transition|animation):\s*none\b/u.test(declaration) && !declaration.includes('progress-'));
  assert.ok(declarations.length > 100, 'the scan reaches the shipped consumers');
  const offenders = declarations.filter((declaration) => !/-transition-duration\b/u.test(declaration) || !/-transition-easing\b/u.test(declaration));
  assert.deepEqual(offenders, []);
});

function shippedMotionNode() {
  const dom = new JSDOM('<!doctype html><div id="motion"></div>');
  const node = dom.window.document.querySelector('#motion');
  for (const role of SPRING_ROLES) {
    for (const suffix of ['duration', 'easing', 'spring-visual-duration', 'spring-bounce']) {
      const name = `--muxui-semantic-motion-${role}-transition-${suffix}`;
      node.style.setProperty(name, resolveVar(rootDeclarations.get(name)));
    }
  }
  return { dom, node };
}

function withWindow(dom, read) {
  const previousWindow = globalThis.window;
  globalThis.window = dom.window;
  try {
    return read();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    dom.window.close();
  }
}

test('JS springs keep the perceived duration while the composite carries the settle', () => {
  const { dom, node } = shippedMotionNode();
  const [state, modalEnter, interaction] = withWindow(dom, () => [
    resolvedMotionSpring(node, null, 'state', 'interaction'),
    resolvedMotionSpring(node, null, 'modal-enter', 'modal'),
    resolvedMotionSpring(node, null, 'interaction', 'interaction'),
  ]);
  assert.deepEqual([state.visualDuration, state.duration, state.bounce], [0.12, 0.25, 0]);
  assert.deepEqual([modalEnter.visualDuration, modalEnter.duration, modalEnter.bounce], [0.18, 0.4, 0]);
  assert.deepEqual([interaction.visualDuration, interaction.duration], [0.15, 0.35]);
  assert.equal(state.opacity.duration, state.duration);
  assert.ok(state.opacity.ease(0.15) > 0.15, 'opacity follows the front-loaded spring curve');
  assert.equal(state.opacity.ease(1), 1);
});

test('tween roles run the composite settle and spring curve', () => {
  const { dom, node } = shippedMotionNode();
  const [dismiss, modalDismiss] = withWindow(dom, () => [
    resolvedMotionTransition(node, null, 'exit', 'dismiss'),
    resolvedMotionTransition(node, null, 'exit', 'modal'),
  ]);
  assert.equal(dismiss.duration, 0.25);
  assert.equal(modalDismiss.duration, 0.25);
  assert.equal(dismiss.ease(0), 0);
  assert.equal(dismiss.ease(1), 1);
  assert.ok(dismiss.ease(0.15) > 0.15);
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
