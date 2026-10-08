# Independent review record: E-BL1-09 boundary audit and BL1 exit claim, step 1 (PR #230)

- **Reviewer:** independent read-only reviewer agent (Claude Sonnet 5.5), not the close-out author.
- **Revision reviewed:** `509d870216ea00a0afbca717fa39188afffbd21a` (`chore/bl1-closeout`, base main `670cb1880350e62d19f30a09914b6eb6dadef9a4`, 12 files). Tree `6c3f51fb3c6d9b33cf5b799b01ca745705850555`.
- **Date:** 2026-10-08.
- **Prior reviews read:** the `82aa2576` review (five defects) and the `c4770e2d` re-review.

## Method

Read the net diff and the code it touches. Ran, writing only under /tmp:

- the integrity test (22 of 22) and `evidence-verify` (17 indexes, 78 records, 20 artifacts);
- the live boundary audit: 13 of 13 checks pass; GitHub lists 4 deployments, all `npm-publish` before the base, and no Pages site; the registry matches the R1 read-back;
- all 36 controls, and leg wiring through injected observers;
- the archive over main's real BL1 records;
- a full capture rehearsal at this revision, seeded with main's records: exit 0, 11 records, 93 artifacts, `supersedes` set on E-BL1-08 and E-BL1-11, worktree clean afterwards (`generate:check` adds and removes a transient git worktree);
- the audit on a squash-shaped commit in a /tmp clone: its tree equals this tree, `closeout-scope` lists exactly these 12 paths with none outside the allowed prefixes, and the offline-evaluable checks pass.

PR checks are green. I did not run `pnpm check`.

## Re-review items: resolved

- **Supersession.** `supersedes` carries forward (`capture-support.mjs:147-150`, `capture-bl1.mjs:713,824`). Main's records are copied byte for byte to `superseded/be6f7c411f03/`, and the six files are in index `artifacts`, so `evidence-verify` digests them. Not using `supersessions` is right: `strategy/monorepo-architecture.md:1865` reserves it for closed-grammar applicability certificates. This is append-only in spirit: nothing is lost, though the originals are replaced at their paths and the archive is a copy, as `README.md:26-36` says.
- **E-BL1-01 8 of 8.** `fieldOwner` (`authoring.mjs:446`) falls back to `pattern-contract` at pointer `#`. The new test (`pattern-authoring.test.mjs:818-832`) asserts path, message, owner, and pointer. The capture parses them from the test source and cross-checks the path against the schema test (`capture-bl1.mjs:277-288`). Both owner kinds are named `pattern-contract`; only the pointer differs, and the claim says so.
- **Widths.** The capture requires the amendment list to equal `pageWidths` (`:117-122`), and the overflow report must match (`:419`).
- **Reviews.** The content review is always required; the exit review is required for a close-out. Both record reviewed tree, main-history membership, tree comparison, and proof tools changed since the review.
- **Controls.** All 36 fail exactly their named legs, and none of the 38 legs lacks one. The integrity tests are not vacuous: they fail closed with no `origin/main`, on a tampered review, and on unverified or mixed archives.
- **Stopped-run message.** Replaced; it now names the dirty paths (`boundary-audit.mjs:247-252`).
- **Authoring-test allowance.** It is the exact file the E-BL1-02 proof runs and the edit is one 17-line test: narrow by path, not by content.

## Confirmed defects (low; none blocks merge)

1. **Thresholds are not bound to HEAD.** `regression.mjs:27-28` and `capture-bl1.mjs:197,702` read `regression-thresholds.json` from the working tree. `tests/evidence/bl1/` is exempt from the clean check (`:87-89`) and the file is not a bound proof tool (`:67`), yet the E-BL1-11 claim says "committed before capture" (`:699`).
2. **`--growth` is an unverified flag** (`:80,469,505`). Nothing requires an added block or a prior close-out capture. It skips `closeout-scope` and the exit review, and the capture still verifies. It is visible (`scope` in `verification.json`, `closeoutScope.run: false`) but not prevented. `README.md:174-175` says the E-BL1-09 artifact records `scope: growth`; it records `closeoutScope` only.
3. **The exit review's verdict is unchecked.** `capture-bl1.mjs:520` requires `**Pass.**` for the content review only; a "not ready" exit review would be retained.
4. **Archived records name stale paths.** Their `artifact.path` and `validation.path` still point at `tests/evidence/bl1/...`, which will hold the new bytes. They verify by digest, but not by their own links, and the README does not say to resolve them under `superseded/<revision>/`.

## Concerns

- Function controls bypass `run()`, so claim, CLI, and package leg wiring is untested (the README says so).
- An unobserved deployments read narrows the claim and still passes (`boundary-audit.mjs:420-422`); step 2 must confirm `observed: true`.
- `closeout-scope` is anchored at `670cb188` (`:29`), so any other main commit outside the allowed prefixes blocks capture and needs a tooling PR. The prefix `tests/evidence/` (`:45`) is broader than BL1.
- Every growth capture reruns the audit against the pre-BL1 base, so a later legitimate `@muxui/react` change blocks it.
- The capture's top-level glue has no CI test; one rehearsal covered it.
- `strategy/milestone-roadmap.md:1184` ("`@muxui/react`: unchanged") is still literally untrue because of #227; the record's disclosure mitigates it.
- This review and the E-BL1-10 review are by the same model. This review covers the tools and a rehearsal, not the step-2 bytes.

## Verdict

- **(a) #230 is ready to merge as step 1.** No blocking defect. Defects 1 to 3 are cheap hardening; proof tools are bound by commit, so doing them now avoids a later tooling PR, but it is not required.
- **(b) The E-BL1-09 audit and exit claim will hold at the squash commit,** provided that:
  - nothing else lands on main before capture;
  - the capture runs without `--growth` and `verification.json` shows `scope: close-out`;
  - the thresholds file is clean;
  - the registry and GitHub reads succeed;
  - `--exit-review-revision` is `509d870216ea00a0afbca717fa39188afffbd21a`.

  The expected recorded comparison is `reviewedRevisionInMainHistory: false` and `equalTrees: true`. The records PR still needs its own check of `evidence-verify` and all eleven outcomes. With those, the records support the Roadmap BL1 exit condition and each stated non-claim.
