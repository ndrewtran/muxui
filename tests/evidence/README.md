# Evidence retention route

Evidence is append-only proof, not a source of product meaning or a substitute
for human acceptance. Before capture:

1. Read the nearest route map and the active roadmap/Product Scope authority.
2. Resolve the applicable proof owner and commands through the owning package,
   Architecture, Roadmap, Product Scope, and evidence record.
3. Record source commit/tree, executed commit/tree, proof-tool commit/tree, and
   the owner reference that defines their required relationship.
4. Record the evidence head/tree/index digest, or the owner-declared N/A record.
5. Apply the applicable disclosure owner before any review or publication
   handoff.

Retained records must keep their own privacy, retention, expiry, exception, and
advisory bindings. Task-local review notes are not repository evidence. Hosted
URLs and mutable Project values remain observations outside immutable records.

## Archive

Closed milestone evidence is under `archive/`, byte-exact and not verified:
`evidence-verify.mjs` skips it. A set moves there with `git mv`, unchanged, once
its milestone is closed and no current tooling, test, or published package reads
it. Evidence that current tooling or the published package reads stays in its
own directory and stays verified. The rule is in Decision 0027.

Scripts of archived sets were deleted; use git history. Records and READMEs
inside `archive/` may cite those scripts (`capture-g0.3.mjs`,
`capture-g0.4.mjs`, `capture-g0.5.mjs`, `capture-g1.0.mjs`,
`capture-g1.1.mjs`, `capture-gate-0.mjs`) and paths outside `archive/`; the
citations stay as recorded.
