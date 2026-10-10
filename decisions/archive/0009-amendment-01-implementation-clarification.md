# Decision 0009 amendment 01: implementation clarification

Status: Accepted.

## Human authorization

Andrew / `ndrewtran` authorized this exact bounded correction in the current
Codex task:

> I authorize a minimal append-only implementation clarification and verifier
> compatibility change for Decision 0009 amendment 01. The verifier may
> validate the amendment-authorized resolver and test paths against their
> historical Decision 0009 identities while retaining current-byte checks for
> every other bound artifact.

No GitHub comment or approval timestamp is claimed.

## Exact compatibility rule

The original Decision 0009 artifact entries for these six
amendment-authorized implementation paths remain
historical facts and must match their bytes at historical source commit
`63dee2c988759ec803f71a0353a6630bf612826c`:

- `tests/evidence/delivery-review-readiness-applicability-profile.mjs`
- `tests/evidence/delivery-review-readiness-applicability-profile.test.mjs`
- `tooling/audits/repository-policy/src/evidence-verify.mjs`
- `tooling/audits/repository-policy/test/evidence-integrity.test.mjs`
- `tooling/audits/repository-policy/src/delivery-workflow-authority-verify.mjs`
- `tooling/audits/repository-policy/test/delivery-workflow-authority.test.mjs`

The last four paths are included only because the verifiers host and test this
self-referential compatibility rule and its applicability-manifest behavior;
requiring their historical Decision 0009 hashes from their changed current
bytes would make the authorized verifier change impossible.

The authority verifier may resolve only those six original entries from that
historical commit. Applicability manifests may substitute historical bytes only
for those same paths. All six current paths must still exist and their current
behavior remains subject to the repository's deterministic checks. Every other
Decision 0009 artifact entry and applicability-manifest path continues to
require exact current-worktree bytes.

This clarification authorizes no additional verifier exception, evidence
continuation, historical rewrite, strategy or Product Scope change, dependency
change, renderer or component work, support claim, package publication, release
change, Project mutation, or production change.
