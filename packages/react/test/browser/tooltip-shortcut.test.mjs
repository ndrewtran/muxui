import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Tooltip.Shortcut draws key caps after a tooltip's text that assistive technology never reads, as Menu.Shortcut does:
// the trigger keeps the aria-keyshortcuts it was given through the Tooltip's trigger wrapping, for a native button and a
// Mux button, and its description is the text alone. The caps read on the tooltip's inverted surface in the light and
// dark schemes, and under forced colours they are outlined in the tooltip's system text colour. Runs in every engine
// named by MUXUI_BROWSER_ENGINES (see harness.mjs); the accessibility tree is read in Chromium only and forced colours
// are not emulated in WebKit, so those cases say so in the others.

const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Tooltip } from '/src/overlays.ts';
  import { Button } from '/src/button.ts';
  import '/generated/styles.css';
  const h = React.createElement;
  const params = new URLSearchParams(location.search);
  document.documentElement.dataset.muxuiColorScheme = params.get('scheme') ?? 'light';
  const content = (key) => ['Make the selection bold', h(Tooltip.Shortcut, { key: 'shortcut', keys: ['Ctrl', key] })];
  createRoot(document.getElementById('root')).render(h('div', { style: { display: 'flex', gap: 24, padding: 80 } },
    h(Tooltip, { delay: 0, content: content('B'), trigger: h('button', { id: 'native', 'aria-keyshortcuts': 'Control+B' }, 'Bold') }),
    h(Tooltip, { delay: 0, content: content('I'), trigger: h(Button, { id: 'mux', 'aria-keyshortcuts': 'Control+I' }, 'Italic') }),
    h(Tooltip, { delay: 0, content: ['Repeat', h(Tooltip.Shortcut, { key: 'shortcut', keys: ['G', 'G'] })], trigger: h('button', { id: 'repeat' }, 'Go') })));
  document.documentElement.dataset.ready = 'true';`;

let server;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.ts'],
    pages: { '/tooltip-shortcut.html': pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="reduced"', bodyAttributes: 'style="margin: 0; background: var(--muxui-semantic-surface-canvas)"', body: '<div id="root"></div>', entry: '/tooltip-shortcut-entry.mjs' }) },
    modules: { '/tooltip-shortcut-entry.mjs': entry },
  });
});

after(async () => {
  await server?.close();
});

async function open(browser, scheme, { forcedColors } = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  if (forcedColors) await page.emulateMedia({ forcedColors: 'active' });
  await page.goto(`${server.url}/tooltip-shortcut.html?scheme=${scheme}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await awaitFontsAndFrames(page);
  return { page, errors };
}

// Opens the tooltip of a trigger by keyboard focus, as a keyboard user does.
async function showTooltip(page, id) {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Tab');
  while (await page.evaluate(() => document.activeElement?.id) !== id) await page.keyboard.press('Tab');
  const tooltip = page.locator('.muxui-tooltip');
  await tooltip.waitFor();
  await awaitFontsAndFrames(page);
  return tooltip;
}

// WCAG 2 contrast ratio between two colours painted over a surface, each resolved to sRGB through a canvas, so a
// translucent fill reads over the surface below it.
const contrast = (page, surface, first, second) => page.evaluate(([under, a, b]) => {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const luminance = (color) => {
    context.clearRect(0, 0, 1, 1);
    for (const layer of [under, color]) {
      context.fillStyle = layer;
      context.fillRect(0, 0, 1, 1);
    }
    const [r, g, bl] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}, [surface, first, second]);

for (const engine of browserEngines()) {
  test(`Tooltip.Shortcut draws decorative key caps and leaves the shortcut on the trigger in ${engine}`, { timeout: 120_000 }, async (t) => {
    const browser = await launchBrowser(engine);
    try {
      for (const scheme of ['light', 'dark']) {
        await t.test(`the caps are hidden from assistive technology and read on the tooltip in the ${scheme} scheme`, async () => {
          const { page, errors } = await open(browser, scheme);
          try {
            for (const [id, key] of [['native', 'Control+B'], ['mux', 'Control+I']]) {
              assert.equal(await page.locator(`#${id}`).getAttribute('aria-keyshortcuts'), key, `the ${id} trigger keeps its shortcut through the Tooltip`);
              const tooltip = await showTooltip(page, id);
              const shortcut = tooltip.locator('.muxui-tooltip__shortcut');
              assert.equal(await shortcut.getAttribute('aria-hidden'), 'true', 'the caps are hidden from assistive technology');
              assert.deepEqual(await shortcut.locator('kbd.muxui-tooltip__shortcut-key').allTextContents(), ['Ctrl', key.at(-1)]);
              const paint = await tooltip.evaluate((node) => {
                const cap = node.querySelector('.muxui-tooltip__shortcut-key');
                const text = [...node.querySelectorAll('.muxui-tooltip__scope')].at(0)?.firstChild;
                const range = document.createRange();
                range.selectNodeContents(text);
                const capBox = cap.getBoundingClientRect();
                const box = node.getBoundingClientRect();
                return {
                  surface: getComputedStyle(node).backgroundColor,
                  fill: getComputedStyle(cap).backgroundColor,
                  ink: getComputedStyle(cap).color,
                  gap: capBox.left - range.getBoundingClientRect().right,
                  inside: capBox.left >= box.left && capBox.right <= box.right && capBox.top >= box.top && capBox.bottom <= box.bottom,
                };
              });
              assert.ok(paint.gap > 0, `the caps clear the text by ${paint.gap}px`);
              assert.equal(paint.inside, true, 'the caps sit inside the tooltip');
              assert.notEqual(paint.fill, paint.surface, 'each cap is filled apart from the tooltip surface');
              // The key's ink paints over its fill, which paints over the tooltip.
              const ratio = await page.evaluate(([surface, fill]) => {
                const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
                for (const layer of [surface, fill]) {
                  context.fillStyle = layer;
                  context.fillRect(0, 0, 1, 1);
                }
                const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
                return `rgb(${r}, ${g}, ${b})`;
              }, [paint.surface, paint.fill]).then((capFill) => contrast(page, capFill, paint.ink, capFill));
              assert.ok(ratio >= 4.5, `a cap's key reads on its fill at ${ratio.toFixed(2)}:1 (${paint.ink} on ${paint.fill} over ${paint.surface})`);
            }
            // A key may repeat.
            const repeated = await showTooltip(page, 'repeat');
            assert.deepEqual(await repeated.locator('kbd').allTextContents(), ['G', 'G']);
            assert.deepEqual(errors, [], errors.join('\n'));
          } finally {
            await page.close();
          }
        });
      }

      await t.test('the trigger\'s description is the tooltip text without the caps', { skip: engine !== 'chromium' && 'the accessibility tree is read through Chromium\'s DevTools protocol' }, async () => {
        const { page, errors } = await open(browser, 'light');
        try {
          const session = await page.context().newCDPSession(page);
          for (const id of ['native', 'mux']) {
            await showTooltip(page, id);
            const { nodes } = await session.send('Accessibility.getFullAXTree');
            const { node } = await session.send('DOM.describeNode', { objectId: (await session.send('Runtime.evaluate', { expression: `document.getElementById('${id}')` })).result.objectId });
            const button = nodes.find((candidate) => candidate.backendDOMNodeId === node.backendNodeId);
            const description = button?.description?.value ?? '';
            assert.equal(description.trim(), 'Make the selection bold', `the ${id} trigger is described by the text alone`);
            const keyshortcuts = button?.properties?.find((property) => property.name === 'keyshortcuts')?.value.value;
            assert.equal(keyshortcuts, id === 'native' ? 'Control+B' : 'Control+I', 'the trigger exposes its shortcut');
          }
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });

      await t.test('under forced colours the caps are outlined in the tooltip\'s text colour', { skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
        const { page, errors } = await open(browser, 'light', { forcedColors: true });
        try {
          const tooltip = await showTooltip(page, 'native');
          const paint = await tooltip.evaluate((node) => {
            const cap = getComputedStyle(node.querySelector('.muxui-tooltip__shortcut-key'));
            return { tooltip: getComputedStyle(node).color, ink: cap.color, outline: cap.outlineColor, style: cap.outlineStyle };
          });
          assert.equal(paint.ink, paint.tooltip, 'the keys take the tooltip\'s system text colour');
          assert.equal(paint.outline, paint.tooltip, 'and are outlined in it');
          assert.equal(paint.style, 'solid');
          assert.deepEqual(errors, [], errors.join('\n'));
        } finally {
          await page.close();
        }
      });
    } finally {
      await browser.close();
    }
  });
}
