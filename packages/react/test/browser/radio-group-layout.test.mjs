import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { RadioGroup } from '../../src/collections.mjs';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Layout only, so the page is server-rendered and never hydrates.
const six = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((label) => ({ value: label.toLowerCase(), label }));
const two = six.slice(0, 2);
const long = ['A long option label that cannot fit on one line in a narrow column', 'Short'].map((label) => ({ value: label.toLowerCase(), label }));

function documentHtml() {
  const h = React.createElement;
  const column = (id, width, props) => h('div', { id, style: { inlineSize: width } }, h(RadioGroup, { defaultValue: 'one', ...props }));
  const body = renderToString(h('main', null,
    column('labelled', '200px', { label: 'Labelled', orientation: 'horizontal', options: six }),
    column('unlabelled', '200px', { 'aria-label': 'Unlabelled', orientation: 'horizontal', options: six }),
    column('fits', '600px', { label: 'Fits', orientation: 'horizontal', options: two }),
    column('invalid', '600px', { label: 'Invalid', orientation: 'horizontal', options: two, invalid: true, errorMessage: 'Pick one' }),
    column('vertical', '200px', { label: 'Vertical', options: two }),
    column('long-labelled', '200px', { label: 'Long labelled', options: long }),
    column('long-unlabelled', '200px', { 'aria-label': 'Long unlabelled', options: long })));
  return pageShell({
    attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
    head: '<link rel="stylesheet" href="/generated/styles.css"><style>main { display: flex; flex-direction: column; gap: 32px; }</style>',
    bodyAttributes: 'style="margin: 16px"',
    body,
  });
}

// Each radio's box, in document order, relative to its column.
function measure(page, id) {
  return page.locator(`#${id}`).evaluate((column) => {
    const origin = column.getBoundingClientRect();
    const box = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left - origin.left, right: rect.right - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top };
    };
    return {
      width: origin.width,
      field: box(column.firstElementChild),
      radios: [...column.querySelectorAll('.muxui-radio-group__radio')].map(box),
      error: column.querySelector('.muxui-radio-group__error') && box(column.querySelector('.muxui-radio-group__error')),
      indicators: [...column.querySelectorAll('.muxui-radio-group__indicator')].map((node) => node.getBoundingClientRect().width),
    };
  });
}

for (const engine of browserEngines()) {
  test(`a RadioGroup stays inside a narrow container in ${engine}`, { timeout: 90_000 }, async () => {
    const { url, close } = await startServer({ entries: ['src/collections.mjs'], pages: { '/radio-group-layout.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
      await page.goto(`${url}/radio-group-layout.html`, { waitUntil: 'load' });
      await page.locator('#labelled .muxui-radio-group__radio').first().waitFor();
      await awaitFontsAndFrames(page);

      // A group that fits keeps one row and its content width, rather than stretching to the container.
      const fits = await measure(page, 'fits');
      assert.equal(new Set(fits.radios.map((radio) => Math.round(radio.top))).size, 1, 'a group that fits stays on one row');
      assert.ok(Math.abs(fits.field.right - fits.radios.at(-1).right) < 0.5, 'a group that fits is as wide as its options, not its container');
      // Its error keeps the distance below the options that it has always had, the gap between two options.
      const invalid = await measure(page, 'invalid');
      assert.ok(invalid.error && invalid.error.bottom > invalid.error.top, 'the invalid group shows its error');
      const columnGap = invalid.radios[1].left - invalid.radios[0].right;
      const errorGap = invalid.error.top - invalid.radios[0].bottom;
      assert.ok(Math.abs(errorGap - columnGap) < 0.5, `the error sits ${errorGap}px below a one-row group, not the ${columnGap}px gap between its options`);

      const vertical = await measure(page, 'vertical');
      const verticalGap = vertical.radios[1].top - vertical.radios[0].bottom;

      for (const id of ['labelled', 'unlabelled']) {
        const { width, field, radios } = await measure(page, id);
        assert.ok(field.right <= width + 0.5, `${id}: the group stays inside its ${width}px container (right edge ${field.right})`);
        for (const [index, radio] of radios.entries()) {
          assert.ok(radio.right <= width + 0.5, `${id}: radio ${index + 1} ends at ${radio.right}, past the ${width}px container`);
        }
        const rowStarts = radios.filter((radio, index) => index > 0 && radio.top > radios[index - 1].top + 1);
        assert.ok(rowStarts.length > 0, `${id}: the options wrap onto more than one row`);
        const previousRow = radios.filter((radio) => radio.top < rowStarts[0].top - 1);
        const rowGap = rowStarts[0].top - Math.max(...previousRow.map((radio) => radio.bottom));
        assert.ok(Math.abs(rowGap - verticalGap) < 0.5, `${id}: wrapped rows are ${rowGap}px apart, the ${verticalGap}px a vertical group puts between options`);
      }

      // A vertical group's long option label wraps inside the container.
      for (const id of ['long-labelled', 'long-unlabelled']) {
        const { width, field, radios, indicators } = await measure(page, id);
        assert.ok(field.right <= width + 0.5, `${id}: the group stays inside its ${width}px container (right edge ${field.right})`);
        for (const [index, radio] of radios.entries()) {
          assert.ok(radio.right <= width + 0.5, `${id}: radio ${index + 1} ends at ${radio.right}, past the ${width}px container`);
        }
        const [longRadio, shortRadio] = radios;
        assert.ok(longRadio.bottom - longRadio.top > shortRadio.bottom - shortRadio.top + 1, `${id}: the long option label wraps onto more than one line`);
        assert.equal(indicators[0], indicators[1], `${id}: the long option keeps a full-size indicator`);
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
