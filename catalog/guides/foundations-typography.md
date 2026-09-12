---
id: muxui:guide:foundations-typography
---

# Typography

The default theme declares Inter for display and body text, Playfair Display for expressive content, and Roboto Mono for technical content. Typography roles bind a family, colour, size, weight, line height, and letter spacing so a specimen shows the complete role rather than an isolated number.

Use display and heading roles for page hierarchy, title and label roles for compact hierarchy, body roles for reading, and mono roles for code and token identifiers. Choose a variant whose size and leading suit the content.

```css
.page-title {
  font-family: var(--muxui-semantic-typography-display-font);
  font-size: var(--muxui-semantic-typography-display-m-font-size);
  font-weight: var(--muxui-semantic-typography-display-font-weight);
  line-height: var(--muxui-semantic-typography-display-line-height);
}
```

The explorer renders actual sample text at the canonical metrics and shows the site value after Scale is applied. Size, weight, leading, and tracking remain separate roles, so theme overrides can change one dimension without silently changing the others.

Common mistake: assigning a display size to long body copy or using the mono family for ordinary labels. Typography roles carry both hierarchy and reading purpose.
