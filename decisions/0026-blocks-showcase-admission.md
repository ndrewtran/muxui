# Decision 0026: Blocks showcase admission

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0026`
- Authority: accepted [Architecture](../strategy/monorepo-architecture.md),
  [Roadmap](../strategy/milestone-roadmap.md), and
  [Product Scope](../strategy/product-scope.md)
- Accepted request: [acceptance record](./0026-blocks-showcase-admission-acceptance.md)

Andrew accepted this decision with the choices in the acceptance record.
Repository adoption remains subject to the protected pull-request process, and
implementation starts only after this authority change merges. This record does
not claim implementation, proof completion, or package release.

## Context

Andrew wants a showcase and copy-and-paste code resource for components and for
blocks, reusable compositions of components, in the style of Tailwind Plus UI
Blocks or beui.dev blocks. Component documentation shows core usage only, so
the poster grid composition was cut from the GridList and Virtualizer guides.

Today a composition has no honest home. An ExampleRecord binds to exactly one
component binding, so a composition would be attributed to one participant. A
guide is prose, so its participants would be unenforced. `SCOPE-KIND-PATTERN`
is committed for exactly this job but unbuilt: `ArtifactRef` reserves
`pattern`, there is no pattern schema or `catalog/patterns/` source, and the
schema package does not list `pattern` as an enabled record kind. A blocks
showcase is the first observed consumer of that committed kind.

R1 exit is complete: `E-R1-EXIT-01` to `E-R1-EXIT-04` are retained as passing
under `tests/evidence/r1-exit`.

## Decision

1. **Naming.** "Block" is the public product name for a `pattern` artifact.
   No `block` kind, ID prefix, schema, relation, or CLI alias is added. A block
   is `muxui:pattern:<slug>`, listed by `muxui list pattern`, and shown under
   `/blocks` on the private site.

2. **Pattern v1 for the showcase.** This slice delivers the first `pattern`
   schema and compiler support, with every record `experimental`. A record
   requires:
   - identity, name, summary, lifecycle, and keywords;
   - a category from a closed enum in two groups. Application: Collections,
     Forms, Feedback, Conversation, Navigation. Marketing: Hero, Features,
     Pricing, Call to action, Testimonials, FAQ, Stats, Logo cloud, Newsletter,
     Footer. The group is derived from the category, never authored. Adding a
     category needs a decision and is a schema change under the schema-evolution
     rules;
   - intent (`useWhen`, `avoidWhen`) and `platforms` (`web.react` only);
   - `participants`, each a role name, a component `ArtifactRef`, and
     `required` or `optional`;
   - `variants` (item 3);
   - accessibility notes and unsupported cases.

   Composition relations, invariants, and the closed parameter schema exist in
   the schema but are optional in this slice. The compiler validates whatever a
   record declares. The G2.4 planner will require them before it uses a
   pattern, and it never selects a pattern that omits them. Pitfall and
   alternative references, decision context, and preconditions are not part of
   this delivery and later arrive as optional fields. Architecture records
   this as a clarification of the v1 field list that narrows nothing else.
   `list`, `search`, and `get` gain the `pattern` kind. `plan` stays
   unavailable.

3. **Examples can belong to a pattern.**
   - Each variant is exactly one ExampleRecord, listed once in the pattern's
     `variants` in authored order. An ExampleRecord has exactly one owner, a
     component binding or a pattern variant, and a variant example carries no
     component `binding`.
   - A variant's `example-of` edge targets the pattern. It is derived from
     that listing, always `normative`, and the example's record and source
     bytes enter the pattern revision closure. The relation registry's
     `example-of` target set gains `pattern`; no relation type is added.
   - Component pages list only examples bound to that component. A pattern
     page lists its variants. "Used in blocks" on a component page is derived
     by the catalog query engine from participant references, so the CLI and
     the site return the same view.
   - Compiler negative paths:
     - a participant that does not resolve to an existing component with a
       `web.react` binding;
     - a variant example that imports a Mux component the pattern does not
       declare as a participant, a narrow structural check over system-owned
       examples that Architecture's pattern section already allows;
     - a missing variant example, or one listed twice or owned by a second
       pattern or binding;
     - a pattern with no variants.

     The closed schema also rejects an unknown field and a category outside
     the enum.

4. **Showcase surface.** A Blocks section in the existing `apps/docs` Astro
   project, with its own full-width layout. Starlight keeps the component docs.
   - It is a projection and a catalog client over pattern records and variant
     examples, using the same query responses as the CLI. It owns no block,
     pattern, example, search, filter, or prose fact. Narrative rationale
     belongs in a related `GuideRecord` that the CLI also returns, so no
     web-only guide appears.
   - Layout: Andrew picked the master-detail mock on 2026-10-07. A left rail
     holds category, block, and variant, search, and a "uses component" filter.
     One large preview sits beside it, with width presets, a drag handle, a
     theme switch, and Preview, Code, and Split views. The Code view shows the
     exact variant example source with copy. Rail search and the filter are
     answered by the catalog query engine over pattern records and participant
     references, so the CLI returns the same results. Layout detail beyond this
     is a projection choice, not authority.
   - The preview is isolated, loads the canonical executable example, never a
     copy, and runs repository-owned example code only. The section collects no
     analytics or consumer data.
   - The docs site stays unpublished. Any public deployment is a separate
     authorization by Andrew.

5. **Distribution.** Copy and paste only. `muxui get` on a pattern returns the
   same exact variant example source that the Code view shows and copies. An
   install command, registry, or consumer scaffold stays deferred under
   `SCOPE-CAP-CONSUMER-PATTERN` (G3.11), and project writes under
   `SCOPE-CMD-INIT` (G2.5). A block registry owned by the site would breach
   `SCOPE-NONGOAL-003`. Surface parity holds between the CLI and the site for
   pattern data.

6. **Block scope boundary.** A block is a bounded composition of admitted Mux
   components with enforceable participants, in one of two groups: bounded
   application compositions (for example collection grids, settings forms, and
   table toolbars) and bounded marketing page sections with placeholder copy
   (for example hero, pricing, and feature sections). Full page templates,
   journeys, and flows stay excluded under Architecture's v1 exclusion of
   page-archetype, journey, and flow kinds, and are revisited only through G3.8.
   - **Bounded-section test.** A block covers one page region, has no routing,
     no business state, and no data fetching, and is composed only of admitted
     Mux components plus plain layout markup (`section`, `div`, headings, and
     lists styled with semantic tokens). Routing means a router, route state, or
     navigation logic; a link is a placeholder `href`. Interactive controls hold
     only local presentation state, such as a billing-period toggle, and a form
     never submits, fetches, or persists. Anything that needs a new reusable
     component waits for that component's own family admission. A block never
     introduces one implicitly.
   - **Demonstration material.** Block placeholder copy and imagery are
     demonstration material, not Mux UI product truth. Product Scope records
     this on `SCOPE-NONGOAL-008`.
   - **Content rules.**
     - Placeholder copy is generic and Mux-authored.
     - Imagery is Mux-authored SVG or CSS, or an asset with a recorded license
       and disclosure, kept beside the asset in the pattern's source directory.
     - No third-party brand logos or marks. Logo clouds use generic marks.
     - No real people's names or likenesses.
   - Conversation and composer blocks are in boundary but wait for their
     components (item 8).

7. **Sequencing.** Roadmap gains one separately named slice, `BL1` "Blocks
   showcase", that may start now once this change merges. Its entry condition is
   R1 exit, which is complete. It satisfies and claims none of P2.3 exit, G2.4,
   or `SCOPE-CMD-PLAN`, and no P2.x milestone depends on it.
   - Name: the Roadmap names tracks with a letter and a number (R1, P2, W1, N1,
     X1, S1). `BL1` follows that form with one slice and no decimals, and `1`
     leaves room for a later `BL2` without a rename. `B1` is avoided because
     Decision 0018 already uses B-numbers for Bento backlog items.
   - It serves the React renderer by exercising admitted components in
     composition. Variant examples are its acceptance fixtures, and the poster
     grid is the fixture for GridList grid layout and Virtualizer grid mode, so
     it is not unattached infrastructure under the Roadmap's renderer-first
     rule.

8. **Seed blocks.**
   - First, the poster grid (Collections), with a CSS-grid variant (GridList
     `layout="grid"`) and a virtualized variant (Virtualizer grid). Its variants
     wait for the GridList grid layout and Virtualizer grid mode work in review
     on branch `feat/grid-list-grid-virtualization` to merge.
     `SCOPE-COMP-GRIDLIST-REACT` and `SCOPE-COMP-VIRTUALIZER-REACT` remain the
     owners of that work; BL1 adds nothing to them.
   - Then two marketing sections that need only admitted components, so neither
     waits for the grid work:
     - a hero (Hero) from `Text`, `Button`, and `Link`, with plain layout
       markup;
     - a pricing section (Pricing) from `Card`, `Text`, `Button`, and
       `Separator`, with plain layout markup, and optionally `ToggleButtonGroup`
       for a billing-period toggle.
   - Optionally one further application block, named in the BL1 activation
     packet, that uses only admitted components.
   - Agentic compositions (message thread, prompt composer) come only after
     their components are admitted and merged under the separate effort
     proposing Decisions 0024 and 0025, which are not on `main`. That is a
     dependency, not scope here.
   - **Growth.** Further blocks inside the item 6 boundary that use admitted
     components and existing categories are ordinary protected-PR delivery under
     BL1. Each carries `E-BL1-03` to `E-BL1-08` for its variants and
     `E-BL1-10` for its content, and needs no further decision. `E-BL1-11`
     keeps the `SCOPE-NONGOAL-012` workflow-value requirement and the catalog
     search and dense budget regression report. A new category, an unadmitted
     component, or a boundary change still needs a decision. Blocks inside this
     boundary are therefore delivered under BL1 outside G3.1, and all other
     component and pattern breadth stays with `SCOPE-CAP-BREADTH` and G3.1.

9. **Evidence.** Roadmap BL1 records `E-BL1-01` to `E-BL1-11`:
   - pattern schema validation and the negative compiler fixtures, plus pattern
     authoring support;
   - every variant example typechecks against the packed `@muxui/react`
     declarations, passes packed SSR and hydration, and passes light and dark
     axe and colour audits through generated Storybook stories, with browser
     behavior checks when the block is interactive;
   - showcase pages pass the docs check, and the Code view equals the example
     source bytes;
   - visual evidence at the width presets in light and dark, and for marketing
     blocks at every page-width preset with no horizontal overflow;
   - CLI and site surface parity for pattern data;
   - generation identity;
   - a boundary audit;
   - a content-rules check: no external assets or brand marks, no literal colour
     values, and a license and disclosure record for every asset that is not
     Mux-authored;
   - the catalog regression report and workflow value that growth requires.

   No assistive-technology support claim is made, and Decision 0022 still
   applies: manual and assistive-technology review of a block's interactive
   behavior is deferred with its participants' deferral to `S1.0`. Every
   existing automated accessibility check stays required.

10. **Versions and release.** Schema contract: minor (a capability-gated
    record kind and a relaxed `example-of` target, per
    `packages/schema/schemas/schema-evolution.json`). Catalog: minor (new
    patterns and examples). `@muxui/catalog` and `@muxui/tooling`: minor where
    their public surface grows with the kind. No `@muxui/react` API, export, or
    version change. If a list, search, or get response needs a new member, the
    query API takes an additive minor under the current-version-only rule of
    Decision 0016. Packages stay private. No publish, dist-tag, `latest`, or
    deployment change follows from this decision. Product Scope takes major
    `15.0.0` (see Authority effect).

11. **Tracker.** A Delivery Project item and issue are needed and are not
    created by this change. Two are expected: a `decision` item to carry the
    `Authority change record: #...` line that the planning-PR validator
    requires for this change, and a `milestone` item for BL1. The BL1 item
    carries the Product Scope tracker reference contract:

    ```text
    Scope ID(s): SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE, SCOPE-KIND-PATTERN,
      SCOPE-GUIDE-COMPOSITION, SCOPE-SURFACE-API, SCOPE-SURFACE-CLI,
      SCOPE-SURFACE-SITE, SCOPE-CMD-LIST, SCOPE-CMD-SEARCH, SCOPE-CMD-GET,
      SCOPE-CAP-BREADTH, SCOPE-NONGOAL-008, SCOPE-NONGOAL-012,
      SCOPE-PROOF-SCHEMA, SCOPE-PROOF-BEHAVIOR, SCOPE-PROOF-VISUAL,
      SCOPE-PROOF-PACKAGE, SCOPE-PROOF-PARITY, SCOPE-PROOF-GENERATION
    Roadmap milestone: BL1
    Architecture requirements: Patterns are bounded composition specifications;
      One owner per fact; Ontology growth has a budget; Website and static
      agent context; Maintainer authoring workflow; Schema evolution and
      extensions; V1 product boundaries
    Evidence ID(s): E-BL1-01 through E-BL1-11
    Dependencies: R1 exit (complete); Decision 0026 and Product Scope 15.0.0
      merged; GridList grid layout and Virtualizer grid mode merged (poster
      grid only)
    Deliverables: the BL1 deliverables in the Roadmap
    Acceptance commands: pnpm check --package @muxui/schema, @muxui/catalog,
      @muxui/tooling, @muxui/docs, and @muxui/react-storybook; pnpm check
      --files <exact task files>; pnpm generate:check
    Explicit non-goals: the BL1 scope controls in the Roadmap
    Pull request or change record: Decision 0026
    ```

## Ontology budget

No artifact kind is added, because `pattern` is already committed. Extending
the `example-of` target set is a durable-relation change, so this decision
meets Architecture's "Ontology growth has a budget" and the Roadmap's scope
admission list:

- **Observed workflow:** showcasing and copying a composition of several
  components, which no existing record expresses. A component example binds one
  binding. A guide cannot enforce participants, and Architecture keeps
  machine-enforced constraints in typed fields.
- **Owner:** the `PatternRecord`, whose `variants` list owns membership and
  order.
- **Consumers:** the Blocks section, the CLI and query API, and later the G2.4
  planner.
- **Query shape:** `list`, `search`, and `get` over `pattern`, plus the derived
  participant and "used in" views and the participant filter.
- **Validation and proof:** `E-BL1-01` to `E-BL1-11`.
- **Compatibility and migration:** schema and catalog minor. No source needs
  migration, and the existing component examples stay valid.
- **Authoring workflow:** scaffold, semantic diff, revision explainer,
  affected closure, and source-linked diagnostics for patterns (`E-BL1-02`),
  as the Architecture invariant on authoring support requires.
- **Removal:** see Reversal.

## Authority effect

The same change amends:

- **Architecture:** the controlled vocabulary gains "Block"; "Patterns are
  bounded composition specifications" gains the staged v1 fields, variant
  ownership, and the bounded-block test with its content rules; "Website and
  static agent context" gains the Blocks projection.
- **Roadmap:** the BL1 section, a Later tracks entry, the milestone register,
  the dependency map and its diagram, one traceability row, and a G3.1 scope
  control for blocks delivered under BL1.
- **Product Scope:** `scopeVersion` `15.0.0` with its changelog paragraph, the
  new `SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE` row, the `SCOPE-KIND-PATTERN` delivery
  reference, the demonstration-material statement on `SCOPE-NONGOAL-008`, the
  revised `SCOPE-CAP-BREADTH` row, the Roadmap alignment row, a Productization
  boundary note, and the 15.0.0 section with the change-control record.

Product Scope takes a major version, `15.0.0`. Change control makes redefining
a non-goal major, and the statement on `SCOPE-NONGOAL-008` gives block
demonstration content a reading the non-goal did not state before. That is
arguably a clarification, but it cannot be shown to leave the non-goal's
meaning unchanged, so this decision takes the conservative route. The
`admitted` item alone would have been minor.

The showcase is outside the React `0.1` and Productization boundaries and
satisfies none of their rows. It does not claim `SCOPE-PRODUCT-003`,
`SCOPE-SURFACE-EXPLORER-WEB`, `SCOPE-PRODUCT-004`, `SCOPE-CMD-PLAN`, or
`SCOPE-CAP-CONSUMER-PATTERN`, and it makes no consumer-code validation claim.
`SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE` stays `admitted`, private and unpublished.
All existing Roadmap non-waivable rules and Architecture invariants stand:
generated output is never patched, the website is not the documentation
source, and no fact has two authoring owners.

## Non-goals and preserved stops

This decision does not:

- change `@muxui/react` or add a component, family, token, or dependency;
- publish a package, change a dist-tag or `latest`, or deploy the docs site;
- add an install command, registry, consumer scaffold, `plan`, or consumer
  validation;
- add non-React (`web.html`, native) blocks, page templates, journeys, or flows;
- admit an agentic component, or accept evidence, mark a milestone ready or
  complete, or authorize the final R1-exit merge;
- create a tracker item, update the Delivery Project, or open a pull request.

## Reversal

Before publication, delete the pattern records, the Blocks section, and the
pattern kind's compiler, query, and authoring support, then revert this
decision's amendments to Architecture, Roadmap, and Product Scope. No
`@muxui/react` change or published artifact is involved, and the example
sources hold no canonical state beyond the pattern records. After a public
deployment, removal needs a successor decision. Historical authority and
acceptance records are not rewritten.
