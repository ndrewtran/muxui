# Bento migration ledger

Updated 2026-09-20. This working ledger tracks Mux capabilities and Bento
integration work separately. Component completion below means the capability
exists in Mux; it does not mean Bento has migrated or a package has been released.

## Closed Mux capability gaps

| ID | Capability | Status |
| --- | --- | --- |
| B01–B09 | Earlier collection, input, control, and overlay API additions | Previously completed |
| B16 | Text | Previously completed |
| B18 | Image and Avatar | Previously completed |
| B19 | ProgressCircle as the Spinner replacement | Previously verified |
| B20 | SelectNative | Previously completed |
| B10 | Consumable theme tokens, selectable preset assets, and metadata | Implemented: `@muxui/react/themes` exposes typed metadata for every canonical Scale preset and `@muxui/react/themes.css` provides scoped light/dark and standard/more contrast color declarations generated through the shared Scale authoring compiler. |
| B21 | Two-tone circular ColorSwatch | Implemented: `secondaryColor`, `shape`, and accessible `colorName`; both colours retain alpha |
| B23 | Reusable command data management | Implemented: Mux-owned `useCommandPalette` for query, matching, ranking, grouping, action execution, and dismissal |

B21 is owned by the [ColorSwatch binding](../../../catalog/components/color-swatch/artifact.json)
and [React implementation](../src/collections.mjs), with a
[two-tone example](../../../catalog/components/color-swatch/examples/react/two-tone.tsx).
B23 is owned by the [CommandPalette binding](../../../catalog/components/command-palette/artifact.json)
and [React implementation](../src/supplemental/index.mjs), with a
[managed-commands example](../../../catalog/components/command-palette/examples/react/managed-commands.tsx).

For B23, connect the hook's `query` and `setQuery` to the native Input's
`value` and `onChange`. Command IDs are strings. `getItemProps` supplies Mux
`disabled`/`onActivate` props and leaves dismissal to the hook's `close`
callback after actions succeed. `filter: false` and `sort: false` preserve
external results and order; Bento's existing `sort: () => 0` policy also works.
Use `onError` to present item-activation failures; failed actions leave the
palette open. Direct `runCommand` calls remain awaitable and reject on failure.
The application still supplies its browser commands, asynchronous search
results, navigation, labels, and custom item content.

## Remaining migration work

| ID | Remaining requirement | Owner / completion condition |
| --- | --- | --- |
| B11 | CSS/token/part mapping and theme application | Bento maps selectors and tokens across shell/native chrome documents, preserves its 16px rem assumptions and atomic theme updates. |
| B13a | Consumer Node policy | Resolve Bento's Node 20 tooling against Mux's declared `>=24.19.0 <25` engine contract and verify the chosen supported install/build path. No browser runtime incompatibility has been established. |
| B13b | Reproducible Mux distribution and installation | Wire the chosen package/tarball source into Bento's development and frozen release lock workflows. |
| B14 | React Aria dependency resolution | Align Bento's forced aliases and manual chunks with Mux's pinned substrate; verify a single context copy. Bento's React peer version already satisfies Mux. |
| B15 | Row and Column layout helpers | Provide explicit Bento-owned helpers or admit a Mux-owned layout API. |
| B17 | Icon presentation | Provide a Bento Lucide adapter or separately admit a Mux-owned Icon API. |
| B22 | Persisted theme compatibility | Preserve existing theme IDs, aliases, unknown-ID fallback, backup round trips, custom themes, and Bento's Default appearance. No workspace-ID redesign is needed. |
| B24 | Actual Firefox-host and packaged-asset proof | Verify portals, keyboard dismissal, focus restoration, chrome scrims, frame separation, CSS/fonts, and CSP across Bento's 13 entry points. Mux's HTTP Chrome fixtures do not close this item. |
| B25 | Tale-specific development/release tooling | Update Bento's authoring guidance, MCP hook/config, dependency handling, and SBOM assertions for the chosen Mux integration. This does not require a new Mux MCP server. |

B12 (bundle size) is informational, not a migration gate. The earlier Adobe
locale-plugin check is retained; it is not reopened by B21/B23. Existing
native-chrome foreground override no-ops remain baseline behaviour, not a new
migration defect.

## B21/B23 verification

- Focused colour rendering, accessibility, locale, invalid-input, and disabled-context checks.
- Command matching/ranking/grouping, controlled and uncontrolled query,
  external ordering, disabled/missing commands, async success/rejection, and
  dismissal policy checks.
- Browser SSR/hydration, swatch geometry/alpha/ref, grouped keyboard activation,
  and existing external-result/input/IME contracts.
- React package checks, including packed catalog-example type checking;
  affected workspace checks and no-op generation identity.

The workspace policy scan also sees pre-existing ignored audit/build outputs.
Policy validation uses a plain export of the current authored files with
freshly generated projections. Current-source no-op generation is verified in
that export; the standard `generate:check` command checks committed HEAD only.

These are implementation checks, not Firefox-host or release acceptance.

## B10 verification

- The shared token authoring tests compile all canonical standard and monochrome presets, including light/dark and standard/more contrast selections, and verify the derived two-tone swatches.
- React generation emits typed metadata plus scoped CSS for each preset and combined mode. The CSS includes the complete color dependency closure and related effect roles while leaving layout, typography metrics, density, and motion values in the base stylesheet.
- Packed-consumer release proof resolves `@muxui/react/themes`, its declaration file, and `@muxui/react/themes.css` without adding a runtime dependency on Scale or private token modules.
- An unknown preset ID matches no preset declarations; nested scopes retain inherited values. Forced-colors behavior continues to use the existing system-color rules.

B10 closes the Mux capability only. Bento integration work for B11, persisted compatibility for B22, and the remaining ledger items stay open.
