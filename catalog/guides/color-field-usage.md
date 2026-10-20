# ColorField usage

ColorField accepts Mux UI color strings and owns its input form relation.

## Whole color value

ColorField edits the whole color as one text value and has no channel or color-space props. A ColorSlider adjusts a single channel.

## Output format

`onChange` returns the typed color as a CSS string in the color space of the value you passed, the way ColorArea and ColorSlider do: `rgba()` for a hex or rgb value and `hsla()` for an hsl or hsb value, and `rgba()` when there is no value. The field still shows and submits uppercase hex whatever the space. The Basic ColorField example passes a hex value, so it receives `rgba()` strings.
