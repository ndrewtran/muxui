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
retained evidence changes run the policy checks. The declared publish set,
`publish-set.json` (`pullRequestImpact.publishSetInputs`), also runs the `@muxui/tooling`
check, whose packed-entry test takes its allowed edges from it. Mixed changes combine and
deduplicate those scopes.

React browser tests run in per-engine groups, in pull requests and in the full
plan. A test that calls the harness's `browserEngines()` runs once in each of
`browser-chromium`, `browser-firefox`, and `browser-webkit`; every other browser
test runs once, in `browser-chromium-only`; unit tests stay in `react`. A group
installs only its own engine. A component check leaves its browser tests to
these groups (`MUXUI_COMPONENT_SKIP_BROWSER_TESTS=1`) and keeps their case
filters. A long list splits into numbered shards, such as `browser-firefox-2`:
more than six cross-engine files, or more than 18 Chromium-only files. A file's
shard is a hash of its path, so shards keep their identity as the selection
changes. A pull request that selects test files shards a cross-engine list at
most two ways and the Chromium-only list at most three. A plan that runs the
whole browser suite (main, the weekly run, and a pull request that needs the
full React proof) keeps the cross-engine groups whole, so main's matrix stays
near 14 jobs, and shards `browser-chromium-only` three ways. Main runs Scale's
browser checks, including the docs build, in the last of those shards; pull
requests keep them in the `browser-chromium` family, so reuse routes a docs or
Scale change to the same family in every plan. Reuse treats a browser group and
its shards as one family: a change routed to any shard reruns its siblings, and
a shard is reused only when its id and file list match.

Each group's `timeoutMinutes` limits its checks step. A group that installs
Firefox or WebKit (`browserEngines` is set) also gets a 30 minute setup
allowance in `jobTimeoutMinutes`, the job limit, because Playwright's apt
install of system libraries can crawl on a slow runner-image mirror. The
workflow bounds that install step to 25 minutes, inside the allowance, so a
stalled install fails by itself and never spends the checks limit.

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

### Check groups

The package checks run in independent CI groups so the two long suites overlap
instead of queueing behind the rest: `checks-policy` (this package),
`checks-tooling` (`@muxui/tooling`), and `checks` (every other package check,
the root `generate:check`, and the Storybook generation and unit checks). Each
group repeats the plan's generation prerequisites in its own runner, keeps the
`checks` kind (the 30-minute timeout and per-group reuse of an earlier pass),
and exists only when it has work. Main and scheduled runs plan the same groups
from the workspace packages: one `pnpm --filter <package> run check` per package
with a `check` script except React and Storybook, which have their own groups,
checked in dependency order within `checks`.

### Retained-evidence tests

The `test/evidence-*.test.mjs` files were four minutes of this package's five
when they were one file: `evidence-integrity.test.mjs` (the retained BL1 and R1
evidence and the capture tools) and the growth audit over an archive of HEAD,
split into `evidence-growth-scope`, `-catalog`, and `-normalization` around the
fixture they share, `evidence-growth-repository.mjs`. `evidence-growth-platform-safety`
compiles real trees from history instead, so the normalization of trees from before
platform safety resolved from registry defaults is held to what history holds. The package has two
scripts. `check` runs the repository audit, `evidence-verify.mjs`, and every other
test file. `check:evidence` runs `evidence-verify.mjs` and the evidence files, one
process each, with `--test-concurrency` set to their count so a small runner still
overlaps them (the growth files compile the catalog about twenty times and are the
longest). The fixture archives HEAD without `tests/evidence/`, which the audit
reads from the checkout and which was most of the bytes, and a test holds its
tree to HEAD's tree minus that directory, so it cannot stop standing for the
repository. The integrity tests re-derive each retained capture from git many
times, so they cache reads of a commit's objects for the run.

A pull request's `checks-policy` group runs `check:evidence` only when the change
reaches what the tests load or read, through imports or as data:

- `pullRequestImpact.evidenceInputs` lists path prefixes (a trailing slash is a
  directory): `tests/evidence/`, the policy modules the suite imports, the
  `test/evidence-` files (the tests and the fixture they share),
  `apps/docs/src/lib/block-presets.ts`, `packages/react/src/r1-deferred-evidence.mjs`,
  Decision 0022, which the R1 exit capture reads, and the data the growth audit
  and its fixture read from the archive of HEAD: `.github/workflows/`,
  `strategy/platform-safety-contract.json` (the compiler reads it), and the root
  `.gitignore` (a conservative input: the fixture force-adds, so no ignore file
  changes what its commits hold).
- `evidenceInputPatterns` lists regular expressions for path classes:
  every `package.json` (the audit checks each workspace package's version and
  publish configuration), a `.gitattributes` at any depth (`git archive` of HEAD
  honors `export-ignore` and `export-subst` from every directory, so a nested
  file can drop a file the fixture reads), the hosting and deployment file names
  the audit rejects (copied from `hostingPaths` in
  `tests/evidence/bl1/boundary-audit.mjs`), and `apps/*/astro.config.*` (the
  audit checks Astro site settings).
- `evidencePresenceInputs` lists files the tests only look up by name
  (`README.md`, `pnpm-lock.yaml`, the React stylesheet, and the `pattern-<slug>`
  browser tests): adding or removing one runs the tests, editing it does not.
- The packages this package depends on (catalog, schema, tokens, tooling) are
  loaded by the tests, so a change to one runs them through the workspace links,
  as it ran policy before.
- A policy lockfile importer change, and a path no route owns, run them too.

Decisions, strategy other than the safety contract, guidance, and the planner and
its tests skip it. The route tests pin these lists, fail when a module the suite
imports is not planned by them, and fail when a path class the audit or fixture
reads as data does not plan `check:evidence`. The growth fixture does not depend
on incidental HEAD state: it stages with `git add -f`, so an ignore rule, at any
depth, cannot drop its own negative controls (a guard fails an unforced `git add`
there), and computes its version bumps from the current version. Main,
scheduled runs, `pnpm check`, `pnpm check:all`, and `pnpm release:prepare`
always run both scripts: the workspace runner adds `check:evidence` beside any
run that includes this package.

## Release preparation and lineage

A release is the declared publish set, `publish-set.json` (Decision 0032):
`@muxui/schema`, `@muxui/catalog`, `@muxui/tooling`, and `@muxui/react`, in publish
order, each with its directory and the Mux UI packages it may depend on at runtime.
Release preparation (`src/release-prepare.mjs`), the packed-entry tests of
`@muxui/tooling`, and the publish workflow all read it. Every other workspace
package stays private, and the source manifests of the set stay private too: packing
sets `private: false` on the candidate copy only.

`MUXUI_RELEASE_VERSIONS=<name>=<version>,...` gives every member one version, an
rc of its source version (`<source version>-rc.N`; `@muxui/react` is `0.1.0-rc.N`).
The workflow builds it from its version inputs. Without it, a local preparation
takes `-rc.1` for each member. Each tarball is repacked deterministically with the
rc version, `private: false`, no scripts or development dependencies, the release
commit as `gitHead`, and sibling edges as `^<rc>` ranges. The catalog's generated
files are compiled for its rc outside the checkout, and tooling's catalog range is
refused unless the catalog major is the query API major. Preparation audits every
tarball against its declared entries, files, and dependencies (`E-P2.1-01`), checks
that each React descriptor binding is exported by its installed module and stamps
the descriptor with the release id and commit (`E-P2.1-02`), installs all four
tarballs into one isolated pnpm consumer, keeps the React pnpm, npm, and yarn matrix,
and rehearses `npm publish --dry-run` for each tarball in order.

One portfolio release manifest (`muxui-portfolio-release-v1`, `src/release-manifest.mjs`)
correlates the tuple: source commit and tree, each package with its role
(`published` or `reused`), integrity, and provenance, the catalog, contract
versions, descriptor and compatibility profile digests, evidence and exception
digests, and the rollback plan. Its digest excludes how the checks ran, so the same
commit and versions give the same digest. `verifyPortfolioRelease` holds the manifest to
the tarball bytes and recomputes what it records instead of trusting it: the catalog
bundle against its declared digest, sidecars, module, and release record, the contract
versions, the renderer descriptor and its export identities, the exception digests, the
evidence indexes as committed at the release commit, and the publication and rollback
plans. It rejects repacked bytes under a version, a package missing from the tuple, a
published package built from another commit, and a reused package that is not exactly the
record of the earlier manifest that published it or whose compatibility no longer holds.
This release publishes all four packages; reuse is modeled and tested only.

`.github/workflows/npm-publish.yml` builds a candidate once (Decision 0030).
`src/release-lineage.mjs` is the part of that workflow that reads GitHub runs and
checks the candidate set. A dry run asks `main-ci` for the push run of `ci.yml` on
`main` at its exact commit. It reuses that run only when the run succeeded and every
group of the full plan, recomputed from the commit, has a successful job; otherwise
it runs the full `pnpm release:prepare`. It then verifies its own candidate with
`prepared` and uploads the four tarballs and the manifest. Publish mode refuses a
package set before it reads anything, because the publish job still publishes one
tarball; the ordered publish job is a later change. The promotion steps are written
for the set: `dry-run` verifies the dry run named by `dry-run-id`, read as one
attempt; `fetch-candidate` downloads that artifact's ZIP by the verified id, checks
it against the API digest, accepts only the expected file names, and extracts them
itself into a fresh directory outside the checkout; and `candidate` verifies the
versions, the `@muxui/react` sha512, and the manifest against the commit. The tests are
`test/release-set.test.mjs`, `test/release-manifest.test.mjs`, and
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
