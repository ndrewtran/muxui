import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof that a modal Popover gives focus back when it starts to
// close, not when its exit animation ends, and leaves alone focus that has
// already moved on. Keyboard-driven, since WebKit does not focus a clicked
// button. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, Popover } from '/src/overlays.ts';
import { Button } from '/src/button.ts';
import { Menu } from '/src/collections.mjs';
const h = React.createElement;

function Fixture() {
  const [open, setOpen] = React.useState(false);
  const [inlineOpen, setInlineOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const close = () => setOpen(false);
  React.useEffect(() => { document.documentElement.dataset.ready = 'true'; }, []);
  return h('main', null,
    h(Popover, { 'aria-label': 'Edit', open, onOpenChange: setOpen, trigger: h(Button, { id: 'trigger' }, 'Edit') },
      h('input', { id: 'name', 'aria-label': 'Name' }),
      h(Button, { id: 'save', onActivate: close }, 'Save'),
      // Each closes the Popover and opens an overlay the page renders.
      h(Button, { id: 'open-dialog', onActivate: () => { close(); setDialogOpen(true); } }, 'Rename'),
      h(Button, { id: 'open-menu', onActivate: () => { close(); setMenuOpen(true); } }, 'Move'),
      // Overlays opened from inside the Popover.
      h(Menu.Root, null,
        h(Menu.Trigger, { id: 'nested-menu-trigger' }, 'More'),
        h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'More' }, h(Menu.Item, { id: 'archive' }, 'Archive')))),
      h(Dialog, { title: 'Details', trigger: h(Button, { id: 'nested-dialog-trigger' }, 'Details') },
        h(Button, { id: 'nested-dialog-close', onActivate: close }, 'Close the popover')),
      h(Popover, { 'aria-label': 'Hint', modal: false, trigger: h(Button, { id: 'nested-popover-trigger' }, 'Hint') },
        h(Button, { id: 'nested-popover-close', onActivate: close }, 'Close the popover'))),
    h('input', { id: 'after-trigger', 'aria-label': 'After trigger' }),
    h(Popover, { 'aria-label': 'Inline', modal: false, open: inlineOpen, onOpenChange: setInlineOpen, trigger: h(Button, { id: 'inline-trigger' }, 'Inline') },
      h(Button, { id: 'inline-save', onActivate: () => setInlineOpen(false) }, 'Save')),
    h('div', { style: { height: 320 } }),
    h('input', { id: 'outside', 'aria-label': 'Outside' }),
    h(Dialog, { title: 'Rename', open: dialogOpen, onOpenChange: setDialogOpen }, h('input', { id: 'dialog-input', 'aria-label': 'New name' })),
    h(Menu.Root, { open: menuOpen, onOpenChange: setMenuOpen },
      h(Menu.Trigger, { id: 'page-menu-trigger' }, 'Move to'),
      h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Move to' }, h(Menu.Item, { id: 'inbox' }, 'Inbox')))));
}

createRoot(document.getElementById('root')).render(h(Fixture));
`;

let server;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.ts', 'src/button.ts', 'src/collections.mjs'],
    pages: {
      '/popover-focus.html': pageShell({
        attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
        head: '<link rel="stylesheet" href="/generated/styles.css">',
        bodyAttributes: 'style="margin: 32px"',
        body: '<div id="root"></div>',
        entry: '/popover-focus-entry.mjs',
      }),
    },
    modules: { '/popover-focus-entry.mjs': entry },
  });
});

after(async () => {
  await server?.close();
});

for (const engine of browserEngines()) {
  test(`a modal Popover returns focus as it starts to close in ${engine}`, { timeout: 240_000 }, async (t) => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 } });
      tab.setDefaultTimeout(5_000);
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

      const frames = (count = 3) => tab.evaluate((total) => new Promise((resolve) => {
        const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
        step(total);
      }), count);
      // The focused element, as `menu` inside a Menu popup, and whether the
      // named Popover is still in its exit, read together.
      const state = (label = 'Edit') => tab.evaluate((name) => {
        const active = document.activeElement;
        const positioner = document.querySelector(`.muxui-popover[aria-label="${name}"]`)?.closest('.muxui-popover__positioner');
        const focused = active?.closest('.muxui-menu__popup') ? 'menu' : active?.id || active?.getAttribute('role') || active?.tagName.toLowerCase();
        return { active: focused, exiting: positioner?.hasAttribute('data-muxui-state-exiting') ?? false };
      }, label);
      const exiting = (label = 'Edit') => tab.locator(`.muxui-popover__positioner[data-muxui-state-exiting]:has(> .muxui-popover[aria-label="${label}"])`).waitFor();
      const focusedWhileExiting = (id, message) => tab.waitForFunction((expected) => {
        const positioner = document.querySelector('.muxui-popover[aria-label="Edit"]')?.closest('.muxui-popover__positioner');
        return document.activeElement?.id === expected && positioner?.hasAttribute('data-muxui-state-exiting');
      }, id, { timeout: 1_500 }).catch(() => assert.fail(message));
      const focusIn = (selector) => tab.waitForFunction((value) => Boolean(document.activeElement?.closest(value)), selector);
      const settled = async (label = 'Edit') => {
        await tab.locator(`.muxui-popover[aria-label="${label}"]`).waitFor({ state: 'detached' });
        // React Aria restores focus a frame after unmount, and the opener fallback a frame after that.
        await frames();
        return (await state(label)).active;
      };
      const openEdit = async () => {
        await tab.locator('#trigger').focus();
        await tab.keyboard.press('Enter');
        await focusIn('.muxui-popover[aria-label="Edit"]');
      };
      const press = async (selector, key = 'Enter') => {
        await tab.locator(selector).focus();
        await tab.keyboard.press(key);
      };
      // Each case starts on a fresh page, since React Aria's focus-scope history
      // from an earlier case can change where it restores focus. The long exit
      // holds the Popover in its exit while a case reads focus.
      const scenario = (name, run) => t.test(name, async () => {
        await tab.goto(`${server.url}/popover-focus.html`, { waitUntil: 'load' });
        await tab.waitForFunction(() => document.documentElement.dataset.ready === 'true');
        await awaitFontsAndFrames(tab);
        await tab.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-dismiss-transition-duration', '2000ms'));
        errors.length = 0;
        await run();
        assert.deepEqual(errors, [], errors.join('\n'));
      });

      await scenario('an action that closes the Popover returns focus to the trigger at once', async () => {
        await openEdit();
        await press('#save');
        await focusedWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        await tab.keyboard.press('Tab');
        await tab.keyboard.type('ab');
        assert.deepEqual(await state(), { active: 'after-trigger', exiting: true }, 'Tab moves on from the trigger, not around the closing Popover');
        assert.equal(await tab.locator('#after-trigger').inputValue(), 'ab', 'typing during the exit reaches the field');
        assert.equal(await settled(), 'after-trigger', 'the Popover does not pull focus back when it unmounts');
      });

      await scenario('Escape closes the Popover and returns focus at once', async () => {
        await openEdit();
        await press('#name', 'Escape');
        await focusedWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        assert.equal(await settled(), 'trigger');
      });

      await scenario('a click on another control during the exit keeps focus there', async () => {
        await openEdit();
        await press('#save');
        await exiting();
        await tab.locator('#outside').click();
        await tab.keyboard.type('xy');
        assert.deepEqual(await state(), { active: 'outside', exiting: true }, 'the closing Popover does not pull focus back');
        assert.equal(await tab.locator('#outside').inputValue(), 'xy');
        assert.equal(await settled(), 'outside', 'nor does it when it unmounts');
      });

      await scenario('a Dialog the page opens as the Popover closes keeps focus', async () => {
        await openEdit();
        await press('#open-dialog');
        await focusIn('.muxui-dialog');
        await frames();
        assert.deepEqual(await state(), { active: 'dialog', exiting: true }, 'the Dialog keeps focus while the Popover exits');
        assert.equal(await settled(), 'dialog');
        await tab.keyboard.press('Escape');
        await tab.locator('.muxui-dialog').waitFor({ state: 'detached' });
        await tab.waitForFunction(() => document.activeElement?.id === 'trigger');
      });

      await scenario('a Menu the page opens as the Popover closes keeps focus', async () => {
        await openEdit();
        await press('#open-menu');
        await focusIn('.muxui-menu__popup');
        await frames();
        assert.deepEqual(await state(), { active: 'menu', exiting: true }, 'the Menu keeps focus while the Popover exits');
        assert.equal(await settled(), 'menu');
      });

      await scenario('a Dialog opened from inside keeps focus while the Popover closes beneath it', async () => {
        await openEdit();
        await press('#nested-dialog-trigger');
        await focusIn('.muxui-dialog');
        await press('#nested-dialog-close');
        await exiting();
        await frames();
        assert.deepEqual(await state(), { active: 'nested-dialog-close', exiting: true });
        assert.equal(await settled(), 'trigger', 'focus returns to the trigger once the Popover and its Dialog have gone');
      });

      await scenario('a non-modal Popover opened from inside keeps focus while the Popover closes beneath it', async () => {
        await openEdit();
        await press('#nested-popover-trigger');
        await tab.locator('.muxui-popover[aria-label="Hint"]').waitFor();
        await press('#nested-popover-close');
        await exiting();
        await frames();
        assert.deepEqual(await state(), { active: 'nested-popover-close', exiting: true });
        assert.equal(await settled(), 'trigger');
      });

      await scenario('Escape in a Menu opened from inside closes only the Menu', async () => {
        await openEdit();
        await press('#nested-menu-trigger');
        await focusIn('.muxui-menu__popup');
        await tab.keyboard.press('Escape');
        await tab.locator('.muxui-menu__popup').waitFor({ state: 'detached' });
        await tab.waitForFunction(() => document.activeElement?.id === 'nested-menu-trigger');
        assert.deepEqual(await state(), { active: 'nested-menu-trigger', exiting: false });
      });

      await scenario('reopening during the exit moves focus back into the Popover', async () => {
        await openEdit();
        await press('#save');
        await focusedWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        await tab.keyboard.press('Enter');
        await tab.waitForFunction(() => {
          const surface = document.querySelector('.muxui-popover[aria-label="Edit"]');
          return surface?.contains(document.activeElement) && !surface.closest('.muxui-popover__positioner').hasAttribute('data-muxui-state-exiting');
        }).catch(() => assert.fail('the reopened Popover takes focus'));
        await press('#name', 'Shift+Tab');
        assert.equal(await tab.evaluate(() => document.querySelector('.muxui-popover[aria-label="Edit"]').contains(document.activeElement)), true, 'the reopened Popover contains focus again');
      });

      await scenario('a non-modal Popover is unchanged: it returns focus once it has gone', async () => {
        await tab.locator('#inline-trigger').focus();
        await tab.keyboard.press('Enter');
        await tab.locator('.muxui-popover[aria-label="Inline"]').waitFor();
        await press('#inline-save');
        await exiting('Inline');
        await frames();
        assert.deepEqual(await state('Inline'), { active: 'inline-save', exiting: true });
        await tab.locator('.muxui-popover[aria-label="Inline"]').waitFor({ state: 'detached' });
        await tab.waitForFunction(() => document.activeElement?.id === 'inline-trigger');
      });

      await scenario('reduced motion is unchanged: the Popover closes at once and returns focus', async () => {
        await tab.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
        await openEdit();
        await press('#save');
        await tab.waitForFunction(() => !document.querySelector('.muxui-popover') && document.activeElement?.id === 'trigger');
        await frames();
        assert.equal((await state()).active, 'trigger');
      });
    } finally {
      await browser.close();
    }
  });
}
