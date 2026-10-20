# ColorSwatch usage

Pass a valid Mux UI color string to `ColorSwatch`. Add `secondaryColor` for a
diagonal two-tone preview and `shape="circle"` for a circular outline. The
default `shape="square"` retains the existing token-based corner radius.

Both colours retain their alpha. The accessible name describes both colours
in the current locale. Supply `colorName` to provide your own localized name
for the complete preview, and `aria-label` for additional context.

```tsx
<ColorSwatch
  color="#4967d8"
  secondaryColor="#e1e5f0"
  shape="circle"
  colorName="Blue and pale grey"
  aria-label="Workspace theme"
/>
```

## ColorSwatch or ColorSwatchPicker

- Use ColorSwatch to show a color, or a two-tone pair such as a theme, that people look at but do not change.
- Use [ColorSwatchPicker](/components/color-swatch-picker/) to let people choose one color from a set of presets.
- Use [ColorPicker](/components/color-picker/) to edit a color.

## Content

Write `colorName` as one short phrase for the whole preview, such as Blue and pale grey, not a list of color codes.

## Common mistake

Using ColorSwatch as a button or a choice. It is a preview with no press or selection behavior, so use ColorSwatchPicker to choose a color.
