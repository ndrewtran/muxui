# Decision 0019: Mux-owned React component motion

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0019`
- Authority: accepted [Architecture](../strategy/monorepo-architecture.md),
  [Roadmap](../strategy/milestone-roadmap.md), and
  [Product Scope](../strategy/product-scope.md)

- Accepted request: [acceptance record](./0019-react-component-motion-acceptance.md)

Andrew's acceptance records the bounded authority direction below. Repository
adoption remains subject to the existing protected pull-request process; this
record does not claim implementation, proof completion, or package release.

## Decision

Adopt one exact, internal, replaceable runtime dependency for Mux-owned
component motion in `@muxui/react`: `motion@13.4.0`. Its `motion/react` and
`motion/react-m` entry points stay inside private renderer implementation
modules. The dependency is accepted for already-admitted `web.react` families
whose existing contracts benefit from finite, purpose-specific movement; it
does not blanket-wrap the package or create a new component family.

Mux UI continues to own the public API and types, component semantics, token
roles and values, DOM and CSS, refs, accessibility, SSR, hydration, effect
lifecycle, and release contract. Upstream animation props, types, providers,
exports, and import paths do not become Mux API. Consumer guidance describes
Mux-owned behavior; dependency and license disclosures remain accurate.
CSS remains a valid implementation for simple transitions. Private helpers
may support the admitted components without creating a new public animation
API, motion registry, or cross-package runtime.

The [registry metadata](https://registry.npmjs.org/motion/13.4.0) for the
accepted exact version is:

| Field | Registry metadata |
| --- | --- |
| Package | `motion@13.4.0` |
| License | MIT |
| React peers | `react`, `react-dom`: `^18.0.0 || ^19.0.0` |

These values are registry metadata only. They do not claim that the package is
installed, locked, packed, tree-shaken, or released. Manifest and lockfile
changes remain downstream implementation work; implementation must verify the
exact bytes, license/notice closure, peer isolation, and packed-consumer
resolution.

## Mux motion contract

The existing [Mux motion foundation](../catalog/guides/foundations-motion.md)
and canonical tokens own duration and easing meaning. Implementations use the
role for the purpose of the behavior, such as interaction, reveal, dismissal,
state, content resize, or progress;
they do not copy dependency defaults or create parallel token names. The two
canonical modes remain full and reduced, preserving both system-preference
and explicit Mux mode-selection paths and their existing precedence. A
dependency provider setting alone does not satisfy this contract. Each
integration must preserve the role's reduced behavior. In reduced mode,
feedback, state, and exit resolve to their documented instant duration, while
progress keeps its separate reduced behavior. State, opacity, color, focus,
and content changes must remain
understandable when movement is shortened or removed.

React remains the sole lifecycle owner for every mounted tree. Motion code may
not duplicate focus restoration, Escape handling, outside-pointer dismissal,
portal lifecycle, inert/background policy, or scroll-lock ownership. It must
handle refs, interruption, unmount, dismissal, and cleanup without leaving
stale listeners, timers, or animation state, and it must keep accessible state
and focus semantics independent of a visual exit.

## Authority and scope effect

This is a dependency adoption decision because it adds a direct runtime edge;
it is not a public API, platform, or product-scope expansion. It adds no
component, family, token, registry, public Mux package, renderer, support claim,
lifecycle claim, or compatibility promise. Existing R1/R1.6 milestone entry,
exit, evidence, prerelease, publication, and final-merge boundaries remain in
force. React Native, `web.html`, cross-renderer equivalence, stable support,
and `latest` remain separately admitted work. Existing Scope IDs retain their
states and no commitment transition is introduced, including
`SCOPE-PKG-REACT`, `SCOPE-API-REACT-ERGONOMICS`, `SCOPE-TOKEN-MODES`,
`SCOPE-PROOF-BEHAVIOR`, `SCOPE-PROOF-PACKAGE`, `SCOPE-PROOF-VISUAL`, and
`SCOPE-QUALITY-COMPAT-PROFILE`.

## Repository adoption after acceptance

Repository adoption requires coordinated canonical updates before
implementation; accepted historical decisions and completed evidence retain
their meaning:

1. Add the exact private dependency edge and Mux-owned lifecycle, reduced-mode,
   and public-boundary rules to the `@muxui/react` Architecture section and
   exact package graph.
2. Update the Roadmap's React dependency and applicable component/package
   proof requirements for this edge. Reuse the existing R1/R1.6 delivery
   boundaries without changing milestone states or rewriting historical proof.
3. Add a Product Scope patch clarification for the internal edge, with no new
   Scope ID, commitment transition, public surface, release, or support claim.
4. Update the owning package manifest and lockfile, license/notice inputs,
   generated package guidance, and release assertions only in the later
   implementation change. Generated projections remain derived outputs.

## Focused proof

The later implementation must prove, for the selected admitted components:

- exact manifest, lockfile, registry integrity, MIT license/notice, React peer
  isolation, private imports, bundle impact, tree-shaking, and packed-consumer
  resolution, including that unaffected imports do not load unused features;
- typed refs and host behavior, finite transitions, interruption, unmount and
  cleanup, focus restoration, dismissal, portal/global-effect ownership, and
  no stale timers or listeners;
- deterministic SSR and hydration with no client-only initial-state mismatch;
- full and reduced behavior through both system and explicit mode-selection
  paths against canonical Mux roles, including distinct progress behavior
  wherever affected; and
- representative light/dark state and interaction fixtures, generation
  identity, and package guidance parity without a blanket wrapper or public
  dependency surface.

Proof and independent review follow the existing risk rules for affected
bindings. After adoption, routine integration within this boundary needs no
new per-component adoption decision. Changing the approved dependency version
or boundary requires a successor decision; existing public-contract change
control still applies. Changes to lifecycle, reduced behavior, geometry,
accessibility, or visual contracts rerun affected proof without creating an
ongoing comparison requirement.

## Non-goals and preserved stops

This accepted direction does not install the dependency, edit a manifest or lockfile,
implement component motion, add a public provider or motion API, create a
second token or component registry, accept evidence, mark a milestone ready or
complete, change a release or support boundary, update the Project, publish a
package, change a dist-tag, mutate a consumer or production system, or
authorize the final R1-exit pull request merge.

## Reversal

Before implementation begins, a successor decision may withdraw this internal
edge without migration because existing Mux APIs, tokens, CSS, and component
semantics remain valid. After implementation begins, replacing the dependency
or changing the admitted component boundary requires a successor decision and
focused reproof of the affected public, lifecycle, accessibility,
SSR/hydration, package, and visual contracts. Historical authority and
acceptance records are not rewritten.
