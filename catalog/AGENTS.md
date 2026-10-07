# Catalog navigation

This directory owns canonical public knowledge. Keep artifact identity,
binding specifications, examples, and relations under their declared source
owners. Never place compiled catalogs, search indices, site pages, or other
projections beside canonical records.

Use the root verification commands until a narrower catalog-owned command is
declared here by its implementing package.

`patterns/<slug>/` holds one Block (a pattern): `artifact.json`, and per
variant an `examples/react/<variant>.example.json` record with its `.tsx`
source, all listed in the catalog source manifest. Create them with
`scaffoldPattern`. The compiler checks variant sources against the import and
content rules (`packages/catalog/src/pattern-imports.mjs` and
`pattern-content.mjs`): imports only in the leading header, no remote
reference, no literal colour, an `<asset>.license.json` beside any asset
(dotfiles but `.DS_Store` included), and a local `src`, `href`, `url()`, or
`srcSet` path only to a licensed asset inside the pattern directory (`#fragment`
and `data:` references are fine; `action`, `formAction`, and `poster` count only
as attributes, so a data field named `action` is fine). `scaffoldPattern` runs
the remote and colour rules with the same rule IDs.
