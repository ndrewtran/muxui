# P2.1 release-integrity follow-up review

**Reviewer:** GPT-6.1 Sol, Codex  
**Reviewed revision:** `cca758bc400317fb04b6a0d5f232d33a7b0845b5`  
**Prior reviewed revision:** `44afa8cd196d9a96e48e50f11b4193822635e598`  
**Date:** 4 November 2026  
**PR:** [#455](https://github.com/ndrewtran/muxui/pull/455)

## Verdict

**Not passing.** The published-run phase resolves the prior proof-coverage finding, and the authorized merge-commit approach addresses the history-retention finding. However, `E-P2.1-02` still reports a passing outcome despite a reproduced failure of the Architecture’s CLI-version and exact-tuple requirements.

This blocks a passing closure review and closing P2.1’s evidence. It does not prevent retaining these measurements and this non-passing review with an accurate incomplete status.

## Verified findings

### 1. [P2] The tooling-version failure remains outside the assertion’s pass calculation

**Location:** `tests/evidence/capture-p2.1.mjs:1579`; emitted record `tests/evidence/p2.1/records/E-P2.1-02.json:1`.

After installing `@muxui/tooling@1.1.0-rc.1`, the published binary reports:

- `meta.muxuiVersion: "1.0.0"` in successful responses.
- `data.cli.cli.version: "1.0.0"` in the full manifest.

I reproduced both. The source contains separate hard-coded values in `packages/tooling/src/local-resolver.mjs:24` and `packages/tooling/command-registry.json:5`.

The capture detects the discrepancy but adds only limits and a non-claim. No assertion part becomes unmet, so `E-P2.1-02` remains `pass`.

**Policy judgment:** I disagree with treating this solely as a non-claim. The Roadmap row at `strategy/milestone-roadmap.md:600` explicitly claims conformance to Architecture “Self-describing manifest”. That section requires the CLI name and version (`strategy/monorepo-architecture.md:835`); “Version units and compatibility” requires the exact catalog and package tuple in every response (`:2045`). An installed CLI identifying itself as another version does not satisfy those requirements.

This does not invalidate the reproduced discovery, normalization, descriptor, or budget results. It does prevent the record’s overall passing Architecture-conformance claim. Deferring the implementation fix to the next real release does not amend those requirements or repair this published tuple.

**Blocking effect:** Blocks closing P2.1’s evidence and merging with a passing closure outcome. Retaining truthful incomplete evidence remains possible.

### 2. [P3] The suffix helper also removes prefixes of longer prerelease identifiers

**Location:** `tests/evidence/capture-p2.1.mjs:64`.

The regular expression matches a substring rather than requiring a complete `X.Y.Z-rc.N` version. Direct execution gives:

```text
input:   packageVersion="1.2.3-rc.1.4"
output:  packageVersion="1.2.3.4"
tokens:  7 raw, 5 counted
```

Here the prerelease identifier is `rc.1.4`, so the helper excludes text beyond the amendment’s exact `-rc.N` suffix rule. The focused test does not cover this case.

All actual suffix matches in the retained dense output are `2.1.0-rc.1` or `0.1.0-rc.5`. Independently replacing only those installed versions produces the recorded counts exactly.

**Blocking effect:** Does not block retaining this capture or closing its budget evidence. The current measurements are unaffected; “nothing wider” is not a general guarantee of the helper.

## Prior review and disposition

The prior review was **Not passing**, with two P2 findings:

1. Source-version packed tests did not prove discovery, normalization, and budgets for the published tuple.
2. Squash merging would leave bound proof revisions outside default-branch history.

The other five evidence records were supported. Capture size was advisory.

**Published-tuple coverage is resolved.** The new phase installs the exact published packages and executes their installed binary. Source-version tests are now explicitly supporting evidence.

**History retention is resolved under the instructed merge method.** Every cited proof revision and the reviewed head is an ancestor of this frozen head. Adding the review commit and then making an actual merge commit preserves that ancestry. The repository currently still allows squash only; temporarily enabling merge commits and using one is therefore a remaining operational step, not something this review verified as completed. I found no unsoundness in that approach.

## Published-run reproduction

I installed these exact versions in scratch space outside the repository, with scripts disabled and empty npm configuration:

- `@muxui/schema@0.6.0-rc.1`
- `@muxui/catalog@2.1.0-rc.1`
- `@muxui/tooling@1.1.0-rc.1`
- `@muxui/react@0.1.0-rc.5`

Using Node `24.19.0`, I reran all **58 recorded invocations**. Every exit status, stdout byte count, stderr byte count, and raw stdout digest matched `verification.json`.

Additional checks confirmed:

- All four installed versions, `gitHead` values, and lockfile integrities match the release.
- The installed React descriptor matches the release-manifest digest and has 84 bindings; all 84 component IDs are listed.
- Human, JSON, and dense output normalize to the installed catalog API plus project-resolver response for all 12 command/detail cases.
- All 12 budget-fixture counts match the retained raw and counted values.

The significant measurements reproduce exactly:

- Brief manifest: **257 raw, 251 counted; budget 256**.
- React get, brief: **129 raw, 123 counted; budget 384**.
- React get, compact: **262 raw, 256 counted; budget 1024**.
- React get, full: **2801 raw, 2795 counted; amended ceiling 3072**.

## Amendment and disclosure assessment

Decision 0032’s amendment explicitly states that the published brief manifest exceeded its original budget and that the suffix exclusion was adopted afterward. The evidence record likewise retains the original assertion, amendment revisions, raw numbers, counted numbers, and chronology. I found no wording that conceals the original failure.

**Policy judgment:** Assessing current milestone closure against an explicitly approved canonical amendment is acceptable under the Roadmap’s completion rule, which permits an approved Roadmap change to re-establish exit conditions (`strategy/milestone-roadmap.md:66`). It does not establish that the release passed the rules in force when published. That historical distinction is preserved here. The amendment becomes repository authority through its protected merge.

## Sanitization, regressions, and verification limits

The two sanitization rewrites are sound for this capture. I reproduced **six `requestKey` replacements, three token-ID replacements, and zero shared-rule changes**, then reconstructed the retained output byte for byte. Normalization and token counting operate on the originals before sanitization; matching raw stdout digests bind those originals.

The 253,911-byte published output and all 14 files under the P2.1 evidence root pass the disclosure checks and an additional email scan. No credential, email, or local absolute-path disclosure was found.

The focused evidence/privacy/R1 rebuild selection passed **9 tests**. The evidence verifier passed **13 indexes, 66 records, and 870 artifacts**. The rc.1 through rc.5 routes rebuild byte for byte, and none changed in the follow-up diff. The other five P2.1 records retain their substantive claims and evidence.

The 1,824-line capture contains removable duplication, particularly the embedded reference/normalization scripts and non-gating discovery-count summaries. Size alone is not a blocker.

I checked GitHub metadata for the four named runs, including their successful conclusions and expected revisions. I did **not** download and independently revalidate every original CI log, cryptographically reverify registry attestations, rerun the full workspace/release graph, or repeat descriptor/catalog tamper negatives against the published installation. The eventual merge and review-retention commit remain unverified. Repository files and external settings were unchanged.
