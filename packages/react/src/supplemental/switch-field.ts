import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, LabelHTMLAttributes, RefAttributes } from 'react';
import { AriaSwitchField, AriaSwitchButton } from '../substrate.ts';
import type { SwitchButtonProps as AriaSwitchButtonProps, SwitchButtonRenderProps, SwitchFieldProps as AriaSwitchFieldProps } from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { SwitchMotionIndicator } from '../switch-motion.ts';
import { h, cx } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.ts';
import { fieldError } from '../field-error.ts';

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

// The state Button reads from React Aria, for Thumb to follow.
const SwitchFieldThumbContext = React.createContext<SwitchButtonRenderProps | null>(null);

// SwitchField draws Switch's switch: Button and Thumb carry Switch's `muxui-switch` and `muxui-switch__indicator` classes beside
// their own, and Thumb is Switch's motion indicator, so the stylesheet block and the motion that make a Switch also make this one.
// Description and Error carry the field classes Switch's text uses. Only the part classes and the root layout are SwitchField's.
function makeSwitchField() {
  const Root = /*#__PURE__*/ React.forwardRef<HTMLDivElement, SwitchFieldRootProps>(function SwitchFieldRoot({ checked, defaultChecked, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'SwitchField');
    // React Aria's props type the handlers on Element, and these on the div; the rest is the div's native attributes.
    return h(AriaSwitchField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...(props as AriaSwitchFieldProps) }), ref, isSelected: checked, defaultSelected: defaultChecked, onChange, name, value, ...{ 'data-muxui-size': resolvedSize }, className: cx('muxui-switch-field', className) });
  });
  const Button = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, SwitchFieldButtonProps>(function SwitchFieldButton({ disabled, className, children, ...props }, ref) {
    return h(AriaSwitchButton, { ...(props as AriaSwitchButtonProps), ref, ...{ isDisabled: disabled }, className: cx('muxui-switch', 'muxui-switch-field__button', className),
      children: (renderProps) => h(SwitchFieldThumbContext.Provider, { value: renderProps }, children) });
  });
  const Thumb = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, SwitchFieldThumbProps>(function SwitchFieldThumb({ className, ...props }, ref) {
    const state = React.useContext(SwitchFieldThumbContext);
    return h(SwitchMotionIndicator, { ...props, ref, className: cx('muxui-switch-field__thumb', className), isSelected: Boolean(state?.isSelected), isPressed: Boolean(state?.isPressed), isDisabled: Boolean(state?.isDisabled), isReadOnly: Boolean(state?.isReadOnly) });
  });
  const Description = /*#__PURE__*/ React.forwardRef<HTMLElement, SwitchFieldDescriptionProps>(function SwitchFieldDescription(props, ref) { return fieldText('description', 'muxui-switch-field__description muxui-field-description', props, ref); });
  const Error = /*#__PURE__*/ React.forwardRef<HTMLElement, SwitchFieldErrorProps>(function SwitchFieldError(props, ref) { return fieldError('muxui-switch-field__error muxui-field-error', props, ref); });
  return /*#__PURE__*/ Object.freeze({ Root, Button, Thumb, Description, Error });
}

export const SwitchField: {
  Root: ForwardRefExoticComponent<SwitchFieldRootProps & RefAttributes<HTMLDivElement>>;
  Button: ForwardRefExoticComponent<SwitchFieldButtonProps & RefAttributes<HTMLLabelElement>>;
  Thumb: ForwardRefExoticComponent<SwitchFieldThumbProps & RefAttributes<HTMLSpanElement>>;
  Description: ForwardRefExoticComponent<SwitchFieldDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<SwitchFieldErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ makeSwitchField();
