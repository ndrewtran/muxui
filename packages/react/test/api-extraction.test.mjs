import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { deriveApis, syncDerivedApis, withDerivedApi } from '../api-extraction/derived-apis.mjs';
import { ApiExtractionError, HOST_ALLOWLIST, extractApis, hostEntryKey } from '../api-extraction/extract.mjs';

// Synthetic fixtures for the closed grammar (Decision 0031 item 3). They sit under the
// package's ignored build/ directory so `react` resolves to the package's own types.
const packageRoot = resolve(import.meta.dirname, '..');

const header = "import type * as React from 'react';\n";
const ownProps = (members, extra = '') => `${header}${extra}
export interface ThingOwnProps {
${members}
}
export interface ThingProps extends ThingOwnProps, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  children?: React.ReactNode;
}
export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLButtonElement>>;
`;

function extract({ declarations, source, hostAllowlist, files = {}, part }) {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'api-extraction-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    writeFileSync(join(root, 'thing.d.ts'), declarations);
    if (source !== undefined) writeFileSync(join(root, 'thing.ts'), source);
    const component = { name: 'Thing', ...(part === undefined ? {} : { part }), declarations: join(root, 'thing.d.ts'), ...(source === undefined ? {} : { source: join(root, 'thing.ts') }) };
    return extractApis({ declarationRoot: root, components: [component], ...(hostAllowlist ? { hostAllowlist } : {}) }).get('Thing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function rejects(declarations, pattern, options = {}) {
  assert.throws(() => extract({ declarations, ...options }), (error) => {
    assert.ok(error instanceof ApiExtractionError, error.stack);
    assert.match(error.message, pattern);
    return true;
  });
}

const event = `/** What an activation reports. */
export interface ThingEvent {
  readonly type: 'activate';
  readonly pointer: ThingPointer;
  readonly target: HTMLButtonElement;
}
export type ThingPointer = 'mouse' | 'pen' | undefined;
`;

test('the grammar reads literals, unions in source order, arrays, callbacks, objects, and named types', () => {
  const api = extract({
    declarations: ownProps(`  /** The visual recipe. */
  variant?: 'primary' | 'neutral';
  size?: 'md' | 'sm' | 'lg';
  label: string;
  count?: number;
  level?: 1 | -2;
  flag?: boolean;
  tags?: readonly string[];
  ids?: number[];
  note?: string | null;
  meta?: { readonly id: string; hint?: string };
  onActivate?: (event: ThingEvent) => void;
  onValueChange?: (value: string, previous?: string) => void;`, event),
  });
  assert.deepEqual(api, {
    props: ['variant', 'size', 'label', 'count', 'level', 'flag', 'tags', 'ids', 'note', 'meta'],
    events: ['activate', 'valueChange'],
    propDetails: {
      variant: {
        type: { kind: 'union', members: [{ kind: 'literal', value: 'primary' }, { kind: 'literal', value: 'neutral' }] },
        required: false,
        enum: ['primary', 'neutral'],
        description: 'The visual recipe.',
      },
      // Source order, not the checker's type-id order.
      size: {
        type: { kind: 'union', members: [{ kind: 'literal', value: 'md' }, { kind: 'literal', value: 'sm' }, { kind: 'literal', value: 'lg' }] },
        required: false,
        enum: ['md', 'sm', 'lg'],
      },
      label: { type: { kind: 'string' }, required: true },
      count: { type: { kind: 'number' }, required: false },
      level: { type: { kind: 'union', members: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: -2 }] }, required: false, enum: [1, -2] },
      flag: { type: { kind: 'boolean' }, required: false },
      tags: { type: { kind: 'array', element: { kind: 'string' }, readonly: true }, required: false },
      ids: { type: { kind: 'array', element: { kind: 'number' }, readonly: false }, required: false },
      note: { type: { kind: 'union', members: [{ kind: 'string' }, { kind: 'null' }] }, required: false },
      meta: {
        type: {
          kind: 'object',
          members: [
            { name: 'id', type: { kind: 'string' }, required: true, readonly: true },
            { name: 'hint', type: { kind: 'string' }, required: false, readonly: false },
          ],
        },
        required: false,
      },
    },
    eventDetails: {
      activate: {
        prop: 'onActivate',
        type: { kind: 'function', parameters: [{ name: 'event', type: { kind: 'reference', name: 'ThingEvent' }, required: true }], returns: { kind: 'void' } },
        required: false,
      },
      valueChange: {
        prop: 'onValueChange',
        type: {
          kind: 'function',
          parameters: [{ name: 'value', type: { kind: 'string' }, required: true }, { name: 'previous', type: { kind: 'string' }, required: false }],
          returns: { kind: 'void' },
        },
        required: false,
      },
    },
    types: {
      ThingEvent: {
        type: {
          kind: 'object',
          members: [
            { name: 'type', type: { kind: 'literal', value: 'activate' }, required: true, readonly: true },
            { name: 'pointer', type: { kind: 'reference', name: 'ThingPointer' }, required: true, readonly: true },
            { name: 'target', type: { kind: 'host', name: 'HTMLButtonElement' }, required: true, readonly: true },
          ],
        },
        description: 'What an activation reports.',
      },
      ThingPointer: {
        type: { kind: 'union', members: [{ kind: 'literal', value: 'mouse' }, { kind: 'literal', value: 'pen' }, { kind: 'undefined' }] },
      },
    },
  });
  // Only ThingOwnProps is read: the host passthrough in ThingProps (children and the HTML attributes) is not.
  assert.equal(api.props.includes('children') || api.props.includes('onClick'), false);
});

test('a named type is recorded by its full definition, so a change inside it changes the block', () => {
  const before = extract({ declarations: ownProps('  onActivate?: (event: ThingEvent) => void;', event) });
  const after = extract({ declarations: ownProps('  onActivate?: (event: ThingEvent) => void;', event.replace("'mouse' | 'pen'", "'mouse' | 'touch'")) });
  assert.deepEqual(after.eventDetails, before.eventDetails, 'the prop still names the same type');
  assert.notDeepEqual(after.types, before.types);
  assert.deepEqual(after.types.ThingPointer.type.members.map(({ value }) => value), ['mouse', 'touch', undefined]);
});

test('every construct outside the grammar fails with the component, prop, and reference chain', () => {
  const cases = [
    ['  bad?: any;', '', /Thing\.bad: any is not in the grammar/u],
    ['  bad?: unknown;', '', /Thing\.bad: unknown is not in the grammar/u],
    // An application of a host generic is read only when it is an exact allowlist entry.
    ['  bad?: Array<string>;', '', /Thing\.bad -> Array: Array<string> is not an application on the host allowlist/u],
    ['  onBad?: <T>(value: T) => void;', '', /Thing\.onBad: a generic function is not in the grammar/u],
    ['  bad?: Box;', 'export type Box<T = string> = { value: T };\n', /Thing\.bad -> Box: Box is generic/u],
    ["  bad?: string extends number ? 'a' : 'b';", '', /Thing\.bad: a conditional type is not in the grammar/u],
    ["  bad?: { [K in 'a' | 'b']: string };", '', /Thing\.bad: a mapped type is not in the grammar/u],
    ["  bad?: ThingEvent['type'];", event, /Thing\.bad: an indexed access type is not in the grammar/u],
    ["  bad?: `size-${'sm' | 'md'}`;", '', /Thing\.bad: a template literal type is not in the grammar/u],
    ['  bad?: typeof value;', 'export declare const value: string;\n', /Thing\.bad: a typeof type is not in the grammar/u],
    ['  bad?: Mode;', 'export declare enum Mode { A = 0, B = 1 }\n', /Thing\.bad -> Mode: Mode is an enum/u],
    ['  bad?: { id: string } & { name: string };', '', /Thing\.bad: an intersection type is not in the grammar/u],
    ['  bad?: [string, number];', '', /Thing\.bad: a tuple type is not in the grammar/u],
    ['  bad?: { read(): string };', '', /Thing\.bad\.read: only property signatures are in the grammar/u],
    ['  bad?: keyof ThingEvent;', event, /Thing\.bad: a type operator other than readonly T\[\] is not in the grammar/u],
    ['  bad?: React.CSSProperties;', '', /Thing\.bad -> React\.CSSProperties: React\.CSSProperties is outside @muxui\/react and not in the host allowlist/u],
    // A dependency reached through a Mux UI-owned type is rejected too, naming the whole chain.
    ['  onActivate?: (event: Wrapped) => void;', 'export interface Wrapped { readonly style: React.CSSProperties; }\n',
      /Thing\.onActivate\(event\) -> Wrapped\.style -> React\.CSSProperties: React\.CSSProperties is outside @muxui\/react/u],
    ['  onActivate?: string;', '', /Thing\.onActivate: an on<Event> prop must be a function type/u],
    ['  onBad?: (this: HTMLButtonElement, value: string) => void;', '', /Thing\.onBad\(this\): a this parameter is not in the grammar/u],
  ];
  for (const [members, extra, pattern] of cases) rejects(ownProps(members, extra), pattern);
  // A second, merged declaration would add members the first one does not show.
  rejects(`${ownProps('  size?: string;')}export interface ThingOwnProps { bad?: any; }\n`, /Thing: ThingOwnProps has 2 declarations; declaration merging is not in the grammar/u);
  rejects(`${header}export interface OtherOwnProps { size?: string; }\n`, /Thing: the declarations do not declare ThingOwnProps/u);
  rejects(ownProps('  size?: string;').replace('export interface ThingOwnProps {', 'export interface Base { id?: string; }\nexport interface ThingOwnProps extends Base {'),
    /Thing: ThingOwnProps extends another type/u);
});

test('the exported component\'s props type must carry each ThingOwnProps member unchanged', () => {
  const members = "  variant?: 'primary' | 'neutral';\n  size?: 'sm' | 'md';";
  const publicType = (redeclared) => ownProps(members).replace('  children?: React.ReactNode;\n', `  children?: React.ReactNode;\n${redeclared}\n`);
  // A redeclaration written the same way is the same type.
  assert.deepEqual(extract({ declarations: publicType("  variant?: 'primary' | 'neutral';") }).props, ['variant', 'size']);
  rejects(publicType("  variant: 'primary' | 'neutral';"),
    /Thing\.variant: the exported Thing's props redeclare variant as required "neutral" \| "primary"; ThingOwnProps declares optional "neutral" \| "primary" \| undefined/u);
  rejects(publicType("  variant?: 'primary';"), /Thing\.variant: the exported Thing's props redeclare variant as optional "primary" \| undefined/u);
  rejects(ownProps(members).replace('extends ThingOwnProps,', "extends Omit<ThingOwnProps, 'size'>,"), /Thing\.size: the exported Thing's props do not include size/u);
  rejects(ownProps(members).replace(/export declare const Thing[^\n]*\n/u, ''), /Thing: the declarations export no Thing/u);
});

test('two distinct Mux UI-owned types may not share a name, even while one is being read', () => {
  // The outer Node is still pending when its member reaches the other module's Node.
  const declarations = ownProps('  tree?: Node;', "import type { Node as OtherNode } from './other.js';\nexport interface Node { next?: OtherNode; self?: Node; }\n");
  const other = "import type * as React from 'react';\nexport interface Node { readonly style: React.CSSProperties; }\n";
  assert.throws(() => extract({ declarations, files: { 'other.d.ts': other } }), /Thing\.tree -> Node\.next -> OtherNode: two Mux UI-owned types are named Node/u);
});

test('the host allowlist is exact: a namespace or wildcard entry is too broad, and one entry admits one type', () => {
  for (const entry of ['React', 'React.*', 'HTML*', '*', 'react.ReactNode']) {
    rejects(ownProps('  label?: React.ReactNode;'), /host allowlist: .* is too broad/u, { hostAllowlist: [entry] });
  }
  const label = extract({ declarations: ownProps('  label?: React.ReactNode;'), hostAllowlist: ['React.ReactNode'] });
  assert.deepEqual(label.propDetails.label.type, { kind: 'host', name: 'React.ReactNode' });
  rejects(ownProps('  label?: React.ReactNode;\n  element?: React.ReactElement;'), /Thing\.element -> React\.ReactElement: .*not in the host allowlist/u, { hostAllowlist: ['React.ReactNode'] });
  // An allowlisted host type with type arguments is a different type: only an exact application is admitted.
  rejects(ownProps('  anchor?: React.RefObject<HTMLElement>;'), /Thing\.anchor -> React\.RefObject: React\.RefObject<HTMLElement> is not an application on the host allowlist/u, { hostAllowlist: ['React.RefObject', 'HTMLElement'] });
});

test('a DOM or Intl type is admitted by its exact allowlist entry alone', () => {
  // Link's activation target and Meter's format options, the entries tranche 3 adds.
  const allowlist = ['HTMLAnchorElement', 'NumberFormatOptions'];
  const anchorEvent = event.replace('HTMLButtonElement', 'HTMLAnchorElement');
  const api = extract({
    declarations: ownProps('  formatOptions?: Intl.NumberFormatOptions;\n  onActivate?: (event: ThingEvent) => void;', anchorEvent),
    hostAllowlist: allowlist,
  });
  assert.deepEqual(api.propDetails.formatOptions.type, { kind: 'host', name: 'NumberFormatOptions' });
  assert.deepEqual(api.types.ThingEvent.type.members.find(({ name }) => name === 'target').type, { kind: 'host', name: 'HTMLAnchorElement' });
  // One entry admits one type: a sibling DOM element, a sibling Intl option bag, and a generic reference stay out.
  rejects(ownProps('  anchor?: HTMLElement;'), /Thing\.anchor -> HTMLElement: HTMLElement is outside @muxui\/react and not in the host allowlist/u, { hostAllowlist: allowlist });
  rejects(ownProps('  dates?: Intl.DateTimeFormatOptions;'), /Thing\.dates -> Intl\.DateTimeFormatOptions: DateTimeFormatOptions is outside @muxui\/react and not in the host allowlist/u, { hostAllowlist: allowlist });
  rejects(ownProps('  onActivate?: (event: ThingEvent) => void;', event), /Thing\.onActivate\(event\) -> ThingEvent\.target -> HTMLButtonElement: HTMLButtonElement is outside @muxui\/react and not in the host allowlist/u, { hostAllowlist: allowlist });
});

// The applications of host generics the overlays use (Decision 0031 E2), written as they serialize.
const host = (name, ...typeArguments) => ({ kind: 'host', name, ...(typeArguments.length > 0 ? { typeArguments } : {}) });
const keyword = (kind) => ({ kind });
const E2_ALLOWLIST = Object.freeze([
  'React.ReactNode',
  'React.ReactElement',
  'File',
  host('Exclude', host('React.ReactNode'), { kind: 'union', members: [keyword('null'), keyword('undefined'), keyword('boolean')] }),
  host('Promise', host('File')),
  host('Promise', keyword('string')),
  host('ReadonlySet', keyword('string')),
  host('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }),
]);

const dropItem = `export interface MuxUIDropItem {
  readonly kind: 'directory';
  readonly getFile?: () => Promise<File>;
  readonly getEntries?: () => AsyncIterable<MuxUIDropItem>;
}
export interface MuxUIFileDropItem { readonly kind: 'file'; }
`;

test('an exact host application is serialized with its arguments, and a Mux UI-owned argument is recorded', () => {
  const api = extract({
    declarations: ownProps(`  title?: Exclude<React.ReactNode, null | undefined | boolean>;
  trigger?: React.ReactElement;
  files?: File[];
  text?: Promise<string>;
  types?: ReadonlySet<string>;
  items?: AsyncIterable<MuxUIDropItem>;`, dropItem),
    hostAllowlist: E2_ALLOWLIST,
  });
  const types = Object.fromEntries(Object.entries(api.propDetails).map(([prop, { type }]) => [prop, type]));
  assert.deepEqual(types, {
    title: host('Exclude', host('React.ReactNode'), { kind: 'union', members: [keyword('null'), keyword('undefined'), keyword('boolean')] }),
    trigger: host('React.ReactElement'),
    files: { kind: 'array', element: host('File'), readonly: false },
    text: host('Promise', keyword('string')),
    types: host('ReadonlySet', keyword('string')),
    items: host('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }),
  });
  // The Mux UI-owned argument's definition enters types, and its own host applications are read the same way.
  assert.deepEqual(Object.keys(api.types), ['MuxUIDropItem']);
  const members = Object.fromEntries(api.types.MuxUIDropItem.type.members.map(({ name, type }) => [name, type]));
  assert.deepEqual(members.getFile, { kind: 'function', parameters: [], returns: host('Promise', host('File')) });
  assert.deepEqual(members.getEntries, { kind: 'function', parameters: [], returns: host('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }) });
});

test('an allowlist entry is a bare name or an exact application, and nothing broader', () => {
  const entries = [
    // A namespace or a wildcard, as a name or as the head of an application.
    [{ kind: 'host', name: 'React', typeArguments: [keyword('string')] }, /too broad/u],
    [{ kind: 'host', name: 'Prom*se', typeArguments: [keyword('string')] }, /too broad/u],
    [{ kind: 'host', name: 'promise', typeArguments: [keyword('string')] }, /too broad/u],
    // No arguments is the bare name, which is written as a string.
    [{ kind: 'host', name: 'Promise', typeArguments: [] }, /has no type arguments; write the bare name as a string/u],
    [{ kind: 'host', name: 'Promise', typeArguments: keyword('string') }, /has no type arguments/u],
    [{ kind: 'host', name: 'Promise' }, /is not written as exactly kind, name, typeArguments/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [keyword('string')], extra: true }, /is not written as exactly kind, name, typeArguments/u],
    // Arguments are serialized types of the closed few, each with no key beyond its form.
    [{ kind: 'host', name: 'Promise', typeArguments: ['string'] }, /has a type argument that is not a serialized type/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'array', element: keyword('string'), readonly: false }] }, /has a "array" type argument/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'string', extra: 1 }] }, /holds a string type that is not written as exactly kind/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'reference', name: 'muxui*' }] }, /does not name one Mux UI-owned type/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'host', name: 'File*' }] }, /too broad/u],
    [{ kind: 'host', name: 'Promise', typeArguments: [{ kind: 'union', members: [keyword('string')] }] }, /a union with fewer than two members/u],
    [{ kind: 'union', members: [keyword('string'), keyword('number')] }, /is not a name or an exact application of a host type/u],
    [null, /is not a name or an exact application of a host type/u],
  ];
  for (const [entry, pattern] of entries) rejects(ownProps('  label?: string;'), pattern, { hostAllowlist: [entry] });
  // A valid application does not widen the bare name: Promise<string> admits no plain Promise.
  rejects(ownProps('  pending?: Promise;'), /Thing\.pending -> Promise: Promise is outside @muxui\/react and not in the host allowlist/u, { hostAllowlist: [host('Promise', keyword('string'))] });
});

test('only an application equal to an allowlist entry, arguments in order, is admitted', () => {
  const cases = [
    // An argument, or the application, that is not on the list.
    ['  bad?: Promise<number>;', '', /Thing\.bad -> Promise: Promise<number> is not an application on the host allowlist/u],
    ['  bad?: Record<string, string>;', '', /Thing\.bad -> Record: Record<string, string> is not an application on the host allowlist/u],
    ['  bad?: Omit<MuxUIFileDropItem, \'kind\'>;', dropItem, /Thing\.bad -> Omit: Omit<MuxUIFileDropItem, "kind"> is not an application on the host allowlist/u],
    ['  bad?: Promise<Promise<File>>;', '', /Thing\.bad -> Promise: Promise<Promise<File>> is not an application on the host allowlist/u],
    ['  bad?: Promise<Date>;', '', /Thing\.bad -> Promise<0> -> Date: Date is outside @muxui\/react and not in the host allowlist/u],
    // Wrong arity.
    ['  bad?: Promise<File, string>;', '', /Thing\.bad -> Promise: Promise<File, string> is not an application on the host allowlist/u],
    // A narrower excluded set, and the same members reordered, are other types.
    ['  bad?: Exclude<React.ReactNode, null>;', '', /Thing\.bad -> Exclude: Exclude<React\.ReactNode, null> is not an application on the host allowlist/u],
    ['  bad?: Exclude<React.ReactNode, boolean | null | undefined>;', '', /Thing\.bad -> Exclude: Exclude<React\.ReactNode, boolean \| null \| undefined> is not an application/u],
    ['  bad?: Exclude<React.ReactNode, null | undefined | boolean | string>;', '', /Thing\.bad -> Exclude: .* is not an application on the host allowlist/u],
    // A plain-only entry takes no arguments.
    ['  bad?: React.ReactElement<{ a: string }>;', '', /Thing\.bad -> React\.ReactElement: React\.ReactElement<object> is not an application on the host allowlist/u],
    ['  bad?: File<string>;', '', /Thing\.bad -> File: File<string> is not an application on the host allowlist/u],
    // A Mux UI-owned argument that is not the pinned one.
    ['  bad?: AsyncIterable<MuxUIFileDropItem>;', dropItem, /Thing\.bad -> AsyncIterable: AsyncIterable<MuxUIFileDropItem> is not an application on the host allowlist/u],
    // The grammar still decides every argument.
    ['  bad?: Promise<string extends number ? File : File>;', '', /Thing\.bad -> Promise<0>: a conditional type is not in the grammar/u],
    ['  bad?: Promise<any>;', '', /Thing\.bad -> Promise<0>: any is not in the grammar/u],
    // A ref is not catalog data.
    ['  bad?: React.RefObject<Element | null>;', '', /Thing\.bad -> React\.RefObject<0> -> Element: Element is outside @muxui\/react and not in the host allowlist/u],
    ['  bad?: React.Ref<HTMLButtonElement>;', '', /Thing\.bad -> React\.Ref<0> -> HTMLButtonElement: HTMLButtonElement is outside/u],
  ];
  for (const [members, extra, pattern] of cases) rejects(ownProps(members, extra), pattern, { hostAllowlist: E2_ALLOWLIST });
  // Each entry on its own admits exactly its application: removing it rejects the same source.
  const source = ownProps('  text?: Promise<string>;');
  assert.deepEqual(extract({ declarations: source, hostAllowlist: [host('Promise', keyword('string'))] }).propDetails.text.type, host('Promise', keyword('string')));
  rejects(source, /Thing\.text -> Promise: Promise<string> is not an application/u, { hostAllowlist: [host('Promise', host('File')), 'File'] });
});

test('a Mux UI-owned type that shadows a host name or an argument is never the host type', () => {
  // A local Promise is Mux UI-owned, so it takes no type arguments, whatever it is named.
  rejects(ownProps('  bad?: Promise<File>;', 'export interface Promise<T> { readonly value: T }\n'),
    /Thing\.bad -> Promise: Promise is a Mux UI-owned type; it takes no type arguments/u, { hostAllowlist: E2_ALLOWLIST });
  // A local File inside the real Promise serializes as a Mux UI-owned reference, not the host File.
  rejects(ownProps('  bad?: Promise<File>;', 'export interface File { readonly name: string }\n'),
    /Thing\.bad -> Promise: Promise<File> is not an application on the host allowlist/u, { hostAllowlist: E2_ALLOWLIST });
  // The same name is still a plain reference to the Mux UI-owned type.
  const local = extract({ declarations: ownProps('  chosen?: File;', 'export interface File { readonly name: string }\n'), hostAllowlist: E2_ALLOWLIST });
  assert.deepEqual(local.propDetails.chosen.type, { kind: 'reference', name: 'File' });
});

test('a host type merged with a package declaration is no host type: declare global and module augmentation fail', () => {
  const global = "declare global { interface File { readonly extra: string } }\nexport {};\n";
  const bare = ownProps('  chosen?: File;', global);
  const applied = ownProps('  pending?: Promise<File>;', global);
  const merged = /also has a declaration in @muxui\/react \(a global augmentation or merged declaration\)/u;
  rejects(bare, new RegExp(`Thing\\.chosen -> File: File ${merged.source}`, 'u'), { hostAllowlist: E2_ALLOWLIST });
  rejects(applied, new RegExp(`Thing\\.pending -> Promise<0> -> File: File ${merged.source}`, 'u'), { hostAllowlist: E2_ALLOWLIST });
  // Augmenting the react module merges into @types/react's ReactElement the same way.
  rejects(ownProps('  trigger?: React.ReactElement;', "declare module 'react' { interface ReactElement { readonly extra: string } }\n"),
    new RegExp(`Thing\\.trigger -> React\\.ReactElement: ReactElement ${merged.source}`, 'u'), { hostAllowlist: E2_ALLOWLIST });
  // Without the augmentation the same sources extract.
  assert.deepEqual(extract({ declarations: ownProps('  chosen?: File;'), hostAllowlist: E2_ALLOWLIST }).propDetails.chosen.type, host('File'));
});

/**
 * Every host type a derived type reaches, as its allowlist key: a bare host type by name, an
 * application as its serialized form. An application's arguments are reached too.
 */
function hostTypes(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => hostTypes(item, found));
  else if (value !== null && typeof value === 'object') {
    if (value.kind === 'host') found.add(hostEntryKey(value.typeArguments === undefined ? value.name : value));
    Object.values(value).forEach((item) => hostTypes(item, found));
  }
  return found;
}

// The input props a field owns, in the order FieldInputProps omits them, and the entries built on them.
const OWNED_INPUT_PROPS = ['children', 'dangerouslySetInnerHTML', 'slot', 'type', 'id', 'name', 'value', 'defaultValue', 'checked', 'defaultChecked', 'disabled', 'readOnly', 'required', 'onChange', 'onInput', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-disabled', 'aria-readonly'];
const INPUT_ATTRIBUTES = host('React.InputHTMLAttributes', host('HTMLInputElement'));
const omitted = (names) => host('Omit', INPUT_ATTRIBUTES, { kind: 'union', members: names.map((value) => ({ kind: 'literal', value })) });
const OMITTED_INPUT_ATTRIBUTES = omitted(OWNED_INPUT_PROPS);

test('the shipped allowlist holds exactly the host types the committed derived APIs reach', () => {
  const reached = new Map();
  for (const file of readdirSync(resolve(packageRoot, 'api'))) {
    for (const name of hostTypes(JSON.parse(readFileSync(resolve(packageRoot, 'api', file), 'utf8')).api)) {
      reached.set(name, [...(reached.get(name) ?? []), file]);
    }
  }
  assert.deepEqual([...reached.keys()].sort(), HOST_ALLOWLIST.map(hostEntryKey).sort());
  // Each entry, and the components that need it.
  assert.deepEqual(reached.get('HTMLButtonElement'), ['button.json', 'icon-button.json', 'toggle-button.json'], 'the activation event target');
  assert.deepEqual(reached.get('React.ReactNode'), ['activity.json', 'autocomplete.json', 'breadcrumbs.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'disclosure.json', 'lightbox.json', 'markdown.json', 'message.json', 'meter.json', 'number-field.json', 'progress-bar.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'select-native.json', 'slider.json', 'switch.json', 'text-field.json', 'time-field.json', 'toast.json', 'tooltip.json'], 'caller-supplied content, and the node an Exclude starts from');
  assert.deepEqual(reached.get('React.ReactElement'), ['dialog.json', 'popover.json', 'preview-trigger.json', 'tooltip.json'], 'the element a trigger prop takes');
  assert.deepEqual(reached.get(hostEntryKey(host('Exclude', host('React.ReactNode'), { kind: 'union', members: [keyword('null'), keyword('undefined'), keyword('boolean')] }))), ['autocomplete.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'number-field.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'slider.json', 'switch.json', 'text-field.json', 'time-field.json', 'toast.json', 'tooltip.json'], 'content that renders something');
  assert.deepEqual(reached.get('HTMLAnchorElement'), ['link.json'], 'the activation event target of Link');
  assert.deepEqual(reached.get('NumberFormatOptions'), ['meter.json', 'number-field.json'], 'the formatOptions of Meter and NumberField, written Intl.NumberFormatOptions');
  assert.deepEqual(reached.get('File'), ['drop-zone.json', 'file-trigger.json'], 'the files FileTrigger selects, and the File a DropZone item reads');
  // The input attributes TextField's and SearchField's inputProps take, as FieldInputProps omits them: the element, its attributes, and the Omit of those.
  assert.deepEqual(reached.get('HTMLInputElement'), ['search-field.json', 'text-field.json'], 'the element whose attributes inputProps takes');
  assert.deepEqual(reached.get(hostEntryKey(INPUT_ATTRIBUTES)), ['search-field.json', 'text-field.json'], 'the attributes of the inner input');
  assert.deepEqual(reached.get(hostEntryKey(OMITTED_INPUT_ATTRIBUTES)), ['search-field.json', 'text-field.json'], 'the inner input\'s attributes less the 23 the field owns');
  // DropZone's drop items: a file item reads a File or its text, a text item lists its formats, a directory its entries.
  const dropItems = [
    [host('Promise', host('File')), 'a file item\'s read'],
    [host('Promise', keyword('string')), 'a file or text item\'s text'],
    [host('ReadonlySet', keyword('string')), 'the formats a text item lists'],
    [host('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }), 'a directory item\'s entries'],
  ];
  for (const [entry, reason] of dropItems) assert.deepEqual(reached.get(hostEntryKey(entry)), ['drop-zone.json'], reason);
});

const omitInputAttributes = (names, element = 'HTMLInputElement') => `Omit<React.InputHTMLAttributes<${element}>, ${names.map((name) => `'${name}'`).join(' | ')}>`;

test('inputProps admits the exact Omit of the input\'s attributes and nothing near it', () => {
  // The exact Omit extracts, and so does the bare attributes application: it is an entry in its own right, because every argument must be listed.
  const exact = extract({ declarations: ownProps(`  inputProps?: ${omitInputAttributes(OWNED_INPUT_PROPS)};\n  attributes?: React.InputHTMLAttributes<HTMLInputElement>;`) });
  assert.deepEqual(exact.propDetails.inputProps.type, OMITTED_INPUT_ATTRIBUTES);
  assert.deepEqual(exact.propDetails.attributes.type, INPUT_ATTRIBUTES);
  // A narrower omission, one member missing, another order, another element, and other utility types are other types.
  const near = [
    ['a narrower omission', omitInputAttributes(['children']), /Thing\.bad -> Omit: Omit<React\.InputHTMLAttributes<HTMLInputElement>, "children"> is not an application on the host allowlist/u],
    ['one member missing', omitInputAttributes(OWNED_INPUT_PROPS.slice(0, -1)), /Thing\.bad -> Omit: Omit<.*"aria-disabled"> is not an application on the host allowlist/u],
    ['the same members reversed', omitInputAttributes([...OWNED_INPUT_PROPS].reverse()), /Thing\.bad -> Omit: Omit<.*"children"> is not an application on the host allowlist/u],
    ['another element', omitInputAttributes(OWNED_INPUT_PROPS, 'HTMLTextAreaElement'), /Thing\.bad -> Omit<0> -> React\.InputHTMLAttributes<0> -> HTMLTextAreaElement: HTMLTextAreaElement is outside @muxui\/react and not in the host allowlist/u],
    ['a Pick', 'Pick<React.InputHTMLAttributes<HTMLInputElement>, \'placeholder\'>', /Thing\.bad -> Pick: Pick<React\.InputHTMLAttributes<HTMLInputElement>, "placeholder"> is not an application on the host allowlist/u],
    ['a Partial of the Omit', `Partial<${omitInputAttributes(OWNED_INPUT_PROPS)}>`, /Thing\.bad -> Partial: Partial<Omit<.*>> is not an application on the host allowlist/u],
  ];
  for (const [reason, type, pattern] of near) {
    assert.throws(() => extract({ declarations: ownProps(`  bad?: ${type};`) }), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, pattern, reason);
      return true;
    }, reason);
  }
});

test('the input props the runtime strips are the ones FieldInputProps omits and the allowlist admits', () => {
  // fields.ts strips them from inputProps at run time (less ref, which is not an input attribute), FieldInputProps omits
  // them in its declaration, and the allowlist admits exactly that Omit; the grammar cannot read an Omit's keys,
  // so this ties the three.
  const source = readFileSync(resolve(packageRoot, 'src/fields.ts'), 'utf8');
  const stripped = [...(/const FIELD_INPUT_PROTECTED_PROPS = new Set<string>\(\[([^\]]*)\]\)/u.exec(source)?.[1] ?? '').matchAll(/'([^']+)'/gu)].map(([, name]) => name);
  assert.equal(stripped[0], 'ref');
  assert.deepEqual(stripped.slice(1), OWNED_INPUT_PROPS);
  const entry = HOST_ALLOWLIST.find((candidate) => typeof candidate === 'object' && candidate.name === 'Omit' && hostEntryKey(candidate.typeArguments[0]) === hostEntryKey(INPUT_ATTRIBUTES));
  assert.deepEqual(entry.typeArguments[1].members.map(({ value }) => value), OWNED_INPUT_PROPS);
  for (const slug of ['text-field', 'search-field']) {
    const { api } = JSON.parse(readFileSync(resolve(packageRoot, 'api', `${slug}.json`), 'utf8'));
    assert.deepEqual(api.types.FieldInputProps.type, OMITTED_INPUT_ATTRIBUTES, `${slug} inputProps`);
  }
});

test('defaults come from the executable source: literals and top-level constants the component reads', () => {
  const declarations = ownProps(`  variant?: 'primary' | 'neutral';
  size?: 'sm' | 'md';
  count?: number;
  tags?: readonly string[];
  pending?: boolean;
  onActivate?: () => void;`);
  const source = (variantDefault = "'primary'", before = '') => `import { forwardRef } from 'react';
${before}const DEFAULT_SIZE = 'md' as const;
const THING_DEFAULTS = Object.freeze({ count: -2, tags: Object.freeze(['a', 'b']) });
export const Thing = forwardRef(function Thing({
  variant = ${variantDefault},
  size = DEFAULT_SIZE,
  count = THING_DEFAULTS.count,
  tags = THING_DEFAULTS.tags,
  pending,
  onActivate,
  type = 'button',
  ...props
}: Record<string, unknown>) {
  return [variant, size, count, tags, pending, onActivate, type, props];
});
`;
  const api = extract({ declarations, source: source() });
  // Ordered as the props are declared; no default for pending, which the component does not set; the host type default is ignored.
  assert.deepEqual(api.defaults, { variant: 'primary', size: 'md', count: -2, tags: ['a', 'b'] });
  const cases = [
    // Calls, and names that are not top-level consts of this source, can change at run time.
    ['pickVariant()', '', /Thing\.variant: a default must be a literal or a reference to a static constant/u],
    ['UNDECLARED', '', /Thing\.variant: UNDECLARED is not a top-level const in the component's source/u],
    ['size', '', /Thing\.variant: size is not a top-level const/u],
    ['LET_VARIANT', "let LET_VARIANT = 'primary';\n", /Thing\.variant: LET_VARIANT is not a top-level const/u],
    // An object constant counts only frozen, with frozen nested literals.
    ['DEFAULTS.variant', "const DEFAULTS = { variant: 'primary' };\nDEFAULTS.variant = 'neutral';\n", /Thing\.variant -> DEFAULTS: an object constant a default reads must be Object\.freeze/u],
    ['DEFAULTS.variant', "const DEFAULTS = Object.freeze({ variant: 'primary', tags: ['a'] });\n", /Thing\.variant -> DEFAULTS: an object constant a default reads must be Object\.freeze/u],
    ['DEFAULTS.variant', "const Object = { freeze: <T,>(value: T) => value };\nconst DEFAULTS = Object.freeze({ variant: 'primary' });\n", /Thing\.variant -> DEFAULTS: an object constant a default reads must be Object\.freeze/u],
    ['VARIANTS[0]', "const VARIANTS = Object.freeze(['primary']);\n", /Thing\.variant: a default must be a literal or a reference to a static constant/u],
  ];
  for (const [variantDefault, before, pattern] of cases) rejects(declarations, pattern, { source: source(variantDefault, before) });
  assert.deepEqual(extract({ declarations, source: source('DEFAULTS.nested.variant', "const DEFAULTS = Object.freeze({ nested: Object.freeze({ variant: 'neutral' }) });\n") }).defaults.variant, 'neutral');
  rejects(declarations, /Thing: the source exports no component function/u, { source: 'export const Other = () => null;\n' });
  // A default executed outside the parameter would vanish, so the parameter must destructure every Mux UI-owned prop.
  rejects(declarations, /Thing: the props parameter must be an object pattern/u, {
    source: "const DEFAULTS = Object.freeze({ variant: 'primary' });\nexport function Thing(props: Record<string, unknown>) { const { variant = DEFAULTS.variant } = props; return variant; }\n",
  });
  rejects(declarations, /Thing\.variant: the props parameter must destructure each Mux UI-owned prop/u, {
    source: "export function Thing({ size, count, tags, pending, onActivate, ...props }: Record<string, unknown>) { const variant = props.variant ?? 'primary'; return [size, count, tags, pending, onActivate, variant]; }\n",
  });
  rejects(declarations, /Thing\.onActivate: an on<Event> prop has no default/u, {
    source: "export function Thing({ variant, size, count, tags, pending, onActivate = () => {} }: Record<string, unknown>) { return [variant, size, count, tags, pending, onActivate]; }\n",
  });
});

test('defaults are read only through React\'s forwardRef and memo, from their first argument', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';");
  const imports = "import React, { forwardRef, memo } from 'react';\n";
  // The component renders with size 'sm'; the comparator is memo's second argument and defaults 'md'.
  const actual = "function ActualRoot({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }\n";
  const comparator = "({ size = 'md' }: Record<string, unknown>) => size === 'md'";
  const read = (exported, before = '', head = imports) => extract({ declarations, source: `${head}${before}export const Thing = ${exported};\n` }).defaults;
  const cases = [
    [`React.memo(ActualRoot, ${comparator})`, actual],
    [`memo(ActualRoot, ${comparator})`, actual],
    // A wrapped wrapper, an arrow, a type argument, and parentheses or `as` around any of them.
    ["memo(forwardRef(function ActualRoot({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }))", ''],
    ["React.memo<unknown>(({ size = 'sm' }: Record<string, unknown>) => size)", ''],
    ["(memo(ActualRoot) as unknown)", actual],
    // A top-level const bound to a wrapper resolves to that wrapper's function.
    ['memo(Inner, Object.is)', `const Inner = forwardRef(function Inner({ size = 'sm' }: Record<string, unknown>) { return size; });\n`],
  ];
  for (const [exported, before] of cases) assert.deepEqual(read(exported, before), { size: 'sm' }, exported);
  assert.deepEqual(read('React.memo(ActualRoot, Object.is)', actual, "import * as React from 'react';\n"), { size: 'sm' }, 'a namespace import');
  assert.deepEqual(read('keep(ActualRoot)', actual, "import { memo as keep } from 'react';\n"), { size: 'sm' }, 'a renamed import');

  // Any other callee, or a first argument the extraction cannot follow, fails rather than reading another argument.
  const wrap = 'const wrap = (render: unknown, ...rest: unknown[]) => render;\n';
  const rejections = [
    ['wrap(ActualRoot)', wrap + actual, imports, /Thing: wrap is not React's forwardRef or memo/u],
    [`wrap(${comparator})`, wrap, imports, /Thing: wrap is not React's forwardRef or memo/u],
    ["forwardRef(function Thing({ size = 'sm' }: Record<string, unknown>) { return size; })", 'function forwardRef(render: unknown) { return render; }\n', '', /Thing: forwardRef is not React's forwardRef or memo/u],
    ["React.memo(function Thing({ size = 'sm' }: Record<string, unknown>) { return size; })", 'const React = { memo: (render: unknown) => render };\n', '', /Thing: React\.memo is not React's forwardRef or memo/u],
    ['memo(LetRoot, Object.is)', `let LetRoot = function LetRoot({ size = 'sm' }: Record<string, unknown>) { return size; };\n`, imports, /Thing: LetRoot is not a top-level function declaration or const in the component's source/u],
    ['memo(Alias)', `${actual}const Alias = ActualRoot;\n`, imports, /Thing: Alias must be a function, forwardRef, or memo call/u],
    ['memo(UNDECLARED)', '', imports, /Thing: UNDECLARED is not a top-level function declaration or const/u],
    ['memo()', '', imports, /Thing: memo\(\) has no component function/u],
    ['memo(Thing)', '', imports, /Thing: Thing wraps itself/u],
    ['memo(...rest)', 'declare const rest: [() => null];\n', imports, /Thing: the first argument of memo must be/u],
    [`memo(5, ${comparator})`, '', imports, /Thing: the first argument of memo must be/u],
  ];
  for (const [exported, before, head, pattern] of rejections) {
    assert.throws(() => read(exported, before, head), (error) => error instanceof ApiExtractionError && pattern.test(error.message), exported);
  }
});

test('a default the component executes outside its props parameter fails extraction', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';\n  count?: number;\n  onActivate?: () => void;");
  const source = (body) => `declare function chooseSize(): 'sm' | 'md';
export function Thing({ size, count, onActivate }: { size?: 'sm' | 'md'; count?: number; onActivate?: () => void }) {
  ${body}
  return [size, count];
}
`;
  const cases = [
    ['size ??= chooseSize();', /Thing\.size: the component assigns to size outside its props parameter/u],
    ["size ??= 'md';", /Thing\.size: the component assigns to size/u],
    ["const chosen = size || 'md'; void chosen;", /Thing\.size: size \|\| \.\.\. falls back to a value the component executes/u],
    ["const chosen = (size) ?? 'md'; void chosen;", /Thing\.size: size \?\? \.\.\. falls back/u],
    ["size = 'md';", /Thing\.size: the component assigns to size/u],
    ['count++;', /Thing\.count: the component assigns to count/u],
    ['--count;', /Thing\.count: the component assigns to count/u],
    ['count += 1;', /Thing\.count: the component assigns to count/u],
    ["size &&= 'sm';", /Thing\.size: the component assigns to size/u],
    ["({ size } = { size: 'md' });", /Thing\.size: the component assigns to size/u],
    ['[count = 1] = [];', /Thing\.count: the component assigns to count/u],
    ["const later = () => { size = 'md'; }; later();", /Thing\.size: the component assigns to size/u],
    ["for (size of ['sm' as const]) void size;", /Thing\.size: the component assigns to size/u],
  ];
  for (const [body, pattern] of cases) rejects(declarations, pattern, { source: source(body) });
  // An event may be called optionally or given a fallback, a shadowing local is not the prop, and the prop may be a fallback's right side.
  const allowed = extract({
    declarations,
    source: source("onActivate?.();\n  const handler = onActivate || (() => {}); handler();\n  { let size = 'sm'; size ??= 'md'; void size; }\n  const label = undefined ?? size; void label;"),
  });
  assert.deepEqual(allowed.defaults, {});
});

test('a fallback on a prop with a parameter default passes only where that default keeps it from applying', () => {
  const declarations = ownProps(`  size?: 'sm' | 'md';
  count?: number;
  flag?: boolean;
  note?: string | null;
  items?: readonly string[];
  expanded?: boolean;
  onActivate?: () => void;`);
  const source = (body) => `declare const local: boolean;
declare const hasError: boolean;
declare const host: { 'aria-busy'?: boolean };
export function Thing({ size = 'md', count = 0, flag = false, note = null, items = [], expanded, onActivate }: Record<string, any>) {
  ${body}
  return [size, count, flag, note, items, expanded, onActivate];
}
`;
  const defaults = { size: 'md', count: 0, flag: false, note: null, items: [] };
  // ?? passes over a non-nullish default and || over a truthy one, so an omitted prop keeps its default.
  for (const body of ["size ?? 'sm'", "size || 'sm'", 'items ?? []', 'items || []', 'count ?? 1', 'flag ?? true']) {
    assert.deepEqual(extract({ declarations, source: source(`void (${body});`) }).defaults, defaults, body);
  }
  // The forms the moved families use: the prop on a fallback's right (SelectNative's invalid), a
  // conditional over a false default (Message, DataDiff, Button), and a controlled prop without a
  // default that falls back to local state (Message, Activity, DataDiff).
  for (const body of ['hasError || flag', 'flag ? true : undefined', "flag ? true : host['aria-busy']", 'flag ? true : count > 0', 'expanded == null ? local : expanded']) {
    assert.deepEqual(extract({ declarations, source: source(`void (${body});`) }).defaults, defaults, body);
  }
  // Otherwise the fallback replaces the default the block would state: false || true runs true.
  const cases = [
    ['flag || true', /Thing\.flag: flag \|\| \.\.\. replaces its parameter default false with a value the component executes/u],
    ['flag || hasError', /Thing\.flag: flag \|\| \.\.\. replaces its parameter default false/u],
    ['count || 1', /Thing\.count: count \|\| \.\.\. replaces its parameter default 0/u],
    ["note ?? 'actual'", /Thing\.note: note \?\? \.\.\. replaces its parameter default null/u],
    ["note || 'actual'", /Thing\.note: note \|\| \.\.\. replaces its parameter default null/u],
    ['expanded ?? local', /Thing\.expanded: expanded \?\? \.\.\. falls back to a value the component executes/u],
  ];
  for (const [body, pattern] of cases) rejects(declarations, pattern, { source: source(`void (${body});`) });
  // A defaulted prop is still assigned to only in its parameter.
  rejects(declarations, /Thing\.size: the component assigns to size/u, { source: source("size ||= 'sm';") });
});

test('a recursive Mux UI-owned type is defined once and referenced by name', () => {
  const api = extract({ declarations: ownProps('  items?: readonly ThingItem[];', 'export interface ThingItem { id: string; children?: ThingItem[]; }\n') });
  assert.deepEqual(api.propDetails.items.type, { kind: 'array', element: { kind: 'reference', name: 'ThingItem' }, readonly: true });
  assert.deepEqual(api.types, {
    ThingItem: {
      type: {
        kind: 'object',
        members: [
          { name: 'id', type: { kind: 'string' }, required: true, readonly: false },
          { name: 'children', type: { kind: 'array', element: { kind: 'reference', name: 'ThingItem' }, readonly: false }, required: false, readonly: false },
        ],
      },
    },
  });
});

test('a record is an object type whose one member is a string index signature', () => {
  const api = extract({
    declarations: ownProps('  values?: ThingValues;\n  counts?: { [key: string]: number };', 'export type ThingValues = { readonly [column: string]: string | null };\n'),
  });
  assert.deepEqual(api.propDetails.values.type, { kind: 'reference', name: 'ThingValues' });
  assert.deepEqual(api.types.ThingValues.type, { kind: 'record', value: { kind: 'union', members: [{ kind: 'string' }, { kind: 'null' }] }, readonly: true });
  assert.deepEqual(api.propDetails.counts.type, { kind: 'record', value: { kind: 'number' }, readonly: false });
  // An interface holds a record the same way.
  assert.deepEqual(extract({ declarations: ownProps('  values?: ThingValues;', 'export interface ThingValues { readonly [column: string]: boolean }\n') }).types.ThingValues.type,
    { kind: 'record', value: { kind: 'boolean' }, readonly: true });
  const cases = [
    ['  bad?: { [key: number]: string };', '', /Thing\.bad: an index signature takes one string key/u],
    ['  bad?: { [key: symbol]: string };', '', /Thing\.bad: an index signature takes one string key/u],
    ['  bad?: { [key: `id-${string}`]: string };', '', /Thing\.bad: an index signature takes one string key/u],
    ['  bad?: { [key: string]: string; id: string };', '', /Thing\.bad: an index signature is in the grammar only as the one member of its object type/u],
    ['  bad?: { [key: string]: string; [key: number]: string };', '', /Thing\.bad: an index signature is in the grammar only as the one member/u],
    ['  bad?: Mixed;', 'export interface Mixed { [key: string]: string; id: string }\n', /Thing\.bad -> Mixed: an index signature is in the grammar only as the one member/u],
    // The value is read by the same grammar, with the chain naming the key.
    ['  bad?: { [key: string]: any };', '', /Thing\.bad\[string\]: any is not in the grammar/u],
  ];
  for (const [members, extra, pattern] of cases) rejects(ownProps(members, extra), pattern);
  // OwnProps itself takes only named props.
  rejects(ownProps('  size?: string;\n  [key: string]: string | undefined;'), /Thing\.<member>: only property signatures are in the grammar/u);
});

test('never is in the grammar only as an optional member\'s type, a member that must be absent', () => {
  const rows = `export type ThingRow =
  | { readonly kind: 'added'; readonly values: string; readonly before?: never }
  | { readonly kind: 'updated'; readonly before: string; readonly values?: never };
`;
  const api = extract({ declarations: ownProps('  rows?: readonly ThingRow[];', rows) });
  assert.deepEqual(api.types.ThingRow.type.members.map(({ members }) => members.map(({ name, type, required }) => `${name}${required ? '' : '?'}: ${type.kind}`)), [
    ['kind: literal', 'values: string', 'before?: never'],
    ['kind: literal', 'before: string', 'values?: never'],
  ]);
  const cases = [
    ['  bad?: { gone: never };', /Thing\.bad\.gone: never is in the grammar only as an optional member's type/u],
    ['  bad?: never;', /Thing\.bad: a member that must be absent is no prop; leave bad to the host part/u],
    ['  bad?: string | never;', /Thing\.bad: never is not in the grammar/u],
    ['  bad?: readonly never[];', /Thing\.bad\[\]: never is not in the grammar/u],
    ['  onBad?: (value: never) => void;', /Thing\.onBad\(value\): never is not in the grammar/u],
    ['  bad?: { [key: string]: never };', /Thing\.bad\[string\]: never is not in the grammar/u],
  ];
  for (const [members, pattern] of cases) rejects(ownProps(members), pattern);
});

test('a compound export derives the API of its named root part', () => {
  const declarations = `${header}export interface ThingOwnProps {
  size?: 'sm' | 'md';
}
export interface ThingRootProps extends ThingOwnProps, React.HTMLAttributes<HTMLSpanElement> {}
export interface ThingImageProps extends React.ImgHTMLAttributes<HTMLImageElement> { alt: string }
export declare const Thing: {
  Root: React.ForwardRefExoticComponent<ThingRootProps & React.RefAttributes<HTMLSpanElement>>;
  Image: React.ForwardRefExoticComponent<ThingImageProps & React.RefAttributes<HTMLImageElement>>;
};
`;
  const source = (exported, before = '', after = '', keyword = 'const') => `import React, { forwardRef, memo } from 'react';
const ThingRoot = forwardRef(function ThingRoot({ size = 'md', ...props }: Record<string, unknown>) { return [size, props]; });
const OtherRoot = forwardRef(function OtherRoot({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; });
const ThingImage = forwardRef(function ThingImage({ alt }: { alt: string }) { return alt; });
${before}export ${keyword} Thing = ${exported};
${after}`;
  const read = (exported, { part = 'Root', before, after, keyword, text } = {}) => {
    mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
    const root = mkdtempSync(join(packageRoot, 'build', 'api-extraction-'));
    try {
      writeFileSync(join(root, 'thing.d.ts'), declarations);
      writeFileSync(join(root, 'thing.ts'), text ?? source(exported, before, after, keyword));
      return extractApis({ declarationRoot: root, components: [{ name: 'Thing', part, declarations: join(root, 'thing.d.ts'), source: join(root, 'thing.ts') }] }).get('Thing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  const api = read('Object.freeze({ Root: ThingRoot, Image: ThingImage })');
  assert.deepEqual([api.props, api.defaults], [['size'], { size: 'md' }]);
  // The part's component is the wrapper's first argument, not its comparator.
  const memoized = "function ActualRoot({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }\nconst MemoRoot = React.memo(ActualRoot, ({ size = 'md' }: Record<string, unknown>) => size === 'md');\n";
  assert.deepEqual(read('Object.freeze({ Root: MemoRoot })', { before: memoized }).defaults, { size: 'sm' });
  assert.deepEqual(read('Object.freeze({ Root: MemoRoot })', { before: "const MemoRoot = memo(forwardRef(function ActualRoot({ size = 'sm' }: Record<string, unknown>) { return size; }));\n" }).defaults, { size: 'sm' });
  // A part's own properties, such as its displayName, may still be set.
  assert.deepEqual(read("Object.freeze({ 'Root': ThingRoot, Image: ThingImage })", { after: "(ThingRoot as { displayName?: string }).displayName = 'Thing.Root';\n" }).defaults, { size: 'md' });
  assert.throws(() => read('Object.freeze({ Root: ThingRoot })', { part: 'Body' }), /Thing\.Body: the exported Thing has no Body part/u);
  // Only a frozen literal of Name: value parts, bound once to a const the source never writes,
  // fixes the part the extraction reads; anything else could run another root.
  const cases = [
    ['Object.freeze({ Root: ThingRoot, ...overrides })', { before: 'const overrides = { Root: OtherRoot };\n' }, /Thing\.Root: the compound Thing holds only Name: value parts; a spread/u],
    ['{ Root: ThingRoot, Image: ThingImage }', {}, /Thing\.Root: the compound Thing must be Object\.freeze\(\{ \.\.\. \}\) of its parts/u],
    ['wrap({ Root: ThingRoot })', { before: 'const wrap = <T,>(value: T) => value;\n' }, /Thing\.Root: the compound Thing must be Object\.freeze/u],
    ['Object.freeze(parts)', { before: 'const parts = { Root: ThingRoot };\n' }, /Thing\.Root: the compound Thing must be Object\.freeze/u],
    ['Object.freeze({ [key]: ThingRoot })', { before: "const key = 'Root';\n" }, /Thing\.Root: the compound Thing holds only Name: value parts; .*computed key/u],
    ['Object.freeze({ ThingRoot })', {}, /Thing\.Root: the compound Thing holds only Name: value parts; .*shorthand/u],
    ['Object.freeze({ get Root() { return OtherRoot; } })', {}, /Thing\.Root: the compound Thing holds only Name: value parts; .*accessor/u],
    // A reassigned member: a second Root, a write after the freeze, or a binding that is not const.
    ['Object.freeze({ Root: ThingRoot, Root: OtherRoot })', {}, /Thing\.Root: the compound Thing assigns Root twice/u],
    ['Object.freeze({ Root: ThingRoot })', { after: '(Thing as { Root: unknown }).Root = OtherRoot;\n' }, /Thing\.Root: the source writes to the compound Thing after declaring it/u],
    ['Object.freeze({ Root: ThingRoot })', { after: 'Object.defineProperty(Thing, \'Root\', { value: OtherRoot });\n' }, /Thing\.Root: the source writes to the compound Thing/u],
    ['Object.freeze({ Root: LetRoot })', { before: 'let LetRoot = ThingRoot;\nLetRoot = OtherRoot;\n' }, /Thing\.Root: LetRoot is not a top-level const in the component's source/u],
    ['Object.freeze({ Image: ThingImage })', {}, /Thing\.Root: the compound Thing has no Root part/u],
    // A part reads defaults only through React's forwardRef and memo, from the first argument.
    ['Object.freeze({ Root: LocalRoot })', { before: "const wrap = (render: unknown, ...rest: unknown[]) => render;\nconst LocalRoot = wrap(function LocalRoot({ size = 'sm' }: Record<string, unknown>) { return size; });\n" }, /Thing\.Root: wrap is not React's forwardRef or memo/u],
    ['Object.freeze({ Root: MemoRoot })', { before: "let LetRoot = function LetRoot({ size = 'sm' }: Record<string, unknown>) { return size; };\nconst MemoRoot = memo(LetRoot, ({ size = 'md' }: Record<string, unknown>) => size === 'md');\n" }, /Thing\.Root: LetRoot is not a top-level function declaration or const/u],
    // The compound binding itself could be reassigned, and a function is no compound.
    ['Object.freeze({ Root: ThingRoot })', { keyword: 'let' }, /Thing\.Root: the compound Thing must be a top-level const/u],
    ['', { text: "export function Thing({ size = 'sm' }: Record<string, unknown>) { return size; }\n" }, /Thing\.Root: the compound Thing must be a top-level const/u],
  ];
  for (const [exported, options, pattern] of cases) {
    assert.throws(() => read(exported, options), (error) => error instanceof ApiExtractionError && pattern.test(error.message), exported);
  }
});

test('an exported component may be a zero-argument wrapper that returns one forwardRef or memo const', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';\n  count?: number;");
  const imports = "import { forwardRef, memo } from 'react';\n";
  const renderOf = (size) => `function ({ size = '${size}', count = 2, ...props }: Record<string, unknown>) { return [size, count, props]; }`;
  const render = renderOf('sm');
  const wrapped = (body, { before = '', head = imports, call = '(() => {\n  %BODY%\n})()', after = '', pure = true } = {}) => `${head}${before}export const Thing = ${pure ? '/*#__PURE__*/ ' : ''}${call.replace('%BODY%', body)};\n${after}`;
  const standard = `const component = forwardRef(${render});\n  component.displayName = 'Thing';\n  return component;`;
  const read = (text) => extract({ declarations, source: text });

  // The wrapper is the shape the Disclosure and fields IIFEs share, with or without the pure annotation.
  assert.deepEqual(read(wrapped(standard)).defaults, { size: 'sm', count: 2 });
  assert.deepEqual(read(wrapped(standard, { pure: false })).defaults, { size: 'sm', count: 2 });
  assert.deepEqual(read(wrapped(standard, { call: '(function () {\n  %BODY%\n})()' })).defaults, { size: 'sm', count: 2 });
  // The returned const is read as an unwrapped component is: a memo's first argument, not its comparator.
  assert.deepEqual(read(wrapped(`const component = memo(forwardRef(${renderOf('md')}), ({ size = 'sm' }: Record<string, unknown>) => size === 'sm');\n  component.displayName = 'Thing';\n  return component;`)).defaults, { size: 'md', count: 2 });
  // Another const may sit beside it; the one returned supplies the defaults.
  assert.deepEqual(read(wrapped(`const other = forwardRef(${renderOf('md')});\n  const component = forwardRef(${render});\n  other.displayName = 'Other';\n  component.displayName = 'Thing';\n  return component;`)).defaults, { size: 'sm', count: 2 });

  const component = `const component = forwardRef(${render});`;
  const rejections = [
    ['a parameter', wrapped(standard, { call: '((flag: boolean) => {\n  %BODY%\n})(true)' }), /Thing: the wrapper is called with arguments; an exported component's wrapper is called with no arguments, takes no parameters/u],
    ['a parameter without an argument', wrapped(standard, { call: '((flag?: boolean) => {\n  %BODY%\n})()' }), /Thing: the wrapper takes parameters; /u],
    ['an argument', wrapped(standard, { call: '(() => {\n  %BODY%\n})(1)' }), /Thing: the wrapper is called with arguments; /u],
    ['an expression body', wrapped('', { call: '(() => forwardRef(function Thing() { return null; }))()' }), /Thing: the wrapper has an expression body; /u],
    ['an async wrapper', wrapped(standard, { call: '(async () => {\n  %BODY%\n})()' }), /Thing: the wrapper is generic, async, or a generator; /u],
    ['a side-effecting statement', wrapped(`${component}\n  register(component);\n  component.displayName = 'Thing';\n  return component;`, { before: 'declare function register(value: unknown): void;\n' }),
      /Thing: the wrapper runs a statement that is not a displayName assignment to one of its consts; /u],
    ['a side-effecting const', wrapped(`const hit = register();\n  ${component}\n  return component;`, { before: 'declare function register(): number;\n' }), /Thing: register is not React's forwardRef or memo; /u],
    ['a conditional return', wrapped(`${component}\n  const other = forwardRef(function Other() { return null; });\n  return flag ? component : other;`, { before: 'declare const flag: boolean;\n' }),
      /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return of something other than a const', wrapped(`${component}\n  return Object.freeze({ Root: component });`), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return of an outer binding', wrapped(`${component}\n  return outer;`, { before: 'declare const outer: unknown;\n' }), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['no return', wrapped(`${component}\n  component.displayName = 'Thing';`), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return before the end', wrapped(`${component}\n  return component;\n  component.displayName = 'Thing';`), /Thing: the wrapper holds a statement that is not a const, a displayName assignment, or its final return; /u],
    ['a non-literal displayName', wrapped(`${component}\n  component.displayName = label;\n  return component;`, { before: "declare const label: string;\n" }), /Thing: the wrapper sets component\.displayName to something other than a string literal; /u],
    ['a render assignment', wrapped(`${component}\n  component.render = () => null;\n  return component;`), /Thing: the wrapper runs a statement that is not a displayName assignment to one of its consts; /u],
    ['a displayName assignment before its const', wrapped(`component.displayName = 'Thing';\n  ${component}\n  return component;`), /Thing: the wrapper runs a statement that is not a displayName assignment to one of its consts; /u],
    ['a let binding', wrapped(`let component = forwardRef(${render});\n  return component;`), /Thing: the wrapper declares a binding that is not const; /u],
    ['a var binding', wrapped(`var component = forwardRef(${render});\n  return component;`), /Thing: the wrapper declares a binding that is not const; /u],
    ['a destructured const', wrapped(`const { component } = { component: forwardRef(${render}) };\n  return component;`), /Thing: the wrapper declares a const that is not a named, initialized binding; /u],
    ['a const that is not a React wrapper', wrapped(`const component = ${render.replace('function (', '(').replace(') {', ') =>  {')};\n  return component;`), /Thing: component is not a forwardRef or memo call; /u],
    ['a local forwardRef', wrapped(`${component}\n  return component;`, { head: 'function forwardRef(render: unknown) { return render; }\n' }), /Thing: forwardRef is not React's forwardRef or memo; /u],
    ['a write after the wrapper to its export', wrapped(standard, { after: "Thing.displayName = 'Other';\n" }), /Thing: the source writes to Thing beyond the wrapper's displayName assignments; /u],
    ['a write after the wrapper to its const through the export', wrapped(standard, { after: 'Object.defineProperty(Thing, \'render\', { value: null });\n' }), /Thing: the source writes to Thing beyond the wrapper's displayName assignments; /u],
    ['a write to a wrapper const from its component', wrapped(`const component = forwardRef(function Thing({ size = 'sm', count = 2 }: Record<string, unknown>) { (component as { render?: unknown }).render = null; return [size, count]; });\n  return component;`), /Thing: the source writes to component beyond the wrapper's displayName assignments; /u],
  ];
  for (const [label, text, pattern] of rejections) {
    assert.throws(() => read(text), (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  }
});

// A component's render function can be replaced by writing to the object it is stored on. These
// are the ways a source can write: an assignment, an update, a delete, an Object mutator, a
// destructuring assignment, and a for-in or for-of target, each through any number of nested
// patterns, rest elements, and defaults.
const access = (name, key) => ({
  plain: `(${name} as unknown as { ${key}: unknown }).${key}`,
  nonNull: `(${name} as unknown as { ${key}: unknown })!.${key}`,
  assertion: `(<{ ${key}: unknown }><unknown>${name}).${key}`,
});
const writeForms = (name, key) => {
  const { plain, nonNull, assertion } = access(name, key);
  return {
    'an assignment': `${plain} = replacement;`,
    'a non-null assertion': `${nonNull} = replacement;`,
    'a type assertion': `${assertion} = replacement;`,
    'an array pattern': `[${plain}] = [replacement];`,
    'an object pattern': `({ a: ${plain} } = { a: replacement });`,
    'a nested array pattern': `[[${plain}]] = [[replacement]];`,
    'an object pattern inside an array pattern': `[{ a: ${plain} }] = [{ a: replacement }];`,
    'an array pattern inside an object pattern': `({ a: [${plain}] } = { a: [replacement] });`,
    'an array rest element': `[...${plain}] = [replacement];`,
    'an object rest property': `({ ...${plain} } = { a: replacement });`,
    'an array pattern default': `[${plain} = replacement] = [];`,
    'an object pattern default': `({ a: ${plain} = replacement } = {});`,
    'a for-of target': `for (${plain} of [replacement]) {}`,
    'a for-in target': `for (${plain} in { replacement }) {}`,
    'a for-of array pattern': `for ([${plain}] of [[replacement]]) {}`,
    'a for-of object pattern': `for ({ a: ${plain} } of [{ a: replacement }]) {}`,
    'a shorthand pattern property': `({ ${name} } = { ${name}: replacement });`,
  };
};

/** The labels of the cases whose extraction does not fail with the pattern: every one is a missed write. */
const accepted = (cases) => cases.filter(([, run, pattern]) => {
  try {
    run();
    return true;
  } catch (error) {
    return !(error instanceof ApiExtractionError && pattern.test(error.message));
  }
}).map(([label]) => label);

const compoundDeclarations = `${header}export interface ThingOwnProps {
  size?: 'sm' | 'md';
}
export interface ThingRootProps extends ThingOwnProps, React.HTMLAttributes<HTMLSpanElement> {}
export declare const Thing: { Root: React.ForwardRefExoticComponent<ThingRootProps & React.RefAttributes<HTMLSpanElement>> };
`;

test('a destructuring or loop target that writes through a wrapped component fails extraction', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';");
  const render = "function ({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }";
  const imports = "import { forwardRef } from 'react';\ndeclare const replacement: unknown;\n";
  const wrapper = (after, inside = '') => `${imports}export const Thing = (() => {
  const component = forwardRef(function ({ size = 'sm' }: Record<string, unknown>) { ${inside} return size; });
  component.displayName = 'Thing';
  return component;
})();
${after}`;
  const compound = (after) => `${imports}const ThingRoot = forwardRef(${render});\nexport const Thing = Object.freeze({ Root: ThingRoot });\n${after}`;
  const cases = [
    // The exported wrapper binding, a wrapper const written from its own render function, and a compound binding.
    ...Object.entries(writeForms('Thing', 'render')).map(([label, statement]) => [`export: ${label}`, () => extract({ declarations, source: wrapper(statement) }), /Thing: the source writes to Thing beyond the wrapper's displayName assignments; /u]),
    ...Object.entries(writeForms('component', 'render')).map(([label, statement]) => [`const: ${label}`, () => extract({ declarations, source: wrapper('', statement) }), /Thing: the source writes to component beyond the wrapper's displayName assignments; /u]),
    ...Object.entries(writeForms('Thing', 'Root')).map(([label, statement]) => [`compound: ${label}`, () => extract({ declarations: compoundDeclarations, source: compound(statement), part: 'Root' }), /Thing\.Root: the source writes to the compound Thing after declaring it/u]),
  ];
  assert.deepEqual(accepted(cases), []);
  // The same syntax writing to other bindings is not a write to the component.
  const unrelated = "let other: unknown;\nlet rest: unknown;\n[other] = [replacement];\n({ a: other, ...rest } = { a: replacement });\nfor (other of [replacement]) {}\nfor (const item of [replacement]) { void item; }\nconst [first] = [replacement];\nvoid first;\n";
  assert.deepEqual(extract({ declarations, source: wrapper(unrelated) }).defaults, { size: 'sm' });
});

test('every binding a component is read through is checked for writes, and only literal displayName writes pass', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';");
  const render = "function ({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }";
  const imports = "import { forwardRef, memo } from 'react';\ndeclare const replacement: unknown;\ndeclare const label: string;\n";
  const through = (name, chain = 'Thing') => new RegExp(`${chain.replace('.', '\\.')}: the source writes to ${name}, which the component's defaults are read through, beyond a literal displayName assignment; `, 'u');
  const wrapper = (before, call, after = '') => `${imports}${before}export const Thing = /*#__PURE__*/ (() => {
  const component = ${call};
  component.displayName = 'Thing';
  return component;
})();
${after}`;
  const plain = (before, exported, after = '') => `${imports}${before}export const Thing = ${exported};\n${after}`;
  const outer = `const Actual = forwardRef(${render});\n`;
  const layers = `const Inner = forwardRef(${render});\nconst Middle = memo(Inner);\n`;

  // Literal displayName writes stay allowed, wherever the binding is followed from.
  const allowed = [
    ['a followed const through a plain memo', plain(outer, 'memo(Actual)', "Actual.displayName = 'Actual';\n")],
    ['a followed const through a wrapper memo', wrapper(outer, 'memo(Actual)', "(Actual as { displayName?: string }).displayName = 'Actual';\n")],
    ['every layer of a followed chain', plain(layers, 'memo(Middle)', "Inner.displayName = 'Inner';\nMiddle.displayName = 'Middle';\n")],
    ['the plain export itself', plain('', `forwardRef(${render})`, "Thing.displayName = 'Thing';\n")],
  ];
  for (const [label, text] of allowed) assert.deepEqual(extract({ declarations, source: text }).defaults, { size: 'sm' }, label);

  const forms = (name) => ({ ...writeForms(name, 'render'), 'a non-literal displayName': `${name}.displayName = label;`, 'an Object.assign': `Object.assign(${name}, { render: replacement });`, 'a delete': `delete (${name} as { render?: unknown }).render;` });
  const cases = [
    ...Object.entries(forms('Actual')).flatMap(([label, statement]) => [
      [`plain memo: ${label}`, () => extract({ declarations, source: plain(outer, 'memo(Actual)', statement) }), through('Actual')],
      [`wrapper memo: ${label}`, () => extract({ declarations, source: wrapper(outer, 'memo(Actual)', statement) }), through('Actual')],
    ]),
    // Every layer of a chain, not only the one the export names.
    ...Object.entries(forms('Inner')).map(([label, statement]) => [`inner layer: ${label}`, () => extract({ declarations, source: plain(layers, 'memo(Middle)', statement) }), through('Inner')]),
    ...Object.entries(forms('Middle')).map(([label, statement]) => [`middle layer: ${label}`, () => extract({ declarations, source: wrapper(layers, 'memo(Middle)', statement) }), through('Middle')]),
    // The plain export is itself a binding the component is read through.
    ...Object.entries(forms('Thing')).map(([label, statement]) => [`plain export: ${label}`, () => extract({ declarations, source: plain('', `forwardRef(${render})`, statement) }), through('Thing')]),
  ];
  // A compound part and the const its memo wraps.
  const compound = (statement) => `${imports}const ActualRoot = forwardRef(${render});\nconst ThingRoot = memo(ActualRoot);\nexport const Thing = Object.freeze({ Root: ThingRoot });\n${statement}`;
  const read = (statement) => extract({ declarations: compoundDeclarations, source: compound(statement), part: 'Root' });
  assert.deepEqual(read("ActualRoot.displayName = 'Actual';\nThingRoot.displayName = 'Root';\n").defaults, { size: 'sm' });
  for (const name of ['ActualRoot', 'ThingRoot']) {
    for (const [label, statement] of Object.entries(forms(name))) cases.push([`compound ${name}: ${label}`, () => read(statement), through(name, 'Thing.Root')]);
  }
  assert.deepEqual(accepted(cases), []);
});

test('derived API documents are validated, written, checked, pruned, and merged into their records', async () => {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'derived-apis-'));
  try {
    const declarationRoot = join(root, 'ts');
    const repositoryRoot = join(root, 'repository');
    const fixturePackage = join(root, 'package');
    mkdirSync(declarationRoot);
    mkdirSync(join(repositoryRoot, 'packages/react/src'), { recursive: true });
    writeFileSync(join(declarationRoot, 'thing.d.ts'), ownProps(`  variant?: 'primary' | 'neutral';
  onActivate?: (event: ThingEvent) => void;`, event));
    writeFileSync(join(repositoryRoot, 'packages/react/src/thing.ts'), "export function Thing({ variant = 'primary', onActivate }: { variant?: string; onActivate?: () => void }) { return [variant, onActivate]; }\n");
    const components = [{ slug: 'thing', name: 'Thing', source: 'packages/react/src/thing.ts' }];
    const documents = await deriveApis({ packageRoot: fixturePackage, repositoryRoot, declarationRoot, components });
    const document = documents.get('thing');
    assert.deepEqual({ ...document, api: undefined }, {
      schema: 'muxui-derived-api-v1',
      generatedFrom: 'packages/react/src/thing.ts',
      component: 'muxui:component:thing',
      binding: 'web.react',
      export: 'Thing',
      api: undefined,
    });
    assert.deepEqual(document.api.defaults, { variant: 'primary' });
    assert.deepEqual(Object.keys(document.api.types), ['ThingEvent', 'ThingPointer']);

    const check = () => syncDerivedApis({ packageRoot: fixturePackage, documents, checking: true });
    await assert.rejects(check(), /MUXUI_REACT_GENERATED_DRIFT: api\/thing\.json$/u);
    await syncDerivedApis({ packageRoot: fixturePackage, documents, checking: false });
    await check();
    // --list-outputs runs no tsc and reads the committed documents back.
    assert.deepEqual(await deriveApis({ packageRoot: fixturePackage, repositoryRoot, components }), documents);
    writeFileSync(join(fixturePackage, 'api/stale.json'), '{}\n');
    await assert.rejects(check(), /api\/stale\.json is not a derived API output/u);
    await syncDerivedApis({ packageRoot: fixturePackage, documents, checking: false });
    assert.deepEqual(readdirSync(join(fixturePackage, 'api')), ['thing.json']);

    const thing = { id: 'muxui:component:thing', anatomy: ['root', 'label'], bindings: { 'web.react': { strategy: 'direct' } } };
    assert.deepEqual(withDerivedApi(thing, documents).bindings['web.react'].api, { ...document.api, parts: ['root', 'label'] });
    const other = { id: 'muxui:component:other', anatomy: ['root'], bindings: {} };
    assert.equal(withDerivedApi(other, documents), other);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Button derives exactly ButtonOwnProps; the native attributes ButtonProps passes through stay out', () => {
  const { api } = JSON.parse(readFileSync(resolve(packageRoot, 'api/button.json'), 'utf8'));
  assert.deepEqual(api.props, ['disabled', 'pending', 'showTextWhileLoading', 'variant', 'size']);
  assert.deepEqual(api.events, ['activate']);
  // Item 8: disabled and pending have no Mux UI default, and the host type default is ignored.
  assert.deepEqual(api.defaults, { showTextWhileLoading: false, variant: 'primary', size: 'md' });
  const declarations = readFileSync(resolve(packageRoot, 'generated/button.d.ts'), 'utf8');
  assert.match(declarations, /export interface ButtonProps extends ButtonOwnProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>/u);
  for (const passthrough of ['children', 'className', 'style']) {
    assert.match(declarations, new RegExp(`\\n\\s+${passthrough}\\?:`, 'u'), `ButtonProps declares ${passthrough}`);
    assert.equal(api.props.includes(passthrough), false, `${passthrough} is not a derived prop`);
  }
});
