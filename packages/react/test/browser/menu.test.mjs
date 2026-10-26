import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { browserEngines, launchBrowser, packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Menu.Trigger draws Button's keyboard focus ring from the focus tokens, in place of the
// browser's own outline, and draws none at rest or after a pointer click, including the
// first click on a fresh page. An open Menu closes on Tab and Shift+Tab and lets focus move on
// from its trigger, however it was opened, with a submenu open, and past a disabled fieldset,
// a positive tabindex or a radio group; Escape still returns focus to the trigger. Runs in
// every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs). The popup's placement and geometry fall back to the values
// the catalog states, measured here as laid out: bottom-start at the top level, the offset, the cross offset, the container
// padding, and the flip, with end-top inside a submenu; a placement the caller gives wins at either level.

const entry = `
import React from 'react';
import { flushSync } from 'react-dom';
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
// ?placement and ?nested give the popup, and the submenu's popup, a placement. Left out, each falls back.
const popupPlacement = params.get('placement') ?? undefined;
const nestedPlacement = params.get('nested') ?? undefined;
// ?submenu puts a submenu in the list, whose popup is a second overlay to close with the first.
const list = params.has('submenu')
  ? h(Menu.List, { 'aria-label': 'Actions' },
    h(Menu.Item, { id: 'rename' }, 'Rename'),
    h(Menu.Submenu, { delay: 20 }, h(Menu.Item, { id: 'more' }, 'More'), h(Menu.Popup, { placement: nestedPlacement }, h(Menu.List, { 'aria-label': 'More actions', items: ['Archive', 'Export'] }))))
  : h(Menu.List, { 'aria-label': 'Actions', items: ['Rename', 'Delete'] });
// ?anchored opens a controlled Menu.Root from a native button, with no Menu.Trigger, anchored to a point that cannot take
// focus; ?detach anchors it to a button instead and removes the opener once the menu is open. ?reopen adds a second opener
// beyond a control between them, and window.__close closes the menu in one commit, for reopening it while it still exits.
function Anchored() {
  const [open, setOpen] = React.useState(false);
  const [gone, setGone] = React.useState(false);
  const detach = params.has('detach');
  const anchor = React.useRef(null);
  window.__close = () => flushSync(() => setOpen(false));
  React.useEffect(() => {
    if (!open || !detach) return undefined;
    const timer = setTimeout(() => setGone(true), 100);
    return () => clearTimeout(timer);
  }, [open, detach]);
  return h(React.Fragment, null,
    !gone && h('button', { id: 'opener', type: 'button', tabIndex: 0, onClick: () => setOpen(true) }, 'Open'),
    params.has('reopen') && h('button', { id: 'between', type: 'button', tabIndex: 0 }, 'Between'),
    params.has('reopen') && h('button', { id: 'second', type: 'button', tabIndex: 0, onClick: () => setOpen(true) }, 'Open from here'),
    detach ? h('button', { id: 'anchor', type: 'button', tabIndex: 0, ref: anchor }, 'Anchor') : h('span', { id: 'anchor', ref: anchor }),
    h(Menu.Root, { open, onOpenChange: setOpen }, h(Menu.Popup, { anchorRef: anchor }, list)));
}
// ?edge puts the trigger nearer the window's edge than the popup's container padding, and ?low near the bottom, where the popup
// has no room below it: the two ways a popup's default geometry shows besides its offset and alignment.
const triggerStyle = params.has('edge') ? { position: 'fixed', left: 2, top: 100 } : params.has('low') ? { position: 'fixed', left: 16, bottom: 4 } : undefined;
const menu = h(Menu.Root, closed ? { open: false, onOpenChange: () => {} } : null,
  h(Menu.Trigger, { id: 'menu-trigger', tabIndex: 0, style: triggerStyle }, 'Actions'),
  h(Menu.Popup, { placement: popupPlacement }, list));
// ?toolbar puts the trigger between two controls of a Toolbar.
const toolbar = h(Toolbar, { 'aria-label': 'Formatting' },
  h(Button, { id: 'toolbar-first', tabIndex: 0 }, 'Bold'),
  menu,
  h(Button, { id: 'toolbar-last', tabIndex: 0 }, 'Italic'));
const content = h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  around.before,
  params.has('anchored') ? h(Anchored) : params.has('toolbar') ? toolbar : menu,
  around.after,
  h(Button, { id: 'reference-button', tabIndex: 0 }, 'Reference'));
// ?strict replays effects, as React does in development.
createRoot(document.getElementById('root')).render(params.has('strict') ? h(React.StrictMode, null, content) : content);
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
          { name: 'a menu opened from a native button under StrictMode', query: '?anchored&strict', opener: '#opener', expected: { Tab: '#reference-button', 'Shift+Tab': '#before' } },
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
        // The list stays mounted while the menu exits, so a menu reopened from another control then must remember that control.
        await t.test('Tab and Shift+Tab after a menu reopens from another control while it exits', async () => {
          for (const key of ['Tab', 'Shift+Tab']) {
            const label = `${engine}: ${key} after reopening from the second control`;
            const expected = { Tab: '#reference-button', 'Shift+Tab': '#between' }[key];
            await visit('?anchored&reopen', '#opener');
            await open('keyboard', { opener: '#opener' });
            // One task: the first opening closes, the second control takes focus and opens the menu again before the exit ends.
            const handedOver = await tab.evaluate(() => {
              window.__close();
              const second = document.querySelector('#second');
              second.focus();
              const focused = document.activeElement === second;
              second.click();
              return focused;
            });
            assert.equal(handedOver, true, `${label}: the second control takes focus when the first opening closes`);
            await tab.locator('.muxui-menu-root[data-muxui-state-open]').waitFor({ state: 'attached', timeout: 5000 });
            await tab.locator('[role="menuitem"]').first().focus();
            await pollUntil(tab, () => document.activeElement?.closest('[role="menu"]') != null, undefined, { message: `${label}: focus enters the reopened menu`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
            await tab.keyboard.press(key);
            await anyMenu.waitFor({ state: 'detached', timeout: 5000 }).catch(async () => assert.fail(`${label} left the menu open with focus on ${await stray()}`));
            await pollUntil(tab, (selector) => document.activeElement === document.querySelector(selector), expected, { message: `${label} moves focus to ${expected}`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
          }
        });
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

// The behaviour text states both placement fallbacks and the derived API states the geometry defaults. A popup that is given
// none lands where they say: the popup's edge sits the offset from its trigger (or from the submenu's item), aligned as the
// placement says, and the container padding and the flip hold it inside the window.
for (const engine of browserEngines()) {
  test(`Menu.Popup falls back to the placement and geometry the catalog states in ${engine}`, { timeout: 300_000 }, async (t) => {
    const artifact = JSON.parse(await readFile(resolve(repositoryRoot, 'catalog/components/menu/artifact.json'), 'utf8'));
    const { partApis } = JSON.parse(await readFile(resolve(packageRoot, 'api/menu.json'), 'utf8')).api;
    const { offset, crossOffset, containerPadding, shouldFlip } = partApis.popup.defaults;
    assert.equal(partApis.popup.props.includes('placement') && 'placement' in partApis.popup.defaults, false, 'the placement has no single default: it depends on the submenu');
    // The wording is checked, not just written: both fallbacks are in the behaviour and the source's description, and the
    // measurements below hold them.
    const placement = artifact.bindings['web.react'].behavior.find((line) => line.startsWith('Menu.Popup accepts'));
    assert.match(placement, /Without a placement, a top-level popup opens at bottom-start and a popup inside a Menu\.Submenu opens beside its item at end-top\./u);
    const described = partApis.popup.propDetails.placement.description;
    assert.match(described, /Without one, a top-level popup opens at `bottom-start`, and a popup inside a Menu\.Submenu opens beside its item at `end-top`\./u);
    assert.equal(shouldFlip, true);
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
        // The rectangles of an element and of the popup, once the popup has stopped moving.
        const measure = (selectors) => tab.evaluate(async (selectors) => {
          // A selector is an element, or a pair of an element and the ancestor of it to measure.
          const read = () => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
            const [within, ancestor] = [selector].flat();
            const element = document.querySelector(within);
            const box = (ancestor === undefined ? element : element.closest(ancestor)).getBoundingClientRect();
            return [name, { left: box.left, right: box.right, top: box.top, bottom: box.bottom }];
          }));
          let previous = JSON.stringify(read());
          for (let frame = 0; frame < 120; frame += 1) {
            await new Promise((done) => setTimeout(done, 50));
            const current = JSON.stringify(read());
            if (current === previous) return JSON.parse(current);
            previous = current;
          }
          throw new Error('the popup never stopped moving');
        }, selectors);
        const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${engine}: ${label}: ${actual} is not within a pixel of ${expected}`);
        const visit = async (query) => {
          await tab.goto(`${url}/menu.html${query}`, { waitUntil: 'networkidle' });
          await tab.locator('#menu-trigger').waitFor({ timeout: 15_000 });
          await tab.locator('#menu-trigger').click();
          await tab.locator('.muxui-menu-popup').first().waitFor({ timeout: 5000 });
        };

        await t.test('a top-level popup opens at bottom-start, the offset below its trigger', async () => {
          await visit('');
          const { trigger, popup } = await measure({ trigger: '#menu-trigger', popup: '.muxui-menu-popup' });
          near(popup.top, trigger.bottom + offset, 'the popup sits the offset below the trigger');
          near(popup.left, trigger.left + crossOffset, 'the popup starts at its trigger\'s start edge');
        });

        // The submenu's popup is rendered by React Aria outside Menu.Submenu's own React subtree, so Menu.Popup tells it apart
        // by React Aria's PopoverContext, which names the trigger: a popup with no placement takes React Aria's own, end top.
        const openSubmenu = async (query) => {
          await visit(`?submenu${query}`);
          // The root popup is still moving as it opens, and the submenu is placed against where its item is by then.
          await measure({ root: '.muxui-menu-popup' });
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('ArrowRight');
          await tab.locator('[role="menu"][aria-label="More actions"]').waitFor({ timeout: 5000 });
          return measure({ item: '.muxui-menu-item[data-muxui-state-has-submenu]', popup: ['[role="menu"][aria-label="More actions"]', '.muxui-menu-popup'] });
        };

        await t.test('a popup inside a submenu opens at end-top, the offset beside its item', async () => {
          const { item, popup } = await openSubmenu('');
          near(popup.left, item.right + offset, 'the submenu sits the offset beside its item, at the end');
          // Its first row lines up with the item, so the popup starts above the item by its own padding.
          assert.ok(Math.abs(popup.top - item.top - crossOffset) <= 4, `${engine}: the submenu starts at its item's top: ${popup.top} against ${item.top}`);
          assert.equal(await tab.locator('[role="menu"][aria-label="More actions"]').evaluate((menu) => menu.closest('.muxui-menu-popup').dataset.muxuiStatePlacement), 'right', 'it reports the side it opened on');
        });

        await t.test('a popup inside a submenu keeps the placement it is given', async () => {
          const { item, popup } = await openSubmenu('&nested=bottom-start');
          near(popup.top, item.bottom + offset, 'bottom-start puts the submenu the offset below its item');
          near(popup.left, item.left + crossOffset, 'and starts it at its item\'s start edge');
          const beside = await openSubmenu('&nested=end-bottom');
          near(beside.popup.left, beside.item.right + offset, 'end-bottom puts the submenu the offset beside its item');
          // Its last row lines up with the item, so the popup ends below the item by its own padding.
          assert.ok(Math.abs(beside.popup.bottom - beside.item.bottom) <= 4, `${engine}: the submenu ends at its item's bottom: ${beside.popup.bottom} against ${beside.item.bottom}`);
        });

        await t.test('a top-level popup keeps the placement it is given', async () => {
          await visit('?placement=end-top');
          const { trigger, popup } = await measure({ trigger: '#menu-trigger', popup: '.muxui-menu-popup' });
          near(popup.left, trigger.right + offset, 'end-top puts the popup the offset beside its trigger');
          near(popup.top, trigger.top + crossOffset, 'and starts it at its trigger\'s top edge');
        });

        await t.test('the container padding keeps the popup off the window edge', async () => {
          await visit('?edge');
          const { trigger, popup } = await measure({ trigger: '#menu-trigger', popup: '.muxui-menu-popup' });
          assert.ok(trigger.left < containerPadding, 'the trigger is closer to the edge than the padding');
          near(popup.left, containerPadding, 'the popup stops at the padding');
        });

        await t.test('a popup with no room below its trigger flips above it', async () => {
          await visit('?low');
          const { trigger, popup } = await measure({ trigger: '#menu-trigger', popup: '.muxui-menu-popup' });
          near(popup.bottom, trigger.top - offset, 'the popup sits the offset above the trigger');
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
