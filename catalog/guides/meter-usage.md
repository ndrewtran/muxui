# Meter usage

Use Meter for showing a non-changing measurement. Keep its Mux UI-owned props and accessible name semantics intact.

## Value text

By default the value text is the value's position in the range as a percent, and the fill shows the same position. A `formatOptions` value that does not set the percent style formats the clamped value itself instead, while the fill still shows the position in the range. Numbers follow the default locale of the environment that renders them. The Meter with a custom range example shows both formats over one range.

## Naming a Meter

The `label` prop is the visible name and is required by the type, but Meter does not render it when `aria-label` or `aria-labelledby` is supplied. Meter then shows only its value text, so the application renders any visible label. The Meter with an external label example names a Meter with `aria-labelledby` and renders the label outside it.
