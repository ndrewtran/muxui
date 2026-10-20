# Breadcrumbs usage

Use Breadcrumbs for showing a page location within a hierarchy. Keep its Mux UI-owned props and accessible name semantics intact.

## Breadcrumbs or other navigation

- Use Breadcrumbs to show where the current page sits and to climb back to an ancestor.
- Use [HeaderNav](/components/header-nav/) or [Sidebar](/components/sidebar/) to move between top-level destinations.

## Content

- List the levels from the top of the hierarchy down to the current page.
- Label each level with the name of its page, such as Docs.
- Give each ancestor an `href`. An item without one renders as text.
- The last item is the current page. It renders as text whatever its `href`, and it is not a navigation target.

## Long paths

Keep every level. When the list does not fit, it wraps onto another line, and that is the default to teach. The Breadcrumbs for a long path example wraps a six-level path in a narrow container.

Shorten only a path that is genuinely unwieldy. Replace some middle levels with one item that links to the nearest level it hides, and keep the top level, the nearest ancestors, and the current page.

## Common mistake

Hiding levels on a path that fits. Each hidden level is a page people can no longer reach in one click, so keep all of them and let the list wrap.
