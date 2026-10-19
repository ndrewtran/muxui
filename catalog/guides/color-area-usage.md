# ColorArea usage

Use Mux UI color strings and provide an accessible label.

## Saturation and brightness

The horizontal axis is saturation and the vertical axis is brightness, whether the value is hex, rgb, hsl, or hsb. The area never changes hue. Set the hue in the value, or change it with a ColorWheel or a ColorSlider on the hue channel.

`onChange` returns the edited color as a CSS string in the color space of the value you passed, the way ColorSlider does: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The Basic ColorArea example passes a hex value, so it receives `rgba()` strings.
