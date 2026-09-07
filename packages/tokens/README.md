# Mux UI tokens

`catalog/tokens/default-theme.json` owns the default palettes, type scales,
font metadata, spacing, effects, modes, and Scale preset inputs. This private
package validates those sources and produces target-specific output. Tale is
a one-time source of retained reference evidence; no transform reads a Tale
checkout or imports a Tale package.

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

The retained `test/fixtures/foundation-reference.json` records independently
captured donor CSS values. The Scale browser verification replays all 644
mapped variables across 48 mode and geometry combinations using only Mux
sources. Palette generation has a separate complete-value donor fixture.

## Author theme instances

`@muxui/tokens/authoring` is browser-safe. Its functions require the complete
canonical source through `{ source }`:

- `generateScaleTheme({ source, mode, presetId, namedColor, neutralColor,
  whiteAnchor, contrastPivot, curvature })` returns typed assignments and
  light/dark palette projections.
- `validateThemeAuthoringDocument(document, { source })` checks identity,
  contract version, declared modes, token types, override policy, and Scale
  assignment consistency.
- `serializeThemeAuthoringDocument(document, { source })` produces stable JSON.
- `compileThemeAuthoringDocument(document, { source, target, modes,
  responsive, selector })` compiles a selected theme. Web selectors are `:root`
  or a class scope; native targets may also need `rootFontSizePx`.

Theme instances use `muxui-theme-authoring-v1` and contain `id`, `source`,
`tokenContractVersion`, `modes`, typed `overrides`, and optional Scale inputs.
Scale-generated assignments must agree with their inputs. Other allowed
semantic and component overrides are preserved. Unknown tokens or fields,
wrong types, unsafe string values, and edits to fixed foundations are rejected.
The private Scale app provides a local editor and validated file persistence.

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
