# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This repo is **single-context**: one Mux UI design-system domain shared across all workspace packages.

```
/
├── CONTEXT.md          ← domain glossary (created lazily)
├── strategy/           ← architecture, roadmap, Product Scope authority
├── decisions/          ← accepted repository and product decisions (ADRs)
│   ├── 0001-workspace-runtime-and-repository-policy.md
│   └── ...
└── packages/, apps/, tooling/, tests/
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`decisions/`**: read decisions that touch the area you're about to work in. Decisions sit below `strategy/` authority; read `decisions/AGENTS.md` for conventions.

If `CONTEXT.md` doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms actually get resolved.

## Recording decisions

New decisions go in `decisions/` using the next free number, with Andrew's acceptance quoted in an `## Acceptance` section. Numbers are never reused. A live decision may be edited to stay current; a decision that is fully replaced, applied, or retired moves to `decisions/archive/` with its acceptance record and an index line (see `decisions/AGENTS.md`). Do not create a separate `docs/adr/` directory.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing decision, surface it explicitly rather than silently overriding:

> _Contradicts decision 0016 (pre-release compatibility), but worth reopening because…_
