# Repository policy audit

This package owns Mux UI's deterministic repository-policy checks. For delivery
work, begin with the repository [route map](../../../AGENTS.md), then read the
canonical Architecture, Roadmap, Product Scope, and relevant evidence owner.
The repository entrypoint audits navigation, ownership, generated output, and
artifact naming. Normal component delivery uses the smallest sufficient root
scope: `pnpm check --component <family-or-slug>` for family checks,
`--package <name|path>` for a package and its dependents, or `--files
<path[,path]>` for exact task files. Repeat selectors within one selector kind
as needed; do not mix component, package, and file selectors. Use
`--dry-run` or `--preview` to print the plan without executing it. Unscoped
`pnpm check` maps changed owners to dependents and scopes generation to their
prerequisites; explicit scopes ignore unrelated dirty files.

`pnpm check:all` remains the complete deterministic workspace graph and
`pnpm release:prepare` remains full release preparation. Focused reports are
partial proof, never full release proof; broaden only for shared workspace or
dependency changes, release work, or an explicit all request. This does not
require a task-local operation descriptor.

Evidence capture and disclosure remain owned by the architecture, Product Scope,
package, and evidence references. See
[`tests/evidence/README.md`](../../../tests/evidence/README.md) before retaining
proof.

## Identity-reset compatibility

`identityReset.current` is the live Mux UI identity. The audit rejects legacy
machine/display names, package scopes, namespaces, executable command tokens,
completion helpers, experimental namespaces, fixture keys, and historical
object keys in current sources. No public package API exposes a legacy alias or
compatibility mode.
