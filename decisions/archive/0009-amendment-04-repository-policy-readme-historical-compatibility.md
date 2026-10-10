# Decision 0009 amendment 04: repository-policy README historical compatibility

- Decision ID: `core-ui:decision:0009:amendment:04`
- Parent: Decision 0009 and amendments 01-03
- Status: accepted only when the companion acceptance record binds this exact
  decision through Andrew's digest-specific statement
- Decision owner: Andrew / `ndrewtran`

## Context

Decision 0009 recorded `tooling/audits/repository-policy/README.md` as a source
artifact at historical commit `63dee2c988759ec803f71a0353a6630bf612826c`.
The accepted R1 prerequisite now requires that mutable operator runbook to
document descriptor-free source inspection, explicit operation verification,
and external review clearance. The original authority verifier incorrectly
compares the future current README with the historical artifact entry.

## Decision

Add `tooling/audits/repository-policy/README.md` as the seventh and final closed
Decision 0009 historical-artifact compatibility path. Resolve its original
artifact entry only from historical source commit
`63dee2c988759ec803f71a0353a6630bf612826c` and require exactly 1,429 bytes with
SHA-256 `d3a55d931f9e29e26fa76d0b38c139d1da28b0d73575d42d1457cd27b20f523b`.

The current README path must continue to exist as a regular repository file and
remain subject to current repository-policy checks. Historical resolution
authenticates only the original Decision 0009 artifact fact. It does not accept
current README meaning or permit historical bytes to satisfy current proof.

The current README path must additionally remain a tracked stage-0 Git index
entry with mode `100644`. The verifier uses documented Git porcelain-v2 index
status to reject both an index deletion and the `DA` intent-to-add state created
by `git rm --cached` followed by `git add -N`, while allowing ordinary tracked
entries whose mutable worktree bytes differ.

The six amendment-01 historical compatibility paths remain unchanged. Every
other Decision 0009 artifact continues to require exact current-worktree bytes.
No caller-selected source, wildcard, generalized resolver, evidence
continuation, recertification, readiness, support, release, or completion claim
is admitted.

## Implementation boundary

The compatibility implementation is limited to
`tooling/audits/repository-policy/src/delivery-workflow-authority-verify.mjs`
and its focused test at
`tooling/audits/repository-policy/test/delivery-workflow-authority.test.mjs`.
It binds this decision and its companion acceptance record, adds only the exact
README path to the historical set, proves current-path existence and historical
identity, and preserves all other current-byte checks.

## Scope and reversal

Architecture, Roadmap, Product Scope 6.0.1, public behavior, packages,
dependencies, evidence, Project state, publication, and release boundaries do
not change. Reversal is append-only and preserves the historical README and all
Decision 0009 authority and evidence bytes.
