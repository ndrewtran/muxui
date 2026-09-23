import React from 'react';
import { ToggleButton } from '../../src/components.mjs';
import { ToggleButtonGroup as ToggleButtonGroupCollection } from '../../src/collections.mjs';

const h = React.createElement;

const choices = [
  { id: 'one', label: 'One' },
  { id: 'long', label: 'Longer selection' },
  { id: 'two', label: 'Two' },
];

function buttons(items = choices) {
  return items.map((item) => h(ToggleButton, { key: item.id, id: item.id }, item.label));
}

export function ToggleButtonGroupMotionFixture() {
  const [primary, setPrimary] = React.useState(['one']);
  const [vertical, setVertical] = React.useState(['one']);
  const [multiple, setMultiple] = React.useState(['one', 'two']);
  const [required, setRequired] = React.useState(['one']);

  React.useEffect(() => {
    document.documentElement.dataset.toggleButtonGroupMotionHydrated = 'true';
    window.__toggleSetPrimary = (id) => setPrimary(id ? [id] : []);
    window.__toggleSetVertical = (id) => setVertical(id ? [id] : []);
    window.__toggleSetMultiple = (ids) => setMultiple(ids);
    window.__toggleClearPrimary = () => setPrimary([]);
    return () => {
      delete document.documentElement.dataset.toggleButtonGroupMotionHydrated;
      delete window.__toggleSetPrimary;
      delete window.__toggleSetVertical;
      delete window.__toggleSetMultiple;
      delete window.__toggleClearPrimary;
    };
  }, []);

  return h('main', { id: 'toggle-button-group-motion-fixture' },
    h('section', { id: 'primary-section', 'aria-label': 'Single selection' },
      h(ToggleButtonGroupCollection, {
        id: 'primary-toggle',
        'aria-label': 'Primary choices',
        selectedIds: primary,
        onSelectionChange: setPrimary,
      }, buttons()),
      h('output', { id: 'primary-value' }, primary.join(','))),
    h('section', { id: 'vertical-section', 'aria-label': 'Vertical selection' },
      h(ToggleButtonGroupCollection, {
        id: 'vertical-toggle',
        'aria-label': 'Vertical choices',
        orientation: 'vertical',
        selectedIds: vertical,
        onSelectionChange: setVertical,
      }, buttons())),
    h('section', { id: 'rtl-section', dir: 'rtl', 'aria-label': 'Right to left selection' },
      h(ToggleButtonGroupCollection, {
        id: 'rtl-toggle',
        'aria-label': 'Right to left choices',
        selectedIds: primary,
        onSelectionChange: setPrimary,
      }, buttons())),
    h('section', { id: 'multiple-section', 'aria-label': 'Multiple selection' },
      h(ToggleButtonGroupCollection, {
        id: 'multiple-toggle',
        'aria-label': 'Multiple choices',
        selectionMode: 'multiple',
        selectedIds: multiple,
        onSelectionChange: setMultiple,
      }, buttons())),
    h('section', { id: 'required-section', 'aria-label': 'Required selection' },
      h(ToggleButtonGroupCollection, {
        id: 'required-toggle',
        'aria-label': 'Required choices',
        selectedIds: required,
        disallowEmptySelection: true,
        onSelectionChange: setRequired,
      }, buttons())),
    h('section', { id: 'disabled-section', 'aria-label': 'Disabled selection' },
      h(ToggleButtonGroupCollection, {
        id: 'disabled-toggle',
        'aria-label': 'Disabled choices',
        selectedIds: ['one'],
        disabled: true,
      }, buttons())),
    h('section', { id: 'disabled-child-section', 'aria-label': 'Disabled selected child' },
      h(ToggleButtonGroupCollection, {
        id: 'disabled-child-toggle',
        'aria-label': 'Disabled selected child choices',
        selectedIds: ['one'],
      }, h(ToggleButton, { id: 'one', disabled: true }, 'One'),
      h(ToggleButton, { id: 'long' }, 'Longer selection'),
      h(ToggleButton, { id: 'two' }, 'Two'))),
  );
}
