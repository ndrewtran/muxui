import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { I18nProvider } from 'react-aria-components';
import { useCommandPalette } from '../src/supplemental/command-palette.mjs';

const h = React.createElement;
function snapshot(options, locale = 'en-US') {
  let result;
  function Probe() { result = useCommandPalette(options); return null; }
  renderToString(h(I18nProvider, { locale }, h(Probe)));
  return result;
}

const commands = Object.freeze([
  { id: 'keyword', title: 'Archive', keywords: ['café'], group: 'History' },
  { id: 'substring', title: 'Open café', group: 'Places' },
  { id: 'prefix', title: 'Café settings', group: 'Places' },
  { id: 'exact', title: 'Café', group: 'Places' },
  { id: 'subtitle', title: 'Recent', subtitle: 'Café visits', group: 'History' },
  { id: 'group', title: 'Preferences', group: 'Café' },
]);
const ids = (items) => items.map(({ id }) => id);

test('command matching is locale-aware across all search fields with stable title ranking and groups', () => {
  const palette = snapshot({ commands, defaultQuery: ' cafe ' });
  assert.deepEqual(ids(palette.filteredCommands), ['exact', 'prefix', 'substring', 'keyword', 'subtitle', 'group']);
  assert.deepEqual(palette.groupedCommands.map(({ id, commands: items }) => [id, ids(items)]), [
    ['Places', ['exact', 'prefix', 'substring']], ['History', ['keyword', 'subtitle']], ['Café', ['group']],
  ]);
  assert.deepEqual(ids(snapshot({ commands, query: '' }).filteredCommands), ids(commands));
  assert.deepEqual(snapshot({ commands, query: 'unmatched' }).groupedCommands, []);
  assert.deepEqual(ids(snapshot({ commands: [{ id: 'light', title: 'Işık' }], query: 'ışık' }, 'tr-TR').filteredCommands), ['light']);
});

test('command filtering, ordering and grouping accept application policy without mutating source results', () => {
  assert.deepEqual(ids(snapshot({ commands, query: 'irrelevant', filter: false, sort: false }).filteredCommands), ids(commands));
  assert.deepEqual(ids(snapshot({ commands, query: 'cafe', sort: () => 0 }).filteredCommands), ids(commands));
  const result = snapshot({
    commands, query: 'application query',
    filter: (command, query) => query === 'application query' && command.group === 'History',
    sort: (a, b) => b.id.localeCompare(a.id),
    groupBy: () => 'recent', getGroupTitle: (id) => id.toUpperCase(),
  });
  assert.deepEqual(ids(result.filteredCommands), ['subtitle', 'keyword']);
  assert.equal(result.groupedCommands[0].title, 'RECENT');
  assert.deepEqual(ids(commands), ['keyword', 'substring', 'prefix', 'exact', 'subtitle', 'group']);
  assert.equal(snapshot({ commands: [{ id: 'a', title: 'A' }] }).groupedCommands[0].title, '');
});

test('command execution awaits actions, respects dismissal policy, and leaves failures open', async () => {
  const calls = [];
  let resolveAction;
  const command = { id: 'async', title: 'Async', action: () => new Promise((resolve) => { calls.push('action'); resolveAction = resolve; }) };
  const palette = snapshot({ commands: [command], onAction: async ({ id }) => { calls.push(id); }, close: () => calls.push('close') });
  const pending = palette.runCommand('async');
  assert.deepEqual(calls, ['action']);
  resolveAction();
  await pending;
  assert.deepEqual(calls, ['action', 'async', 'close']);
  await palette.runCommand('missing');
  await palette.runCommand({ ...command, disabled: true });
  assert.equal(calls.length, 3);

  const item = palette.getItemProps({ id: 'link', title: 'Docs', subtitle: 'Help', href: '/docs', target: '_blank', disabled: true });
  assert.equal(item.disabled, true);
  assert.equal(item.closeOnSelect, false);
  assert.equal(item.description, 'Help');
  assert.equal(item.target, '_blank');
  assert.equal('isDisabled' in item, false);
  assert.equal('onAction' in item, false);

  let closes = 0;
  const noClose = snapshot({ commands: [], closeOnSelect: false, close: () => closes++ });
  await noClose.runCommand({ id: 'stay', title: 'Stay' });
  assert.equal(closes, 0);
  await noClose.runCommand({ id: 'leave', title: 'Leave', closeOnSelect: true });
  assert.equal(closes, 1);
  const keepOpen = snapshot({ commands: [], close: () => closes++ });
  await keepOpen.runCommand({ id: 'stay', title: 'Stay', closeOnSelect: false });
  await assert.rejects(keepOpen.runCommand({ id: 'fail', title: 'Fail', action: async () => { throw new Error('Command failed'); } }), /Command failed/);
  const failedGlobal = snapshot({ commands: [], close: () => closes++, onAction: async () => { throw new Error('Global failed'); } });
  await assert.rejects(failedGlobal.runCommand({ id: 'fail', title: 'Fail' }), /Global failed/);
  assert.equal(closes, 1);
});

test('item activation handles action failures through onError or the global reporter without closing', async () => {
  const failure = new Error('Command failed');
  const command = { id: 'failure', title: 'Failure', action: async () => { throw failure; } };
  const failures = [];
  let closes = 0;
  const palette = snapshot({ commands: [command], onError: (error, item) => failures.push([error, item.id]), close: () => closes++ });
  await palette.getItemProps(command).onActivate();
  assert.deepEqual(failures, [[failure, 'failure']]);
  assert.equal(closes, 0);

  const previous = globalThis.reportError;
  const reported = [];
  globalThis.reportError = (error) => reported.push(error);
  try {
    await snapshot({ commands: [command], close: () => closes++ }).getItemProps(command).onActivate();
    assert.deepEqual(reported, [failure]);
    assert.equal(closes, 0);
  } finally {
    if (previous === undefined) delete globalThis.reportError;
    else globalThis.reportError = previous;
  }
});

test('command query supports uncontrolled updates and controlled parent ownership', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const names = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = names.map((name) => [name, globalThis[name]]);
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root'));
  let palette;
  const changes = [];
  function Probe(props) { palette = useCommandPalette({ commands, onQueryChange: (value) => changes.push(value), ...props }); return null; }
  try {
    await act(() => root.render(h(Probe, { defaultQuery: 'cafe' })));
    await act(() => palette.setQuery('unmatched'));
    assert.equal(palette.query, 'unmatched');
    assert.equal(palette.filteredCommands.length, 0);
    await act(() => palette.setQuery(''));
    assert.equal(palette.filteredCommands.length, commands.length);
    await act(() => root.render(h(Probe, { query: 'cafe' })));
    await act(() => palette.setQuery('next'));
    assert.equal(palette.query, 'cafe');
    await act(() => root.render(h(Probe, { query: 'next' })));
    assert.equal(palette.query, 'next');
    assert.deepEqual(changes, ['unmatched', '', 'next']);
  } finally {
    await act(() => root.unmount());
    for (const [name, value] of previous) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
    dom.window.close();
  }
});
