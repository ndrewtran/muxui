import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ReactNode, RefAttributes } from 'react';
import { ColorPicker as AriaColorPicker, parseColor } from 'react-aria-components';
import type { Color } from 'react-aria-components';
import { classNames } from './control-utils.ts';
import { colorValue, ColorPickerContext, useRememberedEdit } from './color-context.ts';
import type { MuxUIColorValue } from './color-context.ts';

/**
 * The props Mux UI defines for ColorPicker. Its children are the color controls it shares one color
 * with, and className styles its wrapper.
 */
export type ColorPickerOwnProps = {
  /** The picker's color, when the caller controls it. The picker keeps its color in this value's color space. */
  value?: MuxUIColorValue;
  /** The starting color, when the picker controls itself. It also sets the color space the picker keeps its color in. */
  defaultValue?: MuxUIColorValue;
  /** Called with the new color as a CSS string each time a color control inside changes it, in the color space of the value, or of defaultValue when uncontrolled, and in rgba() form with neither. A disabled or read-only picker does not call it. */
  onChange?: (value: MuxUIColorValue) => void;
  /** Disables every Mux UI color control inside the picker, at any depth. A child cannot turn it off, and native elements inside are not affected. */
  disabled?: boolean;
  /** Makes every Mux UI color control inside the picker read-only, at any depth. A child cannot turn it off, and native elements inside are not affected. */
  readOnly?: boolean;
};

export type ColorPickerProps = ColorPickerOwnProps & { children?: ReactNode; className?: string };

// The wrapper also spreads the other attributes of a div onto its element, though its public type does not take them.
export const ColorPicker: ForwardRefExoticComponent<ColorPickerProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ColorPickerProps & Omit<HTMLAttributes<HTMLDivElement>, keyof ColorPickerProps>>(function ColorPicker({ value, defaultValue, onChange, disabled = false, readOnly = false, children, className, ...props }, ref) {
  // ARIA names and states need a role; a labelled picker is a group, an unlabelled one a plain wrapper.
  const labelled = Boolean(props['aria-label'] || props['aria-labelledby']);
  const valueColor = colorValue(value, 'ColorPicker');
  const defaultColor = colorValue(defaultValue, 'ColorPicker');
  // Whichever child edits, the picker reports and keeps its color in the space of its value, or of defaultValue
  // (rgb with neither), and holds an uncontrolled color itself. Children read that space from the context.
  const space = (valueColor ?? defaultColor)?.getColorSpace() ?? 'rgb';
  const [held, setHeld] = React.useState(() => defaultColor ?? parseColor('#000000'));
  // The picker also remembers the edit at full precision, in the child's own space, and feeds it back to the
  // children while it still describes the color, so a hue slider can move off a gray in a hex picker.
  const [pickerColor, rememberEdit] = useRememberedEdit(valueColor ?? held);
  const onPickerChange = (next: Color) => {
    // Two tests rather than `disabled || readOnly`: extraction reads `||` on an owned prop as replacing its default.
    if (disabled) return;
    if (readOnly) return;
    const edited = next.toFormat(space);
    rememberEdit(next);
    setHeld(edited);
    onChange?.(edited.toString());
  };
  return React.createElement('div', {
    ...props, ref, role: labelled ? 'group' : undefined, 'aria-disabled': (labelled && disabled) || undefined,
    // The data-* hooks the styles read are not attributes of a div, and TypeScript accepts such a key in a call only from a spread.
    ...{ 'data-muxui-state-disabled': disabled ? disabled : undefined, 'data-muxui-state-read-only': readOnly ? readOnly : undefined },
    className: classNames('muxui-color-picker', className),
  }, React.createElement(AriaColorPicker, { value: pickerColor, onChange: onPickerChange, children: React.createElement(ColorPickerContext.Provider, { value: { disabled, readOnly, space } }, children) }));
});
ColorPicker.displayName = 'ColorPicker';
