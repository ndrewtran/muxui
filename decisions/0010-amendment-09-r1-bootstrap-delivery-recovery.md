# Decision 0010 amendment 09: R1 bootstrap-delivery recovery

- Decision ID: `core-ui:decision:0010:amendment:09`
- Parent: Decision 0010 and amendments 01-08
- Status: Candidate; accepted only when the companion append-only acceptance
  record binds this exact decision through Andrew's digest-specific statement
- Decision owner: Andrew / `ndrewtran`
- Affected phase: the private R1 continuous-execution prerequisite before R1.1
  activation

## Context

Amendment 07 requires an explicit current `ChangeIntentEnvelope` verification
immediately before the recovered PR #92 branch update and says that its
pre-prerequisite exception cannot be reused for PR #92. The accepted ten-path
implementation makes every ordinary operation require the verified PR #92
bootstrap merge and its authenticated postmerge receipt. Its special
`verifier-bootstrap` operation is deliberately postmerge-only. The required
pre-push verification therefore cannot exist before the merge that installs
the verifier and its owner.

The frozen ten-path source proves the contradiction directly. A pre-merge
`verifier-bootstrap` fails with `R1_CONTINUOUS_BOOTSTRAP_HOSTED_REQUIRED`,
because only an authenticated postmerge provider observation is admitted. A
pre-merge `routine-git-operation` with action `push` fails with
`R1_CONTINUOUS_BOOTSTRAP_REQUIRED`, before its `ChangeIntentEnvelope` can be
verified. Descriptor-free source inspection remains read-only and grants no
write, Git, review, merge, Project, publication, release, or completion
authority. External review cannot waive this deterministic sequencing failure.

## Decision

Admit the exact recovered PR #92 ten-path ChangeIntent prerequisite as the
sole one-time bootstrap delivery that may precede its own authenticated
postmerge bootstrap receipt.

The exception authorizes only this closed sequence:

1. After the accepted amendment-09 authority is protectively merged and
   verified, reconstruct the exact ten-path prerequisite as a sole topic child
   of that exact merge.
2. Bind the implementation's current authority commit/tree and
   decision/acceptance identities to amendment 09 while preserving amendments
   07 and 08 as immutable parent authority.
3. Commit the frozen ten-path child with Andrew's authorship, force-push only
   the existing `codex/r1-change-intent-prerequisite` branch, and update only
   the existing PR #92.
4. Run ordinary protected CI in descriptor-free, nonauthorizing
   `source-inspection` mode.
5. Externally dispatch and clear the fresh profile-selected
   `core-ui-schema-catalog-reviewer`, `core-ui-evidence-reviewer`, and
   `core-ui-release-reviewer` contracts against the frozen current head.
6. Merge PR #92 only through the protected intermediate-merge workflow when
   its exact head, required checks, external reviews, mergeability, disclosure
   boundary, and protection are current and clear.
7. On the exact merged default-branch result, run the special authenticated
   postmerge `verifier-bootstrap` operation and retain its task-local receipt.

No ordinary `ChangeIntentEnvelope`, prior substantive verifier result, or
bootstrap receipt is required for those exact bootstrap-delivery transitions,
because PR #92 installs the sole owner and verifier that can produce them.
This is not a new ChangeIntent operation kind and does not enter the closed
ChangeIntent schema.

The exception is consumed only by the exact verified PR #92 merge. After its
authenticated postmerge bootstrap pass, every tranche lock, component or
evidence write, routine Git/PR/merge/cleanup transition, and Project operation
must again bind the exact current task-local `ChangeIntentEnvelope`, passing
substantive verifier result, and authenticated bootstrap receipt required by
the accepted implementation. No later bootstrap or recovery exception is
implied.

## Authority correction

This amendment supersedes only:

- amendment 07 decision item 5 insofar as it requires an impossible
  pre-bootstrap ChangeIntent for the exact PR #92 bootstrap delivery;
- amendment 07's PR #92 sequence insofar as it requires that same impossible
  pre-push and pre-merge operation result; and
- amendment 08's general continuation wording only to the extent necessary to
  admit the exact amendment-09 authority delivery and exact PR #92
  bootstrap-delivery sequence before the receipt exists.

Amendments 07 and 08 otherwise remain immutable and in force. Deterministic
source inspection, deterministic operation verification, and external review
clearance remain separate gates. Ordinary protected CI remains descriptor-free
and nonauthorizing; reviewer dispatch and outcomes remain external
orchestration-owned inputs; every object and operation combination in the
ChangeIntent v1 grammar remains closed; and Product Scope, the component
inventory, canonical ownership, evidence, publication, and release boundaries
do not change. Npm publication and the final R1-exit PR merge remain separate
human stops.

## Exact authority materialization

The pre-acceptance authority materialization is confined to these nine paths:

1. this decision;
2. `strategy/monorepo-architecture.md`;
3. `strategy/milestone-roadmap.md`;
4. `packages/tokens/src/internal/default-theme-repository-transition.mjs`;
5. `packages/tokens/test/default-theme-repository-transition.test.mjs`;
6. `tooling/audits/repository-policy/src/r1-continuous-authority-compatibility.mjs`;
7. `tooling/audits/repository-policy/test/delivery-workflow-authority.test.mjs`;
8. `tooling/audits/repository-policy/src/react-aria-stage1-source-verify.mjs`;
9. `tooling/audits/repository-policy/test/react-aria-stage1-source.test.mjs`.

After digest-specific acceptance, one derived append-only acceptance record is
the tenth and final authority path. It reproduces Andrew's exact accepted
statement and the candidate, materialization-diff, and execution-manifest
identities. It claims acceptance only and does not claim an issue, branch,
commit, push, PR, check, review, merge, implementation, Project update,
publication, or release.

No workflow, Product Scope, schema, package manifest, lockfile, generated
projection, evidence root, component, renderer, binding, CSS, token, example,
or public surface changes in this authority materialization.

## PR #92 boundary and preserved authority

After the amendment-09 authority merge is verified on `main`, PR #92 remains
confined to the exact ten paths already accepted by amendments 07 and 08. Its
prior source, proof, packet, review, hosted, and transition identities are
stale and must be rebuilt as a sole child of the exact amendment-09 merge.
No schema grammar, operation kind, public API, or write-set expansion is
admitted.

Product Scope remains exactly `6.0.1`. The Stage 1 inventory remains exactly
53 Core-owned React family outcomes with unchanged R1.1-R1.4 tranche
membership and R1.5 `53/53` closure. React Aria Components `1.20.0` remains
an internal replaceable substrate, and Mux UI styling remains a one-time
implementation baseline,
never a dependency or live owner.

This recovery authorizes no component implementation beyond the accepted
private prerequisite, no dependency or lockfile change, no component export,
support claim, stable lifecycle, secondary renderer, RSC/client boundary,
public package, npm publication, deployment, or production change.

## Expiry, stop conditions, and reversal

Stop and return to Andrew if the accepted base or any candidate/materialization
identity changes; the authority materialization exceeds nine pre-acceptance or
ten final paths; Product Scope, the 53-family boundary, tranche, package,
dependency, operation kind, schema grammar, reviewer ownership, React Aria,
styling, publication, or final-merge boundary changes; PR #92 exceeds its
exact ten paths or introduces a public surface; a deterministic check or
mandatory independent review fails; Project reconciliation exceeds its bounded
README locator update; or npm publication or the final R1-exit PR merge is
reached.

Reversal is append-only. Before PR #92 merge, supersede this amendment and
leave the private prerequisite unavailable. After PR #92 merge, disable the
private entrypoint first and revert only the exact implementation paths where
no later accepted owner depends on them. Preserve every historical decision,
acceptance, review, Project, PR, and evidence byte.
