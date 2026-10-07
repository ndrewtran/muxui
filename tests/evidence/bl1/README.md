# BL1 retained evidence

The Roadmap "BL1 Blocks showcase" slice requires `E-BL1-01` through
`E-BL1-11`. This root retains all eleven for the four shipped blocks: the
poster grid (CSS-grid and virtualized variants), the marketing hero, the
pricing plans, and the account settings. One run of
`node tests/evidence/capture-bl1.mjs` from one committed revision with a clean
worktree captures every record, so the index binds a single source revision and
tree. The capture tool refuses to write when any proof fails.

| ID | Retained | Proof |
| --- | --- | --- |
| `E-BL1-01` | Schema and compiler fixtures: the seven required negatives, each mapped to the test and case that exercises it | `node --test` over `packages/schema/test/pattern.test.mjs` and `packages/catalog/test/pattern-catalog.test.mjs` |
| `E-BL1-02` | Authoring fixtures: scaffold round trip, semantic diff, revision explainer, affected closure, source-linked diagnostics | `packages/tooling/test/pattern-authoring.test.mjs` |
| `E-BL1-03` | Packed typecheck, SSR, and hydration for every variant, with row proof for the poster grid | `pnpm --filter @muxui/repository-policy run proof:pattern-variants` and the packed-declarations typecheck test |
| `E-BL1-04` | Light and dark axe and colour audits per generated Block page, and the four block browser tests in Chromium, Firefox, and WebKit | `apps/react-storybook` `check:scoped` with the block slugs as families; `MUXUI_BROWSER_ENGINES=chromium,firefox,webkit` |
| `E-BL1-05` | The docs `check-blocks` report | `pnpm --filter @muxui/docs run check` |
| `E-BL1-06` | Visual captures at every toolbar preset and, for marketing variants, every page-width preset, light and dark, and the overflow report | `pnpm --filter @muxui/scale run check:browser:docs` with `MUXUI_BLOCKS_CAPTURE_DIR` |
| `E-BL1-07` | The surface-parity matrix across the API, CLI JSON, human, dense, and the site loader | `bl1/surface-parity.mjs` and the CLI and loader tests |
| `E-BL1-08` | Generation identity and the catalog digest moving only for the added sources | `pnpm generate:check` and a catalog compare |
| `E-BL1-09` | The platform, release, and negative-boundary audit, with a negative control | `bl1/boundary-audit.mjs` |
| `E-BL1-10` | The deterministic content scan and the independent content review | `bl1/content-scan.mjs`, the content-rule tests, and `artifacts/E-BL1-10-content-review.md` |
| `E-BL1-11` | The catalog regression baseline for the seed set | `bl1/regression.mjs` against `regression-thresholds.json` |

`records/` holds one record per assertion; `artifacts/` holds what each
observed; `validation/` holds the sanitized output of every proof command, with
the digest of the raw output in the artifact (raw output is not retained);
`captures/` holds the `E-BL1-06` images; `verification.json` binds the proof
tools by commit, tree, and bytes. `evidence-verify` checks every digest in
`index.json`, including each capture and excerpt.

## Provenance and known weaknesses

- `E-BL1-11`: nine of its twenty-one discovery expectations were revised after a
  first measurement and before capture, so they were not all fixed before
  measuring; the thresholds' `provenance` field names them and the reasons. The
  queries "collections", "split hero", and "billing toggle" rank their pattern
  below first (3, 2, and 9), known discovery weaknesses the record states
  rather than passes. Raising a threshold is a deliberate edit to
  `regression-thresholds.json`, not to a record.
- `E-BL1-03`: the virtualized poster grid renders an empty shell on the server
  by design (a Virtualizer mounts rows from a measured scroller). Its rows are
  proved after a measured hydration (a window of the 1,000 cards) and by the
  browser test. The CSS-grid variant renders and hydrates all 12 rows.
- `E-BL1-04`: the accessibility proof is the automated axe and colour audits and
  the keyboard, focus, and state browser tests. Manual and assistive-technology
  review of a block's interactive behavior stays deferred to `S1.0` (Decision
  0022). Nothing here is an assistive-technology support claim.
- `E-BL1-06`: the page-width presets are 360, 768, 1024, 1280, and 1920
  ([Decision 0026 amendment 01](../../../decisions/0026-amendment-01-page-width-presets.md)).
  The toolbar presets (360, 768, 1280, and Full) are separate. The captures are
  PNG files kept in the repository (about 2.6 MB for sixty images) because they
  are synthetic content rendered from committed sources; they record overflow and
  appearance and are not a pixel-regression baseline.
- `E-BL1-09`: the shipped `@muxui/react` stylesheet changed after the pre-BL1
  base (the Sidebar fix, #227), so the packed package is not byte-identical to
  it. The audit proves the package manifest and every source file but that
  stylesheet are unchanged, and that the stylesheet adds no class name or custom
  property declaration. The registry check is a read-only observation at
  capture time, compared with the R1 exit read-back.
- `E-BL1-10`: the content review is from an independent read-only reviewer
  agent, not an authoring agent, at revision `670cb188`; `catalog/patterns` has
  the same git tree there as at the capture revision. It is retained verbatim
  except that its worktree path is rewritten to `<repo>` so no local path enters
  evidence; the digest of the original is in the artifact. It passes all four
  blocks and lists three advisories that this close-out did not fix, because
  changing a block source would invalidate the reviewed revision: the
  "A Disabled Sample Title" card copy in the virtualized poster grid, the
  pricing plans "heading navigation" accessibility wording, and the stale-prone
  "Mux has no X" unsupported lines. They are optional follow-ups.

## Exit condition

The Roadmap exit condition and the records that support each clause:

| Clause | Records |
| --- | --- |
| The pattern kind compiles | `E-BL1-01`, `E-BL1-02`, `E-BL1-08` |
| and is retrievable through the API, CLI, and private Blocks section with surface parity | `E-BL1-05`, `E-BL1-07` |
| The poster grid, the marketing hero, and the marketing pricing section pass `E-BL1-01` through `E-BL1-11` | all eleven records, for all four shipped blocks |
| with every claim above left unmade | `E-BL1-09`, `E-BL1-10`, and each record's `nonClaims` |

These records make no assistive-technology support, publication, deployment, or
public-surface claim, and satisfy none of `E-P2.3-01…05`. They do not set a
milestone status; that is tracker state outside the repository.

## Capture and adding a block

Run the capture from the exact committed revision with a clean worktree (only
this root may differ). The first capture passes `--content-review=<the reviewer's
record>`; a later capture without the flag reuses the retained review, which must
still match its recorded digest, and refuses to run if `catalog/patterns` no
longer has the tree the reviewer read. A block added later adds its search
queries to `regression-thresholds.json` (and its id to `seedSet`) before it is
measured, needs its own independent content review, and then re-runs the capture
from the committed revision, because the index pins the thresholds digest. A
pattern whose id and name carry a component word can outrank that component and
fail the component search rule, so name a block for what it shows, not for a
component.

`regression.mjs` is the measurement for `E-BL1-11`.
`packages/tooling/test/pattern-regression.test.mjs` runs it on every
`@muxui/tooling` check, so each block added later is held to the same thresholds.
