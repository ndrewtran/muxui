# Decision 0023 amendment 01: Any number of release candidates in sequence

- Status: accepted user direction; repository adoption through a protected pull request
- Parent decision: [Decision 0023](./0023-rc1-dist-tag-and-rollback.md)
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0023:amendment:01`
- Amends by reference: Decision 0023 item 2, and the matching "only rc.1, or a
  fix-forward rc that replaces it" limit in the Roadmap R1 exit and Product
  Scope
- Accepted request: [acceptance record](./0023-amendment-01-release-candidate-sequence-acceptance.md)

## Gap

Decision 0023 and the R1 exit admit only `@muxui/react@0.1.0-rc.1`, or a
fix-forward rc that replaces it. A fix-forward rc follows deprecating a bad rc.
There is no way to publish rc.2 while rc.1 is not bad, and the text reads as a
limit of one replacement.

## Decision

1. **Any number of candidates.** R1 may publish any number of exact release
   candidates `0.1.0-rc.N`, in sequence, each to `next`. Each is the next
   number after the rc `next` points at. A new rc does not require the previous
   rc to be bad or deprecated.
2. **Each rc is a new exact candidate.** It has its own release preparation,
   `E-R1-EXIT-01` through `E-R1-EXIT-03` evidence, and publish authorization.
   The R1 exit and `E-R1-EXIT-04` apply to the current verified rc, the one
   `next` points at.
3. **Rollback is unchanged.** A bad rc is deprecated with `npm deprecate` and a
   message, then fixed forward with the next rc. Mux UI unpublishes only for a
   security or legal problem, with explicit authorization, inside npm's
   72-hour no-dependents window. Deprecating an rc that is superseded but not
   bad is not required, and needs its own authorization if wanted.
4. **`latest` is unchanged.** `latest` is not claimed. The only re-point
   remains Decision 0023 item 3, during a rollback, with Andrew's explicit
   authorization at the time. A sequence rc published without a rollback
   leaves `latest` where it is.
5. **Everything else is unchanged.** The version line stays `0.1.0-rc.N`.
   Stable promotion (`S1.0`) still owns every stable release and every other
   move of `latest`. Every other R1 exit condition stands, including install
   guidance that uses `@muxui/react@next` and Decision 0022's
   assistive-technology non-claim, which that decision states for an rc on
   `next`.

## Authority effect

The Roadmap R1 exit paragraph and the Product Scope
`SCOPE-PRODUCT-REACT-PRERELEASE` row are amended in the same change to state
the sequence, so the authority chain and this amendment agree. Architecture
states only the `latest` rule, which is unchanged, so it is not edited.
Decision 0023's own text is not rewritten. From this amendment onward, read its
fix-forward rc as one case of the sequence above.

The React `0.1` boundary keeps its version line, the `next` tag, and every
claim limit, and no family, Scope ID, commitment state, public API, package,
platform, or support or lifecycle claim changes. It does change the committed
prerelease rule: a later rc was admitted only as a fix forward of a deprecated
rc, and now any number of rcs may follow a healthy one. Product Scope takes a
major version for that, recorded as Product Scope `19.0.0`.

The release manifest, release preparation, the publish workflow, and the R1
exit capture tool own their own wording and update it separately. This
amendment edits none of them.

## Non-goals and preserved stops

This amendment does not publish a package, authorize any candidate, deprecate a
version, change a dist-tag, or unpublish. Each remains a separate external
mutation that needs its own authorization, and each rc needs its own publish
authorization. It does not claim `latest`, promote a stable release, or change
the final R1-exit pull-request merge stop. It claims no check result, evidence,
or release.

## Reversal

Reversal is append-only. A successor amendment may restore a limit on the
sequence. Published versions, retained evidence, and historical authority and
acceptance records are not rewritten.
