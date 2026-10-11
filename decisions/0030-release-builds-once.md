# Decision 0030: A release candidate is built once

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0030`
- Amends: the root `AGENTS.md` Verification wording of `pnpm release:prepare`
- Satisfies for item 9 only: the "waive required proof" stop in Decision 0028 item 6
- Effective: on merge

## Gap

Releasing an rc proves and builds the same candidate three times. Measured on
the rc.2 release (dry run 38098393207, publish run 38099688454) and its
rehearsal (38091463603):

- **The dry run reruns what main already proved.** `pnpm release:prepare` runs
  the whole `check:all` graph, then the generation identity, then packs the
  candidate and runs the packed-consumer matrix. The dry run took about 19.5
  minutes, of which the check graph is about 17.5. Main's push CI had already
  run that graph for the same commit, and `npm-publish.yml` never looks at it.
- **The publish run rebuilds the candidate the dry run built.** Its `prepare`
  job took about 19.8 minutes to produce the same bytes, then the run waited for
  Andrew's approval, then the publish job took about 3.4 minutes, 3 of them the
  registry read-back. Cut to installable was about 43 minutes plus approval.
  The digest Andrew authorizes, taken from the dry run, is what decides which
  bytes are published; the second build had to reproduce the dry run's bytes
  exactly or fail the digest check.
- **Storybook's own interface is part of release proof.** Four colour proofs in
  `apps/react-storybook/test/storybook-colors.test.mjs` paint Storybook's own
  manager and docs pages, its onboarding states, its create-story dialog, and
  its docs ArgsTable. They take about 231 to 274 seconds per full run. They prove
  the private development host, not `@muxui/react`, and a package consumer never
  receives any of it.

## Decision

Item 8, the release builds once:

1. **The dry run reuses main's proof.** In `mode=dry-run`, before preparing, the
   workflow looks for a `ci.yml` run for `github.sha` with event `push` on
   `main`, of this repository. The newest such run is used; a newer failure is
   not skipped in favour of an older pass. The run is read as its latest attempt
   (the attempt's own record and jobs), and is reused only when that attempt is
   completed with conclusion `success`, its `plan` and aggregate `check` jobs
   succeeded, and every group of the full plan computed at that commit has a
   successful `run <group>` job. The plan is recomputed from the commit, not
   trusted from the event or a label. When reused, the dry run runs workspace
   generation, `pnpm generate:check`, and `release-prepare.mjs` (packing,
   exports, assets, notices, the dependency graph, SSR and hydration,
   tree-shaking, and the consumer matrix) instead of `pnpm release:prepare`.
   When there is no such run, or it failed, is still running, is incomplete, or
   cannot be read, the dry run runs the full `pnpm release:prepare` and says so.
   The step summary, the log, and the release manifest's `preparation` record
   which path ran and, for a reuse, the main run's id and the attempt judged.
2. **The publish run promotes the dry run's candidate.** `mode=publish` takes a
   `dry-run-id` and does not run `release:prepare`. Before the approval gate it
   fails closed unless the named run, read as its latest attempt, is a
   successful `workflow_dispatch` dry run of `.github/workflows/npm-publish.yml`
   in this repository, on `main`, at the same `github.sha`, whose `prepare` job
   succeeded and whose `publish` job never ran, and it has exactly one
   unexpired `npm-candidate` artifact with an id, a size, and a sha256 digest.
   That artifact id, digest, size, and the attempt are handed to the download
   step, which verifies the dry run again and fails if any of them changed. No
   general archive extractor reads the artifact. The workflow downloads the raw
   ZIP by that artifact id, checks its size and sha256 against the API digest
   before parsing it, accepts it only if it holds exactly the two expected file
   names (plain names, once each, regular files, unencrypted), and writes only
   those two files into a fresh directory outside the checkout. It then checks
   the bytes itself: the tarball's version is the version input, its sha512
   equals the authorized `tarball-sha512` input, and the release manifest names
   the same version and digest, this commit as its source revision, and this
   commit's tree. The publish job keeps its own version and digest
   re-verification, the registry preflight, the drift recheck, the OIDC publish,
   and the read-back.
3. **Provenance.** The registry's provenance is signed by the publish run, for
   bytes built by the dry run of the same workflow at the same commit. That is
   accepted. The attestation names the commit and the publish run; the retained
   R1 exit evidence binds the publish run to the dry run by id, attempt, artifact
   id, and digest.
4. **Retention.** The `npm-candidate` artifact is kept 30 days instead of 3. An
   expired or missing artifact means a new dry run, never a rebuild inside the
   publish run and never a substitute found by name.
5. **Evidence stays honest.** The R1 exit capture records the main CI run a dry
   run reused (the attempt recorded, read as that attempt), or that it fell back
   to the full `release:prepare`, and that a publish run promoted the dry run's
   artifact at the dry run's recorded attempt instead of preparing its own.
   Replacing a dry run record keeps a later phase only if it names exactly that
   dry run (id, attempt, artifact id and digest), and a route that mixes dry runs
   does not assemble. The retained rc.1 and rc.2 routes keep their original binding byte for byte.

Item 9, Storybook's own-interface colour proofs are not release proof:

6. **The four proofs are not release proof.** Storybook's manager and docs paint,
   its onboarding states, its create-story dialog, and its docs ArgsTable are
   proof of the private host. `MUXUI_STORYBOOK_UI_PROOF=skip` skips exactly
   those four tests and renames none. The release preparation script
   (`pnpm release:prepare`, the fallback path) and the main push plan set it.
   Nothing else does.
7. **They keep running where the host changes.** A pull request plan runs the
   manager and docs proof when a path in `reactStorybookChromePaths` changes
   (Storybook configuration, theme, and preview files), and all four whenever it
   plans the full workspace graph. The weekly scheduled full run and a manual
   `workflow_dispatch` run of `ci.yml` run all four, and so does a direct
   `pnpm --filter @muxui/react-storybook check`.
8. **Everything that proves the library stays.** Product page axe and colour
   proof, theme contrast, keyboard and focus proof, the browser suites in every
   engine, generation identity, and the packed-consumer proof are unchanged and
   required.

## Authority effect

The root `AGENTS.md` Verification section changes in the same pull request:
`pnpm check:all` stays the complete deterministic workspace graph, and
`pnpm release:prepare` is described as release preparation that skips
Storybook's own-interface colour proofs, with the publish workflow's dry run
allowed to reuse main's green full CI run for the same commit instead of
rerunning the graph. `pnpm release:prepare` still never publishes.

Architecture and the Roadmap say only that `release:prepare` builds and
verifies release candidates and that the R1 exit requires "checks", not where
they run, so neither is edited. Decision 0023 and its amendment 01 keep each
rc's own release preparation, `E-R1-EXIT-01` through `E-R1-EXIT-03` evidence,
and publish authorization; every rc still has its own dry run, and a publish
run promotes only that rc's dry run. Decision 0028 stays as written; its stop
on waiving required proof is satisfied by Andrew's acceptance below, for the
four proofs in item 6 only. The delivery skill's CI reference and the
repository-policy README are updated to match.

## Non-goals and preserved stops

This decision publishes no package, changes no dist-tag, and runs no registry
write. Andrew's `npm-publish` environment approval and exact `tarball-sha512`
authorization for each rc stay. The registry preflight, the drift recheck
before `npm publish`, the provenance and integrity read-back, and the clean
published-consumer evidence (`E-R1-EXIT-03`) stay. `mode=dry-run` still needs no
approval and `mode=publish` still runs only from `main`. It does not weaken
`check:all`, narrow the main push plan beyond the four proofs, change the
required `check` aggregate or per-group reuse, add or change a package, or
claim any check result or release.

## Reversal

A successor decision may restore any gate removed here. Setting a dry run to
ignore main's proof, or removing `MUXUI_STORYBOOK_UI_PROOF=skip` from the
release script and the main push plan, returns to the previous behaviour with
no data change. Retained evidence is unaffected: a capture of a run made before
this decision verifies against the binding it was made with.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 11 October 2026

Andrew's direction, in his words, given in reply to the plan in
`ci-and-release-speed.md`:

> Items 8 and 9 are approved.

Items 8 and 9 of that plan, which is the proposal he answered:

- Item 8, release builds once: the publish run downloads the dry run's
  `npm-candidate` artifact by run id and verifies it fail-closed (same commit,
  workflow, version, manifest, and sha512) without rebuilding; the dry run
  consumes main's green full `ci.yml` push run for the exact commit, with every
  expected group present, and then runs only `generate:check` and
  `release-prepare.mjs`, falling back to the full `release:prepare` when main is
  red or missing; the artifact retention is raised from 3 days; the R1 exit
  capture records the reused main run and the promoted artifact honestly.
  Andrew's approval, the registry preflight and recheck, the provenance
  read-back, and the clean published-consumer evidence stay. This includes
  provenance signed by the publish run for bytes built by the dry run of the
  same workflow at the same commit.
- Item 9, Storybook's own-interface colour proofs (manager, docs, onboarding,
  create-story) are not release proof under Decision 0028 item 6: they run on
  Storybook configuration and theme changes and on the weekly schedule, and drop
  from per-push main and from `release:prepare`.

This record does not claim that any check passed, that a pull request was opened
or merged, that the repository has adopted the decision, that the workflow has
run in its new form, or that any package, release candidate, or dist-tag
changed.
