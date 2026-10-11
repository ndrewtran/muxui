# Decision 0031: React owns its API and CSS contract, and the unused renderer scaffolds are parked

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0031`
- Amends: the Architecture, Roadmap, and Product Scope passages listed under "Authority effect"
- Effective: on merge

## Gap

P2.1 publishes the catalog and tooling packages for the React tuple, including
each component's binding API. Whatever owns that API, and whatever the styling
contract says, becomes a compatibility promise there. Three parts of the
authority chain name an owner or a package the code does not have. Measured on
`main` at `576ee813`:

- **The binding spec cannot carry the API it owns.** The binding schema allows
  `api.props`, `api.events`, and `api.parts` as string arrays and `api.defaults`
  as an untyped object. It has no field for a type, an enum member, or a
  description. The 84 `web.react` bindings list 881 prop names between them and
  nothing about them. The types an agent needs live elsewhere: about 240 lines
  of TypeScript inside template literals in `packages/react/src/generate.mjs`,
  and 14 hand-written declaration files (739 lines), beside implementation in 50
  plain `.mjs` files. Button's seven variant names are written out
  independently in seven files outside the catalog: the component, the type
  template, the stylesheet, the Storybook factory, `lightbox.d.ts`, the Figma
  anatomy record, and the usage guide. #282 corrected that guide, which had
  documented a `secondary` variant and a `tone` prop that never existed. The
  corrected guide still restates the variant and size lists in prose, and
  nothing compares any of the 55 usage guides with the API. The docs API table
  has two columns, Prop and Default.
- **Three renderer packages describe a world the code does not have.**
  `@muxui/foundation` is 27 source lines. Its only consumer is
  `@muxui/react-native`, which calls it once to coerce `disabled` to a boolean.
  `@muxui/web` (415 `.mjs` lines) generates one Button fixture and nothing
  depends on it. `@muxui/react-native` (394 `.mjs` lines) has no component.
  `@muxui/react` depends on none of them. The catalog declares 11 `web.html`
  bindings and 1 `native.react-native` binding. Ten of the 11 web bindings have
  no example, CSS, or test behind them, the native binding declares one prop,
  and the one HTML example is Button's. All 84 `web.react` bindings carry the
  same six platform-safety dispositions, written in three spellings of the
  reason (70, 10, and 4 records). Architecture's picture draws a solid edge from
  foundation to React that the code does not have.
- **The public CSS contract is written for a package that ships nothing.**
  Architecture enumerates root classes, slot attributes, state attributes,
  custom properties, cascade layers, and style entry points under `@muxui/web`,
  and only that package's Button fixture and `compile-surface` implement them.
  `SCOPE-API-WEB-HOOKS` is committed. What `@muxui/react` ships is one
  `styles.css` of 22,754 lines and 811 KB (93 KB gzipped) with 679 distinct
  `.muxui-*` classes, 316 of them BEM (`__` elements or `--` modifiers) and 363
  plain hyphenated names; no `@layer`; and 296 `@scope` blocks, 207 `:where(`,
  and 117 `!important` managing specificity. States are styled on React Aria's
  own attribute names (`data-disabled` alone appears 590 times), although
  Architecture roots public styling hooks in `data-muxui-*`. React emits neither
  `data-muxui-slot` nor `data-muxui-state-*`, which `compile-surface` reports as
  the `web.react` surface. Button's two `instance`-policy tokens, the only ones
  in the token source, are assigned by the theme CSS and read by no rule, so
  setting `--muxui-component-button-background` on a Button does nothing.

## Decision

Part 1, React TypeScript owns the `web.react` binding API:

1. **One author for the API.** The props type of each exported `@muxui/react`
   component, in TypeScript source, is the only author of that component's Mux
   UI props, their types, enum members, defaults, descriptions, and event props.
   Host passthrough (props inherited from a named profile such as `html.button`),
   refs, generics, and overloads stay in the same source and out of the catalog,
   as Architecture already says.
2. **The source moves in tranches.** `@muxui/react` moves to TypeScript with a
   build step that emits the package's JavaScript and its declaration files from
   that source. The move is one tranche of components per pull request. The
   first pull request also adds the build and the extraction in item 3, and
   tooling that reads React source by file extension moves with it. The
   generator's template-literal types and the hand-written declaration files
   retire per moved component, and a component is never half moved.
3. **The catalog block is derived.** At generation time an extraction step reads
   the compiled types and writes the binding's `api` block: each Mux UI-owned
   prop with its type, enum members, required flag, default, and description,
   and its events. The block is a projection: never authored, never edited, and
   kept outside `catalog/`. It enters `specRevision` like any API field and
   stays out of `contentRevision` because it is not authored, so the semantic
   diff still classifies removing a prop as incompatible. `api.parts` already
   equals the concept `anatomy` in all 84 records, so parts stay with the
   concept record and are not extracted.
   - **Defaults come from executable source.** Compiled types cannot carry a
     default: `size?: 'sm' | 'md' | 'lg'` is the same type whether Button
     defaults to `md` or `lg`. The extraction therefore reads a default only
     from the value the component executes, a destructuring default in its props
     parameter or a named defaults constant that the component itself reads. A
     default it cannot resolve to a static value fails extraction. The runtime
     default observers stay as in item 5.
   - **Derivation is conditional on a closed grammar.** The pull request that
     first adds the extraction (the first tranche's pull request may be that
     pull request) must establish, with tests, before any authored block is
     deleted: the closed type grammar; how callback types for event props are
     represented; an exact allowlist of host references, such as
     `React.ReactNode`; recursive rejection of any dependency type reachable from
     a prop's type, naming the prop; and which part of a referenced Mux UI-owned
     named type's definition is recorded and enters `specRevision`, so a change
     inside the definition changes the revision and not only the type's name.
     Until those exist, no component moves and every authored block stays
     canonical.
4. **What `artifact.json` keeps.** On the concept record: identity, intent,
   anatomy, states, accessibility obligations, relations, and lifecycle. On each
   binding record: lifecycle, strategy, behavior, accessibility fulfillment and
   deviations, token recipe, platform-safety overrides, and example relations.
   The catalog is still the canonical component inventory: a component exists
   because its record does, and generation still fails on a record or an export
   that the fixed registry and the supplemental mapping do not account for.
   "React is not the canonical component inventory" stays true. Only one
   binding's API shape is derived from that binding's implementation, which
   Architecture already says differs per platform.
5. **Transition.** Until a component has moved, its authored `api` block stays
   canonical and its existing conformance tests apply. The pull request that
   moves a component deletes its authored block and adds the derivation, so no
   component has two owners at any commit. A moved component's derived block
   must equal what is published: the packed-consumer check parses the tarball's
   declarations and compares names, types, enum members, and required flags
   with the block. That check never proves defaults. The existing runtime
   default observers (the render and behaviour comparisons in
   `packages/react/test/fixture.test.mjs`, with their check that every default
   has an observer) stay, re-pointed at the derived block, and a derived default
   that differs from what the component renders or does fails them. They are
   removed only when a named successor that checks executed defaults replaces
   them.
6. **Guides do not restate unchecked API facts.** A guide states no prop,
   variant, enum member, default, event, or import path in prose unless a check
   compares it with the API block. Otherwise it links to the generated
   reference. The Button usage guide's variant and size lists are removed or
   checked in the pull request that moves Button, and nothing newly written
   restates one.
7. **Later renderers.** A renderer that activates later states in its
   activation decision whether its API is derived from its own source or
   authored in its binding spec. No fact has two owners either way.

Part 2, the unused renderer scaffolds are parked:

8. **Park three packages.** `@muxui/foundation`, `@muxui/web`, and
   `@muxui/react-native` leave the workspace in a later implementation pull
   request, with their tests, policy routing entries, and fixtures. Until that
   pull request lands they remain private scaffolds that claim nothing. Their
   intended design moves into a short "Deferred renderer tracks" section of
   Architecture. After removal, W1.0 restores `@muxui/web` and N1.0 restores
   `@muxui/react-native`. `@muxui/foundation` returns only with an activation
   that names shared code and its two real consumers, the Roadmap's existing
   shared-code guardrail. Nothing depends on the three: `@muxui/react` has no
   workspace runtime dependency, `@muxui/foundation` is used only by
   `@muxui/react-native`, and nothing uses `@muxui/web` or
   `@muxui/react-native`.
9. **Honest bindings.** The schema keeps its platform vocabulary. The 11
   `web.html` bindings and the 1 `native.react-native` binding become
   `strategy: "unsupported"` with a reason, which Architecture already
   prescribes for a binding without a responsible implementation. The one HTML
   example, `button-basic-html`, leaves with its binding. An unsupported
   disposition claims no support and is not proof.
10. **Platform safety by default.** `strategy/platform-safety-contract.json`
    gains a default disposition set for each implemented binding kind and
    nested runtime profile, and one for an unsupported binding (all six
    `not-applicable`). A binding states a platform-safety entry only to
    override a default, with a reason, and never restates one. The 84
    `web.react` blocks collapse to the default.
11. **The picture.** Architecture's one picture is redrawn with the edges the
    code has: tokens to React, React source through API extraction into the
    catalog compiler, the catalog into the packed React package, and the later
    tracks as one dotted node with no support claim.
12. **Unaffected.** `@muxui/tokens`, including its native theme transform as the
    retained N1 input, and every tool `@muxui/react` or the Figma generator
    uses.
13. **No lost check.** The web package's contract-checking role moves to Part 3.
    The pull request that removes `@muxui/web` moves its surface compiler and its
    example-topology test into `@muxui/react` tests, adapted to the React
    binding, in the same change, so the check never lapses.

Part 3, React owns its public CSS contract, in three stages:

14. **The contract.** Architecture's `@muxui/react` section enumerates it:
    cascade layers, root and part classes in one scheme, a closed documented set
    of Mux-owned state attributes, public custom properties, and style entry
    points. The text moves there from the `@muxui/web` section. Slot attributes
    (`data-muxui-slot`) and DOM events belong to the `web.html` contract and
    return with W1.0. React publishes neither today, and this decision adds
    neither.
15. **Stage 1, layers and honest hooks.** All Mux UI CSS moves into the layers
    `muxui.tokens`, `muxui.components`, and `muxui.utilities`, in that order,
    which are the names and order the web fixture and its surface compiler
    already declare. The rule that decides the `instance` hooks: a token keeps
    the `instance` policy only while the component's CSS reads the property and a
    test shows that setting it on a rendered instance changes the computed
    style. The default is to drop. A hook is made real only where the
    component's record or guide states a consumer need that a theme assignment
    cannot meet, and otherwise its token changes to the `theme` policy. The
    stage applies the rule to both Button hooks, under the token contract proof.
16. **Stage 2, one scheme and Mux-owned state.** One class naming scheme covers
    every family, fixed and supplemental. The public classes are the root class
    and the part classes the concept record's `anatomy` names, so the list is
    derived from the catalog, and every other class is internal. The state
    attributes are a closed set documented in one Mux-owned list, rooted in
    `data-muxui-`, and set by a thin adapter over React Aria render props. No
    stylesheet selector or example uses a substrate attribute afterwards, so a
    substrate swap changes the adapter, not the stylesheet. The stage names the
    spelling (`data-muxui-state-<name>` is the default, because
    `compile-surface` already encodes it) and the separators of the class
    scheme.
17. **Stage 3, split entries.** The stylesheet splits into at least a core
    entry, a supplemental entry, and an editor entry that holds the rich-text
    editor and Markdown styles, so an ordinary consumer loads none of them. Each
    family sits in exactly one entry, derived from the supplemental mapping and
    not listed in prose. The theme stylesheet stays separate, and splitting its
    60 presets is not part of this decision.
18. **Announcing renames.** Pre-release renames and removals land outright under
    Decision 0016, with no alias, codemod, notice window, or retained old
    spelling. The pull request that makes them is the announcement of record: its
    description lists every renamed or removed class, attribute, and property as
    old to new, and it updates every in-repo consumer (Storybook, docs, Scale,
    Figma measurement, tests) in the same change. The next rc's generated styling
    guidance documents the current contract only. The rc sequence is the version
    signal, and a `next` consumer already accepts breaking changes between rcs
    with no support claim.
19. **Proof.** A test in `@muxui/react` renders the exported components and
    checks the published surface. Every declared public class and state
    attribute is emitted in its applicable fixtures and has CSS coverage, every
    public custom property is read and changes computed style in a browser, the
    layers and style entries exist, and canonical examples rely on no internal
    hook. Internal classes and substrate attributes may be emitted; they are
    simply not part of the contract. The test adapts `compile-surface` and the
    example-topology test and replaces them.
20. **Order.** The intended order is the parking pull request (moving the surface
    check first), Stage 1, the TypeScript move tranche by tranche, Stages 2 and
    3, then the public package graph for P2.1. It is not a gate. Stages 1 and 2
    and the API derivation are meant to land before P2.1 accepts the package
    graph, because that is when both contracts become a compatibility promise.
    Each step is an ordinary protected pull request (Decision 0028), except an
    edit to `strategy/platform-safety-contract.json`, which is an authority file
    and carries an `Authority change record` naming this decision.

## Authority effect

- **Architecture** changes in the same pull request. The binding-spec wording,
  "One owner per fact", and the invariants say that `web.react` API facts have
  one author, the component's TypeScript props type, and that the catalog block
  is derived, conditional on the extraction grammar of item 3, with the
  transition rule and the runtime default observers of item 5. The `@muxui/foundation`,
  `@muxui/web`, and `@muxui/react-native` sections become one "Deferred renderer
  tracks" section. The `@muxui/react` section takes the public CSS contract, its
  compatibility table, its proof, and its staged adoption. The one picture, the
  public package graph, the package table, the repository layout, and the sample
  component record are corrected to the real record shape and the derived API.
  Platform-safety wording moves to defaults and overrides.
- **The Roadmap** says that W1.0 and N1.0 activation also restore their package,
  rewrites the shared-code guardrail and the foundation traceability row, routes
  the G2.6 `binding.variant.add` operation to the component's canonical API
  owner (React TypeScript source once the component moves, the authored binding
  `api` block until then), so no operation edits the derived block, and names
  the Decision 0031 work as ordinary post-R1.6 React delivery. P2.1's
  entry, "accepted public package graph", stays. No evidence ID is added,
  removed, or weakened.
- **Product Scope** takes a major version, `21.0.0`, under its own rule: "Add,
  remove, replace, or materially redefine a committed outcome, platform, release
  boundary, package, public surface, or non-goal". It also lists "the public
  ownership model" and "the package graph" as commitment changes. The
  transitions:
  - `SCOPE-PKG-FOUNDATION` goes from `committed` to `deferred`. `SCOPE-PKG-WEB`
    and `SCOPE-PKG-REACT-NATIVE` stay `deferred` and say that their packages
    return only with W1.0 and N1.0. `SCOPE-PKG-REACT` takes the API and the
    CSS contract.
  - `SCOPE-API-WEB-HOOKS` goes from `committed` to `deferred` and narrows to the
    framework-free `web.html` hooks. Its React successor is the new committed
    `SCOPE-API-REACT-CSS`, the same split Product Scope already made for
    `SCOPE-SYSTEM-WEB`.
  - `SCOPE-API-BINDING`, `SCOPE-API-REACT-ERGONOMICS`,
    `SCOPE-PROOF-CONFORMANCE`, and `SCOPE-THEME-PLATFORM-SAFETY` are restated
    for derived API ownership, executed defaults, the declarations the build
    emits, and platform-safety defaults. `SCOPE-PROPOSAL-VARIANT` keeps its ID
    and `admitted` state and names the component's canonical API owner as its
    owner.
  - No Scope ID is renumbered, reused, or removed.
  - Release additions and removals: none. Nothing was published, so no release
    scope loses a package. Evidence effect: none. Open tracker work: one issue
    per step in item 20, which this change does not create.
- **`AGENTS.md` route maps.** The root `AGENTS.md` names no parked package and
  is unchanged. `packages/react/AGENTS.md` names `@muxui/web` only to say React
  does not import it, which stays true. It is not edited here, because a change
  under `packages/react/` plans the React and browser check groups for a prose
  edit, and the parking pull request updates it. The three parked packages' own
  `AGENTS.md` files go with the packages.
- **Not edited here:** `strategy/platform-safety-contract.json` (adding defaults
  changes its digest, and with it every platform-safety requirement-set digest
  and the evidence inputs that read the file, so the implementation pull request
  owns it), packages, the catalog, tests, generated output, evidence, and
  workflows. Until the registry carries defaults, each binding's authored
  declaration stays valid and equals the default. Retained rc evidence keeps the
  digests it was captured with, and the next rc carries the new ones.

This is a real commitment change under Decision 0028 item 5, not routine growth:
it changes a committed package and the public ownership model. Andrew's choices
below satisfy the Decision 0028 item 6 stops for a Product Scope commitment and
an Architecture invariant. Decision 0010 (the substrate), Decision 0016 (applied
to the renames), Decisions 0022 and 0023 (the non-claims and the rc sequence),
and Decisions 0026 and 0029 (React-only blocks) stay as written.

## Non-goals and preserved stops

This decision publishes no package, creates no tag, changes no dist-tag, and
leaves `latest` where it is. It claims no stable, support, or
assistive-technology property and changes no R1 exit evidence, release
candidate, or final-merge stop. It activates neither W1 nor N1 and writes no
Figma file. It does not change the `foundation` artifact kind, the schema's
platform vocabulary, token values, the `@muxui/react` dependency rules, React
Aria's role as an internal replaceable substrate, or the split of `themes.css`.
It implements nothing: parking, the build, the extraction, and the three CSS
stages are separate pull requests, and none of them is a stop beyond the ones
Decision 0028 already names.

## Reversal

A successor decision may restore any part, and each part reverses on its own.
Parked packages return from git history by an accepted activation. The derived
API block is a full serialization of the authored one, so an authored block can
be written back for a component without loss. The CSS contract can return to
`web.html` by the W1.0 activation. Retained evidence is unaffected: a capture
made before this decision verifies against the binding it was made with.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 11 October 2026

Andrew's choices, in his words, each given as the recommended option of its
question:

- "Who should own each component's API (props, types, allowed values, defaults)?" answered "React TypeScript (Recommended)"
- "What should happen to the empty foundation, web and react-native packages that @muxui/react doesn't use?" answered "Park them (Recommended)"
- "Where should the public CSS contract (classes, state attributes, custom properties, layers) live?" answered "React owns it, staged (Recommended)"

The options he did not choose: for the API, the catalog owning it through a typed
grammar, or keeping names and defaults only with checks on guides; for the
packages, keeping them with corrected claims, or keeping them as they are; for
the CSS contract, documenting today's React surface with `@layer` and no
renames, or leaving the contract on `@muxui/web` until W1.0.

This record does not claim that any check passed, that a pull request was opened
or merged, that the repository has adopted the decision, that any implementation
step was done, or that any package, release candidate, or dist-tag changed.
