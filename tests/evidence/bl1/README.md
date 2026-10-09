# BL1 retained evidence

The Roadmap "BL1 Blocks showcase" slice requires `E-BL1-01` through
`E-BL1-11`. This root retains all eleven for the four shipped blocks, captured in
one run of `tests/evidence/capture-bl1.mjs` in close-out scope at main commit
`c8f3e7cbc18bebe1a4d6292dddf5dde88875e88b` (the squash of #230, tree
`6c3f51fb3c6d9b33cf5b799b01ca745705850555`), which is in `origin/main`'s history.
Every record is `pass`; its `claim` and `nonClaims` say what it proves and what it
does not. The Roadmap exit condition is judged from these records and the Roadmap,
not from this file.

## What is retained

- `records/E-BL1-01.json` to `records/E-BL1-11.json`, one per assertion, each binding
  the source revision and tree above and the proof tools by commit, tree, and bytes.
- `artifacts/`: what each record observed, and the two independent review records
  (`E-BL1-10-content-review.md` and `E-BL1-09-exit-review.md`).
- `validation/`: the sanitized output of every proof command; the digest of the raw
  output is in the artifact and the raw output is not retained.
- `captures/`: the 60 `E-BL1-06` images.
- `verification.json` and `index.json`: the validation summary and the index
  `evidence-verify` checks, including every file above and under `superseded/`.
- `regression-thresholds.json`, `regression.mjs`, and the other tools listed below. The
  index pins the thresholds at the source revision it binds, and `evidence-verify` reads
  them from that revision's git object, not the working tree, so a later block can edit the
  file without invalidating a retained record (see "Adding a block").

## Earlier records, superseded

`E-BL1-08` and `E-BL1-11` were first captured at `be6f7c41`, a commit from a pull
request branch that a squash merge removed from main's history, so those records
could not be fetched from main. They are superseded, not deleted, because evidence is
append-only. The new records are written at the same paths, so the capture first
copied the whole earlier capture (index, validation summary, records, and artifacts;
it had no excerpts or captures) byte for byte to
`tests/evidence/bl1/superseded/be6f7c411f03/`, after checking each earlier artifact
still matched the digest its record names. Every copied file is listed with its
digest in the index's `artifacts`, so `evidence-verify` checks them, and the new
`E-BL1-08` and `E-BL1-11` records carry `supersedes` with the copied predecessor's
path, digest, and source revision. The copied records keep the `artifact` and
`validation` paths they had, which now name the replaced files rather than the copies
beside them: their own digests are what the index and `supersedes` bind. A rerun of the
capture at the same revision copies nothing new and carries each `supersedes`
forward; a later capture archives the capture it replaces the same way, so the chain
stays walkable. The index's `supersessions` list is not used: Architecture defines it
as an `EvidenceApplicabilitySupersession` certificate that closes an applicability
chain after an accepted authority change, which a recapture is not.

## Independent reviews retained

- **Content review (`E-BL1-10`).** Read the block sources at
  `670cb1880350e62d19f30a09914b6eb6dadef9a4`. Verdict: pass for all four blocks,
  with advisories the capture lists and does not fix, because changing a block source
  would invalidate the reviewed revision. `catalog/patterns` has the same tree at that
  revision and at the source revision, so the review applies to the sources scanned.
  The whole tree differs by the 12 files of #230, and the proof tools are among them:
  the review did not read them, and the record says so.
- **Exit review (`E-BL1-09`).** The final review of the step 1 tooling at
  `509d870216ea00a0afbca717fa39188afffbd21a`, tree
  `6c3f51fb3c6d9b33cf5b799b01ca745705850555`. That commit is a pull request branch
  commit, so it is not in main's history, but its tree equals the source tree, no path
  differs, and no proof tool differs: the squash commit is the tree the reviewer read.
  The record carries its own limits and verdict.

Two earlier reviews of the step 1 tooling, of `82aa2576` and of `c4770e2d`, found
defects that the step 1 fixup resolved. They are not retained: the `509d8702` review
supersedes them, and a review of a commit that no longer exists says nothing about
the tools that ran.

## The close-out capture

`node tests/evidence/capture-bl1.mjs` retains all eleven records for the four
shipped blocks (the poster grid with its CSS-grid and virtualized variants, the
marketing hero, the pricing plans, and the account settings) in one run, so the
index binds a single source revision and tree.

- It runs from a clean committed revision that is in `origin/main`'s history
  and refuses any other, because a squash merge orphans a branch commit and every
  record would bind a commit nobody can fetch. This is why the tools and the
  amendment land first and the evidence is captured from the merged main commit
  in a follow-up pull request, the pattern the R1 exit used. Fetch first so
  `origin/main` is current.
- The page widths come from the accepted amendment: the capture parses the list from
  `decisions/0026-amendment-01-page-width-presets.md` and fails unless
  `apps/docs/src/lib/block-presets.ts` agrees.
- A close-out capture needs both independent reviews (see below).
- `--rehearsal=<dir>` runs every proof and writes the evidence under `<dir>`
  instead, skipping the main-history check and the exit review requirement, so the
  tool can be exercised before a merge. `<dir>` starts as a copy of the retained
  evidence root, so reused reviews and the supersession archive behave as in a real
  capture; the tool refuses a `<dir>` that overlaps the retained root (resolved through
  symlinks, either containing the other, so not `.`) before it removes anything. A
  rehearsal is never retained.
- `--growth` is for a capture after a block is added (see "Adding a block"). It needs a
  retained close-out capture and a block that capture did not measure.
- It refuses to write when any proof fails, retains a sanitized excerpt of every
  command's output (the raw output's digest is in the artifact, the raw output is
  not retained), binds each proof tool by commit, tree, and bytes, and verifies the
  result with `evidence-verify`.

| ID | Proof |
| --- | --- |
| `E-BL1-01` | `node --test` over `packages/schema/test/pattern.test.mjs` and `packages/catalog/test/pattern-catalog.test.mjs`; each required negative is listed with the code, path, message, and owner parsed from the test source that ran |
| `E-BL1-02` | `packages/tooling/test/pattern-authoring.test.mjs` |
| `E-BL1-03` | `pnpm --filter @muxui/repository-policy run proof:pattern-variants` (packed SSR and hydration, with row proof), the packed-declarations typecheck test, and `variant-typecheck.mjs` (one `tsc` run per variant against the packed declarations) |
| `E-BL1-04` | `apps/react-storybook` `check:scoped` with the block slugs as families (light and dark axe and colour audits per Block page), and the block browser tests with `MUXUI_BROWSER_ENGINES=chromium,firefox,webkit`: one per interactive block, as `pullRequestImpact.patternBrowserTests` in `tooling/audits/repository-policy/repository-policy.json` declares them (four at the close-out) |
| `E-BL1-05` | `pnpm --filter @muxui/docs run check`, which includes the `check-blocks` report |
| `E-BL1-06` | `pnpm --filter @muxui/scale run check:browser:docs` with `MUXUI_BLOCKS_CAPTURE_DIR`: every variant at every toolbar preset, and every marketing variant at every page width, in light and dark, with the overflow report |
| `E-BL1-07` | `surface-parity.mjs`: the API, CLI JSON, human, dense, and the site loader over pattern `list`, `search`, `get`, the participant filter, `usedIn`, and component examples, plus the CLI and loader tests |
| `E-BL1-08` | `pnpm generate:check` and a catalog compare against the digest pinned at #225 |
| `E-BL1-09` | `boundary-audit.mjs` and its negative controls |
| `E-BL1-10` | `content-scan.mjs`, the content-rule tests, and the independent content review |
| `E-BL1-11` | `regression.mjs` against `regression-thresholds.json` |

The other files here are the proof tools the capture binds: `proof-run.mjs`
(runs, sanitizes, and parses a command), `capture-support.mjs` (the main-history
guard, the review slots, and the supersession archive, which
`evidence-integrity.test.mjs` exercises) and the growth-source and browser-test derivations
below, `surface-parity.mjs`, `boundary-audit.mjs`, `content-scan.mjs`,
`variant-typecheck.mjs`, and `regression.mjs`.

## The boundary audit

`boundary-audit.mjs` compares the pre-BL1 base (`b53a05ab`) with the captured
revision. Every check reads git objects except three read-only observations: the
live CLI (run only when the checked-out tree is the captured revision, so it is the
CLI at that revision), `npm view` for the registry, and `gh api` for GitHub
deployments and Pages. A deployment or Pages site that cannot be observed narrows
the claim to "no deployment configuration added", and the record says which.

- **`@muxui/react`.** Its manifest is byte-identical to the base, and no BL1 pull
  request (#223 to #226, #228, #229) changed a non-test file of `packages/react`. One
  change that is not a BL1 pull request landed in that range: #227 (`5302eeb5`),
  which flips Sidebar's default token mapping and adds `@scope` light-scheme
  overrides, `color-mix()` hover fills, and forced-colors rules. That is a visible
  change to the default appearance of the shipped `./styles.css`, with no class name,
  custom property, export, or version change. The audit pins that commit and file and
  prints the note only when the change is in the range. The pre-BL1 base is therefore
  not the package the BL1 records ran against: BL1 evidence validates the package
  after #227.
- **Negative controls.** A check that cannot fail proves nothing, so each check is
  split into legs, its independent conditions, and each leg has a control that fails
  exactly that leg: a range or head from this repository's history that breaks it
  (#207 for the manifest and dependencies, `aab51163` for the version and private
  flag, #149 and #201 for the stylesheet names, #213 for workflows, #222 for source
  files and catalog records), or a synthetic input a predicate must reject on that
  leg alone and accept when it is good (registry fields, deployments, each
  assistive-technology claim pattern, the CLI surface, package manifests, Astro
  settings). The close-out scope check fails when no change exists, so it cannot pass
  vacuously. The evidence integrity test asserts that exactly the named legs fail and
  that no leg lacks a control, and the capture retains the results. The controls
  exercise the predicates and the git comparisons; they do not exercise the live
  `npm`, `gh`, and CLI reads themselves.
- **Heuristics.** The assistive-technology claim scan reads added lines in catalog
  records, docs and Storybook sources, package sources and readmes, and the root
  readme, and flags claim-shaped wording. It is a heuristic and cannot prove a claim
  absent.

## Independent reviews

Reviews are inputs the capture retains, never proofs. `--content-review` retains the
`E-BL1-10` content review and `--exit-review` the independent review of the
`E-BL1-09` audit and the exit claim, each with the full revision the reviewer read; a
close-out capture needs both. A review is retained as the reviewer wrote it except
for local paths (the repository root, temporary directories, and home directories are
rewritten, and each kind is counted), with the digest of the original. It names its
own reviewed revision and tree. A review's reviewed revision can differ from the
capture's source revision, and each retained review records how: whether its
revision is in main's history, whether its tree equals the source tree, which paths
changed between them, and which proof tools differ at the source revision, so a
reader can see whether the tools that ran are the tools that were reviewed. The
content review is also refused if `catalog/patterns` differs from the tree it read.
A review is independent of the authoring agents only: it records its reviewer, and
two reviews by the same model are not independent of each other.

## Known limits

- `E-BL1-01`: all eight negative cases name an owner, but an unknown field's owner
  is the family contract `pattern-contract`, reached through the diagnostic fallback
  at the schema root, not a field-level owner: the schema test asserts that no
  field-level owner resolves for an undeclared field, and an authoring test asserts
  the fallback. The record states both.
- `E-BL1-03`: the virtualized poster grid renders an empty shell on the server by
  design (a Virtualizer mounts rows from a measured scroller). Its rows are proved
  after a measured hydration, bounded to some rows and fewer than its 1,000 cards, and
  the observed window is recorded.
- `E-BL1-04`: the accessibility proof is the automated axe and colour audits and the
  keyboard, focus, and state browser tests. Manual and assistive-technology review of
  a block's interactive behavior stays deferred to `S1.0` (Decision 0022). Nothing
  here is an assistive-technology support claim.
- `E-BL1-06`: the page widths are 360, 768, 1024, 1280, and 1920
  ([Decision 0026 amendment 01](../../../decisions/0026-amendment-01-page-width-presets.md)).
  The toolbar presets are a docs choice. The captures are PNG files kept in the
  repository because they are synthetic content rendered from committed sources;
  they record overflow and appearance and are not a pixel-regression baseline.
- `E-BL1-07`: the in-process API is compared with the CLI process after the location
  fields in the normalization rule are excluded. The site comparison covers the
  fields the loaders read, and rail search is compared as a set of blocks, not by
  rank.
- `E-BL1-08`: the catalog digest moved before any block shipped (the query API bump,
  #223, and the pattern kind, #224), so the baseline is the digest pinned at #225, not
  the pre-BL1 digest; the capture records the whole chain.

## Adding a block

The Roadmap gives a block added later `E-BL1-03` through `E-BL1-08`, `E-BL1-10`, and
`E-BL1-11`, not `E-BL1-09`, so the close-out scope check and the exit review do not
apply to it. Its close-out scope would fail by design, because a new block changes
`catalog/patterns/` and the catalog sources, which the close-out may not. A growth
capture (`--growth`) skips the close-out scope check and the exit review, records
`scope: growth` in `verification.json` and in the `E-BL1-09` artifact, and keeps every
other check, including the rest of the boundary audit, which must still pass.

A block is delivered in two pull requests, because a squash merge orphans a branch
commit and the records must bind a commit on main.

**1. The block pull request (a branch).** It edits sources, never a record:

- the block under `catalog/patterns/<slug>/` and its entries in
  `packages/catalog/catalog-sources.json`, then `pnpm generate` for the projections
  (the catalog digest goldens, the Storybook Block pages, and the docs routes);
- `tests/evidence/bl1/regression-thresholds.json`: entries for the new block only, all
  written before any measurement of that block: its own discovery queries and
  expectations, its id in `seedSet`, its ids in the `relevant` lists of the component
  queries it participates in, and the provenance text that records them. Each query key is
  unique in the file. Roadmap `E-BL1-11` and Product Scope fix thresholds before the
  relevant candidate is measured, so an expectation is never revised to fit a measurement:
  when the block fails an expectation it wrote, the block changes (its name, keywords, or
  copy), or an authority decision is sought, and `provenance.revisedAfterFirstMeasurement`
  does not grow. For the same reason a growth pull request does not revise, loosen, or
  remove an existing block's expectation (`expectedFirst`, `expectedWithin`), a limit, or a
  budget. A new block can still shift an existing rank (a second collections block moves the
  poster grid's `collections` rank), and then `pattern-regression.test.mjs` fails: an
  authority decision on the existing expectation comes first, and the pull request waits for
  it. Prefer a block whose id, name, keywords, and category do not shift an existing rank. A
  pattern whose id and name carry a component word can outrank that component and fail the
  component search rule, so name a block for what it shows, not for a component. The later
  capture still lists every change to the file since the close-out in `E-BL1-11`
  (`thresholdChanges`), so a change is visible in the records whatever its authority;
- for an interactive block, its cross-engine test
  `packages/react/test/browser/pattern-<slug>.test.mjs` and its route in
  `pullRequestImpact.patternBrowserTests` (`tooling/audits/repository-policy/repository-policy.json`).
  CI impact planning and the capture both read that one route. A block with no
  interactive behavior declares none.

Retained evidence keeps verifying while the file changes: the index pins the thresholds
at the close-out revision and `evidence-verify` reads that revision's git object, so the
edit does not fail with `EVIDENCE_DIGEST_MISMATCH`. The edit applies to the next capture
and, at once, to `packages/tooling/test/pattern-regression.test.mjs`, which runs
`regression.mjs` on every `@muxui/tooling` check and holds the new block to the thresholds
in the working tree. On the branch, in order:

1. `pnpm generate`, then refresh the dense goldens in `packages/tooling/test/goldens/`,
   which pin the catalog digest (the `E-G0.3-03` test in
   `packages/tooling/test/cli.test.mjs` renders them; the diff must be digests only).
2. `node tooling/audits/repository-policy/src/ci-impact.mjs --preview` for the groups CI
   will run, then those checks: `pnpm check` for the changed files, or the packages the
   plan names (`@muxui/repository-policy`, which runs `evidence-verify` and the integrity
   test, `@muxui/catalog`, `@muxui/tooling`, `@muxui/docs`, and the Storybook and React
   groups for the block's pages and browser test).
3. Optionally, a rehearsal of the capture on the committed branch, to see the capture
   accept the block before merge: `node tests/evidence/capture-bl1.mjs --growth
   --rehearsal=<dir> --content-review=<record> --content-review-revision=<sha>`. It
   runs every proof and writes under `<dir>`, never the repository, and skips the
   main-history check. The review is an independent content review (`E-BL1-10`) that
   covers every block, including the new one, and read the `catalog/patterns` tree the
   capture binds; the capture refuses a record that omits a block.

**2. The records-only pull request, captured from main after the first merges.** Fetch,
check out the merge commit on main (a clean worktree), and run:

```sh
node tests/evidence/capture-bl1.mjs --growth \
  --content-review=<independent content review of every block> --content-review-revision=<sha>
```

- It refuses unless a close-out capture is retained (current, or archived under
  `superseded/`) and the catalog has a block that capture did not measure.
- It reads the thresholds as committed at the merge commit, derives the browser tests
  from `patternBrowserTests`, and measures every block, not only the new one.
- It archives the capture it replaces under `superseded/<revision>/` byte for byte, so the
  close-out stays in the tree and keeps its exact pins, and names that predecessor in each
  new record's `supersedes`.
- Commit only `tests/evidence/bl1/`, with this file's opening paragraph and its list of
  retained reviews updated for the new capture, and open it as a records-only pull request.

`evidence-integrity.test.mjs` holds a growth capture to facts derived at its own source
revision (the variants from the catalog, the browser tests from `patternBrowserTests`,
the query count and the revised-expectation count from the thresholds), and keeps the close-out
capture, current or archived, to its exact pins: five variants, 57 of 57 browser results,
79 parity rows, 13 of 13 audit checks, nine of 21 revised expectations, the close-out
scope check run, and an exit review of the source tree.

These records make no assistive-technology support, publication, deployment, or
public-surface claim, and satisfy none of `E-P2.3-01…05`. They do not set a milestone
status; that is tracker state outside the repository.
