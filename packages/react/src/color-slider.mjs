import React from 'react';
import { ColorSliderMotionTrack } from './color-slider-motion.mjs';
import { ColorSlider as AriaColorSlider, Label as AriaLabel } from 'react-aria-components';
import { classNames, accessibleName } from './control-utils.ts';
import { readOnlyKeyGuard, useReadOnlyTargets } from './read-only-guard.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';

const COLOR_SPACE_CHANNELS = {
  rgb: ['red', 'green', 'blue', 'alpha'],
  hsl: ['hue', 'saturation', 'lightness', 'alpha'],
  hsb: ['hue', 'saturation', 'brightness', 'alpha'],
};

// Without colorSpace, React Aria reads the channel from the value's own space.
function assertColorSliderChannel(channel, colorSpace, color) {
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
export const ColorSlider = /* @__PURE__ */ (() => {
  const component = React.forwardRef(function ColorSlider({ label, value, defaultValue, onChange, channel = 'red', colorSpace, disabled = false, readOnly = false, orientation = 'horizontal', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }, ref) {
    accessibleName({ label, ariaLabel, ariaLabelledby }, 'ColorSlider');
    const color = colorValue(value, 'ColorSlider');
    const defaultColor = colorValue(defaultValue, 'ColorSlider');
    const pickerState = React.useContext(ColorPickerContext);
    // Inside a ColorPicker, React Aria drives the slider with the picker's colour, which may be a nested control's
    // remembered edit in another space, so the slider reads it in the picker's space unless colorSpace says otherwise.
    const space = colorSpace ?? pickerState.space;
    assertColorSliderChannel(channel, space, color ?? defaultColor);
    const effectiveDisabled = disabled || pickerState.disabled;
    const effectiveReadOnly = readOnly || pickerState.readOnly;
    const preventReadOnlyInteraction = (event) => {
      if (effectiveReadOnly) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const assignSliderRef = useReadOnlyTargets(ref, effectiveReadOnly, '[role="slider"], input[type="range"]');
    return React.createElement('div', { 'aria-disabled': effectiveDisabled || undefined, 'data-disabled': effectiveDisabled || undefined, 'data-readonly': effectiveReadOnly || undefined, onPointerDownCapture: preventReadOnlyInteraction, onMouseDownCapture: preventReadOnlyInteraction, onKeyDownCapture: readOnlyKeyGuard(effectiveReadOnly), onTouchStartCapture: preventReadOnlyInteraction, onClickCapture: preventReadOnlyInteraction, onChangeCapture: preventReadOnlyInteraction },
      React.createElement(AriaColorSlider, {
        ref: assignSliderRef,
        channel,
        colorSpace: space,
        value: color,
        defaultValue: defaultColor,
        onChange: (next) => { if (!effectiveDisabled && !effectiveReadOnly) onChange?.(next.toString()); },
        isDisabled: effectiveDisabled,
        orientation,
        'data-readonly': effectiveReadOnly || undefined,
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
