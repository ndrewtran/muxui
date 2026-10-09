import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Activity } from '../../src/supplemental/activity.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const items = [
  { id: 'read', label: 'Read notes', status: 'completed', meta: '3 files', details: 'Local notes supplied.' },
  { id: 'review', label: 'Review records', status: 'failed', details: 'The selected file could not be read.', actions: [{ id: 'cancel', label: 'Cancel request', onAction: () => {} }, { id: 'disabled', label: 'Unavailable action', disabled: true, onAction: () => {} }] },
  { id: 'write', label: 'Draft notes', status: 'queued', meta: '7 items' },
];
const entry = `import React from 'react';import { hydrateRoot } from 'react-dom/client';import { flushSync } from 'react-dom';import { Activity } from '/src/supplemental/activity.mjs';
window.events=[];window.errors=[];window.items=${JSON.stringify(items)};window.items[1].actions.forEach(action=>action.onAction=()=>window.events.push(action.id));
const content=(props={})=>React.createElement(Activity,{label:'Workspace checks',onExpandedChange:value=>window.events.push(value),items:window.items,...props});
const root=hydrateRoot(document.querySelector('#root'),content(),{onRecoverableError:error=>window.errors.push(error.message)});
window.mount=(props={})=>flushSync(()=>root.render(content(props)));window.unmount=()=>flushSync(()=>root.unmount());window.flush=fn=>flushSync(fn);
window.addMetadata=()=>{window.items[0].meta=React.createElement(React.Fragment,null,React.createElement('a',{href:'#record',onClick:()=>window.events.push('link')},'View record'),React.createElement('button',{type:'button',onClick:()=>window.events.push('metadata')},'Metadata action'),React.createElement('span',{onClick:event=>{event.preventDefault();window.events.push('prevented');}},'Prevented metadata'));window.mount();};window.ready=true;`;
const fixture = pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">', bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"', body: `<main id="scope"><div id="root">${renderToString(React.createElement(Activity, { label: 'Workspace checks', items }))}</div></main>`, entry: '/activity-entry.mjs' });
const outer = '.muxui-activity-items-host > .muxui-activity-motion-panel';
const itemPanel = '.muxui-activity-details-host > .muxui-activity-motion-panel';
async function setup() {
  const server = await startServer({ entries: ['src/supplemental/activity.mjs'], pages: { '/activity.html': fixture }, modules: { '/activity-entry.mjs': entry } });
  const browser = await launchBrowser(); const page = await browser.newPage({ viewport: { width: 390, height: 700 } }); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.observers = new Set(); window.listeners = new Set(); window.starts = [];
    const Observer = MutationObserver;
    window.MutationObserver = class extends Observer { observe(...args) { if (args[1]?.attributeFilter?.some(attribute => ['hidden', 'data-reduced-motion'].includes(attribute))) window.observers.add(this); return super.observe(...args); } disconnect() { window.observers.delete(this); return super.disconnect(); } };
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => { const media = matchMedia(query); const add = media.addEventListener.bind(media); const remove = media.removeEventListener.bind(media); media.addEventListener = (type, listener, options) => { if (query.includes('reduced-motion')) window.listeners.add(listener); add(type, listener, options); }; media.removeEventListener = (type, listener, options) => { window.listeners.delete(listener); remove(type, listener, options); }; return media; };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) { window.starts.push(this.className.baseVal ?? this.className); return animate.apply(this, args); };
  });
  await page.goto(server.url + '/activity.html'); await page.waitForFunction(() => window.ready); await page.waitForTimeout(70);
  return { page, errors, async close() { await browser.close(); await server.close(); } };
}
async function settle(page, selector, open) {
  await page.waitForFunction(({ selector, open }) => {
    const panel = document.querySelector(selector); const content = panel.firstElementChild;
    return (open ? panel.style.height === '' && !panel.parentElement.hasAttribute('hidden') && Number(getComputedStyle(content).opacity) === 1 : panel.style.height === '0px' && panel.parentElement.hasAttribute('hidden') && Number(getComputedStyle(content).opacity) === 0) && content.getAnimations().length === 0;
  }, { selector, open });
}
async function sample(page, trigger, selector, duration = 700) {
  return page.evaluate(async ({ trigger, selector, duration }) => {
    const panel = document.querySelector(selector); const content = panel.firstElementChild; const button = document.querySelector(trigger); const icon = button.querySelector('svg');
    const read = () => ({ height: panel.getBoundingClientRect().height, opacity: Number(getComputedStyle(content).opacity), transform: getComputedStyle(content).transform, angle: Math.atan2(new DOMMatrix(getComputedStyle(icon).transform).b, new DOMMatrix(getComputedStyle(icon).transform).a) * 180 / Math.PI, expanded: button.getAttribute('aria-expanded') });
    const before = read(); window.flush(() => button.click()); const immediate = read(); const frames = []; const start = performance.now();
    while (performance.now() - start < duration) { await new Promise(requestAnimationFrame); frames.push(read()); }
    return { before, immediate, frames, after: read() };
  }, { trigger, selector, duration });
}

test('Activity native item and aggregate disclosure, real actions, static status and mobile forced-colors work by keyboard', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    assert.deepEqual(await page.evaluate(() => window.errors), []);
    const trigger = page.locator('.muxui-activity-trigger'); await trigger.focus(); await page.keyboard.press('Enter'); assert.equal(await trigger.getAttribute('aria-expanded'), 'false'); await settle(page, outer, false);
    await page.keyboard.press('Space'); assert.equal(await trigger.getAttribute('aria-expanded'), 'true'); await settle(page, outer, true);
    await page.locator('summary').nth(1).focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('summary').nth(1).getAttribute('aria-expanded'), 'true'); await settle(page, '.muxui-activity-item:nth-child(2) ' + itemPanel, true);
    await page.keyboard.press('Tab'); const cancel = page.getByRole('button', { name: 'Cancel request' }); assert.equal(await cancel.evaluate(node => node === document.activeElement), true); await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Unavailable action' }).isDisabled(), true); assert.deepEqual(await page.evaluate(() => window.events), [false, true, 'cancel']);
    const status = await page.getByRole('status').textContent(); await page.evaluate(() => { window.items[1].time = '4s'; window.mount(); }); assert.equal(await page.getByRole('status').textContent(), status); assert.equal(await page.locator('.muxui-activity-item').nth(1).locator('.muxui-activity-status-time').textContent(), 'Failed in 4s'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.emulateMedia({ forcedColors: 'active' }); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Activity uses grouped spring height, opacity and chevron for both directions, interruptions and dynamic native details', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    assert.equal(await page.evaluate(() => window.starts.length), 0, 'hydration has no entry replay');
    const roles = await page.locator(outer).evaluate(panel => {
      const style = getComputedStyle(panel); const content = getComputedStyle(panel.firstElementChild); const root = getComputedStyle(panel.closest('.muxui-activity'));
      return { duration: style.getPropertyValue('--muxui-semantic-motion-content-resize-transition-duration').trim(), component: style.getPropertyValue('--muxui-component-disclosuregroup-transition-duration').trim(), nested: content.getPropertyValue('--muxui-semantic-motion-content-resize-transition-duration').trim(), inherited: root.getPropertyValue('--muxui-semantic-motion-content-resize-transition-duration').trim() };
    });
    assert.equal(roles.duration, roles.component); assert.equal(roles.nested, roles.inherited);
    const close = await sample(page, '.muxui-activity-trigger', outer); assert.ok(close.immediate.height > 0); assert.ok(close.frames.some(frame => frame.height > 1 && frame.height < close.before.height - 1)); assert.ok(close.frames.some(frame => frame.opacity > 0 && frame.opacity < 1)); assert.ok(close.frames.every(frame => frame.transform === 'none')); assert.equal(close.after.height, 0); await settle(page, outer, false);
    const open = await sample(page, '.muxui-activity-trigger', outer); assert.equal(open.before.height, 0); assert.ok(open.frames.some(frame => frame.height > 1 && frame.height < open.after.height - 1)); assert.ok(open.frames.some(frame => frame.angle > 1 && frame.angle < 179)); assert.ok(Math.abs(Math.abs(open.after.angle) - 180) < 0.1); await settle(page, outer, true);
    const partial = await sample(page, '.muxui-activity-trigger', outer, 110); const reverse = await sample(page, '.muxui-activity-trigger', outer); assert.ok(partial.after.height > 0); assert.ok(Math.abs(reverse.immediate.height - reverse.before.height) < 0.5, 'reversal starts at rendered height'); await settle(page, outer, true);
    const openingItem = await sample(page, 'summary', itemPanel); assert.ok(openingItem.frames.some(frame => frame.height > 0 && frame.height < openingItem.after.height)); await settle(page, itemPanel, true);
    const itemHeight = await page.locator(itemPanel).first().evaluate(panel => panel.getBoundingClientRect().height);
    await page.evaluate(() => { window.items[0].details = 'Additional caller content '.repeat(30); window.mount(); }); await settle(page, itemPanel, true); assert.ok(await page.locator(itemPanel).first().evaluate(panel => panel.getBoundingClientRect().height) > itemHeight);
    const closingItem = await sample(page, 'summary', itemPanel, 110); assert.equal(await page.locator('details').first().getAttribute('open'), '', 'physical native details stays open only during exit'); assert.equal(await page.locator('summary').first().getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator(itemPanel).first().getAttribute('aria-hidden'), 'true'); assert.ok(closingItem.after.height > 0);
    await sample(page, 'summary', itemPanel); await settle(page, itemPanel, true); await sample(page, 'summary', itemPanel); await settle(page, itemPanel, false); assert.equal(await page.locator('details').first().getAttribute('open'), null);
    await page.locator('details').first().evaluate(details => { details.open = true; }); await page.waitForFunction(() => document.querySelector('summary').getAttribute('aria-expanded') === 'true'); await settle(page, itemPanel, true);
    await page.locator('details').first().evaluate(details => { details.open = false; }); await page.waitForFunction(() => document.querySelector('summary').getAttribute('aria-expanded') === 'false'); await settle(page, itemPanel, false); assert.equal(await page.locator('details').first().getAttribute('open'), null);
    await page.locator('.muxui-activity').evaluate(node => { node.style.setProperty('--muxui-component-disclosuregroup-transition-duration', '0ms'); node.style.setProperty('--muxui-component-disclosuregroup-transition-spring-visual-duration', '0ms'); });
    const zeroClose = await sample(page, '.muxui-activity-trigger', outer, 80); assert.ok(zeroClose.frames.every(frame => frame.height === 0 && frame.opacity === 0 && frame.angle === 0), 'the same zero component duration as DisclosureGroup settles all channels immediately');
    const zeroOpen = await sample(page, '.muxui-activity-trigger', outer, 80); assert.ok(zeroOpen.frames.every(frame => frame.height > 0 && frame.opacity === 1 && Math.abs(Math.abs(frame.angle) - 180) < 0.1));
    await page.locator('.muxui-activity').evaluate(node => { node.style.removeProperty('--muxui-component-disclosuregroup-transition-duration'); node.style.removeProperty('--muxui-component-disclosuregroup-transition-spring-visual-duration'); });
    const idle = await page.evaluate(() => ({ starts: window.starts.length, observers: window.observers.size, listeners: window.listeners.size }));
    await page.waitForTimeout(650); assert.equal(await page.evaluate(() => window.starts.length), idle.starts, 'no recurring idle motion'); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Activity keeps controlled callbacks, focus and reduced close semantics, and cleans up unmount', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    await page.evaluate(() => window.mount({ expanded: true })); await page.locator('.muxui-activity-trigger').click(); assert.deepEqual(await page.evaluate(() => window.events), [false]); assert.equal(await page.locator('.muxui-activity-trigger').getAttribute('aria-expanded'), 'true');
    await page.locator('summary').nth(1).click(); await settle(page, '.muxui-activity-item:nth-child(2) ' + itemPanel, true); await page.getByRole('button', { name: 'Cancel request' }).focus();
    await page.locator('summary').nth(1).evaluate(node => window.flush(() => node.click())); assert.equal(await page.locator('summary').nth(1).evaluate(node => node === document.activeElement), true, 'item collapse returns focused content to its native summary'); await settle(page, '.muxui-activity-item:nth-child(2) ' + itemPanel, false);
    await page.locator('summary').nth(1).click(); await settle(page, '.muxui-activity-item:nth-child(2) ' + itemPanel, true); await page.getByRole('button', { name: 'Cancel request' }).focus();
    await page.evaluate(() => window.mount({ expanded: false })); assert.equal(await page.locator('.muxui-activity-trigger').evaluate(node => node === document.activeElement), true); assert.equal(await page.locator(outer).evaluate(node => node.inert), true); await settle(page, outer, false);
    for (const mode of ['system', 'data-reduced-motion', 'data-muxui-motion']) {
      await page.evaluate(() => window.mount({ expanded: true })); await settle(page, outer, true);
      await page.locator('summary').first().click(); await settle(page, itemPanel, true);
      await sample(page, 'summary', itemPanel, 80);
      if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' }); else await page.locator('#scope').evaluate((node, mode) => node.setAttribute(mode, mode === 'data-muxui-motion' ? 'reduced' : ''), mode);
      await settle(page, itemPanel, false); assert.equal(await page.locator('details').first().getAttribute('open'), null);
      await page.evaluate(() => window.mount({ expanded: false })); await settle(page, outer, false);
      const starts = await page.evaluate(() => window.starts.length); await page.evaluate(() => window.mount({ expanded: true })); await settle(page, outer, true); assert.equal(await page.evaluate(() => window.starts.length), starts, mode + ' skips motion');
      await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('#scope').evaluate(node => { node.removeAttribute('data-reduced-motion'); node.removeAttribute('data-muxui-motion'); });
    }
    await page.evaluate(() => { window.items[0].details = 'Changed caller content '.repeat(35); window.mount({ expanded: true }); });
    await page.locator('summary').first().click(); await page.waitForTimeout(80);
    await page.evaluate(() => { window.detached = [...document.querySelectorAll('.muxui-activity-motion-panel')]; window.unmount(); window.detachedStyles = window.detached.map(node => node.style.height); });
    await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.detached.every((node, index) => node.style.height === window.detachedStyles[index] && node.firstElementChild.getAnimations().every(animation => animation.playState !== 'running'))), true, 'unmount stops height and content motion');
    assert.deepEqual(await page.evaluate(() => [window.observers.size, window.listeners.size, document.querySelectorAll('.muxui-activity').length]), [0, 0, 0]); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Activity preserves interactive metadata and prevented summary activation', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    await page.evaluate(() => window.addMetadata());
    await page.getByRole('link', { name: 'View record' }).click(); await page.getByRole('button', { name: 'Metadata action' }).click(); await page.getByText('Prevented metadata').click();
    assert.deepEqual(await page.evaluate(() => window.events), ['link', 'metadata', 'prevented']); assert.equal(await page.locator('summary').first().getAttribute('aria-expanded'), 'false'); assert.equal(await page.locator('details').first().getAttribute('open'), null);
    await page.locator('.muxui-activity-item-label').first().click(); await settle(page, itemPanel, true);
    await page.locator('summary').first().focus(); await page.keyboard.press('Space'); await settle(page, itemPanel, false);
    await page.keyboard.press('Enter'); await settle(page, itemPanel, true); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Activity details removal cancels ownership and restoration starts closed across both motion phases', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    const subscriptions = await page.evaluate(() => [window.observers.size, window.listeners.size]);
    await page.evaluate(() => { window.items[0].details = null; window.mount(); }); assert.equal(await page.locator('.muxui-activity-item').first().locator('details').count(), 0);
    await page.evaluate(() => { window.items[0].details = 'Restored details'; window.mount(); }); assert.equal(await page.locator('details').first().getAttribute('open'), null); assert.equal(await page.locator('summary').first().getAttribute('aria-expanded'), 'false');
    for (const phase of ['opening', 'closing']) {
      await page.locator('summary').first().click();
      if (phase === 'closing') { await settle(page, itemPanel, true); await page.locator('summary').first().click(); }
      await page.waitForTimeout(80);
      await page.evaluate(() => {
        window.removedPanel = document.querySelector('.muxui-activity-details-host > .muxui-activity-motion-panel');
        window.items[0].details = null; window.mount(); window.removedHeight = window.removedPanel.style.height;
      });
      assert.equal(await page.locator('.muxui-activity-item').first().locator('details').count(), 0); await page.waitForTimeout(120);
      assert.equal(await page.evaluate(() => !window.removedPanel.isConnected && window.removedPanel.style.height === window.removedHeight && window.removedPanel.firstElementChild.getAnimations().every(animation => animation.playState !== 'running')), true, phase + ' detached motion stops');
      assert.deepEqual(await page.evaluate(() => [window.observers.size, window.listeners.size]), [subscriptions[0] - 3, subscriptions[1] - 2], phase + ' details subscriptions are removed');
      await page.evaluate(() => { window.items[0].details = 'Restored details'; window.mount(); }); assert.equal(await page.locator('details').first().getAttribute('open'), null); assert.equal(await page.locator('summary').first().getAttribute('aria-expanded'), 'false');
      assert.deepEqual(await page.evaluate(() => [window.observers.size, window.listeners.size]), subscriptions);
      await page.locator('details').first().evaluate(node => { node.open = true; }); await page.waitForFunction(() => document.querySelector('summary').getAttribute('aria-expanded') === 'true'); await settle(page, itemPanel, true);
      await page.locator('summary').first().press('Enter'); await settle(page, itemPanel, false); assert.equal(await page.locator('details').first().getAttribute('open'), null);
    }
    assert.deepEqual(await page.evaluate(() => window.events), []); assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('Activity keeps its 300px preference but never overflows a narrower container', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  const widths = () => page.locator('.muxui-activity, .muxui-activity-item').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  try {
    await page.locator('#scope').evaluate(node => { node.style.inlineSize = '272px'; });
    const fit = await page.locator('#scope').evaluate(scope => {
      const limit = scope.getBoundingClientRect().right;
      const rects = [...scope.querySelectorAll('.muxui-activity, .muxui-activity-item')].map(node => node.getBoundingClientRect());
      return { count: rects.length, overflow: scope.scrollWidth - scope.clientWidth, beyond: rects.filter(rect => rect.right > limit + 0.5).length };
    });
    assert.deepEqual(fit, { count: 4, overflow: 0, beyond: 0 });
    // As a flex item the content is narrower than 300px, so only the minimum can widen it.
    await page.locator('#scope').evaluate(node => { node.style.inlineSize = '600px'; node.style.display = 'flex'; node.style.alignItems = 'flex-start'; node.firstElementChild.style.display = 'contents'; });
    assert.deepEqual((await widths()).map(width => Math.round(width)), [300, 300, 300, 300]);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
