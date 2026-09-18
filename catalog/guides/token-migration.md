---
id: muxui:guide:token-migration
---

# Token contract migration

Token schema `2.2.0` and token contract `3.1.0` introduce a notice window for streamlining the public token surface. Deprecated IDs remain exported during the notice and are scheduled for removal in `4.0.0`. Deprecation metadata on the canonical token source is the authority for each ID. This guide explains why names changed and how to migrate explicit CSS and theme authoring without changing a consumer's visual contract by accident.

## Migration method

1. Inventory token IDs in CSS, theme overrides, authoring documents, and component recipes.
2. Replace a legacy ID with its preferred role only where the new role preserves the intended value, mode branches, and override scope.
3. Keep a legacy reference during the notice when a scoped or consumer-owned override depends on it. A deprecation replacement is guidance, not an automatic override migration.
4. Check light and dark colour modes, comfortable and compact density, responsive output, and full and reduced motion after each family of changes.

There is no generic migration engine. The compiler validates the canonical source and reports deprecated usage; it does not rewrite arbitrary CSS or infer a replacement for a role whose value has a different meaning.

## Saved authoring documents

Existing `muxui-theme-authoring-v1` documents with `tokenContractVersion: "3.0.0"` are accepted against the current 3.1 source during this notice. Validation, compilation, and serialization use a normalized 3.1.0 copy while preserving the document's overrides, modes, and Scale inputs. The input object is not mutated. Newly generated documents use 3.1.0, and future or otherwise incompatible contract versions remain rejected.

## Typography families

Use semantic family roles in component and application CSS. The preferred mappings for the legacy semantic names are:

| Legacy role | Preferred role | Migration note |
| --- | --- | --- |
| `semantic.typography.display-font` | `semantic.typography.display-font-family` | Use for display content. |
| `semantic.typography.body-font` | `semantic.typography.text-font-family` | Use `label-font-family` for labels and controls when that role is the intent. |
| `semantic.typography.mono-font` | `semantic.typography.mono-font-family` | Use for code and technical content. |
| `semantic.typography.expressive-font` | `semantic.typography.expressive-font-family` | Keep expressive content's own family. |

The old names remain available through the notice so existing CSS and theme customization can continue to resolve. Update explicit overrides deliberately; a consumer's legacy font override is not automatically copied to the preferred role.

Seven reference family aliases are also deprecated. Preferred semantic roles now point directly to the base reference stacks: display, heading, and title use `reference.typography.display-font`; label and text use `reference.typography.body-font`; mono uses `reference.typography.mono-font`; and expressive uses `reference.typography.expressive-font`. Consumer guidance should use the semantic role rather than a raw reference alias.

Typography still has seven roles and 25 size variants in six metric groups. Display, heading, and title use 600; label uses 500; text and mono use 400. Expressive keeps its own family but shares text's size, weight, line-height, and tracking metrics, so expressive remains 400. The six 1.5 line-height defaults use the shared relaxed line-height reference. Static `body-size`, `small-size`, and `tiny-size` remain separate from fluid variants, and `label-weight` 600 remains separate from `label-font-weight` 500.

Use active `display-color`, `text-color`, and `mono-color` roles for adaptive text. Their dark branches are part of the contract. The deprecated `*-default-color` roles preserve legacy light-mode values and have no silent dark-mode alias, so do not replace them by assuming their value will follow a dark theme.

## Motion names and behavior

Use `reference.motion.duration-instant` (0ms), `-fast` (120ms), `-moderate` (180ms), `-slow` (300ms), and `-deliberate` (500ms). The five `reference.duration.*` aliases remain exported only for the notice and are scheduled for removal in 4.0.0. The legacy `reference.duration.fast` alias has a reduced-motion branch of 0ms; the preferred raw `reference.motion.duration-fast` reference is fixed at 120ms. When migrating that usage, choose the semantic role that owns the reduced behavior, such as `semantic.motion.feedback-duration`, rather than assuming the raw references are interchangeable. Exact duration matches may share these primitives, but each semantic role keeps its purpose and reduced-motion behavior.

Use `semantic.motion.feedback-duration` in place of `semantic.motion.feedback`. The generic roles `feedback-easing`, `state-easing`, `enter-duration`, `enter-easing`, `exit-easing`, `content-duration`, and `content-easing` do not form a replacement API. The deprecated easing roles and generic enter/content roles have no direct replacement; choose the actual component or purpose role that owns the transition. The active `exit-duration` role remains available with its existing reduced branch.

Keep the specific 150ms interaction, 200ms reveal, 600ms content resize, 1000ms spinner, 1200ms sweep, and 1500ms travel roles. Feedback, state, and exit use Fast in full motion and Instant in reduced motion. Progress reduced motion is separate from duration selection; do not implement it by forcing every progress duration to zero.

## Surfaces, effects, and elevation

`semantic.surface.body-background` is deprecated with `semantic.surface.subtle` as its preferred authoring role. This is primarily a Storybook and consumer migration. Preserve any existing legacy override before moving it, because `surface.background`, `surface.canvas`, and `surface.raised` remain independent contracts even when defaults happen to match.

All nine elevation roles remain public, including `semantic.elevation.tooltip` and `semantic.elevation.toast`. Tooltip and toast component CSS now consume those roles directly, so theme changes can control their shadows. The deprecated `semantic.effect.scrim-subtle` and `semantic.effect.scrim-strong` have no equivalent replacement. Existing `semantic.effect.scrim` and `semantic.overlay.scrim` remain supported; choose one by modal layering intent rather than by nearest current opacity.

## Geometry roles without replacements

The notice retains these unused roles until `4.0.0`:

- `semantic.layout.navigation-inset-block` (6px)
- `semantic.layout.content-row-min-height` (28px)
- `semantic.shape.thumb-radius` (2px)
- `semantic.shape.wheel-radius` (24px)

They have no equivalent replacements. Do not point them at a nearby inset, spacing, or radius role with a different value. If a real consumer still needs one, move the explicit value to the component-owned geometry after identifying the contract that consumes it. Other geometry, density, and fluid roles remain available; micro and compact radius roles continue to borrow spacing in this pass.

## Scale authoring

Typography edits should be treated as grouped decisions: a role's family and its size, weight, line-height, and tracking metrics need to be reviewed together.

For the complete source metadata, inspect `catalog/tokens/default-theme.json`. Do not build a second migration registry from this page or from guide records.
