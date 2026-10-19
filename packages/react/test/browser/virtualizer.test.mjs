import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// The default stack Virtualizer scrolls through its whole collection: the
// scroll extent is the row count times itemHeight plus the viewport padding, so
// scrolling to the end reaches the last row. A column flex viewport used to
// shrink React Aria's layout spacer to the viewport height, which stopped the
// scroll at about row 11 of 100. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs). The grid layout renders no
// Virtualizer element and has its own proof in virtualizer-grid.test.mjs.

const COUNT = 100;

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Virtualizer } from '/src/collections.mjs';

const { count, ...options } = JSON.parse(new URLSearchParams(location.search).get('config'));
const items = Array.from({ length: count }, (_, index) => ({ id: String(index + 1), label: 'Document ' + String(index + 1).padStart(3, '0') }));
createRoot(document.getElementById('root')).render(React.createElement(Virtualizer, { 'aria-label': 'Project documents', items, ...options }));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 24px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/virtualizer-entry.mjs',
});

// The basic catalog example sizes, then a viewport and rows that differ from the defaults.
const cases = [
  { name: 'default height and rows', config: { count: COUNT }, height: 240, itemHeight: 40 },
  { name: 'custom height, rows, and overscan', config: { count: 60, height: 180, itemHeight: 56, overscan: 0 }, height: 180, itemHeight: 56 },
];

for (const engine of browserEngines()) {
  test(`Virtualizer stack layout scrolls through every row in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs'],
      pages: { '/virtualizer.html': page },
      modules: { '/virtualizer-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

      for (const { name, config, height, itemHeight } of cases) {
        await t.test(`the scroll extent is the full collection and the last row is reachable: ${name}`, async () => {
          await tab.goto(`${url}/virtualizer.html?config=${encodeURIComponent(JSON.stringify(config))}`, { waitUntil: 'networkidle' });
          const viewport = tab.locator('.muxui-virtualizer');
          await viewport.locator('[role="option"]').first().waitFor();

          const measure = () => viewport.evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              scrollHeight: node.scrollHeight,
              clientHeight: node.clientHeight,
              scrollTop: node.scrollTop,
              padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
              flex: style.display.includes('flex'),
            };
          });
          const before = await measure();
          const extent = config.count * itemHeight;
          assert.ok(
            Math.abs(before.scrollHeight - (extent + before.padding)) <= 1,
            `scrollHeight is ${before.scrollHeight}px, not the ${extent}px of ${config.count} rows plus ${before.padding}px of padding (flex ${before.flex})`,
          );
          assert.ok(before.clientHeight <= height, `the viewport stays ${height}px tall, not ${before.clientHeight}px`);

          await viewport.evaluate((node) => { node.scrollTop = node.scrollHeight; });
          const last = viewport.locator(`[role="option"][aria-posinset="${config.count}"]`);
          await last.waitFor({ timeout: 5000 }).catch(async (error) => assert.fail(`row ${config.count} never mounted at the end of the scroll: ${error.message.split('\n')[0]}; ${JSON.stringify(await measure())}`));
          const after = await measure();
          assert.ok(after.scrollTop + after.clientHeight >= after.scrollHeight - 1, `the scroll reaches the end (${after.scrollTop} + ${after.clientHeight} of ${after.scrollHeight})`);
          const [row, box] = await Promise.all([last.boundingBox(), viewport.boundingBox()]);
          assert.ok(row.y + row.height <= box.y + box.height + 1, `the last row ends at ${row.y + row.height}px, inside the viewport that ends at ${box.y + box.height}px`);
          assert.ok(row.y >= box.y, 'the last row starts inside the viewport');
          assert.deepEqual(errors, [], errors.join('\n'));
        });
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
