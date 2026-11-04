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
| `E-P2.1-02` | `pass` |
| `E-P2.1-03` | `pass` |
| `E-P2.1-04` | `pass` |
| `E-P2.1-05` | `pass` |
| `E-P2.1-06` | `pass` |

`E-P2.1-05` passes with a part that does not apply: Hosted or latest data stays advisory. Tooling at the source revision has no reader of hosted or latest catalog data, so the clause has nothing to apply to and no test of it exists. The capture checks this from the source: the command registry lists only the commands and options retained here and refuses to load with any other, the resolver takes a catalog only from the installed project or an explicit local cache, the source holds no network client, and its only child process is `pnpm list`. Supporting context, not a test of the clause: a response read from the catalog package bundled with tooling, with no installed project, is labelled `authority: advisory` and `compatibility: unresolved`.

Each record's `parts` splits the Roadmap assertion into clauses and gives each a state:
`shown`, `limited` (a narrower or indirect form, with a note), `not-met`, `not-shown`, or
`not-applicable` (the clause has nothing to apply to at the source revision, which the capture
checks). A record is `pass` only when every part that applies is shown, and `partial` otherwise.
A cited test is a passing line in the sanitized excerpt of the CI job that ran it, at the release
commit; capture fails if a cited line is missing. `limits` lists what the retained
evidence does not show.

One test, added after the release, ran in pull request CI run 41768320064 (attempt 1) at head `18fc6200bda898108467e11bd186e385e95af760`: the job checked out the merge `938c2f34a81c091eab00b1e2c6f7228d71aa56df`, whose tree is the head's. The resolver source (`packages/tooling/src`, `packages/catalog/src`, `packages/schema/src`) is unchanged between the release commit and that head. The `E-P2.1-02` row of the Roadmap was amended after the release to name the dense-output ceiling; that record is judged against the amended row.

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
