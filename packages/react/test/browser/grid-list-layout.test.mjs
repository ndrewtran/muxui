import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { measureFocusRing, measureForcedSelection, measureSelectedContrast, measureSelectedPaint, pollUntil, selectedBackgroundSettled, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof for GridList layout="grid" and orientation. Cards hold a
// Mux Link and a Mux Button, so the cases prove React Aria's grid keyboard model,
// nested-control isolation, focus visibility, and reflow through Mux's own
// styles. Runs in every engine named by MUXUI_BROWSER_ENGINES (see harness.mjs).
//
// Each case loads the fixture with a JSON `config`. With the default eight
// cards (a to h) and `e` disabled, a 640px grid lays out three columns:
//   a b c
//   d e f
//   g h

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GridList } from '/src/collections.mjs';
import { Button } from '/src/button.mjs';
import { Link } from '/src/components.mjs';

const h = React.createElement;
const { layout = 'grid', orientation, selectionMode = 'single', controlled = false, withAction = false, count = 8, disabled = ['e'], width = 640, plainColumns = false } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
const ids = 'abcdefghijkl'.slice(0, count).split('');
window.__events = [];
const log = (...entry) => window.__events.push(entry);

// Names the focused card, plus the nested control when focus is inside one.
window.__focus = () => {
  const node = document.activeElement;
  const row = node?.closest?.('[role="row"]');
  if (!row) return node?.id || node?.tagName?.toLowerCase() || 'none';
  const card = row.querySelector('[data-card]')?.dataset.card;
  return node === row ? card : card + ':' + node.tagName.toLowerCase();
};
window.__selected = () => [...document.querySelectorAll('[role="row"][aria-selected="true"]')].map((row) => row.querySelector('[data-card]').dataset.card);

function Fixture() {
  const [selected, setSelected] = React.useState([]);
  const props = {
    'aria-label': 'Cards', layout, orientation, selectionMode, className: plainColumns ? 'plain-columns' : undefined,
    onSelectionChange: (next) => { log('selection', next === 'all' ? 'all' : next.join(',')); setSelected(next); },
    ...(controlled ? { selectedIds: selected } : {}),
    ...(withAction ? { onAction: (item) => log('action', item.id) } : {}),
  };
  return h('div', { style: { inlineSize: width } }, h(GridList, props, ids.map((id) => h(GridList.Item, { key: id, id, textValue: 'Card ' + id, disabled: disabled.includes(id) },
    h('strong', { 'data-card': id }, 'Card ' + id),
    h(Link, { href: '#' + id, onActivate: () => log('link', id) }, 'Open ' + id),
    h(Button, { onActivate: () => log('button', id) }, 'Act ' + id)))));
}
createRoot(document.getElementById('root')).render(h(Fixture));
`;

const page = (url) => pageShell({
  attributes: `data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}" data-muxui-motion="full"${url.searchParams.get('dir') === 'rtl' ? ' dir="rtl" lang="ar"' : ''}`,
  // The consumer rule comes first and has the lowest specificity a class can have.
  head: '<style>.plain-columns { grid-template-columns: repeat(3, minmax(0, 1fr)); }</style><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  // WebKit on macOS skips plain buttons in sequential navigation; RAC controls carry tabindex.
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div><button id="after" tabindex="0">After</button>',
  entry: '/grid-list-layout-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`GridList layout and nested controls in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs', 'src/button.mjs', 'src/components.mjs'],
      pages: { '/grid-list-layout.html': page },
      modules: { '/grid-list-layout-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/grid-list-layout.html`, '[role="grid"] [role="row"]');
      const errors = [];
      // Arabic locales make React Aria resolve right-to-left; the page sets dir to match.
      const driver = async (locale, dir) => {
        const context = await browser.newContext({ locale, viewport: { width: 900, height: 700 } });
        const tab = await context.newPage();
        tab.on('pageerror', (error) => errors.push(error.message));
        tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
        const api = {
          tab,
          async open(config = {}, { scheme = 'light' } = {}) {
            await tab.goto(`${url}/grid-list-layout.html?dir=${dir}&scheme=${scheme}&config=${encodeURIComponent(JSON.stringify(config))}`, { waitUntil: 'networkidle' });
            await tab.locator('[role="grid"] [role="row"]').first().waitFor({ timeout: 15_000 }).catch((error) => assert.fail(`no card rendered: ${error.message.split('\n')[0]}; page errors ${JSON.stringify(errors)}`));
            await tab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
            // A pointer left over from an earlier case would hover a card after reflow.
            await tab.mouse.move(0, 0);
          },
          root: () => tab.locator('[role="grid"]'),
          columns: () => api.root().evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
          card: (id) => tab.locator(`[data-card="${id}"]`),
          row: (id) => tab.locator(`[role="row"]:has([data-card="${id}"])`),
          events: () => tab.evaluate(() => window.__events),
          resetEvents: () => tab.evaluate(() => { window.__events.length = 0; }),
          selected: () => tab.evaluate(() => window.__selected()),
          expectFocus: (expected, message = 'focus') => pollUntil(tab, (value) => window.__focus() === value, expected, {
            message: `${message}: focus reaches ${expected}`,
            report: () => ({ focus: window.__focus(), active: document.activeElement?.outerHTML.slice(0, 120) }),
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
            await api.expectFocus('a', 'Tab enters the grid on its first card');
          },
          async x(id) { return (await api.row(id).boundingBox()).x; },
        };
        return api;
      };
      const ltr = await driver('en-US', 'ltr');
      const rtl = await driver('ar-EG', 'rtl');

      for (const [name, tab, expected] of [
        ['left to right', ltr, [['ArrowRight', 'b'], ['ArrowRight', 'c'], ['ArrowDown', 'f'], ['ArrowLeft', 'd'], ['ArrowUp', 'a'], ['ArrowDown', 'd'], ['ArrowDown', 'g'], ['ArrowRight', 'h'], ['ArrowUp', 'b'], ['ArrowDown', 'h']]],
        ['right to left', rtl, [['ArrowRight', 'a'], ['ArrowLeft', 'b'], ['ArrowLeft', 'c'], ['ArrowDown', 'f'], ['ArrowRight', 'd'], ['ArrowUp', 'a'], ['ArrowDown', 'd'], ['ArrowDown', 'g'], ['ArrowLeft', 'h'], ['ArrowUp', 'b'], ['ArrowDown', 'h']]],
      ]) {
        await t.test(`arrow keys move across the grid by position and skip disabled cards, ${name}`, async () => {
          await tab.open();
          assert.equal(await tab.columns(), 3, 'a 640px grid has three columns');
          const [first, second] = [await tab.x('a'), await tab.x('b')];
          assert.equal(second > first, name === 'left to right', 'the second card sits after the first in reading direction');
          await tab.enter();
          await tab.press(expected);
          assert.deepEqual(await tab.selected(), [], 'arrow navigation never selects');
        });
      }

      await t.test('Tab and Shift+Tab walk a grid card\'s nested controls', async () => {
        await ltr.open();
        await ltr.enter();
        await ltr.press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Tab', 'after']]);
        await ltr.enter();
        await ltr.press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Shift+Tab', 'a:a'], ['Shift+Tab', 'a'], ['Shift+Tab', 'before']]);
        assert.deepEqual(await ltr.events(), [], 'moving focus never presses a control');
      });

      await t.test('Left and Right reach nested controls in a vertical stack and Tab skips them', async () => {
        await ltr.open({ layout: 'stack' });
        await ltr.enter();
        await ltr.press([['ArrowRight', 'a:a'], ['ArrowRight', 'a:button'], ['ArrowLeft', 'a:a'], ['ArrowLeft', 'a'], ['ArrowDown', 'b'], ['ArrowUp', 'a']]);
        await ltr.tab.keyboard.press('Tab');
        await ltr.expectFocus('after', 'a stack stays one tab stop');
      });

      for (const config of [
        { selectionMode: 'single' },
        { selectionMode: 'multiple', controlled: true },
        { selectionMode: 'single', withAction: true },
      ]) {
        const label = `${config.selectionMode}${config.controlled ? ' controlled' : ''}${config.withAction ? ' with onAction' : ''}`;
        await t.test(`nested Link and Button run only their own handler (${label})`, async () => {
          await ltr.open(config);
          await ltr.enter();
          await ltr.press([['Tab', 'a:a']]);
          await ltr.tab.keyboard.press('Enter');
          await ltr.press([['Tab', 'a:button']]);
          await ltr.tab.keyboard.press('Enter');
          await ltr.tab.keyboard.press('Space');
          await ltr.row('b').locator('button').click();
          await ltr.row('b').locator('a').click();
          assert.deepEqual(await ltr.events(), [['link', 'a'], ['button', 'a'], ['button', 'a'], ['button', 'b'], ['link', 'b']], 'only the pressed controls ran');
          assert.deepEqual(await ltr.selected(), [], 'nested controls leave selection unchanged');

          await ltr.card('c').click();
          const body = config.withAction ? [['action', 'c']] : [['selection', 'c']];
          assert.deepEqual((await ltr.events()).slice(5), body, 'pressing the card body runs the card action or selection');
          assert.deepEqual(await ltr.selected(), config.withAction ? [] : ['c']);
          await ltr.row('c').locator('button').click();
          await ltr.row('c').locator('a').click();
          assert.deepEqual((await ltr.events()).slice(5), [...body, ['button', 'c'], ['link', 'c']], 'nested controls in a pressed card run alone');
          assert.deepEqual(await ltr.selected(), config.withAction ? [] : ['c'], 'selection survives nested presses');
        });
      }

      for (const [label, config, expected] of [
        ['single', { selectionMode: 'single' }, [['a', ['a']], ['b', ['b']], ['b', []]]],
        ['single controlled', { selectionMode: 'single', controlled: true }, [['a', ['a']], ['b', ['b']], ['b', []]]],
        ['multiple', { selectionMode: 'multiple' }, [['a', ['a']], ['b', ['a', 'b']], ['b', ['a']]]],
        ['multiple controlled', { selectionMode: 'multiple', controlled: true }, [['a', ['a']], ['b', ['a', 'b']], ['b', ['a']]]],
      ]) {
        await t.test(`pressing a card selects it, ${label}`, async () => {
          await ltr.open(config);
          for (const [id, selected] of expected) {
            await ltr.card(id).click();
            assert.deepEqual(await ltr.selected(), selected, `pressing ${id}`);
          }
          // Disabled cards take no press, so selection and handlers stay as they were.
          await ltr.resetEvents();
          const box = await ltr.card('e').boundingBox();
          await ltr.tab.mouse.click(box.x + 4, box.y + box.height / 2);
          assert.deepEqual(await ltr.selected(), expected.at(-1)[1], 'a disabled card is not selectable');
          assert.deepEqual(await ltr.events(), [], 'a disabled card runs no handler');
          assert.equal(await ltr.row('e').getAttribute('aria-disabled'), 'true');
        });
      }

      for (const scheme of ['light', 'dark']) {
        await t.test(`a selected grid card keeps nested link text at 4.5:1 and shows a tint with an inset ring (${scheme})`, async () => {
          await ltr.open({ selectionMode: 'single' }, { scheme });
          await ltr.card('a').click();
          await ltr.tab.mouse.move(0, 0);
          const selector = '[role="row"][aria-selected="true"]';
          // The background fades in; wait for it to stop moving before sampling.
          await pollUntil(ltr.tab, selectedBackgroundSettled, selector, { polling: 120, message: 'the selected background stops transitioning', report: (rowSelector) => getComputedStyle(document.querySelector(rowSelector)).backgroundColor });
          const contrast = await ltr.tab.evaluate(measureSelectedContrast, selector);
          assert.equal(contrast.opaque, true, 'the effective background is opaque');
          assert.ok(contrast.ratio >= 4.5, `${scheme} contrast ${contrast.ratio.toFixed(2)}:1 of ${contrast.text} on ${contrast.background}`);
          for (const [property, [actual, expected]] of Object.entries(await ltr.tab.evaluate(measureSelectedPaint, selector))) assert.equal(actual, expected, `${property} uses the selection tokens`);
          // A focused selected card layers the focus ring over the selection ring.
          await ltr.enter();
          assert.deepEqual(await ltr.tab.evaluate(measureFocusRing), { focusVisible: true, painted: true, insideRoot: true, clippedBy: [] });
        });
      }

      // WebKit has no forced-colors mode, and Playwright's emulation does not force
      // system colors in Linux WebKit, so only engines that implement it run this.
      await t.test('in forced colors a selected grid card uses Highlight, and its focus ring and nested link use HighlightText', { skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
        const selector = '[role="row"][aria-selected="true"]';
        await ltr.open();
        await ltr.tab.emulateMedia({ forcedColors: 'active' });
        try {
          await ltr.card('a').click();
          await ltr.enter();
          await pollUntil(ltr.tab, selectedBackgroundSettled, selector, { polling: 120, message: 'the selected background stops transitioning', report: (rowSelector) => getComputedStyle(document.querySelector(rowSelector)).backgroundColor });
          for (const [property, [actual, expected]] of Object.entries(await ltr.tab.evaluate(measureForcedSelection, selector))) assert.equal(actual, expected, property);
        } finally {
          await ltr.tab.emulateMedia({ forcedColors: 'none' });
        }
      });

      await t.test('a keyboard-focused card shows an unclipped focus ring', async () => {
        await ltr.open();
        await ltr.enter();
        for (const [key, card] of [['', 'a'], ['ArrowRight', 'b'], ['ArrowRight', 'c'], ['ArrowDown', 'f'], ['ArrowLeft', 'd'], ['ArrowDown', 'g'], ['ArrowRight', 'h']]) {
          if (key) await ltr.tab.keyboard.press(key);
          await ltr.expectFocus(card);
          const ring = await ltr.tab.evaluate(measureFocusRing);
          assert.deepEqual(ring, { focusVisible: true, painted: true, insideRoot: true, clippedBy: [] }, `${card} ring`);
        }
      });

      await t.test('the hover layer tracks the hovered card in two dimensions', async () => {
        await ltr.open();
        for (const id of ['d', 'f', 'b']) {
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
      });

      await t.test('a plain class sets the column tracks, whatever the stylesheet order', async () => {
        await ltr.open({ width: 900, count: 12 });
        assert.ok(await ltr.columns() > 3, 'the default tracks auto-fill a 900px grid');
        await ltr.open({ width: 900, count: 12, plainColumns: true });
        assert.equal(await ltr.columns(), 3);
      });

      await t.test('narrowing the viewport reflows columns, keeps focus, and never overflows', async () => {
        await ltr.open({ width: '100%', count: 12, disabled: [] });
        const wide = await ltr.columns();
        // Hovering leaves the hover layer with wide-layout geometry until it fades.
        const hovered = await ltr.row('b').boundingBox();
        await ltr.tab.mouse.move(hovered.x + hovered.width / 2, hovered.y + 8);
        await pollUntil(ltr.tab, () => Number(getComputedStyle(document.querySelector('.muxui-grid-list-hover')).opacity) >= 0.99, undefined, { message: 'the hover layer fades in', report: () => getComputedStyle(document.querySelector('.muxui-grid-list-hover')).opacity });
        await ltr.tab.mouse.move(0, 0);
        await ltr.enter();
        await ltr.press([['ArrowRight', 'b'], ['ArrowRight', 'c']]);
        const card = await ltr.tab.evaluateHandle(() => document.activeElement);
        for (const width of [420, 260]) {
          await ltr.tab.setViewportSize({ width, height: 700 });
          const expectedColumns = width === 260 ? 1 : undefined;
          await ltr.tab.waitForFunction(({ wide, expectedColumns }) => {
            const columns = getComputedStyle(document.querySelector('[role="grid"]')).gridTemplateColumns.split(' ').length;
            return expectedColumns ? columns === expectedColumns : columns < wide;
          }, { wide, expectedColumns }).catch(async () => assert.fail(`columns at ${width}px: ${await ltr.columns()} (was ${wide})`));
          assert.equal(await ltr.tab.evaluate((node) => node === document.activeElement, card), true, `focus stays on the same card at ${width}px`);
          const fit = () => ltr.root().evaluate((node) => ({ root: [node.scrollWidth, node.clientWidth], page: [document.scrollingElement.scrollWidth, window.innerWidth] }));
          await ltr.tab.waitForFunction(() => {
            const node = document.querySelector('[role="grid"]');
            return node.scrollWidth <= node.clientWidth && document.scrollingElement.scrollWidth <= window.innerWidth;
          }, undefined, { timeout: 3000 }).catch(async () => assert.fail(`horizontal overflow at ${width}px: ${JSON.stringify(await fit())}`));
        }
        assert.ok(wide > 1, 'the wide viewport has several columns');
      });

      for (const layout of ['stack', 'grid']) {
        await t.test(`horizontal ${layout} scrolls inline and arrows move along it`, async () => {
          await ltr.open({ layout, orientation: 'horizontal', count: 12, width: 420 });
          const root = ltr.root();
          assert.equal(await root.getAttribute('data-orientation'), 'horizontal');
          assert.equal(await root.getAttribute('data-layout'), layout);
          assert.deepEqual(await root.evaluate((node) => [getComputedStyle(node).overflowX, node.scrollWidth > node.clientWidth]), ['auto', true], 'the root scrolls inline');
          const tops = await ltr.tab.locator('[role="row"]').evaluateAll((rows) => new Set(rows.map((row) => Math.round(row.getBoundingClientRect().top))).size);
          assert.equal(tops, 1, 'cards sit in a single row');
          await ltr.enter();
          await ltr.press([['ArrowRight', 'b'], ['ArrowRight', 'c'], ['ArrowRight', 'd'], ['ArrowRight', 'f'], ['ArrowRight', 'g'], ['ArrowRight', 'h'], ['ArrowRight', 'i'], ['ArrowLeft', 'h']]);
          const inView = () => root.evaluate((node) => {
            const row = document.activeElement.getBoundingClientRect();
            const box = node.getBoundingClientRect();
            return { scrolled: node.scrollLeft > 0, visible: row.left >= box.left - 0.5 && row.right <= box.right + 0.5 };
          });
          // Engines scroll the focused card into view on their own schedule.
          await pollUntil(ltr.tab, () => {
            const row = document.activeElement.getBoundingClientRect();
            const box = document.querySelector('[role="grid"]').getBoundingClientRect();
            return row.left >= box.left - 0.5 && row.right <= box.right + 0.5 && document.querySelector('[role="grid"]').scrollLeft > 0;
          }, undefined, {
            message: 'the focused card scrolls into view along the inline axis',
            report: () => { const node = document.querySelector('[role="grid"]'); return { row: document.activeElement.getBoundingClientRect().toJSON(), box: node.getBoundingClientRect().toJSON(), scrollLeft: node.scrollLeft }; },
          });
          assert.deepEqual(await inView(), { scrolled: true, visible: true }, 'the focused card scrolls into view');
          assert.deepEqual(await ltr.tab.evaluate(measureFocusRing), { focusVisible: true, painted: true, insideRoot: true, clippedBy: [] });
        });
      }

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
