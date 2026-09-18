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

`surface.background` remains the page body background contract. Its default may match `surface.canvas`, but the roles stay independent: canvas is the page backdrop, background is the body surface, and raised is content above the canvas. Preserve those distinctions when customizing a theme.

`surface.body-background` is deprecated in the 3.1 notice and scheduled for removal in 4.0.0. Its preferred authoring replacement is `surface.subtle`, but migrate a Storybook or consumer theme only after preserving any existing override attached to the old role. The replacement metadata does not automatically move that override.

The same notice keeps deprecated semantic names exported so existing CSS can continue to resolve while explicit migrations are prepared. Read the [token contract migration guide](/token-migration/) for the complete mapping and for roles that intentionally have no replacement.

Modes are declared by the source: light and dark, standard and more contrast, comfortable and compact density, full and reduced motion, and ltr or rtl direction. The compiler validates a requested combination before emitting CSS.

Common mistake: using `content-muted` for normal-sized input text, treating canvas and raised as interchangeable, or replacing a deprecated role with the nearest value without checking its theme override and mode behavior.
