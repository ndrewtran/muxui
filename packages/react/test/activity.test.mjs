import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString, renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Activity } from '../src/supplemental/activity.ts';
import { createDom } from './support/dom.mjs';
const e = (props) => React.createElement(Activity, { label: 'Checks', ...props });

test('Activity names all finite statuses, uses stable IDs, and keeps empty state neutral', () => {
  const items = ['queued','running','completed','failed','cancelled'].map((status) => ({ id: status, label: `<${status}>`, status, time: ['completed', 'failed'].includes(status) ? '4s' : undefined }));
  const dom = new JSDOM(renderToStaticMarkup(e({ items }))); assert.equal(dom.window.document.querySelector('.muxui-activity').dataset.muxuiStatus, 'failed');
  assert.equal(dom.window.document.querySelector('.muxui-activity').hasAttribute('data-muxui-variant'), false);
  assert.deepEqual([...dom.window.document.querySelectorAll('.muxui-activity__item .muxui-activity__status')].map((node) => node.textContent), ['Queued','Running','Completed','Failed','Cancelled']);
  assert.deepEqual([...dom.window.document.querySelectorAll('.muxui-activity__status-time')].map((node) => node.textContent), ['Queued','Running','Completed in 4s','Failed in 4s','Cancelled']);
  assert.equal(dom.window.document.querySelector('details,script'), null);
  const empty = new JSDOM(renderToStaticMarkup(e({ items: [] }))).window.document; assert.equal(empty.querySelector('.muxui-activity').hasAttribute('data-muxui-status'), false); assert.match(empty.querySelector('[role=status]').textContent, /No activity/u);
  assert.throws(() => renderToStaticMarkup(e({ items: [{ id: 'a', status: 'other' }] })), TypeError);
  assert.throws(() => renderToStaticMarkup(e({ items: [{ id: 'a', status: 'queued' }, { id: 'a', status: 'running' }] })), TypeError);
});

test('Activity hydrates native refs/events, controlled aggregate disclosure and static live status independently of details/time', async () => {
  const ref = React.createRef(); const calls = []; const props = { ref, title: 'Native title', 'data-muxui-variant': 'caller-metadata', variant: 'unsupported-layout', onClick: (event) => calls.push(event.currentTarget.tagName), onExpandedChange: (value) => calls.push(value), items: [{ id: 'one', label: 'Read notes', status: 'running', time: '3s', details: 'Local caller detail', actions: [{ id: 'cancel', label: 'Cancel', onAction: () => calls.push('cancel') }] }] };
  const { restore } = createDom(`<div id="root">${renderToString(e(props))}</div>`); let root;
  try {
    const errors = []; await act(async () => { root = hydrateRoot(document.querySelector('#root'), e(props), { onRecoverableError: (error) => errors.push(error) }); }); assert.deepEqual(errors, []); assert.equal(ref.current.tagName, 'DIV'); assert.equal(ref.current.title, 'Native title');
    assert.equal(ref.current.dataset.muxuiVariant, 'caller-metadata'); assert.equal(ref.current.hasAttribute('variant'), false);
    const button = document.querySelector('.muxui-activity__trigger'); await act(async () => button.click()); assert.equal(document.querySelector('.muxui-activity__items-host').getAttribute('hidden'), 'until-found'); assert.equal(document.querySelector('.muxui-activity__motion-panel').getAttribute('aria-hidden'), 'true'); assert.deepEqual(calls, [false, 'DIV']);
    await act(async () => root.render(e({ ...props, expanded: true }))); assert.equal(document.querySelector('.muxui-activity__items-host').hasAttribute('hidden'), false);
    const live = document.querySelector('[role=status]').textContent; await act(async () => root.render(e({ ...props, expanded: true, items: [{ ...props.items[0], time: '4s', details: 'Updated detail' }] }))); assert.equal(document.querySelector('[role=status]').textContent, live);
    await act(async () => document.querySelector('.muxui-activity__actions button').click()); assert.equal(calls.at(-2), 'cancel');
    await act(async () => root.unmount());
  } finally { restore(); }
});

test('Activity initially closed SSR retains content behind native and inert disclosure boundaries', () => {
  const document = new JSDOM(renderToString(e({ defaultExpanded: false, items: [{ id: 'one', label: 'Read', status: 'queued', details: 'Supplied detail' }] }))).window.document;
  assert.equal(document.querySelector('.muxui-activity__trigger').getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('.muxui-activity__items-host').hasAttribute('hidden'), true);
  assert.equal(document.querySelectorAll('.muxui-activity__motion-panel[aria-hidden="true"][inert]').length, 2);
  assert.equal(document.querySelector('details').open, false);
  assert.equal(document.querySelector('summary').getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('.muxui-activity__details').textContent, 'Supplied detail');
});

test('Activity item defaultExpanded opens a disclosure row at mount, hydrates cleanly, and is read once', async () => {
  const items = [
    { id: 'open', label: 'Read', status: 'queued', details: 'Supplied detail', defaultExpanded: true },
    { id: 'closed', label: 'Write', status: 'queued', details: 'Other detail' },
    { id: 'plain', label: 'Plan', status: 'queued', defaultExpanded: true },
  ];
  const [open, closed, plain] = new JSDOM(renderToString(e({ items }))).window.document.querySelectorAll('.muxui-activity__item');
  assert.equal(open.querySelector('details').open, true);
  assert.equal(open.querySelector('summary').getAttribute('aria-expanded'), 'true');
  assert.equal(open.querySelector('.muxui-activity__motion-panel').hasAttribute('inert'), false);
  assert.equal(closed.querySelector('details').open, false);
  assert.equal(closed.querySelector('summary').getAttribute('aria-expanded'), 'false');
  assert.equal(plain.querySelector('details, summary'), null);
  // An open row inside a closed aggregate stays open and hidden with it.
  const collapsed = new JSDOM(renderToString(e({ defaultExpanded: false, items }))).window.document;
  assert.equal(collapsed.querySelector('.muxui-activity__items-host').hasAttribute('hidden'), true);
  assert.equal(collapsed.querySelector('details').open, true);

  const { restore } = createDom(`<div id="root">${renderToString(e({ items }))}</div>`); let root;
  try {
    const errors = [];
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), e({ items }), { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    await act(async () => root.render(e({ items: items.map((item) => ({ ...item, defaultExpanded: !item.defaultExpanded })) })));
    const [first, second] = document.querySelectorAll('details');
    assert.equal(first.open, true);
    assert.equal(first.querySelector('summary').getAttribute('aria-expanded'), 'true');
    assert.equal(second.open, false);
    assert.equal(second.querySelector('summary').getAttribute('aria-expanded'), 'false');
    await act(async () => root.unmount());
  } finally { restore(); }
});
