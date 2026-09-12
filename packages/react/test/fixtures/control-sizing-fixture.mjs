import React from 'react';
import { Button } from '../../src/button.mjs';
import { Checkbox, ToggleButton } from '../../src/components.mjs';
import {
  ColorField,
  ComboBox,
  ListBox,
  RadioGroup,
  Select,
  Table,
  Tabs,
  Tree,
  Toolbar,
} from '../../src/collections.mjs';
import {
  Autocomplete,
  DateField,
  CheckboxGroup,
  DatePicker,
  DateRangePicker,
  NumberField,
  SearchField,
  Switch,
  TimeField,
  TextField,
} from '../../src/fields.mjs';
import {
  AlertDialog,
  CheckboxField,
  CommandPalette,
  ColorModeToggle,
  HeaderNav,
  Input,
  InputTags,
  MultiSelect,
  PaymentInput,
  RadioField,
  SwitchField,
  Sidebar,
  TagSelect,
} from '../../src/supplemental/index.mjs';

const h = React.createElement;

const cityItems = Object.freeze([
  { id: 'melbourne', label: 'Melbourne', value: 'Melbourne' },
  { id: 'sydney', label: 'Sydney', value: 'Sydney' },
]);
const multiItems = Object.freeze([
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
]);
const tagItems = Object.freeze([
  { id: 'design', label: 'Design' },
  { id: 'code', label: 'Code' },
]);

function icon() {
  return h('svg', {
    'aria-hidden': true,
    fill: 'none',
    height: 16,
    viewBox: '0 0 16 16',
    width: 16,
  }, h('path', {
    d: 'M2 8h12',
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 1.75,
  }));
}

function control(id, element, className = '') {
  return h('div', { className: `sizing-case ${className}`.trim(), 'data-control-id': id, key: id }, element);
}

function checkboxField(size) {
  return h(CheckboxField.Root, { defaultChecked: true, size },
    h(CheckboxField.Button, null,
      h(CheckboxField.Indicator, null),
      'Enable notifications'),
  );
}

function radioField(size) {
  return h(RadioGroup, { 'aria-label': 'Plans', defaultValue: 'one', size },
    h(RadioField.Root, { value: 'one' },
      h(RadioField.Button, null,
        h(RadioField.Indicator, null, h(RadioField.Dot, null)),
        'Standard')),
  );
}

function switchField(size) {
  return h(SwitchField.Root, { defaultChecked: true, size },
    h(SwitchField.Button, null,
      h(SwitchField.Thumb, null),
      'Enable updates'),
  );
}

function commandPalette(size) {
  return h(CommandPalette.Root, { size },
    h(CommandPalette.Trigger, null, `Commands ${size}`),
    h(CommandPalette.Backdrop, null,
      h(CommandPalette.Popup, { 'aria-label': `Command palette ${size}` },
        h(CommandPalette.Content, null,
          h(CommandPalette.SearchField, { variant: 'inline' },
            h(CommandPalette.Input, { 'aria-label': `Command search ${size}`, placeholder: 'Search commands' })),
          h(CommandPalette.ListBox, null,
            h(CommandPalette.Item, { id: `recent-${size}`, title: `Open recent ${size}` })),
          h(CommandPalette.Chips, null,
            h(CommandPalette.Chip, null, 'Recent', h(CommandPalette.ChipRemove, { 'aria-label': `Remove recent ${size}` })))))));
}

function alertDialogCloseCases() {
  return h('div', { className: 'control-sizing-alert-dialog-close-cases' },
    h(AlertDialog.Close, { className: 'control-sizing-alert-dialog-close-text' }, 'Cancel'),
    h(AlertDialog.Close, { className: 'control-sizing-alert-dialog-close-icon' }),
  );
}

function HydrationReadyMarker() {
  React.useEffect(() => {
    document.documentElement.setAttribute('data-control-sizing-hydrated', 'true');
  }, []);
  return null;
}

function sizedControls(size, timeFieldsMounted) {
  return [
    control('button', h(Button, { size }, 'Long action label')),
    control('icon-button', h(Button, {
      'aria-label': 'Icon action',
      className: 'muxui-icon-button',
      size,
    }, icon())),
    control('text-field', h(TextField, { defaultValue: 'Value', label: 'Name', size })),
    control('text-field-invalid', h(TextField, {
      defaultValue: 'Invalid',
      errorMessage: 'Use a public name',
      invalid: true,
      label: 'Invalid name',
      size,
    })),
    control('search-field', h(SearchField, { defaultValue: 'Mux', label: 'Search', size })),
    control('number-field', h(NumberField, { defaultValue: 2, label: 'Quantity', minValue: 0, size })),
    control('date-field', h(DateField, { defaultValue: '2026-08-26', label: 'Birthday', size })),
    // TimeField is mounted after hydration because its current SSR output is
    // not hydration-safe; browser sizing still exercises the real component.
    control('time-field', timeFieldsMounted ? h(TimeField, { defaultValue: '09:30', label: 'Time', size }) : null),
    control('date-picker', h(DatePicker, { defaultValue: '2026-08-26', label: 'Due date', size })),
    control('date-range-picker', h(DateRangePicker, {
      defaultValue: { end: '2026-09-01', start: '2026-08-26' },
      label: 'Trip dates',
      size,
    })),
    control('combo-box', h(ComboBox, {
      defaultSelectedId: 'melbourne',
      defaultValue: 'Melbourne',
      items: cityItems,
      label: 'City',
      size,
    })),
    control('select', h(Select, {
      defaultValue: 'melbourne',
      items: cityItems,
      label: 'Country',
      size,
    })),
    control('autocomplete', h(Autocomplete, {
      defaultValue: 'Mel',
      items: cityItems,
      label: 'Suggest city',
      size,
    })),
    control('command-palette', commandPalette(size)),
    control('color-field', h(ColorField, { defaultValue: '#ff0000', label: 'Color', size })),
    control('checkbox', h(Checkbox, { defaultChecked: true, size }, 'Accept terms')),
    control('checkbox-group', h(CheckboxGroup, { label: 'Notifications', size },
      h(Checkbox, { defaultChecked: true, key: 'email', value: 'email' }, 'Email'))),
    control('checkbox-group-md-child', h(CheckboxGroup, { label: 'Override', size: 'sm' },
      h(Checkbox, { defaultChecked: true, key: 'md', size: 'md', value: 'md' }, 'Medium child'))),
    control('checkbox-field', checkboxField(size)),
    control('radio-group', h(RadioGroup, {
      defaultValue: 'one',
      label: 'Plan',
      options: [{ label: 'Standard', value: 'one' }],
      size,
    })),
    control('radio-field', radioField(size)),
    control('switch', h(Switch, { defaultSelected: true, label: 'Notifications', size })),
    control('switch-field', switchField(size)),
    control('input', h(Input.Root, { size },
      h(Input.Label, null, 'Display name'),
      h(Input.Input, { placeholder: 'Mux UI' }))),
    control('input-native-size', h(Input.Root, { size },
      h(Input.Label, null, 'Native width'),
      h(Input.Input, { placeholder: 'Native', size: 8 }))),
    control('input-tags', h(InputTags.Root, { defaultValue: ['React'], label: 'Tags', size })),
    control('payment-input', h(PaymentInput.Root, { defaultValue: '4111111111111111', size },
      h(PaymentInput.Label, null, 'Card number'),
      h(PaymentInput.Group, null,
        h(PaymentInput.Input, null),
        h(PaymentInput.CardIcon, null)))),
    control('multi-select', h(MultiSelect.Root, {
      defaultSelectedKeys: ['email'],
      items: multiItems,
      label: 'Notifications',
      showFooter: false,
      showSearch: false,
      size,
    }, (item) => h(MultiSelect.Item, { id: item.id, key: item.id, textValue: item.label }, item.label))),
    control('tag-select', h(TagSelect.Root, {
      defaultSelectedKeys: ['design'],
      items: tagItems,
      label: 'Topics',
      size,
    }, tagItems.map((item) => h(TagSelect.Item, { id: item.id, key: item.id, textValue: item.label }, item.label)))),
    control('toggle-button', h(ToggleButton, { defaultSelected: true, size }, 'Pin')),
    control('tabs', h(Tabs, {
      defaultValue: 'overview',
      items: [
        { id: 'overview', label: 'Overview', panel: 'Overview content' },
        { id: 'details', label: 'Details', panel: 'Details content' },
      ],
      'aria-label': 'Sections',
      size,
    })),
  ];
}

function ClientTimeFieldRows() {
  const [timeFieldsMounted, setTimeFieldsMounted] = React.useState(false);
  React.useEffect(() => {
    setTimeFieldsMounted(true);
  }, []);
  React.useEffect(() => {
    if (timeFieldsMounted) document.documentElement.setAttribute('data-control-sizing-time-fields-mounted', 'true');
  }, [timeFieldsMounted]);
  return h('div', { className: 'sizing-grid' },
    ['sm', 'md', 'lg'].map((size) => h('section', {
      'data-size-row': size,
      key: size,
    }, h('h2', null, {
      sm: 'Small · 32px',
      md: 'Default · 36px',
      lg: 'Large · 40px',
    }[size]), sizedControls(size, timeFieldsMounted))),
  );
}

function defaults() {
  return h('section', { 'data-default-controls': true },
    control('option-default', h(ListBox, { 'aria-label': 'Options', items: [{ id: 'one', label: 'One' }] })),
    control('tree-default', h(Tree, {
      'aria-label': 'Files',
      defaultExpandedIds: ['src'],
      items: [{ children: [{ id: 'main', label: 'main.jsx' }], id: 'src', label: 'src' }],
    })),
    control('toolbar-default', h(Toolbar, { 'aria-label': 'Formatting' },
      h(Button, { key: 'bold' }, 'Bold'),
      h(Button, { key: 'italic' }, 'Italic'))),
    control('color-mode-toggle-default', h(ColorModeToggle, {
      'aria-label': 'Color mode',
      defaultMode: 'light',
      storageKey: 'muxui-control-sizing-mode',
    })),
    control('header-nav-default', h(HeaderNav.Root, null,
      h(HeaderNav.Logo, null, 'Mux'),
      h(HeaderNav.Secondary, null,
        h(HeaderNav.NavButton, { current: true, href: '/docs' }, 'Docs')))),
    control('sidebar-search-default', h(Sidebar.Root, { style: { height: 'auto' } },
      h(Sidebar.Header, null, h(Sidebar.Search, { placeholder: 'Filter' })))),
    control('sidebar-account-trigger-default', h(Sidebar.Root, { style: { height: 'auto' } },
      h(Sidebar.AccountCard, { email: 'andrew@example.com', name: 'Andrew' }))),
    control('sidebar-feature-dismiss-default', h(Sidebar.Root, { style: { height: 'auto' } },
      h(Sidebar.FeatureCard, {
        description: 'Keep your workspace tidy.',
        dismissLabel: 'Dismiss',
        onDismiss: () => {},
        title: 'Workspace tip',
      }))),
    control('table-default', h(Table, {
      'aria-label': 'Recent activity',
      columns: [
        { id: 'name', isRowHeader: true, label: 'Name' },
        { id: 'detail', label: 'Detail' },
      ],
      onRowAction: () => {},
      rows: [{ detail: 'Actionable row', id: 'one', name: 'One' }],
    })),
    control('alert-dialog-close-default', alertDialogCloseCases()),
  );
}

export function ControlSizingFixture() {
  return h('main', { id: 'control-sizing-fixture' },
    h(HydrationReadyMarker),
    h(ClientTimeFieldRows),
    defaults(),
  );
}
