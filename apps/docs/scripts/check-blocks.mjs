// E-BL1-05: the built Blocks section, checked against the canonical catalog API.
//
//   node scripts/check-blocks.mjs [dist]
//
// Every enabled pattern appears in the rail and opens its block, each preview
// route loads its canonical example, the Code view equals the example source
// bytes, every built /blocks/ page is noindex, and component pages list only
// component-bound examples while showing "Used in blocks" from the derived
// usedIn view.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseFragment } from 'parse5';
import { blockPath, blocksPath, previewPath, variantPath } from '../src/lib/block-paths.ts';
import { blocks } from '../src/lib/blocks.ts';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = process.argv[2] === undefined
	? resolve(repositoryRoot, 'apps/docs/dist')
	: resolve(process.argv[2]);
const catalog = createRequire(import.meta.url)('@muxui/catalog');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

/** Every item of a list or search request, following cursors. */
function allItems(operation, request) {
	const items = [];
	let cursor;
	do {
		const response = catalog[operation]({ ...request, platform: 'web.react', detail: 'brief', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
		assert(response.type === (operation === 'listArtifacts' ? 'artifact.list' : 'artifact.search'), `${operation} failed for ${JSON.stringify(request)}.`);
		items.push(...response.data.items);
		assert(!response.meta.truncated || response.meta.nextCursor !== null, `${operation} was truncated without a cursor.`);
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return items;
}

function getArtifact(request) {
	const response = catalog.getArtifact({ platform: 'web.react', ...request });
	assert(response.type === 'artifact.detail', `get failed for ${JSON.stringify(request)}.`);
	return response.data;
}

const tail = (id) => id.slice(id.lastIndexOf(':') + 1);

/** The built page for a route, parsed, or a failure naming the route. */
function builtPage(route) {
	const file = resolve(docsDist, route.replace(/^\//u, ''), 'index.html');
	assert(existsSync(file), `Built route is missing: ${route}.`);
	return parseFragment(readFileSync(file, 'utf8'));
}

function find(root, predicate, message) {
	const match = elements(root).find(predicate);
	assert(match !== undefined, message);
	return match;
}

const patterns = allItems('listArtifacts', { kind: 'pattern' });
assert(patterns.length === blocks.length, `The Blocks section has ${blocks.length} blocks, but the catalog enables ${patterns.length} patterns.`);

/** The rail of one built page must list every enabled pattern and variant, each linking to a built block page. */
function checkRail(root, route) {
	const rail = find(root, (node) => node.tagName === 'aside' && attributeValue(node, 'data-blocks-rail') !== undefined, `${route} has no Blocks rail.`);
	const tree = elements(rail);
	for (const pattern of patterns) {
		const slug = tail(pattern.id);
		const item = tree.find((node) => node.tagName === 'li' && attributeValue(node, 'data-block') === slug);
		assert(item !== undefined, `${route} rail does not list ${pattern.id}.`);
		const links = elements(item).filter((node) => node.tagName === 'a');
		const block = blocks.find((candidate) => candidate.id === pattern.id);
		assert(block !== undefined, `The Blocks loader has no block for ${pattern.id}.`);
		const blockLink = links.find((node) => classNames(node).has('blocks-block'));
		assert(attributeValue(blockLink, 'href') === variantPath(block, block.variants[0]), `${route} rail block link for ${pattern.id} does not open its first variant.`);
		const variantLinks = links.filter((node) => classNames(node).has('blocks-variant'));
		const expected = getArtifact({ id: pattern.id, section: 'examples' }).value.map(({ id }) => id);
		assert(
			variantLinks.map((node) => attributeValue(node, 'href')).join() === block.variants.map((variant) => variantPath(block, variant)).join()
				&& block.variants.map(({ id }) => id).join() === expected.join(),
			`${route} rail variants for ${pattern.id} differ from its catalog variants.`,
		);
		for (const link of variantLinks) {
			const href = attributeValue(link, 'href');
			assert(existsSync(resolve(docsDist, href.replace(/^\//u, ''), 'index.html')), `${route} rail link ${href} has no built page.`);
		}
	}
	const groups = tree.filter((node) => node.tagName === 'h2' && classNames(node).has('blocks-group')).map(textContent);
	assert(groups.length > 0, `${route} rail has no groups.`);
	return tree;
}

// The section is unpublished: every built page under /blocks/ must say noindex, whatever its route.
const builtBlockRoutes = readdirSync(resolve(docsDist, 'blocks'), { recursive: true })
	.filter((file) => file === 'index.html' || file.endsWith('/index.html'))
	.map((file) => `${blocksPath}${file.slice(0, -'index.html'.length)}`);
const expectedBlockRoutes = [
	blocksPath,
	...blocks.flatMap((block) => [blockPath(block), ...block.variants.flatMap((variant) => [variantPath(block, variant), previewPath(block, variant)])]),
];
assert(
	expectedBlockRoutes.every((route) => builtBlockRoutes.includes(route)),
	`The built Blocks routes are missing ${expectedBlockRoutes.filter((route) => !builtBlockRoutes.includes(route)).join(', ')}.`,
);
for (const route of builtBlockRoutes) {
	assert(
		elements(builtPage(route)).some((node) => node.tagName === 'meta' && attributeValue(node, 'name') === 'robots' && attributeValue(node, 'content') === 'noindex'),
		`${route} is not marked noindex.`,
	);
}

const gallery = builtPage(blocksPath);
checkRail(gallery, blocksPath);
const cards = elements(gallery).filter((node) => node.tagName === 'li' && attributeValue(node, 'data-variants') !== undefined);
assert(cards.length === patterns.length, `The gallery shows ${cards.length} cards for ${patterns.length} patterns.`);
for (const block of blocks) {
	const card = cards.find((node) => attributeValue(node, 'data-block') === block.slug);
	assert(card !== undefined, `The gallery has no card for ${block.id}.`);
	const parts = elements(card);
	assert(parts.some((node) => node.tagName === 'a' && attributeValue(node, 'href') === variantPath(block, block.variants[0])), `The ${block.id} card does not open its block.`);
	const thumbnail = parts.find((node) => node.tagName === 'iframe');
	assert(thumbnail !== undefined && attributeValue(thumbnail, 'src') === previewPath(block, block.variants[0]), `The ${block.id} thumbnail is not its preview route.`);
	// Lazy thumbnails keep the gallery's load cost from growing with every block.
	assert(attributeValue(thumbnail, 'loading') === 'lazy', `The ${block.id} thumbnail does not load lazily.`);
}

let variantCount = 0;
for (const pattern of patterns) {
	const record = getArtifact({ id: pattern.id, detail: 'full' }).artifact;
	const examples = getArtifact({ id: pattern.id, section: 'examples' }).value;
	const block = blocks.find((candidate) => candidate.id === pattern.id);
	assert(block.variants.length === examples.length && examples.length === record.variants.length, `${pattern.id} variants differ across the loader and the catalog.`);
	assert(existsSync(resolve(docsDist, blockPath(block).replace(/^\//u, ''), 'index.html')), `Built block route is missing: ${blockPath(block)}.`);

	for (const [index, example] of examples.entries()) {
		const variant = block.variants[index];
		const route = variantPath(block, variant);
		const page = builtPage(route);
		const rail = checkRail(page, route);
		const current = rail.filter((node) => node.tagName === 'a' && attributeValue(node, 'aria-current') === 'page');
		assert(current.length === 1 && attributeValue(current[0], 'href') === route, `${route} must mark exactly its own variant as current in the rail.`);

		const detail = find(page, (node) => node.tagName === 'div' && attributeValue(node, 'data-blocks-detail') !== undefined, `${route} has no block detail.`);
		const parts = elements(detail);
		const h1 = parts.find((node) => node.tagName === 'h1');
		assert(h1 !== undefined && textContent(h1) === example.name, `${route} heading is not the variant name.`);
		assert(attributeValue(h1, 'aria-current') === undefined, `${route} marks its heading as the current page; only the rail link is current.`);
		const crumbs = parts.filter((node) => node.tagName === 'li').map(textContent);
		assert(crumbs.includes(block.name) && crumbs.includes(block.categoryLabel), `${route} breadcrumb does not name its category and block.`);

		// The preview is an isolated, named iframe on the variant's own preview route.
		const iframe = parts.find((node) => node.tagName === 'iframe');
		assert(iframe !== undefined && attributeValue(iframe, 'src') === previewPath(block, variant), `${route} preview is not its preview route.`);
		assert((attributeValue(iframe, 'title') ?? '').trim().length > 0, `${route} preview iframe has no accessible name.`);
		assert(parts.some((node) => attributeValue(node, 'role') === 'separator' && attributeValue(node, 'tabindex') === '0'), `${route} has no keyboard-operable resize handle.`);

		// The Code view is the exact example source bytes, and Copy is a real button.
		const sourceBytes = readFileSync(resolve(repositoryRoot, example.source.content), 'utf8');
		assert(example.code === sourceBytes, `The catalog source for ${example.id} differs from ${example.source.content}.`);
		const codeBody = parts.find((node) => attributeValue(node, 'data-code-body') !== undefined);
		assert(codeBody !== undefined, `${route} has no Code view.`);
		const pre = elements(codeBody).find((node) => node.tagName === 'pre');
		assert(pre !== undefined && textContent(pre) === sourceBytes, `${route} Code view does not equal ${example.source.content}.`);
		assert(elements(codeBody).every(({ tagName }) => !['a', 'button', 'iframe', 'input', 'select', 'textarea'].includes(tagName)), `${route} Code view contains interactive HTML.`);
		assert(parts.some((node) => node.tagName === 'button' && attributeValue(node, 'data-copy') !== undefined), `${route} has no Copy button.`);
		const path = parts.find((node) => attributeValue(node, 'data-source-path') !== undefined);
		assert(textContent(path) === example.source.content && example.source.content.startsWith(`catalog/patterns/${tail(pattern.id)}/`), `${route} source path is not the canonical pattern source.`);

		// Participants link to component pages that exist; accessibility notes are the record's.
		const uses = parts.find((node) => node.tagName === 'ul' && classNames(node).has('blocks-inline'));
		const useLinks = elements(uses).filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href'));
		assert(useLinks.join() === record.participants.map(({ component }) => `/components/${tail(component)}/`).join(), `${route} participant links differ from the pattern.`);
		for (const href of useLinks) assert(existsSync(resolve(docsDist, href.replace(/^\//u, ''), 'index.html')), `${route} links to a missing component page ${href}.`);
		// Each participant's role and requirement are visible text, not only a hover title.
		const useItems = elements(uses).filter((node) => node.tagName === 'li');
		for (const [position, participant] of record.participants.entries()) {
			const text = textContent(useItems[position]).replace(/\s+/gu, ' ');
			assert(text.includes(`(${participant.role}${participant.requirement === 'optional' ? ', optional' : ''})`), `${route} does not show the ${participant.component} role inline.`);
		}
		const notes = parts.find((node) => node.tagName === 'ul' && classNames(node).has('blocks-notes'));
		assert(elements(notes).filter((node) => node.tagName === 'li').map(textContent).join('\n') === record.accessibility.join('\n'), `${route} accessibility notes differ from the pattern.`);

		// The preview route runs the canonical example through the shared example host.
		const preview = builtPage(previewPath(block, variant));
		const island = find(preview, (node) => node.tagName === 'astro-island', `${previewPath(block, variant)} has no example island.`);
		const props = attributeValue(island, 'props') ?? '';
		assert(attributeValue(island, 'component-url')?.includes('ExampleHost') && props.includes(`"${example.source.content}"`), `${previewPath(block, variant)} does not load ${example.source.content}.`);
		const previewHeading = elements(preview).find((node) => node.tagName === 'h1');
		assert(previewHeading !== undefined && textContent(previewHeading) === `${block.name}, ${variant.name}`, `${previewPath(block, variant)} has no heading naming its block and variant.`);
		assert(elements(preview).every((node) => attributeValue(node, 'data-pagefind-body') === undefined), `${previewPath(block, variant)} must not join the docs search index.`);
		variantCount += 1;
	}
}

const filterIndexFile = resolve(docsDist, 'blocks/filter-index.json');
assert(existsSync(filterIndexFile), 'The built Blocks filter index is missing.');
const filterIndex = JSON.parse(readFileSync(filterIndexFile, 'utf8'));
const participants = new Set(patterns.flatMap(({ id }) => getArtifact({ id, detail: 'full' }).artifact.participants.map(({ component }) => component)));
assert([...participants].every((component) => Array.isArray(filterIndex.uses[component])), 'The filter index has no uses entry for a participant component.');
assert(patterns.every(({ id }) => Object.values(filterIndex.terms).some((slugs) => slugs.includes(tail(id)))), 'The filter index does not index every pattern.');

// Component pages list only component-bound examples and show "Used in blocks" from the derived view.
let componentPages = 0;
let usedInPages = 0;
const patternVariantIds = new Set(patterns.flatMap(({ id }) => getArtifact({ id, section: 'examples' }).value.map((example) => example.id)));
for (const component of allItems('listArtifacts', { kind: 'component' })) {
	const slug = tail(component.id);
	const root = builtPage(`/components/${slug}/`);
	const expected = getArtifact({ id: component.id, detail: 'full', section: 'examples' }).value;
	assert(expected.every(({ id }) => !patternVariantIds.has(id)), `The catalog returned a block variant as a ${component.id} example.`);
	const sources = elements(root)
		.filter((node) => node.tagName === 'p' && classNames(node).has('demo-source-path'))
		.map(textContent);
	assert(
		sources.length === expected.length && sources.every((source) => source.startsWith(`catalog/components/${slug}/`)),
		`The ${component.id} page lists examples other than its ${expected.length} component-bound examples.`,
	);
	assert(!elements(root).some((node) => node.tagName === 'astro-island' && (attributeValue(node, 'props') ?? '').includes('catalog/patterns/')), `The ${component.id} page runs a block variant.`);

	const usedIn = getArtifact({ id: component.id }).usedIn ?? [];
	const section = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'used-in-blocks');
	if (usedIn.length === 0) {
		assert(section === undefined, `The ${component.id} page shows "Used in blocks" but no block uses it.`);
	} else {
		assert(section !== undefined, `The ${component.id} page has no "Used in blocks" section.`);
		assert(textContent(elements(section).find((node) => node.tagName === 'h2')) === 'Used in blocks', `The ${component.id} section heading is not "Used in blocks".`);
		const hrefs = elements(section).filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href'));
		const wanted = usedIn.map(({ id }) => {
			const block = blocks.find((candidate) => candidate.id === id);
			return variantPath(block, block.variants[0]);
		});
		assert(hrefs.join() === wanted.join(), `The ${component.id} "Used in blocks" links differ from the catalog usedIn view.`);
		usedInPages += 1;
	}
	componentPages += 1;
}

console.log(`Blocks contract passed: ${patterns.length} ${patterns.length === 1 ? 'pattern' : 'patterns'} in the rail and gallery, ${variantCount} variant ${variantCount === 1 ? 'page' : 'pages'} with exact-source Code views and canonical preview routes, ${componentPages} component pages with only component-bound examples, ${usedInPages} with "Used in blocks".`);
