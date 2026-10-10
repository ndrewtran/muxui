import { createRequire } from 'node:module';
import type { BlockFilterIndex } from './block-filter.ts';
import {
	catalogApi,
	componentSummaries,
	isRecord,
	patternCategoryGroups,
	requiredString,
	stringArray,
	type CatalogModule,
	type CatalogUsedIn,
} from './catalog.ts';

/**
 * The Blocks loader: a typed read of the catalog query API for pattern records.
 * Every list, get, `uses`, and `usedIn` answer is the API's own response narrowed
 * to the fields the site reads; nothing here is authored or ranked.
 */

export interface BlockSummary {
	id: string;
	kind: 'pattern';
	name: string;
	summary: string;
	lifecycle: string;
	platforms: readonly string[];
	source: { record: string };
	category: string;
	group: string;
}

export interface BlockParticipant {
	role: string;
	component: string;
	requirement: string;
}

/** A pattern's `get` record, narrowed to what the Blocks pages read. */
export interface BlockRecord extends BlockSummary {
	participants: readonly BlockParticipant[];
	variants: readonly { example: string }[];
	accessibility: readonly string[];
}

/** A variant example from `get <pattern> --section examples`, with its exact source bytes in `code`. */
export interface BlockExample {
	id: string;
	kind: 'example';
	name: string;
	summary: string;
	lifecycle: string;
	platforms: readonly string[];
	source: { content: string; contentDigest: string; record: string };
	code: string;
}

const PLATFORM = 'web.react';
const PATTERN_PREFIX = 'muxui:pattern:';
const EXAMPLE_PREFIX = 'muxui:example:';

function tail(id: string): string {
	return id.slice(id.lastIndexOf(':') + 1);
}

function readSummary(value: unknown): BlockSummary {
	if (!isRecord(value) || value.kind !== 'pattern' || !isRecord(value.source)) {
		throw new Error('Canonical catalog response has an invalid pattern summary.');
	}
	return Object.freeze({
		id: requiredString(value.id, 'id'),
		kind: 'pattern' as const,
		name: requiredString(value.name, 'name'),
		summary: requiredString(value.summary, 'summary'),
		lifecycle: requiredString(value.lifecycle, 'lifecycle'),
		platforms: stringArray(value.platforms, 'platforms'),
		source: Object.freeze({ record: requiredString(value.source.record, 'source.record') }),
		category: requiredString(value.category, 'category'),
		group: requiredString(value.group, 'group'),
	});
}

function readParticipant(value: unknown): BlockParticipant {
	if (!isRecord(value)) throw new Error('Canonical pattern has an invalid participant.');
	return Object.freeze({
		role: requiredString(value.role, 'participant.role'),
		component: requiredString(value.component, 'participant.component'),
		requirement: requiredString(value.requirement, 'participant.requirement'),
	});
}

function readRecord(value: unknown): BlockRecord {
	if (!isRecord(value) || !Array.isArray(value.participants) || !Array.isArray(value.variants)) {
		throw new Error('Canonical catalog response has an invalid pattern record.');
	}
	return Object.freeze({
		...readSummary(value),
		participants: Object.freeze(value.participants.map(readParticipant)),
		variants: Object.freeze(value.variants.map((variant) => {
			if (!isRecord(variant)) throw new Error('Canonical pattern has an invalid variant.');
			return Object.freeze({ example: requiredString(variant.example, 'variant.example') });
		})),
		accessibility: stringArray(value.accessibility, 'accessibility'),
	});
}

function readExample(value: unknown): BlockExample {
	if (!isRecord(value) || value.kind !== 'example' || !isRecord(value.source)) {
		throw new Error('Canonical catalog response has an invalid variant example.');
	}
	return Object.freeze({
		id: requiredString(value.id, 'id'),
		kind: 'example' as const,
		name: requiredString(value.name, 'name'),
		summary: requiredString(value.summary, 'summary'),
		lifecycle: requiredString(value.lifecycle, 'lifecycle'),
		platforms: stringArray(value.platforms, 'platforms'),
		source: Object.freeze({
			content: requiredString(value.source.content, 'source.content'),
			contentDigest: requiredString(value.source.contentDigest, 'source.contentDigest'),
			record: requiredString(value.source.record, 'source.record'),
		}),
		code: requiredString(value.code, 'code'),
	});
}

/** Follows every page of a list request. */
function collectItems(request: (cursor: string | undefined) => unknown): unknown[] {
	const items: unknown[] = [];
	let cursor: string | undefined;
	do {
		const response = request(cursor);
		if (!isRecord(response) || response.type !== 'artifact.list' || !isRecord(response.data) || !Array.isArray(response.data.items) || !isRecord(response.meta)) {
			throw new Error('Mux UI docs received an unexpected artifact.list response.');
		}
		items.push(...response.data.items);
		const next = response.meta.nextCursor;
		if (next !== null && typeof next !== 'string') throw new Error('Mux UI docs received invalid artifact.list pagination.');
		if (response.meta.truncated === true && next === null) {
			throw new Error('Mux UI artifact.list response was truncated without a continuation cursor.');
		}
		cursor = next ?? undefined;
	} while (cursor !== undefined);
	return items;
}

/** `list pattern`: every enabled React block, in catalog order. `uses` keeps blocks that reference that component. */
export function listBlocks(uses?: string, api: CatalogModule = catalogApi): readonly BlockSummary[] {
	return Object.freeze(collectItems((cursor) => api.listArtifacts({
		kind: 'pattern',
		platform: PLATFORM,
		detail: 'brief',
		limit: 100,
		...(uses === undefined ? {} : { uses }),
		...(cursor === undefined ? {} : { cursor }),
	})).map(readSummary));
}

/** `get <pattern> --detail full`. */
export function getBlockRecord(id: string, api: CatalogModule = catalogApi): BlockRecord {
	const response = api.getArtifact({ id, platform: PLATFORM, detail: 'full' });
	if (!isRecord(response) || response.type !== 'artifact.detail' || !isRecord(response.data)) {
		throw new Error(`Mux UI docs received no pattern record for ${id}.`);
	}
	return readRecord(response.data.artifact);
}

/** `get <pattern> --section examples`: the variants in authored order, each with its exact source. */
export function getBlockExamples(id: string): readonly BlockExample[] {
	const response = catalogApi.getArtifact({ id, platform: PLATFORM, detail: 'compact', section: 'examples' });
	if (!isRecord(response) || response.type !== 'artifact.detail' || !isRecord(response.data) || !Array.isArray(response.data.value)) {
		throw new Error(`Mux UI docs received no variant examples for ${id}.`);
	}
	return Object.freeze(response.data.value.map(readExample));
}

const blockSummaries = listBlocks();
const componentById = new Map(componentSummaries.map((component) => [component.id, component]));

/** The catalog owns no display labels, so a label is derived from the id: `call-to-action` reads "Call to action". */
export function idLabel(id: string): string {
	const text = id.replaceAll('-', ' ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface BlockVariant {
	/** The route segment, unique within its block. */
	slug: string;
	id: string;
	name: string;
	summary: string;
	/** The canonical example source path, relative to the repository root. */
	sourcePath: string;
	/** The exact example source bytes. */
	code: string;
}

export interface BlockParticipantLink extends BlockParticipant {
	name: string;
	href: string;
}

export interface Block {
	id: string;
	slug: string;
	name: string;
	summary: string;
	category: string;
	categoryLabel: string;
	group: string;
	groupLabel: string;
	participants: readonly BlockParticipantLink[];
	accessibility: readonly string[];
	variants: readonly BlockVariant[];
}

function variantSlug(blockSlug: string, exampleId: string): string {
	const slug = tail(exampleId);
	return slug.startsWith(`${blockSlug}-`) ? slug.slice(blockSlug.length + 1) : slug;
}

function buildBlock(summary: BlockSummary): Block {
	if (!summary.id.startsWith(PATTERN_PREFIX)) throw new Error(`Unexpected pattern id ${summary.id}.`);
	const slug = tail(summary.id);
	const record = getBlockRecord(summary.id);
	const examples = getBlockExamples(summary.id);
	if (examples.length === 0 || examples.map(({ id }) => id).join() !== record.variants.map(({ example }) => example).join()) {
		throw new Error(`Mux UI docs found variant examples that differ from the ${summary.id} record.`);
	}
	const variants = examples.map((example): BlockVariant => {
		if (!example.id.startsWith(EXAMPLE_PREFIX)) throw new Error(`Unexpected variant id ${example.id}.`);
		return Object.freeze({
			slug: variantSlug(slug, example.id),
			id: example.id,
			name: example.name,
			summary: example.summary,
			sourcePath: example.source.content,
			code: example.code,
		});
	});
	if (new Set(variants.map(({ slug: variant }) => variant)).size !== variants.length) {
		throw new Error(`Mux UI docs found duplicate variant routes for ${summary.id}.`);
	}
	const participants = record.participants.map((participant): BlockParticipantLink => {
		const component = componentById.get(participant.component);
		if (!component) throw new Error(`Mux UI docs could not resolve participant ${participant.component} of ${summary.id}.`);
		return Object.freeze({ ...participant, name: component.name, href: `/components/${tail(component.id)}/` });
	});
	return Object.freeze({
		id: summary.id,
		slug,
		name: summary.name,
		summary: summary.summary,
		category: summary.category,
		categoryLabel: idLabel(summary.category),
		group: summary.group,
		groupLabel: idLabel(summary.group),
		participants: Object.freeze(participants),
		accessibility: record.accessibility,
		variants: Object.freeze(variants),
	});
}

// Blocks list in the order the catalog declares its categories: groups first, then each group's categories.
const categoryOrder = patternCategoryGroups.flatMap(([, categories]) => categories);
function categoryRank(category: string): number {
	const index = categoryOrder.indexOf(category);
	if (index === -1) throw new Error(`Mux UI docs found the category ${category} outside the catalog's category groups.`);
	return index;
}

/** Catalog category order, then name. */
export function compareBlocks(left: Pick<Block, 'category' | 'name'>, right: Pick<Block, 'category' | 'name'>): number {
	return categoryRank(left.category) - categoryRank(right.category) || left.name.localeCompare(right.name);
}

export const blocks: readonly Block[] = Object.freeze(blockSummaries.map(buildBlock).sort(compareBlocks));

export interface BlockCategoryGroup {
	category: string;
	label: string;
	blocks: readonly Block[];
}

export interface BlockGroup {
	group: string;
	label: string;
	categories: readonly BlockCategoryGroup[];
}

function groupBlocks(list: readonly Block[]): BlockGroup[] {
	const groups: { group: string; label: string; categories: { category: string; label: string; blocks: Block[] }[] }[] = [];
	for (const block of list) {
		let group = groups.find((candidate) => candidate.group === block.group);
		if (!group) groups.push(group = { group: block.group, label: block.groupLabel, categories: [] });
		let category = group.categories.find((candidate) => candidate.category === block.category);
		if (!category) group.categories.push(category = { category: block.category, label: block.categoryLabel, blocks: [] });
		category.blocks.push(block);
	}
	return groups;
}

/** The Group > Category > Block hierarchy the rail and the gallery render. */
export const blockGroups: readonly BlockGroup[] = Object.freeze(groupBlocks(blocks));

export function getBlock(slug: string): Block | null {
	return blocks.find((block) => block.slug === slug) ?? null;
}

/** The components any block references, for the rail's "Uses" filter. */
export const usesOptions: readonly { id: string; name: string }[] = Object.freeze(
	[...new Set(blocks.flatMap(({ participants }) => participants.map(({ component }) => component)))]
		.map((id) => ({ id, name: componentById.get(id)?.name ?? tail(id) }))
		.sort((left, right) => left.name.localeCompare(right.name)),
);

interface SearchIndexEntry {
	id: string;
	terms: readonly { term: string }[];
}

/**
 * The catalog's indexed search terms. The query API answers searches but has no operation that
 * lists the indexed terms, and the rail's browser matcher needs them, so this is the one read
 * of the generated bundle (the declared `@muxui/catalog/bundle` export), limited to `searchIndex`.
 */
function readSearchIndex(): readonly SearchIndexEntry[] {
	const bundleModule: unknown = createRequire(import.meta.url)('@muxui/catalog/bundle');
	const catalogJson = isRecord(bundleModule) ? bundleModule.catalogJson : undefined;
	const bundle: unknown = typeof catalogJson === 'string' ? JSON.parse(catalogJson) : undefined;
	if (!isRecord(bundle) || !Array.isArray(bundle.searchIndex)) {
		throw new Error('Mux UI docs could not read the catalog search index.');
	}
	return bundle.searchIndex.map((entry): SearchIndexEntry => {
		if (!isRecord(entry) || !Array.isArray(entry.terms)) throw new Error('Catalog search index has an invalid entry.');
		return {
			id: requiredString(entry.id, 'searchIndex.id'),
			terms: entry.terms.map((term) => ({ term: requiredString(isRecord(term) ? term.term : undefined, 'searchIndex.term') })),
		};
	});
}

/**
 * The filter data the rail ships to the browser: the pattern terms of the catalog search
 * index, and each participant component's `list --uses` answer from the query API.
 * `api` and `searchIndex` default to the real catalog; a test passes a fixture catalog's.
 */
export function buildBlockFilterIndex(api: CatalogModule = catalogApi, searchIndex: readonly SearchIndexEntry[] = readSearchIndex()): BlockFilterIndex {
	const patterns = listBlocks(undefined, api);
	const slugById = new Map(patterns.map(({ id }) => [id, tail(id)]));
	const terms = new Map<string, Set<string>>();
	for (const { id, terms: indexed } of searchIndex) {
		const slug = slugById.get(id);
		if (slug === undefined) continue;
		for (const { term } of indexed) {
			let slugs = terms.get(term);
			if (!slugs) terms.set(term, slugs = new Set());
			slugs.add(slug);
		}
	}
	const components = new Set(patterns.flatMap(({ id }) => getBlockRecord(id, api).participants.map(({ component }) => component)));
	const sorted = (entries: Iterable<[string, string[]]>) => Object.fromEntries([...entries].sort(([left], [right]) => left.localeCompare(right)));
	return {
		terms: sorted([...terms].map(([term, slugs]): [string, string[]] => [term, [...slugs].sort()])),
		uses: sorted([...components].map((component): [string, string[]] => [component, listBlocks(component, api).map(({ id }) => tail(id)).sort()])),
	};
}

export interface BlockUse {
	block: Block;
	roles: CatalogUsedIn['roles'];
}

/** The blocks that use a component, from the `usedIn` view the catalog derives, resolved to site blocks. */
export function resolveUsedIn(usedIn: readonly CatalogUsedIn[]): readonly BlockUse[] {
	return Object.freeze(usedIn.map(({ id, roles }) => {
		const block = blocks.find((candidate) => candidate.id === id);
		if (!block) throw new Error(`Mux UI docs found no block page for used-in pattern ${id}.`);
		return Object.freeze({ block, roles });
	}));
}
