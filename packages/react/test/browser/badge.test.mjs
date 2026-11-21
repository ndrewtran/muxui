import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Badge } from '../../src/supplemental/badge.ts';
import { contrastRatio } from '../support/contrast.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Server markup only: a Badge has no client behaviour to hydrate.
const tones = ['neutral', 'brand', 'success', 'warning', 'error'];
const variants = ['soft', 'solid'];
const h = React.createElement;
const body = renderToString(h('main', null,
  h('div', { id: 'tones' }, ...tones.flatMap((tone) => variants.map((variant) => h(Badge, { key: `${tone}-${variant}`, tone, variant, 'data-case': `${tone} ${variant}` }, 'Moderator')))),
  h('button', { id: 'before', type: 'button' }, 'Before'),
  h('a', { id: 'inbox', href: '#inbox' }, 'Inbox ', h(Badge, { tone: 'brand', variant: 'solid', label: '12 unread' }, '12')),
  h('a', { id: 'capped', href: '#capped', 'aria-label': 'Inbox, 120 unread' }, 'Inbox ', h(Badge, { tone: 'brand', variant: 'solid', 'aria-hidden': true }, '99+')),
  h(Badge, { id: 'role', icon: h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true }, h('path', { d: 'M3 8h10' })) }, 'Author'),
  h('button', { id: 'after', type: 'button' }, 'After')));

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body,
});

/**
 * Each badge's text colour and its fill composited over a ground, read back through a canvas so every engine resolves the
 * computed colours (color-mix included) the same way.
 */
const paints = (tab, ground) => tab.evaluate((groundVar) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const probe = document.createElement('div');
  probe.style.background = `var(${groundVar})`;
  document.body.append(probe);
  const groundColor = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const paint = (...colors) => {
    context.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  };
  return [...document.querySelectorAll('#tones .muxui-badge')].map((badge) => {
    const style = getComputedStyle(badge);
    return { name: badge.dataset.case, text: paint(groundColor, style.backgroundColor, style.color), fill: paint(groundColor, style.backgroundColor) };
  });
}, ground);

for (const engine of browserEngines()) {
  test(`Badge is passive, named by its label inside a link, and readable in every tone and scheme in ${engine}`, { timeout: 120_000 }, async (t) => {
    const server = await startServer({ entries: ['src/supplemental/badge.ts'], pages: { '/badge.html': page } });
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 640, height: 480 } });
      await tab.goto(`${server.url}/badge.html`, { waitUntil: 'load' });
      await tab.locator('#after').waitFor();
      await awaitFontsAndFrames(tab);

      // No role and no name of its own: a badge reads as its text.
      assert.equal(await tab.locator('#role').ariaSnapshot(), '- text: Author');
      // No focus stop: Tab goes from the button before to the two links, then to the button after.
      await tab.locator('#before').focus();
      const stops = [];
      for (let step = 0; step < 3; step += 1) {
        await tab.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
        stops.push(await tab.evaluate(() => document.activeElement.id));
      }
      assert.deepEqual(stops, ['inbox', 'capped', 'after']);

      // A count's label becomes part of the link's name in place of the bare number; a hidden badge leaves the link's own name.
      assert.equal(await tab.getByRole('link', { name: 'Inbox 12 unread', exact: true }).count(), 1);
      assert.equal(await tab.getByRole('link', { name: 'Inbox, 120 unread', exact: true }).count(), 1);
      assert.equal(await tab.locator('#inbox .muxui-badge__text').getAttribute('aria-hidden'), 'true');

      // Every tone and variant keeps its text at 4.5:1 on its fill, over the page and the raised surface, in both schemes.
      const shortfalls = [];
      for (const scheme of ['light', 'dark']) {
        await tab.evaluate((value) => document.documentElement.setAttribute('data-muxui-color-scheme', value), scheme);
        for (const ground of ['--muxui-semantic-surface-canvas', '--muxui-semantic-surface-background']) {
          for (const { name, text, fill } of await paints(tab, ground)) {
            const ratio = contrastRatio(text, fill);
            if (ratio < 4.5) shortfalls.push(`${scheme} ${ground} ${name}: ${ratio.toFixed(2)}`);
          }
        }
      }
      assert.deepEqual(shortfalls, []);

      // Forced colours: the fill is gone, so the badge keeps a CanvasText edge and CanvasText text.
      if (engine === 'chromium') {
        await tab.emulateMedia({ forcedColors: 'active' });
        const forced = await tab.locator('#tones .muxui-badge').evaluateAll((nodes) => nodes.map((node) => {
          const style = getComputedStyle(node);
          return [style.borderTopStyle, style.borderTopColor === style.color];
        }));
        assert.ok(forced.every(([style, same]) => style === 'solid' && same), JSON.stringify(forced));
        await tab.emulateMedia({ forcedColors: 'none' });
      } else {
        t.diagnostic(`skipped in ${engine}: forced colours are emulated in Chromium only`);
      }
    } finally {
      await browser.close();
      await server.close();
    }
  });
}
