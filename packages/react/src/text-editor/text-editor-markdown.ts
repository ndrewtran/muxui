/**
 * Markdown to and from the TextEditor document, without the editor: pure, synchronous functions with no DOM, safe on a
 * server. `fromMarkdown` reads CommonMark plus GFM's `~~strike~~` into exactly the grammar `isTextEditorDocument`
 * accepts, and `toMarkdown` writes that grammar back. Both take linear time, and neither recurses deeper than the
 * editor's own nesting limit, so a large or deeply nested source cannot exhaust the stack.
 *
 * Read: paragraphs, ATX and setext headings 1 to 6, bullet and ordered lists (any start, nested), block quotes, fenced
 * code with its language, indented code, thematic breaks, hard breaks (two spaces or a backslash), emphasis, strong
 * emphasis, `~~strike~~`, code spans, inline links and autolinks, images, backslash escapes and character references.
 *
 * Written: `**bold**`, `*italic*` (`_` where `*` would be misread), `~~strike~~`, code spans with a fence longer than
 * any backtick run inside, `[text](address)` or `<address>`, `-` and `1.` lists (`*` and `1)` for a list right after
 * another of its kind), `>` quotes, fenced code (tildes when the language holds a backtick), `---` rules and `\` hard
 * breaks. Every character that would otherwise read as syntax is escaped, including `|`, `~`, `^` and a line-start
 * `:::` that common extensions read. There is no trailing newline, and an empty document writes an empty string.
 *
 * Links and images follow the editor's address rule (`normalizeTextEditorUrl`) both ways: a link keeps only an
 * absolute http, https or mailto address and an image an absolute http or https one, with no user name or password,
 * in its normalized form. Any other address, relative and fragment-only ones included, is dropped and its text kept.
 *
 * What the round trip normalizes or drops (once; a second round trip changes nothing):
 * - Reading: soft line breaks become spaces; spaces and tabs at the start and end of a line go; a hard break that ends
 *   a block goes and one in a heading becomes a space; link and image titles go; an image is a block, so one inside a
 *   paragraph splits it and one inside a link or heading becomes its description; a description is plain text of at
 *   most 1,000 characters; inline code takes no other formatting; a fence's info string keeps its first word as the
 *   language; indented code has no language; an ordered list from 0 starts at 1; tight and loose lists read alike; a
 *   list item that starts with another block gets an empty first paragraph; raw HTML stays literal text, an HTML
 *   block or a table keeping its lines as hard breaks; other syntax outside the subset (footnotes, task lists,
 *   reference links and definitions, bare addresses, single-tilde strike and other extensions) stays as CommonMark
 *   reads it, as literal text in a paragraph; named character references outside a common set stay as written;
 *   markers nested deeper than the editor holds (32 levels, a list counting two) stay literal text; NUL becomes
 *   U+FFFD and CR LF or CR becomes LF.
 * - Writing: underline, colour, font family and size, alignment and an ordered list's letter or roman numbering go;
 *   empty paragraphs go; line breaks inside text become spaces; an ordered list start is kept within 1 to 999999999;
 *   a code block's language keeps its first word; inside a list item, a code line of only spaces or tabs reads back
 *   empty, as Markdown takes it for a blank line; content nested deeper than the editor holds is written at the
 *   deepest level it allows.
 * - Both ways, formatting edges: bold, italic or strike that starts or ends on a space, or on punctuation that a letter
 *   touches from outside, gives up that space or punctuation, as Markdown cannot open or close it there. Where a
 *   paragraph still would not read back as written, each stretch between the spaces of its plain text that would not
 *   is written with the marks that go on past others closed and opened again around them, and failing that drops its
 *   italic, then strike, then bold, until it does, so the rest of the paragraph keeps its formatting.
 */
import type { TextEditorBlockNode, TextEditorDocument, TextEditorInlineNode, TextEditorListItemNode, TextEditorMark } from './index.ts';
import { normalizeAddress } from './text-editor-address.ts';

// The editor's grammar bounds, repeated here so this module never loads the editor; a test checks that they agree. The
// address rule is the editor's own, from a module that imports nothing.
/** The deepest block the editor's document holds: a quote's content is one level down, a list's item content two. */
const DEPTH_LIMIT = 32;
/** The longest image description the editor keeps. */
const ALT_LIMIT = 1_000;
/** The highest list start a CommonMark marker can hold (nine digits). */
const LIST_START_LIMIT = 999_999_999;

// Character classes for the flanking rules: Unicode whitespace (Zs, tab, line feed, form feed, carriage return) and
// Unicode punctuation (P and S). The start or end of the text counts as whitespace.
const WHITESPACE = /^[\p{Zs}\t\n\f\r]$/u;
const PUNCTUATION = /^[\p{P}\p{S}]$/u;
const SPACE = 0;
const PUNCT = 1;
const OTHER = 2;
type CharClass = typeof SPACE | typeof PUNCT | typeof OTHER;

function classOf(character: string): CharClass {
  if (character === '' || WHITESPACE.test(character)) return SPACE;
  return PUNCTUATION.test(character) ? PUNCT : OTHER;
}

/** The code point that ends before `index`, or '' at the start. */
function charBefore(text: string, index: number): string {
  if (index <= 0) return '';
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text.charAt(index - 1);
}

/** The code point that starts at `index`, or '' at the end. */
function charAt(text: string, index: number): string {
  if (index >= text.length) return '';
  const high = text.charCodeAt(index);
  if (high >= 0xd800 && high <= 0xdbff && index + 1 < text.length) {
    const low = text.charCodeAt(index + 1);
    if (low >= 0xdc00 && low <= 0xdfff) return text.slice(index, index + 2);
  }
  return text.charAt(index);
}

/** Whether a delimiter run between `before` and `after` is left- and right-flanking, as CommonMark defines them. */
function flanking(before: string, after: string): { left: boolean; right: boolean; beforePunct: boolean; afterPunct: boolean } {
  const b = classOf(before);
  const a = classOf(after);
  return { left: a !== SPACE && (a !== PUNCT || b !== OTHER), right: b !== SPACE && (b !== PUNCT || a !== OTHER), beforePunct: b === PUNCT, afterPunct: a === PUNCT };
}

function isAsciiPunctuation(code: number): boolean {
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
}

// Named character references decoded on reading; any other name stays as written. Numeric references always decode.
const ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"], ['nbsp', '\u00a0'], ['shy', '\u00ad'],
  ['ensp', '\u2002'], ['emsp', '\u2003'], ['thinsp', '\u2009'], ['zwnj', '\u200c'], ['zwj', '\u200d'],
  ['ndash', '\u2013'], ['mdash', '\u2014'], ['lsquo', '\u2018'], ['rsquo', '\u2019'], ['ldquo', '\u201c'],
  ['rdquo', '\u201d'], ['laquo', '\u00ab'], ['raquo', '\u00bb'], ['bull', '\u2022'], ['middot', '\u00b7'],
  ['hellip', '\u2026'], ['copy', '\u00a9'], ['reg', '\u00ae'], ['trade', '\u2122'], ['deg', '\u00b0'],
  ['times', '\u00d7'], ['divide', '\u00f7'], ['plusmn', '\u00b1'], ['euro', '\u20ac'], ['pound', '\u00a3'],
  ['yen', '\u00a5'], ['cent', '\u00a2'], ['sect', '\u00a7'], ['para', '\u00b6'], ['larr', '\u2190'],
  ['rarr', '\u2192'], ['uarr', '\u2191'], ['darr', '\u2193'], ['harr', '\u2194'],
]);
const REFERENCE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/y;

/** The text a character reference stands for, or null for a name outside the decoded set. */
function decodeReference(hex: string | undefined, decimal: string | undefined, name: string | undefined): string | null {
  if (name !== undefined) return ENTITIES.get(name) ?? null;
  const code = hex !== undefined ? parseInt(hex, 16) : Number(decimal);
  return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
}

/** Resolves backslash escapes and character references, as in link destinations and info strings. */
function unescapeString(value: string): string {
  return value.replace(/\\([!-/:-@[-`{-~])|&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g, (match, escaped: string | undefined, hex: string | undefined, decimal: string | undefined, name: string | undefined) => (
    escaped ?? decodeReference(hex, decimal, name) ?? match
  ));
}

// ---------------------------------------------------------------------------------------------------------------------
// Inline content
//
// A block's inline content is a list of runs: text with its formatting, inline code (which takes no other formatting,
// as the editor's code mark excludes every other), and hard breaks. Reading also yields images, which the editor holds
// as blocks.

type EmphasisMark = 'bold' | 'italic' | 'strike';
type TextRun = { kind: 'text'; text: string; bold: boolean; italic: boolean; strike: boolean; link: string | null };
type Run = TextRun | { kind: 'code'; text: string } | { kind: 'break' };
type Piece = Run | { kind: 'image'; src: string; alt: string };
const EMPHASIS: readonly EmphasisMark[] = ['bold', 'italic', 'strike'];

// The inline parser keeps its output flat: atoms (text, code, hard breaks, images) in source order, with emphasis and
// links as ranges over atom indexes. Nothing nests, so no input can exhaust the stack, and every step is linear: code
// spans find their closing run through an index of backtick runs, a link deactivates the openers before it in one
// step, emphasis follows CommonMark's delimiter algorithm with its per-kind lower bounds, and raw HTML remembers where
// a closing sequence was not found.
const ATOM_TEXT = 0;
const ATOM_CODE = 1;
const ATOM_BREAK = 2;
const ATOM_IMAGE = 3;
type Atom = { kind: typeof ATOM_TEXT | typeof ATOM_CODE | typeof ATOM_BREAK | typeof ATOM_IMAGE; text: string; hidden: boolean; src: string | null };
type Delimiter = { atom: number; char: number; count: number; size: number; canOpen: boolean; canClose: boolean; previous: Delimiter | null; next: Delimiter | null };
type Bracket = { atom: number; image: boolean; delimiter: Delimiter | null; spans: number; links: number };

const AUTOLINK = /<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\u0000-\u0020\u007f]*)>/y;
const AUTOLINK_EMAIL = /<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)>/y;
const OPEN_TAG = /<[A-Za-z][A-Za-z0-9-]*(?:[ \t\n]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t\n]*=[ \t\n]*(?:[^ \t\n"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t\n]*\/?>/y;
const CLOSE_TAG = /<\/[A-Za-z][A-Za-z0-9-]*[ \t\n]*>/y;

function isSpecial(code: number): boolean {
  return code === 10 || code === 33 || code === 38 || code === 42 || code === 60 || code === 91 || code === 92 || code === 93 || code === 95 || code === 96 || code === 126;
}

/** Spaces and tabs, at most one line ending, then spaces and tabs again. */
function skipSpace(source: string, index: number): number {
  let position = index;
  while (source.charCodeAt(position) === 32 || source.charCodeAt(position) === 9) position += 1;
  if (source.charCodeAt(position) === 10) {
    position += 1;
    while (source.charCodeAt(position) === 32 || source.charCodeAt(position) === 9) position += 1;
  }
  return position;
}

/** The index after a link title that starts at `index`, or -1. */
function titleEnd(source: string, index: number): number {
  const open = source.charCodeAt(index);
  const close = open === 40 ? 41 : open === 34 || open === 39 ? open : -1;
  if (close < 0) return -1;
  for (let position = index + 1; position < source.length; position += 1) {
    const code = source.charCodeAt(position);
    if (code === 92) position += 1;
    else if (code === close) return position + 1;
    else if (open === 40 && code === 40) return -1;
  }
  return -1;
}

/** An inline link's `(destination "title")` from `start`, which must hold `(`: its destination and the index after it. */
function linkTail(source: string, start: number): { destination: string; end: number } | null {
  if (source.charCodeAt(start) !== 40) return null;
  let position = skipSpace(source, start + 1);
  let destination: string;
  if (source.charCodeAt(position) === 60) {
    let index = position + 1;
    for (;;) {
      if (index >= source.length) return null;
      const code = source.charCodeAt(index);
      if (code === 10 || code === 60) return null;
      if (code === 62) break;
      index += code === 92 && isAsciiPunctuation(source.charCodeAt(index + 1)) ? 2 : 1;
    }
    destination = unescapeString(source.slice(position + 1, index));
    position = index + 1;
  } else {
    // A bare destination: no space or control character, and parentheses only in balanced pairs, nested at most 32 deep.
    let index = position;
    let depth = 0;
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (code === 92 && isAsciiPunctuation(source.charCodeAt(index + 1))) {
        index += 2;
        continue;
      }
      if (code <= 32 || code === 127) break;
      if (code === 40) {
        depth += 1;
        if (depth > 32) return null;
      } else if (code === 41) {
        if (depth === 0) break;
        depth -= 1;
      }
      index += 1;
    }
    if (depth !== 0 || (index === position && source.charCodeAt(index) !== 41)) return null;
    destination = unescapeString(source.slice(position, index));
    position = index;
  }
  const afterDestination = position;
  position = skipSpace(source, position);
  // A title needs space before it; it is read past and dropped.
  if (position > afterDestination) {
    const title = titleEnd(source, position);
    if (title > 0) position = skipSpace(source, title);
  }
  return source.charCodeAt(position) === 41 ? { destination, end: position + 1 } : null;
}

/**
 * The runs of inline Markdown. With `images`, an image outside any link with an address the editor keeps is returned as
 * an image piece; any other image gives its description as text.
 */
function parseInline(source: string, images: boolean): Piece[] {
  const atoms: Atom[] = [];
  const emphasis: { from: number; to: number; mark: EmphasisMark }[] = [];
  const links: { from: number; to: number; href: string }[] = [];
  const brackets: Bracket[] = [];
  const chunks: string[] = [];
  let first: Delimiter | null = null;
  let last: Delimiter | null = null;
  // Link openers below this index are inactive: a link cannot contain another.
  let linkFloor = 0;
  let pos = 0;

  const flush = () => {
    if (chunks.length === 0) return;
    atoms.push({ kind: ATOM_TEXT, text: chunks.join(''), hidden: false, src: null });
    chunks.length = 0;
  };
  const push = (kind: Atom['kind'], text: string) => {
    flush();
    atoms.push({ kind, text, hidden: false, src: null });
    return atoms.length - 1;
  };
  const unlink = (delimiter: Delimiter) => {
    if (delimiter.previous) delimiter.previous.next = delimiter.next;
    else first = delimiter.next;
    if (delimiter.next) delimiter.next.previous = delimiter.previous;
    else last = delimiter.previous;
  };

  // CommonMark's process emphasis for the delimiters above `bottom`, with GFM strike as pairs of `~~`. Each kind of closer
  // searches for an opener only above its floor, the position of the delimiter below the last closer of its kind that
  // found none. The floor is a position in the text, not a delimiter: a match can take that delimiter out of the list,
  // and a search would then never meet it and go to the bottom every time.
  const processEmphasis = (bottom: Delimiter | null) => {
    const base = bottom ? bottom.atom : -1;
    const floors = Array.from({ length: 13 }, () => base);
    let closer = bottom ? bottom.next : first;
    while (closer) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const slot = closer.char === 126 ? 12 : (closer.char === 95 ? 6 : 0) + (closer.canOpen ? 3 : 0) + (closer.size % 3);
      let opener = closer.previous;
      while (opener && opener.atom > floors[slot]) {
        const odd = closer.char !== 126 && (closer.canOpen || opener.canClose) && closer.size % 3 !== 0 && (opener.size + closer.size) % 3 === 0;
        if (opener.char === closer.char && opener.canOpen && !odd) break;
        opener = opener.previous;
      }
      if (opener && opener.atom > floors[slot]) {
        const use = closer.char === 126 || (closer.count >= 2 && opener.count >= 2) ? 2 : 1;
        emphasis.push({ from: opener.atom + 1, to: closer.atom, mark: closer.char === 126 ? 'strike' : use === 2 ? 'bold' : 'italic' });
        opener.count -= use;
        closer.count -= use;
        atoms[opener.atom].text = atoms[opener.atom].text.slice(use);
        atoms[closer.atom].text = atoms[closer.atom].text.slice(use);
        opener.next = closer;
        closer.previous = opener;
        if (opener.count === 0) unlink(opener);
        if (closer.count === 0) {
          const next: Delimiter | null = closer.next;
          unlink(closer);
          closer = next;
        }
      } else {
        const current: Delimiter = closer;
        closer = current.next;
        floors[slot] = Math.max(floors[slot], current.previous ? current.previous.atom : base);
        if (!current.canOpen) unlink(current);
      }
    }
    if (bottom) {
      bottom.next = null;
      last = bottom;
    } else {
      first = null;
      last = null;
    }
  };

  let ticks: Map<number, number[]> | null = null;
  const tickCursors = new Map<number, number>();
  // The start of the first backtick run of exactly `size` at or after `from`, or -1.
  const closingTicks = (from: number, size: number): number => {
    if (ticks === null) {
      ticks = new Map();
      for (let index = source.indexOf('`'); index >= 0;) {
        let stop = index;
        while (source.charCodeAt(stop) === 96) stop += 1;
        const list = ticks.get(stop - index);
        if (list) list.push(index);
        else ticks.set(stop - index, [index]);
        index = source.indexOf('`', stop);
      }
    }
    const list = ticks.get(size);
    if (!list) return -1;
    let cursor = tickCursors.get(size) ?? 0;
    while (cursor < list.length && list[cursor] < from) cursor += 1;
    tickCursors.set(size, cursor);
    return cursor < list.length ? list[cursor] : -1;
  };

  const searched = new Map<string, { from: number; at: number }>();
  // indexOf that remembers its last answer, so repeated searches for one closing sequence stay linear.
  const find = (needle: string, from: number): number => {
    const known = searched.get(needle);
    if (known && from >= known.from && (known.at < 0 || known.at >= from)) return known.at;
    const at = source.indexOf(needle, from);
    searched.set(needle, { from, at });
    return at;
  };
  const rawHtmlEnd = (start: number): number => {
    if (source.startsWith('<!--', start)) {
      if (source.startsWith('<!-->', start)) return start + 5;
      if (source.startsWith('<!--->', start)) return start + 6;
      const close = find('-->', start + 4);
      return close < 0 ? -1 : close + 3;
    }
    if (source.startsWith('<?', start)) {
      const close = find('?>', start + 2);
      return close < 0 ? -1 : close + 2;
    }
    if (source.startsWith('<![CDATA[', start)) {
      const close = find(']]>', start + 9);
      return close < 0 ? -1 : close + 3;
    }
    if (source.charCodeAt(start + 1) === 33 && /[A-Za-z]/.test(source.charAt(start + 2))) {
      const close = find('>', start + 2);
      return close < 0 ? -1 : close + 1;
    }
    OPEN_TAG.lastIndex = start;
    if (OPEN_TAG.test(source)) return OPEN_TAG.lastIndex;
    CLOSE_TAG.lastIndex = start;
    return CLOSE_TAG.test(source) ? CLOSE_TAG.lastIndex : -1;
  };

  const closeBracket = () => {
    const index = brackets.length - 1;
    const opener = brackets[index];
    const tail = opener !== undefined && (opener.image || index >= linkFloor) ? linkTail(source, pos + 1) : null;
    if (opener === undefined || tail === null) {
      brackets.pop();
      if (linkFloor > brackets.length) linkFloor = brackets.length;
      chunks.push(']');
      pos += 1;
      return;
    }
    flush();
    processEmphasis(opener.delimiter);
    if (opener.image) {
      // The description is plain text; the atoms it came from, and any emphasis or link in it, are gone.
      let alt = '';
      for (let atom = opener.atom + 1; atom < atoms.length; atom += 1) {
        if (!atoms[atom].hidden) alt += atoms[atom].kind === ATOM_BREAK ? ' ' : atoms[atom].text;
      }
      atoms.length = opener.atom;
      atoms.push({ kind: ATOM_IMAGE, text: alt, hidden: false, src: normalizeAddress(tail.destination, 'image') });
      emphasis.length = opener.spans;
      links.length = opener.links;
    } else {
      const href = normalizeAddress(tail.destination, 'link');
      if (href !== null) links.push({ from: opener.atom + 1, to: atoms.length, href });
      atoms[opener.atom].hidden = true;
      linkFloor = index;
    }
    brackets.pop();
    if (linkFloor > brackets.length) linkFloor = brackets.length;
    pos = tail.end;
  };

  while (pos < source.length) {
    const code = source.charCodeAt(pos);
    if (code === 10) {
      // Two or more spaces before a line end make a hard break; otherwise the line end is a space.
      let spaces = 0;
      while (chunks.length > 0) {
        const chunk = chunks[chunks.length - 1];
        let index = chunk.length;
        while (index > 0 && chunk.charCodeAt(index - 1) === 32) index -= 1;
        spaces += chunk.length - index;
        if (index > 0) {
          if (index < chunk.length) chunks[chunks.length - 1] = chunk.slice(0, index);
          break;
        }
        chunks.pop();
      }
      if (spaces >= 2) push(ATOM_BREAK, '');
      else chunks.push(' ');
      pos += 1;
      while (source.charCodeAt(pos) === 32) pos += 1;
    } else if (code === 92) {
      const next = source.charCodeAt(pos + 1);
      if (next === 10) {
        push(ATOM_BREAK, '');
        pos += 2;
      } else if (isAsciiPunctuation(next)) {
        chunks.push(source.charAt(pos + 1));
        pos += 2;
      } else {
        chunks.push('\\');
        pos += 1;
      }
    } else if (code === 96) {
      let after = pos;
      while (source.charCodeAt(after) === 96) after += 1;
      const size = after - pos;
      const close = closingTicks(after, size);
      if (close < 0) {
        chunks.push(source.slice(pos, after));
        pos = after;
      } else {
        let content = source.slice(after, close).replace(/\n/g, ' ');
        if (content.length >= 2 && content.charCodeAt(0) === 32 && content.charCodeAt(content.length - 1) === 32 && /[^ ]/.test(content)) content = content.slice(1, -1);
        push(ATOM_CODE, content);
        pos = close + size;
      }
    } else if (code === 42 || code === 95 || code === 126) {
      let after = pos;
      while (source.charCodeAt(after) === code) after += 1;
      const run = source.slice(pos, after);
      const marks = flanking(charBefore(source, pos), charAt(source, after));
      const canOpen = code === 95 ? marks.left && (!marks.right || marks.beforePunct) : marks.left;
      const canClose = code === 95 ? marks.right && (!marks.left || marks.afterPunct) : marks.right;
      // Only a pair of tildes strikes; one tilde, or three or more, is text.
      if ((canOpen || canClose) && (code !== 126 || run.length === 2)) {
        const delimiter: Delimiter = { atom: push(ATOM_TEXT, run), char: code, count: run.length, size: run.length, canOpen, canClose, previous: last, next: null };
        if (last) last.next = delimiter;
        else first = delimiter;
        last = delimiter;
      } else {
        chunks.push(run);
      }
      pos = after;
    } else if (code === 91 || (code === 33 && source.charCodeAt(pos + 1) === 91)) {
      const image = code === 33;
      brackets.push({ atom: push(ATOM_TEXT, image ? '![' : '['), image, delimiter: last, spans: emphasis.length, links: links.length });
      pos += image ? 2 : 1;
    } else if (code === 93) {
      closeBracket();
    } else if (code === 60) {
      AUTOLINK.lastIndex = pos;
      AUTOLINK_EMAIL.lastIndex = pos;
      const uri = AUTOLINK.exec(source);
      const email = uri ? null : AUTOLINK_EMAIL.exec(source);
      const autolink = uri ?? email;
      if (autolink) {
        // An autolink's text is its address as written; the link needs an address the editor keeps.
        const atom = push(ATOM_TEXT, autolink[1]);
        const href = normalizeAddress(email ? `mailto:${autolink[1]}` : autolink[1], 'link');
        if (href !== null) links.push({ from: atom, to: atom + 1, href });
        pos += autolink[0].length;
      } else {
        // Raw HTML is kept as the text it is, unread.
        const html = rawHtmlEnd(pos);
        chunks.push(html > 0 ? source.slice(pos, html) : '<');
        pos = html > 0 ? html : pos + 1;
      }
    } else if (code === 38) {
      REFERENCE.lastIndex = pos;
      const match = REFERENCE.exec(source);
      const decoded = match ? decodeReference(match[1], match[2], match[3]) : null;
      chunks.push(decoded ?? '&');
      pos += match && decoded !== null ? match[0].length : 1;
    } else {
      let next = pos + 1;
      while (next < source.length && !isSpecial(source.charCodeAt(next))) next += 1;
      chunks.push(source.slice(pos, next));
      pos = next;
    }
  }
  flush();
  processEmphasis(null);

  const count = atoms.length;
  const depths = { bold: new Int32Array(count + 1), italic: new Int32Array(count + 1), strike: new Int32Array(count + 1) };
  for (const span of emphasis) {
    depths[span.mark][span.from] += 1;
    depths[span.mark][span.to] -= 1;
  }
  const hrefs = new Array<string | null>(count).fill(null);
  for (const link of links) for (let atom = link.from; atom < link.to; atom += 1) hrefs[atom] = link.href;
  const pieces: Piece[] = [];
  let bold = 0;
  let italic = 0;
  let strike = 0;
  for (let index = 0; index < count; index += 1) {
    bold += depths.bold[index];
    italic += depths.italic[index];
    strike += depths.strike[index];
    const atom = atoms[index];
    if (atom.hidden) continue;
    if (atom.kind === ATOM_BREAK) pieces.push({ kind: 'break' });
    else if (atom.kind === ATOM_CODE) pieces.push({ kind: 'code', text: atom.text });
    else if (atom.kind === ATOM_IMAGE && images && hrefs[index] === null && atom.src !== null) pieces.push({ kind: 'image', src: atom.src, alt: atom.text });
    else if (atom.text !== '') pieces.push({ kind: 'text', text: atom.text, bold: bold > 0, italic: italic > 0, strike: strike > 0, link: hrefs[index] });
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------------------------------
// The canonical form of inline content, which both directions produce, so that what `fromMarkdown` returns writes and
// reads back unchanged.

function sameStyle(a: TextRun, b: TextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.link === b.link;
}

function sameRuns(a: readonly Run[], b: readonly Run[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((run, index) => {
    const other = b[index];
    if (run.kind === 'break' || other.kind === 'break') return run.kind === other.kind;
    if (run.kind === 'code' || other.kind === 'code') return run.kind === other.kind && run.text === other.text;
    return run.text === other.text && sameStyle(run, other);
  });
}

/** Joins neighbouring runs of one formatting and drops empty ones. */
function merge(runs: readonly Run[]): Run[] {
  const merged: Run[] = [];
  for (const run of runs) {
    if (run.kind !== 'break' && run.text === '') continue;
    const previous = merged[merged.length - 1];
    if (previous?.kind === 'text' && run.kind === 'text' && sameStyle(previous, run)) merged[merged.length - 1] = { ...previous, text: previous.text + run.text };
    else if (previous?.kind === 'code' && run.kind === 'code') merged[merged.length - 1] = { kind: 'code', text: previous.text + run.text };
    else merged.push(run);
  }
  return merged;
}

const isBlank = (code: number) => code === 32 || code === 9;

/** Drops the spaces and tabs that start a line or end the block, and hard breaks that end it: Markdown cannot hold them. */
function trimLines(runs: readonly Run[]): Run[] {
  const trimmed: Run[] = [];
  let lineStart = true;
  for (const run of runs) {
    if (lineStart && run.kind === 'text') {
      let index = 0;
      while (index < run.text.length && isBlank(run.text.charCodeAt(index))) index += 1;
      if (index === run.text.length) continue;
      trimmed.push(index > 0 ? { ...run, text: run.text.slice(index) } : run);
    } else {
      trimmed.push(run);
    }
    lineStart = run.kind === 'break';
  }
  for (;;) {
    const last = trimmed[trimmed.length - 1];
    if (last === undefined || last.kind === 'code') break;
    if (last.kind === 'break') {
      trimmed.pop();
      continue;
    }
    let index = last.text.length;
    while (index > 0 && isBlank(last.text.charCodeAt(index - 1))) index -= 1;
    if (index === 0) {
      trimmed.pop();
      continue;
    }
    if (index < last.text.length) trimmed[trimmed.length - 1] = { ...last, text: last.text.slice(0, index) };
    break;
  }
  return trimmed;
}

// Emphasis is placed per unit: outside links each run is a unit, except that the runs of one link form a single link
// unit; inside a link each of its runs is one. Bold, italic or strike spans a sequence of units, and inline code and
// hard breaks inside it carry nothing but do not end it.
type Unit = { kind: 'text' | 'code' | 'break' | 'link'; from: number; to: number };
type Ranges = { ranges: [number, number][]; demoted: Set<number>; cuts: Map<number, [number, number]> };

function topUnits(runs: readonly Run[]): Unit[] {
  const units: Unit[] = [];
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (run.kind === 'text' && run.link !== null) {
      let to = index + 1;
      for (let next = runs[to]; next?.kind === 'text' && next.link === run.link; next = runs[to]) to += 1;
      units.push({ kind: 'link', from: index, to });
      index = to - 1;
    } else {
      units.push({ kind: run.kind, from: index, to: index + 1 });
    }
  }
  return units;
}

function linkUnits(unit: Unit): Unit[] {
  return Array.from({ length: unit.to - unit.from }, (_, offset): Unit => ({ kind: 'text', from: unit.from + offset, to: unit.from + offset + 1 }));
}

/** True when every text run of the unit has the mark, false when one lacks it, null for code and breaks. */
function carries(runs: readonly Run[], unit: Unit, mark: EmphasisMark): boolean | null {
  if (unit.kind === 'code' || unit.kind === 'break') return null;
  for (let index = unit.from; index < unit.to; index += 1) {
    const run = runs[index];
    if (run.kind !== 'text' || !run[mark]) return false;
  }
  return true;
}

// The first and last character a unit writes, for the flanking rules: a link starts with `[` or `<` and ends with `)`
// or `>`, code with a backtick, and a hard break with a backslash and a line end.
function firstWritten(runs: readonly Run[], unit: Unit): string {
  const run = runs[unit.from];
  if (unit.kind === 'link') return '[';
  return run.kind === 'text' ? charAt(run.text, 0) : run.kind === 'code' ? '`' : '\\';
}

function lastWritten(runs: readonly Run[], unit: Unit): string {
  const run = runs[unit.to - 1];
  if (unit.kind === 'link') return ')';
  return run.kind === 'text' ? charBefore(run.text, run.text.length) : run.kind === 'code' ? '`' : '\n';
}

/**
 * Where a mark can be written over units. An opening delimiter must be followed by something other than a space, and
 * by punctuation only when a letter does not touch it from outside; a closing one likewise mirrored. So a span gives up
 * (cuts) the spaces and such punctuation at its edges, and a link at an edge that a letter touches from outside is
 * demoted: the mark is then written inside the link's text. `outside` is the character before and after the units.
 */
function markRanges(runs: readonly Run[], units: readonly Unit[], mark: EmphasisMark, outside: readonly [string, string]): Ranges {
  const ranges: [number, number][] = [];
  const demoted = new Set<number>();
  const cuts = new Map<number, [number, number]>();
  const before = (index: number) => (index === 0 ? outside[0] : lastWritten(runs, units[index - 1]));
  const after = (index: number) => (index === units.length - 1 ? outside[1] : firstWritten(runs, units[index + 1]));
  let index = 0;
  while (index < units.length) {
    if (carries(runs, units[index], mark) !== true) {
      index += 1;
      continue;
    }
    let last = index;
    for (let next = index + 1; next < units.length; next += 1) {
      const carried = carries(runs, units[next], mark);
      if (carried === false) break;
      if (carried) last = next;
    }
    let start = index;
    let end = last;
    let leftRun = -1;
    let leftKeep = 0;
    while (start <= end) {
      const unit = units[start];
      const run = runs[unit.from];
      if (unit.kind === 'link') {
        if (classOf(before(start)) !== OTHER) break;
        demoted.add(start);
        start += 1;
      } else if (run.kind !== 'text') {
        start += 1;
      } else {
        let keep = 0;
        let previous = before(start);
        while (keep < run.text.length) {
          const character = charAt(run.text, keep);
          const kind = classOf(character);
          if (kind !== SPACE && (kind !== PUNCT || classOf(previous) !== OTHER)) break;
          keep += character.length;
          previous = character;
        }
        if (keep < run.text.length) {
          if (keep > 0) cuts.set(unit.from, [keep, run.text.length]);
          leftRun = unit.from;
          leftKeep = keep;
          break;
        }
        cuts.set(unit.from, [0, 0]);
        start += 1;
      }
    }
    while (end >= start) {
      const unit = units[end];
      const run = runs[unit.from];
      if (unit.kind === 'link') {
        if (classOf(after(end)) !== OTHER) break;
        demoted.add(end);
        end -= 1;
      } else if (run.kind !== 'text') {
        end -= 1;
      } else {
        const floor = unit.from === leftRun ? leftKeep : 0;
        let keep = run.text.length;
        let next = after(end);
        while (keep > floor) {
          const character = charBefore(run.text, keep);
          const kind = classOf(character);
          if (kind !== SPACE && (kind !== PUNCT || classOf(next) !== OTHER)) break;
          keep -= character.length;
          next = character;
        }
        if (keep > floor) {
          if (keep < run.text.length || floor > 0) cuts.set(unit.from, [floor, keep]);
          break;
        }
        cuts.set(unit.from, [0, 0]);
        end -= 1;
      }
    }
    if (start <= end) ranges.push([start, end]);
    index = last + 1;
  }
  return { ranges, demoted, cuts };
}

function coveredUnits(ranges: readonly [number, number][]): Set<number> {
  const covered = new Set<number>();
  for (const [start, end] of ranges) for (let unit = start; unit <= end; unit += 1) covered.add(unit);
  return covered;
}

/**
 * The canonical form of inline content: no line ends in text, no hard breaks in a heading (each becomes a space), no
 * spaces at line edges or hard breaks at the end, and bold, italic and strike only where Markdown can open and close
 * them. It changes no text, only where formatting starts and ends.
 */
function canonicalRuns(input: readonly Run[], heading: boolean): Run[] {
  const runs = trimLines(merge(input.map((run): Run => {
    if (run.kind === 'break') return heading ? { kind: 'text', text: ' ', bold: false, italic: false, strike: false, link: null } : run;
    return { ...run, text: run.text.replace(/\r\n|\r|\n/g, ' ') };
  })));
  const units = topUnits(runs);
  const cuts = EMPHASIS.map((mark) => {
    const top = markRanges(runs, units, mark, ['', '']);
    const covered = coveredUnits(top.ranges);
    const markCuts = new Map(top.cuts);
    units.forEach((unit, index) => {
      if (unit.kind !== 'link' || covered.has(index)) return;
      for (const [run, cut] of markRanges(runs, linkUnits(unit), mark, ['[', ']']).cuts) markCuts.set(run, cut);
    });
    return markCuts;
  });
  if (cuts.every((markCuts) => markCuts.size === 0)) return runs;
  const rebuilt: Run[] = [];
  runs.forEach((run, index) => {
    const kept = cuts.map((markCuts) => markCuts.get(index));
    if (run.kind !== 'text' || kept.every((cut) => cut === undefined)) {
      rebuilt.push(run);
      return;
    }
    const points = [...new Set([0, run.text.length, ...kept.flatMap((cut) => cut ?? [])])].sort((a, b) => a - b);
    for (let point = 0; point + 1 < points.length; point += 1) {
      const from = points[point];
      const to = points[point + 1];
      const outsideOf = (cut: [number, number] | undefined) => cut !== undefined && (from < cut[0] || to > cut[1]);
      rebuilt.push({ ...run, text: run.text.slice(from, to), bold: run.bold && !outsideOf(kept[0]), italic: run.italic && !outsideOf(kept[1]), strike: run.strike && !outsideOf(kept[2]) });
    }
  });
  return merge(rebuilt);
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing inline content

type Style = { readonly bold: string; readonly italic: string; readonly strike: string; readonly alternate: boolean; readonly reopen: boolean };
// `reopens` notes a boundary where a reopening style would differ, so that one is tried only where it can differ.
type WriteState = { readonly out: string[]; lineStart: boolean; readonly style: Style; reopens: boolean };
// `**` and `*` by default; `__` or `_` where a delimiter would otherwise fuse with a closing one beside it. An underscore
// cannot open or close inside a word, so the fourth style keeps the asterisks side by side, which CommonMark can still
// part, as in `**b***c*`. Each is tried again reopening: where several delimiters would open after a letter or close
// before one, the marks that go on there close first and open again, as in `*a*~~***b***~~`.
const STYLES: readonly Style[] = [
  { bold: '**', italic: '*', strike: '~~', alternate: true, reopen: false },
  { bold: '**', italic: '_', strike: '~~', alternate: true, reopen: false },
  { bold: '__', italic: '*', strike: '~~', alternate: true, reopen: false },
  { bold: '**', italic: '*', strike: '~~', alternate: false, reopen: false },
];
// The same styles, reopening, in the same order.
const REOPENING: readonly Style[] = [
  { bold: '**', italic: '*', strike: '~~', alternate: true, reopen: true },
  { bold: '**', italic: '_', strike: '~~', alternate: true, reopen: true },
  { bold: '__', italic: '*', strike: '~~', alternate: true, reopen: true },
  { bold: '**', italic: '*', strike: '~~', alternate: false, reopen: true },
];
const DROPS: readonly (readonly EmphasisMark[])[] = [[], ['italic'], ['italic', 'strike'], ['italic', 'strike', 'bold']];

const alternate = (delimiter: string) => (delimiter === '**' ? '__' : delimiter === '__' ? '**' : delimiter === '*' ? '_' : delimiter === '_' ? '*' : delimiter);

/** Text with a backslash before every character that would read as syntax; `lineStart` also guards block syntax. */
function escapeText(text: string, lineStart: boolean): string {
  const escaped = text.replace(/[\\`*[\]<~|^]|_|&(?=#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]{1,31};)/g, (match, offset: number) => (
    // An underscore between two letters cannot open or close emphasis, so it stays bare.
    match === '_' && classOf(charBefore(text, offset)) === OTHER && classOf(charAt(text, offset + 1)) === OTHER ? '_' : `\\${match}`
  ));
  if (!lineStart) return escaped;
  const ordered = /^(\d{1,9})([.)])(?=[ \t]|$)/.exec(escaped);
  if (ordered) return `${ordered[1]}\\${escaped.slice(ordered[1].length)}`;
  // ATX headings, quotes, bullets, setext underlines, thematic breaks, and the `:::` containers of extensions.
  return /^(?:#{1,6}(?=[ \t]|$)|>|[-+](?=[ \t]|$)|:::|=+[ \t]*$|-+[ \t]*$|(?:-[ \t]*){3,}$)/.test(escaped) ? `\\${escaped}` : escaped;
}

/** Inline code with a fence longer than any backtick run inside, padded where CommonMark would trim or fuse it. */
function codeSpan(text: string): string {
  let longest = 0;
  let run = 0;
  for (let index = 0; index < text.length; index += 1) {
    run = text.charCodeAt(index) === 96 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  const fence = '`'.repeat(longest + 1);
  const pad = text.charCodeAt(0) === 96 || text.charCodeAt(text.length - 1) === 96 || (text.length >= 2 && text.charCodeAt(0) === 32 && text.charCodeAt(text.length - 1) === 32 && /[^ ]/.test(text)) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** A link or image address: bare when it can be, otherwise in angle brackets. */
function destination(href: string): string {
  const escaped = href.replace(/\\|&(?=#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};|[A-Za-z][A-Za-z0-9]{1,31};)/g, '\\$&');
  return /^[^\u0000-\u0020\u007f()<>]+$/.test(href) ? escaped : `<${escaped.replace(/[<>]/g, '\\$&')}>`;
}

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

/** The text of a link written as `<text>`, when that reads back as the same link, or null. */
function autolinkText(text: string, href: string): string | null {
  if (/^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\u0000-\u0020\u007f]*$/.test(text)) return normalizeAddress(text, 'link') === href ? text : null;
  if (EMAIL.test(text)) return normalizeAddress(`mailto:${text}`, 'link') === href ? text : null;
  return null;
}

function emit(state: WriteState, text: string) {
  if (text === '') return;
  state.out.push(text);
  state.lineStart = false;
}

/** How many runs of one repeated character a string of delimiters is, as `***~~` is two. */
function delimiterRuns(delimiters: string): number {
  let count = 0;
  for (let index = 0; index < delimiters.length; index += 1) if (delimiters[index] !== delimiters[index - 1]) count += 1;
  return count;
}

/** Writes units with the marks given, opening the mark that runs furthest outermost and reopening one that a closing mark interrupts. */
function writeUnits(runs: readonly Run[], units: readonly Unit[], marks: readonly EmphasisMark[], outside: readonly [string, string], state: WriteState) {
  const plans = marks.map((mark) => ({ mark, ranges: markRanges(runs, units, mark, outside).ranges }));
  const ends = plans.map(({ ranges }) => {
    const reach = new Int32Array(units.length).fill(-1);
    for (const [start, end] of ranges) for (let unit = start; unit <= end; unit += 1) reach[unit] = end;
    return reach;
  });
  const stack: { plan: number; delimiter: string }[] = [];
  // Between two letters, delimiters flank only where a closing one comes first and an opening one last. True where with
  // the stack closed down to `lowest` several runs of delimiters would open after a letter, or close before one.
  const unflanked = (index: number, lowest: number) => {
    const opens = lowest === stack.length;
    if (!opens && stack.length - lowest < 2) return false;
    const opening = plans.map((_, plan) => plan).filter((plan) => ends[plan][index] >= 0 && !stack.slice(0, lowest).some((entry) => entry.plan === plan));
    if (opens) {
      opening.sort((a, b) => ends[b][index] - ends[a][index] || a - b);
      return delimiterRuns(opening.map((plan) => state.style[plans[plan].mark]).join('')) > 1 && classOf(lastWritten(runs, units[index - 1])) === OTHER;
    }
    return opening.length === 0 && delimiterRuns(stack.slice(lowest).map(({ delimiter }) => delimiter).join('')) > 1 && classOf(firstWritten(runs, units[index])) === OTHER;
  };
  for (let index = 0; index <= units.length; index += 1) {
    let lowest = stack.findIndex(({ plan }) => index === units.length || ends[plan][index] < 0);
    if (lowest < 0) lowest = stack.length;
    // There a reopening style closes the marks that go on first and opens them again, as `*a*~~***b***~~` does.
    if (lowest > 0 && index > 0 && index < units.length && unflanked(index, lowest)) {
      state.reopens = true;
      if (state.style.reopen) lowest = 0;
    }
    let closers = '';
    while (stack.length > lowest) closers += stack.pop()?.delimiter ?? '';
    let openers = '';
    if (index < units.length) {
      const opening = plans.map((_, plan) => plan).filter((plan) => ends[plan][index] >= 0 && !stack.some((entry) => entry.plan === plan));
      opening.sort((a, b) => ends[b][index] - ends[a][index] || a - b);
      for (const plan of opening) {
        const preferred = state.style[plans[plan].mark];
        const delimiter = state.style.alternate && closers.includes(preferred.charAt(0)) ? alternate(preferred) : preferred;
        stack.push({ plan, delimiter });
        openers += delimiter;
      }
    }
    emit(state, closers + openers);
    if (index === units.length) break;
    const unit = units[index];
    const run = runs[unit.from];
    if (unit.kind === 'link') {
      writeLink(runs, unit, new Set(stack.map(({ plan }) => plans[plan].mark)), state, openers === '');
    } else if (run.kind === 'text') {
      const lineStart = state.lineStart;
      emit(state, escapeText(run.text, lineStart));
    } else if (run.kind === 'code') {
      emit(state, codeSpan(run.text));
    } else {
      state.out.push('\\\n');
      state.lineStart = true;
    }
  }
}

function writeLink(runs: readonly Run[], unit: Unit, open: ReadonlySet<EmphasisMark>, state: WriteState, touching: boolean) {
  const first = runs[unit.from];
  const href = first.kind === 'text' ? first.link : null;
  if (href === null) return;
  // A `!` written right before `[` would make the link an image.
  const previous = state.out[state.out.length - 1];
  if (touching && previous?.endsWith('!')) state.out[state.out.length - 1] = `${previous.slice(0, -1)}\\!`;
  const inner = linkUnits(unit);
  const marks = EMPHASIS.filter((mark) => !open.has(mark));
  const text = inner.map(({ from }) => {
    const run = runs[from];
    return run.kind === 'text' ? run.text : '';
  }).join('');
  const auto = marks.every((mark) => markRanges(runs, inner, mark, ['[', ']']).ranges.length === 0) ? autolinkText(text, href) : null;
  if (auto !== null) {
    emit(state, `<${auto}>`);
    return;
  }
  emit(state, '[');
  writeUnits(runs, inner, marks, ['[', ']'], state);
  emit(state, `](${destination(href)})`);
}

/** Whether Markdown reads back as the runs. */
function readsAs(markdown: string, runs: readonly Run[], heading: boolean): boolean {
  return sameRuns(canonicalRuns(parseInline(markdown, false).filter((piece): piece is Run => piece.kind !== 'image'), heading), runs);
}

/**
 * The runs as Markdown in each delimiter style, then in each again reopening, then with italic, strike and bold dropped
 * in turn from `drops`, until one reads back as written, and the runs it holds; links and code always hold, so the last
 * attempt, with no emphasis left, is the fallback.
 */
function writeRuns(runs: readonly Run[], heading: boolean, lineStart: boolean, drops: readonly (readonly EmphasisMark[])[]): { markdown: string; written: readonly Run[] } {
  let fallback: { markdown: string; written: readonly Run[] } = { markdown: '', written: runs };
  for (const drop of drops) {
    const target = drop.length === 0 ? runs : merge(runs.map((run): Run => (run.kind === 'text'
      ? { ...run, bold: run.bold && !drop.includes('bold'), italic: run.italic && !drop.includes('italic'), strike: run.strike && !drop.includes('strike') }
      : run)));
    // Each style that reopens follows the others, tried where its own style met a boundary at which it writes otherwise.
    const reopening: Style[] = [];
    for (const style of drop.length === 0 ? [...STYLES, ...REOPENING] : STYLES.slice(0, 1)) {
      if (style.reopen && !reopening.includes(style)) continue;
      const state: WriteState = { out: [], lineStart, style, reopens: false };
      writeUnits(target, topUnits(target), EMPHASIS, ['', ''], state);
      const markdown = state.out.join('');
      fallback = { markdown, written: target };
      if (readsAs(markdown, target, heading)) return fallback;
      if (state.reopens && !style.reopen) reopening.push(REOPENING[STYLES.indexOf(style)]);
    }
  }
  return fallback;
}

/**
 * The runs cut at the spaces of unformatted, unlinked text, each stretch with the spaces after it. No formatting or link
 * reaches across such spaces, and a delimiter beside them flanks as it does at either end of the text, so a stretch
 * written alone reads back as it does in the paragraph.
 */
function stretches(runs: readonly Run[]): { runs: Run[]; gap: string }[] {
  const parts: { runs: Run[]; gap: string }[] = [{ runs: [], gap: '' }];
  for (const run of runs) {
    if (run.kind !== 'text' || run.bold || run.italic || run.strike || run.link !== null) {
      parts[parts.length - 1].runs.push(run);
      continue;
    }
    let start = 0;
    let index = 0;
    while (index < run.text.length) {
      const character = charAt(run.text, index);
      if (classOf(character) !== SPACE) {
        index += character.length;
        continue;
      }
      let end = index + character.length;
      while (end < run.text.length && classOf(charAt(run.text, end)) === SPACE) end += charAt(run.text, end).length;
      if (index > start) parts[parts.length - 1].runs.push({ ...run, text: run.text.slice(start, index) });
      parts[parts.length - 1].gap = run.text.slice(index, end);
      parts.push({ runs: [], gap: '' });
      start = end;
      index = end;
    }
    if (start < run.text.length) parts[parts.length - 1].runs.push(start === 0 ? run : { ...run, text: run.text.slice(start) });
  }
  return parts;
}

/**
 * Canonical inline content as Markdown, checked by reading it back. A paragraph of several stretches is first tried whole
 * in each style that alternates its delimiters; where none reads back as written, each stretch between the spaces of its
 * plain text is written alone, reopening its marks if need be, so a stretch that must drop a mark drops it there only;
 * and where even that fails, italic, strike and bold are dropped in turn across the paragraph. One stretch is written as
 * a stretch is.
 */
function writeInline(runs: readonly Run[], heading: boolean): string {
  const parts = stretches(runs);
  if (parts.length === 1) return writeRuns(runs, heading, !heading, DROPS).markdown;
  for (const style of STYLES.filter(({ alternate }) => alternate)) {
    const state: WriteState = { out: [], lineStart: !heading, style, reopens: false };
    writeUnits(runs, topUnits(runs), EMPHASIS, ['', ''], state);
    const markdown = state.out.join('');
    if (readsAs(markdown, runs, heading)) return markdown;
  }
  const written = parts.map((part, index) => ({ ...writeRuns(part.runs, heading, index === 0 && !heading, DROPS), gap: part.gap }));
  const markdown = written.map((part) => part.markdown + part.gap).join('');
  // What the stretches hold together, a dropped mark gone from its own stretch only.
  if (readsAs(markdown, merge(written.flatMap((part) => (part.gap === '' ? part.written : [...part.written, plainRun(part.gap)]))), heading)) return markdown;
  return writeRuns(runs, heading, !heading, DROPS.slice(1)).markdown;
}

// ---------------------------------------------------------------------------------------------------------------------
// Block structure: CommonMark's line-by-line algorithm over the open containers, without recursion. A container that
// would nest deeper than the editor holds is not opened, so its marker stays text.

type BlockKind = 'document' | 'quote' | 'list' | 'item' | 'paragraph' | 'heading' | 'rule' | 'code' | 'html' | 'table';
type Block = {
  kind: BlockKind;
  parent: Block | null;
  children: Block[];
  open: boolean;
  /** The editor depth of the block. */
  depth: number;
  /** A leaf's lines, as CommonMark hands them to the leaf. */
  lines: string[];
  level: number;
  /** A list's or item's kind: ordered or not, and its bullet character or number delimiter. */
  ordered: boolean;
  marker: number;
  start: number;
  /** An item's marker indent and the indent of its content after the marker. */
  indent: number;
  padding: number;
  fence: number;
  fenceLength: number;
  fenceOffset: number;
  /** An HTML block's start condition, 1 to 7. */
  html: number;
};

const HTML_BLOCK_START = [
  /^<(?:script|pre|textarea|style)(?:[ \t>]|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t]|\/?>|$)/i,
  /^(?:<[A-Za-z][A-Za-z0-9-]*(?:[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:[^ \t"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t]*\/?>|<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>)[ \t]*$/,
];
const HTML_BLOCK_END = [/<\/(?:script|pre|textarea|style)>/i, /-->/, /\?>/, />/, /\]\]>/];

function createBlock(kind: BlockKind, parent: Block | null, depth: number): Block {
  return { kind, parent, children: [], open: true, depth, lines: [], level: 0, ordered: false, marker: 0, start: 1, indent: 0, padding: 0, fence: 0, fenceLength: 0, fenceOffset: 0, html: 0 };
}

const childDepth = (block: Block) => (block.kind === 'document' ? 0 : block.depth + 1);
const canContain = (parent: BlockKind, child: BlockKind) => (parent === 'list' ? child === 'item' : (parent === 'document' || parent === 'quote' || parent === 'item') && child !== 'item');
const acceptsLines = (kind: BlockKind) => kind === 'paragraph' || kind === 'table' || kind === 'code' || kind === 'html';
/**
 * Whether a line is a GFM table's delimiter row, which makes the table it ends kept as literal text: cells of `-` with an
 * optional `:` at either end and spaces or tabs around them, between pipes, with an optional pipe at either end of the
 * line. One pass, so a long line costs linear time.
 */
function isTableDelimiter(row: string): boolean {
  let index = row.charCodeAt(0) === 124 ? 1 : 0;
  for (;;) {
    while (isBlank(row.charCodeAt(index))) index += 1;
    if (row.charCodeAt(index) === 58) index += 1;
    if (row.charCodeAt(index) !== 45) return false;
    while (row.charCodeAt(index) === 45) index += 1;
    if (row.charCodeAt(index) === 58) index += 1;
    while (isBlank(row.charCodeAt(index))) index += 1;
    if (index >= row.length) return true;
    if (row.charCodeAt(index) !== 124) return false;
    index += 1;
    // A pipe that only spaces or tabs follow ends the row.
    while (isBlank(row.charCodeAt(index))) index += 1;
    if (index >= row.length) return true;
  }
}

/** The cells of a table row as GFM counts them, or 0 when it has no unescaped `|`: one leading and one trailing pipe aside. */
function tableCells(row: string): number {
  let pipes = 0;
  let cells = 1;
  const text = row.trim();
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 92) {
      index += 1;
    } else if (code === 124) {
      pipes += 1;
      if (index > 0 && index < text.length - 1) cells += 1;
    }
  }
  return pipes === 0 ? 0 : cells;
}
// The first characters a block start can have; any other line is text.
const maybeSpecial = (code: number) => code === 35 || code === 96 || code === 126 || code === 42 || code === 43 || code === 95 || code === 61 || code === 60 || code === 62 || code === 45 || (code >= 48 && code <= 57);

/** A heading's text without its closing sequence of `#`. */
function stripClosingSequence(text: string): string {
  let end = text.length;
  while (end > 0 && isBlank(text.charCodeAt(end - 1))) end -= 1;
  let hashes = end;
  while (hashes > 0 && text.charCodeAt(hashes - 1) === 35) hashes -= 1;
  return hashes < end && (hashes === 0 || isBlank(text.charCodeAt(hashes - 1))) ? text.slice(0, hashes) : text.slice(0, end);
}

function parseBlocks(markdown: string): Block {
  const document = createBlock('document', null, -1);
  let tip = document;
  let oldTip = document;
  let lastMatched = document;
  let allClosed = true;
  let line = '';
  let offset = 0;
  let column = 0;
  let nextNonspace = 0;
  let nextNonspaceColumn = 0;
  let indent = 0;
  let indented = false;
  let blank = false;
  let partialTab = false;

  const findNextNonspace = () => {
    let index = offset;
    let columns = column;
    for (;;) {
      const code = line.charCodeAt(index);
      if (code === 32) {
        index += 1;
        columns += 1;
      } else if (code === 9) {
        index += 1;
        columns += 4 - (columns % 4);
      } else {
        break;
      }
    }
    blank = index >= line.length;
    nextNonspace = index;
    nextNonspaceColumn = columns;
    indent = columns - column;
    indented = indent >= 4;
  };
  const advanceNextNonspace = () => {
    offset = nextNonspace;
    column = nextNonspaceColumn;
    partialTab = false;
  };
  // Tabs count to the next multiple of four columns; with `columns`, a tab may be consumed in part.
  const advanceOffset = (count: number, columns: boolean) => {
    let remaining = count;
    while (remaining > 0 && offset < line.length) {
      if (line.charCodeAt(offset) === 9) {
        const toTab = 4 - (column % 4);
        if (columns) {
          partialTab = toTab > remaining;
          const step = Math.min(toTab, remaining);
          column += step;
          offset += partialTab ? 0 : 1;
          remaining -= step;
        } else {
          partialTab = false;
          column += toTab;
          offset += 1;
          remaining -= 1;
        }
      } else {
        partialTab = false;
        offset += 1;
        column += 1;
        remaining -= 1;
      }
    }
  };
  const addLine = () => {
    if (partialTab) {
      offset += 1;
      tip.lines.push(' '.repeat(4 - (column % 4)) + line.slice(offset));
    } else {
      tip.lines.push(line.slice(offset));
    }
  };
  const finalize = (block: Block) => {
    block.open = false;
    tip = block.parent ?? document;
  };
  const addChild = (kind: BlockKind): Block => {
    while (!canContain(tip.kind, kind)) finalize(tip);
    const block = createBlock(kind, tip, childDepth(tip));
    tip.children.push(block);
    tip = block;
    return block;
  };
  const closeUnmatched = () => {
    if (allClosed) return;
    while (oldTip !== lastMatched && oldTip.parent) {
      const parent: Block = oldTip.parent;
      finalize(oldTip);
      oldTip = parent;
    }
    allClosed = true;
  };
  // The depth a new block of `kind` would take, in the container addChild would put it in.
  const depthFor = (container: Block, kind: BlockKind) => {
    let parent = container;
    while (!canContain(parent.kind, kind) && parent.parent) parent = parent.parent;
    return childDepth(parent);
  };

  // Each continuation returns 0 when the line continues the block, 1 when it does not, 2 when it closed a fence.
  const continues = (block: Block): 0 | 1 | 2 => {
    switch (block.kind) {
      case 'document':
      case 'list':
        return 0;
      case 'quote':
        if (indented || line.charCodeAt(nextNonspace) !== 62) return 1;
        advanceNextNonspace();
        advanceOffset(1, false);
        if (isBlank(line.charCodeAt(offset))) advanceOffset(1, true);
        return 0;
      case 'item':
        if (blank) {
          if (block.children.length === 0) return 1;
          advanceNextNonspace();
          return 0;
        }
        if (indent < block.indent + block.padding) return 1;
        advanceOffset(block.indent + block.padding, true);
        return 0;
      case 'code':
        if (block.fence !== 0) {
          if (indent <= 3 && line.charCodeAt(nextNonspace) === block.fence) {
            let end = nextNonspace;
            while (line.charCodeAt(end) === block.fence) end += 1;
            let rest = end;
            while (isBlank(line.charCodeAt(rest))) rest += 1;
            if (end - nextNonspace >= block.fenceLength && rest >= line.length) {
              finalize(block);
              return 2;
            }
          }
          for (let skip = block.fenceOffset; skip > 0 && isBlank(line.charCodeAt(offset)); skip -= 1) advanceOffset(1, true);
          return 0;
        }
        if (indent >= 4) {
          advanceOffset(4, true);
          return 0;
        }
        if (!blank) return 1;
        advanceNextNonspace();
        return 0;
      case 'html':
        return blank && (block.html === 6 || block.html === 7) ? 1 : 0;
      case 'paragraph':
      case 'table':
        return blank ? 1 : 0;
      default:
        return 1;
    }
  };

  // Block starts, tried in CommonMark's order. Each returns 0 for no start, 1 for a container, 2 for a leaf.
  const startQuote = (container: Block): 0 | 1 => {
    if (indented || line.charCodeAt(nextNonspace) !== 62 || depthFor(container, 'quote') > DEPTH_LIMIT - 1) return 0;
    advanceNextNonspace();
    advanceOffset(1, false);
    if (isBlank(line.charCodeAt(offset))) advanceOffset(1, true);
    closeUnmatched();
    addChild('quote');
    return 1;
  };
  const startHeading = (): 0 | 2 => {
    if (indented) return 0;
    let end = nextNonspace;
    while (line.charCodeAt(end) === 35 && end - nextNonspace < 7) end += 1;
    const level = end - nextNonspace;
    if (level < 1 || level > 6 || (end < line.length && !isBlank(line.charCodeAt(end)))) return 0;
    advanceNextNonspace();
    advanceOffset(level, false);
    closeUnmatched();
    const heading = addChild('heading');
    heading.level = level;
    heading.lines.push(stripClosingSequence(line.slice(offset)));
    advanceOffset(line.length - offset, false);
    return 2;
  };
  const startFence = (): 0 | 2 => {
    const fence = line.charCodeAt(nextNonspace);
    if (indented || (fence !== 96 && fence !== 126)) return 0;
    let end = nextNonspace;
    while (line.charCodeAt(end) === fence) end += 1;
    // A backtick fence's info string cannot hold a backtick.
    if (end - nextNonspace < 3 || (fence === 96 && line.indexOf('`', end) >= 0)) return 0;
    closeUnmatched();
    const code = addChild('code');
    code.fence = fence;
    code.fenceLength = end - nextNonspace;
    code.fenceOffset = indent;
    advanceNextNonspace();
    advanceOffset(end - nextNonspace, false);
    return 2;
  };
  const startHtml = (container: Block): 0 | 2 => {
    if (indented || line.charCodeAt(nextNonspace) !== 60) return 0;
    const rest = line.slice(nextNonspace);
    const type = HTML_BLOCK_START.findIndex((pattern) => pattern.test(rest)) + 1;
    // The seventh kind cannot interrupt a paragraph, a lazy one included.
    if (type === 0 || (type === 7 && (container.kind === 'paragraph' || (!allClosed && !blank && tip.kind === 'paragraph')))) return 0;
    closeUnmatched();
    addChild('html').html = type;
    return 2;
  };
  const startSetext = (container: Block): 0 | 2 => {
    const underline = line.charCodeAt(nextNonspace);
    if (indented || container.kind !== 'paragraph' || (underline !== 61 && underline !== 45)) return 0;
    let end = nextNonspace;
    while (line.charCodeAt(end) === underline) end += 1;
    while (isBlank(line.charCodeAt(end))) end += 1;
    if (end < line.length) return 0;
    closeUnmatched();
    container.kind = 'heading';
    container.level = underline === 61 ? 1 : 2;
    advanceOffset(line.length - offset, false);
    return 2;
  };
  const startRule = (): 0 | 2 => {
    const mark = line.charCodeAt(nextNonspace);
    if (indented || (mark !== 42 && mark !== 45 && mark !== 95)) return 0;
    let count = 0;
    for (let index = nextNonspace; index < line.length; index += 1) {
      const code = line.charCodeAt(index);
      if (code === mark) count += 1;
      else if (!isBlank(code)) return 0;
    }
    if (count < 3) return 0;
    closeUnmatched();
    addChild('rule');
    advanceOffset(line.length - offset, false);
    return 2;
  };
  const startItem = (container: Block): 0 | 1 => {
    if ((indented && container.kind !== 'list') || indent >= 4) return 0;
    const first = line.charCodeAt(nextNonspace);
    let markerEnd = nextNonspace + 1;
    let ordered = false;
    let start = 1;
    let marker = first;
    if (first !== 42 && first !== 43 && first !== 45) {
      let end = nextNonspace;
      while (end - nextNonspace < 9 && line.charCodeAt(end) >= 48 && line.charCodeAt(end) <= 57) end += 1;
      marker = line.charCodeAt(end);
      if (end === nextNonspace || (marker !== 46 && marker !== 41)) return 0;
      start = Number(line.slice(nextNonspace, end));
      // Only a list starting at 1 can interrupt a paragraph.
      if (container.kind === 'paragraph' && start !== 1) return 0;
      ordered = true;
      markerEnd = end + 1;
    }
    if (markerEnd < line.length && !isBlank(line.charCodeAt(markerEnd))) return 0;
    // An empty item cannot interrupt a paragraph.
    if (container.kind === 'paragraph') {
      let rest = markerEnd;
      while (isBlank(line.charCodeAt(rest))) rest += 1;
      if (rest >= line.length) return 0;
    }
    const joins = container.kind === 'list' && container.ordered === ordered && container.marker === marker;
    if (!joins && depthFor(container, 'list') > DEPTH_LIMIT - 2) return 0;
    const markerIndent = indent;
    const width = markerEnd - nextNonspace;
    advanceNextNonspace();
    advanceOffset(width, true);
    const spacesColumn = column;
    const spacesOffset = offset;
    do advanceOffset(1, true);
    while (column - spacesColumn < 5 && isBlank(line.charCodeAt(offset)));
    const spaces = column - spacesColumn;
    let padding = width + spaces;
    // One space is the item's own when the content is blank, starts with indented code, or follows no space at all.
    if (spaces >= 5 || spaces < 1 || offset >= line.length) {
      padding = width + 1;
      column = spacesColumn;
      offset = spacesOffset;
      if (isBlank(line.charCodeAt(offset))) advanceOffset(1, true);
    }
    closeUnmatched();
    if (!joins) {
      const list = addChild('list');
      list.ordered = ordered;
      list.marker = marker;
      list.start = start;
    }
    const item = addChild('item');
    item.indent = markerIndent;
    item.padding = padding;
    return 1;
  };
  const startIndented = (): 0 | 2 => {
    if (!indented || tip.kind === 'paragraph' || tip.kind === 'table' || blank) return 0;
    advanceOffset(4, true);
    closeUnmatched();
    addChild('code');
    return 2;
  };

  const incorporate = (text: string) => {
    line = text;
    offset = 0;
    column = 0;
    blank = false;
    partialTab = false;
    oldTip = tip;
    let container = document;
    for (let child = container.children[container.children.length - 1]; child?.open; child = container.children[container.children.length - 1]) {
      container = child;
      findNextNonspace();
      const result = continues(container);
      if (result === 2) return;
      if (result === 1) {
        container = container.parent ?? document;
        break;
      }
    }
    allClosed = container === oldTip;
    lastMatched = container;
    let matchedLeaf = container.kind !== 'paragraph' && container.kind !== 'table' && acceptsLines(container.kind);
    while (!matchedLeaf) {
      findNextNonspace();
      if (!indented && !maybeSpecial(line.charCodeAt(nextNonspace))) {
        advanceNextNonspace();
        break;
      }
      const started = startQuote(container) || startHeading() || startFence() || startHtml(container) || startSetext(container) || startRule() || startItem(container) || startIndented();
      if (started === 0) {
        advanceNextNonspace();
        break;
      }
      container = tip;
      matchedLeaf = started === 2;
    }
    if (!allClosed && !blank && tip.kind === 'paragraph') {
      // A lazy continuation line of the paragraph.
      addLine();
      return;
    }
    closeUnmatched();
    if (acceptsLines(container.kind)) {
      // A one-line paragraph with a pipe, then a delimiter row of as many cells: a table, kept as literal lines.
      if (container.kind === 'paragraph' && container.lines.length === 1 && !partialTab) {
        const row = line.slice(offset);
        const cells = tableCells(container.lines[0]);
        if (cells > 0 && row.includes('|') && isTableDelimiter(row) && tableCells(row) === cells) container.kind = 'table';
      }
      addLine();
      if (container.kind === 'html' && container.html <= 5 && HTML_BLOCK_END[container.html - 1].test(line.slice(offset))) finalize(container);
    } else if (offset < line.length && !blank) {
      addChild('paragraph');
      advanceNextNonspace();
      addLine();
    }
  };

  const lines = markdown.replace(/\r\n?/g, '\n').replace(/\u0000/g, '\ufffd').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  for (const text of lines) incorporate(text);
  return document;
}

// ---------------------------------------------------------------------------------------------------------------------
// Blocks to the editor's document

const BREAK: Run = { kind: 'break' };

function plainRun(text: string): TextRun {
  return { kind: 'text', text, bold: false, italic: false, strike: false, link: null };
}

/** The first word of a code fence's info string, which is the language. */
function firstWord(info: string): string {
  return info.trim().split(/\s+/)[0] ?? '';
}

function nonEmpty<T>(items: readonly T[], fallback: T): [T, ...T[]] {
  const [first = fallback, ...rest] = items;
  return [first, ...rest];
}

/** Paragraph or heading content (raw lines joined), with the spaces and tabs at its ends removed. */
function inlineSource(lines: readonly string[]): string {
  const source = lines.join('\n');
  const edge = (code: number) => code === 10 || isBlank(code);
  let start = 0;
  let end = source.length;
  while (start < end && edge(source.charCodeAt(start))) start += 1;
  while (end > start && edge(source.charCodeAt(end - 1))) end -= 1;
  return source.slice(start, end);
}

function inlineNodes(runs: readonly Run[]): TextEditorInlineNode[] {
  return runs.map((run): TextEditorInlineNode => {
    if (run.kind === 'break') return { type: 'hardBreak' };
    if (run.kind === 'code') return { type: 'text', text: run.text, marks: [{ type: 'code' }] };
    // The editor's schema order: link, bold, italic, strike.
    const marks: TextEditorMark[] = [];
    if (run.link !== null) marks.push({ type: 'link', attrs: { href: run.link } });
    if (run.bold) marks.push({ type: 'bold' });
    if (run.italic) marks.push({ type: 'italic' });
    if (run.strike) marks.push({ type: 'strike' });
    return marks.length > 0 ? { type: 'text', text: run.text, marks } : { type: 'text', text: run.text };
  });
}

function imageNode(src: string, alt: string): TextEditorBlockNode {
  const description = alt.replace(/\r\n|\r|\n/g, ' ').slice(0, ALT_LIMIT);
  return { type: 'image', attrs: description === '' ? { src } : { src, alt: description } };
}

/** A paragraph's blocks: its text, split around each image, which the editor holds as a block. */
function paragraphBlocks(source: string, out: TextEditorBlockNode[]) {
  let runs: Run[] = [];
  const close = () => {
    const content = inlineNodes(canonicalRuns(runs, false));
    if (content.length > 0) out.push({ type: 'paragraph', content });
    runs = [];
  };
  for (const piece of parseInline(source, true)) {
    if (piece.kind === 'image') {
      close();
      out.push(imageNode(piece.src, piece.alt));
    } else {
      runs.push(piece);
    }
  }
  close();
}

function editorBlocks(blocks: readonly Block[]): TextEditorBlockNode[] {
  const out: TextEditorBlockNode[] = [];
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      paragraphBlocks(inlineSource(block.lines), out);
    } else if (block.kind === 'heading') {
      const pieces = parseInline(inlineSource(block.lines), false).filter((piece): piece is Run => piece.kind !== 'image');
      const content = inlineNodes(canonicalRuns(pieces, true));
      out.push({ type: 'heading', attrs: { level: Math.min(Math.max(block.level, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6 }, ...(content.length > 0 ? { content } : {}) });
    } else if (block.kind === 'rule') {
      out.push({ type: 'horizontalRule' });
    } else if (block.kind === 'code') {
      // A fence's first line is its info string. Indented code loses its trailing blank lines.
      const lines = block.fence === 0 ? [...block.lines] : block.lines.slice(1);
      if (block.fence === 0) while (lines.length > 0 && /^[ \t]*$/.test(lines[lines.length - 1])) lines.pop();
      const language = block.fence === 0 ? '' : firstWord(unescapeString(block.lines[0] ?? ''));
      const text = lines.join('\n');
      out.push({ type: 'codeBlock', ...(language !== '' ? { attrs: { language } } : {}), ...(text !== '' ? { content: [{ type: 'text', text }] } : {}) });
    } else if (block.kind === 'html' || block.kind === 'table') {
      // Raw HTML and tables stay their literal text, a hard break between their lines.
      const runs = block.lines.flatMap((text, index): Run[] => (index > 0 ? [BREAK, plainRun(text.trim())] : [plainRun(text.trim())]));
      const content = inlineNodes(canonicalRuns(runs, false));
      if (content.length > 0) out.push({ type: 'paragraph', content });
    } else if (block.kind === 'quote') {
      out.push({ type: 'blockquote', content: nonEmpty(editorBlocks(block.children), { type: 'paragraph' }) });
    } else if (block.kind === 'list') {
      const items = block.children.map((item): TextEditorListItemNode => {
        const [head, ...rest] = editorBlocks(item.children);
        return { type: 'listItem', content: head?.type === 'paragraph' ? [head, ...rest] : head === undefined ? [{ type: 'paragraph' }] : [{ type: 'paragraph' }, head, ...rest] };
      });
      const content = nonEmpty(items, { type: 'listItem', content: [{ type: 'paragraph' }] });
      out.push(block.ordered ? { type: 'orderedList', attrs: { start: Math.min(Math.max(block.start, 1), LIST_START_LIMIT) }, content } : { type: 'bulletList', content });
    }
  }
  return out;
}

/**
 * Reads Markdown (CommonMark plus GFM `~~strike~~`) into a TextEditor document that `isTextEditorDocument` accepts. It is
 * pure and synchronous and needs no DOM, so it runs on a server. Raw HTML and syntax outside the editor's grammar stay
 * literal text, and a link or image address the editor would refuse is dropped with its text kept. The module header
 * lists everything the conversion normalizes.
 */
export function fromMarkdown(markdown: string): TextEditorDocument {
  const root = parseBlocks(typeof markdown === 'string' ? markdown : '');
  return { type: 'doc', content: nonEmpty(editorBlocks(root.children), { type: 'paragraph' }) };
}

// ---------------------------------------------------------------------------------------------------------------------
// The editor's document to Markdown

/** The runs of the editor's inline nodes: underline and text style dropped, inline code alone, addresses checked. */
function documentRuns(content: readonly TextEditorInlineNode[] | undefined): Run[] {
  const runs: Run[] = [];
  for (const node of content ?? []) {
    if (node?.type === 'hardBreak') {
      runs.push(BREAK);
      continue;
    }
    if (node?.type !== 'text' || typeof node.text !== 'string') continue;
    const marks = node.marks ?? [];
    if (marks.some((mark) => mark?.type === 'code')) {
      runs.push({ kind: 'code', text: node.text });
      continue;
    }
    const run = plainRun(node.text);
    for (const mark of marks) {
      if (mark?.type === 'bold' || mark?.type === 'italic' || mark?.type === 'strike') run[mark.type] = true;
      else if (mark?.type === 'link' && run.link === null && typeof mark.attrs?.href === 'string') run.link = normalizeAddress(mark.attrs.href, 'link');
    }
    runs.push(run);
  }
  return runs;
}

type Written = { node: TextEditorBlockNode; lines: string[]; variant: number };

function append(target: string[], lines: readonly string[]) {
  for (const line of lines) target.push(line);
}

function joinBlocks(parts: readonly Written[]): string[] {
  const lines: string[] = [];
  parts.forEach((part, index) => {
    if (index > 0) lines.push('');
    append(lines, part.lines);
  });
  return lines;
}

const isList = (node: TextEditorBlockNode) => node.type === 'bulletList' || node.type === 'orderedList';
const tooDeep = (node: TextEditorBlockNode, depth: number) => (node.type === 'blockquote' && depth > DEPTH_LIMIT - 1) || (isList(node) && depth > DEPTH_LIMIT - 2);

/** The blocks under a container that is nested too deep, in order, without their containers. */
function leaves(node: TextEditorBlockNode): TextEditorBlockNode[] {
  const found: TextEditorBlockNode[] = [];
  const stack: (TextEditorBlockNode | TextEditorListItemNode)[] = [node];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    if (current.type === 'blockquote' || current.type === 'bulletList' || current.type === 'orderedList' || current.type === 'listItem') {
      const children: readonly (TextEditorBlockNode | TextEditorListItemNode)[] = current.content ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    } else {
      found.push(current);
    }
  }
  return found;
}

/** Each block's lines, with a list right after another of its kind taking the other marker so the two stay apart. */
function writtenBlocks(nodes: readonly TextEditorBlockNode[], depth: number): Written[] {
  const written: Written[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    for (const block of tooDeep(node, depth) ? leaves(node) : [node]) {
      const previous = written[written.length - 1];
      const variant = previous !== undefined && previous.node.type === block.type && isList(block) ? 1 - previous.variant : 0;
      const lines = writeBlock(block, depth, variant);
      if (lines !== null) written.push({ node: block, lines, variant });
    }
  }
  return written;
}

function writeItem(item: TextEditorListItemNode, depth: number, marker: string): { lines: string[]; tight: boolean } {
  const [first, ...rest] = writtenBlocks(item?.content ?? [], depth + 1);
  if (first === undefined) return { lines: [marker], tight: true };
  const indent = ' '.repeat(marker.length + 1);
  const pad = (line: string) => (line === '' ? '' : `${indent}${line}`);
  // A paragraph sits on the marker's line; any other first block starts on the next.
  const lines = first.node.type === 'paragraph' ? [`${marker} ${first.lines[0]}`, ...first.lines.slice(1).map(pad)] : [marker, ...first.lines.map(pad)];
  let tight = true;
  rest.forEach((part, index) => {
    // A list right under the item's text needs no blank line, unless CommonMark would read it as more of that text: a
    // list whose first item is empty, or a numbered list not starting at 1.
    const head = part.lines[0] ?? '';
    const nested = index === 0 && first.node.type === 'paragraph' && isList(part.node) && /^(?:[-*]|\d{1,9}[.)]) \S/.test(head) && (part.node.type === 'bulletList' || /^1[.)]/.test(head));
    if (!nested) {
      lines.push('');
      tight = false;
    }
    append(lines, part.lines.map(pad));
  });
  return { lines, tight };
}

/** One block as Markdown lines, or null when Markdown has nothing to hold (an empty paragraph). */
function writeBlock(node: TextEditorBlockNode, depth: number, variant: number): string[] | null {
  switch (node.type) {
    case 'paragraph': {
      const runs = canonicalRuns(documentRuns(node.content), false);
      return runs.length > 0 ? writeInline(runs, false).split('\n') : null;
    }
    case 'heading': {
      const level = Number.isInteger(node.attrs?.level) ? Math.min(Math.max(node.attrs.level, 1), 6) : 1;
      const runs = canonicalRuns(documentRuns(node.content), true);
      // A run of `#` at the end would read as the closing sequence.
      const text = runs.length > 0 ? writeInline(runs, true).replace(/(^|[ \t])(#+)$/, '$1\\$2') : '';
      return [`${'#'.repeat(level)}${text === '' ? '' : ` ${text}`}`];
    }
    case 'codeBlock': {
      const code = (node.content ?? []).map((text) => (typeof text?.text === 'string' ? text.text : '')).join('').replace(/\r\n?/g, '\n');
      const language = typeof node.attrs?.language === 'string' ? firstWord(node.attrs.language) : '';
      const fence = language.includes('`') ? '~' : '`';
      let longest = 0;
      let run = 0;
      for (let index = 0; index < code.length; index += 1) {
        run = code.charAt(index) === fence ? run + 1 : 0;
        if (run > longest) longest = run;
      }
      const marker = fence.repeat(Math.max(3, longest + 1));
      return [`${marker}${language.replace(/[\\&]/g, '\\$&')}`, ...(code === '' ? [] : code.split('\n')), marker];
    }
    case 'image': {
      const src = typeof node.attrs?.src === 'string' ? normalizeAddress(node.attrs.src, 'image') : null;
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt.replace(/\r\n|\r|\n/g, ' ').slice(0, ALT_LIMIT) : '';
      if (src !== null) return [`![${escapeText(alt, false)}](${destination(src)})`];
      // An image whose address the editor would refuse leaves its description.
      const runs = canonicalRuns([plainRun(alt)], false);
      return runs.length > 0 ? writeInline(runs, false).split('\n') : null;
    }
    case 'horizontalRule':
      return ['---'];
    case 'blockquote': {
      const inner = joinBlocks(writtenBlocks(node.content, depth + 1));
      return inner.length > 0 ? inner.map((line) => (line === '' ? '>' : `> ${line}`)) : ['>'];
    }
    case 'bulletList':
    case 'orderedList': {
      const items = node.content ?? [];
      let number = node.type === 'orderedList' && Number.isInteger(node.attrs?.start) ? Math.min(Math.max(node.attrs?.start ?? 1, 1), LIST_START_LIMIT) : 1;
      const written = items.map((item) => {
        const marker = node.type === 'orderedList' ? `${Math.min(number, LIST_START_LIMIT)}${variant === 1 ? ')' : '.'}` : variant === 1 ? '*' : '-';
        number += 1;
        return writeItem(item, depth + 1, marker);
      });
      const loose = written.some(({ tight }) => !tight);
      const lines: string[] = [];
      written.forEach((item, index) => {
        if (index > 0 && loose) lines.push('');
        append(lines, item.lines);
      });
      return lines.length > 0 ? lines : null;
    }
    default:
      return null;
  }
}

/**
 * Writes a TextEditor document as Markdown (CommonMark plus GFM `~~strike~~`) that `fromMarkdown` reads back as the same
 * document, once the losses in the module header are applied. It is pure and synchronous and needs no DOM. Underline,
 * colour, fonts, sizes and alignment are dropped, as Markdown cannot hold them, and so are addresses the editor would
 * refuse. There is no trailing newline; an empty document gives an empty string.
 */
export function toMarkdown(document: TextEditorDocument): string {
  return joinBlocks(writtenBlocks(document?.content ?? [], 0)).join('\n');
}
