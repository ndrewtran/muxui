import React from 'react';
import { ColorPicker as AriaColorPicker, parseColor } from 'react-aria-components';
import { classNames } from './control-utils.ts';
import { colorValue, ColorPickerContext, useRememberedEdit } from './color-context.ts';

export const ColorPicker = React.forwardRef(function ColorPicker({ value, defaultValue, onChange, disabled = false, readOnly = false, children, className, ...props }, ref) {
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
  const onPickerChange = (next) => {
    if (disabled || readOnly) return;
    const edited = next.toFormat(space);
    rememberEdit(next);
    setHeld(edited);
    onChange?.(edited.toString());
  };
  return React.createElement('div', { ...props, ref, role: labelled ? 'group' : undefined, 'aria-disabled': (labelled && disabled) || undefined, 'data-disabled': disabled || undefined, 'data-readonly': readOnly || undefined, className: classNames('muxui-color-picker', className) }, React.createElement(AriaColorPicker, { value: pickerColor, onChange: onPickerChange }, React.createElement(ColorPickerContext.Provider, { value: { disabled, readOnly, space } }, children)));
});
ColorPicker.displayName = 'ColorPicker';
