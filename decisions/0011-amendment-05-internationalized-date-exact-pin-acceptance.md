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

Andrew was asked:

> How should the `@internationalized/date` pin change?

Andrew answered:

> Exact 3.12.4 (Recommended)

This accepts moving the internal temporal-adapter dependency of
`@muxui/react` from exact `@internationalized/date@3.12.3` to exact `3.12.4`,
with the same six-family limit and no code or public-surface change. It covers
the matching version text in Architecture, Roadmap, and Product Scope. Andrew
asked for this change and Decision 0015 amendment 01 in one pull request,
merged when green after an independent review.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the amendment, or that a
package was published.
