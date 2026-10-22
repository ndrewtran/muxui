import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react';
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
import { classNames, accessibleName } from './control-utils.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';
import type { MuxUIColorValue } from './color-context.ts';
import type { ControlSize, NamedFieldProps } from './fields.ts';

// The props ColorField defines, as a type literal, not an interface, so the public props type stays
// assignable to Record<string, unknown>, as it was before the move. The grammar lets a type list its
// members and nothing else, so the members every field shares are written out here; the
// fields.types.test.tsx test pins them to FieldValidationProps and ControlSize. The public type
// intersects NamedFieldProps (FieldValidationProps and the accessible name's arms), as it did before
// the move, so a consumer's module augmentation of FieldValidationProps still reaches it.

/** The props Mux UI defines for ColorField. ColorField edits a whole color as one text value and has no channel or color-space props. */
export type ColorFieldOwnProps = {
  /** The visible label, which also names the field. Without one, the field needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** Supporting text shown with the field, which also describes it. */
  description?: ReactNode;
  /** The message the field shows, in place of the built-in one, only while it is invalid, through the invalid prop or failed validation. It never makes the field invalid by itself. */
  errorMessage?: ReactNode;
  /** The color, when the caller controls it. `null` is controlled and empty. */
  value?: MuxUIColorValue | null;
  /** The starting color, when the field controls itself. It also sets the color space onChange reports in, when there is no value and no enclosing ColorPicker. */
  defaultValue?: MuxUIColorValue;
  /** Called with the typed color as a CSS string once the field applies it, when it loses focus or Enter is pressed, and with `null` when the field is cleared. It is in the color space of the value, of the enclosing ColorPicker, or of defaultValue, and in rgba() form with none of them. The field shows and submits uppercase hex whatever the space. */
  onChange?: (value: MuxUIColorValue | null) => void;
  /** Disables the field: it can be neither focused nor changed. A disabled enclosing ColorPicker disables it too. */
  disabled?: boolean;
  /** Makes the field read-only: its color stays visible and focusable but cannot be changed. A read-only enclosing ColorPicker does the same. */
  readOnly?: boolean;
  /** Marks the field required, so a form with native validation does not submit while it is empty. */
  required?: boolean;
  /** Marks the field invalid and shows its error message. Left false, validation decides, so failed native, custom, or server validation can still make the field invalid. */
  invalid?: boolean;
  /** The control size. */
  size?: ControlSize;
  /** The form field name. A named field submits its color as uppercase hex, #RRGGBB. */
  name?: string;
};

export type ColorFieldProps = Omit<ColorFieldOwnProps, 'label'> & NamedFieldProps;

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
export const ColorField: ForwardRefExoticComponent<ColorFieldProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ColorFieldProps>(function ColorField({ label, description, errorMessage, value, defaultValue, onChange, disabled = false, readOnly = false, required = false, invalid = false, size = 'md', name, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, ...props }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorField');
  const resolvedSize = normalizeChoiceControlSize(size, 'ColorField');
  const pickerState = React.useContext(ColorPickerContext);
  // Conditionals rather than `disabled || ...`: extraction reads `||` on an owned prop as replacing its default.
  const effectiveDisabled = disabled ? disabled : pickerState.disabled;
  const effectiveReadOnly = readOnly ? readOnly : pickerState.readOnly;
  const valueColor = value === null ? null : colorValue(value, 'ColorField');
  const defaultColor = colorValue(defaultValue, 'ColorField');
  // React Aria parses typed hex into rgb. onChange converts it to the colour space of the value, the enclosing
  // ColorPicker, or defaultValue, the way ColorArea resolves it; rgb with none of them.
  const space = valueColor?.getColorSpace() ?? pickerState.space ?? defaultColor?.getColorSpace() ?? 'rgb';
  return React.createElement(AriaColorField, {
    ...props, ref, name, value: valueColor, defaultValue: defaultColor,
    onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next ? next.toFormat(space).toString() : null); }, isDisabled: effectiveDisabled, isReadOnly: effectiveReadOnly, isRequired: required,
    isInvalid: invalid ? invalid : undefined, className: classNames('muxui-color-field', className),
    // React Aria's props do not name the data-size hook the styles read, and TypeScript accepts such a key in a call only from a spread.
    ...{ 'data-size': resolvedSize },
    'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby,
  }, label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
  React.createElement(ColorFieldInput),
  description !== undefined ? React.createElement(AriaText, { slot: 'description', className: 'muxui-field-description' }, description) : null,
  errorMessage !== undefined ? React.createElement(AriaFieldError, { className: 'muxui-field-error' }, errorMessage) : null);
});
ColorField.displayName = 'ColorField';
