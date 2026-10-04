# R1 exit retained publication evidence

Roadmap "R1 exit — React prerelease publication" requires `E-R1-EXIT-01` to
`E-R1-EXIT-04` for the exact `@muxui/react` candidate. This root retains them
from the `npm-publish.yml` dry-run and publish runs and from read-only registry
observations, captured by `node tests/evidence/capture-r1-exit.mjs`.

- `E-R1-EXIT-01`: the dry run's exact tarball, export, and install tuple.
- `E-R1-EXIT-02`: the release manifest and `verify-credentials` run before
  publish; any earlier failed publish attempt; the publish run's preflight and
  publish, with its own read-back recorded as an observation only; and the
  read-back proof from the registry (integrity, shasum, SLSA provenance bound to
  the source commit and publish run, dist-tags). It stays `partial` until both
  the publish run and the registry read-back are captured.
- `E-R1-EXIT-03`: a clean consumer installed from the registry's `next`.
- `E-R1-EXIT-04`: `next` and the observed `latest`, with the release
  manifest's rollback prepared, not exercised.

`artifacts/` holds the sanitized release manifest and the registry observation;
`validation/` holds sanitized job-log excerpts; `verification.json` binds them
to the unsanitized log, tarball, and manifest digests. The tarball is not
retained; its sha512, sha256, shasum, size, and file count are.

`latest` is set by the registry on first publish and is recorded as observed,
not claimed or promoted (Decision 0023). rc.1 makes no assistive-technology
claim (Decision 0022), and every item Decision 0022 defers to `S1.0` stays
unmet. These records do not claim the R1 exit is complete; merging the final
R1-exit pull request is Andrew's separate stop.
