# ColorPicker usage

Compose Mux UI color controls under ColorPicker to share one value.

## Disabled and read-only

`disabled` and `readOnly` on the ColorPicker apply to every Mux UI color control inside it, however deeply the control is wrapped, so they do not need repeating on each child. A child cannot turn a flag off once the picker sets it. Native elements inside the picker are not affected. The Disabled ColorPicker example disables a slider and a field from the picker.
