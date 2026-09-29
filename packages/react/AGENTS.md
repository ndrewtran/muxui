# React package navigation

`src/` owns the standalone React lifecycle, host-language refinements, and
Mux UI-owned CSS implementation. It does not import `@muxui/web` or external
design-system packages at runtime or build time. Each admitted component owns
its Mux UI selectors, metadata, and token/style behavior. `test/` proves
SSR/hydration, effect cleanup, typed host ergonomics, CSS conformance, and
applicable binding behavior. No
component-support claim is permitted before the owning R1 tranche evidence and
release boundary.

Every component change must retain its Mux UI-owned selectors, metadata,
SSR/hydration behavior, accessibility, CSS, lifecycle, and release checks.
Keep unsupported capabilities explicit and covered by the current contract
tests.

Substantial third-party implementation portions must retain the applicable
license/notice disposition in the exact package and release artifacts.

`pnpm check --component <family-or-slug>` runs the React and selected
Storybook family checks; the task runner expands shared date selectors
together. `pnpm check --package @muxui/react` also accepts the `react` package
alias. `pnpm --filter @muxui/react check` is the complete package-local check
when that is the required proof. Common scopes and proof rules are in the root
[`AGENTS.md`](../../AGENTS.md) Verification section.
