import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { TabsMotionFixture } from '../fixtures/tabs-motion-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function documentHtml() {
  const body = renderToString(React.createElement('div', { id: 'root' }, React.createElement(TabsMotionFixture)));
  return pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/collections.css">', bodyAttributes: 'style="margin: 32px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-strong);"', body, entry: '/test/fixtures/tabs-motion-browser-entry.mjs' });
}

async function readIndicator(page, selector) {
  return page.locator(selector).evaluate((root) => {
    const selected = root.querySelector('[role="tab"][aria-selected="true"]');
    const label = selected?.querySelector('.muxui-tab-label');
    const indicator = root.querySelector('.muxui-tabs-motion-underline');
    const list = root.querySelector('[role="tablist"]');
    const rect = (node) => {
      const value = node?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, width: value.width, height: value.height } : null;
    };
    return {
      selectedLabel: selected?.textContent?.trim(),
      label: rect(label),
      trigger: rect(selected),
      list: rect(list),
      indicator: rect(indicator),
      listDirection: list ? getComputedStyle(list).direction : null,
      animations: indicator?.getAnimations().map((animation) => ({
        duration: animation.effect?.getComputedTiming().duration,
        keyframes: animation.effect?.getKeyframes(),
      })) ?? [],
    };
  });
}

test('Tabs Motion tracks label geometry across controlled, RTL, vertical, resize, and reduced state', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ entries: ['src/collections.mjs'], pages: { '/tabs-motion.html': documentHtml } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/tabs-motion.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.muxuiTabsHydrated === 'true');
    assert.deepEqual(errors, []);
    assert.match(await page.locator('#primary-tabs').getAttribute('class'), /tabs-primary/u);
    assert.equal(await page.locator('.muxui-tab-panels').count(), 2, 'SSR and hydration retain both tab panel trees');

    const initial = await readIndicator(page, '#primary-tabs');
    assert.equal(initial.selectedLabel, 'A');
    assert.ok(initial.label && initial.indicator);
    assert.ok(Math.abs(initial.indicator.width - initial.label.width) < 1, 'indicator uses label width');
    assert.ok(initial.trigger.width > initial.label.width + 8, 'variable trigger padding is not included in the indicator');
    assert.equal(await page.locator('#primary-tabs [role="tab"][aria-disabled="true"]').count(), 1);

    await page.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '800ms'));
    await page.evaluate(() => window.__muxuiTabsSetSelected('long'));
    await page.waitForFunction(() => document.querySelector('#primary-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'A considerably longer label');
    assert.equal(await page.locator('#tabs-changes').textContent(), '0', 'controlled state changes do not require an animation callback');
    await page.waitForFunction((beforeWidth) => {
      const root = document.querySelector('#primary-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      if (!indicator || !label) return false;
      const currentWidth = indicator.getBoundingClientRect().width;
      const targetWidth = label.getBoundingClientRect().width;
      return indicator.getAnimations().length > 0
        || (Math.abs(currentWidth - beforeWidth) > 0.5 && Math.abs(currentWidth - targetWidth) > 0.5);
    }, initial.indicator.width);
    const inFlight = await readIndicator(page, '#primary-tabs');
    assert.equal(inFlight.selectedLabel, 'A considerably longer label', 'ARIA selection updates before the indicator settles');
    assert.ok(inFlight.indicator.width > initial.indicator.width && inFlight.indicator.width < inFlight.label.width, 'label movement is observed in flight');
    await page.waitForFunction(() => {
      const root = document.querySelector('#primary-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      return Boolean(indicator && label && Math.abs(indicator.getBoundingClientRect().width - label.getBoundingClientRect().width) < 1);
    });
    const settledLong = await readIndicator(page, '#primary-tabs');
    assert.ok(settledLong.label && settledLong.indicator);
    assert.ok(Math.abs(settledLong.indicator.width - settledLong.label.width) < 1);
    assert.equal(await page.locator('#primary-tabs .muxui-tab-panel:not([data-hidden])').textContent(), 'Long panel');

    const verticalBefore = await readIndicator(page, '#vertical-tabs');
    assert.equal(verticalBefore.listDirection, 'rtl');
    assert.ok(verticalBefore.label && verticalBefore.indicator && verticalBefore.list);
    assert.ok(Math.abs(verticalBefore.indicator.height - verticalBefore.label.height) < 1, 'vertical indicator follows label height');
    assert.ok(Math.abs(verticalBefore.indicator.left - verticalBefore.list.left) < 1, 'RTL vertical indicator follows the logical inline-end rail');
    await page.evaluate(() => window.__muxuiTabsSetVerticalSelected('long'));
    await page.waitForFunction(() => document.querySelector('#vertical-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'A considerably longer label');
    await page.waitForFunction((beforeTop) => {
      const root = document.querySelector('#vertical-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      if (!indicator || !label) return false;
      const currentTop = indicator.getBoundingClientRect().top;
      const targetTop = label.getBoundingClientRect().top;
      return indicator.getAnimations().length > 0
        || (Math.abs(currentTop - beforeTop) > 0.5 && Math.abs(currentTop - targetTop) > 0.5);
    }, verticalBefore.indicator.top);
    await page.waitForFunction(() => {
      const root = document.querySelector('#vertical-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      return Boolean(indicator && label && Math.abs(indicator.getBoundingClientRect().top - label.getBoundingClientRect().top) < 1);
    });
    const verticalAfter = await readIndicator(page, '#vertical-tabs');
    assert.ok(verticalAfter.indicator && verticalAfter.label && verticalAfter.list);
    assert.ok(Math.abs(verticalAfter.indicator.height - verticalAfter.label.height) < 1);
    assert.ok(Math.abs(verticalAfter.indicator.left - verticalAfter.list.left) < 1);
    assert.equal(await page.locator('#primary-tabs [role="tab"][aria-selected="true"]').textContent(), 'A considerably longer label', 'tab instances remain isolated');

    await page.locator('#primary-tabs [role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#primary-tabs [role="tab"][aria-selected="true"]').textContent(), 'A', 'automatic keyboard activation preserves RAC behavior');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#primary-tabs [role="tab"][aria-selected="true"]').textContent(), 'A considerably longer label');

    const beforeReduced = await readIndicator(page, '#primary-tabs');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '1200ms');
      window.__muxuiTabsSetSelected('short');
    });
    await page.waitForFunction((beforeWidth) => {
      const root = document.querySelector('#primary-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      if (!indicator || !label) return false;
      const currentWidth = indicator.getBoundingClientRect().width;
      const targetWidth = label.getBoundingClientRect().width;
      return Math.abs(currentWidth - beforeWidth) > 0.5 && Math.abs(currentWidth - targetWidth) > 0.5;
    }, beforeReduced.indicator.width);
    const reducedStarted = Date.now();
    await page.evaluate(() => document.getElementById('root').setAttribute('data-muxui-motion', 'reduced'));
    await page.waitForFunction(() => {
      const tabs = document.querySelector('#primary-tabs');
      const root = tabs?.querySelector('.muxui-tabs-motion');
      const indicator = tabs?.querySelector('.muxui-tabs-motion-underline');
      const label = tabs?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      return root?.hasAttribute('data-muxui-tabs-reduced') && indicator && label
        && Math.abs(indicator.getBoundingClientRect().left - label.getBoundingClientRect().left) < 1
        && Math.abs(indicator.getBoundingClientRect().width - label.getBoundingClientRect().width) < 1;
    }, undefined, { timeout: 1000 });
    assert.ok(Date.now() - reducedStarted < 300, 'explicit reduced mode settles the active indicator immediately');
    const reduced = await readIndicator(page, '#primary-tabs');
    assert.ok(reduced.label && reduced.indicator);
    assert.ok(Math.abs(reduced.indicator.left - reduced.label.left) < 1);
    await page.evaluate(() => {
      document.getElementById('root').removeAttribute('data-muxui-motion');
      document.documentElement.style.setProperty('--muxui-semantic-motion-state-duration', '1200ms');
      window.__muxuiTabsSetSelected('long');
    });
    await page.waitForFunction(() => document.querySelector('#primary-tabs [role="tab"][aria-selected="true"]')?.textContent?.trim() === 'A considerably longer label');
    const systemBefore = await readIndicator(page, '#primary-tabs');
    await page.waitForFunction((beforeWidth) => {
      const root = document.querySelector('#primary-tabs');
      const indicator = root?.querySelector('.muxui-tabs-motion-underline');
      const label = root?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      if (!indicator || !label) return false;
      const currentWidth = indicator.getBoundingClientRect().width;
      const targetWidth = label.getBoundingClientRect().width;
      return Math.abs(currentWidth - beforeWidth) > 0.5 && Math.abs(currentWidth - targetWidth) > 0.5;
    }, systemBefore.indicator.width);
    const systemReducedStarted = Date.now();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const tabs = document.querySelector('#primary-tabs');
      const root = tabs?.querySelector('.muxui-tabs-motion');
      const indicator = tabs?.querySelector('.muxui-tabs-motion-underline');
      const label = tabs?.querySelector('[role="tab"][aria-selected="true"] .muxui-tab-label');
      return root?.hasAttribute('data-muxui-tabs-reduced') && indicator && label
        && Math.abs(indicator.getBoundingClientRect().left - label.getBoundingClientRect().left) < 1
        && Math.abs(indicator.getBoundingClientRect().width - label.getBoundingClientRect().width) < 1;
    }, undefined, { timeout: 1000 });
    assert.ok(Date.now() - systemReducedStarted < 300, 'system reduced mode settles the active indicator immediately');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--muxui-semantic-motion-state-duration');
      window.__muxuiTabsUnmount();
    });
    await page.locator('#tabs-unmounted').waitFor({ state: 'attached' });
    assert.equal(await page.locator('.muxui-tabs-motion-underline').count(), 0, 'unmount removes per-instance indicator nodes');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
