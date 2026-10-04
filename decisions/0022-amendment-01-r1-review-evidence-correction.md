# Decision 0022 amendment 01: R1 review evidence correction

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0022](./0022-rc1-assistive-technology-non-claim.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0022:amendment:01`
- Accepted request: [acceptance record](./0022-amendment-01-r1-review-evidence-correction-acceptance.md)

## Corrected premise

Decision 0022 says R1.1 through R1.5's recorded checks and reviews exist as CI
check and review logs. The check logs existed and are now retained under
`tests/evidence/r1.1` through `tests/evidence/r1.5`. The review logs do not
exist: pull requests #102, #105, #106, #107, and #108 have no hosted reviews
or review comments, as each retained pull-request observation records. Four
of those descriptions (#102, #106, #107, and #108) claim a local independent
frozen-diff review that was never retained, and #105 claims no review. Where
Decision 0022 states that review logs exist, read this amendment instead,
including its table cells "Browser and axe matrix, plus review" for
`E-R1.3-04` and "Package tests, release preparation, Chrome 151 interaction
and axe matrix, independent review" for `E-R1.4-04`: neither review was
hosted or retained. Decision 0022's text is not rewritten.

## Decision

The R1 exit condition that R1.1 through R1.5 are complete for the rc
prerelease boundary on logged check and review evidence is met as follows:

| Milestone | Check evidence | Review evidence |
| --- | --- | --- |
| R1.1 | Retained, `tests/evidence/r1.1` | Author-reported only (PR #102); accepted for the rc boundary, not proof |
| R1.2 | Retained, `tests/evidence/r1.2` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.3 | Retained, `tests/evidence/r1.3` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.4 | Retained, `tests/evidence/r1.4` | Retained retroactive review, `tests/evidence/r1-retro-review` |
| R1.5 | Retained, `tests/evidence/r1.5` | Author-reported only (PR #108); accepted for the rc boundary, not proof |

The retroactive reviews examined the current code at commit `81e4c7bc`, not
the original pull requests. Four read-only reviewer agents, using a different
model and harness from the Codex automation that produced the code, covered
the R1.2, R1.3, and R1.4 families in four lanes with five lenses: authority
and scope, renderer behaviour, catalog and generation, proof, and release
integrity. Every lane reported findings, including high-severity defects. A
`findings` verdict is not a pass. The review condition for R1.2 through R1.4
is met only when every retained finding records its resolution: a merged fix
commit from the separate fixes pull request (#204), or an explicit reason
accepted by Andrew, the decision owner. Only the decision owner may accept a
finding unfixed, and each accepted finding records who accepted it.

PR #106's author-reported review ("no actionable findings") is contradicted
at its own head, `bfd07018`: the R1.3 collections lane found its high
findings H1, H2, and H3, and medium findings M1 and M2, present there.
Separately, the current code at `81e4c7bc`, about 60 renderer commits after
#107 merged, had 38 findings, 8 of them high, in the #106 and #107 families;
whether the rest existed at those pull requests' heads was not checked. The
one author-reported review claim that could be checked was therefore wrong,
and R1.1 and R1.5 are accepted on claims of the same form. That acceptance
of an unretained author claim is an explicit exception, for R1.1 and R1.5
only, to the rule that a transient log cannot satisfy an exit.

R1.5's generated evidence status moves from `logged-not-retained` to
`checks-retained-review-author-reported`, with this amendment as its basis.
Its review is never described as retained.

## Superseded evidence

Any pull request #202 record with outcome `pass` that a retained review
finding contradicts is superseded for the contradicted part by that finding
and the fix that resolved it. #202's records are not edited. The main ones:

- `E-R1.2-02` cites two tests that do not prove its claim: "R1.2 form
  controls support controlled callbacks, keyboard-compatible input, and
  submit/reset" never renders a controlled value, and "R1.2 CheckboxGroup
  owns option names for required FormData submission" checks only an
  attribute while `required` was not enforced. Superseded by R1.2 findings H2
  and M7 and #204's "R1.2 form controls follow controlled values and
  submit/reset through FormData" and "R1.2 CheckboxGroup owns option names
  and enforces required FormData submission".
- `E-R1.3-03` (selection, form, and composition behavior). Superseded by R1.3
  collections findings H1, H2, and H3 and pickers findings F2 and F3, and
  #204's "R1.3 GridList, Tree, and Table select on press and Enter while
  nothing is selected", "R1.3 TokenField keeps typed text beside tokens and
  reports only token changes", "R1.3 ComboBox selects, filters, submits, and
  keeps disabled and read-only items inert", and "R1.3 named RadioGroup and
  Slider submit their values and restore defaults on reset".
- `E-R1.4-02` (overlay, focus, and dismissal behavior). Superseded by R1.4
  findings H1, M1, M2, and M6, and #204's "PreviewTrigger leaves focus in
  place when its preview opens and lets Tab move in", "nonmodal Popover
  dismisses on outside press and trigger Escape only when dismissable",
  "Popover dismissable false rejects hidden dismiss buttons and trigger
  toggles", and "Dialog dismissable false still closes through explicit close
  actions".
- `E-R1.4-03` (temporal, announcement, and concurrency behavior). Superseded
  by R1.4 findings H2, H3, and L4, and #204's "keyboard Toast dismissal moves
  focus to the next toast, then back to the page", "declarative Toast updates
  in place across parent renders without re-enqueueing", and "Toast rejects
  maxVisible below one and durations setTimeout cannot honor". The behavior
  its cited test "ToastProvider normalizes zero maxVisible so toasts still
  auto-dismiss" proved was reversed: `maxVisible` below one now throws.

The replacement tests ran in #204's CI. They are not themselves retained
evidence.

## Unchanged

Everything Decision 0022 defers to `S1.0` stays deferred: the `E-R1.1-04`
`DisclosureGroup` manual half (provisional), the manual and
assistive-technology half of `E-R1.2-03` and `E-R1.3-04`, `E-R1.4-04`, the
risk-profile half of `E-R1.5-03`, and the risk-class declaration for every
exported component. The retroactive reviews included no manual or
assistive-technology testing. rc.1 still claims no assistive-technology
support, and every existing accessibility check stays required.

## Authority effect

This materially changes what satisfies a committed release-acceptance
condition, because the R1.1 and R1.5 reviews now count as author-reported,
which is not proof. Product Scope therefore records it under the `14.0.0`
major version, following 13.0.0's treatment of Decision 0022's exit-rule
amendment. It adds no Scope ID and changes no package, platform, support
claim, or non-goal. The Roadmap's R1 exit entry and Product Scope's
release-acceptance bullet are reworded to match.

Andrew accepted two known limitations for rc.1, both to be tracked as
`S1.0` items: R1.2 finding L5 (the Autocomplete dismiss fix's blur check is
proven only in Chromium) and R1.4 finding M7 (focus falls to body when the
element that opened a Dialog unmounts while it is open).

This amendment does not publish, change a dist-tag, authorize the final
R1-exit merge, or claim that any check or review passed.

## Reversal

Reversal is append-only. A later amendment may replace the author-reported
R1.1 or R1.5 review with retained review evidence. Historical records are not
rewritten.
