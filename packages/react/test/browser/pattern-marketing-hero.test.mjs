import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { measureBox, measureFocusIndicator, measurePageFit, openBlock, pageWidths, patternVariant, startVariantServer } from './pattern-probes.mjs';
import { pollUntil } from './grid-list-probes.mjs';

// Cross-engine proof that the marketing hero, loaded from its canonical catalog
// source through the public `@muxui/react` entry, never overflows the page
// horizontally at the E-BL1-06 page widths in either scheme, stacks text first
// below 40rem and splits into two columns from 40rem, and keeps keyboard focus
// visible on its two actions (E-BL1-04). Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('marketing-hero', 'split');

for (const engine of browserEngines()) {
  test(`marketing hero keeps its layout, overflow, and focus behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);

      await t.test('never scrolls the page horizontally at 360, 768, and 1280 in light and dark', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const width of pageWidths) {
            const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
            try {
              const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
              assert.ok(scrollWidth <= innerWidth, `${scheme} ${width}px: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`);
              const hero = await tab.evaluate(measureBox, '.hero');
              assert.ok(hero.left >= 0 && hero.right <= innerWidth, `${scheme} ${width}px: the hero stays inside the viewport`);
              assert.deepEqual(errors, []);
            } finally {
              await context.close();
            }
          }
        }
      });

      await t.test('stacks text first below 40rem and splits into two columns from 40rem', async () => {
        for (const [width, columns] of [[360, 1], [639, 1], [640, 2], [768, 2], [1280, 2]]) {
          const { context, tab } = await openBlock(browser, url, { width });
          try {
            const copy = await tab.evaluate(measureBox, '.hero-copy');
            const visual = await tab.evaluate(measureBox, '.hero-visual');
            if (columns === 1) {
              assert.ok(visual.top >= copy.bottom - 1, `${width}px: the visual follows the text (${visual.top} < ${copy.bottom})`);
              assert.ok(Math.abs(visual.left - copy.left) < 2, `${width}px: both share one column`);
            } else {
              assert.ok(visual.left >= copy.right - 1, `${width}px: the visual sits beside the text (${visual.left} < ${copy.right})`);
              assert.ok(Math.abs(visual.top - copy.top) < copy.bottom - copy.top, `${width}px: both start in the same row`);
            }
          } finally {
            await context.close();
          }
        }
      });

      await t.test('names the section by its heading, hides the visual, and shows focus on both actions', async () => {
        const { context, tab, errors } = await openBlock(browser, url, { width: 360 });
        try {
          const heading = tab.getByRole('heading', { level: 1, name: 'Introduce your product' });
          await heading.waitFor();
          await tab.getByRole('region', { name: 'Introduce your product' }).waitFor();
          assert.equal(await tab.locator('.hero-visual').getAttribute('aria-hidden'), 'true', 'the visual is decorative');
          assert.equal(await tab.getByRole('img').count(), 0, 'the visual exposes no image');

          await tab.locator('#before').focus();
          for (const name of ['Get started', 'See an example']) {
            await tab.keyboard.press('Tab');
            await pollUntil(tab, (label) => document.activeElement?.textContent === label, name, {
              message: `Tab reaches ${name}`,
              report: () => document.activeElement?.outerHTML.slice(0, 120),
            });
            assert.equal(await tab.evaluate(measureFocusIndicator), true, `${name} paints a focus indicator`);
          }
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}
