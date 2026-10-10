import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { createDom, installDom } from './support/dom.mjs';
import {
  AlertDialog,
  Calendar,
  Checkbox,
  CheckboxField,
  ComboBox,
  CommandPalette,
  DatePicker,
  DateRangePicker,
  Disclosure,
  DisclosureGroup,
  HeaderNav,
  Lightbox,
  LightboxBackdrop,
  LightboxClose,
  LightboxContent,
  LightboxNext,
  LightboxPopup,
  LightboxPrevious,
  LightboxTrigger,
  MultiSelect,
  NumberField,
  PaymentInput,
  RangeCalendar,
  SearchField,
  Select,
  Sidebar,
  Tabs,
  TagGroup,
  TagSelect,
  Tree,
} from '../generated/index.mjs';
import { TextEditor } from '../generated/text-editor.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const lucideIntegrity = 'sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==';

test('Lucide stays an exact internal, tree-shakeable dependency with no public leakage', async () => {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies['lucide-react'], '1.37.0');

  const lockfile = await readFile(resolve(packageRoot, '../../pnpm-lock.yaml'), 'utf8');
  assert.match(lockfile, new RegExp(`lucide-react@1\\.37\\.0:\\n\\s+resolution: \\{integrity: ${lucideIntegrity.replaceAll('+', '\\+')}\\}`));

  // Every renderer source importing Lucide, with its exact deep icon modules.
  // This inventory is updated alongside new icons so the reproof rule can see
  // them; it is not an approval list (Decision 0011 amendment 06). Deep default
  // imports keep unbundled Node consumers off the full icon barrel.
  const expectedIconsByFile = {
    'collections.mjs': ['chevron-down', 'chevron-left', 'chevron-right', 'x'],
    'components.mjs': ['check', 'chevron-down', 'minus'],
    'fields.mjs': ['chevron-left', 'chevron-right', 'minus', 'plus', 'x'],
    'overlays.mjs': ['x'],
    'supplemental/activity.mjs': ['chevron-down', 'circle-alert', 'circle-check', 'circle-dot', 'circle-minus', 'clock'],
    'supplemental/code-block.mjs': ['check', 'code-xml', 'copy'],
    'supplemental/data-diff.mjs': ['arrow-right', 'check', 'minus', 'refresh-cw'],
    'supplemental/message.mjs': ['arrow-up-right', 'chevron-down'],
    'supplemental/prompt-composer.mjs': ['arrow-up', 'mic', 'plus', 'square', 'x'],
    'supplemental/index.mjs': ['check', 'chevron-down', 'chevrons-up-down', 'credit-card', 'external-link', 'menu', 'minus', 'panel-left', 'search', 'x'],
    'supplemental/lightbox.mjs': ['chevron-left', 'chevron-right', 'x'],
    'tabs-motion.mjs': ['chevron-down', 'chevron-left', 'chevron-right', 'chevron-up'],
    'text-editor/index.mjs': ['arrow-up', 'bold', 'check', 'chevron-left', 'chevron-right', 'image', 'italic', 'link', 'list', 'rotate-cw', 'sparkles', 'text-align-center', 'text-align-end', 'text-align-start', 'type', 'underline', 'x'],
  };
  const sourceRoot = resolve(packageRoot, 'src');
  const sourceFiles = (await readdir(sourceRoot, { recursive: true })).filter((file) => file.endsWith('.mjs') && file !== 'generate.mjs');
  const actualIconsByFile = {};
  for (const file of sourceFiles.sort()) {
    const source = await readFile(resolve(sourceRoot, file), 'utf8');
    const specifiers = [...source.matchAll(/from ['"](lucide-react[^'"]*)['"]/gu)].map(([, specifier]) => specifier);
    if (specifiers.length === 0) continue;
    for (const specifier of specifiers) assert.match(specifier, /^lucide-react\/dist\/esm\/icons\/[a-z0-9-]+\.mjs$/u, `${file} imports ${specifier}`);
    actualIconsByFile[file] = specifiers.map((specifier) => specifier.slice('lucide-react/dist/esm/icons/'.length, -'.mjs'.length)).sort();
  }
  assert.deepEqual(actualIconsByFile, expectedIconsByFile);

  const generatedRoot = resolve(packageRoot, 'generated');
  const generatedFiles = await readdir(generatedRoot);
  const publicEntry = await readFile(resolve(generatedRoot, 'index.mjs'), 'utf8');
  for (const file of generatedFiles.filter((name) => name.endsWith('.d.ts'))) {
    assert.doesNotMatch(await readFile(resolve(generatedRoot, file), 'utf8'), /lucide|\bIconProps\b|LucideProps|LucideIcon/u, file);
  }
  assert.doesNotMatch(publicEntry, /lucide-react|lucide-[a-z-]+|IconProps/u);

  const lucideManifest = JSON.parse(await readFile(resolve(packageRoot, 'node_modules/lucide-react/package.json'), 'utf8'));
  assert.equal(lucideManifest.version, '1.37.0');
  assert.equal(lucideManifest.sideEffects, false);
  const checkModule = await import('lucide-react/dist/esm/icons/check.mjs');
  assert.equal(typeof checkModule.default, 'object');
});

test('MuxUI affordances render the accepted Lucide glyph mapping as decorative SVGs', () => {
  const markup = renderToString(React.createElement('div', null,
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
  dom.window.close();
});

const r16Items = [{ id: 'react', label: 'React' }, { id: 'css', label: 'CSS' }];
const h = React.createElement;
// Each R1.6 Lucide root renders every affordance; `open` names triggers to click
// first. Expected labels come from the owning control; null marks an icon with
// no interactive ancestor, which must stay decorative beside its text.
const r16IconCases = [
  ['AlertDialog', () => h(AlertDialog.Root, { defaultOpen: true }, h(AlertDialog.Trigger, null, 'Delete'), h(AlertDialog.Backdrop, null, h(AlertDialog.Popup, null, h(AlertDialog.Content, null, h(AlertDialog.Title, null, 'Delete?'), h(AlertDialog.Close), h(AlertDialog.Actions, null, h(AlertDialog.Close, null, 'Cancel')))))), [], [
    ['lucide-x', 'Close'],
  ]],
  ['CommandPalette', () => h(CommandPalette.Root, { defaultOpen: true }, h(CommandPalette.Trigger, null, 'Commands'), h(CommandPalette.Backdrop, null, h(CommandPalette.Popup, { 'aria-label': 'Commands' }, h(CommandPalette.Close), h(CommandPalette.Content, null, h(CommandPalette.Chips, null, h(CommandPalette.Chip, null, 'Docs', h(CommandPalette.ChipRemove))), h(CommandPalette.Input, { 'aria-label': 'Search commands' }), h(CommandPalette.ListBox, null, h(CommandPalette.Item, { id: 'docs', title: 'Open docs', textValue: 'Open docs' })))))), [], [
    ['lucide-x', 'Close'],
    ['lucide-x', 'Remove chip'],
  ]],
  ['HeaderNav', () => h(HeaderNav.Root, null, h(HeaderNav.Logo, { href: '/' }, 'Mux'), h(HeaderNav.MobileTrigger, null, h(HeaderNav.NavButton, { href: '/docs' }, 'Docs'))), ['.muxui-header-nav__mobile-trigger'], [
    ['lucide-menu', 'Open navigation'],
    ['lucide-x', 'Close navigation'],
  ]],
  ['Sidebar', () => h(Sidebar.Root, null, h(Sidebar.Search), h(Sidebar.NavList, null, h(Sidebar.NavItem, { href: '/docs', items: [{ href: '/docs/a', label: 'A' }] }, 'Docs'), h(Sidebar.NavItem, { href: 'https://example.com', external: true }, 'External')), h(Sidebar.AccountCard, { name: 'Ada', email: 'ada@example.com' }), h(Sidebar.MobileTrigger, null, 'Menu')), ['.muxui-sidebar__mobile-menu-btn'], [
    ['lucide-search', null],
    ['lucide-chevron-down', 'Docs'],
    ['lucide-external-link', 'External'],
    ['lucide-chevrons-up-down', 'Account options'],
    ['lucide-menu', 'Open navigation'],
    ['lucide-x', 'Close navigation'],
  ]],
  ['MultiSelect', () => h(MultiSelect.Root, { label: 'Technologies', items: r16Items, showSearch: true, defaultSelectedKeys: new Set(['react']) }, (item) => h(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)), ['.muxui-multi-select__trigger'], [
    ['lucide-chevron-down', 'Technologies'],
    ['lucide-search', null],
  ]],
  ['PaymentInput', () => h(PaymentInput.Root, null, h(PaymentInput.Label, null, 'Card number'), h(PaymentInput.Group, null, h(PaymentInput.Input, { inputMode: 'numeric' }), h(PaymentInput.CardIcon))), [], [
    ['lucide-credit-card', null],
  ]],
  ['TagSelect', () => h(TagSelect.Root, { label: 'Tags', items: r16Items, defaultSelectedKeys: new Set(['react', 'css']) }, (item) => item.label), [], [
    ['lucide-x', 'Remove React'],
    ['lucide-x', 'Remove CSS'],
  ]],
  ['Lightbox', () => h(Lightbox, { items: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], defaultOpen: true }, h(LightboxTrigger, { itemKey: 'a' }, 'Open'), h(LightboxBackdrop, null, h(LightboxPopup, null, h(LightboxContent, { renderContent: () => 'Slide' }), h(LightboxPrevious), h(LightboxNext), h(LightboxClose)))), [], [
    ['lucide-chevron-left', 'Previous'],
    ['lucide-chevron-right', 'Next'],
    ['lucide-x', 'Close'],
  ]],
  ['TextEditor', () => h(TextEditor, { label: 'Note', toolbar: 'advanced', floating: true }), [], [
    ['lucide-bold', 'Bold'],
    ['lucide-italic', 'Italic'],
    ['lucide-underline', 'Underline'],
    ['lucide-type', 'Text color'],
    ['lucide-link', 'Insert link'],
    ['lucide-image', 'Insert image'],
    ['lucide-text-align-start', 'Align left'],
    ['lucide-text-align-center', 'Align center'],
    ['lucide-text-align-end', 'Align right'],
    ['lucide-list', 'Bullet list'],
    ['lucide-sparkles', 'Generate with AI'],
  ]],
];

function controlName(control) {
  const label = control.getAttribute('aria-label');
  if (label !== null) return label.trim();
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) return labelledBy.split(/\s+/u).map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim();
  const clone = control.cloneNode(true);
  for (const svg of clone.querySelectorAll('svg')) svg.remove();
  return clone.textContent.trim();
}

test('R1.6 Lucide roots keep icons decorative and take accessible names from the owning control', async () => {
  const { restore } = createDom('<div id="root"></div>', { layoutStubs: true });
  try {
    for (const [name, fixture, openSelectors, expected] of r16IconCases) {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () => root.render(h(fixture)));
        for (const selector of openSelectors) {
          const trigger = document.querySelector(selector);
          assert.ok(trigger, `${name} trigger ${selector}`);
          await act(async () => trigger.click());
        }
        const icons = [...document.querySelectorAll('svg.lucide')].map((svg) => {
          const control = svg.closest('button, summary, a[href], [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"]');
          assert.equal(svg.getAttribute('aria-hidden'), 'true', `${name} ${svg.getAttribute('class')} is hidden from assistive technology`);
          assert.equal(svg.hasAttribute('tabindex'), false, `${name} ${svg.getAttribute('class')} is not focusable`);
          assert.equal(svg.getAttribute('focusable'), 'false', `${name} ${svg.getAttribute('class')} opts out of legacy SVG focus`);
          return [[...svg.classList].find((className) => className.startsWith('lucide-')), control ? controlName(control) : null];
        });
        assert.deepEqual(icons, expected, `${name} icon labels`);
      } finally {
        await act(async () => root.unmount());
        // Tiptap destroys its view on a timer after unmount; let it run while the DOM exists.
        await new Promise((done) => setTimeout(done, 10));
        document.body.replaceChildren();
      }
    }
  } finally {
    restore();
  }
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
