# Decision 0009 amendment 06: repository delivery skill owner

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0009:amendment:06`
- Parent decision: `core-ui:decision:0009`
- Amends: `core-ui:decision:0009:amendment:02`, exact successor tuple; `muxui:decision:0009:amendment:05`, the delivery guard reference under "Unchanged"
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
Amendment 02's exact successor tuple admitted only `SKILL.md` and
`agents/openai.yaml`; the skill directory's admitted contents now also include
`references/`. `agents/openai.yaml` remains non-authoritative interface
metadata.

Every file under `.agents/skills/muxui-delivery/` is a protected
planning-control file. The planning-policy validator matches the directory by
prefix, so a change to any reference needs the same authority label and change
record as a change to `SKILL.md`.

Where amendment 05 says "the delivery guard's stops remain in force", those
stops now live in the repository skill.

## Unchanged

This amendment changes no Architecture, Roadmap entry or exit rule, Product
Scope ID or commitment, milestone state, evidence record, public package,
platform, support claim, lifecycle, or release boundary. Amendment 02's
admitted guidance semantics as amended by amendment 05, the vendor-neutral
wording rule, the `.claude/skills` discovery link, and Decision 0011's
protected pull-request route remain in force.

Historical decisions and receipts are not rewritten, including Decision 0011's
reference to the user-level guard.
