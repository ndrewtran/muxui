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
 * Runs `tsc -p config` (`tsc` is the compiler's script) and returns the diagnostic line each error
 * printed, elaborations left out. An absent diagnostic means a pair passed, so a compile that did not
 * run to completion must fail rather than read as every pair passing: a spawn error or a truncated
 * read (`maxBuffer`), a signal, anything on stderr, an exit status other than the compiler's own
 * 0, 1, and 2, and an exit status that disagrees with whether any diagnostic printed all throw.
 */
export function tscDiagnostics({ tsc, config, directory, maxBuffer = 1 << 28 }) {
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', config], { cwd: directory, encoding: 'utf8', maxBuffer });
  const label = `tsc ${tsc} -p ${config}`;
  if (result.error) throw new Error(`${label} did not complete: ${result.error.message}`, { cause: result.error });
  if (result.signal) throw new Error(`${label} was stopped by ${result.signal}`);
  if (result.stderr !== '') throw new Error(`${label} wrote to stderr: ${result.stderr.trim().slice(0, 500)}`);
  // The compiler prints each diagnostic on a line of its own, with any elaboration indented below it.
  const diagnostics = result.stdout.split('\n').filter((text) => text !== '' && !/^\s/u.test(text));
  if (![0, 1, 2].includes(result.status) || (result.status === 0) !== (diagnostics.length === 0)) {
    throw new Error(`${label} exited ${result.status} with ${diagnostics.length} diagnostics`);
  }
  return diagnostics;
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
  const rejected = new Set();
  for (const line of tscDiagnostics({ tsc, config, directory })) {
    const [, row, code] = /index-signature-probe\.ts\((\d+),\d+\): error (TS\d+):/u.exec(line) ?? [];
    // Only the constraint failing counts; a name that does not resolve must not read as compatible.
    if (code !== 'TS2344') throw new Error(`index-signature probe: ${line}`);
    rejected.add(names[Number(row) - 3]);
  }
  return names.filter((name) => !rejected.has(name));
}

/**
 * Which exported types a consumer's module augmentation of an exported interface reaches
 * (`declare module '<specifier>' { interface I { key?: 'key' } }`), as `{ [interface]: [entry, ...] }`
 * with each list sorted and without the interface itself. An interface is open to augmentation, so a
 * props type that intersects, extends, or maps over it takes the consumer's key and a flat copy of its
 * members does not. Every interface carries its own key, so one compile answers for all of them.
 *
 * A type is reached where it declares the key: its type is the key's own literal, which a string index
 * signature does not give (an index signature alone is not a reach, but an interface that extends one
 * and takes the key is). An entry is `T` when every arm of a union T declares it, `T/I` when only the arm
 * that is the interface I does, and `T/*` when only some other arm does. `tsc` is the compiler's script
 * and `specifier` is what the probe imports the barrel as.
 */
export function augmentationReach({ directory, specifier, interfaces, types, tsc = consumerTsc() }) {
  const probe = join(directory, 'augmentation-reach-probe.ts');
  const config = join(directory, 'tsconfig.augmentation-reach.json');
  const header = [
    `import type * as Package from '${specifier}';`,
    `declare module '${specifier}' {`,
    ...interfaces.map((name, index) => `  interface ${name} { __muxuiReach${index}?: '__muxuiReach${index}' }`),
    '}',
    'type Declares<A, Key extends string> = 0 extends 1 & A ? false : Key extends keyof A ? ([Exclude<A[Key], undefined>] extends [Key] ? ([Key] extends [Exclude<A[Key], undefined>] ? true : false) : false) : false;',
    'type Arms<T, Key extends string> = T extends unknown ? Declares<T, Key> : never;',
    'type Is<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;',
    'type ArmIs<T, E, Key extends string> = true extends (T extends unknown ? (Declares<T, Key> extends true ? Is<T, E> : false) : never) ? true : false;',
    'type Assert<T extends true> = T;',
  ];
  const pairs = interfaces.flatMap((name, index) => types.filter((type) => type !== name).map((type) => ({ name, type, key: `'__muxuiReach${index}'` })));
  // Three rows a pair: every arm declares the key, some arm does, and an arm that is the interface does.
  const rows = pairs.flatMap(({ name, type, key }) => [
    `[Arms<Package.${type}, ${key}>] extends [true] ? true : false`,
    `true extends Arms<Package.${type}, ${key}> ? true : false`,
    `ArmIs<Package.${type}, Package.${name}, ${key}>`,
  ]);
  writeFileSync(probe, [...header, ...rows.map((row, index) => `export type Probe${index} = Assert<${row}>;`)].join('\n'));
  writeFileSync(config, `${JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true, types: [] },
    files: ['augmentation-reach-probe.ts'],
  })}\n`);
  const missed = new Set();
  for (const line of tscDiagnostics({ tsc, config, directory })) {
    const [, row, code] = /augmentation-reach-probe\.ts\((\d+),\d+\): error (TS\d+):/u.exec(line) ?? [];
    // Only the assertion failing counts; an interface that cannot be augmented or a name that does not resolve must not read as reached.
    if (code !== 'TS2344') throw new Error(`augmentation-reach probe: ${line}`);
    missed.add(Number(row) - header.length - 1);
  }
  const reach = Object.fromEntries(interfaces.map((name) => [name, []]));
  pairs.forEach(({ name, type }, index) => {
    const [every, some, named] = [0, 1, 2].map((offset) => !missed.has(3 * index + offset));
    const entry = every ? type : named ? `${type}/${name}` : some ? `${type}/*` : undefined;
    if (entry !== undefined) reach[name].push(entry);
  });
  for (const reached of Object.values(reach)) reached.sort();
  return reach;
}

/**
 * The recorded entries (`{ [interface]: [entry, ...] }`, from the augmentation record) that `reach`
 * (from `augmentationReach` over the same interfaces and the entries' types) no longer holds, as
 * `interface -> entry`. An arm entry `T/I` also holds where every arm of T declares the key.
 */
export function lostAugmentationReach(recorded, reach) {
  return Object.entries(recorded).flatMap(([name, entries]) => entries
    .filter((entry) => !reach[name].includes(entry) && !reach[name].includes(entry.split('/')[0]))
    .map((entry) => `${name} -> ${entry}`));
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
