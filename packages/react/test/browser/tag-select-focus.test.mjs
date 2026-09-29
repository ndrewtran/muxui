import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { TagSelect } from '../../src/supplemental/index.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function TagSelectFocusFixture() {
  const items = [
    { id: 'alpha', label: 'Alpha' },
    { id: 'beta', label: 'Beta' },
  ];
  const [selectedKeys, setSelectedKeys] = React.useState(() => new Set(['alpha', 'beta']));
  React.useEffect(() => {
    window.__resetTagSelect = () => setSelectedKeys(new Set(['alpha', 'beta']));
    return () => { delete window.__resetTagSelect; };
  }, []);
  return React.createElement(React.Fragment, null,
    React.createElement(TagSelect.Root, {
      label: 'Tags',
      items,
      selectedKeys,
      onSelectionChange: setSelectedKeys,
    }, (item) => React.createElement(TagSelect.Item, { id: item.id, textValue: item.label }, item.label)),
    React.createElement('output', { 'data-testid': 'selected' }, [...selectedKeys].join('|')));
}

const browserEntry = `import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { TagSelect } from '/src/supplemental/index.mjs';
${TagSelectFocusFixture.toString()}
hydrateRoot(document.getElementById('root'), React.createElement(TagSelectFocusFixture));
document.documentElement.dataset.ready = 'true';
`;

const html = pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/generated/styles.css">', body: `<div id="root">${renderToString(React.createElement(TagSelectFocusFixture))}</div>`, entry: '/tag-select-focus-entry.mjs' });

test('TagSelect chip removal keeps ComboBox focus and popup behavior independent', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({
    entries: ['src/supplemental/index.mjs'],
    pages: { '/tag-select-focus.html': html },
    modules: { '/tag-select-focus-entry.mjs': browserEntry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${url}/tag-select-focus.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true' && window.__resetTagSelect);

    await page.getByRole('button', { name: 'Remove Beta', exact: true }).click();
    await page.getByTestId('selected').filter({ hasText: /^alpha$/u }).waitFor();
    assert.equal(await page.locator('.muxui-tag-select__popup').count(), 0, 'pointer removal does not open the ComboBox popup');

    await page.evaluate(() => window.__resetTagSelect());
    const input = page.getByRole('combobox', { name: 'Tags' });
    await input.focus();
    await page.keyboard.press('Escape');
    await page.locator('.muxui-tag-select__popup').waitFor({ state: 'detached' });
    assert.equal(await input.evaluate((node) => document.activeElement === node), true);
    await input.press('Home');
    await input.press('Backspace');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Beta');
    await page.keyboard.press('Space');
    await page.getByTestId('selected').filter({ hasText: /^alpha$/u }).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Remove Alpha');
    assert.equal(await page.locator('.muxui-tag-select__popup').count(), 0, 'Space removal restores previous-chip focus without opening the ComboBox');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
