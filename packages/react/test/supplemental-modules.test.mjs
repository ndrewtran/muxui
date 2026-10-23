import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { parseAst } from 'vite';
import * as barrel from '../src/supplemental/index.mjs';
import { readSupplementalMapping } from '../src/supplemental-mapping.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const supplementalRoot = resolve(import.meta.dirname, '../src/supplemental');
const barrelSource = 'packages/react/src/supplemental/index.mjs';
// The 18 families the barrel re-exported when it was split, and the modules they share. Each is a source file in
// either language, so the list outlives the move of a module to TypeScript and a converted context stays checked.
const families = [
  'alert-dialog', 'button-group', 'card', 'checkbox-field', 'color-mode-toggle', 'command-palette', 'header-nav', 'input', 'input-tags',
  'multi-select', 'payment-input', 'progress-circle', 'radio-field', 'sidebar', 'switch-field', 'tag-select', 'text', 'text-area',
];
const helpers = ['part-utils', 'field-utils', 'field-root', 'modal-parts', 'item-renderer', 'navigation-drawer'];
// Exports a family module declares beyond the family the mapping names.
const extraExports = { 'command-palette': ['useCommandPalette'] };
const mapping = readSupplementalMapping(repositoryRoot);
const rootRecords = mapping.filter(({ export: { module } }) => module === '.');
// Families the mapping places in a JavaScript module of their own; a TypeScript family is an eager root export, not part of the barrel.
const javaScriptRecords = rootRecords.filter(({ runtimeSource }) => runtimeSource.startsWith('packages/react/src/supplemental/') && runtimeSource.endsWith('.mjs'));
const sourceFiles = await readdir(supplementalRoot);
const sourceFile = (name) => {
  const found = sourceFiles.filter((file) => file === `${name}.mjs` || file === `${name}.ts`);
  assert.equal(found.length, 1, `${name} is one source file, found ${found.join(', ') || 'none'}`);
  return found[0];
};
const readModule = async (name) => {
  const file = sourceFile(name);
  return { file, text: await readFile(resolve(supplementalRoot, file), 'utf8'), lang: file.endsWith('.ts') ? 'ts' : 'js' };
};

test('index.mjs exports exactly the mapped JavaScript families, useCommandPalette and supplementalFamilies', () => {
  const expected = [
    ...javaScriptRecords.flatMap(({ slug, export: { name } }) => [name, ...(extraExports[slug] ?? [])]),
    'supplementalFamilies',
  ];
  assert.deepEqual(Object.keys(barrel).sort(), expected.sort());
  assert.ok(javaScriptRecords.length > 0);
  assert.ok(javaScriptRecords.every(({ slug }) => families.includes(slug)), 'every mapped JavaScript family is a split family module');
});

test('each barrel binding is the one its mapped owning module declares', async () => {
  for (const { slug, runtimeSource, export: { name } } of javaScriptRecords) {
    assert.notEqual(runtimeSource, barrelSource, `${name} is declared outside the barrel`);
    const owner = await import(pathToFileURL(resolve(repositoryRoot, runtimeSource)).href);
    for (const exported of [name, ...(extraExports[slug] ?? [])]) {
      assert.ok(exported in owner, `${exported} is declared by ${runtimeSource}`);
      assert.equal(barrel[exported], owner[exported], `${exported} is the binding ${runtimeSource} declares`);
    }
  }
});

test('the barrel re-exports a JavaScript family and not one the mapping has moved to TypeScript', () => {
  const supplemental = rootRecords.filter(({ runtimeSource }) => runtimeSource.startsWith('packages/react/src/supplemental/'));
  assert.ok(supplemental.some(({ runtimeSource }) => runtimeSource.endsWith('.ts')) && supplemental.some(({ runtimeSource }) => runtimeSource.endsWith('.mjs')));
  for (const { family, runtimeSource } of supplemental) {
    assert.equal(Object.hasOwn(barrel, family), runtimeSource.endsWith('.mjs'), `${family} (${runtimeSource})`);
  }
});

// A declaration, in JavaScript or in TypeScript with a type annotation or type arguments.
const contextDeclaration = /^(?:export\s+)?const\s+(\w+)(?::[^=\n]+)?\s*=\s*React\.createContext\b/gmu;
const stateDeclaration = (name) => new RegExp(`^(?:export\\s+)?(?:const|let)\\s+${name}\\b`, 'gmu');

test('each context and the Sidebar shortcut state is declared in exactly one supplemental module', async () => {
  const modules = await Promise.all([...helpers, ...families].map(async (name) => [name, (await readModule(name)).text]));
  const declaredIn = new Map();
  for (const [module, text] of modules) {
    for (const [, name] of text.matchAll(contextDeclaration)) declaredIn.set(name, [...(declaredIn.get(name) ?? []), module]);
  }
  // Two are read by several families and live in a helper: ModalMotionContext (modal-parts) and InputAssociationContext (field-root).
  assert.deepEqual([...declaredIn.keys()].sort(), [
    'CheckboxFieldIndicatorContext', 'CommandPaletteContext', 'InputAssociationContext', 'ModalMotionContext', 'MultiSelectContext',
    'PaymentInputContext', 'ProgressCircleContext', 'RadioFieldContext', 'SidebarAccountContext', 'SidebarContext', 'TagSelectContext',
  ]);
  for (const [name, owners] of declaredIn) assert.equal(owners.length, 1, `${name} is declared in ${owners.join(', ')}`);
  // The Set of shortcut owners and the mount counter are one shared state, so a second copy would split it.
  for (const name of ['sidebarShortcuts', 'sidebarMounts']) {
    const owners = modules.filter(([, text]) => stateDeclaration(name).test(text)).map(([module]) => module);
    assert.deepEqual(owners, ['sidebar'], name);
  }
});

// The sibling modules a source imports or re-exports, by name. Parsed, so a multiline import counts.
function siblingModules(text, lang = 'js') {
  return parseAst(text, { lang }).body.flatMap((node) => {
    const name = /^\.\/([\w-]+)\.\w+$/u.exec(node.source?.value ?? '')?.[1];
    return name ? [name] : [];
  });
}

test('a split family module imports helpers and existing components, never another split family or the barrel', async () => {
  for (const name of families) {
    const { file, text, lang } = await readModule(name);
    for (const sibling of siblingModules(text, lang)) {
      assert.ok(!families.includes(sibling) && sibling !== 'index', `${file} imports ${sibling}`);
    }
  }
});

test('a helper imports no split family and not the barrel', async () => {
  for (const name of helpers) {
    const { file, text, lang } = await readModule(name);
    for (const sibling of siblingModules(text, lang)) {
      assert.ok(!families.includes(sibling) && sibling !== 'index', `${file} imports ${sibling}`);
    }
  }
});

test('the sibling import guard sees multiline imports and re-exports', () => {
  const text = "import React from 'react';\nimport {\n  h,\n  cx,\n} from './part-utils.mjs';\nexport {\n  Card,\n} from './card.ts';\nimport { IconButton } from './icon-button.ts';\n";
  assert.deepEqual(siblingModules(text), ['part-utils', 'card', 'icon-button']);
});

test('the context guard sees a typed context', () => {
  const text = "export const A = React.createContext(null);\nexport const B: Context<State> = React.createContext<State>({});\nconst notOne = new Map();\n";
  assert.deepEqual([...text.matchAll(contextDeclaration)].map(([, name]) => name), ['A', 'B']);
});
