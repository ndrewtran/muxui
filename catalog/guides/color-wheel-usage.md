# ColorWheel usage

Give ColorWheel a label and a valid Mux UI color string.

## ColorWheel or ColorSlider

Neither is the default. Choose by the layout and the task.

- Use ColorWheel when circular hue exploration helps, such as choosing a theme color where related hues sit side by side. It needs a square of twice its outer radius.
- Use [ColorSlider](/components/color-slider/) for compact channel editing, such as a hue track in a row. It also edits channels other than hue.
- Pair either with a [ColorArea](/components/color-area/) for saturation and brightness, inside a [ColorPicker](/components/color-picker/).

## Radius

`outerRadius` and `innerRadius` are in pixels, and the wheel is twice its outer radius wide and tall. Both must be finite numbers of zero or more, and `innerRadius` must be less than `outerRadius`. ColorWheel throws a TypeError for a pair that breaks these rules; it does not clamp them. The ColorWheel with a custom radius example uses a valid pair.

## Output format

`onChange` returns the edited color as a CSS string in the color space of the value you passed, the way ColorArea and ColorSlider do: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The ColorWheel examples pass hex values, so they receive `rgba()` strings. A wheel with no value or `defaultValue` returns `hsla()`.

## Content

Label the wheel by what it edits, such as Hue.

## Common mistake

Expecting the wheel to choose a whole color. It adjusts hue only, so pair it with a ColorArea for saturation and brightness, or a ColorField for an exact value.
