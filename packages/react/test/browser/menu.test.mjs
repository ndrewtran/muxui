import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Menu.Trigger draws Button's keyboard focus ring from the focus tokens, in place of the
// browser's own outline, and draws none at rest or after a pointer click, including the
// first click on a fresh page. Runs in every engine named by MUXUI_BROWSER_ENGINES
// (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
// ?closed keeps the Menu closed whatever is clicked, so a pointer click only focuses the trigger.
const closed = new URLSearchParams(location.search).has('closed');
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(Menu.Root, closed ? { open: false, onOpenChange: () => {} } : null,
    // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps them focusable.
    h(Menu.Trigger, { id: 'menu-trigger', tabIndex: 0 }, 'Actions'),
    h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Actions', items: ['Rename', 'Delete'] }))),
  h(Button, { id: 'reference-button', tabIndex: 0 }, 'Reference')));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/menu-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Menu.Trigger shows keyboard focus in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/button.ts', 'src/collections.mjs'],
      pages: { '/menu.html': page },
      modules: { '/menu-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      // A ring can fade in, so read it once the element's transitions have finished.
      const paint = (locator) => locator.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        const { boxShadow, outlineStyle, outlineColor } = getComputedStyle(node);
        return { boxShadow, outlineStyle, outlineColor };
      });
      const open = async (query) => {
        const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        await tab.goto(`${url}/menu.html${query}`, { waitUntil: 'networkidle' });
        await tab.locator('#menu-trigger').waitFor();
        return { tab, errors };
      };

      await t.test('the ring is the Button ring, from keyboard focus only', async () => {
        const { tab, errors } = await open('');
        const trigger = tab.locator('#menu-trigger');
        await tab.locator('#before').focus();
        const resting = await paint(trigger);
        assert.equal(resting.boxShadow, 'none', 'a resting trigger draws no ring');
        await tab.keyboard.press('Tab');
        assert.ok(await trigger.evaluate((node) => node === document.activeElement), 'Tab reaches the trigger');
        const ring = await paint(trigger);
        assert.notEqual(ring.boxShadow, 'none', 'keyboard focus draws a ring');
        assert.notEqual(ring.outlineStyle, 'auto', "the browser's own outline gives way to the ring");
        await tab.keyboard.press('Tab');
        assert.equal((await paint(tab.locator('#reference-button'))).boxShadow, ring.boxShadow, 'the ring is the Button ring');
        assert.deepEqual(errors, []);
        await tab.close();
      });

      // On a fresh page no element has been focused, which is where the browser's own :focus-visible
      // once matched the first pointer click on a trigger that stays closed.
      await t.test('the first pointer click on a fresh page draws no ring, and the keyboard then does', async () => {
        const { tab, errors } = await open('?closed');
        const trigger = tab.locator('#menu-trigger');
        const box = await trigger.boundingBox();
        await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await tab.mouse.down();
        await tab.mouse.up();
        assert.ok(await trigger.evaluate((node) => node === document.activeElement), 'the click focuses the trigger');
        const clicked = await paint(trigger);
        assert.equal(clicked.boxShadow, 'none', 'pointer focus draws no ring');
        assert.equal(clicked.outlineStyle, 'none', 'pointer focus leaves no browser outline');

        await tab.keyboard.press('Tab');
        await tab.keyboard.press('Shift+Tab');
        assert.ok(await trigger.evaluate((node) => node === document.activeElement), 'the keyboard returns to the trigger');
        const ring = await paint(trigger);
        assert.notEqual(ring.boxShadow, 'none', 'keyboard focus then draws the ring');
        assert.deepEqual(errors, []);
        await tab.close();
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}
