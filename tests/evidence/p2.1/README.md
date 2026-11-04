# P2.1 retained evidence for the first portfolio release

Roadmap "P2.1 Public package graph and portfolio release" requires `E-P2.1-01` to
`E-P2.1-06`. This root retains them for the portfolio of release
`muxui-portfolio:40dcc0032b7db3a47e19797d4e73bc9d` (`@muxui/schema@0.6.0-rc.1`, `@muxui/catalog@2.1.0-rc.1`, `@muxui/tooling@1.1.0-rc.1`, `@muxui/react@0.1.0-rc.5`), prepared and published from
`e8953dc6221306ea697739f1e4dea58ff49acc79` (tree `d6a85dad0d93998d9b245ce4429aab9359558c3f`), captured by
`node tests/evidence/capture-p2.1.mjs --version=0.1.0-rc.5`.

Nothing is rerun. Each record binds to what already ran at that commit: main CI run
41752399564 (attempt 1), dry run 41753792194, and publish run 41754361620. The React candidate's
R1 exit route `tests/evidence/r1-exit-0.1.0-rc.5` holds the dry run and publish excerpts and the React
registry observation, and this root cites them by path and digest.

| Record | Outcome |
| --- | --- |
| `E-P2.1-01` | `pass` |
| `E-P2.1-02` | `partial` |
| `E-P2.1-03` | `pass` |
| `E-P2.1-04` | `pass` |
| `E-P2.1-05` | `partial` |
| `E-P2.1-06` | `pass` |

`E-P2.1-02` is `partial` because `not-met`: Dense output is inside its token budget. `limited`: SCOPE-TRUST-CACHE-PROVENANCE: the resolver rejects catalog bytes whose integrity or provenance sidecar does not match, with MUXUI_CATALOG_INTEGRITY_MISMATCH.

`E-P2.1-05` is `partial` because `limited`: Hosted or latest data stays advisory.

Each record's `parts` splits the Roadmap assertion into clauses and gives each a state:
`shown`, `limited` (a narrower or indirect form, with a note), `not-met`, or `not-shown`.
A record is `pass` only when every part is shown, and `partial` otherwise. A cited test
is a passing line in the sanitized excerpt of the CI job that ran it, at the release
commit; capture fails if a cited line is missing. `limits` lists what the retained
evidence does not show.

`artifacts/` holds the registry read-back of all four packages; `validation/` holds the CI job
excerpts; `verification.json` binds them to the unsanitized log digests. The raw logs and
tarballs are not retained.

The independent release-integrity review is pending: a reviewer of a different model and harness from the authoring agents reviews the evidence and the release, and `--review=<file> --review-revision=<sha>` retains it and rebuilds the records with it.

The read-back lists every version of each package. `@muxui/schema`, `@muxui/catalog`, and `@muxui/tooling` each also list a `0.0.0-stage` placeholder version, observed in `E-P2.1-06` and not part of the release tuple; its origin is inferred, not proved.

The exact authorization to publish was given in chat and is recorded in `E-P2.1-06` as
reported by the capture operator; the `npm-publish` environment had no required reviewer
(Decision 0033), so the publish run's approvals list is empty. The three new packages
published with the temporary token, and that does not prove tokenless publishing for
them (Decision 0032 item 10, as amended). These records do not claim P2.1 is complete, a
stable release, support, or any assistive-technology property.
