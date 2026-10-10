// The built navigation, split by header tab.
//
//   node scripts/check-navigation.mjs [dist]
//
// Docs pages list only the guides and component pages list only the component groups. Prev/next
// stays inside each section, so Authoring has no next page and the first component has no previous
// one. The header tab marked current is the page's own section.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parseFragment } from 'parse5';
import { blocksPath } from '../src/lib/block-paths.ts';
import { componentsPath, sectionOf } from '../src/lib/site-sections.ts';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';
import { groupComponentNavigation } from '../../component-navigation.mjs';
import { componentRecordCategory } from '../src/lib/component-categories.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = process.argv[2] === undefined
	? resolve(repositoryRoot, 'apps/docs/dist')
	: resolve(process.argv[2]);
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

/** The header tabs marked current on one built page, as text. */
function currentTabs(tree) {
	const nav = tree.find((node) => classNames(node).has('mux-site-nav'));
	assert(nav !== undefined, 'A built page has no header navigation.');
	return elements(nav)
		.filter((node) => node.tagName === 'a' && attributeValue(node, 'aria-current') === 'page')
		.map((node) => textContent(node).trim());
}

/** The sidebar links and groups, the prev/next links, and the current tab of one built Starlight page. */
function readNavigation(route) {
	const file = resolve(docsDist, route.replace(/^\//u, ''), 'index.html');
	assert(existsSync(file), `Built route is missing: ${route}.`);
	const tree = elements(parseFragment(readFileSync(file, 'utf8')));
	const sidebar = tree.find((node) => classNames(node).has('mux-sidebar-content'));
	assert(sidebar !== undefined, `${route} has no sidebar.`);
	const sidebarElements = elements(sidebar);
	const paginationHref = (rel) => {
		const link = tree.find((node) => node.tagName === 'a' && attributeValue(node, 'rel') === rel);
		return link && attributeValue(link, 'href');
	};
	return {
		tabs: currentTabs(tree),
		links: sidebarElements.filter((node) => node.tagName === 'a').map((node) => attributeValue(node, 'href')),
		groups: sidebarElements.filter((node) => node.tagName === 'summary').map((node) => textContent(node).trim()),
		prev: paginationHref('prev'),
		next: paginationHref('next'),
	};
}

function assertCurrentTab(route, tabs, label) {
	assert(tabs.length === 1 && tabs[0] === label, `${route} marks ${tabs.length === 0 ? 'no tab' : tabs.join(', ')} as current, not ${label}.`);
}

// Docs pages are every built page outside the Components and Blocks routes.
const docsRoutes = readdirSync(docsDist, { recursive: true })
	.filter((file) => file === 'index.html' || file.endsWith('/index.html'))
	.map((file) => `/${file.slice(0, -'index.html'.length)}`)
	.filter((route) => sectionOf(route) === 'docs');
assert(docsRoutes.includes('/') && docsRoutes.includes('/contribution/'), 'The built Docs routes lack the home page or Authoring.');
for (const route of docsRoutes) {
	const { tabs, links, prev, next } = readNavigation(route);
	assert(links.length > 0, `${route} lists no guides.`);
	const component = [...links, prev, next].find((href) => href?.startsWith(componentsPath));
	assert(component === undefined, `${route} links to the component page ${component}.`);
	assertCurrentTab(route, tabs, 'Docs');
}

// Sidebar order lists the AI Agent group first, so its first component follows the last guide.
const groups = groupComponentNavigation(listComponents(), ({ id }) => componentRecordCategory(id.slice(id.lastIndexOf(':') + 1)))
	.filter(({ items }) => items.length > 0);
const componentRoutes = groups.flatMap(({ items }) => items.map(({ id }) => `${componentsPath}${id.slice(id.lastIndexOf(':') + 1)}/`));
const groupLabels = groups.map(({ label }) => label);
assert(componentRoutes.length > 0, 'The canonical component inventory is empty.');
for (const route of componentRoutes) {
	const { tabs, links, groups: shown, prev, next } = readNavigation(route);
	assert(links.join() === componentRoutes.join(), `${route} sidebar differs from the component inventory.`);
	assert(shown.join() === groupLabels.join(), `${route} sidebar groups differ from ${groupLabels.join(', ')}.`);
	const outside = [prev, next].find((href) => href !== undefined && !href.startsWith(componentsPath));
	assert(outside === undefined, `${route} links to ${outside}, outside the Components section.`);
	assertCurrentTab(route, tabs, 'Components');
}

assert(readNavigation('/contribution/').next === undefined, 'Authoring links on to a component page.');
assert(readNavigation(componentRoutes[0]).prev === undefined, `${componentRoutes[0]} links back to a guide.`);

// Blocks pages use their own layout and rail; only the header tab is shared.
const blocksFile = resolve(docsDist, blocksPath.replace(/^\//u, ''), 'index.html');
assert(existsSync(blocksFile), `Built route is missing: ${blocksPath}.`);
assertCurrentTab(blocksPath, currentTabs(elements(parseFragment(readFileSync(blocksFile, 'utf8')))), 'Blocks');

console.log(`Navigation contract passed: ${docsRoutes.length} Docs pages list only guides, ${componentRoutes.length} component pages list only the components in ${groupLabels.length} groups, prev/next stays inside each section, and the current header tab matches.`);
