// CSS scanners shared by the public-surface and styling inventory tests.

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

/**
 * The depth-0 constructs of a stylesheet: each `;` statement and each `{` block, as its
 * prelude text. Comments and string literals are skipped whole, so a brace in either does
 * not count. A stylesheet whose braces do not balance throws.
 */
export function topLevelConstructs(stylesheet) {
  const constructs = [];
  let depth = 0;
  let prelude = '';
  for (let index = 0; index < stylesheet.length; index += 1) {
    const char = stylesheet[index];
    if (char === '/' && stylesheet[index + 1] === '*') {
      const end = stylesheet.indexOf('*/', index + 2);
      if (end < 0) throw new Error('unterminated comment');
      index = end + 1;
    } else if (char === '"' || char === "'") {
      const end = stringEnd(stylesheet, index);
      if (depth === 0) prelude += stylesheet.slice(index, end + 1);
      index = end;
    } else if (char === '{') {
      if (depth === 0) constructs.push({ kind: 'block', prelude: prelude.trim() });
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('unbalanced closing brace');
      if (depth === 0) prelude = '';
    } else if (depth === 0) {
      if (char === ';') {
        constructs.push({ kind: 'statement', prelude: prelude.trim() });
        prelude = '';
      } else {
        prelude += char;
      }
    }
  }
  if (depth !== 0) throw new Error('unbalanced opening brace');
  if (prelude.trim() !== '') throw new Error('text outside a rule');
  return constructs;
}
