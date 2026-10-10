import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof for the folding Sidebar rail, in light and dark: Toggle folds
// and unfolds Root, controlled and uncontrolled state, the Cmd or Ctrl plus B
// shortcut, folded NavItem names and tooltips, nested groups, Search, the other
// folded parts, the width transition under full and reduced motion, and overflow.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs). The
// Storybook audit owns axe coverage; here names and contrast are checked directly.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '/src/supplemental/index.mjs';

const h = React.createElement;
const params = new URLSearchParams(location.search);
const Icon = ({ className }) => h('svg', { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, 'aria-hidden': true }, h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }));
window.__changes = [];

function Shell() {
  const [mounted, setMounted] = React.useState(true);
  const [folded, setFolded] = React.useState(params.get('folded') === '1');
  const controlled = params.get('mode') === 'controlled';
  const provider = {
    shortcut: params.get('shortcut') === 'none' ? undefined : 'b',
    ...(controlled
      ? { collapsed: folded, onCollapsedChange: (next) => { window.__changes.push(next); if (params.get('reject') !== '1') setFolded(next); } }
      : { defaultCollapsed: folded, onCollapsedChange: (next) => window.__changes.push(next) }),
  };
  const shell = h('div', { className: 'shell' },
    h(Sidebar.Root, { 'aria-label': 'Workspace' },
      h(Sidebar.Header, null,
        h('button', { type: 'button', className: 'switcher' }, h('span', { className: 'tile', 'aria-hidden': true }, 'S'), 'Sample workspace'),
        h(Sidebar.Search)),
      h(Sidebar.NavList, { 'aria-label': 'Workspace' },
        h(Sidebar.NavItem, { href: '#home', icon: Icon }, 'Home'),
        h(Sidebar.NavItem, { href: '#inbox', icon: Icon, badge: '3' }, 'Inbox'),
        h(Sidebar.NavItem, { href: '#docs' }, 'Docs'),
        h(Sidebar.Section, { label: 'Projects' },
          h(Sidebar.NavItem, { href: '#overview', icon: Icon, current: true }, 'Overview'),
          h(Sidebar.NavItem, { icon: Icon, items: [{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }] }, 'Roadmap'))),
      h(Sidebar.FeatureCard, { title: 'Try Scale', description: 'Explore tokens', onDismiss: () => {} }),
      h(Sidebar.AccountCard, { name: 'Sample user', email: 'sample@example.com' })),
    h('main', { className: 'main' },
      h(Sidebar.Toggle, { size: 'sm' }),
      h('input', { id: 'field', 'aria-label': 'Notes' }),
      h('div', { id: 'editor', contentEditable: true, role: 'textbox', 'aria-label': 'Editor', suppressContentEditableWarning: true }, 'Draft'),
      h('button', { type: 'button', id: 'external', onClick: () => setFolded((value) => !value) }, 'Set folded'),
      h('button', { type: 'button', id: 'unmount', onClick: () => setMounted(false) }, 'Unmount')));
  return h(React.Fragment, null, h('button', { id: 'before', tabIndex: 0 }, 'Before'), mounted ? h(Sidebar.Provider, provider, shell) : null);
}
createRoot(document.getElementById('root')).render(h(Shell));
`;

const css = `
.shell { display: flex; block-size: 40rem; overflow: hidden; border: 1px solid var(--muxui-semantic-border-default); }
.main { display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-inline-size: 0; gap: 8px; padding: 12px; }
.switcher { display: flex; align-items: center; gap: 8px; inline-size: 100%; padding: 4px; border: 0; background: transparent; color: inherit; }
.tile { display: grid; place-items: center; flex: none; inline-size: 2rem; block-size: 2rem; border-radius: 6px; background: var(--muxui-semantic-surface-track); }
.muxui-sidebar .muxui-sidebar__account-card { margin-block-start: auto; }
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}"${url.searchParams.get('motion') === 'reduced' ? ' data-muxui-motion="reduced"' : ''}`,
  head: `<link rel="stylesheet" href="/generated/styles.css"><style>${css}</style>`,
  bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/sidebar-entry.mjs',
});

/** Rail geometry, state, and the Toggle contract; runs in the page. */
function readSidebar() {
  const root = document.querySelector('aside');
  const toggle = document.querySelector('.muxui-sidebar__toggle');
  const probe = document.createElement('div');
  probe.style.inlineSize = 'var(--muxui-component-sidebar-rail-size)';
  root.append(probe);
  const railContent = probe.getBoundingClientRect().width;
  probe.remove();
  const border = parseFloat(getComputedStyle(root).borderRightWidth);
  const overflowing = [...root.querySelectorAll('.muxui-sidebar__header, .muxui-sidebar__nav-list, .muxui-sidebar__account-card, .muxui-sidebar__nav-link, .muxui-sidebar__search-button')]
    .filter((node) => node.getClientRects().length > 0 && node.getBoundingClientRect().right > root.getBoundingClientRect().right + 0.5)
    .map((node) => node.className);
  return {
    collapsed: root.hasAttribute('data-collapsed'),
    width: root.getBoundingClientRect().width,
    railWidth: railContent + border,
    id: root.id,
    expanded: toggle.getAttribute('aria-expanded'),
    controls: toggle.getAttribute('aria-controls'),
    toggleName: toggle.getAttribute('aria-label'),
    rootOverflow: root.scrollWidth - root.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    overflowing,
    transition: getComputedStyle(root).transitionDuration,
  };
}

/** Visible box of a node, or null when it has no layout box; runs in the page. */
function boxOf(selector) {
  const node = document.querySelector(selector);
  if (!node || node.getClientRects().length === 0) return null;
  const { left, top, width, height } = node.getBoundingClientRect();
  return { left, top, width, height };
}

/** WCAG contrast of a node's text or icon color against a background; runs in the page, where canvas resolves any CSS color. */
function contrastOf({ selector, background }) {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const luminance = (css) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [high, low] = [luminance(getComputedStyle(document.querySelector(selector)).color), luminance(getComputedStyle(document.querySelector(background)).backgroundColor)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

/** Samples Root's width on every frame while `act` runs; runs in the page. */
async function sampleWidths(selector) {
  const root = document.querySelector('aside');
  const widths = [];
  let running = true;
  const frame = () => { widths.push(root.getBoundingClientRect().width); if (running) requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  document.querySelector(selector).click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  running = false;
  return widths;
}

for (const engine of browserEngines()) {
  test(`Sidebar folds to an icon rail in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar.html': page },
      modules: { '/sidebar-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar.html`, 'aside');
      const open = async (query = '', options = {}) => {
        const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US', ...options });
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await tab.goto(`${url}/sidebar.html${query}`, { waitUntil: 'networkidle' });
        await tab.locator('aside').waitFor({ timeout: 15_000 });
        return { tab, context, errors };
      };
      const read = (tab) => tab.evaluate(readSidebar);
      const settled = (tab, collapsed, message) => pollUntil(tab, ({ collapsed }) => {
        const root = document.querySelector('aside');
        const probe = document.createElement('div');
        probe.style.inlineSize = 'var(--muxui-component-sidebar-rail-size)';
        root.append(probe);
        const rail = probe.getBoundingClientRect().width + parseFloat(getComputedStyle(root).borderRightWidth);
        probe.remove();
        const width = root.getBoundingClientRect().width;
        return root.hasAttribute('data-collapsed') === collapsed && (collapsed ? Math.abs(width - rail) < 0.5 : width > 200);
      }, { collapsed }, { message, report: () => document.querySelector('aside').getBoundingClientRect().width });
      // A key press makes RAC treat the next focus as keyboard focus, which is what shows tooltips.
      const focusByKeyboard = async (tab, selector) => { await tab.keyboard.press('Escape'); await tab.locator(selector).focus(); };

      for (const scheme of ['light', 'dark']) {
        const label = (message) => `${engine} ${scheme}: ${message}`;
        const { tab, context, errors } = await open(`?scheme=${scheme}`);
        try {
          // Toggle folds and unfolds Root and keeps one stable accessible name.
          let state = await read(tab);
          assert.ok(!state.collapsed && state.width > 200, label(`Root starts expanded (${state.width}px)`));
          assert.equal(state.expanded, 'true', label('Toggle reports an expanded sidebar'));
          assert.ok(state.id !== '' && state.controls === state.id, label(`Toggle controls Root (${state.controls} against ${state.id})`));
          assert.equal(await tab.getByRole('button', { name: 'Toggle sidebar' }).count(), 1, label('Toggle is named by "Toggle sidebar"'));
          assert.equal(await tab.getByRole('list', { name: 'Projects' }).count(), 1, label('Section is labelled by its visible text'));
          assert.ok(state.rootOverflow <= 0 && state.pageOverflow <= 0 && state.overflowing.length === 0, label(`no horizontal overflow when expanded (${JSON.stringify(state)})`));
          assert.equal(await tab.evaluate(boxOf, '.muxui-sidebar__nav-mark'), null, label('an expanded sidebar shows no stand-in mark'));
          const labelContrast = await tab.evaluate(contrastOf, { selector: '.muxui-sidebar__section-label', background: 'aside' });
          assert.ok(labelContrast >= 4.5, label(`the section label meets text contrast (${labelContrast.toFixed(2)}:1)`));

          await tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await settled(tab, true, label('Toggle folds Root to the rail'));
          state = await read(tab);
          assert.equal(state.expanded, 'false', label('Toggle reports a folded sidebar'));
          assert.equal(state.toggleName, 'Toggle sidebar', label('the Toggle name does not change when folded'));
          assert.ok(state.rootOverflow <= 0 && state.pageOverflow <= 0 && state.overflowing.length === 0, label(`no horizontal overflow when folded (${JSON.stringify(state)})`));
          const icon = await tab.evaluate(boxOf, 'a[href="#home"] .muxui-sidebar__nav-icon');
          const rootBox = await tab.evaluate(boxOf, 'aside');
          assert.ok(Math.abs(icon.left + icon.width / 2 - (rootBox.left + (state.railWidth - 1) / 2)) <= 1, label(`the icon column is centred in the rail (${icon.left + icon.width / 2} in ${state.railWidth}px)`));
          const iconContrast = await tab.evaluate(contrastOf, { selector: 'a[href="#home"] .muxui-sidebar__nav-icon', background: 'aside' });
          assert.ok(iconContrast >= 3, label(`the folded icon meets non-text contrast (${iconContrast.toFixed(2)}:1)`));

          // Folded NavItems keep their names, Section its label, and the other parts fold away.
          assert.equal(await tab.getByRole('link', { name: 'Inbox 3' }).count(), 1, label('a folded NavItem keeps its label and badge in its accessible name'));
          assert.equal(await tab.getByRole('list', { name: 'Projects' }).count(), 1, label('a folded Section keeps its accessible label'));
          // An item without an icon stays visible and named: its first letter stands in for the icon.
          const mark = await tab.evaluate(boxOf, 'a[href="#docs"] .muxui-sidebar__nav-mark');
          assert.ok(mark !== null && Math.abs(mark.width - icon.width) < 0.5 && Math.abs(mark.left - icon.left) < 0.5, label('the icon-less item shows a mark in the icon column'));
          assert.equal(await tab.locator('a[href="#docs"] .muxui-sidebar__nav-mark').textContent(), 'D', label('the mark is the first letter of the label'));
          assert.equal(await tab.getByRole('link', { name: 'Docs', exact: true }).count(), 1, label('the mark is decorative: the item is still named by its label'));
          const markContrast = await tab.evaluate(contrastOf, { selector: 'a[href="#docs"] .muxui-sidebar__nav-mark', background: 'aside' });
          assert.ok(markContrast >= 3, label(`the mark meets non-text contrast (${markContrast.toFixed(2)}:1)`));
          const hidden = await tab.evaluate(boxOf, 'a[href="#home"] .muxui-sidebar__nav-label');
          assert.ok(hidden.width <= 1 && hidden.height <= 1, label('the NavItem label is visually hidden'));
          assert.ok(await tab.evaluate(boxOf, '.muxui-sidebar__section-label').then((box) => box.width <= 1), label('the Section label is visually hidden'));
          const divider = await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__section'), '::before').borderBlockStartWidth);
          assert.equal(divider, '1px', label('a divider stands in for the Section label'));
          assert.equal(await tab.getByRole('button', { name: 'Account options' }).count(), 0, label('the account options button leaves the tab order and the accessibility tree'));
          assert.equal(await tab.getByRole('button', { name: 'Dismiss' }).count(), 0, label('the FeatureCard is hidden'));
          const avatar = await tab.evaluate(boxOf, '.muxui-sidebar__account-avatar');
          assert.ok(avatar.width > 0 && avatar.left + avatar.width <= rootBox.left + state.railWidth, label('the account avatar stays inside the rail'));
          const tile = await tab.evaluate(boxOf, '.tile');
          assert.ok(tile.left >= rootBox.left && tile.left + tile.width <= rootBox.left + state.railWidth, label('the Header leading element stays inside the rail'));

          await tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await settled(tab, false, label('Toggle unfolds Root'));
          state = await read(tab);
          assert.equal(state.expanded, 'true', label('Toggle reports an expanded sidebar again'));
          assert.deepEqual(errors, [], label('the page logged no errors'));
        } finally {
          await context.close();
        }
      }

      // Uncontrolled and controlled state report changes; a controlled prop wins.
      {
        const { tab, context } = await open('?folded=1');
        try {
          assert.ok((await read(tab)).collapsed, `${engine}: defaultCollapsed starts folded`);
          await tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await settled(tab, false, `${engine}: uncontrolled Toggle unfolds`);
          assert.deepEqual(await tab.evaluate(() => window.__changes), [false], `${engine}: onCollapsedChange reports the uncontrolled change`);
        } finally {
          await context.close();
        }
        const controlled = await open('?mode=controlled');
        try {
          await controlled.tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await settled(controlled.tab, true, `${engine}: a controlled Toggle follows the prop`);
          await controlled.tab.locator('#external').click();
          await settled(controlled.tab, false, `${engine}: a controlled prop change unfolds Root`);
          assert.deepEqual(await controlled.tab.evaluate(() => window.__changes), [true], `${engine}: onCollapsedChange fires for the Toggle but not for the prop change`);
        } finally {
          await controlled.context.close();
        }
        const rejected = await open('?mode=controlled&reject=1');
        try {
          await rejected.tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await rejected.tab.waitForTimeout(400);
          assert.deepEqual(await rejected.tab.evaluate(() => window.__changes), [true], `${engine}: the request reaches onCollapsedChange`);
          const state = await read(rejected.tab);
          assert.ok(!state.collapsed && state.expanded === 'true', `${engine}: a controlled Root stays expanded until the prop changes`);
        } finally {
          await rejected.context.close();
        }
      }

      // The shortcut folds with the platform chord, is ignored while typing, and is removed with the Provider.
      {
        const { tab, context } = await open();
        try {
          const apple = await tab.evaluate(() => /mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform));
          const [chord, other] = apple ? ['Meta+b', 'Control+b'] : ['Control+b', 'Meta+b'];
          await tab.evaluate(() => { window.__prevented = []; window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'b') window.__prevented.push(event.defaultPrevented); }); });
          await tab.keyboard.press(other);
          await tab.waitForTimeout(150);
          assert.ok(!(await read(tab)).collapsed, `${engine}: ${other} does not fold the sidebar`);
          await tab.keyboard.press(chord);
          await settled(tab, true, `${engine}: ${chord} folds the sidebar`);
          assert.ok(await tab.evaluate(() => window.__prevented.at(-1)), `${engine}: the shortcut prevents the browser default`);
          for (const target of ['#field', '#editor']) {
            await tab.locator(target).focus();
            await tab.keyboard.press(chord);
            await tab.waitForTimeout(150);
            assert.ok((await read(tab)).collapsed, `${engine}: ${chord} in ${target} leaves the sidebar alone`);
            assert.ok(!(await tab.evaluate(() => window.__prevented.at(-1))), `${engine}: ${chord} in ${target} keeps its default`);
          }
          await tab.locator('body').click({ position: { x: 800, y: 600 } });
          await tab.keyboard.press(chord);
          await settled(tab, false, `${engine}: ${chord} unfolds the sidebar`);
          await tab.locator('#unmount').click();
          await tab.evaluate(() => { window.__prevented = []; });
          await tab.keyboard.press(chord);
          assert.deepEqual(await tab.evaluate(() => window.__prevented), [false], `${engine}: the shortcut listener is removed with the Provider`);
        } finally {
          await context.close();
        }
        const plain = await open('?shortcut=none');
        try {
          await plain.tab.keyboard.press((await plain.tab.evaluate(() => /mac/iu.test(navigator.platform))) ? 'Meta+b' : 'Control+b');
          await plain.tab.waitForTimeout(150);
          assert.ok(!(await read(plain.tab)).collapsed, `${engine}: without a shortcut prop the chord does nothing`);
        } finally {
          await plain.context.close();
        }
      }

      // Folded parts: tooltips on keyboard focus only while folded, groups, and Search.
      {
        const { tab, context, errors } = await open('?folded=1');
        try {
          await focusByKeyboard(tab, 'a[href="#inbox"]');
          await tab.getByRole('tooltip').waitFor({ timeout: 5000 });
          assert.equal((await tab.getByRole('tooltip').textContent()).trim(), 'Inbox', `${engine}: the folded tooltip shows the label alone`);
          await tab.keyboard.press('Escape');
          await tab.getByRole('tooltip').waitFor({ state: 'detached', timeout: 5000 });
          await focusByKeyboard(tab, 'a[href="#docs"]');
          await tab.getByRole('tooltip').waitFor({ timeout: 5000 });
          assert.equal((await tab.getByRole('tooltip').textContent()).trim(), 'Docs', `${engine}: an icon-less folded item shows its tooltip on keyboard focus`);
          await tab.keyboard.press('Escape');
          await tab.getByRole('tooltip').waitFor({ state: 'detached', timeout: 5000 });

          await tab.locator('#before').focus();
          await tab.locator('.muxui-sidebar__toggle').focus();
          await tab.keyboard.press('Enter');
          await settled(tab, false, `${engine}: Enter on Toggle unfolds the sidebar`);
          await focusByKeyboard(tab, 'a[href="#inbox"]');
          await tab.waitForTimeout(700);
          assert.equal(await tab.getByRole('tooltip').count(), 0, `${engine}: an expanded sidebar shows no tooltip`);

          // Activating a folded group unfolds the sidebar and opens it.
          await tab.locator('.muxui-sidebar__toggle').click();
          await settled(tab, true, `${engine}: the sidebar folds again`);
          assert.equal(await tab.evaluate(boxOf, '.muxui-sidebar__nav-children'), null, `${engine}: a folded group hides its children`);
          assert.equal(await tab.evaluate(boxOf, '.muxui-sidebar__nav-chevron'), null, `${engine}: a folded group hides its chevron`);
          await tab.locator('summary').click();
          await settled(tab, false, `${engine}: activating a folded group unfolds the sidebar`);
          assert.ok(await tab.evaluate(() => document.querySelector('details').open), `${engine}: and opens that group`);
          assert.ok((await tab.evaluate(boxOf, 'a[href="#now"]')).width > 0, `${engine}: the group's links are visible`);
          await tab.locator('.muxui-sidebar__toggle').click();
          await settled(tab, true, `${engine}: the sidebar folds with the group open`);
          assert.equal(await tab.evaluate(boxOf, 'a[href="#now"]'), null, `${engine}: an open group stays hidden while folded`);
          await focusByKeyboard(tab, 'summary');
          await tab.keyboard.press('Enter');
          await settled(tab, false, `${engine}: Enter on a folded group unfolds the sidebar`);
          assert.ok(await tab.evaluate(() => document.querySelector('details').open), `${engine}: and keeps the group open`);

          // Folded Search is an icon button that unfolds and focuses the input.
          await tab.locator('.muxui-sidebar__toggle').click();
          await settled(tab, true, `${engine}: the sidebar folds again for Search`);
          assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__search-input')).visibility), 'hidden', `${engine}: the folded search input is hidden`);
          await tab.getByRole('button', { name: 'Search' }).click();
          await settled(tab, false, `${engine}: folded Search unfolds the sidebar`);
          assert.ok(await tab.evaluate(() => document.activeElement === document.querySelector('.muxui-sidebar__search-input')), `${engine}: and focuses the input`);
          assert.equal(await tab.getByRole('button', { name: 'Search' }).count(), 0, `${engine}: the search button leaves the accessibility tree when expanded`);
          assert.deepEqual(errors, [], `${engine}: the page logged no errors`);
        } finally {
          await context.close();
        }
      }

      // The width transition runs under full motion and is removed under reduced motion.
      for (const [name, query, options] of [
        ['full motion', '', { reducedMotion: 'no-preference' }],
        ['reduced motion (system)', '', { reducedMotion: 'reduce' }],
        ['reduced motion (scope)', '?motion=reduced', { reducedMotion: 'no-preference' }],
      ]) {
        const { tab, context } = await open(query, options);
        try {
          const widths = await tab.evaluate(sampleWidths, '.muxui-sidebar__toggle');
          const [expanded, rail] = [Math.max(...widths), Math.min(...widths)];
          const between = widths.filter((width) => width > rail + 2 && width < expanded - 2);
          const duration = (await read(tab)).transition;
          if (name === 'full motion') {
            assert.ok(between.length >= 2, `${engine} ${name}: Root animates between the widths (${between.length} intermediate frames)`);
            assert.notEqual(duration, '0s', `${engine} ${name}: Root declares a transition`);
          } else {
            assert.equal(between.length, 0, `${engine} ${name}: Root jumps without intermediate widths (${between})`);
            assert.equal(duration, '0s', `${engine} ${name}: the transition duration is removed`);
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
