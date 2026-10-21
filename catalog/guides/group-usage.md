# Group usage

Use Group to put related controls under one boundary and give them a name. It lays its children out in a row that wraps, and holds no value of its own.

## Group or another grouping

- Use Group for related controls of any kind that share one purpose, such as the actions for one document.
- Use [ButtonGroup](/components/button-group/) for Buttons that need an attached or vertical strip.
- Use [CheckboxGroup](/components/checkbox-group/) or [RadioGroup](/components/radio-group/) for choices that share a selected value.
- Use [Toolbar](/components/toolbar/) when the arrow keys should move between the controls.

## Group state and its controls

Group's disabled, invalid, and read-only props mark the group itself. Group renders a div, not a fieldset. It passes none of these states to the controls inside it, so each control keeps its own disabled, invalid, or read-only prop. Read-only only sets a data attribute on the group root; it does not lock the content. The Disabled Group example marks the group and also disables each Button in it.

## Name and content

- Name the group with `aria-label` for a short label such as Document actions, or `aria-labelledby` to use a heading that is already on the page.
- Use `role="presentation"` when the Group only lays the controls out and needs no name.

## Common mistake

Writing a visible heading above the Group and expecting it to name the group. A nearby heading names nothing by itself, so point `aria-labelledby` at the heading's id or set `aria-label`.
