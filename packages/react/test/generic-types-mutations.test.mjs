// choice-select.types.test.tsx and text.types.test.tsx hold what MultiSelect, TagSelect and Text promise about the type they are generic
// over: the item, and the element. They are only worth having if they fail when the declarations lose that. Here each is compiled against
// the emitted declarations, and against copies in which the parameter is lost in each way a public type could lose it, under both compilers.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { consumerTsc, tscDiagnostics, typeScript7Tsc } from './support/declaration-surface.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const compilers = [['TypeScript 7', typeScript7Tsc()], ['TypeScript 6', consumerTsc()]];

/** Diagnostics of `testFile` against the emitted declarations of `modules`, each text edited by `edits[module]` ([from, to] pairs, each present once). */
function diagnosticsWith(tsc, { testFile, modules }, edits = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-generic-types-'));
  try {
    mkdirSync(join(directory, 'node_modules/@types'), { recursive: true });
    symlinkSync(resolve(packageRoot, 'node_modules/@types/react'), join(directory, 'node_modules/@types/react'), 'junction');
    for (const module of modules) {
      const emitted = readFileSync(resolve(packageRoot, 'generated', `${module}.d.ts`), 'utf8');
      const text = (edits[module] ?? []).reduce((current, [from, to]) => {
        assert.equal(current.split(from).length, 2, `${module}.d.ts has ${JSON.stringify(from)} once`);
        return current.replace(from, to);
      }, emitted);
      writeFileSync(join(directory, `${module}.d.ts`), text);
    }
    writeFileSync(join(directory, 'index.d.ts'), modules.map((module) => `export * from './${module}.js';\n`).join(''));
    copyFileSync(resolve(import.meta.dirname, testFile), join(directory, testFile));
    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', types: ['react'], noEmit: true, paths: { '@muxui/react': ['./index.d.ts'] } },
      files: [testFile],
    }));
    return tscDiagnostics({ tsc, config: join(directory, 'tsconfig.json'), directory });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The ways MultiSelect or TagSelect loses its item type; `items` spells the item in the member that lists them. */
const choice = (name, module, items, label) => {
  const root = `<T extends ${name}Item = ${name}Item>(props: ${name}RootProps<T> &`;
  return {
    // The item replaced by its constraint where a member names it: the list, the render function, and the label function.
    [`${name}: a member replaced by its constraint`]: { [module]: [
      [`items?: ${items('T')};`, `items?: ${items(`${name}Item`)};`],
      ['children?: ReactNode | ((item: T) => ReactNode);', `children?: ReactNode | ((item: ${name}Item) => ReactNode);`],
      ...(label ? [['getItemLabel?: (item: T) => string;', `getItemLabel?: (item: ${name}Item) => string;`]] : []),
    ] },
    [`${name}: a lost binder`]: { [module]: [[root, `(props: ${name}RootProps<${name}Item> &`]] },
    [`${name}: a changed constraint`]: { [module]: [[`export type ${name}Item = {\n    id: Key;`, `export type ${name}Item = {\n    id?: Key;`]] },
    [`${name}: a changed default`]: { [module]: [[`export type ${name}Props<T extends ${name}Item = ${name}Item> =`, `export type ${name}Props<T extends ${name}Item = { id: Key }> =`]] },
    [`${name}: a const binder`]: { [module]: [[root, `<const T extends ${name}Item = ${name}Item>(props: ${name}RootProps<T> &`]] },
  };
};

const PROJECTS = [
  {
    label: 'MultiSelect and TagSelect',
    testFile: 'choice-select.types.test.tsx',
    modules: ['multi-select', 'tag-select'],
    mutations: { ...choice('MultiSelect', 'multi-select', (item) => `Iterable<${item}>`, false), ...choice('TagSelect', 'tag-select', (item) => `${item}[]`, true) },
  },
  {
    label: 'Text',
    testFile: 'text.types.test.tsx',
    modules: ['text'],
    mutations: {
      'Text: a lost binder': { text: [["<T extends TextElement = 'span'>(props: TextProps<T> &", '(props: TextProps<TextElement> &']] },
      'Text: a changed constraint': { text: [["export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'label';", "export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';"]] },
      'Text: a changed default': { text: [["export interface TextComponent {\n    <T extends TextElement = 'span'>", "export interface TextComponent {\n    <T extends TextElement = 'p'>"]] },
      'Text: a member replaced by its constraint': { text: [["Pick<TextOwnProps<T>, 'as' | 'color' | 'truncate'>", "Pick<TextOwnProps<TextElement>, 'as' | 'color' | 'truncate'>"]] },
      'Text: the ref no longer follows the host': { text: [['RefAttributes<HTMLElementTagNameMap[T]>', 'RefAttributes<HTMLElement>']] },
      'Text: the attributes no longer follow the host': { text: [['Omit<ComponentPropsWithoutRef<T>,', "Omit<ComponentPropsWithoutRef<'span'>,"]] },
    },
  },
];

for (const [label, tsc] of compilers) {
  for (const project of PROJECTS) {
    test(`the ${project.label} types hold on the emitted declarations: ${label}`, () => {
      assert.deepEqual(diagnosticsWith(tsc, project), []);
    });

    test(`the ${project.label} types fail when the declarations lose the parameter in any of ${Object.keys(project.mutations).length} ways: ${label}`, () => {
      for (const [name, edits] of Object.entries(project.mutations)) {
        assert.notDeepEqual(diagnosticsWith(tsc, project, edits), [], name);
      }
    });
  }
}
