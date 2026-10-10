# Catalog navigation

This directory owns canonical public knowledge. Keep artifact identity,
binding specifications, examples, and relations under their declared source
owners. Never place compiled catalogs, search indices, site pages, or other
projections beside canonical records.

Use the root verification commands until a narrower catalog-owned command is
declared here by its implementing package.

`patterns/categories.json` declares the block categories and their groups as
`{ "<group>": ["<category>", ...] }`, in display order. A block's `category` must be
listed there; the compiler rejects any other and derives the block's group from it.
Adding, renaming, or regrouping a category edits that file (and the blocks that name
it), not the schema.

A component record's optional `category` is its navigation group in docs and
Storybook: `"ai-agent"` places it in AI Agent, and no `category` leaves it in
Components. Adding a component to the group edits its record only: docs and
Storybook read the category from the generated catalog bundle, and
`apps/component-navigation.mjs` owns just the group labels.

`patterns/<slug>/` holds one Block (a pattern): `artifact.json`, and per
variant an `examples/react/<variant>.example.json` record with its `.tsx`
source. Create them with `scaffoldPattern`. `pnpm generate` lists every
canonical record in `packages/catalog/catalog-sources.json`, so add or remove
the files and regenerate instead of editing that list. The compiler checks variant sources against the import and
content rules (`packages/catalog/src/pattern-imports.mjs` and
`pattern-content.mjs`): imports only in the leading header, no remote
reference, no literal colour, an `<asset>.license.json` beside any asset
(dotfiles but `.DS_Store` included), and a local `src`, `href`, `url()`, or
`srcSet` path only to a licensed asset inside the pattern directory (`#fragment`
and `data:` references are fine; `action` and `formAction` count only as
attributes, so a data field named `action` is fine, and `poster` counts as a
property only when its value looks like a path). `scaffoldPattern` runs the
remote and colour rules with the same rule IDs.
