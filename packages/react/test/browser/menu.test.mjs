import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Menu.Trigger draws Button's keyboard focus ring from the focus tokens, in place of the
// browser's own outline, and draws none at rest or after a pointer click, including the
// first click on a fresh page. An open Menu closes on Tab and Shift+Tab and lets focus move on
// from its trigger, however it was opened, with a submenu open, and past a disabled fieldset,
// a positive tabindex or a radio group; Escape still returns focus to the trigger. Runs in
// every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { Menu, Toolbar } from '/src/collections.mjs';

const h = React.createElement;
const params = new URLSearchParams(location.search);
// ?closed keeps the Menu closed whatever is clicked, so a pointer click only focuses the trigger.
const closed = params.has('closed');
// Radios, a disabled fieldset and a positive tabindex around the trigger: the real Tab order is not the DOM order.
// WebKit on macOS skips plain buttons and radios in sequential navigation; an explicit tabindex keeps them focusable.
const radios = (name, checked) => h('div', null, [0, 1, 2].map((index) => h('input', { key: index, type: 'radio', name, id: name + index, 'aria-label': name + ' ' + index, tabIndex: 0, defaultChecked: index === checked })));
const around = {
  fieldset: { after: [h('fieldset', { key: 'fieldset', disabled: true }, h('button', { type: 'button', id: 'trapped', tabIndex: 0 }, 'Trapped')), h('button', { key: 'after', type: 'button', id: 'after-fieldset', tabIndex: 0 }, 'After fieldset')] },
  positive: { after: [h('button', { key: 'positive', type: 'button', id: 'positive', tabIndex: 1 }, 'Positive')] },
  radios: { before: [radios('rb', 0)], after: [radios('ra', 1)] },
}[params.get('around')] ?? {};
// ?submenu puts a submenu in the list, whose popup is a second overlay to close with the first.
const list = params.has('submenu')
  ? h(Menu.List, { 'aria-label': 'Actions' },
    h(Menu.Item, { id: 'rename' }, 'Rename'),
    h(Menu.Submenu, { delay: 20 }, h(Menu.Item, { id: 'more' }, 'More'), h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'More actions', items: ['Archive', 'Export'] }))))
  : h(Menu.List, { 'aria-label': 'Actions', items: ['Rename', 'Delete'] });
// ?anchored opens a controlled Menu.Root from a native button, with no Menu.Trigger, anchored to a point that cannot take
// focus; ?detach anchors it to a button instead and removes the opener once the menu is open.
function Anchored() {
  const [open, setOpen] = React.useState(false);
  const [gone, setGone] = React.useState(false);
  const detach = params.has('detach');
  const anchor = React.useRef(null);
  React.useEffect(() => {
    if (!open || !detach) return undefined;
    const timer = setTimeout(() => setGone(true), 100);
    return () => clearTimeout(timer);
  }, [open, detach]);
  return h(React.Fragment, null,
    !gone && h('button', { id: 'opener', type: 'button', tabIndex: 0, onClick: () => setOpen(true) }, 'Open'),
    detach ? h('button', { id: 'anchor', type: 'button', tabIndex: 0, ref: anchor }, 'Anchor') : h('span', { id: 'anchor', ref: anchor }),
    h(Menu.Root, { open, onOpenChange: setOpen }, h(Menu.Popup, { anchorRef: anchor }, list)));
}
const menu = h(Menu.Root, closed ? { open: false, onOpenChange: () => {} } : null,
  h(Menu.Trigger, { id: 'menu-trigger', tabIndex: 0 }, 'Actions'),
  h(Menu.Popup, null, list));
// ?toolbar puts the trigger between two controls of a Toolbar.
const toolbar = h(Toolbar, { 'aria-label': 'Formatting' },
  h(Button, { id: 'toolbar-first', tabIndex: 0 }, 'Bold'),
  menu,
  h(Button, { id: 'toolbar-last', tabIndex: 0 }, 'Italic'));
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  around.before,
  params.has('anchored') ? h(Anchored) : params.has('toolbar') ? toolbar : menu,
  around.after,
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

for (const engine of browserEngines()) {
  test(`Menu closes on Tab and lets focus move on from its trigger in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/button.ts', 'src/collections.mjs'],
      pages: { '/menu.html': page },
      modules: { '/menu-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/menu.html`, '#menu-trigger');
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      try {
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        const trigger = tab.locator('#menu-trigger');
        const anyMenu = tab.locator('[role="menu"]').first();
        const holding = (selector) => tab.evaluate((selector) => document.activeElement === document.querySelector(selector), selector);
        const stray = () => tab.evaluate(() => document.activeElement?.outerHTML.slice(0, 120));
        const visit = async (query, opener = '#menu-trigger') => {
          await tab.goto(`${url}/menu.html${query}`, { waitUntil: 'networkidle' });
          await tab.locator(opener).waitFor({ timeout: 15_000 });
        };
        // Opens the menu from its trigger, or from the native button that opens an anchored menu, and waits for focus to be
        // inside it, with a submenu open too when asked.
        const open = async (how, { submenu = false, opener = '#menu-trigger' } = {}) => {
          if (how === 'keyboard') {
            await tab.locator(opener).focus();
            await tab.keyboard.press(opener === '#menu-trigger' ? 'ArrowDown' : 'Enter');
          } else {
            await tab.locator(opener).click();
          }
          await anyMenu.waitFor({ timeout: 5000 });
          await pollUntil(tab, () => document.activeElement?.closest('[role="menu"]') != null, undefined, { message: `${engine}: focus enters the ${how}-opened menu`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
          if (!submenu) return;
          // A pointer-opened menu has focus on the list, a keyboard-opened one on its first item.
          if (how === 'pointer') await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('ArrowRight');
          await tab.locator('[role="menu"][aria-label="More actions"]').waitFor({ timeout: 5000 });
          await pollUntil(tab, () => document.activeElement?.closest('[role="menu"]')?.getAttribute('aria-label') === 'More actions', undefined, { message: `${engine}: focus enters the submenu`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
        };
        // Where Tab and Shift+Tab go from the trigger is the browser's call, so the page around it is shaped to tell its
        // rules from document order: a button in a disabled fieldset cannot take focus, a positive tabindex jumps the queue
        // and so is never next, and a radio group is entered at its checked radio, not its first or last.
        const scenarios = [
          { name: 'a plain neighbour', query: '', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
          { name: 'a disabled fieldset', query: '?around=fieldset', expected: { Tab: '#after-fieldset', 'Shift+Tab': '#before' } },
          { name: 'a positive tabindex', query: '?around=positive', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
          { name: 'a radio group', query: '?around=radios', expected: { Tab: '#ra1', 'Shift+Tab': '#rb0' } },
          { name: 'an open submenu', query: '?submenu', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
          // A Toolbar moves focus to its boundary before Tab, so Tab from the closed trigger leaves it, and so must Tab from the menu.
          { name: 'a trigger inside a Toolbar', query: '?toolbar', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' }, closedToo: true },
          // No Menu.Trigger: focus returns to the native button that opened the menu, or to the anchor once that is gone.
          { name: 'a menu opened from a native button', query: '?anchored', opener: '#opener', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
          { name: 'a menu whose opener is gone, from its anchor', query: '?anchored&detach', opener: '#opener', detached: true, expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
        ];
        for (const { name, query, opener = '#menu-trigger', detached = false, closedToo = false, expected } of scenarios) {
          await t.test(`Tab and Shift+Tab with ${name}`, async () => {
            await visit(query, opener);
            for (const how of ['keyboard', 'pointer']) {
              for (const key of ['Tab', 'Shift+Tab']) {
                const label = `${engine}, opened by ${how}: ${key}`;
                // The opener goes away once the menu is open, so each press starts from a fresh page.
                if (detached) await visit(query, opener);
                await open(how, { submenu: query === '?submenu', opener });
                if (detached) await tab.locator(opener).waitFor({ state: 'detached', timeout: 5000 });
                await tab.keyboard.press(key);
                await anyMenu.waitFor({ state: 'detached', timeout: 5000 }).catch(async () => assert.fail(`${label} left the menu open with focus on ${await stray()}`));
                await pollUntil(tab, (selector) => document.activeElement === document.querySelector(selector), expected[key], { message: `${label} moves focus to ${expected[key]}`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
                assert.equal(await holding(opener), false, `${label} does not leave focus on the opener`);
                assert.equal(await tab.locator('[role="menu"]').count(), 0, `${label} closes the whole menu tree`);
              }
            }
            if (!closedToo) return;
            for (const key of ['Tab', 'Shift+Tab']) {
              await trigger.focus();
              await tab.keyboard.press(key);
              await pollUntil(tab, (selector) => document.activeElement === document.querySelector(selector), expected[key], { message: `${engine}: ${key} from the closed trigger moves focus to ${expected[key]}`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
            }
          });
        }
        // Escape is unchanged: it closes the menu and returns focus to the trigger.
        await t.test('Escape returns focus to the trigger', async () => {
          await visit('');
          for (const how of ['keyboard', 'pointer']) {
            await open(how);
            await tab.keyboard.press('Escape');
            await anyMenu.waitFor({ state: 'detached', timeout: 5000 });
            await pollUntil(tab, () => document.activeElement === document.querySelector('#menu-trigger'), undefined, { message: `${engine}: Escape returns focus to the trigger after a ${how} open`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
          }
        });
        assert.deepEqual(errors, [], `${engine}: the page logged no errors`);
      } finally {
        await context.close();
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
