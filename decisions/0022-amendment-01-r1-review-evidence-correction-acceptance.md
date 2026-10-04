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
none. He was given options, and the recommendation was option 3:

1. Run retroactive independent reviews of the current code for the R1.2,
   R1.3, and R1.4 families, and retain their results as evidence.
2. Accept R1.1 and R1.5 for the rc boundary with their review recorded as
   author-reported only, with no retroactive review.
3. Correct Decision 0022's premise in a small amendment.
4. Land fixes for the review findings in a separate pull request, and keep
   manual and assistive-technology testing deferred to `S1.0`.

Andrew answered:

> go with your recommendation

This accepts the four parts above, the retained review evidence, the
author-reported treatment of R1.1 and R1.5 review, and the matching Roadmap
and Product Scope wording. It keeps every `S1.0` deferral and authorizes no
publication, dist-tag change, or final R1-exit merge.

This record does not claim that any check or review passed, that a finding
was fixed, that a pull request was opened or merged, or that a package was
published.
