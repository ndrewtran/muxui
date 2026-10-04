import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

// One client-rendered fixture per scenario, selected by `?scenario=`.
const entry = `import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { PreviewTrigger, Toast, ToastProvider, useToast } from '/src/overlays.mjs';
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

  function ToastControls() {
    const toast = useToast();
    React.useEffect(() => { window.toastManager = toast; }, [toast]);
    return h('button', { id: 'before' }, 'Before');
  }

  function ToastScenario() {
    return h(ToastProvider, null, h(ToastControls));
  }

  function DeclarativeToast() {
    const [shown, setShown] = React.useState(true);
    return shown ? h(Toast, { message: 'Saved', duration: 60_000, onDismiss: () => setShown(false) }) : h('p', { id: 'unmounted' }, 'Unmounted');
  }

  const scenarios = {
    preview: PreviewScenario,
    toast: ToastScenario,
    declarative: () => h(ToastProvider, null, h(DeclarativeToast)),
  };
  const Scenario = scenarios[new URLSearchParams(location.search).get('scenario')];
  createRoot(document.getElementById('root')).render(h(Scenario));
  document.documentElement.dataset.ready = 'true';`;

let server;
let browser;

before(async () => {
  server = await startServer({
    entries: ['src/overlays.mjs'],
    pages: { '/overlay-interactions.html': pageShell({ attributes: 'data-muxui-color-scheme="light" data-muxui-motion="full"', body: '<div id="root"></div>', entry: '/overlay-interactions-entry.mjs' }) },
    modules: { '/overlay-interactions-entry.mjs': entry },
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
  await page.goto(`${server.url}/overlay-interactions.html?scenario=${scenario}`);
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

test('keyboard Toast dismissal moves focus to the next toast, then back to the page', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('toast');
  try {
    await page.waitForFunction(() => window.toastManager);
    // Newest toasts render first, so the DOM order is Third, Second, First.
    await page.evaluate(() => ['First', 'Second', 'Third'].forEach((message) => window.toastManager.add(message, { duration: 60_000 })));
    const toasts = page.locator('.muxui-toast:not([data-muxui-toast-exiting])');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 3);
    const focusedToast = () => page.evaluate(() => {
      const active = document.activeElement;
      return active?.closest('.muxui-toast')?.querySelector('.muxui-toast-message')?.textContent || active?.id || active?.tagName;
    });

    // Tab from the page through Third (toast, dismiss) to Second's dismiss button.
    await page.locator('#before').focus();
    for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Dismiss notification');
    assert.equal(await focusedToast(), 'Second');

    // Dismissing the middle toast focuses the next one.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alertdialog');
    assert.equal(await focusedToast(), 'First');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 2);
    assert.equal(await focusedToast(), 'First', 'committing the exit keeps focus in place');

    // Dismissing the last toast in order falls back to the previous one.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await focusedToast(), 'Third');
    assert.equal(await toasts.count(), 1);

    // Dismissing the only remaining toast returns focus to where it was before the region.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(20);
    assert.equal(await focusedToast(), 'before');
    await page.waitForFunction(() => document.querySelectorAll('.muxui-toast').length === 0);
    assert.equal(await focusedToast(), 'before');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});

test('a declarative Toast whose onDismiss unmounts it still plays its exit', { timeout: 60_000 }, async () => {
  const { page, errors } = await openScenario('declarative');
  try {
    const toast = page.locator('.muxui-toast');
    await toast.waitFor({ state: 'visible' });
    await page.waitForTimeout(400);
    await page.locator('.muxui-toast-dismiss').click();
    await page.locator('#unmounted').waitFor();
    assert.equal(await page.locator('.muxui-toast[data-muxui-toast-exiting]').count(), 1, 'the exiting toast is retained after its owner unmounts');
    await toast.waitFor({ state: 'detached' });
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await page.close();
  }
});
