# HeaderNav usage

Use HeaderNav for a header with a logo, navigation links, actions, and a trigger that opens a navigation drawer. Provide an accessible name for the navigation.

## Narrow and wide layouts

HeaderNav has no breakpoint of its own. It shows its links, actions, and drawer trigger at every width, so the application decides when each applies and hides the one that does not. The drawer shows the children it is given and does not copy the header links, so pass the same links to both and mark the current page on each copy. The trigger takes only children, so wrap it in an element the application can hide. The Responsive HeaderNav example swaps the links for the trigger by the width of their container.

## Labels

The drawer's open button, dialog, and close button use fixed English labels, and HeaderNav has no props to change them.
