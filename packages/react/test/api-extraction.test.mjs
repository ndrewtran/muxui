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

function extract({ declarations, source, sourceName = 'thing.ts', hostAllowlist, files = {}, part, callable, parts }) {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'api-extraction-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    writeFileSync(join(root, 'thing.d.ts'), declarations);
    if (source !== undefined) writeFileSync(join(root, sourceName), source);
    const component = {
      name: 'Thing',
      ...(part === undefined ? {} : { part }),
      ...(callable === undefined ? {} : { callable }),
      ...(parts === undefined ? {} : { parts }),
      declarations: join(root, 'thing.d.ts'),
      ...(source === undefined ? {} : { source: join(root, sourceName) }),
    };
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
  assert.deepEqual(reached.get('HTMLButtonElement'), ['button.json', 'icon-button.json', 'menu.json', 'toggle-button.json'], 'the activation event target');
  assert.deepEqual(reached.get('React.ReactNode'), ['activity.json', 'autocomplete.json', 'breadcrumbs.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'disclosure.json', 'lightbox.json', 'list-box.json', 'markdown.json', 'menu.json', 'message.json', 'meter.json', 'number-field.json', 'progress-bar.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'select-native.json', 'slider.json', 'switch.json', 'text-field.json', 'time-field.json', 'toast.json', 'token-field.json', 'tooltip.json'], 'caller-supplied content, and the node an Exclude starts from');
  assert.deepEqual(reached.get('React.ReactElement'), ['dialog.json', 'popover.json', 'preview-trigger.json', 'tooltip.json'], 'the element a trigger prop takes');
  assert.deepEqual(reached.get(hostEntryKey(host('Exclude', host('React.ReactNode'), { kind: 'union', members: [keyword('null'), keyword('undefined'), keyword('boolean')] }))), ['autocomplete.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'number-field.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'slider.json', 'switch.json', 'text-field.json', 'time-field.json', 'toast.json', 'token-field.json', 'tooltip.json'], 'content that renders something');
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

test('beside named properties, exactly one mutable [key: string]: unknown marks an open item', () => {
  const item = 'export interface ThingItem {\n  /** The stable id. */\n  id?: string;\n  label?: React.ReactNode;\n  [key: string]: unknown;\n}\n';
  const members = [
    { name: 'id', type: { kind: 'string' }, required: false, readonly: false, description: 'The stable id.' },
    { name: 'label', type: { kind: 'host', name: 'React.ReactNode' }, required: false, readonly: false },
  ];
  const api = extract({ declarations: ownProps('  items?: (ThingItem | string)[];\n  inline?: { id: string; [key: string]: unknown };', item) });
  assert.deepEqual(api.types.ThingItem.type, { kind: 'object', members, additional: 'unknown' });
  assert.deepEqual(api.propDetails.items.type, { kind: 'array', element: { kind: 'union', members: [{ kind: 'reference', name: 'ThingItem' }, { kind: 'string' }] }, readonly: false });
  // A type literal holds the marker the same way, and a type alias of one does too.
  assert.deepEqual(api.propDetails.inline.type, { kind: 'object', members: [{ name: 'id', type: { kind: 'string' }, required: true, readonly: false }], additional: 'unknown' });
  assert.deepEqual(extract({ declarations: ownProps('  item?: ThingItem;', 'export type ThingItem = { id?: string; [key: string]: unknown };\n') }).types.ThingItem.type.additional, 'unknown');
  // An ordinary object carries no marker, so no existing block changes.
  const plain = extract({ declarations: ownProps('  item?: ThingItem;', 'export interface ThingItem { id?: string }\n') });
  assert.equal(Object.hasOwn(plain.types.ThingItem.type, 'additional'), false);
  assert.equal(Object.hasOwn(extract({ declarations: ownProps('  bag?: { [key: string]: string };') }).propDetails.bag.type, 'additional'), false);

  const cases = [
    // Beside named properties the signature is the one mutable string-keyed unknown, and nothing else.
    ['two signatures', 'export interface Bad { id?: string; [key: string]: unknown; [key: number]: unknown }\n', /Thing\.bad -> Bad: an index signature is in the grammar only as the one member of its object type, or as the one mutable/u],
    ['a number key', 'export interface Bad { id?: string; [key: number]: unknown }\n', /Thing\.bad -> Bad: an index signature takes one string key/u],
    ['a symbol key', 'export interface Bad { id?: string; [key: symbol]: unknown }\n', /Thing\.bad -> Bad: an index signature takes one string key/u],
    ['a template key', 'export interface Bad { id?: string; [key: `data-${string}`]: unknown }\n', /Thing\.bad -> Bad: an index signature takes one string key/u],
    ['a readonly signature beside members', 'export interface Bad { id?: string; readonly [key: string]: unknown }\n', /Thing\.bad -> Bad: .*beside named properties it must be mutable/u],
    ['another value type', 'export interface Bad { id?: string; [key: string]: string | undefined }\n', /Thing\.bad -> Bad: .*its value is written as the keyword unknown, not an alias, union, or other type/u],
    ['an alias of unknown', 'export type Anything = unknown;\nexport interface Bad { id?: string; [key: string]: Anything }\n', /Thing\.bad -> Bad: .*its value is written as the keyword unknown/u],
    ['a union holding unknown', 'export interface Bad { id?: string; [key: string]: unknown | string }\n', /Thing\.bad -> Bad: .*its value is written as the keyword unknown/u],
    ['a parenthesized unknown', 'export interface Bad { id?: string; [key: string]: (unknown) }\n', /Thing\.bad -> Bad: .*its value is written as the keyword unknown/u],
    ['any', 'export interface Bad { id?: string; [key: string]: any }\n', /Thing\.bad -> Bad: .*its value is written as the keyword unknown/u],
    ['Record<string, unknown>', 'export interface Bad { id?: string; extra?: Record<string, unknown> }\n', /Thing\.bad -> Bad\.extra -> Record<1>: unknown is not in the grammar/u],
    // unknown is not in the grammar on a named member, in a callback, or as the value of a sole signature.
    ['a named member of unknown', 'export interface Bad { id?: string; extra?: unknown; [key: string]: unknown }\n', /Thing\.bad -> Bad\.extra: unknown is not in the grammar/u],
    ['a callback parameter of unknown', 'export interface Bad { id?: string; [key: string]: unknown; onX?: (value: unknown) => void }\n', /Thing\.bad -> Bad\.onX\(value\): unknown is not in the grammar/u],
    ['a method beside the marker', 'export interface Bad { id?: string; call(): void; [key: string]: unknown }\n', /Thing\.bad -> Bad\.call: only property signatures are in the grammar/u],
    ['a sole signature of unknown', 'export interface Bad { [key: string]: unknown }\n', /Thing\.bad -> Bad\[string\]: unknown is not in the grammar/u],
    ['a sole readonly signature of unknown', 'export interface Bad { readonly [key: string]: unknown }\n', /Thing\.bad -> Bad\[string\]: unknown is not in the grammar/u],
  ];
  for (const [label, extra, pattern] of cases) {
    assert.throws(() => extract({ declarations: ownProps('  bad?: Bad;', extra) }), (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  }
  // unknown stays out of every other position.
  rejects(ownProps('  bad?: unknown;'), /Thing\.bad: unknown is not in the grammar/u);
  rejects(ownProps('  bad?: unknown[];'), /Thing\.bad\[\]: unknown is not in the grammar/u);
  rejects(ownProps('  bad?: string | unknown;'), /Thing\.bad: unknown is not in the grammar/u);
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
      /Thing: the wrapper runs a statement that is not a displayName or part assignment to one of its consts; /u],
    ['a side-effecting const', wrapped(`const hit = register();\n  ${component}\n  return component;`, { before: 'declare function register(): number;\n' }), /Thing: register is not React's forwardRef or memo; /u],
    ['a conditional return', wrapped(`${component}\n  const other = forwardRef(function Other() { return null; });\n  return flag ? component : other;`, { before: 'declare const flag: boolean;\n' }),
      /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return of something other than a const', wrapped(`${component}\n  return Object.freeze({ Root: component });`), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return of an outer binding', wrapped(`${component}\n  return outer;`, { before: 'declare const outer: unknown;\n' }), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['no return', wrapped(`${component}\n  component.displayName = 'Thing';`), /Thing: the wrapper does not end by returning one of its consts; /u],
    ['a return before the end', wrapped(`${component}\n  return component;\n  component.displayName = 'Thing';`), /Thing: the wrapper holds a statement that is not a const, a displayName or part assignment, or its final return; /u],
    ['a non-literal displayName', wrapped(`${component}\n  component.displayName = label;\n  return component;`, { before: "declare const label: string;\n" }), /Thing: the wrapper sets component\.displayName to something other than a string literal; /u],
    ['a render assignment', wrapped(`${component}\n  component.render = () => null;\n  return component;`), /Thing: the wrapper assigns component\.render, which is neither displayName nor a part named in PascalCase; /u],
    ['a displayName assignment before its const', wrapped(`component.displayName = 'Thing';\n  ${component}\n  return component;`), /Thing: the wrapper runs a statement that is not a displayName or part assignment to one of its consts; /u],
    ['a let binding', wrapped(`let component = forwardRef(${render});\n  return component;`), /Thing: the wrapper declares a binding that is not const; /u],
    ['a var binding', wrapped(`var component = forwardRef(${render});\n  return component;`), /Thing: the wrapper declares a binding that is not const; /u],
    ['a destructured const', wrapped(`const { component } = { component: forwardRef(${render}) };\n  return component;`), /Thing: the wrapper declares a const that is not a named, initialized binding; /u],
    ['a const that is not a React wrapper', wrapped(`const component = ${render.replace('function (', '(').replace(') {', ') =>  {')};\n  return component;`), /Thing: component is not a forwardRef or memo call; /u],
    ['a local forwardRef', wrapped(`${component}\n  return component;`, { head: 'function forwardRef(render: unknown) { return render; }\n' }), /Thing: forwardRef is not React's forwardRef or memo; /u],
    ['a write after the wrapper to its export', wrapped(standard, { after: "Thing.displayName = 'Other';\n" }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u],
    ['a write after the wrapper to its const through the export', wrapped(standard, { after: 'Object.defineProperty(Thing, \'render\', { value: null });\n' }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u],
    ['a write to a wrapper const from its component', wrapped(`const component = forwardRef(function Thing({ size = 'sm', count = 2 }: Record<string, unknown>) { (component as { render?: unknown }).render = null; return [size, count]; });\n  return component;`), /Thing: the source writes to component beyond the wrapper's displayName and part assignments; /u],
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
    ...Object.entries(writeForms('Thing', 'render')).map(([label, statement]) => [`export: ${label}`, () => extract({ declarations, source: wrapper(statement) }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u]),
    ...Object.entries(writeForms('component', 'render')).map(([label, statement]) => [`const: ${label}`, () => extract({ declarations, source: wrapper('', statement) }), /Thing: the source writes to component beyond the wrapper's displayName and part assignments; /u]),
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

// A callable compound: the export is its own root (Thing.Root is Thing), and its other parts are statics
// assigned to the returned const in the wrapper, as ListBox, GridList, and Select attach theirs.
const callableDeclarations = `${header}export interface ThingOwnProps {
  size?: 'sm' | 'md';
  onCommit?: (value: string) => void;
}
export interface ThingItemOwnProps {
  value: string;
  tone?: 'quiet' | 'loud';
  onPick?: (value: string) => void;
}
export interface ThingGroupOwnProps { heading?: React.ReactNode; }
export interface ThingBadgeOwnProps { count?: number; }
export interface ThingTagOwnProps { label?: string; }
export interface ThingHeaderOwnProps {}
export interface ThingProps extends ThingOwnProps, Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {}
export interface ThingItemProps extends ThingItemOwnProps, React.HTMLAttributes<HTMLDivElement> {}
export interface ThingGroupProps extends ThingGroupOwnProps, React.HTMLAttributes<HTMLElement> {}
export interface ThingBadgeProps extends ThingBadgeOwnProps, React.HTMLAttributes<HTMLElement> {}
export interface ThingTagProps extends ThingTagOwnProps, React.HTMLAttributes<HTMLElement> {}
export interface ThingHeaderProps extends ThingHeaderOwnProps, React.HTMLAttributes<HTMLElement> {}
export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>>;
  Item: React.ForwardRefExoticComponent<ThingItemProps & React.RefAttributes<HTMLDivElement>>;
  Group: React.ForwardRefExoticComponent<ThingGroupProps & React.RefAttributes<HTMLElement>>;
  Badge: React.ForwardRefExoticComponent<ThingBadgeProps & React.RefAttributes<HTMLElement>>;
  Tag: React.ForwardRefExoticComponent<ThingTagProps & React.RefAttributes<HTMLElement>>;
  Header: React.ForwardRefExoticComponent<ThingHeaderProps & React.RefAttributes<HTMLElement>>;
};
`;
const callableRender = "function ThingRoot({ size = 'md', onCommit, ...props }: Record<string, unknown>) { return [size, onCommit, props]; }";
const callableItem = "function ThingItem({ value, tone = 'quiet', onPick, ...props }: Record<string, unknown>) { return [value, tone, onPick, props]; }";
/** A callable compound's source; `statics` are the statements after the displayName, `before` and `after` sit around the export. */
const callableSource = ({ before = '', inside = '', statics, after = '' } = {}) => `import { forwardRef, memo } from 'react';
declare const replacement: unknown;
${before}export const Thing = /*#__PURE__*/ (() => {
  const Thing = forwardRef(${callableRender});
  ${inside}
  Thing.displayName = 'Thing';
  ${statics ?? `Thing.Root = Thing;
  Thing.Item = forwardRef(${callableItem});
  Thing.Group = Group;`}
  return Thing;
})();
${after}`;
const callableBefore = `function ThingBadge({ count = 1, ...props }: Record<string, unknown>) { return [count, props]; }
const ThingTag = forwardRef(function ThingTag({ label = 'Tag', ...props }: Record<string, unknown>) { return [label, props]; });
`;
const groupConst = "const Group = forwardRef(function ThingGroup({ heading, ...props }: Record<string, unknown>) { return [heading, props]; });\n";

test('a callable compound is its own root, and the parts assigned in its wrapper each derive a partApis entry', () => {
  const all = `Thing.Root = Thing;
  Thing.Item = forwardRef(${callableItem});
  Thing.Group = Group;
  Thing.Badge = ThingBadge;
  Thing.Tag = ThingTag;`;
  const read = (statics, options = {}) => extract({
    declarations: callableDeclarations,
    source: callableSource({ before: `${callableBefore}`, inside: groupConst.trim(), statics }),
    ...options,
  });
  const api = read(all, { parts: { item: 'Item', group: 'Group', badge: 'Badge', tag: 'Tag' } });
  // The root is the callable itself: ThingOwnProps and its defaults, with the parts beside it.
  assert.deepEqual([api.props, api.events, api.defaults], [['size'], ['commit'], { size: 'md' }]);
  assert.deepEqual(Object.keys(api.partApis), ['item', 'group', 'badge', 'tag']);
  assert.deepEqual(api.partApis.item.member, 'Item');
  // A part is read like the root, from <Name><Member>OwnProps and its own function: an inline forwardRef,
  // a wrapper const, a top-level function declaration, and a top-level const each supply their defaults.
  const { item, group, badge, tag } = api.partApis;
  assert.deepEqual([item.props, item.events, item.defaults], [['value', 'tone'], ['pick'], { tone: 'quiet' }]);
  assert.deepEqual([item.propDetails.value.required, item.propDetails.tone.enum, Object.keys(item)], [true, ['quiet', 'loud'], ['member', 'props', 'events', 'defaults', 'propDetails', 'eventDetails', 'types']]);
  assert.deepEqual([group.member, group.props, group.defaults, group.propDetails.heading.type], ['Group', ['heading'], {}, { kind: 'host', name: 'React.ReactNode' }]);
  assert.deepEqual([badge.member, badge.defaults, tag.member, tag.defaults], ['Badge', { count: 1 }, 'Tag', { label: 'Tag' }]);
  // Without the source, as when the packed declarations are read, a part is its typed block alone.
  const typed = read(all, { parts: { item: 'Item' }, source: undefined });
  assert.deepEqual(Object.keys(typed.partApis.item), ['member', 'props', 'events', 'propDetails', 'eventDetails', 'types']);
  assert.equal(Object.hasOwn(typed, 'defaults'), false);
  // Without parts, the root's block is all there is.
  assert.equal(Object.hasOwn(read(all), 'partApis'), false);

  // Root = <the callable> is how ListBox, GridList, and Select name their root, and omitting Root does too.
  assert.deepEqual(read('Thing.Item = forwardRef(' + callableItem + ');', { parts: { item: 'Item' } }).defaults, { size: 'md' });
  // Any other Root is a different component than the export, and the root must then be named.
  const otherRoot = (value) => `Thing.Root = ${value};\n  Thing.Item = forwardRef(${callableItem});`;
  for (const value of ['Group', `forwardRef(${callableRender.replace("'md'", "'sm'")})`, 'ThingBadge']) {
    assert.throws(() => read(otherRoot(value), { parts: { item: 'Item' } }), (error) => error instanceof ApiExtractionError
      && /Thing: Thing\.Root is not Thing itself; name the root part \('Root'\) in the derived component list/u.test(error.message), value);
  }
  // Naming the part makes that component the root, as Menu's Root is not its callable.
  const rooted = read(otherRoot(`forwardRef(${callableRender.replace("'md'", "'sm'")})`), { part: 'Root', parts: { item: 'Item' } });
  assert.deepEqual(rooted.defaults, { size: 'sm' });
  assert.deepEqual(Object.keys(rooted.partApis), ['item']);
});

test('a callable compound\'s part is checked like the root: its props, its defaults, and its mapping', () => {
  const statics = `Thing.Root = Thing;
  Thing.Item = forwardRef(${callableItem});
  Thing.Group = Group;`;
  const source = callableSource({ inside: groupConst.trim(), statics });
  const reads = (parts, options = {}) => () => extract({ declarations: callableDeclarations, source, parts, ...options });
  const fails = (read, pattern, label) => assert.throws(read, (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  const cases = [
    ['a member the export lacks', reads({ item: 'Itm' }), /Thing\.Itm: the declarations do not declare ThingItmOwnProps/u],
    ['a member the declarations have and the wrapper does not assign', reads({ badge: 'Badge' }), /Thing\.Badge: the exported Thing has no Badge part assigned in its wrapper/u],
    ['a part without Mux UI-owned props', reads({ header: 'Header' }, { source: source.replace('Thing.Group = Group;', 'Thing.Header = forwardRef(function ThingHeader(props: Record<string, unknown>) { return props; });') }),
      /Thing\.Header: ThingHeaderOwnProps declares no Mux UI-owned prop; a part without Mux UI-owned props has no partApis entry/u],
    ['two anatomy parts for one member', reads({ item: 'Item', entry: 'Item' }), /Thing\.Item: item and entry both map to Item; a member has one anatomy part/u],
    ['the root part as a part', reads({ root: 'Root' }, { part: 'Root' }), /Thing\.Root: root maps to Root, which is the root part/u],
    ['an anatomy part that is not kebab-case', reads({ Item: 'Item' }), /Thing\.Item: parts maps an anatomy part, such as item, to an export member, such as Item; not Item to Item/u],
    ['a member that is not PascalCase', reads({ item: 'item' }), /Thing\.item: parts maps an anatomy part/u],
    ['a part prop its function does not destructure', reads({ item: 'Item' }, { source: source.replace('{ value, tone', '{ tone') }), /Thing\.Item\.value: the props parameter must destructure each Mux UI-owned prop/u],
    ['a part default the function executes', reads({ item: 'Item' }, { source: source.replace("tone = 'quiet'", 'tone').replace('[value, tone, onPick, props]', "[value, tone ?? 'quiet', onPick, props]") }),
      /Thing\.Item\.tone: tone \?\? \.\.\. falls back to a value the component executes; declare the default in the props parameter/u],
  ];
  for (const [label, read, pattern] of cases) fails(read, pattern, label);
  // The part\'s public props must carry its OwnProps unchanged, as the root\'s must.
  const redeclared = callableDeclarations.replace("export interface ThingItemProps extends ThingItemOwnProps, React.HTMLAttributes<HTMLDivElement> {}", "export interface ThingItemProps extends React.HTMLAttributes<HTMLDivElement> { value?: string; tone?: 'quiet' | 'loud'; onPick?: (value: string) => void }");
  fails(() => extract({ declarations: redeclared, source, parts: { item: 'Item' } }), /Thing\.Item\.value: the exported Thing\.Item's props redeclare value as optional string | undefined; ThingItemOwnProps declares required string/u, 'a redeclared part prop');
  // A part\'s type name resolves within its own block: two parts may share a type, and the blocks each define it.
  const shared = extract({
    declarations: `${callableDeclarations.replace('heading?: React.ReactNode;', 'heading?: ThingTone;').replace('tone?: \'quiet\' | \'loud\';', 'tone?: ThingTone;')}export type ThingTone = 'quiet' | 'loud';\n`,
    source,
    parts: { item: 'Item', group: 'Group' },
  });
  assert.deepEqual(shared.partApis.item.types, shared.partApis.group.types);
  assert.deepEqual(Object.keys(shared.partApis.item.types), ['ThingTone']);
  assert.deepEqual(shared.types, {});
});

test('a callable compound may name a part its own props must also carry, and a misnamed or short callable fails', () => {
  // Menu\'s callable is its List, while its root is Menu.Root, a different component.
  const declarations = `${header}export interface ThingOwnProps { open?: boolean; }
export interface ThingListOwnProps { items?: string[]; disabled?: boolean; }
export interface ThingRootProps extends ThingOwnProps, React.HTMLAttributes<HTMLDivElement> {}
export interface ThingListProps extends ThingListOwnProps, React.HTMLAttributes<HTMLDivElement> {}
export declare const Thing: React.ForwardRefExoticComponent<ThingListProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<ThingRootProps>;
  List: React.ForwardRefExoticComponent<ThingListProps & React.RefAttributes<HTMLDivElement>>;
};
`;
  const source = `import { forwardRef } from 'react';
export const Thing = (() => {
  const ThingRoot = forwardRef(function ThingRoot({ open = false }: Record<string, unknown>) { return open; });
  const Thing = forwardRef(function ThingList({ items, disabled = false }: Record<string, unknown>) { return [items, disabled]; });
  Thing.Root = ThingRoot;
  Thing.List = Thing;
  return Thing;
})();
`;
  const options = { part: 'Root', parts: { list: 'List' }, declarations, source };
  const api = extract({ ...options, callable: 'list' });
  assert.deepEqual([api.props, api.defaults, api.partApis.list.props, api.partApis.list.defaults], [['open'], { open: false }, ['items', 'disabled'], { disabled: false }]);
  assert.deepEqual(Object.keys(extract(options)), Object.keys(api), 'the check adds no data');
  const fails = (overrides, pattern, label) => assert.throws(() => extract({ ...options, callable: 'list', ...overrides }), (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  fails({ callable: 'popup' }, /Thing: callable names popup, which is not one of the parts/u, 'an unknown part');
  fails({ declarations: declarations.replace('React.ForwardRefExoticComponent<ThingListProps & React.RefAttributes<HTMLDivElement>> & {', 'React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>> & {') },
    /Thing \(callable\)\.items: the exported Thing \(callable\)'s props do not include items/u, 'a callable without the part\'s props');
  fails({ declarations: declarations.replace('export declare const Thing: React.ForwardRefExoticComponent<ThingListProps', 'export declare const Thing: React.ForwardRefExoticComponent<ThingListProps').replace('React.ForwardRefExoticComponent<ThingListProps & React.RefAttributes<HTMLDivElement>> & {', 'React.ForwardRefExoticComponent<Omit<ThingListProps, \'disabled\'> & { disabled: boolean } & React.RefAttributes<HTMLDivElement>> & {') },
    /Thing \(callable\)\.disabled: the exported Thing \(callable\)'s props redeclare disabled as required boolean; ThingListOwnProps declares optional boolean/u, 'a callable that changes a prop');
});

test('a part assigned in a wrapper is assigned once, to the returned const, as a component', () => {
  const read = (statics, options = {}) => extract({
    declarations: callableDeclarations,
    source: callableSource({ before: options.before ?? '', inside: options.inside ?? '', statics, after: options.after ?? '' }),
    parts: { item: 'Item' },
  });
  const item = `Thing.Item = forwardRef(${callableItem});`;
  assert.deepEqual(read(item).partApis.item.defaults, { tone: 'quiet' });
  const cases = [
    ['a part assigned twice', `${item}\n  ${item}`, {}, /Thing: the wrapper assigns Thing\.Item twice; /u],
    ['a part on a const that is not returned', `${item}\n  other.Item = forwardRef(${callableItem});`, { inside: 'const other = forwardRef(function Other() { return null; });' }, /Thing: the wrapper assigns other\.Item, but parts attach only to the returned const Thing; /u],
    ['a computed part', `${item}\n  Thing['Group'] = forwardRef(${callableItem});`, {}, /Thing: the wrapper runs a statement that is not a displayName or part assignment to one of its consts; /u],
    ['an Object.assign of parts', `${item}\n  Object.assign(Thing, { Group: forwardRef(${callableItem}) });`, {}, /Thing: the wrapper runs a statement that is not a displayName or part assignment to one of its consts; /u],
    ['a part named in lower case', `${item}\n  Thing.render = forwardRef(${callableItem});`, {}, /Thing: the wrapper assigns Thing\.render, which is neither displayName nor a part named in PascalCase; /u],
    ['a part that is an arrow', 'Thing.Item = () => null;', {}, /Thing: the wrapper assigns Thing\.Item something other than a forwardRef or memo call, one of its consts, or a top-level function or const; /u],
    ['a part that is a literal', 'Thing.Item = 5;', {}, /Thing: the wrapper assigns Thing\.Item something other than a forwardRef or memo call, one of its consts, or a top-level function or const; /u],
    ['a part that is a conditional', 'Thing.Item = replacement ? Thing : Thing;', {}, /Thing: the wrapper assigns Thing\.Item something other than a forwardRef or memo call, one of its consts, or a top-level function or const; /u],
    ['a part that is a call to something else', 'Thing.Item = register();', { before: 'declare function register(): never;\n' }, /Thing\.Item: register is not React's forwardRef or memo; a component's defaults/u],
    ['a part named by a name that is not a component', 'Thing.Item = Count;', { before: 'const Count = 5;\n' }, /Thing\.Item: Count must be a function, forwardRef, or memo call/u],
    ['a part named by a name that is not top-level', 'Thing.Item = Missing;', {}, /Thing\.Item: Missing is not a top-level function declaration or const in the component's source/u],
    ['a part that wraps itself', 'Thing.Item = Loop;', { before: 'const Loop = memo(Loop);\n' }, /Thing\.Item: Loop wraps itself/u],
  ];
  for (const [label, statics, options, pattern] of cases) {
    const text = callableSource({ before: options.before ?? '', inside: options.inside ?? '', statics });
    assert.throws(() => extract({ declarations: callableDeclarations, source: text, parts: { item: 'Item' } }), (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  }
  // A part written to later is not the part the extraction read.
  assert.throws(() => read(item, { after: 'Thing.Item = replacement as typeof Thing.Item;\n' }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u);
  assert.throws(() => read(item, { after: 'Object.assign(Thing, { Item: replacement });\n' }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u);
  assert.throws(() => read(`${item}`, { inside: '', after: "Object.defineProperty(Thing, 'Item', { value: replacement });\n" }), /Thing: the source writes to Thing beyond/u);
});

test('a part cannot be replaced through an alias of the component', () => {
  const declarations = callableDeclarations;
  const item = `Thing.Root = Thing;\n  Thing.Item = forwardRef(${callableItem});`;
  const read = (after, before = '') => extract({ declarations, source: callableSource({ before, statics: item, after }), parts: { item: 'Item' } });
  const aliased = (name) => ({
    ...writeForms(name, 'Item'),
    'an Object.assign': `Object.assign(${name}, { Item: replacement });`,
    'an Object.defineProperty': `Object.defineProperty(${name}, 'Item', { value: replacement });`,
    'a delete': `delete (${name} as { Item?: unknown }).Item;`,
    'a displayName': `${name}.displayName = label;`,
  });
  const through = /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u;
  // An alias is a variable that takes the component\'s value, however it is introduced and however many times it is passed on.
  const aliases = {
    'a const alias': 'const alias = Thing;\n',
    'a const alias through an assertion': 'const alias = Thing as unknown as { Item: unknown };\n',
    'a const alias through a satisfies': 'const alias = (Thing satisfies unknown) as { Item: unknown };\n',
    'a let alias assigned later': 'let alias: unknown;\nalias = Thing;\n',
    'a chain of aliases': 'const first = Thing;\nconst second = first;\nconst alias = second;\n',
  };
  const cases = Object.entries(aliases).flatMap(([setup, declaration]) => Object.entries(aliased('alias')).map(([label, statement]) => [
    `${setup}: ${label}`, () => read(`${declaration}${statement}\n`, 'declare const label: string;\n'), through,
  ]));
  assert.deepEqual(accepted(cases), []);
  // An alias is refused even when it only reads: no scan follows where a component goes once it is a value. A variable that is not the component writes nothing.
  assert.throws(() => read("const alias = Thing;\nvoid alias.Item;\n"), /Thing: the source uses Thing as a value, which could hand an alias of the component to code that replaces a part; /u);
  assert.deepEqual(read("let other: unknown;\nother = replacement;\nObject.assign({}, { a: 1 });\n").partApis.item.defaults, { tone: 'quiet' });
  // The same holds for a component read without a wrapper, and for a compound.
  const plain = (statement) => `import { forwardRef } from 'react';\ndeclare const replacement: unknown;\nexport const Thing = forwardRef(${callableRender});\nconst alias = Thing;\n${statement}\n`;
  assert.throws(() => extract({ declarations: ownProps("  size?: 'sm' | 'md';"), source: plain('alias.render = replacement;') }), /Thing: the source writes to Thing, which the component's defaults are read through/u);
  const compound = (statement) => `import { forwardRef } from 'react';\ndeclare const replacement: unknown;\nconst ThingRoot = forwardRef(${callableRender});\nexport const Thing = Object.freeze({ Root: ThingRoot });\nconst alias = Thing;\n${statement}\n`;
  assert.throws(() => extract({ declarations: compoundDeclarations, part: 'Root', source: compound('Object.assign(alias, { Root: replacement });') }), /Thing\.Root: the source writes to the compound Thing after declaring it/u);
  assert.throws(() => extract({ declarations: compoundDeclarations, part: 'Root', source: compound('(alias as { Root: unknown }).Root = replacement;') }), /Thing\.Root: the source writes to the compound Thing after declaring it/u);
});

// Following every way a value moves is a losing game, so the extractor admits the component and its parts as a value
// only where they are rendered: as a JSX tag or the first argument of React's createElement. Everything else fails, whether
// or not it is a write, because it could hand the part to code that replaces what it renders (`value.render = ...`).
test('the component and its parts are values only where they are rendered', () => {
  const item = `Thing.Root = Thing;\n  Thing.Item = forwardRef(${callableItem});`;
  const prelude = [
    "import * as React from 'react';",
    "import { createElement } from 'react';",
    'declare function use(...values: unknown[]): void;',
    'declare function identity<T>(value: T): T;',
    'function rewrite(value: unknown) { (value as { render: unknown }).render = replacement; }',
    '',
  ].join('\n');
  const read = (after, { statics = item, before = prelude, inside = '', sourceName } = {}) => extract({
    declarations: callableDeclarations,
    source: callableSource({ before, inside, statics, after }),
    sourceName,
    parts: { item: 'Item' },
  });
  const value = /Thing: the source uses (?:Thing|other) as a value, which could hand an alias of the component to code that replaces a part; /u;
  const list = `${item}\n  Thing.List = Thing;`;
  // A part passed anywhere but into a render: a call's argument, a closure, an assertion, an optional chain, a generic, an
  // indirect call, a spread, a literal, a template, a comma. Each of these publishes a default the part no longer renders.
  const passed = [
    ['an argument', 'rewrite(Thing.Item);'],
    ['an argument of a closure', 'const run = () => rewrite(Thing.Item);\nrun();'],
    ['a closure that returns it', 'const get = () => Thing.Item;\nrewrite(get());'],
    ['an assertion', 'rewrite(Thing.Item as unknown);'],
    ['a satisfies', 'rewrite(Thing.Item satisfies unknown);'],
    ['a non-null assertion', 'rewrite(Thing.Item!);'],
    ['an angle-bracket assertion', 'rewrite(<unknown>Thing.Item);'],
    ['parentheses', 'rewrite((Thing.Item));'],
    ['an optional chain', 'rewrite(Thing?.Item);'],
    ['an optional chain through an assertion', 'rewrite((Thing as { Item: unknown })?.Item);'],
    ['a generic call', 'rewrite(identity(Thing.Item));'],
    ['an explicit type argument', 'identity<unknown>(Thing.Item);'],
    ['a call method', 'rewrite.call(null, Thing.Item);'],
    ['an apply', 'rewrite.apply(null, [Thing.Item]);'],
    ['a Reflect.apply', 'Reflect.apply(rewrite, null, [Thing.Item]);'],
    ['a spread', 'rewrite(...[Thing.Item]);'],
    ['an array literal', 'rewrite([Thing.Item]);'],
    ['an object literal', 'rewrite({ item: Thing.Item });'],
    ['a template literal', 'rewrite(`${Thing.Item}`);'],
    ['a comma expression', 'rewrite((0, Thing.Item));'],
    ['a variable', 'const held = Thing.Item;\nrewrite(held);'],
    ['a destructured part', 'const { Item: held } = Thing;\nrewrite(held);'],
    ['an element access', "rewrite(Thing['Item']);"],
    ['a second argument of createElement', "createElement('div', null, Thing.Item);"],
    ['a prop of createElement', "createElement('div', { as: Thing.Item });"],
    ['the component as a createElement child', "createElement('div', null, Thing);"],
    ['the component as an argument', 'rewrite(Thing);'],
    ['the component returned from a function', 'const get = () => Thing;\nrewrite(get());'],
  ];
  assert.deepEqual(accepted(passed.map(([label, after]) => [label, () => read(`${after}\n`), value])), []);
  // The same holds when the component is its own List (Thing.List = Thing, Menu's callable shape): the alias is the component.
  const aliased = [
    ['the alias passed on', 'rewrite(Thing.List);'],
    ['the alias held', 'const held = Thing.List;\nrewrite(held);'],
    ['a part through the alias passed on', 'rewrite(Thing.List.Item);'],
    ['a part through the alias and an assertion', 'rewrite((Thing.List as { Item: unknown }).Item);'],
    ['the alias destructured', 'const { Item: held } = Thing.List;\nrewrite(held);'],
    ['the alias in an object', 'rewrite({ list: Thing.List });'],
    ['the alias as a createElement child', "createElement('div', null, Thing.List);"],
  ];
  assert.deepEqual(accepted(aliased.map(([label, after]) => [label, () => read(`${after}\n`, { statics: list }), value])), []);
  // A write through the alias is a write to the component, and Object.assign through it names its target.
  for (const write of ['Thing.List.Item = replacement;', 'Object.assign(Thing.List, { Item: replacement });', "Reflect.set(Thing.List, 'Item', replacement);"]) {
    assert.throws(() => read(`${write}\n`, { statics: list }), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u, write);
  }
  // A non-returned wrapper const is a component too, and so is a part that names it.
  const sibling = { inside: 'const other = forwardRef(function Other() { return null; });', statics: `${item}\n  Thing.Section = other;` };
  assert.throws(() => read('rewrite(Thing.Section);\n', sibling), value, 'a part that names the sibling const');
  const holder = (body) => ({ ...sibling, inside: `${sibling.inside}\n  const holder = forwardRef(function Holder() { ${body} return null; });`, statics: `${sibling.statics}\n  Thing.Holder = holder;` });
  assert.throws(() => read('', holder('rewrite(other);')), value, 'a sibling const as an argument');
  assert.throws(() => read('', holder('const held = other; rewrite(held);')), value, 'a sibling const held in a variable');
  assert.deepEqual(read('', holder('createElement(other, {});')).partApis.item.defaults, { tone: 'quiet' }, 'a sibling const rendered');
  // A shadowing createElement is not React's, and neither is one imported from another module.
  const shadow = ["import * as React from 'react';", 'declare function use(...values: unknown[]): void;', 'function createElement(type: unknown) { use(type); }', ''].join('\n');
  assert.throws(() => read('createElement(Thing.Item);\n', { before: shadow }), value, 'a local createElement');
  const foreign = ["import { createElement } from './elsewhere.js';", 'declare function use(...values: unknown[]): void;', ''].join('\n');
  assert.throws(() => read('createElement(Thing.Item);\n', { before: foreign }), value, 'a createElement from another module');
  assert.throws(() => read('React.createElement(Thing.Item);\n', { before: ["import * as React from './elsewhere.js';", ''].join('\n') }), value, 'a React from another module');
  // What the rule admits: the component and its parts rendered through React's createElement, however it is imported, with
  // parentheses and an assertion around the first argument; a type query and an export; and the wrapper's own assignments.
  const rendered = [
    ['a named createElement', "createElement(Thing.Item, {});"],
    ['the namespace import', "React.createElement(Thing.Item, null);"],
    ['the component itself', "createElement(Thing, {});"],
    ['the alias', "createElement(Thing.List, {});"],
    ['a part through the alias', "createElement(Thing.List.Item, {});"],
    ['parentheses', "createElement((Thing.Item), {});"],
    ['an assertion', "createElement(Thing.Item as never, {});"],
    ['a type query', 'export type ThingItem = typeof Thing.Item;\nexport type ThingSelf = typeof Thing;\nexport type ThingList = typeof Thing.List;'],
    ['an export of the binding', 'export { Thing as OtherThing };'],
  ];
  for (const [label, after] of rendered) assert.deepEqual(read(`${after}\n`, { statics: list }).partApis.item.defaults, { tone: 'quiet' }, label);
  const renamed = ["import { createElement as h } from 'react';", "import React from 'react';", ''].join('\n');
  assert.deepEqual(read('h(Thing.Item, {});\nReact.createElement(Thing.Item, {});\n', { before: renamed }).partApis.item.defaults, { tone: 'quiet' }, 'a renamed createElement and the default import');
  // A sibling renders another sibling, as Menu's list, item and header do (createElement between wrapper consts).
  const menu = {
    before: prelude,
    inside: [
      'const Header = forwardRef(function Header() { return null; });',
      'const Row = forwardRef(function Row() { return createElement(Header, {}, createElement(Thing, {}), React.createElement(Other, {})); });',
      'const Other = forwardRef(function Other() { return createElement(Row, {}); });',
    ].join('\n  '),
    statics: `${item}\n  Thing.Header = Header;\n  Thing.Row = Row;`,
  };
  assert.deepEqual(read('', menu).partApis.item.defaults, { tone: 'quiet' }, 'siblings render one another');
  assert.throws(() => read('', { ...menu, inside: `${menu.inside}\n  const Leak = forwardRef(function Leak() { rewrite(Other); return null; });` }), /Thing: the source uses Other as a value/u, 'a sibling passed to a function');
  // JSX is the other render sink: a tag is admitted, an attribute value is not.
  const jsx = (after) => read(after, { sourceName: 'thing.tsx', statics: list });
  assert.deepEqual(jsx('export const view = <Thing.Item value="a" />;\nexport const nested = <div><Thing.List><Thing.List.Item value="b" /></Thing.List></div>;\n').partApis.item.defaults, { tone: 'quiet' }, 'JSX tags');
  assert.throws(() => jsx('export const view = <div as={Thing.Item} />;\n'), value, 'a JSX attribute');
  assert.throws(() => jsx('export const view = <div>{Thing.Item}</div>;\n'), value, 'a JSX child');
  // A frozen compound is held to the same rule.
  const compound = (statement) => `import { forwardRef, createElement } from 'react';\ndeclare function use(...values: unknown[]): void;\ndeclare const replacement: unknown;\nconst ThingRoot = forwardRef(${callableRender});\nexport const Thing = Object.freeze({ Root: ThingRoot });\n${statement}\n`;
  const frozen = /Thing\.Root: the source uses the compound Thing as a value, which could hand an alias of it to code that replaces a part/u;
  for (const statement of ['const alias = Thing;\nvoid alias;', 'const { Root: alias } = Thing;\nvoid alias;', 'use(Thing.Root);', 'use(Thing);', 'createElement("div", null, Thing);']) {
    assert.throws(() => extract({ declarations: compoundDeclarations, part: 'Root', source: compound(statement) }), frozen, statement);
  }
  for (const statement of ['export type ThingRootType = typeof Thing.Root;', 'createElement(Thing.Root, {});']) {
    assert.equal(extract({ declarations: compoundDeclarations, part: 'Root', source: compound(statement) }).defaults.size, 'md', statement);
  }
});

// A module that imports itself holds its own component under a second name, so a write through that name cannot be seen.
test('a source that imports or requires itself fails extraction', () => {
  const read = (after, { before = '', sourceName } = {}) => extract({
    declarations: callableDeclarations,
    source: callableSource({ before, statics: `Thing.Root = Thing;\n  Thing.Item = forwardRef(${callableItem});`, after }),
    sourceName,
    parts: { item: 'Item' },
  });
  const replace = "forwardRef(function Replacement({ tone = 'loud' }: Record<string, unknown>) { return tone; })";
  const itself = (specifier) => new RegExp(`Thing: the source imports itself \\(${specifier.replaceAll('.', '\\.')}\\), which gives its own component a second name this scan does not follow`, 'u');
  // The repro: re-export under another name, import that name from the module, and replace the part.
  assert.throws(() => read(`export { Thing as Alias };\nimport { Alias } from './thing.js';\nAlias.Item = ${replace};\n`), itself('./thing.js'));
  assert.throws(() => read(`export { Thing as default };\nimport Alias from './thing.js';\nAlias.Item = ${replace};\n`), itself('./thing.js'));
  // Every spelling of the module's own path: with or without an extension, by its built names, and round about.
  for (const specifier of ['./thing', './thing.js', './thing.ts', './thing.mjs', './thing.d.ts', './sub/../thing.js']) {
    assert.throws(() => read(`import { Thing as Alias } from '${specifier}';\nvoid Alias;\n`), itself(specifier), specifier);
  }
  const forms = [
    ['a re-export', "export { Thing as Alias } from './thing.js';"],
    ['a star re-export', "export * from './thing.js';"],
    ['a type-only import', "import type { Thing as Alias } from './thing.js';"],
    ['a side-effect import', "import './thing.js';"],
    ['an import-equals', "import Alias = require('./thing.js');"],
    ['a dynamic import', "const loaded = await import('./thing.js');\nvoid loaded;"],
    ['a dynamic import in a function', "export async function load() { return import('./thing.js'); }"],
    ['a template dynamic import', 'const loaded = await import(`./thing.js`);\nvoid loaded;'],
    ['a require', "declare function require(name: string): { Thing: typeof Thing };\nconst loaded = require('./thing.js');\nvoid loaded;"],
  ];
  for (const [label, statement] of forms) assert.throws(() => read(`${statement}\n`), itself('./thing.js'), label);
  // A module named by an expression could be the source itself, so it fails too.
  assert.throws(() => read("const name = './thing' + '.js';\nconst loaded = await import(name);\nvoid loaded;\n"), /Thing: the source imports or requires a module by an expression, which may name the source itself; name it by a literal specifier/u, 'a computed dynamic import');
  assert.throws(() => read("declare function require(name: string): unknown;\nconst name = './thing.js';\nvoid require(name);\n"), /imports or requires a module by an expression/u, 'a computed require');
  // The source's own index module is also its directory.
  assert.throws(() => read("import { Thing as Alias } from '.';\nvoid Alias;\n", { sourceName: 'index.ts' }), /Thing: the source imports itself \(\.\)/u, 'a directory import of index');
  assert.throws(() => read("import { Thing as Alias } from './index.js';\nvoid Alias;\n", { sourceName: 'index.ts' }), itself('./index.js'), 'index by name');
  // Other modules, other directories, packages, and a sibling whose name merely starts with the source's are other modules.
  const others = "import { forwardRef as again } from 'react';\nimport { motion } from './thing-motion.js';\nimport { helper } from './helper.js';\nimport { far } from '../thing.js';\nimport { deep } from './thing/deep.js';\nimport type { Element } from 'react';\nvoid [again, motion, helper, far, deep];\nconst later = import('./other.js');\nvoid later;\n";
  assert.deepEqual(read(others).partApis.item.defaults, { tone: 'quiet' });
  assert.deepEqual(read("import { Thing as Alias } from '.';\nvoid Alias;\n").partApis.item.defaults, { tone: 'quiet' }, 'a directory import is not a thing.ts self import');
});

test('Object and Reflect members that write properties are only called directly, by name', () => {
  const item = `Thing.Root = Thing;\n  Thing.Item = forwardRef(${callableItem});`;
  const read = (after) => extract({ declarations: callableDeclarations, source: callableSource({ statics: item, after }), parts: { item: 'Item' } });
  const direct = /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u;
  const hidden = /Thing: the source reaches (?<spelling>[^ ]+) other than by calling Object or Reflect directly by name, as Object\.assign\(target, \.\.\.\); /u;
  // A direct call names its target, so the write scan sees it.
  for (const call of [
    "Object.assign(Thing, { Item: replacement });",
    "Object.defineProperty(Thing, 'Item', { value: replacement });",
    "Object.defineProperties(Thing, { Item: { value: replacement } });",
    "Object.setPrototypeOf(Thing, null);",
    "Reflect.set(Thing, 'Item', replacement);",
    "Reflect.defineProperty(Thing, 'Item', { value: replacement });",
    "Reflect.deleteProperty(Thing, 'Item');",
    "Reflect.setPrototypeOf(Thing, null);",
    "Reflect.set(Thing.Root, 'Item', replacement);",
  ]) assert.throws(() => read(`${call}\n`), direct, call);
  // A shadowing local named Object or Reflect is still read as the global: the call is a write whatever it is bound to.
  for (const call of [
    'const Object = { assign: (target: unknown) => target };\nObject.assign(Thing, { Item: replacement });',
    'const Reflect = { set: (target: unknown) => target };\nReflect.set(Thing, "Item", replacement);',
  ]) assert.throws(() => read(`${call}\n`), direct, call);
  // A mutator reached any other way hides its target, so it is refused wherever it is used and whatever it writes to.
  const spelled = [
    ['const assign = Object.assign;\nassign(Thing, { Item: replacement });', 'Object.assign'],
    ["const define = Object.defineProperty;\ndefine(Thing, 'Item', { value: replacement });", 'Object.defineProperty'],
    ['const define = Object.defineProperties;\ndefine(Thing, { Item: { value: replacement } });', 'Object.defineProperties'],
    ['const set = Object.setPrototypeOf;\nset(Thing, null);', 'Object.setPrototypeOf'],
    ["const set = Reflect.set;\nset(Thing, 'Item', replacement);", 'Reflect.set'],
    ["const define = Reflect.defineProperty;\ndefine(Thing, 'Item', { value: replacement });", 'Reflect.defineProperty'],
    ["Object['assign'](Thing, { Item: replacement });", 'Object[…]'],
    ["Object[`assign`](Thing, { Item: replacement });", 'Object[…]'],
    ["const key = 'assign';\nObject[key](Thing, { Item: replacement });", 'Object[…]'],
    ["Reflect['set'](Thing, 'Item', replacement);", 'Reflect[…]'],
    ['const { assign } = Object;\nassign(Thing, { Item: replacement });', 'Object'],
    ['const { set } = Reflect;\nset(Thing, "Item", replacement);', 'Reflect'],
    ['const O = Object;\nO.assign(Thing, { Item: replacement });', 'Object'],
    ['const R = Reflect;\nR.set(Thing, "Item", replacement);', 'Reflect'],
    ['use(Object);', 'Object'],
    ['globalThis.Object.assign(Thing, { Item: replacement });', 'globalThis.Object'],
    ['const { assign } = globalThis.Object;\nassign(Thing, { Item: replacement });', 'globalThis.Object'],
    ["globalThis['Object'].assign(Thing, { Item: replacement });", 'globalThis[…]'],
    ["const g = globalThis;\ng.Object.assign(Thing, { Item: replacement });", 'globalThis'],
    ['[Object.assign][0](Thing, { Item: replacement });', 'Object.assign'],
    ['Object.assign.call(null, Thing, { Item: replacement });', 'Object.assign'],
    ['const target = { assign: Object.assign };\ntarget.assign(Thing, { Item: replacement });', 'Object.assign'],
    // The Object constructor reached without naming it: the constructor of any plain object.
    ['({}).constructor.assign(Thing, { Item: replacement });', '….constructor.assign'],
    ["const plain = {};\nplain.constructor.defineProperty(Thing, 'Item', { value: replacement });", 'plain.constructor.defineProperty'],
    ["({})['constructor'].assign(Thing, { Item: replacement });", '…[…].assign'],
    ["({})['constructor']['assign'](Thing, { Item: replacement });", '…[…][…]'],
  ];
  for (const [statement, spelling] of spelled) {
    assert.throws(() => read(`declare function use(...values: unknown[]): void;\n${statement}\n`), (error) => error instanceof ApiExtractionError && hidden.exec(error.message)?.groups.spelling === spelling, statement);
  }
  // The component handed to a method of its own is a value like any other.
  assert.throws(() => read('Thing.assign(Thing, { Item: replacement });\n'), /Thing: the source uses Thing as a value/u, 'the component as a receiver');
  // The name alone is not the Object method: the source's own classes, maps and objects keep their assign, set and defineProperty.
  const own = [
    'class Selection { assign() {} defineProperty() {} setPrototypeOf() {} defineProperties() {} }\nnew Selection().assign();\nnew Selection().defineProperty();\nnew Selection().setPrototypeOf();\nnew Selection().defineProperties();',
    'const foo = { defineProperty: (_name: string) => 1, assign: (_value: object) => 2 };\nfoo.defineProperty("x");\nfoo.assign({});',
    'const map = new Map<string, number>();\nmap.set("a", 1);\nconst params = new URLSearchParams();\nparams.set("a", "b");\nvoid map.get("a");',
    'class Box { constructor(public value: number) {} assign(other: Box) { this.value = other.value; } }\nconst box = new Box(1);\nbox.assign(new Box(2));\nvoid box.constructor;',
  ];
  for (const statement of own) assert.deepEqual(read(`${statement}\n`).partApis.item.defaults, { tone: 'quiet' }, statement);
  // What reads and writes something else is untouched: other Object and Reflect members, and a mutator called on another target.
  const harmless = "const copy = Object.assign({}, { a: 1 });\nObject.defineProperty(copy, 'b', { value: 1 });\nvoid Object.keys(copy);\nvoid Reflect.get(copy, 'a');\nvoid Reflect.has(copy, 'a');\nconst freeze = Object.freeze;\nvoid freeze(copy);\n";
  assert.deepEqual(read(harmless).partApis.item.defaults, { tone: 'quiet' });
});

test('a part read through a top-level const or function is checked for writes like any component', () => {
  const read = (after, inside = '') => extract({
    declarations: callableDeclarations,
    source: callableSource({ before: callableBefore, inside, statics: 'Thing.Root = Thing;\n  Thing.Badge = ThingBadge;\n  Thing.Tag = ThingTag;', after }),
    parts: { badge: 'Badge', tag: 'Tag' },
  });
  assert.deepEqual(read('').partApis.tag.defaults, { label: 'Tag' });
  const through = (name) => new RegExp(`Thing: the source writes to ${name}, which the component's defaults are read through, beyond a literal displayName assignment; `, 'u');
  assert.deepEqual(read("ThingTag.displayName = 'Tag';\n").partApis.tag.defaults, { label: 'Tag' }, 'a literal displayName write stays allowed');
  assert.throws(() => read('(ThingTag as { render?: unknown }).render = replacement;\n'), through('ThingTag'));
  assert.throws(() => read('const alias = ThingTag;\n(alias as { render?: unknown }).render = replacement;\n'), through('ThingTag'));
  assert.throws(() => read('Object.assign(ThingTag, { render: replacement });\n'), through('ThingTag'));
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

test('derived part APIs are validated across blocks: one type name has one definition, and the document merges under the anatomy', async () => {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'derived-parts-'));
  try {
    const declarationRoot = join(root, 'ts');
    const repositoryRoot = join(root, 'repository');
    mkdirSync(declarationRoot);
    mkdirSync(join(repositoryRoot, 'packages/react/src'), { recursive: true });
    const declarations = (partTone) => `${header}${partTone}
export type ThingTone = 'quiet' | 'loud';
export interface ThingOwnProps { tone?: ThingTone; }
export interface ThingItemOwnProps { tone?: PartTone; }
export interface ThingProps extends ThingOwnProps, React.HTMLAttributes<HTMLDivElement> {}
export interface ThingItemProps extends ThingItemOwnProps, React.HTMLAttributes<HTMLDivElement> {}
export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> & {
  Item: React.ForwardRefExoticComponent<ThingItemProps & React.RefAttributes<HTMLDivElement>>;
};
`;
    // An imported type named ThingTone is a second Mux UI-owned type of that name, in the part's block only.
    writeFileSync(join(declarationRoot, 'other.d.ts'), "export type ThingTone = 'a' | 'b';\n");
    const components = [{ slug: 'thing', name: 'Thing', source: 'packages/react/src/thing.ts', parts: { item: 'Item' } }];
    const derive = (partTone, itemDefault) => {
      writeFileSync(join(repositoryRoot, 'packages/react/src/thing.ts'), `import { forwardRef } from 'react';
export const Thing = (() => {
  const Thing = forwardRef(function Thing({ tone = 'quiet' }: Record<string, unknown>) { return tone; });
  Thing.Item = forwardRef(function ThingItem({ tone = '${itemDefault}' }: Record<string, unknown>) { return tone; });
  return Thing;
})();
`);
      writeFileSync(join(declarationRoot, 'thing.d.ts'), declarations(partTone));
      return deriveApis({ packageRoot: join(root, 'package'), repositoryRoot, declarationRoot, components });
    };
    // The same type under another name is no conflict; the same name with two definitions is one.
    const same = (await derive('type PartTone = ThingTone;', 'loud')).get('thing');
    assert.deepEqual(Object.keys(same.api.partApis.item.types), ['PartTone', 'ThingTone']);
    assert.deepEqual(same.api.partApis.item.types.ThingTone, same.api.types.ThingTone);
    await assert.rejects(derive("import type { ThingTone as PartTone } from './other.js';", 'a'), /api\/partApis\/item\/types\/ThingTone is defined differently from \$\/api\/types\/ThingTone/u);

    // The merged record carries the part APIs under its own anatomy parts, and nowhere else.
    const thing = { id: 'muxui:component:thing', anatomy: ['root', 'item'], bindings: { 'web.react': { strategy: 'direct' } } };
    assert.deepEqual(withDerivedApi(thing, new Map([['thing', same]])).bindings['web.react'].api.partApis, same.api.partApis);
    assert.throws(() => withDerivedApi({ ...thing, anatomy: ['root'] }, new Map([['thing', same]])), /partApis\/item is not a part of the component anatomy/u);
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
