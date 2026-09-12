---
id: muxui:guide:foundations
---

# Foundations

Foundations are the shared vocabulary behind Mux UI. Start with the [reference tokens](/foundations/reference-tokens/) when you need a stable scale, then choose a [semantic role](/foundations/semantic-tokens/) for the job your interface is doing. [Component tokens](/foundations/component-tokens/) are the final, component-owned customization points.

Use the [colour](/foundations/colour/), [typography](/foundations/typography/), [spacing](/foundations/spacing/), [shape](/foundations/shape/), [elevation](/foundations/elevation/), and [motion](/foundations/motion/) pages to inspect each family with visual specimens. Values and meanings come from the canonical default theme. The explorer also shows the current site value when a theme has been applied in [Scale](/scale/).

```css
.card {
  color: var(--muxui-semantic-content-default);
  background: var(--muxui-semantic-surface-raised);
  border: 1px solid var(--muxui-semantic-border-default);
}
```

Do not copy a resolved colour or dimension into application CSS. Use the role that describes the intended use, and let the generated theme supply its value in each supported mode. The [Themes & tokens guide](/themes/) explains the generated stylesheet and mode contract; [Scale](/scale/) is the browser editor for creating a theme.

Common mistake: treating reference values as a complete component API. Reference tokens establish scales, while semantic and component tokens communicate intent and remain the supported customization boundary.
