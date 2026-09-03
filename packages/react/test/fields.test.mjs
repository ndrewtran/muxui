import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import {
  Autocomplete,
  Checkbox,
  CheckboxGroup,
  DateField,
  DatePicker,
  DateRangePicker,
  Form,
  NumberField,
  SearchField,
  Switch,
  TextField,
  TimeField,
} from '../src/components.mjs';

function installDom(dom) {
  const keys = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLLabelElement', 'HTMLDivElement', 'HTMLFormElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent', 'CustomEvent', 'MutationObserver', 'FormData', 'CSS', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
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

function OptionsWrapper() {
  return React.createElement(React.Fragment, null,
    React.createElement(Checkbox, { value: 'sms' }, 'SMS'));
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16) / 255);
    return channels.reduce((total, channel, index) => {
      const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return total + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function fields({ onText, onNumber, onSearch, onDate, onTime, onRange, onSwitch, onGroup, onSubmit, onReset } = {}) {
  return React.createElement(React.Fragment, null,
    React.createElement(TextField, { label: 'Name', description: 'Display name', errorMessage: 'Name is required', invalid: true, defaultValue: 'Andrew', onChange: onText }),
    React.createElement(NumberField, { label: 'Quantity', defaultValue: 2, minValue: 0, onChange: onNumber }),
    React.createElement(SearchField, { label: 'Search', onChange: onSearch }),
    React.createElement(Autocomplete, { label: 'City', items: ['Melbourne', 'Sydney'] }),
    React.createElement(CheckboxGroup, { label: 'Alerts', name: 'alerts', defaultValue: ['email'], onChange: onGroup },
      React.createElement(Checkbox, { value: 'email' }, 'Email'), React.createElement(Checkbox, { value: 'sms' }, 'SMS')),
    React.createElement(Switch, { label: 'Enabled', description: 'Apply changes', errorMessage: 'Choose a setting', defaultSelected: false, onChange: onSwitch }),
    React.createElement(DateField, { label: 'Birthday', defaultValue: '2026-08-26', onChange: onDate }),
    React.createElement(DatePicker, { label: 'Due date', defaultValue: '2026-08-26', onChange: onDate }),
    React.createElement(DateRangePicker, { label: 'Trip', startName: 'tripStart', endName: 'tripEnd', defaultValue: { start: '2026-08-26', end: '2026-09-01' }, onChange: onRange }),
    React.createElement(Form, { onSubmit, onReset },
      React.createElement(TimeField, { label: 'Start', name: 'startTime', defaultValue: '09:30', onChange: onTime }),
      React.createElement('button', { type: 'submit' }, 'Submit'), React.createElement('button', { type: 'reset' }, 'Reset')),
  );
}

test('R1.2 fields preserve MuxUI labels, errors, SSR, hydration, and state callbacks', async () => {
  const server = renderToString(fields());
  for (const marker of ['muxui-text-field', 'muxui-number-field', 'muxui-search-field', 'muxui-autocomplete', 'muxui-checkbox-group', 'muxui-switch', 'muxui-date-field', 'muxui-date-picker', 'muxui-date-range-picker', 'muxui-time-field', 'muxui-form']) assert.match(server, new RegExp(marker));
  assert.match(server, /Display name/u);
  assert.match(server, /Name is required/u);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const restore = installDom(dom);
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), fields()); });
    assert.equal(document.querySelectorAll('label').length >= 7, true);
    assert.equal(document.querySelector('[data-invalid]') !== null, true);
    assert.equal(document.querySelector('.muxui-switch input')?.checked, false);
    assert.equal(document.querySelector('.muxui-switch-field')?.getAttribute('data-invalid'), 'true');
    assert.match(document.querySelector('.muxui-switch-field')?.textContent ?? '', /Apply changes.*Choose a setting/u);
    assert.equal(document.querySelector('.muxui-search-clear svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(document.querySelector('.muxui-search-clear svg')?.getAttribute('focusable'), 'false');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('Form renders name-keyed external validation errors through field error parts', () => {
  const validationErrors = {
    username: 'Username is already taken',
    quantity: ['Quantity is required', 'Quantity must be positive'],
  };
  const markup = renderToString(React.createElement(Form, {
    validationBehavior: 'aria',
    validationErrors,
  },
  React.createElement(TextField, { name: 'username', label: 'Username' }),
  React.createElement(NumberField, { name: 'quantity', label: 'Quantity' }),
  React.createElement(TextField, { name: 'valid', label: 'Valid field' })));
  const dom = new JSDOM(`<!doctype html><div id="root">${markup}</div>`);
  const root = dom.window.document.querySelector('form');
  const errors = [...root.querySelectorAll('.muxui-field-error')];
  assert.equal(errors.length, 2);
  assert.match(errors[0].textContent, /Username is already taken/u);
  assert.match(errors[1].textContent, /Quantity is required Quantity must be positive/u);
  const usernameInput = root.querySelector('input[name="username"]');
  const quantityInput = root.querySelector('.muxui-number-field input:not([type="hidden"])');
  const validInput = root.querySelector('input[name="valid"]');
  assert.ok(usernameInput);
  assert.ok(quantityInput);
  assert.ok(validInput);
  assert.equal(usernameInput.getAttribute('aria-invalid'), 'true');
  assert.equal(quantityInput.closest('.muxui-number-field')?.getAttribute('data-invalid'), 'true');
  assert.equal(quantityInput.getAttribute('aria-invalid'), 'true');
  const usernameDescriptions = usernameInput.getAttribute('aria-describedby')?.split(' ') ?? [];
  assert.equal(usernameDescriptions.some((id) => root.ownerDocument.getElementById(id)?.textContent.includes('Username is already taken')), true);
  const validField = validInput.closest('.muxui-text-field');
  assert.ok(validField);
  assert.equal(validField.querySelector('.muxui-field-error'), null);
  const invalidFields = [...root.querySelectorAll('[data-invalid]')];
  assert.equal(invalidFields.length >= 2, true);
  dom.window.close();
});

test('Form validation errors cover Mux-owned temporal names without duplicate FormData', async () => {
  const validationErrors = {
    startTime: ['Start time is required', 'Start time must be in business hours'],
    tripStart: 'Trip must start on an available date',
    tripEnd: 'Trip must end after it starts',
    localTime: 'Server error is hidden by the local message',
  };
  const renderFields = (errors) => React.createElement(Form, {
    validationBehavior: 'aria',
    validationErrors: errors,
  },
  React.createElement(TimeField, { label: 'Start time', name: 'startTime', defaultValue: '09:30' }),
  React.createElement(TimeField, { label: 'Local time', name: 'localTime', defaultValue: '10:00', errorMessage: 'Local error' }),
  React.createElement(DateRangePicker, {
    label: 'Trip',
    startName: 'tripStart',
    endName: 'tripEnd',
    defaultValue: { start: '2026-08-26', end: '2026-09-01' },
  }));
  const server = renderToString(renderFields(validationErrors));
  assert.match(server, /Start time is required Start time must be in business hours/u);
  assert.match(server, /Trip must start on an available date Trip must end after it starts/u);
  assert.match(server, /Local error/u);
  assert.doesNotMatch(server, /Server error is hidden by the local message/u);

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(renderFields(validationErrors)));
    const form = host.querySelector('form');
    const time = host.querySelector('.muxui-time-field');
    const localTime = host.querySelectorAll('.muxui-time-field')[1];
    const range = host.querySelector('.muxui-date-range-picker');
    assert.equal(form?.noValidate, true);
    assert.equal(time?.getAttribute('data-invalid'), 'true');
    assert.equal(time?.querySelector('[data-type="hour"]')?.getAttribute('aria-invalid'), 'true');
    assert.match(time?.querySelector('.muxui-field-error')?.textContent ?? '', /Start time is required Start time must be in business hours/u);
    assert.equal(localTime?.getAttribute('data-invalid'), 'true');
    assert.match(localTime?.querySelector('.muxui-field-error')?.textContent ?? '', /Local error/u);
    assert.doesNotMatch(localTime?.textContent ?? '', /Server error is hidden by the local message/u);
    assert.equal(range?.getAttribute('data-invalid'), 'true');
    assert.equal(range?.querySelector('[data-type="day"]')?.getAttribute('aria-invalid'), 'true');
    assert.match(range?.querySelector('.muxui-field-error')?.textContent ?? '', /Trip must start on an available date Trip must end after it starts/u);

    const formData = new dom.window.FormData(form);
    assert.deepEqual(formData.getAll('startTime'), ['09:30']);
    assert.deepEqual(formData.getAll('localTime'), ['10:00']);
    assert.deepEqual(formData.getAll('tripStart'), ['2026-08-26']);
    assert.deepEqual(formData.getAll('tripEnd'), ['2026-09-01']);

    await act(async () => root.render(renderFields({})));
    assert.equal(time?.getAttribute('data-invalid'), null);
    assert.equal(time?.querySelector('.muxui-field-error'), null);
    assert.equal(time?.querySelector('[data-type="hour"]')?.getAttribute('aria-invalid'), null);
    assert.equal(range?.getAttribute('data-invalid'), null);
    assert.equal(range?.querySelector('.muxui-field-error'), null);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('SearchField keeps its clear action in the input control grid with supporting text', async () => {
  const markup = renderToString(React.createElement(SearchField, {
    label: 'Search',
    description: 'Find a result',
    errorMessage: 'No result found',
    defaultValue: 'MuxUI',
    invalid: true,
  }));
  const dom = new JSDOM(`<!doctype html><div id="root">${markup}</div>`);
  const control = dom.window.document.querySelector('.muxui-search-control');
  assert.ok(control);
  assert.equal(control.querySelector('input')?.parentElement, control);
  const clear = control.querySelector('.muxui-search-clear');
  assert.equal(clear?.parentElement, control);
  assert.equal(clear?.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
  assert.equal(clear?.querySelector('svg')?.getAttribute('focusable'), 'false');
  assert.equal(clear?.getAttribute('aria-label'), 'Clear search');
  assert.match(dom.window.document.querySelector('.muxui-search-field')?.textContent ?? '', /Find a result.*No result found/u);
  const css = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.muxui-search-control\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/u);
  assert.match(css, /\.muxui-search-control \.muxui-field-input\s*\{[^}]*padding-inline-end:/u);
  dom.window.close();
});

test('SearchField clear control keeps RAC clearing and the MuxUI callback', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const env = installDom(dom);
  const host = document.querySelector('#root');
  const root = createRoot(host);
  let clears = 0;
  try {
    await act(async () => root.render(React.createElement(SearchField, {
      label: 'Search',
      defaultValue: 'MuxUI',
      onClear: () => { clears += 1; },
    })));
    const input = host.querySelector('.muxui-search-field input');
    const clear = host.querySelector('.muxui-search-clear');
    assert.equal(host.querySelector('.muxui-search-field').hasAttribute('data-empty'), false);
    assert.equal(input.value, 'MuxUI');
    await act(async () => clear.click());
    assert.equal(input.value, '');
    assert.equal(clears, 1);
    assert.equal(host.querySelector('.muxui-search-field').getAttribute('data-empty'), 'true');
  } finally {
    await act(async () => root.unmount());
    env();
    dom.window.close();
  }
});

test('TextField keeps standard native input attributes on the input part', () => {
  const markup = renderToString(React.createElement(TextField, {
    label: 'Name',
    autoComplete: 'name',
    autoFocus: true,
    inputMode: 'email',
    maxLength: 80,
    minLength: 2,
    pattern: '[A-Za-z]+',
    spellCheck: false,
  }));
  const dom = new JSDOM(`<!doctype html><div id="root">${markup}</div>`);
  const root = dom.window.document.querySelector('.muxui-text-field');
  const input = root?.querySelector('input');
  assert.ok(root);
  assert.ok(input);
  assert.equal(input.getAttribute('autocomplete'), 'name');
  assert.equal(input.autofocus, true);
  assert.equal(input.inputMode, 'email');
  assert.equal(input.maxLength, 80);
  assert.equal(input.minLength, 2);
  assert.equal(input.pattern, '[A-Za-z]+');
  assert.equal(input.getAttribute('spellcheck'), 'false');
  assert.equal(root.hasAttribute('autocomplete'), false);
  assert.equal(root.hasAttribute('maxlength'), false);
  dom.window.close();
});

test('Switch exposes required and invalid states alongside its description and error parts', () => {
  const markup = renderToString(React.createElement(Switch, {
    label: 'Enabled',
    description: 'Apply changes',
    errorMessage: 'Choose a setting',
    required: true,
    invalid: true,
  }));
  const dom = new JSDOM(`<!doctype html><div id="root">${markup}</div>`);
  const root = dom.window.document.querySelector('.muxui-switch-field');
  assert.equal(root?.getAttribute('data-required'), 'true');
  assert.equal(root?.getAttribute('data-invalid'), 'true');
  assert.match(root?.textContent ?? '', /Apply changes.*Choose a setting/u);
  dom.window.close();
});

test('ComboBox input transitions stay scoped away from TextField', async () => {
  const css = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  const comboStart = css.indexOf('/* MuxUI component source: combobox.css */');
  const comboEnd = css.indexOf('/* MuxUI component source: grid-list.css */', comboStart);
  const textStart = css.indexOf('/* MuxUI component source: text-field.css */');
  const textEnd = css.indexOf('/* MuxUI component source: time-field.css */', textStart);
  assert.ok(comboStart >= 0 && comboEnd > comboStart);
  assert.ok(textStart >= 0 && textEnd > textStart);
  const comboCss = css.slice(comboStart, comboEnd);
  const textCss = css.slice(textStart, textEnd);
  assert.match(comboCss, /\.muxui-combo-box \.muxui-field-input\s*\{[\s\S]*transition:/u);
  assert.match(comboCss, /\.muxui-combo-box \.muxui-field-input:hover\s*\{/u);
  assert.doesNotMatch(comboCss, /^\.muxui-field-input\s*\{/mu);
  assert.match(textCss, /\.muxui-field-input\s*\{[\s\S]*background-color 0\.15s ease/u);
});

test('NumberField steppers expose stable direction hooks and Tale edge geometry', async () => {
  const markup = renderToString(React.createElement(NumberField, { label: 'Quantity', defaultValue: 2 }));
  const dom = new JSDOM(`<!doctype html><div id="root">${markup}</div>`);
  const decrement = dom.window.document.querySelector('.muxui-number-stepper-decrement');
  const increment = dom.window.document.querySelector('.muxui-number-stepper-increment');
  assert.ok(decrement);
  assert.ok(increment);
  assert.equal(decrement.getAttribute('slot'), 'decrement');
  assert.equal(increment.getAttribute('slot'), 'increment');
  const css = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  assert.match(css, /:where\([\s\S]*\.muxui-number-stepper[\s\S]*border:\s*1px solid transparent;[\s\S]*appearance:\s*none;/u);
  assert.match(css, /\.muxui-number-stepper-decrement\s*\{[^}]*border-right:\s*1px solid #d5d2d1;[^}]*border-radius:\s*10px 0 0 10px/u);
  assert.match(css, /\.muxui-number-stepper-increment\s*\{[^}]*border-left:\s*1px solid #d5d2d1;[^}]*border-radius:\s*0 10px 10px 0/u);
  dom.window.close();
});

test('NumberField steps by keyboard, clamps to bounds, preserves empty input, and applies formatOptions', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(NumberField, { label: 'Quantity', defaultValue: 2, minValue: 1, maxValue: 3, step: 1 }),
      React.createElement(NumberField, { label: 'Empty quantity', minValue: 1, maxValue: 3, step: 1 }),
      React.createElement(NumberField, { label: 'Formatted amount', defaultValue: 1234.5, step: 0.1, formatOptions: { style: 'decimal', useGrouping: false } }))));
    const fields = [...host.querySelectorAll('.muxui-number-field')];
    const input = fields[0].querySelector('input');
    const increment = fields[0].querySelector('.muxui-number-stepper-increment');
    const decrement = fields[0].querySelector('.muxui-number-stepper-decrement');
    assert.equal(input.value, '2');
    await act(async () => {
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(input.value, '3');
    await act(async () => {
      increment.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(input.value, '3');
    await act(async () => {
      decrement.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(input.value, '2');
    await act(async () => {
      decrement.click();
      decrement.click();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    assert.equal(input.value, '1');

    const emptyInput = fields[1].querySelector('input');
    assert.equal(emptyInput.value, '');
    await act(async () => emptyInput.focus());
    emptyInput.value = '';
    await act(async () => {
      emptyInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(emptyInput.value, '');

    const formattedInput = fields[2].querySelector('input');
    assert.equal(formattedInput.value, '1234.5');
    assert.equal(formattedInput.getAttribute('aria-valuetext'), null);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('R1.2 form controls support controlled callbacks, keyboard-compatible input, and submit/reset', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  const submits = [];
  const resets = [];
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(fields({
      onText: (value) => changes.push(['text', value]),
      onNumber: (value) => changes.push(['number', value]),
      onSearch: (value) => changes.push(['search', value]),
      onSwitch: (value) => changes.push(['switch', value]),
      onSubmit: (event) => { event.preventDefault(); submits.push([event.type, new dom.window.FormData(event.currentTarget).get('startTime')]); },
      onReset: (event) => { event.preventDefault(); resets.push(event.type); },
    })));
    const textInput = host.querySelector('.muxui-text-field input');
    textInput.value = 'Updated';
    await act(async () => textInput.dispatchEvent(new Event('input', { bubbles: true })));
    await act(async () => host.querySelector('.muxui-switch input').click());
    await act(async () => host.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await act(async () => host.querySelector('form').dispatchEvent(new Event('reset', { bubbles: true, cancelable: true })));
    assert.equal(changes.some(([kind, value]) => kind === 'switch' && value === true), true);
    assert.deepEqual(submits, [['submit', '09:30']]);
    assert.deepEqual(resets, ['reset']);
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.2 public date contracts are ISO strings and do not expose upstream date types', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../generated/index.d.ts', import.meta.url), 'utf8'));
  assert.match(source, /MuxUIDateValue = string/u);
  assert.match(source, /MuxUIDateRange/u);
  assert.doesNotMatch(source, /react-stately|@internationalized\/date|export type DateValue|export type TimeValue/u);
});

test('DateRangePicker popover uses range calendar cells for contiguous selection paint', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(DateRangePicker, {
      label: 'Trip',
      defaultValue: { start: '2026-08-26', end: '2026-09-01' },
    })));
    const trigger = document.querySelector('.muxui-date-range-picker .muxui-date-trigger');
    assert.ok(trigger);
    await act(async () => trigger.click());
    const popup = document.body.querySelector('.muxui-date-popover');
    assert.ok(popup);
    assert.ok(popup.querySelector('.muxui-range-calendar-cell'));
    assert.equal(popup.querySelector('.muxui-calendar-cell'), null);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('date picker calendar triggers retain Tale icon wrapper sizing and scoped popover border tokens', async () => {
  const markup = renderToString(React.createElement(React.Fragment, null,
    React.createElement(DatePicker, { label: 'Due date', defaultValue: '2026-08-26' }),
    React.createElement(DateRangePicker, { label: 'Trip', defaultValue: { start: '2026-08-26', end: '2026-09-01' } }),
  ));
  const dom = new JSDOM(`<!doctype html>${markup}`);
  for (const selector of ['.muxui-date-picker .muxui-date-trigger', '.muxui-date-range-picker .muxui-date-trigger']) {
    const trigger = dom.window.document.querySelector(selector);
    assert.ok(trigger);
    assert.equal(trigger.getAttribute('aria-label'), 'Open calendar');
    const icon = trigger.querySelector('svg');
    assert.ok(icon);
    assert.equal(icon.classList.contains('muxui-icon'), true);
    assert.equal(icon.classList.contains('muxui-icon--sm'), true);
    assert.equal(icon.getAttribute('width'), '24');
    assert.equal(icon.getAttribute('height'), '24');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
    assert.equal(icon.classList.contains('lucide-calendar'), false);
    assert.deepEqual([...icon.children].map((child) => [
      child.tagName.toLowerCase(),
      child.getAttribute('d'),
      child.getAttribute('width'),
      child.getAttribute('height'),
      child.getAttribute('x'),
      child.getAttribute('y'),
      child.getAttribute('rx'),
    ]), [
      ['path', 'M8 2v4', null, null, null, null, null],
      ['path', 'M16 2v4', null, null, null, null, null],
      ['rect', null, '18', '18', '3', '4', '2'],
      ['path', 'M3 10h18', null, null, null, null, null],
    ]);
  }
  dom.window.close();

  const styles = await readFile(new URL('../src/styles/base.css', import.meta.url), 'utf8');
  assert.match(styles, /\.muxui-icon\s*\{[^}]*width:\s*1\.5rem;[^}]*height:\s*1\.5rem;/u);
  assert.match(styles, /\.muxui-icon--sm\s*\{[^}]*width:\s*1rem;[^}]*height:\s*1rem;/u);
  assert.match(styles, /\.muxui-date-popover\s*\{[^}]*border:\s*1px solid var\(--muxui-semantic-surface-hover\)/u);
  assert.match(styles, /\[data-muxui-color-scheme='dark'\] \.muxui-date-popover\s*\{[^}]*border-color:\s*var\(--muxui-reference-color-neutral-96\)/u);
});

test('DateRangePicker renders its visual separator without exposing it to assistive technology', async () => {
  const markup = renderToString(React.createElement(DateRangePicker, {
    label: 'Trip',
    defaultValue: { start: '2026-08-26', end: '2026-09-01' },
  }));
  const dom = new JSDOM(`<!doctype html>${markup}`);
  const separator = dom.window.document.querySelector('.muxui-date-range-separator');
  assert.ok(separator);
  assert.equal(separator.textContent, '–');
  assert.equal(separator.getAttribute('aria-hidden'), 'true');
  const styles = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.muxui-date-range-separator\s*\{[^}]*inline-size:\s*var\(--muxui-semantic-layout-tight-inset\);[^}]*font-size:\s*var\(--muxui-semantic-typography-body-size\);/u);
  assert.doesNotMatch(styles, /\.muxui-date-range-separator\s*\{[^}]*font-size:\s*0/u);
  assert.doesNotMatch(styles, /\.muxui-date-range-separator\s*\{[^}]*inline-size:\s*0/u);
  dom.window.close();
});

test('DatePicker and DateRangePicker expose controlled open-change callbacks', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const openChanges = [];
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(DatePicker, {
        label: 'Due date',
        value: '2026-08-26',
        onOpenChange: (open) => openChanges.push(['date', open]),
      }),
      React.createElement(DateRangePicker, {
        label: 'Trip',
        value: { start: '2026-08-26', end: '2026-09-01' },
        onOpenChange: (open) => openChanges.push(['range', open]),
      }))));
    await act(async () => host.querySelector('.muxui-date-picker .muxui-date-trigger').click());
    await act(async () => host.querySelector('.muxui-date-range-picker .muxui-date-trigger').click());
    assert.equal(openChanges.some(([kind, open]) => kind === 'date' && open), true);
    assert.equal(openChanges.some(([kind, open]) => kind === 'range' && open), true);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('temporal enrichment parses strict values, preserves invalid bounds, and serializes unavailable callbacks', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const restore = installDom(dom);
  let root;
  try {
    const seenDateValues = [];
    const seenRangeValues = [];
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(DateField, {
        label: 'Date',
        defaultValue: '2026-01-01',
        minValue: '2026-02-01',
        maxValue: '2026-03-01',
        unavailableDateMatcher: (date) => { seenDateValues.push(date); return date === '2026-02-15'; },
      }),
      React.createElement(TimeField, {
        label: 'Time',
        defaultValue: '09:00',
        minValue: '10:00',
        maxValue: '11:00',
      }),
      React.createElement(DatePicker, {
        label: 'Picker',
        defaultValue: '2026-01-01',
        minValue: '2026-02-01',
        maxValue: '2026-03-01',
        unavailableDateMatcher: (date) => { seenDateValues.push(date); return false; },
      }),
      React.createElement(DateRangePicker, {
        label: 'Range',
        defaultValue: { start: '2026-01-01', end: '2026-04-01' },
        minValue: '2026-02-01',
        maxValue: '2026-03-01',
        unavailableDateMatcher: (date, anchorDate) => { seenRangeValues.push([date, anchorDate]); return false; },
      }))));
    assert.equal(host.querySelector('.muxui-date-field input[type="text"]')?.value, '2026-01-01');
    assert.equal(host.querySelector('.muxui-time-field input[type="text"]')?.value, '09:00:00');
    assert.equal(host.querySelector('.muxui-date-picker input[type="text"]')?.value, '2026-01-01');
    assert.equal(host.querySelector('.muxui-date-range-picker input[type="text"]')?.value, '2026-01-01');
    await act(async () => host.querySelector('.muxui-date-range-picker .muxui-date-trigger').click());
    const firstRangeCell = document.body.querySelector('.muxui-range-calendar-cell');
    assert.ok(firstRangeCell);
    await act(async () => firstRangeCell.click());
    assert.equal(seenDateValues.length > 0, true);
    assert.equal(seenDateValues.every((value) => typeof value === 'string'), true);
    assert.equal(seenRangeValues.length > 0, true);
    assert.equal(seenRangeValues.every(([date, anchorDate]) => typeof date === 'string' && (anchorDate === null || typeof anchorDate === 'string')), true);
    assert.equal(seenRangeValues.some(([, anchorDate]) => anchorDate === null), true);
    assert.equal(seenRangeValues.some(([, anchorDate]) => typeof anchorDate === 'string'), true);
    assert.throws(() => renderToString(React.createElement(DateField, { label: 'Date', value: 20260101 })), /Mux UI date values must use YYYY-MM-DD ISO format/u);
    assert.throws(() => renderToString(React.createElement(TimeField, { label: 'Time', value: '25:00' })), /Mux UI time values must use HH:mm\[:ss\[\.fraction\]\] ISO format/u);
    assert.throws(() => renderToString(React.createElement(DateRangePicker, { label: 'Range', value: { start: '', end: '2026-03-01' } })), /Mux UI date ranges must include start and end ISO dates/u);
    assert.throws(() => renderToString(React.createElement(DateRangePicker, { label: 'Range', defaultValue: { start: '2026-02-01', end: null } })), /Mux UI date ranges must include start and end ISO dates/u);
    assert.throws(() => renderToString(React.createElement(DatePicker, { label: 'Picker', minValue: '2026-03-01', maxValue: '2026-02-01' })), /Mux UI date minValue must be less than or equal to maxValue/u);
    assert.throws(() => renderToString(React.createElement(TimeField, { label: 'Time', minValue: '11:00', maxValue: '10:00' })), /Mux UI time minValue must be less than or equal to maxValue/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('temporal bounds and reversed ranges stay visible and use built-in Form validation', async () => {
  const renderFields = () => React.createElement(Form, { validationBehavior: 'aria' },
    React.createElement(DateField, { label: 'Underflow date', defaultValue: '2026-01-01', minValue: '2026-02-01', maxValue: '2026-03-01' }),
    React.createElement(DatePicker, { label: 'Overflow date', defaultValue: '2026-04-01', minValue: '2026-02-01', maxValue: '2026-03-01' }),
    React.createElement(TimeField, { label: 'Underflow time', defaultValue: '09:00', minValue: '10:00', maxValue: '11:00' }),
    React.createElement(DateRangePicker, { label: 'Reversed controlled range', value: { start: '2026-09-01', end: '2026-08-26' } }),
    React.createElement(DateRangePicker, { label: 'Reversed default range', defaultValue: { start: '2026-09-01', end: '2026-08-26' } }),
    React.createElement(DateRangePicker, { label: 'Equal range', value: { start: '2026-08-26', end: '2026-08-26' } }));
  const server = renderToString(renderFields());
  assert.match(server, /2026-01-01/u);
  assert.match(server, /2026-04-01/u);
  assert.match(server, /2026-09-01/u);

  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(renderFields()));
    const dateField = host.querySelector('.muxui-date-field');
    const datePicker = host.querySelector('.muxui-date-picker');
    const timeField = host.querySelector('.muxui-time-field');
    const ranges = host.querySelectorAll('.muxui-date-range-picker');
    const serializedInput = (field) => field?.querySelector('input[type="hidden"]:not(.muxui-form-reset-anchor)');
    assert.equal(host.querySelector('form')?.noValidate, true);
    assert.equal(serializedInput(dateField)?.value, '2026-01-01');
    assert.equal(serializedInput(datePicker)?.value, '2026-04-01');
    assert.equal(serializedInput(timeField)?.value, '09:00:00');
    assert.equal(dateField?.getAttribute('data-invalid'), 'true');
    assert.equal(datePicker?.getAttribute('data-invalid'), 'true');
    assert.equal(timeField?.getAttribute('data-invalid'), 'true');
    assert.equal(dateField?.querySelector('[data-type="day"]')?.getAttribute('aria-invalid'), 'true');
    assert.equal(datePicker?.querySelector('[data-type="day"]')?.getAttribute('aria-invalid'), 'true');
    assert.equal(timeField?.querySelector('[data-type="hour"]')?.getAttribute('aria-invalid'), 'true');
    for (const field of [dateField, datePicker, timeField, ranges[0], ranges[1]]) {
      assert.ok(field?.querySelector('.muxui-field-error')?.textContent.trim());
    }
    for (const range of [ranges[0], ranges[1]]) {
      assert.equal(range?.getAttribute('data-invalid'), 'true');
      assert.equal(range?.querySelector('[data-type="day"]')?.getAttribute('aria-invalid'), 'true');
    }
    assert.deepEqual([...ranges[0].querySelectorAll('input[type="hidden"]')].filter((input) => !input.classList.contains('muxui-form-reset-anchor')).map((input) => input.value), ['2026-09-01', '2026-08-26']);
    assert.deepEqual([...ranges[1].querySelectorAll('input[type="hidden"]')].filter((input) => !input.classList.contains('muxui-form-reset-anchor')).map((input) => input.value), ['2026-09-01', '2026-08-26']);
    assert.equal(ranges[2]?.getAttribute('data-invalid'), null);
    assert.equal(ranges[2]?.querySelector('.muxui-field-error'), null);
    assert.equal(ranges[2]?.querySelector('[data-type="day"]')?.getAttribute('aria-invalid'), null);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('temporal picker open ownership is independent and honors disabled/read-only state', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const restore = installDom(dom);
  let root;
  try {
    const openChanges = [];
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(DatePicker, { label: 'Controlled', value: '2026-08-26', open: false, onOpenChange: (open) => openChanges.push(['controlled', open]) }),
      React.createElement(DateRangePicker, { label: 'Default', defaultValue: { start: '2026-08-26', end: '2026-09-01' }, defaultOpen: true }),
      React.createElement(DatePicker, { label: 'Disabled', disabled: true }),
      React.createElement(DatePicker, { label: 'Read only', readOnly: true }),
      React.createElement(DateField, { label: 'Read only field', readOnly: true }))));
    const controlled = host.querySelector('.muxui-date-picker');
    const defaultOpen = host.querySelector('.muxui-date-range-picker');
    const pickers = host.querySelectorAll('.muxui-date-picker');
    assert.equal(controlled?.getAttribute('data-open'), null);
    assert.equal(defaultOpen?.getAttribute('data-open'), 'true');
    await act(async () => controlled.querySelector('.muxui-date-trigger').click());
    assert.deepEqual(openChanges, [['controlled', true]]);
    assert.equal(controlled.getAttribute('data-open'), null);
    assert.equal(pickers[1]?.querySelector('.muxui-date-trigger')?.disabled, true);
    assert.equal(pickers[2]?.querySelector('.muxui-date-trigger')?.disabled, true);
    assert.equal(host.querySelector('.muxui-date-field .muxui-date-segment')?.getAttribute('data-readonly'), 'true');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('read-only date segments retain accessible semantic contrast', async () => {
  const styles = await readFile(new URL('../generated/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.muxui-date-segment\[data-readonly\]\s*\{[^}]*color:\s*#79716b;/u);
  assert.match(styles, /\[data-muxui-color-scheme='dark'\] \.muxui-date-segment\[data-readonly\]:not\(\[data-type='literal'\]\)\s*\{[^}]*color:\s*#918b86;/u);
  const foreground = styles.match(/--muxui-semantic-content-default:\s*(#[0-9a-f]{6});/iu)?.[1];
  const background = styles.match(/--muxui-semantic-surface-canvas:\s*(#[0-9a-f]{6});/iu)?.[1];
  assert.ok(foreground);
  assert.ok(background);
  assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} lacks 4.5:1 contrast`);
});

test('R1.2 date ranges own paired FormData names and reset to their default', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(Form, null,
        React.createElement(DateRangePicker, { label: 'Trip', startName: 'tripStart', endName: 'tripEnd', defaultValue: { start: '2026-08-26', end: '2026-09-01' } }),
        React.createElement(TimeField, { label: 'Start time', name: 'startTime', defaultValue: '09:30' }),
        React.createElement('button', { type: 'reset' }, 'Reset')),
      React.createElement(Form, null,
        React.createElement(DateRangePicker, { label: 'Other trip', startName: 'otherStart', endName: 'otherEnd', defaultValue: { start: '2026-11-01', end: '2026-11-05' } })),
      React.createElement(Form, null,
        React.createElement(DateRangePicker, { label: 'Unnamed trip', defaultValue: { start: '2026-12-01', end: '2026-12-05' } }),
        React.createElement(TimeField, { label: 'Unnamed time', defaultValue: '11:30' }),
        React.createElement('button', { type: 'reset' }, 'Reset')),
      React.createElement(Form, null,
        React.createElement(DateRangePicker, { label: 'Disabled trip', startName: 'disabledStart', endName: 'disabledEnd', disabled: true, defaultValue: { start: '2026-12-10', end: '2026-12-15' } }),
        React.createElement(TimeField, { label: 'Disabled time', name: 'disabledTime', disabled: true, defaultValue: '13:30' }))
    )));
    const forms = host.querySelectorAll('form');
    const form = forms[0];
    const secondForm = forms[1];
    const unnamedForm = forms[2];
    const disabledForm = forms[3];
    const initial = new dom.window.FormData(form);
    assert.equal(initial.get('tripStart'), '2026-08-26');
    assert.equal(initial.get('tripEnd'), '2026-09-01');
    assert.equal(initial.get('startTime'), '09:30');
    const disabledData = new dom.window.FormData(disabledForm);
    assert.equal(disabledData.has('disabledStart'), false);
    assert.equal(disabledData.has('disabledEnd'), false);
    assert.equal(disabledData.has('disabledTime'), false);
    assert.equal(disabledForm.querySelector('input[name="disabledStart"]')?.disabled, true);
    assert.equal(disabledForm.querySelector('input[name="disabledEnd"]')?.disabled, true);
    assert.equal(disabledForm.querySelector('input[name="disabledTime"]')?.disabled, true);
    const editSegment = async (segment, nextValue) => {
      await act(async () => {
        segment.focus();
        segment.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: nextValue }));
        segment.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
      });
    };
    const firstRangeDay = form.querySelector('.muxui-date-range-picker [data-type="day"]');
    const firstTimeHour = form.querySelector('.muxui-time-field [data-type="hour"]');
    const secondRangeDay = secondForm.querySelector('.muxui-date-range-picker [data-type="day"]');
    const unnamedRangeDay = unnamedForm.querySelector('.muxui-date-range-picker [data-type="day"]');
    const unnamedTimeHour = unnamedForm.querySelector('.muxui-time-field [data-type="hour"]');
    await editSegment(firstRangeDay, '27');
    await editSegment(firstTimeHour, '10');
    await editSegment(secondRangeDay, '2');
    await editSegment(unnamedRangeDay, '2');
    await editSegment(unnamedTimeHour, '12');
    assert.equal(firstRangeDay.textContent, '27');
    assert.equal(firstTimeHour.textContent, '10');
    assert.equal(new dom.window.FormData(form).get('tripStart'), '2026-08-27');
    assert.equal(new dom.window.FormData(form).get('startTime'), '10:30:00');
    assert.equal(secondRangeDay.textContent, '2');
    assert.equal(unnamedRangeDay.textContent, '2');
    assert.equal(unnamedTimeHour.textContent, '12');
    await act(async () => form.reset());
    const afterReset = new dom.window.FormData(form);
    assert.equal(afterReset.get('tripStart'), '2026-08-26');
    assert.equal(afterReset.get('tripEnd'), '2026-09-01');
    assert.equal(afterReset.get('startTime'), '09:30');
    assert.equal(firstRangeDay.textContent, '26');
    assert.equal(firstTimeHour.textContent, '9');
    assert.equal(secondRangeDay.textContent, '2');
    await act(async () => unnamedForm.reset());
    assert.equal(new dom.window.FormData(unnamedForm).entries().next().done, true);
    assert.equal(unnamedRangeDay.textContent, '1');
    assert.equal(unnamedTimeHour.textContent, '11');
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Form, null,
      React.createElement(DateRangePicker, { label: 'Trip', startName: 'tripStart', endName: 'tripEnd', value: { start: '2026-10-01', end: '2026-10-05' } }))));
    const controlledForm = host.querySelector('form');
    const controlledStartDay = controlledForm.querySelector('.muxui-date-range-picker [data-type="day"]');
    await editSegment(controlledStartDay, '2');
    await act(async () => controlledForm.reset());
    const controlled = new dom.window.FormData(controlledForm);
    assert.equal(controlled.get('tripStart'), '2026-10-01');
    assert.equal(controlled.get('tripEnd'), '2026-10-05');
    assert.equal(controlledStartDay.textContent, '1');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.2 temporal fields honor cancelled form resets and reset normally', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    const temporalForm = (onReset, prefix) => React.createElement(Form, { onReset },
      React.createElement(DateRangePicker, {
        label: `${prefix} trip`,
        startName: `${prefix}Start`,
        endName: `${prefix}End`,
        defaultValue: { start: '2026-08-26', end: '2026-09-01' },
      }),
      React.createElement(TimeField, { label: `${prefix} time`, name: `${prefix}Time`, defaultValue: '09:30' }),
      React.createElement('button', { type: 'reset' }, 'Reset'));
    await act(async () => root.render(React.createElement(React.Fragment, null,
      temporalForm((event) => event.preventDefault(), 'cancel'),
      temporalForm(undefined, 'normal'))));
    const forms = host.querySelectorAll('form');
    const cancelledForm = forms[0];
    const normalForm = forms[1];
    const editSegment = async (segment, nextValue) => {
      await act(async () => {
        segment.focus();
        segment.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: nextValue }));
        segment.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
      });
    };
    const cancelledRangeDay = cancelledForm.querySelector('.muxui-date-range-picker [data-type="day"]');
    const cancelledTimeHour = cancelledForm.querySelector('.muxui-time-field [data-type="hour"]');
    await editSegment(cancelledRangeDay, '27');
    await editSegment(cancelledTimeHour, '10');
    assert.equal(new dom.window.FormData(cancelledForm).get('cancelStart'), '2026-08-27');
    assert.equal(new dom.window.FormData(cancelledForm).get('cancelTime'), '10:30:00');
    const cancelledReset = new Event('reset', { bubbles: true, cancelable: true });
    await act(async () => cancelledForm.dispatchEvent(cancelledReset));
    assert.equal(cancelledReset.defaultPrevented, true);
    assert.equal(new dom.window.FormData(cancelledForm).get('cancelStart'), '2026-08-27');
    assert.equal(new dom.window.FormData(cancelledForm).get('cancelTime'), '10:30:00');
    assert.equal(cancelledRangeDay.textContent, '27');
    assert.equal(cancelledTimeHour.textContent, '10');

    const normalRangeDay = normalForm.querySelector('.muxui-date-range-picker [data-type="day"]');
    const normalTimeHour = normalForm.querySelector('.muxui-time-field [data-type="hour"]');
    await editSegment(normalRangeDay, '27');
    await editSegment(normalTimeHour, '10');
    await act(async () => normalForm.reset());
    assert.equal(normalRangeDay.textContent, '26');
    assert.equal(normalTimeHour.textContent, '9');
    assert.equal(new dom.window.FormData(normalForm).get('normalStart'), '2026-08-26');
    assert.equal(new dom.window.FormData(normalForm).get('normalTime'), '09:30');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.2 autocomplete is closed on SSR, filters while focused, and selects MuxUI items', async () => {
  const server = renderToString(React.createElement(Autocomplete, { label: 'City', items: ['Melbourne', 'Sydney'] }));
  assert.match(server, /type="search"/u);
  assert.doesNotMatch(server, /role="combobox"/u);
  assert.match(server, /hidden=""/u);
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const selected = [];
  const selectedItems = [];
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Autocomplete, { label: 'City', items: ['Melbourne', 'Sydney'], onSelect: (item) => { selected.push(item?.value); selectedItems.push(item); } })));
    const input = host.querySelector('.muxui-autocomplete input');
    await act(async () => input.focus());
    assert.equal(host.querySelector('.muxui-autocomplete-list').hidden, false);
    await act(async () => root.render(React.createElement(Autocomplete, { label: 'City', value: 'Mel', items: ['Melbourne', 'Sydney'], onSelect: (item) => { selected.push(item?.value); selectedItems.push(item); } })));
    assert.equal(host.querySelectorAll('.muxui-autocomplete-option').length, 1);
    await act(async () => host.querySelector('.muxui-autocomplete-option').click());
    assert.deepEqual(selected, ['Melbourne']);
    assert.deepEqual(selectedItems, [{ id: 'Melbourne', label: 'Melbourne', value: 'Melbourne' }]);
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.2 autocomplete preserves rich labels for SSR and text filtering', async () => {
  const items = [{ id: 'mel', label: React.createElement('strong', null, 'Melbourne'), value: 'Melbourne' }];
  const server = renderToString(React.createElement(Autocomplete, { label: 'City', items }));
  assert.match(server, /<strong>Melbourne<\/strong>/u);
  assert.doesNotMatch(server, /\[object Object\]/u);
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Autocomplete, { label: 'City', value: 'Mel', items })));
    const option = host.querySelector('.muxui-autocomplete-option');
    assert.ok(option);
    assert.match(option.innerHTML, /<strong>Melbourne<\/strong>/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Autocomplete disabled items map to inert options and suppress callbacks', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  const selected = [];
  let root;
  try {
    const host = document.querySelector('#root');
    const items = [
      { id: 'disabled', label: 'Disabled', value: 'disabled', disabled: true },
      { id: 'enabled', label: 'Enabled', value: 'enabled' },
      { id: 'also-disabled', label: 'Also disabled', value: 'also-disabled', disabled: true },
    ];
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Autocomplete, {
      label: 'City',
      items,
      onChange: (value) => changes.push(value),
      onSelect: (item) => selected.push(item?.id),
    })));
    const options = [...host.querySelectorAll('.muxui-autocomplete-option')];
    assert.equal(options.length, 3);
    assert.deepEqual(options.map((option) => option.getAttribute('data-disabled')), ['true', null, 'true']);
    assert.deepEqual(options.map((option) => option.getAttribute('aria-disabled')), ['true', null, 'true']);

    await act(async () => options[0].click());
    assert.deepEqual(changes, []);
    assert.deepEqual(selected, []);

  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('R1.2 readonly autocomplete only permits viewing suggestions', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  const selected = [];
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    const renderAutocomplete = () => React.createElement(Autocomplete, {
      label: 'City',
      defaultValue: 'Melbourne',
      items: ['Melbourne', 'Sydney'],
      readOnly: true,
      onChange: (value) => changes.push(value),
      onSelect: (item) => selected.push(item),
    });
    await act(async () => root.render(renderAutocomplete()));
    const input = host.querySelector('.muxui-autocomplete input');
    await act(async () => input.focus());
    assert.equal(input.readOnly, true);
    assert.equal(host.querySelector('.muxui-autocomplete-list').hidden, false);
    input.value = 'Sydney';
    await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })));
    await act(async () => host.querySelector('.muxui-autocomplete-option').click());
    assert.deepEqual(changes, []);
    assert.deepEqual(selected, []);
    assert.equal(host.querySelector('.muxui-autocomplete-list').hidden, false);
    await act(async () => root.render(renderAutocomplete()));
    assert.equal(input.value, 'Melbourne');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});

test('R1.2 autocomplete placeholder stays aligned across artifact, types, and runtime', async () => {
  const { readFile } = await import('node:fs/promises');
  const [artifactSource, typesSource] = await Promise.all([
    readFile(new URL('../../../catalog/components/autocomplete/artifact.json', import.meta.url), 'utf8'),
    readFile(new URL('../generated/index.d.ts', import.meta.url), 'utf8'),
  ]);
  const artifact = JSON.parse(artifactSource);
  assert.equal(artifact.bindings['web.react'].api.props.includes('placeholder'), true);
  assert.match(typesSource, /export type AutocompleteProps = .*placeholder\?: string;/u);
  const server = renderToString(React.createElement(Autocomplete, { label: 'City', placeholder: 'Search city' }));
  assert.match(server, /placeholder="Search city"/u);
});

test('R1.2 name-required fields reject dangling unnamed runtime instances', () => {
  assert.throws(() => renderToString(React.createElement(TextField)), /requires label, aria-label, or aria-labelledby/u);
  assert.throws(() => renderToString(React.createElement(Switch, null, 'Enabled')), /requires label, aria-label, or aria-labelledby/u);
  assert.doesNotThrow(() => renderToString(React.createElement(TextField, { 'aria-label': 'Name' })));
});

test('R1.2 fields do not forward unsupported validation props', () => {
  const fieldsWithUnsupportedValidation = [
    React.createElement(TextField, { label: 'Name' }),
    React.createElement(SearchField, { label: 'Search' }),
    React.createElement(NumberField, { label: 'Quantity' }),
    React.createElement(CheckboxGroup, { label: 'Alerts' }),
    React.createElement(DateField, { label: 'Birthday' }),
    React.createElement(DatePicker, { label: 'Due' }),
    React.createElement(DateRangePicker, { label: 'Trip' }),
    React.createElement(TimeField, { label: 'Start' }),
    React.createElement(Autocomplete, { label: 'City' }),
  ];
  for (const field of fieldsWithUnsupportedValidation) {
    const markup = renderToString(React.cloneElement(field, { validationBehavior: 'native' }));
    assert.doesNotMatch(markup, /data-required|data-invalid|validationBehavior/u);
  }
});

test('R1.2 CheckboxGroup owns option names for required FormData submission', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    const host = document.querySelector('#root');
    root = createRoot(host);
    await act(async () => root.render(React.createElement(Form, null,
      React.createElement(CheckboxGroup, { label: 'Alerts', name: 'alerts', required: true, defaultValue: ['email'] },
        React.createElement(Checkbox, { value: 'email' }, 'Email'),
        React.createElement(Checkbox, { value: 'sms' }, 'SMS')),
      React.createElement(CheckboxGroup, { label: 'Nested alerts', name: 'nestedAlerts', defaultValue: ['push', 'sms'] },
        React.createElement(React.Fragment, null,
          React.createElement(Checkbox, { value: 'push' }, 'Push'),
          React.createElement(OptionsWrapper, null))))));
    const formData = new dom.window.FormData(host.querySelector('form'));
    assert.deepEqual(formData.getAll('alerts'), ['email']);
    assert.deepEqual(formData.getAll('nestedAlerts'), ['push', 'sms']);
    assert.equal(host.querySelector('[role="group"]').getAttribute('data-required'), 'true');
    await act(async () => root.unmount());
  } finally {
    restore();
    dom.window.close();
  }
});
