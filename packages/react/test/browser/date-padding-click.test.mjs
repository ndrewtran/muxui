import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// A press in the padding of a date input hits no segment, so React Aria chooses one: the first empty segment of the
// trailing run of empty segments, or the last segment when the last one is filled. It finds the empty ones by reading
// `data-placeholder` off each segment in the DOM (`useDatePickerGroup`), the one closed-list attribute a React Aria hook
// reads. The substrate renames every state to data-muxui-state-<name> but keeps `data-placeholder` on the segments for
// this reason, so a wrapper that drops it sends every press to the last segment. Every date and time family is pressed
// when it is empty (the first segment) and when it is partly filled (the first segment filled, the next one chosen).
// Runs in every engine named by MUXUI_BROWSER_ENGINES.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { DateField, DatePicker, DateRangePicker, TimeField } from '/src/fields.ts';

const h = React.createElement;
createRoot(document.getElementById('root')).render(h('main', { style: { padding: 24, display: 'grid', gap: 24, width: 520 } },
  h(DateField, { label: 'Date' }), h(TimeField, { label: 'Time' }), h(DatePicker, { label: 'Due' }), h(DateRangePicker, { label: 'Stay' })));
document.documentElement.dataset.ready = 'true';
`;

// Each family starts empty, then has its first segment filled (ArrowUp on an empty segment sets it). The segment a press
// should reach is the first of the trailing run of empty ones: the first segment while the field is empty, the second
// once the first is filled. In a range picker the run spans both inputs, so it starts in the start input. Filling a time
// field's hour also fills its AM/PM segment, and a filled last segment takes the press whatever the attributes say, so
// the time field's AM/PM is cleared again (Backspace) to leave the run `minute, AM/PM`.
const controls = [
  { name: 'date-field', empty: 'month', partial: 'day' },
  { name: 'time-field', empty: 'hour', partial: 'minute', clearLast: true },
  { name: 'date-picker', empty: 'month', partial: 'day' },
  { name: 'date-range-picker', empty: 'month', partial: 'day' },
];
const all = controls.map(({ name }) => name);

// Where each engine and pointer lets React Aria's choice stand. Elsewhere the browser's own handling ends with the last
// segment focused whatever the attributes say (a mouse press in WebKit, a tap on a bare date or time field in Chromium),
// so that outcome cannot tell the attribute apart and is not asserted.
const honored = {
  chromium: { mouse: all, touch: ['date-picker', 'date-range-picker'] },
  firefox: { mouse: all, touch: all },
  webkit: { mouse: [], touch: all },
};

for (const engine of browserEngines()) {
  test(`a press in the padding of a date input focuses the first empty trailing segment in ${engine}`, { timeout: 120_000 }, async () => {
    const { url, close } = await startServer({
      entries: ['src/fields.ts'],
      pages: { '/date-padding.html': pageShell({ attributes: 'data-muxui-color-scheme="light"', head: '<link rel="stylesheet" href="/generated/styles.css">', body: '<div id="root"></div>', entry: '/date-padding-entry.mjs' }) },
      modules: { '/date-padding-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      for (const pointer of ['mouse', 'touch']) {
        const context = await browser.newContext({ locale: 'en-US', hasTouch: pointer === 'touch', viewport: { width: 900, height: 900 } });
        const page = await context.newPage();
        const messages = [];
        page.on('pageerror', (error) => messages.push(error.message));
        await page.goto(`${url}/date-padding.html`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
        for (const control of controls) {
          const root = page.locator(`.muxui-${control.name}`);
          const segments = root.locator('.muxui-date-segment:not([data-muxui-state-type="literal"])');
          for (const condition of ['empty', 'partial']) {
            if (condition === 'partial') {
              await segments.first().focus();
              await page.keyboard.press('ArrowUp');
              if (control.clearLast) {
                await segments.last().focus();
                await page.keyboard.press('Backspace');
              }
            }
            await page.evaluate(() => document.activeElement?.blur());
            const input = root.locator('.muxui-date-input').first();
            const box = await input.boundingBox();
            const point = { x: box.x + box.width - 4, y: box.y + box.height / 2 };
            const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, point);
            assert.match(hit, /muxui-date-input\b/u, `${control.name}: the point is in the input's padding, not on a segment`);
            if (pointer === 'mouse') await page.mouse.click(point.x, point.y);
            else await page.touchscreen.tap(point.x, point.y);
            const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-muxui-state-type'));
            const label = `${engine} ${pointer} press in the padding of ${condition === 'empty' ? 'an empty' : 'a partly filled'} ${control.name}`;
            if (honored[engine][pointer].includes(control.name)) assert.equal(focused, control[condition], label);
            else assert.ok(focused, `${label} focuses a segment`);
          }
        }
        assert.deepEqual(messages, [], messages.join('\n'));
        await context.close();
      }
    } finally {
      await browser?.close();
      await close();
    }
  });
}
