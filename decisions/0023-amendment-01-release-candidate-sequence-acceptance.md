# Acceptance: Decision 0023 amendment 01

- Decision: `muxui:decision:0023:amendment:01`
- Parent decision: `muxui:decision:0023`
- Decision path: `decisions/0023-amendment-01-release-candidate-sequence.md`
- Acceptance path: `decisions/0023-amendment-01-release-candidate-sequence-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026
- Human acceptance: Andrew / `ndrewtran`: “R1 exit and Decision 0023 should allow for an unlimited number of rc* bumps.”

## Accepted direction

Any number of release candidates. Andrew's direction was:

> R1 exit and Decision 0023 should allow for an unlimited number of rc* bumps.

The amendment records that R1 may publish any number of exact release
candidates `0.1.0-rc.N` in sequence, each to `next` and each the next number
after the rc `next` points at, without the previous rc being bad or deprecated.
Each rc keeps its own release preparation, `E-R1-EXIT-01` through
`E-R1-EXIT-03` evidence, and publish authorization, and the R1 exit and
`E-R1-EXIT-04` apply to the current verified rc. It keeps the Decision 0023
rollback, the `latest` rules, stable promotion (`S1.0`), the version line, and
every other R1 exit condition unchanged. The Roadmap R1 exit and Product Scope
text that restated the old limit are amended to match.

This direction does not authorize publishing any candidate, deprecating a
version, re-pointing `latest`, or promoting a stable release.

This record does not claim that any check passed, that a pull request was
opened or merged, that the repository has adopted the amendment, or that any
further candidate was prepared, authorized, or published.
