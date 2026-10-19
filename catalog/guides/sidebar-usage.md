# Sidebar usage

Use Sidebar for persistent navigation beside the main content, with a separate header and drawer for narrow layouts. Provide an accessible name for the column.

## Column and drawer

Sidebar has no breakpoint of its own. The column and the header that opens the drawer are separate parts, and both show at every width until the application hides one. Wrap the drawer part in an element so the application has something to hide. The Responsive Sidebar example swaps them by the width of their container.

The drawer shows the navigation it is given and does not copy the column's. Pass the same navigation to both and mark the current page in each copy. Inside a provider, widening the layout while the drawer is open closes it and moves focus to the matching link in the column.

## Height and scrolling

The column fills the height of its container, so place it in one that has a height. Its navigation list scrolls when it is taller than the column, and the drawer, which is as tall as the viewport, scrolls its navigation the same way.
