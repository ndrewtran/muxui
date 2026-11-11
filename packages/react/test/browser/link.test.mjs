import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Breadcrumbs, Link as StaticLink } from '../../src/components.ts';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, settleMotion, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that a Mux Link inside a disabled GridList item is disabled
// the way the Button beside it is: inert markup, the shared disabled paint, and
// no focus stop or activation from the keyboard or the pointer. Each item holds
// a Link and a Button; item `b` is disabled. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs). A Link in server markup that no script
// has hydrated takes the hover colour from :hover alone, in both colour schemes. The
// same holds for a Breadcrumbs link, which also shows the hover colour once hydrated. A Link that carries Button's class
// computes the same as a Button in every state, scheme and forced colours, and a colour-scheme change does not animate
// a resting Link.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GridList } from '/src/collections.mjs';
import { Button } from '/src/button.ts';
import { Link } from '/src/components.ts';

const h = React.createElement;
const { layout = 'stack' } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
window.__events = [];
const log = (...entry) => window.__events.push(entry);

// Names the focused item, plus the nested control when focus is inside one.
window.__focus = () => {
  const node = document.activeElement;
  const row = node?.closest?.('[role="row"]');
  if (!row) return node?.id || node?.tagName?.toLowerCase() || 'none';
  const item = row.querySelector('[data-item]').dataset.item;
  return node === row ? item : item + ':' + node.tagName.toLowerCase();
};

function Fixture() {
  return h(GridList, { 'aria-label': 'Items', layout }, ['a', 'b', 'c'].map((id) => h(GridList.Item, { key: id, id, textValue: 'Item ' + id, disabled: id === 'b' },
    h('strong', { 'data-item': id }, 'Item ' + id),
    h(Link, { href: '#' + id, onActivate: () => log('link', id) }, 'Open ' + id),
    h(Button, { onActivate: () => log('button', id) }, 'Act ' + id))));
}
createRoot(document.getElementById('root')).render(h(Fixture));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps it focusable.
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div><button id="after" tabindex="0">After</button>',
  entry: '/link-entry.mjs',
});

// Plain server markup under the stylesheet, with no hydration script, so no data-muxui-state-hovered is ever written.
const staticPage = (scheme) => pageShell({
  attributes: `data-muxui-color-scheme="${scheme}" data-muxui-motion="reduced"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: renderToString(React.createElement(React.Fragment, null,
    React.createElement(StaticLink, { id: 'plain', href: '#plain' }, 'Plain'),
    ' ',
    React.createElement(StaticLink, { id: 'current', href: '#current', current: true }, 'Current'))),
});

// A Breadcrumbs trail in server markup, optionally hydrated by a script that marks the page ready once React has attached.
const crumbItems = [{ id: 'home', label: 'Home', href: '#home' }, { id: 'docs', label: 'Docs', href: '#docs' }, { id: 'now', label: 'Now', href: '#now' }];
const crumbsPage = (scheme, hydrate) => pageShell({
  attributes: `data-muxui-color-scheme="${scheme}" data-muxui-motion="reduced"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: `<div id="root">${renderToString(React.createElement(Breadcrumbs, { 'aria-label': 'Trail', items: crumbItems }))}</div>`,
  entry: hydrate ? '/crumbs-entry.mjs' : undefined,
});
const crumbsEntry = `
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { Breadcrumbs } from '/src/components.ts';

const h = React.createElement;
function Ready() {
  React.useEffect(() => { document.documentElement.setAttribute('data-crumbs-ready', ''); }, []);
  return null;
}
hydrateRoot(document.getElementById('root'), h(React.Fragment, null, h(Breadcrumbs, { 'aria-label': 'Trail', items: ${JSON.stringify(crumbItems)} }), h(Ready)));
`;

// One Button and one Link carrying Button's class, variant and size per variant, hydrated so React Aria writes its states.
const variants = ['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'];
const pairPage = (scheme) => pageShell({
  attributes: `data-muxui-color-scheme="${scheme}" data-muxui-motion="reduced"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div>',
  entry: '/pair-entry.mjs',
});
const pairEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { Link } from '/src/components.ts';

const h = React.createElement;
const label = (text) => h('span', { className: 'muxui-button__label' }, text);
function Pairs() {
  React.useEffect(() => { document.documentElement.setAttribute('data-pairs-ready', ''); }, []);
  return h('div', { style: { display: 'grid', gap: '12px', justifyItems: 'start' } }, ${JSON.stringify(variants)}.map((variant) => h('div', { key: variant, 'data-pair': variant, style: { display: 'flex', gap: '12px' } },
    h(Button, { variant, 'data-role': 'button' }, label('Submit')),
    h(Link, { href: '#' + variant, className: 'muxui-button', 'data-muxui-variant': variant, 'data-muxui-size': 'md', 'data-role': 'link' }, label('Submit')))));
}
createRoot(document.getElementById('root')).render(h(Pairs));
`;

/** The computed properties that make a Button look like one. */
const looks = ['display', 'box-sizing', 'width', 'height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap',
  'border-top-left-radius', 'border-bottom-right-radius', 'border-top-width', 'background-color', 'color', 'font-family', 'font-size',
  'font-weight', 'line-height', 'letter-spacing', 'text-decoration-line', 'text-underline-offset', 'white-space', 'box-shadow',
  'outline-style', 'outline-width', 'outline-color', 'outline-offset', 'cursor'];
const look = (locator) => locator.evaluate((node, names) => {
  const style = getComputedStyle(node);
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
}, looks);

/** A semantic content colour as the page resolves it, so a test writes no colour down. */
const contentToken = (page, role) => page.evaluate((name) => {
  const probe = document.createElement('span');
  probe.style.color = `var(--muxui-semantic-content-${name})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}, role);

for (const engine of browserEngines()) {
  test(`Link inside a disabled GridList item in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs', 'src/button.ts', 'src/components.ts'],
      pages: {
        '/link.html': page,
        '/link-static.html': (requested) => staticPage(requested.searchParams.get('scheme')),
        '/crumbs.html': (requested) => crumbsPage(requested.searchParams.get('scheme'), requested.searchParams.has('hydrate')),
        '/pair.html': (requested) => pairPage(requested.searchParams.get('scheme')),
      },
      modules: { '/link-entry.mjs': entry, '/crumbs-entry.mjs': crumbsEntry, '/pair-entry.mjs': pairEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/link.html`, '[role="grid"] [role="row"]');
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const open = async (layout) => {
        await tab.goto(`${url}/link.html?config=${encodeURIComponent(JSON.stringify({ layout }))}`, { waitUntil: 'load' });
        await tab.locator('[role="grid"] [role="row"]').first().waitFor({ timeout: 15_000 });
        await tab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
        await awaitFontsAndFrames(tab);
        await tab.mouse.move(0, 0);
      };
      const row = (id) => tab.locator(`[role="row"]:has([data-item="${id}"])`);
      const events = () => tab.evaluate(() => window.__events);
      const expectFocus = (expected, message) => pollUntil(tab, (value) => window.__focus() === value, expected, {
        message: `${message}: focus reaches ${expected}`,
        report: () => ({ focus: window.__focus(), active: document.activeElement?.outerHTML.slice(0, 120) }),
      });
      const press = async (keys) => {
        for (const [key, destination] of keys) {
          await tab.keyboard.press(key);
          await expectFocus(destination, `${key} moves focus to ${destination}`);
        }
      };
      // Tab from the control before the grid lands on the first item.
      const enter = async () => {
        await tab.locator('#before').focus();
        await tab.keyboard.press('Tab');
        await expectFocus('a', 'Tab enters the grid on its first item');
      };
      // Pointer presses go to the control's coordinates, since an inert control may take no hit test.
      const clickAt = async (locator) => {
        const box = await locator.boundingBox();
        await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      };
      // Events are ordered, so a press on an enabled control after the one under test proves the earlier press ran nothing.
      const expectEvents = async (expected, message) => {
        await pollUntil(tab, (count) => window.__events.length >= count, expected.length, {
          message,
          report: () => window.__events,
        });
        assert.deepEqual(await events(), expected, message);
      };

      await t.test('the Link in a disabled item is inert and painted like its Button, while enabled items keep an active Link', async () => {
        await open('stack');
        await settleMotion(tab.locator('[role="grid"]'));
        const read = (id) => row(id).evaluate((node) => {
          const link = node.querySelector('.muxui-link');
          const button = node.querySelector('.muxui-button');
          return {
            tag: link.localName,
            ariaDisabled: link.getAttribute('aria-disabled'),
            dataDisabled: link.getAttribute('data-muxui-state-disabled'),
            pointerEvents: getComputedStyle(link).pointerEvents,
            opacity: getComputedStyle(link).opacity,
            buttonOpacity: getComputedStyle(button).opacity,
            buttonDisabled: button.disabled,
          };
        });
        const [enabled, disabled] = [await read('a'), await read('b')];
        assert.deepEqual([enabled.tag, enabled.ariaDisabled, enabled.dataDisabled, enabled.pointerEvents, enabled.opacity], ['a', null, null, 'auto', '1'], 'an enabled item keeps its anchor');
        assert.deepEqual([disabled.tag, disabled.ariaDisabled, disabled.dataDisabled, disabled.pointerEvents, disabled.buttonDisabled], ['span', 'true', 'true', 'none', true], 'a disabled item makes the Link inert like the Button');
        assert.equal(disabled.opacity, disabled.buttonOpacity, 'the Link takes the same disabled paint as the Button');
        assert.ok(Number(disabled.opacity) < 1, `the disabled paint dims the Link (${disabled.opacity})`);
      });

      await t.test('arrow keys skip the disabled item and its Link never takes focus in a vertical stack', async () => {
        await open('stack');
        await enter();
        await press([['ArrowDown', 'c'], ['ArrowUp', 'a'], ['ArrowRight', 'a:a'], ['ArrowRight', 'a:button'], ['ArrowLeft', 'a:a'], ['ArrowLeft', 'a'], ['ArrowDown', 'c'], ['ArrowRight', 'c:a']]);
        await tab.keyboard.press('Enter');
        await expectEvents([['link', 'c']], 'Enter on the last enabled Link runs only that Link');
      });

      await t.test('Tab walks the enabled items\' controls and passes over the disabled item\'s Link in a grid layout', async () => {
        await open('grid');
        await enter();
        await press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Tab', 'after']]);
        await enter();
        await press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Shift+Tab', 'a:a'], ['Shift+Tab', 'a'], ['Shift+Tab', 'before']]);
        assert.deepEqual(await events(), [], 'moving focus never presses a control');
        assert.equal(await row('b').locator('.muxui-link').getAttribute('tabindex'), null, 'the inert Link is no tab stop');
      });

      await t.test('pressing the disabled item\'s Link does nothing and the page does not navigate', async () => {
        await open('stack');
        await clickAt(row('b').locator('.muxui-link'));
        await clickAt(row('b').locator('.muxui-button'));
        await clickAt(row('a').locator('.muxui-link'));
        await expectEvents([['link', 'a']], 'only the enabled Link ran');
        assert.equal(await tab.evaluate(() => location.hash), '#a', 'the disabled Link never navigated');
        assert.equal(await tab.locator('[aria-selected="true"]').count(), 0, 'the disabled item stays unselected');
      });

      await t.test('a server-rendered Link takes the hover colour in light and dark, and a current Link keeps its own', async () => {
        for (const scheme of ['light', 'dark']) {
          await tab.goto(`${url}/link-static.html?scheme=${scheme}`, { waitUntil: 'load' });
          await tab.locator('#plain').waitFor();
          await awaitFontsAndFrames(tab);
          await tab.mouse.move(0, 0);
          const token = (role) => contentToken(tab, role);
          const paint = (id) => tab.locator(id).evaluate((node) => getComputedStyle(node).color);
          const [rest, hover] = [await token('link'), await token('link-hover')];
          assert.notEqual(rest, hover, `${scheme}: the link and hover tokens differ`);

          assert.equal(await paint('#plain'), rest, `${scheme}: a resting Link takes the link colour`);
          await tab.locator('#plain').hover();
          assert.equal(await tab.locator('#plain').getAttribute('data-muxui-state-hovered'), null, `${scheme}: no script has marked the Link hovered`);
          assert.equal(await paint('#plain'), hover, `${scheme}: :hover alone paints the hover colour`);

          await tab.mouse.move(0, 0);
          const current = await paint('#current');
          await tab.locator('#current').hover();
          assert.equal(await paint('#current'), current, `${scheme}: a current Link keeps its colour under the pointer`);
          assert.notEqual(current, hover, `${scheme}: and that colour is not the hover colour`);
        }
      });

      // React Aria ignores touch for hover, so a tap must not leave the hover colour behind; the browser's own :hover can stay matched after it.
      await t.test('a tap on a hydrated Link leaves its resting colour in light and dark', async () => {
        const touch = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US', hasTouch: true });
        try {
          const touchTab = await touch.newPage();
          touchTab.on('pageerror', (error) => errors.push(error.message));
          for (const scheme of ['light', 'dark']) {
            await touchTab.goto(`${url}/link.html?config=${encodeURIComponent(JSON.stringify({ layout: 'stack' }))}`, { waitUntil: 'load' });
            await touchTab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
            await awaitFontsAndFrames(touchTab);
            // Reduced motion makes the colour change at once, so neither the scheme switch nor the tap leaves a transition half-run.
            await touchTab.evaluate((value) => {
              document.documentElement.setAttribute('data-muxui-motion', 'reduced');
              document.documentElement.setAttribute('data-muxui-color-scheme', value);
            }, scheme);
            await awaitFontsAndFrames(touchTab);
            const link = touchTab.locator('[role="row"]:has([data-item="a"]) .muxui-link');
            const paint = () => link.evaluate((node) => getComputedStyle(node).color);
            const rest = await paint();
            await link.tap();
            await awaitFontsAndFrames(touchTab);
            assert.deepEqual(await touchTab.evaluate(() => window.__events), [['link', 'a']], `${scheme}: the tap activated the Link`);
            assert.equal(await link.getAttribute('data-muxui-state-hovered'), null, `${scheme}: React Aria does not hover a Link on touch`);
            assert.equal(await paint(), rest, `${scheme}: the tap leaves the resting colour`);
          }
        } finally {
          await touch.close();
        }
      });

      // The Breadcrumbs link has scheme-scoped resting rules that tie with its hover rules, so each scheme is read.
      await t.test('a Breadcrumbs link takes the hover colour in server markup and once hydrated, and the current item keeps its colour', async () => {
        for (const scheme of ['light', 'dark']) {
          for (const hydrate of [false, true]) {
            const label = `${scheme} ${hydrate ? 'hydrated' : 'server'}`;
            await tab.goto(`${url}/crumbs.html?scheme=${scheme}${hydrate ? '&hydrate' : ''}`, { waitUntil: 'load' });
            await tab.locator('.muxui-breadcrumbs__link').first().waitFor();
            if (hydrate) await tab.locator('html[data-crumbs-ready]').waitFor({ state: 'attached' });
            await awaitFontsAndFrames(tab);
            await tab.mouse.move(0, 0);
            const link = tab.locator('.muxui-breadcrumbs__link').first();
            const current = tab.locator('.muxui-breadcrumbs__current');
            const look = (locator) => locator.evaluate((node) => ({ color: getComputedStyle(node).color, underline: getComputedStyle(node).textDecorationLine }));
            const hover = await contentToken(tab, 'link-hover');
            const rest = await look(link);
            assert.notEqual(rest.color, hover, `${label}: the resting colour is not the hover colour`);

            await link.hover();
            await awaitFontsAndFrames(tab);
            assert.equal(await link.getAttribute('data-muxui-state-hovered'), hydrate ? 'true' : null, `${label}: only hydrated markup is marked hovered`);
            assert.deepEqual(await look(link), { color: hover, underline: 'underline' }, `${label}: hover paints the hover colour and underline`);

            await tab.mouse.move(0, 0);
            const resting = await look(current);
            await current.hover();
            await awaitFontsAndFrames(tab);
            assert.deepEqual(await look(current), resting, `${label}: the current item keeps its colour under the pointer`);
          }
        }
      });

      // As for Link, a tap must not leave the hover colour behind where the browser keeps :hover matched.
      await t.test('a tap on a hydrated Breadcrumbs link leaves its resting colour in light and dark', async () => {
        const touch = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US', hasTouch: true });
        try {
          const touchTab = await touch.newPage();
          touchTab.on('pageerror', (error) => errors.push(error.message));
          for (const scheme of ['light', 'dark']) {
            await touchTab.goto(`${url}/crumbs.html?scheme=${scheme}&hydrate`, { waitUntil: 'load' });
            await touchTab.locator('html[data-crumbs-ready]').waitFor({ state: 'attached' });
            await awaitFontsAndFrames(touchTab);
            const link = touchTab.locator('.muxui-breadcrumbs__link').first();
            const look = () => link.evaluate((node) => ({ color: getComputedStyle(node).color, underline: getComputedStyle(node).textDecorationLine }));
            const rest = await look();
            await link.tap();
            await awaitFontsAndFrames(touchTab);
            assert.equal(await touchTab.evaluate(() => location.hash), '#home', `${scheme}: the tap followed the link`);
            assert.equal(await link.getAttribute('data-muxui-state-hovered'), null, `${scheme}: React Aria does not hover a link on touch`);
            assert.deepEqual(await look(), rest, `${scheme}: the tap leaves the resting colour and no underline`);
          }
        } finally {
          await touch.close();
        }
      });

      await t.test('a Link with Button\'s class computes the same as a Button at rest, hovered, pressed and focused, in both schemes and forced colours', async () => {
        for (const [scheme, forcedColors] of [['light', 'none'], ['dark', 'none'], ['light', 'active']]) {
          await tab.emulateMedia({ forcedColors });
          await tab.goto(`${url}/pair.html?scheme=${scheme}`, { waitUntil: 'load' });
          await tab.locator('html[data-pairs-ready]').waitFor({ state: 'attached' });
          await awaitFontsAndFrames(tab);
          // Keyboard focus, as a Tab gives it, so both :focus-visible and React Aria's focus-visible state apply.
          const keyboardFocus = async (locator) => {
            await locator.focus();
            await tab.keyboard.press('Shift+Tab');
            await tab.keyboard.press('Tab');
            assert.equal(await locator.evaluate((node) => node === document.activeElement), true, 'the control has focus');
          };
          for (const variant of variants) {
            const label = `${variant} ${scheme}${forcedColors === 'active' ? ' forced colours' : ''}`;
            const pair = tab.locator(`[data-pair="${variant}"]`);
            const [button, link] = [pair.locator('[data-role="button"]'), pair.locator('[data-role="link"]')];
            await tab.mouse.move(0, 0);
            assert.equal(await link.evaluate((node) => node.localName), 'a', `${label}: the Link stays an anchor`);
            assert.deepEqual(await look(link), await look(button), `${label} at rest`);

            await button.hover();
            const hovered = await look(button);
            await link.hover();
            assert.deepEqual(await look(link), hovered, `${label} hovered`);

            const pressed = async (locator) => {
              await locator.hover();
              await tab.mouse.down();
              const seen = await look(locator);
              // Let go away from the control, so the press activates nothing.
              await tab.mouse.move(0, 0);
              await tab.mouse.up();
              return seen;
            };
            assert.deepEqual(await pressed(link), await pressed(button), `${label} pressed`);

            await keyboardFocus(button);
            const focused = await look(button);
            await keyboardFocus(link);
            assert.deepEqual(await look(link), focused, `${label} focused`);
            await tab.locator('#before').focus();
          }
        }
        await tab.emulateMedia({ forcedColors: 'none' });
      });

      // A colour scheme change must not run the Link's colour transition, while a hover still does.
      await t.test('a colour scheme change repaints a resting Link at once, and hover still runs its colour transition', async () => {
        await open('stack');
        const link = row('a').locator('.muxui-link');
        const transitions = (change) => link.evaluate((node, which) => {
          if (which === 'dark') document.documentElement.setAttribute('data-muxui-color-scheme', 'dark');
          if (which === 'hover') node.setAttribute('data-muxui-state-hovered', 'true');
          getComputedStyle(node).color;
          const running = node.getAnimations().map((animation) => animation.transitionProperty).filter(Boolean);
          for (const animation of node.getAnimations()) animation.finish();
          if (which === 'hover') node.removeAttribute('data-muxui-state-hovered');
          return running;
        }, change);
        assert.deepEqual(await transitions('dark'), [], 'the scheme change starts no transition on the Link');
        assert.equal(await link.evaluate((node) => getComputedStyle(node).color), await contentToken(tab, 'link'), 'the Link has the dark link colour at once');
        assert.deepEqual(await transitions('hover'), ['color'], 'hovering still transitions the colour');
      });

      assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
      await context.close();
    } finally {
      await browser?.close();
      await close();
    }
  });
}
