# Decision 0009 amendment 06: repository delivery skill owner

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0009:amendment:06`
- Parent decision: `core-ui:decision:0009`
- Accepted request: [acceptance record](./0009-amendment-06-repository-delivery-skill-owner-acceptance.md)

Andrew's acceptance records the bounded direction below. Repository adoption
remains subject to the existing protected pull-request process; this record
does not claim implementation, proof, review, or merge.

## Decision

`.agents/skills/muxui-delivery/` is the single repository-scoped owner of Mux
UI delivery guidance. It absorbs the Mux UI-specific content of the former
user-level `muxui-delivery-guard` skill: the authority order and state domains,
Delivery Project reading and synchronization rules, work classification and
deviation stops, proportional proof, review lenses, and Mux UI CI delivery
rules. The skill stands alone and depends on no user-level skill. Each
client's global rules still govern generic behaviour such as read-only
questions, worktrees, pull-request monitoring, and CI budgets.

The user-level `muxui-delivery-guard` skill is retired. It stops being a
source of Mux UI delivery guidance once this amendment's pull request merges.

`SKILL.md` stays the entry point. Detailed guidance lives under the skill's
`references/` directory, and `SKILL.md` names when to read each file.
`agents/openai.yaml` remains non-authoritative interface metadata.

## Role guidance

The skill's role rules are:

1. Root remains accountable for delivery planning, architecture, difficult
   reasoning, escalated blocker resolution, delegation, and final synthesis or
   decisions.
2. Only root delegates; amendment 05 states the delegation rule.
3. `coder` is the normal bounded end-to-end implementation lane, with explicit
   file ownership, routine repository research, debugging, and testing, and no
   external mutations or architecture decisions.
4. `researcher` is optional and read-only.
5. `reviewer` is read-only and selected by the actual risk of the change, as
   Decision 0011's ordinary delivery contract describes.
6. `browser_debugger` is optional, advisory, and does not edit application code
   or local files.

These are operator-guidance semantics only. They create no authority source,
workflow registry, reviewer decision, dispatch, clearance, evidence,
readiness, tracker state, capability, public surface, support claim,
package/version behavior, release boundary, or external mutation.

Where amendment 05 refers to the delivery stops, they live in the repository
skill. Decision 0028 narrows that stop list to publishing, dist-tags,
production, writes to outside services, waived proof, activation of a new
package, platform, or renderer, and stable, support, or assistive-technology
claims.

## Protection

The delivery skill is reviewed like any other pull request. No file under
`.agents/skills/muxui-delivery/` is a protected planning-control path, and a
change to the skill needs no authority label or change record.

The planning-policy validator, `.github/scripts/validate-planning-pr.cjs`, owns
the protected-file list. It protects the strategy documents and the platform
safety contract, the validator with its test and the workflow and CODEOWNERS
entry that enforce it, and the publishing workflow with its registry preflight
module. Issue forms, the pull-request template, READMEs, route maps, and the
repository-policy package manifest are ordinary files. A change to a protected file needs the
`type:decision` or `type:architecture-maintenance` label and an `Authority
change record` that is an issue number or a decision path. Product Scope also
states its version effect, and its change packet when that effect is not
`none`.

## Unchanged

This amendment changes no Architecture, Roadmap entry or exit rule, Product
Scope ID or commitment, milestone state, evidence record, public package,
platform, support claim, lifecycle, or release boundary. Amendment 05's
vendor-neutral wording rule and `.claude/skills` discovery link, and Decision
0011's protected pull-request route, remain in force.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 10 October 2026 (the protection narrowed above); the original amendment was accepted on 28 September 2026 in the acceptance record linked at the top

Andrew's direction, in his words:

> I want to loosen the authorities and decisions surrounding hard-lists and blockers for development work as Mux UI is under development. Decisions such as a definitive component list that can use Lucide icons for example has no place in Mux UI as Lucide is the default iconography provider/substrate for all Mux UI components. Find other examples of authority and decision gates that are similar in their restrictive nature that ought to be loosened/removed.

> Go ahead with batch 0 plus batches 1 to 5.

This record does not claim that any check passed, that a pull request was
opened or merged, or that the repository has adopted the narrowed protection.
