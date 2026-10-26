import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { DEFAULT_SLOT, PopoverContext } from 'react-aria-components';
import { ListBox, Menu, Select } from '../src/collections.mjs';
import { createDom } from './support/dom.mjs';

const h = React.createElement;

test('compound ListBox hydrates sections, controls selection, and keeps root-disabled items inert', async () => {
  const selected = [];
  const itemRef = React.createRef();
  const fixture = (disabled = false) => h(ListBox, { 'aria-label': 'Options', selectedIds: ['one'], onSelectionChange: (ids) => selected.push(ids), disabled, layout: 'grid', orientation: 'vertical' },
    h(ListBox.Section, null, h(ListBox.Header, null, 'Numbers'),
      h(ListBox.Item, { id: 'one', ref: itemRef, textValue: 'One', disabled: false }, h('strong', null, 'One')),
      h(ListBox.Item, { id: 'two', textValue: 'Two', disabled: false }, 'Two')));
  const env = createDom(`<div id="root">${renderToString(fixture())}</div>`);
  const container = document.getElementById('root');
  const recoverable = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(container, fixture(), { onRecoverableError: (error) => recoverable.push(error.message) }); });
    assert.deepEqual(recoverable, []);
    assert.equal(itemRef.current.tagName, 'DIV');
    assert.equal(container.querySelector('header').textContent, 'Numbers');
    assert.equal(container.querySelector('[role="listbox"]').dataset.muxuiStateLayout, 'grid');
    const options = [...container.querySelectorAll('[role="option"]')];
    await act(async () => options[1].click());
    assert.deepEqual(selected, [['two']]);
    assert.equal(options[0].getAttribute('aria-selected'), 'true');
    await act(async () => root.render(fixture(true)));
    for (const option of container.querySelectorAll('[role="option"]')) {
      assert.equal(option.getAttribute('aria-disabled'), 'true');
      await act(async () => option.click());
    }
    assert.deepEqual(selected, [['two']]);
  } finally { await act(async () => root?.unmount()); env.restore(); }
});

test('compound Menu action ordering is Mux-owned and disabled cannot be overridden by children', async () => {
  const env = createDom();
  const container = document.getElementById('root');
  const root = createRoot(container);
  const seen = [];
  const fixture = (disabled = false) => h(Menu, { 'aria-label': 'Actions', disabled, onAction: (item) => seen.push(['action', item]), onSelect: (item) => seen.push(['select', item]) },
    h(Menu.Section, { title: h('strong', null, 'Editing') },
      h(Menu.Item, { id: 'copy', disabled: false, onAction: () => seen.push(['item']) }, 'Copy')),
    h(Menu.Separator), h(Menu.Item, { id: 'blocked', disabled: true }, 'Blocked'));
  try {
    await act(async () => root.render(fixture()));
    assert.equal(container.querySelector('.muxui-menu__section').tagName, 'SECTION');
    assert.equal(container.querySelector('.muxui-menu__separator').tagName, 'HR');
    await act(async () => container.querySelector('[role="menuitem"]').click());
    assert.deepEqual(seen, [['item'], ['action', { id: 'copy', key: 'copy', value: 'copy' }], ['select', { id: 'copy', key: 'copy', value: 'copy' }]]);
    await act(async () => root.render(fixture(true)));
    for (const item of container.querySelectorAll('[role="menuitem"]')) {
      assert.equal(item.getAttribute('aria-disabled'), 'true');
      await act(async () => item.click());
    }
    assert.equal(seen.length, 3);
    await act(async () => root.render(h(Menu.Root, { disabled: true, open: true, onAction: () => {}, onSelect: () => {} },
      h(Menu.Trigger, { disabled: false }, 'Disabled root'), h(Menu.Popup, null, h(Menu.List, { disabled: false }, h(Menu.Item, { id: 'never', disabled: false }, 'Never'))))));
    assert.equal(container.querySelector('button').disabled, true);
    assert.equal(document.querySelector('[role="menu"]'), null);
  } finally { await act(async () => root.unmount()); env.restore(); }
});

// A Menu.Item's own shouldCloseOnSelect is a declared prop that the item forwards as given. A boolean wins; left out or undefined, the
// item follows its list, the list follows the root, and the root closes the menu unless it says otherwise.
test('Menu.Item shouldCloseOnSelect overrides the list and the root, and unset it follows them', async () => {
  const outcomes = [];
  for (const root of [undefined, false, true]) {
    for (const list of [undefined, false, true]) {
      for (const item of ['omitted', undefined, false, true]) {
        const env = createDom('<div id="root"></div>', { layoutStubs: true });
        const changes = [];
        const container = createRoot(document.getElementById('root'));
        const itemProps = item === 'omitted' ? { id: 'one' } : { id: 'one', shouldCloseOnSelect: item };
        try {
          await act(async () => container.render(h(Menu.Root, { open: true, onOpenChange: (next) => changes.push(next), shouldCloseOnSelect: root },
            h(Menu.Trigger, null, 'Actions'),
            h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Actions', shouldCloseOnSelect: list }, h(Menu.Item, itemProps, 'One'))))));
          await act(async () => document.querySelector('[role="menuitem"]').click());
          const expected = [item, list, root].find((value) => typeof value === 'boolean') ?? true;
          outcomes.push(expected);
          assert.equal(changes.includes(false), expected, `root ${root}, list ${list}, item ${item === 'omitted' ? 'left out' : item}`);
        } finally { await act(async () => container.unmount()); env.restore(); }
      }
    }
  }
  assert.equal(outcomes.length, 36);
  assert.equal(outcomes.includes(true) && outcomes.includes(false), true, 'the matrix closes the menu and keeps it open');
});

test('Select composition names and spans remain explicit while simple usage keeps its default content', () => {
  const compound = renderToString(h(Select.Root, { defaultValue: 'one', invalid: true },
    h(Select.Label, null, 'Choice'), h(Select.Trigger, null, h(Select.Value)),
    h(Select.Popup, null, h(Select.List, null, h(Select.Item, { id: 'one', textValue: 'One' }, h('strong', null, 'One')))),
    h(Select.Description, null, 'Description'), h(Select.Error, null, 'Error')));
  assert.match(compound, /<span class="muxui-field-label muxui-select__label"/u);
  assert.match(compound, /class="muxui-field-description muxui-select__description"/u);
  assert.match(compound, /class="muxui-field-error muxui-select__error"/u);
  assert.match(compound, /<strong>One<\/strong>/u);
  assert.match(renderToString(h(Select, { label: 'Choice', items: ['one'] })), /Select an option/u);
  assert.match(renderToString(h(Select, { label: 'Choice', items: ['one'], selectedContent: h('strong', null, 'Custom value') })), /<strong>Custom value<\/strong>/u);
  assert.throws(() => renderToString(h(Select.Root, null, h(Select.Trigger, null, 'Unnamed'))), /requires label/u);
  assert.throws(() => renderToString(h(Select.Root, null, h(Select.Label, null, ''))), /requires label/u);
  assert.throws(() => renderToString(h(Select, { label: 'Choice', trigger: h('div', null, 'Wrong host') })), /native button/u);
});

test('compound triggers preserve native pointer, context-menu, auxiliary-click handlers and button refs', async () => {
  const env = createDom();
  const container = document.getElementById('root');
  const root = createRoot(container);
  const seen = [];
  const menuRef = React.createRef();
  const selectRef = React.createRef();
  const events = (name) => ({
    onPointerDown: (event) => { event.preventDefault(); seen.push([name, event.type, event.currentTarget.tagName]); },
    onContextMenu: (event) => { event.preventDefault(); seen.push([name, event.type, event.currentTarget.tagName]); },
    onAuxClick: (event) => seen.push([name, event.type, event.currentTarget.tagName]),
  });
  try {
    await act(async () => root.render(h(React.Fragment, null,
      h(Menu.Root, { open: false }, h(Menu.Trigger, { ref: menuRef, ...events('menu') }, 'Actions'), h(Menu.Popup, null, h(Menu.List, null, h(Menu.Item, { id: 'one' }, 'One')))),
      h(Select.Root, { label: 'Choice', open: false }, h(Select.Trigger, { ref: selectRef, ...events('select') }, h(Select.Value)), h(Select.Popup, null, h(Select.List, { items: ['One'] }))))));
    for (const ref of [menuRef, selectRef]) {
      assert.equal(ref.current.tagName, 'BUTTON');
      for (const type of ['pointerdown', 'contextmenu', 'auxclick']) {
        await act(async () => ref.current.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'auxclick' ? 1 : 0 })));
      }
    }
    assert.deepEqual(seen, ['menu', 'select'].flatMap((name) => ['pointerdown', 'contextmenu', 'auxclick'].map((type) => [name, type, 'BUTTON'])));
  } finally { await act(async () => root.unmount()); env.restore(); }
});

test('collection layout and popup geometry reject unsupported or nonfinite inputs', () => {
  assert.throws(() => renderToString(h(ListBox, { 'aria-label': 'List', layout: 'masonry' })), /layout/u);
  assert.throws(() => renderToString(h(ListBox, { 'aria-label': 'List', orientation: 'diagonal' })), /orientation/u);
  for (const Component of [Menu.Popup, Select.Popup]) {
    for (const props of [{ placement: 'left' }, { offset: NaN }, { crossOffset: Infinity }, { containerPadding: -1 }, { shouldFlip: 'yes' }, { modal: 'yes' }]) {
      assert.throws(() => renderToString(h(Component, props)), TypeError);
    }
  }
  assert.throws(() => renderToString(h(Menu.Submenu, { delay: Infinity })), /delay/u);
});

// Menu.Popup tells a submenu's popup by React Aria's PopoverContext, which names the trigger, and reads it through the popup's own slot, as React
// Aria does. A popup with no placement of its own sends React Aria bottom-start, or none inside a submenu, which leaves it React Aria's end top.
test('Menu.Popup reads the popover context through its own slot', () => {
  // The placement Menu.Popup sends React Aria, read where it is sent: `undefined` is none, and the render must not throw.
  const sentPlacement = (slots, popupProps) => {
    const create = React.createElement;
    const sent = [];
    React.createElement = (type, props, ...children) => {
      if (props !== null && typeof props === 'object' && 'isNonModal' in props) sent.push(props.placement);
      return create(type, props, ...children);
    };
    try {
      renderToString(h(Menu.Root, null, h(PopoverContext.Provider, { value: { slots } }, h(Menu.Popup, popupProps))));
    } finally {
      React.createElement = create;
    }
    return sent[0];
  };
  const top = { trigger: 'MenuTrigger' };
  const nested = { trigger: 'SubmenuTrigger' };
  // A named slot that no default slot sits beside: the popup reads it, and a placement it is given is kept.
  assert.equal(sentPlacement({ menu: top }, { slot: 'menu', placement: 'end-top' }), 'end top');
  assert.equal(sentPlacement({ menu: top }, { slot: 'menu' }), 'bottom start');
  assert.equal(sentPlacement({ menu: nested }, { slot: 'menu', placement: 'end-top' }), 'end top');
  // A default slot beside a named one: each popup reads its own, not the other's.
  assert.equal(sentPlacement({ [DEFAULT_SLOT]: nested, menu: top }, { slot: 'menu' }), 'bottom start');
  assert.equal(sentPlacement({ [DEFAULT_SLOT]: nested, menu: top }, {}), undefined);
  assert.equal(sentPlacement({ [DEFAULT_SLOT]: top, sub: nested }, { slot: 'sub' }), undefined);
  assert.equal(sentPlacement({ [DEFAULT_SLOT]: top, sub: nested }, {}), 'bottom start');
});
