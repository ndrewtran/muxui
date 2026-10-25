import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as RAC from 'react-aria-components';
import * as substrate from '../src/substrate.ts';
import { installDom } from './support/dom.mjs';

const h = React.createElement;

// An empty href is a case under test (it must stay a div), and React warns about it on every render.
const consoleError = console.error;
console.error = (...args) => { if (!/An empty string \(.*\) was passed to the .* attribute/u.test(String(args[0]))) consoleError(...args); };
const { AriaButton, AriaCheckbox, AriaColorSwatchPicker, AriaColorSwatchPickerItem, AriaDateField, AriaDateInput, AriaDateSegment, AriaLink, AriaListBox, AriaListBoxItem, AriaMenu, AriaMenuItem, AriaTab, AriaTabList, AriaTabPanel, AriaTabs } = substrate;

/** The name of the element whose opening tag carries `marker`. */
const tagOf = (markup, marker) => new RegExp(`<([a-z0-9]+)[^>]*${marker}`, 'u').exec(markup)?.[1];
const attributes = (markup, marker) => new RegExp(`<[a-z0-9]+([^>]*${marker}[^>]*)>`, 'u').exec(markup)?.[1] ?? '';

test('a wrapped component gives its state attributes the Mux spelling and keeps no React Aria name', () => {
  const button = renderToString(h(AriaButton, { isDisabled: true }, 'Go'));
  assert.match(button, / data-muxui-state-disabled="true"/u);
  assert.doesNotMatch(button, / data-disabled=/u);

  const checkbox = renderToString(h(AriaCheckbox, { isSelected: true, isInvalid: true, isRequired: true, isReadOnly: true }, 'Agree'));
  for (const state of ['selected', 'invalid', 'required', 'read-only']) assert.match(checkbox, new RegExp(` data-muxui-state-${state}="true"`, 'u'), state);
  assert.doesNotMatch(checkbox, / data-(?:selected|invalid|required|readonly)=/u);

  const tabs = renderToString(h(AriaTabs, { defaultSelectedKey: 'a' },
    h(AriaTabList, { 'aria-label': 'Tabs' }, h(AriaTab, { id: 'a' }, 'A')),
    h(AriaTabPanel, { id: 'a' }, 'Panel')));
  assert.match(tabs, / data-muxui-state-orientation="horizontal"/u);
  assert.match(tabs, / data-muxui-state-selected="true"/u);
  assert.doesNotMatch(tabs, / data-(?:orientation|selected)=/u);
});

test('a family render is kept: it receives the Mux names and still creates its own element', () => {
  let seen;
  const markup = renderToString(h(AriaButton, {
    isDisabled: true,
    render: (domProps) => { seen = Object.keys(domProps); return h('div', { ...domProps, 'data-own': '' }); },
  }, 'Go'));
  assert.ok(seen.includes('data-muxui-state-disabled') && !seen.includes('data-disabled'));
  assert.match(markup, /^<div[^>]* data-own=""/u);
  assert.match(markup, / data-muxui-state-disabled="true"/u);
});

test('a collection item is an anchor exactly when React Aria would make it one', () => {
  const listBox = (Item, href) => renderToString(h(Item === 'raw' ? RAC.ListBox : AriaListBox, { 'aria-label': 'Items' },
    h(Item === 'raw' ? RAC.ListBoxItem : AriaListBoxItem, { id: 'a', textValue: 'A', ...(href === undefined ? {} : { href }) }, 'A')));
  const menu = (Item, href, disabled = false) => renderToString(h(Item === 'raw' ? RAC.Menu : AriaMenu, { 'aria-label': 'Menu' },
    h(Item === 'raw' ? RAC.MenuItem : AriaMenuItem, { id: 'a', textValue: 'A', isDisabled: disabled, ...(href === undefined ? {} : { href }) }, 'A')));
  const tab = (Item, href) => renderToString(h(Item === 'raw' ? RAC.Tabs : AriaTabs, { defaultSelectedKey: 'a' },
    h(Item === 'raw' ? RAC.TabList : AriaTabList, { 'aria-label': 'Tabs' }, h(Item === 'raw' ? RAC.Tab : AriaTab, { id: 'a', ...(href === undefined ? {} : { href }) }, 'A')),
    h(Item === 'raw' ? RAC.TabPanel : AriaTabPanel, { id: 'a' }, 'Panel')));
  const cases = [['absent', undefined], ['empty', ''], ['normal', '/x']];
  for (const [name, href] of cases) {
    const expected = href ? 'a' : 'div';
    assert.equal(tagOf(listBox('raw', href), 'role="option"'), expected, `raw ListBox item, href ${name}`);
    assert.equal(tagOf(listBox('wrapped', href), 'role="option"'), expected, `wrapped ListBox item, href ${name}`);
    assert.equal(tagOf(menu('raw', href), 'role="menuitem"'), expected, `raw Menu item, href ${name}`);
    assert.equal(tagOf(menu('wrapped', href), 'role="menuitem"'), expected, `wrapped Menu item, href ${name}`);
    assert.equal(tagOf(menu('wrapped', href, true), 'role="menuitem"'), tagOf(menu('raw', href, true), 'role="menuitem"'), `disabled Menu item, href ${name}`);
    assert.equal(tagOf(tab('raw', href), 'role="tab"'), expected, `raw Tab, href ${name}`);
    assert.equal(tagOf(tab('wrapped', href), 'role="tab"'), expected, `wrapped Tab, href ${name}`);
  }
});

test('a Link is an anchor with an href unless it is disabled, as in React Aria', () => {
  const link = (Link, props) => renderToString(h(Link, { className: 'link', ...props }, 'Link'));
  for (const [name, props] of [['absent', {}], ['empty', { href: '' }], ['normal', { href: '/x' }], ['disabled', { href: '/x', isDisabled: true }]]) {
    assert.equal(tagOf(link(AriaLink, props), 'class="link"'), tagOf(link(RAC.Link, props), 'class="link"'), name);
  }
  assert.equal(tagOf(link(AriaLink, { href: '/x', isDisabled: true }), 'class="link"'), 'span');
  assert.match(attributes(link(AriaLink, { href: '/x', isDisabled: true }), 'class="link"'), / data-muxui-state-disabled="true"/u);
});

test('date segments keep data-placeholder for React Aria, and the date input group is wrapped', () => {
  const field = (Input, props) => renderToString(h(AriaDateField, { 'aria-label': 'Date', ...props },
    h(Input, { className: 'group', children: (segment) => h(AriaDateSegment, { segment, className: 'segment' }) })));
  const empty = field(AriaDateInput, {});
  const segments = [...empty.matchAll(/<span[^>]*class="segment"[^>]*>/gu)].map(([tag]) => tag);
  assert.ok(segments.length >= 3);
  for (const tag of segments.filter((segment) => !/data-type="literal"/u.test(segment) && !/data-muxui-state-type="literal"/u.test(segment))) {
    assert.match(tag, / data-muxui-state-placeholder="true"/u);
    assert.match(tag, / data-placeholder="true"/u);
    assert.match(tag, / data-muxui-state-type="/u);
    assert.doesNotMatch(tag, / data-type=/u);
  }
  // The group delegates its element to Group, which sets the state attributes: the raw component leaks them.
  assert.match(attributes(field(AriaDateInput, { isDisabled: true }), 'class="group"'), / data-muxui-state-disabled="true"/u);
  assert.doesNotMatch(attributes(field(AriaDateInput, { isDisabled: true }), 'class="group"'), / data-disabled=/u);
  assert.match(attributes(field(RAC.DateInput, { isDisabled: true }), 'class="group"'), / data-disabled="true"/u, 'control: a raw DateInput leaks the React Aria name');
});

test('the ColorSwatchPicker root is renamed through the ListBox context', () => {
  const picker = (Picker) => renderToString(h(Picker, { 'aria-label': 'Swatches', defaultValue: '#f00' },
    h(Picker === RAC.ColorSwatchPicker ? RAC.ColorSwatchPickerItem : AriaColorSwatchPickerItem, { color: '#f00' })));
  const root = attributes(picker(AriaColorSwatchPicker), 'role="listbox"');
  assert.match(root, / data-muxui-state-layout="grid"/u);
  assert.match(root, / data-muxui-state-orientation="vertical"/u);
  assert.doesNotMatch(root, / data-(?:layout|orientation)=/u);
  assert.match(attributes(picker(RAC.ColorSwatchPicker), 'role="listbox"'), / data-layout="grid"/u, 'control: the raw picker keeps the React Aria names');
});

test('wrapped elements are the elements React Aria expects: no development warning on a client mount', async () => {
  const warnings = [];
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(h('div', null,
      h(AriaButton, null, 'Button'),
      h(AriaLink, { href: '/x' }, 'Link'),
      h(AriaLink, null, 'Plain'),
      h(AriaLink, { href: '/x', isDisabled: true }, 'Disabled'),
      h(AriaListBox, { 'aria-label': 'Items' }, h(AriaListBoxItem, { id: 'a', textValue: 'A', href: '/a' }, 'A'), h(AriaListBoxItem, { id: 'b', textValue: 'B', href: '' }, 'B'), h(AriaListBoxItem, { id: 'c', textValue: 'C' }, 'C')),
      h(AriaTabs, { defaultSelectedKey: 'a' }, h(AriaTabList, { 'aria-label': 'Tabs' }, h(AriaTab, { id: 'a', href: '' }, 'A')), h(AriaTabPanel, { id: 'a' }, 'Panel')),
      h(AriaDateField, { 'aria-label': 'Date' }, h(AriaDateInput, { children: (segment) => h(AriaDateSegment, { segment }) })),
      h(AriaColorSwatchPicker, { 'aria-label': 'Swatches', defaultValue: '#f00' }, h(AriaColorSwatchPickerItem, { color: '#f00' })))));
    assert.deepEqual(warnings.filter((message) => /Unexpected DOM element|Ref was not connected/u.test(message)), []);
  } finally {
    console.warn = warn;
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});
