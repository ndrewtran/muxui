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

## Column and drawer

Sidebar has no breakpoint of its own. The column and the header that opens the drawer are separate parts, and both show at every width until the application hides one. Wrap the drawer part in an element so the application has something to hide. The Responsive Sidebar example swaps them by the width of their container.

The drawer shows the navigation it is given and does not copy the column's. Pass the same navigation to both and mark the current page in each copy. Inside a provider, widening the layout while the drawer is open closes it and moves focus to the matching link in the column.

## Height and scrolling

The column fills the height of its container, so place it in one that has a height. Its navigation list scrolls when it is taller than the column, and the drawer, which is as tall as the viewport, scrolls its navigation the same way.

## Account card and menu

- AccountCard shows a name, an email, and an avatar. Its built-in Account options button currently has no action.
- AccountMenu is independent styled content, and nothing connects it to that button. The application decides where it sits and when it shows.

## Content

- Label each destination with a short noun, such as Inbox.
- Give each top-level item an icon. Without one, a folded rail shows only the first character of the item's label.
- Folded, header content is clipped to the rail, so give the header a compact leading mark that fits in it.

## Common mistake

Marking the current page in only one copy of the navigation. The drawer does not copy the column's navigation, so mark the current item in both.
