import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Sidebar } from '../src/supplemental/index.mjs';
import { installDom } from './support/dom.mjs';

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

test('Sidebar density marks only a compact Root and leaves the default markup alone', () => {
  const plain = renderToString(tree());
  assert.doesNotMatch(plain, /data-density/u);
  assert.equal(renderToString(tree({}, { density: 'default' })), plain);
  assert.match(renderToString(tree({}, { density: 'compact' })), /<aside[^>]* data-density="compact"/u);
});

test('Sidebar Toggle requires a Provider', () => {
  assert.throws(() => renderToString(h(Sidebar.Toggle, null)), /Sidebar\.Toggle must be used inside Sidebar\.Provider/u);
});

const nav = (...items) => h(Sidebar.Root, null, h(Sidebar.NavList, null, ...items));
// Lucide icons are covered by their own test; keep their path data out of the pinned markup.
const withoutSvgPaths = (html) => html.replace(/<svg[^>]*lucide[^>]*>.*?<\/svg>/gu, '<svg/>');

/** Category, then block, then variant: two levels of nested groups under a top-level item. */
const catalog = (props = {}, blockProps = {}) => h(Sidebar.NavItem, { href: '/catalog', ...props, items: [
  { id: 'button', label: 'Button', href: '/catalog/button', ...blockProps, items: [
    { label: 'Primary', href: '/catalog/button/primary', current: true },
    { label: 'Secondary', href: '/catalog/button/secondary' },
  ] },
  { label: 'Plain group', items: [{ label: 'Leaf', href: '/catalog/leaf' }] },
] }, 'Catalog');

test('items without a link keep the markup Sidebar always rendered', () => {
  // Shared with the pre-nesting implementation: a details group, an optional current header, and plain child links.
  assert.equal(
    withoutSvgPaths(renderToString(nav(h(Sidebar.NavItem, { icon: Icon, current: true, badge: '2', items: [{ href: '/now', label: 'Now', current: true }, { href: '/next', label: 'Next' }] }, 'Roadmap')))),
    '<aside class="muxui-sidebar"><ul class="muxui-sidebar__nav-list"><li class="muxui-sidebar__nav-item"><details>'
      + '<summary class="muxui-sidebar__nav-link muxui-sidebar__nav-link--current"><svg class="muxui-sidebar__nav-icon" aria-hidden="true"></svg><span class="muxui-sidebar__nav-label">Roadmap</span><span class="muxui-sidebar__nav-badge">2</span><svg/></summary>'
      + '<ul class="muxui-sidebar__nav-children">'
      + '<li class="muxui-sidebar__nav-item"><a class="muxui-sidebar__nav-link muxui-sidebar__nav-child-link muxui-sidebar__nav-link--current" data-rac="" href="/now" tabindex="0" data-react-aria-pressable="true" aria-current="page" data-current="true">Now</a></li>'
      + '<li class="muxui-sidebar__nav-item"><a class="muxui-sidebar__nav-link muxui-sidebar__nav-child-link" data-rac="" href="/next" tabindex="0" data-react-aria-pressable="true">Next</a></li>'
      + '</ul></details></li></ul></aside>',
  );
});

test('groups render closed unless defaultExpanded or expanded says otherwise', () => {
  const closed = renderToString(nav(catalog()));
  assert.match(closed, /<button[^>]*aria-expanded="false"/u);
  assert.match(closed, /<ul id="[^"]+" class="muxui-sidebar__nav-children" hidden="">/u);
  assert.doesNotMatch(closed, /<details[^>]* open/u);

  const open = renderToString(nav(catalog({ defaultExpanded: true }, { defaultExpanded: true })));
  assert.doesNotMatch(open, /<ul[^>]* hidden/u);
  assert.match(open, /<button[^>]*aria-expanded="true"/u);

  assert.match(renderToString(nav(h(Sidebar.NavItem, { defaultExpanded: true, items: [{ label: 'Leaf', href: '/leaf' }] }, 'Group'))), /<details open="">/u);
  assert.match(renderToString(nav(h(Sidebar.NavItem, { expanded: true, items: [{ label: 'Leaf', href: '/leaf' }] }, 'Group'))), /<details open="">/u);
});

test('a link group pairs the link with a toggle that names and controls its list', () => {
  const html = renderToString(nav(catalog({ defaultExpanded: true })));
  const row = /<div class="muxui-sidebar__nav-row">(.*?)<\/div>/u.exec(html)?.[1] ?? '';
  assert.match(row, /^<a [^>]*href="\/catalog"[^>]*><span id="[^"]+" class="muxui-sidebar__nav-label">Catalog<\/span><\/a><button /u);
  const toggle = /<button [^>]*>/u.exec(row)?.[0] ?? '';
  const controls = /aria-controls="([^"]+)"/u.exec(toggle)?.[1];
  assert.ok(controls && html.includes(`<ul id="${controls}"`), 'the toggle points at the nested list');
  const named = /aria-labelledby="([^"]+)"/u.exec(toggle)?.[1];
  assert.ok(named && row.includes(`<span id="${named}" class="muxui-sidebar__nav-label">Catalog</span>`), 'the toggle is named by the rendered label');
  assert.match(toggle, /class="muxui-sidebar__nav-btn muxui-sidebar__nav-toggle/u);
  // The block group nests under the category list with its own row, and the current variant carries the marker.
  assert.equal([...html.matchAll(/muxui-sidebar__nav-row/gu)].length, 2);
  assert.match(html, /aria-current="page"[^>]*>Primary<\/a>/u);
  assert.equal([...html.matchAll(/aria-current="page"/gu)].length, 1);
});

test('a link group names its toggle from the rendered label, whether it is text or a component', async () => {
  const Settings = () => h('span', null, 'Set', h('b', null, 'tings'));
  const Profile = () => h('em', null, 'Profile');
  const group = h(Sidebar.NavItem, { href: '/settings', defaultExpanded: true, items: [{ id: 'profile', label: h(Profile), href: '/settings/profile', defaultExpanded: true, items: [{ label: 'Avatar', href: '/settings/profile/avatar' }] }] }, h(Settings));
  await withDom(nav(group), async (document) => {
    const toggles = [...document.querySelectorAll('.muxui-sidebar__nav-toggle')];
    assert.equal(toggles.length, 2);
    const names = toggles.map((toggle) => {
      assert.equal(toggle.hasAttribute('aria-label'), false, 'the name comes from the label, not a string copy of it');
      return document.getElementById(toggle.getAttribute('aria-labelledby'))?.textContent;
    });
    assert.deepEqual(names, ['Settings', 'Profile'], 'a component label names the toggle at the top level and nested');
  });
});

/** Renders into a jsdom window; `act` flushes the React updates a click causes. */
async function withDom(tree, run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  try {
    await act(async () => root.render(tree));
    await run(document);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
}
const click = (node) => act(async () => node.click());

test('an uncontrolled details group opens and closes from its summary and reports each change', async () => {
  const changes = [];
  await withDom(nav(h(Sidebar.NavItem, { onExpandedChange: (next) => changes.push(next), items: [{ label: 'Leaf', href: '/leaf' }] }, 'Group')), async (document) => {
    const group = document.querySelector('details');
    assert.equal(group.open, false);
    await click(group.querySelector('summary'));
    assert.equal(group.open, true);
    await click(group.querySelector('summary'));
    assert.equal(group.open, false);
    assert.deepEqual(changes, [true, false]);
  });
});

test('a controlled group follows its prop and stays put when the caller refuses a change', async () => {
  const changes = [];
  const setters = {};
  function Controlled({ accept }) {
    const [details, setDetails] = React.useState(false);
    const [link, setLink] = React.useState(false);
    Object.assign(setters, { setDetails, setLink });
    return nav(
      h(Sidebar.NavItem, { expanded: details, onExpandedChange: (next) => { changes.push(['details', next]); if (accept) setDetails(next); }, items: [{ label: 'Leaf', href: '/leaf' }] }, 'Group'),
      h(Sidebar.NavItem, { href: '/block', expanded: link, onExpandedChange: (next) => { changes.push(['link', next]); if (accept) setLink(next); }, items: [{ label: 'Variant', href: '/block/variant' }] }, 'Block'));
  }
  for (const accept of [false, true]) {
    changes.length = 0;
    await withDom(h(Controlled, { accept }), async (document) => {
      const details = document.querySelector('details');
      const list = document.querySelector('ul.muxui-sidebar__nav-children[id]');
      const toggle = document.querySelector('.muxui-sidebar__nav-toggle');
      await click(details.querySelector('summary'));
      await click(toggle);
      assert.deepEqual(changes, [['details', true], ['link', true]]);
      assert.equal(details.open, accept, `the details group ${accept ? 'follows' : 'ignores'} the request`);
      assert.equal(toggle.getAttribute('aria-expanded'), String(accept), `the link group ${accept ? 'follows' : 'ignores'} the request`);
      assert.equal(list.hidden, !accept);
      // The caller can also move the groups on its own.
      await act(async () => { setters.setDetails(true); setters.setLink(true); });
      assert.equal(details.open, true);
      assert.equal(list.hidden, false);
      await act(async () => { setters.setDetails(false); setters.setLink(false); });
      assert.equal(details.open, false);
      assert.equal(toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(list.hidden, true);
    });
  }
});

test('the browser opening a controlled details group, as find in page does, is handed back to the caller', async () => {
  await withDom(nav(h(Sidebar.NavItem, { expanded: false, items: [{ label: 'Leaf', href: '/leaf' }] }, 'Group')), async (document) => {
    const group = document.querySelector('details');
    await act(async () => {
      group.open = true;
      group.dispatchEvent(new document.defaultView.Event('toggle'));
    });
    assert.equal(group.open, false);
  });
});

test('a link group toggles through its button, opens each level on its own, and marks the current page', async () => {
  await withDom(nav(catalog()), async (document) => {
    const toggles = () => [...document.querySelectorAll('.muxui-sidebar__nav-toggle')];
    assert.equal(toggles().length, 2);
    const [category, block] = toggles();
    assert.deepEqual(toggles().map((toggle) => toggle.getAttribute('aria-expanded')), ['false', 'false']);
    await click(block);
    assert.deepEqual(toggles().map((toggle) => toggle.getAttribute('aria-expanded')), ['false', 'true'], 'the block opens without its category');
    await click(category);
    assert.equal(category.getAttribute('aria-expanded'), 'true');
    assert.equal(document.getElementById(category.getAttribute('aria-controls')).hidden, false);
    assert.equal(document.getElementById(block.getAttribute('aria-controls')).hidden, false);

    const current = [...document.querySelectorAll('[aria-current="page"]')];
    assert.deepEqual(current.map((link) => [link.textContent, link.getAttribute('href')]), [['Primary', '/catalog/button/primary']]);
    assert.ok(current[0].classList.contains('muxui-sidebar__nav-link--current'));
    // Following the link does not touch the group.
    await click(document.querySelector('a[href="/catalog/button"]'));
    assert.equal(block.getAttribute('aria-expanded'), 'true');
    await click(category);
    assert.equal(document.getElementById(category.getAttribute('aria-controls')).hidden, true);
  });
});

test('entries keep their state by id when siblings come and go', async () => {
  let setFilter;
  function Filtered() {
    const [only, set] = React.useState(false);
    setFilter = set;
    return nav(h(Sidebar.NavItem, { items: [
      ...(only ? [] : [{ id: 'first', label: 'First', href: '/first', items: [{ label: 'One', href: '/first/one' }] }]),
      { id: 'second', label: 'Second', href: '/second', defaultExpanded: true, items: [{ label: 'Two', href: '/second/two' }] },
    ] }, 'Group'));
  }
  await withDom(h(Filtered), async (document) => {
    const second = () => [...document.querySelectorAll('.muxui-sidebar__nav-toggle')].find((toggle) => document.getElementById(toggle.getAttribute('aria-labelledby')).textContent === 'Second');
    assert.equal(second().getAttribute('aria-expanded'), 'true');
    await click(second());
    assert.equal(second().getAttribute('aria-expanded'), 'false');
    await act(async () => setFilter(true));
    assert.equal(second().getAttribute('aria-expanded'), 'false', 'removing a sibling does not reset the group');
  });
});
