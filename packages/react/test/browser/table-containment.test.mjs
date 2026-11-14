import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof that Table contains what its cells place absolutely: a wide table in a sideways
// scroller on a phone keeps a visually hidden column label inside the scroller, so the page itself never
// scrolls sideways, with no positioning asked of the wrapper.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Table } from '/src/collections.mjs';

const h = React.createElement;
// The common visually hidden pattern: absolutely placed, one pixel, clipped.
const hidden = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };
const columns = [
  { id: 'name', label: 'Community', isRowHeader: true },
  { id: 'members', label: 'Members' },
  { id: 'action', label: h('span', { id: 'hidden-label', style: hidden }, 'Action'), textValue: 'Action' },
];
const rows = [{ id: 'news', name: 'news', members: '1,204', action: 'Join' }];
createRoot(document.getElementById('root')).render(
  h('div', { id: 'scroller', style: { overflowX: 'auto' } }, h(Table, { 'aria-label': 'Communities', columns, rows, style: { minInlineSize: '48rem' } })));
`;

const page = () => pageShell({
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 0"',
  body: '<div id="root"></div>',
  entry: '/table-containment-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Table keeps an absolutely placed cell label inside its scroller in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({ entries: ['src/collections.mjs'], pages: { '/table-containment.html': page }, modules: { '/table-containment-entry.mjs': entry } });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 375, height: 640 } });
      await tab.goto(`${url}/table-containment.html`, { waitUntil: 'load' });
      await tab.locator('#hidden-label').waitFor({ state: 'attached', timeout: 15_000 });
      await awaitFontsAndFrames(tab);
      const read = () => tab.evaluate(() => {
        const scroller = document.getElementById('scroller');
        return { page: document.documentElement.scrollWidth - window.innerWidth, scroller: scroller.scrollWidth - scroller.clientWidth };
      });
      const rest = await read();
      assert.ok(rest.scroller > 0, `${engine}: the table is wider than the phone and scrolls in its box (${rest.scroller}px)`);
      assert.equal(rest.page, 0, `${engine}: the page does not scroll sideways`);
      // Scrolled to its end, the label is still the scroller's to clip.
      await tab.evaluate(() => { document.getElementById('scroller').scrollLeft = 10_000; window.scrollTo(10_000, 0); });
      assert.equal(await tab.evaluate(() => window.scrollX), 0, `${engine}: the page cannot be scrolled sideways`);
      assert.equal((await read()).page, 0, `${engine}: scrolling the table leaves the page width alone`);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
