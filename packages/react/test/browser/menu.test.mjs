import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Menu.Trigger draws Button's keyboard focus ring from the focus tokens, in place of the
// browser's own outline, and draws none at rest. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.mjs';
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(Menu.Root, null,
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
  test(`Menu.Trigger shows keyboard focus in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/button.mjs', 'src/collections.mjs'],
      pages: { '/menu.html': page },
      modules: { '/menu-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/menu.html`, { waitUntil: 'networkidle' });
      const trigger = tab.locator('#menu-trigger');
      // A ring can fade in, so read it once the element's transitions have finished.
      const paint = (locator) => locator.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        const { boxShadow, outlineStyle, outlineColor } = getComputedStyle(node);
        return { boxShadow, outlineStyle, outlineColor };
      });
      await trigger.waitFor();

      // The same ring as a Button.
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
    } finally {
      await browser?.close();
      await close();
    }
  });
}
