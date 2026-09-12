---
id: muxui:guide:foundations-reference-tokens
---

# Reference tokens

Reference tokens are stable primitives: palette steps, dimensions, radii, font families, weights, line heights, durations, easing strings, and typed effects. They are the base vocabulary used by semantic roles. Their metadata is generally `overridePolicy: fixed`, so consumers should not override them in authoring documents.

Use a reference token when defining a new semantic role or when a low-level recipe needs the canonical scale. Prefer the semantic role in component CSS.

```css
.stack {
  gap: var(--muxui-reference-dimension-space-s);
}

.caption {
  font-family: var(--muxui-reference-typography-mono-font);
}
```

The explorer shows each alias chain and its compiler-resolved value. A reference dimension may also carry a fluid recipe; static output is the default, and responsive output is opt-in through the documented responsive attribute.

Common mistake: using a reference palette step because its current hex looks right. A semantic colour role preserves intent across light, dark, contrast, and future theme changes.
