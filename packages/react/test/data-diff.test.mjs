import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { DataDiff } from '../src/supplemental/data-diff.mjs';
import { installDom } from './support/dom.mjs';

const columns = [{ id: 'name', label: 'Name' }, { id: 'stock', label: 'Stock' }];
const rows = [
  { id: 'old', label: 'Old flavor', kind: 'removed', values: { name: 'Rocky Road', stock: 0 } },
  { id: 'context', label: 'Mint flavor', kind: 'unchanged', values: { name: 'Mint Chip', stock: false } },
  { id: 'new', label: 'New flavor', kind: 'added', values: { name: 'Pistachio', stock: null } },
  { id: 'update', label: 'Vanilla flavor', kind: 'updated', before: { name: 'Vanilla', stock: 4 }, after: { name: 'Vanilla', stock: 8 } },
  { id: 'locked', label: 'Unavailable flavor', kind: 'added', disabled: true, values: { name: 'Locked', stock: 2 } },
];
const element = (props = {}) => React.createElement(DataDiff, { label: 'Proposed changes', columns, rows, ...props });
const markup = (props) => renderToStaticMarkup(element(props));
const documentOf = (props) => new JSDOM(markup(props)).window.document;
const rowInput = (id) => document.querySelector(`[data-row-id="${id}"] input`);
const selected = () => [...document.querySelectorAll('tbody input:checked')].map((input) => input.closest('tr').dataset.rowId);

test('DataDiff renders escaped scalars, labeled table cells, explicit change semantics, and honest empty/absent actions', () => {
  const malicious = '<script>window.executed=true</script>';
  const document = documentOf({
    id: 'review', className: 'consumer', title: 'Native tooltip', 'data-consumer': 'kept',
    rows: [{ ...rows[0], values: { name: malicious, stock: 0 } }, ...rows.slice(1)],
  });
  assert.equal(document.querySelector('script'), null);
  assert.equal(document.querySelector('[data-row-id="old"] .muxui-data-diff-cell').textContent.includes(malicious), true);
  assert.equal(document.querySelector('[data-row-id="old"] td.muxui-data-diff-cell').textContent, '0');
  assert.equal(document.querySelector('[data-row-id="context"] td.muxui-data-diff-cell').textContent, 'false');
  assert.equal(document.querySelector('[data-row-id="new"] td.muxui-data-diff-cell').textContent, 'null');
  assert.equal(document.querySelector('#review').title, 'Native tooltip');
  assert.equal(document.querySelector('#review').dataset.consumer, 'kept');
  assert.ok(document.querySelector('#review').classList.contains('consumer'));
  assert.equal(document.getElementById(document.querySelector('table').getAttribute('aria-labelledby')).textContent, 'Proposed changes');
  assert.ok(document.querySelector('th[scope="col"]'));
  assert.ok(document.querySelector('thead tr').firstElementChild.matches('th.muxui-data-diff-selection[scope="col"]'));
  assert.deepEqual([...document.querySelectorAll('thead .muxui-data-diff-column')].map((cell) => cell.textContent), ['Name', 'Stock']);
  for (const row of document.querySelectorAll('tbody tr')) {
    assert.ok(row.firstElementChild.matches('td.muxui-data-diff-selection'));
    assert.ok(row.children[1].matches('th.muxui-data-diff-cell[scope="row"]'));
  }
  assert.equal(document.querySelector('[data-row-id="context"] input'), null);
  const changedCell = document.querySelector('[data-row-id="update"] td.muxui-data-diff-cell');
  assert.match(changedCell.textContent, /Before: 4After: 8/u);
  assert.equal(changedCell.querySelector('del').textContent, '4');
  assert.equal(changedCell.querySelector('ins').textContent, '8');
  assert.equal(document.querySelector('button').disabled, true);
  const empty = documentOf({ rows: [], onApply() {}, emptyMessage: 'No proposed edits.' });
  assert.match(empty.querySelector('tbody').textContent, /No proposed edits/u);
  assert.equal(empty.querySelector('input').disabled, true);
  assert.equal(empty.querySelector('button').disabled, true);
  assert.equal(empty.querySelector('[role="status"]').textContent, 'No changes selected');
  const unavailable = documentOf({ rows: rows.map((row) => ({ ...row, disabled: true })), onApply() {} });
  assert.equal(unavailable.querySelector('thead input').disabled, true);
  assert.equal(unavailable.querySelector('button').disabled, true);
});

test('DataDiff rejects ambiguous identity, hidden columns, non-scalar values, and mixed row shapes', () => {
  const invalid = [
    { label: '' }, { columns: [] }, { columns: [{ id: '', label: 'Name' }] },
    { columns: [...columns, columns[0]] }, { rows: [...rows, rows[0]] },
    { rows: [{ ...rows[0], id: ' ' }] }, { rows: [{ ...rows[0], label: '' }] },
    { rows: [{ ...rows[0], kind: 'other' }] }, { rows: [{ ...rows[0], disabled: 'yes' }] },
    { rows: [{ ...rows[0], values: { name: 'Missing' } }] },
    { rows: [{ ...rows[0], values: { name: 'Hidden', stock: 0, extra: 'not reviewed' } }] },
    { rows: [{ ...rows[0], values: { name: React.createElement('b'), stock: 0 } }] },
    { rows: [{ ...rows[0], values: { name: 'Invalid', stock: NaN } }] },
    { rows: [{ ...rows[0], values: { name: 'Invalid', stock: Infinity } }] },
    { rows: [{ ...rows[0], before: { name: 'Extra', stock: 0 } }] },
    { rows: [{ ...rows[3], values: { name: 'Extra', stock: 0 } }] },
    { rows: [{ ...rows[3], after: undefined }] },
    { selectedIds: 'old' }, { defaultSelectedIds: [1] },
    { children: 'Extra' }, { dangerouslySetInnerHTML: { __html: '<b>Extra</b>' } },
  ];
  for (const props of invalid) assert.throws(() => markup(props), TypeError);
  let reads = 0;
  const values = { stock: 0, get name() { reads++; return 'Getter'; } };
  assert.throws(() => markup({ rows: [{ ...rows[0], values }] }), TypeError);
  assert.equal(reads, 0);
  assert.throws(() => markup({ rows: [{ ...rows[0], values: { name: 'Symbol', stock: 0, [Symbol('hidden')]: 1 } }] }), TypeError);
});

test('DataDiff SSR hydrates with stable labeling, default selections, ref, and native host events', async () => {
  const ref = React.createRef();
  const keys = [];
  const props = { ref, onApply() {}, onKeyDown: (event) => keys.push(event.currentTarget.tagName) };
  const dom = new JSDOM(`<!doctype html><div id="root">${renderToString(element(props))}</div>`);
  const restore = installDom(dom);
  const errors = [];
  let root;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element(props), { onRecoverableError: (error) => errors.push(error.message) }); });
    assert.deepEqual(errors, []);
    assert.equal(ref.current, document.querySelector('.muxui-data-diff'));
    assert.deepEqual(selected(), ['old', 'new', 'update']);
    assert.equal(document.querySelector('thead input').checked, true);
    await act(async () => rowInput('old').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })));
    assert.deepEqual(keys, ['DIV']);
  } finally { if (root) await act(async () => root.unmount()); restore(); }
});

test('DataDiff native row/select-all selection gives ordered counts and applies only explicit selected IDs', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  const applied = [];
  const originalRows = JSON.stringify(rows);
  let root;
  try {
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(element({ onSelectionChange: (ids) => changes.push(ids), onApply: (ids) => applied.push(ids) })); });
    assert.equal(changes.length, 0);
    assert.equal(applied.length, 0);
    assert.equal(document.querySelector('[role="status"]').textContent, '1 removal · 1 addition · 1 update');
    await act(async () => document.querySelector('[data-row-id="old"] td.muxui-data-diff-cell').click());
    assert.equal(changes.length, 1);
    assert.deepEqual(selected(), ['new', 'update']);
    assert.deepEqual(changes.at(-1), ['new', 'update']);
    assert.equal(document.querySelector('thead input').indeterminate, true);
    assert.equal(document.querySelector('thead input').getAttribute('aria-checked'), 'mixed');
    await act(async () => document.querySelector('thead input').click());
    assert.deepEqual(selected(), ['old', 'new', 'update']);
    await act(async () => document.querySelector('thead input').click());
    assert.deepEqual(selected(), []);
    assert.equal(document.querySelector('button').disabled, true);
    await act(async () => document.querySelector('button').click());
    assert.equal(applied.length, 0);
    await act(async () => { rowInput('update').click(); });
    assert.equal(changes.length, 4);
    await act(async () => { rowInput('old').click(); });
    assert.equal(changes.length, 5);
    assert.deepEqual(selected(), ['old', 'update']);
    await act(async () => document.querySelector('button').click());
    assert.deepEqual(applied, [['old', 'update']]);
    assert.equal(JSON.stringify(rows), originalRows);
    assert.deepEqual(selected(), ['old', 'update']);
  } finally { if (root) await act(async () => root.unmount()); restore(); }
});

test('DataDiff controlled requests remain controlled, prune stale IDs, and gate unavailable controls', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const changes = [];
  const applied = [];
  const props = { selectedIds: ['stale', 'locked', 'context', 'update', 'old'], onSelectionChange: (ids) => changes.push(ids), onApply: (ids) => applied.push(ids) };
  let root;
  try {
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(element(props)); });
    assert.deepEqual(selected(), ['old', 'update']);
    await act(async () => rowInput('new').click());
    assert.deepEqual(changes.at(-1), ['old', 'new', 'update']);
    assert.deepEqual(selected(), ['old', 'update']);
    await act(async () => document.querySelector('button').click());
    assert.deepEqual(applied.at(-1), ['old', 'update']);
    await act(async () => root.render(element({ ...props, rows: rows.map((row) => row.id === 'old' ? { ...row, disabled: true } : row).filter((row) => row.id !== 'update') })));
    assert.deepEqual(selected(), []);
    assert.equal(document.querySelector('button').disabled, true);
    for (const gate of [{ pending: true }, { disabled: true }]) {
      await act(async () => root.render(element({ ...props, ...gate })));
      assert.ok([...document.querySelectorAll('input, button')].every((control) => control.disabled));
      const count = changes.length;
      await act(async () => document.querySelector('[data-row-id="new"] td.muxui-data-diff-cell').click());
      assert.equal(changes.length, count);
    }
    await act(async () => root.render(element({ ...props, selectedIds: ['new'] })));
    assert.deepEqual(selected(), ['new']);
    await act(async () => document.querySelector('button').click());
    assert.deepEqual(applied.at(-1), ['new']);
  } finally { if (root) await act(async () => root.unmount()); restore(); }
});

test('DataDiff uncontrolled defaults prune removed, disabled, and unchanged rows without resurrecting them', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const applied = [];
  let root;
  try {
    await act(async () => { root = createRoot(document.querySelector('#root')); root.render(element({ defaultSelectedIds: ['old', 'new', 'context', 'locked', 'missing'], onApply: (ids) => applied.push(ids) })); });
    assert.deepEqual(selected(), ['old', 'new']);
    await act(async () => root.render(element({ rows: rows.map((row) => row.id === 'old' ? { ...row, disabled: true } : row).filter((row) => row.id !== 'new'), onApply: (ids) => applied.push(ids) })));
    assert.deepEqual(selected(), []);
    await act(async () => root.render(element({ onApply: (ids) => applied.push(ids) })));
    assert.deepEqual(selected(), []);
    await act(async () => rowInput('update').click());
    await act(async () => document.querySelector('button').click());
    assert.deepEqual(applied.at(-1), ['update']);
    await act(async () => root.render(element({ rows: rows.map((row) => row.id === 'update' ? { id: row.id, label: row.label, kind: 'unchanged', values: row.after } : row), onApply: (ids) => applied.push(ids) })));
    assert.deepEqual(selected(), []);
  } finally { if (root) await act(async () => root.unmount()); restore(); }
});

test('DataDiff CSS remains token-owned with visible focus, contained overflow, and forced-color semantics', async () => {
  const css = await readFile(new URL('../src/supplemental/data-diff.css', import.meta.url), 'utf8');
  assert.match(css, /forced-colors: active/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /overflow: auto/u);
  assert.match(css, /overflow-wrap: anywhere/u);
  assert.doesNotMatch(css, /animation:|@keyframes|#[\da-f]{3,8}\b|--muxui-component-codeblock/u);
});
