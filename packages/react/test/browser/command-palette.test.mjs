import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// CommandPalette.Trigger draws Button's keyboard focus ring, never for the first pointer
// click on a fresh page, and the focused CommandPalette.Input draws the field focus
// border, both from the focus tokens.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { CommandPalette } from '/src/supplemental/index.mjs';

const h = React.createElement;
// ?closed keeps the palette closed whatever is clicked, so a pointer click only focuses the Trigger.
const closed = new URLSearchParams(location.search).has('closed');
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(CommandPalette.Root, closed ? { open: false, onOpenChange: () => {} } : null,
    // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps them focusable.
    h(CommandPalette.Trigger, { id: 'palette-trigger', tabIndex: 0 }, 'Commands'),
    h(CommandPalette.Backdrop, null, h(CommandPalette.Popup, null,
      h(CommandPalette.Title, null, 'Commands'),
      h(CommandPalette.Close, { id: 'palette-close' }),
      h(CommandPalette.Content, null,
        h(CommandPalette.SearchField, null, h(CommandPalette.Input, { id: 'palette-input', placeholder: 'Search commands' })),
        h(CommandPalette.ListBox, null, h(CommandPalette.Item, { id: 'alpha', title: 'Alpha' })))))),
  h(Button, { id: 'reference-button', tabIndex: 0 }, 'Reference')));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/command-palette-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`CommandPalette Trigger and Input show keyboard focus in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/button.ts', 'src/supplemental/index.mjs'],
      pages: { '/command-palette.html': page },
      modules: { '/command-palette-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/command-palette.html`, { waitUntil: 'networkidle' });
      const trigger = tab.locator('#palette-trigger');
      // A Button's ring fades in, so read it once its transitions have finished.
      const shadow = (locator) => locator.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        return getComputedStyle(node).boxShadow;
      });
      await trigger.waitFor();

      await t.test('the Trigger draws the same ring as a Button, from keyboard focus only', async () => {
        await tab.locator('#before').focus();
        assert.equal(await shadow(trigger), 'none', 'a resting Trigger draws no ring');
        await tab.keyboard.press('Tab');
        assert.ok(await trigger.evaluate((node) => node === document.activeElement), 'Tab reaches the Trigger');
        const ring = await shadow(trigger);
        assert.notEqual(ring, 'none', 'keyboard focus draws a ring');
        await tab.keyboard.press('Tab');
        assert.equal(await shadow(tab.locator('#reference-button')), ring, 'the ring is the Button ring');

        // The mouse press focuses the Trigger before it activates on release.
        await tab.locator('#before').focus();
        const box = await trigger.boundingBox();
        await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await tab.mouse.down();
        try {
          assert.ok(await trigger.evaluate((node) => node === document.activeElement), 'a press focuses the Trigger');
          assert.equal(await shadow(trigger), 'none', 'pointer focus draws no ring');
        } finally {
          await tab.mouse.up();
        }
      });

      await t.test('the focused Input draws the field focus border', async () => {
        // Releasing the press above opened the palette; open it here if it is not.
        const input = tab.locator('#palette-input');
        if (await input.count() === 0) await trigger.click();
        await input.waitFor();
        await input.focus();
        const read = () => input.evaluate((node) => {
          // The popup scopes the field focus tokens, so resolve them beside the input.
          const probe = document.createElement('span');
          probe.style.outlineColor = 'var(--muxui-field-focus-border)';
          node.parentElement.append(probe);
          const focusBorder = getComputedStyle(probe).outlineColor;
          probe.remove();
          return { focused: node === document.activeElement, outline: getComputedStyle(node).outlineColor, focusBorder };
        });
        const focused = await read();
        assert.equal(focused.focused, true);
        assert.equal(focused.outline, focused.focusBorder, 'a focused Input draws the field focus border');
        await tab.locator('#palette-close').focus();
        const resting = await read();
        assert.equal(resting.focused, false);
        assert.notEqual(resting.outline, focused.outline, 'a resting Input keeps the field border');
      });

      // On a fresh page no element has been focused yet, where a browser's own :focus-visible can match a first pointer click.
      await t.test('the first pointer click on a fresh page draws no ring, and the keyboard then does', async () => {
        const fresh = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        const freshErrors = [];
        fresh.on('pageerror', (error) => freshErrors.push(error.message));
        await fresh.goto(`${url}/command-palette.html?closed`, { waitUntil: 'networkidle' });
        const freshTrigger = fresh.locator('#palette-trigger');
        await freshTrigger.waitFor();
        const box = await freshTrigger.boundingBox();
        await fresh.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await fresh.mouse.down();
        await fresh.mouse.up();
        assert.ok(await freshTrigger.evaluate((node) => node === document.activeElement), 'the click focuses the Trigger');
        assert.equal(await fresh.getByRole('dialog').count(), 0, 'the palette stays closed');
        assert.equal(await shadow(freshTrigger), 'none', 'pointer focus draws no ring');

        await fresh.keyboard.press('Tab');
        await fresh.keyboard.press('Shift+Tab');
        assert.ok(await freshTrigger.evaluate((node) => node === document.activeElement), 'the keyboard returns to the Trigger');
        assert.notEqual(await shadow(freshTrigger), 'none', 'keyboard focus then draws the ring');
        assert.deepEqual(freshErrors, []);
        await fresh.close();
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
