import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// One client-rendered fixture per scenario, selected by `?scenario=`.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { PreviewTrigger } from '/src/overlays.mjs';
  import '/generated/styles.css';
  const h = React.createElement;

  function PreviewScenario() {
    return h('div', null,
      h('input', { id: 'typing', 'aria-label': 'Typing' }),
      h('div', { style: { height: 120 } }),
      h(PreviewTrigger, { 'aria-label': 'Preview', delay: 100, closeDelay: 100,
        trigger: h('a', { id: 'preview-link', href: '#preview' }, 'Preview link') },
        h('p', null, 'Preview body ', h('a', { id: 'inner-link', href: '#inner' }, 'Inner link'))),
      h('div', { style: { height: 120 } }),
      h('button', { id: 'after' }, 'After'));
  }

  const scenarios = { preview: PreviewScenario };
  const Scenario = scenarios[new URLSearchParams(location.search).get('scenario')];
  createRoot(document.getElementById('root')).render(h(Scenario));
  document.documentElement.dataset.ready = 'true';`;

let server;
let browser;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.mjs'],
    pages: { '/overlay-focus.html': pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', body: '<div id="root"></div>', entry: '/overlay-focus-entry.mjs' }) },
    modules: { '/overlay-focus-entry.mjs': entry },
  });
  browser = await launchBrowser();
});

after(async () => {
  await browser?.close();
  await server?.close();
});

async function openScenario(scenario) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.setDefaultTimeout(5_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${server.url}/overlay-focus.html?scenario=${scenario}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  return { page, errors };
}

const activeId = (page) => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);

test('PreviewTrigger leaves focus in place when its preview opens and lets Tab move in', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('preview');
  try {
    const preview = page.locator('.muxui-preview-trigger');

    // Pointer hover opens the preview without taking focus from a text field.
    await page.locator('#typing').click();
    await page.locator('#preview-link').hover();
    await preview.waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    assert.equal(await activeId(page), 'typing', 'hover-open keeps focus in the text field');
    await page.keyboard.type('abc');
    assert.equal(await page.locator('#typing').inputValue(), 'abc');
    await page.mouse.move(800, 650);
    await preview.waitFor({ state: 'detached' });

    // Keyboard focus opens the preview after its delay; focus stays on the trigger.
    await page.locator('#typing').focus();
    await page.keyboard.press('Tab');
    assert.equal(await activeId(page), 'preview-link');
    await preview.waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    assert.equal(await activeId(page), 'preview-link', 'focus-open keeps focus on the trigger');
    assert.equal(await preview.getAttribute('role'), 'dialog');
    assert.equal(await preview.getAttribute('aria-label'), 'Preview');

    // Tab moves into the preview, and Escape restores focus to the trigger.
    await page.keyboard.press('Tab');
    assert.equal(await activeId(page), 'inner-link');
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.id === 'preview-link');
    await page.waitForTimeout(250);
    assert.equal(await preview.count(), 0, 'restoring focus does not reopen the preview');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});
