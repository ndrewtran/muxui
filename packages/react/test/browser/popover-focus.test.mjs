import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof that a modal Popover gives focus back when it starts to
// close, not when its exit animation ends, keeps the exiting Popover out of
// reach, and leaves alone focus that has already moved on. Keyboard-driven,
// since WebKit does not focus a clicked button. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, Popover } from '/src/overlays.ts';
import { Button } from '/src/button.ts';
import { Menu } from '/src/collections.mjs';
const h = React.createElement;
const layout = new URLSearchParams(location.search).get('layout');

function useReady() {
  React.useEffect(() => { document.documentElement.dataset.ready = 'true'; }, []);
}

// A page whose only other tab stop comes before the trigger, so the trigger is
// the last tab stop, or after it, so the trigger is the first. A wide control
// outside the tab order lies beneath the open Popover.
function Edge() {
  const [open, setOpen] = React.useState(false);
  useReady();
  const other = h('input', { key: 'other', id: 'other', 'aria-label': 'Other' });
  const popover = h(Popover, { key: 'popover', 'aria-label': 'Edit', open, onOpenChange: setOpen, trigger: h(Button, { id: 'trigger' }, 'Edit') },
    h('input', { id: 'name', 'aria-label': 'Name' }),
    h(Button, { id: 'save', onActivate: () => { window.saves = (window.saves ?? 0) + 1; setOpen(false); } }, 'Save'));
  return h('main', null, layout === 'last' ? [other, popover] : [popover, other],
    h('button', { id: 'beneath', tabIndex: -1, style: { display: 'block', width: 600, height: 300, marginTop: 4 }, onClick: () => { window.beneathPresses = (window.beneathPresses ?? 0) + 1; } }, 'Beneath'));
}

function Fixture() {
  const [open, setOpen] = React.useState(false);
  const [inlineOpen, setInlineOpen] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [triggerHidden, setTriggerHidden] = React.useState(false);
  const [triggerVersion, setTriggerVersion] = React.useState(0);
  const [elsewhere, setElsewhere] = React.useState(true);
  const close = () => setOpen(false);
  useReady();
  React.useEffect(() => {
    // A new key gives the trigger a new DOM node.
    window.replaceTrigger = () => setTriggerVersion((version) => version + 1);
    window.removeElsewhere = () => setElsewhere(false);
  }, []);
  return h('main', null,
    // Button styles override the hidden attribute, so a class hides the trigger.
    h('style', null, '.trigger-gone { display: none; }'),
    h(Popover, { 'aria-label': 'Edit', open, onOpenChange: setOpen, trigger: h(Button, { key: triggerVersion, id: 'trigger', className: triggerHidden ? 'trigger-gone' : undefined }, 'Edit') },
      h('input', { id: 'name', 'aria-label': 'Name' }),
      h(Button, { id: 'save', onActivate: close }, 'Save'),
      h(Button, { id: 'save-hide', onActivate: () => { close(); setTriggerHidden(true); } }, 'Save and hide'),
      // Each closes the Popover and opens an overlay the page renders.
      h(Button, { id: 'open-dialog', onActivate: () => { close(); setDialogOpen(true); } }, 'Rename'),
      h(Button, { id: 'open-menu', onActivate: () => { close(); setMenuOpen(true); } }, 'Move'),
      h(Button, { id: 'open-swap', onActivate: () => { close(); setSwapOpen(true); } }, 'Swap'),
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
    elsewhere ? h('button', { id: 'elsewhere' }, 'Elsewhere') : null,
    h('div', { id: 'transitioning', style: { width: 8, height: 8 } }),
    h(Dialog, { title: 'Rename', open: dialogOpen, onOpenChange: setDialogOpen }, h('input', { id: 'dialog-input', 'aria-label': 'New name' })),
    h(Menu.Root, { open: menuOpen, onOpenChange: setMenuOpen },
      h(Menu.Trigger, { id: 'page-menu-trigger' }, 'Move to'),
      h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Move to' }, h(Menu.Item, { id: 'inbox' }, 'Inbox')))),
    // A second modal Popover, opened by an action in the first or by the Actions menu.
    h(Popover, { 'aria-label': 'Swap', open: swapOpen, onOpenChange: setSwapOpen, trigger: h(Button, { id: 'swap-trigger' }, 'Swap target') },
      h('input', { id: 'swap-input', 'aria-label': 'Swap input' })),
    h(Menu.Root, null,
      h(Menu.Trigger, { id: 'actions-trigger' }, 'Actions'),
      h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Actions' }, h(Menu.Item, { id: 'swap', onAction: () => setSwapOpen(true) }, 'Swap')))));
}

createRoot(document.getElementById('root')).render(h(layout ? Edge : Fixture));
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
  test(`a modal Popover returns focus as it starts to close in ${engine}`, { timeout: 300_000 }, async (t) => {
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
      // Whether the exiting Popover holds focus, what reached its field, and whether its surface is inert.
      const reach = () => tab.evaluate(() => {
        const surface = document.querySelector('.muxui-popover[aria-label="Edit"]');
        const positioner = surface.closest('.muxui-popover__positioner');
        return { inPopover: positioner.contains(document.activeElement), typed: document.getElementById('name').value, inert: surface.inert, exiting: positioner.hasAttribute('data-muxui-state-exiting') };
      });
      const surfaceInert = (label) => tab.evaluate((name) => document.querySelector(`.muxui-popover[aria-label="${name}"]`).inert, label);
      const exiting = (label = 'Edit') => tab.locator(`.muxui-popover__positioner[data-muxui-state-exiting]:has(> .muxui-popover[aria-label="${label}"])`).waitFor();
      // The restore runs in the first frame after closing starts, so two frames are its bound.
      const expectFocusWhileExiting = async (id, message) => {
        await frames(2);
        assert.deepEqual(await state(), { active: id, exiting: true }, message);
      };
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
      // Records each element that takes focus from here on, as `menu` inside a Menu popup.
      const logFocus = () => tab.evaluate(() => {
        window.focusLog = [];
        document.addEventListener('focusin', (event) => window.focusLog.push(event.target.closest('.muxui-menu__popup') ? 'menu' : event.target.id || event.target.tagName.toLowerCase()), true);
      });
      // Each case starts on a fresh page, since React Aria's focus-scope history
      // from an earlier case can change where it restores focus. The long exit
      // holds the Popover in its exit while a case reads focus.
      const scenario = (name, run, { layout } = {}) => t.test(name, async () => {
        await tab.goto(`${server.url}/popover-focus.html${layout ? `?layout=${layout}` : ''}`, { waitUntil: 'load' });
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
        await expectFocusWhileExiting('trigger', 'focus is on the trigger within two frames, while the Popover exits');
        await tab.keyboard.press('Tab');
        await tab.keyboard.type('ab');
        assert.deepEqual(await state(), { active: 'after-trigger', exiting: true }, 'Tab moves on from the trigger, not around the closing Popover');
        assert.equal(await tab.locator('#after-trigger').inputValue(), 'ab', 'typing during the exit reaches the field');
        assert.equal(await settled(), 'after-trigger', 'the Popover does not pull focus back when it unmounts');
      });

      await scenario('Escape closes the Popover and returns focus at once', async () => {
        await openEdit();
        await press('#name', 'Escape');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger within two frames, while the Popover exits');
        assert.equal(await settled(), 'trigger');
      });

      await scenario('Tab from the trigger as the last tab stop does not reach the exiting Popover', async () => {
        await openEdit();
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        await tab.keyboard.press('Tab');
        await tab.keyboard.type('z');
        assert.deepEqual(await reach(), { inPopover: false, typed: '', inert: true, exiting: true });
      }, { layout: 'last' });

      await scenario('Shift+Tab from the trigger as the first tab stop does not reach the exiting Popover', async () => {
        await openEdit();
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        // The first press leaves the page and the second comes back in at its
        // end, where the Popover is portaled. Firefox keeps focus on the trigger.
        await tab.keyboard.press('Shift+Tab');
        await tab.keyboard.press('Shift+Tab');
        await tab.keyboard.type('z');
        assert.deepEqual(await reach(), { inPopover: false, typed: '', inert: true, exiting: true });
      }, { layout: 'first' });

      await scenario('a pointer press reaches neither the exiting Popover nor the page beneath it', async () => {
        await openEdit();
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        const box = await tab.locator('#save').boundingBox();
        const beneath = await tab.locator('#beneath').boundingBox();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        assert.ok(x > beneath.x && x < beneath.x + beneath.width && y > beneath.y && y < beneath.y + beneath.height, 'Save lies over the page control');
        await tab.mouse.dblclick(x, y);
        assert.deepEqual(await tab.evaluate(() => ({ active: document.activeElement?.id, saves: window.saves, beneathPresses: window.beneathPresses ?? 0 })), { active: 'trigger', saves: 1, beneathPresses: 0 }, 'the presses neither save again, nor move focus, nor fall through');
        await tab.keyboard.type('z');
        assert.deepEqual(await reach(), { inPopover: false, typed: '', inert: true, exiting: true });
      }, { layout: 'last' });

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

      await scenario('a second Popover dismissed during the first one\'s exit does not focus the dismissed button', async () => {
        await openEdit();
        await press('#open-swap');
        await focusIn('.muxui-popover[aria-label="Swap"]');
        await logFocus();
        await tab.keyboard.press('Escape');
        await frames();
        assert.equal((await state()).exiting, true, 'the first Popover is still in its exit');
        assert.equal((await state('Swap')).exiting, true);
        assert.ok(!(await tab.evaluate(() => window.focusLog)).includes('open-swap'), 'the button that opened the second Popover never takes focus');
      });

      await scenario('a Popover dismissed during the exit of the Menu that opened it does not focus the dismissed item', async () => {
        await press('#actions-trigger');
        await focusIn('.muxui-menu__popup');
        await tab.keyboard.press('Enter');
        await focusIn('.muxui-popover[aria-label="Swap"]');
        await logFocus();
        await tab.keyboard.press('Escape');
        await frames();
        assert.equal(await tab.locator('.muxui-menu__popup[data-muxui-state-exiting]').count(), 1, 'the Menu is still in its exit');
        assert.equal((await state('Swap')).exiting, true);
        assert.ok(!(await tab.evaluate(() => window.focusLog)).includes('menu'), 'the dismissed Menu item never takes focus');
      });

      await scenario('a trigger the closing action hides gets a single focus restore', async () => {
        await tab.evaluate(() => {
          window.restores = 0;
          document.addEventListener('react-aria-focus-scope-restore', (event) => { if (event.target.id === 'trigger') window.restores += 1; }, true);
        });
        await openEdit();
        await press('#save-hide');
        await settled();
        assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById('trigger')).display), 'none');
        assert.equal(await tab.evaluate(() => window.restores), 1, 'one restore, left to React Aria');
      });

      await scenario('a reopen with a replaced trigger returns focus to the replacement', async () => {
        await openEdit();
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        await tab.evaluate(() => {
          document.getElementById('trigger').replaced = true;
          window.replaceTrigger();
        });
        await tab.waitForFunction(() => document.getElementById('trigger') && !document.getElementById('trigger').replaced);
        await press('#trigger');
        await tab.waitForFunction(() => {
          const surface = document.querySelector('.muxui-popover[aria-label="Edit"]');
          return surface?.contains(document.activeElement) && !surface.closest('.muxui-popover__positioner').hasAttribute('data-muxui-state-exiting');
        }).catch(() => assert.fail('the replacement trigger reopens the Popover during its exit'));
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus returns to the replacement trigger');
        assert.equal(await tab.evaluate(() => document.activeElement.replaced), undefined);
      });

      await scenario('a restore waiting for transitions under a virtual cursor ends with the Popover', async () => {
        // React Aria runs waiting restores once no transition it counts is running. A focus-ring transition that a button
        // cancels can stay counted, so button transitions are off here and the queue drains when this case's own ends.
        await tab.addStyleTag({ content: '.muxui-button { transition: none !important; }' });
        await openEdit();
        // A running transition holds React Aria's virtual-cursor restore until it ends.
        await tab.evaluate(() => {
          const node = document.getElementById('transitioning');
          window.transitionEnded = new Promise((resolve) => node.addEventListener('transitionend', resolve, { once: true }));
          node.style.transition = 'opacity 4s linear';
          node.getBoundingClientRect();
          node.style.opacity = '0';
        });
        await frames(2);
        // A click with no pointer, as a screen reader sends, closes the Popover.
        await tab.evaluate(() => document.getElementById('save').click());
        await frames();
        await tab.evaluate(() => document.getElementById('elsewhere').focus());
        await tab.locator('.muxui-popover[aria-label="Edit"]').waitFor({ state: 'detached' });
        await tab.evaluate(() => window.removeElsewhere());
        await tab.waitForFunction(() => !document.getElementById('elsewhere'));
        await tab.evaluate(() => window.transitionEnded);
        await frames();
        assert.equal((await state()).active, 'body', 'focus moved away before the Popover unmounted, so no restore follows');
      });

      await scenario('reopening during the exit moves focus back into the Popover', async () => {
        await openEdit();
        await press('#save');
        await expectFocusWhileExiting('trigger', 'focus is on the trigger while the Popover exits');
        await tab.keyboard.press('Enter');
        await tab.waitForFunction(() => {
          const surface = document.querySelector('.muxui-popover[aria-label="Edit"]');
          return surface?.contains(document.activeElement) && !surface.closest('.muxui-popover__positioner').hasAttribute('data-muxui-state-exiting');
        }).catch(() => assert.fail('the reopened Popover takes focus'));
        assert.equal(await surfaceInert('Edit'), false, 'the reopened Popover is no longer inert');
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
        assert.equal(await surfaceInert('Inline'), false, 'a non-modal Popover stays reachable in its exit');
        await tab.locator('.muxui-popover[aria-label="Inline"]').waitFor({ state: 'detached' });
        await tab.waitForFunction(() => document.activeElement?.id === 'inline-trigger');
      });

      await scenario('reduced motion is unchanged: the Popover closes at once and returns focus', async () => {
        await tab.evaluate(() => document.documentElement.setAttribute('data-muxui-motion', 'reduced'));
        await openEdit();
        await press('#save');
        await frames(2);
        assert.deepEqual(await tab.evaluate(() => ({ popovers: document.querySelectorAll('.muxui-popover').length, active: document.activeElement?.id })), { popovers: 0, active: 'trigger' }, 'gone and focus returned within two frames');
      });
    } finally {
      await browser.close();
    }
  });
}
