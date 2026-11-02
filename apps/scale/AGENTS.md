# Scale navigation

This app is the private Scale theme authoring app. It also owns the browser
proofs of the built docs site (`test/browser/docs-*.test.mjs`), which read
`apps/docs/dist`.

The docs proofs run three files at a time (`check:browser:docs` in
`package.json` uses `--test-concurrency=3`), so every deadline assumes
contention. Wait with the shared helpers in `test/browser/docs-site.mjs`
(`previewsRendered`, `measured`) at their default timeouts or longer. Size any
other deadline for the contended run: 5 s is too tight for a step that takes 2 s
alone. Wait on page state, never on `'networkidle'`, which only added a fixed
500 ms per open and fails planning with
`MUXUI_CI_IMPACT_BROWSER_TEST_NETWORKIDLE`.

Keep one concern per file so files run beside each other:
`docs-styling.test.mjs` and `docs-styling-heights.test.mjs` were split for this.
List a new docs proof in `check:browser:docs`.
