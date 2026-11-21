# Sidebar usage

Use Sidebar for persistent navigation beside the main content, with a separate header and drawer for narrow layouts. Provide an accessible name for the column.

## Sidebar or HeaderNav

- Use Sidebar for many destinations, grouped pages, or navigation that stays beside the content.
- Use [HeaderNav](/components/header-nav/) for a few top-level destinations in a header.
- Use [Tree](/components/tree/) to browse items in a data hierarchy, such as files, not to move between pages.

## Flat links or a group

- Keep the destinations people use most as flat links, so they stay visible.
- Group related secondary pages under one label, one level deep, such as Now, Next, and Later under Roadmap.
- A group starts closed, so open the one that holds the current page with `defaultExpanded` and mark that page `current`.

This is a teaching preference, not a limit. Sidebar supports groups of any depth, and a link beside its own group toggle. The Sidebar flat links or a group example shows the same destinations both ways.

## Row actions and breaks

- Give a row an action of its own, such as Pin or a menu of options, with `action`. It sits after the link as a separate control and tab stop, so it works without hover. Name it for its row, such as Pin Atlas.
- Folded, the action keeps its tab stop and shows over its row while it has keyboard focus. Pointer users reach it in the open sidebar.
- Break a long group of rows, such as pinned rows from the rest, with NavDivider inside the list. It is decorative, so use a Section when the groups need names. The Sidebar row actions example shows both.

## Collapsible sections

- Make a Section's heading fold its rows with `collapsible`. A collapsible section starts open, and closing it moves focus on a hidden row to the heading.
- The heading is a button that Enter and Space operate. Its rows show and hide at once, with no motion, and render open or closed on the server as their state says.
- A folded rail has no room for headings, so it shows every section's rows and hides the heading buttons.
- Nested entries take an `icon`, drawn smaller than a top-level one. The Sidebar collapsible sections example shows both.

## Landmark and foot

- Give the navigation list a `navLabel` to wrap it in a named navigation landmark, distinct from header and phone navigation. Root alone is not one.
- Put actions that must stay in view, such as Help, in a Footer after the list. It stays at the column's foot while the list scrolls, open and folded, and sticks to the bottom of the window when the column runs past it. The Sidebar pinned footer example shows it.

## Widths and colours

- A layout beside a folding sidebar can read its widths from `--muxui-component-sidebar-open-size` and `--muxui-component-sidebar-rail-size`, instead of restating them. Add the 1px edge unless the border is hidden.
- Set `--muxui-component-sidebar-background` and `--muxui-component-sidebar-border-color` on Root to give one sidebar the page's ground and edge, in light and dark. The Sidebar beside a layout example uses all four.

## Column and drawer

Sidebar has no breakpoint of its own. The column and the header that opens the drawer are separate parts, and both show at every width until the application hides one. Wrap the drawer part in an element so the application has something to hide. The Responsive Sidebar example swaps them by the width of their container.

The drawer shows the navigation it is given and does not copy the column's. Pass the same navigation to both and mark the current page in each copy. Inside a provider, widening the layout while the drawer is open closes it and moves focus to the matching link in the column.

## Height and scrolling

The column fills the height of its container, so place it in one that has a height. Its navigation list scrolls when it is taller than the column, and the drawer, which is as tall as the viewport, scrolls its navigation the same way.

## Account card and menu

- AccountCard shows a name, an email, and an avatar.
- Put one AccountMenu inside the card for the account's own actions, such as Profile and Sign out. The card's Account options button opens it, and Escape closes it and returns focus to the button. A card without an AccountMenu has no button.
- Build the menu from [Menu](/components/menu/) items, and keep it to actions about the account. Navigation belongs in the column.

## Content

- Label each destination with a short noun, such as Inbox.
- Give each top-level item an icon. Without one, a folded rail shows only the first character of the item's label.
- Folded, header content is clipped to the rail, so give the header a compact leading mark that fits in it.

## Common mistake

Marking the current page in only one copy of the navigation. The drawer does not copy the column's navigation, so mark the current item in both.
