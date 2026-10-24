import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { linkedFamilies } from '../../guide-links.mjs';
import { renderedEventGroups, expectedEventGroups } from './event-groups.mjs';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';
import { collapsePartsAbove, compareComponent, comparePackageExports, expectedComponent, expectedPackageExports, loadReference, renderedComponent, renderedEvents, renderedPackageExports, routeExists, routeFile } from './typed-reference.mjs';

// Every rendered component route keeps one section order, and each projected string equals its catalog value.
// The catalog query API and the package files are read here directly, not through the docs loader or the shared projection.
// The typed API reference of each route (its tables, refs, imports, types and events) must equal the committed declaration
// reference and the catalog, which `typed-reference.mjs` derives from those files alone.
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
const reference = loadReference(resolve(repositoryRoot, 'packages/react/reference'));
const descriptor = readJson('packages/react/generated/descriptor.json');
// The generated contract carries two marker comment lines ahead of its JSON; it names the runtime file of every family.
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/generated/r1-6-contract.json'), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
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
let guideLinks = 0;
const apiCounts = { parts: 0, rows: 0, exports: 0, types: 0, events: 0 };
const problems = [];
const apiByOwner = new Map();
const idsByRoute = new Map();
const apiLinks = [];
for (const component of listComponents()) {
	const slug = component.id.slice(component.id.lastIndexOf(':') + 1);
	const route = `/components/${slug}/`;
	const routePath = resolve(docsDist, 'components', slug, 'index.html');
	assert(existsSync(routePath), `Built component route is missing: ${slug}.`);
	const root = parse(readFileSync(routePath, 'utf8'));
	idsByRoute.set(route, new Set(elements(root).map((node) => attributeValue(node, 'id')).filter((id) => id !== undefined)));
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

	// A guide links to another family by its docs path, and the built page keeps that link to a built family page.
	if (guides.length === 1) {
		const guideSource = canonicalCatalog.getArtifact({ id: guides[0], platform: 'web.react', detail: 'full' }).data.artifact.source.content;
		const expectedLinks = linkedFamilies(readFileSync(resolve(repositoryRoot, guideSource), 'utf8')).map((linked) => `/components/${linked}/`);
		const guideNode = elements(section('usage')).find((node) => attributeValue(node, 'data-guide-id') === guides[0]);
		const renderedLinks = [...new Set(elements(guideNode).filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href')).filter((href) => href?.startsWith('/components/')))];
		assert(JSON.stringify(renderedLinks) === JSON.stringify(expectedLinks), `${route} guide links to ${renderedLinks.join(', ') || 'no family'}, expected ${expectedLinks.join(', ') || 'none'}.`);
		for (const target of expectedLinks) assert(existsSync(resolve(docsDist, target.slice(1), 'index.html')), `${route} guide links to ${target}, which is not built.`);
		guideLinks += expectedLinks.length;
	}

	// Behavior, events, accessibility.
	assertList(section('behavior'), 'binding.behavior', binding.behavior ?? [], route);
	// Each event group is headed by its owner, in anatomy order, and the heading is followed by that part's event table.
	// The parts follow the anatomy's order, whatever order the compiled record keys them in.
	const partApis = Object.entries(binding.api.partApis ?? {}).sort(([left], [right]) => artifact.anatomy.indexOf(left) - artifact.anatomy.indexOf(right));
	const eventGroups = renderedEventGroups(section('events'));
	const expectedEvents = expectedEventGroups(exported.export, partApis);
	assert(
		JSON.stringify(eventGroups) === JSON.stringify(expectedEvents),
		`${route} event groups are not headed by their owners in the catalog's order: ${eventGroups.join(', ') || 'none'}, expected ${expectedEvents.join(', ') || 'none'}.`,
	);
	const rootEvents = facts(section('events'), 'binding.api.events');
	assert(rootEvents.length === 1, `${route} must render the root events exactly once.`);
	assert(
		binding.api.events.length > 0 || textContent(rootEvents[0]) === (partApis.some(([, api]) => api.events.length > 0) ? 'The root declares no events.' : 'This binding does not declare events.'),
		`${route} says the wrong thing about a root with no events.`,
	);
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

	// API reference: every table, ref, import, type and event equals the declaration reference and the catalog.
	const expectedApi = expectedComponent({ exportName: exported.export, entry: exported.module, packageName: manifest.name, reference, binding, anatomy: artifact.anatomy });
	const renderedApi = renderedComponent(root);
	const renderedEventTables = renderedEvents(section('events'));
	problems.push(...compareComponent(expectedApi, renderedApi, renderedEventTables, route, { collapseAbove: collapsePartsAbove }));
	apiByOwner.set(expectedApi.owner, { route, rendered: renderedApi });
	for (const node of [...elements(section('api-reference')), ...elements(section('events'))]) {
		if (node.tagName === 'a' && attributeValue(node, 'href') !== undefined) apiLinks.push({ route, href: attributeValue(node, 'href') });
	}
	// The outline links to the parts, their exports index and the types, and each target is on the page.
	for (const [id, label] of outline) {
		if (id !== undefined && id !== '' && !idsByRoute.get(route).has(id)) problems.push(`${route} outline entry "${label}" links to #${id}, which is not on the page.`);
	}
	apiCounts.parts += expectedApi.parts.length;
	apiCounts.rows += expectedApi.parts.reduce((total, part) => total + part.groups.reduce((sum, group) => sum + group.rows.length, 0), 0);
	apiCounts.exports += expectedApi.exports.length;
	apiCounts.types += expectedApi.types.length;
	apiCounts.events += expectedApi.events.reduce((total, group) => total + group.events.length, 0);

	// Anatomy and styling: parts, states and every token requirement, with no class names or selectors.
	const styling = section('anatomy-and-styling');
	for (const [name, expected] of [['anatomy', artifact.anatomy], ['states', artifact.states]]) {
		const [container] = facts(styling, name);
		assert(container !== undefined && JSON.stringify(codeTexts(container)) === JSON.stringify(expected), `${route} ${name} differs from the catalog.`);
	}
	const requirements = binding.tokenRecipe.requirements;
	const annotation = ({ requirement, profiles }) => requirement === 'required' ? null : [requirement, ...(profiles ?? [])].join(', ');
	const tokenSource = facts(styling, 'tokenRecipe.source');
	assert(tokenSource.length === 1 && textContent(tokenSource[0]) === `Token source: ${binding.tokenRecipe.source}`, `${route} token source differs from the recipe.`);
	// Each token row carries its path and, unless it is plainly required, its requirement and profiles.
	const renderedTokens = facts(styling, 'tokenRecipe.requirements').flatMap((list) => elements(list).filter((node) => node.tagName === 'li').map((item) => {
		const note = elements(item).find((node) => node.tagName === 'span' && classNames(node).has('token-requirement'));
		return [textContent(elements(item).find((node) => node.tagName === 'code')), note === undefined ? null : textContent(note)];
	}));
	const byToken = ([left], [right]) => left < right ? -1 : left > right ? 1 : 0;
	assert(
		JSON.stringify([...renderedTokens].sort(byToken)) === JSON.stringify(requirements.map((entry) => [entry.token, annotation(entry)]).sort(byToken)),
		`${route} token requirements or their annotations differ from the recipe.`,
	);
	const groupLabels = elements(styling).filter((node) => node.tagName === 'h4' && classNames(node).has('token-group')).map((node) => textContent(node));
	const expectedGroups = requirements.length > tokenGroupThreshold ? [...new Set(requirements.map(({ token }) => token.split('.').slice(0, 2).join('.')))] : [];
	assert(JSON.stringify(groupLabels) === JSON.stringify(expectedGroups), `${route} token groups differ from the token prefixes.`);
	assert(!/\.muxui-|data-muxui|\[data-/u.test(textContent(styling)), `${route} anatomy and styling shows a class name or selector.`);

	// Sources: the record, the canonical examples, the family's runtime file, and the package manifest.
	const runtime = contract.components.find((entry) => entry.slug === slug)?.source;
	assert(runtime !== undefined, `${route} has no runtime source in the renderer contract.`);
	const expectedSources = [
		artifact.source.record,
		...examples.map((example) => example.source.content),
		runtime,
		'packages/react/package.json',
	];
	const links = elements(section('sources')).filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href'));
	assert(
		JSON.stringify(links) === JSON.stringify(expectedSources.map((path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`)),
		`${route} sources differ from the record, examples, runtime and manifest.`,
	);
	for (const path of expectedSources) assert(existsSync(resolve(repositoryRoot, path)), `${route} links a missing source: ${path}.`);

	projectedStrings += partApis.length + (artifact.intent?.useWhen?.length ?? 0) + (artifact.intent?.avoidWhen?.length ?? 0) + (binding.behavior?.length ?? 0)
		+ binding.api.events.length + artifact.accessibility.obligations.length + bindingAccessibility.length + requirements.length + expectedSources.length;
	routes += 1;
}

// A usage guide that names no family is shared guidance. It must have its own Docs page, listed in the sidebar like the other shared guides.
const familyGuideIds = new Set(listComponents().map(({ id }) => `muxui:guide:${id.slice(id.lastIndexOf(':') + 1)}-usage`));
const sharedUsageGuides = [...guideIds].filter((id) => id.endsWith('-usage') && !familyGuideIds.has(id));
const docsPages = readdirSync(docsDist, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(resolve(docsDist, entry.name, 'index.html')))
	.map((entry) => ({ route: `/${entry.name}/`, root: parse(readFileSync(resolve(docsDist, entry.name, 'index.html'), 'utf8')) }));
for (const id of sharedUsageGuides) {
	const pages = docsPages.filter(({ root }) => elements(root).some((node) => attributeValue(node, 'data-guide-id') === id));
	assert(pages.length === 1, `The shared usage guide ${id} is rendered by ${pages.length} Docs pages, expected one. Give it a route in [guide].astro and an entry in the sidebar.`);
	const { route, root } = pages[0];
	assert(
		elements(root).some((node) => node.tagName === 'a' && attributeValue(node, 'href') === route && attributeValue(node, 'aria-current') === 'page'),
		`The shared usage guide ${id} has no sidebar entry at ${route}.`,
	);
}

// The exports no family page holds have one destination: the package exports page, which lists every entry of the export map.
const packageRoute = '/package-exports/';
assert(routeExists(docsDist, packageRoute), `Built route is missing: ${packageRoute}.`);
const packageRoot = parse(readFileSync(routeFile(docsDist, packageRoute), 'utf8'));
idsByRoute.set(packageRoute, new Set(elements(packageRoot).map((node) => attributeValue(node, 'id')).filter((id) => id !== undefined)));
const renderedPackage = renderedPackageExports(packageRoot);
problems.push(...comparePackageExports(expectedPackageExports({ manifest, reference }), renderedPackage, Object.keys(manifest.exports)));
assert(
	elements(packageRoot).some((node) => node.tagName === 'a' && attributeValue(node, 'href') === packageRoute && attributeValue(node, 'aria-current') === 'page'),
	`${packageRoute} has no sidebar entry.`,
);
for (const section of elements(packageRoot).filter((node) => node.tagName === 'section' && classNames(node).has('docs-section'))) {
	for (const node of elements(section)) {
		if (node.tagName === 'a' && attributeValue(node, 'href') !== undefined) apiLinks.push({ route: packageRoute, href: attributeValue(node, 'href') });
	}
}

// The inventory, the list of what the package exports, is independent of how any page was built: each export has a destination
// that shows it under the import its export-map entry gives it, and none is left without one.
let inventoried = 0;
const importFor = (key, name, type) => `import ${type ? 'type ' : ''}{ ${name} } from '${key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`}';`;
for (const entry of reference.inventory.entries) {
	for (const item of entry.exports ?? []) {
		inventoried += 1;
		const destination = item.owner === 'shared' || item.owner === 'package-level' ? { route: packageRoute, rendered: { exports: renderedPackage.packageLevel, types: [...renderedPackage.packageTypes, ...renderedPackage.sharedTypes] } } : apiByOwner.get(item.owner);
		if (destination === undefined) {
			problems.push(`${entry.key} ${item.name} is owned by ${item.owner}, which has no page.`);
			continue;
		}
		const shown = (item.kind === 'type' ? destination.rendered.types : destination.rendered.exports).find(({ name }) => name === item.name);
		if (shown === undefined) {
			problems.push(`${destination.route} does not show ${item.kind === 'type' ? 'the type' : 'the export'} ${item.name} of ${entry.key}.`);
			continue;
		}
		const line = importFor(entry.key, item.name, item.kind === 'type');
		if (!(item.kind === 'type' ? shown.imports.includes(line) : shown.import === line)) problems.push(`${destination.route} shows ${item.name} without the import "${line}".`);
	}
}

// Every link into the API reference, the events and the package exports page reaches a heading, part or type that exists.
for (const { route, href } of apiLinks) {
	const [path, fragment] = href.split('#');
	if (/^https?:/u.test(href)) continue;
	const target = path === '' ? route : path;
	const ids = idsByRoute.get(target);
	if (ids === undefined) {
		if (/^\/components\/[^/]+\/$/u.test(target) || target === packageRoute) problems.push(`${route} links to ${href}, which is not a built route.`);
		continue;
	}
	if (fragment !== undefined && !ids.has(fragment)) problems.push(`${route} links to ${href}, which is not on that page.`);
}

if (problems.length > 0) {
	throw new Error(`The typed API reference differs from the declaration reference and the catalog in ${problems.length} places:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
}

console.log(`Component reference contract passed: ${routes} component routes keep the section order, and ${projectedStrings} projected strings equal their catalog values; the typed API reference of every route equals the declaration reference and the catalog, and every row of each table fills the table's columns (${apiCounts.parts} parts with ${apiCounts.rows} rows, ${apiCounts.exports} parts and related exports, ${apiCounts.types} exported types and ${apiCounts.events} events), ${inventoried} inventory exports each reach a destination under their import, and ${packageRoute} lists ${renderedPackage.entries.length} entry points; ${guideLinks} guide links to other families reach a built family page; ${sharedUsageGuides.length} shared usage ${sharedUsageGuides.length === 1 ? 'guide is' : 'guides are'} reachable from the Docs sidebar.`);
