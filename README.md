# Mux UI

Mux UI is a versioned design-system knowledge graph. Delivery is React-first:
`@muxui/react` implements 84 component families (the fixed 53 plus 31
supplemental) under Product Scope 19.0.1. Framework-free web and React Native
are deferred later tracks. Only `@muxui/react` release candidates are
published, on npm's `next` tag, and this repository makes no stable release or
component-support claim.

Start with [`AGENTS.md`](./AGENTS.md) for the route map and verification loop.
The normative authority chain lives in [`strategy/`](./strategy/).

Generated package and explorer projections are intentionally absent from a
fresh checkout. Run `pnpm generate` before using a package directly; the root
`pnpm check` and `pnpm check:all` commands bootstrap them automatically.
