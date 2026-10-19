import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import test from 'node:test';
import { MultiSelect } from '../../src/supplemental/index.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function MultiSelectContractFixture() {
  const items = [{ id: 'alpha', label: 'Alpha' }, { id: 'beta', label: 'Beta' }];
  const [log, setLog] = React.useState([]);
  const note = (entry) => setLog((entries) => [...entries, entry]);
  const keysText = (keys) => (keys === 'all' ? 'all' : [...keys].join('+') || 'none');
  const renderItem = (item) => React.createElement(MultiSelect.Item, { id: item.id, textValue: item.label }, item.label);
  return React.createElement(React.Fragment, null,
    React.createElement(MultiSelect.Root, { label: 'Stack', items, required: true, description: 'Pick any' }, renderItem),
    React.createElement(MultiSelect.Root, { label: 'Team', items, required: true, invalid: true, errorMessage: 'Choose at least one' }, renderItem),
    React.createElement(MultiSelect.Root, {
      label: 'Tags',
      items,
      defaultSelectedKeys: new Set(['alpha', 'beta']),
      onSelectionChange: (keys) => note(`change:${keysText(keys)}`),
      onReset: () => note('reset'),
      onSelectAll: () => note('selectAll'),
    }, renderItem),
    React.createElement('output', { 'data-testid': 'log' }, log.join(',')));
}

const browserEntry = `import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { MultiSelect } from '/src/supplemental/index.mjs';
${MultiSelectContractFixture.toString()}
hydrateRoot(document.getElementById('root'), React.createElement(MultiSelectContractFixture));
document.documentElement.dataset.ready = 'true';
`;

const html = pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', head: '<link rel="stylesheet" href="/generated/styles.css">', body: `<div id="root">${renderToString(React.createElement(MultiSelectContractFixture))}</div>`, entry: '/multi-select-entry.mjs' });

async function openPage(browser, url) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`${url}/multi-select.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return { page, errors };
}

test('MultiSelect puts required, invalid, description, and error on the trigger in the accessibility tree', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({
    entries: ['src/supplemental/index.mjs'],
    pages: { '/multi-select.html': html },
    modules: { '/multi-select-entry.mjs': browserEntry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const { page, errors } = await openPage(browser, url);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const axButton = (name) => nodes.find((node) => node.role?.value === 'button' && node.name?.value === name);

    // The accessible description joins the hidden status text and the visible description or error.
    assert.equal(axButton('Stack')?.description?.value, 'Required Pick any');
    assert.equal(axButton('Team')?.description?.value, 'Required, Invalid Choose at least one');
    assert.equal(axButton('Tags')?.description?.value ?? '', '');

    // aria-required is unsupported on a button, aria-invalid is deprecated there, and React Aria's Button filters both out.
    for (const name of ['Stack', 'Team']) {
      const trigger = page.getByRole('button', { name, exact: true });
      assert.equal(await trigger.getAttribute('aria-required'), null, name);
      assert.equal(await trigger.getAttribute('aria-invalid'), null, name);
    }
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});

test('MultiSelect Escape closes the popup and keeps the selection, and Reset and Select all change it', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({
    entries: ['src/supplemental/index.mjs'],
    pages: { '/multi-select.html': html },
    modules: { '/multi-select-entry.mjs': browserEntry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const { page, errors } = await openPage(browser, url);
    const trigger = page.getByRole('button', { name: 'Tags', exact: true });
    const popup = page.locator('.muxui-multi-select__popup');
    const log = () => page.getByTestId('log').textContent();
    const selectedOptions = () => popup.locator('[role=option][aria-selected=true]').count();

    await trigger.click();
    await popup.waitFor();
    // Search text is cleared before the popup closes; neither Escape touches the selection.
    await page.keyboard.type('Al');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.muxui-multi-select__search-input').inputValue(), '');
    assert.equal(await popup.count(), 1);
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    // React Aria restores focus a frame after the popup unmounts, which a slow runner can stretch.
    await page.waitForFunction((node) => document.activeElement === node, await trigger.elementHandle());
    assert.match(await trigger.textContent(), /2 selected/u);
    assert.equal(await log(), '', 'Escape does not report a selection change');

    await trigger.click();
    await popup.waitFor();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.match(await trigger.textContent(), /2 selected/u, 'one Escape closes and keeps the selection');
    assert.equal(await log(), '');

    await trigger.click();
    await popup.waitFor();
    assert.equal(await selectedOptions(), 2);
    await popup.getByRole('button', { name: 'Reset', exact: true }).click();
    assert.equal(await selectedOptions(), 0);
    assert.equal(await trigger.textContent(), 'Select');
    assert.equal(await log(), 'change:none,reset');
    await popup.getByRole('button', { name: 'Select all', exact: true }).click();
    assert.equal(await selectedOptions(), 2);
    assert.match(await trigger.textContent(), /2 selected/u);
    assert.equal(await log(), 'change:none,reset,change:all,selectAll');

    // Escape clears the search text only when focus is in the search field; from the footer it closes at once.
    await popup.locator('.muxui-multi-select__search-input').fill('Al');
    await popup.getByRole('button', { name: 'Reset', exact: true }).focus();
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached' });
    assert.match(await trigger.textContent(), /2 selected/u);
    assert.equal(await log(), 'change:none,reset,change:all,selectAll');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
