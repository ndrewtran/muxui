import assert from 'node:assert/strict';
import test from 'node:test';
import { recordFrames } from '../fixtures/frame-recorder.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// CommandPalette.Trigger draws Button's keyboard focus ring, never for the first pointer
// click on a fresh page. The default inline CommandPalette.Input draws no field box, and the
// default variant draws the field focus border. The Backdrop paints no scrim unless asked,
// Popup translucent reaches the popup, and ItemAction replaces ItemMeta on the focused Item.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { CommandPalette } from '/src/supplemental/command-palette.ts';

const h = React.createElement;
// ?closed keeps the palette closed whatever is clicked, so a pointer click only focuses the Trigger.
// ?scrim and ?translucent set those props; ?variant=default draws the search field's box.
const params = new URLSearchParams(location.search);
const closed = params.has('closed');
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(CommandPalette.Root, closed ? { open: false, onOpenChange: () => {} } : null,
    // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps them focusable.
    h(CommandPalette.Trigger, { id: 'palette-trigger', tabIndex: 0 }, 'Commands'),
    h(CommandPalette.Backdrop, { scrim: params.has('scrim') }, h(CommandPalette.Popup, { translucent: params.has('translucent') },
      h(CommandPalette.Title, null, 'Commands'),
      h(CommandPalette.Close, { id: 'palette-close' }),
      h(CommandPalette.Content, null,
        h(CommandPalette.SearchField, { variant: params.get('variant') ?? undefined }, h(CommandPalette.Input, { id: 'palette-input', placeholder: 'Search commands' })),
        h(CommandPalette.ListBox, null,
          h(CommandPalette.Item, { id: 'alpha', title: 'Alpha' }),
          h(CommandPalette.Item, { id: 'beta', textValue: 'Beta' },
            h(CommandPalette.ItemContent, null, h(CommandPalette.ItemTitle, null, 'Beta')),
            h(CommandPalette.ItemMeta, null, 'beta.example'),
            h(CommandPalette.ItemAction, null, 'Switch to tab'))))))),
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
      entries: ['src/button.ts', 'src/supplemental/command-palette.ts'],
      pages: { '/command-palette.html': page },
      modules: { '/command-palette-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/command-palette.html`, { waitUntil: 'load' });
      const trigger = tab.locator('#palette-trigger');
      // A Button's ring fades in, so read it once its transitions have finished.
      const shadow = (locator) => locator.evaluate(async (node) => {
        await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
        return getComputedStyle(node).boxShadow;
      });
      await trigger.waitFor();
      await awaitFontsAndFrames(tab);

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

      // Reads the input's outline, its background and the field focus border the popup scopes.
      const readInput = (input) => input.evaluate((node) => {
        const probe = document.createElement('span');
        probe.style.outlineColor = 'var(--muxui-field-focus-border)';
        node.parentElement.append(probe);
        const focusBorder = getComputedStyle(probe).outlineColor;
        probe.remove();
        const style = getComputedStyle(node);
        return { focused: node === document.activeElement, outline: style.outlineColor, background: style.backgroundColor, focusBorder };
      });
      const transparent = 'rgba(0, 0, 0, 0)';

      await t.test('the inline Input draws no field box, resting or focused', async () => {
        // Releasing the press above opened the palette; open it here if it is not.
        const input = tab.locator('#palette-input');
        if (await input.count() === 0) await trigger.click();
        await input.waitFor();
        await input.focus();
        const focused = await readInput(input);
        assert.equal(focused.focused, true);
        assert.deepEqual([focused.outline, focused.background], [transparent, transparent], 'a focused inline Input draws no box');
        await tab.locator('#palette-close').focus();
        const resting = await readInput(input);
        assert.deepEqual([resting.outline, resting.background], [transparent, transparent], 'a resting inline Input draws no box');
      });

      await t.test('the default-variant Input draws the field border and its focus border', async () => {
        const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        await page.goto(`${url}/command-palette.html?variant=default`, { waitUntil: 'load' });
        await page.locator('#palette-trigger').click();
        const input = page.locator('#palette-input');
        await input.waitFor();
        await awaitFontsAndFrames(page);
        await input.focus();
        const focused = await readInput(input);
        assert.equal(focused.outline, focused.focusBorder, 'a focused Input draws the field focus border');
        await page.locator('#palette-close').focus();
        const resting = await readInput(input);
        assert.notEqual(resting.outline, transparent, 'a resting Input keeps the field border');
        assert.notEqual(resting.outline, focused.outline);
        await page.close();
      });

      await t.test('ItemAction shows on the focused Item in place of its ItemMeta, with a decorative key cap', async () => {
        const input = tab.locator('#palette-input');
        await input.focus();
        const read = () => tab.evaluate(() => {
          const beta = document.querySelector('.muxui-command-palette__item:last-child');
          const shown = (selector) => getComputedStyle(beta.querySelector(selector)).display !== 'none';
          const key = beta.querySelector('.muxui-command-palette__item-action-key');
          return {
            focused: beta.hasAttribute('data-muxui-state-focused'), action: shown('.muxui-command-palette__item-action'), meta: shown('.muxui-command-palette__item-meta'),
            keyHidden: key.getAttribute('aria-hidden'), keyBackground: getComputedStyle(key).backgroundColor,
          };
        });
        const resting = await read();
        assert.deepEqual([resting.focused, resting.action, resting.meta], [false, false, true], 'an unfocused Item shows its meta and no action');
        const named = () => tab.getByRole('option', { name: /Switch to tab/u }).count();
        assert.equal(await named(), 0, 'an unfocused Item leaves the action out of its name');
        await tab.keyboard.press('ArrowDown');
        await tab.keyboard.press('ArrowDown');
        await tab.waitForFunction(() => document.querySelector('.muxui-command-palette__item:last-child')?.hasAttribute('data-muxui-state-focused'));
        const focused = await read();
        assert.deepEqual([focused.focused, focused.action, focused.meta, focused.keyHidden], [true, true, false, 'true'], 'the focused Item shows its action and hides its meta');
        assert.equal(await named(), 1, 'the focused Item names its action once');
        const actionBackground = await tab.evaluate(() => {
          const probe = document.createElement('span');
          probe.style.backgroundColor = 'var(--muxui-semantic-action-background)';
          document.body.append(probe);
          const value = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return value;
        });
        assert.equal(focused.keyBackground, actionBackground, 'the key cap fills with the action colour');
      });

      await t.test('the Backdrop paints no scrim by default, and scrim and translucent reach the backdrop and popup', async () => {
        const read = (page) => page.evaluate(() => ({
          backdrop: getComputedStyle(document.querySelector('.muxui-command-palette__backdrop')).backgroundColor,
          translucent: document.querySelector('.muxui-command-palette__popup').classList.contains('muxui-command-palette__popup--translucent'),
        }));
        const plain = await read(tab);
        assert.deepEqual(plain, { backdrop: transparent, translucent: false });
        const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        await page.goto(`${url}/command-palette.html?scrim&translucent`, { waitUntil: 'load' });
        await page.locator('#palette-trigger').click();
        await page.locator('#palette-input').waitFor();
        // The backdrop fades in; read it once its transition has finished.
        await page.locator('.muxui-command-palette__backdrop').evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
        const styled = await read(page);
        assert.notEqual(styled.backdrop, transparent, 'scrim paints the backdrop');
        assert.equal(styled.translucent, true, 'translucent reaches the popup element');
        // An outside press on the transparent backdrop still dismisses.
        await tab.mouse.click(8, 690);
        await tab.locator('.muxui-command-palette__popup').waitFor({ state: 'detached' });
        await page.close();
      });

      // On a fresh page no element has been focused yet, where a browser's own :focus-visible can match a first pointer click.
      await t.test('the first pointer click on a fresh page draws no ring, and the keyboard then does', async () => {
        const fresh = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        const freshErrors = [];
        fresh.on('pageerror', (error) => freshErrors.push(error.message));
        await fresh.goto(`${url}/command-palette.html?closed`, { waitUntil: 'load' });
        const freshTrigger = fresh.locator('#palette-trigger');
        await freshTrigger.waitFor();
        await awaitFontsAndFrames(fresh);
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

// Content autoFocusFirst: the first enabled item, through the sections, is focused at rest and after every query
// change (typed, deleted, or set by the application), and only while the search input has DOM focus. At rest the
// focus follows the first item as items arrive; once an arrow key moved it, a re-render keeps the focused item.
// Enter activates the focused item. Results replaced without a query change (through an empty interim list) and
// results disabled and enabled again focus the first enabled item, so the highlight, the input's active descendant and
// Enter name one item. ?uncontrolled leaves the Input's value to the palette, and ?bare puts it outside a SearchField.
const autoFocusEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPalette } from '/src/supplemental/command-palette.ts';

const h = React.createElement;
const sections = [
  { id: 'tabs', title: 'Tabs', items: [{ id: 'zero', title: 'Zero', disabled: true }, { id: 'alpha', title: 'Alpha' }, { id: 'beta', title: 'Beta' }] },
  { id: 'commands', title: 'Commands', items: [{ id: 'gamma', title: 'Gamma' }, { id: 'delta', title: 'Delta' }] },
];
window.activated = [];
const params = new URLSearchParams(location.search);
function Palette() {
  const [query, setQuery] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  window.setQuery = setQuery;
  window.rerender = () => setRevision((value) => value + 1);
  // Adds an item at the top, as data that arrives after the palette opened.
  const [extra, setExtra] = React.useState([]);
  window.prepend = (title) => setExtra((items) => [{ id: title.toLowerCase(), title }, ...items]);
  // Replaces every result while the query stays, as an asynchronous source does; null shows the sections again.
  const [results, setResults] = React.useState(null);
  window.setResults = setResults;
  const [disabledAll, setDisabledAll] = React.useState(false);
  window.setDisabledAll = setDisabledAll;
  const search = query.trim().toLowerCase();
  const source = results ? [{ id: 'results', title: 'Results', items: results }] : [{ id: 'new', title: 'New', items: extra }, ...sections];
  const shown = source.map((section) => ({ ...section, items: section.items.filter((item) => item.title.toLowerCase().includes(search)) })).filter((section) => section.items.length > 0);
  const input = h(CommandPalette.Input, params.has('uncontrolled') ? { id: 'palette-input' } : { id: 'palette-input', value: query, onChange: (event) => setQuery(event.currentTarget.value) });
  return h(CommandPalette.Root, { defaultOpen: true, closeOnSelect: false },
    h(CommandPalette.Backdrop, null, h(CommandPalette.Popup, null,
      h(CommandPalette.Title, null, 'Commands'),
      h(CommandPalette.Close, { id: 'palette-close' }),
      h(CommandPalette.Content, { autoFocusFirst: true },
        params.has('bare') ? input : h(CommandPalette.SearchField, null, input),
        h(CommandPalette.ListBox, null, shown.map((section) => h(CommandPalette.Section, { key: section.id },
          h(CommandPalette.SectionHeader, null, section.title),
          section.items.map((item) => h(CommandPalette.Item, { key: item.id, id: item.id, title: item.title, disabled: item.disabled || disabledAll, 'data-revision': revision, onActivate: ({ id }) => window.activated.push(id) })))))))));
}
createRoot(document.getElementById('root')).render(h(Palette));
`;

const autoFocusPage = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/command-palette-auto-focus-entry.mjs',
});

// Opens the autoFocusFirst page with these search parameters, and reads which item is focused.
async function openAutoFocus(browser, url, search = '') {
  const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
  const errors = [];
  tab.on('pageerror', (error) => errors.push(error.message));
  await tab.goto(`${url}/command-palette-auto-focus.html${search}`, { waitUntil: 'load' });
  const input = tab.locator('#palette-input');
  await input.waitFor();
  await awaitFontsAndFrames(tab);
  // The text of each focused option, which names the item.
  const focused = () => tab.evaluate(() => [...document.querySelectorAll('[role="option"][data-muxui-state-focused]')].map((node) => node.textContent));
  const expectFocused = async (title, message) => {
    await tab.waitForFunction((expected) => {
      const rows = [...document.querySelectorAll('[role="option"][data-muxui-state-focused]')];
      return rows.length === 1 && rows[0].textContent === expected;
    }, title).catch(() => {});
    assert.deepEqual(await focused(), [title], message);
  };
  // The highlighted item, the item the input names as its active descendant, and the item Enter activates are one.
  const expectNamed = async (title, id, message) => {
    await expectFocused(title, message);
    const descendant = await input.getAttribute('aria-activedescendant');
    assert.equal(await tab.evaluate((node) => document.getElementById(node)?.textContent, descendant), title, `${message}: the input names it`);
    await tab.evaluate(() => { window.activated = []; });
    await tab.keyboard.press('Enter');
    assert.deepEqual(await tab.evaluate(() => window.activated), [id], `${message}: Enter activates it`);
  };
  const optionCount = (count) => tab.waitForFunction((expected) => document.querySelectorAll('[role="option"]').length === expected, count);
  return { tab, input, errors, focused, expectFocused, expectNamed, optionCount };
}

for (const engine of browserEngines()) {
  test(`CommandPalette Content autoFocusFirst keeps the first item focused in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/command-palette.ts'],
      pages: { '/command-palette-auto-focus.html': autoFocusPage },
      modules: { '/command-palette-auto-focus-entry.mjs': autoFocusEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const { tab, input, errors, focused, expectFocused } = await openAutoFocus(browser, url);

      await t.test('the first enabled item is focused at rest, and ArrowDown moves to the next', async () => {
        assert.ok(await input.evaluate((node) => node === document.activeElement), 'the input has focus');
        await expectFocused('Alpha', 'the first enabled item, past a disabled one, is focused at rest');
        const descendant = await input.getAttribute('aria-activedescendant');
        assert.equal(await tab.evaluate((id) => document.getElementById(id)?.textContent, descendant), 'Alpha', 'the input names the focused item');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta', 'ArrowDown lands on the second item');
      });

      await t.test('a re-render that keeps the query keeps the focused item', async () => {
        await tab.evaluate(() => window.rerender());
        await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await focused(), ['Beta']);
      });

      await t.test('typing, deleting and a query the application sets each focus the first item', async () => {
        await tab.keyboard.type('a');
        await expectFocused('Alpha', 'typed text focuses the first match');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta', 'ArrowDown after typing lands on the second match');
        await tab.keyboard.type('l');
        await expectFocused('Alpha', 'more typed text focuses the first match again');
        await tab.keyboard.press('Backspace');
        await expectFocused('Alpha', 'a deletion focuses the first item');
        await tab.keyboard.press('ArrowDown');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Gamma', 'arrows cross into the next section');
        await tab.evaluate(() => window.setQuery(''));
        await expectFocused('Alpha', 'a query the application clears focuses the first item');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta', 'ArrowDown then lands on the second item');
        await tab.keyboard.press('Enter');
        assert.deepEqual(await tab.evaluate(() => window.activated), ['beta'], 'Enter activates the focused item');
      });

      await t.test('the reset waits while another element has focus, and applies when the input takes it back', async () => {
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Gamma', 'a later item is focused');
        await tab.locator('#palette-close').focus();
        // Each query renders before the next, or React would batch them into no change at all.
        await tab.evaluate(() => window.setQuery('e'));
        await tab.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 3);
        await tab.evaluate(() => window.setQuery(''));
        await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(await tab.locator('#palette-close').evaluate((node) => node === document.activeElement), 'the Close button keeps DOM focus');
        await input.focus();
        await expectFocused('Alpha', 'the input taking focus back applies the reset');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta');
      });

      await t.test('a caret move or a press in the input keeps the focused item', async () => {
        await tab.keyboard.type('a');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta');
        await tab.keyboard.press('ArrowLeft');
        await expectFocused('Beta', 'ArrowLeft moves the caret and keeps the item');
        await input.click();
        await expectFocused('Beta', 'a press in the input keeps the item');
        await tab.evaluate(() => { window.activated = []; });
        await tab.keyboard.press('Enter');
        assert.deepEqual(await tab.evaluate(() => window.activated), ['beta'], 'Enter activates it');
        await tab.evaluate(() => window.setQuery(''));
        await expectFocused('Alpha');
      });

      await t.test('items that arrive at rest take the focus, and not after ArrowDown', async () => {
        // A query change starts a rest again.
        await tab.keyboard.type('g');
        await expectFocused('Gamma');
        await tab.keyboard.press('Backspace');
        await expectFocused('Alpha');
        await tab.evaluate(() => window.prepend('Early'));
        await expectFocused('Early', 'an item that arrives first takes the focus at rest');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Alpha');
        await tab.evaluate(() => window.prepend('Late'));
        await tab.waitForFunction(() => document.querySelector('[role="option"]')?.textContent === 'Late');
        assert.deepEqual(await focused(), ['Alpha'], 'after ArrowDown the focus stays on its item');
        await tab.keyboard.press('ArrowDown');
        await expectFocused('Beta');
      });

      await t.test('results replaced through an empty list without a query change focus the first enabled item', async () => {
        const page = await openAutoFocus(browser, url);
        await page.expectFocused('Alpha', 'Alpha is focused at rest');
        await page.tab.evaluate(() => window.setResults([]));
        await page.optionCount(0);
        await page.tab.evaluate(() => window.setResults([{ id: 'beta', title: 'Beta' }, { id: 'alpha', title: 'Alpha' }]));
        await page.optionCount(2);
        await page.expectNamed('Beta', 'beta', 'the refreshed first item');
        // After the user moved the focus, an empty interim list ends that choice too.
        await page.tab.keyboard.press('ArrowDown');
        await page.expectFocused('Alpha');
        await page.tab.evaluate(() => window.setResults([]));
        await page.optionCount(0);
        await page.tab.evaluate(() => window.setResults([{ id: 'gamma', title: 'Gamma' }, { id: 'alpha', title: 'Alpha' }]));
        await page.optionCount(2);
        await page.expectNamed('Gamma', 'gamma', 'the refreshed first item after a move');
        assert.deepEqual(page.errors, []);
        await page.tab.close();
      });

      await t.test('results disabled and enabled again focus the first enabled item', async () => {
        const page = await openAutoFocus(browser, url);
        await page.expectFocused('Alpha', 'Alpha is focused at rest');
        await page.tab.evaluate(() => window.setDisabledAll(true));
        await page.tab.waitForFunction(() => [...document.querySelectorAll('[role="option"]')].every((node) => node.getAttribute('aria-disabled') === 'true'));
        await page.tab.waitForFunction(() => !document.getElementById('palette-input').hasAttribute('aria-activedescendant')).catch(() => {});
        assert.equal(await page.input.getAttribute('aria-activedescendant'), null, 'the input names no disabled item');
        await page.tab.evaluate(() => window.setDisabledAll(false));
        await page.tab.waitForFunction(() => document.querySelectorAll('[role="option"][aria-disabled="true"]').length === 1);
        await page.expectNamed('Alpha', 'alpha', 'the enabled first item');
        assert.deepEqual(page.errors, []);
        await page.tab.close();
      });

      // The rows stay mounted while they are disabled, so the input still knows the item it last named.
      for (const [rows, label] of [[[{ id: 'beta', title: 'Beta' }, { id: 'alpha', title: 'Alpha' }], 'in a new order'], [[{ id: 'beta', title: 'Beta' }, { id: 'alpha', title: 'Alpha', disabled: true }], 'with only the second one']]) {
        await t.test(`results disabled and enabled again ${label} name the new first item`, async () => {
          const page = await openAutoFocus(browser, url);
          await page.tab.evaluate(() => window.setResults([{ id: 'alpha', title: 'Alpha' }, { id: 'beta', title: 'Beta' }]));
          await page.optionCount(2);
          await page.expectFocused('Alpha', 'Alpha is focused');
          await page.tab.evaluate(() => window.setResults([{ id: 'alpha', title: 'Alpha', disabled: true }, { id: 'beta', title: 'Beta', disabled: true }]));
          await page.tab.waitForFunction(() => !document.getElementById('palette-input').hasAttribute('aria-activedescendant')).catch(() => {});
          assert.equal(await page.input.getAttribute('aria-activedescendant'), null, 'the input names no disabled item');
          await page.tab.evaluate((next) => window.setResults(next), rows);
          await page.expectNamed('Beta', 'beta', 'the enabled first item');
          assert.deepEqual(page.errors, []);
          await page.tab.close();
        });
      }

      // React Aria names a focused item 500 ms after typed text; the keys in that time still reach the highlighted item.
      await t.test('arrow keys right after typed text move the item Enter activates', async () => {
        const page = await openAutoFocus(browser, url, '?uncontrolled');
        await page.expectFocused('Alpha', 'Alpha is focused at rest');
        await page.tab.keyboard.press('ArrowDown');
        await page.expectFocused('Beta');
        await page.tab.evaluate(() => { window.activated = []; });
        // The uncontrolled query filters nothing here, so the results stay as they were.
        await page.tab.keyboard.type('x');
        await page.expectFocused('Alpha', 'typed text focuses the first item');
        await page.tab.keyboard.press('ArrowDown');
        await page.expectFocused('Beta', 'ArrowDown moves to the second item');
        await page.tab.keyboard.press('Enter');
        assert.deepEqual(await page.tab.evaluate(() => window.activated), ['beta'], 'Enter activates the highlighted item');
        await page.tab.waitForTimeout(600);
        assert.deepEqual(await page.focused(), ['Beta']);
        const descendant = await page.input.getAttribute('aria-activedescendant');
        assert.equal(await page.tab.evaluate((id) => document.getElementById(id)?.textContent, descendant), 'Beta', 'the input names the highlighted item');
        assert.deepEqual(page.errors, []);
        await page.tab.close();
      });

      await t.test('a deletion right after typed text that filtered out the focused item names the first item', async () => {
        const page = await openAutoFocus(browser, url);
        await page.expectFocused('Alpha', 'Alpha is focused at rest');
        await page.tab.keyboard.press('ArrowDown');
        await page.expectFocused('Beta');
        await page.tab.keyboard.type('l');
        await page.expectFocused('Alpha', 'typed text that leaves Beta out focuses the first match');
        await page.tab.keyboard.press('Backspace');
        await page.expectNamed('Alpha', 'alpha', 'the deletion focuses the first item');
        assert.deepEqual(page.errors, []);
        await page.tab.close();
      });

      for (const [search, where] of [['?uncontrolled', 'inside a SearchField'], ['?uncontrolled&bare', 'outside a SearchField']]) {
        await t.test(`an uncontrolled Input ${where} reports its query`, async () => {
          const page = await openAutoFocus(browser, url, search);
          await page.expectFocused('Alpha', 'Alpha is focused at rest');
          await page.tab.keyboard.type('a');
          await page.expectFocused('Alpha');
          await page.tab.keyboard.press('ArrowDown');
          await page.expectFocused('Beta');
          await page.tab.keyboard.press('Backspace');
          // The list leaves Backspace to the input: WebKit would take it on the focused item as Back.
          assert.ok(await page.input.evaluate((node) => node === document.activeElement && node.value === ''), 'the input keeps the focus and deletes');
          await page.expectNamed('Alpha', 'alpha', 'a deletion focuses the first item');
          // Typed text after a move starts a rest again, so an item that arrives first takes the focus.
          await page.tab.keyboard.press('ArrowDown');
          await page.expectFocused('Beta');
          await page.tab.keyboard.type('x');
          await page.expectFocused('Alpha');
          await page.tab.evaluate(() => window.prepend('Early'));
          await page.expectNamed('Early', 'early', 'an item that arrives after typing');
          assert.deepEqual(page.errors, []);
          await page.tab.close();
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}

// A search field with ClearButton draws it as its only clear control: the cancel button Chromium and WebKit add to a
// search input stays hidden, and a field without ClearButton keeps that native button. Keyboard focus scrolls a row only
// as far as the list's block padding, never to its edge. ?noclear leaves ClearButton out.
const listEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CommandPalette } from '/src/supplemental/command-palette.ts';

const h = React.createElement;
const clear = !new URLSearchParams(location.search).has('noclear');
const items = Array.from({ length: 30 }, (_, index) => h(CommandPalette.Item, { key: index, id: \`item-\${index}\`, title: \`Item \${index}\` }));
createRoot(document.getElementById('root')).render(h(CommandPalette.Root, { defaultOpen: true },
  h(CommandPalette.Backdrop, null, h(CommandPalette.Popup, null,
    h(CommandPalette.Title, null, 'Commands'),
    h(CommandPalette.Content, null,
      h(CommandPalette.SearchField, null, h(CommandPalette.Input, { id: 'palette-input' }), clear && h(CommandPalette.ClearButton, { id: 'palette-clear' })),
      h(CommandPalette.ListBox, { id: 'palette-list' }, items))))));
`;

const listPage = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/command-palette-list-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`CommandPalette Input draws one clear control and the list keeps its padding in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/command-palette.ts'],
      pages: { '/command-palette-list.html': listPage },
      modules: { '/command-palette-list-entry.mjs': listEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`${url}/command-palette-list.html`, { waitUntil: 'load' });
      const input = tab.locator('#palette-input');
      await input.waitFor();
      await awaitFontsAndFrames(tab);

      await t.test('arrow keys, Home and End stop the focused row at the list padding', async () => {
        // The focused row's distance from the list's top and bottom edges, the list's block padding and its scroll
        // offset, once the row holds still for a frame: WebKit scrolls a frame after the focus moves.
        const read = (title) => tab.waitForFunction((expected) => {
          const list = document.getElementById('palette-list');
          const row = list.querySelector('[role="option"][data-muxui-state-focused]');
          if (row?.textContent !== expected) return null;
          const style = getComputedStyle(list);
          const edges = list.getBoundingClientRect();
          const box = row.getBoundingClientRect();
          const read = { title: expected, top: box.top - edges.top, bottom: edges.bottom - box.bottom, scrollTop: list.scrollTop };
          const previous = window.lastRowRead;
          window.lastRowRead = read;
          if (previous?.title !== read.title || previous.top !== read.top || previous.scrollTop !== read.scrollTop) return null;
          return { ...read, paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom), scrolls: list.scrollHeight > list.clientHeight };
        }, title, { polling: 'raf' }).then((handle) => handle.jsonValue());
        const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} is not ${expected}`);
        await input.focus();

        await tab.keyboard.press('End');
        const last = await read('Item 29');
        assert.ok(last.scrolls, 'the list scrolls');
        assert.ok(last.paddingBottom > 0 && last.paddingTop > 0, 'the list has block padding');
        near(last.bottom, last.paddingBottom, 'End leaves the bottom padding under the last row');

        await tab.keyboard.press('Home');
        const first = await read('Item 0');
        near(first.top, first.paddingTop, 'Home leaves the top padding over the first row');

        // ArrowDown to the first row past the fold, which scrolls the list and stops at the bottom padding.
        let row;
        for (let index = 1; index < 30 && !(row?.scrollTop > 0); index += 1) {
          await tab.keyboard.press('ArrowDown');
          row = await read(`Item ${index}`);
        }
        assert.ok(row.scrollTop > 0, 'ArrowDown scrolls the list');
        near(row.bottom, row.paddingBottom, 'an arrow key past the fold leaves the bottom padding under the row');
      });

      // Shots of the Input with a query: as it is, and with the native cancel button forced on and forced off, which
      // differ, so the comparison can see the button.
      const cancelShots = async (page, field) => {
        await field.fill('Item');
        const shot = () => field.screenshot({ animations: 'disabled', caret: 'hide' });
        const pseudo = '.muxui-command-palette__input::-webkit-search-cancel-button';
        const resting = await shot();
        const on = await page.addStyleTag({ content: `${pseudo} { display: block !important; -webkit-appearance: searchfield-cancel-button !important; appearance: auto !important; }` });
        const drawn = await shot();
        await on.evaluate((node) => node.remove());
        const off = await page.addStyleTag({ content: `${pseudo} { display: none !important; -webkit-appearance: none !important; appearance: none !important; }` });
        const hidden = await shot();
        await off.evaluate((node) => node.remove());
        assert.ok(!drawn.equals(hidden), 'the native cancel button changes the Input when it is drawn');
        return { resting, hidden };
      };

      // Firefox draws no native cancel button on a search input, so there is nothing to hide or keep there.
      const cancelSkip = engine === 'firefox' && 'Firefox draws no native cancel button on a search input';

      await t.test('the Input draws no native cancel button beside ClearButton', { skip: cancelSkip }, async () => {
        await tab.locator('#palette-clear').waitFor({ state: 'attached' });
        const { resting, hidden } = await cancelShots(tab, input);
        assert.ok(await tab.locator('#palette-clear').isVisible(), 'ClearButton shows with a query');
        assert.ok(resting.equals(hidden), 'the Input draws no native cancel button');
      });

      await t.test('the Input keeps the native cancel button without ClearButton', { skip: cancelSkip }, async () => {
        const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${url}/command-palette-list.html?noclear`, { waitUntil: 'load' });
        const field = page.locator('#palette-input');
        await field.waitFor();
        await awaitFontsAndFrames(page);
        assert.equal(await page.locator('.muxui-command-palette__clear-button').count(), 0, 'the field has no ClearButton');
        const { resting, hidden } = await cancelShots(page, field);
        assert.ok(!resting.equals(hidden), 'the Input draws the native cancel button');
        await page.close();
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}

// A translucent Popup blurs the page behind it through its backdrop filter, which samples none of the page while the
// Popup or the Backdrop is below full opacity, or the Backdrop animates its opacity: a fade would show the page sharp.
// So a translucent palette opens and closes at full opacity, its Popup sliding and scaling and its scrim fading its
// colour, while an opaque palette and AlertDialog still fade. Headless WebKit and Firefox draw no blur, so only
// Chromium compares the pixels.
const motionEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AlertDialog } from '/src/supplemental/alert-dialog.ts';
import { CommandPalette } from '/src/supplemental/command-palette.ts';

const h = React.createElement;
// ?translucent and ?scrim set those props on the palette; ?alert renders an AlertDialog in its place.
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')).render(params.has('alert')
  ? h(AlertDialog.Root, null,
    h(AlertDialog.Trigger, { id: 'motion-trigger' }, 'Delete'),
    h(AlertDialog.Backdrop, null, h(AlertDialog.Popup, null, h(AlertDialog.Content, null,
      h(AlertDialog.Title, null, 'Delete item'),
      h(AlertDialog.Actions, null, h(AlertDialog.Close, null, 'Cancel'))))))
  : h(CommandPalette.Root, null,
    h(CommandPalette.Trigger, { id: 'motion-trigger' }, 'Commands'),
    h(CommandPalette.Backdrop, { scrim: params.has('scrim') }, h(CommandPalette.Popup, { translucent: params.has('translucent') },
      h(CommandPalette.Title, null, 'Commands'),
      // An empty stretch of the Popup, where only the page behind it shows.
      h('div', { id: 'motion-glass', style: { height: '240px' } })))));
`;

// Sharp stripes, which the translucent Popup's blur turns into an even grey.
const motionPage = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 0; min-height: 100vh; background: repeating-linear-gradient(90deg, #000 0 6px, #fff 6px 12px)"',
  body: '<div id="root"></div>',
  entry: '/command-palette-motion-entry.mjs',
});

// The modal motion, slowed so each open and close spans many frames and screenshots.
const SLOWED = '1500ms';
const modalParts = {
  backdrop: '.muxui-command-palette__backdrop, .muxui-alert-dialog__backdrop',
  popup: '.muxui-command-palette__popup, .muxui-alert-dialog__popup',
};

// Serialized into the page by recordFrames, so it must stay self-contained.
function sampleModal(parts) {
  const backdrop = document.querySelector(parts.backdrop);
  const popup = document.querySelector(parts.popup);
  if (!backdrop || !popup) return null;
  const backdropStyle = getComputedStyle(backdrop);
  const popupStyle = getComputedStyle(popup);
  // The alpha of the computed scrim colour: the value after the slash of color() and the like, or rgba()'s fourth.
  const color = backdropStyle.backgroundColor;
  const alpha = /\/\s*([\d.]+)\s*\)$/u.exec(color)?.[1] ?? /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/u.exec(color)?.[1] ?? '1';
  return {
    backdrop: Number(backdropStyle.opacity),
    fading: backdrop.getAnimations().some((animation) => animation.transitionProperty === 'opacity'),
    scrim: Number(alpha),
    popup: Number(popupStyle.opacity),
    y: Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-y')) || 0,
    scale: Number.parseFloat(popupStyle.getPropertyValue('--muxui-modal-scale')) || 1,
  };
}

// Whether the open modal has settled: the Popup at rest and the Backdrop's transitions done. Serialized like sampleModal.
function modalSettled(parts) {
  const backdrop = document.querySelector(parts.backdrop);
  const popup = document.querySelector(parts.popup);
  if (!backdrop || !popup || backdrop.hasAttribute('data-muxui-state-entering')) return false;
  if (backdrop.getAnimations().some((animation) => animation.playState === 'running')) return false;
  const style = getComputedStyle(popup);
  return Number(style.opacity) === 1
    && Math.abs(Number.parseFloat(style.getPropertyValue('--muxui-modal-y')) || 0) < 0.01
    && Math.abs((Number.parseFloat(style.getPropertyValue('--muxui-modal-scale')) || 1) - 1) < 0.0001;
}

// The mean change in luminance between neighbouring pixels of each PNG: about 42 for the bare stripes, near 0 once blurred.
function sharpness(images) {
  return Promise.all(images.map(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const luminance = (pixel) => (0.2126 * data[pixel * 4]) + (0.7152 * data[(pixel * 4) + 1]) + (0.0722 * data[(pixel * 4) + 2]);
    let sum = 0;
    let count = 0;
    for (let pixel = 0; (pixel + 1) * 4 < data.length; pixel += 1) {
      if (pixel % width === width - 1) continue;
      sum += Math.abs(luminance(pixel) - luminance(pixel + 1));
      count += 1;
    }
    return sum / count;
  }));
}

for (const engine of browserEngines()) {
  test(`CommandPalette translucent Popup keeps the page behind it blurred while it opens and closes in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/alert-dialog.ts', 'src/supplemental/command-palette.ts'],
      pages: { '/command-palette-motion.html': motionPage },
      modules: { '/command-palette-motion-entry.mjs': motionEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const errors = [];
      const open = async (query) => {
        const page = await browser.newPage({ viewport: { width: 900, height: 700 }, locale: 'en-US', reducedMotion: 'no-preference' });
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${url}/command-palette-motion.html?${query}`, { waitUntil: 'load' });
        await page.locator('#motion-trigger').waitFor();
        await awaitFontsAndFrames(page);
        await page.evaluate((duration) => {
          for (const token of ['enter-duration', 'transition-spring-duration', 'dismiss-transition-duration']) {
            document.documentElement.style.setProperty(`--muxui-semantic-motion-modal-${token}`, duration);
          }
        }, SLOWED);
        return page;
      };
      // The frames from the Trigger press until the modal settles and from Escape until it leaves, and the frame at rest.
      const cycle = async (page) => {
        const opening = await recordFrames(page, sampleModal, modalParts);
        await page.locator('#motion-trigger').click();
        await page.waitForFunction(modalSettled, modalParts);
        const opened = await opening.stop();
        const rest = await page.evaluate(sampleModal, modalParts);
        const closing = await recordFrames(page, sampleModal, modalParts);
        await page.keyboard.press('Escape');
        await page.locator(modalParts.popup).waitFor({ state: 'detached' });
        return { opened, closed: await closing.stop(), rest };
      };

      await t.test('the Popup and Backdrop keep full opacity while the Popup slides and scales and the scrim fades', async () => {
        for (const query of ['translucent&scrim', 'translucent']) {
          const page = await open(query);
          const { opened, closed, rest } = await cycle(page);
          for (const [phase, frames] of [['open', opened], ['close', closed]]) {
            const label = `${query}, ${phase}`;
            assert.ok(frames.length > 5, `${label}: frames were recorded`);
            const faded = frames.filter(({ popup, backdrop, fading }) => popup !== 1 || backdrop !== 1 || fading);
            assert.deepEqual(faded.slice(0, 3), [], `${label}: ${faded.length} of ${frames.length} frames fade the Popup or Backdrop`);
            assert.ok(frames.some(({ y, scale }) => y < 0 && y > -8 && scale > 0.97 && scale < 1), `${label}: the Popup slides and scales`);
            if (rest.scrim > 0) assert.ok(frames.some(({ scrim }) => scrim > 0 && scrim < rest.scrim), `${label}: the scrim fades its colour`);
            else assert.ok(query === 'translucent' && frames.every(({ scrim }) => scrim === 0), `${label}: no scrim shows`);
          }
          await page.close();
        }
      });

      await t.test('the page seen through the Popup is never sharper than at rest', { skip: engine !== 'chromium' && `headless ${engine} draws no backdrop blur` }, async () => {
        for (const query of ['translucent&scrim', 'translucent']) {
          const page = await open(query);
          const trigger = page.locator('#motion-trigger');
          const popup = page.locator(modalParts.popup);
          await trigger.click();
          await page.waitForFunction(modalSettled, modalParts);
          // A stretch well inside the empty part of the Popup at rest stays inside it while it slides and scales.
          const box = await page.locator('#motion-glass').boundingBox();
          const clip = { x: Math.round(box.x + 32), y: Math.round(box.y + 32), width: Math.round(box.width - 64), height: Math.round(box.height - 64) };
          const shot = async () => (await page.screenshot({ clip })).toString('base64');
          const atRest = await shot();
          await page.keyboard.press('Escape');
          await popup.waitFor({ state: 'detached' });
          const [rest, bare] = await page.evaluate(sharpness, [atRest, await shot()]);
          assert.ok(rest < bare / 20, `${query}: the Popup blurs the stripes at rest, ${rest} against ${bare} bare`);

          // Shots of the Popup through the open and the close, each kept only if the Popup was still there after it.
          const shots = [];
          const take = async () => {
            const image = await shot();
            if (await popup.count() > 0) shots.push(image);
          };
          await trigger.click();
          for (let index = 0; index < 200 && !(await page.evaluate(modalSettled, modalParts)); index += 1) await take();
          const opening = shots.length;
          await page.keyboard.press('Escape');
          for (let index = 0; index < 200 && await popup.count() > 0; index += 1) await take();
          const values = await page.evaluate(sharpness, shots);
          assert.ok(opening > 5 && values.length - opening > 5, `${query}: shots were taken through the open (${opening}) and the close (${values.length - opening})`);
          // The bare stripes read about 42, and a fade lets them through at several units.
          const sharper = values.map((value, index) => ({ phase: index < opening ? 'open' : 'close', value })).filter(({ value }) => value > rest + 1);
          assert.deepEqual(sharper.slice(0, 3), [], `${query}: ${sharper.length} of ${values.length} shots are sharper than at rest (${rest})`);
          await page.close();
        }
      });

      await t.test('an opaque palette and AlertDialog still fade their Backdrop and Popup', async () => {
        for (const query of ['scrim', 'alert']) {
          const page = await open(query);
          const { opened, closed, rest } = await cycle(page);
          for (const [phase, frames] of [['open', opened], ['close', closed]]) {
            const label = `${query}, ${phase}`;
            assert.ok(frames.some(({ backdrop, fading }) => fading && backdrop > 0 && backdrop < 1), `${label}: the Backdrop fades its opacity`);
            assert.ok(frames.some(({ popup }) => popup > 0 && popup < 1), `${label}: the Popup fades`);
            assert.ok(rest.scrim > 0 && frames.every(({ scrim }) => scrim === rest.scrim), `${label}: the scrim keeps its colour`);
          }
          await page.close();
        }
      });
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await close();
    }
  });
}
