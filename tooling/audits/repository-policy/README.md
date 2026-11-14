# Repository policy audit

This package owns Mux UI's deterministic repository-policy checks: the toolchain
pins, generated output, and artifact naming (`src/cli.mjs`), the root task
runner, and release preparation and publication.

## Root tasks

`src/run-workspace-task.mjs` implements the root `pnpm check`, `pnpm check:all`,
and `pnpm generate` (`src/scoped-verification.mjs` plans them):

- `pnpm check` checks the packages that own the changed paths (committed since
  `MUXUI_BASE_REF`, default `origin/main`, plus uncommitted and untracked files)
  and every package that depends on them. A path outside every package maps
  through `affectedPathOwners` in `repository-policy.json`, and
  `affectedPathConsumers` adds packages that read another package's source
  without a workspace dependency. A change to a `globalTaskInputs` path runs the
  full graph; an unmapped path fails with `MUXUI_AFFECTED_PATH_UNMAPPED`.
- `--package <name|path>` and `--files <path[,path]>` replace the changed paths
  with an explicit scope, again with dependents. Selectors are repeatable, and
  one command takes one kind.
- `--component <family>` runs the whole `@muxui/react` check and the
  `@muxui/react-storybook` component audit of only those families' pages
  (`check:scoped` with `MUXUI_STORYBOOK_AUDIT_PROOF=component`). Families resolve
  by family, slug, or export name from the generated React contract.
- `pnpm check:all` checks every package; `pnpm generate` generates every package.
- `--preview` (or `--dry-run`) prints the plan and runs nothing.

Before checking, the runner generates the checked packages and their dependency
closure (plus `generationPrerequisites`) serially in dependency order and sets
`MUXUI_PREREQUISITES_READY=1`, so package scripts skip their standalone
prerequisite generation. React's check runs first and alone, because its pack
tests rewrite shared generated output; a full check then runs Storybook's
browser audits alone, and the remaining checks run two at a time. Every check
runs even after a failure, and the runner exits with the first failure. An
inherited Storybook family, story, or proof selection never narrows a package
check; a full check runs the forced full Storybook audit.

## CI

`.github/workflows/ci.yml` runs the same fixed jobs on every pull request, push
to `main`, manual dispatch, and weekly schedule. Each job installs, generates
every package in dependency order, then runs its own commands:

| Job | Commands |
|---|---|
| `packages` | schema, tokens, catalog, and tooling `check`, then the Tailwind consumer fixture's isolated install and `check` |
| `apps` | docs, react-playground, and scale `check`, then root `pnpm generate:check` as its own step |
| `tooling` | repository-policy and figma `check` |
| `react` | the `@muxui/react` check: unit tests and `tsc` |
| `browser <engine> <n>/2` | the cross-engine React browser tests in Chromium, Firefox, or WebKit |
| `browser chromium-only <n>/3` | every other React browser test |
| `browser scale` | Scale's `check:browser` and `check:browser:docs` |
| `storybook-a11y` | `test/storybook-a11y.test.mjs`, the full audit |
| `storybook` | Storybook `generate:check`, then every other top-level Storybook test |

`src/browser-test-files.mjs` lists the React browser tests: a file that calls
the harness's `browserEngines()` is cross-engine, every other file is
Chromium-only. Each job passes its list to `node --test --test-concurrency=1
--test-shard=<n>/<total>`, which sorts the files and keeps every n-th, so the
shards of a list never overlap and together run all of it. Chromium uses the
runner's Chrome; Firefox and WebKit install Playwright's builds, with a 25-minute
install step inside a 50-minute job. The Storybook jobs run with
`MUXUI_STORYBOOK_AUDIT_EVENT=check:all`, `MUXUI_STORYBOOK_AUDIT_FORCE=1`, and no
family or story selection. Check steps are limited to 20 minutes.

The aggregate `check` job passes only when every job passed; a failed,
cancelled, or skipped job fails it. The job names are `CI_JOBS` in
`src/release-lineage.mjs`, which the release dry run requires (see below), and a
test holds that list to the workflow.

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
files are compiled for its rc outside the checkout. Preparation audits every
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
versions, descriptor and compatibility profile digests, and the rollback plan. Its digest excludes how the checks ran, so the same
commit and versions give the same digest. `verifyPortfolioRelease` holds the manifest to
the tarball bytes and recomputes what it records instead of trusting it: the catalog
bundle against its declared digest, sidecars, module, and release record, the contract
versions, the renderer descriptor and its export identities, the lockfile and token
source as committed at the release commit, the
`react` correlation block (lockfile, generated outputs, catalog, token and binding-spec
identities, and the icon visual contract; absent when `@muxui/react` is reused), and the
publication and rollback plans. It rejects repacked bytes under a version, a package missing from the tuple, a
published package built from another commit, and a reused package that is not exactly the
record of the earlier manifest that published it (a manifest for the commit the record
names) or whose compatibility no longer holds.

Release preparation compares the proposed versions with the prior portfolio release:
`MUXUI_PRIOR_RELEASE_MANIFEST` names it, a release ledger file `releases/<hex>.json` read
as committed at the release commit (see `releases/README.md`), or
`MUXUI_FIRST_PORTFOLIO_RELEASE=true` declares the first one, which holds only while no
tracked file is a portfolio release manifest. Which packages publish, and at which
versions, is the release's choice: `src/release-effects.mjs` rejects a published version
that is not ahead of the prior release, and a reused package whose recorded range does
not admit a sibling's new version. The workflow's dry run takes them as the
`prior-release` (a `releases/<hex>.json` path) and `first-portfolio-release` inputs,
exactly one, and the outcome is recorded in the manifest as
`preparation.verification.versionCheck`. Publish mode promotes that dry
run and does not derive it again.

`.github/workflows/npm-publish.yml` builds a candidate once (Decision 0030).
`src/release-lineage.mjs` is the part of that workflow that reads GitHub runs and
checks the candidate set. A dry run asks `main-ci` for the push run of `ci.yml` on
`main` at its exact commit. It reuses that run only when the run succeeded and every
job in `CI_JOBS` has a successful job in it; otherwise
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

The first portfolio release publishes all four packages. A later release publishes the
packages it chooses and reuses the rest (Decision 0032 item 9, `E-P2.1-03`). The interface is one signal: a package whose version input is empty is
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
  release before it, which must be committed in the release ledger as `releases/<hex>.json`
  at the release commit, `readLedgerManifest`). A ledger file whose manifest is not the
  release its name gives stops the release;
- fetches each reused tarball from the public registry by its exact version before packing
  anything and verifies it (`verifyReused`, `fetchReusedTarball`, below). A reused package is
  never repacked;
- then verifies their signatures with `npm audit signatures` (`verifyReusedSignatures` in
  `src/release-proof.mjs`, below). It runs only when something is reused;
- takes the reused packages' versions as their recorded ones. A reused package whose
  recorded range no longer admits a sibling's new version is refused
  (`P2_1_VERSION_RANGE_BROKEN`). Nothing checks that a reused package is unchanged;
- runs the set consumer, descriptor audit, and compatibility checks on the real tuple: the
  published candidates and the fetched bytes together. A reused `@muxui/react` also gets the
  audits and consumer proofs a packed one gets, against the current sources, with the release
  and commit it records in place of this release's. Its `react` correlation block stays that
  of the release that published it, so the new manifest has none;
- writes the published tarballs, in publish order, and the manifest. The `npm publish
  --dry-run` rehearsal covers the same packages.

What authenticates a reused package. A ledger manifest that agrees with its own digest
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
- The ledger is trusted as committed: it does not defend against a commit that rewrites a
  manifest and its digests together, and the attestation is what holds then.

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
  separated, in any order, no more and no fewer. A package the manifest marks
  `reused` is not published.
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
points at, on the same base version, or the `rc.1` of a strictly higher base
version (Decision 0035). `@muxui/react` stays `0.1.0-rc.N` (Roadmap R1 exit) with
its existing history, so it has no higher base. A lower or equal base outside
that rule, a higher base that does not start at `rc.1`, a version already on the
registry, a missing `latest` or `next`, or any other dist-tag stops for a decision.
`registry-preflight` mode runs the same read-only classification for every version
input and holds no credential.

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
without provenance, a version collision, a publish input for a package the manifest reuses,
and no prior release.

The tests are `test/release-set.test.mjs`, `test/release-manifest.test.mjs`,
`test/release-lineage.test.mjs`, and `test/npm-publication.test.mjs`, whose
`E-P2.1-06` refusal corpus (a version collision, an artifact-integrity mismatch, and
a promotion lineage from another commit, workflow, or version, each stopping before
any publish) and partial-publication rehearsals (a refused publish and a failed
read-back after earlier packages published) run against an in-process registry
(`test/registry-fake.mjs`), with no network and no registry mutation.
