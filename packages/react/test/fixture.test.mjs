import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Button } from '../src/button.mjs';
import * as generated from '../generated/index.mjs';
import { R1ButtonFixture } from '../src/button-fixture.mjs';
import { createDom } from './support/dom.mjs';

test('Button owns MuxUI selectors and required token bindings', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  assert.match(css, /\.muxui-button/);
  for (const token of ['muxui-component-button-background', 'muxui-component-button-foreground', 'muxui-component-button-radius', 'muxui-component-button-padding-inline', 'muxui-component-button-min-height']) assert.match(css, new RegExp(token));
  assert.doesNotMatch(css, /--color-60/);
});

test('component selectors stay Mux UI-owned', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  const names = ['Button', 'Breadcrumbs', 'Checkbox', 'Disclosure', 'DisclosureGroup', 'Group', 'Link', 'Meter', 'ProgressBar', 'Separator', 'ToggleButton', 'Autocomplete', 'CheckboxGroup', 'DateField', 'DatePicker', 'DateRangePicker', 'Form', 'NumberField', 'SearchField', 'Switch', 'TextField', 'TimeField', 'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel', 'ComboBox', 'GridList', 'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup', 'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tree', 'Virtualizer', 'DropZone', 'FileTrigger', 'Dialog', 'Popover', 'PreviewTrigger', 'Toast', 'Tooltip'];
  for (const name of names) {
    if (name === 'FileTrigger') continue;
    const slug = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '');
    assert.match(css, new RegExp(`\\.muxui-${slug}(?:\\b|[-_])`));
  }
  assert.match(await readFile(resolve(import.meta.dirname, '../generated/overlays.mjs'), 'utf8'), /muxui-file-trigger/u);
  assert.match(css, /\.muxui-checkbox-indicator/);
  assert.match(css, /data-indeterminate/);
  assert.match(css, /semantic-feedback-invalid/);
  assert.doesNotMatch(css, /--color-60/u);
});

test('generated theme keeps static defaults and exposes responsive dimensions only on the opt-in scope', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  const responsiveStart = css.indexOf('[data-muxui-responsive]');
  assert.ok(responsiveStart >= 0);
  const rootStart = css.indexOf(':root');
  assert.ok(rootStart >= 0 && rootStart < responsiveStart);
  assert.doesNotMatch(css.slice(rootStart, responsiveStart), /clamp\(/u);
  const responsiveEnd = css.indexOf('\n}', responsiveStart);
  assert.ok(responsiveEnd > responsiveStart);
  const responsiveBlock = css.slice(responsiveStart, responsiveEnd);
  assert.match(responsiveBlock, /clamp\(/u);
  assert.match(responsiveBlock, /--muxui-reference-dimension-space-xl/u);
  assert.match(responsiveBlock, /--muxui-reference-dimension-text-5xl/u);
});

test('R1.1 MuxUI Button proves SSR, hydration, disabled and pending state', async () => {
  const server = renderToString(React.createElement(R1ButtonFixture, { pending: true }));
  const disabledServer = renderToString(React.createElement(R1ButtonFixture, { disabled: true }));
  assert.match(server, /aria-busy="true"/);
  assert.match(server, /data-muxui-state="pending"/);
  assert.doesNotMatch(server, / disabled=""/);
  assert.match(disabledServer, / disabled=""/);
  assert.match(disabledServer, /data-disabled="true"/);
  const dom = new JSDOM(`<!doctype html><div id="root">${server}</div>`);
  const keys = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'SVGElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'PointerEvent', 'MutationObserver'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    SVGElement: dom.window.SVGElement,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    PointerEvent: dom.window.PointerEvent ?? dom.window.MouseEvent,
    MutationObserver: dom.window.MutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let hydrated;
  let presses = 0;
  try {
    const root = document.querySelector('#root');
    const button = root.querySelector('button');
    assert.equal(button.disabled, false);
    assert.equal(button.getAttribute('aria-disabled'), 'true');
    await act(async () => { hydrated = hydrateRoot(root, React.createElement(R1ButtonFixture, { pending: true, onPress: () => { presses += 1; } })); });
    assert.equal(root.querySelector('button').getAttribute('data-muxui-state'), 'pending');
    const pendingButton = root.querySelector('button');
    const pendingLabelId = pendingButton.getAttribute('aria-labelledby');
    assert.ok(pendingLabelId);
    assert.equal(document.getElementById(pendingLabelId)?.textContent, 'Working');
    await act(async () => root.querySelector('button').focus());
    assert.equal(document.activeElement, root.querySelector('button'));
    await act(async () => root.querySelector('button').click());
    assert.equal(presses, 0);
    assert.equal(root.firstElementChild.dataset.muxuiPressCount, '0');
    await act(async () => hydrated.unmount());

    const ref = React.createRef();
    const consumer = createRoot(root);
    await act(async () => consumer.render(React.createElement(Button, {
      ref,
      'aria-label': 'MuxUI action',
      'data-consumer-hook': 'preserved',
    }, 'Save')));
    const direct = root.querySelector('button');
    assert.equal(ref.current, direct);
    assert.equal(direct.getAttribute('aria-label'), 'MuxUI action');
    assert.equal(direct.dataset.consumerHook, 'preserved');

    let activation;
    await act(async () => consumer.render(React.createElement(Button, {
      onActivate: (event) => { activation = event; },
    }, 'Activate')));
    let clickError;
    try {
      await act(async () => root.querySelector('button').click());
    } catch (error) {
      clickError = error;
    }
    assert.equal(clickError, undefined);
    assert.equal(activation.type, 'activate');
    assert.ok(['mouse', 'pen', 'touch', 'keyboard', 'virtual', undefined].includes(activation.pointerType));
    assert.equal(activation.target instanceof dom.window.HTMLButtonElement, true);
    assert.equal('preventDefault' in activation, false);
    await act(async () => consumer.unmount());
  } finally {
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    dom.window.close();
  }
});

test('Button exposes seven variants with stable root hooks', async () => {
  const variants = ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'];
  const sizes = ['sm', 'md', 'lg'];
  const defaults = renderToString(React.createElement(Button, null, 'Save'));
  assert.match(defaults, /data-variant="primary"/u);
  assert.match(defaults, /data-size="md"/u);

  for (const variant of variants) {
    for (const size of sizes) {
      const markup = renderToString(React.createElement(Button, {
        variant,
        size,
        className: 'consumer-button',
        style: { minWidth: '5rem' },
        'data-consumer-hook': 'preserved',
      }, 'Action'));
      assert.match(markup, new RegExp(`data-variant="${variant}"`, 'u'));
      assert.match(markup, new RegExp(`data-size="${size}"`, 'u'));
      assert.match(markup, /class="muxui-button consumer-button"/u);
      assert.match(markup, /style="min-width:5rem"/u);
      assert.match(markup, /data-consumer-hook="preserved"/u);
    }
  }

  assert.throws(
    () => renderToString(React.createElement(Button, { variant: 'experimental' }, 'Save')),
    /Button variant must be one of/u,
  );
  assert.throws(
    () => renderToString(React.createElement(Button, { size: 'medium' }, 'Save')),
    /Button size must be one of/u,
  );

  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  for (const variant of variants) assert.match(css, new RegExp(`\\.muxui-button\\[data-variant='${variant}'\\]`, 'u'));
  for (const size of sizes) assert.match(css, new RegExp(`\\.muxui-button\\[data-size='${size}'\\]`, 'u'));
  assert.match(css, /\.muxui-button\s*\{[^}]*--muxui-button-background:/u);
  const destructivePrimaryRule = css.match(/\.muxui-button\[data-variant='danger'\]\s*\{[^}]*\}/u)?.[0] ?? '';
  assert.ok(destructivePrimaryRule);
  assert.doesNotMatch(destructivePrimaryRule, /\bblack\b/u);
  assert.match(destructivePrimaryRule, /--muxui-button-foreground:\s*var\(--muxui-semantic-color-error-60-fg\)/u);
  assert.match(css, /\.muxui-button\[data-size='lg'\][\s\S]*font-size:\s*var\(--muxui-semantic-typography-label-m-font-size\)[\s\S]*padding-inline:\s*var\(--muxui-semantic-layout-inset-large\)/u);

  const pendingWithText = renderToString(React.createElement(Button, { pending: true, showTextWhileLoading: true }, 'Saving'));
  assert.match(pendingWithText, /muxui-button-content--with-spinner/u);
  assert.match(pendingWithText, /muxui-button-spinner--inline/u);
  assert.doesNotMatch(pendingWithText, /visibility:hidden/u);
});

test('Button generator guard binds the canonical finite API contract', async () => {
  const artifact = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../catalog/components/button/artifact.json'), 'utf8'));
  const { api } = artifact.bindings['web.react'];
  const descriptor = JSON.parse(await readFile(resolve(import.meta.dirname, '../generated/descriptor.json'), 'utf8'));
  assert.deepEqual(descriptor.bindings.find(({ export: name }) => name === 'Button').api, api);
  // The renderer applies the catalog defaults when no props are given.
  const markup = renderToString(React.createElement(Button, null, 'Save'));
  assert.match(markup, new RegExp(`data-variant="${api.defaults.variant}"`, 'u'));
  assert.match(markup, new RegExp(`data-size="${api.defaults.size}"`, 'u'));
  const result = spawnSync(process.execPath, ['src/generate.mjs', '--check'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  assert.equal(result.status, 0, result.stderr);
});

// How a catalog default shows in server-rendered markup. Expected values come
// from the catalog artifact; only the markup each renderer exposes is named here.
const markupFlags = {
  disabled: '[disabled], [data-disabled], [aria-disabled="true"]',
  readOnly: '[readonly], [data-readonly], [aria-readonly="true"]',
  required: '[required], [data-required], [aria-required="true"]',
  invalid: '[data-invalid], [aria-invalid="true"]',
  pending: '[data-pending], [aria-busy="true"]',
  indeterminate: '[data-indeterminate], [aria-checked="mixed"]',
  selected: '[aria-pressed="true"], [data-selected]',
  defaultSelected: '[aria-pressed="true"], [data-selected]',
  defaultChecked: '[checked], [data-selected]',
};
const markupValues = {
  size: (doc) => doc.querySelector('[data-size]')?.getAttribute('data-size'),
  variant: (doc) => doc.querySelector('[data-variant]')?.getAttribute('data-variant'),
  orientation: (doc) => doc.querySelector('[data-orientation]')?.getAttribute('data-orientation'),
  defaultValue: (doc) => doc.querySelector('input')?.getAttribute('value'),
  selectionMode: (doc) => ({ radiogroup: 'single', toolbar: 'multiple' })[doc.querySelector('[role="radiogroup"], [role="toolbar"]')?.getAttribute('role')],
};
const h = React.createElement;
const minimalRenders = {
  Button: () => h(generated.Button, null, 'Save'),
  ToggleButton: () => h(generated.ToggleButton, null, 'Bold'),
  ToggleButtonGroup: () => h(generated.ToggleButtonGroup, { 'aria-label': 'Format' }, h(generated.ToggleButton, { id: 'a' }, 'A'), h(generated.ToggleButton, { id: 'b' }, 'B')),
  Checkbox: () => h(generated.Checkbox, null, 'Agree'),
  CheckboxGroup: () => h(generated.CheckboxGroup, { label: 'Group' }, h(generated.Checkbox, { value: 'a' }, 'A')),
  RadioGroup: () => h(generated.RadioGroup, { label: 'Choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }),
  Autocomplete: () => h(generated.Autocomplete, { label: 'City', items: ['Melbourne'] }),
  Tabs: () => h(generated.Tabs, { 'aria-label': 'Sections', items: [{ id: 'one', label: 'One', panel: 'One' }, { id: 'two', label: 'Two', panel: 'Two' }] }),
};
const sectionItems = [{ id: 'one', label: 'One', panel: 'One' }, { id: 'two', label: 'Two', panel: 'Two' }];

async function withMounted(element, run) {
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(element));
    return await run(document.querySelector('#root'));
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
}

// Defaults only behaviour shows. Each observer renders the component (optionally
// with the prop overridden) and returns what the renderer does.
const behaviourObservers = {
  Button: {
    // A pending Button either keeps its label visible beside the spinner or hides it.
    showTextWhileLoading: (props) => {
      const { document } = new JSDOM(renderToString(h(generated.Button, { pending: true, ...props }, 'Saving'))).window;
      return !(document.querySelector('.muxui-button-content')?.getAttribute('style') ?? '').includes('visibility:hidden');
    },
  },
  ToggleButtonGroup: {
    // Activating the only selected item either keeps or clears the selection.
    disallowEmptySelection: (props) => withMounted(
      h(generated.ToggleButtonGroup, { 'aria-label': 'Format', defaultSelectedIds: ['a'], ...props }, h(generated.ToggleButton, { id: 'a' }, 'A'), h(generated.ToggleButton, { id: 'b' }, 'B')),
      async (container) => {
        await act(async () => container.querySelector('button').click());
        return container.querySelector('[aria-checked="true"], [aria-pressed="true"]') !== null;
      },
    ),
  },
  Tabs: {
    // An arrow key either selects the next tab at once (automatic) or only moves focus (manual).
    keyboardActivation: (props) => {
      const changes = [];
      return withMounted(h(generated.Tabs, { 'aria-label': 'Sections', items: sectionItems, onChange: (id) => changes.push(id), ...props }), async (container) => {
        const [first] = container.querySelectorAll('[role="tab"]');
        await act(async () => first.focus());
        await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
        return changes.length > 0 ? 'automatic' : 'manual';
      });
    },
  },
};

const kebab = (name) => name.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();

/** Catalog defaults the server-rendered markup contradicts. */
function defaultMismatches(markup, defaults) {
  const { document } = new JSDOM(markup).window;
  const mismatches = [];
  for (const [key, expected] of Object.entries(defaults)) {
    const observed = key in markupFlags ? document.querySelector(markupFlags[key]) !== null : markupValues[key]?.(document);
    if ((key in markupFlags || key in markupValues) && observed !== expected) mismatches.push(`${key}: catalog ${JSON.stringify(expected)}, rendered ${JSON.stringify(observed)}`);
  }
  return mismatches;
}

/** Catalog defaults the renderer's behaviour contradicts. */
async function behaviourMismatches(name, defaults) {
  const mismatches = [];
  for (const [key, observe] of Object.entries(behaviourObservers[name] ?? {})) {
    if (!(key in defaults)) continue;
    const observed = await observe();
    if (observed !== defaults[key]) mismatches.push(`${key}: catalog ${JSON.stringify(defaults[key])}, behaves ${JSON.stringify(observed)}`);
  }
  return mismatches;
}

/** Catalog defaults no markup or behaviour observer covers, so they would pass unchecked. */
const unobservedDefaults = (name, defaults) => Object.keys(defaults)
  .filter((key) => !(key in markupFlags) && !(key in markupValues) && !(key in (behaviourObservers[name] ?? {})));

/** Catalog props the generated declarations of `${name}Props` (and the interfaces it names) do not declare. */
function undeclaredProps(types, name, props) {
  const declaration = (identifier) => {
    const start = types.search(new RegExp(`^export (?:interface|type) ${identifier}\\b`, 'mu'));
    const end = types.indexOf('\nexport ', start + 1);
    return start === -1 ? '' : types.slice(start, end === -1 ? undefined : end);
  };
  const seen = new Set();
  const collect = (identifier) => {
    if (seen.has(identifier)) return '';
    seen.add(identifier);
    const text = declaration(identifier);
    return text + [...text.matchAll(/\b[A-Z][A-Za-z]+\b/gu)].map(([reference]) => collect(reference)).join('\n');
  };
  const surface = collect(`${name}Props`);
  return props.filter((prop) => !new RegExp(`(?:\\b|['"])${prop}['"]?\\??\\s*:`, 'u').test(surface));
}

test('catalog defaults and props agree with the renderer for every generator-guarded component', async () => {
  const types = await readFile(resolve(import.meta.dirname, '../generated/index.d.ts'), 'utf8');
  const catalogApi = {};
  for (const [name, render] of Object.entries(minimalRenders)) {
    const artifact = JSON.parse(await readFile(resolve(import.meta.dirname, `../../../catalog/components/${kebab(name)}/artifact.json`), 'utf8'));
    const { api } = artifact.bindings['web.react'];
    catalogApi[name] = api;
    const markup = renderToString(render());
    assert.deepEqual(defaultMismatches(markup, api.defaults), [], `${name} renders the catalog defaults`);
    assert.deepEqual(await behaviourMismatches(name, api.defaults), [], `${name} behaves as the catalog defaults say`);
    assert.deepEqual(unobservedDefaults(name, api.defaults), [], `${name} defaults each have a markup or behaviour observer`);
    assert.deepEqual(undeclaredProps(types, name, api.props), [], `${name} generated declarations list the catalog props`);
    if ('size' in api.defaults) assert.equal(markupValues.size(new JSDOM(markup).window.document), api.defaults.size, `${name} exposes its size default`);
  }
  // Catalog drift is caught: a different default or an undeclared prop fails.
  const toggle = catalogApi.ToggleButton;
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ToggleButton()), { ...toggle.defaults, size: 'lg' }), ['size: catalog "lg", rendered "md"']);
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ToggleButton()), { ...toggle.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(undeclaredProps(types, 'ToggleButton', [...toggle.props, 'missingProp']), ['missingProp']);
  // Selection mode follows the role each mode renders: radiogroup for single, toolbar for multiple.
  const multiple = renderToString(h(generated.ToggleButtonGroup, { 'aria-label': 'Format', selectionMode: 'multiple' }, h(generated.ToggleButton, { id: 'a' }, 'A')));
  assert.equal(markupValues.selectionMode(new JSDOM(multiple).window.document), 'multiple');
  assert.deepEqual(defaultMismatches(multiple, { ...catalogApi.ToggleButtonGroup.defaults, selectionMode: 'multiple' }), []);
  assert.equal(defaultMismatches(renderToString(minimalRenders.ToggleButtonGroup()), { selectionMode: 'multiple' }).length, 1);
});

test('catalog defaults only behaviour shows are compared with what the renderer does', async () => {
  const states = { showTextWhileLoading: [false, true], disallowEmptySelection: [false, true], keyboardActivation: ['automatic', 'manual'] };
  for (const [name, observers] of Object.entries(behaviourObservers)) {
    for (const [key, observe] of Object.entries(observers)) {
      // The observer sees both states, so a catalog default that differs from the renderer is reported.
      const rendered = await observe();
      for (const value of states[key]) {
        assert.equal(await observe({ [key]: value }), value, `${name}.${key} observer sees ${value}`);
        assert.equal((await behaviourMismatches(name, { [key]: value })).length, value === rendered ? 0 : 1, `${name}.${key}=${value} is compared with the rendered ${rendered}`);
      }
    }
  }
});

test('MuxUI styles bind states and public theme hooks', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');

  assert.match(css, /\.muxui-button[\s\S]*border: 0;[\s\S]*outline: 1px solid transparent;[\s\S]*font-size: var\(--muxui-semantic-typography-body-size\)/u);
  assert.match(css, /\.muxui-button[\s\S]*box-shadow: var\(--muxui-button-shadow\)/u);
  assert.match(css, /--muxui-button-shadow: var\(--muxui-semantic-elevation-control\)/u);
  assert.match(css, /\.muxui-button\[data-hovered\][\s\S]*var\(--muxui-semantic-action-background-hover\)/u);
  assert.match(css, /\.muxui-button\[data-pressed\][\s\S]*var\(--muxui-semantic-action-background-pressed\)/u);
  assert.match(css, /\.muxui-button\[data-pressed\]:not\(\[data-disabled\], \[data-pending\], \[aria-expanded='true'\]\)/u);
  assert.match(css, /\.muxui-button:active:not\(\[data-disabled\], \[data-pending\]\)/u);

  assert.match(css, /\.muxui-link\[data-hovered\][\s\S]*var\(--muxui-semantic-content-link-hover\)/u);
  assert.match(css, /\.muxui-link\[data-pressed\][\s\S]*var\(--muxui-semantic-content-link-pressed\)/u);
  assert.match(css, /\.muxui-link[^\{]*\{[\s\S]*var\(--muxui-semantic-content-link\)/u);
  assert.match(css, /\.muxui-tab\[aria-selected='true'\][\s\S]*var\(--muxui-semantic-content-link\)/u);
  assert.match(css, /\.muxui-autocomplete-option\[aria-selected='true'\][\s\S]*var\(--muxui-semantic-content-link\)/u);
  assert.match(css, /\.muxui-breadcrumbs-item\[data-current\][\s\S]*font-weight: var\(--muxui-semantic-typography-label-weight\)/u);
  assert.match(css, /\.muxui-breadcrumbs-item\[data-disabled\]:not\(\[data-current\]\)[^}]*color: var\(--muxui-semantic-content-default\)/u);
  assert.doesNotMatch(css, /\.muxui-breadcrumbs-item\[data-disabled\][^}]*opacity:/u);

  assert.match(css, /\.muxui-dialog\s*\{[^}]*transform: translate\(-50%, -50%\)[^;]*;/u);
  assert.doesNotMatch(css, /\.muxui-popover\[data-entering\][\s\S]*transform: scale\(0\.97\)/u);
  assert.match(css, /\.muxui-tooltip\s*\{[\s\S]*font-size: var\(--muxui-semantic-typography-tiny-size\);[\s\S]*line-height: var\(--muxui-semantic-typography-compact-line-height\)/u);
  assert.match(css, /\.muxui-tooltip\s*\{[\s\S]*opacity var\(--muxui-semantic-motion-feedback-duration\)/u);
  assert.match(css, /\.muxui-tooltip\[data-entering\][\s\S]*scale: 0\.9;[\s\S]*filter: blur\(5px\)/u);
  assert.match(css, /\.muxui-toast\s*\{[\s\S]*transition: none;/u);
  assert.match(css, /\.muxui-toast\[data-muxui-toast-exiting\][\s\S]*pointer-events: none;/u);
  assert.match(css, /\.muxui-dialog-backdrop\s*\{[\s\S]*position: fixed;[\s\S]*inset: 0;/u);
  assert.match(css, /\.muxui-dialog-content\s*\{[\s\S]*font-weight: var\(--muxui-semantic-typography-body-weight\)/u);
  assert.match(css, /\.muxui-field-description\s*\{[\s\S]*color: var\(--muxui-semantic-content-default\)/u);
  assert.match(css, /\.muxui-button\[data-pending\] \.muxui-button-content\s*\{[^}]*opacity:\s*0;/u);
  assert.match(css, /\.muxui-button\[data-pending\]::after[\s\S]*content: none;/u);
  assert.match(css, /\.muxui-progress-bar\[data-indeterminate\] \.muxui-progress-bar-fill[\s\S]*margin-inline-start: 30%;/u);
  assert.doesNotMatch(css, /muxui-control-spin|muxui-progress-indeterminate/u);
  const infiniteAnimationRules = [...css.matchAll(/([^{}]+\{[^{}]*animation:[^;]*infinite[^{}]*\})/gu)].map(([rule]) => rule);
  assert.ok(infiniteAnimationRules.length > 0, 'current union retains the explicit indeterminate progress behavior');
  assert.ok(infiniteAnimationRules.every((rule) => /\.muxui-(?:progress-(?:bar|circle)|button-spinner)/u.test(rule)), 'continuous animation is restricted to indeterminate progress and pending button spinners');
  assert.match(css, /\.muxui-button-spinner\s*\{[\s\S]*animation: muxui-button-spinner-rotate var\(--muxui-semantic-motion-progress-spin-duration\) var\(--muxui-semantic-motion-constant-easing\) infinite;/u);
  assert.match(css, /\.muxui-button-spinner-arc\s*\{[\s\S]*animation: muxui-button-spinner-dash var\(--muxui-semantic-motion-progress-sweep-duration\) var\(--muxui-semantic-motion-progress-easing\) infinite;/u);

  assert.match(css, /--muxui-component-button-background: var\(--muxui-semantic-action-background\);/u);
  assert.match(css, /--muxui-component-button-foreground: var\(--muxui-semantic-action-foreground\);/u);
  assert.match(css, /--muxui-component-button-min-height: var\(--muxui-semantic-control-size-md\);/u);
  assert.match(css, /--muxui-component-button-radius: var\(--muxui-semantic-control-radius\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-component-button-background: var\(--muxui-semantic-action-background\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-component-button-foreground: var\(--muxui-semantic-action-foreground\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-field-background: var\(--muxui-semantic-color-neutral-5\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-overlay-background: var\(--muxui-semantic-color-neutral-5\);/u);
  assert.match(css, /--muxui-semantic-selection-track: var\(--muxui-semantic-color-color-60\);/u);
  assert.match(css, /--muxui-semantic-content-link: var\(--muxui-semantic-color-color-70\);/u);
  assert.match(css, /--muxui-semantic-feedback-invalid: var\(--muxui-reference-color-error-60\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-content-link: var\(--muxui-semantic-color-color-70\);/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-feedback-invalid: var\(--muxui-reference-color-error-30\);/u);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*--muxui-button-background: ButtonFace !important;/u);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.muxui-file-trigger \{[^}]*background: ButtonFace;[^}]*color: ButtonText;/u);

  assert.match(css, /--muxui-reference-color-brand-60: #025768;/u);
  assert.doesNotMatch(css, /var\(--muxui-private-/u);
  // Custom properties only; BEM modifiers such as muxui-image--radius-md are class names.
  assert.doesNotMatch(css, /(?<![\w-])(?:--color-60|--radius-m|--space-xs)/u);
});

test('pending Button preserves its accessible name without overriding caller naming', () => {
  const hiddenLabel = renderToString(React.createElement(Button, { pending: true }, 'Saving changes'));
  assert.match(hiddenLabel, /id="muxui-button-label-[^"]+"/u);
  assert.doesNotMatch(hiddenLabel, /aria-label=/u);

  const explicitLabel = renderToString(React.createElement(Button, { pending: true, 'aria-label': 'Save report' }, 'Saving changes'));
  assert.match(explicitLabel, /aria-label="Save report"/u);
  assert.doesNotMatch(explicitLabel, /aria-labelledby="muxui-button-label-/u);

  const explicitLabelledBy = renderToString(React.createElement(Button, { pending: true, 'aria-labelledby': 'report-label' }, 'Saving changes'));
  assert.match(explicitLabelledBy, /aria-labelledby="[^"]*report-label/u);
  assert.doesNotMatch(explicitLabelledBy, /aria-labelledby="muxui-button-label-/u);

  const undefinedLabel = renderToString(React.createElement(Button, { pending: true, 'aria-label': undefined }, 'Saving changes'));
  assert.match(undefinedLabel, /id="muxui-button-label-[^"]+"/u);
});
