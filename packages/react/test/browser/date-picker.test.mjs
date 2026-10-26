import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { launchBrowser, packageRoot, pageShell, startServer } from './harness.mjs';

// The server renders in Kiritimati (UTC+14) and the browser runs in Pago Pago
// (UTC-11), so the two always disagree about today. 12:00 UTC on 15 March 2026
// is 16 and 15 March; 05:00 UTC on 1 May 2026 is 1 May and 30 April, a month
// boundary. The browser clock is fixed, so the expected month never depends on
// the real date.
const MID_MONTH = Date.UTC(2026, 2, 15, 12);
const MONTH_BOUNDARY = Date.UTC(2026, 4, 1, 5);

// The mount effect runs once hydration has committed, so any mismatch is reported first.
const FIXTURE = `function PickerFixture() {
  const h = React.createElement;
  React.useEffect(() => { document.documentElement.dataset.hydrated = 'true'; }, []);
  return h('main', null,
    h(DateField, { label: 'Start' }),
    h(DatePicker, { label: 'Due' }),
    h(DateRangePicker, { label: 'Stay' }));
}`;

// Server rendering runs in a child process so its timezone and clock are fixed
// before any date code loads.
function serverMarkup(fixedTime) {
  const script = `
    Date.now = () => ${fixedTime};
    const React = (await import('react')).default;
    const { renderToString } = await import('react-dom/server');
    const { DateField, DatePicker, DateRangePicker } = await import(${JSON.stringify(resolve(packageRoot, 'src/fields.ts'))});
    ${FIXTURE}
    process.stdout.write(renderToString(React.createElement(PickerFixture)));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: packageRoot, env: { ...process.env, TZ: 'Pacific/Kiritimati' }, encoding: 'utf8' });
}

async function openAtCurrentMonth(fixedTime, { todayLabel, heading, year }) {
  const markup = serverMarkup(fixedTime);
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { DateField, DatePicker, DateRangePicker } from '/src/fields.ts';
    import '/generated/styles.css';
    ${FIXTURE}
    hydrateRoot(document.getElementById('root'), React.createElement(PickerFixture));`;
  const { url, close } = await startServer({
    entries: ['src/fields.ts'],
    pages: { '/date-picker.html': pageShell({ head: '<link rel="stylesheet" href="/generated/styles.css">', body: `<div id="root">${markup}</div>`, entry: '/date-picker-entry.mjs' }) },
    modules: { '/date-picker-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ timezoneId: 'Pacific/Pago_Pago', locale: 'en-US', viewport: { width: 900, height: 900 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(fixedTime);
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text()); });
    await page.goto(`${url}/date-picker.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === 'true');
    await page.locator('.muxui-date-picker .muxui-date-trigger').waitFor();

    // An empty field steps from the current year rather than a fixed one.
    const fieldYear = page.locator('.muxui-date-field [data-muxui-state-type="year"]');
    await fieldYear.focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await fieldYear.textContent(), year, 'an empty DateField year steps from the current year');

    for (const picker of ['date-picker', 'date-range-picker']) {
      await page.locator(`.muxui-${picker} .muxui-date-trigger`).click();
      const popover = page.locator('.muxui-date-popover');
      await popover.waitFor();
      assert.equal(await popover.locator('.muxui-calendar-heading').textContent(), heading, `an empty ${picker} opens at the browser's current month`);
      assert.match(await popover.locator('[data-muxui-state-today]').getAttribute('aria-label'), todayLabel, `${picker} marks the browser's today`);
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'detached' });
    }
    assert.deepEqual(messages, [], messages.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
}

test('empty DatePicker and DateRangePicker open at the current month and hydrate across timezones', { timeout: 90_000 }, () => openAtCurrentMonth(MID_MONTH, {
  todayLabel: /^Today, Sunday, March 15, 2026/u, heading: 'March 2026', year: '2026',
}));

test('empty DatePicker and DateRangePicker open at the browser month across a month boundary', { timeout: 90_000 }, () => openAtCurrentMonth(MONTH_BOUNDARY, {
  todayLabel: /^Today, Thursday, April 30, 2026/u, heading: 'April 2026', year: '2026',
}));
