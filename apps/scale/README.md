# Mux UI Scale

Private local authoring app for Mux UI themes. It uses the shared typed token
authoring and compiler APIs, so saved themes remain reusable by web and future
native projections.

Run it from the repository root with:

```sh
pnpm run scale
```

The development server binds to `127.0.0.1:5174`. Saving a theme writes a
validated source document to `catalog/tokens/themes/<slug>.json` through the
local authoring endpoint. The endpoint is development-only and accepts writes
from that exact origin.

Choose a preset, edit the named or neutral anchor, and preview light, dark, or
accent backgrounds. Monochrome themes share one anchor. The radius control
updates both preview and exported values. Copy CSS exports the selected color
mode under `:root`; JSON preserves every declared mode and typed override.

Import JSON accepts the shared `muxui-theme-authoring-v1` format with Scale
inputs. Extra valid token overrides and restricted mode domains survive later
palette edits, saves, and exports. The theme slug is its saved identity. Use
**Load** before editing an existing file: **Save** reports a conflict if another
window has since changed that file. **Reset to defaults** resets the draft;
it does not delete saved themes.

Draft settings and share URLs stay in the browser until saved. Export JSON
works without the development endpoint; saving to the monorepo requires the
local development server. The app is private and is not a production service.

The default type and spacing scales retain their static `rem` values.
Responsive scales are a separate consumer opt-in. Scale uses the shared
compiler for swatches, component tokens, contrast labels, and CSS output.

Verification:

```sh
pnpm --filter @muxui/scale check
pnpm --filter @muxui/scale check:browser
# Optional migration-reference replay:
pnpm --filter @muxui/scale check:browser:foundation
```

The normal browser check uses an isolated temporary theme directory and needs
Chrome; set `MUXUI_CHROME_EXECUTABLE` when Chrome is installed outside a
standard path. It covers the live theme-builder flow, including editing,
light/dark preview, import/export, local save/load, and stale-write protection.

The optional `check:browser:foundation` command replays 644 foundation
variables against retained donor expectations across 48 combinations of color
mode, motion, viewport, root font size, and responsive sizing. It is migration
evidence for the retained reference and is not part of the normal browser
check.
