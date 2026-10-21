# TagGroup usage

Use the Mux UI TagGroup contract and provide an accessible name.

## TagGroup or other tag controls

- Use TagGroup to show tags or the filters currently applied, each removable.
- Use [InputTags](/components/input-tags/) to type free-form tags, and [TagSelect](/components/tag-select/) to choose several predefined values.

## Applied filters

- Removing a tag removes that filter and updates the results at once. Remove the filter from the application's state and derive the results from it.
- Editing several filters and applying them together with an explicit action, such as Apply, is a different workflow in the surrounding screen. TagGroup then shows the filters after they are applied.

The Removable TagGroup example removes a filter and updates the results list in the same step.

## Removing tags

Each tag shows a remove button only when TagGroup is given a removal callback; without one, tags cannot be removed. TagGroup does not change its items. The callback receives the removed items as item records, and the application removes them from the list it passes, which is what takes the tags off the screen. The Removable TagGroup example keeps its filters in state, removes the reported items by id, and shows a message when none are left.

## Colour and variants

- Set `color` on the group for one colour, or on an item to override it. `neutral` is the default, `brand` follows the active theme preset, and `success`, `warning`, and `error` are the status colours. The hue families, from red to rose, never change with the theme.
- `variant` sets the treatment of every tag: `soft` by default, `outline` for an edge, `dot` for a coloured dot beside neutral text, and `strong` for a deeper fill.
- Colour is never the only signal. Say the status in the label, such as Blocked, not only in red.

The Coloured TagGroup example colours a status group and a category group, and compares the four variants.

## Selecting tags

Set `selectionMode` to `single` or `multiple` to make tags selectable. `selectedKeys` and `defaultSelectedKeys` are Sets of item ids, and `onSelectionChange` receives the new Set. A selected tag fills solid in its own colour. With `defaultSelectedKeys`, the group keeps the selection and drops the id of any tag you remove, without calling `onSelectionChange`. If you control selection with `selectedKeys`, remove an item's id from it when you remove the item: TagGroup does not rewrite your state, and a leftover id still counts as selected. Use it for a few filters shown as tags; to choose from a longer list, use [TagSelect](/components/tag-select/).

The Selectable TagGroup example narrows a list by the selected topics.

## Content

- Label each tag with a short noun or value, such as Design.
- Name the group for what its tags are, such as Applied filters.

## Common mistake

Expecting TagGroup to remove the tag itself. It only reports the removed items, so remove them from the list you pass, and from whatever the tags filter.

Giving a selectable group an `onAction` handler and expecting every press to select. While nothing is selected, a press runs the action; once any tag is selected, a press toggles selection and the action does not run. Space selects either way. Use one or the other unless you want that hand-off.
