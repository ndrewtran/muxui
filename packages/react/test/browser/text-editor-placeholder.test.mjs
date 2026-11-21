import assert from 'node:assert/strict';
import test from 'node:test';
import { awaitFontsAndFrames, launchBrowser, pageShell, startServer } from './harness.mjs';

// Chromium only: it reads the browser's own accessibility tree through the DevTools protocol.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextEditor } from '/src/text-editor/index.ts';

createRoot(document.getElementById('root')).render(React.createElement(TextEditor, { label: 'Note', placeholder: 'Write a note', toolbar: false }));
`;

const page = pageShell({
  attributes: 'lang="en" data-muxui-color-scheme="light"',
  head: '<link rel="stylesheet" href="/generated/styles.css">',
  body: '<div id="root"></div>',
  entry: '/text-editor-placeholder-entry.mjs',
});

test('TextEditor exposes its placeholder as the textbox placeholder, not as content, and draws it as before', { timeout: 60_000 }, async () => {
  const { url, close } = await startServer({
    entries: ['src/text-editor/index.ts'],
    pages: { '/text-editor-placeholder.html': page },
    modules: { '/text-editor-placeholder-entry.mjs': entry },
  });
  let browser;
  try {
    browser = await launchBrowser();
    const tab = await browser.newPage();
    const errors = [];
    tab.on('pageerror', (error) => errors.push(error.message));
    tab.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
    await tab.goto(`${url}/text-editor-placeholder.html`, { waitUntil: 'load' });
    await tab.locator('.ProseMirror p.is-editor-empty').waitFor();
    await awaitFontsAndFrames(tab);

    const cdp = await tab.context().newCDPSession(tab);
    await cdp.send('Accessibility.enable');
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const byId = new Map(nodes.map((node) => [node.nodeId, node]));
    const descendants = (node) => (node.childIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id), ...descendants(byId.get(id))] : []));
    const textbox = nodes.find((node) => node.role?.value === 'textbox');
    assert.equal(textbox?.name?.value, 'Note');
    assert.deepEqual(descendants(textbox).filter((node) => node.role?.value === 'StaticText').map((node) => node.name?.value), [], 'the drawn placeholder is no text inside the textbox');
    const placeholder = textbox.name.sources.find((source) => source.type === 'placeholder');
    assert.equal(placeholder?.attribute, 'aria-placeholder');
    assert.equal(placeholder?.value?.value, 'Write a note', 'the textbox carries the placeholder');

    // Still drawn, and drawn exactly as the same text without alternative text, which is how an engine without it draws.
    const before = () => tab.locator('.ProseMirror p').evaluate((node) => getComputedStyle(node, '::before').content);
    assert.match(await before(), /^"Write a note"/u);
    const shot = () => tab.locator('.muxui-text-editor').screenshot({ animations: 'disabled', caret: 'hide' });
    const drawn = await shot();
    await tab.addStyleTag({ content: '.muxui-text-editor__content .ProseMirror p.is-editor-empty:first-child::before { content: "Write a note" !important; }' });
    await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await before(), '"Write a note"');
    assert.ok(drawn.equals(await shot()), 'the empty alternative text changes nothing drawn');
    assert.deepEqual(errors, [], errors.join('\n'));
  } finally {
    await browser?.close();
    await close();
  }
});
