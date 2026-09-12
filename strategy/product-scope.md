---
scopeVersion: 8.0.0
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
| `SCOPE-NONGOAL-008` | `rejected` | Application-owned routes, navigation flows, business state, analytics, product content, or screen-specific logic represented as Mux UI truth. |
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
breadth closure may propose `0.1.0-rc.1`. No `latest` tag, stable `0.1.0`,
framework-free package, native package/profile, public catalog/tooling/CLI,
cross-platform equivalence, or secondary-renderer support claim belongs to this
boundary.

| Scope ID | Commitment | Product deliverable | Roadmap |
| --- | --- | --- | --- |
| `SCOPE-OUTCOME-REACT-PRIMARY` | `committed` | Installable React prerelease using Mux UI-owned experimental bindings and generated package guidance. | R1.0–R1 exit |
| `SCOPE-SYSTEM-REACT` | `committed` | Standalone React substrate, CSS/runtime ownership, exact React Aria baseline, Mux UI-owned styling and tranche delivery. | R1.0–R1.5 |
| `SCOPE-REACT-BREADTH-001` | `committed` | Disposition-complete Mux UI coverage of the applicable pinned React Aria component surface. | R1.1–R1.5 |
| `SCOPE-REACT-DONOR-SUPPLEMENTAL-001` | `committed` | Mux UI-owned bindings, CSS, interaction contracts, and exports for applicable supplemental React Aria families outside the historical fixed 53-family table, admitted only through the exact R1.6 inventory and proof. | R1.6 and R1 exit |
| `SCOPE-PRODUCT-REACT-PRERELEASE` | `committed` | Exact `@muxui/react@0.1.0-alpha.N`/`rc.1` tarball and release manifest under `next`. | R1 tranche exits and R1 exit |
| `SCOPE-SURFACE-REACT-PACKAGE-GUIDANCE` | `committed` | Generated version-bound install, API, export/component, styling, and compatibility guidance in the tarball. | R1.0 and every tranche |

The React-specific component and pattern commitments are
`SCOPE-COMP-BUTTON-REACT`, `SCOPE-COMP-TEXTFIELD-REACT`,
`SCOPE-COMP-SWITCH-REACT`, `SCOPE-PATTERN-FORM-REACT`,
`SCOPE-COMP-SELECT-REACT`, `SCOPE-COMP-TABS-REACT`,
`SCOPE-COMP-DIALOG-REACT`, and `SCOPE-COMP-TOAST-REACT`. Their complete
contracts appear in the accepted `5.0.0` amendment below.

Every exported binding remains `experimental` until independently promoted.
Missing binding-required manual or assistive-technology proof keeps it
unexported or explicitly unavailable with support unproved; it does not alter
authored lifecycle/strategy or create an `unsupported` disposition.

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
| `SCOPE-API-DEPRECATION` | `committed` | Deprecation names a replacement or explicit no-replacement reason, notice window, version effect, retained retrieval, diagnostic, and migration path. Query API v1.2 retains inline token responses for one complete accepted notice release before v2 removal. |

Generated Mux UI-owned types may represent serializable binding fields. Renderer
source remains responsible for host-language inference, generic constraints,
refs, narrowed events, and platform-owned props, with conformance checks
preventing those refinements from becoming undocumented product API.

## Canonical knowledge scope

| Scope ID | Commitment | Kind | Initial product scope |
| --- | --- | --- | --- |
| `SCOPE-KIND-COMPONENT` | `committed` | `component` | Shared concept semantics plus explicit platform binding specs and runtime-profile dispositions. |
| `SCOPE-KIND-PATTERN` | `committed` | `pattern` | Bounded composition with roles, relations, parameters, constraints, examples, alternatives, pitfalls, and unsupported cases. |
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
| `SCOPE-PKG-CATALOG` | `committed` | `@muxui/catalog` | Immutable compiled catalog, search index, pure discovery/query/planning API, canonical page-budget profiles/page selection, response-version negotiation/historical semantics, bounded token/crosswalk sections, and package-level catalog identity. | CLI parsing, MCP transport, renderer runtime, or project mutation. |
| `SCOPE-PKG-TOOLING` | `committed` | `@muxui/tooling` | CLI, adapters, installed catalog/version selection, explicit query-version forwarding, response rendering, local validation, maintainer authoring, change-intent previews, and enabled safe operations. | A second artifact index, product/query-response decisions, page-boundary selection, or renderer implementation. |

At R1, only `@muxui/react` is publishable; schema, tokens, foundation,
catalog, and tooling remain private build/proof authorities and are not runtime
edges. Productization later publishes the compatible portfolio. Renderer
packages do not depend on the catalog at runtime.

## Product surfaces and command scope

### Query and documentation surfaces

| Scope ID | Commitment | Surface | Earliest boundary | Product contract |
| --- | --- | --- | --- | --- |
| `SCOPE-SURFACE-API` | `committed` | Programmatic catalog API | Foundation | Pure manifest/list/search/get with bounded versioned sections and historical response negotiation; planning only when enabled. |
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

Token-source retrieval follows a staged compatibility contract. Query API
`1.2.0` retains v1.1's complete inline `tokens`, adds bounded `tokens` and
`source-crosswalk` sections, and emits
`MUXUI_QUERY_INLINE_TOKENS_DEPRECATED` with replacement guidance. After one
complete retained and human-accepted v1.2 notice release, query API `2.0.0` may
replace inline tokens with counts, digests, provenance, and available-section
metadata. `@muxui/schema` owns each versioned request/response and
`TokenSectionPageBudgetProfile` grammar. `@muxui/catalog` owns historical
response negotiation, the canonical profile values, and page selection;
tooling only selects a compatible installed catalog, forwards explicit version
intent, renders the returned page, and rejects unsupported tuples without
reinterpretation. Historical v1.1/v1.2 behavior remains explicitly
negotiable. Those inline responses are retained compatibility artifacts,
exempt from the v2 sectional page budget, never current/default behavior, and
cannot satisfy proof of the v2 bounded path. The v1.2 `source-crosswalk`
section returns typed `absent` for a token-source 2.0 record and for a 2.1
record that omits the authored field. The profile fixes the query API and lexer versions, canonical
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
| `SCOPE-DESIGN-TOOL` | `admitted` | One named external design-tool interchange profile and proposal-only round-trip | Capability release through G3.5; it does not own the private theme-authoring capability |

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
| `SCOPE-TRUST-HISTORY` | `committed` | Historical compatible catalogs, binding specs, migrations, evidence, advisories, and release identities remain retrievable for supported windows. |

No exception may patch a projection, broaden support, bypass integrity, create
proof, suppress mandatory accessibility/safety evidence, or authorize an
unconfirmed mutation.

## Conditional capability portfolio

Gate 3 is not a monolithic commitment. Each scope item remains unavailable
until its activation conditions and evidence pass. An item can close with an
explicit no-activation decision without making Mux UI incomplete.

| Scope ID | State | Capability | Activation trigger | Roadmap |
| --- | --- | --- | --- | --- |
| `SCOPE-CAP-BREADTH` | `admitted` | Deliberate component and pattern breadth | Gate 2 plus Tabs/Toast for comparable risk; every candidate has observed workflow demand, owner, platform disposition, risk class, and proof path. | G3.1 |
| `SCOPE-CAP-MIGRATION` | `deferred` | Declarative migrations and reviewed codemods | A real version-bounded supported migration need with retrievable old/new specs and bounded transformation. | G3.2 |
| `SCOPE-CAP-MCP-HOSTED` | `deferred` | Read-only hosted MCP | Stable query/compatibility policy plus privacy, security, availability, cache isolation, and failure separation. | G3.3 |
| `SCOPE-CAP-AGENT-GATES` | `admitted` | Promote selected agent evaluations | Repeated baseline, predeclared threshold/variance/retry policy, canonical prompt IDs, and a failure owner. | G3.4 |
| `SCOPE-CAP-DESIGN-TOOL` | `admitted` | One named external design-tool interchange | Stable identities across a real release, observed workflow, export proof, loss policy, and proposal-only imports. Additional themes are governed by `SCOPE-CAP-THEME-AUTHORING-PRIVATE`. | G3.5 |
| `SCOPE-CAP-THEME-AUTHORING-PRIVATE` | `admitted` | Private `apps/scale` maintainer capability for adding, editing, previewing, importing, exporting, persisting, and round-tripping Mux UI themes | Canonical token/theme ownership, typed override safety, complete theme parity proof, and a disable path that leaves canonical sources authoritative. | R1.6 |
| `SCOPE-CAP-TAILWIND-CONSUMER` | `admitted` | Optional Tailwind consumer build adapter generated from Mux UI-owned token/theme transforms | Actual consumer compilation proof; Tailwind is a consumer build dependency only and never a Mux UI runtime, peer, or styling-engine dependency. | R1.6 |
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
  `@internationalized/date@3.12.3` dependency limited to Mux UI value adapters
  in `DateField`, `DatePicker`, `DateRangePicker`, `TimeField`, `Calendar`, and
  `RangeCalendar`, plus the R1.6 internal, replaceable supplemental-affordance edges
  `react-aria@3.51.0` for `Resizable`, `marked@13.0.3` for the typed Markdown
  parser boundary, and the eight `@tiptap/*@3.22.3` packages for `TextEditor`;
  no Mux UI workspace runtime edge or upstream public API/type
  leak is permitted;
- the first-party default token/theme system satisfies every applicable React
  requirement and accessibility adaptation;
- package exports, types, CSS, guidance, descriptors, compatibility metadata,
  and release manifest agree on exact revisions;
- packed artifacts, not source-tree assumptions, prove exports and
  compatibility;
- required manual/assistive-technology evidence exists before export for every
  React binding whose exact risk contract requires it;
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
release boundaries, and non-goals are defined by the 8.0.0 baseline above and
the active roadmap. No historical record is rewritten or reinterpreted as a
current product outcome.

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
## Product Scope 6.0.0

The following Product Scope 6.0.x amendment record is retained as historical
authority. Its references to Decision 0011, the 6.0.x versions, and the
reset-specific Project reconciliation describe the accepted pre-rename state;
Product Scope 7.0.0 and Decision 0012 now govern the current Mux UI identity.

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
- upstream `Modal`, whose Mux UI public family is `Dialog`, ->
  `SCOPE-COMP-DIALOG-REACT`; and
- `Toast` -> `SCOPE-COMP-TOAST-REACT`.

The following table is the complete immutable 53-family Scope registry for
this decision. `new` means Product Scope 6.0.0 adds the ID; `existing` means
the exact previously committed ID is retained.

| Upstream family | Mux UI public family | Immutable Scope ID | ID treatment | Tranche |
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

Each row is `committed`; its package/platform is `@muxui/react` / `web.react`;
its activation uses the fixed 53-family table, immutable Stage 1/R1.0
baseline, Mux UI-owned contract, applicable styling disposition,
risk-selected deterministic and manual proof, and the unchanged React
prerelease release boundary. No row commits
a React Aria public name, raw helper/type export, secondary renderer,
cross-platform counterpart, stable lifecycle, or independent release.

The existing `SCOPE-REACT-BREADTH-001` outcome is recorded in the accepted
6.0.0 authority as
disposition-complete applicable coverage with permitted exclusions to complete
delivery of all 53 exact snapshot families. `SCOPE-METRIC-REACT-COVERAGE`
measures exact 53-of-53 Mux UI contract/export/proof closure plus complete raw
disposition and cannot be satisfied by upstream name or raw export count.
Other existing Product Scope commitments, deferred items, admitted items,
packages, platforms, surfaces, release boundaries, and non-goals retain their
5.0.1 states unless explicitly changed above.
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

This authority does not generally update the GitHub Project. Once, after the
reset is accepted, merged, and verified on the default branch, one reset-
specific Project reconciliation is explicitly authorized to update the Project
README to Product Scope `6.0.2`, Decision 0011, and the reset pull request while
preserving historical locators, and to replace issue #76's obsolete
continuous-envelope/scope-lock blocker with the already satisfied R1.0 plus
fixed 53-family scope boundary. Only after that one-time reconciliation may
standing Project synchronization update Roadmap-proved workflow status and
pull-request locators. It must preserve scope and authority references,
evidence meaning, priority, iteration, target dates, blockers, assignee, and
reviewer decisions for their own explicit owners. Tracker status never changes
Product Scope or evidence.

## Explicit non-goals

Product Scope 6.0.3 itself performs no repository implementation, dependency
installation, component work, CSS copy, playground work, evidence capture,
Project mutation, package publication, release, deployment, support claim,
stable promotion, React Aria public re-export, raw-export breadth target,
RSC/client-boundary support, framework-free implementation, React Native
implementation, RNW support, equivalence claim, public catalog or tooling
product, Scale port, new theme system, or production change. It does not itself
authorize repository, Git, Project, package, publication, or release mutations.

It does not rewrite historical evidence or reuse historical Scope IDs for new
outcomes. It does not allow a count-only completion claim. It does not permit
an upstream contract to replace a Mux UI-owned public contract.

## Acceptance effect

Acceptance of Decision 0011 and its reviewed materialization authorizes the
ordinary protected-PR reset and continued bounded R1.1-R1.5 implementation
within the unchanged product boundary. Npm publication, dist-tag mutation,
and the final R1-exit PR merge remain separate authorization boundaries.

## Product Scope 6.0.3 temporal adapter clarification

Product Scope advances from `6.0.2` to `6.0.3` as a patch clarification for
the accepted Decision 0011 amendment 01. It records one direct internal
runtime dependency of `@muxui/react`: `@internationalized/date@3.12.3`, used
only by Mux UI value adapters in exactly `DateField`, `DatePicker`,
`DateRangePicker`, `TimeField`, `Calendar`, and `RangeCalendar`.

The approved exact React target package graph is:

```text
@muxui/react@0.1.0-alpha.N
├── dependency: react-aria-components@1.20.0
├── dependency: @internationalized/date@3.12.3 (direct internal runtime; Mux UI value adapters only in DateField, DatePicker, DateRangePicker, TimeField, Calendar, RangeCalendar)
├── peer: react >=19.2.0 <20
└── peer: react-dom >=19.2.0 <20
```

`@internationalized/date@3.12.3` is already the single resolved `3.12.3`
instance in the pinned `react-aria-components@1.20.0` closure, so its direct
declaration adds no installed package or version. Mux UI public contracts remain
ISO dates `YYYY-MM-DD`, local times `HH:mm[:ss[.fraction]]`, and Mux UI-owned
`{start,end}` ranges. No `@internationalized/date` or React Aria public type,
value, import path, export, lifecycle, or ownership path leaks through the
package; this dependency is internal and replaceable only.

This clarification adds no Scope ID, commitment, family, tranche, platform,
support/lifecycle claim, public API, package, or release effect. The 53-family
inventory, all four tranches, existing Scope ID states, React Aria authority,
deferred tracks, Project boundaries, and npm, dist-tag, production,
consumer, and final-R1-exit-merge stops remain unchanged. It authorizes no
implementation, dependency installation, evidence, support claim, publication,
or Project or consumer mutation. The reset-specific Project reconciliation
already recorded for Product Scope `6.0.2` remains historical; this
clarification does not authorize a Project write.

## Product Scope 6.0.4 icon affordance dependency clarification

Product Scope advances from `6.0.3` to `6.0.4` as a patch clarification for
Decision 0011 amendment 02. Andrew approved `lucide-react` as an internal
replaceable dependency and then approved the recommended exact pin
`lucide-react@1.37.0`. The exact direct runtime dependency of `@muxui/react`
has npm integrity
`sha512-LPsB4rD1TD6wZu1djKOf9vUnS1jTNaHbolXebXDgiTdb6jeA1agIJhJsIybCmjKmQClcOaal1o1OaiYahEftyQ==`,
ISC license with its Feather-derived MIT notice, and React peer compatibility
with the existing React and React DOM peer boundary.

This is an internal, replaceable dependency. Under the fixed pre-R1.6 baseline,
it was limited to existing R1 control affordances. Decision 0013 supersedes
that historical limit for its nine named R1.6 supplemental affordance roots. The
pre-R1.6 allowed boundary was: `DatePicker`/`DateRangePicker` calendar
triggers; `Calendar`/`RangeCalendar` previous/next; `ComboBox`/`Select` and
`Tree` chevrons; `SearchField` clear; `NumberField` plus/minus; `Checkbox`
check/indeterminate; `TagGroup` remove; and `Dialog`/`Toast` close. Breadcrumb
separators remain text, and no Search icon is added. Mux UI owns all public
contracts. No Lucide export, type, name, prop, or import path is public; no
public Icon API, icon catalog, or icon package is added. Under that historical
baseline, no component or new decorative affordance was added.

The affected existing Scope IDs remain `committed`, with no new Scope IDs and
no commitment transitions: `SCOPE-COMP-CHECKBOX-REACT`,
`SCOPE-COMP-SEARCHFIELD-REACT`, `SCOPE-COMP-NUMBERFIELD-REACT`,
`SCOPE-COMP-DATEPICKER-REACT`, `SCOPE-COMP-DATERANGEPICKER-REACT`,
`SCOPE-COMP-CALENDAR-REACT`, `SCOPE-COMP-RANGECALENDAR-REACT`,
`SCOPE-COMP-COMBOBOX-REACT`, `SCOPE-COMP-SELECT-REACT`,
`SCOPE-COMP-TREE-REACT`, `SCOPE-COMP-TAGGROUP-REACT`,
`SCOPE-COMP-DIALOG-REACT`, and `SCOPE-COMP-TOAST-REACT`. The existing
`SCOPE-REACT-BREADTH-001`, `SCOPE-PRODUCT-REACT-PRERELEASE`,
`SCOPE-API-REACT-ERGONOMICS`, and `SCOPE-API-WEB-HOOKS`, plus related system,
platform, package, proof, and package-guidance records, retain their existing
states and boundaries. `SCOPE-COMP-BREADCRUMBS-REACT` is not affected; its
separators remain text. No other scope item changes.

Mux UI-owned labels, roles, states, relationships, keyboard behavior, and focus
remain the accessibility contract. These icons are decorative and
non-focusable unless an existing Mux UI binding explicitly requires another
semantic; an icon never supplies an undocumented accessible name. The package
license proof must retain both the Lucide ISC notice and the Feather-derived
MIT notice.

R1 proof must verify the exact dependency name/version/integrity, Lucide ISC
notice and Feather-derived MIT notice, React peer compatibility, internal-only
public-surface exclusion, accessible label/decorative semantics, SSR/hydration,
tree-shaking, and exact packed-consumer resolution. A dependency-version,
icon-mapping, geometry, or accessibility change invalidates the affected
visual contract comparison and requires the linked R1 visual, accessibility,
SSR/hydration, tree-shaking, and packed-consumer proof to be rerun.

This clarification has no React Native, `web.html`, or React Native Web
implication and changes no support, lifecycle, compatibility, release,
publication, or package-publication boundary. It authorizes no npm publication,
dist-tag mutation, Project or consumer/production mutation, or final R1-exit
pull-request merge.

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

The existing internal `lucide-react@1.37.0` edge may cover the nine R1.6
supplemental affordance roots `AlertDialog`, `CommandPalette`,
`HeaderNav`, `Lightbox`, `MultiSelect`, `PaymentInput`, `Sidebar`,
`TagSelect`, and `TextEditor`. R1.6 also admits `react-aria@3.51.0` for
`Resizable`'s `useMove`, `marked@13.0.3` behind the typed Markdown parser
boundary, and the eight `@tiptap/*@3.22.3` packages only inside
`TextEditor`. These are internal, replaceable implementation edges with
package, integrity, peer, lockfile, isolation, tree-shaking, SSR/hydration,
packed-consumer, and focused security proof obligations. Upstream editor,
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
