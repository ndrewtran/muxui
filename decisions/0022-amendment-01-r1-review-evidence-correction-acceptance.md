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
Roadmap and Product Scope changes that apply it. It keeps every `S1.0`
deferral and authorizes no publication, dist-tag change, or final R1-exit
merge.

## Later rulings

On 4 October 2026, after the reviews and fixes, Andrew ruled:

- **Version.** Product Scope moves to `14.0.0`, a major version, because the
  amendment materially changes what satisfies a committed release-acceptance
  condition: the R1.1 and R1.5 reviews count as author-reported, which is not
  proof. This follows the 13.0.0 precedent for amending the R1.1 through R1.5
  exit rules. Accepting those unretained author claims is his explicit
  exception, for R1.1 and R1.5 only, to the rule that a transient log cannot
  satisfy an exit.
- **R1.3 collections finding L3.** A read-only `Select` stays browsable; no
  change.
- **R1.3 pickers finding F10.** The colour callback string format is
  unchanged.
- **R1.2 finding L5.** Accepted for rc.1 as a known limitation and tracked to
  `S1.0`: the Autocomplete dismiss fix's blur check is proven only in
  Chromium.
- **R1.4 finding M7.** Accepted for rc.1 as a known limitation and tracked to
  `S1.0`: focus falls to body when the element that opened a Dialog unmounts
  while it is open, with no Mux UI fallback target.

The four findings are recorded `accepted-unfixed` with Andrew as
`acceptedBy` in `tests/evidence/r1-retro-review`.

This record does not claim that any check or review passed, that a finding
was fixed, that a pull request was opened or merged, or that a package was
published.
