# Mux UI CI delivery

Read before a push, when CI fails, or when a change touches tokens,
generators, shared styles, or authority files. Local check commands and scopes
are in root `AGENTS.md` (Verification).

## Before every push

Run `node tooling/audits/repository-policy/src/ci-impact.mjs --preview`. It
runs the CI planner's ownership and routing checks locally in seconds, and
most fast CI failures come from there. For React or Storybook changes, run the
scoped generation it asks for first.

Done when: the preview exits cleanly and its planned groups match the change.

## Classifying a CI failure

CI is the `Deterministic workspace checks` workflow
(`.github/workflows/ci.yml`). Compare a failing group with the latest run of
that workflow on `main`, or rerun the failing command on `main`. A failure
`main` already has is baseline: report it and keep its fix out of the feature
PR.

## Wide-CI paths

These paths are listed under `pullRequestImpact` in
`tooling/audits/repository-policy/repository-policy.json` and widen CI to
theme and all-family Storybook audits across hundreds of pages:

- tokens: `catalog/tokens/`, `packages/tokens/`, `packages/foundation/`;
- the Storybook story generator and shared Storybook files under
  `apps/react-storybook/`;
- shared stylesheets: `packages/react/src/styles/` and
  `packages/react/src/supplemental/styles.css`.

In a component PR, editing them is a scope change: ask Andrew first.

## Authority pull requests

`.github/scripts/validate-planning-pr.cjs` protects the strategy documents,
issue forms, planning policy, and every file under
`.agents/skills/muxui-delivery/`. A PR touching them needs the
`type:decision` or `type:architecture-maintenance` label and an
`Authority change record: #…` line; a Product Scope change also needs the
scope-version and migration fields from the PR template.
