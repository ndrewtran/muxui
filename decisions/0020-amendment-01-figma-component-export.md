# Decision 0020 amendment 01: Figma component export

- Status: accepted user direction; edited to say what is still true (Decision 0027, Decision 0028)
- Parent decision: [Decision 0020](./0020-figma-token-export.md)
- Decision owner: Andrew / `ndrewtran`
- Accepted request: [acceptance record](./0020-amendment-01-figma-component-export-acceptance.md)

## Decision

Extend Decision 0020's export-only Figma slice from tokens to components,
delivered in batches. A component is eligible for the export by criteria, not
by name. It must have:

1. an anatomy that the export's anatomy mappings support;
2. finite variants;
3. mode-aware tokens, so that every painted part resolves through one token in
   every mode (a batch first moves its components' dark overrides into
   mode-aware tokens, then adds their anatomy); and
4. passing export audits: the mode-consistency audit and binding coverage with
   documented literal exceptions only.

The owner is the private workspace package `tooling/generators/figma`
(`@muxui/figma`), which is never published. As G3.5 describes for a
design-tool adapter, it owns only anatomy mappings and transport: per-family
anatomy records, browser measurement, the mode-consistency audit, the
component-spec compiler, a Plugin API applier, and a package-local CLI. It
renders through `@muxui/react`'s public entry and published stylesheet, uses
`@muxui/tokens` (including `@muxui/tokens/figma`) for token IDs, CSS names, the
token graph, and the export's plugin-data convention, and reads catalog records
for variant axes. It adds no second owner of tokens, component metadata, or CSS.

Figma content remains a projection and never canonical (`SCOPE-NONGOAL-001`).
No generated spec or batch is committed. The applier creates, updates, and
reports orphans on its own tagged Components page. It never changes untagged
nodes or duplicated tagged copies, deletes only the glyph vectors it replaces,
and creates a separate page when an untagged page already uses the name.

Import, round-trip, proposals, Code Connect, motion, additional themes, and
pruning stay outside this amendment and keep their G3.5 or later conditions.
Complex families (collections, composites, overlays, temporal and editor
controls) stay outside until the anatomy mappings support them.

## Scope and proof

The Roadmap records the addition and its evidence IDs: a deterministic spec,
the mode-consistency audit, binding coverage with documented literal
exceptions only, and applier idempotency against an in-memory Plugin API fake.

Writing to any Figma file needs Andrew's explicit authorization for that file.
His instruction covers writing the first batch's six pilot families (`button`,
`checkbox`, `switch`, `text-field`, `tabs`, and `tag-group`) to the file that
Decision 0020 authorized for variables and styles (see the acceptance record).
Removing the pilot page, later batches' writes, and any other Figma file need
his separate, explicit direction. This amendment adds no public package,
surface, support claim, or release claim, and it accepts no evidence.

## Removal

Delete `tooling/generators/figma` and its lockfile importer, then revert this
amendment's Roadmap, Product Scope, and README notes. A Figma Components page
produced by the applier is disposable and holds no canonical state.
