# Repository policy audit

This package owns Mux UI's deterministic repository-policy checks. For delivery
work, begin with the repository [route map](../../../AGENTS.md), then read the
canonical Architecture, Roadmap, Product Scope, and relevant evidence owner.
The repository entrypoint audits navigation, ownership, generated output, and
artifact naming.

This package implements the root `pnpm check`, `pnpm check:all`, and
`pnpm release:prepare` commands. Their scopes and proof rules are in the root
route map's Verification section. The runner rejects a mix of component,
package, and file selectors, and scoped work needs no task-local operation
descriptor.

## Pull request CI routing

GitHub pull requests use `src/ci-impact.mjs` to plan checks from the merge-base
to head diff. The plan is printed as JSON before checks run. PR text and labels
do not establish ownership or narrow proof. Canonical React records, generated
Storybook page IDs, changed importer paths, and explicit owner routes determine
the checks. A route the planner cannot resolve widens the plan and prints a
notice saying what widened and why; only a lockfile change whose consumers
cannot be identified fails.

Component runtime and CSS changes select the affected React families, their
verified named test cases and browser proofs, and every Storybook page in those
families. A family's tests are found by name: `test/<slug>.test.mjs` and
`test/browser/<slug>.test.mjs` in the React package. Only a test that does not
follow that name needs an entry in `FAMILY_EXTRA_TESTS` in
`src/component-test-selection.mjs`, and a family that no test names runs its
source group whole. A changed authored example or Storybook story export
selects only its canonical page ID. Theme/token changes run their compiler and projection checks
with theme color and contrast proofs, without component keyboard suites.
Documentation-only changes run the documentation owner. Catalog guide changes
run the catalog, documentation, and `@muxui/tooling` checks, because guides
compile into the catalog that the tooling queries and dense goldens render. Scale-only changes
run the theme-authoring checks, and Scale source also runs the documentation
owner that embeds it. Either route runs the Scale docs browser test, which
builds the docs site first. Repository-policy, workflow, policy-run fixture, and
retained evidence changes run the policy checks. Mixed changes combine and
deduplicate those scopes.

The PR planner prepares ignored React or Storybook metadata only when those
owners are needed to resolve canonical families or page IDs. A full workspace
plan is reserved for identified workspace-wide inputs such as the Node/pnpm
toolchain, workspace layout, or shared root dependency/engine fields. Lockfile
changes route through verified workspace importers; changes whose consumers
cannot be resolved fail with an actionable ownership error. Manual and
scheduled CI keep the explicit full graph and broad browser checks.

Local `pnpm check --files <paths>` and the default changed-owner `pnpm check`
run the Storybook lane CI would plan for the same paths: the story-index
generation check, any focused Storybook unit tests, and the scoped page audits,
each with CI's `MUXUI_STORYBOOK_*` environment, one after another in the lane.
`--files` plans exactly the given files against the merge base with
`MUXUI_BASE_REF` (default `origin/main`); the default scope plans the changed
paths it collects, uncommitted, new, and deleted files included. The runner
loads `planStorybookCommands` from `src/ci-impact.mjs` after generation, so the
page index is current; `--preview` plans from the existing index. Other
dependents of the selected paths keep their full package checks. If CI plans no
Storybook proof for the paths, the lane is skipped with a printed notice. The
lane keeps the full Storybook audit, with a printed notice naming the cause,
when the selection is more than one CI shard (80 pages in total), when the
planner widens to the full workspace, needs a page index that is missing, or
throws, or, in the default scope, when a forced-full Storybook event is active
(`--files` rejects that event with `MUXUI_TASK_SCOPE_CONFLICT`). `pnpm check:all`,
`--package`, `--component`, and generation commands keep their existing
semantics.

Storybook's own-interface colour proofs (manager and docs paint, onboarding,
create-story, and the docs ArgsTable) prove the private host, not the library
(Decision 0030). The full plan skips them on a push to `main` through
`MUXUI_STORYBOOK_UI_PROOF=skip` and keeps them on the weekly schedule and
manual runs; a pull request that changes Storybook configuration or theme plans
the manager and docs proof. `pnpm release:prepare` sets the same switch.

## Release lineage

`.github/workflows/npm-publish.yml` builds a candidate once (Decision 0030).
`src/release-lineage.mjs` is the part of that workflow that reads GitHub runs.
A dry run asks `main-ci` for the push run of `ci.yml` on `main` at its exact
commit. It reuses that run only when the run succeeded and every group of the
full plan, recomputed from the commit, has a successful job; otherwise it runs
the full `pnpm release:prepare`. A publish run does not rebuild: `dry-run`
verifies the dry run named by `dry-run-id`, read as one attempt; `fetch-candidate`
downloads that artifact's ZIP by the verified id, checks it against the API
digest, accepts only the two expected file names, and extracts them itself into a
fresh directory outside the checkout; and `candidate` verifies the version,
sha512, and manifest before the approval gate. The tests are
`test/release-lineage.test.mjs`.

Evidence capture and disclosure remain owned by the architecture, Product Scope,
package, and evidence references. See
[`tests/evidence/README.md`](../../../tests/evidence/README.md) before retaining
proof.

## Identity-reset compatibility

`identityReset.current` is the live Mux UI identity. The audit rejects legacy
machine/display names, package scopes, namespaces, executable command tokens,
completion helpers, experimental namespaces, fixture keys, and historical
object keys in current sources. No public package API exposes a legacy alias or
compatibility mode.
