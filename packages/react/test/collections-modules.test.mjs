import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { parseAst } from 'vite';
import * as barrel from '../src/collections.mjs';
import { readRuntimeSources, runtimeSourceFor } from '../src/runtime-sources.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const families = [
  'Calendar', 'ColorArea', 'ColorField', 'ColorPicker', 'ColorSlider', 'ColorSwatch', 'ColorSwatchPicker', 'ColorWheel',
  'ComboBox', 'GridList', 'ListBox', 'Menu', 'RadioGroup', 'RangeCalendar', 'Select', 'Slider', 'Table', 'Tabs', 'TagGroup',
  'ToggleButtonGroup', 'TokenField', 'Toolbar', 'Tree', 'Virtualizer',
];
// Modules several families share. Each one declares no family, so the registry does not list them.
const helpers = ['control-utils', 'collection-items', 'read-only-guard', 'color-context', 'collection-trigger', 'grid-virtualizer-context'];
const sources = await readRuntimeSources(repositoryRoot);
const familyModules = [...new Set(families.map((name) => runtimeSourceFor(sources, name)))];
const moduleName = (path) => path.replace(/^.*\/|\.\w+$/gu, '');
// A helper is JavaScript until its tranche moves it to TypeScript.
const sourceFiles = await readdir(resolve(import.meta.dirname, '../src'));
const helperFile = async (name) => {
  const found = sourceFiles.filter((file) => file === `${name}.mjs` || file === `${name}.ts`);
  assert.equal(found.length, 1, `${name} is one source file, found ${found.join(', ') || 'none'}`);
  return found[0];
};

test('collections.mjs exports exactly the 24 families, each the binding its owning module declares', async () => {
  assert.deepEqual(Object.keys(barrel).sort(), [...families].sort());
  assert.equal(familyModules.length, 23);
  for (const name of families) {
    const owner = runtimeSourceFor(sources, name);
    assert.ok(owner, `${name} has an owning registry module`);
    assert.ok(!owner.endsWith('/collections.mjs'), `${name} is declared outside the barrel`);
    const module = await import(pathToFileURL(resolve(repositoryRoot, owner)).href);
    assert.equal(barrel[name], module[name], `${name} is the binding ${owner} declares`);
  }
});

// A declaration, in JavaScript or in TypeScript with a type annotation or type arguments.
const contextDeclaration = /^(?:export\s+)?const\s+(\w+)(?::[^=\n]+)?\s*=\s*(?:React\.createContext|new WeakMap)\b/gmu;

test('each context and WeakMap is declared in exactly one collections module', async () => {
  const declaration = contextDeclaration;
  const declaredIn = new Map();
  const modules = [
    ...familyModules.map((path) => [moduleName(path), sources[path]]),
    ...await Promise.all(helpers.map(async (name) => [name, await readFile(resolve(import.meta.dirname, '../src', await helperFile(name)), 'utf8')])),
  ];
  for (const [module, text] of modules) {
    for (const [, name] of text.matchAll(declaration)) declaredIn.set(name, [...(declaredIn.get(name) ?? []), module]);
  }
  // The shared and family-level contexts and the one read-only WeakMap; Menu's three sit at module scope, as a wrapper holds only components.
  assert.deepEqual([...declaredIn.keys()].sort(), ['ColorPickerContext', 'GridListContext', 'GridVirtualizerContext', 'ListBoxContext', 'MenuAnchorContext', 'MenuContext', 'MenuSubmenuContext', 'SelectContext', 'readOnlyTargetGuards']);
  for (const [name, modules] of declaredIn) assert.equal(modules.length, 1, `${name} is declared in ${modules.join(', ')}`);
});

// The sibling modules a source imports or re-exports, by name. Parsed, so a multiline import counts.
function siblingModules(text, lang = 'js') {
  return parseAst(text, { lang }).body.flatMap((node) => {
    const name = /^\.\/([\w-]+)\.\w+$/u.exec(node.source?.value ?? '')?.[1];
    return name ? [name] : [];
  });
}

test('a family module imports shared helpers only, never another family or the barrel', () => {
  const names = familyModules.map(moduleName);
  for (const path of familyModules) {
    for (const name of siblingModules(sources[path], path.endsWith('.ts') ? 'ts' : 'js')) {
      assert.ok(!names.includes(name) && name !== 'collections', `${path} imports ${name}`);
    }
  }
});

test('the sibling import guard sees multiline imports and re-exports', () => {
  const text = "import React from 'react';\nimport {\n  ListBox,\n} from './list-box.mjs';\nexport {\n  Tree,\n} from './tree.ts';\nimport { classNames } from './control-utils.ts';\n";
  assert.deepEqual(siblingModules(text), ['list-box', 'tree', 'control-utils']);
});

test('the context guard sees a typed context and a typed WeakMap', () => {
  const text = "export const A = React.createContext(null);\nexport const B: Context<State> = React.createContext<State>({});\nconst c = new WeakMap<Element, Guard>();\nconst notOne = new Map();\n";
  assert.deepEqual([...text.matchAll(contextDeclaration)].map(([, name]) => name), ['A', 'B', 'c']);
});
