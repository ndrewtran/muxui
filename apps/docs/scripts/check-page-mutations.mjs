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
import { collapsePartsAbove, compareComponent, expectedComponent, loadReference, renderedComponent, renderedEvents, routeFile } from './typed-reference.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const dist = process.argv[2] === undefined ? resolve(repositoryRoot, 'apps/docs/dist') : resolve(process.argv[2]);
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const manifest = readJson('packages/react/package.json');
const descriptor = readJson('packages/react/generated/descriptor.json');
const reference = loadReference(resolve(repositoryRoot, 'packages/react/reference'));

/** What the checker reports for a page, with the page parsed again each time so one change never reaches another. */
function problemsOf(slug, change) {
	const id = `muxui:component:${slug}`;
	const artifact = catalog.getArtifact({ id, platform: 'web.react', detail: 'full' }).data.artifact;
	const binding = artifact.bindings['web.react'];
	const exported = descriptor.bindings.find(({ binding: ref }) => ref === `${id}#web.react`);
	const expected = expectedComponent({ exportName: exported.export, entry: exported.module, packageName: manifest.name, reference, binding, anatomy: artifact.anatomy });
	const root = parse(readFileSync(routeFile(dist, `/components/${slug}/`), 'utf8'));
	change?.(root);
	const events = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'events');
	return compareComponent(expected, renderedComponent(root), renderedEvents(events), `/components/${slug}/`, { collapseAbove: collapsePartsAbove });
}

const detach = (node) => node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
const part = (root, heading) => elements(root).find((node) => node.tagName === 'details' && attributeValue(node, 'data-api-part') === heading);
const group = (root, heading, label) => elements(part(root, heading)).find((node) => node.tagName === 'tbody' && attributeValue(node, 'data-api-group') === label);
const rowsOf = (node) => elements(node).filter((child) => child.tagName === 'tr' && classNames(child).has('api-row') && !classNames(child).has('api-closing'));
const closingOf = (node) => elements(node).filter((child) => child.tagName === 'tr' && classNames(child).has('api-closing'));
const cell = (row, name) => elements(row).find((child) => attributeValue(child, name) !== undefined);
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
];

const unchanged = ['virtualizer', 'icon-button', 'dialog', 'data-diff', 'text-editor'].flatMap((slug) => problemsOf(slug));
if (unchanged.length > 0) throw new Error(`The pages these changes start from do not pass the checker:\n${unchanged.map((line) => `- ${line}`).join('\n')}`);

const failures = [];
let reported = 0;
for (const { label, slug, expect, change } of mutations) {
	let problems;
	try {
		problems = problemsOf(slug, change);
	} catch (error) {
		failures.push(`${label}: the checker crashed (${error instanceof Error ? error.message : error}) instead of naming the difference on its page.`);
		continue;
	}
	reported += problems.length;
	for (const fragment of expect) {
		if (!problems.some((line) => line.includes(fragment))) failures.push(`${label}: no problem contains "${fragment}"; the checker reported ${problems.length === 0 ? 'nothing' : problems.map((line) => `"${line.slice(0, 160)}"`).join(', ')}.`);
	}
	if (problems.some((line) => !line.startsWith(`/components/${slug}/ `))) failures.push(`${label}: a problem does not name the page /components/${slug}/.`);
}
if (failures.length > 0) throw new Error(`The typed reference checker missed a change to a built page, or failed to report it on the page:\n${failures.map((line) => `- ${line}`).join('\n')}`);
console.log(`Page mutation contract passed: ${mutations.length} changes to built pages (a reworded state, a closing row moved, two rows swapped, a type cell and a state cell lost, a state and its marker apart, a closing row removed, a closing row that spans too many or too few columns, an alias reworded) each fail the typed reference checker with a problem on their own page (${reported} problems reported, no crash).`);
