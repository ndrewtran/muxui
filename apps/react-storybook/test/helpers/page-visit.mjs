import assert from 'node:assert/strict';
import { compilePureTokenGraph } from '@muxui/tokens/core';
import defaultTheme from '../../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { recordPageFailure } from '../storybook-audit-failures.mjs';
import { collectStorybookPaints } from './color-audit.mjs';

// One story-page visit serves the axe and the canonical-colour proofs. The colour proof
// measures at this size, so the workers that run both create their contexts with it.
export const pageVisitViewport = Object.freeze({ width: 1440, height: 1000 });

export const tokenGraphs = Object.fromEntries(['light', 'dark'].map((colorScheme) => [
  colorScheme, compilePureTokenGraph(defaultTheme, { modes: { colorScheme } }).tokens,
]));

export function paintCoverageKey(scheme, id) {
  return `${scheme}:${id}`;
}

/**
 * Audits the settled story page's paints against the canonical Mux tokens. Call it after
 * the story, fonts, animations, and lifecycle status have settled and before the page is
 * opened further or axe is injected. A failure is recorded under `{ scheme, id }` and never
 * stops the caller's remaining checks for the page.
 */
export async function auditPagePaints(page, { scheme, id, coverage, failures, signal }) {
  try {
    const result = await page.evaluate(collectStorybookPaints, {
      tokens: tokenGraphs[scheme],
      // A nested colour scheme scope, such as an open Popover with colorScheme, is read against its own scheme's tokens.
      schemeTokens: tokenGraphs,
      scope: 'canvas',
    });
    if (result.nonToken.length > 0) {
      const diagnostics = await page.evaluate((unexpected) => ({
        scheme: document.documentElement.getAttribute('data-muxui-color-scheme'),
        matches: unexpected.flatMap((paint) => [...document.querySelectorAll('*')]
          .filter((element) => getComputedStyle(element).backgroundColor === paint.value)
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            id: element.id,
            background: getComputedStyle(element).backgroundColor,
            transition: getComputedStyle(element).transition,
          }))).slice(0, 12),
        animations: document.getAnimations().map((animation) => ({
          playState: animation.playState,
          currentTime: animation.currentTime,
          timing: animation.effect?.getTiming?.(),
        })),
      }), result.nonToken);
      console.error(`[storybook-audit] ${scheme}/${id} unexpected-paint-details=${JSON.stringify(diagnostics)}`);
    }
    assert.ok(result.elements > 0 && result.paintOccurrences > 0, `${scheme}/${id}: empty canvas colour audit`);
    assert.deepEqual(result.problems, [], `${scheme}/${id}: colour audit could not resolve all paints: ${JSON.stringify(result.problems.slice(0, 6))}`);
    assert.deepEqual(result.media, [], `${scheme}/${id}: image colours require explicit verification: ${JSON.stringify(result.media.slice(0, 6))}`);
    assert.deepEqual(result.nonToken, [], `${scheme}/${id}: page painted colours outside canonical Mux tokens: ${JSON.stringify(result.nonToken.slice(0, 6))}`);
    coverage.push(paintCoverageKey(scheme, id));
  } catch (error) {
    recordPageFailure(failures, { scheme, id }, error, { signal });
  }
}
