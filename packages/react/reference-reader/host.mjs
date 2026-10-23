/**
 * What the declaration reader needs of a TypeScript compiler, and nothing else. The reader never
 * imports `typescript`: a host opens the staged package, answers which declaration a name resolves to,
 * and hides the few places where the compilers' syntax trees differ. The production host is
 * TypeScript 7 (`typescript/unstable/sync`, pinned exactly in package.json), and a test-only
 * TypeScript 6 host must read the same files to byte-identical output.
 *
 * A host is `{ name, version, open({ directory, files }, use) }`. `open` starts a compiler session over
 * `files` (absolute paths of declaration files inside `directory`), runs `use(session)`, and closes the
 * session when `use` returns or throws.
 *
 * @typedef {object} Resolved What an entity name or expression names, after any import alias.
 * @property {'declared' | 'typeParameter' | 'unresolved'} kind
 * @property {string} name The symbol's own name.
 * @property {readonly object[]} declarations Its declaration nodes.
 * @property {'package' | 'react' | 'library' | 'other'} origin Where those declarations sit: the staged package,
 *   @types/react, the default library, or anywhere else.
 *
 * @typedef {object} ExportEntry
 * @property {string} name The exported name a consumer imports.
 * @property {Resolved} resolved What it resolves to through any re-export.
 *
 * @typedef {object} Session
 * @property {() => string[]} diagnostics Every diagnostic of the program, one line each; empty when it is clean.
 * @property {(path: string) => object} sourceFile
 * @property {(path: string) => readonly ExportEntry[]} exportsOf The names a module file exports, as a consumer sees them.
 * @property {(entity: object) => Resolved} resolve The symbol an entity name, or the expression of a heritage clause, names.
 * @property {(node: object) => string} kind A fixed kind name (`PropertySignature`), never the compiler's numeric kind.
 * @property {(node: object) => boolean} optional Whether the declaration carries a `?`.
 * @property {(node: object, modifier: 'readonly' | 'export' | 'declare') => boolean} hasModifier
 * @property {(typeParameter: object) => object | undefined} defaultOf The type node of a type parameter's default.
 * @property {(node: object) => 'readonly' | 'keyof' | 'unique' | undefined} operator The operator of a type operator node.
 * @property {(node: object) => { value: string | number | boolean | null } | undefined} literalOf The value of the literal
 *   a literal type holds: a string, a number (negative ones too), `true`, `false` or `null`; undefined for anything else.
 * @property {(node: object) => string | undefined} doc The text of the declaration's own JSDoc comment, when it has one.
 * @property {(node: object) => string} fileOf The real path of the file a node sits in.
 * @property {(node: object) => number} startOf A node's start offset in its file; with the file it identifies a declaration.
 */

/**
 * The syntax kinds the reader admits, by the names both compilers' enums share. A host answers `kind`
 * with one of these, or with `?<name>` for any other node, which the reader rejects by name.
 */
export const KIND_NAMES = Object.freeze([
  'SourceFile', 'InterfaceDeclaration', 'TypeAliasDeclaration', 'FunctionDeclaration', 'VariableStatement',
  'VariableDeclaration', 'ClassDeclaration', 'EnumDeclaration', 'ModuleDeclaration',
  'PropertySignature', 'MethodSignature', 'CallSignature', 'ConstructSignature', 'IndexSignature',
  'GetAccessor', 'SetAccessor', 'Parameter', 'TypeParameter', 'HeritageClause', 'ExpressionWithTypeArguments',
  'Identifier', 'QualifiedName', 'PropertyAccessExpression', 'StringLiteral', 'NumericLiteral', 'ComputedPropertyName',
  'ObjectBindingPattern', 'ArrayBindingPattern',
  'StringKeyword', 'NumberKeyword', 'BooleanKeyword', 'BigIntKeyword', 'SymbolKeyword', 'ObjectKeyword',
  'VoidKeyword', 'UndefinedKeyword', 'NullKeyword', 'NeverKeyword', 'UnknownKeyword', 'AnyKeyword', 'IntrinsicKeyword',
  'TypeReference', 'FunctionType', 'ConstructorType', 'TypeQuery', 'TypeLiteral', 'ArrayType', 'TupleType',
  'OptionalType', 'RestType', 'NamedTupleMember', 'UnionType', 'IntersectionType', 'ConditionalType', 'InferType',
  'ParenthesizedType', 'ThisType', 'TypeOperator', 'IndexedAccessType', 'MappedType', 'LiteralType',
  'TemplateLiteralType', 'TypePredicate', 'ImportType',
  'TrueKeyword', 'FalseKeyword', 'PrefixUnaryExpression', 'MinusToken', 'PlusToken',
  'ReadonlyKeyword', 'KeyOfKeyword', 'UniqueKeyword', 'DotDotDotToken', 'QuestionToken',
  'ImportDeclaration', 'ExportDeclaration', 'ExportAssignment', 'ExportKeyword', 'DeclareKeyword', 'AssertsKeyword',
]);

const SESSION_FUNCTIONS = ['diagnostics', 'sourceFile', 'exportsOf', 'resolve', 'kind', 'optional', 'hasModifier', 'defaultOf', 'operator', 'literalOf', 'doc', 'fileOf', 'startOf'];

/** Fails when a host does not provide the whole contract, so a test double cannot silently skip part of it. */
export function assertSession(session) {
  const missing = SESSION_FUNCTIONS.filter((name) => typeof session[name] !== 'function');
  if (missing.length > 0) throw new Error(`MUXUI_REACT_REFERENCE_HOST: the session lacks ${missing.join(', ')}`);
  return session;
}
