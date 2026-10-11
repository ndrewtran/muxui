import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Button } from '../src/button.mjs';
import { Breadcrumbs, Link } from '../src/components.mjs';
import { GridList } from '../src/collections.mjs';
import { createDom } from './support/dom.mjs';

const h = React.createElement;

/** A GridList holding one open and one blocked item, each with a Link and a Button. */
function fixture({ blocked = true, linkProps, buttonProps, ...listProps } = {}, log = []) {
  const controls = (id) => [
    h(Link, { key: 'link', href: `#${id}`, onActivate: () => log.push(['link', id]), ...linkProps }, `Open ${id}`),
    h(Button, { key: 'button', onActivate: () => log.push(['button', id]), ...buttonProps }, `Act ${id}`),
  ];
  return h(GridList, { 'aria-label': 'Cards', ...listProps },
    h(GridList.Item, { id: 'open', textValue: 'Open' }, ...controls('open')),
    h(GridList.Item, { id: 'blocked', textValue: 'Blocked', disabled: blocked }, ...controls('blocked')));
}

async function mount(element) {
  const env = createDom();
  const container = document.querySelector('#root');
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    rerender: (next) => act(async () => root.render(next)),
    async dispose() {
      await act(async () => root.unmount());
      env.restore();
    },
  };
}

const linkIn = (row) => row.querySelector('.muxui-link');
// A disabled Link renders a span, so the tag name is what separates an activatable anchor from an inert one.
const state = (node) => [node.localName, node.getAttribute('aria-disabled'), node.getAttribute('data-disabled')];

test('Link inherits a disabled GridList item the way Button does, and an enabled item leaves both active', async () => {
  const log = [];
  const view = await mount(fixture({}, log));
  try {
    const [open, blocked] = [...view.container.querySelectorAll('[role="row"]')];
    assert.deepEqual(state(linkIn(open)), ['a', null, null], 'a Link in an enabled item stays an anchor');
    assert.deepEqual(state(linkIn(blocked)), ['span', 'true', 'true'], 'a Link in a disabled item is inert, like its Button');
    assert.equal(blocked.querySelector('button').disabled, true);
    assert.equal(open.querySelector('button').disabled, false);

    await act(async () => linkIn(blocked).click());
    await act(async () => blocked.querySelector('button').click());
    assert.deepEqual(log, [], 'neither nested control activates in a disabled item');
    await act(async () => linkIn(open).click());
    assert.deepEqual(log, [['link', 'open']]);
  } finally {
    await view.dispose();
  }
});

test('Link follows a disabled GridList root', async () => {
  const view = await mount(fixture({ blocked: false, disabled: true }));
  try {
    for (const row of view.container.querySelectorAll('[role="row"]')) {
      assert.equal(linkIn(row).getAttribute('data-disabled'), 'true', 'a disabled root disables every nested Link');
    }
    await view.rerender(fixture({ blocked: false }));
    for (const row of view.container.querySelectorAll('[role="row"]')) {
      assert.equal(linkIn(row).getAttribute('data-disabled'), null, 're-enabling the root re-enables the Links');
    }
  } finally {
    await view.dispose();
  }
});

test('an explicit Link disabled prop wins over its GridList item exactly as it does for Button', async () => {
  const log = [];
  const view = await mount(fixture({ linkProps: { disabled: false }, buttonProps: { disabled: false } }, log));
  try {
    const blocked = view.container.querySelectorAll('[role="row"]')[1];
    assert.equal(blocked.querySelector('button').disabled, false, 'Button precedent: an explicit false re-enables it');
    assert.deepEqual(state(linkIn(blocked)), ['a', null, null], 'Link matches: an explicit false re-enables it');
    await act(async () => linkIn(blocked).click());
    assert.deepEqual(log, [['link', 'blocked']]);
  } finally {
    await view.dispose();
  }

  const open = await mount(fixture({ linkProps: { disabled: true } }));
  try {
    assert.deepEqual(state(linkIn(open.container.querySelectorAll('[role="row"]')[0])), ['span', 'true', 'true'], 'an explicit true disables a Link in an enabled item');
  } finally {
    await open.dispose();
  }
});

test('a nested GridList restores its own items instead of inheriting the outer disabled item', async () => {
  const inner = h(GridList, { 'aria-label': 'Inner' }, h(GridList.Item, { id: 'inner', textValue: 'Inner' }, h(Link, { href: '#inner' }, 'Inner link')));
  const outer = h(GridList, { 'aria-label': 'Outer' },
    h(GridList.Item, { id: 'outer', textValue: 'Outer', disabled: true }, h(Link, { href: '#outer' }, 'Outer link'), inner));
  const view = await mount(outer);
  try {
    const links = [...view.container.querySelectorAll('.muxui-link')];
    assert.deepEqual(links.map((link) => link.getAttribute('data-disabled')), ['true', null]);
  } finally {
    await view.dispose();
  }
});

test('Link outside a GridList keeps its own disabled rules, and a Link without an href stays disabled', async () => {
  const view = await mount(h('div', null,
    h(Link, { href: '/a' }, 'Plain'),
    h(Link, { href: '/b', disabled: true }, 'Disabled'),
    h(Link, {}, 'No href'),
    h(Link, { href: '/c', disabled: false }, 'Explicit false'),
    h(Link, { href: '/d', current: true }, 'Current')));
  try {
    const links = [...view.container.querySelectorAll('.muxui-link')];
    assert.deepEqual(links.map(state), [
      ['a', null, null],
      ['span', 'true', 'true'],
      ['span', 'true', 'true'],
      ['a', null, null],
      ['a', null, null],
    ]);
    assert.equal(links[4].getAttribute('aria-current'), 'page');
  } finally {
    await view.dispose();
  }
});

test('Breadcrumbs links keep their disabled and current states inside a disabled GridList item', async () => {
  const items = [{ id: 'home', label: 'Home', href: '/' }, { id: 'docs', label: 'Docs', href: '/docs' }, { id: 'now', label: 'Now', href: '/now' }];
  const view = await mount(h('div', null,
    h(Breadcrumbs, { 'aria-label': 'Trail', items }),
    h(GridList, { 'aria-label': 'Cards' }, h(GridList.Item, { id: 'blocked', textValue: 'Blocked', disabled: true }, h(Breadcrumbs, { 'aria-label': 'Nested trail', items })))));
  try {
    const [plain, nested] = [...view.container.querySelectorAll('.muxui-breadcrumbs')];
    const summary = (nav) => [...nav.querySelectorAll('.muxui-breadcrumbs-item')].map((item) => [item.querySelector('a,span').localName, item.hasAttribute('data-current')]);
    assert.deepEqual(summary(plain), [['a', false], ['a', false], ['span', true]]);
    assert.deepEqual(summary(nested), summary(plain), 'a Breadcrumbs trail resolves its own link state, with the current item still a plain span');
  } finally {
    await view.dispose();
  }
});

test('Link renders the same server markup inside and outside a GridList', () => {
  const html = renderToString(fixture());
  assert.match(html, /<span[^>]*class="[^"]*muxui-link[^"]*"[^>]*data-disabled="true"/u, 'the blocked item server-renders an inert Link');
  assert.equal([...html.matchAll(/<a [^>]*class="[^"]*muxui-link/gu)].length, 1, 'only the open item renders an anchor');
});
