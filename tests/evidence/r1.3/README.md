# R1.3 retained CI evidence

Decision 0022 records R1.3 as complete for the rc prerelease boundary on
its logged evidence. This root retains that evidence from pull request
#106 before the hosted Actions logs expire: sanitized step excerpts
under `validation/`, raw-log digests and execution identity in
`verification.json`, the pull-request observation under `artifacts/`, and
one record per roadmap assertion under `records/`.

Each record's `coverage` cites the excerpt lines that evidence it and names
the parts that rest only on author-reported PR validation; those records are
`inconclusive` even when another part is deferred. A record is `partial`
only when every non-deferred part is shown and some part is deferred, and a
wholly deferred item is `unmet`. This root makes no
assistive-technology, support, publication, or release claim. Recapture with
`node tests/evidence/capture-r1-ci-logs.mjs` only while the hosted logs exist; retained bytes are
never edited.
