# Decision 0026 amendment 02: Category-name query expectations in block growth

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0026](./0026-blocks-showcase-admission.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0026:amendment:02`
- Accepted request: [acceptance record](./0026-amendment-02-category-name-queries-acceptance.md)

## Gap

Decision 0026 item 8 lets a further block join an existing category through an
ordinary pull request, and the Roadmap's `E-BL1-11` holds each such block to
thresholds "fixed before measurement". The BL1 evidence workflow reads that as:
a growth pull request never revises an existing block's expectation.

A category-name query, such as "collections", cannot hold that line. Every
block of the category scores the same for it, and equal scores sort by id. An
earlier block's rank for that query therefore depends on how many blocks share
the category, not on anything the earlier or the new block did wrong. The second
or third block in a category can push the first past an expectation written when
it was alone, and each such block would need its own decision.

## Decision

In a growth pull request that adds a block to a category, the expectations for
that category's name query may be revised for the category's existing blocks.
The category's name query is the query equal to the category's name in lower
case, such as `collections` for Collections or `call to action` for Call to
action. Only a category that gains a block in that pull request qualifies.

The revision:

1. is committed in `tests/evidence/bl1/regression-thresholds.json` in that pull
   request, before the main-only capture, so the capture measures a committed
   file;
2. is recorded in the capture's `thresholdChanges` (`E-BL1-11`);
3. is named in the pull request description, with the old and new expectation
   and the rank that prompted it; and
4. keeps an expectation on the query, and states a remaining weakness as a
   `knownWeakness`, so a known weak result stays visible and is not passed as a
   first-ranked one.

Every other existing expectation stays fixed and still needs a decision to
revise: component queries, every other discovery query, the precision floor,
the displacement and dense-budget limits, and an existing block's ranking
elsewhere. The new block's own entries are unchanged by this amendment: its
queries, expectations, seed-set id, and the `relevant` lists it joins are
written before any measurement of that block, and when the block fails an
expectation it wrote, the block changes.

The BL1 evidence tooling refuses a growth capture whose thresholds differ from
the retained close-out's by anything beyond this exception, the new block's own
entries, and the provenance text that records them.

## Authority effect

The Roadmap's `E-BL1-11` row and Product Scope's success-measures rule are
amended in the same change to state the exception, so the authority chain and
this amendment agree. Decision 0026's own text is not rewritten; this record is
the reference for the exception. On its own, the Product Scope edit is a
patch-level clarification, recorded as Product Scope `18.0.1`.

This amendment changes no scope, Scope ID, commitment state, release boundary,
package, platform, public surface, or support claim, and adds no block,
category, or threshold. A new category, an unadmitted component, or a boundary
change still needs a decision. It claims no check result, evidence, or
milestone completion.

## Non-goals and preserved stops

This amendment does not change `@muxui/react`, publish or deploy anything, or
claim assistive-technology support (Decision 0022). It does not let a growth
pull request revise a threshold to fit a measurement of the new block, or
revise any query that is not a gaining category's name query.

## Reversal

Reversal is append-only. A successor amendment may withdraw or widen the
exception. Retained `E-BL1-11` captures stay as the historical result against
the thresholds they bound. Historical authority and acceptance records are not
rewritten.
