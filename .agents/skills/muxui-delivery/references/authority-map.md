# Mux UI authority map

Read on first use in a task. Paths are repository-relative.

## Authority order

1. `strategy/monorepo-architecture.md`: what must remain true.
2. `strategy/milestone-roadmap.md`: dependency order, entry and exit
   conditions, deliverables, proof, and scope controls.
3. `strategy/product-scope.md`: candidate, admitted, committed, deferred, and
   rejected outcomes and release boundaries.
4. `decisions/`: accepted choices not already fixed above; read those touching
   the area (`decisions/AGENTS.md`).
5. [Mux UI Delivery Project](https://github.com/users/ndrewtran/projects/1):
   items, owners, priority, status, iterations, blockers, dates, and PR links.

A lower source never amends or reinterprets a higher one. If a strategy file is
missing, duplicated, or referenced from another path, stop before writes and
ask which checkout is authoritative.

## State domains

| Domain | Owner | Values defined in |
| --- | --- | --- |
| Product commitment | Product Scope | Product Scope "Commitment states" |
| Milestone delivery | Roadmap | Roadmap "Status vocabulary" |
| Artifact maturity | Canonical artifact or binding | Architecture "Controlled vocabulary" (Lifecycle) |
| Capability availability | Capability manifest plus passed activation evidence | The manifest's declared schema |
| Work execution | Delivery Project | The live `Status` field options |

Resolve each domain from its own owner. There is no generic "activation state".

## Minimum strategy reads

Read these sections plus every section governing the requested work. Read the
whole document for a change to that document, a new package, kind, relation,
capability, platform, public surface, or release claim, or uncertain ownership.

- Architecture: Executive decision, Controlled vocabulary, Canonical knowledge
  model, R1 ordinary React delivery, Non-negotiable invariants, any later
  Decision section for the affected family, and Lifecycle, versions, and trust
  when compatibility or release is affected.
- Roadmap: Purpose and authority, How to use this roadmap, Execution
  guardrails, Current milestone register, the complete affected milestone, and
  Roadmap completion checklist.
- Product Scope: Purpose and authority, Scope vocabulary, Product boundary,
  each affected Scope ID, Cross-cutting product commitments, Release acceptance
  scope for any release or completeness claim, Product-scope change control,
  and Tracker reference contract.

## Delivery Project

Identity: owner `ndrewtran`, number `1`. Owner and number identify it; the
title, README, fields, views, and workflows are mutable. An unexpected owner,
number, or repository link is a blocking mismatch.

```text
gh project view 1 --owner ndrewtran --format json
gh project field-list 1 --owner ndrewtran --format json
gh project item-list 1 --owner ndrewtran --format json --limit 500
```

Read the README, fields, and enabled workflows before interpreting an item.
Fetch every page when more than 500 items exist. If the Project is
unavailable, mark tracker alignment `unverified`, keep to read-only analysis,
and ask Andrew to restore access; never ask for credentials.

Interpret a field only after confirming it exists and reading its options:

| Field | Means | Never defines |
| --- | --- | --- |
| `Status` | Workflow state | Milestone completion, commitment, lifecycle, availability |
| `Gate`, `Roadmap milestone` | Routing references | Entry proof or completion |
| `Scope ID` | Immutable Scope IDs (may hold several) | Commitment or a new scope item |
| `Evidence IDs`, `Architecture refs` | Authority pointers | Evidence results or amended authority |
| `Work type` | Issue-form contract | Product artifact kind |
| `Workstream`, `Platform`, `Priority`, `Target release`, `Iteration` | Scheduling | Platform support or release acceptance |
| `Blocked by`, linked PRs, assignees, dates | Execution relationships | Roadmap dependencies or proof |
| `Reviewers` | Designated GitHub people | Approval inferred from an agent verdict |

`Pending`, `TBD`, or an empty `Scope ID` is a tracker mismatch once the Scope
IDs exist. Views are filtered projections; use the full item query for
alignment.

`Work type` resolves to `.github/ISSUE_TEMPLATE/<type>.yml` (`milestone`,
`evidence`, `architecture-maintenance`, `implementation`, `decision`, `bug`).
Pull requests use `.github/pull_request_template.md`. A permissive or legacy
form never waives a line of the Product Scope tracker reference contract.

## Task mapping

Map every implementation task to the Product Scope "Tracker reference
contract" lines, then record the live routing fields separately:

```text
Project item, work type, and workflow status (manual | automated | unverified):
Gate / workstream / platform:
Priority / target release / iteration:
Blockers and linked pull requests:
Designated reviewers and human decision state:
```

An implementation slice names one primary milestone. An authority change names
every affected milestone. Before a milestone is ready, map each applicable
cross-cutting Scope ID from Product Scope "Cross-cutting product commitments"
to an explicit Roadmap evidence owner; a Project item cannot supply one.
Missing mapping is a potential deviation.
