# Acceptance: Decision 0011 amendment 05

- Decision: `muxui:decision:0011:amendment:05`
- Parent decision: `muxui:decision:0011`
- Decision path: `decisions/0011-amendment-05-internationalized-date-exact-pin.md`
- Acceptance path: `decisions/0011-amendment-05-internationalized-date-exact-pin-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 October 2026
- Human acceptance: Andrew / `ndrewtran`: “Exact 3.12.4 (Recommended)”

## Accepted direction

Pin. Andrew was asked:

> How should the `@internationalized/date` pin change?

Andrew answered:

> Exact 3.12.4 (Recommended)

The selected option read:

> Minimal and keeps exact pinning. One copy everywhere today; re-pin when a new patch ships and the install matrix warns.

Go-ahead. Andrew was asked:

> Should I go ahead: both changes in one PR with their decision amendments, then merge when green after an independent review?

Andrew answered:

> Yes, merge when green (Recommended)

The selected option read:

> Open one PR with both amendments, review it, and merge once CI passes.

The amendment records the move of the internal temporal-adapter dependency of
`@muxui/react` from exact `@internationalized/date@3.12.3` to exact `3.12.4`,
with the same six-family limit and no code or public-surface change, and the
matching version text in Architecture, Roadmap, and Product Scope. The
go-ahead covers this amendment and Decision 0015 amendment 01 in one pull
request.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the amendment, or that a
package was published.
