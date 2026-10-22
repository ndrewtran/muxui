import React from 'react';
import {
  ColorArea as AriaColorArea,
  ColorAreaContext,
  ColorPickerStateContext,
  ColorThumb as AriaColorThumb,
} from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext, useRememberedEdit } from './color-context.ts';

// Colour controls forward no untyped props; upstream props such as onChangeEnd,
// xChannel, or colorSpace would bypass the Mux UI guards and string values.
// The area always edits saturation (x) and brightness (y) in HSB and converts each edit back to the
// colour space of its value, or of the enclosing ColorPicker, so it emits the same CSS string
// as ColorSlider: rgba() for hex and rgb values, hsla() for hsl and hsb values.
export const ColorArea = React.forwardRef(function ColorArea({ label, value, defaultValue, onChange, disabled = false, readOnly = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
  accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorArea');
  const pickerState = React.useContext(ColorPickerContext);
  const pickerColorState = React.useContext(ColorPickerStateContext);
  const effectiveDisabled = disabled || pickerState.disabled;
  const effectiveReadOnly = readOnly || pickerState.readOnly;
  const valueColor = colorValue(value, 'ColorArea');
  const defaultColor = colorValue(defaultValue, 'ColorArea');
  // A value or the picker's colour drives the area; otherwise React Aria keeps the HSB colour itself.
  // A controlled area remembers its edits in HSB, which keeps the hue and saturation that hex, rgb, and hsl
  // lose at black and grays; a picker remembers the edit for the areas inside it.
  const [valueShown, rememberEdit] = useRememberedEdit(valueColor);
  const driven = valueShown ?? pickerColorState?.color;
  const space = valueColor?.getColorSpace() ?? pickerState.space ?? defaultColor?.getColorSpace() ?? 'rgb';
  const labelId = React.useId();
  const labelledby = ariaLabelledby ?? (label !== undefined ? labelId : undefined);
  const assignAreaRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
  const preventReadOnlyInteraction = (event) => {
    if (effectiveReadOnly) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  return React.createElement('div', { className: 'muxui-color-area-field', 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, 'aria-disabled': effectiveDisabled || undefined, onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
    label !== undefined ? React.createElement('span', { id: labelId, className: 'muxui-field-label' }, label) : null,
    // The area writes its edit to the picker itself, so it clears the context.
    React.createElement(ColorAreaContext.Provider, { value: null }, React.createElement(AriaColorArea, {
      ref: assignAreaRef,
      value: driven,
      defaultValue: driven ? undefined : defaultColor,
      colorSpace: 'hsb',
      xChannel: 'saturation',
      yChannel: 'brightness',
      onChange: (next) => {
        if (effectiveDisabled || effectiveReadOnly) return;
        rememberEdit(next);
        pickerColorState?.setColor(next);
        onChange?.(next.toFormat(space).toString());
      },
      isDisabled: effectiveDisabled,
      'aria-label': ariaLabel,
      'aria-labelledby': labelledby,
      'data-readonly': effectiveReadOnly || undefined,
      'data-muxui-color-paint': 'area',
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly),
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
      className: classNames('muxui-color-area', className),
    }, React.createElement(AriaColorThumb, {
      className: 'muxui-color-area-thumb',
      'data-muxui-color-paint': 'sample',
      'data-readonly': effectiveReadOnly || undefined,
    }))),
  );
});
ColorArea.displayName = 'ColorArea';
