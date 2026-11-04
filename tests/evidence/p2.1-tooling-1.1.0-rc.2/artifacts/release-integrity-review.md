# P2.1 tooling rc.2 release-integrity review

**Reviewer:** GPT-6.1 Sol, Codex  
**Reviewed revision:** `214cb047219071286ca5c8fe1f311b6a2d15e603`  
**Base:** `origin/main` at `0cd44350`  
**Date:** 4 November 2026

## Verdict

**Pass.** No verified finding blocks retaining this evidence or closing P2.1’s evidence for the tuple currently on `next`.

The later tooling release answers the earlier review’s version-reporting blocker. It does not repair tooling rc.1 or turn the first route into passing evidence. That historical failure remains accurately retained.

This verdict covers the frozen head. Retaining this review and completing the authorized merge commit remain future actions.

## Findings

No actionable correctness, regression, release-integrity, or privacy findings remain in the reviewed diff.

## Verified evidence assessment

The verified tuple is:

| Package | Version | Release role |
| --- | --- | --- |
| `@muxui/schema` | `0.6.0-rc.1` | Reused |
| `@muxui/catalog` | `2.1.0-rc.1` | Reused |
| `@muxui/tooling` | `1.1.0-rc.2` | Published |
| `@muxui/react` | `0.1.0-rc.5` | Reused |

I installed these exact versions outside the repository using Node `24.19.0`, pnpm `10.33.0`, disabled lifecycle scripts, and empty npm user and global configuration.

All **58 recorded invocations** reproduced their exit status, stdout and stderr byte counts, and raw stdout digest. Reconstructing the sanitized output produced the retained `published-muxui-output.txt` byte for byte.

| Assertion | Assessment |
| --- | --- |
| `E-P2.1-01` | Supported. Registry tarball bytes match the recorded integrities. Installed manifests carry the declared engines and public exports, with the permitted Mux UI dependency edges. The real preparation installed the complete tuple and exercised its public entries. The negative-fixture claims match passing tests in the downloaded CI log. |
| `E-P2.1-02` | Supported for the new tuple. All 12 discovery cases normalize across human, JSON, and dense modes to the installed catalog API and project resolver. All 15 retained budget measurements reproduce. The installed descriptor digest matches the manifest; all 84 component bindings are listed, and all 84 named export members exist in their installed modules. Tooling reports `1.1.0-rc.2`. |
| `E-P2.1-03` | Supported. Full manifest verification passes against the four downloaded registry tarballs and committed sources. Reused records equal their original published records except for `role`. Independently recomputed version effects match the retained result: publish tooling only. |
| `E-P2.1-04` | Supported. The release-commit CI log contains the classification corpus’s passing results. The installed prereleases satisfy the declared sibling ranges, and catalog package version equals `catalogVersion`. |
| `E-P2.1-05` | Supported within its stated fixture scope. The cited negotiation and rejection tests passed in release-commit CI. The source has no hosted/latest catalog reader; its `not-applicable` treatment does not substitute for testing a future reader. |
| `E-P2.1-06` | Supported. The dry run rehearsed tooling publication, the publish promoted that candidate, and registry read-back agrees with the published bytes and provenance. The prior tuple installs again by exact version. Refusal and recovery claims are explicitly simulated or prepared. |

These assessments refer to `tests/evidence/p2.1-tooling-1.1.0-rc.2/records/E-P2.1-01.json:1` through `E-P2.1-06.json:1`.

The significant reproduced counts are **261 raw / 251 counted** for brief manifest, and **131/123**, **264/256**, and **2803/2795** for brief, compact, and full React `get`. The counted values meet the applicable budgets, including the amended 3072-token full-detail ceiling. The route retains the raw excess and applies amendments already present at this release’s source revision.

## Primary-source checks and reuse

I downloaded the original logs for the policy and tooling CI jobs, dry-run preparation, publish preparation, and publication. Every raw-log digest matched its retained binding. Both CI excerpts reconstruct from the original selected lines, and the dry-run/publish binders reproduce the retained preparation, publication observations, and excerpts.

The named runs succeeded on the stated release commit:

- [Main CI 41786122448](https://github.com/ndrewtran/muxui/actions/runs/41786122448)
- [Dry run 41787407523](https://github.com/ndrewtran/muxui/actions/runs/41787407523)
- [Publish 41789992943](https://github.com/ndrewtran/muxui/actions/runs/41789992943)

Real reuse preparation occurred. The downloaded dry-run log shows signature verification of the three reused packages, their fetched bytes, **239 SSR renders and 239 hydrations**, the consumer matrices, and the complete set consumer. The executed preparation source places these checks on the fetched React tarball path. The record does not claim more execution than the log supports. See `tests/evidence/p2.1-tooling-1.1.0-rc.2/validation/dry-run-prepare-126432612759.txt:24` and `:32`.

For every current package, I independently checked registry integrity, shasum, dist-tags, version inventory, provenance subject digest, repository, workflow, source commit, and invocation. A fresh npm `11.17.0` signature audit of all four exact versions exited successfully with no invalid or missing signatures and covered all four attestations.

The downloaded candidate tooling tarball equals the registry tarball byte for byte. Its manifest has the same JSON content as the retained manifest and preserves the canonical release digest.

## Closure and the earlier review

**Policy assessment:** Reporting the actual version of each independently versioned package satisfies the cited version requirement. Decision 0032 distinguishes package versions from contract versions. The verified responses identify tooling rc.2, the exact catalog, and the resolved React target where applicable; the release manifest correlates all four package records and their bytes. A single shared package version is not required.

Moving the missing current-version proof to a later real release is sound under the explicitly permitted later-release and reuse model in `strategy/milestone-roadmap.md:601`. The first route still records `E-P2.1-02` as `partial` and retains its not-passing review. Reinstalling that first tuple reproduces both incorrect `1.0.0` reports.

The two release-specific exclusions hold:

- **First release publishes all four:** legitimately inapplicable to this later release. I downloaded the first publication log and verified all four publications, in order, from the first source commit.
- **React trusted publication:** legitimately inapplicable to this release’s publication action because React is reused. The first log shows React’s OIDC publication, and the current registry attestation still binds those reused bytes to that original publish.

These exclusions preserve earlier proof rather than bypassing it. The earlier review’s blocker is answered for the current tuple while remaining true historically. No required assertion remains `partial` for the current tuple under the stated evidence contract.

Some proof remains deliberately fixture-based: negotiation negatives, refusal/recovery scenarios, and repeated manifest construction. The records disclose that no second complete real preparation or real rollback was performed.

## Trusted publishing

Tooling’s OIDC publication is supported by the actual authentication line, successful publish, attestation, and the executed credential-isolation code. See `tests/evidence/p2.1-tooling-1.1.0-rc.2/validation/publish-126441001976.txt:35`.

Schema and catalog tokenless publication remains unproved. Andrew’s publisher-setup statement is labelled as his report, not as publicly verified configuration. Their earlier token-publish provenance is not presented as proof of tokenless authentication.

The two-day expiry statement agrees with current [npm trusted-publisher documentation](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry). I did not inspect private npm publisher settings.

## Manifest, durability, and maintainability

Direct checks against the retained manifest passed:

- `findPriorManifestProblems` returned no problems.
- `readIndexedArtifact` authenticated the committed artifact.
- `resolvePriorRelease` selected it successfully.
- `verifyPortfolioRelease` verified the actual four tarballs.
- Both release manifests coexist without conflicting release identities.
- Later tooling-only and React-only reuse planning finds the required origin manifests.

The corresponding retained regression coverage is at `tooling/audits/repository-policy/test/evidence-integrity.test.mjs:4005`.

All **ten bound commit objects** found across the two P2.1 routes and the first portfolio’s R1 exit route are ancestors of the frozen head. Adding this review and making the instructed actual merge commit preserves those revisions, including the reviewed head. I found no history-retention defect under that merge method; the eventual merge itself is unverified.

The generalized candidate handling in `capture-r1-exit.mjs` binds the real tooling release correctly while preserving React defaults. The focused selection passed **36 tests** on Node `24.19.0`, including earlier-route rebuilds. The rc.1 through rc.5 routes and first P2.1 route rebuild byte for byte and are unchanged by this diff. The evidence verifier passed **14 indexes, 72 records, and 879 artifacts**.

Capture size is not a blocker. Embedded reference/normalization programs and repeated derived summaries remain possible simplification targets; I found no correctness reason to remove retained proof.

## Disclosure and limits

All 32 files across the two P2.1 routes passed the disclosure checks and additional email/local-path scans. I found no retained credential, email address, or local absolute-path disclosure. Records state `public-sanitized`, ownership, retention, expiry, exception, and advisory bindings.

The placeholder-version origin remains an explicitly labelled inference. Publish authorization and schema/catalog publisher setup remain operator-reported facts that public evidence cannot independently establish.

I did **not** rerun the complete workspace or release-preparation graph, repeat published-install descriptor/catalog tamper negatives, test other Node versions, exercise recovery, inspect private npm settings or token revocation, verify delivery-tracker completion, or perform the future review-retention commit and merge.

Repository files and external settings were unchanged.
