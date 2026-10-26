import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeHistory, undoDepth } from '@tiptap/pm/history';
import { JSDOM } from 'jsdom';
import { MARKDOWN_DEPTH_LIMIT, MARKDOWN_LINE_LENGTH_LIMIT, MARKDOWN_LINE_LIMIT, MARKDOWN_NODE_LIMIT, MARKDOWN_SOURCE_LIMIT, Markdown } from '../src/markdown/index.ts';
import { TextEditor, isTextEditorDocument, normalizeTextEditorDocument } from '../src/text-editor/index.ts';
import { Resizable, ResizableHandle, ResizablePanel } from '../src/supplemental/resizable.ts';
import { Lightbox, LightboxBackdrop, LightboxClose, LightboxContent, LightboxNext, LightboxPopup, LightboxTrigger } from '../src/supplemental/lightbox.ts';
import { installDom } from './support/dom.mjs';

function reactProps(element) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactProps'));
  return key ? element[key] : {};
}

test('Markdown renders its bounded subset without raw HTML or unsafe URLs', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { source: '# Heading\n\n[bad](javascript:alert(1)) <img src=x>\n\n`code`\n\n> Quote' }));
  assert.match(html, /Heading/u); assert.match(html, /muxui-markdown-code/u); assert.match(html, /muxui-markdown-blockquote/u);
  assert.doesNotMatch(html, /javascript:|<img/u);
  const mixed = renderToStaticMarkup(React.createElement(Markdown, { source: 'before <span>raw</span> after' }));
  assert.match(mixed, /before raw after/u); assert.doesNotMatch(mixed, /<span>|<\/span>/u);
});
test('Markdown exports its documented bounds', () => {
  assert.deepEqual(
    { MARKDOWN_SOURCE_LIMIT, MARKDOWN_LINE_LIMIT, MARKDOWN_LINE_LENGTH_LIMIT, MARKDOWN_DEPTH_LIMIT, MARKDOWN_NODE_LIMIT },
    { MARKDOWN_SOURCE_LIMIT: 100_000, MARKDOWN_LINE_LIMIT: 10_000, MARKDOWN_LINE_LENGTH_LIMIT: 10_000, MARKDOWN_DEPTH_LIMIT: 32, MARKDOWN_NODE_LIMIT: 10_000 },
  );
});
test('Markdown returns its fallback for source, line count, and line length bounds', () => {
  const render = (source) => renderToStaticMarkup(React.createElement(Markdown, { source, invalidFallback: 'Blocked' }));
  const lines = (count, separator) => Array.from({ length: count }, () => 'x').join(separator);
  const rejected = (source, code) => {
    const html = render(source);
    assert.match(html, new RegExp(`data-markdown-error="${code}"`, 'u')); assert.match(html, />Blocked</u);
  };
  const accepted = (source) => {
    const html = render(source);
    assert.doesNotMatch(html, /data-markdown-error/u); assert.doesNotMatch(html, /Blocked/u);
  };

  rejected('x'.repeat(MARKDOWN_SOURCE_LIMIT + 1), 'MARKDOWN_SOURCE_LIMIT_EXCEEDED');

  // The line limit counts lines, so many short lines are rejected.
  accepted(lines(MARKDOWN_LINE_LIMIT, '\n'));
  rejected(lines(MARKDOWN_LINE_LIMIT + 1, '\n'), 'MARKDOWN_LINE_LIMIT_EXCEEDED');
  accepted(lines(MARKDOWN_LINE_LIMIT, '\r\n')); accepted(lines(MARKDOWN_LINE_LIMIT, '\r'));
  rejected(lines(MARKDOWN_LINE_LIMIT + 1, '\r\n'), 'MARKDOWN_LINE_LIMIT_EXCEEDED'); rejected(lines(MARKDOWN_LINE_LIMIT + 1, '\r'), 'MARKDOWN_LINE_LIMIT_EXCEEDED');
  // A trailing newline starts a final blank line, as in CodeBlock.
  accepted(`${lines(MARKDOWN_LINE_LIMIT - 1, '\n')}\n`);
  rejected(`${lines(MARKDOWN_LINE_LIMIT, '\n')}\n`, 'MARKDOWN_LINE_LIMIT_EXCEEDED');

  // The per-line character guard has its own limit and code.
  accepted('x'.repeat(MARKDOWN_LINE_LENGTH_LIMIT));
  rejected('x'.repeat(MARKDOWN_LINE_LENGTH_LIMIT + 1), 'MARKDOWN_LINE_LENGTH_LIMIT_EXCEEDED');
  rejected(`short\n${'x'.repeat(MARKDOWN_LINE_LENGTH_LIMIT + 1)}\nshort`, 'MARKDOWN_LINE_LENGTH_LIMIT_EXCEEDED');
});
test('Markdown preserves indented code as paragraph content while fencing creates code blocks', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { source: '    indented code\n\n```js\nfenced code\n```' }));
  assert.match(html, /<p>indented code<\/p>/u);
  assert.match(html, /<pre class="muxui-markdown-code-block" data-language="js"><code>fenced code<\/code><\/pre>/u);
});
test('TextEditor only accepts the finite owned document grammar', () => {
  const input = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'link', attrs: { href: 'javascript:bad' } }] }] }, { type: 'script', content: [] }] };
  const nestedList = { type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] }, { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }] }] }] }] }] };
  assert.equal(isTextEditorDocument(input), false);
  assert.equal(isTextEditorDocument(nestedList), true);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: '1' } }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: true } }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] }), true);
  const orderedList = { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 3, type: 'a' }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }] }] };
  assert.equal(isTextEditorDocument(orderedList), true);
  assert.equal(isTextEditorDocument({ ...orderedList, content: [{ ...orderedList.content[0], attrs: { type: 'decimal' } }] }), false);
  assert.equal(isTextEditorDocument({ ...orderedList, content: [{ ...orderedList.content[0], attrs: { type: null } }] }), false);
  assert.deepEqual(normalizeTextEditorDocument({ ...orderedList, content: [{ ...orderedList.content[0], attrs: { type: 'a' } }] }), { ...orderedList, content: [{ ...orderedList.content[0], attrs: { type: 'a' } }] });
  assert.deepEqual(normalizeTextEditorDocument({ ...orderedList, content: [{ ...orderedList.content[0], attrs: { start: 3, type: 'decimal' } }] }), { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 3 }, content: orderedList.content[0].content }] });
  assert.deepEqual(normalizeTextEditorDocument({ ...orderedList, content: [{ ...orderedList.content[0], attrs: { start: 3, type: null } }] }), { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 3 }, content: orderedList.content[0].content }] });
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'diagonal' } }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null } }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [{ type: 'highlight' }] }] }] }), false);
  const tiptapColor = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [{ type: 'text', text: 'Red', marks: [{ type: 'textStyle', attrs: { backgroundColor: null, color: '#FF0000', fontFamily: null, fontSize: null, lineHeight: null } }, { type: 'bold' }] }] }] };
  assert.deepEqual(normalizeTextEditorDocument(tiptapColor), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Red', marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }, { type: 'bold' }] }] }] });
  assert.equal(isTextEditorDocument({ ...tiptapColor, content: [{ ...tiptapColor.content[0], attrs: undefined, content: [{ ...tiptapColor.content[0].content[0], marks: [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: null } }] }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'text', text: 'Root text' }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'paragraph' }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'paragraph' }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'codeBlock' }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'text', text: 'Quote' }] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/image.png', alt: 42 } }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'bulletList', content: [] }] }), false);
  assert.equal(isTextEditorDocument({ type: 'doc', content: [{ type: 'blockquote', content: [] }] }), false);
  assert.deepEqual(normalizeTextEditorDocument({ type: 'doc', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }), { type: 'doc', content: [{ type: 'paragraph' }] });
  assert.deepEqual(normalizeTextEditorDocument({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'const draft = true;' }] }] }), { type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const draft = true;' }] }] });
  assert.deepEqual(normalizeTextEditorDocument(input), { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }] });
  assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(TextEditor, { defaultValue: input, disabled: true, toolbar: 'advanced' })));
});

test('TextEditor only accepts portable HTTP image URLs', () => {
  const documentWithImage = (src) => ({ type: 'doc', content: [{ type: 'image', attrs: { src } }] });
  assert.equal(isTextEditorDocument(documentWithImage('https://example.com/object-id')), true);
  assert.equal(isTextEditorDocument(documentWithImage('http://example.com/object-id')), true);
  assert.equal(isTextEditorDocument(documentWithImage('blob:https://example.com/object-id')), false);
  assert.equal(isTextEditorDocument(documentWithImage('data:image/png;base64,abc')), false);
  assert.equal(isTextEditorDocument(documentWithImage('file:///tmp/image.png')), false);
  assert.equal(isTextEditorDocument(documentWithImage('https://user:pass@example.com/object-id')), false);
});
test('Resizable is server-renderable with separator ARIA bounds', () => {
  const html = renderToStaticMarkup(React.createElement(Resizable, { defaultSizes: { left: 40, right: 60 } }, React.createElement(ResizablePanel, { id: 'left', minSize: 20 }), React.createElement(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize panes' }), React.createElement(ResizablePanel, { id: 'right', minSize: 20 })));
  assert.match(html, /role="separator"/u); assert.match(html, /aria-valuenow="40"/u);
});
test('closed Lightbox does not render content or call renderContent during SSR', () => {
  let calls = 0;
  const html = renderToStaticMarkup(React.createElement(Lightbox, { items: [{ key: 'one', label: 'One' }] }, React.createElement(LightboxTrigger, { itemKey: 'one' }, 'Open'), React.createElement(LightboxBackdrop, null, React.createElement(LightboxPopup, null, React.createElement(LightboxContent, { renderContent: () => { calls += 1; return 'content'; } })) )));
  assert.equal(calls, 0); assert.doesNotMatch(html, /muxui-lightbox-content/u); assert.match(html, /Open/u);
});

test('Markdown filters credential URLs, keeps safe images, and bounds inline token work', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { source: '[bad](https://user:pass@example.com) ![bad](https://user:pass@example.com/x) [good](https://example.com) ![good](https://example.com/x)' }));
  assert.doesNotMatch(html, /user:pass/u);
  assert.match(html, /href="https:\/\/example.com"/u);
  assert.match(html, /src="https:\/\/example.com\/x"/u);
  const invalidBase = renderToStaticMarkup(React.createElement(Markdown, { source: '[relative](./guide)', baseUrl: 'https://user:pass@example.com/', invalidFallback: 'Blocked' }));
  assert.match(invalidBase, /MARKDOWN_INVALID_BASE_URL/u);
  const manyLinks = Array.from({ length: 5_001 }, () => '[x](http://x)\n').join('');
  const bounded = renderToStaticMarkup(React.createElement(Markdown, { source: manyLinks, invalidFallback: 'Blocked' }));
  assert.match(bounded, /MARKDOWN_NODE_LIMIT_EXCEEDED/u);
});

test('TextEditor preserves rich marks and controlled formatting actions when mounted', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const changes = [];
  const value = { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Draft', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#3b82f6', fontFamily: 'serif', fontSize: '18px' } }] }] }] };
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(TextEditor, { value, onChange: (next) => changes.push(next), toolbar: 'advanced', floating: true })));
    const editor = document.querySelector('.ProseMirror');
    assert.ok(editor);
    assert.ok(document.querySelector('.muxui-text-editor__toolbar--advanced.muxui-text-editor__toolbar--floating'));
    assert.match(editor.innerHTML, /font-size: 18px/u);
    const controlled = { ...value, content: [{ ...value.content[0], content: [{ ...value.content[0].content[0], marks: [{ type: 'textStyle', attrs: { color: '#3b82f6', fontFamily: 'serif', fontSize: '20px' } }] }] }] };
    await act(async () => root.render(React.createElement(TextEditor, { value: controlled, onChange: (next) => changes.push(next), toolbar: 'advanced', floating: true })));
    assert.match(document.querySelector('.ProseMirror').innerHTML, /font-size: 20px/u);
    assert.ok(document.querySelector('[aria-label="Font family"]'));
    assert.ok(document.querySelector('[aria-label="Text color"]'));
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

// An omitted defaultValue is normalized like any other, which copies the empty document. Handing the editor the shared constant itself
// would let a change to what normalizeTextEditorDocument(undefined) returns show up in an editor that mounts after it.
test('TextEditor never lends its editor the shared empty document when defaultValue is omitted', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const shared = normalizeTextEditorDocument(undefined);
  const original = shared.content[0];
  function Parent() {
    React.useLayoutEffect(() => {
      shared.content[0] = { type: 'paragraph', content: [{ type: 'text', text: 'LEAK' }] };
    }, []);
    return React.createElement(TextEditor, { 'aria-label': 'Draft', toolbar: false });
  }
  let editor;
  let destroyed;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Parent)));
    editor = document.querySelector('.ProseMirror').editor;
    destroyed = new Promise((resolve) => editor.on('destroy', resolve));
    assert.equal(document.querySelector('.ProseMirror').textContent, '');
    assert.deepEqual(normalizeTextEditorDocument(editor.getJSON()), { type: 'doc', content: [{ type: 'paragraph' }] });
  } finally {
    shared.content[0] = original;
    await act(async () => root?.unmount());
    // Tiptap destroys the editor after the unmount; the window it reads must still exist.
    if (editor && !editor.isDestroyed) await destroyed;
    restore();
    dom.window.close();
  }
});

test('TextEditor normalizes its enabled Tiptap output into a strict portable round trip', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const changes = [];
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(TextEditor, { onChange: (next) => changes.push(next), toolbar: 'advanced' })));
    const editor = document.querySelector('.ProseMirror').editor;
    await act(async () => editor.commands.setContent('<p>one<br>two <s>strike</s> <code>inline</code> <a href="https://example.com">link</a></p><hr><ol start="3" type="a"><li>item</li></ol><pre><code class="language-js">const x = 1</code></pre><img src="https://example.com/image.png" alt="Image"><img src="https://example.com/default-image.png">'));
    const portable = changes.at(-1);
    assert.deepEqual(portable, {
      type: 'doc', content: [
        { type: 'paragraph', content: [
          { type: 'text', text: 'one' }, { type: 'hardBreak' }, { type: 'text', text: 'two ' },
          { type: 'text', text: 'strike', marks: [{ type: 'strike' }] }, { type: 'text', text: ' ' },
          { type: 'text', text: 'inline', marks: [{ type: 'code' }] }, { type: 'text', text: ' ' },
          { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://example.com/' } }] },
        ] },
        { type: 'horizontalRule' },
        { type: 'orderedList', attrs: { start: 3, type: 'a' }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
        { type: 'codeBlock', attrs: { language: 'js' }, content: [{ type: 'text', text: 'const x = 1' }] },
        { type: 'image', attrs: { src: 'https://example.com/image.png', alt: 'Image' } },
        { type: 'image', attrs: { src: 'https://example.com/default-image.png' } },
        { type: 'paragraph' },
      ],
    });
    assert.equal(isTextEditorDocument(portable), true);
    await act(async () => root.render(React.createElement(TextEditor, { value: portable, onChange: (next) => changes.push(next), toolbar: 'advanced' })));
    assert.deepEqual(normalizeTextEditorDocument(document.querySelector('.ProseMirror').editor.getJSON()), portable);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('TextEditor reconciles controlled edits without requiring a parent rerender', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const value = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }] };
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(TextEditor, { value, onChange: () => {}, 'aria-label': 'Document editor', required: true })));
    const editor = document.querySelector('.ProseMirror');
    assert.equal(editor?.getAttribute('aria-label'), 'Document editor');
    assert.equal(document.querySelector('.muxui-text-editor')?.hasAttribute('aria-label'), false);
    assert.equal(editor?.getAttribute('aria-required'), 'true');
    await act(async () => { editor.editor.commands.insertContent(' Changed'); });
    assert.equal(editor.textContent, 'Draft');
    await act(async () => { editor.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true })); });
    await act(async () => { editor.editor.commands.insertContent(' composing'); });
    assert.match(editor.textContent, /composing/u);
    await act(async () => { editor.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    assert.equal(editor.textContent, 'Draft');
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

// Mounts a plain-text editor with a character limit; edits go through Tiptap commands, each its own undo step.
const limitDocument = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }] });
async function mountLimitEditor({ limit, ...props }) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  const changes = [];
  const render = (next) => act(async () => root.render(React.createElement(TextEditor, {
    limit, toolbar: false, 'aria-label': 'Limited', onChange: (value) => changes.push(value.content[0].content?.[0].text ?? ''), ...props, ...next,
  })));
  await render();
  const pm = document.querySelector('.ProseMirror');
  const { editor } = pm;
  const edit = (command) => act(async () => {
    command(editor.commands);
    editor.view.dispatch(closeHistory(editor.state.tr));
  });
  return {
    changes,
    render,
    text: () => editor.getText(),
    html: () => editor.getHTML(),
    undoSteps: () => undoDepth(editor.state),
    hint: () => document.querySelector('.muxui-text-editor__hint').textContent,
    // Types at the end of the text, or removes the last `count` characters.
    insert: (characters) => edit((commands) => commands.insertContentAt(editor.state.doc.content.size - 1, characters)),
    remove: (count) => edit((commands) => commands.deleteRange({ from: editor.state.doc.content.size - 1 - count, to: editor.state.doc.content.size - 1 })),
    undo: () => act(async () => { editor.commands.undo(); }),
    // Plain text pasted at the caret, through ProseMirror's paste handler, so Tiptap's paste rules run.
    paste: (text) => act(async () => {
      const event = new window.Event('paste', { bubbles: true, cancelable: true });
      event.clipboardData = { types: ['text/plain'], getData: (type) => (type === 'text/plain' ? text : '') };
      pm.dispatchEvent(event);
    }),
    async close() {
      await act(async () => root.unmount());
      restore();
      dom.window.close();
    },
  };
}

test('TextEditor refuses an over-limit edit before it applies, so one Undo reverts the last real edit', async () => {
  const t = await mountLimitEditor({ limit: 5, defaultValue: limitDocument('abc') });
  try {
    assert.equal(t.hint(), '2 characters left');
    await t.insert('de');
    assert.equal(t.text(), 'abcde');
    assert.equal(t.hint(), '0 characters left');
    await t.insert('f');
    assert.equal(t.text(), 'abcde', 'the over-limit insert never applies');
    assert.deepEqual(t.changes, ['abcde'], 'and is not reported');
    await t.undo();
    assert.equal(t.text(), 'abc', 'one Undo reverts the insert before it, not the refused one');
    assert.equal(t.hint(), '2 characters left');
  } finally {
    await t.close();
  }
});

test('TextEditor lets an over-limit document be edited down but never longer', async () => {
  const t = await mountLimitEditor({ limit: 5, defaultValue: limitDocument('abcdefgh') });
  try {
    assert.equal(t.hint(), '0 characters left');
    await t.insert('x');
    assert.equal(t.text(), 'abcdefgh', 'an over-limit document does not grow');
    await t.remove(1);
    assert.equal(t.text(), 'abcdefg', 'an edit that shortens it applies while it is still over the limit');
    await t.insert('x');
    assert.equal(t.text(), 'abcdefg');
    await t.remove(2);
    assert.equal(t.text(), 'abcde');
    await t.undo();
    assert.equal(t.text(), 'abcdefg', 'Undo returns to the over-limit text it came from');
    await t.remove(3);
    assert.equal(t.text(), 'abcd');
    assert.equal(t.hint(), '1 character left');
    await t.insert('x');
    assert.equal(t.text(), 'abcdx', 'an edit that fits applies once the document is within the limit');
    assert.deepEqual(t.changes, ['abcdefg', 'abcde', 'abcdefg', 'abcd', 'abcdx']);
  } finally {
    await t.close();
  }
});

test('TextEditor accepts a paste that fits once its paste rules apply, and Undo reverts it in one step', async () => {
  const t = await mountLimitEditor({ limit: 3, defaultValue: limitDocument('') });
  try {
    await t.paste('**abc**');
    assert.equal(t.html(), '<p><strong>abc</strong></p>', 'the delimiters become bold, leaving three characters');
    assert.equal(t.changes.length, 1, 'onChange runs once');
    await t.undo();
    assert.equal(t.text(), '', 'one Undo reverts the whole paste');
    assert.equal(t.undoSteps(), 0);
  } finally {
    await t.close();
  }
});

test('TextEditor refuses a paste that stays over the limit without a history step or onChange', async () => {
  const t = await mountLimitEditor({ limit: 3, defaultValue: limitDocument('ab') });
  try {
    await t.paste('**abc**');
    assert.equal(t.text(), 'ab', 'bold abc would still be longer than the limit');
    await t.paste('abcdefgh');
    assert.equal(t.text(), 'ab');
    assert.deepEqual(t.changes, []);
    assert.equal(t.undoSteps(), 0);
  } finally {
    await t.close();
  }
});

test('TextEditor shows a controlled value longer than the limit as given', async () => {
  const t = await mountLimitEditor({ limit: 5, value: limitDocument('abc') });
  try {
    await t.render({ value: limitDocument('abcdefgh') });
    assert.equal(t.text(), 'abcdefgh');
    assert.deepEqual(t.changes, [], 'the parent set it, so onChange stays quiet');
  } finally {
    await t.close();
  }
});

test('TextEditor scopes link shortcuts to editable instances and preserves callback ownership', async () => {
  const dom = new JSDOM('<!doctype html><button id="outside">Outside</button><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let requests = 0;
  let prompts = 0;
  try {
    window.prompt = () => { prompts += 1; return 'https://example.com'; };
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(TextEditor, { id: 'editable-editor', 'aria-label': 'Editable editor', toolbar: false, onLinkRequest: () => { requests += 1; } }),
      React.createElement(TextEditor, { id: 'read-only-editor', 'aria-label': 'Read-only editor', toolbar: false, readOnly: true, onLinkRequest: () => { requests += 1; } }),
    )));
    const editable = document.querySelector('#editable-editor');
    const readOnly = document.querySelector('#read-only-editor');
    assert.ok(editable);
    assert.ok(readOnly);
    await act(async () => document.querySelector('#outside').dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
    assert.deepEqual({ requests, prompts }, { requests: 0, prompts: 0 });
    await act(async () => editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })));
    assert.deepEqual({ requests, prompts }, { requests: 1, prompts: 0 });
    await act(async () => readOnly.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })));
    assert.deepEqual({ requests, prompts }, { requests: 1, prompts: 0 });
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('TextEditor advanced controls expose the color dialog and durable image URL action', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let editor;
  let editorDestroyed;
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(TextEditor, { label: 'Document', toolbar: 'advanced' })));
    editor = document.querySelector('.ProseMirror')?.editor;
    assert.ok(editor, 'advanced TextEditor mounts its owned Tiptap instance');
    editorDestroyed = new Promise((resolve) => editor.on('destroy', resolve));
    assert.equal(document.querySelectorAll('.muxui-text-editor__select').length, 2);
    assert.equal(document.querySelectorAll('input[type="file"][accept="image/*"]').length, 0);
    assert.equal(document.querySelectorAll('[aria-label="Insert image"]').length, 1);
    const colorTrigger = document.querySelector('[aria-label="Text color"]');
    await act(async () => colorTrigger.click());
    assert.equal(document.querySelectorAll('.muxui-text-editor__color-swatch').length, 16);
    assert.equal(document.querySelector('[role="dialog"][aria-label="Text color picker"]') !== null, true);
    const customColor = document.querySelector('.muxui-text-editor__color-field input');
    assert.ok(customColor);
    assert.equal(customColor.type, 'text');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  } finally {
    await act(async () => root?.unmount());
    if (editor && !editor.isDestroyed) await editorDestroyed;
    dom.window.close();
    restore();
  }
});

// Mounts a TextEditor with a selection bar in its own jsdom. The editor text is
// "Hello brave new world"; "brave" is bold and spans positions 7 to 12.
const selectionDocument = { type: 'doc', content: [{ type: 'paragraph', content: [
  { type: 'text', text: 'Hello ' }, { type: 'text', text: 'brave', marks: [{ type: 'bold' }] }, { type: 'text', text: ' new world' },
] }] };
const selectionActionList = [
  { id: 'improve', label: 'Improve', pendingLabel: 'Improving…' },
  { id: 'explain', label: 'Explain' },
  { id: 'shorten', label: 'Shorten', overflow: true },
];

// `scope` is the attribute text of a Mux runtime scope around the editor; jsdom has no user-agent
// direction rule, so a scoped RTL editor gets the one the browser applies.
async function mountSelectionEditor({ onSelectionRequest, scope = '', ...props } = {}) {
  const dom = new JSDOM(`<!doctype html><style>[dir="rtl"] .ProseMirror, [dir="rtl"].muxui-text-editor__selection-bar { direction: rtl; }</style><button id="outside">Outside</button><div id="root" ${scope}></div>`, { url: 'http://localhost/' });
  const restore = installDom(dom, { layoutStubs: true });
  // jsdom has no layout, so give ProseMirror's coordinate lookups empty rectangles.
  const emptyRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = emptyRect;
  const root = createRoot(document.querySelector('#root'));
  const session = { actions: undefined };
  // Every handler, including one passed to a later render, records the controller it receives;
  // passing `onSelectionRequest: undefined` to a render removes the callback.
  const render = (next = {}) => {
    const handler = Object.hasOwn(next, 'onSelectionRequest') ? next.onSelectionRequest : onSelectionRequest;
    const removed = Object.hasOwn(next, 'onSelectionRequest') && handler === undefined;
    return act(async () => root.render(React.createElement(TextEditor, {
      'aria-label': 'Draft',
      defaultValue: selectionDocument,
      selectionActions: selectionActionList,
      ...props,
      ...next,
      onSelectionRequest: removed ? undefined : (request, actions) => {
        session.actions = actions;
        return handler?.(request, actions);
      },
    })));
  };
  await render();
  const pm = document.querySelector('.ProseMirror');
  const { editor } = pm;
  const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  const bar = () => document.querySelector('[role="toolbar"][aria-label="Selection actions"]');
  const control = (name) => [...(bar()?.querySelectorAll('button, input') ?? [])].find((node) => (node.getAttribute('aria-label') ?? node.textContent.trim()) === name);
  const names = () => [...(bar()?.querySelectorAll('button, input') ?? [])].map((node) => node.getAttribute('aria-label') ?? node.textContent.trim());
  // React loads before jsdom, so it never sees native input events and reads the value on keyup instead.
  const type = (input, value) => act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'a', bubbles: true }));
  });
  return {
    editor, pm, render, flush, bar, control, names, type, session,
    json: () => JSON.stringify(editor.getJSON()),
    blocks: () => normalizeTextEditorDocument(editor.getJSON()).content,
    text: () => editor.getText(),
    status: () => document.querySelector('[role="status"]')?.textContent ?? '',
    async select(from, to) {
      await act(async () => { pm.focus(); editor.commands.setTextSelection({ from, to }); });
      await flush();
    },
    click: (name) => act(async () => control(name).click()),
    // Calls a request controller method the way a caller would, then lets React render the result.
    async apply(method, content) {
      let result;
      await act(async () => { result = session.actions[method](content); });
      return result;
    },
    key: (target, key, init) => act(async () => target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))),
    async close() {
      await act(async () => root.unmount());
      await new Promise((resolve) => setTimeout(resolve, 10));
      restore();
    },
  };
}

test('TextEditor selection actions follow a nonempty selection without taking focus', async () => {
  const t = await mountSelectionEditor();
  try {
    assert.ok(t.bar() === null, 'no selection, no bar');
    await t.select(7, 12);
    assert.ok(t.bar());
    assert.ok(document.activeElement === t.pm, 'the bar never takes focus');
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
    assert.deepEqual(t.names(), ['Describe edits', 'Improve', 'Explain', 'More actions']);
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'the editor paints its own selection while focused');
    for (const svg of t.bar().querySelectorAll('svg')) {
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('focusable'), 'false');
    }
    await act(async () => t.editor.commands.setTextSelection(9));
    await t.flush();
    assert.ok(t.bar() === null, 'a caret hides the bar');
    await t.select(7, 12);
    await act(async () => document.querySelector('#outside').focus());
    await t.flush();
    assert.ok(t.bar() === null, 'focus outside the editor hides the bar');
    await t.select(7, 12);
    await t.render({ selectionInstruction: false });
    assert.deepEqual(t.names(), ['Improve', 'Explain', 'More actions'], 'selectionInstruction hides the field');
    await t.render({ selectionInstruction: false, selectionActions: [] });
    assert.ok(t.bar() === null, 'a bar with nothing to offer stays hidden');
    await t.render({ selectionInstruction: false });
    await t.render({ readOnly: true });
    assert.ok(t.bar() === null, 'read-only hides the bar');
    await t.render({ readOnly: false, disabled: true });
    assert.ok(t.bar() === null, 'disabled hides the bar');
    await t.render({ disabled: false });
    await t.select(7, 12);
    assert.ok(t.bar());
    await t.render({ onSelectionRequest: undefined });
    assert.ok(t.bar() === null, 'the bar is enabled by onSelectionRequest');
  } finally {
    await t.close();
  }
});

test('TextEditor selection actions send action and instruction requests with a snapshot of the selection', async () => {
  const requests = [];
  const t = await mountSelectionEditor({ onSelectionRequest: (request, actions) => { requests.push({ request, ...actions.selection }); } });
  try {
    await t.select(7, 16);
    await t.click('Improve');
    assert.deepEqual(requests.at(-1).request, { type: 'action', id: 'improve' });
    assert.equal(requests.at(-1).text, 'brave new');
    assert.deepEqual(requests.at(-1).document, { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'brave', marks: [{ type: 'bold' }] }, { type: 'text', text: ' new' },
    ] }] });

    await t.click('More actions');
    assert.equal(t.control('Show fewer actions').getAttribute('aria-expanded'), 'true');
    assert.deepEqual(t.names(), ['Improve', 'Explain', 'Shorten', 'Show fewer actions'], 'overflow actions replace the field inline');
    await t.click('Shorten');
    assert.deepEqual(requests.at(-1).request, { type: 'action', id: 'shorten' });
    assert.equal(t.control('More actions').getAttribute('aria-expanded'), 'false', 'sending collapses the bar');

    const field = t.control('Describe edits');
    await t.type(field, '  tighten this  ');
    assert.deepEqual(t.names(), ['Describe edits', 'Send'], 'typing replaces the actions with Send');
    const count = requests.length;
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) await t.key(field, 'Enter', init);
    assert.equal(requests.length, count, 'an IME confirmation does not send');
    await t.type(field, '   ');
    await t.key(field, 'Enter');
    assert.equal(requests.length, count, 'blank text does not send');
    await t.type(field, '  tighten this  ');
    await t.key(field, 'Enter');
    assert.deepEqual(requests.at(-1).request, { type: 'instruction', text: 'tighten this' });
    assert.equal(t.control('Describe edits').value, '');
    await t.type(t.control('Describe edits'), 'again');
    await t.click('Send');
    assert.deepEqual(requests.at(-1).request, { type: 'instruction', text: 'again' });
  } finally {
    await t.close();
  }
});

test('TextEditor selection review keeps, discards, and retries an applied edit', async () => {
  const requests = [];
  const t = await mountSelectionEditor({ onSelectionRequest: (request) => { requests.push(request); } });
  try {
    const original = t.json();
    await t.select(7, 12);
    await t.click('Improve');
    assert.equal(await t.apply('replace', 'plucky'), true);
    await t.flush();
    assert.equal(t.text(), 'Hello plucky new world');
    assert.deepEqual(t.blocks()[0].content[1], { type: 'text', text: 'plucky', marks: [{ type: 'bold' }] }, 'a string takes the marks at the start of the selection');
    assert.equal(t.bar().getAttribute('data-phase'), 'review');
    assert.deepEqual(t.names(), ['Keep', 'Discard', 'Try again']);
    assert.equal(document.querySelector('.muxui-text-editor__selection-range')?.textContent, 'plucky', 'the new content stays highlighted');
    assert.equal(t.status(), 'Edit ready to review');
    for (const svg of t.bar().querySelectorAll('svg')) assert.equal(svg.getAttribute('aria-hidden'), 'true');

    await t.click('Discard');
    assert.equal(t.json(), original, 'discard restores the original content exactly');
    assert.deepEqual([t.editor.state.selection.from, t.editor.state.selection.to], [7, 12], 'discard reselects the original range');
    assert.equal(t.editor.can().undo(), false, 'discard leaves no extra undo step');
    assert.equal(t.editor.can().redo(), true, 'discard acts like undo');
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'expected nothing');
    assert.deepEqual(t.names(), ['Describe edits', 'Improve', 'Explain', 'More actions']);
    assert.equal(t.session.actions.signal.aborted, true, 'ending a request aborts its signal');

    await t.click('Improve');
    await t.apply('replace', 'plucky');
    await t.flush();
    await t.click('Try again');
    assert.equal(t.json(), original, 'try again restores the original first');
    assert.deepEqual(requests.slice(-2), [{ type: 'action', id: 'improve' }, { type: 'action', id: 'improve' }], 'try again sends the same request');
    assert.equal(t.session.actions.selection.text, 'brave');
    assert.equal(await t.apply('replace', 'spry'), true);
    await t.flush();
    await t.click('Keep');
    assert.equal(t.text(), 'Hello spry new world');
    assert.ok(t.bar() === null, 'keep closes the bar, though the kept text stays selected');
    assert.equal(t.session.actions.signal.aborted, true);
    await act(async () => t.editor.commands.undo());
    assert.equal(t.json(), original, 'a kept edit undoes in one step');
  } finally {
    await t.close();
  }
});

test('TextEditor selection edits replace or insert strings and documents', async () => {
  const t = await mountSelectionEditor();
  const paragraph = (...content) => ({ type: 'paragraph', content });
  const doc = (...content) => ({ type: 'doc', content });
  const start = async () => {
    await t.select(7, 12);
    await t.click('Improve');
  };
  try {
    const original = t.json();
    await start();
    assert.equal(await t.apply('replace', doc(paragraph({ type: 'text', text: 'sturdy', marks: [{ type: 'italic' }] }))), true);
    assert.deepEqual(t.blocks(), [paragraph(
      { type: 'text', text: 'Hello ' }, { type: 'text', text: 'sturdy', marks: [{ type: 'italic' }] }, { type: 'text', text: ' new world' },
    )], 'a document keeps its own formatting and merges inline');
    assert.equal(await t.apply('replace', 'again'), false, 'only the first edit of a request applies');
    await t.click('Discard');
    assert.equal(t.json(), original);

    await start();
    assert.equal(await t.apply('replace', doc(paragraph({ type: 'text', text: 'one' }), paragraph({ type: 'text', text: 'two' }))), true);
    assert.deepEqual(t.blocks().map((block) => block.content.map((node) => node.text).join('')), ['Hello one', 'two new world']);
    await t.click('Discard');

    await start();
    assert.equal(await t.apply('replace', 'a\nb'), true);
    assert.deepEqual(t.blocks()[0].content.map((node) => node.type), ['text', 'text', 'hardBreak', 'text', 'text']);
    await t.click('Discard');

    await start();
    assert.equal(await t.apply('insertAfter', '!'), true);
    assert.equal(t.text(), 'Hello brave! new world', 'a string goes right after the selection');
    assert.equal(document.querySelector('.muxui-text-editor__selection-range')?.textContent, '!');
    assert.deepEqual([t.editor.state.selection.from, t.editor.state.selection.to], [7, 12], 'insertAfter leaves the selection in place');
    await t.click('Discard');
    assert.equal(t.json(), original);

    await start();
    assert.equal(await t.apply('insertAfter', doc(paragraph({ type: 'text', text: 'Added' }))), true);
    assert.deepEqual(t.blocks().map((block) => block.content.map((node) => node.text).join('')), ['Hello brave new world', 'Added'], 'a document goes after the block');
    await t.click('Discard');
    assert.equal(t.json(), original);

    await start();
    for (const invalid of [42, null, undefined, { type: 'paragraph' }]) assert.equal(await t.apply('replace', invalid), false);
    assert.equal(t.json(), original);
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
  } finally {
    await t.close();
  }
});

test('TextEditor selection edits are refused once stale, aborted, over the limit, or not editable', async () => {
  let changes = 0;
  const t = await mountSelectionEditor({ limit: 25, onChange: () => { changes += 1; }, onSelectionRequest: () => new Promise(() => {}) });
  try {
    const original = t.json();
    await t.select(7, 12);
    await t.click('Improve');
    const baseline = changes;
    assert.equal(await t.apply('replace', 'x'.repeat(10)), false, 'an edit over the limit is refused');
    assert.equal(t.json(), original);
    assert.equal(changes, baseline, 'a refused edit is never applied and reverted');
    assert.equal(t.bar().getAttribute('data-phase'), 'pending', 'no review state is entered');

    await act(async () => t.editor.commands.insertContentAt(1, '>>'));
    assert.equal(t.session.actions.signal.aborted, false, 'an edit outside the range keeps the request');
    assert.equal(await t.apply('replace', 'Q'), true);
    assert.equal(t.text(), '>>Hello Q new world', 'the range follows edits made before it');
    await t.click('Discard');
    assert.equal(t.text(), '>>Hello brave new world');

    await t.select(9, 14);
    await t.click('Improve');
    await act(async () => t.editor.commands.insertContentAt(11, 'X'));
    assert.equal(t.session.actions.signal.aborted, true, 'an edit inside the range makes the request stale');
    assert.equal(await t.apply('replace', 'Q'), false);
    await t.select(9, 14);
    assert.equal(t.bar().getAttribute('data-phase'), 'idle', 'a stale request leaves no pending bar');

    await t.click('Improve');
    await t.render({ readOnly: true });
    assert.equal(t.session.actions.signal.aborted, true, 'read-only ends the request');
    assert.equal(await t.apply('replace', 'Q'), false);
    assert.ok(t.bar() === null, 'expected nothing');
    await t.render({ readOnly: false });

    // A controlled value that changes under the request makes it stale.
    const changed = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello there new world' }] }] };
    await t.render({ value: selectionDocument, defaultValue: undefined });
    await t.select(7, 12);
    await t.click('Improve');
    assert.equal(t.session.actions.signal.aborted, false);
    await t.render({ value: changed, defaultValue: undefined });
    assert.equal(t.session.actions.signal.aborted, true, 'a controlled value change makes the request stale');
    assert.equal(await t.apply('replace', 'Q'), false);
    assert.equal(t.text(), 'Hello there new world');
    await t.render({ value: undefined, defaultValue: changed });

    await t.select(9, 14);
    await t.click('Improve');
    await t.key(t.pm, 'Escape');
    assert.equal(t.session.actions.signal.aborted, true, 'Escape aborts the request');
    assert.equal(await t.apply('replace', 'Q'), false);
    await t.select(9, 14);
    await t.click('Improve');
    const closing = t.session.actions;
    await act(async () => closing.close());
    await t.flush();
    assert.equal(closing.signal.aborted, true);
    assert.ok(t.bar() === null, 'close() hides the bar until the selection changes');
    await t.select(9, 14);
    assert.ok(t.bar() === null, 'the same selection keeps it hidden');
    await t.select(1, 5);
    assert.ok(t.bar(), 'a new selection shows it again');
  } finally {
    await t.close();
  }
});

test('TextEditor selection requests show pending, cancel through the signal, and report failures', async () => {
  const pending = [];
  const t = await mountSelectionEditor({ onSelectionRequest: (request, actions) => new Promise((resolve, reject) => { pending.push({ request, actions, resolve, reject }); }) });
  try {
    await t.select(7, 12);
    await t.click('Improve');
    assert.equal(t.bar().getAttribute('data-phase'), 'pending');
    assert.equal(t.bar().getAttribute('aria-busy'), 'true');
    assert.equal(t.bar().textContent, 'Improving…Cancel', 'an action can name its pending text');
    assert.equal(t.status(), 'Improving…', 'a polite live region announces the pending state');
    assert.equal(document.querySelector('[role="status"]').getAttribute('aria-live'), 'polite');

    await t.click('Cancel');
    assert.equal(pending[0].actions.signal.aborted, true);
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
    assert.ok(document.activeElement === t.pm, 'cancel returns focus to the editor');
    pending[0].reject(new Error('late'));
    await t.flush();
    assert.equal(t.bar().getAttribute('data-phase'), 'idle', 'an aborted request reports no failure');

    await t.click('Explain');
    assert.equal(t.bar().textContent, 'Editing…Cancel', 'the default pending text');
    pending[1].reject(new Error('offline'));
    await t.flush();
    assert.equal(t.bar().getAttribute('data-phase'), 'error');
    assert.deepEqual(t.names(), ['Try again', 'Dismiss']);
    assert.match(t.bar().textContent, /Couldn't complete the edit/u);
    assert.equal(t.status(), "Couldn't complete the edit");
    await t.click('Try again');
    assert.deepEqual(pending[2].request, { type: 'action', id: 'explain' }, 'try again resends the request');
    assert.equal(pending[2].actions.selection.text, 'brave');
    pending[2].resolve();
    await t.flush();
    assert.equal(t.bar().getAttribute('data-phase'), 'idle', 'a request that applies nothing returns to the bar');

    await t.click('Explain');
    pending[3].reject(new Error('offline'));
    await t.flush();
    await t.click('Dismiss');
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
    assert.equal(pending[3].actions.signal.aborted, true);
    assert.equal(t.status(), '');
  } finally {
    await t.close();
  }
});

test('TextEditor selection bar keyboard entry, roving, and Escape', async () => {
  const t = await mountSelectionEditor();
  try {
    await t.select(7, 12);
    await t.key(t.pm, 'F10', { altKey: true });
    assert.ok(document.activeElement === t.control('Describe edits'), 'Alt+F10 moves focus into the bar');
    assert.equal(document.querySelector('.muxui-text-editor__selection-range')?.textContent, 'brave', 'the range stays painted while focus is in the bar');

    const focused = () => document.activeElement.getAttribute('aria-label') ?? document.activeElement.textContent.trim();
    const sequence = [];
    await t.key(document.activeElement, 'ArrowRight');
    sequence.push(focused());
    await t.key(document.activeElement, 'ArrowRight');
    sequence.push(focused());
    await t.key(document.activeElement, 'ArrowRight');
    sequence.push(focused());
    await t.key(document.activeElement, 'ArrowRight');
    sequence.push(focused());
    await t.key(document.activeElement, 'ArrowLeft');
    sequence.push(focused());
    await t.key(document.activeElement, 'Home');
    sequence.push(focused());
    await t.key(document.activeElement, 'End');
    sequence.push(focused());
    await act(async () => t.control('Explain').focus());
    await t.key(document.activeElement, 'End');
    sequence.push(focused());
    assert.deepEqual(sequence, ['Improve', 'Explain', 'More actions', 'More actions', 'Explain', 'Describe edits', 'Describe edits', 'More actions'], 'Home and End stay with the caret inside the field');

    const field = t.control('Describe edits');
    await act(async () => field.focus());
    await t.type(field, 'ab');
    field.setSelectionRange(1, 1);
    await t.key(field, 'ArrowRight');
    assert.ok(document.activeElement === field, 'arrows move the caret inside the field');
    field.setSelectionRange(2, 2);
    await t.key(field, 'ArrowRight');
    assert.ok(document.activeElement === t.control('Send'), 'the caret at the end hands focus to the next control');
    await t.type(field, '');

    await t.key(document.activeElement, 'Escape');
    assert.ok(document.activeElement === t.pm, 'Escape returns focus to the editor');
    assert.deepEqual([t.editor.state.selection.from, t.editor.state.selection.to], [7, 12], 'the selection stays intact');
    assert.ok(t.bar(), 'the bar stays while the selection stays');
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'expected nothing');

    await t.key(t.pm, 'F10', { altKey: true });
    await t.key(document.activeElement, 'Tab');
    assert.ok(document.activeElement === t.pm, 'Tab leaves the bar for the editor');

    await t.key(t.pm, 'Escape');
    assert.ok(t.bar() === null, 'Escape in the editor hides the bar');
    await t.select(1, 5);
    assert.ok(t.bar(), 'a new selection shows the bar again');
  } finally {
    await t.close();
  }
});

test('TextEditor selectionActions need unique ids and nonempty labels', async () => {
  const t = await mountSelectionEditor();
  const consoleError = console.error;
  console.error = () => {};
  try {
    await t.select(7, 12);
    await assert.rejects(async () => { await t.render({ selectionActions: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }); }, /unique id/u);
  } finally {
    console.error = consoleError;
    await t.close();
  }
});

test('TextEditor selection requests go stale when formatting changes the selected range', async () => {
  const t = await mountSelectionEditor({ onSelectionRequest: () => new Promise(() => {}) });
  try {
    // Mark steps leave every position where it was, so only the range's content shows the change.
    await t.select(7, 12);
    await t.click('Improve');
    await act(async () => { t.editor.chain().setTextSelection({ from: 7, to: 12 }).toggleItalic().run(); });
    assert.equal(t.session.actions.signal.aborted, true, 'italicizing the selection makes the request stale');
    assert.equal(await t.apply('replace', 'plucky'), false);
    assert.deepEqual(t.blocks()[0].content[1], { type: 'text', text: 'brave', marks: [{ type: 'bold' }, { type: 'italic' }] }, 'the new formatting is not overwritten');

    await t.select(1, 5);
    await t.click('Improve');
    await act(async () => { t.editor.chain().setTextSelection({ from: 1, to: 5 }).setTextAlign('center').run(); });
    assert.equal(t.session.actions.signal.aborted, true, 'changing the block alignment makes the request stale');

    await t.select(13, 16);
    await t.click('Improve');
    await act(async () => { t.editor.chain().setTextSelection({ from: 1, to: 5 }).toggleUnderline().run(); });
    assert.equal(t.session.actions.signal.aborted, false, 'formatting elsewhere keeps the request');
    assert.equal(await t.apply('replace', 'old'), true);
    assert.equal(t.text(), 'Hello brave old world');
  } finally {
    await t.close();
  }
});

test('TextEditor selection edits refuse an invalid document without touching the content', async () => {
  const t = await mountSelectionEditor();
  try {
    const original = t.json();
    await t.select(7, 12);
    await t.click('Improve');
    for (const mode of ['replace', 'insertAfter']) {
      assert.equal(await t.apply(mode, { type: 'doc', content: [{ type: 'text', text: 'invalid root' }] }), false, `${mode} refuses text at the root`);
      assert.equal(await t.apply(mode, { type: 'doc', content: [] }), false, `${mode} refuses an empty document`);
    }
    assert.equal(t.json(), original, 'the selection is not erased');
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
    assert.equal(await t.apply('replace', t.session.actions.selection.document), true, 'the snapshot document is valid content');
    assert.equal(t.text(), 'Hello brave new world');
  } finally {
    await t.close();
  }
});

test('TextEditor selection edits apply once even when the change handler calls replace again', async () => {
  let armed = false;
  let reentrant;
  let t;
  t = await mountSelectionEditor({ onChange: () => { if (armed) { armed = false; reentrant = t.session.actions.replace('again'); } } });
  try {
    const original = t.json();
    await t.select(7, 12);
    await t.click('Improve');
    armed = true;
    assert.equal(await t.apply('replace', 'plucky'), true);
    assert.equal(reentrant, false, 'a replace from onChange is refused');
    assert.equal(t.text(), 'Hello plucky new world');
    await t.click('Discard');
    assert.equal(t.json(), original);
    assert.equal(t.editor.can().undo(), false, 'discard leaves no extra undo step');
    assert.equal(t.editor.can().redo(), true, 'discard keeps redo');
    await act(async () => t.editor.commands.redo());
    assert.equal(t.text(), 'Hello plucky new world');
  } finally {
    await t.close();
  }
});

test('TextEditor selection bar ignores keys that drive an IME composition', async () => {
  const t = await mountSelectionEditor();
  try {
    await t.select(7, 12);
    await t.key(t.pm, 'F10', { altKey: true });
    const field = t.control('Describe edits');
    for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
      await t.key(field, 'ArrowRight', init);
      assert.ok(document.activeElement === field, 'an arrow during composition stays in the field');
      await t.key(field, 'Escape', init);
      assert.ok(document.activeElement === field, 'Escape during composition stays in the field');
    }
    await t.key(field, 'Escape');
    assert.ok(document.activeElement === t.pm, 'Escape after composition returns to the editor');
  } finally {
    await t.close();
  }
});

test('TextEditor selection bar keeps the editor runtime scope and direction', async () => {
  const t = await mountSelectionEditor({ scope: 'data-muxui-color-scheme="dark" data-muxui-direction="rtl" dir="rtl"' });
  try {
    await t.select(7, 12);
    const scoped = document.querySelector('#root');
    assert.ok(t.bar().closest('[data-muxui-color-scheme]') === scoped, 'the bar renders inside the scoped dark subtree');
    assert.equal(t.bar().getAttribute('dir'), 'rtl', 'the bar takes the editor direction, not the popover locale direction');
    await t.render({ scope: undefined });
  } finally {
    await t.close();
  }
  const plain = await mountSelectionEditor();
  try {
    await plain.select(7, 12);
    assert.ok(plain.bar().closest('#root') === null, 'an unscoped editor portals to the page as before');
    assert.equal(plain.bar().getAttribute('dir'), 'ltr');
  } finally {
    await plain.close();
  }
});

test('TextEditor selection edits insert plain text with the formatting at the selection start', async () => {
  const t = await mountSelectionEditor();
  try {
    // " brave" starts in plain text and ends in bold; the inserted text follows the start.
    await t.select(6, 12);
    await t.click('Improve');
    assert.equal(await t.apply('insertAfter', '!'), true);
    // Plain text merges with the plain text after it; bold text would stay a node of its own.
    assert.deepEqual(t.blocks()[0].content.find((node) => node.text?.startsWith('!')), { type: 'text', text: '! new world' });
  } finally {
    await t.close();
  }
});

test('TextEditor selection bar removes its painted range when the request callback goes away', async () => {
  const t = await mountSelectionEditor({ onSelectionRequest: () => new Promise(() => {}) });
  try {
    await t.select(7, 12);
    await t.key(t.pm, 'F10', { altKey: true });
    assert.equal(document.querySelector('.muxui-text-editor__selection-range')?.textContent, 'brave', 'focus in the bar paints the range');
    await t.render({ onSelectionRequest: undefined });
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'removing the callback clears the paint');

    await t.render({ onSelectionRequest: () => new Promise(() => {}) });
    await t.select(7, 12);
    await t.click('Improve');
    const { signal } = t.session.actions;
    assert.equal(document.querySelector('.muxui-text-editor__selection-range')?.textContent, 'brave', 'a pending request paints the range');
    await t.render({ onSelectionRequest: undefined });
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'removing the callback mid-request clears the paint');
    assert.equal(signal.aborted, true);
    assert.ok(t.bar() === null, 'expected nothing');
  } finally {
    await t.close();
  }
});

test('TextEditor selection close keeps an applied edit and ignores a finished request', async () => {
  const requests = [];
  const t = await mountSelectionEditor({ onSelectionRequest: (request, actions) => { requests.push(actions); return new Promise(() => {}); } });
  try {
    await t.select(7, 12);
    await t.click('Improve');
    assert.equal(await t.apply('replace', 'plucky'), true);
    await act(async () => requests[0].close());
    assert.equal(t.text(), 'Hello plucky new world', 'close keeps the applied edit');
    assert.ok(t.bar() === null, 'close hides the review bar');
    assert.ok(document.querySelector('.muxui-text-editor__selection-range') === null, 'expected nothing');

    await t.select(1, 5);
    await t.click('Improve');
    await t.click('Cancel');
    await t.click('Explain');
    assert.equal(requests.length, 3);
    await act(async () => requests[1].close());
    assert.equal(requests[2].signal.aborted, false, 'closing a finished request leaves the current one running');
    assert.equal(t.bar().getAttribute('data-phase'), 'pending');
  } finally {
    await t.close();
  }
});

test('TextEditor selection bar portals into a theme preset scope that has no mode attribute', async () => {
  const t = await mountSelectionEditor({ scope: 'data-muxui-theme="standard-harbour"' });
  try {
    await t.select(7, 12);
    assert.ok(t.bar().closest('[data-muxui-theme]') === document.querySelector('#root'), 'the bar renders inside the preset scope');
  } finally {
    await t.close();
  }
});

test('TextEditor selection dismissal ends at the first selection change, including a collapse', async () => {
  const t = await mountSelectionEditor({ onSelectionRequest: () => new Promise(() => {}) });
  try {
    // close() on one range, then another range, then the first again.
    await t.select(7, 12);
    await t.click('Improve');
    await act(async () => t.session.actions.close());
    assert.ok(t.bar() === null, 'close hides the bar');
    await t.select(1, 5);
    assert.ok(t.bar() !== null, 'another selection shows the bar');
    await t.select(7, 12);
    assert.ok(t.bar() !== null, 'returning to the first range shows it again');

    // A collapse is a selection change too.
    await t.click('Improve');
    await act(async () => t.session.actions.close());
    assert.ok(t.bar() === null);
    await act(async () => t.editor.commands.setTextSelection(9));
    await t.flush();
    await t.select(7, 12);
    assert.ok(t.bar() !== null, 'collapsing and reselecting shows the bar');

    // Escape at rest dismisses the same way.
    await t.key(t.pm, 'Escape');
    assert.ok(t.bar() === null, 'Escape hides the bar');
    await t.select(1, 5);
    await t.select(7, 12);
    assert.ok(t.bar() !== null, 'Escape lasts only until the selection changes');
  } finally {
    await t.close();
  }
});

test('Resizable maintains pair totals, RTL keyboard direction, and cancels pointer commits', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  const changes = [];
  const commits = [];
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Resizable, { defaultSizes: { left: 50, right: 50 }, onSizesChange: (next) => changes.push(next), onSizesCommit: (next) => commits.push(next) }, React.createElement(ResizablePanel, { id: 'left', minSize: 10, maxSize: 55 }, 'Left'), React.createElement(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize' }), React.createElement(ResizablePanel, { id: 'right', minSize: 10, maxSize: 90 }, 'Right'))));
    const container = document.querySelector('.muxui-resizable');
    container.getBoundingClientRect = () => ({ width: 1_000, height: 200, top: 0, left: 0, right: 1_000, bottom: 200 });
    const handle = document.querySelector('[data-handle-id="split"]');
    const props = reactProps(handle);
    await act(async () => {
      props.onPointerDown({ button: 0, pointerId: 1, clientX: 500, currentTarget: handle });
      props.onPointerMove({ pointerId: 1, clientX: 700, currentTarget: handle });
      props.onPointerUp({ pointerId: 1, currentTarget: handle });
    });
    assert.equal(changes.at(-1).left + changes.at(-1).right, 100);
    assert.equal(changes.at(-1).left, 55);
    assert.equal(commits.length, 1);
    document.documentElement.dir = 'rtl';
    await act(async () => reactProps(document.querySelector('[data-handle-id="split"]')).onKeyDown({ key: 'ArrowRight', shiftKey: false, preventDefault() {}, defaultPrevented: false }));
    assert.equal(changes.at(-1).left, 54);
    const commitCount = commits.length;
    await act(async () => {
      const fresh = document.querySelector('[data-handle-id="split"]');
      const freshProps = reactProps(fresh);
      freshProps.onPointerDown({ button: 0, pointerId: 2, clientX: 500, currentTarget: fresh });
      freshProps.onPointerMove({ pointerId: 2, clientX: 600, currentTarget: fresh });
      freshProps.onPointerCancel({ pointerId: 2 });
    });
    assert.equal(commits.length, commitCount);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

// Mounts a Resizable of two panels (the first from `minLeft`, both to 90) with the recorded callbacks and key and pointer helpers.
// `show` maps each change to the sizes a controlled parent displays; `update` re-renders with new Resizable props or `minLeft`.
// `layout(sizes)` runs in the parent's layout effect, and `afterCommit(controls)` inside onSizesCommit, where `controls.lock()` disables the Resizable synchronously.
async function mountResizable({ orientation = 'horizontal', dir = 'ltr', controlled = false, start = { left: 50, right: 50 }, show = (next) => next, layout, afterCommit, ...initial } = {}) {
  const dom = new JSDOM(`<!doctype html><html dir="${dir}"><body><div id="root"></div></body></html>`);
  const restore = installDom(dom);
  const changes = [];
  const commits = [];
  const root = createRoot(document.querySelector('#root'));
  const controls = {};
  function Harness({ minLeft, ...props }) {
    const [sizes, setSizes] = React.useState(start);
    const [locked, setLocked] = React.useState(false);
    controls.setSizes = setSizes;
    controls.lock = () => flushSync(() => setLocked(true));
    React.useLayoutEffect(() => layout?.(sizes), [sizes]);
    return React.createElement(Resizable, {
      orientation,
      ...props,
      ...(locked ? { disabled: true } : {}),
      ...(controlled ? { sizes } : { defaultSizes: start }),
      onSizesChange: (next, meta) => { changes.push({ left: next.left, source: meta.source }); if (controlled) setSizes(show(next)); },
      onSizesCommit: (next, meta) => { commits.push({ left: next.left, source: meta.source }); afterCommit?.(controls); },
    }, React.createElement(ResizablePanel, { id: 'left', minSize: minLeft, maxSize: 90 }, 'Left'), React.createElement(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize' }), React.createElement(ResizablePanel, { id: 'right', minSize: 10, maxSize: 90 }, 'Right'));
  }
  let settings = { minLeft: 10, ...initial };
  const render = () => act(async () => root.render(React.createElement(Harness, settings)));
  await render();
  document.querySelector('.muxui-resizable').getBoundingClientRect = () => ({ width: 1_000, height: 1_000, top: 0, left: 0, right: 1_000, bottom: 1_000 });
  const handle = () => document.querySelector('[data-handle-id="split"]');
  return {
    changes,
    commits,
    value: () => Number(handle().getAttribute('aria-valuenow')),
    update: (next) => { settings = { ...settings, ...next }; return render(); },
    setSizes: (next) => act(async () => controls.setSizes(next)),
    key: (key, shiftKey = false) => act(async () => reactProps(handle()).onKeyDown({ key, shiftKey, preventDefault() {}, defaultPrevented: false })),
    pointer: (type, point = 500, pointerId = 1) => act(async () => reactProps(handle())[type]({ button: 0, pointerId, clientX: point, clientY: point, currentTarget: handle() })),
    resizeWindow: () => act(async () => { window.dispatchEvent(new window.Event('resize')); }),
    async close() {
      await act(async () => root.unmount());
      restore();
      dom.window.close();
    },
  };
}

// Back is ArrowUp when vertical and ArrowLeft when horizontal, and it grows the first panel in right-to-left.
const keyLayouts = [
  { orientation: 'horizontal', dir: 'ltr', back: 'ArrowLeft', forward: 'ArrowRight', grows: -1 },
  { orientation: 'vertical', dir: 'ltr', back: 'ArrowUp', forward: 'ArrowDown', grows: -1 },
  { orientation: 'horizontal', dir: 'rtl', back: 'ArrowLeft', forward: 'ArrowRight', grows: 1 },
];
for (const { orientation, dir, back, forward, grows } of keyLayouts) {
  test(`Resizable Page Up and Page Down move a ${orientation} ${dir} handle like ${back} and ${forward}, and Home and End reach the pair bounds`, async () => {
    const resizable = await mountResizable({ orientation, dir });
    try {
      const press = async (key, shiftKey = false) => {
        const before = resizable.value();
        await resizable.key(key, shiftKey);
        return resizable.value() - before;
      };
      const backStep = await press(back, true);
      const forwardStep = await press(forward, true);
      assert.equal(backStep, 10 * grows, `Shift+${back} moves 10`);
      assert.equal(forwardStep, -10 * grows, `Shift+${forward} moves 10 the other way`);
      assert.equal(await press('PageUp'), backStep, `Page Up follows ${back}`);
      assert.equal(await press('PageDown'), forwardStep, `Page Down follows ${forward}`);
      await resizable.key('Home');
      assert.equal(resizable.value(), 10, 'Home gives the first panel its smallest size');
      await resizable.key('End');
      assert.equal(resizable.value(), 90, 'End gives the first panel its largest size');
    } finally {
      await resizable.close();
    }
  });
}

for (const controlled of [false, true]) {
  for (const cancelEvent of ['onPointerCancel', 'onLostPointerCapture']) {
    test(`Resizable restores the sizes from before a drag on ${cancelEvent} (${controlled ? 'controlled' : 'uncontrolled'})`, async () => {
      const resizable = await mountResizable({ controlled });
      try {
        await resizable.pointer('onPointerDown', 500);
        await resizable.pointer('onPointerMove', 600);
        await resizable.pointer('onPointerMove', 700);
        assert.equal(resizable.value(), 70);
        await resizable.pointer(cancelEvent);
        assert.equal(resizable.value(), 50);
        assert.deepEqual(resizable.changes, [{ left: 60, source: 'pointer' }, { left: 70, source: 'pointer' }, { left: 50, source: 'pointer' }]);
        assert.deepEqual(resizable.commits, []);
        // The browser can follow a cancel with the other event; the drag is already over.
        await resizable.pointer(cancelEvent === 'onPointerCancel' ? 'onLostPointerCapture' : 'onPointerCancel');
        assert.equal(resizable.changes.length, 3);
        // The next drag starts from the restored sizes and commits normally.
        await resizable.pointer('onPointerDown', 500);
        await resizable.pointer('onPointerMove', 600);
        await resizable.pointer('onPointerUp', 600);
        assert.equal(resizable.value(), 60);
        assert.deepEqual(resizable.commits, [{ left: 60, source: 'pointer' }]);
      } finally {
        await resizable.close();
      }
    });
  }
}

test('Resizable keeps a finished drag when the browser then reports lost pointer capture', async () => {
  const resizable = await mountResizable();
  try {
    await resizable.pointer('onPointerDown', 500);
    await resizable.pointer('onPointerMove', 700);
    await resizable.pointer('onPointerUp', 700);
    await resizable.pointer('onLostPointerCapture');
    assert.equal(resizable.value(), 70);
    assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }]);
    assert.deepEqual(resizable.commits, [{ left: 70, source: 'pointer' }]);
  } finally {
    await resizable.close();
  }
});

test('Resizable reports no restore when a cancelled drag has nothing to restore', async () => {
  const unmoved = await mountResizable();
  try {
    await unmoved.pointer('onPointerDown', 500);
    await unmoved.pointer('onPointerCancel');
    assert.deepEqual(unmoved.changes, []);
  } finally {
    await unmoved.close();
  }
  const returned = await mountResizable();
  try {
    await returned.pointer('onPointerDown', 500);
    await returned.pointer('onPointerMove', 700);
    await returned.pointer('onPointerMove', 500);
    await returned.pointer('onPointerCancel');
    assert.deepEqual(returned.changes, [{ left: 70, source: 'pointer' }, { left: 50, source: 'pointer' }]);
  } finally {
    await returned.close();
  }
});

for (const controlled of [false, true]) {
  const mode = controlled ? 'controlled' : 'uncontrolled';
  test(`Resizable ignores pointer events from other pointers during a drag (${mode})`, async () => {
    const resizable = await mountResizable({ controlled });
    try {
      await resizable.pointer('onPointerDown', 500, 1);
      await resizable.pointer('onPointerMove', 700, 1);
      // A second pointer cannot start a gesture, and its events leave the first pointer's gesture running.
      await resizable.pointer('onPointerDown', 300, 2);
      for (const type of ['onPointerMove', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture']) await resizable.pointer(type, 100, 2);
      assert.equal(resizable.value(), 70);
      assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }]);
      assert.deepEqual(resizable.commits, []);
      await resizable.pointer('onPointerMove', 800, 1);
      await resizable.pointer('onPointerUp', 800, 1);
      assert.equal(resizable.value(), 80);
      assert.deepEqual(resizable.commits, [{ left: 80, source: 'pointer' }]);
    } finally {
      await resizable.close();
    }
  });

  test(`Resizable skips the restore when the starting sizes no longer fit once rounded (${mode})`, async () => {
    const resizable = await mountResizable({ controlled, start: { left: 50.49, right: 49.51 }, minLeft: 50.1 });
    try {
      await resizable.pointer('onPointerDown', 500);
      await resizable.pointer('onPointerMove', 600);
      assert.equal(resizable.value(), 60.49);
      // At precision 0 the starting 50.49 rounds to 50, below the first panel's minimum of 50.1.
      await resizable.update({ precision: 0 });
      await resizable.pointer('onPointerCancel');
      assert.deepEqual(resizable.changes, [{ left: 60.49, source: 'pointer' }]);
      assert.deepEqual(resizable.commits, []);
    } finally {
      await resizable.close();
    }
  });

  const interruptions = [
    ['a window resize', (resizable) => resizable.resizeWindow()],
    ['becoming disabled', (resizable) => resizable.update({ disabled: true })],
    ['becoming read-only', (resizable) => resizable.update({ readOnly: true })],
  ];
  for (const [name, interrupt] of interruptions) {
    test(`Resizable restores the sizes from before a drag on ${name} (${mode})`, async () => {
      const resizable = await mountResizable({ controlled });
      try {
        await resizable.pointer('onPointerDown', 500);
        await resizable.pointer('onPointerMove', 700);
        assert.equal(resizable.value(), 70);
        await interrupt(resizable);
        assert.equal(resizable.value(), 50);
        assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }, { left: 50, source: 'pointer' }]);
        // The pointer events that follow find the drag already over.
        await resizable.pointer('onPointerUp', 700);
        await resizable.pointer('onLostPointerCapture', 700);
        assert.equal(resizable.changes.length, 2);
        assert.deepEqual(resizable.commits, []);
      } finally {
        await resizable.close();
      }
    });
  }
}

test('Resizable reports nothing when it unmounts mid-drag or a controlled parent shows other sizes', async () => {
  const unmounting = await mountResizable();
  try {
    await unmounting.pointer('onPointerDown', 500);
    await unmounting.pointer('onPointerMove', 700);
  } finally {
    await unmounting.close();
  }
  assert.deepEqual(unmounting.changes, [{ left: 70, source: 'pointer' }]);
  assert.deepEqual(unmounting.commits, []);
  const adjusting = await mountResizable({ controlled: true, show: () => ({ left: 60, right: 40 }) });
  try {
    await adjusting.pointer('onPointerDown', 500);
    await adjusting.pointer('onPointerMove', 700);
    await adjusting.pointer('onPointerCancel');
    assert.equal(adjusting.value(), 60);
    assert.deepEqual(adjusting.changes, [{ left: 70, source: 'pointer' }]);
    assert.deepEqual(adjusting.commits, []);
  } finally {
    await adjusting.close();
  }
});

test('Resizable keeps an invalid Handle inert when pointer and key events reach it', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  const restore = installDom(dom);
  const root = createRoot(document.querySelector('#root'));
  try {
    // A Handle without its required id makes the layout invalid.
    await act(async () => root.render(React.createElement(Resizable, { defaultSizes: { left: 50, right: 50 } }, React.createElement(ResizablePanel, { id: 'left' }), React.createElement(ResizableHandle, { before: 'left', after: 'right', 'aria-label': 'Resize' }), React.createElement(ResizablePanel, { id: 'right' }))));
    const handle = document.querySelector('.muxui-resizable-handle');
    assert.equal(handle.getAttribute('aria-disabled'), 'true');
    const props = reactProps(handle);
    const pointerEvent = { button: 0, pointerId: 1, clientX: 5, clientY: 5, currentTarget: handle };
    for (const type of ['onPointerDown', 'onPointerMove', 'onPointerUp', 'onPointerCancel', 'onLostPointerCapture']) assert.doesNotThrow(() => props[type](pointerEvent), type);
    assert.doesNotThrow(() => props.onKeyDown({ key: 'ArrowRight', shiftKey: false, preventDefault() {}, defaultPrevented: false }));
  } finally {
    await act(async () => root.unmount());
    restore();
    dom.window.close();
  }
});

for (const controlled of [false, true]) {
  test(`Resizable keeps a committed drag when onSizesCommit disables it synchronously (${controlled ? 'controlled' : 'uncontrolled'})`, async () => {
    const resizable = await mountResizable({ controlled, afterCommit: (controls) => controls.lock() });
    try {
      await resizable.pointer('onPointerDown', 500);
      await resizable.pointer('onPointerMove', 700);
      await resizable.pointer('onPointerUp', 700);
      assert.equal(resizable.value(), 70);
      assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }]);
      assert.deepEqual(resizable.commits, [{ left: 70, source: 'pointer' }]);
    } finally {
      await resizable.close();
    }
  });
}

test('Resizable leaves sizes a controlled parent set before the first move alone', async () => {
  const resizable = await mountResizable({ controlled: true });
  try {
    await resizable.pointer('onPointerDown', 500);
    await resizable.setSizes({ left: 60, right: 40 });
    await resizable.pointer('onPointerMove', 700);
    await resizable.pointer('onPointerCancel');
    assert.equal(resizable.value(), 60);
    assert.deepEqual(resizable.changes, []);
    assert.deepEqual(resizable.commits, []);
  } finally {
    await resizable.close();
  }
});

test('Resizable does not restore over sizes a controlled parent substituted, even from the parent\'s layout effect', async () => {
  const resizable = await mountResizable({
    controlled: true,
    show: () => ({ left: 60, right: 40 }),
    layout: (sizes) => { if (sizes.left === 60) window.dispatchEvent(new window.Event('resize')); },
  });
  try {
    await resizable.pointer('onPointerDown', 500);
    await resizable.pointer('onPointerMove', 700);
    assert.equal(resizable.value(), 60);
    assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }]);
    await resizable.pointer('onPointerCancel');
    assert.deepEqual(resizable.changes, [{ left: 70, source: 'pointer' }]);
    assert.deepEqual(resizable.commits, []);
  } finally {
    await resizable.close();
  }
});

test('Resizable rejects simultaneous controlled and default sizes at runtime', () => {
  const html = renderToStaticMarkup(React.createElement(Resizable, { sizes: { left: 50, right: 50 }, defaultSizes: { left: 40, right: 60 } }, React.createElement(ResizablePanel, { id: 'left' }), React.createElement(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize' }), React.createElement(ResizablePanel, { id: 'right' })));
  assert.match(html, /data-muxui-state-invalid="true"/u);
});

test('Lightbox derives its dialog label, selects the first default item, navigates, and restores focus', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    root = createRoot(document.querySelector('#root'));
    const items = [{ key: 'one', label: 'First' }, { key: 'two', label: 'Second' }];
    await act(async () => root.render(React.createElement(Lightbox, { items, defaultOpen: true },
      React.createElement(LightboxTrigger, { itemKey: 'one' }, 'Open'),
      React.createElement(LightboxBackdrop, null, React.createElement(LightboxPopup, null,
        React.createElement(LightboxContent, { renderContent: ({ item }) => React.createElement('span', null, item.label) }),
        React.createElement(LightboxClose, null))))));
    assert.ok(document.querySelector('[role="dialog"][aria-label="First"]'));
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /First/u);
    const trigger = document.querySelector('.muxui-lightbox-trigger');
    await act(async () => { trigger.focus(); trigger.click(); });
    const popup = document.querySelector('.muxui-lightbox-popup');
    await act(async () => popup.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /Second/u);
    await act(async () => document.querySelector('.muxui-lightbox-close').click());
    await act(async () => Promise.resolve());
    assert.equal(document.querySelector('[role="dialog"]') === null, true, 'close removes the dialog');
    assert.equal(document.activeElement, trigger);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Lightbox maps a left swipe to previous in RTL', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  try {
    document.documentElement.dir = 'rtl';
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Lightbox, { items: [{ key: 'one', label: 'First' }, { key: 'two', label: 'Second' }], defaultOpen: true, defaultSelectedKey: 'two', loop: true, renderContent: (item) => item.label }, React.createElement(LightboxBackdrop, null, React.createElement(LightboxPopup, null, React.createElement(LightboxContent, null))))));
    const popup = document.querySelector('.muxui-lightbox-popup');
    const touchEvent = (type, points) => {
      const event = new window.Event(type, { bubbles: true });
      Object.defineProperty(event, type === 'touchstart' ? 'touches' : 'changedTouches', { value: points });
      return event;
    };
    await act(async () => {
      popup.dispatchEvent(touchEvent('touchstart', [{ clientX: 100 }]));
      popup.dispatchEvent(touchEvent('touchend', [{ clientX: 20 }]));
    });
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /First/u);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Lightbox repeats controlled interaction requests and restores focus after actual close', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>');
  const restore = installDom(dom);
  let root;
  let acceptOpen = false;
  const openChanges = [];
  const selectedChanges = [];
  function Harness() {
    const [open, setOpen] = React.useState(true);
    const [selectedKey, setSelectedKey] = React.useState('one');
    return React.createElement(Lightbox, {
      items: [{ key: 'one', label: 'First' }, { key: 'two', label: 'Second' }],
      open,
      selectedKey,
      loop: true,
      onOpenChange: (next) => { openChanges.push(next); if (acceptOpen) setOpen(next); },
      onSelectedChange: (next) => { selectedChanges.push(next); if (acceptOpen) setSelectedKey(next); },
    }, React.createElement(LightboxTrigger, { itemKey: 'one' }, 'Open'), React.createElement(LightboxBackdrop, null,
      React.createElement(LightboxPopup, null,
        React.createElement(LightboxContent, { renderContent: ({ item }) => React.createElement('span', null, item.label) }),
        React.createElement(LightboxNext, { 'aria-label': 'Next image' }),
        React.createElement(LightboxClose, null))));
  }
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(Harness)));
    const trigger = document.querySelector('.muxui-lightbox-trigger');
    await act(async () => trigger.focus());
    await act(async () => trigger.click());
    const next = document.querySelector('.muxui-lightbox-next');
    await act(async () => next.click());
    await act(async () => next.click());
    assert.deepEqual(selectedChanges, ['two', 'two']);
    assert.match(document.querySelector('[role="dialog"]')?.textContent ?? '', /First/u);

    const close = document.querySelector('.muxui-lightbox-close');
    await act(async () => close.focus());
    await act(async () => close.click());
    await act(async () => Promise.resolve());
    assert.deepEqual(openChanges, [false]);
    assert.equal(Boolean(document.activeElement?.closest('[role="dialog"]')), true, 'rejected close keeps focus inside the dialog');

    acceptOpen = true;
    await act(async () => close.click());
    await act(async () => Promise.resolve());
    assert.deepEqual(openChanges, [false, false]);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});
