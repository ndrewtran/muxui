# Mux UI

Mux UI is a versioned design-system knowledge graph. Delivery is React-first:
`@muxui/react` implements 79 component families (the fixed 53 plus 26
supplemental) under Product Scope 13.1.0. Framework-free web and React Native
are deferred later tracks. Nothing is published yet, and this repository makes
no public package or component-support claim.

Start with [`AGENTS.md`](./AGENTS.md) for the route map and verification loop.
The normative authority chain lives in [`strategy/`](./strategy/).

Generated package and explorer projections are intentionally absent from a
fresh checkout. Run `pnpm generate` before using a package directly; the root
`pnpm check` and `pnpm check:all` commands bootstrap them automatically.
