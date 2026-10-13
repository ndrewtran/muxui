// Scanners the public-surface test uses to read what source and CSS actually consume.
// They are deliberately conservative: a form they cannot resolve is reported as a
// consumed hook, so it fails the topology check rather than slipping past it.

// `class`/`className` as a JSX attribute, a property assignment, or an object key
// (`{ className: '...' }`, `{ 'class': '...' }`), including inside a spread.
const classCarrier = /(?:\b(?:class|className)\b|(["'])(?:class|className)\1)\s*[=:](?![=>])\s*/gu;

// What may follow a string that is the whole value: the end of the source, `,` `;` `}` `)`,
// the end of a JSX tag, or the next JSX attribute. Any operator, call, member access, or
// index means the string is only the start of a larger expression.
const afterWholeValue = /^\s*(?:$|[,;})>]|\/>|(?!in\b|instanceof\b)[A-Za-z_${])/u;

function closingIndex(source, open, [begin, end]) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === begin) depth += 1;
    else if (source[index] === end && (depth -= 1) === 0) return index;
  }
  return source.length;
}

// The index of the closing quote of the string that opens at `quoteIndex`.
function stringEnd(text, quoteIndex) {
  for (let index = quoteIndex + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === text[quoteIndex] || (text[index] === '\n' && text[quoteIndex] !== '`')) return index;
  }
  return text.length;
}

// A string that is a single plain literal: no escapes and no `${}` substitutions.
function plainLiteral(text) {
  const match = /^(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\$]*)`)$/u.exec(text.trim());
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

// The end of a value expression that starts at `start`: the first `,` or `;` outside any
// brackets, or the bracket that closes the enclosing one.
function expressionEnd(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'" || char === '`') index = stringEnd(source, index);
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) {
      if (depth === 0) return index;
      depth -= 1;
    } else if (depth === 0 && (char === ',' || char === ';')) return index;
  }
  return source.length;
}

// The class names a value that starts at `start` consumes. Only a value that is exactly one
// plain string literal contributes its words. Any other expression is reported whole, wrapped
// in braces, so it can never equal a class name.
function classesAt(source, start) {
  let expression;
  if (source[start] === '{') {
    expression = source.slice(start, closingIndex(source, start, ['{', '}']) + 1);
    const literal = plainLiteral(expression.slice(1, -1));
    if (literal !== null) return literal.split(/\s+/u).filter(Boolean);
  } else {
    if ('"\'`'.includes(source[start])) {
      const end = stringEnd(source, start) + 1;
      const literal = plainLiteral(source.slice(start, end));
      if (literal !== null && afterWholeValue.test(source.slice(end))) return literal.split(/\s+/u).filter(Boolean);
    }
    expression = source.slice(start, expressionEnd(source, start)).trim();
  }
  return [expression.startsWith('{') ? expression : `{${expression}}`];
}

/**
 * What a source file consumes: the classes it sets, the `data-muxui-*` attributes it
 * names, and every `querySelector`/`querySelectorAll` use, as its call argument or, when
 * the name is used without a plain call (`.call`, an alias, bracket access), the name.
 */
export function consumedHooks(source) {
  const classes = [...source.matchAll(classCarrier)]
    .flatMap((match) => classesAt(source, match.index + match[0].length));
  const selectors = [...source.matchAll(/\bquerySelector(?:All)?\b/gu)].map((match) => {
    const end = match.index + match[0].length;
    const call = /^\s*(?:\?\.\s*)?\(/u.exec(source.slice(end));
    if (!call) return match[0];
    const open = end + call[0].length - 1;
    return source.slice(open + 1, closingIndex(source, open, ['(', ')'])).trim();
  });
  return {
    classes,
    attributes: [...source.matchAll(/\b(data-muxui-[a-z0-9-]+)(?:\s*=|\b)/gu)].map((match) => match[1]),
    selectors,
  };
}

// The index of the last character of the comment or string that starts at `index`, or -1.
function triviaEnd(css, index) {
  if (css[index] === '/' && css[index + 1] === '*') {
    const end = css.indexOf('*/', index + 2);
    return end < 0 ? css.length : end + 1;
  }
  return css[index] === '"' || css[index] === "'" ? stringEnd(css, index) : -1;
}

// The `}` that matches the `{` at `open`, skipping comments and strings.
function braceEnd(css, open) {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const skipped = triviaEnd(css, index);
    if (skipped >= 0) index = skipped;
    else if (css[index] === '{') depth += 1;
    else if (css[index] === '}' && (depth -= 1) === 0) return index;
  }
  return css.length;
}

function addPreludeClasses(prelude, classes) {
  const text = prelude.trim();
  if (text === '' || text.startsWith('@')) return;
  // A class only excluded by :not() or named inside an attribute value is not selected.
  let selector = text.replace(/\[[^\]]*\]/gu, '');
  for (let at = selector.indexOf(':not('); at >= 0; at = selector.indexOf(':not(')) {
    selector = selector.slice(0, at) + selector.slice(closingIndex(selector, at + 4, ['(', ')']) + 1);
  }
  for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)) classes.add(match[1]);
}

// A statement such as `--name:` or `--name: value`: the only declaration whose value may
// hold a `{}` block, so a `{` after it opens a value and not a rule.
const customPropertyStatement = /^\s*--[^\s:]*\s*:/u;

/**
 * The class names that appear in the selector of a style rule. Comments and string
 * literals are skipped, and only the text before a `{` that opens a rule counts,
 * inside at-rule blocks and nested rules too. At-rule preludes such as `@scope (.x)`
 * and the `{}` block of a custom property value are not style-rule selectors.
 */
export function styleRuleClasses(stylesheet) {
  const classes = new Set();
  let prelude = '';
  let parentheses = 0;
  for (let index = 0; index < stylesheet.length; index += 1) {
    const char = stylesheet[index];
    const skipped = triviaEnd(stylesheet, index);
    if (skipped >= 0) {
      prelude += char === '/' ? ' ' : '""';
      index = skipped;
    } else if (char === '{') {
      if (customPropertyStatement.test(prelude)) index = braceEnd(stylesheet, index);
      else addPreludeClasses(prelude, classes);
      prelude = '';
      parentheses = 0;
    } else if (char === '}' || (char === ';' && parentheses === 0)) {
      prelude = '';
      parentheses = 0;
    } else {
      if (char === '(') parentheses += 1;
      else if (char === ')') parentheses = Math.max(0, parentheses - 1);
      prelude += char;
    }
  }
  return classes;
}
