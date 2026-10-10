import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Sidebar } from '../src/supplemental/index.mjs';

const h = React.createElement;
const Icon = ({ className }) => h('svg', { className, 'aria-hidden': true });
const tree = (providerProps = {}, rootProps = {}) => h(Sidebar.Provider, providerProps,
  h(Sidebar.Toggle, null),
  h(Sidebar.Root, { 'aria-label': 'Workspace', ...rootProps },
    h(Sidebar.Header, null, h(Sidebar.Search)),
    h(Sidebar.NavList, null,
      h(Sidebar.NavItem, { href: '/inbox', icon: Icon, badge: '3' }, 'Inbox'),
      h(Sidebar.Section, { label: 'Projects' }, h(Sidebar.NavItem, { icon: Icon, items: [{ href: '/now', label: 'Now' }] }, 'Roadmap')))));

test('Sidebar Provider, Root, and Toggle render on the server without a window', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');

  const expanded = renderToString(tree({ shortcut: 'b' }));
  assert.doesNotMatch(expanded, /data-collapsed/u);
  assert.match(expanded, /data-foldable/u);
  assert.match(expanded, /aria-expanded="true"/u);
  assert.match(expanded, /aria-label="Toggle sidebar"/u);

  const folded = renderToString(tree({ defaultCollapsed: true }));
  assert.match(folded, /data-collapsed/u);
  assert.match(folded, /aria-expanded="false"/u);

  // Toggle points at the Root the Provider named, and a Root with its own id keeps it.
  const rootId = /<aside[^>]* id="([^"]+)"/u.exec(expanded)?.[1];
  assert.ok(rootId, 'Root receives an id from the Provider');
  assert.ok(expanded.includes(`aria-controls="${rootId}"`));
  assert.match(renderToString(tree({}, { id: 'primary-sidebar' })), /<aside[^>]* id="primary-sidebar"/u);
});

test('Sidebar Section labels its nested list and a Root outside a Provider renders as before', () => {
  const html = renderToString(tree());
  const labelId = /class="muxui-sidebar__section-label" id="([^"]+)"|id="([^"]+)" class="muxui-sidebar__section-label"/u.exec(html);
  assert.ok(labelId, 'the Section label has an id');
  assert.ok(html.includes(`aria-labelledby="${labelId[1] ?? labelId[2]}"`));

  const plain = renderToString(h(Sidebar.Root, null, h(Sidebar.Header, null, h(Sidebar.Search)), h(Sidebar.NavList, null, h(Sidebar.NavItem, { href: '/', icon: Icon }, 'Home'))));
  assert.doesNotMatch(plain, /data-foldable|data-collapsed|search-button/u);
});

test('Sidebar Toggle requires a Provider', () => {
  assert.throws(() => renderToString(h(Sidebar.Toggle, null)), /Sidebar\.Toggle must be used inside Sidebar\.Provider/u);
});
