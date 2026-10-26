import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { HeavyBrowserFixture } from '../fixtures/heavy-browser-fixture.mjs';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

const selectAllModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
// Vite scans this entry before the first request. Without it, a cold server finds the editor's dependencies
// while the page loads, re-optimizes, and can blank the page long enough for the editor to never appear.
const fixtureEntry = 'packages/react/test/fixtures/heavy-browser-entry.mjs';

function fixtureDocument() {
  const body = renderToStaticMarkup(React.createElement(HeavyBrowserFixture, { interactive: true }));
  return pageShell({ head: `<style>
:root { --muxui-semantic-color-neutral-10:#f2f1f0; --muxui-semantic-color-neutral-20:#dad7d6; --muxui-semantic-color-neutral-30:#c1bebb; --muxui-semantic-color-neutral-40:#a9a4a0; --muxui-semantic-color-neutral-90:#2b2826; --muxui-semantic-surface-raised:#fff; --muxui-semantic-typography-text-color:#111; --muxui-semantic-content-link:#025768; --muxui-semantic-content-muted:#79716b; --muxui-semantic-focus-ring:#5d5aeb; --muxui-semantic-feedback-invalid:#cc3330; --muxui-semantic-control-radius:8px; --muxui-reference-dimension-space-xs:4px; --muxui-reference-dimension-space-s:8px; --muxui-reference-dimension-space-2xs:2px; --muxui-reference-dimension-space-3xs:1px; --muxui-reference-dimension-space-l:16px; --muxui-reference-dimension-space-2xl:32px; --muxui-reference-dimension-radius-xs:4px; --muxui-reference-dimension-radius-m:8px; --muxui-reference-dimension-radius-xl:16px; --muxui-reference-dimension-radius-full:999px; --muxui-reference-effect-shadow-l:0 12px 30px rgb(0 0 0 / .2); --muxui-reference-effect-shadow-m:0 4px 12px rgb(0 0 0 / .2); --muxui-reference-effect-shadow-s:0 2px 6px rgb(0 0 0 / .2); --muxui-reference-typography-body-font:sans-serif; --muxui-reference-typography-mono-font:monospace; }
[data-theme="dark"] { --muxui-semantic-color-neutral-10:#302d2b; --muxui-semantic-color-neutral-20:#5f5954; --muxui-semantic-color-neutral-30:#4a4542; --muxui-semantic-color-neutral-40:#79716b; --muxui-semantic-color-neutral-90:#e8e7e6; --muxui-semantic-surface-raised:#211e1d; --muxui-semantic-typography-text-color:#f2f1f0; --muxui-semantic-content-link:#7badb1; --muxui-semantic-content-muted:#a9a4a0; }
</style>`, body: `<div id="root">${body}</div>`, entry: '/packages/react/test/fixtures/heavy-browser-entry.mjs' });
}

test('heavy React ports hydrate and preserve core browser interactions', { timeout: 90_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [fixtureEntry], pages: { '/heavy-fixture.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/heavy-fixture.html`, { waitUntil: 'networkidle' });
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
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-muxui-card-type'), 'visa');
    await page.locator('#set-payment-mastercard').click();
    assert.equal(await payment.inputValue(), '5555 5555 5555 4444');
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-muxui-card-type'), 'mastercard');
    await page.locator('#reject-payment').click();
    await payment.fill('4000000000000002');
    await page.waitForFunction(() => document.querySelector('[data-testid="payment-last-change"]')?.textContent === '4000 0000 0000 0002');
    assert.equal(await payment.inputValue(), '5555 5555 5555 4444');
    await page.locator('#accept-payment').click();
    await payment.fill('4000000000000002');
    await page.waitForFunction(() => document.querySelector('[data-testid="payment-value"]')?.textContent === '4000 0000 0000 0002');
    assert.equal(await payment.inputValue(), '4000 0000 0000 0002');
    assert.equal(await page.locator('.muxui-payment-input__card-icon').getAttribute('data-muxui-card-type'), 'visa');

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

    const handle = page.locator('[data-muxui-handle-id="split"]');
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    assert.equal(await page.locator('[data-testid="sizes"]').textContent(), '55/45');
    const beforeCancel = await page.locator('[data-testid="commits"]').textContent();
    const box = await handle.boundingBox();
    assert.ok(box);
    const grip = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const sizesAre = (text) => page.waitForFunction((expected) => document.querySelector('[data-testid="sizes"]')?.textContent === expected, text);
    const dragLeft = async () => {
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.mouse.move(grip.x - 80, grip.y);
      await page.waitForFunction(() => document.querySelector('[data-testid="sizes"]')?.textContent !== '55/45');
    };
    // A cancelled drag, and one that loses pointer capture, put back the sizes from before it and never commit.
    for (const cancelDrag of [
      () => page.evaluate(() => document.querySelector('[data-muxui-handle-id="split"]').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))),
      // Chromium fires lostpointercapture with the next pointer event, so move the pointer after releasing it.
      async () => {
        await page.evaluate(() => document.querySelector('[data-muxui-handle-id="split"]').releasePointerCapture(1));
        await page.mouse.move(grip.x - 81, grip.y);
      },
    ]) {
      await dragLeft();
      await cancelDrag();
      await sizesAre('55/45');
      assert.equal(await page.locator('[data-testid="commits"]').textContent(), beforeCancel);
      await page.mouse.up();
    }
    // A finished drag commits once and keeps its sizes through the lost capture that follows the release.
    await dragLeft();
    await page.mouse.up();
    await page.waitForFunction((count) => document.querySelector('[data-testid="commits"]')?.textContent === String(Number(count) + 1), beforeCancel);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.notEqual(await page.locator('[data-testid="sizes"]').textContent(), '55/45');

    const trigger = page.getByRole('button', { name: 'Open lightbox' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.getByRole('dialog').getAttribute('aria-label'), 'First');
    await page.locator('.muxui-lightbox-popup').press('ArrowRight');
    assert.match(await page.getByRole('dialog').textContent(), /Second/u);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    // React Aria restores focus a frame after the popup unmounts, so wait for it instead of reading when the node detaches.
    await page.waitForFunction(() => document.activeElement?.textContent === 'Open lightbox', undefined, { timeout: 5000 }).catch(() => {});
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
    await close();
  }
});

// Opens the heavy fixture and returns keyboard helpers for #document-editor,
// whose onChange output is mirrored into the editor-document output.
async function openDocumentEditor(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${url}/heavy-fixture.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#document-editor.ProseMirror');
  const editor = page.locator('#document-editor');
  // Let ProseMirror read DOM selection and onChange output before asserting.
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return {
    page,
    editor,
    settle,
    focusInEditor: () => page.evaluate(() => document.querySelector('#document-editor').contains(document.activeElement)),
    focusOnPageControl: () => page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body),
    editorDocument: async () => {
      await settle();
      return JSON.parse(await page.locator('[data-testid="editor-document"]').textContent());
    },
    caretAtStartOf: async (text) => {
      await editor.getByText(text, { exact: true }).click();
      await page.keyboard.press('Home');
      await settle();
    },
    clear: async () => {
      await editor.focus();
      await editor.press(`${selectAllModifier}+A`);
      await page.keyboard.press('Backspace');
    },
  };
}

const paragraph = (text) => (text === undefined ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text }] });
const bulletList = (...items) => ({ type: 'bulletList', content: items.map((content) => ({ type: 'listItem', content })) });

// Tiptap 3.30 added a ListKeymap Tab handler that nests a text block
// (paragraph or heading) that starts right after a list into the list's last
// item. Tab and Shift+Tab must still leave the editor everywhere else they did
// under 3.22.3.
test('TextEditor Tab and Shift+Tab leave the editor except when nesting after a list', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [fixtureEntry], pages: { '/heavy-fixture.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const { page, focusInEditor, focusOnPageControl, editorDocument, caretAtStartOf, clear } = await openDocumentEditor(browser, url);

    // Ordinary paragraph: Tab and Shift+Tab move focus out without editing.
    const before = await editorDocument();
    for (const key of ['Tab', 'Shift+Tab']) {
      await caretAtStartOf('Hydrated draft');
      assert.equal(await focusInEditor(), true);
      await page.keyboard.press(key);
      assert.equal(await focusInEditor(), false, `${key} leaves an ordinary paragraph`);
      assert.equal(await focusOnPageControl(), true, `${key} moves focus to another page control`);
      assert.deepEqual(await editorDocument(), before, `${key} does not edit an ordinary paragraph`);
    }

    // A list followed by a paragraph, plus Tiptap's trailing empty paragraph.
    await clear();
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    const listThenParagraph = { type: 'doc', content: [bulletList([paragraph('one')]), paragraph('after'), paragraph()] };
    assert.deepEqual(await editorDocument(), listThenParagraph);

    // Shift+Tab at the start of that paragraph still leaves the editor.
    await caretAtStartOf('after');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusInEditor(), false, 'Shift+Tab leaves a paragraph that follows a list');
    assert.deepEqual(await editorDocument(), listThenParagraph);

    // Tab at the start of that paragraph nests it into the last list item.
    await caretAtStartOf('after');
    await page.keyboard.press('Tab');
    assert.equal(await focusInEditor(), true, 'Tab nests instead of leaving');
    const nested = { type: 'doc', content: [bulletList([paragraph('one'), paragraph('after')]), paragraph()] };
    assert.deepEqual(await editorDocument(), nested);

    // Tab again at the start of the nested text leaves the editor: no trap.
    await caretAtStartOf('after');
    await page.keyboard.press('Tab');
    assert.equal(await focusInEditor(), false, 'Tab leaves once the paragraph is nested');
    assert.equal(await focusOnPageControl(), true);
    assert.deepEqual(await editorDocument(), nested);

    // Inside a non-first list item, Tab sinks and Shift+Tab lifts, keeping focus.
    await clear();
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    const flatList = { type: 'doc', content: [bulletList([paragraph('one')], [paragraph('two')]), paragraph()] };
    assert.deepEqual(await editorDocument(), flatList);
    await caretAtStartOf('two');
    await page.keyboard.press('Tab');
    assert.equal(await focusInEditor(), true, 'Tab sinks a list item');
    assert.deepEqual(await editorDocument(), { type: 'doc', content: [bulletList([paragraph('one'), bulletList([paragraph('two')])]), paragraph()] });
    await caretAtStartOf('two');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focusInEditor(), true, 'Shift+Tab lifts a nested list item');
    assert.deepEqual(await editorDocument(), flatList);
  } finally {
    await browser?.close();
    await close();
  }
});

// Pins two editing changes that Tiptap 3.31 made.
test('TextEditor blockquote Backspace and leading code block ArrowUp follow Tiptap 3.31', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [fixtureEntry], pages: { '/heavy-fixture.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const { page, editorDocument, caretAtStartOf, clear } = await openDocumentEditor(browser, url);

    // Backspace at the start of a second paragraph in a blockquote lifts it
    // out and splits the quote. Under 3.22.3 it joined the paragraphs into
    // one quoted paragraph: blockquote > paragraph "onetwo".
    await clear();
    await page.keyboard.type('> one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    assert.deepEqual(await editorDocument(), { type: 'doc', content: [{ type: 'blockquote', content: [paragraph('one'), paragraph('two')] }, paragraph()] });
    await caretAtStartOf('two');
    await page.keyboard.press('Backspace');
    assert.deepEqual(await editorDocument(), { type: 'doc', content: [{ type: 'blockquote', content: [paragraph('one')] }, paragraph('two'), paragraph()] });

    // ArrowUp at the start of a leading code block inserts an empty paragraph
    // before it and reports the change. Under 3.22.3 the document was unchanged.
    await clear();
    await page.keyboard.type('``` code');
    const codeBlock = { type: 'codeBlock', content: [{ type: 'text', text: 'code' }] };
    assert.deepEqual(await editorDocument(), { type: 'doc', content: [codeBlock, paragraph()] });
    await caretAtStartOf('code');
    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await editorDocument(), { type: 'doc', content: [paragraph(), codeBlock, paragraph()] });
  } finally {
    await browser?.close();
    await close();
  }
});

// Tiptap 3 reads setContent's second argument as an options object, so a boolean
// still emitted an update, and setEditable emits one by default. Real typing
// proves refused over-limit edits, mount, read-only toggles and external value changes
// stay out of onChange, and the characters-left hint follows every edit.
test('TextEditor limit refuses over-limit edits without reporting them and keeps the hint live', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({ root: 'repository', entries: [fixtureEntry], pages: { '/heavy-fixture.html': fixtureDocument } });
  let browser;
  try {
    browser = await launchBrowser();
    const { page, settle } = await openDocumentEditor(browser, url);
    await page.waitForSelector('#limit-controlled.ProseMirror');
    await page.waitForSelector('#limit-uncontrolled.ProseMirror');
    const text = async (selector) => {
      await settle();
      return page.locator(selector).textContent();
    };
    const calls = async (name) => JSON.parse(await text(`[data-testid="${name}-calls"]`) || '[]');
    const shown = (name) => text(`[data-testid="${name}"] .ProseMirror`);
    const hint = (name) => text(`[data-testid="${name}"] .muxui-text-editor__hint`);
    const left = (count) => `${count} characters left`;
    const typeAtEnd = async (name, characters) => {
      await page.locator(`#${name}`).click();
      await page.keyboard.press('End');
      await page.keyboard.type(characters);
    };

    // Mounting reports nothing and the hint counts the starting text.
    for (const name of ['limit-controlled', 'limit-uncontrolled']) {
      assert.deepEqual(await calls(name), [], `${name} reports no change at mount`);
      assert.equal(await shown(name), 'abc');
      assert.equal(await hint(name), left(2));
    }

    // Uncontrolled: accepted edits report, rejected ones do not, and the hint follows without a parent render.
    await typeAtEnd('limit-uncontrolled', 'de');
    assert.equal(await shown('limit-uncontrolled'), 'abcde');
    assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde']);
    assert.equal(await hint('limit-uncontrolled'), left(0));
    for (const character of 'fg') {
      await page.keyboard.type(character);
      assert.equal(await shown('limit-uncontrolled'), 'abcde', `${character} is refused`);
      assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde'], `refusing ${character} is not reported`);
      assert.equal(await hint('limit-uncontrolled'), left(0));
    }
    await page.keyboard.press('Backspace');
    assert.equal(await shown('limit-uncontrolled'), 'abcd');
    assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde', 'abcd']);
    assert.equal(await hint('limit-uncontrolled'), '1 character left');
    await page.locator('#limit-toggle-readonly').click();
    await page.locator('#limit-toggle-readonly').click();
    assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde', 'abcd'], 'read-only toggles are not reported');

    // A paste is judged after its paste rules run: `**ab**` is six characters pasted but bold "ab" once formatted.
    const pasteOver = async (name, text) => {
      await page.locator(`#${name}`).click();
      await page.keyboard.press(`${selectAllModifier}+A`);
      await page.evaluate(({ id, pasted }) => {
        const data = new DataTransfer();
        data.setData('text/plain', pasted);
        document.getElementById(id).dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, { id: name, pasted: text });
    };
    await pasteOver('limit-uncontrolled', '**ab**');
    assert.equal(await shown('limit-uncontrolled'), 'ab');
    assert.equal(await text('[data-testid="limit-uncontrolled"] .ProseMirror strong'), 'ab');
    assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde', 'abcd', 'ab']);
    await pasteOver('limit-uncontrolled', 'abcdefgh');
    assert.equal(await shown('limit-uncontrolled'), 'ab', 'a paste that stays over the limit is refused whole');
    assert.deepEqual(await calls('limit-uncontrolled'), ['abcd', 'abcde', 'abcd', 'ab']);

    // Controlled: an over-limit edit leaves the editor and the parent on the last accepted value.
    await typeAtEnd('limit-controlled', 'de');
    assert.equal(await shown('limit-controlled'), 'abcde');
    assert.equal(await text('[data-testid="limit-controlled-value"]'), 'abcde');
    assert.deepEqual(await calls('limit-controlled'), ['abcd', 'abcde']);
    assert.equal(await hint('limit-controlled'), left(0));
    for (const character of 'fg') {
      await page.keyboard.type(character);
      assert.equal(await shown('limit-controlled'), 'abcde', `${character} is refused`);
      assert.equal(await text('[data-testid="limit-controlled-value"]'), 'abcde');
      assert.deepEqual(await calls('limit-controlled'), ['abcd', 'abcde'], `refusing ${character} is not reported`);
      assert.equal(await hint('limit-controlled'), left(0));
    }

    // A value changed from outside shows up with a matching hint and is not echoed to onChange.
    await page.locator('#limit-set-external').click();
    assert.equal(await shown('limit-controlled'), 'xy');
    assert.equal(await text('[data-testid="limit-controlled-value"]'), 'xy');
    assert.deepEqual(await calls('limit-controlled'), ['abcd', 'abcde']);
    assert.equal(await hint('limit-controlled'), left(3));
    await typeAtEnd('limit-controlled', 'z');
    assert.equal(await shown('limit-controlled'), 'xyz');
    assert.deepEqual(await calls('limit-controlled'), ['abcd', 'abcde', 'xyz']);
    assert.equal(await hint('limit-controlled'), left(2));
  } finally {
    await browser?.close();
    await close();
  }
});
