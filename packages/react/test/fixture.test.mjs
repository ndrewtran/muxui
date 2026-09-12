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

test('Button owns MuxUI selectors and required token bindings', async () => {
  const css = await readFile(resolve(import.meta.dirname, '../generated/styles.css'), 'utf8');
  assert.match(css, /\.muxui-r1-button/);
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

test('Button exposes variants and compatibility tone aliases with stable root hooks', async () => {
  const variants = ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'];
  const tones = ['default', 'destructive'];
  const sizes = ['sm', 'md', 'lg'];
  const defaults = renderToString(React.createElement(Button, null, 'Save'));
  assert.match(defaults, /data-variant="primary"/u);
  assert.match(defaults, /data-tone="default"/u);
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
      assert.match(markup, /data-tone="default"/u);
      assert.match(markup, new RegExp(`data-size="${size}"`, 'u'));
      assert.match(markup, /class="muxui-button consumer-button"/u);
      assert.match(markup, /style="min-width:5rem"/u);
      assert.match(markup, /data-consumer-hook="preserved"/u);
    }
  }

  const legacyMarkup = renderToString(React.createElement(Button, { variant: 'secondary', tone: 'destructive' }, 'Delete'));
  assert.match(legacyMarkup, /data-variant="secondary"/u);
  assert.match(legacyMarkup, /data-tone="destructive"/u);

  assert.throws(
    () => renderToString(React.createElement(Button, { variant: 'experimental' }, 'Save')),
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
  for (const variant of variants) assert.match(css, new RegExp(`\\.muxui-button\\[data-variant='${variant}'\\]\\[data-tone='default'\\]`, 'u'));
  for (const tone of tones) for (const variant of ['primary', 'secondary', 'ghost']) {
    assert.match(css, new RegExp(`\\.muxui-button\\[data-variant='${variant}'\\]\\[data-tone='${tone}'\\]`, 'u'));
  }
  for (const size of sizes) assert.match(css, new RegExp(`\\.muxui-button\\[data-size='${size}'\\]`, 'u'));
  assert.match(css, /\.muxui-r1-button\s*\{[^}]*--muxui-button-background:/u);
  const destructivePrimaryRule = css.match(/\.muxui-button\[data-variant='danger'\]\[data-tone='default'\]\s*\{[^}]*\}/u)?.[0] ?? '';
  assert.ok(destructivePrimaryRule);
  assert.doesNotMatch(destructivePrimaryRule, /\bblack\b/u);
  assert.match(destructivePrimaryRule, /--muxui-button-foreground:\s*var\(--muxui-semantic-color-error-60-fg\)/u);
  assert.match(css, /\[data-muxui-color-scheme='dark'\]\s+\.muxui-button\[data-variant='primary'\]\[data-tone='default'\]\[data-pressed\]/u);
  assert.match(css, /\.muxui-button\[data-size='lg'\][\s\S]*font-size:\s*var\(--muxui-semantic-typography-label-m-font-size\)[\s\S]*padding-inline:\s*var\(--muxui-semantic-layout-inset-large\)/u);

  const pendingWithText = renderToString(React.createElement(Button, { pending: true, showTextWhileLoading: true }, 'Saving'));
  assert.match(pendingWithText, /muxui-button-content--with-spinner/u);
  assert.match(pendingWithText, /muxui-button-spinner--inline/u);
  assert.doesNotMatch(pendingWithText, /visibility:hidden/u);
});

test('Button generator guard binds the canonical finite API contract', async () => {
  const source = await readFile(resolve(import.meta.dirname, '../src/generate.mjs'), 'utf8');
  assert.match(source, /const expectedButtonProps = \['disabled', 'pending', 'showTextWhileLoading', 'variant', 'tone', 'size'\];/u);
  assert.match(source, /const expectedButtonDefaults = \{[\s\S]*showTextWhileLoading: false,[\s\S]*variant: 'primary',[\s\S]*tone: 'default',[\s\S]*size: 'md',[\s\S]*\};/u);
  assert.match(source, /const expectedButtonFiniteApi = \{[\s\S]*variant: \['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse', 'secondary'\],[\s\S]*tone: \['default', 'destructive'\],[\s\S]*size: \['sm', 'md', 'lg'\],[\s\S]*\};/u);
  const result = spawnSync(process.execPath, ['src/generate.mjs', '--check'], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, npm_config_engine_strict: 'false' },
  });
  assert.equal(result.status, 0, result.stderr);
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

  assert.match(css, /\.muxui-dialog\[data-entering\][\s\S]*transform: translate\(-50%, calc\(-50% - 0\.5rem\)\)/u);
  assert.match(css, /\.muxui-popover\[data-entering\][\s\S]*transform: scale\(0\.97\)/u);
  assert.match(css, /\.muxui-tooltip\[data-entering\][\s\S]*transform: scale\(0\.96\)/u);
  assert.match(css, /\.muxui-toast\[data-exiting\][\s\S]*transform: translateY\(var\(--muxui-semantic-layout-group-gap\)\)/u);
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
  assert.match(css, /--muxui-component-button-min-height: var\(--muxui-semantic-control-min-height\);/u);
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
  assert.doesNotMatch(css, /(?:--color-60|--radius-m|--space-xs)/u);
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
