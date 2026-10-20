import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'parse5';
import { accessibilityGuideSections } from '../../component-reference.mjs';
import { attributeValue, elements, textContent } from './html-tree.mjs';

// Two shared pages carry content that another surface shows too. This reads the built pages against their owners, not
// through the docs loader: the accessibility guide sections that every Storybook family page repeats, and the tested
// profile that Installation renders from the React package's compatibility record.
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

// Installation renders the tested profile from the compatibility record the package generates, and says nothing the record does not.
{
	const closure = JSON.parse(readText('catalog/react-r1-5/closure.json')).compatibility;
	const manifest = JSON.parse(readText('packages/react/package.json'));
	const { reactCompatibility } = await import(pathToFileURL(resolve(repositoryRoot, 'packages/react/generated/compatibility.mjs')).href);
	const root = readPage('installation');
	const table = elements(root).filter((node) => node.tagName === 'table' && attributeValue(node, 'data-fact') === 'compatibility.tested');
	assert(table.length === 1, '/installation/ must render the tested profile table exactly once.');
	const rows = elements(table[0]).filter((node) => node.tagName === 'tr').map((row) => {
		const cells = elements(row);
		return [textContent(cells.find((node) => node.tagName === 'th')), cells.find((node) => node.tagName === 'td')];
	});
	const expectedRows = [
		['Runtime profile', closure.runtimeProfile],
		['Status', closure.status],
		['Node.js', closure.node],
		['React', closure.react],
		['React DOM', closure.reactDom],
		['Browser', closure.browserMatrix.browser],
		['axe', closure.browserMatrix.axe],
		['Browser test', closure.browserMatrix.source],
	];
	assert(
		JSON.stringify(rows.map(([label, cell]) => [label, textContent(cell)])) === JSON.stringify(expectedRows),
		'/installation/ tested profile differs from catalog/react-r1-5/closure.json.',
	);
	// The versions the checks ran against are the prerequisites the page states from the manifest.
	assert(
		closure.node === manifest.engines.node && closure.react === manifest.peerDependencies.react && closure.reactDom === manifest.peerDependencies['react-dom'],
		'The tested Node.js, React and React DOM versions differ from the package prerequisites.',
	);
	const testLink = elements(rows.at(-1)[1]).find((node) => node.tagName === 'a');
	assert(attributeValue(testLink, 'href') === `https://github.com/ndrewtran/muxui/blob/main/${closure.browserMatrix.source}`, '/installation/ links the wrong browser test.');
	assert(existsSync(resolve(repositoryRoot, closure.browserMatrix.source)), `/installation/ links a missing browser test: ${closure.browserMatrix.source}.`);

	const list = (fact) => elements(root).filter((node) => node.tagName === 'ul' && attributeValue(node, 'data-fact') === fact)
		.flatMap((node) => elements(node).filter((item) => item.tagName === 'li').map((item) => textContent(item)));
	assert(JSON.stringify(list('compatibility.displayProfiles')) === JSON.stringify(closure.browserMatrix.profiles), '/installation/ display profiles differ from catalog/react-r1-5/closure.json.');
	assert(
		JSON.stringify(list('compatibility.notClaimed')) === JSON.stringify(reactCompatibility.compatibilityProfile.notClaimed),
		'/installation/ non-claims differ from the package compatibility record.',
	);

	// The page links the profile in text and in its outline, the section says it is not a support statement, and no claim leaves the page.
	const section = elements(root).find((node) => node.tagName === 'h2' && attributeValue(node, 'id') === 'tested-profile')?.parentNode;
	assert(section !== undefined, '/installation/ has no Tested profile section.');
	assert(words(textContent(section)).includes('It records what is tested, not what is supported, and every export stays experimental.'), '/installation/ Tested profile lost its statement that it is not a support claim.');
	const links = elements(root).filter((node) => node.tagName === 'a' && attributeValue(node, 'href') === '#tested-profile');
	assert(links.some((node) => textContent(node) === 'tested profile'), '/installation/ does not link its tested profile in the text.');
	const toc = elements(root).find((node) => node.tagName === 'starlight-toc');
	assert(toc !== undefined && elements(toc).some((node) => node.tagName === 'a' && attributeValue(node, 'href') === '#tested-profile'), '/installation/ outline does not list the Tested profile.');
}

console.log('Shared guidance contract passed: /accessibility/ renders the Support status and Verification sections that Storybook shows, and /installation/ renders the tested profile from the package compatibility record with its non-claims.');
