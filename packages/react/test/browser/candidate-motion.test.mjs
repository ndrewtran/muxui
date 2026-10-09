import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { CodeBlock, PromptComposer, Message, Activity, DataDiff } from '../../generated/index.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const e = React.createElement;
const columns = [{ id: 'value', label: 'Value' }];
const rows = [{ id: 'one', label: 'One', kind: 'added', values: { value: 1 } }, { id: 'two', label: 'Two', kind: 'added', values: { value: 2 } }];
function content(state = {}) {
  return e('main', { id: 'scope' },
    e(CodeBlock, { source: 'const ready = true;', filename: 'ready.ts' }),
    e(PromptComposer, { defaultValue: 'Ready', pending: state.pending, onSend: () => {}, onStop: () => {}, sources: [{ id: 'react', label: 'React' }, { id: 'record', label: 'Records' }] }),
    e(Message, { author: 'Assistant', sources: [{ id: 'source', label: 'Source link', href: 'https://react.dev/' }], streaming: state.streaming }, state.text ?? 'Caller response'),
    e(Activity, { label: 'Checks', defaultExpanded: false, status: state.status ?? 'running', items: [{ id: 'one', label: 'Read record', status: state.status ?? 'running', details: 'Supplied details' }] }),
    e(DataDiff, { label: 'Changes', columns, rows, pending: state.pending, onApply: () => {} }));
}
const entry = `
import React from 'react'; import { hydrateRoot } from 'react-dom/client'; import { flushSync } from 'react-dom';
import { CodeBlock, PromptComposer, Message, Activity, DataDiff } from '/generated/index.mjs';
const e=React.createElement; const columns=${JSON.stringify(columns)}; const rows=${JSON.stringify(rows)};
${content.toString()}
const root=hydrateRoot(document.querySelector('#root'),content(),{onRecoverableError:error=>window.hydrationErrors.push(error.message)});
window.mount=state=>flushSync(()=>root.render(content(state))); window.unmount=()=>flushSync(()=>root.unmount());
window.flush=fn=>flushSync(fn); window.ready=true;`;
const selector = '.muxui-code-block-copy-icon, .muxui-prompt-composer-suggestions, .muxui-prompt-composer-send .muxui-icon-button-icon, .muxui-message-sources-chevron, .muxui-message-sources, .muxui-activity-items, .muxui-activity-mark, .muxui-activity-status, .muxui-activity-details, .muxui-data-diff-totals, .muxui-data-diff-apply-label';
const fixture = pageShell({
  attributes: 'data-muxui-motion="full" data-muxui-color-scheme="light"',
  head: `<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css"><style>:root { --muxui-semantic-motion-state-transition-duration: 500ms; --muxui-semantic-motion-state-transition-spring-visual-duration: 500ms; --muxui-semantic-motion-reveal-transition-duration: 500ms; --muxui-semantic-motion-reveal-transition-spring-visual-duration: 500ms; --muxui-semantic-motion-interaction-transition-duration: 500ms; --muxui-semantic-motion-interaction-transition-spring-visual-duration: 500ms; }</style>`,
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body: `<div id="root">${renderToString(content())}</div>`, entry: '/candidate-motion-entry.mjs',
});

async function setup() {
  const server = await startServer({ entries: ['generated/index.mjs'], pages: { '/candidate-motion.html': fixture }, modules: { '/candidate-motion-entry.mjs': entry } });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 800, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.hydrationErrors = []; window.motionStarts = []; window.observers = new Set(); window.mediaListeners = new Set();
    const nativeAnimate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const properties = Array.isArray(frames) ? [...new Set(frames.flatMap(frame => Object.keys(frame)))].filter(key => !['offset','easing','composite'].includes(key)) : Object.keys(frames);
      window.motionStarts.push({ target: this.className.baseVal ?? this.className, properties });
      return nativeAnimate.call(this, frames, options);
    };
    const NativeObserver = MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      observe(...args) { if (args[1]?.attributeFilter?.includes('data-reduced-motion')) window.observers.add(this); return super.observe(...args); }
      disconnect() { window.observers.delete(this); return super.disconnect(); }
    };
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = nativeMatchMedia(query);
      const add = media.addEventListener.bind(media); const remove = media.removeEventListener.bind(media);
      media.addEventListener = (type, listener, options) => { if (type === 'change' && query.includes('reduced-motion')) window.mediaListeners.add(listener); add(type, listener, options); };
      media.removeEventListener = (type, listener, options) => { window.mediaListeners.delete(listener); remove(type, listener, options); };
      return media;
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { window.finishCopy = resolve; window.rejectCopy = reject; }) } });
  });
  await page.goto(server.url + '/candidate-motion.html');
  await page.waitForFunction(() => window.ready);
  await page.waitForTimeout(50);
  const subscriptions = await page.evaluate(() => [window.observers.size, window.mediaListeners.size]);
  return { page, errors, subscriptions, async close() { await browser.close(); await server.close(); } };
}

async function settled(page) {
  await page.waitForFunction(selector => [...document.querySelectorAll(selector)].every(node => node.getAnimations().length === 0 && !node.style.transform && !node.style.opacity), selector, { timeout: 5_000 }).catch(async () => { assert.fail(JSON.stringify(await page.locator(selector).evaluateAll(nodes => nodes.map(node => ({ className: node.className.baseVal ?? node.className, animations: node.getAnimations().map(animation => animation.playState), transform: node.style.transform, opacity: node.style.opacity }))))); });
  await page.waitForFunction(() => [...document.querySelectorAll('.muxui-activity-motion-panel')].every(panel => (panel.hasAttribute('aria-hidden') ? panel.parentElement.hasAttribute('hidden') : panel.style.height === '') && panel.firstElementChild.getAnimations().length === 0));
}
async function activate(page) {
  await page.evaluate(() => {
    document.querySelector('.muxui-message-sources-trigger').click();
    document.querySelector('.muxui-activity-trigger').click();
    document.querySelector('.muxui-data-diff-row input').click();
  });
  await page.waitForTimeout(30);
  await page.evaluate(() => window.mount({ pending: true, status: 'completed' }));
}

test('CodeBlock, PromptComposer, Message, Activity and DataDiff motion stays finite through feedback, typing, streaming and pending', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    assert.deepEqual(await page.evaluate(() => window.hydrationErrors), []);
    assert.equal(await page.evaluate(() => window.motionStarts.length), 0, 'SSR hydration has no entry replay');
    const nativeButton = await page.getByRole('button', { name: 'Copy code' }).evaluateHandle(node => node);
    await page.getByRole('button', { name: 'Copy code' }).focus();
    await page.evaluate(() => document.querySelector('.muxui-code-block-copy').click());
    assert.equal(await page.evaluate(() => window.motionStarts.length), 0, 'clipboard pending stays still');
    await page.evaluate(() => window.finishCopy());
    await page.waitForFunction(() => window.motionStarts.some(entry => entry.target.includes('copy-icon')));
    assert.equal(await nativeButton.evaluate(node => node === document.querySelector('.muxui-code-block-copy')), true);
    assert.equal(await page.locator('.muxui-code-block-copy-icon').evaluate(node => node.getAnimations().some(animation => animation.effect.getKeyframes()[0].opacity !== undefined && animation.effect.getComputedTiming().duration === 500)), true, 'authored state timing override reaches WAAPI');
    await settled(page);
    assert.equal(await page.locator('.muxui-code-block-copy-icon .lucide-check').count(), 1);
    await page.evaluate(() => document.querySelector('.muxui-code-block-copy').click());
    await page.evaluate(() => window.rejectCopy(new Error('Unavailable')));
    await page.waitForFunction(() => document.querySelector('.muxui-code-block').dataset.copyState === 'error');
    await settled(page);
    assert.match(await page.locator('.muxui-code-block [role=status]').textContent(), /Clipboard|copy code/u);
    const input = page.getByRole('textbox', { name: 'Message' });
    await input.fill('@');
    await page.waitForFunction(() => window.motionStarts.some(entry => entry.target.includes('suggestions')));
    await settled(page);
    const starts = await page.evaluate(() => window.motionStarts.length);
    await input.press('r');
    await page.evaluate(() => window.mount({ streaming: true, text: 'Next caller token' }));
    assert.equal(await page.evaluate(() => window.motionStarts.length), starts, 'typing and streaming do not replay entry');
    await input.press('Escape');
    assert.equal(await page.getByRole('listbox').count(), 0, 'suggestions close immediately');
    assert.equal(await input.getAttribute('aria-controls'), null);
    await activate(page);
    await page.waitForFunction(() => window.motionStarts.some(entry => entry.target.includes('activity-motion-content')));
    await settled(page);
    assert.equal(await page.evaluate(() => ['muxui-message-sources-chevron','muxui-activity-motion-content','muxui-data-diff-totals','muxui-data-diff-apply-label','muxui-icon-button-icon'].every(target => window.motionStarts.some(entry => entry.target.includes(target)))), true, 'each planned state/disclosure feedback runs');
    assert.equal(await page.getByRole('checkbox', { name: 'Select all proposed changes' }).evaluate(node => node.indeterminate), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Select One (added)' }).isDisabled(), true);
    const pendingStarts = await page.evaluate(() => window.motionStarts.filter(entry => entry.target.includes('data-diff')).length);
    await page.evaluate(() => window.mount({ pending: true, status: 'completed', streaming: true, text: 'More tokens' }));
    await settled(page);
    assert.equal(await page.evaluate(() => window.motionStarts.filter(entry => entry.target.includes('data-diff')).length), pendingStarts);
    await page.evaluate(() => window.mount({ status: 'completed' }));
    const summary = page.locator('.muxui-activity summary');
    await summary.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => document.querySelector('.muxui-activity-details-host .muxui-activity-motion-content').getAnimations().length > 0);
    assert.equal(await page.locator('.muxui-activity details').getAttribute('open'), '');
    await settled(page);
    await page.keyboard.press('Space');
    assert.equal(await summary.getAttribute('aria-expanded'), 'false');
    await settled(page);
    assert.equal(await page.locator('.muxui-activity details').getAttribute('open'), null);
    await page.evaluate(() => document.querySelector('.muxui-message-sources-trigger').click());
    assert.equal(await page.getByRole('link', { name: 'Source link' }).count(), 0, 'closed source is immediately inaccessible');
    await settled(page);
    const idleStarts = await page.evaluate(() => window.motionStarts.length);
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.motionStarts.length), idleStarts, 'no recurring idle work');
    assert.deepEqual(await page.evaluate(() => [window.observers.size, window.mediaListeners.size]), context.subscriptions, 'canonical disclosure subscriptions remain bounded at idle');
    assert.equal(await page.evaluate(() => window.motionStarts.every(entry => entry.properties.every(property => ['transform', 'opacity'].includes(property)))), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('CodeBlock, PromptComposer, Message, Activity and DataDiff honor reduced ancestors and mid-flight system preferences', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    for (const mode of ['system', 'data-reduced-motion', 'data-muxui-motion']) {
      await page.reload(); await page.waitForFunction(() => window.ready); await page.waitForTimeout(50);
      if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(mode => document.querySelector('#scope').setAttribute(mode, mode === 'data-muxui-motion' ? 'reduced' : ''), mode);
      await activate(page);
      await page.evaluate(() => document.querySelector('.muxui-activity summary').click());
      await page.waitForTimeout(60);
      assert.equal(await page.evaluate(() => window.motionStarts.length), 0, mode);
      await settled(page);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    for (const mode of ['system', 'data-reduced-motion', 'data-muxui-motion']) {
      await page.reload(); await page.waitForFunction(() => window.ready); await page.waitForTimeout(50);
      await activate(page);
      await page.waitForFunction(selector => [...document.querySelectorAll(selector)].some(node => node.getAnimations().length > 0), selector);
      if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
      else await page.evaluate(mode => document.querySelector('#scope').setAttribute(mode, mode === 'data-muxui-motion' ? 'reduced' : ''), mode);
      await page.waitForTimeout(30);
      assert.equal(await page.evaluate(selector => [...document.querySelectorAll(selector)].reduce((count, node) => count + node.getAnimations().length, 0), selector), 0, mode);
      await settled(page);
      assert.deepEqual(await page.evaluate(() => [window.observers.size, window.mediaListeners.size]), context.subscriptions, mode);
      const starts = await page.evaluate(() => window.motionStarts.length);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { document.querySelector('#scope').removeAttribute('data-reduced-motion'); document.querySelector('#scope').removeAttribute('data-muxui-motion'); });
      await page.waitForTimeout(50);
      assert.equal(await page.evaluate(() => window.motionStarts.length), starts, 'restoring full mode does not replay feedback');
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('CodeBlock, PromptComposer, Message, Activity and DataDiff clean up rapid reversals, animations and observers', { timeout: 120_000 }, async () => {
  const context = await setup(); const { page, errors } = context;
  try {
    await page.evaluate(() => document.querySelector('.muxui-message-sources-trigger').click());
    await page.waitForFunction(() => document.querySelector('.muxui-message-sources-chevron').getAnimations().length > 0);
    await page.waitForTimeout(100);
    const reversal = await page.evaluate(() => {
      const chevron = document.querySelector('.muxui-message-sources-chevron');
      const before = getComputedStyle(chevron).transform;
      window.flush(() => document.querySelector('.muxui-message-sources-trigger').click());
      return { before, after: getComputedStyle(chevron).transform };
    });
    assert.equal(reversal.after, reversal.before, 'no snap before reversing');
    await page.evaluate(() => { document.querySelector('.muxui-message-sources-trigger').click(); document.querySelector('.muxui-activity-trigger').click(); window.mount({ pending: true, status: 'failed' }); });
    await page.waitForFunction(() => window.observers.size > 0);
    const unmounted = await page.evaluate(selector => {
      const nodes = [...document.querySelectorAll(selector)];
      const active = nodes.flatMap(node => node.getAnimations());
      window.unmount();
      return { active: active.length, remaining: active.filter(animation => animation.playState !== 'idle').length, dirtyStyles: nodes.filter(node => node.style.transform || node.style.opacity).length, observers: window.observers.size, listeners: window.mediaListeners.size };
    }, selector);
    assert.ok(unmounted.active > 0);
    assert.deepEqual({ ...unmounted, active: 0 }, { active: 0, remaining: 0, dirtyStyles: 0, observers: 0, listeners: 0 });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
