# Acceptance: Decision 0026 amendment 02

- Decision: `muxui:decision:0026:amendment:02`
- Parent decision: `muxui:decision:0026`
- Decision path: `decisions/0026-amendment-02-category-name-queries.md`
- Acceptance path: `decisions/0026-amendment-02-category-name-queries-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026
- Human acceptance: Andrew / `ndrewtran`: “Make the small amendment.”

## Accepted direction

Category-name query expectations. Andrew was shown the case that raised it:
adding the Company records and Task filters blocks makes the poster grid rank
fourth for "collections", where its expectation is within three, because
company-records, poster-grid, and task-filters all score 20 for that query and
ties sort by id. He was asked:

> Small amendment to Decision 0026 and the Roadmap row (recommended). When a new block joins a category, the expectations for that category's name query, such as "collections", may be revised in the same PR. The revision is set before the capture, recorded in the capture's threshold-change log and named in the PR. Every other existing threshold stays fixed.

Andrew answered:

> Make the small amendment.

The amendment records that a growth pull request that adds a block to a
category may revise the expectations for that category's name query, committed
before the main-only capture, recorded in the capture's `thresholdChanges`, and
named in the pull request. It keeps every other existing threshold fixed, and a
revision of any of them still needs a decision. The Roadmap `E-BL1-11` row and
Product Scope's success-measures rule are amended to match.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the amendment, or that the
Company records and Task filters blocks exist.
