# Acceptance: Decision 0023

- Decision: `muxui:decision:0023`
- Decision path: `decisions/0023-rc1-dist-tag-and-rollback.md`
- Acceptance path: `decisions/0023-rc1-dist-tag-and-rollback-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 4 October 2026

## Accepted direction

Andrew's instruction for this work was:

> i want to get Mux UI ready for pre-release publication soon

He was then asked:

> npm will point `latest` at rc.1 on first publish. How should the R1 exit
> rule change?

He chose "Amend: no latest claimed (Recommended)". The option read:

> Rule becomes: rc.1 is published with --tag next; the registry sets latest
> on first publish; nothing claims or promotes latest, and docs/install
> instructions use @muxui/react@next until a stable release moves latest.

He was also asked:

> What should the first-publish rollback plan be?

He chose "Deprecate + fix forward (Recommended)". The option read:

> On a bad rc.1: npm deprecate it with a message and publish a fixed rc.2.
> Unpublish (72-hour window, no dependents) only for a security or legal
> problem, with your explicit authorization.

On 4 October 2026 he was asked:

> Amend the Architecture document's two passages (approved Lucide list; 'No
> latest tag') to match your rulings, in the same PR?

He chose "Yes, amend in this PR (Recommended)". The option read:

> Minimal Architecture edits that mirror the Tabs/Disclosure Lucide admission
> and the 'no latest claimed or promoted' rule; recorded in the same
> decisions.

He was later asked:

> If rc.1 is bad and we publish rc.2, may `latest` be moved from the
> deprecated rc.1 to rc.2?

He chose "Yes, with separate authorization (Recommended)". The option read:

> Only as part of a fix-forward, and only with your explicit OK at the time:
> re-point `latest` to the fixed rc so bare installs don't get the deprecated
> version. Still no stable promotion.

He was then asked:

> Does your approval to amend the Architecture doc also cover the two later
> rulings (CheckboxField's icons and the authorized `latest` re-point during a
> fix-forward)?

He chose "Yes, include both (Recommended)". The option read:

> Architecture mirrors all the rc.1 rulings: seven admitted icons and the
> latest rule with its fix-forward exception. I'll quote this answer in the
> records.

These choices authorize the dist-tag rule and rollback plan recorded in
Decision 0023, and an Architecture edit stating the `latest` rule with its
fix-forward exception. They authorize no publish, deprecation, dist-tag
change, `latest` re-point, or unpublish.

This record does not claim that checks or independent review passed, that a
pull request was opened or merged, or that a package was published.
