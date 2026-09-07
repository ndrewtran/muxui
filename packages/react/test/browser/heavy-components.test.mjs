import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { HeavyBrowserFixture } from '../fixtures/heavy-browser-fixture.mjs';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const chromeCandidates = [process.env.MUXUI_CHROME_EXECUTABLE, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

async function findChrome() {
  const { access } = await import('node:fs/promises');
  for (const candidate of chromeCandidates) {
    try { await access(candidate); return candidate; } catch { /* Try the next installed browser. */ }
  }
  throw new Error('Install Chrome or set MUXUI_CHROME_EXECUTABLE for heavy browser verification.');
}

function fixtureDocument() {
  const body = renderToStaticMarkup(React.createElement(HeavyBrowserFixture, { interactive: true }));
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,heavy"><style>
:root { --muxui-semantic-color-neutral-10:#f2f1f0; --muxui-semantic-color-neutral-20:#dad7d6; --muxui-semantic-color-neutral-30:#c1bebb; --muxui-semantic-color-neutral-40:#a9a4a0; --muxui-semantic-color-neutral-90:#2b2826; --muxui-semantic-surface-raised:#fff; --muxui-semantic-typography-text-color:#111; --muxui-semantic-content-link:#025768; --muxui-semantic-content-muted:#79716b; --muxui-semantic-focus-ring:#5d5aeb; --muxui-semantic-feedback-invalid:#cc3330; --muxui-semantic-control-radius:8px; --muxui-reference-dimension-space-xs:4px; --muxui-reference-dimension-space-s:8px; --muxui-reference-dimension-space-2xs:2px; --muxui-reference-dimension-space-3xs:1px; --muxui-reference-dimension-space-l:16px; --muxui-reference-dimension-space-2xl:32px; --muxui-reference-dimension-radius-xs:4px; --muxui-reference-dimension-radius-m:8px; --muxui-reference-dimension-radius-xl:16px; --muxui-reference-dimension-radius-full:999px; --muxui-reference-effect-shadow-l:0 12px 30px rgb(0 0 0 / .2); --muxui-reference-effect-shadow-m:0 4px 12px rgb(0 0 0 / .2); --muxui-reference-effect-shadow-s:0 2px 6px rgb(0 0 0 / .2); --muxui-reference-typography-body-font:sans-serif; --muxui-reference-typography-mono-font:monospace; }
[data-theme="dark"] { --muxui-semantic-color-neutral-10:#302d2b; --muxui-semantic-color-neutral-20:#5f5954; --muxui-semantic-color-neutral-30:#4a4542; --muxui-semantic-color-neutral-40:#79716b; --muxui-semantic-color-neutral-90:#e8e7e6; --muxui-semantic-surface-raised:#211e1d; --muxui-semantic-typography-text-color:#f2f1f0; --muxui-semantic-content-link:#7badb1; --muxui-semantic-content-muted:#a9a4a0; }
</style></head><body><div id="root">${body}</div><script type="module" src="/packages/react/test/fixtures/heavy-browser-entry.mjs"></script></body></html>`;
}

test('heavy React ports hydrate and preserve core browser interactions', { timeout: 90_000 }, async () => {
  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    logLevel: 'error',
    optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'lucide-react'] },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [repositoryRoot] } },
    plugins: [{ name: 'heavy-fixture-document', configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url === '/heavy-fixture.html') {
          response.statusCode = 200;
          response.setHeader('content-type', 'text/html');
          response.end(fixtureDocument());
          return;
        }
        next();
      });
    } }],
  });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(typeof address, 'object');
    browser = await chromium.launch({ executablePath: await findChrome(), headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${address.port}/heavy-fixture.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.ProseMirror');
    assert.deepEqual(errors, [], errors.join('\n'));
    assert.equal(await page.locator('#heavy-fixture').getAttribute('data-interactive'), 'true');
    assert.equal(await page.locator('#document-editor').getAttribute('aria-label'), 'Document editor');
    assert.equal(await page.locator('#readonly-editor').getAttribute('aria-readonly'), 'true');
    assert.match(await page.locator('.muxui-markdown').textContent(), /raw/u);
    assert.equal(await page.locator('.muxui-markdown span').count(), 0);
    assert.equal(await page.locator('.muxui-markdown a').count(), 1);

    const payment = page.locator('.muxui-payment-input__input');
    assert.equal(await payment.inputValue(), '4111 1111 1111 1111');
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-card-type'), 'visa');
    await page.locator('#set-payment-mastercard').click();
    assert.equal(await payment.inputValue(), '5555 5555 5555 4444');
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-card-type'), 'mastercard');
    await page.locator('#reject-payment').click();
    await payment.fill('4000000000000002');
    await page.waitForFunction(() => document.querySelector('[data-testid="payment-last-change"]')?.textContent === '4000 0000 0000 0002');
    assert.equal(await payment.inputValue(), '5555 5555 5555 4444');
    await page.locator('#accept-payment').click();
    await payment.fill('4000000000000002');
    await page.waitForFunction(() => document.querySelector('[data-testid="payment-value"]')?.textContent === '4000 0000 0000 0002');
    assert.equal(await payment.inputValue(), '4000 0000 0000 0002');
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-card-type'), 'visa');

    const light = await page.locator('.muxui-resizable-handle').evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.locator('#dark-toggle').click();
    const dark = await page.locator('.muxui-resizable-handle').evaluate((node) => getComputedStyle(node).backgroundColor);
    assert.notEqual(light, dark);

    const editor = page.locator('#document-editor');
    await editor.click();
    await page.keyboard.type(' browser');
    assert.match(await page.locator('[data-testid="editor-value"]').textContent(), /browser/u);
    await editor.press(`${selectAllModifier}+A`);
    await page.evaluate(() => {
      const editorNode = document.querySelector('#document-editor');
      const selection = window.getSelection();
      if (!editorNode || !selection) return;
      const range = document.createRange();
      range.selectNodeContents(editorNode);
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    });
    await page.getByRole('toolbar', { name: 'Selection formatting' }).waitFor();
    await editor.click();
    await page.getByRole('toolbar', { name: 'Selection formatting' }).waitFor({ state: 'detached' });
    await editor.press(`${selectAllModifier}+A`);
    await page.getByRole('toolbar', { name: 'Selection formatting' }).getByRole('button', { name: 'Bold', exact: true }).click();
    assert.match(await editor.innerHTML(), /<strong>/u);

    await editor.focus();
    await editor.press(`${selectAllModifier}+A`);
    const colorButton = page.getByRole('button', { name: 'Text color', exact: true });
    await colorButton.focus();
    await colorButton.press('Enter');
    const colorDialog = page.getByRole('dialog', { name: 'Text color picker' });
    await colorDialog.waitFor();
    const colorInput = colorDialog.locator('input');
    await colorInput.fill('#ff0000');
    await colorInput.evaluate((node) => node.blur());
    await colorInput.focus();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Custom color"]')?.value.toLowerCase() === '#ff0000');
    await page.waitForFunction(() => [...document.querySelectorAll('.ProseMirror span')].some((node) => getComputedStyle(node).color === 'rgb(255, 0, 0)'));
    await page.waitForFunction(() => document.querySelector('[data-testid="editor-document"]')?.textContent?.includes('#ff0000'));
    const serializedDocument = await page.locator('[data-testid="editor-document"]').textContent();
    assert.ok(serializedDocument);
    const editorDocument = JSON.parse(serializedDocument);
    assert.equal(editorDocument.content.some((node) => node.content?.some((child) => child.marks?.some((mark) => mark.type === 'textStyle' && mark.attrs?.color === '#ff0000'))), true);
    await page.keyboard.press('Escape');
    await colorDialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Text color' || document.activeElement?.classList.contains('ProseMirror'));
    const restoredFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? (document.activeElement?.classList.contains('ProseMirror') ? 'Document editor' : null));
    assert.ok(['Text color', 'Document editor'].includes(restoredFocus), `focus was not restored to an editor control: ${restoredFocus}`);
    await page.evaluate(() => {
      window.__heavyPromptCalls = 0;
      window.prompt = () => { window.__heavyPromptCalls += 1; return null; };
      document.querySelector('#dark-toggle')?.focus();
      document.querySelector('#dark-toggle')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    assert.equal(await page.evaluate(() => window.__heavyPromptCalls), 0);
    await editor.press(`${selectAllModifier}+K`);
    assert.equal(await page.locator('[data-testid="link-requests"]').textContent(), '1');
    assert.equal(await page.evaluate(() => window.__heavyPromptCalls), 0);
    const readOnlyEditor = page.locator('#readonly-editor');
    await readOnlyEditor.dispatchEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    assert.equal(await page.locator('[data-testid="link-requests"]').textContent(), '1');
    assert.equal(await page.evaluate(() => window.__heavyPromptCalls), 0);

    await page.evaluate(() => {
      window.__imagePromptCalls = 0;
      window.prompt = () => { window.__imagePromptCalls += 1; return 'https://example.com/photo.png'; };
    });
    await page.getByRole('button', { name: 'Insert image', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__imagePromptCalls), 1);
    await page.locator('.ProseMirror img').waitFor();
    assert.equal(await page.locator('#document-editor img').getAttribute('src'), 'https://example.com/photo.png');

    await page.locator('#reject-editor').click();
    await editor.click();
    await page.keyboard.type(' rejected');
    await page.waitForFunction(() => !document.querySelector('#document-editor')?.textContent?.includes('rejected'));
    assert.doesNotMatch(await editor.textContent(), /rejected/u);

    await editor.evaluate((node) => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await editor.click();
    await page.keyboard.type(' composing');
    assert.match(await editor.textContent(), /composing/u);
    await editor.evaluate((node) => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.waitForFunction(() => !document.querySelector('#document-editor')?.textContent?.includes('composing'));
    assert.doesNotMatch(await editor.textContent(), /composing/u);

    const handle = page.locator('[data-handle-id="split"]');
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await page.locator('[data-testid="sizes"]').textContent(), '55/45');
    const beforeCancel = await page.locator('[data-testid="commits"]').textContent();
    const box = await handle.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
    await page.evaluate(() => document.querySelector('[data-handle-id="split"]').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })));
    assert.equal(await page.locator('[data-testid="commits"]').textContent(), beforeCancel);

    const trigger = page.getByRole('button', { name: 'Open lightbox' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('dialog').getAttribute('aria-label'), 'First');
    await page.locator('.muxui-lightbox-popup').press('ArrowRight');
    assert.match(await page.getByRole('dialog').textContent(), /Second/u);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Open lightbox');
    const disabledTrigger = page.getByRole('button', { name: 'Disabled lightbox' });
    assert.equal(await disabledTrigger.isDisabled(), true);
    await disabledTrigger.click({ force: true });
    assert.equal(await page.getByRole('dialog').count(), 0);

    await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await trigger.click();
    await page.getByRole('dialog').waitFor();
    await page.evaluate(() => {
      const popup = document.querySelector('.muxui-lightbox-popup');
      const start = new Event('touchstart', { bubbles: true });
      Object.defineProperty(start, 'touches', { value: [{ clientX: 100 }] });
      const end = new Event('touchend', { bubbles: true });
      Object.defineProperty(end, 'changedTouches', { value: [{ clientX: 20 }] });
      popup.dispatchEvent(start);
      popup.dispatchEvent(end);
    });
    assert.match(await page.getByRole('dialog').textContent(), /Second/u);

    await page.evaluate(() => {
      window.__heavyFixtureRoot?.unmount();
    });
    await page.waitForFunction(() => document.querySelector('#root')?.childElementCount === 0);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
    assert.equal(await page.evaluate(() => window.__heavyPromptCalls), 0);
    assert.equal(await page.locator('.ProseMirror').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
  } finally {
    await browser?.close();
    await server.close();
  }
});
