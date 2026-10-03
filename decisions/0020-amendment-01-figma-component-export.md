# Decision 0020 amendment 01: Figma component export

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0020](./0020-figma-token-export.md)
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0020-amendment-01-figma-component-export-acceptance.md)

## Decision

Extend Decision 0020's export-only Figma slice from tokens to components for
this named simple-control set, delivered in batches: `avatar`, `breadcrumbs`,
`button`, `button-group`, `checkbox`, `checkbox-field`, `checkbox-group`,
`color-swatch`, `file-trigger`, `icon-button`, `input`, `link`, `meter`,
`progress-bar`, `progress-circle`, `radio-field`, `radio-group`,
`search-field`, `select-native`, `separator`, `switch`, `switch-field`,
`tabs`, `tag-group`, `text`, `text-area`, `text-field`, `toggle-button`, and
`toggle-button-group`.

The first batch is the six pilot families: `button`, `checkbox`, `switch`,
`text-field`, `tabs`, and `tag-group`. Each later batch first moves that
batch's component dark overrides into mode-aware tokens, so every painted
part resolves through one token in every mode, then adds its anatomy.

The owner is the private workspace package `tooling/generators/figma`
(`@muxui/figma`), which is never published. As G3.5 describes for a
design-tool adapter, it owns only anatomy mappings and transport: per-family
anatomy records, browser measurement, the mode-consistency audit, the
component-spec compiler, a Plugin API applier, and a package-local CLI. It
renders through `@muxui/react`'s public entry and published stylesheet, uses
`@muxui/tokens` (including `@muxui/tokens/figma`) for token IDs, CSS names,
the token graph, and the export's plugin-data convention, and reads catalog
records for variant axes. It adds no second owner of
tokens, component metadata, or CSS.

Figma content remains a projection and never canonical (`SCOPE-NONGOAL-001`).
No generated spec or batch is committed. The applier creates, updates, and
reports orphans on its own tagged Components page. It never changes untagged
nodes or duplicated tagged copies, deletes only the glyph vectors it replaces,
and creates a separate page when an untagged page already uses the name.

Import, round-trip, proposals, Code Connect, complex families (collections,
composites, overlays, temporal and editor controls), motion, additional
themes, and pruning stay outside this amendment and keep their G3.5 or later
conditions.

## Scope and proof

Product Scope advances from `13.0.0` to `13.1.0` because this revises the
admitted design-tool items without changing a committed release. The Roadmap
records the addition and its evidence IDs: a deterministic spec, the
mode-consistency audit, binding coverage with documented literal exceptions
only, and applier idempotency against an in-memory Plugin API fake.

Andrew's instruction covers writing the six families' components to the
same file that Decision 0020 authorized for variables and styles (see the
acceptance record). Removing the pilot page, later batches' writes, and any
other Figma file need Andrew's separate, explicit direction. This amendment
adds no public package, surface, support claim, or release claim, and it
accepts no evidence.

## Removal

Delete `tooling/generators/figma` and its lockfile importer, then revert this
amendment's Roadmap, Product Scope, and README notes. A Figma Components page
produced by the applier is disposable and holds no canonical state.
