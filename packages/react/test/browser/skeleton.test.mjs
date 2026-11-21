import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Skeleton } from '../../src/supplemental/skeleton.ts';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// The page's tree, rendered on the server here and hydrated in the page from the same function's source.
function tree(h, Skeleton) {
  const comment = (id, label) => h(Skeleton.Root, { id, label, style: { display: 'flex', gap: '16px', inlineSize: '320px', padding: '8px' } },
    h(Skeleton.Circle, { size: 'md' }),
    h('div', { style: { flex: 1, minInlineSize: 0 } },
      h(Skeleton.Line, { width: '40%' }),
      h(Skeleton.Line),
      h(Skeleton.Line, { width: '72%' })));
  return h('main', null,
    comment('group', 'Loading comment'),
    h('div', { id: 'scoped', 'data-muxui-motion': 'reduced' }, comment('scoped-group', 'Loading reply')),
    // Plain block flow, so nothing stretches the placeholder to the text's height.
    // The lines sit in the element that will hold the text, as the guide says, and take its type.
    h('div', { id: 'lines', style: { inlineSize: '320px' } },
      h(Skeleton.Root, { id: 'placeholder' }, h('div', { style: { fontSize: '20px', lineHeight: '30px' } }, h(Skeleton.Line), h(Skeleton.Line))),
      h('div', { id: 'text', style: { fontSize: '20px', lineHeight: '30px' } }, h('div', null, 'One line'), h('div', null, 'Two lines')),
      h(Skeleton.Root, { id: 'heading-placeholder' }, h('h2', { style: { margin: 0, fontSize: '24px', lineHeight: '32px' } }, h(Skeleton.Line, { width: '60%' }))),
      h('h2', { id: 'heading', style: { margin: 0, fontSize: '24px', lineHeight: '32px' } }, 'Title')),
    h('div', { id: 'rtl', dir: 'rtl' }, h(Skeleton.Root, { id: 'rtl-group' }, h(Skeleton.Line))),
    h('div', { id: 'media', style: { inlineSize: '320px' } },
      h(Skeleton.Root, { id: 'media-group' }, h(Skeleton.Block, { aspectRatio: '2 / 1' }), h(Skeleton.Block, { height: 40 }))));
}

const entry = `
import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Skeleton } from '/src/supplemental/skeleton.ts';
const tree = ${tree.toString()};
let root;
flushSync(() => { root = hydrateRoot(document.querySelector('#root'), tree(React.createElement, Skeleton), { onRecoverableError: (error) => console.error(String(error)) }); });
window.unmount = () => flushSync(() => root.unmount());
document.documentElement.dataset.ready = 'true';
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body: `<div id="root">${renderToString(tree(React.createElement, Skeleton))}</div>`,
  entry: '/skeleton-entry.mjs',
});

/** The band's animations in a group: what each animates and how long one pass takes. */
const sweepOf = (page, id) => page.locator(`#${id}`).evaluate((group) => group.getAnimations({ subtree: true }).map((animation) => ({
  target: animation.effect.target.className,
  properties: [...new Set(animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame).filter((key) => !['offset', 'computedOffset', 'easing', 'composite'].includes(key))))],
  iterations: animation.effect.getTiming().iterations,
})));

/** The colour of one screenshot pixel, read back through a canvas so every engine decodes it the same way. */
async function pixels(page, points) {
  const shot = await page.screenshot({ type: 'png' });
  return page.evaluate(async ({ data, points: at }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const scale = image.naturalWidth / window.innerWidth;
    return at.map(({ x, y }) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data.slice(0, 3)]);
  }, { data: shot.toString('base64'), points });
}

for (const engine of browserEngines()) {
  test(`Skeleton is one loading status with one transform sweep clipped to its shapes in ${engine}`, { timeout: 120_000 }, async (t) => {
    const server = await startServer({ entries: ['src/supplemental/skeleton.ts'], pages: { '/skeleton.html': page }, modules: { '/skeleton-entry.mjs': entry } });
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 480, height: 640 } });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await tab.goto(`${server.url}/skeleton.html`, { waitUntil: 'load' });
      await tab.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await awaitFontsAndFrames(tab);
      await tab.waitForFunction(() => document.querySelector('#group .muxui-skeleton__sweep'));

      // One status, named by its label, and nothing else: the shapes are hidden.
      assert.equal(await tab.locator('#group').ariaSnapshot(), '- status: Loading comment');
      assert.equal(await tab.locator('#placeholder').ariaSnapshot(), '- status: Loading');

      // One infinite animation for the whole group, of transform alone, on its one band.
      assert.deepEqual(await sweepOf(tab, 'group'), [{ target: 'muxui-skeleton__band', properties: ['transform'], iterations: Infinity }]);
      assert.equal(await tab.locator('#group .muxui-skeleton__band').count(), 1);
      // Right to left, the band crosses from the right.
      const names = await tab.evaluate(() => ['#group', '#rtl-group'].map((selector) => getComputedStyle(document.querySelector(`${selector} .muxui-skeleton__band`)).animationName));
      assert.deepEqual(names, ['muxui-skeleton-sweep', 'muxui-skeleton-sweep-rtl']);

      // A line holds the height of the line of text it stands for, so the text replaces it in place.
      const heights = await tab.evaluate(() => ['#placeholder', '#text', '#heading-placeholder', '#heading'].map((selector) => document.querySelector(selector).getBoundingClientRect().height));
      assert.deepEqual(heights, [60, 60, 32, 32], 'two stacked lines hold two lines of text, and a line in a heading holds its line');
      const blocks = await tab.locator('#media-group .muxui-skeleton__block').evaluateAll((nodes) => nodes.map((node) => [node.offsetWidth, node.offsetHeight]));
      assert.deepEqual(blocks, [[320, 160], [320, 40]]);

      // The clip: with the band painted solid across the whole group, only the shapes show it; the gaps stay the ground.
      const geometry = await tab.evaluate(() => {
        const rect = (node) => node.getBoundingClientRect();
        const [circle, first, second] = ['.muxui-skeleton__circle', '.muxui-skeleton__line .muxui-skeleton__bar', '.muxui-skeleton__line:nth-child(2) .muxui-skeleton__bar'].map((selector) => rect(document.querySelector(`#group ${selector}`)));
        return {
          inside: [{ x: circle.left + circle.width / 2, y: circle.top + circle.height / 2 }, { x: first.left + 4, y: first.top + first.height / 2 }],
          outside: [{ x: circle.right + 8, y: circle.top + 2 }, { x: first.left + 4, y: (first.bottom + second.top) / 2 }, { x: first.right + 8, y: first.top + first.height / 2 }],
        };
      });
      await tab.addStyleTag({ content: '#group .muxui-skeleton__band { animation: none !important; transform: none !important; inline-size: 100% !important; background: rgb(255, 0, 0) !important; }' });
      await awaitFontsAndFrames(tab);
      const red = ([r, g, b]) => r > 200 && g < 60 && b < 60;
      const [inside, outside] = [await pixels(tab, geometry.inside), await pixels(tab, geometry.outside)];
      assert.ok(inside.every(red), `a point in a shape shows the band: ${JSON.stringify(inside)}`);
      assert.ok(!outside.some(red), `a point between shapes never shows it: ${JSON.stringify(outside)}`);

      // Both schemes paint the shapes, and each scheme has its own band.
      const bands = {};
      for (const scheme of ['light', 'dark']) {
        await tab.evaluate((value) => document.documentElement.setAttribute('data-muxui-color-scheme', value), scheme);
        const fill = await tab.locator('#placeholder .muxui-skeleton__bar').first().evaluate((node) => getComputedStyle(node).backgroundColor);
        assert.notEqual(fill, 'rgba(0, 0, 0, 0)', `${scheme}: the line's bar has a fill`);
        bands[scheme] = await tab.locator('#placeholder .muxui-skeleton__band').evaluate((node) => getComputedStyle(node).backgroundImage);
      }

      assert.notEqual(bands.light, bands.dark, 'the band follows the scheme');

      // Reduced motion, from a scope or from the system setting: no band and no animation.
      assert.equal(await tab.locator('#scoped-group .muxui-skeleton__sweep').evaluate((node) => getComputedStyle(node).display), 'none');
      assert.deepEqual(await sweepOf(tab, 'scoped-group'), []);
      await tab.emulateMedia({ reducedMotion: 'reduce' });
      assert.deepEqual(await sweepOf(tab, 'placeholder'), []);
      await tab.emulateMedia({ reducedMotion: 'no-preference' });
      assert.equal((await sweepOf(tab, 'placeholder')).length, 1);

      // Forced colours: each shape keeps its box as a GrayText outline, and there is no band.
      if (engine === 'chromium') {
        await tab.emulateMedia({ forcedColors: 'active' });
        const forced = await tab.locator('#placeholder .muxui-skeleton__bar').first().evaluate((node) => getComputedStyle(node).outlineStyle);
        assert.equal(forced, 'solid');
        assert.deepEqual(await sweepOf(tab, 'placeholder'), []);
        await tab.emulateMedia({ forcedColors: 'none' });
      } else {
        t.diagnostic(`skipped in ${engine}: forced colours are emulated in Chromium only`);
      }

      // The sweep ends with the group.
      await tab.evaluate(() => window.unmount());
      assert.equal(await tab.evaluate(() => document.getAnimations().length), 0);
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser.close();
      await server.close();
    }
  });
}
