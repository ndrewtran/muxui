# Decision 0013: Tale parity and private Mux theme authoring

- Status: accepted
- Decision owner: Andrew / `ndrewtran`
- Companion issue: [#119](https://github.com/ndrewtran/muxui/issues/119)
- Proposed decision: `muxui:decision:0013`

## Decision

Mux UI accepts complete, Mux-owned design-token/theme transfer and applicable
Tale React Aria visual and interaction parity as a required prepublication
foundation, together with a functioning private port of Tale Scale for adding,
editing, previewing, importing, exporting, persisting, and round-tripping Mux
UI themes. This decision authorizes the bounded authority and milestone scope;
it does not claim that implementation or parity evidence has passed.

The exact current donor baseline remains Tale UI commit
`94bf62a26c02605c8928dfeb24f0ddc4be1c92fd` and its existing source trees. No
donor refresh, alternate source, or moving donor checkout is selected. Tale
remains a one-time visual and structural donor, never a Mux UI runtime, build,
development, peer, generated-source, or synchronization dependency. The
historical Scale tree identity remains `85d594c05b32e473af4734ec18447a1d8df8ebdd`; this
decision does not rewrite that provenance.

Parity is classification-complete over the current donor inventory of 125
styles, including 70 donor-only styles without a fixed R1 family root. R1.6
must identify every applicable React Aria-backed root and support style, map it
to a Mux UI-owned binding identity, and explicitly exclude unrelated
marketing/layout roots with reasons. Every applicable mapping receives matched
visual and interaction fixtures, state/variant coverage, and an explicit
difference record. Missing states or fixtures fail; absence is not parity. The
fixed 53-family R1 inventory remains the historical floor. Decision 0013 admits
applicable React Aria-backed families outside it under
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001`; each requires an exact supplemental
mapping and proof before availability. There is no blanket all-125 standalone
API/export requirement and no non-Aria component is added.

The current known direct React Aria-backed supplemental roots are `AlertDialog`,
`ButtonGroup`, `Card`, `CheckboxField`, `ColorModeToggle`, `CommandPalette`,
`HeaderNav`, `InputTags`, `Input`, `MultiSelect`, `PaymentInput`,
`ProgressCircle`, `RadioField`, `Sidebar`, `SwitchField`, `TagSelect`,
`TextArea`, and `TextEditor`; `Resizable` uses `react-aria/useMove`. The
indirect React Aria-backed roots `Lightbox` and `Markdown` are also included.
`Drawer` and `FileUpload` are standalone vanilla controls outside this
supplemental React Aria scope; `RadioGroup` and `ToggleGroup` are already
covered by existing mappings. These 21 roots are inventory mapping targets,
not current exports or availability claims. Any supplemental family requires a
Mux UI binding map and proof before it becomes available.

The parity transfer includes all donor token values, modes, and all donor
palette families, including formerly deferred cool, slate, gray, onyx, and
mono families, plus font families and typography names in the Mux UI namespace.
It includes Inter, Playfair Display, and Roboto Mono; display, heading, title,
label, body, mono, and expressive typography roles; and standard and mono
presets. Historical token classifications and their evidence remain immutable;
this decision admits the additional Mux-owned facts without rewriting history.
Mux UI owns token role names, values, and meanings; original font-family names
remain font intellectual-property names. Unmodified local font assets may be
bundled for deterministic offline defaults under the applicable Google Fonts
SIL Open Font License 1.1 notices, with copyright and license files retained;
the Playfair Display binary is not modified.

Canonical ownership is fixed as follows:

- `catalog/tokens/` owns canonical token and theme data.
- `@muxui/tokens` owns deterministic web, native, and consumer build
  transforms.
- `@muxui/react` owns React DOM behavior and CSS.
- `apps/scale` owns only the private editor/projection over those sources.
- Current Storybook examples consume canonical Mux UI tokens and themes and do
  not become a second owner.

Scale import/export is bounded by stable Mux UI identity, canonical types,
modes, aliases, override policy, and explicit loss/rejection diagnostics. It
does not imply hosted/public Scale deployment or general external design-tool
interchange. Tailwind is an optional consumer build adapter generated from
Mux UI-owned transforms. Tailwind remains a consumer build dependency only:
it does not enter the Mux UI runtime, peer, generated-source, or styling-engine
closure, and a consumer compilation fixture must prove that boundary.

React Native, framework-free web, React Native Web, and cross-renderer
equivalence remain separately activated and proved. Shared token/theme sources
remain typed and renderer-neutral, without React, DOM, or CSS runtime
assumptions. No package publication, dist-tag mutation, production or consumer
mutation, stable promotion, `latest` support claim, or public support claim is
authorized by this decision.

## Acceptance and version effect

R1.6 is inserted between R1.5 and R1 exit. Its required evidence is:

- `E-R1.6-01`: classification-complete 125-style donor inventory, explicit
  applicable React Aria-backed root/support mapping and unrelated-root
  exclusions, including the 70 donor-only styles;
- `E-R1.6-02`: Mux-namespaced token, mode, palette, font, typography, and
  preset transfer with license/dependency closure;
- `E-R1.6-03`: matched light/dark CSS, anatomy, interaction, variant, and
  state fixtures with every difference reported;
- `E-R1.6-04`: current Storybook examples and canonical-source provenance;
- `E-R1.6-05`: Scale load/edit/preview/import/export/persist/round-trip and
  override-safety fixtures;
- `E-R1.6-06`: optional Tailwind adapter clean-consumer compilation and
  dependency-closure proof; and
- `E-R1.6-07`: renderer-neutral, deferred-platform, and release-boundary
  negative-path audit.

Product Scope advances from `7.0.0` to `8.0.0`. The major increment is
required because complete applicable parity and private theme-authoring proof
become prepublication React exit conditions, while additional themes move from
`deferred` to `admitted` and two new admitted capability IDs establish private
authoring and optional consumer integration boundaries. The fixed R1 family
inventory, package/publication boundary, and future-platform deferrals remain
bounded as stated above.

## Reversal

Reversal is append-only. Disable the private authoring or Tailwind capability
and retain canonical Mux UI source truth; do not rewrite the pinned donor,
historical token classifications, or retained evidence. Any future parity,
platform, public-surface, or release expansion requires a successor decision.
