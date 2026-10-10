# Decision 0009 amendment 06: repository delivery skill owner

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0009:amendment:06`
- Parent decision: `core-ui:decision:0009`
- Amends: `core-ui:decision:0009:amendment:02`, admitted guidance semantics (scope and item 5); `muxui:decision:0009:amendment:05`, the delivery guard reference under "Unchanged"
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

Amendment 02 limited the skill to its six admitted guidance items. The
admitted guidance now also includes the absorbed guard content: the authority
order and state domains, alignment classes and deviation stops, Delivery
Project reconciliation, agent orchestration and review lenses, and Mux UI CI
delivery. None of it creates an authority source, registry, reviewer decision,
evidence, tracker state, public surface, support claim, or release boundary.

Amendment 02's admitted guidance item 5 read: "`reviewer` is read-only and
selected only by the canonical delivery profile's reviewer contract."
Decision 0011 retired that profile. Item 5 now reads: "`reviewer` is read-only
and selected by the actual risk of the change, as Decision 0011's ordinary
delivery contract describes." Items 1 to 4 and 6, as amended by amendment 05,
are unchanged.

Amendment 02's exact successor tuple remains a historical record of the skill
bytes at its materialization commit. This amendment, not that tuple, governs
the current contents of `.agents/skills/muxui-delivery/`.

Where amendment 05 refers to the delivery stops, they live in the repository
skill. Decision 0028 narrows that stop list to publishing, dist-tags,
production, writes to outside services, waived proof, activation of a new
package, platform, or renderer, and stable, support, or assistive-technology
claims.

## Proposed protection

The pull request adopting this amendment also proposes that every file under
`.agents/skills/muxui-delivery/` be a protected planning-control file. The
planning-policy validator would match the directory by prefix, so a change to
any reference needs the same authority label and change record as a change to
`SKILL.md`. This protection is proposed direction; it is adopted only when
Andrew merges that pull request.

## Unchanged

This amendment changes no Architecture, Roadmap entry or exit rule, Product
Scope ID or commitment, milestone state, evidence record, public package,
platform, support claim, lifecycle, or release boundary. Amendment 05's
vendor-neutral wording rule and `.claude/skills` discovery link, and Decision
0011's protected pull-request route, remain in force.

Historical decisions and receipts are not rewritten, including Decision 0011's
reference to the user-level guard.
