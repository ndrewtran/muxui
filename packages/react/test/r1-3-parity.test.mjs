import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import {
  Calendar, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, ColorWheel,
  ComboBox, GridList, ListBox, Menu, RadioGroup, RangeCalendar, Select, Slider, Table, Tabs, TagGroup,
  TokenField, ToggleButtonGroup, Toolbar, Tree, Virtualizer,
} from '../src/collections.mjs';
import { ToggleButton } from '../src/components.mjs';

const slugs = ['calendar', 'color-area', 'color-field', 'color-picker', 'color-slider', 'color-swatch', 'color-swatch-picker', 'color-wheel', 'combo-box', 'grid-list', 'list-box', 'menu', 'radio-group', 'range-calendar', 'select', 'slider', 'table', 'tabs', 'tag-group', 'toggle-button-group', 'token-field', 'toolbar', 'tree', 'virtualizer'];
const events = new Map([
  ['change', 'onChange'], ['focusChange', 'onFocusChange'], ['selectionChange', 'onSelectionChange'],
  ['action', 'onAction'], ['select', 'onSelect'], ['rowAction', 'onRowAction'], ['remove', 'onRemove'],
  ['expandedChange', 'onExpandedChange'], ['openChange', 'onOpenChange'], ['sortChange', 'onSortChange'],
  ['changeEnd', 'onChangeEnd'], ['scroll', 'onScroll'],
]);

function componentName(slug) {
  return slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function propPattern(prop) {
  if (prop.startsWith('aria-')) return new RegExp(`['"]${prop}['"]`, 'u');
  return new RegExp(`\\b${prop}\\b`, 'u');
}

test('R1.3 artifact declarations have a generated MuxUI type and runtime surface', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const [types, runtime, styles] = await Promise.all([
    readFile(resolve(import.meta.dirname, '../generated/index.d.ts'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../src/collections.mjs'), 'utf8'),
    readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8'),
  ]);
  assert.match(styles, /\.muxui-radio-indicator\b/u, 'RadioGroup needs a Mux UI-owned visible indicator');
  assert.match(styles, /\.muxui-radio\[data-selected\] \.muxui-radio-indicator/u, 'RadioGroup needs selected indicator styling');
  assert.match(styles, /\.muxui-radio\[data-focus-visible\]/u, 'RadioGroup needs a focus-visible affordance');
  assert.match(styles, /@media \(forced-colors: active\)[\s\S]*\.muxui-list-box-item\[data-focus-visible\][\s\S]*outline-color: Highlight/u, 'collection focus needs forced-colors treatment');
  assert.match(styles, /@media \(prefers-contrast: more\)[\s\S]*\.muxui-list-box-item\[data-focus-visible\][\s\S]*outline-width: 3px/u, 'collection focus needs high-contrast treatment');
  for (const slug of slugs) {
    const name = componentName(slug);
    const artifact = JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`), 'utf8'));
    const api = artifact.bindings['web.react'].api;
    const typeStart = types.search(new RegExp(`export (?:interface|type) ${name}Props\\b`, 'u'));
    assert.notEqual(typeStart, -1, `${name}Props is missing from generated public types`);
    const typeEnd = types.indexOf('export declare const', typeStart);
    let typeSurface = types.slice(typeStart, typeEnd === -1 ? undefined : typeEnd);
    for (const inherited of ['CollectionProps', 'NamedFieldProps', 'FieldValidationProps', 'MuxUIAccessibleName', 'MuxUIAriaAccessibleName', 'MuxUIAriaLabel']) {
      if (typeSurface.includes(inherited)) {
        const inheritedStart = types.indexOf(inherited, typeStart === -1 ? 0 : 0);
        const inheritedEnd = types.indexOf('\nexport ', inheritedStart + inherited.length);
        if (inheritedStart !== -1) typeSurface += types.slice(inheritedStart, inheritedEnd === -1 ? undefined : inheritedEnd);
      }
    }
    const runtimeStart = runtime.indexOf(`export const ${name}`);
    assert.notEqual(runtimeStart, -1, `${name} runtime export is missing`);
    const runtimeNext = runtime.indexOf('\nexport const ', runtimeStart + 1);
    const runtimeSurface = runtime.slice(runtimeStart, runtimeNext === -1 ? undefined : runtimeNext);
    const sharedCollectionSurface = ['grid-list', 'list-box'].includes(slug) ? runtime.slice(runtime.indexOf('function collectionProps'), runtimeStart) : '';
    const sharedCalendarSurface = ['calendar', 'range-calendar'].includes(slug) ? runtime.slice(runtime.indexOf('function calendarProps'), runtimeStart) : '';
    if (name === 'Tree') assert.doesNotMatch(typeSurface, /\bchildren\??\s*:/u, 'Tree must not expose children customization');
    if (name === 'Virtualizer') assert.doesNotMatch(typeSurface, /\brenderItem\??\s*:/u, 'Virtualizer must not expose renderItem customization');
    if (name === 'Calendar' || name === 'RangeCalendar') {
      assert.doesNotMatch(typeSurface, /\b(?:description|errorMessage)\??\s*:/u, `${name} must not expose unsupported validation messaging`);
    }
    const rejectedProps = {
      RadioGroup: ['description', 'errorMessage', 'name'],
      TagGroup: ['description', 'errorMessage', 'readOnly', 'required', 'invalid'],
      TokenField: ['description', 'errorMessage', 'required', 'invalid'],
    }[name];
    if (rejectedProps) {
      for (const prop of rejectedProps) {
        assert.doesNotMatch(typeSurface, propPattern(prop), `${name} must not expose unsupported ${prop}`);
        assert.doesNotMatch(`${runtimeSurface}\n${sharedCollectionSurface}\n${sharedCalendarSurface}`, propPattern(prop), `${name} must not forward unsupported ${prop}`);
      }
    }
    for (const prop of api.props) {
      assert.match(typeSurface, propPattern(prop), `${name}.${prop} is missing from generated type surface`);
      assert.match(`${runtimeSurface}\n${sharedCollectionSurface}\n${sharedCalendarSurface}`, propPattern(prop), `${name}.${prop} is missing from runtime surface`);
    }
    for (const event of api.events) {
      const callback = events.get(event);
      assert.ok(callback, `${name}.${event} needs a MuxUI callback mapping`);
      assert.match(typeSurface, propPattern(callback), `${name}.${callback} is missing from generated type surface`);
      assert.match(`${runtimeSurface}\n${sharedCollectionSurface}\n${sharedCalendarSurface}`, propPattern(callback), `${name}.${callback} is missing from runtime surface`);
    }
  }
});

function installDom(markup = '<div id="root"></div>') {
  const dom = new JSDOM(`<!doctype html>${markup}`, { url: 'http://localhost/' });
  const globals = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTableElement', 'HTMLTextAreaElement', 'HTMLLabelElement', 'HTMLDivElement', 'HTMLFormElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FocusEvent', 'PointerEvent', 'MutationObserver', 'InputEvent', 'FormData', 'ResizeObserver', 'getComputedStyle'];
  const previous = new Map(globals.map((name) => [name, globalThis[name]]));
  const elementPrototype = dom.window.HTMLElement.prototype;
  const previousScrollTo = elementPrototype.scrollTo;
  elementPrototype.scrollTo ??= () => {};
  const previousAttachEvent = elementPrototype.attachEvent;
  const previousDetachEvent = elementPrototype.detachEvent;
  elementPrototype.attachEvent ??= () => {};
  elementPrototype.detachEvent ??= () => {};
  const previousCss = globalThis.CSS;
  globalThis.CSS ??= { escape: (value) => String(value).replace(/[^a-zA-Z0-9_-]/gu, (character) => `\\${character}`) };
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  for (const name of globals) if (dom.window[name]) globalThis[name] = dom.window[name];
  const hadActFlag = 'IS_REACT_ACT_ENVIRONMENT' in globalThis;
  const previousActFlag = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return {
    dom,
    restore() {
      for (const [name, value] of previous) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
      if (previousCss === undefined) delete globalThis.CSS;
      else globalThis.CSS = previousCss;
      if (previousAnimationFrame === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = previousAnimationFrame;
      if (previousCancelAnimationFrame === undefined) delete globalThis.cancelAnimationFrame;
      else globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
      if (previousScrollTo === undefined) delete elementPrototype.scrollTo;
      else elementPrototype.scrollTo = previousScrollTo;
      if (previousAttachEvent === undefined) delete elementPrototype.attachEvent;
      else elementPrototype.attachEvent = previousAttachEvent;
      if (previousDetachEvent === undefined) delete elementPrototype.detachEvent;
      else elementPrototype.detachEvent = previousDetachEvent;
      if (hadActFlag) globalThis.IS_REACT_ACT_ENVIRONMENT = previousActFlag;
      else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      dom.window.close();
    },
  };
}

function installVirtualizerDom() {
  const env = installDom();
  const elementPrototype = env.dom.window.HTMLElement.prototype;
  const previousWidth = Object.getOwnPropertyDescriptor(elementPrototype, 'clientWidth');
  const previousHeight = Object.getOwnPropertyDescriptor(elementPrototype, 'clientHeight');
  const renderedBlockSize = (element) => Number.parseFloat(element.style.blockSize || element.style.height || '') || 0;
  const observers = new Set();
  Object.defineProperty(elementPrototype, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(elementPrototype, 'clientHeight', {
    configurable: true,
    get() { return this.classList.contains('muxui-virtualizer') ? renderedBlockSize(this) : 40; },
  });
  class ResizeObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.elements = new Set();
      observers.add(this);
    }
    observe(element) {
      this.elements.add(element);
      queueMicrotask(() => this.callback([{ target: element, contentRect: { width: 600, height: renderedBlockSize(element) } }]));
    }
    unobserve(element) { this.elements.delete(element); }
    disconnect() { this.elements.clear(); observers.delete(this); }
  }
  globalThis.ResizeObserver = ResizeObserverMock;
  env.dom.window.ResizeObserver = ResizeObserverMock;
  return {
    ...env,
    resize(element) {
      for (const observer of observers) {
        if (observer.elements.has(element)) observer.callback([{ target: element, contentRect: { width: 600, height: renderedBlockSize(element) } }]);
      }
    },
    restore() {
      if (previousWidth) Object.defineProperty(elementPrototype, 'clientWidth', previousWidth);
      else delete elementPrototype.clientWidth;
      if (previousHeight) Object.defineProperty(elementPrototype, 'clientHeight', previousHeight);
      else delete elementPrototype.clientHeight;
      env.restore();
    },
  };
}

function collapseSelection(node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function deleteBeforeInput(node) {
  collapseSelection(node);
  return node.dispatchEvent(new InputEvent('beforeinput', {
    inputType: 'deleteContentBackward',
    bubbles: true,
    cancelable: true,
  }));
}

test('R1.3 collection source preserves donor glyph alignment state selectors', async () => {
  const styles = await readFile(resolve(import.meta.dirname, '../src/styles/collections.css'), 'utf8');
  assert.match(styles, /\.muxui-calendar\[data-disabled\] \.muxui-calendar-(?:previous|next) > svg[\s\S]*?opacity: 0\.45;/u);
  assert.match(styles, /\.muxui-range-calendar\[data-disabled\] \.muxui-calendar-(?:previous|next) > svg[\s\S]*?opacity: 0\.45;/u);
  assert.match(styles, /\.muxui-tab\s*\{[\s\S]*?padding: var\(--muxui-semantic-layout-group-gap\) var\(--muxui-reference-dimension-space-m\);/u);
  assert.match(styles, /\.muxui-tree-item\[data-expanded\] \.muxui-tree-toggle::before\s*\{[\s\S]*?inset-inline-start: -0\.25px;/u);
  assert.match(styles, /\[data-muxui-color-scheme='dark'\] :where\(\.muxui-calendar, \.muxui-range-calendar\) \{\s*background-color: var\(--muxui-reference-color-neutral-20\);\s*border-color: var\(--muxui-reference-color-neutral-10\);/u);
});

test('R1.3 temporal adapters preserve ISO values and calendar navigation', async () => {
  const server = renderToString(React.createElement(Calendar, { label: 'Start date', defaultValue: '2025-01-15' }));
  assert.match(server, /January 2025/u);
  const unsupportedCalendarProps = renderToString(React.createElement(Calendar, {
    label: 'Date', defaultValue: '2025-01-15', description: 'UNSUPPORTED_DESCRIPTION', errorMessage: 'UNSUPPORTED_ERROR',
  }));
  assert.doesNotMatch(unsupportedCalendarProps, /UNSUPPORTED_(?:DESCRIPTION|ERROR)/u);
  const unsupportedRangeProps = renderToString(React.createElement(RangeCalendar, {
    label: 'Range', defaultValue: { start: '2025-01-01', end: '2025-01-04' }, description: 'UNSUPPORTED_DESCRIPTION', errorMessage: 'UNSUPPORTED_ERROR',
  }));
  assert.doesNotMatch(unsupportedRangeProps, /UNSUPPORTED_(?:DESCRIPTION|ERROR)/u);
  assert.throws(() => renderToString(React.createElement(Calendar, { label: 'Date', value: '15-01-2025' })), /YYYY-MM-DD/u);
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement(Calendar, { label: 'Start date', defaultValue: '2025-01-15', onChange: (value) => changes.push(value) })));
    assert.match(container.querySelector('.muxui-calendar').textContent, /Start date/u);
    assert.match(container.querySelector('.muxui-calendar-heading').textContent, /January 2025/u);
    await act(async () => container.querySelector('button[aria-label="Next month"]').click());
    assert.match(container.querySelector('.muxui-calendar-heading').textContent, /February 2025/u);
    const dateCell = container.querySelector('[aria-label="Wednesday, February 12, 2025"]');
    await act(async () => dateCell.click());
    assert.deepEqual(changes, ['2025-02-12']);

    const focusChanges = [];
    const readOnlySelections = [];
    function ReadOnlyControlledCalendar() {
      const [focusedValue, setFocusedValue] = React.useState('2025-01-15');
      return React.createElement(Calendar, {
        label: 'Read-only date',
        focusedValue,
        defaultValue: '2025-01-15',
        readOnly: true,
        onFocusChange: (next) => { focusChanges.push(next); setFocusedValue(next); },
        onChange: (next) => readOnlySelections.push(next),
      });
    }
    await act(async () => root.render(React.createElement(ReadOnlyControlledCalendar)));
    await act(async () => container.querySelector('button[aria-label="Next month"]').click());
    assert.match(container.querySelector('.muxui-calendar-heading').textContent, /February 2025/u);
    assert.ok(focusChanges.length > 0);
    const readOnlyDateCell = container.querySelector('[aria-label="Wednesday, February 12, 2025"]');
    await act(async () => readOnlyDateCell.click());
    assert.deepEqual(readOnlySelections, []);

    await act(async () => root.render(React.createElement(RangeCalendar, { label: 'Date range', defaultValue: { start: '2025-01-01', end: '2025-01-04' } })));
    assert.equal(container.querySelector('.muxui-range-calendar-cell')?.classList.contains('muxui-range-calendar-cell'), true);
  } finally {
    await act(async () => {
      document.activeElement?.blur();
      root.unmount();
    });
    env.restore();
  }
});

test('embedded RAC button controls inherit the MuxUI/Tale button chrome reset', async () => {
  const styles = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  const resetStart = styles.indexOf('/* Bare RAC buttons need the same chrome reset as Tale\'s Button base.');
  assert.notEqual(resetStart, -1);
  const reset = styles.slice(resetStart, styles.indexOf('\n}\n', resetStart) + 3);
  for (const className of [
    'muxui-date-trigger', 'muxui-calendar-previous', 'muxui-calendar-next',
    'muxui-combo-box-trigger', 'muxui-select-trigger', 'muxui-tag-remove',
    'muxui-tree-toggle', 'muxui-disclosure-trigger', 'muxui-search-clear',
  ]) assert.match(reset, new RegExp(`\\.${className}\\b`, 'u'));
  assert.match(reset, /border:\s*1px solid transparent;/u);
  assert.match(reset, /appearance:\s*none;/u);
  assert.match(styles, /\.muxui-calendar-previous,\n\.muxui-calendar-next\s*\{[^}]*padding:\s*0;/u);
  assert.match(styles, /\.muxui-combo-box-trigger\s*\{[^}]*border:\s*none;[\s\S]*background:\s*transparent;/u);
});

test('R1.3 color controls expose Mux UI color strings, anatomy, and disabled guards', async () => {
  assert.throws(() => renderToString(React.createElement(ColorWheel, { 'aria-label': 'Invalid wheel', outerRadius: 4, innerRadius: 4 })), /innerRadius must be less than outerRadius/u);
  assert.throws(() => renderToString(React.createElement(ColorWheel, { 'aria-label': 'Invalid wheel', outerRadius: Number.NaN, innerRadius: 1 })), /outerRadius must be a finite nonnegative number/u);
  const ssr = new JSDOM(renderToString(React.createElement('div', null,
    React.createElement(ColorArea, { 'aria-label': 'SSR area', readOnly: true }),
    React.createElement(ColorSlider, { 'aria-label': 'SSR slider', defaultValue: '#ff0000', readOnly: true }),
    React.createElement(ColorWheel, { 'aria-label': 'SSR wheel', readOnly: true }),
    React.createElement(ColorSwatchPicker, { 'aria-label': 'SSR swatches', items: [{ id: 'red', color: '#ff0000' }], readOnly: true }),
    React.createElement(Slider, { 'aria-label': 'SSR numeric slider', readOnly: true }),
  ))).window.document;
  assert.equal(ssr.querySelector('.muxui-color-area')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-area-thumb')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-slider')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-slider-thumb')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-wheel')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-wheel-thumb')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-color-swatch-picker[role="listbox"]')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-slider')?.getAttribute('data-readonly'), 'true');
  assert.equal(ssr.querySelector('.muxui-slider-thumb')?.getAttribute('data-readonly'), 'true');
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(ColorField, { label: 'Hex', defaultValue: '#ff0000', onChange: (value) => changes.push(['field', value]) }),
      React.createElement(ColorArea, { 'aria-label': 'Saturation', defaultValue: '#ff0000', onChange: (value) => changes.push(['area', value]) }),
      React.createElement(ColorSlider, { 'aria-label': 'Red channel', defaultValue: '#ff0000', onChange: (value) => changes.push(['slider', value]) }),
      React.createElement(ColorSwatchPicker, { 'aria-label': 'Palette', items: [{ id: 'red', color: '#ff0000' }, { id: 'blue', color: '#0000ff' }], onChange: (value) => changes.push(['picker', value]) }),
      React.createElement(ColorWheel, { 'aria-label': 'Hue', defaultValue: '#ff0000', outerRadius: 40, innerRadius: 20, onChange: (value) => changes.push(['wheel', value]) }),
      React.createElement(ColorPicker, { 'aria-label': 'Picker', defaultValue: '#ff0000' }, React.createElement(React.Fragment, null,
        React.createElement(ColorField, { label: 'Picker color', onChange: (value) => changes.push(['nested', value]) }),
      )),
    )));
    assert.equal(container.querySelectorAll('.muxui-color-field').length, 2);
    assert.ok(container.querySelector('.muxui-color-area-thumb'));
    assert.ok(container.querySelector('.muxui-color-slider-track'));
    assert.equal(container.querySelectorAll('.muxui-color-swatch-picker-item').length, 2);
    assert.ok(container.querySelector('.muxui-color-wheel-track'));
    assert.equal(container.querySelector('.muxui-color-field input').value, '#FF0000');
    await act(async () => container.querySelectorAll('.muxui-color-swatch-picker-item')[1].click());
    assert.equal(changes.some(([kind, value]) => kind === 'picker' && typeof value === 'string' && value.includes('0, 0, 255')), true);

    const disabledChanges = [];
    await act(async () => root.render(React.createElement(ColorSwatchPicker, { 'aria-label': 'Disabled palette', disabled: true, items: [{ id: 'red', color: '#ff0000' }], onChange: (value) => disabledChanges.push(value) })));
    const disabledItem = container.querySelector('.muxui-color-swatch-picker-item');
    assert.equal(disabledItem.getAttribute('aria-disabled'), 'true');
    assert.equal(disabledItem.getAttribute('data-disabled'), 'true');
    await act(async () => disabledItem.click());
    assert.deepEqual(disabledChanges, []);

    const pickerChanges = [];
    await act(async () => root.render(React.createElement(ColorPicker, { disabled: true, defaultValue: '#ff0000' },
      React.createElement(React.Fragment, null,
        React.createElement(ColorField, { label: 'Disabled nested field', onChange: (value) => pickerChanges.push(['field', value]) }),
        React.createElement('div', null, React.createElement(ColorArea, { 'aria-label': 'Disabled nested area', onChange: (value) => pickerChanges.push(['area', value]) })),
        React.createElement(ColorSlider, { 'aria-label': 'Disabled nested slider', onChange: (value) => pickerChanges.push(['slider', value]) }),
        React.createElement(ColorWheel, { 'aria-label': 'Disabled nested wheel', onChange: (value) => pickerChanges.push(['wheel', value]) }),
        React.createElement(ColorSwatchPicker, { 'aria-label': 'Disabled nested swatches', items: [{ id: 'red', color: '#ff0000' }], onChange: (value) => pickerChanges.push(['swatches', value]) }),
        React.createElement(ColorSwatch, { color: '#ff0000' }),
      ))));
    const disabledNestedArea = container.querySelector('.muxui-color-area');
    assert.equal(container.querySelector('.muxui-color-field input').disabled, true);
    const disabledNestedAreaField = disabledNestedArea.closest('.muxui-color-area-field');
    assert.equal(disabledNestedAreaField.getAttribute('aria-disabled'), 'true');
    assert.equal(disabledNestedAreaField.getAttribute('data-disabled'), 'true');
    assert.equal(container.querySelector('.muxui-color-slider input')?.disabled, true);
    assert.equal(container.querySelector('.muxui-color-wheel input')?.disabled, true);
    assert.equal(container.querySelector('.muxui-color-swatch-picker-item')?.getAttribute('aria-disabled'), 'true');
    assert.equal(container.querySelector('.muxui-color-swatch')?.getAttribute('data-disabled'), 'true');
    await act(async () => disabledNestedArea.click());
    assert.deepEqual(pickerChanges, []);

    await act(async () => root.render(React.createElement(ColorPicker, { readOnly: true, defaultValue: '#ff0000' },
      React.createElement(React.Fragment, null,
        React.createElement(ColorField, { label: 'Read-only nested field', onChange: (value) => pickerChanges.push(['field', value]) }),
        React.createElement('div', null, React.createElement(ColorArea, { 'aria-label': 'Read-only nested area', onChange: (value) => pickerChanges.push(['area', value]) })),
        React.createElement(ColorSlider, { 'aria-label': 'Read-only nested slider', onChange: (value) => pickerChanges.push(['slider', value]) }),
        React.createElement(ColorWheel, { 'aria-label': 'Read-only nested wheel', onChange: (value) => pickerChanges.push(['wheel', value]) }),
        React.createElement(ColorSwatchPicker, { 'aria-label': 'Read-only nested swatches', items: [{ id: 'red', color: '#ff0000' }], onChange: (value) => pickerChanges.push(['swatches', value]) }),
        React.createElement(ColorSwatch, { color: '#ff0000' }),
      ))));
    const readOnlyNestedField = container.querySelector('.muxui-color-field input');
    const readOnlyNestedArea = container.querySelector('.muxui-color-area');
    assert.equal(readOnlyNestedField.readOnly, true);
    const readOnlyNestedAreaField = readOnlyNestedArea.closest('.muxui-color-area-field');
    assert.equal(readOnlyNestedAreaField.hasAttribute('aria-readonly'), false);
    assert.equal(readOnlyNestedAreaField.getAttribute('data-readonly'), 'true');
    const readOnlyPicker = container.querySelector('.muxui-color-picker');
    const readOnlySliderWrapper = container.querySelector('.muxui-color-slider')?.parentElement;
    const readOnlyWheelWrapper = container.querySelector('.muxui-color-wheel')?.parentElement;
    const readOnlySwatchPicker = container.querySelector('.muxui-color-swatch-picker');
    const readOnlySwatchPickerWrapper = readOnlySwatchPicker?.parentElement;
    const readOnlyColorSwatch = [...container.querySelectorAll('.muxui-color-swatch')]
      .find((swatch) => swatch.getAttribute('data-readonly') === 'true');
    for (const wrapper of [readOnlyPicker, readOnlySliderWrapper, readOnlyWheelWrapper, readOnlySwatchPickerWrapper, readOnlyColorSwatch]) {
      assert.ok(wrapper);
      assert.equal(wrapper.hasAttribute('aria-readonly'), false);
      assert.equal(wrapper.getAttribute('data-readonly'), 'true');
    }
    const hasReadOnlyMarkers = (target) => target?.getAttribute('aria-readonly') === 'true' && target?.getAttribute('data-readonly') === 'true';
    const readOnlyAreaTargets = [...container.querySelectorAll('.muxui-color-area input[type="range"]')];
    const readOnlySliderTargets = [...container.querySelectorAll('.muxui-color-slider input[type="range"]')];
    const readOnlyWheelTargets = [...container.querySelectorAll('.muxui-color-wheel input[type="range"]')];
    assert.ok(readOnlyAreaTargets.length >= 2);
    assert.ok(readOnlySliderTargets.length > 0);
    assert.ok(readOnlyWheelTargets.length > 0);
    assert.equal(readOnlyAreaTargets.every(hasReadOnlyMarkers), true);
    assert.equal(readOnlySliderTargets.every(hasReadOnlyMarkers), true);
    assert.equal(readOnlyWheelTargets.every(hasReadOnlyMarkers), true);
    const readOnlySlider = readOnlySliderTargets[0];
    const readOnlyWheel = readOnlyWheelTargets[0];
    const readOnlySwatchList = container.querySelector('.muxui-color-swatch-picker[role="listbox"]');
    const readOnlySwatch = container.querySelector('.muxui-color-swatch-picker-item');
    assert.equal(hasReadOnlyMarkers(readOnlySwatchList), true);
    assert.equal(readOnlySwatch?.hasAttribute('aria-readonly'), false);
    await act(async () => readOnlySlider.focus());
    assert.equal(document.activeElement, readOnlySlider);
    assert.equal(readOnlySwatchList.tabIndex >= 0, true);
    assert.deepEqual(pickerChanges, []);
    await act(async () => readOnlySlider.blur());

    await act(async () => root.render(React.createElement(ColorPicker, { defaultValue: '#ff0000' },
      React.createElement(React.Fragment, null,
        React.createElement(ColorArea, { 'aria-label': 'Editable nested area' }),
        React.createElement(ColorSlider, { 'aria-label': 'Editable nested slider' }),
        React.createElement(ColorWheel, { 'aria-label': 'Editable nested wheel', outerRadius: 40, innerRadius: 20 }),
        React.createElement(ColorSwatchPicker, { 'aria-label': 'Editable nested swatches', items: [{ id: 'red', color: '#ff0000' }] }),
      ))));
    const editableTargets = [
      ...container.querySelectorAll('.muxui-color-area input[type="range"]'),
      ...container.querySelectorAll('.muxui-color-slider input[type="range"]'),
      ...container.querySelectorAll('.muxui-color-wheel input[type="range"]'),
      ...container.querySelectorAll('.muxui-color-swatch-picker [role="listbox"]'),
    ];
    assert.ok(editableTargets.length > 0);
    assert.equal(editableTargets.every((target) => !target.hasAttribute('aria-readonly') && !target.hasAttribute('data-readonly')), true);
  } finally {
    await act(async () => {
      document.activeElement?.blur();
      root.unmount();
    });
    env.restore();
  }
});

test('R1.3 ColorArea associates visible and explicit labels with its interactive controls', async () => {
  const server = new JSDOM(renderToString(React.createElement(ColorArea, { label: 'Saturation' }))).window.document;
  const serverLabel = server.querySelector('.muxui-field-label');
  assert.ok(serverLabel?.id);
  const serverInputs = [...server.querySelectorAll('.muxui-color-area input[type="range"]')];
  assert.equal(serverInputs.length, 2);
  assert.equal(serverInputs.every((input) => input.getAttribute('aria-labelledby')?.split(' ').includes(serverLabel.id)), true);

  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(ColorArea, { label: 'Saturation' })));
    const label = container.querySelector('.muxui-field-label');
    const inputs = [...container.querySelectorAll('.muxui-color-area input[type="range"]')];
    assert.ok(label?.id);
    assert.equal(inputs.length, 2);
    assert.equal(inputs.every((input) => input.getAttribute('aria-labelledby')?.split(' ').includes(label.id)), true);

    await act(async () => root.render(React.createElement('div', null,
      React.createElement('span', { id: 'external-color-label' }, 'External saturation'),
      React.createElement(ColorArea, { 'aria-labelledby': 'external-color-label' }))));
    const explicitInputs = [...container.querySelectorAll('.muxui-color-area input[type="range"]')];
    assert.equal(explicitInputs.length, 2);
    assert.equal(explicitInputs.every((input) => input.getAttribute('aria-labelledby')?.split(' ').includes('external-color-label')), true);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 scalar composites preserve string and numeric callbacks with disabled guards', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(ComboBox, { label: 'City', items: [{ id: 'mel', label: React.createElement('strong', null, 'Melbourne') }, 'Sydney'], defaultSelectedId: 'mel' }),
      React.createElement(RadioGroup, { label: 'Plan', value: 'pro', options: [{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }] }),
      React.createElement(Slider, { label: 'Volume', defaultValue: 1, min: 0, max: 3 }),
    )));
    assert.ok(container.querySelector('.muxui-combo-box input'));
    assert.ok(container.querySelector('.muxui-combo-box-trigger'));
    const comboArrow = container.querySelector('svg.muxui-combo-box-arrow');
    assert.ok(comboArrow);
    assert.equal(comboArrow.getAttribute('aria-hidden'), 'true');
    assert.equal(comboArrow.querySelector('path')?.getAttribute('d'), 'm6 9 6 6 6-6');
    assert.equal(container.querySelectorAll('.muxui-radio').length, 2);
    assert.equal(container.querySelector('input[type="range"]').value, '1');
    assert.equal(container.querySelector('.muxui-radio input[value="pro"]').checked, true);
    assert.equal(container.querySelector('.muxui-combo-box input').value, 'Melbourne');

    document.activeElement?.blur();
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(ComboBox, { label: 'Disabled city', disabled: true, items: ['Melbourne'] }),
      React.createElement(RadioGroup, { label: 'Disabled plan', disabled: true, value: 'pro', options: [{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }] }),
      React.createElement(Slider, { label: 'Disabled volume', disabled: true, defaultValue: 1 }),
    )));
    const disabledComboInput = container.querySelector('.muxui-combo-box input');
    assert.equal(disabledComboInput.disabled, true);
    assert.equal(container.querySelector('.muxui-radio input').disabled, true);
    const disabledSlider = container.querySelector('input[type="range"]');
    assert.equal(disabledSlider.disabled, true);
  } finally {
    document.activeElement?.blur();
    await act(async () => root.unmount());
    env.restore();
  }
});

test('Slider exposes disabled state on its labelled group while preserving thumb semantics', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Slider, {
      label: 'Disabled volume', disabled: true, defaultValue: 1, min: 0, max: 3,
    })));
    const slider = container.querySelector('.muxui-slider');
    const input = slider?.querySelector('input[type="range"]');
    assert.equal(slider?.getAttribute('role'), 'group');
    assert.equal(slider?.getAttribute('aria-disabled'), 'true');
    assert.equal(slider?.getAttribute('data-disabled'), 'true');
    assert.equal(slider?.querySelector('.muxui-field-label')?.textContent, 'Disabled volume');
    assert.equal(slider?.querySelector('.muxui-slider-output')?.textContent, '1');
    assert.equal(input?.disabled, true);
    assert.equal(input?.getAttribute('aria-labelledby')?.includes(slider?.querySelector('.muxui-field-label')?.id ?? ''), true);

    await act(async () => root.render(React.createElement(Slider, {
      label: 'Enabled volume', defaultValue: 1, min: 0, max: 3,
    })));
    assert.equal(container.querySelector('.muxui-slider')?.hasAttribute('aria-disabled'), false);
    assert.equal(container.querySelector('input[type="range"]')?.disabled, false);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 RadioGroup owns selected indicator and read-only focus semantics', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(RadioGroup, {
      label: 'Plan', defaultValue: 'pro', options: [
        { value: 'basic', label: 'Basic' },
        { value: 'pro', label: 'Pro' },
        { value: 'legacy', label: 'Legacy', disabled: true },
      ],
    })));
    const radios = [...container.querySelectorAll('.muxui-radio')];
    assert.equal(radios.length, 3);
    assert.equal(container.querySelectorAll('.muxui-radio-indicator').length, 3);
    assert.equal(radios[1].getAttribute('data-selected'), 'true');
    assert.equal(radios[1].querySelector('.muxui-radio-indicator')?.getAttribute('aria-hidden'), 'true');
    assert.equal(radios[0].querySelector('input').disabled, false);
    assert.equal(radios[2].querySelector('input').disabled, true);

    const selectedInput = radios[1].querySelector('input');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      selectedInput.focus();
    });
    assert.equal(document.activeElement, selectedInput);
    assert.equal(radios[1].getAttribute('data-focus-visible'), 'true');

    const changes = [];
    await act(async () => root.render(null));
    await act(async () => root.render(React.createElement(RadioGroup, {
      label: 'Read-only plan', readOnly: true, defaultValue: 'basic', onChange: (value) => changes.push(value), options: [
        { value: 'basic', label: 'Basic' },
        { value: 'pro', label: 'Pro' },
      ],
    })));
    const readOnlyGroup = container.querySelector('[role="radiogroup"]');
    const readOnlyRadios = [...container.querySelectorAll('.muxui-radio')];
    const readOnlyInputs = readOnlyRadios.map((radio) => radio.querySelector('input'));
    assert.equal(readOnlyGroup.getAttribute('aria-readonly'), 'true');
    assert.equal(readOnlyRadios.every((radio) => radio.getAttribute('data-readonly') === 'true'), true);
    assert.equal(readOnlyInputs[0].disabled, false);
    assert.equal(readOnlyInputs[0].tabIndex, 0);
    assert.equal(readOnlyInputs[1].tabIndex, -1);
    await act(async () => readOnlyRadios[1].click());
    assert.deepEqual(changes, []);
    assert.equal(readOnlyInputs[0].checked, true);
    assert.equal(readOnlyInputs[1].checked, false);

    await act(async () => root.render(React.createElement(RadioGroup, {
      label: 'Disabled plan', disabled: true, defaultValue: 'basic', options: [
        { value: 'basic', label: 'Basic' },
        { value: 'pro', label: 'Pro' },
      ],
    })));
    assert.equal(container.querySelector('[role="radiogroup"]').getAttribute('aria-disabled'), 'true');
    assert.equal([...container.querySelectorAll('.muxui-radio input')].every((input) => input.disabled), true);
    assert.equal([...container.querySelectorAll('.muxui-radio')].every((radio) => radio.getAttribute('data-disabled') === 'true'), true);
  } finally {
    document.activeElement?.blur();
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 field collections keep unsupported props out of public DOM surfaces', () => {
  const radio = renderToString(React.createElement(RadioGroup, {
    label: 'Plan', options: [{ value: 'pro', label: 'Pro' }],
    description: 'RADIO_DESCRIPTION', errorMessage: 'RADIO_ERROR', name: 'RADIO_NAME', 'data-leak': 'RADIO_LEAK',
  }));
  assert.match(radio, /muxui-radio-group/u);
  assert.doesNotMatch(radio, /RADIO_(?:DESCRIPTION|ERROR|NAME|LEAK)/u);

  const tag = renderToString(React.createElement(TagGroup, {
    label: 'Tags', items: [{ id: 'one', label: 'One' }],
    description: 'TAG_DESCRIPTION', errorMessage: 'TAG_ERROR', readOnly: true, required: true, invalid: true, 'data-leak': 'TAG_LEAK',
  }));
  assert.match(tag, /muxui-tag-group/u);
  assert.doesNotMatch(tag, /TAG_(?:DESCRIPTION|ERROR|LEAK)/u);

  const token = renderToString(React.createElement(TokenField, {
    label: 'Tags', defaultValue: ['one'],
    description: 'TOKEN_DESCRIPTION', errorMessage: 'TOKEN_ERROR', required: true, invalid: true, 'data-leak': 'TOKEN_LEAK',
  }));
  assert.match(token, /muxui-token-field/u);
  assert.doesNotMatch(token, /TOKEN_(?:DESCRIPTION|ERROR|LEAK)/u);
});

test('R1.3 menu, table, and tag actions return normalized MuxUI items', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const actions = [];
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(Menu, { 'aria-label': 'Actions', items: [{ id: 'edit', label: React.createElement('strong', null, 'Edit') }], onAction: (item) => actions.push(['menu', item.id]) }),
      React.createElement(Table, { 'aria-label': 'People', columns: [{ id: 'name', label: 'Name', isRowHeader: true }], rows: [{ id: 'ada', name: 'Ada' }], selectionMode: 'single', onRowAction: (row) => actions.push(['table', row.id]) }),
      React.createElement(TagGroup, { label: 'Tags', items: [{ id: 'one', label: 'One' }], onAction: (item) => actions.push(['tag', item.id]), onRemove: (items) => actions.push(['remove', items.map((item) => item.id).join(',')]) }),
    )));
    assert.equal(container.querySelectorAll('[role="menuitem"]').length, 1);
    assert.equal(container.querySelector('[role="menuitem"]').textContent, 'Edit');
    assert.equal(container.querySelectorAll('[role="row"]').length, 3);
    assert.equal(container.querySelectorAll('.muxui-table-cell').length, 1);
    assert.equal(container.querySelectorAll('.muxui-tag').length, 1);
    await act(async () => container.querySelector('[role="menuitem"]').click());
    await act(async () => container.querySelector('.muxui-table-row').click());
    await act(async () => container.querySelector('.muxui-tag').click());
    await act(async () => container.querySelector('.muxui-tag-remove').click());
    assert.deepEqual(actions, [['menu', 'edit'], ['table', 'ada'], ['tag', 'one'], ['remove', 'one']]);

    const disabledActions = [];
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(Menu, { 'aria-label': 'Disabled actions', disabled: true, items: [{ id: 'edit', label: 'Edit' }], onAction: (item) => disabledActions.push(['menu', item.id]) }),
      React.createElement(Table, { 'aria-label': 'Disabled people', disabled: true, columns: [{ id: 'name', label: 'Name', isRowHeader: true }], rows: [{ id: 'ada', name: 'Ada' }], onRowAction: (row) => disabledActions.push(['table', row.id]) }),
      React.createElement(TagGroup, { label: 'Disabled tags', disabled: true, items: [{ id: 'one', label: 'One' }], onAction: (item) => disabledActions.push(['tag', item.id]), onRemove: (items) => disabledActions.push(['remove', items.map((item) => item.id).join(',')]) }),
    )));
    await act(async () => container.querySelector('[role="menuitem"]').click());
    await act(async () => container.querySelector('.muxui-table-row').click());
    await act(async () => container.querySelector('.muxui-tag').click());
    await act(async () => container.querySelector('.muxui-tag-remove').click());
    assert.deepEqual(disabledActions, []);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 collections keep disabled items inert and preserve composite anatomy', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const actions = [];
  try {
    await act(async () => root.render(React.createElement(ListBox, {
      'aria-label': 'Files',
      items: [{ id: 'active', label: React.createElement('strong', null, 'Active') }, { id: 'blocked', label: 'Blocked', disabled: true }],
      onAction: (item) => actions.push(item?.id),
    })));
    assert.equal(container.querySelectorAll('[role="option"]').length, 2);
    assert.equal(container.querySelector('[role="option"]').textContent, 'Active');
    assert.equal(container.querySelector('[role="option"][data-disabled]')?.getAttribute('aria-disabled'), 'true');
    await act(async () => container.querySelector('[role="option"][data-disabled]').click());
    assert.deepEqual(actions, []);

    await act(async () => root.render(React.createElement(Tabs, {
      'aria-label': 'Sections',
      items: [{ id: 'one', label: React.createElement('span', null, 'One'), panel: React.createElement('p', null, 'Panel one') }, { id: 'two', label: 'Two', panel: 'Panel two' }],
    })));
    assert.equal(container.querySelectorAll('[role="tab"]').length, 2);
    assert.equal(container.querySelectorAll('[role="tabpanel"]').length, 1);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 collection items expose keyboard focus-visible state when unselected', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const items = [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }];
  const cases = [
    {
      component: React.createElement(ListBox, { 'aria-label': 'List', selectionMode: 'none', items }),
      selector: '[role="listbox"] [role="option"]',
    },
    {
      component: React.createElement(GridList, { 'aria-label': 'Grid', selectionMode: 'none', items }),
      selector: '[role="grid"] [role="row"]',
    },
    {
      component: React.createElement(ColorSwatchPicker, { 'aria-label': 'Palette', items: [{ id: 'red', color: '#ff0000' }, { id: 'blue', color: '#0000ff' }] }),
      selector: '.muxui-color-swatch-picker-item',
    },
    {
      component: React.createElement(Table, { 'aria-label': 'People', selectionMode: 'none', columns: [{ id: 'name', label: 'Name', isRowHeader: true }], rows: [{ id: 'ada', name: 'Ada' }, { id: 'grace', name: 'Grace' }] }),
      selector: '.muxui-table-row',
    },
  ];
  try {
    for (const { component, selector } of cases) {
      await act(async () => root.render(component));
      const target = container.querySelector(selector);
      assert.ok(target);
      assert.notEqual(target.getAttribute('aria-selected'), 'true');
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        target.focus();
      });
      assert.equal(document.activeElement, target);
      assert.equal(target.getAttribute('data-focus-visible'), 'true');
    }
  } finally {
    await act(async () => document.activeElement?.blur());
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Select renders normalized options and submits the selected MuxUI value', async () => {
  const env = installDom('<form id="form"><div id="root"></div></form>');
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement(Select, {
      label: 'Color',
      items: [{ id: 'red', label: React.createElement('strong', null, 'Red') }, { id: 'blue', label: 'Blue' }],
      defaultValue: 'blue',
      name: 'color',
      onChange: (value) => changes.push(value),
    })));
    assert.match(container.querySelector('.muxui-select-value').textContent, /Blue/u);
    await act(async () => container.querySelector('.muxui-select-trigger').click());
    const options = [...document.querySelectorAll('.muxui-select-option')];
    assert.deepEqual(options.map((option) => option.textContent), ['Red', 'Blue']);
    assert.equal(options.find((option) => option.textContent === 'Blue')?.getAttribute('aria-selected'), 'true');
    await act(async () => options[0].click());
    assert.deepEqual(changes, ['red']);
    assert.deepEqual([...new FormData(document.querySelector('#form')).getAll('color')], ['red']);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 TokenField owns uncontrolled reset and repeated form entries', async () => {
  const env = installDom('<form id="form"><div id="root"></div></form>');
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement(TokenField, { label: 'Tags', defaultValue: ['alpha', 'beta'], name: 'tags' })));
    const form = document.querySelector('#form');
    const values = () => [...new FormData(form).getAll('tags')];
    assert.deepEqual(values(), ['alpha', 'beta']);
    assert.equal(container.querySelector('[role="textbox"]').getAttribute('aria-readonly'), 'false');
    await act(async () => deleteBeforeInput(container.querySelector('[role="textbox"]')));
    assert.deepEqual(values(), ['alpha']);
    assert.deepEqual(changes, []);
    await act(async () => form.reset());
    assert.deepEqual(values(), ['alpha', 'beta']);
    await act(async () => deleteBeforeInput(container.querySelector('[role="textbox"]')));
    assert.deepEqual(values(), ['alpha']);
    const cancelReset = (event) => event.preventDefault();
    form.addEventListener('reset', cancelReset);
    await act(async () => form.reset());
    form.removeEventListener('reset', cancelReset);
    assert.deepEqual(values(), ['alpha']);
    await act(async () => form.reset());
    assert.deepEqual(values(), ['alpha', 'beta']);

    // An uncontrolled field keeps its mount-time default when its prop changes.
    await act(async () => root.render(React.createElement(TokenField, { label: 'Tags', defaultValue: ['changed'], name: 'tags' })));
    assert.deepEqual(values(), ['alpha', 'beta']);
    await act(async () => deleteBeforeInput(container.querySelector('[role="textbox"]')));
    assert.deepEqual(values(), ['alpha']);
    await act(async () => form.reset());
    assert.deepEqual(values(), ['alpha', 'beta']);

    await act(async () => root.render(React.createElement(TokenField, { key: 'readonly', label: 'Tags', defaultValue: ['readonly'], name: 'tags', readOnly: true, onChange: (value) => changes.push(value) })));
    await act(async () => deleteBeforeInput(container.querySelector('[role="textbox"]')));
    assert.deepEqual(values(), ['readonly']);
    assert.deepEqual(changes, []);
    assert.equal(container.querySelector('[role="textbox"]').getAttribute('aria-readonly'), 'true');

    await act(async () => root.render(React.createElement(TokenField, { key: 'disabled', label: 'Tags', value: ['controlled'], name: 'tags', disabled: true })));
    assert.deepEqual(values(), []);
    assert.equal(container.querySelector('[role="textbox"]').getAttribute('aria-disabled'), 'true');
    await act(async () => deleteBeforeInput(container.querySelector('[role="textbox"]')));
    assert.deepEqual(values(), []);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Virtualizer uses fixed row-count overscan to render and scroll a bounded window', async () => {
  const invalidVirtualizerInputs = [
    [{ itemHeight: 0 }, /Virtualizer itemHeight must be a finite number greater than 0/u],
    [{ itemHeight: -1 }, /Virtualizer itemHeight must be a finite number greater than 0/u],
    [{ itemHeight: Number.NaN }, /Virtualizer itemHeight must be a finite number greater than 0/u],
    [{ itemHeight: Number.POSITIVE_INFINITY }, /Virtualizer itemHeight must be a finite number greater than 0/u],
    [{ height: 0 }, /Virtualizer height must be a finite number greater than 0/u],
    [{ height: -1 }, /Virtualizer height must be a finite number greater than 0/u],
    [{ height: Number.NaN }, /Virtualizer height must be a finite number greater than 0/u],
    [{ height: Number.POSITIVE_INFINITY }, /Virtualizer height must be a finite number greater than 0/u],
    [{ overscan: -1 }, /Virtualizer overscan must be a finite number greater than or equal to 0/u],
    [{ overscan: 0.5 }, /Virtualizer overscan must be a finite number greater than or equal to 0/u],
    [{ overscan: Number.NaN }, /Virtualizer overscan must be a finite number greater than or equal to 0/u],
    [{ overscan: Number.POSITIVE_INFINITY }, /Virtualizer overscan must be a finite number greater than or equal to 0/u],
  ];
  for (const [input, message] of invalidVirtualizerInputs) {
    assert.throws(() => renderToString(React.createElement(Virtualizer, { 'aria-label': 'Results', ...input })), message);
  }
  assert.doesNotThrow(() => renderToString(React.createElement(Virtualizer, { 'aria-label': 'Results', height: 1, itemHeight: 1, overscan: 0 })));

  const env = installVirtualizerDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const items = Array.from({ length: 100 }, (_, index) => index === 0
    ? { id: 'item-0', label: React.createElement('strong', null, 'Item 0') }
    : `Item ${index}`);
  const scrolls = [];
  try {
    await act(async () => root.render(React.createElement(Virtualizer, {
      'aria-label': 'Results', items, height: 120, itemHeight: 40,
      onScroll: (event) => scrolls.push(event.currentTarget.scrollTop),
    })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const viewport = container.querySelector('.muxui-virtualizer');
    assert.equal(viewport.getAttribute('data-layout'), 'stack');
    assert.equal(viewport.querySelector('[role="presentation"]').style.height, '4000px');
    assert.equal(container.querySelector('[role="option"]').textContent, 'Item 0');
    assert.deepEqual([...container.querySelectorAll('[role="option"]')].map((node) => node.textContent), ['Item 0', 'Item 1', 'Item 2', 'Item 3', 'Item 4']);
    viewport.scrollTop = 800;
    await act(async () => viewport.dispatchEvent(new Event('scroll', { bubbles: true })));
    assert.deepEqual([...container.querySelectorAll('[role="option"]')].map((node) => node.textContent), ['Item 18', 'Item 19', 'Item 20', 'Item 21', 'Item 22', 'Item 23', 'Item 24']);
    assert.deepEqual(scrolls, [800]);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Tree flattens nested items for keyboard collection semantics', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const actions = [];
  try {
    await act(async () => root.render(React.createElement(Tree, {
      'aria-label': 'Navigation',
      items: [{ id: 'parent', label: React.createElement('strong', null, 'Parent'), children: [{ id: 'child', label: 'Child', disabled: true }] }],
      expandedIds: ['parent'],
      onAction: (item) => actions.push(item?.id),
    })));
    assert.equal(container.querySelectorAll('[role="row"]').length, 2);
    assert.equal(container.querySelector('[role="row"] .muxui-tree-item-label').textContent, 'Parent');
    const child = [...container.querySelectorAll('[role="row"]')].find((row) => row.getAttribute('aria-label') === 'Child');
    assert.equal(child?.getAttribute('data-disabled'), 'true');
    const parent = [...container.querySelectorAll('[role="row"]')].find((row) => row.getAttribute('aria-label') === 'Parent');
    const toggle = parent?.querySelector('.muxui-tree-toggle');
    const content = parent?.querySelector('.muxui-tree-item-content');
    assert.equal(parent?.querySelectorAll('.muxui-tree-toggle').length, 1);
    assert.ok(content);
    assert.equal(content?.querySelector('.muxui-tree-toggle'), toggle);
    assert.equal(content?.querySelector('.muxui-tree-item-label')?.textContent, 'Parent');
    assert.equal(toggle?.getAttribute('slot'), 'chevron');
    assert.equal(toggle?.getAttribute('aria-label'), 'Toggle');
    assert.equal(toggle?.querySelector('svg')?.getAttribute('aria-hidden'), 'true');
    assert.equal(toggle?.querySelector('svg')?.getAttribute('focusable'), 'false');
    assert.equal(toggle?.querySelector('svg')?.classList.contains('lucide-chevron-right'), true);
    const styles = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
    assert.doesNotMatch(styles, /\.muxui-tree-item\[data-has-child-items\].*::before/u);
    assert.match(styles, /\.muxui-tree-toggle\s*\{[^}]*transform:|\.muxui-tree-item\[data-expanded\] \.muxui-tree-toggle/u);
    await act(async () => child.click());
    assert.deepEqual(actions, []);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 unavailable calendar dates stay focusable but never select', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const unavailable = [];
  const changes = [];
  try {
    await act(async () => root.render(React.createElement(Calendar, {
      label: 'Date', defaultValue: '2025-01-01',
      unavailableDateMatcher: (date) => { unavailable.push(date); return date === '2025-01-02'; },
      onChange: (date) => changes.push(date),
    })));
    const cell = container.querySelector('[aria-label="Thursday, January 2, 2025"]');
    assert.ok(cell);
    assert.equal(cell.getAttribute('data-unavailable'), 'true');
    assert.equal(cell.getAttribute('aria-disabled'), 'true');
    assert.equal(cell.tabIndex, -1);
    await act(async () => cell.focus());
    assert.equal(document.activeElement, cell);
    await act(async () => cell.click());
    assert.deepEqual(changes, []);
    assert.ok(unavailable.includes('2025-01-02'));

    const rangeChanges = [];
    const rangeFocus = [];
    await act(async () => root.render(React.createElement(RangeCalendar, {
      label: 'Range', focusedValue: '2025-01-15', defaultValue: { start: '2025-01-01', end: '2025-01-03' },
      unavailableDateMatcher: (date) => date === '2025-01-02',
      onChange: (range) => rangeChanges.push(range),
      onFocusChange: (date) => rangeFocus.push(date),
    })));
    const rangeCell = container.querySelector('[aria-label="Thursday, January 2, 2025"]');
    assert.equal(rangeCell.getAttribute('data-unavailable'), 'true');
    await act(async () => rangeCell.click());
    await act(async () => container.querySelector('.muxui-calendar-next').click());
    assert.deepEqual(rangeChanges, []);
    assert.ok(rangeFocus.every((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)));
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Select, Table, and Tabs expose bounded state controls', async () => {
  assert.throws(() => renderToString(React.createElement(Table, {
    'aria-label': 'People', columns: [{ id: 'name', label: 'Name', sortable: true }],
    sortDescriptor: { column: 'name', direction: 'sideways' },
  })), /sortDescriptor must be/u);
  assert.throws(() => renderToString(React.createElement(Table, {
    'aria-label': 'People', columns: [{ id: 'name', label: 'Name', sortable: true }],
    sortDescriptor: { column: 'name', direction: 'ascending', upstreamKey: 'private' },
  })), /sortDescriptor must be/u);
  assert.throws(() => renderToString(React.createElement(Table, {
    'aria-label': 'People', columns: [{ id: 'name', label: 'Name' }],
    sortDescriptor: { column: 'name', direction: 'ascending' },
  })), /column must be sortable/u);

  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const opens = [];
  const selections = [];
  try {
    const selectProps = {
      label: 'Color', items: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }],
      value: 'red', onOpenChange: (open) => opens.push(open), onChange: (value) => selections.push(value),
    };
    await act(async () => root.render(React.createElement(Select, { ...selectProps, open: false })));
    assert.equal(container.querySelector('.muxui-select-trigger').getAttribute('aria-expanded'), 'false');
    await act(async () => container.querySelector('.muxui-select-trigger').click());
    assert.deepEqual(opens, [true]);
    assert.equal(container.querySelector('.muxui-select-option'), null);
    await act(async () => root.render(React.createElement(Select, { ...selectProps, open: true })));
    assert.ok(document.querySelector('.muxui-select-option'));
    await act(async () => document.querySelectorAll('.muxui-select-option')[1].click());
    assert.deepEqual(selections, ['blue']);

    const sortCalls = [];
    await act(async () => root.render(React.createElement(Table, {
      'aria-label': 'People', columns: [
        { id: 'name', label: 'Name', sortable: true }, { id: 'age', label: 'Age' },
      ], rows: [{ id: 'ada', name: 'Ada', age: 10 }, { id: 'bob', name: 'Bob', age: 2 }],
      onSortChange: (next) => sortCalls.push(next),
    })));
    await act(async () => container.querySelector('[role="columnheader"][data-allows-sorting="true"]').click());
    await act(async () => container.querySelector('[role="columnheader"]:nth-child(2)').click());
    assert.deepEqual(sortCalls, [{ column: 'name', direction: 'ascending' }]);
    assert.deepEqual([...container.querySelectorAll('.muxui-table-row')].map((row) => row.textContent), ['Ada10', 'Bob2']);
    assert.deepEqual(Object.keys(sortCalls[0]).sort(), ['column', 'direction']);

    const tabItems = [{ id: 'one', label: 'One', panel: 'One panel' }, { id: 'two', label: 'Two', panel: 'Two panel' }];
    const automatic = [];
    await act(async () => root.render(React.createElement(Tabs, { 'aria-label': 'Sections', items: tabItems, onChange: (id) => automatic.push(id) })));
    const firstTab = container.querySelectorAll('[role="tab"]')[0];
    await act(async () => firstTab.focus());
    await act(async () => firstTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.deepEqual(automatic, ['two']);

    const manual = [];
    await act(async () => root.render(React.createElement(Tabs, { 'aria-label': 'Sections', items: tabItems, keyboardActivation: 'manual', onChange: (id) => manual.push(id) })));
    const manualFirst = container.querySelectorAll('[role="tab"]')[0];
    await act(async () => manualFirst.focus());
    await act(async () => manualFirst.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.deepEqual(manual, []);
    const manualSecond = container.querySelectorAll('[role="tab"]')[1];
    await act(async () => manualSecond.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    assert.deepEqual(manual, ['two']);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 ToggleButtonGroup bounds IDs and Toolbar keeps child-owned state', async () => {
  assert.throws(() => renderToString(React.createElement(ToggleButtonGroup, {
    'aria-label': 'Styles', selectedIds: ['bold', 'italic'],
  }, React.createElement(ToggleButton, { id: 'bold' }, 'Bold'))), /at most one ID/u);
  assert.throws(() => renderToString(React.createElement(ToggleButtonGroup, {
    'aria-label': 'Styles', selectedIds: 'all',
  }, React.createElement(ToggleButton, { id: 'bold' }, 'Bold'))), /readonly string array/u);
  assert.throws(() => renderToString(React.createElement(ToggleButtonGroup, {
    'aria-label': 'Styles', selectionMode: 'invalid',
  }, React.createElement(ToggleButton, { id: 'bold' }, 'Bold'))), /selectionMode must be/u);

  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    const selected = ['bold'];
    await act(async () => root.render(React.createElement(ToggleButtonGroup, {
      'aria-label': 'Styles', selectedIds: selected, selectionMode: 'multiple',
      onSelectionChange: (ids) => changes.push(ids),
    }, React.createElement(ToggleButton, { id: 'bold' }, 'Bold'), React.createElement(ToggleButton, { id: 'italic' }, 'Italic'))));
    const buttons = [...container.querySelectorAll('button')];
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
    await act(async () => buttons[1].click());
    assert.deepEqual(changes, [['bold', 'italic']]);
    assert.notEqual(changes[0], selected);

    await act(async () => root.render(React.createElement(Toolbar, {
      'aria-label': 'Actions', disabled: true,
    }, React.createElement('button', null, 'Save'))));
    const toolbar = container.querySelector('.muxui-toolbar');
    assert.ok(toolbar);
    assert.equal(toolbar.hasAttribute('aria-disabled'), false);
    assert.equal(toolbar.hasAttribute('data-disabled'), false);
    assert.equal(toolbar.querySelector('button').disabled, false);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 direct readOnly controls retain focus while blocking mutation', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(ColorArea, { 'aria-label': 'Area', defaultValue: '#ff0000', readOnly: true, onChange: (value) => changes.push(['area', value]) }),
      React.createElement(ColorSlider, { 'aria-label': 'Channel', defaultValue: '#ff0000', readOnly: true, onChange: (value) => changes.push(['slider', value]) }),
      React.createElement(ColorWheel, { 'aria-label': 'Wheel', defaultValue: '#ff0000', readOnly: true, onChange: (value) => changes.push(['wheel', value]) }),
      React.createElement(ColorSwatchPicker, { 'aria-label': 'Swatches', readOnly: true, items: [{ id: 'red', color: '#ff0000' }], onChange: (value) => changes.push(['swatches', value]) }),
      React.createElement(Slider, { 'aria-label': 'Volume', defaultValue: 1, readOnly: true, onChange: (value) => changes.push(['numeric', value]) }),
    )));
    const targets = [
      ...container.querySelectorAll('.muxui-color-area input[type="range"]'),
      ...container.querySelectorAll('.muxui-color-slider input[type="range"]'),
      ...container.querySelectorAll('.muxui-color-wheel input[type="range"]'),
      ...container.querySelectorAll('.muxui-slider input[type="range"]'),
    ];
    const readOnlyListbox = container.querySelector('.muxui-color-swatch-picker[role="listbox"]');
    assert.ok(targets.length >= 5);
    assert.equal(container.querySelectorAll('[data-readonly="true"]').length > 0, true);
    await act(async () => {
      for (const target of targets) {
        target.focus();
        assert.equal(document.activeElement, target);
        target.blur();
        target.click();
      }
    });
    assert.deepEqual(changes, []);
    assert.equal(readOnlyListbox.tabIndex >= 0, true);
    assert.equal(container.querySelector('.muxui-slider input[type="range"]').tabIndex, 0);
  } finally {
    await act(async () => {
      document.activeElement?.blur();
      root.unmount();
    });
    env.restore();
  }
});

test('R1.3 readOnly mutation guards block RAC-handled range and swatch changes', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const changes = [];
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(ColorPicker, { 'aria-label': 'Read-only picker', readOnly: true, defaultValue: '#ff0000' },
        React.createElement(React.Fragment, null,
          React.createElement(ColorArea, { 'aria-label': 'Inherited area', defaultValue: '#ff0000', onChange: (value) => changes.push(['area', value]) }),
          React.createElement(ColorSlider, { 'aria-label': 'Inherited channel', defaultValue: '#ff0000', onChange: (value) => changes.push(['color-slider', value]) }),
          React.createElement(ColorWheel, { 'aria-label': 'Inherited wheel', defaultValue: '#ff0000', onChange: (value) => changes.push(['wheel', value]) }),
          React.createElement(ColorSwatchPicker, { 'aria-label': 'Inherited swatches', items: [{ id: 'red', color: '#ff0000' }, { id: 'blue', color: '#0000ff' }], onChange: (value) => changes.push(['swatches', value]) }),
        )),
      React.createElement(Slider, { 'aria-label': 'Read-only scalar', defaultValue: 1, min: 0, max: 2, onChange: (value) => changes.push(['scalar', value]), onChangeEnd: (value) => changes.push(['scalar-end', value]), readOnly: true }),
    )));
    const rangeSelectors = [
      '.muxui-color-area input[type="range"]',
      '.muxui-color-slider input[type="range"]',
      '.muxui-color-wheel input[type="range"]',
      '.muxui-slider input[type="range"]',
    ];
    for (const selector of rangeSelectors) {
      const initialTarget = container.querySelector(selector);
      const initialValue = initialTarget.value;
      await act(async () => initialTarget.focus());
      assert.equal(document.activeElement, initialTarget);
      await act(async () => container.querySelector(selector).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
      const currentTarget = container.querySelector(selector);
      assert.equal(currentTarget.value, initialValue, selector);
      assert.equal(document.activeElement, currentTarget);
    }
    const swatch = container.querySelectorAll('.muxui-color-swatch-picker-item')[1];
    const selectedBefore = swatch.getAttribute('aria-selected');
    await act(async () => swatch.click());
    assert.equal(swatch.getAttribute('aria-selected'), selectedBefore);
    assert.deepEqual(changes, []);
  } finally {
    await act(async () => {
      document.activeElement?.blur();
      root.unmount();
    });
    env.restore();
  }
});

test('R1.3 Slider onChangeEnd follows RAC interaction lifecycle', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const ends = [];
  try {
    await act(async () => root.render(React.createElement(Slider, {
      'aria-label': 'Volume', defaultValue: 1, min: 0, max: 2, onChangeEnd: (value) => ends.push(value),
    })));
    const input = container.querySelector('.muxui-slider input[type="range"]');
    await act(async () => input.focus());
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight']) {
      await act(async () => container.querySelector('.muxui-slider input[type="range"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    }
    assert.deepEqual(ends, [2, 2, 2]);
    const thumb = container.querySelector('.muxui-slider-thumb');
    await act(async () => thumb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 6 })));
    await act(async () => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 6 })));
    assert.deepEqual(ends, [2, 2, 2, 2]);
    await act(async () => thumb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 7 })));
    const move = new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 7 });
    Object.defineProperty(move, 'pageX', { value: 1 });
    await act(async () => window.dispatchEvent(move));
    await act(async () => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 7 })));
    assert.deepEqual(ends, [2, 2, 2, 2, 2]);
    await act(async () => container.querySelector('.muxui-slider input[type="range"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })));
    assert.deepEqual(ends, [2, 2, 2, 2, 2]);

    const noTransition = [];
    await act(async () => root.render(React.createElement(Slider, { key: 'no-transition', 'aria-label': 'No transition', defaultValue: 1, onChangeEnd: (value) => noTransition.push(value) })));
    const noTransitionThumb = container.querySelector('.muxui-slider-thumb');
    await act(async () => noTransitionThumb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerId: 8 })));
    await act(async () => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 8 })));
    assert.deepEqual(noTransition, []);

    const controlledChanges = [];
    const controlledEnds = [];
    const controlledProps = {
      key: 'controlled', 'aria-label': 'Controlled', value: 1,
      onChange: (value) => controlledChanges.push(value),
      onChangeEnd: (value) => controlledEnds.push(value),
    };
    await act(async () => root.render(React.createElement(Slider, controlledProps)));
    await act(async () => root.render(React.createElement(Slider, { ...controlledProps, value: 2 })));
    assert.deepEqual(controlledChanges, []);
    assert.deepEqual(controlledEnds, []);

    const silent = [];
    await act(async () => root.render(React.createElement(Slider, { key: 'silent', 'aria-label': 'Silent', defaultValue: 1, disabled: true, onChangeEnd: (value) => silent.push(value) })));
    const silentInput = container.querySelector('.muxui-slider input[type="range"]');
    await act(async () => silentInput.focus());
    await act(async () => container.querySelector('.muxui-slider input[type="range"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
    assert.deepEqual(silent, []);
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Virtualizer mounts exact fixed-row windows and preserves focused identity', async () => {
  const env = installVirtualizerDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const items = Array.from({ length: 100 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` }));
  const mounted = () => [...container.querySelectorAll('.muxui-virtualizer-item')].map((item) => Number(item.getAttribute('aria-posinset')) - 1);
  const presentation = () => container.querySelector('[role="presentation"]');
  const viewport = () => container.querySelector('.muxui-virtualizer');
  try {
    let firstViewport;
    for (const [overscan, expectedStart, expectedMiddle, expectedEnd] of [
      [0, [0, 1, 2], [50, 51, 52], [97, 98, 99]],
      [1, [0, 1, 2, 3], [49, 50, 51, 52, 53], [96, 97, 98, 99]],
      [2, [0, 1, 2, 3, 4], [48, 49, 50, 51, 52, 53, 54], [95, 96, 97, 98, 99]],
    ]) {
      await act(async () => root.render(React.createElement(Virtualizer, { 'aria-label': 'Results', items, height: 120, itemHeight: 40, overscan })));
      const currentViewport = viewport();
      if (firstViewport) assert.equal(currentViewport, firstViewport);
      else firstViewport = currentViewport;
      currentViewport.scrollTop = 0;
      await act(async () => currentViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
      assert.deepEqual(mounted(), expectedStart);
      currentViewport.scrollTop = 2000;
      await act(async () => currentViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
      assert.deepEqual(mounted(), expectedMiddle);
      currentViewport.scrollTop = 3880;
      await act(async () => currentViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
      assert.deepEqual(mounted(), expectedEnd);
      assert.equal(presentation().style.height, '4000px');
    }
    await act(async () => root.render(React.createElement(Virtualizer, { 'aria-label': 'Results', items: items.slice(0, 50), height: 160, itemHeight: 32, overscan: 0 })));
    const resizedViewport = viewport();
    resizedViewport.scrollTop = 0;
    await act(async () => env.resize(resizedViewport));
    await act(async () => resizedViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
    assert.equal(resizedViewport.clientHeight, 160);
    assert.equal(resizedViewport.style.blockSize, '160px');
    assert.equal(presentation().style.height, '1600px');
    assert.deepEqual(mounted(), [0, 1, 2, 3, 4]);

    await act(async () => root.render(React.createElement(Virtualizer, { 'aria-label': 'Results', items, height: 120, itemHeight: 40, overscan: 2 })));
    const currentViewport = viewport();
    currentViewport.scrollTop = 2000;
    await act(async () => currentViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
    const focused = container.querySelector('[aria-posinset="51"]');
    await act(async () => focused.focus());
    assert.equal(document.activeElement, focused);
    const focusedIdentity = focused.getAttribute('aria-posinset');
    currentViewport.scrollTop = 3880;
    await act(async () => currentViewport.dispatchEvent(new Event('scroll', { bubbles: true })));
    assert.equal(document.activeElement, focused);
    assert.equal(focused.getAttribute('aria-posinset'), focusedIdentity);
    assert.equal(focused.textContent, 'Item 50');
    assert.equal(mounted().includes(50), true);
    assert.deepEqual(mounted().filter((index) => index >= 95), [95, 96, 97, 98, 99]);
    assert.equal(presentation().style.height, '4000px');
  } finally {
    await act(async () => document.activeElement?.blur());
    await act(async () => root.unmount());
    env.restore();
  }
});

test('R1.3 Menu ordering and GridList disabled hooks stay canonical', async () => {
  const env = installDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  const eventsSeen = [];
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(Menu, {
        'aria-label': 'Actions', items: [{ id: 'enabled', label: 'Enabled' }, { id: 'disabled', label: 'Disabled', disabled: true }],
        onAction: (item) => eventsSeen.push(['action', item.id]), onSelect: (item) => eventsSeen.push(['select', item.id]),
      }),
      React.createElement(GridList, {
        'aria-label': 'Files', items: [{ id: 'active', label: 'Active' }, { id: 'blocked', label: 'Blocked', disabled: true }],
      }),
    )));
    const menuItems = [...container.querySelectorAll('[role="menuitem"]')];
    await act(async () => menuItems[0].click());
    await act(async () => menuItems[1].click());
    assert.deepEqual(eventsSeen, [['action', 'enabled'], ['select', 'enabled']]);
    const blocked = container.querySelector('[role="row"][data-disabled="true"]');
    assert.equal(blocked?.getAttribute('aria-disabled'), 'true');
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
});
