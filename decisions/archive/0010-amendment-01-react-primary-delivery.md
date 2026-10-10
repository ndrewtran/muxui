# Decision 0010 amendment 01: React-primary delivery

Status: Accepted.

Acceptance: Andrew / `ndrewtran` accepted the exact 42,624-byte authority
candidate at SHA-256
`8d927788d085c7d2406dd3bfbb6aa1a92dfdaafbbe17c6048eb607f2297b8633`
with the instruction:

> I approve Core UI React-primary delivery authority candidate v4, SHA-256
> 8d927788d085c7d2406dd3bfbb6aa1a92dfdaafbbe17c6048eb607f2297b8633

No GitHub comment or approval timestamp is claimed.

## Human decision

React Aria Components remains the default internal starting point for Core UI
React, and React Native Core primitives remain the default later-native
starting point. This amendment changes delivery sequencing, not Core UI's
ownership of public contracts.

Core UI React is the primary component implementation, first component-library
delivery track, and first public component-package boundary. Core UI evaluates
the documented component surface of the exact pinned React Aria Components
baseline and delivers every applicable Core React component through accepted
React tranches. Every evaluated upstream item receives a Core component mapping
or an explicit `defer`, `exclude`, or `not-a-component` disposition. Upstream
utilities, providers, helpers, and exports do not automatically become Core UI
components.

The accepted React baseline is `react-aria-components@1.20.0`. It is an
implementation dependency, never an identity, semantic, inventory, API, type,
lifecycle, accessibility, styling, compatibility, support, documentation, or
platform authority.

Framework-free web and React Native are later secondary tracks. They do not
block React component admission, implementation, experimental merge,
prerelease publication, or React breadth closure. React Native later implements
or adapts renderer-neutral Core UI semantic contracts through its own
`native.react-native` binding specs. It never derives authority from React
source, DOM behavior, React Aria, or React types, and it may contain fewer
components than React.

## Canonical ownership

- Canonical component records own identity, renderer-neutral intent, states,
  anatomy, portable obligations, tokens, artifact lifecycle, risk, and
  alternatives.
- Accepted Roadmap-owned tranche scope locks own implementation admission for
  the exact upstream baseline; they are not a component inventory.
- Each `web.react` binding spec owns the Core React DOM, public API/types,
  observable behavior, accessibility fulfillment/deviations, events, slots,
  styling hooks, defaults, binding lifecycle/strategy, validation profile,
  canonical-example relations, platform-safety declarations, and
  compatibility promises.
- `@core-ui/react` source owns React rendering, DOM/CSS implementation,
  SSR/hydration, host refinements, effects, and runtime/effect lifecycle.
- Future `web.html` and `native.react-native` binding specs own their separate
  contracts; `@core-ui/web` and `@core-ui/react-native` source own their
  respective implementations.
- Executable example code is owned only by its canonical example source.

## Delivery and package effect

Per-component admission and acceptance loops are replaced by accepted React
tranche scope locks. Each tranche has one exact baseline, implementation
sequence, deterministic proof closure, risk-selected independent review, and
post-proof human release acceptance. Routine components inside an accepted
lock need no separate authority decision or digest-specific human approval.

A new public-contract or ontology decision, dependency, security/privacy
boundary, support expansion, stable promotion, or exception remains a
decision-bearing delta accepted before implementation.

The first public component graph publishes only:

```text
@core-ui/react@0.1.0-alpha.N
├── dependency: react-aria-components@1.20.0
├── peer: react >=19.2.0 <20
└── peer: react-dom >=19.2.0 <20
```

`@core-ui/react` has no runtime dependency on `@core-ui/web` or another Core UI
workspace package. Private Core schema, token, foundation, catalog, and tooling
packages may deterministically generate tarball contents without becoming
runtime dependencies. Generated README/API/export/component/styling/
compatibility files inside the tarball are version-bound package guidance, not
canonical facts, a query API, or another registry.

Each completed tranche may propose an exact `0.1.0-alpha.N` publication under
`next`. React breadth closure may propose `0.1.0-rc.1`. This amendment does not
authorize publication, `latest`, or stable `0.1.0`; each external registry
mutation remains separately authorized against exact tarball, provenance,
manifest, checks, registry, and rollback identities.

## Proof and support boundary

Shared proof is reusable only while its exact baseline digest remains valid.
React Aria identity, package graph, styling/runtime ownership, SSR/hydration,
catalog/compiler, accessibility harness, compatibility profile, or packed-
consumer changes invalidate the affected baseline and require bounded reproof.

Manual accessibility review is not required merely to merge experimental
source. It is required before a published prerelease exports or promises
behavior whenever the exact `web.react` binding risk/evidence contract requires
it. Missing proof keeps the binding unexported or explicitly unavailable with
support unproved; lifecycle and strategy remain independently authored.
`unsupported` is used only when the binding spec declares that no responsible
implementation exists and records the required reason or alternative.

React proof does not establish framework-free, iOS, Android, React Native Web,
cross-platform comparison, binding conformance, feature equivalence, stable
lifecycle, or support for another track.

## Product Scope and roadmap effect

Product Scope advances to `5.0.0`. The previous simultaneous cross-platform
component and platform commitments become deferred with their meanings and
history preserved. New React-specific commitments own R1 delivery. The Roadmap
replaces G1.3–G1.9 and the React portions of G2 with R1.0–R1 exit and P2.1–P2
exit; W1, N1, X1, and S1 are separately activated later tracks.

Decision 0010's original bytes remain accepted historical authority. This
append-only amendment supersedes only its per-component admission sequencing
and simultaneous-renderer delivery implication. Per-component native substrate,
additional-dependency, and platform-disposition decisions remain required when
N1 activates.

## Non-goals

- No repository implementation, dependency installation, component work,
  evidence capture, npm publication, Project mutation, package release, or
  production change follows from the decision alone.
- React, React Aria, tranche locks, stories, sites, and generated catalog or
  package projections never become the canonical component inventory.
- No framework-free or native counterpart, React Native Web support,
  cross-platform equivalence, stable lifecycle, or `latest` publication is
  promised.
- Deterministic failure, installed-local/package integrity, provenance,
  privacy, accessibility, lifecycle, and explicit external-mutation approval
  are not waived.
- No historical authority or evidence is rewritten, and no new artifact kind,
  registry, evidence ontology, relationship model, or review infrastructure is
  introduced solely for this decision.

## Reversal and later implementation

Before implementation, an append-only superseding decision may reverse this
authority without runtime migration. After work begins, changing substrate,
package graph, release boundary, canonical ownership, or secondary-track
relation requires a new accepted decision and authority reconciliation.

R1.0 implementation planning may begin only after this amendment and the
corresponding Architecture, Roadmap, and Product Scope `5.0.0` changes are on
the default branch. The Project migration remains a separately accepted
locator reconciliation and is not an implementation-entry authority.
The first renderer slice is `core:component:button#web.react`.
