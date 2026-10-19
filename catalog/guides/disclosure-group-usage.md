# DisclosureGroup usage

Use DisclosureGroup for managing a set of related disclosures. Keep its Mux UI-owned props and accessible name semantics intact.

## Identity and state

Give each Disclosure in the group an id that stays the same when the group re-renders or its children reorder. The group's expanded ids refer to those ids, and the group owns expansion: while a Disclosure is inside a group, its own expanded setting is ignored. Start with panels open through the group's default expanded ids, or control them with its expanded ids and change callback, which receives an array of strings rather than a set. With multiple turned off, at most one Disclosure is expanded. The Controlled DisclosureGroup example keeps the expanded ids in state.

## Composition

Put Disclosure elements directly inside DisclosureGroup. The grouped appearance is styled on direct children, so a Disclosure wrapped in another element stays in the group but renders without it. A fragment adds no element, so it does not change that.
