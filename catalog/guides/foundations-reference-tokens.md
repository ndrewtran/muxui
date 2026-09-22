---
id: muxui:guide:foundations-reference-tokens
---

# Reference tokens

Reference tokens are stable primitives: palette steps, dimensions, radii, font families, weights, line heights, durations, typed easing definitions, and typed effects. They are the base vocabulary used by semantic roles. Their metadata is generally `overridePolicy: fixed`, so consumers should not override them in authoring documents.

Use a reference token when defining a new semantic role or when a low-level recipe needs the canonical scale. Prefer the semantic role in component and application CSS.

```css
.stack {
  gap: var(--muxui-reference-dimension-space-s);
}

.caption {
  font-family: var(--muxui-semantic-typography-mono-font-family);
}
```

The current token contract keeps four base typography reference stacks. The removed reference `*-font-family` aliases were a historical 4.0 detail; use semantic family roles such as `semantic.typography.text-font-family` and `semantic.typography.mono-font-family` in consumer code.

Motion reference durations use the canonical `reference.motion.duration-instant`, `-fast`, `-moderate`, `-slow`, and `-deliberate` names. The older `reference.duration.*` aliases were removed. `reference.motion.duration-fast` is fixed at 120ms; use a semantic role when reduced-motion behavior is part of the contract. Reference primitives provide values; semantic roles provide interface intent and mode behavior.

Palette primitives use numbered names such as `reference.color.red-60` and `reference.color.error-60`. Unnumbered hue and status aliases are not exported. Scrims use theme-aware `semantic.effect.scrim` or `semantic.overlay.scrim` roles.

The explorer shows each alias chain and its compiler-resolved value. A reference dimension may also carry a fluid recipe; static output is the default, and responsive output is opt-in through the documented responsive attribute.

Common mistake: using a reference palette step because its current hex looks right or exposing a raw reference family alias in component CSS. A semantic role preserves intent across light, dark, contrast, density, motion, and future theme changes.
