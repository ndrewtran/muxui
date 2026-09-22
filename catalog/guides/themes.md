---
id: muxui:guide:themes
---

# Themes & tokens

Mux UI styles are generated from the canonical default theme. Consumers use semantic roles through the generated stylesheet; component pages do not need a second palette or a parallel styling system.

## Token contract 5.0

The current source uses token schema `2.1.0` and token contract `5.0.0`. The
contract removes provisional token IDs that had no Mux UI consumer. Removed
names are absent from the generated stylesheet and rejected by authoring,
Scale, and component recipes. See the [token contract migration guide](/token-migration/)
for the direct change map.

Authoring documents must declare `tokenContractVersion: "5.0.0"`. Validation
requires an exact source contract match and does not normalize older documents
or rewrite overrides. Preserve explicit values and mode branches while moving
to current semantic roles.

See the [token contract migration guide](/token-migration/) for preferred typography and motion names, active colour roles, surface and geometry retirement guidance, and the roles that have no direct replacement.

## Color modes

The default theme declares `light` and `dark` color schemes, with standard and more-contrast modes, comfortable and compact density, and full or reduced motion. The default mode is light, standard contrast, comfortable density, full motion, and left-to-right direction.

The current theme does not provide runtime switching through the package. If a consumer owns mode switching, scope the generated stylesheet and set the accepted mode attributes according to the package contract.

## Semantic roles

Use the generated Mux UI roles for content, surfaces, borders, actions, focus, typography, and motion. Component styles consume the roles exposed by the generated stylesheet. Consumers should not copy resolved color values into application CSS. Prefer semantic typography family roles such as `semantic.typography.text-font-family` and `semantic.typography.label-font-family`; raw reference family aliases are implementation details.

Scale's private Typography role matrix is an authoring projection over these
semantic roles. It derives the seven roles and six metric groups from the
canonical source, and stores Weight, Leading, and Tracking changes as explicit
typed overrides. Expressive content keeps its own family but shares the body/
text metric tokens, so its linked values update with the text group and do not
create expressive metric token IDs.

## Responsive dimensions

Responsive dimension recipes are opt-in. Add `data-muxui-responsive` to a theme scope after importing `@muxui/react/styles.css` to activate viewport-based values. The default root values remain static.

## Fonts

The generated theme uses Inter for display and body text, Playfair Display for expressive text, and Roboto Mono for code. The package includes the font assets and their licenses with the local candidate.
