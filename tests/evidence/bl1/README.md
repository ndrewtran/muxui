# BL1 retained evidence

The Roadmap "BL1 Blocks showcase" slice requires `E-BL1-01` through
`E-BL1-11`. This root retains all eleven for the seven shipped blocks, captured in
one run of `tests/evidence/capture-bl1.mjs` in growth scope at main commit
`a7237f58d8706ec54d21b88e0363241a936695f0` (the squash of #253, tree
`95db36feaf3a2bbaecdad08d16700d30b2014cc1`), which is in `origin/main`'s history.
The growth commits it audits are `bb6097269c3a2683e8680d0d7be9a83b4f069958` (#238), which
added the company records and task filters blocks, and
`e9a470c26afec974dba93a2daa5b1c95b7071b00` (#247), which added the workspace navigation
block. The earlier growth capture, at `0c3cf6626ffde8c15c970018733672d3731cdaf3` (the
squash of #239), is archived under `superseded/0c3cf6626ffd/`, and the close-out capture of
the first four blocks, at `c8f3e7cbc18bebe1a4d6292dddf5dde88875e88b` (the squash of #230),
under `superseded/c8f3e7cbc18b/`.
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
- `captures/`: the 92 `E-BL1-06` images.
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
stays walkable. The growth capture at `0c3cf662` archived the close-out capture at
`c8f3e7cb` the same way, under `superseded/c8f3e7cbc18b/`, and the growth capture at
`a7237f58` archived that growth capture under `superseded/0c3cf6626ffd/`. Every new record
carries `supersedes` naming its predecessor at `0c3cf662`, whose own records keep the
`supersedes` that name the close-out. The index's `supersessions` list is not used.
That reasoning is historical wording: Architecture once defined the list as an
`EvidenceApplicabilitySupersession` certificate that closed an applicability chain after an
accepted authority change, and no longer does (Decision 0027, #248, removed that machinery).
`supersedes` on each record is the link between captures.

## Independent reviews retained

- **Content review (`E-BL1-10`).** Read the block sources at
  `e9a470c26afec974dba93a2daa5b1c95b7071b00` (#247), by an independent reviewer
  (Claude Opus) that authored none of the blocks and did not review their code.
  Verdict: pass for all seven blocks, with advisories the capture lists and does not fix,
  because changing a block source would invalidate the reviewed revision. Main moved to
  `bcb671e1` (#248) during the review; the record's revision note says so and that
  `catalog/patterns` did not change. `catalog/patterns` has the same tree at the reviewed
  revision and at the source revision, so the review applies to the sources scanned. The
  whole tree differs by 260 paths (decision, strategy, evidence-archive, and tooling changes
  from #248 to #253), none of them under `catalog/patterns`, and three proof tools differ
  (`capture-bl1.mjs`, `growth-scope.mjs`, and `boundary-audit.mjs`): the review did not read
  them, and the record says so. The close-out content review of `670cb188` and the earlier
  growth content review of `bb609726` are archived with their captures.
- **Exit review (`E-BL1-09`).** A growth capture takes no new exit review and reuses
  the close-out's: the final review of the step 1 tooling at
  `509d870216ea00a0afbca717fa39188afffbd21a`, tree
  `6c3f51fb3c6d9b33cf5b799b01ca745705850555`. That commit is a pull request branch
  commit, so it is not in main's history, but its tree equals the source tree, no path
  differs, and no proof tool differs: the squash commit is the tree the reviewer read.
  The record carries its own limits and verdict. Five proof tools differ at the growth
  capture's source revision, so the `E-BL1-09` record states that the exit review is not
  a review of them as they ran; #233, #239, and #252, which changed them, each had their own
  independent review, and #253 is covered by the integrity test and a growth rehearsal.

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
- The page widths live only in code: the capture imports `pageWidths` and `toolbarPresets`
  from `apps/docs/src/lib/block-presets.ts` at the source revision and records the list and
  the file's blob. No decision text is read for them (Decision 0029).
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
| `E-BL1-08` | `pnpm generate:check`, two byte-identical compiles, the check that the pattern entries add only their own artifacts, and a catalog compare: against the digest pinned at #225 in a close-out capture, and recorded as an observation across each commit that added or changed a block in a growth capture (see "Adding a block") |
| `E-BL1-09` | `boundary-audit.mjs` and its negative controls; a growth capture scopes the checks that read `@muxui/react`, the catalog records, workflow and hosting files, and package versions to the commits that added or changed its blocks, gates the release and boundary legs, and records the `@muxui/react`, dependency, stylesheet-name, and component-record legs without gating on them |
| `E-BL1-10` | `content-scan.mjs`, the content-rule tests, and the independent content review; a growth capture records which retained review covers each block |
| `E-BL1-11` | `regression.mjs` against `regression-thresholds.json`, with every change since the close-out logged in its `provenance.revisions` |

The other files here are the proof tools the capture binds: `proof-run.mjs`
(runs, sanitizes, and parses a command), `capture-support.mjs` (the main-history
guard, the review slots, and the supersession archive, which
`evidence-integrity.test.mjs` exercises) and the growth-source and browser-test derivations
below, `growth-scope.mjs` (the commits that added or changed a block and the E-BL1-08 observation across
them), `surface-parity.mjs`, `boundary-audit.mjs`, `content-scan.mjs`,
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
- **Growth scope.** A growth capture (see "Adding a block") runs the checks that read
  `@muxui/react`, the catalog records, workflow and hosting files, and package versions
  (`react-package-manifest`, `react-source-files`, `react-stylesheet-names`, `no-dependency-change`,
  `versions-follow-decision-0026`, `no-workflow-or-hosting-config`, and
  `no-new-component-token-capability-or-platform`) once per growth commit, each against its first
  parent, instead of from the pre-BL1 base to the head: a leg fails when it fails on any commit.
  Every other check keeps its range, so the publish, deployment, assistive-technology, and CLI-surface
  checks are unchanged. Under this scope the `bl1CommitsTouchNoReactSource` leg audits the growth commit
  itself, the pinned #227 exception does not apply, and the platform leg still reads the head. The
  audit records the commits in `growthScope`, and each scoped check lists its per-commit legs under
  `observations.commits`. The controls include growth controls, which run a commit that breaks the
  check as a growth commit.
- **The informational growth gate (Decision 0029).** A growth capture runs the audit with
  `growthGate: 'informational'` and records `growthGate: 'informational'` in `verification.json`.
  The legs of `react-package-manifest`, `react-source-files`, `react-stylesheet-names`,
  `no-dependency-change`, and the `catalogRecordsUnchanged` leg of
  `no-new-component-token-capability-or-platform` are computed and recorded per commit but do not fail the
  audit: a growth commit may change `@muxui/react`, dependencies, and component records under its own
  proof, and the record lists what it changed and claims nothing about it. The tool declares them in
  the `growthInformational` line of each check, `growthInformationalLegs` exports them, and each check
  records its `informationalLegs`. Every other leg gates: no workflow, hosting, deployment, or Astro
  deployment setting change, no package version bump, private packages, `web.react`-only patterns, no
  assistive-technology claim, and `plan`, install, registry, and scaffold unavailable.
- **Release checks after the close-out.** `versions-follow-decision-0026` holds the close-out range to
  the three packages Decision 0026 named and, across a growth commit, to no version change at all.
  `registry-unchanged` holds that every version the R1 exit read-back recorded is still listed with its
  recorded integrity, shasum, and publish time, and that `latest` still names the version it named then;
  a later release candidate and a moved `next` are listed and not claimed (Decision 0023 amendment 01).
  Neither fails a growth capture because a release candidate was published.
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
reader can see whether the tools that ran are the tools that were reviewed. A
close-out capture refuses a content review if `catalog/patterns` differs from the tree it read. A growth capture
instead records, for each block, the retained review that covers it: a review covers a block when it names the
block and the git tree of `catalog/patterns/<slug>` at the revision the reviewer read is the tree at the source
revision (`reviewCoverage` in the `E-BL1-10` artifact, with each row keeping its review's own reviewed revision
and tree). Reviews retained by earlier captures, current or archived, are candidates, so `--content-review` is
needed only for a block whose tree matches none of them, a new block or an edited one. A review is independent of the authoring agents only: it records its reviewer, and
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
- `E-BL1-06`: the page widths are the `pageWidths` list in `apps/docs/src/lib/block-presets.ts`,
  which no other document repeats; the integrity test reads the list at each capture's source revision.
  The toolbar presets are a docs choice. The captures are PNG files kept in the
  repository because they are synthetic content rendered from committed sources;
  they record overflow and appearance and are not a pixel-regression baseline.
- `E-BL1-07`: the in-process API is compared with the CLI process after the location
  fields in the normalization rule are excluded. The site comparison covers the
  fields the loaders read, and rail search is compared as a set of blocks, not by
  rank.
- `E-BL1-08`: the catalog digest moved before any block shipped (the query API bump,
  #223, and the pattern kind, #224), so the close-out baseline is the digest pinned at #225, not
  the pre-BL1 digest; the capture records the whole chain. That pin is never moved: later
  pull requests changed component records, so a growth capture records the digest across the commits
  that added or changed its blocks instead, with the same compiler on both sides. That comparison is an
  observation, not a gate (Decision 0029): a growth commit that changes the compiler, the schema, or other
  catalog sources is listed (`digestAffectingPaths`, `identical`, `holds`) and the record claims nothing
  about it.

## Adding a block

The Roadmap gives a block added later `E-BL1-03` through `E-BL1-08`, `E-BL1-10`, and
`E-BL1-11`, and the release and boundary checks of `E-BL1-09`, not the close-out scope check
or the exit review. The close-out scope would fail by design, because a new block changes
`catalog/patterns/` and the catalog sources, which the close-out may not. A growth
capture (`--growth`) skips the close-out scope check and the exit review, records
`scope: growth` and `growthGate: 'informational'` in `verification.json` and the scope in the
`E-BL1-09` artifact, and keeps every other check, including the gate legs of the boundary audit,
which must still pass. A capture without `growthGate` was made before Decision 0029 and is verified
strictly against the rules at its own source revision.

**Growth scope of `E-BL1-08` and `E-BL1-09`.** Other pull requests land between the
close-out and a growth capture and change `@muxui/react`, a manifest, the lockfile,
component records, or a workflow under their own authority (#234 to #236 and #245 did), so comparing the close-out with
the head would blame the blocks for them. A growth capture evaluates both across the
growth itself, found from git:

- The growth commits are every commit on the first-parent history of the source revision, after
  the retained close-out revision, that adds or changes a pattern the close-out did not measure
  (the patterns `E-BL1-11` lists as `addedPatterns`): it changes a file under
  `catalog/patterns/<slug>/`, or that pattern's entries in `packages/catalog/catalog-sources.json`.
  A later commit that adds a variant or edits a new block is a growth commit like the one that
  added it, so it cannot also change `@muxui/react`, a dependency, or a component record
  unaudited. Every growth commit must be a squash merge of one pull request: a single-parent commit
  whose subject ends with GitHub's ` (#<number>)`. Git cannot say which commits belonged to one pull
  request, so a pull request merged as several commits (a rebase merge) or as a merge commit could carry
  a workflow, dependency, or `@muxui/react` change in a commit that touches no block, and that commit
  would be neither selected nor audited. The capture and the integrity test therefore refuse a growth
  commit that is not a squash merge (`BL1_GROWTH_NOT_SQUASHED`) rather than audit part of a pull request.
  Blocks that arrived in more than one squash-merged pull request are audited one commit at a time,
  and the rehearsal on a branch audits the branch's own commits, which are not merged yet and so are
  exempt from the squash rule. The source
  revision need not be a growth commit, so other pull requests may land after the merge. A new
  block that no commit after the close-out touched stops the capture. Each audited commit is
  recorded with its parent, the blocks it added and the blocks it changed, and the sources
  `E-BL1-08` left out for it.
- `E-BL1-08`, per growth commit: the catalog compiled from the tree at its first parent
  and from the tree at the commit, each without the sources of the blocks that commit added
  or changed, and the files the commit changed under `digestAffectingPaths` in `growth-scope.mjs`
  (the catalog compiler, the schema's sources and JSON Schemas, the token package's sources, and the
  `package.json` of the catalog, schema, and token packages, whose `exports` decide which module the
  compiler loads) are recorded. Whether the two digests are equal is an observation, not a gate
  (Decision 0029): a commit that edits another source, a close-out block, the catalog package version,
  the compiler, or the schema moves the digest and is listed, and may do so under its own proof. Both
  sides are compiled by one compiler, so a change to it could not show in the digest, which is why the
  changed paths are listed. The pattern validators (`pattern-content.mjs` and `pattern-imports.mjs`) only
  reject records, so they are not listed, and a test pins that the compiler imports nothing else from its
  package. What `E-BL1-08` claims is the `generate:check` identity, two byte-identical compiles, and the
  tree-internal check that the catalog differs from the catalog with no pattern entries by the
  added artifacts alone.
- `E-BL1-08` limit: the integrity test re-derives from git everything the artifact records except
  the two digests of each commit: the growth commits, their parents, the added and changed
  blocks, the excluded source directories and entries, and the changed compiler and schema paths,
  and requires an exact match. It does not run a historical compiler to recompute the digests,
  because that would tie a retained record to a later compiler, so the digests are bound only by
  the artifact and index digests, like the other retained values. The record's non-claims and the
  artifact say so. A retained capture must declare exactly the `digestAffectingPaths` that the
  `growth-scope.mjs` bound at its source revision exports, which the test reads from git, not from
  the record, so a record cannot narrow the list; the tool's bytes must match the proof tool the
  validation summary binds. A later change to the list never fails a retained capture. A capture
  without `growthGate` must also show every digest pair equal and no changed digest-affecting path,
  as it always did.
- `E-BL1-08` and trees from before #251: Decision 0028 removed `authorityDecisionPath` from the
  catalog source manifest and the compiler no longer accepts it, so each extracted tree that still
  carries the key is compiled with that one key dropped, on both sides of the comparison. Any other
  unknown key still fails the compiler, and the record's non-claims say so.
- A growth block is not tracked through a rename. A commit after the close-out that renames, moves,
  or deletes the record of a block added since the close-out stops the capture with
  `BL1_GROWTH_BLOCK_MOVED` ("rename or remove a growth block in a separate, non-growth change"),
  whatever the block is called at the head: the exclusions of the two sides would not match, and the
  block's earlier commits would go unaudited. Edits inside an unmoved block are growth commits as
  above.
- `E-BL1-09`, per growth commit, gates: no workflow, hosting or deployment file, and no Astro site,
  base, adapter, or output setting (`no-workflow-or-hosting-config`), and no change to the version of any
  workspace package (`versions-follow-decision-0026`). It records, without gating on them
  (the informational growth gate, above), whether the commit and its first parent have the same
  `@muxui/react` `package.json`, whether the commit changes a non-test file of `packages/react`, a stylesheet
  class name or custom property, a dependency field of any `package.json`, a lockfile, workspace, `.npmrc`, or
  `.node-version` file, or a component, token, capability, or React family record. The claim text names the
  audited commits and says that it claims nothing about the recorded changes. The publish, deployment,
  registry, assistive-technology, and CLI checks run as before, and the registry check tolerates a later
  release candidate.
- The records state what they do not claim: the changes other pull requests made since the close-out, and
  the changes a growth commit makes to `@muxui/react`, dependencies, and component records. Both
  `E-BL1-08` and `E-BL1-09` carry the non-claim "A growth commit may change `@muxui/react`, dependencies,
  and component records; this record lists what it changed and claims nothing about it.", and the
  integrity test requires it. A growth pull request is therefore one squash-merged commit that adds
  or edits blocks and may also carry the component, dependency, or record change the block needs, with that
  change's own proof named in the pull request. One that changes a workflow or hosting file, bumps a package
  version, or renames, moves, or deletes a growth block, fails the capture and belongs in its own pull request.

The close-out capture keeps its exact scope and pins: the range from the pre-BL1 base, the digest
pinned at #225, and the pinned #227 exception, which the growth scope does not need.

A block is delivered in two pull requests, because a squash merge orphans a branch
commit and the records must bind a commit on main. Merge the block pull request with a squash
merge: a growth capture refuses any other, as above. The repository still allows rebase and
merge-commit merges (a repository setting for Andrew to restrict), so until it does the rule is
held by the capture and the integrity test, not by GitHub, and a growth pull request merged another
way cannot be captured.

**1. The block pull request (a branch).** It edits sources, never a record:

- the block under `catalog/patterns/<slug>/` and its entries in
  `packages/catalog/catalog-sources.json`, then `pnpm generate` for the projections
  (the catalog digest goldens, the Storybook Block pages, and the docs routes);
- `tests/evidence/bl1/regression-thresholds.json`: entries for the new block, all
  written before any measurement of that block: its own discovery queries and
  expectations, its id in `seedSet`, its ids in the `relevant` lists of the component
  queries it participates in, and the provenance text that records them. Each query key is
  unique in the file. Thresholds are fixed before the relevant candidate is measured and
  never changed to turn a failing result into a passing one: when the block fails an
  expectation it wrote, the block changes (its name, keywords, or copy). A pull request may
  change a threshold (Decision 0029): an existing query's expectation or `relevant` list, the
  precision floor, the displacement limit, a dense budget, or the variant source size limit
  (`denseBudgets.examplesSection.variantSourceLexemes`). It states the change and its reason in
  its description before measuring and adds an entry to `provenance.revisions`:
  `{ "query": "<query>" | "limit": "<dot path of the value>", "change": "...", "reason": "...",
  "pullRequests": [...] }`, with `"afterFirstMeasurement": true` for a query revised after its
  result was seen, which must also be in `provenance.revisedAfterFirstMeasurement`. A limit or a budget
  is never logged as changed after its result was seen. No expectation is removed, every query keeps an
  expectation (`expectedFirst`, `firstWithoutPatterns`, or `expectedId` with `expectedWithin`), a
  remaining weakness is a `knownWeakness`, and the log and that list only grow. A category-name query
  such as `collections` is an ordinary revision: its expectation is revised and logged like any other
  (Decision 0026 amendment 02 is superseded). The capture and the integrity test refuse a revised query,
  limit, or budget that has no new entry since the thresholds they compare with (the close-out, and the capture
  being replaced), and `pattern-regression.test.mjs` derives its numbers from the file, so a changed
  limit is followed by the test. Prefer a block whose id, name, keywords, and category do
  not shift an existing rank. A
  pattern whose id and name carry a component word can outrank that component and fail the
  component search rule, so name a block for what it shows, not for a component. The later
  capture still lists every change to the file since the close-out in `E-BL1-11`
  (`thresholdChanges`), so a change is visible in the records whatever its reason;
- any `@muxui/react` change, component, token, or dependency the block needs, with the proof
  that change's own risk calls for (Decision 0028), named in the pull request. A growth capture records
  it and claims nothing about it;
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
   covers the new block and every block whose `catalog/patterns/<slug>` tree it read; the capture
   refuses a block that no retained review covers.

**2. The records-only pull request, captured from main after the first merges.** Fetch,
check out the merge commit on main (a clean worktree), and run:

```sh
node tests/evidence/capture-bl1.mjs --growth \
  --content-review=<independent content review of every block> --content-review-revision=<sha>
```

- It refuses unless a close-out capture is retained (current, or archived under
  `superseded/`) and the catalog has a block that capture did not measure.
- It reads the thresholds as committed at the merge commit, derives the browser tests
  from `patternBrowserTests`, and measures every block, not only the new one. It refuses an unlogged
  threshold change (`BL1_THRESHOLDS_UNLOGGED`).
- A content review is passed only for the blocks no retained review covers by tree; a review already
  retained covers an unchanged block, and the coverage table in `E-BL1-10` says which.
- It finds the commits after the close-out that added or changed the new blocks in the history of the checked-out revision and
  evaluates `E-BL1-08` and `E-BL1-09` across them (see "Growth scope"), so the merge commit does
  not have to be the checked-out head.
- It archives the capture it replaces under `superseded/<revision>/` byte for byte, so the
  close-out stays in the tree and keeps its exact pins, and names that predecessor in each
  new record's `supersedes`.
- Commit only `tests/evidence/bl1/`, with this file's opening paragraph and its list of
  retained reviews updated for the new capture, and open it as a records-only pull request.

`evidence-integrity.test.mjs` holds a growth capture to facts derived at its own source
revision (the variants from the catalog, the browser tests from `patternBrowserTests`,
the page widths from `block-presets.ts`, the query count and the revised-expectation count from the
thresholds, and the growth commits from git, whose scoped audit it recomputes from git objects), and
keeps the close-out capture, current or archived, to its exact pins: five variants, 57 of 57 browser
results, 79 parity rows, 13 of 13 audit checks, nine of 21 revised expectations, the close-out
scope check run, and an exit review of the source tree. A capture with `growthGate: 'informational'`
is also held to the informational legs and scoped checks the tool bound at its source revision
declares (read from git, so a record cannot widen them), the non-claim on `E-BL1-08` and `E-BL1-09`,
the content-review coverage table, and the threshold revision log; a capture without `growthGate` is
held to the strict rules as before. The same test holds the working-tree thresholds to the log on every
pull request, so an unlogged change fails there before any capture.

These records make no assistive-technology support, publication, deployment, or
public-surface claim, and satisfy none of `E-P2.3-01…05`. They do not set a milestone
status; that is tracker state outside the repository.
