# Decision 0033: Publishing needs no environment approval

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0033`
- Amends: Decision 0030, only the `npm-publish` environment approval named in its "Non-goals and preserved stops"
- Effective: on merge; the GitHub environment setting is changed after it

## Gap

A publish run stops twice for Andrew. He gives an exact authorization for the
release candidate in chat (Decision 0028 item 6), and then the `publish` job
waits for him to approve the `npm-publish` environment on GitHub. Read from the
repository's GitHub settings on 2 November 2026:

- **The environment has two rules and one secret.** One protection rule,
  `required_reviewers`, names `ndrewtran`. A deployment branch policy allows
  only `main`. The environment secret `NPM_TOKEN` is the temporary token for the
  first publish of the three new packages (Decision 0032 item 10).
- **The click is the second manual step per release.** The `prepare` job has
  already verified the dry run, its artifact, and the candidate by the time the
  `publish` job waits (Decision 0030 item 2). After the first-publish bootstrap
  and the trusted-publisher setup, the click is the only manual step of a
  release besides the authorization, and Andrew wants publishing automated.

## Decision

1. **The `npm-publish` environment has no required reviewer.** Starting
   `mode=publish` runs the `publish` job with no environment approval.
2. **`mode=publish` still runs only from `main`.** The `publish` job runs only
   when `github.ref` is `refs/heads/main`, and the environment's deployment
   branch policy still allows only `main`.
3. **The `publish` job keeps `environment: npm-publish`.** The environment
   still scopes the temporary `NPM_TOKEN` secret, enforces the main-only branch
   policy, and records each deployment. Only the reviewer is removed.
4. **Starting a publish stays a delivery stop.** An agent starts `mode=publish`
   only after Andrew's exact authorization for that release candidate, with
   `tarball-sha512` (the sha512 of each tarball the release publishes, comma
   separated) where the release uses one. That authorization is a rule of
   process. GitHub no longer enforces it.

What stays unchanged:

- Decision 0028's stop on publishing, and its per-release-candidate
  authorization.
- The dry-run lineage: a publish promotes only the dry run it names, built from
  the same commit (Decision 0030 item 2).
- The registry preflight, the drift recheck before each `npm publish`, the
  provenance and integrity read-back, and the published-consumer evidence.
- npm trusted publishing over OIDC, and the temporary first-publish token rules
  of Decision 0032 item 10.

## Accepted consequence

Anyone who can dispatch `npm-publish.yml` on `main` can start a publish with no
technical gate. That includes an agent session working under Andrew's GitHub
login. The exact per-candidate authorization of item 4 is the only control on
who starts a publish, and nothing in GitHub checks that it was given.

A publish run's approvals list, which `approvalFacts` in
`tests/evidence/capture-r1-exit.mjs` records, is empty from now on. That is
expected, not a capture failure. `--approval-method` no longer applies to new
runs. Evidence already retained for earlier publishes, with their approvals, is
unaffected.

## Authority effect

- **Decision 0030** stops preserving the environment approval. Its "Non-goals
  and preserved stops" and item 2 say so, and its header points here.
  Everything else in it stands, including the measurements that mention the
  approval wait.
- **`.github/workflows/npm-publish.yml`** changes comments and the `mode` input
  description only, so none of them promises an approval. No step, condition, or
  permission changes. It is a protected release file, so the pull request that
  edits it names this decision as its Authority change record.
- **The repository-policy README** states that the `publish` job runs in the
  `npm-publish` environment without a reviewer.
- **The GitHub setting** is not in the diff. Andrew's removal of the required
  reviewer takes effect after this merges, and until then the approval click
  still applies.

## Non-goals and preserved stops

This decision publishes no package and writes to no registry. It changes no
dist-tag, version, package, or workflow logic. It does not change Decision
0028's publish stop or the trusted-publisher setup. It claims no release,
support, or stable property.

## Reversal

A successor decision may restore the approval. Because the `publish` job keeps
`environment: npm-publish`, adding a required reviewer to that environment on
GitHub restores the click with no workflow change. The workflow comments and
README would then be edited back in the same pull request.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 2 November 2026

Andrew's choices, in his words, each given as the option he picked:

- On the `npm-publish` environment approval, he answered "Drop the approval click", whose option text was: "Remove you as required reviewer on npm-publish, keeping the main-only branch rule. Starting the workflow alone would then publish, including when an agent starts it."
- On how to record that change, he answered "Change decision, then remove", whose option text was: "Open a PR with a new decision superseding that part of 0030, plus the workflow comment updates. I remove the reviewer on GitHub after it merges."
- On merging this pull request, in his own words: "do not wait for CI, merge that pr immediately".

This record does not claim that any check passed, that the environment setting
has changed, or that any package, release candidate, or dist-tag changed. Where
it describes the code, it describes `main` at `d04dd499`.
