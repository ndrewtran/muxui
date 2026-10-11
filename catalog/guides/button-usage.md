---
id: muxui:guide:button-usage
---

# Button usage

Use Button for an immediate action. Use a link for navigation.

For React, import `Button` from `@muxui/react` and provide visible content
or an accessible label. Use `pending` while an immediate action is in flight;
pending Buttons remain focusable but do not activate again.

React Buttons support the finite `variant` values `primary`, `neutral`, `ghost`,
`danger`, `danger-neutral`, `danger-ghost`, and `inverse`, along with the `size`
values `sm`, `md`, and `lg`. They default to `primary` and `md`. Express a
destructive action with one of the `danger` variants; there is no separate
`tone` property.
