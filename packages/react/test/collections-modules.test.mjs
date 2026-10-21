import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
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

test('each context and WeakMap is declared in exactly one collections module', async () => {
  const declaration = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:React\.createContext|new WeakMap)\(/gmu;
  const declaredIn = new Map();
  const modules = [
    ...familyModules.map((path) => [moduleName(path), sources[path]]),
    ...await Promise.all(helpers.map(async (name) => [name, await readFile(resolve(import.meta.dirname, `../src/${name}.mjs`), 'utf8')])),
  ];
  for (const [module, text] of modules) {
    for (const [, name] of text.matchAll(declaration)) declaredIn.set(name, [...(declaredIn.get(name) ?? []), module]);
  }
  // The five shared or family-level contexts and the one read-only WeakMap; Menu's three live inside its wrapper.
  assert.deepEqual([...declaredIn.keys()].sort(), ['ColorPickerContext', 'GridListContext', 'GridVirtualizerContext', 'ListBoxContext', 'SelectContext', 'readOnlyTargetGuards']);
  for (const [name, modules] of declaredIn) assert.equal(modules.length, 1, `${name} is declared in ${modules.join(', ')}`);
});

test('a family module imports shared helpers only, never another family or the barrel', () => {
  const names = familyModules.map(moduleName);
  for (const path of familyModules) {
    const imported = [...sources[path].matchAll(/^import .* from '\.\/([\w-]+)\.(?:mjs|js|ts)';$/gmu)].map(([, name]) => name);
    for (const name of imported) assert.ok(!names.includes(name) && name !== 'collections', `${path} imports ${name}`);
  }
});
