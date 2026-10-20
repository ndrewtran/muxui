# ColorArea usage

Use Mux UI color strings and provide an accessible label.

## ColorArea with other controls

Use ColorArea to adjust saturation and brightness together, usually beside a hue control and an exact value.

- Pair it with a hue [ColorSlider](/components/color-slider/) or a [ColorWheel](/components/color-wheel/), because the area never changes hue.
- Pair it with a [ColorField](/components/color-field/) when people need to type or paste the exact color.
- Put them in a [ColorPicker](/components/color-picker/) so they share one value.

## Saturation and brightness

The horizontal axis is saturation and the vertical axis is brightness, whether the value is hex, rgb, hsl, or hsb. The area never changes hue. Set the hue in the value, or change it with a ColorWheel or a ColorSlider on the hue channel.

`onChange` returns the edited color as a CSS string in the color space of the value you passed, the way ColorSlider does: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The Basic ColorArea example passes a hex value, so it receives `rgba()` strings.

## Content

Label the area by the two things it edits, such as Saturation and brightness.

## Common mistake

Using ColorArea alone to choose a color. It cannot change hue, so people are held to the hue of the value. Add a hue control, ideally in a ColorPicker.
