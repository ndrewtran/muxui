// Reads what the package barrel declares: the kind of declaration behind each exported name, which
// exported types a consumer can use where TypeScript wants an index signature, and which exported
// types a consumer's module augmentation of an exported interface reaches. The records in
// test/fixtures/public-declaration-kinds.json and test/fixtures/public-augmentation-reach.json come
// from running this on the declarations before the TypeScript moves:
//
//   node test/support/declaration-surface.mjs <generated directory>
//   node test/support/declaration-surface.mjs --reach <generated directory>
//
// The first prints the kinds record's indexSignatureCompatible field: the types compatible both with
// and without exactOptionalPropertyTypes. The second prints the augmentation record's reach field,
// leaving out each interface that reaches no other type.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

/**
 * The compiler options of a strict consumer: bundler resolution and no synthetic default imports,
 * where a declaration that default-imports a CommonJS `export =` module (`import React from 'react'`)
 * fails with TS1259. TypeScript 6 deprecates the two interop flags, which TypeScript 7 removes; drop
 * `ignoreDeprecations` with them.
 */
export const STRICT_CONSUMER_COMPILER_OPTIONS = {
  module: 'ESNext',
  moduleResolution: 'Bundler',
  esModuleInterop: false,
  allowSyntheticDefaultImports: false,
  skipLibCheck: false,
  ignoreDeprecations: '6.0',
};

/** `script`, a TypeScript compiler's `bin/tsc`, once it reports TypeScript 6; anything else throws. */
export function verifiedTypeScript6(script) {
  const { stdout } = spawnSync(process.execPath, [script, '--version'], { encoding: 'utf8' });
  if (!stdout.startsWith('Version 6.')) throw new Error(`The consumer checks need TypeScript 6; ${script} reports ${JSON.stringify(stdout.trim())}`);
  return script;
}

/** The script of the package's own compiler, TypeScript 7. Run it as `node <script>`. */
export function typeScript7Tsc() {
  return resolve(dirname(createRequire(import.meta.url).resolve('typescript/package.json')), 'bin/tsc');
}

let consumerScript;

/**
 * The script of the TypeScript 6 compiler the packed consumer runs. The strict-consumer check needs
 * it (TypeScript 7 removed the interop flags it sets), and the index-compatibility record was taken
 * under it. It is the package's `typescript-6` alias, never pnpm's hoisted `tsc`, which is
 * TypeScript 6 on one install and 7 on another. Run it as `node <script>`.
 */
export function consumerTsc() {
  consumerScript ??= verifiedTypeScript6(resolve(dirname(createRequire(import.meta.url).resolve('typescript-6/package.json')), 'bin/tsc'));
  return consumerScript;
}

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
 * not, and an intersection qualifies only when every part does. The record this is compared
 * with was taken under TypeScript 6, so this runs it (`tsc` is its script). `specifier` is what
 * the probe imports the barrel as.
 */
export function indexSignatureCompatible({ directory, specifier, names, exactOptionalPropertyTypes, tsc = consumerTsc() }) {
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
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', config], { cwd: directory, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.error) throw result.error;
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

/**
 * Which exported types carry the optional key a consumer adds to an exported interface by module
 * augmentation (`declare module '<specifier>' { interface I { key?: string } }`), as
 * `{ [interface]: [type, ...] }` with each list sorted and without the interface itself. An interface
 * is open to augmentation, so a props type that intersects or extends it takes the consumer's key and
 * a flat copy of its members does not. Every interface carries its own key, so one compile answers for
 * all of them. A type carries a key when every arm of it names the key; an index signature
 * does not count. `tsc` is the compiler's script and `specifier` is what the probe imports the barrel as.
 */
export function augmentationReach({ directory, specifier, interfaces, types, tsc = consumerTsc() }) {
  const probe = join(directory, 'augmentation-reach-probe.ts');
  const config = join(directory, 'tsconfig.augmentation-reach.json');
  const header = [
    `import type * as Package from '${specifier}';`,
    `declare module '${specifier}' {`,
    ...interfaces.map((name, index) => `  interface ${name} { __muxuiReach${index}?: string }`),
    '}',
    'type Carries<T, Key extends string> = [T extends unknown ? (string extends keyof T ? false : Key extends keyof T ? true : false) : never] extends [true] ? true : false;',
    'type Assert<T extends true> = T;',
  ];
  const pairs = interfaces.flatMap((name, index) => types.filter((type) => type !== name).map((type) => ({ name, type, index })));
  writeFileSync(probe, [
    ...header,
    ...pairs.map(({ type, index }, row) => `export type Probe${row} = Assert<Carries<Package.${type}, '__muxuiReach${index}'>>;`),
  ].join('\n'));
  writeFileSync(config, `${JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true, types: [] },
    files: ['augmentation-reach-probe.ts'],
  })}\n`);
  // A compile that misses a pair prints one line each, so the output is large; a truncated read must fail, not read as reached.
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', config], { cwd: directory, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.error) throw result.error;
  const missed = new Set();
  for (const line of result.stdout.split('\n').filter((text) => text !== '' && !/^\s/u.test(text))) {
    const [, row, code] = /augmentation-reach-probe\.ts\((\d+),\d+\): error (TS\d+):/u.exec(line) ?? [];
    // Only the assertion failing counts; an interface that cannot be augmented or a name that does not resolve must not read as reached.
    if (code !== 'TS2344') throw new Error(`augmentation-reach probe: ${line}`);
    missed.add(Number(row) - header.length - 1);
  }
  const reach = Object.fromEntries(interfaces.map((name) => [name, []]));
  pairs.forEach(({ name, type }, row) => { if (!missed.has(row)) reach[name].push(type); });
  for (const reached of Object.values(reach)) reached.sort();
  return reach;
}

/** The names of one barrel's non-generic interfaces and type aliases, as `{ interfaces, types }`, each sorted. */
export function barrelTypeNames(entry) {
  const declarations = Object.entries(barrelDeclarations(entry)).filter(([, { kind, generic }]) => !generic && (kind === 'interface' || kind === 'type'));
  return {
    interfaces: declarations.filter(([, { kind }]) => kind === 'interface').map(([name]) => name).sort(),
    types: declarations.map(([name]) => name).sort(),
  };
}

// The record of one declarations directory: its index-compatible types, or with --reach its augmentation reach.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const reach = args[0] === '--reach';
  const entry = resolve(args[reach ? 1 : 0], 'index.d.ts');
  const { interfaces, types } = barrelTypeNames(entry);
  const directory = mkdtempSync(join(tmpdir(), 'muxui-declaration-probe-'));
  try {
    const specifier = entry.replace(/\.d\.ts$/u, '.js');
    if (reach) {
      const reached = Object.entries(augmentationReach({ directory, specifier, interfaces, types })).filter(([, carriers]) => carriers.length > 0);
      console.log(JSON.stringify(Object.fromEntries(reached), null, 2));
    } else {
      const compatible = [false, true].map((exactOptionalPropertyTypes) => indexSignatureCompatible({ directory, specifier, names: types, exactOptionalPropertyTypes }));
      console.log(JSON.stringify(compatible[0].filter((name) => compatible[1].includes(name)), null, 2));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
