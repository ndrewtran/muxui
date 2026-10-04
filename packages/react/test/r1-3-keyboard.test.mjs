import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Calendar, ColorArea, ColorField, ColorSwatchPicker, Slider, ToggleButtonGroup } from '../src/collections.mjs';
import { ToggleButton } from '../src/components.mjs';
import { createDom } from './support/dom.mjs';

function press(target, key, modifiers = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...modifiers }));
}

// Renders one element into a fresh jsdom root and returns helpers bound to it.
async function mount(element, markup) {
  const env = createDom(markup);
  const container = document.querySelector('#root');
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    rerender: (next) => act(async () => root.render(next)),
    async press(key, modifiers) { await act(async () => press(document.activeElement, key, modifiers)); },
    async cleanup() {
      document.activeElement?.blur?.();
      await act(async () => root.unmount());
      env.restore();
    },
  };
}

test('R1.3 Calendar keyboard moves by day, week, month, year, and month edges', async () => {
  const focused = [];
  const changes = [];
  const view = await mount(React.createElement(Calendar, { 'aria-label': 'Date', defaultValue: '2026-03-18', onFocusChange: (date) => focused.push(date), onChange: (date) => changes.push(date) }));
  try {
    await act(async () => view.container.querySelector('[role="button"][tabindex="0"]').focus());
    const steps = [
      ['ArrowRight', {}, '2026-03-19'], ['ArrowDown', {}, '2026-03-26'], ['ArrowLeft', {}, '2026-03-25'], ['ArrowUp', {}, '2026-03-18'],
      ['PageDown', {}, '2026-04-18'], ['PageUp', {}, '2026-03-18'],
      ['PageDown', { shiftKey: true }, '2027-03-18'], ['PageUp', { shiftKey: true }, '2026-03-18'],
      ['Home', {}, '2026-03-01'], ['End', {}, '2026-03-31'],
    ];
    for (const [key, modifiers, expected] of steps) {
      await view.press(key, modifiers);
      assert.equal(focused.at(-1), expected, `${modifiers.shiftKey ? 'Shift+' : ''}${key} focuses ${expected}`);
      assert.match(document.activeElement.getAttribute('aria-label'), new RegExp(new Date(`${expected}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'long' }), 'u'));
    }
    await view.press('Enter');
    assert.deepEqual(changes, ['2026-03-31']);
  } finally {
    await view.cleanup();
  }
});

test('R1.3 ColorArea arrows adjust x and y channels independently', async () => {
  const changes = [];
  const view = await mount(React.createElement(ColorArea, { 'aria-label': 'Colour', defaultValue: '#808080', onChange: (value) => changes.push(value) }));
  try {
    const [xInput, yInput] = view.container.querySelectorAll('input[type="range"]');
    const values = () => [xInput.value, yInput.value];
    await act(async () => xInput.focus());
    const start = values();
    await view.press('ArrowRight');
    assert.ok(Number(values()[0]) > Number(start[0]), 'ArrowRight raises x');
    assert.equal(values()[1], start[1], 'ArrowRight keeps y');
    await view.press('ArrowUp');
    assert.ok(Number(values()[1]) > Number(start[1]), 'ArrowUp raises y');
    await view.press('ArrowLeft');
    await view.press('ArrowDown');
    assert.deepEqual(values(), start);
    assert.equal(changes.length, 4);
  } finally {
    await view.cleanup();
  }
});

test('R1.3 ColorSwatchPicker arrows move focus and Enter selects', async () => {
  const changes = [];
  const items = [{ id: 'red', color: '#ff0000' }, { id: 'green', color: '#00ff00' }, { id: 'blue', color: '#0000ff' }];
  const view = await mount(React.createElement(ColorSwatchPicker, { 'aria-label': 'Swatches', defaultValue: '#ff0000', items, onChange: (value) => changes.push(value) }));
  try {
    const options = [...view.container.querySelectorAll('[role="option"]')];
    await act(async () => options[0].focus());
    await view.press('ArrowRight');
    assert.equal(document.activeElement, options[1]);
    await view.press('ArrowRight');
    assert.equal(document.activeElement, options[2]);
    await view.press('ArrowLeft');
    assert.equal(document.activeElement, options[1]);
    assert.deepEqual(changes, [], 'arrows only move focus');
    await view.press('Enter');
    assert.equal(changes.length, 1);
    assert.equal(options[1].getAttribute('aria-selected'), 'true');
  } finally {
    await view.cleanup();
  }
});

test('R1.3 ToggleButtonGroup arrows move focus between buttons without toggling', async () => {
  const changes = [];
  const view = await mount(React.createElement(ToggleButtonGroup, { 'aria-label': 'Styles', selectionMode: 'multiple', onSelectionChange: (ids) => changes.push(ids) },
    React.createElement(ToggleButton, { id: 'bold' }, 'Bold'),
    React.createElement(ToggleButton, { id: 'italic' }, 'Italic'),
    React.createElement(ToggleButton, { id: 'underline' }, 'Underline')));
  try {
    const buttons = [...view.container.querySelectorAll('button')];
    await act(async () => buttons[0].focus());
    await view.press('ArrowRight');
    assert.equal(document.activeElement, buttons[1]);
    await view.press('ArrowRight');
    assert.equal(document.activeElement, buttons[2]);
    await view.press('ArrowLeft');
    assert.equal(document.activeElement, buttons[1]);
    assert.deepEqual(changes, []);
  } finally {
    await view.cleanup();
  }
});

test('R1.3 Slider Page Up and Page Down move by a tenth of the range', async () => {
  const changes = [];
  const view = await mount(React.createElement(Slider, { label: 'Volume', defaultValue: 50, onChange: (value) => changes.push(value) }));
  try {
    await act(async () => view.container.querySelector('input[type="range"]').focus());
    for (const key of ['PageUp', 'PageUp', 'PageDown', 'Home', 'End']) await view.press(key);
    assert.deepEqual(changes, [60, 70, 60, 0, 100]);
  } finally {
    await view.cleanup();
  }
});

test('R1.3 ColorField restores its default value on form reset', async () => {
  const view = await mount(React.createElement(ColorField, { label: 'Brand', name: 'brand', defaultValue: '#ff0000' }), '<form id="form"><div id="root"></div></form>');
  try {
    const form = document.querySelector('#form');
    const input = view.container.querySelector('input');
    await act(async () => input.focus());
    // React DOM loads before jsdom here, so it detects edits through keyup value polling.
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#00ff00');
      input.dispatchEvent(new KeyboardEvent('keyup', { key: '0', bubbles: true }));
    });
    await act(async () => input.blur());
    assert.equal(new FormData(form).get('brand'), '#00FF00');
    await act(async () => form.reset());
    assert.equal(input.value, '#FF0000');
    assert.equal(new FormData(form).get('brand'), '#FF0000');
  } finally {
    await view.cleanup();
  }
});
