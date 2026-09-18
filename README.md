# Mux UI

Mux UI is a versioned design-system knowledge graph with first-class web,
React, and React Native renderers. The repository is currently building its
internal Foundation boundary; it makes no public package or component-release
claim yet.

Start with [`AGENTS.md`](./AGENTS.md) for the route map and verification loop.
The normative authority chain lives in [`strategy/`](./strategy/).

Generated package and explorer projections are intentionally absent from a
fresh checkout. Run `pnpm generate` before using a package directly; the root
`pnpm check` and `pnpm check:all` commands bootstrap them automatically.
