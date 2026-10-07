// E-BL1-07 (site part): the Blocks loader and the rail's filter return what the
// catalog query API returns, for pattern list, search, get, the participant
// filter, and the derived usedIn view.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { matchingBlocks, queryTerms } from '../src/lib/block-filter.ts';
import {
	blocks,
	buildBlockFilterIndex,
	getBlockExamples,
	getBlockRecord,
	listBlocks,
	resolveUsedIn,
	searchBlocks,
	usesOptions,
} from '../src/lib/blocks.ts';
import { getComponentPage } from '../src/lib/catalog.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const api = createRequire(import.meta.url)('@muxui/catalog');
const tail = (id) => id.slice(id.lastIndexOf(':') + 1);

/** Every item of a list or search call, following cursors, as the API returns it. */
function allItems(operation, request) {
	const items = [];
	let cursor;
	do {
		const response = api[operation]({ ...request, platform: 'web.react', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
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

const apiPatterns = () => allItems('listArtifacts', { kind: 'pattern', detail: 'brief' });
const apiSearch = (query, uses) => allItems('searchArtifacts', { query, detail: 'brief', ...(uses === undefined ? {} : { uses }) })
	.filter(({ kind }) => kind === 'pattern');

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

// Queries: each indexed word and its prefixes, phrases, and a miss.
const filterIndex = buildBlockFilterIndex();
const words = Object.keys(filterIndex.terms);
const queries = [
	...new Set([
		...words,
		...words.flatMap((word) => [word.slice(0, 1), word.slice(0, 3)]),
		'poster grid',
		'virtualized selection',
		'zzzz',
		'GRID, Cards!',
	]),
];

test('search: the loader returns the API pattern results with their ranking', () => {
	for (const query of queries) {
		assert.deepEqual(searchBlocks(query).map(({ id, score }) => [id, score]), apiSearch(query).map(({ id, score }) => [id, score]), query);
	}
	assert.deepEqual(searchBlocks('poster'), apiSearch('poster').map(({ id, kind, name, summary, lifecycle, platforms, source, category, group, score, matchReasons }) => ({ id, kind, name, summary, lifecycle, platforms, source, category, group, score, matchReasons })));
});

test('participant filter: list and search --uses match the loader, and the rail index', () => {
	assert.ok(usesOptions.length > 0);
	const everyParticipant = new Set(blocks.flatMap(({ participants }) => participants.map(({ component }) => component)));
	assert.deepEqual(usesOptions.map(({ id }) => id).sort(), [...everyParticipant].sort());
	for (const { id: component } of usesOptions) {
		const expected = allItems('listArtifacts', { kind: 'pattern', detail: 'brief', uses: component });
		assert.deepEqual(listBlocks(component), expected, component);
		assert.deepEqual(filterIndex.uses[component], expected.map(({ id }) => tail(id)).sort(), component);
		for (const query of ['poster', 'zzzz', 'grid virtualized']) {
			assert.deepEqual(searchBlocks(query, component).map(({ id }) => id), apiSearch(query, component).map(({ id }) => id), `${query} ${component}`);
		}
	}
});

test('rail filter: the shipped index answers every query as the API does', () => {
	for (const query of queries) {
		for (const uses of ['', ...usesOptions.map(({ id }) => id)]) {
			const wanted = queryTerms(query).length === 0 ? null : new Set(apiSearch(query, uses === '' ? undefined : uses).map(({ id }) => tail(id)));
			const filtered = matchingBlocks(filterIndex, { query, uses });
			if (wanted === null) {
				// No searchable word: only the participant filter can narrow.
				const using = uses === '' ? null : new Set(listBlocks(uses).map(({ id }) => tail(id)));
				assert.deepEqual(filtered === null ? null : [...filtered].sort(), using === null ? null : [...using].sort(), `${query} ${uses}`);
			} else {
				assert.deepEqual([...(filtered ?? [])].sort(), [...wanted].sort(), `${query} ${uses}`);
			}
		}
	}
	assert.equal(matchingBlocks(filterIndex, { query: '', uses: '' }), null);
});

test('usedIn: component pages carry the derived view, and list only component-bound examples', () => {
	const variantIds = new Set(blocks.flatMap(({ variants }) => variants.map(({ id }) => id)));
	for (const component of allItems('listArtifacts', { kind: 'component', detail: 'brief' })) {
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
