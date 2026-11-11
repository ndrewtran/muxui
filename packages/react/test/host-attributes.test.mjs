import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Button } from '../src/button.ts';
import { Disclosure, DisclosureGroup, Link } from '../src/components.ts';
import { createDom } from './support/dom.mjs';

// The native and ARIA attributes Link, Button and Disclosure accept in their types reach the element they render, in
// server markup and after hydration, including the ones React Aria's own DOM filter leaves out.

const h = React.createElement;

async function mount(element) {
  const env = createDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    async dispose() {
      await act(async () => root.unmount());
      env.restore();
    },
  };
}

/** Parses server markup and returns its first element matching `selector`. */
function serverElement(markup, selector) {
  const env = createDom();
  try {
    const host = document.createElement('div');
    host.innerHTML = markup;
    const node = host.querySelector(selector);
    return node && Object.fromEntries([...node.attributes].map((attribute) => [attribute.name, attribute.value]));
  } finally {
    env.restore();
  }
}

const linkAttributes = { 'aria-expanded': false, 'aria-busy': true, 'aria-hidden': true, tabIndex: -1, title: 'Opens the panel', download: 'notes.txt' };
const expectedLink = { 'aria-expanded': 'false', 'aria-busy': 'true', 'aria-hidden': 'true', tabindex: '-1', title: 'Opens the panel', download: 'notes.txt' };
const pick = (attributes, names) => Object.fromEntries(names.map((name) => [name, attributes?.[name]]));

test('Link passes its native and ARIA attributes to the anchor in server markup and on the client', async () => {
  const element = h(Link, { href: '/notes.txt', ...linkAttributes }, 'Notes');
  assert.deepEqual(pick(serverElement(renderToString(element), 'a'), Object.keys(expectedLink)), expectedLink, 'server markup');
  const view = await mount(element);
  try {
    const anchor = view.container.querySelector('a');
    assert.deepEqual(pick(Object.fromEntries([...anchor.attributes].map((a) => [a.name, a.value])), Object.keys(expectedLink)), expectedLink, 'client DOM');
    assert.equal(anchor.getAttribute('href'), '/notes.txt');
  } finally {
    await view.dispose();
  }
});

test('a disabled Link keeps the caller attributes on its span and adds no tab stop of its own', () => {
  const span = serverElement(renderToString(h(Link, { 'aria-expanded': true, title: 'Unavailable' }, 'Nowhere')), 'span.muxui-link');
  assert.deepEqual(pick(span, ['aria-expanded', 'title', 'aria-disabled', 'tabindex']), { 'aria-expanded': 'true', title: 'Unavailable', 'aria-disabled': 'true', tabindex: undefined });
});

test('Link onClick runs once per native click before React Aria, can keep the Link from navigating, and never runs while disabled', async () => {
  const log = [];
  const onClick = (event) => {
    log.push(['click', event.type, event.currentTarget.localName]);
    event.preventDefault();
  };
  const view = await mount(h(React.Fragment, null,
    h(Link, { id: 'live', href: '#live', onClick, onActivate: () => log.push(['activate']) }, 'Live'),
    h(Link, { id: 'off', href: '#off', disabled: true, onClick }, 'Off')));
  try {
    const live = view.container.querySelector('#live');
    // A script click, as a screen reader or element.click() gives.
    await act(async () => live.click());
    assert.deepEqual(log, [['click', 'click', 'a'], ['activate']], 'one onClick, then the activation');
    assert.equal(window.location.hash, '', 'preventDefault in onClick keeps the Link from navigating');

    // A pointer press: React Aria waits for the click to report it, and onClick still runs once.
    log.length = 0;
    await act(async () => {
      live.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
      live.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, pointerId: 1, pointerType: 'mouse' }));
      live.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }));
    });
    assert.deepEqual(log, [['click', 'click', 'a'], ['activate']], 'a pointer press runs onClick once');

    // Enter: the browser clicks the anchor on keydown, and React Aria reports the press on keyup without a second click.
    log.length = 0;
    await act(async () => {
      live.focus();
      live.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
      live.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 0 }));
      live.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter' }));
    });
    assert.equal(log.filter(([kind]) => kind === 'click').length, 1, 'Enter runs onClick once, on the native click it can cancel');

    log.length = 0;
    await act(async () => view.container.querySelector('#off').click());
    assert.deepEqual(log, [], 'a disabled Link runs no onClick');
  } finally {
    await view.dispose();
  }
});

test('Button passes title and tabIndex to its button', () => {
  const button = serverElement(renderToString(h(Button, { title: 'Saves the draft', tabIndex: -1 }, 'Save')), 'button');
  assert.deepEqual(pick(button, ['title', 'tabindex']), { title: 'Saves the draft', tabindex: '-1' });
});

test('Disclosure puts its id on its root, alone and in a group, and the group still opens it by that id', async () => {
  const lone = serverElement(renderToString(h(Disclosure, { id: 'details', title: 'Details' }, 'Body')), '.muxui-disclosure');
  assert.equal(lone.id, 'details', 'a lone Disclosure');
  assert.equal(serverElement(renderToString(h(Disclosure, { title: 'Details' }, 'Body')), '.muxui-disclosure').id, undefined, 'no id, no attribute');

  const view = await mount(h(DisclosureGroup, { defaultExpandedIds: ['second'] },
    h(Disclosure, { id: 'first', title: 'First' }, 'One'),
    h(Disclosure, { id: 'second', title: 'Second' }, 'Two')));
  try {
    const roots = [...view.container.querySelectorAll('.muxui-disclosure')];
    assert.deepEqual(roots.map((node) => node.id), ['first', 'second']);
    assert.deepEqual(roots.map((node) => node.querySelector('.muxui-disclosure__trigger').getAttribute('aria-expanded')), ['false', 'true'], 'the group expands the Disclosure by its id');
    assert.equal(document.getElementById('second'), roots[1], 'an address ending in #second reaches it');
  } finally {
    await view.dispose();
  }
});

test('server markup with the passed-through attributes hydrates without a mismatch', async () => {
  const element = h('div', null,
    h(Link, { href: '/notes.txt', ...linkAttributes, onClick: () => {} }, 'Notes'),
    h(Link, { title: 'Unavailable' }, 'Nowhere'),
    h(Button, { title: 'Saves the draft' }, 'Save'),
    h(Disclosure, { id: 'details', title: 'Details', 'aria-describedby': 'hint' }, 'Body'));
  const markup = renderToString(element);
  const env = createDom();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  const container = document.querySelector('#root');
  container.innerHTML = markup;
  let root;
  try {
    await act(async () => { root = hydrateRoot(container, element, { onRecoverableError: (error) => errors.push(String(error)) }); });
    assert.deepEqual(errors, [], 'no hydration warning');
    assert.equal(container.querySelector('#details').getAttribute('aria-describedby'), 'hint', 'the Disclosure root takes its other attributes too');
  } finally {
    console.error = original;
    await act(async () => root?.unmount());
    env.restore();
  }
});
