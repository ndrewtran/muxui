import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';

// Every rendered component route keeps one section order, and each projected string equals its catalog value.
// The catalog query API and the package files are read here directly, not through the docs loader or the shared projection.
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = process.argv[2] === undefined
	? resolve(repositoryRoot, 'apps/docs/dist')
	: resolve(process.argv[2]);
const canonicalCatalog = createRequire(import.meta.url)('@muxui/catalog');

const sections = [
	['basic', 'Basic example'],
	['installation', 'Installation and imports'],
	['usage', 'Usage'],
	['behavior', 'Behavior'],
	['examples', 'Examples'],
	['used-in-blocks', 'Used in blocks'],
	['api-reference', 'API reference'],
	['events', 'Events'],
	['accessibility', 'Accessibility'],
	['anatomy-and-styling', 'Anatomy and styling'],
	['sources', 'Sources'],
];
const tokenGroupThreshold = 8;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function readJson(path) {
	return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

function listComponents() {
	const components = [];
	let cursor;
	do {
		const response = canonicalCatalog.listArtifacts({ kind: 'component', platform: 'web.react', detail: 'brief', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
		assert(response.type === 'artifact.list', 'The canonical component inventory query failed.');
		components.push(...response.data.items);
		assert(!response.meta.truncated || response.meta.nextCursor !== null, 'The canonical component inventory was truncated without a cursor.');
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return components;
}

const manifest = readJson('packages/react/package.json');
const descriptor = readJson('packages/react/generated/descriptor.json');
const supplemental = readJson('catalog/react-r1-6/supplemental-components.json');
const guideIds = new Set();
{
	let cursor;
	do {
		const response = canonicalCatalog.listArtifacts({ kind: 'guide', platform: 'web.react', detail: 'brief', limit: 100, ...(cursor === undefined ? {} : { cursor }) });
		for (const { id } of response.data.items) guideIds.add(id);
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
}

/** The elements below `root` that carry one projected catalog field. */
function facts(root, name) {
	return elements(root).filter((node) => attributeValue(node, 'data-fact') === name);
}

function items(list) {
	return elements(list).filter((node) => node.tagName === 'li').map((node) => textContent(node));
}

/** The projected list of a field must equal the catalog list, and be absent when the catalog list is empty. */
function assertList(section, name, expected, route) {
	const lists = facts(section, name);
	if (expected.length === 0) {
		assert(lists.length === 0, `${route} renders ${name} although the catalog declares none.`);
		return;
	}
	assert(lists.length === 1, `${route} must render ${name} exactly once.`);
	assert(JSON.stringify(items(lists[0])) === JSON.stringify(expected), `${route} ${name} differs from the catalog.`);
}

function codeTexts(root) {
	return elements(root).filter((node) => node.tagName === 'code').map((node) => textContent(node));
}

let routes = 0;
let projectedStrings = 0;
for (const component of listComponents()) {
	const slug = component.id.slice(component.id.lastIndexOf(':') + 1);
	const route = `/components/${slug}/`;
	const routePath = resolve(docsDist, 'components', slug, 'index.html');
	assert(existsSync(routePath), `Built component route is missing: ${slug}.`);
	const root = parse(readFileSync(routePath, 'utf8'));
	const detail = canonicalCatalog.getArtifact({ id: component.id, platform: 'web.react', detail: 'full' });
	assert(detail.type === 'artifact.detail', `Could not retrieve ${component.id}.`);
	const artifact = detail.data.artifact;
	const binding = artifact.bindings['web.react'];
	const examples = canonicalCatalog.getArtifact({ id: component.id, platform: 'web.react', detail: 'full', section: 'examples' }).data.value;

	// Section ids, titles and order.
	const expectedSections = sections.filter(([id]) => id !== 'used-in-blocks' || (detail.data.usedIn ?? []).length > 0);
	const main = elements(root).find((node) => node.tagName === 'main');
	const rendered = elements(main).filter((node) => node.tagName === 'section' && classNames(node).has('docs-section'));
	assert(
		JSON.stringify(rendered.map((node) => attributeValue(node, 'id'))) === JSON.stringify(expectedSections.map(([id]) => id)),
		`${route} sections are ${rendered.map((node) => attributeValue(node, 'id')).join(', ')}, expected ${expectedSections.map(([id]) => id).join(', ')}.`,
	);
	for (const [position, [id, title]] of expectedSections.entries()) {
		// A related guide brings its own headings, so only the section's own h2 counts.
		const h2 = rendered[position].childNodes.filter((node) => node.tagName === 'h2');
		assert(h2.length === 1 && textContent(h2[0]) === title, `${route} section ${id} must have one h2 reading "${title}".`);
	}

	// The right-hand outline lists every section, in the same order, under the same title.
	const toc = elements(root).find((node) => node.tagName === 'starlight-toc');
	assert(toc !== undefined, `${route} has no outline.`);
	const outline = elements(toc).filter((node) => node.tagName === 'a').map((node) => [attributeValue(node, 'href')?.slice(1), textContent(node).trim()]);
	const outlineSections = outline.filter(([id]) => sections.some(([sectionId]) => sectionId === id));
	assert(
		JSON.stringify(outlineSections) === JSON.stringify(expectedSections),
		`${route} outline lists ${outlineSections.map(([id]) => id).join(', ')}, expected ${expectedSections.map(([id]) => id).join(', ')}.`,
	);
	const section = (id) => rendered[expectedSections.findIndex(([sectionId]) => sectionId === id)];

	// Installation and imports: the import snippet follows the descriptor and the package exports.
	const exported = descriptor.bindings.find(({ binding: ref }) => ref === `${component.id}#web.react`);
	assert(exported !== undefined && Object.hasOwn(manifest.exports, exported.module) && Object.hasOwn(manifest.exports, './styles.css'), `${route} has no verified import.`);
	const specifier = exported.module === '.' ? manifest.name : `${manifest.name}${exported.module.slice(1)}`;
	const importCode = elements(section('installation')).find((node) => node.tagName === 'div' && attributeValue(node, 'id') === 'component-imports-code');
	const importPre = importCode === undefined ? undefined : elements(importCode).find((node) => node.tagName === 'pre');
	assert(importPre !== undefined, `${route} has no import snippet.`);
	assert(
		textContent(importPre) === `import '${manifest.name}/styles.css';\nimport { ${exported.export} } from '${specifier}';\n`,
		`${route} import snippet differs from the descriptor and the package exports.`,
	);

	// Usage: every entry, as labelled lists, and the related guide by its declared id.
	assertList(section('usage'), 'intent.useWhen', artifact.intent?.useWhen ?? [], route);
	assertList(section('usage'), 'intent.avoidWhen', artifact.intent?.avoidWhen ?? [], route);
	const guides = elements(section('usage')).filter((node) => attributeValue(node, 'data-guide-id') !== undefined).map((node) => attributeValue(node, 'data-guide-id'));
	assert(
		JSON.stringify(guides) === JSON.stringify(guideIds.has(`muxui:guide:${slug}-usage`) ? [`muxui:guide:${slug}-usage`] : []),
		`${route} relates the wrong usage guide.`,
	);

	// Behavior, events, accessibility.
	assertList(section('behavior'), 'binding.behavior', binding.behavior ?? [], route);
	const eventNames = facts(section('events'), 'binding.api.events');
	assert(eventNames.length === 1 && JSON.stringify(codeTexts(eventNames[0])) === JSON.stringify(binding.api.events), `${route} events differ from the catalog.`);
	const nameRequired = facts(section('accessibility'), 'accessibility.nameRequired');
	assert(
		nameRequired.length === 1 && textContent(nameRequired[0]) === `Accessible name required: ${artifact.accessibility.nameRequired ? 'yes' : 'no'}`,
		`${route} accessible name requirement differs from the catalog.`,
	);
	assertList(section('accessibility'), 'accessibility.obligations', artifact.accessibility.obligations, route);
	const bindingAccessibility = binding.accessibility ?? [];
	assertList(
		section('accessibility'),
		'binding.accessibility',
		JSON.stringify(bindingAccessibility) === JSON.stringify(artifact.accessibility.obligations) ? [] : bindingAccessibility,
		route,
	);

	// API reference keeps the Prop and Default table.
	const props = elements(facts(section('api-reference'), 'binding.api.props')[0]).filter((node) => node.tagName === 'tr');
	assert(props.length === binding.api.props.length, `${route} props differ from the catalog.`);
	for (const [position, prop] of binding.api.props.entries()) {
		const [name, value] = elements(props[position]).filter((node) => node.tagName === 'code').map((node) => textContent(node));
		const declared = binding.api.defaults[prop];
		assert(name === prop && value === (declared === undefined ? 'Not specified' : JSON.stringify(declared)), `${route} prop ${prop} differs from the catalog.`);
	}
	assert(!elements(section('api-reference')).some((node) => node.tagName === 'th' && attributeValue(node, 'scope') === 'col' && /^(?:type|presence)$/iu.test(textContent(node).trim())), `${route} API reference has a Type or Presence column.`);

	// Anatomy and styling: parts, states and every token requirement, with no class names or selectors.
	const styling = section('anatomy-and-styling');
	for (const [name, expected] of [['anatomy', artifact.anatomy], ['states', artifact.states]]) {
		const [container] = facts(styling, name);
		assert(container !== undefined && JSON.stringify(codeTexts(container)) === JSON.stringify(expected), `${route} ${name} differs from the catalog.`);
	}
	const requirements = binding.tokenRecipe.requirements;
	const renderedTokens = facts(styling, 'tokenRecipe.requirements').flatMap((list) => elements(list).filter((node) => node.tagName === 'li').map((item) => textContent(elements(item).find((node) => node.tagName === 'code'))));
	assert(JSON.stringify([...renderedTokens].sort()) === JSON.stringify(requirements.map(({ token }) => token).sort()), `${route} token requirements differ from the recipe.`);
	const groupLabels = elements(styling).filter((node) => node.tagName === 'h4' && classNames(node).has('token-group')).map((node) => textContent(node));
	const expectedGroups = requirements.length > tokenGroupThreshold ? [...new Set(requirements.map(({ token }) => token.split('.').slice(0, 2).join('.')))] : [];
	assert(JSON.stringify(groupLabels) === JSON.stringify(expectedGroups), `${route} token groups differ from the token prefixes.`);
	assert(!/\.muxui-|data-muxui|\[data-/u.test(textContent(styling)), `${route} anatomy and styling shows a class name or selector.`);

	// Sources: the record, the canonical examples, the declared runtime file, and the package manifest.
	const runtime = supplemental.components.find((entry) => entry.slug === slug)?.runtimeSource;
	const expectedSources = [
		artifact.source.record,
		...examples.map((example) => example.source.content),
		...(runtime === undefined ? [] : [runtime]),
		'packages/react/package.json',
	];
	const links = elements(section('sources')).filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href'));
	assert(
		JSON.stringify(links) === JSON.stringify(expectedSources.map((path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`)),
		`${route} sources differ from the record, examples, runtime and manifest.`,
	);
	for (const path of expectedSources) assert(existsSync(resolve(repositoryRoot, path)), `${route} links a missing source: ${path}.`);

	projectedStrings += (artifact.intent?.useWhen?.length ?? 0) + (artifact.intent?.avoidWhen?.length ?? 0) + (binding.behavior?.length ?? 0)
		+ binding.api.events.length + artifact.accessibility.obligations.length + bindingAccessibility.length + requirements.length + expectedSources.length;
	routes += 1;
}

console.log(`Component reference contract passed: ${routes} component routes keep the section order, and ${projectedStrings} projected strings equal their catalog values.`);
