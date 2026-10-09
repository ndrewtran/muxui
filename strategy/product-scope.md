---
scopeVersion: 18.0.0
status: execution-baseline
product: Mux UI
architecture: ./monorepo-architecture.md
roadmap: ./milestone-roadmap.md
---

# Mux UI product scope

## Purpose and authority

This document defines **what Mux UI is intended to ship**. It turns the
architecture and milestone roadmap into a product portfolio with stable scope
IDs, release commitments, platform coverage, public surfaces, and explicit
non-goals.

The authority order is:

1. [`monorepo-architecture.md`](./monorepo-architecture.md) defines what must
   remain true.
2. [`milestone-roadmap.md`](./milestone-roadmap.md) defines how those truths are
   built and proved.
3. This document defines which product outcomes and capabilities are committed,
   admitted, deferred, or rejected.
4. The project tracker records live work, owners, pull requests, blockers, and
   schedules.

If this document conflicts with the architecture, the architecture wins. If a
committed scope item lacks an adequate roadmap milestone or evidence assertion,
the roadmap must be corrected before the item moves into implementation. The
tracker may reference scope and milestone IDs but cannot change product scope.

This is not a status report. Git history records changes to product commitment;
the tracker records delivery progress.

Product Scope `8.0.0` records Decision 0012's pre-publication reset from the
predecessor display, machine, and package identities to Mux UI / `muxui` /
`@muxui/*`, followed by the bounded parity and private theme-authoring
expansion.
The major increment reflects the repository identity rename plus the
prepublication React parity/theme-builder boundary, admitted additional themes,
private authoring capability, and optional consumer integration. The accepted
53-family table, immutable Stage 1 snapshot, and R1.0 baseline remain the
existing R1 lock; R1.6 adds parity and private authoring proof without a
blanket all-style standalone API requirement.

Product Scope `10.0.0` applies Decision 0016: the current pre-release product
supports current Mux-owned contracts only, with no consumers requiring legacy
aliases or historical query/schema migration surfaces. This major removes the
previously committed active v1.1/v1.2 query support and notice-release requirement;
Scope IDs and component/platform commitments remain unchanged. Compatibility
windows attach to supported published contracts. Historical evidence stays
immutable and is not an active implementation obligation.

Product Scope `11.0.0` applies Decision 0017: the current pre-release React
surface admits the Mux-owned experimental `Text` family under the existing
supplemental scope. The historical 53-family inventory and completed R1.6
evidence remain unchanged; that admission grew the supplemental mapping to 23
families and the React union to 76 families, with 74 root exports and two
isolated subpaths.

Product Scope `12.0.0` applies Decision 0018: the post-R1.6 supplemental
boundary also admits Mux-owned Image, Avatar, and SelectNative. Image and
Avatar use native image/fallback behavior; SelectNative uses a native select
with internal React Aria field associations. That admission established 26 supplemental families and 79 total families,
with 77 root exports and the two existing isolated subpaths. This explicit expansion does not recast the
original Aria-only R1.6 inventory or its evidence.

Product Scope `12.0.1` applies accepted Decision 0019 as a patch clarification:
`@muxui/react` may adopt the exact internal, replaceable `motion@13.4.0` edge
for bounded Mux-owned component motion in existing admitted `web.react`
families. Private `motion/react` and `motion/react-m` imports remain local to
the owning renderer modules; Mux UI owns public APIs, tokens, modes, CSS,
accessibility, SSR/hydration, and lifecycle. Registry metadata is not install,
lockfile, package, or proof evidence.

Product Scope `12.1.0` applies Decision 0020: Figma is the named design tool,
and an export-only slice of the admitted design-tool items lands early inside
private `@muxui/tokens`. Import and round-trip keep their G3.5 conditions.

Product Scope `12.1.1` applies Decision 0021 as a patch: the remaining 6.0.0,
6.0.3, and 6.0.4 amendment sections move to the ignored recovery archive, and
the fixed 53-family registry and breadth rule they carried move unchanged into
the React `0.1` prerelease boundary.

Product Scope `12.1.2` applies Decision 0011 amendment 04 as a patch
clarification: the same eight internal `TextEditor` Tiptap packages move from
`3.22.3` to exact `3.31.4`, so consumer installs resolve one Tiptap version.

Product Scope `13.0.0` applies Decision 0011 amendment 03, which admits the
`Tabs` overflow scroll chevrons, the `Disclosure` trigger chevron, and the
`CheckboxField` check and minus to the existing internal Lucide edge; Decision
0022, under which `@muxui/react@0.1.0-rc.1` claims no assistive-technology
support; and Decision 0023, which replaces "no `latest` tag" with "no `latest`
claim" and makes deprecate and fix forward the rc.1 rollback plan. Decision
0022 also records unmet R1 evidence as deferred to `S1.0`.

Product Scope `13.1.0` applies Decision 0020 amendment 01: the export-only
Figma slice extends to components for a named set of simple controls,
delivered in batches through the private, never published
`@muxui/figma` adapter. Import and round-trip keep their G3.5
conditions.

Product Scope `14.0.0` applies Decision 0022 amendment 01: the R1 pull
requests have no hosted review logs, so the release-acceptance review
evidence is the retained retroactive review of R1.2 through R1.4 and, by
Andrew's accepted exception, author-reported review for R1.1 and R1.5, which
is not proof. Changing what satisfies a committed release-acceptance
condition is major.

Product Scope `14.0.1` applies Decision 0011 amendment 05 as a patch
clarification: the internal temporal-adapter dependency moves from exact
`@internationalized/date@3.12.3` to exact `3.12.4`, so fresh npm, pnpm, and
yarn consumer installs resolve one version.

Product Scope `14.0.2` applies accepted Decision 0023 as a patch
clarification: the `SCOPE-PRODUCT-REACT-PRERELEASE` row now names the
fix-forward `0.1.0-rc.N+1` that Decision 0023 and the Roadmap R1 exit already
admit, so the row agrees with the rest of the authority chain.

Product Scope `15.0.0` applies Decision 0026: it admits the private Blocks
showcase as `SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE`, delivered by the new Roadmap
slice `BL1`, for bounded application compositions and bounded marketing page
sections. "Block" is the public name for a `pattern` artifact, so the committed
`SCOPE-KIND-PATTERN` gains its first delivery reference, and the first pattern
schema stages the v1 field list. `SCOPE-NONGOAL-008` now states that block
placeholder copy and imagery are demonstration material, not product truth, and
that statement is the major effect. The showcase sits outside the React `0.1`
and Productization boundaries.

Product Scope `15.0.1` applies Decision 0026 item 10 as a patch clarification:
token-source retrieval now names query API `2.1.0`, the additive minor that the
pattern kind's new response members take, so the line agrees with the query
surface.

Product Scope `15.0.2` applies Decision 0011 amendment 06 as a patch
clarification: the existing internal `lucide-react@1.37.0` edge of
`@muxui/react` is the default icon source for decorative affordances in every
component, so the per-component affordance lists no longer limit it.

## Scope vocabulary

### Commitment states

| State | Meaning |
| --- | --- |
| `candidate` | A plausible product item awaiting workflow evidence and scope admission. It must not be advertised or treated as a dependency. |
| `admitted` | The product direction is approved and bounded, but activation conditions or release commitment are not yet satisfied. |
| `committed` | The item is required for its named release boundary. It can be removed only through an explicit product-scope change. |
| `deferred` | The item is intentionally unavailable until its named trigger is proved. |
| `rejected` | The item conflicts with Mux UI's authority, safety, platform, or product boundaries. |

Commitment state is not implementation status and is not artifact lifecycle.
For example, a component can be `committed` to the `0.1` scope while its
binding lifecycle remains `experimental` until promotion evidence passes.

### Delivery boundaries

| Boundary | Meaning |
| --- | --- |
| Foundation | Internal Gate 0 operability spine; no public product-completeness claim. |
| React `0.1` | Package-only `@muxui/react` prereleases under `next`, with generated version-bound tarball guidance and no secondary-renderer or stable claim. |
| Productization | Compatible public catalog/tooling, CLI-as-documentation, local authority, consumer validation, React documentation surfaces, and enabled safe operations. |
| Secondary renderer | Separately activated framework-free web or native package/profile delivery after the React prerelease boundary. |
| Capability release | Independently admitted Gate 3 breadth or integration; there is no global “all Gate 3 complete” state. |

### Scope-item contract

Every product-scope item has:

- one immutable scope ID;
- one product outcome and authoritative owner;
- one commitment state and earliest delivery boundary;
- applicable platforms or an explicit non-platform disposition;
- roadmap milestone and evidence references;
- dependencies and activation conditions;
- explicit exclusions; and
- a removal, replacement, or deferral rule where applicable.

Scope IDs are never reused. Renaming a display label does not change the ID.
Splitting or replacing an item creates new IDs and records the relationship in
the change that updates this document.

## Product definition

Mux UI is an AI-ready design system and component library whose primary
component product and first public component-package boundary is React.
`@muxui/react` uses React Aria Components internally while Mux UI owns every
public identity, semantic, API, type, behavior, accessibility, styling,
lifecycle, compatibility, support, documentation, and inventory contract.

Framework-free web and React Native are later secondary tracks. React Native
implements renderer-neutral Mux UI semantic contracts through its own binding
specs and native primitives; it does not distill React APIs or React Aria.

The first package-only React prerelease contains generated, version-bound
README/API/export/compatibility guidance. At Productization, the CLI becomes the
primary exact-version documentation interface. Human, dense, typed JSON, MCP,
site, explorer, and agent-context views remain projections of the same
canonical graph and query engine.

Mux UI is AI-ready only when agents can discover capabilities, retrieve exact
installed-version guidance, select deterministic examples, compose bounded
patterns, validate results, and recover from structured diagnostics without
scraping prose or guessing unsupported APIs.

## Product outcomes

| Scope ID | Commitment | Outcome |
| --- | --- | --- |
| `SCOPE-OUTCOME-001` | `deferred` | A consumer can implement supported UI on web, React, iOS, and Android from one shared semantic system with explicit platform binding differences after the relevant secondary tracks complete. |
| `SCOPE-OUTCOME-REACT-PRIMARY` | `committed` | A consumer can install the published React prerelease and use Mux UI-owned experimental React bindings with generated version-bound package guidance. |
| `SCOPE-OUTCOME-MULTIPLATFORM-SECONDARY` | `deferred` | Framework-free and native consumers later receive platform-correct adaptations from the renderer-neutral semantic system. |
| `SCOPE-OUTCOME-002` | `committed` | A human, agent, or tool can discover and retrieve exact locally compatible Mux UI guidance through a self-describing CLI without repository crawling. |
| `SCOPE-OUTCOME-003` | `committed` | Every public fact has one canonical owner and every package, documentation surface, example, and proof projection can be regenerated and verified against it. |
| `SCOPE-OUTCOME-004` | `committed` | Maintainers can add and evolve components through owner-linked scaffolds, semantic diffs, revision explanations, affected closures, and structured proof. |
| `SCOPE-OUTCOME-005` | `committed` | Stable releases expose exact package, catalog, binding, token, runtime-profile, evidence, and exception identity. |
| `SCOPE-OUTCOME-006` | `admitted` | Agents can propose a small allowlist of canonical changes through deterministic review packets and explicit approval without receiving arbitrary patch authority. |
| `SCOPE-OUTCOME-007` | `admitted` | Selected design-tool workflows can round-trip supported semantics as provenance-rich import proposals without making design-tool files authoritative. |
| `SCOPE-OUTCOME-008` | `admitted` | Repeated synthesis and transformation tasks can justify narrowly owned promptable semantics without creating a parallel interpretation ontology. |

## Primary users and jobs

| Scope ID | User | Mux UI job |
| --- | --- | --- |
| `SCOPE-USER-001` | Framework-free web consumer | Install Mux UI, retrieve compatible HTML/CSS/JS guidance, implement accessible UI, and validate supported source without adopting React. |
| `SCOPE-USER-002` | React consumer | Use typed React bindings that preserve the applicable Mux UI web styling and observable semantics without learning a second visual system. |
| `SCOPE-USER-003` | React Native consumer | Use platform-appropriate native components, tokens, accessibility obligations, and alternatives without importing CSS or DOM assumptions. |
| `SCOPE-USER-004` | Product engineer working with an agent | Give intent, let the agent discover exact capabilities and examples, generate compatible code, validate it, and repair it from structured diagnostics. |
| `SCOPE-USER-005` | Design-system maintainer | Author one canonical fact, see its semantic and compatibility effects, implement affected bindings, and produce the required evidence without repairing projections manually. |
| `SCOPE-USER-006` | Release and evidence steward | Verify package/catalog identity, compatibility, support claims, evidence retention, advisories, exceptions, and rollback before publication. |
| `SCOPE-USER-007` | Documentation consumer | Read human-oriented guidance generated from the same catalog responses and canonical guides available to agents. |
| `SCOPE-USER-008` | Future adapter author | Add a demanded framework, design-tool, protocol, or extension only through an admitted binding/capability that cannot fork Mux UI truth. |

## Product boundary

### In scope

- Canonical component, pattern, token, foundation, guide, example, pitfall,
  migration, and capability knowledge.
- A first-party React renderer product, followed by separately activated
  framework-free web and React Native renderer products.
- A first-party default theme with deterministic web and native transforms.
- A compiled catalog and pure query engine.
- CLI-as-documentation with human, dense, and JSON output.
- Installed-local compatibility resolution and bounded validation.
- Documentation, explorer, local MCP, and small static-agent projections.
- Deterministic proof, retained evidence, compatibility, lifecycle, migrations,
  and release identity.
- Maintainer authoring workflows and bounded, explicitly approved project or
  canonical operations when their capabilities are enabled.
- Independently admitted later capabilities that preserve kernel authority.

### Permanently outside the product boundary

| Scope ID | State | Exclusion |
| --- | --- | --- |
| `SCOPE-NONGOAL-001` | `rejected` | React source, stories, the website, MCP, or design-tool files as the canonical component inventory. |
| `SCOPE-NONGOAL-002` | `rejected` | A shared renderer implementation that forces DOM, CSS, web focus, portal, navigation, or transition behavior onto native platforms. |
| `SCOPE-NONGOAL-003` | `rejected` | A second documentation, search, example, or component registry owned by an adapter or application. |
| `SCOPE-NONGOAL-004` | `rejected` | Silent fallback to hosted latest, ancestor packages, a highest-compatible catalog, or an undeclared cache for project guidance. |
| `SCOPE-NONGOAL-005` | `rejected` | Generated projections repaired directly or accepted as independent authoring inputs. |
| `SCOPE-NONGOAL-006` | `rejected` | Arbitrary LLM-generated repository, consumer-project, migration, or design-tool patches. |
| `SCOPE-NONGOAL-007` | `rejected` | A universal prompt-only design-intent object, free-standing interpretation graph, or model-selected example ranking. |
| `SCOPE-NONGOAL-008` | `rejected` | Application-owned routes, navigation flows, business state, analytics, product content, or screen-specific logic represented as Mux UI truth. Block placeholder copy and imagery under Decision 0026 are demonstration material, not Mux UI product truth. |
| `SCOPE-NONGOAL-009` | `rejected` | A static full-catalog context file as the primary agent interface. |
| `SCOPE-NONGOAL-010` | `rejected` | Multi-framework abstraction before a second demanded framework binding proves repeated shape. |
| `SCOPE-NONGOAL-011` | `rejected` | Hosted execution of consumer code, project mutation, migration, extensions, or local-filesystem diagnostics. |
| `SCOPE-NONGOAL-012` | `rejected` | Component-count growth as a substitute for workflow value, platform honesty, accessibility, compatibility, or proof. |

## Release portfolio

### Foundation boundary

Gate 0 is a committed internal foundation, not a component-library release.

| Scope ID | Commitment | Product deliverable | Roadmap |
| --- | --- | --- | --- |
| `SCOPE-FOUNDATION-001` | `committed` | Predictable repository topology, ownership boundaries, task graph, navigation, and generated-file policy. | G0.0 |
| `SCOPE-FOUNDATION-002` | `committed` | Closed source/response schemas, stable identities, field ownership, relations, lifecycle/strategy, and revision semantics. | G0.1 |
| `SCOPE-FOUNDATION-003` | `committed` | Deterministic catalog compiler, relation graph, search index, digest, and pure query kernel. | G0.2 |
| `SCOPE-FOUNDATION-004` | `committed` | Self-describing CLI documentation baseline with `manifest`, `list`, `search`, and `get`. | G0.3 |
| `SCOPE-FOUNDATION-005` | `committed` | Exact project-local catalog package and deterministic resolver with typed failure taxonomy. | G0.4 |
| `SCOPE-FOUNDATION-006` | `committed` | Schema-aware scaffold, source-linked diagnostics, semantic diff, revision explainer, and affected-closure view. | G0.5 |

Foundation completion does not advertise component breadth, public MCP, a
documentation application, consumer mutation, composition planning, migration,
hosted services, design-tool integration, or another framework.

### React `0.1` prerelease boundary

The current `0.1` product commitment is a package-only React prerelease. Each
R1 tranche may publish `@muxui/react@0.1.0-alpha.N` under `next` once its
breadth closure may propose `0.1.0-rc.1`. No `latest` claim, stable `0.1.0`,
framework-free package, native package/profile, public catalog/tooling/CLI,
cross-platform equivalence, or secondary-renderer support claim belongs to this
boundary. Under Decision 0023, the registry points `latest` at the first
publish, so if an alpha is published first `latest` points at that alpha.
Apart from a separately authorized re-point of `latest` to the
fix-forward rc during a rollback, Mux UI neither claims nor promotes it, no
stable release is promoted, and install guidance uses `@muxui/react@next`.

| Scope ID | Commitment | Product deliverable | Roadmap |
| --- | --- | --- | --- |
| `SCOPE-OUTCOME-REACT-PRIMARY` | `committed` | Installable React prerelease using Mux UI-owned experimental bindings and generated package guidance. | R1.0–R1 exit |
| `SCOPE-SYSTEM-REACT` | `committed` | Standalone React substrate, CSS/runtime ownership, exact React Aria baseline, Mux UI-owned styling and tranche delivery. | R1.0–R1.5 |
| `SCOPE-REACT-BREADTH-001` | `committed` | Disposition-complete Mux UI coverage of the applicable pinned React Aria component surface. | R1.1–R1.5 |
| `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` | `committed` | Mux UI-owned bindings, CSS, interaction contracts, and exports outside the historical fixed 53-family table: the exact R1.6 React Aria inventory plus explicitly named post-R1.6 admissions in Decisions 0014, 0017, 0018, 0024, and 0025, including native-backed Image and Avatar. Each admission requires its declared proof and the single current supplemental mapping. | R1.6, named post-R1.6 additions, and R1 exit |
| `SCOPE-PRODUCT-REACT-PRERELEASE` | `committed` | Exact `@muxui/react@0.1.0-alpha.N`/`rc.1` tarball and release manifest under `next`, or a fix-forward `0.1.0-rc.N+1` that replaces a deprecated rc under Decision 0023. | R1 tranche exits and R1 exit |
| `SCOPE-SURFACE-REACT-PACKAGE-GUIDANCE` | `committed` | Generated version-bound install, API, export/component, styling, and compatibility guidance in the tarball. | R1.0 and every tranche |

The React-specific component and pattern commitments are
`SCOPE-COMP-BUTTON-REACT`, `SCOPE-COMP-TEXTFIELD-REACT`,
`SCOPE-COMP-SWITCH-REACT`, `SCOPE-PATTERN-FORM-REACT`,
`SCOPE-COMP-SELECT-REACT`, `SCOPE-COMP-TABS-REACT`,
`SCOPE-COMP-DIALOG-REACT`, and `SCOPE-COMP-TOAST-REACT`. Their accepted
`5.0.0` contracts are preserved in the ignored recovery archive.

Every exported binding remains `experimental` until independently promoted.
Missing binding-required manual or assistive-technology proof keeps it
unexported or explicitly unavailable with support unproved; it does not alter
authored lifecycle/strategy or create an `unsupported` disposition. For the
rc prerelease on `next`, a prerelease amendment (Decision 0022) records the
unmet `DisclosureGroup` manual half of `E-R1.1-04`, the manual and
assistive-technology half of `E-R1.2-03` and `E-R1.3-04`, and `E-R1.4-04` as
deferred to `S1.0`; those bindings are exported with assistive-technology
support unproved and not claimed. The risk-profile half of `E-R1.5-03` is
deferred the same way.

#### Fixed 53-family React registry

This is the complete immutable 53-family React Scope registry. It reuses the
eight earlier React commitments above without renaming or repurposing them;
the other 45 IDs were added by Product Scope `6.0.0`, whose amendment record
Decision 0021 moved to the ignored recovery archive.

| Upstream family | Mux UI public family | Immutable Scope ID | Tranche |
| --- | --- | --- | --- |
| `Autocomplete` | `Autocomplete` | `SCOPE-COMP-AUTOCOMPLETE-REACT` | R1.2 |
| `Breadcrumbs` | `Breadcrumbs` | `SCOPE-COMP-BREADCRUMBS-REACT` | R1.1 |
| `Button` | `Button` | `SCOPE-COMP-BUTTON-REACT` | R1.1 |
| `Calendar` | `Calendar` | `SCOPE-COMP-CALENDAR-REACT` | R1.3 |
| `Checkbox` | `Checkbox` | `SCOPE-COMP-CHECKBOX-REACT` | R1.1 |
| `CheckboxGroup` | `CheckboxGroup` | `SCOPE-COMP-CHECKBOXGROUP-REACT` | R1.2 |
| `ColorArea` | `ColorArea` | `SCOPE-COMP-COLORAREA-REACT` | R1.3 |
| `ColorField` | `ColorField` | `SCOPE-COMP-COLORFIELD-REACT` | R1.3 |
| `ColorPicker` | `ColorPicker` | `SCOPE-COMP-COLORPICKER-REACT` | R1.3 |
| `ColorSlider` | `ColorSlider` | `SCOPE-COMP-COLORSLIDER-REACT` | R1.3 |
| `ColorSwatch` | `ColorSwatch` | `SCOPE-COMP-COLORSWATCH-REACT` | R1.3 |
| `ColorSwatchPicker` | `ColorSwatchPicker` | `SCOPE-COMP-COLORSWATCHPICKER-REACT` | R1.3 |
| `ColorWheel` | `ColorWheel` | `SCOPE-COMP-COLORWHEEL-REACT` | R1.3 |
| `ComboBox` | `ComboBox` | `SCOPE-COMP-COMBOBOX-REACT` | R1.3 |
| `DateField` | `DateField` | `SCOPE-COMP-DATEFIELD-REACT` | R1.2 |
| `DatePicker` | `DatePicker` | `SCOPE-COMP-DATEPICKER-REACT` | R1.2 |
| `DateRangePicker` | `DateRangePicker` | `SCOPE-COMP-DATERANGEPICKER-REACT` | R1.2 |
| `Disclosure` | `Disclosure` | `SCOPE-COMP-DISCLOSURE-REACT` | R1.1 |
| `DisclosureGroup` | `DisclosureGroup` | `SCOPE-COMP-DISCLOSUREGROUP-REACT` | R1.1 |
| `DropZone` | `DropZone` | `SCOPE-COMP-DROPZONE-REACT` | R1.4 |
| `FileTrigger` | `FileTrigger` | `SCOPE-COMP-FILETRIGGER-REACT` | R1.4 |
| `Form` | `Form` | `SCOPE-PATTERN-FORM-REACT` | R1.2 |
| `GridList` | `GridList` | `SCOPE-COMP-GRIDLIST-REACT` | R1.3 |
| `Group` | `Group` | `SCOPE-COMP-GROUP-REACT` | R1.1 |
| `Link` | `Link` | `SCOPE-COMP-LINK-REACT` | R1.1 |
| `ListBox` | `ListBox` | `SCOPE-COMP-LISTBOX-REACT` | R1.3 |
| `Menu` | `Menu` | `SCOPE-COMP-MENU-REACT` | R1.3 |
| `Meter` | `Meter` | `SCOPE-COMP-METER-REACT` | R1.1 |
| `Modal` | `Dialog` | `SCOPE-COMP-DIALOG-REACT` | R1.4 |
| `NumberField` | `NumberField` | `SCOPE-COMP-NUMBERFIELD-REACT` | R1.2 |
| `Popover` | `Popover` | `SCOPE-COMP-POPOVER-REACT` | R1.4 |
| `PreviewTrigger` | `PreviewTrigger` | `SCOPE-COMP-PREVIEWTRIGGER-REACT` | R1.4 |
| `ProgressBar` | `ProgressBar` | `SCOPE-COMP-PROGRESSBAR-REACT` | R1.1 |
| `RadioGroup` | `RadioGroup` | `SCOPE-COMP-RADIOGROUP-REACT` | R1.3 |
| `RangeCalendar` | `RangeCalendar` | `SCOPE-COMP-RANGECALENDAR-REACT` | R1.3 |
| `SearchField` | `SearchField` | `SCOPE-COMP-SEARCHFIELD-REACT` | R1.2 |
| `Select` | `Select` | `SCOPE-COMP-SELECT-REACT` | R1.3 |
| `Separator` | `Separator` | `SCOPE-COMP-SEPARATOR-REACT` | R1.1 |
| `Slider` | `Slider` | `SCOPE-COMP-SLIDER-REACT` | R1.3 |
| `Switch` | `Switch` | `SCOPE-COMP-SWITCH-REACT` | R1.2 |
| `Table` | `Table` | `SCOPE-COMP-TABLE-REACT` | R1.3 |
| `Tabs` | `Tabs` | `SCOPE-COMP-TABS-REACT` | R1.3 |
| `TagGroup` | `TagGroup` | `SCOPE-COMP-TAGGROUP-REACT` | R1.3 |
| `TextField` | `TextField` | `SCOPE-COMP-TEXTFIELD-REACT` | R1.2 |
| `TimeField` | `TimeField` | `SCOPE-COMP-TIMEFIELD-REACT` | R1.2 |
| `Toast` | `Toast` | `SCOPE-COMP-TOAST-REACT` | R1.4 |
| `ToggleButton` | `ToggleButton` | `SCOPE-COMP-TOGGLEBUTTON-REACT` | R1.1 |
| `ToggleButtonGroup` | `ToggleButtonGroup` | `SCOPE-COMP-TOGGLEBUTTONGROUP-REACT` | R1.3 |
| `TokenField` | `TokenField` | `SCOPE-COMP-TOKENFIELD-REACT` | R1.3 |
| `Toolbar` | `Toolbar` | `SCOPE-COMP-TOOLBAR-REACT` | R1.3 |
| `Tooltip` | `Tooltip` | `SCOPE-COMP-TOOLTIP-REACT` | R1.4 |
| `Tree` | `Tree` | `SCOPE-COMP-TREE-REACT` | R1.3 |
| `Virtualizer` | `Virtualizer` | `SCOPE-COMP-VIRTUALIZER-REACT` | R1.3 |

Each row is `committed`; its package/platform is `@muxui/react` / `web.react`;
its activation uses the fixed 53-family table, immutable Stage 1/R1.0
baseline, Mux UI-owned contract, applicable styling disposition,
risk-selected deterministic and manual proof, and the unchanged React
prerelease release boundary. No row commits
a React Aria public name, raw helper/type export, secondary renderer,
cross-platform counterpart, stable lifecycle, or independent release.

`SCOPE-REACT-BREADTH-001` requires complete delivery of all 53 exact snapshot
families rather than disposition-complete applicable coverage with permitted
exclusions. `SCOPE-METRIC-REACT-COVERAGE`
measures exact 53-of-53 Mux UI contract/export/proof closure plus complete raw
disposition and cannot be satisfied by upstream name or raw export count.

Changing the 53-family commitment, family boundary, ID mapping, tranche
allocation, React Aria identity, public ownership model, package graph,
styling rule, support boundary, or release boundary requires a new accepted
decision, a Product Scope major amendment when applicable, affected lock
reconciliation, and bounded reproof. Removal of a committed family is a major
scope change.

### Historical cross-platform `0.1` boundary

The former fixed Gate 1 matrix and the rows below are retained as historical
scope. Their cross-platform meanings are deferred to secondary-track
completion and do not block or satisfy the React `0.1` boundary.

| Scope ID | Commitment | Item | Product outcome | Roadmap |
| --- | --- | --- | --- | --- |
| `SCOPE-COMP-BUTTON` | `deferred` | Button | Historical cross-platform action semantics and complete multi-renderer addition workflow. | W1/N1/X1 successors |
| `SCOPE-COMP-TEXTFIELD` | `deferred` | TextField | Historical cross-platform field and form relations. | W1/N1/X1 successors |
| `SCOPE-COMP-SWITCH` | `deferred` | Switch | Historical cross-platform control semantics. | W1/N1/X1 successors |
| `SCOPE-COMP-DIALOG` | `deferred` | Dialog | Historical cross-platform overlay/native adaptation outcome. | W1/N1/X1 successors |
| `SCOPE-COMP-SELECT` | `deferred` | Select | Historical cross-platform selection/native-alternative outcome. | W1/N1/X1 successors |
| `SCOPE-PATTERN-FORM` | `deferred` | Form pattern | Historical cross-platform composition outcome. | W1/N1/X1 successors |

#### `0.1` platform matrix

| Item | `web.html` | `web.react` | iOS | Android | React Native Web |
| --- | --- | --- | --- | --- | --- |
| Button | Implemented `direct` | Implemented `direct` | Implemented `direct` or `adapted` | Implemented `direct` or `adapted` | Explicit strategy; evidence if implemented |
| TextField | Implemented `direct` | Implemented `direct` | Implemented `direct` or `adapted` | Implemented `direct` or `adapted` | Explicit strategy; evidence if implemented |
| Switch | Implemented `direct` | Implemented `direct` | Implemented `direct` or `adapted` | Implemented `direct` or `adapted` | Explicit strategy; evidence if implemented |
| Dialog | Implemented `direct` or `adapted` | Implemented `direct` or `adapted` | Proved `adapted` or `native-alternative` | Proved `adapted` or `native-alternative` | Explicit strategy; evidence if implemented |
| Select | Implemented `direct` or `adapted` | Implemented `direct` or `adapted` | Proved `native-alternative` | Proved `native-alternative` | Explicit strategy; evidence if implemented |
| Form pattern | Applicable composition and example | Applicable composition and example | Applicable composition and example | Applicable composition and example | Explicit applicability/disposition |

An `unsupported` disposition can satisfy only a cell asking for an explicit
strategy. It cannot satisfy an `Implemented` or `Proved` cell.

#### Shared `0.1` deliverable contract

The historical cross-platform boundary required every component to supply:

- one concept record with intent, anatomy, states, accessibility obligations,
  lifecycle, risk class, alternatives, and bounded decision context where
  useful;
- binding specs for framework-free web, React web, and React Native plus a
  React Native Web runtime-profile disposition;
- a canonical token recipe and compiled requirement-set digest;
- structured pitfalls and typed repair guidance for known misuse;
- one normative executable example for every implemented target and an
  alternative example where `native-alternative` applies;
- implementation or an explicitly permitted target disposition;
- actual packed exports and compatibility descriptors;
- risk-proportionate behavior, accessibility, visual, package, and surface-
  parity evidence; and
- a semantic diff and read-only change-intent preview for a representative
  public change.

The `0.1` boundary also commits:

| Scope ID | Commitment | Deliverable | Roadmap |
| --- | --- | --- | --- |
| `SCOPE-SYSTEM-TOKENS` | `committed` | Mux-owned non-semantic reference baseline plus the complete token/theme/font/typography values, semantic/component recipes, target transforms, fallbacks, requirement sets, and override system needed by the fixed slices and R1.6 parity. | G1.0 after the three-phase Gate 0 correction; R1.6 parity closure |
| `SCOPE-SYSTEM-WEB` | `deferred` | Historical combined framework-free/React substrate; split into active React and deferred framework-free successor IDs. | R1 plus later W1 |
| `SCOPE-SYSTEM-WEB-HTML-SECONDARY` | `deferred` | Future framework-free binding/package system for `web.html` and `@muxui/web`. | W1.0 and W1 tranches |
| `SCOPE-SYSTEM-NATIVE` | `deferred` | Native substrate, iOS/Android behavior, native token output, and explicit React Native Web profile semantics. | N1 |
| `SCOPE-SYSTEM-CURRICULUM` | `committed` | Deterministic example selection by compatibility, binding/profile, purpose, prerequisites, preference, and complexity. | R1.1–R1.5 for React; later tracks extend it |
| `SCOPE-SYSTEM-PROOF` | `committed` | Reproducible release manifests and complete proof/evidence views for the exact enabled boundary. | R1.5/R1 exit for React; later tracks extend it |
| `SCOPE-SYSTEM-VALIDATE-SOURCE` | `committed` | `muxui validate` for Mux UI-owned catalog and canonical example sources only. | R1.5 for React-enabled sources |
| `SCOPE-SYSTEM-MCP-PROBE` | `committed` | Internal local MCP parity probe; not yet a public product and not an R1 blocker. | P2.3 |
| `SCOPE-SYSTEM-AGENT-BASELINE` | `committed` | Informational cold-start and generation evaluations tied to canonical IDs. | R1.5; later tracks extend it |

### Historical post-`0.1` renderer proof extension

The historical authority committed cross-platform Tabs and Toast after Gate 1.
Product Scope `5.0.0` defers those cross-platform outcomes while admitting
their React-specific successors to R1.3 and R1.4. They do not block unrelated
package, resolver, or documentation productization.

| Scope ID | Commitment | Item | Product outcome | Roadmap |
| --- | --- | --- | --- | --- |
| `SCOPE-COMP-TABS` | `deferred` | Tabs | Historical cross-platform keyboard/orientation/layout/focus/selection/native-disposition outcome. | R1.3 React successor; later W1/N1/X1 |
| `SCOPE-COMP-TOAST` | `deferred` | Toast | Historical cross-platform host/transaction/timing/announcement/concurrency outcome. | R1.4 React successor; later W1/N1/X1 |

### Productization boundary

The minimum React Productization release commits P2.1, P2.2, P2.3, and P2 exit.
G2.4 through G2.6 are admitted product capabilities but may remain disabled in
a particular release when their own exit evidence is incomplete. Disabled
capabilities must be absent or explicitly unavailable in every manifest and
surface.

| Scope ID | Commitment | Product deliverable | Roadmap |
| --- | --- | --- | --- |
| `SCOPE-PRODUCT-001` | `committed` | Publishable public packages, packed compatibility descriptors, version policy, historical catalogs, and verifiable release manifests. | P2.1 |
| `SCOPE-PRODUCT-002` | `committed` | Official install profiles, real packed project-local resolution, offline guidance, and bounded consumer validation. | P2.2 |
| `SCOPE-PRODUCT-003` | `committed` | React documentation site/explorer, small agent bootstrap files, and public installed-local MCP; secondary projections wait for W1/N1. | P2.3 |
| `SCOPE-PRODUCT-004` | `admitted` | Grounded read-only `muxui plan` over stable bounded patterns. | G2.4 |
| `SCOPE-PRODUCT-005` | `admitted` | Read-only `muxui doctor` and safe, previewed, confirmed, journalled `muxui init`. | G2.5 |
| `SCOPE-PRODUCT-006` | `admitted` | Four allowlisted agent-safe canonical proposal operations. | G2.6 |
| `SCOPE-PRODUCT-007` | `committed` | Productization release manifest, capability manifest, evidence index, install/rollback proof, and honest disabled-capability reporting. | P2 exit |

The private Blocks showcase (`SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE`, BL1) is not
part of this boundary and satisfies none of these rows.

## Platform scope

| Scope ID | Commitment | Platform/binding | Product commitment |
| --- | --- | --- | --- |
| `SCOPE-PLATFORM-WEB-HTML` | `deferred` | `web.html` | Later W1 HTML binding spec, CSS, semantic markup, progressive enhancement, and optional controllers. |
| `SCOPE-PLATFORM-WEB-REACT` | `committed` | `web.react` | Primary typed React bindings with Mux UI-owned DOM, behavior, accessibility, styling-hook, and compatibility contracts. |
| `SCOPE-PLATFORM-NATIVE-RN` | `deferred` | `native.react-native` | Later N1 React Native renderer using native primitives and platform-appropriate bindings. |
| `SCOPE-PROFILE-IOS` | `deferred` | iOS | N1 validation profile, lifecycle/strategy, native evidence, and adaptations. |
| `SCOPE-PROFILE-ANDROID` | `deferred` | Android | N1 validation profile, lifecycle/strategy, native evidence, and adaptations. |
| `SCOPE-PROFILE-RNW` | `deferred` | React Native Web | N1 binding strategy/profile; never assumed equivalent to `web.react`. |
| `SCOPE-PLATFORM-FUTURE-WEB` | `deferred` | One additional web framework | Added only after demonstrated demand against stable web binding and styling contracts. |

When a later X1 candidate explicitly claims semantic parity, that claim means
shared intent, applicable states, tokens, and accessibility obligations. It
does not promise identical props, anatomy, transitions, events, focus
behavior, or implementation across platforms. No parity claim exists at R1.

## Component and public API scope

| Scope ID | Commitment | Public requirement |
| --- | --- | --- |
| `SCOPE-API-NAMING` | `committed` | One preferred public concept name and consistent semantic state/variant names; convenience aliases and stringly typed modes are exceptional. |
| `SCOPE-API-DEFAULTS` | `committed` | Defaults are finite, deterministic, and present in the binding spec, query response, generated types where applicable, and canonical executable examples. |
| `SCOPE-API-BINDING` | `committed` | Each binding owns its exact Mux UI props/attributes, events, slots/parts, defaults, behavior, deviations, validation profile, and example relations. |
| `SCOPE-API-COMPOSITION` | `committed` | Compound components expose explicit named parts, allowed parent/child relations, required labels/providers, and mutually exclusive structures without magical child inspection. |
| `SCOPE-API-WEB-HOOKS` | `committed` | Public web root classes, semantic slots, state attributes, events, custom properties, and cascade layers are enumerated; undocumented topology stays internal. |
| `SCOPE-API-REACT-ERGONOMICS` | `committed` | The `web.react` binding owns typed Mux UI composition, public ref semantics, controlled/uncontrolled observable state, and the public React contract. `@muxui/react` source owns host-type refinements, runtime state, effects, portals, and implementation while preserving those binding-owned semantics and styles. |
| `SCOPE-API-NATIVE-ERGONOMICS` | `deferred` | When N1 activates, native bindings may use platform-appropriate APIs and alternatives while preserving shared intent, tokens, applicable states, and accessibility obligations. |
| `SCOPE-API-PASSTHROUGH` | `committed` | Renderer host passthrough uses named supported profiles and hand-authored type refinements; it cannot introduce undocumented Mux UI semantics. |
| `SCOPE-API-ESCAPE-HATCH` | `committed` | Every styling, validation, suppression, or composition escape hatch is named, typed, bounded, documented, and excluded from canonical defaults. |
| `SCOPE-API-RUNTIME-OWNERSHIP` | `committed` | Controllers, adapters, providers, focus restoration, dismissal, portals, global listeners, inert/background state, and scroll locks have one explicit lifecycle owner. |
| `SCOPE-API-A11Y` | `committed` | Accessible naming, roles, states, values, relationships, keyboard/input behavior, announcements, and platform deviations are binding obligations with risk-proportionate proof. |
| `SCOPE-API-DEPRECATION` | `committed` | Supported published contracts name a replacement or explicit no-replacement reason, notice window, version effect, retained retrieval, diagnostic, and migration path. Current pre-release contracts remove superseded names and formats directly; no historical query version or notice release is required. |

Generated Mux UI-owned types may represent serializable binding fields. Renderer
source remains responsible for host-language inference, generic constraints,
refs, narrowed events, and platform-owned props, with conformance checks
preventing those refinements from becoming undocumented product API.

## Canonical knowledge scope

| Scope ID | Commitment | Kind | Initial product scope |
| --- | --- | --- | --- |
| `SCOPE-KIND-COMPONENT` | `committed` | `component` | Shared concept semantics plus explicit platform binding specs and runtime-profile dispositions. |
| `SCOPE-KIND-PATTERN` | `committed` | `pattern` | Bounded composition with roles, relations, parameters, constraints, examples, alternatives, pitfalls, and unsupported cases. First delivered, `experimental`, by BL1 under Decision 0026, with relations, invariants, and the parameter schema optional until G2.4. |
| `SCOPE-KIND-TOKEN` | `committed` | `token` | Addressable token sets and values with typed layers, modes, aliases, requirements, transforms, fallbacks, override policies, and optional source-crosswalk provenance owned by the canonical token source. |
| `SCOPE-KIND-FOUNDATION` | `committed` | `foundation` | Shared semantics, pure logic, and only evidence-backed optional portable interaction. |
| `SCOPE-KIND-GUIDE` | `committed` | `guide` | Portable Markdown guidance with strict identity/frontmatter and optional bounded decision context. |
| `SCOPE-KIND-EXAMPLE` | `committed` | `example` | Selection metadata plus exactly one executable source owner; normative/editorial impact is explicit. |
| `SCOPE-KIND-PITFALL` | `committed` | `pitfall` | Structured misuse, consequence, affected binding, and exact repair guidance. |
| `SCOPE-KIND-MIGRATION` | `deferred` | `migration` | Version-bounded migration knowledge activated only for a real supported change. |
| `SCOPE-KIND-CAPABILITY` | `committed` | `capability` | Exact surface availability, operation policy, schemas, and version context. |

All kinds share stable discovery and typed relations but retain dedicated
schemas and owners. A new kind requires an observed workflow that existing
records and relations cannot represent.

## Guidance and documentation scope

The package-only React prerelease uses generated tarball-local guidance. At
Productization, the CLI becomes the primary documentation API. Narrative
guides supplement structured records; they do not duplicate API, variant,
default, token, example, compatibility, or lifecycle facts.

| Scope ID | Commitment | Guidance family | Boundary |
| --- | --- | --- | --- |
| `SCOPE-GUIDE-DISCOVERY` | `committed` | Discovery and installed authority | Manifest-first workflow, exact local catalog resolution, output modes, follow-up commands, and advisory-hosted distinction. |
| `SCOPE-GUIDE-AUTHORING` | `committed` | Maintainer authoring | Canonical ownership, scaffolding, semantic diff, affected closure, revision explanations, generation, validation, and proof workflow. |
| `SCOPE-GUIDE-THEMING` | `committed` | Tokens and theming | Token layers, modes, transforms, requirements, fallbacks, override policy, static output, runtime switching, and accessibility adaptations. |
| `SCOPE-GUIDE-ACCESSIBILITY` | `committed` | Accessibility | Shared obligations, platform fulfillment, interaction risk classes, required evidence, and unsupported claims. |
| `SCOPE-GUIDE-COMPOSITION` | `committed` | Composition and patterns | Explicit parts/relations, canonical examples, bounded patterns, unsupported planning requests, and consumer boundaries. |
| `SCOPE-GUIDE-PLATFORMS` | `committed` | Multi-platform strategy | Semantic parity versus binding conformance, web/React ownership, native alternatives, and runtime-profile dispositions. |
| `SCOPE-GUIDE-LIFECYCLE` | `committed` | Lifecycle, compatibility, and releases | Lifecycle/strategy, revisions, SemVer effects, installed tuple, evidence status, advisories, exceptions, and deprecation. |
| `SCOPE-GUIDE-MIGRATION` | `deferred` | Migration | Published only when a real migration capability and version-bounded migration record exist. |

Every guide has one stable artifact ID, summary, keywords, platform scope,
lifecycle, relationships, and canonical source returned by CLI and rendered by
the site.

## Public package scope

| Scope ID | Commitment | Package | Public responsibility | Must not own |
| --- | --- | --- | --- | --- |
| `SCOPE-PKG-SCHEMA` | `committed` | `@muxui/schema` | Versioned source/response schemas, generated types, platform IDs, authoring helpers, token-source `sourceCrosswalk` grammar, and bounded sectional query shapes. | Product semantics, renderer implementation, or site content. |
| `SCOPE-PKG-TOKENS` | `committed` | `@muxui/tokens` | Canonical Mux UI-owned token data and deterministic web/native/design-tool transforms. | Component behavior, documentation rendering, or another live owner. |
| `SCOPE-PKG-FOUNDATION` | `committed` | `@muxui/foundation` | Enforced semantic, pure-logic, and optional portable-interaction boundaries. | Selectors, React hooks, browser globals, native views, or mandatory transitions. |
| `SCOPE-PKG-WEB` | `deferred` | `@muxui/web` | Later W1 HTML/CSS/controller implementation for `web.html` binding specs. | React or native implementation; a React prerequisite, shared React runtime, or shared React CSS owner. |
| `SCOPE-PKG-REACT` | `committed` | `@muxui/react` | Standalone React rendering, Mux UI-owned CSS, required third-party license/notice material, SSR/hydration, effects, exports, descriptors, and generated package guidance for `web.react` contracts. | Canonical component metadata, React Aria public API, another workspace runtime/build dependency, or a second style registry. |
| `SCOPE-PKG-REACT-NATIVE` | `deferred` | `@muxui/react-native` | Later N1 native primitive/runtime implementation and explicit platform files. | React/React Aria authority, CSS parsing, DOM, Expo, or explorer hosts. |
| `SCOPE-PKG-CATALOG` | `committed` | `@muxui/catalog` | Immutable compiled catalog, search index, pure discovery/query/planning API, canonical page-budget profiles/page selection, current-version validation, bounded token/crosswalk sections, and package-level catalog identity. | CLI parsing, MCP transport, renderer runtime, or project mutation. |
| `SCOPE-PKG-TOOLING` | `committed` | `@muxui/tooling` | CLI, adapters, installed catalog/version selection, explicit query-version forwarding, response rendering, local validation, maintainer authoring, change-intent previews, and enabled safe operations. | A second artifact index, product/query-response decisions, page-boundary selection, or renderer implementation. |

At R1, only `@muxui/react` is publishable; schema, tokens, foundation,
catalog, and tooling remain private build/proof authorities and are not runtime
edges. Productization later publishes the compatible portfolio. Renderer
packages do not depend on the catalog at runtime.

## Product surfaces and command scope

### Query and documentation surfaces

| Scope ID | Commitment | Surface | Earliest boundary | Product contract |
| --- | --- | --- | --- | --- |
| `SCOPE-SURFACE-API` | `committed` | Programmatic catalog API | Foundation | Pure manifest/list/search/get with bounded current-version sections and explicit rejection of unsupported versions; historical negotiation is added only for supported published contracts that need it. Planning is available only when enabled. |
| `SCOPE-SURFACE-CLI` | `committed` | CLI human/JSON/dense | Foundation | Primary documentation interface over the same bounded, versioned response object. |
| `SCOPE-SURFACE-SITE` | `committed` | Documentation site | Productization | Catalog client rendering canonical records and guide sources. |
| `SCOPE-SURFACE-EXPLORER-WEB` | `committed` | Web/React explorer | Productization | Generated adapters over canonical executable examples. |
| `SCOPE-SURFACE-EXPLORER-NATIVE` | `deferred` | Native explorer host | Native Productization after N1 | Expo/native host used outside runtime packages. |
| `SCOPE-SURFACE-BOOTSTRAP` | `committed` | Small static agent context | Productization | Route map and discovery loop, never a manually maintained catalog dump. |
| `SCOPE-SURFACE-MCP-LOCAL` | `committed` | Installed local MCP | Productization | Search/get and only enabled read-only capabilities over the shared query engine. |
| `SCOPE-SURFACE-MCP-HOSTED` | `deferred` | Hosted MCP | Capability release | Read-only advisory/target-tuple-aware discovery with failure isolation. |

### Command availability

| Scope ID | Commitment | Command | Earliest boundary | Availability rule |
| --- | --- | --- | --- | --- |
| `SCOPE-CMD-MANIFEST` | `committed` | `muxui manifest` | Foundation | Cold-start capability, schema, grammar, platform, output, and version discovery. |
| `SCOPE-CMD-LIST` | `committed` | `muxui list` | Foundation | Bounded deterministic artifact listing. |
| `SCOPE-CMD-SEARCH` | `committed` | `muxui search` | Foundation | Deterministic explainable local search with match reasons. |
| `SCOPE-CMD-GET` | `committed` | `muxui get` | Foundation | Exact artifact/binding/example/guidance retrieval with compatibility provenance plus bounded `tokens` / `source-crosswalk` sections and deterministic continuation. |
| `SCOPE-CMD-VALIDATE-SOURCE` | `committed` | `muxui validate` | `0.1` | Mux UI-owned catalog/example validation first. |
| `SCOPE-CMD-VALIDATE-CONSUMER` | `committed` | `muxui validate` | Productization | Bounded supported consumer syntax/version analysis with false-positive policy. |
| `SCOPE-CMD-PLAN` | `admitted` | `muxui plan` | Productization | Read-only grounded composition over proved patterns; unavailable until G2.4. |
| `SCOPE-CMD-DOCTOR` | `admitted` | `muxui doctor` | Productization | Read-only project health before any setup operation; unavailable until G2.5. |
| `SCOPE-CMD-INIT` | `admitted` | `muxui init` | Productization | Previewed, confirmed, confined, atomic/journalled, idempotent, recoverable setup. |
| `SCOPE-CMD-MIGRATE` | `deferred` | `muxui migrate` | Capability release | Enabled only for a real version-bounded deterministic migration need. |

Every enabled query supports the applicable platform, detail, section,
example-purpose, limit, and cursor selectors. JSON writes one value to stdout;
diagnostics and progress use stderr. Dense output is deterministic,
section-selectable, token-budgeted, and round-trippable to the response object.

Token-source retrieval currently supports query API `2.1.0` only. Full and
compact token summaries expose counts, digests, provenance, and available-section
metadata; complete populations use bounded `tokens` and `source-crosswalk`
sections. `@muxui/schema` owns the current request/response and
`TokenSectionPageBudgetProfile` grammar. `@muxui/catalog` owns current response
semantics, canonical profile values, and page selection. Tooling selects a
compatible installed catalog, forwards explicit version intent, renders its
response, and rejects unsupported versions without reinterpretation. An omitted
authored crosswalk returns typed `absent`. Historical v1.1/v1.2 inline responses,
notice diagnostics, and old-format migrators are not pre-release product
requirements. The profile fixes the query API and lexer versions, canonical
entry-cost/order rule, normalized worst-case envelope preimage/reserve,
default/max limits, minimum progress, 2,048-token dense-page budget, and
`MUXUI_QUERY_PAGE_ENTRY_TOO_LARGE`. Its canonical JSON enters the catalog
digest, adding no revision axis. Each v2 page uses canonical ordering and a
cursor bound to query version, that catalog digest, token-source revision,
section, selector state, and position. `limit` is an item ceiling; the catalog
emits the greatest non-empty fitting prefix and rejects a single oversize entry
without truncation.

## Token and theme scope

| Scope ID | Commitment | Deliverable | Boundary |
| --- | --- | --- | --- |
| `SCOPE-THEME-DEFAULT` | `committed` | First-party brand-agnostic default theme whose Mux UI-owned reference baseline, palette values, font families, and typography roles define the current theme contract | `0.1` and R1.6 parity closure |
| `SCOPE-TOKEN-LAYERS` | `committed` | Reference, semantic, and component token layers with acyclic allowed alias direction | `0.1` |
| `SCOPE-TOKEN-MODES` | `committed` | Applicable typed color-scheme, contrast, motion, density, and direction axes | `0.1` |
| `SCOPE-TOKEN-TRANSFORMS` | `committed` | Static React CSS output at R1; native theme-object transforms remain retained historical/later N1 input and become current only when N1 activates | R1 now; N1 later |
| `SCOPE-TOKEN-REQUIREMENTS` | `committed` | Binding-specific required/optional/deprecated token requirement sets and digests | `0.1` |
| `SCOPE-TOKEN-FALLBACKS` | `committed` | Explicit typed fallback value/token policy with profile proof and structured diagnostics | `0.1` |
| `SCOPE-TOKEN-OVERRIDES` | `committed` | `fixed`, `theme`, and `instance` override policies with consumer-theme validation | `0.1` |
| `SCOPE-THEME-ACCESSIBILITY` | `committed` | Observable forced-colors/high-contrast React behavior at R1; native dynamic-color/accessibility mappings activate and are independently fulfilled/evidenced only at N1. Owning bindings satisfy `SCOPE-THEME-PLATFORM-SAFETY`; this item does not own requirement identity or the non-disable rule. | R1 now; N1 later |
| `SCOPE-THEME-RUNTIME` | `admitted` | Runtime theme switching per explicitly supported/proved profile; complete static output remains mandatory | Productization or capability release |
| `SCOPE-THEME-ADDITIONAL` | `admitted` | Additional first-party themes and local consumer theme editing through the private Mux UI theme-authoring capability | R1.6 private authoring proof; public or hosted release remains separately admitted |
| `SCOPE-DESIGN-TOOL` | `admitted` | One named external design-tool interchange profile and proposal-only round-trip; Figma is named, and its export-only token slice (Decision 0020) and simple-control component slice (amendment 01) are available early | Import and round-trip through G3.5; the early exports are private projections from `@muxui/tokens` and `@muxui/figma` with no release claim; they do not own the private theme-authoring capability |

CSS-derived values never become native authority. Consumer themes can assign
only permitted existing roles and cannot change Mux UI token identity, type,
meaning, required modes, or canonical alias topology.

Mux UI's canonical token source owns token IDs, types, meanings, modes,
aliases, override policies, and the first-party default theme. Public token
descriptions explain the current role and permitted use of each token. They do
not require an external source import, checkout, or historical provenance
record.

Reference tokens hold raw design values and may not be consumed by components.
Semantic tokens assign product-independent roles; component tokens narrow those
roles only when a component needs a stable customization point. The alias graph
is acyclic and target transforms emit only admitted Mux UI token facts. CSS and
native theme objects remain derived outputs; native never parses CSS.

Token and theme data are available through the current versioned catalog and
query sections. Compatibility metadata binds responses to the selected
catalog and token-source revisions, while generated guidance remains a
projection of the canonical source. Removing or incompatibly changing a
public token requires the normal schema, compatibility, release, and
consumer-guidance effects for that contract.

## Maintainer and agent-safe authoring scope

### Maintainer baseline

| Scope ID | Commitment | Capability | Boundary |
| --- | --- | --- | --- |
| `SCOPE-AUTHOR-SCAFFOLD` | `committed` | Schema-aware canonical scaffold that never invents product decisions or writes projections | Foundation |
| `SCOPE-AUTHOR-DIAGNOSTICS` | `committed` | Source-linked stable rule IDs naming the earliest editable owner | Foundation |
| `SCOPE-AUTHOR-DIFF` | `committed` | Semantic diff distinguishing editorial, compatible, and incompatible change | Foundation |
| `SCOPE-AUTHOR-REVISION` | `committed` | Revision explainer for content, binding-spec, token requirement, and release digest inputs | Foundation |
| `SCOPE-AUTHOR-CLOSURE` | `committed` | Affected closure over canonical sources, renderers, projections, proof, packages, and evaluations | `0.1` |
| `SCOPE-AUTHOR-CHANGE-INTENT` | `committed` | Read-only `ChangeIntentEnvelope` with base, objective, write set, invalidation, version/proof effects, readiness, and confirmation policy | `0.1` |
| `SCOPE-AUTHOR-AUTOFIX` | `committed` | Preview-only semantics-preserving mechanical autofixes | Foundation |


### Initial allowlisted canonical proposals

The following are admitted for G2.6. They are not available until their closed
schemas, review packets, negative boundaries, digest-bound approval, apply,
recovery, and evidence pass.

| Scope ID | Commitment | Operation | Canonical owner |
| --- | --- | --- | --- |
| `SCOPE-PROPOSAL-EXAMPLE` | `admitted` | `example.create` | Example record/source and binding relation |
| `SCOPE-PROPOSAL-VARIANT` | `admitted` | `binding.variant.add` | Binding spec |
| `SCOPE-PROPOSAL-DEPRECATE` | `admitted` | `binding.prop.deprecate` | Binding lifecycle/migration data |
| `SCOPE-PROPOSAL-TOKEN-ALIAS` | `admitted` | `token.alias.propose` | Canonical token source |

Free-form patch requests, model-authored product decisions, automatic stable
promotion, automatic exception creation, write-set expansion, and unconfirmed
apply are rejected. Renderer implementation work can be identified by a
proposal but is not proved merely because canonical changes were approved.

## Compatibility, quality, and trust scope

### Committed proof layers

| Scope ID | Commitment | Proof area | Product claim |
| --- | --- | --- | --- |
| `SCOPE-PROOF-SCHEMA` | `committed` | Schema and relations | Records are closed, versioned, uniquely identified, owned, and relationally complete. |
| `SCOPE-PROOF-CONFORMANCE` | `committed` | Spec/code/export/token conformance | Generated types, renderer refinements, exports, CSS hooks, examples, and declarations match canonical specs. |
| `SCOPE-PROOF-BEHAVIOR` | `committed` | Unit, state, browser, and native behavior | Implementations satisfy binding transitions, runtime ownership, SSR/hydration, input, focus, and platform behavior. |
| `SCOPE-PROOF-A11Y` | `committed` | Accessibility | Automated and risk-proportionate retained manual evidence supports every stable interaction/profile claim. |
| `SCOPE-PROOF-VISUAL` | `committed` | Visual | Canonical examples are checked across applicable themes, modes, density, direction, and platforms; R1.6 additionally proves the complete applicable React Aria inventory, matched light/dark visual/interaction fixtures, and every intentional visual adaptation. |
| `SCOPE-PROOF-PACKAGE` | `committed` | Packed consumers | Published artifacts resolve declared exports, types, styles, assets, descriptors, and engines. |
| `SCOPE-PROOF-PARITY` | `committed` | Surface parity | API, CLI, dense, MCP, site, explorer, and static projections agree where enabled. |
| `SCOPE-PROOF-GENERATION` | `committed` | Generation identity | Clean repeated builds produce the same catalog and release digests. |
| `SCOPE-PROOF-AGENT-INFO` | `committed` | Informational agent evaluations | Cold-start and generation evidence begins with Gate 1 and remains subordinate to deterministic proof. |
| `SCOPE-PROOF-AGENT-GATE` | `admitted` | Release-gating agent evaluations | Only selected metrics with repeated baselines, fixed thresholds, variance policy, and failure ownership can graduate through G3.4. |

### Cross-cutting product commitments

These requirements are mandatory even where the roadmap currently expresses
them only through a global cadence or an implicit assertion. They require exact
roadmap evidence ownership before the affected milestone becomes `ready`.

| Scope ID | Commitment | Requirement | Earliest proof boundary |
| --- | --- | --- | --- |
| `SCOPE-QUALITY-COMPAT-PROFILE` | `committed` | At R1, one versioned React compatibility/evidence artifact covers exact browser, React, assistive-technology, input, locale, direction, zoom, contrast, and motion claims. React Native, OS, and device profiles are added independently only when N1 activates. | R1 claims now; N1 profiles later; complete for each stable boundary |
| `SCOPE-QUALITY-GENERATOR-CONTRACT` | `committed` | Every generator supports `--check`, stable ordering, no wall-clock canonical-preimage fields, and owner-linked drift diagnostics. | Foundation and every later generator activation |
| `SCOPE-QUALITY-PERFORMANCE` | `committed` | Versioned performance policy, representative renderer/query/package baselines, predeclared regression budgets, and scheduled retained evidence. | Baseline by `0.1`; stable policy before stable productization |
| `SCOPE-TRUST-CACHE-PROVENANCE` | `committed` | Explicitly downloaded catalogs are content-addressed, signature or provenance verified, digest-isolated, and rejected when verification fails. | Foundation synthetic proof; real packed proof at productization |
| `SCOPE-TRUST-EVIDENCE-PRIVACY` | `committed` | Consumer code, prompts, screens, and traces are not collected by default; capture requires explicit scope, consent, redaction, disclosure class, and retention policy. | Before any evidence or evaluation capture involving consumer context |
| `SCOPE-THEME-PLATFORM-SAFETY` | `committed` | The architecture-owned closed registry owns requirement identity and meaning; binding-authored declarations own exact profile applicability and the consumer non-disable disposition for forced-colors, system high-contrast, dynamic native color, font metrics, direction, and applicable accessibility adaptations. Token sources own only token facts; renderer bindings own realization and evidence through `SCOPE-THEME-ACCESSIBILITY`. | `0.1` per supported profile |

### Evidence and release trust

| Scope ID | Commitment | Deliverable |
| --- | --- | --- |
| `SCOPE-TRUST-EVIDENCE` | `committed` | Immutable evidence records tied to exact source, artifact, binding, package, catalog, environment, input, result, retention, and owner identity. |
| `SCOPE-TRUST-DISCLOSURE` | `committed` | Public reproducibility, internal CI, restricted audit, and transient disclosure classes with sanitized public metadata. |
| `SCOPE-TRUST-ADVISORY` | `committed` | Signed append-only evidence advisories for supersession or withdrawal without rewriting historical evidence. |
| `SCOPE-TRUST-EXCEPTION` | `committed` | Scoped, approved, expiring operational exceptions that only narrow claims or defer explicitly waivable obligations. |
| `SCOPE-TRUST-RELEASE` | `committed` | Immutable release manifest correlating package, catalog, schema, token, query, binding, evidence, provenance, profile, and active-exception identity. |
| `SCOPE-TRUST-HISTORY` | `committed` | Supported published catalogs, binding specs, migrations, evidence, advisories, and release identities remain retrievable for their supported windows. Pre-release evidence remains immutable without requiring active readers for superseded product formats. |

No exception may patch a projection, broaden support, bypass integrity, create
proof, suppress mandatory accessibility/safety evidence, or authorize an
unconfirmed mutation.

## Conditional capability portfolio

Gate 3 is not a monolithic commitment. Each scope item remains unavailable
until its activation conditions and evidence pass. An item can close with an
explicit no-activation decision without making Mux UI incomplete.

| Scope ID | State | Capability | Activation trigger | Roadmap |
| --- | --- | --- | --- | --- |
| `SCOPE-CAP-BREADTH` | `admitted` | Deliberate component and pattern breadth | Gate 2 plus Tabs/Toast for comparable risk; every candidate has observed workflow demand, owner, platform disposition, risk class, and proof path. Blocks inside the Decision 0026 boundary are ordinary protected-PR delivery under BL1 and do not use this trigger. All other component and pattern breadth keeps it. | G3.1 |
| `SCOPE-CAP-MIGRATION` | `deferred` | Declarative migrations and reviewed codemods | A real version-bounded supported migration need with retrievable old/new specs and bounded transformation. | G3.2 |
| `SCOPE-CAP-MCP-HOSTED` | `deferred` | Read-only hosted MCP | Stable query/compatibility policy plus privacy, security, availability, cache isolation, and failure separation. | G3.3 |
| `SCOPE-CAP-AGENT-GATES` | `admitted` | Promote selected agent evaluations | Repeated baseline, predeclared threshold/variance/retry policy, canonical prompt IDs, and a failure owner. | G3.4 |
| `SCOPE-CAP-DESIGN-TOOL` | `admitted` | One named external design-tool interchange | Stable identities across a real release, observed workflow, export proof, loss policy, and proposal-only imports. Decision 0020 and its amendment 01 land Figma token and component export-only slices early without satisfying this trigger. Additional themes are governed by `SCOPE-CAP-THEME-AUTHORING-PRIVATE`. | G3.5 (export slices: Decision 0020 and amendment 01) |
| `SCOPE-CAP-THEME-AUTHORING-PRIVATE` | `admitted` | Private `apps/scale` maintainer capability for adding, editing, previewing, importing, exporting, persisting, and round-tripping Mux UI themes | Canonical token/theme ownership, typed override safety, complete theme parity proof, and a disable path that leaves canonical sources authoritative. | R1.6 |
| `SCOPE-CAP-TAILWIND-CONSUMER` | `admitted` | Optional Tailwind consumer build adapter generated from Mux UI-owned token/theme transforms | Actual consumer compilation proof; Tailwind is a consumer build dependency only and never a Mux UI runtime, peer, or styling-engine dependency. | R1.6 |
| `SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE` | `admitted` | Private Blocks showcase: the first `pattern` records with executable variants, for bounded application compositions and bounded marketing page sections, and a Blocks section in the private docs app | R1 exit complete and Decision 0026 merged. React only, copy and paste only, unpublished. Page templates, journeys, and flows stay excluded. Public deployment, install or registry commands, `plan`, and non-React blocks are separate admissions. | BL1 |
| `SCOPE-CAP-PROMPT-SEMANTICS` | `admitted` | Promptable-semantics discovery | Privacy-safe task corpus and baseline over existing tokens, variants, patterns, decision context, and examples. Activation of any field remains separately admitted. | G3.6 |
| `SCOPE-CAP-EXTENSIONS` | `deferred` | Extension or consumer-overlay trust model | Observed demand plus threat model, namespace, integrity, permission, confinement, timeout, revocation, and compatibility proof. | G3.7 |
| `SCOPE-CAP-HIGHER-ORDER` | `deferred` | Page, flow, journey, or other higher-order artifact kind | Repeated unsupported design-system-owned workflows prove patterns/guides insufficient and full ontology admission passes. | G3.8 |
| `SCOPE-CAP-FRAMEWORK` | `deferred` | One additional framework binding | Demonstrated demand and conformance to stable web HTML/CSS/controller contracts. | G3.9 |
| `SCOPE-CAP-A2UI` | `deferred` | Agent-to-UI protocol binding | Named protocol/workflow and proof that it remains an optional compatibility-aware adapter. | G3.10 |
| `SCOPE-CAP-CONSUMER-PATTERN` | `deferred` | Consumer pattern validation and pattern-derived scaffolds | Stable planner, observed demand, maintained parser/version boundaries, precision/recall budget, and safe write preview. | G3.11 |

### Component and pattern breadth admission

The Scale application is a private Mux UI projection for the existing
additional-theme/design-tool capability, not an R1 deliverable or dependency.
Reuse requires a later admission that names the Mux UI theme schema,
public surface, package/application boundary, import/export loss policy,
consumer validation, accessibility, privacy, security, lifecycle, and release
evidence. R1 may preserve compatible static theme outputs but does not port or
publish Scale.

`SCOPE-CAP-BREADTH` remains the later cross-platform breadth capability and
does not commit an unnamed inventory. React-primary breadth is instead owned by
`SCOPE-REACT-BREADTH-001`: the fixed family table names the exact upstream
snapshot items, Mux UI IDs, and dispositions. No per-family Product Scope
amendment is required inside that committed inventory. Each family record has:

- the user workflow and unmet intent;
- component versus pattern ownership;
- platform target/disposition matrix;
- interaction risk class and evidence requirements;
- canonical example and pitfall needs;
- required token/foundation/runtime changes;
- package, compatibility, query, and migration effects;
- expected effect on discovery precision, dense budgets, package policy,
  maintainer throughput, and agent generation; and
- explicit non-goals.

Raw component count is never a scope objective.

## Roadmap alignment and reconciliation

| Product-scope family | Roadmap realization |
| --- | --- |
| Foundation, canonical knowledge, CLI baseline, local resolver, and maintainer authoring | G0.0–G0.5 and the Gate 0 integration exit |
| React package/substrate baseline and React component tranches | R1.0–R1.5; historical G1.0–G1.2 facts require exact reusable-proof binding |
| React package-only prerelease publication | R1 tranche exits and R1 exit |
| Public catalog/tooling packages, descriptors, CLI, compatibility, releases, and historical catalogs for React | P2.1 |
| React consumer installation, local authority, and bounded validation | P2.2 |
| React site, explorer, static bootstrap, guides, and public installed-local MCP | P2.3 |
| Private Blocks showcase over pattern records | BL1, independent of P2.1 through P2.3 and satisfying none of their evidence |
| Framework-free web and native products | W1 and N1 only after separate activation |
| Cross-platform comparison/equivalence and stable React promotion | X1 and S1 only after separate activation |
| Grounded composition planning | G2.4 when enabled |
| Project health and initialization | G2.5 when enabled |
| Allowlisted canonical proposals | G2.6 when enabled |
| Productization release and capability honesty | P2 exit |
| Conditional breadth, migration, hosted MCP, model-evaluation gates, themes/design-tool interchange, promptable semantics, extensions, higher-order artifacts, frameworks, agent-to-UI, and consumer-pattern tooling | G3.1–G3.11 independently |

Before the affected milestone becomes `ready`, the roadmap must assign explicit
deliverables and evidence IDs to these architecture-derived product
commitments that are currently expressed mainly through global or implicit
rules:

| Scope item | Required roadmap placement |
| --- | --- |
| Compatibility/evidence profile (`SCOPE-QUALITY-COMPAT-PROFILE`) | R1.5 creates the tested React profile; R1 exit binds the prerelease artifact; P2.1/P2 exit publish and enforce the Productization profile. |
| Generator contract (`SCOPE-QUALITY-GENERATOR-CONTRACT`) | G0.0/G0.2 establish the contract; every later generator-owning milestone inherits a release-blocking fixture. |
| Performance policy (`SCOPE-QUALITY-PERFORMANCE`) | R1.5 captures representative React baselines; P2 exit owns the Productization policy; later breadth guards its own regressions. |
| Cached-catalog provenance (`SCOPE-TRUST-CACHE-PROVENANCE`) | G0.4 proves synthetic verification and rejection; P2.1/P2.2 prove real packed/cached catalogs. |
| Evidence-capture privacy (`SCOPE-TRUST-EVIDENCE-PRIVACY`) | R1 evidence policy and every later evaluation/integration capture milestone enforce default-off collection and consent/redaction. |
| Platform theme-safety contract (`SCOPE-THEME-PLATFORM-SAFETY`) | Historical G1.0 defines the closed requirement identities. R1.0 explicitly rebinds reusable React facts, and R1.5 verifies the complete React profile view. Later W1/N1 profiles prove their own applicability; G3.5 extends the rule to additional themes. |
| Platform theme-accessibility behavior (`SCOPE-THEME-ACCESSIBILITY`) | Historical G1.1/G1.2 proof remains audit input. R1.0 and each React tranche prove applicable forced-colors, high-contrast, font-metric and direction obligations; later native profiles prove native dynamic-color and accessibility mappings independently. |

No tracker issue can substitute for this roadmap reconciliation because the
roadmap, not the tracker, owns milestone proof.

## Success measures

Threshold values live in versioned evidence or release policy and are fixed
before the relevant candidate is measured. This document owns the measures,
not mutable numeric values.

### Product and renderer measures

| Scope ID | Measure |
| --- | --- |
| `SCOPE-METRIC-001` | Required target-matrix implementation and evidence coverage by binding and runtime profile. |
| `SCOPE-METRIC-002` | Packed consumer install, export, type, style, asset, engine, descriptor, and offline-resolution success. |
| `SCOPE-METRIC-003` | Behavior, accessibility, visual, and performance regression results by interaction risk and supported profile. |
| `SCOPE-METRIC-004` | Canonical-to-projection parity and clean regeneration identity. |
| `SCOPE-METRIC-005` | Maintainer scaffold-to-valid-source success, diagnostic repair success, affected-closure completeness, and zero direct projection fixes. |
| `SCOPE-METRIC-006` | Component/pattern usefulness and supported-workflow coverage rather than raw inventory count. |

### Agent-operability measures

| Scope ID | Measure |
| --- | --- |
| `SCOPE-METRIC-AGENT-001` | Manifest discovery success. |
| `SCOPE-METRIC-AGENT-002` | Artifact-selection precision and recall. |
| `SCOPE-METRIC-AGENT-003` | Wrong-prop and invented-prop rate. |
| `SCOPE-METRIC-AGENT-004` | Invalid-composition rate. |
| `SCOPE-METRIC-AGENT-005` | Compile and validation pass rate. |
| `SCOPE-METRIC-AGENT-006` | Accessibility-obligation pass rate. |
| `SCOPE-METRIC-AGENT-007` | Repair success after one structured diagnostic. |
| `SCOPE-METRIC-AGENT-008` | Context tokens used per successful task. |
| `SCOPE-METRIC-AGENT-009` | Stability across repeated runs and model families. |

Model metrics cannot override deterministic schema, type, behavior,
accessibility, package, compatibility, integrity, or generation failures.

## Release acceptance scope

### React `0.1` is product-complete only when

- the exact pinned React Aria Components surface is disposition-complete and
  every applicable item maps to a delivered Mux UI component or an accepted
  `defer`, `exclude`, or `not-a-component` disposition;
- every exported `web.react` binding has one Mux UI-owned canonical component,
  binding contract, implementation, CSS, canonical example, descriptor,
  generated package guidance, and risk-proportionate proof closure;
- every exported binding has Mux UI-owned CSS, a canonical token/style contract,
  and visual comparison; unsupported styling or behavior remains unexported
  until a bounded Mux UI decision resolves it;
- the standalone `@muxui/react` tarball has exact React/React DOM peers,
  `react-aria-components@1.20.0`, and the approved direct internal
  `@internationalized/date@3.12.4` dependency (Decision 0011 amendment 05)
  limited to Mux UI value adapters
  in `DateField`, `DatePicker`, `DateRangePicker`, `TimeField`, `Calendar`, and
  `RangeCalendar`; the approved direct internal, replaceable
  `lucide-react@1.37.0` dependency (npm integrity
  `sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==`,
  ISC license with its Feather-derived MIT notice, React peer-compatible with
  the existing React and React DOM peer boundary) as the default icon source
  for decorative affordances in every `@muxui/react` component, with no
  per-component approval (Decision 0011 amendment 06), decorative and
  non-focusable icons that never supply an undocumented accessible name, and
  no Lucide export, type, name, prop, import path, or public Icon API, catalog,
  or package; plus the R1.6 internal, replaceable edges
  `react-aria@3.51.0` for `Resizable` and Decision 0018's `SelectNative`, `marked@13.0.3` for the typed Markdown
  parser boundary, and the eight `@tiptap/*@3.31.4` packages for `TextEditor`
  (Decision 0011 amendment 04);
  `motion@13.4.0` for bounded component motion in existing admitted React
  bindings; exact `shiki@4.5.0` only for CodeBlock client highlighting under
  Decision 0024 amendment 01; no Mux UI workspace runtime edge or dependency public API/type
  leak is permitted;
- the first-party default token/theme system satisfies every applicable React
  requirement and accessibility adaptation;
- package exports, types, CSS, guidance, descriptors, compatibility metadata,
  and release manifest agree on exact revisions;
- packed artifacts, not source-tree assumptions, prove exports and
  compatibility;
- required manual/assistive-technology evidence exists before export for every
  React binding whose exact risk contract requires it, except that the rc
  prerelease on `next` may export bindings whose evidence is unmet, as the
  Decision 0022 prerelease amendment records for R1.1 through R1.4, with
  assistive-technology support unproved and not claimed; that evidence is a
  required `S1.0` entry condition;
- R1.1 through R1.5's logged check evidence is captured into retained
  evidence before the rc.1 cut and before those logs expire around
  2026-11-23, because a transient log cannot satisfy an exit (Decision 0022);
  their review evidence is the retained retroactive review of R1.2 through
  R1.4, with every finding resolved, and author-reported review for R1.1 and
  R1.5, which is not proof; accepting that unretained author claim for R1.1
  and R1.5 is Andrew's accepted exception to the transient-log rule for those
  two milestones (Decision 0022 amendment 01);
- the compatibility/evidence profile states the exact tested environment;
- generator, privacy, provenance, exception, advisory, performance-baseline,
  and change-intent requirements pass; and
- the same release manifest correlates all package, source-catalog, binding,
  token/CSS, evidence, profile, provenance, exception, registry, and rollback
  identity.

Framework-free web, React Native, React Native Web, cross-platform equivalence,
public catalog/tooling/CLI, Productization, stable lifecycle, and `latest` are
not required and cannot be inferred from React `0.1` completion.

### Productization is product-complete only when

- public packages install from packed artifacts and their descriptors match
  actual exports and canonical revisions;
- a clean supported consumer resolves exact local guidance offline against its
  installed tuple;
- supported consumer validation is syntax/version bounded and meets its
  declared false-positive policy;
- the docs site, explorers, bootstrap files, public local MCP, API, and CLI use
  the same enabled catalog/query sources;
- historical catalogs and compatibility negotiation answer for supported
  installed versions;
- every enabled prerelease and support claim has current risk/profile evidence,
  performance policy, compatibility review, retention, privacy, provenance,
  and no expired exception; stable-support evidence and promotion remain
  exclusively S1 work;
- disabled optional capabilities are absent or explicitly unavailable;
- every enabled plan, doctor, init, or canonical proposal operation passes its
  own manifest, confirmation, confinement, idempotency, and recovery rules; and
- release rollback restores the prior verifiable tuple without rewriting
  historical records.

### A conditional capability is product-complete only when

- its observed workflow and owner pass scope admission;
- it declares its public surface, versioning, compatibility, lifecycle,
  security/privacy, evidence, and migration effects;
- positive and negative fixtures prove its bounded protocol;
- it is represented honestly in capability manifests and documentation;
- it has rollback or disable behavior that leaves canonical truth intact; and
- disabling or rejecting it does not block an earlier renderer or release
  boundary.

## Product-scope change control

### Scope-version effects

| Change | `scopeVersion` effect |
| --- | --- |
| Clarification that changes no scope ID, commitment, boundary, or meaning | Patch |
| Add or revise a `candidate`, `admitted`, or `deferred` item without changing a committed release | Minor |
| Add, remove, replace, or materially redefine a committed outcome, platform, release boundary, package, public surface, or non-goal | Major |

Changing a tracker status, assignee, priority, iteration, or target date never
changes `scopeVersion`.

A product-scope change is required when a proposal would:

- add, remove, split, or replace a committed scope item;
- change a release boundary or platform commitment;
- add an artifact kind, durable relation, package, public command, adapter, or
  operation type;
- broaden support or compatibility;
- move a deferred capability into admitted or committed scope;
- change an explicit non-goal; or
- claim a new form of product completeness.

Every change must include:

1. observed user workflow and product outcome;
2. affected scope IDs and commitment transitions;
3. architecture compatibility;
4. roadmap milestone/evidence coverage or required roadmap amendment;
5. platform, package, version, migration, authoring, proof, privacy, security,
   and rollback effects;
6. explicit additions and removals from release scope; and
7. tracker migration for open work without rewriting completed evidence.

An adjacent implementation detail that does not alter product outcome,
platform support, public surface, ownership, compatibility, or proof remains a
tracker decision and does not require this document to change.

### Retired pre-8.0 scope amendments

The pre-8.0 scope-amendment records were migration and delivery-history
artifacts. Their exact bytes are preserved only in the ignored preflight archive;
they are not current product authority. Current commitments, immutable Scope IDs,
release boundaries, and non-goals are defined by the current baseline above and
the active roadmap. No historical record is rewritten or reinterpreted as a
current product outcome. Decision 0021 applies the same archive to the 6.0.0,
6.0.3, and 6.0.4 sections; their exact bytes are in
`.migration-archive/20261003-decision-0021/`.

## Tracker reference contract

Every implementation issue must reference:

```text
Scope ID(s):
Roadmap milestone:
Architecture requirements:
Evidence ID(s):
Dependencies:
Deliverables:
Acceptance commands:
Explicit non-goals:
Pull request or change record:
```

The tracker owns assignee, priority, workflow status, iteration, target date,
blockers, and pull-request linkage. This document owns product commitment. The
roadmap owns milestone completion and evidence. None may copy another's live
state as an independently editable field.

## Product-scope integrity checklist

This product scope remains valid only while:

- every `committed` item has a named roadmap realization and evidence path;
- every `admitted` or `deferred` item remains unavailable until its own trigger
  passes;
- every public surface reports capability availability honestly;
- the React `0.1` tranche and release boundaries remain unchanged unless
  Product Scope and Architecture are explicitly revised;
- future component breadth receives stable scope IDs before implementation;
- platform divergence is expressed through binding strategy and evidence rather
  than hidden substitutions;
- product scope does not duplicate live tracker status;
- optional capability failure cannot block an earlier renderer milestone;
- no item introduces a second owner or generated-source repair path; and
- all product claims remain subordinate to canonical identity, installed-local
  authority, deterministic proof, accessibility, compatibility, privacy, and
  explicit mutation approval.

If any statement becomes false, stop the affected scope item, retain the
failure evidence, and correct the earliest authoritative document or source.
## Product Scope 8.0.0: React parity and private Mux theme authoring

Product Scope `8.0.0` records the bounded prepublication React parity and
private theme-authoring expansion. The major effect is that complete applicable
React Aria parity and private theme-authoring proof precede publication
eligibility. It also admits additional first-party themes and local consumer
theme editing, adds an optional Tailwind consumer adapter, and establishes
explicit ownership and release boundaries. This is not a claim that
implementation or parity evidence has already passed.

### Current commitments and boundaries

`SCOPE-THEME-ADDITIONAL` admits additional first-party themes and local
consumer editing, while `SCOPE-THEME-RUNTIME` activates only where a profile
is explicitly proved. `SCOPE-CAP-THEME-AUTHORING-PRIVATE` and
`SCOPE-CAP-TAILWIND-CONSUMER` remain admitted capabilities under the
conditional capability table. `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` records
the immutable supplemental mapping scope; it does not create a duplicate
registry or an availability claim.

The exact supplemental root list is: `alert-dialog`, `button-group`,
`card`, `checkbox-field`, `color-mode-toggle`, `command-palette`,
`header-nav`, `input-tags`, `input`, `multi-select`, `payment-input`,
`progress-circle`, `radio-field`, `sidebar`, `switch-field`,
`tag-select`, `text-area`, `text-editor`, `resizable`, `lightbox`, and
`markdown`. `Resizable` uses `react-aria/useMove`; `Lightbox` and
`Markdown` are indirect React Aria-backed roots. `Drawer` and
`FileUpload` are standalone vanilla controls outside this supplemental
React Aria scope, while `RadioGroup` and `ToggleGroup` are covered by
existing mappings. These 21 roots are mapping targets, not current exports or
availability claims until R1.6 proof passes.

R1.6 is required between R1.5 and R1 exit. Its evidence owner must classify
the applicable React Aria-backed roots and support styles, record explicit
exclusions for unrelated marketing/layout roots, and maintain the exact
supplemental list for any applicable family outside the fixed 53-family
release floor. There is no blanket standalone API/export requirement, no
absent-state pass, and no non-Aria component admission.

R1.6 owns complete Mux-namespaced token/theme data, palette and typography
roles, matched light/dark CSS/anatomy/interaction/variant/state fixtures,
canonical-token Storybook examples, private Scale load/edit/preview/import/
export/persist/round-trip behavior, and clean-consumer proof for the optional
Tailwind build adapter. Mux UI owns token role names, values, and definitions;
bundled third-party assets retain their applicable license notices.

The existing internal `lucide-react@1.37.0` edge covers decorative
affordances in every R1.6 supplemental root, as in every other component
(Decision 0011 amendment 06). R1.6 also admits `react-aria@3.51.0` for
`Resizable`'s `useMove`, `marked@13.0.3` behind the typed Markdown parser
boundary, and the eight `@tiptap/*@3.31.4` packages only inside
`TextEditor` (Decision 0011 amendment 04; originally `3.22.3`). These are
internal, replaceable implementation edges with package, integrity, peer,
lockfile, isolation, tree-shaking, SSR/hydration, packed-consumer, and focused
security proof obligations. Upstream editor,
parser, and implementation types remain outside the public API.

Canonical ownership remains `catalog/tokens/` for data, `@muxui/tokens` for
transforms, `@muxui/react` for React CSS/behavior, and `apps/scale` for the
private editor/projection. Shared sources remain renderer-neutral. React
Native, framework-free web, React Native Web, cross-renderer equivalence,
general external design-tool interchange, package publication, hosted/public
Scale, stable support, `latest`, and production/consumer mutation remain
outside this scope. Tailwind remains a consumer build dependency only, never
a Mux UI runtime, peer, generated-source, or styling engine. Reversal is
append-only: disable the private capability while retaining canonical source
truth.

## Product Scope 9.0.0: IconButton and Field deferral

Product Scope `9.0.0` records the accepted IconButton expansion in Decision
0014. `IconButton` is a Mux UI-owned, experimental React family under the
existing `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` commitment. It composes Button,
requires an explicit accessible name, owns its API, tokens, styles, and
behavior, and is exported from the root React package. The mapping now contains
22 supplemental families and 75 total current families: the fixed 53-family
floor, 73 root exports, and the two existing isolated subpaths.

The 22 supplemental mapping entries are: `alert-dialog`, `button-group`,
`card`, `checkbox-field`, `color-mode-toggle`, `command-palette`, `header-nav`,
`icon-button`, `input-tags`, `input`, `multi-select`, `payment-input`,
`progress-circle`, `radio-field`, `sidebar`, `switch-field`, `tag-select`,
`text-area`, `text-editor`, `resizable`, `lightbox`, and `markdown`. This list
is a current Mux UI-owned catalog projection, not a publication or support
claim.

The standalone `Field` family remains deferred. Existing named fields and
`Input` parts cover ordinary composition; a generic Field may be reconsidered
only for a demonstrated custom or multiple-control boundary with deliberate
label, description, error, and validation association. This scope expansion
does not add a Field artifact, runtime, export, dependency, stable-support
claim, package publication, or secondary-renderer activation. Existing Scope
IDs remain immutable, and the retirement decision's accepted cleanup does not
rescind this later approved expansion.

## Product Scope 11.0.0: Text family admission

Product Scope `11.0.0` records the accepted Text expansion in Decision 0017.
`Text` is a Mux UI-owned, experimental React family under the existing
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` commitment. It applies existing display,
heading, title, label, body, expressive, and mono typography roles to a
selected native text host, preserves caller DOM and accessibility props, and
is exported from the root React package.

That admission established 23 supplemental families and 76 total
families: the fixed 53-family floor, 74 root exports, and the two existing
isolated subpaths. The current supplemental mapping entries are:
`alert-dialog`, `button-group`, `card`, `checkbox-field`, `color-mode-toggle`,
`command-palette`, `header-nav`, `icon-button`, `input`, `input-tags`,
`lightbox`, `markdown`, `multi-select`, `payment-input`, `progress-circle`,
`radio-field`, `resizable`, `sidebar`, `switch-field`, `tag-select`,
`text-area`, `text`, and `text-editor`.

Text supports React Aria description slots inside fields and label and
description slots inside collection items. Field label association remains
owned by the field component; `as="label"` with `htmlFor` remains native
labeling. `truncate` is visual and keeps the complete text in the DOM. This
addition changes no token values, platform activation, stable-support claim,
package publication, or release readiness claim. Existing Scope IDs remain
immutable and the historical IconButton and Field-deferral record remains
unchanged.

## Product Scope 12.0.0: Image, Avatar, and SelectNative admission

[Decision 0018](../decisions/0018-image-avatar-select-native-admission.md)
extends `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` with three experimental Mux-owned
React families. This is an explicit post-R1.6 expansion to include the named
native-backed helpers; it does not add a blanket native-component admission
or alter the historical fixed inventory and completed evidence.

Image owns native image presentation and bounded loading/fallback behavior.
Avatar owns image/fallback composition, including fallback-only indicators.
SelectNative owns a visible native select with optional label, description,
and error associations through internal React Aria `useField`. Native image
and form semantics, caller refs/events, Mux tokens, and accessibility remain
part of their public contracts. Generic Field remains deferred.

The current 26-family supplemental mapping comprises `alert-dialog`, `avatar`,
`button-group`, `card`, `checkbox-field`, `color-mode-toggle`,
`command-palette`, `header-nav`, `icon-button`, `image`, `input`, `input-tags`,
`lightbox`, `markdown`, `multi-select`, `payment-input`, `progress-circle`,
`radio-field`, `resizable`, `select-native`, `sidebar`, `switch-field`,
`tag-select`, `text`, `text-area`, and `text-editor`. Together with the fixed
53-family floor, this yields 79 current families, 77 root exports, and two
isolated subpaths.

No token values, dependencies, package versions, platform activation, stable
support, publication, or consumer mutation follow from this admission.
Implementation proof and protected repository adoption remain separate from
the accepted direction and from package release.

## Product Scope 12.0.1: Mux-owned React component motion

Decision 0019 records one direct internal runtime edge of `@muxui/react`:
`motion@13.4.0` for bounded Mux-owned component motion in existing admitted
`web.react` families. The package is replaceable, and its registry MIT and
React peer metadata remain dependency inputs only until exact manifest,
lockfile, integrity, license/notice, isolation, tree-shaking, SSR/hydration,
and packed-consumer proof passes.

This patch changes no component or family, token value, public API, package or
platform commitment, support/lifecycle claim, release boundary, or milestone
state. Existing Scope IDs retain their states, including
`SCOPE-PKG-REACT`, `SCOPE-API-REACT-ERGONOMICS`, `SCOPE-TOKEN-MODES`,
`SCOPE-PROOF-BEHAVIOR`, `SCOPE-PROOF-PACKAGE`, `SCOPE-PROOF-VISUAL`, and
`SCOPE-QUALITY-COMPAT-PROFILE`; no new Scope ID or commitment transition is
created. Mux UI owns the public contract, reduced modes, CSS, accessibility,
SSR/hydration, refs, and lifecycle. React Native, `web.html`, cross-renderer
equivalence, stable support, publication, consumer mutation, and final R1-exit
merge remain outside this clarification.

## Product Scope 12.1.0: Figma token export

[Decision 0020](../decisions/0020-figma-token-export.md) names Figma as the
design tool for `SCOPE-DESIGN-TOOL` and `SCOPE-CAP-DESIGN-TOOL` and admits
their export-only slice ahead of G3.5. Andrew's observed workflow is applying
canonical tokens to a Figma file through the Figma MCP. Private
`@muxui/tokens` owns a deterministic export of variables, text styles, and
effect styles with a lossy/unsupported report, plus an idempotent applier
that never deletes. Architecture already assigns design-tool transforms to
that package, and the Roadmap records the addition and its evidence IDs.

This minor revision changes no committed release, platform, package, public
surface, support claim, or non-goal. Figma content remains a projection under
`SCOPE-NONGOAL-001`, and no generated export is committed. Import, round-trip,
proposals, components, Code Connect, additional themes, and pruning keep their
G3.5 conditions. Andrew authorized applying the export to one Figma file he
supplied; writes to any other file remain separate actions. Rollback deletes
the transform and CLI; any Figma file is disposable.

## Product Scope 12.1.1: retired history archive

[Decision 0021](../decisions/0021-retired-strategy-history-archive.md) archives
the 6.0.0, 6.0.3, and 6.0.4 amendment sections, matching the retired pre-8.0
statement above. The fixed 53-family registry, the `SCOPE-REACT-BREADTH-001`
and `SCOPE-METRIC-REACT-COVERAGE` meanings, and the 53-family change rule move
unchanged into the React `0.1` prerelease boundary. The temporal-adapter
dependency and the `lucide-react@1.37.0` edge for the existing R1 control
affordances, with the constraints 6.0.4 stated, are in the React `0.1` release
acceptance scope above and in Architecture.

This patch adds, removes, or transitions no Scope ID and changes no
commitment, release boundary, platform, package, public surface, support
claim, or non-goal.

## Product Scope 12.1.2: TextEditor Tiptap exact pin

[Decision 0011 amendment 04](../decisions/0011-amendment-04-tiptap-exact-pin.md)
moves the eight internal `TextEditor` packages from `3.22.3` to exact
`3.31.4`: `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`,
`@tiptap/starter-kit`, `@tiptap/extension-image`,
`@tiptap/extension-placeholder`, `@tiptap/extension-text-align`, and
`@tiptap/extension-text-style`. The workspace override cannot reach consumers,
and `@tiptap/starter-kit@3.22.3` declares its bundled extensions with caret
ranges, so a consumer install could pair newer extensions with core `3.22.3`.
From `3.30.0`, every Tiptap manifest pins its Tiptap dependencies exactly, so
`3.31.4` resolves one version in consumer installs.

This patch changes no package set, component or family, public API, package or
platform commitment, support/lifecycle claim, release boundary, or milestone
state. Existing Scope IDs retain their states, including
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001`, `SCOPE-PKG-REACT`, and
`SCOPE-PROOF-PACKAGE`; no new Scope ID or commitment transition is created.
Tiptap types and editor objects remain outside the Mux UI public API, and the
existing integrity, license/notice, lockfile, isolation, SSR/hydration, and
packed-consumer proof obligations apply to the new version.

## Product Scope 13.0.0: rc.1 release rulings

[Decision 0011 amendment 03](../decisions/0011-amendment-03-icon-affordance-additions.md)
adds the `Tabs` overflow scroll buttons, the `Disclosure` trigger, and the
`CheckboxField` indicator to the internal `lucide-react@1.37.0` affordance
boundary. The `Tabs` icons are `chevron-left`, `chevron-right`, `chevron-up`,
and `chevron-down`; the `Disclosure` icon is `chevron-down`; the
`CheckboxField` icons are `check` and `minus`. All are decorative and
non-focusable. Each `Tabs` button takes its accessible name from a Mux-owned
label, the `Disclosure` trigger from its visible title, and the `CheckboxField`
input from its wrapping label text. The dependency, its version and
integrity, its notices, and the public boundary are unchanged.
`SCOPE-COMP-TABS-REACT` and `SCOPE-COMP-DISCLOSURE-REACT` remain
`committed`, and `CheckboxField` stays under
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001`.

[Decision 0022](../decisions/0022-rc1-assistive-technology-non-claim.md)
records that `@muxui/react@0.1.0-rc.1` on `next` claims no
assistive-technology support. Every rc.1 binding is exported, and its
assistive-technology support is unproved and not claimed. R1.1 through R1.4
closed without some of their manual and assistive-technology evidence: the
`DisclosureGroup` manual half of `E-R1.1-04` (provisional), the manual and
assistive-technology half of `E-R1.2-03` and `E-R1.3-04`, and `E-R1.4-04`.
R1.5 closed without the risk-profile half of `E-R1.5-03`, because no binding
declares a risk profile. Each is recorded as unmet and deferred to `S1.0`, not
passed. Those milestone exits and the release-acceptance requirement above
gain a matching prerelease amendment, not an operational exception; each
milestone is complete for the rc prerelease boundary on its logged evidence,
which must be captured into retained evidence before the R1 exit, and each
deferred item is a required `S1.0` entry condition. R1.1 through R1.5 evidence
exists only in CI check and review logs, which expire around 2026-11-23 and
cannot satisfy an exit. Capturing those logs into retained evidence is a
required R1 exit entry condition and a required step before the rc.1 cut;
until then the generated records keep R1.5 evidence `logged-not-retained`. The
compatibility profile and release manifest state the non-claim and every
deferral. Every existing accessibility check, including axe, keyboard, and
focus, remains required. Architecture's risk-class table is the basis for also
requiring every exported component to declare its risk class before `S1.0`.

[Decision 0023](../decisions/0023-rc1-dist-tag-and-rollback.md) corrects a
rule the registry cannot satisfy. npm sets `latest` on a package's first
publish and never lets it be deleted. rc.1 is published with `--tag next`;
if it is the first publish, `latest` will also point at it. Apart from a
separately authorized re-point of `latest` to the fix-forward rc during a
rollback, nothing claims or promotes `latest`, and no stable release is
promoted. Install guidance uses `@muxui/react@next` until a stable release
moves `latest`. If rc.1 is bad, it is deprecated with a message and a fixed
prerelease is published as a new exact candidate. Mux UI unpublishes only for
a security or legal problem, with explicit authorization, inside npm's
72-hour no-dependents window. `E-R1-EXIT-04` checks that this rollback is
prepared, not exercised, rather than restoring a prior `next` pointer.

The Tabs, Disclosure, and CheckboxField rulings are patch-level clarifications
on their own. The `latest` ruling redefines the committed React `0.1` release
boundary, which said no `latest` tag, and Decision 0022 amends the R1.1
through R1.5 exit rules and the release-acceptance requirement that manual and
assistive-technology evidence exist before export. Each of those is a material
change to a committed release boundary, so the combined effect is major.
Architecture's Lucide affordance lists and its R1 `latest` statement are
amended in the same change to match; neither edit adds a scope item.
`SCOPE-PRODUCT-REACT-PRERELEASE` and every other Scope ID keep their
commitments; no Scope ID is added or removed, and no package, platform,
export, lifecycle, or support claim broadens. None of these rulings authorizes
publication, deprecation, a dist-tag change, an unpublish, or the final
R1-exit merge.

Tracker migration: the deferred `S1.0` evidence and the capture of R1 PR logs
into retained evidence will be tracked as follow-up items. This change creates
no tracker items.

## Product Scope 13.1.0: Figma component export

[Decision 0020 amendment 01](../decisions/0020-amendment-01-figma-component-export.md)
extends the export-only Figma slice of `SCOPE-DESIGN-TOOL` and
`SCOPE-CAP-DESIGN-TOOL` from tokens to components for a named set of simple
controls, delivered in batches. The first batch is Button, Checkbox, Switch,
TextField, Tabs, and TagGroup. The private, never published
`@muxui/figma` package in `tooling/generators/figma` owns only
anatomy mappings and transport, the design-tool adapter role G3.5 describes:
browser measurement, a mode-consistency audit, a deterministic component spec
bound to the exported variables and styles by token ID, and an idempotent
applier that changes only nodes it tagged and deletes only the glyph vectors it
replaces. The Roadmap records the addition and its evidence
IDs.

This minor revision changes no committed release, platform, public package,
public surface, support claim, or non-goal. Figma content remains a
projection under `SCOPE-NONGOAL-001`, and no generated spec is committed.
Import, round-trip, proposals, Code Connect, complex families, motion,
additional themes, and pruning keep their G3.5 conditions. Andrew's direction
covers writing the six families' components to file `Z1rFgLTe3lBr0nwm8UvFEx`;
removing the pilot page, later batches' writes, and any other Figma file need
his separate, explicit direction. Rollback deletes the package; any Figma
Components page is disposable.

## Product Scope 14.0.0: R1 review evidence correction

[Decision 0022 amendment 01](../decisions/0022-amendment-01-r1-review-evidence-correction.md)
corrects the 13.0.0 statement that R1.1 through R1.5 evidence exists in CI
check and review logs. The check logs are retained under `tests/evidence`.
Pull requests #102 and #105 through #108 have no hosted reviews; four
descriptions claim a local review that was not retained, and #105 claims
none. The release-acceptance review evidence is therefore the retained
retroactive review of the current R1.2, R1.3, and R1.4 code under
`tests/evidence/r1-retro-review`, with every finding resolved by a merged fix
or an accepted reason, and author-reported review for R1.1 and R1.5, which
Andrew accepted for the rc boundary and which is not proof. Accepting that
unretained author claim is Andrew's accepted exception, for R1.1 and R1.5
only, to the rule that a transient log cannot satisfy an exit. The generated
records mark R1.5 evidence `checks-retained-review-author-reported`.

This materially changes what satisfies a committed release-acceptance
condition: the R1.1 and R1.5 reviews now count as author-reported, which is
not proof. As with 13.0.0's amendment of the R1.1 through R1.5 exit rules,
the effect is major. No Scope ID is added, removed, or transitioned, and no
package, platform, public surface, support claim, or non-goal changes. Every
`S1.0` deferral recorded under 13.0.0 stays deferred, and rc.1 still claims
no assistive-technology support.

Tracker migration: the fixes for the review findings landed in pull request
#204. Two known limitations Andrew accepted for rc.1, R1.2 finding L5
(Autocomplete dismiss proven only in Chromium) and R1.4 finding M7 (focus
falls to body when a Dialog's opener unmounts), will be tracked as `S1.0`
items; no tracker items are created by this change. 13.0.0's follow-up to
capture the R1 pull-request logs into retained evidence is satisfied by
pull request #202.

## Product Scope 14.0.1: temporal adapter exact pin

[Decision 0011 amendment 05](../decisions/0011-amendment-05-internationalized-date-exact-pin.md)
moves the internal temporal-adapter dependency of `@muxui/react` from exact
`@internationalized/date@3.12.3` to exact `3.12.4`. React Aria and React
Stately declare `^3.12.3`, so once `3.12.4` became npm's latest, a fresh yarn 1
consumer install resolved both `3.12.3` and `3.12.4`. Pinning `3.12.4`
restores one resolved instance for npm, pnpm, and yarn. A later patch release
can reintroduce a yarn 1 duplicate; the packed-consumer install matrix records
it as a warning, and re-pinning needs another accepted amendment.

This patch changes no dependency set, six-family adapter limit, component or
family, public API or value format, package or platform commitment,
support/lifecycle claim, release boundary, or milestone state. Existing Scope
IDs retain their states, including `SCOPE-PKG-REACT` and
`SCOPE-PROOF-PACKAGE`; no new Scope ID or commitment transition is created.
The license text is unchanged at `3.12.4`, and the existing integrity,
license/notice, lockfile, leakage, and packed-consumer proof obligations apply
to the new version.

## Product Scope 14.0.2: fix-forward rc in the prerelease row

[Decision 0023](../decisions/0023-rc1-dist-tag-and-rollback.md) makes
deprecate and fix forward the rc.1 rollback plan: a bad rc.1 is deprecated and
a fixed `0.1.0-rc.2` is published as a new exact candidate. 13.0.0 applied
that decision, and the Roadmap R1 exit already admits "a fix-forward rc that
replaces" rc.1. The `SCOPE-PRODUCT-REACT-PRERELEASE` row alone still named only
the `alpha.N`/`rc.1` tarball. It now reads: exact
`@muxui/react@0.1.0-alpha.N`/`rc.1` tarball and release manifest under
`next`, or a fix-forward `0.1.0-rc.N+1` that replaces a deprecated rc under
Decision 0023.

This patch brings one row into line with text 13.0.0 already accepted, and the
major version 13.0.0 took for redefining the React `0.1` release boundary
already covers the fix-forward. It changes no Scope ID, commitment state,
release boundary, package, platform, public surface, support claim, or
non-goal. `SCOPE-PRODUCT-REACT-PRERELEASE` stays `committed`, and no Scope ID
is added, removed, or transitioned. Nothing about `latest`, a stable `0.1.0`
release, or another package is admitted. A fix-forward rc remains a new exact
candidate with its own release preparation, `E-R1-EXIT-01` through
`E-R1-EXIT-03` evidence, and publish authorization; every publish,
deprecation, dist-tag change, and unpublish still needs its own explicit
authorization.

No decision record is added. Decision 0023 already admits the fix-forward, and
decisions are append-only.

Tracker migration: none. No open work changes, and this change creates no
tracker items.

## Product Scope 15.0.0: Blocks showcase admission

[Decision 0026](../decisions/0026-blocks-showcase-admission.md) admits a private
Blocks showcase and the first `pattern` records. This section is the
product-scope change-control record.

1. **Observed workflow and outcome.** Andrew wants a showcase and
   copy-and-paste resource for components and for reusable compositions,
   including application compositions and marketing page sections, like
   Tailwind Plus UI Blocks. The poster grid composition was cut from the
   GridList and Virtualizer guides because component documentation shows core
   usage only. Outcome: a bounded composition of admitted components can be
   browsed, previewed, and copied from its exact executable source.
2. **Affected Scope IDs and transitions.** `SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE`
   is added as `admitted`. `SCOPE-KIND-PATTERN` stays `committed`; its row gains
   a delivery reference. `SCOPE-NONGOAL-008` stays `rejected`; its row gains the
   statement that block placeholder copy and imagery are demonstration
   material, not Mux UI product truth. `SCOPE-CAP-BREADTH` stays `admitted`; its
   trigger text records that blocks inside the Decision 0026 boundary are
   delivered under BL1 and do not use it. No ID is removed, split, replaced, or
   transitioned. `SCOPE-GUIDE-COMPOSITION`, `SCOPE-SURFACE-API`,
   `SCOPE-SURFACE-CLI`, `SCOPE-SURFACE-SITE`, `SCOPE-CMD-LIST`,
   `SCOPE-CMD-SEARCH`, and `SCOPE-CMD-GET` are realized for the `pattern` kind
   without change, and `SCOPE-NONGOAL-012` keeps its workflow-value
   requirement. Not claimed: `SCOPE-PRODUCT-003`,
   `SCOPE-SURFACE-EXPLORER-WEB`, `SCOPE-PRODUCT-004`, `SCOPE-CMD-PLAN`,
   `SCOPE-CAP-CONSUMER-PATTERN`, and `SCOPE-CMD-INIT`.
3. **Architecture compatibility.** Architecture already makes `pattern` an
   addressable kind and keeps the website a catalog client. It is amended to
   define "Block", to stage the first `PatternRecord` fields, to add variant
   ownership, the bounded-block test and content rules, and the Blocks
   projection. A block stays inside Architecture's v1 exclusion of
   page-archetype, journey, and flow kinds by the bounded-block test. Decision
   0026 records the ontology-budget justification for adding `pattern` to the
   `example-of` target set. One owner per fact, the generated-output rule, and
   the Roadmap's non-waivable rules are unchanged.
4. **Roadmap coverage.** BL1 and `E-BL1-01` through `E-BL1-11`. BL1 is added to
   the milestone register and dependency map, with R1 exit as its only hard
   dependency, and G3.1 records that blocks inside the boundary are delivered
   under BL1.
5. **Platform, package, version, migration, authoring, proof, privacy,
   security, and rollback effects.** Platform: `web.react` only. Packages: no
   new package and no `@muxui/react` change. Version: schema and catalog minor,
   and `@muxui/catalog` and `@muxui/tooling` minor where their surface grows.
   Migration: none, because existing sources stay valid. Authoring: scaffold,
   semantic diff, revision explainer, affected closure, and diagnostics cover
   patterns. Proof: the eleven BL1 assertions, with page-width visual evidence
   for marketing blocks, a content-rules check, and no assistive-technology
   claim (Decision 0022). Privacy and security: previews run repository-owned
   example code only, the section collects no analytics or consumer data, and
   block content follows the content rules (generic Mux-authored copy, no
   third-party brand marks, no real names or likenesses, licensed and disclosed
   assets only). Rollback: delete the pattern records, the Blocks section, and
   the pattern kind's support.
6. **Release scope additions and removals.** None added to or removed from the
   React `0.1` or Productization boundaries. The showcase belongs to neither,
   and nothing is published, retagged, or deployed.
7. **Tracker migration.** No existing item changes. A `decision` item for the
   authority change and a `milestone` item for BL1 are needed and are not
   created by this change.

The effect is major under "Scope-version effects", which lists redefining a
non-goal. The statement on `SCOPE-NONGOAL-008` gives block demonstration content
a reading the non-goal did not state before. It is arguably a clarification,
but the change cannot show that the non-goal's meaning is unchanged, so this
change takes the conservative route. Without that statement the change would
be minor: it adds an `admitted` item and stages the first delivery of a
committed kind, with no change to a committed outcome, platform, release
boundary, package, or public surface. The showcase stays private and
unpublished, and `SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE` stays `admitted`; a public
deployment would be a separate admission with a new Scope ID.

## Product Scope 15.0.1: query API 2.1.0

[Decision 0026](../decisions/0026-blocks-showcase-admission.md) item 10 gives
the pattern kind's new response members an additive query API minor, so the
query API moves from `2.0.0` to `2.1.0`, and the Architecture names `2.1.0` as
the supported pre-release query API. The token-source retrieval line here still
named `2.0.0` only. It now names `2.1.0`.

This patch brings one line into line with an accepted decision. It changes no
Scope ID, commitment state, release boundary, package, platform, public
surface, support claim, or non-goal, and no Scope ID is added, removed, or
transitioned.

## Product Scope 15.0.2: Lucide in every component

[Decision 0011 amendment 06](../decisions/0011-amendment-06-lucide-all-components.md)
makes the internal `lucide-react@1.37.0` edge of `@muxui/react` the default
icon source for decorative affordances in every component, current and future,
with no per-component amendment or approval. It supersedes the component
lists that amendment 02, amendment 03, and R1.6 attached to the edge, and the
Breadcrumb-separator and Search-icon exclusions with them. The release
acceptance scope above and the R1.6 deliverables state the general rule in
place of those lists.

This patch changes no Scope ID, commitment state, release boundary, package,
platform, public surface, support claim, or non-goal. The dependency name,
exact version, npm integrity, license notices, internal-only boundary,
decorative semantics, and reproof rule are unchanged, and no Scope ID is
added, removed, or transitioned. Other renderers would need their own
dependency decision for a Lucide package.

Tracker migration: none. No open work changes, and this change creates no
tracker items.

## Product Scope 16.0.0: CodeBlock admission

[Decision 0024](../decisions/0024-code-block-admission.md) extends the committed
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` outcome with one experimental React root
family, CodeBlock. It presents escaped plain code and bounded unified line
diffs with exact explicit copying, native host attributes/ref, old/new numbers,
and accessible added/removed semantics. Beautiful UI's rendered demonstration
is the selected design basis; Mux owns the implementation, API, CSS, and
existing token roles. Two component-owned row-background tokens derive
translucent paint from existing status accents, advancing the token contract
additively from `5.0.0` to `5.1.0`, with token/dependent proof.
Other candidates are not admitted by this change.

The existing mapping becomes 27 supplemental families and 80 total families,
with 78 root exports and the two existing isolated subpaths. Existing runtime
dependencies, packages, renderer boundaries, and the historical 53-family floor
remain unchanged. This is bounded post-R1 React delivery with focused proof
under the current mapping/style/projection/platform assertions, without
rewriting completed evidence or establishing milestone/release readiness.

Each input accepts at most 1,000,000 UTF-16 units and 10,000 lines. A diff
middle requiring more than 250,000 LCS cells is shown as an explicitly labeled
replacement. Syntax highlighting, token diffs, editors, patch application,
parsers, task engines, G3 activation, new platforms, support claims, publication,
and production/consumer changes are excluded. Clipboard writes occur only
after activation, remain local, and announce success only after fulfillment.

Canonical ownership is the CodeBlock record/examples, existing supplemental
mapping, and React source. Generation and packed-consumer checks prove their
projections. Open work references this named addition and existing Scope ID;
tracker reconciliation and protected-PR adoption remain pending. Reversal
before publication requires a follow-up scope change removing its mapping
and export with regenerated projections; completed evidence stays immutable.


## Product Scope 17.0.0: remaining Beautiful UI candidates

[Decision 0025](../decisions/0025-remaining-candidates-admission.md) extends
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` with four experimental React root families:
PromptComposer, Message, Activity and DataDiff. Andrew selected Beautiful UI's
rendered components as their design basis and explicitly requested creation of
the remaining candidates. Mux independently owns source, API, native host
semantics, selectors, CSS, examples and accessibility. Decision 0024's local
CodeBlock admission and the historical 53-family floor remain intact.

PromptComposer owns local multiline form editing, native validation/reset,
IME-safe send, caret-triggered source/command insertion and wired file/model/
stop/dictation callbacks. Message presents supplied React content, compact
labeled actions, safe source links/disclosure and explicit follow-ups, with
caller-controlled streaming. Activity presents supplied finite task statuses,
dense list rows and aggregate/item disclosures. DataDiff presents supplied
scalar rows, selected additions/removals/updates and an explicit Apply callback.
Backend execution, uploads, AI/network services, permissions, recognition,
generic workflow engines and cosmetic processing timers are excluded.

The existing mapping becomes 31 supplemental families and 84 total families,
with 82 root exports and the unchanged Markdown/TextEditor isolated subpaths.
No package, schema, runtime dependency, platform, capability, lifecycle or
support promotion is added. Two DataDiff-owned change-background tokens reuse
existing success/invalid paint through transparent tint, advancing the token
contract additively from 5.1.0 to 5.2.0 with token and affected-dependent proof.

This bounded post-R1 addition follows `E-R1.6-01`, `E-R1.6-03`, `E-R1.6-04` and
`E-R1.6-07` for current mapping, behavior/styles, projections and platform/
release checks. Focused type, native ref/event, SSR/hydration, form/IME/reset,
keyboard/focus, disclosure, safe links/scalars, controlled state, pending/error,
light/dark/narrow/forced-colors, generation identity, import isolation and
packed-consumer proof remain required. Existing evidence is not rewritten or
claimed to prove these additions. No milestone, release, G3 activation,
publication, production or consumer mutation is authorized. Tracker
reconciliation and protected-PR adoption remain pending; reversal before
publication requires a follow-up scope change and regenerated projections.

## Product Scope 18.0.0: CodeBlock Shiki highlighting

[Decision 0024 amendment 01](../decisions/0024-code-block-admission.md) accepts
Andrew's workflow of reading syntax-highlighted CodeBlock listings and diffs.
It supersedes only the 16.0.0 syntax-highlighting non-goal and unchanged-runtime-
dependency clause for this existing family. This material redefinition is major.
`SCOPE-REACT-DONOR-SUPPLEMENTAL-001` and `SCOPE-PKG-REACT` keep their commitments;
no Scope ID, family, export, package, platform, lifecycle or release boundary
is added or removed. The current 31 supplemental/84 total families, 82 root
exports and two isolated subpaths remain unchanged.

The React package adds exact private `shiki@4.5.0`, with fine-grained lazy
client imports and license/notice/integrity proof. Existing language metadata
selects bundled grammars and aliases without a new API. SSR, initial hydration,
missing/plain/unknown languages, loading, failures and excess highlighting work
remain escaped plain text. Original/copy bytes stay exact, and independent
complete grammar streams supply original or updated diff rows. No raw HTML,
code execution, external source service or global source/token cache is used.
Mux semantic content roles own colors across themes, contrast and forced colors.

Highlighting budgets are independent of accepted input bounds: 50,000 UTF-16
units, 500 lines, 2,000 units per line and 20,000 tokens aggregate across a
listing's inputs, with at most eight detected optional embedded languages.
Cooperative per-line and measured aggregate time guards discard the whole
result; they do not promise hard real-time behavior. Editor/token-diff/patch/
task-engine work and TextEditor changes remain excluded.

Canonical ownership remains CodeBlock records/examples and React source, plus
the package dependency/notice and necessary generation/proof contracts. Current
`E-R1.6-01`, `03`, `04` and `07` route focused grammar/escaping/whitespace,
loading/failure/async/hydration, bounded timing, semantic visual, root/SSR
isolation, tree-shaking and packed-consumer proof. The runtime dependency
requires the full deterministic workspace graph and independent API/security/
lifecycle/budget/ownership review. No schema, token version or migration utility
is needed in the current pre-release state. Reversal before publication requires
an explicit scope amendment removing the highlighting/dependency and regenerating
projections; historical evidence stays immutable.

Tracker migration: open CodeBlock/Shiki work routes to this existing scope and
post-R1 CodeBlock addition. The Delivery Project's 7 October 2026 historical
R1.6 item #121 and older scope/family snapshot are unchanged. No named Shiki
item was present; tracker reconciliation and protected-PR adoption remain
pending. This local implementation creates no tracker item and claims no
milestone completion, release readiness, stable or assistive-technology support,
publication, production, daily-driver channel or consumer mutation.
