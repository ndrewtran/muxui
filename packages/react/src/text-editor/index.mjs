import React from 'react';
import { createPortal } from 'react-dom';
import { Extension, getText, getTextSerializersFromSchema } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { Fragment, Slice } from '@tiptap/pm/model';
import { AllSelection, Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import AlignCenter from 'lucide-react/dist/esm/icons/text-align-center.mjs';
import AlignLeft from 'lucide-react/dist/esm/icons/text-align-start.mjs';
import AlignRight from 'lucide-react/dist/esm/icons/text-align-end.mjs';
import ArrowUp from 'lucide-react/dist/esm/icons/arrow-up.mjs';
import Bold from 'lucide-react/dist/esm/icons/bold.mjs';
import Check from 'lucide-react/dist/esm/icons/check.mjs';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.mjs';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import ImageIcon from 'lucide-react/dist/esm/icons/image.mjs';
import Italic from 'lucide-react/dist/esm/icons/italic.mjs';
import LinkIcon from 'lucide-react/dist/esm/icons/link.mjs';
import List from 'lucide-react/dist/esm/icons/list.mjs';
import RotateCw from 'lucide-react/dist/esm/icons/rotate-cw.mjs';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.mjs';
import Type from 'lucide-react/dist/esm/icons/type.mjs';
import Underline from 'lucide-react/dist/esm/icons/underline.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';
import {
  ColorField as AriaColorField,
  Dialog as AriaDialog,
  DialogTrigger,
  Input as AriaInput,
  Label as AriaLabel,
  Popover as AriaPopover,
  VisuallyHidden,
  parseColor,
} from 'react-aria-components';
import { Button } from '../button.mjs';
import { IconButton } from '../supplemental/icon-button.mjs';

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
  const buttonProps = {
    className: cx('muxui-text-editor__btn', active && 'muxui-text-editor__btn--active'),
    'data-disabled': disabled ? 'true' : undefined,
    disabled,
    'aria-label': label,
    'aria-pressed': Boolean(active),
    onActivate: () => run(editor, action, callbacks),
  };
  return Icon
    ? React.createElement(IconButton, buttonProps, React.createElement(Icon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }))
    : React.createElement(Button, buttonProps, label);
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
    React.createElement(IconButton, { className: 'muxui-text-editor__btn', disabled, 'aria-label': 'Text color', onActivate: () => setOpen(true) }, React.createElement(Type, { size: 16, 'aria-hidden': 'true', focusable: 'false' })),
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
  return React.createElement(IconButton, { className: 'muxui-text-editor__btn', disabled, 'data-disabled': disabled ? 'true' : undefined, 'aria-label': 'Insert image', onActivate: () => {
    if (callbacks.onImageRequest) callbacks.onImageRequest({ insertImage: (src, alt) => insert(src, alt) });
    else promptImage();
  } }, React.createElement(ImageIcon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }));
}

function Separator() {
  return React.createElement('div', { className: 'muxui-text-editor__separator', 'aria-hidden': 'true' });
}

function Toolbar({ editor, disabled, variant, floating, callbacks }) {
  const advanced = variant === 'advanced';
  const request = (label, callback, actions, fallback = () => false, Icon) => {
    const buttonProps = {
      className: 'muxui-text-editor__btn',
      disabled,
      'data-disabled': disabled ? 'true' : undefined,
      'aria-label': label,
      onActivate: () => callback ? callback(actions) : fallback(),
    };
    return Icon
      ? React.createElement(IconButton, buttonProps, React.createElement(Icon, { size: 16, 'aria-hidden': 'true', focusable: 'false' }))
      : React.createElement(Button, buttonProps, label);
  };
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
    React.createElement(IconButton, { className: 'muxui-text-editor__btn', disabled, 'data-disabled': disabled ? 'true' : undefined, 'aria-label': 'Insert link', onActivate: requestLink }, React.createElement(LinkIcon, { size: 16, 'aria-hidden': 'true', focusable: 'false' })),
  );
}

// ─── Selection actions ───────────────────────────────────────────────────────
//
// A bar under a text selection hands the selected range to the caller, who runs
// any transformation and applies the result through `replace` or `insertAfter`.
// Undo history: an applied edit is one closed history event, so Cmd+Z reverts
// it in a single step. Discard undoes that event (restoring the original
// selection and leaving Redo available) instead of stacking a second edit, and
// Keep leaves the event in place.

let rangePainter;

/**
 * Paints one range owned by the selection bar, so the selection stays visible while focus is in the bar.
 * Built on first use, so importing the module does no work.
 */
function selectionRangePainter() {
  if (rangePainter) return rangePainter;
  const key = new PluginKey('muxuiSelectionRange');
  const extension = Extension.create({
    name: 'muxuiSelectionRange',
    addProseMirrorPlugins() {
      return [new Plugin({
        key,
        state: {
          init: () => null,
          apply(transaction, range) {
            const meta = transaction.getMeta(key);
            if (meta !== undefined) return meta.range;
            if (range === null || !transaction.docChanged) return range;
            const from = transaction.mapping.map(range.from, 1);
            const to = transaction.mapping.map(range.to, -1);
            return to > from ? { from, to } : null;
          },
        },
        props: {
          decorations(state) {
            const range = key.getState(state);
            return range && range.to > range.from
              ? DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: 'muxui-text-editor__selection-range' })])
              : null;
          },
        },
      })];
    },
  });
  rangePainter = { key, extension };
  return rangePainter;
}

// Every attribute the Mux stylesheets scope tokens or direction by. A theme preset applies without a mode
// attribute, so it counts as a scope on its own.
const MUX_RUNTIME_SCOPE_SELECTOR = '[data-muxui-theme], [data-muxui-color-scheme], [data-muxui-contrast], [data-muxui-motion], [data-muxui-density], [data-muxui-direction], [data-muxui-responsive]';

/** The subtree-scoped runtime profile around the editor, if any, so the portaled bar keeps its tokens and direction. */
function runtimeScope(node) {
  const scope = node.closest(MUX_RUNTIME_SCOPE_SELECTOR);
  return scope && scope !== document.documentElement && scope !== document.body ? scope : undefined;
}

const PENDING_LABEL = 'Editing…';
const FAILURE_MESSAGE = "Couldn't complete the edit";
const REVIEW_MESSAGE = 'Edit ready to review';

const sameRange = (a, b) => a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to);
const isThenable = (value) => typeof value?.then === 'function';
const barControls = (bar) => [...bar.querySelectorAll('button:not(:disabled), input:not(:disabled)')];

function validateSelectionActions(actions) {
  if (actions === undefined) return [];
  const ids = new Set();
  for (const action of actions) {
    if (!action || typeof action.id !== 'string' || action.id === '' || typeof action.label !== 'string' || action.label === '' || ids.has(action.id)) {
      throw new TypeError('TextEditor selectionActions need a unique id and a nonempty label for every action.');
    }
    ids.add(action.id);
  }
  return actions;
}

/** The selected text range, or null for a caret, a node selection, or an empty document range. */
function readSelectionRange(editor) {
  const { selection, doc } = editor.state;
  if (selection.empty) return null;
  let { from, to } = selection;
  if (selection instanceof AllSelection) {
    from = Selection.atStart(doc).from;
    to = Selection.atEnd(doc).to;
  } else if (!(selection instanceof TextSelection)) {
    return null;
  }
  return to > from ? { from, to } : null;
}

function takeSnapshot(editor, { from, to }) {
  const { doc } = editor.state;
  return Object.freeze({ text: doc.textBetween(from, to, '\n'), document: normalizeTextEditorDocument(doc.cut(from, to).toJSON()) });
}

/**
 * Maps `range` through the transaction, or returns null when the transaction changes what the range holds:
 * an edit inside it, or a mark, attribute, or wrapping change that moves no position. Mark steps have empty
 * position maps, so the content with its parents is compared as well.
 */
function mapRange(range, transaction) {
  let { from, to } = range;
  for (const map of transaction.mapping.maps) {
    let touched = false;
    map.forEach((oldStart, oldEnd) => {
      if (oldStart < to && oldEnd > from) touched = true;
    });
    if (touched) return null;
    from = map.map(from, 1);
    to = map.map(to, -1);
  }
  if (to <= from || !transaction.before.slice(range.from, range.to, true).eq(transaction.doc.slice(from, to, true))) return null;
  return { from, to };
}

function plainTextNodes(schema, text, marks) {
  const nodes = [];
  text.split(/\r\n|\r|\n/u).forEach((line, index) => {
    if (index > 0) nodes.push(schema.nodes.hardBreak.create());
    if (line) nodes.push(schema.text(line, marks));
  });
  return nodes;
}

/**
 * Builds one closed history event that replaces the range or inserts after it, or returns null when the
 * content is invalid, cannot be placed, or would exceed the character limit.
 */
function buildEdit(editor, { from, to }, mode, content, limit) {
  const { state } = editor;
  const { schema } = state;
  const isText = typeof content === 'string';
  // An invalid document is refused as given; normalizing it first would turn it into an empty paragraph.
  if (!isText && !isTextEditorDocument(content)) return null;
  const transaction = closeHistory(state.tr);
  let range;
  try {
    const blocks = isText ? null : Fragment.fromJSON(schema, normalizeTextEditorDocument(content).content);
    // Plain text takes the formatting at the start of the selection, wherever it is inserted.
    const marks = isText ? transaction.doc.resolve(from).marksAcross(transaction.doc.resolve(to)) ?? [] : null;
    if (mode === 'replace') {
      if (isText) transaction.replaceWith(from, to, plainTextNodes(schema, content, marks));
      else transaction.replaceRange(from, to, Slice.maxOpen(blocks));
      range = { from: transaction.mapping.map(from, -1), to: transaction.mapping.map(to, 1) };
    } else {
      let at = to;
      if (isText) {
        transaction.replaceWith(at, at, plainTextNodes(schema, content, marks));
      } else {
        const $to = transaction.doc.resolve(to);
        at = $to.depth === 0 ? to : $to.after();
        transaction.replaceRange(at, at, new Slice(blocks, 0, 0));
      }
      range = { from: at, to: transaction.mapping.map(at, 1) };
      // Nothing before the insertion point moved, so the selection stays where it was.
      transaction.setSelection(TextSelection.create(transaction.doc, from, to));
    }
  } catch {
    return null;
  }
  if (!transaction.docChanged) return null;
  // Mirrors the length `TextEditor` enforces in onUpdate, so a rejected edit is never applied and reverted.
  if (limit !== undefined && getText(transaction.doc, { blockSeparator: '\n\n', textSerializers: getTextSerializersFromSchema(schema) }).length > limit) return null;
  return { transaction, range };
}

/**
 * One request at a time. A session holds the request, its range, and an
 * AbortController, and moves idle -> pending -> review or error. A transaction
 * that edits inside the range makes the session stale; one outside only moves
 * the range. During review, any outside edit keeps the change.
 */
function createSelectionController(editor, { getLimit, getOnRequest, notify, onClose }) {
  let session = null;
  let ownEdit = false;
  const inOwnEdit = (callback) => {
    ownEdit = true;
    try { return callback(); } finally { ownEdit = false; }
  };

  function end(record) {
    if (session !== record) return;
    session = null;
    record.controller.abort();
    notify();
  }

  function applyEdit(record, mode, content) {
    if (session !== record || record.edit || record.controller.signal.aborted || editor.isDestroyed || !editor.isEditable) return false;
    const edit = buildEdit(editor, record.range, mode, content, getLimit());
    if (!edit) return false;
    const before = editor.state.doc;
    const { range, status } = record;
    // Mark the request applied first: dispatching reports the change, and a handler may call replace again.
    record.edit = { before };
    record.range = edit.range;
    record.status = 'review';
    try {
      inOwnEdit(() => {
        editor.view.dispatch(edit.transaction);
        // Edits after this one start a new history event, whatever the timing.
        editor.view.dispatch(closeHistory(editor.state.tr));
      });
    } catch (error) {
      if (editor.state.doc.eq(before)) {
        record.edit = null;
        record.range = range;
        record.status = status;
      }
      throw error;
    } finally {
      notify();
    }
    return true;
  }

  function settle(record) {
    if (session !== record || record.status !== 'pending') return;
    record.status = 'idle';
    notify();
  }

  function fail(record) {
    if (session !== record || record.controller.signal.aborted || record.status === 'review') return;
    record.status = 'error';
    notify();
  }

  function start(request, reuse) {
    const range = reuse?.range ?? readSelectionRange(editor);
    if (!range || editor.isDestroyed || !editor.isEditable) return;
    if (session) end(session);
    const record = {
      request,
      origin: range,
      range,
      status: 'idle',
      edit: null,
      snapshot: reuse?.snapshot ?? takeSnapshot(editor, range),
      controller: new AbortController(),
    };
    session = record;
    let result;
    try {
      result = getOnRequest()?.(request, {
        selection: record.snapshot,
        signal: record.controller.signal,
        replace: (content) => applyEdit(record, 'replace', content),
        insertAfter: (content) => applyEdit(record, 'insertAfter', content),
        close: () => {
          if (session !== record) return;
          end(record);
          onClose();
        },
      });
    } catch {
      fail(record);
      return;
    }
    if (isThenable(result)) {
      if (record.status === 'idle') record.status = 'pending';
      Promise.resolve(result).then(() => settle(record), () => fail(record));
    }
    notify();
  }

  /** Undoes the applied edit and reselects its original range. */
  function restore(record) {
    const { before } = record.edit;
    inOwnEdit(() => {
      editor.commands.undo();
      if (!editor.state.doc.eq(before)) {
        const { tr } = editor.state;
        editor.view.dispatch(tr.replace(0, tr.doc.content.size, new Slice(before.content, 0, 0)));
      }
      const { tr } = editor.state;
      editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, record.origin.from, record.origin.to)));
    });
  }

  return {
    get session() { return session; },
    start,
    cancel: end,
    keep: end,
    discard(record) {
      if (session !== record || !record.edit) return;
      restore(record);
      end(record);
    },
    retry(record) {
      if (session !== record) return;
      const { request, snapshot, origin, edit } = record;
      if (edit) restore(record);
      end(record);
      start(request, { snapshot, range: origin });
    },
    transacted(transaction) {
      const record = session;
      if (ownEdit || !record || !transaction.docChanged) return;
      if (record.status === 'review') {
        end(record);
        return;
      }
      const range = mapRange(record.range, transaction);
      if (!range) {
        end(record);
        return;
      }
      record.range = range;
      if (!record.edit) record.origin = range;
    },
    dispose() {
      if (session) end(session);
    },
  };
}

function measureRange(editor, { from, to }) {
  try {
    const start = editor.view.coordsAtPos(from, 1);
    const end = editor.view.coordsAtPos(to, -1);
    const content = editor.view.dom.getBoundingClientRect();
    const singleLine = Math.abs(start.top - end.top) < 2;
    const left = singleLine ? Math.min(start.left, end.left) : content.left;
    const right = singleLine ? Math.max(start.left, end.left) : content.right;
    const top = Math.min(start.top, end.top);
    return { left, top, width: right - left, height: Math.max(start.bottom, end.bottom) - top };
  } catch {
    // Layout is unavailable, for example before the editor mounts or in jsdom.
    return { left: 0, top: 0, width: 0, height: 0 };
  }
}

const sameRect = (a, b) => a !== null && b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

const e = React.createElement;
const barIcon = (Icon) => e(Icon, { size: 16, 'aria-hidden': 'true', focusable: 'false' });

function SelectionActions({ editor, enabled, actions: actionsProp, instruction, onRequest, limitRef }) {
  const actions = React.useMemo(() => validateSelectionActions(actionsProp), [actionsProp]);
  const [selection, setSelection] = React.useState(() => readSelectionRange(editor));
  const [focusWithin, setFocusWithin] = React.useState(() => editor.isFocused);
  const [barFocused, setBarFocused] = React.useState(false);
  const [dismissedKey, setDismissedKey] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [anchor, setAnchor] = React.useState(null);
  const [anchorElement, setAnchorElement] = React.useState(null);
  const [, refresh] = React.useReducer((count) => count + 1, 0);
  const barRef = React.useRef(null);
  const focusWasInBar = React.useRef(false);
  const frame = React.useRef(0);
  const onRequestRef = React.useRef(onRequest);
  const latest = React.useRef({});
  onRequestRef.current = onRequest;

  const dismissSelection = () => {
    const current = readSelectionRange(editor);
    setDismissedKey(current ? `${current.from}:${current.to}` : null);
  };
  // A control that has focus when the bar changes may be replaced, so remember it to hand focus on afterwards.
  const rememberFocus = () => {
    focusWasInBar.current = focusWasInBar.current || Boolean(barRef.current?.contains(document.activeElement));
  };
  const controller = React.useMemo(() => createSelectionController(editor, {
    getLimit: () => limitRef.current,
    getOnRequest: () => onRequestRef.current,
    notify: () => {
      rememberFocus();
      refresh();
    },
    // close() hides the bar until the selection changes, like Escape at rest.
    onClose: () => dismissSelection(),
  }), [editor, limitRef]);

  const record = controller.session;
  const phase = record?.status ?? 'idle';
  const live = phase !== 'idle';
  const range = live ? record.range : selection;
  const rangeKey = range ? `${range.from}:${range.to}` : '';
  // A dismissal lasts until the selection changes, so the first change after it, even a collapse, ends it.
  const selectionKey = selection ? `${selection.from}:${selection.to}` : '';
  React.useEffect(() => {
    if (dismissedKey !== null && dismissedKey !== selectionKey) setDismissedKey(null);
  }, [dismissedKey, selectionKey]);
  const show = enabled && range !== null && (live || ((instruction || actions.length > 0) && focusWithin && dismissedKey !== rangeKey));
  const highlight = show && (barFocused || live) ? range : null;
  latest.current = { phase, show, range, rangeKey, record };

  const focusEditor = () => {
    focusWasInBar.current = false;
    editor.view.focus();
  };

  React.useEffect(() => {
    const onTransaction = ({ transaction }) => {
      controller.transacted(transaction);
      const next = readSelectionRange(editor);
      setSelection((current) => (sameRange(current, next) ? current : next));
      measure();
    };
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('transaction', onTransaction);
      controller.dispose();
    };
  }, [controller, editor]);

  React.useEffect(() => {
    if (!enabled) controller.dispose();
  }, [controller, enabled]);

  // Whether focus is in the editor, its toolbar, or the bar.
  React.useEffect(() => {
    const surface = (node) => node instanceof Node && (editor.view.dom.closest('.muxui-text-editor')?.contains(node) || barRef.current?.contains(node));
    const onFocusIn = (event) => setFocusWithin(Boolean(surface(event.target)));
    const onFocusOut = (event) => { if (!surface(event.relatedTarget)) setFocusWithin(false); };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [editor]);

  function measure() {
    const { show: visible, range: current } = latest.current;
    setAnchor((previous) => {
      const next = visible && current ? measureRange(editor, current) : null;
      return sameRect(previous, next) ? previous : next;
    });
  }
  function scheduleMeasure() {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  }
  React.useLayoutEffect(measure, [show, range?.from, range?.to]);
  React.useEffect(() => {
    if (!show) return undefined;
    window.addEventListener('scroll', scheduleMeasure, true);
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.removeEventListener('resize', scheduleMeasure);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [show]);

  // Paint the range while focus is in the bar or a request owns it.
  React.useEffect(() => {
    if (editor.isDestroyed) return;
    const { key } = selectionRangePainter();
    if (!sameRange(key.getState(editor.state), highlight)) editor.view.dispatch(editor.state.tr.setMeta(key, { range: highlight }));
  }, [editor, highlight?.from, highlight?.to]);

  // The painted range belongs to this bar, so removing the bar removes it.
  React.useEffect(() => () => {
    if (editor.isDestroyed) return;
    const { key } = selectionRangePainter();
    if (key.getState(editor.state)) editor.view.dispatch(editor.state.tr.setMeta(key, { range: null }));
  }, [editor]);

  // Keep focus in the bar when its content changes underneath the focused control.
  React.useLayoutEffect(() => {
    if (!focusWasInBar.current) return;
    focusWasInBar.current = false;
    const bar = barRef.current;
    if (bar && !bar.contains(document.activeElement)) barControls(bar)[0]?.focus();
  });

  // Alt+F10 enters the bar; Escape hides it, or cancels a request, from the editor.
  React.useEffect(() => {
    const dom = editor.view.dom;
    const onKeyDown = (event) => {
      if (event.isComposing) return;
      const { show: visible, phase: current, rangeKey: key, record: active } = latest.current;
      if (event.key === 'F10' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const first = barRef.current && barControls(barRef.current)[0];
        if (first) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === 'Escape' && visible && !event.defaultPrevented) {
        if (current === 'pending' || current === 'error') controller.cancel(active);
        else if (current === 'idle') setDismissedKey(key);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    dom.addEventListener('keydown', onKeyDown, true);
    return () => dom.removeEventListener('keydown', onKeyDown, true);
  }, [controller, editor]);

  const send = (request) => {
    setExpanded(false);
    controller.start(request);
  };
  const toggleExpanded = () => {
    rememberFocus();
    setExpanded((value) => !value);
  };
  const sendInstruction = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send({ type: 'instruction', text });
  };
  const leave = (action) => {
    action();
    focusEditor();
  };

  const onBarKeyDown = (event) => {
    // Keys that drive an IME composition belong to the field, as in the editor handler above.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (phase === 'pending' || phase === 'error') controller.cancel(record);
      focusEditor();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      focusEditor();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const controls = barControls(event.currentTarget);
    const index = controls.indexOf(document.activeElement);
    if (index < 0) return;
    const forward = (event.key === 'ArrowRight') !== (getComputedStyle(event.currentTarget).direction === 'rtl');
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      // Inside the field, arrows move the caret and only leave it at either end.
      if (event.key === 'Home' || event.key === 'End' || target.selectionStart !== target.selectionEnd) return;
      if (forward ? target.selectionStart !== target.value.length : target.selectionStart !== 0) return;
    }
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : index + (forward ? 1 : -1);
    controls[next]?.focus();
  };

  const button = (key, props, ...children) => e(Button, { key, variant: 'ghost', size: 'sm', preventFocusOnPress: true, ...props }, e('span', { className: 'muxui-text-editor__selection-content' }, ...children));
  const iconButton = (key, label, Icon, props) => e(IconButton, { key, 'aria-label': label, size: 'sm', preventFocusOnPress: true, ...props }, barIcon(Icon));

  let content;
  let label = '';
  if (phase === 'pending') {
    const action = record.request.type === 'action' ? actions.find(({ id }) => id === record.request.id) : undefined;
    label = action?.pendingLabel ?? PENDING_LABEL;
    content = [
      e('span', { key: 'pending', className: 'muxui-text-editor__selection-pending' }, barIcon(Sparkles), e('span', null, label)),
      button('cancel', { onActivate: () => leave(() => controller.cancel(record)) }, 'Cancel'),
    ];
  } else if (phase === 'review') {
    label = REVIEW_MESSAGE;
    content = [
      // The text stays selected, so keep the bar closed until the selection changes.
      button('keep', { variant: 'primary', onActivate: () => leave(() => { dismissSelection(); controller.keep(record); }) }, barIcon(Check), 'Keep'),
      button('discard', { onActivate: () => leave(() => controller.discard(record)) }, barIcon(X), 'Discard'),
      e('div', { key: 'divider', className: 'muxui-text-editor__separator', 'aria-hidden': 'true' }),
      iconButton('retry', 'Try again', RotateCw, { onActivate: () => controller.retry(record) }),
    ];
  } else if (phase === 'error') {
    label = FAILURE_MESSAGE;
    content = [
      e('span', { key: 'message', className: 'muxui-text-editor__selection-message' }, FAILURE_MESSAGE),
      button('retry', { onActivate: () => controller.retry(record) }, 'Try again'),
      button('dismiss', { onActivate: () => leave(() => controller.cancel(record)) }, 'Dismiss'),
    ];
  } else {
    const overflow = actions.filter((action) => action.overflow);
    const typing = instruction && draft !== '';
    const visible = expanded ? actions : actions.filter((action) => !action.overflow);
    content = [];
    if (instruction && !expanded) {
      content.push(e('input', {
        key: 'input',
        className: 'muxui-text-editor__selection-input',
        type: 'text',
        value: draft,
        placeholder: 'Describe edits',
        'aria-label': 'Describe edits',
        autoComplete: 'off',
        enterKeyHint: 'send',
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          // A key that confirms an IME candidate reports isComposing, or keyCode 229 in Safari.
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          sendInstruction();
        },
      }));
    }
    if (typing) {
      content.push(iconButton('send', 'Send', ArrowUp, { variant: 'primary', onActivate: sendInstruction }));
    } else {
      if (instruction && !expanded && visible.length > 0) content.push(e('div', { key: 'divider-start', className: 'muxui-text-editor__separator', 'aria-hidden': 'true' }));
      for (const action of visible) {
        content.push(button(`action-${action.id}`, { onActivate: () => send({ type: 'action', id: action.id }) },
          action.icon === undefined ? null : e('span', { className: 'muxui-text-editor__selection-icon', 'aria-hidden': 'true' }, action.icon), action.label));
      }
      if (overflow.length > 0) {
        content.push(e('div', { key: 'divider-end', className: 'muxui-text-editor__separator', 'aria-hidden': 'true' }));
        content.push(iconButton('more', expanded ? 'Show fewer actions' : 'More actions', expanded ? ChevronLeft : ChevronRight, { 'aria-expanded': expanded, onActivate: toggleExpanded }));
      }
    }
  }

  // React Aria sets the popover direction from the locale, so the bar takes the editor's own direction.
  const direction = show && getComputedStyle(editor.view.dom).direction === 'rtl' ? 'rtl' : 'ltr';
  const anchorKey = anchor ? `${anchor.left}|${anchor.top}|${anchor.width}|${anchor.height}` : '';
  const anchorRef = React.useMemo(() => ({ current: anchorElement }), [anchorElement]);
  return e(React.Fragment, null,
    e(VisuallyHidden, { elementType: 'div', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, show ? label : ''),
    show && anchor && typeof document !== 'undefined' ? createPortal(e('span', {
      // A new element per position makes the popover measure its anchor again.
      key: anchorKey,
      ref: setAnchorElement,
      'aria-hidden': 'true',
      style: { position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height, visibility: 'hidden', pointerEvents: 'none' },
    }), document.body) : null,
    show && anchorElement ? e(AriaPopover, {
      isOpen: true,
      onOpenChange: () => {},
      triggerRef: anchorRef,
      isNonModal: true,
      isKeyboardDismissDisabled: true,
      // The bar moves focus itself, so the popover must not restore it when the bar goes away.
      disableFocusManagement: true,
      UNSTABLE_portalContainer: show ? runtimeScope(editor.view.dom) : undefined,
      placement: 'bottom',
      offset: 6,
      containerPadding: 8,
      shouldFlip: true,
      className: 'muxui-text-editor__selection-popover',
    }, e('div', {
      ref: barRef,
      role: 'toolbar',
      dir: direction,
      'aria-label': 'Selection actions',
      'aria-orientation': 'horizontal',
      'aria-busy': phase === 'pending' ? 'true' : undefined,
      className: 'muxui-text-editor__selection-bar',
      'data-phase': phase,
      'data-instruction': instruction && !expanded && phase === 'idle' ? '' : undefined,
      onKeyDown: onBarKeyDown,
      // Pressing the bar must not move focus out of the editor, except into the field.
      onMouseDown: (event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); },
      onFocus: () => setBarFocused(true),
      onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setBarFocused(false); },
    }, content)) : null);
}

/** Rich editing through Mux-owned document and command values; Tiptap stays internal. */
export const TextEditor = React.forwardRef(function TextEditor({
  value, defaultValue = emptyDocument, onChange, disabled = false, invalid = false, placeholder = '', limit,
  toolbar = 'simple', floating = false, bubbleMenu = false, onLinkRequest, onImageRequest, onColorRequest, onGenerate,
  selectionActions, selectionInstruction = true, onSelectionRequest,
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
      selectionRangePainter().extension,
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
  React.createElement('div', { className: 'muxui-text-editor__content' },
    editor ? React.createElement(EditorContent, { editor }) : null,
    editor && typeof onSelectionRequest === 'function'
      ? React.createElement(SelectionActions, { editor, enabled: !disabled && !readOnly, actions: selectionActions, instruction: selectionInstruction, onRequest: onSelectionRequest, limitRef })
      : null),
  description !== undefined ? React.createElement('p', { id: descriptionId, className: 'muxui-text-editor__description' }, description) : null,
  errorMessage !== undefined ? React.createElement('p', { id: errorId, className: 'muxui-text-editor__error', 'aria-live': 'polite' }, errorMessage) : null,
  characterLimit !== undefined ? React.createElement('p', { id: description === undefined && errorMessage === undefined ? descriptionId : undefined, className: cx('muxui-text-editor__hint', invalid && 'muxui-text-editor__hint--invalid'), 'aria-live': 'polite' }, `${Math.max(0, characterLimit - (editor?.getText().length ?? 0))} characters left`) : null);
});
TextEditor.displayName = 'TextEditor';
TextEditor.Root = TextEditor;
