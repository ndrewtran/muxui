import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// marked is the Markdown parser @muxui/react declares, so the workspace root does not need a second one.
const { Lexer, marked } = createRequire(resolve(import.meta.dirname, '../packages/react/package.json'))('marked');

/**
 * Reads the shared Markdown guides that the docs site and Storybook both show: the family links a guide makes, the
 * site routes it links, and the accessibility sections every family Docs page carries.
 */

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

/**
 * The site routes a guide links to, such as `/installation/#tested-profile`: every inline link whose target starts with
 * a single slash. Storybook has no such route, so a host that shows the guide must say where each one leads.
 * @param {string} markdown
 * @returns {string[]} The link targets, in order of first appearance.
 */
export function linkedSiteRoutes(markdown) {
  /** @type {string[]} */
  const routes = [];
  marked.walkTokens(Lexer.lex(markdown), (/** @type {{ type: string, href?: string }} */ token) => {
    if (token.type === 'link' && token.href !== undefined && /^\/(?!\/)/u.test(token.href) && !routes.includes(token.href)) routes.push(token.href);
  });
  return routes;
}

/** The id of the shared accessibility guide, the one author of the support status and verification text below. */
export const accessibilityGuideId = 'muxui:guide:accessibility';

/** The guide sections a family page carries beside its own obligations. The guide keeps the rest. */
const familyAccessibilityHeadings = ['Support status', 'Verification'];

/**
 * The shared accessibility guide's support status (what is claimed, what automated proof exists, what is deferred and
 * what is limited) and verification (what the consumer tests), cut from the guide's Markdown so the guide stays their
 * only author. A family page shows them under its obligations and links the full guide. Sections are the guide's
 * second level headings, found among the parsed top-level tokens, so a fence that holds a heading is only code.
 * A section keeps its deeper headings. Fails when the guide drops, repeats or empties one of the headings.
 * @param {string} markdown The guide file.
 * @returns {{ heading: string, markdown: string }[]} In page order, each without its heading line.
 */
export function accessibilityGuideSections(markdown) {
  /** @type {{ heading: string, raw: string[] }[]} */
  const sections = [];
  /** @type {{ heading: string, raw: string[] } | undefined} */
  let current;
  for (const token of Lexer.lex(markdown)) {
    if (token.type === 'heading' && token.depth <= 2) {
      current = token.depth === 2 ? { heading: token.text, raw: [] } : undefined;
      if (current !== undefined) sections.push(current);
    } else {
      current?.raw.push(token.raw);
    }
  }
  return familyAccessibilityHeadings.map((heading) => {
    const matches = sections.filter((section) => section.heading === heading);
    if (matches.length !== 1) throw new Error(`The accessibility guide must have exactly one "${heading}" section, found ${matches.length}.`);
    const body = matches[0].raw.join('').trim();
    if (body === '') throw new Error(`The accessibility guide's "${heading}" section is empty.`);
    return { heading, markdown: body };
  });
}
