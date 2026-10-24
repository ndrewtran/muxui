/**
 * Pass 1: the declaration graph. A syntax-driven read of what the shipped declarations say, in the order
 * they say it. The compiler is asked one question only: which declaration does this name resolve to, and
 * does it belong to the package, to React, or to the default library. It is never asked to print a type
 * or to list properties, because its printer reorders literal unions between versions and drops the
 * written `never` of an optional member.
 *
 * The graph holds, for each entry point of the package, the names a consumer can import, and every
 * declaration those names reach: interfaces and type aliases as `types`, functions and constants as
 * `values`. Each is a plain JSON tree (see `TypeNode`). Nothing here depends on the compiler host, the
 * absolute location of the files, or the order the host happens to enumerate anything in.
 *
 * Anything the reader has no exact reading of fails with a named `ReferenceReadError`: a conditional or
 * template type, an overload, a merged declaration, a name that resolves outside the package, React and
 * the default library. It is never read as opaque text.
 *
 * @typedef {{ kind: 'keyword', name: string }
 *   | { kind: 'literal', value: string | number | boolean | null }
 *   | { kind: 'reference', id: string, name: string, typeArguments?: TypeNode[] }
 *   | { kind: 'parameter', name: string }
 *   | { kind: 'host', name: string, origin: 'react' | 'library', typeArguments?: TypeNode[] }
 *   | { kind: 'union' | 'intersection', members: TypeNode[] }
 *   | { kind: 'array', element: TypeNode }
 *   | { kind: 'tuple', elements: { type: TypeNode, name?: string, optional?: true, rest?: true }[] }
 *   | { kind: 'readonly' | 'keyof', type: TypeNode }
 *   | { kind: 'indexed', object: TypeNode, index: TypeNode }
 *   | { kind: 'typeof', id: string, name: string }
 *   | { kind: 'object', members: Member[] }
 *   | { kind: 'function' } & Signature
 *   | { kind: 'predicate', parameter: string, asserts?: true, type?: TypeNode }
 *   | { kind: 'mapped', parameter: string, constraint: TypeNode, nameType?: TypeNode, optional?: string, readonly?: string, type: TypeNode }} TypeNode
 *
 * @typedef {{ typeParameters?: TypeParameter[], parameters: Parameter[], returnType: TypeNode }} Signature
 * @typedef {{ name: string, constraint?: TypeNode, default?: TypeNode }} TypeParameter
 * @typedef {{ name: string, type: TypeNode, optional?: true, rest?: true }} Parameter
 * @typedef {({ member: 'property', name: string, optional: boolean, readonly: boolean, type: TypeNode }
 *   | ({ member: 'method', name: string, optional: boolean } & Signature)
 *   | ({ member: 'call' } & Signature)
 *   | { member: 'index', parameter: { name: string, type: TypeNode }, readonly: boolean, type: TypeNode }) & { doc?: string }} Member
 */
import { ReferenceReadError } from './errors.mjs';

const KEYWORDS = new Map([
  ['StringKeyword', 'string'], ['NumberKeyword', 'number'], ['BooleanKeyword', 'boolean'], ['BigIntKeyword', 'bigint'],
  ['SymbolKeyword', 'symbol'], ['ObjectKeyword', 'object'], ['VoidKeyword', 'void'], ['UndefinedKeyword', 'undefined'],
  ['NullKeyword', 'null'], ['NeverKeyword', 'never'], ['UnknownKeyword', 'unknown'], ['AnyKeyword', 'any'],
]);

const TYPE_DECLARATIONS = new Set(['InterfaceDeclaration', 'TypeAliasDeclaration']);
const VALUE_DECLARATIONS = new Set(['FunctionDeclaration', 'VariableDeclaration']);

/** The module a declaration file is, by its name: `resizable` for `.../generated/resizable.d.ts`. */
export const moduleOf = (path) => path.slice(path.lastIndexOf('/') + 1).replace(/\.d\.ts$/u, '');

/**
 * @param {import('./host.mjs').Session} session
 * @param {readonly { key: string, path: string }[]} entries The typed entry points of the package.
 */
export function readGraph(session, entries) {
  const diagnostics = session.diagnostics();
  if (diagnostics.length > 0) {
    throw new ReferenceReadError('DIAGNOSTICS', 'program', `${diagnostics.length} diagnostics, first: ${diagnostics[0]}`);
  }

  const types = new Map();
  const values = new Map();
  const pending = [];
  const fail = (code, chain, message) => new ReferenceReadError(code, chain, message);
  const unsupported = (chain, message) => fail('UNSUPPORTED', chain, message);
  // A kind the host does not name comes back as `?Name`.
  const kindName = (node) => session.kind(node).replace(/^\?/u, '');

  // A type is `module#Name`. A value is `module#Name:value`, because a type and a value can share a name
  // (`interface X` beside `declare const X`) and each must stay one declaration with its own identity.
  const idOf = (node, name, value) => `${moduleOf(session.fileOf(node).replaceAll('\\', '/'))}#${name}${value ? ':value' : ''}`;

  // ---- names -------------------------------------------------------------------------------------

  function entityText(node, chain) {
    switch (session.kind(node)) {
      case 'Identifier': return node.text;
      case 'QualifiedName': return `${entityText(node.left, chain)}.${node.right.text}`;
      case 'PropertyAccessExpression': return `${entityText(node.expression, chain)}.${node.name.text}`;
      default: throw unsupported(chain, `a name written as ${kindName(node)}; a reference is an identifier or a qualified name`);
    }
  }

  function memberName(node, chain) {
    switch (session.kind(node)) {
      case 'Identifier': case 'StringLiteral': case 'NumericLiteral': return node.text;
      default: throw unsupported(chain, `a member named by ${kindName(node)}; a name is an identifier or a literal`);
    }
  }

  // ---- references --------------------------------------------------------------------------------

  /**
   * The type a bare same-name alias stands for. `type X = Y`, where `Y` is another module's `X` imported under a
   * second name, adds nothing: it is that `X`, and the package spells it twice only because a declaration file
   * cannot import and declare one name. Read as two declarations, the model would hold two types called `X`, and
   * its printed text would read `type X = X`. Any other alias (another name, type arguments or parameters, a body
   * that is more than the reference) is a declaration of its own and stays one, and so is one whose target is generic,
   * with defaults or without: `type X = Renamed` fixes `Renamed<T = string>` to its default, which `X<T = string>`
   * would not say.
   */
  function sameNameAliasTarget(declaration) {
    const seen = new Set();
    let current = declaration;
    while (!seen.has(current) && session.kind(current) === 'TypeAliasDeclaration' && (current.typeParameters ?? []).length === 0) {
      seen.add(current);
      const { type } = current;
      if (session.kind(type) !== 'TypeReference') break;
      const target = session.resolve(type.typeName);
      const aliased = target.declarations.filter((candidate) => TYPE_DECLARATIONS.has(session.kind(candidate)));
      if (target.kind !== 'declared' || target.origin !== 'package' || target.name !== current.name.text || aliased.length !== 1) break;
      // A generic target (with defaults or without) is never collapsed. That also covers a reference with type arguments,
      // which only a generic type accepts.
      if ((aliased[0].typeParameters ?? []).length > 0) break;
      [current] = aliased;
    }
    return current;
  }

  /** A reference to a package declaration, queued to be read once. */
  function packageReference(resolved, written, chain, meanings) {
    const wanted = resolved.declarations.filter((declaration) => meanings.has(session.kind(declaration)));
    if (wanted.length === 0) {
      const found = resolved.declarations.map((declaration) => session.kind(declaration)).join(', ');
      throw unsupported(chain, `${written} resolves to ${found}, not ${[...meanings].join(' or ')}`);
    }
    if (wanted.length > 1) throw fail('MERGED', chain, `${written} has ${wanted.length} declarations; a Mux UI type has one`);
    const declaration = meanings === TYPE_DECLARATIONS ? sameNameAliasTarget(wanted[0]) : wanted[0];
    const id = idOf(declaration, resolved.name, meanings === VALUE_DECLARATIONS);
    if (!types.has(id) && !values.has(id) && !pending.some((entry) => entry.id === id)) pending.push({ id, declaration });
    return { id, name: resolved.name };
  }

  function hostName(resolved, written, chain) {
    const segments = written.split('.');
    if (resolved.origin === 'react') {
      // @types/react's own namespace: `React.Name`, however the file imported it.
      if (segments.length > 2 || (segments.length === 2 && segments[0] !== 'React')) {
        throw unsupported(chain, `${written} names a nested or renamed React namespace; write React.${resolved.name}`);
      }
      return `React.${resolved.name}`;
    }
    return written;
  }

  /** Resolves an entity name to a graph reference: a package type, a type parameter, or a host type. */
  function readReference(entity, typeArguments, chain) {
    const written = entityText(entity, chain);
    const resolved = session.resolve(entity);
    if (resolved.kind === 'unresolved') throw fail('DIAGNOSTICS', chain, `${written} does not resolve`);
    const args = typeArguments === undefined ? undefined : typeArguments.map((argument) => readType(argument, chain));
    if (resolved.kind === 'typeParameter') {
      if (args !== undefined) throw unsupported(chain, `${written} is a type parameter with type arguments`);
      return { kind: 'parameter', name: resolved.name };
    }
    if (resolved.origin === 'package') {
      const { id, name } = packageReference(resolved, written, chain, TYPE_DECLARATIONS);
      return { kind: 'reference', id, name, ...(args && { typeArguments: args }) };
    }
    if (resolved.origin === 'react' || resolved.origin === 'library') {
      return { kind: 'host', name: hostName(resolved, written, chain), origin: resolved.origin, ...(args && { typeArguments: args }) };
    }
    throw fail('ORIGIN', chain, `${written} resolves outside the package, React and the default library`);
  }

  // ---- types -------------------------------------------------------------------------------------

  function flatten(kind, members) {
    return members.flatMap((member) => (member.kind === kind ? member.members : [member]));
  }

  function readTypeParameters(nodes, chain) {
    if (nodes === undefined || nodes.length === 0) return undefined;
    return nodes.map((node) => {
      if ((node.modifiers ?? []).length > 0) throw unsupported(chain, `the type parameter ${node.name.text} has a modifier (const, in, out)`);
      const fallback = session.defaultOf(node);
      return {
        name: node.name.text,
        ...(node.constraint && { constraint: readType(node.constraint, chain) }),
        ...(fallback && { default: readType(fallback, chain) }),
      };
    });
  }

  function parameterName(node, index, count, chain) {
    switch (session.kind(node.name)) {
      case 'Identifier': return node.name.text;
      // A destructured parameter is an emit artifact of the implementation; its caller sees one props object.
      case 'ObjectBindingPattern': case 'ArrayBindingPattern': return count === 1 ? 'props' : `argument${index}`;
      default: throw unsupported(chain, `a parameter named by ${kindName(node.name)}`);
    }
  }

  function readParameters(nodes, chain) {
    return nodes.map((node, index) => {
      if (node.type === undefined) throw unsupported(chain, `the parameter ${parameterName(node, index, nodes.length, chain)} has no type`);
      if (node.initializer !== undefined) throw unsupported(chain, 'a parameter with an initializer');
      const optional = session.optional(node);
      const rest = node.dotDotDotToken !== undefined;
      return {
        name: parameterName(node, index, nodes.length, chain),
        type: readType(node.type, chain),
        ...(optional && { optional: true }),
        ...(rest && { rest: true }),
      };
    });
  }

  function readReturnType(node, chain) {
    if (node.type === undefined) throw unsupported(chain, 'a signature without a return type');
    if (session.kind(node.type) === 'TypePredicate') {
      const predicate = node.type;
      if (session.kind(predicate.parameterName) === 'ThisType') throw unsupported(chain, 'a `this` type predicate');
      return {
        kind: 'predicate',
        parameter: predicate.parameterName.text,
        ...(predicate.assertsModifier && { asserts: true }),
        ...(predicate.type && { type: readType(predicate.type, chain) }),
      };
    }
    return readType(node.type, chain);
  }

  function readSignature(node, chain) {
    const typeParameters = readTypeParameters(node.typeParameters, chain);
    return {
      ...(typeParameters && { typeParameters }),
      parameters: readParameters(node.parameters, chain),
      returnType: readReturnType(node, chain),
    };
  }

  function readMember(node, chain) {
    const doc = session.doc(node);
    switch (session.kind(node)) {
      case 'PropertySignature': {
        const name = memberName(node.name, chain);
        if (node.type === undefined) throw unsupported(`${chain}.${name}`, 'a property without a type');
        return {
          member: 'property', name, optional: session.optional(node), readonly: session.hasModifier(node, 'readonly'),
          type: readType(node.type, `${chain}.${name}`), ...(doc && { doc }),
        };
      }
      case 'MethodSignature': {
        const name = memberName(node.name, chain);
        return { member: 'method', name, optional: session.optional(node), ...readSignature(node, `${chain}.${name}`), ...(doc && { doc }) };
      }
      case 'CallSignature':
        return { member: 'call', ...readSignature(node, `${chain}.<call>`), ...(doc && { doc }) };
      case 'IndexSignature': {
        if (node.parameters.length !== 1 || node.parameters[0].type === undefined || node.type === undefined) {
          throw unsupported(chain, 'an index signature that is not `[key: Key]: Value`');
        }
        const [parameter] = node.parameters;
        return {
          member: 'index', parameter: { name: parameter.name.text, type: readType(parameter.type, chain) },
          readonly: session.hasModifier(node, 'readonly'), type: readType(node.type, chain), ...(doc && { doc }),
        };
      }
      default:
        throw unsupported(chain, `a ${kindName(node)} member; a member is a property, a method, a call signature or an index signature`);
    }
  }

  function readTupleElement(node, chain) {
    switch (session.kind(node)) {
      case 'OptionalType': return { type: readType(node.type, chain), optional: true };
      case 'RestType': return { type: readType(node.type, chain), rest: true };
      case 'NamedTupleMember':
        return {
          name: node.name.text, type: readType(node.type, chain),
          ...(node.questionToken && { optional: true }), ...(node.dotDotDotToken && { rest: true }),
        };
      default: return { type: readType(node, chain) };
    }
  }

  /** @returns {TypeNode} */
  function readType(node, chain) {
    const kind = session.kind(node);
    if (KEYWORDS.has(kind)) return { kind: 'keyword', name: KEYWORDS.get(kind) };
    switch (kind) {
      case 'ParenthesizedType': return readType(node.type, chain);
      case 'LiteralType': {
        const literal = session.literalOf(node.literal);
        if (literal === undefined) throw unsupported(chain, `a ${kindName(node.literal)} literal type`);
        return { kind: 'literal', value: literal.value };
      }
      case 'TypeReference': return readReference(node.typeName, node.typeArguments, chain);
      case 'UnionType': return { kind: 'union', members: flatten('union', node.types.map((member) => readType(member, chain))) };
      case 'IntersectionType': return { kind: 'intersection', members: flatten('intersection', node.types.map((member) => readType(member, chain))) };
      case 'ArrayType': return { kind: 'array', element: readType(node.elementType, chain) };
      case 'TupleType': return { kind: 'tuple', elements: node.elements.map((element) => readTupleElement(element, chain)) };
      case 'TypeOperator': {
        const operator = session.operator(node);
        if (operator !== 'readonly' && operator !== 'keyof') throw unsupported(chain, `the ${operator ?? 'unknown'} type operator`);
        return { kind: operator, type: readType(node.type, chain) };
      }
      case 'IndexedAccessType': return { kind: 'indexed', object: readType(node.objectType, chain), index: readType(node.indexType, chain) };
      case 'TypeQuery': {
        if (node.typeArguments !== undefined) throw unsupported(chain, 'typeof with type arguments');
        const written = entityText(node.exprName, chain);
        const resolved = session.resolve(node.exprName);
        if (resolved.kind !== 'declared' || resolved.origin !== 'package') throw fail('ORIGIN', chain, `typeof ${written} does not name a value of the package`);
        const { id, name } = packageReference(resolved, written, chain, VALUE_DECLARATIONS);
        return { kind: 'typeof', id, name };
      }
      case 'TypeLiteral': return { kind: 'object', members: node.members.map((member) => readMember(member, chain)) };
      case 'FunctionType': return { kind: 'function', ...readSignature(node, chain) };
      case 'MappedType': {
        const parameter = node.typeParameter;
        if (parameter.constraint === undefined) throw unsupported(chain, 'a mapped type without a key constraint');
        const modifier = (token) => (token === undefined ? undefined : (session.kind(token) === 'QuestionToken' ? '?' : session.kind(token) === 'ReadonlyKeyword' ? 'readonly' : `${session.kind(token) === 'PlusToken' ? '+' : '-'}`));
        const optional = modifier(node.questionToken);
        const readonly = modifier(node.readonlyToken);
        return {
          kind: 'mapped',
          parameter: parameter.name.text,
          constraint: readType(parameter.constraint, chain),
          ...(node.nameType && { nameType: readType(node.nameType, chain) }),
          ...(optional && { optional }),
          ...(readonly && { readonly }),
          type: node.type === undefined ? { kind: 'keyword', name: 'any' } : readType(node.type, chain),
        };
      }
      default:
        throw unsupported(chain, `a ${kind.replace(/^\?/u, '')} type`);
    }
  }

  // ---- declarations ------------------------------------------------------------------------------

  function readHeritage(node, chain) {
    return (node.heritageClauses ?? []).flatMap((clause) => {
      if (session.kind(clause) !== 'HeritageClause') return [];
      return clause.types.map((base) => readReference(base.expression, base.typeArguments, chain));
    });
  }

  function readTypeDeclaration(id, declaration) {
    const name = declaration.name.text;
    const chain = id;
    const base = { id, module: moduleOf(session.fileOf(declaration).replaceAll('\\', '/')), name };
    const typeParameters = readTypeParameters(declaration.typeParameters, chain);
    const doc = session.doc(declaration);
    if (session.kind(declaration) === 'InterfaceDeclaration') {
      const extend = readHeritage(declaration, chain);
      return {
        ...base, kind: 'interface', ...(typeParameters && { typeParameters }), ...(extend.length > 0 && { extends: extend }),
        members: declaration.members.map((member) => readMember(member, chain)), ...(doc && { doc }),
      };
    }
    return { ...base, kind: 'alias', ...(typeParameters && { typeParameters }), type: readType(declaration.type, chain), ...(doc && { doc }) };
  }

  function readValueDeclaration(id, declaration) {
    const name = declaration.name.text;
    const base = { id, module: moduleOf(session.fileOf(declaration).replaceAll('\\', '/')), name };
    const doc = session.doc(declaration);
    if (session.kind(declaration) === 'FunctionDeclaration') {
      return { ...base, kind: 'function', ...readSignature(declaration, id), ...(doc && { doc }) };
    }
    if (declaration.type === undefined) throw unsupported(id, 'a constant without a type annotation');
    if (declaration.initializer !== undefined) throw unsupported(id, 'a constant with an initializer');
    return { ...base, kind: 'const', type: readType(declaration.type, id), ...(doc && { doc }) };
  }

  function drain() {
    while (pending.length > 0) {
      const { id, declaration } = pending.shift();
      if (types.has(id) || values.has(id)) continue;
      if (TYPE_DECLARATIONS.has(session.kind(declaration))) types.set(id, readTypeDeclaration(id, declaration));
      else values.set(id, readValueDeclaration(id, declaration));
    }
  }

  // ---- entry points ------------------------------------------------------------------------------

  const graphEntries = entries.map(({ key, path }) => {
    const exported = session.exportsOf(path).map(({ name, resolved }) => {
      const chain = `${key} export ${name}`;
      if (resolved.kind === 'unresolved') throw fail('DIAGNOSTICS', chain, 'the export does not resolve');
      if (resolved.origin !== 'package') throw fail('ORIGIN', chain, 'the export resolves outside the package');
      const kinds = resolved.declarations.map((declaration) => session.kind(declaration));
      const typeDeclarations = resolved.declarations.filter((declaration) => TYPE_DECLARATIONS.has(session.kind(declaration)));
      const valueDeclarations = resolved.declarations.filter((declaration) => VALUE_DECLARATIONS.has(session.kind(declaration)));
      const other = kinds.filter((kind) => !TYPE_DECLARATIONS.has(kind) && !VALUE_DECLARATIONS.has(kind));
      if (other.length > 0) throw unsupported(chain, `a ${other[0].replace(/^\?/u, '')} export; an export is an interface, a type alias, a function or a constant`);
      if (typeDeclarations.length > 1) throw fail('MERGED', chain, `${typeDeclarations.length} type declarations merge into one export`);
      if (valueDeclarations.length > 1) {
        const overloaded = valueDeclarations.every((declaration) => session.kind(declaration) === 'FunctionDeclaration');
        throw fail(overloaded ? 'OVERLOAD' : 'MERGED', chain, `${valueDeclarations.length} value declarations share the export`);
      }
      const entry = { name };
      if (typeDeclarations[0]) entry.type = packageReference({ ...resolved, name: resolved.name }, name, chain, TYPE_DECLARATIONS).id;
      if (valueDeclarations[0]) entry.value = packageReference({ ...resolved, name: resolved.name }, name, chain, VALUE_DECLARATIONS).id;
      if (resolved.name !== name) entry.alias = resolved.name;
      return entry;
    });
    drain();
    return { key, exports: exported.sort((left, right) => (left.name < right.name ? -1 : 1)) };
  });

  const byId = (left, right) => (left.id < right.id ? -1 : 1);
  return {
    entries: graphEntries,
    types: [...types.values()].sort(byId),
    values: [...values.values()].sort(byId),
  };
}
