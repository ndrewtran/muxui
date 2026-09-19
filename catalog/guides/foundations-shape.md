---
id: muxui:guide:foundations-shape
---

# Shape

Shape roles communicate hierarchy through corner radius. Reference radii include none, compact, small, medium, large, extra-large, and full values. Semantic roles assign those values to indicators, utility surfaces, controls, options, containers, overlays, wheels, and pills.

Use a role that matches the surface: `semantic.control-radius` for controls, `semantic.shape.container-radius` for grouped containers, `semantic.shape.overlay-radius` for modal surfaces, and `semantic.shape.pill-radius` for intentionally full shapes.

```css
.panel {
  border-radius: var(--muxui-semantic-shape-container-radius);
}

[role='dialog'] {
  border-radius: var(--muxui-semantic-shape-overlay-radius);
}
```

Contract 4.0.0 removes the unused `semantic.shape.thumb-radius` and `semantic.shape.wheel-radius` roles. They have no equivalent replacement. Move an explicit value to component-owned geometry only after identifying the actual thumb or wheel contract.

Scale derives the radius family from its curvature input. The shape explorer keeps specimens the same size so radius differences are comparable and shows the alias path back to its reference value. Other geometry, density, and fluid recipes remain available; micro and compact radius roles continue to borrow the spacing scale in this pass.

Common mistake: using a full radius on every control, copying a pixel radius into a component, or replacing a retired role with a nearby value. Curvature and semantic role should decide the shape, and the role must remain available in every supported mode.
