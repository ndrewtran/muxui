---
id: muxui:guide:themes
---

# Themes & tokens

Mux UI styles are generated from the canonical default theme. Consumers use semantic roles through the generated stylesheet; component pages do not need a second palette or a parallel styling system.

## Token contract

The canonical source, `muxui:token:default-theme`, declares the token schema
(`schemaVersion`) and token contract (`tokenContractVersion`) versions. The
contract removes provisional token IDs that had no Mux UI consumer. Removed
names are absent from the generated stylesheet and rejected by authoring,
Scale, and component recipes. See the [token contract migration guide](/token-migration/)
for the direct change map.

Authoring documents must declare the source's `tokenContractVersion`. Validation
requires an exact source contract match and does not normalize older documents
or rewrite overrides. Preserve explicit values and mode branches while moving
to current semantic roles.

See the [token contract migration guide](/token-migration/) for preferred typography and motion names, active colour roles, surface and geometry retirement guidance, and the roles that have no direct replacement.

## Color modes

The default theme declares `light` and `dark` color schemes, with standard and more-contrast modes, comfortable and compact density, and full or reduced motion. The default mode is light, standard contrast, comfortable density, full motion, and left-to-right direction.

Each axis is selected by a data attribute:

| Attribute | Values |
| --- | --- |
| `data-muxui-color-scheme` | `light`, `dark` |
| `data-muxui-contrast` | `standard`, `more` |
| `data-muxui-density` | `comfortable`, `compact` |
| `data-muxui-motion` | `full`, `reduced` |
| `data-muxui-direction` | `ltr`, `rtl` |

Set an attribute on the document root to apply a mode to the whole page, or on any element to apply it to that subtree.

[ColorModeToggle](/components/color-mode-toggle/) switches the page between light and dark, and [ColorModePicker](/components/color-mode-picker/) offers Light and Dark with a System choice that follows the operating system. Both write the result to `data-muxui-color-scheme` on the document root, so they set the scheme for the whole page, and both remember the choice in the browser. Each component's generated reference lists its props, defaults, and how a saved choice is restored.

The package has no switch for the other axes, so set their attributes yourself.

## Preset themes

Import `@muxui/react/themes.css` after `@muxui/react/styles.css` to enable the preset palettes, and read their IDs from `MUXUI_THEME_PRESETS` in `@muxui/react/themes`. Set `data-muxui-theme` on the same element as any `data-muxui-color-scheme` or `data-muxui-contrast` attribute, because the preset palette is chosen from the attributes on that element. `ColorModeToggle` and `ColorModePicker` write to the document root, so put `data-muxui-theme` on `<html>` for them to drive a preset. Presets recompute the color dependency closure; spacing, typography, motion, and density come from the base theme. An unknown preset ID matches no preset declarations, so normal base and inherited styles apply.

```tsx
<div data-muxui-theme="standard-harbour" data-muxui-color-scheme="dark">{children}</div>
```

`@muxui/react/themes-apca.css` holds the same presets with text colors chosen by APCA 0.0.98G-4g endpoint selection instead of the WCAG 2 contrast ratio. It has the same selectors, cascade layer, and rule order as `themes.css`, so import it in place of `themes.css`. If both load, the one imported last wins wherever they differ. Each shade's text is the light or dark endpoint of its palette, and the two files differ only in which endpoint they pick: `themes.css` takes the one with the higher WCAG 2 contrast ratio, `themes-apca.css` the one with the higher absolute APCA Lc score. Only the `*-fg` text tokens and the declarations that depend on them change, and `MUXUI_THEME_PRESETS` is the same for both. Choose it when your own tooling scores text with APCA; keep `themes.css` otherwise. Neither file promises a minimum score for every pair.

```css
@import '@muxui/react/styles.css';
@import '@muxui/react/themes-apca.css';
```

[ThemePicker](/components/theme-picker/) lets people choose a preset from swatches grouped by collection, and can offer a Random option. It reports the chosen theme ID and changes nothing outside itself, so the application sets `data-muxui-theme` to that ID, and decides which theme Random means. Its swatches carry each preset's own colours for the color scheme in force, so the picker needs neither `themes.css` nor a theme scope. The component's generated reference lists its props, defaults, and events.

## Cascade layers

`@muxui/react/styles.css`, `@muxui/react/themes.css`, and `@muxui/react/themes-apca.css` put every rule in the cascade layers `muxui.tokens`, `muxui.components`, and `muxui.utilities`, in that order. Tokens and theme presets sit in `muxui.tokens`, component styles in `muxui.components`, and `muxui.utilities` is declared and empty.

For ordinary declarations, CSS outside any layer beats Mux UI, whatever its specificity, so your own unlayered rules override a component without `!important`. A rule in a layer ranked after `muxui.components` beats it too, and `muxui.utilities` is the place in Mux UI's own order for rules of yours that should outrank component defaults. To restyle by token, assign the `--muxui-semantic-*` and `--muxui-component-*` variables a component's styles read on a theme scope element, not on one rendered component. Declare your layer order once, before importing Mux UI, so a reset or framework sits below it and your layers sit above:

```css
@layer reset, muxui.tokens, muxui.components, muxui.utilities, app;
@import '@muxui/react/styles.css';
@import '@muxui/react/themes.css';
```

`!important` reverses the layer order, and it works per property. Where Mux UI declares a property `!important` (forced colors and reduced motion), that declaration stays in its layer and beats a competing declaration of the same property, normal or `!important`, in a later layer or in your unlayered CSS. An `!important` declaration in a layer you rank before Mux UI's layers, or in a `style` attribute, can win over it. It protects only the properties it names: where forced colors work through a component's own custom properties, a direct unlayered `background` declaration of yours is not blocked.

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
