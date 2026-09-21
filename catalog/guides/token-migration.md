---
id: muxui:guide:token-migration
---

# Token contract migration

Token contract `4.0.0` removes redundant or unused token IDs before consumer
adoption. The canonical source remains schema `2.1.0`; removed names are not
exported, emitted as CSS variables, accepted by authoring documents, or
available to component recipes. This guide is a direct change map for the
current contract.

## Change map

| Removed ID | Change |
| --- | --- |
| `reference.duration.fast` | Use `reference.motion.duration-fast` for the fixed 120ms primitive. Use a semantic motion role when reduced motion must resolve to 0ms. |
| `reference.duration.instant`, `reference.duration.moderate`, `reference.duration.slow`, `reference.duration.deliberate` | Use the corresponding `reference.motion.duration-*` primitive. |
| `reference.dimension.scale` | No replacement is provided; remove the unused scale token reference. |
| `reference.typography.display-font-family`, `heading-font-family`, `title-font-family` | Use the corresponding semantic family role, which resolves to `reference.typography.display-font`. |
| `reference.typography.label-font-family`, `text-font-family` | Use `semantic.typography.label-font-family` or `semantic.typography.text-font-family`. |
| `reference.typography.mono-font-family`, `expressive-font-family` | Use `semantic.typography.mono-font-family` or `semantic.typography.expressive-font-family`. |
| `semantic.typography.display-font` | Use `semantic.typography.display-font-family`. |
| `semantic.typography.body-font` | Use `semantic.typography.text-font-family` for body text; use `semantic.typography.label-font-family` for labels. |
| `semantic.typography.expressive-font` | Use `semantic.typography.expressive-font-family`. |
| `semantic.typography.mono-font` | Use `semantic.typography.mono-font-family`. |
| `semantic.typography.display-default-color`, `text-default-color`, `mono-default-color` | Use `display-color`, `text-color`, or `mono-color` when adaptive color is intended. |
| `semantic.motion.feedback` | Use `semantic.motion.feedback-duration`. |
| `semantic.surface.body-background` | Use `semantic.surface.subtle` only when the subtle surface role is the intended contract. Keep canvas, background, and raised roles distinct. |
| `semantic.motion.feedback-easing`, `state-easing`, `enter-easing`, `exit-easing`, `content-easing` | Choose the easing role owned by the actual component or transition. No generic replacement is provided. |
| `semantic.motion.enter-duration`, `content-duration` | Choose the duration role owned by the entering or content component. No generic replacement is provided. |
| `semantic.layout.navigation-inset-block`, `content-row-min-height` | Move the explicit value to component-owned geometry after identifying the consuming layout. No token replacement is provided. |
| `semantic.layout.tight-inset` | Use `semantic.layout.inset-tight` for the compact options and transient-control inset. The resolved 4xs spacing value and theme override policy are unchanged. |
| `semantic.action.selection-pressed` | Use `semantic.action.selection-background-pressed` for the dark-scheme pressed primary-action background. The resolved brand-60 value and theme override policy are unchanged. |
| `semantic.shape.micro-radius` | Use `semantic.shape.radius-xs`. The semantic role now resolves to the 4px `reference.dimension.radius-xs` value instead of the former 5.2px spacing alias. |
| `semantic.shape.compact-radius` | Use `semantic.shape.radius-s`. The semantic role now resolves to the 6px `reference.dimension.radius-s` value instead of the former 7px spacing alias. |
| `semantic.shape.thumb-radius`, `wheel-radius` | Move the explicit value to component-owned geometry after identifying the consuming control. No token replacement is provided. |
| `semantic.effect.scrim-subtle`, `scrim-strong` | Choose supported `semantic.effect.scrim` or `semantic.overlay.scrim` by modal layering intent. No strength alias is provided. |
| `semantic.control.min-height` | Use `semantic.control.size-md` for the shared default target. `component.button.min-height` remains the Button-specific role. |
| Unnumbered `reference.color` hue and error/warning/success aliases | Use the explicit numbered `-60` primitive when defining semantic roles. Consumer CSS should use the relevant semantic color role. |
| `reference.color.scrim-subtle`, `scrim-default`, `scrim-strong` | Choose `semantic.effect.scrim` or `semantic.overlay.scrim` by modal layering intent. No fixed scrim compatibility references remain. |

## Preserve behavior while changing names

The raw `reference.motion.duration-fast` primitive is fixed at 120ms. Semantic
roles such as `semantic.motion.feedback-duration` use that primitive in full
motion and switch to `reference.motion.duration-instant` in reduced motion.
Do not replace a semantic role with a raw reference when that mode behavior is
part of the contract. Check light and dark color modes, both density modes,
responsive output, and full and reduced motion after moving an override.

Typography family roles remain semantic application and component contracts.
Display, heading, and title use the display family; labels use the label
family; body copy uses the text family; code uses the mono family;
expressive content uses its own family. Adaptive `display-color`, `text-color`,
and `mono-color` roles have dark branches.

## Authoring and Scale

Authoring documents must declare `tokenContractVersion: "4.0.0"` and reference
only current token IDs. The compiler validates an exact contract match; it does
not normalize older same-major documents or rewrite overrides. Scale imports
follow the same rule. Saved Scale settings accept numeric curvature factors and
numeric contrast pivots (or `auto`); invalid values are rejected without conversion.
Regenerate or update a document by choosing current
roles and preserving each explicit override and mode branch deliberately.

Scale's private Typography role matrix remains a projection over the canonical
source. It derives seven roles, six metric groups, and 25 size variants. Bulk
Weight, Leading, and Tracking edits are explicit typed semantic overrides;
expressive content keeps its own family while sharing the text metric tokens.
