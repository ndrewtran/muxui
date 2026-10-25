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

The facts behind those sections come from `../component-reference.mjs`, which turns a component record, the renderer descriptor and contract, and the package manifest into section facts, so the app authors no per-family text. A component's usage guide is related by its declared id (`muxui:guide:<slug>-usage`). A usage guide that names no family, `control-sizing-usage`, is shared guidance: it has its own Docs page and sidebar entry like the other shared guides, and `scripts/check-component-sections.mjs` fails when any such guide is unreachable. The API reference shows the types the package ships (Decision 0031). `../component-reference.mjs` passes the committed declaration reference (`packages/react/reference/`) through, and `src/lib/api-reference.ts` arranges it: a "Parts and related exports" index with the exact import of each export, one unified table per part (members in a Common group, then one group per alternative of the part's props type, each closing with its "not allowed" and "not declared" members; a part's own members typed `never` close its shared group the same way), and the types the family exports. A part that is the same component as another (`TextEditor.Root`) shows the ref and native surface of the part it names. The catalog adds each default, labelled authored while its family has not moved to TypeScript, and which prop reports which event. A member's comment shows only when the declaration has one. The Sources section ends with a Declarations group, as Storybook's does: the family's reference file in `packages/react/reference/`, then the source of each declaration module that file was generated from. Exports no family owns (the package-level values and types, the shared types and every entry of the export map) are at `/package-exports/`, where each shared and package-level type and each package-level value also names the source file of the module that declares it. A page with more than eight parts opens only its first; a link to a part or a type opens it (a second time too), a printed page opens them all, and the 13 part fragments of the earlier layout (`src/lib/legacy-part-anchors.json`, read from a build of origin/main 29cfd6ae with `scripts/check-legacy-anchors.mjs --record`) stay as aliases in the part headings. `scripts/check-component-sections.mjs` proves the section order of every built route, that each projected string equals its catalog value, that every row, ref, native line, import, type and event equals what `scripts/typed-reference.mjs` derives from the reference and the catalog, with the inventory deciding which page holds each export, that the Sources section lists the record, examples, runtime, manifest and declaration sources in that order, and that every type and package-level value on `/package-exports/` shows the source the inventory's module gives it; `scripts/check-reference-records.mjs` pins the facts four ledger records ask for (DISCLOSURE-01, SWITCH-FIELD-01, TEXT-AREA-01, TEXT-EDITOR-02, which holds every export as `scripts/text-editor-declarations.mjs` writes it) and what DataDiff forbids; `scripts/check-reference-mutations.mjs` builds the docs from a changed copy of the reference (a part, a hook, a helper, a ref, an import, a type, a legal value, a requirement, forbidden members, a return type, a payload field, a declaration module's source, the source of the shared types' module, the source of a package-level value's module) and requires those checks to fail, each pin for its own change; and `scripts/check-page-mutations.mjs` changes the built HTML itself (a reworded state, a moved row, a lost cell, a lost or misdirected source link, a type's or value's source line) and requires the checker to report it on its page. `apps/scale/test/browser/docs-api-reference.test.mjs` proves in Chrome that the old links, a repeated link and printing open what they name.

The `/accessibility/` guide is the one author of the Support status and Verification text that every Storybook family page also shows. Support status holds the claim, the existing automated proof (linking the tested profile below) and the known limitations, and `scripts/check-shared-guidance.mjs` holds the built page to the same text and checks the routes and anchors it links. The `/lifecycle/` guide links the same tested profile from its exact-tuple advice, and the same script checks that link reaches the built heading.

## Installation

The Installation page (`/installation/`) states the package prerequisites from `packages/react/package.json` and the install and usage snippets from the generated package README. Its Tested profile section shows what the package records about its own testing: the `reactCompatibility.compatibilityProfile` that `packages/react/src/generate.mjs` generates from `catalog/react-r1-5/closure.json`, read through `src/lib/compatibility-profile.ts`. It lists the tested Node.js, React, React DOM and browser versions, the display profiles and what is not claimed, and says that it records testing, not support. `scripts/check-shared-guidance.mjs` holds the built page to those owners. Release-version copy belongs to the release owner and the page does not repeat the record's `version` or `publication`.

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
