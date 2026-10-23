/**
 * Pass 2b: components and their parts. Recognises how a declaration says "this is a component", and turns
 * each part's props type into the model's shape: the members every alternative shares, the members that
 * differ per alternative, the host surfaces it passes through, and its forwarded ref.
 *
 * What counts as a component is read from the declaration, never from a name:
 * - `React.ForwardRefExoticComponent<Props>` (the ref, when there is one, is a `React.RefAttributes<Ref>`
 *   inside Props), `React.FC<Props>`, `React.FunctionComponent<Props>` and `React.ComponentType<Props>`;
 * - a function type or declaration of one parameter that returns an element;
 * - an object type or interface with one call signature of one parameter, which may be generic;
 * - any of those intersected with an object of further parts, or an object of parts alone (a compound).
 */
import { ReferenceReadError } from './errors.mjs';
import { createExpander, bindTypeParameters, substitute, valuesOf } from './expand.mjs';
import { printType, printCallSignature, referencedIds } from './printer.mjs';

const unsupported = (chain, message) => new ReferenceReadError('UNSUPPORTED', chain, message);

const FORMS = new Map([
  ['React.ForwardRefExoticComponent', 'forwardRef'],
  ['React.FC', 'FC'],
  ['React.FunctionComponent', 'FC'],
  ['React.ComponentType', 'ComponentType'],
]);

const refList = (type) => [...referencedIds(type)];

const isUndefinedType = (type) => type.kind === 'keyword' && type.name === 'undefined';

/** A member as the model records it. */
export function modelMember(member, types) {
  const method = member.member === 'method';
  const base = { name: member.name, ...(member.optional && { optional: true }), ...(member.readonly && { readonly: true }) };
  const doc = member.doc && { doc: member.doc };
  if (method) {
    // A method prints as its call signature, `(a: A): R`; the member is flagged `method`.
    const refs = refList(member);
    return { ...base, method: true, type: printCallSignature(member), ...(refs.length > 0 && { refs }), ...doc };
  }
  const { type } = member;
  const members = type.kind === 'union' ? type.members : [type];
  const explicitUndefined = members.some(isUndefinedType);
  // The finite values are the literals the type lists; an explicit `| undefined` is flagged beside them, not among them.
  const listed = members.filter((arm) => !isUndefinedType(arm));
  const values = listed.length === 0 ? null : valuesOf(listed.length === 1 ? listed[0] : { kind: 'union', members: listed }, types);
  const refs = refList(type);
  const never = type.kind === 'keyword' && type.name === 'never';
  return {
    ...base,
    ...(never && { never: true }),
    ...(explicitUndefined && { explicitUndefined: true }),
    type: printType(type),
    ...(values !== null && { values }),
    ...(refs.length > 0 && { refs }),
    ...doc,
  };
}

const modelNative = (native) => {
  const refs = refList(native.type);
  return { type: printType(native.type), ...(native.omit.length > 0 && { omit: native.omit }), ...(refs.length > 0 && { refs }) };
};

const modelRef = (ref) => {
  if (ref === undefined) return null;
  if (ref.never) return { never: true };
  const refs = refList(ref.type);
  return { type: printType(ref.type), ...(refs.length > 0 && { refs }) };
};

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function modelTypeParameters(typeParameters) {
  if (typeParameters === undefined) return undefined;
  return typeParameters.map((parameter) => {
    const refs = refList([parameter.constraint, parameter.default].filter(Boolean));
    return {
      name: parameter.name,
      ...(parameter.constraint && { constraint: printType(parameter.constraint) }),
      ...(parameter.default && { default: printType(parameter.default) }),
      ...(refs.length > 0 && { refs }),
    };
  });
}

/**
 * Factors arms into the model: the members, natives and ref every alternative shares, once, and per
 * alternative only what differs. A member that is declared in some alternatives and not in others is
 * listed in the alternatives that declare it, so "not declared" stays distinct from a declared `never`.
 */
export function modelProps(arms, types) {
  const members = arms.map((arm) => arm.members);
  const finals = members.map((map) => new Map([...map].map(([name, member]) => [name, modelMember(member, types)])));
  // A member the arms declare identically is shared, whatever their comments say: two arms may differ in
  // comment only. Its comment is the first arm's that has one. An alternative's own members keep their own
  // comment or none; a comment is never carried from one declaration to another that has none.
  const bare = (member) => ({ ...member, doc: undefined });
  const names = [...finals[0].keys()];
  const common = names.filter((name) => finals.every((map) => map.has(name) && sameJson(bare(map.get(name)), bare(finals[0].get(name)))));
  const sharedDoc = (name) => finals.map((map) => map.get(name).doc).find((text) => text !== undefined);
  const shared = (name) => {
    const text = sharedDoc(name);
    const { doc, ...member } = finals[0].get(name);
    return text === undefined ? member : { ...member, doc: text };
  };
  const result = { members: common.map(shared) };

  const refs = arms.map((arm) => modelRef(arm.ref));
  const uniformRef = refs.every((ref) => sameJson(ref, refs[0]));
  if (uniformRef) result.ref = refs[0];
  const natives = arms.map((arm) => arm.natives.map(modelNative));
  const uniformNatives = natives.every((list) => sameJson(list, natives[0]));
  if (uniformNatives && natives[0].length > 0) result.natives = natives[0];

  if (arms.length > 1) {
    result.alternatives = arms.map((arm, index) => ({
      ...(uniformRef ? {} : { ref: refs[index] }),
      ...(uniformNatives ? {} : { natives: natives[index] }),
      members: [...finals[index].keys()].filter((name) => !common.includes(name)).map((name) => finals[index].get(name)),
    }));
  }
  return result;
}

export function createComponentReader({ types, values }) {
  const { expand } = createExpander(types);

  /** @returns {{ callable: object | null, statics: { name: string, type: object }[] }} */
  function readShape(type, chain, stack = []) {
    switch (type.kind) {
      case 'host': {
        const form = FORMS.get(type.name);
        if (form === undefined) throw unsupported(chain, `${type.name} is not a component type the reader knows`);
        if (type.typeArguments?.length !== 1) throw unsupported(chain, `${type.name} without exactly one type argument`);
        return { callable: { form, props: type.typeArguments[0] }, statics: [] };
      }
      case 'function': return { callable: callableOfSignature(type, 'function', chain), statics: [] };
      case 'reference': {
        const declaration = types.get(type.id);
        if (stack.includes(type.id)) throw new ReferenceReadError('CYCLE', chain, [...stack, type.id].join(' -> '));
        const env = bindTypeParameters(declaration, type.typeArguments, chain);
        if (declaration.kind === 'alias') return readShape(substitute(declaration.type, env), declaration.id, [...stack, type.id]);
        if ((declaration.extends ?? []).length > 0) throw unsupported(declaration.id, 'a component interface that extends another type');
        return readShape({ kind: 'object', members: substitute(declaration.members, env) }, declaration.id, [...stack, type.id]);
      }
      case 'intersection': {
        const shapes = type.members.map((member) => readShape(member, chain, stack));
        const callables = shapes.filter((shape) => shape.callable !== null);
        if (callables.length > 1) throw unsupported(chain, 'an intersection of several components');
        const statics = shapes.flatMap((shape) => shape.statics);
        const duplicate = statics.find(({ name }, index) => statics.findIndex((other) => other.name === name) !== index);
        if (duplicate) throw unsupported(chain, `the part ${duplicate.name} is declared twice`);
        return { callable: callables[0]?.callable ?? null, statics };
      }
      case 'object': {
        const calls = type.members.filter((member) => member.member === 'call');
        if (calls.length > 1) throw new ReferenceReadError('OVERLOAD', chain, `${calls.length} call signatures`);
        const statics = type.members.filter((member) => member.member !== 'call').map((member) => {
          if (member.member === 'property') return { name: member.name, type: member.type };
          if (member.member === 'method') return { name: member.name, type: { kind: 'function', typeParameters: member.typeParameters, parameters: member.parameters, returnType: member.returnType } };
          throw unsupported(chain, `a ${member.member} member among the parts`);
        });
        return { callable: calls[0] ? callableOfSignature(calls[0], 'call', chain) : null, statics };
      }
      default: throw unsupported(chain, `a ${type.kind} type where a component is declared`);
    }
  }

  function callableOfSignature(signature, form, chain) {
    if (signature.parameters.length !== 1 || signature.parameters[0].optional || signature.parameters[0].rest) {
      throw unsupported(chain, `a ${form === 'call' ? 'call signature' : 'function'} of ${signature.parameters.length} parameters as a component; a component takes one props parameter`);
    }
    return { form, props: signature.parameters[0].type, ...(signature.typeParameters && { typeParameters: signature.typeParameters }) };
  }

  /** One part of a component: its props model, or, when it is `typeof` another export, which. */
  function modelPart(member, callable, chain) {
    const arms = expand(callable.props, chain);
    const typeParameters = modelTypeParameters(callable.typeParameters);
    return {
      member,
      form: callable.form,
      ...(typeParameters && { typeParameters }),
      ...modelProps(arms, types),
    };
  }

  /** The parts of a value export that is a component, or null when it is not one. */
  function componentParts(valueDeclaration) {
    const chain = valueDeclaration.id;
    if (valueDeclaration.kind === 'function') {
      return isComponentFunction(valueDeclaration)
        ? [modelPart(null, callableOfSignature(valueDeclaration, 'function', chain), chain)]
        : null;
    }
    if (valueDeclaration.kind !== 'const') return null;
    let shape;
    try {
      shape = readShape(valueDeclaration.type, chain);
    } catch (error) {
      if (error.code === 'MUXUI_REACT_REFERENCE_UNSUPPORTED' && !isComponentLike(valueDeclaration.type, types)) return null;
      throw error;
    }
    if (shape.callable === null && shape.statics.length === 0) return null;
    const parts = [];
    if (shape.callable !== null) parts.push(modelPart(null, shape.callable, chain));
    for (const part of shape.statics) {
      if (part.type.kind === 'typeof') {
        parts.push({ member: part.name, sameAs: part.type.name });
        continue;
      }
      // `Root: TextEditorComponent` inside `TextEditorComponent` itself: the part is the component that holds it.
      if (part.type.kind === 'reference' && JSON.stringify(part.type) === JSON.stringify(valueDeclaration.type)) {
        parts.push({ member: part.name, sameAs: valueDeclaration.name });
        continue;
      }
      const inner = readShape(part.type, `${chain}.${part.name}`);
      if (inner.callable === null || inner.statics.length > 0) throw unsupported(`${chain}.${part.name}`, 'a part that is not a single component');
      parts.push(modelPart(part.name, inner.callable, `${chain}.${part.name}`));
    }
    return parts;
  }

  return { componentParts };
}

/** A function declaration is a component when it takes one parameter and returns an element or null. */
function isComponentFunction(declaration) {
  const returned = declaration.returnType;
  const members = returned.kind === 'union' ? returned.members : [returned];
  const element = members.filter((member) => member.kind === 'host' && member.name === 'React.ReactElement');
  const others = members.filter((member) => !(member.kind === 'host' && member.name === 'React.ReactElement'));
  return declaration.parameters.length === 1 && element.length === 1 && others.every((member) => member.kind === 'literal' && member.value === null);
}

/** Whether a constant's type is built from component types, so a failure to read it is an error and not "not a component". */
function isComponentLike(type, types, seen = new Set()) {
  switch (type.kind) {
    case 'host': return FORMS.has(type.name);
    case 'function': return type.parameters.length === 1;
    case 'intersection': case 'union': return type.members.some((member) => isComponentLike(member, types, seen));
    case 'object': return type.members.some((member) => member.member === 'call' || (member.member === 'property' && isComponentLike(member.type, types, seen)));
    case 'reference': {
      if (seen.has(type.id)) return false;
      seen.add(type.id);
      const declaration = types.get(type.id);
      return declaration?.kind === 'alias' ? isComponentLike(declaration.type, types, seen) : (declaration?.members ?? []).some((member) => member.member === 'call');
    }
    default: return false;
  }
}
