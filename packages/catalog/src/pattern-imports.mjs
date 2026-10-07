/**
 * Dependency-free, fail-closed import check for system-owned pattern variant
 * examples (Decision 0026).
 *
 * Every import sits in the leading header: imports, comments, and blank lines
 * before the first other statement. A header import may name only `react`,
 * `react/jsx-runtime`, and `@muxui/react`, and `@muxui/react` only as
 *
 *   import { A, B as C, type D } from '@muxui/react';
 *
 * (possibly multi-line). `type` specifiers and `import type` are ignored.
 * Relative specifiers, every other package, and every other `@muxui/react`
 * form (default, namespace, side-effect, subpath) fail.
 *
 * Only the header is tokenized. A small tokenizer cannot read the rest of a
 * file (JSX text, regular expressions, and escapes defeat it, and `//` in JSX
 * text would hide code), so the rest is scanned raw and fails closed on
 * anything that could pull in a module: a dynamic import, `require(`, an
 * `import` or `export ... from` that starts a statement (at a line start or
 * after `;`, `}`, or a block comment), an escaped `@`, and any occurrence of
 * `@muxui`, even in a comment or string. `a.import(` and the word "import" in
 * JSX text pass.
 *
 * Limits: imported names are matched by export name against component
 * records. Names that belong to no component record, such as the hook
 * `useToast`, the provider `ToastProvider`, sub-parts, and types, are not
 * checked against `pattern.participants`, and use is not checked. An `import`
 * inside a template literal or a comment that starts a line is flagged (fail
 * closed); a statement start the rules do not list is not detected.
 */

const ALLOWED_SPECIFIERS = new Set(['react', 'react/jsx-runtime', '@muxui/react']);
const IDENTIFIER = /[\p{L}_$][\p{L}\p{N}_$]*/uy;
const NAME = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
// A statement start: a line start, or after `;`, `}`, or a block comment. Keeps
// prose such as "please import your photos" and member calls such as `a.import(` out.
const STATEMENT_START = '(?<=(?:^|[;}]|\\*/)\\s*)';
const NOT_MEMBER = '(?<![\\p{L}\\p{N}_$.])';

/** Raw rules for the source after the header, most specific first; one violation per line. */
const BODY_RULES = [
  [new RegExp(`${NOT_MEMBER}import\\s*\\(`, 'gu'), 'a dynamic import, which cannot be checked'],
  [new RegExp(`${NOT_MEMBER}require\\s*\\(`, 'gu'), 'a require call, which cannot be checked'],
  [
    new RegExp(`${STATEMENT_START}export\\s*(?:type\\s*)?(?:\\*(?:\\s*as\\s+${NAME})?|\\{[^}]*\\})\\s*from\\s*['"]`, 'gmu'),
    'an export ... from, which re-exports another module',
  ],
  [
    new RegExp(`${STATEMENT_START}import(?:\\s*[{*'"]|\\s+type\\s*[{*]|\\s+(?:type\\s+)?${NAME}\\s*(?:,|=|\\bfrom\\b))`, 'gmu'),
    'an import after the leading import header',
  ],
  [/\\x40|\\u0040|\\u\{0*40\}/gu, "an escaped '@', which could hide a package name"],
  [/@muxui/gu, "a raw '@muxui' reference after the import header"],
];

class ScanError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;
const isPunct = (token, value) => token?.kind === 'punct' && token.value === value;
const isWord = (token, value) => token?.kind === 'word' && token.value === value;

/** Reads the token at or after `from`, skipping whitespace and comments; null at the end. */
function nextToken(source, from) {
  let index = from;
  for (;;) {
    while (/\s/u.test(source[index] ?? '')) index += 1;
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) throw new ScanError('unterminated block comment', lineAt(source, index));
      index = end + 2;
    } else {
      break;
    }
  }
  if (index >= source.length) return null;
  const character = source[index];
  const token = (kind, value, end) => ({ kind, value, end, line: lineAt(source, index), start: index });
  if (character === '"' || character === "'") {
    for (let end = index + 1; end < source.length && source[end] !== '\n'; end += 1) {
      if (source[end] === '\\') end += 1;
      else if (source[end] === character) return token('string', source.slice(index + 1, end), end + 1);
    }
    // A quote with no partner on its line is not a string; it reads as punctuation.
  } else {
    IDENTIFIER.lastIndex = index;
    const word = IDENTIFIER.exec(source);
    if (word) return token('word', word[0], index + word[0].length);
  }
  return token('punct', character, index + 1);
}

/**
 * Reads the leading imports. Returns each with its clause tokens (up to the
 * specifier) and specifier string token, plus the offset where the header ends.
 */
function readHeader(source) {
  const imports = [];
  let position = 0;
  for (;;) {
    const keyword = nextToken(source, position);
    // Any other statement ends the header, including `import(` and `import.meta`.
    const after = isWord(keyword, 'import') ? nextToken(source, keyword.end) : null;
    if (!isWord(keyword, 'import') || isPunct(after, '(') || isPunct(after, '.')) {
      return { imports, end: keyword?.start ?? source.length };
    }
    const clause = [];
    let depth = 0;
    let cursor = keyword.end;
    let terminator;
    for (;;) {
      terminator = nextToken(source, cursor);
      if (terminator === null || isPunct(terminator, ';') || (terminator.kind === 'string' && depth === 0)) break;
      if (isPunct(terminator, '{')) depth += 1;
      else if (isPunct(terminator, '}')) depth -= 1;
      clause.push(terminator);
      cursor = terminator.end;
    }
    const specifier = terminator?.kind === 'string' ? terminator : undefined;
    imports.push({ line: keyword.line, clause, specifier });
    position = terminator?.end ?? source.length;
    if (specifier !== undefined) {
      const semicolon = nextToken(source, position);
      if (isPunct(semicolon, ';')) position = semicolon.end;
    }
  }
}

/** Reads the specifiers between `{` and `}`; returns names and any shape violation. */
function namedSpecifiers(clause) {
  const names = [];
  const segments = [[]];
  for (const token of clause.slice(1, -1)) {
    if (isPunct(token, ',')) segments.push([]);
    else segments.at(-1).push(token);
  }
  if (segments.at(-1).length === 0) segments.pop(); // trailing comma
  const invalid = { names, violation: 'an unsupported import specifier' };
  for (const segment of segments) {
    const words = segment.map((token) => (token.kind === 'word' ? token.value : null));
    if (segment.length === 0 || words.includes(null)) return invalid;
    const [first, second, third] = words;
    // `type A` and `type A as B` are type-only; `type` and `type as B` name an export called "type".
    if (first === 'type' && second !== undefined && second !== 'as') {
      if (words.length === 2 || (words.length === 4 && third === 'as')) continue;
      return invalid;
    }
    if (words.length !== 1 && !(words.length === 3 && second === 'as')) return invalid;
    if (first === 'default') return { names, violation: 'a default import' };
    names.push({ name: first, line: segment[0].line });
  }
  return { names };
}

/** Checks one header import and returns the names it takes from `@muxui/react`. */
function checkHeaderImport({ line, clause, specifier }, violate) {
  if (specifier === undefined) {
    violate(line, 'an unreadable import');
    return [];
  }
  const target = specifier.value;
  if (!ALLOWED_SPECIFIERS.has(target)) {
    violate(line, target.startsWith('@muxui/react/')
      ? `a subpath import of '${target}'`
      : `an import of '${target}', outside the allowed react, react/jsx-runtime, and @muxui/react`);
    return [];
  }
  if (clause.length === 0) {
    if (target === '@muxui/react') violate(line, "a side-effect import of '@muxui/react'");
    return [];
  }
  if (!isWord(clause.at(-1), 'from')) {
    violate(line, `an unreadable import of '${target}'`);
    return [];
  }
  if (target !== '@muxui/react') return [];
  const words = clause.slice(0, -1);
  // `import type { A }` and `import type A` are type-only; `import type from` is a default import.
  if (isWord(words[0], 'type') && words[1] !== undefined && !isPunct(words[1], ',')) return [];
  if (!isPunct(words[0], '{') || !isPunct(words.at(-1), '}')) {
    violate(line, `a ${words.some((token) => isPunct(token, '*')) ? 'namespace' : 'default'} import of '@muxui/react'`);
    return [];
  }
  const result = namedSpecifiers(words);
  if (result.violation) violate(line, `${result.violation} from '@muxui/react'`);
  return result.violation ? [] : result.names;
}

/**
 * Scans one source. Returns the names imported from `@muxui/react` and every
 * violation of the canonical form, each with its 1-based line.
 */
export function scanReactImports(source) {
  let header;
  try {
    header = readHeader(source);
  } catch (error) {
    if (!(error instanceof ScanError)) throw error;
    return { imported: [], violations: [{ line: error.line, message: `cannot be scanned (${error.message})` }] };
  }
  const violations = [];
  const violate = (line, what) => violations.push({ line, message: `has ${what}` });
  const imported = header.imports.flatMap((statement) => checkHeaderImport(statement, violate));

  const body = source.slice(header.end);
  const reported = new Set();
  for (const [pattern, what] of BODY_RULES) {
    for (const match of body.matchAll(pattern)) {
      const first = lineAt(source, header.end + match.index);
      const last = lineAt(source, header.end + match.index + match[0].length);
      if (reported.has(first)) continue;
      for (let line = first; line <= last; line += 1) reported.add(line);
      violate(first, what);
    }
  }
  return { imported, violations: violations.sort((left, right) => left.line - right.line) };
}

/**
 * Returns one issue per violation, and per imported component the pattern does
 * not declare. `variants` are `{ source, text }` for each variant example.
 * Issues name the owning field `pattern.participants` and link the source.
 */
export function patternImportIssues({ pattern, components, variants }) {
  const names = new Map(components.map(({ id, name }) => [id, name]));
  const declared = new Set(pattern.participants.map(({ component }) => names.get(component)));
  const componentNames = new Set(names.values());
  const issues = [];
  const report = (source, line, message) => issues.push({
    artifactId: pattern.id,
    path: '$/participants',
    source,
    line,
    message: `${source}:${line} ${message}`,
  });
  for (const { source, text } of variants) {
    const { imported, violations } = scanReactImports(text);
    for (const { line, message } of violations) {
      report(
        source,
        line,
        `${message}; a variant keeps its imports in a leading header, imports only react, react/jsx-runtime, and @muxui/react, takes @muxui/react as a static named import, and pattern.participants must declare each component it imports (names no component record maps, such as useToast and ToastProvider, are not checked)`,
      );
    }
    for (const { name, line } of imported) {
      if (componentNames.has(name) && !declared.has(name)) {
        report(source, line, `imports ${name}, which pattern.participants does not declare for ${pattern.id}`);
      }
    }
  }
  return issues;
}
