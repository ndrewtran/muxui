# Repository policy audit

This package owns Mux UI's deterministic repository-policy checks. For delivery
work, begin with the repository [route map](../../../AGENTS.md), then read the
canonical Architecture, Roadmap, Product Scope, and relevant evidence owner.
The repository entrypoint audits navigation, ownership, generated output, and
artifact naming. Normal component delivery is exercised through `pnpm check`
and `pnpm check:all`; it does not require a task-local operation descriptor.

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
