// The test-only TypeScript 6 host of the declaration reader, on the classic compiler API. It exists to
// prove that the reader's output does not depend on the compiler that produced the syntax tree: the same
// declarations must read to byte-identical graphs and models under TypeScript 7 (the production host) and
// here. See reference-reader/host.mjs for the contract; the notes on host-typescript7.mjs list what differs.
import { createRequire } from 'node:module';
import ts from 'typescript-6';
import { KIND_NAMES, assertSession } from '../../reference-reader/host.mjs';
import { READER_COMPILER_OPTIONS } from '../../reference-reader/host-typescript7.mjs';

const REACT_TYPES = /[\\/]node_modules[\\/]@types[\\/]react[\\/]/u;
const KIND_BY_NUMBER = new Map(KIND_NAMES.map((name) => [ts.SyntaxKind[name], name]));
const MODIFIERS = { readonly: ts.SyntaxKind.ReadonlyKeyword, export: ts.SyntaxKind.ExportKeyword, declare: ts.SyntaxKind.DeclareKeyword };
const version = createRequire(import.meta.url)('typescript-6/package.json').version;

function createSession(program, directory) {
  const checker = program.getTypeChecker();
  const stage = directory.toLowerCase();
  const originOf = (declarations) => {
    if (declarations.length === 0) return 'other';
    const files = declarations.map((declaration) => declaration.getSourceFile());
    const names = files.map((file) => file.fileName);
    if (names.every((name) => name.toLowerCase().startsWith(stage))) return 'package';
    if (names.every((name) => REACT_TYPES.test(name))) return 'react';
    if (names.every((name, index) => REACT_TYPES.test(name) || program.isSourceFileDefaultLibrary(files[index]))) return 'library';
    return 'other';
  };
  const describe = (symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (target.flags & ts.SymbolFlags.TypeParameter) return { kind: 'typeParameter', name: target.name, declarations: [], origin: 'package' };
    const declarations = target.declarations ?? [];
    if (declarations.length === 0) return { kind: 'unresolved', name: symbol.name, declarations: [], origin: 'other' };
    return { kind: 'declared', name: target.name, declarations, origin: originOf(declarations) };
  };
  const format = (diagnostic) => {
    const name = diagnostic.file?.fileName;
    const file = name?.startsWith(`${directory}/`) ? name.slice(directory.length + 1) : name;
    return `${file ?? '<program>'}${diagnostic.start === undefined ? '' : `@${diagnostic.start}`}: TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  };
  return assertSession({
    diagnostics: () => [
      ...program.getConfigFileParsingDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ].map(format),
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
      return symbol === undefined ? { kind: 'unresolved', name: entity.getText(), declarations: [], origin: 'other' } : describe(symbol);
    },
    kind: (node) => KIND_BY_NUMBER.get(node.kind) ?? `?${ts.SyntaxKind[node.kind] ?? node.kind}`,
    optional: (node) => node.questionToken !== undefined,
    hasModifier: (node, modifier) => (node.modifiers ?? []).some(({ kind }) => kind === MODIFIERS[modifier]),
    defaultOf: (typeParameter) => typeParameter.default,
    operator: (node) => ({ [ts.SyntaxKind.ReadonlyKeyword]: 'readonly', [ts.SyntaxKind.KeyOfKeyword]: 'keyof', [ts.SyntaxKind.UniqueKeyword]: 'unique' })[node.operator],
    literalOf(literal) {
      switch (literal.kind) {
        case ts.SyntaxKind.StringLiteral: return { value: literal.text };
        case ts.SyntaxKind.NumericLiteral: return { value: Number(literal.text) };
        case ts.SyntaxKind.TrueKeyword: return { value: true };
        case ts.SyntaxKind.FalseKeyword: return { value: false };
        case ts.SyntaxKind.NullKeyword: return { value: null };
        case ts.SyntaxKind.PrefixUnaryExpression:
          return literal.operator === ts.SyntaxKind.MinusToken && literal.operand.kind === ts.SyntaxKind.NumericLiteral ? { value: -Number(literal.operand.text) } : undefined;
        default: return undefined;
      }
    },
    doc(node) {
      const holder = node.kind === ts.SyntaxKind.VariableDeclaration ? node.parent?.parent : node;
      const comments = holder?.jsDoc;
      if (comments === undefined || comments.length === 0) return undefined;
      const text = ts.getTextOfJSDocComment(comments[comments.length - 1].comment);
      return text === undefined || text.trim() === '' ? undefined : text.replaceAll('\r\n', '\n').trim();
    },
    fileOf: (node) => node.getSourceFile().fileName,
    startOf: (node) => node.getStart(),
  });
}

/** The TypeScript 6 host, for tests only. */
export const typescript6Host = Object.freeze({
  name: 'typescript-6',
  version,
  open({ directory, files, compilerOptions = READER_COMPILER_OPTIONS }, use) {
    const { options, errors } = ts.convertCompilerOptionsFromJson(compilerOptions, directory);
    if (errors.length > 0) throw new Error(`MUXUI_REACT_REFERENCE_HOST: ${errors.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, '\n')).join('; ')}`);
    return use(createSession(ts.createProgram({ rootNames: files, options }), directory));
  },
});
