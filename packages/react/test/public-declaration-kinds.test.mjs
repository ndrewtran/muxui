import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { SyntaxKind } from 'typescript/unstable/ast';
import { API, SymbolFlags } from 'typescript/unstable/sync';

const packageRoot = resolve(import.meta.dirname, '..');
const DECLARATION_KINDS = {
  [SyntaxKind.InterfaceDeclaration]: 'interface',
  [SyntaxKind.TypeAliasDeclaration]: 'type',
  [SyntaxKind.FunctionDeclaration]: 'function',
  [SyntaxKind.ClassDeclaration]: 'class',
  [SyntaxKind.EnumDeclaration]: 'enum',
  [SyntaxKind.ModuleDeclaration]: 'namespace',
  [SyntaxKind.VariableDeclaration]: 'const',
};

/** Each name the barrel exports, with the kinds of the declarations it resolves to through any re-export. */
function barrelKinds(entry) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-declaration-kinds-'));
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, `${JSON.stringify({
    compilerOptions: { target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', types: [], strict: true, noEmit: true, skipLibCheck: true },
    files: [entry],
  })}\n`);
  const api = new API({ cwd: directory });
  try {
    const { checker, program } = api.updateSnapshot({ openProjects: [config] }).getProject(config);
    const barrel = checker.getSymbolAtLocation(program.getSourceFile(entry));
    return Object.fromEntries(checker.getExportsOfModule(barrel).map((symbol) => {
      const { declarations } = symbol.flags & SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      const kinds = declarations.map(({ kind }) => DECLARATION_KINDS[kind] ?? SyntaxKind[kind]);
      return [symbol.name, [...new Set(kinds)].sort().join('+')];
    }));
  } finally {
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

// A TypeScript move re-emits each public type, and the emit follows what the source declares. An
// interface is open to consumers' module augmentation and a type alias is not, and a type alias is
// assignable to an index signature where an interface is not, so a name that changes kind changes
// the public API. The record is the kinds the barrel had before the moves, read from git history.
test('every name the package barrel exported before the TypeScript moves keeps its declaration kind', () => {
  const { kinds: recorded } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/public-declaration-kinds.json'), 'utf8'));
  const current = barrelKinds(resolve(packageRoot, 'generated/index.d.ts'));
  assert.deepEqual(
    Object.entries(recorded).filter(([name, kind]) => name in current && current[name] !== kind).map(([name, kind]) => `${name}: ${kind} -> ${current[name]}`),
    [],
  );
  // The record still names real exports; a rename is a decision to make in the record.
  assert.deepEqual(Object.keys(recorded).filter((name) => !(name in current)), []);
});
