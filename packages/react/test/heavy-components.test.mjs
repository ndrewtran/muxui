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

function installDom(dom) {
  const keys = ['window', 'document', 'Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'SVGElement', 'Node', 'NodeFilter', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'PointerEvent', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle'];
  const previous = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  Object.assign(globalThis, Object.fromEntries(keys.map((key) => [key, dom.window[key] ?? globalThis[key]])));
  globalThis.requestAnimationFrame ??= (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  dom.window.HTMLElement.prototype.attachEvent ??= () => {};
  dom.window.HTMLElement.prototype.detachEvent ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

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
  try {
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(TextEditor, { label: 'Document', toolbar: 'advanced' })));
    assert.equal(document.querySelectorAll('.muxui-text-editor__select').length, 2);
    assert.equal(document.querySelectorAll('input[type="file"][accept="image/*"]').length, 0);
    assert.equal(document.querySelectorAll('[aria-label="Insert image"]').length, 1);
    await act(async () => document.querySelector('[aria-label="Text color"]').click());
    assert.equal(document.querySelectorAll('.muxui-text-editor__color-swatch').length, 16);
    assert.equal(document.querySelector('[role="dialog"][aria-label="Text color picker"]') !== null, true);
    const customColor = document.querySelector('.muxui-text-editor__color-field input');
    assert.ok(customColor);
    assert.equal(customColor.type, 'text');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  } finally {
    await act(async () => root?.unmount());
    restore();
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
