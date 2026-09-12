# Decision 0010 amendment 08: R1 README historical compatibility recovery

- Decision ID: `core-ui:decision:0010:amendment:08`
- Parent: Decision 0010 and amendments 01-07
- Status: accepted only when the companion acceptance record binds this exact
  decision through Andrew's digest-specific statement
- Decision owner: Andrew / `ndrewtran`
- Affected phase: private R1 ChangeIntent prerequisite recovery

## Context

Decision 0010 amendment 07 requires the exact ten-path PR #92 prerequisite and
its full repository-policy proof. That proof fails because Decision 0009's
historical README artifact is still resolved from current bytes. Decision 0009
amendment 04 corrects the historical/current boundary without changing product
semantics.

That boundary includes tracked stage-0 README index ownership at mode `100644`.
The compatibility verifier rejects the Git porcelain-v2 `DA` intent-to-add state
while continuing to allow mutable current README worktree bytes.

## Decision

Admit Decision 0009 amendment 04 and its exact two-path compatibility
implementation as the only additional authority prerequisite before PR #92.
The compatibility delivery is separate from PR #92. PR #92 retains exactly the
same ten implementation paths accepted by amendment 07.

After this recovery authority is protectively merged and verified, reconstruct
PR #92 as a sole topic child of that exact recovery merge. Its private
ChangeIntent authority binding identifies this decision and its acceptance
record while retaining amendment 07 as immutable parent authority. Every prior
PR #92 source, proof, packet, review, hosted result, and transition result is
stale and must be rebuilt.

Descriptor-free protected CI remains nonauthorizing source inspection. Every
authorized write and external transition continues to require exact current
ChangeIntent verification. Reviewer dispatch and clearance remain external
orchestration inputs. The Project README reconciliation remains after verified
PR #92 merge, and issue #76 remains `not-ready` until its separate entry proof
passes.

## Preserved authority and stops

Architecture, Roadmap, and Product Scope remain byte-unchanged. Product Scope
stays 6.0.1 with the same 53 families, tranche membership, Core-owned public
contracts, internal React Aria Components 1.20.0 substrate, and Mux UI styling
baseline.

No component, schema grammar, operation kind, package, dependency, lockfile,
catalog, generated output, renderer, binding, CSS, token, example, evidence,
support, lifecycle, public API, publication, Project, or release change is
authorized. Npm publication and the final R1-exit PR merge remain separate
exact human stops.

## Expiry and reversal

Any compatibility path beyond the Decision 0009 authority verifier and its
focused test, any PR #92 path growth, any generalized historical resolution,
or any product, evidence, Project, publication, or release effect expires this
decision. Reversal is append-only and preserves all historical authority,
acceptance, evidence, PR, and Project bytes.
