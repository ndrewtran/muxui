# Mux UI documentation

This private Astro Starlight app will host the Mux UI documentation surface.

Run these commands from the repository root:

```sh
pnpm --filter @muxui/docs check
pnpm --filter @muxui/docs build
pnpm docs
```

Documentation content lives in `src/content/docs/`. The site is a projection
over canonical catalog and guide sources; it does not own component facts.

## Component pages

`/components/<slug>/` pages project one catalog component record. Their sections, each an h2 with a stable id and an outline entry, run: Basic example (`basic`), Installation and imports (`installation`), Usage (`usage`), Behavior (`behavior`), Examples (`examples`), Used in blocks (`used-in-blocks`, only when a block uses the component), API reference (`api-reference`), Events (`events`), Accessibility (`accessibility`), Anatomy and styling (`anatomy-and-styling`), and Sources (`sources`).

The facts behind those sections come from `../component-reference.mjs`, which turns a component record, the renderer descriptor and contract, and the package manifest into section facts, so the app authors no per-family text. A component's usage guide is related by its declared id (`muxui:guide:<slug>-usage`). A usage guide that names no family, `control-sizing-usage`, is shared guidance: it has its own Docs page and sidebar entry like the other shared guides, and `scripts/check-component-sections.mjs` fails when any such guide is unreachable. The API reference keeps the Prop and Default table until Decision 0031's TypeScript extraction supplies types. `scripts/check-component-sections.mjs` proves the section order of every built route and that each projected string equals its catalog value.

## Blocks

The private Blocks section (`/blocks/`) projects the catalog's `pattern` records
(Decision 0026). It has its own full-width layout in `src/layouts/BlocksLayout.astro`,
shares the site header and theme, and previews each variant in an isolated iframe
route (`/blocks/<block>/<variant>/preview/`) that runs the canonical example source.

`src/lib/blocks.ts` reads blocks through the catalog query API (list, get with
`--section examples`, `--uses`, and the derived `usedIn` view). Group and category
order follow the category registry in `catalog/patterns/categories.json`, which
`@muxui/catalog` exports as `PATTERN_CATEGORY_GROUPS`. The registry also declares each
category's display label, which the app shows as written; a group reads as its
capitalised id. The app owns no block, pattern, example, search, or prose fact. The section is unpublished and claims nothing about a public
docs surface.

The section's own controls are Mux UI components, not imitations. The rail
(`BlocksRailIsland.tsx`), the gallery (`BlocksGalleryIsland.tsx`), and the block
toolbar and stage (`BlockViewerIsland.tsx`) are React islands over the server-rendered
pages, built from `@muxui/react` components (Sidebar, SearchField, SelectNative, Text,
ToggleButtonGroup, Button), and `styles/blocks.css` holds only layout and the preview and
code surfaces, so it must not restyle a Mux component. The rail is Sidebar navigation at
`density="compact"`: groups
are Sections, categories are items, a block is a link group (its link opens the first variant,
a toggle opens its variants), and variants are links, with the open page as the current item.
The rail island keeps which groups are collapsed, so the choice survives the in-place swap, and
opening a page opens the groups that hold it. The breadcrumb and a gallery card's title are
navigation, not inline text links, so they are plain anchors inside Mux headings that take their
colour and focus ring from Mux tokens. The preview resize handle is the one custom control:
Resizable sizes adjacent panels in percent, while the handle sets the preview's width in pixels. `scripts/blocks-browse.ts` holds the filter and the open page,
`scripts/blocks-view.ts` the toolbar's width, theme, and view (remembered for the tab), and
`scripts/blocks-client.ts` only swaps the pane in place when a Blocks link is followed.

The rail filters in the browser from `/blocks/filter-index.json`. Its query grammar
and term matching are `@muxui/catalog/search`, the same code `searchArtifacts` runs,
and its `uses` sets are the API's own `list --uses` answers. The index's search terms
are one of two reads of the generated bundle (the declared `@muxui/catalog/bundle` export,
limited to `searchIndex`): the query API answers searches but has no operation that
lists the indexed terms, and the browser matcher needs them. The other is each component
record's `category`, which places it in the sidebar's AI Agent or Components group
(`src/lib/component-categories.ts`); the query API's component brief does not carry it.
`test/blocks-loader.test.mjs` proves the filter answers every query as the API does,
over the shipped catalog and over test-only fixture patterns that give it several blocks.
