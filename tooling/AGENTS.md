# Tooling navigation

Compilers and generators transform declared sources deterministically; audits
enforce ownership and parity; evaluations remain subordinate to deterministic
checks. Tools must emit stable diagnostics that point to the earliest owner.

Use the narrowest root scope that covers the tooling change: `pnpm check
--files tooling/<path[,path]>` for exact task files or `pnpm check --package
<name|path>` for a package and its required dependents. Unscoped `pnpm check`
follows changed owners and dependents. Use `pnpm generate --package <name|path>`
for bounded generation prerequisites; plain `pnpm generate` remains full, and
`pnpm generate:check` verifies repeated no-op generation when outputs change.
Explicit scopes ignore unrelated concurrent dirty files. Focused reports are
partial proof; broaden to actual affected owners for shared tooling or
dependency changes and use `pnpm check:all` or release preparation for full
graph work.

For delivery planning and proof routing, follow
`audits/repository-policy/README.md` and the canonical Architecture, Roadmap,
Product Scope, and evidence owners. Keep commands, reviewer assignments,
disclosure rules, and acceptance state out of tooling documentation.
