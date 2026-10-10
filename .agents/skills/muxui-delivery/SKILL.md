---
name: muxui-delivery
description: Keep Mux UI work aligned with its Architecture, Roadmap, Product Scope, canonical owners, live Delivery Project, focused proof, protected pull requests, risk-based review, and release stops. Use automatically for every Mux UI planning, implementation, evidence, PR, merge, tracker, or release-adjacent task.
---

# Mux UI Delivery

This skill is the single repository-scoped owner of Mux UI delivery guidance.
It adds Mux UI specifics to the client's own global rules, which still govern
read-only questions, worktrees, PR creation and monitoring, CI budgets, and
approval scope. It routes work to canonical owners and owns no commands,
mutable state, reviewer decisions, or GitHub and Project writes. The root agent
stays accountable for decomposition, difficult reasoning, escalation,
delegation, and final decisions.

## References

| Read | When |
| --- | --- |
| [authority-map.md](references/authority-map.md) | First use in a task: authority order, state domains, minimum strategy reads, Project fields, task mapping. |
| [alignment-workflow.md](references/alignment-workflow.md) | Classifying work, preflight, asking about a potential deviation, reconciling the Project, claiming completion. |
| [agent-orchestration.md](references/agent-orchestration.md) | Delegating, choosing review lenses and phases, handling reviewer output. |
| [ci-delivery.md](references/ci-delivery.md) | Before a push, when CI fails, or when a change touches tokens, generators, shared styles, or authority files. |

## 1. Resolve authority

1. Resolve the repository root, exact source revision, and a clean working
   boundary. Read root `AGENTS.md`, then the nearest `AGENTS.md` for each
   affected owner.
2. Apply the authority order: Architecture, then Roadmap, then Product Scope,
   then accepted decisions; the
   [Mux UI Delivery Project](https://github.com/users/ndrewtran/projects/1)
   holds only mutable execution state. Use accepted, merged sources only; a
   draft, open PR, issue body, or Project field never supersedes them. Verify
   any submitted review, readiness, merge, tracker, release, or completion
   claim against its owner before relying on it.
3. Read the Roadmap milestone, affected Scope IDs, canonical owners, release
   boundary, and non-goals for the requested outcome. Read the live Project
   item when the task changes or depends on delivery status.

Done when: the task maps to a primary milestone, Scope IDs, owners, and (if
relevant) a Project item, with product commitment, milestone status, artifact
lifecycle, capability availability, Project status, and evidence kept separate.

## 2. Classify

Classify as aligned implementation, candidate discovery, required correction,
adjacent improvement, new package, platform, renderer, or ontology, claim before
its gate, rejected scope, non-waivable conflict, tracker mismatch, or unverified
(definitions and dispositions in `alignment-workflow.md`). Any class whose
disposition is Stop goes to step 4. Report a compact route: owner, milestone
relationship, required checks, review lenses, and the next protected-PR action.

Done when: the class is stated before any write.

## 3. Deliver the aligned route

Experimental React work is ordinary delivery: a new component or family, prop,
example, token, or dependency needs no decision (Decisions 0011 and 0028).
Milestones gate public claims and enablement, not work.

1. Delegate through the named roles below.
2. Change the earliest canonical owner and regenerate projections.
3. Run focused type, unit, render, CSS, accessibility, generation, and
   packed-consumer checks proportional to the exported behavior.
4. Freeze the exact diff and deterministic results before independent review;
   rebuild downstream proof after any real correction.
5. Deliver through a topic branch and a protected, non-draft pull request with
   current CI and review-bot coverage (`ci-delivery.md`), and merge only under
   Andrew's stated disposition.

Done when: the pull request's current head has green CI and review-bot
coverage, and it is merged or held as that disposition directs.

Ordinary work needs no delivery-profile packet, review-packet digest,
`ChangeIntentEnvelope`, operation descriptor, per-component acceptance, or
separate approval for routine Git, intermediate protected merges, or routine
Project event synchronization. An exact requirement in accepted authority
still applies; apply it without inventing a parallel mechanism.

Named roles (only root delegates; every delegation starts fresh, without
inherited conversation turns, with only minimum task-local context; subagents
never spawn or delegate):

- `coder`: owns one complete bounded execution: research, implementation,
  routine debugging, focused checks, and verification.
- `researcher`: optional, bounded, read-only authority or repository research.
- `reviewer`: independent read-only inspection of the frozen actual diff when
  risk calls for it; the diff stays frozen while it runs.
- `browser_debugger`: optional advisory browser reproduction; it edits nothing
  and does not replace deterministic proof.

## 4. Stop

Stop before the affected write and ask Andrew, using the format in
`alignment-workflow.md`, only when work would (Decision 0028):

- publish, change a dist-tag, deprecate or unpublish, merge the final R1-exit
  pull request, deploy, or touch production or a consumer project;
- write to an outside service: a Figma file, a registry, or tracker state beyond
  routine event synchronization;
- waive required proof (accessibility, licence, or evidence integrity);
- activate a new package, platform, or renderer;
- make a stable, support, or assistive-technology claim;
- change a Product Scope commitment, release boundary, or non-goal, an
  Architecture invariant, or a Roadmap exit rule; or
- cross another stop recorded in accepted authority.

These are not stops:

- an unreachable tracker: record "tracker sync pending" and continue;
- a wide CI plan or a style-ownership failure: report it and run the checks;
- a new capability or component inside React, or a dependency added or upgraded.

A break of a non-waivable rule, such as patching generated output or adding a
second canonical owner, is never an option to ask about: realign the work.
Solve delivery-process problems within existing owners; a new policy or
verifier system is a product decision for Andrew.

## 5. Prove and review

- Static components: deterministic type, render, CSS, accessibility,
  generation, and packed-consumer checks.
- Interactive components: add keyboard, focus, state, form, and browser checks.
- Collection, composite, overlay, temporal, announcement, destructive,
  security, privacy, and release work: add the independent manual or
  assistive-technology review its risk names.
- Reuse unchanged shared proof while its owner and inputs are unchanged.
- A failed required check cannot be waived by a reviewer, and a reviewer
  finding cannot be waived by a passing test.

Routine rebases, regenerated projections, test corrections, and verified
review findings create no new human decision while product meaning and the
authorized boundary stay unchanged; rerun affected checks and review the
current head. For evidence, follow `tests/evidence/README.md`; task notes and
review discussion are not evidence unless an owner admits them.

Done when: every check the risk requires has passed on the frozen diff, and
every triggered review has no unresolved finding.

## 6. Report completion

Report the outcome first, then: canonical files and owners changed; checks,
negative paths, and review outcomes; milestone, Scope IDs, and Project
item/status; external mutations actually performed; unavailable release or
support claims; and any human choice still ahead.

Done when: every item above is stated, and `complete` is used only for a
milestone whose Roadmap exit is satisfied; otherwise name the exact remaining
deliverable.
