import React from 'react';
import type { ForwardRefExoticComponent, ReactNode, RefAttributes, SyntheticEvent } from 'react';
import { ColorSliderMotionTrack } from './color-slider-motion.mjs';
import { Label as AriaLabel } from 'react-aria-components';
import { AriaColorSlider } from './substrate.ts';
import type { Color } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';
import type { MuxUIColorChannel, MuxUIColorSpace, MuxUIColorValue } from './color-context.ts';
import type { MuxUIAccessibleName } from './fields.ts';

/** The props Mux UI defines for ColorSlider. The slider is named by label, aria-label, or aria-labelledby. */
export type ColorSliderOwnProps = {
  /** The visible label, which also names the slider. Without one, the slider needs an aria-label or aria-labelledby, and an empty label does not count. */
  label?: Exclude<ReactNode, null | undefined | boolean>;
  /** The slider's color, when the caller controls it. */
  value?: MuxUIColorValue;
  /** The starting color, when the slider controls itself. */
  defaultValue?: MuxUIColorValue;
  /** Called with the new color as a CSS string each time the channel changes. It is in the slider's color space when colorSpace is set, and otherwise in the space of the value, the enclosing ColorPicker, or defaultValue. A disabled or read-only slider does not call it. */
  onChange?: (value: MuxUIColorValue) => void;
  /** The channel the slider adjusts. It must belong to colorSpace or, without colorSpace, to the space of the enclosing ColorPicker's color, otherwise of value or defaultValue; any other pair throws a TypeError. */
  channel?: MuxUIColorChannel;
  /** The color space the slider reads and reports in. Without it the slider uses the enclosing ColorPicker's space, otherwise the space of the value. */
  colorSpace?: MuxUIColorSpace;
  /** Disables the slider: it can be neither focused nor changed. A disabled enclosing ColorPicker disables it too. */
  disabled?: boolean;
  /** Makes the slider read-only: it stays focusable but its channel cannot be changed. A read-only enclosing ColorPicker does the same. */
  readOnly?: boolean;
  /** The direction of the track. */
  orientation?: 'horizontal' | 'vertical';
};

export type ColorSliderProps = Omit<ColorSliderOwnProps, 'label'> & { className?: string } & MuxUIAccessibleName;

const COLOR_SPACE_CHANNELS: Readonly<Record<string, readonly string[]>> = {
  rgb: ['red', 'green', 'blue', 'alpha'],
  hsl: ['hue', 'saturation', 'lightness', 'alpha'],
  hsb: ['hue', 'saturation', 'brightness', 'alpha'],
};

// Without colorSpace, React Aria reads the channel from the value's own space.
function assertColorSliderChannel(channel: string, colorSpace: string | undefined, color: Color | undefined) {
  // Computed per call so the module keeps no import-time work.
  const channels = [...new Set(Object.values(COLOR_SPACE_CHANNELS).flat())];
  if (!channels.includes(channel)) throw new TypeError(`ColorSlider channel must be one of: ${channels.join(', ')}`);
  if (colorSpace !== undefined && !Object.hasOwn(COLOR_SPACE_CHANNELS, colorSpace)) throw new TypeError('ColorSlider colorSpace must be one of: rgb, hsl, hsb');
  const space = colorSpace ?? color?.getColorSpace();
  if (space && !COLOR_SPACE_CHANNELS[space].includes(channel)) {
    throw new TypeError(`ColorSlider channel ${channel} is not in the ${space} color space; set colorSpace to ${Object.keys(COLOR_SPACE_CHANNELS).filter((key) => COLOR_SPACE_CHANNELS[key].includes(channel)).join(' or ')}`);
  }
}

// Include displayName in the pure initialization so unused sliders shed their motion dependency.
export const ColorSlider: ForwardRefExoticComponent<ColorSliderProps & RefAttributes<HTMLDivElement>> = /* @__PURE__ */ (() => {
  const component = React.forwardRef<HTMLDivElement, ColorSliderProps>(function ColorSlider({ label, value, defaultValue, onChange, channel = 'red', colorSpace, disabled = false, readOnly = false, orientation = 'horizontal', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorSlider');
    const color = colorValue(value, 'ColorSlider');
    const defaultColor = colorValue(defaultValue, 'ColorSlider');
    const pickerState = React.useContext(ColorPickerContext);
    // Inside a ColorPicker, React Aria drives the slider with the picker's colour, which may be a nested control's
    // remembered edit in another space, so the slider reads it in the picker's space unless colorSpace says otherwise.
    // Explicit tests rather than `??` and `||`: extraction reads those on an owned prop as replacing its default.
    const space = colorSpace === undefined || colorSpace === null ? pickerState.space : colorSpace;
    assertColorSliderChannel(channel, space, color ?? defaultColor);
    const effectiveDisabled = disabled ? disabled : pickerState.disabled;
    const effectiveReadOnly = readOnly ? readOnly : pickerState.readOnly;
    const preventReadOnlyInteraction = (event: SyntheticEvent) => {
      if (effectiveReadOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const assignSliderRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
    return React.createElement('div', { ...{ 'aria-disabled': effectiveDisabled || undefined, 'data-muxui-state-disabled': effectiveDisabled || undefined, 'data-muxui-state-read-only': effectiveReadOnly || undefined }, onPointerDownCapture: preventReadOnlyInteraction, onMouseDownCapture: preventReadOnlyInteraction, onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly), onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
      React.createElement(AriaColorSlider, {
        ref: assignSliderRef,
        channel,
        colorSpace: space,
        value: color,
        defaultValue: defaultColor,
        onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
        isDisabled: effectiveDisabled,
        orientation,
        // React Aria's props do not name the data-muxui-state-read-only hook the styles read, and TypeScript accepts such a key in a call only from a spread.
        ...{ 'data-muxui-state-read-only': effectiveReadOnly || undefined },
        className: classNames('muxui-color-slider', className),
        'aria-label': ariaLabel,
        'aria-labelledby': ariaLabelledby,
      },
      label !== undefined ? React.createElement(AriaLabel, { className: 'muxui-field-label' }, label) : null,
      React.createElement(ColorSliderMotionTrack, { readOnly: effectiveReadOnly })),
    );
  });
  component.displayName = 'ColorSlider';
  return component;
})();
