# G0.3 CLI documentation baseline evidence

This directory retains the public-sanitized evidence packets required by the
G0.3 roadmap milestone:

- `E-G0.3-01`: public API and CLI surface-parity matrix.
- `E-G0.3-02`: JSON, human, and dense cross-renderer golden corpus.
- `E-G0.3-03`: dense token-count report for every command and detail level.
- `E-G0.3-04`: authored registry and generated-surface consistency report.
- `E-G0.3-05`: stable error-schema, diagnostic-safety, and exit-status report.
- `E-G0.3-06`: cold-start manifest, discovery, and retrieval smoke transcript.

Regenerate the packets with `node tests/evidence/capture-g0.3.mjs`, then run
the deterministic workspace verification commands recorded in every packet.
The applicability manifest makes the retained result stale whenever its owned
source, generated projections, or capture definition changes.
