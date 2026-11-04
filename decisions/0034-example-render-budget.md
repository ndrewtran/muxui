# Decision 0034: The packed example walk has its own render budget

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0034`
- Satisfies for the example walk budget only: the "waive required proof" stop in Decision 0028 item 6
- Effective: on merge

## Gap

Release preparation held the packed example walk to the 1000 ms R1.5 SSR budget in `catalog/react-r1-5/closure.json`. The walk renders every catalog example in React's development build. The R1.5 budget belongs to the simple SSR measurement. #199 added the check, and no Roadmap or decision text states a budget for the walk.

- **The walk grew.** It covered 117 renders on 11 October 2026 (861.34 ms, run 38131265811) and covers 239 now.
- **Dry runs, packed import / simple SSR / example walk.** Run 41321377928 (1 November, passed): 323 / 77 / 595 ms. Run 41106830331 (30 October, passed): 507 / 102 / 886 ms. Run 41750336758 (4 November) failed twice: attempt 1 at 662 / 136 / 1068 ms, attempt 2 at 680 / 137 / 1081 ms.
- **Likely cause.** `packages/react/src`, `pnpm-lock.yaml`, `.node-version` and the runner image did not change between the 1 November and 4 November runs, and the walk stayed about 1.6 to 1.8 times the packed import. This reads as slower runners and a budget that did not grow with the walk, not a render regression. That cause is inferred, not proved.

## Decision

The walk has its own 2000 ms budget, declared in `tooling/audits/repository-policy/src/release-prepare.mjs`, so a large slowdown still fails with `R1.5_PACK_PERFORMANCE_BUDGET_EXCEEDED`. The R1.5 packed import (2000 ms) and SSR (1000 ms) budgets in `catalog/react-r1-5/closure.json` are unchanged.

## Non-goals and preserved stops

This decision satisfies Decision 0028's stop on changing required proof through the Acceptance below. It publishes nothing and changes no dist-tag, version, package, or other check. Decision 0028's publish stop and per-release-candidate authorization stand.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 November 2026

On the budget for the packed example walk, Andrew answered "Give it a 2,000 ms budget (Recommended)", whose option text was: "Small PR: only the 239-example check gets its own 2,000 ms limit, so a big slowdown still fails. After it merges and CI passes, I run a new dry run and publish if it's fully green. About 30 minutes."

This record does not claim that any check passed, that a dry run is green, or that any package, release candidate, or dist-tag changed.
