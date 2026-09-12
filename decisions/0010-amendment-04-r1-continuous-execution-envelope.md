# Core UI R1 continuous-execution authority candidate v5

Status: proposed authority; digest-specific human acceptance pending.

Decisions:

- `core-ui:decision:0009:amendment:03` for the private delivery and mutation
  authorization model; and
- `core-ui:decision:0010:amendment:04` for the comprehensive React program's
  lock, initial-contract, evidence-acceptance, Project, Git, and implementation
  boundary changes.

Decision owner: Andrew / `ndrewtran`

## Purpose

This candidate replaces repeated routine R1 approval pauses with one bounded,
conditional human authorization. It allows the Core UI delivery lead to carry
the accepted 53-family React program from authority materialization through a
green, independently reviewed R1-exit publication-preparation pull request.

It does not claim that Andrew has inspected future repository or evidence
bytes. Instead, Andrew accepts the closed derivation, proof, review, mutation,
and stop rules in this candidate. A future artifact is admitted under this
standing decision only when deterministic checks prove that it is wholly
inside those rules. Ambiguity, drift, failure, or a decision-bearing delta
fails closed.

## Bound authority and immutable inputs

This candidate is bound to the current protected default-branch source:

- repository: `ndrewtran/core-ui`;
- commit: `d4bba1a5f004d638936b79b673f0b1c4f9691426`;
- tree: `d8aa95775f1bd531b0498ad616e2bd51765fc7fe`;
- Architecture: 135,256 bytes, SHA-256
  `c33f829298748e0c776c63a29449cd27d3cc9519d63d1c3c2b7f0c83d794ec02`;
- Roadmap: 155,544 bytes, SHA-256
  `8006803d050713b104bf485c6c610c2339a65f3e30eb6bf4e1a9222f3a3bdf2b`;
- Product Scope `6.0.0`: 122,969 bytes, SHA-256
  `0cafc0218f0e6795a5d600acb424b4bf514972295c89b48e9042d7faa69a261f`;
- Decision 0009: SHA-256
  `bab49f8c9fde54ccbbab9e1db6196d2e1972b8b7085d053c0efe684d654a1419`;
- Decision 0009 amendment 02: SHA-256
  `eb9c906ba9fb72e58f596f876175c402909dab4998f12c2f14cbd26e5667d8b2`;
- Decision 0010 amendment 03: SHA-256
  `8ad4be538ad7a35a8c03e01af573cad27a06225e4c91eba61bb7e693e498544a`;
- delivery workflow profile: SHA-256
  `bdcee8eeab01b8ff07311e36b422388d36428a362b716f109d463231fbf251c3`.

The only permitted authority transition is the exact materialization manifest
accepted alongside this candidate. To avoid any self-referential digest, the
candidate is frozen first. The manifest then binds the source commit/tree,
every static after-image, the exact write set, this candidate's repository
path and digest, and a deterministic acceptance-record renderer. Andrew's one
approval binds both independent digests.

The authority PR records Andrew's exact approval as an owner comment. The
renderer creates one acceptance record from only the accepted candidate
digest, accepted manifest digest, exact approval text and digest, and immutable
owner-comment URL. A ready-merge review must reproduce the rendered record,
full diff, final tree, comment, and every after-image. Any different path,
byte, input, comment, diff, predecessor, successor, or write-set result fails
closed. After verified protected-branch merge, every later lock, evidence
packet, Project preview, and Git operation binds the repository copies of the
candidate, manifest, and acceptance record.

The immutable comprehensive React inventory remains:

- React Aria Components `1.20.0` at the exact source, tree, subtree, npm
  integrity, evaluation-tool, and family-boundary identities accepted by
  Decision 0010 amendment 03;
- snapshot `catalog/react-r1-0/react-aria-1.20.0-family-evaluation.snapshot.json`,
  168,799 bytes, SHA-256
  `84c57480c61c2f844d3529702cf8864741e97ec0a0495e972c185da00f70a282`;
- snapshot envelope, 442 bytes, SHA-256
  `a3ff037abaad8114dc5b910df1e574e0996df90b4b5403b8de561b756fe7870c`;
- exactly 53 committed families in tranches R1.1 `11`, R1.2 `11`, R1.3
  `24`, R1.4 `7`, and R1.5 `0`;
- 45 new and eight reused immutable Scope IDs exactly as Product Scope 6.0.0;
- 613 raw upstream exports, with 128 family-owned runtime inputs and 485
  internal replaceable substrate exports.

The accepted reusable R1.0 evidence input remains
`tests/evidence/react-r1.0/index.json`, 4,747 bytes, SHA-256
`610717521b7e9d6a74408427637a1cd958399171b1cb677c3a2924f855498cce`,
accepted by Andrew in PR #84 comment `5311377248`. Reuse is conditional on the
current R1 applicability and invalidation rules; it is not unconditional
ancestry-based acceptance.

Apart from the exact materialization transition above, any change to a bound
authority, snapshot, family count, family boundary, Scope ID, tranche
allocation, React Aria identity, styling baseline identity, package graph, ownership
boundary, support boundary, or release boundary invalidates this candidate
before the changed work begins.

## Human decision

Andrew conditionally authorizes the exact R1 execution envelope below.

Within this envelope:

1. An exact R1.1, R1.2, R1.3, R1.4, or R1.5 lock is admitted without a new
   human acceptance when it is deterministically derived from the immutable
   53-family snapshot, Product Scope 6.0.0/6.0.1, the fixed tranche mapping,
   current accepted R1.0 baseline, canonical owner revisions, and the
   milestone's unchanged evidence and non-goal contract.
2. The lock may sequence implementation but cannot select a family, Scope ID,
   public contract, dependency, exception, lifecycle, support claim, or
   release effect outside those owners.
3. Retained tranche evidence is conditionally accepted without a new human
   evidence-acceptance message only when every required deterministic result,
   negative path, risk-selected browser/manual/assistive-technology result,
   privacy and disclosure check, immutable evidence relation, and
   profile-selected independent review is complete and clear for the exact
   frozen source and evidence bytes.
4. This conditional acceptance is the human decision rule; it is not a claim
   that Andrew personally reviewed future evidence bytes. Evidence that cannot
   prove every predicate remains unaccepted and cannot advance the milestone.
5. Routine components inside an admitted lock require no component-level
   authority or approval. Routine corrections made solely to satisfy the
   locked contract may proceed through the same proof and review path.
6. For a family whose initial Core `0.1` public contract is not yet authored,
   Andrew delegates the bounded initial-contract decision to the Core UI
   delivery lead. The lead may select the Core-owned family name, exports,
   props, types, defaults, slots, events, state model, composition, DOM,
   accessibility obligations, and styling hooks needed to realize the exact
   committed family. That decision must be frozen in the tranche lock before
   implementation, independently reviewed, and proved against canonical owner,
   ergonomics, compatibility, accessibility, styling, and React-Aria-
   internal-only rules. It may not expose a raw React Aria API by default,
   import another library's ownership model, add another family, or make a
   stable/support promise. A later breaking change or a contract outside the
   locked family remains decision-bearing and stops.

The delivery lead may continue across R1.1, R1.2, R1.3, R1.4, R1.5, and R1
exit without requesting routine tranche, evidence, Git, pull-request, merge,
or Project approval while every operation remains inside this envelope.

## Exact execution envelope

The permitted execution sequence is:

1. Apply only the exact accepted authority materialization manifest and its
   deterministically rendered acceptance record. The manifest includes the
   seven private compatibility paths named below because the frozen
   Product Scope 6.0.1 successor cannot pass the pre-existing authority graph
   without them. New R1 conformance tooling and tracker migration remain later
   bounded work and are not part of the authority write set.
2. Before any Project migration, R1 lock, component implementation, retained
   evidence, or routine Git operation, implement and merge the private
   R1-continuous-execution conformance verifier through the one bounded
   bootstrap grant below.
3. Use only non-default `codex/` topic branches and isolated worktrees for
   authored changes. Never push directly to `main`.
4. For the authority materialization and every R1 milestone, re-read the
   protected default branch, rebase before PR publication, freeze the exact
   source/diff/evidence, run the profile-selected checks and independent
   reviews, open a real non-draft PR, and wait for all required hosted checks
   and review bots on the current head.
5. Fix in-envelope source, test, evidence, planning-policy, CI, and review-bot
   findings; refreeze and redispatch only the invalidated proof or review
   domains.
6. Merge an intermediate authority or R1.1-R1.5 PR only when its exact current
   head is green, mergeable, independently clear under the canonical profile,
   and the merge method preserves the reviewed history required by its proof.
7. Verify the exact merge parents/tree, default-branch bytes, retained
   evidence, and Project event after every merge. Synchronize the local main
   checkout and clean only successful topic branches/worktrees after those
   checks pass.
8. Continue to the next ready R1 milestone. R1.1-R1.4 may execute in the order
   that minimizes shared-work conflicts, but each fixed tranche remains
   isolated and R1.5 begins only after all four are complete.
9. Prepare R1 exit through the exact RC tarball, release manifest, provenance,
   license/notice material, clean-consumer proof, rollback plan, and final
   registry/version/dist-tag collision and authorization-drift check.
10. Open the final R1-exit publication-preparation PR, complete deterministic,
   independent, hosted, and readiness review, and stop with that exact PR open,
   green, mergeable, and ready for Andrew's final external-mutation decision.

This candidate authorizes ordinary repository-local dependency installation
needed to reproduce the lockfile and run the accepted workspace, and the
already-committed `react-aria-components@1.20.0`, React, and React DOM package
graph. A package already present in the exact pinned React Aria runtime graph
may be declared directly, at its already-resolved compatible version, only
when package-manager correctness or exported Core-owned type resolution
requires the direct declaration; this adds no graph node and must be proved by
the lockfile and packed consumer. Another graph node, runtime capability,
public package, or registry mutation is not authorized.

Force-push is permitted only with `--force-with-lease` to a goal-owned topic
branch after a required rebase or frozen-candidate correction. Deleting a
successful merged goal-owned local/remote branch and worktree is permitted
after postmerge verification. Destructive history rewrites, direct default-
branch pushes, rewriting accepted evidence, and deleting unrelated/user-owned
work remain forbidden.

## Required lock and proof closure

Every automatically admitted lock must contain, or deterministically reference:

- the exact 53-family snapshot and envelope identities;
- its exact fixed family names and immutable Scope IDs;
- Core-owned component/pattern, `web.react` binding, example, package, export,
  CSS, token/style-crosswalk, lifecycle, support, and release owners;
- React Aria internal-only and Mux UI styling/exception rules;
- canonical revisions and a shared-baseline applicability/invalidation result;
- focused implementation sequence and conflict boundaries;
- required evidence IDs, commands, negative paths, risk profiles, manual/AT
  requirements, disclosure, retention, reviewer route, and exit assertions;
- exact Git and Project item mapping; and
- explicit absence of RSC/client-boundary, framework-free web, React Native,
  React Native Web, cross-renderer equivalence, stable, `latest`, public
  catalog/tooling, Scale, and production work.

No generated lock, agent, test, reviewer, Project status, issue close, PR
merge, or hosted check may manufacture a product decision or waive a failed
predicate. Shared proof is reused only while its exact invalidation set is
unchanged. A shared-baseline failure invalidates every affected tranche;
family-local failure blocks that family and its tranche without silently
altering the 53-family commitment.

Manual or assistive-technology evidence required by an exact risk profile is
not converted into automation or waived. If the required environment or
qualified observation is unavailable, the delivery lead may continue
independent work but must leave the affected component and tranche blocked.
That is an execution blocker, not an approval prompt.

## Pre-authority compatibility recovery

The initially accepted seven-record materialization exposed one genuine
fail-closed compatibility gap before commit: the existing token-transition,
delivery-workflow, and R1-entry readers recognized Product Scope only through
6.0.0. The corrected materialization may therefore change exactly these seven
additional private implementation/test paths:

- `packages/tokens/src/internal/default-theme-repository-transition.mjs`;
- `packages/tokens/test/default-theme-repository-transition.test.mjs`;
- `tooling/audits/repository-policy/src/delivery-workflow-authority-verify.mjs`;
- `tooling/audits/repository-policy/src/r1-continuous-authority-compatibility.mjs`;
- `tooling/audits/repository-policy/test/delivery-workflow-authority.test.mjs`;
- `tooling/audits/repository-policy/src/react-aria-stage1-source-verify.mjs`;
- `tooling/audits/repository-policy/test/react-aria-stage1-source.test.mjs`.

These readers may accept Product Scope 6.0.1 only when the exact Decision 0010
amendment 04, canonical materialization manifest, every declared static
after-image, and deterministically rendered owner receipt agree. The receipt
must resolve to one non-zero stage-0 Git blob whose bytes exactly equal the
validated worktree receipt; worktree-only and intent-to-add entries reject.
The token
transition reader must retain its exact 5.0.1 and 6.0.0 compatibility paths;
the delivery-workflow and R1-entry readers must retain their existing
historical and 6.0.0 paths. Every reader must reject absent, untracked,
malformed, mismatched, or partially bound continuous-R1 authority. This
correction owns no product fact. It changes no component,
package, public API, dependency, evidence, Project state, support claim,
publication, or release boundary. Any additional compatibility path or any
change to the accepted 53-family scope returns to Andrew.

## Durable acceptance and conformance prerequisite

The authority materialization must add these canonical repository records:

- this complete candidate at
  `decisions/0010-amendment-04-r1-continuous-execution-envelope.md`;
- its accepted canonical materialization manifest at
  `decisions/0010-amendment-04-r1-continuous-execution-materialization.json`;
- its deterministically rendered acceptance record at
  `decisions/0010-amendment-04-r1-continuous-execution-acceptance.md`; and
- Decision 0009 amendment 03 and Decision 0010 amendment 04, each pointing to
  all three records as the immutable retrieval route.

No operation after exact authority materialization is admitted until the
private owner
`tooling/audits/repository-policy/src/r1-continuous-execution-verify.mjs`
exists on `main`, its focused owner test passes, and the general repository
policy graph invokes it fail-closed. The verifier consumes, but does not
redefine, the candidate, manifest, receipt, current authority, snapshot,
R1.0 baseline, operation descriptor, lock or evidence record, Project
preimage/preview/result when applicable, and Git/PR/check/merge observation
when applicable.

For every operation it must reject missing inputs, unknown fields or operation
kinds, owner/comment mismatch, source or authority drift, snapshot/R1.0
inapplicability, write-set growth, incomplete required proof, uncleared
profile-selected review, hosted-check failure, protected-branch violation,
or an operation at/after the npm-publication or final-R1-exit-merge boundary.
Its canonical output binds all consumed input identities, exact permitted
write set, result, invalidation causes, and next permitted operation.

The one bootstrap exception is limited to implementing that private verifier
and its integration through these paths only:

- `tooling/audits/repository-policy/src/r1-continuous-execution-verify.mjs`;
- `tooling/audits/repository-policy/test/r1-continuous-execution.test.mjs`;
- `tooling/audits/repository-policy/repository-policy.json`; and
- `tooling/audits/repository-policy/README.md`.

The bootstrap may change fewer paths. It may not change a public command,
schema/catalog ontology, package graph, component/runtime source, evidence,
Project state, or release surface. It requires the normal frozen source/diff,
focused and full deterministic checks, independent authority/evidence review,
hosted green checks, protected non-squash merge where history requires it, and
postmerge verification. After that merge, every later operation requires a
passing exact verifier result; there is no second bootstrap exception.

## R1.4 required correction

The current R1.4 exit is inconsistent with the accepted all-53 commitment
because it permits a subset of adequately evidenced bindings to close the
tranche. The minimum authoritative replacement is:

> **Exit:** every component named by the exact R1.4 lock is export-ready and
> has complete evidence for its exact contract and risk profile. Missing
> required proof keeps the component unexported and blocks R1.4 completion. An
> exact alpha publication candidate may be prepared only after all seven R1.4
> families satisfy this exit. No publication, secondary-renderer, stable,
> `latest`, or equivalence claim follows.

The same meaning must replace the stale R1.4 issue/Project locator during the
authorized Project reconciliation.

## Minimum Architecture amendment

Architecture must add this durable rule to the private repository delivery
workflow and R1 build-order contract:

> A designated human may accept one closed, immutable program-execution
> envelope whose inputs, derivation rules, allowed writes, deterministic proof,
> independent review, Git/Project transitions, invalidation conditions, and
> stop boundary are exact. Artifacts later derived wholly inside that envelope
> are conditionally admitted by that standing human decision; the system must
> not claim the human reviewed their future bytes. Drift, ambiguity, failed
> proof, a decision-bearing delta, or an operation outside the envelope fails
> closed and returns to the designated human. Such an envelope cannot waive
> canonical ownership, accessibility/safety, privacy, integrity, protected
> branch, publication, or release requirements and cannot authorize a public
> registry mutation unless that exact mutation is expressly included.

Architecture must also replace R1's per-tranche post-proof human-acceptance
wording with the conditional rule above while retaining deterministic proof,
risk-selected independent review, and all export/support gates.

## Minimum Roadmap amendment

The R1 shared tranche contract must record:

> For the exact 53-family program, the accepted R1 continuous-execution
> envelope is the designated human decision for mechanically derived R1.1-R1.5
> locks and for retained evidence that satisfies every exact deterministic,
> risk, disclosure, immutable-relation, and independent-review predicate. No
> new human message is required for those routine derived artifacts. Any drift
> or decision-bearing delta returns to human acceptance before implementation.

R1.1-R1.4 entry must require an exact conforming lock rather than a separately
accepted lock. R1.5 entry must require the exact mechanically derived closure
lock rather than a separate acceptance. The R1.4 exit must use the exact
replacement above.

R1 exit retains its exact tarball, release manifest, provenance, registry,
checks, rollback, and human publication-authorization requirements. The
continuous goal stops before publication and before the final R1-exit PR merge.

## Product Scope 6.0.1 effect

Product Scope advances from `6.0.0` to `6.0.1` as a patch process
clarification. It changes no Scope ID, commitment, family, public contract,
platform, package, dependency, release boundary, support claim, lifecycle,
non-goal, or product meaning.

The R1 ownership/package/proof wording must replace separate per-tranche lock
and post-proof human acceptance with this rule:

> The accepted R1 continuous-execution envelope supplies the standing human
> decision for an exact mechanically derived tranche lock and exact retained
> evidence only when every closed derivation, deterministic proof,
> risk-selected manual/AT requirement, disclosure, immutable identity, and
> profile-selected independent-review predicate passes. This is conditional
> admission, not a claim that the human inspected future bytes. Any mismatch or
> decision-bearing delta fails closed and returns to human acceptance.

All 53 committed outcomes and the React `0.1` package-only prerelease boundary
remain unchanged. No publication follows from Product Scope 6.0.1.

## Decision 0010 amendment 04 effect

Decision 0010 amendment 04 is append-only. It does not rewrite amendment 03,
change the 53-family registry, or claim that its original acceptance covered
this later execution model. It expressly replaces only these amendment-03
boundaries for work performed under the exact accepted continuous-execution
envelope:

1. In amendment 03 lines 195-199, `accepted tranche lock` becomes `exact
   mechanically derived tranche lock admitted by the accepted continuous-
   execution envelope`, and `post-proof human evidence acceptance` becomes
   `conditional evidence acceptance under the accepted continuous-execution
   envelope after every exact deterministic, risk-selected manual/AT,
   disclosure, immutable-relation, and independent-review predicate passes`.
2. In lines 241-247, `each exact lock are accepted` becomes `each exact lock is
   deterministically proved conforming to the accepted continuous-execution
   envelope`; the tranche retains all focused deterministic proof,
   risk-selected independent review, applicable manual browser/AT proof,
   packed-consumer validation, and failure evidence, while the separate future
   human evidence message is replaced only by the standing conditional human
   decision in this candidate.
3. Lines 256-260 remain unchanged: every registry mutation still requires its
   own exact publication authorization and final collision/drift check.
4. Lines 299-304 are replaced only for this program: the fresh Project
   migration remains exact, fail-closed, and independently verified, but this
   candidate's digest-specific human acceptance is its authorization, so no
   second migration acceptance or mutation prompt is required.
5. Lines 308-325 remain historical statements about what amendment 03 itself
   authorized. Amendment 04 separately authorizes the repository, Git,
   Project, implementation, evidence, and intermediate-merge operations in
   this candidate, but not npm publication or final R1-exit PR merge.

Amendment 04 also records the delegated initial Core `0.1` family-contract
decision exactly as stated in this candidate. This delegation is bounded to
the already committed 53 family outcomes, must freeze each initial contract in
its conforming lock before implementation, and does not admit raw React Aria
public ownership, another family, another runtime graph node, stable support,
or a later breaking contract revision.

Decision 0010 amendments 01-03 remain authoritative for every meaning not
expressly replaced above. If amendment 04 is absent, unaccepted, mismatched, or
superseded, the original separate-acceptance boundaries remain in force.

## Project authorization

After the authority materialization is verified on `main`, the delivery lead
may prepare, verify, and apply the deterministic Product Scope 6.0.1/R1
migration without another human approval.

The migration may only:

- update the Project README from stale 5.0.1/Decision-amendment-02 locators to
  Product Scope 6.0.1, Decision 0010 amendment 03, PR #86, the immutable
  53-family snapshot, and the repository candidate, manifest, acceptance
  record, Decision 0009 amendment 03, Decision 0010 amendment 04, and verified
  authority PR identities required by the accepted manifest;
- create and link the one decision/architecture-maintenance issue needed for
  this amendment using the repository's current issue contract;
- update issues and Project items #76-#81 to the exact fixed tranche families,
  Scope IDs, evidence IDs, authority refs, entry/exit wording, blocked-by
  relations, acceptance commands, and PR locators derived from current
  Architecture, Roadmap, Product Scope, and the snapshot;
- move a milestone item through `not-ready`, `ready`, `active`,
  `evidence-review`, and `complete` only when the Roadmap-owned entry or exit
  predicates for that exact item are proved;
- link exact PRs and reflect explicit issue/PR events through the live enabled
  workflow mapping; and
- preserve all historical issue text as append-only audit material when a
  mutable locator correction can be expressed as an appended reconciliation.

The migration must re-read the Project identity, README, 25-field schema, all
views, all enabled workflows, item IDs, issue bytes, and status options before
each write; generate an exact mutation preview; reject drift, new fields,
unexpected items, unknown workflow behavior, or a write-set expansion; apply
idempotently; and re-read every result. It may not select priority, iteration,
dates, assignees, reviewers, new scope, support, release acceptance, or another
milestone.

## Decision-bearing stop conditions

The goal must stop and return to Andrew before the affected work begins if it
would require any of the following:

- changing the 53 families, family boundaries, immutable Scope IDs, tranche
  membership, React Aria `1.20.0` identity, or styling baseline identity;
- adding a runtime dependency, public package, public command, durable
  relation, schema/ontology owner, platform, renderer, or support claim not
  already admitted by the exact lock;
- a public contract outside the delegated initial `0.1` family-contract rule,
  a breaking revision to a frozen tranche contract, or a contract that cannot
  pass the required independent ownership/ergonomics/compatibility review;
- a decision-bearing styling exception or another decision-bearing visual
  direction;
- a security, privacy, integrity, accessibility, platform-safety, lifecycle,
  compatibility, stable-promotion, or release-boundary exception;
- RSC/client-boundary, `@core-ui/web`, React Native, React Native Web,
  cross-renderer equivalence, Scale, public catalog/tooling, or production
  work;
- waiving, replacing, or fabricating deterministic, manual/AT, independent
  review, evidence, protected-branch, or hosted-check requirements;
- changing Project fields or planning choices outside the exact migration and
  event-synchronization rules above;
- an unavailable credential, provider permission, required test environment,
  namespace control, registry state, or other external prerequisite that
  cannot be resolved within already configured task-relevant access; or
- npm publication, final R1-exit PR merge, `latest`, or stable `0.1.0`.

Routine source/API design inside an exact committed family contract is not a
new product decision merely because implementation details require engineering
judgment. The delivery lead remains accountable for those decisions and must
preserve the canonical owner, public contract, risk profile, and tranche lock.

## Git, release, and production boundaries

These paired Decision 0009 amendment 03 and Decision 0010 amendment 04
authorizations permit repository authoring, dependency installation,
generation, testing, evidence capture, task-local review packets, commits,
goal-owned branch/worktree operations, pushes, non-draft PR creation and
updates, intermediate protected PR merges, postmerge cleanup, and the exact
Project operations above after this amendment is accepted.

It authorizes no direct default-branch push, npm publish, dist-tag change,
package deprecation/unpublish, deployment, production mutation, consumer
project mutation, daily-driver preview mutation, stable promotion, support
expansion, or final R1-exit PR merge.

The final registry/version/dist-tag collision and authorization-drift check is
read-only and required immediately before the final handoff. The exact
publication and final merge remain Andrew's later explicit decision.

## Historical, reversal, and failure boundary

Decision 0009, amendments 01-02, Decision 0010 and amendments 01-03, Product
Scope 6.0.0, PRs, issues, Project events, releases, and retained evidence remain
immutable historical facts. This amendment does not rewrite, recertify, or
silently accept them.

Before execution begins, rejection leaves the current authority unchanged.
After acceptance, reversal is an append-only Decision 0009 amendment and the
minimum affected Architecture/Roadmap/Product Scope reconciliation. Completed
releases and retained evidence are never rewritten. In-flight work stops at a
safe boundary, remains unclaimed, and is either resumed under a compatible
successor or abandoned through normal protected history.

## Exact materialization and commencement

The accepted materialization is the separate canonical manifest presented
with this candidate. Its deterministic acceptance-record renderer is the only
dynamic step. Before the authority PR opens, source movement or any candidate,
manifest, static-after-image, or write-set change returns to Andrew. After the
owner comment exists, only its immutable URL and exact accepted text/digest may
populate the receipt template. Ready-merge review freezes and verifies the
resulting full diff and final tree; any other change returns to Andrew.

One digest-specific human approval of this exact candidate and exact manifest
may also authorize:

- preparing and applying the exact minimum authority materialization on a
  non-default topic branch;
- committing, rebasing, force-with-lease updating, pushing, opening, reviewing,
  and merging that authority PR when green;
- verifying default-branch materialization;
- creating the continuous R1 goal;
- applying the authorized Project migration; and
- executing the complete bounded sequence above without routine approval
  prompts.

Before commencement, the accepted candidate must receive the canonical
pre-write authority review. Materialization must receive the profile-selected
frozen-diff review and required deterministic/hosted checks. A reviewer is
advisory and cannot broaden this grant.

The continuous goal begins only after the accepted authority is materialized
and verified on the protected default branch. It ends at the final R1-exit
publication-preparation PR handoff described above or at the first genuine
stop condition. No token budget is implied.
