# Neutral interactive fill ledger

Advisory source review for tonal neutral fills. This ledger records current
fills, historical audit findings, and separate design recommendations. It does
not set token policy, declare defects, or serve as release evidence or
authorization for future changes.

Historical audit baseline: branch codex/accept-react-motion, shared worktree on
2026-09-23, based on 25e273c plus the then-current uncommitted source. Core
component, field, collection, and overlay style files were already dirty at
that time. The current implementation and task-local verification below refer
to the main shared worktree. The historical branch name and dirty-file notes do
not describe the current checkout.

## Scope and token boundary

The source inventory covers the fixed 53-family snapshot and 26 supplemental
React component records (24 roots and two subpaths), mapped through the React
generator to 12 authored style sheets. This is search coverage, not a count of
issues: [family snapshot](../../../catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json),
[supplemental inventory](../../../catalog/react-r1-6/supplemental-components.json#L4),
[generator mapping](../src/generate.mjs#L936).

Include a state only when its neutral fill is supported by the source and
effective cascade. Completed entries record the implementation alongside the
historical audit fill. The canonical guide documents shared neutral
action fills for buttons and disclosure triggers: 8%, 12%, and 16% of
surface.strong source colour mixed with transparent for rest, hover, and
pressed. Selection uses a separate 12% mix of selection.track. The guide does
not direct every interactive fill to become tonal; component-specific mixes
remain component-owned and must be judged over their actual rest surface
([token guidance](../../../catalog/guides/foundations-semantic-tokens.md#L31),
[action definitions](../../../catalog/tokens/default-theme.json#L527),
[selection definitions](../../../catalog/tokens/default-theme.json#L729),
[mix guidance](../../../catalog/guides/foundations-semantic-tokens.md#L37)).

In the reviewed default theme, surface.subtle maps to adaptive neutral-12,
which resolves to neutral-default-12 in light and neutral-default-98 in dark.
Surface.hover maps to adaptive neutral-14, resolving to neutral-default-14
and neutral-default-96. These are solid ramp colours. Surface.pressed and
surface.strong are also solid roles; the action token uses surface.strong as
its source, which resolves to neutral-default-90 in light and
neutral-default-20 in dark. These roles are distinct from the tonal action
mixes ([surface roles](../../../catalog/tokens/default-theme.json#L1419),
[dark subtle alias](../../../catalog/tokens/default-theme.json#L8602),
[dark hover alias](../../../catalog/tokens/default-theme.json#L8616),
[pressed role](../../../catalog/tokens/default-theme.json#L809),
[strong role](../../../catalog/tokens/default-theme.json#L822),
[border.strong mode](../../../catalog/tokens/default-theme.json#L1562),
[dark strong alias](../../../catalog/tokens/default-theme.json#L8868)).

ListBox selected fills and ToggleButtonGroup selected fills are explicitly
excluded. Their other states remain in scope. Do not infer that body, primary,
inverse, selected, or binary indicator fills are wrong because they are solid.
Existing forced-colors behaviour remains unchanged.

## Reviewed candidates and status

**29 resolved; no open design decisions.** NF22–NF25 and NF29 use the approved B · Calibrated direction: four calibrated hover updates and one focused-foreground repair with its fill retained. NF26–NF28 now use C · Tonal: an 8% `surface.strong` transparent hover layer over each original indicator rest fill, with source borders preserved. NF20 retains keyboard focus after its pointer uplift; NF21 retains its keyboard locator. Global tokens are unchanged. Historical audit fills remain alongside the current implementation.

| ID | Component, anatomy, state | Current implementation or historical audit fill, mode and source | Confidence and assessment |
| --- | --- | --- | --- |
| ~~NF01~~ | ~~DatePicker and DateRangePicker calendar trigger, hover and mouse-active~~ | Current: B · Calibrated uses an 8% hover / 12% press `surface.strong` layer over the opaque neutral-10 light / neutral-100 dark trigger base. Historical audit fill: the unscoped hover used surface.hover; scoped hover and press stayed flat over their solid bases. [Current hover layer](../src/styles/fields.css#L1082), [press layer](../src/styles/fields.css#L1090), [light base](../src/styles/fields.css#L1051), [dark base](../src/styles/fields.css#L1073). | B · Calibrated. **Completed 2026-09-23.** Opaque rest, selected/range, unavailable, and disabled treatments remain distinct. |
| ~~NF02~~ | ~~SearchField clear button, hover and pressed~~ | Current: 8% hover and 12% pressed mixes of surface.strong with transparent. Dark-scheme hover/pressed glyph foreground uses content.default; rest and disabled foregrounds are unchanged. [Hover](../src/styles/fields.css#L366), [pressed](../src/styles/fields.css#L371), [dark state foreground](../src/styles/fields.css#L1110). Historical audit fill: surface.hover and surface.pressed, resolving to neutral-default-96 and neutral-default-70 in dark. [Hover mode](../../../catalog/tokens/default-theme.json#L8616), [pressed mode](../../../catalog/tokens/default-theme.json#L809). | High-confidence discrete neutral action (historical assessment). **Completed 2026-09-23.** B uses 8% hover and 12% pressed. |
| ~~NF03~~ | ~~NumberField steppers, hover and active~~ | Current: 8% hover and 12% active mixes of surface.strong with transparent. [Stepper states](../src/styles/fields.css#L255). Historical audit fill: hover used surface.pressed and active used border.strong, resolving to neutral-20 / neutral-70 and neutral-26 / neutral-50 in light / dark. [Pressed mode](../../../catalog/tokens/default-theme.json#L809), [border mode](../../../catalog/tokens/default-theme.json#L1562). | High-confidence button-like action (historical assessment). The control border remains separate. **Completed 2026-09-23.** |
| ~~NF04~~ | ~~Toolbar child Buttons, hover, active, and pressed~~ | Current: direct-child neutral Toolbar Buttons use 8% hover and 12% active/data-pressed mixes of surface.strong with transparent. Pressed states retain the scoped normal foreground; the outer surface and variants are unchanged. [Direct-child rules](../src/styles/collections.css#L1835), [generic hover/press](../src/styles/collections.css#L1855), [light hover/press scopes](../src/styles/collections.css#L2244), [dark hover/press scopes](../src/styles/collections.css#L2250). Historical audit fill: scoped solid neutral-18 in light and neutral-92 in dark; generic states used surface.hover. | High-confidence neutral action (historical assessment). **Completed 2026-09-23.** |
| ~~NF05~~ | ~~ToggleButton and ToggleButtonGroup unselected button, hover~~ | Current: unselected hover uses an 8% surface.strong mix with transparent. [Base hover](../src/styles/components.css#L753), [dark hover](../src/styles/components.css#L1248). Historical audit fill: solid neutral-14 in base and dark rules. The motion-ready group trailing button still suppresses hover fill during its trailing phase. [Group trailing rule](../src/styles/components.css#L855). | High-confidence neutral action (historical assessment). Selected ToggleButtonGroup states and trailing suppression remain unchanged. **Completed 2026-09-23; hover only.** |
| ~~NF06~~ | ~~TagGroup unselected tag, hover and pressed; tag remove button, hover~~ | Current: unselected tag keeps its opaque rest with 3% hover / 8% pressed overlay layers; the transparent remove target uses an 8% hover mix. Selected tag treatment is unchanged. Historical audit fill: surface.hover / surface.pressed on the tag and surface.hover on remove; selected hover used action.background-hover. [Tag hover layer](../src/styles/collections.css#L1737), [pressed layer](../src/styles/collections.css#L1745), [selected hover](../src/styles/collections.css#L1768), [remove base](../src/styles/collections.css#L1781), [remove hover](../src/styles/collections.css#L1801). | B · Calibrated. **Completed 2026-09-23.** The opaque tag base, selected accent treatment, focus ring, and remove target remain distinct. |
| ~~NF07~~ | ~~Card button variants, hover and pressed~~ | Current: outlined/elevated/filled hover layers are 3% / 2% / 4%; outlined/filled pressed are 8%, elevated pressed 6%. Variant bases, borders, and elevations remain separate; selected elevated hover/press also retain the inset ring with matching elevation. Historical audit fill: hover was neutral-10 on outlined/elevated and neutral-14 on filled; pressed was neutral-18 on outlined/filled and neutral-14 on elevated. [Outlined hover](../src/supplemental/styles.css#L305), [elevated hover](../src/supplemental/styles.css#L313), [filled hover](../src/supplemental/styles.css#L321), [outlined/filled pressed](../src/supplemental/styles.css#L328), [elevated pressed](../src/supplemental/styles.css#L337), [selected inset ring](../src/supplemental/styles.css#L350), [selected hover ring/elevation](../src/supplemental/styles.css#L356), [selected pressed ring/elevation](../src/supplemental/styles.css#L362). | B · Calibrated. **Completed 2026-09-23.** Strength varies by variant to preserve its base hierarchy and elevation. |
| ~~NF08~~ | ~~HeaderNav and Sidebar navigation/actions, hover~~ | Current: light controls keep their 4% neutral-10 hover layer, and safe dark noncurrent navigation keeps 4% neutral-100. The six previously deferred dark controls now use a 4% neutral-100 hover mix with transparent. HeaderNav mobile trigger/close and Sidebar dismiss/mobile menu/mobile close use neutral-100 foregrounds; the account trigger uses neutral-60 at rest and focus-only, neutral-100 on hover. Historical hover fill: neutral-96 light / neutral-20 dark, with dark foreground collisions. [Light uplift](../src/supplemental/styles.css#L2840), [safe dark uplift](../src/supplemental/styles.css#L2856), [six dark hover repairs](../src/supplemental/styles.css#L2866), [dark foregrounds](../src/supplemental/styles.css#L2882), [account foreground](../src/supplemental/styles.css#L2895). | B · Calibrated. Completed 2026-09-24. Resting surfaces, light mode, current-page treatments, geometry, and focus remain unchanged. The six new tonal hover rules apply only outside forced-colors mode, preserving its prior system-colour treatment. |
| ~~NF09~~ | ~~MultiSelect footer action button, hover~~ | Current: transparent-rest footer action uses an 8% hover mix; neutral-30 border and focus treatment remain. No pressed state was added. Historical audit fill: solid neutral-14 with neutral-30 border. [Footer rest](../src/supplemental/styles.css#L1822), [hover](../src/supplemental/styles.css#L1843). | B · Calibrated. **Completed 2026-09-23.** Hover only. |
| ~~NF10~~ | ~~InputTags tag, hover; tag remove control, hover~~ | Current: opaque tag base gets a 4% hover overlay; its transparent-rest remove target uses an 8% hover mix. Historical audit fill: tag hover neutral-18 and remove hover neutral-22. [Tag layer](../src/supplemental/styles.css#L1316), [remove base](../src/supplemental/styles.css#L1335), [remove hover](../src/supplemental/styles.css#L1356). | B · Calibrated. **Completed 2026-09-23.** The tag base and remove target remain separate; combined hover keeps the remove target distinct, with focus retained. |
| ~~NF11~~ | ~~TagSelect tag remove button, hover~~ | Current: the transparent-rest remove target uses an 8% hover mix. Historical audit fill: solid neutral-26. [Remove base](../src/supplemental/styles.css#L3247), [hover](../src/supplemental/styles.css#L3268). | B · Calibrated. **Completed 2026-09-23.** Chip base, focus, glyph contrast, disabled, and exit-chip states remain unchanged. |
| ~~NF12~~ | ~~CommandPalette chip remove button, hover~~ | Current: the remove target uses an 8% transparent hover mix in both popup variants. The translucent popup chip surface remains its separate neutral-12 blend. Historical audit fill: solid neutral-20 on remove. [Remove base](../src/supplemental/styles.css#L725), [hover](../src/supplemental/styles.css#L741), [translucent chip](../src/supplemental/styles.css#L746). | B · Calibrated. **Completed 2026-09-23.** Chip base/translucency, focus, and glyph contrast are preserved. |
| ~~NF13~~ | ~~CommandPalette item, hover and pressed~~ | Current: unselected items in the default popup use 2% hover / 8% pressed; selected items are excluded. The translucent popup keeps its 44% hover and 56% pressed mixes. Historical audit fill: default hover/pressed used solid neutral-12/18; selected rows used accent fills. [Default hover](../src/supplemental/styles.css#L805), [default pressed](../src/supplemental/styles.css#L821), [translucent hover/press](../src/supplemental/styles.css#L809), [selected states](../src/supplemental/styles.css#L833), [focus ring](../src/supplemental/styles.css#L829). | B · Calibrated. **Completed 2026-09-23.** This updates pointer feedback only; keyboard focus remains separately handled under NF20. |
| ~~NF14~~ | ~~TextEditor unselected toolbar and bubble-menu buttons, hover and pointer-active~~ | Current: unselected bubble-menu buttons use 8% hover and 12% active mixes of surface.strong in both schemes; dark main-toolbar buttons use 8%/12%. Light main-toolbar buttons retain 7%/20%. Selected editor rest fills remain intact; NF23 records their calibrated hover layers. [Generic states](../src/text-editor/text-editor.css#L274), [bubble hover/active](../src/text-editor/text-editor.css#L436), [dark toolbar hover](../src/text-editor/text-editor.css#L487), [dark toolbar active](../src/text-editor/text-editor.css#L494). Historical audit fill: bubble-menu and dark main-toolbar hover/active resolved to solid neutral-18. | High-confidence button-like action (historical assessment). **Completed 2026-09-23.** |
| ~~NF15~~ | ~~Calendar and RangeCalendar unselected cells, hover~~ | Current: enabled, unselected in-month cells use a 2% `surface.strong` hover layer. Selected/provisional range, outside-month, unavailable/disabled, and focus states retain their separate rules. Historical audit fill: surface.subtle (neutral-12 light / neutral-98 dark); selected hover used a strong selection treatment. [Calendar hover layer](../src/styles/collections.css#L52), [RangeCalendar hover layer](../src/styles/collections.css#L722), [selected Calendar](../src/styles/collections.css#L62), [selected RangeCalendar](../src/styles/collections.css#L782), [range focus](../src/styles/collections.css#L749), [provisional range](../src/styles/collections.css#L824). | B · Calibrated. **Completed 2026-09-23.** Only enabled, unselected in-month cells changed. |
| ~~NF16~~ | ~~GridList unselected item, hover~~ | Current: unselected hover uses a 4% `surface.strong` layer over the opaque light `surface.canvas` or custom dark base; selected/drop-target, disabled, dragging, and focus rules remain separate. Historical audit fill: surface.subtle on hover; dark rest used an 85% neutral-default-100/black blend. [Rest](../src/styles/collections.css#L394), [dark rest](../src/styles/collections.css#L2489), [hover layer](../src/styles/collections.css#L400), [disabled/dragging fallback](../src/styles/collections.css#L407), [selection](../src/styles/collections.css#L412), [focus](../src/styles/collections.css#L417), [drag/drop](../src/styles/collections.css#L432). | B · Calibrated. **Completed 2026-09-23.** The state layer retains the opaque rest and preserves selection, drop/drag, and focus. |
| ~~NF17~~ | ~~Table unselected row, hover~~ | Current: unselected row hover uses a 2% `surface.strong` mix. Selected rows retain the separate 12% selection.background token, separator, foreground, and two-ring focus. Historical audit fill: solid surface.subtle. [Hover](../src/styles/collections.css#L1560), [selection](../src/styles/collections.css#L1564), [separator and focus rings](../src/styles/collections.css#L1568). | B · Calibrated. **Completed 2026-09-23.** Selected, separator, foreground, and two-ring focus treatments remain intact. |
| ~~NF18~~ | ~~Tree unselected item row, hover~~ | Current: unselected row hover uses a 2% `surface.strong` mix; selected and focus rules remain separate. Historical audit fill: solid surface.subtle. Real Mux Tree SSR renders recursive React children as flattened sibling `div[role="row"]` elements with `aria-level`; no nested-row overlay or wrapper is needed. [Hover](../src/styles/collections.css#L1895), [selection](../src/styles/collections.css#L1899), [focus](../src/styles/collections.css#L1903). | B · Calibrated. **Completed 2026-09-23.** Hover strength is calibrated for the flattened row surface; preserve selection and focus. |
| ~~NF19~~ | ~~Underline Tabs unselected tab, hover~~ | Current: unselected underline tabs use a 2% `surface.strong` hover mix. Selected-tab hover and pill/segment/overflow interactions retain their existing treatment. Historical audit fill: solid surface.subtle for base tab hover; selected underline hover retained its action treatment. [Unselected underline hover](../src/styles/collections.css#L1002), [selected underline hover](../src/styles/collections.css#L998), [other variants](../src/styles/collections.css#L965), [moving underline](../src/styles/collections.css#L881). | B · Calibrated. **Completed 2026-09-23.** Only unselected underline-tab hover changed. |
| ~~NF20~~ | ~~Select, ComboBox, Autocomplete, default CommandPalette, MultiSelect, and TagSelect option rows, focus; ListBox nonselected rows, hover only~~ | Current split: ListBox nonselected pointer hover uses a 2% `surface.strong` mix; keyboard-only focus remains transparent with its 2px outline. Unselected MultiSelect/TagSelect pointer hover and combined hover/focus use a 2% mix with their 2px inset rings retained; selected-row pointer feedback and selection indicators remain unchanged. Focus-only fills remain for Select, ComboBox, Autocomplete, default CommandPalette, MultiSelect, and TagSelect; translucent CommandPalette focus retains its prior tonal fill. Historical audit focus fill: surface.hover, with the per-component exceptions below. [Shared focus](../src/styles/base.css#L800), [ListBox focus-only](../src/styles/collections.css#L479), [ListBox pointer hover/ring](../src/styles/collections.css#L485), [Autocomplete focus](../src/styles/base.css#L802), [Select/ComboBox dark focus](../src/styles/collections.css#L2390), [translucent CommandPalette focus](../src/supplemental/styles.css#L813), [MultiSelect hover](../src/supplemental/styles.css#L1766), [focus-only/ring](../src/supplemental/styles.css#L1760), [focus ring](../src/supplemental/styles.css#L1776), [TagSelect hover](../src/supplemental/styles.css#L3358), [focus-only](../src/supplemental/styles.css#L3352), [focus ring](../src/supplemental/styles.css#L3368). | Resolved · B pointer-state uplift complete; keyboard focus retained. Preserve selected-row pointer feedback and selection indicators. Keep focus-only fills for Select/ComboBox/Autocomplete/default CommandPalette/MultiSelect/TagSelect. ListBox keyboard-only focus stays transparent with its 2px outline; MultiSelect/TagSelect combined hover/focus keeps their 2px inset rings. The translucent CommandPalette focus remains tonal. **Pointer-state update 2026-09-23.** |
| ~~NF21~~ | ~~Virtualizer item, focused~~ | Unchanged: `item-focus-bg` remains the solid surface.hover fill in the default path; dark focus remains neutral-default-94. [Focus rule](../src/styles/collections.css#L2679), [dark override](../src/styles/collections.css#L2691). | Resolved · Kept unchanged. The solid focused fill remains the primary per-item keyboard locator; a root-only ring is not an equivalent replacement. |

<a id="medium-assessment"></a>
## Medium-confidence implementation status · 2026-09-24

Fourteen of the 16 medium-confidence entries are fully uplifted, including
NF08’s dark navigation foreground repair. NF20’s pointer-state uplift is
complete with keyboard focus retained; NF21 is resolved and kept unchanged.
Across the full ledger, all 29 entries are resolved. NF22–NF25 and NF29 record
the approved B implementation; NF26–NF28 record the approved C implementation.

The implemented B · Calibrated and C · Tonal options use component-owned layers
with strengths shown per entry; the percentages vary by state and underlying
surface. Global tokens are unchanged. For opaque rests, the implementation
layers a transparent state over the base rather than replacing the base fill.

Use actual component surfaces and review each foreground, border, focus ring,
and selection treatment. The W3C notes that supplemental hover styling does
not itself need 3:1 contrast, but must not reduce the component's contrast or
the contrast of focus and selection indicators ([WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
The ARIA Authoring Practices distinguish moving focus from persistent selection
([keyboard focus and selection](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_focus_vs_selection)).

The 2026-09-23 screenshots remain an exploratory comparison of a blanket 8% hover /
12% press treatment over actual CSS rest surfaces. They are not the calibrated
recipe or full live-component validation: the probe used standard-Harbour
static DOM with forced pseudo/data states and transitions disabled, not
hydrated React or full accessibility certification. In those samples, 8%
appeared stronger than current Card, Table, and Tree hover; nearly
imperceptible on the light inverse navigation surface; and visible or
similar/stronger on Option and Virtualizer states. Selected Table/Tree fills did
not change. That review deferred six dark HeaderNav and Sidebar controls
because of their foreground/background collisions. NF08 completed those
repairs on 2026-09-24 with the approved B · Calibrated recipe; the
[historical comparison](neutral-interactive-fill-navigation-options.html) preserves their previous appearance. The Tree
screenshot compared sibling rows; real Mux Tree SSR preflight confirmed
recursive React children render as flattened sibling `div[role="row"]` elements
with `aria-level`, so no nested-row overlay or wrapper is needed.

[Light comparison](assets/neutral-medium-light.png) ·
[Dark comparison](assets/neutral-medium-dark.png)

## Resolved design decisions · B/C implemented · 2026-09-24

[Review NF22–NF29 in the four-group HTML comparison](neutral-interactive-fill-final-options.html).
All eight decisions are resolved. The comparison preserves A’s historical appearance and prior B for NF26–NF28; current component CSS supplies B for NF22–NF25/NF29 and C for NF26–NF28.

These entries originally required a design decision because their fills serve
selected, focused, binary, or editable-field roles. The approved direction
preserves strong state emphasis and base surfaces, calibrates hover where
useful, and applies a tonal layer to the compact indicator hovers without
changing their borders. Existing forced-colors treatment remains unchanged.

| ID | Component, anatomy, state | Confirmed current fill, mode and source | Decision and priority |
| --- | --- | --- | --- |
| ~~NF22~~ | ~~Standalone ToggleButton, selected rest and hover~~ | Current: selected rest stays opaque neutral-80. Enabled standalone selected hover keeps that base and adds an 8% neutral-100 transparent overlay, with the neutral-80 outline. Historical hover used solid neutral-90. [Selected states](../src/styles/components.css#L759), [dark overrides](../src/styles/components.css#L1255). [Approved B implementation](../src/styles/components.css#L1271). | B · Calibrated. **Completed 2026-09-24.** Selected foreground, keyboard focus, disabled state, and all ToggleButtonGroup selected fills remain unchanged. |
| ~~NF23~~ | ~~TextEditor toolbar button, selected/active rest and hover~~ | Current: active hover layers a 6% neutral-100 tint over neutral-94 in the light Main toolbar and neutral-22 in the light Bubble menu. Dark Main and Bubble use a 6% neutral-10 tint over neutral-22. Historical Main hover was neutral-80 light / neutral-18 dark; Bubble hover was neutral-18. [Main active states](../src/text-editor/text-editor.css#L283), [dark active rest](../src/text-editor/text-editor.css#L507), [dark hover](../src/text-editor/text-editor.css#L500), [Bubble active states](../src/text-editor/text-editor.css#L436). [Approved B implementation](../src/text-editor/text-editor.css#L571). | B · Calibrated. **Completed 2026-09-24.** Selected rest fills, existing hover foregrounds, unselected states, and focus remain intact. |
| ~~NF24~~ | ~~HeaderNav and Sidebar current navigation item~~ | Current: current hover layers 6% currentColor over the opaque neutral-94 light / neutral-22 dark current base. Applies to HeaderNav current items and Sidebar current links and buttons. Dark Sidebar current-link icons now use neutral-100. Historical current hover used neutral-96 light / neutral-20 dark; the dark current-link icon also used neutral-20. [HeaderNav current item](../src/supplemental/styles.css#L1078), [dark HeaderNav](../src/supplemental/styles.css#L1192), [Sidebar current link](../src/supplemental/styles.css#L2336), [current button](../src/supplemental/styles.css#L2447), [dark current link](../src/supplemental/styles.css#L2759), [dark current button](../src/supplemental/styles.css#L2771), [Sidebar icon](../src/supplemental/styles.css#L2357). [Approved B implementation](../src/supplemental/styles.css#L2904). | B · Calibrated. **Completed 2026-09-24.** Current-page emphasis and focus remain clear; the icon repair is limited to current links. NF08’s earlier navigation repairs are preserved. |
| ~~NF25~~ | ~~CommandPalette inline search input, hover~~ | Current: enabled, unfocused, valid inline input hover uses a 2% surface.strong transparent mix in the default popup and 4% in the translucent popup. Historical hover was solid neutral-12 / 34% neutral-12 respectively. [Inline hover](../src/supplemental/styles.css#L666), [translucent hover](../src/supplemental/styles.css#L672). [Approved B implementation](../src/supplemental/styles.css#L2941). | B · Calibrated. **Completed 2026-09-24.** Popup, search-field and input resting surfaces, borders, focus, disabled/invalid states, and non-inline input treatment remain unchanged. |
| ~~NF26~~ | ~~Checkbox and CheckboxField unchecked indicator, hover~~ | Current: an 8% `surface.strong` transparent layer replaces the prior opaque `surface.hover` fill over the unchanged rest fill (`surface.raised` light / neutral-default-98 dark); the source hover border stays unchanged. Selected and indeterminate indicators retain selection.track. [Tonal hover layer](../src/styles/components.css#L1334), [dark tonal layer](../src/styles/components.css#L1345). Historical fill was `surface.hover` light and neutral-default-94 dark, with neutral-default-40 dark border. | C · Tonal. **Resolved 2026-09-24 · Hover fill implemented.** Preserve the original border, selected/indeterminate semantics, focus, disabled, and forced-colors treatment. |
| ~~NF27~~ | ~~RadioGroup and RadioField unselected indicator, hover~~ | Current: an 8% `surface.strong` transparent layer replaces each opaque hover fill over its unchanged rest fill. RadioGroup uses `surface.raised` light / neutral-default-98 dark and keeps its source borders. RadioField layers the same tint over its adaptive neutral-10 rest and retains the source neutral-60 hover border. [RadioGroup tonal hover](../src/styles/collections.css#L3015), [dark RadioGroup layer](../src/styles/collections.css#L3024), [RadioField tonal hover](../src/supplemental/styles.css#L2953). Historical fills were `surface.hover` light / neutral-default-94 dark for RadioGroup and adaptive neutral-14 for RadioField; the original borders remain. | C · Tonal. **Resolved 2026-09-24 · Hover fill implemented.** Preserve source borders, selected dot, focus, disabled, and forced-colors treatment. |
| ~~NF28~~ | ~~Switch and SwitchField unselected track, hover~~ | Current: an 8% `surface.strong` transparent layer replaces the opaque neutral-26 hover over the unchanged neutral-20 track base; the source neutral-50 hover border stays unchanged. Selected hover retains its action/accent fill. [Switch tonal hover](../src/styles/fields.css#L959), [SwitchField tonal hover](../src/supplemental/styles.css#L3043). | C · Tonal. **Resolved 2026-09-24 · Hover fill implemented.** Preserve the original track border, selected/focus distinction, disabled, and forced-colors treatment. |
| ~~NF29~~ | ~~DateField, TimeField, DatePicker, and DateRangePicker date segment, keyboard focus~~ | Current: the shared focus retains surface.emphasis and uses content.on-solid for both populated and empty focused segments. The dark scoped foreground no longer overrides it. Historical default-token CSS probes measured 1.29:1 populated and 2.59:1 placeholder contrast against the dark focus fill; those are pre-repair default-token results, not Harbour values. An actual Mux DateField/TimeField render confirmed that focused placeholders carry both state attributes. [Focused segment](../src/styles/base.css#L1020), [dark segment foregrounds](../src/styles/fields.css#L697), [shared date input](../src/fields.mjs#L406), [range date input](../src/fields.mjs#L1014). [Approved B implementation](../src/styles/fields.css#L718). | B · Calibrated. **Completed 2026-09-24 · Foreground repaired.** The strong keyboard locator is retained. Unfocused placeholders, literal segments, root focus styling, geometry, and forced-colors behavior are preserved. |

## Cascade notes and exclusions

**NF01, DatePicker:** Chrome 153 with representative static DOM and sentinel
token values confirmed the effective unscoped, light, and dark fill paths in
the table. The scoped rest rules win by scoping proximity over equally specific
generic hover selectors. Sentinel values identify token paths only; they are
not canonical RGB evidence. This probe was targeted, not hydrated, visual, or
accessibility proof.

**NF14 historical cascade audit:** The initial static-DOM Chrome probe
confirmed the pre-uplift bubble-menu and dark toolbar fills recorded above.
The current unselected bubble-menu states use 8%/12% mixes in both schemes;
dark main-toolbar states use 8%/12%, while the light main toolbar keeps its
existing 7%/20% treatment. Selected editor rest states remain unchanged; their calibrated hover layers are recorded under NF23.

**NF20/NF21, shared option focus:** Most option rows use the shared item-focus
fill, but local rules affect the result: Select/ComboBox have an explicit dark
focused fill; the translucent CommandPalette focus is already mixed; ListBox
keyboard focus without pointer hover is transparent; Virtualizer has its own
dark neutral-94 fill. Menu focus uses an action token and stays excluded.

**NF04 historical cascade audit:** Scoped toolbar rules took precedence over
the generic surface-hover rule in the original audit. The current direct-child
neutral Toolbar Button rules use 8% hover and 12% active/data-pressed mixes;
the scoped normal foreground remains in place for pressed states.

**DisclosureGroup is a confirmed false positive.** The group hover rule appears
to set solid neutral-12, but its selector specificity 0,4,0 loses to the
regular Disclosure hover selector at 0,5,0. An SSR-backed Chrome 153 probe
confirmed 12% neutral action hover and 16% pointer-active fills. Synthetic
[data-pressed] covered CSS only, not runtime keyboard input. [Regular rule](../src/styles/components.css#L433),
[group rule](../src/styles/components.css#L1459).

**Menu focus is not a neutral fill.** .muxui-menu-item[data-focused] uses
action.background-hover and action.foreground; it is excluded from NF20.
[Menu focus](../src/styles/collections.css#L585).

Other reviewed boundaries: ordinary editable field hover generally changes the
outline only; NF25 is the specific CommandPalette input exception. Disabled
surface-hover rules are excluded. Static popup, card, and navigation rest
surfaces are not state layers. Arbitrary user-colour swatches and slider/wheel
thumbs are outside this neutral-fill ledger. Selected Tree/Table rows already
use tonal selection; selected CommandPalette items use accent colour. The
ListBox and ToggleButtonGroup selected fills remain explicitly excluded.

## Future implementation validation

For any future uplift, check the actual state selector and computed fill in
light/dark and standard/more-contrast modes, then verify hover, active, keyboard
focus, disabled, selected, and forced-colors behaviour as applicable. Compare
the mix over each real underlying surface, retain foreground contrast, and
confirm reduced-motion and focus-ring behaviour. The audit's targeted browser
probes do not replace those component checks. Change the owning component state
rules; do not redefine surface.subtle, surface.hover, surface.pressed, or
border.strong globally, because structural surfaces, disabled states, and
control borders also use those roles.

## Current implementation verification

**2026-09-24, NF26–NF28 completed with C · Tonal, fill only.** Checkbox, RadioGroup, Switch, and their Field variants now use the approved 8% surface.strong transparent hover layer over their existing rest fills. The original borders are preserved. The six-family scoped check passed 112 React component tests and its light/dark Storybook accessibility audit. After correcting SwitchField’s rule order, `pnpm check --component switch-field` passed 40 tests and its audit. These are separate runs.

The final generated CSS passed 1,056 element/pseudo-element comparisons against C with the stronger-border override removed, plus 672 boundary cases checking original borders, selected/indeterminate, disabled, invalid, focus, and forced-colors states. The HTML comparison passed 2,112 element/pseudo-element comparisons, preserving archived A/B while C reads runtime CSS. Light/dark screenshots, standard/more contrast, reduced motion, responsive layout, ledger search/Clear, and relative links were checked. These are focused CSS fixtures and task checks, not full release or hydrated interaction proof. Local ephemeral output: `/tmp/nf26-28-runtime-proof.json`, `/tmp/nf26-28-boundary-proof.json`, and `/tmp/nf26-28-artifact-proof.json`.

### Earlier B-round verification

**Historical, 2026-09-24: NF22–NF29 first resolved with B · Calibrated.** NF22–NF25 applied calibrated hover layers; NF29 repaired the focused foreground while retaining the strong background; NF26–NF28 were kept unchanged in that round. The scoped command was `pnpm check --component toggle-button --component text-editor --component header-nav --component sidebar --component command-palette --component date-field --component time-field --component date-picker --component date-range-picker`. It passed 135 React component tests and the selected-family light/dark Storybook accessibility audit. After correcting dark scoped navigation precedence and preserving the current icon in forced-colors mode, the HeaderNav/Sidebar follow-up passed 40 tests and its light/dark audit. These are separate runs, not 175 distinct tests; they predate the approved NF26–NF28 C update.

Historical B-round Chrome checks compared generated CSS, with the then-current B mock overrides removed, against the approved B samples: 2,112 element/pseudo-element style comparisons passed across light/dark, standard/more contrast, normal/reduced motion, and forced-colors preservation. A separate 712-case boundary matrix passed for ToggleButtonGroup selection/motion, disabled controls, native focus, non-inline and excluded input states, current navigation buttons, and all four date/time wrappers. Independent read-only review of the frozen runtime CSS found no actionable issues. These were representative CSS fixtures, not a complete hydrated interaction or accessibility audit; they predate the NF26–NF28 C update.

The historical HTML comparison then read B from runtime CSS and preserved historical A plus the unchosen C. Its 2,016 component-style comparisons passed; desktop/tablet/mobile layout, mode/contrast controls, ledger search/Clear, and relative links were checked. Local ephemeral output: `/tmp/nf22-29-runtime-proof.json`, `/tmp/nf22-29-boundary-proof.json`, and `/tmp/nf22-29-artifact-proof.json`. These artifact results predate the NF26–NF28 C update. Focused task proof only, not full release evidence or R1.6 acceptance.

**2026-09-24, NF08 completed.** The final scoped run of
`pnpm check --component header-nav --component sidebar` passed 40 React tests
and the HeaderNav/Sidebar light/dark Storybook accessibility audit. A separate
isolated Chrome probe compared actual authored CSS with the pre-NF08 source,
with mock overrides removed: 96 rest/hover/focus combinations across light/dark
and standard/more-contrast, 16 safe/current navigation comparisons, and 24
focused forced-colors comparisons passed. This is representative static DOM
with forced hover samples, not a complete interaction or accessibility audit.

In the standard Harbour dark samples, hover foreground contrast rose from
1.00:1 to 10.20–10.66:1. The account trigger’s resting contrast rose from
2.08:1 to 4.61:1. Light values, resting backgrounds, native focus styling,
geometry, safe/current navigation, and forced-colors treatment matched the
baseline. [Before/A/B/C comparison](neutral-interactive-fill-navigation-options.html)
now preserves the historical baseline and marks B implemented. Ledger search,
Clear, relative links, and desktop/mobile layout were checked. Local ephemeral
probe output: `/tmp/nf08-runtime-proof.json`. Focused task proof only, not full release
evidence or R1.6 acceptance.

**2026-09-23, focused task proof only.** The scoped check was
`pnpm check --component search-field --component number-field --component toolbar --component toggle-button --component text-editor`.
The initial five-family run passed 94 scoped tests and light/dark Storybook axe
checks. After the dark SearchField hover/pressed foreground repair, its focused
follow-up passed 39 tests and light/dark Storybook axe checks; these are separate
runs, not 133 distinct tests. Chrome computed fills passed in light/dark ×
standard/more-contrast modes. Checks confirmed selected, disabled, and
trailing-state preservation. The SearchField contrast repair passed; its rest,
disabled, focus, and transition behaviour stayed intact. Forced-colors and
reduced-motion focus/rest checks passed, and a four-block CSS baseline
comparison confirmed unaffected properties match HEAD.
Independent reviews of the original change and SearchField follow-up found no
actionable issues. The earlier high-confidence entries use B's 8% hover / 12%
pressed mix (NF05 hover only). The medium batch applies B · Calibrated through
component-owned, surface-specific layers shown in the ledger; global tokens are
unchanged. The initial medium-batch scoped run passed 106 React tests and the light/dark
Storybook accessibility audit for 18 resolved families. After the source
corrections, the six-family follow-up passed 71 React tests and its light/dark
Storybook accessibility audit. These are separate runs, not 177 distinct tests.
The follow-up command was `pnpm check --component card --component grid-list --component command-palette --component multi-select --component tag-select --component tag-group`.

The 2026-09-23 final-source browser state matrix passed in light, dark, and the default
date-trigger path. It checked the calibrated tints and opaque rests, retained
selected/disabled/focus states, Calendar ranges, GridList drag/drop precedence,
Tabs variants, CommandPalette foregrounds and translucent fills, option-row
selection indicators, and the then-deferred dark navigation states. The separate
NF12 probe passed all four chip-remove cases across both modes and popup
variants. Independent review and targeted rereviews found no remaining
actionable issues. The GridList fallback was corrected, selected elevated
Cards retain their ring with hover/pressed elevation, original CommandPalette
foregrounds and selected option-row feedback were restored, and dark TagGroup
keeps its opaque rest under the tint. Runtime source stayed frozen during final
review and checks. Whitespace verification passed.

Final implementation screenshots: [Light](assets/neutral-interactive-fill-medium-implementation-light.png) / [Dark](assets/neutral-interactive-fill-medium-implementation-dark.png). The ledger's search and Clear
control were checked at desktop and mobile widths. Logs are local and ephemeral:
`/tmp/muxui-medium-followup-check.log`, `/tmp/muxui-medium-final-probe.log`, and `/tmp/neutral-medium-chip-remove-check.json`. This is focused task proof, not full release
evidence or R1.6 acceptance.

## Review provenance

Discovery began with provider thread
1dbf2b48-7a5c-4e8a-8344-737c644c3b15; its final source message was recorded at
2026-09-23T05:51:00.914Z in
/Users/admin/.t3/userdata/logs/provider/events.1dbf2b48-7a5c-4e8a-8344-737c644c3b15.log.
The thread is discovery context. Current-state findings link to the reviewed
shared worktree.
