import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A Toolbar lays its controls out along its orientation, and the arrow keys
// that move between them follow the same direction. A vertical Toolbar used to
// keep the horizontal row, so ArrowDown moved focus sideways. Runs in every
// engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toolbar } from '/src/collections.mjs';
import { Button } from '/src/button.ts';
import { ToggleButton } from '/src/components.ts';

const h = React.createElement;
const { orientation } = JSON.parse(new URLSearchParams(location.search).get('config'));
createRoot(document.getElementById('root')).render(
  h(Toolbar, { 'aria-label': 'Document actions', orientation, style: { inlineSize: 240 } },
    h(Button, null, 'First'),
    h(ToggleButton, null, 'Second'),
    h(Button, null, 'Third')));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 24px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/toolbar-entry.mjs',
});

const LABELS = ['First', 'Second', 'Third'];

for (const engine of browserEngines()) {
  test(`Toolbar lays controls out along its orientation in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs', 'src/button.ts', 'src/components.ts'],
      pages: { '/toolbar.html': page },
      modules: { '/toolbar-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

      const open = async (orientation) => {
        await tab.goto(`${url}/toolbar.html?config=${encodeURIComponent(JSON.stringify({ orientation }))}`, { waitUntil: 'networkidle' });
        await tab.locator('.muxui-toolbar button').first().waitFor();
      };
      const boxes = async () => Promise.all(LABELS.map((label) => tab.getByRole('button', { name: label }).boundingBox()));
      // Presses `key` from the first control, then again, and returns the labels focus visits.
      const visit = async (key) => {
        await tab.getByRole('button', { name: LABELS[0] }).focus();
        const visited = [LABELS[0]];
        for (let step = 1; step < LABELS.length; step++) {
          await tab.keyboard.press(key);
          visited.push(await tab.evaluate(() => document.activeElement?.textContent));
        }
        return visited;
      };

      await t.test('a vertical toolbar stacks its controls in the order ArrowDown visits them', async () => {
        await open('vertical');
        assert.equal(await tab.locator('.muxui-toolbar').getAttribute('aria-orientation'), 'vertical');
        const [first, second, third] = await boxes();
        assert.ok(second.y >= first.y + first.height - 1 && third.y >= second.y + second.height - 1, `controls sit one under another (tops ${first.y}, ${second.y}, ${third.y})`);
        assert.ok(Math.abs(first.x - second.x) <= 1 && Math.abs(second.x - third.x) <= 1, `controls share one start edge (${first.x}, ${second.x}, ${third.x})`);
        assert.ok(Math.abs(first.width - second.width) <= 1 && Math.abs(second.width - third.width) <= 1, `controls stretch to one width (${first.width}, ${second.width}, ${third.width})`);
        assert.deepEqual(await visit('ArrowDown'), LABELS, 'ArrowDown visits the controls top to bottom');
        await tab.keyboard.press('ArrowUp');
        assert.equal(await tab.evaluate(() => document.activeElement?.textContent), 'Second', 'ArrowUp moves back up');
      });

      for (const [name, orientation] of [['by default', undefined], ['when horizontal', 'horizontal']]) {
        await t.test(`a toolbar keeps its row of controls ${name}`, async () => {
          await open(orientation);
          const [first, second, third] = await boxes();
          assert.ok(second.x >= first.x + first.width - 1 && third.x >= second.x + second.width - 1, `controls sit side by side (lefts ${first.x}, ${second.x}, ${third.x})`);
          assert.ok(Math.abs(first.y - second.y) <= 1 && Math.abs(second.y - third.y) <= 1, `controls share one top edge (${first.y}, ${second.y}, ${third.y})`);
          assert.deepEqual(await visit('ArrowRight'), LABELS, 'ArrowRight visits the controls left to right');
        });
      }

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
