import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react';
import { ColorSwatch as AriaColorSwatch, useLocale } from 'react-aria-components';
import { classNames } from './control-utils.ts';
import { colorValue, ColorPickerContext } from './color-context.ts';
import type { MuxUIColorValue } from './color-context.ts';

/**
 * The props Mux UI defines for ColorSwatch. Every other attribute of a div, such as aria-label, id,
 * and the event handlers, passes through to the swatch unchanged.
 */
export type ColorSwatchOwnProps = {
  /** The color to show, as a valid CSS color string. Its alpha is kept. */
  color: MuxUIColorValue;
  /** A second color. With it the swatch shows a diagonal two-tone preview, and both colors keep their alpha. It needs a color. */
  secondaryColor?: MuxUIColorValue;
  /** The swatch outline: `square` keeps the token-based corner radius, and `circle` is round. */
  shape?: 'square' | 'circle';
  /** One short phrase that names the whole preview in the application's language. Without one, a single color is named by its own description and a two-tone swatch by both descriptions. */
  colorName?: string;
  /** Marks the swatch disabled. A disabled enclosing ColorPicker disables it too. */
  disabled?: boolean;
};

export type ColorSwatchProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'color'> & ColorSwatchOwnProps;

export const ColorSwatch: ForwardRefExoticComponent<ColorSwatchProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, ColorSwatchProps>(function ColorSwatch({ color, secondaryColor, shape = 'square', colorName, disabled = false, className, style, ...props }, ref) {
  const pickerState = React.useContext(ColorPickerContext);
  const { locale } = useLocale();
  if (shape !== 'square' && shape !== 'circle') throw new TypeError('ColorSwatch shape must be square or circle');
  const primary = colorValue(color, 'ColorSwatch');
  const secondary = colorValue(secondaryColor, 'ColorSwatch secondaryColor');
  if (secondary && !primary) throw new TypeError('Two-tone ColorSwatch requires a primary color');
  // A conditional rather than `disabled || ...`: extraction reads `||` on an owned prop as replacing its default.
  const effectiveDisabled = disabled ? disabled : pickerState.disabled;
  return React.createElement(AriaColorSwatch, {
    ...props, ref, color: primary,
    colorName: colorName?.trim() || (secondary && primary ? `${primary.getColorName(locale)}, ${secondary.getColorName(locale)}` : undefined),
    // React Aria's props do not name isDisabled or the data-* hooks the styles read, and TypeScript accepts such a key in a call only from a spread.
    ...{
      isDisabled: effectiveDisabled,
      'data-disabled': effectiveDisabled || undefined,
      'data-readonly': pickerState.readOnly || undefined,
      'data-muxui-color-paint': 'sample',
      'data-shape': shape,
      'data-two-tone': secondary ? '' : undefined,
    },
    className: classNames('muxui-color-swatch', className),
    style: secondary && primary ? {
      ...style,
      // Avoid painting translucent gradient halves over the primary colour.
      backgroundColor: 'transparent',
      ...{
        '--muxui-color-swatch-primary': primary.toString('css'),
        '--muxui-color-swatch-secondary': secondary.toString('css'),
      },
    } : style,
  });
});
ColorSwatch.displayName = 'ColorSwatch';
