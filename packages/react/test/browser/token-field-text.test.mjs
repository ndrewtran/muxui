import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser, pageShell, startServer } from './harness.mjs';

function TokenFieldTextFixture() {
  const h = React.createElement;
  const [changes, setChanges] = React.useState([]);
  const [tokens, setTokens] = React.useState(['alpha']);
  const [accept, setAccept] = React.useState(true);
  const [ticks, setTicks] = React.useState(0);
  return h('main', null,
    h('form', { id: 'form' },
      h(TokenField, { label: 'Tags', name: 'tags', defaultValue: ['alpha'], placeholder: 'Add tag', onChange: (next) => setChanges((current) => [...current, JSON.stringify(next)]) })),
    h('output', { id: 'changes' }, changes.join(',')),
    h('section', { id: 'controlled', 'data-ticks': ticks },
      // A fresh but equal array on every render must not disturb the field.
      h(TokenField, { label: 'Controlled', value: [...tokens], onChange: (next) => { if (accept) setTokens(next); } }),
      h('button', { type: 'button', id: 'add-gamma', onClick: () => setTokens((current) => [...current, 'gamma']) }, 'Add gamma'),
      h('button', { type: 'button', id: 'reject', onClick: () => setAccept(false) }, 'Reject edits'),
      h('button', { type: 'button', id: 'tick', onClick: () => setTicks((value) => value + 1) }, 'Tick'),
      h('output', { id: 'tokens' }, tokens.join('|'))));
}

test('real browser TokenField keeps typed text, reconciles controlled tokens, and survives IME re-renders', { timeout: 90_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { TokenField } from '/src/collections.mjs';
    import '/generated/styles.css';
    ${TokenFieldTextFixture.toString()}
    createRoot(document.getElementById('root')).render(React.createElement(TokenFieldTextFixture));`;
  const { url, close } = await startServer({
    entries: ['src/collections.mjs'],
    pages: { '/token-field-text.html': pageShell({ body: '<div id="root"></div>', entry: '/token-field-text-entry.mjs' }) },
    modules: { '/token-field-text-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/token-field-text.html`, { waitUntil: 'networkidle' });
    const field = page.locator('#form [role="textbox"]');
    const controlled = page.locator('#controlled [role="textbox"]');
    const text = (locator) => locator.evaluate((node) => node.textContent.replaceAll('​', ''));
    const formTokens = () => page.evaluate(() => new FormData(document.querySelector('#form')).getAll('tags'));

    await field.click();
    await page.keyboard.press('End');
    await page.keyboard.type('beta');
    assert.equal(await text(field), 'alphabeta');
    assert.equal(await page.locator('#changes').textContent(), '', 'typing text does not change the tokens');
    assert.deepEqual(await formTokens(), ['alpha']);
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Backspace');
    assert.equal(await text(field), '');
    assert.equal(await page.locator('#changes').textContent(), '[]', 'only the token removal reports a change');
    assert.deepEqual(await formTokens(), []);
    assert.equal(await field.getAttribute('aria-placeholder'), 'Add tag');
    assert.equal(await page.locator('#form .muxui-token-placeholder').isVisible(), true);

    // Enter commits the trimmed draft as a token; an empty draft does nothing.
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#changes').textContent(), '[]');
    await page.keyboard.type('  beta ');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#changes').textContent(), '[],["beta"]');
    assert.deepEqual(await page.locator('#form .muxui-token').allTextContents(), ['beta']);
    assert.equal(await text(field), 'beta', 'the draft is cleared');
    assert.deepEqual(await formTokens(), ['beta']);
    await page.keyboard.type('gamma');
    await page.keyboard.press('Enter');
    assert.deepEqual(await formTokens(), ['beta', 'gamma'], 'the caret stays at the end after a commit');

    await controlled.click();
    await page.keyboard.press('End');
    await page.keyboard.type('draft');
    await page.locator('#add-gamma').click();
    assert.equal(await text(controlled), 'alphagammadraft', 'an outside token change keeps the draft text');
    await page.locator('#reject').click();
    await controlled.click();
    await page.keyboard.press('End');
    for (let index = 0; index < 6; index += 1) await page.keyboard.press('Backspace');
    assert.equal(await page.locator('#tokens').textContent(), 'alpha|gamma');
    assert.equal(await text(controlled), 'alphagamma', 'a rejected token removal restores the controlled tokens');

    // Parent re-renders with an equal array must not end an IME composition.
    await page.keyboard.press('End');
    const client = await page.context().newCDPSession(page);
    await client.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    await page.locator('#tick').evaluate((button) => button.click());
    await client.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
    await page.locator('#tick').evaluate((button) => button.click());
    await client.send('Input.insertText', { text: '日本' });
    assert.equal(await page.locator('#controlled').getAttribute('data-ticks'), '2');
    assert.equal(await text(controlled), 'alphagamma日本');

    // An IME consumes Enter to confirm its text: the page sees a composing Enter
    // keydown and no insertParagraph. CDP cannot route Enter through an IME, so the
    // composing keydown is dispatched directly while a CDP composition is open.
    await field.click();
    await page.keyboard.press('End');
    await client.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
    await field.evaluate((node) => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true }));
      node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    });
    assert.deepEqual(await formTokens(), ['beta', 'gamma'], 'Enter mid-composition does not commit');
    await client.send('Input.insertText', { text: '日本' });
    assert.deepEqual(await formTokens(), ['beta', 'gamma'], 'confirming the composition does not commit');
    assert.equal(await text(field), 'betagamma日本');
    await page.keyboard.press('Enter');
    assert.deepEqual(await formTokens(), ['beta', 'gamma', '日本']);
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
