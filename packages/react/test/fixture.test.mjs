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
import { R1ButtonFixture } from '../src/button-fixture.mjs';
import { EXPECTED_R12_DONOR_CONTRACT } from '../src/r1-2-donor-contract.mjs';

test('R1.1 Button owns MuxUI selectors and required token crosswalk', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  const comparison = JSON.parse(await readFile(resolve(import.meta.dirname, '../generated/button-donor-comparison.json'), 'utf8'));
  assert.match(css, /\.muxui-r1-button/);
  for (const token of ['muxui-component-button-background', 'muxui-component-button-foreground', 'muxui-component-button-radius', 'muxui-component-button-padding-inline', 'muxui-component-button-min-height']) assert.match(css, new RegExp(token));
  assert.doesNotMatch(css, /--color-60|\.tale-/);
  assert.equal(comparison.donor.commit, '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd');
  assert.equal(comparison.result.selector, '.muxui-button');
  assert.equal(comparison.result.status, 'adapted-for-r1.1-button');
  assert.equal(comparison.consumedRules.length, 16);
});

test('R1.4 component selectors and donor dispositions stay Mux UI-owned', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  const comparisonSource = await readFile(resolve(import.meta.dirname, '../generated/component-donor-comparison.json'), 'utf8');
  const comparison = JSON.parse(comparisonSource.replace(/^\/\/ @generated-from:.*\n\/\/ @generated-content-sha256:.*\n/u, ''));
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
  assert.equal(comparison.components.length, names.length);
  assert.deepEqual(comparison.components.map(({ component }) => component), names);
  assert.equal(comparison.components.find(({ component }) => component === 'Group').disposition, 'no-applicable-donor');
  assert.ok(comparison.components.filter(({ disposition }) => disposition === 'adapt').length >= 9);
  assert.doesNotMatch(css, /(?:\\.tale-|--color-60)/u);
});

test('R1.2 donor crosswalk is exact, adapted, and dependency-free', async () => {
  const repositoryRoot = resolve(import.meta.dirname, '../../..');
  const crosswalk = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/react-r1-2/donor-crosswalk.json'), 'utf8'));
  const slugs = ['autocomplete', 'checkbox-group', 'date-field', 'date-picker', 'date-range-picker', 'form', 'number-field', 'search-field', 'switch', 'text-field', 'time-field'];
  assert.equal(crosswalk.schema, 'muxui-react-r1-2-donor-crosswalk-v1');
  assert.deepEqual(crosswalk, EXPECTED_R12_DONOR_CONTRACT);
  assert.equal(crosswalk.donor.commit, '94bf62a26c02605c8928dfeb24f0ddc4be1c92fd');
  assert.equal(crosswalk.dependency, false);
  assert.deepEqual(crosswalk.sharedPrimitives, [
    { path: 'packages/styles/src/_primitives.css', blob: 'b54d4ab7296f992731cfd844b4edac28d5254ee8' },
    { path: 'packages/styles/src/button.css', blob: '32227dc8969351bb11499d53e7773425b3fe7e68' },
  ]);
  assert.deepEqual(Object.keys(crosswalk.components).sort(), slugs.sort());
  for (const slug of slugs) {
    const entry = crosswalk.components[slug];
    assert.equal(entry.disposition, 'adapt');
    assert.deepEqual(entry.rules.map(({ input }) => input), entry.consumedRules);
    assert.ok(entry.donorInputs.length >= 3);
    assert.ok(entry.donorInputs.every(({ path, blob }) => path && /^[0-9a-f]{40}$/u.test(blob)));
  }
  assert.match(await readFile(resolve(repositoryRoot, 'packages/react/NOTICE'), 'utf8'), /Tale UI contributors/);
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

test('Button exposes finite orthogonal visual axes with stable root hooks', async () => {
  const variants = ['primary', 'secondary', 'ghost'];
  const tones = ['default', 'destructive'];
  const sizes = ['sm', 'md', 'lg'];
  const defaults = renderToString(React.createElement(Button, null, 'Save'));
  assert.match(defaults, /data-variant="primary"/u);
  assert.match(defaults, /data-tone="default"/u);
  assert.match(defaults, /data-size="md"/u);

  for (const variant of variants) {
    for (const tone of tones) {
      for (const size of sizes) {
        const markup = renderToString(React.createElement(Button, {
          variant,
          tone,
          size,
          className: 'consumer-button',
          style: { minWidth: '5rem' },
          'data-consumer-hook': 'preserved',
        }, 'Action'));
        assert.match(markup, new RegExp(`data-variant="${variant}"`, 'u'));
        assert.match(markup, new RegExp(`data-tone="${tone}"`, 'u'));
        assert.match(markup, new RegExp(`data-size="${size}"`, 'u'));
        assert.match(markup, /class="muxui-button consumer-button"/u);
        assert.match(markup, /style="min-width:5rem"/u);
        assert.match(markup, /data-consumer-hook="preserved"/u);
      }
    }
  }

  assert.throws(
    () => renderToString(React.createElement(Button, { variant: 'neutral' }, 'Save')),
    /Button variant must be one of/u,
  );
  assert.throws(
    () => renderToString(React.createElement(Button, { tone: 'danger' }, 'Delete')),
    /Button tone must be one of/u,
  );
  assert.throws(
    () => renderToString(React.createElement(Button, { size: 'medium' }, 'Save')),
    /Button size must be one of/u,
  );

  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  for (const variant of variants) {
    for (const tone of tones) {
      assert.match(css, new RegExp(`\\.muxui-button\\[data-variant='${variant}'\\]\\[data-tone='${tone}'\\]`, 'u'));
    }
  }
  for (const size of sizes) assert.match(css, new RegExp(`\\.muxui-button\\[data-size='${size}'\\]`, 'u'));
  assert.match(css, /\.muxui-r1-button\s*\{[^}]*--muxui-button-background:/u);
  const destructivePrimaryRule = css.match(/\.muxui-button\[data-variant='primary'\]\[data-tone='destructive'\]\s*\{[^}]*\}/u)?.[0] ?? '';
  assert.ok(destructivePrimaryRule);
  assert.doesNotMatch(destructivePrimaryRule, /\bblack\b/u);
  assert.match(destructivePrimaryRule, /--muxui-button-foreground:\s*var\(--muxui-semantic-surface-canvas\)/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\]\s+\.muxui-button\[data-variant='primary'\]\[data-tone='default'\]\[data-pressed\]/u);
  assert.match(css, /\.muxui-button\[data-size='lg'\][\s\S]*padding-inline:\s*calc\(var\(--muxui-semantic-control-padding-inline\)\s*\+\s*var\(--muxui-semantic-layout-tight-inset\)\)/u);
});

test('Button generator guard binds the canonical finite API contract', async () => {
  const source = await readFile(resolve(import.meta.dirname, '../src/generate.mjs'), 'utf8');
  assert.match(source, /const expectedButtonProps = \['disabled', 'pending', 'variant', 'tone', 'size'\];/u);
  assert.match(source, /const expectedButtonDefaults = \{[\s\S]*variant: 'primary',[\s\S]*tone: 'default',[\s\S]*size: 'md',[\s\S]*\};/u);
  assert.match(source, /const expectedButtonFiniteApi = \{[\s\S]*variant: \['primary', 'secondary', 'ghost'\],[\s\S]*tone: \['default', 'destructive'\],[\s\S]*size: \['sm', 'md', 'lg'\],[\s\S]*\};/u);
  const result = spawnSync(process.execPath, ['src/generate.mjs', '--check'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  assert.equal(result.status, 0, result.stderr);
});

test('MuxUI styles bind donor states and public theme hooks', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');

  assert.match(css, /\.muxui-button[\s\S]*border: 1px solid transparent;[\s\S]*font-size: var\(--muxui-semantic-typography-body-size\)/u);
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

  assert.match(css, /\.muxui-dialog-modal\[data-entering\] \.muxui-dialog[\s\S]*animation-name: muxui-overlay-enter/u);
  assert.match(css, /\.muxui-popover-positioner\[data-exiting\] \.muxui-popover[\s\S]*animation-name: muxui-overlay-exit/u);
  assert.match(css, /\.muxui-tooltip\[data-entering\][\s\S]*animation-name: muxui-overlay-enter/u);
  assert.match(css, /\.muxui-toast\[data-exiting\][\s\S]*animation-name: muxui-overlay-exit/u);
  assert.match(css, /\.muxui-dialog-backdrop\s*\{[\s\S]*position: fixed;[\s\S]*inset: 0;/u);
  assert.match(css, /\.muxui-dialog-content\s*\{[\s\S]*font-weight: var\(--muxui-semantic-typography-body-weight\)/u);
  assert.match(css, /\.muxui-field-description\s*\{[\s\S]*color: var\(--muxui-semantic-content-default\)/u);
  assert.match(css, /\.muxui-button\[data-pending\] \.muxui-button-content\s*\{[^}]*opacity:\s*0;/u);
  assert.match(css, /\.muxui-button\[data-pending\]::after[\s\S]*content: none;/u);
  assert.match(css, /\.muxui-progress-bar\[data-indeterminate\] \.muxui-progress-bar-fill[\s\S]*margin-inline-start: 30%;/u);
  assert.doesNotMatch(css, /muxui-control-spin|muxui-progress-indeterminate|animation:[^;]*infinite/u);

  assert.match(css, /--muxui-component-button-background: #025768;/u);
  assert.match(css, /--muxui-component-button-foreground: #e6f0f0;/u);
  assert.match(css, /--muxui-component-button-min-height: 36px;/u);
  assert.match(css, /--muxui-component-button-radius: 10px;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-component-button-background: #539198;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-component-button-foreground: #012334;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-field-background: #11100f;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-overlay-background: #11100f;/u);
  assert.match(css, /--muxui-semantic-selection-track: #025768;/u);
  assert.match(css, /--muxui-semantic-content-link: #02485b;/u);
  assert.match(css, /--muxui-semantic-feedback-invalid: #cc3330;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-content-link: #a4c7c9;/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\][\s\S]*--muxui-semantic-feedback-invalid: #e59796;/u);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*--muxui-button-background: ButtonFace !important;/u);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.muxui-file-trigger \{[^}]*background: ButtonFace;[^}]*color: ButtonText;/u);

  assert.doesNotMatch(css, /var\(--muxui-reference-/u);
  assert.doesNotMatch(css, /var\(--muxui-private-/u);
  assert.doesNotMatch(css, /(?:\.tale-|--color-60|--radius-m|--space-xs)/u);
});
