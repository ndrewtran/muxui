import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { installDom } from './support/dom.mjs';
import { highlightCodeDocuments } from '../src/supplemental/code-block-highlight.mjs';

// React Aria selects its client layout hooks when the overlay module loads.
const moduleEnvironment = installDom(new JSDOM('<!doctype html><div id="root"></div>'), { layoutStubs: true });
const { CodeBlock } = await import('../src/supplemental/code-block.mjs');
moduleEnvironment();

const e = (props) => React.createElement(CodeBlock, props);
const markup = (props) => renderToStaticMarkup(e(props));
const documentOf = (props) => new JSDOM(markup(props)).window.document;

test('CodeBlock escapes text, retains whitespace and trailing lines, and preserves native hosts', () => {
  const source = '\t<script>unsafe()</script>\r\n  trailing  \n';
  const document = documentOf({ source, filename: 'panel.ts', language: 'typescript', id: 'listing', className: 'consumer', 'data-consumer': 'kept' });
  const root = document.querySelector('#listing');
  assert.ok(root.classList.contains('consumer'));
  assert.equal(root.dataset.consumer, 'kept');
  assert.equal(document.querySelector('script'), null);
  // HTML parsing normalizes CRLF; React's escaped SSR bytes retain the input CR.
  assert.match(markup({ source }), /\r\n/u);
  assert.equal(document.querySelector('code').textContent, source.replaceAll('\r\n', '\n'));
  assert.equal(document.querySelectorAll('.muxui-code-block-line').length, 3);
  assert.deepEqual([...document.querySelectorAll('.muxui-code-block-number')].map((node) => node.dataset.lineNumber), ['1', '2', '3']);
  assert.ok([...document.querySelectorAll('.muxui-code-block-number')].every((node) => node.getAttribute('aria-hidden') === 'true' && node.textContent === ''));
  assert.equal(document.querySelector('pre').tabIndex, 0);
  assert.equal(document.querySelector('button').type, 'button');
  assert.equal(document.querySelector('button').getAttribute('aria-label'), 'Copy code');
  assert.ok(document.querySelector('button').classList.contains('muxui-icon-button'));
  assert.equal(document.querySelector('button').textContent, '');
  assert.equal(document.querySelector('button .lucide-copy').getAttribute('aria-hidden'), 'true');
  assert.equal(documentOf({ source: '', copyable: false, lineNumbers: false }).querySelector('code').textContent, '');
  assert.equal(documentOf({ source: 'x', copyable: false, lineNumbers: false }).querySelector('button, .muxui-code-block-number'), null);
  for (const props of [{}, { source: 'x', mode: 'other' }, { source: 'x', before: 'x' }, { mode: 'diff', before: '', after: '', source: 'x' }, { source: 'x', children: 'x' }, { source: 'x', dangerouslySetInnerHTML: { __html: 'x' } }]) {
    assert.throws(() => markup(props), TypeError);
  }
});

test('CodeBlock diff reconstructs both inputs and numbers empty, mixed, repeated, and trailing-newline changes', () => {
  for (const [before, after] of [
    ['', ''], ['', 'a\n'], ['a\n', ''], ['same', 'same'],
    ['a\nb\nc', 'a\nx\nc\ny'], ['a\na\nb\na', 'a\nb\na\na'],
    ['a', 'a\n'], ['a\n', 'a'], ['\n', '\n\n'], ['a\r\nb', 'a\r\nc'],
  ]) {
    const document = documentOf({ mode: 'diff', before, after });
    const rows = [...document.querySelectorAll('.muxui-code-block-line')];
    const original = rows.filter((row) => row.dataset.change !== 'added');
    const updated = rows.filter((row) => row.dataset.change !== 'removed');
    assert.equal(original.map((row) => row.querySelector('.muxui-code-block-text').textContent.replace(/\n$/u, '')).join('\n'), before.replaceAll('\r\n', '\n'));
    assert.equal(updated.map((row) => row.querySelector('.muxui-code-block-text').textContent.replace(/\n$/u, '')).join('\n'), after.replaceAll('\r\n', '\n'));
    assert.deepEqual(original.map((row) => row.querySelectorAll('.muxui-code-block-number')[0].dataset.lineNumber), original.map((_, i) => String(i + 1)));
    assert.deepEqual(updated.map((row) => row.querySelectorAll('.muxui-code-block-number')[1].dataset.lineNumber), updated.map((_, i) => String(i + 1)));
    for (const row of rows.filter((row) => row.dataset.change !== 'context')) {
      assert.match(row.querySelector('.muxui-code-block-sr-only').textContent, /^(Added|Removed) line: /u);
      assert.equal(row.querySelector('.muxui-code-block-marker').getAttribute('aria-hidden'), 'true');
    }
    const description = document.querySelector('pre').getAttribute('aria-describedby');
    assert.match(document.getElementById(description).textContent, /Original.*first column.*Updated.*second/u);
    assert.equal(document.querySelector('button').getAttribute('aria-label'), 'Copy updated code');
  }
  const mixed = documentOf({ mode: 'diff', before: 'a\nb\nc', after: 'a\nx\nc\ny' });
  assert.deepEqual([...mixed.querySelectorAll('.muxui-code-block-line')].map((row) => row.dataset.change), ['context', 'removed', 'added', 'context', 'added']);
});

test('CodeBlock work and input bounds are exact with an honest replacement fallback', () => {
  const input = (prefix, length) => Array.from({ length }, (_, i) => `${prefix}${i}`).join('\n');
  const precise = markup({ mode: 'diff', before: input('old', 499), after: input('new', 499) });
  assert.match(precise, /data-diff-strategy="minimal"/u);
  const fallback = markup({ mode: 'diff', before: `same\n${input('old', 500)}\nend`, after: `same\n${input('new', 499)}\nend` });
  assert.match(fallback, /data-diff-strategy="replacement"/u);
  assert.match(fallback, /Large change shown as removed and added lines/u);
  assert.equal((fallback.match(/data-change="context"/gu) ?? []).length, 2);
  assert.doesNotThrow(() => markup({ source: 'x'.repeat(1_000_000) }));
  assert.throws(() => markup({ source: 'x'.repeat(1_000_001) }), RangeError);
  assert.doesNotThrow(() => markup({ source: '\n'.repeat(9_999) }));
  assert.throws(() => markup({ source: '\n'.repeat(10_000) }), RangeError);
  assert.throws(() => markup({ mode: 'diff', before: '\n'.repeat(10_000), after: '' }), RangeError);
  assert.throws(() => markup({ mode: 'diff', before: '', after: 'x'.repeat(1_000_001) }), RangeError);
});

test('CodeBlock SSR hydrates without clipboard access and keeps exact client text, ref, and native copy events', async () => {
  const source = '\t<x>\r\n  kept  \n';
  const ref = React.createRef();
  const nativeEvents = [];
  const element = e({ source, ref, onCopy: (event) => nativeEvents.push(event.currentTarget.tagName) });
  const dom = new JSDOM(`<!doctype html><div id="root">${renderToString(element)}</div>`);
  const restore = installDom(dom);
  let accesses = 0;
  Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, get() { accesses++; return undefined; } });
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    assert.equal(accesses, 0);
    assert.equal(ref.current, document.querySelector('.muxui-code-block'));
    await act(async () => { ref.current.dispatchEvent(new Event('copy', { bubbles: true })); });
    assert.deepEqual(nativeEvents, ['DIV']);
    await act(async () => { root.render(e({ source, ref, wrap: true })); });
    assert.equal(document.querySelector('.muxui-code-block').dataset.wrap, 'true');
    assert.equal(document.querySelector('code').textContent, source.replaceAll('\r\n', '\n'));
    await act(async () => root.unmount());
  } finally { restore(); }
});

test('CodeBlock copies exact input and announces only fulfillment; rejects unavailable, failed, and stale completion', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom, { layoutStubs: true });
  const writes = [];
  let finish;
  let root;
  const setClipboard = (value) => Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value });
  try {
    setClipboard({ writeText(text) { writes.push(text); return new Promise((resolve) => { finish = resolve; }); } });
    const source = '\t<x>\r\n  exact  \n';
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(e({ source })); });
    const button = document.querySelector('button');
    await act(async () => button.focus());
    assert.equal(document.activeElement, button);
    await act(async () => button.click());
    assert.deepEqual(writes, [source]);
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.ok(button.querySelector('.muxui-button-spinner'));
    assert.equal(document.querySelector('[role="status"]').textContent, '');
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    await act(async () => button.click());
    assert.deepEqual(writes, [source]);
    await act(async () => finish());
    assert.ok(button.querySelector('.lucide-check'));
    assert.equal(button.getAttribute('aria-label'), 'Copy code');
    assert.equal(button.disabled, false);
    assert.equal(document.querySelector('[role="status"]').textContent, 'Code copied.');

    const after = 'new\n';
    await act(async () => root.render(e({ mode: 'diff', before: 'old', after })));
    assert.ok(button.querySelector('.lucide-copy'));
    assert.equal(button.getAttribute('aria-label'), 'Copy updated code');
    await act(async () => button.click());
    assert.equal(writes.at(-1), after);
    await act(async () => root.render(e({ source: 'changed' })));
    await act(async () => finish());
    assert.equal(document.querySelector('[role="status"]').textContent, '');

    for (const clipboard of [undefined, { writeText: async () => { throw new Error('Denied'); } }]) {
      setClipboard(clipboard);
      await act(async () => document.querySelector('button').click());
      assert.equal(document.querySelector('.muxui-code-block').dataset.copyState, 'error');
      assert.match(document.querySelector('[role="status"]').textContent, /Could not copy code/u);
      assert.ok(document.querySelector('button .lucide-copy'));
      assert.equal(document.querySelector('button').disabled, false);
      assert.equal(document.querySelector('[role="tooltip"]'), null);
      assert.match(document.querySelector('.muxui-code-block-notice').textContent, /Could not copy/u);
    }
    await act(async () => root.render(e({ mode: 'diff', before: 'old', after: 'new' })));
    await act(async () => document.querySelector('button').click());
    assert.match(document.querySelector('[role="status"]').textContent, /Could not copy updated code/u);
    assert.doesNotMatch(document.querySelector('[role="status"]').textContent, /Select and copy/u);
    setClipboard({ writeText: () => new Promise((resolve) => { finish = resolve; }) });
    await act(async () => document.querySelector('button').click());
    await act(async () => root.unmount());
    await act(async () => finish());
    assert.equal(document.querySelector('#root').textContent, '');
  } finally { restore(); }
});

test('CodeBlock replaces and cleans up its three-second feedback timer without resetting newer requests', async (context) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom, { layoutStubs: true });
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  context.mock.method(globalThis, 'setTimeout', (callback, delay, ...args) => {
    if (delay !== 3000) return originalSetTimeout(callback, delay, ...args);
    const timer = { callback, cleared: false };
    timers.push(timer);
    return timer;
  });
  context.mock.method(globalThis, 'clearTimeout', (timer) => {
    if (timers.includes(timer)) timer.cleared = true;
    else originalClearTimeout(timer);
  });
  let finish;
  let root;
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: () => new Promise((resolve) => { finish = resolve; }) } });
  const status = () => document.querySelector('.muxui-code-block').dataset.copyState;
  const activate = async () => act(async () => document.querySelector('button').click());
  try {
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(e({ source: 'exact' })); });
    await activate();
    assert.equal(timers.length, 0, 'expiry starts at fulfillment');
    await act(async () => finish());
    assert.equal(status(), 'copied');
    assert.equal(timers.length, 1);
    await activate();
    assert.equal(timers[0].cleared, true);
    await act(async () => timers[0].callback());
    assert.equal(status(), 'pending', 'an expired old timer cannot reset a new pending write');
    await act(async () => finish());
    await act(async () => timers[0].callback());
    assert.equal(status(), 'copied', 'an expired old timer cannot reset newer success');
    await act(async () => timers[1].callback());
    assert.equal(status(), 'idle');
    assert.ok(document.querySelector('button .lucide-copy'));
    assert.equal(document.querySelector('[role="status"]').textContent, 'Code copied.');

    await activate();
    await act(async () => document.querySelector('button').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
    await act(async () => finish());
    assert.equal(status(), 'idle', 'leaving during a write suppresses visible fulfillment');
    assert.equal(timers.length, 2);
    assert.equal(document.querySelector('[role="status"]').textContent, 'Code copied.');

    for (const props of [{ source: 'changed' }, { mode: 'diff', before: 'old', after: 'changed' }, { mode: 'diff', before: 'old', after: 'changed', copyable: false }]) {
      await activate();
      await act(async () => finish());
      const timer = timers.at(-1);
      await act(async () => root.render(e(props)));
      assert.equal(timer.cleared, true);
      await act(async () => timer.callback());
      assert.equal(status(), 'idle');
      assert.equal(document.querySelector('[role="status"]').textContent, '');
    }
    await act(async () => root.render(e({ source: 'unmount' })));
    await activate();
    await act(async () => finish());
    const timer = timers.at(-1);
    await act(async () => root.unmount());
    assert.equal(timer.cleared, true);
    await act(async () => timer.callback());
    assert.equal(document.querySelector('#root').textContent, '');
  } finally {
    if (document.querySelector('#root').childNodes.length) await act(async () => root?.unmount());
    context.mock.restoreAll();
    restore();
  }
});

test('CodeBlock CSS keeps metadata out of selection, token-derived wrapping, forced colors, and visible focus', async () => {
  const css = await readFile(new URL('../src/supplemental/code-block.css', import.meta.url), 'utf8');
  assert.match(css, /\.muxui-code-block-number::before \{ content: attr\(data-line-number\)/u);
  assert.match(css, /user-select: none/u);
  assert.match(css, /white-space: pre-wrap; overflow-wrap: anywhere/u);
  assert.match(css, /forced-colors: active/u);
  assert.match(css, /\.muxui-code-block-text span \{ color: CanvasText !important; \}/u);
  assert.match(css, /:focus-visible/u);
  assert.doesNotMatch(css, /animation:|@keyframes|#[\da-f]{3,8}\b/u);
});

test('warm-engine SSR stays plain, hydrates safely, and diff tokens retain each original document context', async () => {
  const before = '/* open\r\nconst value = "comment";\r\n*/\r\nconst end = 1;\r\n';
  const after = '// closed\r\nconst value = "comment";\r\nconst end = 2;\r\n';
  const documents = await highlightCodeDocuments([before, after], 'typescript');
  assert.ok(documents);
  const props = { mode: 'diff', before, after, language: ' TS ' };
  const html = renderToString(e(props));
  assert.doesNotMatch(html, /muxui-code-block-token-/u);
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`);
  const restore = installDom(dom);
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), e(props), { onRecoverableError: (error) => errors.push(error) }); });
    for (let attempt = 0; attempt < 100 && !document.querySelector('.muxui-code-block-token-link'); attempt++) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }
    assert.deepEqual(errors, []);
    assert.equal(document.querySelector('code').dataset.language, ' TS ');
    assert.ok(document.querySelector('.muxui-code-block-token-link'));
    for (const row of document.querySelectorAll('.muxui-code-block-line')) {
      const removed = row.dataset.change === 'removed';
      const numbers = row.querySelectorAll('.muxui-code-block-number');
      const number = Number(numbers[removed ? 0 : 1].dataset.lineNumber);
      const expected = documents[removed ? 0 : 1][number - 1];
      const tokens = [...row.querySelector('.muxui-code-block-text').children];
      assert.deepEqual(tokens.map((token) => ({ text: token.textContent, role: token.classList.contains('muxui-code-block-token-link') ? 'link' : token.classList.contains('muxui-code-block-token-strong') ? 'strong' : undefined })), expected);
    }
    await act(async () => root.render(e({ source: '<script>unsafe()</script>\r\n\tconst x = 1;\n\r\u2028', language: 'typescript' })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    assert.equal(document.querySelector('script'), null);
    assert.equal(document.querySelector('code').textContent, '<script>unsafe()</script>\r\n\tconst x = 1;\n\r\u2028');
    await act(async () => root.unmount());
  } finally { restore(); }
});
