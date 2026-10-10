# Decision 0028: Standing rule for ordinary development

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0028`
- Supersedes wholly: Decision 0010 amendments 01 and 03; Decision 0011
  amendments 01, 02, 04, 05, and 06; Decisions 0014, 0017, 0018, 0019, 0024,
  and 0025
- Supersedes in part: the stop list in Decision 0011 and in the delivery skill
  (Decision 0009 amendments 05 and 06); the root list and pinned versions in
  Decision 0013; the named component list in Decision 0020 amendment 01
- Effective: on merge

## Gap

Mux UI is under development, and a hard list or blocker is only worth keeping
where it protects a user, a claim, or a release. Many did not. A new
experimental React family needed its own admission decision and a Product Scope
major version. A dependency was allowed per named component, so a date library
could be used only in the families a decision named, and a patch update to it
needed another amendment. Version numbers were repeated in three strategy
documents. Milestone entry conditions read as permission to start, and one
pointed at a milestone that no longer exists. The Figma export named every
eligible component. The delivery skill stopped work when the tracker was
unreachable or when a CI run grew wide.

The clearest case is icons. A definitive list of components that may use Lucide
has no place in Mux UI, because Lucide is already the default icon source for
every component.

## Decision

1. **Ordinary React work needs no decision.** A new experimental component or
   family, prop, variant, example, canonical record, token, test, guide, and the
   use or upgrade of a dependency are ordinary pull requests with the proof
   their risk calls for. The supplemental mapping lists the experimental
   families. No decision, Product Scope row, or count in prose lists them.
2. **Dependencies are allowed by purpose, not by named component.** The
   purposes are accessible behavior and hooks, date and time values, decorative
   icons, component motion, Markdown parsing, rich-text editing, and code
   highlighting. Any `@muxui/react` component may use a dependency for an
   allowed purpose. Adding, upgrading, or removing a dependency is a normal
   reviewed pull request that carries the proof in "What stays protected". A
   dependency that adds a new trust boundary (a network service, a
   code-execution privilege, or a public dependency API) needs a decision.
   React Aria Components upgrades are ordinary pull requests with lockfile,
   integrity, and regression proof. The R1.0 Stage 1 snapshot is a historical
   record of the committed registry, not a gate.
3. **Version numbers live in manifests and the lockfile.** `package.json` and
   `pnpm-lock.yaml` own every dependency version. Strategy, decisions, guides,
   and the skill name the dependency and its purpose, never its version.
4. **Milestones gate claims, not work.** Entry conditions and exit assertions
   gate public enablement, a milestone's `ready` and `complete` status, and
   claims. They do not stop experimental development. Work may proceed while a
   milestone is `not-ready`, provided it does not publish, advertise, or become
   a dependency of something that claims support. An entry condition that names
   a retired milestone is read as the live condition it stood for.
5. **Product Scope changes only for real commitments.** These are a new package,
   platform, or renderer, a release boundary, a support, stable, or
   assistive-technology claim, a non-goal, and a committed capability row.
   Adding a family, prop, example, token, or dependency under an existing row
   changes no Product Scope version. A commitment change states the product
   outcome, the affected Scope IDs and commitment transitions, the Roadmap and
   evidence effect, release additions and removals, and open tracker work.
6. **Delivery stops are short.** Work stops for Andrew only to:
   - publish, change a dist-tag, deprecate, or unpublish, or merge the final
     R1-exit pull request;
   - touch production or a consumer project;
   - write to an outside service, such as a Figma file, a registry, or a
     tracker field beyond routine event synchronization;
   - waive required proof (accessibility, licence, or evidence integrity);
   - activate a new package, platform, or renderer;
   - make a stable, support, or assistive-technology claim; or
   - change a Product Scope commitment, release boundary, or non-goal, an
     Architecture invariant, or a Roadmap exit rule.

   An unreachable tracker is not a stop: record "tracker sync pending" and
   continue. A wide CI plan or a style-ownership failure is not a stop: report
   it and run the checks. A new capability or component inside React is not a
   stop.
7. **Figma export is open by criteria.** A component is eligible for the Figma
   component export when it has a supported anatomy, finite variants, mode-aware
   tokens, and passing export audits. No list of names is kept. Writing to any
   Figma file still needs Andrew's explicit authorization for that file.

## What stays protected

- **Exact pins and lockfile integrity.** Dependencies that ship in the package
  are pinned exactly in `package.json` with matching lockfile integrity,
  because workspace overrides do not reach a consumer's install. A bump keeps
  one resolved version of the dependency in the lockfile and in a consumer
  install.
- **Licences and notices.** A distributed package preserves the licence and
  notice of every dependency and asset it carries, including the Lucide ISC
  licence and the Feather-derived MIT notice.
- **No leakage.** No dependency type, value, name, prop, or import path crosses
  the public API. Mux UI owns every public contract, and React Aria Components
  stays the internal, replaceable substrate. Date and time values stay ISO
  dates, local times, and Mux UI-owned `{start,end}` ranges.
- **Module isolation.** An editor, parser, highlighter, or motion entry point is
  imported only by the module that owns it, so an ordinary import such as
  Button loads none of them. Tree-shaking, SSR and hydration, peer
  compatibility, and packed-consumer proof cover each dependency.
- **Icons.** Lucide is the default icon source for decorative affordances in
  every component. Renderer source imports individual icon modules, never the
  package barrel. Icons are hidden from the accessibility tree and not
  focusable unless a Mux UI binding requires another semantic, and an icon
  never supplies an accessible name. No public Icon API, catalog, or package
  exists. A changed icon mapping or geometry reruns the affected visual,
  accessibility, and packed-consumer proof.
- **Motion.** Component motion reads durations and easing from Mux UI motion
  tokens and honors both the system preference and the explicit Mux UI reduced
  mode. React stays the sole owner of focus restoration, Escape handling,
  outside-pointer dismissal, portal lifecycle, inert and background policy, and
  scroll lock. Cleanup leaves no stale listener, timer, or animation. CSS stays
  valid for simple transitions.
- **Bounded work.** A component that parses, diffs, or highlights caller text
  bounds its input and its work, and each bound has one defined outcome. An
  input past its size limit is rejected: CodeBlock throws a `RangeError` for
  more than its character or line limit. Excess diff work degrades to a labelled
  replacement instead of a minimal diff. A highlighting limit falls back to
  escaped plain text. No bound is relaxed to avoid a failure, no raw HTML is
  rendered, and nothing is sent to a remote service. The numbers are code
  constants.
- **Accessibility and platform safety.** The non-waivable accessibility rules
  and the platform safety contract stay as Architecture states them.
- **Publishing, evidence, and claims.** Publishing, dist-tags, production
  changes, evidence honesty, and stable, support, and assistive-technology
  claims keep their stops. A new package, platform, or renderer still needs a
  decision, and so does any stable or support claim.
- **Field deferral.** The standalone `Field` family stays unavailable. Named
  fields and the `Input` parts cover ordinary field composition. A change that
  adds a generic Field states the consumer need: custom or multiple controls
  that share one field boundary with deliberate label, description, error, and
  validation association.

## Replaced and carried forward

Decisions replaced wholly move to `decisions/archive/` with their acceptance
records. Each live rule they held is stated above, in Architecture, or in
Product Scope:

- Decision 0010 amendments 01 and 03: React-primary delivery and the committed
  registry are in Architecture and Product Scope. Decision 0010 itself stays
  and keeps the substrate choice.
- Decision 0011 amendments 01, 02, 04, 05, and 06: the temporal, icon, Tiptap,
  and date pins and component lists become the purpose-based dependency rule,
  the exact-pin rule, and the icon rule above.
- Decision 0014: the IconButton admission is complete and the Field deferral is
  above.
- Decisions 0017, 0018, and 0025: the family admissions are complete. Named
  hook uses become the purpose-based dependency rule. Family behavior lives in
  the component records.
- Decision 0019: the motion boundary is above and in Architecture.
- Decision 0024: the bounded-work rule is above and its numbers are in code.

Decisions that stay are edited to say only what is still true. Decision 0011
keeps the ordinary delivery contract, Decision 0013 keeps theme parity and
private authoring, and Decision 0020 amendment 01 keeps the Figma component
export with eligibility by criteria.

## Authority effect

Architecture, the Roadmap, and Product Scope are amended in the same change to
state this rule in place of named-component admission, dependency allowlists,
pinned versions in prose, family counts, milestone start gates, the Figma name
list, and the Product Scope dossier and change log. The delivery skill is
amended to the stop list above.

Product Scope takes a major version, `20.0.0`, because it rewrites committed
rules: the supplemental commitment, its change control, and the dependency
wording of the React `0.1` boundary. No Scope ID is added, removed, or
transitioned, and no commitment, release boundary, package, platform, or
support claim changes. This is the last Product Scope version change that
routine development needs under this rule.

Where a live decision and a strategy document state the same rule, the existing
authority order applies: Architecture, then the Roadmap, then Product Scope,
then decisions.

## Non-goals and preserved stops

This decision publishes no package, creates no tag, changes no dist-tag, writes
to no Figma file, and mutates no Project, consumer, or production system. It
claims no stable, support, or assistive-technology property and changes no
release or merge stop. It does not alter the Blocks rules, block content rules,
or Decision 0026 and its amendments, the release candidate sequence in Decision
0023 and its amendment, the assistive-technology non-claim in Decision 0022, or
Decision 0027. It loosens no release or publish tooling: those paths keep
their stops and protection. Decision 0009 amendment 06 states the narrower
planning validator and pull-request template.

## Reversal

A successor decision may restore any gate removed here. Archived decisions
return with `git mv` (Decision 0027), and git history holds every earlier
version of the strategy documents and the skill.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026

Andrew's direction, in his words:

> I want to loosen the authorities and decisions surrounding hard-lists and blockers for development work as Mux UI is under development. Decisions such as a definitive component list that can use Lucide icons for example has no place in Mux UI as Lucide is the default iconography provider/substrate for all Mux UI components. Find other examples of authority and decision gates that are similar in their restrictive nature that ought to be loosened/removed.

> Go ahead with batch 0 plus batches 1 to 5.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the decision, that any later
batch was done, or that any package, release candidate, or dist-tag changed.
