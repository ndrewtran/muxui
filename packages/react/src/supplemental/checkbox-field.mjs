import React from 'react';
import CheckIcon from 'lucide-react/dist/esm/icons/check.mjs';
import MinusIcon from 'lucide-react/dist/esm/icons/minus.mjs';
import {
  CheckboxField as AriaCheckboxField,
  CheckboxButton as AriaCheckboxButton,
  FieldError as AriaFieldError,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.ts';
import { fieldText, mappedFieldProps } from './field-utils.mjs';

const CheckboxFieldIndicatorContext = React.createContext(null);

/* Field compounds */
function makeCheckboxField() {
  const Root = React.forwardRef(function CheckboxFieldRoot({ checked, defaultChecked, indeterminate, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'CheckboxField');
    return h(AriaCheckboxField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, isSelected: checked, defaultSelected: defaultChecked, isIndeterminate: indeterminate, onChange, name, value, 'data-size': resolvedSize, className: cx('muxui-checkbox-field', resolvedSize !== 'md' && `muxui-checkbox-field--${resolvedSize}`, className) });
  });
  const Button = React.forwardRef(function CheckboxFieldButton({ disabled, className, children, ...props }, ref) {
    return h(AriaCheckboxButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-checkbox-field__button', className) },
      (renderProps) => h(CheckboxFieldIndicatorContext.Provider, { value: renderProps },
        typeof children === 'function' ? children(renderProps) : children));
  });
  const Indicator = React.forwardRef(function CheckboxFieldIndicator({ className, children, ...props }, ref) {
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
  const Description = React.forwardRef(function CheckboxFieldDescription(props, ref) { return fieldText('description', 'muxui-checkbox-field__description', props, ref); });
  const Error = React.forwardRef(function CheckboxFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-checkbox-field__error', props.className) }); });
  return Object.freeze({ Root, Button, Indicator, Description, Error });
}

export const CheckboxField = /*#__PURE__*/ makeCheckboxField();
