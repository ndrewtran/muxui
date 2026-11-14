# Scale

- Private theme editor over `catalog/tokens/`; it owns no token fact. It also
  holds the browser proofs of the built docs site (`test/browser/docs-*.test.mjs`,
  reading `apps/docs/dist`).
- `check:browser:docs` runs three files at once, so size every deadline for
  contention. Use `previewsRendered` and `measured` from
  `test/browser/docs-site.mjs` at their default timeouts or longer. Wait on page
  state, never `networkidle`.
- Keep one concern per file, and list a new docs proof in `check:browser:docs`.
