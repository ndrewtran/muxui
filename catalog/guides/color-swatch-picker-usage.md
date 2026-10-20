# ColorSwatchPicker usage

Give the picker an accessible name and Mux UI color-string items.

## Presets or arbitrary colors

- Use ColorSwatchPicker to choose one color from a fixed set of presets, such as a theme palette.
- Use a [ColorField](/components/color-field/) when people may enter any color.
- Use a [ColorPicker](/components/color-picker/) to offer presets beside exact entry. The swatches then edit the same color as the other controls.

## Focus, selection, and read-only

Arrow keys move focus between swatches without selecting one. A press on a swatch, or Space or Enter on the focused swatch, selects it. A read-only picker keeps the arrow-key movement, so its swatches can still be inspected, and blocks selection, so its value does not change. The Read-only ColorSwatchPicker example shows a palette that stays fixed.

## Content

- Give each item a distinct color, because options are keyed by color.
- Give an item a `label` to name its swatch. Otherwise the swatch uses the name of its color.

## Common mistake

Giving two items the same color, such as one for Primary and one for Link. Items are keyed by color, so a duplicate throws a TypeError, even when the two are written differently, such as `#fff` and `#ffffff`. Keep one item per color.
