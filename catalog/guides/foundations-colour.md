---
id: muxui:guide:foundations-colour
---

# Colour

Colour is organized as typed ramps and semantic roles. The reference scale includes neutral families, named colour families, the Mux brand ramp, and status ramps for error, warning, and success. Semantic roles pair fills with content and foreground roles so readable text is chosen with the surface rather than by copying a shade.

Use a reference ramp when creating or inspecting a palette. Use semantic roles such as `surface-canvas`, `surface-raised`, `content-default`, `content-link`, `feedback-invalid`, and `status-success` when styling an interface.

```css
.notice {
  color: var(--muxui-semantic-content-default);
  background: var(--muxui-semantic-surface-subtle);
  border-inline-start: 3px solid var(--muxui-semantic-status-success);
}
```

The colour explorer keeps full families browsable, shows light and dark mode resolutions, and connects aliases to their resolved value and specimen. The current site value reflects the applied Scale theme; the canonical value is the default-theme reference.

Common mistake: using a brand shade as a neutral surface or using a status colour for decoration. Brand roles communicate action or selection, while status roles communicate feedback and state. Keep those meanings separate.
