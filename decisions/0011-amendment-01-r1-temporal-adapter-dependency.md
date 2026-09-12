# Decision 0011 amendment 01: R1 temporal adapter dependency

- Status: accepted
- Parent decision: `core-ui:decision:0011`
- Decision owner: Andrew / `ndrewtran`
- Proposed decision: `core-ui:decision:0011:amendment:01`
- Human acceptance: Andrew / `ndrewtran`: “Approved”

## Decision

Core UI approves `@internationalized/date@3.12.3` as a direct internal runtime
dependency of `@core-ui/react`, and only for Core value adapters in exactly
these six families:

- `DateField`
- `DatePicker`
- `DateRangePicker`
- `TimeField`
- `Calendar`
- `RangeCalendar`

The dependency is already the single resolved `3.12.3` instance in the pinned
`react-aria-components@1.20.0` closure. A direct declaration therefore adds
no installed package or version. The dependency remains internal and
replaceable; it is not a public contract or a second authority.

Core public value contracts remain ISO dates `YYYY-MM-DD`, local times
`HH:mm[:ss[.fraction]]`, and Core-owned `{start,end}` ranges. No
`@internationalized/date` or React Aria public type, value, import path,
export, lifecycle, or ownership path may leak through `@core-ui/react`.

## Authority effect

This amendment records one narrow internal dependency edge in the accepted R1
React package graph. It does not change the 53 families, their four tranches,
their Scope IDs or states, the React Aria or styling decisions, deferred tracks,
support or lifecycle boundaries, Project boundaries, or the npm, dist-tag,
production, consumer, and final-R1-exit-merge stops. It makes no implementation
or publication claim.

Changing the approved version, using the dependency outside the six named
families, exposing an upstream contract, or adding another direct runtime
dependency is a decision-bearing change requiring a new accepted decision.

## Later implementation boundary

The following exact boundary applies when this accepted authority is
implemented:

1. **Manifest and lockfile.** `@core-ui/react` may add exactly
   `@internationalized/date: 3.12.3` to its direct runtime dependencies, with
   the matching `packages/react` importer entry in `pnpm-lock.yaml`. The
   frozen lockfile and installed graph must continue to contain one resolved
   `3.12.3` instance and no direct runtime dependency beyond the accepted
   React Aria and temporal-adapter edges.
2. **Temporal adapters.** Core-owned adapters may convert the six named
   families' public ISO date, local-time, and `{start,end}` range values to and
   from the internal package. They must not expose its classes, types, values,
   import paths, exports, lifecycle, or ownership.
3. **Derived package guidance.** If package guidance derives dependency or
   value-format metadata, it must state the exact `3.12.3` internal edge and
   six-family limit while retaining the Core-owned public formats. Guidance is
   generated from the canonical package source and is not a second authority.
4. **Release-prepare assertion.** Release preparation must assert the exact
   manifest/lockfile dependency, the single resolved version, the six-family
   adapter boundary, and the absence of upstream public leakage before a
   release candidate can proceed.
5. **Packed consumer.** A packed consumer must install and resolve the exact
   dependency through the packed `@core-ui/react` artifact. R1.2 proves the
   four R1.2 temporal families (`DateField`, `DatePicker`, `DateRangePicker`,
   and `TimeField`); R1.3 later proves `Calendar` and `RangeCalendar`. Each
   tranche verifies the Core public contracts and absence of upstream
   type/value/import/export leakage for its own families. This is proof work,
   not a publication authorization.

No other package, renderer, family, platform, or public surface may consume
this dependency under this amendment.

## Non-goals and preserved stops

This amendment does not itself edit a manifest or lockfile, install a
dependency, implement an adapter, derive package guidance, run release
preparation, validate a packed consumer, capture evidence, claim support,
publish a package, change a dist-tag, mutate a consumer or production
environment, update the Project, or merge the final R1-exit pull request.
It does not alter the React `0.1` package-only boundary, `next` release
channel, React Aria substrate, Mux UI styling, committed family inventory,
deferred framework/native tracks, or existing support and lifecycle claims.

## Reversal

Reversal is append-only. Before temporal adapter implementation begins, a
successor decision may reverse this edge without runtime migration. After
implementation begins, changing the version, six-family limit, public value
contracts, package graph, ownership, support/lifecycle boundary, or release
effect requires a new accepted decision and bounded reproof. Implemented
source is reverted through an ordinary protected pull request; historical
authority and acceptance records are not rewritten.
