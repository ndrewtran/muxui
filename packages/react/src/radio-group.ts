import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
import { FieldError as AriaFieldError } from 'react-aria-components';
import { AriaRadio, AriaRadioGroup } from './substrate.ts';
import { normalizeChoiceControlSize, ChoiceControlSizeContext } from './choice-context.mjs';
import { RadioGroupMotion, RadioMotionIndicator } from './radio-motion.mjs';
import { classNames, accessibleName } from './control-utils.ts';
import type { MuxUIAccessibleName } from './fields.ts';

/** One radio the group builds from its options. */
export type RadioOption = {
  /** The radio's key, which also stands in for the value when the option has none. */
  id?: string;
  /** What the group's value, change callback, and form field carry when this option is selected. */
  value: string;
  /** What the radio shows beside its indicator. Without one it shows the value. */
  label?: ReactNode;
  /** Disables this radio alone. A disabled group disables them all. */
  disabled?: boolean;
};

/**
 * The props Mux UI defines for RadioGroup. The group is named by label, aria-label, or aria-labelledby,
 * and it takes no description. Its radios come from options, or from RadioField children.
 */
export type RadioGroupOwnProps = {
  /** The visible label, which also names the group. Without one, the group needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Shown once for the whole group, only while the group is invalid, through the invalid prop or failed native, custom, or server validation. It replaces the built-in message and never makes the group invalid by itself. */
  errorMessage?: ReactNode;
  /** The radios the group builds, one per option. A non-empty options cannot be combined with children: passing both throws a TypeError. */
  options?: RadioOption[];
  /** RadioField radios, when the group does not build them from options. They cannot be combined with a non-empty options. */
  children?: ReactNode;
  /** The value of the selected radio, when the caller controls it. */
  value?: string;
  /** The value of the radio that starts selected, when the group controls itself. */
  defaultValue?: string;
  /** Called with the value of the radio each time one is selected. A disabled or read-only group does not call it. */
  onChange?: (value: string) => void;
  /** Disables the group and every radio in it. */
  disabled?: boolean;
  /** Makes the group read-only: its radios stay visible and focusable but cannot be changed. */
  readOnly?: boolean;
  /** Marks the group required, so a form with native validation does not submit while no radio is selected. */
  required?: boolean;
  /** Marks the group invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the group invalid. */
  invalid?: boolean;
  /** Whether the radios stack in a column or sit in a row. */
  orientation?: 'vertical' | 'horizontal';
  /** The control size. The radios take it from the group. */
  size?: 'sm' | 'md' | 'lg';
  /** The form field name. A named group submits the selected value under it. */
  name?: string;
};

export type RadioGroupProps = Omit<RadioGroupOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

export const RadioGroup: ForwardRefExoticComponent<RadioGroupProps & RefAttributes<HTMLDivElement>> = /*#__PURE__*/ (() => {
  const component = React.forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup({ label, errorMessage, options: suppliedOptions, children, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, orientation = 'vertical', size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'RadioGroup');
    // An omitted options is an empty list. The local keeps the name `options`, so a value that is not an array
    // fails with the message `options.map is not a function`, as it did when the empty list was a parameter default.
    const options = suppliedOptions === undefined ? [] : suppliedOptions;
    const labelId = React.useId();
    // The visible label text labels the group, so the two cannot drift apart.
    const generatedLabelledby = ariaLabel === undefined && ariaLabelledby === undefined && label !== undefined && label !== null
      ? labelId
      : undefined;
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      throw new TypeError('RadioGroup orientation must be horizontal or vertical');
    }
    if (options.length > 0 && children !== undefined && children !== null) {
      throw new TypeError('RadioGroup options and children are mutually exclusive');
    }
    const resolvedSize = normalizeChoiceControlSize(size, 'RadioGroup');
    const radioContent = options.length > 0
      ? options.map((option) => React.createElement(AriaRadio, {
        key: String(option.id ?? option.value),
        value: String(option.value ?? option.id),
        isDisabled: disabled ? disabled : option.disabled,
        className: classNames('muxui-radio-group__radio', resolvedSize === undefined || resolvedSize === 'md' ? undefined : `muxui-radio-group__radio--${resolvedSize}`),
        // React Aria's overloads take a render function as the children prop, not as a third argument.
        children: (renderProps) => React.createElement(React.Fragment, null,
          React.createElement(RadioMotionIndicator, { renderProps }),
          option.label ?? option.value),
      }))
      : children;
    const group = React.createElement(AriaRadioGroup, {
      ref,
      name,
      value,
      defaultValue,
      onChange: (next) => { if (!disabled && !readOnly) onChange?.(next); },
      isDisabled: disabled,
      isReadOnly: readOnly,
      isRequired: required,
      isInvalid: invalid ? invalid : undefined,
      orientation,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby ?? generatedLabelledby,
      // The data-* hooks the styles read are not props React Aria types, and TypeScript accepts such a key in a call only from a spread.
      ...{ 'data-muxui-state-orientation': orientation, 'data-muxui-size': resolvedSize },
      className: classNames('muxui-radio-group', className),
    }, radioContent,
    // Inside the group, so RAC wires it into the group's aria-describedby and shows it only while the group is invalid.
    // It is always mounted: without errorMessage it shows the server or browser validation message, as CheckboxGroup does.
    React.createElement(AriaFieldError, { className: 'muxui-field-error muxui-radio-group__error' }, errorMessage));
    const motionGroup = React.createElement(RadioGroupMotion, { rootRef: ref, children: group });
    const content = label === undefined
      ? motionGroup
      : React.createElement('div', { className: 'muxui-radio-group__field', ...{ 'data-muxui-state-disabled': disabled ? disabled : undefined, 'data-muxui-state-invalid': invalid ? invalid : undefined } },
        React.createElement('span', { id: generatedLabelledby, className: 'muxui-field-label' }, label),
        motionGroup);
    return React.createElement(ChoiceControlSizeContext.Provider, { value: resolvedSize }, content);
  });
  component.displayName = 'RadioGroup';
  return component;
})();
