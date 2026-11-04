# R1 exit retained publication evidence for 0.1.0-rc.5

Decision 0023 amendment 01 admits any number of release candidates in sequence.
Each is a new exact candidate with its own `E-R1-EXIT-01` to
`E-R1-EXIT-03` evidence; the Roadmap R1 exit and `E-R1-EXIT-04` then apply to
the current verified rc, the one `next` points at. This root retains them for
`@muxui/react@0.1.0-rc.5` from the `npm-publish.yml` dry-run and publish runs
(npm trusted publishing) and from read-only registry observations, captured by
`node tests/evidence/capture-r1-exit.mjs --version=0.1.0-rc.5`. Earlier candidates keep their own
roots, which this capture never rewrites.

- `E-R1-EXIT-01`: the dry run's exact tarball, export, and install tuple,
  with any failed earlier attempt of the same run disclosed.
- `E-R1-EXIT-02`: the release manifest; any earlier failed publish attempt;
  the publish run's read-only preflight (version absent, prior `latest` and
  `next` recorded), drift recheck, and publish, with its own read-back
  recorded as an observation only; and the read-back proof from the registry
  (integrity, shasum, SLSA provenance bound to the source commit and publish
  run, dist-tags). It stays `partial` until both the publish run and the
  registry read-back are captured.
- `E-R1-EXIT-03`: a clean consumer installed from the registry's `next`.
- `E-R1-EXIT-04`: `next` is the candidate and `latest` is unchanged from
  the publish run's preflight, with the release manifest's rollback prepared,
  not exercised.

`artifacts/` holds the sanitized release manifest and the registry observation;
`validation/` holds sanitized job-log excerpts; `verification.json` binds them
to the unsanitized log, tarball, and manifest digests. The tarball is not
retained; its sha512, sha256, shasum, size, and file count are.

`latest` is not moved by this publish and is recorded as observed, not claimed
or promoted (Decision 0023). 0.1.0-rc.5 makes no assistive-technology claim
(Decision 0022), and every item Decision 0022 defers to `S1.0` stays unmet.
These records do not claim the R1 exit is complete; merging the final R1-exit
pull request is Andrew's separate stop.

The dry run relied on main CI run 41752399564 (attempt 1) for this commit's check graph and ran generation, `generate:check`, and `release-prepare.mjs` itself. The publish run promoted `npm-candidate` artifact 13287129099 of dry run 41753792194 attempt 1 and did not prepare its own. Storybook's own-interface colour proofs are not release proof (Decision 0030).

This candidate came from the portfolio workflow (Decision 0032): release `muxui-portfolio:40dcc0032b7db3a47e19797d4e73bc9d` also prepares `@muxui/schema@0.6.0-rc.1`, `@muxui/catalog@2.1.0-rc.1`, `@muxui/tooling@1.1.0-rc.1`. Their tarball digests and workflow read-backs are retained under `portfolio` in `E-R1-EXIT-01` and `E-R1-EXIT-02`; they are not R1 exit claims. The publish run published the set in order, each package preflighted, rechecked, and read back before the next, and the portfolio manifest sha256:03a9061dd2332e2919c7dbf5fff5dafd855497a011c7521003b275770964a3f4 binds all of it. The publish run had no environment approval (Decision 0033); the exact authorization for the publish (Decision 0028 item 6) is not observable from hosted data. The trusted publishers of @muxui/schema, @muxui/catalog, and @muxui/tooling are not yet set up and tokenless publishing is unproved for them; the provenance of their token publish proves neither (Decision 0032 item 10). On the registry, `latest` points at the rc of each of them; it is observed, not claimed.
