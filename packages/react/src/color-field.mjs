import React from 'react';
import { flushSync } from 'react-dom';
import {
  ColorField as AriaColorField,
  ColorFieldStateContext as AriaColorFieldStateContext,
  Label as AriaLabel,
  Input as AriaInput,
  Text as AriaText,
  FieldError as AriaFieldError,
} from 'react-aria-components';
import { normalizeChoiceControlSize } from './choice-context.mjs';
import { classNames, accessibleName } from './control-utils.mjs';
import { colorValue, ColorPickerContext } from './color-context.mjs';

// React Aria applies typed text to a ColorField only on blur, so Enter would submit the form with the raw text and
// never report it. Enter commits as blur does, flushed so the input and onChange are current when the form reads
// them, and leaves the submission itself alone. NumberField does the same for its Enter, and skips the Enter that
// confirms an input method composition, which is not an attempt to submit.
function ColorFieldInput() {
  const state = React.useContext(AriaColorFieldStateContext);
  return React.createElement(AriaInput, {
    className: 'muxui-field-input',
    onKeyDown: (event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) flushSync(() => state?.commit()); },
  });
}

// React Aria reads isInvalid: false as controlled-valid, which hides failed native
// validation, so these fields pass isInvalid only when invalid is set. errorMessage
// replaces the shown message and never makes a field invalid by itself.
export const ColorField = React.forwardRef(function ColorField({ label, description, errorMessage, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, size, name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorField');
  const resolvedSize = normalizeChoiceControlSize(size, 'ColorField');
  const pickerState = React.useContext(ColorPickerContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  const valueColor = value === null ? null : colorValue(value, 'ColorField');
  const defaultColor = colorValue(defaultValue, 'ColorField');
  // React Aria parses typed hex into rgb. onChange converts it to the colour space of the value, the enclosing
  // ColorPicker, or defaultValue, the way ColorArea resolves it; rgb with none of them.
  const space = valueColor?.getColorSpace() ?? pickerState.space ?? defaultColor?.getColorSpace() ?? 'rgb';
  return React.createElement(AriaColorField, {
    ...props, ref, name, value: valueColor, defaultValue: defaultColor,
    onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next ? next.toFormat(space).toString() : null); }, isDisabled: effectiveDisabled, isReadOnly: effectiveReadOnly, isRequired: required,
    isInvalid: invalid || undefined, className: classNames('muxui-color-field', className), 'data-size': resolvedSize, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
  }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
  React.createElement(ColorFieldInput),
  description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
  errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null);
});
ColorField.displayName = 'ColorField';
