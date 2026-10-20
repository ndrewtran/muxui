# ColorWheel usage

Give ColorWheel a label and a valid Mux UI color string.

## Radius

`outerRadius` and `innerRadius` are in pixels, and the wheel is twice its outer radius wide and tall. Both must be finite numbers of zero or more, and `innerRadius` must be less than `outerRadius`. ColorWheel throws a TypeError for a pair that breaks these rules; it does not clamp them. The ColorWheel with a custom radius example uses a valid pair.

## Output format

`onChange` returns the edited color as a CSS string in the color space of the value you passed, the way ColorArea and ColorSlider do: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The ColorWheel examples pass hex values, so they receive `rgba()` strings. A wheel with no value or `defaultValue` returns `hsla()`.
