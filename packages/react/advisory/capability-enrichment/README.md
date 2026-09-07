# React capability-enrichment input

This directory is a complete advisory assessment of the accepted Mux UI React
baseline against upstream component libraries. It is not a component registry,
binding specification, support claim, compatibility claim, or publication
authority.

The files here intentionally record immutable identities and advisory assessment
input only:

- `baseline.json` pins the exact source revisions and package identities used
  for the comparison.
- `source-lock.json` pins every cited RAC/Base repo-relative file to its
  immutable commit and git blob object. The default package test is
  self-contained: it mechanically checks the committed baseline, complete
  matrix-to-lock path inventory, identity shape, and mutation rejection
  without assuming an upstream checkout. Base UI documentation is kept in a
  separate `documentationFiles` collection so docs paths are not treated as
  package-source evidence. An explicit strict lane resolves every object,
  including those documentation blobs, against both caller-supplied frozen
  checkouts.
- `implementation-status.json` is a generated, advisory-only projection of
  the matrix's 303 `adopt`/`adapt` decisions. Its keys are
  `family/dimension/capability`; each entry resolves exactly one canonical
  artifact and `web.react` binding owner, one Mux runtime export, and every
  proof path or anchor. `defer` and `omit` rows are deliberately absent and
  never claim implementation. Regenerate or check it with
  `pnpm --filter @muxui/react generate:capability-enrichment` or
  `pnpm --filter @muxui/react generate:check:capability-enrichment`.
- `matrix.json` keeps the accepted 53-family R1.1-R1.4 allocation in roadmap
  order with the exact eight dimensions per family:
  `requiredWorkflows`, `accessibilityAndInteraction`,
  `controlledAndUncontrolledState`, `meaningfulStatesAndEvents`,
  `compoundPartsAndRelationships`, `stylingAndDomHooks`,
  `advancedCapabilities`, and `explicitOmissions`. The eleven R1.1, eleven
  R1.2, twenty-four R1.3, and seven R1.4 rows are complete assessment input;
  all 53 rows have all eight dimensions populated.

Each assessed family records shared, direct repo-relative Mux, React Aria
Components, and Base UI evidence references. Assessed dimensions inherit those
family references and record a concise summary plus one or more
closed-vocabulary decisions. Decisions include `adopt`, `adapt`, `defer`, or `omit`, with
`workflowRationale`, `proposedMuxSemantics`, rationale, portability, API cost,
testing cost, proof references, and proof requirements. This is an assessment
scaffold, not a wholesale copy of upstream props, state, or event inventories.
The current boundary preserves Mux names and keeps RAC press lifecycle
callbacks, Base `render`, `nativeButton`, and `focusableWhenDisabled`, plus
raw `isDisabled`/`isPending`/`onPress*` names, deferred or omitted. Disclosure composition,
Checkbox `readOnly`/`inputRef`, Link router delegation, Meter locale/custom
accessible value text, and ProgressBar formatOptions/locale/custom accessible
value text remain bounded deferrals; Meter's existing `formatOptions` remains
supported. ToggleButton grouping belongs to R1.3.
Group and Separator require no parts or capability expansion in this tranche.

Canonical component and binding files remain the sole owners of Mux UI public
contracts, behavior, accessibility obligations, styling hooks, lifecycle,
compatibility, performance, and platform dispositions. The adopted and adapted
assessment decisions are reconciled into those owners by the current sources;
this advisory record does not grant package support or publication authority.

## Safety boundary

The baseline uses immutable commit and tree identities. Moving tags, branches,
or other mutable refs must not silently update it. The comparison introduces no
runtime dependency, build dependency, export, package entry, or public API;
`@base-ui/react` is research input only, and the existing React Aria Components
dependency remains the accepted internal substrate. Base UI's release is bound
to its exact `2026-08-04T19:48:08+10:00` release timestamp. These files are
therefore not exported or packed by `@muxui/react`.

The recorded `npmIntegrity` values are immutable registry-package identities;
registry tarball bytes are not derivable from a Git checkout. The default
baseline check compares those exact integrity strings, while strict mode
verifies every recorded Git commit, tree, annotated tag, peeled commit,
package version, and file blob against the retained checkouts.

The default check has no hard-coded checkout path and does not depend on
upstream source being present. To run strict source-object verification, set
both `MUXUI_RAC_CHECKOUT` and `MUXUI_BASE_UI_CHECKOUT` to clean retained
checkouts at the accepted commits, then run
`pnpm --filter @muxui/react check:capability-enrichment:strict`. Strict mode
verifies git objects from the recorded commits, not moving branches, and fails
closed when either checkout is absent, dirty, or at another commit.

The matrix is `complete`. R1.1 through R1.4 assessment decisions remain
advisory input only and do not change a component API or package support claim.
The R1.4 tranche records
bounded file/drop, modal, anchored preview, toast, and tooltip workflows while
deferring broad DnD, file-system, portal, render-prop, and notification-system
surfaces. Its PreviewTrigger and Tooltip disabled behavior is an adapter-owned
close/mask contract with controlled-owner refusal explicitly preserved; the
trigger remains focusable with Mux `aria-disabled`/`data-disabled` props unless
the consumer independently disables or removes focusability. Host triggers and
custom triggers that forward accessibility/data props expose those markers;
non-forwarding custom components do not satisfy the focusable trigger contract,
and no wrapper or arbitrary-child observability is promised. Its
positioning values are finite Mux-owned defaults, not donor-default parity. The
Toast proof boundary is observable teardown safety even when upstream hidden
timeout handles remain scheduled; an internally redundant expired-timeout queue
update is allowed until full adapter-owned cancellation exists. Modal and
Popover canonical event normalization is implemented in the current canonical
owners: the `['openChange', 'dismiss']` input becomes `['openChange']`. The R1.3
tranche records finite bounded semantics
such as ISO unavailable-date handling, existing ColorWheel outerRadius 96 and
innerRadius 64 defaults, scalar Slider onChangeEnd frozen end-of-interaction
and cancellation rules, independently controlled Select popup state, consumer-owned Table
sortDescriptor requests, keyboard activation policy for Tabs, readonly
string-array ToggleButtonGroup selection, and fixed-row ListLayout/visible-rect
Virtualizer overscan that does not inherit RAC's velocity-based
OverscanManager behavior; canonical owners remain authoritative for any later
API change.
The direct readOnly contract for ColorArea, ColorSlider, ColorWheel,
ColorSwatchPicker, scalar Slider, and inherited ColorPicker state is an
evidence-driven matrix refinement, not baseline drift: Mux-owned roots/thumbs
retain stable SSR hooks, while the adapter decorates every actual interactive
input/listbox synchronously in the ref commit with both `aria-readonly` and
`data-readonly`, including both ColorArea axes, and removes those markers on
transition. Full SSR attributes on RAC-private hidden inputs remain deferred;
the matrix does not promise private-input SSR parity or require private
`InternalColorThumbContext` imports/control rebuilds. The corresponding proof
must cover SSR roots plus commit-synchronous all-target focus, mutation, and
controlled-rerender behavior.
