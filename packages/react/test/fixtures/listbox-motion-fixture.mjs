import React from 'react';
import { ListBox } from '../../src/collections.mjs';

const h = React.createElement;

const singleItems = [
  { id: 'one', label: 'One' },
  { id: 'two', label: 'Two' },
  { id: 'three', label: 'Three' },
];

const multiItems = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
];

const scrollItems = Array.from({ length: 9 }, (_, index) => ({ id: `scroll-${index}`, label: `Scroll ${index}` }));

export function ListBoxMotionFixture() {
  const [single, setSingle] = React.useState(['one']);
  const [multiple, setMultiple] = React.useState(['alpha', 'gamma']);
  const [dynamic, setDynamic] = React.useState(['one']);
  const [dynamicItems, setDynamicItems] = React.useState(singleItems);
  const [dynamicMode, setDynamicMode] = React.useState('single');
  const [uncontrolled, setUncontrolled] = React.useState([]);
  const [scrollSelection, setScrollSelection] = React.useState(['scroll-0']);

  React.useEffect(() => {
    document.documentElement.dataset.listBoxMotionHydrated = 'true';
    window.__listBoxSetSingle = (id) => setSingle([id]);
    window.__listBoxSetMultiple = (ids) => setMultiple(ids);
    window.__listBoxSetDynamic = (ids) => setDynamic(ids);
    window.__listBoxSetDynamicItems = (items) => setDynamicItems(items);
    window.__listBoxSetDynamicMode = (mode) => setDynamicMode(mode);
    window.__listBoxClearSingle = () => setSingle([]);
    window.__listBoxSetScroll = (id) => setScrollSelection([id]);
    window.__listBoxUncontrolledSelection = () => setUncontrolled((ids) => ids);
    return () => {
      delete document.documentElement.dataset.listBoxMotionHydrated;
      delete window.__listBoxSetSingle;
      delete window.__listBoxSetMultiple;
      delete window.__listBoxSetDynamic;
      delete window.__listBoxSetDynamicItems;
      delete window.__listBoxSetDynamicMode;
      delete window.__listBoxClearSingle;
      delete window.__listBoxSetScroll;
      delete window.__listBoxUncontrolledSelection;
    };
  }, []);

  return h('main', { id: 'listbox-motion-fixture' },
    h('section', { id: 'single-section', 'aria-label': 'Single selection' },
      h(ListBox, {
        id: 'single-list',
        'aria-label': 'Single list',
        items: singleItems,
        selectedIds: single,
        onSelectionChange: setSingle,
      }),
      h('output', { id: 'single-value' }, single.join(','))),
    h('section', { id: 'multiple-section', 'aria-label': 'Multiple selection' },
      h(ListBox, {
        id: 'multiple-list',
        'aria-label': 'Multiple list',
        items: multiItems,
        selectionMode: 'multiple',
        selectedIds: multiple,
        onSelectionChange: setMultiple,
      }),
      h('output', { id: 'multiple-value' }, multiple.join(','))),
    h('section', { id: 'uncontrolled-section', 'aria-label': 'Uncontrolled selection' },
      h(ListBox, {
        id: 'uncontrolled-list',
        'aria-label': 'Uncontrolled list',
        items: singleItems,
        defaultSelectedIds: ['one'],
        onSelectionChange: (ids) => setUncontrolled(ids),
      }),
      h('output', { id: 'uncontrolled-value' }, uncontrolled.join(','))),
    h('section', { id: 'empty-uncontrolled-section', 'aria-label': 'Empty initial selection' },
      h(ListBox, {
        id: 'empty-uncontrolled-list',
        'aria-label': 'Empty initial list',
        items: singleItems,
      })),
    h('section', { id: 'dynamic-section', 'aria-label': 'Dynamic selection' },
      h(ListBox, {
        id: 'dynamic-list',
        'aria-label': 'Dynamic list',
        items: dynamicItems,
        selectionMode: dynamicMode,
        selectedIds: dynamic,
        onSelectionChange: setDynamic,
      }),
      h('output', { id: 'dynamic-value' }, dynamic.join(','))),
    h('section', { id: 'compound-section', 'aria-label': 'Compound collection' },
      h(ListBox, { id: 'compound-list', 'aria-label': 'Compound list', layout: 'grid', orientation: 'horizontal', selectedIds: ['section-two'] },
        h(ListBox.Section, { title: 'First section' },
          h(ListBox.Item, { id: 'section-one', textValue: 'Section one' }, h('strong', null, 'Section one'))),
        h(ListBox.Section, { title: 'Second section' },
          h(ListBox.Item, { id: 'section-two', textValue: 'Section two' }, h('strong', null, 'Section two'))))),
    h('section', { id: 'scroll-section', 'aria-label': 'Scrollable collection' },
      h(ListBox, {
        id: 'scroll-list',
        'aria-label': 'Scrollable list',
        items: scrollItems,
        selectedIds: scrollSelection,
        onSelectionChange: setScrollSelection,
        style: { height: '120px', width: '180px' },
      })),
    h('section', { id: 'disabled-section', 'aria-label': 'Disabled collection' },
      h(ListBox, {
        id: 'disabled-list',
        'aria-label': 'Disabled list',
        disabled: true,
        selectedIds: ['one'],
        items: singleItems,
      })),
    h('section', { id: 'none-section', 'aria-label': 'No selection collection' },
      h(ListBox, {
        id: 'none-list',
        'aria-label': 'No selection list',
        selectionMode: 'none',
        items: singleItems,
      })),
  );
}
