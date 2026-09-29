# React Storybook navigation

This app is the private Storybook projection and visual/a11y proof owner for
the standalone React renderer. Its stories and browser audits consume the
canonical React component contract; they do not define a second component
inventory.

`pnpm check --component <family-or-slug>` runs selected React and Storybook
family checks, and `pnpm check --package @muxui/react-storybook` covers the
package scope. The package-local `pnpm --filter @muxui/react-storybook check`
remains the complete Storybook package audit. Style-only component changes
need selected-family accessibility/browser proof in light and dark modes plus
relevant visual evidence. Common scopes and proof rules are in the root
[`AGENTS.md`](../../AGENTS.md) Verification section.
