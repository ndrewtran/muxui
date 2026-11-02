# React Storybook navigation

This app is the private Storybook projection and visual/a11y proof owner for
the standalone React renderer. Its stories and browser audits consume the
canonical React component contract; they do not define a second component
inventory.

`pnpm check --component <family-or-slug>` runs selected React and Storybook
family checks, and `pnpm check --package @muxui/react-storybook` covers the
package scope. `pnpm check --files <paths>` and the default `pnpm check` run
the page selection CI plans for those paths instead of the full audit, and fall
back to it, with a printed notice, when the selection is wide or cannot be
planned. The package-local `pnpm --filter @muxui/react-storybook check`
remains the complete Storybook package audit. Style-only component changes
need selected-family accessibility/browser proof in light and dark modes plus
relevant visual evidence. Common scopes and proof rules are in the root
[`AGENTS.md`](../../AGENTS.md) Verification section.

## Page-visiting proofs

A proof that needs Storybook pages joins the single fused visit in
`test/storybook-a11y.test.mjs`, through `auditPagePaints` in
`test/helpers/page-visit.mjs`: axe and colour collection share one page open
per page and scheme. A second test file that opens the same pages doubled the
Storybook jobs before, and the planner's page-shard budget assumes one visit
per page, so a standalone page-visiting file is unplanned work on every shard.
