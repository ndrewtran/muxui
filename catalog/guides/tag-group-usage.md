# TagGroup usage

Use the Mux UI TagGroup contract and provide an accessible name.

## Removing tags

Each tag shows a remove button only when TagGroup is given a removal callback; without one, tags cannot be removed. TagGroup does not change its items. The callback receives the removed items as item records, and the application removes them from the list it passes, which is what takes the tags off the screen. The Removable TagGroup example keeps its tags in state, removes the reported items by id, and shows a message when none are left.
