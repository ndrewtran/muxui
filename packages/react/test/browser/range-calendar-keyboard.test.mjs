import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function RangeKeyboardFixture() {
  const h = React.createElement;
  const [range, setRange] = React.useState(null);
  return h('main', null,
    h(RangeCalendar, { 'aria-label': 'Stay', defaultValue: { start: '2026-03-10', end: '2026-03-10' }, onChange: setRange }),
    h('output', { id: 'range' }, range ? `${range.start}/${range.end}` : ''));
}

test('real browser RangeCalendar selects a start and end date with the keyboard', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { RangeCalendar } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${RangeKeyboardFixture.toString()}
    createRoot(document.getElementById('root')).render(React.createElement(RangeKeyboardFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/range-keyboard.html': pageShell({ body: '<div id="root"></div>', entry: '/range-keyboard-entry.mjs' }) },
    modules: { '/range-keyboard-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/range-keyboard.html`, { waitUntil: 'networkidle' });
    await page.locator('.muxui-range-calendar-cell[tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    // React Aria advances focus one day after a keyboard range start, to 12 March.
    for (let day = 0; day < 3; day += 1) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#range').textContent(), '2026-03-11/2026-03-22');
    const selected = await page.locator('.muxui-range-calendar-cell[data-selected="true"]').allTextContents();
    assert.equal(selected.length, 12);
    assert.equal(selected[0], '11');
    assert.equal(selected.at(-1), '22');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
