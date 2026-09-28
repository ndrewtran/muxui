# Mux UI agent orchestration

Read when delegating, choosing review lenses or phases, or handling reviewer
output. Role definitions live in `SKILL.md`; each client's own configuration
selects models and effort.

## Root responsibilities

Root resolves the authority chain and owners, reads the live Project, emits
the preflight and classification, selects the smallest aligned slice,
evaluates the coder's deterministic results, dispatches only risk-triggered
review, resolves findings without widening scope, performs routine Project
synchronization, and reports evidence, unknowns, and pending human decisions.
Root implements only on an escalated path; reviewers never implement.

A subagent finding informs root's decision. It never replaces authority,
deterministic proof, retained evidence, or Andrew's decision.

## Review selection

Routine work that is aligned, low risk, and covered by named deterministic
checks needs no reviewer. Dispatch an independent `reviewer` when authority,
security or privacy, accessibility evidence, compatibility, high-risk renderer
behavior, or release integrity warrants it, and give it the lenses below that
match the risk.

The Roadmap requires the evidence reviewer to be independent of the producing
automation for manual accessibility, security, release integrity, and
operational-exception approval. If independence is unavailable there, the
review is `blocked`.

## Review phases

- Pre-write decision review: when the decision itself could change scope,
  ownership, sequencing, public API, platform behavior, or ontology, review the
  proposed decision or bounded diff before writing. Rerun it if the final diff
  changes that decision.
- Post-proof review: after the final diff is frozen and the named checks and
  negative paths have results, review that exact diff and those results.

Any change to the reviewed authority, diff, evidence, or disclosure scope
invalidates the result.

## Dispatch

1. Finish the authority and Project preflight first.
2. Give the reviewer the request, bounded change, commit and diff identity,
   exact authority sections, milestone, Scope IDs, evidence IDs, non-goals,
   each deterministic command with its exit state and output reference, the
   lenses to apply, and the designated human owner.
3. Supply the facts, not the producer's verdict or a request to confirm it.
4. Run reviewers in parallel only when their scopes are independent.
5. After the result, verify its citations and that the reviewer changed no
   workspace, Project, issue, PR, or other external state.
6. Resolve conflicting findings against the authority order; never
   majority-vote. Escalate unresolved high-risk conflicts to Andrew.

Never use review to stand in for missing deterministic proof.

## Disclosure

Send the minimum sanitized content. Keep consumer code, prompts, screens,
traces, credentials, personal or device identifiers, access-bearing URLs, and
absolute machine paths out of packets unless the scope, consent, redaction,
and retention required by `SCOPE-TRUST-EVIDENCE-PRIVACY` exist. Fresh context
does not authorize a new audience. If the permitted packet cannot support the
review, mark it `blocked` instead of expanding disclosure.

## Review lenses

- Authority and product scope: authority order, owners, milestone
  dependencies, commitments, activation conditions, release boundaries,
  non-goals; detect new outcomes, support claims, packages, commands,
  ontology, later-gate work, or undocumented exceptions, and name the exact
  amendment needed.
- Renderer and platform: renderer-first sequencing, binding versus renderer
  ownership, public API and observable behavior, platform and profile
  dispositions, and per-profile accessibility evidence without assumed
  cross-platform equivalence.
- Schema, catalog, and ontology: one owner per fact, identities, revisions,
  relations, compiler and query behavior, generators, and projections; reject
  duplicate owners, projection edits, and unowned schema growth.
- Proof, accessibility, security, and privacy: deterministic checks precede
  model evaluation, exact evidence identity and environment, negative paths,
  disclosure and retention, and assertion mapping.
- Release integrity: packed artifacts, package, catalog, token, and profile
  identity, compatibility, generation identity, provenance, rollback, and
  disable paths. A merged PR or Project status never implies release
  readiness.

## Reviewer output

Reviewer output is advisory. It returns `clear`, `findings`, `blocked`, or
`unverified`, with findings that cite the violated reference, consequence, and
required correction. `clear` means nothing was found within the stated scope;
it is not approval, completion, or proof. Agent output becomes evidence only
through the Architecture evidence identity, disclosure, retention, and index
contracts, and the human decision stays a separate record.

Keep advisory output out of Project, issue, PR, and check surfaces beyond
platform logs. Record only designated GitHub people in `Reviewers`, never an
agent role name.
