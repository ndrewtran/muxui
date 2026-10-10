# G0.4 retained evidence

This directory retains the public-sanitized packets for `E-G0.4-01` through
`E-G0.4-05`. The artifacts cover the synthetic multi-workspace resolver matrix,
ordered error taxonomy, negative integrity and compatibility paths,
installed-local query metadata, and privacy scan.

Run `node tests/evidence/capture-g0.4.mjs` from the exact committed
implementation revision. The capture refreshes still-applicable upstream Gate
0 packets, writes a preliminary canonical G0.4 index, executes `pnpm check`,
`pnpm check:all`, `pnpm generate:check`, and `pnpm release:prepare`, retains a
stable structured validation summary, and binds that summary into the final
content-addressed G0.4 records.

Rollback remains bounded to reverting the exact implementation and evidence
commits, retaining the failed evidence for diagnosis, keeping catalog and
tooling packages private, and preserving the publication prohibition.
