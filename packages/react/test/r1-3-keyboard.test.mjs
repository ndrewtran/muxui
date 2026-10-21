import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseColor } from 'react-aria-components';
import { Calendar, ColorArea, ColorField, ColorSwatchPicker, Slider, ToggleButtonGroup } from '../src/collections.mjs';
import { ToggleButton } from '../src/components.ts';
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
      await act(async () => { document.activeElement?.blur?.(); root.unmount(); });
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

// ColorArea edits saturation (x) and brightness (y) whatever format the value uses, and emits the
// CSS string of the value's color space like ColorSlider: rgba() for hex and rgb, hsla() for hsl and hsb.
const areaFormats = [
  ['hex', '#336699', /^rgba\(\d+, \d+, \d+, 1\)$/u],
  ['rgb', 'rgb(51, 102, 153)', /^rgba\(\d+, \d+, \d+, 1\)$/u],
  ['hsl', 'hsl(210, 50%, 40%)', /^hsla\(210, [\d.]+%, [\d.]+%, 1\)$/u],
  ['hsb', 'hsb(210, 60%, 40%)', /^hsla\(210, [\d.]+%, [\d.]+%, 1\)$/u],
];
const hsbOf = (text) => parseColor(text).toFormat('hsb');

for (const [name, defaultValue, emitted] of areaFormats) {
  test(`R1.3 ColorArea arrows move saturation on x and brightness on y for a ${name} value`, async () => {
    const changes = [];
    const view = await mount(React.createElement(ColorArea, { 'aria-label': 'Colour', defaultValue, onChange: (value) => changes.push(value) }));
    try {
      const [xInput, yInput] = view.container.querySelectorAll('input[type="range"]');
      assert.match(xInput.getAttribute('aria-valuetext'), /^Saturation:/u);
      assert.match(yInput.getAttribute('aria-valuetext'), /^Brightness:/u);
      const values = () => [Number(xInput.value), Number(yInput.value)];
      const start = values();
      await act(async () => xInput.focus());
      await view.press('ArrowRight');
      assert.ok(values()[0] > start[0], 'ArrowRight raises saturation');
      assert.equal(values()[1], start[1], 'ArrowRight keeps brightness');
      await view.press('ArrowUp');
      assert.ok(values()[1] > start[1], 'ArrowUp raises brightness');
      const raised = values();
      await view.press('ArrowLeft');
      assert.ok(values()[0] < raised[0], 'ArrowLeft lowers saturation');
      assert.equal(values()[1], raised[1], 'ArrowLeft keeps brightness');
      await view.press('ArrowDown');
      assert.ok(values()[1] < raised[1], 'ArrowDown lowers brightness');
      assert.equal(changes.length, 4);
      assert.ok(changes.every((value) => emitted.test(value)), `every change is in the ${name} value's color space: ${changes.join(' ')}`);
      // The first change raises saturation only; hue and brightness survive the conversion back.
      const first = hsbOf(changes[0]);
      const origin = hsbOf(defaultValue);
      assert.ok(first.saturation > origin.saturation, 'the emitted color has more saturation');
      assert.ok(Math.abs(first.brightness - origin.brightness) < 1.5, 'the emitted color keeps its brightness');
      assert.ok(Math.abs(first.hue - origin.hue) < 2, 'the emitted color keeps its hue');
    } finally {
      await view.cleanup();
    }
  });
}

// A controlled area whose value the test can also change from outside, the way an application would.
// `accept` rewrites what the application stores, `defer` holds each change until `acceptPending()`,
// and `strict` renders under React.StrictMode.
async function mountControlled(initial, { accept = (next) => next, defer = false, strict = false } = {}) {
  const changes = [];
  let setValue;
  let pending;
  function Controlled() {
    const [value, set] = React.useState(initial);
    setValue = set;
    return React.createElement(ColorArea, { 'aria-label': 'Colour', value, onChange: (next) => { changes.push(next); pending = next; if (!defer) set(accept(next)); } });
  }
  const view = await mount(strict ? React.createElement(React.StrictMode, null, React.createElement(Controlled)) : React.createElement(Controlled));
  const [xInput, yInput] = view.container.querySelectorAll('input[type="range"]');
  return {
    ...view,
    changes,
    channels: () => [xInput.value, yInput.value],
    focusBrightness: () => act(async () => yInput.focus()),
    setExternally: (next) => act(async () => setValue(next)),
    acceptPending: () => act(async () => setValue(accept(pending))),
  };
}

for (const strict of [false, true]) {
  test(`R1.3 a controlled ColorArea keeps its hue and saturation while a hex value passes through black${strict ? ' in StrictMode' : ''}`, async () => {
    const view = await mountControlled('#336699', { strict });
    try {
      const start = view.channels();
      await view.focusBrightness();
      for (let step = 0; step < 6; step += 1) await view.press('PageDown');
      assert.equal(view.changes.at(-1), 'rgba(0, 0, 0, 1)', 'brightness 0 is black');
      for (let step = 0; step < 6; step += 1) await view.press('PageUp');
      assert.equal(view.changes.at(-1), 'rgba(51, 102, 153, 1)', 'raising brightness again restores the original color');
      assert.deepEqual(view.channels(), start);
    } finally {
      await view.cleanup();
    }
  });
}

test('R1.3 a controlled ColorArea keeps its memory until an application that accepts changes later does', async () => {
  const view = await mountControlled('#336699', { defer: true });
  try {
    await view.focusBrightness();
    for (let step = 0; step < 6; step += 1) {
      await view.press('PageDown');
      await view.acceptPending();
    }
    assert.equal(view.changes.at(-1), 'rgba(0, 0, 0, 1)');
    await view.press('PageUp');
    assert.deepEqual(view.channels(), ['0', '0'], 'the area shows the black the application still holds');
    await view.acceptPending();
    assert.equal(view.changes.at(-1), 'rgba(8, 17, 26, 1)', 'brightness rises from black in the remembered hue, not as gray');
    assert.deepEqual(view.channels(), ['66.67', '10']);
  } finally {
    await view.cleanup();
  }
});

for (const [from, to, initial] of [['360', '0', 'hsb(360, 60%, 40%)'], ['0', '360', 'hsb(0, 60%, 40%)']]) {
  test(`R1.3 a controlled ColorArea treats hue ${from} and hue ${to} as the same hue`, async () => {
    // The application stores the black it receives with the other spelling of the hue.
    const view = await mountControlled(initial, { accept: (next) => next.replace(`hsla(${from},`, `hsla(${to},`) });
    try {
      await view.focusBrightness();
      for (let step = 0; step < 4; step += 1) await view.press('PageDown');
      assert.equal(view.changes.at(-1), `hsla(${from}, 0%, 0%, 1)`);
      assert.deepEqual(view.channels(), ['60', '0'], 'the remembered saturation survives the rewritten hue');
    } finally {
      await view.cleanup();
    }
  });
}

test('R1.3 a controlled ColorArea forgets its remembered hue when the value changes from outside', async () => {
  const view = await mountControlled('#336699');
  try {
    await view.focusBrightness();
    for (let step = 0; step < 6; step += 1) await view.press('PageDown');
    await view.setExternally('#00ff00');
    assert.deepEqual(view.channels(), ['100', '100'], 'the outside color is shown as it is');
    // Black again, but now it is the outside value and not the area's own edit.
    await view.setExternally('#000000');
    assert.deepEqual(view.channels(), ['0', '0'], 'the old blue is not remembered');
    await view.press('PageUp');
    assert.equal(view.changes.at(-1), 'rgba(26, 26, 26, 1)', 'brightness rises from black without a hue');
  } finally {
    await view.cleanup();
  }
});

test('R1.3 a controlled ColorArea treats a fractional rgb value near the remembered black as a new color', async () => {
  const view = await mountControlled('#336699');
  try {
    await view.focusBrightness();
    for (let step = 0; step < 6; step += 1) await view.press('PageDown');
    // Not the black the area emitted, though within a hundredth of every channel.
    await view.setExternally('rgb(0.009, 0, 0)');
    await view.press('PageUp');
    assert.equal(view.changes.at(-1), 'rgba(26, 0, 0, 1)', 'brightness rises in the red of the new value, not the remembered blue');
  } finally {
    await view.cleanup();
  }
});

test('R1.3 a controlled ColorArea shows an hsb value that serializes like its last edit', async () => {
  const view = await mountControlled('hsb(210, 60%, 40%)');
  try {
    await view.focusBrightness();
    for (let step = 0; step < 4; step += 1) await view.press('PageDown');
    assert.equal(view.changes.at(-1), 'hsla(210, 0%, 0%, 1)', 'brightness 0 is black');
    // The same black as hsla(), yet a different saturation.
    await view.setExternally('hsb(210, 10%, 0%)');
    assert.deepEqual(view.channels(), ['10', '0']);
    await view.press('PageUp');
    assert.deepEqual(view.channels(), ['10', '10']);
  } finally {
    await view.cleanup();
  }
});

test('R1.3 ColorArea steps by one on arrows and by ten on Page and Home/End, and clamps at the edges', async () => {
  const view = await mount(React.createElement(ColorArea, { 'aria-label': 'Colour', defaultValue: 'hsb(210, 55%, 45%)' }));
  try {
    const [xInput, yInput] = view.container.querySelectorAll('input[type="range"]');
    const channels = () => [xInput.value, yInput.value];
    await act(async () => xInput.focus());
    // Arrows move one point; Page Up and Page Down move brightness and End and Home move saturation by ten.
    for (const [key, expected] of [
      ['ArrowRight', ['56', '45']], ['ArrowLeft', ['55', '45']], ['ArrowUp', ['55', '46']], ['ArrowDown', ['55', '45']],
      ['PageUp', ['55', '55']], ['PageDown', ['55', '45']], ['End', ['65', '45']], ['Home', ['55', '45']],
    ]) {
      await view.press(key);
      assert.deepEqual(channels(), expected, key);
    }
    // Ten-point steps stop at the range ends: Home and PageDown at 0, End and PageUp at 100.
    for (const [key, expected] of [
      ['Home', ['45', '45']], ['Home', ['35', '45']], ['Home', ['25', '45']], ['Home', ['15', '45']], ['Home', ['5', '45']], ['Home', ['0', '45']],
      ['End', ['10', '45']],
    ]) {
      await view.press(key);
      assert.deepEqual(channels(), expected, key);
    }
    for (let step = 0; step < 5; step += 1) await view.press('PageUp');
    assert.deepEqual(channels(), ['10', '95']);
    await view.press('PageUp');
    assert.deepEqual(channels(), ['10', '100'], 'PageUp clamps at 100');
    for (let step = 0; step < 11; step += 1) await view.press('PageDown');
    assert.deepEqual(channels(), ['10', '0'], 'PageDown clamps at 0');
    for (let step = 0; step < 10; step += 1) await view.press('End');
    assert.deepEqual(channels(), ['100', '0'], 'End clamps at 100');
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
