import React from 'react';
import { Lexer } from 'marked';

export const MARKDOWN_SOURCE_LIMIT = 100_000;
export const MARKDOWN_LINE_LIMIT = 10_000;
export const MARKDOWN_DEPTH_LIMIT = 32;
export const MARKDOWN_NODE_LIMIT = 10_000;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/u;
const cx = (...values) => values.filter(Boolean).join(' ');

function safeUrl(value, protocols, baseUrl, allowFragment = false) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return undefined;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return undefined;
  }
  if (value.startsWith('#')) {
    if (!allowFragment) return undefined;
    try { new URL(value, 'https://mux.invalid/'); return value; } catch { return undefined; }
  }
  if (!SCHEME.test(value) && baseUrl === undefined) return undefined;
  try {
    const absolute = SCHEME.test(value);
    const url = baseUrl === undefined ? new URL(value) : new URL(value, baseUrl);
    if (!protocols.has(url.protocol) || url.username !== '' || url.password !== '') return undefined;
    if (url.protocol === 'mailto:' && /^mailto:[^/?#]*:.*@/iu.test(value)) return undefined;
    return absolute ? value : url.href;
  } catch {
    return undefined;
  }
}

function bounded(source) {
  if (typeof source !== 'string') return 'MARKDOWN_INVALID_SOURCE_TYPE';
  if (source.length > MARKDOWN_SOURCE_LIMIT) return 'MARKDOWN_SOURCE_LIMIT_EXCEEDED';
  let lineLength = 0;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 10 || code === 13) {
      lineLength = 0;
      if (code === 13 && source.charCodeAt(index + 1) === 10) index += 1;
    } else if (++lineLength > MARKDOWN_LINE_LIMIT) {
      return 'MARKDOWN_LINE_LIMIT_EXCEEDED';
    }
  }
  return undefined;
}

function childTokens(token) {
  const groups = [];
  if (Array.isArray(token.tokens)) groups.push(token.tokens);
  if (token.type === 'list' && Array.isArray(token.items)) {
    for (const item of token.items) if (item) groups.push([item]);
  }
  if (token.type === 'table') {
    for (const cell of [...(token.header ?? []), ...(token.rows ?? []).flat()]) {
      if (Array.isArray(cell.tokens)) groups.push(cell.tokens);
    }
  }
  return groups;
}

function assertBounds(tokens) {
  let count = 0;
  const seen = new Set();
  const visit = (group, depth) => {
    if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
    for (const token of group) {
      if (!token || typeof token !== 'object') continue;
      if (seen.has(token)) continue;
      seen.add(token);
      if (++count > MARKDOWN_NODE_LIMIT) throw new Error('MARKDOWN_NODE_LIMIT_EXCEEDED');
      const childDepth = ['blockquote', 'list', 'strong', 'em', 'link'].includes(token.type) ? depth + 1 : depth;
      if (childDepth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
      for (const children of childTokens(token)) visit(children, childDepth);
    }
  };
  visit(tokens, 0);
  return count;
}

function inline(tokens, baseUrl, depth = 0) {
  if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
  const output = [];
  for (const [index, token] of (tokens ?? []).entries()) {
    const key = `${depth}-${index}`;
    if (token.type === 'html') {
      continue;
    }
    if (token.type === 'text' || token.type === 'escape') {
      output.push(Array.isArray(token.tokens) ? inline(token.tokens, baseUrl, depth + 1) : (token.text ?? ''));
      continue;
    }
    if (token.type === 'strong') { output.push(React.createElement('strong', { key }, inline(token.tokens, baseUrl, depth + 1))); continue; }
    if (token.type === 'em') { output.push(React.createElement('em', { key }, inline(token.tokens, baseUrl, depth + 1))); continue; }
    if (token.type === 'del') { output.push(inline(token.tokens, baseUrl, depth + 1)); continue; }
    if (token.type === 'codespan') { output.push(React.createElement('code', { key, className: 'muxui-markdown-code' }, token.text)); continue; }
    if (token.type === 'br') { output.push(React.createElement('br', { key })); continue; }
    if (token.type === 'image') {
      const src = safeUrl(token.href, HTTP_PROTOCOLS, baseUrl);
      output.push(src
        ? React.createElement('img', { key, className: 'muxui-markdown-image', src, alt: token.text ?? '' })
        : (token.text ?? ''));
      continue;
    }
    if (token.type === 'link') {
      const children = inline(token.tokens, baseUrl, depth + 1);
      const href = safeUrl(token.href, LINK_PROTOCOLS, baseUrl, true);
      output.push(href
        ? React.createElement('a', { key, className: 'muxui-link', href, rel: 'noreferrer noopener' }, children)
        : children);
      continue;
    }
    if (Array.isArray(token.tokens)) output.push(inline(token.tokens, baseUrl, depth + 1));
    else if (typeof token.text === 'string') output.push(token.text);
  }
  const merged = [];
  for (const value of output.flat()) {
    if (typeof value === 'string' && typeof merged.at(-1) === 'string') merged[merged.length - 1] += value;
    else merged.push(value);
  }
  return merged;
}

function blocks(tokens, baseUrl, depth = 0, counter = { value: 0 }) {
  if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
  return (tokens ?? []).flatMap((token, index) => {
    const key = `${depth}-${index}`;
    if (token.type === 'space' || token.type === 'html' || token.type === 'def') return [];
    counter.value += 1;
    if (counter.value > MARKDOWN_NODE_LIMIT) throw new Error('MARKDOWN_NODE_LIMIT_EXCEEDED');
    if (token.type === 'heading') return React.createElement(`h${Math.min(6, Math.max(1, token.depth))}`, { key }, inline(token.tokens, baseUrl, depth + 1));
    if (token.type === 'paragraph' || token.type === 'text') return React.createElement('p', { key }, inline(token.tokens ?? [{ type: 'text', text: token.text }], baseUrl, depth + 1));
    if (token.type === 'code') {
      if (!(typeof token.raw === 'string' && (token.raw.startsWith('```') || token.raw.startsWith('~~~')))) {
        return React.createElement('p', { key }, token.text ?? '');
      }
      const language = typeof token.lang === 'string' ? token.lang.trim().split(/\s+/u, 1)[0].replace(/[^a-z0-9_-]/giu, '') : '';
      return React.createElement('pre', { key, className: 'muxui-markdown-code-block', 'data-language': language || undefined }, React.createElement('code', null, token.text));
    }
    if (token.type === 'blockquote') return React.createElement('blockquote', { key, className: 'muxui-markdown-blockquote' }, blocks(token.tokens, baseUrl, depth + 1, counter));
    if (token.type === 'list') {
      const Tag = token.ordered ? 'ol' : 'ul';
      return React.createElement(Tag, { key }, (token.items ?? []).map((item, itemIndex) => React.createElement('li', { key: itemIndex }, blocks(item.tokens, baseUrl, depth + 1, counter))));
    }
    if (token.type === 'hr') return React.createElement('hr', { key });
    if (Array.isArray(token.tokens)) return React.createElement('p', { key }, inline(token.tokens, baseUrl, depth + 1));
    return [];
  });
}

/** Renders a bounded, non-HTML Markdown subset through React nodes. */
export const Markdown = React.forwardRef(function Markdown({ source, baseUrl, invalidFallback = 'Content unavailable', className, dangerouslySetInnerHTML: _dangerous, ...props }, ref) {
  const failure = bounded(source);
  const safeBase = safeUrl(baseUrl, HTTP_PROTOCOLS);
  const rootProps = { ...props, ref, className: cx('muxui-markdown', className) };
  if (failure || (baseUrl !== undefined && safeBase === undefined)) {
    return React.createElement('div', { ...rootProps, 'data-markdown-error': failure ?? 'MARKDOWN_INVALID_BASE_URL' }, invalidFallback);
  }
  try {
    const tokens = Lexer.lex(source, { async: false, breaks: false, gfm: false, pedantic: false });
    assertBounds(tokens);
    return React.createElement('div', rootProps, blocks(tokens, safeBase));
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith('MARKDOWN_') ? error.message : 'MARKDOWN_PARSER_FAILED';
    return React.createElement('div', { ...rootProps, 'data-markdown-error': code }, invalidFallback);
  }
});
Markdown.displayName = 'Markdown';
