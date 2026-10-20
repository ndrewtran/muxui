import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { parseColor } from 'react-aria-components';
import { ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatchPicker, ColorWheel } from '../src/collections.mjs';
import { createDom } from './support/dom.mjs';

// Every color control's onChange returns a CSS string in the color space of its value, or of an enclosing
// ColorPicker's color, otherwise of defaultValue: rgba() for hex and rgb, hsla() for hsl and hsb.
const rgba = /^rgba\(\d+, \d+, \d+, 1\)$/u;
const hsla = /^hsla\(\d+, [\d.]+%, [\d.]+%, 1\)$/u;

function keyPress(target, key) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
}

// ColorField reads typed text on keyup in jsdom, then commits on blur.
async function typeColor(input, text) {
  await act(async () => input.focus());
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);
    input.dispatchEvent(new KeyboardEvent('keyup', { key: text.at(-1), bubbles: true }));
  });
  await act(async () => input.blur());
}

// Renders `element` into a fresh jsdom root and hands `scenario` the container and a re-render function.
async function withRoot(element, scenario) {
  const env = createDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  try {
    await act(async () => root.render(element));
    await scenario({ container, render: (next) => act(async () => root.render(next)) });
  } finally {
    await act(async () => { document.activeElement?.blur(); root.unmount(); });
    env.restore();
  }
}

const wheelInput = (container, label) => container.querySelector(`.muxui-color-wheel input[aria-label="${label}"]`);
const fieldInput = (container, label) => [...container.querySelectorAll('.muxui-color-field')].find((field) => field.querySelector('label')?.textContent === label).querySelector('input');
const nudgeWheel = async (input) => { await act(async () => input.focus()); await act(async () => keyPress(input, 'ArrowRight')); };

// `wheel` and `field` are standalone controls; `picker` is the ColorPicker and the controls nested in it.
const spaces = [
  ['hex', '#336699', { wheel: rgba, field: rgba, picker: rgba }],
  ['rgb', 'rgb(51, 102, 153)', { wheel: rgba, field: rgba, picker: rgba }],
  ['hsl', 'hsl(210, 50%, 40%)', { wheel: hsla, field: hsla, picker: hsla }],
  ['hsb', 'hsb(210, 60%, 40%)', { wheel: hsla, field: hsla, picker: hsla }],
  // With no color at all each control keeps its default: the wheel starts at red hsl, the field and picker at black rgb.
  ['no', undefined, { wheel: hsla, field: rgba, picker: rgba }],
];

for (const [name, value, expected] of spaces) {
  test(`ColorWheel, ColorField, and ColorPicker emit the color space of ${name === 'no' ? 'no' : `a ${name}`} value`, async () => {
    const changes = { wheel: [], controlledWheel: [], field: [], controlledField: [], picker: [], nestedWheel: [], nestedField: [] };
    const record = (key) => (next) => changes[key].push(next);
    const h = React.createElement;
    // A controlled control that never accepts the edit still reports it, so each reports once per edit.
    await withRoot(h('div', null,
      h(ColorWheel, { 'aria-label': 'Wheel', defaultValue: value, onChange: record('wheel') }),
      h(ColorWheel, { 'aria-label': 'Controlled wheel', value, onChange: record('controlledWheel') }),
      h(ColorField, { label: 'Field', defaultValue: value, onChange: record('field') }),
      h(ColorField, { label: 'Controlled field', value, onChange: record('controlledField') }),
      h(ColorPicker, { defaultValue: value, onChange: record('picker') },
        h(ColorWheel, { 'aria-label': 'Nested wheel', onChange: record('nestedWheel') }),
        h(ColorField, { label: 'Nested field', onChange: record('nestedField') }))), async ({ container }) => {
      for (const label of ['Wheel', 'Controlled wheel', 'Nested wheel']) await nudgeWheel(wheelInput(container, label));
      for (const label of ['Field', 'Controlled field', 'Nested field']) await typeColor(fieldInput(container, label), '#112233');
      const emitted = (...keys) => keys.flatMap((key) => changes[key].map((next) => [key, next]));
      assert.equal(changes.picker.length, 2, 'the picker reports the nested wheel and the nested field');
      for (const [key, next] of emitted('wheel', 'controlledWheel')) assert.match(next, expected.wheel, `${key}: ${next}`);
      for (const [key, next] of emitted('field', 'controlledField')) assert.match(next, expected.field, `${key}: ${next}`);
      for (const [key, next] of emitted('nestedWheel', 'nestedField', 'picker')) assert.match(next, expected.picker, `${key}: ${next}`);
      for (const key of ['wheel', 'controlledWheel', 'field', 'controlledField', 'nestedWheel', 'nestedField']) assert.equal(changes[key].length, 1, `${key} reports once`);
      assert.equal(changes.picker[0], changes.nestedWheel[0], 'the picker reports what the nested wheel reports');
      assert.equal(changes.picker[1], changes.nestedField[0], 'the picker reports what the nested field reports');
    });
  });
}

test('ColorField reports null when cleared and the typed color in the space of an enclosing ColorPicker', async () => {
  const changes = [];
  await withRoot(React.createElement(ColorPicker, { value: 'hsl(210, 50%, 40%)' },
    React.createElement(ColorField, { label: 'Colour', onChange: (next) => changes.push(next) })), async ({ container }) => {
    const input = fieldInput(container, 'Colour');
    await typeColor(input, '#112233');
    await typeColor(input, '');
    assert.equal(changes.length, 2);
    assert.match(changes[0], hsla);
    assert.equal(changes[1], null);
  });
});

test('ColorSwatchPicker returns the chosen item in its own color space', async () => {
  const items = [
    { id: 'hex', color: '#ff0000' },
    { id: 'rgb', color: 'rgb(0, 255, 0)' },
    { id: 'hsl', color: 'hsl(240, 100%, 50%)' },
    { id: 'hsb', color: 'hsb(60, 100%, 100%)' },
  ];
  const changes = [];
  await withRoot(React.createElement(ColorSwatchPicker, { 'aria-label': 'Palette', items, onChange: (next) => changes.push(next) }), async ({ container }) => {
    for (const option of container.querySelectorAll('.muxui-color-swatch-picker-item')) await act(async () => option.click());
    assert.deepEqual(changes, ['rgba(255, 0, 0, 1)', 'rgba(0, 255, 0, 1)', 'hsla(240, 100%, 50%, 1)', 'hsla(60, 100%, 50%, 1)']);
  });
});

test('ColorPicker keeps its color in the space of its value after any nested edit', async () => {
  const h = React.createElement;
  // A slider without colorSpace throws once the picker color leaves its channel's space, so it proves the space holds.
  const picker = (props, channel) => h(ColorPicker, props,
    h(ColorWheel, { 'aria-label': 'Wheel' }),
    h(ColorSwatchPicker, { 'aria-label': 'Palette', items: [{ id: 'green', color: 'hsl(120, 100%, 50%)' }, { id: 'blue', color: '#0000ff' }] }),
    h(ColorSlider, { 'aria-label': 'Slider', channel }));
  for (const [defaultValue, channel] of [['#336699', 'red'], ['hsl(210, 50%, 40%)', 'lightness'], ['hsb(210, 60%, 40%)', 'brightness']]) {
    const changes = [];
    await withRoot(picker({ key: defaultValue, defaultValue, onChange: (next) => changes.push(next) }, channel), async ({ container }) => {
      await nudgeWheel(wheelInput(container, 'Wheel'));
      for (const option of container.querySelectorAll('.muxui-color-swatch-picker-item')) await act(async () => option.click());
      await nudgeWheel(wheelInput(container, 'Wheel'));
      assert.equal(changes.length, 4, defaultValue);
      const notation = defaultValue.startsWith('#') ? rgba : hsla;
      for (const next of changes) assert.match(next, notation, `${defaultValue}: ${next}`);
      assert.equal(container.querySelectorAll('.muxui-color-slider input[type="range"]').length, 1);
    });
  }
});

// The wheel edits hue, which hex and rgb colors cannot hold for black, white, and grays, so a wheel driven by
// a value, or by its picker, remembers its last edit while the value still describes it.
function Echo({ initial, picker, log }) {
  const [value, setValue] = React.useState(initial);
  const onChange = (next) => { log(next); setValue(next); };
  return picker
    ? React.createElement(ColorPicker, { value, onChange }, React.createElement(ColorWheel, { 'aria-label': 'Wheel' }))
    : React.createElement(ColorWheel, { 'aria-label': 'Wheel', value, onChange });
}

for (const [name, initial, gray] of [
  ['hex gray', '#808080', 'rgba(128, 128, 128, 1)'],
  ['rgb black', 'rgb(0, 0, 0)', 'rgba(0, 0, 0, 1)'],
  ['hex white', '#ffffff', 'rgba(255, 255, 255, 1)'],
]) {
  for (const picker of [false, true]) {
    test(`a ${picker ? 'controlled ColorPicker holding' : 'controlled ColorWheel holding'} a ${name} follows hue edits`, async () => {
      const emitted = [];
      await withRoot(React.createElement(Echo, { initial, picker, log: (next) => emitted.push(next) }), async ({ container }) => {
        const input = wheelInput(container, 'Wheel');
        await act(async () => input.focus());
        const hues = [];
        for (let press = 0; press < 3; press += 1) {
          await act(async () => keyPress(input, 'ArrowRight'));
          hues.push(input.value);
        }
        assert.deepEqual(hues, ['1', '2', '3'], 'the hue advances instead of snapping back to 0');
        await act(async () => keyPress(input, 'ArrowLeft'));
        assert.equal(input.value, '2');
        if (!picker) assert.deepEqual(new Set(emitted), new Set([gray]), 'every edit is the same rgb color');
      });
    });
  }
}

test('a controlled ColorWheel forgets a remembered hue when the value changes to another color', async () => {
  let setValue;
  function Controlled() {
    const [value, set] = React.useState('#808080');
    setValue = set;
    return React.createElement(ColorWheel, { 'aria-label': 'Wheel', value, onChange: set });
  }
  await withRoot(React.createElement(Controlled), async () => {
    const input = wheelInput(document, 'Wheel');
    await nudgeWheel(input);
    await nudgeWheel(input);
    assert.equal(input.value, '2');
    await act(async () => setValue('#00ff00'));
    assert.equal(input.value, '120', 'a different color shows its own hue');
    await act(async () => setValue('#808080'));
    assert.equal(input.value, '0', 'the gray is the value again, without the old hue');
  });
});

// Hex and rgb cannot hold the hue of black, white, and grays, so the picker remembers the last edit of whichever
// nested control made it. A hue slider then moves off an achromatic color, and a sibling area edits in its hue.
function HuePicker({ initial, controlled, colorSpace, log }) {
  const [value, setValue] = React.useState(initial);
  const onChange = (next) => { log(next); setValue(next); };
  return React.createElement(ColorPicker, controlled ? { value, onChange } : { defaultValue: initial, onChange: log },
    React.createElement(ColorArea, { 'aria-label': 'Area' }),
    React.createElement(ColorSlider, { 'aria-label': 'Hue', channel: 'hue', colorSpace }));
}

for (const colorSpace of ['hsl', 'hsb']) {
  for (const [name, initial, same] of [['black', '#000000', 'rgba(0, 0, 0, 1)'], ['white', '#ffffff', 'rgba(255, 255, 255, 1)'], ['gray', '#808080', 'rgba(128, 128, 128, 1)']]) {
    for (const controlled of [false, true]) {
      test(`a ${colorSpace} hue ColorSlider moves off ${name} in a ${controlled ? 'controlled' : 'uncontrolled'} hex ColorPicker, then the area edits in that hue`, async () => {
        const emitted = [];
        await withRoot(React.createElement(HuePicker, { initial, controlled, colorSpace, log: (next) => emitted.push(next) }), async ({ container }) => {
          const slider = container.querySelector('.muxui-color-slider input[type="range"]');
          const [x, y] = container.querySelectorAll('.muxui-color-area input[type="range"]');
          await act(async () => slider.focus());
          const hues = [];
          for (let press = 0; press < 3; press += 1) {
            await act(async () => keyPress(slider, 'ArrowRight'));
            hues.push(slider.value);
          }
          assert.deepEqual(hues, ['1', '2', '3'], 'the thumb moves instead of snapping back to 0');
          assert.deepEqual(new Set(emitted), new Set([same]), 'the picker still reports its own hex color space');
          // Full saturation and brightness: the area adds chroma to the remembered hue.
          await act(async () => x.focus());
          for (let press = 0; press < 10; press += 1) await act(async () => keyPress(x, 'End'));
          await act(async () => y.focus());
          for (let press = 0; press < 10; press += 1) await act(async () => keyPress(y, 'PageUp'));
          assert.deepEqual([x.value, y.value], ['100', '100']);
          const hue = parseColor(emitted.at(-1)).toFormat('hsb').getChannelValue('hue');
          assert.ok(Math.abs(hue - 3) < 2, `the area edits in the slider's hue 3, not ${hue} (${emitted.at(-1)})`);
          assert.equal(slider.value, '3', 'the slider keeps its thumb');
        });
      });
    }
  }
}
