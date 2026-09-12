# Decision 0013: React parity and private Mux theme authoring

- Status: accepted
- Decision owner: Andrew
- Scope: React parity, canonical tokens/themes, private Scale authoring, and
  the R1.6 supplemental binding boundary

## Decision

Mux UI adopts complete Mux-owned token/theme data and applicable React Aria
visual and interaction parity as a prepublication foundation. The private
`apps/scale` authoring surface may add, edit, preview, import, export, persist,
and round-trip themes through canonical Mux UI types, modes, aliases, and
override safety. It is an internal authoring surface and does not become a
public hosted product.

The React Aria Components `1.20.0` identity remains an internal replaceable
substrate. `@muxui/react` owns public contracts, behavior, CSS, exports, and
lifecycle. `catalog/tokens/` owns canonical token/theme facts,
`@muxui/tokens` owns transforms, and Scale owns only its private editor and
projection. No upstream implementation type, object, import path, or editor
state crosses the public boundary.

## R1.6 scope

The exact supplemental React Aria binding roots are:

`AlertDialog`, `ButtonGroup`, `Card`, `CheckboxField`,
`ColorModeToggle`, `CommandPalette`, `HeaderNav`, `InputTags`,
`Input`, `MultiSelect`, `PaymentInput`, `ProgressCircle`,
`RadioField`, `Sidebar`, `SwitchField`, `TagSelect`, `TextArea`,
`TextEditor`, `Resizable`, `Lightbox`, and `Markdown`.

`Resizable` uses `react-aria/useMove`; `Lightbox` and `Markdown` are
indirect React Aria-backed roots. `Drawer` and `FileUpload` remain
standalone vanilla controls outside this supplemental scope. `RadioGroup`
and `ToggleGroup` are already covered by existing mappings. These 21 roots
require Mux UI binding mapping and proof before any export or availability
claim.

R1.6 covers admitted token values, modes, palette families, Inter, Playfair
Display, and Roboto Mono font families, display/heading/title/label/body/
mono/expressive typography roles, and standard and mono presets. Canonical
Mux UI names are the public vocabulary. Applicable third-party font
license/notice requirements remain in force.

## Required proof and boundaries

- Matched light/dark fixtures compare CSS, anatomy, interaction, variants, and
  states for every mapped component. Missing states or fixtures fail closed.
- Storybook examples render canonical Mux UI tokens and themes as projections;
  they do not own canonical data.
- Scale round-trip proof includes visible loss/rejection diagnostics and
  override-safety checks.
- An optional Tailwind consumer adapter may compile a clean consumer, while
  Tailwind remains outside Mux runtime, peer, generated-source, and
  styling-engine closure.
- Exact internal replaceable dependencies remain module-isolated:
  `lucide-react@1.37.0` for the approved affordances,
  `react-aria@3.51.0` for `Resizable`, `marked@13.0.3` for the typed
  Markdown parser boundary, and the eight `@tiptap/*@3.22.3` packages for
  `TextEditor`. Their integrity, license/notice, peer-compatibility,
  lockfile, tree-shaking, SSR/hydration, packed-consumer, and Markdown
  security proof is required.

This decision changes no token values or IDs, public API, package/platform
boundary, support claim, or release status. React Native and framework-free
web remain deferred. Publication, registry mutation, stable support, hosted
Scale, external design-tool interchange, and final-merge authorization remain
separate stops.
