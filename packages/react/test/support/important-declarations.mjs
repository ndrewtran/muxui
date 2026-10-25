// Reads every `!important` declaration in a stylesheet with the rules and at-rules around it, so a test
// can pin each one by identity and category rather than by count.

const collapse = (text) => text.replace(/\s+/gu, ' ').trim();

/** Each `!important` declaration as `{ chain, property, value }`; `chain` is its enclosing preludes, outermost first. */
export function importantDeclarations(css) {
  const found = [];
  const walk = (start, chain) => {
    let index = start;
    let text = '';
    let parentheses = 0;
    const declaration = () => {
      const match = /^([^:]+):([\s\S]*?)\s*!\s*important\s*$/iu.exec(text.trim());
      if (match) found.push({ chain, property: collapse(match[1]), value: collapse(match[2]) });
      text = '';
    };
    while (index < css.length) {
      const char = css[index];
      if (char === '/' && css[index + 1] === '*') {
        const end = css.indexOf('*/', index + 2);
        if (end < 0) throw new Error('unterminated comment');
        // A comment separates tokens: `4/**/0%` is two tokens, not `40%`.
        text += ' ';
        index = end + 2;
      } else if (char === '"' || char === "'") {
        let end = index + 1;
        while (end < css.length && css[end] !== char) end += css[end] === '\\' ? 2 : 1;
        text += css.slice(index, end + 1);
        index = end + 1;
      } else if (char === '{') {
        index = walk(index + 1, [...chain, collapse(text)]);
        text = '';
      } else if (char === '}') {
        if (chain.length === 0) throw new Error('unbalanced closing brace');
        declaration();
        return index + 1;
      } else if (char === ';' && parentheses === 0) {
        declaration();
        index += 1;
      } else {
        if (char === '(') parentheses += 1;
        if (char === ')') parentheses -= 1;
        text += char;
        index += 1;
      }
    }
    if (chain.length > 0) throw new Error('unbalanced opening brace');
    return index;
  };
  walk(0, []);
  return found;
}

/** What the declaration is for: forced colors, reduced motion by media query or by attribute, or structural. */
export function importantCategory({ chain }) {
  if (chain.some((prelude) => /^@media[^{]*forced-colors/u.test(prelude))) return 'forced-colors';
  if (chain.some((prelude) => /^@media[^{]*prefers-reduced-motion/u.test(prelude))) return 'reduced-motion-media';
  if (chain.some((prelude) => /data-reduced-motion|data-muxui-motion=['"]reduced['"]|data-muxui-[a-z-]*reduced\b/u.test(prelude))) return 'reduced-motion-attribute';
  return 'structural';
}

/** One string for the declaration's whole context, equal text kept: two identical declarations give two entries. */
export const importantIdentity = ({ chain, property, value }) => `${chain.join(' { ')} { ${property}: ${value}`;
