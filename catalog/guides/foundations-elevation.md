---
id: muxui:guide:foundations-elevation
---

# Elevation and effects

Elevation is a typed shadow effect paired with a surface role. Reference effects provide shadow geometry, while semantic roles such as `elevation-raised`, `elevation-floating`, `elevation-modal`, and `elevation-tooltip` assign depth to interface situations.

Use the smallest elevation that separates a surface from its surroundings. Keep the surface fill semantic and use elevation for depth, not as a replacement for a border or contrast role.

```css
.popover {
  background: var(--muxui-semantic-surface-raised);
  border: 1px solid var(--muxui-semantic-border-popup);
  box-shadow: var(--muxui-semantic-elevation-floating);
}
```

The explorer renders each structured effect over a consistent surface, with its compiler-resolved value and alias chain. It also distinguishes the canonical default value from the live value supplied by the applied Scale theme.

Common mistake: adding a stronger shadow to make a weak surface readable. Start with the correct surface and border roles, then use the elevation role appropriate to the layer. Avoid decorative depth that does not communicate hierarchy.
