# Decision 0021: retired strategy and decision history archive

- Status: accepted user direction; repository adoption through a protected
  pull request with Andrew's CODEOWNERS review
- Decision owner: Andrew
- Scope: tracked strategy history and superseded decision records
- Change record: issue #168
- Effective: on merge

## Decision

Andrew directed that retired strategy and decision history be moved out of the
tracked authority documents, following the archive-to-stub approach of
[Decision 0015](./0015-authority-retirement.md). Decision 0015 is the
precedent only; its authorization does not cover this history, so this record
authorizes it.

Decision 0011 states that historical decisions and acceptance records are not
rewritten. As an explicit exception to that rule, this decision authorizes
replacing the 15 records listed below with retired stubs. Each stub keeps its
original path and title and names this decision and its recovery path. Decision
0011's supersession of those records, and every other historical decision,
acceptance record, and retained evidence root, stay as they are.

## Archived content

Strategy sections:

- `strategy/product-scope.md`: the Product Scope 6.0.0 amendment (with its
  evidence, Project-boundary, non-goal, and acceptance subsections) and the
  6.0.3 and 6.0.4 clarifications. This applies the document's existing
  statement that pre-8.0 amendments live only in the archive.
- `strategy/milestone-roadmap.md`: the Historical Gate 2 bodies for G2.0-G2.3
  and G2.7, the completed and superseded G0, G1, and G2 rows of the historical
  milestone register, the "Recommended first execution sequence", and the
  historical pre-R1.6 icon affordance clarification.
- `strategy/monorepo-architecture.md`: the historical pre-R1.6 icon affordance
  dependency boundary and the gate-era Build order bodies for Gate 0, React
  delivery, Gate 2, and Gate 3.

Decision records, all superseded by Decision 0011:

- `decisions/0009-amendment-03-r1-continuous-execution.md`
- `decisions/0010-amendment-04-r1-continuous-execution.md`
- `decisions/0010-amendment-04-r1-continuous-execution-acceptance.md`
- `decisions/0010-amendment-04-r1-continuous-execution-envelope.md`
- `decisions/0010-amendment-04-r1-continuous-execution-materialization.json`
- `decisions/0010-amendment-05-r1-policy-entrypoint.md` and its acceptance
- `decisions/0010-amendment-06-r1-change-intent-owner.md` and its acceptance
- `decisions/0010-amendment-07-r1-external-review-ci-recovery.md` and its
  acceptance
- `decisions/0010-amendment-08-r1-readme-historical-compatibility-recovery.md`
  and its acceptance
- `decisions/0010-amendment-09-r1-bootstrap-delivery-recovery.md` and its
  acceptance

Decision 0009 amendment 04 and its acceptance are not superseded by Decision
0011 and are not archived.

## Preserved meaning

Content that still carries current meaning moves instead of leaving:

- Product Scope keeps the fixed 53-family React registry, the
  `SCOPE-REACT-BREADTH-001` and `SCOPE-METRIC-REACT-COVERAGE` meanings, and the
  53-family change rule under its React `0.1` prerelease boundary.
- The Roadmap keeps the G2.4-G2.6 bodies and the optional G2.4-G2.6 and Gate 3
  register rows, which still define admitted optional capabilities, plus a
  successor map for later references to Gate 2.
- Architecture keeps the build-order principles, and the Lucide semantics,
  license-notice, and proof-invalidation rules that the archived icon boundary
  declared still binding.

Product Scope advances from `12.1.0` to `12.1.1` as a patch. No Scope ID is
added, removed, or transitioned, and no commitment, release boundary,
platform, package, public surface, support claim, lifecycle, non-goal, or
milestone state changes. Current commitments, immutable Scope IDs, the
React-first Mux-owned API, the fixed 53-family R1 floor and current
supplemental mapping, deferred native and framework-free tracks, and the
publication, release, and final-merge stops are unchanged.

## Recovery

Exact pre-change bytes of every changed strategy file, `README.md`, and each
stubbed decision record are preserved in the ignored local recovery area
`.migration-archive/20261003-decision-0021/authority-originals/`, mirroring
repository paths, with a `SHA256SUMS` manifest beside it. The archive is
recovery-only and ignored. Reversal restores those bytes.

This decision authorizes the described repository cleanup only. It does not
accept evidence, rewrite Git history, change retained evidence under
`tests/evidence/`, update the Delivery Project, publish, deploy, or perform
another external mutation.
