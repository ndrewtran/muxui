import React from 'react';
import {
  Autocomplete,
  DateField,
  DatePicker,
  DateRangePicker,
  NumberField,
  SearchField,
  TextField,
  TimeField,
} from '../../src/fields.mjs';
import {
  ColorField,
  ComboBox,
  Select,
  TokenField,
} from '../../src/collections.mjs';
import {
  Input,
  InputTags,
  MultiSelect,
  PaymentInput,
  TagSelect,
  TextArea,
} from '../../src/supplemental/index.mjs';
import { SelectNative } from '../../src/supplemental/select-native.mjs';

const h = React.createElement;
const items = Object.freeze([
  { id: 'one', label: 'One', textValue: 'One' },
  { id: 'two', label: 'Two', textValue: 'Two' },
]);

function FocusAnchor({ id }) {
  return h('button', {
    type: 'button',
    tabIndex: 0,
    'data-focus-anchor': id,
    'aria-hidden': 'true',
    style: { position: 'absolute', inlineSize: '1px', blockSize: '1px', opacity: 0 },
  });
}

function familyProps(state, testId) {
  return {
    'data-testid': `${testId}-${state}`,
    ...(state === 'invalid' ? { invalid: true } : {}),
    ...(state === 'disabled' ? { disabled: true } : {}),
  };
}

function CoreFields({ state }) {
  const props = (testId) => familyProps(state, testId);
  const autocompleteProps = props('autocomplete');
  delete autocompleteProps['data-testid'];
  const tokenProps = props('token');
  delete tokenProps['data-testid'];
  return h(React.Fragment, null,
    h(FocusAnchor, { id: `text-${state}` }),
    h(TextField, { ...props('text'), label: 'Text', value: 'alpha', onChange: () => {} }),
    h(FocusAnchor, { id: `search-${state}` }),
    h(SearchField, { ...props('search'), label: 'Search', defaultValue: 'alpha' }),
    h(FocusAnchor, { id: `number-${state}` }),
    h(NumberField, { ...props('number'), label: 'Number', defaultValue: 2 }),
    h(FocusAnchor, { id: `date-${state}` }),
    h(DateField, { ...props('date'), label: 'Date' }),
    h(FocusAnchor, { id: `time-${state}` }),
    h(TimeField, { ...props('time'), label: 'Time' }),
    h(FocusAnchor, { id: `date-picker-${state}` }),
    h(DatePicker, { ...props('date-picker'), label: 'Date picker' }),
    h(FocusAnchor, { id: `date-range-${state}` }),
    h(DateRangePicker, { ...props('date-range'), label: 'Date range' }),
    h(FocusAnchor, { id: `autocomplete-${state}` }),
    h('div', { 'data-testid': `autocomplete-${state}` }, h(Autocomplete, { ...autocompleteProps, label: 'Autocomplete', items, defaultValue: '' })),
    h(FocusAnchor, { id: `color-${state}` }),
    h(ColorField, { ...props('color'), label: 'Color', defaultValue: '#ff0000' }),
    h(FocusAnchor, { id: `combo-${state}` }),
    h(ComboBox, { ...props('combo'), label: 'Combo', items, defaultValue: '' }),
    h(FocusAnchor, { id: `select-${state}` }),
    h(Select, { ...props('select'), label: 'Select', items, defaultValue: 'one' }),
    ...(state === 'invalid' ? [] : [
      h(FocusAnchor, { id: `token-${state}`, key: `token-anchor-${state}` }),
      h('div', { 'data-testid': `token-${state}` }, h(TokenField, { ...tokenProps, label: 'Token', defaultValue: ['alpha'] })),
    ]),
  );
}

function SupplementalFields({ state }) {
  const props = (testId) => familyProps(state, testId);
  return h(React.Fragment, null,
    h(FocusAnchor, { id: `input-${state}` }),
    h(Input.Root, { ...props('input') }, h(Input.Label, null, 'Input'), h(Input.Input, { value: 'alpha', onChange: () => {} })),
    h(FocusAnchor, { id: `textarea-${state}` }),
    h(TextArea.Root, { ...props('textarea') }, h(TextArea.Label, null, 'Text area'), h(TextArea.TextArea, { value: 'alpha', onChange: () => {} })),
    h(FocusAnchor, { id: `input-tags-${state}` }),
    h(InputTags.Root, { ...props('input-tags'), label: 'Input tags', defaultValue: ['alpha'] }),
    h(FocusAnchor, { id: `multi-select-${state}` }),
    h(MultiSelect.Root, { ...props('multi-select'), label: 'Multi select', items, showFooter: false }, (item) => h(MultiSelect.Item, { id: item.id, textValue: item.textValue }, item.label)),
    h(FocusAnchor, { id: `payment-${state}` }),
    h(PaymentInput.Root, { ...props('payment') },
      h(PaymentInput.Label, null, 'Payment input'),
      h(PaymentInput.Group, null, h(PaymentInput.Input, null), h(PaymentInput.CardIcon, null))),
    h(FocusAnchor, { id: `tag-select-${state}` }),
    h(TagSelect.Root, { ...props('tag-select'), label: 'Tag select', items }, (item) => h(TagSelect.Item, { id: item.id, textValue: item.textValue }, item.label)),
    h(FocusAnchor, { id: `select-native-${state}` }),
    h('div', { 'data-testid': `select-native-${state}` }, h(SelectNative, { ...props('select-native'), label: 'Native select' }, h('option', { value: 'one' }, 'One'), h('option', { value: 'two' }, 'Two'))),
  );
}

function ReadOnlyFields() {
  return h(React.Fragment, null,
    h(FocusAnchor, { id: 'readonly-text' }),
    h(TextField, { 'data-testid': 'text-readonly', label: 'Read only text', value: 'alpha', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-search' }),
    h(SearchField, { 'data-testid': 'search-readonly', label: 'Read only search', defaultValue: 'alpha', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-number' }),
    h(NumberField, { 'data-testid': 'number-readonly', label: 'Read only number', defaultValue: 2, readOnly: true }),
    h(FocusAnchor, { id: 'readonly-date' }),
    h(DateField, { 'data-testid': 'date-readonly', label: 'Read only date', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-time' }),
    h(TimeField, { 'data-testid': 'time-readonly', label: 'Read only time', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-date-picker' }),
    h(DatePicker, { 'data-testid': 'date-picker-readonly', label: 'Read only date picker', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-date-range' }),
    h(DateRangePicker, { 'data-testid': 'date-range-readonly', label: 'Read only date range', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-color' }),
    h(ColorField, { 'data-testid': 'color-readonly', label: 'Read only color', defaultValue: '#ff0000', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-combo' }),
    h(ComboBox, { 'data-testid': 'combo-readonly', label: 'Read only combo', items, readOnly: true }),
    h(FocusAnchor, { id: 'readonly-select' }),
    h(Select, { 'data-testid': 'select-readonly', label: 'Read only select', items, defaultValue: 'one', readOnly: true }),
    h(FocusAnchor, { id: 'readonly-autocomplete' }),
    h('div', { 'data-testid': 'autocomplete-readonly' }, h(Autocomplete, { label: 'Read only autocomplete', items, readOnly: true })),
    h(FocusAnchor, { id: 'readonly-token' }),
    h('div', { 'data-testid': 'token-readonly' }, h(TokenField, { label: 'Read only token', defaultValue: ['alpha'], readOnly: true })),
    h(FocusAnchor, { id: 'readonly-input' }),
    h(Input.Root, { 'data-testid': 'input-readonly', readOnly: true }, h(Input.Label, null, 'Read only input'), h(Input.Input, { value: 'alpha' })),
    h(FocusAnchor, { id: 'readonly-textarea' }),
    h(TextArea.Root, { 'data-testid': 'textarea-readonly', readOnly: true }, h(TextArea.Label, null, 'Read only text area'), h(TextArea.TextArea, { value: 'alpha' })),
    h(FocusAnchor, { id: 'readonly-payment' }),
    h(PaymentInput.Root, { 'data-testid': 'payment-readonly', readOnly: true },
      h(PaymentInput.Label, null, 'Read only payment'),
      h(PaymentInput.Group, null, h(PaymentInput.Input, null), h(PaymentInput.CardIcon, null))),
  );
}

function DisabledInvalidFields() {
  return h('section', { 'data-state-group': 'disabled-invalid' },
    h('h2', null, 'Disabled and invalid'),
    h(TextField, {
      'data-testid': 'text-disabled-invalid',
      label: 'Text disabled and invalid',
      value: 'alpha',
      onChange: () => {},
      disabled: true,
      invalid: true,
    }),
    h(ColorField, {
      'data-testid': 'color-disabled-invalid',
      label: 'Color disabled and invalid',
      defaultValue: '#ff0000',
      disabled: true,
      invalid: true,
    }),
  );
}

export function FieldStatesBrowserFixture() {
  return h('main', { 'data-muxui-field-states-fixture': true },
    h('h1', null, 'Field states'),
    h('section', { 'data-state-group': 'normal' }, h('h2', null, 'Normal'), h(CoreFields, { state: 'normal' }), h(SupplementalFields, { state: 'normal' })),
    h('section', { 'data-state-group': 'invalid' }, h('h2', null, 'Invalid'), h(CoreFields, { state: 'invalid' }), h(SupplementalFields, { state: 'invalid' })),
    h('section', { 'data-state-group': 'disabled' }, h('h2', null, 'Disabled'), h(CoreFields, { state: 'disabled' }), h(SupplementalFields, { state: 'disabled' })),
    h('section', { 'data-state-group': 'readonly' }, h('h2', null, 'Read only'), h(ReadOnlyFields)),
    h(DisabledInvalidFields),
  );
}
