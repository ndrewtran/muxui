import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, LabelHTMLAttributes, RefAttributes } from 'react';
import { FieldError as AriaFieldError } from 'react-aria-components';
import { AriaSwitchField, AriaSwitchButton } from '../substrate.ts';
import type { SwitchButtonProps as AriaSwitchButtonProps, SwitchFieldProps as AriaSwitchFieldProps } from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.ts';

/**
 * The props Mux UI defines for SwitchField.Root, the compound's root; the catalog's web.react
 * API is derived from this type (Decision 0031). The members every field shares are written out,
 * because the catalog's grammar reads only the members a type lists itself.
 */
type SwitchFieldOwnProps = {
  /** Whether the switch is on, when the caller controls it. */
  checked?: boolean;
  /** Whether the switch starts on, when the field controls itself. */
  defaultChecked?: boolean;
  /** Called with the new on state. */
  onChange?: (checked: boolean) => void;
  /** The name the switch submits under in a form. */
  name?: string;
  /** The value the switch submits while it is on. */
  value?: string;
  /** Marks the field disabled. */
  disabled?: boolean;
  /** Marks the field invalid. */
  invalid?: boolean;
  /** Marks the field required. */
  required?: boolean;
  /** Marks the field read-only. */
  readOnly?: boolean;
  /** The field's size. */
  size?: 'sm' | 'md' | 'lg';
};

/** The props Mux UI defines for SwitchField.Button; its API is the button entry in the catalog's partApis. */
type SwitchFieldButtonOwnProps = {
  /** Marks the switch disabled, whatever its field says. */
  disabled?: boolean;
};

export type SwitchFieldRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & SwitchFieldOwnProps;
export type SwitchFieldButtonProps = LabelHTMLAttributes<HTMLLabelElement> & SwitchFieldButtonOwnProps;
export type SwitchFieldThumbProps = PartProps<HTMLSpanElement>;
export type SwitchFieldDescriptionProps = PartProps<HTMLElement>;
export type SwitchFieldErrorProps = PartProps<HTMLElement>;

function makeSwitchField() {
  const Root = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SwitchFieldRootProps>(function SwitchFieldRoot({ checked, defaultChecked, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'SwitchField');
    // React Aria's props type the handlers on Element, and these on the div; the rest is the div's native attributes.
    return h(AriaSwitchField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...(props as AriaSwitchFieldProps) }), ref, isSelected: checked, defaultSelected: defaultChecked, onChange, name, value, ...{ 'data-muxui-size': resolvedSize }, className: cx('muxui-switch-field', className) });
  });
  const Button = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, SwitchFieldButtonProps>(function SwitchFieldButton({ disabled, className, ...props }, ref) {
    return h(AriaSwitchButton, { ...(props as AriaSwitchButtonProps), ref, ...{ isDisabled: disabled }, className: cx('muxui-switch-field__button', className) });
  });
  const Thumb = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, SwitchFieldThumbProps>(function SwitchFieldThumb(props, ref) { return nativePart('span', 'muxui-switch-field__thumb', props, ref); });
  const Description = /*#__PURE__*/ React.forwardRef<HTMLElement, SwitchFieldDescriptionProps>(function SwitchFieldDescription(props, ref) { return fieldText('description', 'muxui-switch-field__description', props, ref); });
  const Error = /*#__PURE__*/ React.forwardRef<HTMLElement, SwitchFieldErrorProps>(function SwitchFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-switch-field__error', props.className) }); });
  return /*#__PURE__*/ Object.freeze({ Root, Button, Thumb, Description, Error });
}

export const SwitchField: {
  Root: ForwardRefExoticComponent<SwitchFieldRootProps & RefAttributes<HTMLDivElement>>;
  Button: ForwardRefExoticComponent<SwitchFieldButtonProps & RefAttributes<HTMLLabelElement>>;
  Thumb: ForwardRefExoticComponent<SwitchFieldThumbProps & RefAttributes<HTMLSpanElement>>;
  Description: ForwardRefExoticComponent<SwitchFieldDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<SwitchFieldErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ makeSwitchField();
