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

## Write guidance

Narrative guidance belongs under `catalog/guides/` and is linked to the relevant
artifact by its declared metadata. The docs application reads these records and
renders them; it does not become a second normative source.

## Verify the projection

Run the owning package checks and regenerate catalog projections after changing
canonical records:

```sh
pnpm generate
pnpm generate:check
pnpm check
```

Keep generated files reproducible. A documentation page should display the
canonical query result and executable source so API and examples cannot drift
silently.
