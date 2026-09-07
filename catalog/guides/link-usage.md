# Link usage

Use Link for navigating to another location. Keep its Mux UI-owned props and accessible name semantics intact.

Compose consumer-supplied icons as Link children: put a leading decorative icon before the text and a trailing decorative icon after it. Inline SVG icons should use `currentColor`, `1em` width and height, `aria-hidden="true"`, and `focusable="false"`.

An icon-only Link still needs an accessible name, such as `aria-label`. A decorative icon does not name the link.
