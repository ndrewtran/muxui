import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A Button's icon and label share one cross-axis center and sit one size-recipe
// gap apart, whichever side the icon is on and while pending with visible text.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '/src/button.mjs';

const h = React.createElement;
const icon = () => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
  h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 2 }));
const label = (text) => h('span', null, text);

createRoot(document.getElementById('root')).render(h('div', null, ['sm', 'md', 'lg'].map((size) => h('div', { key: size, 'data-size-row': size },
  h(Button, { id: size + '-leading', size, variant: 'ghost' }, icon(), label('New')),
  h(Button, { id: size + '-trailing', size, variant: 'ghost' }, label('Next'), icon()),
  h(Button, { id: size + '-pending', size, variant: 'ghost', pending: true, showTextWhileLoading: true }, icon(), label('Saving'))))));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px"',
  body: '<div id="root"></div>',
  entry: '/button-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Button centers its icon and label one size gap apart in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/button.mjs'],
      pages: { '/button.html': page },
      modules: { '/button-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await tab.goto(`${url}/button.html`, { waitUntil: 'networkidle' });
      await tab.locator('#lg-pending').waitFor();
      for (const size of ['sm', 'md', 'lg']) {
        for (const kind of ['leading', 'trailing', 'pending']) {
          const m = await tab.locator(`#${size}-${kind}`).evaluate((button) => {
            const content = button.querySelector('.muxui-button-content');
            const box = (node) => node.getBoundingClientRect();
            const [first, second] = [...content.children];
            const [iconBox, labelBox] = first.localName === 'svg' ? [box(first), box(second)] : [box(second), box(first)];
            return {
              gap: parseFloat(getComputedStyle(button).columnGap),
              spacing: iconBox.left > labelBox.left ? iconBox.left - labelBox.right : labelBox.left - iconBox.right,
              offset: (iconBox.top + iconBox.bottom) / 2 - (labelBox.top + labelBox.bottom) / 2,
            };
          });
          const name = `${size} ${kind}`;
          assert.ok(m.gap > 0, `${name}: the size recipe sets a gap`);
          assert.ok(Math.abs(m.offset) < 0.5, `${name}: icon and label centers differ by ${m.offset}px`);
          assert.ok(Math.abs(m.spacing - m.gap) < 0.5, `${name}: icon and label are ${m.spacing}px apart, expected ${m.gap}px`);
        }
      }
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
