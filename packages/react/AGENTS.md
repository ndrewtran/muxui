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

Run `pnpm --filter @muxui/react check`, then the root affected checks.
