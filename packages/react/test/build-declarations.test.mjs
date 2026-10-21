import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseAst } from 'vite';

const sourceRoot = resolve(import.meta.dirname, '../src');

// Declarations that name only a type, which no module exports at run time.
const TYPE_ONLY = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration']);

/** The values a module exports, read from its syntax. */
function exportedNames(text, lang) {
  const names = [];
  for (const node of parseAst(text, { lang }).body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const { declaration } = node;
    if (TYPE_ONLY.has(declaration?.type)) continue;
    if (declaration?.id) names.push(declaration.id.name);
    for (const { id } of declaration?.declarations ?? []) names.push(id.name);
    for (const { exported } of node.specifiers) names.push(exported.name);
  }
  return names;
}

// A TypeScript family that imports a JavaScript module reads its types from a sibling
// .d.mts (Decision 0031). Only the build reads them, so a name the module does not export
// would type-check a call that fails at run time.
test('each build-only .d.mts declares only values its JavaScript module exports', async () => {
  const shims = (await readdir(sourceRoot, { recursive: true })).filter((file) => file.endsWith('.d.mts'));
  assert.ok(shims.length > 0);
  for (const shim of shims) {
    const [declarations, module] = await Promise.all([
      readFile(resolve(sourceRoot, shim), 'utf8'),
      readFile(resolve(sourceRoot, shim.replace(/\.d\.mts$/u, '.mjs')), 'utf8'),
    ]);
    const exported = new Set(exportedNames(module, 'js'));
    assert.deepEqual(exportedNames(declarations, 'dts').filter((name) => !exported.has(name)), [], shim);
  }
});
