import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('client effects discard stale source, language, mode, and unmount completions and keep failures plain', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import React, { act } from 'react';
    import { createRoot } from 'react-dom/client';
    import { createDom } from './test/support/dom.mjs';
    globalThis.highlightCalls = [];
    registerHooks({ load(url, context, next) {
      if (!url.endsWith('/code-block-highlight.mjs')) return next(url, context);
      return { format: 'module', shortCircuit: true, source: 'export function highlightCodeDocuments(sources, language) { return new Promise((resolve) => globalThis.highlightCalls.push({sources, language, resolve})); }' };
    } });
    const { CodeBlock } = await import('./src/supplemental/code-block.mjs');
    const { restore } = createDom();
    const root = createRoot(document.querySelector('#root'));
    const render = async (props) => act(async () => root.render(React.createElement(CodeBlock, props)));
    const resolve = async (index) => act(async () => highlightCalls[index].resolve(highlightCalls[index].sources.map((source) => source.split('\\n').map((text) => [{ text, role: 'link' }]))));
    try {
      await render({source: 'first', language: 'typescript'});
      await render({source: 'second', language: 'typescript'});
      await resolve(0);
      assert.equal(document.querySelector('code').textContent, 'second');
      assert.equal(document.querySelector('.muxui-code-block-token-link'), null);
      await resolve(1);
      assert.equal(document.querySelector('.muxui-code-block-token-link').textContent, 'second');
      await render({source: 'second', language: 'python'});
      assert.equal(document.querySelector('.muxui-code-block-token-link'), null);
      await render({mode: 'diff', before: 'before', after: 'after', language: 'python'});
      await resolve(2);
      assert.equal(document.querySelector('.muxui-code-block-token-link'), null);
      await resolve(3);
      assert.deepEqual([...document.querySelectorAll('.muxui-code-block-token-link')].map((node) => node.textContent), ['before', 'after']);
      await render({source: 'failure', language: 'python'});
      await act(async () => highlightCalls[4].resolve(null));
      assert.equal(document.querySelector('code').textContent, 'failure');
      assert.equal(document.querySelector('.muxui-code-block-token-link'), null);
      await render({source: 'unmounted', language: 'python'});
      await act(async () => root.unmount());
      await resolve(5);
      assert.equal(document.querySelector('#root').textContent, '');
    } finally { restore(); }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Shiki loading failure returns plain output and retries the engine on a later request', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    let attempts = 0;
    registerHooks({ resolve(id, context, next) {
      if (id === 'shiki/core' && attempts++ === 0) throw new Error('Unavailable engine');
      return next(id, context);
    } });
    const { highlightCodeDocuments } = await import('./src/supplemental/code-block-highlight.mjs');
    assert.equal(await highlightCodeDocuments(['const x = 1;'], 'typescript'), null);
    assert.ok(await highlightCodeDocuments(['const x = 1;'], 'typescript'));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
