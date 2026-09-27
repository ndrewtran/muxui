---
name: muxui-delivery
description: Triage Mux UI repository work through canonical owners, the active milestone, focused proof, protected pull requests, and risk-based review. Use automatically for Mux UI planning, implementation, evidence, PR, merge, tracker, or release-adjacent tasks.
---

# Mux UI Delivery

Use this repository skill after the global `muxui-delivery-guard` for every
Mux UI task. It routes work to canonical owners and owns no commands, mutable
state, reviewer decisions, GitHub writes, or Project writes. The root agent
remains accountable for task decomposition, difficult reasoning, escalation,
delegation, and final decisions.

## Named team routing

When delegation is useful, only root delegates to the named reusable agents
below. Every delegation starts fresh, without inherited conversation turns, and
receives only the minimum task-local context; subagents never spawn or
delegate.

- `coder`: normally owns one complete bounded execution after preflight:
  repository research, implementation, routine debugging, focused checks, and
  final verification.
- `researcher`: optional, bounded, read-only authority or repository research.
- `reviewer`: independent inspection of the frozen actual diff when risk calls
  for it. Preserve canonical role ownership and keep the diff frozen while it
  runs.
- `browser_debugger`: optional advisory browser reproduction; it does not edit
  source or replace deterministic proof.

## Start every task

1. Resolve the repository root, exact source state, and clean working boundary.
   Preserve unrelated changes and prefer a dedicated worktree for authored
   changes.
2. Apply the global guard's authority map. Read `/AGENTS.md`, then the nearest
   route map for each affected canonical owner.
3. Read the Architecture, Roadmap, Product Scope, and relevant decision or
   evidence owner. Classify the task as aligned, a required correction,
   adjacent work, a potential deviation, or unverified before writing.
4. Report a compact route: canonical owner, milestone relationship, required
   checks, risk-selected reviewers, and the next permitted protected-PR action.
5. Stop before writes when an owner, dependency, tracker fact, or required
   human decision is missing or contradictory.

## Fast aligned route

1. Change the earliest canonical owner and regenerate projections rather than
   repairing derived output.
2. Run the owner's focused deterministic checks during development. Run broad
   workspace checks for the frozen candidate when the repository requires it.
3. Freeze the exact diff, deterministic results, proof links, and disclosure
   boundary before independent review. Rebuild downstream proof after any real
   correction.
4. Route one bounded implementation through protected pull-request review.
   Select independent review by actual change risk and ownership; do not create
   a standing panel.
5. Re-read remote PR, CI, review, and tracker state before external transitions.
   Reconcile only ordinary tracker locators after the authoritative event.

## Evidence route

Read `/tests/evidence/README.md`. Retain proof-owner outputs with exact source,
execution, tool, environment, privacy, retention, expiry, exception, and
advisory fields where applicable. Task-local notes and review discussion are
not evidence unless an owner explicitly admits them.

## Boundaries

- Never add a second registry or duplicate canonical enums in prompts or forms.
- Never accept a submitted clearance, dispatch, review-state, readiness,
  merge, tracker-state, release, or completion claim as workflow truth.
- Never weaken an active owner, protected branch rule, or historical evidence
  chain.
- Never let a convenience layer become a second authority source, proof result,
  reviewer assignment, human decision, or tracker fact.
