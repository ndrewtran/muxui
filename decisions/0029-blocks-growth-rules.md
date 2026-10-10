# Decision 0029: Blocks grow in ordinary pull requests

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0029`
- Supersedes wholly: Decision 0026 amendments 01 and 02
- Supersedes in part: Decision 0026 items 2, 6, 8, 9, and 10 and its non-goals
- Effective: on merge

## Gap

Decision 0026 let a block join an existing category in an ordinary pull request,
and then gated that growth with lists and one-off exceptions that Mux UI
development does not need.

- **A closed category list.** Adding a category needed a decision, although a
  category is catalog data and the group is derived from it. Decision 0028 removed
  the same kind of definitive list for components.
- **A block could not carry the component it needs.** A block that needed a new
  component waited for that component's own admission, and the evidence refused a
  growth commit that touched `@muxui/react`, a dependency, a component record, or
  the catalog digest. A block and the component fix it needs could not ship in one
  pull request.
- **Thresholds could not move.** Search expectations, the precision floor, the
  displacement limit, and the dense budgets were "fixed before measurement", and
  revising any of them needed a decision, apart from one exception for
  category-name queries that Decision 0026 amendment 02 carved out when a second
  block joined a category. The variant source size limit was a number a test
  repeated by hand.
- **Page widths lived in decision text.** Decision 0026 amendment 01 fixed five
  widths in prose, the capture parsed that prose, and an integrity test compared it
  with the code that owns the list.
- **One edit re-reviewed every block.** A capture required one independent content
  review of the whole `catalog/patterns` tree, so editing one block meant reviewing
  all of them again.
- **A release candidate would fail every later capture.** The registry check
  compared npm with the R1 exit read-back and the version check compared the pre-BL1
  base with the head, so the first release candidate after the close-out would have
  failed every growth capture for a change no block made.

The clearest case parallels Decision 0028: a fixed list of block categories, and a
rule that a block must not carry its own component fix, have no place while Mux UI
is under development.

## Decision

1. **Categories are catalog data.** A block's category, and the group derived from
   it, are ordinary catalog data. Adding or renaming a category is an ordinary pull
   request and needs no decision. The companion change moves the list out of the
   schema into catalog data; until it lands, the schema's list is the owner and
   adding a category is a schema change under the schema-evolution rules.
2. **Blocks and the component work they need ship in ordinary pull requests.** A
   block may ship in the same pull request as the `@muxui/react` change, component,
   family, token, or dependency it needs. The component change carries the proof its
   own risk calls for (Decision 0028), and the pull request names the component and
   that proof; a block never introduces a component implicitly. A boundary change
   still needs a decision: a page template, journey, or flow; routing, data
   fetching, or business state in a block; a non-React block; or a public
   deployment, an install or registry command, or a consumer scaffold.
3. **Search expectations, limits, and budgets are settings changed in a reviewed
   pull request.** They live in `tests/evidence/bl1/regression-thresholds.json`:
   every discovery query and its expectation, the precision floor, the displacement
   limit, the dense budgets, and the variant source size limit. The tests derive
   their numbers from that file. A pull request may change any of them when it:
   - states the change and its reason in its description before the change is
     measured, and logs it in the file's `provenance.revisions` (the query or value,
     what changed, and why);
   - keeps an expectation on every query and records a remaining weakness as a
     `knownWeakness`; an expectation is never removed; and
   - lists an expectation changed after its result was seen in
     `provenance.revisedAfterFirstMeasurement`, so every claim counts it.

   A threshold is never changed to turn a failing result into a passing one: when a
   block fails an expectation it wrote, the block changes. The capture lists every
   change since the retained close-out and refuses a change that is not on the log,
   and a change since the capture it replaces that has no new log entry, so an old
   entry for a query does not cover a later revision of it. The integrity test holds
   the working tree to the same rule on every pull request. The log and
   `revisedAfterFirstMeasurement` only grow.
4. **Page widths live only in code.** The page widths at which a marketing variant
   is captured are the `pageWidths` list in `apps/docs/src/lib/block-presets.ts`,
   beside the toolbar presets. The capture records the list and the file's blob at
   its source revision. No decision, capture step, or test reads decision text for
   them, and changing the list is an ordinary pull request.
5. **Evidence for later blocks.** A block added after the close-out still carries
   `E-BL1-03` through `E-BL1-08`, `E-BL1-10`, and `E-BL1-11`. Its capture:
   - claims generation identity, two byte-identical compiles, and that the pattern
     entries add only their own artifacts to the catalog (`E-BL1-08`);
   - gates the boundary checks of `E-BL1-09`: no growth commit changes a workflow, a
     hosting or deployment file, an Astro deployment setting, or a package version;
     every package stays private with no publish configuration or script; the
     registry still lists what the R1 exit published, with a later release
     candidate listed and not claimed; no assistive-technology support claim is
     made; `plan`, install, registry, and consumer scaffold stay unavailable; and
     every pattern targets `web.react` only; and
   - records, without gating on them, what each growth commit changed in
     `@muxui/react`, in dependencies and the lockfile, in the stylesheet's class
     and custom property names, and in the component, token, capability, and React
     family records, and the catalog digest before and after it. A growth commit may
     change them; the record claims nothing about the change, and the change
     carries its own proof in its own pull request. The capture marks this with
     `growthGate: 'informational'` and states the non-claim in `E-BL1-08` and
     `E-BL1-09`.

   The `E-BL1-09` assertion that `@muxui/react` has no API, export, or version
   change describes the close-out and stays with it.
6. **Content review is reused for unchanged copy.** A retained independent review
   covers each block whose `catalog/patterns/<slug>` git tree it read. A capture
   records which review covers each block and keeps that review's own reviewed
   revision and tree. It needs a new independent review only for a block whose tree
   matches no retained review, that is, a new block or an edited one. Measurements,
   scans, and tests are retaken at every capture.

## What stays protected

- **Thresholds are fixed before measuring** and never changed to fit a failure.
  Every query keeps an expectation, and the log and the list of expectations
  revised after a first measurement only grow.
- **Evidence is tied to exact revisions.** A capture binds a source revision in
  main's history, growth commits are squash merges of one pull request each so that
  every change a growth pull request makes is audited, and a record bound to a
  revision is not edited. A capture made before this decision records no
  `growthGate` and is verified strictly against the rules at its own source
  revision. Retained evidence bytes are never rewritten.
- **Block content rules.** Placeholder copy is generic and Mux-authored, imagery is
  Mux-authored or has a recorded license and disclosure, and a block carries no
  third-party brand logo or mark and no real person's name or likeness (Decision
  0026 item 6). New or changed copy needs an independent review, and the content
  scan and rule tests run at every capture.
- **Integrity tests and evidence honesty.** The evidence integrity test and the
  pattern regression test keep failing when a measurement breaks its threshold or a
  record claims more than it proved.
- **Decision 0022.** No assistive-technology support claim is made, and manual and
  assistive-technology review of a block's interactive behavior stays deferred to
  `S1.0`. Every automated accessibility check stays required.
- **Stops that Decision 0028 keeps.** Publishing, dist-tags, deployment, production
  and consumer changes, and stable or support claims keep their stops.

## Replaced and carried forward

Decision 0026 amendments 01 and 02 are replaced wholly and move to
`decisions/archive/` with their acceptance records:

- Amendment 01 (page-width presets): the list is in code (item 4), and the
  Roadmap `E-BL1-06` row names the module.
- Amendment 02 (category-name query expectations): its exception is now the general
  rule (item 3), and a category-name expectation is an ordinary logged revision.

Decision 0026 is edited in place to say what is still true. Item 2 no longer closes
the category list (item 1 above). Item 6 lets a block carry the component it needs
(item 2). Item 8's growth conditions follow items 1 and 2, item 9's evidence follows
items 4 and 5, and item 10's version rule follows item 5. Its non-goals no longer
bar a `@muxui/react` change by a block's pull request. Its boundary, naming,
showcase, distribution, content rules, and `E-BL1-01` through `E-BL1-11` stay.

## Authority effect

The Roadmap BL1 section and Architecture's staged-fields and bounded-blocks
passages are amended in the same change to state this rule in place of the closed
category list, waiting for a component's admission, thresholds that only a decision
could revise, the catalog digest and `@muxui/react` growth gates, and the
whole-tree content review. Decisions 0026 and 0028 are edited in place.
`tests/evidence/bl1/README.md` states the procedure.

Product Scope takes a patch version, `20.0.1`. Only its success-measures paragraph
changes: it no longer names amendment 02 and states when a BL1 regression
threshold may be changed. No Scope ID, commitment state, release boundary, package,
platform, public surface, non-goal, or support claim changes, and
`SCOPE-CAP-BLOCKS-SHOWCASE-PRIVATE` stays `admitted`, private and unpublished. The
rule that thresholds are fixed before the candidate is measured is unchanged.

Where a live decision and a strategy document state the same rule, the existing
authority order applies: Architecture, then the Roadmap, then Product Scope, then
decisions.

## Non-goals and preserved stops

This decision changes no block, category, component, dependency, token, or
threshold value, and adds no record kind. It does not change the CLI, the query API,
or the publishing tooling. It does not move the category list out of the schema
(that code is a companion change), change the pattern browser test routes or the
dense goldens, or reuse a measurement across captures. It publishes no package,
changes no dist-tag, deploys nothing, and mutates no Project, consumer, or
production system. It claims no check result, evidence, or milestone completion and
accepts no evidence.

## Reversal

A successor decision may restore any gate removed here. The archived amendments
return with `git mv` (Decision 0027), and git history holds every earlier version of
the strategy documents, the tooling, and Decision 0026. Retained evidence is
unaffected, because a capture without `growthGate` is verified against the rules at
its own source revision.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026

Andrew's direction, in his words:

> I want to loosen the authorities and decisions surrounding hard-lists and blockers for development work as Mux UI is under development. Decisions such as a definitive component list that can use Lucide icons for example has no place in Mux UI as Lucide is the default iconography provider/substrate for all Mux UI components. Find other examples of authority and decision gates that are similar in their restrictive nature that ought to be loosened/removed.

> Go ahead with batch 0 plus batches 1 to 5.

Batch 3 was described to Andrew before he approved it: block categories become
ordinary catalog data; search expectations can change in a normal pull request,
written down before measuring and logged, never fitted to a result; the size limit
becomes a setting changed by a reviewed pull request; page widths live only in code
and the test that reads decision text goes away; a block and the component fix it
needs can ship together; and evidence reuses content review for unchanged copy.
Kept: thresholds fixed before measuring and never fitted to a result, evidence tied
to exact revisions, block content rules, independent content review for new or
changed copy, evidence honesty and integrity tests, and Decision 0022.

This record does not claim that any check passed, that a pull request was opened or
merged, that the repository has adopted the decision, that the categories code, the
pattern browser test routes, the dense goldens, or post-merge capture reuse has
landed, or that any package, release candidate, or dist-tag changed.
