import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderR16MuxPlan } from '../visual-migration/bootstrap/r1-6-mux-render-plan.mjs';
import { renderR16FamilyPlan } from '../visual-migration/bootstrap/r1-6-donor-render-plan.mjs';
import { ariaRelationshipFacts, initialOverlayReadyForCurrentEntry, stateReachedForCurrent } from '../visual-migration/bootstrap/r1-6-current-scene.mjs';
import { CommandPalette, Input, Sidebar } from '../../../packages/react/src/supplemental/index.mjs';
import finiteFixtures from '../../../catalog/react-r1-6/finite-fixtures.json' with { type: 'json' };

function element(type, props, ...children) {
  return {
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 1 ? children[0] : children,
    },
  };
}

function packageStubs() {
  const names = [
    'AlertDialog', 'ButtonGroup', 'Card', 'CheckboxField', 'CommandPalette',
    'HeaderNav', 'Input', 'InputTags', 'Lightbox', 'Markdown', 'MultiSelect',
    'PaymentInput', 'ProgressCircle', 'RadioField', 'Resizable', 'Sidebar',
    'SwitchField', 'TagSelect', 'TextArea', 'TextEditor',
  ];
  const packages = {};
  for (const name of names) {
    packages[name] = new Proxy({}, { get: (_, part) => `${name}.${String(part)}` });
  }
  packages.TextEditor = 'TextEditor';
  packages.ColorModeToggle = 'ColorModeToggle';
  packages.Markdown = 'Markdown';
  packages.ButtonGroup = 'ButtonGroup';
  packages.Button = 'Button';
  packages.RadioGroup = 'RadioGroup';
  return packages;
}

function donorPackageStubs() {
  const names = finiteFixtures.components.filter(({ source }) => source === 'current-r1-6').map(({ family }) => family);
  const packages = Object.fromEntries(names.map((name) => [name, new Proxy({}, {
    get: (_, part) => name === 'TextArea' && part === 'Input' ? undefined : `${name}.${String(part)}`,
  })]));
  packages.TextEditor = { TextEditor: packages.TextEditor };
  packages.Button = 'Button';
  return packages;
}

function fixture(state = 'idle') {
  return {
    data: {
      label: 'Example',
      placeholder: 'Enter a value',
      description: 'Helpful context',
      error: 'Invalid value',
      value: 'default value',
      markdown: '# Example',
      items: [{ id: 'design', label: 'Design' }, { id: 'engineering', label: 'Engineering' }],
    },
    state,
  };
}

function plan(component, props = {}, state = 'idle') {
  return renderR16MuxPlan({ component, props, state }, fixture(state), { h: element, packages: packageStubs() });
}

function donorPlan(component, props = {}, state = 'idle') {
  return renderR16FamilyPlan({ component, props, state }, fixture(state), { h: element, packages: donorPackageStubs() });
}

function find(node, type, matches = []) {
  if (Array.isArray(node)) {
    for (const child of node) find(child, type, matches);
    return matches;
  }
  if (!node || typeof node !== 'object') return matches;
  if (node.type === type) matches.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) find(child, type, matches);
  return matches;
}

function first(node, type) {
  const match = find(node, type)[0];
  assert.ok(match, `expected ${type} in render plan`);
  return match;
}

// Assert finite inputs at the actual compound prop owner on each side. This
// catches adapters that render successfully while silently dropping a variant.
function variantProp(tree, family, name, donor) {
  const property = (host, key = name) => first(tree, host).props[key];
  switch (family) {
    case 'AlertDialog': return name === 'disabled'
      ? property('AlertDialog.Trigger', donor ? 'isDisabled' : 'disabled')
      : property('AlertDialog.Root', donor ? 'isOpen' : 'open');
    case 'ButtonGroup': return property(donor ? 'ButtonGroup.ButtonGroup' : 'ButtonGroup', name === 'attached' && donor ? 'isAttached' : name);
    case 'Card': return property('Card.Root');
    case 'CheckboxField': return property('CheckboxField.Root', donor ? ({ checked: 'isSelected', indeterminate: 'isIndeterminate' }[name] ?? name) : name);
    case 'ColorModeToggle': return property(donor ? 'ColorModeToggle.ColorModeToggle' : 'ColorModeToggle', donor ? 'defaultMode' : 'mode');
    case 'CommandPalette': return property('CommandPalette.Root');
    case 'HeaderNav': return property('HeaderNav.NavButton');
    case 'Input': return property('Input.Input');
    case 'InputTags': return property('InputTags.Root');
    case 'Lightbox': return property('Lightbox.Root');
    case 'Markdown': return property(donor ? 'Markdown.Markdown' : 'Markdown', donor && name === 'source' ? 'children' : name);
    case 'MultiSelect': return property('MultiSelect.Root');
    case 'PaymentInput': return property('PaymentInput.Root');
    case 'ProgressCircle': return property('ProgressCircle.Root');
    case 'RadioField': return name === 'selected'
      ? property(donor ? 'RadioField.Group' : 'RadioGroup', donor ? 'defaultValue' : 'value') === 'plan'
      : property('RadioField.Root', name === 'disabled' && donor ? 'isDisabled' : name);
    case 'Resizable': return property('Resizable.Root', name === 'sizes' && !donor ? 'defaultSizes' : name);
    case 'Sidebar': return name === 'hideBorder'
      ? property('Sidebar.Root')
      : find(tree, 'Sidebar.NavItem')[name === 'external' ? 2 : 0].props[name];
    case 'SwitchField': return property('SwitchField.Root', donor ? 'isSelected' : 'checked');
    case 'TagSelect': return property('TagSelect.Root');
    case 'TextArea': return property('TextArea.TextArea');
    case 'TextEditor': return property(donor ? 'TextEditor.Toolbar' : 'TextEditor', donor && name === 'toolbar' ? 'type' : name);
    default: throw new Error(`Missing variant assertion for ${family}.${name}`);
  }
}

for (const component of finiteFixtures.components.filter(({ source }) => source === 'current-r1-6')) {
  test(`${component.family} forwards every declared finite variant on both sides`, () => {
    for (const variant of component.finiteVariants) {
      for (const donor of [false, true]) {
        const tree = (donor ? donorPlan : plan)(component.family, variant.props);
        for (const [name, expected] of Object.entries(variant.props)) {
          const value = variantProp(tree, component.family, name, donor);
          assert.deepEqual(value instanceof Set ? [...value] : value, expected, `${donor ? 'donor' : 'Mux'} ${component.family}/${variant.id}.${name}`);
        }
      }
    }
  });
}

test('current field and collection state defaults preserve matching inputs', () => {
  for (const renderer of [plan, donorPlan]) {
    for (const family of ['MultiSelect', 'TagSelect']) {
      assert.deepEqual(first(renderer(family, { items: [] }), `${family}.Root`).props.items, []);
    }
    for (const family of ['Input', 'TextArea']) {
      assert.equal(first(renderer(family, { value: 'Explicit' }, 'empty'), `${family}.Root`).props.defaultValue, 'Explicit');
    }
    assert.equal(first(renderer('InputTags', {}, 'inline'), 'InputTags.Root').props.size, 'md');
    assert.equal(first(renderer('PaymentInput', {}, 'unknown'), 'PaymentInput.Root').props.value, '9999999999999999');
  }
});

test('current finite plan preserves explicit props at compound hosts', () => {
  const input = plan('Input', { size: 'lg', value: 0 }, 'filled');
  assert.equal(first(input, 'Input.Root').props.size, 'lg');
  assert.equal(first(input, 'Input.Root').props.defaultValue, 0);
  assert.equal(first(input, 'Input.Input').props.size, 'lg');

  const inputTags = plan('InputTags', { size: 'lg', tagPlacement: 'below' }, 'inline');
  assert.equal(first(inputTags, 'InputTags.Root').props.size, 'lg');
  assert.equal(first(inputTags, 'InputTags.Root').props.tagPlacement, 'below');

  const textArea = plan('TextArea', { size: 'sm', rows: 3, value: '' }, 'filled');
  assert.equal(first(textArea, 'TextArea.Root').props.size, 'sm');
  assert.equal(first(textArea, 'TextArea.Root').props.defaultValue, '');
  assert.equal(first(textArea, 'TextArea.TextArea').props.size, 'sm');
  assert.equal(first(textArea, 'TextArea.TextArea').props.rows, 3);

  const payment = plan('PaymentInput', { value: '' }, 'visa');
  assert.equal(first(payment, 'PaymentInput.Root').props.value, '');

  const radio = plan('RadioField', { selected: false, size: 'sm', value: 'pro' }, 'selected');
  assert.equal(first(radio, 'RadioGroup').props.value, undefined);
  assert.equal(first(radio, 'RadioField.Root').props.value, 'pro');
  assert.equal(first(radio, 'RadioField.Root').props.size, 'sm');

  const multiSelect = plan('MultiSelect', { selectedKeys: [], items: [] }, 'selected');
  assert.deepEqual([...first(multiSelect, 'MultiSelect.Root').props.selectedKeys], []);
  assert.deepEqual(first(multiSelect, 'MultiSelect.Root').props.items, []);
  const multiFlags = plan('MultiSelect', { showSearch: false, showFooter: false }, 'open');
  assert.equal(first(multiFlags, 'MultiSelect.Root').props.showSearch, false);
  assert.equal(first(multiFlags, 'MultiSelect.Root').props.showFooter, false);

  const tagSelect = plan('TagSelect', { selectedKeys: [], items: [] }, 'selected');
  assert.deepEqual([...first(tagSelect, 'TagSelect.Root').props.selectedKeys], []);
  assert.deepEqual(first(tagSelect, 'TagSelect.Root').props.items, []);

  const header = plan('HeaderNav', { current: false }, 'current');
  assert.equal(first(header, 'HeaderNav.NavButton').props.current, false);

  const sidebar = plan('Sidebar', { current: false, external: false, hideBorder: false }, 'no-border');
  assert.equal(first(sidebar, 'Sidebar.Root').props.hideBorder, false);
  const navItems = find(sidebar, 'Sidebar.NavItem');
  assert.equal(navItems[0].props.current, false);
  assert.equal(navItems[2].props.external, false);

  const editor = plan('TextEditor', { floating: false, bubbleMenu: true, toolbar: 'full' });
  assert.equal(first(editor, 'TextEditor').props.floating, false);
  assert.equal(first(editor, 'TextEditor').props.bubbleMenu, true);
  assert.equal(first(editor, 'TextEditor').props.toolbar, 'full');

  const buttonGroup = plan('ButtonGroup', { orientation: 'vertical', attached: false }, 'attached');
  assert.equal(first(buttonGroup, 'ButtonGroup').props.orientation, 'vertical');
  assert.equal(first(buttonGroup, 'ButtonGroup').props.attached, false);

  const card = plan('Card', { variant: 'filled', padding: 'lg' }, 'elevated');
  assert.equal(first(card, 'Card.Root').props.variant, 'filled');
  assert.equal(first(card, 'Card.Root').props.padding, 'lg');
  const cardSelection = plan('Card', { selected: false }, 'selected');
  assert.equal(first(cardSelection, 'Card.Button').props.selected, false);

  const checkbox = plan('CheckboxField', { checked: false, size: 'sm' }, 'checked');
  assert.equal(first(checkbox, 'CheckboxField.Root').props.checked, false);
  assert.equal(first(checkbox, 'CheckboxField.Root').props.size, 'sm');

  const colorMode = plan('ColorModeToggle', { mode: 'dark' }, 'light');
  assert.equal(first(colorMode, 'ColorModeToggle').props.mode, 'dark');

  const command = plan('CommandPalette', { open: true, size: 'lg' }, 'closed');
  assert.equal(first(command, 'CommandPalette.Root').props.open, true);
  assert.equal(first(command, 'CommandPalette.Root').props.size, 'lg');

  const lightbox = plan('Lightbox', { open: false, loop: true, swipeNavigation: false }, 'open');
  assert.equal(first(lightbox, 'Lightbox.Root').props.open, false);
  assert.equal(first(lightbox, 'Lightbox.Root').props.loop, true);
  assert.equal(first(lightbox, 'Lightbox.Root').props.swipeNavigation, false);

  const markdown = plan('Markdown', { source: '# Custom', baseUrl: 'https://example.com/docs' });
  assert.equal(first(markdown, 'Markdown').props.source, '# Custom');
  assert.equal(first(markdown, 'Markdown').props.baseUrl, 'https://example.com/docs');

  const progress = plan('ProgressCircle', { size: 'sm', value: null, minValue: 10, maxValue: 80 }, 'partial');
  assert.equal(first(progress, 'ProgressCircle.Root').props.size, 'sm');
  assert.equal(first(progress, 'ProgressCircle.Root').props.value, null);
  assert.equal(first(progress, 'ProgressCircle.Root').props.minValue, 10);
  assert.equal(first(progress, 'ProgressCircle.Root').props.maxValue, 80);

  const resizable = plan('Resizable', { orientation: 'vertical', sizes: { main: 40, side: 60 } });
  assert.equal(first(resizable, 'Resizable.Root').props.orientation, 'vertical');
  assert.deepEqual(first(resizable, 'Resizable.Root').props.defaultSizes, { main: 40, side: 60 });

  const switchField = plan('SwitchField', { checked: false }, 'checked');
  assert.equal(first(switchField, 'SwitchField.Root').props.checked, false);

  const progressCircle = plan('ProgressCircle', { value: 0 }, 'complete');
  assert.equal(first(progressCircle, 'ProgressCircle.Root').props.value, 0);
  const indeterminateRaw = plan('ProgressCircle', { value: 64 }, 'indeterminate');
  assert.equal(first(indeterminateRaw, 'ProgressCircle.Root').props.value, 64);
});

test('payment typed case keeps the input uncontrolled on both adapters', () => {
  for (const renderer of [plan, donorPlan]) {
    const tree = renderer('PaymentInput', {}, 'typed');
    assert.equal(first(tree, 'PaymentInput.Root').props.value, undefined);
  }
});

test('current replay ARIA relationship facts ignore generated IDs but retain target differences', () => {
  const target = (attributes, text, tagName = 'P', computed = {}) => ({
    tagName,
    className: attributes.class ?? attributes.className ?? '',
    textContent: text,
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: computed.display ?? 'block', visibility: computed.visibility ?? 'visible' }) } },
  });
  const described = target({ 'data-part': 'description' }, 'Helpful context');
  const error = target({ class: 'muxui-input__error' }, 'Invalid value');
  const firstTarget = target({ 'data-part': 'label' }, 'Name', 'LABEL');
  const firstDocument = new Map([
    ['generated-description-1', described],
    ['generated-error-1', error],
    ['generated-label-1', firstTarget],
  ]);
  const first = ariaRelationshipFacts(target({ 'aria-describedby': 'generated-description-1 generated-error-1', 'aria-labelledby': 'generated-label-1' }, ''), 'aria-describedby', { getElementById: (id) => firstDocument.get(id) ?? null });
  const firstLabel = ariaRelationshipFacts(target({ 'aria-labelledby': 'generated-label-1' }, ''), 'aria-labelledby', { getElementById: (id) => firstDocument.get(id) ?? null });
  const secondDocument = new Map([
    ['generated-description-2', described],
    ['generated-error-2', error],
    ['generated-label-2', firstTarget],
  ]);
  const second = ariaRelationshipFacts(target({ 'aria-describedby': 'generated-description-2 generated-error-2', 'aria-labelledby': 'generated-label-2' }, ''), 'aria-describedby', { getElementById: (id) => secondDocument.get(id) ?? null });
  const secondLabel = ariaRelationshipFacts(target({ 'aria-labelledby': 'generated-label-2' }, ''), 'aria-labelledby', { getElementById: (id) => secondDocument.get(id) ?? null });
  assert.deepEqual(second, first);
  assert.deepEqual(secondLabel, firstLabel);

  const missing = ariaRelationshipFacts(target({ 'aria-describedby': 'generated-description-2 missing-error' }, ''), 'aria-describedby', { getElementById: (id) => secondDocument.get(id) ?? null });
  assert.equal(missing.present, true);
  assert.equal(missing.count, 2);
  assert.equal(missing.resolves, false);
  assert.equal(missing.targets[1].present, false);

  const misdirected = ariaRelationshipFacts(target({ 'aria-describedby': 'generated-error-2' }, ''), 'aria-describedby', { getElementById: (id) => secondDocument.get(id) ?? null });
  assert.equal(misdirected.resolves, true);
  assert.equal(misdirected.count, 1);
  assert.notDeepEqual(misdirected, first);

  const hiddenDescription = target({ 'data-part': 'description', hidden: '', 'aria-hidden': 'true', role: 'note' }, 'Helpful context', 'P', { display: 'none', visibility: 'hidden' });
  const hiddenDocument = new Map([['generated-description-3', hiddenDescription], ['generated-error-3', error]]);
  const hidden = ariaRelationshipFacts(target({ 'aria-describedby': 'generated-description-3 generated-error-3' }, ''), 'aria-describedby', { getElementById: (id) => hiddenDocument.get(id) ?? null });
  assert.equal(hidden.resolves, true);
  assert.equal(hidden.targets[0].role, 'note');
  assert.equal(hidden.targets[0].hidden, true);
  assert.equal(hidden.targets[0].ariaHidden, 'true');
  assert.equal(hidden.targets[0].display, 'none');
  assert.equal(hidden.targets[0].visibility, 'hidden');
  assert.notDeepEqual(hidden, first);

  const muxDescription = target({ class: 'muxui-text-editor__description' }, 'Editor help');
  const taleHint = target({ class: 'tale-text-editor__hint' }, 'Editor help');
  const muxRelationship = ariaRelationshipFacts(target({ 'aria-describedby': 'description' }, ''), 'aria-describedby', { getElementById: () => muxDescription });
  const taleRelationship = ariaRelationshipFacts(target({ 'aria-describedby': 'hint' }, ''), 'aria-describedby', { getElementById: () => taleHint });
  assert.deepEqual(taleRelationship, muxRelationship);
});

test('current focus state accepts only an exact keyboard virtual-focus target', () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const target = {
    id: 'option-react',
    getAttribute: (name) => name === 'role' ? 'option' : name === 'data-key' ? 'react' : null,
    getClientRects: () => [{ width: 1, height: 1 }],
  };
  const input = {
    getAttribute: (name) => name === 'aria-activedescendant' ? 'option-react' : name === 'data-focus-visible' ? 'true' : null,
    matches: () => false,
  };
  const listbox = { getAttribute: () => null };
  const root = {
    dataset: {},
    getAttribute: () => null,
    querySelector: (selector) => selector === '#option-react' ? target : undefined,
    querySelectorAll: () => [],
  };
  const documentStub = {
    activeElement: input,
    body: {},
    querySelector: (selector) => selector.includes('[role="listbox"]') ? listbox : null,
    querySelectorAll: () => [],
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentStub });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({ display: 'block', visibility: 'visible' }) });
  try {
    const entry = { component: 'MultiSelect', state: 'open', action: { type: 'focus', selector: '#option-react' } };
    assert.equal(stateReachedForCurrent(root, 'open', entry), true);

    input.getAttribute = (name) => name === 'aria-activedescendant' ? 'option-css' : name === 'data-focus-visible' ? 'true' : null;
    assert.equal(stateReachedForCurrent(root, 'open', entry), false);
    input.getAttribute = (name) => name === 'aria-activedescendant' ? 'option-react' : null;
    assert.equal(stateReachedForCurrent(root, 'open', entry), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    if (previousGetComputedStyle === undefined) delete globalThis.getComputedStyle;
    else Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: previousGetComputedStyle });
  }
});

test('current focus state follows the keyboard-visible RAC owner for hidden inputs', () => {
  const previousDocument = globalThis.document;
  const visualOwner = { getAttribute: (name) => name === 'data-focus-visible' ? 'true' : null, matches: () => false, parentElement: null };
  const activeControl = { getAttribute: () => null, matches: () => false, parentElement: visualOwner };
  const root = {
    dataset: {},
    getAttribute: () => null,
    querySelectorAll: () => [],
    contains: (element) => element === activeControl || element === visualOwner,
  };
  visualOwner.parentElement = root;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { activeElement: activeControl, body: {}, querySelectorAll: () => [], documentElement: { dataset: {} } },
  });
  try {
    assert.equal(stateReachedForCurrent(root, 'focused', { component: 'CheckboxField', state: 'focused' }), true);
    visualOwner.getAttribute = () => null;
    assert.equal(stateReachedForCurrent(root, 'focused', { component: 'CheckboxField', state: 'focused' }), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
  }
});

test('selected MultiSelect and TagSelect cases do not require an open popup', () => {
  assert.equal(initialOverlayReadyForCurrentEntry({ component: 'MultiSelect', state: 'selected' }), true);
  assert.equal(initialOverlayReadyForCurrentEntry({ component: 'TagSelect', state: 'selected' }), true);
});

test('current donor adapter retains the same finite compound axes', () => {
  const input = donorPlan('Input', { size: 'lg', value: null }, 'filled');
  assert.equal(first(input, 'Input.Root').props.defaultValue, null);
  assert.equal(first(input, 'Input.Input').props.size, 'lg');

  const inputTags = donorPlan('InputTags', { size: 'lg', tagPlacement: 'below' }, 'inline');
  assert.equal(first(inputTags, 'InputTags.Root').props.size, 'lg');
  assert.equal(first(inputTags, 'InputTags.Root').props.tagPlacement, 'below');

  const multiSelect = donorPlan('MultiSelect', { showSearch: false, showFooter: false, items: [] }, 'open');
  assert.equal(first(multiSelect, 'MultiSelect.Root').props.showSearch, false);
  assert.equal(first(multiSelect, 'MultiSelect.Root').props.showFooter, false);

  const card = donorPlan('Card', { selected: false }, 'selected');
  assert.equal(first(card, 'Card.Button').props.isSelected, false);

  const progress = donorPlan('ProgressCircle', { value: 64 }, 'indeterminate');
  assert.equal(first(progress, 'ProgressCircle.Root').props.value, 64);

  const payment = donorPlan('PaymentInput', { value: '4242424242424242' }, 'empty');
  assert.equal(first(payment, 'PaymentInput.Root').props.value, '4242424242424242');

  const header = donorPlan('HeaderNav', { current: false }, 'current');
  assert.equal(first(header, 'HeaderNav.NavButton').props.current, false);

  const sidebar = donorPlan('Sidebar', { current: false, external: false, hideBorder: false }, 'no-border');
  assert.equal(first(sidebar, 'Sidebar.Root').props.hideBorder, false);
  const sidebarItems = find(sidebar, 'Sidebar.NavItem');
  assert.equal(sidebarItems[0].props.current, false);
  assert.equal(sidebarItems[2].props.external, false);

  const radio = donorPlan('RadioField', { selected: false, value: 'pro' }, 'selected');
  assert.equal(first(radio, 'RadioField.Group').props.defaultValue, undefined);
  assert.equal(first(radio, 'RadioField.Root').props.value, 'pro');
});

test('supplemental interaction plans retain child state owners on both adapters', () => {
  for (const renderer of [plan, donorPlan]) {
    const commandSelected = renderer('CommandPalette', { open: true, selectedKeys: ['design'] }, 'selected');
    const commandList = first(commandSelected, 'CommandPalette.ListBox');
    assert.equal(commandList.props.selectionMode, 'single');
    assert.deepEqual([...commandList.props.selectedKeys], ['design']);
    const commandItems = find(commandSelected, 'CommandPalette.Item');
    assert.equal(commandItems[0].props.id, 'design');

    const commandDisabled = renderer('CommandPalette', { open: true, items: [{ id: 'design', label: 'Design', disabled: true }] }, 'open');
    const commandDisabledItem = first(commandDisabled, 'CommandPalette.Item').props;
    assert.equal(commandDisabledItem.disabled ?? commandDisabledItem.isDisabled, true);

    const multiDisabled = renderer('MultiSelect', { open: true, items: [{ id: 'design', label: 'Design', disabled: true }] }, 'open');
    const multiRoot = first(multiDisabled, 'MultiSelect.Root');
    const multiDisabledItem = first(multiRoot.props.children({ id: 'design', label: 'Design', disabled: true }), 'MultiSelect.Item').props;
    assert.equal(multiDisabledItem.disabled ?? multiDisabledItem.isDisabled, true);

    const tagDisabled = renderer('TagSelect', { items: [{ id: 'design', label: 'Design', disabled: true }] }, 'selected');
    const tagRoot = first(tagDisabled, 'TagSelect.Root');
    const tagDisabledItem = first(tagRoot.props.children({ id: 'design', label: 'Design', disabled: true }), 'TagSelect.Item').props;
    assert.equal(tagDisabledItem.disabled ?? tagDisabledItem.isDisabled, true);

    const progress = renderer('ProgressCircle', {}, 'indeterminate');
    for (const part of ['Track', 'Label', 'Value']) assert.ok(first(progress, `ProgressCircle.${part}`));

    const resizable = renderer('Resizable');
    assert.equal(first(resizable, 'Resizable.Handle').props.id, 'main-side');
  }

  const currentEditor = plan('TextEditor', {}, 'selected');
  const currentDocument = first(currentEditor, 'TextEditor').props.defaultValue;
  assert.deepEqual(currentDocument.content[0].content[0].marks, [{ type: 'bold' }]);
  const donorEditor = donorPlan('TextEditor', {}, 'selected');
  assert.match(first(donorEditor, 'TextEditor.Root').props.content, /<strong>Helpful context<\/strong>/u);

  for (const renderer of [plan, donorPlan]) {
    for (const family of ['AlertDialog', 'CommandPalette', 'Lightbox', 'MultiSelect', 'TagSelect']) {
      const opening = renderer(family, {}, 'opening');
      const closing = renderer(family, {}, 'closing');
      const openingRoot = first(opening, `${family}.Root`).props;
      const closingRoot = first(closing, `${family}.Root`).props;
      assert.equal(openingRoot.open ?? openingRoot.isOpen, undefined);
      if (!['MultiSelect', 'TagSelect'].includes(family)) assert.equal(closingRoot.defaultOpen, true);
    }
  }
});

test('current compound runtime carries size and icon classes to actual hosts', () => {
  const inputMarkup = renderToStaticMarkup(
    React.createElement(
      Input.Root,
      { 'aria-label': 'Name' },
      React.createElement(Input.Input, { size: 'lg' }),
    ),
  );
  assert.match(inputMarkup, /muxui-input--lg/u);

  const commandPaletteMarkup = renderToStaticMarkup(
    React.createElement(
      CommandPalette.Root,
      { size: 'lg' },
      React.createElement(CommandPalette.ListBox, { 'aria-label': 'Commands' }),
    ),
  );
  assert.match(commandPaletteMarkup, /muxui-command-palette__listbox--lg/u);

  const accountMarkup = renderToStaticMarkup(
    React.createElement(Sidebar.AccountCard, { name: 'Alex Morgan', email: 'alex@example.com' }),
  );
  assert.match(accountMarkup, /muxui-sidebar__account-trigger-icon/u);
});
