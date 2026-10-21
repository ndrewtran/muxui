// Reads what the package barrel declares: the kind of declaration behind each exported name, and
// which exported types a consumer can use where TypeScript wants an index signature. The record
// in test/fixtures/public-declaration-kinds.json comes from running this on the declarations
// before the TypeScript moves:
//
//   node test/support/declaration-surface.mjs <generated directory>
//
// which prints the record's indexSignatureCompatible field: the types compatible both with and
// without exactOptionalPropertyTypes.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SyntaxKind } from 'typescript/unstable/ast';
import { API, SymbolFlags } from 'typescript/unstable/sync';

const DECLARATION_KINDS = {
  [SyntaxKind.InterfaceDeclaration]: 'interface',
  [SyntaxKind.TypeAliasDeclaration]: 'type',
  [SyntaxKind.FunctionDeclaration]: 'function',
  [SyntaxKind.ClassDeclaration]: 'class',
  [SyntaxKind.EnumDeclaration]: 'enum',
  [SyntaxKind.ModuleDeclaration]: 'namespace',
  [SyntaxKind.VariableDeclaration]: 'const',
};

/** The compiler the packed consumer runs, which still applies TypeScript 6's rules; the pinned TypeScript 7 does not. */
export const consumerTsc = resolve(import.meta.dirname, '../../../../node_modules/.pnpm/node_modules/.bin/tsc');

/**
 * Each name the barrel exports with the kind of declaration it resolves to through any re-export
 * (`kind`, the kinds joined by `+` when merged) and whether it takes type parameters.
 */
export function barrelDeclarations(entry) {
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
      return [symbol.name, { kind: [...new Set(kinds)].sort().join('+'), generic: declarations.some((declaration) => declaration.resolve()?.typeParameters?.length > 0) }];
    }));
  } finally {
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * The exported types that satisfy `T extends Record<string, unknown>`, as a consumer's
 * generic constraint does. A type alias of object literal types qualifies, an interface does
 * not, and an intersection qualifies only when every part does. TypeScript 7 accepts both, so
 * this runs the TypeScript 6 compiler. `specifier` is what the probe imports the barrel as.
 */
export function indexSignatureCompatible({ directory, specifier, names, exactOptionalPropertyTypes, tsc = consumerTsc }) {
  const probe = join(directory, 'index-signature-probe.ts');
  const config = join(directory, 'tsconfig.index-signature.json');
  writeFileSync(probe, [
    `import type * as Package from '${specifier}';`,
    'type Accepts<T extends Record<string, unknown>> = T;',
    ...names.map((name, index) => `export type Probe${index} = Accepts<Package.${name}>;`),
  ].join('\n'));
  writeFileSync(config, `${JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true, types: [], exactOptionalPropertyTypes },
    files: ['index-signature-probe.ts'],
  })}\n`);
  const result = spawnSync(tsc, ['--noEmit', '--pretty', 'false', '-p', config], { cwd: directory, encoding: 'utf8' });
  const rejected = new Set();
  // The compiler prints each diagnostic on a line of its own, with any elaboration indented below it.
  for (const line of result.stdout.split('\n').filter((text) => text !== '' && !/^\s/u.test(text))) {
    const [, row, code] = /index-signature-probe\.ts\((\d+),\d+\): error (TS\d+):/u.exec(line) ?? [];
    // Only the constraint failing counts; a name that does not resolve must not read as compatible.
    if (code !== 'TS2344') throw new Error(`index-signature probe: ${line}`);
    rejected.add(names[Number(row) - 3]);
  }
  return names.filter((name) => !rejected.has(name));
}

// The types of one declarations directory that are compatible in both optional-property modes.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const entry = resolve(process.argv[2], 'index.d.ts');
  const names = Object.entries(barrelDeclarations(entry))
    .filter(([, { kind, generic }]) => !generic && (kind === 'interface' || kind === 'type'))
    .map(([name]) => name).sort();
  const directory = mkdtempSync(join(tmpdir(), 'muxui-index-signature-'));
  try {
    const specifier = entry.replace(/\.d\.ts$/u, '.js');
    const compatible = [false, true].map((exactOptionalPropertyTypes) => indexSignatureCompatible({ directory, specifier, names, exactOptionalPropertyTypes }));
    console.log(JSON.stringify(compatible[0].filter((name) => compatible[1].includes(name)), null, 2));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
