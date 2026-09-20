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

Use the smallest sufficient proof. `pnpm check --component <family-or-slug>`
runs the React and selected Storybook family checks; shared date selectors are
expanded together by the task runner. `pnpm check --package @muxui/react` (or
the `react` package alias) includes the package and required dependents, while
`pnpm check --files packages/react/<path[,path]>` scopes task inputs to exact
files and ignores unrelated dirty work. Keep `pnpm --filter @muxui/react
check` for the complete package-local check when that is the required proof.

Style-only component changes need scoped family checks and relevant visual
evidence. Shared styles, tokens, runtime, or API changes broaden proof to the
actual affected owners and dependents. Reuse unchanged evidence and expand
only for relevant failures. Focused reports are partial proof, never full
release proof; use the full graph for shared workspace or dependency changes,
release work, or an explicit all request.
