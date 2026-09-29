import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { TextBrowserFixture } from '../fixtures/text-browser-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

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
  const html = pageShell({ body: `<div id="root">${renderToString(React.createElement(TextBrowserFixture))}</div>`, entry: '/packages/react/test/fixtures/text-browser-entry.mjs' });
  const { url, close } = await startServer({ root: 'repository', entries: ['packages/react/test/fixtures/text-browser-entry.mjs'], pages: { '/text.html': html } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/text.html`, { waitUntil: 'networkidle' });
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
    await close();
  }
});
