import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { DERIVED_API_COMPONENTS, deriveApis, extractionComponent, syncDerivedApis, withDerivedApi } from '../api-extraction/derived-apis.mjs';
import { ApiExtractionError, HOST_ALLOWLIST, HOST_OVERLAPS, assertHostOverlaps, extractApis, hostEntryKey } from '../api-extraction/extract.mjs';

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

// `outside` holds files beside the package under test, such as a stand-in node_modules/@types/react: when given, the
// declarations and the sources sit in a package/ directory of their own, so those files are not Mux UI-owned.
function extract({ declarations, source, sourceName = 'thing.ts', hostAllowlist, hostOverlaps, files = {}, outside = {}, part, callable, also, parts }) {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const base = mkdtempSync(join(packageRoot, 'build', 'api-extraction-'));
  const root = Object.keys(outside).length > 0 ? join(base, 'package') : base;
  try {
    mkdirSync(root, { recursive: true });
    for (const [name, text] of Object.entries(outside)) {
      mkdirSync(dirname(join(base, name)), { recursive: true });
      writeFileSync(join(base, name), text);
    }
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    writeFileSync(join(root, 'thing.d.ts'), declarations);
    if (source !== undefined) writeFileSync(join(root, sourceName), source);
    const component = {
      name: 'Thing',
      ...(part === undefined ? {} : { part }),
      ...(callable === undefined ? {} : { callable }),
      ...(also === undefined ? {} : { also }),
      ...(parts === undefined ? {} : { parts }),
      declarations: join(root, 'thing.d.ts'),
      ...(source === undefined ? {} : { source: join(root, sourceName) }),
    };
    return extractApis({ declarationRoot: root, components: [component], ...(hostAllowlist ? { hostAllowlist } : {}), ...(hostOverlaps ? { hostOverlaps } : {}) }).get('Thing');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function rejects(declarations, pattern, options = {}, rule) {
  assert.throws(() => extract({ declarations, ...options }), (error) => {
    assert.ok(error instanceof ApiExtractionError, error.stack);
    assert.match(error.message, pattern);
    return true;
  }, rule);
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
    ['  bad?: readonly [string, number];', '', /Thing\.bad: a type operator other than readonly T\[\] is not in the grammar/u],
    ['  bad?: { read?(): string };', '', /Thing\.bad\.read: an optional method is not in the grammar/u],
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

test('the shipped allowlist admits a mutable Set<string> and no other Set', () => {
  const shipped = extract({ declarations: ownProps('  selected?: Set<string>;\n  onSelectionChange?: (keys: Set<string>) => void;\n  fixed?: ReadonlySet<string>;') });
  assert.deepEqual(shipped.propDetails.selected.type, host('Set', keyword('string')));
  assert.deepEqual(shipped.eventDetails.selectionChange.type.parameters, [{ name: 'keys', type: host('Set', keyword('string')), required: true }]);
  // ReadonlySet<string> is its own entry, so a mutable Set is not read as one, and neither admits the other.
  assert.deepEqual(shipped.propDetails.fixed.type, host('ReadonlySet', keyword('string')));
  const setOnly = [host('Set', keyword('string'))];
  rejects(ownProps('  bad?: ReadonlySet<string>;'), /Thing\.bad -> ReadonlySet: ReadonlySet<string> is not an application on the host allowlist/u, { hostAllowlist: setOnly });
  rejects(ownProps('  bad?: Set<string>;'), /Thing\.bad -> Set: Set<string> is not an application on the host allowlist/u, { hostAllowlist: [host('ReadonlySet', keyword('string'))] });
  const cases = [
    ['  bad?: Set<number>;', /Thing\.bad -> Set: Set<number> is not an application on the host allowlist/u],
    ['  bad?: Set<string | number>;', /Thing\.bad -> Set: Set<string \| number> is not an application on the host allowlist/u],
    ["  bad?: Set<'a' | 'b'>;", /Thing\.bad -> Set: Set<"a" \| "b"> is not an application on the host allowlist/u],
    ['  bad?: Set<Set<string>>;', /Thing\.bad -> Set: Set<Set<string>> is not an application on the host allowlist/u],
    ['  bad?: Set;', /Thing\.bad -> Set: Set is outside @muxui\/react and not in the host allowlist/u],
    ['  bad?: Map<string, string>;', /Thing\.bad -> Map: Map<string, string> is not an application on the host allowlist/u],
    ['  bad?: WeakSet<object>;', /Thing\.bad -> WeakSet<0>: object is not in the grammar/u],
    ['  bad?: Iterable<string>;', /Thing\.bad -> Iterable: Iterable<string> is not an application on the host allowlist/u],
    ['  bad?: Readonly<Set<string>>;', /Thing\.bad -> Readonly: Readonly<Set<string>> is not an application on the host allowlist/u],
  ];
  // The shipped allowlist and the single entry refuse each of them alike.
  for (const [members, pattern] of cases) {
    rejects(ownProps(members), pattern);
    rejects(ownProps(members), pattern, { hostAllowlist: setOnly });
  }
  // A Mux UI-owned type named Set is never the host Set.
  rejects(ownProps('  bad?: Set<string>;', 'export interface Set<T> { readonly values: T[] }\n'), /Thing\.bad -> Set: Set is a Mux UI-owned type; it takes no type arguments/u);
});

test('the shipped allowlist admits Record<string, React.ReactNode> and no other Record', () => {
  const values = host('Record', keyword('string'), host('React.ReactNode'));
  const shipped = extract({ declarations: ownProps('  values?: Record<string, React.ReactNode>;') });
  assert.deepEqual(shipped.propDetails.values.type, values);
  // As the member of an item, the way a Table row holds its values.
  const row = extract({ declarations: ownProps('  row?: ThingRow;', 'export interface ThingRow { id?: string; values?: Record<string, React.ReactNode> }\n') });
  assert.deepEqual(row.types.ThingRow.type.members.at(-1).type, values);
  // An index signature of the same shape is another type: a sole signature reads as a record of its own, and its keyof is wider.
  assert.deepEqual(extract({ declarations: ownProps('  values?: { [columnId: string]: React.ReactNode };') }).propDetails.values.type, { kind: 'record', value: host('React.ReactNode'), readonly: false });
  const recordOnly = [host('Record', keyword('string'), host('React.ReactNode')), 'React.ReactNode'];
  const cases = [
    ['  bad?: Record<number, React.ReactNode>;', /Thing\.bad -> Record: Record<number, React\.ReactNode> is not an application on the host allowlist/u],
    ['  bad?: Record<string, string>;', /Thing\.bad -> Record: Record<string, string> is not an application on the host allowlist/u],
    ['  bad?: Record<string, React.ReactNode | undefined>;', /Thing\.bad -> Record: Record<string, React\.ReactNode \| undefined> is not an application on the host allowlist/u],
    ['  bad?: Record<string, React.ReactElement>;', /Thing\.bad -> Record<1> -> React\.ReactElement: React\.ReactElement is outside @muxui\/react and not in the host allowlist|Thing\.bad -> Record: Record<string, React\.ReactElement> is not an application on the host allowlist/u],
    ["  bad?: Record<'a' | 'b', React.ReactNode>;", /Thing\.bad -> Record: Record<"a" \| "b", React\.ReactNode> is not an application on the host allowlist/u],
    ['  bad?: Record;', /Thing\.bad -> Record: Record is outside @muxui\/react and not in the host allowlist/u],
    ['  bad?: Readonly<Record<string, React.ReactNode>>;', /Thing\.bad -> Readonly: Readonly<Record<string, React\.ReactNode>> is not an application on the host allowlist/u],
    ['  bad?: Partial<Record<string, React.ReactNode>>;', /Thing\.bad -> Partial: Partial<Record<string, React\.ReactNode>> is not an application on the host allowlist/u],
    ['  bad?: Record<string, React.ReactNode>[];', null],
  ];
  for (const [members, pattern] of cases) {
    if (pattern === null) continue;
    rejects(ownProps(members), pattern);
    rejects(ownProps(members), pattern, { hostAllowlist: recordOnly });
  }
  // An array of the admitted application is the application inside an array, which the grammar reads.
  assert.deepEqual(extract({ declarations: ownProps('  bad?: Record<string, React.ReactNode>[];') }).propDetails.bad.type, { kind: 'array', element: values, readonly: false });
  // A Mux UI-owned type named Record is never the host Record.
  rejects(ownProps('  bad?: Record<string, React.ReactNode>;', 'export interface Record<K, V> { readonly key: K; readonly value: V }\n'), /Thing\.bad -> Record: Record is a Mux UI-owned type; it takes no type arguments/u);
  // The same name used bare is that Mux UI-owned type, not the host one.
  assert.deepEqual(extract({ declarations: ownProps('  bad?: Record;', 'export interface Record { readonly id: string }\n') }).propDetails.bad.type, { kind: 'reference', name: 'Record' });
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
const OWNED_TEXTAREA_PROPS = ['value', 'defaultValue', 'children', 'dangerouslySetInnerHTML'];
const OMITTED_TEXTAREA_ATTRIBUTES = host('Omit', host('React.TextareaHTMLAttributes', host('HTMLTextAreaElement')), { kind: 'union', members: OWNED_TEXTAREA_PROPS.map((value) => ({ kind: 'literal', value })) });

// React's bivariant event handler aliases (Decision 0031, tranche 8c): a member typed React.UIEventHandler<HTMLDivElement> keeps the
// alias in the public type, so a handler declared with a narrower event stays assignable, and the catalog reads it as the function it
// stands for. The reader takes the alias from its declarations in @types/react, never from its name.
const SCROLL_ALLOWLIST = Object.freeze(['HTMLDivElement', host('React.UIEvent', host('HTMLDivElement'))]);
const scrollEvent = host('React.UIEvent', host('HTMLDivElement'));
const handlerFunction = (parameter, eventType) => ({ kind: 'function', parameters: [{ name: parameter, type: eventType, required: true }], returns: keyword('void') });

test('a React event handler alias reads as the function it stands for, named by its declarations and not by its name', () => {
  const alias = extract({ declarations: ownProps('  /** Called on scroll. */\n  onScroll?: React.UIEventHandler<HTMLDivElement>;'), hostAllowlist: SCROLL_ALLOWLIST });
  assert.deepEqual(alias.events, ['scroll']);
  assert.deepEqual(alias.eventDetails.scroll, { prop: 'onScroll', type: handlerFunction('event', scrollEvent), required: false, description: 'Called on scroll.' });
  // The catalog text is the one the restated function extracts to.
  const restated = extract({ declarations: ownProps('  /** Called on scroll. */\n  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;'), hostAllowlist: SCROLL_ALLOWLIST });
  assert.deepEqual(alias, restated);
  // Imported by name, or under another local name: the symbol is React's alias either way.
  for (const [imports, written] of [
    ["import type { UIEventHandler } from 'react';", 'UIEventHandler<HTMLDivElement>'],
    ["import type { UIEventHandler as ScrollHandler } from 'react';", 'ScrollHandler<HTMLDivElement>'],
  ]) {
    assert.deepEqual(extract({ declarations: ownProps(`  onScroll?: ${written};`, imports), hostAllowlist: SCROLL_ALLOWLIST }).eventDetails.scroll.type, handlerFunction('event', scrollEvent), written);
  }
  // Any React alias of that shape reads the same way: its event type and its element come from its own declaration.
  const form = extract({ declarations: ownProps('  onSend?: React.FormEventHandler<HTMLFormElement>;\n  onMove?: React.ReactEventHandler<HTMLFormElement>;'), hostAllowlist: ['HTMLFormElement', host('React.FormEvent', host('HTMLFormElement')), host('React.SyntheticEvent', host('HTMLFormElement'))] });
  assert.deepEqual(form.eventDetails.send.type, handlerFunction('event', host('React.FormEvent', host('HTMLFormElement'))));
  assert.deepEqual(form.eventDetails.move.type, handlerFunction('event', host('React.SyntheticEvent', host('HTMLFormElement'))));
  // The event is an exact host application on the allowlist, like any other: one the list lacks is refused.
  rejects(ownProps('  onScroll?: React.UIEventHandler<HTMLDivElement>;'), /Thing\.onScroll -> React\.UIEventHandler\(event\): React\.UIEvent<HTMLDivElement> is not an application on the host allowlist/u, { hostAllowlist: ['HTMLDivElement'] });
  rejects(ownProps('  onScroll?: React.UIEventHandler<HTMLButtonElement>;'), /Thing\.onScroll -> React\.UIEventHandler\(event\)<0> -> HTMLButtonElement: HTMLButtonElement is outside @muxui\/react and not in the host allowlist/u, { hostAllowlist: SCROLL_ALLOWLIST });
});

test('only React\'s own handler aliases are read: a local alias, a bare EventHandler, a merged event type, and another alias shape are not', () => {
  const read = (members, extra, pattern, hostAllowlist = SCROLL_ALLOWLIST) => rejects(ownProps(members, extra), pattern, { hostAllowlist });
  // A local alias named like React's, restating it or copying its whole declaration, is a Mux UI-owned type, which takes no type arguments.
  read('  onScroll?: UIEventHandler<HTMLDivElement>;', 'export type UIEventHandler<T> = (event: React.UIEvent<T>) => void;\n',
    /Thing\.onScroll -> UIEventHandler: UIEventHandler is a Mux UI-owned type; it takes no type arguments/u);
  read('  onScroll?: UIEventHandler<HTMLDivElement>;', `export type EventHandler<E extends React.SyntheticEvent<any>> = { bivarianceHack(event: E): void }["bivarianceHack"];
export type UIEventHandler<T = Element> = EventHandler<React.UIEvent<T>>;
`, /Thing\.onScroll -> UIEventHandler: UIEventHandler is a Mux UI-owned type; it takes no type arguments/u);
  // The bare EventHandler<E> is no alias of an event type but a host generic, which only its own exact entry admits, as the host type it is and never as a function.
  read('  scroller?: React.EventHandler<React.UIEvent<HTMLDivElement>>;', '', /Thing\.scroller -> React\.EventHandler: React\.EventHandler<React\.UIEvent<HTMLDivElement>> is not an application on the host allowlist/u);
  assert.deepEqual(extract({ declarations: ownProps('  scroller?: React.EventHandler<React.UIEvent<HTMLDivElement>>;'), hostAllowlist: [...SCROLL_ALLOWLIST, host('React.EventHandler', scrollEvent)] }).propDetails.scroller.type, host('React.EventHandler', scrollEvent));
  read('  onScroll?: React.EventHandler<React.UIEvent<HTMLDivElement>>;', '', /Thing\.onScroll: an on<Event> prop must be a function type/u, [...SCROLL_ALLOWLIST, host('React.EventHandler', scrollEvent)]);
  // A handler alias with a second, defaulted type parameter is read when its event is on the allowlist, and refused like any other when it is not.
  read('  onChange?: React.ChangeEventHandler<HTMLDivElement>;', '', /Thing\.onChange -> React\.ChangeEventHandler\(event\): React\.ChangeEvent<HTMLDivElement> is not an application on the host allowlist/u);
  // A package declaration that merges into React's event type makes it no React type alone, so the alias over it is not read.
  read('  onScroll?: React.UIEventHandler<HTMLDivElement>;', "declare module 'react' { interface UIEvent<T> { merged: T } }\n", /Thing\.onScroll -> React\.UIEventHandler: React\.UIEventHandler<HTMLDivElement> is not an application on the host allowlist/u);
});

// A stand-in @types/react beside the declarations, so the shape the reader requires can be varied one rule at a time: a type
// declared in a node_modules/@types/react directory is React's to the extractor, and nothing in it is named by the reader.
const FAITHFUL_HANDLER = 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: E): void }["bivarianceHack"];';
const standInReact = ({
  handler = FAITHFUL_HANDLER,
  alias = 'export type UIEventHandler<T = Element> = EventHandler<UIEvent<T>>;',
  // The handler alias is declared in React's types, but the event type or the EventHandler it builds on is declared elsewhere.
  elsewhere = [],
} = {}) => ({
  'node_modules/@types/react/package.json': JSON.stringify({ name: '@types/react', version: '0.0.0', types: 'index.d.ts' }),
  'node_modules/@types/react/index.d.ts': `${elsewhere.includes('handler') ? "import type { EventHandler } from 'elsewhere';" : handler}
export interface SyntheticEvent<T = Element, E = Event> { readonly currentTarget: EventTarget & T; readonly nativeEvent: E }
${elsewhere.includes('event') ? "import type { UIEvent } from 'elsewhere';" : 'export interface UIEvent<T = Element, E = Event> extends SyntheticEvent<T, E> { readonly detail: number }'}
${alias}
`,
  ...(elsewhere.length === 0 ? {} : {
    'node_modules/elsewhere/package.json': JSON.stringify({ name: 'elsewhere', version: '0.0.0', types: 'index.d.ts' }),
    'node_modules/elsewhere/index.d.ts': `import type { SyntheticEvent } from '@types/react';\n${FAITHFUL_HANDLER}\nexport interface UIEvent<T = Element, E = Event> extends SyntheticEvent<T, E> { readonly detail: number }\n`,
  }),
});
const standInThing = "import type { UIEventHandler } from 'react';\nexport interface ThingOwnProps { onScroll?: UIEventHandler<HTMLDivElement>; }\nexport interface ThingProps extends ThingOwnProps {}\nexport declare const Thing: (props: ThingProps) => null;\n";

test('a handler alias is read by the shape of its declarations in @types/react: one bivariance hack method over the alias\'s own type parameter', () => {
  const read = (variant) => extract({ declarations: standInThing, outside: standInReact(variant), hostAllowlist: SCROLL_ALLOWLIST });
  // The faithful shape reads, and the parameter takes the name its method declares.
  assert.deepEqual(read().eventDetails.scroll.type, handlerFunction('event', scrollEvent));
  assert.deepEqual(read({ handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(evt: E): void }["bivarianceHack"];' }).eventDetails.scroll.type, handlerFunction('evt', scrollEvent));
  // Each rule of the shape, broken alone, leaves the alias an unlisted host application.
  const refused = /Thing\.onScroll -> UIEventHandler: React\.UIEventHandler<HTMLDivElement> is not an application on the host allowlist/u;
  for (const [rule, variant] of [
    ['a strict function type is no bivariance hack', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = (event: E) => void;' }],
    ['the hack method takes one parameter', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: E, other: string): void }["bivarianceHack"];' }],
    ['the hack method returns void', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: E): string }["bivarianceHack"];' }],
    ['the object type has the one method', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: E): void; other(): void }["bivarianceHack"];' }],
    ['the method takes the alias\'s type parameter', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: SyntheticEvent): void }["bivarianceHack"];' }],
    ['the index names the method', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event: E): void }["other"];' }],
    ['the method is a method, not a function-typed property', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack: (event: E) => void }["bivarianceHack"];' }],
    // Each of these reads as a required positional event callback if the shape is only checked loosely, and is not one.
    ['the method is not optional, which would allow undefined on a required prop', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack?(event: E): void }["bivarianceHack"];' }],
    ['the one parameter is not a this parameter, which takes no positional argument', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(this: E): void }["bivarianceHack"];' }],
    ['the one parameter is not optional', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(event?: E): void }["bivarianceHack"];' }],
    ['the one parameter is not a rest parameter', { handler: 'export type EventHandler<E extends SyntheticEvent<any>> = { bivarianceHack(...event: E): void }["bivarianceHack"];' }],
    ['the handler alias passes its own type parameter', { alias: 'export type UIEventHandler<T = Element> = EventHandler<UIEvent<Element>>;' }],
    ['the handler alias takes one type parameter', { alias: 'export type UIEventHandler<T = Element, U = Element> = EventHandler<UIEvent<T>>;' }],
    ['the event type takes the alias\'s type parameter alone', { alias: 'export type UIEventHandler<T = Element> = EventHandler<UIEvent<T, Event>>;' }],
    ['the handler alias applies the handler to one event type', { alias: 'export type UIEventHandler<T = Element> = EventHandler<UIEvent<T>, T>;' }],
    ['the handler alias is a reference, not a function', { alias: 'export type UIEventHandler<T = Element> = (event: UIEvent<T>) => void;' }],
    ['the EventHandler it builds on is declared in React\'s types', { elsewhere: ['handler'] }],
    ['the event type it names is declared in React\'s types', { elsewhere: ['event'] }],
  ]) {
    assert.throws(() => read(variant), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, refused, rule);
      return true;
    }, rule);
  }
});

test('a React event handler alias is the whole type of a member and names its element', () => {
  const read = (members, pattern) => rejects(ownProps(members), pattern, { hostAllowlist: SCROLL_ALLOWLIST });
  const refused = /one of React's event handler aliases, which is in the grammar only as the whole type of a member/u;
  // Inside a union, an array, a parameter, parentheses, or a record, it is not read.
  read('  onScroll?: React.UIEventHandler<HTMLDivElement> | null;', refused);
  read('  onScroll?: React.UIEventHandler<HTMLDivElement> | undefined;', refused);
  read('  onScroll?: (React.UIEventHandler<HTMLDivElement>);', refused);
  read('  onScroll?: React.UIEventHandler<HTMLDivElement>[];', refused);
  read('  onScroll?: (handler: React.UIEventHandler<HTMLDivElement>) => void;', refused);
  read('  scrollers?: { readonly [key: string]: React.UIEventHandler<HTMLDivElement> };', refused);
  // Without a type argument it names no element, and its default is Element, which no entry admits.
  read('  onScroll?: React.UIEventHandler;', /one of React's event handler aliases and needs one type argument naming the element/u);
  // A member that is not an on<Event> prop may be one, and is a function; an on<Event> prop may not be a union of one.
  assert.deepEqual(extract({ declarations: ownProps('  scroller?: React.UIEventHandler<HTMLDivElement>;'), hostAllowlist: SCROLL_ALLOWLIST }).propDetails.scroller.type, handlerFunction('event', scrollEvent));
});

// React's ChangeEventHandler takes the element and the event's target, and the use names the element alone, so the serialized event leaves
// the target to the event's own default. A stand-in React varies the declarations one rule at a time, as for the one-parameter aliases above.
const FAITHFUL_CHANGE_ALIAS = 'export type ChangeEventHandler<C = Element, T = Element> = EventHandler<ChangeEvent<C, T>>;';
const FAITHFUL_CHANGE_EVENT = 'export interface ChangeEvent<C = Element, T = Element> extends SyntheticEvent<C> { target: EventTarget & T }';
const standInChange = ({ alias = FAITHFUL_CHANGE_ALIAS, event = FAITHFUL_CHANGE_EVENT, extra = '' } = {}) => ({
  'node_modules/@types/react/package.json': JSON.stringify({ name: '@types/react', version: '0.0.0', types: 'index.d.ts' }),
  'node_modules/@types/react/index.d.ts': `${FAITHFUL_HANDLER}
export interface SyntheticEvent<T = Element, E = Event> { readonly currentTarget: EventTarget & T; readonly nativeEvent: E }
${event}
${alias}
${extra}
`,
});
const standInChangeThing = (written = 'ChangeEventHandler<HTMLInputElement>') => `import type { ChangeEventHandler } from 'react';\nexport interface ThingOwnProps { onChange?: ${written}; }\nexport interface ThingProps extends ThingOwnProps {}\nexport declare const Thing: (props: ThingProps) => null;\n`;
const CHANGE_ALLOWLIST = Object.freeze(['HTMLInputElement', host('React.ChangeEvent', host('HTMLInputElement'))]);
const changeEvent = host('React.ChangeEvent', host('HTMLInputElement'));

test('a handler alias with defaulted parameters after its element is read, and only while the defaults it omits are the event\'s', () => {
  // The real alias, ChangeEventHandler<CurrentTarget = Element, Target = Element>, reads as the function of its event with the element alone.
  const real = extract({ declarations: ownProps('  /** Called on change. */\n  onChange?: React.ChangeEventHandler<HTMLInputElement>;'), hostAllowlist: CHANGE_ALLOWLIST });
  assert.deepEqual(real.events, ['change']);
  assert.deepEqual(real.eventDetails.change, { prop: 'onChange', type: handlerFunction('event', changeEvent), required: false, description: 'Called on change.' });
  assert.deepEqual(real, extract({ declarations: ownProps('  /** Called on change. */\n  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;'), hostAllowlist: CHANGE_ALLOWLIST }));
  // The use names the element alone, and the event must be on the allowlist like any other application.
  rejects(ownProps('  onChange?: React.ChangeEventHandler<HTMLInputElement>;'), /Thing\.onChange -> React\.ChangeEventHandler\(event\): React\.ChangeEvent<HTMLInputElement> is not an application on the host allowlist/u, { hostAllowlist: ['HTMLInputElement'] });
  rejects(ownProps('  onChange?: React.ChangeEventHandler<HTMLInputElement, HTMLInputElement>;'), /needs one type argument naming the element/u, { hostAllowlist: CHANGE_ALLOWLIST });
  rejects(ownProps('  onChange?: React.ChangeEventHandler;'), /needs one type argument naming the element/u, { hostAllowlist: CHANGE_ALLOWLIST });
  rejects(ownProps('  onChange?: React.ChangeEventHandler<HTMLInputElement> | undefined;'), /only as the whole type of a member/u, { hostAllowlist: CHANGE_ALLOWLIST });
  const read = (variant, written) => extract({ declarations: standInChangeThing(written), outside: standInChange(variant), hostAllowlist: CHANGE_ALLOWLIST });
  // The stand-in of the faithful shape reads the same way.
  assert.deepEqual(read().eventDetails.change.type, handlerFunction('event', changeEvent));
  // Each rule, broken alone, leaves the alias an unlisted host application.
  const refused = /Thing\.onChange -> ChangeEventHandler: React\.ChangeEventHandler<HTMLInputElement> is not an application on the host allowlist/u;
  for (const [rule, variant] of [
    // The omitted target would be another type than the event's own, and the catalog would state the wrong event.
    ['a default that is another library type', { alias: 'export type ChangeEventHandler<C = Element, T = Node> = EventHandler<ChangeEvent<C, T>>;' }],
    ['a default that is a keyword', { alias: 'export type ChangeEventHandler<C = Element, T = string> = EventHandler<ChangeEvent<C, T>>;' }],
    ['a default that depends on the element', { alias: 'export type ChangeEventHandler<C = Element, T = C> = EventHandler<ChangeEvent<C, T>>;' }],
    ['a default the event does not have', { event: 'export interface ChangeEvent<C = Element, T = Node> extends SyntheticEvent<C> { target: EventTarget & T }' }],
    ['a default on the alias only', { event: 'export interface ChangeEvent<C = Element, T> extends SyntheticEvent<C> { target: EventTarget & T }' }],
    ['a parameter after the element with no default', { alias: 'export type ChangeEventHandler<C = Element, T> = EventHandler<ChangeEvent<C, T>>;' }],
    ['the parameters swapped in the event', { alias: 'export type ChangeEventHandler<C = Element, T = Element> = EventHandler<ChangeEvent<T, C>>;' }],
    ['a parameter the event is not given', { alias: 'export type ChangeEventHandler<C = Element, T = Element> = EventHandler<ChangeEvent<C>>;' }],
    ['a parameter the event is given twice', { alias: 'export type ChangeEventHandler<C = Element, T = Element> = EventHandler<ChangeEvent<C, T, T>>;' }],
    ['a default that applies a generic to other arguments', { alias: 'export type ChangeEventHandler<C = Element, T = Array<string>> = EventHandler<ChangeEvent<C, T>>;', event: 'export interface ChangeEvent<C = Element, T = Array<number>> extends SyntheticEvent<C> { target: EventTarget }' }],
    ['an event declared twice', { extra: 'export interface ChangeEvent<C = Element, T = Element> { merged: true }' }],
    ['an alias that takes no type parameters', { alias: 'export type ChangeEventHandler = EventHandler<ChangeEvent<Element>>;' }],
    ['an event with one parameter', { event: 'export interface ChangeEvent<C = Element> extends SyntheticEvent<C> { target: EventTarget }' }],
    // The default has to be the library's, not a type of the same name declared beside the handler.
    ['a default declared in React\'s own module', { extra: 'interface Element { local: true }', alias: 'export type ChangeEventHandler<C = Element, T = Element> = EventHandler<ChangeEvent<C, T>>;', event: 'interface Element { local: true }\nexport interface ChangeEvent<C = Element, T = Element> extends SyntheticEvent<C> { target: EventTarget & T }' }],
  ]) {
    assert.throws(() => read(variant), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, refused, rule);
      return true;
    }, rule);
  }
});

// A part whose public props extend the host attributes can inherit a member it also owns: Sidebar.Search's onChange is the div's change
// handler and the input's. HOST_OVERLAPS names such a member, exactly, and the extraction proves the public type is that intersection.
const overlapDeclarations = ({ publicType = 'React.HTMLAttributes<HTMLDivElement> & ThingOwnProps', own = 'onChange?: React.ChangeEventHandler<HTMLInputElement>;', extra = '', exported = 'ThingProps & React.RefAttributes<HTMLDivElement>' } = {}) => `${header}${extra}
export interface ThingOwnProps { ${own} }
export type ThingProps = ${publicType};
export declare const Thing: React.ForwardRefExoticComponent<${exported}>;
`;
// Mapped types keep the declarations of the members they copy and rewrite their types: one broadens the handler (it takes a number too),
// the other narrows it (it needs another property). Neither is the host's member intersected with the owned one.
const BROADEN = "type Broaden<T> = { [K in keyof T]: K extends 'onChange' ? T[K] | number : T[K] };\n";
const NARROW = "type Narrow<T> = { [K in keyof T]: K extends 'onChange' ? T[K] & { extra: string } : T[K] };\n";
const OVERLAP = Object.freeze({ member: 'Thing.onChange', host: 'DOMAttributes', element: 'HTMLDivElement', type: handlerFunction('event', changeEvent) });

test('a member that is the host\'s intersected with the owned one is read only as its exact host overlap entry says', () => {
  const read = (options = {}, hostOverlaps = [OVERLAP], hostAllowlist = CHANGE_ALLOWLIST) => extract({ declarations: overlapDeclarations(options), hostOverlaps, hostAllowlist });
  // Without an entry the public type is a redeclaration of the owned member, as always.
  rejects(overlapDeclarations(), /Thing\.onChange: the exported Thing's props redeclare onChange as optional .*ChangeEventHandler<HTMLDivElement, Element> & .*ChangeEventHandler<HTMLInputElement, Element>/u, { hostAllowlist: CHANGE_ALLOWLIST });
  const api = read();
  assert.deepEqual(api.events, ['change']);
  assert.deepEqual(api.eventDetails.change, { prop: 'onChange', type: handlerFunction('event', changeEvent), required: false });
  // The entry names one member of one family, so another member, another family and another host interface are redeclarations.
  const refuse = (options, hostOverlaps, pattern = /Thing\.\w+: the exported Thing's props redeclare/u, hostAllowlist = CHANGE_ALLOWLIST) => assert.throws(() => read(options, hostOverlaps, hostAllowlist), (error) => {
    assert.ok(error instanceof ApiExtractionError, error.stack);
    assert.match(error.message, pattern);
    return true;
  });
  refuse({}, [{ ...OVERLAP, member: 'Thing.onInput' }]);
  refuse({}, [{ ...OVERLAP, member: 'Other.onChange' }]);
  refuse({}, [{ ...OVERLAP, member: 'Thing.Part.onChange' }]);
  refuse({}, [{ ...OVERLAP, host: 'HTMLAttributes' }]);
  // Another member with a host overlap of its own is not covered by this entry.
  refuse({ own: 'onChange?: React.ChangeEventHandler<HTMLInputElement>;\n  onInput?: React.InputEventHandler<HTMLInputElement>;' }, [OVERLAP], /Thing\.onInput: the exported Thing's props redeclare/u, [...CHANGE_ALLOWLIST, host('React.InputEvent', host('HTMLInputElement'))]);
  // The owned member is the one the entry pins: another handler, element or signature is a different overlap that needs its own review.
  refuse({ own: 'onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;' }, [OVERLAP], undefined, ['HTMLTextAreaElement', host('React.ChangeEvent', host('HTMLTextAreaElement'))]);
  refuse({ own: 'onChange?: (event: React.ChangeEvent<HTMLInputElement>, value: string) => void;' }, [OVERLAP]);
  refuse({ own: 'onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;' }, [{ ...OVERLAP, type: handlerFunction('event', host('React.ChangeEvent', host('HTMLTextAreaElement'))) }]);
  // The public type is the intersection of the host's and the owned member and nothing else: not a union, and not a third declaration.
  refuse({ publicType: '(React.HTMLAttributes<HTMLDivElement> & ThingOwnProps) | (ThingOwnProps & { other: true })' }, [OVERLAP]);
  refuse({ publicType: 'React.HTMLAttributes<HTMLDivElement> & ThingOwnProps & { onChange?: React.ChangeEventHandler<HTMLInputElement> }' }, [OVERLAP]);
  refuse({ publicType: 'React.HTMLAttributes<HTMLDivElement> & ThingOwnProps & { onChange?: () => void }' }, [OVERLAP]);
  refuse({ publicType: 'React.HTMLAttributes<HTMLDivElement> & React.InputHTMLAttributes<HTMLInputElement> & ThingOwnProps' }, [OVERLAP]);
  // The owned member has to be the public one's other half, and the intersection keeps its optionality.
  refuse({ publicType: 'React.HTMLAttributes<HTMLDivElement> & { other?: true }' }, [OVERLAP]);
  refuse({ publicType: 'React.HTMLAttributes<HTMLDivElement> & React.InputHTMLAttributes<HTMLInputElement>' }, [OVERLAP]);
  refuse({ publicType: 'Required<React.HTMLAttributes<HTMLDivElement>> & ThingOwnProps' }, [OVERLAP], /Thing\.onChange: the exported Thing's props redeclare onChange as required/u);
  // The public type is a plain intersection of the two. A mapped type keeps the declarations of both and may rewrite the member's type,
  // wherever it sits: around the intersection, around the host's attributes (Omit is one), or around the owned type.
  for (const [wrapper, extra] of [['Broaden', BROADEN], ['Narrow', NARROW]]) {
    refuse({ extra, exported: `${wrapper}<ThingProps & React.RefAttributes<HTMLDivElement>>` }, [OVERLAP]);
    refuse({ extra, publicType: `${wrapper}<React.HTMLAttributes<HTMLDivElement> & ThingOwnProps>` }, [OVERLAP]);
    refuse({ extra, publicType: `${wrapper}<React.HTMLAttributes<HTMLDivElement>> & ThingOwnProps` }, [OVERLAP]);
    refuse({ extra, publicType: `React.HTMLAttributes<HTMLDivElement> & ${wrapper}<ThingOwnProps>` }, [OVERLAP]);
  }
  // A local interface keeps the declaration of what it extends, whether that is a mapped copy of the host's attributes or the attributes themselves.
  refuse({ extra: `${BROADEN}export interface Wrapped extends Broaden<React.DOMAttributes<HTMLDivElement>> {}\n`, publicType: 'Wrapped & ThingOwnProps' }, [OVERLAP]);
  refuse({ extra: `${NARROW}export interface Wrapped extends Narrow<React.DOMAttributes<HTMLDivElement>> {}\n`, publicType: 'Wrapped & ThingOwnProps' }, [OVERLAP]);
  refuse({ extra: 'export interface Attributes<T> extends React.DOMAttributes<T> {}\n', publicType: 'Attributes<HTMLDivElement> & ThingOwnProps' }, [OVERLAP]);
  // A declaration outside React is a second declaration of React's member, which the entry does not allow.
  refuse({ extra: "declare module 'react' { interface DOMAttributes<T> { onChange?: React.FormEventHandler<T> | undefined } }\n" }, [OVERLAP]);
  // The host's attributes may be the default library's Omit of an interface React declares, when the Omit keeps the member and with it the host's own type
  // for it (MultiSelect omits the div's children and keeps its onReset). An Omit that drops the member leaves the owned type alone, which needs no entry.
  assert.deepEqual(read({ publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ThingOwnProps" }).events, ['change']);
  assert.deepEqual(read({ publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'color'> & ThingOwnProps" }).events, ['change']);
  assert.deepEqual(read({ publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> & ThingOwnProps" }, []).events, ['change'], 'an Omit of the member itself');
  // Any other wrapper of them is another type: a mapped type of another name around the Omit or inside it, an Omit of an Omit, a Pick (which is no
  // Omit), an Omit of a local interface or alias that shares the name, and an Omit over another element.
  for (const wrapper of ['Broaden', 'Narrow']) {
    const extra = wrapper === 'Broaden' ? BROADEN : NARROW;
    refuse({ extra, publicType: `${wrapper}<Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>> & ThingOwnProps` }, [OVERLAP]);
    refuse({ extra, publicType: `Omit<${wrapper}<React.HTMLAttributes<HTMLDivElement>>, 'children'> & ThingOwnProps` }, [OVERLAP]);
    refuse({ extra, publicType: `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ${wrapper}<ThingOwnProps>` }, [OVERLAP]);
  }
  refuse({ publicType: "Omit<Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>, 'color'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ publicType: "Pick<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onChange'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Pick<ThingOwnProps, 'onChange'>" }, [OVERLAP]);
  refuse({ extra: `${BROADEN}type Omit<T, K extends keyof any> = Broaden<T>;\n`, publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ extra: 'type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;\n', publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ extra: 'export interface LocalAttributes extends React.HTMLAttributes<HTMLDivElement> {}\n', publicType: "Omit<LocalAttributes, 'children'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ publicType: "Omit<React.HTMLAttributes<HTMLTextAreaElement>, 'children'> & ThingOwnProps" }, [OVERLAP]);
  refuse({ publicType: "Omit<React.HTMLAttributes<HTMLElement>, 'children'> & ThingOwnProps" }, [OVERLAP]);
  // The Omit has to be the host's whole attributes: the one that drops the member and a second carrier that declares it leaves two hosts.
  refuse({ publicType: "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & React.InputHTMLAttributes<HTMLInputElement> & ThingOwnProps" }, [OVERLAP]);
  refuse({ publicType: "React.HTMLAttributes<HTMLDivElement> & Omit<ThingOwnProps, 'other'>" }, [OVERLAP]);
  // The host's attributes are instantiated with the entry's element, read from the resolved type: the same props over another element
  // give an identical API record and another public type, so a textarea's or a button's attributes, any other element's, and a local
  // interface that only shares the name are refused, and so is an entry that names another element than the props use.
  for (const element of ['HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLElement']) refuse({ publicType: `React.HTMLAttributes<${element}> & ThingOwnProps` }, [OVERLAP]);
  refuse({ extra: 'export interface HTMLDivElement extends HTMLElement {}\n' }, [OVERLAP]);
  refuse({}, [{ ...OVERLAP, element: 'HTMLTextAreaElement' }]);
  assert.deepEqual(read({ publicType: 'React.HTMLAttributes<HTMLTextAreaElement> & ThingOwnProps' }, [{ ...OVERLAP, element: 'HTMLTextAreaElement' }]).events, ['change'], 'the element is the entry\'s, not a fixed one');
  // An augmentation of the host interface is refused by design, though this one adds an unrelated member: the extraction runs on this
  // repository's own sources, so that is a loud, named failure, and accepting it would take a proof that the overlapping member is untouched.
  refuse({ extra: "declare module 'react' { interface HTMLAttributes<T> { extra?: string } }\n" }, [OVERLAP], /Thing\.onChange: the exported Thing's props redeclare onChange as optional/u);
  // A host member declared outside React is no React member.
  refuse({ publicType: 'LocalHost & ThingOwnProps', extra: 'export interface DOMAttributes { onChange?: React.ChangeEventHandler<HTMLDivElement>; }\nexport type LocalHost = DOMAttributes;\n' }, [OVERLAP]);
  // Only the family's own props are read against the entry: another member of the export that carries the same overlap is not covered by it.
  const alsoDeclarations = `${overlapDeclarations()}export declare const Wrapper: { Root: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> };\n`
    .replace('export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>>;', 'export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> & { Root: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> };');
  assert.deepEqual(extract({ declarations: alsoDeclarations, hostOverlaps: [OVERLAP], hostAllowlist: CHANGE_ALLOWLIST }).events, ['change']);
  rejects(alsoDeclarations, /Thing\.onChange: the exported Thing\.Root's props redeclare onChange/u, { hostOverlaps: [OVERLAP], hostAllowlist: CHANGE_ALLOWLIST, also: [{ member: 'Root' }] });
  // The entry is checked on its own: exactly member, host, element, type, and a member once.
  for (const entry of [
    { member: 'Thing.onChange', host: 'DOMAttributes' },
    { member: 'Thing.onChange', host: 'DOMAttributes', type: OVERLAP.type },
    { ...OVERLAP, element: 'htmlDivElement' },
    { ...OVERLAP, element: undefined },
    { ...OVERLAP, extra: true },
    { ...OVERLAP, member: 'onChange' },
    { ...OVERLAP, member: 'thing.onChange' },
    { ...OVERLAP, host: 'dom' },
    { ...OVERLAP, type: keyword('string') },
  ]) assert.throws(() => assertHostOverlaps([entry]), /host overlaps/u, JSON.stringify(entry));
  assert.throws(() => assertHostOverlaps([OVERLAP, OVERLAP]), /names a member twice/u);
  assert.equal(assertHostOverlaps(HOST_OVERLAPS).size, HOST_OVERLAPS.length);
});

test('a host overlap is read through an OwnProps that is generic only by the instantiation with the exported signature\'s own parameters', () => {
  const members = '  onChange?: React.ChangeEventHandler<HTMLInputElement>;\n  items?: T[];';
  const thing = (body, extra = '') => genericThing({ declarations: `${ROW}${extra}`, members, body });
  const withHost = (wrapped) => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ${wrapped}`;
  const read = (declarations, hostOverlaps = [OVERLAP]) => extract({ declarations, hostOverlaps, hostAllowlist: CHANGE_ALLOWLIST });
  assert.deepEqual(read(thing(() => withHost('ThingOwnProps<T>'))).events, ['change']);
  assert.deepEqual(read(thing(() => `React.HTMLAttributes<HTMLDivElement> & ThingOwnProps<T>`)).events, ['change']);
  const refused = /Thing\.\w+: the exported Thing's props redeclare/u;
  // Without the entry it is the redeclaration it always was.
  assert.throws(() => read(thing(() => withHost('ThingOwnProps<T>')), []), refused);
  // The owned carrier is OwnProps instantiated with the exported signature's own parameters, in order: a mapped copy, a concrete instantiation and
  // a copy that is no instantiation at all are not it.
  for (const [rule, body, extra] of [
    ['a mapped copy of the instantiation', (a) => withHost(`Broaden<ThingOwnProps${a}>`), BROADEN],
    ['a narrowing mapped copy', (a) => withHost(`Narrow<ThingOwnProps${a}>`), NARROW],
    ['an instantiation with the constraint', () => withHost('ThingOwnProps<Row>')],
    ['an instantiation with another row', () => withHost('ThingOwnProps<SubRow>')],
    ['an Omit of the instantiation', (a) => withHost(`Omit<ThingOwnProps${a}, 'items'>`)],
    // A local alias of the mapped copy that takes the signature's parameters in order carries those arguments, and is no instantiation of OwnProps.
    ['an alias of a mapped copy, taking the parameters', () => withHost('Copy<T>'), "type Copy<T extends Row = Row> = { [K in keyof ThingOwnProps<T>]: K extends 'onChange' ? ThingOwnProps<T>[K] | number : ThingOwnProps<T>[K] };\n"],
  ]) assert.throws(() => read(thing(body, extra)), refused, rule);
  // Two parameters: the arguments must be the signature's in its order.
  const pair = (args) => genericThing({
    own: '<A extends Row = Row, B extends Row = Row>',
    members: '  onChange?: React.ChangeEventHandler<HTMLInputElement>;\n  a?: A;\n  b?: B;',
    props: '<A extends Row = Row, B extends Row = Row>',
    args,
    signature: '<A extends Row = Row, B extends Row = Row>',
    call: '<A, B>',
    body: (a) => withHost(`ThingOwnProps${a}`),
  });
  assert.deepEqual(read(pair('<A, B>')).events, ['change']);
  assert.throws(() => read(pair('<B, A>')), /Thing\.onChange: the exported Thing's props redeclare onChange/u, 'the arguments in the other order');
});

test('Sidebar.Search\'s onChange is read through the one shipped host overlap, and the real family cannot be read without it', () => {
  const entry = DERIVED_API_COMPONENTS.find(({ slug }) => slug === 'sidebar');
  const declarationRoot = resolve(packageRoot, 'generated');
  const read = (hostOverlaps) => extractApis({
    declarationRoot,
    hostOverlaps,
    components: [extractionComponent(entry, { declarations: resolve(declarationRoot, 'sidebar.d.ts'), source: resolve(packageRoot, '../..', entry.source) })],
  }).get('Sidebar');
  assert.deepEqual(HOST_OVERLAPS.map(({ member }) => member), ['Sidebar.Search.onChange', 'MultiSelect.onReset']);
  assert.deepEqual(read(HOST_OVERLAPS).partApis.search.events, ['change']);
  assert.throws(() => read([]), /Sidebar\.Search\.onChange: the exported Sidebar\.Search's props redeclare onChange as optional/u);
});

test('the real Sidebar.Search is not read through its host overlap once its onChange type is rewritten or its element changes', () => {
  const entry = DERIVED_API_COMPONENTS.find(({ slug }) => slug === 'sidebar');
  const search = 'Search: ForwardRefExoticComponent<SidebarSearchProps & RefAttributes<HTMLDivElement>>;';
  const alias = 'type SidebarSearchProps = PartProps<HTMLDivElement> & SidebarSearchOwnProps;';
  const emitted = readFileSync(resolve(packageRoot, 'generated', 'sidebar.d.ts'), 'utf8');
  assert.ok(emitted.includes(search) && emitted.includes(alias), 'the emitted Search declarations are the ones the controls rewrite');
  // The emitted declarations beside a copy of sidebar.d.ts with each [from, to] edit applied, and the mapped types it may use declared after it.
  const read = (...edits) => {
    mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
    const base = mkdtempSync(join(packageRoot, 'build', 'api-extraction-sidebar-'));
    try {
      cpSync(resolve(packageRoot, 'generated'), base, { recursive: true, filter: (path) => !path.endsWith('.js') });
      const rewritten = edits.reduce((text, [from, to]) => text.replace(from, to), emitted);
      writeFileSync(join(base, 'sidebar.d.ts'), `${rewritten}\n${BROADEN}${NARROW}`);
      return extractApis({
        declarationRoot: base,
        components: [extractionComponent(entry, { declarations: join(base, 'sidebar.d.ts'), source: resolve(packageRoot, '../..', entry.source) })],
      }).get('Sidebar');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  };
  const refused = /Sidebar\.Search\.onChange: the exported Sidebar\.Search's props redeclare onChange as optional/u;
  assert.deepEqual(read().partApis.search.events, ['change'], 'the unrewritten copy reads as the real family does');
  for (const wrapper of ['Broaden', 'Narrow']) {
    assert.throws(() => read([search, `Search: ForwardRefExoticComponent<${wrapper}<SidebarSearchProps & RefAttributes<HTMLDivElement>>>;`]), refused, wrapper);
  }
  // Over another element the record is identical and the type is not: a div event no longer fits the handler.
  for (const element of ['HTMLTextAreaElement', 'HTMLInputElement']) {
    assert.throws(() => read([alias, alias.replace('HTMLDivElement', element)]), refused, element);
  }
});

test('MultiSelect.onReset is read through its host overlap, and the real family cannot be read without it', () => {
  const entry = DERIVED_API_COMPONENTS.find(({ slug }) => slug === 'multi-select');
  const declarationRoot = resolve(packageRoot, 'generated');
  const read = (hostOverlaps) => extractApis({
    declarationRoot,
    hostOverlaps,
    components: [extractionComponent(entry, { declarations: resolve(declarationRoot, 'multi-select.d.ts'), source: resolve(packageRoot, '../..', entry.source) })],
  }).get('MultiSelect');
  const api = read(HOST_OVERLAPS);
  assert.ok(api.props.includes('showFooter'), 'the whole root is read, not only the member the entry covers');
  assert.deepEqual(api.events, ['selectionChange', 'reset', 'selectAll']);
  assert.deepEqual(api.eventDetails.reset, { prop: 'onReset', type: { kind: 'function', parameters: [], returns: keyword('void') }, required: false, description: 'Called after Reset clears the selection.' });
  // The Sidebar entry covers another family and member, so MultiSelect alone cannot be read without its own.
  const sidebarOnly = HOST_OVERLAPS.filter(({ member }) => member === 'Sidebar.Search.onChange');
  assert.throws(() => read(sidebarOnly), /MultiSelect\.onReset: the exported MultiSelect's props redeclare onReset as optional/u);
  assert.throws(() => read([]), /MultiSelect\.onReset: the exported MultiSelect's props redeclare onReset as optional/u);
  // The same entry under another family's name, another member, another host interface or another element covers nothing here.
  const entryOf = HOST_OVERLAPS.find(({ member }) => member === 'MultiSelect.onReset');
  for (const changed of [{ member: 'TagSelect.onReset' }, { member: 'MultiSelect.onSelectAll' }, { host: 'HTMLAttributes' }, { element: 'HTMLElement' }, { type: { kind: 'function', parameters: [], returns: keyword('string') } }]) {
    assert.throws(() => read([{ ...entryOf, ...changed }]), /MultiSelect\.onReset: the exported MultiSelect's props redeclare onReset as optional/u, JSON.stringify(changed));
  }
});

test('the real MultiSelect is not read through its host overlap once its public onReset is wrapped, rewritten, or over another element', () => {
  const entry = DERIVED_API_COMPONENTS.find(({ slug }) => slug === 'multi-select');
  const emitted = readFileSync(resolve(packageRoot, 'generated', 'multi-select.d.ts'), 'utf8');
  const props = "export type MultiSelectProps<T extends MultiSelectItem = MultiSelectItem> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & MultiSelectOwnProps<T> & {";
  assert.ok(emitted.includes(props), 'the emitted public props are the ones the controls rewrite');
  const read = (...edits) => {
    mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
    const base = mkdtempSync(join(packageRoot, 'build', 'api-extraction-multi-select-'));
    try {
      cpSync(resolve(packageRoot, 'generated'), base, { recursive: true, filter: (path) => !path.endsWith('.js') });
      const rewritten = edits.reduce((text, [from, to]) => text.replace(from, to), emitted);
      writeFileSync(join(base, 'multi-select.d.ts'), `${rewritten}\n${BROADEN.replace("'onChange'", "'onReset'")}${NARROW.replace("'onChange'", "'onReset'")}`);
      return extractApis({
        declarationRoot: base,
        components: [extractionComponent(entry, { declarations: join(base, 'multi-select.d.ts'), source: resolve(packageRoot, '../..', entry.source) })],
      }).get('MultiSelect');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  };
  const refused = /MultiSelect\.onReset: the exported MultiSelect's props redeclare onReset as optional/u;
  assert.deepEqual(read().events, ['selectionChange', 'reset', 'selectAll'], 'the unrewritten copy reads as the real family does');
  const host = "Omit<HTMLAttributes<HTMLDivElement>, 'children'>";
  for (const wrapper of ['Broaden', 'Narrow']) {
    assert.throws(() => read([`& MultiSelectOwnProps<T> & {`, `& ${wrapper}<MultiSelectOwnProps<T>> & {`]), refused, `${wrapper} around the owned type`);
    assert.throws(() => read([host, `${wrapper}<${host}>`]), refused, `${wrapper} around the host's attributes`);
    assert.throws(() => read([host, `Omit<${wrapper}<HTMLAttributes<HTMLDivElement>>, 'children'>`]), refused, `${wrapper} inside the Omit`);
    assert.throws(() => read(['MultiSelectRootProps<T extends MultiSelectItem = MultiSelectItem> = MultiSelectProps<T>;', `MultiSelectRootProps<T extends MultiSelectItem = MultiSelectItem> = ${wrapper}<MultiSelectProps<T>>;`]), refused, `${wrapper} around the whole props`);
  }
  // Over another element the record is identical and the type is not.
  for (const element of ['HTMLTextAreaElement', 'HTMLInputElement', 'HTMLElement']) {
    assert.throws(() => read([host, `Omit<HTMLAttributes<${element}>, 'children'>`]), refused, element);
  }
  // A Pick keeps onReset and loses nothing else the control owns, and is no Omit.
  assert.throws(() => read([host, "Pick<HTMLAttributes<HTMLDivElement>, 'onReset' | 'className'>"]), refused, 'a Pick');
});

// ---- D3: type parameters (Decision 0031 tranche 10b) ----------------------------------------------------------------------
//
// A props type may declare type parameters, and the exported component must keep them: the same count, constraint and default by
// position, with every member that mentions one carrying the exported signature's parameter in its place. The catalog records each
// occurrence at the parameter's constraint. The fixture is the shape of MultiSelect and TagSelect: OwnProps generic over a row, a
// public alias that intersects it with the host's attributes, and a call signature that is generic over the row again.
const ROW = 'export interface Row { id: string; [key: string]: unknown }\nexport interface SubRow extends Row { extra: string }\n';
const genericThing = ({
  declarations = ROW,
  own = '<T extends Row = Row>',
  members = '  items?: T[];',
  props = '<T extends Row = Row>',
  body = (args) => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ThingOwnProps${args}`,
  args = '<T>',
  signature = '<T extends Row = Row>',
  call = '<T>',
} = {}) => `${header}${declarations}
export type ThingOwnProps${own} = {
${members}
};
export type ThingProps${props} = ${body(args)};
export interface ThingComponent {
  ${signature}(props: ThingProps${call} & React.RefAttributes<HTMLDivElement>): React.ReactElement | null;
}
export declare const Thing: ThingComponent;
`;
const GENERIC_MEMBERS = `  /** The rows. */
  items?: T[];
  pick?: T;
  onPick?: (item: T, index?: number) => void;
  choice?: T | 'all';
  size?: 'sm' | 'md';`;
const rowReference = { kind: 'reference', name: 'Row' };
const ROW_TYPE = {
  type: {
    kind: 'object',
    members: [{ name: 'id', type: keyword('string'), required: true, readonly: false }],
    additional: 'unknown',
  },
};
const rowIterable = host('Iterable', rowReference);

test('type parameters are read at their constraint, and the exported signature keeps them by position', () => {
  const api = extract({ declarations: genericThing({ members: `${GENERIC_MEMBERS}\n  rows?: Iterable<T>;` }), hostAllowlist: [rowIterable] });
  assert.deepEqual(api.props, ['items', 'pick', 'choice', 'size', 'rows']);
  assert.deepEqual(api.events, ['pick']);
  assert.deepEqual(api.propDetails.items, { type: { kind: 'array', element: rowReference, readonly: false }, required: false, description: 'The rows.' });
  assert.deepEqual(api.propDetails.pick.type, rowReference);
  assert.deepEqual(api.propDetails.choice.type, { kind: 'union', members: [rowReference, { kind: 'literal', value: 'all' }] });
  assert.deepEqual(api.propDetails.rows.type, rowIterable);
  assert.deepEqual(api.eventDetails.pick.type, {
    kind: 'function',
    parameters: [{ name: 'item', type: rowReference, required: true }, { name: 'index', type: keyword('number'), required: false }],
    returns: keyword('void'),
  });
  assert.deepEqual(api.types, { Row: ROW_TYPE });
  // Nothing of the parameter is in the block but its constraint: the same block, whatever the parameters are called.
  const renamed = genericThing({ members: `${GENERIC_MEMBERS}\n  rows?: Iterable<T>;`, signature: '<U extends Row = Row>', call: '<U>' });
  assert.deepEqual(extract({ declarations: renamed, hostAllowlist: [rowIterable] }), api, 'a renamed signature parameter');
  assert.deepEqual(extract({ declarations: genericThing({ members: GENERIC_MEMBERS, own: '<Item extends Row = Row>'.replaceAll('Item', 'T'), props: '<P extends Row = Row>', args: '<P>' }) }).propDetails.pick.type, rowReference, 'a renamed props parameter');
  // Spelled another way, a union is the same union: the arms in another order, written through an alias, or flattened from several.
  const reordered = (choice) => genericThing({
    declarations: `${ROW}export type AllOr<T> = 'all' | T;\n`,
    members: GENERIC_MEMBERS,
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, 'choice'> & { choice?: ${choice} }`,
  });
  for (const choice of ["'all' | T", 'AllOr<T>', "T | ('all')", "('all' | T) | 'all'"]) assert.deepEqual(extract({ declarations: reordered(choice) }).props, ['items', 'pick', 'choice', 'size'], choice);
  // A binder no member uses is still compared, and a callable that never was generic is a count of none.
  assert.deepEqual(extract({ declarations: genericThing({ members: "  size?: 'sm' | 'md';" }) }).props, ['size']);
  assert.deepEqual(extract({ declarations: genericThing({ own: '', members: "  size?: 'sm' | 'md';", props: '', args: '', signature: '', call: '' }) }).props, ['size']);
});

test('a lost, added, or changed type parameter fails extraction, whether or not a member uses it', () => {
  const lostBinder = /Thing: ThingOwnProps declares 1 type parameters and the exported Thing 0/u;
  // A constraint and a default that are unions, as OwnProps declares them and as the signature does; the parameter is unused.
  const union = ({ own, twin, ownDefault = own.split(' | ')[0], twinDefault = twin.split(' | ')[0] }) => ({
    own: `<T extends ${own} = ${ownDefault}>`,
    members: "  size?: 'sm';",
    props: `<T extends ${own} = ${ownDefault}>`,
    signature: `<T extends ${twin} = ${twinDefault}>`,
  });
  // The same union spelled another way, through an alias or flattened from two, is accepted.
  const spelled = (own, twin, declarations = '') => extract({ declarations: genericThing({ declarations: `${ROW}${declarations}`, ...union({ own, twin, ownDefault: "'a'", twinDefault: "'a'" }) }) }).props;
  assert.deepEqual(spelled("'a' | 'b' | 'c'", 'AB | Cee', "type AB = 'b' | 'a';\ntype Cee = 'c';\n"), ['size']);
  assert.deepEqual(spelled("'a' | 'b'", "'b' | 'a'"), ['size']);
  const cases = [
    // The signature loses its parameter, or the props alias does and the signature keeps it.
    ['the signature lost the parameter', { signature: '', call: '<Row>' }, lostBinder],
    ['the signature lost the parameter of a member-free props type', { members: "  size?: 'sm';", signature: '', call: '<Row>' }, lostBinder],
    ['the signature gained a parameter', { signature: '<T extends Row = Row, U = unknown>' }, /Thing: ThingOwnProps declares 1 type parameters and the exported Thing 2/u],
    ['the props alias lost the parameter', { props: '', args: '<Row>', call: '' }, /Thing\.items: the exported Thing's props redeclare items as optional Row\[\] \| undefined; ThingOwnProps declares optional T\[\] \| undefined/u],
    // The constraint and the default are compared even when no member uses the parameter.
    ['a changed constraint', { members: "  size?: 'sm';", signature: '<T extends SubRow = SubRow>' }, /Thing<T>: type parameter 1 is T in ThingOwnProps and T in the exported Thing, and they differ in their constraint$/u],
    ['a changed constraint of a used parameter', { signature: '<T extends SubRow = SubRow>' }, /differ in their constraint$/u],
    ['a constraint on one side only', { members: "  size?: 'sm';", props: '', args: '', call: '', signature: '<T = Row>' }, /differ in their constraint \(one has none\)/u],
    ['a changed default', { members: "  size?: 'sm';", signature: '<T extends Row = SubRow>' }, /Thing<T>: type parameter 1 is T in ThingOwnProps and T in the exported Thing, and they differ in their default$/u],
    ['a default on one side only', { members: "  size?: 'sm';", signature: '<T extends Row>' }, /differ in their default \(one has none\)/u],
    ['a default on the other side only', { own: '<T extends Row>', members: "  size?: 'sm';" }, /differ in their default \(one has none\)/u],
    // A union is the same union only with the same arms: one arm more or fewer, in the constraint or the default, whichever side has it.
    ['a constraint with an arm more', union({ own: "'a' | 'b'", twin: "'a' | 'b' | 'c'" }), /differ in their constraint$/u],
    ['a constraint with an arm less', union({ own: "'a' | 'b' | 'c'", twin: "'a' | 'b'" }), /differ in their constraint$/u],
    ['a constraint with an arm swapped', union({ own: "'a' | 'b'", twin: "'a' | 'c'" }), /differ in their constraint$/u],
    ['a default with an arm more', union({ own: 'string', twin: 'string', ownDefault: "'a' | 'b'", twinDefault: "'a' | 'b' | 'c'" }), /differ in their default$/u],
    ['a default with an arm less', union({ own: 'string', twin: 'string', ownDefault: "'a' | 'b' | 'c'", twinDefault: "'a' | 'b'" }), /differ in their default$/u],
    // A default outside the grammar fails whether or not a member uses the parameter.
    ['a default outside the grammar', { own: '<T = Promise<number>>', members: "  size?: 'sm';", props: '', args: '', call: '', signature: '<T = Promise<number>>' }, /Thing<T> -> Promise: Promise<number> is not/u],
    // The one default that is not a type of the grammar is exact, and belongs to an unconstrained parameter on both sides.
    ['an unknown default against none', { own: '<T = unknown>', members: "  size?: 'sm';", props: '', args: '', call: '', signature: '<T>' }, /differ in their default \(one has none\)/u],
    ['an unknown default against another', { own: '<T = unknown>', members: "  size?: 'sm';", props: '', args: '', call: '', signature: '<T = {}>' }, /differ in their default \(unknown is the default of an unconstrained parameter only, on both sides\)/u],
    ['an unknown default on a constrained parameter', { own: '<T extends Row = unknown>', members: "  size?: 'sm';", signature: '<T extends Row = unknown>' }, /differ in their default \(unknown is the default of an unconstrained parameter only, on both sides\)/u],
    // The modifiers a binder correspondence does not read, on either side, with the parameter unused.
    ['a const parameter of OwnProps', { own: '<const T extends Row = Row>', members: "  size?: 'sm';" }, /the type parameter T of ThingOwnProps is declared const/u],
    ['a const parameter of the signature', { members: "  size?: 'sm';", signature: '<const T extends Row = Row>' }, /the type parameter T of the exported Thing is declared const/u],
    ['an in parameter', { own: '<in T extends Row = Row>', members: "  size?: 'sm';" }, /the type parameter T of ThingOwnProps is declared in/u],
    ['an out parameter of the signature', { members: "  size?: 'sm';", signature: '<out T extends Row = Row>' }, /the type parameter T of the exported Thing is declared out/u],
    // A constraint or a default that names a type parameter is parameter-dependent.
    ['a dependent constraint', { own: '<T extends Row, U extends T[] = T[]>', members: "  size?: 'sm';", props: '<T extends Row = Row, U extends T[] = T[]>', args: '<T, U>', signature: '<T extends Row, U extends T[] = T[]>', call: '<T, U>' }, /the type parameter U of ThingOwnProps has a constraint that names a type parameter/u],
    ['a dependent default', { own: '<T extends Row, U extends Row = T>', members: "  size?: 'sm';", props: '<T extends Row, U extends Row = T>', args: '<T, U>', signature: '<T extends Row, U extends Row = T>', call: '<T, U>' }, /the type parameter U of ThingOwnProps has a default that names a type parameter/u],
    ['a dependent default of the signature', { own: '<T extends Row, U extends Row = Row>', members: "  size?: 'sm';", props: '<T extends Row, U extends Row = Row>', args: '<T, U>', signature: '<T extends Row, U extends Row = T>', call: '<T, U>' }, /the type parameter U of the exported Thing has a default that names a type parameter/u],
  ];
  for (const [rule, options, pattern] of cases) rejects(genericThing(options), pattern, { hostAllowlist: [rowIterable] }, rule);
});

test('a member that mentions a type parameter is the same type only with the signature\'s parameter in its place', () => {
  const redeclared = (member, body) => genericThing({
    members: GENERIC_MEMBERS,
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, '${member}'> & { ${body} }`,
  });
  // Each declares the member again in the public type, in a form that is no longer the owned one with the parameter replaced.
  const cases = [
    ['a member replaced by its constraint (an array)', 'items', 'items?: Row[]', /Thing\.items: the exported Thing's props redeclare items as optional Row\[\] \| undefined; ThingOwnProps declares optional T\[\] \| undefined \(a member that mentions a type parameter is compared with each of OwnProps's replaced by the exported component's at the same position\)/u],
    ['a member replaced by its constraint (a plain member)', 'pick', 'pick?: Row', /Thing\.pick: the exported Thing's props redeclare pick as optional Row \| undefined/u],
    ['a member that is another generic of the same argument', 'items', 'items?: readonly T[]', /Thing\.items: the exported Thing's props redeclare items/u],
    ['a member that is another parameter\'s array', 'items', 'items?: SubRow[]', /Thing\.items: the exported Thing's props redeclare items/u],
    ['a lost arm of a union', 'choice', "choice?: Row | 'all'", /Thing\.choice: the exported Thing's props redeclare choice/u],
    ['a swapped arm of a union', 'choice', "choice?: T | 'none'", /Thing\.choice: the exported Thing's props redeclare choice/u],
    ['an added arm of a union', 'choice', "choice?: T | 'all' | 'none'", /Thing\.choice: the exported Thing's props redeclare choice/u],
    ['an occurrence in a union that became its constraint and a second occurrence', 'choice', "choice?: T | Row | 'all'", /Thing\.choice: the exported Thing's props redeclare choice/u],
    ['a callback parameter replaced by the constraint', 'onPick', 'onPick?: (item: Row, index?: number) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a callback parameter that became required', 'onPick', 'onPick?: (item: T, index: number) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a callback with a parameter fewer', 'onPick', 'onPick?: (item: T) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a callback with a rest parameter', 'onPick', 'onPick?: (item: T, ...rest: number[]) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a callback whose return changed', 'onPick', 'onPick?: (item: T, index?: number) => string', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a callback with a this parameter', 'onPick', 'onPick?: (this: Row, item: T, index?: number) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    ['a generic callback', 'onPick', 'onPick?: <U>(item: T, index?: number) => void', /Thing\.onPick: the exported Thing's props redeclare onPick/u],
    // A conditional or an indexed access of the parameter in the public type is not the owned member, whatever it evaluates to for a row.
    ['a public conditional type', 'items', 'items?: T extends Row ? T[] : never', /Thing\.items: the exported Thing's props redeclare items/u],
    ['a public indexed access', 'pick', "pick?: T['id']", /Thing\.pick: the exported Thing's props redeclare pick/u],
    ['a public keyof', 'pick', 'pick?: keyof T', /Thing\.pick: the exported Thing's props redeclare pick/u],
    // The optionality is not a type, and the owned member's own flags are kept.
    ['a member that became required', 'items', 'items: T[]', /Thing\.items: the exported Thing's props redeclare items as required/u],
  ];
  for (const [rule, member, text, pattern] of cases) rejects(redeclared(member, text), pattern, {}, rule);
  // The same text in the public type is accepted: the cases above differ in the occurrence and nothing else.
  assert.deepEqual(extract({ declarations: redeclared('items', 'items?: T[]') }).props, ['items', 'pick', 'choice', 'size']);
  assert.deepEqual(extract({ declarations: redeclared('onPick', 'onPick?: (item: T, index?: number) => void') }).events, ['pick']);
  // The parameters are matched by position, not by name or by constraint: two of the same constraint swap when the signature does.
  const pair = (options) => genericThing({
    own: '<A extends Row = Row, B extends Row = Row>',
    members: '  a?: A;\n  b?: B;\n  both?: [A, B];',
    props: '<A extends Row = Row, B extends Row = Row>',
    args: '<A, B>',
    signature: '<A extends Row = Row, B extends Row = Row>',
    call: '<A, B>',
    ...options,
  });
  assert.deepEqual(extract({ declarations: pair({}) }).props, ['a', 'b', 'both']);
  assert.deepEqual(extract({ declarations: pair({ signature: '<X extends Row = Row, Y extends Row = Row>', call: '<X, Y>' }) }).props, ['a', 'b', 'both'], 'renamed in order');
  rejects(pair({ signature: '<B extends Row = Row, A extends Row = Row>', call: '<A, B>' }), /Thing\.a: the exported Thing's props redeclare a/u, {}, 'the signature lists the parameters in the other order');
  rejects(pair({ body: () => "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<A, B>, 'a' | 'b'> & { a?: B; b?: A }" }), /Thing\.a: the exported Thing's props redeclare a/u, {}, 'two occurrences swapped');
  rejects(pair({ body: () => "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & ThingOwnProps<B, A>" }), /Thing\.a: the exported Thing's props redeclare a/u, {}, 'the arguments swapped');
  rejects(pair({ body: () => "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<A, B>, 'both'> & { both?: [B, A] }" }), /Thing\.both: the exported Thing's props redeclare both/u, {}, 'a tuple\'s elements swapped');
  rejects(pair({ body: () => "Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<A, B>, 'both'> & { both?: [A] }" }), /Thing\.both: the exported Thing's props redeclare both/u, {}, 'a tuple that lost an element');
});

test('an object literal that mentions a type parameter matches its properties, their flags, and their types', () => {
  const holder = (member) => genericThing({
    members: '  holder?: { readonly row: T; note?: string };',
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, 'holder'> & { ${member} }`,
  });
  assert.deepEqual(extract({ declarations: holder('holder?: { readonly row: T; note?: string }') }).props, ['holder']);
  for (const [rule, member] of [
    ['a property that is not readonly', 'holder?: { row: T; note?: string }'],
    ['a property that became required', 'holder?: { readonly row: T; note: string }'],
    ['a property replaced by the constraint', 'holder?: { readonly row: Row; note?: string }'],
    ['a property fewer', 'holder?: { readonly row: T }'],
    ['a property more', 'holder?: { readonly row: T; note?: string; extra?: number }'],
    ['a property of another name', 'holder?: { readonly item: T; note?: string }'],
  ]) rejects(holder(member), /Thing\.holder: the exported Thing's props redeclare holder/u, {}, rule);
});

test('callbacks, unions and object literals that mention a parameter are matched arm by arm and flag by flag', () => {
  const members = `  onRest?: (item: T, rest: number[]) => void;
  onIndex?: (item: T, index?: number) => void;
  holder?: { row: T; note?: string };
  twins?: { k: T } | { k: T };`;
  const redeclared = (member, text, options = {}) => genericThing({
    members,
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, '${member}'> & { ${text} }`,
    ...options,
  });
  const same = {
    onRest: 'onRest?: (item: T, rest: number[]) => void',
    onIndex: 'onIndex?: (item: T, index?: number) => void',
    holder: 'holder?: { row: T; note?: string }',
    twins: 'twins?: { k: T } | { k: T }',
  };
  for (const [member, text] of Object.entries(same)) assert.deepEqual(extract({ declarations: redeclared(member, text) }).props, ['holder', 'twins'], text);
  const cases = [
    // A rest parameter is no array parameter, and an optional one is no required one that admits undefined, whatever the types say.
    ['onRest', 'onRest?: (item: T, ...rest: number[]) => void'],
    ['onIndex', 'onIndex?: (item: T, index: number | undefined) => void'],
    ['holder', 'holder?: { row: T; note: string | undefined }'],
    // An intersection of the two halves of an object literal is another type, with the same properties.
    ['holder', 'holder?: { row: T } & { note?: string }'],
    // Two arms of OwnProps cannot both stand for one arm of the public type.
    ['twins', 'twins?: { k: T } | { k: T; extra: number }'],
  ];
  for (const [member, text] of cases) rejects(redeclared(member, text), new RegExp(`Thing\\.${member}: the exported Thing's props redeclare ${member}`, 'u'), {}, text);
  // A parameter whose constraint is a callback is no callback: a member that has the callback where the public type names the parameter is not it.
  const callable = (text) => genericThing({
    declarations: `${ROW}export type Fn = (x: Row) => void;\n`,
    own: '<A extends Row = Row, F extends Fn = Fn>',
    members: '  fn?: Fn | A;',
    props: '<A extends Row = Row, F extends Fn = Fn>',
    args: '<A, F>',
    signature: '<A extends Row = Row, F extends Fn = Fn>',
    call: '<A, F>',
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<A, F>, 'fn'> & { ${text} }`,
  });
  assert.deepEqual(extract({ declarations: callable('fn?: Fn | A') }).props, ['fn']);
  rejects(callable('fn?: F | A'), /Thing\.fn: the exported Thing's props redeclare fn/u);
});

test('an object literal is matched by the modifiers the checker computes, so a mapped copy cannot change a nested readonly or optional flag', () => {
  // A nested object that OwnProps writes plain, readonly, and with an optional property; the public type writes each again, through the
  // mapped types a source can reach for (the library's, and the two that remove a modifier) and through an interface that is generic.
  const declarations = `${ROW}export type Mutable<R> = { -readonly [K in keyof R]: R[K] };
export type Required2<R> = { [K in keyof R]-?: R[K] };
export interface Cell<V> { value: V }
export interface Box<V> { readonly value: V }
export interface Getter<V> { get value(): V }
`;
  const members = '  holder?: { value: T };\n  locked?: { readonly value: T };\n  loose?: { value?: T };';
  const redeclared = (member, text) => genericThing({
    declarations,
    members,
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, '${member}'> & { ${text} }`,
  });
  // The same modifiers, written another way, are the same object: a mapped copy that changes none, a generic interface, a get accessor
  // with no set accessor (readonly), and a class whose instance has the property.
  for (const [member, text] of [
    ['holder', 'holder?: { value: T }'],
    ['holder', 'holder?: Mutable<{ value: T }>'],
    ['holder', "holder?: Pick<{ value: T; extra: string }, 'value'>"],
    ['holder', 'holder?: Cell<T>'],
    ['locked', 'locked?: { readonly value: T }'],
    ['locked', 'locked?: Readonly<{ value: T }>'],
    ['locked', "locked?: Pick<{ readonly value: T; extra: string }, 'value'>"],
    ['locked', 'locked?: Box<T>'],
    ['locked', 'locked?: Getter<T>'],
    ['loose', 'loose?: { value?: T }'],
    ['loose', 'loose?: Partial<{ value: T }>'],
  ]) assert.deepEqual(extract({ declarations: redeclared(member, text) }).props, ['holder', 'locked', 'loose'], text);
  // A nested property that gains or loses readonly or its question mark through a mapped type, or whose declaration says so, is another
  // object: TypeScript refuses to assign one to the other, in one direction or the other, whatever the property types say.
  for (const [rule, member, text] of [
    ['readonly added by Readonly', 'holder', 'holder?: Readonly<{ value: T }>'],
    ['readonly added by a generic interface', 'holder', 'holder?: Box<T>'],
    ['readonly added by a get accessor', 'holder', 'holder?: Getter<T>'],
    ['readonly removed by a -readonly copy', 'locked', 'locked?: Mutable<{ readonly value: T }>'],
    ['readonly removed by a -readonly copy of the literal', 'locked', "locked?: { -readonly [K in 'value']: T }"],
    ['readonly removed by a generic interface', 'locked', 'locked?: Cell<T>'],
    ['optional added by Partial', 'holder', 'holder?: Partial<{ value: T }>'],
    ['optional removed by a -? copy', 'loose', 'loose?: Required2<{ value?: T }>'],
    ['optional removed by Required', 'loose', 'loose?: Required<{ value?: T }>'],
  ]) rejects(redeclared(member, text), new RegExp(`Thing\\.${member}: the exported Thing's props redeclare ${member}`, 'u'), {}, rule);
});

test('a callback is matched by how it is written: a method is compared bivariantly and a function type contravariantly', () => {
  // OwnProps writes a function property at the top and a method and a function property in nested objects (a method is in the grammar
  // nowhere else); strictFunctionTypes makes the method accept a narrower handler than the property does, so one cannot stand for the
  // other, in either direction, and the rule follows the signature through a mapped copy.
  const declarations = `${ROW}export class Instance<V> { run(item: V): void {} }
export class Field<V> { run = (item: V): void => {}; }
`;
  const members = '  walk: (item: T) => void;\n  holder?: { run(item: T): void };\n  field?: { walk: (item: T) => void };';
  const redeclared = (member, text) => genericThing({
    declarations,
    members,
    body: () => `Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & Omit<ThingOwnProps<T>, '${member}'> & { ${text} }`,
  });
  // Each spelling of the same kind is the member: a method for a method (a class whose instance method is declared as one included), a
  // function type or a call signature for a function property.
  for (const [member, text] of [
    ['walk', 'walk: (item: T) => void'],
    ['walk', 'walk: { (item: T): void }'],
    ['holder', 'holder?: { run(item: T): void }'],
    ['holder', 'holder?: Instance<T>'],
    ['field', 'field?: { walk: (item: T) => void }'],
  ]) assert.deepEqual(extract({ declarations: redeclared(member, text) }).props, ['walk', 'holder', 'field'], text);
  for (const [rule, member, text] of [
    ['a function property written as a method', 'walk', 'walk(item: T): void'],
    ['a nested method written as a function property', 'holder', 'holder?: { run: (item: T) => void }'],
    ['a nested function property written as a method', 'field', 'field?: { walk(item: T): void }'],
    ['a nested method written as a class property function', 'holder', 'holder?: Field<T>'],
    // A mapped copy keeps the declaration of the signature it copies: the method is still a method, and its readonly flag is another matter.
    ['a nested method behind a Readonly copy', 'holder', 'holder?: Readonly<{ run(item: T): void }>'],
  ]) rejects(redeclared(member, text), new RegExp(`Thing\\.${member}: the exported Thing's props redeclare ${member}`, 'u'), {}, rule);
});

test('what an unconstrained, conditional, mapped, indexed, or callback-local parameter would add is outside the grammar', () => {
  const cases = [
    ['an unconstrained parameter used in a member', { own: '<T = unknown>', props: '<T = unknown>', signature: '<T = unknown>' }, /Thing\.items\[\] -> T: T has no constraint, so it would erase to unknown/u],
    ['a type argument on the parameter', { members: '  bad?: T<string>;' }, /Thing\.bad -> T: T is a type parameter and takes no type arguments/u],
    ['a conditional type over the parameter', { members: "  bad?: T extends string ? 'a' : 'b';" }, /Thing\.bad: a conditional type is not in the grammar/u],
    ['a mapped type over the parameter', { members: '  bad?: { [K in keyof T]: string };' }, /Thing\.bad: a mapped type is not in the grammar/u],
    ['an indexed access of the parameter', { members: "  bad?: T['id'];" }, /Thing\.bad: an indexed access type is not in the grammar/u],
    ['keyof the parameter', { members: '  bad?: keyof T;' }, /Thing\.bad: a type operator other than readonly T\[\] is not in the grammar/u],
    ['a generic callback of the parameter', { members: '  onBad?: <U extends T>(item: U) => void;' }, /Thing\.onBad: a generic function is not in the grammar/u],
    ['the parameter with a type argument', { declarations: `${ROW}export interface Box<V = Row> { value: V }\n`, members: '  bad?: Box<T>;' }, /Thing\.bad -> Box: Box is a Mux UI-owned type; it takes no type arguments/u],
    ['an intersection with the parameter', { members: '  bad?: T & { extra: string };' }, /Thing\.bad: an intersection type is not in the grammar/u],
    ['a parameter that is the host\'s argument, left unconstrained', { own: '<T = unknown>', members: '  bad?: Iterable<T>;', props: '<T = unknown>', signature: '<T = unknown>' }, /Thing\.bad -> Iterable<0> -> T: T has no constraint/u],
    // The constraint of a used parameter is read by the grammar like any type, host applications included.
    ['a constraint outside the grammar', { own: '<T extends Row | Promise<number> = Row>', props: '<T extends Row | Promise<number> = Row>', signature: '<T extends Row | Promise<number> = Row>' }, /Thing<T> -> Promise: Promise<number> is not an application on the host allowlist/u],
  ];
  for (const [rule, options, pattern] of cases) rejects(genericThing(options), pattern, {}, rule);
});

test('the exported callable of another member is checked for its type parameters like the root', () => {
  const declarations = (alsoSignature) => `${genericThing({})}export declare const Thing: ThingComponent & { Root: { ${alsoSignature}(props: ThingProps<T> & React.RefAttributes<HTMLDivElement>): React.ReactElement | null } };\n`
    .replace('export declare const Thing: ThingComponent;\n', '');
  assert.deepEqual(extract({ declarations: declarations('<T extends Row = Row>'), also: [{ member: 'Root' }] }).props, ['items']);
  rejects(declarations('<T extends SubRow = SubRow>'), /Thing<T>: type parameter 1 is T in ThingOwnProps and T in the exported Thing\.Root, and they differ in their constraint/u, { also: [{ member: 'Root' }] });
  rejects(declarations(''), /Thing: ThingOwnProps declares 1 type parameters and the exported Thing\.Root 0/u, { also: [{ member: 'Root' }] });
});

test('the shipped allowlist holds exactly the host types the committed derived APIs reach', () => {
  const reached = new Map();
  for (const file of readdirSync(resolve(packageRoot, 'api'))) {
    for (const name of hostTypes(JSON.parse(readFileSync(resolve(packageRoot, 'api', file), 'utf8')).api)) {
      reached.set(name, [...(reached.get(name) ?? []), file]);
    }
  }
  assert.deepEqual([...reached.keys()].sort(), HOST_ALLOWLIST.map(hostEntryKey).sort());
  // Each entry, and the components that need it.
  assert.deepEqual(reached.get('HTMLButtonElement'), ['button.json', 'icon-button.json', 'menu.json', 'select.json', 'toggle-button.json'], 'the activation event target');
  assert.deepEqual(reached.get('React.ReactNode'), ['activity.json', 'autocomplete.json', 'breadcrumbs.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'color-swatch-picker.json', 'combo-box.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'disclosure.json', 'grid-list.json', 'input-tags.json', 'lightbox.json', 'list-box.json', 'markdown.json', 'menu.json', 'message.json', 'meter.json', 'multi-select.json', 'number-field.json', 'progress-bar.json', 'prompt-composer.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'select-native.json', 'select.json', 'sidebar.json', 'slider.json', 'switch.json', 'table.json', 'tabs.json', 'tag-group.json', 'tag-select.json', 'text-editor.json', 'text-field.json', 'time-field.json', 'toast.json', 'token-field.json', 'tooltip.json', 'tree.json', 'virtualizer.json'], 'caller-supplied content, and the node an Exclude starts from');
  assert.deepEqual(reached.get('React.ReactElement'), ['dialog.json', 'popover.json', 'preview-trigger.json', 'tooltip.json', 'virtualizer.json'], 'the element a trigger prop takes, and the GridList a grid Virtualizer lays out');
  assert.deepEqual(reached.get(hostEntryKey(host('Exclude', host('React.ReactNode'), { kind: 'union', members: [keyword('null'), keyword('undefined'), keyword('boolean')] }))), ['autocomplete.json', 'calendar.json', 'checkbox-group.json', 'color-area.json', 'color-field.json', 'color-slider.json', 'combo-box.json', 'date-field.json', 'date-picker.json', 'date-range-picker.json', 'dialog.json', 'number-field.json', 'radio-group.json', 'range-calendar.json', 'search-field.json', 'select.json', 'slider.json', 'switch.json', 'tag-group.json', 'text-field.json', 'time-field.json', 'toast.json', 'token-field.json', 'tooltip.json'], 'content that renders something');
  assert.deepEqual(reached.get('HTMLAnchorElement'), ['link.json'], 'the activation event target of Link');
  assert.deepEqual(reached.get('NumberFormatOptions'), ['meter.json', 'number-field.json'], 'the formatOptions of Meter and NumberField, written Intl.NumberFormatOptions');
  assert.deepEqual(reached.get('File'), ['drop-zone.json', 'file-trigger.json', 'prompt-composer.json'], 'the files FileTrigger selects, the File a DropZone item reads, and the files a PromptComposer attach picker reports');
  // The input attributes TextField's and SearchField's inputProps take, as FieldInputProps omits them: the element, its attributes, and the Omit of those.
  assert.deepEqual(reached.get('HTMLInputElement'), ['search-field.json', 'sidebar.json', 'text-field.json'], 'the element whose attributes inputProps takes, and whose change Sidebar.Search reports');
  assert.deepEqual(reached.get(hostEntryKey(INPUT_ATTRIBUTES)), ['search-field.json', 'text-field.json'], 'the attributes of the inner input');
  assert.deepEqual(reached.get(hostEntryKey(OMITTED_INPUT_ATTRIBUTES)), ['search-field.json', 'text-field.json'], 'the inner input\'s attributes less the 23 the field owns');
  // Virtualizer's onScroll reads as the function of React's UIEventHandler<HTMLDivElement>: a scroll of the viewport, which is a div.
  assert.deepEqual(reached.get('HTMLDivElement'), ['virtualizer.json'], 'the element a scroll event reports');
  assert.deepEqual(reached.get(hostEntryKey(host('React.UIEvent', host('HTMLDivElement')))), ['virtualizer.json'], 'the scroll event of the Virtualizer viewport');
  // A Table row's values: the cell content by column id, which no other family takes.
  assert.deepEqual(reached.get(hostEntryKey(host('Record', keyword('string'), host('React.ReactNode')))), ['table.json'], 'the cell values of a Table row');
  // TagGroup's selected item ids: a mutable Set, which no other family takes.
  assert.deepEqual(reached.get(hostEntryKey(host('Set', keyword('string')))), ['tag-group.json'], 'the selected ids of a TagGroup');
  // PromptComposer's inputProps: the textarea's attributes, as its props omit the four the composer owns.
  const textareaAttributes = host('React.TextareaHTMLAttributes', host('HTMLTextAreaElement'));
  assert.deepEqual(reached.get('HTMLTextAreaElement'), ['prompt-composer.json'], 'the element whose attributes inputProps takes');
  assert.deepEqual(reached.get(hostEntryKey(textareaAttributes)), ['prompt-composer.json'], 'the attributes of the textarea');
  assert.deepEqual(reached.get(hostEntryKey(OMITTED_TEXTAREA_ATTRIBUTES)), ['prompt-composer.json'], 'the textarea\'s attributes less the four the composer owns');
  // Select's trigger: a button element with the attributes and ref a button takes, each application listed.
  const buttonAttributes = host('React.ButtonHTMLAttributes', host('HTMLButtonElement'));
  const buttonProps = host('React.DetailedHTMLProps', buttonAttributes, host('HTMLButtonElement'));
  assert.deepEqual(reached.get(hostEntryKey(buttonAttributes)), ['select.json'], 'the native attributes of the trigger');
  assert.deepEqual(reached.get(hostEntryKey(buttonProps)), ['select.json'], 'the attributes and ref of the trigger');
  assert.deepEqual(reached.get(hostEntryKey(host('React.ReactElement', buttonProps, { kind: 'literal', value: 'button' }))), ['select.json'], 'the trigger element');
  // DropZone's drop items: a file item reads a File or its text, a text item lists its formats, a directory its entries.
  const dropItems = [
    [host('Promise', host('File')), 'a file item\'s read'],
    [host('Promise', keyword('string')), 'a file or text item\'s text'],
    [host('ReadonlySet', keyword('string')), 'the formats a text item lists'],
    [host('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }), 'a directory item\'s entries'],
  ];
  for (const [entry, reason] of dropItems) assert.deepEqual(reached.get(hostEntryKey(entry)), ['drop-zone.json'], reason);
  // TextEditor's selection request: the signal that cancels an action, and the promise a handler returns.
  assert.deepEqual(reached.get('AbortSignal'), ['text-editor.json'], 'the signal of a selection request');
  assert.deepEqual(reached.get(hostEntryKey(host('Promise', { kind: 'unknown' }))), ['text-editor.json'], 'the result of a selection request handler');
  // Sidebar.Search's onChange reads as the function of the input's change event, and a nav item or button takes an icon component for a class name.
  assert.deepEqual(reached.get(hostEntryKey(host('React.ChangeEvent', host('HTMLInputElement')))), ['sidebar.json'], 'the change event of the Sidebar.Search input');
  assert.deepEqual(reached.get(hostEntryKey(host('React.ComponentType', { kind: 'reference', name: 'SidebarIconProps' }))), ['sidebar.json'], 'the icon of a Sidebar nav item or button');
  // The target of a supplemental part's activation, which SupplementalActivation types as any event target.
  assert.deepEqual(reached.get('EventTarget'), ['alert-dialog.json', 'card.json'], 'the target of an AlertDialog or Card.Button activation');
  // The keys and items of MultiSelect and TagSelect: an item's id, the Set a selection is, and the items MultiSelect lists, recorded at the item type's constraint.
  assert.deepEqual(reached.get('React.Key'), ['multi-select.json', 'tag-select.json'], 'the id of an item');
  assert.deepEqual(reached.get(hostEntryKey(host('Set', host('React.Key')))), ['multi-select.json', 'tag-select.json'], 'the selected keys');
  assert.deepEqual(reached.get(hostEntryKey(host('Iterable', { kind: 'reference', name: 'MultiSelectItem' }))), ['multi-select.json'], 'the items of a MultiSelect');
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
    ['another element', omitInputAttributes(OWNED_INPUT_PROPS, 'HTMLSelectElement'), /Thing\.bad -> Omit<0> -> React\.InputHTMLAttributes<0> -> HTMLSelectElement: HTMLSelectElement is outside @muxui\/react and not in the host allowlist/u],
    ['the textarea\'s element', omitInputAttributes(OWNED_INPUT_PROPS, 'HTMLTextAreaElement'), /Thing\.bad -> Omit<0> -> React\.InputHTMLAttributes: React\.InputHTMLAttributes<HTMLTextAreaElement> is not an application on the host allowlist/u],
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

test('a trigger prop admits the exact button element Select takes and nothing near it', () => {
  const buttonElement = "React.ReactElement<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, 'button'>";
  const exact = extract({ declarations: ownProps(`  trigger?: ${buttonElement};`) });
  const attributes = host('React.ButtonHTMLAttributes', host('HTMLButtonElement'));
  assert.deepEqual(exact.propDetails.trigger.type, host('React.ReactElement', host('React.DetailedHTMLProps', attributes, host('HTMLButtonElement')), { kind: 'literal', value: 'button' }));
  // The intersection main spelled is outside the grammar, and another tag, element, or wrapper is another type.
  const near = [
    ['the intersection of attributes and ref', "React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement> & React.RefAttributes<HTMLButtonElement>, 'button'>", /Thing\.bad -> React\.ReactElement<0>: an intersection type is not in the grammar/u],
    ['no tag', 'React.ReactElement<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>>', /Thing\.bad -> React\.ReactElement: React\.ReactElement<React\.DetailedHTMLProps<React\.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>> is not an application on the host allowlist/u],
    ['another tag', "React.ReactElement<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, 'a'>", /Thing\.bad -> React\.ReactElement: React\.ReactElement<.*"a"> is not an application on the host allowlist/u],
    ['another element', "React.ReactElement<React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLAnchorElement>, 'button'>", /Thing\.bad -> React\.ReactElement<0> -> React\.DetailedHTMLProps: React\.DetailedHTMLProps<React\.ButtonHTMLAttributes<HTMLButtonElement>, HTMLAnchorElement> is not an application on the host allowlist/u],
    ['other attributes', "React.ReactElement<React.DetailedHTMLProps<React.HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>, 'button'>", /Thing\.bad -> React\.ReactElement<0> -> React\.DetailedHTMLProps<0> -> React\.HTMLAttributes: React\.HTMLAttributes<HTMLButtonElement> is not an application on the host allowlist/u],
    ['the attributes alone', 'React.DetailedHTMLProps<React.HTMLAttributes<HTMLButtonElement>, HTMLButtonElement>', /Thing\.bad -> React\.DetailedHTMLProps<0> -> React\.HTMLAttributes: React\.HTMLAttributes<HTMLButtonElement> is not an application on the host allowlist/u],
  ];
  for (const [reason, type, pattern] of near) {
    assert.throws(() => extract({ declarations: ownProps(`  bad?: ${type};`) }), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, pattern, reason);
      return true;
    }, reason);
  }
});

test('inputProps admits the exact Omit of the textarea\'s attributes PromptComposer declares and nothing near it', () => {
  const omitTextarea = (names, element = 'HTMLTextAreaElement') => `Omit<React.TextareaHTMLAttributes<${element}>, ${names.map((name) => `'${name}'`).join(' | ')}>`;
  const exact = extract({ declarations: ownProps(`  inputProps?: ${omitTextarea(OWNED_TEXTAREA_PROPS)};\n  attributes?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;`) });
  assert.deepEqual(exact.propDetails.inputProps.type, OMITTED_TEXTAREA_ATTRIBUTES);
  assert.deepEqual(exact.propDetails.attributes.type, host('React.TextareaHTMLAttributes', host('HTMLTextAreaElement')));
  const near = [
    ['a narrower omission', omitTextarea(['value']), /Thing\.bad -> Omit: Omit<React\.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> is not an application on the host allowlist/u],
    ['one member missing', omitTextarea(OWNED_TEXTAREA_PROPS.slice(0, -1)), /Thing\.bad -> Omit: Omit<.*"children"> is not an application on the host allowlist/u],
    ['one member more', omitTextarea([...OWNED_TEXTAREA_PROPS, 'rows']), /Thing\.bad -> Omit: Omit<.*"rows"> is not an application on the host allowlist/u],
    ['the same members reversed', omitTextarea([...OWNED_TEXTAREA_PROPS].reverse()), /Thing\.bad -> Omit: Omit<.*"value"> is not an application on the host allowlist/u],
    ['another element', omitTextarea(OWNED_TEXTAREA_PROPS, 'HTMLInputElement'), /Thing\.bad -> Omit<0> -> React\.TextareaHTMLAttributes: React\.TextareaHTMLAttributes<HTMLInputElement> is not an application on the host allowlist/u],
    ['the input\'s omission', omitInputAttributes(OWNED_TEXTAREA_PROPS), /Thing\.bad -> Omit: Omit<React\.InputHTMLAttributes<HTMLInputElement>, "value" \| "defaultValue" \| "children" \| "dangerouslySetInnerHTML"> is not an application on the host allowlist/u],
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
  // A rest-marked first parameter destructures the arguments array: its names are dummy bindings and its defaults are never the props'.
  // The first source defaults variant to primary in the pattern and neutral in the body, which the dummy default used to hide; the second agrees with itself.
  const restSource = (patternDefault, bodyDefault) => `export function Thing(...{ variant = '${patternDefault}', size = 'md', count = -2, tags = ['a', 'b'], pending, onActivate, ...args }: [Record<string, unknown>]) { return [variant, args[0].variant ?? '${bodyDefault}', size, count, tags, pending, onActivate]; }\n`;
  for (const source of [restSource('primary', 'neutral'), restSource('primary', 'primary')]) {
    rejects(declarations, /Thing: the props parameter must not be a rest parameter: a rest pattern destructures the arguments array, so its names and defaults are not the props'/u, { source });
  }
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

test('an export that is one name reads defaults from the component that name stands for', () => {
  const declarations = ownProps("  size?: 'sm' | 'md';");
  const imports = "import { forwardRef } from 'react';\n";
  const fn = "function Root({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; }\n";
  const wrapped = `${imports}const Root = forwardRef(function Root({ size = 'sm', ...props }: Record<string, unknown>) { return [size, props]; });\n`;
  const read = (source) => extract({ declarations, source }).defaults;
  // A function declaration or a forwardRef const, exported as itself, typed, or through a cast (the typed-export idiom of a family whose
  // exported type is wider than the function it renders with).
  for (const source of [
    `${fn}export const Thing = Root;\n`,
    `${fn}export const Thing: typeof Root = (Root) as unknown as typeof Root;\n`,
    `${wrapped}export const Thing = Root;\n`,
    `${wrapped}export const Thing: typeof Root = Root as unknown as typeof Root;\n`,
    // A literal displayName assignment is the one write a component is read through.
    `${wrapped}Root.displayName = 'Thing';\nexport const Thing = Root;\n`,
  ]) assert.deepEqual(read(source), { size: 'sm' }, source);
  // The name is read as any named component is: a top-level function or const of this source that is one, and nothing it could be
  // swapped for.
  const rejections = [
    ['Missing', '', /Thing: Missing is not a top-level function declaration or const in the component's source/u],
    ['Root', "let Root = function Root({ size = 'sm' }: Record<string, unknown>) { return size; };\n", /Thing: Root is not a top-level function declaration or const in the component's source/u],
    ['Root', "import { Root } from './other';\n", /Thing: Root is not a top-level function declaration or const in the component's source/u],
    ['Alias', `${fn}const Alias = Root;\n`, /Thing: Alias must be a function, forwardRef, or memo call/u],
    ['Root', "const Root = { size: 'sm' };\n", /Thing: Root must be a function, forwardRef, or memo call/u],
    ['Root', `${wrapped}Root.render = () => null;\n`, /Thing: the source writes to Root, which the component's defaults are read through, beyond a literal displayName assignment/u],
    // What the function does with a prop outside its parameter is refused as for any component.
    ['Root', "function Root({ size = 'sm' }: Record<string, unknown>) { size ??= 'md'; return size; }\n", /Thing\.size: the component assigns to size outside its props parameter/u],
    ['Root', "function Root(props: Record<string, unknown>) { const { size = 'sm' } = props; return size; }\n", /Thing: the props parameter must be an object pattern/u],
  ];
  for (const [exported, before, pattern] of rejections) rejects(declarations, pattern, { source: `${before}export const Thing = ${exported};\n` });
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
  rejects(ownProps('  size?: string;\n  [key: string]: string | undefined;'), /Thing\.<member>: only property signatures, and required methods of a nested object type, are in the grammar/u);
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
    ['a method beside the marker', 'export interface Bad { id?: string; call(): void; [key: string]: unknown }\n', /Thing\.bad -> Bad\.call: a method is in the grammar only as a member of a nested object type or interface that has no base/u],
    ['a method beside the marker, in a type literal', 'export type Bad = { id?: string; call(): void; [key: string]: unknown };\n', /Thing\.bad -> Bad\.call: a method is in the grammar only as a member of a nested object type or interface that has no base/u],
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

// The members an item type lists, read as one object type: what an interface with a base, or an intersection alias, must equal.
const itemMembers = [
  { name: 'id', type: { kind: 'string' }, required: false, readonly: false, description: 'The stable id.' },
  { name: 'label', type: { kind: 'host', name: 'React.ReactNode' }, required: false, readonly: false },
  { name: 'color', type: { kind: 'string' }, required: false, readonly: false },
];
const openItem = 'export interface Item {\n  /** The stable id. */\n  id?: string;\n  label?: React.ReactNode;\n  [key: string]: unknown;\n}\n';

test('an interface reads its one Mux UI-owned base, and an alias its whole-body intersection, as one object type with the base first', () => {
  const flat = extract({ declarations: ownProps('  item?: Row;', openItem.replace('Item', 'Row').replace('  [key', '  color?: string;\n  [key')) }).types.Row;
  const flatType = { kind: 'object', members: itemMembers, additional: 'unknown' };
  assert.deepEqual(flat.type, flatType);
  const forms = {
    'one base': `${openItem}export interface Row extends Item { color?: string }\n`,
    // The chain's members run from its root down, and a base at any depth may carry the marker.
    'several levels': `${openItem}export interface Mid extends Item { }\nexport interface Row extends Mid { color?: string }\n`,
    'an interface and a literal': `${openItem}export type Row = Item & { color?: string };\n`,
    'a literal and an interface': `export type Row = { color?: string } & Item;\n${openItem}`,
    'two interfaces and a literal': `${openItem}export interface Tint { color?: string }\nexport type Row = Item & Tint & { };\n`,
    'an interface with a base, as an operand': `${openItem}export interface Mid extends Item { }\nexport type Row = Mid & { color?: string };\n`,
  };
  for (const [form, extra] of Object.entries(forms)) {
    const api = extract({ declarations: ownProps('  item?: Row;', extra) });
    const { type } = api.types.Row;
    // The members are the flat ones, in base-first order and with the marker; the description of a base member is kept.
    assert.deepEqual(type.members.map(({ name }) => name).sort(), ['color', 'id', 'label'], form);
    assert.equal(type.additional, 'unknown', form);
    assert.equal(type.members.find(({ name }) => name === 'id').description, 'The stable id.', form);
    if (form === 'one base' || form === 'an interface and a literal') assert.deepEqual(type, flatType, form);
    // The base is flattened into the child's record; it is no type of its own in the block.
    assert.deepEqual(Object.keys(api.types), ['Row'], form);
  }
  // A base that is also a prop's type of its own stays one, with the child as another.
  const both = extract({ declarations: ownProps('  base?: Item;\n  row?: Row;', `${openItem}export interface Row extends Item { color?: string }\n`) });
  assert.deepEqual(Object.keys(both.types), ['Item', 'Row']);
  // A recursive member of the child (a tree item's children) still refers to the child by name.
  const tree = extract({ declarations: ownProps('  items?: Node[];', `${openItem}export interface Node extends Item { children?: Node[] }\n`) });
  assert.deepEqual(tree.types.Node.type.members.at(-1), { name: 'children', type: { kind: 'array', element: { kind: 'reference', name: 'Node' }, readonly: false }, required: false, readonly: false });
  // A base reached through an import, and through an import alias, from another file.
  const other = "import type * as React from 'react';\nexport interface Source { id?: string; [key: string]: unknown }\n";
  const imported = extract({
    declarations: ownProps('  item?: Row;', "import type { Source as Renamed } from './other.js';\nexport interface Row extends Renamed { color?: string }\n"),
    files: { 'other.d.ts': other },
  });
  assert.deepEqual(imported.types.Row.type.members.map(({ name }) => name), ['id', 'color']);
  assert.equal(imported.types.Row.type.additional, 'unknown');
  const throughIntersection = extract({
    declarations: ownProps('  item?: Row;', "import type { Source as Renamed } from './other.js';\nexport type Row = Renamed & { color?: string };\n"),
    files: { 'other.d.ts': other },
  });
  assert.deepEqual(throughIntersection.types.Row, imported.types.Row);
  // An interface with no base is read as it was: no marker is added.
  assert.equal(Object.hasOwn(extract({ declarations: ownProps('  item?: Plain;', 'export interface Plain { id?: string }\n') }).types.Plain.type, 'additional'), false);
});

test('the heritage and intersection rule refuses everything but one non-generic Mux UI-owned base and a whole-body intersection of owned types', () => {
  const generic = 'export interface Box<T> { value?: T }\n';
  const library = "import type { HTMLAttributes } from 'react';\n";
  const cases = [
    // An interface has at most one base, whichever clause form lists them.
    ['two bases', `${openItem}export interface Tint { color?: string }\nexport interface Row extends Item, Tint { }\n`, /Thing\.item -> Row: Row extends 2 types; an interface has at most one base/u],
    ['a base with type arguments', `${generic}export interface Row extends Box<string> { }\n`, /Thing\.item -> Row -> Box: Box is written with type arguments; a base takes none/u],
    ['a generic base, even without arguments', `${generic}export interface Row extends Box { }\n`, /Thing\.item -> Row -> Box: Box is generic; a base is not/u],
    ['an alias base', 'export type Shape = { id?: string };\nexport interface Row extends Shape { }\n', /Thing\.item -> Row -> Shape: Shape is not an interface; a base is a Mux UI-owned interface, not an alias, class, or enum/u],
    ['a qualified base', "export interface Row extends React.HTMLAttributes<HTMLElement> { }\n", /Thing\.item -> Row -> React\.HTMLAttributes: React\.HTMLAttributes is not a plain identifier; a base is one naming a Mux UI-owned interface/u],
    ['a qualified base from a Mux UI-owned namespace', 'export declare namespace Ns { interface Item { id?: string } }\nexport interface Row extends Ns.Item { }\n', /Thing\.item -> Row -> Ns\.Item: Ns\.Item is not a plain identifier/u],
    ['a host base by name, with arguments', `${library}export interface Row extends HTMLAttributes<HTMLElement> { }\n`, /Thing\.item -> Row -> HTMLAttributes: HTMLAttributes is written with type arguments/u],
    ['a host base by name, bare', "import type { Component } from 'react';\nexport interface Row extends Component { }\n", /Thing\.item -> Row -> Component: Component is outside @muxui\/react, or also declared there; a base is a Mux UI-owned interface/u],
    ['a library base', 'export interface Row extends Event { }\n', /Thing\.item -> Row -> Event: Event is outside @muxui\/react, or also declared there; a base is a Mux UI-owned interface/u],
    ['a library base with a Mux UI-owned declaration merged in', 'declare global { interface Event { extra?: string } }\nexport interface Row extends Event { }\n', /Thing\.item -> Row -> Event: Event is outside @muxui\/react, or also declared there/u],
    ['a base declared twice', `${openItem}export interface Item { color?: string }\nexport interface Row extends Item { }\n`, /Thing\.item -> Row -> Item: Item has 2 declarations; a Mux UI-owned type has one/u],
    ['an unresolved base', 'export interface Row extends Missing { }\n', /Thing\.item -> Row -> Missing: Missing does not resolve/u],
    // A redeclaration could narrow a base member, which the grammar cannot express.
    ['a redeclared member', `${openItem}export interface Row extends Item { id?: 'a' | 'b' }\n`, /Thing\.item -> Row\.id: id is declared twice among the joined members/u],
    ['a redeclared member two levels up', `${openItem}export interface Mid extends Item { }\nexport interface Row extends Mid { label?: string }\n`, /Thing\.item -> Row\.label: label is declared twice/u],
    ['a second index signature', `${openItem}export interface Row extends Item { [key: string]: unknown }\n`, /Thing\.item -> Row: an index signature is in the grammar only as the one member of its object type, or as the one mutable/u],
    ['a base with a readonly signature beside members', "export interface Item { id?: string; readonly [key: string]: unknown }\nexport interface Row extends Item { color?: string }\n", /Thing\.item -> Row: .*beside named properties it must be mutable/u],
    ['a base with another signature value', "export interface Item { id?: string; [key: string]: string | undefined }\nexport interface Row extends Item { color?: string }\n", /Thing\.item -> Row: .*its value is written as the keyword unknown/u],
    ['a method in the base', "export interface Item { id?: string; call(): void }\nexport interface Row extends Item { color?: string }\n", /Thing\.item -> Row\.call: a method is in the grammar only as a member of a nested object type or interface that has no base/u],
    // The chain is walked by resolved symbol, so no spelling or distance escapes the cycle check.
    ['a base cycle of one', 'export interface Row extends Row { id?: string }\n', /Thing\.item -> Row -> Row: Row extends itself through its bases/u],
    ['a base cycle of two', 'export interface Row extends Other { id?: string }\nexport interface Other extends Row { color?: string }\n', /Thing\.item -> Row -> Other -> Row: Row extends itself through its bases/u],
    ['a base cycle of three', 'export interface Row extends A { id?: string }\nexport interface A extends B { }\nexport interface B extends A { }\n', /extends itself through its bases/u],
    // An intersection is read only as the whole body of a named alias, of type literals and owned interfaces.
    ['an intersection with a host type', `${openItem}export type Row = Item & React.HTMLAttributes<HTMLElement>;\n`, /Thing\.item -> Row -> React\.HTMLAttributes: React\.HTMLAttributes is not a plain identifier; an intersection operand is one/u],
    ['an intersection with a library type', `${openItem}export type Row = Item & Event;\n`, /Thing\.item -> Row -> Event: Event is outside @muxui\/react, or also declared there; an intersection operand is a Mux UI-owned interface/u],
    ['an intersection with a union', `${openItem}export type Row = Item & ({ color?: string } | { size?: string });\n`, /Thing\.item -> Row: a parenthesized type is not an operand of an intersection/u],
    ['a union that holds an intersection', `${openItem}export type Row = Item & { color?: string } | number;\n`, /Thing\.item -> Row: an intersection type is not in the grammar/u],
    ['an intersection with an alias of an object', `${openItem}export type Shape = { color?: string };\nexport type Row = Item & Shape;\n`, /Thing\.item -> Row -> Shape: Shape is not an interface; an intersection operand is a Mux UI-owned interface, not an alias, class, or enum/u],
    ['an intersection with an applied generic', `${openItem}${generic}export type Row = Item & Box<string>;\n`, /Thing\.item -> Row -> Box: Box is written with type arguments; an intersection operand takes none/u],
    ['an intersection with a generic interface', `${openItem}${generic}export type Row = Item & Box;\n`, /Thing\.item -> Row -> Box: Box is generic; an intersection operand is not/u],
    ['an intersection with an inline intersection', `${openItem}export type Row = Item & ({ color?: string } & { size?: string });\n`, /Thing\.item -> Row: a parenthesized type is not an operand of an intersection/u],
    ['an intersection with a primitive', `${openItem}export type Row = Item & string;\n`, /Thing\.item -> Row: string is not an operand of an intersection; an operand is a type literal or a Mux UI-owned interface/u],
    ['an intersection with an interface that has a host base', `export interface Mid extends Event { }\nexport type Row = Mid & { color?: string };\n`, /Thing\.item -> Row -> Mid -> Event: Event is outside @muxui\/react/u],
    ['an intersection member named twice', `${openItem}export type Row = Item & { id?: string };\n`, /Thing\.item -> Row\.id: id is declared twice among the joined members/u],
    ['an intersection of two interfaces that share a base', `${openItem}export interface A extends Item { }\nexport interface B extends Item { }\nexport type Row = A & B;\n`, /Thing\.item -> Row\.id: id is declared twice/u],
    ['an intersection with two index signatures', `${openItem}export type Row = Item & { [key: string]: unknown };\n`, /Thing\.item -> Row: an index signature is in the grammar only as the one member of its object type, or as the one mutable/u],
    ['an intersection with an operand cycle', 'export interface A extends B { }\nexport interface B extends A { }\nexport type Row = A & { color?: string };\n', /extends itself through its bases/u],
    ['a generic alias intersection', `${openItem}export type Row<T> = Item & { value?: T };\n`, /Thing\.item -> Row: Row is generic/u],
  ];
  for (const [label, extra, pattern] of cases) {
    assert.throws(() => extract({ declarations: ownProps('  item?: Row;', extra) }), (error) => {
      assert.ok(error instanceof ApiExtractionError, `${label}: ${error.stack}`);
      assert.match(error.message, pattern, label);
      return true;
    }, label);
  }
  // A cycle through another file is found by symbol too.
  assert.throws(() => extract({
    declarations: ownProps('  item?: Row;', "import type { Other } from './other.js';\nexport interface Row extends Other { id?: string }\n"),
    files: { 'other.d.ts': "import type { Row } from './thing.js';\nexport interface Other extends Row { color?: string }\n" },
  }), /extends itself through its bases/u);
  // An intersection anywhere but the whole body of an alias is still not in the grammar: a member, an argument, an element, a union arm.
  const inline = ['  bad?: Item & Tint;', '  bad?: (Item & Tint)[];', '  bad?: Item & Tint | string;', '  onBad?: (value: Item & Tint) => void;'];
  for (const members of inline) rejects(ownProps(members, `${openItem}export interface Tint { color?: string }\n`), /Thing\.(?:bad|onBad)(?:\[\]|\(value\))?: an intersection type is not in the grammar/u);
  // An alias of an intersection is not an alias base, and OwnProps may extend nothing.
  rejects(ownProps('  size?: string;').replace('export interface ThingOwnProps {', `${openItem}export interface ThingOwnProps extends Item {`), /Thing: ThingOwnProps extends another type/u);
  rejects(ownProps('  size?: string;').replace('export interface ThingOwnProps {', `${openItem}export type Mixed = Item & { size?: string };\nexport interface ThingOwnProps extends Mixed {`), /Thing: ThingOwnProps extends another type/u);
  rejects(`${header}${openItem}export type ThingOwnProps = Item & { size?: string };\nexport interface ThingProps extends ThingOwnProps { }\nexport declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLButtonElement>>;\n`, /Thing: ThingOwnProps must be an object type/u);
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

const toolsTuple = `export type ThingParagraph = { type: 'paragraph' };
export type ThingQuote = { type: 'quote'; content: [ThingBlock, ...ThingBlock[]] };
export type ThingBlock = ThingParagraph | ThingQuote;
`;

test('a tuple is a non-empty prefix of required elements and at most one terminal rest array', () => {
  const api = extract({
    declarations: ownProps(`  pair?: [string, number];
  head?: [string, ...(number | null)[]];
  quote?: ThingQuote;
  onPick?: (value: [ThingBlock, ...ThingBlock[]]) => void;`, toolsTuple),
  });
  assert.deepEqual(api.propDetails.pair.type, { kind: 'tuple', elements: [keyword('string'), keyword('number')] });
  assert.deepEqual(api.propDetails.head.type, { kind: 'tuple', elements: [keyword('string')], rest: { kind: 'union', members: [keyword('number'), keyword('null')] } });
  // A recursive tuple refers to its own type by name, as any recursive type does.
  const ref = { kind: 'reference', name: 'ThingBlock' };
  const content = api.types.ThingQuote.type.members.find(({ name }) => name === 'content');
  assert.deepEqual(content.type, { kind: 'tuple', elements: [ref], rest: ref });
  assert.deepEqual(api.eventDetails.pick.type.parameters[0].type, { kind: 'tuple', elements: [ref], rest: ref });
  assert.deepEqual(Object.keys(api.types), ['ThingBlock', 'ThingParagraph', 'ThingQuote']);
  // A tuple is no list of options: its literals are not an enum.
  assert.equal(extract({ declarations: ownProps("  pair?: ['a', 'b'];") }).propDetails.pair.enum, undefined);

  const cases = [
    ['  bad?: [];', '', /Thing\.bad: an empty tuple is not in the grammar/u],
    ['  bad?: [...string[]];', '', /Thing\.bad: a tuple needs a required first element before its rest/u],
    ['  bad?: [string?];', '', /Thing\.bad: an optional tuple element is not in the grammar/u],
    ['  bad?: [string, number?];', '', /Thing\.bad: an optional tuple element is not in the grammar/u],
    ['  bad?: [a: string, b: number];', '', /Thing\.bad: a named tuple element is not in the grammar/u],
    ['  bad?: [first: string, ...rest: string[]];', '', /Thing\.bad: a named tuple element is not in the grammar/u],
    ['  bad?: [string, ...string[], number];', '', /Thing\.bad: a rest element before the last is not in the grammar/u],
    ['  bad?: [...string[], string];', '', /Thing\.bad: a rest element before the last is not in the grammar/u],
    ['  bad?: [string, ...string[], ...number[]];', '', /Thing\.bad: a rest element before the last is not in the grammar/u],
    // A spread of anything but an array is a generic spread.
    ['  bad?: [string, ...Tail];', 'export type Tail = string[];\n', /Thing\.bad: a rest element that is not an array \(a generic spread\) is not in the grammar/u],
    ['  bad?: [string, ...readonly string[]];', '', /Thing\.bad: a rest element that is not an array/u],
    ['  bad?: readonly [string, ...string[]];', '', /Thing\.bad: a type operator other than readonly T\[\] is not in the grammar/u],
    // Every element is read by the grammar, with the chain naming its place.
    ['  bad?: [never, ...string[]];', '', /Thing\.bad\[0\]: never is not in the grammar/u],
    ['  bad?: [string, ...never[]];', '', /Thing\.bad\[\.\.\.\]: never is not in the grammar/u],
    ['  bad?: [unknown];', '', /Thing\.bad\[0\]: unknown is not in the grammar/u],
    ['  bad?: [string, ...unknown[]];', '', /Thing\.bad\[\.\.\.\]: unknown is not in the grammar/u],
    ['  bad?: [any];', '', /Thing\.bad\[0\]: any is not in the grammar/u],
    ['  onBad?: () => [Promise<unknown>];', '', /Thing\.onBad=>\[0\] -> Promise<0>: unknown is not in the grammar/u],
  ];
  for (const [members, extra, pattern] of cases) rejects(ownProps(members, extra), pattern);
});

test('a required method of a nested object type reads as its function with method: true, and in no other position', () => {
  const declared = `/** The link controls. */
export type ThingLinks = {
  /** Sets the link. */
  setLink(href: string): boolean;
  unsetLink(): boolean;
};
export interface ThingActions {
  readonly label: string;
  replace(content: string | ThingDoc): boolean;
  close(): void;
  onDone?: () => void;
}
export type ThingDoc = { type: 'doc' };
`;
  const api = extract({
    declarations: ownProps(`  links?: ThingLinks;
  actions?: ThingActions;
  onImage?: (actions: { insertImage(src: string, alt?: string): boolean }) => void;`, declared),
  });
  const method = (name, parameters, returns, extra = {}) => ({ name, type: { kind: 'function', parameters, returns }, required: true, readonly: false, method: true, ...extra });
  assert.deepEqual(api.types.ThingLinks, {
    type: {
      kind: 'object',
      members: [
        method('setLink', [{ name: 'href', type: keyword('string'), required: true }], keyword('boolean'), { description: 'Sets the link.' }),
        method('unsetLink', [], keyword('boolean')),
      ],
    },
    description: 'The link controls.',
  });
  assert.deepEqual(api.types.ThingActions.type.members, [
    { name: 'label', type: keyword('string'), required: true, readonly: true },
    method('replace', [{ name: 'content', type: { kind: 'union', members: [keyword('string'), { kind: 'reference', name: 'ThingDoc' }] }, required: true }], keyword('boolean')),
    method('close', [], keyword('void')),
    // A function-typed property stays a property, beside methods.
    { name: 'onDone', type: { kind: 'function', parameters: [], returns: keyword('void') }, required: false, readonly: false },
  ]);
  // An inline object type in a callback's parameter holds its methods the same way, with a parameter optional where the source says so.
  assert.deepEqual(api.eventDetails.image.type.parameters[0].type, {
    kind: 'object',
    members: [method('insertImage', [{ name: 'src', type: keyword('string'), required: true }, { name: 'alt', type: keyword('string'), required: false }], keyword('boolean'))],
  });
  // A function property beside the D1 marker is still a property.
  const open = extract({ declarations: ownProps('  item?: Open;', 'export interface Open { id?: string; onX?: () => void; readonly run: () => void; [key: string]: unknown }\n') });
  assert.deepEqual(open.types.Open.type.members.slice(1), [
    { name: 'onX', type: { kind: 'function', parameters: [], returns: keyword('void') }, required: false, readonly: false },
    { name: 'run', type: { kind: 'function', parameters: [], returns: keyword('void') }, required: true, readonly: true },
  ]);
  assert.equal(open.types.Open.type.additional, 'unknown');

  const base = 'export interface Base { read(): void }\n';
  const here = (type) => `export type Bad = ${type};\n`;
  const nested = /Thing\.bad -> Bad\.read: a method is in the grammar only as a member of a nested object type or interface that has no base, is no operand of an intersection, and has no index signature/u;
  const cases = [
    // The method itself.
    ['optional', here('{ read?(): void }'), /Thing\.bad -> Bad\.read: an optional method is not in the grammar; a method is required/u],
    ['generic', here('{ read<T>(value: T): void }'), /Thing\.bad -> Bad\.read: a generic function is not in the grammar/u],
    ['overloaded', here('{ read(value: string): void; read(value: number): void }'), /Thing\.bad -> Bad\.read: read is declared twice in its object type/u],
    ['a method and a property', here('{ read(): void; read: string }'), /Thing\.bad -> Bad\.read: read is declared twice in its object type/u],
    ['a property and a method', here('{ read: string; read(): void }'), /Thing\.bad -> Bad\.read: read is declared twice in its object type/u],
    ['a quoted name', here("{ 'read'(): void }"), /Thing\.bad -> Bad\.read: a method needs a plain identifier name/u],
    ['a computed name', `export declare const key: unique symbol;\n${here('{ [key](): void }')}`, /Thing\.bad -> Bad\.<member>: a method needs a plain identifier name/u],
    ['a readonly modifier', here('{ readonly read(): void }'), /Thing\.bad -> Bad\.read: a method cannot be readonly/u],
    ['no declared return type', here('{ read(value: string) }'), /Thing\.bad -> Bad\.read: a method needs a declared return type/u],
    ['a this parameter', here('{ read(this: Bad): void }'), /Thing\.bad -> Bad\.read\(this\): a this parameter is not in the grammar/u],
    ['a rest parameter', here('{ read(...values: string[]): void }'), /Thing\.bad -> Bad\.read: a rest parameter is not in the grammar/u],
    ['a parameter without a type', here('{ read(value): void }'), /Thing\.bad -> Bad\.read: each callback parameter needs a name and a type/u],
    ['an accessor', here('{ get read(): string }'), /Thing\.bad -> Bad\.read: only property signatures, and required methods of a nested object type, are in the grammar/u],
    ['a call signature', here('{ (value: string): void }'), /Thing\.bad -> Bad\.<member>: only property signatures, and required methods/u],
    ['a construct signature', here('{ new (): Bad }'), /Thing\.bad -> Bad\.<member>: only property signatures, and required methods/u],
    // Where it is held: a method of a declaration the object type is not read from alone is refused, whichever way it got there.
    ['beside the marker, in an interface', 'export interface Bad { id?: string; read(): void; [key: string]: unknown }\n', nested],
    ['beside the marker, in a type literal', here('{ id?: string; read(): void; [key: string]: unknown }'), nested],
    ['in an interface base', `${base}export interface Bad extends Base { label?: string }\n`, nested],
    ['in an interface that has a base', 'export interface Base { id?: string }\nexport interface Bad extends Base { read(): void }\n', nested],
    ['in a base two levels up', `${base}export interface Mid extends Base { }\nexport interface Bad extends Mid { label?: string }\n`, nested],
    ['in an imported base', "import type { Base } from './other.js';\nexport interface Bad extends Base { label?: string }\n", nested, { files: { 'other.d.ts': base } }],
    ['in an intersection interface operand', `${base}${here('Base & { label?: string }')}`, nested],
    ['in an intersection type-literal operand', here('{ read(): void } & { label?: string }'), nested],
    ['in an interface operand that has a base', `${base}export interface Mid extends Base { }\n${here('Mid & { label?: string }')}`, nested],
    // A name that a base and its interface both use, as a property and a method, is refused whichever is first.
    ['a base property redeclared as a method', 'export interface Base { read: string }\nexport interface Bad extends Base { read(): void }\n', /Thing\.bad -> Bad\.read: read is declared twice among the joined members/u],
    ['a base method redeclared as a property', `${base}export interface Bad extends Base { read: string }\n`, /Thing\.bad -> Bad\.read: read is declared twice among the joined members/u],
    ['an intersection operand method and property', `${base}${here('Base & { read: string }')}`, /Thing\.bad -> Bad\.read: read is declared twice among the joined members/u],
  ];
  for (const [label, extra, pattern, options] of cases) {
    assert.throws(() => extract({ declarations: ownProps('  bad?: Bad;', extra), ...options }), (error) => {
      assert.ok(error instanceof ApiExtractionError, `${label}: ${error.stack}`);
      assert.match(error.message, pattern, label);
      return true;
    }, label);
  }
  // A method at the top level of the props type, as a prop or as an event, is no member of a nested object type.
  rejects(ownProps('  read(): void;'), /Thing\.read: a method is in the grammar only as a member of a nested object type/u);
  rejects(ownProps('  onRead?(value: string): void;'), /Thing\.onRead: a method is in the grammar only as a member of a nested object type/u);
  // A method is no member of an array element, a union arm, or a record: each is an object type read like any other, so a literal there holds it.
  assert.equal(extract({ declarations: ownProps('  list?: { read(): void }[];\n  either?: { read(): void } | string;') }).propDetails.list.type.element.members[0].method, true);
});

test('Promise<unknown> is read only where a function returns it, as the default library\'s Promise and an exact allowlist entry', () => {
  const promiseUnknown = host('Promise', keyword('unknown'));
  // The shipped allowlist holds the entry (TextEditor's selection request); the controls below that need it absent start from the rest.
  const allowlist = HOST_ALLOWLIST;
  const withoutPromiseUnknown = HOST_ALLOWLIST.filter((entry) => hostEntryKey(entry) !== hostEntryKey(promiseUnknown));
  assert.equal(withoutPromiseUnknown.length, HOST_ALLOWLIST.length - 1, 'the shipped allowlist holds Promise<unknown> once');
  const api = extract({
    declarations: ownProps(`  onRequest?: (text: string) => void | Promise<unknown>;
  onLater?: () => Promise<unknown>;
  onWrapped?: () => (void | (Promise<unknown>)) | string;
  onHandler?: (run: () => Promise<unknown>) => void;
  actions?: { run(): Promise<unknown>; check: () => void | Promise<unknown> };`),
    hostAllowlist: allowlist,
  });
  assert.deepEqual(api.eventDetails.request.type.returns, { kind: 'union', members: [keyword('void'), promiseUnknown] });
  assert.deepEqual(api.eventDetails.later.type.returns, promiseUnknown);
  // Parentheses are dropped; a union nested in a union stays nested, as in the source.
  assert.deepEqual(api.eventDetails.wrapped.type.returns, { kind: 'union', members: [{ kind: 'union', members: [keyword('void'), promiseUnknown] }, keyword('string')] });
  // A function in a parameter restarts the context: its own return may be the promise.
  assert.deepEqual(api.eventDetails.handler.type.parameters[0].type.returns, promiseUnknown);
  assert.deepEqual(api.propDetails.actions.type.members.map(({ type }) => type.returns), [promiseUnknown, { kind: 'union', members: [keyword('void'), promiseUnknown] }]);

  const rejectedHere = [
    // unknown is read nowhere but as that one argument.
    ['as a prop type', '  bad?: Promise<unknown>;', '', /Thing\.bad -> Promise<0>: unknown is not in the grammar/u],
    ['as a parameter type', '  onBad?: (value: Promise<unknown>) => void;', '', /Thing\.onBad\(value\) -> Promise<0>: unknown is not in the grammar/u],
    ['as a parameter, beside a returned one', '  onBad?: (value: Promise<unknown>) => Promise<unknown>;', '', /Thing\.onBad\(value\) -> Promise<0>: unknown is not in the grammar/u],
    ['bare, as a return', '  onBad?: () => unknown;', '', /Thing\.onBad=>: unknown is not in the grammar/u],
    ['bare, in a return union', '  onBad?: () => void | unknown;', '', /Thing\.onBad=>: unknown is not in the grammar/u],
    ['as the argument of another host', '  onBad?: () => Promise<Promise<unknown>>;', '', /Thing\.onBad=> -> Promise<0> -> Promise<0>: unknown is not in the grammar/u],
    ['aliased', '  onBad?: () => Promise<Anything>;', 'export type Anything = unknown;\n', /Thing\.onBad=> -> Promise<0> -> Anything: unknown is not in the grammar/u],
    ['spelled in a union', '  onBad?: () => Promise<unknown | void>;', '', /Thing\.onBad=> -> Promise<0>: unknown is not in the grammar/u],
    ['spelled in a union, bare', '  onBad?: () => Promise<void | unknown>;', '', /Thing\.onBad=> -> Promise<0>: unknown is not in the grammar/u],
    ['as a parenthesized argument', '  onBad?: () => Promise<(unknown)>;', '', /Thing\.onBad=> -> Promise<0>: unknown is not in the grammar/u],
    ['hidden in an alias of the promise', '  onBad?: () => Pending;', 'export type Pending = Promise<unknown>;\n', /Thing\.onBad=> -> Pending -> Promise<0>: unknown is not in the grammar/u],
    ['hidden in an alias of the union', '  onBad?: () => Outcome;', 'export type Outcome = void | Promise<unknown>;\n', /Thing\.onBad=> -> Outcome -> Promise<0>: unknown is not in the grammar/u],
    ['in an array return', '  onBad?: () => Promise<unknown>[];', '', /Thing\.onBad=>\[\] -> Promise<0>: unknown is not in the grammar/u],
    ['in a tuple return', '  onBad?: () => [Promise<unknown>, string];', '', /Thing\.onBad=>\[0\] -> Promise<0>: unknown is not in the grammar/u],
    ['in a tuple rest return', '  onBad?: () => [string, ...Promise<unknown>[]];', '', /Thing\.onBad=>\[\.\.\.\] -> Promise<0>: unknown is not in the grammar/u],
    ['in an object return', '  onBad?: () => { done: Promise<unknown> };', '', /Thing\.onBad=>\.done -> Promise<0>: unknown is not in the grammar/u],
    ['in a record return', '  onBad?: () => { [key: string]: Promise<unknown> };', '', /Thing\.onBad=>\[string\] -> Promise<0>: unknown is not in the grammar/u],
    ['as the property of an object type', '  bad?: { done: Promise<unknown> };', '', /Thing\.bad\.done -> Promise<0>: unknown is not in the grammar/u],
    // The argument is exactly the keyword, and the host exactly Promise.
    ['Promise<any>', '  onBad?: () => Promise<any>;', '', /Thing\.onBad=> -> Promise<0>: any is not in the grammar/u],
    ['PromiseLike<unknown>', '  onBad?: () => PromiseLike<unknown>;', '', /Thing\.onBad=> -> PromiseLike<0>: unknown is not in the grammar/u],
    ['a qualified Promise', '  onBad?: () => globalThis.Promise<unknown>;', '', /Thing\.onBad=> -> globalThis\.Promise<0>: unknown is not in the grammar/u],
    ['Promise with two arguments', '  onBad?: () => Promise<unknown, string>;', '', /Thing\.onBad=> -> Promise<0>: unknown is not in the grammar/u],
    // The symbol is the default library's alone: nothing local, imported, merged, or augmented is it.
    ['a local Promise', '  onBad?: () => Promise<unknown>;', 'export interface Promise<T> { readonly value: T }\n', /Thing\.onBad=> -> Promise: this Promise is not the default library's/u],
    ['an augmented Promise', '  onBad?: () => Promise<unknown>;', 'declare global { interface Promise<T> { extra?: string } }\n', /Thing\.onBad=> -> Promise: this Promise is not the default library's/u],
    ['an augmented Promise whose member is required', '  onBad?: () => Promise<unknown>;', 'declare global { interface Promise<T> { extra: string } }\n', /Thing\.onBad=> -> Promise: this Promise is not the default library's/u],
    ['a Promise augmented from a local declaration file', '  onBad?: () => Promise<unknown>;', "import './augment.js';\n", /Thing\.onBad=> -> Promise: this Promise is not the default library's/u, { files: { 'augment.d.ts': 'export {};\ndeclare global { interface Promise<T> { extra: string } }\n' } }],
    ['a Promise whose var is redeclared from a local declaration file', '  onBad?: () => Promise<unknown>;', "import './augment.js';\n", /Thing\.onBad=> -> Promise: this Promise is not the default library's/u, { files: { 'augment.d.ts': 'export {};\ndeclare global { var Promise: PromiseConstructor }\n' } }],
    ['an imported Promise', '  onBad?: () => Promise<unknown>;', "import type { Promise } from './other.js';\n", /Thing\.onBad=> -> Promise: this Promise is not the default library's/u, { files: { 'other.d.ts': 'export interface Promise<T> { readonly value: T }\n' } }],
    ['a renamed import of a local Promise', '  onBad?: () => Promise<unknown>;', "import type { Later as Promise } from './other.js';\n", /Thing\.onBad=> -> Promise: this Promise is not the default library's/u, { files: { 'other.d.ts': 'export interface Later<T> { readonly value: T }\n' } }],
  ];
  for (const [label, members, extra, pattern, options] of rejectedHere) {
    assert.throws(() => extract({ declarations: ownProps(members, extra), hostAllowlist: allowlist, ...options }), (error) => {
      assert.ok(error instanceof ApiExtractionError, `${label}: ${error.stack}`);
      assert.match(error.message, pattern, label);
      return true;
    }, label);
  }
  // The same fixture reads when the Promise is the library's: the rejections above are about the symbol and the place.
  extract({ declarations: ownProps('  onGood?: () => Promise<unknown>;', 'declare global { interface Other { extra?: string } }\n'), hostAllowlist: allowlist });

  // React's types may augment library types, and the host reader admits that for the types React extends. For Promise<unknown> it would
  // serialize the host and drop a member the augmentation requires, so every declaration of Promise must be the default library's:
  // the @types/react stand-in below augments it and is refused, and the same stand-in without the augmentation reads.
  const reactStandIn = (body) => ({
    'node_modules/@types/react/package.json': JSON.stringify({ name: '@types/react', version: '0.0.0', types: 'index.d.ts' }),
    'node_modules/@types/react/index.d.ts': `export {};\n${body}\n`,
  });
  const standInRun = "import type {} from 'react';\nexport interface ThingOwnProps { onRun?: () => Promise<unknown>; }\nexport interface ThingProps extends ThingOwnProps {}\nexport declare const Thing: (props: ThingProps) => null;\n";
  assert.deepEqual(extract({ declarations: standInRun, outside: reactStandIn('export interface Marker {}'), hostAllowlist: allowlist }).eventDetails.run.type.returns, promiseUnknown);
  for (const [label, body] of [
    ['an interface member', 'declare global { interface Promise<T> { extra: string } }'],
    ['an optional member', 'declare global { interface Promise<T> { extra?: string } }'],
    ['a redeclared var', 'declare global { var Promise: PromiseConstructor }'],
  ]) {
    assert.throws(() => extract({ declarations: standInRun, outside: reactStandIn(body), hostAllowlist: allowlist }), (error) => {
      assert.ok(error instanceof ApiExtractionError, `${label}: ${error.stack}`);
      assert.match(error.message, /Thing\.onRun=> -> Promise: this Promise is not the default library's/u, label);
      return true;
    }, label);
  }

  // The application is an allowlist entry like any other: without it Promise<unknown> is refused, and it admits nothing broader.
  rejects(ownProps('  onLater?: () => Promise<unknown>;'), /Thing\.onLater=> -> Promise: Promise<unknown> is not an application on the host allowlist/u, { hostAllowlist: ['React.ReactNode'] });
  rejects(ownProps('  onLater?: () => Promise<number>;'), /Thing\.onLater=> -> Promise: Promise<number> is not an application on the host allowlist/u, { hostAllowlist: allowlist });
  // Promise<void> is another application, kept as the entry spells it: it never reads as unknown, and unknown never reads as void.
  const promiseVoid = host('Promise', keyword('void'));
  rejects(ownProps('  onLater?: () => Promise<void>;'), /Thing\.onLater=> -> Promise: Promise<void> is not an application on the host allowlist/u, { hostAllowlist: allowlist });
  rejects(ownProps('  onLater?: () => Promise<unknown>;'), /Promise<unknown> is not an application on the host allowlist/u, { hostAllowlist: [...withoutPromiseUnknown, promiseVoid] });
  const both = extract({ declarations: ownProps('  onDone?: () => Promise<void>;\n  onLater?: () => Promise<unknown>;'), hostAllowlist: [...allowlist, promiseVoid] });
  assert.deepEqual(both.eventDetails.done.type.returns, promiseVoid);
  assert.deepEqual(both.eventDetails.later.type.returns, promiseUnknown);
  // A void argument is no unknown for the schema either, and the allowlist keeps unknown to that one entry.
  for (const [entry, pattern] of [
    [host('Set', keyword('unknown')), /has a "unknown" type argument/u],
    [host('Promise', keyword('unknown'), keyword('string')), /has a "unknown" type argument/u],
    [host('Promise', { kind: 'union', members: [keyword('string'), keyword('unknown')] }), /has a "unknown" type argument/u],
    [host('Promise', { kind: 'unknown', extra: 1 }), /holds a unknown type that is not written as exactly kind/u],
  ]) rejects(ownProps('  label?: string;'), pattern, { hostAllowlist: [entry] });
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

// A part typed React.ComponentType<P> (Sidebar.Provider, NavItem and MobileTrigger) is a union of a function and a class component, so it has no
// one call signature. It is read as P only when its type is React's own ComponentType alias; the by-shape guard stays, fail-closed, for the arms.
const componentDeclarations = (type, extra = '') => `${header}${extra}
export interface ThingOwnProps { collapsed?: boolean; }
export interface ThingProviderProps extends ThingOwnProps {}
export declare const Thing: { Provider: ${type}; Other: React.ForwardRefExoticComponent<ThingProviderProps & React.RefAttributes<HTMLDivElement>>; };
`;

test('a part typed React.ComponentType<P> reads as P, and no other union of a function and a class component does', () => {
  const read = (type, extra) => extract({ declarations: componentDeclarations(type, extra), part: 'Provider' });
  // React's alias, and every other form the extraction already read, give the same props.
  for (const type of ['React.ComponentType<ThingProviderProps>', 'React.FunctionComponent<ThingProviderProps>', '(props: ThingProviderProps) => React.ReactNode', 'React.ForwardRefExoticComponent<ThingProviderProps>', 'React.ExoticComponent<ThingProviderProps>']) {
    const api = read(type);
    assert.deepEqual([api.props, api.propDetails.collapsed.type], [['collapsed'], { kind: 'boolean' }], type);
  }
  // A union the alias does not name, or one with another shape, is a component the reader cannot tell from a stranger.
  const refused = /Thing: the exported Thing\.Provider must be a component with one call signature that takes props, or React's ComponentType<P>/u;
  for (const [rule, type, extra] of [
    ['a class component alone', 'React.ComponentClass<ThingProviderProps>'],
    ['the two arms written by hand', 'React.FunctionComponent<ThingProviderProps> | React.ComponentClass<ThingProviderProps>'],
    ['arms of other props', 'React.ComponentType<ThingProviderProps> | React.ComponentType<{ other: true }>'],
    ['arms of other props, one each', 'React.FunctionComponent<ThingProviderProps> | React.ComponentClass<{ other: true }>'],
    ['an intersection', 'React.ComponentType<ThingProviderProps> & { extra: number }'],
    ['an empty object intersected', 'React.ComponentType<ThingProviderProps> & {}'],
    ['a nullable type', 'React.ComponentType<ThingProviderProps> | null'],
    ['an undefined arm', 'React.ComponentType<ThingProviderProps> | undefined'],
    ['a local alias of the same name', 'ComponentType<ThingProviderProps>', 'export type ComponentType<P> = React.ComponentClass<P> | React.FunctionComponent<P>;\n'],
    ['a local alias of the real one', 'LocalComponent<ThingProviderProps>', 'export type LocalComponent<P> = React.ComponentType<P>;\n'],
  ]) {
    assert.throws(() => read(type, extra), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, refused, rule);
      return true;
    }, rule);
  }
  // Without the props it takes, or typed any, it reaches the check that the props carry the owned members.
  rejects(componentDeclarations('React.ComponentType'), /Thing\.collapsed: the exported Thing's props do not include collapsed/u, { part: 'Provider' });
  rejects(componentDeclarations('React.ComponentType<any>'), /Thing\.collapsed: the exported Thing's props do not include collapsed/u, { part: 'Provider' });
  // The props are the argument's, so a type that lost an owned member fails the same way.
  rejects(componentDeclarations('React.ComponentType<{ other?: boolean }>'), /Thing\.collapsed: the exported Thing's props do not include collapsed/u, { part: 'Provider' });
  rejects(componentDeclarations('React.ComponentType<{ collapsed: boolean }>'), /Thing\.collapsed: the exported Thing's props redeclare collapsed as required boolean; ThingOwnProps declares optional boolean \| undefined/u, { part: 'Provider' });
});

// A stand-in React: a type declared in a node_modules/@types/react directory is React's, so the arms of its ComponentType can be varied one rule at a time.
const standInComponent = ({
  alias = 'export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>;',
  functionComponent = 'export interface FunctionComponent<P = {}> { (props: P): ReactNode | Promise<ReactNode>; displayName?: string; }',
  componentClass = 'export interface ComponentClass<P = {}> { new (props: P, context?: any): Component<P>; displayName?: string; }',
  node = 'export type ReactNode = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNode>;',
  extra = '',
  // The arms are declared in another package, which React's alias then imports.
  elsewhere = false,
} = {}) => ({
  'node_modules/@types/react/package.json': JSON.stringify({ name: '@types/react', version: '0.0.0', types: 'index.d.ts' }),
  'node_modules/@types/react/index.d.ts': `${elsewhere ? "import type { FunctionComponent, ComponentClass } from 'elsewhere';\nimport type { ReactNode } from 'elsewhere';" : `${functionComponent}\n${componentClass}`}
export interface ReactElement { readonly type: unknown }
${elsewhere ? '' : node}
export declare class Component<P = {}> { readonly props: P; }
${alias}
${extra}
`,
  ...(elsewhere ? {
    'node_modules/elsewhere/package.json': JSON.stringify({ name: 'elsewhere', version: '0.0.0', types: 'index.d.ts' }),
    'node_modules/elsewhere/index.d.ts': `export type ReactNode = string | number | boolean | null | undefined;
export declare class Component<P = {}> { readonly props: P; }
${functionComponent}
${componentClass}
`,
  } : {}),
});
const standInProvider = (type = 'ComponentType<ThingProviderProps>') => `import type { ComponentType, FunctionComponent, ComponentClass, Strange, Fine } from 'react';
export interface ThingOwnProps { collapsed?: boolean; }
export interface ThingProviderProps extends ThingOwnProps {}
export declare const Thing: { Provider: ${type}; };
`;

test('the arms of React\'s ComponentType are guarded: one signature each of a call and a construct, props first and nothing else required, and what React renders', () => {
  const read = (variant, type) => extract({ declarations: standInProvider(type), outside: standInComponent(variant), part: 'Provider' });
  // The faithful shape reads, with the optional context parameter and the statics the real components have.
  assert.deepEqual(read().props, ['collapsed']);
  assert.deepEqual(read({ functionComponent: 'export interface FunctionComponent<P = {}> { (props: P, legacyContext?: any): ReactNode; displayName?: string; defaultProps?: Partial<P> }' }).props, ['collapsed']);
  const refused = /Thing: the exported Thing\.Provider must be a component with one call signature that takes props, or React's ComponentType<P>/u;
  for (const [rule, variant] of [
    ['a call with another required argument', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P, required: number): ReactNode; }' }],
    ['a construct with another required argument', { componentClass: 'export interface ComponentClass<P = {}> { new (props: P, required: number): Component<P>; }' }],
    ['a call that returns a Date', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P): Date; }' }],
    ['a construct of a Date', { componentClass: 'export interface ComponentClass<P = {}> { new (props: P): Date; }' }],
    ['a generic call', { functionComponent: 'export interface FunctionComponent<P = {}> { <Q>(props: P): ReactNode; }' }],
    ['a generic construct', { componentClass: 'export interface ComponentClass<P = {}> { new <Q>(props: P): Component<P>; }' }],
    ['a rest parameter', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P, ...rest: unknown[]): ReactNode; }' }],
    ['two calls', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P): ReactNode; (props: P, other: string): ReactNode; }' }],
    ['a call that takes no props', { functionComponent: 'export interface FunctionComponent<P = {}> { (): ReactNode; }' }],
    ['a call of other props', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: { other: true }): ReactNode; }' }],
    ['arms written inline', { alias: 'export type ComponentType<P = {}> = ((props: P) => ReactNode) | (new (props: P) => Component<P>);' }],
    ['one arm alone', { alias: 'export type ComponentType<P = {}> = ComponentClass<P>;' }],
    ['a third arm that is not a React type', { alias: 'export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P> | null;' }],
    ['a third arm that is a React type', { alias: 'export type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P> | ExoticComponent<P>;', extra: 'export interface ExoticComponent<P = {}> { (props: P): ReactNode; readonly $$typeof: symbol }' }],
    ['an arm that does not take the alias\'s parameter', { alias: 'export type ComponentType<P = {}> = ComponentClass<{}> | FunctionComponent<P>;' }],
    ['an alias that takes two parameters', { alias: 'export type ComponentType<P = {}, Q = {}> = ComponentClass<P> | FunctionComponent<P>;' }],
    // Each of these is the faithful alias and arms but for the one thing named.
    ['an arm the alias gives another argument than its parameter', { alias: 'export type ComponentType<P = {}> = ComponentClass<P & {}> | FunctionComponent<P>;' }],
    ['arms React imports from another package', { elsewhere: true }],
    ['no ReactNode to compare a result with', { node: '' }],
    ['a call with a this parameter', { functionComponent: 'export interface FunctionComponent<P = {}> { (this: Date, props: P): ReactNode; }' }],
    ['a function component that can also be constructed', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P): ReactNode; new (props: P): Component<P>; }' }],
    ['one arm that is both, and the other neither', { functionComponent: 'export interface FunctionComponent<P = {}> { (props: P): ReactNode; new (props: P): Component<P>; }', componentClass: 'export interface ComponentClass<P = {}> { displayName?: string; }' }],
  ]) {
    assert.throws(() => read(variant), (error) => {
      assert.ok(error instanceof ApiExtractionError, error.stack);
      assert.match(error.message, refused, rule);
      return true;
    }, rule);
  }
  // What a package merges into React's Component or into either arm makes the type no longer React's alone.
  for (const merged of ['interface Component<P> { merged: P }', 'interface FunctionComponent<P> { merged: P }', 'interface ComponentClass<P> { merged: P }']) {
    assert.throws(() => extract({ declarations: `declare module 'react' { ${merged} }\n${standInProvider()}`, outside: standInComponent(), part: 'Provider' }), refused, merged);
  }
  // A union of this shape under another name is not React's alias, even where React declares it.
  const strange = { extra: 'export type Strange<P> = ((props: P, required: number) => string) | (new (props: P, required: number) => Date);\nexport type Fine<P> = ComponentClass<P> | FunctionComponent<P>;' };
  for (const name of ['Strange', 'Fine']) {
    assert.throws(() => read(strange, `${name}<ThingProviderProps>`), refused, name);
  }
  // The alias is React's only where React declares it: the same declarations in the package are not.
  assert.throws(() => extract({
    declarations: standInProvider().replace("import type { ComponentType, FunctionComponent, ComponentClass, Strange, Fine } from 'react';", "import type { FunctionComponent, ComponentClass, ReactNode } from 'react';\nexport type ComponentType<P = {}> = ComponentClass<P> | FunctionComponent<P>;"),
    outside: standInComponent(),
    part: 'Provider',
  }), refused);
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
    ['a return of something other than a const', wrapped(`${component}\n  return { Root: component };`), /Thing: the wrapper does not end by returning one of its consts; /u],
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

// A compound a wrapper builds: the three field modules return `Object.freeze({ Root, ... })` of their own consts from a
// private factory. The rule is a restricted shape, not a proof of purity: an extra evaluated argument to forwardRef or
// memo is never read, so the author's PURE annotation, not the extractor, asserts the factory is safe to drop.
test('an exported wrapper may return a frozen compound of its own consts', () => {
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
  const imports = "import { forwardRef } from 'react';\n";
  const consts = (size = 'sm') => `const Root = forwardRef(function Root({ size = '${size}', ...props }: Record<string, unknown>) { return [size, props]; });\n  const Image = forwardRef(function Image({ alt }: { alt: string }) { return alt; });\n  `;
  const standard = `${consts()}return Object.freeze({ Root, Image });`;
  const read = (text, part = 'Root') => extract({ declarations, source: text, part });
  const arrow = (body, { before = '', after = '', call = '(() => {\n  %BODY%\n})()' } = {}) => `${imports}${before}export const Thing = /*#__PURE__*/ ${call.replace('%BODY%', body)};\n${after}`;
  const factory = (body, { before = '', after = '', declare = 'function makeThing()', call = 'makeThing()' } = {}) => `${imports}${before}${declare} {\n  ${body}\n}\nexport const Thing = /*#__PURE__*/ ${call};\n${after}`;

  // The three shapes: an arrow or function-expression IIFE, and a private top-level factory declaration.
  assert.deepEqual(read(arrow(standard)).defaults, { size: 'sm' });
  assert.deepEqual(read(arrow(standard, { call: '(function () {\n  %BODY%\n})()' })).defaults, { size: 'sm' });
  assert.deepEqual(read(factory(standard)).defaults, { size: 'sm' });
  // A property or member that only shares the factory's name is no reference to it.
  assert.deepEqual(read(factory(standard, { after: 'export const table = { makeThing: 1 };\nexport const read = table.makeThing;\n' })).defaults, { size: 'sm' });
  // The PURE annotation is optional to the reader, and string keys, shorthand and displayName statements are plain.
  assert.deepEqual(read(arrow(standard).replace('/*#__PURE__*/ ', '')).defaults, { size: 'sm' });
  assert.deepEqual(read(factory(`${consts()}Root.displayName = 'Thing.Root';\n  return Object.freeze({ 'Root': Root, Image: Image });`)).defaults, { size: 'sm' });
  // The key names the part, not the const: Root here is the second const.
  assert.deepEqual(read(arrow(`const Wide = forwardRef(function Wide({ size = 'md' }: Record<string, unknown>) { return size; });\n  ${consts()}return Object.freeze({ Root: Wide, Image });`)).defaults, { size: 'md' });
  assert.throws(() => read(arrow(standard), 'Body'), /Thing\.Body: the exported Thing has no Body part/u);

  const wrapperRule = / an exported component's wrapper is called with no arguments/u;
  const rejections = [
    // What the frozen object may hold.
    ['a spread', arrow(`${consts()}const rest = { Root };\n  return Object.freeze({ ...rest, Image });`), /Thing\.Root: the frozen compound holds only Name: const parts; a spread, method, accessor, or computed key could replace a part; /u],
    ['a computed key', arrow(`${consts()}const key = 'Root';\n  return Object.freeze({ [key]: Root, Image });`), /Thing\.Root: the frozen compound holds only Name: const parts; /u],
    ['a method', arrow(`${consts()}return Object.freeze({ Root, Image() { return Root; } });`), /Thing\.Root: the frozen compound holds only Name: const parts; /u],
    ['an accessor', arrow(`${consts()}return Object.freeze({ get Root() { return Image; }, Image });`), /Thing\.Root: the frozen compound holds only Name: const parts; /u],
    ['a part named twice', arrow(`${consts()}return Object.freeze({ Root, Root: Image });`), /Thing\.Root: the frozen compound assigns Root twice; /u],
    ['a part not in PascalCase', arrow(`${consts()}return Object.freeze({ root: Root, Image });`), /Thing\.Root: the frozen compound names root, which is not a part named in PascalCase; /u],
    ['an inline part', arrow(`${consts()}return Object.freeze({ Root: forwardRef(function Inline() { return null; }), Image });`), /Thing\.Root: the frozen compound's Root is not one of the wrapper's consts; /u],
    ['an outer binding', arrow(`${consts()}return Object.freeze({ Root: Outer, Image });`, { before: 'declare const Outer: unknown;\n' }), /Thing\.Root: the frozen compound's Root is Outer, which is not one of the wrapper's consts; /u],
    // What is returned.
    ['an Object.assign return', arrow(`${consts()}return Object.assign({}, { Root, Image });`), /Thing\.Root: the wrapper does not end by returning one of its consts; /u],
    ['a frozen call', arrow(`${consts()}return Object.freeze(Root());`), /Thing\.Root: the wrapper freezes something other than an object literal of its consts; /u],
    ['a frozen array', arrow(`${consts()}return Object.freeze([Root, Image]);`), /Thing\.Root: the wrapper freezes something other than an object literal of its consts; /u],
    ['an expression body, which T10a and T10b replace with an annotated Object.freeze', arrow('', { call: '(() => Object.freeze({}))()' }), /Thing\.Root: the wrapper has an expression body; /u],
    // What else the wrapper runs, and what the source does to the compound afterwards.
    ['a part assigned beside the freeze', arrow(`${consts()}Root.Image = Image;\n  return Object.freeze({ Root, Image });`), /Thing\.Root: the wrapper assigns Root\.Image, but a frozen compound's parts are named in its Object\.freeze; /u],
    ['a call on a part', arrow(`${consts()}Root.register();\n  return Object.freeze({ Root, Image });`), /Thing\.Root: the wrapper runs a statement that is not a displayName or part assignment to one of its consts; /u],
    ['a write to the compound', arrow(standard, { after: '(Thing as { Root: unknown }).Root = null;\n' }), /Thing\.Root: the source writes to Thing beyond the wrapper's displayName and part assignments; /u],
    ['an alias of a part', arrow(`${consts()}const alias = Root;\n  return Object.freeze({ Root: alias, Image });`), /Thing\.Root: alias is not a forwardRef or memo call; /u],
    ['a part used as a value', arrow(standard, { after: 'export const leaked = Thing.Root;\n' }), /Thing\.Root: the source uses Thing as a value, which could hand an alias of the component to code that replaces a part; /u],
    // A factory is private and called once, with no arguments or parameters.
    ['a factory called twice', factory(standard, { after: 'export const Other = makeThing();\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; a type-only reference such as typeof makeThing counts; /u],
    ['a factory called with an argument', factory(standard, { call: 'makeThing(1)' }), /Thing\.Root: the factory makeThing is called with arguments; /u],
    ['a factory with a parameter', factory(standard, { declare: 'function makeThing(flag?: boolean)' }), /Thing\.Root: the factory makeThing takes parameters; /u],
    ['an exported factory declaration', factory(standard, { declare: 'export function makeThing()' }), /Thing\.Root: the factory makeThing is exported, so another module could call it again; /u],
    ['a factory re-exported in a clause', factory(standard, { after: 'export { makeThing };\n' }), /Thing\.Root: the factory makeThing is exported, so another module could call it again; /u],
    ['a factory re-exported under another name', factory(standard, { after: 'export { makeThing as make };\n' }), /Thing\.Root: the factory makeThing is exported, so another module could call it again; /u],
    ['a default export of the factory', factory(standard, { after: 'export default makeThing;\n' }), /Thing\.Root: the factory makeThing is exported, so another module could call it again; /u],
    // A shorthand property reads the factory, though the checker resolves its name to the property it declares.
    ['a factory read through a shorthand property', factory(standard, { after: 'const leaked = { makeThing };\nexport const Other = leaked.makeThing();\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a factory read through an exported shorthand property', factory(standard, { after: 'export const leaked = { makeThing };\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a factory read through a shorthand property of a default export', factory(standard, { after: 'export default { makeThing };\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a factory read through a spread shorthand property', factory(standard, { after: 'export const leaked = { ...{ makeThing } };\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a factory written through a destructuring assignment', factory(standard, { after: 'declare const source: Record<string, never>;\n({ makeThing } = source);\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a factory held in an array', factory(standard, { after: 'export const leaked = [...[makeThing]];\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; /u],
    ['a type-only reference, refused though it adds no runtime call', factory(standard, { after: 'export type Factory = typeof makeThing;\n' }), /Thing\.Root: the factory makeThing is referenced more than once, so it could build a second compound; a type-only reference such as typeof makeThing counts; /u],
  ];
  for (const [label, text, pattern] of rejections) {
    assert.throws(() => read(text), (error) => error instanceof ApiExtractionError && pattern.test(error.message) && wrapperRule.test(error.message), label);
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

// Select's root is its callable, and Select.Root is another member of the export that takes the same props: its `label`
// is any node, so that `children` can name the field, while the callable's label is a node that renders something.
const alsoName = "{ label: Exclude<React.ReactNode, null | undefined | boolean>; 'aria-label'?: never } | { label?: never; 'aria-label': string }";
const alsoChildrenArm = "{ children: React.ReactNode; label?: React.ReactNode; 'aria-label'?: string }";
const alsoDeclarations = (rootProps = `Omit<ThingOwnProps, 'label'> & (${alsoName} | ${alsoChildrenArm})`) => `${header}export type ThingOwnProps = {
  label?: Exclude<React.ReactNode, null | undefined | boolean>;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
};
export type ThingProps = Omit<ThingOwnProps, 'label'> & (${alsoName});
export type ThingRootProps = ${rootProps};
export declare const Thing: React.ForwardRefExoticComponent<ThingProps & React.RefAttributes<HTMLDivElement>> & {
  Root: React.ForwardRefExoticComponent<ThingRootProps & React.RefAttributes<HTMLDivElement>>;
};
`;

test('also checks the root\'s props against another member of the export, and only widen lets a prop differ there', () => {
  const widen = [{ member: 'Root', widen: ['label'] }];
  const fails = (declarations, pattern, label, options = { also: widen }) => assert.throws(() => extract({ declarations, ...options }),
    (error) => error instanceof ApiExtractionError && pattern.test(error.message), label);
  // Select.Root takes the same members; `label` is a supertype there. The check adds no data to the block.
  const api = extract({ declarations: alsoDeclarations(), also: widen });
  assert.deepEqual(api, extract({ declarations: alsoDeclarations() }), 'the check adds no data');
  assert.deepEqual(api.props, ['label', 'size', 'children']);
  // Without widen, the Root's wider label is a redeclaration, so widen is what admits it.
  fails(alsoDeclarations(), /Thing\.label: the exported Thing\.Root's props redeclare label as optional .*; ThingOwnProps declares optional /u, 'label is not listed to widen', { also: [{ member: 'Root' }] });
  // A Root that differs in any other way is deliberately incompatible and fails directly.
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label' | 'size'> & (${alsoName} | ${alsoChildrenArm})`), /Thing\.size: the exported Thing\.Root's props do not include size/u, 'a Root without a member');
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label' | 'size'> & { size?: 'sm' } & (${alsoName} | ${alsoChildrenArm})`), /Thing\.size: the exported Thing\.Root's props redeclare size as optional "sm" \| undefined; ThingOwnProps declares optional "md" \| "sm" \| undefined/u, 'a Root that redeclares a member');
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label' | 'size'> & { size: 'sm' | 'md' } & (${alsoName} | ${alsoChildrenArm})`), /Thing\.size: the exported Thing\.Root's props redeclare size as required /u, 'a Root that makes a member required');
  // The widened member keeps its presence and optionality.
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label'> & { label: React.ReactNode; children?: React.ReactNode }`), /Thing\.label: the exported Thing\.Root's props change the optionality of label as required /u, 'a Root whose label is required');
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label'> & (${alsoName} | { children: React.ReactNode; 'aria-label'?: string })`), /Thing\.label: the exported Thing\.Root's props do not include label/u, 'a Root arm without label');
  // Widening is checked on the arms: the children arm cannot narrow label, though the union of the arms still takes everything.
  const narrowed = alsoDeclarations(`Omit<ThingOwnProps, 'label'> & (${alsoName} | { children: React.ReactNode; label?: string; 'aria-label'?: string })`);
  fails(narrowed, /Thing\.label: no arm of the exported Thing\.Root's props takes label as ThingOwnProps declares it, optional .*; label may widen there, never narrow/u, 'a children arm that narrows label');
  fails(alsoDeclarations(`Omit<ThingOwnProps, 'label'> & (${alsoName} | { children: React.ReactNode; label?: React.ReactElement; 'aria-label'?: string })`), /no arm of the exported Thing\.Root's props takes label/u, 'a children arm whose label is another type');
  // widen is a stated difference, not a switch: it must name a declared prop, and a prop that does not differ must not be listed.
  fails(alsoDeclarations(), /Thing\.Root: widen names nope, which ThingOwnProps does not declare/u, 'a widen that names no prop', { also: [{ member: 'Root', widen: ['nope'] }] });
  fails(alsoDeclarations(), /Thing\.size: size is listed to widen on Thing\.Root, whose props declare it as optional .*, the type ThingOwnProps declares; remove it from widen/u, 'a widen that is not needed', { also: [{ member: 'Root', widen: ['label', 'size'] }] });
  fails(alsoDeclarations('ThingProps'), /Thing\.label: no arm of the exported Thing\.Root's props takes label as ThingOwnProps declares it, optional .*\(if Thing\.Root declares it as ThingOwnProps does, remove it from widen\)/u, 'a Root that does not widen');
  // The mapping is checked as well: a member the export lacks, the root part itself, a repeat, and a name that is not a member.
  fails(alsoDeclarations(), /Thing\.Rot: the exported Thing has no Rot part/u, 'a missing member', { also: [{ member: 'Rot' }] });
  fails(alsoDeclarations(), /Thing\.Root: Root is named twice in also/u, 'a member named twice', { also: [{ member: 'Root' }, { member: 'Root' }] });
  fails(alsoDeclarations(), /Thing\.Root: Root is the root part, whose props are read in also/u, 'the root part', { also: [{ member: 'Root' }], part: 'Root' });
  fails(alsoDeclarations(), /Thing: also names an export member, such as Root; not root/u, 'a name that is not a member', { also: [{ member: 'root' }] });
  fails(alsoDeclarations(), /Thing\.Root: widen lists each prop once, by name/u, 'a widen listing a prop twice', { also: [{ member: 'Root', widen: ['label', 'label'] }] });
  // A defaults read still reads the root's source alone.
  const source = "import { forwardRef } from 'react';\nexport const Thing = forwardRef(function Thing({ label, size = 'md', children }: Record<string, unknown>) { return [label, size, children]; });\n";
  assert.deepEqual(extract({ declarations: alsoDeclarations(), source, also: widen }).defaults, { size: 'md' });
});

test('also reaches the extraction through deriveApis, and the packed declarations through the same mapping', async () => {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'derived-also-'));
  try {
    const declarationRoot = join(root, 'ts');
    const repositoryRoot = join(root, 'repository');
    mkdirSync(declarationRoot);
    mkdirSync(join(repositoryRoot, 'packages/react/src'), { recursive: true });
    writeFileSync(join(repositoryRoot, 'packages/react/src/thing.ts'), "import { forwardRef } from 'react';\nexport const Thing = forwardRef(function Thing({ label, size = 'md', children }: Record<string, unknown>) { return [label, size, children]; });\n");
    const derive = (rootProps, widen = ['label']) => {
      writeFileSync(join(declarationRoot, 'thing.d.ts'), alsoDeclarations(rootProps));
      return deriveApis({ packageRoot: join(root, 'package'), repositoryRoot, declarationRoot, components: [{ slug: 'thing', name: 'Thing', source: 'packages/react/src/thing.ts', also: [{ member: 'Root', widen }] }] });
    };
    assert.deepEqual((await derive()).get('thing').api.defaults, { size: 'md' });
    // An incompatible Select.Root fails the derivation: `also` is not silently dropped on the way to the extractor.
    await assert.rejects(derive(`Omit<ThingOwnProps, 'label' | 'size'> & (${alsoName} | ${alsoChildrenArm})`), /Thing\.size: the exported Thing\.Root's props do not include size/u);
    await assert.rejects(derive(undefined, []), /Thing\.label: the exported Thing\.Root's props redeclare label/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  // Every field an entry sets reaches the extractor, whichever caller maps it (the committed outputs and the packed declarations).
  const entry = { slug: 'thing', name: 'Thing', part: 'Root', callable: 'list', also: [{ member: 'Root', widen: ['label'] }], parts: { item: 'Item' }, source: 'packages/react/src/thing.ts' };
  assert.deepEqual(extractionComponent(entry, { declarations: 'd.ts' }), { name: 'Thing', part: 'Root', callable: 'list', also: entry.also, parts: entry.parts, declarations: 'd.ts' });
  assert.deepEqual(DERIVED_API_COMPONENTS.map(({ slug, name, source: _source, ...rest }) => Object.keys(rest).filter((key) => !['part', 'callable', 'also', 'parts'].includes(key))), DERIVED_API_COMPONENTS.map(() => []), 'an entry sets no field the extractor is not given');
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

// Select finds the label a child names it by with `child.type === Select.Label`. A strict comparison yields a boolean and hands the
// part to nothing, so it is a value the rule admits; a loose one can coerce its operand, and every other place a part goes stays refused.
test('a part is also a value as an operand of === or !==, and no other use is admitted with it', () => {
  const item = `Thing.Root = Thing;\n  Thing.Item = forwardRef(${callableItem});`;
  const list = `${item}\n  Thing.List = Thing;`;
  const prelude = [
    "import * as React from 'react';",
    'declare const type: unknown;',
    'declare function use(...values: unknown[]): void;',
    'function rewrite(value: unknown) { (value as { render: unknown }).render = replacement; }',
    '',
  ].join('\n');
  const read = (after, { statics = list } = {}) => extract({ declarations: callableDeclarations, source: callableSource({ before: prelude, statics, after }), parts: { item: 'Item' } });
  const value = /Thing: the source uses Thing as a value, which could hand an alias of the component to code that replaces a part; /u;
  const compared = [
    ['a part against ===', 'export const isItem = type === Thing.Item;'],
    ['a part against !==', 'export const notItem = type !== Thing.Item;'],
    ['a part on the left', 'export const leftItem = Thing.Item === type;'],
    ['a part through parentheses and an assertion', 'export const wrapped = ((Thing.Item as unknown)) === type;'],
    ['the component itself', 'export const isThing = type === Thing;'],
    ['a part of the alias', 'export const isListItem = type === Thing.List.Item;'],
    ['the alias', 'export const isList = type === Thing.List;'],
    ['two parts', 'export const same = Thing.Item === Thing.List;'],
    ['a comparison that selects between literals', "export const which = type === Thing.Item ? 'item' : 'other';"],
    ['a comparison passed on', 'use(type === Thing.Item);'],
    ['a comparison in a function outside the wrapper', 'export function matches(child: { type: unknown }): boolean { return child.type === Thing.Item || child.type === Thing.List; }'],
    ['a recursive search, as Select\'s', 'export function find(children: unknown[]): boolean { return children.some((child) => React.isValidElement(child) && (child.type === Thing.Item ? true : find([]))); }'],
  ];
  for (const [label, after] of compared) assert.deepEqual(read(`${after}\n`).partApis.item.defaults, { tone: 'quiet' }, label);
  // Everything else still fails: the part handed to a call, kept, or returned by an expression that is not a strict comparison.
  const refused = [
    ['the part passed to a function', 'rewrite(Thing.Item);'],
    ['the alias passed to a function', 'rewrite(Thing.List);'],
    ['the component passed to a function', 'rewrite(Thing);'],
    ['a loose ==', 'export const loose = type == Thing.Item;'],
    ['a loose !=', 'export const looseNot = type != Thing.Item;'],
    ['the part after a strict comparison in a conditional', 'rewrite(type === Thing.Item ? Thing.Item : null);'],
    ['the part beside a comparison in an array', 'rewrite([type === Thing.Item, Thing.Item]);'],
    ['the part returned by ||', 'rewrite(type || Thing.Item);'],
    ['the part returned by &&', 'rewrite(type && Thing.Item);'],
    ['the part returned by ??', 'rewrite(type ?? Thing.Item);'],
    ['the part returned by a comparison that continues with ||', 'rewrite(type === Thing.Item || Thing.Item);'],
    ['the part concatenated', "use(Thing.Item + '');"],
    ['the part as a switch case', 'switch (type) { case Thing.Item: use(1); }'],
    ['the part as a comparison with instanceof', 'use(type instanceof (Thing.Item as never));'],
    ['the part of a relational comparison', 'use(type < (Thing.Item as never));'],
    ['the part held after a comparison', 'const held = Thing.Item;\nuse(type === held);'],
  ];
  assert.deepEqual(accepted(refused.map(([label, after]) => [label, () => read(`${after}\n`), value])), []);
  // A write is still a write: comparing a part does not make assigning one harmless.
  assert.throws(() => read('use(type === Thing.Item);\nThing.Item = replacement as never;\n'), /Thing: the source writes to Thing beyond the wrapper's displayName and part assignments; /u);
  // A frozen compound is held to the same rule.
  const compound = (statement) => `import { forwardRef } from 'react';\ndeclare const type: unknown;\ndeclare function use(...values: unknown[]): void;\nconst ThingRoot = forwardRef(${callableRender});\nexport const Thing = Object.freeze({ Root: ThingRoot });\n${statement}\n`;
  const frozen = /Thing\.Root: the source uses the compound Thing as a value, which could hand an alias of it to code that replaces a part/u;
  for (const statement of ['export const isRoot = type === Thing.Root;', 'export const notThing = type !== Thing;']) {
    assert.equal(extract({ declarations: compoundDeclarations, part: 'Root', source: compound(statement) }).defaults.size, 'md', statement);
  }
  for (const statement of ['export const loose = type == Thing.Root;', 'use(Thing.Root);', 'use(type || Thing.Root);']) {
    assert.throws(() => extract({ declarations: compoundDeclarations, part: 'Root', source: compound(statement) }), frozen, statement);
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
