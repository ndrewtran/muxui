# Decision 0022 amendment 01: R1 review evidence correction

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0022](./0022-rc1-assistive-technology-non-claim.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0022:amendment:01`
- Accepted request: [acceptance record](./0022-amendment-01-r1-review-evidence-correction-acceptance.md)

## Corrected premise

Decision 0022 says R1.1 through R1.5's recorded checks and reviews exist as CI
check and review logs. The check logs existed and are now retained under
`tests/evidence/r1.1` through `tests/evidence/r1.5`. The review logs do not
exist: pull requests #102, #105, #106, #107, and #108 have no hosted reviews
or review comments, as each retained pull-request observation records. Four
of those descriptions (#102, #106, #107, and #108) claim a local independent
frozen-diff review that was never retained, and #105 claims no review. Where
Decision 0022 states that review logs exist, read this amendment instead.
Decision 0022's text is not rewritten.

## Decision

The R1 exit condition that R1.1 through R1.5 are complete for the rc
prerelease boundary on logged check and review evidence is met as follows:

| Milestone | Check evidence | Review evidence |
| --- | --- | --- |
| R1.1 | Retained, `tests/evidence/r1.1` | Author-reported only (PR #102); accepted for the rc boundary, not proof |
| R1.2 | Retained, `tests/evidence/r1.2` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.3 | Retained, `tests/evidence/r1.3` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.4 | Retained, `tests/evidence/r1.4` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.5 | Retained, `tests/evidence/r1.5` | Author-reported only (PR #108); accepted for the rc boundary, not proof |

The retroactive reviews examined the current code at commit `81e4c7bc`, not
the original pull requests. Four read-only reviewer agents, using a different
model and harness from the Codex automation that produced the code, covered
the R1.2, R1.3, and R1.4 families in four lanes with five lenses: authority
and scope, renderer behaviour, catalog and generation, proof, and release
integrity. Every lane reported findings, including high-severity defects. A
`findings` verdict is not a pass. The review condition for R1.2 through R1.4
is met only when every retained finding records its resolution: a merged fix
commit from the separate fixes pull request, or an explicit accepted reason.

R1.5's generated evidence status moves from `logged-not-retained` to
`checks-retained-review-author-reported`, with this amendment as its basis.
Its review is never described as retained.

## Unchanged

Everything Decision 0022 defers to `S1.0` stays deferred: the `E-R1.1-04`
`DisclosureGroup` manual half (provisional), the manual and
assistive-technology half of `E-R1.2-03` and `E-R1.3-04`, `E-R1.4-04`, the
risk-profile half of `E-R1.5-03`, and the risk-class declaration for every
exported component. The retroactive reviews included no manual or
assistive-technology testing. rc.1 still claims no assistive-technology
support, and every existing accessibility check stays required.

## Authority effect

This corrects how an existing exit condition is evidenced. It adds no Scope
ID, changes no commitment, release boundary, package, platform, support
claim, or non-goal, and makes no milestone complete that its exit does not
already allow. Product Scope records it as the `13.1.1` patch clarification;
the Roadmap's R1 exit entry and Product Scope's release-acceptance bullet are
reworded to match.

This amendment does not publish, change a dist-tag, authorize the final
R1-exit merge, or claim that any check or review passed.

## Reversal

Reversal is append-only. A later amendment may replace the author-reported
R1.1 or R1.5 review with retained review evidence. Historical records are not
rewritten.
