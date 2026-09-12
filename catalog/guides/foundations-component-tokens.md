---
id: muxui:guide:foundations-component-tokens
---

# Component tokens

Component tokens are the final customization points owned by a component family. The current canonical source declares Button roles for background, foreground, minimum height, inline padding, and radius. Each role aliases the semantic value that supplies its default.

Use a component token when a component needs a family-specific customization. Use the semantic token when a page-wide role should change. Do not reuse a Button token as a field or overlay contract.

```css
.muxui-button {
  min-block-size: var(--muxui-component-button-min-height);
  padding-inline: var(--muxui-component-button-padding-inline);
  border-radius: var(--muxui-component-button-radius);
  background: var(--muxui-component-button-background);
  color: var(--muxui-component-button-foreground);
}
```

The explorer groups every source-declared component token by owner, shows its semantic alias chain, and previews the visual property it controls. Component roles inherit the theme's supported colour, contrast, density, motion, and direction modes through their semantic dependencies.

Common mistake: creating a second component registry in application CSS or treating an instance value as a theme role. Keep component ownership in the canonical package contract and use the token's declared property and state boundary.
