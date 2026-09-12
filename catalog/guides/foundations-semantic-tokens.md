---
id: muxui:guide:foundations-semantic-tokens
---

# Semantic tokens

Semantic tokens describe interface intent. The canonical source covers content, surfaces, borders, actions, feedback, focus, typography, shape, elevation, and motion. Many roles alias reference values, but the semantic name is the contract used by components and application CSS. Semantic roles with `overridePolicy: theme` are the normal theme customization boundary.

Choose the role that matches the job: `content-default` for ordinary text, `content-strong` for headings and labels, `surface-raised` for content above the canvas, and `border-default` for ordinary control and collection edges.

```css
.field {
  color: var(--muxui-semantic-content-default);
  background: var(--muxui-semantic-surface-background);
  border: 1px solid var(--muxui-semantic-border-default);
}

.field:focus-visible {
  outline: 2px solid var(--muxui-semantic-focus-ring);
}
```

Modes are declared by the source: light and dark, standard and more contrast, comfortable and compact density, full and reduced motion, and ltr or rtl direction. The compiler validates a requested combination before emitting CSS.

Common mistake: using `content-muted` for normal-sized input text or focus indicators. Muted and faint roles are intentionally lower emphasis; use the stronger role required by the reading and interaction state.
