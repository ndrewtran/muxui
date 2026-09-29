import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SelectNativeBrowserFixture } from '../fixtures/select-native-browser-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

test('SelectNative hydrates as a native form control and preserves browser focus/reset behavior', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { hydrateRoot } from 'react-dom/client';
    import { SelectNativeBrowserFixture } from '/test/fixtures/select-native-browser-fixture.mjs';
    import '/src/styles/base.css';
    import '/src/supplemental/styles.css';
    import '/src/supplemental/select-native.css';
    hydrateRoot(document.getElementById('root'), React.createElement(SelectNativeBrowserFixture));`;
  const html = pageShell({ body: `<div id="root">${renderToString(React.createElement(SelectNativeBrowserFixture))}</div>`, entry: '/select-native-browser-entry.mjs' });
  const { url, close } = await startServer({
    entries: ['src/supplemental/select-native.mjs'],
    pages: { '/select-native.html': html },
    modules: { '/select-native-browser-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/select-native.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'SELECT');
    assert.deepEqual(errors, []);

    const select = page.locator('#panel');
    assert.equal(await select.getAttribute('title'), 'Saved panel URL');
    assert.equal(await select.getAttribute('size'), null);
    assert.equal(await select.getAttribute('data-size'), 'sm');
    assert.equal(await select.evaluate((node) => getComputedStyle(node).appearance), 'auto');
    assert.equal(await select.locator('option').count(), 3);
    assert.equal(await select.locator('optgroup').getAttribute('label'), 'Workspaces');
    assert.equal(await select.getAttribute('aria-labelledby') !== null, true);
    assert.equal(await select.getAttribute('aria-describedby') !== null, true);

    await select.selectOption('research');
    assert.equal(await page.locator('#selected').textContent(), 'research');
    assert.equal(await page.locator('#last-change').textContent(), 'research');
    await select.focus();
    assert.equal(await select.evaluate((node) => document.activeElement === node), true);
    await page.locator('#submit').click();
    assert.equal(await page.locator('#submitted').textContent(), 'research');
    await page.locator('#reset').click();
    assert.equal(await select.inputValue(), 'inbox');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
