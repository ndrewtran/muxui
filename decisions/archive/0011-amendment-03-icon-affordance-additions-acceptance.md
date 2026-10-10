# Acceptance: Decision 0011 amendment 03

- Decision: `muxui:decision:0011:amendment:03`
- Decision path: `decisions/0011-amendment-03-icon-affordance-additions.md`
- Acceptance path: `decisions/0011-amendment-03-icon-affordance-additions-acceptance.md`
- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 3 October 2026

## Accepted direction

Andrew's instruction for this work was:

> i want to get Mux UI ready for pre-release publication soon

He was then asked:

> Tabs uses Lucide chevron icons, but Tabs isn't on the approved list of
> components allowed to use Lucide. How should rc.1 handle it?

He chose "Admit Tabs via amendment (Recommended)". The option read:

> Small authority amendment adding Tabs' chevrons to the approved Lucide use;
> the internal Lucide dependency and notices already exist.

On 4 October 2026 he was asked:

> Disclosure also renders a Lucide chevron outside the approved list. How
> should rc.1 handle it?

He chose "Admit like Tabs (Recommended)". The option read:

> Add Disclosure's chevron-down to the same Lucide amendment, with the
> label/decorative test.

He was also asked:

> Amend the Architecture document's two passages (approved Lucide list; 'No
> latest tag') to match your rulings, in the same PR?

He chose "Yes, amend in this PR (Recommended)". The option read:

> Minimal Architecture edits that mirror the Tabs/Disclosure Lucide admission
> and the 'no latest claimed or promoted' rule; recorded in the same
> decisions.

He was later asked:

> CheckboxField uses Lucide `check` and `minus` icons (Checkbox itself is
> already approved). How should rc.1 handle it?

He chose "Admit like Tabs/Disclosure (Recommended)". The option read:

> Add CheckboxField's decorative check and minus to the same Lucide
> amendment, with the label/decorative test.

He was then asked:

> Does your approval to amend the Architecture doc also cover the two later
> rulings (CheckboxField's icons and the authorized `latest` re-point during a
> fix-forward)?

He chose "Yes, include both (Recommended)". The option read:

> Architecture mirrors all the rc.1 rulings: seven admitted icons and the
> latest rule with its fix-forward exception. I'll quote this answer in the
> records.

These choices authorize admitting the four existing `Tabs` overflow chevrons,
the `Disclosure` chevron, and the `CheckboxField` check and minus recorded in
the amendment, and an Architecture edit naming all seven icons. They
authorize no other dependency or version change.

This record does not claim that checks or independent review passed, that a
pull request was opened or merged, or that a package was published.
