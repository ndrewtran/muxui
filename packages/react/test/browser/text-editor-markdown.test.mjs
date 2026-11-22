import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof for the Markdown value mode and the Markdown preset of TextEditor under real input: fast typing into a
// controlled Markdown value keeps the caret where it types and sends nothing back to the editor; the underline and alignment
// keys change neither the document nor its DOM; a paste of Markdown text is read as Markdown; in Chromium, whose DevTools
// protocol drives an input method, a composition lands whole; in both presets pasted and dropped HTML reaches the DOM
// with only addresses the rule keeps; and in Chromium, on a page that enforces Trusted Types, a paste of HTML still lands,
// with no address from an attribute the editor does not read. Runs in every engine named by MUXUI_BROWSER_ENGINES.
//
// The fixture renders an editor whose owner keeps the Markdown it reports. The query string's `config` holds the first
// Markdown and the editor's other props, and `rich` renders the rich preset with a document value instead.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextEditor } from '/src/text-editor/index.ts';
import { fromMarkdown, toMarkdown } from '/src/text-editor/text-editor-markdown.ts';

const h = React.createElement;
const { initial = '', rich = false, ...props } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
window.__ready = 0;
window.__reported = [];
window.__resets = 0;
window.__handle = React.createRef();
// The owner keeps each Markdown value the editor reports, and window.__replaceValue sets one of its own. With \`rich\` it
// renders the rich preset with a document value of the editor's own instead.
function Owner() {
  const [value, setValue] = React.useState(initial);
  window.__replaceValue = setValue;
  return h(TextEditor, {
    ref: window.__handle, label: 'Post', toolbar: false, ...props,
    onReady: () => {
      // Each transaction that applies a value from outside, as the editor marks it.
      document.querySelector('.ProseMirror').editor.on('transaction', ({ transaction }) => { if (transaction.getMeta('muxuiExternalValue')) window.__resets += 1; });
      window.__ready += 1;
    },
    ...(rich
      ? { onChange: (next) => window.__reported.push(next) }
      : { markdown: { fromMarkdown, toMarkdown, value, onChange: (next) => { window.__reported.push(next); setValue(next); } } }),
  });
}
createRoot(document.getElementById('root')).render(h(Owner));
`;

const page = (head = '') => pageShell({
  attributes: 'lang="en" data-muxui-color-scheme="light"',
  head: `${head}<link rel="stylesheet" href="/generated/styles.css"><style>body { margin: 24px; }</style>`,
  body: '<div id="root"></div>',
  entry: '/text-editor-markdown-entry.mjs',
});
// Served with a policy that refuses HTML written as a string. The engine writes its own style element as HTML unless the
// page already has one, so this page has it.
const TRUSTED_TYPES_PAGE = '/text-editor-markdown-trusted-types.html';

let server;
before(async () => {
  server = await startServer({
    entries: ['src/text-editor/index.ts', 'src/text-editor/text-editor-markdown.ts'],
    pages: { '/text-editor-markdown.html': page(), [TRUSTED_TYPES_PAGE]: page('<style data-tiptap-style></style>') },
    modules: { '/text-editor-markdown-entry.mjs': entry },
    middleware: (request, response, next) => {
      if (new URL(request.url ?? '/', 'http://127.0.0.1').pathname === TRUSTED_TYPES_PAGE) response.setHeader('content-security-policy', "require-trusted-types-for 'script'");
      next();
    },
  });
});
after(async () => {
  await server?.close();
});

async function open(tab, config = {}, path = '/text-editor-markdown.html') {
  await tab.goto(`${server.url}${path}?${new URLSearchParams({ config: JSON.stringify(config) })}`, { waitUntil: 'load' });
  await tab.waitForFunction(() => window.__ready === 1);
  await awaitFontsAndFrames(tab);
}

const frames = (tab) => tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
// A focused caret at the end of the document, and what the editor holds.
const caretAtEnd = (tab) => tab.evaluate(() => {
  const { editor } = document.querySelector('.ProseMirror');
  window.__handle.current.focus({ preventScroll: true });
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
});
const state = (tab) => tab.evaluate(() => {
  const { editor } = document.querySelector('.ProseMirror');
  return { caret: editor.state.selection.from, end: editor.state.doc.content.size - 1, json: editor.getJSON(), reported: window.__reported, resets: window.__resets };
});

for (const engine of browserEngines()) {
  test(`TextEditor with a controlled Markdown value keeps the caret and sends nothing back under fast typing in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await open(tab, { initial: 'Start' });
      await caretAtEnd(tab);
      await tab.keyboard.type(' typing **fast** and *more* text', { delay: 0 });
      await frames(tab);
      let now = await state(tab);
      assert.equal(now.reported.at(-1), 'Start typing **fast** and *more* text');
      assert.equal(now.caret, now.end, 'the caret is where the typing ended');
      assert.equal(now.resets, 0, 'the owner echoed each value and the editor kept its own document');
      // Two empty paragraphs are no Markdown, so typing after them reports one paragraph break, and the caret stays put.
      await tab.keyboard.press('Enter');
      await tab.keyboard.press('Enter');
      await tab.keyboard.type('x', { delay: 0 });
      await frames(tab);
      now = await state(tab);
      assert.equal(now.reported.at(-1), 'Start typing **fast** and *more* text\n\nx');
      assert.equal(now.json.content.length, 3);
      assert.equal(now.caret, now.end);
      assert.equal(now.resets, 0);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor with the Markdown preset leaves the document and its DOM alone on the underline and alignment keys in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { initial: 'Some **text** here' });
      await caretAtEnd(tab);
      await tab.keyboard.press('ControlOrMeta+a');
      const html = () => tab.locator('.ProseMirror').innerHTML();
      const before = await html();
      for (const key of ['u', 'Shift+l', 'Shift+e', 'Shift+r', 'Shift+j']) {
        await tab.keyboard.press(`ControlOrMeta+${key}`);
        await frames(tab);
        assert.equal(await html(), before, key);
      }
      const now = await state(tab);
      assert.deepEqual(now.reported, []);
      assert.equal(now.json.content[0].attrs?.textAlign, undefined);
      // Bold, a Markdown key, still applies.
      await tab.keyboard.press('ControlOrMeta+b');
      await frames(tab);
      assert.equal((await state(tab)).reported.at(-1), '**Some text here**');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor in the Markdown value mode reads a paste of Markdown text as Markdown in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab);
      await caretAtEnd(tab);
      const markdown = '## Pasted\n\n1. **one**\n2. [two](https://example.com/)\n\n> quoted';
      // Firefox gives a constructed ClipboardEvent no clipboardData, so the event carries its data as a property in every engine.
      await tab.evaluate((text) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', { value: data });
        document.querySelector('.ProseMirror').dispatchEvent(event);
      }, markdown);
      await frames(tab);
      assert.equal((await state(tab)).reported.at(-1), markdown);
      assert.equal(await tab.locator('.ProseMirror h2').textContent(), 'Pasted');
      assert.equal(await tab.locator('.ProseMirror ol strong').textContent(), 'one');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor in the Markdown value mode keeps a composition whole and one undo step in ${engine}`, { timeout: 120_000, skip: engine !== 'chromium' && 'the DevTools protocol drives an input method in Chromium only' }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { initial: '**ab**' });
      await caretAtEnd(tab);
      await frames(tab);
      const ime = await tab.context().newCDPSession(tab);
      // A provisional n, then the committed text, as a Japanese input method types 日本.
      await ime.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 });
      await frames(tab);
      await ime.send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
      await ime.send('Input.insertText', { text: '日本' });
      await frames(tab);
      let now = await state(tab);
      assert.equal(now.reported.at(-1), '**ab日本**');
      assert.equal(now.caret, now.end);
      assert.equal(now.resets, 0);
      await tab.keyboard.press('ControlOrMeta+z');
      await frames(tab);
      now = await state(tab);
      assert.equal(now.reported.at(-1), '**ab**', 'one undo takes the whole composition out');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor holds pasted and dropped HTML to the address rule, in both presets, in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      // A link with a user name and password, a script image, an address to normalize, and an image with no scheme.
      const html = '<p>a <a href="https://user:pass@example.com/">b</a> <img src="javascript:alert(1)" alt="c"> <a href="HTTPS://Example.com">d</a> <img src="//example.com/e.png" alt="e"></p>';
      for (const rich of [true, false]) {
        await open(tab, { rich });
        for (const type of ['paste', 'drop']) {
          await tab.evaluate(({ type, html }) => {
            const surface = document.querySelector('.ProseMirror');
            surface.editor.commands.setContent('<p></p>');
            surface.editor.commands.focus('start');
            const data = new DataTransfer();
            data.setData('text/html', html);
            data.setData('text/plain', 'a b c d e');
            // Firefox gives a constructed event no data or coordinates, so the event carries them as properties; a drop
            // lands where its coordinates point, inside the empty paragraph.
            const event = new Event(type, { bubbles: true, cancelable: true });
            const box = surface.querySelector('p').getBoundingClientRect();
            Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: data });
            Object.defineProperty(event, 'clientX', { value: box.left + 2 });
            Object.defineProperty(event, 'clientY', { value: box.top + box.height / 2 });
            surface.dispatchEvent(event);
          }, { type, html });
          await frames(tab);
          // An image is a block, so a refused one leaves its description as a paragraph where it would be.
          const shown = await tab.evaluate(() => ({
            blocks: [...document.querySelectorAll('.ProseMirror > *')].map((block) => block.textContent.trim()),
            addresses: [...document.querySelectorAll('.ProseMirror [href], .ProseMirror [src]')].map((element) => element.getAttribute('src') ?? element.getAttribute('href')),
          }));
          assert.deepEqual(shown, { blocks: ['a b', 'c', 'd', 'e'], addresses: ['https://example.com/'] }, `${type}, ${rich ? 'rich' : 'Markdown value'}`);
        }
      }
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor takes a paste of HTML on a page that enforces Trusted Types, in both presets, in ${engine}`, { timeout: 120_000, skip: engine !== 'chromium' && 'the test page enforces Trusted Types in Chromium' }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = [];
      const requested = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      tab.on('request', (request) => requested.push(request.url()));
      const paste = (html) => tab.evaluate((html) => {
        const surface = document.querySelector('.ProseMirror');
        // A document, not HTML, which the page would refuse.
        surface.editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
        surface.editor.commands.focus('start');
        const data = new DataTransfer();
        data.setData('text/html', html);
        data.setData('text/plain', 'plain');
        surface.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, html);
      for (const rich of [true, false]) {
        const name = rich ? 'rich' : 'Markdown value';
        await open(tab, { rich }, TRUSTED_TYPES_PAGE);
        assert.equal(await tab.evaluate(() => {
          try {
            document.createElement('div').innerHTML = '<b>x</b>';
            return 'written';
          } catch {
            return 'refused';
          }
        }), 'refused', 'the page enforces Trusted Types');
        await paste('<p><strong>bold</strong> and <a href="https://example.com/a">safe</a></p>');
        await frames(tab);
        const pasted = await tab.evaluate(() => {
          const surface = document.querySelector('.ProseMirror');
          return { bold: surface.querySelector('strong')?.textContent, link: [surface.querySelector('a')?.getAttribute('href'), surface.querySelector('a')?.textContent], reported: window.__reported.at(-1) };
        });
        assert.deepEqual({ bold: pasted.bold, link: pasted.link }, { bold: 'bold', link: ['https://example.com/a', 'safe'] }, name);
        if (rich) assert.deepEqual(pasted.reported.content[0].content.map(({ text, marks }) => [text, (marks ?? []).map(({ type, attrs }) => attrs?.href ?? type)]), [['bold', ['bold']], [' and ', []], ['safe', ['https://example.com/a']]]);
        else assert.equal(pasted.reported, '**bold** and [safe](https://example.com/a)');
        // Addresses in attributes the editor reads no link or image from never arrive, and nothing fetches them.
        await paste('<p style="background-image: url(https://tracker.example/p.png)">s</p><img src="https://example.com/i.png" srcset="https://tracker.example/i.png 2x" alt="i"><table background="https://tracker.example/t.png"><tr><td>t</td></tr></table>');
        await frames(tab);
        const hidden = await tab.evaluate(() => ({ markup: document.querySelector('.ProseMirror').innerHTML, reported: JSON.stringify(window.__reported.at(-1)) }));
        assert.match(hidden.markup, /<img[^>]* src="https:\/\/example\.com\/i\.png"/, name);
        assert.doesNotMatch(hidden.markup, /tracker\.example|srcset|background/, name);
        assert.doesNotMatch(hidden.reported, /tracker\.example/, name);
      }
      assert.deepEqual(requested.filter((url) => url.includes('tracker.example')), []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
