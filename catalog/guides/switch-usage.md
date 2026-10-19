# Switch

Keep labels, descriptions, and validation messages close to the field so their accessible relationships remain intact.

## Naming

A Switch needs a label, an `aria-label`, or an `aria-labelledby`, and it throws a TypeError without one. Children do not count as a name: they render as the visible text only when no label is given, so a Switch written like a Checkbox, with only children, fails. The Switch with children and an aria-label example names the Switch with `aria-label` and uses children for its visible text. The [API reference](#api-reference) lists the props Mux UI defines.
