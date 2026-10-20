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
- Storybook builds component pages from the React descriptor. A family's Docs
  page shows the source of every registered example as static text, with the
  live Default story above the first, and embeds the family's usage guide.
  Only the examples listed in `canonicalStoryDefinitions` in
  `apps/react-storybook/src/generate-stories.mjs`, one per family, also run as
  named stories, so list a new example there only when it must run in
  Storybook.
- Blocks are created with `scaffoldPattern`, as `catalog/AGENTS.md` describes.
  Docs and Storybook each show every variant example of a pattern.

## Write guidance

Narrative guidance belongs under `catalog/guides/`: a `<slug>.json` record
whose `source` names the `<slug>.md` file. The docs application and each
family's Storybook Docs page read these records and render them; neither
becomes a second normative source.

Give a component's guide the id `muxui:guide:<component-slug>-usage` and the
name `<Component> usage`, as in `button-usage.json`. The docs component page
and the family's Storybook Docs page show the guide with that id. A guide with
any other id, such as `control-sizing-usage`, which names no component, appears
in the docs only after `apps/docs` adds a page route and sidebar entry for it.
`src/pages/[guide].astro`, `astro.config.mjs`, and
`src/components/PageTitle.astro` (its Source link) list the current ones, and
the docs check fails a shared usage guide that has no page. The query API
serves every registered guide.

## Shape a component guide

Write a family's guide at the depth the family needs. When they apply, cover
these in this order, each under its own heading:

- When to use the family and when to avoid it. These are `intent.useWhen` and
  `intent.avoidWhen` in the component record, with the alternative named after
  a semicolon, such as "Navigating to another location; use Link".
- Which variant or alternative to choose, led by the task rather than the
  prop.
- Content constraints, such as how to label the control.
- One common mistake.
- An example where it helps, as a registered example the guide names.

Write each fact as one bullet of about two lines or fewer, in plain words and
without implementation detail. Do not title a section after a page section
(Usage, Behavior, Examples, Accessibility), because the docs page already
uses those ids.

## Link to another family

Name an alternative as a link. Write the family's docs path, such as
`[Checkbox](/components/checkbox/)`. The docs site serves that path as the
family page. Storybook has no such route, so its Docs page resolves the same
link to the family's Docs page. A link names a family page, never a section of
it, so Storybook generation and `pnpm --filter @muxui/docs check:docs` reject a
fragment, a missing trailing slash, and a family that has no page. Write the link
in Markdown, not HTML; a link title is fine, and a link inside a code sample is
only text.

Links within the same guide, such as `[API reference](#api-reference)`, and
links to external pages stay as written. Relative paths such as `../checkbox/`
resolve against the page that shows the guide, which differs by surface, so
they do not reach the same family on both.

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
