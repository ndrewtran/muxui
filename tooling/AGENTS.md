# Tooling navigation

Compilers and generators transform declared sources deterministically; audits
enforce ownership and parity; evaluations remain subordinate to deterministic
checks. Tools must emit stable diagnostics that point to the earliest owner.

Scope tooling work with `pnpm check --files tooling/<path[,path]>` or
`pnpm check --package <name|path>`, and run `pnpm generate:check` when
generator outputs change. Common scopes and proof rules are in the root
[`AGENTS.md`](../AGENTS.md) Verification section.

For delivery planning and proof routing, follow
`audits/repository-policy/README.md` and the canonical Architecture, Roadmap,
Product Scope, and evidence owners. Keep commands, reviewer assignments,
disclosure rules, and acceptance state out of tooling documentation.
