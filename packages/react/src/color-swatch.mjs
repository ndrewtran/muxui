import React from 'react';
import { ColorSwatch as AriaColorSwatch, useLocale } from 'react-aria-components';
import { classNames } from './control-utils.mjs';
import { colorValue, ColorPickerContext } from './color-context.mjs';

export const ColorSwatch = React.forwardRef(function ColorSwatch({ color, secondaryColor, shape = 'square', colorName, disabled = false, className, style, ...props }, ref) {
  const pickerState = React.useContext(ColorPickerContext);
  const { locale } = useLocale();
  if (shape !== 'square' && shape !== 'circle') throw new TypeError('ColorSwatch shape must be square or circle');
  const primary = colorValue(color, 'ColorSwatch');
  const secondary = colorValue(secondaryColor, 'ColorSwatch secondaryColor');
  if (secondary && !primary) throw new TypeError('Two-tone ColorSwatch requires a primary color');
  const effectiveDisabled = disabled || pickerState.disabled;
  return React.createElement(AriaColorSwatch, {
    ...props, ref, color: primary,
    colorName: colorName?.trim() || (secondary ? `${primary.getColorName(locale)}, ${secondary.getColorName(locale)}` : undefined),
    isDisabled: effectiveDisabled,
    'data-disabled': effectiveDisabled || undefined, 'data-readonly': pickerState.readOnly || undefined,
    'data-muxui-color-paint': 'sample',
    'data-shape': shape, 'data-two-tone': secondary ? '' : undefined,
    className: classNames('muxui-color-swatch', className),
    style: secondary ? {
      ...style,
      // Avoid painting translucent gradient halves over the primary colour.
      backgroundColor: 'transparent',
      '--muxui-color-swatch-primary': primary.toString('css'),
      '--muxui-color-swatch-secondary': secondary.toString('css'),
    } : style,
  });
});
ColorSwatch.displayName = 'ColorSwatch';
