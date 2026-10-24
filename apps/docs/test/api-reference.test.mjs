import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { alternativeLabel, buildApiReference, buildPackageExports, importLine, literal, partAnchor, typeSegments } from '../src/lib/api-reference.ts';
import { componentDeclarations, readDeclarationReference, readReactPackageFacts } from '../../component-reference.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const catalog = createRequire(import.meta.url)('@muxui/catalog');
const facts = readReactPackageFacts(repositoryRoot);
const reference = readDeclarationReference(repositoryRoot);

const member = (name, extra = {}) => ({ name, type: 'string', optional: true, ...extra });
const required = (name, extra = {}) => ({ name, type: 'string', ...extra });
const never = (name) => ({ name, type: 'never', optional: true, never: true });

/** A component's page data, from the real reference and catalog. */
function page(slug, legacyAnchors) {
	const id = `muxui:component:${slug}`;
	const artifact = catalog.getArtifact({ id, platform: 'web.react', detail: 'full' }).data.artifact;
	const binding = artifact.bindings['web.react'];
	const declarations = componentDeclarations({ artifact: { id }, packageFacts: facts, declarations: reference });
	return buildApiReference({
		packageName: facts.packageName,
		exportName: declarations.export.name,
		anatomy: artifact.anatomy,
		catalog: { derived: binding.api.propDetails !== undefined, ...binding.api },
		declarations,
		legacyAnchors,
	});
}
const partNamed = (api, heading) => api.parts.find((part) => part.heading === heading);
const rowsOf = (part) => part.groups.flatMap((group) => group.rows);
const rowNamed = (part, name, group = 0) => part.groups[group].rows.find((row) => row.name === name);
const plain = (segments) => segments.map(({ text }) => text).join('');

test('an alternative is named by the member that tells the alternatives apart, then by what only it requires, then otherwise', () => {
	// A discriminant: a member every alternative lists, with finite values no two share.
	assert.deepEqual([0, 1].map((index) => alternativeLabel([
		{ members: [member('layout', { values: ['stack'], type: "'stack'" }), never('children')] },
		{ members: [required('layout', { values: ['grid'], type: "'grid'" }), required('children')] },
	], index)), ["layout = 'stack'", "layout = 'grid'"]);
	// Values two alternatives share are no discriminant, so what each alone requires names it.
	assert.deepEqual([0, 1].map((index) => alternativeLabel([
		{ members: [required('aria-label'), member('aria-labelledby')] },
		{ members: [member('aria-label'), required('aria-labelledby')] },
	], index)), ['requires aria-label', 'requires aria-labelledby']);
	// Resizable: one alternative requires sizes, the other has nothing it alone requires.
	assert.deepEqual([0, 1].map((index) => alternativeLabel([
		{ members: [required('sizes'), never('defaultSizes')] },
		{ members: [never('sizes'), member('defaultSizes')] },
	], index)), ['requires sizes', 'otherwise']);
	// A required member every alternative requires does not name one of them.
	assert.equal(alternativeLabel([{ members: [required('id'), required('a')] }, { members: [required('id'), member('a')] }], 1), 'otherwise');
});

test('every one of the 43 parts with alternatives gets a distinct label for each alternative', () => {
	let multi = 0;
	for (const [, file] of reference.files) {
		for (const item of file.exports) {
			for (const part of item.parts ?? []) {
				if (part.alternatives === undefined) continue;
				multi += 1;
				const labels = part.alternatives.map((_, index) => alternativeLabel(part.alternatives, index));
				assert.equal(new Set(labels).size, labels.length, `${item.name}.${part.member ?? ''}: ${labels.join(' | ')}`);
			}
		}
	}
	assert.equal(multi, 43);
});

test('type text links the Mux UI types a member names, and only where the whole word stands outside a string literal', () => {
	const hrefs = new Map([['ButtonActivationEvent', '#type-ButtonActivationEvent'], ['Size', '/components/x/#type-Size']]);
	assert.deepEqual(typeSegments('(event: ButtonActivationEvent) => void', hrefs), [
		{ text: '(event: ' }, { text: 'ButtonActivationEvent', href: '#type-ButtonActivationEvent' }, { text: ') => void' },
	]);
	assert.deepEqual(typeSegments("'Size' | React.Size | NotSize | Size", hrefs).filter(({ href }) => href !== undefined), [{ text: 'Size', href: '/components/x/#type-Size' }]);
	assert.equal(plain(typeSegments("'Size' | React.Size | NotSize | Size", hrefs)), "'Size' | React.Size | NotSize | Size");
	assert.deepEqual(typeSegments('string', new Map()), [{ text: 'string' }]);
});

test('a part with alternatives shows common members first, then one group per alternative that closes with its not allowed and not declared members', () => {
	const virtualizer = partNamed(page('virtualizer'), 'Virtualizer');
	assert.deepEqual(virtualizer.groups.map(({ label }) => label), ['Common', "layout = 'stack'", "layout = 'grid'"]);
	assert.deepEqual(virtualizer.groups[0].rows.map(({ name }) => name), ['overscan']);
	const [, stack, grid] = virtualizer.groups;
	// Stack: forbidden members are declared never; aria-labelledby is not declared at all, which is not the same.
	assert.deepEqual(stack.closing, [
		{ state: 'not allowed', names: ['children', 'minItemWidth', 'maxItemWidth', 'estimatedItemHeight', 'maxColumns'] },
		{ state: 'not declared', names: ['aria-labelledby'] },
	]);
	assert.equal(grid.closing.length, 1);
	assert.equal(grid.closing[0].state, 'not allowed');
	assert.ok(grid.closing[0].names.includes('aria-labelledby'), 'the grid declares aria-labelledby as never');
	assert.deepEqual([stack.ref, grid.ref], ['HTMLDivElement', 'not allowed']);
	assert.equal(virtualizer.ref, 'per alternative');
	assert.equal(rowNamed(virtualizer, 'aria-label', 1).state, 'required');
	assert.equal(rowNamed(virtualizer, 'children', 2).state, 'required');
	// A part without alternatives is one unlabelled group with no closing rows.
	const switchRoot = partNamed(page('switch-field'), 'SwitchField.Root');
	assert.deepEqual([switchRoot.groups.length, switchRoot.groups[0].label, switchRoot.hasAlternatives, switchRoot.groups[0].closing], [1, null, false, []]);
});

test('members a part types never close its table as not allowed, with or without alternatives', () => {
	// DataDiff has no alternatives: children and dangerouslySetInnerHTML are never, so they are not rows but one closing row.
	const dataDiff = partNamed(page('data-diff'), 'DataDiff');
	assert.equal(dataDiff.hasAlternatives, false);
	assert.deepEqual(dataDiff.groups[0].closing, [{ state: 'not allowed', names: ['children', 'dangerouslySetInnerHTML'] }]);
	assert.equal(rowsOf(dataDiff).some(({ name }) => name === 'children' || name === 'dangerouslySetInnerHTML'), false);
	assert.equal(dataDiff.rowCount, rowsOf(dataDiff).length + 1);
	// With alternatives, the shared members' never names close the Common group, and each alternative closes its own.
	const model = { members: [member('id'), never('children')], alternatives: [{ members: [required('a')] }, { members: [required('b')] }] };
	const common = buildApiReference({
		packageName: '@x/y', exportName: 'X', anatomy: [], catalog: { derived: false, props: [], events: [], defaults: {} },
		declarations: { owner: 'x', export: { name: 'X', entry: '.', kind: 'component', parts: [{ member: null, form: 'function', ...model }] }, related: [], types: [] },
	}).parts[0];
	assert.deepEqual(common.groups[0].closing, [{ state: 'not allowed', names: ['children'] }]);
	assert.deepEqual(common.groups[1].closing, [{ state: 'not declared', names: ['b'] }]);
});

test('a part that is the same component as another shows that part\'s ref, native surface and generics, never "none declared"', () => {
	let aliases = 0;
	for (const slug of facts.runtimeSources.keys()) {
		const api = page(slug);
		for (const alias of api.parts.filter((part) => part.sameAs !== undefined)) {
			aliases += 1;
			const target = partNamed(api, alias.sameAs.heading);
			assert.ok(target !== undefined && target.sameAs === undefined, `${alias.heading} names ${alias.sameAs.heading}, which has no table of its own`);
			assert.deepEqual([alias.ref, alias.natives, alias.generics], [target.ref, target.natives, target.generics], alias.heading);
		}
	}
	assert.equal(aliases, 1, 'TextEditor.Root is the one alias in the reference');
	const root = partNamed(page('text-editor'), 'TextEditor.Root');
	assert.equal(root.ref, 'TextEditorHandle');
	assert.deepEqual(root.natives, [{ type: 'React.HTMLAttributes<HTMLDivElement>', omit: ['value', 'defaultValue', 'onChange'] }]);
	assert.deepEqual(root.groups, []);
});

test('Dialog keeps three alternatives, IconButton and Text show the facts their records ask for', () => {
	const dialog = partNamed(page('dialog'), 'Dialog');
	assert.deepEqual(dialog.groups.map(({ label }) => label), ['Common', 'requires title', 'requires aria-label', 'requires aria-labelledby']);
	assert.deepEqual(dialog.groups[2].closing, [{ state: 'not allowed', names: ['title', 'aria-labelledby'] }]);
	const iconButton = partNamed(page('icon-button'), 'IconButton');
	assert.equal(iconButton.ref, 'HTMLButtonElement');
	assert.deepEqual(iconButton.natives[0].omit.slice(-3), ['aria-label', 'aria-labelledby', 'showTextWhileLoading']);
	const text = partNamed(page('text'), 'Text');
	assert.deepEqual(text.generics, ["T extends TextElement = 'span'"]);
	assert.equal(text.ref, 'HTMLElementTagNameMap[T]');
	assert.deepEqual(text.groups.map(({ label }) => label), ['Common', "variant = 'body'", "variant = 'display' | 'heading' | 'title'", "variant = 'label' | 'expressive' | 'mono'"]);
	// The size of a heading variant is a finite set without xs, expanded; the others name TextSize and expand it.
	assert.equal(rowNamed(text, 'size', 2).values, "'sm' | 'md' | 'lg'");
	assert.equal(rowNamed(text, 'size', 1).values, "'xs' | 'sm' | 'md' | 'lg'");
});

test('a finite union is expanded unless the text already is that union, and a comment is absent when the declaration has none', () => {
	const iconButton = partNamed(page('icon-button'), 'IconButton');
	assert.equal(rowNamed(iconButton, 'variant').values, "'primary' | 'neutral' | 'ghost' | 'danger' | 'danger-neutral' | 'danger-ghost' | 'inverse'");
	assert.equal(plain(rowNamed(iconButton, 'variant').type), 'ButtonVariant');
	const resizable = partNamed(page('resizable'), 'Resizable');
	assert.equal('values' in rowNamed(resizable, 'orientation'), false, "'horizontal' | 'vertical' is already the union");
	// IconButton's children and style have no comment, and the page invents none.
	assert.equal('doc' in rowNamed(iconButton, 'children'), false);
	assert.equal('doc' in rowNamed(iconButton, 'style'), false);
	// Resizable's arms re-declare sizes without the comment OwnProps carries, so the row shows none and does not borrow it.
	assert.equal('doc' in rowNamed(resizable, 'sizes', 1), false);
});

test('a default shows only where it applies: executed for a derived family, authored for the rest, never on a required row or outside a row\'s values', () => {
	const iconButton = partNamed(page('icon-button'), 'IconButton');
	assert.deepEqual(rowNamed(iconButton, 'variant').default, { text: "'ghost'", authored: false });
	assert.equal('default' in rowNamed(iconButton, 'children'), false);
	// Text is authored: its defaults are labelled so, and variant's default body belongs only to the body alternative.
	const text = partNamed(page('text'), 'Text');
	assert.deepEqual(rowNamed(text, 'as').default, { text: "'span'", authored: true });
	assert.deepEqual(rowNamed(text, 'variant', 1).default, { text: "'body'", authored: true });
	assert.equal('default' in rowNamed(text, 'variant', 2), false, 'body is not one of display, heading or title');
	assert.equal('default' in rowNamed(text, 'variant', 3), false);
	// Virtualizer: height's default belongs to the stack, where height is a row, and a required row has none.
	const virtualizer = partNamed(page('virtualizer'), 'Virtualizer');
	assert.deepEqual(rowNamed(virtualizer, 'height', 1).default, { text: '240', authored: false });
	assert.equal('default' in rowNamed(virtualizer, 'layout', 2), false);
});

test('an authored family gives a catalog fact to the root that declares it, else to the only part that does, and borrows none across parts', () => {
	const [root, item] = ['MultiSelect.Root', 'MultiSelect.Item'].map((heading) => partNamed(page('multi-select'), heading));
	// disabled is declared by both Root and Item, and the catalog's default belongs to the root.
	assert.deepEqual(rowNamed(root, 'disabled').default, { text: 'false', authored: true });
	assert.equal('default' in rowNamed(item, 'disabled'), false);
	// onSelectionChange is the root's, so the root's row names the catalog event and no other row does.
	assert.equal(rowNamed(root, 'onSelectionChange').event, 'selectionChange');
	assert.equal(rowNamed(root, 'disabled').event, undefined);
	// dismissable is declared by Backdrop alone, so it takes the catalog's true.
	const palette = page('command-palette');
	assert.deepEqual(rowNamed(partNamed(palette, 'CommandPalette.Backdrop'), 'dismissable').default, { text: 'true', authored: true });
	// disabled is declared by four parts and not by the root, so none of them borrows the catalog's false, nor its activate event.
	const trigger = partNamed(palette, 'CommandPalette.Trigger');
	assert.equal('default' in rowNamed(trigger, 'disabled'), false);
	assert.equal(rowNamed(trigger, 'onActivate').event, undefined);
	// A derived family's part has the defaults of its own partApis entry.
	const select = page('select');
	assert.ok(rowsOf(partNamed(select, 'Select.Root')).some((row) => row.default !== undefined && !row.default.authored));
});

test('events list the catalog channels with the exact signatures the declarations give, a hook\'s options when no part declares one', () => {
	const palette = page('command-palette');
	const root = palette.events.find(({ part }) => part === null);
	const channels = Object.fromEntries(root.events.map((event) => [event.channel, event]));
	assert.deepEqual(Object.keys(channels), ['openChange', 'activate', 'queryChange', 'action']);
	// queryChange and action are options of useCommandPalette, which no part declares.
	assert.deepEqual(channels.queryChange.signatures.map(({ text, declaredBy }) => [text, declaredBy]), [['(query: string) => void', ['useCommandPalette']]]);
	assert.deepEqual(channels.action.signatures.map(({ declaredBy }) => declaredBy), [['useCommandPalette']]);
	// activate is declared by several parts, with more than one signature: each is shown with who declares it.
	assert.ok(channels.activate.signatures.length > 1);
	assert.ok(channels.activate.signatures.every(({ declaredBy }) => declaredBy.length > 0));
	// A derived family's events need no names: the heading says whose they are.
	const menu = page('menu');
	assert.ok(menu.events.some(({ part }) => part !== null));
	assert.ok(menu.events.every(({ events }) => events.every(({ signatures }) => signatures.every(({ declaredBy }) => declaredBy.length === 0))));
});

test('catalog props no part declares are listed, and a family whose parts declare them all lists none', () => {
	assert.equal(page('command-palette').catalogOnly[0].names.length, 11);
	// Input, TextArea and HeaderNav derive their blocks, which no longer list the natives their parts carry (HeaderNav's aria-label).
	for (const slug of ['icon-button', 'select', 'input', 'text-area', 'header-nav']) assert.deepEqual(page(slug).catalogOnly, [], slug);
});

test('parts and related exports list every export of the family with its exact import, and a hook, helper, flat part and value each have a kind', () => {
	const kinds = (slug) => Object.fromEntries(page(slug).exports.map(({ name, kind }) => [name, kind]));
	assert.deepEqual(kinds('command-palette'), { CommandPalette: 'component', useCommandPalette: 'hook' });
	assert.deepEqual(kinds('toast'), { Toast: 'component', ToastProvider: 'component', useToast: 'hook' });
	assert.deepEqual(kinds('resizable'), { Resizable: 'component', ResizableHandle: 'component', ResizablePanel: 'component' });
	assert.deepEqual(kinds('text-editor'), { TextEditor: 'component', isTextEditorDocument: 'function', normalizeTextEditorDocument: 'function' });
	assert.equal(Object.values(kinds('markdown')).filter((kind) => kind === 'value').length, 5);
	const imports = Object.fromEntries(page('text-editor').exports.map(({ name, import: line }) => [name, line]));
	assert.equal(imports.TextEditor, "import { TextEditor } from '@muxui/react/text-editor';");
	assert.equal(importLine('@muxui/react', '.', 'Card'), "import { Card } from '@muxui/react';");
	assert.equal(importLine('@muxui/react', './markdown', 'Markdown', true), "import type { Markdown } from '@muxui/react/markdown';");
	// Every part of a compound is listed under its export and reachable by an anchor that is the part's heading.
	const palette = page('command-palette');
	const compound = palette.exports.find(({ name }) => name === 'CommandPalette');
	assert.equal(compound.parts.length, 29);
	assert.ok(compound.parts.every(({ heading, anchor }) => anchor === partAnchor(heading) && palette.parts.some((part) => part.heading === heading && part.anchor === anchor)));
	// Each part shows the import of the export that holds it, a flat part its own.
	assert.equal(partNamed(palette, 'CommandPalette.Item').import, "import { CommandPalette } from '@muxui/react';");
	assert.equal(partNamed(page('resizable'), 'ResizablePanel').import, "import { ResizablePanel } from '@muxui/react';");
	assert.equal(partNamed(page('text-editor'), 'TextEditor').import, "import { TextEditor } from '@muxui/react/text-editor';");
	// A part that is the same component as another has no table of its own.
	const editor = page('text-editor');
	assert.deepEqual(editor.parts.map(({ heading, sameAs }) => [heading, sameAs?.heading]), [['TextEditor', undefined], ['TextEditor.Root', 'TextEditor']]);
	assert.deepEqual(partNamed(editor, 'TextEditor.Root').groups, []);
});

test('the ids a part used to answer to stay on its heading, and an id for a part the page lost stops the build', () => {
	const select = page('select', { 'api-reference-option': 'Select.Item', 'api-reference-trigger': 'Select.Trigger' });
	assert.deepEqual(partNamed(select, 'Select.Item').legacyAnchors, ['api-reference-option']);
	assert.deepEqual(partNamed(select, 'Select.Trigger').legacyAnchors, ['api-reference-trigger']);
	assert.deepEqual(select.parts.filter(({ legacyAnchors }) => legacyAnchors.length > 0).map(({ heading }) => heading), ['Select.Trigger', 'Select.Item']);
	assert.deepEqual(partNamed(page('select'), 'Select.Item').legacyAnchors, []);
	assert.throws(() => page('select', { 'api-reference-option': 'Select.Option' }), /Select\.Option, which Select's page no longer has/u);
});

test('the anchors of a page are unique, and every family page shows its owner\'s exported types under import lines', () => {
	let types = 0;
	for (const slug of facts.runtimeSources.keys()) {
		const api = page(slug);
		const anchors = [...api.parts.map(({ anchor }) => anchor), ...api.types.map(({ anchor }) => anchor)];
		assert.equal(new Set(anchors).size, anchors.length, `${slug} repeats an anchor`);
		for (const type of api.types) assert.ok(type.imports.length > 0 && type.imports.every((line) => line.startsWith('import type { ')), `${slug} ${type.name}`);
		types += api.types.length;
	}
	assert.equal(types, 288, 'the 318 exported types less the 24 shared and 6 package-level');
});

test('the package exports page lists every entry of the export map, the package-level exports and the shared types with their reasons', () => {
	const exported = buildPackageExports(reference, facts.packageName);
	assert.deepEqual(exported.entries.map(({ key }) => key), ['.', './compatibility', './styles.css', './themes', './themes.css', './testing', './text-editor', './markdown']);
	assert.deepEqual(exported.entries.filter(({ untyped }) => untyped !== undefined).map(({ key }) => key), ['./compatibility', './styles.css', './themes.css', './testing']);
	assert.deepEqual(exported.packageLevel.map(({ name }) => name), ['reactCompatibility', 'supplementalFamilies', 'MUXUI_DEFAULT_THEME_PRESET_ID', 'MUXUI_THEME_PRESETS', 'MUXUI_THEME_PRESETS_BY_ID']);
	assert.ok(exported.packageLevel.every(({ reason }) => reason !== undefined));
	assert.equal(exported.packageTypes.length, 6);
	assert.equal(exported.sharedTypes.length, 24);
	assert.ok(exported.sharedTypes.every(({ reason }) => reason !== undefined));
	assert.equal(literal(null), 'null');
});
