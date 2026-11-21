import React from 'react';
import type { ForwardRefExoticComponent, HTMLAttributes, ReactElement, ReactNode, RefAttributes } from 'react';
import { Lexer } from 'marked';

// Annotated `: number`: inferred, each would be declared as its literal, narrower than the type consumers have.
/** Longest accepted source, in UTF-16 code units. */
export const MARKDOWN_SOURCE_LIMIT: number = 100_000;
/** Most lines accepted in a source. A trailing newline starts a final blank line. */
export const MARKDOWN_LINE_LIMIT: number = 10_000;
/** Longest accepted single line, in UTF-16 code units. */
export const MARKDOWN_LINE_LENGTH_LIMIT: number = 10_000;
/** Deepest accepted nesting of block and inline structure. */
export const MARKDOWN_DEPTH_LIMIT: number = 32;
/** Most parsed nodes accepted. */
export const MARKDOWN_NODE_LIMIT: number = 10_000;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/u;
const cx = (...values: unknown[]) => values.filter(Boolean).join(' ');
// The Markdown parser hands over text, backslash escapes, inline code and image alt text HTML-escaped for its
// own HTML renderer, while React escapes text again. Undo its five escapes in one pass per token field, so inline
// code `&amp;` (escaped to `&amp;amp;`) stays as written. Code block text and link and image URLs are not
// escaped, so they are never decoded; autolinks and image descriptions are read from
// their source instead (see autolinkText and imageDescription).
const PARSER_UNESCAPES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unescapeParser = (value = '') => value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (escape) => PARSER_UNESCAPES[escape] ?? escape);
const LEXER_OPTIONS = { async: false, breaks: false, gfm: false, pedantic: false } as const;

/**
 * The props Mux UI defines for Markdown; the catalog's web.react API is derived from this
 * type (Decision 0031). It is a type literal, as the props were before the move.
 */
type MarkdownOwnProps = {
  /** The Markdown to render. Raw HTML is dropped, and a source over one of the exported limits is replaced by invalidFallback. */
  source: string;
  /** The absolute HTTP(S) URL, with no username or password, that relative links and images resolve against. Without it, relative links and images are not allowed. */
  baseUrl?: string;
  /** What replaces the whole content when baseUrl is invalid or the source fails a limit. */
  invalidFallback?: ReactNode;
};

export type MarkdownProps = HTMLAttributes<HTMLDivElement> & MarkdownOwnProps;

// A table cell as the renderer reads it: only its inline tokens.
type MarkdownCell = { tokens?: MarkdownToken[] };
// A marked token as the renderer reads it: the fields it reads, each optional because the renderer checks it
// before use. Every token marked produces fits, as its own Token union is closed shapes plus an open one.
type MarkdownToken = {
  type: string; raw?: string; text?: string; href?: string; lang?: string; depth?: number; ordered?: boolean; start?: number | ''; loose?: boolean;
  tokens?: MarkdownToken[]; items?: MarkdownToken[]; header?: MarkdownCell[]; rows?: MarkdownCell[][];
};
// One rendered inline piece: text, or an element.
type Piece = string | ReactElement;

function safeUrl(value: unknown, protocols: ReadonlySet<string>, baseUrl?: string, allowFragment = false): string | undefined {
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

// A trailing newline starts a final blank line, so it counts as a line like CodeBlock's.
function bounded(source: unknown): string | undefined {
  if (typeof source !== 'string') return 'MARKDOWN_INVALID_SOURCE_TYPE';
  if (source.length > MARKDOWN_SOURCE_LIMIT) return 'MARKDOWN_SOURCE_LIMIT_EXCEEDED';
  let lines = 1;
  let lineLength = 0;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code === 10 || code === 13) {
      if (++lines > MARKDOWN_LINE_LIMIT) return 'MARKDOWN_LINE_LIMIT_EXCEEDED';
      lineLength = 0;
      if (code === 13 && source.charCodeAt(index + 1) === 10) index += 1;
    } else if (++lineLength > MARKDOWN_LINE_LENGTH_LIMIT) {
      return 'MARKDOWN_LINE_LENGTH_LIMIT_EXCEEDED';
    }
  }
  return undefined;
}

function childTokens(token: MarkdownToken): MarkdownToken[][] {
  const groups: MarkdownToken[][] = [];
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

// The parser keeps an image's description only as escaped text, with its \[ and \] escapes already resolved,
// so a written `&` and `&amp;` look alike there and a code span loses its backslashes. Read the description from
// the image's source instead, with the parser's own link patterns, and lex it with the lexer that read the
// document so reference links inside it resolve. Fall back to the parser's text if no pattern matches.
function imageDescription(token: MarkdownToken, lexer: Lexer): MarkdownToken[] {
  const { link, reflink, nolink } = Lexer.rules.inline.normal;
  const raw = token.raw ?? '';
  const description = (link.exec(raw) ?? reflink.exec(raw) ?? nolink.exec(raw))?.[1];
  return description === undefined ? [{ type: 'text', text: token.text }] : lexer.inlineTokens(description);
}

// Counts and depth-checks every token. An image's description is lexed here, as it is reached, so its inline
// tokens meet the same limits as any other content.
function assertBounds(tokens: MarkdownToken[], lexer: Lexer): number {
  let count = 0;
  const seen = new Set<MarkdownToken>();
  const visit = (group: MarkdownToken[], depth: number): void => {
    if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
    for (const token of group) {
      if (!token || typeof token !== 'object') continue;
      if (seen.has(token)) continue;
      seen.add(token);
      if (++count > MARKDOWN_NODE_LIMIT) throw new Error('MARKDOWN_NODE_LIMIT_EXCEEDED');
      if (token.type === 'image' && !Array.isArray(token.tokens)) token.tokens = imageDescription(token, lexer);
      const childDepth = ['blockquote', 'list', 'strong', 'em', 'link', 'image'].includes(token.type) ? depth + 1 : depth;
      if (childDepth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
      for (const children of childTokens(token)) visit(children, childDepth);
    }
  };
  visit(tokens, 0);
  return count;
}

// An autolink's text and URL come escaped, so `&` and a written `&amp;` look alike: read the spelling inside its
// angle brackets instead. An email autolink has no scheme.
const autolinkText = (token: MarkdownToken) => (token.raw?.startsWith('<') && token.raw.endsWith('>') ? token.raw.slice(1, -1) : undefined);

// The plain text of inline tokens, for image alt text: emphasis, links and images give their text, code keeps
// every character, and a dropped tag keeps its text as written, as the parser gives it.
function plainText(tokens: MarkdownToken[] | undefined, depth = 0): string {
  if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
  let output = '';
  for (const token of tokens ?? []) {
    if (token.type === 'br') output += '\n';
    else if (token.type === 'html') output += token.text ?? '';
    else if (token.type === 'link' && autolinkText(token) !== undefined) output += autolinkText(token);
    else if (Array.isArray(token.tokens)) output += plainText(token.tokens, depth + 1);
    else output += unescapeParser(token.text);
  }
  return output;
}

function inline(tokens: MarkdownToken[] | undefined, baseUrl: string | undefined, depth = 0): Piece[] {
  if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
  const output: (Piece | Piece[])[] = [];
  for (const [index, token] of (tokens ?? []).entries()) {
    const key = `${depth}-${index}`;
    if (token.type === 'html') {
      continue;
    }
    if (token.type === 'text' || token.type === 'escape') {
      output.push(Array.isArray(token.tokens) ? inline(token.tokens, baseUrl, depth + 1) : unescapeParser(token.text));
      continue;
    }
    if (token.type === 'strong') { output.push(React.createElement('strong', { key, className: 'muxui-markdown__strong' }, inline(token.tokens, baseUrl, depth + 1))); continue; }
    if (token.type === 'em') { output.push(React.createElement('em', { key, className: 'muxui-markdown__emphasis' }, inline(token.tokens, baseUrl, depth + 1))); continue; }
    if (token.type === 'del') { output.push(inline(token.tokens, baseUrl, depth + 1)); continue; }
    if (token.type === 'codespan') { output.push(React.createElement('code', { key, className: 'muxui-markdown__code' }, unescapeParser(token.text))); continue; }
    if (token.type === 'br') { output.push(React.createElement('br', { key, className: 'muxui-markdown__break' })); continue; }
    if (token.type === 'image') {
      const src = safeUrl(token.href, HTTP_PROTOCOLS, baseUrl);
      const alt = plainText(token.tokens, depth + 1);
      output.push(src ? React.createElement('img', { key, className: 'muxui-markdown__image', src, alt }) : alt);
      continue;
    }
    if (token.type === 'link') {
      // An autolink shows and links the spelling inside its angle brackets (see autolinkText); an email autolink
      // links with mailto:. Its children are still rendered first, so it meets the same depth limit as any link.
      const rendered = inline(token.tokens, baseUrl, depth + 1);
      const autolink = autolinkText(token);
      const children = autolink ?? rendered;
      const destination = autolink === undefined ? token.href : SCHEME.test(autolink) ? autolink : `mailto:${autolink}`;
      const href = safeUrl(destination, LINK_PROTOCOLS, baseUrl, true);
      output.push(href
        ? React.createElement('a', { key, className: 'muxui-link', href, rel: 'noreferrer noopener' }, children)
        : children);
      continue;
    }
    if (Array.isArray(token.tokens)) output.push(inline(token.tokens, baseUrl, depth + 1));
    else if (typeof token.text === 'string') output.push(token.text);
  }
  const merged: Piece[] = [];
  for (const value of output.flat()) {
    if (typeof value === 'string' && typeof merged.at(-1) === 'string') merged[merged.length - 1] += value;
    else merged.push(value);
  }
  return merged;
}

// In a tight list item, text renders inline without a paragraph, as CommonMark renders it. Text after another
// block starts on a new line, so text on either side of a dropped HTML block stays apart.
function blocks(tokens: MarkdownToken[] | undefined, baseUrl: string | undefined, depth = 0, counter = { value: 0 }, tight = false): ReactElement[] {
  if (depth > MARKDOWN_DEPTH_LIMIT) throw new Error('MARKDOWN_DEPTH_LIMIT_EXCEEDED');
  return (tokens ?? []).flatMap((token, index) => {
    const key = `${depth}-${index}`;
    if (token.type === 'space' || token.type === 'html' || token.type === 'def') return [];
    counter.value += 1;
    if (counter.value > MARKDOWN_NODE_LIMIT) throw new Error('MARKDOWN_NODE_LIMIT_EXCEEDED');
    // A heading token always has a depth.
    if (token.type === 'heading') return React.createElement(`h${Math.min(6, Math.max(1, token.depth!))}`, { key, className: 'muxui-markdown__heading' }, inline(token.tokens, baseUrl, depth + 1));
    if (tight && token.type === 'text') {
      return React.createElement(React.Fragment, { key }, index > 0 ? '\n' : undefined, inline(token.tokens ?? [{ type: 'text', text: token.text }], baseUrl, depth + 1));
    }
    if (token.type === 'paragraph' || token.type === 'text') return React.createElement('p', { key, className: 'muxui-markdown__paragraph' }, inline(token.tokens ?? [{ type: 'text', text: token.text }], baseUrl, depth + 1));
    if (token.type === 'code') {
      if (!(typeof token.raw === 'string' && (token.raw.startsWith('```') || token.raw.startsWith('~~~')))) {
        return React.createElement('p', { key, className: 'muxui-markdown__paragraph' }, token.text ?? '');
      }
      const language = typeof token.lang === 'string' ? token.lang.trim().split(/\s+/u, 1)[0].replace(/[^a-z0-9_-]/giu, '') : '';
      return React.createElement('pre', { key, className: 'muxui-markdown__code-block', 'data-muxui-language': language || undefined }, React.createElement('code', { className: 'muxui-markdown__code-block-content' }, token.text));
    }
    if (token.type === 'blockquote') return React.createElement('blockquote', { key, className: 'muxui-markdown__blockquote' }, blocks(token.tokens, baseUrl, depth + 1, counter));
    if (token.type === 'list') {
      const Tag = token.ordered ? 'ol' : 'ul';
      // An ordered list carries the number it starts at, which may be 0; a bullet list carries ''.
      const start = token.ordered && typeof token.start === 'number' && token.start !== 1 ? token.start : undefined;
      return React.createElement(Tag, { key, className: 'muxui-markdown__list', start }, (token.items ?? []).map((item, itemIndex) => React.createElement('li', { key: itemIndex, className: 'muxui-markdown__list-item' }, blocks(item.tokens, baseUrl, depth + 1, counter, !item.loose))));
    }
    if (token.type === 'hr') return React.createElement('hr', { key, className: 'muxui-markdown__rule' });
    if (Array.isArray(token.tokens)) return React.createElement('p', { key, className: 'muxui-markdown__paragraph' }, inline(token.tokens, baseUrl, depth + 1));
    return [];
  });
}

/** Renders a bounded Markdown subset. Raw HTML and unsafe URLs are removed. */
export const Markdown: ForwardRefExoticComponent<MarkdownProps & RefAttributes<HTMLDivElement>> = React.forwardRef<HTMLDivElement, MarkdownProps>(function Markdown({ source, baseUrl, invalidFallback = 'Content unavailable', className, dangerouslySetInnerHTML: _dangerous, ...props }, ref) {
  const failure = bounded(source);
  const safeBase = safeUrl(baseUrl, HTTP_PROTOCOLS);
  const rootProps = { ...props, ref, className: cx('muxui-markdown', className) };
  if (failure || (baseUrl !== undefined && safeBase === undefined)) {
    return React.createElement('div', { ...rootProps, 'data-muxui-markdown-error': failure ?? 'MARKDOWN_INVALID_BASE_URL' }, invalidFallback);
  }
  try {
    const lexer = new Lexer(LEXER_OPTIONS);
    const tokens = lexer.lex(source);
    assertBounds(tokens, lexer);
    return React.createElement('div', rootProps, blocks(tokens, safeBase));
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith('MARKDOWN_') ? error.message : 'MARKDOWN_PARSER_FAILED';
    return React.createElement('div', { ...rootProps, 'data-muxui-markdown-error': code }, invalidFallback);
  }
});
Markdown.displayName = 'Markdown';
