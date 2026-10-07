# BL1 retained evidence

The Roadmap "BL1 Blocks showcase" slice requires `E-BL1-01` through
`E-BL1-11`. This root retains the assertions whose proof is a deterministic
local capture, for the seed set (the poster grid), and grows as the other
slices land. Today it holds:

- `E-BL1-08`: repeated generation is a no-op, and the catalog digest changes
  only for the added sources. The catalog compiled from the manifest without
  the added entries reproduces the digest the BL1-A2 goldens pin, the catalog
  with them differs by exactly their artifacts and relations, two compiles are
  byte-identical, and `pnpm generate:check` reports identical clean-checkout
  generation (its digest is recorded).
- `E-BL1-11`: the catalog regression baseline for the seed set. Discovery
  precision for a fixed query set, component search stability, and dense
  budgets for pattern `list`, `search`, `get`, and `get --section examples` are
  measured against `regression-thresholds.json`, which was committed before the
  capture. Seven of its nine discovery expectations were revised after a first
  measurement and before capture, so they were not all fixed before measuring;
  its `provenance` field names them and the reasons. The query "collections"
  ranks the Poster grid third, a known discovery weakness the record states
  rather than passes.

`regression.mjs` is the measurement. `packages/tooling/test/pattern-regression.test.mjs`
runs it on every `@muxui/tooling` check, so each block added later is held to the
same thresholds. Raising a threshold is a deliberate edit to
`regression-thresholds.json`, not to a record.

Run `node tests/evidence/capture-bl1.mjs` from the exact committed
implementation revision with a clean worktree (only this root may differ). It
refuses to write when a threshold fails, and rewrites `artifacts/`, `records/`,
`verification.json`, and `index.json`. These records make no assistive-technology,
support, publication, or deployment claim. They do not decide a block's brand
marks, real names, or likenesses; `E-BL1-10` keeps an independent content
review for that.
