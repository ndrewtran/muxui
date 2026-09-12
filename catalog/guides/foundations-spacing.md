---
id: muxui:guide:foundations-spacing
---

# Spacing and dimensions

Reference dimensions provide the shared space and text scales, screen limits, section rhythm, and control metrics. Semantic dimensions give those measurements a job, such as control padding, panel spacing, or minimum target size. Some dimensions include a fluid recipe; the static value is the default and responsive output is explicitly opt-in.

Use the spacing scale to create rhythm, then use a semantic role when one exists. Interactive controls have three shared targets: `semantic.control.size-sm` is 32px, `semantic.control.size-md` is 36px and the default, and `semantic.control.size-lg` is 40px.

```css
.toolbar {
  gap: var(--muxui-reference-dimension-space-s);
}

button {
  min-block-size: var(--muxui-semantic-control-size-md);
  padding-inline: var(--muxui-semantic-control-padding-inline);
}
```

The explorer uses rulers and actual control specimens, rather than presenting dimensions as an undifferentiated table. Text-bearing controls may grow with larger text. Textareas, cards, tables, calendars, and other content-driven surfaces do not inherit the control target.

Common mistake: imposing 36px on every rectangle. A control target applies to an actionable part, not its surrounding panel, grid, table, or calendar container.
