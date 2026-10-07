# E-BL1-10 content review record: BL1 seed blocks

**Reviewer:** independent read-only reviewer agent (Claude Sonnet 5.5), not the authoring agents.
**Source revision:** `670cb1880350e62d19f30a09914b6eb6dadef9a4`. Branch `chore/bl1-closeout` at main `670cb188`, clean worktree at `<repo>`.
**Date:** 2026-10-07.

## Method

- **Authority:** Decision 0026 (items 6, 8, 9), `SCOPE-NONGOAL-008` in `strategy/product-scope.md`, Decision 0022, and the Roadmap `E-BL1-10` row, plus the scanner contract in `packages/catalog/src/pattern-content.mjs`.
- **Block files:** for each of `catalog/patterns/{poster-grid,marketing-hero,pricing-plans,account-settings}`, every variant `.tsx`, every `.example.json`, and `artifact.json`.
- **Scans:** the four directories were grepped for:
  - URLs, remote loads, `url()`, `@import`, and asset extensions. Only the two SVG-namespace data URIs matched.
  - Literal colours. None.
  - Brand names, common person names, and "Mux" in visible copy. None. The only "Mux" is a source comment at `split.tsx:84`.
  - Claim words: accessible, tested, screen reader, WCAG, supported. Reviewed by hand.
- **Assets:** no asset files and no `.license.json` records exist, and none are required.
- **Limits:** the review did not run the compiler scanner, the tests, or the docs site. It read their rules.

## Per-block findings

**Poster grid**
- Copy is generic: "Sample Title" style titles, plus "Details", "Save", and "Posters" (`css-grid.tsx:5-18`, `virtualized.tsx:6-19`).
- Imagery is an empty SVG data URI over a token surface (`css-grid.tsx:21`, `virtualized.tsx:29`). Links are `#fragment` placeholders.
- Bounded-section test: pass. The virtualized variant keeps only local column state (`ResizeObserver`, `virtualized.tsx:34-49`). It generates 1,000 rows in the module, with no fetch and no routing.
- Advisory: `virtualized.tsx:11` titles a card "A Disabled Sample Title…", but only `index % 11 === 10` is disabled (`virtualized.tsx:25`). Most cards with that title are enabled, and disabled cards carry other titles. The CSS-grid variant is consistent (`css-grid.tsx:10`). This is misleading demonstration copy, not a content-rule breach.

**Marketing hero**
- Merged copy verified: `split.tsx:77` reads "Introduce your product" and `split.tsx:78` reads "Use this space to describe what your product does and who it is for." The buttons read "Get started" and "See an example".
- A repo-wide grep finds no "tested parts" or "accessible components".
- The visual is a Mux-authored inline SVG painted with tokens and `currentColor` (`split.tsx:85-101`). The header circle contains no initials or text, so it reads as neither a person nor a logo.
- Bounded-section test: pass. One region, no state, no routing.

**Pricing plans**
- Plan names (Starter, Team, Scale), features, and prices are generic. "Annual saves 20%" matches the data ($20 to $16, $50 to $40, $0 to $0).
- Only the local `period` toggle holds state (`columns.tsx:15`). The CTAs have no handlers, and there is no billing or fetch.
- Check marks are inline SVG.
- Advisory: visible offers such as "Start free and upgrade when you need more" (`columns.tsx:127`) carry no in-block placeholder marker. The record calls the prices placeholders (`artifact.json:68`), and `SCOPE-NONGOAL-008` covers them, so this is acceptable.

**Account settings**
- Sample data is "Sample user" and `sample@example.com`, a reserved domain that is neither a URL nor a remote load (`sections.tsx:4`). The language, time-zone, and digest options are generic.
- The form calls `preventDefault` and only moves a local `saved` snapshot (`sections.tsx:99-104`). It never submits, fetches, or persists, and the record says so (`artifact.json:77`).
- Bounded-section test: pass.

## Cross-block checks

- **Imports vs participants:** every `@muxui/react` import in each variant is a declared participant of its pattern.
- **Claims:** no record or visible prose says "accessible", "tested", "supported", or "compliant", or names a screen reader.
  - The accessibility notes describe the keyboard, naming, and markup contract. Poster grid records a limitation (`artifact.json:75`).
  - No assistive-technology support claim is made (Decision 0022).
- **Advisory, AT wording:** some phrases follow from DOM structure rather than from tested support:
  - "hidden from assistive technology" (`marketing-hero/artifact.json:37`, `pricing-plans/artifact.json:64`);
  - "heading navigation … include it" (`pricing-plans/artifact.json:62`). This one is closest to an AT-behaviour statement, and could be softened.
- **Advisory, stale-prone notes:** the "Mux has no X" lines in the unsupported lists (`marketing-hero/artifact.json:44`, `pricing-plans/artifact.json:69-70`, `account-settings/artifact.json:81`) go stale once that component is admitted. A spot check confirmed no Badge exists in `catalog/components`, and Button's record lists no outlined variant.

## Verdict table

| Block | Third-party brand or mark | Real person or likeness | Generic Mux-authored copy | No external URL or asset | Imagery | No product, quality, test, or AT claim | Bounded-section test | Verdict |
|---|---|---|---|---|---|---|---|---|
| poster-grid | none | none | yes | yes (`css-grid.tsx:21`) | empty data URI | yes (`artifact.json:69-83`) | pass | **Pass** |
| marketing-hero | none | none | yes (`split.tsx:77-78`) | yes | inline SVG (`split.tsx:85`) | yes (`artifact.json:34-46`) | pass | **Pass** |
| pricing-plans | none | none | yes (`columns.tsx:6-10,126-141`) | yes | inline SVG (`columns.tsx:164`) | yes, with advisory (`artifact.json:62`) | pass | **Pass** |
| account-settings | none | none | yes (`sections.tsx:4,107-136`) | yes | none | yes (`artifact.json:68-83`) | pass | **Pass** |

## Overall verdict

**Pass.** All four blocks meet the E-BL1-10 content assertions:

- no third-party brand or mark;
- no real person's name or likeness;
- only generic Mux-authored copy;
- no external URL or remote asset;
- no unlicensed asset.

No actionable failure remains. The advisories above (the `virtualized.tsx:11` title mismatch, the `pricing-plans` AT wording, and the stale-prone "Mux has no X" lines) are optional follow-ups and do not block this verdict.
