import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { accessibilityGuideSections } from '../../component-reference.mjs';
import { attributeValue, elements, textContent } from './html-tree.mjs';

// A shared page carries content that another surface shows too. This reads the built page against its owner, not
// through the docs loader: the accessibility guide sections that every Storybook family page repeats.
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = process.argv[2] === undefined
	? resolve(repositoryRoot, 'apps/docs/dist')
	: resolve(process.argv[2]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

const readText = (path) => readFileSync(resolve(repositoryRoot, path), 'utf8');
const readPage = (route) => {
	const path = resolve(docsDist, route, 'index.html');
	assert(existsSync(path), `Built route is missing: /${route}/.`);
	return parse(readFileSync(path, 'utf8'));
};
// The Markdown pipeline curls apostrophes and drops code-span backticks, so compare words only.
const words = (value) => value.replace(/[‘’]/gu, "'").replaceAll('`', '').replace(/\s+/gu, ' ').trim();
const slugify = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');

// The accessibility guide page renders the sections Storybook cuts from the same file, in the same words.
{
	const root = readPage('accessibility');
	for (const { heading, markdown } of accessibilityGuideSections(readText('catalog/guides/accessibility.md'))) {
		const title = elements(root).find((node) => node.tagName === 'h2' && attributeValue(node, 'id') === slugify(heading));
		assert(title !== undefined && textContent(title) === heading, `/accessibility/ has no "${heading}" section.`);
		const body = textContent(title.parentNode).replace(heading, '');
		assert(words(body) === words(markdown), `/accessibility/ "${heading}" differs from the guide text that Storybook shows.`);
	}
}

console.log('Shared guidance contract passed: /accessibility/ renders the Support status and Verification sections that Storybook shows.');
