import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// marked is the Markdown parser @muxui/react declares, so the workspace root does not need a second one.
const { Lexer, marked } = createRequire(resolve(import.meta.dirname, '../packages/react/package.json'))('marked');

/**
 * The families a guide links to. A guide links to another family by its docs path, such as
 * `[Checkbox](/components/checkbox/)`, which is that family's page on the docs site. Storybook resolves
 * the same link to the family's Docs page. A guide links to a family page, never to a section of it.
 *
 * Links are read from the parsed Markdown, so a link title, an angle-bracket destination or a reference
 * definition counts, and a link inside a code span or code block does not.
 * @param {string} markdown
 * @returns {string[]} The family slugs, in order of first appearance.
 */
export function linkedFamilies(markdown) {
  /** @type {string[]} */
  const slugs = [];
  marked.walkTokens(Lexer.lex(markdown), (/** @type {{ type: string, href?: string, raw?: string }} */ token) => {
    if (token.type === 'html' && /href\s*=\s*["']?\/components\//iu.test(token.raw ?? '')) {
      throw new Error(`The guide links to a family with HTML (${token.raw?.trim()}). Write a Markdown link such as [Checkbox](/components/checkbox/).`);
    }
    if (token.type !== 'link' || token.href === undefined || !/^\/components(?:[/?#]|$)/u.test(token.href)) return;
    const slug = /^\/components\/([a-z0-9-]+)\/$/u.exec(token.href)?.[1];
    if (slug === undefined) throw new Error(`The guide link ${token.href} must be a family page path such as /components/checkbox/.`);
    if (!slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}
