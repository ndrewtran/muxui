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
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';
import { collapsePartsAbove, compareComponent, comparePackageExports, compareSources, expectedComponent, expectedPackageExports, expectedSources, loadReference, renderedComponent, renderedEvents, renderedPackageExports, renderedSources, routeFile } from './typed-reference.mjs';
import { checkStyling, expectedStylingSources, loadStylingSources } from './styling-expectation.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const dist = process.argv[2] === undefined ? resolve(repositoryRoot, 'apps/docs/dist') : resolve(process.argv[2]);
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const manifest = readJson('packages/react/package.json');
const descriptor = readJson('packages/react/generated/descriptor.json');
// The generated contract carries two marker comment lines ahead of its JSON; it names the runtime file of every family.
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'packages/react/generated/r1-6-contract.json'), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
const reference = loadReference(resolve(repositoryRoot, 'packages/react/reference'));
const stylingSources = await loadStylingSources(repositoryRoot);

/** What the checker reports for a page, with the page parsed again each time so one change never reaches another. */
function problemsOf(slug, change) {
	const id = `muxui:component:${slug}`;
	const artifact = catalog.getArtifact({ id, platform: 'web.react', detail: 'full' }).data.artifact;
	const binding = artifact.bindings['web.react'];
	const exported = descriptor.bindings.find(({ binding: ref }) => ref === `${id}#web.react`);
	const expected = expectedComponent({ exportName: exported.export, entry: exported.module, packageName: manifest.name, reference, binding, anatomy: artifact.anatomy });
	const examples = catalog.getArtifact({ id, platform: 'web.react', detail: 'full', section: 'examples' }).data.value;
	const html = readFileSync(routeFile(dist, `/components/${slug}/`), 'utf8');
	// What the Sources "Styling" group must list is read from the page as built; the change is made to another parse of it.
	const styling = expectedStylingSources(stylingSources, { slug, root: parse(html) });
	const sources = expectedSources({ record: artifact.source.record, examples, runtime: contract.components.find((entry) => entry.slug === slug).source, reference, owner: expected.owner, styling });
	const root = parse(html);
	change?.(root);
	const section = (name) => elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === name);
	return [
		...compareComponent(expected, renderedComponent(root), renderedEvents(section('events')), `/components/${slug}/`, { collapseAbove: collapsePartsAbove }),
		...compareSources(sources, renderedSources(section('sources')), `/components/${slug}/`),
		...checkStyling({ sources: stylingSources, slug, artifact, root, route: `/components/${slug}/` }),
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
// The Source note of a type or of a package-level value on the package exports page.
const entryOf = (root, name) => elements(root).find((node) => (node.tagName === 'details' && attributeValue(node, 'data-api-type-entry') === name) || (node.tagName === 'div' && attributeValue(node, 'data-api-export') === name));
const sourceNote = (root, name) => elements(entryOf(root, name)).find((node) => attributeValue(node, 'data-api-source') !== undefined);
// Nodes for a link or a whole source note that the built page does not have.
const sourceLinkNode = (path, parentNode) => {
	const link = { nodeName: 'a', tagName: 'a', attrs: [{ name: 'href', value: `https://github.com/ndrewtran/muxui/blob/main/${path}` }], childNodes: [], parentNode };
	link.childNodes.push({ nodeName: '#text', value: path, parentNode: link });
	return link;
};
const insertSourceNote = (after, className, path) => {
	const note = { nodeName: 'p', tagName: 'p', attrs: [{ name: 'class', value: className }, { name: 'data-api-source', value: '' }], childNodes: [], parentNode: after.parentNode };
	note.childNodes.push({ nodeName: '#text', value: 'Source: ', parentNode: note }, sourceLinkNode(path, note));
	after.parentNode.childNodes.splice(after.parentNode.childNodes.indexOf(after) + 1, 0, note);
};
const setText = (node, value) => {
	node.childNodes.find((child) => child.nodeName === '#text').value = value;
};
const setAttribute = (node, name, value) => {
	node.attrs.find((attribute) => attribute.name === name).value = value;
};

// The Styling section.
const stylingOf = (root) => elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'styling');
const stylingRows = (root) => elements(stylingOf(root)).filter((node) => node.tagName === 'tr');
const rowCode = (row) => elements(row).find((node) => node.tagName === 'th' && attributeValue(node, 'scope') === 'row' && elements(node).some((child) => child.tagName === 'code'));
/** The row of the Hooks table or a token table that is named by this hook or role. */
const rowOf = (root, name) => stylingRows(root).find((row) => { const head = rowCode(row); return head !== undefined && textContent(elements(head).find((child) => child.tagName === 'code')) === name; });
const textNodes = (node) => [...(node.childNodes ?? [])].flatMap((child) => child.nodeName === '#text' ? [child] : textNodes(child));
const setAllText = (node, value) => { const [first, ...rest] = textNodes(node); first.value = value; for (const other of rest) other.value = ''; };
const appendText = (node, value) => { textNodes(node).at(-1).value += value; };
const cellOf = (row, index) => elements(row).filter((node) => node.tagName === 'td')[index];
/** Rebuilds an On cell: the parts a render showed, then the parts only a rule selects, each followed by `styled`. */
const setOnCell = (on, emitted, styled = []) => {
	on.childNodes.length = 0;
	for (const part of emitted) insertChild(on, 'code', [], part);
	for (const part of styled) {
		insertChild(on, 'code', [], part);
		insertChild(on, 'span', [{ name: 'class', value: 'styling-evidence' }], 'styled');
	}
};
/** The "Read by" line of a token row. */
const readByOf = (root, token) => elements(rowOf(root, token)).find((node) => attributeValue(node, 'data-styling-read-by') !== undefined);
const recipeCode = (root, id) => elements(elements(stylingOf(root)).find((node) => attributeValue(node, 'id') === id)).find((node) => node.tagName === 'code');
const withAttribute = (root, name) => elements(stylingOf(root)).filter((node) => attributeValue(node, name) !== undefined);
const insertChild = (parent, tag, attrs, value) => {
	const node = { nodeName: tag, tagName: tag, attrs, childNodes: [], parentNode: parent };
	node.childNodes.push({ nodeName: '#text', value, parentNode: node });
	parent.childNodes.push(node);
	return node;
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
		label: 'a wrong link follows the right one in a Sources entry (SwitchField part-utils.ts)',
		slug: 'switch-field',
		expect: ['Declarations sources are ["packages/react/reference/switch-field.json","packages/react/src/supplemental/part-utils.ts","packages/react/src/fields.ts","packages/react/src/supplemental/switch-field.ts"]'],
		change: (root) => {
			const entry = declarationLinks(root).find((node) => attributeValue(node, 'href').endsWith('/part-utils.ts')).parentNode;
			entry.childNodes.push(sourceLinkNode('packages/react/src/fields.ts', entry));
		},
	},
	{
		label: 'a second, conflicting source note follows the right one under a shared type (ControlSize)',
		expect: ['ControlSize shows [[{"path":"packages/react/src/fields.ts","text":"packages/react/src/fields.ts"}],[{"path":"packages/react/src/overlays.ts","text":"packages/react/src/overlays.ts"}]] as its source notes'],
		change: (root) => insertSourceNote(sourceNote(root, 'ControlSize'), 'api-type-reason', 'packages/react/src/overlays.ts'),
	},
	{
		label: 'a second, conflicting source note follows the right one under a package-level value (supplementalFamilies)',
		expect: ['supplementalFamilies shows [[{"path":"packages/react/src/supplemental/index.ts","text":"packages/react/src/supplemental/index.ts"}],[{"path":"packages/react/src/generate.mjs","text":"packages/react/src/generate.mjs"}]] as its source notes'],
		change: (root) => insertSourceNote(sourceNote(root, 'supplementalFamilies'), 'api-export-doc', 'packages/react/src/generate.mjs'),
	},
	{
		label: 'a shared type loses its source (ControlSize)',
		expect: ['ControlSize shows [] as its source notes, expected exactly one note with one link, to packages/react/src/fields.ts'],
		change: (root) => detach(sourceNote(root, 'ControlSize')),
	},
	{
		label: 'a shared type shows the source of another module (MuxUIPlacement links fields.ts)',
		expect: ['MuxUIPlacement shows [[{"path":"packages/react/src/fields.ts","text":"packages/react/src/overlays.ts"}]] as its source notes, expected exactly one note with one link, to packages/react/src/overlays.ts'],
		change: (root) => {
			const link = elements(sourceNote(root, 'MuxUIPlacement')).find((node) => node.tagName === 'a');
			setAttribute(link, 'href', attributeValue(link, 'href').replace('overlays.ts', 'fields.ts'));
		},
	},
	{
		label: 'the reference lists no source for the module of the shared types (fields)',
		expect: ['ControlSize has no source: the reference lists none for its module fields', 'MuxUIDateRange has no source'],
		expectedFrom: withoutSource('shared', 'fields'),
	},
	{
		label: 'a package-level value loses its source (reactCompatibility)',
		expect: ['reactCompatibility shows [] as its source notes, expected exactly one note with one link, to packages/react/src/generate.mjs'],
		change: (root) => detach(sourceNote(root, 'reactCompatibility')),
	},
	{
		label: 'a package-level value shows the source of another module (supplementalFamilies links generate.mjs)',
		expect: ['supplementalFamilies shows [[{"path":"packages/react/src/generate.mjs","text":"packages/react/src/supplemental/index.ts"}]] as its source notes, expected exactly one note with one link, to packages/react/src/supplemental/index.ts'],
		change: (root) => {
			const link = elements(sourceNote(root, 'supplementalFamilies')).find((node) => node.tagName === 'a');
			setAttribute(link, 'href', attributeValue(link, 'href').replace('supplemental/index.ts', 'generate.mjs'));
		},
	},
	{
		label: 'the reference lists no source for the module of a package-level value (supplemental)',
		expect: ['supplementalFamilies has no source: the reference lists none for its module supplemental'],
		expectedFrom: withoutSource('package-level', 'supplemental'),
	},
	{
		label: 'a package-level type loses its source (MuxUIThemeId)',
		expect: ['MuxUIThemeId shows [] as its source notes'],
		change: (root) => detach(sourceNote(root, 'MuxUIThemeId')),
	},

	// ---- the Styling section ----
	{
		label: 'the Styling section is missing (Button)',
		slug: 'button',
		expect: ['has no Styling section'],
		change: (root) => detach(stylingOf(root)),
	},
	{
		label: 'the legacy anchor #anatomy-and-styling is dropped (Button)',
		slug: 'button',
		expect: ['must keep #anatomy-and-styling as one empty, unlinked, unfocusable alias'],
		change: (root) => detach(elements(root).find((node) => attributeValue(node, 'id') === 'anatomy-and-styling')),
	},
	{
		label: 'a part hook row is dropped (Button label)',
		slug: 'button',
		expect: ['Hooks part classes are []'],
		change: (root) => detach(rowOf(root, '.muxui-button__label')),
	},
	{
		label: 'a hook is spelled with another class (TextField label)',
		slug: 'text-field',
		expect: ['Hooks part classes are', '.muxui-text-field .muxui-field-labels'],
		change: (root) => setAllText(elements(rowOf(root, '.muxui-text-field .muxui-field-label')).find((node) => node.tagName === 'code'), '.muxui-text-field .muxui-field-labels'),
	},
	{
		label: 'an observed element tag changes (Button root shows <a>)',
		slug: 'button',
		expect: ['Hooks row .muxui-button shows the tags ["a"]'],
		change: (root) => setAllText(elements(cellOf(rowOf(root, '.muxui-button'), 0)).find((node) => node.tagName === 'code'), '<a>'),
	},
	{
		label: 'a part that renders outside the root is said to be in root (Menu item)',
		slug: 'menu',
		expect: ['says "in root"'],
		change: (root) => appendText(cellOf(rowOf(root, '.muxui-menu__item'), 0), ' in root'),
	},
	{
		label: 'a catalog state row is dropped (Button disabled)',
		slug: 'button',
		expect: ['Hooks state rows are ["data-muxui-state-pending","data-muxui-state-hovered","data-muxui-state-pressed"]'],
		change: (root) => detach(rowOf(root, 'data-muxui-state-disabled')),
	},
	{
		label: 'a state row names an attribute that nothing supports (Button hovered becomes glow)',
		slug: 'button',
		expect: ['Hooks state rows are', 'data-muxui-state-glow'],
		change: (root) => setAllText(elements(rowOf(root, 'data-muxui-state-hovered')).find((node) => node.tagName === 'code'), 'data-muxui-state-glow'),
	},
	{
		label: 'a reflected row loses its declared values (Button variant)',
		slug: 'button',
		expect: ['Hooks row data-muxui-variant reads'],
		change: (root) => setAllText(cellOf(rowOf(root, 'data-muxui-variant'), 1), 'Prop variant: primary, neutral.'),
	},
	{
		label: 'a "not set by" row names a prop the family has (Button size)',
		slug: 'button',
		expect: ['Hooks "not set" rows are ["data-muxui-size"]'],
		change: (root) => setAllText(elements(stylingRows(root).find((row) => attributeValue(row, 'class') === 'styling-not-set')).find((node) => node.tagName === 'code'), 'data-muxui-size'),
	},
	{
		label: 'IconButton\'s reflected variant row is deleted',
		slug: 'icon-button',
		expect: ['Hooks reflected rows are ["data-muxui-size"]'],
		change: (root) => detach(rowOf(root, 'data-muxui-variant')),
	},
	{
		label: 'Button\'s hovered interaction row is deleted',
		slug: 'button',
		expect: ['Hooks state rows are ["data-muxui-state-pending","data-muxui-state-disabled","data-muxui-state-pressed"]'],
		change: (root) => detach(rowOf(root, 'data-muxui-state-hovered')),
	},
	{
		label: 'an interaction row names a state no rule selects on the family (Button pressed becomes dragging)',
		slug: 'button',
		expect: ['Hooks state rows are', 'data-muxui-state-dragging'],
		change: (root) => setAllText(elements(rowOf(root, 'data-muxui-state-pressed')).find((node) => node.tagName === 'code'), 'data-muxui-state-dragging'),
	},
	{
		label: 'DatePicker\'s CSS-selected locations become an unqualified root',
		slug: 'date-picker',
		expect: ['Hooks row data-muxui-state-disabled says a render shows it on ["root"]'],
		change: (root) => setOnCell(cellOf(rowOf(root, 'data-muxui-state-disabled'), 0), ['root']),
	},
	{
		label: 'a part a rule selects is dropped from the location (DatePicker disabled loses calendar)',
		slug: 'date-picker',
		expect: ['Hooks row data-muxui-state-disabled says only a rule selects it on ["root"]'],
		change: (root) => setOnCell(cellOf(rowOf(root, 'data-muxui-state-disabled'), 0), [], ['root']),
	},
	{
		label: 'a styled-only part is shown as emitted (Button pending)',
		slug: 'button',
		expect: ['Hooks row data-muxui-state-pending says a render shows it on ["root"]'],
		change: (root) => setOnCell(cellOf(rowOf(root, 'data-muxui-state-pending'), 0), ['root']),
	},
	{
		label: 'an element the hook does not select is added to the observed tags (Text root shows <section>)',
		slug: 'text',
		expect: ['Hooks row .muxui-text shows the tags'],
		change: (root) => insertChild(cellOf(rowOf(root, '.muxui-text'), 0), 'code', [], '<section>'),
	},
	{
		label: 'a note names the wrong part for a CSS-selected state (Menu focused on trigger)',
		slug: 'menu',
		expect: ['Hooks row data-muxui-state-focused says a rule selects it on "trigger"'],
		change: (root) => setAllText(cellOf(rowOf(root, 'data-muxui-state-focused'), 1), 'Catalog state focused. Styled by Mux on trigger.'),
	},
	{
		label: 'a default marker moves to another value (Button size)',
		slug: 'button',
		expect: ['Hooks row data-muxui-size reads'],
		change: (root) => setAllText(cellOf(rowOf(root, 'data-muxui-size'), 1), 'Prop size: sm (default), md, lg.'),
	},
	{
		label: 'a "not set by" row is deleted (Button color)',
		slug: 'button',
		expect: ['Hooks "not set" rows are []'],
		change: (root) => detach(stylingRows(root).find((row) => attributeValue(row, 'class') === 'styling-not-set')),
	},
	{
		label: 'a part no example carries loses its saying so (TextField description)',
		slug: 'text-field',
		expect: ['Hooks row .muxui-text-field .muxui-field-description is carried by no example of the page and does not say so'],
		change: (root) => setAllText(cellOf(rowOf(root, '.muxui-text-field .muxui-field-description'), 1), 'Anatomy description. Shared field part, scoped by .muxui-text-field.'),
	},
	{
		label: 'a hook is said to be hook-only that a rule styles (Button label)',
		slug: 'button',
		expect: ['Hooks row .muxui-button__label says no Mux rule styles it'],
		change: (root) => appendText(cellOf(rowOf(root, '.muxui-button__label'), 1), ' Hook only: no Mux rule styles it.'),
	},
	{
		label: 'the Rendered DOM shows another variant value than the example renders (Button primary)',
		slug: 'button',
		expect: ['Rendered DOM names <button class="muxui-button" data-muxui-variant="primary"'],
		change: (root) => { const code = elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-dom') !== undefined); setAllText(code, textContent(code).replace('data-muxui-variant="danger"', 'data-muxui-variant="primary"')); },
	},
	{
		label: 'a light default gains two digits (TagGroup label color gets an alpha pair)',
		slug: 'tag-group',
		expect: ['Tokens row component.taggroup.label default reads'],
		change: (root) => { const node = textNodes(cellOf(rowOf(root, 'component.taggroup.label'), 2)).find((candidate) => /^#[0-9a-f]{6}$/u.test(candidate.value.trim())); node.value = `${node.value.trim()}00`; },
	},
	{
		label: 'a swatch paints another color than the value beside it (Button background)',
		slug: 'button',
		expect: ['Tokens row component.button.background default reads'],
		change: (root) => { const swatch = elements(rowOf(root, 'component.button.background')).find((node) => classNames(node).has('styling-swatch')); setAttribute(swatch, 'style', attributeValue(swatch, 'style').replace(/[0-9a-f]\b/u, (digit) => (digit === 'f' ? '0' : 'f'))); },
	},
	{
		label: 'a role\'s light and dark defaults swap (Button background)',
		slug: 'button',
		expect: ['Tokens row component.button.background default reads'],
		change: (root) => { const values = elements(rowOf(root, 'component.button.background')).filter((node) => classNames(node).has('styling-value')); const [light, dark] = values.map((node) => textNodes(node).at(-1)); [light.value, dark.value] = [dark.value, light.value]; },
	},
	{
		label: 'the recipe opening says "Up to three changes" for a family with five (TagGroup)',
		slug: 'tag-group',
		expect: ['Recipe opens with'],
		change: (root) => setAllText(withAttribute(root, 'data-styling-recipe-count')[0], 'Copy this into your own CSS and wrap the component in the scope. Up to three changes: a theme role, a part and a state.'),
	},
	{
		label: 'a What-wins row names another competitor (Button row 2)',
		slug: 'button',
		expect: ['What wins row 2 reads'],
		change: (root) => setAllText(cellOf(stylingRows(root).find((row) => attributeValue(row, 'data-styling-who') === '2'), 0), 'Mux rule in muxui.tokens'),
	},
	{
		label: 'a role is dropped from a token table (Button min-height)',
		slug: 'button',
		expect: ['Tokens component rows are'],
		change: (root) => detach(rowOf(root, 'component.button.min-height')),
	},
	{
		label: 'a role\'s policy flips (Button radius becomes fixed)',
		slug: 'button',
		expect: ['Tokens row component.button.radius shows policy fixed, the token record says theme'],
		change: (root) => setAllText(cellOf(rowOf(root, 'component.button.radius'), 1), 'fixed'),
	},
	{
		label: 'a role\'s default changes (Button radius)',
		slug: 'button',
		expect: ['Tokens row component.button.radius default reads'],
		change: (root) => setAllText(cellOf(rowOf(root, 'component.button.radius'), 2), 'semantic.shape.control-radius 0.5rem'),
	},
	{
		label: 'a role loses its "Read by" line (Button radius)',
		slug: 'button',
		expect: ['Tokens row component.button.radius says nothing about what reads it'],
		change: (root) => detach(elements(rowOf(root, 'component.button.radius')).find((node) => attributeValue(node, 'data-styling-read-by') !== undefined)),
	},
	{
		label: 'a Button role is said to be read by another family\'s rule (Button radius, "Read by .muxui-tabs.")',
		slug: 'button',
		expect: ['Tokens row component.button.radius reads "Read by .muxui-tabs.", the stylesheet gives'],
		change: (root) => setAllText(readByOf(root, 'component.button.radius'), 'Read by .muxui-tabs.'),
	},
	{
		label: 'a reader keeps its selector and loses its condition (Tabs tab-foreground, the @scope)',
		slug: 'tabs',
		expect: ['Tokens row component.tabs.tab-foreground reads'],
		change: (root) => setAllText(readByOf(root, 'component.tabs.tab-foreground'), textContent(readByOf(root, 'component.tabs.tab-foreground')).replace(/\s*\(@scope[^]*\)(?=\.$)/u, '')),
	},
	{
		label: 'a reader keeps its selector and gets another condition (Tabs tab-foreground)',
		slug: 'tabs',
		expect: ['Tokens row component.tabs.tab-foreground reads'],
		change: (root) => setAllText(readByOf(root, 'component.tabs.tab-foreground'), textContent(readByOf(root, 'component.tabs.tab-foreground')).replace(/\(@scope[^]*\)(?=\.$)/u, '(@media (forced-colors: active))')),
	},
	{
		label: 'a role loses one of its readers (Button background)',
		slug: 'button',
		expect: ['Tokens row component.button.background reads'],
		change: (root) => setAllText(readByOf(root, 'component.button.background'), textContent(readByOf(root, 'component.button.background')).replace(/; [^;]*\.$/u, '.')),
	},
	{
		label: 'a role gains a reader no rule has (Button background, a Tabs rule)',
		slug: 'button',
		expect: ['Tokens row component.button.background reads'],
		change: (root) => setAllText(readByOf(root, 'component.button.background'), textContent(readByOf(root, 'component.button.background')).replace(/\.$/u, '; .muxui-tabs__tab.')),
	},
	{
		label: 'a role\'s readers change places (Button background)',
		slug: 'button',
		expect: ['Tokens row component.button.background reads'],
		change: (root) => setAllText(readByOf(root, 'component.button.background'), `Read by ${textContent(readByOf(root, 'component.button.background')).replace(/^Read by /u, '').replace(/\.$/u, '').split('; ').reverse().join('; ')}.`),
	},
	{
		label: 'a read-by line says a different way of being read (Button radius is read through structured parts)',
		slug: 'button',
		expect: ['Tokens row component.button.radius says it is read "parts"'],
		change: (root) => setAttribute(readByOf(root, 'component.button.radius'), 'data-styling-read-by', 'parts'),
	},
	{
		label: 'the state group says "presence only" again, which is false for an enumerated state (Tabs)',
		slug: 'tabs',
		expect: ['Hooks group state says "presence only" beside its name'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => node.tagName === 'span' && classNames(node).has('styling-hint') && textContent(node).startsWith('a boolean state')), 'presence only'),
	},
	{
		label: 'a role that no rule reads is said to be read by one (DisclosureGroup label-gap)',
		slug: 'disclosure-group',
		expect: ['Tokens row component.disclosuregroup.label-gap says it is read "rules", the stylesheet makes it "none"'],
		change: (root) => {
			const note = elements(rowOf(root, 'component.disclosuregroup.label-gap')).find((node) => attributeValue(node, 'data-styling-read-by') !== undefined);
			setAttribute(note, 'data-styling-read-by', 'rules');
			setAllText(note, 'Read by .muxui-disclosure-group.');
		},
	},
	{
		label: 'a role that no rule reads loses its plain sentence (DisclosureGroup label-gap)',
		slug: 'disclosure-group',
		expect: ['Tokens row component.disclosuregroup.label-gap reads "Applies to the group.", the stylesheet gives "Declared. No Mux CSS rule reads this role today.'],
		change: (root) => setAllText(elements(rowOf(root, 'component.disclosuregroup.label-gap')).find((node) => attributeValue(node, 'data-styling-read-by') !== undefined), 'Applies to the group.'),
	},
	{
		label: 'a long secondary group is open instead of collapsed (CodeBlock semantic roles)',
		slug: 'code-block',
		expect: ['Tokens semantic group has 30 roles and is open'],
		change: (root) => {
			const details = elements(stylingOf(root)).find((node) => node.tagName === 'details' && classNames(node).has('styling-group'));
			details.tagName = 'div';
			details.nodeName = 'div';
		},
	},
	{
		label: 'the principal group of a long family is collapsed (TagGroup component roles)',
		slug: 'tag-group',
		expect: ['Tokens component group has 155 roles and is collapsed'],
		change: (root) => {
			const group = elements(stylingOf(root)).find((node) => node.tagName === 'div' && attributeValue(node, 'data-styling-group') === 'component');
			group.tagName = 'details';
			group.nodeName = 'details';
		},
	},
	{
		label: 'an override paragraph is reworded (Button)',
		slug: 'button',
		expect: ['Override rules text differs from README.md at paragraph 2'],
		change: (root) => appendText(elements(stylingOf(root)).filter((node) => attributeValue(node, 'data-styling-readme') !== undefined)[1], ' It cannot be overridden.'),
	},
	{
		label: 'the property-specific !important paragraph loses its limit (Button)',
		slug: 'button',
		expect: ['Override rules text differs from README.md at paragraph 3'],
		change: (root) => setAllText(elements(stylingOf(root)).filter((node) => attributeValue(node, 'data-styling-readme') !== undefined)[2], 'Mux UI !important declarations always win.'),
	},
	{
		label: 'the What-wins rows are reordered (Button rows 1 and 4)',
		slug: 'button',
		expect: ['What wins row 1 reads', 'What wins row 4 reads'],
		change: (root) => {
			const rows = elements(stylingOf(root)).filter((node) => node.tagName === 'tr' && attributeValue(node, 'data-styling-who') !== undefined);
			const siblings = rows[0].parentNode.childNodes;
			const first = siblings.indexOf(rows[0]);
			const fourth = siblings.indexOf(rows[3]);
			[siblings[first], siblings[fourth]] = [rows[3], rows[0]];
		},
	},
	{
		label: 'a What-wins winner is changed (Button row 4 says You)',
		slug: 'button',
		expect: ['What wins row 4 reads'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => node.tagName === 'tr' && attributeValue(node, 'data-styling-who') === '4').childNodes.filter((node) => node.tagName === 'td').at(-1), 'You'),
	},
	{
		label: 'the reduced-motion paragraph claims two triggers and no others (Button)',
		slug: 'button',
		expect: ['Override rules motion paragraph does not state the two inputs', 'prints "two triggers and no others"'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-motion') !== undefined), 'Reduced motion has two triggers and no others: a media query and an ancestor attribute.'),
	},
	{
		label: 'the !important count changes (Button)',
		slug: 'button',
		expect: ['Override rules !important line reads'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-important') !== undefined), 'Mux marks 13 declarations !important on Button\'s own hooks: 9 for forced colors, 2 for reduced motion by media query, 2 for reduced motion by attribute.'),
	},
	{
		label: 'an !important count is printed for a family with none on its own hooks (Text)',
		slug: 'text',
		expect: ['prints an !important count for text'],
		change: (root) => {
			const note = elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-limit') !== undefined);
			insertChild(note.parentNode, 'p', [{ name: 'class', value: 'styling-note' }, { name: 'data-styling-important', value: '3' }], 'Mux marks 3 declarations !important on Text\'s own hooks: 3 for forced colors.');
		},
	},
	{
		label: 'the recipe selects a hook that is not a row (Button)',
		slug: 'button',
		expect: ['Recipe selects .muxui-button__ghost, which is not a row of the Hooks table'],
		change: (root) => appendText(recipeCode(root, 'styling-recipe-css'), '\\n@layer muxui.utilities { .my-scope .muxui-button__ghost { color: inherit; } }'),
	},
	{
		label: 'the recipe assigns a role that a rule does not read (DisclosureGroup label-gap shown as a recipe step)',
		slug: 'disclosure-group',
		expect: ['Recipe assigns --muxui-component-disclosuregroup-label-gap, which no rule of the stylesheet reads', 'which is declared or structured and never a recipe step'],
		change: (root) => appendText(recipeCode(root, 'styling-recipe-css'), '\\n.my-scope { --muxui-component-disclosuregroup-label-gap: 2rem; }'),
	},
	{
		label: 'the recipe assigns a fixed role (Button focus ring)',
		slug: 'button',
		expect: ['Recipe assigns --muxui-semantic-focus-ring, which is not a component role of button'],
		change: (root) => appendText(recipeCode(root, 'styling-recipe-css'), '\\n.my-scope { --muxui-semantic-focus-ring: #6d28d9; }'),
	},
	{
		label: 'the recipe uses !important (Button)',
		slug: 'button',
		expect: ['Recipe uses !important'],
		change: (root) => appendText(recipeCode(root, 'styling-recipe-css'), ' !important'),
	},
	{
		label: 'the recipe count of names is wrong (Button)',
		slug: 'button',
		expect: ['about its names'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-checks') !== undefined).childNodes.find((node) => node.tagName === 'li'), 'All 9 names the recipe uses (4 classes, 4 attributes, 1 token) are rows of the tables above.'),
	},
	{
		label: 'a blanket "applied in a browser" line follows the recipe checks (Button)',
		slug: 'button',
		expect: ['prints "Applied in a browser, each row', 'Recipe checks claim a browser result'],
		change: (root) => insertChild(elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-checks') !== undefined), 'li', [], 'Applied in a browser, each row above changed its computed value, in light and dark.'),
	},
	{
		label: 'a note claims forced colors are required (Button)',
		slug: 'button',
		expect: ['prints "forced colors: required"'],
		change: (root) => appendText(cellOf(rowOf(root, '.muxui-button'), 1), ' forced colors: required.'),
	},
	{
		label: 'the Rendered DOM names an element the Basic example does not render (Button)',
		slug: 'button',
		expect: ['Rendered DOM names <span class="muxui-button__label-extra">'],
		change: (root) => { const code = elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-dom') !== undefined); setAllText(code, textContent(code).replace('muxui-button__label', 'muxui-button__label-extra')); },
	},
	{
		label: 'the Rendered DOM block is missing (Button)',
		slug: 'button',
		expect: ['has no Rendered DOM block'],
		change: (root) => detach(elements(stylingOf(root)).find((node) => attributeValue(node, 'data-styling-dom') !== undefined)),
	},
	{
		label: 'the Styling group is missing from the Sources section (Button)',
		slug: 'button',
		expect: ['source groups are Component record, Examples, Runtime, Package imports, Declarations, expected'],
		change: (root) => {
			const items = sourceItems(root);
			items.slice(items.findIndex((node) => node.tagName === 'dt' && node.childNodes[0].value === 'Styling')).forEach(detach);
		},
	},
	{
		label: 'a Styling source names a file the repository does not track (Button)',
		slug: 'button',
		expect: ['Styling sources are'],
		change: (root) => {
			const items = sourceItems(root);
			const link = elements(items[items.findIndex((node) => node.tagName === 'dt' && node.childNodes[0].value === 'Styling') + 3]).find((node) => node.tagName === 'a');
			setAttribute(link, 'href', 'https://github.com/ndrewtran/muxui/blob/main/packages/react/src/styles/untracked.css');
			setAllText(link, 'packages/react/src/styles/untracked.css');
		},
	},
	{
		label: 'the outline lost no heading but a sub-block is renamed (Button Tokens becomes Colours)',
		slug: 'button',
		expect: ['Styling sub-blocks are'],
		change: (root) => setAllText(elements(stylingOf(root)).find((node) => node.tagName === 'h3' && attributeValue(node, 'id') === 'styling-tokens'), 'Colours'),
	},
];

const unchanged = [...['virtualizer', 'icon-button', 'dialog', 'data-diff', 'text-editor', 'switch-field', 'text-area', 'button', 'text-field', 'tag-group', 'time-field', 'disclosure-group', 'menu', 'text', 'code-block'].flatMap((slug) => problemsOf(slug)), ...packageProblemsOf()];
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
console.log(`Page mutation contract passed: ${mutations.length} changes to built pages (a reworded state, a closing row moved, two rows swapped, a type cell and a state cell lost, a state and its marker apart, a closing row removed, a closing row that spans too many or too few columns, an alias reworded, a declaration source missing, unlinked, misdirected or mislabelled, a shared or package-level type or value without its source, with another module's or with a second note, a wrong link after the right one, a module the reference gives no source, and in the Styling section a missing section or alias, a dropped, misspelled or unsupported hook, a changed tag, a policy, a default, a reader or a collapsed group, another README paragraph or What-wins row, a claim no source supports, a recipe step that is not a row or a role no rule reads, a reader that names another family's rule or loses, gains, swaps or rewrites a reader or its condition, a state group that says presence only, a Rendered DOM element or attribute value the Basic example lacks, a deleted reflected, interaction or not-set row, a location that names the wrong part or an unqualified root, a default that gains digits, swaps its schemes or paints another swatch, an opening sentence that miscounts the recipe, a lost or untracked Styling source) each fail the typed reference checker with a problem on their own page (${reported} problems reported, no crash).`);
