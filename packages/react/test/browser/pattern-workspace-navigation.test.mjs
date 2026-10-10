import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser } from './harness.mjs';
import { focusedStop, measureBox, measurePageFit, openBlock, pageWidths, patternVariant, ringWalk, startVariantServer } from './pattern-probes.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that the workspace navigation block, loaded from its canonical
// catalog source through the public `@muxui/react` entry, folds its column to an icon
// rail with the Toggle and Cmd or Ctrl plus B, names every folded link in a tooltip,
// opens the workspace menu and its groups, keeps the current link and every href
// static, turns into a focus-trapping drawer below 40rem of container width, keeps one
// keyboard order with visible focus in light and dark, keeps a forced-colors outline on
// the workspace menu button, and never overflows the page (E-BL1-04, E-BL1-06). Runs
// in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const variant = await patternVariant('workspace-navigation', 'foldable');

const keyboardOrder = [
  'button Sample workspace',
  'textbox Search',
  'link Inbox 3',
  'link Updates',
  'link Saved',
  'link Overview',
  'group Roadmap',
  'link Reviews 12',
  'link Files',
  'group Reports',
  'link Settings',
  'button Account options',
  'button Toggle sidebar',
  'link Projects',
];

// The drawer's controls in Tab order; Tab wraps from the last to the first.
const drawerOrder = [
  'button Close navigation',
  'button Sample workspace',
  'textbox Search',
  'link Inbox 3',
  'link Updates',
  'link Saved',
  'link Overview',
  'group Roadmap',
  'link Reviews 12',
  'link Files',
  'group Reports',
  'link Settings',
  'button Account options',
];

/** Rail geometry and the Toggle contract; runs in the page. */
function readFold() {
  const root = document.querySelector('aside');
  const toggle = document.querySelector('.muxui-sidebar__toggle');
  const probe = document.createElement('div');
  probe.style.inlineSize = 'var(--muxui-component-sidebar-rail-size)';
  root.append(probe);
  const rail = probe.getBoundingClientRect().width + parseFloat(getComputedStyle(root).borderRightWidth);
  probe.remove();
  return {
    collapsed: root.hasAttribute('data-collapsed'),
    width: root.getBoundingClientRect().width,
    rail,
    id: root.id,
    expanded: toggle.getAttribute('aria-expanded'),
    controls: toggle.getAttribute('aria-controls'),
    name: toggle.getAttribute('aria-label'),
    columnOverflow: root.scrollWidth - root.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
  };
}

/** Whether `selector` has a layout box; runs in the page. */
const hasBox = (selector) => document.querySelector(selector)?.getClientRects().length > 0;

/** The name of the focused stop: a group's summary by its label, anything else as the accessibility tree names it. */
async function stopOf(tab) {
  const group = await tab.evaluate(() => (document.activeElement.tagName === 'SUMMARY' ? document.activeElement.textContent.trim() : null));
  return group === null ? focusedStop(tab) : `group ${group}`;
}

const expectFolded = (tab, collapsed, message) => pollUntil(tab, ({ collapsed }) => {
  const root = document.querySelector('aside');
  const probe = document.createElement('div');
  probe.style.inlineSize = 'var(--muxui-component-sidebar-rail-size)';
  root.append(probe);
  const rail = probe.getBoundingClientRect().width + parseFloat(getComputedStyle(root).borderRightWidth);
  probe.remove();
  const width = root.getBoundingClientRect().width;
  return root.hasAttribute('data-collapsed') === collapsed && (collapsed ? Math.abs(width - rail) < 0.5 : width > 200);
}, { collapsed }, { message, report: () => ({ collapsed: document.querySelector('aside').hasAttribute('data-collapsed'), width: document.querySelector('aside').getBoundingClientRect().width }) });

const expectFocusIn = (tab, selector, message) => pollUntil(tab, (selector) => document.querySelector(selector)?.contains(document.activeElement) === true, selector, { message, report: () => document.activeElement?.outerHTML.slice(0, 160) });
const expectFocusLabel = (tab, label, message) => pollUntil(tab, (label) => document.activeElement?.getAttribute('aria-label') === label, label, { message, report: () => document.activeElement?.outerHTML.slice(0, 160) });
const toggleButton = (tab) => tab.getByRole('button', { name: 'Toggle sidebar' });
// A key press makes React Aria treat the next focus as keyboard focus, which is what shows a tooltip.
const focusByKeyboard = async (tab, selector) => { await tab.keyboard.press('Escape'); await tab.locator(selector).focus(); };
const chordOf = async (tab, other = false) => {
  const apple = await tab.evaluate(() => /mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform));
  return apple !== other ? 'Meta+b' : 'Control+b';
};

for (const engine of browserEngines()) {
  test(`workspace navigation keeps its fold, menu, drawer, focus, and overflow behavior in ${engine}`, { timeout: 600_000 }, async (t) => {
    const { url, close } = await startVariantServer(variant);
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/block.html`, '#root > *');

      await t.test('shows the column beside the page from 40rem and a drawer header below it, with every href a fragment and a static current link', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          assert.ok(await tab.getByRole('complementary', { name: 'Workspace' }).isVisible(), 'the column is a complementary landmark named Workspace');
          assert.ok(await tab.getByRole('region', { name: 'Overview' }).isVisible(), 'the page is a region named by its heading');
          assert.equal(await tab.getByRole('heading', { level: 1, name: 'Overview' }).count(), 1);
          // The links sit in their own named navigation landmark, beside the breadcrumb trail.
          assert.deepEqual(await tab.getByRole('navigation').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label'))), ['Workspace links', 'Breadcrumb']);
          const links = tab.getByRole('navigation', { name: 'Workspace links' });
          assert.equal(await tab.locator('aside nav').count(), 1, 'the landmark sits in the column');
          assert.equal(await links.getByRole('link').count(), 7, 'the landmark holds the column links');
          assert.ok(await links.getByRole('listitem').count() > 0, 'the landmark keeps list semantics');
          assert.equal(await tab.getByRole('button', { name: 'Open navigation' }).count(), 0, 'the drawer trigger is hidden at desktop width');
          assert.equal(await tab.getByRole('link', { name: 'Inbox 3' }).count(), 1, 'a badge joins the link name');
          assert.equal(await tab.getByRole('link', { name: 'Reviews 12' }).count(), 1);
          // The links are placeholders: every href is a fragment, and the current link is fixed in the source.
          assert.ok(await tab.evaluate(() => [...document.querySelectorAll('a[href]')].every((link) => link.getAttribute('href').startsWith('#'))), 'every href is a #fragment');
          assert.deepEqual(await tab.locator('aside [aria-current]').evaluateAll((nodes) => nodes.map((node) => `${node.getAttribute('aria-current')} ${node.textContent}`)), ['page Overview']);
          await tab.getByRole('link', { name: 'Reviews 12' }).click();
          assert.equal(await tab.evaluate(() => location.hash), '#reviews', 'a link only moves the fragment');
          assert.deepEqual(await tab.locator('aside [aria-current]').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['Overview'], 'the current link stays fixed');

          // The column shows at 640px of container width and the drawer header below it.
          for (const [width, desktop] of [[640, true], [639, false]]) {
            await tab.setViewportSize({ width, height: 900 });
            await pollUntil(tab, (expected) => (document.querySelector('aside').getClientRects().length > 0) === expected, desktop, { message: `${width}px shows the ${desktop ? 'column' : 'drawer header'}`, report: () => document.documentElement.clientWidth });
            assert.equal(await tab.getByRole('button', { name: 'Open navigation' }).count(), desktop ? 0 : 1, `${width}px: the drawer trigger`);
            assert.equal(await tab.getByRole('button', { name: 'Toggle sidebar' }).count(), desktop ? 1 : 0, `${width}px: the fold button`);
          }
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('folds to an icon rail with the Toggle and unfolds, keeping every name and the header inside the rail', async () => {
        for (const scheme of ['light', 'dark']) {
          const { context, tab, errors } = await openBlock(browser, url, { scheme });
          const label = (message) => `${scheme}: ${message}`;
          try {
            let state = await tab.evaluate(readFold);
            assert.ok(!state.collapsed && state.width > 200, label(`the column starts expanded (${state.width}px)`));
            assert.equal(state.expanded, 'true');
            assert.ok(state.id !== '' && state.controls === state.id, label('the Toggle controls the column by id'));
            await tab.getByRole('textbox', { name: 'Search' }).waitFor();

            await toggleButton(tab).click();
            await expectFolded(tab, true, label('the Toggle folds the column to the rail'));
            state = await tab.evaluate(readFold);
            assert.equal(state.expanded, 'false');
            assert.equal(state.name, 'Toggle sidebar', label('the Toggle keeps one name'));
            assert.ok(state.columnOverflow <= 0 && state.pageOverflow <= 0, label(`the rail does not overflow (${JSON.stringify(state)})`));
            // Every link keeps its name and badge, and the header and account stay inside the rail.
            assert.equal(await tab.getByRole('link', { name: 'Inbox 3' }).count(), 1);
            assert.equal(await tab.getByRole('list', { name: 'Projects' }).count(), 1);
            assert.equal(await tab.getByRole('button', { name: 'Search' }).count(), 1, label('Search folds to a button'));
            assert.equal(await tab.getByRole('textbox', { name: 'Search' }).count(), 0, label('the folded Search input leaves the accessibility tree'));
            assert.equal(await tab.getByRole('button', { name: 'Account options' }).count(), 0, label('the account options button leaves the accessibility tree'));
            const column = await tab.evaluate(measureBox, 'aside');
            const trigger = await tab.evaluate(measureBox, '.workspace-switcher');
            assert.ok(trigger.left >= column.left && trigger.right <= column.right, label('the workspace button stays inside the rail'));
            assert.equal(await tab.getByRole('button', { name: 'Sample workspace' }).count(), 1, label('the folded workspace button keeps its name'));
            assert.ok((await tab.evaluate(measureBox, '.muxui-sidebar__account-avatar')).right <= column.right, label('the account avatar stays inside the rail'));

            await toggleButton(tab).click();
            await expectFolded(tab, false, label('the Toggle unfolds the column'));
            state = await tab.evaluate(readFold);
            assert.equal(state.expanded, 'true');
            assert.ok(state.columnOverflow <= 0 && state.pageOverflow <= 0);
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('folds and unfolds with Cmd or Ctrl plus B, and leaves the chord to the Search field while typing', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const chord = await chordOf(tab);
          await tab.keyboard.press(await chordOf(tab, true));
          await tab.waitForTimeout(150);
          assert.ok(!(await tab.evaluate(readFold)).collapsed, 'the other platform chord does nothing');
          await tab.keyboard.press(chord);
          await expectFolded(tab, true, `${chord} folds the column`);
          await tab.keyboard.press(chord);
          await expectFolded(tab, false, `${chord} unfolds the column`);

          // The chord works from a link and from the fold button, and is ignored in the Search input.
          await tab.locator('a[href="#files"]').focus();
          await tab.keyboard.press(chord);
          await expectFolded(tab, true, `${chord} folds the column from a link`);
          await toggleButton(tab).focus();
          await tab.keyboard.press(chord);
          await expectFolded(tab, false, `${chord} unfolds the column from the Toggle`);
          await tab.getByRole('textbox', { name: 'Search' }).focus();
          await tab.keyboard.press(chord);
          await tab.waitForTimeout(150);
          assert.ok(!(await tab.evaluate(readFold)).collapsed, `${chord} in the Search field leaves the column alone`);
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('names every folded link in a tooltip on hover and keyboard focus', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await toggleButton(tab).click();
          await expectFolded(tab, true, 'the column folds');
          const tooltip = tab.getByRole('tooltip');
          // Keyboard focus names a link, a badge-less link, and a group by its label alone.
          for (const [selector, name] of [['a[href="#inbox"]', 'Inbox'], ['a[href="#files"]', 'Files'], ['summary:has-text("Roadmap")', 'Roadmap']]) {
            await focusByKeyboard(tab, selector);
            await tooltip.waitFor({ timeout: 5000 });
            assert.equal((await tooltip.textContent()).trim(), name, `keyboard focus names ${name}`);
            await tab.keyboard.press('Escape');
            await tooltip.waitFor({ state: 'detached', timeout: 5000 });
          }
          await tab.mouse.move(0, 0);
          await tab.locator('a[href="#settings"]').hover();
          await tooltip.waitFor({ timeout: 5000 });
          assert.equal((await tooltip.textContent()).trim(), 'Settings', 'hover names the link');
          await tab.mouse.move(0, 0);
          await toggleButton(tab).click();
          await expectFolded(tab, false, 'the column unfolds');
          await focusByKeyboard(tab, 'a[href="#inbox"]');
          await tab.waitForTimeout(700);
          assert.equal(await tooltip.count(), 0, 'an expanded column shows no tooltip');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('opens nested groups, and a folded group or Search unfolds the column', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.locator('summary', { hasText: 'Roadmap' }).click();
          assert.deepEqual(await tab.locator('a[href="#now"], a[href="#next"], a[href="#later"]').allTextContents(), ['Now', 'Next', 'Later'], 'a group lists its links');
          assert.ok(await tab.locator('a[href="#now"]').isVisible());
          assert.ok(!(await tab.locator('a[href="#weekly"]').isVisible()), 'a closed group hides its links');
          await tab.locator('a[href="#next"]').click();
          assert.equal(await tab.evaluate(() => location.hash), '#next');

          await toggleButton(tab).click();
          await expectFolded(tab, true, 'the column folds with a group open');
          assert.ok(!(await tab.locator('a[href="#next"]').isVisible()), 'a folded rail hides group links');
          await tab.locator('summary', { hasText: 'Reports' }).click();
          await expectFolded(tab, false, 'a folded group unfolds the column');
          assert.ok(await tab.locator('a[href="#weekly"]').isVisible(), 'and opens that group');

          await toggleButton(tab).click();
          await expectFolded(tab, true, 'the column folds again');
          await tab.getByRole('button', { name: 'Search' }).click();
          await expectFolded(tab, false, 'a folded Search unfolds the column');
          assert.ok(await tab.evaluate(() => document.activeElement === document.querySelector('.muxui-sidebar__search-input')), 'and focuses the Search input');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('opens the workspace menu by pointer and keyboard, expanded and folded, and its items change nothing', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          const trigger = tab.getByRole('button', { name: 'Sample workspace' });
          const menu = tab.getByRole('menu');
          await trigger.click();
          await menu.waitFor();
          assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['Sample workspace', 'Example team']);
          await menu.getByRole('menuitem', { name: 'Example team' }).click();
          await menu.waitFor({ state: 'detached' });
          assert.ok((await tab.evaluate(readFold)).collapsed === false, 'an item leaves the column unfolded');
          assert.deepEqual(await tab.locator('aside [aria-current]').evaluateAll((nodes) => nodes.map((node) => node.textContent)), ['Overview'], 'and the current link');
          assert.equal(await trigger.count(), 1, 'and the workspace name');
          assert.ok(await tab.evaluate(() => document.activeElement === document.querySelector('.workspace-switcher')), 'focus returns to the workspace button');

          // Enter opens it, ArrowDown moves, and Escape closes it and returns focus.
          await tab.keyboard.press('Enter');
          await menu.waitFor();
          await pollUntil(tab, () => document.activeElement?.getAttribute('role') === 'menuitem', undefined, { message: 'the menu takes focus', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('ArrowDown');
          await pollUntil(tab, () => document.activeElement?.textContent === 'Example team', undefined, { message: 'ArrowDown moves to the next item', report: () => document.activeElement?.outerHTML.slice(0, 120) });
          await tab.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached' });
          assert.ok(await tab.evaluate(() => document.activeElement === document.querySelector('.workspace-switcher')), 'Escape returns focus to the workspace button');

          // The folded rail clips its header, not the menu: the popup opens whole beside the rail.
          await toggleButton(tab).click();
          await expectFolded(tab, true, 'the column folds');
          await trigger.click();
          await menu.waitFor();
          const item = await menu.getByRole('menuitem', { name: 'Example team' }).boundingBox();
          assert.ok(item.width > 80 && item.x >= 0, 'the folded menu shows whole items');
          assert.ok(await tab.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menu"]') != null, { x: item.x + item.width / 2, y: item.y + item.height / 2 }), 'the menu is the topmost layer');
          await tab.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached' });
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('keeps a visible outline on the workspace menu button in forced colors', async () => {
        const { context, tab, errors } = await openBlock(browser, url);
        try {
          await tab.emulateMedia({ forcedColors: 'active' });
          assert.ok(await tab.evaluate(() => matchMedia('(forced-colors: active)').matches), 'the page is in forced colors');
          await tab.locator('#before').focus();
          await tab.keyboard.press('Tab');
          await expectFocusIn(tab, '.workspace-switcher', 'Tab reaches the workspace button');
          const read = (selector) => tab.evaluate((css) => {
            const style = getComputedStyle(document.querySelector(css));
            return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, shadow: style.boxShadow };
          }, selector);
          const focused = await read('.workspace-switcher:focus');
          // The box-shadow ring is the paint forced colors drops, so the focus indicator has to be an outline.
          assert.notEqual(focused.style, 'none', 'the focused button keeps an outline');
          assert.ok(focused.width >= 2, `the outline is at least 2px wide (${focused.width}px)`);
          // Where the engine applies forced colors (it drops the shadow), the outline paints a system colour, not transparency.
          if (focused.shadow === 'none') assert.ok(!/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/u.test(focused.color), `the outline is not transparent (${focused.color})`);
          await tab.locator('#after').focus();
          assert.equal((await read('.workspace-switcher:not(:focus)')).style, 'none', 'a button at rest has no outline');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('keeps one keyboard order through the column and the page, with a visible focus ring in light and dark', async () => {
        for (const scheme of ['light', 'dark']) {
          const { context, tab, errors } = await openBlock(browser, url, { scheme });
          try {
            await tab.locator('#before').focus();
            const walk = ringWalk(tab);
            const seen = [];
            for (let step = 0; step < keyboardOrder.length; step += 1) {
              await tab.evaluate(() => { window.__previousFocus = document.activeElement; });
              await tab.keyboard.press('Tab');
              await pollUntil(tab, () => document.activeElement !== window.__previousFocus, undefined, { message: `${scheme}: Tab moves focus on step ${step + 1}`, report: () => document.activeElement?.outerHTML.slice(0, 160) });
              const stop = await stopOf(tab);
              seen.push(stop);
              await walk.land(stop);
            }
            assert.deepEqual(seen, keyboardOrder, `${scheme}: Tab order`);
            await tab.keyboard.press('Tab');
            await pollUntil(tab, () => document.activeElement?.id === 'after', undefined, { message: `${scheme}: Tab leaves the block for the next control`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
            await walk.finish();
            assert.deepEqual(errors, []);
          } finally {
            await context.close();
          }
        }
      });

      await t.test('opens a focus-trapping drawer below 40rem that returns focus to its button, even after the rail was folded', async () => {
        const { context, tab, errors } = await openBlock(browser, url, { width: 1280 });
        try {
          // A rail folded at desktop width does not fold the drawer.
          await toggleButton(tab).click();
          await expectFolded(tab, true, 'the column folds at desktop width');
          await tab.setViewportSize({ width: 360, height: 800 });
          const open = tab.getByRole('button', { name: 'Open navigation' });
          await open.waitFor();
          assert.ok(!(await tab.locator('aside').isVisible()), 'the column is hidden');
          await open.click();
          const dialog = tab.getByRole('dialog', { name: 'Navigation' });
          await dialog.waitFor();
          assert.ok(await dialog.getByRole('textbox', { name: 'Search' }).isVisible(), 'the drawer shows the unfolded Search field');
          assert.equal(await dialog.locator('[data-collapsed]').count(), 0, 'the drawer is not folded');
          assert.deepEqual(await dialog.getByRole('link').allTextContents(), ['Inbox3', 'Updates', 'Saved', 'Overview', 'Reviews12', 'Files', 'Settings'], 'the drawer lists the same links');
          assert.equal(await dialog.getByRole('button', { name: 'Close navigation' }).count(), 1);
          const links = dialog.getByRole('navigation', { name: 'Workspace links' });
          assert.equal(await links.getByRole('link').count(), 7, 'the drawer keeps the named navigation landmark');
          assert.ok(await links.getByRole('listitem').count() > 0, 'and its list semantics');
          await pollUntil(tab, () => document.querySelector('[role="dialog"]').contains(document.activeElement), undefined, { message: 'the drawer takes focus', report: () => document.activeElement?.outerHTML.slice(0, 120) });

          // Tab moves through the drawer's controls in order and wraps from the last to the first; Shift+Tab does the reverse.
          const walk = async (key, count) => {
            const seen = [];
            for (let step = 0; step < count; step += 1) {
              await tab.keyboard.press(key);
              seen.push(await stopOf(tab));
              assert.ok(await tab.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)), `${key} step ${step + 1} stays inside the drawer`);
            }
            return seen;
          };
          assert.deepEqual(await walk('Tab', drawerOrder.length), drawerOrder, 'Tab visits every drawer control in order');
          assert.deepEqual(await walk('Tab', 1), [drawerOrder[0]], 'Tab wraps from the last control to the first');
          assert.deepEqual(await walk('Shift+Tab', drawerOrder.length), [...drawerOrder].reverse(), 'Shift+Tab wraps to the last control and walks back through them all');
          await tab.keyboard.press('Escape');
          await dialog.waitFor({ state: 'detached' });
          await expectFocusLabel(tab, 'Open navigation', 'Escape returns focus to the header button');
          await open.click();
          await dialog.waitFor();
          await dialog.getByRole('button', { name: 'Close navigation' }).click();
          await dialog.waitFor({ state: 'detached' });
          await expectFocusLabel(tab, 'Open navigation', 'the close button returns focus to the header button');

          // The workspace menu opens above the drawer, and choosing an item leaves the drawer open.
          await open.click();
          await dialog.waitFor();
          const trigger = dialog.getByRole('button', { name: 'Sample workspace' });
          await trigger.click();
          const menu = tab.getByRole('menu');
          await menu.waitFor();
          const item = await menu.getByRole('menuitem', { name: 'Example team' }).boundingBox();
          assert.ok(await tab.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menu"]') != null, { x: item.x + item.width / 2, y: item.y + item.height / 2 }), 'the menu opens above the drawer');
          await tab.keyboard.press('ArrowDown');
          await tab.keyboard.press('Enter');
          await menu.waitFor({ state: 'detached' });
          assert.ok(await dialog.isVisible(), 'choosing a workspace leaves the drawer open');
          assert.ok(await tab.evaluate(() => document.activeElement?.classList.contains('workspace-switcher')), 'focus returns to the workspace button in the drawer');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('hands focus between the drawer and the column when the container crosses 40rem, closing the drawer as the column returns', async () => {
        const { context, tab, errors } = await openBlock(browser, url, { width: 360, height: 800 });
        try {
          const open = tab.getByRole('button', { name: 'Open navigation' });
          const dialog = tab.getByRole('dialog', { name: 'Navigation' });
          await open.click();
          await dialog.waitFor();
          await dialog.getByRole('link', { name: 'Files' }).focus();
          assert.ok(await tab.evaluate(() => document.activeElement?.getAttribute('href') === '#files' && document.activeElement.closest('[role="dialog"]') != null), 'focus starts on the drawer link');

          // Widening closes the drawer and puts focus on the same link in the column.
          await tab.setViewportSize({ width: 1280, height: 800 });
          await dialog.waitFor({ state: 'detached' });
          await pollUntil(tab, () => document.activeElement === document.querySelector('aside a[href="#files"]'), undefined, { message: 'focus moves to the matching column link', report: () => document.activeElement?.outerHTML.slice(0, 160) });
          assert.ok(await tab.locator('aside').isVisible(), 'the column is showing');
          assert.equal(await tab.getByRole('button', { name: 'Open navigation' }).count(), 0, 'the drawer header is hidden');

          // Narrowing with focus in the column moves it to the header button.
          await tab.locator('aside a[href="#saved"]').focus();
          await tab.setViewportSize({ width: 360, height: 800 });
          await pollUntil(tab, () => document.activeElement?.getAttribute('aria-label') === 'Open navigation', undefined, { message: 'focus moves to the header button', report: () => document.activeElement?.outerHTML.slice(0, 160) });
          assert.equal(await dialog.count(), 0, 'the drawer stays closed');
          await open.click();
          await dialog.waitFor();
          assert.ok(await dialog.getByRole('navigation', { name: 'Workspace links' }).isVisible(), 'the drawer still opens afterwards');
          assert.deepEqual(errors, []);
        } finally {
          await context.close();
        }
      });

      await t.test('never scrolls the page horizontally at 360, 768, and 1280 in light and dark, folded, unfolded, and in the drawer', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const width of pageWidths) {
            const { context, tab, errors } = await openBlock(browser, url, { width, scheme });
            const label = (message) => `${scheme} ${width}px: ${message}`;
            try {
              const fits = async (message) => {
                const { scrollWidth, innerWidth } = await tab.evaluate(measurePageFit);
                assert.ok(scrollWidth <= innerWidth, label(`${message}: the page scrolls horizontally (${scrollWidth} > ${innerWidth})`));
                const block = await tab.evaluate(measureBox, '.workspace');
                assert.ok(block.left >= 0 && block.right <= innerWidth, label(`${message}: the block stays inside the viewport`));
                const main = await tab.evaluate(measureBox, '.workspace-main');
                assert.ok(main.left >= block.left && main.right <= block.right + 0.5, label(`${message}: the page stays inside the block`));
              };
              await fits('unfolded');
              if (width >= 640) {
                assert.ok(await tab.evaluate(hasBox, 'aside'), label('the column shows'));
                await toggleButton(tab).click();
                await expectFolded(tab, true, label('the column folds'));
                await fits('folded');
              } else {
                assert.ok(!(await tab.evaluate(hasBox, 'aside')), label('the column gives way to the drawer'));
                await tab.getByRole('button', { name: 'Open navigation' }).click();
                const dialog = tab.getByRole('dialog', { name: 'Navigation' });
                await dialog.waitFor();
                // The drawer fits the viewport and scrolls its own content, never sideways.
                await pollUntil(tab, () => document.querySelector('[role="dialog"]').getBoundingClientRect().width > 100, undefined, { message: label('the drawer opens'), report: () => document.querySelector('[role="dialog"]').getBoundingClientRect().width });
                const box = await dialog.boundingBox();
                assert.ok(box.x >= 0 && box.x + box.width <= width, label('the drawer stays inside the viewport'));
                assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth), label('the drawer does not scroll sideways'));
                await fits('open drawer');
              }
              assert.deepEqual(errors, []);
            } finally {
              await context.close();
            }
          }
        }
      });
    } finally {
      await browser?.close();
      await close();
    }
  });
}
