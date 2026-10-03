# Acceptance: Decision 0022

- Decision: `muxui:decision:0022`
- Decision path: `decisions/0022-rc1-assistive-technology-non-claim.md`
- Acceptance path: `decisions/0022-rc1-assistive-technology-non-claim-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 3 October 2026 (non-claim); 4 October 2026 (evidence deferral)

## Accepted direction

Andrew's instruction for this work was:

> i want to get Mux UI ready for pre-release publication soon

He was then asked:

> Product Scope expects assistive-technology (screen reader) evidence where a
> component's risk calls for it. rc.1's compatibility profile currently claims
> none. Which way for rc.1?

He chose "rc.1 makes no AT claim (Recommended)". The option read:

> Record explicitly that rc.1 on `next` claims no assistive-technology
> support; gather AT evidence before a stable release.

On 4 October 2026 he was asked:

> R1.4 was marked complete without its required manual/screen-reader evidence
> (E-R1.4-04). How should rc.1 handle it?

He chose "Amend honestly for the prerelease (Recommended)". The option read:

> Record E-R1.4-04 as unmet and deferred to stable; amend R1.4's exit so
> prerelease rc on `next` may export these components with screen-reader
> support explicitly unproved and not claimed (Decision 0022). No 'complete'
> claim rests on missing evidence. Screen-reader evidence becomes a
> requirement before stable.

He was then asked:

> Apply the R1.4 treatment (recorded unmet, deferred to stable, prerelease
> clause) to E-R1.3-04, the manual half of E-R1.2-03, the risk-profile half
> of E-R1.5-03, and DisclosureGroup's E-R1.1-04 manual half, and widen
> Decision 0022's stable list to all those components?

He chose "Yes, all of them (Recommended)". The option read:

> Same honest treatment as R1.4, in the rulings PR; the stable-release list
> names every component above.

He was later asked:

> R1.1–R1.5 evidence exists only in CI logs (expiring ~23 Nov), and the
> roadmap says logs can't satisfy an exit. How should the rulings PR word R1
> completion?

He chose "Capture logs before the rc.1 cut (Recommended)". The option read:

> Word it 'complete for the rc prerelease boundary on its logged evidence,
> which must be captured into retained evidence before the R1 exit';
> capturing the logs (already planned in the manifest PR) becomes a required
> step before cutting rc.1.

These choices authorize the narrowed support claim and the deferral of
`E-R1.1-04` (DisclosureGroup's manual half, provisional), `E-R1.2-03`'s manual
and assistive-technology half, `E-R1.3-04`, `E-R1.4-04`, and `E-R1.5-03`'s
risk-profile half recorded in Decision 0022, the logged-evidence completion
wording, and log capture as a required step before the rc.1 cut. They keep
every existing accessibility check and authorize no publication or dist-tag
change.

This record does not claim that checks or independent review passed, that a
pull request was opened or merged, or that a package was published.
