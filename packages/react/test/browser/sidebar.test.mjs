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
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
const params = new URLSearchParams(location.search);
const Icon = ({ className }) => h('svg', { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, 'aria-hidden': true }, h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }));
window.__changes = [];
window.__vetoed = [];
// A control outside Sidebar that handles the fold chord itself, with and without stopping its propagation.
const veto = (id, stop) => h('button', { type: 'button', id, onKeyDown: (event) => {
  if (event.key.toLowerCase() !== 'b' || !(event.metaKey || event.ctrlKey)) return;
  window.__vetoed.push(event.nativeEvent.defaultPrevented);
  event.preventDefault();
  if (stop) event.stopPropagation();
} }, id);

function Shell() {
  const [mounted, setMounted] = React.useState(true);
  const [folded, setFolded] = React.useState(params.get('folded') === '1');
  const controlled = params.get('mode') === 'controlled';
  const [shortcut, setShortcut] = React.useState('b');
  window.__setShortcut = setShortcut;
  const provider = {
    shortcut: params.get('shortcut') === 'none' ? undefined : shortcut,
    ...(controlled
      ? {
        collapsed: folded,
        // A parent may apply the change late (delay) or never (reject).
        onCollapsedChange: (next) => {
          window.__changes.push(next);
          if (params.get('reject') === '1') return;
          const delay = Number(params.get('delay') ?? 0);
          if (delay > 0) setTimeout(() => setFolded(next), delay); else setFolded(next);
        },
      }
      : { defaultCollapsed: folded, onCollapsedChange: (next) => window.__changes.push(next) }),
  };
  window.__fold = setFolded;
  const shell = h('div', { className: 'shell' },
    h(Sidebar.Root, { 'aria-label': 'Workspace' },
      h(Sidebar.Header, null,
        h('button', { type: 'button', className: 'switcher' }, h('span', { className: 'tile', 'aria-hidden': true }, 'S'), 'Sample workspace'),
        h(Sidebar.Search)),
      h(Sidebar.NavList, { 'aria-label': 'Workspace' },
        h(Sidebar.NavItem, { href: '#home', icon: Icon }, 'Home'),
        h(Sidebar.NavItem, { href: '#inbox', icon: Icon, badge: '3' }, 'Inbox'),
        h(Sidebar.NavItem, { href: '#docs' }, 'Docs'),
        h(Sidebar.NavItem, { href: '#wiki' }, h('span', null, 'Wiki')),
        h(Sidebar.NavItem, { href: '#raw' }, h('svg', { role: 'img', 'aria-label': 'Raw', width: 1, height: 1 })),
        h(Sidebar.Section, { label: 'Projects' },
          h(Sidebar.NavItem, { href: '#overview', icon: Icon, badge: '12', current: true }, 'Overview'),
          h(Sidebar.NavItem, { icon: Icon, items: [{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }] }, 'Roadmap'))),
      h(Sidebar.FeatureCard, { title: 'Try Scale', description: 'Explore tokens', onDismiss: () => {} }),
      h(Sidebar.AccountCard, { name: 'Sample user', email: 'sample@example.com' })),
    h('main', { className: 'main' },
      params.get('toggle') !== 'none' && h(Sidebar.Toggle, { size: 'sm', disabled: params.get('toggle') === 'disabled' }),
      veto('veto', true),
      veto('veto-soft', false),
      h('input', { id: 'field', 'aria-label': 'Notes' }),
      h('div', { id: 'editor', contentEditable: true, role: 'textbox', 'aria-label': 'Editor', suppressContentEditableWarning: true }, 'Draft'),
      h('button', { type: 'button', id: 'external', onClick: () => setFolded((value) => !value) }, 'Set folded'),
      h('button', { type: 'button', id: 'unmount', onClick: () => setMounted(false) }, 'Unmount')));
  // A second Provider with the same shortcut, mounted after the first.
  const second = params.get('providers') === '2' && h(Sidebar.Provider, { shortcut: 'b' },
    h(Sidebar.Root, { 'aria-label': 'Second' }, h(Sidebar.NavList, { 'aria-label': 'Second links' }, h(Sidebar.NavItem, { href: '#second', icon: Icon }, 'Second'))),
    h(Sidebar.Toggle, { 'aria-label': 'Toggle second' }));
  return h(React.Fragment, null, h('button', { id: 'before', tabIndex: 0 }, 'Before'), mounted ? h(Sidebar.Provider, provider, shell) : null, second);
}
// A column and a drawer that consumer CSS swaps by container width, as a responsive shell does.
const pages = () => h(Sidebar.NavList, { 'aria-label': 'Pages' },
  h(Sidebar.NavItem, { href: '#home', icon: Icon }, 'Home'),
  h(Sidebar.NavItem, { href: '#overview', icon: Icon, current: true }, 'Overview'));
// The workspace switcher: a Menu inside the drawer, whose popover is a second overlay to close with it.
const switcher = h(Menu.Root, null, h(Menu.Trigger, null, 'Workspaces'), h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Workspace list', items: ['Sample workspace', 'Example team'] })));
function Responsive() {
  return h(Sidebar.Provider, null,
    h('div', { className: 'rwd-frame' }, h('div', { className: 'rwd' },
      h('div', { className: 'rwd-mobile' }, h(Sidebar.MobileTrigger, { logo: 'Mux' }, h(React.Fragment, null, switcher, pages()))),
      h(Sidebar.Root, { className: 'rwd-column', 'aria-label': 'Workspace' },
        params.has('autofocus') && h('input', { id: 'root-input', 'aria-label': 'Filter', autoFocus: true }),
        pages()))),
    h('button', { type: 'button', id: 'outside' }, 'Outside'));
}
createRoot(document.getElementById('root')).render(h(params.get('layout') === 'rwd' ? Responsive : Shell));
// An editable control inside a shadow root: the document only sees its host.
const host = document.createElement('div');
host.id = 'shadow-host';
document.body.append(host);
host.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Shadow notes">';
`;

const css = `
.shell { display: flex; block-size: 40rem; overflow: hidden; border: 1px solid var(--muxui-semantic-border-default); }
.main { display: flex; flex-direction: column; align-items: flex-start; flex: 1; min-inline-size: 0; gap: 8px; padding: 12px; }
.switcher { display: flex; align-items: center; gap: 8px; inline-size: 100%; padding: 4px; border: 0; background: transparent; color: inherit; }
.tile { display: grid; place-items: center; flex: none; inline-size: 2rem; block-size: 2rem; border-radius: 6px; background: var(--muxui-semantic-surface-track); }
.muxui-sidebar .muxui-sidebar__account-card { margin-block-start: auto; }
.rwd-frame { container-type: inline-size; }
.rwd { display: flex; block-size: 24rem; }
.rwd-column { display: none; }
@container (min-width: 40rem) { .rwd-mobile { display: none; } .rwd-column { display: flex; } }
@keyframes rwd-slow-exit { from { opacity: 1; } to { opacity: 0; } }
html[data-slow-exit] .muxui-sidebar__mobile-overlay[data-exiting] { animation: rwd-slow-exit 600ms linear forwards; }
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}"${url.searchParams.get('motion') === 'reduced' ? ' data-muxui-motion="reduced"' : ''}${url.searchParams.has('slowexit') ? ' data-slow-exit' : ''}`,
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

/** WCAG contrast of a node's text or icon color against the background painted behind it; runs in the page, where canvas resolves any CSS color. */
function contrastOf({ selector, color, behind = selector }) {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const pixel = (...layers) => {
    context.clearRect(0, 0, 1, 1);
    for (const css of layers) {
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
    }
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = ([r, g, b]) => {
    const [red, green, blue] = [r, g, b].map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const element = document.querySelector(selector);
  // Stack the backgrounds behind the node (or the `behind` node), nearest on top, down to the first opaque one: a hovered link tints what is under it.
  const layers = [];
  for (let node = document.querySelector(behind); node; node = node.parentElement) {
    const paint = getComputedStyle(node).backgroundColor;
    const alpha = pixel(paint)[3];
    if (alpha > 0) layers.unshift(paint);
    if (alpha === 255) break;
  }
  const [high, low] = [luminance(pixel(color ?? getComputedStyle(element).color)), luminance(pixel(...layers))].sort((x, y) => y - x);
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
      entries: ['src/supplemental/index.mjs', 'src/collections.mjs'],
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
        await tab.locator(query.includes('layout=rwd') ? '.rwd' : 'aside').first().waitFor({ timeout: 15_000 });
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
      const chordOf = async (tab) => ((await tab.evaluate(() => /mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform))) ? 'Meta+b' : 'Control+b');
      const hasFocus = (tab, selector) => tab.evaluate((selector) => document.activeElement === document.querySelector(selector), selector);

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
          const labelContrast = await tab.evaluate(contrastOf, { selector: '.muxui-sidebar__section-label' });
          assert.ok(labelContrast >= 4.5, label(`the section label meets text contrast (${labelContrast.toFixed(2)}:1)`));
          // Badge text meets 4.5:1 on every background it sits on: idle, hovered, and the current item, hovered or not.
          const badges = ['a[href="#inbox"] .muxui-sidebar__nav-badge', 'a[href="#overview"] .muxui-sidebar__nav-badge'];
          for (const hovered of [null, 'a[href="#inbox"]', 'a[href="#overview"]']) {
            if (hovered) {
              await tab.locator(hovered).hover();
              await tab.waitForTimeout(300);
            }
            const ratios = await Promise.all(badges.map((selector) => tab.evaluate(contrastOf, { selector })));
            assert.ok(ratios.every((ratio) => ratio >= 4.5), label(`badge text meets text contrast, ${hovered ? `hovering ${hovered}` : 'idle'} (${ratios.map((ratio) => ratio.toFixed(2))})`));
          }
          await tab.mouse.move(0, 0);
          // Search shows a focus ring in both schemes: a 2px shadow that stands out from the sidebar by 3:1.
          await focusByKeyboard(tab, '.muxui-sidebar__search-input');
          const shadow = await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__search-input')).boxShadow);
          const ringColor = shadow.replace(/-?\d+(\.\d+)?px/gu, '').replace('inset', '').trim();
          const ringContrast = await tab.evaluate(contrastOf, { selector: '.muxui-sidebar__search-input', color: ringColor, behind: '.muxui-sidebar__header' });
          assert.ok(/0px 0px 0px 2px/u.test(shadow) && !shadow.includes('inset') && ringContrast >= 3, label(`the focused Search field draws a visible ring (${shadow}, ${ringContrast.toFixed(2)}:1)`));
          await tab.locator('#before').focus();

          await tab.getByRole('button', { name: 'Toggle sidebar' }).click();
          await settled(tab, true, label('Toggle folds Root to the rail'));
          state = await read(tab);
          assert.equal(state.expanded, 'false', label('Toggle reports a folded sidebar'));
          assert.equal(state.toggleName, 'Toggle sidebar', label('the Toggle name does not change when folded'));
          assert.ok(state.rootOverflow <= 0 && state.pageOverflow <= 0 && state.overflowing.length === 0, label(`no horizontal overflow when folded (${JSON.stringify(state)})`));
          const icon = await tab.evaluate(boxOf, 'a[href="#home"] .muxui-sidebar__nav-icon');
          const rootBox = await tab.evaluate(boxOf, 'aside');
          assert.ok(Math.abs(icon.left + icon.width / 2 - (rootBox.left + (state.railWidth - 1) / 2)) <= 1, label(`the icon column is centred in the rail (${icon.left + icon.width / 2} in ${state.railWidth}px)`));
          // Every folded stand-in for a name meets non-text contrast against what is painted behind it: idle, hovered (the current item and Search too), keyboard-focused, and current.
          const railContrasts = (selectors) => Promise.all(selectors.map((selector) => tab.evaluate(contrastOf, { selector })));
          const essentials = ['.muxui-sidebar__search-icon', 'a[href="#home"] .muxui-sidebar__nav-icon', 'a[href="#overview"] .muxui-sidebar__nav-icon', 'a[href="#docs"] .muxui-sidebar__nav-mark', 'summary .muxui-sidebar__nav-icon'];
          const meets = async (state) => assert.ok((await railContrasts(essentials)).every((ratio) => ratio >= 3), label(`${state}: every folded icon and mark meets non-text contrast`));
          await meets('idle');
          for (const item of ['a[href="#home"]', 'a[href="#docs"]', 'a[href="#overview"]', 'summary', '.muxui-sidebar__search-button']) {
            await tab.locator(item).hover();
            await tab.waitForTimeout(300);
            await meets(`hovering ${item}`);
          }
          await tab.mouse.move(0, 0);
          await focusByKeyboard(tab, 'a[href="#home"]');
          await tab.waitForTimeout(300);
          await meets('keyboard focus on a nav item');
          await tab.locator('#before').focus();

          // Folded NavItems keep their names, Section its label, and the other parts fold away.
          assert.equal(await tab.getByRole('link', { name: 'Inbox 3' }).count(), 1, label('a folded NavItem keeps its label and badge in its accessible name'));
          assert.equal(await tab.getByRole('list', { name: 'Projects' }).count(), 1, label('a folded Section keeps its accessible label'));
          // An item without an icon stays visible and named: its first letter stands in for the icon.
          const mark = await tab.evaluate(boxOf, 'a[href="#docs"] .muxui-sidebar__nav-mark');
          assert.ok(mark !== null && Math.abs(mark.width - icon.width) < 0.5 && Math.abs(mark.left - icon.left) < 0.5, label('the icon-less item shows a mark in the icon column'));
          assert.equal(await tab.locator('a[href="#docs"] .muxui-sidebar__nav-mark').textContent(), 'D', label('the mark is the first letter of the label'));
          assert.equal(await tab.getByRole('link', { name: 'Docs', exact: true }).count(), 1, label('the mark is decorative: the item is still named by its label'));
          // The mark reads through elements, and a label with no text gets a dot rather than a blank target.
          assert.equal(await tab.locator('a[href="#wiki"] .muxui-sidebar__nav-mark').textContent(), 'W', label('the mark reads the text inside an element label'));
          assert.equal(await tab.locator('a[href="#raw"] .muxui-sidebar__nav-mark').textContent(), '\u2022', label('a label with no text gets a dot'));
          assert.equal(await tab.getByRole('link', { name: 'Raw', exact: true }).count(), 1, label('the dotted item keeps its name'));
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

      // Folding moves focus out of content it hides: to the group of a hidden child, the folded Search button for the Search input, else to Toggle, else to Root.
      {
        const { tab, context } = await open();
        try {
          const chord = await chordOf(tab);
          await tab.locator('summary').click();
          await focusByKeyboard(tab, 'a[href="#now"]');
          await tab.keyboard.press(chord);
          await settled(tab, true, `${engine}: the shortcut folds with focus on a group child`);
          assert.ok(await hasFocus(tab, 'summary'), `${engine}: focus moves from a hidden group child to its group`);
          await tab.keyboard.press(chord);
          await settled(tab, false, `${engine}: the shortcut unfolds from the group`);
          await focusByKeyboard(tab, '.muxui-sidebar__feature-card-dismiss');
          await tab.keyboard.press(chord);
          await settled(tab, true, `${engine}: the shortcut folds with focus on the FeatureCard`);
          assert.ok(await hasFocus(tab, '.muxui-sidebar__toggle'), `${engine}: focus moves from hidden FeatureCard controls to Toggle`);
          await tab.keyboard.press(chord);
          await settled(tab, false, `${engine}: the shortcut unfolds again`);
          await focusByKeyboard(tab, '.muxui-sidebar__account-trigger');
          await tab.locator('.muxui-sidebar__toggle').evaluate((toggle) => toggle.click());
          await settled(tab, true, `${engine}: Toggle folds with focus on the account button`);
          assert.ok(await hasFocus(tab, '.muxui-sidebar__toggle'), `${engine}: focus moves from the hidden account button to Toggle`);
          await tab.locator('.muxui-sidebar__toggle').evaluate((toggle) => toggle.click());
          await settled(tab, false, `${engine}: Toggle unfolds before the Search case`);
          await focusByKeyboard(tab, '.muxui-sidebar__search-input');
          await tab.locator('.muxui-sidebar__toggle').evaluate((toggle) => toggle.click());
          await settled(tab, true, `${engine}: Toggle folds with focus in the Search input`);
          assert.ok(await hasFocus(tab, '.muxui-sidebar__search-button'), `${engine}: focus moves from the hidden Search input to the folded Search button`);
        } finally {
          await context.close();
        }
        const controlled = await open('?mode=controlled');
        try {
          await controlled.tab.locator('summary').click();
          await focusByKeyboard(controlled.tab, 'a[href="#now"]');
          await controlled.tab.evaluate(() => window.__fold(true));
          await settled(controlled.tab, true, `${engine}: a controlled prop folds the sidebar`);
          assert.ok(await hasFocus(controlled.tab, 'summary'), `${engine}: a controlled fold also moves focus to the group`);
        } finally {
          await controlled.context.close();
        }
        const stuck = await open('?toggle=disabled');
        try {
          await focusByKeyboard(stuck.tab, '.muxui-sidebar__feature-card-dismiss');
          await stuck.tab.keyboard.press(await chordOf(stuck.tab));
          await settled(stuck.tab, true, `${engine}: the shortcut folds a sidebar whose Toggle is disabled`);
          assert.ok(await hasFocus(stuck.tab, 'aside') && (await stuck.tab.locator('aside').getAttribute('tabindex')) === '-1', `${engine}: a disabled Toggle cannot take focus, so focus falls through to Root`);
        } finally {
          await stuck.context.close();
        }
        const bare = await open('?toggle=none');
        try {
          await focusByKeyboard(bare.tab, '.muxui-sidebar__feature-card-dismiss');
          await bare.tab.keyboard.press(await chordOf(bare.tab));
          await settled(bare.tab, true, `${engine}: the shortcut folds a sidebar with no Toggle`);
          assert.ok(await hasFocus(bare.tab, 'aside') && (await bare.tab.locator('aside').getAttribute('tabindex')) === '-1', `${engine}: without a Toggle, focus falls back to Root, which becomes programmatically focusable`);
        } finally {
          await bare.context.close();
        }
      }

      // Folded Search focuses its input once Root is really expanded, even when a controlling parent answers late.
      {
        const delayed = await open('?mode=controlled&delay=100&folded=1');
        try {
          await delayed.tab.getByRole('button', { name: 'Search' }).click();
          await settled(delayed.tab, false, `${engine}: a late controlled parent unfolds the sidebar`);
          assert.ok(await hasFocus(delayed.tab, '.muxui-sidebar__search-input'), `${engine}: the search input is focused once the late unfold lands`);
        } finally {
          await delayed.context.close();
        }
        const interrupted = await open('?mode=controlled&delay=300&folded=1');
        try {
          await interrupted.tab.getByRole('button', { name: 'Search' }).click();
          await interrupted.tab.locator('.muxui-sidebar__toggle').click();
          await settled(interrupted.tab, false, `${engine}: both requests unfold the sidebar`);
          assert.ok(!(await hasFocus(interrupted.tab, '.muxui-sidebar__search-input')), `${engine}: another fold request cancels the pending Search focus`);
        } finally {
          await interrupted.context.close();
        }
        const rejected = await open('?mode=controlled&reject=1&folded=1');
        try {
          await rejected.tab.getByRole('button', { name: 'Search' }).click();
          await rejected.tab.waitForTimeout(1200);
          await rejected.tab.locator('#external').click();
          await settled(rejected.tab, false, `${engine}: the parent unfolds later by itself`);
          assert.ok(!(await hasFocus(rejected.tab, '.muxui-sidebar__search-input')), `${engine}: a lapsed Search request does not steal focus`);
        } finally {
          await rejected.context.close();
        }
      }

      // The chord folds from a NavItem, whose Tooltip trigger stops keydown, but yields to a control outside Sidebar that handles it.
      {
        const { tab, context } = await open();
        try {
          const chord = await chordOf(tab);
          await focusByKeyboard(tab, 'a[href="#home"]');
          await tab.keyboard.press(chord);
          await settled(tab, true, `${engine}: the shortcut folds with focus on a NavItem`);
          await tab.keyboard.press(chord);
          await settled(tab, false, `${engine}: and unfolds again`);
          for (const id of ['#veto', '#veto-soft']) {
            await focusByKeyboard(tab, id);
            await tab.keyboard.press(chord);
            await tab.waitForTimeout(200);
            assert.ok(!(await read(tab)).collapsed, `${engine}: ${id} keeps the chord it handled`);
          }
          assert.deepEqual(await tab.evaluate(() => window.__vetoed), [false, false], `${engine}: the outside handlers saw an uncancelled chord`);
        } finally {
          await context.close();
        }
      }

      // Several Providers share one shortcut: the one holding focus handles the chord, else the latest; and the check
      // sees through shadow roots and ignores IME composition.
      {
        const { tab, context } = await open('?providers=2');
        try {
          const chord = await chordOf(tab);
          const folds = () => tab.evaluate(() => [...document.querySelectorAll('aside')].map((aside) => aside.hasAttribute('data-collapsed')));
          await tab.evaluate(() => { window.__prevented = []; window.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'b') window.__prevented.push(event.defaultPrevented); }); });
          // Changing the first Provider's shortcut away and back must not move it ahead of the later one.
          for (const key of ['c', 'b']) {
            await tab.evaluate((key) => window.__setShortcut(key), key);
            await tab.waitForTimeout(100);
          }
          await tab.keyboard.press(chord);
          await pollUntil(tab, () => document.querySelectorAll('aside')[1].hasAttribute('data-collapsed'), undefined, { message: `${engine}: the latest Provider handles a chord from outside both`, report: () => [...document.querySelectorAll('aside')].map((aside) => aside.hasAttribute('data-collapsed')) });
          assert.deepEqual(await folds(), [false, true], `${engine}: only the latest Provider folded`);
          assert.deepEqual(await tab.evaluate(() => window.__prevented), [true], `${engine}: one handler prevented the default`);
          await focusByKeyboard(tab, 'a[href="#home"]');
          await tab.keyboard.press(chord);
          await pollUntil(tab, () => document.querySelectorAll('aside')[0].hasAttribute('data-collapsed'), undefined, { message: `${engine}: the Provider holding focus handles the chord` });
          assert.deepEqual(await folds(), [true, true], `${engine}: the first Provider folded and the second kept its state`);

          await tab.locator('#shadow-host input').focus();
          await tab.keyboard.press(chord);
          await tab.waitForTimeout(150);
          assert.deepEqual(await folds(), [true, true], `${engine}: typing in a shadow-root input leaves both sidebars alone`);
          assert.equal((await tab.evaluate(() => window.__prevented)).at(-1), false, `${engine}: and keeps the chord's default`);
          const apple = chord.startsWith('Meta');
          const composing = await tab.evaluate((apple) => [{ isComposing: true }, { keyCode: 229 }].map((init) => {
            const event = new KeyboardEvent('keydown', { key: 'b', metaKey: apple, ctrlKey: !apple, bubbles: true, cancelable: true, ...init });
            document.body.dispatchEvent(event);
            return event.defaultPrevented;
          }), apple);
          assert.deepEqual(composing, [false, false], `${engine}: IME composition keeps the chord`);
          assert.deepEqual(await folds(), [true, true], `${engine}: IME composition does not toggle`);
        } finally {
          await context.close();
        }
      }

      // Consumer CSS swaps the column and the drawer by width. An open drawer must not outlive its trigger, and focus
      // must follow whichever one stays rendered.
      {
        const narrow = { width: 500, height: 700 };
        const wide = { width: 900, height: 700 };
        const { tab, context } = await open('?layout=rwd', { viewport: narrow });
        try {
          const focusIs = (selector, message) => pollUntil(tab, (selector) => document.activeElement === document.querySelector(selector), selector, { message, report: () => document.activeElement?.outerHTML.slice(0, 120) });
          const drawer = tab.getByRole('dialog', { name: 'Navigation' });
          const openDrawer = async () => {
            await tab.getByRole('button', { name: 'Open navigation' }).click();
            await drawer.waitFor({ timeout: 5000 });
          };
          await openDrawer();
          await tab.locator('.muxui-sidebar__mobile-dialog a[href="#home"]').focus();
          await tab.setViewportSize(wide);
          await focusIs('aside a[href="#home"]', `${engine}: widening closes the drawer and focus lands on the matching column link`);
          assert.equal(await drawer.count(), 0, `${engine}: the drawer is closed once its trigger is gone`);

          await tab.setViewportSize(narrow);
          await openDrawer();
          await tab.locator('.muxui-sidebar__mobile-close-btn').focus();
          await tab.setViewportSize(wide);
          await focusIs('aside a[aria-current="page"]', `${engine}: with no matching link, focus lands on the current column link`);
          assert.equal(await drawer.count(), 0, `${engine}: the drawer closes again`);

          await tab.locator('aside a[href="#home"]').focus();
          await tab.setViewportSize(narrow);
          await focusIs('.muxui-sidebar__mobile-menu-btn', `${engine}: narrowing moves focus from the hidden column to the menu button`);
        } finally {
          await context.close();
        }

        // A Menu open inside the drawer is a second overlay; focus still reaches the column once both are gone.
        const menu = await open('?layout=rwd', { viewport: narrow });
        try {
          await menu.tab.getByRole('button', { name: 'Open navigation' }).click();
          await menu.tab.getByRole('button', { name: 'Workspaces' }).click();
          await menu.tab.getByRole('menuitem').first().focus();
          await menu.tab.setViewportSize(wide);
          await pollUntil(menu.tab, () => document.activeElement === document.querySelector('aside a[aria-current="page"]'), undefined, { message: `${engine}: with a Menu open in the drawer, focus still reaches the column`, timeout: 4000, report: () => document.activeElement?.outerHTML.slice(0, 120) });
          assert.equal(await menu.tab.getByRole('menu').count() + await menu.tab.getByRole('dialog').count(), 0, `${engine}: the Menu and the drawer are both closed`);
        } finally {
          await menu.context.close();
        }

        // Handoffs never overwrite a newer, deliberate focus.
        const deliberate = await open('?layout=rwd', { viewport: wide });
        try {
          await deliberate.tab.locator('aside a[href="#home"]').focus();
          await deliberate.tab.evaluate(() => {
            document.querySelector('.rwd-frame').style.width = '500px';
            document.querySelector('#outside').focus();
          });
          await deliberate.tab.waitForTimeout(500);
          assert.ok(await hasFocus(deliberate.tab, '#outside'), `${engine}: focus a user sends elsewhere as the column hides is not pulled to the menu button`);
        } finally {
          await deliberate.context.close();
        }
        const slow = await open('?layout=rwd&slowexit=1', { viewport: narrow });
        try {
          await slow.tab.getByRole('button', { name: 'Open navigation' }).click();
          await slow.tab.locator('.muxui-sidebar__mobile-dialog a[href="#home"]').focus();
          await slow.tab.setViewportSize(wide);
          // Only once the drawer is really exiting can the user focus elsewhere.
          await slow.tab.locator('.muxui-sidebar__mobile-overlay[data-exiting]').waitFor({ state: 'attached', timeout: 5000 });
          await slow.tab.locator('#outside').focus();
          await slow.tab.waitForTimeout(1000);
          assert.ok(await hasFocus(slow.tab, '#outside'), `${engine}: focus moved during the drawer's exit animation is not pulled back to the column`);
        } finally {
          await slow.context.close();
        }

        // Focus that arrived before the tracker subscribed still counts as inside the column.
        const early = await open('?layout=rwd&autofocus=1', { viewport: wide });
        try {
          assert.ok(await hasFocus(early.tab, '#root-input'), `${engine}: the column's autofocus input holds focus`);
          await early.tab.setViewportSize(narrow);
          await pollUntil(early.tab, () => document.activeElement === document.querySelector('.muxui-sidebar__mobile-menu-btn'), undefined, { message: `${engine}: focus that arrived by autofocus still moves to the menu button`, report: () => document.activeElement?.outerHTML.slice(0, 120) });
        } finally {
          await early.context.close();
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

// Cross-engine proof for Sidebar's nested navigation, in light and dark: details groups and
// link groups (a link beside a toggle button) open and close from the pointer and the keyboard,
// controlled groups follow their caller, the current page carries aria-current and the current
// style at every depth, category then block then variant nests two groups deep, the folded
// rail keeps only top-level links, and folding hands focus to the outermost group's header.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const nestedEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Sidebar } from '/src/supplemental/index.mjs';

const h = React.createElement;
const params = new URLSearchParams(location.search);
window.__changes = [];

function Shell() {
  const [open, setOpen] = React.useState({ catalog: params.get('open') === '1', button: params.get('open') === '1', details: false });
  // A caller that applies every change unless the page asks it to refuse them.
  const control = (id) => ({
    expanded: open[id],
    onExpandedChange: (next) => {
      window.__changes.push([id, next]);
      if (params.get('reject') !== '1') setOpen((previous) => ({ ...previous, [id]: next }));
    },
  });
  // A caller changing a group from outside React: flushSync commits it before this returns, so no test waits on React's scheduler.
  window.__setOpen = (id, next) => flushSync(() => setOpen((previous) => ({ ...previous, [id]: next })));
  return h(React.Fragment, null,
    h('button', { id: 'before', type: 'button' }, 'Before'),
    h(Sidebar.Provider, { defaultCollapsed: params.get('folded') === '1', shortcut: 'b' },
      h(Sidebar.Root, { 'aria-label': 'Workspace' },
        h(Sidebar.NavList, { 'aria-label': 'Workspace' },
          h(Sidebar.NavItem, { items: [{ href: '#now', label: 'Now' }, { href: '#next', label: 'Next' }] }, 'Roadmap'),
          h(Sidebar.NavItem, { defaultExpanded: true, items: [
            { href: '#intro', label: 'Intro' },
            { label: 'Deep', defaultExpanded: true, items: [{ href: '#deeper', label: 'Deeper' }] },
          ] }, 'Guides'),
          h(Sidebar.NavItem, { ...control('details'), items: [{ href: '#alpha', label: 'Alpha' }] }, 'Controlled'),
          h(Sidebar.NavItem, { href: '#overview' }, 'Overview'),
          h(Sidebar.NavItem, { href: '#catalog', ...control('catalog'), items: [
            { id: 'button', label: 'Button', href: '#button', ...control('button'), items: [
              { label: 'Primary', href: '#primary', current: true },
              { label: 'Secondary', href: '#secondary' },
            ] },
            { id: 'card', label: 'Card', href: '#card', items: [{ label: 'Default', href: '#default' }] },
          ] }, 'Catalog'),
          h(Sidebar.NavItem, { href: '#settings' }, 'Settings'))),
      h('main', null, h(Sidebar.Toggle, { size: 'sm' }))),
    h('button', { id: 'after', type: 'button' }, 'After'));
}
createRoot(document.getElementById('root')).render(h(Shell));
`;

const nestedPage = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}"`,
  head: '<link rel="stylesheet" href="/generated/styles.css"><style>.shell { display: flex; }</style>',
  bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/sidebar-nested-entry.mjs',
});

/** Box of a node, or null when it is not rendered: display:none, hidden, or inside a closed details; runs in the page. */
function nestedBoxOf(selector) {
  const node = document.querySelector(selector);
  if (!node || node.getClientRects().length === 0 || !node.checkVisibility()) return null;
  const { left, top, width, height } = node.getBoundingClientRect();
  return { left, top, width, height };
}

/** The focused control as role and name; runs in the page. */
function nestedFocusedControl() {
  const node = document.activeElement;
  const labelled = node.getAttribute('aria-labelledby');
  const name = node.querySelector?.('.muxui-sidebar__nav-label')?.textContent ?? node.getAttribute('aria-label') ?? (labelled && document.getElementById(labelled).textContent) ?? node.textContent.trim();
  return `${node.tagName === 'A' ? 'link' : node.tagName === 'SUMMARY' ? 'group' : 'button'} ${name}`;
}

/** Paint of a node and its ring; runs in the page. */
function nestedPaintOf(selector) {
  const styles = getComputedStyle(document.querySelector(selector));
  return { background: styles.backgroundColor, outlineStyle: styles.outlineStyle, outlineWidth: styles.outlineWidth };
}

for (const engine of browserEngines()) {
  test(`Sidebar nested navigation works in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-nested.html': nestedPage },
      modules: { '/sidebar-nested-entry.mjs': nestedEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-nested.html`, 'aside');
      const open = async (query = '') => {
        const context = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'en-US' });
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await tab.goto(`${url}/sidebar-nested.html${query}`, { waitUntil: 'networkidle' });
        await tab.locator('aside').waitFor({ timeout: 15_000 });
        return { tab, context, errors };
      };
      const visible = async (tab, selector) => (await tab.evaluate(nestedBoxOf, selector)) !== null;
      const expanded = (tab, name) => tab.getByRole('button', { name, exact: true }).getAttribute('aria-expanded');
      const tabbed = async (tab, count) => {
        const stops = [];
        for (let index = 0; index < count; index += 1) {
          await tab.keyboard.press('Tab');
          stops.push(await tab.evaluate(nestedFocusedControl));
        }
        return stops;
      };

      for (const scheme of ['light', 'dark']) {
        const label = (message) => `${engine} ${scheme}: ${message}`;
        const { tab, context, errors } = await open(`?scheme=${scheme}`);
        try {
          // Details groups: closed by default, open from defaultExpanded, and driven by pointer and keyboard.
          const roadmap = tab.locator('summary', { hasText: 'Roadmap' });
          assert.equal(await visible(tab, 'a[href="#now"]'), false, label('a details group starts closed'));
          assert.equal(await visible(tab, 'a[href="#deeper"]'), true, label('defaultExpanded opens a group, nested ones included'));
          await roadmap.click();
          assert.equal(await visible(tab, 'a[href="#now"]'), true, label('clicking the summary opens the group'));
          await roadmap.click();
          assert.equal(await visible(tab, 'a[href="#now"]'), false, label('clicking again closes it'));
          await roadmap.focus();
          await tab.keyboard.press('Enter');
          assert.equal(await visible(tab, 'a[href="#now"]'), true, label('Enter on the summary opens the group'));
          await tab.keyboard.press('Space');
          assert.equal(await visible(tab, 'a[href="#now"]'), false, label('Space closes it'));
          // A controlled details group reports the change and follows the caller.
          await tab.locator('summary', { hasText: 'Controlled' }).click();
          assert.equal(await visible(tab, 'a[href="#alpha"]'), true, label('a controlled details group follows its caller'));
          assert.deepEqual(await tab.evaluate(() => window.__changes), [['details', true]], label('and reports the request'));
          await tab.evaluate(() => window.__setOpen('details', false));
          assert.equal(await visible(tab, 'a[href="#alpha"]'), false, label('the caller can close it'));

          // Link groups: the link is a plain link, and a separate toggle owns the state.
          assert.equal(await expanded(tab, 'Catalog'), 'false', label('the toggle starts collapsed'));
          assert.equal(await visible(tab, 'a[href="#button"]'), false, label('the nested list is hidden while collapsed'));
          await tab.getByRole('link', { name: 'Catalog', exact: true }).click();
          assert.equal(await expanded(tab, 'Catalog'), 'false', label('following the group link does not toggle it'));
          await tab.getByRole('button', { name: 'Catalog', exact: true }).click();
          assert.equal(await expanded(tab, 'Catalog'), 'true', label('the toggle expands the category'));
          assert.equal(await visible(tab, 'a[href="#button"]'), true, label('the blocks appear'));
          assert.equal(await visible(tab, 'a[href="#primary"]'), false, label('the variants wait for their block'));
          await tab.getByRole('button', { name: 'Button', exact: true }).click();
          assert.equal(await visible(tab, 'a[href="#primary"]'), true, label('the block toggle opens the variants'));
          assert.equal(await expanded(tab, 'Card'), 'false', label('other blocks stay collapsed'));
          const [category, block, variant] = await Promise.all(['a[href="#catalog"]', 'a[href="#button"]', 'a[href="#primary"]'].map((selector) => tab.evaluate(nestedBoxOf, selector)));
          assert.ok(block.left > category.left && variant.left > block.left, label(`each level indents (${category.left}, ${block.left}, ${variant.left})`));
          assert.deepEqual(await tab.evaluate(() => window.__changes.slice(1)), [['catalog', true], ['button', true]], label('the callers hear about each group'));

          // The current page: one aria-current, styled like a current top-level item, at any depth.
          assert.equal(await tab.locator('[aria-current="page"]').count(), 1, label('exactly one item is current'));
          const current = await tab.evaluate(nestedPaintOf, 'a[href="#primary"]');
          const other = await tab.evaluate(nestedPaintOf, 'a[href="#secondary"]');
          assert.ok(current.background !== other.background && current.background !== 'rgba(0, 0, 0, 0)', label(`the current item is painted (${current.background} against ${other.background})`));

          // Keyboard: the link and its toggle are separate stops, and a closed list leaves the tab order.
          await tab.locator('#before').focus();
          assert.deepEqual(await tabbed(tab, 15), [
            'group Roadmap', 'group Guides', 'link Intro', 'group Deep', 'link Deeper', 'group Controlled', 'link Overview',
            'link Catalog', 'button Catalog', 'link Button', 'button Button', 'link Primary', 'link Secondary', 'link Card', 'button Card',
          ], label('Tab visits each header, link, and toggle once'));
          await tab.getByRole('button', { name: 'Card', exact: true }).focus();
          await tab.keyboard.press('Enter');
          assert.equal(await expanded(tab, 'Card'), 'true', label('Enter on a toggle opens its group'));
          assert.equal(await tab.evaluate(nestedFocusedControl), 'button Card', label('focus stays on the toggle'));
          await tab.keyboard.press('Space');
          assert.equal(await expanded(tab, 'Card'), 'false', label('Space closes it'));
          await tab.getByRole('button', { name: 'Catalog', exact: true }).focus();
          await tab.keyboard.press('Enter');
          assert.equal(await visible(tab, 'a[href="#button"]'), false, label('collapsing a category hides every level below it'));
          assert.deepEqual(await tabbed(tab, 2), ['link Settings', 'button Toggle sidebar'], label('a collapsed category drops its list from the tab order'));

          // The focus ring is drawn on both link-group controls.
          for (const target of [tab.getByRole('link', { name: 'Catalog', exact: true }), tab.getByRole('button', { name: 'Catalog', exact: true })]) {
            await tab.keyboard.press('Escape');
            await target.focus();
            await tab.keyboard.press('Shift+Tab');
            await tab.keyboard.press('Tab');
            const ring = await tab.evaluate(() => {
              const styles = getComputedStyle(document.activeElement);
              return { style: styles.outlineStyle, width: styles.outlineWidth };
            });
            assert.deepEqual(ring, { style: 'solid', width: '2px' }, label('keyboard focus draws the 2px ring'));
          }
          const page = await tab.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, root: document.querySelector('aside').scrollWidth - document.querySelector('aside').clientWidth }));
          assert.ok(page.overflow <= 0 && page.root <= 0, label(`nested rows do not overflow (${JSON.stringify(page)})`));
          assert.deepEqual(errors, [], label('the page logged no errors'));
        } finally {
          await context.close();
        }
      }

      // A caller that refuses every change keeps both kinds of group where they were.
      const refusing = await open('?reject=1');
      try {
        await refusing.tab.locator('summary', { hasText: 'Controlled' }).click();
        await refusing.tab.getByRole('button', { name: 'Catalog', exact: true }).click();
        assert.equal(await visible(refusing.tab, 'a[href="#alpha"]'), false, `${engine}: a refused details group stays closed`);
        assert.equal(await expanded(refusing.tab, 'Catalog'), 'false', `${engine}: a refused link group stays collapsed`);
        assert.deepEqual(await refusing.tab.evaluate(() => window.__changes), [['details', true], ['catalog', true]], `${engine}: both requests were reported`);
        assert.deepEqual(refusing.errors, [], `${engine}: refusing logs no errors`);
      } finally {
        await refusing.context.close();
      }

      // The folded rail keeps top-level links and drops toggles and nested lists; folding rescues focus.
      const folded = await open('?folded=1&open=1');
      try {
        assert.equal(await visible(folded.tab, 'a[href="#catalog"]'), true, `${engine}: a folded link group keeps its link`);
        assert.equal(await folded.tab.getByRole('link', { name: 'Catalog', exact: true }).count(), 1, `${engine}: the folded link keeps its name`);
        for (const hidden of ['.muxui-sidebar__nav-toggle', 'a[href="#button"]', 'a[href="#primary"]', 'a[href="#deeper"]']) {
          assert.equal(await visible(folded.tab, hidden), false, `${engine}: folded, ${hidden} leaves the layout`);
        }
        assert.deepEqual(folded.errors, [], `${engine}: the folded rail logs no errors`);
      } finally {
        await folded.context.close();
      }
      const fold = await open('?open=1');
      try {
        const chord = (await fold.tab.evaluate(() => /mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform))) ? 'Meta+b' : 'Control+b';
        for (const [nested, header] of [['#primary', 'link Catalog'], ['#deeper', 'group Guides']]) {
          await fold.tab.keyboard.press('Escape');
          await fold.tab.locator(`a[href="${nested}"]`).focus();
          await fold.tab.keyboard.press(chord);
          await fold.tab.waitForFunction(() => document.querySelector('aside').hasAttribute('data-collapsed'));
          assert.equal(await fold.tab.evaluate(nestedFocusedControl), header, `${engine}: folding moves focus from ${nested} to the outermost group header`);
          await fold.tab.keyboard.press(chord);
          await fold.tab.waitForFunction(() => !document.querySelector('aside').hasAttribute('data-collapsed'));
        }
        assert.deepEqual(fold.errors, [], `${engine}: folding logs no errors`);
      } finally {
        await fold.context.close();
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}

// Cross-engine proof for how Sidebar groups are named and where their focus goes: a link group's toggle is named by
// its rendered label, text or component, at any depth, and a group that closes under its caller hands focus from a link
// it hides to its own summary or toggle, and nested rows indent from the inline start so right-to-left mirrors left-to-right.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const groupsEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '/src/supplemental/index.mjs';

const h = React.createElement;
// Labels that are components, so no string copy of them exists to name a toggle.
const SettingsLabel = () => h('span', null, 'Set', h('b', null, 'tings'));
const ProfileLabel = () => h('em', null, 'Profile');

function Shell() {
  const [open, setOpen] = React.useState({ settings: true, profile: true, tools: true });
  window.__setOpen = (id, next) => setOpen((previous) => ({ ...previous, [id]: next }));
  const control = (id) => ({ expanded: open[id], onExpandedChange: (next) => setOpen((previous) => ({ ...previous, [id]: next })) });
  return h(React.Fragment, null,
    h('button', { id: 'before', type: 'button' }, 'Before'),
    h(Sidebar.Provider, null,
      h(Sidebar.Root, { 'aria-label': 'Workspace' },
        h(Sidebar.NavList, { 'aria-label': 'Workspace' },
          h(Sidebar.NavItem, { href: '#settings', ...control('settings'), items: [
            { id: 'profile', label: h(ProfileLabel), href: '#profile', ...control('profile'), items: [{ label: 'Avatar', href: '#avatar' }] },
            { label: 'Billing', href: '#billing' },
          ] }, h(SettingsLabel)),
          h(Sidebar.NavItem, { ...control('tools'), items: [{ label: 'Hammer', href: '#hammer' }] }, 'Tools')))),
    h('button', { id: 'after', type: 'button' }, 'After'));
}
createRoot(document.getElementById('root')).render(h(Shell));
`;

const groupsPage = (url) => pageShell({
  attributes: `data-muxui-color-scheme="light"${url.searchParams.get('dir') === 'rtl' ? ' dir="rtl"' : ''}`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/sidebar-groups-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Sidebar groups are named by their labels in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-groups.html': groupsPage },
      modules: { '/sidebar-groups-entry.mjs': groupsEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-groups.html`, 'aside');
      const open = async (query = '') => {
        const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await tab.goto(`${url}/sidebar-groups.html${query}`, { waitUntil: 'networkidle' });
        await tab.locator('aside').waitFor({ timeout: 15_000 });
        return { tab, context, errors };
      };
      const { tab, context, errors } = await open();
      try {
        // The toggle beside a link whose label is a component is still named, at the top level and nested.
        for (const name of ['Settings', 'Profile']) {
          const toggle = tab.getByRole('button', { name, exact: true });
          assert.equal(await toggle.count(), 1, `${engine}: the ${name} toggle is named by its rendered label`);
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `${engine}: and reports its state`);
        }
        assert.equal(await tab.locator('.muxui-sidebar__nav-toggle[aria-label]').count(), 0, `${engine}: no toggle carries a string copy of its label`);
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

for (const engine of browserEngines()) {
  test(`Sidebar hands focus to a group's control when the group closes in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-groups.html': groupsPage },
      modules: { '/sidebar-groups-entry.mjs': groupsEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-groups.html`, 'aside');
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await tab.goto(`${url}/sidebar-groups.html`, { waitUntil: 'networkidle' });
      await tab.locator('aside').waitFor({ timeout: 15_000 });
      try {
        const focused = () => tab.evaluate(() => {
          const node = document.activeElement;
          const labelled = node.getAttribute('aria-labelledby');
          return node === document.body ? 'body' : `${node.tagName.toLowerCase()} ${(labelled && document.getElementById(labelled).textContent) || node.querySelector('.muxui-sidebar__nav-label')?.textContent || node.textContent.trim()}`;
        });
        // The caller changes `expanded` from outside, as a route change or a filter would, and focus is read once React has committed.
        const setOpen = (id, next) => tab.evaluate(([group, value]) => {
          window.__setOpen(group, value);
          return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }, [id, next]);
        const reopen = async () => { for (const id of ['settings', 'profile', 'tools']) await setOpen(id, true); };

        await tab.locator('a[href="#avatar"]').focus();
        await setOpen('profile', false);
        assert.equal(await focused(), 'button Profile', `${engine}: closing a link group moves focus from its hidden link to its toggle`);
        await reopen();
        await tab.locator('a[href="#avatar"]').focus();
        await setOpen('settings', false);
        assert.equal(await focused(), 'button Settings', `${engine}: closing the outer group moves focus from a deeper link to its toggle`);
        await reopen();
        await tab.locator('a[href="#hammer"]').focus();
        await setOpen('tools', false);
        assert.equal(await focused(), 'summary Tools', `${engine}: closing a disclosure group moves focus to its summary`);
        await reopen();
        // Focus the group does not hide stays where it is.
        for (const [id, selector, name] of [['settings', '#before', 'button Before'], ['settings', 'a[href="#settings"]', 'a Settings'], ['tools', '#after', 'button After']]) {
          await tab.locator(selector).focus();
          await setOpen(id, false);
          assert.equal(await focused(), name, `${engine}: closing ${id} leaves focus on ${selector}`);
          await reopen();
        }
        // The user closes a group with a pointer press, which WebKit does not let focus the button, so focus on a hidden link needs the same hand-off.
        await tab.locator('a[href="#billing"]').focus();
        await tab.getByRole('button', { name: 'Settings', exact: true }).click();
        assert.equal(await tab.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-expanded'), 'false', `${engine}: the press closed the group`);
        assert.equal(await focused(), 'button Settings', `${engine}: a pointer press on the toggle leaves focus on it`);
        await reopen();
        // The control that takes focus is the one a keyboard user can reopen the group from.
        await tab.locator('a[href="#billing"]').focus();
        await setOpen('settings', false);
        await tab.keyboard.press('Enter');
        assert.equal(await tab.getByRole('button', { name: 'Settings', exact: true }).getAttribute('aria-expanded'), 'true', `${engine}: Enter on the focused toggle reopens the group`);
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

for (const engine of browserEngines()) {
  test(`Sidebar nested indentation mirrors in right-to-left in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-groups.html': groupsPage },
      modules: { '/sidebar-groups-entry.mjs': groupsEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-groups.html`, 'aside');
      /** The category, the block, and the variant links' edges, and Root's content edges; runs in the page. */
      const edges = () => {
        const edge = (selector) => { const { left, right } = document.querySelector(selector).getBoundingClientRect(); return { left, right }; };
        const root = document.querySelector('aside');
        const content = root.getBoundingClientRect();
        return { category: edge('a[href="#settings"]'), block: edge('a[href="#profile"]'), variant: edge('a[href="#avatar"]'), root: { left: content.left, right: content.right } };
      };
      const measure = async (dir) => {
        const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: dir === 'rtl' ? 'ar' : 'en-US' });
        try {
          const tab = await context.newPage();
          const errors = [];
          tab.on('pageerror', (error) => errors.push(error.message));
          await tab.goto(`${url}/sidebar-groups.html?dir=${dir}`, { waitUntil: 'networkidle' });
          await tab.locator('a[href="#avatar"]').waitFor();
          assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__nav-children')).direction), dir, `${engine}: the page runs ${dir}`);
          assert.deepEqual(errors, [], `${engine}: the page logged no errors`);
          return await tab.evaluate(edges);
        } finally {
          await context.close();
        }
      };
      const ltr = await measure('ltr');
      const rtl = await measure('rtl');
      // Each level steps in from the inline start by its own padding: the block by the base step, the variant by the smaller nested one.
      const steps = { ltr: [ltr.block.left - ltr.category.left, ltr.variant.left - ltr.block.left], rtl: [rtl.category.right - rtl.block.right, rtl.block.right - rtl.variant.right] };
      assert.ok(steps.ltr[0] > steps.ltr[1] && steps.ltr[1] > 0, `${engine}: each level indents, the nested step smaller (${steps.ltr})`);
      assert.deepEqual(steps.rtl.map((step) => Math.round(step * 100)), steps.ltr.map((step) => Math.round(step * 100)), `${engine}: right-to-left indents from the right by the same steps`);
      assert.ok(rtl.category.right > rtl.block.right && rtl.block.right > rtl.variant.right, `${engine}: right-to-left nests toward the left`);
    } finally {
      await browser?.close();
      await close();
    }
  });
}

// Cross-engine proof for Sidebar density. A Root without density and one with density="default" compute exactly the
// spacing the Sidebar always had, each from its own token; compact tightens rows, gaps, section labels, and nesting from
// other existing tokens, keeps every interactive row above the 24px target minimum, and leaves text, icons, and focus rings alone.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const densityEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '/src/supplemental/index.mjs';

const h = React.createElement;
const Icon = ({ className }) => h('svg', { className, viewBox: '0 0 24 24', 'aria-hidden': true }, h('rect', { x: 4, y: 4, width: 16, height: 16 }));
// The same navigation under each density: a link, then a section holding a link group of link groups and a details group.
const rail = (name, props) => h(Sidebar.Root, { 'aria-label': name, ...props },
  h(Sidebar.NavList, { 'aria-label': name + ' pages' },
    h(Sidebar.Section, { label: 'Pages' }, h(Sidebar.NavItem, { href: '#home-' + name, icon: Icon }, 'Home')),
    h(Sidebar.Section, { label: 'Library' },
      h(Sidebar.NavItem, { href: '#catalog-' + name, defaultExpanded: true, items: [
        { id: 'button', label: 'Button', href: '#button-' + name, defaultExpanded: true, items: [{ label: 'Primary', href: '#primary-' + name, current: true }] },
      ] }, 'Catalog'),
      h(Sidebar.NavItem, { defaultExpanded: true, items: [{ label: 'Alpha', href: '#alpha-' + name }] }, 'Group'))));
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', type: 'button' }, 'Before'),
  h('div', { className: 'rails' }, rail('implicit', {}), rail('default', { density: 'default' }), rail('compact', { density: 'compact' }))));
`;

const densityPage = () => pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css"><style>.rails { display: flex; align-items: flex-start; gap: 16px; } .rails > aside { inline-size: 16rem; block-size: auto; }</style>',
  bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/sidebar-density-entry.mjs',
});

/** Spacing, sizes, and focus ring of one rail, and the tokens that spacing comes from, in px; runs in the page. */
function densityMetrics(name) {
  const root = document.querySelector(`aside[aria-label="${name}"]`);
  const px = (value) => Number.parseFloat(value);
  const style = (selector, context = root) => getComputedStyle(context.querySelector(selector));
  const token = (id) => {
    const probe = document.createElement('div');
    probe.style.inlineSize = `var(--muxui-${id})`;
    root.append(probe);
    const { width } = probe.getBoundingClientRect();
    probe.remove();
    return width;
  };
  const blockGroup = root.querySelector('.muxui-sidebar__nav-children');
  const link = style('.muxui-sidebar__nav-link');
  const children = getComputedStyle(blockGroup);
  const nested = style('.muxui-sidebar__nav-children', blockGroup);
  const sections = root.querySelectorAll('.muxui-sidebar__section');
  const label = style('.muxui-sidebar__section-label');
  const toggle = style('.muxui-sidebar__nav-toggle');
  const rows = [...root.querySelectorAll('a[href], summary, button')].filter((node) => node.getClientRects().length > 0).map((node) => node.getBoundingClientRect().height);
  return {
    density: root.getAttribute('data-density'),
    tokens: {
      insetTiny: token('semantic-layout-inset-tiny'), insetTight: token('semantic-layout-inset-tight'), insetSmall: token('semantic-layout-inset-small'),
      insetMedium: token('semantic-layout-inset-medium'), insetLarge: token('semantic-layout-inset-large'), insetXlarge: token('semantic-layout-inset-xlarge'),
      denseGap: token('semantic-layout-dense-gap'), groupGap: token('semantic-layout-group-gap'), controlGap: token('semantic-layout-control-gap'),
      sizeSm: token('control-size-sm'), sizeMd: token('control-size-md'),
    },
    spacing: {
      linkPaddingBlock: px(link.paddingTop), linkMinBlock: px(link.minBlockSize), navListGap: px(style('.muxui-sidebar__nav-list').rowGap),
      childrenGap: px(children.rowGap), childrenPaddingBlockStart: px(children.paddingTop), childrenMarginBlockStart: px(children.marginTop), childrenIndent: px(children.paddingLeft),
      nestedIndent: px(nested.paddingLeft), sectionMarginBlockStart: px(getComputedStyle(sections[1]).marginTop),
      labelPaddingBlockStart: px(label.paddingTop), labelPaddingBlockEnd: px(label.paddingBottom), toggleBlock: px(toggle.height),
    },
    // What density must not change: sizes, the inline padding, and the toggle's width.
    kept: {
      linkPaddingInline: px(link.paddingLeft), linkFontSize: px(link.fontSize), childFontSize: px(style('.muxui-sidebar__nav-child-link').fontSize), labelFontSize: px(label.fontSize),
      iconSize: px(style('.muxui-sidebar__nav-icon').width), toggleInline: px(toggle.width), navListPaddingInline: px(style('.muxui-sidebar__nav-list').paddingLeft),
    },
    shortestRow: Math.min(...rows),
    tallestRow: Math.max(...rows),
  };
}

/** The ring of the focused element; runs in the page. */
function densityFocusRing() {
  const { outlineStyle, outlineWidth, outlineOffset, outlineColor } = getComputedStyle(document.activeElement);
  return { outlineStyle, outlineWidth, outlineOffset, outlineColor };
}

// Layout snaps lengths to 1/64px, so a token read from a probe box can differ from the computed value by a hair.
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.05, `${message} (${actual} vs ${expected})`);

for (const engine of browserEngines()) {
  test(`Sidebar density compacts rows without touching the default in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-density.html': densityPage },
      modules: { '/sidebar-density-entry.mjs': densityEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-density.html`, 'aside');
      const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, locale: 'en-US' });
      try {
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        await tab.goto(`${url}/sidebar-density.html`, { waitUntil: 'networkidle' });
        await tab.locator('aside[aria-label="compact"] a[href="#primary-compact"]').waitFor();
        const [implicit, explicit, compact] = await Promise.all(['implicit', 'default', 'compact'].map((name) => tab.evaluate(densityMetrics, name)));

        assert.equal(implicit.density, null, `${engine}: a Root without density has no data-density`);
        assert.equal(explicit.density, null, `${engine}: density="default" has no data-density`);
        assert.equal(compact.density, 'compact', `${engine}: a compact Root says so`);
        assert.deepEqual(explicit.spacing, implicit.spacing, `${engine}: density="default" computes the spacing of no density`);
        assert.deepEqual(explicit.kept, implicit.kept, `${engine}: density="default" keeps the sizes of no density`);

        // The default spacing is the one the Sidebar has always drawn, each value from its own token.
        const { tokens: t } = implicit;
        const defaults = {
          linkPaddingBlock: t.insetTiny, linkMinBlock: t.sizeMd, navListGap: t.denseGap, childrenGap: t.denseGap, childrenPaddingBlockStart: t.insetTiny,
          childrenMarginBlockStart: t.denseGap, childrenIndent: t.insetXlarge, nestedIndent: t.insetLarge, sectionMarginBlockStart: t.groupGap,
          labelPaddingBlockStart: t.insetSmall, labelPaddingBlockEnd: t.insetTight, toggleBlock: t.sizeMd,
        };
        for (const [property, expected] of Object.entries(defaults)) near(implicit.spacing[property], expected, `${engine}: default ${property}`);

        // Compact steps down to other existing tokens: the small control height, the tight inset, and smaller nesting steps.
        const compacted = {
          linkPaddingBlock: t.insetTight, linkMinBlock: t.sizeSm, navListGap: 0, childrenGap: 0, childrenPaddingBlockStart: 0,
          childrenMarginBlockStart: 0, childrenIndent: t.insetLarge, nestedIndent: t.insetMedium, sectionMarginBlockStart: t.controlGap,
          labelPaddingBlockStart: t.insetTight, labelPaddingBlockEnd: t.insetTight, toggleBlock: t.sizeSm,
        };
        for (const [property, expected] of Object.entries(compacted)) near(compact.spacing[property], expected, `${engine}: compact ${property}`);
        assert.deepEqual(compact.kept, implicit.kept, `${engine}: compact keeps text and icon sizes, inline padding, and the toggle's width`);
        assert.ok(compact.tallestRow < implicit.shortestRow, `${engine}: every compact row is shorter than a default row (${compact.tallestRow} vs ${implicit.shortestRow})`);
        assert.ok(compact.shortestRow >= 24, `${engine}: every compact row stays at least 24px tall (${compact.shortestRow})`);
        assert.ok(implicit.shortestRow >= 24, `${engine}: every default row is at least 24px tall (${implicit.shortestRow})`);

        // Keyboard focus draws the same ring either way.
        await tab.locator('#before').focus();
        await tab.keyboard.press('Tab');
        const rings = [];
        for (const name of ['implicit', 'compact']) {
          await tab.locator(`aside[aria-label="${name}"] a[href="#home-${name}"]`).focus();
          rings.push(await tab.evaluate(densityFocusRing));
        }
        assert.equal(rings[0].outlineStyle, 'solid', `${engine}: the focus ring shows`);
        assert.deepEqual(rings[1], rings[0], `${engine}: compact keeps the focus ring`);
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

/**
 * Whether the focus ring is painted on each side of a box, read from a screenshot; runs in the page, where the image decodes
 * on a canvas. The ring sits 2px outside the box and is 2px wide, so each probe is the middle of that band, 3px out.
 */
async function ringSides({ png, clip, box, scale, ring }) {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixel = (x, y) => [...context.getImageData(Math.round((x - clip.x) * scale), Math.round((y - clip.y) * scale), 1, 1).data];
  // Canvas resolves any CSS colour, so the ring's computed colour becomes the RGB the page paints.
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = ring;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const painted = (x, y) => pixel(x, y).slice(0, 3).every((value, index) => Math.abs(value - [red, green, blue][index]) <= 24);
  const { left, top, width, height } = box;
  return {
    top: painted(left + width / 2, top - 3),
    bottom: painted(left + width / 2, top + height + 3),
    left: painted(left - 3, top + height / 2),
    right: painted(left + width + 3, top + height / 2),
  };
}

for (const engine of browserEngines()) {
  test(`Sidebar compact paints a focused control's whole ring over the next row in ${engine}`, { timeout: 300_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/sidebar-density.html': densityPage },
      modules: { '/sidebar-density-entry.mjs': densityEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-density.html`, 'aside');
      for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'en-US' });
        try {
          const tab = await context.newPage();
          await tab.goto(`${url}/sidebar-density.html?scheme=${scheme}`, { waitUntil: 'networkidle' });
          await tab.locator('aside[aria-label="compact"] a[href="#primary-compact"]').waitFor();
          // The Button group's link and toggle are followed, with no gap in compact, by the current row's fill.
          await tab.locator('#before').focus();
          await tab.keyboard.press('Tab');
          const rings = {};
          for (const name of ['implicit', 'compact']) {
            for (const [part, selector] of [['link', `a[href="#button-${name}"]`], ['toggle', `.muxui-sidebar__nav-row:has(a[href="#button-${name}"]) button`]]) {
              const control = tab.locator(`aside[aria-label="${name}"] ${selector}`);
              await control.focus();
              const { box, ring } = await control.evaluate((node) => {
                const { left, top, width, height } = node.getBoundingClientRect();
                return { box: { left, top, width, height }, ring: getComputedStyle(node).outlineColor };
              });
              const clip = { x: Math.max(0, box.left - 8), y: Math.max(0, box.top - 8), width: box.width + 16, height: box.height + 16 };
              const png = (await tab.screenshot({ clip, type: 'png' })).toString('base64');
              rings[`${name} ${part}`] = await tab.evaluate(ringSides, { png, clip, box, scale: 2, ring });
            }
          }
          const whole = { top: true, bottom: true, left: true, right: true };
          assert.deepEqual(rings, { 'implicit link': whole, 'implicit toggle': whole, 'compact link': whole, 'compact toggle': whole }, `${engine} ${scheme}: the Button group's link and toggle rings are painted on every side`);
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
