/**
 * Pass 2a: what a props type declares. A component's props type is an alias or interface graph over object
 * literals, `Omit`/`Pick` of Mux UI types, unions (alternatives) and host types. This expands it into
 * arms: each arm is one alternative, holding its declared members in the order they were declared, the
 * host surfaces it passes through (`natives`), and its forwarded ref.
 *
 * Nothing here consults the compiler. A construct without an exact reading fails with a named
 * `ReferenceReadError` (an unresolved alias, a cycle, a duplicate member the reader cannot keep exactly,
 * `Omit` over a union, a utility type it does not evaluate), so a constraint can never go unrendered.
 */
import { ReferenceReadError } from './errors.mjs';
import { printType } from './printer.mjs';

const unsupported = (chain, message) => new ReferenceReadError('UNSUPPORTED', chain, message);

// ---- substitution --------------------------------------------------------------------------------

/** Replaces the type parameters named in `env` (name to type node) throughout `node`, honouring shadowing. */
export function substitute(node, env) {
  if (env.size === 0 || node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => substitute(item, env));
  if (node.kind === 'parameter') return env.get(node.name) ?? node;
  let scope = env;
  const shadowed = [...(node.typeParameters ?? []).map((parameter) => parameter.name), ...(node.kind === 'mapped' ? [node.parameter] : [])];
  if (shadowed.some((name) => env.has(name))) {
    scope = new Map(env);
    for (const name of shadowed) scope.delete(name);
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) result[key] = value !== null && typeof value === 'object' ? substitute(value, scope) : value;
  return result;
}

/** The binding of a declaration's type parameters to `typeArguments`, with defaults for the ones left out. */
export function bindTypeParameters(declaration, typeArguments, chain) {
  const parameters = declaration.typeParameters ?? [];
  const given = typeArguments ?? [];
  if (given.length > parameters.length) throw unsupported(chain, `${declaration.name} takes ${parameters.length} type arguments and is given ${given.length}`);
  const env = new Map();
  parameters.forEach((parameter, index) => {
    if (index < given.length) env.set(parameter.name, given[index]);
    else if (parameter.default) env.set(parameter.name, substitute(parameter.default, env));
    else throw unsupported(chain, `${declaration.name} needs a type argument for ${parameter.name}, which has no default`);
  });
  return env;
}

// ---- finite value domains ------------------------------------------------------------------------

/**
 * The literal values a type allows, when it is exactly a union of literals once aliases and `Exclude` or `Extract`
 * of literals are expanded; null for anything else. Order is the order the declaration lists them.
 */
export function valuesOf(type, types, stack = []) {
  switch (type.kind) {
    case 'literal': return [type.value];
    case 'union': {
      const all = [];
      for (const member of type.members) {
        const values = valuesOf(member, types, stack);
        if (values === null) return null;
        for (const value of values) if (!all.includes(value)) all.push(value);
      }
      return all;
    }
    case 'reference': {
      const declaration = types.get(type.id);
      if (declaration?.kind !== 'alias' || stack.includes(type.id)) return null;
      if ((declaration.typeParameters?.length ?? 0) > (type.typeArguments?.length ?? 0) && declaration.typeParameters.some((parameter) => !parameter.default)) return null;
      const env = bindTypeParameters(declaration, type.typeArguments, declaration.id);
      return valuesOf(substitute(declaration.type, env), types, [...stack, type.id]);
    }
    case 'host': {
      if ((type.name !== 'Exclude' && type.name !== 'Extract') || type.typeArguments?.length !== 2) return null;
      const from = valuesOf(type.typeArguments[0], types, stack);
      const among = valuesOf(type.typeArguments[1], types, stack);
      if (from === null || among === null) return null;
      return from.filter((value) => (type.name === 'Exclude') !== among.includes(value));
    }
    default: return null;
  }
}

// ---- arms ----------------------------------------------------------------------------------------

const memberKey = (member) => member.name;

/**
 * The host types a props type may pass through as native attributes: React's attribute surfaces, whose keys
 * the reader does not read. Any other host application (`ReturnType<...>`, `Parameters<...>`, a library
 * type) could hide a member the component declares, so it is refused rather than shown as an envelope.
 */
const NATIVE_SURFACE = /^React\.(?:\w*HTMLAttributes|SVGAttributes|DOMAttributes|AriaAttributes|ComponentPropsWithoutRef)$/u;
const isNativeSurface = (type) => type.kind === 'host' && type.origin === 'react' && NATIVE_SURFACE.test(type.name);

/** Whether two declarations of one member say the same thing (comments aside). */
function sameMember(left, right) {
  return left.member === right.member && left.optional === right.optional && (left.readonly ?? false) === (right.readonly ?? false)
    && memberTypeText(left) === memberTypeText(right);
}

export function memberTypeText(member) {
  return member.member === 'method'
    ? printType({ kind: 'function', typeParameters: member.typeParameters, parameters: member.parameters, returnType: member.returnType })
    : printType(member.type);
}

/** @typedef {{ members: Map<string, object>, natives: { type: object, omit: string[] }[], ref?: { type: object } | { never: true } }} Arm */

const emptyArm = () => ({ members: new Map(), natives: [] });

function armOf(members, chain) {
  const arm = emptyArm();
  const seen = new Set();
  for (const member of members) {
    if (member.member === 'call') throw unsupported(chain, 'a call signature in a props type');
    if (member.member === 'index') throw unsupported(chain, 'an index signature in a props type');
    // One body cannot declare a name twice except as overloaded methods, which a map of members would collapse.
    if (seen.has(member.name)) throw new ReferenceReadError('OVERLOAD', chain, `${member.name} is declared more than once in one props type; the reader keeps one signature per member`);
    seen.add(member.name);
    if (member.name === 'ref' && member.member === 'property' && member.type.kind === 'keyword' && member.type.name === 'never') {
      // `ref?: never` and `ref: never` differ, so the requiredness stays.
      arm.ref = { never: true, ...(!member.optional && { required: true }) };
      continue;
    }
    arm.members.set(memberKey(member), member);
  }
  return arm;
}

const cloneArm = (arm) => ({ ...arm, members: new Map(arm.members), natives: arm.natives.map((native) => ({ ...native, omit: [...native.omit] })) });

/** The member two declarations of one name intersect to, or an error when the reader cannot keep it exactly. */
function mergeMember(left, right, types, chain) {
  // One spelling of one type: the member is required when either side requires it, as TypeScript intersects it.
  if (left.member === right.member && sameMember({ ...left, optional: false }, { ...right, optional: false })) {
    return { ...left, optional: left.optional && right.optional, doc: left.doc ?? right.doc };
  }
  const comparable = left.member === 'property' && right.member === 'property' && (left.readonly ?? false) === (right.readonly ?? false);
  if (comparable) {
    const leftValues = valuesOf(left.type, types);
    const rightValues = valuesOf(right.type, types);
    const sameDomain = leftValues !== null && rightValues !== null && leftValues.length === rightValues.length && leftValues.every((value) => rightValues.includes(value));
    if (sameDomain) return { ...left, optional: left.optional && right.optional, doc: left.doc ?? right.doc };
  }
  throw unsupported(chain, `the intersection declares ${left.name} twice, as ${printMemberBrief(left)} and ${printMemberBrief(right)}; the reader keeps a duplicate only when both spell one type`);
}

const printMemberBrief = (member) => `${member.optional ? 'optional ' : ''}${memberTypeText(member)}`;

function mergeArms(left, right, types, chain) {
  const merged = cloneArm(left);
  for (const [name, member] of right.members) {
    merged.members.set(name, merged.members.has(name) ? mergeMember(merged.members.get(name), member, types, chain) : member);
  }
  for (const native of right.natives) {
    if (!merged.natives.some((existing) => nativeKey(existing) === nativeKey(native))) merged.natives.push({ ...native, omit: [...native.omit] });
  }
  if (right.ref !== undefined) {
    if (merged.ref !== undefined && JSON.stringify(merged.ref) !== JSON.stringify(right.ref)) throw unsupported(chain, 'two refs in one intersection');
    merged.ref = right.ref;
  }
  return merged;
}

const nativeKey = (native) => `${printType(native.type)}\0${native.omit.join('\0')}`;

function armKey(arm) {
  return JSON.stringify([
    [...arm.members.values()].map((member) => [member.member, member.name, member.optional, member.readonly ?? false, memberTypeText(member)]),
    arm.natives.map(nativeKey), arm.ref ? (arm.ref.never ? (arm.ref.required ? 'never!' : 'never') : printType(arm.ref.type)) : null,
  ]);
}

function dedupe(arms) {
  const seen = new Set();
  return arms.filter((arm) => {
    const key = armKey(arm);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- key sets ------------------------------------------------------------------------------------

/** The member names a `keyof` or literal-union key argument stands for, in declaration order. */
function keysOf(type, expandArms, types, chain) {
  switch (type.kind) {
    case 'literal':
      if (typeof type.value !== 'string') throw unsupported(chain, 'a non-string key');
      return [type.value];
    case 'union': return type.members.flatMap((member) => keysOf(member, expandArms, types, chain));
    case 'keyof': {
      const arms = expandArms(type.type);
      if (arms.some((arm) => arm.natives.length > 0)) throw unsupported(chain, 'keyof a type that passes host attributes through; its keys are not read');
      const [first, ...rest] = arms.map((arm) => [...arm.members.keys()]);
      return first.filter((name) => rest.every((names) => names.includes(name)));
    }
    case 'reference': {
      const values = valuesOf(type, types);
      if (values === null) throw unsupported(chain, `the key type ${type.name} is not a union of string literals`);
      return values;
    }
    default: throw unsupported(chain, `a ${type.kind} type as a key`);
  }
}

// ---- host applications ---------------------------------------------------------------------------

/**
 * Reads the props a type declares into arms.
 * @param {Map<string, object>} types Every type declaration of the graph, by id.
 */
export function createExpander(types) {
  function expand(type, stack, chain) {
    switch (type.kind) {
      case 'object': return [armOf(type.members, chain)];
      case 'reference': return expandReference(type, stack, chain);
      case 'intersection': {
        let arms = [emptyArm()];
        for (const member of type.members) {
          const operand = expand(member, stack, chain);
          arms = arms.flatMap((arm) => operand.map((other) => mergeArms(arm, other, types, chain)));
        }
        return dedupe(arms);
      }
      case 'union': return dedupe(type.members.flatMap((member) => expand(member, stack, chain)));
      case 'host': return expandHost(type, stack, chain);
      default: throw unsupported(chain, `a ${type.kind === 'parameter' ? `type parameter (${type.name})` : `${type.kind} type`} where props are declared`);
    }
  }

  function expandReference(type, stack, chain) {
    const declaration = types.get(type.id);
    if (declaration === undefined) throw new ReferenceReadError('DIAGNOSTICS', chain, `${type.id} is not in the graph`);
    if (stack.includes(type.id)) throw new ReferenceReadError('CYCLE', chain, `${[...stack, type.id].join(' -> ')}`);
    const env = bindTypeParameters(declaration, type.typeArguments, chain);
    const next = [...stack, type.id];
    if (declaration.kind === 'alias') return expand(substitute(declaration.type, env), next, declaration.id);
    // An interface: its bases first, then its own members, which override a base's.
    let arms = [emptyArm()];
    for (const base of declaration.extends ?? []) {
      const operand = expand(substitute(base, env), next, declaration.id);
      arms = arms.flatMap((arm) => operand.map((other) => mergeArms(arm, other, types, declaration.id)));
    }
    const own = armOf(substitute(declaration.members, env), declaration.id);
    return dedupe(arms.map((arm) => {
      const merged = cloneArm(arm);
      for (const [name, member] of own.members) merged.members.set(name, member);
      if (own.ref) merged.ref = own.ref;
      return merged;
    }));
  }

  function expandHost(type, stack, chain) {
    const [first, second] = type.typeArguments ?? [];
    switch (type.name) {
      case 'Omit': {
        if (type.typeArguments?.length !== 2) throw unsupported(chain, 'Omit without exactly two type arguments');
        const arms = expand(first, stack, chain);
        const omit = keysOf(second, (target) => expand(target, stack, chain), types, chain);
        const result = dedupe(arms.map((arm) => {
          const next = cloneArm(arm);
          for (const name of omit) next.members.delete(name);
          if (omit.includes('ref')) delete next.ref;
          next.natives = next.natives.map((native) => ({ ...native, omit: [...native.omit, ...omit.filter((name) => !native.omit.includes(name))] }));
          return next;
        }));
        // TypeScript omits from a union by keeping only the keys the arms share. That equals omitting from each
        // arm only when the arms agree once the keys are gone, which is the one case the reader reads.
        if (result.length > 1 && arms.length > 1) {
          throw unsupported(chain, `Omit over ${arms.length} alternatives that still differ after omitting ${omit.join(', ')}; TypeScript keeps only the keys they share, which the reader does not evaluate`);
        }
        return result;
      }
      case 'Pick': {
        if (type.typeArguments?.length !== 2) throw unsupported(chain, 'Pick without exactly two type arguments');
        // A host type's members are not read, so Pick of one passes through as the exact application.
        if (isNativeSurface(first)) return [{ ...emptyArm(), natives: [{ type, omit: [] }] }];
        const arms = expand(first, stack, chain);
        if (arms.some((arm) => arm.natives.length > 0)) throw unsupported(chain, 'Pick of a type that passes host attributes through');
        const keep = keysOf(second, (target) => expand(target, stack, chain), types, chain);
        const result = dedupe(arms.map((arm) => {
          const next = cloneArm(arm);
          next.members = new Map([...arm.members].filter(([name]) => keep.includes(name)));
          if (!keep.includes('ref')) delete next.ref;
          return next;
        }));
        if (result.length > 1 && arms.length > 1) throw unsupported(chain, `Pick over ${arms.length} alternatives that still differ after picking ${keep.join(', ')}`);
        return result;
      }
      case 'React.RefAttributes': {
        if (type.typeArguments?.length !== 1) throw unsupported(chain, 'RefAttributes without exactly one type argument');
        return [{ ...emptyArm(), ref: { type: first } }];
      }
      case 'Partial': case 'Required': case 'Readonly': case 'Exclude': case 'Extract': case 'Record': case 'NonNullable': case 'React.PropsWithChildren':
      case 'React.PropsWithoutRef': case 'React.PropsWithRef': case 'React.ComponentProps':
        throw unsupported(chain, `${type.name} is a utility type the reader does not evaluate in a props type`);
      default:
        // A React attribute surface the component passes through; its keys are not read.
        if (isNativeSurface(type)) return [{ ...emptyArm(), natives: [{ type, omit: [] }] }];
        throw unsupported(chain, `${printType(type)} is a host type the reader does not evaluate in a props type; only React's attribute surfaces pass through`);
    }
  }

  return { expand: (type, chain) => expand(type, [], chain), expandStack: expand };
}
