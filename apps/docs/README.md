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

## Blocks

The private Blocks section (`/blocks/`) projects the catalog's `pattern` records
(Decision 0026). It has its own full-width layout in `src/layouts/BlocksLayout.astro`,
shares the site header and theme, and previews each variant in an isolated iframe
route (`/blocks/<block>/<variant>/preview/`) that runs the canonical example source.

`src/lib/blocks.ts` reads blocks through the catalog query API (list, get with
`--section examples`, `--uses`, and the derived `usedIn` view). Group and category
order follow the category registry in `catalog/patterns/categories.json`, which
`@muxui/catalog` exports as `PATTERN_CATEGORY_GROUPS`; the catalog owns no display
labels, so a label is derived from its id. The app owns no block, pattern, example,
search, or prose fact. The section is unpublished and claims nothing about a public
docs surface.

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
