import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { Breadcrumb, Breadcrumbs as AriaBreadcrumbs, LinkContext } from 'react-aria-components';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Button } from '../src/button.mjs';
import { Breadcrumbs, Link } from '../src/components.mjs';
import { GridList, Table, Tree } from '../src/collections.mjs';
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

// Link inherits an item's disabled state exactly where React Aria hands it to a nested Button, and in react-aria-components 1.20.0
// that is a GridListItem alone. TreeItem and Table Row provide ButtonContext only for their chevron and drag slots, and ListBox
// options and Menu items provide none (they cannot hold interactive content). If a React Aria upgrade starts handing the state to
// a nested Button elsewhere, this test fails on that row: extend GridListItemDisabledContext to that collection.
test('Link and Button stay enabled in a disabled Tree item or Table row, where React Aria hands neither a disabled state', async () => {
  const controls = (id) => h('span', null, h(Link, { href: `#${id}` }, `Open ${id}`), h(Button, null, `Act ${id}`));
  const columns = [{ id: 'name', label: 'Name', isRowHeader: true }];
  const collections = {
    'tree item': h(Tree, { 'aria-label': 'Tree', items: [{ id: 'a', label: controls('a'), textValue: 'a', disabled: true }] }),
    'table row': h(Table, { 'aria-label': 'Table', columns, rows: [{ id: 'a', name: controls('a'), disabled: true }] }),
    'disabled table': h(Table, { 'aria-label': 'Table', columns, disabled: true, rows: [{ id: 'a', name: controls('a') }] }),
  };
  for (const [name, element] of Object.entries(collections)) {
    const view = await mount(element);
    try {
      assert.deepEqual(state(linkIn(view.container)), ['a', null, null], `${name}: a nested Link stays an anchor`);
      assert.equal(view.container.querySelector('button.muxui-button').disabled, false, `${name}: a nested Button stays enabled`);
    } finally {
      await view.dispose();
    }
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

// Link reads a private GridList item context, so every React Aria LinkContext outside a disabled
// item behaves as it did in rc.3, where Link always passed an explicit isDisabled.
test('a Link in a React Aria Breadcrumb current item stays an enabled anchor', async () => {
  const view = await mount(h(AriaBreadcrumbs, { 'aria-label': 'Trail' },
    h(Breadcrumb, { id: 'home' }, h(Link, { href: '/' }, 'Home')),
    h(Breadcrumb, { id: 'now' }, h(Link, { href: '/now' }, 'Now'))));
  try {
    const links = [...view.container.querySelectorAll('.muxui-link')];
    assert.deepEqual(links.map(state), [['a', null, null], ['a', null, null]], 'the current item no longer disables the Link');
    assert.equal(links[1].getAttribute('aria-current'), 'page', 'the Breadcrumb still supplies aria-current');
    assert.equal(links[1].getAttribute('href'), '/now');
  } finally {
    await view.dispose();
  }
});

test('a Link in an enabled GridList item still receives an outer LinkContext', async () => {
  const pressed = [];
  const log = [];
  const outer = { 'aria-current': 'page', onPress: () => pressed.push('outer') };
  const view = await mount(h(LinkContext.Provider, { value: outer }, fixture({}, log)));
  try {
    const [open, blocked] = [...view.container.querySelectorAll('[role="row"]')];
    assert.equal(linkIn(open).getAttribute('aria-current'), 'page', 'the outer provider reaches a Link in an enabled item');
    assert.equal(linkIn(blocked).getAttribute('aria-current'), 'page', 'and a Link in a disabled item');
    assert.equal(state(linkIn(open))[0], 'a');
    await act(async () => linkIn(open).click());
    assert.deepEqual(pressed, ['outer'], 'its onPress still runs beside the Link\'s own');
    assert.deepEqual(log, [['link', 'open']]);
  } finally {
    await view.dispose();
  }
});

// An empty href already disables the Link, so no href attribute is rendered and React has nothing to warn about.
test('Link with an empty href renders a disabled span without an href attribute and logs no React warning', async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const view = await mount(h('div', null, h(Link, { href: '' }, 'Empty'), h(Link, { href: '/ok' }, 'Valid')));
  try {
    const [empty, valid] = [...view.container.querySelectorAll('.muxui-link')];
    assert.deepEqual(state(empty), ['span', 'true', 'true'], 'an empty href disables the Link');
    assert.equal(empty.hasAttribute('href'), false, 'the empty string is not rendered as an attribute');
    assert.equal(valid.getAttribute('href'), '/ok', 'a real href is untouched');
    assert.doesNotMatch(renderToString(h(Link, { href: '' }, 'Empty')), /href/u, 'server markup carries no href either');
    assert.deepEqual(errors, [], 'no console error, including the empty href warning');
  } finally {
    console.error = original;
    await view.dispose();
  }
});
