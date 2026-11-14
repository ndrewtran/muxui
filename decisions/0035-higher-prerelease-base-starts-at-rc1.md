# Decision 0035: A higher prerelease base starts at rc.1

- Status: accepted user direction; repository adoption through a protected pull request
- Decision owner: Andrew / `ndrewtran`
- Decision: `muxui:decision:0035`
- Amends: Decision 0023 amendment 01 item 1 and Decision 0032 item 6, only for the schema, catalog, and tooling packages, and only in the registry preflight's candidate rule
- Effective: on merge

## Gap

The schema contract moves to 4.0.0 and the query API to 3.0.0 in the pull request that adopts this decision. Release preparation requires the catalog to be a release of the query API major tooling reads (`assertCatalogRangeBound`, Decision 0032 item 8), so the next catalog candidate is `3.0.0-rc.1`. `@muxui/catalog@next` is `2.1.0-rc.1`.

The registry preflight, `classifyPreflight` in `tooling/audits/repository-policy/src/npm-publication.mjs`, admits a later candidate only as the next number after the rc `next` points at, on the same base version (Decision 0023 amendment 01 item 1, Decision 0032 item 6). It refused the catalog on purpose, with `Not the next candidate`: `3.0.0-rc.1 must be the next release candidate after next (rc.N+1); next points at 2.1.0-rc.1`. Its test said a new base version "is its own decision". So the release-candidate line could not move to a higher major, although Decision 0032 item 8 and `E-P2.1-05` already expect prerelease catalogs on different bases (`^2.1.0-rc.1` admits `2.1.0-rc.2` but not `2.2.0-rc.1`, so a higher base names its own comparator).

## Decision

1. **A strictly higher base starts at rc.1.** A candidate for a package that already has a published `next` may be the `rc.1` of a base version strictly higher than the base of `next`, compared as `X.Y.Z` by number per part. It sets `next` to that candidate and leaves `latest` where it is, as every later candidate does.
2. **The same-base rule is unchanged.** On the base of `next`, a candidate is still the next number after `next` (rc.N+1).
3. **Everything else still stops for a decision.** The preflight still refuses:
   - a lower or equal base outside the same-base rule;
   - a higher base that does not start at `rc.1`;
   - a version already on the registry or listed in the packument;
   - a package whose dist-tags are not exactly `latest` and `next`, or whose `next` or `latest` is not a published version;
   - a first publish that is not `rc.1`.
4. **`@muxui/react` keeps its `0.1.0` pin.** Its candidates stay `0.1.0-rc.N` (Roadmap R1 exit, Decision 0023 amendment 01), so the rule gives it no higher base.
5. **A candidate is still an rc of the source version.** `release-set.mjs` still requires each version to be `<source version>-rc.N`, so a package moves to a higher base by changing its source version first, as the catalog does with the query API major.

## Non-goals and preserved stops

This is a change to the release machinery only. It changes no version, contract, package, dist-tag, or published artifact, and it publishes nothing. Decision 0028's stop on publishing and its per-release-candidate authorization stand, as do Decision 0030's dry-run lineage, Decision 0033's rules, and the drift recheck, integrity and provenance read-back, and trusted publisher setup of Decision 0032 item 10. It adds no stable release, claims no `latest`, and adds no deprecate, unpublish, dist-tag, or owner command. Version-effect classification (`release-effects.mjs`) is unchanged.

## Authority effect

- **`tooling/audits/repository-policy/src/npm-publication.mjs`** changes the candidate rule in `classifyPreflight`, its comment, and the refusal message. It is a protected release file.
- **`.github/workflows/npm-publish.yml`** changes the preflight comment only. No step, condition, or permission changes. It is a protected release file.
- **The repository-policy README** states the rule.
- **Architecture** names query API `3.0.0` as the supported pre-release query API and "v3" as its behavior label, replacing `2.1.0` and "v2". The change follows the version bump in the same pull request.
- **Product Scope** takes patch `23.0.2`: the token-source retrieval line names query API `3.0.0` and its "v3" label. It changes no Scope ID, commitment state, release boundary, package, platform, public surface, or non-goal.
- **The pull request that adopts this decision** names it as its Authority change record for every authority file it changes, and carries the `type:decision` label.

## Acceptance

- Owner: Andrew / `ndrewtran`
- Outcome: Accepted user direction; repository adoption through a protected pull request
- Acceptance date: 9 November 2026

On how to unblock the catalog, which the query API move to 3.0.0 forces to publish as `3.0.0-rc.1` while the registry preflight refused a new base for an existing package, Andrew answered "Allow new base (Recommended)", whose option text was: "Add a short decision record and change the publish preflight so an existing package can start a higher base at rc.1 when the release check requires it. It goes in the contract-version PR."

This record does not claim that any release is prepared, that any check passed, or that any package, release candidate, or dist-tag changed.
