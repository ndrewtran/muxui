import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { mergeDerivedApis } from '@muxui/schema';
import { Button } from '../src/button.ts';
import * as generated from '../generated/index.mjs';
import { R1ButtonFixture } from '../src/button-fixture.mjs';
import { createDom } from './support/dom.mjs';
import { familyDeclarations, joinedDeclarations } from './support/declarations.mjs';

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
  assert.match(await readFile(resolve(import.meta.dirname, '../generated/overlays.js'), 'utf8'), /muxui-file-trigger/u);
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
  // Only the exact strings pass: values that coerce to an allowed key do not.
  const coercing = (value) => [[value], new String(value), { toString: () => value }];
  for (const variant of coercing('primary')) {
    assert.throws(() => renderToString(React.createElement(Button, { variant }, 'Save')), /Button variant must be one of/u);
  }
  for (const size of coercing('md')) {
    assert.throws(() => renderToString(React.createElement(Button, { size }, 'Save')), /Button size must be one of/u);
  }

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

/** A component's web.react API as the catalog compiles it: authored, or derived from source (Decision 0031). */
async function catalogApi(slug) {
  const artifact = JSON.parse(await readFile(resolve(import.meta.dirname, `../../../catalog/components/${slug}/artifact.json`), 'utf8'));
  const derived = await readFile(resolve(import.meta.dirname, `../api/${slug}.json`), 'utf8').then(JSON.parse, () => undefined);
  return (derived === undefined ? artifact : mergeDerivedApis(artifact, { 'web.react': derived })).bindings['web.react'].api;
}

test('Button generator guard binds the canonical finite API contract', async () => {
  const api = await catalogApi('button');
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
  // Dormant while no guarded component has a pending default; kept so one is observed if it returns.
  pending: '[data-pending], [aria-busy="true"]',
  indeterminate: '[data-indeterminate], [aria-checked="mixed"]',
  selected: '[aria-pressed="true"], [data-selected]',
  defaultSelected: '[aria-pressed="true"], [data-selected]',
  defaultChecked: '[checked], [data-selected]',
  // Menu.Root marks itself open.
  defaultOpen: '[data-open]',
  // ButtonGroup marks itself attached.
  attached: '[data-attached]',
};
// A progress circle's range shows as the ARIA values of its bar: the value is absent while it is indeterminate.
const ariaNumber = (doc, attribute) => {
  const text = doc.querySelector(`[${attribute}]`)?.getAttribute(attribute);
  return text === undefined ? null : Number(text);
};
// Card names its variant and padding in the class modifiers of its surface, which a part's scope selects and the root's markup holds.
const cardLook = (container, values) => {
  const card = container.matches?.('.muxui-card') ? container : container.querySelector('.muxui-card');
  return card === null ? undefined : values.find((value) => card.classList.contains(`muxui-card--${value}`));
};
const markupValues = {
  // A progress circle names a size other than medium in a class modifier; every other family marks its size as data.
  size: (doc) => {
    const circle = doc.querySelector('.muxui-progress-circle');
    if (circle !== null) return ['sm', 'lg'].find((size) => circle.classList.contains(`muxui-progress-circle--${size}`)) ?? 'md';
    return doc.querySelector('[data-size]')?.getAttribute('data-size');
  },
  // ButtonGroup's resolved role, which is presentation unless it carries a name.
  role: (doc) => doc.querySelector('[role]')?.getAttribute('role'),
  value: (doc) => ariaNumber(doc, 'aria-valuenow'),
  minValue: (doc) => ariaNumber(doc, 'aria-valuemin'),
  maxValue: (doc) => ariaNumber(doc, 'aria-valuemax'),
  variant: (doc) => cardLook(doc, ['elevated', 'outlined', 'filled']) ?? doc.querySelector('[data-variant]')?.getAttribute('data-variant'),
  padding: (doc) => cardLook(doc, ['sm', 'md', 'lg']),
  orientation: (doc) => doc.querySelector('[data-orientation]')?.getAttribute('data-orientation'),
  // InputTags lists its tags as rows, so its starting tags are the labels in them.
  tagPlacement: (doc) => (doc.querySelector('.muxui-input-tags--below') === null ? 'inline' : 'below'),
  // A text field shows its starting text as its input's value; a composer, in its textarea.
  defaultValue: (doc) => {
    if (doc.querySelector('.muxui-input-tags') !== null) return [...doc.querySelectorAll('.muxui-input-tags__tag')].map((tag) => tag.textContent);
    const input = doc.querySelector('input');
    return input === null ? doc.querySelector('textarea')?.textContent : input.getAttribute('value');
  },
  // A list marks each option or row with the mode it selects by, and none when it selects nothing; a toggle group is a radiogroup or a toolbar.
  selectionMode: (doc) => {
    const items = [...doc.querySelectorAll('[role="option"], [role="row"]')];
    if (items.length === 0) return ({ radiogroup: 'single', toolbar: 'multiple' })[doc.querySelector('[role="radiogroup"], [role="toolbar"]')?.getAttribute('role')];
    const marked = items.find((item) => item.hasAttribute('data-selection-mode'));
    if (marked !== undefined) return marked.getAttribute('data-selection-mode');
    // A tag group marks no mode on its tags: its grid is multiselectable for multiple, and for single each tag carries a selected state.
    if (doc.querySelector('[aria-multiselectable="true"]') !== null) return 'multiple';
    return items.some((item) => item.hasAttribute('aria-selected')) ? 'single' : 'none';
  },
  layout: (doc) => doc.querySelector('[data-layout]')?.getAttribute('data-layout'),
  // A tag carries its colour, which the group's default sets for a tag that names none.
  color: (doc) => doc.querySelector('[data-color]')?.getAttribute('data-color'),
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
  // A calendar with no date defers its markup to the client, so these carry one, and the server renders the calendar itself.
  Calendar: () => h(generated.Calendar, { label: 'Date', defaultValue: '2025-01-15' }),
  RangeCalendar: () => h(generated.RangeCalendar, { label: 'Range', defaultValue: { start: '2025-01-10', end: '2025-01-12' } }),
  Tabs: () => h(generated.Tabs, { 'aria-label': 'Sections', items: [{ id: 'one', label: 'One', panel: 'One' }, { id: 'two', label: 'Two', panel: 'Two' }] }),
  ListBox: () => h(generated.ListBox, { 'aria-label': 'Options', items: ['One', 'Two'] }),
  // Menu's block is Menu.Root's, so the menu is the triggered composition, closed.
  Menu: () => menuRoot(),
  GridList: () => h(generated.GridList, { 'aria-label': 'Cards', items: ['One', 'Two'] }),
  Virtualizer: () => h(generated.Virtualizer, { 'aria-label': 'Results', items: ['One', 'Two'] }),
  // Select's block is the callable's, which is also Select.Root's.
  Select: () => selectField(),
  ComboBox: () => h(generated.ComboBox, { label: 'City', items: ['Melbourne'] }),
  PromptComposer: () => composer(),
  ColorSwatchPicker: () => h(generated.ColorSwatchPicker, { 'aria-label': 'Colors', items: ['#ff0000', '#00ff00'] }),
  TagGroup: () => h(generated.TagGroup, { label: 'Tags', items: ['One', 'Two'] }),
  Table: () => h(generated.Table, { 'aria-label': 'People', columns: [{ id: 'name', label: 'Name', isRowHeader: true }], rows: [{ id: 'ada', name: 'Ada' }] }),
  Tree: () => treeOf(),
  ButtonGroup: () => h(generated.ButtonGroup, { 'aria-label': 'Actions' }, h(generated.Button, null, 'One')),
  ColorModeToggle: () => h(generated.ColorModeToggle, { 'aria-label': 'Theme' }),
  Card: () => h(generated.Card.Root, null, h(generated.Card.Body, null, 'Content')),
  ProgressCircle: () => h(generated.ProgressCircle.Root, { 'aria-label': 'Progress' }),
  InputTags: () => h(generated.InputTags.Root, { 'aria-label': 'Tags' }),
  PaymentInput: () => h(generated.PaymentInput.Root, { 'aria-label': 'Card number' }, h(generated.PaymentInput.Group, null, h(generated.PaymentInput.Input), h(generated.PaymentInput.CardIcon))),
  CheckboxField: () => h(generated.CheckboxField.Root, null, h(generated.CheckboxField.Button, null, h(generated.CheckboxField.Indicator), 'Accept')),
  SwitchField: () => h(generated.SwitchField.Root, null, h(generated.SwitchField.Button, null, h(generated.SwitchField.Thumb), 'Updates')),
  Input: () => h(generated.Input.Root, null, h(generated.Input.Label, null, 'Name'), h(generated.Input.Input)),
  TextArea: () => h(generated.TextArea.Root, null, h(generated.TextArea.Label, null, 'Notes'), h(generated.TextArea.TextArea)),
  // RadioField takes its size from the group around it, so its block states no defaults.
  RadioField: () => h(generated.RadioGroup, { 'aria-label': 'Plan' }, h(generated.RadioField.Root, { value: 'monthly' }, h(generated.RadioField.Button, null, h(generated.RadioField.Indicator, null, h(generated.RadioField.Dot)), 'Monthly'))),
};
// The declarations a family's root block is read against, where the root is not the export itself: Menu's root is Menu.Root.
const rootDeclarations = { Menu: 'MenuRoot', ProgressCircle: 'ProgressCircleRoot', InputTags: 'InputTagsRoot', CheckboxField: 'CheckboxFieldRoot', SwitchField: 'SwitchFieldRoot', RadioField: 'RadioFieldRoot' };
// The defaults of a part (partApis) render through the compound that holds it, qualified `Family.part`. `scope` picks the
// part's own element from the markup, so the root's attributes cannot stand in for the part's.
const partRenders = {
  // Card.Button is the card as one control: its own variant and padding show in its class, and its disabled and pending flags on the button.
  'Card.button': { scope: 'button', render: () => h(generated.Card.Button, null, 'Select') },
  'ListBox.item': { scope: '[role="option"]', render: () => h(generated.ListBox, { 'aria-label': 'Options' }, h(generated.ListBox.Item, { id: 'one' }, 'One')) },
  'Menu.trigger': { scope: 'button', render: () => menuRoot() },
  'Menu.list': { scope: '[role="menu"]', render: () => h(generated.Menu.List, { 'aria-label': 'Actions', items: ['One'] }) },
  'Menu.item': { scope: '[role="menuitem"]', render: () => h(generated.Menu, { 'aria-label': 'Actions' }, h(generated.Menu.Item, { id: 'one' }, 'One')) },
  // A closed popup and a submenu render no markup of their own; their defaults are observed by what each sends React Aria.
  'Menu.popup': { render: () => menuRoot() },
  'Menu.submenu': { render: () => menuRoot() },
  'GridList.item': { scope: '[role="row"]', render: () => h(generated.GridList, { 'aria-label': 'Cards' }, h(generated.GridList.Item, { id: 'one' }, 'One')) },
  'Select.trigger': { scope: 'button', render: () => selectRoot() },
  // The popup and its options render in a portal once open, so a mounted observer reads the option, and the popup's geometry is what it sends React Aria.
  'Select.popup': { render: () => selectRoot() },
  'Select.list': { render: () => selectRoot() },
  'Select.option': { render: () => selectRoot() },
};
const treeItems = [{ id: 'parent', label: 'Parent', children: [{ id: 'child', label: 'Child' }] }];
const treeOf = (props) => h(generated.Tree, { 'aria-label': 'Files', items: treeItems, ...props });
const sectionItems = [{ id: 'one', label: 'One', panel: 'One' }, { id: 'two', label: 'Two', panel: 'Two' }];
const stackVirtualizer = (props) => h(generated.Virtualizer, { 'aria-label': 'Results', items: ['One', 'Two'], ...props });

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

/** Menu.Root with a trigger and a popup, closed unless `rootProps` opens it; `popupProps` go to the popup and `items` to its list. */
function menuRoot(rootProps = null, popupProps = null, ...items) {
  return h(generated.Menu.Root, rootProps, h(generated.Menu.Trigger, null, 'Actions'), h(generated.Menu.Popup, popupProps, h(generated.Menu.List, { 'aria-label': 'Actions' }, ...items)));
}

/** The simple Select with a label and two items, closed unless `props` open it. */
function selectField(props = null) {
  return h(generated.Select, { label: 'Fruit', items: ['One', 'Two'], ...props });
}

/** A PromptComposer, with `props` over none. */
function composer(props = null) {
  return h(generated.PromptComposer, props);
}

/** Select.Root composed from its parts: a trigger, and a popup with `popupProps` holding a list, closed unless `rootProps` opens it. */
function selectRoot(rootProps = null, popupProps = null, ...items) {
  return h(generated.Select.Root, { label: 'Fruit', ...rootProps }, h(generated.Select.Trigger, null, h(generated.Select.Value, null)), h(generated.Select.Popup, popupProps, h(generated.Select.List, null, ...items)));
}

/**
 * The first props a component hands another element while `render` runs, among those `match` accepts: the value it
 * sends React Aria, read where it is sent. A popup's geometry is invisible in markup, and jsdom does no layout, so this is
 * how a default that reaches React Aria is observed running. Every component calls React.createElement by name.
 */
async function sentUpstream(render, match) {
  const create = React.createElement;
  const found = [];
  React.createElement = (type, props, ...children) => {
    if (props !== null && typeof props === 'object' && match(props)) found.push(props);
    return create(type, props, ...children);
  };
  try {
    await render();
  } finally {
    React.createElement = create;
  }
  assert.ok(found.length > 0, 'the component sent the element the observer reads');
  return found[0];
}
const popupSent = (props) => sentUpstream(() => renderToString(menuRoot(null, props)), (sent) => 'isNonModal' in sent);
// A Select's popup takes the geometry its root sets, and its own where it sets one, so the root's value is read where the popup sends it.
const selectPopupSent = (rootProps) => sentUpstream(() => renderToString(selectRoot(rootProps)), (sent) => 'isNonModal' in sent);
const selectPlaceholder = (props) => new JSDOM(renderToString(selectField(props))).window.document.querySelector('.muxui-select-value')?.textContent;

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
  ColorModeToggle: {
    // A controlled dark mode is saved under the toggle's storage key, which is the one localStorage key that then holds it.
    storageKey: (props) => withMounted(h(generated.ColorModeToggle, { mode: 'dark', 'aria-label': 'Theme', ...props }), () => {
      const saved = [...Array(window.localStorage.length).keys()].map((index) => window.localStorage.key(index));
      return saved.find((key) => window.localStorage.getItem(key) === 'dark');
    }),
  },
  InputTags: {
    // Adding a tag the field already holds either adds a second row or does nothing. React DOM was imported before the DOM exists, so it
    // reads a changed value through its keydown path: the value is set, a keydown makes React read it, and Enter adds the tag.
    allowDuplicates: (props) => withMounted(h(generated.InputTags.Root, { 'aria-label': 'Tags', defaultValue: ['a'], ...props }), async (container) => {
      const input = container.querySelector('input');
      await act(async () => {
        input.focus();
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'a');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      });
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
      return container.querySelectorAll('[role="row"]').length > 1;
    }),
  },
  Menu: {
    // Choosing an item either closes the menu or leaves it open.
    shouldCloseOnSelect: (props) => {
      const changes = [];
      return withMounted(menuRoot({ open: true, onOpenChange: (next) => changes.push(next), ...props }, null, h(generated.Menu.Item, { id: 'one' }, 'One')), async () => {
        await act(async () => document.querySelector('[role="menuitem"]').click());
        return changes.includes(false);
      });
    },
  },
  // Each part's geometry reaches React Aria as the popup's own value, set or not, so it is read where it is sent.
  'Menu.popup': {
    offset: async (props) => (await popupSent(props)).offset,
    crossOffset: async (props) => (await popupSent(props)).crossOffset,
    shouldFlip: async (props) => (await popupSent(props)).shouldFlip,
    containerPadding: async (props) => (await popupSent(props)).containerPadding,
    // The popup is modal unless React Aria is told it is not.
    modal: async (props) => !(await popupSent(props)).isNonModal,
  },
  'Menu.submenu': {
    // A submenu opens after the pointer rests on its item for this long, which React Aria's SubmenuTrigger is given.
    delay: async (props) => (await sentUpstream(
      () => withMounted(menuRoot({ open: true }, null, h(generated.Menu.Submenu, props, h(generated.Menu.Item, { id: 'more' }, 'More'), h(generated.Menu.Popup, null, h(generated.Menu.List, { 'aria-label': 'More' }, h(generated.Menu.Item, { id: 'inner' }, 'Inner'))))), () => {}),
      (sent) => 'delay' in sent && Array.isArray(sent.children),
    )).delay,
  },
  Virtualizer: {
    // The stack viewport's block size, from the server markup.
    height: (props) => Number.parseFloat(new JSDOM(renderToString(stackVirtualizer(props))).window.document.querySelector('.muxui-virtualizer').style.blockSize),
    // The scroll extent is the row count (two here) times the row height.
    itemHeight: (props) => Number.parseFloat(new JSDOM(renderToString(stackVirtualizer(props))).window.document.querySelector('[role="presentation"]').style.height) / 2,
    // At the top of 100 rows in a 240 px viewport of 40 px rows, 6 rows are visible and the overscan rows below them are mounted too.
    overscan: (props) => withMeasuredViewport(h(generated.Virtualizer, { 'aria-label': 'Results', items: Array.from({ length: 100 }, (_, index) => `Item ${index}`), height: 240, itemHeight: 40, ...props }),
      (container) => container.querySelectorAll('[role="option"]').length - 6),
    // A disabled Virtualizer disables its rows. The server markup mounts none, so a mounted row carries the flag.
    disabled: (props) => withMeasuredViewport(stackVirtualizer(props), (container) => container.querySelector('[role="option"]')?.getAttribute('aria-disabled') === 'true'),
  },
  // The text the default trigger shows with nothing selected, and the geometry the popup falls back to, which reaches React Aria only through the popup.
  Select: {
    placeholder: (props) => selectPlaceholder(props),
    placement: async (props) => (await selectPopupSent(props)).placement.replace(' ', '-'),
    offset: async (props) => (await selectPopupSent(props)).offset,
    crossOffset: async (props) => (await selectPopupSent(props)).crossOffset,
    shouldFlip: async (props) => (await selectPopupSent(props)).shouldFlip,
    containerPadding: async (props) => (await selectPopupSent(props)).containerPadding,
    // The popup is modal unless React Aria is told it is not.
    modal: async (props) => !(await selectPopupSent(props)).isNonModal,
  },
  // An option's disabled flag shows on the option, which renders in the open popup's portal, so it is read from a mounted Select.
  'Select.option': {
    disabled: (props) => withMounted(selectRoot({ defaultOpen: true }, null, h(generated.Select.Item, { id: 'one', ...props }, 'One')), () => {
      const option = document.querySelector('[role="option"]');
      return option.hasAttribute('data-disabled') || option.getAttribute('aria-disabled') === 'true';
    }),
  },
  // The textarea's accessible name, when inputProps gives none, and whether the attach picker admits several files, which the hidden file input shows.
  PromptComposer: {
    inputLabel: (props) => new JSDOM(renderToString(composer(props))).window.document.querySelector('textarea').getAttribute('aria-label'),
    multiple: (props) => new JSDOM(renderToString(composer({ onFilesSelected: () => {}, ...props }))).window.document.querySelector('input[type="file"]').hasAttribute('multiple'),
  },
  Tree: {
    // A press on a parent row either expands it (row) or leaves expansion to the chevron (chevron).
    expansionTrigger: (props) => withMounted(treeOf(props), async (container) => {
      await act(async () => container.querySelector('[role="row"]').click());
      return container.querySelector('[role="row"]').getAttribute('aria-expanded') === 'true' ? 'row' : 'chevron';
    }),
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

// jsdom has no layout, so a Virtualizer mounts no rows in it. This gives the viewport a box (as tall as its block size, 600 wide) and
// every row 40 px, which is what the layout reads to decide which rows to mount.
async function withMeasuredViewport(element, run) {
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const prototype = env.dom.window.HTMLElement.prototype;
  const blockSize = (node) => Number.parseFloat(node.style.blockSize || node.style.height || '') || 0;
  Object.defineProperty(prototype, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(prototype, 'clientHeight', { configurable: true, get() { return this.classList.contains('muxui-virtualizer') ? blockSize(this) : 40; } });
  class MeasuredObserver {
    constructor(callback) { this.callback = callback; }
    observe(node) { queueMicrotask(() => this.callback([{ target: node, contentRect: { width: 600, height: blockSize(node) } }])); }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MeasuredObserver;
  env.dom.window.ResizeObserver = MeasuredObserver;
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(element));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    return await run(document.querySelector('#root'));
  } finally {
    await act(async () => root.unmount());
    env.restore();
  }
}

const kebab = (name) => name.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();

/** Catalog defaults the server-rendered markup contradicts. A `scope` limits the search to one part's element. */
function defaultMismatches(markup, defaults, scope) {
  const { document } = new JSDOM(markup).window;
  const container = scope === undefined ? document : document.querySelector(scope);
  if (container === null) return [`scope ${scope} is not rendered`];
  const present = (selector) => (container === document ? document.querySelector(selector) !== null : container.matches(selector) || container.querySelector(selector) !== null);
  const mismatches = [];
  for (const [key, expected] of Object.entries(defaults)) {
    const observed = key in markupFlags ? present(markupFlags[key]) : markupValues[key]?.(container);
    // A default may be an array (InputTags' starting tags), which no identity comparison can match.
    if ((key in markupFlags || key in markupValues) && !isDeepStrictEqual(observed, expected)) mismatches.push(`${key}: catalog ${JSON.stringify(expected)}, rendered ${JSON.stringify(observed)}`);
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
  const surface = familyDeclarations(types, name);
  return props.filter((prop) => !new RegExp(`(?:\\b|['"])${prop}['"]?\\??\\s*:`, 'u').test(surface));
}

/**
 * Everything a part's block gets wrong against the renderer, checked as the root's is: its defaults in its own element,
 * its behaviour-only defaults, a default no observer covers, and a prop its declarations do not list.
 */
async function partProblems(types, family, part, block) {
  const qualified = `${family}.${part}`;
  const render = partRenders[qualified];
  const rendered = render === undefined
    ? (Object.keys(block.defaults).length === 0 ? [] : [`${qualified} has no render`])
    : defaultMismatches(renderToString(render.render()), block.defaults, render.scope);
  return [
    ...rendered,
    ...await behaviourMismatches(qualified, block.defaults),
    ...unobservedDefaults(qualified, block.defaults).map((key) => `${key}: no observer`),
    ...undeclaredProps(types, `${family}${block.member}`, block.props).map((prop) => `${prop}: not declared`),
  ];
}

test('catalog defaults and props agree with the renderer for every generator-guarded component', async () => {
  // A family's types sit in the index or in the declarations of the module that owns it, so every shipped declaration is read.
  const types = joinedDeclarations();
  const apis = {};
  for (const [name, render] of Object.entries(minimalRenders)) {
    const api = await catalogApi(kebab(name));
    apis[name] = api;
    const markup = renderToString(render());
    assert.deepEqual(defaultMismatches(markup, api.defaults), [], `${name} renders the catalog defaults`);
    assert.deepEqual(await behaviourMismatches(name, api.defaults), [], `${name} behaves as the catalog defaults say`);
    assert.deepEqual(unobservedDefaults(name, api.defaults), [], `${name} defaults each have a markup or behaviour observer`);
    assert.deepEqual(undeclaredProps(types, rootDeclarations[name] ?? name, api.props), [], `${name} generated declarations list the catalog props`);
    // Each part that owns props is observed on its own, as the root is.
    for (const [part, block] of Object.entries(api.partApis ?? {})) {
      assert.deepEqual(await partProblems(types, name, part, block), [], `${name}.${part} agrees with the renderer`);
    }
    if ('size' in api.defaults) assert.equal(markupValues.size(new JSDOM(markup).window.document), api.defaults.size, `${name} exposes its size default`);
  }
  // Catalog drift is caught: a different default or an undeclared prop fails.
  const toggle = apis.ToggleButton;
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ToggleButton()), { ...toggle.defaults, size: 'lg' }), ['size: catalog "lg", rendered "md"']);
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ToggleButton()), { ...toggle.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(undeclaredProps(types, 'ToggleButton', [...toggle.props, 'missingProp']), ['missingProp']);
  // Observers outlive the defaults they check: a pending default, were Button to declare one, is still observed.
  assert.deepEqual(unobservedDefaults('Button', { ...apis.Button.defaults, pending: false }), []);
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Button()), { pending: true }), ['pending: catalog true, rendered false']);
  // A part's catalog block is compared with the part's element and behaviour: a changed default, an unrendered part, an
  // unobserved default, or a prop its declarations do not list fails, and a root default stays the root's.
  const item = apis.ListBox.partApis.item;
  const itemMarkup = renderToString(partRenders['ListBox.item'].render());
  const changed = (defaults) => partProblems(types, 'ListBox', 'item', { ...item, defaults: { ...item.defaults, ...defaults } });
  assert.deepEqual(await partProblems(types, 'ListBox', 'item', item), []);
  assert.deepEqual(await changed({ disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(defaultMismatches(itemMarkup, item.defaults, '[role="gone"]'), ['scope [role="gone"] is not rendered']);
  assert.deepEqual(await partProblems(types, 'ListBox', 'gone', { member: 'Gone', props: [], defaults: { disabled: false } }), ['ListBox.gone has no render']);
  assert.deepEqual(await changed({ tone: 'quiet' }), ['tone: no observer'], 'a part default with no observer is reported');
  assert.deepEqual(await partProblems(types, 'ListBox', 'item', { ...item, props: [...item.props, 'missingProp'] }), ['missingProp: not declared']);
  // A behaviour-only default of a part is observed under the part's name: the part loop runs it, and a wrong default fails.
  behaviourObservers['ListBox.item'] = { textValue: () => 'One' };
  try {
    assert.deepEqual(await changed({ textValue: 'One' }), []);
    assert.deepEqual(await changed({ textValue: 'Wrong' }), ['textValue: catalog "Wrong", behaves "One"']);
  } finally {
    delete behaviourObservers['ListBox.item'];
  }
  // Menu's block is Menu.Root's, and each of its other parts is observed on its own, by the markup it renders or by what it sends
  // React Aria, which is where a popup's geometry, a submenu's delay, and the close on select show. A catalog default the part
  // does not run fails, and each observer follows the prop that sets its value.
  const menu = apis.Menu;
  const changedMenu = (part, defaults) => partProblems(types, 'Menu', part, { ...menu.partApis[part], defaults: { ...menu.partApis[part].defaults, ...defaults } });
  for (const part of ['trigger', 'popup', 'list', 'item', 'submenu', 'section']) assert.deepEqual(await partProblems(types, 'Menu', part, menu.partApis[part]), [], `Menu.${part}`);
  assert.deepEqual(Object.keys(menu.partApis.popup.defaults), ['offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'modal']);
  assert.deepEqual(await changedMenu('popup', { offset: 5 }), ['offset: catalog 5, behaves 4']);
  assert.deepEqual(await changedMenu('popup', { crossOffset: 1 }), ['crossOffset: catalog 1, behaves 0']);
  assert.deepEqual(await changedMenu('popup', { shouldFlip: false }), ['shouldFlip: catalog false, behaves true']);
  assert.deepEqual(await changedMenu('popup', { containerPadding: 13 }), ['containerPadding: catalog 13, behaves 12']);
  assert.deepEqual(await changedMenu('popup', { modal: false }), ['modal: catalog false, behaves true']);
  assert.deepEqual(await changedMenu('submenu', { delay: 250 }), ['delay: catalog 250, behaves 200']);
  assert.deepEqual(await changedMenu('trigger', { disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await changedMenu('list', { disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await changedMenu('item', { disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await changedMenu('item', { tone: 'quiet' }), ['tone: no observer']);
  assert.deepEqual(await behaviourMismatches('Menu', { ...menu.defaults, shouldCloseOnSelect: false }), ['shouldCloseOnSelect: catalog false, behaves true']);
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Menu()), { ...menu.defaults, defaultOpen: true }), ['defaultOpen: catalog true, rendered false']);
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Menu()), { ...menu.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await partProblems(types, 'Menu', 'popup', { ...menu.partApis.popup, props: [...menu.partApis.popup.props, 'missingProp'] }), ['missingProp: not declared']);
  // Select's block is the callable's, which is Select.Root's too. Its placeholder shows in the default trigger, its geometry and modal
  // setting reach React Aria only through the popup, and the trigger and option flags show on their own elements. A catalog value the
  // renderer does not run fails, whichever of the root and its parts states it.
  const select = apis.Select;
  const changedSelect = (part, defaults) => partProblems(types, 'Select', part, { ...select.partApis[part], defaults: { ...select.partApis[part].defaults, ...defaults } });
  assert.deepEqual(Object.keys(select.partApis), ['trigger', 'popup', 'list', 'option']);
  for (const part of Object.keys(select.partApis)) assert.deepEqual(await partProblems(types, 'Select', part, select.partApis[part]), [], `Select.${part}`);
  assert.deepEqual(Object.keys(select.defaults), ['defaultOpen', 'disabled', 'size', 'readOnly', 'required', 'invalid', 'placeholder', 'placement', 'offset', 'crossOffset', 'shouldFlip', 'containerPadding', 'modal']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, placeholder: 'Pick one' }), ['placeholder: catalog "Pick one", behaves "Select an option"']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, placement: 'end-top' }), ['placement: catalog "end-top", behaves "bottom-start"']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, offset: 9 }), ['offset: catalog 9, behaves 8']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, crossOffset: 1 }), ['crossOffset: catalog 1, behaves 0']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, shouldFlip: false }), ['shouldFlip: catalog false, behaves true']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, containerPadding: 13 }), ['containerPadding: catalog 13, behaves 12']);
  assert.deepEqual(await behaviourMismatches('Select', { ...select.defaults, modal: false }), ['modal: catalog false, behaves true']);
  for (const [key, value, rendered] of [['defaultOpen', true, false], ['disabled', true, false], ['readOnly', true, false], ['required', true, false], ['invalid', true, false]]) {
    assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Select()), { ...select.defaults, [key]: value }), [`${key}: catalog ${value}, rendered ${rendered}`], key);
  }
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Select()), { ...select.defaults, size: 'lg' }), ['size: catalog "lg", rendered "md"']);
  assert.deepEqual(await changedSelect('trigger', { disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await changedSelect('option', { disabled: true }), ['disabled: catalog true, rendered false', 'disabled: catalog true, behaves false']);
  // The popup and the list follow the root's geometry and items, so neither can state a default of its own: it would have no observer.
  assert.deepEqual([select.partApis.popup.defaults, select.partApis.list.defaults], [{}, {}]);
  assert.deepEqual(await changedSelect('popup', { offset: 5 }), ['offset: no observer']);
  assert.deepEqual(await partProblems(types, 'Select', 'popup', { ...select.partApis.popup, props: [...select.partApis.popup.props, 'missingProp'] }), ['missingProp: not declared']);
  // ComboBox has no part of its own, and every default it states shows in the markup: its flags on the input and group, its size on the root.
  const combo = apis.ComboBox;
  assert.deepEqual(Object.keys(combo.defaults), ['disabled', 'size', 'readOnly', 'required', 'invalid']);
  assert.equal(combo.partApis, undefined);
  for (const key of ['disabled', 'readOnly', 'required', 'invalid']) {
    assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ComboBox()), { ...combo.defaults, [key]: true }), [`${key}: catalog true, rendered false`], key);
  }
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.ComboBox()), { ...combo.defaults, size: 'sm' }), ['size: catalog "sm", rendered "md"']);
  assert.deepEqual(undeclaredProps(types, 'ComboBox', [...combo.props, 'missingProp']), ['missingProp']);
  // PromptComposer is one form with no part of its own. Its flags show on the form and textarea, its starting text in the textarea, its
  // textarea name in the label the textarea carries, and the attach picker's multiple on the hidden file input, so each catalog value is
  // compared with what the composer renders.
  const composerApi = apis.PromptComposer;
  assert.deepEqual(Object.keys(composerApi.defaults), ['inputLabel', 'defaultValue', 'pending', 'disabled', 'multiple']);
  assert.equal(composerApi.partApis, undefined);
  assert.equal(markupValues.defaultValue(new JSDOM(renderToString(composer({ defaultValue: 'Draft' }))).window.document), 'Draft', 'the starting text shows in the textarea');
  assert.deepEqual(defaultMismatches(renderToString(composer()), { ...composerApi.defaults, defaultValue: 'Draft' }), ['defaultValue: catalog "Draft", rendered ""']);
  for (const key of ['pending', 'disabled']) {
    assert.deepEqual(defaultMismatches(renderToString(composer()), { ...composerApi.defaults, [key]: true }), [`${key}: catalog true, rendered false`], key);
  }
  assert.deepEqual(await behaviourMismatches('PromptComposer', { ...composerApi.defaults, inputLabel: 'Prompt' }), ['inputLabel: catalog "Prompt", behaves "Message"']);
  assert.deepEqual(await behaviourMismatches('PromptComposer', { ...composerApi.defaults, multiple: false }), ['multiple: catalog false, behaves true']);
  assert.deepEqual(unobservedDefaults('PromptComposer', composerApi.defaults), []);
  assert.deepEqual(undeclaredProps(types, 'PromptComposer', [...composerApi.props, 'missingProp']), ['missingProp']);
  // Tree's selection mode shows on its rows and its disabled flag on them; its expansion trigger shows in what a press on a parent row does.
  const treeApi = apis.Tree;
  assert.deepEqual(Object.keys(treeApi.defaults), ['disabled', 'selectionMode', 'expansionTrigger']);
  const treeMarkup = renderToString(minimalRenders.Tree());
  for (const mode of ['none', 'multiple']) {
    assert.deepEqual(defaultMismatches(treeMarkup, { ...treeApi.defaults, selectionMode: mode }), [`selectionMode: catalog "${mode}", rendered "single"`], mode);
  }
  assert.deepEqual(defaultMismatches(treeMarkup, { ...treeApi.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(await behaviourMismatches('Tree', { ...treeApi.defaults, expansionTrigger: 'chevron' }), ['expansionTrigger: catalog "chevron", behaves "row"']);
  assert.deepEqual(undeclaredProps(types, 'Tree', [...treeApi.props, 'missingProp']), ['missingProp']);
  // Table's selection mode shows on its rows once it is not none, and its disabled flag on the table, so a catalog value the renderer does not run fails.
  const tableApi = apis.Table;
  assert.deepEqual(Object.keys(tableApi.defaults), ['disabled', 'selectionMode']);
  const tableMarkup = renderToString(minimalRenders.Table());
  for (const mode of ['single', 'multiple']) {
    assert.deepEqual(defaultMismatches(tableMarkup, { ...tableApi.defaults, selectionMode: mode }), [`selectionMode: catalog "${mode}", rendered "none"`], mode);
    assert.equal(markupValues.selectionMode(new JSDOM(renderToString(h(generated.Table, { 'aria-label': 'People', columns: ['Name'], rows: [{ id: 'ada', Name: 'Ada' }], selectionMode: mode }))).window.document), mode, `a ${mode} table reads as ${mode}`);
  }
  assert.deepEqual(defaultMismatches(tableMarkup, { ...tableApi.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  assert.deepEqual(undeclaredProps(types, 'Table', [...tableApi.props, 'missingProp']), ['missingProp']);
  // TagGroup's variant and colour show on its tags, its disabled flag on them too, and its selection mode as the grid's multiselectable
  // state and the tags' selected state, so a catalog value the renderer does not run fails.
  const tagApi = apis.TagGroup;
  assert.deepEqual(Object.keys(tagApi.defaults), ['variant', 'color', 'selectionMode', 'disabled']);
  const tagMarkup = renderToString(minimalRenders.TagGroup());
  for (const [key, value, rendered] of [['variant', 'outline', 'soft'], ['color', 'brand', 'neutral'], ['selectionMode', 'single', 'none'], ['selectionMode', 'multiple', 'none']]) {
    assert.deepEqual(defaultMismatches(tagMarkup, { ...tagApi.defaults, [key]: value }), [`${key}: catalog "${value}", rendered "${rendered}"`], `${key} ${value}`);
  }
  assert.deepEqual(defaultMismatches(tagMarkup, { ...tagApi.defaults, disabled: true }), ['disabled: catalog true, rendered false']);
  for (const mode of ['single', 'multiple']) {
    assert.equal(markupValues.selectionMode(new JSDOM(renderToString(h(generated.TagGroup, { label: 'Tags', items: ['One'], selectionMode: mode }))).window.document), mode, `a ${mode} group reads as ${mode}`);
  }
  assert.deepEqual(undeclaredProps(types, 'TagGroup', [...tagApi.props, 'missingProp']), ['missingProp']);
  // ColorSwatchPicker's flags show as data attributes on its root, which an enclosing ColorPicker can also set, so a picker that is neither disabled nor read-only renders neither.
  const swatchMarkup = renderToString(minimalRenders.ColorSwatchPicker());
  assert.deepEqual(Object.keys(apis.ColorSwatchPicker.defaults), ['disabled', 'readOnly']);
  for (const key of ['disabled', 'readOnly']) {
    assert.deepEqual(defaultMismatches(swatchMarkup, { ...apis.ColorSwatchPicker.defaults, [key]: true }), [`${key}: catalog true, rendered false`], key);
  }
  assert.deepEqual(undeclaredProps(types, 'ColorSwatchPicker', [...apis.ColorSwatchPicker.props, 'missingProp']), ['missingProp']);
  // The list's root defaults are observed too: a different layout, orientation, or selection mode fails.
  const listMarkup = renderToString(minimalRenders.ListBox());
  assert.deepEqual(defaultMismatches(listMarkup, { ...apis.ListBox.defaults, layout: 'grid' }), ['layout: catalog "grid", rendered "stack"']);
  assert.deepEqual(defaultMismatches(listMarkup, { ...apis.ListBox.defaults, orientation: 'horizontal' }), ['orientation: catalog "horizontal", rendered "vertical"']);
  assert.deepEqual(defaultMismatches(listMarkup, { ...apis.ListBox.defaults, selectionMode: 'multiple' }), ['selectionMode: catalog "multiple", rendered "single"']);
  assert.deepEqual(defaultMismatches(listMarkup, { ...apis.ListBox.defaults, selectionMode: 'none' }), ['selectionMode: catalog "none", rendered "single"']);
  // GridList's root defaults are observed as the list's are, and its Item part as the part is: a different default fails.
  const gridMarkup = renderToString(minimalRenders.GridList());
  assert.deepEqual(defaultMismatches(gridMarkup, { ...apis.GridList.defaults, layout: 'grid' }), ['layout: catalog "grid", rendered "stack"']);
  assert.deepEqual(defaultMismatches(gridMarkup, { ...apis.GridList.defaults, orientation: 'horizontal' }), ['orientation: catalog "horizontal", rendered "vertical"']);
  assert.deepEqual(defaultMismatches(gridMarkup, { ...apis.GridList.defaults, selectionMode: 'multiple' }), ['selectionMode: catalog "multiple", rendered "single"']);
  assert.deepEqual(defaultMismatches(gridMarkup, { ...apis.GridList.defaults, selectionMode: 'none' }), ['selectionMode: catalog "none", rendered "single"']);
  const gridItem = apis.GridList.partApis.item;
  assert.deepEqual(await partProblems(types, 'GridList', 'item', gridItem), []);
  assert.deepEqual(await partProblems(types, 'GridList', 'item', { ...gridItem, defaults: { disabled: true } }), ['disabled: catalog true, rendered false']);
  // Virtualizer's defaults are observed by what the viewport does: its block size, its scroll extent, and the rows it mounts.
  const virtualizer = apis.Virtualizer.defaults;
  assert.deepEqual(await behaviourMismatches('Virtualizer', virtualizer), []);
  for (const [prop, wrong] of [['height', 241], ['itemHeight', 41], ['overscan', 3]]) {
    assert.deepEqual(await behaviourMismatches('Virtualizer', { ...virtualizer, [prop]: wrong }), [`${prop}: catalog ${wrong}, behaves ${virtualizer[prop]}`], `a different ${prop} default fails`);
  }
  assert.deepEqual(defaultMismatches(renderToString(minimalRenders.Virtualizer()), { ...virtualizer, layout: 'grid' }), ['layout: catalog "grid", rendered "stack"']);
  // Selection mode follows the role each mode renders: radiogroup for single, toolbar for multiple.
  const multiple = renderToString(h(generated.ToggleButtonGroup, { 'aria-label': 'Format', selectionMode: 'multiple' }, h(generated.ToggleButton, { id: 'a' }, 'A')));
  assert.equal(markupValues.selectionMode(new JSDOM(multiple).window.document), 'multiple');
  assert.deepEqual(defaultMismatches(multiple, { ...apis.ToggleButtonGroup.defaults, selectionMode: 'multiple' }), []);
  assert.equal(defaultMismatches(renderToString(minimalRenders.ToggleButtonGroup()), { selectionMode: 'multiple' }).length, 1);
});

test('a catalog prop only an unrelated declaration names is undeclared', () => {
  const types = [
    'export type FooProps = Omit<FooOwnProps, never> & { id?: string };',
    '/** onChange: described here, not declared. */',
    'export type FooOwnProps = { a?: string };',
    'export type OtherProps = { onChange?: () => void; b?: string };',
    'export declare const Foo: ForwardRefExoticComponent<FooProps & RefAttributes<HTMLDivElement>>;',
  ].join('\n');
  assert.deepEqual(undeclaredProps(types, 'Foo', ['a', 'id', 'onChange', 'b']), ['onChange', 'b']);
});

test('catalog defaults only behaviour shows are compared with what the renderer does', async () => {
  const states = {
    showTextWhileLoading: [false, true], disallowEmptySelection: [false, true], keyboardActivation: ['automatic', 'manual'],
    shouldCloseOnSelect: [false, true], offset: [4, 9], crossOffset: [0, 3], shouldFlip: [false, true], containerPadding: [12, 7], modal: [false, true], delay: [200, 33],
    height: [240, 300], itemHeight: [40, 32], overscan: [0, 2, 3],
    placement: ['bottom-start', 'end-top'], placeholder: ['Select an option', 'Pick one'], disabled: [false, true],
    inputLabel: ['Message', 'Prompt'], multiple: [true, false], expansionTrigger: ['row', 'chevron'], storageKey: ['muxui-color-mode', 'theme'], allowDuplicates: [false, true],
  };
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

// The simple supplemental families state defaults the renderer runs, each seen in the markup or in what the mounted component does.
// For each, a catalog value the renderer does not run fails with that default's name, and the families are checked default by default:
// a default added to a block without a value here, or an observer that stops reading one, fails this test.
test('every default a simple supplemental family states is compared with what the renderer runs', async () => {
  const different = {
    ButtonGroup: { orientation: 'vertical', attached: true, disabled: true, role: 'region' },
    ColorModeToggle: { disabled: true, storageKey: 'theme' },
    ProgressCircle: { value: 40, minValue: 10, maxValue: 90, size: 'lg' },
    InputTags: { tagPlacement: 'below', size: 'lg', defaultValue: ['x'], allowDuplicates: true, disabled: true, invalid: true, required: true },
    PaymentInput: { defaultValue: '4111', size: 'lg' },
    Input: { size: 'lg' },
    TextArea: { size: 'lg' },
    CheckboxField: { size: 'lg' },
    SwitchField: { size: 'lg' },
    // RadioField states none: its size follows the enclosing RadioGroup.
    RadioField: {},
  };
  for (const [name, values] of Object.entries(different)) {
    const api = await catalogApi(kebab(name));
    assert.deepEqual(Object.keys(values).sort(), Object.keys(api.defaults).sort(), `${name} is checked for each default it states`);
    const markup = renderToString(minimalRenders[name]());
    for (const [key, value] of Object.entries(values)) {
      const defaults = { ...api.defaults, [key]: value };
      const mismatches = key in (behaviourObservers[name] ?? {}) ? await behaviourMismatches(name, defaults) : defaultMismatches(markup, defaults);
      assert.equal(mismatches.length, 1, `${name}.${key}: ${mismatches.join('; ')}`);
      assert.ok(mismatches[0].startsWith(`${key}: catalog ${JSON.stringify(value)}, `), `${name}.${key} is the default that fails: ${mismatches[0]}`);
    }
  }
});

// The popup's own fallback is no catalog default: a Select's popup reads its modal setting from the root's context, so the observers above,
// which always supply a root, never reach it. Outside a Select there is no context, and a popup is modal unless it says otherwise.
test('a Select.Popup with no Select around it is modal unless it says otherwise', async () => {
  const isNonModal = async (props) => (await sentUpstream(() => renderToString(h(generated.Select.Popup, props, h(generated.Select.List, { items: ['One'] }))), (sent) => 'isNonModal' in sent)).isNonModal;
  assert.equal(await isNonModal(null), false);
  assert.equal(await isNonModal({ modal: true }), false);
  assert.equal(await isNonModal({ modal: false }), true);
  // Inside a Select that says it is not modal, the popup follows the root, so the fallback is for the missing context only.
  assert.equal((await selectPopupSent({ modal: false })).isNonModal, true);
});

// An option's disabled flag is its own or, when it sets none, its Select's; a Select that turns disabled disables its options with it.
// The popup closes then, so the flag is read where the option sends it to React Aria, not from the markup.
test('a Select.Item takes its Select\'s disabled state and follows it across a rerender', async () => {
  const tree = (rootProps, itemProps) => selectRoot(rootProps, null, h(generated.Select.Item, { id: 'one', ...itemProps }, 'One'));
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const root = createRoot(document.querySelector('#root'));
  const sentDisabled = async (element) => (await sentUpstream(() => act(async () => root.render(element)), (sent) => sent.id === 'one' && 'isDisabled' in sent)).isDisabled;
  try {
    assert.equal(await sentDisabled(tree(null, { disabled: false })), false);
    assert.equal(await sentDisabled(tree({ disabled: true }, { disabled: false })), true);
    assert.equal(await sentDisabled(tree(null, { disabled: false })), false);
    // The option's own flag disables it in an enabled Select.
    assert.equal(await sentDisabled(tree(null, { disabled: true })), true);
  } finally {
    await act(async () => root.unmount());
    env.restore();
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
  assert.match(css, /\.muxui-tooltip\s*\{[\s\S]*opacity var\(--muxui-semantic-motion-reveal-transition-duration\) var\(--muxui-semantic-motion-reveal-transition-easing\)/u);
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
