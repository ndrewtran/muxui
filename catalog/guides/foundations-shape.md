---
id: muxui:guide:foundations-shape
---

# Shape

Shape roles communicate hierarchy through corner radius. Reference radii include none, xs, s, m, l, xl, 2xl, and full values. Generic semantic radius roles mirror the xs and s levels, while purpose-specific roles assign independent values to indicators, controls, options, containers, overlays, and pills.

Use a role that matches the surface: `semantic.control.radius` for controls, `semantic.shape.container-radius` for grouped containers, `semantic.shape.overlay-radius` for modal surfaces, and `semantic.shape.pill-radius` for intentionally full shapes.

```css
.panel {
  border-radius: var(--muxui-semantic-shape-container-radius);
}

[role='dialog'] {
  border-radius: var(--muxui-semantic-shape-overlay-radius);
}
```

Contract 4.0.0 removes the unused `semantic.shape.thumb-radius` and `semantic.shape.wheel-radius` roles. They have no equivalent replacement. Move an explicit value to component-owned geometry only after identifying the actual thumb or wheel contract.

Scale derives the radius family from its curvature input. The shape explorer keeps specimens the same size so radius differences are comparable and shows the alias path back to its reference value. Other geometry, density, and fluid recipes remain available; at the default curvature, `semantic.shape.radius-xs` resolves to 4px through `reference.dimension.radius-xs` and `semantic.shape.radius-s` resolves to 6px through `reference.dimension.radius-s`.

Common mistake: using a full radius on every control, copying a pixel radius into a component, or replacing a retired role with a nearby value. Curvature and semantic role should decide the shape, and the role must remain available in every supported mode.
