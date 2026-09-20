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
