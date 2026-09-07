import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseFragment } from 'parse5';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = resolve(repositoryRoot, 'apps/docs/dist');
const canonicalCatalog = createRequire(import.meta.url)('@muxui/catalog');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function listComponents() {
	const components = [];
	let cursor;
	do {
		const response = canonicalCatalog.listArtifacts({
			kind: 'component',
			platform: 'web.react',
			detail: 'brief',
			limit: 100,
			...(cursor === undefined ? {} : { cursor }),
		});
		assert(response.type === 'artifact.list', 'The canonical component inventory query failed.');
		components.push(...response.data.items);
		assert(!response.meta.truncated || response.meta.nextCursor !== null, 'The canonical component inventory was truncated without a cursor.');
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return components;
}

function classNames(node) {
	return new Set((node.attrs?.find(({ name }) => name === 'class')?.value ?? '').split(/\s+/u).filter(Boolean));
}

function elements(node) {
	const descendants = [];
	for (const child of node.childNodes ?? []) {
		if (child.tagName !== undefined) {
			descendants.push(child, ...elements(child));
		}
	}
	return descendants;
}

function textContent(node) {
	return (node.childNodes ?? []).map((child) => {
		if (child.nodeName === '#text') return child.value;
		if (child.nodeName === '#comment') return '';
		return textContent(child);
	}).join('');
}

function renderedSourceBlocks(html) {
	const root = parseFragment(html);
	return elements(root)
		.filter((node) => node.tagName === 'div' && classNames(node).has('demo-source'))
		.map((sourceContainer) => {
			const descendants = elements(sourceContainer);
			const path = descendants.find((node) => node.tagName === 'p' && classNames(node).has('demo-source-path'));
			const pre = descendants.find((node) => node.tagName === 'pre');
			assert(path !== undefined && pre !== undefined, 'A rendered source block is missing its path or pre element.');
			return { pre, source: textContent(path) };
		});
}

let checked = 0;
for (const component of listComponents()) {
	const slug = component.id.slice(component.id.lastIndexOf(':') + 1);
	const routePath = resolve(docsDist, 'components', slug, 'index.html');
	assert(existsSync(routePath), `Built component route is missing: ${slug}.`);
	const blocks = renderedSourceBlocks(readFileSync(routePath, 'utf8'));
	assert(blocks.length > 0, `Built component route has no rendered source blocks: ${slug}.`);
	const artifact = canonicalCatalog.getArtifact({
		id: component.id,
		platform: 'web.react',
		detail: 'full',
		section: 'examples',
	});
	assert(artifact.type === 'artifact.detail', `Could not retrieve examples for ${component.id}.`);
	for (const example of artifact.data.value ?? []) {
		const sourcePath = example.source?.content;
		assert(typeof sourcePath === 'string' && sourcePath.length > 0, `Example ${example.id} has no canonical source path.`);
		const sourceText = readFileSync(resolve(repositoryRoot, sourcePath), 'utf8');
		const matches = blocks.filter((block) => block.source === sourcePath);
		assert(matches.length === 1, `Expected one rendered source block for ${sourcePath}, found ${matches.length}.`);
		const renderedElements = elements(matches[0].pre);
		const interactiveTags = new Set(['a', 'button', 'form', 'iframe', 'input', 'select', 'textarea']);
		assert(
			renderedElements.every(({ tagName }) => !interactiveTags.has(tagName)),
			`Rendered source contains interactive HTML for ${sourcePath}.`,
		);
		const rendered = textContent(matches[0].pre);
		assert(rendered === sourceText, `Rendered source does not match canonical source for ${sourcePath}.`);
		checked += 1;
	}
}

console.log(`Rendered source contract passed: ${checked} canonical React examples preserve exact pre.textContent.`);
