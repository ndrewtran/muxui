---
id: muxui:guide:foundations-typography
---

# Typography

The default theme declares Inter for display and body text, Playfair Display for expressive content, and Roboto Mono for technical content. Typography roles bind a family, colour, size, weight, line height, and letter spacing so a specimen shows the complete role rather than an isolated number.

Use semantic family roles in application and component CSS. Display, heading, and title content use their corresponding display family role; body text uses the text family role; labels use the label family role; code uses the mono family role; and expressive content uses the expressive family role.

```css
.page-title {
  font-family: var(--muxui-semantic-typography-display-font-family);
  font-size: var(--muxui-semantic-typography-display-m-font-size);
  font-weight: var(--muxui-semantic-typography-display-font-weight);
  line-height: var(--muxui-semantic-typography-display-line-height);
}

.prose {
  font-family: var(--muxui-semantic-typography-text-font-family);
}
```

Contract 4.0.0 removes the legacy semantic family names `semantic.typography.display-font`, `body-font`, `mono-font`, and `expressive-font`. Use the corresponding `*-font-family` roles in authoring and CSS.

The removed reference family aliases were implementation details. Preferred semantic roles point directly to the four base reference stacks:

| Semantic role | Base reference stack |
| --- | --- |
| `display-font-family`, `heading-font-family`, `title-font-family` | `reference.typography.display-font` |
| `label-font-family`, `text-font-family` | `reference.typography.body-font` |
| `mono-font-family` | `reference.typography.mono-font` |
| `expressive-font-family` | `reference.typography.expressive-font` |

Application and component guidance should use the semantic family role that describes the content.

The source keeps seven typography roles and 25 size variants in six metric groups. Display, heading, and title use weight 600; label uses 500; text and mono use 400. Expressive uses its own family, but shares the text role's size, weight, line-height, and tracking metrics, so expressive text remains regular 400. The six 1.5 line-height defaults use the shared relaxed line-height reference, and shared weight references keep equivalent roles aligned.

Static `body-size`, `small-size`, and `tiny-size` are utility metrics. They remain distinct from the fluid role variants. Likewise, `label-weight` remains a semibold 600 utility role while `label-font-weight` is the label role's 500 default; do not merge them when migrating overrides.

Use `display-color`, `text-color`, and `mono-color` for adaptive typography. These active colour roles have dark branches. The removed `display-default-color`, `text-default-color`, and `mono-default-color` were fixed light-mode roles; choose an active color role deliberately when migrating.

The explorer renders actual sample text at the canonical metrics and shows the site value after Scale is applied. Size, weight, leading, and tracking remain separate roles, so theme overrides can change one dimension without silently changing the others. Scale's Typography role matrix derives the same seven roles, six metric groups, and 25 size variants from the source. Its bulk Weight, Leading, and Tracking edits write explicit typed semantic overrides; expressive keeps its own family while its size, weight, leading, and tracking cells stay linked to the body/text group.

Common mistake: assigning a display size to long body copy, using the mono family for ordinary labels, or treating a reference alias as an application contract. Typography roles carry both hierarchy and reading purpose.
