---
id: muxui:guide:contribution
---

# Contribution & authoring

Mux UI authors each public fact once and exposes it through projections. The
catalog owns component records, binding specifications, examples, relations,
and narrative guides. Packages own runtime behavior and generated output.

## Add a component fact

Start with the canonical record under `catalog/components/<slug>/`. A React
binding belongs in the record's `web.react` binding, and an executable example
belongs beside it under `examples/react/` with its ExampleRecord metadata.

Keep API props, defaults, events, parts, states, accessibility obligations,
token requirements, lifecycle, and strategy in their declared owners.

## Register the record

The compiler reads only the records listed in
`packages/catalog/catalog-sources.json`, and `pnpm generate` keeps that list in
sync with the canonical records under `catalog/`. Add or remove the record
files, run `pnpm generate`, and commit the regenerated manifest. Do not edit
the list by hand.

## Add an example

An example is a `<name>.example.json` record and its `<name>.tsx` source under
`catalog/components/<slug>/examples/react/`. The record's `binding.ref` names
the component binding, and its `source` names the `.tsx` file. The source
declares exactly one executable export. Examples that list the `generation`
purpose need a distinct `binding.preference` for the binding; the lowest leads
the component page and the query results.

The projections find examples differently:

- The docs component page and the query API read every registered example of
  the component binding.
- Storybook builds component pages from the React descriptor. Only the
  examples listed in `canonicalStoryDefinitions` in
  `apps/react-storybook/src/generate-stories.mjs`, one per family, also appear
  as stories, so add a new component example there to show it in Storybook.
- Blocks are created with `scaffoldPattern`, as `catalog/AGENTS.md` describes.
  Docs and Storybook each show every variant example of a pattern.

## Write guidance

Narrative guidance belongs under `catalog/guides/`: a `<slug>.json` record
whose `source` names the `<slug>.md` file. The docs application reads these
records and renders them; it does not become a second normative source.

Name a component's guide `<Component> usage`, as in `button-usage.json`. The
docs component page shows the guide whose name matches. A guide with any other
name appears in the docs only after `apps/docs` adds a page route and sidebar
entry for it; `src/pages/[guide].astro` and `astro.config.mjs` list the current
ones. The query API serves every registered guide.

## Verify the projection

Run the owning package checks and regenerate catalog projections after changing
canonical records:

```sh
pnpm generate
pnpm generate:check
pnpm check
```

While you work, scope `pnpm check` to the task: `--files <path[,path]>` for the
exact files, or repeatable `--component <family-or-slug>` or `--package
<name|path>` selectors. Add `--dry-run` to print the plan. An explicit scope
ignores unrelated dirty files, and `pnpm check:all` runs the complete graph.

```sh
pnpm check --files catalog/guides/contribution.md,catalog/guides/contribution.json
```

The docs check, `pnpm --filter @muxui/docs check:docs`, fails on an example
whose source does not declare exactly one executable export and on a guide whose
source digest is stale. After `pnpm install` and `pnpm generate`, the
repository-local CLI shows what the query API serves:

```sh
node packages/tooling/bin/muxui.mjs get muxui:guide:contribution --platform web.react --json
```

Keep generated files reproducible. A documentation page should display the
canonical query result and executable source so API and examples cannot drift
silently.
