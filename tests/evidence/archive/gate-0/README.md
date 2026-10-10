# Gate 0 integration retained evidence

This directory retains the public-sanitized `E-GATE0-01` packet for the Gate 0
integration exit. The packet binds all 29 accepted G0.0 through G0.5 assertions
and proves one uninterrupted scaffold, validation, deterministic compilation,
installed-local resolution, API/CLI query, equivalent human/JSON/dense
rendering, revision explanation, deliberate source error, and repair path.

Run `node tests/evidence/capture-gate-0.mjs` from the exact committed capture
procedure revision. The capture writes a preliminary canonical Gate 0 index,
executes `pnpm check`, `pnpm check:all`, `pnpm generate:check`, and
`pnpm release:prepare`, then binds sanitized full command outputs into the final
content-addressed record. The applicability manifest covers all product inputs
and every retained upstream Gate 0 evidence directory, but excludes this
packet's own output directory to avoid a self-referential digest.

Rollback remains bounded to reverting the exact integration capture and
retained-evidence commits, keeping Gate 0 incomplete, retaining failed evidence
for diagnosis, preserving private packages, and prohibiting publication.
