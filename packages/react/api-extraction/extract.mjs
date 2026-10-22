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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};

// An allowlist entry for an application of a host generic, as the extraction serializes it.
const hostApplication = (name, ...typeArguments) => deepFreeze({ kind: 'host', name, typeArguments });

const INPUT_ATTRIBUTES = hostApplication('React.InputHTMLAttributes', { kind: 'host', name: 'HTMLInputElement' });

/** The props of a field's inner input that the field owns, in the order FieldInputProps omits them. */
const FIELD_INPUT_OWNED_PROPS = Object.freeze([
  'children', 'dangerouslySetInnerHTML', 'slot', 'type', 'id', 'name', 'value', 'defaultValue', 'checked', 'defaultChecked',
  'disabled', 'readOnly', 'required', 'onChange', 'onInput', 'aria-label', 'aria-labelledby', 'aria-describedby',
  'aria-errormessage', 'aria-invalid', 'aria-required', 'aria-disabled', 'aria-readonly',
]);

/**
 * The host types a Mux UI-owned prop may reach, each one exact type: a DOM or Intl library
 * name, or `React.<Name>` from @types/react, written as a string; or an exact application of
 * a host generic, written as the serialized `{ kind: 'host', name, typeArguments }` it
 * extracts to. It grows per tranche, only by what a moved component needs: HTMLButtonElement
 * for the activation target of Button, IconButton, and ToggleButton, React.ReactNode for the
 * content props of SelectNative, Message, Activity, Disclosure, Meter, and ProgressBar (and the Markdown fallback and the Lightbox render function's result),
 * HTMLAnchorElement for Link's activation target, NumberFormatOptions (written
 * `Intl.NumberFormatOptions`) for Meter's formatOptions, File for FileTrigger's selection,
 * React.ReactElement for the trigger of Tooltip, Dialog, Popover, and PreviewTrigger, and the
 * applications Exclude<React.ReactNode, null | undefined | boolean> for the content of Tooltip,
 * Dialog, and Toast, and Promise<File>, Promise<string>, ReadonlySet<string>, and
 * AsyncIterable<MuxUIDropItem> for DropZone's drop items, and HTMLInputElement,
 * React.InputHTMLAttributes<HTMLInputElement>, and the Omit of it that FieldInputProps declares for
 * TextField's and SearchField's inputProps.
 */
export const HOST_ALLOWLIST = Object.freeze([
  'HTMLButtonElement',
  'React.ReactNode',
  'HTMLAnchorElement',
  'NumberFormatOptions',
  'File',
  'React.ReactElement',
  // The content a Tooltip, Dialog title, or Toast message takes: any node but the ones that render nothing.
  hostApplication('Exclude', { kind: 'host', name: 'React.ReactNode' }, { kind: 'union', members: [{ kind: 'null' }, { kind: 'undefined' }, { kind: 'boolean' }] }),
  // DropZone's drop items: what an item reads, the formats a text item lists, and a directory's entries.
  hostApplication('Promise', { kind: 'host', name: 'File' }),
  hostApplication('Promise', { kind: 'string' }),
  hostApplication('ReadonlySet', { kind: 'string' }),
  hostApplication('AsyncIterable', { kind: 'reference', name: 'MuxUIDropItem' }),
  // TextField's and SearchField's inputProps: the native attributes of the inner input, less the 23 the field owns.
  'HTMLInputElement',
  INPUT_ATTRIBUTES,
  hostApplication('Omit', INPUT_ATTRIBUTES, {
    kind: 'union',
    members: FIELD_INPUT_OWNED_PROPS.map((value) => ({ kind: 'literal', value })),
  }),
]);

// A namespace or wildcard would admit every type under it.
const EXACT_HOST_TYPE = /^(?:React\.)?[A-Z][A-Za-z0-9]*$/u;
const NAMESPACES = new Set(['React', 'JSX', 'globalThis']);
const REFERENCE_NAME = /^[A-Z][A-Za-z0-9]*$/u;
const REACT_TYPES = /\/node_modules\/@types\/react\//u;

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

const sortKeys = (value) => (Array.isArray(value)
  ? value.map(sortKeys)
  : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortKeys(child)]))
    : value);

/**
 * The key an allowlist entry matches by: a name is its own key, and an application is its
 * serialized form with sorted object keys, so arguments match exactly and in order.
 */
export const hostEntryKey = (entry) => (typeof entry === 'string' ? entry : JSON.stringify(sortKeys(entry)));

const SCALARS = new Set(['string', 'number', 'boolean', 'void', 'null', 'undefined']);

/**
 * Throws unless a serialized type is one an application's argument may be: a keyword, a
 * literal, a Mux UI-owned reference, a union of those, or an exact host name or application,
 * with no key beyond the serialized form.
 */
function assertSerializedType(type, entry) {
  const fail = (message) => {
    throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} ${message}`);
  };
  const shape = (...keys) => {
    if (Object.keys(type).sort().join() !== [...keys].sort().join()) fail(`holds a ${type.kind} type that is not written as exactly ${keys.join(', ')}`);
  };
  if (type === null || typeof type !== 'object' || Array.isArray(type)) fail('has a type argument that is not a serialized type');
  if (SCALARS.has(type.kind)) {
    shape('kind');
  } else if (type.kind === 'literal') {
    shape('kind', 'value');
    if (!['string', 'number', 'boolean'].includes(typeof type.value)) fail('has a literal that is not a string, number, or boolean');
  } else if (type.kind === 'reference') {
    shape('kind', 'name');
    if (typeof type.name !== 'string' || !REFERENCE_NAME.test(type.name)) fail('has a reference that does not name one Mux UI-owned type');
  } else if (type.kind === 'union') {
    shape('kind', 'members');
    if (!Array.isArray(type.members) || type.members.length < 2) fail('has a union with fewer than two members');
    for (const member of type.members) assertSerializedType(member, entry);
  } else if (type.kind === 'host') {
    assertHostName(type.name, entry);
    if (type.typeArguments === undefined) shape('kind', 'name');
    else assertArguments(type, entry);
  } else {
    fail(`has a ${JSON.stringify(type.kind)} type argument; an argument is a keyword, literal, reference, union, or host type`);
  }
}

function assertHostName(name, entry) {
  if (typeof name !== 'string' || !EXACT_HOST_TYPE.test(name) || NAMESPACES.has(name)) {
    throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} is too broad: an entry names one exact type, such as HTMLButtonElement or React.ReactNode`);
  }
}

function assertArguments(application, entry) {
  if (Object.keys(application).sort().join() !== 'kind,name,typeArguments') {
    throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} holds a host application that is not written as exactly kind, name, typeArguments`);
  }
  if (!Array.isArray(application.typeArguments) || application.typeArguments.length === 0) {
    throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} has no type arguments; write the bare name as a string`);
  }
  for (const argument of application.typeArguments) assertSerializedType(argument, entry);
}

/**
 * Validates the host allowlist: each entry names one exact type, as a string, or one exact
 * application of a host generic with its type arguments in order. Returns the bare names
 * and the applications, the latter keyed by `hostEntryKey`.
 */
export function assertHostAllowlist(hostAllowlist) {
  const names = new Set();
  const applications = new Set();
  for (const entry of hostAllowlist) {
    if (typeof entry === 'string') {
      assertHostName(entry, entry);
      names.add(entry);
    } else if (entry !== null && typeof entry === 'object' && entry.kind === 'host') {
      assertHostName(entry.name, entry);
      assertArguments(entry, entry);
      applications.add(hostEntryKey(entry));
    } else {
      throw new ApiExtractionError('host allowlist', `${JSON.stringify(entry)} is not a name or an exact application of a host type`);
    }
  }
  return { names, applications };
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

/** A serialized type as TypeScript writes it, for a diagnostic. */
function showType(type) {
  switch (type.kind) {
    case 'literal': return JSON.stringify(type.value);
    case 'reference': return type.name;
    case 'union': return type.members.map(showType).join(' | ');
    case 'host': return type.typeArguments === undefined ? type.name : `${type.name}<${type.typeArguments.map(showType).join(', ')}>`;
    default: return type.kind;
  }
}

function declarationReader({ project, declarationRoot, allowed }) {
  const { checker, program } = project;
  // Named types by name, each with the symbol it was read from. A type being read (a
  // recursive reference) is pending, also by symbol: a name alone would let another
  // module's same-named type pass as the recursion.
  const types = new Map();
  const pending = new Map();

  // Where a referenced symbol is declared decides what it may be: Mux UI-owned when every
  // declaration is in the package's declarations, a host type when every declaration comes
  // from the default library (which @types/react may augment) or from @types/react. A
  // package-level `declare global` that merges into a library type adds a declaration
  // outside both, so the merged symbol is no host type.
  function hostName(symbol) {
    const paths = symbol.declarations.map(({ path }) => path);
    const library = paths.filter((path) => isDefaultLibrary(program, path));
    if (paths.length === 0 || !paths.every((path) => library.includes(path) || REACT_TYPES.test(path))) return null;
    return library.length > 0 ? symbol.name : `React.${symbol.name}`;
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
    const found = checker.getSymbolAtLocation(node.typeName);
    if (!found) throw new ApiExtractionError(hop, `${written} does not resolve`);
    const symbol = found.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(found) : found;
    if (symbol.flags & SymbolFlags.Enum) throw new ApiExtractionError(hop, `${written} is an enum; use a union of literals`);
    const paths = symbol.declarations.map(({ path }) => path);
    const applied = (node.typeArguments?.length ?? 0) > 0;
    if (paths.length > 0 && paths.every((path) => isUnder(path, declarationRoot))) {
      // A local interface named like a host generic is Mux UI-owned, never the host type.
      if (applied) throw new ApiExtractionError(hop, `${symbol.name} is a Mux UI-owned type; it takes no type arguments`);
      return namedType(symbol, hop);
    }
    const host = hostName(symbol);
    if (host === null) {
      const merged = paths.some((path) => isUnder(path, declarationRoot));
      throw new ApiExtractionError(hop, merged
        ? `${symbol.name} also has a declaration in @muxui/react (a global augmentation or merged declaration); a host type is declared only in the default library or @types/react`
        : `${written} is outside @muxui/react and not in the host allowlist`);
    }
    if (!applied) {
      if (allowed.names.has(host)) return { kind: 'host', name: host };
      throw new ApiExtractionError(hop, `${host} is outside @muxui/react and not in the host allowlist`);
    }
    // An application matches an entry only exactly, so the arguments are read like any type
    // (a host argument must itself be allowlisted, a Mux UI-owned one is recorded) and then compared.
    const application = { kind: 'host', name: host, typeArguments: node.typeArguments.map((argument, index) => typeOf(argument, `${hop}<${index}>`)) };
    if (allowed.applications.has(hostEntryKey(application))) return application;
    throw new ApiExtractionError(hop, `${showType(application)} is not an application on the host allowlist; an application matches an entry exactly, with the arguments in order`);
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
   * An index signature is in the grammar in two forms only. As the one member of its object
   * type, `{ readonly [key: string]: T }` is a record: string keys the caller chooses, each
   * holding a T. Beside named properties it must be the one mutable `[key: string]: unknown`,
   * which marks an open item (`additional: "unknown"`): other string-keyed fields are allowed
   * and typed unknown. This marker is the only place the keyword unknown is in the grammar,
   * and it never goes through `typeOf`. Anything else fails: a second signature, a key other
   * than string, a readonly signature beside members, or any other value type beside them.
   */
  function indexedOf(members, chain) {
    const signatures = members.filter((member) => member.kind === SyntaxKind.IndexSignature);
    if (signatures.length === 0) return null;
    const rule = 'an index signature is in the grammar only as the one member of its object type, or as the one mutable `[key: string]: unknown` beside named properties';
    if (signatures.length !== 1) throw new ApiExtractionError(chain, rule);
    const [signature] = signatures;
    const [key] = signature.parameters;
    if (signature.parameters.length !== 1 || key.type?.kind !== SyntaxKind.StringKeyword) {
      throw new ApiExtractionError(chain, 'an index signature takes one string key');
    }
    if (!signature.type) throw new ApiExtractionError(chain, 'an index signature needs a declared type');
    const readonly = hasModifier(signature, SyntaxKind.ReadonlyKeyword);
    if (members.length === 1) return { kind: 'record', value: typeOf(signature.type, `${chain}[string]`), readonly };
    if (readonly) throw new ApiExtractionError(chain, `${rule}; beside named properties it must be mutable`);
    if (signature.type.kind !== SyntaxKind.UnknownKeyword) {
      throw new ApiExtractionError(chain, `${rule}; its value is written as the keyword unknown, not an alias, union, or other type`);
    }
    return { kind: 'object', members: members.filter((member) => member !== signature).map((member) => memberOf(member, `${chain}.`)), additional: 'unknown' };
  }

  const objectOf = (members, chain) => indexedOf(members, chain)
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

// `ownName` names the declaration, `<ownName>OwnProps`; `label` is the component in a diagnostic.
function ownPropsOf(checker, sourceFile, ownName, label) {
  const declaration = sourceFile.statements.find((statement) => (
    (statement.kind === SyntaxKind.InterfaceDeclaration || statement.kind === SyntaxKind.TypeAliasDeclaration)
    && statement.name.text === `${ownName}OwnProps`
  ));
  if (!declaration) throw new ApiExtractionError(label, `the declarations do not declare ${ownName}OwnProps`);
  // A second, merged declaration would add members the first one does not show.
  const { declarations } = checker.getSymbolAtLocation(declaration.name);
  if (declarations.length !== 1) throw new ApiExtractionError(label, `${ownName}OwnProps has ${declarations.length} declarations; declaration merging is not in the grammar`);
  if (declaration.typeParameters?.length) throw new ApiExtractionError(label, `${ownName}OwnProps is generic`);
  if (declaration.kind === SyntaxKind.InterfaceDeclaration) {
    if (declaration.heritageClauses?.length) throw new ApiExtractionError(label, `${ownName}OwnProps extends another type; list the Mux UI-owned props instead`);
    return declaration.members;
  }
  if (declaration.type.kind !== SyntaxKind.TypeLiteral) throw new ApiExtractionError(label, `${ownName}OwnProps must be an object type`);
  return declaration.type.members;
}

// The props the exported component accepts: the first parameter of its one call signature.
// A compound export (Avatar) names the part whose props the binding's API is: its root. A
// callable compound (ListBox) is its own root, and its other parts are members of the export.
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
 * `<ownName>OwnProps` declares, each as the exported component's props type has it.
 * TypeScript interns literal, union, and named types, so a redeclaration written the
 * same way is the same type; anything else, including an equal inline object, fails.
 * `member` is the export's part whose props are read (none: the export itself), and
 * `label` is the component in a diagnostic.
 */
function readDeclaredApi(reader, checker, sourceFile, { exportName, ownName, member, label }) {
  const members = ownPropsOf(checker, sourceFile, ownName, label);
  const exposed = publicProps(checker, sourceFile, exportName, member);
  const props = [];
  const events = [];
  const propDetails = {};
  const eventDetails = {};
  for (const ownMember of members) {
    const { name: prop, type, required, readonly: _readonly, ...documented } = reader.memberOf(ownMember, `${label}.`);
    if (type.kind === 'never') throw new ApiExtractionError(`${label}.${prop}`, `a member that must be absent is no prop; leave ${prop} to the host part of the props`);
    const own = checker.getSymbolAtLocation(ownMember.name);
    const accepted = exposed.get(prop);
    if (!accepted) throw new ApiExtractionError(`${label}.${prop}`, `the exported ${label}'s props do not include ${prop}`);
    const ownType = checker.getTypeOfSymbol(own);
    const acceptedType = checker.getTypeOfSymbol(accepted);
    if (acceptedType.id !== ownType.id || Boolean(accepted.flags & SymbolFlags.Optional) !== !required) {
      const shown = (symbol, type) => `${symbol.flags & SymbolFlags.Optional ? 'optional' : 'required'} ${checker.typeToString(type)}`;
      throw new ApiExtractionError(`${label}.${prop}`, `the exported ${label}'s props redeclare ${prop} as ${shown(accepted, acceptedType)}; ${ownName}OwnProps declares ${shown(own, ownType)}`);
    }
    if (/^on[A-Z]/u.test(prop)) {
      // Decision 0031 item 7: on<Event> maps to <event>, recorded with its callback signature.
      if (type.kind !== 'function') throw new ApiExtractionError(`${label}.${prop}`, 'an on<Event> prop must be a function type');
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
 * kind of expression. `followed` collects each top-level const the chain is read through,
 * for the caller to check that the source never writes to it.
 */
function componentFunction(project, sourceFile, chain, expression, seen = new Set(), followed = new Set()) {
  if (!expression) return null;
  const node = unwrap(expression);
  switch (node.kind) {
    case SyntaxKind.FunctionExpression:
    case SyntaxKind.ArrowFunction: return node;
    case SyntaxKind.CallExpression: return wrappedFunction(project, sourceFile, chain, node, seen, followed);
    default: return null;
  }
}

function wrappedFunction(project, sourceFile, chain, call, seen, followed) {
  const wrapper = calleeName(call.expression);
  if (!isReactWrapper(project, call.expression)) {
    throw new ApiExtractionError(chain, `${wrapper} is not React's forwardRef or memo; a component's defaults are read only through those wrappers, from their first argument`);
  }
  if (call.arguments.length === 0) throw new ApiExtractionError(chain, `${wrapper}() has no component function to read defaults from`);
  const argument = unwrap(call.arguments[0]);
  if (argument.kind !== SyntaxKind.Identifier) {
    const component = componentFunction(project, sourceFile, chain, argument, seen, followed);
    if (!component) throw new ApiExtractionError(chain, `the first argument of ${wrapper} must be a function, a forwardRef or memo call, or a top-level function or const`);
    return component;
  }
  return namedFunction(project, sourceFile, chain, argument, seen, followed);
}

/**
 * The function a name stands for: a top-level function declaration, or a top-level const
 * read as a component expression. The const is collected in `followed`.
 */
function namedFunction(project, sourceFile, chain, identifier, seen, followed) {
  const declarations = project.checker.getSymbolAtLocation(identifier)?.declarations ?? [];
  const declaration = declarations.length === 1 ? declarations[0].resolve(project) : null;
  if (declaration?.kind === SyntaxKind.FunctionDeclaration && declaration.parent === sourceFile && declaration.body) return declaration;
  const constant = topLevelConst(project, sourceFile, identifier);
  if (!constant) throw new ApiExtractionError(chain, `${identifier.text} is not a top-level function declaration or const in the component's source`);
  if (seen.has(constant)) throw new ApiExtractionError(chain, `${identifier.text} wraps itself`);
  seen.add(constant);
  followed.add(constant);
  const component = componentFunction(project, sourceFile, chain, constant.initializer, seen, followed);
  if (!component) throw new ApiExtractionError(chain, `${identifier.text} must be a function, forwardRef, or memo call`);
  return component;
}

const WRAPPERS = new Set([SyntaxKind.ParenthesizedExpression, SyntaxKind.AsExpression, SyntaxKind.SatisfiesExpression, SyntaxKind.NonNullExpression, SyntaxKind.TypeAssertionExpression]);
const unwrap = (node) => (WRAPPERS.has(node.kind) ? unwrap(node.expression) : node);

/**
 * The leaf targets an assignment writes: the target itself, or each leaf of an array or object
 * pattern, through nesting, rest and spread elements, and `= default` initializers. A leaf is an
 * identifier, a property or element access, or a shorthand property (`({ name } = value)`).
 */
function* assignmentLeaves(target) {
  const node = unwrap(target);
  switch (node.kind) {
    case SyntaxKind.ObjectLiteralExpression:
      for (const property of node.properties) {
        if (property.kind === SyntaxKind.ShorthandPropertyAssignment) yield property;
        else if (property.kind === SyntaxKind.PropertyAssignment) yield* assignmentLeaves(property.initializer);
        else if (property.kind === SyntaxKind.SpreadAssignment) yield* assignmentLeaves(property.expression);
      }
      break;
    case SyntaxKind.ArrayLiteralExpression:
      for (const element of node.elements) yield* assignmentLeaves(element);
      break;
    case SyntaxKind.SpreadElement:
      yield* assignmentLeaves(node.expression);
      break;
    // A default inside a pattern: [name = fallback] = values.
    case SyntaxKind.BinaryExpression:
      if (node.operatorToken.kind === SyntaxKind.EqualsToken) yield* assignmentLeaves(node.left);
      break;
    case SyntaxKind.OmittedExpression: break;
    default: yield node;
  }
}

/** The binding a leaf target names, if it names one directly. */
const leafBinding = (checker, leaf) => (leaf.kind === SyntaxKind.ShorthandPropertyAssignment
  ? checker.getShorthandAssignmentValueSymbol(leaf)
  : leaf.kind === SyntaxKind.Identifier ? checker.getSymbolAtLocation(leaf) : undefined);

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
    for (const leaf of assignmentLeaves(target)) {
      const found = owned.get(leafBinding(checker, leaf)?.id);
      if (found) yield found;
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

// The Object and Reflect members that write properties of their first argument.
const MUTATORS = new Map([
  ['Object', new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'])],
  ['Reflect', new Set(['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'])],
]);

/**
 * Whether a call writes properties of its first argument through `Object.<mutator>(...)` or
 * `Reflect.<mutator>(...)`, spelled as a direct call with a plain name.
 */
function isMutatorCall(node) {
  if (node.kind !== SyntaxKind.CallExpression || node.arguments.length === 0) return false;
  const callee = node.expression;
  return callee.kind === SyntaxKind.PropertyAccessExpression && callee.expression.kind === SyntaxKind.Identifier
    && MUTATORS.get(callee.expression.text)?.has(callee.name.text) === true;
}

/**
 * The ids of a binding and of every variable that takes its value: `const alias = Thing`
 * or `alias = Thing`, through type assertions and in turn. A write through an alias is a
 * write to the binding, so a part assigned or replaced that way cannot go unseen.
 */
function aliasIds(checker, sourceFile, symbol) {
  const ids = new Set([symbol.id]);
  const edges = [];
  const collect = (node) => {
    if (node.kind === SyntaxKind.VariableDeclaration && node.name.kind === SyntaxKind.Identifier && node.initializer) edges.push([node.name, node.initializer]);
    if (node.kind === SyntaxKind.BinaryExpression && node.operatorToken.kind === SyntaxKind.EqualsToken && unwrap(node.left).kind === SyntaxKind.Identifier) edges.push([unwrap(node.left), node.right]);
    node.forEachChild(collect);
  };
  collect(sourceFile);
  const holds = (expression) => {
    const node = unwrap(expression);
    return node.kind === SyntaxKind.Identifier && ids.has(checker.getSymbolAtLocation(node)?.id);
  };
  for (let grew = true; grew;) {
    grew = false;
    for (const [target, value] of edges) {
      const id = checker.getSymbolAtLocation(target)?.id;
      if (id !== undefined && !ids.has(id) && holds(value)) {
        ids.add(id);
        grew = true;
      }
    }
  }
  return ids;
}

/**
 * Whether the source writes to the binding or through it: an assignment, update, delete,
 * Object mutator, destructuring assignment, or for-in or for-of target, however deeply the
 * pattern nests it, and whether the write is made through the binding or an alias of it.
 * `allowed` holds assignment nodes already verified as harmless.
 * `displayName` also lets `<binding>.displayName = '<string literal>'` pass anywhere in
 * the source, since a display name never changes which function renders.
 */
function writesThrough({ checker }, sourceFile, symbol, { allowed = new Set(), displayName = false } = {}) {
  const ids = aliasIds(checker, sourceFile, symbol);
  const same = (node) => node.kind === SyntaxKind.Identifier && ids.has(checker.getSymbolAtLocation(node)?.id);
  const rooted = (target) => {
    let node = unwrap(target);
    while (node.kind === SyntaxKind.PropertyAccessExpression || node.kind === SyntaxKind.ElementAccessExpression) node = unwrap(node.expression);
    return same(node);
  };
  // Whether an assignment target, or any leaf of its pattern, is the binding or a path under it.
  const targets = (target) => {
    for (const leaf of assignmentLeaves(target)) {
      if (leaf.kind === SyntaxKind.ShorthandPropertyAssignment ? ids.has(checker.getShorthandAssignmentValueSymbol(leaf)?.id) : rooted(leaf)) return true;
    }
    return false;
  };
  const isDisplayNameLiteral = (node) => {
    if (node.kind !== SyntaxKind.BinaryExpression || node.operatorToken.kind !== SyntaxKind.EqualsToken) return false;
    const left = unwrap(node.left);
    const right = unwrap(node.right);
    return left.kind === SyntaxKind.PropertyAccessExpression && left.name.text === 'displayName' && same(unwrap(left.expression))
      && (right.kind === SyntaxKind.StringLiteral || right.kind === SyntaxKind.NoSubstitutionTemplateLiteral);
  };
  const writes = (node) => {
    if (allowed.has(node) || (displayName && isDisplayNameLiteral(node))) return false;
    if (node.kind === SyntaxKind.BinaryExpression && isAssignmentOperator(node.operatorToken.kind) && targets(node.left)) return true;
    if ((node.kind === SyntaxKind.PrefixUnaryExpression || node.kind === SyntaxKind.PostfixUnaryExpression) && UPDATES.has(node.operator) && rooted(node.operand)) return true;
    if (node.kind === SyntaxKind.DeleteExpression && rooted(node.expression)) return true;
    if ((node.kind === SyntaxKind.ForInStatement || node.kind === SyntaxKind.ForOfStatement) && node.initializer.kind !== SyntaxKind.VariableDeclarationList && targets(node.initializer)) return true;
    if (isMutatorCall(node) && rooted(node.arguments[0])) return true;
    let found = false;
    node.forEachChild((child) => {
      found ||= writes(child);
    });
    return found;
  };
  return writes(sourceFile);
}

const isFunctionLiteral = (node) => node.kind === SyntaxKind.ArrowFunction || node.kind === SyntaxKind.FunctionExpression;

/**
 * Whether an export's initializer is a call of a function literal, the shape of an
 * immediately invoked wrapper such as `(() => { ... })()`, with or without a PURE annotation.
 */
function isWrapperCall(initializer) {
  const node = initializer === undefined ? undefined : unwrap(initializer);
  return node?.kind === SyntaxKind.CallExpression && isFunctionLiteral(unwrap(node.expression));
}

const WRAPPER_RULE = 'an exported component\'s wrapper is called with no arguments, takes no parameters, and its block holds only const forwardRef or memo components, `<const>.displayName = \'<string literal>\'` statements, `<returned const>.<Part> = <component>` part assignments (each part once), and a final return of one of those consts';

/**
 * The functions a wrapped component export renders with: the callable it returns and the
 * parts assigned to it. A component may be initialized by a zero-argument call, optionally
 * annotated as pure, of a zero-parameter arrow or function expression, which keeps an unused
 * component out of a bundle with everything it imports. The wrapper body holds only:
 *   - const declarations, each name once, each initialized by React's forwardRef or memo,
 *     read through the first argument as for an unwrapped component;
 *   - `<const>.displayName = '<string literal>'` statements;
 *   - `<returned const>.<Part> = <component>` statements, each part once, where the Part is
 *     named in PascalCase and the component is one of the wrapper's consts (the returned one
 *     included, as in `Root = Component`), a top-level function declaration or const of the
 *     source, or a forwardRef or memo call; and
 *   - one final `return <const>`.
 * Anything else fails naming the component and this rule, so nothing the wrapper runs can
 * change which function renders. The source must write to neither the exported binding nor
 * a wrapper const other than through those statements: a part assigned later would publish
 * a stale part. Nor may either be used as a value (`valueEscape`), since an alias is a write
 * path the scan cannot follow. A top-level const a wrapper const or part follows is
 * collected in `followed` and checked by the caller like any other.
 * @returns {{ callable: object, parts: Map<string, object> }} the callable's function and each part's, by member name
 */
function wrappedComponent(project, sourceFile, chain, binding, call, followed) {
  const fail = (message) => {
    throw new ApiExtractionError(chain, `${message}; ${WRAPPER_RULE}`);
  };
  const wrapper = unwrap(call.expression);
  if (call.arguments.length > 0) fail('the wrapper is called with arguments');
  if (wrapper.parameters.length > 0) fail('the wrapper takes parameters');
  if (wrapper.typeParameters?.length || wrapper.asteriskToken || hasModifier(wrapper, SyntaxKind.AsyncKeyword)) fail('the wrapper is generic, async, or a generator');
  if (wrapper.body.kind !== SyntaxKind.Block) fail('the wrapper has an expression body');
  const consts = new Map();
  const statics = new Map();
  const verified = new Set();
  let returned;
  const { statements } = wrapper.body;
  statements.forEach((statement, index) => {
    if (statement.kind === SyntaxKind.VariableStatement) {
      const { declarationList } = statement;
      if ((declarationList.flags & NodeFlags.Const) === 0) fail('the wrapper declares a binding that is not const');
      for (const declaration of declarationList.declarations) {
        if (declaration.name.kind !== SyntaxKind.Identifier || !declaration.initializer) fail('the wrapper declares a const that is not a named, initialized binding');
        if (consts.has(declaration.name.text)) fail(`the wrapper declares ${declaration.name.text} twice`);
        consts.set(declaration.name.text, declaration);
      }
    } else if (statement.kind === SyntaxKind.ExpressionStatement) {
      const assignment = unwrap(statement.expression);
      const target = assignment.kind === SyntaxKind.BinaryExpression && assignment.operatorToken.kind === SyntaxKind.EqualsToken ? unwrap(assignment.left) : undefined;
      const onConst = target?.kind === SyntaxKind.PropertyAccessExpression && target.expression.kind === SyntaxKind.Identifier && consts.has(target.expression.text);
      if (!onConst) fail('the wrapper runs a statement that is not a displayName or part assignment to one of its consts');
      const owner = target.expression.text;
      const property = target.name.text;
      const value = unwrap(assignment.right);
      if (property === 'displayName') {
        if (value.kind !== SyntaxKind.StringLiteral && value.kind !== SyntaxKind.NoSubstitutionTemplateLiteral) fail(`the wrapper sets ${owner}.displayName to something other than a string literal`);
      } else {
        if (!REFERENCE_NAME.test(property)) fail(`the wrapper assigns ${owner}.${property}, which is neither displayName nor a part named in PascalCase`);
        if (statics.has(`${owner}.${property}`)) fail(`the wrapper assigns ${owner}.${property} twice`);
        statics.set(`${owner}.${property}`, { owner, property, value });
      }
      verified.add(assignment);
    } else if (statement.kind === SyntaxKind.ReturnStatement && index === statements.length - 1) {
      returned = statement.expression === undefined ? undefined : unwrap(statement.expression);
    } else {
      fail('the wrapper holds a statement that is not a const, a displayName or part assignment, or its final return');
    }
  });
  if (returned?.kind !== SyntaxKind.Identifier || !consts.has(returned.text)) fail('the wrapper does not end by returning one of its consts');
  for (const { owner, property } of statics.values()) {
    if (owner !== returned.text) fail(`the wrapper assigns ${owner}.${property}, but parts attach only to the returned const ${returned.text}`);
  }
  const components = new Map([...consts].map(([constName, declaration]) => {
    const initializer = unwrap(declaration.initializer);
    if (initializer.kind !== SyntaxKind.CallExpression) fail(`${constName} is not a forwardRef or memo call`);
    return [constName, wrappedFunction(project, sourceFile, chain, initializer, new Set(), followed)];
  }));
  const parts = new Map([...statics.values()].map(({ property, value }) => {
    const partChain = `${chain}.${property}`;
    if (value.kind === SyntaxKind.Identifier) {
      return [property, consts.has(value.text) ? components.get(value.text) : namedFunction(project, sourceFile, partChain, value, new Set(), followed)];
    }
    if (value.kind !== SyntaxKind.CallExpression) fail(`the wrapper assigns ${returned.text}.${property} something other than a forwardRef or memo call, one of its consts, or a top-level function or const`);
    return [property, wrappedFunction(project, sourceFile, partChain, value, new Set(), followed)];
  }));
  const writeTargets = [binding, ...[...consts.values()].map(({ name }) => name)];
  for (const target of writeTargets) {
    if (writesThrough(project, sourceFile, project.checker.getSymbolAtLocation(target), { allowed: verified })) {
      fail(`the source writes to ${target.text} beyond the wrapper's displayName and part assignments`);
    }
  }
  const escaped = valueEscape(project, sourceFile, writeTargets, { allowed: verified, finalReturn: statements.at(-1) });
  if (escaped) fail(`the source uses ${escaped.text} as a value, which could hand an alias of the component to code that replaces a part`);
  return { callable: components.get(returned.text), parts };
}

/**
 * The first place the source reaches a property-writing member of Object or Reflect other than by
 * calling it directly by its plain name (`Object.assign(target, ...)`). `const assign = Object.assign`,
 * `Object['assign']`, `const { assign } = Object`, `globalThis.Object.assign`, `({}).constructor.assign`,
 * and `Reflect.set` passed on all hide the target of a write from the scan above, so each fails here,
 * whatever it writes to. A mutator's name alone is not enough: `selection.assign()` on a class of the
 * source's own is a different method, so a name counts only on `Object`, `Reflect`, or a constructor.
 * The rule is conservative on purpose: it refuses the spelling instead of following the value. No
 * static reader can see through arbitrary dynamic code, so what it cannot follow it does not admit.
 */
function reflectiveEscape(sourceFile) {
  const globals = new Set(['Object', 'Reflect']);
  const literal = (key) => key.kind === SyntaxKind.StringLiteral || key.kind === SyntaxKind.NoSubstitutionTemplateLiteral;
  // `.constructor` of anything is, for a plain object, Object itself.
  const constructorAccess = (node) => (node.kind === SyntaxKind.PropertyAccessExpression && node.name.text === 'constructor')
    || (node.kind === SyntaxKind.ElementAccessExpression && literal(node.argumentExpression) && node.argumentExpression.text === 'constructor');
  let found;
  const visit = (node) => {
    if (found) return;
    const { parent } = node;
    if (node.kind === SyntaxKind.PropertyAccessExpression) {
      const { expression: receiver, name } = node;
      const direct = parent.kind === SyntaxKind.CallExpression && parent.expression === node;
      const global = receiver.kind === SyntaxKind.Identifier && globals.has(receiver.text) ? receiver.text : undefined;
      if (globals.has(name.text)) found = node; // The global reached through another object: globalThis.Object.
      else if (global === 'Object') found = MUTATORS.get('Object').has(name.text) && !direct ? node : undefined; // Object.assign as a value.
      else if (global === 'Reflect') found = direct ? undefined : node; // Any Reflect member not called in place.
      else if (MUTATORS.get('Object').has(name.text) && constructorAccess(receiver)) found = node; // ({}).constructor.assign
    } else if (node.kind === SyntaxKind.ElementAccessExpression) {
      const { expression: receiver, argumentExpression: key } = node;
      const global = receiver.kind === SyntaxKind.Identifier && (globals.has(receiver.text) || receiver.text === 'globalThis');
      // A computed spelling hides which member is read: Object['assign'], Reflect[name], globalThis['Object'], x['constructor']['assign'].
      if (global || (literal(key) && (globals.has(key.text) || (MUTATORS.get('Object').has(key.text) && constructorAccess(receiver))))) found = node;
    } else if (node.kind === SyntaxKind.Identifier && (globals.has(node.text) || node.text === 'globalThis')) {
      // The global itself as a value: const O = Object, const { assign } = Object, use(Reflect).
      const member = (parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === node;
      // A name being declared, or a key or member so named, is not a reference to the global; globalThis.Object is caught above.
      const label = parent.name === node && parent.kind !== SyntaxKind.ShorthandPropertyAssignment;
      const type = parent.kind === SyntaxKind.TypeReference || parent.kind === SyntaxKind.QualifiedName;
      if (!member && !label && !type) found = node;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

const MODULE_EXTENSION = /\.(?:d\.[cm]?ts|[cm]?[jt]sx?)$/u;

/**
 * The first import, re-export, dynamic import, or require in the source that names the source file
 * itself, by its own path or its built `.js` or `.mjs` name, or that names a module by an expression
 * a reader cannot resolve. `export { Thing as Alias }` followed by `import { Alias } from './thing.js'`
 * hands the source a second name for its own component, and a write through that name is invisible
 * to the scan above. The rule needs no alias resolution: a module does not import itself.
 * @returns {{ node: object, specifier: string | undefined } | undefined}
 */
function selfReference(sourceFile) {
  const self = sourceFile.fileName.replace(MODULE_EXTENSION, '');
  // A directory's index module is also named by the directory.
  const directory = self.endsWith('/index') ? self.slice(0, -'/index'.length) : undefined;
  const names = (specifier) => {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) return false;
    const target = (specifier.startsWith('file:') ? fileURLToPath(specifier) : resolve(dirname(sourceFile.fileName), specifier)).replace(MODULE_EXTENSION, '');
    return target === self || target === directory;
  };
  const literal = (node) => node?.kind === SyntaxKind.StringLiteral || node?.kind === SyntaxKind.NoSubstitutionTemplateLiteral;
  let found;
  const visit = (node) => {
    if (found) return;
    let specifier;
    let dynamic = false;
    if ((node.kind === SyntaxKind.ImportDeclaration || node.kind === SyntaxKind.ExportDeclaration) && node.moduleSpecifier) specifier = node.moduleSpecifier;
    else if (node.kind === SyntaxKind.ImportEqualsDeclaration && node.moduleReference.kind === SyntaxKind.ExternalModuleReference) specifier = node.moduleReference.expression;
    else if (node.kind === SyntaxKind.CallExpression && (node.expression.kind === SyntaxKind.ImportKeyword || (node.expression.kind === SyntaxKind.Identifier && node.expression.text === 'require'))) {
      [specifier] = node.arguments;
      dynamic = true;
    }
    if (dynamic && !literal(specifier)) found = { node, specifier: undefined };
    else if (literal(specifier) && names(specifier.text)) found = { node, specifier: specifier.text };
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

/**
 * The first reference to one of `bindings` that could hand the component itself to other code, or
 * undefined. A part is replaced by writing it on the component, and a write through an alias of
 * the component is as good as one through its name, so the scan above must see every write. It
 * cannot follow every way a value moves (a destructuring, a conditional, `Thing.Root`, a call
 * argument), and the rule does not try. It admits a binding only as:
 *   - its declaration, an export of it, or a `typeof` type query;
 *   - the target or the value of an `allowed` assignment, and the wrapper's final return;
 *   - `<binding>.<Part>` read directly, as a JSX tag, a call, or a call's argument
 *     (createElement(Thing.Item, ...)), where the part is not Root, which is the component itself.
 * Any other reference fails, since it could be an alias this scan does not see.
 */
function valueEscape({ checker }, sourceFile, bindings, { allowed = new Set(), finalReturn } = {}) {
  const ids = new Set(bindings.map((binding) => checker.getSymbolAtLocation(binding)?.id).filter((id) => id !== undefined));
  const outerOf = (node) => (WRAPPERS.has(node.parent.kind) ? outerOf(node.parent) : node);
  const jsxTag = new Set([SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxClosingElement]);
  const direct = (access) => {
    const use = access.parent;
    return (jsxTag.has(use.kind) && use.tagName === access)
      || (use.kind === SyntaxKind.CallExpression && (use.expression === access || use.arguments.some((argument) => argument === access)));
  };
  const admitted = (node) => {
    const outer = outerOf(node);
    const { parent } = outer;
    if ((parent.kind === SyntaxKind.VariableDeclaration && parent.name === node) || parent.kind === SyntaxKind.ExportSpecifier) return true;
    let name = parent;
    while (name.kind === SyntaxKind.QualifiedName) name = name.parent;
    if (name.kind === SyntaxKind.TypeQuery) return true;
    if (parent === finalReturn || (allowed.has(parent) && parent.right === outer)) return true;
    if (parent.kind !== SyntaxKind.PropertyAccessExpression || parent.expression !== outer) return false;
    const access = outerOf(parent);
    return (access.parent.kind === SyntaxKind.BinaryExpression && allowed.has(access.parent) && access.parent.left === access)
      || (parent.name.text !== 'Root' && direct(access));
  };
  let found;
  const visit = (node) => {
    if (found) return;
    if (node.kind === SyntaxKind.Identifier) {
      const shorthand = node.parent.kind === SyntaxKind.ShorthandPropertyAssignment && node.parent.name === node;
      const id = (shorthand ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node))?.id;
      if (ids.has(id) && !admitted(node)) found = node;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return found;
}

/** A short spelling of an access chain for a diagnostic: `Object.assign`, `Object[…]`. */
const spelled = (node) => {
  if (node.kind === SyntaxKind.Identifier) return node.text;
  if (node.kind === SyntaxKind.PropertyAccessExpression) return `${spelled(node.expression)}.${node.name.text}`;
  if (node.kind === SyntaxKind.ElementAccessExpression) return `${spelled(node.expression)}[…]`;
  return '…';
};

/**
 * The expression a compound export binds to `part`. A compound is a top-level const the
 * source never writes to, initialized to `Object.freeze({ Root: AvatarRoot, ... })` whose
 * properties are all `Name: value` with plain names, each once, so no spread, computed key,
 * or later write can replace the part the extraction reads. An identifier value is followed
 * to a top-level const of the source, which is collected in `followed` for the caller to check.
 */
function compoundPart(project, sourceFile, exported, name, part, followed) {
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
  const escaped = valueEscape(project, sourceFile, [exported.name]);
  if (escaped) throw new ApiExtractionError(chain, `the source uses the compound ${name} as a value, which could hand an alias of it to code that replaces a part`);
  const value = values.get(part);
  if (value === undefined) throw new ApiExtractionError(chain, `the compound ${name} has no ${part} part`);
  if (value.kind !== SyntaxKind.Identifier) return value;
  const constant = topLevelConst(project, sourceFile, value);
  if (!constant) throw new ApiExtractionError(chain, `${value.text} is not a top-level const in the component's source`);
  followed.add(constant);
  return constant.initializer;
}

/**
 * Mux UI-owned defaults from the component's props parameter in its executable source.
 * The component destructures every Mux UI-owned prop there and executes no other default
 * for one, so no default can hide in its body or a rest object. `member` names the part of
 * a compound the props belong to, none for the export itself, and `label` is the component
 * in a diagnostic.
 */
function readSourceDefaults(project, sourceFile, { exportName, member, label }, declared) {
  const exported = exportedNamed(sourceFile, exportName);
  const chain = member === undefined ? exportName : `${exportName}.${member}`;
  const self = selfReference(sourceFile);
  if (self) {
    throw new ApiExtractionError(chain, self.specifier === undefined
      ? 'the source imports or requires a module by an expression, which may name the source itself; name it by a literal specifier'
      : `the source imports itself (${self.specifier}), which gives its own component a second name this scan does not follow`);
  }
  const reflective = reflectiveEscape(sourceFile);
  if (reflective) {
    throw new ApiExtractionError(chain, `the source reaches ${spelled(reflective)} other than by calling Object or Reflect directly by name, as Object.assign(target, ...); a property-writing member reached any other way hides what it writes to`);
  }
  const initializer = exported?.node.initializer;
  const wrapped = isWrapperCall(initializer);
  const followed = new Set();
  let component;
  if (wrapped) {
    // A callable compound is its own root; its other parts are the statics assigned in the wrapper.
    const { callable, parts } = wrappedComponent(project, sourceFile, chain, exported.name, unwrap(initializer), followed);
    if (member === undefined && parts.has('Root') && parts.get('Root') !== callable) {
      throw new ApiExtractionError(chain, `${exportName}.Root is not ${exportName} itself; name the root part ('Root') in the derived component list`);
    }
    if (member !== undefined && !parts.has(member)) throw new ApiExtractionError(chain, `the exported ${exportName} has no ${member} part assigned in its wrapper`);
    component = member === undefined ? callable : parts.get(member);
  } else if (member !== undefined) {
    // A compound's defaults are its part's, whatever else the export is.
    component = componentFunction(project, sourceFile, chain, compoundPart(project, sourceFile, exported, exportName, member, followed), new Set(), followed);
  } else {
    component = exported?.node.kind === SyntaxKind.FunctionDeclaration ? exported.node
      : componentFunction(project, sourceFile, chain, initializer, new Set(), followed);
  }
  if (!component) throw new ApiExtractionError(exportName, `the source exports no component function${member === undefined ? '' : ` as ${exportName}.${member}`} to read defaults from`);
  // The function read above is the one that renders only while every binding it was read through stays as it was.
  // A wrapper or compound export is checked more strictly where it is read; a plain export is checked here.
  const through = [...followed].map((declaration) => declaration.name);
  if (member === undefined && !wrapped && exported.node.kind === SyntaxKind.VariableDeclaration) through.unshift(exported.name);
  for (const binding of through) {
    if (writesThrough(project, sourceFile, project.checker.getSymbolAtLocation(binding), { displayName: true })) {
      throw new ApiExtractionError(chain, `the source writes to ${binding.text}, which the component's defaults are read through, beyond a literal displayName assignment; a component is set once, so no write can change the function it renders with`);
    }
  }
  const [parameter] = component.parameters;
  if (parameter?.name.kind !== SyntaxKind.ObjectBindingPattern) {
    throw new ApiExtractionError(label, 'the props parameter must be an object pattern that destructures the Mux UI-owned props');
  }
  const bound = new Map();
  for (const element of parameter.name.elements) {
    // Host passthrough props, such as Button's type = 'button', are not Mux UI-owned.
    if (!element.dotDotDotToken) bound.set(propertyName(element.propertyName ?? element.name, label), element);
  }
  const value = defaultReader({ project, sourceFile });
  const defaults = {};
  const owned = new Map();
  for (const prop of [...declared.props, ...Object.values(declared.eventDetails).map(({ prop: eventProp }) => eventProp)]) {
    const element = bound.get(prop);
    if (!element) throw new ApiExtractionError(`${label}.${prop}`, 'the props parameter must destructure each Mux UI-owned prop');
    const event = !declared.props.includes(prop);
    const defaulted = element.initializer !== undefined;
    if (defaulted && event) throw new ApiExtractionError(`${label}.${prop}`, 'an on<Event> prop has no default');
    if (defaulted) defaults[prop] = value(element.initializer, `${label}.${prop}`);
    // The parameter default decides whether a fallback on the binding can apply to an omitted prop.
    if (element.name.kind === SyntaxKind.Identifier) owned.set(project.checker.getSymbolAtLocation(element.name).id, { prop, event, defaulted, value: defaults[prop] });
  }
  assertNoExecutedDefaults(project.checker, component, label, owned);
  return defaults;
}

const ANATOMY_PART = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * Extracts each component's API. A component names its export, its emitted declaration
 * file, and, when defaults are wanted, its TypeScript source. The API is that of its root:
 * the export itself, or, for a compound whose root is another part, the `part` named. A
 * callable compound (ListBox, whose Item is `ListBox.Item`) is its own root, and `parts`
 * maps each of its other anatomy parts that owns Mux UI props to its export member
 * (`{ item: 'Item' }`); each is read like the root, from `<Name><Member>OwnProps`, into
 * `partApis`, with defaults when the component's source is given, as for the root. `callable` names the anatomy part whose props the export itself must also carry
 * unchanged (Menu, whose callable is its List): a check, not data. Types declared under
 * `declarationRoot` are Mux UI-owned; any other reference must be an exact host type on
 * the allowlist. Returns a Map from export name to `{ props, events, defaults?,
 * propDetails, eventDetails, types, partApis? }`, with `types` sorted by name.
 * @param {{ declarationRoot: string, components: { name: string, declarations: string, source?: string, part?: string, callable?: string, parts?: Record<string, string> }[], hostAllowlist?: readonly string[] }} options
 */
export function extractApis({ declarationRoot, components, hostAllowlist = HOST_ALLOWLIST }) {
  const allowed = assertHostAllowlist(hostAllowlist);
  const root = resolve(declarationRoot);
  const files = components.flatMap(({ declarations, source }) => [resolve(declarations), ...(source ? [resolve(source)] : [])]);
  return withProject(files, (project) => new Map(components.map(({ name, declarations, source, part, callable, parts = {} }) => {
    const declarationFile = project.program.getSourceFile(resolve(declarations));
    const sourceFile = source ? project.program.getSourceFile(resolve(source)) : undefined;
    // One block: the API of the export's root, or of one part of it.
    const read = ({ ownName, member, label, part: isPart = false }) => {
      const reader = declarationReader({ project, declarationRoot: root, allowed });
      const declared = readDeclaredApi(reader, project.checker, declarationFile, { exportName: name, ownName, member, label });
      if (isPart && declared.props.length === 0 && declared.events.length === 0) {
        throw new ApiExtractionError(label, `${ownName}OwnProps declares no Mux UI-owned prop; a part without Mux UI-owned props has no partApis entry`);
      }
      const types = Object.fromEntries([...reader.types].sort(([left], [right]) => left.localeCompare(right))
        .map(([typeName, { symbol: _symbol, ...definition }]) => [typeName, definition]));
      // A prop whose type is a finite set of literals also lists them, in declaration order.
      const propDetails = Object.fromEntries(Object.entries(declared.propDetails).map(([prop, { type, required, ...documented }]) => {
        const values = literalValues(type, types);
        return [prop, { type, required, ...(values === null ? {} : { enum: values }), ...documented }];
      }));
      const defaults = sourceFile ? readSourceDefaults(project, sourceFile, { exportName: name, member, label }, declared) : undefined;
      return {
        props: declared.props,
        events: declared.events,
        ...(defaults === undefined ? {} : { defaults }),
        propDetails,
        eventDetails: declared.eventDetails,
        types,
      };
    };
    const api = read({ ownName: name, member: part, label: name });
    const members = new Map();
    const partApis = Object.fromEntries(Object.entries(parts).map(([anatomyPart, member]) => {
      const label = `${name}.${member}`;
      if (!ANATOMY_PART.test(anatomyPart) || !REFERENCE_NAME.test(member)) {
        throw new ApiExtractionError(label, `parts maps an anatomy part, such as item, to an export member, such as Item; not ${anatomyPart} to ${member}`);
      }
      if (member === part) throw new ApiExtractionError(label, `${anatomyPart} maps to ${member}, which is the root part; the root's API is the family-level block`);
      if (members.has(member)) throw new ApiExtractionError(label, `${members.get(member)} and ${anatomyPart} both map to ${member}; a member has one anatomy part`);
      members.set(member, anatomyPart);
      return [anatomyPart, { member, ...read({ ownName: `${name}${member}`, member, label, part: true }) }];
    }));
    if (callable !== undefined) {
      const member = parts[callable];
      if (member === undefined) throw new ApiExtractionError(name, `callable names ${callable}, which is not one of the parts`);
      // The export itself must carry that part's props with the same types and requiredness.
      readDeclaredApi(declarationReader({ project, declarationRoot: root, allowed }), project.checker, declarationFile, { exportName: name, ownName: `${name}${member}`, member: undefined, label: `${name} (callable)` });
    }
    return [name, { ...api, ...(Object.keys(partApis).length === 0 ? {} : { partApis }) }];
  })));
}
