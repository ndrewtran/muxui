import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// React Aria makes a tab panel a focus stop only when it has no tabbable content.
// That stop draws the Tabs focus ring for keyboard focus, never for pointer focus,
// and a panel that wraps tabbable content draws none. Runs in every engine named
// by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Tabs } from '/src/collections.mjs';

const h = React.createElement;
// WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps them focusable.
const items = [
  { id: 'plain', label: 'Plain', panel: h('p', { id: 'plain-text' }, 'Text with nothing to tab to') },
  { id: 'wrapped', label: 'Wrapped', panel: h('button', { id: 'inner-button', type: 'button', tabIndex: 0 }, 'Inside the panel') },
];
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(Tabs, { 'aria-label': 'Sections', items, defaultValue: 'plain' })));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 24px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/tabs-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Tabs panel shows keyboard focus only where it is the focus stop in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs'],
      pages: { '/tabs.html': page },
      modules: { '/tabs-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/tabs.html`, { waitUntil: 'networkidle' });
      const panel = tab.locator('[role="tabpanel"]');
      await panel.waitFor();

      const readPanel = () => panel.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.outlineColor = 'var(--muxui-semantic-focus-ring)';
        node.parentElement.append(probe);
        const ring = getComputedStyle(probe).outlineColor;
        probe.remove();
        const style = getComputedStyle(node);
        return {
          focused: node === document.activeElement,
          focusVisible: node.matches(':focus-visible'),
          tabIndex: node.getAttribute('tabindex'),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          ring,
        };
      });
      const selectTab = async (name) => {
        await tab.getByRole('tab', { name }).click();
        await tab.getByRole('tab', { name, selected: true }).waitFor();
      };

      await t.test('a panel with no tabbable content draws the ring on keyboard focus', async () => {
        await selectTab('Plain');
        assert.equal((await readPanel()).tabIndex, '0', 'the panel is a focus stop');
        assert.equal((await readPanel()).outlineStyle, 'none', 'a resting panel draws no ring');
        await tab.getByRole('tab', { name: 'Plain' }).focus();
        await tab.keyboard.press('Tab');
        const focused = await readPanel();
        assert.equal(focused.focused, true, 'Tab from the tab reaches the panel');
        assert.equal(focused.outlineStyle, 'solid');
        assert.equal(focused.outlineWidth, '2px');
        assert.equal(focused.outlineColor, focused.ring, 'the ring is the focus ring token');
      });

      await t.test('pointer focus on the panel draws no ring', async () => {
        await tab.locator('#before').focus();
        await panel.click({ position: { x: 4, y: 4 } });
        await tab.mouse.move(0, 0);
        const pressed = await readPanel();
        assert.equal(pressed.focused, true, 'a click focuses the panel');
        assert.equal(pressed.focusVisible, false);
        assert.equal(pressed.outlineStyle, 'none');
      });

      await t.test('a panel that wraps tabbable content is not a focus stop and draws no ring', async () => {
        await selectTab('Wrapped');
        assert.equal((await readPanel()).tabIndex, null, 'the panel has no tabindex');
        await tab.getByRole('tab', { name: 'Wrapped' }).focus();
        await tab.keyboard.press('Tab');
        assert.ok(await tab.locator('#inner-button').evaluate((node) => node === document.activeElement), 'Tab goes to the content inside the panel');
        const wrapping = await readPanel();
        assert.equal(wrapping.focused, false);
        assert.equal(wrapping.outlineStyle, 'none');
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
