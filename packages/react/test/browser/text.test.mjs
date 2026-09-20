import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { TextBrowserFixture } from '../fixtures/text-browser-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));

async function findChrome() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

const typographyContracts = [
  ['display-l', '--muxui-semantic-typography-display-l-font-size', '--muxui-semantic-typography-display-color', '--muxui-semantic-typography-display-font-family'],
  ['heading-m', '--muxui-semantic-typography-heading-m-font-size', '--muxui-semantic-typography-display-color', '--muxui-semantic-typography-heading-font-family'],
  ['title-s', '--muxui-semantic-typography-title-s-font-size', '--muxui-semantic-typography-display-color', '--muxui-semantic-typography-title-font-family'],
  ['label-l', '--muxui-semantic-typography-label-l-font-size', '--muxui-semantic-typography-text-color', '--muxui-semantic-typography-label-font-family'],
  ['label-xs', '--muxui-semantic-typography-label-xs-font-size', '--muxui-semantic-typography-text-color', '--muxui-semantic-typography-label-font-family'],
  ['body-m', '--muxui-semantic-typography-text-m-font-size', '--muxui-semantic-typography-text-color', '--muxui-semantic-typography-text-font-family'],
  ['mono-s', '--muxui-semantic-typography-mono-s-font-size', '--muxui-semantic-typography-mono-color', '--muxui-semantic-typography-mono-font-family'],
  ['expressive-muted', '--muxui-semantic-typography-text-m-font-size', '--muxui-semantic-content-muted', '--muxui-semantic-typography-expressive-font-family'],
];

test('Text preserves native refs and resolves field and collection text-slot IDs in a real browser', { timeout: 90_000 }, async () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,text"></head><body><div id="root">${renderToString(React.createElement(TextBrowserFixture))}</div><script type="module" src="/packages/react/test/fixtures/text-browser-entry.mjs"></script></body></html>`;
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: {
      entries: ['packages/react/test/fixtures/text-browser-entry.mjs'],
      include: ['react', 'react-dom/client', 'react-aria-components'],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'text-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url !== '/text.html') return next();
        response.setHeader('content-type', 'text/html');
        response.end(html);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/text.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.textReady === 'true');
    await page.evaluate(() => document.fonts.ready);

    assert.equal(await page.locator('#native-span').evaluate((node) => node.tagName), 'SPAN');
    assert.equal(await page.locator('#native-heading').evaluate((node) => node.tagName), 'H2');
    assert.equal(await page.locator('#native-heading').getAttribute('class'), 'muxui-text muxui-text--heading-m');
    assert.equal(await page.locator('html').getAttribute('data-text-refs'), 'SPAN:H2');

    const computedTypography = await page.evaluate((contracts) => {
      const resolve = (property, variable) => {
        const probe = document.createElement('span');
        probe.style.setProperty(property, `var(${variable})`);
        document.body.append(probe);
        const value = getComputedStyle(probe).getPropertyValue(property);
        probe.remove();
        return value;
      };
      return Object.fromEntries(contracts.map(([id, sizeVariable, colorVariable, familyVariable]) => {
        const element = document.getElementById(id);
        const style = getComputedStyle(element);
        return [id, {
          fontSize: style.fontSize,
          expectedFontSize: resolve('font-size', sizeVariable),
          color: style.color,
          expectedColor: resolve('color', colorVariable),
          fontFamily: style.fontFamily,
          expectedFontFamily: resolve('font-family', familyVariable),
        }];
      }));
    }, typographyContracts);
    for (const [id, computed] of Object.entries(computedTypography)) {
      assert.equal(computed.fontSize, computed.expectedFontSize, `${id} uses its canonical font-size token`);
      assert.equal(computed.color, computed.expectedColor, `${id} uses its canonical color token`);
      assert.equal(computed.fontFamily, computed.expectedFontFamily, `${id} uses its canonical font-family token`);
    }

    const truncated = await page.locator('#truncated').evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        text: node.textContent,
        display: style.display,
        maxInlineSize: style.maxInlineSize,
        overflow: style.overflow,
        textOverflow: style.textOverflow,
        whiteSpace: style.whiteSpace,
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
      };
    });
    assert.match(truncated.text, /must remain in the DOM/u);
    assert.equal(truncated.display, 'inline-block');
    assert.equal(truncated.maxInlineSize, '100%');
    assert.equal(truncated.overflow, 'hidden');
    assert.equal(truncated.textOverflow, 'ellipsis');
    assert.equal(truncated.whiteSpace, 'nowrap');
    assert.equal(truncated.scrollWidth > truncated.clientWidth, true, 'truncation clips overflowing content');

    const fieldInput = page.locator('#field-input');
    const fieldDescriptionId = await fieldInput.getAttribute('aria-describedby');
    assert.equal(fieldDescriptionId, 'field-description');
    assert.equal(await page.locator(`#${fieldDescriptionId}`).textContent(), 'Use your full name.');

    const collectionItem = page.locator('[data-testid="collection-item"]');
    const labelId = await collectionItem.getAttribute('aria-labelledby');
    const descriptionId = await collectionItem.getAttribute('aria-describedby');
    assert.equal(labelId, 'collection-label');
    assert.equal(descriptionId, 'collection-description');
    assert.equal(await page.locator(`#${labelId}`).textContent(), 'Account');
    assert.equal(await page.locator(`#${descriptionId}`).textContent(), 'Primary workspace account.');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await server.close();
  }
});
