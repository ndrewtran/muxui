import React from 'react';
import {
  FieldError as AriaFieldError,
  SwitchField as AriaSwitchField,
  SwitchButton as AriaSwitchButton,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from '../choice-context.mjs';
import { h, cx, nativePart } from './part-utils.mjs';
import { fieldText, mappedFieldProps } from './field-utils.mjs';

function makeSwitchField() {
  const Root = React.forwardRef(function SwitchFieldRoot({ checked, defaultChecked, onChange, name, value, disabled, invalid, required, readOnly, size = 'md', className, ...props }, ref) {
    const resolvedSize = normalizeChoiceControlSize(size, 'SwitchField');
    return h(AriaSwitchField, { ...mappedFieldProps({ disabled, invalid, required, readOnly, ...props }), ref, isSelected: checked, defaultSelected: defaultChecked, onChange, name, value, 'data-size': resolvedSize, className: cx('muxui-switch-field', className) });
  });
  const Button = React.forwardRef(function SwitchFieldButton({ disabled, className, ...props }, ref) {
    return h(AriaSwitchButton, { ...props, ref, isDisabled: disabled, className: cx('muxui-switch-field__button', className) });
  });
  const Thumb = React.forwardRef(function SwitchFieldThumb(props, ref) { return nativePart('span', 'muxui-switch-field__thumb', props, ref); });
  const Description = React.forwardRef(function SwitchFieldDescription(props, ref) { return fieldText('description', 'muxui-switch-field__description', props, ref); });
  const Error = React.forwardRef(function SwitchFieldError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-switch-field__error', props.className) }); });
  return Object.freeze({ Root, Button, Thumb, Description, Error });
}

export const SwitchField = /*#__PURE__*/ makeSwitchField();
