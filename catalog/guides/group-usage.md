# Group usage

Use Group for labeling or grouping related controls. Keep its Mux UI-owned props and accessible name semantics intact.

## Group state and its controls

Group's disabled, invalid, and read-only props mark the group itself. Group renders a div, not a fieldset, and does not pass these states to the controls inside it, so each control keeps its own disabled, invalid, or read-only prop. Read-only only sets a data attribute on the group root; it does not lock the content. The Disabled Group example marks the group and also disables each Button in it.
