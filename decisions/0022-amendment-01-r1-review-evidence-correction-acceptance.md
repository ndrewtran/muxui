# Acceptance: Decision 0022 amendment 01

- Decision: `muxui:decision:0022:amendment:01`
- Parent decision: `muxui:decision:0022`
- Decision path: `decisions/0022-amendment-01-r1-review-evidence-correction.md`
- Acceptance path: `decisions/0022-amendment-01-r1-review-evidence-correction-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 October 2026
- Human acceptance: Andrew / `ndrewtran`: “go with your recommendation”

## Accepted direction

Andrew was told that the R1 exit rests on "logged check and review evidence",
that the check logs are retained, and that the five milestone pull requests
(#102, #105, #106, #107, and #108) have no hosted reviews: four descriptions
claim a local independent review that was never retained, and #105 claims
none. He was given options and a recommendation, option 3. Option 3 had
four parts:

- Run retroactive independent reviews of the current code for the R1.2,
  R1.3, and R1.4 families, and retain their results as evidence.
- Accept R1.1 and R1.5 for the rc boundary with their review recorded as
  author-reported only, with no retroactive review.
- Correct Decision 0022's premise in a small amendment.
- Land fixes for the review findings in a separate pull request, and keep
  manual and assistive-technology testing deferred to `S1.0`.

Andrew answered:

> go with your recommendation

This accepts the recommendation: the four parts above, the retained review
evidence, the author-reported treatment of R1.1 and R1.5 review, and the
Roadmap and Product Scope changes that apply it. The Product Scope version
was a separate, later selection, recorded below. This answer keeps every
`S1.0` deferral and authorizes no publication, dist-tag change, or final
R1-exit merge.

## Later selections

Each item below quotes the option Andrew selected on 4 October 2026. Any
reasoning attached to it is the recommendation he accepted, not his words.

- **R1.3 collections finding L3.** While the fixes were built, asked how a
  read-only `Select` should behave, Andrew selected "Keep it browsable
  (Recommended)". The finding is accepted unfixed.
- **Version.** Andrew selected "Major, 14.0.0 (Recommended)". The
  recommendation's reasoning: the amendment materially changes what
  satisfies a committed release-acceptance condition, because the R1.1 and
  R1.5 reviews count as author-reported, which is not proof; it follows the
  13.0.0 precedent for amending the R1.1 through R1.5 exit rules; and
  accepting those unretained author claims is an explicit exception, for
  R1.1 and R1.5 only, to the rule that a transient log cannot satisfy an
  exit.
- **R1.2 finding L5 and R1.4 finding M7.** Andrew selected "Accept both,
  track to S1.0 (Recommended)". The recommendation: accept them for rc.1 as
  known limitations, L5 being that the Autocomplete dismiss fix's blur check
  is proven only in Chromium and M7 that focus falls to body when the element
  that opened a Dialog unmounts while it is open, and track both to `S1.0`.
- **Merge.** For the fixes and evidence pull requests, Andrew said:

  > merge when green

- **R1.3 pickers finding F10.** The root agent first left the colour
  callback string format unchanged as its own call, without asking Andrew.
  When asked afterwards, Andrew selected "Accept, document format
  (Recommended)". The recommendation: keep the CSS colour strings the
  callbacks emit for rc.1, document the format in the colour catalog
  records, and record the finding as accepted by him. Each colour catalog
  record states its control's emitted format.

The four findings are recorded `accepted-unfixed` with Andrew / `ndrewtran`
as `acceptedBy` in `tests/evidence/r1-retro-review`.

This record does not claim that any check or review passed, that a finding
was fixed, that a pull request was opened or merged, or that a package was
published.
