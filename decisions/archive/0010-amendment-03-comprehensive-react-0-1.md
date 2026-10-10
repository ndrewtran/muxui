# Decision 0010 amendment 03: comprehensive React 0.1 authority

Status: Accepted exact human acceptance recorded below.

Human acceptance: Andrew / ndrewtran: “I accept Core UI comprehensive React 0.1 authority candidate v1, SHA-256 85a8b5abe25f13a83f27c29561d51e250f558fa1f39e19805aa7741550ae8c1a.”

Parent decision: `core-ui:decision:0010`

Proposed materialization:

- append-only Decision 0010 amendment 03;
- minimum Architecture wording required by this decision;
- minimum Roadmap wording required to sequence R1.0 through R1 exit;
- Product Scope major amendment `5.0.1` to `6.0.0`; and
- the immutable Stage 1 evaluation tool, snapshot, and identity envelope.

This candidate is decision-bearing authority only. It authorizes no repository,
GitHub, Project, dependency, implementation, evidence, publication, release, or
production mutation. Materialization requires separate authorization after
digest-specific acceptance.

## Immutable Stage 1 evaluation

The exact accepted input is `react-aria-components@1.20.0` from
`adobe/react-spectrum` commit
`5ecb3333001313e83898cd07644227897e3bae1f`, tree
`eb6f6e25b83b2095536c4ab7671a0d977726738c`, package subtree
`cf646e6aba1680d1d62caa8a24d9efeae96d2251`, documentation subtree
`03d35846665158610a6edfcfbc55695dc8973fb8`, and exports subtree
`253fb233eac4fa3383b40a473c45a6e13e286f22`.

The npm distribution identity is
`sha512-BMbpIgoV9aELeBrB0Y120NgoigHb5OdcJwc+4e7uSnbTbamea6lo+gqcc4LAxzMaK3Jf+7LI1oCDE6yANsmxIQ==`.

The evaluation is bound to Core UI source commit
`dea987aca51cde9da67fe3cac16c5e69a8c46016`, tree
`af0f923abaf8cdf55acb3c402fa929cfb439335d`, and the approved delivery plan at
SHA-256 `4c9f32f6e9a4a28bd987fc033708d3a607d8e7683c1ca126ca28ddb04eec6e29`.

The immutable Stage 1 artifacts are:

- evaluation tool: 19,040 bytes, SHA-256
  `c29ca2c662e89fd63897cf21ece58282db1fda2f5f9ba8eb5e67a6e4e429338d`;
- evaluation snapshot: 168,799 bytes, SHA-256
  `84c57480c61c2f844d3529702cf8864741e97ec0a0495e972c185da00f70a282`;
- snapshot identity envelope: 442 bytes, SHA-256
  `a3ff037abaad8114dc5b910df1e574e0996df90b4b5403b8de561b756fe7870c`.

The family boundary is deterministic: a documented family is a top-level
capitalized MDX page in the pinned React Aria documentation tree whose authored
section is `Components`, or whose missing section defaults to `Components`.
There are 59 top-level capitalized pages. `FocusRing` and `FocusScope` are
`Interactions`; `I18nProvider`, `PortalProvider`, `SSRProvider`, and
`VisuallyHidden` are `Utilities`. The remaining set contains exactly 53
documented component families.

All 613 exports in the accepted R1.0 raw export snapshot are dispositioned.
The 53 family roots plus 75 explicitly assigned family parts form 128
family-owned upstream runtime inputs. The remaining 158 runtime exports and
327 type-only exports, 485 total, remain internal replaceable substrate
support. This disposition does not re-export React Aria names and does not make
React Aria an owner of Core UI's public API.

Any change to the pinned upstream identity, npm integrity, input bytes,
evaluation tool, family boundary, family-to-part mapping, disposition counts,
Scope ID mapping, or tranche membership invalidates this candidate and every
dependent lock. R1.0 must reproduce this exact snapshot identity. A difference
fails closed and returns to authority acceptance; it is never normalized into
a new count or silently substituted.

## Human decision

Core UI commits all 53 documented React Aria Components `1.20.0` families in
the immutable Stage 1 snapshot as Core-owned React component-family exports by
the `@core-ui/react` React `0.1` boundary.

React Aria Components `1.20.0` is the default internal, replaceable starting
point for React behavior. Core UI owns every public family name, import path,
API, type, default, composition rule, state, event, accessibility obligation,
DOM and styling hook, lifecycle, compatibility promise, support claim,
documentation relation, and release claim. Core UI does not expose React Aria
as its public contract and does not target all 613 upstream exports as public

exports.

The canonical component or pattern record remains the renderer-neutral owner.
The `web.react` binding owns the Core React DOM/API/type/accessibility/styling-
hook contract. `@core-ui/react` owns the React lifecycle, rendering, CSS,
effects, SSR, and hydration implementation. The accepted Mux UI styling
contract and its exception rules remain unchanged.

The 53 outcomes are committed outcomes, not optional inventory candidates.
For these exact outcomes, `defer`, `exclude`, and `not-a-component` are
incomplete states and cannot close a tranche or R1. A family that cannot be
responsibly exported remains unexported and blocks its tranche and R1 closure
until corrected or changed by a later accepted major Product Scope amendment.

Routine family work inside an accepted tranche lock does not require a new
component-by-component authority decision. Decision-bearing deltas still
require acceptance before implementation, including a new public contract or
hook outside the lock, another React dependency, an upstream identity change,
an accepted styling exception, a support or compatibility expansion, a lifecycle or
release-boundary change, or a change to any family, Scope ID, or tranche in
this candidate.

No React Server Components or client-boundary support is admitted. Any future
request requires a separate authority-mapped decision with an exact consumer
contract, package/export effect, compatibility matrix, and verification.

Framework-free `@core-ui/web`, React Native, RNW, native platform packages,
cross-renderer equivalence, stable React promotion, public catalog/tooling,
public documentation, and hosted integrations remain in their separately
activated later tracks. None is an R1 prerequisite and none inherits React
support or API claims.

## Product Scope 6.0.0

Product Scope advances from `5.0.1` to `6.0.0` because this amendment changes
the committed React breadth from disposition-complete coverage with permitted
exclusions to all 53 exact family outcomes by React `0.1`.

All historical Scope IDs and their prior bytes remain immutable. The eight
existing exact outcome IDs are reused without renaming or repurposing:

- `Button` -> `SCOPE-COMP-BUTTON-REACT`;
- `TextField` -> `SCOPE-COMP-TEXTFIELD-REACT`;
- `Switch` -> `SCOPE-COMP-SWITCH-REACT`;
- `Form` -> `SCOPE-PATTERN-FORM-REACT`;
- `Select` -> `SCOPE-COMP-SELECT-REACT`;
- `Tabs` -> `SCOPE-COMP-TABS-REACT`;
- upstream `Modal`, whose Core public family is `Dialog`, ->
  `SCOPE-COMP-DIALOG-REACT`; and
- `Toast` -> `SCOPE-COMP-TOAST-REACT`.

The following table is the complete immutable 53-family Scope registry for
this decision. `new` means Product Scope 6.0.0 adds the ID; `existing` means
the exact previously committed ID is retained.

| Upstream family | Core public family | Immutable Scope ID | ID treatment | Tranche |
| --- | --- | --- | --- | --- |
| `Autocomplete` | `Autocomplete` | `SCOPE-COMP-AUTOCOMPLETE-REACT` | new | R1.2 |
| `Breadcrumbs` | `Breadcrumbs` | `SCOPE-COMP-BREADCRUMBS-REACT` | new | R1.1 |
| `Button` | `Button` | `SCOPE-COMP-BUTTON-REACT` | existing | R1.1 |
| `Calendar` | `Calendar` | `SCOPE-COMP-CALENDAR-REACT` | new | R1.3 |
| `Checkbox` | `Checkbox` | `SCOPE-COMP-CHECKBOX-REACT` | new | R1.1 |
| `CheckboxGroup` | `CheckboxGroup` | `SCOPE-COMP-CHECKBOXGROUP-REACT` | new | R1.2 |
| `ColorArea` | `ColorArea` | `SCOPE-COMP-COLORAREA-REACT` | new | R1.3 |
| `ColorField` | `ColorField` | `SCOPE-COMP-COLORFIELD-REACT` | new | R1.3 |
| `ColorPicker` | `ColorPicker` | `SCOPE-COMP-COLORPICKER-REACT` | new | R1.3 |
| `ColorSlider` | `ColorSlider` | `SCOPE-COMP-COLORSLIDER-REACT` | new | R1.3 |
| `ColorSwatch` | `ColorSwatch` | `SCOPE-COMP-COLORSWATCH-REACT` | new | R1.3 |
| `ColorSwatchPicker` | `ColorSwatchPicker` | `SCOPE-COMP-COLORSWATCHPICKER-REACT` | new | R1.3 |
| `ColorWheel` | `ColorWheel` | `SCOPE-COMP-COLORWHEEL-REACT` | new | R1.3 |
| `ComboBox` | `ComboBox` | `SCOPE-COMP-COMBOBOX-REACT` | new | R1.3 |
| `DateField` | `DateField` | `SCOPE-COMP-DATEFIELD-REACT` | new | R1.2 |
| `DatePicker` | `DatePicker` | `SCOPE-COMP-DATEPICKER-REACT` | new | R1.2 |
| `DateRangePicker` | `DateRangePicker` | `SCOPE-COMP-DATERANGEPICKER-REACT` | new | R1.2 |
| `Disclosure` | `Disclosure` | `SCOPE-COMP-DISCLOSURE-REACT` | new | R1.1 |
| `DisclosureGroup` | `DisclosureGroup` | `SCOPE-COMP-DISCLOSUREGROUP-REACT` | new | R1.1 |
| `DropZone` | `DropZone` | `SCOPE-COMP-DROPZONE-REACT` | new | R1.4 |
| `FileTrigger` | `FileTrigger` | `SCOPE-COMP-FILETRIGGER-REACT` | new | R1.4 |
| `Form` | `Form` | `SCOPE-PATTERN-FORM-REACT` | existing | R1.2 |
| `GridList` | `GridList` | `SCOPE-COMP-GRIDLIST-REACT` | new | R1.3 |
| `Group` | `Group` | `SCOPE-COMP-GROUP-REACT` | new | R1.1 |
| `Link` | `Link` | `SCOPE-COMP-LINK-REACT` | new | R1.1 |
| `ListBox` | `ListBox` | `SCOPE-COMP-LISTBOX-REACT` | new | R1.3 |
| `Menu` | `Menu` | `SCOPE-COMP-MENU-REACT` | new | R1.3 |
| `Meter` | `Meter` | `SCOPE-COMP-METER-REACT` | new | R1.1 |
| `Modal` | `Dialog` | `SCOPE-COMP-DIALOG-REACT` | existing | R1.4 |
| `NumberField` | `NumberField` | `SCOPE-COMP-NUMBERFIELD-REACT` | new | R1.2 |
| `Popover` | `Popover` | `SCOPE-COMP-POPOVER-REACT` | new | R1.4 |
| `PreviewTrigger` | `PreviewTrigger` | `SCOPE-COMP-PREVIEWTRIGGER-REACT` | new | R1.4 |
| `ProgressBar` | `ProgressBar` | `SCOPE-COMP-PROGRESSBAR-REACT` | new | R1.1 |
| `RadioGroup` | `RadioGroup` | `SCOPE-COMP-RADIOGROUP-REACT` | new | R1.3 |
| `RangeCalendar` | `RangeCalendar` | `SCOPE-COMP-RANGECALENDAR-REACT` | new | R1.3 |
| `SearchField` | `SearchField` | `SCOPE-COMP-SEARCHFIELD-REACT` | new | R1.2 |
| `Select` | `Select` | `SCOPE-COMP-SELECT-REACT` | existing | R1.3 |
| `Separator` | `Separator` | `SCOPE-COMP-SEPARATOR-REACT` | new | R1.1 |
| `Slider` | `Slider` | `SCOPE-COMP-SLIDER-REACT` | new | R1.3 |
| `Switch` | `Switch` | `SCOPE-COMP-SWITCH-REACT` | existing | R1.2 |
| `Table` | `Table` | `SCOPE-COMP-TABLE-REACT` | new | R1.3 |
| `Tabs` | `Tabs` | `SCOPE-COMP-TABS-REACT` | existing | R1.3 |
| `TagGroup` | `TagGroup` | `SCOPE-COMP-TAGGROUP-REACT` | new | R1.3 |
| `TextField` | `TextField` | `SCOPE-COMP-TEXTFIELD-REACT` | existing | R1.2 |
| `TimeField` | `TimeField` | `SCOPE-COMP-TIMEFIELD-REACT` | new | R1.2 |
| `Toast` | `Toast` | `SCOPE-COMP-TOAST-REACT` | existing | R1.4 |
| `ToggleButton` | `ToggleButton` | `SCOPE-COMP-TOGGLEBUTTON-REACT` | new | R1.1 |
| `ToggleButtonGroup` | `ToggleButtonGroup` | `SCOPE-COMP-TOGGLEBUTTONGROUP-REACT` | new | R1.3 |
| `TokenField` | `TokenField` | `SCOPE-COMP-TOKENFIELD-REACT` | new | R1.3 |
| `Toolbar` | `Toolbar` | `SCOPE-COMP-TOOLBAR-REACT` | new | R1.3 |
| `Tooltip` | `Tooltip` | `SCOPE-COMP-TOOLTIP-REACT` | new | R1.4 |
| `Tree` | `Tree` | `SCOPE-COMP-TREE-REACT` | new | R1.3 |
| `Virtualizer` | `Virtualizer` | `SCOPE-COMP-VIRTUALIZER-REACT` | new | R1.3 |

Each row is `committed`; its package/platform is `@core-ui/react` / `web.react`;
its activation requires this authority, the exact Stage 1/R1.0 snapshot,
accepted tranche lock, Core-owned contract, applicable styling disposition,
risk-selected deterministic and manual proof, post-proof human evidence
acceptance, and the unchanged React prerelease release boundary. No row commits
a React Aria public name, raw helper/type export, secondary renderer,
cross-platform counterpart, stable lifecycle, or independent release.

The existing `SCOPE-REACT-BREADTH-001` outcome is changed in 6.0.0 from
disposition-complete applicable coverage with permitted exclusions to complete
delivery of all 53 exact snapshot families. `SCOPE-METRIC-REACT-COVERAGE`
measures exact 53-of-53 Core contract/export/proof closure plus complete raw
disposition and cannot be satisfied by upstream name or raw export count.
Other existing Product Scope commitments, deferred items, admitted items,
packages, platforms, surfaces, release boundaries, and non-goals retain their
5.0.1 states unless explicitly changed above.

## Roadmap reconciliation and tranche locks

R1.0 remains the baseline milestone. Before any family implementation under
Product Scope 6.0.0, R1.0 must reproduce the exact Stage 1 snapshot and bind the
same identity into its reusable proof baseline and every tranche lock. The
existing accepted R1.0 evidence predates this major amendment and is historical
input only until exact applicability to this scope and snapshot is proved; it
cannot silently satisfy the new all-53 baseline.

The immutable tranche family sets are:

- R1.1, 11 families: `Breadcrumbs`, `Button`, `Checkbox`, `Disclosure`,
  `DisclosureGroup`, `Group`, `Link`, `Meter`, `ProgressBar`, `Separator`,
  `ToggleButton`. Button is implemented first.
- R1.2, 11 families: `Autocomplete`, `CheckboxGroup`, `DateField`,
  `DatePicker`, `DateRangePicker`, `Form`, `NumberField`, `SearchField`,
  `Switch`, `TextField`, `TimeField`.
- R1.3, 24 families: `Calendar`, `ColorArea`, `ColorField`, `ColorPicker`,
  `ColorSlider`, `ColorSwatch`, `ColorSwatchPicker`, `ColorWheel`, `ComboBox`,
  `GridList`, `ListBox`, `Menu`, `RadioGroup`, `RangeCalendar`, `Select`,
  `Slider`, `Table`, `Tabs`, `TagGroup`, `ToggleButtonGroup`, `TokenField`,
  `Toolbar`, `Tree`, `Virtualizer`.
- R1.4, 7 families: `DropZone`, `FileTrigger`, `Modal`/Core `Dialog`,
  `Popover`, `PreviewTrigger`, `Toast`, `Tooltip`.
- R1.5 adds no family implementation. It closes the exact all-53 public export
  manifest, Core contract and lifecycle ledger, styling disposition,
  evidence and support matrix, packed prerelease graph, generated guidance,
  and React `0.1` release candidate.

After the common R1.0 baseline and each exact lock are accepted, R1.1 through
R1.4 may proceed independently; none may change another tranche or the 53-set.
Each tranche freezes its Core-owned public contracts and uses shared proof only
while the exact baseline identity and invalidation set remain unchanged. Each
retains focused deterministic proof, risk-selected independent review,
applicable manual browser/AT proof before export, post-proof human evidence
acceptance, packed-consumer validation, and failure evidence. R1.5 begins only
after R1.1 through R1.4 are complete.

No per-family implementation loop may replace tranche proof with a broad
untested assertion. Conversely, unchanged shared baseline facts need not be
reproved per family. A failed family blocks only its tranche until a shared
baseline failure is established; a shared baseline failure invalidates every
affected tranche.

R1 exit remains an exact prerelease of only `@core-ui/react` under `next`, with
the already-authorized React/React DOM peer boundary and internal
`react-aria-components@1.20.0` dependency. Every registry mutation requires a
separate exact publication authorization and a final registry/version/dist-tag
collision and authorization-drift check. This authority publishes nothing.

## Minimum Architecture wording

Architecture must record only these additional durable rules:

1. The React `0.1` committed inventory is the 53 Core-owned family outcomes in
   the accepted immutable Stage 1 snapshot and Product Scope 6.0.0, not the
   React Aria export list.
2. React Aria remains an internal replaceable implementation input; raw
   upstream exports, names, parts, helpers, hooks, utilities, and types are not
   public merely because the dependency exports them.
3. Existing canonical component/pattern, `web.react` binding, React source,
   example, styling, evidence, and release owners do not change.
4. Accepted R1.1-R1.4 locks are independently executable after the common R1.0
   baseline; R1.5 is a breadth/release closure, not a fifth implementation
   inventory.
5. The exact snapshot identity is a fail-closed authority and release input.
   Drift returns to authority acceptance.
6. RSC/client-boundary support and all secondary renderer work remain absent
   until separate authority admission.

## Evidence, reversal, and historical boundary

Historical authority, Scope IDs, Decision 0010 and amendments 01-02, Project
records, PRs, releases, and retained evidence remain immutable. This amendment
does not recertify or rewrite them. Their facts may be reused only through an
explicit current applicability binding.

Before implementation, rejection or reversal is append-only supersession and
requires no runtime migration. After implementation begins, changing the
53-family commitment, family boundary, ID mapping, tranche allocation, React
Aria identity, public ownership model, package graph, styling rule, support
boundary, or release boundary requires a new accepted decision, Product Scope
major amendment when applicable, affected lock reconciliation, and bounded
reproof. Removal of a committed family is a major scope change.

## Project boundary

This authority does not update the GitHub Project. After accepted authority is
materialized and verified on the default branch, a fresh Project migration
packet may reconcile #74-#81 and any required successor items to Product Scope
6.0.0, the exact snapshot, and the revised R1 tranches. That packet, human
acceptance, and authorized mutation or no-op are independent of R1.0
implementation entry. Tracker status never changes Product Scope or evidence.

## Explicit non-goals

This candidate authorizes no repository edit, branch, commit, push, PR,
Project update, dependency installation, component implementation, CSS copy,
playground work, evidence capture, package publication, release, deployment,
support claim, stable promotion, React Aria public re-export, raw-export
breadth target, RSC/client-boundary support, framework-free implementation,
React Native implementation, RNW support, equivalence claim, public catalog or
tooling product, Scale port, new theme system, or production change.

It does not rewrite historical evidence or reuse historical Scope IDs for new
outcomes. It does not allow a count-only completion claim. It does not permit
an upstream contract to replace a Core-owned public contract.

## Acceptance effect

Digest-specific human acceptance authorizes only preparation of the exact
materialization diff. Repository authoring, commit, push, PR creation, Project
mutation, merge, implementation, evidence acceptance, publication, and release
remain separate authorization boundaries.

## Amendment record

This append-only amendment records the exact accepted candidate semantics and does not rewrite Decision 0010 or amendments 01–02. The accepted candidate authorizes preparation of the exact materialization diff only; repository authoring, Git, Project, implementation, evidence acceptance, publication, and release remain separately authorized boundaries.
