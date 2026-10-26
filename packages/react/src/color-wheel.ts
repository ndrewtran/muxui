import React from 'react';
import type { ForwardRefExoticComponent, RefAttributes, SyntheticEvent } from 'react';
import { ColorWheelMotionTrack } from './color-wheel-motion.mjs';
import { ColorPickerStateContext } from 'react-aria-components';
import { AriaColorWheel } from './substrate.ts';
import { classNames } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext, useRememberedEdit } from './color-context.ts';
import type { MuxUIColorValue } from './color-context.ts';
import type { MuxUIAriaAccessibleName } from './fields.ts';

/** The props Mux UI defines for ColorWheel. The wheel is named by aria-label or aria-labelledby. */
export type ColorWheelOwnProps = {
  /** The wheel's color, when the caller controls it. The wheel edits its hue and keeps the rest. */
  value?: MuxUIColorValue;
  /** The starting color, when the wheel controls itself. */
  defaultValue?: MuxUIColorValue;
  /** Called with the new color as a CSS string each time the hue changes. It is in the color space of the value, of the enclosing ColorPicker, or of defaultValue, and in hsla() form with none of them. A disabled or read-only wheel does not call it. */
  onChange?: (value: MuxUIColorValue) => void;
  /** The wheel's outer radius in pixels: the wheel is twice this wide and tall. It must be a finite number of 0 or more, and more than innerRadius. */
  outerRadius?: number;
  /** The radius of the hole in the middle, in pixels. It must be a finite number of 0 or more, and less than outerRadius. */
  innerRadius?: number;
  /** Disables the wheel: it can be neither focused nor changed. A disabled enclosing ColorPicker disables it too. */
  disabled?: boolean;
  /** Makes the wheel read-only: it stays focusable but its hue cannot be changed. A read-only enclosing ColorPicker does the same. */
  readOnly?: boolean;
};

export type ColorWheelProps = ColorWheelOwnProps & { className?: string } & MuxUIAriaAccessibleName;

function assertColorWheelGeometry(outerRadius: number, innerRadius: number) {
  if (typeof outerRadius !== 'number' || !Number.isFinite(outerRadius) || outerRadius < 0) throw new TypeError('ColorWheel outerRadius must be a finite nonnegative number');
  if (typeof innerRadius !== 'number' || !Number.isFinite(innerRadius) || innerRadius < 0) throw new TypeError('ColorWheel innerRadius must be a finite nonnegative number');
  if (innerRadius >= outerRadius) throw new TypeError('ColorWheel innerRadius must be less than outerRadius');
}

export const ColorWheel: ForwardRefExoticComponent<ColorWheelProps & RefAttributes<HTMLDivElement>> = /* @__PURE__ */ (() => {
  const component = React.forwardRef<HTMLDivElement, ColorWheelProps>(function ColorWheel({ value, defaultValue, onChange, disabled = false, readOnly = false, className, outerRadius = 96, innerRadius = 64, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    if (!ariaLabel && !ariaLabelledby) throw new TypeError('ColorWheel requires aria-label or aria-labelledby');
    assertColorWheelGeometry(outerRadius, innerRadius);
    const pickerState = React.useContext(ColorPickerContext);
    // A conditional rather than `disabled || ...`: extraction reads `||` on an owned prop as replacing its default.
    const effectiveDisabled = disabled ? disabled : pickerState.disabled;
    const effectiveReadOnly = readOnly ? readOnly : pickerState.readOnly;
    const pickerColor = React.useContext(ColorPickerStateContext)?.color;
    const valueColor = colorValue(value, 'ColorWheel');
    const defaultColor = colorValue(defaultValue, 'ColorWheel');
    // React Aria edits the hue in hsl (or hsb). onChange converts it to the colour space of the value, the
    // enclosing ColorPicker, or defaultValue, the way ColorArea resolves it; hsl with none of them.
    const space = valueColor?.getColorSpace() ?? pickerState.space ?? defaultColor?.getColorSpace() ?? 'hsl';
    // A controlled wheel remembers its edits in hsl, which keeps the hue of the grays that hex and rgb lose;
    // a picker remembers the edit for the wheels inside it.
    const [valueShown, rememberEdit] = useRememberedEdit(valueColor);
    const preventReadOnlyInteraction = (event: SyntheticEvent) => {
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
      // React Aria's props do not name aria-disabled, the data-* hooks the styles read, or every capture handler,
      // and TypeScript accepts such a key in a call only from a spread.
      ...{
        'aria-disabled': effectiveDisabled || undefined,
        'data-muxui-state-disabled': effectiveDisabled || undefined,
        'data-muxui-state-read-only': effectiveReadOnly || undefined,
        onPointerDownCapture: preventReadOnlyInteraction,
        onMouseDownCapture: preventReadOnlyInteraction,
        onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly),
        onTouchStartCapture: preventReadOnlyInteraction,
        onClickCapture: preventReadOnlyInteraction,
        onChangeCapture: preventReadOnlyInteraction,
      },
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledby,
      className: classNames('muxui-color-wheel', className),
    },
      React.createElement(ColorWheelMotionTrack, { readOnly: effectiveReadOnly }));
  });
  component.displayName = 'ColorWheel';
  return component;
})();
