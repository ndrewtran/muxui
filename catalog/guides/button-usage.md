---
id: muxui:guide:button-usage
---

# Button usage

Use Button for an immediate action. Use a link for navigation.

For React, import `Button` from `@muxui/react` and provide visible content
or an accessible label. Use `pending` while an immediate action is in flight;
pending Buttons remain focusable but do not activate again.

React Buttons support the orthogonal `variant` (`primary`, `secondary`, or
`ghost`), `tone` (`default` or `destructive`), and `size` (`sm`, `md`, or
`lg`) properties. They default to `primary`, `default`, and `md` respectively.
