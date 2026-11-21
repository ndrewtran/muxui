import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { awaitFontsAndFrames, browserEngines, launchBrowser, pageShell, startServer } from './harness.mjs';

// Cross-engine proof for TextEditor focus, rows, and forced colours: focus without scrolling, from the handle and on mount;
// rows that grow with the text and then scroll inside, counted in the content's own line height, in both schemes and at a
// larger font size; and the content's edge and focus ring in system colours. Runs in every engine named by
// MUXUI_BROWSER_ENGINES (see harness.mjs). WebKit has no forced-colours mode, so that part is skipped there.
//
// The fixture renders a labelled editor under a spacer of `spacer` pixels and over a tall tail, so the page scrolls. The
// query string's `config` holds the spacer and the editor's props; `scheme` sets the page's scheme.

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextEditor } from '/src/text-editor/index.ts';

const h = React.createElement;
const { spacer = 0, controlled = false, ...props } = JSON.parse(new URLSearchParams(location.search).get('config') ?? '{}');
window.__ready = 0;
window.__changes = 0;
window.__handle = React.createRef();
// With controlled, an owner keeps each value the editor reports, and window.__replaceValue sets one of its own.
function Owner({ defaultValue, ...rest }) {
  const [value, setValue] = React.useState(defaultValue);
  window.__replaceValue = setValue;
  return h(TextEditor, { ...rest, value, onChange: (next) => { window.__changes += 1; setValue(next); } });
}
createRoot(document.getElementById('root')).render(h('main', null,
  spacer ? h('div', { style: { height: spacer }, 'aria-hidden': 'true' }) : null,
  h(controlled ? Owner : TextEditor, { ref: window.__handle, label: 'Reply', toolbar: false, onReady: () => { window.__ready += 1; }, onChange: () => { window.__changes += 1; }, ...props }),
  h('div', { style: { height: 3000 }, 'aria-hidden': 'true' })));
`;

// `fontSize` gives the content a font size of its own through an ordinary consumer rule.
const page = (url) => {
  const fontSize = Number(url.searchParams.get('fontSize'));
  const consumer = fontSize ? `.muxui-text-editor__content .ProseMirror { font-size: ${fontSize}px; }` : '';
  return pageShell({
    attributes: `lang="en" data-muxui-color-scheme="${url.searchParams.get('scheme') === 'dark' ? 'dark' : 'light'}"`,
    head: `<link rel="stylesheet" href="/generated/styles.css"><link rel="stylesheet" href="/generated/themes.css"><style>body { margin: 24px; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-default); } ${consumer}</style>`,
    body: '<div id="root"></div>',
    entry: '/text-editor-focus-rows-entry.mjs',
  });
};

let server;
before(async () => {
  server = await startServer({
    entries: ['src/text-editor/index.ts'],
    pages: { '/text-editor-focus-rows.html': page },
    modules: { '/text-editor-focus-rows-entry.mjs': entry },
  });
});
after(async () => {
  await server?.close();
});

async function open(tab, { scheme = 'light', fontSize, ...config } = {}) {
  const params = new URLSearchParams({ scheme, config: JSON.stringify(config) });
  if (fontSize) params.set('fontSize', String(fontSize));
  await tab.goto(`${server.url}/text-editor-focus-rows.html?${params}`, { waitUntil: 'load' });
  await tab.waitForFunction(() => window.__ready === 1);
  await awaitFontsAndFrames(tab);
}

const frames = (tab) => tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const focused = (tab) => tab.evaluate(() => document.activeElement === document.querySelector('.ProseMirror'));
const scrollY = (tab) => tab.evaluate(() => window.scrollY);

// The content's box: its height, one line in its own line height, its block padding, and how it scrolls.
const box = (tab) => tab.locator('.ProseMirror').evaluate((node) => {
  const style = getComputedStyle(node);
  return {
    height: node.getBoundingClientRect().height,
    line: Number.parseFloat(style.lineHeight),
    padding: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
    root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    overflowY: style.overflowY,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    scrollTop: node.scrollTop,
  };
});
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1, `${message}: ${actual} is not ${expected}`);

// Whether the last character, where the caret is after typing, shows inside the content's box.
const endInView = (tab) => tab.locator('.ProseMirror').evaluate((node) => {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) last = walker.currentNode;
  const range = document.createRange();
  range.setStart(last, last.length - 1);
  range.setEnd(last, last.length);
  const character = range.getBoundingClientRect();
  const view = node.getBoundingClientRect();
  return character.height > 0 && character.top >= view.top - 1 && character.bottom <= view.bottom + 1;
});

// A document of one paragraph, a link for it, the first paragraph's DOM nodes, and a focused caret at a document position.
const paragraphOf = (content) => ({ type: 'doc', content: [{ type: 'paragraph', content }] });
const linkA = { type: 'link', attrs: { href: 'https://a.example/' } };
const children = (tab) => tab.locator('.ProseMirror p').first().evaluate((node) => [...node.childNodes].map((child) => [child.nodeName, child.textContent]));
const caretAt = (tab, position) => tab.evaluate((at) => {
  window.__handle.current.focus({ preventScroll: true });
  document.querySelector('.ProseMirror').editor.commands.setTextSelection(at);
}, position);

// Lines of one paragraph, apart by hard breaks, so each is one line of the content's own height.
async function typeLines(tab, count) {
  for (let index = 0; index < count; index += 1) {
    if (index > 0) await tab.keyboard.press('Shift+Enter');
    await tab.keyboard.type(`Line ${index + 1}`);
  }
  await frames(tab);
}

// The content's outline, and the system colours as the content's scope resolves them.
const paint = (tab) => tab.locator('.ProseMirror').evaluate((node) => {
  const probe = node.parentElement.appendChild(document.createElement('span'));
  const system = (name) => {
    probe.style.color = name;
    return getComputedStyle(probe).color;
  };
  const colors = { ButtonText: system('ButtonText'), Highlight: system('Highlight') };
  probe.remove();
  const style = getComputedStyle(node);
  return { colors, outline: [style.outlineStyle, style.outlineWidth, style.outlineColor, style.outlineOffset] };
});

for (const engine of browserEngines()) {
  test(`TextEditor focuses without scrolling from its handle and on mount in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));

      // The editor starts below the fold: focus without scrolling puts focus and the caret in it at once, the page still.
      await open(tab, { spacer: 1500 });
      assert.equal(await scrollY(tab), 0);
      assert.equal(await tab.evaluate(() => {
        window.__handle.current.focus({ preventScroll: true });
        return document.activeElement === document.querySelector('.ProseMirror');
      }), true, 'focus lands before the call returns');
      await frames(tab);
      assert.equal(await scrollY(tab), 0, 'the page did not scroll');
      assert.equal(await tab.evaluate(() => document.querySelector('.ProseMirror').contains(document.getSelection().anchorNode)), true, 'the caret is in the content');
      await tab.keyboard.type('Hi');
      assert.equal(await tab.locator('.ProseMirror').textContent(), 'Hi', 'keys reach the content');

      // The default focus, a frame later, scrolls the caret into view as before.
      await tab.evaluate(() => {
        document.querySelector('.ProseMirror').blur();
        window.scrollTo(0, 0);
      });
      await tab.evaluate(() => window.__handle.current.focus());
      await frames(tab);
      assert.equal(await focused(tab), true);
      assert.ok(await scrollY(tab) > 0, 'the default focus scrolls the caret into view');

      // autoFocus focuses the content once it is in the page, also without scrolling.
      await open(tab, { spacer: 1500, autoFocus: true });
      assert.equal(await focused(tab), true, 'autoFocus focused the content');
      assert.equal(await scrollY(tab), 0, 'without scrolling to it');
      assert.equal(await tab.evaluate(() => window.__ready), 1, 'ready ran once');

      // A read-only editor is ready but takes no focus.
      await open(tab, { autoFocus: true, readOnly: true });
      assert.equal(await focused(tab), false);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor scrolls the caret into view after its text command fills a capped editor in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 900 } });
      await open(tab, { minRows: 3, maxRows: 3 });
      await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
      const lines = Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join('\n');
      assert.equal(await tab.evaluate((value) => window.__handle.current.execute({ type: 'text', text: value }), lines), true);
      await frames(tab);
      const measured = await box(tab);
      assert.ok(measured.scrollTop > 0, 'the content scrolls inside');
      assert.ok(await endInView(tab), 'to the caret after the last line');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor keeps typed text out of a link that starts a paragraph, typed at its start, in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      const link = { type: 'link', attrs: { href: 'https://a.example/' } };
      await open(tab, { defaultValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'lead', marks: [link] }, { type: 'text', text: ' rest' }] }] } });
      // Focus puts the caret at the start of the content, where the browser types into the link's own text node.
      await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
      await frames(tab);
      await tab.keyboard.type('x');
      await frames(tab);
      assert.deepEqual(await children(tab), [['#text', 'x'], ['A', 'lead'], ['#text', ' rest']]);
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor types into a link again after a new label for it is undone by keyboard in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { defaultValue: paragraphOf([{ type: 'text', text: 'see ' }, { type: 'text', text: 'docs', marks: [linkA] }, { type: 'text', text: ' end' }]) });
      // At the end of the link, a new label in place of the whole link, at the same address.
      await caretAt(tab, 9);
      assert.equal(await tab.evaluate(() => window.__handle.current.execute({ type: 'link', href: 'https://a.example/', text: 'guide' })), true);
      await frames(tab);
      await tab.keyboard.press('ControlOrMeta+z');
      await tab.keyboard.type('!');
      await frames(tab);
      assert.deepEqual(await children(tab), [['#text', 'see '], ['A', 'docs!'], ['#text', ' end']], 'typed text extends the restored link, as before the label');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor keeps text typed after a label unlinked when a new controlled value is undone by keyboard in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { controlled: true, defaultValue: paragraphOf([{ type: 'text', text: 'abcd' }]) });
      await caretAt(tab, 3);
      assert.equal(await tab.evaluate(() => window.__handle.current.execute({ type: 'link', href: 'https://a.example/', text: 'new' })), true);
      await frames(tab);
      await tab.evaluate((value) => window.__replaceValue(value), paragraphOf([{ type: 'text', text: 'other' }]));
      await frames(tab);
      assert.equal(await tab.locator('.ProseMirror').textContent(), 'other', 'the owner replaced the document');
      await tab.keyboard.press('ControlOrMeta+z');
      await tab.keyboard.type('!');
      await frames(tab);
      assert.deepEqual(await children(tab), [['#text', 'ab'], ['A', 'new'], ['#text', '!cd']], 'typed text after the label is not linked');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor leaves an unfocused heading alone when the heading command already matches it in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { defaultValue: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }] } });
      const state = () => tab.evaluate(() => {
        const content = document.querySelector('.ProseMirror');
        return { focused: document.activeElement === content, blocks: [...content.children].map((node) => node.nodeName), changes: window.__changes, undo: content.editor.can().undo() };
      });
      const before = await state();
      assert.deepEqual(before, { focused: false, blocks: ['H2'], changes: 0, undo: false });
      assert.equal(await tab.evaluate(() => window.__handle.current.execute({ type: 'heading', level: 2 })), true);
      // Past the frame in which a command focuses the editor.
      await frames(tab);
      await frames(tab);
      assert.deepEqual(await state(), before, 'no focus, no appended paragraph, no change, no undo step');
      // Focused, the command changes nothing either.
      await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
      await frames(tab);
      const focused = await state();
      assert.equal(focused.focused, true);
      assert.equal(await tab.evaluate(() => window.__handle.current.execute({ type: 'heading', level: 2 })), true);
      await frames(tab);
      await frames(tab);
      assert.deepEqual(await state(), focused, 'focused, nothing changes and no undo step is added');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor keeps a composition one undo step around a command that changes nothing in ${engine}`, { timeout: 120_000, skip: engine !== 'chromium' && 'the DevTools protocol drives an input method in Chromium only' }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 600 } });
      await open(tab, { defaultValue: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ab' }] }] } });
      await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
      await frames(tab);
      const ime = await tab.context().newCDPSession(tab);
      const text = () => tab.locator('.ProseMirror').textContent();
      // A provisional n, a command that changes nothing, then the committed text, as a Japanese input method types 日本.
      await ime.send('Input.imeSetComposition', { text: 'n', selectionStart: 1, selectionEnd: 1 });
      await frames(tab);
      await tab.evaluate(() => window.__handle.current.execute({ type: 'unlink' }));
      await ime.send('Input.imeSetComposition', { text: '日本', selectionStart: 2, selectionEnd: 2 });
      await ime.send('Input.insertText', { text: '日本' });
      await frames(tab);
      assert.equal(await text(), '日本ab');
      await tab.keyboard.press('ControlOrMeta+z');
      await frames(tab);
      assert.equal(await text(), 'ab', 'one undo takes the whole composition out');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor rows grow with the text, then scroll inside, in the content's own line height in ${engine}`, { timeout: 120_000 }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage({ viewport: { width: 800, height: 900 } });
      for (const scheme of ['light', 'dark']) {
        await open(tab, { scheme, minRows: 3, maxRows: 5 });
        let measured = await box(tab);
        near(measured.height, 3 * measured.line + measured.padding, `${scheme}: empty, it is three rows tall`);
        await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
        await typeLines(tab, 4);
        measured = await box(tab);
        near(measured.height, 4 * measured.line + measured.padding, `${scheme}: four lines make it four rows tall`);
        assert.ok(measured.scrollHeight <= measured.clientHeight, `${scheme}: and nothing scrolls yet`);
        await tab.keyboard.press('Shift+Enter');
        await typeLines(tab, 3);
        measured = await box(tab);
        near(measured.height, 5 * measured.line + measured.padding, `${scheme}: seven lines stop it at five rows`);
        assert.equal(measured.overflowY, 'auto');
        assert.ok(measured.scrollHeight > measured.clientHeight, `${scheme}: the rest scrolls inside`);
        assert.ok(measured.scrollTop > 0 && await endInView(tab), `${scheme}: scrolled inside to keep the caret at the end in view`);
      }

      // Without rows the content keeps its default least height; a cap alone below it lowers it.
      await open(tab);
      let measured = await box(tab);
      near(measured.height, 7.5 * measured.root, 'the default least height is unchanged');
      assert.equal(measured.overflowY, 'visible');
      await open(tab, { maxRows: 2 });
      measured = await box(tab);
      near(measured.height, 2 * measured.line + measured.padding, 'a cap of two rows is also the least height');

      // A larger font gives taller lines, and the rows follow it.
      await open(tab, { minRows: 3 });
      const small = await box(tab);
      await open(tab, { minRows: 3, fontSize: 28 });
      measured = await box(tab);
      assert.ok(measured.line > small.line, `the larger font has a taller line: ${measured.line} over ${small.line}`);
      near(measured.height, 3 * measured.line + measured.padding, 'and three rows are three of those lines');
    } finally {
      await browser.close();
    }
  });

  test(`TextEditor draws its edge and focus ring in system colours under forced colours in ${engine}`, { timeout: 120_000, skip: engine === 'webkit' && 'WebKit has no forced-colors mode' }, async () => {
    const browser = await launchBrowser(engine);
    try {
      const tab = await browser.newPage();
      for (const scheme of ['light', 'dark']) {
        // Without forced colours the box shadows draw the edge and focus, as before, and no outline shows.
        await tab.emulateMedia({ forcedColors: 'none' });
        await open(tab, { scheme });
        assert.equal((await paint(tab)).outline[0], 'none', `${scheme}: no outline at rest`);
        await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
        assert.equal((await paint(tab)).outline[0], 'none', `${scheme}: nor on focus`);

        await tab.emulateMedia({ forcedColors: 'active' });
        await open(tab, { scheme });
        let state = await paint(tab);
        assert.deepEqual(state.outline.slice(0, 3), ['solid', '1px', state.colors.ButtonText], `${scheme}: a ButtonText edge at rest`);
        await tab.evaluate(() => window.__handle.current.focus({ preventScroll: true }));
        state = await paint(tab);
        assert.deepEqual(state.outline, ['solid', '2px', state.colors.Highlight, '2px'], `${scheme}: a Highlight ring on focus`);
      }
    } finally {
      await browser.close();
    }
  });
}
