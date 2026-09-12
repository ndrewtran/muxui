# Decision 0010 amendment 07: R1 external review and CI recovery

- Decision ID: `core-ui:decision:0010:amendment:07`
- Parent: Decision 0010 and amendments 01–06
- Status: accepted only when the companion append-only acceptance record binds
  this exact decision through Andrew's digest-specific statement
- Decision owner: Andrew / `ndrewtran`
- Affected phase: the private R1 continuous-execution prerequisite and its
  protected intermediate delivery

## Context

Independent review of the frozen local PR #92 recovery source exposed three
incompatible assumptions in amendment 06: repository code was asked to
authenticate task-local reviewer assignments and outcomes; deterministic
operation verification was conflated with post-proof review clearance; and
the repository-policy entrypoint required a task-local operation descriptor
from ordinary protected CI even though CI is read-only. The admitted
ChangeIntent schema also left three affected-closure fields optional and two
nested object shapes open.

These are required corrections to the accepted continuous-execution control.
They do not change the R1 product commitment.

## Decision

1. `@core-ui/schema` remains the sole owner of the private closed
   `ChangeIntentEnvelope` grammar. `@core-ui/tooling` remains the sole owner of
   its private read-only producer and validator. Repository policy consumes
   the exact envelope and never re-authors its objective, write set, affected
   closure, checks, confirmation, or invalidation.
2. ChangeIntent may derive the canonical review roles required for later
   orchestration. Reviewer assignment, dispatch, work, outcome, and clearance
   are external orchestration-owned inputs. Repository code must not create,
   authenticate, or clear them and must not accept caller-authored review
   records as deterministic proof.
3. Deterministic source inspection, deterministic operation verification, and
   external review clearance are separate gates. A pass in one gate cannot
   manufacture or waive another.
4. Descriptor-free repository-policy execution is a read-only
   `source-inspection` mode, including during ordinary protected CI with a
   substantive PR diff. It validates authority, prerequisite lineage, source,
   policy, generation identity, and the deterministic workspace graph. It
   authorizes no operation, review clearance, Git or Project transition,
   evidence acceptance, merge, publication, release, or completion.
5. This exact digest-bound authority recovery is the sole pre-prerequisite
   exception because it necessarily delivers the correction first. After its
   protected merge, every authorized R1 repository or evidence write and every
   Git, PR, protected merge, Project, cleanup, or other external transition
   requires an explicit task-local ChangeIntent verification against its exact
   current preimage immediately before the transition. Drift invalidates the
   result. The exception cannot be reused for PR #92 or later work.
6. Post-proof review begins only after source, diff, deterministic outputs,
   disclosure boundary, and packet are frozen. The root orchestrator dispatches
   the profile-selected independent reviewers and binds their external results
   to that exact packet and source. Ready-merge clearance additionally binds
   current protected hosted state. The repository verifier does not claim
   either clearance.
7. The ChangeIntent v1 grammar is closed completely: every object schema is
   closed; `affected.sourceRevision`, `affected.artifacts`, and
   `affected.requiredChecks` are required; relation items contain only required
   `source`, `target`, and `type` strings; deferred items contain only required
   `capability`, `readiness`, and `earliestBoundary` strings; operation kind,
   action, and effect-class combinations form one finite conditional grammar;
   every admitted external transition binds its exact preimage and result
   identity; and the completed operation result binds its journal and
   deterministic results without a repository-authored review result.

Amendment 06 remains immutable owner-admission history. This amendment
supersedes only its incompatible repository-owned review proof,
descriptor-required read-only CI, incomplete schema grammar, and associated
proof wording.

## Gate ownership

- **Source inspection:** repository-owned and deterministic; descriptor-free;
  read-only; never reusable as operation authorization.
- **Operation verification:** repository-owned and deterministic; exact
  descriptor and ChangeIntent required; authorizes only the named operation
  against the named preimage; never clears review.
- **Post-proof and ready-merge review:** root-orchestration-owned; assignments
  and outcomes are external inputs; profile independence and immutable packet,
  source, output, disclosure, hosted-state, and invalidation bindings apply.

No layer can manufacture another layer's result. A deterministic failure
cannot be waived by review, and a reviewer finding cannot be waived by a
deterministic pass.

## Exact implementation boundary

The authority materialization itself has nine exact pre-acceptance paths: this
decision, Architecture, Roadmap, the existing default-theme authority consumer,
the sole R1 authority compatibility owner, and the React Stage 1 consumer. A
focused existing test for each consumer is also updated. A derived append-only
acceptance record is the tenth and final authority path.
The three compatibility sources admit only the exact amendment-07 successor
while preserving amendment 04 history, the exact amendment-06 predecessor,
Product Scope 6.0.1, and the Stage 1 snapshot. They do not create a reviewer,
clearance, product, evidence, or release owner. The generic delivery profile
and schema remain byte-unchanged.

After this authority is accepted, merged through a protected authority PR,
and verified on `main`, the recovered PR #92 may change exactly these ten
paths and no others:

- `packages/schema/schemas/change-intent-envelope.schema.json`;
- `packages/schema/test/change-intent-envelope.test.mjs`;
- `packages/tooling/src/change-intent.mjs`;
- `packages/tooling/src/index.mjs`;
- `packages/tooling/test/change-intent.test.mjs`;
- `tooling/audits/repository-policy/README.md`;
- `tooling/audits/repository-policy/repository-policy.json`;
- `tooling/audits/repository-policy/src/cli.mjs`;
- `tooling/audits/repository-policy/src/r1-continuous-execution-verify.mjs`;
- `tooling/audits/repository-policy/test/r1-continuous-execution.test.mjs`.

No workflow change is required or admitted. The entrypoint itself distinguishes
descriptor-free source inspection from descriptor-required operation
verification. The existing local and remote PR #92 sources are design inputs
only; their proof and review claims are stale. The recovered branch must be a
freshly rebased or reconstructed sole topic child of the verified amendment-07
merge and must rerun every required check and review.

## Required proof and review

The authority materialization requires exact path and byte verification,
Decision 0010 compatibility verification, the React Stage 1 exact 53-family
source check, `pnpm generate:check`, `pnpm check`, `pnpm check:all`, protected
planning-policy CI, and a fresh `core-ui-authority-reviewer` result on the exact
head.

The recovered implementation requires strict schema compilation; recursive
closed-object and missing/unknown-field fixtures; positive and negative source-
inspection and operation-verification fixtures; rejection of caller-supplied
review assignment, result, or clearance; exact source/diff/write-set/result
and hosted-state drift checks; the three focused package checks;
`pnpm generate:check`; `pnpm check` in descriptor-free inspection and explicit
operation modes; `pnpm check:all`; protected CI; and the fresh external
`core-ui-schema-catalog-reviewer`, `core-ui-evidence-reviewer`, and
`core-ui-release-reviewer` contracts on the frozen actual packet.

## PR #92 and Project sequence

Deliver this authority first through its own issue and protected non-draft PR.
Its accepted candidate, materialization diff, execution manifest, exact path
set, checks, external authority review, and hosted state are its complete and
non-reusable pre-prerequisite grant.
After its exact default-branch merge is verified, reconstruct or rebase the
ten-path prerequisite, verify ChangeIntent before the authorized force-push,
update the existing PR #92 rather than create a duplicate, let ordinary
protected CI run in source-inspection mode, dispatch external reviews after
proof, and merge only when current-head checks, reviews, mergeability, and
protection are clear. Verify the exact merge and default-branch bytes.

No Project mutation occurs during authority or prerequisite work. Only after
PR #92 postmerge verification may the already accepted bounded Project README
reconciliation replace its one stale current-authority paragraph. It may add
Product Scope `6.0.1`, Decision 0010 amendments 01–07, the amendment-07 merge,
and the merged PR #92 locator while preserving historical locators and the
non-authoritative status warning. It may not change an item, issue, field,
status, view, workflow, tranche, priority, iteration, release target, evidence,
support, or completion state. Issue #76 remains `not-ready` until its separate
entry conditions pass.

## Preserved authority and stops

Product Scope remains exactly `6.0.1` and every immutable Scope ID remains
unchanged. The accepted Stage 1 inventory remains exactly 53 React Aria
Components `1.20.0` families with unchanged R1.1–R1.4 membership and R1.5
`53/53` closure. Core UI owns every public contract. React Aria remains an
internal replaceable React substrate. Mux UI styling remains a one-time
implementation baseline, never a dependency or live owner.

This decision authorizes no component, catalog, binding, renderer, CSS, token,
example, dependency, package, lockfile, generated projection, evidence,
support, lifecycle, platform, publication, or release change. Npm publication
and the final R1-exit PR merge remain separate exact human stops.

## Non-goals, expiry, and reversal

This amendment does not add a trusted repository reviewer, review-receipt
format, proof cache, general CI bypass, public command, apply engine, new Scope
ID, secondary renderer, RSC boundary, support claim, or release authority.

Any authority, Product Scope, 53-family, tranche, implementation path,
operation kind, confirmation, reviewer-ownership, React Aria/styling, publication,
or final-merge boundary change expires this decision and returns to Andrew.
Reversal is append-only: disable the private entrypoint first, remove only the
exact implementation paths where no later accepted owner depends on them, and
preserve all decision, acceptance, review, Project audit, and historical
evidence bytes.
