import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// marked is the Markdown parser @muxui/react declares, so the workspace root does not need a second one.
const { Lexer, marked } = createRequire(resolve(import.meta.dirname, '../packages/react/package.json'))('marked');

const familyPath = /^\/components(?:[/?#]|$)/u;
const acceptedForm = 'an inline link such as [Checkbox](/components/checkbox/), with an optional double-quoted title';

/** Whether a link or anchor target names a component page, ignoring the spaces an HTML attribute may carry. */
const namesFamily = (/** @type {string} */ target) => familyPath.test(target.trim());

/**
 * The families a guide links to. A guide links to another family by its docs path, and the only accepted form is the
 * inline link `[Checkbox](/components/checkbox/)`, optionally with a double-quoted title. The docs site serves that path
 * as the family page, and Storybook resolves the same link to the family's Docs page. A guide links to a family page,
 * never to a section of it.
 *
 * Storybook's renderer reads fewer link forms than the docs site does, so every other form of a family link fails here
 * instead of rendering as text or as a link Storybook cannot resolve. Links are read from the parsed Markdown, so a link
 * inside a code span, a code block or an HTML comment is only example text.
 * @param {string} markdown
 * @returns {string[]} The family slugs, in order of first appearance.
 */
export function linkedFamilies(markdown) {
  /** @type {string[]} */
  const slugs = [];
  marked.walkTokens(Lexer.lex(markdown), (/** @type {{ type: string, href?: string, title?: string | null, raw: string }} */ token) => {
    if (token.type === 'html') {
      // An anchor in HTML, whatever its spacing or quoting, is not a link the Storybook page resolves.
      for (const [tag] of token.raw.replace(/<!--[\s\S]*?-->/gu, '').matchAll(/<a\b[^>]*>/giu)) {
        const href = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*))/iu.exec(tag);
        if (href !== null && namesFamily(href[1] ?? href[2] ?? href[3] ?? '')) {
          throw new Error(`The guide links to a family with HTML (${tag}). Write ${acceptedForm}.`);
        }
      }
      return;
    }
    if (token.type !== 'link' || token.href === undefined || !namesFamily(token.href)) return;
    const slug = /^\/components\/([a-z0-9-]+)\/$/u.exec(token.href)?.[1];
    if (slug === undefined) throw new Error(`The guide link ${token.href} must be a family page path such as /components/checkbox/.`);
    const destination = token.title ? `${token.href} "${token.title}"` : token.href;
    if (!token.raw.endsWith(`](${destination})`)) {
      throw new Error(`The guide link ${token.raw} to ${token.href} is not one Storybook can resolve. Write ${acceptedForm}.`);
    }
    if (!slugs.includes(slug)) slugs.push(slug);
  });
  return slugs;
}
