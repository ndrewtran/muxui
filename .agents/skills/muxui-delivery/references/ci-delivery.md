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

## Wide-CI changes

The planner decides CI breadth; component CSS and most story changes route
per family. A component PR needs Andrew's OK before continuing when the
preview shows any of:

- `checks.fullWorkspace`, `checks.reactPackageFull`, `checks.tokens`, or
  `checks.reactTheme` set to `true`;
- Storybook runs across every family; or
- a `STYLE_OWNERSHIP` failure asking for the shared theme or style owner.

Typical causes, as examples only: the token catalog under `catalog/tokens/`,
`packages/foundation/`, global or selector-free rules in shared stylesheets,
and the `reactStorybookSharedPaths` in
`tooling/audits/repository-policy/repository-policy.json` such as the story
factory and Storybook preview.

## Authority pull requests

A PR touching a file matched by `AUTHORITY_FILES`, `PLANNING_CONTROL_FILES`,
or `PLANNING_CONTROL_PREFIXES` in `.github/scripts/validate-planning-pr.cjs`
needs the `type:decision` or `type:architecture-maintenance` label and an
`Authority change record: #…` line; a Product Scope change also needs the
scope-version and migration fields from the PR template.
