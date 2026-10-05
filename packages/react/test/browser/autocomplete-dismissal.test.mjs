import assert from 'node:assert/strict';
import test from 'node:test';
import { browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof for Autocomplete's dismissal focus guard. Engines differ
// during blur: Firefox reports a focused iframe as active, Chromium and WebKit
// the body; WebKit does not focus a clicked button. Runs in every engine named
// by MUXUI_BROWSER_ENGINES (see harness.mjs).

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Autocomplete } from '/src/fields.mjs';

const items = [{ id: 'one', label: 'One', textValue: 'One' }, { id: 'two', label: 'Two', textValue: 'Two' }];
let root;
window.__mount = () => {
  root = createRoot(document.getElementById('root'));
  root.render(React.createElement(Autocomplete, { label: 'Suggestions', items }));
};
window.__unmount = () => root.unmount();
window.__mount();
`;

const page = pageShell({
  attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"',
  head: '<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/src/styles/fields.css">',
  bodyAttributes: 'style="margin: 32px"',
  body: '<p id="inert" style="height: 120px; margin: 0">Inert content</p><div id="root"></div>'
    + '<input id="outside-input" aria-label="Outside input"><button id="outside-button">Outside button</button>'
    + '<iframe id="frame" title="Frame" srcdoc="<input aria-label=Frame>"></iframe>',
  entry: '/autocomplete-dismissal-entry.mjs',
});

// Counts the guard's pending frames and document listeners, recognised by
// their source text, so tests can prove clear and unmount cancel them.
function instrumentGuard() {
  const isGuard = (fn) => typeof fn === 'function' && Function.prototype.toString.call(fn).includes('PendingFocusRestore');
  const frames = new Set();
  const listeners = new Set();
  let scheduled = 0;
  const requestFrame = window.requestAnimationFrame.bind(window);
  const cancelFrame = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    if (!isGuard(callback)) return requestFrame(callback);
    const id = requestFrame((time) => {
      frames.delete(id);
      callback(time);
    });
    frames.add(id);
    scheduled += 1;
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
    cancelFrame(id);
  };
  const { addEventListener, removeEventListener } = Document.prototype;
  Document.prototype.addEventListener = function (type, listener, options) {
    if ((type === 'focusin' || type === 'keydown') && isGuard(listener)) listeners.add(listener);
    return addEventListener.call(this, type, listener, options);
  };
  Document.prototype.removeEventListener = function (type, listener, options) {
    if (type === 'focusin' || type === 'keydown') listeners.delete(listener);
    return removeEventListener.call(this, type, listener, options);
  };
  window.__guard = () => ({ frames: frames.size, listeners: listeners.size });
  // Cumulative, so a frame that already ran still counts.
  window.__guardFramesScheduled = () => scheduled;
}

const idle = { frames: 0, listeners: 0 };
const armed = { frames: 0, listeners: 2 };

for (const engine of browserEngines()) {
  test(`Autocomplete dismissal keeps the list closed without swallowing later focus in ${engine}`, { timeout: 120_000 }, async (t) => {
    const { url, close } = await startServer({
      entries: ['src/fields.mjs'],
      pages: { '/autocomplete-dismissal.html': page },
      modules: { '/autocomplete-dismissal-entry.mjs': entry },
    });
    let browser;
    try {
      browser = await launchBrowser(engine);
      const tab = await browser.newPage({ viewport: { width: 900, height: 700 } });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await tab.addInitScript(instrumentGuard);

      const input = tab.locator('.muxui-autocomplete input');
      const popover = tab.locator('.muxui-autocomplete-popover');
      const frames = (count = 3) => tab.evaluate((total) => new Promise((resolve) => {
        const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
        step(total);
      }), count);
      const guard = () => tab.evaluate(() => window.__guard());
      const active = () => tab.evaluate(() => {
        const node = document.activeElement;
        return node?.matches('.muxui-autocomplete input') ? 'autocomplete' : node?.id || node?.tagName.toLowerCase();
      });
      const inputActive = () => tab.waitForFunction(() => document.activeElement?.matches('.muxui-autocomplete input'));
      // Holds the list in its exit so a dismissal can race it.
      const slowExit = () => tab.evaluate(() => document.documentElement.style.setProperty('--muxui-semantic-motion-dismiss-transition-duration', '800ms'));
      const open = async ({ activate = false } = {}) => {
        await input.focus();
        await popover.waitFor();
        if (activate) {
          // A virtually focused option makes the list RAC's active focus scope,
          // so RAC restores focus to the input when the list unmounts.
          await tab.keyboard.press('ArrowDown');
          assert.ok(await input.getAttribute('aria-activedescendant'), 'ArrowDown activates an option');
        }
      };
      const staysClosed = async (message) => {
        await popover.waitFor({ state: 'detached' });
        await frames();
        assert.equal(await popover.count(), 0, message);
        assert.deepEqual(await guard(), idle, `${message}: the guard is released`);
      };
      // aria-expanded proves a reopen even while the previous list still exits.
      const reopens = async (message) => {
        await input.focus();
        await tab.locator('.muxui-autocomplete input[aria-expanded="true"]').waitFor({ timeout: 2000 }).catch(() => assert.fail(message));
        await popover.waitFor();
      };
      // Each case starts on a fresh page: RAC's focus-scope history from an
      // earlier case can change whether it restores focus at all.
      const scenario = (name, run) => t.test(name, async () => {
        await tab.goto(`${url}/autocomplete-dismissal.html`, { waitUntil: 'networkidle' });
        await input.waitFor();
        assert.equal(await popover.count(), 0, 'the list starts closed');
        await run();
      });

      await scenario('Escape closes in place without arming the guard', async () => {
        await open();
        await tab.keyboard.press('Escape');
        await staysClosed('Escape keeps the list closed');
        assert.equal(await active(), 'autocomplete');
        await tab.keyboard.press('ArrowDown');
        await popover.waitFor();
        await tab.keyboard.press('Escape');
        await staysClosed('Escape after ArrowDown keeps the list closed');
      });

      await scenario('outside click with the guard used keeps restored focus closed', async () => {
        await open({ activate: true });
        await tab.locator('#inert').click();
        await inputActive();
        await staysClosed('restored focus after an outside click keeps the list closed');
      });

      await scenario('outside click with the guard unused expires the guard', async () => {
        await open();
        await tab.locator('#inert').click();
        await staysClosed('an outside click closes the list');
        assert.equal(await active(), 'body');
        await reopens('focus after an unused guard expires reopens the list');
      });

      // RAC's close on scroll removes the pointerdown guard first, so only the
      // post-blur check sees the click on empty space during the exit.
      await scenario('scroll close then a click on empty space with the guard used stays closed', async () => {
        await slowExit();
        await open({ activate: true });
        await tab.evaluate(() => document.dispatchEvent(new Event('scroll')));
        await tab.locator('.muxui-autocomplete-popover[data-exiting]').waitFor();
        const scheduledBefore = await tab.evaluate(() => window.__guardFramesScheduled());
        await tab.mouse.click(4, 4);
        assert.ok(await tab.evaluate(() => window.__guardFramesScheduled()) > scheduledBefore, 'the blur schedules the focus check');
        await inputActive();
        await staysClosed('restored focus after a scroll close keeps the list closed');
      });

      await scenario('scroll close then a click on empty space with the guard unused reopens later', async () => {
        await slowExit();
        await open();
        await tab.evaluate(() => document.dispatchEvent(new Event('scroll')));
        await tab.locator('.muxui-autocomplete-popover[data-exiting]').waitFor();
        await tab.mouse.click(4, 4);
        await staysClosed('a scroll close keeps the list closed');
        assert.equal(await active(), 'body');
        await reopens('focus after the guard expires reopens the list');
      });

      await scenario('programmatic blur then focus reopens', async () => {
        await open();
        await input.evaluate((node) => {
          node.blur();
          node.focus();
        });
        await frames();
        assert.equal(await input.getAttribute('aria-expanded'), 'true', 'a same-task blur and focus keeps the list open');
        assert.deepEqual(await guard(), idle);
        await input.evaluate((node) => node.blur());
        await staysClosed('a programmatic blur closes the list');
        await reopens('focus after a programmatic blur reopens the list');
      });

      // Focus inside an iframe never leaves the body active, so the guard stays
      // unarmed and refocusing reopens even while the list still exits.
      await scenario('iframe focus then refocus reopens', async () => {
        await slowExit();
        await open({ activate: true });
        await tab.frameLocator('#frame').locator('input').focus();
        await tab.locator('.muxui-autocomplete-popover[data-exiting]').waitFor();
        await frames(2);
        assert.deepEqual(await guard(), idle, 'iframe focus leaves the guard unarmed');
        await reopens('refocus from an iframe during the exit reopens the list');
      });

      await scenario('a focused outside control releases the guard', async () => {
        await open({ activate: true });
        await tab.locator('#outside-input').click();
        await staysClosed('focusing another control keeps the list closed');
        assert.equal(await active(), 'outside-input');
        await reopens('focus after another control took focus reopens the list');
      });

      // WebKit does not focus a clicked button, so the click acts like one on
      // inert content: RAC restores focus to the input and the list stays closed.
      await scenario('an outside button click keeps the list closed', async () => {
        await open({ activate: true });
        await tab.locator('#outside-button').click();
        await staysClosed('a button click keeps the list closed');
        if (engine === 'webkit') {
          await inputActive();
          await frames();
          assert.equal(await popover.count(), 0, 'restored focus after a WebKit button click keeps the list closed');
        } else {
          assert.equal(await active(), 'outside-button');
          await reopens('focus after a focused button reopens the list');
        }
      });

      await scenario('clear cancels the focus check and releases an armed guard', async () => {
        await open();
        assert.deepEqual(await input.evaluate((node) => {
          node.blur();
          const pending = window.__guard();
          node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          return [pending, window.__guard()];
        }), [{ frames: 1, listeners: 0 }, idle], 'clear cancels the post-blur check');
        await staysClosed('a blur closes the list');
        await slowExit();
        await open({ activate: true });
        await tab.mouse.click(4, 4);
        // The 800 ms exit keeps the list connected, so the guard cannot expire yet.
        assert.deepEqual(await guard(), armed, 'an outside click arms the guard');
        await input.evaluate((node) => node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
        assert.deepEqual(await guard(), idle, 'clear releases an armed guard');
        // RAC's restored focus is no longer consumed, so it reopens the list.
        await inputActive();
        await reopens('restored focus after a clear reopens the list');
      });

      await scenario('unmount cancels the focus check and releases an armed guard', async () => {
        await open();
        assert.deepEqual(await input.evaluate((node) => {
          node.blur();
          const pending = window.__guard();
          window.__unmount();
          return [pending, window.__guard()];
        }), [{ frames: 1, listeners: 0 }, idle], 'unmount cancels the post-blur check');
        await tab.evaluate(() => window.__mount());
        await slowExit();
        await open({ activate: true });
        await tab.mouse.click(4, 4);
        assert.deepEqual(await guard(), armed, 'an outside click arms the guard');
        await tab.evaluate(() => window.__unmount());
        assert.deepEqual(await guard(), idle, 'unmount releases an armed guard');
      });

      assert.deepEqual(errors, [], errors.join('\n'));
    } finally {
      await browser?.close();
      await close();
    }
  });
}
