/**
 * Dependency-free, fail-closed import check for system-owned pattern variant
 * examples (Decision 0026). A variant may reference `@muxui/react` only as
 *
 *   import { A, B as C, type D } from '@muxui/react';
 *
 * (possibly multi-line). `type` specifiers and `import type` are ignored.
 * Every other reference fails: default, namespace, side-effect, subpath, and
 * dynamic imports, `export ... from`, and any other string naming the package.
 *
 * A small tokenizer drops comments and string contents before imports are
 * matched. It does not parse JSX, regular expressions, or escape sequences:
 * an unpaired quote in JSX text is read as a literal character, and a `//` in
 * JSX text starts a comment to the end of its line. Imported names are matched
 * by export name against component records, so sub-parts, hooks, and types are
 * unmapped, and use is not checked.
 */

const REACT_PACKAGE = /^@muxui\/react(?:\/|$)/u;
const WORD = /[\p{L}_$][\p{L}\p{N}_$]*|[0-9][\w.]*/uy;

class ScanError extends Error {
  constructor(message, line) {
    super(message);
    this.line = line;
  }
}

/** Splits source into word, punct, and string tokens, skipping comments and whitespace. */
function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;
  const fail = (message) => { throw new ScanError(message, line); };
  const push = (kind, value) => tokens.push({ kind, value, line });

  function quoted(quote) {
    for (let end = index + 1; end < source.length && source[end] !== '\n'; end += 1) {
      if (source[end] === '\\') end += 1;
      else if (source[end] === quote) {
        push('string', source.slice(index + 1, end));
        index = end + 1;
        return;
      }
    }
    // A quote with no partner on its line is JSX text, not a string.
    push('punct', quote);
    index += 1;
  }

  function template() {
    let text = '';
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '`') {
        index += 1;
        push('string', text);
        return;
      }
      if (character === '$' && source[index + 1] === '{') {
        index += 2;
        text += '\0';
        code(true);
        continue;
      }
      if (character === '\\') {
        text += character;
        index += 1;
      }
      if (source[index] === '\n') line += 1;
      text += source[index] ?? '';
      index += 1;
    }
    fail('unterminated template literal');
  }

  function code(substitution) {
    let depth = 0;
    while (index < source.length) {
      const character = source[index];
      const pair = source.slice(index, index + 2);
      if (character === '\n') {
        line += 1;
        index += 1;
      } else if (/\s/u.test(character)) {
        index += 1;
      } else if (pair === '//') {
        const end = source.indexOf('\n', index);
        index = end === -1 ? source.length : end;
      } else if (pair === '/*') {
        const end = source.indexOf('*/', index + 2);
        if (end === -1) fail('unterminated block comment');
        line += source.slice(index, end).split('\n').length - 1;
        index = end + 2;
      } else if (character === '"' || character === "'") {
        quoted(character);
      } else if (character === '`') {
        template();
      } else if (substitution && character === '}' && depth === 0) {
        index += 1;
        return;
      } else {
        if (substitution && character === '{') depth += 1;
        if (substitution && character === '}') depth -= 1;
        WORD.lastIndex = index;
        const word = WORD.exec(source);
        push(word ? 'word' : 'punct', word ? word[0] : character);
        index += word ? word[0].length : 1;
      }
    }
    if (substitution) fail('unterminated template substitution');
  }

  code(false);
  return tokens;
}

const isPunct = (token, value) => token?.kind === 'punct' && token.value === value;
const isWord = (token, value) => token?.kind === 'word' && token.value === value;

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

/**
 * Scans one source. Returns the names imported from `@muxui/react` and every
 * violation of the canonical form, each with its 1-based line.
 */
export function scanReactImports(source) {
  let tokens;
  try {
    tokens = tokenize(source);
  } catch (error) {
    if (!(error instanceof ScanError)) throw error;
    return { imported: [], violations: [{ line: error.line, message: `cannot be scanned (${error.message})` }] };
  }
  const imported = [];
  const violations = [];
  const handled = new Set();
  const violate = (line, what) => violations.push({ line, message: `has ${what}` });

  for (const [start, token] of tokens.entries()) {
    if (!isWord(token, 'import')) continue;
    const next = tokens[start + 1];
    if (isPunct(next, '(')) {
      violate(token.line, 'a dynamic import, which cannot be checked');
      if (tokens[start + 2]?.kind === 'string') handled.add(start + 2);
      continue;
    }
    if (isPunct(next, '.')) continue; // import.meta
    const typeOnly = isWord(next, 'type')
      && tokens[start + 2] !== undefined
      && !isWord(tokens[start + 2], 'from')
      && !isPunct(tokens[start + 2], ',');
    const clauseStart = start + (typeOnly ? 2 : 1);
    let depth = 0;
    let end = clauseStart;
    for (; end < tokens.length; end += 1) {
      const current = tokens[end];
      if (isPunct(current, '{')) depth += 1;
      else if (isPunct(current, '}')) depth -= 1;
      else if (isPunct(current, ';') || (current.kind === 'string' && depth === 0)) break;
    }
    const specifier = tokens[end];
    if (specifier?.kind !== 'string' || !REACT_PACKAGE.test(specifier.value)) continue;
    handled.add(end);
    const clause = tokens.slice(clauseStart, end - 1);
    if (end === clauseStart) {
      violate(token.line, "a side-effect import of '@muxui/react'");
    } else if (!isWord(tokens[end - 1], 'from')) {
      violate(token.line, "an unreadable import of '@muxui/react'");
    } else if (specifier.value !== '@muxui/react') {
      violate(token.line, `a subpath import of '${specifier.value}'`);
    } else if (typeOnly) {
      continue;
    } else if (!isPunct(clause[0], '{') || !isPunct(clause.at(-1), '}')) {
      violate(token.line, `a ${clause.some((item) => isPunct(item, '*')) ? 'namespace' : 'default'} import of '@muxui/react'`);
    } else {
      const result = namedSpecifiers(clause);
      if (result.violation) violate(token.line, `${result.violation} from '@muxui/react'`);
      else imported.push(...result.names);
    }
  }

  for (const [index, token] of tokens.entries()) {
    if (token.kind !== 'string' || !REACT_PACKAGE.test(token.value) || handled.has(index)) continue;
    const previous = tokens[index - 1]?.value;
    violate(token.line, previous === 'from'
      ? "an export ... from '@muxui/react'"
      : previous === '(' ? "a call naming '@muxui/react', such as require" : "a string naming '@muxui/react'");
  }
  return { imported, violations };
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
        `${message}; a variant may import @muxui/react only as a static named import, and pattern.participants must declare each component it imports`,
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
