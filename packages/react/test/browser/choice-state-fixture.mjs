import React from 'react';
import { I18nProvider } from 'react-aria-components';
import { Checkbox } from '../../src/components.ts';
import { CheckboxGroup, DateField, DatePicker, DateRangePicker, Switch, TextField, TimeField } from '../../src/fields.ts';
import { RadioGroup } from '../../src/radio-group.ts';
import { Select } from '../../src/select.ts';
import { CheckboxField } from '../../src/supplemental/checkbox-field.ts';
import { Input } from '../../src/supplemental/input.ts';
import { PaymentInput } from '../../src/supplemental/payment-input.ts';
import { RadioField } from '../../src/supplemental/radio-field.ts';
import { SwitchField } from '../../src/supplemental/switch-field.ts';
import { TextArea } from '../../src/supplemental/text-area.ts';

// Pages for choice-native-state.test.mjs. The same module renders the server markup in node and
// hydrates it in the page.

const h = React.createElement;

/** Wraps a control in the element the test finds it by. */
const probe = (name, control) => h('span', { key: name, 'data-probe': name }, control);

/**
 * Each choice control once unselected and once selected, valid and invalid, each in a
 * `[data-probe="<kind>-<off|on>[-invalid]"]`, and each switch disabled, in `[data-probe="<kind>-disabled-<off|on>"]`. The groups hold a selected first option and an
 * unselected second, in `[data-probe="<kind>[-invalid]"]`.
 */
export function ChoiceControls() {
  const controls = [];
  for (const invalid of [false, true]) {
    const suffix = invalid ? '-invalid' : '';
    for (const on of [false, true]) {
      const state = `${on ? 'on' : 'off'}${suffix}`;
      controls.push(
        probe(`checkbox-${state}`, h(Checkbox, { name: `checkbox-${state}`, defaultChecked: on, invalid }, 'Checkbox')),
        probe(`switch-${state}`, h(Switch, { label: 'Switch', name: `switch-${state}`, defaultSelected: on, invalid })),
        probe(`checkbox-field-${state}`, h(CheckboxField.Root, { name: `checkbox-field-${state}`, defaultChecked: on, invalid },
          h(CheckboxField.Button, null, h(CheckboxField.Indicator), 'CheckboxField'))),
        probe(`switch-field-${state}`, h(SwitchField.Root, { name: `switch-field-${state}`, defaultChecked: on, invalid },
          h(SwitchField.Button, null, h(SwitchField.Thumb), 'SwitchField'))),
      );
    }
    controls.push(
      probe(`checkbox-group${suffix}`, h(CheckboxGroup, { label: 'Group', name: `checkbox-group${suffix}`, defaultValue: ['a'], invalid },
        h(Checkbox, { value: 'a' }, 'A'),
        h(Checkbox, { value: 'b' }, 'B'))),
      probe(`radio-group${suffix}`, h(RadioGroup, { label: 'Radio', name: `radio-group${suffix}`, defaultValue: 'a', invalid,
        options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })),
      probe(`radio-field${suffix}`, h(RadioGroup, { label: 'RadioField', name: `radio-field${suffix}`, defaultValue: 'a', invalid },
        ...['a', 'b'].map((value) => h(RadioField.Root, { key: value, value },
          h(RadioField.Button, null, h(RadioField.Indicator, null, h(RadioField.Dot)), value.toUpperCase()))))),
    );
  }
  // Disabled switches last, so the keyboard subtests' tab order through the first row is unchanged.
  for (const on of [false, true]) {
    const state = `disabled-${on ? 'on' : 'off'}`;
    controls.push(
      probe(`switch-${state}`, h(Switch, { label: 'Switch', name: `switch-${state}`, defaultSelected: on, disabled: true })),
      probe(`switch-field-${state}`, h(SwitchField.Root, { name: `switch-field-${state}`, defaultChecked: on, disabled: true },
        h(SwitchField.Button, null, h(SwitchField.Thumb), 'SwitchField'))),
    );
  }
  return h('form', { id: 'controls' }, controls);
}

/** A required box of each kind in a form the test submits empty, then ticks. */
export function RequiredChoices() {
  return h('form', { id: 'required', onSubmit: (event) => event.preventDefault() },
    probe('required-checkbox', h(Checkbox, { name: 'checkbox', required: true }, 'Checkbox')),
    probe('required-switch', h(Switch, { label: 'Switch', name: 'switch', required: true })),
    probe('required-checkbox-field', h(CheckboxField.Root, { name: 'checkbox-field', required: true },
      h(CheckboxField.Button, null, h(CheckboxField.Indicator), 'CheckboxField'),
      h(CheckboxField.Error, null, 'Tick this box.'))),
    probe('required-switch-field', h(SwitchField.Root, { name: 'switch-field', required: true },
      h(SwitchField.Button, null, h(SwitchField.Thumb), 'SwitchField'),
      h(SwitchField.Error, null, 'Turn this on.'))),
    h('button', { type: 'submit', id: 'required-submit' }, 'Submit'));
}

/** Each field with an error part, the control its error describes, and the error's class. */
export const errorFields = {
  Input: { control: '.muxui-input', error: '.muxui-input__error', render: (error) => h(Input.Root, { invalid: true }, h(Input.Label, null, 'Name'), h(Input.Input), error && h(Input.Error, null, error)) },
  TextArea: { control: '.muxui-text-area__textarea', error: '.muxui-text-area__error', render: (error) => h(TextArea.Root, { invalid: true }, h(TextArea.Label, null, 'Bio'), h(TextArea.TextArea), error && h(TextArea.Error, null, error)) },
  PaymentInput: { control: '.muxui-payment-input__input', error: '.muxui-payment-input__error', render: (error) => h(PaymentInput.Root, { invalid: true }, h(PaymentInput.Label, null, 'Card'), h(PaymentInput.Input), error && h(PaymentInput.Error, null, error)) },
  CheckboxField: { control: '.muxui-checkbox-field input', error: '.muxui-checkbox-field__error', render: (error) => h(CheckboxField.Root, { invalid: true }, h(CheckboxField.Button, null, h(CheckboxField.Indicator), 'Agree'), error && h(CheckboxField.Error, null, error)) },
  SwitchField: { control: '.muxui-switch-field input', error: '.muxui-switch-field__error', render: (error) => h(SwitchField.Root, { invalid: true }, h(SwitchField.Button, null, h(SwitchField.Thumb), 'Alerts'), error && h(SwitchField.Error, null, error)) },
  Select: { control: '.muxui-select__trigger', error: '.muxui-select__error', render: (error) => h(Select, { label: 'Colour', invalid: true, items: [{ id: 'red', label: 'Red' }], errorMessage: error ?? undefined }) },
  TextField: { control: '.muxui-field-input', error: '.muxui-field-error', render: (error) => h(TextField, { label: 'Title', invalid: true, errorMessage: error ?? undefined }) },
  // A date or time field's error describes its group and each segment, where assistive technology lands; a picker's
  // date field is presentation, so its group and segments. A fixed 24-hour locale keeps server and browser segments the same (en-US puts a space before AM that Node and Chromium write differently).
  DateField: { control: '[role="group"], [role="spinbutton"]', error: '.muxui-field-error', render: (error) => h(I18nProvider, { locale: 'en-GB' }, h(DateField, { label: 'Due', invalid: true, errorMessage: error ?? undefined })) },
  TimeField: { control: '[role="group"], [role="spinbutton"]', error: '.muxui-field-error', render: (error) => h(I18nProvider, { locale: 'en-GB' }, h(TimeField, { label: 'At', invalid: true, errorMessage: error ?? undefined })) },
  DatePicker: { control: '[role="group"], [role="spinbutton"]', error: '.muxui-field-error', render: (error) => h(I18nProvider, { locale: 'en-GB' }, h(DatePicker, { label: 'Day', invalid: true, errorMessage: error ?? undefined })) },
  DateRangePicker: { control: '[role="group"], [role="spinbutton"]', error: '.muxui-field-error', render: (error) => h(I18nProvider, { locale: 'en-GB' }, h(DateRangePicker, { label: 'Stay', invalid: true, errorMessage: error ?? undefined })) },
};

/** The error fields whose control React Aria describes from inside its root, which can take a removed error back out. */
export const removableErrorFields = ['Input', 'TextArea', 'PaymentInput', 'CheckboxField', 'SwitchField', 'Select', 'TextField'];

/** Every error field, each in its own section, showing its error once window.__showErrors() runs. */
export function LateErrors() {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    window.__showErrors = (next = true) => setShown(next);
  }, []);
  return h('div', null, Object.entries(errorFields).map(([name, field]) => h('section', { key: name, id: `late-${name}` }, field.render(shown ? `${name} needs a fix.` : null))));
}

/** A small Checkbox and CheckboxField, unticked, each in a `[data-probe="<kind>-sm"]`. */
export function SmallChoices() {
  return h('form', { id: 'small' },
    probe('checkbox-sm', h(Checkbox, { name: 'checkbox-sm', size: 'sm' }, 'Checkbox')),
    probe('checkbox-field-sm', h(CheckboxField.Root, { name: 'checkbox-field-sm', size: 'sm' },
      h(CheckboxField.Button, null, h(CheckboxField.Indicator), 'CheckboxField'))));
}

/** The removable error fields, each showing its error from the first render until window.__showInitialErrors(false) runs. */
export function InitialErrors() {
  const [shown, setShown] = React.useState(true);
  React.useEffect(() => {
    window.__showInitialErrors = (next = true) => setShown(next);
  }, []);
  return h('div', null, removableErrorFields.map((name) => h('section', { key: name, id: `initial-${name}` }, errorFields[name].render(shown ? `${name} needs a fix.` : null))));
}

export function Page() {
  return h('main', null, h(ChoiceControls), h(RequiredChoices), h(LateErrors), h(InitialErrors), h(SmallChoices));
}
