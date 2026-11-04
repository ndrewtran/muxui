# P2.1 retained evidence for the first portfolio release

Roadmap "P2.1 Public package graph and portfolio release" requires `E-P2.1-01` to
`E-P2.1-06`. This root retains them for the portfolio of release
`muxui-portfolio:40dcc0032b7db3a47e19797d4e73bc9d` (`@muxui/schema@0.6.0-rc.1`, `@muxui/catalog@2.1.0-rc.1`, `@muxui/tooling@1.1.0-rc.1`, `@muxui/react@0.1.0-rc.5`), prepared and published from
`e8953dc6221306ea697739f1e4dea58ff49acc79` (tree `d6a85dad0d93998d9b245ce4429aab9359558c3f`), captured by
`node tests/evidence/capture-p2.1.mjs --version=0.1.0-rc.5`.

Nothing of the release is rerun. Each record binds to what already ran at that commit, apart from the published-run phase
described below: main CI run
41752399564 (attempt 1), dry run 41753792194, and publish run 41754361620. The React candidate's
R1 exit route `tests/evidence/r1-exit-0.1.0-rc.5` holds the dry run and publish excerpts and the React
registry observation, and this root cites them by path and digest.

| Record | Outcome |
| --- | --- |
| `E-P2.1-01` | `pass` |
| `E-P2.1-02` | `partial` |
| `E-P2.1-03` | `pass` |
| `E-P2.1-04` | `pass` |
| `E-P2.1-05` | `pass` |
| `E-P2.1-06` | `pass` |

`E-P2.1-02` is `partial` because `not-met`: Dense output is inside its token budget for the registry's budget fixtures (manifest, list, search, and get) at every detail level. Measured on the published tuple with the installed countTokens and the installed registry's budgets: 12 fixture counts, over budget: manifest --detail brief --dense 257 of 256. The source-version test passed in the release commit's CI against the source-version tuple. Against the published tuple these checks did not pass: dense-budget-fixtures.

`E-P2.1-05` passes with a part that does not apply: Hosted or latest data stays advisory. Tooling at the source revision has no reader of hosted or latest catalog data, so the clause has nothing to apply to and no test of it exists. The capture checks this from the source: the command registry lists only the commands and options retained here and refuses to load with any other, the resolver takes a catalog only from the installed project or an explicit local cache, the source holds no network client, and its only child process is `pnpm list`. Supporting context, not a test of the clause: a response read from the catalog package bundled with tooling, with no installed project, is labelled `authority: advisory` and `compatibility: unresolved`.

Each record's `parts` splits the Roadmap assertion into clauses and gives each a state:
`shown`, `limited` (a narrower or indirect form, with a note), `not-met`, `not-shown`, or
`not-applicable` (the clause has nothing to apply to at the source revision, which the capture
checks). A record is `pass` only when every part that applies is shown, and `partial` otherwise.
A cited test is a passing line in the sanitized excerpt of the CI job that ran it, at the release
commit; capture fails if a cited line is missing. `limits` lists what the retained
evidence does not show.

One test, added after the release, ran in pull request CI run 41768320064 (attempt 1) at head `18fc6200bda898108467e11bd186e385e95af760`: the job checked out the merge `938c2f34a81c091eab00b1e2c6f7228d71aa56df`, whose tree is the head's. The resolver source (`packages/tooling/src`, `packages/catalog/src`, `packages/schema/src`) is unchanged between the release commit and that head. The `E-P2.1-02` row of the Roadmap was amended after the release to name the dense-output ceiling; that record is judged against the amended row.

`E-P2.1-02` also rests on a published-run phase: at 2026-11-04T04:25:16Z the four released packages were installed from the public registry into a clean project outside the checkout, and the installed `muxui` bin was run through the discovery matrix, the budget fixtures, an invalid-request corpus, and the commands P2.1 does not enable (`tests/evidence/p2.1/validation/published-muxui-output.txt`). 9 of 10 checks passed. The packed-CLI tests of the release commit pack the source manifests' versions, and the records cite them as source-version supporting evidence.

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
