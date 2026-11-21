import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Each case renders one Select over short options, one of them disabled. The page cannot scroll, so a popup
// wider than the viewport shows as a page wider than its client area.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { Select } from '/src/collections.mjs';
  import '/generated/styles.css';
  const h = React.createElement;
  const towns = [{ id: 'mel', label: 'Melbourne' }, { id: 'syd', label: 'Sydney', disabled: true }, { id: 'per', label: 'Perth' }];
  const cases = {
    // A trigger far wider than its options, so a popup sized by its options alone shows as narrower than the trigger.
    wide: () => h('div', { style: { width: '600px', padding: '24px' } }, h(Select, { label: 'Town', items: towns })),
    // A trigger that spans the page.
    full: () => h(Select, { label: 'Town', items: towns }),
  };
  const name = new URLSearchParams(location.search).get('case');
  createRoot(document.getElementById('root')).render(h(cases[name]));
  document.documentElement.dataset.ready = name;`;

let server;
before(async () => {
  server = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/select-popup.html': pageShell({ head: '<style>html, body { margin: 0; overflow: hidden; }</style>', body: '<div id="root"></div>', entry: '/select-popup-entry.mjs' }) },
    modules: { '/select-popup-entry.mjs': entry },
  });
});
after(async () => {
  await server?.close();
});

for (const engine of browserEngines()) {
  test(`Select opens its popup at the trigger's width and dims a disabled option in ${engine}`, { timeout: 120_000 }, async (t) => {
    const browser = await launchBrowser(engine);
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    try {
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
      const trigger = page.locator('.muxui-select__trigger');
      const popup = page.locator('.muxui-select__popup');
      const unfilled = 'rgba(0, 0, 0, 0)';
      // Each option's fill and opacity, beside whether React Aria has it focused.
      const options = () => page.locator('.muxui-select__option').evaluateAll((nodes) => nodes.map((node) => {
        const style = getComputedStyle(node);
        return { label: node.textContent, focused: node.hasAttribute('data-muxui-state-focused'), fill: style.backgroundColor, opacity: Number(style.opacity) };
      }));
      // Reduced motion settles the popup and the option fills at once, so they are read at rest.
      const open = async (name, scheme) => {
        await page.goto(`${server.url}/select-popup.html?case=${name}`, { waitUntil: 'load' });
        await page.waitForFunction((expected) => document.documentElement.dataset.ready === expected, name);
        await awaitFontsAndFrames(page);
        await page.evaluate((value) => { Object.assign(document.documentElement.dataset, { muxuiColorScheme: value, muxuiMotion: 'reduced' }); }, scheme);
      };
      // Opens the popup from its trigger: it starts at the trigger's start edge and, its options being short, is as wide as the trigger.
      const openFlush = async (label) => {
        await trigger.click();
        await popup.waitFor();
        await awaitFontsAndFrames(page);
        const [field, list] = await Promise.all([trigger.boundingBox(), popup.boundingBox()]);
        assert.ok(Math.abs(list.x - field.x) < 0.5, `${label}: the popup starts ${list.x - field.x}px from the trigger's start`);
        assert.ok(Math.abs(list.width - field.width) < 0.5, `${label}: a ${list.width}px popup under a ${field.width}px trigger`);
      };

      for (const scheme of ['light', 'dark']) {
        await open('wide', scheme);
        await openFlush(scheme);
        // The disabled option is dimmed and unfilled, so it never looks like the highlighted option; the others keep full opacity.
        const drawn = await options();
        assert.deepEqual(drawn.map(({ label }) => label), ['Melbourne', 'Sydney', 'Perth'], scheme);
        assert.equal(drawn[1].focused, false, scheme);
        assert.equal(drawn[1].fill, unfilled, `${scheme}: the disabled option is unfilled`);
        assert.deepEqual(drawn.map(({ opacity }) => opacity < 1), [false, true, false], `${scheme}: only the disabled option is dimmed`);
        await page.keyboard.press('Escape');
        await popup.waitFor({ state: 'detached' });
      }

      // A trigger that spans the page keeps its popup flush with it too, and the popup does not widen the page.
      await open('full', 'light');
      await openFlush('edge to edge');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the popup does not widen the page');
      await page.keyboard.press('Escape');
      await popup.waitFor({ state: 'detached' });

      // Forced colours paint every option in system colours, so the disabled option keeps full opacity there.
      await page.emulateMedia({ forcedColors: 'active' });
      await open('wide', 'light');
      const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
      await t.test('forced colours leave every option at full opacity', { skip: !forced && `${engine} cannot emulate forced colours` }, async () => {
        await openFlush('forced colours');
        assert.deepEqual((await options()).map(({ opacity }) => opacity), [1, 1, 1], 'forced colours: no option is dimmed');
      });
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await page.close();
      await browser.close();
    }
  });
}
