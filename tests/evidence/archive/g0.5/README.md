# G0.5 retained evidence

This directory retains the public-sanitized packets for `E-G0.5-01` through
`E-G0.5-04`. The artifacts cover the canonical authoring round trip, semantic
change and revision goldens, negative autofix policy, and schema-to-authoring
coupling with graph-derived affected closure.

Run `node tests/evidence/capture-g0.5.mjs` from the exact committed source
revision. The capture writes a preliminary G0.5 index, refreshes still-applicable
upstream Gate 0 assertions through separate append-only recertifications without
changing any historical evidence bytes, executes `pnpm check`, `pnpm check:all`,
`pnpm generate:check`, and `pnpm release:prepare`, then binds the validation
summary and sanitized full command outputs into the final content-addressed G0.5
records.

Rollback remains bounded to reverting the exact implementation and evidence
commits, retaining failed evidence for diagnosis, keeping all packages private,
and preserving the prohibition on automatic mutation or publication.
