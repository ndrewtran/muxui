import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { undoDepth } from '@tiptap/pm/history';
import { JSDOM } from 'jsdom';
import { TextEditor, isTextEditorDocument, normalizeTextEditorDocument, normalizeTextEditorUrl } from '../src/text-editor/index.ts';
import { fromMarkdown, toMarkdown } from '../src/text-editor/text-editor-markdown.ts';
import { installDom } from './support/dom.mjs';

// The Markdown preset and the Markdown value mode of TextEditor, in jsdom, and the address rule on every path a link or an
// image enters by, in both presets. Keys and typing go through ProseMirror's own keydown and text input handling, so the
// editor's shortcuts and input rules run as they do in a browser.

const doc = (...content) => ({ type: 'doc', content });
const p = (...content) => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });
const t = (text, ...marks) => (marks.length ? { type: 'text', text, marks } : { type: 'text', text });
const h = (level, ...content) => ({ type: 'heading', attrs: { level }, content });
const ul = (...items) => ({ type: 'bulletList', content: items });
const ol = (start, ...items) => ({ type: 'orderedList', attrs: { start }, content: items });
const li = (...content) => ({ type: 'listItem', content });
const quote = (...content) => ({ type: 'blockquote', content });
const code = (text, language) => ({ type: 'codeBlock', ...(language ? { attrs: { language } } : {}), content: [{ type: 'text', text }] });
const image = (src, alt) => ({ type: 'image', attrs: { src, alt } });
const hr = { type: 'horizontalRule' };
const br = { type: 'hardBreak' };
const bold = { type: 'bold' };
const italic = { type: 'italic' };
const strike = { type: 'strike' };
const mono = { type: 'code' };
const underline = { type: 'underline' };
const red = { type: 'textStyle', attrs: { color: '#ef4444', fontFamily: 'serif' } };
const link = (href) => ({ type: 'link', attrs: { href } });

// ProseMirror reads Mod as Command only where the platform is a Mac.
const modKey = /Mac|iP(hone|[oa]d)/u.test(globalThis.navigator?.platform ?? '') ? { metaKey: true } : { ctrlKey: true };
const converters = { fromMarkdown, toMarkdown };

/** A TextEditor whose Markdown an owner keeps, as an application does; `owner.current` sets a value of the owner's own. */
function MarkdownOwner({ initial, owner, onChange, keep = (next) => next, ...props }) {
  const [value, setValue] = React.useState(initial);
  owner.current = setValue;
  return React.createElement(TextEditor, { ...props, markdown: { ...converters, value, onChange: (next) => { onChange?.(next); setValue((current) => keep(next, current)); } } });
}

/** The same owner for a document value. */
function DocumentOwner({ initial, owner, onChange, keep = (next) => next, ...props }) {
  const [value, setValue] = React.useState(initial);
  owner.current = setValue;
  return React.createElement(TextEditor, { ...props, value, onChange: (next) => { onChange?.(next); setValue((current) => keep(next, current)); } });
}

// Mounts a TextEditor, or `Component` around one, and returns its parts.
async function mount(props, Component = TextEditor) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  // jsdom has no layout, so give ProseMirror's coordinate lookups empty rectangles.
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const root = createRoot(document.querySelector('#root'));
  const render = (next) => act(async () => root.render(React.createElement(Component, { 'aria-label': 'Draft', toolbar: false, ...props, ...next })));
  await render();
  const pm = document.querySelector('.ProseMirror');
  const { editor } = pm;
  const { view } = editor;
  const destroyed = new Promise((resolve) => editor.on('destroy', resolve));
  // Each transaction that applied a value from outside, as the editor marks it.
  const resets = [];
  editor.on('transaction', ({ transaction }) => { if (transaction.getMeta('muxuiExternalValue')) resets.push(transaction); });
  const run = async (step) => {
    let result;
    await act(async () => { result = step(); });
    return result;
  };
  return {
    dom, pm, editor, render, resets,
    json: () => normalizeTextEditorDocument(editor.getJSON()),
    markdown: () => toMarkdown(normalizeTextEditorDocument(editor.getJSON())),
    caret: () => editor.state.selection.from,
    end: () => run(() => { pm.focus(); editor.commands.setTextSelection(editor.state.doc.content.size - 1); }),
    // Text typed as the browser's input delivers it, a character at a time, so the input rules see each one.
    type: (text) => run(() => {
      for (const character of text) {
        const { from, to } = view.state.selection;
        const deflt = () => view.state.tr.insertText(character, from, to);
        if (!view.someProp('handleTextInput', (handle) => handle(view, from, to, character, deflt))) view.dispatch(deflt());
      }
    }),
    // A key press; true when the editor took it.
    key: (key, init = {}) => run(() => {
      const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      pm.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    shortcut: (key, init = {}) => run(() => {
      const event = new dom.window.KeyboardEvent('keydown', { key, ...modKey, ...init, bubbles: true, cancelable: true });
      pm.dispatchEvent(event);
      return event.defaultPrevented;
    }),
    // A paste of clipboard data by type, with Shift held for `plain`, as ProseMirror reads a paste event.
    paste: (data, { plain = false } = {}) => run(() => {
      if (plain) pm.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Shift', keyCode: 16, shiftKey: true, bubbles: true }));
      const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: (type) => data[type] ?? '', types: Object.keys(data) } });
      pm.dispatchEvent(event);
      if (plain) pm.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: 'Shift', keyCode: 16, bubbles: true }));
    }),
    // A drop of data from outside the editor at the start of the document; jsdom has no layout to find a drop point in.
    drop: (data) => run(() => {
      view.posAtCoords = () => ({ pos: 1, inside: -1 });
      const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { getData: (type) => data[type] ?? '', types: Object.keys(data), files: [] } });
      pm.dispatchEvent(event);
    }),
    // An empty document with the caret in it.
    clear: () => run(() => {
      editor.commands.setContent('<p></p>');
      pm.focus();
      editor.commands.setTextSelection(1);
    }),
    undo: () => run(() => editor.commands.undo()),
    redo: () => run(() => editor.commands.redo()),
    undoSteps: () => undoDepth(editor.state),
    async close() {
      await act(async () => root.unmount());
      // Tiptap destroys the editor after the unmount; the window it reads must still exist.
      if (!editor.isDestroyed) await destroyed;
      restore();
      dom.window.close();
    },
  };
}

const labels = (selector) => [...document.querySelector(selector).querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label'));

test('the Markdown preset holds no underline, color, font or alignment: their commands return false, report off and show no tool', async () => {
  const handle = React.createRef();
  const reports = [];
  const e = await mount({ ref: handle, preset: 'markdown', toolbar: 'advanced', bubbleMenu: true, defaultValue: doc(p(t('plain'))), onFormattingChange: (formatting) => reports.push(formatting) });
  try {
    assert.deepEqual(Object.keys(e.editor.schema.marks).sort(), ['bold', 'code', 'italic', 'link', 'strike']);
    assert.equal(e.editor.extensionManager.extensions.some(({ name }) => name === 'textAlign'), false);
    assert.deepEqual(labels('[role="toolbar"][aria-label="Formatting"]'), ['Bold', 'Italic', 'Strikethrough', 'Insert link', 'Insert image', 'Bullet list', 'Generate with AI']);
    await e.render({ toolbar: 'simple' });
    assert.deepEqual(labels('[role="toolbar"][aria-label="Formatting"]'), ['Bold', 'Italic', 'Strikethrough', 'Bullet list']);
    await act(async () => { e.pm.focus(); e.editor.commands.setTextSelection({ from: 1, to: 6 }); });
    assert.deepEqual(labels('[role="toolbar"][aria-label="Selection formatting"]'), ['Bold', 'Italic', 'Strikethrough', 'Insert link']);
    for (const command of [{ type: 'underline' }, { type: 'color', value: '#ef4444' }, { type: 'fontFamily', value: 'serif' }, { type: 'fontSize', value: '20px' }, { type: 'align', value: 'center' }]) {
      let result;
      await act(async () => { result = handle.current.execute(command); });
      assert.equal(result, false, command.type);
    }
    assert.deepEqual(e.json(), doc(p(t('plain'))));
    assert.equal(e.undoSteps(), 0);
    assert.equal(reports.at(-1).marks.underline, false);
    // What Markdown holds still applies: strike shows pressed, as bold and italic do.
    let struck;
    await act(async () => { struck = handle.current.execute({ type: 'strike' }); });
    assert.equal(struck, true);
    assert.deepEqual(e.json(), doc(p(t('plain', strike))));
    assert.equal(reports.at(-1).marks.strike, true);
    assert.equal(document.querySelector('[aria-label="Strikethrough"]').getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('[aria-label="Bold"]').getAttribute('aria-pressed'), 'false');
  } finally {
    await e.close();
  }
});

test('the Markdown preset takes the underline and alignment shortcuts and does nothing with them, where the rich preset formats', async () => {
  const e = await mount({ preset: 'markdown', defaultValue: doc(p(t('plain'))) });
  try {
    await act(async () => { e.pm.focus(); e.editor.commands.setTextSelection({ from: 1, to: 6 }); });
    for (const [key, shift] of [['u', false], ['l', true], ['e', true], ['r', true], ['j', true]]) {
      assert.equal(await e.shortcut(key, { shiftKey: shift }), true, key);
    }
    assert.deepEqual(e.json(), doc(p(t('plain'))));
    assert.equal(e.undoSteps(), 0);
    // Bold, the strike and code shortcuts, and the block shortcuts are Markdown's and still apply.
    await e.shortcut('b');
    await e.shortcut('s', { shiftKey: true });
    assert.deepEqual(e.json(), doc(p(t('plain', bold, strike))));
  } finally {
    await e.close();
  }
  const rich = await mount({ defaultValue: doc(p(t('plain'))) });
  try {
    await act(async () => { rich.pm.focus(); rich.editor.commands.setTextSelection({ from: 1, to: 6 }); });
    await rich.shortcut('u');
    await rich.shortcut('e', { shiftKey: true });
    assert.deepEqual(rich.json(), doc({ type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('plain', underline)] }));
  } finally {
    await rich.close();
  }
});

const richDocument = doc(
  { type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('under', underline), t(' red', red, bold), t(' plain')] },
  { type: 'orderedList', attrs: { start: 3, type: 'i' }, content: [li(p(t('roman')))] },
);
const strippedDocument = doc(p(t('under'), t(' red', bold), t(' plain')), ol(3, li(p(t('roman')))));

test('the Markdown preset takes a document, a paste and a selection edit without what it leaves out', async () => {
  const changes = [];
  const e = await mount({ preset: 'markdown', defaultValue: richDocument, onChange: (next) => changes.push(next), onSelectionRequest: () => {} });
  try {
    // Text left with the marks of its neighbour joins it, so the editor holds what it reports.
    assert.deepEqual(e.json(), strippedDocument);
    await act(async () => { e.editor.commands.setContent('<p></p>'); });
    await e.end();
    await e.paste({ 'text/html': '<p style="text-align: right"><u>u</u> <span style="color: #ef4444; font-family: serif">c</span> <s>s</s> <strong>b</strong></p><ol type="a" start="2"><li><p>x</p></li></ol>' });
    assert.deepEqual(e.json().content.slice(0, 2), [p(t('u c '), t('s', strike), t(' '), t('b', bold)), ol(2, li(p(t('x'))))]);
    assert.deepEqual(changes.at(-1).content.slice(0, 2), e.json().content.slice(0, 2));
  } finally {
    await e.close();
  }
  // A controlled document with what the preset leaves out is held without it, and holding it resets nothing.
  const owner = { current: null };
  function Owner() {
    const [value, setValue] = React.useState(richDocument);
    owner.current = setValue;
    return React.createElement(TextEditor, { 'aria-label': 'Draft', toolbar: false, preset: 'markdown', value, onChange: setValue });
  }
  const controlled = await mount({}, Owner);
  try {
    await controlled.render();
    await controlled.render();
    assert.deepEqual(controlled.json(), strippedDocument);
    assert.equal(controlled.resets.length, 0);
    await act(async () => owner.current(doc(p(t('next', underline)))));
    assert.deepEqual(controlled.json(), doc(p(t('next'))));
  } finally {
    await controlled.close();
  }
});

// Every construct the converters cover, as the editor holds it, and its Markdown.
const everything = doc(
  h(1, t('One')), h(2, t('Two')), h(3, t('Three')), h(4, t('Four')), h(5, t('Five')), h(6, t('Six')),
  p(t('Some '), t('bold', bold), t(', '), t('italic', italic), t(', '), t('struck', strike), t(', '), t('code', mono), t(' and '), t('a link', link('https://example.com/')), t('.'), br, t('A second line.')),
  ul(li(p(t('one')), ol(3, li(p(t('three'))), li(p(t('four'))))), li(p(t('two')))),
  quote(p(t('quoted')), quote(p(t('deeper')))),
  code('const x = 1;\nconst y = `${x}`;', 'js'),
  image('https://example.com/a.png', 'A picture'),
  hr,
  p(t('The end.')),
);

test('Markdown of every construct pasted into the value mode reads back as the same Markdown', async () => {
  const markdown = toMarkdown(everything);
  assert.deepEqual(fromMarkdown(markdown), everything);
  const changes = [];
  const e = await mount({ markdown: { ...converters, onChange: (next) => changes.push(next) } });
  try {
    await e.end();
    await e.paste({ 'text/plain': markdown });
    assert.deepEqual(changes, [markdown]);
    // The editor adds an empty paragraph after a final block that is not one, which Markdown does not hold.
    assert.deepEqual(e.json(), everything);
  } finally {
    await e.close();
  }
});

test('Markdown typed into the value mode through the input rules and keys reads back as Markdown', async () => {
  const changes = [];
  const e = await mount({ markdown: { ...converters, onChange: (next) => changes.push(next) } });
  try {
    await e.end();
    await e.type('# Title');
    await e.key('Enter');
    await e.type('###### Six');
    await e.key('Enter');
    await e.type('Some **bold** *italic* ~~strike~~ `code` and https://example.com here');
    await e.key('Enter', { shiftKey: true });
    await e.type('next');
    await e.key('Enter');
    await e.type('3. three');
    await e.key('Enter');
    await e.type('four');
    await e.key('Enter');
    await e.key('Tab');
    await e.type('nested');
    await e.key('Enter');
    await e.key('Enter');
    await e.key('Enter');
    await e.type('> quoted');
    await e.key('Enter');
    await e.key('Enter');
    await e.type('```js ');
    await e.type('const x = 1;');
    for (let index = 0; index < 3; index += 1) await e.key('Enter');
    await e.type('---');
    await e.type('The end.');
    const expected = '# Title\n\n###### Six\n\nSome **bold** *italic* ~~strike~~ `code` and <https://example.com> here\\\nnext\n\n3. three\n4. four\n   1. nested\n\n> quoted\n\n```js\nconst x = 1;\n```\n\n---\n\nThe end.';
    assert.equal(changes.at(-1), expected);
    assert.equal(e.markdown(), expected);
  } finally {
    await e.close();
  }
});

test('the value mode keeps unsupported syntax and refused addresses as literal text, and reads it back unchanged', async () => {
  const value = '<b>raw</b> | a | ==mark== [x](javascript:alert(1)) ![y](/relative.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const changes = [];
  const e = await mount({ markdown: { ...converters, defaultValue: value, onChange: (next) => changes.push(next) } });
  try {
    assert.deepEqual(e.json(), fromMarkdown(value));
    assert.deepEqual(e.json().content[0], p(t('<b>raw</b> | a | ==mark== x y')));
    await e.end();
    await e.type('!');
    // Written back, the literal text is escaped, so it reads as the same text again.
    assert.deepEqual(fromMarkdown(changes.at(-1)), e.json());
    assert.match(changes.at(-1), /^\\<b>raw\\<\/b> \\\| a \\\| ==mark== x y\n/u);
    // A bare address is literal text in Markdown, so a paste does not link it, though typing one and a space does.
    await act(async () => { e.editor.commands.setContent('<p></p>'); });
    await e.end();
    await e.paste({ 'text/plain': 'see https://example.com\n\nnext' });
    assert.equal(changes.at(-1), 'see https://example.com\n\nnext');
    assert.deepEqual(e.json(), doc(p(t('see https://example.com')), p(t('next'))));
  } finally {
    await e.close();
  }
});

test('a controlled Markdown value under rapid typing moves no caret and loops no change back', async () => {
  const owner = { current: null };
  const changes = [];
  const e = await mount({ initial: '', owner, onChange: (next) => changes.push(next) }, MarkdownOwner);
  try {
    await e.end();
    for (const character of 'Hello **world** and *more* ') {
      await e.type(character);
      assert.equal(e.caret(), e.editor.state.doc.content.size - 1, `the caret stays where ${JSON.stringify(character)} was typed`);
    }
    // The space at the end is no Markdown, so the last value reported is the one before it.
    assert.equal(changes.at(-1), 'Hello **world** and *more*');
    assert.equal(e.resets.length, 0, 'the owner echoed each value and the editor kept its own document');
    // An empty paragraph is no Markdown either, so it is not reported, and the caret stays in it.
    const reported = changes.length;
    await e.key('Enter');
    const caret = e.caret();
    await e.render();
    assert.equal(changes.length, reported);
    assert.equal(e.caret(), caret);
    assert.deepEqual(e.json().content.at(-1), p());
    await e.type('x');
    assert.equal(changes.at(-1), 'Hello **world** and *more*\n\nx');
    assert.equal(e.resets.length, 0);
  } finally {
    await e.close();
  }
});

test('a controlled Markdown value that reads as the editor\'s own changes nothing, and one that does not replaces the content', async () => {
  const owner = { current: null };
  const changes = [];
  const e = await mount({ initial: '__bold__ and _it_', owner, onChange: (next) => changes.push(next) }, MarkdownOwner);
  try {
    assert.deepEqual(e.json(), doc(p(t('bold', bold), t(' and '), t('it', italic))));
    await e.end();
    await e.render();
    await e.render();
    assert.equal(e.resets.length, 0, 'the owner\'s spelling reads as the editor\'s document');
    assert.deepEqual(changes, []);
    await act(async () => owner.current('# New'));
    // The editor adds an empty paragraph after a final heading, as after any final block that is not a paragraph.
    assert.deepEqual(e.json(), doc(h(1, t('New')), p()));
    assert.equal(e.resets.length, 1);
    assert.deepEqual(changes, [], 'a value from outside is not reported');
  } finally {
    await e.close();
  }
  // An owner that keeps its own value sees the edit, and the editor goes back to that value, as a controlled document does.
  const kept = await mount({ initial: 'fixed', owner, keep: (_next, current) => current }, MarkdownOwner);
  try {
    await kept.end();
    await kept.type('!');
    assert.equal(kept.markdown(), 'fixed');
  } finally {
    await kept.close();
  }
});

test('the value mode reports no change at mount or for the paragraph the editor adds after a final block', async () => {
  const changes = [];
  const e = await mount({ markdown: { ...converters, defaultValue: '```\nx\n```', onChange: (next) => changes.push(next) } });
  try {
    await act(async () => { e.pm.focus(); e.editor.view.dispatch(e.editor.state.tr); });
    assert.deepEqual(e.json(), doc(code('x'), p()));
    assert.deepEqual(changes, []);
    await e.end();
    await e.type('y');
    assert.deepEqual(changes, ['```\nx\n```\n\ny']);
    // The first mount reads defaultValue; later ones do not.
    await e.render({ markdown: { ...converters, defaultValue: 'other', onChange: (next) => changes.push(next) } });
    assert.equal(e.markdown(), '```\nx\n```\n\ny');
  } finally {
    await e.close();
  }
});

test('undo and redo across a Markdown value from outside report what they restore', async () => {
  const owner = { current: null };
  const handle = React.createRef();
  const changes = [];
  const e = await mount({ ref: handle, initial: 'start', owner, onChange: (next) => changes.push(next) }, MarkdownOwner);
  try {
    await e.end();
    // A command is an undo step of its own, so the value from outside is the next one.
    await act(async () => handle.current.execute({ type: 'text', text: ' typed' }));
    assert.equal(changes.at(-1), 'start typed');
    await act(async () => owner.current('**outside**'));
    assert.deepEqual(e.json(), doc(p(t('outside', bold))));
    await e.undo();
    assert.equal(e.markdown(), 'start typed');
    assert.equal(changes.at(-1), 'start typed');
    await e.redo();
    assert.equal(e.markdown(), '**outside**');
    assert.equal(changes.at(-1), '**outside**');
    await e.undo();
    await e.undo();
    assert.equal(e.markdown(), 'start');
    assert.equal(changes.at(-1), 'start');
  } finally {
    await e.close();
  }
});

test('the value mode keeps a controlled value from outside until a composition ends', async () => {
  const owner = { current: null };
  const e = await mount({ initial: 'ab', owner }, MarkdownOwner);
  try {
    await e.end();
    await act(async () => e.pm.dispatchEvent(new e.dom.window.CompositionEvent('compositionstart', { bubbles: true })));
    await act(async () => owner.current('outside'));
    assert.equal(e.markdown(), 'ab');
    await act(async () => e.pm.dispatchEvent(new e.dom.window.CompositionEvent('compositionend', { bubbles: true, data: '' })));
    assert.equal(e.markdown(), 'outside');
  } finally {
    await e.close();
  }
});

test('the value mode reads pasted plain text as Markdown, text pasted with Shift as plain text, and HTML without what Markdown cannot hold', async () => {
  const changes = [];
  const e = await mount({ markdown: { ...converters, onChange: (next) => changes.push(next) } });
  try {
    await e.end();
    await e.paste({ 'text/plain': '## Pasted\n\n- **one**\n- `two`' });
    assert.equal(changes.at(-1), '## Pasted\n\n- **one**\n- `two`');
    await act(async () => { e.editor.commands.setContent('<p></p>'); });
    await e.end();
    await e.paste({ 'text/plain': '## kept *as* text' }, { plain: true });
    assert.deepEqual(e.json(), doc(p(t('## kept *as* text'))));
    await act(async () => { e.editor.commands.setContent('<p></p>'); });
    await e.end();
    // HTML is read as HTML: no paste rule turns its literal asterisks into formatting.
    await e.paste({ 'text/html': '<p><u>under</u> <span style="color: #ef4444">red</span> <em>it</em> **literal**</p>', 'text/plain': 'under red it **literal**' });
    assert.deepEqual(e.json().content[0], p(t('under red '), t('it', italic), t(' **literal**')));
    assert.equal(changes.at(-1), 'under red *it* \\*\\*literal\\*\\*');
  } finally {
    await e.close();
  }
});

test('the character limit counts the editor\'s text the same way for a document and for Markdown', async () => {
  // 'not counted', two block breaks around the image, and 'end': 18 characters, the limit.
  const content = doc(p(t('not', bold), t(' counted')), image('https://example.com/a.png', 'alt'), p(t('end')));
  const left = () => document.querySelector('.muxui-text-editor__hint').textContent;
  const handle = React.createRef();
  const asDocument = await mount({ ref: handle, limit: 18, defaultValue: content });
  const documentLeft = left();
  let documentImage;
  await act(async () => { documentImage = handle.current.execute({ type: 'image', src: 'https://example.com/b.png' }); });
  await asDocument.close();
  const asMarkdown = await mount({ ref: handle, limit: 18, markdown: { ...converters, defaultValue: toMarkdown(content) } });
  try {
    assert.equal(left(), documentLeft);
    assert.equal(left(), '0 characters left');
    // An image adds a block break, so at the limit both refuse it.
    let markdownImage;
    await act(async () => { markdownImage = handle.current.execute({ type: 'image', src: 'https://example.com/b.png' }); });
    assert.equal(documentImage, false);
    assert.equal(markdownImage, false);
    // The limit counts text, not Markdown: the asterisks of `**bold**` are not characters of the document.
    await act(async () => { asMarkdown.editor.commands.setContent('<p></p>'); });
    await asMarkdown.end();
    await asMarkdown.paste({ 'text/plain': `**${'b'.repeat(18)}**` });
    assert.equal(asMarkdown.markdown(), `**${'b'.repeat(18)}**`);
    await asMarkdown.paste({ 'text/plain': '*c*' });
    assert.equal(asMarkdown.markdown(), `**${'b'.repeat(18)}**`, 'a paste past the limit is refused whole');
  } finally {
    await asMarkdown.close();
  }
});

test('a Markdown value renders on the server and hydrates into its document', async () => {
  const value = '# Title\n\nSome **bold** text.';
  const ready = [];
  const element = React.createElement(TextEditor, { label: 'Post', toolbar: 'simple', markdown: { ...converters, value }, onReady: () => ready.push(true) });
  const html = renderToString(element);
  assert.match(html, /<label[^>]*>Post<\/label>/u);
  assert.match(html, /aria-label="Strikethrough"/u);
  assert.doesNotMatch(html, /aria-label="Underline"/u);
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`);
  const restore = installDom(dom);
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const errors = [];
  let root;
  let destroyed;
  try {
    await act(async () => { root = hydrateRoot(document.querySelector('#root'), element, { onRecoverableError: (error) => errors.push(error) }); });
    assert.deepEqual(errors, []);
    const pm = document.querySelector('.ProseMirror');
    destroyed = new Promise((resolve) => pm.editor.on('destroy', resolve));
    assert.deepEqual(normalizeTextEditorDocument(pm.editor.getJSON()), doc(h(1, t('Title')), p(t('Some '), t('bold', bold), t(' text.'))));
    assert.deepEqual(ready, [true]);
  } finally {
    await act(async () => root?.unmount());
    await destroyed;
    restore();
    dom.window.close();
  }
});

// Addresses the rule refuses, each tried as a link and an image address: a script, data, a user name and password, no
// scheme, and a control character.
const REFUSED = ['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.com/a.png', '//example.com/a.png', 'https://exa\u0001mple.com/a.png'];
const destinationOf = (address) => `<${address.replace(/[\\<>]/g, '\\$&')}>`;

/** Every address the editor's live DOM holds is one the rule keeps. */
function assertKeptAddresses(pm, path) {
  for (const element of pm.querySelectorAll('[href], [src]')) {
    const [kind, address] = element.hasAttribute('src') ? ['image', element.getAttribute('src')] : ['link', element.getAttribute('href')];
    assert.notEqual(normalizeTextEditorUrl(address, kind), null, `${path}: ${element.outerHTML}`);
  }
}

test('a link or an image keeps only an address the rule keeps, on every path it enters by, in both presets', async () => {
  for (const preset of ['rich', 'markdown']) {
    const changes = [];
    const handle = React.createRef();
    const props = preset === 'rich' ? { onChange: (next) => changes.push(next) } : { markdown: { ...converters, onChange: (next) => changes.push(next) } };
    const e = await mount({ ref: handle, ...props });
    // What the editor reported last, as text: a document's paragraphs, or the Markdown.
    const reported = () => (preset === 'rich' ? changes.at(-1).content.map((block) => (block.content ?? []).map((inline) => inline.text).join('')).join('|') : changes.at(-1));
    try {
      for (const address of REFUSED) {
        const path = (name) => `${preset}, ${name}, ${JSON.stringify(address)}`;
        // Pasted and dropped HTML: a refused link keeps its text, and a refused image its description, where it stood. An
        // image is a block, so its description is a paragraph where an image the rule keeps would be.
        const html = `<p>before <a href="${address}">text</a> <img src="${address}" alt="Alt"> after</p>`;
        for (const step of ['paste', 'drop']) {
          await e.clear();
          await e[step]({ 'text/html': html, 'text/plain': 'before text Alt after' });
          assertKeptAddresses(e.pm, path(step));
          assert.deepEqual([...e.pm.children].map((block) => `${block.tagName}:${block.textContent}`), ['P:before text', 'P:Alt', 'P: after'], path(step));
          assert.deepEqual(e.json().content.map((block) => (block.content ?? []).map((inline) => inline.text).join('')), ['before text', 'Alt', ' after'], path(step));
          assert.equal(reported(), preset === 'rich' ? 'before text|Alt| after' : 'before text\n\nAlt\n\nafter', path(step));
        }
        // The image input rule leaves a refused address as the text typed.
        await e.clear();
        await e.type(`![Alt](${address})`);
        assertKeptAddresses(e.pm, path('image input rule'));
        assert.equal(e.pm.querySelectorAll('img').length, 0, path('image input rule'));
        assert.equal(e.pm.textContent, `![Alt](${address})`, path('image input rule'));
        // An address typed with a space after it, or pasted over selected text, links nothing the rule refuses.
        await e.clear();
        await e.type(`${address} `);
        assertKeptAddresses(e.pm, path('autolink'));
        await e.clear();
        await e.type('replace me');
        await act(async () => { e.editor.commands.selectAll(); });
        await e.paste({ 'text/plain': address });
        assertKeptAddresses(e.pm, path('paste over a selection'));
        // Pasted Markdown reads a refused link as its text and a refused image as its description.
        await e.clear();
        await e.paste({ 'text/plain': `[text](${destinationOf(address)}) ![Alt](${destinationOf(address)})` });
        assertKeptAddresses(e.pm, path('pasted Markdown'));
        if (preset === 'markdown') assert.equal(e.pm.textContent, 'text Alt', path('pasted Markdown'));
        // The commands refuse it.
        let linked;
        let imaged;
        await act(async () => {
          linked = handle.current.execute({ type: 'link', href: address, text: 'x' });
          imaged = handle.current.execute({ type: 'image', src: address, alt: 'Alt' });
        });
        assert.deepEqual([linked, imaged], [false, false], path('commands'));
        // A value from outside keeps the link's text and the image's description.
        await e.render(preset === 'rich'
          ? { value: doc(p(t('text', link(address))), image(address, 'Alt')) }
          : { markdown: { ...converters, value: `[text](${destinationOf(address)})\n\n![Alt](${destinationOf(address)})`, onChange: (next) => changes.push(next) } });
        assertKeptAddresses(e.pm, path('value'));
        assert.deepEqual(e.json(), doc(p(t('text')), p(t('Alt'))), path('value'));
        await e.render(preset === 'rich' ? { value: undefined } : props);
      }
      // An address the rule keeps still links and shows through the same paths, normalized where it came as HTML.
      await e.clear();
      await e.paste({ 'text/html': '<p><a href="HTTPS://Example.com">text</a> <img src="https://example.com/a.png" alt="Alt"></p>' });
      assert.deepEqual([...e.pm.querySelectorAll('[href], [src]')].map((element) => element.getAttribute('href') ?? element.getAttribute('src')), ['https://example.com/', 'https://example.com/a.png']);
      await e.clear();
      await e.type('![Alt](https://example.com/b.png)');
      assert.equal(e.pm.querySelector('img')?.getAttribute('src'), 'https://example.com/b.png');
      await e.clear();
      await e.type('example.com ');
      assert.equal(e.pm.querySelector('a')?.getAttribute('href'), 'http://example.com');
    } finally {
      await e.close();
    }
  }
});

test('a paste or a drag of part of the editor\'s own content passes the address check as it is, open edges included', async () => {
  // From inside a nested item to inside the next item: the slice's first item has lost its first paragraph, as an open
  // edge may.
  const defaultValue = doc(ul(li(p(t('aa')), ul(li(p(t('bb'))))), li(p(t('cc')))), p(t('end')));
  for (const preset of ['rich', 'markdown']) {
    const e = await mount({ preset, defaultValue });
    try {
      const at = (text) => {
        let found = -1;
        e.editor.state.doc.descendants((node, pos) => { if (node.isText && node.text === text) found = pos; });
        return found;
      };
      const slice = e.editor.state.doc.slice(at('bb') + 1, at('cc') + 1);
      let held = slice;
      e.editor.view.someProp('transformPasted', (transform) => { held = transform(held, e.editor.view, false); });
      assert.ok(held.eq(slice), `${preset}: ${JSON.stringify(held.toJSON())}`);
      // Pasted as the clipboard holds it, at the end, it lands as the engine inserts the slice itself.
      const { dom } = e.editor.view.serializeForClipboard(slice);
      await act(async () => {
        e.pm.focus();
        e.editor.commands.setTextSelection(at('end') + 3);
      });
      // With what the plugins add to it, such as the paragraph after a final list.
      const expected = e.editor.state.applyTransaction(e.editor.state.tr.replaceSelection(slice)).state.doc;
      await e.paste({ 'text/html': dom.innerHTML, 'text/plain': 'b c' });
      assert.ok(e.editor.state.doc.eq(expected), `${preset}: ${JSON.stringify(e.editor.getJSON())}`);
    } finally {
      await e.close();
    }
  }
});

// A Markdown value and a document value of the same content, for an owner of either kind.
const owned = (preset, markdown) => (preset === 'markdown' ? { Owner: MarkdownOwner, value: markdown } : { Owner: DocumentOwner, value: fromMarkdown(markdown) });

test('a value from outside is applied as given, with no address in it linked, so later renders change nothing', async () => {
  for (const preset of ['markdown', 'rich']) {
    const owner = { current: null };
    const { Owner, value } = owned(preset, 'See example.com\n\nNotes');
    const e = await mount({ initial: owned(preset, 'Start').value, owner }, Owner);
    try {
      await e.end();
      await act(async () => owner.current(value));
      assert.equal(e.pm.querySelectorAll('a').length, 0, preset);
      assert.deepEqual(e.json(), doc(p(t('See example.com')), p(t('Notes'))), preset);
      for (let index = 0; index < 3; index += 1) await e.render({ 'data-render': String(index) });
      assert.equal(e.resets.length, 1, `${preset}: the value replaced the content once`);
    } finally {
      await e.close();
    }
  }
});

test('a value from outside is an undo step of its own, apart from the typing just before and after it', async () => {
  for (const preset of ['markdown', 'rich']) {
    const owner = { current: null };
    const e = await mount({ initial: owned(preset, 'Draft').value, owner }, owned(preset, '').Owner);
    try {
      await e.end();
      await e.type(' v2');
      await act(async () => owner.current(owned(preset, 'Replaced').value));
      await e.end();
      await e.type('!');
      assert.equal(e.markdown(), 'Replaced!', preset);
      for (const expected of ['Replaced', 'Draft v2', 'Draft']) {
        await e.undo();
        assert.equal(e.markdown(), expected, `${preset}: undo to ${expected}`);
      }
    } finally {
      await e.close();
    }
  }
});

test('undo and redo bring back a value from outside as given, with no address in it linked, in both presets', async () => {
  for (const preset of ['markdown', 'rich']) {
    const owner = { current: null };
    const changes = [];
    const { Owner, value } = owned(preset, 'Email team@example.org\n\nVisit www.example.org');
    const e = await mount({ initial: owned(preset, 'Start').value, owner, onChange: (next) => changes.push(next) }, Owner);
    try {
      await act(async () => owner.current(value));
      for (const step of ['undo', 'redo']) {
        await act(async () => { e.editor.commands[step](); });
        assert.equal(e.pm.querySelectorAll('a').length, 0, `${preset}: ${step}`);
      }
      assert.equal(e.markdown(), 'Email team@example.org\n\nVisit www.example.org', preset);
      assert.deepEqual(changes.at(-1), value, preset);
    } finally {
      await e.close();
    }
  }
});

test('in the value mode a paste over selected text, with Shift or without, takes its place and links nothing', async () => {
  const changes = [];
  const select = (e) => act(async () => { e.editor.commands.setTextSelection({ from: 6, to: 16 }); });
  const e = await mount({ markdown: { ...converters, onChange: (next) => changes.push(next) } });
  try {
    for (const plain of [true, false]) {
      await e.clear();
      await e.type('keep replace me');
      await select(e);
      await e.paste({ 'text/plain': 'https://example.com' }, { plain });
      assert.equal(e.pm.querySelectorAll('a').length, 0, `with Shift ${plain}`);
      assert.equal(e.pm.textContent, 'keep https://example.com', `with Shift ${plain}`);
      assert.equal(changes.at(-1), 'keep https://example.com', `with Shift ${plain}`);
    }
  } finally {
    await e.close();
  }
  // The rich preset links the selected text with a pasted address.
  const rich = await mount({});
  try {
    await rich.clear();
    await rich.type('keep replace me');
    await select(rich);
    await rich.paste({ 'text/plain': 'https://example.com' });
    assert.equal(rich.pm.querySelector('a')?.textContent, 'replace me');
  } finally {
    await rich.close();
  }
});

test('a value that the editor\'s schema holds as its content changes nothing, in either preset', async () => {
  // Bold and italic in the other order on neighbouring text, which the schema orders and joins, and a numbered list with
  // no start, which the schema starts at 1.
  const value = doc(p(t('a', bold, italic), t('b', italic, bold)), { type: 'orderedList', content: [li(p(t('x')))] });
  for (const preset of ['rich', 'markdown']) {
    const e = await mount({ preset, value });
    try {
      await act(async () => { e.pm.focus(); e.editor.commands.setTextSelection(2); });
      for (let index = 0; index < 3; index += 1) await e.render({ value: structuredClone(value) });
      assert.equal(e.resets.length, 0, preset);
      assert.equal(e.caret(), 2, preset);
    } finally {
      await e.close();
    }
  }
  // The content is compared as the editor reports it, not as it holds it: a typed address links to http://example.com,
  // which the report writes as http://example.com/, and a pasted image's title is no part of the document.
  const owner = { current: null };
  const e = await mount({ initial: doc(p()), owner }, DocumentOwner);
  try {
    await e.end();
    await e.type('example.com ');
    await e.paste({ 'text/html': '<p>x</p><img src="https://example.com/a.png" alt="A" title="T">' });
    await e.render();
    assert.equal(e.pm.querySelectorAll('a[href="http://example.com"], img[title="T"]').length, 2);
    assert.equal(e.resets.length, 0);
  } finally {
    await e.close();
  }
});

test('an empty text node is no part of a document: the check refuses it, cleaning drops it, and a value with one renders, in both presets', async () => {
  const value = doc(p(t('a'), t(''), t('b')), p(t('')), code(''));
  assert.equal(isTextEditorDocument(value), false);
  assert.deepEqual(normalizeTextEditorDocument(value), doc(p(t('a'), t('b')), p(), { type: 'codeBlock' }));
  for (const preset of ['rich', 'markdown']) {
    const e = await mount({ preset, value });
    try {
      await e.render({ value: structuredClone(value) });
      assert.deepEqual(e.json(), doc(p(t('ab')), p(), { type: 'codeBlock' }), preset);
    } finally {
      await e.close();
    }
  }
});

// A seeded generator of documents of every kind of block, inline node, mark and attribute the grammar has, some of them
// with text the grammar may refuse, so a failing case names its seed and repeats.
function documents(seed) {
  let state = seed >>> 0;
  const int = (n) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4_294_967_296) * n);
  };
  const pick = (items) => items[int(items.length)];
  const some = (items) => items.filter(() => int(3) === 0);
  const text = () => pick(['', 'a', 'bc', ' x ', '*', '_', '1.', '#', 'é', '\u{1F600}', 'a\nb']);
  const marks = () => some([bold, italic, underline, strike, mono, link('https://example.com/'), { type: 'textStyle', attrs: Object.fromEntries(some([['color', '#ef4444'], ['fontFamily', 'serif'], ['fontSize', '20px']])) }]);
  const inline = () => Array.from({ length: int(4) }, () => (int(6) === 0 ? br : t(text(), ...marks())));
  const align = () => (int(3) === 0 ? { textAlign: pick(['left', 'center', 'right', 'justify']) } : undefined);
  const paragraph = () => ({ type: 'paragraph', ...(align() ? { attrs: align() } : {}), ...((content) => (content.length ? { content } : {}))(inline()) });
  const block = (depth) => {
    switch (depth > 2 ? int(4) : int(9)) {
      case 0: return paragraph();
      case 1: return { type: 'heading', attrs: { level: 1 + int(6), ...align() }, ...((content) => (content.length ? { content } : {}))(inline()) };
      case 2: return { type: 'codeBlock', ...(int(2) ? { attrs: { language: 'js' } } : {}), ...(int(2) ? { content: [t(text())] } : {}) };
      case 3: return int(2) ? hr : image('https://example.com/i.png', pick([undefined, '', 'Alt']));
      case 4: case 5: return { type: int(2) ? 'bulletList' : 'orderedList', content: Array.from({ length: 1 + int(2) }, () => li(paragraph(), ...Array.from({ length: int(2) }, () => block(depth + 1)))) };
      case 6: return { type: 'orderedList', attrs: Object.fromEntries(some([['start', 1 + int(9)], ['type', pick(['1', 'a', 'A', 'i', 'I'])]])), content: [li(paragraph())] };
      default: return quote(...Array.from({ length: 1 + int(2) }, () => block(depth + 1)));
    }
  };
  return () => doc(...Array.from({ length: 1 + int(3) }, () => block(0)));
}

test('every document the check accepts holds as a value, and the same value again changes nothing, in both presets', async () => {
  const textOf = (node) => (node.type === 'text' ? node.text : (node.content ?? []).map(textOf).join(''));
  for (const preset of ['rich', 'markdown']) {
    const next = documents(preset === 'rich' ? 1 : 2);
    const e = await mount({ preset, value: doc(p()) });
    try {
      for (let index = 0, held = 0; held < 300; index += 1) {
        const value = next();
        if (!isTextEditorDocument(value)) continue;
        held += 1;
        await e.render({ value });
        let text = '';
        e.editor.state.doc.descendants((node) => { if (node.isText) text += node.text; });
        assert.equal(text, textOf(value), `${preset}, document ${index}: ${JSON.stringify(value)}`);
        const resets = e.resets.length;
        await e.render({ value: structuredClone(value) });
        assert.equal(e.resets.length, resets, `${preset}, document ${index}: ${JSON.stringify(value)}`);
      }
    } finally {
      await e.close();
    }
  }
});
