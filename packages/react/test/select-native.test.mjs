import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SelectNative } from '../src/supplemental/select-native.mjs';

function installDom(dom) {
  const keys = [
    'window', 'document', 'Element', 'HTMLElement', 'HTMLSelectElement',
    'HTMLLabelElement', 'HTMLDivElement', 'HTMLFormElement', 'Node', 'Event',
    'InputEvent', 'FocusEvent', 'MutationObserver', 'FormData', 'CSS',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, Object.fromEntries(keys.map((key) => [key, dom.window[key] ?? globalThis[key]])));
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  globalThis.CSS ??= { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`) };
  dom.window.HTMLElement.prototype.attachEvent ??= () => {};
  dom.window.HTMLElement.prototype.detachEvent ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

function optionTree() {
  return [
    React.createElement('option', { key: 'placeholder', value: '' }, 'Choose a panel'),
    React.createElement('optgroup', { key: 'workspace', label: 'Workspaces' },
      React.createElement('option', { value: 'inbox' }, 'Inbox'),
      React.createElement('option', { value: 'research' }, 'Research')),
  ];
}

test('SelectNative renders native options, field associations, and visual/native size paths', () => {
  const html = renderToStaticMarkup(React.createElement(SelectNative, {
    id: 'panel',
    label: 'Saved panel',
    description: 'Choose a saved panel.',
    errorMessage: 'Choose a valid panel.',
    invalid: true,
    name: 'panel',
    required: true,
    size: 4,
  }, optionTree()));
  const document = new JSDOM(html).window.document;
  const root = document.querySelector('.muxui-select-native-field');
  const select = document.querySelector('select');
  const label = document.querySelector('label');
  assert.ok(root);
  assert.ok(select);
  assert.ok(label);
  assert.equal(select.tagName, 'SELECT');
  assert.equal(select.id, 'panel');
  assert.equal(select.name, 'panel');
  assert.equal(select.required, true);
  assert.equal(select.getAttribute('size'), '4');
  assert.equal(select.dataset.size, 'md', 'numeric size uses native list rows with md visual styling');
  assert.equal(select.getAttribute('aria-invalid'), 'true');
  assert.equal(label.htmlFor, 'panel');
  assert.match(select.getAttribute('aria-labelledby') ?? '', new RegExp(label.id, 'u'));
  const describedBy = select.getAttribute('aria-describedby')?.split(/\s+/u) ?? [];
  assert.equal(describedBy.length, 2);
  assert.equal(document.getElementById(describedBy[0])?.textContent, 'Choose a saved panel.');
  assert.equal(document.getElementById(describedBy[1])?.textContent, 'Choose a valid panel.');
  assert.equal(select.querySelectorAll('option').length, 3);
  assert.equal(select.querySelector('optgroup')?.label, 'Workspaces');

  for (const size of ['sm', 'md', 'lg']) {
    const sized = new JSDOM(renderToStaticMarkup(React.createElement(SelectNative, { 'aria-label': 'Panel', size }, optionTree()))).window.document.querySelector('select');
    assert.equal(sized?.dataset.size, size);
    assert.equal(sized?.hasAttribute('size'), false, `${size} is a Mux visual size, not native list size`);
  }
  for (const size of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => renderToStaticMarkup(React.createElement(SelectNative, { 'aria-label': 'Panel', size }, optionTree())), TypeError);
  }
});

test('SelectNative enforces an accessible name and preserves ARIA precedence', () => {
  for (const props of [{}, { label: '' }, { 'aria-label': '  ' }, { 'aria-labelledby': '  ' }]) {
    assert.throws(() => renderToString(React.createElement(SelectNative, props, optionTree())), /requires label, aria-label, or aria-labelledby/u);
  }

  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement('span', { id: 'external-label' }, 'External panel'),
    React.createElement(SelectNative, {
      label: 'Visible panel',
      'aria-label': 'Explicit panel name',
      'aria-labelledby': 'external-label',
      'aria-describedby': 'external-help',
    }, optionTree()),
    React.createElement('span', { id: 'external-help' }, 'External help'),
  ));
  const document = new JSDOM(html).window.document;
  const select = document.querySelector('select');
  assert.ok(select);
  assert.equal(select.getAttribute('aria-label'), 'Explicit panel name');
  assert.match(select.getAttribute('aria-labelledby') ?? '', /external-label/u);
  assert.match(select.getAttribute('aria-describedby') ?? '', /external-help/u);
});

test('SelectNative preserves native ref, change events, form data, and reset', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const events = [];
  const ref = React.createRef();
  let root;
  try {
    const element = React.createElement('form', { id: 'form' },
      React.createElement(SelectNative, {
        ref,
        id: 'panel',
        label: 'Panel',
        name: 'panel',
        defaultValue: 'inbox',
        onChange: (event) => events.push({ tag: event.currentTarget.tagName, value: event.currentTarget.value }),
      }, optionTree()),
      React.createElement('button', { type: 'reset' }, 'Reset'));
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(element); });
    const form = document.querySelector('#form');
    const select = document.querySelector('select');
    assert.ok(form);
    assert.ok(select);
    assert.equal(ref.current, select);
    assert.equal(select.value, 'inbox');

    select.value = 'research';
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.deepEqual(events, [{ tag: 'SELECT', value: 'research' }]);
    assert.equal(new FormData(form).get('panel'), 'research');

    await act(async () => { form.reset(); });
    assert.equal(select.value, 'inbox');
    select.focus();
    assert.equal(document.activeElement, select);
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('SelectNative SSR hydration removes no-description ghost references', async () => {
  const element = React.createElement(SelectNative, {
    id: 'panel',
    label: 'Panel',
    'aria-describedby': 'external-help',
  }, optionTree());
  const server = renderToString(element);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const restore = installDom(dom);
  let root;
  try {
    const select = document.querySelector('select');
    assert.equal(select?.getAttribute('aria-describedby'), 'external-help');
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element); });
    assert.equal(document.querySelector('select')?.getAttribute('aria-describedby'), 'external-help');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }

  const noHelp = new JSDOM(renderToStaticMarkup(React.createElement(SelectNative, {
    id: 'no-help',
    label: 'Panel',
  }, optionTree()))).window.document.querySelector('select');
  assert.equal(noHelp?.hasAttribute('aria-describedby'), false);
});
