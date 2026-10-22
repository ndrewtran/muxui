# ColorField usage

ColorField accepts Mux UI color strings and owns its input form relation.

## ColorField or visual controls

Use ColorField for an exact color that people type or paste, and add visual controls when they also need to explore.

- Use a ColorField alone for a single exact value, such as a brand color in a form.
- Add a [ColorArea](/components/color-area/), [ColorSlider](/components/color-slider/), or [ColorWheel](/components/color-wheel/) to adjust the color visually.
- Put them in a [ColorPicker](/components/color-picker/) with the field, so they share one value.
- For a fixed set of colors, use a [ColorSwatchPicker](/components/color-swatch-picker/).

## Whole color value

ColorField edits the whole color as one text value and has no `channel` prop and no `colorSpace` prop. A ColorSlider adjusts a single channel.

## Output format

`onChange` returns the typed color as a CSS string in the color space of the value you passed, the way ColorArea and ColorSlider do: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value, and `rgba()` when there is no value. The field still shows and submits uppercase hex whatever the space. The Basic ColorField example passes a hex value, so it receives `rgba()` strings.

## Content

Label the field by the color's role, such as Brand color.

## Common mistake

Treating the submitted value and the `onChange` string as the same format. A named ColorField submits uppercase hex such as `#336699`, while `onChange` returns `rgba()` or `hsla()`. Store one of them and convert on the other side.
