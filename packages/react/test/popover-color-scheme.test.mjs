import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createDom } from './support/dom.mjs';

// The attributes a Popover with colorScheme puts on its positioner: the scheme it is given, and the preset theme and
// contrast it copies from around its trigger. The browser test proves what these attributes do to the paint.

const installDom = (markup) => createDom(markup, { globals: ['File', 'Blob', 'FileReader'], layoutStubs: true });

const moduleEnvironment = installDom();
const { Popover } = await import('../src/overlays.ts');
moduleEnvironment.restore();

const h = React.createElement;
const SCOPE_ATTRIBUTES = ['data-muxui-color-scheme', 'data-muxui-theme', 'data-muxui-contrast'];

// A page whose root and trigger surroundings carry the given attributes.
function markup({ root = '', scope = '' } = {}) {
  return `<html ${root}><body><section id="scope" ${scope}><div id="host"></div></section></body></html>`;
}

// Renders an open Popover into a fresh page and passes the helpers a test needs; restores the page afterwards.
async function withPopover({ props, ...page }, body) {
  const { restore } = installDom(markup(page));
  // Count the observers that watch a preset attribute and have not been disconnected.
  const NativeObserver = globalThis.MutationObserver;
  const live = new Set();
  globalThis.MutationObserver = class extends NativeObserver {
    observe(target, options) {
      if (options?.attributeFilter?.includes('data-muxui-theme')) live.add(this);
      return super.observe(target, options);
    }

    disconnect() {
      live.delete(this);
      return super.disconnect();
    }
  };
  const root = createRoot(document.getElementById('host'));
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
  };
  const render = (extra) => act(async () => root.render(h(Popover, { 'aria-label': 'Actions', trigger: h('button', { id: 'trigger' }, 'Open'), defaultOpen: true, ...props, ...extra }, 'Popover body')));
  try {
    await render();
    const positioner = () => document.querySelector('.muxui-popover__positioner');
    const attributes = () => Object.fromEntries(SCOPE_ATTRIBUTES.map((name) => [name, positioner()?.getAttribute(name) ?? null]));
    await body({ render, positioner, attributes, observers: () => live.size, unmount });
  } finally {
    await unmount();
    globalThis.MutationObserver = NativeObserver;
    restore();
  }
}

// The element structure from the portal root down to the surface, as tag and class names. A scope adds no element to it.
function shapeOf(positioner) {
  const name = (element) => `${element.localName}.${element.className}`;
  const above = [];
  for (let element = positioner.parentElement; element; element = element.parentElement) above.unshift(name(element));
  return { above, positioner: name(positioner), children: [...positioner.children].map(name) };
}

const mutate = (element, name, value) => act(async () => {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
});

test('colorScheme adds nothing to the markup the server renders', () => {
  const props = { 'aria-label': 'Actions', trigger: h('button', null, 'Open'), defaultOpen: true };
  const plain = renderToString(h(Popover, props, 'Popover body'));
  for (const colorScheme of ['dark', 'light']) {
    assert.equal(renderToString(h(Popover, { ...props, colorScheme }, 'Popover body')), plain, `${colorScheme} renders the same server markup`);
  }
  assert.doesNotMatch(plain, /data-muxui-(?:color-scheme|theme|contrast)/u);
});

test('an unset colorScheme leaves the positioner as it was and watches nothing', async () => {
  await withPopover({ root: 'data-muxui-color-scheme="light" data-muxui-theme="standard-harbour" data-muxui-contrast="more"' }, async ({ positioner, attributes, observers }) => {
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': null, 'data-muxui-theme': null, 'data-muxui-contrast': null }, 'the page attributes are not copied');
    assert.equal(observers(), 0);
  });
});

test('colorScheme scopes the positioner without wrapping the surface in another element', async () => {
  let unscopedShape;
  await withPopover({}, async ({ positioner }) => { unscopedShape = shapeOf(positioner()); });
  for (const colorScheme of ['dark', 'light']) {
    await withPopover({ props: { colorScheme } }, async ({ positioner, attributes }) => {
      assert.deepEqual(attributes(), { 'data-muxui-color-scheme': colorScheme, 'data-muxui-theme': null, 'data-muxui-contrast': null }, 'a page without a preset gives the scope none');
      assert.deepEqual(shapeOf(positioner()), unscopedShape, 'no element is added around or inside the positioner');
    });
  }
});

test('the scope copies the theme and contrast from the document root, and an absent one is not an empty string', async () => {
  await withPopover({ props: { colorScheme: 'dark' }, root: 'data-muxui-color-scheme="light" data-muxui-theme="standard-harbour" data-muxui-contrast="more"' }, async ({ attributes }) => {
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': 'dark', 'data-muxui-theme': 'standard-harbour', 'data-muxui-contrast': 'more' });
  });
  await withPopover({ props: { colorScheme: 'dark' }, root: 'data-muxui-theme="monochrome-forest"' }, async ({ positioner, attributes }) => {
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': 'dark', 'data-muxui-theme': 'monochrome-forest', 'data-muxui-contrast': null });
    assert.equal(positioner().hasAttribute('data-muxui-contrast'), false);
  });
});

test('each attribute comes from the nearest element at or above the trigger that carries it', async () => {
  const page = { props: { colorScheme: 'dark' }, root: 'data-muxui-theme="standard-harbour"', scope: 'data-muxui-theme="standard-lagoon" data-muxui-contrast="more"' };
  await withPopover(page, async ({ attributes }) => {
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': 'dark', 'data-muxui-theme': 'standard-lagoon', 'data-muxui-contrast': 'more' }, 'the scope around the trigger wins over the root');
  });
  // The scope carries only the contrast, so the theme still comes from the root.
  await withPopover({ ...page, scope: 'data-muxui-contrast="more"' }, async ({ attributes }) => {
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': 'dark', 'data-muxui-theme': 'standard-harbour', 'data-muxui-contrast': 'more' });
  });
});

test('the scope follows a change to the source attributes while it is open, without reopening', async () => {
  const page = { props: { colorScheme: 'dark' }, root: 'data-muxui-theme="standard-harbour"', scope: '' };
  await withPopover(page, async ({ positioner, attributes }) => {
    const surface = positioner();
    const root = document.documentElement;
    const scope = document.getElementById('scope');

    await mutate(root, 'data-muxui-theme', 'monochrome-forest');
    assert.equal(attributes()['data-muxui-theme'], 'monochrome-forest', 'the root changes the theme');
    await mutate(root, 'data-muxui-contrast', 'more');
    assert.equal(attributes()['data-muxui-contrast'], 'more', 'the root gains a contrast');

    // A nearer scope that gains the attribute takes over, and one that loses it hands it back.
    await mutate(scope, 'data-muxui-theme', 'standard-lagoon');
    assert.equal(attributes()['data-muxui-theme'], 'standard-lagoon');
    await mutate(scope, 'data-muxui-theme', null);
    assert.equal(attributes()['data-muxui-theme'], 'monochrome-forest');

    await mutate(root, 'data-muxui-theme', null);
    await mutate(root, 'data-muxui-contrast', null);
    assert.deepEqual(attributes(), { 'data-muxui-color-scheme': 'dark', 'data-muxui-theme': null, 'data-muxui-contrast': null }, 'attributes nothing carries any more are removed');
    assert.equal(positioner(), surface, 'the same positioner follows, so nothing reopened');
  });
});

test('the observer runs only while a scoped Popover is open, and stops on close and on unmount', async () => {
  await withPopover({ props: { colorScheme: 'dark', defaultOpen: undefined, open: false }, root: 'data-muxui-theme="standard-harbour"' }, async ({ render, positioner, observers, unmount }) => {
    assert.equal(observers(), 0, 'closed: nothing is watched');

    await render({ open: true });
    assert.equal(positioner()?.getAttribute('data-muxui-theme'), 'standard-harbour');
    assert.equal(observers(), 1, 'open: one observer');

    await render({ open: false });
    assert.equal(observers(), 0, 'closed again: the observer is disconnected');
    // A change while closed is picked up when it opens again, before any other change.
    await mutate(document.documentElement, 'data-muxui-theme', 'monochrome-forest');
    await render({ open: true });
    assert.equal(positioner().getAttribute('data-muxui-theme'), 'monochrome-forest');
    assert.equal(observers(), 1);

    await unmount();
    assert.equal(observers(), 0, 'unmounted while open: the observer is disconnected');
  });
});
