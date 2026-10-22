// A consumer reads every declaration the package ships, so each must stand alone: name only React,
// the package itself, and its own files, and compile with nothing it names missing. The import scan
// and the compile each catch what the other cannot, so both run on all of generated/*.d.ts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { STRICT_CONSUMER_COMPILER_OPTIONS, consumerTsc, tscDiagnostics, typeScript7Tsc } from './support/declaration-surface.mjs';
import { generatedDeclarations, upstreamImports } from './support/declarations.mjs';

const generated = resolve(import.meta.dirname, '../generated');

// TypeScript 7 removed the interop flags and the deprecation switch the strict consumer sets for 6.
const COMPILERS = {
  'TypeScript 7': { tsc: typeScript7Tsc(), options: { module: 'ESNext', moduleResolution: 'Bundler' } },
  'TypeScript 6': { tsc: consumerTsc(), options: STRICT_CONSUMER_COMPILER_OPTIONS },
};

/** The diagnostics of compiling `files` as roots, with library checking on so a declaration's own errors count. */
function rootDiagnostics(files, { tsc, options }, directory) {
  const config = join(directory, 'tsconfig.json');
  writeFileSync(config, `${JSON.stringify({ compilerOptions: { ...options, strict: true, noEmit: true, skipLibCheck: false, types: [] }, files })}\n`);
  return tscDiagnostics({ tsc, config, directory });
}

function withDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-declaration-validity-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('no shipped declaration names a package other than React and this one', () => {
  const declarations = generatedDeclarations();
  assert.ok(Object.keys(declarations).length > 20, 'the shipped declarations were found');
  for (const [file, text] of Object.entries(declarations)) assert.deepEqual(upstreamImports(text, file), [], file);
});

test('the import scan sees an upstream package however a declaration names it', () => {
  const named = [
    "import type { Color } from 'react-aria-components';",
    "export type { DateValue } from '@internationalized/date';",
    "export * from 'react-stately';",
    "export type Late = import('react-aria').Key;",
    "import type { ReactNode } from 'react';",
    "import type { IconButtonProps } from '@muxui/react';",
    "import type { MuxUIColorValue } from './color-context.js';",
  ].join('\n');
  assert.deepEqual(upstreamImports(named), ['react-aria-components', '@internationalized/date', 'react-stately', 'react-aria']);
});

test('every shipped declaration compiles as a root, with library checking on, under both compilers', () => {
  const files = Object.keys(generatedDeclarations()).map((file) => join(generated, file));
  for (const [name, compiler] of Object.entries(COMPILERS)) {
    assert.deepEqual(withDirectory((directory) => rootDiagnostics(files, compiler, directory)), [], name);
  }
});

// stripInternal drops a declaration marked @internal, and so leaves a dangling name behind where an
// exported declaration still uses it. The import scan reads such a file as clean; compiling it is what fails.
test('a stripped declaration that an exported one still names fails the compile and passes the import scan', () => {
  const source = [
    '/** @internal */',
    'export interface Hidden { a: string }',
    'export interface Shown { hidden: Hidden }',
    '',
  ].join('\n');
  withDirectory((directory) => {
    writeFileSync(join(directory, 'shown.ts'), source);
    const emit = (flags) => {
      const result = spawnSync(process.execPath, [typeScript7Tsc(), '--declaration', '--emitDeclarationOnly', '--module', 'esnext', '--target', 'es2022', ...flags, '--outDir', join(directory, 'out'), join(directory, 'shown.ts')], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return join(directory, 'out/shown.d.ts');
    };
    // Without stripping, the declaration stands alone.
    const whole = emit([]);
    for (const [name, compiler] of Object.entries(COMPILERS)) assert.deepEqual(rootDiagnostics([whole], compiler, directory), [], `${name} whole`);
    const stripped = emit(['--stripInternal']);
    assert.deepEqual(upstreamImports(readFileSync(stripped, 'utf8')), []);
    for (const [name, compiler] of Object.entries(COMPILERS)) {
      assert.match(rootDiagnostics([stripped], compiler, directory).join('\n'), /shown\.d\.ts\(\d+,\d+\): error TS2304: Cannot find name 'Hidden'/u, name);
    }
  });
});
