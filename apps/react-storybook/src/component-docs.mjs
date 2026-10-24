import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix, resolve } from 'node:path';
import { componentReference, readDeclarationReference, readReactPackageFacts, usageGuideId } from '../../component-reference.mjs';
import { accessibilityGuideId, accessibilityGuideSections, linkedFamilies, linkedSiteRoutes } from '../../guide-links.mjs';

/**
 * The docs entry of every component family: the catalog facts its Storybook
 * Docs page shows, projected through the shared `apps/component-reference.mjs`
 * with the few things only this host needs (the static example source, the
 * related usage guide, and the Block pages that use the component).
 *
 * The generator embeds each entry in its family's story module as the
 * `muxuiReference` parameter, so the browser reads plain JSON and never the
 * catalog. Nothing here is authored: every string comes from the catalog
 * record, an example file, a guide file, the renderer descriptor, or the
 * declaration reference. Every entry also carries the same sections of the
 * shared accessibility guide.
 */

// The app declares @muxui/catalog, the same canonical query API the docs application reads,
// so its generation prerequisites build the catalog after React's derived APIs.
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
 * Where a docs site route that the shared accessibility guide links leads in Storybook, which has no such page: the
 * file that owns what the route shows, opened on GitHub like a guide's own source. The tested profile on Installation
 * is the compatibility record in the React closure. A route that is not named here fails generation instead of
 * rendering a link that goes nowhere.
 */
const siteRouteSources = Object.freeze({ '/installation/': 'catalog/react-r1-5/closure.json' });

/**
 * @param {readonly { markdown: string }[]} sections
 * @param {string} repositoryRoot
 * @returns {Record<string, string>} The repository file each linked route leads to, by link target.
 */
export function siteLinks(sections, repositoryRoot) {
  return Object.fromEntries(sections.flatMap(({ markdown }) => linkedSiteRoutes(markdown)).map((route) => {
    const source = siteRouteSources[route.split('#')[0]];
    if (source === undefined || !existsSync(resolve(repositoryRoot, source))) {
      throw new Error(`The accessibility guide links ${route}, which Storybook can open only when siteRouteSources names the file that owns it.`);
    }
    return [route, source];
  }));
}

const upperFirst = (word) => `${word[0].toUpperCase()}${word.slice(1)}`;

/** Every member name a part declares, in its shared members and in any alternative. */
const declaredNames = (part) => new Set([...(part.members ?? []), ...(part.alternatives ?? []).flatMap(({ members }) => members)].map(({ name }) => name));

/** The ids of the Mux UI types a part's members, ref, native envelopes and type parameters name. */
function partRefs(part) {
  const bodies = [part, ...(part.alternatives ?? [])];
  return bodies.flatMap((body) => [
    ...(body.members ?? []).flatMap(({ refs = [] }) => refs),
    ...(body.ref?.refs ?? []),
    ...(body.natives ?? []).flatMap(({ refs = [] }) => refs),
    ...(body.typeParameters ?? []).flatMap(({ refs = [] }) => refs),
  ]);
}

/**
 * The Mux UI types a family's page names, printed as the declarations wrote them: those its exports are, and
 * those their members, refs, native envelopes, type parameters and signatures reach, through other types too.
 * @param {string} owner
 * @param {readonly import('../../component-reference.mjs').DeclarationType[]} types Every type the owner's file prints.
 * @param {readonly string[]} seeds
 * @param {(entry: string) => string} specifier The import specifier of an export-map key.
 */
function reachedTypes(owner, types, seeds, specifier) {
  const byId = new Map(types.map((type) => [type.id, type]));
  const reached = new Set();
  const visit = (id) => {
    if (reached.has(id)) return;
    const type = byId.get(id);
    if (type === undefined) throw new Error(`${owner} names ${id}, which its declaration reference does not print.`);
    reached.add(id);
    [...(type.refs ?? []), ...(type.extends ?? []).flatMap(({ refs = [] }) => refs)].forEach(visit);
  };
  seeds.forEach(visit);
  return types.filter(({ id }) => reached.has(id)).map(({ id, name, public: where, text }) => ({
    id,
    name,
    ...(where && { public: where.map((item) => ({ ...item, specifier: specifier(item.entry) })) }),
    text,
  }));
}

/**
 * The typed reference of one family (Decision 0031): every export the declaration inventory gives the family's
 * owner, with its import, and for a component each part as the declarations wrote it (members, alternatives, ref,
 * native envelope, type parameters). The catalog adds what declarations do not hold to the parts of the family's
 * own export: each default (executed, or authored for a family not yet derived) and the event channel each
 * callback reports. Docs show it; nothing in it is read from a type string.
 * @param {object} input
 * @param {import('../../component-reference.mjs').ComponentDeclarations} input.share The component's `declarations` from `componentReference`: its export, the owner's `related` exports, and the types they reach.
 * @param {import('../../component-reference.mjs').DeclarationReference} input.declarations Read for the inventory, which says which exports the owner's page lists and from where.
 * @param {string} input.packageName
 * @param {string} input.primary The export the family's catalog record binds, such as `IconButton`.
 * @param {{ props: readonly string[], events: readonly string[], defaults?: Readonly<Record<string, unknown>>, eventDetails?: Readonly<Record<string, { prop: string }>>, propDetails?: unknown, partApis?: Readonly<Record<string, { member: string, props: readonly string[], events: readonly string[], defaults?: Readonly<Record<string, unknown>>, eventDetails?: Readonly<Record<string, { prop: string }>> }>> }} input.api
 */
export function typedReference({ share, declarations, packageName, primary, api }) {
  const { owner } = share;
  // Every export of the owner's file: the family's own and the hooks, helpers, providers and flat parts that `related` carries.
  const records = [share.export, ...share.related];
  if (share.values !== undefined && share.values.length > 0) throw new Error(`${owner} reaches a value through typeof, which no Docs page prints yet.`);
  const specifier = (key) => key === '.' ? packageName : `${packageName}${key.slice(1)}`;
  const provenance = api.propDetails === undefined ? 'authored' : 'executed';

  // The catalog block that describes a part: its own, or the root's for the export itself and its Root part.
  const blockFor = (part) => Object.values(api.partApis ?? {}).find(({ member }) => member === part.member)
    ?? (part.member === null || part.member === 'Root' ? api : undefined);
  const placed = new Map();
  const shapePart = (part) => {
    const block = blockFor(part);
    if (block === undefined) return part;
    const names = declaredNames(part);
    const defaults = Object.fromEntries(Object.entries(block.defaults ?? {}).filter(([name]) => names.has(name)));
    const events = Object.fromEntries(block.events
      .map((channel) => [block.eventDetails?.[channel]?.prop ?? `on${upperFirst(channel)}`, channel])
      .filter(([prop]) => names.has(prop)));
    placed.set(block, new Set([...(placed.get(block) ?? []), ...Object.keys(defaults)]));
    return { ...part, ...(Object.keys(defaults).length > 0 && { defaults }), ...(Object.keys(events).length > 0 && { events }) };
  };

  const owned = declarations.inventory.entries.flatMap((entry) => 'exports' in entry
    ? entry.exports.filter((item) => item.owner === owner).map((item) => ({ ...item, entry: entry.key }))
    : []);
  const seeds = [];
  const exports = owned.map(({ name, kind, entry, reason }) => {
    const base = { name, entry, specifier: specifier(entry), ...(reason && { reason }) };
    if (kind === 'type') {
      const type = share.types.find(({ public: where }) => where?.some((item) => item.entry === entry && item.name === name));
      if (type === undefined) throw new Error(`${owner} does not print the type ${name} from ${entry}.`);
      seeds.push(type.id);
      return { ...base, kind: 'type', id: type.id };
    }
    const record = records.find((item) => item.name === name && item.entry === entry);
    if (record === undefined) throw new Error(`${owner} does not hold ${name} from ${entry}.`);
    if (record.kind === 'component') {
      const parts = record.name === primary ? record.parts.map(shapePart) : record.parts;
      parts.forEach((part) => seeds.push(...partRefs(part)));
      return { ...base, kind: 'component', ...(record.name === primary && { primary: true }), parts };
    }
    if (record.kind === 'function') {
      seeds.push(...record.parameters.flatMap(({ refs = [] }) => refs), ...(record.returns.refs ?? []));
      return { ...base, kind: 'function', signature: record.signature, ...(record.doc && { doc: record.doc }) };
    }
    seeds.push(...(record.refs ?? []));
    return { ...base, kind: 'value', type: record.type, ...(record.doc && { doc: record.doc }), ...(record.refs && { refs: record.refs }) };
  });

  // A default the catalog lists that no part of a derived family shows is lost; an authored family's catalog does not always say which part.
  const lost = [api, ...Object.values(api.partApis ?? {})].flatMap((block) => Object.entries(block.defaults ?? {})
    .filter(([name]) => !placed.get(block)?.has(name)).map(([name, value]) => ({ name, value })));
  if (lost.length > 0 && provenance === 'executed') {
    throw new Error(`${primary} has catalog defaults that no part of its declarations declares: ${lost.map(({ name }) => name).join(', ')}.`);
  }

  const order = ['component', 'function', 'value', 'type'];
  return {
    owner,
    source: share.source,
    sources: share.sources,
    provenance,
    // Where the exports no family owns are listed: the package's own, and the types several families share.
    packageSources: ['package-level', 'shared'].map((name) => `${share.source.slice(0, share.source.lastIndexOf('/'))}/${declarations.inventory.owners[name]}`),
    exports: exports.sort((left, right) => (right.primary === true) - (left.primary === true) || order.indexOf(left.kind) - order.indexOf(right.kind)),
    types: reachedTypes(owner, share.types, seeds, specifier),
    ...(lost.length > 0 && { unplacedDefaults: lost }),
  };
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
  const declarations = readDeclarationReference(repositoryRoot);
  const guides = guideIds();
  const installationGuide = posix.join(posix.dirname(packageFacts.manifestPath), 'README.md');
  if (!existsSync(resolve(repositoryRoot, installationGuide))) throw new Error(`The React package installation guidance is missing: ${installationGuide}.`);
  const text = (path) => readFile(resolve(repositoryRoot, path), 'utf8');
  /** A guide's record and file, which must agree on the file's digest. */
  const readGuide = async (guideId) => {
    const { artifact: record } = detail({ id: guideId });
    const body = await text(record.source.content);
    if (record.source.contentDigest !== undefined && `sha256:${createHash('sha256').update(body).digest('hex')}` !== record.source.contentDigest) {
      throw new Error(`${guideId} source content does not match its catalog digest.`);
    }
    return { record, body };
  };
  if (!guides.has(accessibilityGuideId)) throw new Error(`The canonical catalog has no ${accessibilityGuideId} guide.`);
  const accessibility = await readGuide(accessibilityGuideId);
  const accessibilitySections = accessibilityGuideSections(accessibility.body);
  const accessibilityGuide = {
    id: accessibilityGuideId,
    name: accessibility.record.name,
    source: accessibility.record.source.content,
    sections: accessibilitySections,
    links: siteLinks(accessibilitySections, repositoryRoot),
  };
  const entries = new Map();
  for (const id of componentIds) {
    const { artifact, usedIn = [] } = detail({ id });
    const examples = detail({ id, section: 'examples' }).value ?? [];
    if (examples.length === 0) throw new Error(`The canonical catalog has no React example for ${id}.`);
    const { declarations: share, ...reference } = componentReference({ artifact, examples, packageFacts, declarations });

    let guide = null;
    const guideId = usageGuideId(id);
    if (guides.has(guideId)) {
      const { record, body } = await readGuide(guideId);
      const markdown = guideMarkdown(body);
      guide = { id: guideId, name: record.name, source: record.source.content, markdown, links: guideLinks(markdown, docsPages) };
    }

    entries.set(id, entryFor({
      artifact,
      reference,
      typed: typedReference({ share, declarations, packageName: packageFacts.packageName, primary: packageFacts.bindings.get(`${id}#web.react`).export, api: artifact.bindings[platform].api }),
      guide,
      accessibilityGuide,
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

function entryFor({ artifact, reference, typed, guide, accessibilityGuide, installationGuide, examples, usedIn }) {
  return {
    id: artifact.id,
    name: artifact.name,
    summary: artifact.summary,
    lifecycle: artifact.bindings[platform].lifecycle,
    installationGuide,
    examples,
    usedIn,
    guide,
    accessibilityGuide,
    ...reference,
    typed,
    // The declarations the typed reference was read from follow the family's other sources.
    sources: [...reference.sources, { label: 'Declarations', paths: [typed.source, ...Object.values(typed.sources)] }],
  };
}
