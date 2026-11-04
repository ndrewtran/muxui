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
test runs once, in `browser-chromium-only`; unit tests stay in `react`. The full
React package check runs every top-level test file once, so a plan that has it
adds a separate command only for a selected unit test below `test/` or one that
runs in every engine. A group installs only its own engine. A component check leaves its browser tests to
these groups (`MUXUI_COMPONENT_SKIP_BROWSER_TESTS=1`) and keeps their case
filters. A long list splits into numbered shards, such as `browser-firefox-2`:
more than six cross-engine files, or more than 18 Chromium-only files. Each list
is packed into its shards by measured cost, described below, and a file lands in
the same-numbered shard in every engine. A pull request that selects test files shards a cross-engine list at
most two ways and the Chromium-only list at most three. A plan that runs the
whole browser suite (main, the weekly run, and a pull request that needs the
full React proof) shards each list two ways, so a shard runs about eight
minutes. Scale's browser checks, including the docs build, run in the
`browser-scale` group in every plan, main included, whatever the React browser
layout is, so reuse routes a docs or Scale change to the same group whichever
plan ran the earlier pass. Reuse treats a React browser group and its shards as
one family: a change routed to any shard reruns its siblings, and a shard is
reused only when its id and file list match.

Shards are packed by cost so that none is the long pole. `browser-test-costs.json`
lists seconds for each `test/browser/<file>.test.mjs`, measured in one engine. The
planner sorts a list by cost, largest first (ties by path), and puts each file in the
shard with the least total so far (ties to the lowest index), so two shards differ by at
most the cost of the largest file. Adding or removing a file, or changing a cost, can
move other files between shards, and a shard whose file list changed reruns once
instead of being reused.

The table is a contract, not advice: every React browser test file is listed and every
entry is a real file. Every plan, in every mode, checks that before it plans anything,
and fails with `MUXUI_CI_IMPACT_BROWSER_TEST_COST_DRIFT`, naming the files with no
entry and the entries with no file, so a slow new test cannot be packed as if it were
short. Add each new file with whole seconds measured in one engine, or remove the
entry of a file that is gone. To measure, take a recent run of `main` and read the logs
(`gh api repos/<owner>/<repo>/actions/jobs/<jobId>/logs --allow-escape-sequences`)
of its `run browser-chromium-1` and `run browser-chromium-2` jobs for the
cross-engine files and its `run browser-chromium-only-1` and
`run browser-chromium-only-2` jobs for the rest. Sum each top-level test's
`(NNNms)` duration into the file that declares it (a subtest is already inside its
parent's time) and round to whole seconds, at least 1. Every cost must be a positive
whole number: the planner fails with `MUXUI_CI_IMPACT_BROWSER_TEST_COST_INVALID`,
naming the entry, instead of packing with a value it cannot add.

Browser tests open pages on `load` and then wait for the suite's own readiness
signal, never `networkidle`, which adds a fixed 500 ms quiet window to every open and
waits for nothing a test asserts on. React tests use `awaitFontsAndFrames` from
`test/browser/harness.mjs`; Scale's docs tests use `previewsRendered` or `measured`
from `test/browser/docs-site.mjs`. Every plan, in every mode, reads the `.mjs` files
under `packages/react/test/browser`, `apps/scale/test/browser`, and
`apps/react-storybook/test`, so a pull request that changes only a test file is
checked too. It parses each file and fails with
`MUXUI_CI_IMPACT_BROWSER_TEST_NETWORKIDLE`, naming each file whose code has a
`networkidle` string literal or a template literal with no substitutions; a
mention in a comment is ignored, and a file that does not parse is matched as text
for a quoted `networkidle` instead. A file that needs it for its own purpose goes in
`networkidleAllowlist` in `src/ci-impact.mjs` with the reason; a test fails when an
allowlisted file is gone or no longer uses it.

GitHub's Free plan runs 20 jobs at once, and a job over that queues instead of
failing. Main plans 15 groups. A full-proof React pull request plans 19 run jobs,
and 21 when a theme change adds the two Storybook theme groups; the Storybook
groups come last in the matrix and are the shortest browser-driven jobs, so they
are the ones that wait for a free slot.

Each group's `timeoutMinutes` limits its checks step: 20 minutes, or 15 for
Tailwind. The longest clean step is the React suite at about 11 minutes, so
duration creep fails the job instead of passing silently. A group that installs
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

In a pull request run the plan job uploads the metadata it prepared
(`generatedMetadataDirectories`) as a one-day artifact, but only when
generation left the tracked tree clean: a head whose tracked generator outputs
are stale prints a notice naming the changed files and skips the handoff, so
each group regenerates them locally as it always did and no proof changes. Each
group that runs restores the artifact and sets `MUXUI_CI_METADATA_READY=1` only
when the restore succeeded. The group then skips the generation of
`@muxui/react-storybook` and its dependencies, as if it had run it, only when
the React contract and the Storybook manifest are both there. A restore missing
either is discarded whole and the group generates the metadata itself, as it
does when the artifact is missing. Main, scheduled, and manual runs do not use
the artifact.

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
when the selection is more than one CI shard (120 pages in total), when the
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
`checks` kind (the 20-minute timeout and per-group reuse of an earlier pass),
and exists only when it has work. Main and scheduled runs plan the same groups
from the workspace packages: one `pnpm --filter <package> run check` per package
with a `check` script except React and Storybook, which have their own groups,
checked in dependency order within `checks`. The Tailwind consumer fixture's
install and check take about a minute, so they run last in `checks-tooling`
whenever the plan has it; a plan without the tooling check keeps a `tailwind`
group.

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
  directory): `tests/evidence/`, the policy modules the suite imports (the release
  modules and `publish-set.json` that the portfolio capture fixture builds a
  release from, with the registry fake and tuple fixture under `test/`), the
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

`MUXUI_RELEASE_VERSIONS=<name>=<version>,...` names every member, and gives each package
the release publishes one version, an rc of its source version
(`<source version>-rc.N`; `@muxui/react` is `0.1.0-rc.N`). A member with an empty version
(`<name>=`) is reused, as described below. The workflow builds the variable from its
version inputs, so an empty input reuses its package. Without the variable, a local
preparation takes `-rc.1` for each member. Each tarball is repacked deterministically with the
rc version, `private: false`, no scripts or development dependencies, the release
commit as `gitHead`, and sibling edges as `^<rc>` ranges. The catalog's generated
files are compiled for its rc outside the checkout, and tooling's catalog range is
refused unless the catalog major is the query API major. Preparation audits every
tarball against its declared entries, files, and dependencies (`E-P2.1-01`; a third-party
dependency must be a registry range or dist-tag equal to the source's, so no path, link,
Git, URL, shorthand, or alias passes), checks
that each React descriptor binding is exported by its installed module and stamps
the descriptor with the release id and commit (`E-P2.1-02`), installs all four
tarballs (a reused package's from the registry, see "Reusing packages") into one
isolated pnpm consumer, keeps the React pnpm, npm, and yarn matrix, and rehearses
`npm publish --dry-run` for each tarball the release publishes, in order.

One portfolio release manifest (`muxui-portfolio-release-v1`, `src/release-manifest.mjs`)
correlates the tuple: source commit and tree, each package with its role
(`published` or `reused`), integrity, and provenance, the catalog, contract
versions, descriptor and compatibility profile digests, evidence and exception
digests, and the rollback plan. Its digest excludes how the checks ran, so the same
commit and versions give the same digest. `verifyPortfolioRelease` holds the manifest to
the tarball bytes and recomputes what it records instead of trusting it: the catalog
bundle against its declared digest, sidecars, module, and release record, the contract
versions, the renderer descriptor and its export identities, the exception digests, the
evidence indexes, lockfile, and token source as committed at the release commit, the
`react` correlation block (lockfile, generated outputs, catalog, token and binding-spec
identities, and the icon visual contract; absent when `@muxui/react` is reused), and the
publication and rollback plans. It rejects repacked bytes under a version, a package missing from the tuple, a
published package built from another commit, and a reused package that is not exactly the
record of the earlier manifest that published it (a manifest for the commit the record
names) or whose compatibility no longer holds.

Release preparation compares the proposed versions with the prior portfolio release:
`MUXUI_PRIOR_RELEASE_MANIFEST` names it (read as committed at the release commit, and it
must be listed with its digest by the `index.json` of its `tests/evidence` route), or
`MUXUI_FIRST_PORTFOLIO_RELEASE=true` declares the first one, which holds only while no
tracked file is a portfolio release manifest.
`src/release-effects.mjs` classifies the change by Architecture "Version units and
compatibility" and rejects versions that are too small, go backwards, or release an
unchanged unit. Classification is conservative: a change without a precise rule is
major. A unit with no stable release admits any change in its first base's rc series.
The `E-P2.1-04` corpus is in `test/fixtures/version-effects/`. The workflow's dry run
takes them as the `prior-release` (a tracked `tests/evidence/` path ending `.json`) and
`first-portfolio-release` inputs, exactly one, and the outcome is recorded in the
manifest as `preparation.verification.versionEffects`. Publish mode promotes that dry
run and does not derive it again.

`.github/workflows/npm-publish.yml` builds a candidate once (Decision 0030).
`src/release-lineage.mjs` is the part of that workflow that reads GitHub runs and
checks the candidate set. A dry run asks `main-ci` for the push run of `ci.yml` on
`main` at its exact commit. It reuses that run only when the run succeeded and every
group of the full plan, recomputed from the commit, has a successful job; otherwise
it runs the full `pnpm release:prepare`. It then verifies its own candidate with
`prepared` and uploads the published tarballs and the manifest. Publish mode promotes
that dry run without building: `dry-run` verifies the dry run named by `dry-run-id`,
read as one attempt; `fetch-candidate` downloads that artifact's ZIP by the verified
id, checks it against the API digest, accepts only the expected file names, and
extracts them itself into a fresh directory outside the checkout; and `candidate`
verifies the versions, the sha512 of each published tarball, and the manifest against
the commit. A package is published exactly when its version input is not empty, and
the manifest's role for it must say so. For a reused package, `candidate` and
`prepared` fetch the tarball from the registry again, hold it to the recorded
integrity and to the registry's attestation of it (see "Reusing packages"), and verify the
tuple with it against the manifest of the release that published it. All of that runs in the `prepare` job, which has no OIDC access, so a
candidate from another commit, another workflow, or other versions ends the run
before the `publish` job starts.

### Reusing packages

The first portfolio release publishes all four packages. A later release publishes only the
packages whose version units changed and reuses the rest (Decision 0032 item 9,
`E-P2.1-03`). The interface is one signal: a package whose version input is empty is
reused. `MUXUI_RELEASE_VERSIONS` always names every member, so a package left out of it is
an error and not a reuse, and the workflow's inputs `version`, `schema-version`,
`catalog-version`, and `tooling-version` are optional for that reason. Reuse needs a prior
release (`prior-release`, never `first-portfolio-release`), and a release publishes at least
one package. A reused package keeps the version, digest, and provenance of the record in
the prior manifest; the new manifest marks its role `reused` and verifies its compatibility
with the new tuple. There is no second list of reused packages to disagree with the first.

Preparation (`src/release-prepare.mjs`, with `planReuse` in `src/release-effects.mjs`):

- reads the reused records from the prior manifest and the manifest that published each
  (the prior one, or for a package the prior release itself reused, the manifest of the
  release before it, which must be retained as `tests/evidence/**/release-manifest.json` at
  the release commit). Each of those manifests is retained evidence: tracked at the
  release commit under a route whose `index.json` lists its path with the sha256 of exactly
  those bytes (`readIndexedArtifact`). A manifest of a wanted release that its route does
  not list, or two different manifests of one release, stop the release;
- fetches each reused tarball from the public registry by its exact version before packing
  anything and verifies it (`verifyReused`, `fetchReusedTarball`, below). A reused package is
  never repacked;
- then verifies their signatures with `npm audit signatures` (`verifyReusedSignatures` in
  `src/release-proof.mjs`, below). It runs only when something is reused;
- takes the reused packages' versions as their recorded ones, so the version check
  (`E-P2.1-04`) reads a reused package as proposing its prior version. An unchanged package
  at its version passes. A changed package at its version is refused (`P2_1_VERSION_NOT_AHEAD`
  for a unit, `P2_1_VERSION_PUBLICATION_MISSING` for the schema or tooling), and so is a
  package whose recorded range no longer admits a sibling's new version
  (`P2_1_VERSION_RANGE_BROKEN`). A version given to a package that did not change is refused
  as before (`P2_1_VERSION_UNIT_UNCHANGED`). Nothing is reused silently;
- runs the set consumer, descriptor audit, and compatibility checks on the real tuple: the
  published candidates and the fetched bytes together. A reused `@muxui/react` also gets the
  audits and consumer proofs a packed one gets, against the current sources, with the release
  and commit it records in place of this release's. Its `react` correlation block stays that
  of the release that published it, so the new manifest has none;
- writes the published tarballs, in publish order, and the manifest. The `npm publish
  --dry-run` rehearsal covers the same packages.

What authenticates a reused package. A retained manifest that agrees with its own digest
proves nothing about the bytes, because a repack can update every digest it records and
recompute its own. The check that does not rest on the repository is the registry's
attestation of the original publish. For each reused package, `verifyReused` reads the
version document and then the attestation at its `dist.attestations.url`, and stops unless
all of this holds:

- the version document names the recorded integrity and an SLSA provenance attestation, and
  the attestation URL, the tarball URL, and every fetch are on `https://registry.npmjs.org`.
  No read follows a redirect (`redirect: 'error'`; the registry served the version document,
  the attestation, the packument, and the tarball of `@muxui/react@0.1.0-rc.5` directly when
  this was checked), so a redirect fails the read;
- the attestation holds exactly one SLSA provenance statement, whose subject is exactly the
  package (`pkg:npm/%40muxui/<name>@<version>`) with the sha512 of the recorded integrity;
- its workflow is `.github/workflows/npm-publish.yml` of `ndrewtran/muxui`, on `refs/heads/main`;
  its resolved source is that repository at the record's `sourceCommit`, which the verifier
  holds equal to the `source.revision` of the origin manifest; and its run is a run of that
  repository;
- `next` is the reused version, `latest` and `next` are the only dist-tags, and the version
  is listed (`E-P2.1-06` requires `next` at the verified rc). The publish job does this for
  every reused package in its whole-set preflight, before any publish, and again before each
  publish with the same drift rule it has for a published package.

Signatures. The statement above is read from the registry, which proves nothing about who
signed it. So the dry run's preparation also runs `verifyReusedSignatures`, once every reused
tarball is verified and before anything is packed. It installs the reused packages into a new
project outside the checkout, at exactly their recorded versions, with scripts ignored
(`npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps`), where the npm
configuration is empty but for `registry=https://registry.npmjs.org/`, then runs
`npm audit signatures --json --include-attestations` with the npm bundled with the running
Node (at least 11.5.1, the publish job's minimum). It stops the release unless the command
exits 0, its JSON reports no `invalid` and no `missing` package, and its `verified` list (the
packages whose attestation npm verified: the Sigstore signature, certificate chain and log
entry of the bundle, and a subject that is the package and its integrity; npm also checks the
registry's signature over the version) holds every reused package as a direct dependency from
the public registry. Output it cannot read, a nonzero exit, or a package it did not cover stops
the release too. `judgeAttestation` is then run on the bundles from that `verified` list, so the
statement whose signature was verified is the one bound to the recorded bytes and commit and to
this repository's publish workflow. The step logs one line saying what was verified, for the dry
run's excerpt. A release that reuses nothing runs none of this.

Limits.

- Only the dry run's preparation runs `npm audit signatures`. The promotion (`candidate`) and
  the publish job fetch the reused packages again and check the statement, the bytes, and
  `next` as above, and rely on the dry run for the signatures; the reused versions are
  immutable on the registry.
- npm verifies that the bundle is validly signed and logged and that its subject is the
  package. It does not match the signing certificate's identity to this repository, and
  neither does the release: the repository, workflow, commit and run are read from the signed
  statement. The run is only required to be a run of the repository, and is not matched to a
  recorded one, because the manifest does not record the publish run.
- The index of a route lists the digest of a file in the same commit, so it ties a manifest to
  retained evidence a reviewer saw; it does not defend against a change that updates both, and
  the attestation is what holds then.

The untagged `0.0.0-stage` version npm lists beside each new package's first release is no
release candidate; reuse reads exact versions and the publish preflight reads `latest` and
`next`, so it takes no part in either.

### Ordered publication and recovery

One `publish` job, in the `npm-publish` environment, publishes the set to `next` in
publish order. The environment has no required reviewer (Decision 0033): starting
`mode=publish` on `main` publishes, so the exact per-release-candidate authorization
Decision 0028 requires is a process rule that GitHub does not check. The environment
still allows only `main`, and scopes the temporary `NPM_TOKEN`. The job is the only job
with `id-token: write`. A package that exists on npm publishes through trusted
publishing: its `npm publish` exchanges that identity for a short-lived token scoped
to the package, so each needs its own trusted publisher (Decision 0032 item 10).
`npm trust` needs an existing package, so a package that does not exist yet cannot:
its first publish alone uses the temporary `NPM_TOKEN` secret of the `npm-publish`
environment. The token is referenced only by the `Publish the set in order` step's
`env:`, is taken out of the process environment when read, and reaches only the one
`npm publish` of a package the whole-set preflight found absent (as npm's
`//registry.npmjs.org/:_authToken` config in that child's environment, never an
`.npmrc`). Every other `npm publish` runs with every npm credential removed, so an
existing package can only publish through OIDC. Provenance is signed with the
job's OIDC identity in both cases, and the read-back requires it for every
package. If the preflight finds a first publish and no token, the run refuses
before the first publish, naming the packages; it never falls back.

First publish of the new packages, in order (Andrew's steps): add the temporary
`NPM_TOKEN` secret to the `npm-publish` environment; run the publish; once registry
read-back verifies the release, revoke the token on npm and delete the secret. No
trusted publisher is set up then. A package's trusted publisher is set up with
Andrew's browser 2FA immediately before that package's next real release, so it
validates inside npm's 2-day window; a package with no change needs none. Until it
exists, a publish of that existing package stops on authentication and never falls
back to a token. Setup and publish each need Andrew's exact authorization.

It checks out only `src/npm-publication.mjs`, `src/release-set.mjs`, and
`publish-set.json`; every workflow input reaches it through `env:`, never inside a
`run:` script, and the script validates each before use.

`src/npm-publication.mjs` does the work in two steps:

- `verify-candidate` (the `Re-verify candidate` step) reads the downloaded
  artifact the way the job must trust it: exactly the published packages' tarballs
  and the manifest, the manifest for this commit and listing the set in publish
  order, every published tarball the manifest's recorded sha512 and built from this
  commit and release, and the versions the inputs name. A package is published
  exactly when its version input is not empty, and reused exactly when it is empty,
  and the manifest's role must agree. The operator's `tarball-sha512` input
  authorizes exactly the published tarballs: their sha512 integrities, comma
  separated, in any order, no more and no fewer. (The first release's input held
  the `@muxui/react` digest alone, and the retained evidence of that run keeps its
  binding.) A package the manifest marks `reused` is not published.
- `publish-set` (the `Publish the set in order` step) first verifies each reused package
  on the registry (`verifyReused`: the recorded integrity, the attestation of the
  original publish, and `next` at the recorded version), and preflights every package it
  publishes read-only, so a collision, a reused package that is not on the registry as
  recorded, or a broken `next` lineage anywhere in the set stops the release before the
  first publish. Then, for each published package in order, it rechecks the registry for
  drift (the package's own dist-tags and those of every reused package), runs `npm publish --tag next --provenance
  --access public` (with the token for a first publish only), and reads back the version document (integrity and SLSA
  provenance) and the dist-tags (`next` is the candidate, `latest` unchanged or set
  by the registry on a first publish). The first failure stops the set and no later
  package is attempted.

Each package has its own version rule: `<base>-rc.N`, where a first publish
(package absent) is its `rc.1` and a later one is the number after the rc `next`
points at, on the same base version. `@muxui/react` stays `0.1.0-rc.N` (Roadmap R1
exit) with its existing history. A new base version, a missing `latest` or `next`,
or any other dist-tag stops for a decision. `registry-preflight` mode runs the same
read-only classification for every version input and holds no credential.

A failure prints the recovery plan of Decision 0023 amendment 01 and executes none
of it. It reads the registry for each package the run attempted, because a failed
`npm publish` can still have landed: a version with the candidate's bytes and
provenance is `healthy` and stays published and is not deprecated; only one the
registry holds other bytes for (`bad-bytes`) is deprecated, with Andrew's separate
explicit authorization, and fixed forward to its next rc; a package never attempted
needs nothing. An attempted package the registry does not show is never "nothing to
do": npm may have accepted the publish and show it later, so it is `unverified`, and
so is one that is unreadable. Those, and a version with the candidate's bytes but no
provenance, stop for a decision: re-check the registry later, do not republish the
same version, and deprecate nothing until its state is known. The plan ends with
verifying the tuple again against a new release manifest, and no record is rewritten.
The workflow publishes the set a candidate
declares, so a fix forward is a new dispatch at versions the registry does not hold
yet for the packages that did publish. Recovery is per package, so a package a release
reused is never part of it: it was not attempted and stays as it is.

A later release that reuses packages is exercised end to end against the same registry fake
(it also serves a version's tarball): `test/npm-publication.test.mjs` plans the reuse the way
the preparation does, fetches the reused bytes, builds and verifies the manifest, promotes the
candidate, and publishes only what changed, for a tooling-only release and for one that reuses
`@muxui/react`; its refusals are a reused package that is missing, differently hashed, or
without provenance, a version collision, a publish input for an unchanged package, and no
prior release. `test/release-effects.test.mjs` runs the same plan against committed sources.

The tests are `test/release-set.test.mjs`, `test/release-manifest.test.mjs`,
`test/release-lineage.test.mjs`, and `test/npm-publication.test.mjs`, whose
`E-P2.1-06` refusal corpus (a version collision, an artifact-integrity mismatch, and
a promotion lineage from another commit, workflow, or version, each stopping before
any publish) and partial-publication rehearsals (a refused publish and a failed
read-back after earlier packages published) run against an in-process registry
(`test/registry-fake.mjs`), with no network and no registry mutation.

### Release evidence capture

`tests/evidence/capture-r1-exit.mjs` captures the R1 exit evidence of the
`@muxui/react` candidate from `npm-publish.yml` runs, and parses four workflow
formats: the token workflow that published rc.1, the trusted-publishing workflow,
the build-once workflow, and the portfolio workflow. The earlier three keep their
adapters, and `test/evidence-integrity.test.mjs` rebuilds the committed rc.1 to rc.4
routes byte for byte. For a portfolio run the candidate is `@muxui/react`, so the
`E-R1-EXIT` records keep their shape; the dry run's portfolio manifest (schema,
digest, source commit and tree, and every tarball's recorded bytes) and each
package's preflight, publish, and workflow read-back ride along under `portfolio`. A package the publish attempted without a confirmed read-back is recorded `published: 'unverified'`, never `false`, which is only for a package never attempted. A later release's candidate holds only its published tarballs, and a package it reuses rides along under `portfolio` without one: its version and digests are the earlier release's, and the publish run's check of it on the registry is recorded as `portfolio.reused`. The capture binds a `tarball-sha512` that is either the `@muxui/react` digest alone (the first release's input) or the digests of exactly the published tarballs. A release that reuses `@muxui/react` has no React candidate and so no R1 exit route: the capture refuses it, and the earlier rc's route stays the evidence of that candidate. The retained P2.1 route (`tests/evidence/capture-p2.1.mjs`) binds the first release only. Evidence for a release that publishes no React package needs a capture of its own, which this tool does not provide and which is not built yet: it is written after a real dry run shows the log shape of a release that reuses packages.
The capture accepts a publish log only in the workflow's own shape: one block per package, in publish order, each package's read-back finished before the next package's publish starts, and each read-back's dist-tags what that package's preflight allows (`next` the new version, `latest` unchanged or registry-set on a first publish, no other tag).
`test/evidence-integrity.test.mjs` also captures a hosted portfolio release
built by `test/evidence-portfolio-fixture.mjs`, whose publish job log is what
`npm-publication.mjs` prints against the registry fake.

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
