---
id: muxui:guide:themes
---

# Themes & tokens

Mux UI styles are generated from the canonical default theme. Consumers use semantic roles through the generated stylesheet; component pages do not need a second palette or a parallel styling system.

## Token contract notice

The current source uses token schema `2.2.0` and token contract `3.1.0`. Token deprecations are authored on the token source with a `since` version, a `removeIn` version, and either an explicit replacement or a reason that no equivalent exists. The source is the authority for this metadata; guide pages explain the rationale and migration steps but are not a second token registry.

The 3.1 notice keeps deprecated names exported through `4.0.0` so existing CSS and scoped theme customizations have time to migrate. Update explicit authoring and stylesheet references when safe, and verify the affected light, dark, density, and reduced-motion modes. Replacement metadata does not rewrite consumer CSS or automatically move an override from a legacy name to a preferred name.

Saved `muxui-theme-authoring-v1` documents with `tokenContractVersion: "3.0.0"` remain importable against the 3.1 source during this notice. Validation, compilation, and serialization normalize a copy to 3.1.0 while preserving overrides, modes, and Scale inputs without mutating the input document. Newly generated documents use 3.1.0; future or incompatible contract versions are rejected.

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
