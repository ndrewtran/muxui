import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { Checkbox } from '../../src/components.ts';
import { CheckboxGroup } from '../../src/fields.ts';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Layout only, so the page is server-rendered and never hydrates.
const six = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const two = six.slice(0, 2);
const long = ['A long option label that cannot fit on one line in a narrow column', 'Short'];

function documentHtml() {
  const h = React.createElement;
  const column = (id, width, labels, props) => h('div', { id, style: { inlineSize: width } },
    h(CheckboxGroup, props, ...labels.map((label) => h(Checkbox, { key: label, value: label.toLowerCase() }, label))));
  const body = renderToString(h('main', null,
    column('labelled', '200px', six, { label: 'Labelled', orientation: 'horizontal' }),
    column('unlabelled', '200px', six, { 'aria-label': 'Unlabelled', orientation: 'horizontal' }),
    column('long-labelled', '200px', long, { label: 'Long labelled' }),
    column('long-unlabelled', '200px', long, { 'aria-label': 'Long unlabelled' }),
    column('fits', '600px', two, { label: 'Fits', orientation: 'horizontal' }),
    column('vertical', '600px', two, { label: 'Vertical' })));
  return pageShell({
    attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
    head: '<link rel="stylesheet" href="/generated/styles.css"><style>main { display: flex; flex-direction: column; gap: 32px; }</style>',
    bodyAttributes: 'style="margin: 16px"',
    body,
  });
}

// The field, the group and each checkbox's box, in document order, relative to its column.
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
      group: box(column.querySelector('.muxui-checkbox-group')),
      boxes: [...column.querySelectorAll('.muxui-checkbox')].map(box),
      indicators: [...column.querySelectorAll('.muxui-checkbox__indicator')].map((node) => node.getBoundingClientRect().width),
    };
  });
}

function assertInside(id, { width, field, group, boxes }) {
  assert.ok(field.right <= width + 0.5, `${id}: the field stays inside its ${width}px container (right edge ${field.right})`);
  assert.ok(group.right <= width + 0.5, `${id}: the group stays inside its ${width}px container (right edge ${group.right})`);
  for (const [index, box] of boxes.entries()) {
    assert.ok(box.right <= width + 0.5, `${id}: checkbox ${index + 1} ends at ${box.right}, past the ${width}px container`);
  }
}

for (const engine of browserEngines()) {
  test(`a CheckboxGroup stays inside a narrow container in ${engine}`, { timeout: 90_000 }, async () => {
    const { url, close } = await startServer({ entries: ['src/components.ts', 'src/fields.ts'], pages: { '/checkbox-group-layout.html': documentHtml } });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
      await page.goto(`${url}/checkbox-group-layout.html`, { waitUntil: 'load' });
      await page.locator('#labelled .muxui-checkbox').first().waitFor();
      await awaitFontsAndFrames(page);

      // Groups that fit keep their content width, rather than stretching to the container.
      const fits = await measure(page, 'fits');
      assert.equal(new Set(fits.boxes.map((box) => Math.round(box.top))).size, 1, 'a horizontal group that fits stays on one row');
      assert.ok(Math.abs(fits.group.right - fits.boxes.at(-1).right) < 0.5, 'a horizontal group that fits is as wide as its options, not its container');
      const vertical = await measure(page, 'vertical');
      const widest = Math.max(...vertical.boxes.map((box) => box.right));
      assert.ok(Math.abs(vertical.group.right - widest) < 0.5, 'a vertical group that fits is as wide as its widest option, not its container');
      const verticalGap = vertical.boxes[1].top - vertical.boxes[0].bottom;

      for (const id of ['labelled', 'unlabelled']) {
        const measured = await measure(page, id);
        assertInside(id, measured);
        const { boxes } = measured;
        const rowStarts = boxes.filter((box, index) => index > 0 && box.top > boxes[index - 1].top + 1);
        assert.ok(rowStarts.length > 0, `${id}: the options wrap onto more than one row`);
        const previousRow = boxes.filter((box) => box.top < rowStarts[0].top - 1);
        const rowGap = rowStarts[0].top - Math.max(...previousRow.map((box) => box.bottom));
        assert.ok(Math.abs(rowGap - verticalGap) < 0.5, `${id}: wrapped rows are ${rowGap}px apart, the ${verticalGap}px a vertical group puts between options`);
      }

      for (const id of ['long-labelled', 'long-unlabelled']) {
        const measured = await measure(page, id);
        assertInside(id, measured);
        const [longBox, shortBox] = measured.boxes;
        assert.ok(longBox.bottom - longBox.top > shortBox.bottom - shortBox.top + 1, `${id}: the long option label wraps onto more than one line`);
        assert.equal(measured.indicators[0], measured.indicators[1], `${id}: the long option keeps a full-size indicator`);
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
