import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ColorModePicker } from '/generated/color-mode-picker.js';
const e = React.createElement;
const root = createRoot(document.querySelector('#root'));
window.changes = [];
window.mount = (props = {}) => flushSync(() => root.render(e('main', null,
  e('button', { id: 'before' }, 'Before'),
  e(ColorModePicker, { onModeChange: (mode) => window.changes.push(mode), ...props }),
  e('button', { id: 'after' }, 'After'),
)));
window.mount();
document.documentElement.dataset.ready = 'true';
`;
const page = pageShell({
  head: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/generated/styles.css">',
  bodyAttributes: 'style="margin:0;padding:24px;background:var(--muxui-semantic-surface-canvas)"',
  body: '<div id="root"></div>',
  entry: '/color-mode-picker-entry.mjs',
});

test('ColorModePicker follows the emulated system preference live, saves Light and Dark, and keeps one tab stop', { timeout: 120_000 }, async () => {
  const server = await startServer({ entries: ['generated/color-mode-picker.js'], pages: { '/color-mode-picker.html': page }, modules: { '/color-mode-picker-entry.mjs': entry } });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ colorScheme: 'light', viewport: { width: 480, height: 600 } });
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const open = async () => {
      await tab.goto(`${server.url}/color-mode-picker.html`, { waitUntil: 'load' });
      await tab.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await awaitFontsAndFrames(tab);
    };
    const scheme = () => tab.evaluate(() => document.documentElement.getAttribute('data-muxui-color-scheme'));
    const saved = () => tab.evaluate(() => localStorage.getItem('muxui-color-mode'));
    const checked = () => tab.evaluate(() => [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map((node) => node.textContent));
    const focused = () => tab.evaluate(() => document.activeElement.textContent);
    const radio = (name) => tab.getByRole('radio', { name, exact: true });
    await open();

    // Nothing saved: System, which resolves the preference now and follows it.
    assert.equal(await tab.getByRole('radiogroup', { name: 'Color mode' }).count(), 1);
    assert.deepEqual(await checked(), ['System']);
    assert.equal(await scheme(), 'light');
    assert.equal(await saved(), null);
    await tab.emulateMedia({ colorScheme: 'dark' });
    await tab.waitForFunction(() => document.documentElement.getAttribute('data-muxui-color-scheme') === 'dark');
    await tab.emulateMedia({ colorScheme: 'light' });
    await tab.waitForFunction(() => document.documentElement.getAttribute('data-muxui-color-scheme') === 'light');
    assert.equal(await saved(), null);

    // Dark is saved as dark, and the system's preference no longer moves the page.
    await radio('Dark').click();
    assert.deepEqual([await scheme(), await saved(), await checked()], ['dark', 'dark', ['Dark']]);
    await tab.emulateMedia({ colorScheme: 'dark' });
    await tab.emulateMedia({ colorScheme: 'light' });
    await awaitFontsAndFrames(tab);
    assert.equal(await scheme(), 'dark');

    // A saved mode is restored after a reload, ahead of the system's preference.
    await open();
    assert.deepEqual([await scheme(), await checked()], ['dark', ['Dark']]);
    await radio('Light').click();
    assert.deepEqual([await scheme(), await saved()], ['light', 'light']);

    // System removes the saved value and follows the preference again.
    await tab.emulateMedia({ colorScheme: 'dark' });
    await radio('System').click();
    assert.deepEqual([await scheme(), await saved()], ['dark', null]);
    await tab.emulateMedia({ colorScheme: 'light' });
    await tab.waitForFunction(() => document.documentElement.getAttribute('data-muxui-color-scheme') === 'light');
    assert.deepEqual(await tab.evaluate(() => window.changes), ['light', 'system'], 'changes after the reload');

    // One tab stop: Tab enters on the selected option and the next Tab leaves the group.
    await tab.locator('#before').focus();
    await tab.keyboard.press('Tab');
    assert.equal(await focused(), 'System');
    await tab.keyboard.press('Tab');
    assert.equal(await tab.evaluate(() => document.activeElement.id), 'after');
    await tab.keyboard.press('Shift+Tab');
    assert.equal(await focused(), 'System');

    // Arrow keys move focus between the options; Space selects the focused one.
    await tab.keyboard.press('ArrowLeft');
    assert.equal(await focused(), 'Dark');
    assert.deepEqual(await checked(), ['System']);
    await tab.keyboard.press('Space');
    assert.deepEqual([await checked(), await saved()], [['Dark'], 'dark']);

    assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});
