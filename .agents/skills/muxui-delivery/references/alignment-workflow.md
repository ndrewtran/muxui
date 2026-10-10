# Mux UI alignment workflow

Read when classifying work, running preflight, raising a potential deviation,
reconciling the Delivery Project, or claiming completion.

## Classes

| Class | Meaning | Disposition |
| --- | --- | --- |
| Aligned implementation | Fits a Scope ID or the experimental React umbrella, its owners, and the standing development rule (Decision 0028). | Proceed. `committed` is built for its named boundary; `admitted` gets only the bounded work its milestone authorizes and stays unavailable until activation evidence passes. A new component, family, prop, example, token, or dependency inside React is aligned. |
| Candidate discovery | Tests demand or prepares admission for a `candidate`. | Keep read-only or explicitly experimental; never a dependency or advertised surface. |
| Required correction | Needed to satisfy an existing milestone assertion. | Keep in the milestone and cite the assertion. |
| Adjacent improvement | Useful but not needed for the exit condition. | Do it in its own pull request or track it separately. |
| New package, platform, renderer, or ontology | A new package, framework-free or native renderer, RSC support, artifact kind, relation, or revision axis. | Stop; needs a decision, and a Product Scope change when it is a commitment. |
| Claim before its gate | A stable, support, or assistive-technology claim, or enabling a capability before its entry condition and evidence pass. | Stop. Development itself is ordinary; the claim or enablement waits. |
| Rejected scope | Conflicts with a product boundary or rejected outcome. | Stop until an accepted Product Scope amendment exists. |
| Non-waivable conflict | Breaks a Roadmap "Non-waivable rules" item or an Architecture invariant. | Realign, amend, narrow support honestly, defer, or stop. |
| Tracker mismatch | Missing Project item or reference contract, or the Project contradicts the documents. | Documents win. Record "tracker sync pending" and continue; ask before changing tracker state beyond routine event synchronization. |
| Unverified | Repository authority cannot be established, or live Project state cannot be read. | Unverified authority: read-only analysis; ask which checkout is authoritative. Unreadable Project: record "tracker sync pending" and continue. |

## Preflight

Answer before writing. Any unknown that could change authority, support, or
completion is a potential deviation. An unknown tracker state is not one.

- Are the repository and source revision exact?
- Does the task map to its owner, any affected Scope ID, and one primary
  milestone where it advances one?
- Is each commitment state handled exactly (committed, admitted, candidate,
  deferred, rejected)?
- Are enabling, claiming, and completing handled separately from developing?
  Entry conditions gate enablement and claims, not work.
- Is an automated Project transition kept separate from milestone status,
  commitment, lifecycle, availability, and release proof?
- Does enabling-system work name the renderer slice or fixture it unblocks?
- Are canonical owners and generated projections distinct?
- Are platforms, profiles, lifecycle, evidence IDs, negative paths, acceptance
  commands, disclosure, and retention known where the change affects them?
- Are later capabilities absent or explicitly unavailable?

## Potential deviation format

Ask before a write that SKILL.md section 4 lists as a stop:

```text
Potential deviation: <decision or ambiguity>

Conflicts with or lacks:
- Architecture: <section or invariant>
- Roadmap: <milestone, dependency, evidence ID, or scope control>
- Product Scope: <Scope ID, commitment, boundary, or non-goal>
- Delivery Project: <item or field conflict, or unverified state>

Consequence: <what becomes unproved, out of sequence, unsupported, or a
second source of truth>

Options:
1. revise the task to stay aligned;
2. prepare the authority change and Project reconciliation first; or
3. defer or stop.
```

For option 2, name the exact authority files and follow Product Scope
"Product-scope change control". Implement the committed change only after the
amended chain is accepted.

## Project reconciliation

1. Read the Project README, fields, views, enabled workflows, and item values
   when the task changes tracker state or makes a status or completion claim.
   If the Project cannot be read, record "tracker sync pending" and continue.
   Check that the README links the three current strategy documents without
   stale readiness claims.
2. Validate the tracker reference lines the change touches. Map real Scope IDs
   from Product Scope; never fill a value by inference.
3. Record the item's workflow status source as `manual`, `automated`, or
   `unverified`. When an API omits a workflow's trigger and it matters, inspect
   it read-only in a signed-in browser or mark it `unverified`.
4. Compare the Project value with retained Roadmap proof without translating
   one into the other. A Project `complete` beside a Roadmap `active` is a
   reported discrepancy, not completion.
5. Split corrections into routine event synchronization and decision-bearing
   changes:
   - Routine: after an explicit issue close or reopen, or a PR merge, mirror
     the event on the already-mapped item when the live workflow gives one
     unambiguous status mapping, and link the exact PR when missing. Also
     routine: a workflow status the Roadmap already proves, such as moving a
     ready milestone to `active` when its first implementation PR opens. Apply
     these at preflight and closure without asking, re-read the item, and
     treat an already-correct value as success.
   - Decision-bearing: priority, iteration, target release, dates, blockers,
     assignees, reviewers, scope, authority or evidence references,
     exceptions, and any ambiguous status. Apply only Andrew's exact recorded
     decision; never overwrite a conflicting recorded decision.

Closing an issue, merging a PR, moving a card, or a Project automation is never
completion evidence and never sets commitment, lifecycle, availability, or
release state.

## Routing examples

- Implementing a committed family: aligned.
- Adding an experimental React family, prop, example, or token: aligned; no
  decision (Decision 0028).
- Editing generated Storybook or catalog output to fix a wrong prop:
  non-waivable projection conflict; fix the canonical owner or generator.
- Adding RSC, framework-free web, React Native, or cross-renderer work:
  later or separately admitted track; stop and ask before activating it.
- Running an allowlisted canonical proposal before its capability is enabled:
  unavailable later capability.
- A useful refactor the active milestone does not need: adjacent improvement.
- A linked PR or issue close moves a milestone item to `active` or `complete`
  without its proof: tracker mismatch; leave the Roadmap state unchanged.

## Completion checklist

- Re-read the milestone exit condition and each required evidence ID; re-read
  Product Scope "Release acceptance scope" before any release, scope
  satisfaction, or completeness claim.
- Named acceptance commands and negative-path fixtures pass.
- Generation identity and surface parity hold where affected; packed artifacts
  are verified when required.
- Platform, profile, and risk-proportionate accessibility proof exist.
- Active exceptions only narrow support, are visible, and are unexpired.
- No later or disabled capability is advertised.
- Reviewer output is treated as advisory (`agent-orchestration.md`), and
  read-only reviewers made no workspace or external change.
- Project routine synchronization is applied and verified; decision-bearing
  changes are recorded as applied from Andrew's decision or still pending.
- Remaining unproved assertions are listed.

Use Roadmap status words only for milestones. A Scope ID keeps its commitment
state; report whether its named boundary is satisfied or unproved.
