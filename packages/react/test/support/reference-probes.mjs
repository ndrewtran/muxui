// Compiler probes of the committed declaration reference (Decision 0031).
//
// The reference says things about the shipped declarations: which members each alternative of a props type
// declares, whether each is optional, readonly, declared `never`, or not declared at all, the type of each member
// and its finite values, the ref a part forwards and whether it must be written, the native attribute envelope it
// extends, and a generic part's arity. A probe does not trust the reader to have read those correctly: it
// states each claim as a type-level assertion that the compiler evaluates over the declarations a consumer
// installs, with `tsc` (TypeScript 7 and 6, with exactOptionalPropertyTypes off and on). The claims come from the
// model under test and the verdict from the compiler, so a model that wrongly drops an arm, an optional value, a
// ref or a `never`, or gets a member, ref or envelope type wrong, fails here.
//
// The model's own printed types are compiled, in a namespace that holds its closure of types and values, and
// compared with the types the shipped declarations give. A generic part is probed at its defaults and again with
// each parameter varied alone, so a type that is right only for the default fails. The model must also agree with
// itself: a member's printed type, its `values`, its `never` and its `explicitUndefined` say one thing.
//
// What a member reads as and what can be written to it are two facts: under exactOptionalPropertyTypes
// `?: never`, `?: undefined` and `?: string` against `?: string | undefined` read alike and write differently, so
// each member also claims whether it takes an explicit `undefined`. A member the model gives no `values` must not
// be a finite domain of literals the declaration lists. The default and constraint of each type parameter are
// read from the declaration by the compiler in reference-defaults.mjs, not supplied by an instantiation.
//
// A second kind of probe is authored by hand and never reads the model: a JSX element and whether the
// compiler accepts it, for the components whose constraints are hardest (Dialog, IconButton, Resizable, Text,
// Virtualizer, CodeBlock, and generic items). They are the facts the model has to agree with.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withStagedPackage } from '../../reference-reader/stage.mjs';
import { tscDiagnostics } from './declaration-surface.mjs';
import { armsOf } from './reference-catalog.mjs';

export const PROBE_HEADER = [
  "import type * as React from 'react';",
  'type Mut<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;',
  'type Assert<T extends true> = T;',
  'type Guard<P> = 0 extends 1 & P ? false : ([P] extends [never] ? false : true);',
  // `any` would pass every mutual assignability, so a compared type that is any is replaced by a marker.
  'type Ty<X> = 0 extends 1 & X ? { readonly any: true } : X;',
  // An optional member reads with `undefined` added, whether or not exactOptionalPropertyTypes is on.
  'type Adjust<M, Optional extends boolean> = Optional extends true ? M | undefined : M;',
  // What can be written to a member is a second fact: under exactOptionalPropertyTypes an optional member takes an explicit
  // `undefined` only if its type lists it, and `?: never` takes none, though all of them read the same.
  'type Takes<X> = [undefined] extends [X] ? true : false;',
  'type Loose = [{ a?: 1 | undefined }] extends [{ a?: 1 }] ? true : false;',
  "type Writes<A, K extends PropertyKey> = K extends keyof A ? ({} extends Pick<A, K> ? ([{ [Q in K]?: undefined }] extends [Pick<A, K>] ? true : false) : ([{ [Q in K]: undefined }] extends [Pick<A, K>] ? true : false)) : never;",
  'type WriteOf<M, Optional extends boolean> = Optional extends true ? (Loose extends true ? true : Takes<M>) : Takes<M>;',
  // Whether a type is a finite domain of string or number literals (bar `undefined`): every constituent is one literal, not `string`, `number` or a pattern.
  "type IsLiteral<U> = U extends string | number ? ({} extends Record<U, 1> ? false : true) : false;",
  "type IsFinite<X> = [Exclude<X, undefined>] extends [never] ? false : ([IsLiteral<Exclude<X, undefined>>] extends [true] ? true : false);",
  'type Mutable<T> = { -readonly [Q in keyof T]: T[Q] };',
  'type IsReadonly<A, K extends keyof A> = (<X>() => X extends Pick<A, K> ? 1 : 2) extends (<X>() => X extends Mutable<Pick<A, K>> ? 1 : 2) ? false : true;',
  // How an arm declares a name: optional or required, `never` or live, and readonly; a name it does not declare is absent.
  "type Sig<A, K extends PropertyKey> = K extends keyof A ? `${{} extends Pick<A, K> ? 'optional' : 'required'}/${[Exclude<A[K], undefined>] extends [never] ? 'never' : 'live'}${IsReadonly<A, K> extends true ? '/readonly' : ''}` : 'absent';",
  "type RefOf<A> = 'ref' extends keyof A ? [Exclude<A['ref'], undefined>] : 'none';",
  'type Raw<A, K extends PropertyKey> = K extends keyof A ? A[K] : never;',
  'type ValuesOf<A, K extends PropertyKey> = K extends keyof A ? Exclude<A[K], undefined> : never;',
  // The part of an arm a claim speaks about: "m:name" its declaration, "t:name" its type, "w:name" whether it takes `undefined`,
  // "v:name" its finite values, "f:name" whether its type is a finite domain, "ref" its ref.
  "type ShapeOf<A, Ks extends string> = { [K in Ks]: K extends `m:${infer N}` ? Sig<A, N> : K extends `t:${infer N}` ? Ty<Raw<A, N>> : K extends `w:${infer N}` ? Writes<A, N> : K extends `v:${infer N}` ? ValuesOf<A, N> : K extends `f:${infer N}` ? IsFinite<Raw<A, N>> : K extends 'ref' ? RefOf<A> : never };",
  'type Fits<A, E> = Mut<ShapeOf<A, keyof E & string>, E>;',
  // The keys of each arm, not only the keys every arm shares.
  'type ArmKeys<P> = P extends unknown ? keyof P : never;',
  'type MissingFrom<P, Ks> = P extends unknown ? Exclude<Ks, keyof P> : never;',
  // Every key the envelope and an arm share, bar those the part declares itself, has the same type in both.
  'type Differing<P, Env, Declared> = P extends unknown ? { [K in Exclude<keyof Env & keyof P, Declared>]: Mut<Ty<P[K]>, Ty<Env[K]>> extends true ? never : K }[Exclude<keyof Env & keyof P, Declared>] : never;',
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
const oneLine = (text) => text.replace(/\s*\n\s*/gu, ' ');

/** The arms of a type's text at its top level: `A | (B | C) | undefined` is three. */
function topLevelArms(text) {
  const arms = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; at += 1) {
    const here = text[at];
    if ('([{<'.includes(here)) depth += 1;
    else if (')]}'.includes(here) || (here === '>' && text[at - 1] !== '=')) depth -= 1;
    else if (here === '|' && depth === 0) {
      arms.push(text.slice(start, at).trim());
      start = at + 1;
    }
  }
  arms.push(text.slice(start).trim());
  return arms;
}

/**
 * Whether a printed type names anything but literals, primitives and the package types its `refs` list: a host
 * type (`React.HTMLAttributes<...>['inputMode']`) or a type parameter, whose domain the reader is not asked to read.
 */
function namesMoreThanLiterals(member, file) {
  const known = new Set(['undefined', 'null', 'true', 'false', 'string', 'number', 'boolean', 'bigint', 'never', ...(member.refs ?? []).map((id) => file.types.find((type) => type.id === id)?.name)]);
  const words = member.type.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/gu, '').match(/[A-Za-z_$][\w$.]*/gu) ?? [];
  return words.some((word) => !known.has(word));
}

/** The import specifier of an export-map entry. */
export const specifierOf = (key) => (key === '.' ? '@muxui/react' : `@muxui/react${key.slice(1)}`);

/** `text` with each package type it names (by id, in `refs`) written through its public import, as module-level code must. */
export function qualified(text, refs = [], file, namespaces) {
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

/** Other arguments worth instantiating a parameter with: each value of a finite constraint, else a type that extends it. */
function otherArguments(parameter, file, namespaces) {
  const constraint = parameter.refs?.length === 1 ? file.types.find(({ id }) => id === parameter.refs[0]) : undefined;
  if (constraint?.values && parameter.constraint === constraint.name) return constraint.values.slice(0, 12).map(literal);
  if (parameter.constraint) return [`${qualified(parameter.constraint, parameter.refs, file, namespaces)} & { readonly probe: number }`];
  return ['string', '{ readonly probe: number }'];
}

/** Every instantiation a generic part is probed at: its defaults, then each parameter varied alone. */
function instantiationsOf(part, file, namespaces) {
  const parameters = part.typeParameters ?? [];
  const base = parameters.map((parameter) => typeArgumentOf(parameter, file, namespaces));
  const key = (list) => list.join(', ').replaceAll("'", '"');
  const seen = new Set([key(base)]);
  const all = [base];
  parameters.forEach((parameter, position) => {
    for (const argument of otherArguments(parameter, file, namespaces)) {
      const next = base.map((value, other) => (other === position ? argument : value));
      if (!seen.has(key(next))) { seen.add(key(next)); all.push(next); }
    }
  });
  return all;
}

/** How a probe names a part and its props type under the arguments it gives a generic part. */
function contextOf({ file, entry, part, namespaces }, args = []) {
  const label = `${file.owner}:${entry.name}${part.member ? `.${part.member}` : ''}`;
  const access = `${namespaces.get(entry.entry)}.${entry.name}${part.member ? `.${part.member}` : ''}`;
  const target = `typeof ${access}${args.length > 0 ? `<${args.join(', ')}>` : ''}`;
  const props = part.form === 'FC' || part.form === 'ComponentType'
    ? `NonNullable<React.ComponentProps<${target}>>`
    : `NonNullable<Parameters<${target}>[0]>`;
  return { label, access, props };
}

/** The model's own declaration of a closure type or value, as a line of the namespace that holds its owner's closure. */
const closureLine = (declaration) => `export ${oneLine(declaration.text).replace(/^declare /u, '')}`;

/**
 * The probes for one part, as `[id, line, expected verdict]` triples (each line is one statement, so a diagnostic names its probe),
 * and the lines it adds to its owner's namespace (the model's printed types for its members, refs and native envelopes).
 * @param {number} index A number unique to the part within the source.
 */
function partProbes({ file, entry, part, index, namespaces, space }) {
  const parameters = part.typeParameters ?? [];
  const declared = parameters.length > 0 ? `<${parameters.map((parameter) => `${parameter.name}${parameter.constraint ? ` extends ${parameter.constraint}` : ''}`).join(', ')}>` : '';
  const { label, access } = contextOf({ file, entry, part, namespaces });
  const arms = armsOf(part);
  const names = [...new Set(arms.flatMap((arm) => [...arm.keys()]))];
  const alternatives = part.alternatives ?? [{}];

  const inside = [];
  const aliased = (name, text, role) => {
    inside.push([`${label} printed ${role}`, `export type ${name}${declared} = ${text};`]);
    return name;
  };
  const instantiate = (alias, args) => `${space}.${alias}${args.length > 0 ? `<${args.join(', ')}>` : ''}`;

  // Each arm's members, as the model prints them, and its ref.
  let counter = 0;
  const armPlans = arms.map((arm, position) => {
    const natives = alternatives[position].natives ?? part.natives;
    const ref = alternatives[position].ref !== undefined ? alternatives[position].ref : part.ref;
    const members = [...arm.values()].map((member) => ({
      member,
      alias: aliased(`T${index}_${position}_${counter++}`, member.method ? `{ ${oneLine(member.type)} }` : oneLine(member.type), `type of ${member.name}`),
    }));
    const refAlias = ref?.type ? aliased(`R${index}_${position}`, `React.Ref<${oneLine(ref.type)}>`, 'ref') : null;
    return { arm, natives, ref, members, refAlias };
  });
  const envelopeOf = (native) => (native.omit?.length > 0 ? `Omit<${oneLine(native.type)}, ${native.omit.map(quote).join(' | ')}>` : oneLine(native.type));
  const natives = [...new Set([part, ...alternatives].flatMap((arm) => arm.natives ?? []).map((native) => JSON.stringify(native)))].map((text) => JSON.parse(text));
  const nativeAliases = natives.map((native, position) => aliased(`N${index}_${position}`, envelopeOf(native), `native envelope ${position}`));

  const shapeFor = (args) => armPlans.map(({ arm, natives: armNatives, ref, members, refAlias }) => {
    const fields = [];
    for (const name of names) {
      const member = arm.get(name);
      // A name an arm does not declare may still come from the native attribute envelope, so it is only "absent" without one.
      if (member === undefined && armNatives?.length > 0) continue;
      // A member that takes nothing but `undefined` (`?: never`, or `?: undefined`) is one class to the compiler:
      // it tells the two apart only under exactOptionalPropertyTypes.
      const closed = member?.never || member?.type === 'undefined';
      const signature = member === undefined ? 'absent' : `${member.optional ? 'optional' : 'required'}/${closed ? 'never' : 'live'}${member.readonly ? '/readonly' : ''}`;
      fields.push(`${quote(`m:${name}`)}: ${quote(signature)}`);
      if (member === undefined) continue;
      const printed = instantiate(members.find((entryOf) => entryOf.member === member).alias, args);
      fields.push(`${quote(`t:${name}`)}: Ty<Adjust<${printed}, ${member.optional ? 'true' : 'false'}>>`);
      fields.push(`${quote(`w:${name}`)}: WriteOf<${printed}, ${member.optional ? 'true' : 'false'}>`);
      if (member.values && !closed) fields.push(`${quote(`v:${name}`)}: ${member.values.map(literal).join(' | ')}`);
      // A member the model gives no values is not a finite domain of literals: a literal union that carries none is a gap in the model.
      else if (!member.method && !namesMoreThanLiterals(member, file)) fields.push(`${quote(`f:${name}`)}: false`);
    }
    // A typed ref is RefAttributes' `ref?: Ref<T> | undefined`, which the model does not spell, so only a ref that takes nothing is claimed to write.
    if (ref?.never) fields.push(`"m:ref": ${quote(ref.required ? 'required/never' : 'optional/never')}`, `"w:ref": WriteOf<never, ${ref.required ? 'false' : 'true'}>`);
    else if (ref?.type) fields.push('"m:ref": "optional/live"');
    fields.push(`"ref": ${ref === null || ref === undefined ? '"none"' : (ref.never ? '[never]' : `[${instantiate(refAlias, args)}]`)}`);
    return `{ ${fields.join('; ')} }`;
  });

  const probes = [];
  const instantiations = instantiationsOf(part, file, namespaces);
  instantiations.forEach((args, number) => {
    const { props } = contextOf({ file, entry, part, namespaces }, args);
    const suffix = `${index}_${number}`;
    const where = args.length > 0 ? `${label}<${args.join(', ')}>` : label;
    const add = (role, line) => probes.push([`${where} ${role}`, line, 'ok']);
    add('props', `type P${suffix} = ${props};`);
    add('declared arms', `type Es${suffix} = ${shapeFor(args).join(' | ')};`);
    add('resolves', `type G${suffix} = Assert<Guard<P${suffix}>>;`);
    add('every compiler arm is listed', `type L${suffix} = Assert<[EveryArmListed<P${suffix}, Es${suffix}>] extends [true] ? true : false>;`);
    add('every listed arm exists', `type X${suffix} = Assert<[EveryListedArmExists<P${suffix}, Es${suffix}>] extends [true] ? true : false>;`);
    // The native attribute envelopes (their type with the part's own arguments, minus what the part omits): every key
    // of them is accepted with the type the envelope gives it, and no key of the props is left unexplained by them
    // and the model's members.
    const declaredNames = [...names.map(quote), "'key'", "'ref'"].join(' | ');
    nativeAliases.forEach((alias, position) => {
      const envelope = instantiate(alias, args);
      add(`accepts native envelope ${position}`, `type N${suffix}_${position} = Assert<[MissingFrom<P${suffix}, keyof ${envelope}>] extends [never] ? true : false>;`);
      add(`gives native envelope ${position} its types`, `type D${suffix}_${position} = Assert<[Differing<P${suffix}, ${envelope}, ${declaredNames}>] extends [never] ? true : false>;`);
    });
    const explained = [...names.map(quote), ...nativeAliases.map((alias) => `keyof ${instantiate(alias, args)}`), "'key'", "'ref'"].join(' | ');
    add('declares nothing the model leaves out', `type U${suffix} = Assert<[Exclude<ArmKeys<P${suffix}>, ${explained}>] extends [never] ? true : false>;`);
    // The model agrees with itself: a member's printed type holds its values, its `never`, and its explicit `undefined`.
    if (number === 0) {
      armPlans.forEach(({ members }, position) => members.forEach(({ member, alias }, at) => {
        const printed = instantiate(alias, args);
        const here = `${suffix}_${position}_${at}`;
        if (member.values && !member.never && member.type !== 'undefined') {
          add(`holds the values of ${member.name}`, `type V${here} = Assert<Mut<Exclude<${printed}, undefined>, ${member.values.map(literal).join(' | ')}>>;`);
        }
        const text = member.type.trim();
        if (member.never) add(`prints ${member.name} as never`, `type Z${here} = Assert<[${printed}] extends [never] ? true : false>;`);
        else if (!member.method && !['never', 'unknown', 'any', 'undefined'].includes(text)) {
          add(`prints ${member.name} as not never`, `type Z${here} = Assert<[${printed}] extends [never] ? false : true>;`);
        }
        if (!member.method && text !== 'undefined') {
          // The flag says the type lists `undefined` itself; a type that includes it by reference (`React.ReactNode`) is not flagged.
          const listed = topLevelArms(text).includes('undefined');
          add(`${member.name} flags its listed undefined`, `type W${here} = Assert<${listed === Boolean(member.explicitUndefined)}>;`);
          if (member.explicitUndefined) add(`${member.name} lets undefined in`, `type A${here} = Assert<[undefined] extends [${printed}] ? true : false>;`);
        }
      }));
    }
  });
  if (parameters.length > 0) {
    // One type argument more than the part has parameters is an error; the arity is the model's claim.
    const base = instantiations[0];
    probes.push([`${label} arity`, `type Y${index} = typeof ${access}<${[...base, 'unknown'].join(', ')}>;`, 'error']);
  }
  return { probes, inside };
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
  const lines = [...PROBE_HEADER, ...entries.map((key) => `import * as ${namespaces.get(key)} from '${specifierOf(key)}';`)];
  const probes = [];
  const push = (id, line, expect) => {
    lines.push(line);
    probes.push({ id, line: lines.length, expect });
  };
  // What each owner's file declares to the probe: its closure of types and values, then the parts' printed members.
  const spaces = new Map();
  const spaceOf = (name, file) => {
    if (!spaces.has(name)) spaces.set(name, { name: `M${spaces.size}`, file, lines: [] });
    return spaces.get(name);
  };

  let index = 0;
  for (const [name, file] of files) {
    for (const entry of file.exports) {
      if (entry.kind !== 'component' || !include(file, entry)) continue;
      const space = spaceOf(name, file);
      for (const part of entry.parts) {
        if (part.form === undefined) continue;
        const planned = partProbes({ file, entry, part, index: index++, namespaces, space: space.name });
        for (const [id, line, expect] of planned.probes) push(`${name} ${id}`, line, expect);
        space.lines.push(...planned.inside);
      }
    }
  }
  for (const { name, file, lines: inside } of spaces.values()) {
    lines.push(`declare namespace ${name} {`);
    for (const declaration of [...file.types, ...(file.values ?? [])]) {
      lines.push(closureLine(declaration));
      probes.push({ id: `${file.owner}.json printed ${declaration.kind ?? 'type'} ${declaration.name} compiles`, line: lines.length, expect: 'ok' });
    }
    for (const [id, line] of inside) {
      lines.push(line);
      probes.push({ id: `${file.owner}.json ${id}`, line: lines.length, expect: 'ok' });
    }
    lines.push('}');
  }
  for (const claim of declares) {
    const file = files.get(claim.file);
    const entry = file.exports.find(({ name }) => name === claim.export);
    const part = entry.parts.find(({ member }) => (member ?? null) === (claim.member ?? null));
    const { label, props } = contextOf({ file, entry, part, namespaces }, instantiationsOf(part, file, namespaces)[0]);
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
