# Decision 0011 amendment 05: temporal adapter exact pin

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: `muxui:decision:0011`
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0011:amendment:05`
- Amends by reference: [Decision 0011 amendment 01](./0011-amendment-01-r1-temporal-adapter-dependency.md),
  the approved exact version `@internationalized/date@3.12.3` and its
  single-resolved-instance premise
- Accepted request: [acceptance record](./0011-amendment-05-internationalized-date-exact-pin-acceptance.md)

## Decision

The approved temporal-adapter dependency of `@muxui/react` moves from exact
`@internationalized/date@3.12.3` to exact `@internationalized/date@3.12.4`.
Everything else amendment 01 approved stays: one direct internal, replaceable
runtime dependency, used only by Mux UI value adapters in `DateField`,
`DatePicker`, `DateRangePicker`, `TimeField`, `Calendar`, and
`RangeCalendar`, with Mux UI-owned ISO date, local-time, and `{start,end}`
range public values and no upstream type, value, import path, or export in
the public API.

Where amendment 01 and the strategy documents name `3.12.3`, read `3.12.4`
from this amendment onward. Amendment 01's text is not rewritten; this record
is the reference for the change.

## Reason

Amendment 01 approved `3.12.3` because it was the single resolved instance in
the pinned `react-aria-components@1.20.0` closure. `react-aria@3.51.0`,
`react-aria-components@1.20.0`, and `react-stately@3.49.0` declare
`^3.12.3`, and npm's latest is now `3.12.4`. npm and pnpm dedupe the caret
ranges onto the exact pin, but a fresh yarn 1 consumer install resolves the
exact `3.12.3` for `@muxui/react` and `3.12.4` for React Aria, so two copies
install. The packed-consumer install matrix records that as a manifest
warning.

An exact `3.12.4` pin satisfies every `^3.12.3` range, so npm, pnpm, and yarn
each install one `@internationalized/date` version again, and the repository
lockfile resolves one `3.12.4` for the React importer and React Aria's
closure. The one-instance premise of amendment 01 is restored.

## Future patch releases

A later `@internationalized/date` patch release can reintroduce a yarn 1
duplicate the same way, because React Aria's caret ranges will float to it
while the Mux UI pin stays exact. The install matrix flags that duplicate as a
warning rather than a failure. Re-pinning to the new version requires another
accepted amendment.

## Authority effect

This amendment changes no dependency set, six-family adapter limit, component
or family, public API or value format, export or import path, public package,
platform binding, support or lifecycle claim, compatibility claim, or release
boundary. Existing Scope IDs, including `SCOPE-PKG-REACT` and
`SCOPE-PROOF-PACKAGE`, keep their states. No new Scope ID or commitment
transition is introduced. Product Scope names the version, so it records this
as a patch clarification.

The upstream license is Apache-2.0 and its text is byte-identical at `3.12.4`.

## Required proof

Amendment 01's proof obligations apply to the new version: exact manifest and
lockfile pins with npm integrity, license and notice identity, one resolved
version in the repository lockfile, the six-family adapter boundary, absence
of upstream public leakage, and packed-consumer installs under npm, pnpm, and
yarn.

## Non-goals and preserved stops

This amendment does not add or remove a dependency, change an adapter or a
public value contract, publish a package, change a dist-tag, mutate a Project,
consumer, or production system, or authorize the final R1-exit pull-request
merge. It claims no check result, evidence, or release.

## Reversal

Reversal is append-only. Moving to another version, using the dependency
outside the six named families, or exposing an upstream contract requires a
new accepted amendment and affected package and packed-consumer reproof.
Historical authority and acceptance records are not rewritten.
