---
id: muxui:guide:token-migration
---

# Token contract migration

The current versions are `schemaVersion` and `tokenContractVersion` in the
`muxui:token:default-theme` source. Token contract `7.0.0` replaced the
TagGroup colour tokens, and `6.0.0` changed the meaning of the spring-bearing
transition tokens; both are described below. Token contract `5.2.0` added two component-owned DataDiff change backgrounds derived from
existing status accents, `5.1.0` added the separate CodeBlock change
backgrounds, and `5.0.0`
added typed easing and transition compositions while retaining the `4.0.0`
removals. Those versions are past migration steps. Removed names are not
exported, emitted as CSS variables, accepted by authoring documents, or
available to component recipes. This guide is a direct change map for the
current contract.

Easing overrides now use a typed value. Replace a string override such as
`{ "type": "string", "unit": "string", "value": "cubic-bezier(0.2, 0, 0, 1)" }`
with `{ "type": "easing", "unit": "structured", "value": { "kind":
"cubic-bezier", "x1": 0.2, "y1": 0, "x2": 0, "y2": 1 } }`. Transition
overrides keep their canonical references and may adjust approved spring
settings:

```json
{
  "type": "transition",
  "unit": "structured",
  "value": {
    "kind": "transition",
    "duration": "semantic.motion.interaction-duration",
    "spring": {
      "kind": "time",
      "visualDuration": "semantic.motion.interaction-duration",
      "bounce": 0.2
    }
  }
}
```

Token contract `7.0.0` is a breaking change to the TagGroup component tokens.
Tags take a colour (neutral, brand, the status colours, and 17 hue families) and
a variant, and a selected tag keeps its label colour while hovered, so
`component.taggroup.selected-foreground-hover` is removed. An authoring
document that overrides it is rejected as an unknown token
(`MUXUI_THEME_OVERRIDE_UNKNOWN`, or `MUXUI_TOKEN_OVERRIDE_UNKNOWN` from the
compiler); override the selected label of the colour, such as
`component.taggroup.brand-selected-foreground`, instead.
`component.taggroup.tag-background` now aliases the translucent
`semantic.action.neutral-background` rather than `semantic.surface.subtle`, so
neutral tags paint over any surface. The new tokens are
`component.taggroup.<colour>-foreground`, `-strong-foreground`, `-dot`,
`-tint-weak`, `-tint-heavy`, `-selected-background`, and `-selected-foreground`
for each colour, the `neutral-dot` and `neutral-selected-*` roles, and the
shared `selected-overlay-scheme` and `selected-overlay-light`. Authoring
documents declare `7.0.0`.

Token contract `6.0.0` is a breaking change to transition tokens. The
interaction, state, dismiss, reveal, content-resize, modal, and modal-dismiss
transitions carry a spring, and
`--muxui-semantic-motion-<role>-transition`, `-transition-duration`, and
`-transition-easing` now resolve to that spring's settle duration and
`linear()` curve instead of the perceived duration and a keyword or
cubic-bezier. A transition duration therefore means settle time, and the modal
and modal-dismiss transitions gained springs. A transition record that declares
a spring names no easing token, and a transition override must keep its
record's shape: an override for a spring role must keep the authored spring, as
in the example above, or it is rejected with
`MUXUI_TOKEN_MOTION_TRANSITION_TOPOLOGY`, and an override that adds an easing
reference to a spring is rejected with `MUXUI_TOKEN_MOTION_TRANSITION_INVALID`.
Because no spring composite reads them, `semantic.motion.reveal-easing`,
`semantic.motion.dismiss-easing`, and `semantic.motion.modal-easing` are
removed, and an authoring document that overrides one is rejected as an unknown
token (`MUXUI_THEME_OVERRIDE_UNKNOWN`, or `MUXUI_TOKEN_OVERRIDE_UNKNOWN` from
the compiler). `semantic.motion.interaction-easing` stays for determinate
progress interpolation. No compatibility aliases are provided: authoring
documents declare `6.0.0`, replace a consumer's raw `<role>-duration` and
`<role>-easing` pair with the composite's `-transition-duration` and
`-transition-easing`, and replace a scope's base-duration override with the
composite override described in the Motion foundation guide. Component records
now list the composites each component reads instead of `feedback-duration`.

Token contract `4.0.0` removed redundant or unused token IDs before consumer
adoption. The change map below lists them.

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
| `semantic.action.selection-pressed` | Use `semantic.action.background-pressed` for the pressed primary-action background in both schemes. It resolves to `semantic.color.color-80`, two scale steps from the rest fill and away from the label. `semantic.action.selection-background-pressed` remains only for compatibility; no component uses it. |
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

Authoring documents must declare the source's `tokenContractVersion` and
reference only current token IDs. The compiler validates an exact contract match; it does
not normalize older same-major documents or rewrite overrides. Scale imports
follow the same rule. Saved Scale settings accept numeric curvature factors and
numeric contrast pivots (or `auto`); invalid values are rejected without conversion.
Regenerate or update a document by choosing current
roles and preserving each explicit override and mode branch deliberately.

Scale's private Typography role matrix remains a projection over the canonical
source. It derives seven roles, six metric groups, and 25 size variants. Bulk
Weight, Leading, and Tracking edits are explicit typed semantic overrides;
expressive content keeps its own family while sharing the text metric tokens.
