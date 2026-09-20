# React Storybook navigation

This app is the private Storybook projection and visual/a11y proof owner for
the standalone React renderer. Its stories and browser audits consume the
canonical React component contract; they do not define a second component
inventory.

Use `pnpm check --component <family-or-slug>` for selected React and Storybook
family checks, `pnpm check --package @muxui/react-storybook` for the package
scope, or `pnpm check --files apps/react-storybook/<path[,path]>` for exact
task files. Explicit scopes ignore unrelated concurrent dirty files. The
package-local `pnpm --filter @muxui/react-storybook check` remains the complete
Storybook package audit.

Style-only component changes need selected-family accessibility/browser proof
in light and dark modes plus relevant visual evidence. Shared styles, tokens,
runtime, or API changes broaden proof to the actual affected owners and
dependents. Reuse unchanged evidence and expand only for relevant failures.
Focused reports are partial proof, never full release proof; use the full graph
for shared workspace or dependency changes, release work, or an explicit all
request.
