---
id: muxui:guide:foundations-reference-tokens
---

# Reference tokens

Reference tokens are stable primitives: palette steps, dimensions, radii, font families, weights, line heights, durations, easing strings, and typed effects. They are the base vocabulary used by semantic roles. Their metadata is generally `overridePolicy: fixed`, so consumers should not override them in authoring documents.

Use a reference token when defining a new semantic role or when a low-level recipe needs the canonical scale. Prefer the semantic role in component and application CSS.

```css
.stack {
  gap: var(--muxui-reference-dimension-space-s);
}

.caption {
  font-family: var(--muxui-semantic-typography-mono-font-family);
}
```

The 3.1 notice shortens typography alias chains to four base family stacks. The seven reference `*-font-family` aliases remain exported with deprecation metadata through 4.0.0, but they are implementation details. Use semantic family roles such as `semantic.typography.text-font-family` and `semantic.typography.mono-font-family` in consumer code.

Motion reference durations use the canonical `reference.motion.duration-instant`, `-fast`, `-moderate`, `-slow`, and `-deliberate` names. The older `reference.duration.*` aliases remain only during the notice window. `reference.duration.fast` retains a reduced-motion branch of 0ms, while preferred raw `reference.motion.duration-fast` is fixed at 120ms; use a semantic role when migrating behavior that needs the reduced branch. Reference primitives provide values; semantic roles provide interface intent and mode behavior.

The explorer shows each alias chain and its compiler-resolved value. A reference dimension may also carry a fluid recipe; static output is the default, and responsive output is opt-in through the documented responsive attribute.

Common mistake: using a reference palette step because its current hex looks right or exposing a raw reference family alias in component CSS. A semantic role preserves intent across light, dark, contrast, density, motion, and future theme changes.
