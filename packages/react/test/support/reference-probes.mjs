// Compiler probes of the committed declaration reference (Decision 0031).
//
// The reference says things about the shipped declarations: which members each alternative of a props type
// declares, whether each is optional, declared `never`, or not declared at all, the finite values of a literal
// union, the ref a part forwards, the native attribute envelope it extends, and a generic part's arity. A probe
// does not trust the reader to have read those correctly: it states each claim as a type-level assertion that
// the compiler evaluates over the declarations a consumer installs, with `tsc` (TypeScript 7 and 6, with
// exactOptionalPropertyTypes off and on). The claims come from the model under test and the verdict from the
// compiler, so a model that wrongly drops an arm, an optional value, a ref or a `never` fails here.
//
// A second kind of probe is authored by hand and never reads the model: a JSX element and whether the
// compiler accepts it, for the components whose constraints are hardest (Dialog, IconButton, Resizable, Text,
// Virtualizer, CodeBlock, and generic items). They are the facts the model has to agree with.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withStagedPackage } from '../../reference-reader/stage.mjs';
import { tscDiagnostics } from './declaration-surface.mjs';
import { armsOf } from './reference-catalog.mjs';

const HEADER = [
  "import type * as React from 'react';",
  'type Mut<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;',
  'type Assert<T extends true> = T;',
  'type Guard<P> = 0 extends 1 & P ? false : ([P] extends [never] ? false : true);',
  // How an arm declares a name: optional or required, and `never` or live; a name it does not declare is absent.
  "type Sig<A, K extends PropertyKey> = K extends keyof A ? `${{} extends Pick<A, K> ? 'optional' : 'required'}/${[Exclude<A[K], undefined>] extends [never] ? 'never' : 'live'}` : 'absent';",
  "type RefOf<A> = 'ref' extends keyof A ? [Exclude<A['ref'], undefined>] : 'none';",
  'type ValuesOf<A, K extends PropertyKey> = K extends keyof A ? Exclude<A[K], undefined> : never;',
  // The part of an arm a claim speaks about: "m:name" its declaration, "v:name" its finite values, "ref" its ref.
  "type ShapeOf<A, Ks extends string> = { [K in Ks]: K extends `m:${infer N}` ? Sig<A, N> : K extends `v:${infer N}` ? ValuesOf<A, N> : K extends 'ref' ? RefOf<A> : never };",
  'type Fits<A, E> = Mut<ShapeOf<A, keyof E & string>, E>;',
  // The keys of each arm, not only the keys every arm shares.
  'type ArmKeys<P> = P extends unknown ? keyof P : never;',
  'type MissingFrom<P, Ks> = P extends unknown ? Exclude<Ks, keyof P> : never;',
  // Every arm the compiler has is one the model lists, and every arm the model lists is one the compiler has.
  'type EveryArmListed<P, Es> = P extends unknown ? (true extends (Es extends unknown ? Fits<P, Es> : never) ? true : false) : never;',
  'type EveryListedArmExists<P, Es> = Es extends unknown ? (true extends (P extends unknown ? Fits<P, Es> : never) ? true : false) : never;',
];

/** The hand-authored witnesses: `[code, loose, exact]`, where loose and exact are the verdict with exactOptionalPropertyTypes off and on. */
export const WITNESSES = [
  // Dialog: a title permits both accessible names; without one they are exclusive and one is required.
  ['<Dialog title="t" />', 'ok', 'ok'],
  ['<Dialog title="t" aria-label="a" aria-labelledby="b" />', 'ok', 'ok'],
  ['<Dialog aria-label="a" />', 'ok', 'ok'],
  ['<Dialog aria-labelledby="b" />', 'ok', 'ok'],
  ['<Dialog />', 'error', 'error'],
  ['<Dialog aria-label="a" aria-labelledby="b" />', 'error', 'error'],
  ['<Dialog aria-label="a" aria-labelledby={undefined} />', 'ok', 'error'],
  ['<Dialog title={undefined} aria-label="a" />', 'ok', 'error'],
  ['<Dialog title="t" ref={null as React.Ref<HTMLElement>} />', 'ok', 'ok'],
  ['<Dialog title="t" ref={null as React.RefObject<SVGSVGElement | null>} />', 'error', 'error'],
  // IconButton: both names together are valid, neither is not, and Button's own omissions hold.
  ['<IconButton aria-label="a" />', 'ok', 'ok'],
  ['<IconButton aria-labelledby="b" />', 'ok', 'ok'],
  ['<IconButton aria-label="a" aria-labelledby="b" />', 'ok', 'ok'],
  ['<IconButton />', 'error', 'error'],
  ['<IconButton aria-label="a" ref={null as React.Ref<HTMLButtonElement>} />', 'ok', 'ok'],
  ['<IconButton aria-label="a" ref={null as React.Ref<HTMLDivElement>} />', 'error', 'error'],
  ['<IconButton aria-label="a" showTextWhileLoading />', 'error', 'error'],
  // Resizable: omitting both sizes props is valid, so is either alone, and both with values is not.
  ['<Resizable />', 'ok', 'ok'],
  ['<Resizable sizes={{ a: 100 }} />', 'ok', 'ok'],
  ['<Resizable defaultSizes={{ a: 100 }} />', 'ok', 'ok'],
  ['<Resizable sizes={{ a: 100 }} defaultSizes={{ a: 100 }} />', 'error', 'error'],
  ['<Resizable sizes={{ a: 100 }} defaultSizes={undefined} />', 'ok', 'error'],
  ['<Resizable orientation="diagonal" />', 'error', 'error'],
  // Text: three visual arms, each size domain, the host element's own attributes and ref.
  ['<Text>hi</Text>', 'ok', 'ok'],
  ['<Text size="xs">hi</Text>', 'ok', 'ok'],
  ['<Text variant="mono" size="xs">hi</Text>', 'ok', 'ok'],
  ['<Text variant="display" size="xs">hi</Text>', 'error', 'error'],
  ['<Text variant={undefined}>hi</Text>', 'ok', 'error'],
  ['<Text as="label" htmlFor="x">hi</Text>', 'ok', 'ok'],
  ['<Text as="span" htmlFor="x">hi</Text>', 'error', 'error'],
  ['<Text as="a">hi</Text>', 'error', 'error'],
  ['<Text as="p" ref={null as React.Ref<HTMLParagraphElement>}>hi</Text>', 'ok', 'ok'],
  ['<Text as="p" ref={null as React.Ref<HTMLSpanElement>}>hi</Text>', 'error', 'error'],
  // Virtualizer: a stack requires its name and takes a div ref; a grid requires one GridList and takes no ref.
  // A hyphenated attribute a type does not declare is not an excess property, so "absent" differs from `never`.
  ["<Virtualizer aria-label=\"l\" items={['a']} height={100} itemHeight={20} />", 'ok', 'ok'],
  ["<Virtualizer items={['a']} height={100} itemHeight={20} />", 'error', 'error'],
  ['<Virtualizer aria-label="l" aria-labelledby="x" />', 'ok', 'ok'],
  ['<Virtualizer aria-label="l" ref={null as React.Ref<HTMLDivElement>} />', 'ok', 'ok'],
  ['<Virtualizer aria-label="l"><GridList aria-label="g" /></Virtualizer>', 'error', 'error'],
  ['<Virtualizer layout="grid"><GridList aria-label="g" /></Virtualizer>', 'ok', 'ok'],
  ['<Virtualizer layout="grid" />', 'error', 'error'],
  ['<Virtualizer layout="grid" aria-labelledby="x"><GridList aria-label="g" /></Virtualizer>', 'error', 'error'],
  ['<Virtualizer layout="grid" height={100}><GridList aria-label="g" /></Virtualizer>', 'error', 'error'],
  ['<Virtualizer layout="grid" height={undefined}><GridList aria-label="g" /></Virtualizer>', 'ok', 'error'],
  ['<Virtualizer layout="grid" ref={null as React.Ref<HTMLDivElement>}><GridList aria-label="g" /></Virtualizer>', 'error', 'error'],
  ['<Virtualizer layout="grid" ref={undefined}><GridList aria-label="g" /></Virtualizer>', 'ok', 'error'],
  // CodeBlock: two arms by mode.
  ['<CodeBlock source="x" />', 'ok', 'ok'],
  ['<CodeBlock mode="diff" before="a" after="b" />', 'ok', 'ok'],
  ['<CodeBlock />', 'error', 'error'],
  ['<CodeBlock mode="diff" source="x" before="a" after="b" />', 'error', 'error'],
  ['<CodeBlock mode="code" source="x" before="a" />', 'error', 'error'],
  // Generic items: the item type is inferred, or given, and children see it.
  ["<TagSelect.Root items={[{ id: 1, name: 'a' }]}>{(item) => <TagSelect.Item>{item.name}</TagSelect.Item>}</TagSelect.Root>", 'ok', 'ok'],
  ["<TagSelect.Root items={[{ name: 'a' }]} />", 'error', 'error'],
  ["<MultiSelect.Root items={[{ id: 1, name: 'a' }]}>{(item) => <MultiSelect.Item>{item.name}</MultiSelect.Item>}</MultiSelect.Root>", 'ok', 'ok'],
  ["<MultiSelect.Root items={[{ name: 'a' }]} />", 'error', 'error'],
];
const WITNESS_NAMES = ['CodeBlock', 'Dialog', 'GridList', 'IconButton', 'MultiSelect', 'Resizable', 'TagSelect', 'Text', 'Virtualizer'];

/** Equalities the cross-check relies on to call two spellings of one type the same. */
export const EXPLAINED_EQUALITIES = [
  'React.UIEventHandler<HTMLDivElement>, (event: React.UIEvent<HTMLDivElement>) => void',
];

const literal = (value) => JSON.stringify(value);
const quote = (text) => JSON.stringify(text);

/** The import specifier of an export-map entry. */
const specifierOf = (key) => (key === '.' ? '@muxui/react' : `@muxui/react${key.slice(1)}`);

/** `text` with each package type it names (by id, in `refs`) written through its public import, as a probe file must. */
function qualified(text, refs = [], file, namespaces) {
  let result = text;
  for (const id of refs) {
    const type = file.types.find((candidate) => candidate.id === id);
    const published = type?.public?.[0];
    if (published === undefined) throw new Error(`a probe cannot name ${id}, which is not a public type`);
    result = result.replace(new RegExp(`\\b${type.name}\\b`, 'gu'), `${namespaces.get(published.entry)}.${type.name}`);
  }
  return result;
}

/** A type parameter's argument in a probe: its default, else its constraint. */
const typeArgumentOf = (parameter, file, namespaces) => qualified(parameter.default ?? parameter.constraint ?? 'unknown', parameter.refs, file, namespaces);

function refExpression(ref, parameters, file, namespaces) {
  if (ref === null || ref === undefined) return quote('none');
  if (ref.never) return '[never]';
  let text = qualified(ref.type, ref.refs, file, namespaces);
  for (const [name, argument] of parameters) text = text.replace(new RegExp(`\\b${name}\\b`, 'gu'), argument);
  return `[React.Ref<${text}>]`;
}

/** How a probe names a part and its props type, and the arguments it gives a generic part. */
function contextOf({ file, entry, part, namespaces }) {
  const label = `${file.owner}:${entry.name}${part.member ? `.${part.member}` : ''}`;
  const access = `${namespaces.get(entry.entry)}.${entry.name}${part.member ? `.${part.member}` : ''}`;
  const parameters = (part.typeParameters ?? []).map((parameter) => [parameter.name, typeArgumentOf(parameter, file, namespaces)]);
  const args = parameters.length > 0 ? `<${parameters.map(([, argument]) => argument).join(', ')}>` : '';
  const target = `typeof ${access}${args}`;
  const props = part.form === 'FC' || part.form === 'ComponentType'
    ? `NonNullable<React.ComponentProps<${target}>>`
    : `NonNullable<Parameters<${target}>[0]>`;
  return { label, access, parameters, props };
}

/**
 * The probes for one part, as `[id, line, expected verdict]` triples (each line is one statement, so a diagnostic names its probe).
 * @param {number} index A number unique to the part within the source.
 */
function partProbes({ file, entry, part, index, namespaces }) {
  const { label, access, parameters, props } = contextOf({ file, entry, part, namespaces });
  const arms = armsOf(part);
  const names = [...new Set(arms.flatMap((arm) => [...arm.keys()]))];
  const alternatives = part.alternatives ?? [{}];
  const shapes = arms.map((arm, position) => {
    const natives = alternatives[position].natives ?? part.natives;
    const fields = [];
    for (const name of names) {
      const member = arm.get(name);
      // A name an arm does not declare may still come from the native attribute envelope, so it is only "absent" without one.
      if (member === undefined && natives?.length > 0) continue;
      // A member that takes nothing but `undefined` (`?: never`, or `?: undefined`) is one class to the compiler:
      // it tells the two apart only under exactOptionalPropertyTypes.
      const closed = member?.never || member?.type === 'undefined';
      const signature = member === undefined ? 'absent' : `${member.optional ? 'optional' : 'required'}/${closed ? 'never' : 'live'}`;
      fields.push(`${quote(`m:${name}`)}: ${quote(signature)}`);
      if (member?.values && !closed) fields.push(`${quote(`v:${name}`)}: ${member.values.map(literal).join(' | ')}`);
    }
    fields.push(`"ref": ${refExpression(alternatives[position].ref !== undefined ? alternatives[position].ref : part.ref, parameters, file, namespaces)}`);
    return `{ ${fields.join('; ')} }`;
  });

  const probes = [];
  const add = (role, line) => probes.push([`${label} ${role}`, line, 'ok']);
  probes.push([`${label} props`, `type P${index} = ${props};`, 'ok']);
  probes.push([`${label} declared arms`, `type Es${index} = ${shapes.join(' | ')};`, 'ok']);
  add('resolves', `type G${index} = Assert<Guard<P${index}>>;`);
  add('every compiler arm is listed', `type L${index} = Assert<[EveryArmListed<P${index}, Es${index}>] extends [true] ? true : false>;`);
  add('every listed arm exists', `type X${index} = Assert<[EveryListedArmExists<P${index}, Es${index}>] extends [true] ? true : false>;`);
  // The native attribute envelopes (their type with the part's own arguments, minus what the part omits): every key
  // of them is accepted, and no key of the props is left unexplained by them and the model's members.
  const natives = [...new Set([part, ...alternatives].flatMap((arm) => arm.natives ?? []).map((native) => JSON.stringify(native)))].map((text) => JSON.parse(text));
  const envelopes = natives.map((native) => {
    let text = qualified(native.type, native.refs, file, namespaces);
    for (const [name, argument] of parameters) text = text.replace(new RegExp(`\\b${name}\\b`, 'gu'), argument);
    return native.omit?.length > 0 ? `Omit<${text}, ${native.omit.map(quote).join(' | ')}>` : text;
  });
  for (const [position, envelope] of envelopes.entries()) {
    add(`accepts native envelope ${position}`, `type N${index}_${position} = Assert<[MissingFrom<P${index}, keyof ${envelope}>] extends [never] ? true : false>;`);
  }
  const explained = [...names.map(quote), ...envelopes.map((envelope) => `keyof ${envelope}`), "'key'", "'ref'"].join(' | ');
  add('declares nothing the model leaves out', `type U${index} = Assert<[Exclude<ArmKeys<P${index}>, ${explained}>] extends [never] ? true : false>;`);
  if (parameters.length > 0) {
    // One type argument more than the part has parameters is an error; the arity is the model's claim.
    probes.push([`${label} arity`, `type Y${index} = typeof ${access}<${[...parameters, ['', 'unknown']].map(([, argument]) => argument).join(', ')}>;`, 'error']);
  }
  return probes;
}

/**
 * Builds the probe program.
 * @param {object} options
 * @param {Map<string, any>} options.files The reference files, by name.
 * @param {string[]} options.entries The export-map keys of the typed entries.
 * @param {(file: any, entry: any) => boolean} [options.include] Which component exports to probe; all by default.
 * @param {{ file: string, export: string, member?: string | null, key: string }[]} [options.declares] Names a part must accept, whatever declares them.
 * @param {boolean} [options.witnesses] Whether to add the hand-authored witnesses.
 */
export function buildProbe({ files, entries, include = () => true, declares = [], witnesses = true }) {
  const namespaces = new Map(entries.map((key, index) => [key, `E${index}`]));
  const lines = [...HEADER, ...entries.map((key) => `import * as ${namespaces.get(key)} from '${specifierOf(key)}';`)];
  const probes = [];
  const push = (id, line, expect) => {
    lines.push(line);
    probes.push({ id, line: lines.length, expect });
  };

  let index = 0;
  for (const [name, file] of files) {
    for (const entry of file.exports) {
      if (entry.kind !== 'component' || !include(file, entry)) continue;
      for (const part of entry.parts) {
        if (part.form === undefined) continue;
        for (const [id, line, expect] of partProbes({ file, entry, part, index: index++, namespaces })) push(`${name} ${id}`, line, expect);
      }
    }
  }
  for (const claim of declares) {
    const file = files.get(claim.file);
    const entry = file.exports.find(({ name }) => name === claim.export);
    const part = entry.parts.find(({ member }) => (member ?? null) === (claim.member ?? null));
    const { label, props } = contextOf({ file, entry, part, namespaces });
    push(`${label} props`, `type D${index} = ${props};`, 'ok');
    push(`${label} accepts ${claim.key}`, `type K${index} = Assert<${quote(claim.key)} extends keyof D${index} ? true : false>;`, 'ok');
    index += 1;
  }
  for (const equality of EXPLAINED_EQUALITIES) push(`equality ${equality}`, `type Q${index++} = Assert<Mut<${equality}>>;`, 'ok');
  if (witnesses) {
    const bound = `const { ${WITNESS_NAMES.join(', ')} } = ${namespaces.get('.')};`;
    push('witness imports', bound, 'ok');
    for (const [code, loose, exact] of WITNESSES) push(`witness ${code}`, `void (${code});`, { loose, exact });
  }
  return { source: `${lines.join('\n')}\n`, probes };
}

/**
 * Compiles the probe against the shipped declarations with `tsc` and reports every probe whose verdict is not
 * the one expected. A diagnostic outside the probe file, or one on a line that is no probe, is a failure too.
 * @returns {string[]} The failures.
 */
export function runProbe({ probe, tsc, exactOptionalPropertyTypes, declarations, manifest }) {
  return withStagedPackage({ declarations, manifest }, ({ directory }) => {
    writeFileSync(join(directory, 'probe.tsx'), probe.source);
    const config = join(directory, 'tsconfig.json');
    writeFileSync(config, `${JSON.stringify({
      compilerOptions: {
        target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, noEmit: true,
        skipLibCheck: false, types: [], exactOptionalPropertyTypes,
      },
      files: ['probe.tsx'],
    })}\n`);
    const erroring = new Map();
    const failures = [];
    for (const diagnostic of tscDiagnostics({ tsc, config, directory })) {
      const match = /^probe\.tsx\((\d+),\d+\): error (TS\d+):/u.exec(diagnostic);
      if (match === null) { failures.push(`unrelated diagnostic: ${diagnostic.slice(0, 300)}`); continue; }
      erroring.set(Number(match[1]), [...(erroring.get(Number(match[1])) ?? []), diagnostic]);
    }
    const mode = exactOptionalPropertyTypes ? 'exact' : 'loose';
    for (const { id, line, expect } of probe.probes) {
      const verdict = typeof expect === 'string' ? expect : expect[mode];
      const got = erroring.has(line) ? 'error' : 'ok';
      if (got !== verdict) failures.push(`${id}: expected ${verdict}, the compiler says ${got}${erroring.has(line) ? ` (${erroring.get(line)[0].slice(0, 200)})` : ''}`);
      erroring.delete(line);
    }
    for (const [line, found] of erroring) failures.push(`a diagnostic on line ${line} belongs to no probe: ${found[0].slice(0, 200)}`);
    return failures;
  });
}
