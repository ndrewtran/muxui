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

## Superseded captures and their paths

When a later BL1 capture replaces one (`bl1/` is the only root that does), the
earlier capture is copied, byte for byte, to `<root>/superseded/<revision>/`
(the first 12 characters of its source revision) before the new records take
its paths, and the new index lists every copied file with its digest. The copy is never edited, so its records and index
keep the paths they had at the retained root, such as
`tests/evidence/bl1/artifacts/E-BL1-08.json`, and those paths now name the
replaced files, not the copies.

Resolve an archived capture's paths in its own directory:

- A path under the retained root (`<root>/...`) resolves to the same relative
  path under `<root>/superseded/<revision>/`. This covers the `artifact.path`
  and `validation.path` of each record and the `records`, `artifacts`, and
  `validation` paths of the archived index. For the retained root itself the
  rule changes nothing.
- A path already under `<root>/superseded/` is a real location, such as a
  `supersedes.path`, and is read as written.
- The digest each reference carries is what binds it. A resolved file whose
  digest differs is a failure, never a reason to rewrite the record.

`evidence-integrity.test.mjs` applies this rule (`capturePath`) when it reads
and checks every archived BL1 capture, and `assertRecordReferencesResolve`
checks the digests of each record's `artifact` and `validation` under it.
