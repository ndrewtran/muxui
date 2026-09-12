# Decision 0012: Mux UI identity reset

- Status: accepted
- Decision owner: Andrew / `ndrewtran`
- Proposed decision: `muxui:decision:0012`

## Decision

The pre-publication product identity is reset from Core UI to Mux UI.

The accepted instruction sequence is preserved exactly:

> Rename the project from core-ui (Core UI) to mux-ui (Mux UI).

Andrew then corrected the machine identity because the first package name was
unavailable:

> mux-ui package name is taken, use muxui instead

The resulting current display and machine identities are `Mux UI` and `muxui`.
The target repository locator is `ndrewtran/muxui`; workspace and package
names use `@muxui/*`; active ArtifactRef, schema, and decision namespaces use
`muxui:`; the CLI command and binary are `muxui`; and public CSS roots,
custom properties, layers, and data hooks use `.muxui-*`, `--muxui-*`, and
`data-muxui-*`.

This is a pre-first-publication clean identity reset. No compatibility aliases
or dual names are admitted because no public npm release exists. Historical
decisions, acceptance records, retained evidence, pinned external inputs, and
historical URLs remain unchanged. Current source, renderer, package, tooling,
Storybook and visual projections adopt the final `muxui` identity;
the checkout's outer directory is not renamed.

Product Scope advances major from `6.0.4` to `7.0.0`. Existing `SCOPE-*` IDs,
commitments, the 53-family React inventory, milestone boundaries, platform
deferrals, React Aria/styling/Lucide/temporal decisions, and release stops remain
unchanged. Only their owned current product, package, repository, and public
name references are updated. Historical provenance is not rewritten.

This decision does not itself publish a package, rename the hosted repository,
mutate a consumer or production system, or change any external service. Its
repository implementation remains subject to the ordinary protected pull
request workflow.

## Reversal

Any future identity change is append-only and requires a successor accepted
decision. It cannot rewrite this record or the immutable historical records.
