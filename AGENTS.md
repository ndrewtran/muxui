# Mux UI route map

## Routes

- `strategy/`: architecture, milestone roadmap, and Product Scope authority.
- `decisions/`: accepted repository and product decisions.
- `catalog/`: canonical public knowledge sources.
- `packages/`: package-owned schemas, renderers, catalog, and tooling products.
- `apps/`: documentation and explorer projections over enabled products.
- `tooling/`: compilers, generators, audits, and evaluations.
- `tests/`: cross-package, consumer, platform, conformance, and agent fixtures.

Read the nearest local `AGENTS.md` after entering a major directory.

## Discovery loop

1. Identify the requested artifact, package, or capability.
2. Read its nearest `AGENTS.md` and owning canonical source.
3. Follow declared references; do not infer an inventory from filenames.
4. Change the earliest owner, then regenerate and verify its projections.

## Source ownership

Canonical facts are authored once. Renderer source owns runtime behavior;
tests prove expectations; generated output is never repaired directly. The
executable path, slug, alias, and generated-marker contract is owned by
`tooling/audits/repository-policy/repository-policy.json`.

## Verification

- `pnpm check`: changed owners plus required dependents, with scoped
  generation. For task-local work, use one explicit scope: repeatable
  `--component <family-or-slug>` selectors, repeatable `--package <name|path>`
  selectors, or `--files <path[,path]>` for the exact task files. The
  `--dry-run` and `--preview` aliases print the plan without executing it.
  Explicit scopes ignore unrelated concurrent dirty files.
- `pnpm generate`: full workspace generation by default; explicit package or
  file scopes bind generation to the required prerequisites.
- `pnpm check:all`: the complete deterministic workspace graph and accepts no
  narrowing flags. `pnpm release:prepare` remains full release preparation and
  never publishes.
- `pnpm generate:check`: repeated no-op generation identity.
- `pnpm test:agent`: enabled opt-in or scheduled agent evaluations.

Use the smallest sufficient proof. Style-only component changes use scoped
component or family checks plus relevant visual evidence. Shared styles, tokens,
runtime, or API changes broaden proof to the actual affected owners and
dependents. Reuse unchanged evidence and expand only for relevant failures.
Focused reports are partial proof, never full release proof; use the full graph
for shared workspace configuration or dependency changes, release work, or an
explicit all request.
