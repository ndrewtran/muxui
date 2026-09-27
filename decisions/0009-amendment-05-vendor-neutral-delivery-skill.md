# Decision 0009 amendment 05: vendor-neutral delivery skill

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0009:amendment:05`
- Parent decision: `core-ui:decision:0009`
- Amends: `core-ui:decision:0009:amendment:02`, admitted guidance semantics item 2
- Accepted request: [acceptance record](./0009-amendment-05-vendor-neutral-delivery-skill-acceptance.md)

Andrew's acceptance records the bounded direction below. Repository adoption
remains subject to the existing protected pull-request process; this record
does not claim implementation, proof, review, or merge.

## Decision

The repository delivery skill is operator guidance for every agent client that
works in Mux UI. Its text names roles, context rules, and outcomes. It does not
name a vendor, model, spawn parameter, or client-specific syntax.

Amendment 02's admitted guidance item 2 read: "Only root delegates; every
delegation uses `fork_turns="none"` and the minimum task-local context." It now
reads: "Only root delegates; every delegation starts fresh, without inherited
conversation turns, and receives only the minimum task-local context." Each
client's own configuration outside this repository maps that rule to its
mechanism and selects role models and effort. Items 1 and 3 to 6 are unchanged.

`.agents/skills/muxui-delivery/` remains the skill's single canonical location.
A tracked relative symbolic link, `.claude/skills` to `../.agents/skills`, lets
clients that discover skills under `.claude/skills` read the same bytes. The
link is a discovery path, not a second copy, owner, or registry. Only
`.claude/skills` is tracked under `.claude/`; local client state stays ignored.
Repository policy classifies `.claude/` wherever it classifies `.agents/`.

`agents/openai.yaml` remains non-authoritative interface metadata for one
client. Its default prompt mirrors the vendor-neutral routing text and owns no
delivery semantics. The root `AGENTS.md` remains the instruction entry point
for every client; no client-specific instruction file is added.

## Unchanged

This amendment changes no Architecture, Roadmap entry or exit rule, Product
Scope ID or commitment, milestone state, evidence record, public package,
platform, support claim, lifecycle, or release boundary. Decision 0011's
protected pull-request route and the delivery guard's stops remain in force.

Historical decisions and receipts are not rewritten. Amendment 02's exact
successor tuple still describes the skill bytes at its materialization commit,
and the verifier that audits those historical bytes is unchanged.
