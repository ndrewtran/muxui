# BL1 retained evidence

The Roadmap "BL1 Blocks showcase" slice requires `E-BL1-01` through
`E-BL1-11`. This root holds the capture tools for all eleven and, until the
close-out capture is retained, only two records, `E-BL1-08` and `E-BL1-11`. No
other assertion has a retained record here, so this README claims none of them
met. The Roadmap exit condition is judged from the retained records, not from
this file.

## Records on main today

- `E-BL1-08`: repeated generation is a no-op, and the catalog digest changes
  only for the added sources.
- `E-BL1-11`: the catalog regression baseline for the seed set. Nine of its
  twenty-one discovery expectations were revised after a first measurement and
  before capture, so they were not all fixed before measuring; the thresholds'
  `provenance` field names them and the reasons. The queries "collections",
  "split hero", and "billing toggle" rank their pattern below first, known
  discovery weaknesses the record states rather than passes.

Both bind source revision `be6f7c41`, a commit from a pull request branch that a
squash merge removed from main's history, so neither can be fetched from main.
They stay byte for byte as they are, because evidence is append-only. The
close-out capture supersedes them: it recaptures both from a main commit, and
each new record carries `supersedes` with the path, digest, and source revision
of the record it replaces. Git history keeps the old bytes.

## The close-out capture

`node tests/evidence/capture-bl1.mjs` retains all eleven records for the four
shipped blocks (the poster grid with its CSS-grid and virtualized variants, the
marketing hero, the pricing plans, and the account settings) in one run, so the
index binds a single source revision and tree.

- It runs from a clean committed revision that is in `origin/main`'s history
  and refuses any other, because a squash merge orphans a branch commit and every
  record would bind a commit nobody can fetch. This is why the tools and the
  amendment land first and the evidence is captured from the merged main commit
  in a follow-up pull request, the pattern the R1 exit used.
- `--rehearsal=<dir>` runs every proof and writes the evidence under `<dir>`
  instead, skipping the main-history check, so the tool can be exercised before a
  merge. A rehearsal is never retained.
- It refuses to write when any proof fails, retains a sanitized excerpt of every
  command's output (the raw output's digest is in the artifact, the raw output is
  not retained), binds each proof tool by commit, tree, and bytes, and verifies the
  result with `evidence-verify`.

| ID | Proof |
| --- | --- |
| `E-BL1-01` | `node --test` over `packages/schema/test/pattern.test.mjs` and `packages/catalog/test/pattern-catalog.test.mjs`; each required negative is listed with the code, path, message, and owner parsed from the test source that ran |
| `E-BL1-02` | `packages/tooling/test/pattern-authoring.test.mjs` |
| `E-BL1-03` | `pnpm --filter @muxui/repository-policy run proof:pattern-variants` (packed SSR and hydration, with row proof), the packed-declarations typecheck test, and `variant-typecheck.mjs` (one `tsc` run per variant against the packed declarations) |
| `E-BL1-04` | `apps/react-storybook` `check:scoped` with the block slugs as families (light and dark axe and colour audits per Block page), and the four block browser tests with `MUXUI_BROWSER_ENGINES=chromium,firefox,webkit` |
| `E-BL1-05` | `pnpm --filter @muxui/docs run check`, which includes the `check-blocks` report |
| `E-BL1-06` | `pnpm --filter @muxui/scale run check:browser:docs` with `MUXUI_BLOCKS_CAPTURE_DIR`: every variant at every toolbar preset, and every marketing variant at every page width, in light and dark, with the overflow report |
| `E-BL1-07` | `surface-parity.mjs`: the API, CLI JSON, human, dense, and the site loader over pattern `list`, `search`, `get`, the participant filter, `usedIn`, and component examples, plus the CLI and loader tests |
| `E-BL1-08` | `pnpm generate:check` and a catalog compare against the digest pinned at #225 |
| `E-BL1-09` | `boundary-audit.mjs` and its negative controls |
| `E-BL1-10` | `content-scan.mjs`, the content-rule tests, and the independent content review |
| `E-BL1-11` | `regression.mjs` against `regression-thresholds.json` |

The other files here are the proof tools the capture binds: `proof-run.mjs`
(runs, sanitizes, and parses a command), `surface-parity.mjs`,
`boundary-audit.mjs`, `content-scan.mjs`, `variant-typecheck.mjs`, and
`regression.mjs`.

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
- **Negative controls.** A check that cannot fail proves nothing, so each check has a
  control: a range or head from this repository's history that breaks it (#207 for
  the manifest and dependencies, `aab51163` for the version and private flag, #201
  for the stylesheet names, #213 for workflows, #222 for source files and catalog
  records), or a synthetic input a predicate must reject and accept (registry,
  deployments, assistive-technology claims, CLI surface). The close-out scope check
  fails when no change exists, so it cannot pass vacuously. The evidence integrity
  test asserts every control and that every check has one, and the capture retains
  the results.
- **Heuristics.** The assistive-technology claim scan reads added lines in catalog
  records, docs and Storybook sources, package sources and readmes, and the root
  readme, and flags claim-shaped wording. It is a heuristic and cannot prove a claim
  absent.

## Independent reviews

Reviews are inputs the capture retains, never proofs. `--content-review` retains the
`E-BL1-10` content review and `--exit-review` the independent review of the
`E-BL1-09` audit and the exit claim, each with the full revision the reviewer read.
A review is retained as the reviewer wrote it except for local paths, with the digest
of the original, and it names its own reviewed revision and tree. A review's reviewed
revision can differ from the capture's source revision, and each retained review
says whether its reviewed revision is in main's history. The content review is also
refused if `catalog/patterns` differs from the tree it read. A review is independent
of the authoring agents only: it records its reviewer's model, and two reviews by
the same model are not independent of each other.

## Known limits

- `E-BL1-01`: an unknown field's diagnostic names the field path, not an owner,
  because no owner resolves for an undeclared field. The Roadmap wording "names the
  earliest owner" is met for seven of the eight negative cases, and the record says
  so.
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

A block added later adds its search queries to `regression-thresholds.json` (and its
id to `seedSet`) before it is measured, needs its own independent content review,
and then re-runs the capture from a main commit, because the index pins the
thresholds digest. Raising a threshold is a deliberate edit to
`regression-thresholds.json`, not to a record. A pattern whose id and name carry a
component word can outrank that component and fail the component search rule, so name
a block for what it shows, not for a component.
`packages/tooling/test/pattern-regression.test.mjs` runs `regression.mjs` on every
`@muxui/tooling` check, so each block added later is held to the same thresholds.

These records make no assistive-technology support, publication, deployment, or
public-surface claim, and satisfy none of `E-P2.3-01…05`. They do not set a milestone
status; that is tracker state outside the repository.
