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

Scale derives the radius family from its curvature input. The shape explorer keeps specimens the same size so radius differences are comparable and shows the alias path back to its reference value.

Common mistake: using a full radius on every control or copying a pixel radius into a component. Curvature and semantic role should decide the shape, and the role must remain available in every supported mode.
