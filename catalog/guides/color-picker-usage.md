# ColorPicker usage

Compose Mux UI color controls under ColorPicker to share one value.

## Disabled and read-only

`disabled` and `readOnly` on the ColorPicker apply to every Mux UI color control inside it, however deeply the control is wrapped, so they do not need repeating on each child. A child cannot turn a flag off once the picker sets it. Native elements inside the picker are not affected. The Disabled ColorPicker example disables a slider and a field from the picker.

## Output format

The picker's `onChange` returns the color as a CSS string in the color space of the picker's `value`, or its `defaultValue` when uncontrolled, whichever nested control made the edit: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value. The picker keeps its color in that space after every edit, and remembers the last edit of a nested control at full precision, so a hue slider can move off a gray, black, or white in a hex picker. The Basic ColorPicker example passes a hex value, so it receives `rgba()` strings.
