# Mux UI architecture

Product facts only. Commands and working rules are in `AGENTS.md`; releasing is
in `docs/releasing.md`.

## Identity

- Display name Mux UI, machine identity `muxui`, package scope `@muxui/*`, CLI
  `muxui`, artifact and schema namespace `muxui:`.
- Public styling hooks are rooted in `.muxui-*`, `--muxui-*` and `data-muxui-*`.
- No alias is kept for any predecessor name.

Mux UI is a versioned design-system knowledge graph whose component product is
React. Package guidance, the CLI, the docs site and Storybook project the same
canonical sources: author a fact once, expose it everywhere, prove every
projection agrees.

## React first

- `@muxui/react` is the only renderer. It owns the typed React API, DOM and CSS
  behaviour, the public CSS contract, SSR and hydration, and accessibility
  fulfilment.
- React Aria Components is an exact, internal and replaceable substrate. Its
  types, exports and attributes never cross the public API, and an upstream
  export is not a Mux UI component without a catalog record.
- Dependencies are allowed by purpose: accessible behaviour and hooks
  (`react-aria-components`, `react-aria`), dates (`@internationalized/date`),
  decorative icons (`lucide-react`), motion (`motion`), Markdown (`marked`),
  rich text (Tiptap) and code highlighting (`shiki`). Shipped dependencies are
  pinned exactly; versions live only in manifests and the lockfile.
- Framework-free web (`web.html`) and React Native (`native.react-native`) are
  parked. Their bindings stay in the schema vocabulary as `unsupported` with a
  reason, and no scaffold package stands in for them.

## Packages

| Package | Role | Distribution |
|---|---|---|
| `@muxui/react` | React components, CSS contract, generated package guidance, descriptor | npm, `0.1.0-rc.N` on `next` |
| `@muxui/schema` | Source and response schemas, generated types, validation, platform IDs, the platform-safety registry | npm, `-rc.N` on `next` |
| `@muxui/catalog` | Compiled immutable catalog bundle, search index, pure query API | npm, `-rc.N` on `next` |
| `@muxui/tooling` | `muxui` CLI, local resolver, renderers, command registry | npm, `-rc.N` on `next` |
| `@muxui/tokens` | Token graph validation and web, native and Figma transforms | private build input |
| catalog compiler, tooling authoring entry | Compile the bundle; scaffolds, diagnostics, semantic diff | workspace only |
| `@muxui/docs`, `@muxui/react-storybook`, `@muxui/scale`, `@muxui/react-playground`, `@muxui/figma` | Docs site, Storybook, theme authoring, dev fixture, Figma export | private apps |
| `@muxui/web`, `@muxui/foundation`, `@muxui/react-native` | Removed from the workspace | parked |

Runtime edges between published packages: catalog depends on schema; tooling
depends on schema and on catalog through a version range bound to the query API
major it reads; React has no Mux UI runtime dependency. Token data reaches
consumers inside the catalog bundle. A packed manifest never holds a
`workspace:` specifier, `@muxui/tokens` or a parked package, and a tarball holds
only its declared public entries. The publish order is schema, catalog, tooling,
React (`tooling/audits/repository-policy/publish-set.json`).

## Platforms

| Platform | Status |
|---|---|
| `web.react` | Supported binding kind; every exported binding is `experimental` |
| `web.html` | `unsupported` (parked) |
| `native.react-native`, iOS, Android, React Native Web | `unsupported` (parked) |
| Another web framework | Not planned until demand |

No cross-platform parity, stable support or assistive-technology support is
claimed. Server rendering and hydration are tested; React Server Components and
client-boundary integration are not supported.

## Ownership

| Fact | Owner |
|---|---|
| Component inventory, concept (intent, anatomy, states, accessibility obligations, relations, lifecycle), binding behaviour, token recipe, examples | `catalog/components/` and `catalog/patterns/` records |
| React props, types, enum members, defaults, events | `packages/react/src` TypeScript. The catalog `web.react` `api` block is derived from it at generation and never authored |
| Experimental families outside the fixed registry | `catalog/react-r1-6/supplemental-components.json` |
| Token IDs, types, meanings, modes, aliases, override policy, default theme | `catalog/tokens/` |
| Token transforms | `@muxui/tokens` |
| Platform-safety requirement IDs, meanings and default dispositions | `packages/schema/platform-safety-contract.json` |
| Command grammar and availability | `packages/tooling/command-registry.json` |
| Block categories | `catalog/patterns/categories.json` |
| Theme editing | `apps/scale`, a private editor over `catalog/tokens/`; owns no token fact |
| Figma | A projection from `@muxui/tokens` and `@muxui/figma`; never canonical |

A guide states no prop, variant, default, event or import path unless a check
compares it with the API block; otherwise it links to the generated reference.
A Block is a `pattern` artifact: a bounded composition of existing components
with no routing, data fetching or business state, distributed by copy and paste.

## Tokens

- Three layers: reference, semantic, component. Aliases point component to
  semantic to reference, never back, and the graph is acyclic.
- Components read semantic or component tokens, never reference values.
- Override policy per token: `fixed`, `theme`, or `instance` (a component-local
  hook that a test shows changes computed style).
- Consumer themes assign only permitted existing roles. They cannot change
  identity, type, meaning, modes or alias topology.
- CSS and native theme objects are derived outputs. Native never parses CSS.

## React CSS contract

- Cascade layers `muxui.tokens`, `muxui.components`, `muxui.utilities`, in that
  order. An unlayered consumer rule wins, except over the few `!important`
  declarations (forced colours, reduced motion).
- Root class `.muxui-<slug>`, part class `.muxui-<slug>__<part>`, the shared field
  classes, a closed set of `data-muxui-*` state attributes, and the `instance`
  custom properties. Substrate attributes, nesting and other selectors are
  internal.
- Style entries: `styles.css` (every family) and two optional theme stylesheets
  with the same presets, selectors, layer and order. `themes.css` picks each
  shade's text colour by WCAG 2 contrast ratio. `themes-apca.css` picks it by
  APCA endpoint selection (APCA 0.0.98G-4g, absolute Lc). Copy names the method
  and the score only; neither file claims conformance or a minimum score.

## Versions and compatibility

- A package version names a tarball; a version unit names a contract. Current
  units: `schemaVersion` 4.0.0 (`packages/schema/src/index.mjs`), query API
  3.0.0 (`packages/catalog/catalog-sources.json`), `tokenContractVersion` 8.0.0
  (`catalog/tokens/default-theme.json`). The catalog package version is
  `catalogVersion`.
- The resolver (`packages/tooling/src/local-resolver.mjs`) reads the
  project-declared catalog and negotiates the query API itself. An incompatible
  catalog fails with `MUXUI_CATALOG_INCOMPATIBLE`; it never falls back to hosted
  latest or a nearby catalog.
- The React descriptor (`packages/react/src/renderer-descriptor.mjs`) declares
  binding-spec revisions plus `^schemaVersion` and `^tokenContractVersion`
  ranges.
- Prerelease is current-only: superseded names, formats and query versions are
  removed outright, with no alias, coercion or migrator.

## Generation

- Generators compile projections and never discover truth by heuristics.
  Generated files carry a marker naming their source and a digest
  (`repository-policy.json` owns the marker, slug and alias rules).
- Every generator supports `--check`, stable ordering and no wall-clock fields.
  `pnpm generate:check` proves repeated generation is a no-op.
- Bulky generated output is not committed; a fresh checkout runs `pnpm generate`.

## Release

- Each candidate is built once by the publish workflow's dry run. The publish run
  promotes that exact artifact after re-verifying its bytes; it never rebuilds.
- Publishes go to `next` with npm provenance over OIDC. `latest` is never
  claimed or promoted, and no stable version exists.
- A bad version is deprecated and fixed forward with the next rc. Unpublishing
  is only for a security or legal problem.
- No assistive-technology support is claimed. The manual and
  assistive-technology proof such a claim needs does not exist; automated proof
  is axe in one browser plus package keyboard and focus tests. The published
  `release.json` lists the unverified families.

## Invariants

1. One artifact identity, one canonical record, one owner per fact.
2. React is not the component inventory; it authors only its own API shape.
3. Generated files are never edited to fix drift.
4. Unknown canonical fields fail closed.
5. Example selection is deterministic, never by model or filesystem order.
6. Public CSS and DOM hooks are enumerated; everything else is internal.
7. A binding without an implementation is `unsupported` with a reason.
8. A heavy entry (editor, parser, highlighter, motion) loads only from the module
   that owns it, so an ordinary import stays light.
9. Text-processing components bound their input and work, render no raw HTML,
   and send nothing to a remote service.
10. Icons are decorative Lucide modules, hidden from the accessibility tree,
    never an accessible name.
11. The docs site and Storybook own no component, token or example fact.
12. Licences and notices of every distributed dependency and asset ship with it.
13. A consumer value cannot disable platform-safety adaptations such as forced
    colours.
14. Unsupported capabilities stay explicit; nothing implies support by omission.
