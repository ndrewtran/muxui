import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ProgressCircleConsumerFixture } from '../fixtures/progress-circle-consumer-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

test('ProgressCircle consumer fixture hydrates with native refs, states, dimensions, and motion policies', { timeout: 90_000 }, async () => {
  const html = pageShell({ body: `<div id="root">${renderToString(React.createElement(ProgressCircleConsumerFixture))}</div>`, entry: '/packages/react/test/fixtures/progress-circle-browser-entry.mjs' });
  const { url, close } = await startServer({ root: 'repository', entries: ['packages/react/test/fixtures/progress-circle-browser-entry.mjs'], pages: { '/progress-circle.html': html } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/progress-circle.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.progressCircleReady === 'DIV:progressbar');

    const tab = page.locator('#tab-loading [role="progressbar"]');
    const session = page.locator('#session-import [role="progressbar"]');
    assert.equal(await page.locator('[role="progressbar"]').count(), 2);
    assert.equal(await tab.getAttribute('aria-label'), 'Loading tab');
    assert.equal(await tab.getAttribute('aria-valuenow'), null);
    assert.equal(await tab.getAttribute('aria-valuetext'), null);
    assert.equal(await tab.getAttribute('data-indeterminate'), '');
    assert.equal(await session.getAttribute('aria-valuenow'), '65');
    assert.equal(await session.getAttribute('aria-valuetext'), '65%');
    assert.equal(await page.locator('#decorative-action [role="progressbar"]').count(), 0);
    assert.equal(await page.locator('#decorative-track-wrapper svg').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('#decorative-track-wrapper .muxui-progress-circle__indicator').getAttribute('data-indeterminate'), '');
    assert.deepEqual(await page.locator('#decorative-track-wrapper .muxui-progress-circle__indicator').evaluate((node) => {
      const style = getComputedStyle(node);
      return { animation: style.animationName, dasharray: style.strokeDasharray.replaceAll(',', ' ').replace(/\s+/gu, ' ').trim() };
    }), { animation: 'none', dasharray: '28px 72px' });

    const dimensions = await page.evaluate(() => Object.fromEntries(
      ['tab-loading', 'session-import'].map((id) => {
        const track = document.querySelector(`#${id} svg`);
        const style = track ? getComputedStyle(track) : null;
        return [id, { width: style?.width, height: style?.height }];
      }),
    ));
    assert.deepEqual(dimensions, {
      'tab-loading': { width: '16px', height: '16px' },
      'session-import': { width: '48px', height: '48px' },
    });
    const slotOverflow = await page.locator('#tab-loading').evaluate((node) => ({
      slot: getComputedStyle(node).width,
      track: getComputedStyle(node.querySelector('svg')).width,
      scrollWidth: node.scrollWidth,
      overflow: getComputedStyle(node).overflowX,
    }));
    assert.deepEqual({ slot: slotOverflow.slot, track: slotOverflow.track, overflow: slotOverflow.overflow }, {
      slot: '10px',
      track: '16px',
      overflow: 'visible',
    });
    assert.equal(slotOverflow.scrollWidth > 10, true, 'the 16px indicator overflows the 10px grid slot');

    const readMotion = (selector) => page.locator(selector).evaluate((node) => {
      const indicator = node.querySelector('.muxui-progress-circle__indicator');
      const trackStyle = getComputedStyle(node);
      const indicatorStyle = indicator && getComputedStyle(indicator);
      return {
        track: trackStyle.animationName,
        indicator: indicatorStyle?.animationName,
        trackTransition: trackStyle.transitionDuration,
        indicatorTransition: indicatorStyle?.transitionDuration,
        indicatorDasharray: indicatorStyle?.strokeDasharray.replaceAll(',', ' ').replace(/\s+/gu, ' ').trim(),
        indicatorDashoffset: indicatorStyle?.strokeDashoffset,
      };
    });
    const assertReducedMotion = async (policy) => {
      const tabMotion = await readMotion('#tab-loading .muxui-progress-circle__track');
      assert.deepEqual({ track: tabMotion.track, indicator: tabMotion.indicator }, { track: 'none', indicator: 'none' }, `${policy} disables both ProgressCircle animations`);
      assert.equal(tabMotion.indicatorDasharray, '70px 100px', `${policy} keeps a visible partial indeterminate arc`);
      assert.equal(tabMotion.indicatorDashoffset, '-25px', `${policy} keeps the existing resting arc offset`);
      assert.equal(tabMotion.trackTransition, '0s', `${policy} disables track transitions`);
      assert.equal(tabMotion.indicatorTransition, '0s', `${policy} disables indicator transitions`);
      assert.deepEqual(await page.locator('#session-import .muxui-progress-circle__indicator').evaluate((node) => ({
        dasharray: node.getAttribute('stroke-dasharray'),
        dashoffset: node.getAttribute('stroke-dashoffset'),
      })), { dasharray: '100', dashoffset: '35' }, `${policy} leaves determinate geometry intact`);
      assert.equal(await page.locator('#decorative-track-wrapper .muxui-progress-circle__indicator').evaluate((node) => getComputedStyle(node).strokeDasharray.replaceAll(',', ' ').replace(/\s+/gu, ' ').trim()), '28px 72px', `${policy} preserves the decorative Track-only arc`);
    };

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const defaultMotion = await readMotion('#tab-loading .muxui-progress-circle__track');
    assert.deepEqual({ track: defaultMotion.track, indicator: defaultMotion.indicator }, {
      track: 'muxui-progress-circle-rotate',
      indicator: 'muxui-progress-circle-dash',
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await assertReducedMotion('OS reduced-motion');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.documentElement.setAttribute('data-reduced-motion', 'true'));
    await assertReducedMotion('data-reduced-motion');

    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-reduced-motion');
      document.documentElement.setAttribute('data-muxui-motion', 'reduced');
    });
    await assertReducedMotion('data-muxui-motion=reduced');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
