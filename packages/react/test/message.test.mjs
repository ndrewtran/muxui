import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString, renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Message } from '../src/supplemental/message.mjs';
import { createDom } from './support/dom.mjs';
const e = (props, content = '<script>escaped</script>') => React.createElement(Message, props, content);

test('Message preserves article semantics, escaped content, safe links and content/action/source/follow-up order', () => {
  const dom = new JSDOM(renderToStaticMarkup(e({ author: 'Assistant', content: 'Native RDFa', title: 'Native title', sender: 'assistant', actions: [{ id: 'help', label: 'Helpful', onAction() {} }], sources: ['https://react.dev/', '/guide', '#citation', 'javascript:alert(1)', 'data:text/html,test', 'java\nscript:test'].map((href, i) => ({ id: String(i), label: `Source ${i}`, href })), defaultSourcesExpanded: true, followUps: [{ id: 'next', label: 'Explain more' }], onFollowUp() {} })));
  const article = dom.window.document.querySelector('article'); assert.equal(article.getAttribute('content'), 'Native RDFa'); assert.equal(article.title, 'Native title'); assert.equal(article.querySelector('script'), null);
  assert.equal(article.querySelector('.muxui-message-content').textContent, '<script>escaped</script>'); assert.equal(article.querySelectorAll('a').length, 3);
  assert.deepEqual([...article.children].map((node) => node.className), ['muxui-message-author', 'muxui-message-content', 'muxui-message-toolbar', 'muxui-message-sources', 'muxui-message-follow-ups', 'muxui-message-sr-only']);
  assert.equal(new JSDOM(renderToStaticMarkup(e({ followUps: [{ id: 'unwired', label: 'No callback' }] }))).window.document.querySelector('button'), null);
});

test('Message hydration, disclosure/action/follow-up callbacks and streaming updates preserve focus and native events', async () => {
  const ref = React.createRef(); const calls = []; const props = { ref, author: 'Assistant', onCopy: (event) => calls.push(event.currentTarget.tagName), streaming: true, actions: [{ id: 'help', label: 'Helpful', pressed: false, onAction: () => calls.push('help') }], sources: [{ id: 'one', label: 'React', href: 'https://react.dev/' }], onSourcesExpandedChange: (value) => calls.push(value), followUps: [{ id: 'next', label: 'Explain more' }], onFollowUp: (item) => calls.push(item.id) };
  const { restore } = createDom(`<div id="root">${renderToString(e(props, 'First'))}</div>`); let root;
  try {
    const errors = []; await act(async () => { root = hydrateRoot(document.querySelector('#root'), e(props, 'First'), { onRecoverableError: (error) => errors.push(error) }); }); assert.deepEqual(errors, []); assert.equal(ref.current.tagName, 'ARTICLE');
    const trigger = document.querySelector('.muxui-message-sources-trigger'); trigger.focus(); await act(async () => trigger.click()); assert.equal(trigger.getAttribute('aria-expanded'), 'true'); assert.equal(document.querySelector('ul').hidden, false);
    await act(async () => document.querySelector('.muxui-message-action').click()); await act(async () => document.querySelector('.muxui-message-follow-ups button').click());
    await act(async () => ref.current.dispatchEvent(new Event('copy', { bubbles: true })));
    assert.deepEqual(calls, [true, 'help', 'next', 'ARTICLE']);
    await act(async () => root.render(e(props, 'Second streamed token'))); assert.equal(document.activeElement, trigger); assert.equal(document.querySelector('[role=status]').textContent, 'Response in progress.');
    await act(async () => root.render(e({ ...props, streaming: false, sourcesExpanded: false }, 'Final'))); assert.equal(document.querySelector('[role=status]').textContent, ''); assert.equal(document.querySelector('ul').hidden, true);
    await act(async () => root.unmount());
  } finally { restore(); }
});
