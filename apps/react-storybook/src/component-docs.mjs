import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix, resolve } from 'node:path';
import { componentReference, readReactPackageFacts, usageGuideId } from '../../component-reference.mjs';
import { linkedFamilies } from '../../guide-links.mjs';

/**
 * The docs entry of every component family: the catalog facts its Storybook
 * Docs page shows, projected through the shared `apps/component-reference.mjs`
 * with the few things only this host needs (the static example source, the
 * related usage guide, and the Block pages that use the component).
 *
 * The generator embeds each entry in its family's story module as the
 * `muxuiReference` parameter, so the browser reads plain JSON and never the
 * catalog. Nothing here is authored: every string comes from the catalog
 * record, an example file, a guide file, or the renderer descriptor.
 */

// The workspace root declares @muxui/catalog, the same canonical query API the docs application reads.
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const platform = 'web.react';

/** @param {Record<string, unknown>} request */
function detail(request) {
  const response = catalog.getArtifact({ platform, detail: 'full', ...request });
  if (response.type !== 'artifact.detail') throw new Error(`The canonical catalog could not retrieve ${request.id}.`);
  return response.data;
}

function guideIds() {
  const ids = new Set();
  let cursor;
  do {
    const response = catalog.listArtifacts({ kind: 'guide', platform, detail: 'brief', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
    if (response.type !== 'artifact.list') throw new Error('The canonical guide inventory query failed.');
    for (const { id } of response.data.items) ids.add(id);
    cursor = response.meta.nextCursor ?? undefined;
  } while (cursor !== undefined);
  return ids;
}

/** A guide's body for the Docs page: no front matter and no title, since the section already names it. */
function guideMarkdown(source) {
  return source.replace(/^---\n[\s\S]*?\n---\n/u, '').replace(/^\s*# [^\n]*\n/u, '').trim();
}

/**
 * A guide links to another family by its docs path, such as `/components/checkbox/`. Storybook has no such
 * route, so each link resolves to the family's Docs page, which the Docs page renders from this map.
 * @param {string} markdown
 * @param {ReadonlyMap<string, string>} docsPages The Docs page of each family, by component id.
 * @returns {Record<string, string>} The Docs page of every family the guide links to, by link target.
 */
export function guideLinks(markdown, docsPages) {
  return Object.fromEntries(linkedFamilies(markdown).map((slug) => {
    const page = docsPages.get(`muxui:component:${slug}`);
    if (page === undefined) throw new Error(`The guide links to /components/${slug}/, which has no Storybook Docs page.`);
    return [`/components/${slug}/`, page];
  }));
}

/**
 * @param {object} input
 * @param {string} input.repositoryRoot
 * @param {readonly string[]} input.componentIds Canonical component ids, such as `muxui:component:button`.
 * @param {ReadonlyMap<string, string>} input.docsPages The Docs page of each family, such as `?path=/docs/muxui-react-r1-1-button--docs`, by component id.
 * @param {readonly { pattern: string, family: string, storyId: string }[]} input.blocks Each Block page with the id of its first variant story.
 * @returns {Promise<Map<string, ReturnType<typeof entryFor>>>}
 */
export async function readComponentDocs({ repositoryRoot, componentIds, docsPages, blocks }) {
  const packageFacts = readReactPackageFacts(repositoryRoot);
  const guides = guideIds();
  const installationGuide = posix.join(posix.dirname(packageFacts.manifestPath), 'README.md');
  if (!existsSync(resolve(repositoryRoot, installationGuide))) throw new Error(`The React package installation guidance is missing: ${installationGuide}.`);
  const text = (path) => readFile(resolve(repositoryRoot, path), 'utf8');
  const entries = new Map();
  for (const id of componentIds) {
    const { artifact, usedIn = [] } = detail({ id });
    const examples = detail({ id, section: 'examples' }).value ?? [];
    if (examples.length === 0) throw new Error(`The canonical catalog has no React example for ${id}.`);
    const reference = componentReference({ artifact, examples, packageFacts });

    let guide = null;
    const guideId = usageGuideId(id);
    if (guides.has(guideId)) {
      const { artifact: record } = detail({ id: guideId });
      const body = await text(record.source.content);
      if (record.source.contentDigest !== undefined && `sha256:${createHash('sha256').update(body).digest('hex')}` !== record.source.contentDigest) {
        throw new Error(`${guideId} source content does not match its catalog digest.`);
      }
      const markdown = guideMarkdown(body);
      guide = { id: guideId, name: record.name, source: record.source.content, markdown, links: guideLinks(markdown, docsPages) };
    }

    entries.set(id, entryFor({
      artifact,
      reference,
      guide,
      installationGuide,
      examples: await Promise.all(examples.map(async ({ name, summary, source }) => ({ name, summary, source: source.content, code: await text(source.content) }))),
      usedIn: usedIn.map(({ id: pattern, roles }) => {
        const block = blocks.find((candidate) => candidate.pattern === pattern);
        if (block === undefined) throw new Error(`${id} is used in ${pattern}, which has no Storybook Block page.`);
        return { name: block.family, storyId: block.storyId, roles };
      }),
    }));
  }
  return entries;
}

function entryFor({ artifact, reference, guide, installationGuide, examples, usedIn }) {
  return {
    id: artifact.id,
    name: artifact.name,
    summary: artifact.summary,
    lifecycle: artifact.bindings[platform].lifecycle,
    installationGuide,
    examples,
    usedIn,
    guide,
    ...reference,
  };
}
