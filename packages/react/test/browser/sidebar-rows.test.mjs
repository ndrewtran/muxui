import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof for the Sidebar row parts, in light and dark: a row's own action beside its link, open and
// folded; a collapsible Section; the pressed treatment against hover and current; the nav landmark around a
// scrolling list; the Footer that stays in view, including when Root runs past the window; the published open and
// folded widths read from outside Root; the ground and edge hooks; the group break; reduced motion; and forced
// colours where the engine can emulate them. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '/src/supplemental/sidebar.ts';
import { IconButton } from '/src/supplemental/icon-button.ts';
import { Menu } from '/src/collections.mjs';

const h = React.createElement;
const params = new URLSearchParams(location.search);
const Icon = ({ className }) => h('svg', { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, 'aria-hidden': true }, h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }));
const rows = Array.from({ length: 24 }, (_, index) => 'Row ' + (index + 1));
window.__pins = [];

function Rows() {
  return h(Sidebar.Provider, { defaultCollapsed: params.get('folded') === '1', shortcut: 'b' },
    h('div', { className: params.has('tall') ? 'shell tall' : 'shell' },
      h(Sidebar.Root, { 'aria-label': 'Workspace sidebar', className: params.has('hooks') ? 'hooked' : undefined },
        h(Sidebar.NavList, { navLabel: 'Workspace' },
          h(Sidebar.NavItem, { href: '#home', icon: Icon, current: true }, 'Home'),
          h(Sidebar.Section, { label: 'Projects', collapsible: true },
            h(Sidebar.NavItem, { href: '#atlas', icon: Icon, action: h(IconButton, { size: 'sm', id: 'pin', 'aria-label': 'Pin Atlas', onActivate: () => window.__pins.push('atlas') }, h(Icon)) }, 'Atlas'),
            h(Sidebar.NavDivider),
            h(Sidebar.NavItem, { href: '#beacon', icon: Icon, action: h(Menu.Root, null, h(Menu.Trigger, { id: 'beacon-menu', 'aria-label': 'Beacon options' }, '...'), h(Menu.Popup, null, h(Menu.List, { 'aria-label': 'Beacon options', items: ['Rename', 'Archive'] }))) }, 'Beacon')),
          ...rows.map((label) => h(Sidebar.NavItem, { key: label, href: '#' + label.replace(' ', '-'), icon: Icon }, label))),
        h(Sidebar.Footer, null, h(Sidebar.NavList, null, h(Sidebar.NavItem, { href: '#help', icon: Icon }, 'Help')))),
      h('main', { className: 'main' }, h(Sidebar.Toggle), h('div', { id: 'probe' }))));
}
createRoot(document.getElementById('root')).render(h(Rows));
`;

const css = `
.shell { display: flex; block-size: 24rem; }
.shell.tall { block-size: 150vh; }
.main { display: flex; flex-direction: column; align-items: flex-start; flex: 1; gap: 8px; padding: 12px; }
.hooked { --muxui-component-sidebar-background: rgb(10, 20, 30); --muxui-component-sidebar-border-color: rgb(200, 100, 50); }
html[data-still] *, html[data-still] *::before { transition-duration: 0s !important; }
`;

const page = (url) => pageShell({
  attributes: [
    `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}"`,
    url.searchParams.get('motion') === 'reduced' ? 'data-muxui-motion="reduced"' : '',
    url.searchParams.has('still') ? 'data-still' : '',
  ].filter(Boolean).join(' '),
  head: `<link rel="stylesheet" href="/generated/styles.css"><style>${css}</style>`,
  bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/sidebar-rows-entry.mjs',
});

/** Visible box of a node, or null when it has no layout box or is hidden; runs in the page. */
function boxOf(selector) {
  const node = document.querySelector(selector);
  if (!node || node.getClientRects().length === 0 || getComputedStyle(node).visibility === 'hidden') return null;
  const { left, top, right, bottom, width, height } = node.getBoundingClientRect();
  return { left, top, right, bottom, width, height };
}

/** The painted background of a node: its colour and image; runs in the page. */
function paintOf(selector) {
  const style = getComputedStyle(document.querySelector(selector));
  return `${style.backgroundColor} ${style.backgroundImage}`;
}

/** WCAG contrast of a node's text colour against the backgrounds stacked behind it; runs in the page. */
function contrastOf(selector) {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const pixel = (...layers) => {
    context.clearRect(0, 0, 1, 1);
    for (const paint of layers) {
      context.fillStyle = paint;
      context.fillRect(0, 0, 1, 1);
    }
    return [...context.getImageData(0, 0, 1, 1).data];
  };
  const luminance = ([r, g, b]) => [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const element = document.querySelector(selector);
  const layers = [];
  for (let node = element; node; node = node.parentElement) {
    const paint = getComputedStyle(node).backgroundColor;
    const alpha = pixel(paint)[3];
    if (alpha > 0) layers.unshift(paint);
    if (alpha === 255) break;
  }
  const [high, low] = [luminance(pixel(getComputedStyle(element).color)), luminance(pixel(...layers))].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** The colour a node's background composites to over the opaque ground behind it, as [r, g, b]; runs in the page. */
function groundOf(selector) {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const layers = [];
  for (let node = document.querySelector(selector); node; node = node.parentElement) {
    const paint = getComputedStyle(node).backgroundColor;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = paint;
    context.fillRect(0, 0, 1, 1);
    const alpha = context.getImageData(0, 0, 1, 1).data[3];
    if (alpha > 0) layers.unshift(paint);
    if (alpha === 255) break;
  }
  context.clearRect(0, 0, 1, 1);
  for (const paint of layers) { context.fillStyle = paint; context.fillRect(0, 0, 1, 1); }
  return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
}

/** Root's width against the published widths, read from an element outside Root; runs in the page. */
function widthsOf() {
  const root = document.querySelector('aside');
  const probe = document.getElementById('probe');
  const read = (property) => {
    probe.style.inlineSize = `var(${property})`;
    return probe.getBoundingClientRect().width;
  };
  return { width: root.getBoundingClientRect().width, border: parseFloat(getComputedStyle(root).borderRightWidth), open: read('--muxui-component-sidebar-open-size'), rail: read('--muxui-component-sidebar-rail-size') };
}

for (const engine of browserEngines()) {
  test(`Sidebar row actions, collapsible sections, landmark and footer work in ${engine}`, { timeout: 300_000 }, async (context) => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/sidebar.ts', 'src/supplemental/icon-button.ts', 'src/collections.mjs'],
      pages: { '/sidebar-rows.html': page },
      modules: { '/sidebar-rows-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/sidebar-rows.html`, 'aside');
      const open = async (query, options = {}) => {
        const browserContext = await browser.newContext({ viewport: { width: 900, height: 640 }, locale: 'en-US', ...options });
        const tab = await browserContext.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        await tab.goto(`${url}/sidebar-rows.html${query}`, { waitUntil: 'load' });
        await tab.locator('aside').waitFor({ timeout: 15_000 });
        await awaitFontsAndFrames(tab);
        return { tab, context: browserContext, errors };
      };
      const isFocused = (tab, selector) => tab.evaluate((selector) => document.activeElement === document.querySelector(selector), selector);
      // Releasing the pointer away from a row cancels its press; a click on empty page then clears what WebKit keeps active.
      const release = async (tab) => { await tab.mouse.move(850, 600); await tab.mouse.up(); await tab.mouse.click(850, 600); };
      const center = async (tab, selector) => { const box = await tab.evaluate(boxOf, selector); return [box.left + box.width / 2, box.top + box.height / 2]; };

      for (const scheme of ['light', 'dark']) {
        const label = (message) => `${engine} ${scheme}: ${message}`;

        // Open: the landmark, the action, the Section, pressed paint, the list scrolling above the foot, and the widths.
        {
          const { tab, context: page_, errors } = await open(`?scheme=${scheme}&still`);
          try {
            assert.equal(await tab.getByRole('navigation', { name: 'Workspace' }).count(), 1, label('the list sits in a named nav landmark'));
            const list = await tab.evaluate(() => { const node = document.querySelector('nav > .muxui-sidebar__nav-list'); return { overflow: node.scrollHeight - node.clientHeight, style: getComputedStyle(node).overflowY }; });
            assert.ok(list.overflow > 0 && list.style === 'auto', label(`the list inside the landmark still scrolls (${JSON.stringify(list)})`));

            // The foot stays put at the column's foot while the list scrolls under nothing.
            const footBefore = await tab.evaluate(boxOf, '.muxui-sidebar__footer');
            const rootBox = await tab.evaluate(boxOf, 'aside');
            assert.ok(Math.abs(footBefore.bottom - rootBox.bottom) < 1, label(`the footer sits at Root's foot (${footBefore.bottom} against ${rootBox.bottom})`));
            await tab.evaluate(() => { document.querySelector('nav > .muxui-sidebar__nav-list').scrollTop = 10_000; });
            assert.deepEqual(await tab.evaluate(boxOf, '.muxui-sidebar__footer'), footBefore, label('the footer does not move while the list scrolls'));
            assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__footer')).backgroundColor), await tab.evaluate(() => getComputedStyle(document.querySelector('aside')).backgroundColor), label('the footer is painted with the sidebar ground'));
            await tab.evaluate(() => { document.querySelector('nav > .muxui-sidebar__nav-list').scrollTop = 0; });

            // The action is its own named tab stop after the link, visible without hover, and Enter operates it.
            await tab.keyboard.press('Escape');
            await tab.locator('a[href="#atlas"]').focus();
            await tab.keyboard.press('Tab');
            assert.ok(await isFocused(tab, '#pin'), label('Tab moves from the link to its action'));
            assert.equal(await tab.getByRole('button', { name: 'Pin Atlas' }).count(), 1, label('the action keeps its own name'));
            assert.equal(await tab.locator('a[href="#atlas"]').getAttribute('aria-label'), null, label('the link keeps its own name'));
            const action = await tab.evaluate(boxOf, '#pin');
            const atlas = await tab.evaluate(boxOf, 'a[href="#atlas"]');
            assert.ok(action.width >= 24 && action.left >= atlas.right - 0.5, label(`the action is shown after the link (${JSON.stringify({ action, atlas })})`));
            await tab.keyboard.press('Enter');
            assert.deepEqual(await tab.evaluate(() => window.__pins), ['atlas'], label('Enter operates the action'));

            // The group break is a list item hidden from assistive technology, inset to the rows.
            const divider = await tab.evaluate(() => { const node = document.querySelector('.muxui-sidebar__nav-divider'); return { tag: node.tagName, hidden: node.getAttribute('aria-hidden'), parent: node.parentElement.tagName, width: node.getBoundingClientRect().width, line: parseFloat(getComputedStyle(node, '::before').borderTopWidth) }; });
            assert.deepEqual([divider.tag, divider.hidden, divider.parent, divider.line], ['LI', 'true', 'UL', 1], label(`the divider is a hidden list item with a hairline (${JSON.stringify(divider)})`));

            // The Section heading is a button that reports and changes its state from the keyboard, with a focus ring.
            const heading = tab.getByRole('button', { name: 'Projects' });
            assert.equal(await heading.getAttribute('aria-expanded'), 'true', label('a collapsible section starts open'));
            await heading.focus();
            const ring = await tab.evaluate(() => { const style = getComputedStyle(document.querySelector('.muxui-sidebar__section-toggle')); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }; });
            assert.ok(ring.style === 'solid' && ring.width >= 2, label(`the heading shows a focus ring (${JSON.stringify(ring)})`));
            await tab.keyboard.press('Enter');
            assert.equal(await heading.getAttribute('aria-expanded'), 'false', label('Enter closes the section'));
            assert.equal(await tab.evaluate(boxOf, 'a[href="#atlas"]'), null, label('a closed section hides its rows'));
            await tab.keyboard.press('Space');
            assert.equal(await heading.getAttribute('aria-expanded'), 'true', label('Space opens it again'));

            // Rest, hover and pressed differ on a row and on the heading; the current row pressed differs from current and current hover.
            await tab.mouse.click(850, 600);
            let beaconPressed;
            for (const selector of ['a[href="#beacon"]', '.muxui-sidebar__section-toggle']) {
              const rest = await tab.evaluate(paintOf, selector);
              await tab.mouse.move(...await center(tab, selector));
              const hover = await tab.evaluate(paintOf, selector);
              await tab.mouse.down();
              await pollUntil(tab, (selector) => document.querySelector(selector).matches(':active'), selector, { message: label(`${selector} becomes active`) });
              const pressed = await tab.evaluate(paintOf, selector);
              if (selector === 'a[href="#beacon"]') beaconPressed = await tab.evaluate(groundOf, selector);
              const text = await tab.evaluate(contrastOf, selector === 'a[href="#beacon"]' ? 'a[href="#beacon"] .muxui-sidebar__nav-label' : '.muxui-sidebar__section-label');
              await release(tab);
              assert.equal(new Set([rest, hover, pressed]).size, 3, label(`${selector} paints rest, hover and pressed apart (${rest} | ${hover} | ${pressed})`));
              assert.ok(text >= 4.5, label(`${selector} text keeps text contrast while pressed (${text.toFixed(2)}:1)`));
            }
            const current = 'a[href="#home"]';
            const currentRest = await tab.evaluate(paintOf, current);
            await tab.mouse.move(...await center(tab, current));
            const currentHover = await tab.evaluate(paintOf, current);
            await tab.mouse.down();
            await pollUntil(tab, (selector) => document.querySelector(selector).matches(':active'), current, { message: label('the current row becomes active') });
            const currentPressed = await tab.evaluate(paintOf, current);
            await release(tab);
            assert.equal(new Set([currentRest, currentHover, currentPressed]).size, 3, label(`the current row paints rest, hover and pressed apart (${currentRest} | ${currentHover} | ${currentPressed})`));
            // A pressed row and the current row, each composited over the ground, differ by a visible step.
            const currentGround = await tab.evaluate(groundOf, current);
            const step = Math.max(...currentGround.map((channel, index) => Math.abs(channel - beaconPressed[index])));
            assert.ok(step >= 6, label(`a pressed row reads apart from the current row (${beaconPressed} against ${currentGround}, step ${step})`));

            // Folding while the heading has focus hides the button, so focus moves to the Toggle.
            await tab.getByRole('button', { name: 'Projects' }).focus();
            await tab.keyboard.press((await tab.evaluate(() => /mac|iphone|ipad|ipod/iu.test(navigator.userAgentData?.platform ?? navigator.platform))) ? 'Meta+b' : 'Control+b');
            await pollUntil(tab, () => document.activeElement?.classList.contains('muxui-sidebar__toggle'), undefined, { message: label('folding moves focus from the heading to the Toggle') });
            await tab.locator('.muxui-sidebar__toggle').click();
            await pollUntil(tab, () => !document.querySelector('aside').hasAttribute('data-muxui-collapsed') && document.querySelector('aside').getBoundingClientRect().width > 200, undefined, { message: label('the Toggle unfolds Root again') });

            // The open width is the published open size plus the edge, read from an element outside Root.
            const widths = await tab.evaluate(widthsOf);
            assert.ok(Math.abs(widths.width - (widths.open + widths.border)) < 0.5, label(`Root is the published open width plus its edge (${JSON.stringify(widths)})`));
            assert.deepEqual(errors, [], label('no page errors'));
          } finally {
            await page_.close();
          }
        }

        // Folded: the action keeps its tab stop and shows while focused, the Section's rows show without a button,
        // the divider narrows, the foot stays at the foot, and Root is the published rail width plus its edge.
        {
          const { tab, context: page_, errors } = await open(`?scheme=${scheme}&still&folded=1`);
          try {
            const widths = await tab.evaluate(widthsOf);
            assert.ok(Math.abs(widths.width - (widths.rail + widths.border)) < 0.5, label(`folded Root is the published rail width plus its edge (${JSON.stringify(widths)})`));
            assert.equal(await tab.evaluate(boxOf, '.muxui-sidebar__section-toggle'), null, label('folded, the heading button is not shown'));
            assert.ok(await tab.evaluate(boxOf, 'a[href="#atlas"]'), label('folded, the section rows show'));
            assert.equal(await tab.getByRole('list', { name: 'Projects' }).count(), 1, label('folded, the section list keeps its name'));
            const clipped = await tab.evaluate(() => { const node = document.querySelector('.muxui-sidebar__nav-action'); return { width: node.getBoundingClientRect().width, clip: getComputedStyle(node).clipPath }; });
            assert.ok(clipped.width <= 1 && clipped.clip !== 'none', label(`folded, the action is clipped while it has no focus (${JSON.stringify(clipped)})`));
            await tab.keyboard.press('Escape');
            await tab.locator('a[href="#atlas"]').focus();
            await tab.keyboard.press('Tab');
            assert.ok(await isFocused(tab, '#pin'), label('folded, Tab still reaches the action'));
            const action = await tab.evaluate(boxOf, '.muxui-sidebar__nav-action');
            const root = await tab.evaluate(boxOf, 'aside');
            assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__nav-action')).clipPath), 'none', label('folded, the focused action is not clipped'));
            assert.ok(action.width >= 24 && action.left >= root.left && action.right <= root.right + 0.5, label(`folded, the focused action shows inside the rail (${JSON.stringify({ action, root })})`));
            await tab.keyboard.press('Enter');
            assert.deepEqual(await tab.evaluate(() => window.__pins), ['atlas'], label('folded, Enter operates the action'));
            // A menu action stays shown while its menu is open, though focus has moved into the menu.
            await tab.locator('a[href="#beacon"]').focus();
            await tab.keyboard.press('Tab');
            assert.ok(await isFocused(tab, '#beacon-menu'), label('folded, Tab reaches the menu action'));
            await tab.keyboard.press('Enter');
            await tab.getByRole('menu', { name: 'Beacon options' }).waitFor({ timeout: 5_000 });
            const menuAction = await tab.evaluate(() => { const node = document.querySelector('#beacon-menu').closest('.muxui-sidebar__nav-action'); return { width: node.getBoundingClientRect().width, clip: getComputedStyle(node).clipPath, focusInside: node.contains(document.activeElement) }; });
            assert.ok(menuAction.width > 1 && menuAction.clip === 'none' && !menuAction.focusInside, label(`folded, the action stays shown while its menu is open (${JSON.stringify(menuAction)})`));
            await tab.keyboard.press('Escape');
            // The line is the divider's content box: the row less its padding.
            const divider = await tab.evaluate(() => { const node = document.querySelector('.muxui-sidebar__nav-divider'); const style = getComputedStyle(node); return { width: node.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) }; });
            assert.ok(Math.abs(divider.width - 16) < 0.5, label(`folded, the divider narrows to the icon column (${divider.width})`));
            const foot = await tab.evaluate(boxOf, '.muxui-sidebar__footer');
            assert.ok(Math.abs(foot.bottom - root.bottom) < 1 && foot.right <= root.right + 0.5, label('folded, the footer sits at the foot inside the rail'));
            assert.equal(await tab.getByRole('link', { name: 'Help' }).count(), 1, label('folded, the footer row keeps its name'));
            assert.deepEqual(errors, [], label('no page errors'));
          } finally {
            await page_.close();
          }
        }

        // Root taller than the window: the foot sticks to the window's bottom edge, open and folded.
        for (const folded of ['0', '1']) {
          const { tab, context: page_, errors } = await open(`?scheme=${scheme}&still&tall&folded=${folded}`);
          try {
            const overflow = await tab.evaluate(() => getComputedStyle(document.querySelector('aside')).overflowX);
            assert.equal(overflow, 'clip', label('a folding Root with a footer clips without being a scroll container'));
            const foot = await tab.evaluate(boxOf, '.muxui-sidebar__footer');
            const height = await tab.evaluate(() => window.innerHeight);
            assert.ok(Math.abs(foot.bottom - height) < 1, label(`${folded === '1' ? 'folded' : 'open'}, the footer sticks to the window's foot (${foot.bottom} against ${height})`));
            assert.deepEqual(errors, [], label('no page errors'));
          } finally {
            await page_.close();
          }
        }

        // The ground and edge hooks on Root reach Root and its foot.
        {
          const { tab, context: page_, errors } = await open(`?scheme=${scheme}&still&hooks`);
          try {
            const paint = await tab.evaluate(() => {
              const root = getComputedStyle(document.querySelector('aside'));
              return { ground: root.backgroundColor, edge: root.borderRightColor, foot: getComputedStyle(document.querySelector('.muxui-sidebar__footer')).backgroundColor };
            });
            assert.deepEqual(paint, { ground: 'rgb(10, 20, 30)', edge: 'rgb(200, 100, 50)', foot: 'rgb(10, 20, 30)' }, label('the hooks set the ground and the edge'));
            assert.deepEqual(errors, [], label('no page errors'));
          } finally {
            await page_.close();
          }
        }
      }

      // Reduced motion: the foot's gutter changes at once with the fold, as the other parts do.
      {
        const { tab, context: page_ } = await open('?motion=reduced');
        try {
          assert.equal(await tab.evaluate(() => getComputedStyle(document.querySelector('.muxui-sidebar__footer')).transitionDuration.split(',').every((value) => parseFloat(value) === 0)), true, `${engine}: the footer does not travel under reduced motion`);
          // The Section heading's fill and chevron change at once, and its rows show and hide with no motion.
          const still = await tab.evaluate(() => ['.muxui-sidebar__section-toggle', '.muxui-sidebar__section-toggle .muxui-sidebar__nav-chevron', '.muxui-sidebar__section-items']
            .map((selector) => [selector, getComputedStyle(document.querySelector(selector)).transitionDuration])
            .filter(([, duration]) => !duration.split(',').every((value) => parseFloat(value) === 0)));
          assert.deepEqual(still, [], `${engine}: the Section heading and rows do not animate under reduced motion`);
        } finally {
          await page_.close();
        }
      }

      // Forced colours: the heading's focus ring and the focused folded action stay visible in system colours.
      if (engine === 'chromium') {
        for (const folded of ['0', '1']) {
          const { tab, context: page_ } = await open(`?still&folded=${folded}`, { forcedColors: 'active' });
          try {
            assert.equal(await tab.evaluate(() => matchMedia('(forced-colors: active)').matches), true, 'forced colours are emulated');
            await tab.keyboard.press('Escape');
            if (folded === '0') {
              await tab.getByRole('button', { name: 'Projects' }).focus();
              const ring = await tab.evaluate(() => { const style = getComputedStyle(document.querySelector('.muxui-sidebar__section-toggle')); return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor }; });
              assert.ok(ring.style === 'solid' && ring.width >= 2 && !/rgba\(.*, 0\)$/u.test(ring.color), `chromium forced colours: the heading keeps a visible focus ring (${JSON.stringify(ring)})`);
            } else {
              await tab.locator('a[href="#atlas"]').focus();
              await tab.keyboard.press('Tab');
              assert.ok((await tab.evaluate(boxOf, '.muxui-sidebar__nav-action')).width >= 24, 'chromium forced colours: the focused folded action shows');
            }
          } finally {
            await page_.close();
          }
        }
      } else {
        context.diagnostic(`skipped in ${engine}: forced-colour emulation is Chromium-only, so those cases run in Chromium`);
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
