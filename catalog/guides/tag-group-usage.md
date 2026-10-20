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

## Content

- Label each tag with a short noun or value, such as Design.
- Name the group for what its tags are, such as Applied filters.

## Common mistake

Expecting TagGroup to remove the tag itself. It only reports the removed items, so remove them from the list you pass, and from whatever the tags filter.
