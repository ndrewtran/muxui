# Decision 0020: Figma token export

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0020-figma-token-export-acceptance.md)

## Decision

Name Figma as the design tool for an in-repo, rerunnable export of canonical
Mux UI tokens to Figma variables, text styles, and effect styles. This pulls
the export-only slice of Roadmap G3.5 ("Additional themes and design-tool
interchange") forward ahead of that milestone's entry conditions.

`@muxui/tokens` owns the transform, its lossy/unsupported report, the Plugin
API applier, and a package-local CLI. Architecture already lists design-tool
transforms under that package, so Architecture does not change. The export
reuses the existing graph resolver, alias resolution, and web compiler CSS
custom-property names; it adds no second token owner.

Export only. Import, round-trip, proposals, components, Code Connect,
additional themes, and pruning of Figma content remain in G3.5 or later and
keep their existing entry conditions. The applier creates and updates
matched items and reports orphans; it never deletes.

Figma content is a projection and never canonical (`SCOPE-NONGOAL-001`).
Canonical token IDs, types, meanings, modes, and aliases stay in
`catalog/tokens/`. No generated export is committed. This adds no public
package, surface, support claim, or release claim; `@muxui/tokens` stays
private.

## Scope and proof

Product Scope advances from `12.0.1` to `12.1.0` because this revises the
admitted design-tool items without changing a committed release. Focused
proof covers deterministic export, lossy-report coverage of every token,
alias preservation, CSS custom-property parity, mode mapping and its limit,
Figma name validity, batch size and ordering, and applier idempotency against
an in-memory Figma API fake.

The original instruction authorized local implementation only. Andrew then
created and supplied one target file, and after being told the next step was
to run the 13 batches into it, said "try now" on 30 September 2026 (see the
acceptance record). That authorized writing Mux UI variables and styles into
that one file, `Z1rFgLTe3lBr0nwm8UvFEx` ("Mux UI Design System"). Writes to
any other Figma file remain separate, explicit actions. None of this accepts
evidence, completes a milestone, opens or merges a pull request, or publishes
a package.

## Removal

Delete the Figma transform, applier, CLI, script entry, and tests from
`@muxui/tokens`, then revert this decision's Roadmap and Product Scope notes.
Any Figma file produced by the export is disposable and holds no canonical
state.
