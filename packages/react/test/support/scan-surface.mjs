// Scanners the public-surface test uses to read what source and CSS actually consume.
// They are deliberately conservative: a form they cannot resolve is reported as a
// consumed hook, so it fails the topology check rather than slipping past it.

// `class`/`className` as a JSX attribute, a property assignment, or an object key
// (`{ className: '...' }`, `{ 'class': '...' }`), including inside a spread.
const classCarrier = /(?:\b(?:class|className)\b|(["'])(?:class|className)\1)\s*[=:](?![=>])\s*/gu;

function closingIndex(source, open, [begin, end]) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === begin) depth += 1;
    else if (source[index] === end && (depth -= 1) === 0) return index;
  }
  return source.length;
}

function stringLiteral(text) {
  const match = /^(?:"([^"\\]*)"|'([^'\\]*)'|`([^`\\$]*)`)$/u.exec(text.trim());
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

// The class names a value expression starting at `start` consumes: its words when it
// is a plain string, otherwise the unresolved expression text, which names no known class.
function classesAt(source, start) {
  const first = source[start];
  let end;
  if (first === '"' || first === "'" || first === '`') {
    end = source.indexOf(first, start + 1);
    end = end < 0 ? source.length : end + 1;
  } else if (first === '{') {
    end = closingIndex(source, start, ['{', '}']) + 1;
  } else {
    end = start + (/^[^\s,;)}\]]*/u.exec(source.slice(start))?.[0].length ?? 0);
  }
  const expression = source.slice(start, end);
  const literal = stringLiteral(expression.startsWith('{') ? expression.slice(1, -1) : expression);
  return literal === null ? [expression] : literal.split(/\s+/u).filter(Boolean);
}

/**
 * What a source file consumes: the classes it sets, the `data-muxui-*` attributes it
 * names, and the argument of every `querySelector`/`querySelectorAll` call.
 */
export function consumedHooks(source) {
  const classes = [...source.matchAll(classCarrier)]
    .flatMap((match) => classesAt(source, match.index + match[0].length));
  const selectors = [...source.matchAll(/querySelector(?:All)?\s*\(/gu)].map((match) => {
    const open = match.index + match[0].length - 1;
    return source.slice(open + 1, closingIndex(source, open, ['(', ')'])).trim();
  });
  return {
    classes: classes.filter(Boolean),
    attributes: [...source.matchAll(/\b(data-muxui-[a-z0-9-]+)(?:\s*=|\b)/gu)].map((match) => match[1]),
    selectors,
  };
}

function stringEnd(css, quoteIndex) {
  for (let index = quoteIndex + 1; index < css.length; index += 1) {
    if (css[index] === '\\') index += 1;
    else if (css[index] === css[quoteIndex] || css[index] === '\n') return index;
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

/**
 * The class names that appear in the selector of a style rule. Comments and string
 * literals are skipped, and only the text before a `{` that opens a rule counts,
 * inside at-rule blocks and nested rules too. At-rule preludes such as `@scope (.x)`
 * are not style-rule selectors.
 */
export function styleRuleClasses(stylesheet) {
  const classes = new Set();
  let prelude = '';
  let parentheses = 0;
  for (let index = 0; index < stylesheet.length; index += 1) {
    const char = stylesheet[index];
    if (char === '/' && stylesheet[index + 1] === '*') {
      const end = stylesheet.indexOf('*/', index + 2);
      index = end < 0 ? stylesheet.length : end + 1;
      prelude += ' ';
    } else if (char === '"' || char === "'") {
      index = stringEnd(stylesheet, index);
      prelude += '""';
    } else if (char === '{') {
      addPreludeClasses(prelude, classes);
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
