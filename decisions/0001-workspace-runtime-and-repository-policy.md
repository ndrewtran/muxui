# Decision 0001: Workspace runtime and repository policy

- Status: Accepted
- Date: 2026-08-04
- Owner: Core UI maintainer
- Roadmap: G0.0
- Scope: `SCOPE-FOUNDATION-001`, `SCOPE-QUALITY-GENERATOR-CONTRACT`

## Context

G0.0 requires one package-manager and runtime policy before workspace sources
multiply. The repository also needs one machine-readable owner for path,
generation, slug, and alias rules so navigation files and future generators do
not become competing policy sources.

## Decision

- Use pnpm workspaces and pin pnpm in the root `packageManager` field and
  lockfile.
- Run the workspace and CI on the Node.js major that `engines.node` in the root
  `package.json` names, and pin local and CI proof to one exact version in
  `.node-version` (CI reads it). The `toolchain` entry in
  `repository-policy.json` must match both, and the policy audit fails on
  drift. A workspace and CI Node major upgrade is an ordinary reviewed pull
  request that changes those owners together and carries the CI and engines
  proof, as Decision 0028 treats any dependency upgrade. It needs no decision.
  This covers only the workspace and CI runtime. The `engines` range of a
  published package, such as `@muxui/react`, declares consumer compatibility,
  so changing it is a support change and stays a stop for Andrew under Decision
  0028.
- Use workspace dependency declarations as the task graph. Root commands select
  package-owned tasks in topological order; affected checks include every
  changed package and all of its dependents. A repository-wide policy or
  configuration change runs the full graph.
- Keep the root script surface small. The six core commands that Architecture
  defines are the minimum, and `repository-policy.json` owns the required
  list. Detailed checks and generators belong to their owning workspace
  package, so the root does not become a catalog of package tasks.
- Store the executable canonical/projection, generated-marker, slug, and alias
  rules in `tooling/audits/repository-policy/repository-policy.json`. Prose may
  link to that file but must not duplicate it as an independently editable
  ruleset.
- A generated file must identify its earliest source and carry a verifiable
  content digest. A mismatch fails with an owner-linked repair instruction;
  generated output is never repaired directly.
- Package, catalog, and artifact slugs use lowercase kebab-case. Exceptions are
  explicit aliases owned by the canonical artifact record and are audited
  deterministically.

## Consequences

- The initial workspace can prove orchestration and repository policy without
  creating product, renderer, catalog, or speculative foundation packages.
- Root affected checks stay safe when shared configuration changes and remain
  narrow for isolated package changes.
- Future generators must implement stable ordering, `--check`, source-linked
  drift diagnostics, and wall-clock-free canonical preimages before activation.
- This decision makes no public runtime, package, compatibility, or release
  claim. The Foundation boundary remains internal.

## Rejected alternatives

- npm or Yarn alongside pnpm: this would create multiple workspace authorities.
- A hand-maintained component or package inventory in navigation files: this
  would become a second registry.
- Inferring generated files from directory names alone: this cannot provide the
  earliest source or detect direct body edits.
- Treating the current machine's unpinned runtime as support policy: this is not
  reproducible evidence.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction for the workspace Node major and root
  command changes above; repository adoption through a protected pull request
- Acceptance date: 10 October 2026

Andrew's direction, in his words:

> I want to loosen the authorities and decisions surrounding hard-lists and blockers for development work as Mux UI is under development. Decisions such as a definitive component list that can use Lucide icons for example has no place in Mux UI as Lucide is the default iconography provider/substrate for all Mux UI components. Find other examples of authority and decision gates that are similar in their restrictive nature that ought to be loosened/removed.

> Go ahead with batch 0 plus batches 1 to 5.

This record does not claim that any check passed, that a pull request was
opened or merged, or that any package, release candidate, or dist-tag changed.
