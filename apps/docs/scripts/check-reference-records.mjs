// The facts four ledger records ask the component pages to show, pinned as literals on the built pages.
//
//   node scripts/check-reference-records.mjs [dist]
//
// A pin states the fact, not the model it comes from: it holds when the page shows the fact and fails when a change to the
// declaration reference (a ref, a requirement, an export) makes the page show something else.
//   DISCLOSURE-01    title is required and children optional, the ref is HTMLDivElement, and there is no Disclosure.Title.
//   SWITCH-FIELD-01  Root's ref is HTMLDivElement and Button's is HTMLLabelElement, with onChange(checked: boolean), name and value.
//   TEXT-AREA-01     TextArea.Root's ref is HTMLDivElement, TextArea.TextArea's is HTMLTextAreaElement, with its native surface named.
//   TEXT-EDITOR-02   the text-editor entry lists all 32 exports with exact signatures.
//   X-002 (part)     CommandPalette says which parts need a Root around them.
//   DATA-DIFF        DataDiff closes its table with the members it types never (a reviewed fact, not a ledger record).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { attributeValue, elements } from './html-tree.mjs';
import { renderedComponent, routeFile, text } from './typed-reference.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const dist = process.argv[2] === undefined ? resolve(repositoryRoot, 'apps/docs/dist') : resolve(process.argv[2]);
const problems = [];
const page = (slug) => {
	const root = parse(readFileSync(routeFile(dist, `/components/${slug}/`), 'utf8'));
	return { root, api: renderedComponent(root) };
};
const rows = (part) => part.groups.flatMap((group) => group.rows);
const expect = (record, condition, message) => {
	if (!condition) problems.push(`${record}: ${message}`);
};
const hasRow = (record, part, name, state, type) => {
	const row = part === undefined ? undefined : rows(part).find((candidate) => candidate.name === name);
	expect(record, row !== undefined && row.state === state && row.type === type, `${part?.heading ?? 'the part'} must show ${name} as ${state} ${type}, and shows ${row === undefined ? 'no such row' : `${row.state} ${row.type}`}.`);
};
const partOf = (record, api, heading) => {
	const part = api.parts.find((candidate) => candidate.heading === heading);
	expect(record, part !== undefined, `the page has no part ${heading}.`);
	return part;
};
const ref = (record, part, expected) => expect(record, part?.ref === expected, `${part?.heading} must show the ref ${expected}, and shows ${part?.ref}.`);

// DISCLOSURE-01
{
	const record = 'DISCLOSURE-01';
	const { api } = page('disclosure');
	const part = partOf(record, api, 'Disclosure');
	ref(record, part, 'HTMLDivElement');
	hasRow(record, part, 'title', 'required', 'React.ReactNode');
	hasRow(record, part, 'children', 'optional', 'React.ReactNode');
	for (const name of ['expanded', 'defaultExpanded', 'disabled']) hasRow(record, part, name, 'optional', 'boolean');
	hasRow(record, part, 'id', 'optional', 'string');
	hasRow(record, part, 'onExpandedChange', 'optional', '(expanded: boolean) => void');
	expect(record, !api.parts.some(({ heading }) => /Title/u.test(heading)) && !api.exports.some(({ name }) => /Title/u.test(name)), 'the page shows a Disclosure.Title part or export.');
}

// SWITCH-FIELD-01
{
	const record = 'SWITCH-FIELD-01';
	const { api } = page('switch-field');
	const refs = { Root: 'HTMLDivElement', Button: 'HTMLLabelElement', Thumb: 'HTMLSpanElement', Description: 'HTMLElement', Error: 'HTMLElement' };
	for (const [member, expected] of Object.entries(refs)) ref(record, partOf(record, api, `SwitchField.${member}`), expected);
	const root = partOf(record, api, 'SwitchField.Root');
	hasRow(record, root, 'onChange', 'optional', '(checked: boolean) => void');
	hasRow(record, root, 'name', 'optional', 'string');
	hasRow(record, root, 'value', 'optional', 'string');
}

// TEXT-AREA-01
{
	const record = 'TEXT-AREA-01';
	const { api } = page('text-area');
	ref(record, partOf(record, api, 'TextArea.Root'), 'HTMLDivElement');
	const field = partOf(record, api, 'TextArea.TextArea');
	ref(record, field, 'HTMLTextAreaElement');
	expect(record, field?.natives.length === 1 && field.natives[0].type === 'React.TextareaHTMLAttributes<HTMLTextAreaElement>', `TextArea.TextArea must name React.TextareaHTMLAttributes<HTMLTextAreaElement> as its native surface, and shows ${JSON.stringify(field?.natives)}.`);
	hasRow(record, partOf(record, api, 'TextArea.Root'), 'onChange', 'optional', '(value: string) => void');
}

// TEXT-EDITOR-02
{
	const record = 'TEXT-EDITOR-02';
	const { api } = page('text-editor');
	const names = [
		'TextEditor', 'isTextEditorDocument', 'normalizeTextEditorDocument',
		'TextEditorActionCallbacks', 'TextEditorAlignment', 'TextEditorBlockNode', 'TextEditorBlockquoteNode', 'TextEditorBulletListNode', 'TextEditorCodeBlockNode',
		'TextEditorCommand', 'TextEditorDocument', 'TextEditorFontFamily', 'TextEditorFontSize', 'TextEditorHandle', 'TextEditorHardBreakNode', 'TextEditorHeadingNode',
		'TextEditorHorizontalRuleNode', 'TextEditorImageNode', 'TextEditorInlineNode', 'TextEditorListItemNode', 'TextEditorListNode', 'TextEditorMark', 'TextEditorNode',
		'TextEditorOrderedListNode', 'TextEditorOrderedListType', 'TextEditorParagraphNode', 'TextEditorPlainTextNode', 'TextEditorProps', 'TextEditorSelectionAction',
		'TextEditorSelectionActions', 'TextEditorSelectionRequest', 'TextEditorTextNode',
	];
	const shown = [...api.exports.map(({ name }) => name), ...api.types.map(({ name }) => name)];
	expect(record, names.length === 32 && shown.length === 32 && names.every((name) => shown.includes(name)), `the page must list the 32 exports of @muxui/react/text-editor, and lists ${shown.length}: missing ${names.filter((name) => !shown.includes(name)).join(', ') || 'none'}.`);
	for (const item of api.exports) expect(record, item.import === `import { ${item.name} } from '@muxui/react/text-editor';`, `${item.name} must be imported from @muxui/react/text-editor, and shows "${item.import}".`);
	for (const type of api.types) expect(record, type.imports.length === 1 && type.imports[0] === `import type { ${type.name} } from '@muxui/react/text-editor';`, `${type.name} must be imported from @muxui/react/text-editor.`);
	const signature = (name) => api.exports.find((item) => item.name === name)?.signature;
	expect(record, signature('isTextEditorDocument') === 'isTextEditorDocument(value: unknown): value is TextEditorDocument', `isTextEditorDocument shows "${signature('isTextEditorDocument')}".`);
	expect(record, signature('normalizeTextEditorDocument') === 'normalizeTextEditorDocument(value: unknown): TextEditorDocument', `normalizeTextEditorDocument shows "${signature('normalizeTextEditorDocument')}".`);
	const editor = partOf(record, api, 'TextEditor');
	ref(record, editor, 'TextEditorHandle');
	// Root is the same component as TextEditor, so it shows TextEditor's ref and native surface, never "none declared".
	const alias = partOf(record, api, 'TextEditor.Root');
	ref(record, alias, 'TextEditorHandle');
	const surface = JSON.stringify([{ type: 'React.HTMLAttributes<HTMLDivElement>', omit: ['value', 'defaultValue', 'onChange'] }]);
	expect(record, alias?.sameAs === 'TextEditor' && alias.groups.length === 0 && JSON.stringify(alias.natives) === surface, `TextEditor.Root must be shown as the same component as TextEditor with ${surface}, and shows ${JSON.stringify({ sameAs: alias?.sameAs, natives: alias?.natives })}.`);
	const requests = {
		onLinkRequest: '(actions: TextEditorActionCallbacks) => void',
		onImageRequest: '(actions: { insertImage(src: string, alt?: string): boolean }) => void',
		onColorRequest: '(actions: { setColor(value: string): boolean }) => void',
		onGenerate: '() => void',
		onSelectionRequest: '(request: TextEditorSelectionRequest, actions: TextEditorSelectionActions) => void | Promise<unknown>',
	};
	for (const [name, type] of Object.entries(requests)) hasRow(record, editor, name, 'optional', type);
	const declaration = (name) => api.types.find((type) => type.name === name)?.text ?? '';
	expect(record, declaration('TextEditorSelectionActions') === 'type TextEditorSelectionActions = {\n  readonly selection: { readonly text: string; readonly document: TextEditorDocument };\n  readonly signal: AbortSignal;\n  replace(content: string | TextEditorDocument): boolean;\n  insertAfter(content: string | TextEditorDocument): boolean;\n  close(): void;\n};', 'TextEditorSelectionActions must show its readonly selection, signal, replace, insertAfter and close as declared.');
	const command = declaration('TextEditorCommand');
	const members = ["type: 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList' | 'blockquote' | 'codeBlock' | 'unlink' | 'generate';", "type: 'align';", "type: 'color';", "type: 'fontFamily';", "type: 'fontSize';", "type: 'link';", "type: 'image';"];
	expect(record, members.every((member) => command.includes(member)), 'TextEditorCommand must show its seven members by their type.');
}

// DATA-DIFF: children and dangerouslySetInnerHTML are typed never on DataDiff, so its table closes with them as not allowed.
{
	const record = 'DATA-DIFF';
	const { api } = page('data-diff');
	const part = partOf(record, api, 'DataDiff');
	ref(record, part, 'HTMLDivElement');
	const closing = JSON.stringify(part?.groups[0].closing.map(({ state, names }) => ({ state, names })));
	const wanted = JSON.stringify([{ state: 'not allowed', names: ['children', 'dangerouslySetInnerHTML'] }]);
	expect(record, part?.groups.length === 1 && closing === wanted, `DataDiff must close its table with ${wanted}, and closes it with ${closing}.`);
	expect(record, part !== undefined && !rows(part).some(({ name }) => name === 'children' || name === 'dangerouslySetInnerHTML'), 'DataDiff lists children or dangerouslySetInnerHTML as a row, but they are not allowed.');
}

// X-002: the ancestry of CommandPalette's parts, authored in its behavior list and shown on its page.
{
	const record = 'X-002';
	const { root } = page('command-palette');
	const behavior = elements(root).find((node) => attributeValue(node, 'data-fact') === 'binding.behavior');
	const items = behavior === undefined ? [] : elements(behavior).filter((node) => node.tagName === 'li').map((node) => text(node));
	const sentence = 'Trigger, Backdrop, Close, Input, ListBox, and Item throw outside Root, because they read its context; Root renders without any of them.';
	expect(record, items.includes(sentence), `CommandPalette behavior must say "${sentence}".`);
}

if (problems.length > 0) throw new Error(`A ledger record's fact is not on its page:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
console.log('Ledger record pins passed: DISCLOSURE-01, SWITCH-FIELD-01, TEXT-AREA-01 and TEXT-EDITOR-02 show the facts their records ask for, CommandPalette says which parts need a Root (X-002), and DataDiff closes its table with the members it forbids.');
