// A matrix of Mux families put into the states a user can put them in, rendered on the server and mounted in a DOM, to
// prove no React Aria state attribute reaches the markup. Every case names the Mux state attributes it must show, so a
// family that stops rendering a state fails here too, not only one that leaks the old name. Cases use the built package
// (generated/index.mjs), the same modules a consumer imports.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as generated from '../../generated/index.mjs';
import { createDom } from './dom.mjs';

const h = React.createElement;
const items = ['One', 'Two'];
const sections = [{ id: 'one', label: 'One', panel: 'One' }, { id: 'two', label: 'Two', panel: 'Two', disabled: true }];
const tree = [{ id: 'parent', label: 'Parent', children: [{ id: 'child', label: 'Child' }] }];

/**
 * A DatePicker's DateInput builds its own InputContext, out of reach of any wrapper, so the hidden text input React Aria
 * renders there for form validation keeps `data-disabled`. It carries `hidden` and `data-rac`, and no rule selects it.
 * That input, once per input the picker renders, is the only leak a case may have: a leak is named with its tag and, on an
 * input, its `hidden` and `data-rac` attributes, so a visible `<input data-disabled>` is not the exception, and leaks are
 * counted, so a second one is not either. A case that stops leaking one fails as stale.
 */
function hiddenInputLeaks(count) {
  return Array.from({ length: count }, () => 'data-disabled@input[hidden][data-rac]');
}

/** Rendered on the server: a family, the element that puts it in several states, the states its markup shows, and the attributes it may still leak. */
export const serverCases = {
  Button: [() => h(generated.Button, { disabled: true }, 'Save'), ['disabled']],
  ToggleButton: [() => h(generated.ToggleButton, { defaultSelected: true, disabled: true }, 'Bold'), ['selected', 'disabled']],
  Checkbox: [() => h(generated.Checkbox, { defaultChecked: true, invalid: true, required: true }, 'Agree'), ['selected', 'invalid', 'required']],
  CheckboxIndeterminate: [() => h(generated.Checkbox, { indeterminate: true }, 'Mixed'), ['indeterminate']],
  Switch: [() => h(generated.Switch, { label: 'Wi-Fi', defaultSelected: true, disabled: true, invalid: true, required: true, readOnly: true }), ['selected', 'disabled', 'invalid', 'required', 'read-only']],
  TextField: [() => h(generated.TextField, { label: 'Name', disabled: true, invalid: true, required: true, readOnly: true }), ['disabled', 'invalid', 'required', 'read-only']],
  SearchField: [() => h(generated.SearchField, { label: 'Find' }), ['empty']],
  RadioGroup: [() => h(generated.RadioGroup, { label: 'Choice', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], defaultValue: 'a', invalid: true, required: true, orientation: 'horizontal' }), ['selected', 'invalid', 'required', 'orientation']],
  Select: [() => h(generated.Select, { label: 'Pick', items, disabled: true, invalid: true, required: true }), ['disabled', 'invalid', 'required', 'placeholder']],
  ComboBox: [() => h(generated.ComboBox, { label: 'City', items, disabled: true, invalid: true }), ['disabled', 'invalid']],
  ListBox: [() => h(generated.ListBox, { 'aria-label': 'Options', items, defaultSelectedIds: ['One'], layout: 'grid', orientation: 'horizontal' }), ['selected', 'layout', 'orientation']],
  GridList: [() => h(generated.GridList, { 'aria-label': 'Cards', items, defaultSelectedIds: ['One'], selectionMode: 'multiple' }), ['selected', 'layout', 'orientation']],
  Tabs: [() => h(generated.Tabs, { 'aria-label': 'Sections', orientation: 'vertical', items: sections }), ['selected', 'disabled', 'orientation']],
  Tree: [() => h(generated.Tree, { 'aria-label': 'Files', items: tree, defaultExpandedIds: ['parent'], defaultSelectedIds: ['child'], selectionMode: 'multiple' }), ['expanded', 'has-child-items', 'selected']],
  Table: [() => h(generated.Table, { 'aria-label': 'People', columns: [{ id: 'name', label: 'Name', isRowHeader: true, sortable: true }], rows: [{ id: 'ada', name: 'Ada' }], sortDescriptor: { column: 'name', direction: 'ascending' }, defaultSelectedIds: ['ada'], selectionMode: 'multiple' }), ['allows-sorting', 'sort-direction', 'selected']],
  TagGroup: [() => h(generated.TagGroup, { label: 'Tags', items, selectionMode: 'multiple', defaultSelectedKeys: ['One'] }), ['selected']],
  ColorArea: [() => h(generated.ColorArea, { 'aria-label': 'Color', defaultValue: '#336699', disabled: true }), ['disabled']],
  Slider: [() => h(generated.Slider, { label: 'Volume', orientation: 'vertical', disabled: true }), ['orientation', 'disabled']],
  Disclosure: [() => h(generated.Disclosure, { title: 'More', defaultExpanded: true, disabled: true }, 'Body'), ['expanded', 'disabled']],
  DateFieldInvalid: [() => h(generated.DateField, { label: 'Date', invalid: true }), ['invalid', 'placeholder', 'type']],
  DateFieldDisabled: [() => h(generated.DateField, { label: 'Date', disabled: true }), ['disabled', 'placeholder', 'type']],
  TimeField: [() => h(generated.TimeField, { label: 'Time', disabled: true }), ['disabled', 'placeholder', 'type']],
  DatePicker: [() => h(generated.DatePicker, { label: 'Date', disabled: true }), ['disabled', 'placeholder', 'type'], hiddenInputLeaks(1)],
  DateRangePicker: [() => h(generated.DateRangePicker, { label: 'Range', disabled: true }), ['disabled', 'placeholder', 'type'], hiddenInputLeaks(2)],
};

/** Mounted in a DOM, where overlays open and calendars render: the same, scanned over the whole document. */
export const mountedCases = {
  DateFieldDisabled: [() => h(generated.DateField, { label: 'Date', disabled: true }), ['disabled', 'placeholder', 'type']],
  Calendar: [() => h(generated.Calendar, { label: 'Date', defaultValue: '2025-01-15' }), ['selected', 'outside-month']],
  RangeCalendar: [() => h(generated.RangeCalendar, { label: 'Range', defaultValue: { start: '2025-01-10', end: '2025-01-12' } }), ['selected', 'selection-start', 'selection-end', 'outside-month']],
  SelectOpen: [() => h(generated.Select, { label: 'Pick', items, defaultOpen: true }), ['open', 'placeholder', 'layout', 'orientation']],
  MenuOpen: [() => h(generated.Menu.Root, { defaultOpen: true }, h(generated.Menu.Trigger, null, 'Menu'), h(generated.Menu.Popup, null, h(generated.Menu.List, { 'aria-label': 'Actions' }, h(generated.Menu.Item, { id: 'a' }, 'A'), h(generated.Menu.Item, { id: 'b', disabled: true }, 'B')))), ['open', 'disabled']],
  AlertDialogOpen: [() => h(generated.AlertDialog.Root, { defaultOpen: true }, h(generated.AlertDialog.Trigger, null, 'Delete'), h(generated.AlertDialog.Backdrop, null, h(generated.AlertDialog.Popup, null, h(generated.AlertDialog.Content, null, h(generated.AlertDialog.Title, null, 'Delete?'), h(generated.AlertDialog.Close, null, 'Cancel'))))), []],
  ColorSwatchPicker: [() => h(generated.ColorSwatchPicker, { 'aria-label': 'Colors', items: ['#ff0000', '#00ff00'], defaultValue: '#ff0000' }), ['selected', 'layout', 'orientation']],
  Autocomplete: [() => h(generated.Autocomplete, { label: 'City', items, disabled: true }), ['empty', 'disabled']],
  Breadcrumbs: [() => h(generated.Breadcrumbs, { items: [{ id: 'a', label: 'A', href: '/a' }, { id: 'b', label: 'B' }] }), ['current']],
};

/** Every element of a document: its tag, whether it is a date segment, and its attribute names. */
const describe = (document) => [...document.querySelectorAll('*')].map((node) => ({
  tag: node.localName,
  isDateSegment: node.classList.contains('muxui-date-segment'),
  attributes: node.getAttributeNames(),
}));

/** The elements the family renders on the server. */
export const renderServer = (element) => describe(new JSDOM(`<!doctype html><body>${renderToString(element())}`).window.document);

/** Mounts `element` in a fresh DOM, lets effects and open overlays settle, and returns the document's elements. */
export async function renderMounted(element) {
  const env = createDom('<div id="root"></div>', { layoutStubs: true });
  const root = createRoot(document.querySelector('#root'));
  const error = console.error;
  console.error = () => {};
  try {
    await act(async () => root.render(element()));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    return describe(document);
  } finally {
    console.error = error;
    await act(async () => root.unmount());
    env.restore();
  }
}

/**
 * The attributes of `elements` that are names in `oldNames`, one `attribute@tag` per use and never deduplicated, with the
 * `hidden` and `data-rac` attributes an input carries appended (`data-disabled@input[hidden][data-rac]`). The date
 * segment's `data-placeholder` is the one attribute left out: React Aria reads it from the segment to find the focus
 * destination of a click on the field's padding, so the segment carries it beside `data-muxui-state-placeholder`.
 */
export function leakedStateAttributes(elements, oldNames) {
  const old = new Set(oldNames);
  return elements.flatMap(({ tag, isDateSegment, attributes }) => attributes
    .filter((attribute) => old.has(attribute) && !(attribute === 'data-placeholder' && isDateSegment))
    .map((attribute) => `${attribute}@${tag}${tag === 'input' ? ['hidden', 'data-rac'].filter((name) => attributes.includes(name)).map((name) => `[${name}]`).join('') : ''}`));
}

/**
 * What is wrong with one rendering: a leak outside `allowed`, an allowed leak that no longer occurs (a stale exception),
 * and a state the markup should show and does not. `allowed` is a list, matched one to one against the leaks.
 */
export function leakProblems(name, elements, states, allowed, oldNames) {
  const problems = [];
  const remaining = [...allowed];
  for (const leak of leakedStateAttributes(elements, oldNames)) {
    const index = remaining.indexOf(leak);
    if (index === -1) problems.push(`${name} renders ${leak}`);
    else remaining.splice(index, 1);
  }
  for (const leak of remaining) problems.push(`${name} no longer renders ${leak}, so its exception is stale`);
  const shown = shownStates(elements);
  for (const state of states) if (!shown.has(state)) problems.push(`${name} does not render data-muxui-state-${state}`);
  return problems;
}

/** The Mux state names (`selected`, `read-only`, ...) the elements carry. */
export const shownStates = (elements) => new Set(elements.flatMap(({ attributes }) => attributes)
  .filter((attribute) => attribute.startsWith('data-muxui-state-'))
  .map((attribute) => attribute.slice('data-muxui-state-'.length)));
