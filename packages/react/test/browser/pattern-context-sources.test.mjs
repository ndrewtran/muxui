import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { assertFits, assertUniqueIds, openBlock, patternVariant, ringWalk, startVariantServer, tabWalk } from './pattern-probes.mjs';
import { warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the context sources block, loaded from its canonical catalog
// source through the public `@muxui/react` entry, lists its excerpt cards under a named
// section, opens a location preview from each source chip on hover and keyboard focus,
// keeps the link a placeholder fragment, shows visible focus in light and dark, and
// never overflows the page horizontally down to 360 and 390 (E-BL1-04). Runs in every
// engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('context-sources', 'excerpts');

for (const engine of browserEngines()) {
  test(`context sources keep their excerpts, source previews, focus, and layout behavior in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('names its section, lists the excerpts, and opens a source preview on hover and focus', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        const navigations = [];
        tab.on('framenavigated', (frame) => navigations.push(frame.url()));
        try {
          const section = tab.getByRole('region', { name: 'All chunks' });
          await section.waitFor();
          assert.equal(await tab.getByRole('heading', { level: 2 }).textContent(), 'All chunks');
          assert.equal(await section.getByRole('listitem').count(), 2);
          assert.deepEqual(await section.getByRole('heading', { level: 3 }).allTextContents(), ['Rollout approval rule', 'Ticket age summary']);
          assert.equal(await tab.getByText('32', { exact: true }).count(), 1, 'the count shows beside the heading');
          // The file type mark is decorative and the file name is the link text.
          const policy = tab.getByRole('link', { name: 'Rollout Policy.pdf' });
          assert.equal(await policy.getAttribute('href'), '#source');
          assert.equal(await policy.locator('[aria-hidden="true"]').first().textContent(), 'PDF');

          // Hover opens the location after its delay and leaving closes it. React Aria ignores hover until the page has seen a pointer press.
          await tab.mouse.click(1000, 700);
          await policy.hover();
          const location = tab.getByRole('dialog', { name: 'Rollout Policy.pdf location' });
          await location.waitFor({ state: 'visible', timeout: 4000 });
          assert.equal((await location.textContent()).trim(), 'Policies, page 4');
          await tab.mouse.move(2, 2);
          await location.waitFor({ state: 'hidden', timeout: 4000 });

          // Keyboard focus opens the next preview, and Escape closes it with focus left on the link.
          await policy.focus();
          await tab.keyboard.press('Tab');
          const rows = tab.getByRole('dialog', { name: 'Ticket Ages.csv location' });
          await rows.waitFor({ state: 'visible' });
          assert.equal((await rows.textContent()).trim(), 'Support exports, rows 2 to 9');
          await tab.keyboard.press('Escape');
          await rows.waitFor({ state: 'hidden' });
          assert.equal(await tab.evaluate(() => document.activeElement.textContent), 'CSVTicket Ages.csv');

          // Activating the placeholder link only sets the fragment: the page is never replaced or navigated away.
          await policy.click();
          assert.equal(new URL(tab.url()).hash, '#source');
          assert.equal(await tab.evaluate(() => window.__sentinel), 'alive');
          assert.deepEqual(errors, []);
          assert.ok(navigations.every((address) => address.startsWith(`${url}/block.html`)), `the page stays on the block (${navigations.join(', ')})`);
        } finally {
          await context.close();
        }
      });

      await t.test('walks every control in order in light and dark, each with a focus ring that differs from rest', async () => {
        for (const scheme of ['light', 'dark']) {
          const { context, tab } = await openBlock(browser, url, { scheme });
          try {
            const seen = await tabWalk(tab, ringWalk(tab), scheme);
            assert.deepEqual(seen, ['link Rollout Policy.pdf', 'link Ticket Ages.csv'], `${scheme}: Tab visits the source links in this order`);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('two instances share no ids', async () => {
        await assertUniqueIds(browser, url, 'context sources');
      });

      await t.test('never scrolls the page horizontally at 360, 390, 768, and 1280 in light and dark', async () => {
        await assertFits(browser, url, '.context', 'context sources');
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}
