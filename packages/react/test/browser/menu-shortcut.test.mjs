import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Menu.Shortcut draws key caps at an item's end, clear of its label, that assistive technology never reads; the item
// states the real shortcut with aria-keyshortcuts. Runs in every engine named by MUXUI_BROWSER_ENGINES.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
document.documentElement.dataset.muxuiColorScheme = new URLSearchParams(location.search).get('scheme') ?? 'light';
createRoot(document.getElementById('root')).render(h(Menu, { 'aria-label': 'Edit' },
  h(Menu.Item, { id: 'duplicate', textValue: 'Duplicate', 'aria-keyshortcuts': 'Control+D' }, 'Duplicate', h(Menu.Shortcut, { keys: ['Ctrl', 'D'] })),
  h(Menu.Item, { id: 'rename' }, 'Rename')));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="reduced"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/menu-shortcut-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Menu.Shortcut sits at the item's end and is not read in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs'],
      pages: { '/menu-shortcut.html': page },
      modules: { '/menu-shortcut-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      for (const scheme of ['light', 'dark']) {
        await t.test(`in the ${scheme} scheme`, async () => {
          await tab.goto(`${url}/menu-shortcut.html?scheme=${scheme}`, { waitUntil: 'load' });
          const item = tab.getByRole('menuitem', { name: 'Duplicate', exact: true });
          await item.waitFor();
          await awaitFontsAndFrames(tab);
          assert.equal(await item.getAttribute('aria-keyshortcuts'), 'Control+D', 'the item states its real shortcut');
          const shortcut = item.locator('.muxui-menu__shortcut');
          assert.equal(await shortcut.getAttribute('aria-hidden'), 'true', 'the key caps are hidden from assistive technology');
          assert.deepEqual(await shortcut.locator('kbd.muxui-menu__shortcut-key').allTextContents(), ['Ctrl', 'D']);
          const layout = await item.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const keys = node.querySelector('.muxui-menu__shortcut').getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(node.firstChild);
            const key = getComputedStyle(node.querySelector('.muxui-menu__shortcut-key'));
            return { end: box.right - parseFloat(getComputedStyle(node).paddingRight) - keys.right, gap: keys.left - range.getBoundingClientRect().right, fill: key.backgroundColor, text: key.color };
          });
          assert.ok(Math.abs(layout.end) <= 1, `the keys end ${layout.end}px from the item's content edge`);
          assert.ok(layout.gap > 0, `the keys clear the label by ${layout.gap}px`);
          assert.notEqual(layout.fill, 'rgba(0, 0, 0, 0)', 'each key cap is filled');
          assert.notEqual(layout.fill, layout.text, 'and its text differs from its fill');
        });
      }
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
