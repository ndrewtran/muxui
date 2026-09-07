import React from 'react';
import {
  AlertDialog,
  Card,
  ColorModeToggle,
  CommandPalette,
  HeaderNav,
  InputTags,
  MultiSelect,
  Sidebar,
  TagSelect,
} from '../../src/supplemental/index.mjs';

const h = React.createElement;
const options = Object.freeze([
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
]);

/**
 * Small browser fixture for the supplemental React Aria families.
 * Mount the returned element with ReactDOM.createRoot in a browser harness,
 * then assert through the controls and `[data-testid]` outputs.
 */
export function SupplementalBrowserFixture() {
  const [tags, setTags] = React.useState(['React']);
  const [selected, setSelected] = React.useState(new Set());
  const [selectedTags, setSelectedTags] = React.useState(new Set());
  const [mode, setMode] = React.useState('light');
  return h('main', { 'data-muxui-supplemental-browser-fixture': true },
    h(ColorModeToggle, { defaultMode: 'light', storageKey: 'muxui-supplemental-browser-fixture-mode', onModeChange: setMode, 'aria-label': 'Color mode' }),
    h('output', { 'data-testid': 'mode' }, mode),
    h(InputTags.Root, { value: tags, onChange: setTags, label: 'Tags', placeholder: 'Add a tag' }),
    h('output', { 'data-testid': 'tags' }, tags.join('|')),
    h(MultiSelect.Root, {
      items: options,
      label: 'Options',
      selectedKeys: selected,
      showFooter: false,
      onSelectionChange: (next) => setSelected(next === 'all' ? new Set(options.map((item) => item.id)) : next),
    }, (item) => h(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    h('output', { 'data-testid': 'selected' }, [...selected].join('|')),
    h(TagSelect.Root, {
      items: options,
      label: 'Tags select',
      placeholder: 'Search tags',
      selectedKeys: selectedTags,
      onSelectionChange: setSelectedTags,
    }, (item) => h(TagSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    h('output', { 'data-testid': 'tag-selected' }, [...selectedTags].join('|')),
    h(Card.Root, { variant: 'elevated', 'data-testid': 'card-surface' },
      h(Card.Header, null, 'Surface'),
      h(Card.Body, null, 'Theme-aware card')),
    h(AlertDialog.Root, null,
      h(AlertDialog.Trigger, null, 'Delete'),
      h(AlertDialog.Backdrop, null,
        h(AlertDialog.Popup, null,
          h(AlertDialog.Content, null,
            h(AlertDialog.Title, null, 'Delete item'),
            h(AlertDialog.Close, null, 'Cancel'))))),
    h(CommandPalette.Root, null,
      h(CommandPalette.Trigger, null, 'Commands'),
      h(CommandPalette.Backdrop, null,
        h(CommandPalette.Popup, { 'aria-label': 'Command palette' },
          h(CommandPalette.Content, null,
            h(CommandPalette.Input, { 'aria-label': 'Command search' }))))),
    h(HeaderNav.Root, null,
      h(HeaderNav.Logo, null, 'Mux'),
      h(HeaderNav.MobileTrigger, null, h(HeaderNav.NavButton, { href: '/docs' }, 'Docs'))),
    h(Sidebar.Root, null,
      h(Sidebar.MobileTrigger, { logo: 'Mux' },
        h(Sidebar.NavList, null, h(Sidebar.NavItem, { href: '/docs' }, 'Docs')))),
  );
}
