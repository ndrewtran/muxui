import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

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
