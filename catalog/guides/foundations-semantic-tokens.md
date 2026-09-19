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

`surface.body-background` was removed in contract 4.0.0. Use `surface.subtle` only when that surface role is the intended contract; canvas, background, and raised remain independent roles.

Read the [token contract migration guide](/token-migration/) for the complete removal map and for roles that intentionally have no replacement.

Modes are declared by the source: light and dark, standard and more contrast, comfortable and compact density, full and reduced motion, and ltr or rtl direction. The compiler validates a requested combination before emitting CSS.

## Tonal action and selection fills

`semantic.action.neutral-background`, `semantic.action.neutral-background-hover`, and `semantic.action.neutral-background-pressed` name the shared neutral action fills used by buttons and disclosure triggers. Their defaults mix `semantic.surface.strong` with transparency at 8%, 12%, and 16%, respectively. Pair these fills with `semantic.content.strong`.

`semantic.selection.background` provides the subtle selected-content fill used by table rows and tree items. Its default mixes `semantic.selection.track` with transparency at 12% and retains ordinary content colours. `semantic.selection.background-strong` remains the separate strong selected-content role.

These are theme-overridable colour tokens. The web transform retains their `color-mix()` expressions, so changing the source colour updates the derived fill. Override the shared role when its treatment should change across consumers. Component-specific mixes remain owned by the component. Transparency blends with the underlying surface, so compare these fills over the surfaces where they will be used.

Common mistake: using `content-muted` for normal-sized input text or treating canvas and raised as interchangeable. Choose a current semantic role by intent.
