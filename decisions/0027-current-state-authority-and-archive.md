# Decision 0027: Current-state authority and archive

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0027`
- Supersedes: the append-only and "historical records are not rewritten" clauses
  of Decision 0009 amendment 05, Decision 0011, Decision 0015 amendment 01,
  Decision 0016, and Decision 0021, and the same wording where other decisions
  repeat it
- Effective: on merge

## Gap

Strategy documents, decisions, and evidence kept every past version of
themselves. Product Scope narrated each version, the Roadmap kept the bodies of
retired gates, Architecture described supersession machinery for evidence
chains that no longer exist, 21 retired decision stubs sat beside live
decisions, and the evidence of long-closed milestones was verified like current
proof. Decisions also said that history is never rewritten, so apart from
one-off exceptions such as Decision 0021 there was no general convention for
removing any of it.

A reader or an agent then has to separate what is true now from what was true
before, and some past wording reads like a current gate. Git already records
the past.

## Decision

1. **Strategy states current rules only.** Architecture, the Roadmap, and
   Product Scope describe what applies now. Earlier versions, retired
   sequences, and completed events live in git history, not in history
   sections.
2. **Live decisions stay current.** A decision that still states a rule may be
   edited so it says what is true now. Decision numbers are preserved and never
   reused.
3. **Replaced decisions move to an archive.** A decision that is fully
   replaced, applied, or retired moves with `git mv` to `decisions/archive/`,
   together with its acceptance record, in one commit. It gets one line in
   `decisions/archive/README.md` with its number, title, reason, successor, and
   the last commit where its text was live. Archived decisions are history,
   never authority input, and are edited only to repair links.
4. **Retired stubs are deleted.** A retired stub that holds no content is
   removed. Git history is the recovery path.
5. **Closed evidence moves, byte-exact.** Evidence of a closed milestone moves
   unchanged to `tests/evidence/archive/` and is not verified. Evidence that
   current tooling or the published package reads stays where it is and stays
   verified.
6. **New decisions carry their acceptance inline.** A new decision quotes
   Andrew's acceptance in an `## Acceptance` section instead of a separate
   acceptance file. Existing acceptance files stay beside their decisions.
7. **The append-only rule is lifted for decisions.** The clauses that keep
   decisions, acceptance records, and strategy history unrewritten are
   superseded by items 1 to 4. A reversal may now edit a live decision or
   restore an archived one with `git mv`. Published versions and retained
   evidence stay unrewritten.

## Applied in this change

- Product Scope, the Roadmap, and Architecture drop history, retired-gate
  bodies, and supersession passages. Product Scope takes patch version
  `19.0.1`.
- 21 retired stubs are deleted: Decisions 0007 and 0008, the Decision 0009
  base and amendment 03, and Decision 0010 amendments 04 to 09, with their
  acceptance, envelope, and materialization files.
- Eleven decision files move to `decisions/archive/`: Decision 0009 amendments
  01 and 04, Decision 0011 amendment 03, Decision 0012, Decision 0015, and
  Decision 0021, with the acceptance records they have. The two live decisions
  that linked to them, Decision 0011 amendment 06 and Decision 0015 amendment
  01, have only their link paths repaired.
- `decisions/AGENTS.md`, `strategy/AGENTS.md`, and `docs/agents/domain.md` state
  the rules above.
- The Roadmap names `tests/evidence/archive/` for the closed Gate 0 evidence.
  The companion evidence change creates that directory and moves the nine
  closed evidence sets into it.

## Authority effect

Product Scope takes a patch version. No Scope ID is added, removed, or
transitioned, no commitment or release boundary changes, and the deferred
cross-platform Scope IDs stay as one table. The Roadmap keeps every evidence
assertion ID that a Scope row, fixture, or test name uses. Architecture keeps
its rule that historical evidence is not current proof.

Where a live decision and a strategy document state the same rule, the existing
authority order applies: Architecture, then the Roadmap, then Product Scope,
then decisions.

## Non-goals and preserved stops

This decision loosens no gate by itself. Later changes retire or narrow
individual hard lists and blockers under the rules above. It does not edit the
text of Decisions 0009 amendment 05, 0011, 0015 amendment 01, or 0016; where
their wording conflicts with this decision, this decision controls. It creates
no git tag, publishes no package, changes no dist-tag, mutates no Project,
consumer, or production system, and changes no release or merge stop.

## Reversal

A successor decision may restore a history section, a stub, or an archived
decision. Git history holds every earlier version, so no reversal depends on
anything this change removes from the working tree.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026

Andrew's direction, in his words:

> I want to loosen the authorities and decisions surrounding hard-lists and blockers for development work as Mux UI is under development. Decisions such as a definitive component list that can use Lucide icons for example has no place in Mux UI as Lucide is the default iconography provider/substrate for all Mux UI components. Find other examples of authority and decision gates that are similar in their restrictive nature that ought to be loosened/removed.

> In going ahead with all five, is it worth pruning/cleaning up redundant/out-of-use historical artefacts so that the strategy for Mux UI doesn't also include historical records of decisions/proofs that describe the past?

> Go ahead with batch 0 plus batches 1 to 5.

This record does not claim that any check passed, that a pull request was opened
or merged, that the repository has adopted the decision, that any later batch
was done, or that any package, release candidate, or dist-tag changed.
