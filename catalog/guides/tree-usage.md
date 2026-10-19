# Tree usage

Use the Mux UI Tree contract and provide an accessible name.

## Item ids

Items nest through a children list. Give every item an id that is unique across the whole tree, not only among its siblings, and keep it stable when the data changes. The selected and expanded lists name items by id, so an id taken from an item's position, or shared between branches, can end up attached to a different item after the items reorder. A disabled item also disables every item inside it. The Controlled Tree example keeps selection and expansion in state and reverses the sibling order, and both stay with the same items.
