# One-time Tale migration reference

`donor-crosswalk.json` owns the 21 supplemental mappings admitted by Decision
0013 and the current disposition of all 125 pinned donor styles. Component
artifacts continue to own public API, anatomy, states, and examples. The current
React union is the historical 53 families plus these 21 mappings: 72 root
exports and the isolated TextEditor and Markdown subpaths.

The recorded Git blobs and content digests were checked against the clean,
pinned donor once. Normal Mux generation and verification consume these owned
records without a Tale checkout, package, network request, or synchronization
step. Foundation and style records describe reference provenance, not source
dependencies.

The 53 retained style records include shared support; that number is not a
second component inventory. Group and TokenField retain explicit reasons for
having no corresponding donor fixture. The three Markdown support styles do
not create public Blockquote, Code, or CodeBlock exports. The 46 exclusions
remain outside this accepted React Aria scope.

These records describe the initial transfer. They do not require future Mux
components or themes to remain equal to Tale. Current component artifacts own
Mux API, anatomy, states, and examples; normal generation and tests follow
those Mux contracts.

## Migration verification

The initial pass uses source comparison, representative light/dark visual
review, and meaningful interaction checks alongside ordinary Mux tests,
Storybook, Scale, and consumer builds. Material adaptations and limitations
belong in the migration report. `differences.json` records the initial reasons
for deliberate adaptations, rather than a permanent approval list for Mux
changes.

The scripts under `apps/react-storybook/visual-migration/` and the finite
capture runner are optional diagnostic tools for the pinned donor. Their
fixtures, reports, and any historical evidence are migration references.
Normal Mux generation and CI do not require fresh Tale captures, exhaustive
per-property classifications, or strict screenshot replays. Preserve existing
historical evidence rather than updating it to match new Mux designs.
