import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { Markdown } from '../src/markdown/index.mjs';
import { TextEditor, isTextEditorDocument, normalizeTextEditorDocument } from '../src/text-editor/index.mjs';
import { Resizable, ResizableHandle, ResizablePanel } from '../src/supplemental/resizable.mjs';
import { Lightbox, LightboxBackdrop, LightboxClose, LightboxContent, LightboxNext, LightboxPopup, LightboxTrigger } from '../src/supplemental/lightbox.mjs';
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
test('Markdown returns its fallback for source and line bounds', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, { source: 'x'.repeat(100_001), invalidFallback: 'Blocked' }));
  assert.match(html, /MARKDOWN_SOURCE_LIMIT_EXCEEDED/u); assert.match(html, /Blocked/u);
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

async function mountSelectionEditor({ onSelectionRequest, ...props } = {}) {
  const dom = new JSDOM('<!doctype html><button id="outside">Outside</button><div id="root"></div>', { url: 'http://localhost/' });
  const restore = installDom(dom, { layoutStubs: true });
  // jsdom has no layout, so give ProseMirror's coordinate lookups empty rectangles.
  const emptyRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = emptyRect;
  const root = createRoot(document.querySelector('#root'));
  const session = { actions: undefined };
  const render = (next = {}) => act(async () => root.render(React.createElement(TextEditor, {
    'aria-label': 'Draft',
    defaultValue: selectionDocument,
    selectionActions: selectionActionList,
    onSelectionRequest: (request, actions) => {
      session.actions = actions;
      return onSelectionRequest?.(request, actions);
    },
    ...props,
    ...next,
  })));
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
    assert.equal(t.bar(), null, 'no selection, no bar');
    await t.select(7, 12);
    assert.ok(t.bar());
    assert.equal(document.activeElement, t.pm, 'the bar never takes focus');
    assert.equal(t.bar().getAttribute('data-phase'), 'idle');
    assert.deepEqual(t.names(), ['Describe edits', 'Improve', 'Explain', 'More actions']);
    assert.equal(document.querySelector('.muxui-text-editor__selection-range'), null, 'the editor paints its own selection while focused');
    for (const svg of t.bar().querySelectorAll('svg')) {
      assert.equal(svg.getAttribute('aria-hidden'), 'true');
      assert.equal(svg.getAttribute('focusable'), 'false');
    }
    await act(async () => t.editor.commands.setTextSelection(9));
    await t.flush();
    assert.equal(t.bar(), null, 'a caret hides the bar');
    await t.select(7, 12);
    await act(async () => document.querySelector('#outside').focus());
    await t.flush();
    assert.equal(t.bar(), null, 'focus outside the editor hides the bar');
    await t.select(7, 12);
    await t.render({ selectionInstruction: false });
    assert.deepEqual(t.names(), ['Improve', 'Explain', 'More actions'], 'selectionInstruction hides the field');
    await t.render({ selectionInstruction: false, selectionActions: [] });
    assert.equal(t.bar(), null, 'a bar with nothing to offer stays hidden');
    await t.render({ selectionInstruction: false });
    await t.render({ readOnly: true });
    assert.equal(t.bar(), null, 'read-only hides the bar');
    await t.render({ readOnly: false, disabled: true });
    assert.equal(t.bar(), null, 'disabled hides the bar');
    await t.render({ disabled: false });
    await t.select(7, 12);
    assert.ok(t.bar());
    await t.render({ onSelectionRequest: undefined });
    assert.equal(t.bar(), null, 'the bar is enabled by onSelectionRequest');
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
    assert.equal(document.querySelector('.muxui-text-editor__selection-range'), null);
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
    assert.equal(t.bar(), null, 'keep closes the bar, though the kept text stays selected');
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
    assert.equal(t.bar(), null);
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
    assert.equal(t.bar().getAttribute('data-phase'), 'idle', 'close() ends the request');
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
    assert.equal(document.activeElement, t.pm, 'cancel returns focus to the editor');
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
    assert.equal(document.activeElement, t.control('Describe edits'), 'Alt+F10 moves focus into the bar');
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
    assert.equal(document.activeElement, field, 'arrows move the caret inside the field');
    field.setSelectionRange(2, 2);
    await t.key(field, 'ArrowRight');
    assert.equal(document.activeElement, t.control('Send'), 'the caret at the end hands focus to the next control');
    await t.type(field, '');

    await t.key(document.activeElement, 'Escape');
    assert.equal(document.activeElement, t.pm, 'Escape returns focus to the editor');
    assert.deepEqual([t.editor.state.selection.from, t.editor.state.selection.to], [7, 12], 'the selection stays intact');
    assert.ok(t.bar(), 'the bar stays while the selection stays');
    assert.equal(document.querySelector('.muxui-text-editor__selection-range'), null);

    await t.key(t.pm, 'F10', { altKey: true });
    await t.key(document.activeElement, 'Tab');
    assert.equal(document.activeElement, t.pm, 'Tab leaves the bar for the editor');

    await t.key(t.pm, 'Escape');
    assert.equal(t.bar(), null, 'Escape in the editor hides the bar');
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
      freshProps.onPointerCancel();
    });
    assert.equal(commits.length, commitCount);
  } finally {
    await act(async () => root?.unmount());
    restore();
    dom.window.close();
  }
});

test('Resizable rejects simultaneous controlled and default sizes at runtime', () => {
  const html = renderToStaticMarkup(React.createElement(Resizable, { sizes: { left: 50, right: 50 }, defaultSizes: { left: 40, right: 60 } }, React.createElement(ResizablePanel, { id: 'left' }), React.createElement(ResizableHandle, { id: 'split', before: 'left', after: 'right', 'aria-label': 'Resize' }), React.createElement(ResizablePanel, { id: 'right' })));
  assert.match(html, /data-invalid="true"/u);
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
