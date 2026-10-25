// A copy of the declaration reference with a part, a hook, a helper, a ref, an import, a type, a declaration source and a requirement taken away
// or changed must fail the typed reference checks.
//
//   node scripts/check-reference-mutations.mjs [--show]
//
// `--show` prints every problem the checkers report, which is how to read what a change looks like to them.
//
// The docs are built from the changed copy (the build reads the reference from `MUXUI_REPOSITORY_ROOT`, here a mirror of the
// repository whose `packages/react/reference/` is the copy), and the real checkers, which read the committed reference, run
// on that build. Each change must be named by a problem on its page, and each ledger record pin must fail on its record.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const docsRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(docsRoot, '../..');
const astroCli = resolve(docsRoot, 'node_modules/astro/bin/astro.mjs');

/** A mirror of the repository that links everything but `packages/react/reference/`, which is a copy to change. */
function mirrorRepository(destination) {
	const link = (from, to) => symlinkSync(from, to);
	const linkAllBut = (directory, target, except) => {
		mkdirSync(target, { recursive: true });
		for (const name of readdirSync(directory)) if (name !== except) link(join(directory, name), join(target, name));
	};
	linkAllBut(repositoryRoot, destination, 'packages');
	linkAllBut(join(repositoryRoot, 'packages'), join(destination, 'packages'), 'react');
	linkAllBut(join(repositoryRoot, 'packages/react'), join(destination, 'packages/react'), 'reference');
	cpSync(join(repositoryRoot, 'packages/react/reference'), join(destination, 'packages/react/reference'), { recursive: true });
	return join(destination, 'packages/react/reference');
}

const temp = mkdtempSync(join(tmpdir(), 'muxui-reference-mutations-'));
try {
	const mirror = join(temp, 'repository');
	const reference = mirrorRepository(mirror);
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
		{ label: 'delete the source of the module that declares the shared types (fields)', route: '/package-exports/', expect: ['ControlSize shows the source null, expected packages/react/src/fields.ts', 'MuxUIDateRange shows the source null'], apply: () => edit('shared', (file) => {
			delete file.sources.fields;
		}) },
		{ label: 'delete the source of the module that declares a package-level value (supplemental)', route: '/package-exports/', expect: ['supplementalFamilies shows the source null, expected packages/react/src/supplemental/index.ts'], apply: () => edit('package-level', (file) => {
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
	const expectedRoutes = new Set(mutations.map((mutation) => `- ${routeOf(mutation)}`));
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
	console.log(`Reference mutation contract passed: ${mutations.length} changes to a copy of the declaration reference (a part, two hooks, a helper, refs, an import, a type, a legal value, a requirement, the members a part forbids, a return type, a payload field, a declaration module's source, the source of every shared type's module and a package-level value's) each fail the component reference checker on their own page, and ${mutations.filter(({ pin }) => pin !== undefined).length} of them fail the pin of their ledger record or reviewed fact (${reported.length} problems reported, none elsewhere).`);
} finally {
	rmSync(temp, { recursive: true, force: true });
}
