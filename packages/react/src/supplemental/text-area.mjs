import React from 'react';
import {
  FieldError as AriaFieldError,
  Label as AriaLabel,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
} from 'react-aria-components';
import { h, cx } from './part-utils.mjs';
import { fieldText } from './field-utils.mjs';
import { fieldRoot } from './field-root.mjs';

export const TextArea = {
  Root: /*#__PURE__*/ fieldRoot(AriaTextField, 'muxui-text-area'),
  TextArea: React.forwardRef(function TextAreaInput({ disabled, className, ...props }, ref) { return h(AriaTextArea, { ...props, ref, disabled, className: cx('muxui-text-area__textarea', className) }); }),
  Label: React.forwardRef(function TextAreaLabel(props, ref) { return h(AriaLabel, { ...props, ref, className: cx('muxui-text-area__label', props.className) }); }),
  Description: React.forwardRef(function TextAreaDescription(props, ref) { return fieldText('description', 'muxui-text-area__description', props, ref); }),
  Error: React.forwardRef(function TextAreaError(props, ref) { return h(AriaFieldError, { ...props, ref, className: cx('muxui-text-area__error', props.className) }); }),
};
