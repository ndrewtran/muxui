---
id: muxui:guide:foundations-elevation
---

# Elevation and effects

Elevation is a typed shadow effect paired with a surface role. The nine semantic elevation roles remain public: `flat`, `raised`, `control`, `floating`, `indicator`, `modal`, `overlay`, `tooltip`, and `toast`. Reference effects provide shadow geometry, while these roles assign depth to interface situations.

Use the smallest elevation that separates a surface from its surroundings. Keep the surface fill semantic and use elevation for depth, not as a replacement for a border or contrast role.

The control shadow retains seven layers, including four transparent placeholders, so `box-shadow` transitions can interpolate; any layer reduction requires transition and rendered-visual validation.

```css
.popover {
  background: var(--muxui-semantic-surface-raised);
  border: 1px solid var(--muxui-semantic-border-popup);
  box-shadow: var(--muxui-semantic-elevation-floating);
}

.tooltip {
  box-shadow: var(--muxui-semantic-elevation-tooltip);
}
```

Tooltip and toast styles consume their semantic elevation roles directly. The tooltip role resolves to the small shadow recipe, and the toast role resolves to the deep toast recipe. Keeping the token reference in component CSS lets a theme change those effects without reintroducing a hardcoded shadow.

Contract 4.0.0 removes `semantic.effect.scrim-subtle` and `semantic.effect.scrim-strong`. They have no direct replacement. Use `semantic.effect.scrim` or `semantic.overlay.scrim` for supported modal scrims, choosing the role by modal layering intent.

The explorer renders each structured effect over a consistent surface, with its compiler-resolved value and alias chain. It also distinguishes the canonical default value from the live value supplied by the applied Scale theme.

Common mistake: adding a stronger shadow to make a weak surface readable, or replacing a retired scrim strength with the nearest value. Start with the correct surface and border roles, then use the elevation or scrim role appropriate to the layer.
