# Decision 0009 amendment 01: descendant source resolution

Status: Accepted.

Acceptance: Andrew / `ndrewtran` approved the exact 4,418-byte authority
candidate at SHA-256
`27dd45d4df42d62e597651c064c5dd074a584d0afb132f29760ea1d0cee882b7`.
The task-provenance acceptance is recorded in
`decisions/0009-amendment-01-descendant-source-resolution-acceptance.md`.

## Observed defect

Decision 0009 is accepted and remains authoritative. Its current source-identity resolver admits only the exact accepted source commit, its evidence-only child, or their protected two-parent merge. As a result, an ordinary later commit that descends from the protected merge cannot run the repository checks, even when the Decision 0009 authority and retained historical evidence are unchanged.

## Human decision

The evaluated revision, `HEAD`, may resolve Decision 0009 only when protected merge `4ff5f4b8e08e3735febe46c639e760b1da269777` is its Git ancestor.

Descendant resolution does not make the descendant a Decision 0009 source commit, evidence child, protected merge, evidence continuation, recertification, or current-evidence claim. It grants no acceptance, clearance, readiness, support, release, or completion status.

Successful resolution returns historical source commit `63dee2c988759ec803f71a0353a6630bf612826c`, tree `7ff715b1f7585af00a46474ed6840717d38353d6`, and applicability `not-evaluated`, never the descendant revision or tree.

The accepted topology is exact: protected merge `4ff5f4b8e08e3735febe46c639e760b1da269777` has ordered parents `7ede0cbb758b8306ecab1a7cdcec55a1b3505a64` and evidence child `082b93fdf6f1e279f5a6e32372f43d553df7852c`; that evidence child has sole parent `63dee2c988759ec803f71a0353a6630bf612826c`; the evidence child and protected merge share tree `5b4e2aa4191abc77a4dd13435777242e702e79bf`; and the historical source has tree `7ff715b1f7585af00a46474ed6840717d38353d6`.

At `HEAD`, `decisions/0009-delivery-review-readiness.json` must have SHA-256 `bab49f8c9fde54ccbbab9e1db6196d2e1972b8b7085d053c0efe684d654a1419`, `decisions/0009-delivery-review-readiness-acceptance.json` must have SHA-256 `563011b263a0f5f697673fedcab11560b8c37387432d80cfdfbeec069ccfa6dd`, and `tests/evidence/authority-58-delivery-review-readiness-applicability-v1` must have Git tree `a2175fc53bc0e283f89deb870f1d92aada69bfd3`.

Resolution must fail closed when any required ancestry, parent order, sole-parent relationship, tree, path, or content identity is absent, altered, or ambiguous. Evidence applicability remains governed by its canonical owner and is not inferred from ancestry.

## Authority effect

This is append-only amendment 01 associated with Decision 0009, not a new numbered decision. The original decision, acceptance receipt, source commit, evidence-only child, protected merge, and historical evidence remain immutable and authoritative for their original claims. The amendment corrects only how later repository revisions locate that accepted historical identity.

Architecture, Roadmap, and Product Scope require no amendment. Their commitments, milestones, public surfaces, packages, renderer boundaries, supported-platform claims, and release boundaries do not change.

## Non-goals

This decision authorizes no implementation, verifier change, evidence continuation or generation, historical rewrite, dependency change, component work, renderer work, Project mutation, package publication, support claim, release change, or production change.

It does not weaken evidence invalidation, applicability, supersession, withdrawal, privacy, disclosure, or release proof requirements. It does not accept Decision 0010 or modify its candidate or pull request.

## Later implementation boundary

Implementation is separate work after this exact amendment is accepted and materialized. That work may change only the Decision 0009 source-identity resolver and focused tests needed to prove the accepted descendant rule and its fail-closed boundaries. It must not generate a new applicability continuation merely because an unrelated descendant commit is being checked, and it must not treat ancestry as evidence applicability.

Any change to evidence meaning, continuation policy, protected historical bytes, public behavior, Product Scope, renderer behavior, support, package, or release boundaries requires its own authority and review.

## Reversal

Reversal is an append-only superseding decision that restores exact-topology-only resolution or replaces it with another accepted rule. Reversal does not rewrite Decision 0009 or historical evidence. Until the later implementation is merged, current behavior remains unchanged and fail-closed.
