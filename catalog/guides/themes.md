---
id: muxui:guide:themes
---

# Themes & tokens

Mux UI styles are generated from the canonical default theme. Consumers use
semantic roles through the generated stylesheet; component pages do not need a
second palette or a parallel styling system.

## Color modes

The default theme declares `light` and `dark` color schemes, with standard and
more-contrast modes, comfortable and compact density, and full or reduced
motion. The default mode is light, standard contrast, comfortable density, full
motion, and left-to-right direction.

The current theme does not provide runtime switching through the package. If a
consumer owns mode switching, scope the generated stylesheet and set the
accepted mode attributes according to the package contract.

## Semantic roles

Use the generated Mux UI roles for content, surfaces, borders, actions, focus,
typography, and motion. Component styles consume the roles exposed by the
generated stylesheet. Consumers should not copy resolved color values into
application CSS.

## Responsive dimensions

Responsive dimension recipes are opt-in. Add `data-muxui-responsive` to a theme
scope after importing `@muxui/react/styles.css` to activate viewport-based
values. The default root values remain static.

## Fonts

The generated theme uses Inter for display and body text, Playfair Display for
expressive text, and Roboto Mono for code. The package includes the font assets
and their licenses with the local candidate.
