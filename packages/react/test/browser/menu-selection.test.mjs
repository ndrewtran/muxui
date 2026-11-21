import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A checkable Menu.List exposes its items as radio or checkbox items whose aria-checked follows the selection, draws a
// check mark only on a checked item, and keeps that state apart from aria-current. A radio list keeps its checked item
// when it is pressed again, and a Menu.Shortcut in a checkable item sits clear of its label and check mark. Runs in
// every engine named by MUXUI_BROWSER_ENGINES.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
window.events = [];
const params = new URLSearchParams(location.search);
document.documentElement.dataset.muxuiColorScheme = params.get('scheme') ?? 'light';
document.documentElement.dataset.muxuiMotion = 'reduced';
function Levels() {
  const [ids, setIds] = React.useState(['normal']);
  return h(Menu.Root, { defaultOpen: true, shouldCloseOnSelect: false },
    h(Menu.Trigger, null, 'Text style'),
    h(Menu.Popup, null, h(Menu.List, {
      'aria-label': 'Text style', selectionMode: 'single', selectedIds: ids,
      onSelectionChange: (next) => { window.events.push(['single', next]); setIds(next); },
    },
      h(Menu.Item, { id: 'normal', 'aria-current': 'true' }, 'Normal text'),
      h(Menu.Item, { id: 'heading', textValue: 'Heading', 'aria-keyshortcuts': 'Control+Alt+1' }, 'Heading', h(Menu.Shortcut, { keys: ['Ctrl', 'Alt', '1'] })),
      h(Menu.Item, { id: 'quote', disabled: true }, 'Quote'))));
}
function Options() {
  return h(Menu, {
    'aria-label': 'View options', selectionMode: 'multiple', defaultSelectedIds: ['grid'],
    onSelectionChange: (next) => window.events.push(['multiple', next]),
  }, h(Menu.Item, { id: 'grid' }, 'Show grid'), h(Menu.Item, { id: 'rulers' }, 'Show rulers'));
}
// An uncontrolled list in a popup, which unmounts while the menu is closed. ?mode picks single or multiple.
function Popup() {
  const mode = params.get('mode');
  return h(Menu.Root, null,
    h(Menu.Trigger, null, 'View'),
    h(Menu.Popup, null, h(Menu.List, {
      'aria-label': 'View', selectionMode: mode, defaultSelectedIds: ['grid'],
      onSelectionChange: (next) => window.events.push([mode, next]),
    }, h(Menu.Item, { id: 'grid' }, 'Show grid'), h(Menu.Item, { id: 'rulers' }, 'Show rulers'))));
}
// Two sibling submenus of uncontrolled lists whose options share ids, and a root list whose options, defaults and
// mode the page changes: window.setState merges into them. ?all checks every option of the root list at first.
function Nested() {
  const [state, setState] = React.useState({ extra: false, defaults: params.has('all') ? 'all' : ['grid'], mode: 'multiple' });
  window.setState = (next) => setState((current) => ({ ...current, ...next }));
  const pair = (label) => [h(Menu.Item, { key: 'name', id: 'name' }, label + ' by name'), h(Menu.Item, { key: 'date', id: 'date' }, label + ' by date')];
  return h(Menu.Root, { shouldCloseOnSelect: false },
    h(Menu.Trigger, null, 'Options'),
    h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Options', selectionMode: state.mode, defaultSelectedIds: state.defaults },
      h(Menu.Item, { id: 'grid' }, 'Show grid'),
      h(Menu.Item, { id: 'rulers' }, 'Show rulers'),
      state.extra && h(Menu.Item, { id: 'guides' }, 'Show guides'),
      h(Menu.Submenu, { delay: 0 }, h(Menu.Item, { id: 'sort' }, 'Sort'),
        h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Sort', selectionMode: 'single', defaultSelectedIds: ['name'] }, pair('Sort')))),
      h(Menu.Submenu, { delay: 0 }, h(Menu.Item, { id: 'columns' }, 'Columns'),
        h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Columns', selectionMode: 'multiple' }, pair('Column')))))));
}
// A submenu item whose id holds a slash, team/sort, beside a Team submenu that holds a Sort submenu.
function Paths() {
  const list = (label) => h(Menu.List, { 'aria-label': label, selectionMode: 'multiple' }, h(Menu.Item, { id: 'name' }, label + ' by name'), h(Menu.Item, { id: 'date' }, label + ' by date'));
  return h(Menu.Root, { shouldCloseOnSelect: false },
    h(Menu.Trigger, null, 'Group'),
    h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Group' },
      h(Menu.Submenu, { delay: 0 }, h(Menu.Item, { id: 'team' }, 'Team'),
        h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Team' },
          h(Menu.Submenu, { delay: 0 }, h(Menu.Item, { id: 'sort' }, 'Sort'), h(Menu.Popup, null, list('Team sort')))))),
      h(Menu.Submenu, { delay: 0 }, h(Menu.Item, { id: 'team/sort' }, 'Team/sort'), h(Menu.Popup, null, list('Direct sort'))))));
}
const cases = { multiple: Options, popup: Popup, nested: Nested, paths: Paths };
createRoot(document.getElementById('root')).render(h(cases[params.get('case')] ?? Levels));
document.documentElement.dataset.ready = 'true';
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="reduced"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/menu-selection-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Menu checkable items in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs'],
      pages: { '/menu-selection.html': page },
      modules: { '/menu-selection-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const open = async (search) => {
        await tab.goto(`${url}/menu-selection.html?${search}`, { waitUntil: 'load' });
        await tab.locator('.muxui-menu__item').first().waitFor();
        await awaitFontsAndFrames(tab);
      };
      // Each item's role, checked and current state, and whether it draws a check mark.
      const items = () => tab.locator('.muxui-menu__item').evaluateAll((nodes) => nodes.map((node) => ({
        role: node.getAttribute('role'),
        checked: node.getAttribute('aria-checked'),
        current: node.getAttribute('aria-current'),
        mark: Boolean(node.querySelector('.muxui-menu__item-indicator .muxui-menu__item-check')),
        selected: node.hasAttribute('data-muxui-state-selected'),
      })));
      const events = () => tab.evaluate(() => window.events);

      await t.test('a single-selection list is radio items, checked apart from current', async () => {
        await open('case=single');
        assert.deepEqual(await items(), [
          { role: 'menuitemradio', checked: 'true', current: 'true', mark: true, selected: true },
          { role: 'menuitemradio', checked: 'false', current: null, mark: false, selected: false },
          { role: 'menuitemradio', checked: 'false', current: null, mark: false, selected: false },
        ]);
        await tab.getByRole('menuitemradio', { name: 'Heading' }).click();
        assert.deepEqual((await items()).map(({ checked, current, mark }) => [checked, current, mark]), [['false', 'true', false], ['true', null, true], ['false', null, false]], 'pressing an item checks it alone; current stays where it was');
        // Pressing the checked radio item keeps it checked.
        await tab.getByRole('menuitemradio', { name: 'Heading' }).click();
        assert.equal((await items())[1].checked, 'true', 'the checked radio item stays checked');
        // The keyboard checks an item too, and a disabled item never does.
        await tab.keyboard.press('ArrowUp');
        await tab.keyboard.press('Space');
        assert.equal((await items())[0].checked, 'true', 'Space checks the focused item');
        await tab.getByRole('menuitemradio', { name: 'Quote' }).click({ force: true });
        assert.deepEqual(await events(), [['single', ['heading']], ['single', ['normal']]], 'one change per new checked item, none for the disabled one');
      });

      await t.test('a multiple-selection list is checkbox items that each toggle', async () => {
        await open('case=multiple');
        assert.deepEqual((await items()).map(({ role, checked, mark }) => [role, checked, mark]), [['menuitemcheckbox', 'true', true], ['menuitemcheckbox', 'false', false]]);
        await tab.getByRole('menuitemcheckbox', { name: 'Show rulers' }).click();
        await tab.getByRole('menuitemcheckbox', { name: 'Show grid' }).click();
        assert.deepEqual((await items()).map(({ checked }) => checked), ['false', 'true']);
        assert.deepEqual(await events(), [['multiple', ['grid', 'rulers']], ['multiple', ['rulers']]]);
      });

      // The list in a popup unmounts while the menu is closed; reopening shows what was checked, not defaultSelectedIds.
      for (const [mode, role] of [['single', 'menuitemradio'], ['multiple', 'menuitemcheckbox']]) {
        await t.test(`an uncontrolled ${mode}-selection list in a popup keeps its checked items when reopened`, async () => {
          await tab.goto(`${url}/menu-selection.html?case=popup&mode=${mode}`, { waitUntil: 'load' });
          const trigger = tab.getByRole('button', { name: 'View' });
          await trigger.waitFor();
          await awaitFontsAndFrames(tab);
          await trigger.click();
          await tab.getByRole(role, { name: 'Show rulers' }).click();
          await tab.getByRole('menu').waitFor({ state: 'detached' });
          await trigger.click();
          await tab.getByRole('menu').waitFor();
          const expected = mode === 'single' ? ['false', 'true'] : ['true', 'true'];
          assert.deepEqual((await items()).map(({ checked }) => checked), expected, 'the reopened list shows the checked items');
          assert.deepEqual(await events(), [[mode, mode === 'single' ? ['rulers'] : ['grid', 'rulers']]]);
          await tab.keyboard.press('Escape');
          await tab.getByRole('menu').waitFor({ state: 'detached' });
        });
      }

      // Each uncontrolled list keeps its own checks, whatever ids its options share with another list, and keeps them
      // when options are added; it reads its defaults once, and a list made single keeps the item checked earliest.
      await t.test('uncontrolled lists keep their own checks under one root', async () => {
        const warnings = [];
        const onConsole = (message) => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()); };
        tab.on('console', onConsole);
        await tab.goto(`${url}/menu-selection.html?case=nested`, { waitUntil: 'load' });
        const trigger = tab.getByRole('button', { name: 'Options' });
        await trigger.waitFor();
        await awaitFontsAndFrames(tab);
        const checks = (name) => tab.getByRole('menu', { name, exact: true }).locator('.muxui-menu__item').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-checked')));
        const openSubmenu = async (name) => {
          await tab.getByRole('menuitem', { name, exact: true }).hover();
          await tab.getByRole('menu', { name, exact: true }).waitFor();
        };
        await trigger.click();
        // A list with no defaults takes its first check as the same kind of list, with no warning.
        await openSubmenu('Columns');
        await tab.getByRole('menuitemcheckbox', { name: 'Column by name' }).click();
        await tab.getByRole('menuitemcheckbox', { name: 'Column by date' }).click();
        assert.deepEqual(await checks('Columns'), ['true', 'true']);
        await openSubmenu('Sort');
        assert.deepEqual(await checks('Sort'), ['true', 'false'], 'a sibling list whose options share ids keeps its own checks');
        // Adding an option keeps the checks of the mounted list.
        await tab.getByRole('menuitemcheckbox', { name: 'Show rulers' }).click();
        await tab.evaluate(() => window.setState({ extra: true }));
        await tab.getByRole('menuitemcheckbox', { name: 'Show guides' }).waitFor();
        assert.deepEqual((await checks('Options')).slice(0, 3), ['true', 'true', 'false'], 'adding an option keeps the checks');
        await tab.keyboard.press('Escape');
        await tab.keyboard.press('Escape');
        await tab.getByRole('menu').first().waitFor({ state: 'detached' });
        // Defaults changed while the menu is closed do not reach a list that already has its checks.
        await tab.evaluate(() => window.setState({ defaults: [] }));
        await trigger.click();
        assert.deepEqual((await checks('Options')).slice(0, 3), ['true', 'true', 'false'], 'the defaults are read once');
        // Made single, the list keeps the item checked earliest.
        await tab.evaluate(() => window.setState({ mode: 'single' }));
        await tab.getByRole('menuitemradio', { name: 'Show grid' }).waitFor();
        assert.deepEqual((await checks('Options')).slice(0, 3), ['true', 'false', 'false'], 'one radio stays checked, the earliest');
        tab.off('console', onConsole);
        assert.deepEqual(warnings.filter((text) => !/React DevTools|\[vite\]/u.test(text)), [], 'no warning');
        await tab.keyboard.press('Escape');
      });

      // A list that checks every option at first and is then made single keeps one radio checked, the first it may check.
      await t.test('an uncontrolled list made single from all keeps its first option checked', async () => {
        await tab.goto(`${url}/menu-selection.html?case=nested&all`, { waitUntil: 'load' });
        const trigger = tab.getByRole('button', { name: 'Options' });
        await trigger.waitFor();
        await awaitFontsAndFrames(tab);
        const checks = () => tab.getByRole('menu', { name: 'Options', exact: true }).locator('.muxui-menu__item').evaluateAll((nodes) => nodes.slice(0, 2).map((node) => node.getAttribute('aria-checked')));
        await trigger.click();
        assert.deepEqual(await checks(), ['true', 'true'], 'all is checked at first');
        await tab.keyboard.press('Escape');
        await tab.getByRole('menu').first().waitFor({ state: 'detached' });
        await tab.evaluate(() => window.setState({ defaults: [], mode: 'single' }));
        await trigger.click();
        await tab.getByRole('menuitemradio', { name: 'Show grid' }).waitFor();
        assert.deepEqual(await checks(), ['true', 'false'], 'the first option stays checked');
        await tab.keyboard.press('Escape');
      });

      // A list's place under its root is the ids of the submenu items that open it, so a submenu item whose id holds a
      // slash never shares its list's checks with a list nested deeper.
      await t.test('a submenu id with a slash keeps its own checks apart from a deeper list', async () => {
        await tab.goto(`${url}/menu-selection.html?case=paths`, { waitUntil: 'load' });
        const trigger = tab.getByRole('button', { name: 'Group' });
        await trigger.waitFor();
        await awaitFontsAndFrames(tab);
        const checks = (name) => tab.getByRole('menu', { name, exact: true }).locator('.muxui-menu__item').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-checked')));
        // A submenu's list is named by the item that opens it. The pointer opens a submenu of the root list, and the
        // keyboard the one inside another submenu.
        const openSubmenu = async (name) => {
          const item = tab.getByRole('menuitem', { name, exact: true });
          if (name === 'Sort') {
            await item.focus();
            await tab.keyboard.press('ArrowRight');
          } else await item.hover();
          await tab.getByRole('menu', { name, exact: true }).waitFor();
        };
        await trigger.click();
        await openSubmenu('Team');
        await openSubmenu('Sort');
        await tab.getByRole('menuitemcheckbox', { name: 'Team sort by name' }).click();
        assert.deepEqual(await checks('Sort'), ['true', 'false']);
        await openSubmenu('Team/sort');
        assert.deepEqual(await checks('Team/sort'), ['false', 'false'], 'the list of team/sort has no checks of its own yet');
        await openSubmenu('Team');
        await openSubmenu('Sort');
        assert.deepEqual(await checks('Sort'), ['true', 'false'], 'the deeper list keeps its check');
        await tab.keyboard.press('Escape');
      });

      for (const scheme of ['light', 'dark']) {
        await t.test(`a checkable item's shortcut and label clear its check mark slot, in the ${scheme} scheme`, async () => {
          await open(`case=single&scheme=${scheme}`);
          const item = tab.getByRole('menuitemradio', { name: 'Heading', exact: true });
          const layout = await item.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            const keys = node.querySelector('.muxui-menu__shortcut').getBoundingClientRect();
            const mark = node.querySelector('.muxui-menu__item-indicator').getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(node.querySelector('.muxui-menu__item-indicator').nextSibling);
            const label = range.getBoundingClientRect();
            return { end: box.right - parseFloat(style.paddingRight) - keys.right, gapAfterLabel: keys.left - label.right, gapAfterMark: label.left - mark.right, markWidth: mark.width };
          });
          assert.ok(Math.abs(layout.end) <= 1, `the keys end ${layout.end}px from the item's content edge`);
          assert.ok(layout.gapAfterLabel > 0, `the keys clear the label by ${layout.gapAfterLabel}px`);
          assert.ok(layout.gapAfterMark > 0 && layout.markWidth > 0, `the label clears the check mark slot by ${layout.gapAfterMark}px`);
        });
      }

      await tab.emulateMedia({ forcedColors: 'active' });
      await open('case=multiple');
      const forced = await tab.evaluate(() => matchMedia('(forced-colors: active)').matches);
      await t.test('under forced colours only the focused item is highlighted, and a checked one shows its mark', { skip: !forced && `${engine} has no forced-colors mode` }, async () => {
        await tab.getByRole('menuitemcheckbox', { name: 'Show rulers' }).focus();
        await tab.waitForFunction(() => document.querySelectorAll('.muxui-menu__item[data-muxui-state-focused]').length === 1);
        const fills = await tab.locator('.muxui-menu__item').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
        const canvas = await tab.evaluate(() => {
          const probe = document.body.appendChild(document.createElement('div'));
          probe.style.background = 'Canvas';
          const value = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return value;
        });
        assert.notEqual(fills[0], fills[1], 'the checked item and the focused item differ');
        assert.ok([canvas, 'rgba(0, 0, 0, 0)'].includes(fills[0]), `the checked item keeps the menu's surface (${fills[0]})`);
        assert.ok((await items())[0].mark, 'the checked item shows its check mark');
        await tab.emulateMedia({ forcedColors: 'none' });
      });

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
