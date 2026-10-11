import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';
import { pollUntil, settleMotion, warmUpServer } from './grid-list-probes.mjs';

// Cross-engine proof that a Mux Link inside a disabled GridList item is disabled
// the way the Button beside it is: inert markup, the shared disabled paint, and
// no focus stop or activation from the keyboard or the pointer. Each item holds
// a Link and a Button; item `b` is disabled. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { GridList } from '/src/collections.mjs';
import { Button } from '/src/button.mjs';
import { Link } from '/src/components.mjs';

const h = React.createElement;
const { layout = 'stack' } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
window.__events = [];
const log = (...entry) => window.__events.push(entry);

// Names the focused item, plus the nested control when focus is inside one.
window.__focus = () => {
  const node = document.activeElement;
  const row = node?.closest?.('[role="row"]');
  if (!row) return node?.id || node?.tagName?.toLowerCase() || 'none';
  const item = row.querySelector('[data-item]').dataset.item;
  return node === row ? item : item + ':' + node.tagName.toLowerCase();
};

function Fixture() {
  return h(GridList, { 'aria-label': 'Items', layout }, ['a', 'b', 'c'].map((id) => h(GridList.Item, { key: id, id, textValue: 'Item ' + id, disabled: id === 'b' },
    h('strong', { 'data-item': id }, 'Item ' + id),
    h(Link, { href: '#' + id, onActivate: () => log('link', id) }, 'Open ' + id),
    h(Button, { onActivate: () => log('button', id) }, 'Act ' + id))));
}
createRoot(document.getElementById('root')).render(h(Fixture));
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin: 16px; background: var(--muxui-semantic-surface-canvas)"',
  // WebKit on macOS skips plain buttons in sequential navigation; an explicit tabindex keeps it focusable.
  body: '<button id="before" tabindex="0">Before</button><div id="root"></div><button id="after" tabindex="0">After</button>',
  entry: '/link-entry.mjs',
});

for (const engine of browserEngines()) {
  test(`Link inside a disabled GridList item in ${engine}`, { timeout: 300_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/collections.mjs', 'src/button.mjs', 'src/components.mjs'],
      pages: { '/link.html': page },
      modules: { '/link-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      await warmUpServer(browser, `${url}/link.html`, '[role="grid"] [role="row"]');
      const context = await browser.newContext({ viewport: { width: 900, height: 700 }, locale: 'en-US' });
      const tab = await context.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const open = async (layout) => {
        await tab.goto(`${url}/link.html?config=${encodeURIComponent(JSON.stringify({ layout }))}`, { waitUntil: 'networkidle' });
        await tab.locator('[role="grid"] [role="row"]').first().waitFor({ timeout: 15_000 });
        await tab.locator('[data-muxui-grid-list-motion-ready]').waitFor();
        await tab.mouse.move(0, 0);
      };
      const row = (id) => tab.locator(`[role="row"]:has([data-item="${id}"])`);
      const events = () => tab.evaluate(() => window.__events);
      const expectFocus = (expected, message) => pollUntil(tab, (value) => window.__focus() === value, expected, {
        message: `${message}: focus reaches ${expected}`,
        report: () => ({ focus: window.__focus(), active: document.activeElement?.outerHTML.slice(0, 120) }),
      });
      const press = async (keys) => {
        for (const [key, destination] of keys) {
          await tab.keyboard.press(key);
          await expectFocus(destination, `${key} moves focus to ${destination}`);
        }
      };
      // Tab from the control before the grid lands on the first item.
      const enter = async () => {
        await tab.locator('#before').focus();
        await tab.keyboard.press('Tab');
        await expectFocus('a', 'Tab enters the grid on its first item');
      };
      // Pointer presses go to the control's coordinates, since an inert control may take no hit test.
      const clickAt = async (locator) => {
        const box = await locator.boundingBox();
        await tab.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      };
      // Events are ordered, so a press on an enabled control after the one under test proves the earlier press ran nothing.
      const expectEvents = async (expected, message) => {
        await pollUntil(tab, (count) => window.__events.length >= count, expected.length, {
          message,
          report: () => window.__events,
        });
        assert.deepEqual(await events(), expected, message);
      };

      await t.test('the Link in a disabled item is inert and painted like its Button, while enabled items keep an active Link', async () => {
        await open('stack');
        await settleMotion(tab.locator('[role="grid"]'));
        const read = (id) => row(id).evaluate((node) => {
          const link = node.querySelector('.muxui-link');
          const button = node.querySelector('.muxui-button');
          return {
            tag: link.localName,
            ariaDisabled: link.getAttribute('aria-disabled'),
            dataDisabled: link.getAttribute('data-disabled'),
            pointerEvents: getComputedStyle(link).pointerEvents,
            opacity: getComputedStyle(link).opacity,
            buttonOpacity: getComputedStyle(button).opacity,
            buttonDisabled: button.disabled,
          };
        });
        const [enabled, disabled] = [await read('a'), await read('b')];
        assert.deepEqual([enabled.tag, enabled.ariaDisabled, enabled.dataDisabled, enabled.pointerEvents, enabled.opacity], ['a', null, null, 'auto', '1'], 'an enabled item keeps its anchor');
        assert.deepEqual([disabled.tag, disabled.ariaDisabled, disabled.dataDisabled, disabled.pointerEvents, disabled.buttonDisabled], ['span', 'true', 'true', 'none', true], 'a disabled item makes the Link inert like the Button');
        assert.equal(disabled.opacity, disabled.buttonOpacity, 'the Link takes the same disabled paint as the Button');
        assert.ok(Number(disabled.opacity) < 1, `the disabled paint dims the Link (${disabled.opacity})`);
      });

      await t.test('arrow keys skip the disabled item and its Link never takes focus in a vertical stack', async () => {
        await open('stack');
        await enter();
        await press([['ArrowDown', 'c'], ['ArrowUp', 'a'], ['ArrowRight', 'a:a'], ['ArrowRight', 'a:button'], ['ArrowLeft', 'a:a'], ['ArrowLeft', 'a'], ['ArrowDown', 'c'], ['ArrowRight', 'c:a']]);
        await tab.keyboard.press('Enter');
        await expectEvents([['link', 'c']], 'Enter on the last enabled Link runs only that Link');
      });

      await t.test('Tab walks the enabled items\' controls and passes over the disabled item\'s Link in a grid layout', async () => {
        await open('grid');
        await enter();
        await press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Tab', 'after']]);
        await enter();
        await press([['Tab', 'a:a'], ['Tab', 'a:button'], ['Shift+Tab', 'a:a'], ['Shift+Tab', 'a'], ['Shift+Tab', 'before']]);
        assert.deepEqual(await events(), [], 'moving focus never presses a control');
        assert.equal(await row('b').locator('.muxui-link').getAttribute('tabindex'), null, 'the inert Link is no tab stop');
      });

      await t.test('pressing the disabled item\'s Link does nothing and the page does not navigate', async () => {
        await open('stack');
        await clickAt(row('b').locator('.muxui-link'));
        await clickAt(row('b').locator('.muxui-button'));
        await clickAt(row('a').locator('.muxui-link'));
        await expectEvents([['link', 'a']], 'only the enabled Link ran');
        assert.equal(await tab.evaluate(() => location.hash), '#a', 'the disabled Link never navigated');
        assert.equal(await tab.locator('[aria-selected="true"]').count(), 0, 'the disabled item stays unselected');
      });

      assert.deepEqual(errors, [], `page errors: ${errors.join('\n')}`);
      await context.close();
    } finally {
      await browser?.close();
      await close();
    }
  });
}
