# Decision 0011: R1 React delivery reset

- Status: accepted
- Decision owner: Andrew / `ndrewtran`
- Proposed decision: `core-ui:decision:0011`

## Decision

Core UI returns R1 to ordinary React-library delivery.

- The accepted 53-family inventory and its R1.1-R1.4 allocations are the
  complete React `0.1` implementation scope. They do not require another
  tranche-lock decision, digest acceptance, or per-component authorization.
- Core UI owns every public component contract. React Aria Components `1.20.0`
  remains an internal replaceable substrate. Mux UI styling remains a one-time
  implementation baseline,
  never a dependency or live owner.
- R1 is React-first. Framework-free web, React Native, React Native Web,
  cross-renderer equivalence, RSC/client-boundary support, Scale, stable
  support, and `latest` remain later or separately admitted work.
- Every family committed to React `0.1` must be Core-owned and export-ready by
  the R1 exit. R1.5 is breadth and release closure, not another implementation
  inventory.

## Superseded delivery controls

This decision supersedes only the active R1 delivery procedure created by
Decision 0009 amendment 03 and Decision 0010 amendments 04-09, together with
the active use of Decisions 0007 and 0009's generic delivery-workflow profile
as a repository gate.

The following are no longer prerequisites for an R1 component, evidence, Git,
pull-request, protected merge, cleanup, or Project operation:

- the continuous-execution envelope, manifest, receipt, or bootstrap;
- a task-local `ChangeIntentEnvelope` or R1 operation descriptor;
- the private continuous-execution verifier or generic delivery profile;
- a delivery packet, applicability successor, evidence-continuation record,
  historical-byte compatibility bridge, or digest-bound transition receipt;
- separate human acceptance of a tranche lock, component contract, retained
  evidence packet, routine Git operation, intermediate merge, or Project
  status change.

Decision 0010 amendments 01-03 remain authoritative for React-primary
delivery, Core ownership, the 53-family commitment, React Aria, Mux UI styling,
package graph, platform deferrals, and release boundaries. All earlier
decisions, acceptance records, pull requests, Project events, and retained
evidence remain immutable history. They are not current execution gates.

## Ordinary R1 delivery contract

The accepted Product Scope family table, immutable Stage 1 snapshot, and R1.0
baseline together are the scope lock for all four implementation tranches.
R1.1-R1.4 may proceed from that common baseline in the Roadmap order. Button is
the first visible R1.1 component. Initial Core-owned API and implementation
design inside an already committed family is ordinary delivery work, not a new
product decision.

Each bounded implementation pull request must:

1. change the earliest canonical owners and regenerate their projections;
2. preserve the Core-owned public boundary and keep React Aria internal;
3. apply the approved component styling to Core-owned CSS and token hooks
   without adding an external styling dependency;
4. expose completed work in the private React playground;
5. run focused type, unit, render, CSS, accessibility, generation, and packed
   consumer checks proportional to the exported behavior;
6. receive the repository's normal protected CI and review-bot coverage; and
7. merge only through the protected pull-request workflow when current-head
   checks and reviews are green.

Interactive controls add focused keyboard, focus, state, form, and browser
checks. Composite, collection, overlay, temporal, announcement, or destructive
behavior adds the manual or assistive-technology review named by its actual
risk before export. Non-React components are outside R1 and require no R1
accessibility review. Unchanged shared facts are not reproved per component.

Evidence is retained from the tests and reviews that actually deliver a
tranche. It does not require a separate human evidence-acceptance message.
Comprehensive cross-package, packed-consumer, accessibility, compatibility,
and release proof is assembled at the React prerelease boundary.

## Repository cleanup

The reset implementation must remove the active private delivery workflow and
R1 continuous-execution gate in dependency order while preserving historical
authority and evidence bytes.

It must:

- remove the generic delivery profile runtime, packet/rollback modules,
  fixtures, active template fields, and repository-local routing that exist
  only for that control;
- remove the R1 continuous-execution verifier, operation-descriptor ingress,
  policy registration, and focused tests;
- remove the prematurely materialized R1 ChangeIntent schema/producer and
  their focused tests because they exist only as the retired component gate;
  `SCOPE-AUTHOR-CHANGE-INTENT` remains committed for a later bounded R1.5
  implementation and is not removed from Product Scope;
- remove current-authority compatibility bridges from token and repository
  checks instead of adding Decision 0011 to another byte-identity ladder;
- retain ordinary repository navigation, generation, package, schema,
  component, token, evidence-integrity, planning-policy, CODEOWNERS, protected
  CI, and review-bot checks;
- simplify the pull-request and evidence templates to normal authority,
  change, validation, proof, risk, and rollback information; and
- simplify the repository-local Core UI delivery skill to this ordinary
  protected-PR route.

Historical decisions, acceptance records, retained evidence roots, and their
read-only historical resolvers are not rewritten. A historical resolver may
remain available for explicit audit, but it must not run as current R1
authority or component-entry proof.

After the reset merge is verified, the user-level
`core-ui-delivery-guard` skill and its directly affected references are
reconciled once to the same route: retain Architecture/Roadmap/Product Scope
mapping, canonical ownership, live Project checks, risk-based independent
review, protected Git delivery, and release stops; remove the G1.9
ChangeIntent requirement and mandatory delivery-profile/review-packet digest
ceremony for ordinary R1 work. This user-level skill update is guidance only
and cannot change repository authority.

## Architecture, Roadmap, and Product Scope effect

Architecture records that repository delivery controls cannot become product
or renderer prerequisites and that ordinary component implementation uses
canonical ownership, proportional proof, protected CI, and protected review.

Roadmap records the accepted 53-family table and R1.0 baseline as the existing
lock, removes continuous-verifier entry conditions, keeps every tranche exit
export-complete, and moves the first execution step directly to R1.1 Button and
the remaining simple controls.

Product Scope advances from `6.0.1` to `6.0.2` as a patch clarification. No
Scope ID, commitment, family, tranche membership, public API, platform,
package, dependency, lifecycle, support claim, release boundary, non-goal, or
product meaning changes. `SCOPE-AUTHOR-CHANGE-INTENT` remains committed but is
not a component-delivery prerequisite.

## Project reconciliation

After the reset is accepted, merged, and verified on `main`, one reset-specific
Project reconciliation is explicitly authorized to:

- update the Project README to Product Scope `6.0.2`, Decision 0011, and the
  reset pull request while preserving historical locators; and
- replace issue #76's obsolete continuous-envelope/scope-lock blocker with the
  already satisfied R1.0 plus fixed 53-family scope boundary.

Only after that one-time reconciliation may standing Project synchronization
move R1.1 to `ready`, then to `active` when its first implementation pull
request opens, and perform later Roadmap-proved workflow-status and
pull-request-locator updates.

The Project remains mutable execution state. It cannot change scope, support,
evidence meaning, publication, or release authority. The standing Project
authorization does not select or change scope/authority/evidence references,
priority, iteration, target dates, blockers, assignee, or reviewers.

## Standing execution authorization after acceptance

One exact acceptance of this candidate and its reviewed materialization
authorizes:

- one append-only repository Decision 0011 authority record containing this
  accepted decision, one concise companion Decision issue, and one append-only
  repository acceptance record reproducing Andrew's exact accepted statement
  without inventing a provider timestamp or hosted owner comment;
- the reset topic branch, dependency installation, deterministic cleanup,
  generation, checks, independent frozen-diff review, commit, rebase,
  force-with-lease update, push, non-draft protected pull request, routine
  correction of real CI/review findings, protected merge when green,
  postmerge verification, branch/worktree cleanup, and bounded Project
  reconciliation, followed by the bounded user-level Core UI skill
  reconciliation above;
- continued R1.1-R1.5 implementation through bounded protected pull requests,
  routine dependency and lockfile changes already implied by the accepted
  package graph, focused evidence retention, the bounded Project
  workflow-status/PR-locator synchronization above, and protected intermediate
  merges when current checks and reviews are green; and
- preparation of one open, green, independently reviewed, mergeable R1-exit
  publication-preparation pull request.

No routine tranche, component, evidence, Git, intermediate-merge, or Project
approval prompt is required inside this boundary.

A moving `main`, regenerated projection, routine test correction, or verified
review finding does not by itself expire this authorization. Rebase or rebuild
the affected branch, rerun the relevant checks and current-head review, and
continue when the accepted product meaning, cleanup outcome, and stop
boundaries remain unchanged.

The work stops for Andrew only if it would change a committed family or Core
ownership, add an unapproved runtime/package/platform/support boundary,
require a styling exception that changes the approved visual direction,
waive required accessibility or integrity proof, require RSC or a secondary
renderer, mutate production or a consumer project, publish to npm, change a
dist-tag, or merge the final R1-exit pull request.

## Non-goals and release stops

This decision does not itself implement a component, publish a package, claim
support, deploy, mutate production, or merge the final R1-exit pull request.
Npm publication, any dist-tag mutation, and the final R1-exit pull-request
merge remain separate exact human stops.

## Reversal

Reversal is append-only. A successor decision may restore a smaller delivery
control only after an observed need, but it cannot rewrite historical records
or make that control a component prerequisite without Andrew's explicit new
decision. Implemented source is reverted through an ordinary protected pull
request.

## Proposed acceptance statement

> I accept Core UI R1 delivery reset candidate v1 and authorize its reviewed
> authority and cleanup materialization, protected reset PR and merge when
> green, Project reconciliation, and continued R1.1-R1.5 execution under the
> standing boundary in the candidate. Npm publication, dist-tag mutation, and
> the final R1-exit PR merge remain separate stops.
