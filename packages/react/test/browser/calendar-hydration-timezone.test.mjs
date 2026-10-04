import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { launchBrowser, packageRoot, pageShell, startServer } from './harness.mjs';

// 12:00 UTC on 15 March 2026 is 16 March in Kiritimati (UTC+14) and 15 March in
// Pago Pago (UTC-11), so the server and the browser always disagree about today.
const FIXED_TIME = Date.UTC(2026, 2, 15, 12);

const FIXTURE = `function TimezoneFixture() {
  const h = React.createElement;
  return h('main', null,
    h('section', { id: 'single' }, h(Calendar, { 'aria-label': 'Date' })),
    h('section', { id: 'range' }, h(RangeCalendar, { 'aria-label': 'Stay' })));
}`;

// Server rendering runs in a child process so its timezone and clock are fixed
// before any date code loads.
function serverMarkup() {
  const script = `
    Date.now = () => ${FIXED_TIME};
    const React = (await import('react')).default;
    const { renderToString } = await import('react-dom/server');
    const { Calendar, RangeCalendar } = await import(${JSON.stringify(resolve(packageRoot, 'src/collections.mjs'))});
    ${FIXTURE}
    process.stdout.write(renderToString(React.createElement(TimezoneFixture)));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: packageRoot, env: { ...process.env, TZ: 'Pacific/Kiritimati' }, encoding: 'utf8' });
}

test('real browser calendars hydrate across timezones without a today mismatch or layout shift', { timeout: 90_000 }, async () => {
  const markup = serverMarkup();
  assert.doesNotMatch(markup, /data-today|Today,/u, 'the server renders no today marker');
  assert.doesNotMatch(markup, /role="button"[^>]*aria-label/u, 'the server renders no day cells');
  // Hydration waits for the test so the server frame can be measured first.
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { Calendar, RangeCalendar } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${FIXTURE}
    await new Promise((resolve) => { window.__hydrate = resolve; });
    hydrateRoot(document.getElementById('root'), React.createElement(TimezoneFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/calendar-timezone.html': pageShell({ head: '<link rel="stylesheet" href="/generated/styles.css">', body: `<div id="root">${markup}</div>`, entry: '/calendar-timezone-entry.mjs' }) },
    modules: { '/calendar-timezone-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ timezoneId: 'Pacific/Pago_Pago', locale: 'en-US', viewport: { width: 900, height: 900 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(FIXED_TIME);
    const messages = [];
    page.on('pageerror', (error) => messages.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text()); });
    await page.goto(`${url}/calendar-timezone.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.__hydrate === 'function');
    const heights = () => page.evaluate(() => ['single', 'range'].map((id) => document.querySelector(`#${id} [class*="calendar"]`).getBoundingClientRect().height));
    const before = await heights();
    await page.evaluate(() => window.__hydrate());
    await page.locator('#range [data-today]').waitFor();

    for (const id of ['single', 'range']) {
      const today = page.locator(`#${id} [data-today]`);
      assert.equal(await today.count(), 1);
      assert.equal(await today.textContent(), '15', `${id} marks the browser's today`);
      assert.match(await today.getAttribute('aria-label'), /^Today, Sunday, March 15, 2026/u);
      assert.equal(await page.locator(`#${id} [data-muxui-calendar-placeholder]`).count(), 0);
    }
    assert.deepEqual(await heights(), before, 'the calendar frames keep their server height');
    assert.deepEqual(messages, [], messages.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
