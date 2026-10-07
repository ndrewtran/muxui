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

`src/lib/blocks.ts` reads patterns only through the catalog query API (list, search,
get with `--section examples`, `--uses`, and the derived `usedIn` view), and
`/blocks/filter-index.json` ships the rail's filter data derived from that same
catalog. The app owns no block, pattern, example, search, or prose fact. The section
is unpublished and claims nothing about a public docs surface.
