// E-BL1-07 (site part): the Blocks loader returns what the catalog query API returns for
// pattern list, get, and the derived usedIn view, and the rail's client filter (the shipped
// index and the catalog's own matcher) answers every query as `search` and `list --uses` do.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { matchingBlocks } from '../src/lib/block-filter.ts';
import {
	blockGroups,
	blocks,
	buildBlockFilterIndex,
	compareBlocks,
	getBlockExamples,
	getBlockRecord,
	idLabel,
	listBlocks,
	resolveUsedIn,
	usesOptions,
} from '../src/lib/blocks.ts';
import { getComponentPage } from '../src/lib/catalog.ts';
import { compileBlockFixtureCatalog } from './fixtures/block-catalog.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const api = createRequire(import.meta.url)('@muxui/catalog');
const tail = (id) => id.slice(id.lastIndexOf(':') + 1);

/** Every item of a list call, following cursors, as the API returns it. */
function allItems(catalog, request) {
	const items = [];
	let cursor;
	do {
		const response = catalog.listArtifacts({ ...request, platform: 'web.react', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
		assert.notEqual(response.type, 'error', JSON.stringify(response));
		items.push(...response.data.items);
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return items;
}

function get(request) {
	const response = api.getArtifact({ platform: 'web.react', ...request });
	assert.equal(response.type, 'artifact.detail', JSON.stringify(response));
	return response.data;
}

const apiPatterns = () => allItems(api, { kind: 'pattern', detail: 'brief' });

test('list pattern: the loader returns the API items in order', () => {
	assert.ok(apiPatterns().length > 0);
	assert.deepEqual(listBlocks(), apiPatterns());
	assert.deepEqual(blocks.map(({ id }) => id).sort(), apiPatterns().map(({ id }) => id).sort());
});

test('get pattern: the loader returns the record fields and the exact variant sources', () => {
	for (const pattern of apiPatterns()) {
		const record = get({ id: pattern.id, detail: 'full' }).artifact;
		const loaded = getBlockRecord(pattern.id);
		for (const field of ['id', 'kind', 'name', 'summary', 'lifecycle', 'platforms', 'source', 'category', 'group', 'participants', 'variants', 'accessibility']) {
			assert.deepEqual(loaded[field], record[field], `${pattern.id} ${field}`);
		}
		const examples = get({ id: pattern.id, section: 'examples' }).value;
		assert.deepEqual(getBlockExamples(pattern.id), examples.map(({ id, kind, name, summary, lifecycle, platforms, source, code }) => ({ id, kind, name, summary, lifecycle, platforms, source, code })));
		for (const example of examples) {
			assert.equal(example.code, readFileSync(resolve(repositoryRoot, example.source.content), 'utf8'), `${example.id} source bytes`);
		}
		const block = blocks.find(({ id }) => id === pattern.id);
		assert.deepEqual(block.variants.map(({ code }) => code), examples.map(({ code }) => code));
	}
});

test('ordering and labels come from the catalog category groups, not the app', () => {
	// Catalog order for marketing is hero, features, pricing, ..., faq; alphabetical would put faq first.
	const named = (category, name = 'A') => ({ category, name });
	assert.ok(compareBlocks(named('forms'), named('hero')) < 0, 'application before marketing');
	assert.ok(compareBlocks(named('hero'), named('pricing')) < 0);
	assert.ok(compareBlocks(named('pricing'), named('faq')) < 0, 'catalog order, not alphabetical');
	assert.ok(compareBlocks(named('pricing', 'A'), named('pricing', 'B')) < 0, 'then by name');
	assert.throws(() => compareBlocks(named('unlisted'), named('hero')), /outside the catalog's category groups/u);

	assert.deepEqual([
		idLabel('application'), idLabel('hero'), idLabel('call-to-action'), idLabel('logo-cloud'), idLabel('faq'),
	], ['Application', 'Hero', 'Call to action', 'Logo cloud', 'Faq']);

	const groupOrder = Object.keys(api.PATTERN_CATEGORY_GROUPS);
	const shown = blockGroups.map(({ group }) => group);
	assert.deepEqual(shown, groupOrder.filter((group) => shown.includes(group)));
	for (const { group, label, categories } of blockGroups) {
		assert.equal(label, idLabel(group));
		const order = api.PATTERN_CATEGORY_GROUPS[group];
		const listed = categories.map(({ category }) => category);
		assert.deepEqual(listed, order.filter((category) => listed.includes(category)), group);
		for (const { category, label: categoryLabel } of categories) assert.equal(categoryLabel, idLabel(category));
	}
});

/** The API's answer to a search as a slug set, or the rule that rejected the query. */
function apiSearch(catalog, query, uses) {
	const slugs = new Set();
	let cursor;
	do {
		const response = catalog.searchArtifacts({
			query,
			platform: 'web.react',
			detail: 'brief',
			limit: 100,
			...(uses === '' ? {} : { uses }),
			...(cursor === undefined ? {} : { cursor }),
		});
		if (response.type === 'error') return { rejected: response.error.ruleId, slugs: new Set() };
		for (const { kind, id } of response.data.items) if (kind === 'pattern') slugs.add(tail(id));
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return { rejected: null, slugs };
}

const sorted = (set) => (set === null ? null : [...set].sort());

/**
 * What the rail should show for a filter, from the API alone: a blank query is no query
 * (only `uses` narrows), and any other query is the API's search, which already applies `uses`.
 */
function apiFilter(catalog, query, uses) {
	if (query.trim() === '') return uses === '' ? null : new Set(allItems(catalog, { kind: 'pattern', detail: 'brief', uses }).map(({ id }) => tail(id)));
	return apiSearch(catalog, query, uses).slugs;
}

/** Asserts the shipped filter index answers each query under each `uses` selection as the API does. */
function assertRailMatchesApi(catalog, index, queries, usesChoices) {
	for (const query of queries) {
		for (const uses of usesChoices) {
			assert.deepEqual(
				sorted(matchingBlocks(index, { query, uses })),
				sorted(apiFilter(catalog, query, uses)),
				`${JSON.stringify(query.length > 40 ? `${query.slice(0, 40)}... (${query.length})` : query)} uses ${uses || 'any'}`,
			);
		}
	}
}

/** Queries around an index: each indexed word, its prefixes, and the grammar's edges. */
function queriesAround(index, phrases = []) {
	const words = Object.keys(index.terms);
	const sixteenMisses = Array.from({ length: 16 }, (_, number) => `qq${number}`);
	return [...new Set([
		...words,
		...words.flatMap((word) => [word.slice(0, 1), word.slice(0, 3)]),
		...phrases,
		'zzzz',
		'GRID, Cards!',
		// Blank is no query; punctuation alone has no term and is rejected.
		'', '   ', '!!!',
		// Only the first 16 distinct terms count, so a 17th is ignored.
		[...sixteenMisses, 'poster'].join(' '),
		['poster', ...sixteenMisses].join(' '),
		// 256 characters is the longest query the API accepts.
		'poster'.padEnd(256),
		'poster'.padEnd(257),
		`poster ${'x'.repeat(300)}`,
	])];
}

test('participant filter: list --uses matches the loader and the rail index', () => {
	assert.ok(usesOptions.length > 0);
	const everyParticipant = new Set(blocks.flatMap(({ participants }) => participants.map(({ component }) => component)));
	assert.deepEqual(usesOptions.map(({ id }) => id).sort(), [...everyParticipant].sort());
	const index = buildBlockFilterIndex();
	for (const { id: component } of usesOptions) {
		const expected = allItems(api, { kind: 'pattern', detail: 'brief', uses: component });
		assert.deepEqual(listBlocks(component), expected, component);
		assert.deepEqual(index.uses[component], expected.map(({ id }) => tail(id)).sort(), component);
	}
});

test('rail filter: the shipped index answers every query as the API does', () => {
	const index = buildBlockFilterIndex();
	assert.ok(Object.keys(index.terms).length > 0);
	assertRailMatchesApi(api, index, queriesAround(index, ['poster grid', 'virtualized selection']), ['', ...usesOptions.map(({ id }) => id)]);
	assert.equal(matchingBlocks(index, { query: '', uses: '' }), null);
});

// More than one block, in both groups, with overlapping words and participants.
let fixtureCatalog;
const compileFixtures = () => (fixtureCatalog ??= compileBlockFixtureCatalog().then(({ bundle }) => {
	const catalog = api.createCatalogApi(bundle);
	return { catalog, index: buildBlockFilterIndex(catalog, bundle.searchIndex) };
}));

test('rail filter over several blocks: any-term, the 16-term cap, the 256-character limit, and uses', async () => {
	const { catalog, index } = await compileFixtures();
	assert.deepEqual(Object.keys(index.uses).sort(), ['muxui:component:button', 'muxui:component:card', 'muxui:component:grid-list', 'muxui:component:text']);
	const gridList = 'muxui:component:grid-list';
	const everyUses = ['', ...Object.keys(index.uses)];
	const phrases = ['poster banner', 'gallery tier', 'wall price', 'poster zzzz', 'hero pricing', 'poster wall hero'];
	assertRailMatchesApi(catalog, index, queriesAround(index, phrases), everyUses);

	// The same facts, stated outright so a matching bug in both sides cannot pass.
	const slugsFor = (query, uses = '') => sorted(matchingBlocks(index, { query, uses }));
	assert.deepEqual(slugsFor('poster'), ['poster-hero', 'poster-wall']);
	assert.deepEqual(slugsFor('poster zzzz'), ['poster-hero', 'poster-wall'], 'any one term keeps a block');
	assert.deepEqual(slugsFor('gallery tier'), ['plan-pricing', 'poster-wall'], 'terms union');
	assert.deepEqual(slugsFor('post'), ['poster-hero', 'poster-wall'], 'a prefix matches');
	assert.deepEqual(slugsFor('oster'), [], 'only a prefix matches, not a suffix');
	assert.deepEqual(slugsFor('', gridList), ['poster-wall']);
	assert.deepEqual(slugsFor('poster', gridList), ['poster-wall'], 'uses intersects the query');
	assert.deepEqual(slugsFor('gallery tier', gridList), ['poster-wall'], 'uses narrows a union');
	assert.deepEqual(slugsFor('tier', gridList), [], 'an empty intersection is empty');
	assert.equal(slugsFor('', ''), null);

	const sixteenMisses = Array.from({ length: 16 }, (_, number) => `qq${number}`).join(' ');
	assert.deepEqual(slugsFor(`${sixteenMisses} poster`), [], 'the 17th term is ignored');
	assert.deepEqual(slugsFor(`poster ${sixteenMisses}`), ['poster-hero', 'poster-wall'], 'the first 16 terms count');
	assert.deepEqual(slugsFor('poster'.padEnd(256)), ['poster-hero', 'poster-wall']);
	assert.deepEqual(slugsFor('poster'.padEnd(257)), [], 'the API rejects a query over 256 characters');
	assert.equal(apiSearch(catalog, 'poster'.padEnd(257), '').rejected, 'query.search.text');
	assert.deepEqual(slugsFor('!!!'), [], 'a query with no ASCII letter or number is rejected');
	assert.equal(apiSearch(catalog, '!!!', '').rejected, 'query.search.terms');
});

test('usedIn: component pages carry the derived view, and list only component-bound examples', () => {
	const variantIds = new Set(blocks.flatMap(({ variants }) => variants.map(({ id }) => id)));
	for (const component of allItems(api, { kind: 'component', detail: 'brief' })) {
		const page = getComponentPage(tail(component.id));
		assert.deepEqual(page.usedIn, get({ id: component.id }).usedIn ?? [], component.id);
		assert.deepEqual(
			resolveUsedIn(page.usedIn).map(({ block, roles }) => [block.id, roles]),
			(get({ id: component.id }).usedIn ?? []).map(({ id, roles }) => [id, roles]),
		);
		const examples = get({ id: component.id, detail: 'full', section: 'examples' }).value;
		assert.deepEqual(page.examples.map(({ id }) => id), examples.map(({ id }) => id), component.id);
		assert.ok(page.examples.every(({ id, source }) => !variantIds.has(id) && source.content.startsWith(`catalog/components/${tail(component.id)}/`)), `${component.id} lists a block variant`);
	}
	// A block's participants and the components' usedIn views agree.
	for (const block of blocks) {
		for (const { component } of block.participants) {
			assert.ok(get({ id: component }).usedIn.some(({ id }) => id === block.id), `${component} does not list ${block.id}`);
		}
	}
});
