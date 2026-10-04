# Decision 0015 amendment 01: Mux UI copyright year

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: `muxui:decision:0015`
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0015:amendment:01`
- Amends by reference: [Decision 0015](./0015-authority-retirement.md),
  "Decision", the sentence "The retired attribution is replaced with
  `Copyright (c) 2025 Andrew`."
- Accepted request: [acceptance record](./0015-amendment-01-copyright-year-acceptance.md)

## Decision

The replacement attribution is `Copyright (c) 2026 Andrew`. Mux UI's own
notices and licences carry that line:

- `LICENSE` and `packages/react/LICENSE` (already 2026);
- `packages/react/NOTICE`, `packages/tokens/NOTICE`, and `apps/scale/NOTICE`.

Release preparation asserts the 2026 line in the packed `@muxui/react`
`NOTICE`.

Where Decision 0015 names `Copyright (c) 2025 Andrew`, read
`Copyright (c) 2026 Andrew` from this amendment onward. Decision 0015's text
is not rewritten; this record is the reference for the change.

## Reason

Decision 0015 wrote 2025, but the repository's first commit is dated
2026-08-04 and both `LICENSE` files already say 2026. One year everywhere
removes the mismatch between the licences and the notices.

## Authority effect

This amendment changes no license, licensor, token value or ID, public API,
package or platform boundary, Scope ID, support claim, lifecycle, or release
status. Third-party licence and notice records keep their own years and text.
Product Scope does not name the attribution, so `scopeVersion` is unchanged.

## Non-goals and preserved stops

This amendment does not rewrite historical decision text or retained evidence,
publish a package, change a dist-tag, mutate a Project, consumer, or
production system, or authorize the final R1-exit pull-request merge. It
claims no check result, evidence, or release.

## Reversal

Reversal is append-only. Changing the attribution again requires a new
accepted amendment. Historical authority and acceptance records are not
rewritten.
