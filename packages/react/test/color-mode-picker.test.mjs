import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { ColorModePicker } from '../src/supplemental/color-mode-picker.ts';
import { ColorModeToggle } from '../src/supplemental/color-mode-toggle.ts';
import { installDom } from './support/dom.mjs';

const h = React.createElement;
const SCHEME = 'data-muxui-color-scheme';

/** A matchMedia that tests flip: `dark` is the preference, `listeners` the live listeners of the color scheme query. */
function systemPreference(window, dark) {
  const state = { dark, listeners: new Set() };
  // Other queries (reduced motion, say) are answered, and not counted.
  window.matchMedia = (query) => (query.includes('prefers-color-scheme')
    ? {
      get matches() { return state.dark; },
      addEventListener: (_type, listener) => state.listeners.add(listener),
      removeEventListener: (_type, listener) => state.listeners.delete(listener),
    }
    : { matches: false, addEventListener() {}, removeEventListener() {} });
  state.set = (next) => {
    state.dark = next;
    for (const listener of state.listeners) listener();
  };
  return state;
}

/** Runs `run` in a fresh jsdom page with the picker's globals installed, then closes it. */
async function inPage(run, { markup = '<div id="root"></div>', storage = {}, dark = false, strict = false } = {}) {
  const dom = new JSDOM(`<!doctype html>${markup}`, { url: 'http://127.0.0.1/' });
  for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
  const system = systemPreference(dom.window, dark);
  const restore = installDom(dom);
  const root = { current: undefined };
  const wrap = (element) => (strict ? h(React.StrictMode, null, element) : element);
  try {
    await run({ dom, system, root, wrap });
  } finally {
    await act(async () => root.current?.unmount());
    restore();
  }
}

const radios = () => [...document.querySelectorAll('[role="radio"]')];
const selected = () => radios().filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent);

test('ColorModePicker renders a named radio group of Light, Dark and System, on System by default', () => {
  const { document: doc } = new JSDOM(renderToString(h(ColorModePicker))).window;
  const group = doc.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute('aria-label'), 'Color mode');
  assert.ok(group.classList.contains('muxui-color-mode-picker'));
  const radios = [...doc.querySelectorAll('[role="radio"]')];
  assert.deepEqual(radios.map((radio) => radio.textContent), ['Light', 'Dark', 'System']);
  assert.deepEqual(radios.map((radio) => radio.getAttribute('aria-checked')), ['false', 'false', 'true']);
  // The group has no state to read during server rendering: nothing but the default is written.
  assert.equal(doc.documentElement.hasAttribute(SCHEME), false);

  const named = new JSDOM(renderToString(h(ColorModePicker, { 'aria-label': 'Appearance', defaultMode: 'dark' }))).window.document;
  assert.equal(named.querySelector('[role="radiogroup"]').getAttribute('aria-label'), 'Appearance');
  assert.equal(named.querySelector('[aria-checked="true"]').textContent, 'Dark');
});

test('ColorModePicker saves Light and Dark as ColorModeToggle does, and System removes the saved value', async () => {
  await inPage(async ({ dom, system, root }) => {
    root.current = createRoot(document.querySelector('#root'));
    const changes = [];
    await act(async () => root.current.render(h(ColorModePicker, { storageKey: 'picker-mode', onModeChange: (mode) => changes.push(mode) })));
    // Nothing saved: the picker is on System, follows the system's light preference, and saves nothing.
    assert.deepEqual(selected(), ['System']);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'light');
    assert.equal(dom.window.localStorage.getItem('picker-mode'), null);

    await act(async () => radios()[1].click());
    assert.deepEqual(selected(), ['Dark']);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');
    assert.equal(dom.window.localStorage.getItem('picker-mode'), 'dark');

    await act(async () => radios()[0].click());
    assert.equal(document.documentElement.getAttribute(SCHEME), 'light');
    assert.equal(dom.window.localStorage.getItem('picker-mode'), 'light');

    system.set(true);
    await act(async () => radios()[2].click());
    assert.equal(dom.window.localStorage.getItem('picker-mode'), null);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');
    // Restoring did not report; each choice did.
    assert.deepEqual(changes, ['dark', 'light', 'system']);
  });
});

test('ColorModePicker and ColorModeToggle read and write one saved format under one key', async () => {
  await inPage(async ({ dom, root }) => {
    root.current = createRoot(document.querySelector('#root'));
    await act(async () => root.current.render(h(ColorModeToggle, { storageKey: 'shared-mode', defaultMode: 'light', 'aria-label': 'Toggle' })));
    await act(async () => document.querySelector('.muxui-color-mode-toggle input').click());
    assert.equal(dom.window.localStorage.getItem('shared-mode'), 'dark');

    // The picker restores what the toggle saved, and the toggle what the picker saves.
    await act(async () => root.current.render(h(ColorModePicker, { storageKey: 'shared-mode' })));
    assert.deepEqual(selected(), ['Dark']);
    await act(async () => radios()[0].click());
    assert.equal(dom.window.localStorage.getItem('shared-mode'), 'light');

    await act(async () => root.current.render(h(ColorModeToggle, { storageKey: 'shared-mode', defaultMode: 'dark', 'aria-label': 'Toggle' })));
    assert.equal(document.querySelector('.muxui-color-mode-toggle').getAttribute('data-muxui-mode'), 'light');
  });
});

test('ColorModePicker follows the system preference while System is chosen, and stops when it is not', async () => {
  await inPage(async ({ system, root }) => {
    root.current = createRoot(document.querySelector('#root'));
    await act(async () => root.current.render(h(ColorModePicker, { storageKey: 'follow-mode' })));
    assert.equal(document.documentElement.getAttribute(SCHEME), 'light');
    assert.equal(system.listeners.size, 1);

    await act(async () => system.set(true));
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');
    await act(async () => system.set(false));
    assert.equal(document.documentElement.getAttribute(SCHEME), 'light');

    await act(async () => radios()[1].click());
    assert.equal(system.listeners.size, 0, 'choosing Dark stops following');
    await act(async () => system.set(false));
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');

    await act(async () => radios()[2].click());
    assert.equal(system.listeners.size, 1);
    await act(async () => root.current.unmount());
    root.current = undefined;
    assert.equal(system.listeners.size, 0, 'unmounting stops following');
  });
});

test('ColorModePicker restores a saved mode after mount, ahead of defaultMode, and hydrates cleanly', async () => {
  const props = { storageKey: 'hydrate-mode', defaultMode: 'light' };
  const markup = renderToString(h(ColorModePicker, props));
  assert.match(markup, /aria-checked="true"[^>]*>Light</u);
  await inPage(async ({ root }) => {
    const errors = [];
    await act(async () => { root.current = hydrateRoot(document.querySelector('#root'), h(ColorModePicker, props), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    assert.deepEqual(selected(), ['Dark']);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');
  }, { markup: `<div id="root">${markup}</div>`, storage: { 'hydrate-mode': 'dark' } });
});

test('ColorModePicker ignores a saved value that is not light or dark, and starts on defaultMode', async () => {
  await inPage(async ({ root }) => {
    root.current = createRoot(document.querySelector('#root'));
    await act(async () => root.current.render(h(ColorModePicker, { storageKey: 'bad-mode', defaultMode: 'dark' })));
    assert.deepEqual(selected(), ['Dark']);
  }, { storage: { 'bad-mode': 'system' } });
});

test('ColorModePicker keeps a saved choice when React runs its effects twice', async () => {
  await inPage(async ({ dom, root, wrap }) => {
    root.current = createRoot(document.querySelector('#root'));
    await act(async () => root.current.render(wrap(h(ColorModePicker, { storageKey: 'strict-mode' }))));
    assert.deepEqual(selected(), ['Dark']);
    assert.equal(dom.window.localStorage.getItem('strict-mode'), 'dark');
  }, { storage: { 'strict-mode': 'dark' }, strict: true });
});

test('a controlled ColorModePicker reports changes and shows only the mode it is given', async () => {
  await inPage(async ({ dom, root }) => {
    root.current = createRoot(document.querySelector('#root'));
    const changes = [];
    await act(async () => root.current.render(h(ColorModePicker, { mode: 'dark', storageKey: 'controlled-mode', onModeChange: (mode) => changes.push(mode) })));
    assert.deepEqual(selected(), ['Dark']);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'dark');
    assert.equal(dom.window.localStorage.getItem('controlled-mode'), 'dark');
    await act(async () => radios()[0].click());
    assert.deepEqual(changes, ['light']);
    assert.deepEqual(selected(), ['Dark']);
    await act(async () => root.current.render(h(ColorModePicker, { mode: 'light', storageKey: 'controlled-mode' })));
    assert.deepEqual(selected(), ['Light']);
    assert.equal(document.documentElement.getAttribute(SCHEME), 'light');
  });
});

test('a disabled ColorModePicker ignores input', async () => {
  await inPage(async ({ root }) => {
    root.current = createRoot(document.querySelector('#root'));
    const changes = [];
    await act(async () => root.current.render(h(ColorModePicker, { disabled: true, onModeChange: (mode) => changes.push(mode) })));
    assert.equal(radios().every((radio) => radio.disabled), true);
    await act(async () => radios()[1].click());
    assert.deepEqual(changes, []);
  });
});
