import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, warmUpServer } from './grid-list-probes.mjs';

// The HeaderNav logo link draws the same keyboard focus ring as the NavButtons, taken from the
// focus-ring role rather than the browser's default outline, in light and dark. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HeaderNav } from '/src/supplemental/index.mjs';

const h = React.createElement;
// WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps them focusable.
createRoot(document.getElementById('root')).render(h(React.Fragment, null,
  h('button', { id: 'before', tabIndex: 0 }, 'Before'),
  h(HeaderNav.Root, null,
    h(HeaderNav.Logo, { href: '#home' }, 'Mux'),
    h(HeaderNav.Secondary, null, h(HeaderNav.NavButton, { href: '#docs' }, 'Docs')))));
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"`,
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 24px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/header-nav-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`HeaderNav logo link keyboard focus matches the NavButton ring in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs'],
      pages: { '/header-nav.html': page },
      modules: { '/header-nav-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      for (const scheme of ['light', 'dark']) {
        await t.test(`${scheme}: Tab draws the 2px token ring on the logo link and the NavButton alike`, async () => {
          const tab = await browser.newPage({ viewport: { width: 800, height: 600 }, locale: 'en-US' });
          const errors = [];
          tab.on('pageerror', (error) => errors.push(error.message));
          await tab.goto(`${url}/header-nav.html?scheme=${scheme}`, { waitUntil: 'networkidle' });
          const logo = tab.locator('.muxui-header-nav__logo-link');
          const navButton = tab.locator('.muxui-header-nav__nav-btn');
          await logo.waitFor();

          const read = (locator) => locator.evaluate((node) => {
            const probe = document.createElement('span');
            probe.style.outlineColor = 'var(--muxui-semantic-focus-ring)';
            node.parentElement.append(probe);
            const ring = getComputedStyle(probe).outlineColor;
            probe.remove();
            const style = getComputedStyle(node);
            return {
              focused: node === document.activeElement,
              outlineStyle: style.outlineStyle,
              outlineWidth: style.outlineWidth,
              outlineOffset: style.outlineOffset,
              outlineColor: style.outlineColor,
              ring,
            };
          });

          const resting = await read(logo);
          assert.equal(resting.outlineStyle, 'none', 'a resting logo link draws no ring');

          await tab.locator('#before').focus();
          await tab.keyboard.press('Tab');
          const focusedLogo = await read(logo);
          assert.equal(focusedLogo.focused, true, 'Tab from the control before reaches the logo link');
          assert.equal(focusedLogo.outlineStyle, 'solid', 'the ring is the Mux outline, not the browser default');
          assert.equal(focusedLogo.outlineWidth, '2px');
          assert.equal(focusedLogo.outlineOffset, '2px');
          assert.equal(focusedLogo.outlineColor, focusedLogo.ring, 'the ring takes the focus-ring role');

          await tab.keyboard.press('Tab');
          const focusedNav = await read(navButton);
          assert.equal(focusedNav.focused, true, 'Tab moves on to the NavButton');
          for (const key of ['outlineStyle', 'outlineWidth', 'outlineOffset', 'outlineColor']) {
            assert.equal(focusedLogo[key], focusedNav[key], `the logo link and NavButton share ${key}`);
          }

          // A theme that overrides only the focus ring moves both rings.
          await tab.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-focus-ring', 'rgb(1, 2, 3)'));
          assert.equal((await read(navButton)).outlineColor, 'rgb(1, 2, 3)');
          await tab.keyboard.press('Shift+Tab');
          assert.equal((await read(logo)).outlineColor, 'rgb(1, 2, 3)');
          assert.deepEqual(errors, []);
          await tab.close();
        });
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}

// A header whose links and drawer trigger swap by the width of their frame, as the Responsive HeaderNav example does.
const drawerEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.ts';
import { HeaderNav } from '/src/supplemental/index.mjs';

const h = React.createElement;
const links = [['#docs', 'Docs'], ['#components', 'Components']];
const navigation = links.map(([href, label]) => h(HeaderNav.NavButton, { key: href, href }, label));
const trigger = h('div', { className: 'menu' }, h(HeaderNav.MobileTrigger, null, navigation, h(Button, null, 'Sign in')));
// 'plain-logo': nothing in the header takes focus once the trigger is hidden. 'duplicate': a narrow-only copy of
// the Docs link comes first in the header, then the wide copy the drawer's link should hand focus to.
const header = {
  links: [h(HeaderNav.Logo, { href: '#home' }, 'Mux'), h(HeaderNav.Secondary, { className: 'links' }, navigation), trigger],
  'plain-logo': [h(HeaderNav.Logo, null, 'Mux'), trigger],
  duplicate: [h(HeaderNav.Logo, { href: '#home' }, 'Mux'), h(HeaderNav.Secondary, { className: 'compact' }, h(HeaderNav.NavButton, { href: '#docs' }, 'Docs')), h(HeaderNav.Secondary, { className: 'links' }, navigation), trigger],
}[new URLSearchParams(location.search).get('variant') ?? 'links'];
createRoot(document.getElementById('root')).render(h('div', { id: 'frame', className: 'frame' }, h(HeaderNav.Root, null, ...header)));
`;

const drawerPage = () => pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: `<link rel="stylesheet" href="/generated/styles.css"><style>
    .frame { container-type: inline-size; inline-size: 24rem; }
    .links { display: none; }
    @container (min-width: 40rem) { .links { display: flex; } .compact, .menu { display: none; } }
  </style>`,
  bodyAttributes: 'style="margin: 24px; background: var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/header-nav-drawer-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`HeaderNav closes an open drawer when layout hides its trigger and keeps focus in the header in ${engine}`, { timeout: 180_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/supplemental/index.mjs', 'src/button.ts'],
      pages: { '/header-nav-drawer.html': drawerPage },
      modules: { '/header-nav-drawer-entry.mjs': drawerEntry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/header-nav-drawer.html`, '.muxui-header-nav');
      const open = async (variant = 'links') => {
        const context = await browser.newContext({ viewport: { width: 900, height: 600 }, locale: 'en-US' });
        const tab = await context.newPage();
        const errors = [];
        tab.on('pageerror', (error) => errors.push(error.message));
        await tab.goto(`${url}/header-nav-drawer.html?variant=${variant}`, { waitUntil: 'networkidle' });
        await tab.locator('.muxui-header-nav__mobile-trigger').waitFor();
        const dialog = tab.getByRole('dialog', { name: 'Navigation' });
        await tab.locator('.muxui-header-nav__mobile-trigger').click();
        await dialog.waitFor();
        return { context, tab, dialog, errors };
      };
      const widen = (tab) => tab.evaluate(() => { document.getElementById('frame').style.inlineSize = '48rem'; });
      // What holds focus, and whether it is rendered, so a failure says where focus went.
      const focused = (tab) => tab.evaluate(() => {
        const node = document.activeElement;
        return { tag: node?.tagName, text: node?.textContent?.trim(), body: node === document.body, rendered: Boolean(node && node.getClientRects().length > 0), inHeader: Boolean(node?.closest('.muxui-header-nav')) };
      });
      const settledOn = (tab, text, message) => pollUntil(tab, (expected) => {
        const node = document.activeElement;
        return node !== document.body && node.closest('.muxui-header-nav') !== null && node.getClientRects().length > 0 && node.textContent.trim() === expected;
      }, text, { message, report: () => ({ active: document.activeElement?.outerHTML.slice(0, 100) }) });

      // Widening past the breakpoint with focus on a drawer link moves focus to the matching header link.
      {
        const { context, tab, dialog, errors } = await open();
        try {
          await dialog.getByRole('link', { name: 'Components' }).focus();
          await widen(tab);
          await dialog.waitFor({ state: 'detached', timeout: 5000 });
          await settledOn(tab, 'Components', `${engine}: focus moves to the header's Components link`);
          assert.deepEqual(await tab.evaluate(() => document.querySelector('.muxui-header-nav__secondary').getClientRects().length > 0), true, `${engine}: the header links are the visible ones`);
          // Escape now acts on the header, not the page body.
          await tab.keyboard.press('Escape');
          assert.equal((await focused(tab)).body, false, `${engine}: Escape leaves focus off the body`);
          assert.deepEqual(errors, [], `${engine}: the page logged no errors`);
        } finally {
          await context.close();
        }
      }

      // With focus on the drawer's own controls there is no matching link, so focus goes to the first visible control in the header.
      {
        const { context, tab, dialog } = await open();
        try {
          await dialog.getByRole('button', { name: 'Close navigation' }).focus();
          await widen(tab);
          await dialog.waitFor({ state: 'detached', timeout: 5000 });
          await settledOn(tab, 'Mux', `${engine}: focus falls back to the header's first visible control, the logo link`);
        } finally {
          await context.close();
        }
      }

      // A header with no visible control left once the trigger is hidden still takes focus, on the header itself.
      {
        const { context, tab, dialog } = await open('plain-logo');
        try {
          await dialog.getByRole('link', { name: 'Docs' }).focus();
          await widen(tab);
          await dialog.waitFor({ state: 'detached', timeout: 5000 });
          await pollUntil(tab, () => document.activeElement === document.querySelector('.muxui-header-nav'), undefined, { message: `${engine}: focus falls back to the HeaderNav root when nothing in it is focusable`, report: () => document.activeElement?.outerHTML.slice(0, 100) });
          assert.equal(await tab.evaluate(() => document.activeElement.getAttribute('tabindex')), '-1', `${engine}: the root is focusable by script only`);
          await tab.keyboard.press('Escape');
          assert.equal((await focused(tab)).body, false, `${engine}: Escape leaves focus off the body`);
        } finally {
          await context.close();
        }
      }

      // A hidden header link with the drawer link's destination does not stand in for the visible one.
      {
        const { context, tab, dialog } = await open('duplicate');
        try {
          await dialog.getByRole('link', { name: 'Docs' }).focus();
          await widen(tab);
          await dialog.waitFor({ state: 'detached', timeout: 5000 });
          await pollUntil(tab, () => document.activeElement?.closest('.links') !== null && document.activeElement.textContent === 'Docs' && document.activeElement.getClientRects().length > 0, undefined, { message: `${engine}: focus moves to the visible Docs link, not past the hidden copy to the logo`, report: () => document.activeElement?.outerHTML.slice(0, 100) });
        } finally {
          await context.close();
        }
      }

      // Closing the drawer without a layout change still returns focus to its trigger.
      {
        const { context, tab, dialog } = await open();
        try {
          await tab.keyboard.press('Escape');
          await dialog.waitFor({ state: 'detached', timeout: 5000 });
          await pollUntil(tab, () => document.activeElement === document.querySelector('.muxui-header-nav__mobile-trigger'), undefined, { message: `${engine}: Escape returns focus to the trigger`, report: () => document.activeElement?.outerHTML.slice(0, 100) });
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
