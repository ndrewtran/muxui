/**
 * Decision 0031 item 3: the web.react API block of a moved component is derived from
 * its TypeScript source. The props type is `<Name>Props = <Name>OwnProps & <host
 * passthrough>`. Extraction starts from the exported component's first parameter type
 * and takes the members `<Name>OwnProps` declares, so the public type may not redeclare
 * one differently. Types come from the emitted declarations through the pinned
 * TypeScript 7 compiler API and a closed grammar; defaults come from the executable
 * source. Anything the grammar does not admit fails extraction with the component, the
 * prop, and the reference chain that reached it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeFlags, SyntaxKind, getTextOfJSDocComment, isAssignmentOperator } from 'typescript/unstable/ast';
import { API, SignatureKind, SymbolFlags } from 'typescript/unstable/sync';

export class ApiExtractionError extends Error {
  constructor(chain, message) {
    super(`MUXUI_REACT_API_EXTRACTION_INVALID: ${chain}: ${message}`);
    this.name = 'ApiExtractionError';
    this.code = 'MUXUI_REACT_API_EXTRACTION_INVALID';
    this.chain = chain;
  }
}

/**
 * The host types a Mux UI-owned prop may reach, each one exact type: a DOM library
 * name, or `React.<Name>` from @types/react. It grows per tranche, only by what a moved
 * component needs: HTMLButtonElement for Button's and IconButton's activation target,
 * and React.ReactNode for the content props of SelectNative, Message, and Activity.
 */
export const HOST_ALLOWLIST = Object.freeze(['HTMLButtonElement', 'React.ReactNode']);

// A namespace or wildcard would admit every type under it.
const EXACT_HOST_TYPE = /^(?:React\.)?[A-Z][A-Za-z0-9]*$/u;
const NAMESPACES = new Set(['React', 'JSX', 'globalThis']);

const KEYWORDS = new Map([
  [SyntaxKind.StringKeyword, 'string'],
  [SyntaxKind.NumberKeyword, 'number'],
  [SyntaxKind.BooleanKeyword, 'boolean'],
  [SyntaxKind.VoidKeyword, 'void'],
  [SyntaxKind.UndefinedKeyword, 'undefined'],
]);

// How a rejected type node reads in the diagnostic.
const REJECTED = new Map([
  [SyntaxKind.AnyKeyword, 'any'],
  [SyntaxKind.UnknownKeyword, 'unknown'],
  [SyntaxKind.NeverKeyword, 'never'],
  [SyntaxKind.ObjectKeyword, 'object'],
  [SyntaxKind.SymbolKeyword, 'symbol'],
  [SyntaxKind.BigIntKeyword, 'bigint'],
  [SyntaxKind.ConditionalType, 'a conditional type'],
  [SyntaxKind.MappedType, 'a mapped type'],
  [SyntaxKind.IndexedAccessType, 'an indexed access type'],
  [SyntaxKind.TemplateLiteralType, 'a template literal type'],
  [SyntaxKind.TypeQuery, 'a typeof type'],
  [SyntaxKind.IntersectionType, 'an intersection type'],
  [SyntaxKind.TupleType, 'a tuple type'],
  [SyntaxKind.ImportType, 'an import type'],
  [SyntaxKind.ConstructorType, 'a constructor type'],
  [SyntaxKind.ThisType, 'this'],
  [SyntaxKind.TypePredicate, 'a type predicate'],
  [SyntaxKind.InferType, 'an infer type'],
]);

const isUnder = (path, root) => path.toLowerCase().startsWith(`${root.toLowerCase().replace(/\/+$/u, '')}/`);
const hasModifier = (node, kind) => (node.modifiers ?? []).some((modifier) => modifier.kind === kind);

function description(node) {
  const text = getTextOfJSDocComment(node.jsDoc?.at(-1)?.comment)?.trim();
  return text ? { description: text } : {};
}

function propertyName(node, chain) {
  if (node.kind === SyntaxKind.Identifier || node.kind === SyntaxKind.StringLiteral) return node.text;
  throw new ApiExtractionError(chain, 'a computed property name is not in the grammar');
}

/** Validates the host allowlist: each entry names one exact type. */
export function assertHostAllowlist(hostAllowlist) {
  for (const entry of hostAllowlist) {
    if (typeof entry !== 'string' || !EXACT_HOST_TYPE.test(entry) || NAMESPACES.has(entry)) {
      throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} is too broad: an entry names one exact type, such as HTMLButtonElement or React.ReactNode`);
    }
  }
  return new Set(hostAllowlist);
}

// One TypeScript 7 API session over a throwaway project: the declarations to read and,
// for defaults, the sources to parse. Module resolution starts from each file, so the
// project file itself can sit anywhere.
function withProject(files, run) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-api-extraction-'));
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, `${JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      types: [],
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowImportingTsExtensions: true,
    },
    files,
  })}\n`);
  const api = new API({ cwd: directory });
  try {
    return run(api.updateSnapshot({ openProjects: [config] }).getProject(config));
  } finally {
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function isDefaultLibrary(program, path) {
  const file = program.getSourceFile(path);
  return file !== undefined && program.isSourceFileDefaultLibrary(file);
}

function declarationReader({ project, declarationRoot, allowed }) {
  const { checker, program } = project;
  // Named types by name, each with the symbol it was read from. A type being read (a
  // recursive reference) is pending, also by symbol: a name alone would let another
  // module's same-named type pass as the recursion.
  const types = new Map();
  const pending = new Map();

  // Where a referenced symbol is declared decides what it may be: Mux UI-owned when every
  // declaration is in the package's declarations, a host type when it comes from the DOM
  // library (which @types/react may augment) or from @types/react.
  function hostName(symbol) {
    const paths = symbol.declarations.map(({ path }) => path);
    if (paths.some((path) => isDefaultLibrary(program, path))) return symbol.name;
    if (paths.length > 0 && paths.every((path) => /\/node_modules\/@types\/react\//u.test(path))) return `React.${symbol.name}`;
    return null;
  }

  function namedType(symbol, chain) {
    const name = symbol.name;
    const owner = types.get(name)?.symbol ?? pending.get(name);
    if (owner !== undefined && owner !== symbol.id) {
      throw new ApiExtractionError(chain, `two Mux UI-owned types are named ${name}`);
    }
    if (owner !== undefined) return { kind: 'reference', name };
    if (symbol.declarations.length !== 1) throw new ApiExtractionError(chain, `${name} has ${symbol.declarations.length} declarations; a Mux UI-owned type has one`);
    const declaration = symbol.declarations[0].resolve(project);
    pending.set(name, symbol.id);
    let type;
    if (declaration.kind === SyntaxKind.InterfaceDeclaration) {
      if (declaration.typeParameters?.length) throw new ApiExtractionError(chain, `${name} is generic`);
      if (declaration.heritageClauses?.length) throw new ApiExtractionError(chain, `${name} extends another type; list its members instead`);
      type = objectOf(declaration.members, chain);
    } else if (declaration.kind === SyntaxKind.TypeAliasDeclaration) {
      if (declaration.typeParameters?.length) throw new ApiExtractionError(chain, `${name} is generic`);
      type = typeOf(declaration.type, chain);
    } else if (declaration.kind === SyntaxKind.EnumDeclaration) {
      throw new ApiExtractionError(chain, `${name} is an enum; use a union of literals`);
    } else {
      throw new ApiExtractionError(chain, `${name} is not an interface or a type alias`);
    }
    pending.delete(name);
    types.set(name, { symbol: symbol.id, type, ...description(declaration) });
    return { kind: 'reference', name };
  }

  const entityName = (node) => (node.kind === SyntaxKind.QualifiedName ? `${entityName(node.left)}.${node.right.text}` : node.text);

  function referenceOf(node, chain) {
    const written = entityName(node.typeName);
    const hop = `${chain} -> ${written}`;
    if (node.typeArguments?.length) throw new ApiExtractionError(hop, 'generic type arguments are not in the grammar');
    const found = checker.getSymbolAtLocation(node.typeName);
    if (!found) throw new ApiExtractionError(hop, `${written} does not resolve`);
    const symbol = found.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found;
    if (symbol.flags & SymbolFlags.Enum) throw new ApiExtractionError(hop, `${written} is an enum; use a union of literals`);
    const paths = symbol.declarations.map(({ path }) => path);
    if (paths.length > 0 && paths.every((path) => isUnder(path, declarationRoot))) return namedType(symbol, hop);
    const host = hostName(symbol);
    if (host !== null && allowed.has(host)) return { kind: 'host', name: host };
    throw new ApiExtractionError(hop, `${host ?? written} is outside @muxui/react and not in the host allowlist`);
  }

  function literalOf(node, chain) {
    const { literal } = node;
    if (literal.kind === SyntaxKind.StringLiteral || literal.kind === SyntaxKind.NoSubstitutionTemplateLiteral) return { kind: 'literal', value: literal.text };
    if (literal.kind === SyntaxKind.NumericLiteral) return { kind: 'literal', value: Number(literal.text) };
    if (literal.kind === SyntaxKind.TrueKeyword || literal.kind === SyntaxKind.FalseKeyword) return { kind: 'literal', value: literal.kind === SyntaxKind.TrueKeyword };
    if (literal.kind === SyntaxKind.NullKeyword) return { kind: 'null' };
    if (literal.kind === SyntaxKind.PrefixUnaryExpression && literal.operator === SyntaxKind.MinusToken && literal.operand.kind === SyntaxKind.NumericLiteral) {
      return { kind: 'literal', value: -Number(literal.operand.text) };
    }
    throw new ApiExtractionError(chain, 'only string, number, and boolean literals are in the grammar');
  }

  function functionOf(node, chain) {
    if (node.typeParameters?.length) throw new ApiExtractionError(chain, 'a generic function is not in the grammar');
    const parameters = node.parameters.map((parameter) => {
      if (parameter.dotDotDotToken) throw new ApiExtractionError(chain, 'a rest parameter is not in the grammar');
      if (parameter.name.kind !== SyntaxKind.Identifier || !parameter.type) throw new ApiExtractionError(chain, 'each callback parameter needs a name and a type');
      const name = parameter.name.text;
      // The AST spells a `this` parameter as an ordinary parameter named this.
      if (name === 'this') throw new ApiExtractionError(`${chain}(this)`, 'a this parameter is not in the grammar');
      return { name, type: typeOf(parameter.type, `${chain}(${name})`), required: !parameter.questionToken };
    });
    return { kind: 'function', parameters, returns: typeOf(node.type, `${chain}=>`) };
  }

  /**
   * An object type whose one member is a string index signature, `{ readonly [key: string]:
   * T }`, is a record: string keys the caller chooses, each holding a T. It is the only
   * index signature in the grammar: beside other members, or keyed by anything but string,
   * one fails.
   */
  function recordOf(members, chain) {
    if (!members.some((member) => member.kind === SyntaxKind.IndexSignature)) return null;
    if (members.length !== 1) throw new ApiExtractionError(chain, 'an index signature is in the grammar only as the one member of its object type');
    const [signature] = members;
    const [key] = signature.parameters;
    if (signature.parameters.length !== 1 || key.type?.kind !== SyntaxKind.StringKeyword) {
      throw new ApiExtractionError(chain, 'an index signature takes one string key');
    }
    if (!signature.type) throw new ApiExtractionError(chain, 'an index signature needs a declared type');
    return { kind: 'record', value: typeOf(signature.type, `${chain}[string]`), readonly: hasModifier(signature, SyntaxKind.ReadonlyKeyword) };
  }

  const objectOf = (members, chain) => recordOf(members, chain)
    ?? { kind: 'object', members: members.map((member) => memberOf(member, `${chain}.`)) };

  function memberOf(member, prefix) {
    if (member.kind !== SyntaxKind.PropertySignature) {
      throw new ApiExtractionError(`${prefix}${member.name?.text ?? '<member>'}`, 'only property signatures are in the grammar');
    }
    const name = propertyName(member.name, `${prefix}<member>`);
    if (!member.type) throw new ApiExtractionError(`${prefix}${name}`, 'a member needs a declared type');
    // The TypeScript 7 AST names a member's ? its postfix token.
    const required = member.postfixToken?.kind !== SyntaxKind.QuestionToken;
    // `name?: never` is a member that must be absent, as in one arm of a union of object
    // types. It is the only place never is in the grammar.
    const absent = member.type.kind === SyntaxKind.NeverKeyword;
    if (absent && required) throw new ApiExtractionError(`${prefix}${name}`, 'never is in the grammar only as an optional member\'s type, a member that must be absent');
    return {
      name,
      type: absent ? { kind: 'never' } : typeOf(member.type, `${prefix}${name}`),
      required,
      readonly: hasModifier(member, SyntaxKind.ReadonlyKeyword),
      ...description(member),
    };
  }

  function typeOf(node, chain) {
    if (KEYWORDS.has(node.kind)) return { kind: KEYWORDS.get(node.kind) };
    switch (node.kind) {
      case SyntaxKind.LiteralType: return literalOf(node, chain);
      // Members keep their source order; the checker's own union order is not used.
      case SyntaxKind.UnionType: return { kind: 'union', members: node.types.map((member) => typeOf(member, chain)) };
      case SyntaxKind.ParenthesizedType: return typeOf(node.type, chain);
      case SyntaxKind.ArrayType: return { kind: 'array', element: typeOf(node.elementType, `${chain}[]`), readonly: false };
      case SyntaxKind.TypeOperator:
        if (node.operator === SyntaxKind.ReadonlyKeyword && node.type.kind === SyntaxKind.ArrayType) {
          return { kind: 'array', element: typeOf(node.type.elementType, `${chain}[]`), readonly: true };
        }
        throw new ApiExtractionError(chain, 'a type operator other than readonly T[] is not in the grammar');
      case SyntaxKind.FunctionType: return functionOf(node, chain);
      case SyntaxKind.TypeLiteral: return objectOf(node.members, chain);
      case SyntaxKind.TypeReference: return referenceOf(node, chain);
      default:
        throw new ApiExtractionError(chain, `${REJECTED.get(node.kind) ?? SyntaxKind[node.kind]} is not in the grammar`);
    }
  }

  return { memberOf, types };
}

const literalValues = (type, types) => {
  if (type.kind === 'literal') return [type.value];
  if (type.kind === 'reference') return literalValues(types[type.name].type, types);
  if (type.kind !== 'union') return null;
  const values = [];
  for (const member of type.members) {
    if (member.kind === 'undefined') continue;
    const nested = literalValues(member, types);
    if (nested === null) return null;
    values.push(...nested);
  }
  return values;
};

function exportedNamed(sourceFile, name) {
  let found = null;
  for (const statement of sourceFile.statements) {
    if (!hasModifier(statement, SyntaxKind.ExportKeyword)) continue;
    if (statement.kind === SyntaxKind.FunctionDeclaration && statement.name?.text === name) found ??= { name: statement.name, node: statement };
    if (statement.kind === SyntaxKind.VariableStatement) {
      const declaration = statement.declarationList.declarations.find((candidate) => candidate.name.kind === SyntaxKind.Identifier && candidate.name.text === name);
      if (declaration) found = { name: declaration.name, node: declaration };
    }
  }
  return found;
}

function ownPropsOf(checker, sourceFile, name) {
  const declaration = sourceFile.statements.find((statement) => (
    (statement.kind === SyntaxKind.InterfaceDeclaration || statement.kind === SyntaxKind.TypeAliasDeclaration)
    && statement.name.text === `${name}OwnProps`
  ));
  if (!declaration) throw new ApiExtractionError(name, `the declarations do not declare ${name}OwnProps`);
  // A second, merged declaration would add members the first one does not show.
  const { declarations } = checker.getSymbolAtLocation(declaration.name);
  if (declarations.length !== 1) throw new ApiExtractionError(name, `${name}OwnProps has ${declarations.length} declarations; declaration merging is not in the grammar`);
  if (declaration.typeParameters?.length) throw new ApiExtractionError(name, `${name}OwnProps is generic`);
  if (declaration.kind === SyntaxKind.InterfaceDeclaration) {
    if (declaration.heritageClauses?.length) throw new ApiExtractionError(name, `${name}OwnProps extends another type; list the Mux UI-owned props instead`);
    return declaration.members;
  }
  if (declaration.type.kind !== SyntaxKind.TypeLiteral) throw new ApiExtractionError(name, `${name}OwnProps must be an object type`);
  return declaration.type.members;
}

// The props the exported component accepts: the first parameter of its one call signature.
// A compound export (Avatar) names the part whose props the binding's API is: its root.
function publicProps(checker, sourceFile, name, part) {
  const exported = exportedNamed(sourceFile, name);
  if (!exported) throw new ApiExtractionError(name, `the declarations export no ${name}`);
  let type = checker.getTypeOfSymbol(checker.getSymbolAtLocation(exported.name));
  const component = part === undefined ? name : `${name}.${part}`;
  if (part !== undefined) {
    const property = checker.getPropertyOfType(type, part);
    if (!property) throw new ApiExtractionError(component, `the exported ${name} has no ${part} part`);
    type = checker.getTypeOfSymbol(property);
  }
  const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
  if (signatures.length !== 1 || signatures[0].getParameters().length === 0) {
    throw new ApiExtractionError(name, `the exported ${component} must be a component with one call signature that takes props`);
  }
  return new Map(checker.getPropertiesOfType(checker.getParameterType(signatures[0], 0)).map((property) => [property.name, property]));
}

/**
 * The typed block of one component, read from its emitted declarations: the members
 * `<Name>OwnProps` declares, each as the exported component's props type has it.
 * TypeScript interns literal, union, and named types, so a redeclaration written the
 * same way is the same type; anything else, including an equal inline object, fails.
 */
function readDeclaredApi(reader, checker, sourceFile, name, part) {
  const members = ownPropsOf(checker, sourceFile, name);
  const exposed = publicProps(checker, sourceFile, name, part);
  const props = [];
  const events = [];
  const propDetails = {};
  const eventDetails = {};
  for (const member of members) {
    const { name: prop, type, required, readonly: _readonly, ...documented } = reader.memberOf(member, `${name}.`);
    if (type.kind === 'never') throw new ApiExtractionError(`${name}.${prop}`, `a member that must be absent is no prop; leave ${prop} to the host part of the props`);
    const own = checker.getSymbolAtLocation(member.name);
    const accepted = exposed.get(prop);
    if (!accepted) throw new ApiExtractionError(`${name}.${prop}`, `the exported ${name}'s props do not include ${prop}`);
    const ownType = checker.getTypeOfSymbol(own);
    const acceptedType = checker.getTypeOfSymbol(accepted);
    if (acceptedType.id !== ownType.id || Boolean(accepted.flags & SymbolFlags.Optional) !== !required) {
      const shown = (symbol, type) => `${symbol.flags & SymbolFlags.Optional ? 'optional' : 'required'} ${checker.typeToString(type)}`;
      throw new ApiExtractionError(`${name}.${prop}`, `the exported ${name}'s props redeclare ${prop} as ${shown(accepted, acceptedType)}; ${name}OwnProps declares ${shown(own, ownType)}`);
    }
    if (/^on[A-Z]/u.test(prop)) {
      // Decision 0031 item 7: on<Event> maps to <event>, recorded with its callback signature.
      if (type.kind !== 'function') throw new ApiExtractionError(`${name}.${prop}`, 'an on<Event> prop must be a function type');
      const event = `${prop[2].toLowerCase()}${prop.slice(3)}`;
      events.push(event);
      eventDetails[event] = { prop, type, required, ...documented };
    } else {
      props.push(prop);
      propDetails[prop] = { type, required, ...documented };
    }
  }
  return { props, events, propDetails, eventDetails };
}

const REACT_WRAPPERS = new Set(['forwardRef', 'memo']);
const REACT_TYPES = /\/node_modules\/@types\/react\//u;

/** Whether the callee is `forwardRef` or `memo` from @types/react, however it is imported, not a local of that name. */
function isReactWrapper({ checker }, callee) {
  const name = callee.kind === SyntaxKind.PropertyAccessExpression ? callee.name : callee;
  const found = name.kind === SyntaxKind.Identifier ? checker.getSymbolAtLocation(name) : undefined;
  if (!found) return false;
  const symbol = found.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found;
  return REACT_WRAPPERS.has(symbol.name) && symbol.declarations.length > 0 && symbol.declarations.every(({ path }) => REACT_TYPES.test(path));
}

const calleeName = (callee) => (callee.kind === SyntaxKind.PropertyAccessExpression && callee.expression.kind === SyntaxKind.Identifier
  ? `${callee.expression.text}.${callee.name.text}`
  : callee.text ?? 'this call');

/**
 * The function a component export renders with. The expression is a function expression or
 * arrow, or a call to React's `forwardRef` or `memo` (the type checker, not the name,
 * decides) read only through its first argument: a function, a nested wrapper, or a name
 * bound to a top-level function declaration or a top-level const of such a form. A second
 * argument, such as memo's comparator, is never the component. Any other call fails, so no
 * default is read from a function the component does not render with. Null for any other
 * kind of expression.
 */
function componentFunction(project, sourceFile, chain, expression, seen = new Set()) {
  if (!expression) return null;
  const node = unwrap(expression);
  switch (node.kind) {
    case SyntaxKind.FunctionExpression:
    case SyntaxKind.ArrowFunction: return node;
    case SyntaxKind.CallExpression: return wrappedFunction(project, sourceFile, chain, node, seen);
    default: return null;
  }
}

function wrappedFunction(project, sourceFile, chain, call, seen) {
  const wrapper = calleeName(call.expression);
  if (!isReactWrapper(project, call.expression)) {
    throw new ApiExtractionError(chain, `${wrapper} is not React's forwardRef or memo; a component's defaults are read only through those wrappers, from their first argument`);
  }
  if (call.arguments.length === 0) throw new ApiExtractionError(chain, `${wrapper}() has no component function to read defaults from`);
  const argument = unwrap(call.arguments[0]);
  if (argument.kind !== SyntaxKind.Identifier) {
    const component = componentFunction(project, sourceFile, chain, argument, seen);
    if (!component) throw new ApiExtractionError(chain, `the first argument of ${wrapper} must be a function, a forwardRef or memo call, or a top-level function or const`);
    return component;
  }
  const declarations = project.checker.getSymbolAtLocation(argument)?.declarations ?? [];
  const declaration = declarations.length === 1 ? declarations[0].resolve(project) : null;
  if (declaration?.kind === SyntaxKind.FunctionDeclaration && declaration.parent === sourceFile && declaration.body) return declaration;
  const constant = topLevelConst(project, sourceFile, argument);
  if (!constant) throw new ApiExtractionError(chain, `${argument.text} is not a top-level function declaration or const in the component's source`);
  if (seen.has(constant)) throw new ApiExtractionError(chain, `${argument.text} wraps itself`);
  seen.add(constant);
  const component = componentFunction(project, sourceFile, chain, constant.initializer, seen);
  if (!component) throw new ApiExtractionError(chain, `${argument.text} must be a function, forwardRef, or memo call`);
  return component;
}

const WRAPPERS = new Set([SyntaxKind.ParenthesizedExpression, SyntaxKind.AsExpression, SyntaxKind.SatisfiesExpression]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);

const NOT_PRIMITIVE = Symbol('not a primitive literal');
function primitiveLiteral(node) {
  switch (node.kind) {
    case SyntaxKind.StringLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral: return node.text;
    case SyntaxKind.NumericLiteral: return Number(node.text);
    case SyntaxKind.TrueKeyword: return true;
    case SyntaxKind.FalseKeyword: return false;
    case SyntaxKind.NullKeyword: return null;
    case SyntaxKind.PrefixUnaryExpression:
      return node.operator === SyntaxKind.MinusToken && node.operand.kind === SyntaxKind.NumericLiteral ? -Number(node.operand.text) : NOT_PRIMITIVE;
    default: return NOT_PRIMITIVE;
  }
}

// `Object.freeze(x)` with the global Object, not a local one that shadows it.
const isObjectFreeze = ({ checker, program }, node) => node.kind === SyntaxKind.CallExpression
  && node.arguments.length === 1
  && node.expression.kind === SyntaxKind.PropertyAccessExpression
  && node.expression.expression.kind === SyntaxKind.Identifier
  && node.expression.expression.text === 'Object'
  && node.expression.name.text === 'freeze'
  && (checker.getSymbolAtLocation(node.expression.expression)?.declarations ?? []).every(({ path }) => isDefaultLibrary(program, path));

/**
 * Reads a default (Decision 0031 item 3). A default is a literal, an array or object
 * literal of literals, or a reference to an allowed static constant: a top-level const
 * in the component's source whose value is a primitive literal, or `Object.freeze` over
 * an object or array literal whose values are literals or nested frozen literals.
 * Anything else, including any call, could change at run time and fails.
 */
function defaultReader({ project, sourceFile }) {
  const { checker } = project;

  function literal(node, chain, value) {
    const unwrapped = unwrap(node);
    const primitive = primitiveLiteral(unwrapped);
    if (primitive !== NOT_PRIMITIVE) return primitive;
    if (unwrapped.kind === SyntaxKind.ArrayLiteralExpression) return unwrapped.elements.map((element) => value(element, chain));
    if (unwrapped.kind === SyntaxKind.ObjectLiteralExpression) {
      return Object.fromEntries(unwrapped.properties.map((property) => {
        if (property.kind !== SyntaxKind.PropertyAssignment) throw new ApiExtractionError(chain, 'an object literal default holds only `name: value` properties');
        return [propertyName(property.name, chain), value(property.initializer, chain)];
      }));
    }
    return NOT_PRIMITIVE;
  }

  // A frozen literal's values are literals or frozen literals themselves, so no part of it can change.
  function frozen(node, chain) {
    const unwrapped = unwrap(node);
    const primitive = primitiveLiteral(unwrapped);
    if (primitive !== NOT_PRIMITIVE) return primitive;
    const argument = isObjectFreeze(project, unwrapped) ? unwrap(unwrapped.arguments[0]) : null;
    if (argument?.kind === SyntaxKind.ObjectLiteralExpression || argument?.kind === SyntaxKind.ArrayLiteralExpression) {
      return literal(argument, chain, frozen);
    }
    throw new ApiExtractionError(chain, 'an object constant a default reads must be Object.freeze({...}) of literals or nested frozen literals');
  }

  function constant(identifier, chain) {
    const declarations = checker.getSymbolAtLocation(identifier)?.declarations ?? [];
    const declaration = declarations.length === 1 ? declarations[0].resolve(project) : null;
    const list = declaration?.parent;
    const isStatic = declaration?.kind === SyntaxKind.VariableDeclaration
      && declaration.initializer
      && list.kind === SyntaxKind.VariableDeclarationList
      && (list.flags & NodeFlags.Const) !== 0
      && list.parent.parent === sourceFile;
    if (!isStatic) throw new ApiExtractionError(chain, `${identifier.text} is not a top-level const in the component's source`);
    return frozen(declaration.initializer, `${chain} -> ${identifier.text}`);
  }

  function reference(node, chain) {
    if (node.kind === SyntaxKind.Identifier) return constant(node, chain);
    if (node.kind === SyntaxKind.PropertyAccessExpression) {
      const owner = reference(unwrap(node.expression), chain);
      const key = node.name.text;
      if (owner === null || typeof owner !== 'object' || !Object.hasOwn(owner, key)) throw new ApiExtractionError(chain, `the constant has no property ${key}`);
      return owner[key];
    }
    throw new ApiExtractionError(chain, 'a default must be a literal or a reference to a static constant');
  }

  return function value(node, chain) {
    const read = literal(node, chain, value);
    return read === NOT_PRIMITIVE ? reference(unwrap(node), chain) : read;
  };
}

const UPDATES = new Set([SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken]);
const FALLBACKS = new Map([[SyntaxKind.QuestionQuestionToken, '??'], [SyntaxKind.BarBarToken, '||']]);

/**
 * Whether `binding ?? fallback` or `binding || fallback` leaves an omitted prop at its
 * parameter default: the default must be non-nullish for `??` and truthy for `||`, or the
 * expression executes the fallback in its place.
 */
const keepsDefault = (operator, { defaulted, value }) => defaulted
  && (operator === SyntaxKind.QuestionQuestionToken ? value !== null && value !== undefined : Boolean(value));

/**
 * Fails when the component function executes a default for a Mux UI-owned binding
 * instead of declaring it in the props parameter: any assignment to the binding
 * (including `??=`, compound, and destructuring assignments, and a for-in or for-of
 * target), an update (`++`, `--`), or the binding as the left operand of `??` or `||`
 * unless its parameter default keeps the fallback from applying (`keepsDefault`).
 * Bindings are matched by symbol, so a shadowing local is not the prop. An event binding,
 * which has no default to misstate, may still be called optionally
 * (`onActivate?.(event)`) or given a fallback.
 * @param {Map<number, { prop: string, event: boolean, defaulted: boolean, value?: unknown }>} owned binding symbol id to its prop and parameter default
 */
function assertNoExecutedDefaults(checker, component, name, owned) {
  const ownedAt = (node) => (node.kind === SyntaxKind.Identifier ? owned.get(checker.getSymbolAtLocation(node)?.id) : undefined);
  // The owned bindings an assignment target writes.
  function* written(target) {
    const node = unwrap(target);
    switch (node.kind) {
      case SyntaxKind.Identifier:
        if (ownedAt(node)) yield ownedAt(node);
        break;
      case SyntaxKind.ObjectLiteralExpression:
        for (const property of node.properties) {
          if (property.kind === SyntaxKind.ShorthandPropertyAssignment) {
            const found = owned.get(checker.getShorthandAssignmentValueSymbol(property)?.id);
            if (found) yield found;
          } else if (property.kind === SyntaxKind.PropertyAssignment) {
            yield* written(property.initializer);
          } else if (property.kind === SyntaxKind.SpreadAssignment) {
            yield* written(property.expression);
          }
        }
        break;
      case SyntaxKind.ArrayLiteralExpression:
        for (const element of node.elements) yield* written(element);
        break;
      case SyntaxKind.SpreadElement:
        yield* written(node.expression);
        break;
      // A default inside a destructuring assignment: [size = 'md'] = values.
      case SyntaxKind.BinaryExpression:
        if (node.operatorToken.kind === SyntaxKind.EqualsToken) yield* written(node.left);
        break;
      default: break;
    }
  }
  const assigned = (target) => {
    for (const { prop } of written(target)) {
      throw new ApiExtractionError(`${name}.${prop}`, `the component assigns to ${prop} outside its props parameter; declare its default there`);
    }
  };
  function visit(node) {
    if (node.kind === SyntaxKind.BinaryExpression) {
      const operator = node.operatorToken.kind;
      if (isAssignmentOperator(operator)) assigned(node.left);
      const fallback = FALLBACKS.has(operator) ? ownedAt(unwrap(node.left)) : undefined;
      if (fallback && !fallback.event && !keepsDefault(operator, fallback)) {
        const { prop, defaulted, value } = fallback;
        throw new ApiExtractionError(`${name}.${prop}`, defaulted
          ? `${prop} ${FALLBACKS.get(operator)} ... replaces its parameter default ${JSON.stringify(value)} with a value the component executes; declare the executed default in the props parameter`
          : `${prop} ${FALLBACKS.get(operator)} ... falls back to a value the component executes; declare the default in the props parameter`);
      }
    } else if ((node.kind === SyntaxKind.PrefixUnaryExpression || node.kind === SyntaxKind.PostfixUnaryExpression) && UPDATES.has(node.operator)) {
      assigned(node.operand);
    } else if ((node.kind === SyntaxKind.ForInStatement || node.kind === SyntaxKind.ForOfStatement) && node.initializer.kind !== SyntaxKind.VariableDeclarationList) {
      assigned(node.initializer);
    }
    node.forEachChild((child) => {
      visit(child);
    });
  }
  visit(component);
}

/** A top-level const declaration of the source, or null. */
function topLevelConst(project, sourceFile, identifier) {
  const declarations = project.checker.getSymbolAtLocation(identifier)?.declarations ?? [];
  const declaration = declarations.length === 1 ? declarations[0].resolve(project) : null;
  const isConst = declaration?.kind === SyntaxKind.VariableDeclaration
    && declaration.initializer !== undefined
    && declaration.parent.kind === SyntaxKind.VariableDeclarationList
    && (declaration.parent.flags & NodeFlags.Const) !== 0
    && declaration.parent.parent.parent === sourceFile;
  return isConst ? declaration : null;
}

const MUTATORS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']);

/** Whether the source writes to the binding or through it: an assignment, update, delete, or Object mutator. */
function writesThrough({ checker }, sourceFile, symbol) {
  const rooted = (target) => {
    let node = unwrap(target);
    while (node.kind === SyntaxKind.PropertyAccessExpression || node.kind === SyntaxKind.ElementAccessExpression) node = unwrap(node.expression);
    return node.kind === SyntaxKind.Identifier && checker.getSymbolAtLocation(node)?.id === symbol.id;
  };
  const writes = (node) => {
    if (node.kind === SyntaxKind.BinaryExpression && isAssignmentOperator(node.operatorToken.kind) && rooted(node.left)) return true;
    if ((node.kind === SyntaxKind.PrefixUnaryExpression || node.kind === SyntaxKind.PostfixUnaryExpression) && UPDATES.has(node.operator) && rooted(node.operand)) return true;
    if (node.kind === SyntaxKind.DeleteExpression && rooted(node.expression)) return true;
    if (node.kind === SyntaxKind.CallExpression && node.arguments.length > 0 && rooted(node.arguments[0])
      && node.expression.kind === SyntaxKind.PropertyAccessExpression && node.expression.expression.kind === SyntaxKind.Identifier
      && node.expression.expression.text === 'Object' && MUTATORS.has(node.expression.name.text)) return true;
    let found = false;
    node.forEachChild((child) => {
      found ||= writes(child);
    });
    return found;
  };
  return writes(sourceFile);
}

/**
 * The expression a compound export binds to `part`. A compound is a top-level const the
 * source never writes to, initialized to `Object.freeze({ Root: AvatarRoot, ... })` whose
 * properties are all `Name: value` with plain names, each once, so no spread, computed key,
 * or later write can replace the part the extraction reads. An identifier value is followed
 * to a top-level const of the source.
 */
function compoundPart(project, sourceFile, exported, name, part) {
  const chain = `${name}.${part}`;
  if (!exported) throw new ApiExtractionError(chain, `the source exports no ${name}`);
  const declaration = exported.node;
  const isConst = declaration?.kind === SyntaxKind.VariableDeclaration
    && (declaration.parent.flags & NodeFlags.Const) !== 0
    && declaration.parent.parent.parent === sourceFile;
  if (!isConst) throw new ApiExtractionError(chain, `the compound ${name} must be a top-level const`);
  const initializer = declaration.initializer === undefined ? undefined : unwrap(declaration.initializer);
  const object = initializer && isObjectFreeze(project, initializer) ? unwrap(initializer.arguments[0]) : undefined;
  if (object?.kind !== SyntaxKind.ObjectLiteralExpression) throw new ApiExtractionError(chain, `the compound ${name} must be Object.freeze({ ... }) of its parts`);
  const values = new Map();
  for (const property of object.properties) {
    const plain = property.kind === SyntaxKind.PropertyAssignment
      && (property.name.kind === SyntaxKind.Identifier || property.name.kind === SyntaxKind.StringLiteral);
    if (!plain) throw new ApiExtractionError(chain, `the compound ${name} holds only Name: value parts; a spread, shorthand, method, accessor, or computed key could replace ${part}`);
    if (values.has(property.name.text)) throw new ApiExtractionError(chain, `the compound ${name} assigns ${property.name.text} twice`);
    values.set(property.name.text, unwrap(property.initializer));
  }
  if (writesThrough(project, sourceFile, project.checker.getSymbolAtLocation(exported.name))) {
    throw new ApiExtractionError(chain, `the source writes to the compound ${name} after declaring it`);
  }
  const value = values.get(part);
  if (value === undefined) throw new ApiExtractionError(chain, `the compound ${name} has no ${part} part`);
  if (value.kind !== SyntaxKind.Identifier) return value;
  const constant = topLevelConst(project, sourceFile, value);
  if (!constant) throw new ApiExtractionError(chain, `${value.text} is not a top-level const in the component's source`);
  return constant.initializer;
}

/**
 * Mux UI-owned defaults from the component's props parameter in its executable source.
 * The component destructures every Mux UI-owned prop there and executes no other default
 * for one, so no default can hide in its body or a rest object.
 */
function readSourceDefaults(project, sourceFile, name, declared, part) {
  const exported = exportedNamed(sourceFile, name);
  const chain = part === undefined ? name : `${name}.${part}`;
  // A compound's defaults are its part's, whatever else the export is.
  const component = part !== undefined
    ? componentFunction(project, sourceFile, chain, compoundPart(project, sourceFile, exported, name, part))
    : exported?.node.kind === SyntaxKind.FunctionDeclaration ? exported.node : componentFunction(project, sourceFile, chain, exported?.node.initializer);
  if (!component) throw new ApiExtractionError(name, `the source exports no component function${part === undefined ? '' : ` as ${name}.${part}`} to read defaults from`);
  const [parameter] = component.parameters;
  if (parameter?.name.kind !== SyntaxKind.ObjectBindingPattern) {
    throw new ApiExtractionError(name, 'the props parameter must be an object pattern that destructures the Mux UI-owned props');
  }
  const bound = new Map();
  for (const element of parameter.name.elements) {
    // Host passthrough props, such as Button's type = 'button', are not Mux UI-owned.
    if (!element.dotDotDotToken) bound.set(propertyName(element.propertyName ?? element.name, name), element);
  }
  const value = defaultReader({ project, sourceFile });
  const defaults = {};
  const owned = new Map();
  for (const prop of [...declared.props, ...Object.values(declared.eventDetails).map(({ prop: eventProp }) => eventProp)]) {
    const element = bound.get(prop);
    if (!element) throw new ApiExtractionError(`${name}.${prop}`, 'the props parameter must destructure each Mux UI-owned prop');
    const event = !declared.props.includes(prop);
    const defaulted = element.initializer !== undefined;
    if (defaulted && event) throw new ApiExtractionError(`${name}.${prop}`, 'an on<Event> prop has no default');
    if (defaulted) defaults[prop] = value(element.initializer, `${name}.${prop}`);
    // The parameter default decides whether a fallback on the binding can apply to an omitted prop.
    if (element.name.kind === SyntaxKind.Identifier) owned.set(project.checker.getSymbolAtLocation(element.name).id, { prop, event, defaulted, value: defaults[prop] });
  }
  assertNoExecutedDefaults(project.checker, component, name, owned);
  return defaults;
}

/**
 * Extracts each component's API. A component names its export, its emitted declaration
 * file, and, when defaults are wanted, its TypeScript source; a compound export also
 * names the `part` (its root) whose props the API is. Types declared under
 * `declarationRoot` are Mux UI-owned; any other reference must be an exact host type on
 * the allowlist. Returns a Map from export name to `{ props, events, defaults?,
 * propDetails, eventDetails, types }`, with `types` sorted by name.
 * @param {{ declarationRoot: string, components: { name: string, declarations: string, source?: string, part?: string }[], hostAllowlist?: readonly string[] }} options
 */
export function extractApis({ declarationRoot, components, hostAllowlist = HOST_ALLOWLIST }) {
  const allowed = assertHostAllowlist(hostAllowlist);
  const root = resolve(declarationRoot);
  const files = components.flatMap(({ declarations, source }) => [resolve(declarations), ...(source ? [resolve(source)] : [])]);
  return withProject(files, (project) => new Map(components.map(({ name, declarations, source, part }) => {
    const reader = declarationReader({ project, declarationRoot: root, allowed });
    const declared = readDeclaredApi(reader, project.checker, project.program.getSourceFile(resolve(declarations)), name, part);
    const types = Object.fromEntries([...reader.types].sort(([left], [right]) => left.localeCompare(right))
      .map(([typeName, { symbol: _symbol, ...definition }]) => [typeName, definition]));
    // A prop whose type is a finite set of literals also lists them, in declaration order.
    const propDetails = Object.fromEntries(Object.entries(declared.propDetails).map(([prop, { type, required, ...documented }]) => {
      const values = literalValues(type, types);
      return [prop, { type, required, ...(values === null ? {} : { enum: values }), ...documented }];
    }));
    const defaults = source ? readSourceDefaults(project, project.program.getSourceFile(resolve(source)), name, declared, part) : undefined;
    return [name, {
      props: declared.props,
      events: declared.events,
      ...(defaults === undefined ? {} : { defaults }),
      propDetails,
      eventDetails: declared.eventDetails,
      types,
    }];
  })));
}
