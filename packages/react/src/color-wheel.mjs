import React from 'react';
import { ColorWheelMotionTrack } from './color-wheel-motion.mjs';
import { ColorPickerStateContext, ColorWheel as AriaColorWheel } from 'react-aria-components';
import { classNames } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext, useRememberedEdit } from './color-context.ts';

function assertColorWheelGeometry(outerRadius, innerRadius) {
  if (typeof outerRadius !== 'number' || !Number.isFinite(outerRadius) || outerRadius < 0) throw new TypeError('ColorWheel outerRadius must be a finite nonnegative number');
  if (typeof innerRadius !== 'number' || !Number.isFinite(innerRadius) || innerRadius < 0) throw new TypeError('ColorWheel innerRadius must be a finite nonnegative number');
  if (innerRadius >= outerRadius) throw new TypeError('ColorWheel innerRadius must be less than outerRadius');
}

export const ColorWheel = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function ColorWheel({ value, defaultValue, onChange, disabled = false, readOnly = false, className, outerRadius = 96, innerRadius = 64, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    if (!ariaLabel && !ariaLabelledby) throw new TypeError('ColorWheel requires aria-label or aria-labelledby');
    assertColorWheelGeometry(outerRadius, innerRadius);
    const pickerState = React.useContext(ColorPickerContext);
    const effectiveDisabled = disabled || pickerState.disabled;
    const effectiveReadOnly = readOnly || pickerState.readOnly;
    const pickerColor = React.useContext(ColorPickerStateContext)?.color;
    const valueColor = colorValue(value, 'ColorWheel');
    const defaultColor = colorValue(defaultValue, 'ColorWheel');
    // React Aria edits the hue in hsl (or hsb). onChange converts it to the colour space of the value, the
    // enclosing ColorPicker, or defaultValue, the way ColorArea resolves it; hsl with none of them.
    const space = valueColor?.getColorSpace() ?? pickerState.space ?? defaultColor?.getColorSpace() ?? 'hsl';
    // A controlled wheel remembers its edits in hsl, which keeps the hue of the grays that hex and rgb lose;
    // a picker remembers the edit for the wheels inside it.
    const [valueShown, rememberEdit] = useRememberedEdit(valueColor);
    const preventReadOnlyInteraction = (event) => {
      if (effectiveReadOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const assignWheelRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
    return React.createElement(AriaColorWheel, {
      ref: assignWheelRef,
      outerRadius,
      innerRadius,
      value: valueShown ?? pickerColor,
      defaultValue: defaultColor,
      onChange: (next) => {
        if (effectiveDisabled || effectiveReadOnly) return;
        rememberEdit(next);
        onChange?.(next.toFormat(space).toString());
      },
      isDisabled: effectiveDisabled,
      'aria-disabled': effectiveDisabled || undefined,
      'data-disabled': effectiveDisabled || undefined,
      'data-readonly': effectiveReadOnly || undefined,
      onPointerDownCapture: preventReadOnlyInteraction,
      onMouseDownCapture: preventReadOnlyInteraction,
      onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly),
      onTouchStartCapture: preventReadOnlyInteraction,
      onClickCapture: preventReadOnlyInteraction,
      onChangeCapture: preventReadOnlyInteraction,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      className: classNames('muxui-color-wheel', className),
    },
      React.createElement(ColorWheelMotionTrack, { readOnly: effectiveReadOnly }));
  });
  component.displayName = 'ColorWheel';
  return component;
})();
