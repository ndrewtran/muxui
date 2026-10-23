import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, LabelHTMLAttributes, ReactNode, RefAttributes } from 'react';
import CheckIcon from 'lucide-react/dist/esm/icons/check.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import {
  CheckboxField as AriaCheckboxField,
  CheckboxButton as AriaCheckboxButton,
  FieldError as AriaFieldError,
} from 'react-aria-components';
import type { CheckboxButtonProps as AriaCheckboxButtonProps, CheckboxButtonRenderProps, CheckboxFieldProps as AriaCheckboxFieldProps } from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import type { PartProps } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.ts';

/**
 * The props Mux UI defines for CheckboxField.Root, the compound's root; the catalog's web.react
 * API is derived from this type (Decision 0031). The members every field shares are written out,
 * because the catalog's grammar reads only the members a type lists itself.
 */
type CheckboxFieldOwnProps = {
  /** Whether the checkbox is checked, when the caller controls it. */
  checked?: boolean;
  /** Whether the checkbox starts checked, when the field controls itself. */
  defaultChecked?: boolean;
  /** Shows the mixed state in place of checked or unchecked. */
  indeterminate?: boolean;
  /** Called with the new checked state. */
  onChange?: (checked: boolean) => void;
  /** The name the checkbox submits under in a form. */
  name?: string;
  /** The value the checkbox submits while it is checked. */
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

/** The props Mux UI defines for CheckboxField.Button; its API is the button entry in the catalog's partApis. */
type CheckboxFieldButtonOwnProps = {
  /** Marks the checkbox disabled, whatever its field says. */
  disabled?: boolean;
};

export type CheckboxFieldRootProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> & CheckboxFieldOwnProps;
export type CheckboxFieldButtonProps = LabelHTMLAttributes<HTMLLabelElement> & CheckboxFieldButtonOwnProps;
export type CheckboxFieldIndicatorProps = PartProps<HTMLSpanElement>;
export type CheckboxFieldDescriptionProps = PartProps<HTMLElement>;
export type CheckboxFieldErrorProps = PartProps<HTMLElement>;

const CheckboxFieldIndicatorContext = React.createContext<CheckboxButtonRenderProps | null>(null);

/* Field compounds */
function makeCheckboxField() {
  const Root = /*#__PURE__*/ React.forwardRef<HTMLDivElement, CheckboxFieldRootProps>(function CheckboxFieldRoot({ checked, defaultChecked, indeterminate, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'CheckboxField');
    // React Aria's props type the handlers on Element, and these on the div; the rest is the div's native attributes.
    return h(AriaCheckboxField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...(props as AriaCheckboxFieldProps) }), ref, isSelected: checked, defaultSelected: defaultChecked, isIndeterminate: indeterminate, onChange, name, value, ...{ 'data-size': resolvedSize }, className: cx('muxui-checkbox-field', resolvedSize !== 'md' && `muxui-checkbox-field--${resolvedSize}`, className) });
  });
  const Button = /*#__PURE__*/ React.forwardRef<HTMLLabelElement, CheckboxFieldButtonProps>(function CheckboxFieldButton({ disabled, className, children, ...props }, ref) {
    return h(AriaCheckboxButton, { ...(props as AriaCheckboxButtonProps), ref, ...{ isDisabled: disabled }, className: cx('muxui-checkbox-field__button', className),
      children: (renderProps) => h(CheckboxFieldIndicatorContext.Provider, { value: renderProps },
        typeof children === 'function' ? (children as (renderProps: CheckboxButtonRenderProps) => ReactNode)(renderProps) : children) });
  });
  const Indicator = /*#__PURE__*/ React.forwardRef<HTMLSpanElement, CheckboxFieldIndicatorProps>(function CheckboxFieldIndicator({ className, children, ...props }, ref) {
    const renderProps = React.useContext(CheckboxFieldIndicatorContext);
    const content = children === undefined || children === null
      ? renderProps?.isIndeterminate
        ? h(MinusIcon, { 'aria-hidden': true, focusable: 'false', size: 12 })
        : renderProps?.isSelected
          ? h(CheckIcon, { 'aria-hidden': true, focusable: 'false', size: 12 })
          : null
      : children;
    return nativePart('span', 'muxui-checkbox-field__indicator', props, ref, content);
  });
  const Description = /*#__PURE__*/ React.forwardRef<HTMLElement, CheckboxFieldDescriptionProps>(function CheckboxFieldDescription(props, ref) { return fieldText('description', 'muxui-checkbox-field__description', props, ref); });
  const Error = /*#__PURE__*/ React.forwardRef<HTMLElement, CheckboxFieldErrorProps>(function CheckboxFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-checkbox-field__error', props.className) }); });
  return /*#__PURE__*/ Object.freeze({ Root, Button, Indicator, Description, Error });
}

export const CheckboxField: {
  Root: ForwardRefExoticComponent<CheckboxFieldRootProps & RefAttributes<HTMLDivElement>>;
  Button: ForwardRefExoticComponent<CheckboxFieldButtonProps & RefAttributes<HTMLLabelElement>>;
  Indicator: ForwardRefExoticComponent<CheckboxFieldIndicatorProps & RefAttributes<HTMLSpanElement>>;
  Description: ForwardRefExoticComponent<CheckboxFieldDescriptionProps & RefAttributes<HTMLElement>>;
  Error: ForwardRefExoticComponent<CheckboxFieldErrorProps & RefAttributes<HTMLElement>>;
} = /*#__PURE__*/ makeCheckboxField();
