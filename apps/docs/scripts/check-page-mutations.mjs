// A built page changed by hand must fail the typed reference checker with a diagnostic that names the page and the row.
//
//   node scripts/check-page-mutations.mjs [dist]
//
// `check-reference-mutations.mjs` changes the declaration reference and builds the docs again. These changes are to the built
// HTML itself: what a reader would see differently while the model is the same. The checker reads the page as a reader does
// (the words in a cell, the order of the rows), so a change that moves a row or rewords a state must not pass, and a page that
// lost a cell must be reported on its page, never as a crash of the checker.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { attributeValue, classNames, elements } from './html-tree.mjs';
import { collapsePartsAbove, compareComponent, comparePackageExports, compareSources, expectedComponent, expectedPackageExports, expectedSources, loadReference, renderedComponent, renderedEvents, renderedPackageExports, renderedSources, routeFile } from './typed-reference.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const dist = process.argv[2] === undefined ? resolve(repositoryRoot, 'apps/docs/dist') : resolve(process.argv[2]);
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const manifest = readJson('packages/react/package.json');
const descriptor = readJson('packages/react/generated/descriptor.json');
// The generated contract carries two marker comment lines ahead of its JSON; it names the runtime file of every family.
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/generated/r1-6-contract.json'), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
const reference = loadReference(resolve(repositoryRoot, 'packages/react/reference'));

/** What the checker reports for a page, with the page parsed again each time so one change never reaches another. */
function problemsOf(slug, change) {
	const id = `muxui:component:${slug}`;
	const artifact = catalog.getArtifact({ id, platform: 'web.react', detail: 'full' }).data.artifact;
	const binding = artifact.bindings['web.react'];
	const exported = descriptor.bindings.find(({ binding: ref }) => ref === `${id}#web.react`);
	const expected = expectedComponent({ exportName: exported.export, entry: exported.module, packageName: manifest.name, reference, binding, anatomy: artifact.anatomy });
	const examples = catalog.getArtifact({ id, platform: 'web.react', detail: 'full', section: 'examples' }).data.value;
	const sources = expectedSources({ record: artifact.source.record, examples, runtime: contract.components.find((entry) => entry.slug === slug).source, reference, owner: expected.owner });
	const root = parse(readFileSync(routeFile(dist, `/components/${slug}/`), 'utf8'));
	change?.(root);
	const section = (name) => elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === name);
	return [
		...compareComponent(expected, renderedComponent(root), renderedEvents(section('events')), `/components/${slug}/`, { collapseAbove: collapsePartsAbove }),
		...compareSources(sources, renderedSources(section('sources')), `/components/${slug}/`),
	];
}

/** The same for the package exports page, which has no slug. `expectedFrom` is the reference the expectation is read from. */
function packageProblemsOf(change, expectedFrom = reference) {
	const root = parse(readFileSync(routeFile(dist, '/package-exports/'), 'utf8'));
	change?.(root);
	return comparePackageExports(expectedPackageExports({ manifest, reference: expectedFrom }), renderedPackageExports(root), Object.keys(manifest.exports));
}

/** The reference with one module's source taken from an owner's file. */
function withoutSource(owner, module) {
	const { [module]: _removed, ...sources } = reference.files.get(owner).sources;
	return { ...reference, files: new Map([...reference.files, [owner, { ...reference.files.get(owner), sources }]]) };
}

const detach = (node) => node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
const part = (root, heading) => elements(root).find((node) => node.tagName === 'details' && attributeValue(node, 'data-api-part') === heading);
const group = (root, heading, label) => elements(part(root, heading)).find((node) => node.tagName === 'tbody' && attributeValue(node, 'data-api-group') === label);
const rowsOf = (node) => elements(node).filter((child) => child.tagName === 'tr' && classNames(child).has('api-row') && !classNames(child).has('api-closing'));
const closingOf = (node) => elements(node).filter((child) => child.tagName === 'tr' && classNames(child).has('api-closing'));
const cell = (row, name) => elements(row).find((child) => attributeValue(child, name) !== undefined);
const sourceItems = (root) => elements(elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'sources')).filter((node) => node.tagName === 'dt' || node.tagName === 'dd');
const declarationLinks = (root) => {
	const items = sourceItems(root);
	return items.slice(items.findIndex((node) => node.tagName === 'dt' && node.childNodes[0].value === 'Declarations') + 1).map((dd) => elements(dd).find((node) => node.tagName === 'a'));
};
const typeEntry = (root, name) => elements(root).find((node) => node.tagName === 'details' && attributeValue(node, 'data-api-type-entry') === name);
const typeSource = (root, name) => elements(typeEntry(root, name)).find((node) => attributeValue(node, 'data-api-source') !== undefined);
const setText = (node, value) => {
	node.childNodes.find((child) => child.nodeName === '#text').value = value;
};
const setAttribute = (node, name, value) => {
	node.attrs.find((attribute) => attribute.name === name).value = value;
};

// What each change is, and a fragment of the diagnostic that must name it.
const mutations = [
	{
		label: 'the visible state of a closing row says "not declared" where the model says "not allowed" (Virtualizer)',
		slug: 'virtualizer',
		expect: ["Virtualizer (layout = 'stack') closing rows are"],
		change: (root) => {
			const row = closingOf(group(root, 'Virtualizer', "layout = 'stack'")).find((candidate) => attributeValue(candidate, 'data-api-closing') === 'not allowed');
			setText(cell(row, 'data-api-state'), 'not declared');
		},
	},
	{
		label: 'a closing row moves before the ordinary rows of its group (Virtualizer)',
		slug: 'virtualizer',
		expect: ["Virtualizer (layout = 'stack') shows its rows in the order closing"],
		change: (root) => {
			const tbody = group(root, 'Virtualizer', "layout = 'stack'");
			const [first] = rowsOf(tbody);
			const closing = closingOf(tbody)[0];
			detach(closing);
			first.parentNode.childNodes.splice(first.parentNode.childNodes.indexOf(first), 0, closing);
		},
	},
	{
		label: 'two rows swap places (IconButton)',
		slug: 'icon-button',
		expect: ['IconButton (Common) rows are'],
		change: (root) => {
			const [first, second] = rowsOf(group(root, 'IconButton', 'Common'));
			const siblings = first.parentNode.childNodes;
			const at = siblings.indexOf(first);
			const other = siblings.indexOf(second);
			[siblings[at], siblings[other]] = [second, first];
		},
	},
	{
		label: 'a row loses its type cell (IconButton)',
		slug: 'icon-button',
		expect: ['IconButton (Common) row ', 'differs in type', 'type cells, the model has'],
		change: (root) => detach(cell(rowsOf(group(root, 'IconButton', 'Common'))[0], 'data-api-type')),
	},
	{
		label: 'a row loses its state cell (Dialog)',
		slug: 'dialog',
		expect: ['Dialog (Common) row ', 'differs in state'],
		change: (root) => detach(cell(rowsOf(group(root, 'Dialog', 'Common'))[0], 'data-api-state')),
	},
	{
		label: 'the word in a state cell and its marker disagree (Dialog)',
		slug: 'dialog',
		expect: ['differs in state marker'],
		change: (root) => {
			const state = cell(rowsOf(group(root, 'Dialog', 'Common'))[0], 'data-api-state');
			setAttribute(state, 'data-api-state', state.childNodes[0].value === 'required' ? 'optional' : 'required');
		},
	},
	{
		label: 'the closing row of a table with no alternatives is removed (DataDiff)',
		slug: 'data-diff',
		expect: ['DataDiff closing rows are []'],
		change: (root) => closingOf(part(root, 'DataDiff')).forEach(detach),
	},
	{
		label: 'the closing row of a table with five columns spans the six columns of one with alternatives (DataDiff, as it was built)',
		slug: 'data-diff',
		expect: ['DataDiff closing row children, dangerouslySetInnerHTML spans 6 columns, the table has 5'],
		change: (root) => setAttribute(closingOf(part(root, 'DataDiff'))[0].childNodes.find((child) => child.tagName === 'th'), 'colspan', '3'),
	},
	{
		label: 'a closing row loses its last cell (Virtualizer)',
		slug: 'virtualizer',
		expect: ["Virtualizer (layout = 'stack') closing row children, minItemWidth, maxItemWidth, estimatedItemHeight, maxColumns spans 4 columns, the table has 6"],
		change: (root) => {
			const row = closingOf(group(root, 'Virtualizer', "layout = 'stack'"))[0];
			detach(row.childNodes.filter((child) => child.tagName === 'td').at(-1));
		},
	},
	{
		label: 'an alias says "none declared" for the ref it shares (TextEditor.Root)',
		slug: 'text-editor',
		expect: ['TextEditor.Root ref line is "none declared", expected "TextEditorHandle"'],
		change: (root) => {
			const ref = cell(part(root, 'TextEditor.Root'), 'data-api-ref');
			ref.childNodes = [{ nodeName: '#text', value: 'none declared', parentNode: ref }];
		},
	},
	{
		label: 'the Declarations group is missing from the Sources section (SwitchField)',
		slug: 'switch-field',
		expect: ['source groups are Component record, Examples, Runtime, Package imports, expected'],
		change: (root) => {
			const items = sourceItems(root);
			items.slice(items.findIndex((node) => node.tagName === 'dt' && node.childNodes[0].value === 'Declarations')).forEach(detach);
		},
	},
	{
		label: 'a declaration source is not linked (SwitchField part-utils.ts)',
		slug: 'switch-field',
		expect: ['Declarations sources are ["packages/react/reference/switch-field.json","packages/react/src/supplemental/switch-field.ts"]'],
		change: (root) => {
			const link = declarationLinks(root).find((node) => attributeValue(node, 'href').endsWith('/part-utils.ts'));
			detach(link.parentNode);
		},
	},
	{
		label: 'the declaration reference links another family\'s file (TextArea shows switch-field.json)',
		slug: 'text-area',
		expect: ['Declarations sources are ["packages/react/reference/switch-field.json"'],
		change: (root) => {
			const [reference] = declarationLinks(root);
			setAttribute(reference, 'href', attributeValue(reference, 'href').replace('text-area.json', 'switch-field.json'));
		},
	},
	{
		label: 'a declaration source shows other text than the path it links (TextEditor)',
		slug: 'text-editor',
		expect: ['Declarations sources show text other than the path they link'],
		change: (root) => setText(declarationLinks(root)[0], 'packages/react/reference/text-editor'),
	},
	{
		label: 'a shared type loses its source (ControlSize)',
		expect: ['ControlSize shows the source null, expected packages/react/src/fields.ts'],
		change: (root) => detach(typeSource(root, 'ControlSize')),
	},
	{
		label: 'a shared type shows the source of another module (MuxUIPlacement links fields.ts)',
		expect: ['MuxUIPlacement shows the source {"path":"packages/react/src/fields.ts","text":"packages/react/src/overlays.ts"}, expected packages/react/src/overlays.ts'],
		change: (root) => {
			const link = elements(typeSource(root, 'MuxUIPlacement')).find((node) => node.tagName === 'a');
			setAttribute(link, 'href', attributeValue(link, 'href').replace('overlays.ts', 'fields.ts'));
		},
	},
	{
		label: 'the reference lists no source for the module of the shared types (fields)',
		expect: ['ControlSize has no source: the reference lists none for its module fields', 'MuxUIDateRange has no source'],
		expectedFrom: withoutSource('shared', 'fields'),
	},
	{
		label: 'a package-level type loses its source (MuxUIThemeId)',
		expect: ['MuxUIThemeId shows the source null'],
		change: (root) => detach(typeSource(root, 'MuxUIThemeId')),
	},
];

const unchanged = [...['virtualizer', 'icon-button', 'dialog', 'data-diff', 'text-editor', 'switch-field', 'text-area'].flatMap((slug) => problemsOf(slug)), ...packageProblemsOf()];
if (unchanged.length > 0) throw new Error(`The pages these changes start from do not pass the checker:\n${unchanged.map((line) => `- ${line}`).join('\n')}`);

const failures = [];
let reported = 0;
for (const { label, slug, expect, change, expectedFrom } of mutations) {
	const route = slug === undefined ? '/package-exports/' : `/components/${slug}/`;
	let problems;
	try {
		problems = slug === undefined ? packageProblemsOf(change, expectedFrom) : problemsOf(slug, change);
	} catch (error) {
		failures.push(`${label}: the checker crashed (${error instanceof Error ? error.message : error}) instead of naming the difference on its page.`);
		continue;
	}
	reported += problems.length;
	for (const fragment of expect) {
		if (!problems.some((line) => line.includes(fragment))) failures.push(`${label}: no problem contains "${fragment}"; the checker reported ${problems.length === 0 ? 'nothing' : problems.map((line) => `"${line.slice(0, 160)}"`).join(', ')}.`);
	}
	if (problems.some((line) => !line.startsWith(`${route} `))) failures.push(`${label}: a problem does not name the page ${route}.`);
}
if (failures.length > 0) throw new Error(`The typed reference checker missed a change to a built page, or failed to report it on the page:\n${failures.map((line) => `- ${line}`).join('\n')}`);
console.log(`Page mutation contract passed: ${mutations.length} changes to built pages (a reworded state, a closing row moved, two rows swapped, a type cell and a state cell lost, a state and its marker apart, a closing row removed, a closing row that spans too many or too few columns, an alias reworded, a declaration source missing, unlinked, misdirected or mislabelled, a shared or package-level type without its source or with another module's, a module the reference gives no source) each fail the typed reference checker with a problem on their own page (${reported} problems reported, no crash).`);
