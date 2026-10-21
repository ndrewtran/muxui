import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Calendar, GridList, ListBox, Menu, RadioGroup, ToggleButtonGroup, Tree } from '../src/collections.mjs';
import { ToggleButton } from '../src/components.mjs';
import {
  attachRef, collectAncestors, observeAncestorAttributes, sameGeometry, transformFrom, useRootRef,
} from '../src/motion-geometry.mjs';
import { Avatar } from '../src/supplemental/avatar.ts';
import { Image } from '../src/supplemental/image.ts';
import { createDom } from './support/dom.mjs';

const h = React.createElement;
// MutationObserver delivers its records in a microtask; one macrotask turn covers it.
const flush = () => new Promise((resolve) => setImmediate(resolve));

// Recorded choice: one attach, detach, and callback-ref cleanup behavior, with
// React 19 semantics. A callback ref's returned cleanup runs on detach in place
// of ref(null); any other callback ref gets null; an object ref is reset.
test('attachRef attaches to object and callback refs and detaches the way React 19 does', () => {
  const object = { current: null };
  const node = {};
  const detachObject = attachRef(object, node);
  assert.equal(object.current, node);
  detachObject();
  assert.equal(object.current, null);

  const plain = [];
  const detachPlain = attachRef((value) => { plain.push(value); }, node);
  detachPlain();
  assert.deepEqual(plain, [node, null], 'a callback ref without a cleanup is called with null on detach');

  const calls = [];
  const detachCleanup = attachRef((value) => {
    calls.push(['ref', value]);
    return () => calls.push(['cleanup']);
  }, node);
  assert.deepEqual(calls, [['ref', node]]);
  detachCleanup();
  assert.deepEqual(calls, [['ref', node], ['cleanup']], 'a returned cleanup runs instead of ref(null)');

  for (const missing of [undefined, null]) assert.doesNotThrow(() => attachRef(missing, node)());
});

// Recorded choice: one 0.5 px tolerance, exclusive. Boxes half a pixel apart on
// any axis are different.
test('sameGeometry treats a half pixel difference on any axis as different', () => {
  const box = { left: 10, top: 20, width: 100, height: 40 };
  assert.equal(sameGeometry(box, { ...box }), true);
  assert.equal(sameGeometry(box, { ...box, left: 10.49 }), true, 'below half a pixel is the same');
  for (const axis of ['left', 'top', 'width', 'height']) {
    assert.equal(sameGeometry(box, { ...box, [axis]: box[axis] + 0.5 }), false, `${axis} half a pixel apart`);
    assert.equal(sameGeometry(box, { ...box, [axis]: box[axis] - 0.5 }), false, `${axis} half a pixel apart, the other way`);
  }
  assert.equal(sameGeometry(box, { ...box, left: 10.5, top: 20.5 }), false);
});

test('sameGeometry is false rather than throwing when either box is missing', () => {
  const box = { left: 0, top: 0, width: 1, height: 1 };
  for (const [first, second] of [[null, box], [box, null], [undefined, undefined], [box, undefined]]) {
    assert.equal(sameGeometry(first, second), false);
  }
});

// Recorded choice: one FLIP transform, unchanged from the four identical copies.
test('transformFrom maps the target onto the current box and ignores a zero-sized target scale', () => {
  const current = { left: 30, top: 50, width: 200, height: 20 };
  assert.equal(transformFrom(current, { left: 10, top: 20, width: 100, height: 40 }), 'translate3d(20px, 30px, 0) scale(2, 0.5)');
  assert.equal(transformFrom(current, { left: 30, top: 50, width: 0, height: 0 }), 'translate3d(0px, 0px, 0) scale(1, 1)');
});

// Recorded choice: one ancestor enumeration (nearest first, deduplicated, including the element itself) for every reduced-motion scope watcher.
test('collectAncestors lists each element and its ancestors once, nearest first', () => {
  const { restore } = createDom('<div id="outer"><div id="mid"><span id="a"></span><span id="b"></span></div></div>');
  try {
    const [a, b] = [document.querySelector('#a'), document.querySelector('#b')];
    const ids = collectAncestors(a, b, null).map((node) => node.id || node.localName);
    assert.deepEqual(ids, ['a', 'mid', 'outer', 'body', 'html', 'b']);
    assert.deepEqual(collectAncestors(), []);
  } finally {
    restore();
  }
});

test('observeAncestorAttributes reports changes on the elements and their ancestors until stopped', async () => {
  const { restore } = createDom('<div id="outer"><span id="inner"></span></div>');
  try {
    const seen = [];
    const outer = document.querySelector('#outer');
    const stop = observeAncestorAttributes([document.querySelector('#inner'), null], ['data-scope'], () => seen.push('change'));
    outer.setAttribute('data-other', 'x');
    await flush();
    assert.deepEqual(seen, [], 'only the named attributes are watched');
    outer.setAttribute('data-scope', 'reduced');
    await flush();
    assert.deepEqual(seen, ['change']);
    stop();
    outer.setAttribute('data-scope', 'full');
    await flush();
    assert.deepEqual(seen, ['change'], 'stopping disconnects the watcher');
  } finally {
    restore();
  }
});

async function mount(element) {
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const container = document.querySelector('#root');
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    rerender: (next) => act(async () => root.render(next)),
    async unmount() {
      await act(async () => root.unmount());
      env.restore();
    },
  };
}

test('useRootRef tracks the node in state and forwards it, running a returned cleanup on detach', async () => {
  const roots = [];
  const calls = [];
  const forwarded = (node) => {
    calls.push(['ref', node?.localName ?? null]);
    return () => calls.push(['cleanup']);
  };
  function Host({ rootRef }) {
    const [root, setRootRef] = useRootRef(rootRef);
    roots.push(root?.localName ?? null);
    return h('section', { ref: setRootRef });
  }
  const view = await mount(h(Host, { rootRef: forwarded }));
  assert.equal(roots.at(-1), 'section', 'the node reaches state');
  assert.deepEqual(calls, [['ref', 'section']]);

  const swapped = [];
  await view.rerender(h(Host, { rootRef: (node) => { swapped.push(node?.localName ?? null); } }));
  assert.deepEqual(calls, [['ref', 'section'], ['cleanup']], 'replacing the forwarded ref cleans up the old one');
  assert.deepEqual(swapped, ['section'], 'and attaches the new one');
  assert.equal(roots.at(-1), 'section');

  await view.unmount();
  assert.deepEqual(swapped, ['section', null], 'a plain callback ref still receives null on unmount');
  assert.deepEqual(calls, [['ref', 'section'], ['cleanup']], 'and the replaced ref is not called again');
});

const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
const hosts = [
  ['ListBox', (ref) => h(ListBox, { 'aria-label': 'List', items, ref })],
  ['GridList', (ref) => h(GridList, { 'aria-label': 'Grid', items, ref })],
  ['Menu', (ref) => h(Menu, { 'aria-label': 'Menu', items, ref })],
  ['Tree', (ref) => h(Tree, { 'aria-label': 'Tree', items, ref })],
  ['RadioGroup', (ref) => h(RadioGroup, { 'aria-label': 'Radios', options: [{ value: 'a', label: 'Alpha' }], ref })],
  ['ToggleButtonGroup', (ref) => h(ToggleButtonGroup, { 'aria-label': 'Toggles', ref }, h(ToggleButton, { id: 'a' }, 'Alpha'))],
  ['Calendar', (ref) => h(Calendar, { label: 'Calendar', value: '2026-08-26', ref })],
  ['Avatar.Image', (ref) => h(Avatar.Root, null, h(Avatar.Image, { src: '/avatar.svg', alt: 'Alex', ref }))],
  ['Image', (ref) => h(Image, { src: '/logo.svg', alt: 'Logo', ref })],
];

// Every public host that forwards its ref to a motion root or an image follows
// the one behavior. ListBox, Tree, RadioGroup, Calendar, Avatar.Image, and Image
// used to drop a callback ref's returned cleanup and call the ref with null.
for (const [name, render] of hosts) {
  test(`${name} forwards its ref with React 19 cleanup semantics`, async () => {
    const calls = [];
    const object = { current: null };
    const view = await mount(h('div', null,
      h('div', { id: 'cleanup' }, render((node) => {
        calls.push(['ref', node?.nodeType === 1 ? 'element' : node]);
        return () => calls.push(['cleanup']);
      })),
      h('div', { id: 'plain' }, render((node) => { calls.push(['plain', node?.nodeType === 1 ? 'element' : node]); })),
      h('div', { id: 'object' }, render(object))));
    assert.deepEqual(calls, [['ref', 'element'], ['plain', 'element']], 'each callback ref attaches once');
    assert.equal(object.current?.nodeType, 1, 'an object ref receives the element');
    await view.unmount();
    assert.deepEqual(calls, [['ref', 'element'], ['plain', 'element'], ['cleanup'], ['plain', null]], 'the cleanup replaces the null call; a plain ref still gets null');
    assert.equal(object.current, null, 'an object ref is reset');
  });
}
