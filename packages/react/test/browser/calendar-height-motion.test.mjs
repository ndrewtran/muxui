import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { chromium } from 'playwright-core';
import test from 'node:test';
import { createServer } from 'vite';
import { fixture } from '../fixtures/calendar-height-motion-browser-entry.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

async function chromePath() {
  for (const path of [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await access(path); return path; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Set MUXUI_CHROME_EXECUTABLE for browser verification.');
}

function geometry(page) {
  return page.locator('.muxui-calendar-grid').evaluate((grid) => {
    const body = grid.parentElement;
    const calendar = body.parentElement;
    return {
      body: body.getBoundingClientRect().height,
      grid: grid.getBoundingClientRect().height,
      calendar: calendar.getBoundingClientRect().height,
      popup: calendar.closest('.muxui-date-popover')?.getBoundingClientRect().height,
      height: body.style.height,
      overflow: calendar.style.overflow,
      transform: getComputedStyle(grid).transform,
      rows: grid.querySelectorAll('tbody tr').length,
    };
  });
}

async function settled(page, previous) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (previous) {
    const samples = await page.locator('.muxui-calendar-grid').evaluate(async (grid) => {
      const samples = [];
      while (grid.parentElement.style.height) {
        samples.push(grid.parentElement.getBoundingClientRect().height);
        await new Promise(requestAnimationFrame);
      }
      return samples;
    });
    const target = (await geometry(page)).grid;
    assert.ok(samples.every((height) => height >= Math.min(previous.body, target) - 0.5 && height <= Math.max(previous.body, target) + 0.5), 'spring settles without height overshoot');
  }
  await page.waitForFunction(() => !document.querySelector('.muxui-calendar-grid').parentElement.style.height);
  const result = await geometry(page);
  assert.ok(Math.abs(result.body - result.grid) < 1, `body returns to natural grid height: ${JSON.stringify(result)}`);
  assert.equal(result.overflow, '', 'temporary clipping is removed');
  assert.equal(result.transform, 'none', 'dates are never scaled');
  return result;
}

async function navigate(page, direction) {
  await page.locator(`.muxui-calendar-${direction}`).click();
}

async function inFlight(page, previous, growing) {
  await page.waitForFunction(({ previous, growing }) => {
    const grid = document.querySelector('.muxui-calendar-grid');
    const height = grid.parentElement.getBoundingClientRect().height;
    const target = grid.getBoundingClientRect().height;
    return grid.parentElement.style.height && (growing
      ? height > previous + 1 && height < target - 1
      : height < previous - 1 && height > target + 1);
  }, { previous: previous.body, growing });
  const current = await geometry(page);
  assert.equal(current.overflow, 'clip');
  const change = current.body - previous.body;
  assert.ok(Math.abs((current.calendar - previous.calendar) - change) < 1, 'visible calendar border follows body height');
  if (previous.popup) assert.ok(Math.abs((current.popup - previous.popup) - change) < 1, 'visible popup border follows calendar height');
  return current;
}

test('calendar month height interpolates without changing semantics or reduced motion', { timeout: 120_000 }, async () => {
  const server = await createServer({
    configFile: false, root: repositoryRoot, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'calendar-height-fixture', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const kind = /^\/calendar-height\/(calendar|range|picker|range-picker)$/u.exec(request.url)?.[1];
        if (!kind) return next();
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html data-muxui-motion="full" data-muxui-color-scheme="light"><head><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/packages/react/generated/styles.css"></head><body data-kind="${kind}" style="margin:80px;background:var(--muxui-semantic-surface-canvas)"><div id="root">${renderToString(fixture(kind))}</div><script type="module" src="/packages/react/test/fixtures/calendar-height-motion-browser-entry.mjs"></script></body></html>`);
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ executablePath: await chromePath(), headless: true });
    const url = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (const kind of ['calendar', 'range', 'picker', 'range-picker']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, locale: 'en-US', reducedMotion: 'no-preference' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${url}/calendar-height/${kind}`, { waitUntil: 'networkidle' });
      if (kind === 'range-picker') await page.evaluate(() => { document.body.style.marginTop = '600px'; });
      if (kind.includes('picker')) {
        await page.locator('.muxui-date-trigger').click();
        await page.locator('.muxui-calendar-grid').waitFor();
        await page.waitForFunction(() => document.querySelector('.muxui-date-popover').getAnimations().every((animation) => animation.playState === 'finished'));
        assert.match(await page.locator('.muxui-date-popover').getAttribute('data-placement'), kind === 'range-picker' ? /top/u : /bottom/u);
      }
      const initial = await settled(page);
      assert.equal(initial.rows, 4, `${kind}: February has four rows and no initial height animation`);
      await navigate(page, 'next');
      await inFlight(page, initial, true);
      const march = await settled(page, initial);
      assert.equal(march.rows, 5);
      assert.ok(march.calendar > initial.calendar);
      await navigate(page, 'next');
      assert.equal((await geometry(page)).height, '', 'same-height months do not animate');
      const april = await settled(page);
      await navigate(page, 'next');
      await inFlight(page, april, true);
      const may = await settled(page, april);
      assert.equal(may.rows, 6);
      await navigate(page, 'previous');
      await inFlight(page, may, false);
      await settled(page, may);

      // Redirect an active growth back toward the smaller month.
      await navigate(page, 'next');
      await inFlight(page, april, true);
      const beforeRedirect = await geometry(page);
      await page.locator('.muxui-calendar-previous').evaluate((button) => button.click());
      const redirected = await geometry(page);
      assert.ok(Math.abs(redirected.body - beforeRedirect.body) < 8, 'rapid navigation starts at the visible height');
      await settled(page);
      assert.ok(Math.abs((await geometry(page)).body - april.body) < 1);

      // A nested trigger scope must also reach portaled popup calendars.
      await navigate(page, 'next');
      await inFlight(page, april, true);
      await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
      await page.waitForFunction(() => !document.querySelector('.muxui-calendar-grid').parentElement.style.height, undefined, { timeout: 200 });
      assert.equal((await settled(page)).rows, 6);
      await navigate(page, 'previous');
      assert.equal((await geometry(page)).height, '');
      await page.evaluate(() => document.getElementById('root').removeAttribute('data-muxui-motion'));
      assert.equal((await geometry(page)).height, '', 'restoring motion does not replay height changes');
      await navigate(page, 'next');
      await inFlight(page, april, true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !document.querySelector('.muxui-calendar-grid').parentElement.style.height, undefined, { timeout: 200 });
      await navigate(page, 'previous');
      assert.equal((await geometry(page)).height, '', 'system reduced motion changes height immediately');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => document.getElementById('root').setAttribute('data-reduced-motion', ''));
      await navigate(page, 'next');
      assert.equal((await geometry(page)).height, '', 'legacy reduction is preserved');
      await page.evaluate(() => document.getElementById('root').removeAttribute('data-reduced-motion'));

      for (const theme of ['light', 'dark']) {
        await page.evaluate((theme) => document.documentElement.setAttribute('data-muxui-color-scheme', theme), theme);
        await page.locator('.muxui-calendar, .muxui-range-calendar').screenshot({ path: `/tmp/muxui-calendar-height-${kind}-${theme}.png` });
      }
      await page.locator('.muxui-calendar-next').focus();
      await page.keyboard.press('Enter');
      await settled(page);
      assert.equal(await page.locator('.muxui-calendar-next').evaluate((button) => document.activeElement === button), true, 'keyboard navigation keeps focus');
      if (kind.includes('picker')) {
        await page.keyboard.press('Escape');
        await page.locator('.muxui-date-popover').waitFor({ state: 'detached' });
        assert.equal(await page.locator('.muxui-date-trigger').evaluate((button) => document.activeElement === button), true);
        await page.locator('.muxui-date-trigger').click();
        await page.locator('.muxui-calendar-grid').waitFor();
      }
      await page.locator('.muxui-calendar-previous').evaluate((button) => button.click());
      await page.waitForFunction(() => document.querySelector('.muxui-calendar-grid').parentElement.style.height);
      await page.evaluate(() => {
        window.removedCalendarBody = document.querySelector('.muxui-calendar-grid').parentElement;
        window.unmountCalendar();
      });
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(() => window.removedCalendarBody.style.height), '', 'unmount stops all later height writes');
      assert.deepEqual(errors, [], `${kind}: no hydration, observer, or runtime errors`);
      await page.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
});
