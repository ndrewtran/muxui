# Decision 0023: rc.1 `latest` dist-tag and first-publish rollback

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0023`
- Accepted request: [acceptance record](./0023-rc1-dist-tag-and-rollback-acceptance.md)

## Context

The R1 exit rule said rc.1 is published to `next` with no `latest` tag. The
npm registry cannot satisfy that rule. A package's first publish always sets
`latest`, whatever `--tag` is used, and `latest` can be moved but not deleted.
An npm CLI contributor confirmed this in
[npm/cli#8490](https://github.com/npm/cli/issues/8490). A read-only registry
scan agreed: all 240 prerelease-only packages sampled had `latest`. In 208 of
them, `next` or `beta` and `latest` pointed at the same single version.

The R1 exit rollback plan restored a prior verified `next` pointer. A first
publish has no prior pointer to restore.

## Decision

1. **`latest` is not claimed.** `@muxui/react@0.1.0-rc.1` is published with
   `--tag next`. If rc.1 is the first publish, the registry sets `latest` to
   rc.1. If an alpha is published first, `latest` points at that alpha
   instead; the package is not on the registry yet. Apart
   from the rollback re-point in item 3, Mux UI neither claims nor promotes
   `latest`, and no stable release is promoted. Documentation and install
   instructions use `@muxui/react@next` until a stable release moves `latest`.
2. **Rollback is deprecate and fix forward.** If rc.1 is bad, deprecate it
   with `npm deprecate` and a message, then publish a fixed `0.1.0-rc.2`. The
   deprecation needs its own authorization. A fix-forward `rc.N+1` is a new
   exact candidate with its own release preparation, `E-R1-EXIT-01` through
   `E-R1-EXIT-03` evidence, and publish authorization. The R1 exit and
   `E-R1-EXIT-04` then apply to the current verified rc. Mux UI unpublishes
   only for a security or legal problem, with explicit authorization, inside
   npm's 72-hour no-dependents window.
3. **`latest` may follow a fix forward.** During that rollback, `latest` may
   be re-pointed from the deprecated rc to the fixed rc, so a bare install
   does not get the deprecated version. This needs Andrew's explicit
   authorization at the time. It is not a stable promotion or a `latest`
   support claim.

## Authority effect

The R1 exit boundary changes from "no `latest` tag" to "no `latest` claim".
Stable promotion (`S1.0`) still owns every other deliberate move of
`latest`. `E-R1-EXIT-04` now verifies the `next` dist-tag and that `latest`
is not claimed anywhere, with the deprecate and fix-forward rollback
prepared, not exercised, instead of restoring a prior `next` pointer. A
dist-tag that drifts from the verified rc stops for a decision; no re-point
happens without authorization. `SCOPE-PRODUCT-REACT-PRERELEASE` stays `committed` and
no Scope ID is added. Product Scope takes a major version because the
committed React `0.1` release boundary is redefined. Architecture's R1
boundary is amended in the same change, with Andrew's approval quoted in the
acceptance record: the registry sets `latest` on first publish; apart from an
authorized rollback re-point to the fixed rc, no `latest` is claimed or
promoted; and no stable `0.1.0` release is authorized.

Every publish, deprecation, dist-tag change, and unpublish remains a separate
external mutation that needs its own authorization. This decision authorizes
none of them.

## Canonical statements

The `@muxui/react` generator owns the release manifest's publication
preparation and the generated README's install guidance. Release preparation
tooling owns its own rollback steps and updates them separately.

## Reversal

A later decision may change the rollback plan or the dist-tag policy.
Published versions and historical records are not rewritten.
