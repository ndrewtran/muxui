# Mux UI tokens

`catalog/tokens/default-theme.json` owns the default palettes, type scales,
font metadata, spacing, effects, modes, and Scale preset inputs. This private
package validates those sources and produces target-specific output. Guide
pages explain migration rationale and are not a second token registry.

## Compile a theme

The Node entry point exposes `compileTokenGraph`, `compileWebTheme`, and
`compileNativeTheme`. The browser-safe `@muxui/tokens/core` entry point owns
the same graph resolver and CSS value formatting. Sources and overrides are
validated before output; unsupported native recipes receive explicit
diagnostics. Native transforms do not establish renderer support.

Type and spacing dimensions use their static `rem` defaults. Passing
`{ responsive: true }` selects the stored fluid recipes. In React's stylesheet,
`data-muxui-responsive` on a theme scope enables the corresponding opt-in CSS.
The default remains static at every viewport, and `rem` dimensions continue
to respect the consumer's root font size.

The Scale browser verification covers the live theme-builder flow and palette
generation uses the complete canonical source.

## Token contract 4.0

The default source uses token schema `2.1.0` and token contract `4.0.0`.
Contract 4.0 removes 34 provisional IDs that had no Mux UI consumer. Removed
IDs are absent from the graph and generated CSS, and authoring and component
recipes must use current token IDs. The [token contract migration guide](../../catalog/guides/token-migration.md)
contains the direct change map.

The active typography family roles point to four base reference stacks, and
motion roles retain purpose-specific reduced behavior. When changing an
override, verify its value and mode branches instead of assuming equal current
values imply interchangeable contracts.

## Author theme instances

`@muxui/tokens/authoring` is browser-safe. Its functions require the complete
canonical source through `{ source }`:

- `generateScaleTheme({ source, mode, presetId, namedColor, neutralColor,
  whiteAnchor, contrastPivot, curvature })` returns typed assignments and
  light/dark palette projections.
- `compileScalePresetTheme({ source, collection, presetId, modes })` resolves a
  canonical standard or monochrome preset through the same authoring document
  and compiler path used by Scale. Consumers should derive preset metadata and
  CSS from this API rather than copying the canonical seed definitions.
- `validateThemeAuthoringDocument(document, { source })` checks identity,
  contract version, declared modes, token types, override policy, and Scale
  assignment consistency.
- `serializeThemeAuthoringDocument(document, { source })` produces stable JSON.
- `compileThemeAuthoringDocument(document, { source, target, modes,
  responsive, selector })` compiles a selected theme. Web selectors are `:root`
  or a class scope; native targets may also need `rootFontSizePx`.

Theme instances use `muxui-theme-authoring-v1` and contain `id`, `source`,
`tokenContractVersion`, `modes`, typed `overrides`, and optional Scale inputs.
Authoring documents must declare `tokenContractVersion: "4.0.0"` and match the
canonical source exactly. Older contract versions are rejected; the compiler
does not normalize documents or rewrite overrides. Scale-generated assignments
must agree with their inputs. Other allowed semantic and component overrides
are preserved. Unknown tokens or fields, wrong types, unsafe string values, and
edits to fixed foundations are rejected. The private Scale app provides a
local editor and validated file persistence.

## Optional Tailwind integration

Mux components use ordinary CSS. Tailwind is installed and run by consumers;
it is not a dependency or peer dependency of Mux packages.

At consumer build time, `compileTailwindTheme(source)` from
`@muxui/tokens/tailwind` emits an `@theme inline` block whose variables refer
to Mux's CSS variables. Include Mux's stylesheet in an earlier cascade layer
than consumer utilities:

```css
@layer theme, base, muxui, components, utilities;
@import "tailwindcss";
@import "@muxui/react/styles.css" layer(muxui);
@import "./muxui-tailwind-theme.css";
```

For example, `bg-muxui-component-button-background` uses the current Mux
button background token, and `rounded-muxui-component-button-radius` uses its
radius. Consumers can override the ordinary Mux CSS variables or apply later
utility styles. The adapter also maps typography, spacing, shadows, easing,
and transition durations. Tailwind's own theme values remain available.

The isolated `tests/fixtures/tailwind-consumer` fixture compiles the real Mux
stylesheet and exercises each supported namespace with Tailwind 4.1.13.
The mapping follows Tailwind's [theme variable contract](https://tailwindcss.com/docs/theme)
and its [transition-duration implementation](https://github.com/tailwindlabs/tailwindcss/blob/v4.1.13/packages/tailwindcss/src/utilities.ts).
