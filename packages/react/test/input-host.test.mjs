import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { SearchField, TextField } from '../src/fields.mjs';

function installDom(dom) {
  const keys = [
    'window', 'document', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLDivElement',
    'HTMLFormElement', 'SVGElement', 'Node', 'Event', 'InputEvent', 'KeyboardEvent',
    'FocusEvent', 'ClipboardEvent', 'MutationObserver', 'FormData', 'CSS',
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

test('TextField exposes the inner input ref and bounded native input props', async () => {
  const nestedEvents = [];
  const inputRef = React.createRef();
  const outerRef = React.createRef();
  const props = {
    id: 'name',
    label: 'Name',
    name: 'name',
    value: 'root value',
    required: true,
    invalid: true,
    errorMessage: 'Name is required',
    ref: outerRef,
    inputRef,
    placeholder: 'Root placeholder',
    maxLength: 30,
    inputProps: {
      className: 'consumer-input',
      placeholder: 'Consumer placeholder',
      maxLength: 1,
      type: 'hidden',
      id: 'consumer-id',
      name: 'consumer-name',
      value: 'consumer value',
      defaultValue: 'consumer default',
      disabled: true,
      readOnly: true,
      required: false,
      'aria-label': 'Consumer label',
      'aria-describedby': 'consumer-description',
      'aria-invalid': 'false',
      onChange: () => nestedEvents.push('change'),
      onInput: () => nestedEvents.push('input'),
      onKeyDown: () => nestedEvents.push('keydown'),
      onPaste: () => nestedEvents.push('paste'),
      onFocus: () => nestedEvents.push('focus'),
      onBlur: () => nestedEvents.push('blur'),
      onSelect: () => nestedEvents.push('select'),
    },
  };
  const element = React.createElement(TextField, props);
  const server = renderToString(element);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const serverInput = dom.window.document.querySelector('input');
  assert.ok(serverInput);
  assert.equal(serverInput.id, 'name');
  assert.equal(serverInput.name, 'name');
  assert.equal(serverInput.value, 'root value');
  assert.equal(serverInput.type, 'text');
  assert.equal(serverInput.disabled, false);
  assert.equal(serverInput.readOnly, false);
  assert.equal(serverInput.required, true);
  assert.equal(serverInput.placeholder, 'Root placeholder');
  assert.equal(serverInput.maxLength, 30);
  assert.equal(serverInput.getAttribute('aria-invalid'), 'true');
  assert.equal(serverInput.getAttribute('aria-label'), null);
  assert.doesNotMatch(serverInput.getAttribute('aria-describedby') ?? '', /consumer-description/u);
  assert.match(serverInput.className, /muxui-field-input/u);
  assert.match(serverInput.className, /consumer-input/u);
  const restore = installDom(dom);
  const host = document.querySelector('#root');
  const hydrationErrors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: (error) => hydrationErrors.push(error) }); });
    const input = host.querySelector('input');
    assert.ok(input);
    assert.equal(input, serverInput);
    assert.equal(inputRef.current, input);
    assert.equal(outerRef.current, host.querySelector('.muxui-text-field'));
    assert.ok(outerRef.current instanceof HTMLDivElement);
    await act(async () => {
      input.focus();
      input.setSelectionRange(1, 4);
      input.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
      input.dispatchEvent(new window.Event('paste', { bubbles: true, cancelable: true }));
      input.blur();
    });
    assert.equal(input.selectionStart, 1);
    assert.equal(input.selectionEnd, 4);
    assert.deepEqual(nestedEvents, ['focus', 'keydown', 'select', 'paste', 'blur']);
    assert.deepEqual(hydrationErrors, []);
  } finally {
    await act(async () => root?.unmount());
    assert.equal(inputRef.current, null);
    assert.equal(outerRef.current, null);
    restore();
    dom.window.close();
  }
});

test('SearchField keeps root value and validation ownership while exposing input selection handlers', async () => {
  const inputRef = React.createRef();
  const outerRef = React.createRef();
  const events = [];
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const host = document.querySelector('#root');
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(SearchField, {
      id: 'search',
      label: 'Search',
      name: 'query',
      value: 'root query',
      invalid: true,
      errorMessage: 'Search is unavailable',
      ref: outerRef,
      inputRef,
      inputProps: {
        id: 'consumer-id',
        name: 'consumer-query',
        value: 'consumer query',
        'aria-invalid': 'false',
        className: 'consumer-search-input',
        onKeyDown: () => events.push('keydown'),
        onPaste: () => events.push('paste'),
        onFocus: () => events.push('focus'),
        onBlur: () => events.push('blur'),
      },
    })));
    const field = host.querySelector('.muxui-search-field');
    const input = field?.querySelector('input');
    assert.ok(field);
    assert.ok(input);
    assert.equal(inputRef.current, input);
    assert.equal(outerRef.current, field);
    assert.equal(input.id, 'search');
    assert.equal(input.name, 'query');
    assert.equal(input.value, 'root query');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.match(input.className, /muxui-field-input consumer-search-input/u);
    await act(async () => {
      input.focus();
      input.setSelectionRange(0, 4);
    });
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, 4);
    await act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      input.dispatchEvent(new window.Event('paste', { bubbles: true, cancelable: true }));
      input.blur();
    });
    assert.deepEqual(events, ['focus', 'keydown', 'paste', 'blur']);
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});

test('SearchField native keydown can cancel submit and clear before root callbacks run', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  const events = [];
  let cancel = true;
  try {
    await act(async () => root.render(React.createElement(SearchField, {
      label: 'Search',
      defaultValue: 'query',
      onChange: (value) => events.push(`change:${value}`),
      onSubmit: (value) => events.push(`submit:${value}`),
      inputProps: {
        onKeyDown(event) {
          assert.ok(event.currentTarget instanceof HTMLInputElement);
          events.push(`native:${event.key}`);
          if (cancel) event.preventDefault();
        },
      },
    })));
    const input = document.querySelector('input');
    await act(async () => input.focus());
    const keyDown = async (key, isComposing = false) => {
      await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key, isComposing, bubbles: true, cancelable: true })));
    };
    await keyDown('Enter');
    await keyDown('Escape');
    assert.deepEqual(events, ['native:Enter', 'native:Escape']);
    assert.equal(input.value, 'query');

    cancel = false;
    events.length = 0;
    await keyDown('Enter', true);
    await keyDown('Escape', true);
    assert.deepEqual(events, ['native:Enter', 'native:Escape']);
    assert.equal(input.value, 'query');

    events.length = 0;
    await keyDown('Enter');
    await keyDown('Escape');
    assert.deepEqual(events, ['native:Enter', 'submit:query', 'native:Escape', 'change:']);
    assert.equal(input.value, '');
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});

test('changing native keydown handlers preserves each input, focus and cursor', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  try {
    for (const Field of [TextField, SearchField]) {
      const inputRef = React.createRef();
      const render = async (onKeyDown) => {
        await act(async () => root.render(React.createElement(Field, {
          label: 'Value', defaultValue: 'cursor value', inputRef, inputProps: { onKeyDown },
        })));
      };
      await render(undefined);
      const input = inputRef.current;
      await act(async () => { input.focus(); input.setSelectionRange(1, 5); });
      for (const handler of [() => {}, (event) => event.preventDefault(), undefined]) {
        await render(handler);
        assert.equal(inputRef.current, input);
        assert.equal(document.activeElement, input);
        assert.deepEqual([input.selectionStart, input.selectionEnd], [1, 5]);
      }
    }
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});

test('inputProps cannot undo disabled, readOnly, required or named root semantics', () => {
  for (const Field of [TextField, SearchField]) {
    const html = renderToString(React.createElement(Field, {
      'aria-label': 'Root name', disabled: true, readOnly: true, required: true, defaultValue: 'root default',
      inputProps: {
        'aria-label': 'Nested name', 'aria-labelledby': 'missing', 'aria-disabled': 'false',
        'aria-readonly': 'false', 'aria-required': 'false', disabled: false, readOnly: false, required: false,
        defaultValue: 'nested default', autoComplete: 'off', inputMode: 'search',
      },
    }));
    const dom = new JSDOM(html);
    const input = dom.window.document.querySelector('input');
    assert.equal(input.disabled, true);
    assert.equal(input.readOnly, true);
    assert.equal(input.required, true);
    assert.equal(input.value, 'root default');
    assert.equal(input.getAttribute('aria-label'), 'Root name');
    assert.notEqual(input.getAttribute('aria-labelledby'), 'missing');
    assert.notEqual(input.getAttribute('aria-disabled'), 'false');
    assert.notEqual(input.getAttribute('aria-readonly'), 'false');
    assert.notEqual(input.getAttribute('aria-required'), 'false');
    assert.equal(input.autocomplete, 'off');
    assert.equal(input.inputMode, 'search');
    dom.window.close();
  }
});
