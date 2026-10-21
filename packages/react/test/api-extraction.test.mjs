import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { deriveApis, syncDerivedApis, withDerivedApi } from '../api-extraction/derived-apis.mjs';
import { ApiExtractionError, HOST_ALLOWLIST, extractApis } from '../api-extraction/extract.mjs';

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

function extract({ declarations, source, hostAllowlist, files = {} }) {
  mkdirSync(resolve(packageRoot, 'build'), { recursive: true });
  const root = mkdtempSync(join(packageRoot, 'build', 'api-extraction-'));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    writeFileSync(join(root, 'thing.d.ts'), declarations);
    if (source !== undefined) writeFileSync(join(root, 'thing.ts'), source);
    const component = { name: 'Thing', declarations: join(root, 'thing.d.ts'), ...(source === undefined ? {} : { source: join(root, 'thing.ts') }) };
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
    ['  bad?: Array<string>;', '', /Thing\.bad -> Array: generic type arguments are not in the grammar/u],
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
    ['  bad?: React.ReactElement;', '', /Thing\.bad -> React\.ReactElement: React\.ReactElement is outside @muxui\/react and not in the host allowlist/u],
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
  // An allowlisted host type with type arguments is still generic.
  rejects(ownProps('  anchor?: React.RefObject<HTMLElement>;'), /Thing\.anchor -> React\.RefObject: generic type arguments/u, { hostAllowlist: ['React.RefObject', 'HTMLElement'] });
  assert.deepEqual(HOST_ALLOWLIST, ['HTMLButtonElement'], 'the shipped allowlist holds only what moved components reach');
});

test('defaults come from the executable source: literals and top-level constants the component reads', () => {
  const declarations = ownProps(`  variant?: 'primary' | 'neutral';
  size?: 'sm' | 'md';
  count?: number;
  tags?: readonly string[];
  pending?: boolean;
  onActivate?: () => void;`);
  const source = (variantDefault = "'primary'", before = '') => `${before}const DEFAULT_SIZE = 'md' as const;
const THING_DEFAULTS = Object.freeze({ count: -2, tags: Object.freeze(['a', 'b']) });
function forwardRef(render: unknown) { return render; }
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
