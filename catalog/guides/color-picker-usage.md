# ColorPicker usage

Compose Mux UI color controls under ColorPicker to share one value.

## Leading with exact entry

Lead with a ColorField for the exact value, then add visual controls that edit the same color.

- Put a [ColorField](/components/color-field/) first, so people can type or paste the color they already have.
- Add a [ColorArea](/components/color-area/) for saturation and brightness.
- Add a hue [ColorSlider](/components/color-slider/) or [ColorWheel](/components/color-wheel/), because the area never changes hue.
- Add a [ColorSwatchPicker](/components/color-swatch-picker/) for presets only when the product has a palette.
- A swatch edits the same color, and a typed color outside the palette leaves no swatch selected.

The Basic ColorPicker example puts exact entry, an area, and a hue slider together. The ColorPicker with presets example adds a palette beside the field.

## Disabled and read-only

`disabled` and `readOnly` on the ColorPicker apply to every Mux UI color control inside it, however deeply the control is wrapped, so they do not need repeating on each child. A child cannot turn a flag off once the picker sets it. Native elements inside the picker are not affected. The Disabled ColorPicker example disables a slider and a field from the picker.

## Output format

The picker's `onChange` returns the color as a CSS string in the color space of the picker's `value`, or its `defaultValue` when uncontrolled, whichever nested control made the edit: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The picker keeps its color in that space after every edit, and remembers the last edit of a nested control at full precision, so a hue slider can move off a gray, black, or white in a hex picker. The Basic ColorPicker example passes a hex value, so it receives `rgba()` strings.

## Content

- Label each control inside by what it edits, such as Color or Hue.
- The picker has no `name` prop. To submit the color in a form, give the ColorField a `name`.

## Common mistake

Adding a hue ColorSlider to a hex or rgb picker without a `colorSpace`. Hue is not a channel of that space, so the slider throws a TypeError. Set `colorSpace` to `hsb` or `hsl`, as the Basic ColorPicker example does.
