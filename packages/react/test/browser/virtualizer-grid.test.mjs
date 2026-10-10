import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { measureFocusRing, measureForcedSelection, measureSelectedContrast, measureSelectedPaint, pollUntil, settleMotion, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof for <Virtualizer layout="grid"> around a GridList of
// poster-like cards: 1,003 items with a 2:3 placeholder image, titles from one to
// twelve words, a nested Mux Link and Button, and three disabled items (5, 12 and
// 700). No column count the cases use divides 1,003, so the last grid row is
// always partial. The `count` option also loads 1 or 7 cards, a collection
// smaller than its column count.
//
// The fixture loads with a JSON `config`, in a `bounded` scroller (the GridList
// has a block size) or an unbounded `page` variant that the window scrolls.
// Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).

const COUNT = 1003;
const DISABLED = [5, 12, 700];

const entry = `
import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { GridList, Virtualizer } from '/src/collections.mjs';
import { Button } from '/src/button.mjs';
import { Link } from '/src/components.mjs';

const h = React.createElement;
const { mode = 'bounded', hydrate = false, count = ${COUNT}, initial = count, height = 560, selectionMode = 'single', controlled = false, withAction = false, disabled = ${JSON.stringify(DISABLED)}, className, options = {} } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
const disabledIds = new Set(disabled.map(String));
const words = ['Midnight', 'Harbour', 'Signal', 'Paper', 'Lantern', 'Orchard', 'Static', 'Meridian', 'Cinder', 'Atlas'];
const wordCounts = [1, 2, 4, 3, 7, 2, 12];
const title = (index) => Array.from({ length: wordCounts[index % wordCounts.length] }, (_, offset) => words[(index + offset * 3) % words.length]).join(' ') + ' ' + index;

window.__events = [];
const log = (...entry) => window.__events.push(entry);
const grid = () => document.querySelector('[role="grid"]');
// The rect rows are scrolled through: the scroller's, or the window's clipped by the grid.
const viewport = () => {
  const root = grid();
  const box = root.getBoundingClientRect();
  if (mode === 'bounded') return { top: box.top + root.clientTop, bottom: box.top + root.clientTop + root.clientHeight };
  return { top: Math.max(0, box.top), bottom: Math.min(innerHeight, box.bottom) };
};

// Names the focused card, plus the nested control when focus is inside one.
window.__focus = () => {
  const node = document.activeElement;
  const row = node?.closest?.('[role="row"]');
  if (!row) return node?.id || node?.tagName?.toLowerCase() || 'none';
  const card = row.querySelector('[data-card]')?.dataset.card;
  return node === row ? card : card + ':' + node.tagName.toLowerCase();
};
window.__selected = () => [...document.querySelectorAll('[role="row"][aria-selected="true"]')].map((row) => row.querySelector('[data-card]').dataset.card);
window.__scrollTo = (target) => {
  const root = grid();
  if (mode === 'bounded') root.scrollTop = target === 'end' ? root.scrollHeight : target * (root.scrollHeight - root.clientHeight);
  else window.scrollTo(0, target === 'end' ? document.scrollingElement.scrollHeight : target * (document.scrollingElement.scrollHeight - innerHeight));
};
window.__atEnd = () => {
  const root = grid();
  return mode === 'bounded' ? root.scrollTop + root.clientHeight >= root.scrollHeight - 1 : scrollY + innerHeight >= document.scrollingElement.scrollHeight - 1;
};
window.__scrollPosition = () => (mode === 'bounded' ? grid().scrollTop : scrollY);
window.__scrollBy = (pixels) => (mode === 'bounded' ? grid().scrollBy(0, pixels) : window.scrollBy(0, pixels));
// Whether the focused card sits fully inside the viewport.
window.__focusInView = () => {
  const row = document.activeElement?.closest('[role="row"]');
  if (!row) return false;
  const view = window.__snapshot().view;
  const box = row.getBoundingClientRect();
  return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
};
window.__snapshot = () => ({
  view: viewport(),
  rows: [...document.querySelectorAll('[role="row"]')].map((row) => {
    const box = row.getBoundingClientRect();
    return { index: Number(row.getAttribute('aria-rowindex')) - 1, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }),
  root: (() => {
    const root = grid();
    const box = root.getBoundingClientRect();
    const styles = getComputedStyle(root);
    return {
      left: box.left + root.clientLeft, right: box.left + root.clientLeft + root.clientWidth,
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight,
      columnGap: parseFloat(styles.columnGap), rowGap: parseFloat(styles.rowGap), padding: styles.padding,
    };
  })(),
  page: { scrollWidth: document.scrollingElement.scrollWidth, innerWidth },
});
// Parts of every mounted card that spill outside it.
window.__clipping = () => [...document.querySelectorAll('[role="row"]')].flatMap((row) => {
  const box = row.getBoundingClientRect();
  const problems = [];
  for (const part of row.querySelectorAll('[data-poster], [data-card], a, button')) {
    const rect = part.getBoundingClientRect();
    if (rect.top < box.top - 0.5 || rect.bottom > box.bottom + 0.5 || rect.left < box.left - 0.5 || rect.right > box.right + 0.5) problems.push(row.getAttribute('aria-rowindex') + ' ' + (part.dataset.card ?? part.dataset.poster ?? part.tagName));
  }
  // The card fills the box RAC positioned for it: the row's full height and the column's width.
  const wrapper = row.parentElement.getBoundingClientRect();
  if (Math.abs(wrapper.width - box.width) > 1 || Math.abs(wrapper.height - box.height) > 1.5) problems.push(row.getAttribute('aria-rowindex') + ' card ' + box.width + 'x' + box.height + ' in box ' + wrapper.width + 'x' + wrapper.height);
  if (row.scrollHeight > row.clientHeight + 1) problems.push(row.getAttribute('aria-rowindex') + ' scrollHeight ' + row.scrollHeight + ' > ' + row.clientHeight);
  if (row.scrollWidth > row.clientWidth + 1) problems.push(row.getAttribute('aria-rowindex') + ' scrollWidth ' + row.scrollWidth + ' > ' + row.clientWidth);
  return problems;
});
// The longest vertical stretch of the viewport, down each column's center, that is not on a card:
// by mounted card rects, or by elementFromPoint (RAC disables pointer events while scrolling).
// The last grid row can be partial, so its whole height counts as covered in every column,
// and a collection shorter than the viewport leaves the space below its last row empty.
window.__blank = (hitTest) => {
  const view = viewport();
  const cards = [...document.querySelectorAll('[role="row"]')].map((row) => ({ index: Number(row.getAttribute('aria-rowindex')) - 1, box: row.getBoundingClientRect() }));
  const boxes = cards.map(({ box }) => box);
  const centers = new Map(boxes.map((box) => [Math.round(box.left), box.left + box.width / 2]));
  const lastRow = cards.find(({ index }) => index === window.__shownCount - 1)?.box;
  const onCard = (x, y) => (lastRow && y >= lastRow.top && y <= lastRow.bottom) || (hitTest
    ? Boolean(document.elementFromPoint(x, y)?.closest('[role="row"]'))
    : boxes.some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom));
  let longest = 0;
  for (const x of centers.values()) {
    let run = 0;
    for (let y = view.top + 1; y < Math.min(view.bottom, lastRow?.bottom ?? Infinity) - 1; y += 4) {
      run = onCard(x, y) ? 0 : run + 4;
      longest = Math.max(longest, run);
    }
  }
  return { longest, columns: centers.size, rowGap: parseFloat(getComputedStyle(grid()).rowGap), hittable: getComputedStyle(grid().firstElementChild).pointerEvents !== 'none' };
};
// Resolves once the scroll position, the scroll extents, and the mounted row keys have
// not changed for several frames in a row, and rejects with what kept changing if
// they never settle.
window.__settled = () => new Promise((resolve, reject) => {
  const stableFrames = 6;
  const started = performance.now();
  let last = '';
  let stable = 0;
  const sample = () => JSON.stringify({
    scrollTop: [grid().scrollTop, scrollY],
    scrollHeight: [grid().scrollHeight, document.scrollingElement.scrollHeight],
    rows: [...document.querySelectorAll('[role="row"]')].map((row) => row.getAttribute('data-key')),
  });
  const tick = () => {
    const current = sample();
    stable = current === last ? stable + 1 : 0;
    last = current;
    if (stable >= stableFrames) resolve();
    else if (performance.now() - started > 6000) reject(new Error('the grid never settled; ' + stable + ' of ' + stableFrames + ' stable frames, last sample ' + current.slice(0, 300)));
    else requestAnimationFrame(tick);
  };
  tick();
});
// Samples the scroll position every frame for a while. min is the lowest position seen once
// the view first reached the from position, or null if it never did, so it shows whether a scroll was undone.
window.__watchScroll = (from, milliseconds) => new Promise((resolve) => {
  const started = performance.now();
  let min = null;
  const tick = () => {
    const position = window.__scrollPosition();
    if (position >= from || min !== null) min = Math.min(min ?? position, position);
    if (performance.now() - started >= milliseconds) resolve({ min });
    else requestAnimationFrame(tick);
  };
  tick();
});

const cards = Array.from({ length: count }, (_, index) => {
  const id = String(index);
  return h(GridList.Item, { key: id, id, textValue: title(index), disabled: disabledIds.has(id) },
    h('div', { 'data-poster': id, style: { inlineSize: '100%', aspectRatio: '2 / 3', borderRadius: 4, background: 'linear-gradient(135deg, #8cacb6, #3e3936)' } }),
    h('strong', { 'data-card': id }, title(index)),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
      h(Link, { href: '#' + id, onActivate: () => log('link', id) }, 'Open'),
      h(Button, { onActivate: () => log('button', id) }, 'Act')));
});

function Fixture() {
  const [selected, setSelected] = React.useState([]);
  window.__setSelected = setSelected;
  const [shown, setShown] = React.useState(initial);
  window.__show = setShown;
  window.__shownCount = shown;
  const list = h(GridList, {
    'aria-label': 'Posters', layout: 'grid', selectionMode, className,
    style: mode === 'bounded' ? { blockSize: height } : undefined,
    onSelectionChange: (next) => { log('selection', next === 'all' ? 'all' : next.join(',')); setSelected(next); },
    ...(controlled ? { selectedIds: selected } : {}),
    ...(withAction ? { onAction: (item) => log('action', item.id) } : {}),
  }, cards.slice(0, shown));
  return h(Virtualizer, { layout: 'grid', ...options }, list);
}
const container = document.getElementById('root');
if (hydrate) {
  // Server HTML first, as a server render would send it, then hydrate over it.
  container.innerHTML = renderToString(h(Fixture));
  window.__serverRows = container.querySelectorAll('[role="row"]').length;
  hydrateRoot(container, h(Fixture));
} else {
  createRoot(container).render(h(Fixture));
}
`;

const page = (url) => {
  const params = url.searchParams;
  const dark = params.get('scheme') === 'dark';
  return pageShell({
    // data-muxui-responsive makes the spacing tokens, and so the GridList gap, fluid in the viewport width.
    attributes: `data-muxui-color-scheme="${dark ? 'dark' : 'light'}" data-muxui-motion="full"${params.get('responsive') ? ' data-muxui-responsive' : ''}${params.get('dir') === 'rtl' ? ' dir="rtl" lang="ar"' : ''}`,
    head: '<link rel="stylesheet" href="/generated/styles.css"><style>.wide-gap { column-gap: 40px; row-gap: 12px; } body { background: var(--muxui-semantic-surface-canvas); }</style>',
    bodyAttributes: 'style="margin: 16px"',
    // WebKit on macOS skips plain buttons in sequential navigation; RAC controls carry tabindex.
    body: '<button id="before" tabindex="0">Before</button><div id="frame"><div id="root"></div></div><button id="after" tabindex="0">After</button>',
    entry: '/virtualizer-grid-entry.mjs',
  });
};

// Geometry derived from a __snapshot(): columns are the distinct item positions, grid rows
// group items by index, and a row is visible once it overlaps the viewport.
function analyze({ view, rows }, overscan = 2) {
  const columns = new Set(rows.map((row) => Math.round(row.left))).size;
  const gridRow = (row) => Math.floor(row.index / columns);
  const visible = rows.filter((row) => row.bottom > view.top + 1 && row.top < view.bottom - 1);
  const visibleRows = new Set(visible.map(gridRow)).size;
  return { columns, mounted: rows.length, visibleItems: visible.length, visibleRows, overscan, gridRow };
}

for (const engine of browserEngines()) {
  test(`Virtualizer layout="grid" in ${engine}`, { timeout: 900_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs', 'src/button.mjs', 'src/components.mjs'],
      pages: { '/virtualizer-grid.html': page },
      modules: { '/virtualizer-grid-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/virtualizer-grid.html?config=${encodeURIComponent('{"options":{"minItemWidth":180}}')}`, '[role="grid"] [role="row"]');
      const errors = [];
      const observerLoops = [];
      // Arabic locales make React Aria resolve right-to-left; the page sets dir to match.
      const driver = async (locale, dir, size = { width: 900, height: 700 }) => {
        const context = await browser.newContext({ locale, viewport: size });
        const tab = await context.newPage();
        // React Aria's unbounded virtualizer resizes its own observed GridList from a ResizeObserver
        // callback, which WebKit reports as a window error when the container width changes. Plain
        // React Aria raises it too and nothing breaks, so only that page-mode report is tolerated.
        const benignLoop = /^ResizeObserver loop completed with undelivered notifications\.$/u;
        tab.on('pageerror', (error) => (api.mode === 'page' && benignLoop.test(error.message) ? observerLoops : errors).push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        const api = {
          tab,
          mode: 'bounded',
          async open(config = {}, { scheme = 'light', responsive = false } = {}) {
            api.mode = config.mode ?? 'bounded';
            await tab.setViewportSize(size);
            await tab.goto(`${url}/virtualizer-grid.html?dir=${dir}&scheme=${scheme}&responsive=${responsive ? 1 : ''}&config=${encodeURIComponent(JSON.stringify(config))}`, { waitUntil: 'networkidle' });
            await tab.locator('[role="grid"] [role="row"]').first().waitFor({ timeout: 15_000 }).catch((error) => assert.fail(`no card rendered: ${error.message.split('\n')[0]}; page errors ${JSON.stringify(errors)}`));
            await tab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
            // A pointer left over from an earlier case would hover a card after reflow.
            await tab.mouse.move(0, 0);
            await api.settle();
          },
          settle: () => tab.evaluate(() => window.__settled()),
          snapshot: () => tab.evaluate(() => window.__snapshot()),
          async analysis(overscan) { return analyze(await api.snapshot(), overscan); },
          root: () => tab.locator('[role="grid"]'),
          card: (id) => tab.locator(`[data-card="${id}"]`),
          row: (id) => tab.locator(`[role="row"]:has([data-card="${id}"])`),
          events: () => tab.evaluate(() => window.__events),
          resetEvents: () => tab.evaluate(() => { window.__events.length = 0; }),
          selected: () => tab.evaluate(() => window.__selected()),
          focused: () => tab.evaluate(() => window.__focus()),
          expectFocus: (expected, message = 'focus') => pollUntil(tab, (value) => window.__focus() === value, expected, {
            message: `${message}: focus reaches ${expected}`,
            report: () => ({ focus: window.__focus(), scroll: window.__scrollPosition() }),
          }),
          async press(keys) {
            for (const [key, destination] of keys) {
              await tab.keyboard.press(key);
              await api.expectFocus(destination, `${key} moves focus to ${destination}`);
            }
          },
          // Tab from the control before the grid lands on the first card.
          async enter() {
            await tab.locator('#before').focus();
            await tab.keyboard.press('Tab');
            await api.expectFocus('0', 'Tab enters the grid on its first card');
          },
          // Scrolls to a fraction of the range, or the true end, which keeps growing until row measurements settle.
          // A wheel event first ends any focus reveal window left by a key press, as a user's own scroll would.
          async scrollTo(target) {
            await tab.evaluate(() => document.dispatchEvent(new WheelEvent('wheel', { bubbles: true })));
            for (let attempt = 0; attempt < 8; attempt++) {
              await tab.evaluate((value) => window.__scrollTo(value), target);
              await api.settle();
              if (target !== 'end' || await tab.evaluate(() => window.__atEnd())) return;
            }
            assert.fail(`the end of the grid never settled: ${JSON.stringify(await api.snapshot().then(({ root }) => ({ scrollHeight: root.scrollHeight, clientHeight: root.clientHeight })))} at ${await tab.evaluate(() => window.__scrollPosition())}`);
          },
          // Waits for the focused card to scroll fully into the viewport.
          expectFocusInView: (message) => pollUntil(tab, () => window.__focusInView(), undefined, {
            message: `${message}: the focused card is within the viewport`,
            report: () => ({ row: document.activeElement.closest('[role="row"]')?.getBoundingClientRect().toJSON(), view: window.__snapshot().view, scroll: window.__scrollPosition() }),
          }),
          // No stretch of the viewport longer than a row gap lacks a card, down any column's center.
          // `hit` waits for scrolling to end, then proves it with elementFromPoint.
          async expectNoBlank(message, { hit = false } = {}) {
            if (hit) {
              await pollUntil(tab, () => window.__blank(false).hittable, undefined, { message: `${message}: scrolling ends`, report: () => window.__blank(false) });
            }
            const { longest, rowGap } = await tab.evaluate((hitTest) => window.__blank(hitTest), hit);
            assert.ok(longest <= rowGap + 8, `${message}: a ${longest}px stretch of the viewport holds no card (row gap ${rowGap}px)`);
          },
          async expectTidy(message) {
            assert.deepEqual(await tab.evaluate(() => window.__clipping()), [], `${message}: card content stays inside its card`);
            const { root, page: pageSize } = await api.snapshot();
            assert.ok(root.scrollWidth <= root.clientWidth, `${message}: the grid never overflows horizontally (${root.scrollWidth} > ${root.clientWidth})`);
            assert.ok(pageSize.scrollWidth <= pageSize.innerWidth, `${message}: the page never overflows horizontally (${pageSize.scrollWidth} > ${pageSize.innerWidth})`);
          },
        };
        return api;
      };
      const ltr = await driver('en-US', 'ltr');
      const rtl = await driver('ar-EG', 'rtl');

      for (const mode of ['bounded', 'page']) {
        for (const overscan of [0, 1, 2]) {
          await t.test(`mounts only the visible rows plus ${overscan} overscan rows at the top, middle, and end (${mode})`, async () => {
            await ltr.open({ mode, options: { overscan, minItemWidth: 160 } });
            for (const [position, target] of [['top', 0], ['middle', 0.5], ['end', 'end']]) {
              await ltr.scrollTo(target);
              const { columns, mounted, visibleItems, visibleRows } = await ltr.analysis(overscan);
              const label = `${position}: ${mounted} mounted, ${visibleItems} visible in ${visibleRows} rows of ${columns}`;
              assert.ok(columns > 1, `${label}: several columns`);
              assert.ok(mounted >= visibleItems, `${label}: every visible item is mounted`);
              assert.ok(mounted <= (visibleRows + 2 * overscan + 1) * columns + 1, `${label}: no more than the visible rows, ${overscan} overscan rows on each side, and the focused item`);
              if (position === 'middle') assert.ok(mounted >= (visibleRows + 2 * overscan - 1) * columns, `${label}: overscan rows are mounted on both sides`);
              await ltr.expectNoBlank(label);
              await ltr.expectNoBlank(label, { hit: true });
            }
          });
        }
      }

      for (const [width, maxColumns] of [[360, 2], [768, 4], [1280, 6]]) {
        await t.test(`maxColumns ${maxColumns} gives exactly ${maxColumns} columns at ${width}px`, async () => {
          const narrow = await driver('en-US', 'ltr', { width, height: 800 });
          await narrow.open({ options: { minItemWidth: 100, maxColumns } });
          assert.equal((await narrow.analysis()).columns, maxColumns);
          assert.deepEqual(await narrow.tab.evaluate(() => window.__clipping()), []);
          await narrow.tab.context().close();
        });
      }

      await t.test('maxColumns only caps the count, so a narrow width shows fewer columns', async () => {
        const narrow = await driver('en-US', 'ltr', { width: 360, height: 800 });
        await narrow.open({ options: { minItemWidth: 140, maxColumns: 6 } });
        const { root } = await narrow.snapshot();
        const { columns } = await narrow.analysis();
        assert.equal(columns, Math.floor(root.clientWidth / (140 + root.columnGap)), 'floor(width / (minItemWidth + gap))');
        assert.ok(columns > 0 && columns < 6, `${columns} columns under a cap of 6`);
        await narrow.tab.context().close();
      });

      await t.test('a container narrower than minItemWidth still fits one column', async () => {
        const phone = await driver('en-US', 'ltr', { width: 320, height: 700 });
        await phone.open({ options: { minItemWidth: 400 } });
        assert.equal((await phone.analysis()).columns, 1);
        await phone.expectTidy('minItemWidth 400 in 320px');
        await phone.tab.context().close();
      });

      for (const [name, config, columnGap, rowGap] of [
        ['the default token', {}, null, null],
        ['a custom CSS gap from className', { className: 'wide-gap' }, 40, 12],
      ]) {
        await t.test(`item spacing matches the GridList CSS gap: ${name}`, async () => {
          await ltr.open(config, { responsive: columnGap === null });
          const check = async (label) => {
            const snapshot = await ltr.snapshot();
            const { columns, gridRow } = analyze(snapshot);
            const { root, rows } = snapshot;
            if (columnGap !== null) assert.deepEqual([root.columnGap, root.rowGap], [columnGap, rowGap], 'the GridList resolves the custom gap');
            assert.equal(root.padding.replace(/0px/gu, '').trim(), '', 'a virtualized GridList takes no padding');
            const ordered = rows.toSorted((left, right) => left.index - right.index);
            const first = ordered.filter((row) => gridRow(row) === gridRow(ordered[0]));
            for (let column = 1; column < columns; column++) {
              assert.ok(Math.abs(first[column].left - first[column - 1].right - root.columnGap) <= 1, `${label}: column ${column} sits ${first[column].left - first[column - 1].right}px from the last, not ${root.columnGap}px`);
            }
            const second = ordered.find((row) => gridRow(row) === gridRow(ordered[0]) + 1);
            assert.ok(Math.abs(second.top - first[0].bottom - root.rowGap) <= 1, `${label}: rows sit ${second.top - first[0].bottom}px apart, not ${root.rowGap}px`);
            assert.ok(Math.abs(first[0].left - root.left - root.columnGap) <= 1.5, `${label}: the start edge is ${first[0].left - root.left}px, not ${root.columnGap}px`);
            assert.ok(Math.abs(root.right - first[columns - 1].right - root.columnGap) <= 1.5, `${label}: the end edge is ${root.right - first[columns - 1].right}px, not ${root.columnGap}px`);
            assert.ok(Math.abs(first[0].top - snapshot.view.top - root.rowGap) <= 1, `${label}: the top edge is ${first[0].top - snapshot.view.top}px, not ${root.rowGap}px`);
          };
          await check('initial');
          if (columnGap === null) {
            // The token is fluid in the viewport width, so resizing the window must re-read it.
            const initial = (await ltr.snapshot()).root.columnGap;
            await ltr.tab.setViewportSize({ width: 560, height: 700 });
            await pollUntil(ltr.tab, (previous) => window.__snapshot().root.columnGap !== previous, initial, {
              message: 'the fluid gap follows the viewport width',
              report: () => window.__snapshot().root,
            });
            await ltr.settle();
            assert.notEqual((await ltr.snapshot()).root.columnGap, initial);
            await check('after resize');
          }
        });
      }

      await t.test('items in a row share its height, show variable titles whole, and keep a 2:3 poster', async () => {
        await ltr.open({ options: { minItemWidth: 200 } });
        const snapshot = await ltr.snapshot();
        const { columns, gridRow } = analyze(snapshot);
        const byRow = Map.groupBy(snapshot.rows, gridRow);
        for (const [row, items] of byRow) {
          assert.ok(items.every((item) => Math.abs(item.top - items[0].top) <= 1 && Math.abs(item.bottom - items[0].bottom) <= 1), `row ${row} items share top and height`);
        }
        const heights = [...byRow.values()].map((items) => Math.round(items[0].bottom - items[0].top));
        assert.ok(new Set(heights).size > 1, `rows measure their own content (heights ${heights.join(', ')})`);
        const titles = await ltr.tab.locator('[data-card]').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))));
        assert.ok(Math.max(...titles) >= 3, `a title wraps to ${Math.max(...titles)} lines`);
        assert.ok(columns >= 3);
        await ltr.expectTidy('variable titles');
        const poster = await ltr.tab.locator('[data-poster]').first().boundingBox();
        assert.ok(Math.abs(poster.height / poster.width - 1.5) < 0.02, `the poster keeps 2:3 (${poster.width} x ${poster.height})`);
      });

      // With four columns and 5 disabled, Left from 6 skips it for 4, and Up from 9 skips it for 1.
      for (const [name, tab, expected] of [
        ['left to right', ltr, [['ArrowRight', '1'], ['ArrowRight', '2'], ['ArrowDown', '6'], ['ArrowLeft', '4'], ['ArrowUp', '0'], ['ArrowDown', '4'], ['ArrowDown', '8'], ['ArrowDown', '16'], ['ArrowUp', '8'], ['ArrowRight', '9'], ['ArrowUp', '1']]],
        ['right to left', rtl, [['ArrowLeft', '1'], ['ArrowLeft', '2'], ['ArrowDown', '6'], ['ArrowRight', '4'], ['ArrowUp', '0'], ['ArrowDown', '4'], ['ArrowDown', '8'], ['ArrowDown', '16'], ['ArrowUp', '8'], ['ArrowLeft', '9'], ['ArrowUp', '1']]],
      ]) {
        await t.test(`arrow keys move by rendered position and skip disabled cards, ${name}`, async () => {
          await tab.open({ options: { minItemWidth: 180, maxColumns: 4 } });
          assert.equal((await tab.analysis()).columns, 4);
          const [first, second] = [await tab.row('0').boundingBox(), await tab.row('1').boundingBox()];
          assert.equal(second.x > first.x, name === 'left to right', 'the second card sits after the first in reading direction');
          await tab.enter();
          await tab.press(expected);
          assert.deepEqual(await tab.selected(), [], 'arrow navigation never selects');
          await tab.expectFocusInView('focus stays visible');
        });
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`repeated ArrowDown crosses virtualization boundaries in one column (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.enter();
          let current = 0;
          const mounted = new Set();
          for (let step = 1; step <= 36; step++) {
            current += 4;
            if (DISABLED.includes(current)) current += 4;
            await ltr.tab.keyboard.press('ArrowDown');
            await ltr.expectFocus(String(current), `ArrowDown ${step} reaches ${current}`);
            await ltr.expectFocusInView(`ArrowDown ${step}`);
            const { rows } = await ltr.snapshot();
            rows.forEach((row) => mounted.add(row.index));
          }
          assert.ok(mounted.size > 100, `the walk mounted and recycled ${mounted.size} different cards`);
          const { mounted: now, columns } = await ltr.analysis();
          assert.ok(now < 8 * columns, `${now} cards stay mounted after the walk`);
          await ltr.expectNoBlank('after the walk', { hit: true });
        });
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`PageDown, PageUp, Home, and End reach unmounted cards (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.enter();
          // RAC 1.20 leaves the native page scroll running next to its own focus scroll for PageUp
          // and PageDown. Wait out that scroll; the focus reveal then brings the card fully into view.
          const page = async (key, condition, argument) => {
            await ltr.tab.keyboard.press(key);
            await pollUntil(ltr.tab, condition, argument, { message: `${key} moves focus`, report: () => window.__focus(), timeout: 5000 });
            await ltr.settle();
            await ltr.expectFocusInView(key);
            const focused = Number(await ltr.focused());
            assert.equal(await ltr.tab.evaluate(() => document.activeElement.isConnected && document.activeElement.getAttribute('role') === 'row'), true, `${key} leaves a mounted card focused`);
            return focused;
          };
          const down = await page('PageDown', () => Number(window.__focus()) > 0);
          assert.ok(down >= 4 && down % 4 === 0, `PageDown stays in the first column and moves a page (card ${down})`);
          const further = await page('PageDown', (previous) => Number(window.__focus()) > previous, down);
          assert.ok(further > down && further % 4 === 0, `a second PageDown moves further (card ${further})`);
          const back = await page('PageUp', (previous) => Number(window.__focus()) < previous, further);
          assert.ok(back < further && back % 4 === 0, `PageUp moves back (card ${back})`);

          await ltr.tab.keyboard.press('End');
          await ltr.expectFocus(String(COUNT - 1), 'End focuses the last card');
          await ltr.expectFocusInView('End');
          await ltr.settle();
          assert.equal(await ltr.tab.evaluate(() => Boolean(document.activeElement.closest('[role="row"]')?.isConnected)), true, 'the last card is rendered');
          await ltr.expectNoBlank('at the end', { hit: true });
          await ltr.tab.keyboard.press('Home');
          await ltr.expectFocus('0', 'Home focuses the first card');
          // The first card is revealed; the row gap above it may stay scrolled out of view. Home's own
          // scroll lands over a few frames, so wait for the position, not for a fixed time.
          const { root } = await ltr.snapshot();
          const top = mode === 'page' ? 200 : root.rowGap + 1;
          await pollUntil(ltr.tab, (limit) => window.__scrollPosition() <= limit, top, {
            message: 'Home scrolls back to the top',
            report: () => ({ scroll: window.__scrollPosition(), focus: window.__focus() }),
            timeout: 5000,
          });
          await ltr.expectFocusInView('Home');
          await ltr.settle();
        });
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`focus persists when its card scrolls away, and ArrowDown continues from it (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.enter();
          await ltr.press([['ArrowRight', '1'], ['ArrowRight', '2'], ['ArrowDown', '6'], ['ArrowDown', '10']]);
          await ltr.expectFocusInView('before scrolling away');
          const handle = await ltr.tab.evaluateHandle(() => document.activeElement);
          await ltr.scrollTo('end');
          assert.equal(await ltr.tab.evaluate((node) => node === document.activeElement && node.isConnected, handle), true, 'the focused card stays mounted and focused far from the viewport');
          const { rows, view } = await ltr.snapshot();
          const away = rows.find((row) => row.index === 10);
          assert.ok(away && (away.bottom < view.top || away.top > view.bottom), 'card 10 is mounted outside the viewport');
          assert.ok(rows.length <= 8 * (await ltr.analysis()).columns, 'only the window and the focused card are mounted');
          await ltr.scrollTo(0);
          assert.equal(await ltr.focused(), '10', 'scrolling does not move focus');
          await ltr.tab.keyboard.press('ArrowDown');
          await ltr.expectFocus('14', 'ArrowDown continues from the focused card, not the scroll position');
          await ltr.expectFocusInView('after continuing');
        });
      }

      for (const config of [
        { selectionMode: 'single' },
        { selectionMode: 'multiple', controlled: true },
      ]) {
        const label = `${config.selectionMode}${config.controlled ? ' controlled' : ' uncontrolled'}`;
        await t.test(`pressing a card selects it and disabled cards do not (${label})`, async () => {
          await ltr.open({ ...config, options: { minItemWidth: 180, maxColumns: 4 } });
          const multiple = config.selectionMode === 'multiple';
          await ltr.card('1').click();
          assert.deepEqual(await ltr.selected(), ['1']);
          await ltr.card('2').click();
          assert.deepEqual(await ltr.selected(), multiple ? ['1', '2'] : ['2']);
          await ltr.card('2').click();
          assert.deepEqual(await ltr.selected(), multiple ? ['1'] : []);
          await ltr.resetEvents();
          const box = await ltr.card('5').boundingBox();
          await ltr.tab.mouse.click(box.x + 4, box.y + box.height / 2);
          assert.deepEqual(await ltr.events(), [], 'a disabled card runs no handler');
          assert.equal(await ltr.row('5').getAttribute('aria-disabled'), 'true');
          assert.deepEqual(await ltr.selected(), multiple ? ['1'] : []);

          // Selection belongs to the collection, not the mounted rows.
          await ltr.scrollTo('end');
          await ltr.scrollTo(0);
          assert.deepEqual(await ltr.selected(), multiple ? ['1'] : [], 'selection survives unmounting and remounting');
          if (config.controlled) {
            await ltr.resetEvents();
            await ltr.tab.evaluate(() => window.__setSelected(['3']));
            await ltr.settle();
            assert.deepEqual(await ltr.selected(), ['3'], 'a controlled selection follows its prop');
            assert.deepEqual(await ltr.events(), [], 'a prop change reports nothing');
          }
        });
      }

      for (const config of [
        { selectionMode: 'single' },
        { selectionMode: 'multiple', controlled: true },
        { selectionMode: 'single', withAction: true },
      ]) {
        const label = `${config.selectionMode}${config.controlled ? ' controlled' : ''}${config.withAction ? ' with onAction' : ''}`;
        await t.test(`nested Link and Button run only their own handler and never select (${label})`, async () => {
          await ltr.open({ ...config, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.enter();
          await ltr.press([['Tab', '0:a']]);
          await ltr.tab.keyboard.press('Enter');
          await ltr.press([['Tab', '0:button']]);
          await ltr.tab.keyboard.press('Enter');
          await ltr.tab.keyboard.press('Space');
          await ltr.row('1').locator('button').click();
          await ltr.row('1').locator('a').click();
          assert.deepEqual(await ltr.events(), [['link', '0'], ['button', '0'], ['button', '0'], ['button', '1'], ['link', '1']], 'only the pressed controls ran');
          assert.deepEqual(await ltr.selected(), [], 'nested controls leave selection unchanged');

          await ltr.card('2').click();
          const body = config.withAction ? [['action', '2']] : [['selection', '2']];
          assert.deepEqual((await ltr.events()).slice(5), body, 'pressing the card body runs the card action or selection');
          assert.deepEqual(await ltr.selected(), config.withAction ? [] : ['2']);
          await ltr.row('2').locator('button').click();
          await ltr.row('2').locator('a').click();
          assert.deepEqual((await ltr.events()).slice(5), [...body, ['button', '2'], ['link', '2']], 'nested controls in a pressed card run alone');
          assert.deepEqual(await ltr.selected(), config.withAction ? [] : ['2'], 'selection survives nested presses');
          // Moving focus through a card's controls never presses them.
          await ltr.tab.keyboard.press('Tab');
          await ltr.tab.keyboard.press('Tab');
          assert.equal((await ltr.events()).length, 5 + body.length + 2, 'moving focus never presses a control');
        });
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`resizing the viewport and container recomputes columns without losing focus or overflowing (${mode})`, async () => {
          const resizing = await driver('en-US', 'ltr', { width: 1280, height: 700 });
          await resizing.open({ mode, options: { minItemWidth: 180 } });
          await resizing.enter();
          await resizing.tab.keyboard.press('ArrowRight');
          await resizing.tab.keyboard.press('ArrowRight');
          await resizing.tab.keyboard.press('ArrowDown');
          const focusId = await resizing.focused();
          const handle = await resizing.tab.evaluateHandle(() => document.activeElement);
          const reflow = async (apply, wanted, label) => {
            const before = (await resizing.analysis()).columns;
            await apply();
            await pollUntil(resizing.tab, ({ before: previous, wanted: expectation }) => {
              const { rows } = window.__snapshot();
              const columns = new Set(rows.map((row) => Math.round(row.left))).size;
              return expectation === 'fewer' ? columns < previous : columns > previous;
            }, { before, wanted }, {
              message: `${label}: the grid reflows to ${wanted} columns than ${before}`,
              report: () => ({ columns: new Set(window.__snapshot().rows.map((row) => Math.round(row.left))).size, container: document.getElementById('frame').getBoundingClientRect().width }),
              timeout: 5000,
            });
            await resizing.settle();
            const after = (await resizing.analysis()).columns;
            assert.equal(await resizing.tab.evaluate((node) => node === document.activeElement, handle), true, `${label}: the focused element stays the active element`);
            assert.equal(await resizing.focused(), focusId);
            await resizing.expectTidy(label);
            await resizing.expectNoBlank(label, { hit: true });
          };
          await reflow(() => resizing.tab.setViewportSize({ width: 700, height: 700 }), 'fewer', 'narrower viewport');
          await reflow(() => resizing.tab.evaluate(() => { document.getElementById('frame').style.inlineSize = '380px'; }), 'fewer', 'narrower container');
          await reflow(() => resizing.tab.evaluate(() => { document.getElementById('frame').style.inlineSize = ''; }), 'more', 'wider container');
          await reflow(() => resizing.tab.setViewportSize({ width: 1280, height: 700 }), 'more', 'wider viewport');
          // The last row is partial at every column count, so reflowing at the end re-fits it.
          await resizing.scrollTo('end');
          await reflow(() => resizing.tab.setViewportSize({ width: 700, height: 700 }), 'fewer', 'narrower viewport at the end');
          await resizing.tab.context().close();
        });
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`fast scroll jumps never leave a blank slot or clipped card (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180 } });
          for (const target of [0.9, 0.1, 0.55, 'end', 0.3, 0, 0.7]) {
            await ltr.tab.evaluate((value) => window.__scrollTo(value), target);
            // One frame after the jump, before measured rows have settled.
            await ltr.tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await ltr.expectNoBlank(`right after jumping to ${target}`);
            await ltr.settle();
            await ltr.expectNoBlank(`once settled at ${target}`, { hit: true });
            await ltr.expectTidy(`at ${target}`);
          }
        });
      }

      // A collection smaller than its column count, and one whose last row is partial, must mount only real cards.
      for (const mode of ['bounded', 'page']) {
        for (const count of [1, 7]) {
          await t.test(`${count} card${count === 1 ? '' : 's'} at four columns scroll and reach the last card with End (${mode})`, async () => {
            await ltr.open({ mode, count, options: { minItemWidth: 180, maxColumns: 4 } });
            await ltr.scrollTo('end');
            const { rows } = await ltr.snapshot();
            assert.deepEqual(rows.map((row) => row.index).toSorted((left, right) => left - right), Array.from({ length: count }, (_, index) => index), 'every card is mounted and no slot is empty');
            assert.equal(new Set(rows.map((row) => Math.round(row.left))).size, Math.min(count, 4), 'the first row holds up to four cards');
            await ltr.expectTidy(`${count} cards`);
            await ltr.enter();
            await ltr.tab.keyboard.press('End');
            await ltr.expectFocus(String(count - 1), 'End focuses the last card');
            await ltr.expectFocusInView('End');
            await ltr.expectNoBlank(`${count} cards at the end`, { hit: true });
          });
        }
      }

      for (const mode of ['bounded', 'page']) {
        await t.test(`a collection that shrinks, empties, and grows again keeps its last row sound (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.scrollTo('end');
          const show = async (count) => {
            await ltr.tab.evaluate((value) => window.__show(value), count);
            // The grid's row count is its collection size, so it flips only once the new collection renders.
            await pollUntil(ltr.tab, (value) => Number(document.querySelector('[role="grid"]').getAttribute('aria-rowcount') ?? 0) === value, count, {
              message: `the grid shows ${count} cards`,
              report: () => ({ rowcount: document.querySelector('[role="grid"]').getAttribute('aria-rowcount'), mounted: document.querySelectorAll('[role="row"]').length }),
            });
            await ltr.settle();
          };
          await show(7);
          assert.deepEqual((await ltr.snapshot()).rows.map((row) => row.index).toSorted((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6]);
          await ltr.expectTidy('shrunk to 7');
          await show(0);
          assert.equal((await ltr.snapshot()).rows.length, 0, 'an empty collection mounts nothing');
          await show(COUNT);
          await ltr.scrollTo('end');
          await ltr.expectNoBlank('regrown and scrolled to the end', { hit: true });
        });
      }

      // RAC scrolls the focused card once against estimated sizes, and Mux keeps revealing it for a second
      // while the content resizes or the view scrolls. Both a scroll and a reflow show whether the reveal is still live.
      for (const mode of ['bounded', 'page']) {
        await t.test(`a wheel scroll away within the reveal window is not pulled back (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.enter();
          await ltr.press([['ArrowDown', '4']]);
          await ltr.expectFocusInView('after ArrowDown');
          const columns = (await ltr.analysis()).columns;
          // Key, scroll away, and reflow run in one evaluate, so no round trip can outlast the one second window.
          const { focus, away, min, inView } = await ltr.tab.evaluate(async ([distance, milliseconds, before]) => {
            const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
            const until = async (done, what) => {
              const started = performance.now();
              while (!done()) {
                if (performance.now() - started > 3000) throw new Error(`${what}; focus ${window.__focus()}, scroll ${window.__scrollPosition()}`);
                await frame();
              }
            };
            // A navigation key opens the window. Wait for React Aria to focus the card below and for its own
            // scrolling, which lands against estimated sizes, to finish before scrolling away.
            document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
            await until(() => window.__focus() === '8', 'ArrowDown never focused card 8');
            await window.__settled();
            if (!window.__focusInView()) throw new Error(`card 8 is not in view; scroll ${window.__scrollPosition()}`);
            // A wheel ends the window, as a user's scroll does. Engines turn a wheel delta into
            // different distances, so the scroll position is set directly.
            document.querySelector('[role="grid"]').dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: distance }));
            window.__scrollBy(distance);
            const scrolled = window.__scrollPosition();
            // Watch from before the scroll event, so a scroll that is undone at once is still seen.
            const watching = window.__watchScroll(scrolled - 2, milliseconds);
            // The scroll event lands in the next frame, which is when a live window scrolls the card back.
            await frame();
            await frame();
            // A reflow resizes the content and moves the card far from the view, so a live window scrolls it back in.
            document.getElementById('frame').style.inlineSize = '380px';
            await until(() => new Set(window.__snapshot().rows.map((row) => Math.round(row.left))).size < before, 'the narrower container never reflowed');
            await window.__settled();
            const { min: lowest } = await watching;
            return { focus: window.__focus(), away: scrolled, min: lowest, inView: window.__focusInView() };
          }, [1500, 600, columns]);
          assert.ok(min !== null && min >= away - 2, `the view stays where the wheel left it (lowest ${min}px after passing ${away}px)`);
          assert.equal(focus, '8', 'focus stays on the card scrolled away from');
          assert.equal(inView, false, 'the card scrolled away from stays out of view after the reflow');
        });

        await t.test(`a key that does not navigate never starts the reveal window (${mode})`, async () => {
          await ltr.open({ mode, options: { minItemWidth: 180, maxColumns: 4 } });
          await ltr.card('0').click();
          await ltr.scrollTo(0.5);
          const away = await ltr.tab.evaluate(() => window.__scrollPosition());
          assert.ok(away > 1500, `scrolled away from the focused card (${away}px)`);
          // The first key press is what once started observing the content, whose first report scrolled the card back.
          const watching = ltr.tab.evaluate(([from, milliseconds]) => window.__watchScroll(from, milliseconds), [away - 2, 800]);
          await ltr.tab.keyboard.press('Shift');
          await ltr.tab.evaluate(() => { document.getElementById('frame').style.inlineSize = '380px'; });
          const { min } = await watching;
          assert.ok(min !== null && min >= away - 2, `Shift and a reflow leave the view alone (lowest ${min}px, from ${away}px)`);
        });
      }

      await t.test('maxItemWidth caps the item width and centers the grid with the gap unchanged', async () => {
        await ltr.open({ options: { minItemWidth: 120, maxItemWidth: 200, maxColumns: 3 } });
        const snapshot = await ltr.snapshot();
        const { columns } = analyze(snapshot);
        const first = snapshot.rows.filter((row) => row.top === snapshot.rows[0].top).toSorted((left, right) => left.left - right.left);
        assert.equal(columns, 3);
        assert.ok(first.every((row) => Math.abs(row.right - row.left - 200) <= 1), `items stop at 200px (${first.map((row) => Math.round(row.right - row.left))})`);
        assert.ok(Math.abs(first[1].left - first[0].right - snapshot.root.columnGap) <= 1, 'the gap between items is unchanged');
        const [start, end] = [first[0].left - snapshot.root.left, snapshot.root.right - first[2].right];
        assert.ok(start > snapshot.root.columnGap && Math.abs(start - end) <= 2, `the spare width becomes equal margins (${start}px and ${end}px)`);
      });

      await t.test('estimatedItemHeight sizes rows before they are measured', async () => {
        const extent = async (estimatedItemHeight) => {
          await ltr.open({ options: { minItemWidth: 180, maxColumns: 4, estimatedItemHeight } });
          return (await ltr.snapshot()).root.scrollHeight;
        };
        const [short, tall] = [await extent(100), await extent(400)];
        assert.ok(tall > short * 1.5, `scroll extent ${short}px at 100 and ${tall}px at 400`);
      });

      await t.test('estimatedItemHeight estimates rows added later as exactly that height, whatever the item width', async () => {
        // The first layout runs before the width is known, so only rows added afterwards would scale.
        const wide = await driver('en-US', 'ltr', { width: 1000, height: 800 });
        await wide.open({ initial: 40, options: { minItemWidth: 100, maxColumns: 2, estimatedItemHeight: 1000 } });
        await wide.tab.evaluate((count) => window.__show(count), COUNT);
        await wide.settle();
        const { root } = await wide.snapshot();
        // All but the few mounted rows are unmeasured, so each adds the estimate and a gap.
        const expected = Math.ceil(COUNT / 2) * (1000 + root.rowGap);
        assert.ok(Math.abs(root.scrollHeight - expected) / expected < 0.05, `extent ${root.scrollHeight}px, expected near ${expected}px`);
      });

      await t.test('hydrates server HTML and then mounts the visible window', async () => {
        await ltr.open({ hydrate: true, options: { minItemWidth: 180, maxColumns: 4 } });
        assert.equal(await ltr.tab.evaluate(() => window.__serverRows), 0, 'the server renders the GridList without rows');
        const { mounted, columns } = await ltr.analysis();
        assert.ok(mounted > 0 && columns === 4, `${mounted} cards in ${columns} columns after hydration`);
        await ltr.expectNoBlank('after hydration', { hit: true });
      });

      await t.test('the hover layer follows the pointer between virtualized cards behind their content', async () => {
        await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } });
        for (const id of ['6', '1', '4']) {
          const box = await ltr.row(id).boundingBox();
          await ltr.tab.mouse.move(box.x + box.width / 2, box.y + 8);
          await pollUntil(ltr.tab, (card) => {
            const row = document.querySelector(`[role="row"]:has([data-card="${card}"])`).getBoundingClientRect();
            const layer = document.querySelector('.muxui-grid-list-hover');
            const rect = layer.getBoundingClientRect();
            return Number(getComputedStyle(layer).opacity) >= 0.99
              && ['left', 'top', 'width', 'height'].every((side) => Math.abs(rect[side] - row[side]) < 0.75);
          }, id, {
            message: `the hover layer settles on card ${id}`,
            report: (card) => ({ opacity: getComputedStyle(document.querySelector('.muxui-grid-list-hover')).opacity, layer: document.querySelector('.muxui-grid-list-hover').getBoundingClientRect().toJSON(), row: document.querySelector(`[role="row"]:has([data-card="${card}"])`).getBoundingClientRect().toJSON() }),
            timeout: 5000,
          });
        }
        // The layer sits under the cards: it is the lowest layer of the isolated GridList.
        assert.deepEqual(await ltr.tab.evaluate(() => {
          const root = document.querySelector('[role="grid"]');
          return [getComputedStyle(root).isolation, getComputedStyle(root.querySelector('.muxui-grid-list-hover')).zIndex];
        }), ['isolate', '-1']);
        // A hovered selected card keeps its selection style instead of the hover tint.
        await ltr.card('2').click();
        const box = await ltr.row('2').boundingBox();
        await ltr.tab.mouse.move(box.x + box.width / 2, box.y + 8);
        assert.equal(await ltr.tab.evaluate(() => getComputedStyle(document.querySelector('[role="row"][aria-selected="true"]')).backgroundImage), 'none');
      });

      await t.test('pressing a virtualized card draws a ripple inside it', async () => {
        await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } });
        const box = await ltr.row('1').boundingBox();
        await ltr.tab.mouse.move(box.x + 20, box.y + 20);
        await ltr.tab.mouse.down();
        try {
          await pollUntil(ltr.tab, () => {
            const row = document.querySelector('[role="row"]:has([data-card="1"])');
            const host = row.querySelector('.muxui-grid-list-ripple-host');
            if (!host || !host.querySelector('.muxui-grid-list-ripple')) return false;
            const [hostBox, rowBox] = [host.getBoundingClientRect(), row.getBoundingClientRect()];
            return ['left', 'top', 'width', 'height'].every((side) => Math.abs(hostBox[side] - rowBox[side]) < 0.75);
          }, undefined, {
            message: 'the ripple host covers exactly the pressed card',
            report: () => { const row = document.querySelector('[role="row"]:has([data-card="1"])'); return { host: row.querySelector('.muxui-grid-list-ripple-host')?.getBoundingClientRect().toJSON(), row: row.getBoundingClientRect().toJSON(), ripples: row.querySelectorAll('.muxui-grid-list-ripple').length }; },
          });
        } finally {
          await ltr.tab.mouse.up();
        }
        assert.deepEqual(await ltr.selected(), ['1']);
      });

      await t.test('disabled virtualized cards look disabled and take neither hover nor ripple', async () => {
        await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } });
        const box = await ltr.row('5').boundingBox();
        await ltr.tab.mouse.move(box.x + 20, box.y + 20);
        await ltr.tab.mouse.down();
        // A ripple or hover tint would fade in over a few frames, so look at every frame for 400ms
        // and keep the worst case, instead of trusting one sample.
        const worst = await ltr.tab.evaluate(() => new Promise((resolve) => {
          const row = document.querySelector('[role="row"]:has([data-card="5"])');
          const seen = { opacity: '', ripples: 0, hover: 0 };
          const started = performance.now();
          const tick = () => {
            seen.opacity = getComputedStyle(row).opacity;
            seen.ripples = Math.max(seen.ripples, row.querySelectorAll('.muxui-grid-list-ripple').length);
            seen.hover = Math.max(seen.hover, Number(getComputedStyle(document.querySelector('.muxui-grid-list-hover')).opacity));
            if (performance.now() - started >= 400) resolve(seen);
            else requestAnimationFrame(tick);
          };
          tick();
        }));
        await ltr.tab.mouse.up();
        assert.deepEqual([worst.opacity, worst.ripples], ['0.45', 0]);
        // A hover layer can start its fade for a frame, which is under half a percent of opacity, so allow that much.
        assert.ok(worst.hover < 0.05, `the hover layer stays hidden over a disabled card (peaked at ${worst.hover} opacity)`);
      });

      await t.test('a keyboard-focused card shows an unclipped focus ring, selected or not', async () => {
        await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } });
        await ltr.enter();
        const ring = { focusVisible: true, painted: true, insideRoot: true, clippedBy: [] };
        for (const [key, card] of [['', '0'], ['ArrowRight', '1'], ['ArrowRight', '2'], ['ArrowRight', '3'], ['ArrowDown', '7'], ['ArrowDown', '11'], ['ArrowDown', '15'], ['ArrowLeft', '14']]) {
          if (key) await ltr.tab.keyboard.press(key);
          await ltr.expectFocus(card);
          await ltr.expectFocusInView(`card ${card}`);
          assert.deepEqual(await ltr.tab.evaluate(measureFocusRing), ring, `card ${card} ring`);
        }
        await ltr.tab.keyboard.press('Space');
        await pollUntil(ltr.tab, () => document.activeElement.getAttribute('aria-selected') === 'true', undefined, { message: 'Space selects the focused card', report: () => ({ focus: window.__focus(), selected: window.__selected() }) });
        assert.deepEqual(await ltr.tab.evaluate(measureFocusRing), ring, 'a selected, focused card keeps its ring');
        const shadows = await ltr.tab.evaluate(() => getComputedStyle(document.activeElement).boxShadow.split(/,(?![^(]*\))/u).length);
        assert.equal(shadows, 2, 'the focus halo and the selection ring layer together');
      });

      for (const scheme of ['light', 'dark']) {
        await t.test(`selected cards keep nested link text at 4.5:1 and show a tint with an inset ring (${scheme})`, async () => {
          await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } }, { scheme });
          await ltr.card('1').click();
          await ltr.tab.mouse.move(0, 0);
          const selector = '[role="row"][aria-selected="true"]';
          // The background fades in; wait for it to stop moving before sampling.
          await settleMotion(ltr.tab.locator(selector));
          const contrast = await ltr.tab.evaluate(measureSelectedContrast, selector);
          assert.equal(contrast.opaque, true, 'the effective background is opaque');
          assert.ok(contrast.ratio >= 4.5, `${scheme} contrast ${contrast.ratio.toFixed(2)}:1 of ${contrast.text} on ${contrast.background}`);
          const painted = await ltr.tab.evaluate(measureSelectedPaint, selector);
          for (const [property, [actual, expected]] of Object.entries(painted)) assert.equal(actual, expected, `${property} uses the selection tokens`);
        });
      }

      await t.test('in forced colors a selected card uses Highlight, and its focus ring and nested link use HighlightText', async () => {
        const selector = '[role="row"][aria-selected="true"]';
        await ltr.open({ options: { minItemWidth: 180, maxColumns: 4 } });
        await ltr.tab.emulateMedia({ forcedColors: 'active' });
        try {
          await ltr.card('1').click();
          // Tab returns to the card that was last focused.
          await ltr.tab.locator('#before').focus();
          await ltr.tab.keyboard.press('Tab');
          await ltr.expectFocus('1', 'Tab returns to the selected card');
          await settleMotion(ltr.tab.locator(selector));
          for (const [property, [actual, expected]] of Object.entries(await ltr.tab.evaluate(measureForcedSelection, selector))) assert.equal(actual, expected, property);
        } finally {
          await ltr.tab.emulateMedia({ forcedColors: 'none' });
        }
      });

      if (observerLoops.length > 0) t.diagnostic(`${engine} reported ${observerLoops.length} benign ResizeObserver loop errors in the unbounded variant`);
      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
