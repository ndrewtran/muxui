# ButtonGroup usage

Use ButtonGroup to keep related actions together as one group. It lays its children out in a row or a column, and `attached` joins them into one strip.

## Attached or spaced

Choose by how the actions relate, not by how they should look.

- Attach only tightly related peer actions on the same object, such as Copy, Share, and Export for one document, or Move up and Move down for one item.
- Space actions that differ in prominence or consequence, such as Save beside Cancel, or Save beside Delete. Joined actions read as one control, so a main action or a destructive one does not belong in the strip.
- Give attached Buttons the same variant, usually `neutral`, so that no one reads as the main action.
- `attached` joins only direct Button, IconButton, and ToggleButton children. A Button inside a wrapping element keeps its own rounded corners.

The Attached ButtonGroup example joins peers in a row and in a column. The Basic React ButtonGroup example spaces a main action from a lower-emphasis one.

## Orientation, name, and state

- `horizontal` is the default. Use `vertical` for related actions that stack in a narrow column.
- Name the group with `aria-label` or `aria-labelledby` when it is a distinct set, such as Document actions. A group with no name is only layout.
- `disabled` on the group only marks the group. Set `disabled` on each Button, as the Attached example does for Export.

## Content

- Write each label as in [Button](/components/button/): the verb for the result, in a short phrase that reads on its own.
- Keep the labels of an attached strip short, because the buttons share one row.
- For icon-only children, use [IconButton](/components/icon-button/) and name each one.

## Common mistake

Attaching actions that differ in prominence or consequence, such as Save, Cancel, and Delete in one strip. Joined buttons look like one control, so the main and the destructive action lose their emphasis. Keep the strip for peers and space the rest apart.
