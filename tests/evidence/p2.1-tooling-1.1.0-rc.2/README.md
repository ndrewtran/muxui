# P2.1 retained evidence for `@muxui/tooling@1.1.0-rc.2`, a later portfolio release

**P2.1 completion is not claimed by this route or by any record in it.** The records evidence one release and
what it shows about the portfolio; whether P2.1 has met its exit condition is judged from the Roadmap, not from here.

Roadmap "P2.1 Public package graph and portfolio release" requires `E-P2.1-01` to `E-P2.1-06`. This route
retains them for the portfolio of release `muxui-portfolio:1adadbb095d9ebc1b63a0aae35c6a10c`, prepared and published from
`0cd44350e734c4ba6282654f06f2ca07c96879fa` (tree `6f8a0aac82bcd0e2b0a1f54e5c2f35aa929e8023`), captured by
`node tests/evidence/capture-p2.1.mjs --release=@muxui/tooling@1.1.0-rc.2 --dry-run-run=41787407523 --publish-run=41789992943 --prior-route=tests/evidence/p2.1 --capture-timestamp=<ISO-8601 UTC> --evidence ...`. It publishes `@muxui/tooling@1.1.0-rc.2` and reuses
`@muxui/schema@0.6.0-rc.1`, `@muxui/catalog@2.1.0-rc.1`, and `@muxui/react@0.1.0-rc.5` from the first portfolio release (`muxui-portfolio:40dcc0032b7db3a47e19797d4e73bc9d`, whose records are `tests/evidence/p2.1`).
Each reused package keeps the version, digest, and provenance that release recorded.

| Record | Outcome |
| --- | --- |
| `E-P2.1-01` | `pass` |
| `E-P2.1-02` | `pass` |
| `E-P2.1-03` | `pass` |
| `E-P2.1-04` | `pass` |
| `E-P2.1-05` | `pass` |
| `E-P2.1-06` | `pass` |

`E-P2.1-03` passes with a part that does not apply: The first portfolio release publishes all four. This release is not the first portfolio release: it publishes @muxui/tooling@1.1.0-rc.2 and reuses @muxui/schema@0.6.0-rc.1, @muxui/catalog@2.1.0-rc.1, and @muxui/react@0.1.0-rc.5. That the first release published all four is the evidence of tests/evidence/p2.1.

`E-P2.1-05` passes with a part that does not apply: Hosted or latest data stays advisory. Tooling at the source revision has no reader of hosted or latest catalog data, so the clause has nothing to apply to and no test of it exists. The capture checks this from the source: the command registry lists only the commands and options retained here and refuses to load with any other, the resolver takes a catalog only from the installed project or an explicit local cache, the source holds no network client, and its only child process is `pnpm list`. Supporting context, not a test of the clause: a response read from the catalog package bundled with tooling, with no installed project, is labelled `authority: advisory` and `compatibility: unresolved`.

`E-P2.1-06` passes with a part that does not apply: @muxui/react publishes through its configured trusted publisher, and the publish carries provenance. This release does not publish @muxui/react: it reuses @muxui/react@0.1.0-rc.5. Its publish through the configured trusted publisher is the evidence of tests/evidence/p2.1; the attestation of that publish was read from the registry again for this release (the read-back).

Each record's `parts` splits the Roadmap assertion (as it stands at the release commit) into clauses and gives each a state: `shown`,
`limited`, `not-met`, `not-shown`, or `not-applicable`. A record is `pass` only when every part that applies is shown. A cited test is a
passing line in the sanitized excerpt of the main CI job that ran it at the release commit (run 41786122448, attempt 1); capture fails
if a cited line is missing. `limits` lists what the retained evidence does not show.

This release has no R1 exit route: its dry run (41787407523) and publish run (41789992943) are read by the capture and retained here, as sanitized
excerpts under `validation/` and as the release manifest under `artifacts/release-manifest.json`. The manifest is the one the release built, with its
digest intact, and it is what the next release names as its prior release.

`E-P2.1-02` rests on a published-run phase: at 2026-11-04T07:45:44Z the four packages of this release's tuple were installed from the public registry
into a clean project outside the checkout and the installed `muxui` bin was run through the discovery matrix, the budget fixtures, an invalid-request
corpus, and the commands P2.1 does not enable (`tests/evidence/p2.1-tooling-1.1.0-rc.2/validation/published-muxui-output.txt`); 11 of 11 checks passed. This later release, not the first
release's `@muxui/tooling@1.1.0-rc.1`, is the one whose CLI reports its own version; the first release's tooling stays wrong.
`E-P2.1-06` rests on a prior-tuple phase: the first release's four packages installed again by exact version, its bin run once, every version it listed still
listed, and its manifest retained; 4 of 4 checks passed.

No Roadmap row of `E-P2.1-01` to `E-P2.1-06` was amended after the release commit, and no file the records cite changed after it (each record's `compared` block states
this and lists what differs from the first release's source revision).

The independent release-integrity review is retained as `tests/evidence/p2.1-tooling-1.1.0-rc.2/artifacts/release-integrity-review.md`, read by GPT-6.1 Sol, Codex at `214cb047219071286ca5c8fe1f311b6a2d15e603`. It is a pass.

The exact authorization to publish was given in chat and is recorded in `E-P2.1-06` as reported by the capture operator; the `npm-publish` environment had no
required reviewer (Decision 0033), so the publish run's approvals list is empty. `@muxui/tooling@1.1.0-rc.2` published by trusted publishing (OIDC). Andrew reported setting up
trusted publishers for `@muxui/schema` and `@muxui/catalog`, which cannot be observed from public data and which no publish has used, so tokenless publishing stays
unproved for them; unused trusted publishers lapse after 2 days (npm documentation, as given to this capture). These records do not claim P2.1 is complete, a stable
release, support, or any assistive-technology property.
