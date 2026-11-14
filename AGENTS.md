# Mux UI

Mux UI is a React design system and component library published as prereleases
under `@muxui/*`. Its catalog records feed the package, the `muxui` CLI, the docs
site and Storybook. Product facts are in `ARCHITECTURE.md`.

## Routes

- `catalog/`: canonical records (components, patterns, guides, tokens).
- `packages/`: `react`, `schema`, `catalog`, `tooling` (published) and `tokens`.
- `apps/`: docs site, Storybook, Scale theme editor, playground. Projections only.
- `tooling/`: repository policy, release scripts, the Figma generator.
- `tests/fixtures/`: shared test fixtures and the Tailwind consumer.

Read the nearest local `AGENTS.md` when one exists.

## Source rules

- Author a fact once in its owner, then run `pnpm generate`. Never hand-edit
  generated output; fix the source the drift message names.
- Path, generated-marker, slug and alias rules live in
  `tooling/audits/repository-policy/repository-policy.json`.
- Prerelease compatibility is current-only: remove superseded names and formats
  outright and update every caller. No aliases, coercions or migrators.
- Shipped dependencies are pinned exactly; name a dependency by purpose, never
  its version, in prose.

## Verification

- `pnpm check`: changed packages plus dependents, with scoped generation. Narrow
  it with `--package <name|path>`, `--component <family-or-slug>` or
  `--files <path[,path]>`; `--dry-run` prints the plan.
- `pnpm --filter <package> check`: one package's complete check.
- `pnpm generate` and `pnpm generate:check` (repeated generation is a no-op).
- `pnpm check:all`: the full graph. Use it for workspace configuration,
  dependency or release changes.
- `pnpm release:prepare`: release preparation; never publishes.

## CI habits

- Before a push, run one scoped check for what changed. CI runs every job on
  every browser engine, so do not repeat that locally by habit.
- Widen local proof only to reproduce a CI failure.
- Compare a failing job with the latest `main` run. A failure `main` already has
  is baseline: report it and keep its fix out of the change.
- Browser tests wait on page state, never `networkidle`.

## Needs Andrew's yes

- Publishing, a dist-tag change, deprecation or unpublishing.
- Production, daily-driver channels, or changes in a consumer project.
- Outside-service writes beyond the task's scope: Figma, the npm registry,
  GitHub settings, the tracker, credentials, billing.
- Destructive or privileged actions: deleting unrelated work, rewriting shared
  history, broadening access, exposing private material, a new trust boundary.
- New support claims (stable, platform, assistive technology), or deliberately
  disabling an accessibility, licence, security or release-integrity check.

A task's go-ahead covers its ordinary implementation: dependencies, components,
props, internal packages, refactors and tests.

## Issues

GitHub Issues on `ndrewtran/muxui` through `gh`. Triage labels: `needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
