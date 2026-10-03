import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import {
  Breadcrumbs,
  Calendar,
  Checkbox,
  CheckboxField,
  ComboBox,
  DatePicker,
  DateRangePicker,
  Disclosure,
  DisclosureGroup,
  NumberField,
  RangeCalendar,
  SearchField,
  Select,
  Tabs,
  TagGroup,
  Tree,
} from '../generated/index.mjs';
import { installDom } from './support/dom.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const lucideIntegrity = 'sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==';

test('Lucide stays an exact internal, tree-shakeable dependency with no public leakage', async () => {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['lucide-react'], '1.37.0');

  const lockfile = await readFile(resolve(packageRoot, '../../pnpm-lock.yaml'), 'utf8');
  assert.match(lockfile, new RegExp(`lucide-react@1\\.37\\.0:\\n\\s+resolution: \\{integrity: ${lucideIntegrity.replaceAll('+', '\\+')}\\}`));

  const sourceByFile = await Promise.all(['components.mjs', 'fields.mjs', 'collections.mjs', 'overlays.mjs', 'tabs-motion.mjs', 'supplemental/index.mjs']
    .map(async (file) => [file, await readFile(resolve(packageRoot, 'src', file), 'utf8')]));
  const source = sourceByFile.map(([, content]) => content).join('\n');
  const iconModules = ['check', 'chevron-down', 'chevron-left', 'chevron-right', 'chevron-up', 'minus', 'plus', 'x'];
  for (const icon of iconModules) assert.match(source, new RegExp(`from 'lucide-react/dist/esm/icons/${icon}\\.mjs'`));
  assert.doesNotMatch(source, /from 'lucide-react\/dist\/esm\/icons\/calendar\.mjs'/u);
  assert.doesNotMatch(source, /from ['"]lucide-react['"]/u);

  const publicEntry = await readFile(resolve(packageRoot, 'generated/index.mjs'), 'utf8');
  const publicTypes = await readFile(resolve(packageRoot, 'generated/index.d.ts'), 'utf8');
  assert.doesNotMatch(`${publicEntry}\n${publicTypes}`, /lucide-react|lucide-[a-z-]+|IconProps/u);

  const lucideManifest = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/lucide-react/package.json'), 'utf8'));
  assert.equal(lucideManifest.version, '1.37.0');
  assert.equal(lucideManifest.sideEffects, false);
  const checkModule = await import('lucide-react/dist/esm/icons/check.mjs');
  assert.equal(typeof checkModule.default, 'object');
});

test('MuxUI affordances render the accepted Lucide glyph mapping as decorative SVGs', () => {
  const markup = renderToString(React.createElement('div', null,
    React.createElement(Breadcrumbs, { 'aria-label': 'Path', items: [{ label: 'Home', href: '/' }, { label: 'Current' }] }),
    React.createElement(Checkbox, { defaultChecked: true }, 'Complete'),
    React.createElement(Checkbox, { indeterminate: true }, 'Mixed'),
    React.createElement(SearchField, { label: 'Search', defaultValue: 'MuxUI' }),
    React.createElement(NumberField, { label: 'Quantity', defaultValue: 2 }),
    React.createElement(DatePicker, { label: 'Due date', defaultValue: '2026-08-26' }),
    React.createElement(DateRangePicker, { label: 'Trip', defaultValue: { start: '2026-08-26', end: '2026-09-01' } }),
    React.createElement(Calendar, { label: 'Calendar', value: '2026-08-26' }),
    React.createElement(RangeCalendar, { label: 'Range calendar', value: { start: '2026-08-26', end: '2026-09-01' } }),
    React.createElement(ComboBox, { label: 'City', items: ['Melbourne'] }),
    React.createElement(Select, { label: 'Country', items: ['Australia'] }),
    React.createElement(TagGroup, { label: 'Tags', items: ['MuxUI'], onRemove: () => {} }),
    React.createElement(Tree, { 'aria-label': 'Navigation', items: [{ id: 'root', label: 'Root', children: [{ id: 'child', label: 'Child' }] }] }),
    React.createElement(DisclosureGroup, null, React.createElement(Disclosure, { id: 'details', title: 'Details' }, 'More')),
    React.createElement(CheckboxField.Root, { defaultChecked: true }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Accept')),
    React.createElement(CheckboxField.Root, { indeterminate: true }, React.createElement(CheckboxField.Button, null, React.createElement(CheckboxField.Indicator), 'Mixed')),
  ));
  const dom = new JSDOM(`<!doctype html>${markup}`);
  const iconCases = [
    ['.muxui-checkbox-indicator[data-selected] svg', 'lucide-check', null],
    ['.muxui-checkbox-indicator[data-indeterminate] svg', 'lucide-minus', null],
    ['.muxui-search-clear svg', 'lucide-x', 'Clear search'],
    ['.muxui-number-stepper-decrement svg', 'lucide-minus', 'Decrease'],
    ['.muxui-number-stepper-increment svg', 'lucide-plus', 'Increase'],
    ['.muxui-date-trigger svg', 'muxui-icon--sm', 'Open calendar'],
    ['.muxui-calendar-previous svg', 'lucide-chevron-left', 'Previous month'],
    ['.muxui-calendar-next svg', 'lucide-chevron-right', 'Next month'],
    ['.muxui-combo-box-arrow', 'lucide-chevron-down', 'Show options'],
    ['.muxui-select-arrow', 'lucide-chevron-down', null],
    ['.muxui-tag-remove svg', 'lucide-x', 'Remove'],
    ['.muxui-tree-toggle svg', 'lucide-chevron-right', 'Toggle'],
  ];
  for (const [selector, className, label] of iconCases) {
    const icon = dom.window.document.querySelector(selector);
    assert.ok(icon, `missing icon ${className}`);
    assert.equal(icon.classList.contains(className), true);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
    if (label !== null) assert.equal(icon.closest('button')?.getAttribute('aria-label'), label);
  }
  for (const selector of ['.muxui-calendar-previous svg', '.muxui-calendar-next svg']) {
    const icon = dom.window.document.querySelector(selector);
    assert.equal(icon?.classList.contains('muxui-icon'), true);
    assert.equal(icon?.classList.contains('muxui-icon--sm'), true);
  }
  // Disclosure's trigger is named by its visible title, not an aria-label.
  const disclosureIcon = dom.window.document.querySelector('.muxui-disclosure-trigger svg');
  assert.ok(disclosureIcon, 'missing icon lucide-chevron-down');
  assert.equal(disclosureIcon.classList.contains('lucide-chevron-down'), true);
  assert.equal(disclosureIcon.getAttribute('aria-hidden'), 'true');
  assert.equal(disclosureIcon.getAttribute('focusable'), 'false');
  const disclosureTrigger = disclosureIcon.closest('button');
  assert.equal(disclosureTrigger?.getAttribute('aria-label'), null);
  assert.equal(disclosureTrigger?.textContent, 'Details');
  // CheckboxField's input is named by its wrapping label text, not an aria-label.
  for (const [state, className, label] of [['selected', 'lucide-check', 'Accept'], ['indeterminate', 'lucide-minus', 'Mixed']]) {
    const icon = dom.window.document.querySelector(`.muxui-checkbox-field[data-${state}] .muxui-checkbox-field__indicator svg`);
    assert.ok(icon, `missing icon ${className}`);
    assert.equal(icon.classList.contains(className), true);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
    const fieldLabel = icon.closest('label');
    assert.equal(fieldLabel?.textContent, label);
    const input = fieldLabel?.querySelector('input[type="checkbox"]');
    assert.ok(input);
    assert.equal(input.getAttribute('aria-label'), null);
  }
  const treeIcon = dom.window.document.querySelector('.muxui-tree-toggle svg');
  assert.equal(treeIcon?.getAttribute('fill'), 'currentColor');
  assert.equal(treeIcon?.getAttribute('stroke-width'), '0');
  const calendarIcons = dom.window.document.querySelectorAll('.muxui-date-trigger svg');
  assert.equal(calendarIcons.length, 2);
  for (const icon of calendarIcons) {
    assert.equal(icon.classList.contains('lucide-calendar'), false);
    assert.deepEqual([...icon.children].map((child) => [
      child.tagName.toLowerCase(),
      child.getAttribute('d'),
      child.getAttribute('width'),
      child.getAttribute('height'),
      child.getAttribute('x'),
      child.getAttribute('y'),
      child.getAttribute('rx'),
    ]), [
      ['path', 'M8 2v4', null, null, null, null, null],
      ['path', 'M16 2v4', null, null, null, null, null],
      ['rect', null, '18', '18', '3', '4', '2'],
      ['path', 'M3 10h18', null, null, null, null, null],
    ]);
  }
  assert.equal(dom.window.document.querySelector('.muxui-breadcrumbs svg'), null);
  assert.equal(dom.window.document.querySelector('.muxui-search-field .lucide-search'), null);
  dom.window.close();
});

// Tabs renders its overflow scroll buttons only after measuring overflow, so
// the viewport reports a scrollable extent that jsdom cannot lay out itself.
test('Tabs overflow scroll buttons render the accepted Lucide chevrons as decorative SVGs', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom, { layoutStubs: true });
  const viewportClass = 'muxui-tabs-motion-overflow-viewport';
  for (const [property, value] of [['scrollWidth', 400], ['clientWidth', 100], ['scrollHeight', 400], ['clientHeight', 100]]) {
    Object.defineProperty(dom.window.HTMLElement.prototype, property, {
      configurable: true,
      get() { return this.classList.contains(viewportClass) ? value : 0; },
    });
  }
  const items = ['One', 'Two', 'Three'].map((label) => ({ id: label.toLowerCase(), label, panel: label }));
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(React.createElement('div', null,
      React.createElement(Tabs, { 'aria-label': 'Horizontal', variant: 'overflow', items }),
      React.createElement(Tabs, { 'aria-label': 'Vertical', variant: 'overflow', orientation: 'vertical', items }))));
    const iconCases = [
      ['.muxui-tabs-motion-edge--left svg', 'lucide-chevron-left', 'Scroll tabs left'],
      ['.muxui-tabs-motion-edge--right svg', 'lucide-chevron-right', 'Scroll tabs right'],
      ['.muxui-tabs-motion-edge--before svg', 'lucide-chevron-up', 'Scroll tabs up'],
      ['.muxui-tabs-motion-edge--after svg', 'lucide-chevron-down', 'Scroll tabs down'],
    ];
    for (const [selector, className, label] of iconCases) {
      const icon = document.querySelector(selector);
      assert.ok(icon, `missing icon ${className}`);
      assert.equal(icon.classList.contains(className), true);
      assert.equal(icon.getAttribute('aria-hidden'), 'true');
      assert.equal(icon.getAttribute('focusable'), 'false');
      assert.equal(icon.closest('button')?.getAttribute('aria-label'), label);
    }
  } finally {
    await act(async () => root.unmount());
    for (const property of ['scrollWidth', 'clientWidth', 'scrollHeight', 'clientHeight']) {
      delete dom.window.HTMLElement.prototype[property];
    }
    restore();
  }
});
