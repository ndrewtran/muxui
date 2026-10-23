/**
 * The production compiler host: TypeScript 7 through its unstable synchronous API. The package pins the
 * compiler to an exact version because that API has no stability promise (TypeScript 7.1 reworks it as
 * `typescript/sync`); a future migration changes this file and nothing else.
 *
 * What differs from the TypeScript 6 classic API, and is absorbed here:
 * - the optional marker of a property or method signature is `postfixToken`, not `questionToken`;
 * - a type parameter's default is `defaultType`, not `default`;
 * - `SyntaxKind[kind]` can name a kind by a range marker (`FirstLiteralToken`), so kinds are compared
 *   through a fixed table of the names the reader admits;
 * - a symbol's declarations are handles that resolve against the project;
 * - the native checker aborts when asked for the alias target of a symbol that is not an alias.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SyntaxKind, getTextOfJSDocComment } from 'typescript/unstable/ast';
import { API, SymbolFlags } from 'typescript/unstable/sync';
import { KIND_NAMES, assertSession } from './host.mjs';

const REACT_TYPES = /[\\/]node_modules[\\/]@types[\\/]react[\\/]/u;
const KIND_BY_NUMBER = new Map(KIND_NAMES.map((name) => [SyntaxKind[name], name]));
const MODIFIERS = { readonly: SyntaxKind.ReadonlyKeyword, export: SyntaxKind.ExportKeyword, declare: SyntaxKind.DeclareKeyword };

const version = createRequire(import.meta.url)('typescript/package.json').version;

/** `lib` is set so the DOM host types (HTMLDivElement) resolve; `types` is empty so no ambient package leaks in. */
export const READER_COMPILER_OPTIONS = Object.freeze({
  target: 'ESNext',
  module: 'NodeNext',
  moduleResolution: 'NodeNext',
  lib: ['ESNext', 'DOM', 'DOM.Iterable'],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: false,
});

function createSession(project, directory) {
  const { checker, program } = project;
  // The staged package is a scratch directory, so a diagnostic names its files relative to it.
  const formatDiagnostic = (diagnostic) => {
    const text = typeof diagnostic.text === 'string' ? diagnostic.text : (diagnostic.messageText ?? JSON.stringify(diagnostic));
    const file = diagnostic.fileName?.startsWith(`${directory}/`) ? diagnostic.fileName.slice(directory.length + 1) : diagnostic.fileName;
    return `${file ?? '<program>'}${diagnostic.pos === undefined ? '' : `@${diagnostic.pos}`}: TS${diagnostic.code}: ${text}`;
  };
  const stage = directory.toLowerCase();
  const originOf = (declarations) => {
    if (declarations.length === 0) return 'other';
    const files = declarations.map((declaration) => declaration.getSourceFile());
    const names = files.map((file) => file.fileName);
    if (names.every((name) => name.toLowerCase().startsWith(stage))) return 'package';
    if (names.every((name) => REACT_TYPES.test(name))) return 'react';
    if (files.every((file) => program.isSourceFileDefaultLibrary(file))) return 'library';
    // A global that @types/react augments declares in both, and is still a host type.
    if (names.every((name, index) => REACT_TYPES.test(name) || program.isSourceFileDefaultLibrary(files[index]))) return 'library';
    return 'other';
  };
  const describe = (symbol) => {
    const target = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (checker.isUnknownSymbol(target)) return { kind: 'unresolved', name: symbol.name, declarations: [], origin: 'other' };
    if (target.flags & SymbolFlags.TypeParameter) return { kind: 'typeParameter', name: target.name, declarations: [], origin: 'package' };
    const declarations = target.declarations.map((handle) => handle.resolve(project));
    return { kind: 'declared', name: target.name, declarations, origin: originOf(declarations) };
  };
  return assertSession({
    diagnostics: () => [
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getProgramDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getBindDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ].map(formatDiagnostic),
    sourceFile(path) {
      const file = program.getSourceFile(path);
      if (file === undefined) throw new Error(`MUXUI_REACT_REFERENCE_HOST: ${path} is not part of the program`);
      return file;
    },
    exportsOf(path) {
      const module = checker.getSymbolAtLocation(program.getSourceFile(path));
      if (module === undefined) return [];
      return checker.getExportsOfModule(module).map((exported) => ({ name: exported.name, resolved: describe(exported) }));
    },
    resolve(entity) {
      const symbol = checker.getSymbolAtLocation(entity);
      return symbol === undefined ? { kind: 'unresolved', name: entity.getText?.() ?? '?', declarations: [], origin: 'other' } : describe(symbol);
    },
    kind: (node) => KIND_BY_NUMBER.get(node.kind) ?? `?${SyntaxKind[node.kind] ?? node.kind}`,
    optional: (node) => (node.postfixToken ?? node.questionToken) !== undefined,
    hasModifier: (node, modifier) => (node.modifiers ?? []).some(({ kind }) => kind === MODIFIERS[modifier]),
    defaultOf: (typeParameter) => typeParameter.defaultType,
    operator: (node) => ({ [SyntaxKind.ReadonlyKeyword]: 'readonly', [SyntaxKind.KeyOfKeyword]: 'keyof', [SyntaxKind.UniqueKeyword]: 'unique' })[node.operator],
    literalOf(literal) {
      switch (literal.kind) {
        case SyntaxKind.StringLiteral: return { value: literal.text };
        case SyntaxKind.NumericLiteral: return { value: Number(literal.text) };
        case SyntaxKind.TrueKeyword: return { value: true };
        case SyntaxKind.FalseKeyword: return { value: false };
        case SyntaxKind.NullKeyword: return { value: null };
        case SyntaxKind.PrefixUnaryExpression:
          return literal.operator === SyntaxKind.MinusToken && literal.operand.kind === SyntaxKind.NumericLiteral ? { value: -Number(literal.operand.text) } : undefined;
        default: return undefined;
      }
    },
    doc(node) {
      // A variable's comment sits on its statement, two levels up.
      const holder = node.kind === SyntaxKind.VariableDeclaration ? node.parent?.parent : node;
      const comments = holder?.jsDoc;
      if (comments === undefined || comments.length === 0) return undefined;
      const text = getTextOfJSDocComment(comments[comments.length - 1].comment);
      return text === undefined || text.trim() === '' ? undefined : text.replaceAll('\r\n', '\n').trim();
    },
    fileOf: (node) => node.getSourceFile().fileName,
    startOf: (node) => node.getStart(),
  });
}

/** The TypeScript 7 host. See host.mjs for the contract. */
export const typescript7Host = Object.freeze({
  name: 'typescript-7',
  version,
  open({ directory, files, compilerOptions = READER_COMPILER_OPTIONS }, use) {
    // The project file lives beside the staged package, outside the declarations' own scope.
    const scratch = mkdtempSync(join(tmpdir(), 'muxui-reference-host-'));
    const config = join(scratch, 'tsconfig.json');
    writeFileSync(config, `${JSON.stringify({ compilerOptions, files })}\n`);
    const api = new API({ cwd: directory });
    try {
      const project = api.updateSnapshot({ openProjects: [config] }).getProject(config);
      return use(createSession(project, directory));
    } finally {
      api.close();
      rmSync(scratch, { recursive: true, force: true });
    }
  },
});
