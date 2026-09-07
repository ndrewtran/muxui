import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureContractFor } from '../src/visual-migration-contract.mjs';
import { migrationFixtureSymbol } from '../src/visual-migration-contract.mjs';
import { renderFamily, stateArgsForBinding } from '../src/storybook-factory.mjs';
import { renderFamilyPlan } from '../visual-migration/bootstrap/r1-6-original-donor-render-plan.mjs';
import { finitePartSelectorsForOriginalFinite, lifecycleFactsForOriginalFinite } from '../visual-migration/bootstrap/r1-6-original-finite-facts.mjs';
import { createFiniteDonorEntrySource } from '../visual-migration/bootstrap/r1-6-finite-donor-entry.mjs';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import descriptor from '../../../packages/react/generated/descriptor.json' with { type: 'json' };
import finiteFixtures from '../../../catalog/react-r1-6/finite-fixtures.json' with { type: 'json' };

function component() {}
function checkIcon() {}
function minusIcon() {}

function element(type, props, ...children) {
  return { type, props: { ...(props ?? {}), children: children.length === 1 ? children[0] : children } };
}

class ListLayout {
  constructor(options) {
    this.options = options;
  }
}

function runtime() {
  const namespace = new Proxy({ ListLayout }, { get: (target, key) => target[key] ?? component });
  return {
    h: element,
    packages: new Proxy({}, { get: () => namespace }),
    ButtonPackage: namespace,
    ColorSwatchPackage: namespace,
    ToggleButtonPackage: namespace,
    RadioFieldPackage: { Radio: namespace },
    IconPackage: namespace,
    CheckIcon: checkIcon,
    MinusIcon: minusIcon,
    XIcon: component,
    SearchFieldPackage: namespace,
    FieldPackage: namespace,
    CalendarPackage: namespace,
    RangeCalendarPackage: namespace,
    propsFor: () => ({ className: 'migration-tale-root' }),
    parseFixtureDate: (value) => `date:${value}`,
    parseFixtureTime: (value) => `time:${value}`,
    renderCalendar: (calendar, model, props, range) => element(calendar, { ...props, model, range }),
    renderField: (field, model, props, kind) => element(field, { ...props, model, kind }),
    renderTreeItem: component,
    ToastHarness: component,
    textItem: (value) => value,
    colorValue: (value) => `color:${value}`,
  };
}

function plan(componentName, props = {}, state = 'idle') {
  const entry = { component: componentName, props, state };
  return renderFamilyPlan(entry, fixtureContractFor({ family: componentName }, state), runtime());
}

test('original finite donor plan retains canonical variant payloads', () => {
  assert.equal(plan('ColorSlider', { channel: 'green' }).props.channel, 'green');
  assert.equal(plan('ColorSlider', { channel: 'alpha' }).props.channel, 'alpha');
  assert.equal(plan('ColorSwatch', { color: '#0000ff' }).props.color, '#0000ff');
  assert.equal(plan('Meter', { value: 20, minValue: 0, maxValue: 100 }).props.value, 20);
  assert.equal(plan('ProgressBar', { value: null }).props.value, undefined);
  assert.equal(plan('ProgressBar', { value: null }).props.isIndeterminate, true);
  assert.equal(plan('Checkbox', { checked: true }).props.isSelected, true);
  const indeterminateCheckbox = plan('Checkbox', { indeterminate: true });
  assert.equal(indeterminateCheckbox.props.isIndeterminate, true);
  assert.equal(indeterminateCheckbox.props.children[0].props.children.props.icon, minusIcon);
  assert.equal(plan('Switch', { selected: true }).props.isSelected, true);
  assert.equal(plan('Disclosure', { expanded: true }).props.isExpanded, true);
  assert.equal(plan('DisclosureGroup', { multiple: false }).props.allowsMultipleExpanded, false);
  assert.equal(plan('DisclosureGroup', { multiple: true }).props.allowsMultipleExpanded, true);

  const breadcrumbs = plan('Breadcrumbs', {
    items: [{ id: 'home', label: 'Home', href: '#home' }, { id: 'docs', label: 'Docs', href: '#docs', current: true }],
  });
  assert.equal(breadcrumbs.props.children[1].props.children.props['aria-current'], 'page');

  const virtualizer = plan('Virtualizer', { height: 240, itemHeight: 48, overscan: 4 });
  assert.equal(virtualizer.props.children.props.className, 'tale-virtualizer');
  assert.equal(virtualizer.props.children.props.style.height, '240px');
  assert.equal(virtualizer.props.children.props.style.maxHeight, '240px');
  assert.equal(virtualizer.props.layout.options.rowSize, 48);

  const dialog = plan('Dialog', { open: true });
  assert.equal(dialog.props.isOpen, true);
  assert.equal(dialog.props.open, undefined);

  const toast = plan('Toast', { variant: 'success', duration: 3000 });
  assert.equal(toast.props.variant, 'success');
  assert.equal(toast.props.duration, 3000);

  const comboBox = plan('ComboBox', {
    value: 'Mu',
    defaultValue: 'Mux',
    selectedId: 'design',
    defaultSelectedId: 'engineering',
  });
  assert.equal(comboBox.props.inputValue, 'Mu');
  assert.equal(comboBox.props.defaultInputValue, 'Mux');
  assert.equal(comboBox.props.selectedKey, 'design');
  assert.equal(comboBox.props.defaultSelectedKey, 'engineering');
  assert.equal(comboBox.props.value, undefined);
  assert.equal(comboBox.props.defaultValue, undefined);
  assert.equal(comboBox.props.selectedId, undefined);
  assert.equal(comboBox.props.defaultSelectedId, undefined);
});

test('all collection selection axes reach the actual donor collection and Mux roots', () => {
  for (const family of ['GridList', 'ListBox', 'Table', 'ToggleButtonGroup', 'Tree']) {
    for (const selectionMode of ['single', 'multiple']) {
      for (const state of ['idle', 'selected']) {
        const props = { selectionMode, selectedIds: ['chosen'], defaultSelectedIds: ['fallback'] };
        const fixture = { ...fixtureContractFor({ family }, state), state };
        const args = stateArgsForBinding(bindingFor(family), state, family, { ...props, [migrationFixtureSymbol]: fixture });
        const mux = muxRoot(renderFamily(family, args));
        const donorTree = renderFamilyPlan({ component: family, props, state }, fixture, runtime());
        const donor = family === 'Tree' ? donorTree.props.children : donorTree;
        assert.equal(mux.props.selectionMode, selectionMode, `${family}/${state} Mux mode`);
        assert.equal(donor.props.selectionMode, selectionMode, `${family}/${state} donor mode`);
        assert.deepEqual(mux.props.selectedIds, donor.props.selectedKeys, `${family} controlled selection`);
        assert.deepEqual(mux.props.defaultSelectedIds, donor.props.defaultSelectedKeys, `${family} default selection`);
      }
    }
  }
});

test('state defaults preserve explicit false, zero, empty, and uncontrolled input', () => {
  const cases = [
    ['Switch', 'selected', { selected: false }],
    ['ToggleButton', 'selected', { defaultSelected: false }],
    ['ProgressBar', 'complete', { value: 0 }],
    ['SearchField', 'filled', { value: '' }],
    ['Disclosure', 'expanded', { expanded: false }],
    ['Tabs', 'selected', { defaultValue: 'details' }],
  ];
  for (const [family, state, props] of cases) {
    const args = stateArgsForBinding(bindingFor(family), state, family, props);
    for (const [name, value] of Object.entries(props)) assert.deepEqual(args[name], value, `${family} ${name}`);
    if (Object.hasOwn(props, 'defaultValue')) assert.equal(args.value, undefined);
    if (Object.hasOwn(props, 'defaultSelected')) assert.equal(args.selected, undefined);
  }
  assert.equal(stateArgsForBinding(bindingFor('Switch'), 'selected', 'Switch', {}).selected, true);
});

test('finite controls render indeterminate progress, filled search anatomy, and menu options at their semantic host', () => {
  const progress = plan('ProgressBar', { value: null });
  assert.equal(progress.props.isIndeterminate, true);
  assert.equal(progress.props.children[0].props.children[1].props.children, 'Loading');
  const filled = plan('SearchField', { value: 'Mux' });
  const empty = plan('SearchField', { value: '' });
  assert.equal(filled.props.value, 'Mux');
  assert.ok(filled.props.children[2], 'filled idle variant renders the clear control');
  assert.equal(empty.props.children[2], null);
  for (const shouldCloseOnSelect of [true, false]) {
    const menu = plan('Menu', { shouldCloseOnSelect });
    assert.equal(menu.props.shouldCloseOnSelect, shouldCloseOnSelect);
    assert.equal(menu.props['aria-label'], 'Actions');
    assert.equal(menu.props.children.length, 2);
    assert.equal(menu.props.children[0].props.id, 'Melbourne');
  }
});

test('original overlay lifecycle cases start in the phase required by their real action', () => {
  for (const family of ['Dialog', 'Popover', 'PreviewTrigger', 'Tooltip']) {
    const opening = plan(family, {}, 'opening');
    const closing = plan(family, {}, 'closing');
    assert.equal(opening.props.isOpen, undefined, `${family} opening waits for its trigger`);
    assert.equal(opening.props.defaultOpen, undefined, `${family} opening starts closed`);
    assert.equal(closing.props.isOpen, undefined, `${family} closing remains dismissable`);
    assert.equal(closing.props.defaultOpen, true, `${family} closing starts with an attached overlay`);
    const openingLifecycle = lifecycleFactsForOriginalFinite(null, 'opening', 'donor');
    assert.equal(openingLifecycle.kind, 'enter');
    assert.deepEqual(openingLifecycle.marker, ['data-entering', 'data-opening']);
    assert.equal(openingLifecycle.after, 'present');
    assert.match(openingLifecycle.selector, /tale-dialog__popup/u);
    const closingLifecycle = lifecycleFactsForOriginalFinite(null, 'closing', 'donor');
    assert.equal(closingLifecycle.kind, 'exit');
    assert.deepEqual(closingLifecycle.marker, ['data-exiting', 'data-closing']);
    assert.equal(closingLifecycle.after, 'absent');
    assert.match(closingLifecycle.selector, /tale-popover__popup/u);
  }
});

test('original finite anatomy contract declares portal parts and closed-state absences', () => {
  const openDatePicker = finitePartSelectorsForOriginalFinite('DatePicker', 'open', 'donor');
  assert.deepEqual(openDatePicker.present.map(({ name }) => name), [
    'root', 'input', 'segment', 'trigger', 'popover', 'dialog', 'calendar', 'item',
  ]);
  assert.deepEqual(finitePartSelectorsForOriginalFinite('DatePicker', 'idle', 'donor').absent.map(({ name }) => name), [
    'popover', 'dialog', 'calendar', 'item',
  ]);

  const openComboBox = finitePartSelectorsForOriginalFinite('ComboBox', 'open', 'mux');
  assert.deepEqual(openComboBox.present.map(({ name }) => name), [
    'root', 'input', 'trigger', 'popover', 'list', 'item',
  ]);
  assert.deepEqual(finitePartSelectorsForOriginalFinite('ComboBox', 'idle', 'mux').absent.map(({ name }) => name), [
    'popover', 'list', 'item',
  ]);

  assert.deepEqual(finitePartSelectorsForOriginalFinite('Toast', 'dismissed', 'donor'), {
    present: [{ name: 'region', selector: '.tale-toast-region' }],
    absent: [
      { name: 'toast', selector: '.tale-toast' },
      { name: 'title', selector: '.tale-toast__title' },
      { name: 'message', selector: '.tale-toast__description' },
      { name: 'dismiss', selector: '.tale-toast__dismiss' },
    ],
  });

  assert.deepEqual(finitePartSelectorsForOriginalFinite('ColorPicker', 'idle', 'mux').present, [
    { name: 'root', selector: '.muxui-color-picker' },
    { name: 'area', selector: '.muxui-color-picker .muxui-color-area' },
  ]);
  assert.deepEqual(finitePartSelectorsForOriginalFinite('ColorPicker', 'idle', 'donor').present, [
    { name: 'root', selector: '.tale-color-area' },
    { name: 'area', selector: '.tale-color-area' },
  ]);
});

test('original finite DateRangePicker keeps the canonical hidden range separator', () => {
  const range = plan('DateRangePicker').props.children[1];
  const children = range.props.children;
  const separator = children.find((child) => child?.type === 'span');
  assert.ok(separator);
  assert.equal(separator.props['aria-hidden'], 'true');
  assert.equal(separator.props.children, '–');
});

test('original finite TagGroup maps group and item disabled state with stable tag ids on both render plans', () => {
  const cases = [
    {
      state: 'disabled',
      props: {
        disabled: true,
        items: [{ id: 'design', label: 'Design' }, { id: 'engineering', label: 'Engineering', disabled: false }],
      },
      itemDisabled: [true, true],
    },
    {
      state: 'idle',
      props: {
        items: [{ id: 'design', label: 'Design' }, { id: 'engineering', label: 'Engineering', disabled: true }],
      },
      itemDisabled: [false, true],
    },
  ];

  for (const { state, props, itemDisabled } of cases) {
    const fixture = { ...fixtureContractFor({ family: 'TagGroup' }, state), state };
    const args = stateArgsForBinding(bindingFor('TagGroup'), state, 'TagGroup', { ...props, [migrationFixtureSymbol]: fixture });
    const mux = muxRoot(renderFamily('TagGroup', args));
    assert.equal(mux.props.disabled, props.disabled, `${state} Mux group disabled state`);
    assert.deepEqual(mux.props.items, props.items, `${state} Mux items`);

    const donor = renderFamilyPlan({ component: 'TagGroup', props, state }, fixture, runtime());
    assert.equal(donor.props.isDisabled, props.disabled, `${state} donor group disabled state`);
    const tags = donor.props.children[1].props.children;
    assert.deepEqual(tags.map(({ props: tagProps }) => tagProps.id), ['design', 'engineering']);
    assert.deepEqual(tags.map(({ props: tagProps }) => Boolean(tagProps.isDisabled)), itemDisabled);
  }
});

test('original finite donor entry uses its sealed finite-only adapters', async () => {
  const historical = await readFile(new URL('../visual-migration/bootstrap/donor-entry.mjs', import.meta.url), 'utf8');
  const source = createFiniteDonorEntrySource(historical, { appRoot: '/workspace/apps/react-storybook' });
  assert.match(source, /r1-6-original-donor-render-plan\.mjs/u);
  assert.match(source, /AccordionPackage\.Accordion/u);
  assert.match(source, /variant === 'info' \? 'neutral' : variant/u);
});

test('original finite donor plan does not fabricate complete-state DOM markers', async () => {
  const source = await readFile(new URL('../visual-migration/bootstrap/r1-6-original-donor-render-plan.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /data-complete/u);
});

test('finite Mux entry mirrors the browser reduced-motion preference', async () => {
  const source = await readFile(new URL('../visual-migration/bootstrap/finite-mux-entry.mjs', import.meta.url), 'utf8');
  assert.match(source, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/u);
  assert.match(source, /toggleAttribute\('data-reduced-motion', preference\.matches\)/u);
  assert.doesNotMatch(source, /fullMotionStates/u);
});

function bindingFor(family) {
  const exportName = family === 'Modal' ? 'Dialog' : family;
  const binding = descriptor.historical.bindings.find((candidate) => candidate.export === exportName);
  assert.ok(binding, `missing historical binding for ${family}`);
  return binding;
}

function muxRoot(element) {
  if (typeof element.type !== 'string') return element;
  const children = element.props.children;
  return Array.isArray(children) ? children[0] : children;
}

function hasPropValue(element, name, value) {
  if (!element || typeof element !== 'object') return false;
  if (element.props && Object.hasOwn(element.props, name) && isDeepStrictEqual(element.props[name], value)) return true;
  const children = element.props?.children;
  return Array.isArray(children)
    ? children.some((child) => hasPropValue(child, name, value))
    : hasPropValue(children, name, value);
}

function rangeValue(value) {
  if (!value || typeof value !== 'object') return value;
  const plain = (date) => typeof date === 'string' ? date.replace(/^date:/u, '') : date;
  return { start: plain(value.start), end: plain(value.end) };
}

test('original finite paired inputs preserve explicit public values through both render plans', () => {
  const cases = [
    ['Meter', 'idle', { value: 20, minValue: 0, maxValue: 100 }, 'value'],
    ['Meter', 'idle', { value: 0, minValue: 0, maxValue: 100 }, 'value'],
    ['ColorSwatch', 'idle', { color: '#0000ff' }, 'color'],
    ['Select', 'idle', { items: [{ id: 'small', label: 'Small' }, { id: 'large', label: 'Large' }] }, 'items'],
    ['Switch', 'selected', { selected: true, defaultSelected: false }, 'selected'],
    ['ColorSwatchPicker', 'selected', { value: '#ff0000' }, 'value'],
    ['Virtualizer', 'idle', { height: 240, itemHeight: 48, overscan: 4 }, 'height'],
    ['RadioGroup', 'selected', { value: 's' }, 'value'],
    ['Tabs', 'selected', { value: 'overview' }, 'value'],
    ['RangeCalendar', 'selected', { value: { start: '2026-08-26', end: '2026-09-01' } }, 'value'],
    ['ProgressBar', 'complete', { value: 100 }, 'value'],
  ];

  for (const [family, state, rawProps, prop] of cases) {
    const fixture = fixtureContractFor({ family }, state);
    const args = stateArgsForBinding(bindingFor(family), state, family, { ...rawProps, [migrationFixtureSymbol]: fixture });
    assert.deepEqual(args[prop], rawProps[prop], `${family} state setup must retain ${prop}`);
    const donor = renderFamilyPlan({ component: family, props: rawProps, state }, fixture, runtime());
    const mux = muxRoot(renderFamily(family, args));
    assert.deepEqual(mux.props[prop], rawProps[prop], `${family} Mux adapter must retain ${prop}`);
    if (family === 'Meter') assert.equal(donor.props.value, rawProps.value);
    if (family === 'ColorSwatch') assert.equal(donor.props.color, rawProps.color);
    if (family === 'Switch') assert.equal(donor.props.isSelected, rawProps.selected);
    if (family === 'Virtualizer') {
      assert.equal(mux.props.itemHeight, 48);
      assert.equal(donor.props.children.props.style.height, '240px');
      assert.equal(donor.props.layout.options.rowSize, 48);
    }
    if (family === 'ProgressBar') assert.equal(donor.props['data-complete'], undefined);
    if (family === 'RadioGroup') assert.equal(donor.props.children[1].props.value, 's');
    if (family === 'Select' || family === 'Tabs') assert.equal(donor.props.selectedKey, rawProps.value);
    if (family === 'ColorSwatchPicker') assert.equal(donor.props.value, 'color:#ff0000');
    if (family === 'RangeCalendar') assert.deepEqual(rangeValue(donor.props.value), rawProps.value);
  }

  const original = finiteFixtures.components.filter(({ source }) => source === 'historical-fixed-53');
  assert.equal(original.length, 53);
  for (const record of original) {
    for (const entry of [...record.finiteVariants, ...record.interactionCases]) {
      assert.ok(entry.props && typeof entry.props === 'object', `${record.family} has canonical raw props`);
      const fixture = fixtureContractFor({ family: record.family }, entry.state ?? 'idle');
      const family = record.family === 'Modal' ? 'Dialog' : record.family;
      const args = stateArgsForBinding(bindingFor(record.family), entry.state ?? 'idle', family, {
        ...entry.props,
        [migrationFixtureSymbol]: fixture,
      });
      const mux = renderFamily(family, args);
      if (!['Group', 'TokenField'].includes(record.family)) {
        renderFamilyPlan({ component: family, props: entry.props, state: entry.state ?? 'idle' }, fixture, runtime());
      }
      assert.ok(mux?.props, `${record.family}/${entry.id} renders a Mux tree`);
      for (const [name, value] of Object.entries(entry.props)) {
        const expected = record.family === 'ProgressBar' && name === 'value' && value === null
          ? undefined
          : record.family === 'Toast' && name === 'variant' && value === 'info'
            ? 'neutral'
          : value;
        assert.ok(hasPropValue(mux, name, expected), `${record.family}/${entry.id} Mux tree retains explicit ${name}`);
      }
    }
  }
});

test('ordinary Storybook state setup retains explicit control values', () => {
  const meter = stateArgsForBinding(bindingFor('Meter'), 'idle', 'Meter', { value: 20, minValue: 0, maxValue: 100 });
  assert.deepEqual(meter, { value: 20, minValue: 0, maxValue: 100 });

  const selected = stateArgsForBinding(bindingFor('Switch'), 'selected', 'Switch', { selected: true, defaultSelected: false });
  assert.equal(selected.selected, true);
  assert.equal(selected.defaultSelected, false);

  const select = stateArgsForBinding(bindingFor('Select'), 'selected', 'Select', { value: 'custom', items: [{ id: 'custom', label: 'Custom' }] });
  assert.equal(select.value, 'custom');
  assert.deepEqual(select.items, [{ id: 'custom', label: 'Custom' }]);
});
