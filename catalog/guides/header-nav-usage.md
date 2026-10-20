# HeaderNav usage

Use HeaderNav for a header with a logo, navigation links, actions, and a trigger that opens a navigation drawer. Provide an accessible name for the navigation.

## HeaderNav or Sidebar

- Use HeaderNav for a few top-level destinations that fit in a header.
- Use [Sidebar](/components/sidebar/) for many destinations, grouped pages, or navigation that stays beside the content.
- Use [Breadcrumbs](/components/breadcrumbs/) to show where the current page sits in a hierarchy.

## Narrow and wide layouts

HeaderNav has no breakpoint of its own. It shows its links, actions, and drawer trigger at every width, so the application decides when each applies and hides the one that does not. The drawer shows the children it is given and does not copy the header links, so pass the same links to both and mark the current page on each copy. The trigger takes only children, so wrap it in an element the application can hide. The Responsive HeaderNav example swaps the links for the trigger by the width of their container.

## What the drawer holds

- Repeat the header's destinations in the drawer, in the same order.
- Add the essential actions that no longer fit in the header, such as Sign in, below the destinations.
- Give each copy of an action the same handler, as the links share one list, so the header and the drawer do the same thing.
- Leave out anything the header does not need, or put it after those actions so it reads as secondary.

The Responsive HeaderNav example moves the links and a Sign in action into the drawer below a container width. The links go to their routes, and both Sign in Buttons call one sign-in function.

## Labels

The drawer's open button, dialog, and close button use fixed English labels, and HeaderNav has no props to change them.

## Content

- Name each destination with a short noun, such as Docs or Components.
- Keep the logo to a short name or mark.

## Common mistake

Hiding the header's actions at a narrow width without putting them in the drawer. The action is then out of reach, so give the drawer a copy of each essential action, as it has of the links.
