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

A release is the declared publish set, `publish-set.json`: `@muxui/schema`,
`@muxui/catalog`, `@muxui/tooling`, and `@muxui/react`, in publish order, each with its
directory and the Mux UI packages it may depend on at runtime. Every release publishes
all four. Release preparation (`src/release-prepare.mjs`), the packed-entry tests of
`@muxui/tooling`, and the publish workflow all read it. Every other workspace package
stays private, and the source manifests of the set stay private too: packing sets
`private: false` on the candidate copy only.

`MUXUI_RELEASE_VERSIONS=<name>=<version>,...` gives every member one version, an rc of
its source version (`<source version>-rc.N`; `@muxui/react` is `0.1.0-rc.N`); an empty
or missing version is refused. The workflow builds the variable from its four required
version inputs. Without the variable, a local preparation takes `-rc.1` for each
member. Whether each version is the registry's next is the workflow's registry
preflight, which a dry run runs before it prepares.

Each tarball is repacked deterministically with the rc version, `private: false`, no
scripts or development dependencies, the release commit as `gitHead`, and sibling edges
as `^<rc>` ranges. The catalog's generated files are compiled for its rc outside the
checkout. Preparation audits every tarball against its declared entries, files, and
dependencies (a third-party dependency must be a registry range or dist-tag equal to
the source's, so no path, link, Git, URL, shorthand, or alias passes), checks that each
React descriptor binding is exported by its installed module and stamps the descriptor
with the release id and commit, installs all four tarballs into one isolated pnpm
consumer, keeps the React pnpm, npm, and yarn matrix, and rehearses
`npm publish --dry-run` for each tarball, in order.

One portfolio release manifest (`muxui-portfolio-release-v1`, `src/release-manifest.mjs`)
correlates the tuple: source commit and tree, each package's version, file, and
digests, the catalog, contract versions, descriptor and compatibility profile digests,
the `react` correlation block, and where and in which order the set publishes. Its
digest excludes how the checks ran, so the same commit and versions give the same
digest. `verifyPortfolioRelease` holds the manifest to the tarball bytes and recomputes
what it records instead of trusting it: the catalog bundle against its declared digest,
sidecars, module, and release record, the contract versions, the renderer descriptor
and its export identities, the lockfile and token source as committed at the release
commit, and the `react` correlation block (lockfile, generated outputs, catalog, token
and binding-spec identities, and the icon visual contract). It rejects repacked bytes
under a version, a package missing from the tuple, and a package or descriptor built
from another commit or release.

`.github/workflows/npm-publish.yml` builds a candidate once. `src/release-lineage.mjs`
is the part of that workflow that reads GitHub runs and checks the candidate set. A dry
run asks `main-ci` for the push run of `ci.yml` on `main` at its exact commit. It reuses
that run only when the run succeeded and every job in `CI_JOBS` has a successful job in
it; otherwise it runs the full `pnpm release:prepare`. It then verifies its own
candidate with `prepared` and uploads the tarballs and the manifest. Publish mode
promotes that dry run without building: `dry-run` verifies the dry run named by
`dry-run-id`, read as one attempt; `fetch-candidate` downloads that artifact's ZIP by the
verified id, checks it against the API digest, accepts only the expected file names,
and extracts them itself into a fresh directory outside the checkout; and `candidate`
verifies the versions, the sha512 of each tarball, and the manifest against the commit.
All of that runs in the `prepare` job, which has no OIDC access, so a candidate from
another commit, another workflow, or other versions ends the run before the `publish`
job starts.

### Ordered publication, verification, and recovery

One `publish` job, in the `npm-publish` environment (main only, no required reviewer),
publishes the set to `next` in publish order. Starting `mode=publish` on `main`
publishes, so Andrew's yes for the exact release is a process rule GitHub does not
check. The job is the only job with `id-token: write`. A package that exists on npm
publishes through trusted publishing, which needs its own trusted publisher, set up with
Andrew's browser 2FA just before that package's next release (npm expires one after 2
days without a publish). A package that does not exist yet cannot (`npm trust` needs an
existing package): its first publish alone uses the temporary `NPM_TOKEN` secret of the
environment, which only the `Publish the set in order` step sees, is taken out of the
process environment when read, and reaches only that one `npm publish` as npm config of
the child process, never an `.npmrc`. Every other `npm publish` runs with every npm
credential removed. If the preflight finds a first publish and no token, the run refuses
before the first publish; it never falls back.

The job checks out only `src/npm-publication.mjs`, `src/release-set.mjs`, and
`publish-set.json`; every workflow input reaches it through `env:`, never inside a
`run:` script. `src/npm-publication.mjs` does the work:

- `verify-candidate` reads the downloaded artifact the way the job must trust it:
  exactly the four tarballs and the manifest, the manifest for this commit at the
  versions the inputs name, every tarball the manifest's recorded sha512. The
  `tarball-sha512` input authorizes exactly those four integrities, in any order.
- `publish-set` preflights every package read-only, so a collision or a broken `next`
  lineage anywhere stops the release before the first publish. Then, per package in
  order, it rechecks for drift, runs `npm publish --tag next --provenance --access
  public`, and reads back the version document (integrity and SLSA provenance) and the
  dist-tags (`next` is the candidate, `latest` unchanged or set by the registry on a
  first publish). Last, `verifyPublished` installs the four exact versions from the
  registry into a clean project outside the checkout (npm configuration empty but for
  the registry, scripts ignored, the install retried while the registry's install
  metadata lags), holds each installed integrity to the authorized sha512, and runs
  `npm audit signatures --json --include-attestations`: no invalid or missing
  signature, every package verified as a direct dependency, and `judgeAttestation` binds
  each verified statement to those bytes, the release commit, and
  `.github/workflows/npm-publish.yml` of this repository on `refs/heads/main`. No
  registry read follows a redirect. The first failure stops the set.

Each package's version rule: `<base>-rc.N`, where a first publish (package absent) is
its `rc.1` and a later one is the number after the rc `next` points at, on the same base,
or the `rc.1` of a strictly higher base. A version already on the registry, a missing
`latest` or `next`, or any other dist-tag stops for a decision. `registry-preflight` mode
runs the same read-only classification for the four versions and holds no credential.

A failure prints a recovery plan and executes none of it. It reads the registry for each
package the run attempted, because a failed `npm publish` can still have landed, and plans
the next four-package release from that state: a package never attempted keeps its
version; a `healthy` version (the candidate's bytes with provenance) stays published and
the next release moves past it; a `bad-bytes` version is deprecated with Andrew's yes and
moved past. An attempted package the registry does not show (`unverified`), the
candidate's bytes without provenance (`unattested`), or a failed post-publication check
stop for a decision: re-check the registry, never republish the same version, and
deprecate nothing until the state is known. Only a settled plan prints the next
`MUXUI_RELEASE_VERSIONS`.

The tests are `test/release-set.test.mjs`, `test/release-manifest.test.mjs`,
`test/release-lineage.test.mjs`, and `test/npm-publication.test.mjs`. The last runs the
refusal corpus (a version collision, an artifact-integrity mismatch, a promotion lineage
from another commit, workflow, or version), the partial-publication rehearsals (a refused
publish, a failed read-back, a publish that landed after an error), and the
post-publication check against an in-process registry and npm (`test/registry-fake.mjs`),
with no network and no registry mutation.
