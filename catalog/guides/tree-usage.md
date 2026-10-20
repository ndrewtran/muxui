# Tree usage

Use the Mux UI Tree contract and provide an accessible name.

## Tree or other collections

- Use Tree to browse or open items in a nested hierarchy, such as files and folders.
- Use [ListBox](/components/list-box/) for a flat list of options, and [GridList](/components/grid-list/) for flat items to open or select.
- Use [Sidebar](/components/sidebar/) to move between the pages of an app.

## Expanding rows

Choose by what a click on a parent row should do.

| The rows are | Set |
| --- | --- |
| Only for browsing | Keep the default `expansionTrigger="row"`. A click anywhere on a parent row expands or collapses it. |
| Opening a resource | `selectionMode="none"`, `onAction`, and `expansionTrigger="chevron"`. Only the chevron expands, and a click on the row opens. |

Tree defaults to single selection, where a click runs `onAction` only while nothing is selected. After that, a click on a row changes the selection and runs no action, whichever expansion mode is set, so set `selectionMode="none"` for a tree whose rows open. Row expansion still expands or collapses the row on every click, which is why the chevron suits rows that open. In both modes, the Right arrow expands a focused parent row. The Tree that opens items example uses all three settings.

## Item ids

Items nest through a children list. Give every item an id that is unique across the whole tree, not only among its siblings, and keep it stable when the data changes. The selected and expanded lists name items by id, so an id taken from an item's position, or shared between branches, can end up attached to a different item after the items reorder. A disabled item also disables every item inside it. The Controlled Tree example keeps selection and expansion in state and reverses the sibling order, and both stay with the same items.

## Content

- Label each item with its own name, such as Components or README.md, not its path.
- Name a branch for what it holds, such as Components, so people can decide whether to open it.

## Common mistake

Keeping the default row expansion when a click on a row opens it. Every click on a folder then expands or collapses it as well as opening it. Set `expansionTrigger="chevron"` so the chevron expands and the row opens.
