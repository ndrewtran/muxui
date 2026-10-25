import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import test from 'node:test';
import { parseAst } from 'vite';
import * as barrel from '../src/supplemental/index.ts';
import { readSupplementalMapping } from '../src/supplemental-mapping.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const supplementalRoot = resolve(import.meta.dirname, '../src/supplemental');
// The 18 families the barrel re-exported when it was split, and the modules they share. Each is a source file in
// either language, so the list outlives the move of a module between languages.
const families = [
  'alert-dialog', 'button-group', 'card', 'checkbox-field', 'color-mode-toggle', 'command-palette', 'header-nav', 'input', 'input-tags',
  'multi-select', 'payment-input', 'progress-circle', 'radio-field', 'sidebar', 'switch-field', 'tag-select', 'text', 'text-area',
];
const helpers = ['part-utils', 'field-utils', 'field-root', 'modal-parts', 'item-renderer', 'navigation-drawer'];
const mapping = readSupplementalMapping(repositoryRoot);
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

// The barrel is metadata: the list of family names and no family, because the generated root index exports each family from its own
// TypeScript module.
test('the barrel exports supplementalFamilies alone, frozen, and every mapped family is a module of its own', () => {
  assert.deepEqual(Object.keys(barrel), ['supplementalFamilies']);
  assert.ok(Object.isFrozen(barrel.supplementalFamilies));
  for (const { slug, runtimeSource } of mapping) {
    assert.ok(runtimeSource.endsWith('.ts'), `${slug} is declared in ${runtimeSource}`);
    assert.ok(!runtimeSource.endsWith('/supplemental/index.ts'), `${slug} is declared outside the barrel`);
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

// The sibling modules a source imports, re-exports or loads with import(), by name. The whole tree is walked, so a multiline
// import and an import() nested in a function count, and each relative specifier is resolved against the supplemental
// directory, where every checked module lives, so `../supplemental/card.mjs` is the card module like `./card.mjs`.
function siblingModules(text, lang = 'js') {
  const siblings = [];
  (function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const specifier = node.source?.value;
    if (typeof specifier === 'string' && specifier.startsWith('.')) {
      const target = resolve(supplementalRoot, specifier);
      if (dirname(target) === supplementalRoot) siblings.push(basename(target).replace(/\.\w+$/u, ''));
    }
    Object.values(node).forEach(visit);
  })(parseAst(text, { lang }));
  return siblings;
}

// The siblings a family or a helper may not load: another split family and the barrel.
const forbiddenSiblings = (text, lang) => siblingModules(text, lang).filter((sibling) => families.includes(sibling) || sibling === 'index');

test('a split family module imports helpers and existing components, never another split family or the barrel', async () => {
  for (const name of families) {
    const { file, text, lang } = await readModule(name);
    assert.deepEqual(forbiddenSiblings(text, lang), [], `${file} loads a split family or the barrel`);
  }
});

test('a helper imports no split family and not the barrel', async () => {
  for (const name of helpers) {
    const { file, text, lang } = await readModule(name);
    assert.deepEqual(forbiddenSiblings(text, lang), [], `${file} loads a split family or the barrel`);
  }
});

test('the sibling import guard sees multiline imports and re-exports', () => {
  const text = "import React from 'react';\nimport {\n  h,\n  cx,\n} from './part-utils.mjs';\nexport {\n  Card,\n} from './card.ts';\nimport { IconButton } from './icon-button.ts';\n";
  assert.deepEqual(siblingModules(text), ['part-utils', 'card', 'icon-button']);
});

test('the sibling import guard fails a family that gains a dynamic import or an equivalent path', async () => {
  const { text, lang } = await readModule('text');
  assert.deepEqual(forbiddenSiblings(text, lang), [], 'text is clean before the mutation');
  const mutations = {
    'a dynamic import': ["\nexport const late = async () => (await import('./card.mjs')).Card;\n", 'card'],
    'a dynamic import nested in a function': ["\nexport function later() {\n  if (true) return import('./sidebar.mjs');\n}\n", 'sidebar'],
    'a path that climbs out and back in': ["\nimport { Card } from '../supplemental/card.mjs';\n", 'card'],
    'a re-export by a longer equivalent path': ["\nexport { Card } from '../../src/supplemental/card.ts';\n", 'card'],
    'the barrel by an equivalent path': ["\nimport { Card } from '../supplemental/index.ts';\n", 'index'],
  };
  for (const [name, [addition, sibling]] of Object.entries(mutations)) {
    assert.deepEqual(forbiddenSiblings(text + addition, lang), [sibling], `${name} is caught`);
  }
  // A TypeScript module is parsed as TypeScript, so the guard survives the rename of a module to .ts.
  assert.deepEqual(forbiddenSiblings("import type { Props } from '../supplemental/card.ts';\nexport const late = (): Promise<unknown> => import('./card.ts');\n", 'ts'), ['card', 'card']);
});

test('the sibling import guard allows a helper by dynamic import or equivalent path, and ignores modules outside the directory', () => {
  const text = "import { Menu } from '../collections.mjs';\nimport { h } from '../supplemental/part-utils.mjs';\nexport const load = () => import('./field-utils.mjs');\nimport { x } from 'react';\n";
  assert.deepEqual(siblingModules(text), ['part-utils', 'field-utils']);
  assert.deepEqual(forbiddenSiblings(text, 'js'), []);
});

test('the context guard sees a typed context', () => {
  const text = "export const A = React.createContext(null);\nexport const B: Context<State> = React.createContext<State>({});\nconst notOne = new Map();\n";
  assert.deepEqual([...text.matchAll(contextDeclaration)].map(([, name]) => name), ['A', 'B']);
});
