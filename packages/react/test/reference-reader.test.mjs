// The declaration reader (Decision 0031 typed rendering): what it reads of each construct, what it refuses by
// name, and that TypeScript 7 (the production host) and TypeScript 6 (a test-only host) read the same bytes.
// The synthetic declarations in support/reference-inputs.mjs hold every construct the reader admits.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { API } from 'typescript/unstable/sync';
import { ReferenceReadError } from '../reference-reader/errors.mjs';
import { createExpander } from '../reference-reader/expand.mjs';
import { assertSession } from '../reference-reader/host.mjs';
import { typescript7Host } from '../reference-reader/host-typescript7.mjs';
import { formatJson } from '../reference-reader/json.mjs';
import { assignOwners } from '../reference-reader/ownership.mjs';
import { printDeclaration, printType } from '../reference-reader/printer.mjs';
import { readGraph } from '../reference-reader/graph.mjs';
import { readDeclarationGraph, readReference } from '../reference-reader/read.mjs';
import { typescript6Host } from './support/reference-host-typescript6.mjs';
import { CONFORMANCE, fixtureManifest, ownedByFixture, realInputs, single } from './support/reference-inputs.mjs';

const read = (declarations, host) => readDeclarationGraph({ declarations, manifest: fixtureManifest, host });
const printed = (graph) => Object.fromEntries(graph.types.map((declaration) => [declaration.name, printDeclaration(declaration)]));

function conformanceModel(host) {
  const graph = read(CONFORMANCE, host);
  return readReference({ declarations: CONFORMANCE, manifest: fixtureManifest, host, families: [], exceptions: ownedByFixture(graph), untypedEntries: {} });
}

const rejection = (declarations, code) => assert.throws(() => read(declarations), (error) => error instanceof ReferenceReadError && error.code === `MUXUI_REACT_REFERENCE_${code}`, code);

// ---- what the reader reads ------------------------------------------------------------------------

test('every type construct prints as the declaration wrote it, in the order it wrote it', () => {
  const text = printed(read(CONFORMANCE));
  assert.equal(text.Literals, "type Literals = 'a' | 'b\\'c' | 1 | -2 | true | false | null;");
  assert.equal(text.Nested, "type Nested = 'a' | 'b' | 'c' | 'd' | 'e';");
  assert.equal(text.Tuples, 'type Tuples = [string, number?, ...boolean[]] | readonly [a: string, b?: number] | [first: string, ...rest: number[]];');
  assert.equal(text.Indexed, "type Indexed = Keywords['s'] | Keywords['n'];");
  assert.equal(text.Query, 'type Query = typeof Count;');
  assert.equal(text.Mapped, "type Mapped = { readonly [K in 'a' | 'b']?: string } & { -readonly [K in keyof Keywords as Exclude<K, 'a'>]-?: Keywords[K] };");
  assert.equal(text.Arrays, 'type Arrays = {\n  list: string[];\n  ro: readonly string[];\n  fn: (() => void)[];\n  un: (string | number)[];\n  k: keyof Keywords;\n};');
  assert.equal(text.Keywords, 'type Keywords = {\n  s: string;\n  n: number;\n  b: boolean;\n  big: bigint;\n  sym: symbol;\n  o: object;\n  v: void;\n  u: undefined;\n  nu: null;\n  ne: never;\n  unk: unknown;\n  a: any;\n};');
  assert.equal(text.Functions, [
    'type Functions = {',
    '  plain: (a: string, b?: number, ...rest: boolean[]) => void;',
    "  generic: <T extends string = 'x', U = T>(value: T, other: U) => [T, U];",
    '  nested: (callback: (event: Size) => void) => () => void;',
    '  guard: (value: unknown) => value is string;',
    '  asserts: (value: unknown) => asserts value is string;',
    '  assertsOnly: (value: unknown) => asserts value;',
    '};',
  ].join('\n'));
  assert.equal(text.Members, [
    'type Members = {',
    '  required: string;',
    '  optional?: number;',
    '  readonly frozen: string;',
    '  readonly frozenOptional?: string;',
    "  'quoted-name'?: boolean;",
    '  method(a: string): void;',
    '  optionalMethod?(): number;',
    '  genericMethod<T>(value: T): T;',
    '  explicit?: string | undefined;',
    '  declaredNever?: never;',
    '  [key: string]: unknown;',
    '  (call: string): number;',
    '};',
  ].join('\n'));
  assert.equal(text.Generic, "interface Generic<T extends string = 'a', U = T> extends Named {\n  value: T;\n  other: U;\n}");
  assert.equal(text.Extends, "interface Extends extends Generic<'b'>, React.HTMLAttributes<HTMLDivElement> {\n  extra: number;\n}");
});

test('a host type is named as React or the library spells it, however the file imported it', () => {
  const hosts = read(CONFORMANCE).types.find(({ name }) => name === 'Hosts');
  assert.equal(printDeclaration(hosts), [
    'type Hosts = {',
    '  node: React.ReactNode;',
    '  qualified: React.ReactNode;',
    '  format: Intl.NumberFormatOptions;',
    '  promise: Promise<void>;',
    '  list: Array<string>;',
    '  record: Record<string, number>;',
    '  element: HTMLDivElement;',
    '  exclude: Exclude<React.ReactNode, null | undefined | boolean>;',
    '};',
  ].join('\n'));
});

test('functions and constants keep their signatures, and a destructured parameter reads as the props it is', () => {
  const graph = read(CONFORMANCE);
  const value = (name) => graph.values.find((declaration) => declaration.name === name);
  assert.equal(value('Destructured').parameters[0].name, 'props');
  assert.deepEqual(value('read').parameters.map(({ name, rest }) => [name, rest ?? false]), [['input', false], ['more', true]]);
  assert.equal(value('read').doc, 'Reads the value.');
  assert.equal(value('isSized').returnType.kind, 'predicate');
  assert.equal(printType(value('Fixed').type), "readonly ['a', 'b']");
});

test('the graph names each export of each entry point, with the declaration it resolves to', () => {
  const graph = read(CONFORMANCE);
  const [entry] = graph.entries;
  assert.equal(entry.key, '.');
  const byName = Object.fromEntries(entry.exports.map((item) => [item.name, item]));
  assert.equal(byName.Size.type, 'shared#Size');
  assert.equal(byName.Box.value, 'parts#Box:value');
  assert.equal(byName.BoxProps.type, 'parts#BoxProps');
  assert.deepEqual(entry.exports.map(({ name }) => name), [...entry.exports.map(({ name }) => name)].sort());
});

// ---- the model: components, alternatives, refs ----------------------------------------------------

const exportsOf = (model) => Object.fromEntries(model.files.get('shared.json').exports.map((item) => [item.name, item]));
const names = (members) => members.map(({ name }) => name);

test('a forwardRef component names its ref, its members, and the host surface it passes through', () => {
  const { Box } = exportsOf(conformanceModel());
  const [part] = Box.parts;
  assert.deepEqual([part.member, part.form, part.ref], [null, 'forwardRef', { type: 'HTMLDivElement' }]);
  assert.deepEqual(names(part.members), ['label', 'size', 'onPick', 'tone']);
  assert.deepEqual(part.natives, [{ type: 'React.HTMLAttributes<HTMLDivElement>', omit: ['label', 'size', 'onPick', 'tone'] }]);
  const [label, size, , tone] = part.members;
  assert.equal(label.doc, 'The shown label.');
  assert.equal('doc' in size, false, 'a member without a comment has none');
  assert.deepEqual(size.values, ['sm', 'md', 'lg']);
  assert.deepEqual(tone.values, ['calm', 'loud']);
});

test('alternatives keep what every arm shares once, and "not declared" apart from a declared never', () => {
  const { Chooser } = exportsOf(conformanceModel());
  const [part] = Chooser.parts;
  assert.deepEqual(names(part.members), ['label', 'size', 'onPick', 'tone']);
  assert.equal(part.alternatives.length, 3);
  const [first, second, third] = part.alternatives.map(({ members }) => Object.fromEntries(members.map((member) => [member.name, member])));
  assert.deepEqual(first['aria-label'], { name: 'aria-label', type: 'string' });
  assert.deepEqual(first['aria-labelledby'], { name: 'aria-labelledby', optional: true, never: true, type: 'never' });
  assert.deepEqual(Object.keys(third), ['title'], 'the title arm does not declare the aria members at all');
  assert.equal(second['aria-label'].never, true);
});

test('a ref that differs per alternative is recorded per alternative, with a declared never kept', () => {
  const { Layout } = exportsOf(conformanceModel());
  const [part] = Layout.parts;
  assert.equal('ref' in part, false);
  assert.deepEqual(part.alternatives.map(({ ref }) => ref), [{ type: 'HTMLDivElement' }, { never: true }]);
  assert.deepEqual(part.alternatives.map(({ members }) => names(members)), [['layout', 'rows'], ['layout', 'columns']]);
});

test('every component form is read: FC, ComponentType, functions, call signatures, compounds and self reference', () => {
  const model = exportsOf(conformanceModel());
  assert.equal(model.Fc.parts[0].form, 'FC');
  assert.equal(model.Ct.parts[0].form, 'ComponentType');
  assert.equal(model.functionComponent.kind, 'component');
  assert.equal(model.Destructured.parts[0].form, 'function');
  const [call, item] = model.List.parts;
  assert.deepEqual([call.member, call.form, item.member, item.form], [null, 'call', 'Item', 'forwardRef']);
  assert.deepEqual(call.typeParameters, [{ name: 'T', constraint: '{ id: string }', default: '{ id: string }' }]);
  assert.deepEqual(call.members.map(({ type }) => type), ['T[]', '(item: T) => React.ReactNode']);
  assert.deepEqual(model.Panel.parts.map(({ member, form }) => [member, form]), [['Root', 'forwardRef'], ['Title', 'FC'], ['Close', 'function']]);
  assert.deepEqual(model.Self.parts[1], { member: 'Root', sameAs: 'Self' });
  assert.equal(model.hook.kind, 'function');
  assert.equal(model.hook.signature, 'hook(): { size: Size }');
});

test('Omit and Pick of Mux UI types are evaluated, and of host types are kept as exact applications', () => {
  const model = exportsOf(conformanceModel());
  const picked = model.PickedComponent.parts[0];
  assert.deepEqual(names(picked.members), ['label', 'size']);
  assert.deepEqual(picked.natives, [{ type: "Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>" }]);
  const agreed = model.AgreeComponent.parts[0];
  assert.deepEqual(names(agreed.members), ['a'], 'Omit over arms that agree once the key is gone is one arm');
  assert.equal('alternatives' in agreed, false);
});

test('a duplicate member in an intersection is kept only when both declarations spell one type', () => {
  const model = exportsOf(conformanceModel());
  const dup = model.DupComponent.parts[0].members;
  assert.deepEqual(dup.map(({ name, optional }) => [name, optional ?? false]), [['size', false], ['flag', false]], 'required wins, as TypeScript intersects it');
  const docs = Object.fromEntries(model.DocComponent.parts[0].members.map(({ name, doc }) => [name, doc]));
  assert.deepEqual(docs, { both: 'left doc', onlyLeft: undefined, onlyRight: 'right only' }, 'the first declaration with a comment wins; none is invented');
});

test('every public type is in its owner file with its printed declaration, members and finite values', () => {
  const file = conformanceModel().files.get('shared.json');
  const byName = Object.fromEntries(file.types.map((type) => [type.name, type]));
  assert.deepEqual(byName.Size.values, ['sm', 'md', 'lg']);
  assert.equal(byName.Size.text, "type Size = 'sm' | 'md' | 'lg';");
  assert.deepEqual(byName.Size.public, [{ entry: '.', name: 'Size' }]);
  assert.equal('public' in byName.Own, false, 'a type the entry points do not export is internal and says so');
  assert.deepEqual(byName.Members.members.map(({ name }) => name), ['required', 'optional', 'frozen', 'frozenOptional', 'quoted-name', 'method', 'optionalMethod', 'genericMethod', 'explicit', 'declaredNever']);
  const members = Object.fromEntries(byName.Members.members.map((member) => [member.name, member]));
  assert.equal(members.required.doc, 'A documented property.');
  assert.equal(members.frozen.readonly, true);
  assert.equal(members.method.method, true);
  assert.equal(members.method.type, '(a: string): void');
  assert.deepEqual([members.explicit.explicitUndefined, members.declaredNever.never], [true, true]);
  assert.deepEqual(file.sources, {
    index: 'packages/react/src/fixture/index.ts',
    parts: 'packages/react/src/fixture/parts.ts',
    shared: 'packages/react/src/fixture/shared.ts',
  });
});

test('an interface lists its bases, and an alias of Base & { ... } lists the same, so no member is repeated or lost', () => {
  const declarations = single(`
export interface Base { id: string; label?: string }
export interface Extended extends Base { extra: number }
export type Mixed = Base & { color?: 'a' | 'b' };
export type Opaque<T> = Base & T;
`);
  const graph = read(declarations);
  const { files } = readReference({ declarations, manifest: fixtureManifest, families: [], exceptions: ownedByFixture(graph), untypedEntries: {} });
  const byName = Object.fromEntries(files.get('shared.json').types.map((type) => [type.name, type]));
  assert.deepEqual(byName.Extended.extends, [{ type: 'Base', refs: ['index#Base'] }]);
  assert.deepEqual(byName.Extended.members.map(({ name }) => name), ['extra']);
  assert.deepEqual(byName.Mixed.extends, [{ type: 'Base', refs: ['index#Base'] }]);
  assert.deepEqual(byName.Mixed.members.map(({ name, values }) => [name, values]), [['color', ['a', 'b']]]);
  assert.equal('extends' in byName.Opaque, false, 'an intersection with a type parameter is text only');
  assert.equal(byName.Opaque.members, undefined);
});

const modelOf = (text, host) => {
  const declarations = single(text);
  return readReference({ declarations, manifest: fixtureManifest, host, families: [], exceptions: ownedByFixture(read(declarations, host)), untypedEntries: {} }).files.get('shared.json');
};
const REACT = "import type * as React from 'react';\nimport type { ReactElement } from 'react';\n";
const partOf = (file, name) => file.exports.find((item) => item.name === name).parts[0];

test('a forwarded ref keeps whether it is required, and Omit and Pick take it away like any other key', () => {
  const file = modelOf(`${REACT}
type Optional = { a?: string; ref?: never };
type Required = { a?: string; ref: never };
export declare function Loose(props: Optional): ReactElement | null;
export declare function Strict(props: Required): ReactElement | null;
type Forwarded = { a: string } & React.RefAttributes<HTMLDivElement>;
export declare function Kept(props: Forwarded): ReactElement | null;
export declare function Omitted(props: Omit<Forwarded, 'ref'>): ReactElement | null;
export declare function Picked(props: Pick<Forwarded, 'a'>): ReactElement | null;
export declare function PickedWithRef(props: Pick<Forwarded, 'a' | 'ref'>): ReactElement | null;
`);
  assert.deepEqual(partOf(file, 'Loose').ref, { never: true });
  assert.deepEqual(partOf(file, 'Strict').ref, { never: true, required: true });
  assert.deepEqual(partOf(file, 'Kept').ref, { type: 'HTMLDivElement' });
  assert.equal(partOf(file, 'Omitted').ref, null, 'Omit<..., "ref"> leaves no ref');
  assert.equal(partOf(file, 'Picked').ref, null, 'a Pick that leaves ref out leaves no ref');
  assert.deepEqual(partOf(file, 'PickedWithRef').ref, { type: 'HTMLDivElement' });
  assert.deepEqual(partOf(file, 'Omitted').members.map(({ name }) => name), ['a']);
});

test('keyof a type with a forwarded ref includes ref, so Omit and Pick of those keys take it away or keep it, under both compilers', () => {
  for (const host of [typescript7Host, typescript6Host]) {
    const file = modelOf(`${REACT}
type P = { a: string } & React.RefAttributes<HTMLDivElement>;
type Q = { b?: string; ref?: never };
export declare function OmitAll(props: Omit<P, keyof P>): ReactElement | null;
export declare function PickAll(props: Pick<P, keyof P>): ReactElement | null;
export declare function OmitAllNever(props: Omit<Q, keyof Q>): ReactElement | null;
export declare function PickAllNever(props: Pick<Q, keyof Q>): ReactElement | null;
`, host);
    const at = (name) => partOf(file, name);
    assert.equal(at('OmitAll').ref, null, `${host.name}: Omit<P, keyof P> leaves no ref`);
    assert.deepEqual(at('OmitAll').members, [], host.name);
    assert.deepEqual(at('PickAll').ref, { type: 'HTMLDivElement' }, `${host.name}: Pick<P, keyof P> keeps the ref`);
    assert.deepEqual(at('PickAll').members.map(({ name }) => name), ['a'], host.name);
    assert.equal(at('OmitAllNever').ref, null, `${host.name}: a declared ref?: never is a key too`);
    assert.deepEqual(at('PickAllNever').ref, { never: true }, host.name);
  }
});

test('props that overload a method are refused as OVERLOAD instead of keeping one signature', () => {
  assert.throws(() => modelOf(`${REACT}
export interface Props { onPick(value: string): void; onPick(value: number): void }
export declare function Picker(props: Props): ReactElement | null;
`), (error) => error instanceof ReferenceReadError && error.code === 'MUXUI_REACT_REFERENCE_OVERLOAD' && /onPick is declared more than once/u.test(error.message));
  // A method the interface redeclares over a base's is an override, not an overload.
  const file = modelOf(`${REACT}
interface Base { onPick(value: string): void }
export interface Derived extends Base { onPick(value: 'a'): void }
export declare function Picker(props: Derived): ReactElement | null;
`);
  assert.equal(partOf(file, 'Picker').members[0].type, "(value: 'a'): void");
});

test('a value a type reaches through typeof is printed with it, with its provenance', () => {
  const file = modelOf(`
declare const Internal: { readonly tag: 'ok' };
declare function makeProps(label: string): { label: string };
export type X = typeof Internal;
export type Y = ReturnType<typeof makeProps>;
export {};
`);
  const byName = Object.fromEntries(file.values.map((value) => [value.name, value]));
  assert.deepEqual(Object.keys(byName), ['Internal', 'makeProps']);
  assert.equal(byName.Internal.text, "declare const Internal: {\n  readonly tag: 'ok';\n};");
  assert.equal(byName.Internal.kind, 'const');
  assert.equal('public' in byName.Internal, false, 'an internal value says so');
  assert.equal(byName.makeProps.text, 'declare function makeProps(label: string): { label: string };');
  assert.deepEqual(file.sources, { index: 'packages/react/src/fixture/index.ts' });
  assert.deepEqual(file.types.find(({ name }) => name === 'X').refs, ['index#Internal:value']);
  // A value no type reaches is not listed, so existing files do not change.
  assert.equal('values' in modelOf('export type Z = string;\nexport {};'), false);
});

test('a type and a value that share a name stay two declarations, internal or exported', () => {
  const hosts = [typescript7Host, typescript6Host];
  for (const host of hosts) {
    // Internal: `Internal` reaches the interface, `typeof Internal` the constant, and the model holds both.
    const internal = modelOf(`
interface Internal { readonly tag: 'type' }
declare const Internal: { readonly tag: 'value' };
export type Both = { type: Internal; value: typeof Internal };
export {};
`, host);
    const types = Object.fromEntries(internal.types.map((type) => [type.id, type]));
    assert.deepEqual(Object.keys(types).sort(), ['index#Both', 'index#Internal'], host.name);
    assert.match(types['index#Internal'].text, /^interface Internal \{/u, host.name);
    assert.deepEqual(internal.values.map(({ id, name, kind }) => [id, name, kind]), [['index#Internal:value', 'Internal', 'const']], host.name);
    assert.deepEqual(types['index#Both'].refs, ['index#Internal', 'index#Internal:value'], host.name);
    assert.equal(internal.values[0].text, "declare const Internal: {\n  readonly tag: 'value';\n};", host.name);

    // Exported: one public name for both, listed once in the inventory as a type and a value, both reachable.
    const declarations = single(`
export interface Shared { readonly tag: 'type' }
export declare const Shared: Readonly<Record<string, string>>;
export type Reach = { type: Shared; value: typeof Shared };
`);
    const { files, inventory } = readReference({ declarations, manifest: fixtureManifest, host, families: [], exceptions: ownedByFixture(read(declarations, host)), untypedEntries: {} });
    const exported = files.get('shared.json');
    assert.deepEqual(inventory.entries[0].exports.map(({ name, kind }) => [name, kind]), [['Reach', 'type'], ['Shared', 'type and value']], host.name);
    assert.deepEqual(exported.types.map(({ id }) => id), ['index#Reach', 'index#Shared'], host.name);
    assert.deepEqual(exported.values.map(({ id, public: where }) => [id, where]), [['index#Shared:value', [{ entry: '.', name: 'Shared' }]]], host.name);
    assert.deepEqual(exported.exports.map(({ name, kind }) => [name, kind]), [['Shared', 'value']], host.name);
  }
});

test('a host application the reader does not evaluate is refused instead of shown as an attribute envelope', () => {
  const refused = (props) => assert.throws(() => modelOf(`${REACT}declare function makeProps(label: string): { label: string };\nexport declare const Widget: React.FC<${props}>;\n`),
    (error) => error instanceof ReferenceReadError && error.code === 'MUXUI_REACT_REFERENCE_UNSUPPORTED' && /host type the reader does not evaluate/u.test(error.message), props);
  refused('ReturnType<typeof makeProps>');
  refused('Awaited<ReturnType<typeof makeProps>>');
  refused('Pick<ReturnType<typeof makeProps>, "label">');
  refused('Intl.NumberFormatOptions');
  // React's attribute surfaces are the terminal case: they pass through, named exactly.
  const surfaces = modelOf(`${REACT}export declare const Widget: React.FC<React.HTMLAttributes<HTMLDivElement> & Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { label: string }>;\n`);
  assert.deepEqual(partOf(surfaces, 'Widget').natives.map(({ type }) => type), ['React.HTMLAttributes<HTMLDivElement>', "Pick<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'>"]);
});

test('an attribute surface passes through as native only when it is applied to a native element', () => {
  const refused = (text, fragment) => assert.throws(() => modelOf(`${REACT}${text}`),
    (error) => error instanceof ReferenceReadError && error.code === 'MUXUI_REACT_REFERENCE_UNSUPPORTED' && error.message.includes('is not a native element') && error.message.includes(fragment), text);
  // A package component is not a native element: its props are declared, so a "native" envelope would hide them.
  refused(`declare const Inner: React.FC<{ label: string }>;
export declare const Outer: React.FC<React.ComponentPropsWithoutRef<typeof Inner>>;
`, 'typeof Inner');
  refused(`export declare function Generic<T extends React.ElementType>(props: React.ComponentPropsWithoutRef<T>): ReactElement | null;
`, 'T');
  refused(`declare const Inner: React.FC<{ label: string }>;
export declare const Outer: React.FC<Pick<React.ComponentPropsWithoutRef<typeof Inner>, 'label'>>;
`, 'typeof Inner');
  // The real thing is accepted: an intrinsic element name, a DOM element type, a parameter constrained to element names.
  const file = modelOf(`${REACT}
type Tag = 'a' | 'button';
export declare function ByName(props: React.ComponentPropsWithoutRef<'div'> & { label: string }): ReactElement | null;
export declare function ByDom(props: React.HTMLAttributes<HTMLDivElement> & { label: string }): ReactElement | null;
export declare function ByParameter<T extends Tag = 'a'>(props: Omit<React.ComponentPropsWithoutRef<T>, 'color'> & { as?: T }): ReactElement | null;
export declare function ByInlineNames<T extends 'p' | 'span'>(props: React.ComponentPropsWithoutRef<T> & { as?: T }): ReactElement | null;
`);
  const natives = (name) => partOf(file, name).natives.map(({ type, omit }) => [type, omit]);
  assert.deepEqual(natives('ByName'), [["React.ComponentPropsWithoutRef<'div'>", undefined]]);
  assert.deepEqual(natives('ByDom'), [['React.HTMLAttributes<HTMLDivElement>', undefined]]);
  assert.deepEqual(natives('ByParameter'), [['React.ComponentPropsWithoutRef<T>', ['color']]]);
  assert.deepEqual(natives('ByInlineNames'), [['React.ComponentPropsWithoutRef<T>', undefined]]);
});

// TextEditor (Decision 0031 tranche 11a): a forwardRef component whose `Root` is the component's own type, props whose
// documents are tuples with a rest, nested method signatures, and a callback that returns a Promise of unknown.
test('a component whose Root is its own type, with tuples, nested methods and a Promise of unknown, reads exactly, under both compilers', () => {
  for (const host of [typescript7Host, typescript6Host]) {
    const file = modelOf(`${REACT}
type Block = { type: 'p'; content?: Block[] };
export type Doc = { type: 'doc'; content: [Block, ...Block[]] };
export type Handle = { focus(): void; execute(command: string): boolean };
type OwnProps = {
  value?: Doc;
  onImageRequest?: (actions: { insertImage(src: string, alt?: string): boolean }) => void;
  onRequest?: (request: string, actions: Handle) => void | Promise<unknown>;
};
export type EditorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'value'> & OwnProps;
type EditorComponent = React.ForwardRefExoticComponent<EditorProps & React.RefAttributes<Handle>> & { Root: EditorComponent };
export declare const Editor: EditorComponent;
`, host);
    const parts = file.exports.find(({ name }) => name === 'Editor').parts;
    assert.deepEqual(parts.map(({ member, form, sameAs }) => [member, form, sameAs]), [[null, 'forwardRef', undefined], ['Root', undefined, 'Editor']], host.name);
    assert.deepEqual(parts[0].ref, { type: 'Handle', refs: ['index#Handle'] }, host.name);
    const members = Object.fromEntries(parts[0].members.map((member) => [member.name, member.type]));
    assert.equal(members.value, 'Doc', host.name);
    assert.equal(members.onImageRequest, '(actions: { insertImage(src: string, alt?: string): boolean }) => void', host.name);
    assert.equal(members.onRequest, '(request: string, actions: Handle) => void | Promise<unknown>', host.name);
    const types = Object.fromEntries(file.types.map((type) => [type.name, type.text]));
    assert.equal(types.Doc, "type Doc = {\n  type: 'doc';\n  content: [Block, ...Block[]];\n};", host.name);
    assert.equal(types.Handle, 'type Handle = {\n  focus(): void;\n  execute(command: string): boolean;\n};', host.name);
  }
  // A part that is another component, not this one, is still not a single component.
  assert.throws(() => modelOf(`${REACT}
type Inner = React.ForwardRefExoticComponent<{ a?: string }> & { Deep: React.ForwardRefExoticComponent<{ b?: string }> };
type Outer = React.ForwardRefExoticComponent<{ c?: string }> & { Inner: Inner };
export declare const Widget: Outer;
`), (error) => error instanceof ReferenceReadError && /a part that is not a single component/u.test(error.message));
});

test('every printed type compiles again, under TypeScript 7 and 6: optional unnamed tuple elements are parenthesized', () => {
  const declarations = single(`
type A = { a: 1 };
type B = { b: 2 };
export type Union = [(string | number)?];
export type Fn = [(() => void)?, ...(string | number)[]];
export type Both = [(A & B)?];
export type Keys = [(keyof A)?];
export type Frozen = readonly [(readonly string[])?];
export type Plain = [string[]?, A?];
export type Named = [first?: string | number, ...rest: (A | B)[]];
export {};
`);
  const graph = read(declarations);
  const text = printed(graph);
  assert.equal(text.Union, 'type Union = [(string | number)?];');
  assert.equal(text.Fn, 'type Fn = [(() => void)?, ...(string | number)[]];');
  assert.equal(text.Both, 'type Both = [(A & B)?];');
  assert.equal(text.Plain, 'type Plain = [string[]?, A?];');
  assert.equal(text.Named, 'type Named = [first?: string | number, ...rest: (A | B)[]];');
  const source = `${Object.values(text).join('\n')}\n`;
  const directory = mkdtempSync(join(tmpdir(), 'muxui-roundtrip-'));
  try {
    writeFileSync(join(directory, 'printed.d.ts'), source);
    for (const host of [typescript7Host, typescript6Host]) {
      assert.deepEqual(host.open({ directory, files: [join(directory, 'printed.d.ts')] }, (session) => session.diagnostics()), [], `${host.name} compiles what the printer wrote`);
    }
    // The bug this holds off: an unparenthesized union element is not valid TypeScript.
    writeFileSync(join(directory, 'broken.d.ts'), 'type Broken = [string | number?];\n');
    assert.notDeepEqual(typescript7Host.open({ directory, files: [join(directory, 'broken.d.ts')] }, (session) => session.diagnostics()), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// ---- what the reader refuses, by name -------------------------------------------------------------

const REFUSED = [
  ['an overloaded function', 'OVERLOAD', 'export declare function f(a: string): void;\nexport declare function f(a: number): void;'],
  ['merged interface declarations', 'MERGED', 'export interface M { a: string }\nexport interface M { b: string }'],
  ['a conditional type', 'UNSUPPORTED', 'export type C<T> = T extends string ? 1 : 2;'],
  ['an infer type', 'UNSUPPORTED', 'export type I<T> = T extends Array<infer U> ? U : never;'],
  ['a template literal type', 'UNSUPPORTED', 'export type T = `a${string}`;'],
  ['a bigint literal type', 'UNSUPPORTED', 'export type B = 1n;'],
  ['an enum', 'UNSUPPORTED', 'export declare enum E { A }'],
  ['a class', 'UNSUPPORTED', 'export declare class K {}'],
  ['a namespace', 'UNSUPPORTED', 'export declare namespace N { const a: string }'],
  ['a constructor type', 'UNSUPPORTED', 'export type Ctor = new () => object;'],
  ['a construct signature', 'UNSUPPORTED', 'export type S = { new (): object };'],
  ['an import type', 'UNSUPPORTED', "export type I = import('react').ReactNode;"],
  ['a unique symbol', 'UNSUPPORTED', 'export declare const u: unique symbol;'],
  ['a this type', 'UNSUPPORTED', 'export interface T { self(): this }'],
  ['an accessor member', 'UNSUPPORTED', 'export interface A { get x(): string }'],
  ['a computed member name', 'UNSUPPORTED', 'declare const key: unique symbol;\nexport type C = { [key]: string };\nexport {};'],
  ['a constant with no type annotation', 'UNSUPPORTED', 'export declare const k = 1;'],
  ['a nested React namespace', 'UNSUPPORTED', "import type * as React from 'react';\nexport type J = React.JSX.Element;"],
  ['a renamed React namespace', 'UNSUPPORTED', "import type * as R from 'react';\nexport type X = R.ReactNode;"],
  ['a name that does not resolve', 'DIAGNOSTICS', 'export type U = Missing;'],
  ['a module that is not installed', 'DIAGNOSTICS', "import type { Foo } from 'not-installed';\nexport type U = Foo;"],
  ['a syntax error', 'DIAGNOSTICS', 'export type = ;'],
  ['an implicit any', 'DIAGNOSTICS', 'export declare const k;'],
];

for (const [name, code, text] of REFUSED) {
  test(`refuses ${name} with ${code}`, () => rejection(single(text), code));
}

test('a refusal names the chain to the construct, and a diagnostic names its file relative to the package', () => {
  assert.throws(() => read(single('export type C<T> = T extends string ? 1 : 2;')), /MUXUI_REACT_REFERENCE_UNSUPPORTED: index#C: a ConditionalType type$/u);
  assert.throws(() => read(single('export type U = Missing;')), /MUXUI_REACT_REFERENCE_DIAGNOSTICS: program: 1 diagnostics, first: generated\/index\.d\.ts@\d+: TS2304: Cannot find name 'Missing'\.$/u);
});

const declare = (...declarations) => new Map(declarations.map((declaration) => [declaration.id, declaration]));
const member = (name, type, optional = false) => ({ member: 'property', name, optional, readonly: false, type });
const keyword = (name) => ({ kind: 'keyword', name });
const refTo = (id) => ({ kind: 'reference', id, name: id.split('#')[1] });
const expandFrom = (types, type) => createExpander(types).expand(type, 'test');
const refusal = (code) => (error) => error instanceof ReferenceReadError && error.code === `MUXUI_REACT_REFERENCE_${code}`;

test('props the reader cannot read exactly are refused: cycles, differing duplicates, unbound parameters, utility types', () => {
  const alias = (id, type) => ({ id, name: id.split('#')[1], kind: 'alias', type });
  assert.throws(() => expandFrom(declare(alias('x#A', refTo('x#B')), alias('x#B', refTo('x#A'))), refTo('x#A')), refusal('CYCLE'));
  const duplicate = { kind: 'intersection', members: [{ kind: 'object', members: [member('a', keyword('string'))] }, { kind: 'object', members: [member('a', keyword('number'))] }] };
  assert.throws(() => expandFrom(new Map(), duplicate), /UNSUPPORTED.*declares a twice, as string and number/u);
  assert.throws(() => expandFrom(new Map(), { kind: 'parameter', name: 'T' }), /UNSUPPORTED.*type parameter \(T\)/u);
  const host = (name, ...typeArguments) => ({ kind: 'host', name, origin: 'library', typeArguments });
  assert.throws(() => expandFrom(new Map(), host('Partial', { kind: 'object', members: [] })), /UNSUPPORTED.*Partial is a utility type/u);
  const arms = { kind: 'union', members: [{ kind: 'object', members: [member('a', keyword('string')), member('mode', { kind: 'literal', value: 'x' })] }, { kind: 'object', members: [member('b', keyword('string')), member('mode', { kind: 'literal', value: 'y' })] }] };
  assert.throws(() => expandFrom(new Map(), host('Omit', arms, { kind: 'literal', value: 'mode' })), /UNSUPPORTED.*Omit over 2 alternatives that still differ/u);
  assert.throws(() => expandFrom(new Map(), keyword('string')), /UNSUPPORTED.*keyword type where props are declared/u);
});

test('an export that resolves outside the package, React and the library is refused as ORIGIN', () => {
  const stub = Object.fromEntries(['diagnostics', 'sourceFile', 'exportsOf', 'resolve', 'kind', 'optional', 'hasModifier', 'defaultOf', 'operator', 'literalOf', 'doc', 'fileOf', 'startOf'].map((name) => [name, () => []]));
  const session = { ...stub, exportsOf: () => [{ name: 'Foreign', resolved: { kind: 'declared', name: 'Foreign', declarations: [{}], origin: 'other' } }] };
  assert.throws(() => readGraph(assertSession(session), [{ key: '.', path: 'x' }]), refusal('ORIGIN'));
});

// ---- the printer ----------------------------------------------------------------------------------

test('the printer parenthesizes exactly what the grammar needs', () => {
  const fn = { kind: 'function', parameters: [], returnType: keyword('void') };
  const union = { kind: 'union', members: [keyword('string'), keyword('number')] };
  const intersection = { kind: 'intersection', members: [refTo('x#A'), refTo('x#B')] };
  assert.equal(printType({ kind: 'array', element: union }), '(string | number)[]');
  assert.equal(printType({ kind: 'array', element: fn }), '(() => void)[]');
  assert.equal(printType({ kind: 'union', members: [fn, intersection] }), '(() => void) | (A & B)');
  assert.equal(printType({ kind: 'intersection', members: [union, refTo('x#C')] }), '(string | number) & C');
  assert.equal(printType({ kind: 'keyof', type: union }), 'keyof (string | number)');
  assert.equal(printType({ kind: 'readonly', type: { kind: 'array', element: keyword('string') } }), 'readonly string[]');
  assert.equal(printType({ kind: 'indexed', object: union, index: { kind: 'literal', value: 0 } }), '(string | number)[0]');
  assert.equal(printType({ kind: 'object', members: [] }), '{}');
});

// ---- ownership ------------------------------------------------------------------------------------

const ownershipEntries = [{ key: '.', exports: [{ name: 'Menu', value: 'menu#Menu' }, { name: 'MenuItemProps', type: 'menu#MenuItemProps' }, { name: 'CheckboxGroupProps', type: 'fields#CheckboxGroupProps' }, { name: 'ControlSize', type: 'fields#ControlSize' }, { name: 'SelectNativeProps', type: 'select-native#SelectNativeProps' }] }];
const ownershipFamilies = [
  { slug: 'menu', exportName: 'Menu', source: 'packages/react/src/menu.ts', module: '.' },
  { slug: 'checkbox', exportName: 'Checkbox', source: 'packages/react/src/fields.ts', module: '.' },
  { slug: 'checkbox-group', exportName: 'CheckboxGroup', source: 'packages/react/src/fields.ts', module: '.' },
  { slug: 'select-native', exportName: 'SelectNative', source: 'packages/react/src/supplemental/select-native.ts', module: '.' },
];
const ownershipSources = new Map([['menu', 'packages/react/src/menu.ts'], ['fields', 'packages/react/src/fields.ts'], ['select-native', 'packages/react/src/supplemental/select-native.ts']]);
const exceptionFor = { '.': { ControlSize: { owner: 'shared', reason: 'every field family uses it' } } };

test('ownership: a name, a file, the longest family prefix, then an explicit exception with its reason', () => {
  const owners = assignOwners({ entries: ownershipEntries, families: ownershipFamilies, sources: ownershipSources, exceptions: exceptionFor });
  const ownerOf = (name) => owners.get(`.\0${name}`);
  assert.deepEqual([ownerOf('Menu').owner, ownerOf('Menu').rule], ['menu', 'name']);
  assert.deepEqual([ownerOf('MenuItemProps').owner, ownerOf('MenuItemProps').rule], ['menu', 'file']);
  assert.deepEqual([ownerOf('CheckboxGroupProps').owner, ownerOf('CheckboxGroupProps').rule], ['checkbox-group', 'prefix'], 'the longest prefix is CheckboxGroup, not Checkbox');
  assert.deepEqual([ownerOf('ControlSize').owner, ownerOf('ControlSize').reason], ['shared', 'every field family uses it']);
});

test('ownership: an export no rule reaches, a stale exception, and a made-up owner all fail by name', () => {
  const owned = (exceptions, entries = ownershipEntries) => () => assignOwners({ entries, families: ownershipFamilies, sources: ownershipSources, exceptions });
  assert.throws(owned({}), /OWNERSHIP.*1 public exports have no owner.*\. ControlSize/u);
  assert.throws(owned({ '.': { ...exceptionFor['.'], Menu: { owner: 'shared', reason: 'x' } } }), /OWNERSHIP.*\. Menu: the exception is stale: the name rule already gives menu/u);
  assert.throws(owned({ '.': { ControlSize: { owner: 'nobody', reason: 'x' } } }), /OWNERSHIP.*names nobody, which is not a family/u);
  assert.throws(owned({ '.': { ...exceptionFor['.'], Gone: { owner: 'shared', reason: 'x' } } }), /OWNERSHIP.*exceptions for exports that no longer exist: \. Gone/u);
});

// ---- the compiler host ----------------------------------------------------------------------------

test('the production host is TypeScript 7 at the exact version the manifest pins, and the test host is TypeScript 6', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
  assert.match(manifest.devDependencies.typescript, /^\d+\.\d+\.\d+$/u, 'the unstable API is pinned exactly');
  assert.equal(typescript7Host.version, manifest.devDependencies.typescript);
  assert.match(typescript7Host.version, /^7\./u);
  assert.match(typescript6Host.version, /^6\./u);
});

test('a host that lacks part of the contract is refused', () => {
  assert.throws(() => assertSession({ diagnostics: () => [] }), /MUXUI_REACT_REFERENCE_HOST: the session lacks sourceFile/u);
});

test('the compiler session closes and the scratch directories go when reading succeeds and when it fails', () => {
  const closes = [];
  const close = API.prototype.close;
  API.prototype.close = function observed() {
    closes.push(this);
    return close.call(this);
  };
  // Test files run side by side and the others read declarations too, so this one watches a temporary directory of its own.
  const outer = process.env.TMPDIR;
  const own = mkdtempSync(join(tmpdir(), 'muxui-scratch-watch-'));
  process.env.TMPDIR = own;
  try {
    read(CONFORMANCE);
    assert.equal(closes.length, 1);
    assert.throws(() => read(single('export type C<T> = T extends string ? 1 : 2;')));
    assert.equal(closes.length, 2, 'a refusal closes the session too');
    let during = 0;
    assert.throws(() => typescript7Host.open({ directory: own, files: [] }, () => { during = readdirSync(own).length; throw new Error('inside'); }), /inside/u);
    assert.equal(closes.length, 3);
    assert.ok(during > 0, 'the host did make a scratch directory');
    assert.deepEqual(readdirSync(own), [], 'no scratch directory is left behind');
  } finally {
    API.prototype.close = close;
    if (outer === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = outer;
    rmSync(own, { recursive: true, force: true });
  }
});

// ---- the same bytes under both compilers ----------------------------------------------------------

const serialize = ({ inventory, files }) => [formatJson(inventory), ...[...files].map(([name, file]) => `${name}\n${formatJson(file)}`)].join('\n');

test('TypeScript 7 and TypeScript 6 read the synthetic declarations to the same graph and the same model', () => {
  assert.equal(JSON.stringify(read(CONFORMANCE, typescript7Host)), JSON.stringify(read(CONFORMANCE, typescript6Host)));
  assert.equal(serialize(conformanceModel(typescript7Host)), serialize(conformanceModel(typescript6Host)));
});

test('TypeScript 7 and TypeScript 6 read the shipped declarations to the same graph and the same model', () => {
  const inputs = realInputs();
  const at7 = readReference({ ...inputs, host: typescript7Host });
  const at6 = readReference({ ...inputs, host: typescript6Host });
  assert.equal(serialize(at7), serialize(at6));
  assert.equal(JSON.stringify(readDeclarationGraph({ ...inputs, host: typescript7Host })), JSON.stringify(readDeclarationGraph({ ...inputs, host: typescript6Host })));
  assert.ok(at7.files.size > 80, 'every family and the shared owners');
});

test('the model holds no absolute path, no scratch directory and no compiler version, and reads the same twice', () => {
  const inputs = realInputs();
  const first = serialize(readReference(inputs));
  assert.equal(serialize(readReference(inputs)), first);
  assert.doesNotMatch(first, /\/(?:Users|home|private|var|tmp)\/|muxui-reference-|node_modules|typescript/u);
});
