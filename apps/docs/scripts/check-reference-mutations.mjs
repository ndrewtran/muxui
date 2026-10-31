// A copy of the declaration reference with a part, a hook, a helper, a ref, an import, a type, a declaration source and a requirement taken away
// or changed must fail the typed reference checks. So must a copy of one source of the Styling section (the part map, its state classification, the
// stylesheet, the token record, the README) with one fact changed: the page is derived from the sources of the repository it is built from.
//
//   node scripts/check-reference-mutations.mjs [--show]
//
// `--show` prints every problem the checkers report, which is how to read what a change looks like to them.
//
// The docs are built from the changed copy (the build reads the reference from `MUXUI_REPOSITORY_ROOT`, here a mirror of the
// repository whose `packages/react/reference/` is the copy), and the real checkers, which read the committed reference, run
// on that build. Each change must be named by a problem on its page, and each ledger record pin must fail on its record.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { withTemporaryBuildDirectory } from './temporary-build.mjs';

const docsRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(docsRoot, '../..');
const astroCli = resolve(docsRoot, 'node_modules/astro/bin/astro.mjs');

/**
 * A mirror of the repository that links everything but `packages/react/reference/`, which is a copy to change, and the files `edits` change.
 * Every directory on the way to a changed file is a real directory of links, so a write never goes through a link into the repository, and the
 * changed file is a copy: the docs build reads the changed README, part map, stylesheet or token record from the mirror's own path.
 * `edits` is a list of [repository-relative path, function from the file's text to its new text]; several edits of one file apply in order.
 */
function mirrorRepository(destination, edits = []) {
	const real = new Set();
	const realize = (relative) => {
		if (real.has(relative)) return;
		const target = join(destination, relative);
		if (relative !== '') rmSync(target);
		mkdirSync(target, { recursive: true });
		for (const name of readdirSync(join(repositoryRoot, relative))) symlinkSync(join(repositoryRoot, relative, name), join(target, name));
		real.add(relative);
	};
	realize('');
	realize('packages');
	realize('packages/react');
	rmSync(join(destination, 'packages/react/reference'));
	cpSync(join(repositoryRoot, 'packages/react/reference'), join(destination, 'packages/react/reference'), { recursive: true });
	const copied = new Set();
	for (const [path, edit] of edits) {
		const segments = path.split('/');
		for (let index = 1; index < segments.length; index += 1) realize(segments.slice(0, index).join('/'));
		const file = join(destination, path);
		const before = copied.has(path) ? readFileSync(file, 'utf8') : readFileSync(join(repositoryRoot, path), 'utf8');
		const after = edit(before);
		if (after === before) throw new Error(`The source change to ${path} changes nothing.`);
		if (!copied.has(path)) rmSync(file);
		writeFileSync(file, after);
		copied.add(path);
	}
	return join(destination, 'packages/react/reference');
}

// One fact of one source of the Styling section changed in the mirror, and what the real checker must say on the page. A README change reaches
// every page ('*'); the others are the one family that owns the row, the classification, the read or the role.
const sourceMutations = [
	{
		label: 'change a README paragraph (the layer rule of ordinary declarations)',
		slug: '*',
		expect: ['Override rules text differs from README.md at paragraph 2'],
		edits: [['packages/react/README.md', (text) => text.replace('CSS outside a layer beats CSS inside one', 'CSS inside a layer beats CSS outside one')]],
	},
	{
		label: 'rename a part-map hook (Virtualizer item)',
		slug: 'virtualizer',
		expect: ['Hooks part classes are', '.muxui-virtualizer__item'],
		edits: [['packages/react/test/support/styling-parts.ts', (text) => text.replace("hook: 'muxui-virtualizer__item'", "hook: 'muxui-virtualizer__cell'")]],
	},
	{
		label: 'reclassify a catalog state (drop-target is derived, not a state attribute)',
		slug: 'drop-zone',
		expect: ['Hooks row data-muxui-state-drop-target is declared by the catalog and does not say so'],
		edits: [['packages/react/test/support/styling-parts.ts', (text) => text.replace("'empty', 'drop-target',", "'empty',").replace("'partial', 'zero',", "'partial', 'zero', 'drop-target',")]],
	},
	{
		label: 'strip the only read of a role from the stylesheet (CodeBlock added-background)',
		slug: 'code-block',
		expect: ['Tokens row component.codeblock.added-background says it is read "none", the stylesheet makes it "rules"'],
		edits: [['packages/react/generated/styles.css', (text) => text.replaceAll('var(--muxui-component-codeblock-added-background', 'var(--muxui-component-codeblock-added-absent')]],
	},
	{
		label: 'stop selecting an interaction state in the stylesheet (focus-within, which InputTags and TagSelect style)',
		slugs: ['input-tags', 'tag-select'],
		expect: ['Hooks state rows are', 'data-muxui-state-focus-within'],
		edits: [['packages/react/generated/styles.css', (text) => text.replaceAll('data-muxui-state-focus-within', 'data-muxui-state-focus-inside')]],
	},
	{
		label: 'change the alias of a role in the token record (Tabs vertical-list-border)',
		slug: 'tabs',
		expect: ['Tokens row component.tabs.vertical-list-border default reads'],
		edits: [['catalog/tokens/default-theme.json', (text) => text.replace(/("component\.tabs\.vertical-list-border": \{[^}]*?"alias": )"semantic\.border\.subtle"/u, '$1"semantic.border.default"')]],
	},
];

await withTemporaryBuildDirectory('muxui-reference-mutations-', (temp) => {
	const mirror = join(temp, 'repository');
	const reference = mirrorRepository(mirror, sourceMutations.flatMap(({ edits }) => edits));
	const edit = (owner, change) => {
		const path = join(reference, `${owner}.json`);
		const file = JSON.parse(readFileSync(path, 'utf8'));
		change(file);
		writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
	};
	const component = (file, name) => file.exports.find((item) => item.name === name);
	const part = (file, name, member) => component(file, name).parts.find((candidate) => candidate.member === member);

	// What each change is, and the problem the real checker must report for it.
	const mutations = [
		{ label: 'delete a part (CommandPalette.Footer)', slug: 'command-palette', expect: ['part headings are'], apply: () => edit('command-palette', (file) => {
			const parts = component(file, 'CommandPalette').parts;
			parts.splice(parts.findIndex(({ member }) => member === 'Footer'), 1);
		}) },
		{ label: 'delete a hook (useCommandPalette)', slug: 'command-palette', expect: ['export useCommandPalette', 'does not show the export useCommandPalette'], apply: () => edit('command-palette', (file) => {
			file.exports.splice(file.exports.findIndex(({ name }) => name === 'useCommandPalette'), 1);
		}) },
		{ label: 'delete a provider hook (useToast)', slug: 'toast', expect: ['does not show the export useToast'], apply: () => edit('toast', (file) => {
			file.exports.splice(file.exports.findIndex(({ name }) => name === 'useToast'), 1);
		}) },
		{ label: 'delete a helper (isTextEditorDocument)', slug: 'text-editor', expect: ['does not show the export isTextEditorDocument'], apply: () => edit('text-editor', (file) => {
			file.exports.splice(file.exports.findIndex(({ name }) => name === 'isTextEditorDocument'), 1);
		}) },
		{ label: 'delete a ref (IconButton)', slug: 'icon-button', expect: ['IconButton ref line is "none declared", expected "HTMLButtonElement"'], apply: () => edit('icon-button', (file) => {
			part(file, 'IconButton', null).ref = null;
		}) },
		{ label: 'move an import (normalizeTextEditorDocument from the root)', slug: 'text-editor', expect: ['export normalizeTextEditorDocument differs', 'without the import'], apply: () => edit('text-editor', (file) => {
			component(file, 'normalizeTextEditorDocument').entry = '.';
		}) },
		{ label: 'delete a type (TextEditorSelectionActions)', slug: 'text-editor', expect: ['types are'], pin: { record: 'TEXT-EDITOR-02', includes: 'TextEditorSelectionActions' }, apply: () => edit('text-editor', (file) => {
			file.types.splice(file.types.findIndex(({ name }) => name === 'TextEditorSelectionActions'), 1);
		}) },
		{ label: 'delete a legal value of an alternative (Resizable defaultSizes)', slug: 'resizable', expect: ['Resizable (otherwise) rows are'], apply: () => edit('resizable', (file) => {
			const alternative = part(file, 'Resizable', null).alternatives[1];
			alternative.members.splice(alternative.members.findIndex(({ name }) => name === 'defaultSizes'), 1);
		}) },
		{ label: 'change a requirement (Disclosure title becomes optional)', slug: 'disclosure', expect: ['row title differs in state'], pin: { record: 'DISCLOSURE-01', includes: 'title' }, apply: () => edit('disclosure', (file) => {
			part(file, 'Disclosure', null).members.find(({ name }) => name === 'title').optional = true;
		}) },
		{ label: 'change a ref (SwitchField.Button to HTMLButtonElement)', slug: 'switch-field', expect: ['SwitchField.Button ref line is "HTMLButtonElement", expected "HTMLLabelElement"'], pin: { record: 'SWITCH-FIELD-01', includes: 'SwitchField.Button' }, apply: () => edit('switch-field', (file) => {
			part(file, 'SwitchField', 'Button').ref = { type: 'HTMLButtonElement' };
		}) },
		{ label: 'change a ref (TextArea.TextArea to HTMLInputElement)', slug: 'text-area', expect: ['TextArea.TextArea ref line is "HTMLInputElement", expected "HTMLTextAreaElement"'], pin: { record: 'TEXT-AREA-01', includes: 'TextArea.TextArea' }, apply: () => edit('text-area', (file) => {
			part(file, 'TextArea', 'TextArea').ref = { type: 'HTMLInputElement' };
		}) },
		{ label: 'delete the never members of a part (DataDiff children and dangerouslySetInnerHTML)', slug: 'data-diff', expect: ['DataDiff closing rows are []'], pin: { record: 'DATA-DIFF', includes: 'children' }, apply: () => edit('data-diff', (file) => {
			const members = part(file, 'DataDiff', null).members;
			for (const name of ['children', 'dangerouslySetInnerHTML']) members.splice(members.findIndex((candidate) => candidate.name === name), 1);
		}) },
		{ label: 'change the return type of a handle method (TextEditorHandle.execute returns number)', slug: 'text-editor', expect: ['type TextEditorHandle declaration differs from the model'], pin: { record: 'TEXT-EDITOR-02', includes: 'TextEditorHandle' }, apply: () => edit('text-editor', (file) => {
			const handle = file.types.find(({ name }) => name === 'TextEditorHandle');
			handle.text = handle.text.replace('execute(command: TextEditorCommand): boolean;', 'execute(command: TextEditorCommand): number;');
			handle.members.find(({ name }) => name === 'execute').type = '(command: TextEditorCommand): number';
		}) },
		{ label: 'change a command payload field (TextEditorCommand link href?: number)', slug: 'text-editor', expect: ['type TextEditorCommand declaration differs from the model'], pin: { record: 'TEXT-EDITOR-02', includes: 'TextEditorCommand' }, apply: () => edit('text-editor', (file) => {
			const command = file.types.find(({ name }) => name === 'TextEditorCommand');
			command.text = command.text.replace("type: 'link';\n  href: string;", "type: 'link';\n  href?: number;");
		}) },
		{ label: 'change the ref of a part that has an alias (TextEditor to HTMLDivElement)', slug: 'text-editor', expect: ['TextEditor ref line is "HTMLDivElement", expected "TextEditorHandle"', 'TextEditor.Root ref line is "HTMLDivElement", expected "TextEditorHandle"'], pin: { record: 'TEXT-EDITOR-02', includes: 'TextEditor.Root' }, apply: () => edit('text-editor', (file) => {
			part(file, 'TextEditor', null).ref = { type: 'HTMLDivElement' };
		}) },
		{ label: 'delete the source of a declaration module (SwitchField part-utils)', slug: 'switch-field', expect: ['Declarations sources are'], apply: () => edit('switch-field', (file) => {
			delete file.sources['part-utils'];
		}) },
		{ label: 'delete the source of the module that declares the shared types (fields)', route: '/package-exports/', expect: ['ControlSize shows [] as its source notes, expected exactly one note with one link, to packages/react/src/fields.ts', 'MuxUIDateRange shows [] as its source notes'], apply: () => edit('shared', (file) => {
			delete file.sources.fields;
		}) },
		{ label: 'delete the source of the module that declares a package-level value (supplemental)', route: '/package-exports/', expect: ['supplementalFamilies shows [] as its source notes, expected exactly one note with one link, to packages/react/src/supplemental/index.ts'], apply: () => edit('package-level', (file) => {
			delete file.sources.supplemental;
		}) },
	];
	const routeOf = ({ route, slug }) => route ?? `/components/${slug}/`;
	for (const mutation of mutations) mutation.apply();

	const run = (label, args, env = {}) => {
		const result = spawnSync(process.execPath, args, { cwd: docsRoot, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
		if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`);
		return { status: result.status, output: `${result.stdout}${result.stderr}` };
	};
	const dist = join(temp, 'dist');
	const build = run('Astro build of the changed reference', [astroCli, 'build', '--outDir', dist], { MUXUI_REPOSITORY_ROOT: mirror });
	if (build.status !== 0) throw new Error(`The docs build of the changed reference failed:\n${build.output.slice(-2000)}`);

	const sections = run('component reference checker', [resolve(import.meta.dirname, 'check-component-sections.mjs'), dist]);
	if (sections.status === 0) throw new Error('The component reference checker passed on a build of a changed reference.');
	const reported = sections.output.split('\n').filter((line) => line.startsWith('- '));
	const missed = [];
	for (const mutation of mutations) {
		const mine = reported.filter((line) => line.startsWith(`- ${routeOf(mutation)}`));
		for (const fragment of mutation.expect) if (!mine.some((line) => line.includes(fragment))) missed.push(`${mutation.label}: the checker did not report "${fragment}" on ${routeOf(mutation)}`);
	}
	// A change to a source of the Styling section must be named by the page that shows it (the README, by every page).
	const componentRoutes = readdirSync(join(dist, 'components')).map((slug) => `/components/${slug}/`);
	const sourceRoutes = (mutation) => (mutation.slug === '*' ? componentRoutes : (mutation.slugs ?? [mutation.slug]).map((slug) => `/components/${slug}/`));
	for (const mutation of sourceMutations) {
		for (const route of sourceRoutes(mutation)) {
			const mine = reported.filter((line) => line.startsWith(`- ${route} `));
			for (const fragment of mutation.expect) if (!mine.some((line) => line.includes(fragment))) missed.push(`${mutation.label}: the checker did not report "${fragment}" on ${route}`);
		}
	}
	const expectedRoutes = new Set([
		...mutations.map((mutation) => `- ${routeOf(mutation)}`),
		...sourceMutations.flatMap((mutation) => sourceRoutes(mutation).map((route) => `- ${route}`)),
	]);
	const unrelated = reported.filter((line) => ![...expectedRoutes].some((prefix) => line.startsWith(prefix)));

	const records = run('ledger record pins', [resolve(import.meta.dirname, 'check-reference-records.mjs'), dist]);
	if (records.status === 0) throw new Error('The ledger record pins passed on a build of a changed reference.');
	// A pin must fail for its own change: a problem on its record that names what the change touched.
	const pinned = records.output.split('\n').filter((line) => line.startsWith('- '));
	for (const { label, pin } of mutations.filter(({ pin: candidate }) => candidate !== undefined)) {
		if (!pinned.some((line) => line.startsWith(`- ${pin.record}:`) && line.includes(pin.includes))) missed.push(`${label}: the pin ${pin.record} did not fail on "${pin.includes}"`);
	}
	if (process.argv.includes('--show')) console.log(`${reported.join('\n')}\n${records.output.split('\n').filter((line) => line.startsWith('- ')).join('\n')}`);
	if (missed.length > 0 || unrelated.length > 0) {
		throw new Error(`The typed reference checks missed a change, or reported one that was not made:\n${[...missed, ...unrelated.map((line) => `unexpected ${line}`)].map((line) => `- ${line}`).join('\n')}`);
	}
	console.log(`Reference mutation contract passed: ${mutations.length} changes to a copy of the declaration reference (a part, two hooks, a helper, refs, an import, a type, a legal value, a requirement, the members a part forbids, a return type, a payload field, a declaration module's source, the source of every shared type's module and a package-level value's) each fail the component reference checker on their own page, and ${mutations.filter(({ pin }) => pin !== undefined).length} of them fail the pin of their ledger record or reviewed fact; ${sourceMutations.length} changes to a copy of a source of the Styling section (a README paragraph, a part-map hook, a state classification, an interaction state no rule selects, a stylesheet read, a token alias) each fail it on the page that shows them, the README change on all ${componentRoutes.length} (${reported.length} problems reported, none elsewhere).`);
});
