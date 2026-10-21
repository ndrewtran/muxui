// The packed-consumer checks run TypeScript 6, which pnpm's hoisted `tsc` is only sometimes. These
// tests show the compiler is pinned and verified, and that each check catches what it guards.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  STRICT_CONSUMER_COMPILER_OPTIONS,
  consumerTsc,
  indexSignatureCompatible,
  verifiedTypeScript6,
} from './support/declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const typeScript7 = resolve(dirname(require.resolve('typescript/package.json')), 'bin/tsc');

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
