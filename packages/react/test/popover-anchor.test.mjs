import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createDom } from './support/dom.mjs';

// A Popover without a trigger, on the server, through hydration, and inside another Popover. Its placement and focus
// are proved in test/browser/popover-anchor.test.mjs.

const installDom = (markup) => createDom(markup, { layoutStubs: true });
const moduleEnvironment = installDom();
const { Popover } = await import('../src/overlays.ts');
moduleEnvironment.restore();
const h = React.createElement;

const refs = () => ({ anchorRef: { current: null }, boundaryRef: { current: null }, initialFocusRef: { current: null }, returnFocusRef: { current: null } });

test('a Popover renders on the server without the DOM: without a trigger nothing, and with one its trigger alone, whatever refs it is given', () => {
  assert.equal(typeof document, 'undefined', 'no DOM is installed');
  for (const state of [{ open: true }, { defaultOpen: true }, { open: false }]) {
    assert.equal(renderToString(h(Popover, { 'aria-label': 'Add link', ...refs(), ...state }, 'Body')), '', `nothing is rendered for ${JSON.stringify(state)}`);
  }
  const trigger = h('button', { type: 'button' }, 'Add link');
  assert.equal(
    renderToString(h(Popover, { 'aria-label': 'Add link', trigger, ...refs() }, 'Body')),
    renderToString(h(Popover, { 'aria-label': 'Add link', trigger }, 'Body')),
    'the refs add nothing to a trigger\'s markup',
  );
});

test('a Popover needs a trigger or an anchorRef, a valid trigger, and an accessible name', () => {
  assert.throws(() => renderToString(h(Popover, { 'aria-label': 'Add link', open: true }, 'Body')), /Popover requires a trigger or an anchorRef/u);
  assert.throws(() => renderToString(h(Popover, { 'aria-label': 'Add link', trigger: 'Add link' }, 'Body')), /Popover requires a focusable React element as trigger/u);
  assert.throws(() => renderToString(h(Popover, { anchorRef: { current: null }, open: true }, 'Body')), /Popover requires an accessible name/u);
});

function AnchoredFixture() {
  const anchorRef = React.useRef(null);
  return h('div', null,
    h('span', { id: 'anchor', ref: anchorRef }, 'Anchor'),
    h(Popover, { 'aria-label': 'Add link', anchorRef, defaultOpen: true }, h('input', { id: 'field', 'aria-label': 'Address' })));
}

test('a Popover without a trigger hydrates over server markup that holds none of it, then opens, named', async () => {
  const server = renderToString(h(AnchoredFixture));
  assert.doesNotMatch(server, /muxui-popover|Add link/u);
  const env = installDom(`<div id="root">${server}</div>`);
  const errors = [];
  const consoleError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), h(AnchoredFixture)); });
    const surface = document.body.querySelector('.muxui-popover');
    assert.ok(surface, 'it opens after hydration');
    assert.equal(surface.getAttribute('role'), 'dialog');
    assert.equal(surface.getAttribute('aria-label'), 'Add link');
    assert.deepEqual(errors, []);
  } finally {
    console.error = consoleError;
    await act(async () => root?.unmount());
    env.restore();
  }
});

// A Popover without a trigger inside a Popover that has one: the inner one keeps nothing of the outer trigger's.
function NestedFixture({ innerOpen }) {
  const anchorRef = React.useRef(null);
  return h(Popover, { 'aria-label': 'Outer', defaultOpen: true, trigger: h('button', { type: 'button', id: 'outer-trigger' }, 'Outer') },
    h('span', { id: 'inner-anchor', ref: anchorRef }, 'Inner anchor'),
    h(Popover, { 'aria-label': 'Inner', anchorRef, open: innerOpen, modal: false }, h('button', { type: 'button', id: 'inner-action' }, 'Inner action')));
}

test('a Popover without a trigger takes no state, id or label from the trigger of a Popover around it', async () => {
  const env = installDom();
  const root = (await import('react-dom/client')).createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(h(NestedFixture, { innerOpen: false })));
    assert.equal(document.body.querySelectorAll('.muxui-popover').length, 1, 'the inner Popover stays closed while the outer one is open');
    await act(async () => root.render(h(NestedFixture, { innerOpen: true })));
    const [outer, inner] = ['Outer', 'Inner'].map((name) => document.body.querySelector(`.muxui-popover[aria-label="${name}"]`));
    assert.ok(outer && inner);
    assert.ok(outer.id, 'the outer surface carries the id its trigger controls');
    assert.notEqual(inner.id, outer.id, 'the inner surface does not take it');
    const outerTrigger = document.querySelector('#outer-trigger');
    assert.notEqual(inner.closest('.muxui-popover__positioner').getAttribute('aria-labelledby'), outerTrigger.id, 'nor is it labelled by the outer trigger');
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});
