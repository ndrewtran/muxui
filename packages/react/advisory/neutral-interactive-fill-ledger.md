# Neutral interactive fill ledger

Advisory source review for future tonal neutral fill work. This ledger records
confirmed current fills and separates them from design recommendations. It
does not set token policy, declare defects, provide release evidence, or
authorize implementation.

Baseline: branch codex/accept-react-motion, shared worktree on 2026-09-23,
based on 25e273c plus the then-current uncommitted source. Core component,
field, collection, and overlay style files were already dirty. Findings reflect
the working tree, including its current ListBox nonselected focus and hover
rules. Links target that worktree and may need refreshing if the source moves.

## Scope and token boundary

The source inventory covers the fixed 53-family snapshot and 26 supplemental
React component records (24 roots and two subpaths), mapped through the React
generator to 12 authored style sheets. This is search coverage, not a count of
issues: [family snapshot](../../../catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json),
[supplemental inventory](../../../catalog/react-r1-6/supplemental-components.json#L4),
[generator mapping](../src/generate.mjs#L936).

Include a state only when its current solid neutral fill is supported by the
source and effective cascade. The canonical guide documents shared neutral
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
Preserve forced-colors behaviour during future work.

## Recommended for future design review

All current fill facts below are source-confirmed. Design confidence describes
fit for a future tonal treatment, not implementation evidence. P1 covers clear
neutral action controls; P2 covers states whose surface role needs more design
judgment. Every status is future review only.

| ID | Component, anatomy, state | Confirmed current fill, mode and source | Design confidence, rationale, direction, priority |
| --- | --- | --- | --- |
| NF01 | DatePicker and DateRangePicker calendar trigger, hover and mouse-active | Unscoped hover uses surface.hover; scoped light stays neutral-default-10 and scoped dark stays neutral-default-100 for rest, hover, and mouse press. [Base hover](../src/styles/base.css#L1056), [shared control hover](../src/styles/base.css#L1080), [light scope](../src/styles/fields.css#L1018), [dark scope](../src/styles/fields.css#L1040). | Medium. Secondary action, but the solid field rest fill belongs to the field treatment. Keep that rest fill and review a 12% neutral source-colour hover layer over it. P1. |
| NF02 | SearchField clear button, hover and pressed | surface.hover and surface.pressed; their dark-mode aliases resolve to neutral-default-96 and neutral-default-70. [Hover](../src/styles/fields.css#L365), [pressed](../src/styles/fields.css#L370), [hover mode](../../../catalog/tokens/default-theme.json#L8616), [pressed mode](../../../catalog/tokens/default-theme.json#L809). | High. Discrete neutral action. Review shared neutral action hover/pressed mixes at 12% and 16%. P1. |
| NF03 | NumberField steppers, hover and active | Hover uses surface.pressed; active uses border.strong. The reviewed theme maps those to neutral-20 / neutral-70 and neutral-26 / neutral-50 in light / dark. [Stepper states](../src/styles/fields.css#L255), [pressed mode](../../../catalog/tokens/default-theme.json#L809), [border mode](../../../catalog/tokens/default-theme.json#L1562). | High. Button-like increment/decrement actions. Review 12% hover and 16% pressed mixes; retain the control border separately. P1. |
| NF04 | Toolbar child Buttons, hover, active, and pressed | Generic selectors use surface.hover. Scoped hover and [data-pressed] overrides resolve to neutral-default-18 in light and neutral-default-92 in dark; unscoped states use surface.hover. [Generic rules](../src/styles/collections.css#L1829), [light scope](../src/styles/collections.css#L2217), [dark scope](../src/styles/collections.css#L2224). | High. The children are Buttons with documented neutral action intent. Review the applicable neutral-toolbar treatment against 12% hover and 16% pressed fills; keep the outer surface.subtle structural and preserve toolbar variants. P1. |
| NF05 | ToggleButton and ToggleButtonGroup unselected button, hover | The base hover uses solid neutral-14; the explicit dark rule repeats neutral-14. A motion-ready group trailing button suppresses this hover fill during its trailing phase. [Base hover](../src/styles/components.css#L753), [dark hover](../src/styles/components.css#L1247), [group trailing rule](../src/styles/components.css#L855). | High. Neutral action button. Review the shared 12% hover token where the motion layer does not suppress the fill. Selected ToggleButtonGroup states are excluded. P1. |
| NF06 | TagGroup unselected tag, hover and pressed; tag remove button, hover | Unselected tag uses surface.hover and surface.pressed; remove uses surface.hover. Selected tag hover instead resolves to action.background-hover. [Tag hover](../src/styles/collections.css#L1717), [tag pressed](../src/styles/collections.css#L1722), [selected hover override](../src/styles/collections.css#L1742), [remove hover](../src/styles/collections.css#L1775). | Medium. Tags combine container and action roles. Review tonal hover/pressed layers only for unselected tags and remove controls; retain the selected action treatment. P2. |
| NF07 | Card button variants, hover and pressed | Outlined/elevated hover use neutral-10, filled hover neutral-14; outlined/filled pressed use neutral-18 and elevated pressed neutral-14. [Hover variants](../src/supplemental/styles.css#L305), [pressed variants](../src/supplemental/styles.css#L319). | Medium. A state layer could reduce the solid step, but must preserve outlined, elevated, and filled hierarchy, borders, and shadows. Review component-owned mixes over each rest surface. P2. |
| NF08 | HeaderNav and Sidebar navigation/actions, hover | HeaderNav nav button, mobile trigger, and mobile close; Sidebar nav link, nav button, account trigger, feature-card dismiss, mobile menu button, and mobile close button. Hover is neutral-96 light / neutral-20 dark. [HeaderNav light surface](../src/supplemental/styles.css#L992), [dark surface](../src/supplemental/styles.css#L1137), [light nav button](../src/supplemental/styles.css#L1040), [mobile trigger](../src/supplemental/styles.css#L1080), [mobile close](../src/supplemental/styles.css#L1131), [dark nav button](../src/supplemental/styles.css#L1152), [dark mobile trigger](../src/supplemental/styles.css#L1166), [dark mobile close](../src/supplemental/styles.css#L1178), [Sidebar surface](../src/supplemental/styles.css#L2177), [light nav link](../src/supplemental/styles.css#L2290), [nav button](../src/supplemental/styles.css#L2401), [account trigger](../src/supplemental/styles.css#L2515), [feature dismiss](../src/supplemental/styles.css#L2578), [mobile menu](../src/supplemental/styles.css#L2613), [mobile close](../src/supplemental/styles.css#L2665), [dark nav link](../src/supplemental/styles.css#L2711), [dark nav button](../src/supplemental/styles.css#L2723), [dark account trigger](../src/supplemental/styles.css#L2748), [dark feature dismiss](../src/supplemental/styles.css#L2768), [dark mobile menu](../src/supplemental/styles.css#L2787), [dark mobile close](../src/supplemental/styles.css#L2793). | Medium. In light mode, the neutral-100 navigation surface uses inverse foregrounds; surface.strong as a tint source can disappear against it. Review a component-owned transparent tint from the on-navigation neutral or currentColor, preserving foreground pairing in both modes. P2. |
| NF09 | MultiSelect footer action button, hover | Solid neutral-14 fill with neutral-30 border. [Footer hover](../src/supplemental/styles.css#L1802). | Medium. Discrete action within the selection surface. Review a 12% neutral hover layer while retaining its border. P2. |
| NF10 | InputTags tag, hover; tag remove control, hover | Tag hover uses neutral-18; remove hover uses neutral-22. [Tag hover](../src/supplemental/styles.css#L1283), [remove hover](../src/supplemental/styles.css#L1320). | Medium. Both are small neutral interaction targets. Review component-owned transparent fills at the underlying tag/group surface. P2. |
| NF11 | TagSelect tag remove button, hover | Solid neutral-26 fill. [Remove hover](../src/supplemental/styles.css#L3093). | Medium. Discrete remove action. Review a neutral transparent hover fill while preserving its foreground contrast. P2. |
| NF12 | CommandPalette chip remove button, hover | Solid neutral-20 fill; the translucent popup chip surface has a separate neutral-12 mix. [Remove hover](../src/supplemental/styles.css#L714), [translucent chip surface](../src/supplemental/styles.css#L719). | Medium. Small neutral action, with two popup surface treatments. Review a component-owned hover layer over each surface. P2. |
| NF13 | CommandPalette item, hover and pressed | Default popup hover/pressed use solid neutral-12/18. The translucent popup already uses 44% neutral-18 and 56% neutral-22 mixes. Selected rows use accent fills. [Hover](../src/supplemental/styles.css#L774), [pressed](../src/supplemental/styles.css#L787), [translucent states](../src/supplemental/styles.css#L779), [selected states](../src/supplemental/styles.css#L800). | Medium. Review tonal neutral hover/pressed only for unselected items in the default popup. Keep the existing translucent and accent-selected treatments. P2. |
| NF14 | TextEditor unselected toolbar and bubble-menu buttons, hover and pointer-active | Generic toolbar hover/press are 7%/20% neutral-90 mixes. Bubble-menu hover resolves to solid neutral-18 in all modes and wins while pointer-active; dark main-toolbar hover/press also resolves to neutral-18. [Generic states](../src/text-editor/text-editor.css#L274), [bubble override](../src/text-editor/text-editor.css#L431), [dark toolbar hover](../src/text-editor/text-editor.css#L479). | High. Button-like actions already have a tonal generic treatment. Review the bubble and dark-toolbar overrides for a mode-appropriate component mix; keep selected toolbar states separate. P1. |
| NF15 | Calendar and RangeCalendar unselected cells, hover | Both use solid surface.subtle, which maps to neutral-12 light / neutral-98 dark. Selected hover follows a separate strong selection treatment. [Calendar hover](../src/styles/collections.css#L48), [RangeCalendar hover](../src/styles/collections.css#L706), [selected Calendar hover](../src/styles/collections.css#L58), [selected RangeCalendar hover](../src/styles/collections.css#L766). | Medium. Review a light neutral state layer over the calendar surface without weakening selected, start/end, or unavailable treatments. P2. |
| NF16 | GridList unselected item, hover | Solid surface.subtle; selected items take the later selection.track rule. [Hover](../src/styles/collections.css#L396), [selection](../src/styles/collections.css#L400). | Medium. Review a tonal hover layer distinct from selection. P2. |
| NF17 | Table unselected row, hover | Solid surface.subtle; selected rows use the separate 12% selection.background token. [Hover](../src/styles/collections.css#L1540), [selection](../src/styles/collections.css#L1544). | Medium. A tonal hover layer could separate pointer feedback from selected feedback. P2. |
| NF18 | Tree unselected item row, hover | Solid surface.subtle; selected rows use tonal selection.background. [Hover](../src/styles/collections.css#L1869), [selection](../src/styles/collections.css#L1873). | Medium. Review a hover layer distinct from the existing selection fill. P2. |
| NF19 | Underline Tabs unselected tab, hover | Solid surface.subtle. Pill, segment, and overflow hover/pressed states use neutral action tokens; selected hover states already use tonal fills. [Base tab hover](../src/styles/collections.css#L1637), [other variants](../src/styles/collections.css#L949), [selected hover](../src/styles/collections.css#L976), [selected underline hover](../src/styles/collections.css#L982). | Medium. Review only unselected underline hover; preserve the other variant and selected-state treatments. P2. |
| NF20 | Select, ComboBox, Autocomplete, default CommandPalette, MultiSelect, and TagSelect option rows, focus; ListBox nonselected rows, hover only | Shared item-focus-bg resolves to solid surface.hover (neutral-14 light / neutral-96 dark). Select/ComboBox dark focused rows explicitly use neutral-default-96. MultiSelect/TagSelect map hovered and focused rows to this fill. Default CommandPalette focus uses it; the translucent popup focus already uses a 50% mix and is excluded. [Shared focus](../src/styles/base.css#L800), [ListBox hover and focus-only rule](../src/styles/collections.css#L467), [Autocomplete hover](../src/styles/fields.css#L127), [Select/ComboBox dark focus](../src/styles/collections.css#L2368), [CommandPalette translucent focus](../src/supplemental/styles.css#L783), [MultiSelect](../src/supplemental/styles.css#L1724), [TagSelect](../src/supplemental/styles.css#L3177). | Medium. These are navigable option surfaces, not the Menu action treatment. Review component-owned focus/hover layers separately from selection. ListBox keyboard focus without pointer hover is transparent; only its nonselected hover is included. P2. |
| NF21 | Virtualizer item, focused | item-focus-bg is solid surface.hover in the default path; dark focus explicitly uses neutral-default-94. [Focus rule](../src/styles/collections.css#L2659), [dark override](../src/styles/collections.css#L2670). | Medium. Review a tonal keyboard-focus surface while preserving the focus ring and contrast. P2. |

## Needs a design decision before any uplift

These fills are confirmed, but serve selected, focused, binary, or editable-field
roles. D1 means decide whether the strong state emphasis is intentional before
changing its fill. D2 means decide whether the state needs a fill at all. Keep
them visible for product review without treating opacity as the default
correction.

| ID | Component, anatomy, state | Confirmed current fill, mode and source | Decision and priority |
| --- | --- | --- | --- |
| NF22 | Standalone ToggleButton, selected rest and hover | Solid neutral-80 at rest and neutral-90 on hover in the current theme. [Selected states](../src/styles/components.css#L759), [dark overrides](../src/styles/components.css#L1255). | Decide whether this strong selected treatment is intentional. Do not infer from the ToggleButtonGroup exclusion. D1. |
| NF23 | TextEditor toolbar button, selected/active rest and hover | Light active rest is neutral-94 and hover neutral-80 with inverse text. Dark active rest is neutral-22; dark hover resolves to neutral-18. [Light active states](../src/text-editor/text-editor.css#L283), [dark active rest](../src/text-editor/text-editor.css#L485), [dark hover override](../src/text-editor/text-editor.css#L479). | Active formatting communicates a persistent selection. Decide whether only hover should gain a translucent layer; retain the selected rest and inverse foreground unless product intent changes. D1. |
| NF24 | HeaderNav and Sidebar current navigation item | Current item is neutral-94 in light and neutral-22 in dark, with on-navigation foreground. [HeaderNav current item](../src/supplemental/styles.css#L1046), [dark HeaderNav current item](../src/supplemental/styles.css#L1158), [Sidebar current link](../src/supplemental/styles.css#L2295), [Sidebar current button](../src/supplemental/styles.css#L2406), [dark Sidebar current link](../src/supplemental/styles.css#L2718), [dark Sidebar current button](../src/supplemental/styles.css#L2730). | Current-page emphasis may intentionally be stronger than hover. If revised, use a component-owned tint that preserves the dark navigation surface and foreground pairing. D1. |
| NF25 | CommandPalette inline search input, hover | Default popup uses solid neutral-12; translucent popup uses a 34% neutral-12 mix. [Default hover](../src/supplemental/styles.css#L634), [translucent hover](../src/supplemental/styles.css#L640). | This is an editable field surface rather than an action button. Decide whether input-body hover needs a fill at all; if retained, preserve its rest surface and use a component-owned layer. D2. |
| NF26 | Checkbox and CheckboxField unchecked indicator, hover | Indicator uses solid surface.hover, neutral-14 light / neutral-96 dark. Selected and indeterminate indicators use selection.track. [Hover rule](../src/styles/components.css#L343). | A compact binary indicator may need opaque feedback for legibility. Review separately from button fills; keep selected and indeterminate semantics distinct. D2. |
| NF27 | RadioGroup and RadioField unselected indicator, hover | RadioGroup uses surface.hover; RadioField uses solid neutral-14. [RadioGroup](../src/styles/collections.css#L657), [RadioField](../src/supplemental/styles.css#L2126). | Small indicator surfaces may need stronger contrast than action backgrounds. Decide after checking both modes and selected-state feedback. D2. |
| NF28 | Switch and SwitchField unselected track, hover | Solid neutral-26 in both authored hover rules. Selected hover uses an action/accent fill. [Switch](../src/styles/fields.css#L463), [SwitchField](../src/supplemental/styles.css#L2873). | The track is a binary indicator; keep opaque treatment unless the design review confirms a tonal state remains clear. D2. |
| NF29 | DateField, TimeField, DatePicker, and DateRangePicker date segment, keyboard focus | Shared segment style uses surface.emphasis mapped to neutral-80, paired with content.on-solid. [Focused segment](../src/styles/base.css#L1020), [shared date input](../src/fields.mjs#L406), [range date input](../src/fields.mjs#L1014). | This is a strong focus inversion, not a subtle hover. Decide whether its focus contrast is intentional and preserve keyboard visibility. D1. |

## Cascade notes and exclusions

**NF01, DatePicker:** Chrome 153 with representative static DOM and sentinel
token values confirmed the effective unscoped, light, and dark fill paths in
the table. The scoped rest rules win by scoping proximity over equally specific
generic hover selectors. Sentinel values identify token paths only; they are
not canonical RGB evidence. This probe was targeted, not hydrated, visual, or
accessibility proof.

**NF14, TextEditor:** The generic toolbar's tonal hover/active rules still
apply outside the bubble menu. Inside it, the more specific bubble hover rule
overrides the generic hover and wins during pointer-active overlap. The dark
toolbar hover rule also resolves to solid neutral-18. A targeted static-DOM
Chrome probe confirmed these effective paths; this is not hydrated or visual
proof.

**NF20/NF21, shared option focus:** Most option rows use the shared item-focus
fill, but local rules affect the result: Select/ComboBox have an explicit dark
focused fill; the translucent CommandPalette focus is already mixed; ListBox
keyboard focus without pointer hover is transparent; Virtualizer has its own
dark neutral-94 fill. Menu focus uses an action token and stays excluded.

**NF04, Toolbar:** Scoped interaction rules take precedence over the generic
surface-hover rule. Hover has higher specificity than the generic selector;
the scoped data-pressed rule also wins. The light and dark values are recorded
separately in the table.

**DisclosureGroup is a confirmed false positive.** The group hover rule appears
to set solid neutral-12, but its selector specificity 0,4,0 loses to the
regular Disclosure hover selector at 0,5,0. An SSR-backed Chrome 153 probe
confirmed 12% neutral action hover and 16% pointer-active fills. Synthetic
[data-pressed] covered CSS only, not runtime keyboard input. [Regular rule](../src/styles/components.css#L433),
[group rule](../src/styles/components.css#L1415).

**Menu focus is not a neutral fill.** .muxui-menu-item[data-focused] uses
action.background-hover and action.foreground; it is excluded from NF20.
[Menu focus](../src/styles/collections.css#L573).

Other reviewed boundaries: ordinary editable field hover generally changes the
outline only; NF25 is the specific CommandPalette input exception. Disabled
surface-hover rules are excluded. Static popup, card, and navigation rest
surfaces are not state layers. Arbitrary user-colour swatches and slider/wheel
thumbs are outside this neutral-fill ledger. Selected Tree/Table rows already
use tonal selection; selected CommandPalette items use accent colour. The
ListBox and ToggleButtonGroup selected fills remain explicitly excluded.

## Future implementation validation

For any approved uplift, check the actual state selector and computed fill in
light/dark and standard/more-contrast modes, then verify hover, active, keyboard
focus, disabled, selected, and forced-colors behaviour as applicable. Compare
the mix over each real underlying surface, retain foreground contrast, and
confirm reduced-motion and focus-ring behaviour. The audit's targeted browser
probes do not replace those component checks. No forced-colors computed proof
is claimed here. Change the owning component state rules; do not redefine
surface.subtle, surface.hover, surface.pressed, or border.strong globally,
because structural surfaces, disabled states, and control borders also use
those roles.

## Review provenance

Discovery began with provider thread
1dbf2b48-7a5c-4e8a-8344-737c644c3b15; its final source message was recorded at
2026-09-23T05:51:00.914Z in
/Users/admin/.t3/userdata/logs/provider/events.1dbf2b48-7a5c-4e8a-8344-737c644c3b15.log.
The thread is discovery context. Current-state findings link to the reviewed
shared worktree.
