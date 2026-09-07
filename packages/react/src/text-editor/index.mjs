import React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ImageIcon, Italic, Link as LinkIcon, List,
  Sparkles, Type, Underline,
} from 'lucide-react';
import {
  ColorField as AriaColorField,
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger,
  Input as AriaInput,
  Label as AriaLabel,
  Popover as AriaPopover,
  parseColor,
} from 'react-aria-components';

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SAFE_IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const SAFE_COLORS = new Set([
  '#000000', '#374151', '#6b7280', '#d1d5db', '#ffffff', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
  '#0ea5e9', '#84cc16',
]);
const FONT_FAMILIES = new Set(['Inter', 'Comic Sans MS, Comic Sans', 'serif', 'monospace', 'cursive']);
const FONT_SIZES = new Set(['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px']);
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const ORDERED_LIST_TYPES = new Set(['1', 'a', 'A', 'i', 'I']);
const emptyDocument = Object.freeze({ type: 'doc', content: [{ type: 'paragraph' }] });
const markTypes = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link', 'textStyle']);
const blockNodeTypes = new Set([
  'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock', 'image', 'horizontalRule',
]);
const cx = (...values) => values.filter(Boolean).join(' ');

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function safeUrl(value, protocols) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return undefined;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return undefined;
  }
  try {
    const url = new URL(value);
    if (!protocols.has(url.protocol) || url.username !== '' || url.password !== '') return undefined;
    if (url.protocol === 'mailto:' && /^mailto:[^/?#]*:.*@/iu.test(value)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function safeColor(value) {
  return typeof value === 'string' && (SAFE_COLORS.has(value.toLowerCase()) || /^#[0-9a-f]{6}$/iu.test(value));
}

function safeTextStyle(attrs, strict = false) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return undefined;
  if (strict && ['color', 'fontFamily', 'fontSize'].some((key) => Object.hasOwn(attrs, key) && (attrs[key] === null || attrs[key] === undefined))) return undefined;
  const result = {};
  if (attrs.color !== undefined && attrs.color !== null) {
    if (!safeColor(attrs.color)) return undefined;
    result.color = attrs.color.toLowerCase();
  }
  if (attrs.fontFamily !== undefined && attrs.fontFamily !== null) {
    if (typeof attrs.fontFamily !== 'string' || !FONT_FAMILIES.has(attrs.fontFamily)) return undefined;
    result.fontFamily = attrs.fontFamily;
  }
  if (attrs.fontSize !== undefined && attrs.fontSize !== null) {
    if (typeof attrs.fontSize !== 'string' || !FONT_SIZES.has(attrs.fontSize)) return undefined;
    result.fontSize = attrs.fontSize;
  }
  return Object.keys(result).length ? result : undefined;
}

function safeMarks(value, strict = false) {
  if (!Array.isArray(value)) return undefined;
  const result = [];
  for (const mark of value) {
    if (!mark || typeof mark !== 'object' || Array.isArray(mark) || !markTypes.has(mark.type) || (strict && !hasOnlyKeys(mark, new Set(['type', 'attrs'])))) {
      if (strict) return null;
      continue;
    }
    if (mark.type === 'link') {
      if (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs)
        || (strict && !hasOnlyKeys(mark.attrs, new Set(['href'])))
        || (!strict && !hasOnlyKeys(mark.attrs, new Set(['href', 'target', 'rel', 'class', 'title'])))) {
        if (strict) return null;
        continue;
      }
      const href = safeUrl(mark.attrs?.href, SAFE_LINK_PROTOCOLS);
      if (!href) {
        if (strict) return null;
        continue;
      }
      result.push({ type: 'link', attrs: { href } });
    } else if (mark.type === 'textStyle') {
      if (!mark.attrs || typeof mark.attrs !== 'object' || Array.isArray(mark.attrs) || (strict && !hasOnlyKeys(mark.attrs, new Set(['color', 'fontFamily', 'fontSize'])))) {
        if (strict) return null;
        continue;
      }
      const attrs = safeTextStyle(mark.attrs, strict);
      if (!attrs) {
        if (strict) return null;
        continue;
      }
      result.push({ type: 'textStyle', attrs });
    } else {
      if (mark.attrs !== undefined && (strict || mark.attrs !== null)) {
        if (strict) return null;
        continue;
      }
      result.push({ type: mark.type });
    }
  }
  return result.length ? result : undefined;
}

function safeTextNode(value, depth, strict, marksAllowed = true) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'text' || typeof value.text !== 'string' || (strict && !hasOnlyKeys(value, new Set(['type', 'text', 'marks'])))) return null;
  if (!marksAllowed && value.marks !== undefined) return strict ? null : { type: 'text', text: value.text };
  if (value.marks !== undefined && !Array.isArray(value.marks)) return null;
  const marks = safeMarks(value.marks, strict);
  if (marks === null) return null;
  return marks ? { type: 'text', text: value.text, marks } : { type: 'text', text: value.text };
}

function safeInlineNode(value, depth, strict) {
  if (value?.type === 'hardBreak') {
    if (strict && !hasOnlyKeys(value, new Set(['type']))) return null;
    return { type: 'hardBreak' };
  }
  return safeTextNode(value, depth, strict);
}

function safeContent(value, context, depth, strict) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const content = value.map((child) => context === 'listItem'
    ? safeListItem(child, depth + 1, strict)
    : context === 'inline'
      ? safeInlineNode(child, depth + 1, strict)
      : safeNode(child, context, depth + 1, strict));
  if (strict && content.some((child) => child === null)) return null;
  return content.filter(Boolean);
}

function safeNode(value, context = 'block', depth = 0, strict = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 32) return null;
  if (context === 'inline') return safeInlineNode(value, depth, strict);
  if (context === 'code') return safeTextNode(value, depth, strict, false);
  if (!blockNodeTypes.has(value.type) || value.type === 'listItem') return null;
  if (value.type === 'image') {
    if ((strict && !hasOnlyKeys(value, new Set(['type', 'attrs']))) || !value.attrs || typeof value.attrs !== 'object' || Array.isArray(value.attrs)
      || (strict && !hasOnlyKeys(value.attrs, new Set(['src', 'alt'])))
      || (!strict && !hasOnlyKeys(value.attrs, new Set(['src', 'alt', 'title', 'width', 'height'])))
      || (value.attrs.alt !== undefined && (value.attrs.alt === null ? strict : typeof value.attrs.alt !== 'string'))) return null;
    const src = safeUrl(value.attrs?.src, SAFE_IMAGE_PROTOCOLS);
    if (!src) return null;
    return {
      type: 'image',
      attrs: { src, ...(typeof value.attrs?.alt === 'string' ? { alt: value.attrs.alt.slice(0, 1_000) } : {}) },
    };
  }
  if (strict && !hasOnlyKeys(value, new Set(['type', 'attrs', 'content']))) return null;
  if (value.type === 'heading') {
    if (!value.attrs || typeof value.attrs !== 'object' || Array.isArray(value.attrs) || !hasOnlyKeys(value.attrs, new Set(['level', 'textAlign']))) return null;
    if (strict && typeof value.attrs.level !== 'number') return null;
    const level = Number(value.attrs.level);
    if (!Number.isInteger(level) || level < 1 || level > 6 || (value.attrs.textAlign !== undefined && (value.attrs.textAlign === null ? strict : !ALIGNMENTS.has(value.attrs.textAlign)))) return null;
    const content = safeContent(value.content, 'inline', depth, strict);
    if (content === null) return null;
    const attrs = { level: Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1 };
    if (ALIGNMENTS.has(value.attrs?.textAlign)) attrs.textAlign = value.attrs.textAlign;
    return { type: 'heading', attrs, ...(content.length ? { content } : {}) };
  }
  if (value.type === 'paragraph') {
    if (value.attrs !== undefined && (value.attrs === null || typeof value.attrs !== 'object' || Array.isArray(value.attrs) || !hasOnlyKeys(value.attrs, new Set(['textAlign'])) || (value.attrs.textAlign !== undefined && (value.attrs.textAlign === null ? strict : !ALIGNMENTS.has(value.attrs.textAlign))))) return null;
    const content = safeContent(value.content, 'inline', depth, strict);
    if (content === null) return null;
    return { type: 'paragraph', ...(ALIGNMENTS.has(value.attrs?.textAlign) ? { attrs: { textAlign: value.attrs.textAlign } } : {}), ...(content.length ? { content } : {}) };
  }
  if (value.type === 'codeBlock') {
    if (value.attrs !== undefined && (
      value.attrs === null || typeof value.attrs !== 'object' || Array.isArray(value.attrs) || !hasOnlyKeys(value.attrs, new Set(['language'])) ||
      (value.attrs.language !== undefined && (value.attrs.language === null ? strict : typeof value.attrs.language !== 'string'))
    )) return null;
    const content = safeContent(value.content, 'code', depth, strict);
    return content === null ? null : {
      type: 'codeBlock',
      ...(typeof value.attrs?.language === 'string' ? { attrs: { language: value.attrs.language } } : {}),
      ...(content.length ? { content } : {}),
    };
  }
  if (value.type === 'horizontalRule') return value.attrs === undefined ? { type: 'horizontalRule' } : null;
  if (value.type === 'bulletList' || value.type === 'orderedList') {
    const allowedAttrs = value.type === 'orderedList' ? new Set(['start', 'type']) : new Set();
    if (value.attrs !== undefined && (
      value.attrs === null || typeof value.attrs !== 'object' || Array.isArray(value.attrs)
      || !hasOnlyKeys(value.attrs, allowedAttrs)
      || (value.type === 'bulletList' && Object.keys(value.attrs).length > 0)
      || (value.type === 'orderedList' && value.attrs.start !== undefined && (!Number.isInteger(value.attrs.start) || value.attrs.start < 1))
      || (value.type === 'orderedList' && value.attrs.type !== undefined && (value.attrs.type === null ? strict : typeof value.attrs.type !== 'string' || (strict && !ORDERED_LIST_TYPES.has(value.attrs.type))))
    )) return null;
    const content = safeContent(value.content, 'listItem', depth, strict);
    return content === null || content.length === 0 ? null : {
      type: value.type,
      ...(value.type === 'orderedList' && (Number.isInteger(value.attrs?.start) || ORDERED_LIST_TYPES.has(value.attrs?.type)) ? {
        attrs: {
          ...(Number.isInteger(value.attrs?.start) ? { start: value.attrs.start } : {}),
          ...(ORDERED_LIST_TYPES.has(value.attrs?.type) ? { type: value.attrs.type } : {}),
        },
      } : {}),
      content,
    };
  }
  if (value.type === 'blockquote') {
    if (value.attrs !== undefined) return null;
    const content = safeContent(value.content, 'block', depth, strict);
    return content === null || content.length === 0 ? null : { type: 'blockquote', content };
  }
  return null;
}

function safeListItem(value, depth, strict) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'listItem' || (strict && !hasOnlyKeys(value, new Set(['type', 'content']))) || !Array.isArray(value.content) || value.content.length === 0) return null;
  const [first, ...rest] = value.content;
  if (first?.type !== 'paragraph') return null;
  const paragraph = safeNode(first, 'block', depth + 1, strict);
  if (!paragraph || paragraph.type !== 'paragraph') return null;
  const trailing = rest.map((child) => safeNode(child, 'block', depth + 1, strict));
  if (strict && trailing.some((child) => child === null)) return null;
  return { type: 'listItem', content: [paragraph, ...trailing.filter(Boolean)] };
}

/** True for Mux's finite portable editor document grammar. */
export function isTextEditorDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'doc' || !hasOnlyKeys(value, new Set(['type', 'content'])) || !Array.isArray(value.content) || value.content.length === 0) return false;
  return value.content.every((node) => safeNode(node, 'block', 0, true) !== null);
}

export function normalizeTextEditorDocument(value) {
  if (!value || value.type !== 'doc' || !Array.isArray(value.content)) return emptyDocument;
  const content = value.content.map((node) => safeNode(node, 'block')).filter(Boolean);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function run(editor, action, callbacks = {}) {
  if (!editor || editor.isDestroyed || !action || typeof action.type !== 'string') return false;
  if (action.type === 'generate') return typeof callbacks.onGenerate === 'function' && callbacks.onGenerate() !== false;
  if (!editor.isEditable) return false;
  const chain = editor.chain().focus();
  if (action.type === 'bold') return chain.toggleBold().run();
  if (action.type === 'italic') return chain.toggleItalic().run();
  if (action.type === 'underline' && typeof chain.toggleUnderline === 'function') return chain.toggleUnderline().run();
  if (action.type === 'bulletList') return chain.toggleBulletList().run();
  if (action.type === 'orderedList') return chain.toggleOrderedList().run();
  if (action.type === 'blockquote') return chain.toggleBlockquote().run();
  if (action.type === 'codeBlock') return chain.toggleCodeBlock().run();
  if (action.type === 'align' && ALIGNMENTS.has(action.value)) return chain.setTextAlign(action.value).run();
  if (action.type === 'color' && safeColor(action.value) && typeof chain.setColor === 'function') return chain.setColor(action.value).run();
  if (action.type === 'fontFamily' && FONT_FAMILIES.has(action.value) && typeof chain.setFontFamily === 'function') return chain.setFontFamily(action.value).run();
  if (action.type === 'fontSize' && FONT_SIZES.has(action.value) && typeof chain.setFontSize === 'function') return chain.setFontSize(action.value).run();
  if (action.type === 'link' && typeof chain.setLink === 'function') {
    const href = safeUrl(action.href, SAFE_LINK_PROTOCOLS);
    return href ? chain.setLink({ href }).run() : false;
  }
  if (action.type === 'unlink' && typeof chain.unsetLink === 'function') return chain.unsetLink().run();
  if (action.type === 'image') {
    const src = safeUrl(action.src, SAFE_IMAGE_PROTOCOLS);
    return src ? chain.setImage({ src, ...(typeof action.alt === 'string' ? { alt: action.alt.slice(0, 1_000) } : {}) }).run() : false;
  }
  return false;
}

function Action({ editor, disabled, action, label, icon: Icon, callbacks }) {
  const active = action.type === 'align'
    ? editor?.isActive({ textAlign: action.value })
    : action.type === 'fontFamily'
      ? editor?.getAttributes('textStyle').fontFamily === action.value
      : action.type === 'fontSize'
        ? editor?.getAttributes('textStyle').fontSize === action.value
        : editor?.isActive(action.type);
  return React.createElement('button', {
    type: 'button', className: cx('muxui-text-editor__btn', active && 'muxui-text-editor__btn--active'), 'data-disabled': disabled ? 'true' : undefined,
    disabled, 'aria-label': label, 'aria-pressed': Boolean(active),
    onClick: () => run(editor, action, callbacks),
  }, Icon ? React.createElement(Icon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }) : label);
}

function ColorPicker({ editor, disabled, callbacks }) {
  const [color, setColor] = React.useState(() => parseColor('#000000'));
  const [open, setOpen] = React.useState(false);
  const apply = (value) => {
    const actions = { setColor: (color) => run(editor, { type: 'color', value: color }) };
    if (callbacks.onColorRequest) callbacks.onColorRequest(actions);
    else actions.setColor(value);
    setColor(parseColor(value));
  };
  const handleColorChange = (value) => {
    if (!value) return;
    const hex = value.toString('hex');
    apply(hex);
  };
  return React.createElement(DialogTrigger, { isOpen: open, onOpenChange: setOpen },
    React.createElement(AriaButton, { className: 'muxui-text-editor__btn', isDisabled: disabled, 'aria-label': 'Text color', onPress: () => setOpen(true) }, React.createElement(Type, { size: 16, 'aria-hidden': 'true', focusable: 'false' })),
    React.createElement(AriaPopover, { className: 'muxui-text-editor__color-popup' },
      React.createElement(AriaDialog, { className: 'muxui-text-editor__color-dialog', 'aria-label': 'Text color picker' },
        React.createElement('div', { className: 'muxui-text-editor__color-swatches' }, [...SAFE_COLORS].map((hex) => React.createElement('button', { key: hex, type: 'button', className: 'muxui-text-editor__color-swatch', style: { backgroundColor: hex }, 'aria-label': hex, onClick: () => apply(hex) }))),
        React.createElement('div', { className: 'muxui-text-editor__color-field-row' },
          React.createElement(AriaLabel, { className: 'muxui-text-editor__color-field-label' }, 'Custom'),
          React.createElement(AriaColorField, { value: color, onChange: handleColorChange, className: 'muxui-text-editor__color-field', 'aria-label': 'Custom color' }, React.createElement(AriaInput, null)),
        ),
      ),
    ),
  );
}

function ImagePicker({ editor, disabled, callbacks }) {
  const insert = (src, alt) => run(editor, { type: 'image', src, alt });
  const promptImage = () => {
    if (typeof window === 'undefined') return false;
    const src = window.prompt('Enter image URL');
    if (src === null) return false;
    return insert(src);
  };
  return React.createElement('button', { type: 'button', className: 'muxui-text-editor__btn', disabled, 'data-disabled': disabled ? 'true' : undefined, 'aria-label': 'Insert image', onClick: () => {
    if (callbacks.onImageRequest) callbacks.onImageRequest({ insertImage: (src, alt) => insert(src, alt) });
    else promptImage();
  } }, React.createElement(ImageIcon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }));
}

function Separator() {
  return React.createElement('div', { className: 'muxui-text-editor__separator', 'aria-hidden': 'true' });
}

function Toolbar({ editor, disabled, variant, floating, callbacks }) {
  const advanced = variant === 'advanced';
  const request = (label, callback, actions, fallback = () => false, Icon) => React.createElement('button', {
    type: 'button', className: 'muxui-text-editor__btn', disabled, 'data-disabled': disabled ? 'true' : undefined, 'aria-label': label,
    onClick: () => callback ? callback(actions) : fallback(),
  }, Icon ? React.createElement(Icon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }) : label);
  const linkActions = { setLink: (href) => run(editor, { type: 'link', href }), unsetLink: () => run(editor, { type: 'unlink' }) };
  const promptLink = () => {
    if (typeof window === 'undefined') return false;
    const href = window.prompt('Enter URL');
    if (href === null) return false;
    return href === '' ? linkActions.unsetLink() : linkActions.setLink(href);
  };
  const className = cx('muxui-text-editor__toolbar', advanced && 'muxui-text-editor__toolbar--advanced', floating && 'muxui-text-editor__toolbar--floating');
  return React.createElement('div', { role: 'toolbar', 'aria-label': 'Formatting', className },
    advanced ? React.createElement(React.Fragment, null,
      React.createElement('select', { className: 'muxui-text-editor__select', disabled, 'aria-label': 'Font family', defaultValue: 'Inter', onChange: (event) => run(editor, { type: 'fontFamily', value: event.target.value }) }, [...FONT_FAMILIES].map((value) => React.createElement('option', { key: value, value }, value === 'Comic Sans MS, Comic Sans' ? 'Comic Sans' : value[0].toUpperCase() + value.slice(1)))),
      React.createElement('select', { className: 'muxui-text-editor__select', disabled, 'aria-label': 'Font size', defaultValue: '16px', onChange: (event) => run(editor, { type: 'fontSize', value: event.target.value }) }, [...FONT_SIZES].map((value) => React.createElement('option', { key: value, value }, value.replace('px', '')))),
      Separator(),
    ) : null,
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'bold' }, label: 'Bold', icon: Bold }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'italic' }, label: 'Italic', icon: Italic }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'underline' }, label: 'Underline', icon: Underline }),
    Separator(),
    React.createElement(ColorPicker, { editor, disabled, callbacks }),
    Separator(),
    advanced ? React.createElement(React.Fragment, null,
      request('Insert link', callbacks.onLinkRequest, linkActions, promptLink, LinkIcon),
      React.createElement(ImagePicker, { editor, disabled, callbacks }),
      Separator(),
    ) : null,
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'align', value: 'left' }, label: 'Align left', icon: AlignLeft }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'align', value: 'center' }, label: 'Align center', icon: AlignCenter }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'align', value: 'right' }, label: 'Align right', icon: AlignRight }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'bulletList' }, label: 'Bullet list', icon: List }),
    advanced ? React.createElement(React.Fragment, null,
      Separator(),
      React.createElement(Action, { editor, disabled, callbacks, action: { type: 'generate' }, label: 'Generate with AI', icon: Sparkles }),
    ) : null,
  );
}

function BubbleMenu({ editor, disabled, callbacks }) {
  const [hasSelection, setHasSelection] = React.useState(false);
  React.useEffect(() => {
    const update = () => setHasSelection(!editor.state.selection.empty);
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);
  if (!hasSelection) return null;
  const linkActions = { setLink: (href) => run(editor, { type: 'link', href }), unsetLink: () => run(editor, { type: 'unlink' }) };
  const requestLink = () => {
    if (callbacks.onLinkRequest) return callbacks.onLinkRequest(linkActions);
    if (typeof window === 'undefined') return false;
    const href = window.prompt('Enter URL');
    if (href === null) return false;
    return href === '' ? linkActions.unsetLink() : linkActions.setLink(href);
  };
  return React.createElement('div', { className: 'muxui-text-editor__bubble-menu', role: 'toolbar', 'aria-label': 'Selection formatting' },
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'bold' }, label: 'Bold', icon: Bold }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'italic' }, label: 'Italic', icon: Italic }),
    React.createElement(Action, { editor, disabled, callbacks, action: { type: 'underline' }, label: 'Underline', icon: Underline }),
    React.createElement('button', { type: 'button', className: 'muxui-text-editor__btn', disabled, 'data-disabled': disabled ? 'true' : undefined, 'aria-label': 'Insert link', onClick: requestLink }, React.createElement(LinkIcon, { size: 16, 'aria-hidden': 'true', focusable: 'false' })),
  );
}

/** Rich editing through Mux-owned document and command values; Tiptap stays internal. */
export const TextEditor = React.forwardRef(function TextEditor({
  value, defaultValue = emptyDocument, onChange, disabled = false, invalid = false, placeholder = '', limit,
  toolbar = 'simple', floating = false, bubbleMenu = false, onLinkRequest, onImageRequest, onColorRequest, onGenerate,
  label, description, errorMessage, required = false, readOnly = false,
  id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, 'aria-describedby': ariaDescribedby,
  'aria-errormessage': ariaErrormessage, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired,
  'aria-disabled': ariaDisabled, 'aria-readonly': ariaReadonly, className, ...props
}, ref) {
  const initial = React.useMemo(() => normalizeTextEditorDocument(defaultValue), [defaultValue]);
  const characterLimit = typeof limit === 'number' && Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : undefined;
  const generatedId = React.useId().replace(/[^A-Za-z0-9_-]/gu, '') || 'muxui-text-editor';
  const contentId = id ?? `muxui-text-editor-${generatedId}`;
  const labelId = `${contentId}-label`;
  const descriptionId = `${contentId}-description`;
  const errorId = `${contentId}-error`;
  const controlledValueRef = React.useRef(value);
  const composingRef = React.useRef(false);
  const [, requestControlledReconciliation] = React.useReducer((revision) => revision + 1, 0);
  const initialContent = value === undefined ? initial : normalizeTextEditorDocument(value);
  const last = React.useRef(initialContent);
  const onChangeRef = React.useRef(onChange);
  const limitRef = React.useRef(limit);
  const callbacksRef = React.useRef({ onGenerate, onLinkRequest, onImageRequest, onColorRequest });
  controlledValueRef.current = value;
  onChangeRef.current = onChange;
  limitRef.current = characterLimit;
  callbacksRef.current = { onGenerate, onLinkRequest, onImageRequest, onColorRequest };
  const labelledBy = ariaLabelledby ?? (label !== undefined ? labelId : undefined);
  const describedBy = [ariaDescribedby, description !== undefined ? descriptionId : undefined, errorMessage !== undefined ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  const editorAttributes = React.useMemo(() => ({
    ...(contentId ? { id: contentId } : {}),
    ...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {}),
    ...(labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {}),
    ...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {}),
    ...(ariaErrormessage !== undefined || errorMessage !== undefined ? { 'aria-errormessage': ariaErrormessage ?? errorId } : {}),
    ...(invalid || errorMessage !== undefined || ariaInvalid !== undefined ? { 'aria-invalid': invalid || errorMessage !== undefined || ariaInvalid } : {}),
    ...(disabled || ariaDisabled !== undefined ? { 'aria-disabled': disabled || ariaDisabled } : {}),
    ...(readOnly || ariaReadonly !== undefined ? { 'aria-readonly': readOnly || ariaReadonly } : {}),
    ...(required || ariaRequired !== undefined ? { 'aria-required': required || ariaRequired } : {}),
  }), [ariaDisabled, ariaErrormessage, ariaInvalid, ariaLabel, ariaReadonly, ariaRequired, contentId, describedBy, disabled, errorId, errorMessage, invalid, labelledBy, readOnly, required]);
  const editor = useEditor({
    immediatelyRender: false,
    content: initialContent,
    editable: !disabled && !readOnly,
    editorProps: { attributes: editorAttributes },
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    onUpdate: ({ editor: instance }) => {
      const next = normalizeTextEditorDocument(instance.getJSON());
      if (limitRef.current !== undefined && instance.getText().length > limitRef.current) {
        instance.commands.setContent(last.current, false);
        return;
      }
      if (controlledValueRef.current === undefined) last.current = next;
      onChangeRef.current?.(next);
      if (controlledValueRef.current !== undefined) requestControlledReconciliation();
    },
  });

  React.useEffect(() => {
    if (!editor) return undefined;
    editor.setEditable(!disabled && !readOnly);
    return undefined;
  }, [disabled, editor, readOnly]);

  React.useEffect(() => {
    if (!editor) return undefined;
    editor.setOptions({ editorProps: { attributes: editorAttributes } });
    return undefined;
  }, [editor, editorAttributes]);

  const syncControlledValue = React.useCallback(() => {
    const external = controlledValueRef.current;
    if (!editor || external === undefined || composingRef.current) return;
    const next = normalizeTextEditorDocument(external);
    const current = normalizeTextEditorDocument(editor.getJSON());
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      last.current = next;
      editor.commands.setContent(next, false);
    }
  }, [editor]);

  React.useEffect(() => {
    syncControlledValue();
  });

  React.useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return undefined;
    const onCompositionStart = () => { composingRef.current = true; };
    const onCompositionEnd = () => {
      composingRef.current = false;
      requestControlledReconciliation();
    };
    dom.addEventListener('compositionstart', onCompositionStart);
    dom.addEventListener('compositionend', onCompositionEnd);
    return () => {
      dom.removeEventListener('compositionstart', onCompositionStart);
      dom.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [editor, requestControlledReconciliation]);

  React.useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom || disabled || readOnly || typeof window === 'undefined') return undefined;
    const handleKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k' || !dom.contains(event.target)) return;
      event.preventDefault();
      const actions = {
        setLink: (href) => run(editor, { type: 'link', href }, callbacksRef.current),
        unsetLink: () => run(editor, { type: 'unlink' }, callbacksRef.current),
      };
      if (callbacksRef.current.onLinkRequest) {
        callbacksRef.current.onLinkRequest(actions);
        return;
      }
      const href = window.prompt('Enter URL');
      if (href !== null) run(editor, href === '' ? { type: 'unlink' } : { type: 'link', href }, callbacksRef.current);
    };
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [disabled, editor, readOnly]);

  const callbacks = {
    onGenerate: () => callbacksRef.current.onGenerate?.(),
    onLinkRequest: onLinkRequest ? (actions) => callbacksRef.current.onLinkRequest?.(actions) : undefined,
    onImageRequest: onImageRequest ? (actions) => callbacksRef.current.onImageRequest?.(actions) : undefined,
    onColorRequest: onColorRequest ? (actions) => callbacksRef.current.onColorRequest?.(actions) : undefined,
  };
  React.useImperativeHandle(ref, () => ({
    focus: () => { editor?.commands.focus(); },
    execute: (action) => run(editor, action, callbacksRef.current),
  }), [editor]);

  const variant = toolbar === 'floating' ? 'simple' : toolbar;
  const isFloating = floating || toolbar === 'floating';
  return React.createElement('div', {
    ...props, className: cx('muxui-text-editor', className), 'data-disabled': disabled || undefined, 'data-readonly': readOnly || undefined, 'data-required': required || undefined, 'data-invalid': invalid || errorMessage !== undefined || undefined,
  }, label !== undefined ? React.createElement('label', { id: labelId, htmlFor: contentId, className: 'muxui-text-editor__label' }, label) : null,
  toolbar ? React.createElement(Toolbar, { editor, disabled: disabled || readOnly, variant, floating: isFloating, callbacks }) : null,
  editor && bubbleMenu ? React.createElement(BubbleMenu, { editor, disabled: disabled || readOnly, callbacks }) : null,
  React.createElement('div', { className: 'muxui-text-editor__content' }, editor ? React.createElement(EditorContent, { editor }) : null),
  description !== undefined ? React.createElement('p', { id: descriptionId, className: 'muxui-text-editor__description' }, description) : null,
  errorMessage !== undefined ? React.createElement('p', { id: errorId, className: 'muxui-text-editor__error', 'aria-live': 'polite' }, errorMessage) : null,
  characterLimit !== undefined ? React.createElement('p', { id: description === undefined && errorMessage === undefined ? descriptionId : undefined, className: cx('muxui-text-editor__hint', invalid && 'muxui-text-editor__hint--invalid'), 'aria-live': 'polite' }, `${Math.max(0, characterLimit - (editor?.getText().length ?? 0))} characters left`) : null);
});
TextEditor.displayName = 'TextEditor';
TextEditor.Root = TextEditor;
