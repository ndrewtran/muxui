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

The planner decides CI breadth; component CSS and most story changes route per
family. A broad plan is not an approval stop. When the preview shows any of the
following, report the broadened scope to Andrew in one line and run the required
checks:

- `checks.fullWorkspace`, `checks.reactPackageFull`, `checks.tokens`, or
  `checks.reactTheme` set to `true`;
- Storybook running across every family; or
- a plan notice that it widened, or a `STYLE_OWNERSHIP` failure asking for the
  shared theme or style owner, which you resolve by changing the owner it names
  or by running the wider proof the notice plans.

Typical causes, as examples only: the token catalog under `catalog/tokens/`,
`packages/foundation/`, global or selector-free rules in shared stylesheets,
and the `reactStorybookSharedPaths` in
`tooling/audits/repository-policy/repository-policy.json` such as the story
factory and Storybook preview. Breadth alone never needs approval; ask Andrew
only if the change itself alters the product's visual direction, a public
contract, or a safety rule.

## Authority pull requests

A PR that touches a file listed in `.github/scripts/validate-planning-pr.cjs`
needs the `type:decision` or `type:architecture-maintenance` label and an
`Authority change record:` line. The record is an issue (`#N`) or the exact path
of a decision file in the PR checkout (`decisions/NNNN-name.md`, which may be
added by the same PR). The list is short: the strategy documents, the platform
safety contract, the validator with its test, the planning-policy workflow,
`CODEOWNERS`, and the publishing workflow with the files it runs to prepare,
prove, and guard a release (`npm-publication.mjs`, `release-prepare.mjs`,
`release-proof.mjs`, and the React package's `publish-guard.mjs`). The root
`release:prepare` script and `package.json` are reviewed like any other change.

A Product Scope change also states `Scope version effect` on its own line; an
effect other than `none` adds the four change-packet fields from the PR
template, each filled in on its own line, where `None` is a valid answer and a
placeholder such as `TBD` or `<…>` is not.

The PR template's authority section is only for those PRs. Edits to this skill,
the PR template, issue forms, READMEs, and route maps are ordinary PRs.
