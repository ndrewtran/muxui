// The packed-consumer checks run TypeScript 6, which pnpm's hoisted `tsc` is only sometimes. These
// tests show the compiler is pinned and verified, and that each check catches what it guards.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  STRICT_CONSUMER_COMPILER_OPTIONS,
  augmentationReach,
  consumerTsc,
  indexSignatureCompatible,
  tscDiagnostics,
  typeScript7Tsc,
  verifiedTypeScript6,
} from './support/declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const typeScript7 = typeScript7Tsc();

/** A scratch consumer project holding `files`, with the package's @types/react linked in. */
function withProject(files, run) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-consumer-tsc-'));
  try {
    mkdirSync(join(directory, 'node_modules/@types'), { recursive: true });
    symlinkSync(resolve(packageRoot, 'node_modules/@types/react'), join(directory, 'node_modules/@types/react'), 'junction');
    for (const [name, text] of Object.entries(files)) writeFileSync(join(directory, name), text);
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the consumer checks run the pinned TypeScript 6, not whichever tsc pnpm hoists', () => {
  const version = spawnSync(process.execPath, [consumerTsc(), '--version'], { encoding: 'utf8' }).stdout;
  assert.match(version, /^Version 6\./u);
  assert.match(consumerTsc(), /typescript@6\.\d+\.\d+/u, 'it is the typescript-6 alias');
  // The package's own compiler is TypeScript 7, which the version check refuses.
  assert.throws(() => verifiedTypeScript6(typeScript7), /need TypeScript 6; .* reports "Version 7\./u);
});

test('the index check rejects an interface props type and an intersection with one', () => {
  const declarations = [
    'export interface InterfaceProps { label?: string }',
    'export type LiteralProps = { label?: string };',
    'export type IntersectionProps = LiteralProps & InterfaceProps;',
    "export type MappedProps = Omit<InterfaceProps, 'x'> & { a?: string };",
  ].join('\n');
  withProject({ 'fixture.d.ts': declarations }, (directory) => {
    const names = ['InterfaceProps', 'LiteralProps', 'IntersectionProps', 'MappedProps'];
    for (const exactOptionalPropertyTypes of [false, true]) {
      const compatible = indexSignatureCompatible({ directory, specifier: './fixture.js', names, exactOptionalPropertyTypes });
      assert.deepEqual(compatible, ['LiteralProps', 'MappedProps'], `exactOptionalPropertyTypes ${exactOptionalPropertyTypes}`);
    }
  });
});

test('the augmentation check sees a type derived from an interface, and not a flat copy of it', () => {
  const declarations = [
    'export interface Base { label?: string }',
    'export type Flat = { label?: string };',
    'export type Intersection = Base & { id?: string };',
    'export interface Extension extends Base { id?: string }',
    'export type Derived = Omit<Base, never> & { id?: string };',
    'export type Union = (Base & { a?: string }) | { b?: string };',
    'export type Indexed = Record<string, unknown>;',
  ].join('\n');
  withProject({ 'fixture.d.ts': declarations }, (directory) => {
    for (const tsc of [consumerTsc(), typeScript7]) {
      const reach = augmentationReach({
        directory,
        specifier: './fixture.js',
        interfaces: ['Base'],
        types: ['Base', 'Flat', 'Intersection', 'Extension', 'Derived', 'Union', 'Indexed'],
        tsc,
      });
      // A mapped type over the interface (Omit) follows it, a flat copy does not, a union reaches only when
      // every arm does, and an index signature is not a reach.
      assert.deepEqual(reach, { Base: ['Derived', 'Extension', 'Intersection'] }, tsc);
    }
  });
});

test('a compile that did not complete fails the reach and index checks instead of passing every pair', () => {
  withProject({ 'fixture.d.ts': 'export interface Base { label?: string }\nexport type Flat = { label?: string };' }, (directory) => {
    const compiler = (name, source) => {
      const script = join(directory, name);
      writeFileSync(script, source);
      return script;
    };
    const failures = {
      'exits 1 with only stderr': [compiler('stderr.mjs', "process.stderr.write('tsc: internal error\\n'); process.exit(1);"), /wrote to stderr: tsc: internal error/u],
      'is stopped by a signal': [compiler('signal.mjs', "process.kill(process.pid, 'SIGKILL');"), /was stopped by SIGKILL/u],
      'exits 1 with no diagnostic': [compiler('silent.mjs', 'process.exit(1);'), /exited 1 with 0 diagnostics/u],
      'exits 0 after a diagnostic': [compiler('contradiction.mjs', "console.log('probe.ts(1,1): error TS2344: x'); process.exit(0);"), /exited 0 with 1 diagnostics/u],
      'exits with a status the compiler does not use': [compiler('status.mjs', 'process.exit(9);'), /exited 9 with 0 diagnostics/u],
    };
    for (const [reason, [tsc, pattern]] of Object.entries(failures)) {
      assert.throws(() => augmentationReach({ directory, specifier: './fixture.js', interfaces: ['Base'], types: ['Base', 'Flat'], tsc }), pattern, `reach: ${reason}`);
      assert.throws(() => indexSignatureCompatible({ directory, specifier: './fixture.js', names: ['Flat'], exactOptionalPropertyTypes: false, tsc }), pattern, `index: ${reason}`);
    }
    // A read cut short by the output limit.
    const noisy = compiler('noisy.mjs', "process.stdout.write('x'.repeat(1 << 16)); process.exit(1);");
    assert.throws(() => tscDiagnostics({ tsc: noisy, config: 'tsconfig.json', directory, maxBuffer: 1024 }), /did not complete: .*ENOBUFS/u);
  });
});

test('the strict consumer check rejects a default import of React in a declaration', () => {
  const strict = { compilerOptions: { ...STRICT_CONSUMER_COMPILER_OPTIONS, strict: true, noEmit: true, types: [] }, files: ['fixture.d.ts'] };
  const check = (declarations) => withProject({ 'fixture.d.ts': declarations, 'tsconfig.json': JSON.stringify(strict) }, (directory) => {
    const result = spawnSync(process.execPath, [consumerTsc(), '--noEmit', '--pretty', 'false', '-p', directory], { cwd: directory, encoding: 'utf8' });
    return { status: result.status, output: result.stdout };
  });
  const named = check("import type { ReactNode } from 'react';\nexport declare const label: ReactNode;");
  assert.equal(named.status, 0, named.output);
  const defaultImport = check("import React from 'react';\nexport declare const label: React.ReactNode;");
  assert.notEqual(defaultImport.status, 0);
  assert.match(defaultImport.output, /TS1259/u);
});
