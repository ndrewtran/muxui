import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Under forced colours a disabled DropZone keeps full opacity and draws its text and dashed edge in GrayText, so it reads
// as disabled beside an enabled one, whose text and edge are not GrayText. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs) that can emulate forced colours.

const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { DropZone } from '/src/overlays.ts';
  import '/generated/styles.css';
  const h = React.createElement;
  document.documentElement.dataset.muxuiColorScheme = new URLSearchParams(location.search).get('scheme');
  createRoot(document.getElementById('root')).render(h('div', null,
    h(DropZone, { 'aria-label': 'Upload' }, 'Drop files here'),
    h(DropZone, { 'aria-label': 'Upload', disabled: true }, 'Drop files here')));
  document.documentElement.dataset.ready = 'true';`;

let server;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.ts'],
    pages: { '/drop-zone.html': pageShell({ body: '<div id="root"></div>', entry: '/drop-zone-entry.mjs' }) },
    modules: { '/drop-zone-entry.mjs': entry },
  });
});

after(async () => {
  await server?.close();
});

for (const engine of browserEngines()) {
  test(`a disabled DropZone takes GrayText at full opacity under forced colours in ${engine}`, { skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
    const browser = await launchBrowser(engine);
    try {
      for (const scheme of ['light', 'dark']) {
        const page = await browser.newPage();
        try {
          await page.emulateMedia({ forcedColors: 'active' });
          await page.goto(`${server.url}/drop-zone.html?scheme=${scheme}`, { waitUntil: 'load' });
          await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && document.querySelectorAll('.muxui-drop-zone').length === 2);
          await awaitFontsAndFrames(page);
          const read = await page.evaluate(() => {
            const probe = document.body.appendChild(document.createElement('span'));
            probe.style.color = 'GrayText';
            const grayText = getComputedStyle(probe).color;
            probe.remove();
            // The enabled zone renders first.
            const zone = (index) => {
              const node = document.querySelectorAll('.muxui-drop-zone')[index];
              const style = getComputedStyle(node);
              return { text: style.color, edge: style.borderTopColor, edgeStyle: style.borderTopStyle, opacity: style.opacity, disabled: node.hasAttribute('data-muxui-state-disabled') };
            };
            return { grayText, enabled: zone(0), disabled: zone(1) };
          });
          assert.equal(read.disabled.disabled, true);
          assert.deepEqual({ text: read.disabled.text, edge: read.disabled.edge, opacity: read.disabled.opacity }, { text: read.grayText, edge: read.grayText, opacity: '1' }, `in ${scheme} the disabled zone is GrayText at full opacity`);
          assert.equal(read.disabled.edgeStyle, 'dashed', 'its edge stays dashed');
          assert.notEqual(read.enabled.text, read.grayText, `in ${scheme} the enabled zone's text is not GrayText`);
          assert.notEqual(read.enabled.edge, read.grayText, `in ${scheme} the enabled zone's edge is not GrayText`);
          assert.equal(read.enabled.opacity, '1');
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });
}
