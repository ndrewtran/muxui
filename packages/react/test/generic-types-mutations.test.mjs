// choice-select.types.test.tsx and text.types.test.tsx hold what MultiSelect, TagSelect and Text promise about the type they are generic
// over: the item, and the element. They are only worth having if they fail when the declarations lose that. Here each is compiled against
// the emitted declarations, and against copies in which the parameter is lost in each way a public type could lose it, under both compilers.
// Every exported generic form is mutated on its own (the props type, the root props type and the call signature of Root for the choice
// controls; the props type and the call signature for Text), because a form built from another passes whatever the other keeps: a default
// changed in MultiSelectRootProps alone is invisible to a witness that only uses MultiSelectProps. A copy must stay a valid declaration
// and still fail the test file, so that it is a witness that catches it and not a broken declaration.
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
  const item = `${name}Item`;
  const props = `export type ${name}Props<T extends ${item} = ${item}> =`;
  const rootProps = `export type ${name}RootProps<T extends ${item} = ${item}> = ${name}Props<T>;`;
  const root = `<T extends ${item} = ${item}>(props: ${name}RootProps<T> &`;
  const narrowed = `${item} & { name: string }`;
  return {
    // The item replaced by its constraint where a member names it: the list, the render function, and the label function.
    [`${name}: a member replaced by its constraint`]: { [module]: [
      [`items?: ${items('T')};`, `items?: ${items(`${name}Item`)};`],
      ['children?: ReactNode | ((item: T) => ReactNode);', `children?: ReactNode | ((item: ${name}Item) => ReactNode);`],
      ...(label ? [['getItemLabel?: (item: T) => string;', `getItemLabel?: (item: ${name}Item) => string;`]] : []),
    ] },
    [`${name}: a lost binder`]: { [module]: [[root, `(props: ${name}RootProps<${name}Item> &`]] },
    [`${name}: a changed constraint`]: { [module]: [[`export type ${name}Item = {\n    id: Key;`, `export type ${name}Item = {\n    id?: Key;`]] },
    [`${name}: a const binder`]: { [module]: [[root, `<const T extends ${item} = ${item}>(props: ${name}RootProps<T> &`]] },
    // The default of each form that has one, changed to an item that has an id and nothing else.
    [`${name}: a changed default of ${name}Props`]: { [module]: [[props, `export type ${name}Props<T extends ${item} = { id: Key }> =`]] },
    [`${name}: a changed default of ${name}RootProps`]: { [module]: [[rootProps, `export type ${name}RootProps<T extends ${item} = { id: Key }> = ${name}Props<T>;`]] },
    [`${name}: a changed default of the call signature of Root`]: { [module]: [[root, `<T extends ${item} = { id: Key }>(props: ${name}RootProps<T> &`]] },
    // The constraint of each form narrowed to an item that also has a name; a form built on another narrows with it, so each copy narrows
    // the form and the ones that take it.
    [`${name}: a narrowed constraint of the call signature of Root`]: { [module]: [[root, `<T extends ${narrowed} = ${narrowed}>(props: ${name}RootProps<T> &`]] },
    [`${name}: a narrowed constraint of ${name}RootProps`]: { [module]: [
      [rootProps, `export type ${name}RootProps<T extends ${narrowed} = ${narrowed}> = ${name}Props<T>;`],
      [root, `<T extends ${narrowed} = ${narrowed}>(props: ${name}RootProps<T> &`],
    ] },
    [`${name}: a narrowed constraint of ${name}Props`]: { [module]: [
      [props, `export type ${name}Props<T extends ${narrowed} = ${narrowed}> =`],
      [rootProps, `export type ${name}RootProps<T extends ${narrowed} = ${narrowed}> = ${name}Props<T>;`],
      [root, `<T extends ${narrowed} = ${narrowed}>(props: ${name}RootProps<T> &`],
    ] },
    // The parameter lost from each form that has one, and from the ones that take it.
    [`${name}: a lost binder of ${name}RootProps`]: { [module]: [
      [rootProps, `export type ${name}RootProps = ${name}Props;`],
      [root, `<T extends ${item} = ${item}>(props: ${name}Props<T> &`],
    ] },
    [`${name}: a lost binder of ${name}Props`]: { [module]: [
      [props, `export type ${name}Props =`],
      [`${name}OwnProps<T> & {`, `${name}OwnProps<${item}> & {`],
      ['children?: ReactNode | ((item: T) => ReactNode);', `children?: ReactNode | ((item: ${item}) => ReactNode);`],
      [rootProps, `export type ${name}RootProps<T extends ${item} = ${item}> = ${name}Props;`],
    ] },
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
      'Text: a lost binder of the call signature': { text: [
        ["<T extends TextElement = 'span'>(props: TextProps<T> &", '(props: TextProps<TextElement> &'],
        ['RefAttributes<HTMLElementTagNameMap[T]>', 'RefAttributes<HTMLElementTagNameMap[TextElement]>'],
      ] },
      'Text: a changed constraint': { text: [["export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'label';", "export type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';"]] },
      'Text: a changed default of the call signature (to p)': { text: [["export interface TextComponent {\n    <T extends TextElement = 'span'>", "export interface TextComponent {\n    <T extends TextElement = 'p'>"]] },
      'Text: a changed default of the call signature (to label)': { text: [["export interface TextComponent {\n    <T extends TextElement = 'span'>", "export interface TextComponent {\n    <T extends TextElement = 'label'>"]] },
      'Text: a changed default of TextProps': { text: [["export type TextProps<T extends TextElement = 'span'> =", "export type TextProps<T extends TextElement = 'label'> ="]] },
      'Text: a narrowed constraint of the call signature': { text: [["<T extends TextElement = 'span'>(props: TextProps<T> &", "<T extends Exclude<TextElement, 'h3'> = 'span'>(props: TextProps<T> &"]] },
      'Text: a narrowed constraint of TextProps': { text: [
        ["export type TextProps<T extends TextElement = 'span'> =", "export type TextProps<T extends Exclude<TextElement, 'h3'> = 'span'> ="],
        ["<T extends TextElement = 'span'>(props: TextProps<T> &", "<T extends Exclude<TextElement, 'h3'> = 'span'>(props: TextProps<T> &"],
      ] },
      'Text: a lost binder of TextProps': { text: [
        ["export type TextProps<T extends TextElement = 'span'> = Omit<ComponentPropsWithoutRef<T>,", "export type TextProps = Omit<ComponentPropsWithoutRef<'span'>,"],
        ["Pick<TextOwnProps<T>, 'as' | 'color' | 'truncate'>", "Pick<TextOwnProps<'span'>, 'as' | 'color' | 'truncate'>"],
        ['(props: TextProps<T> &', '(props: TextProps &'],
      ] },
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
        const diagnostics = diagnosticsWith(tsc, project, edits);
        assert.notDeepEqual(diagnostics, [], name);
        // The copy is a valid declaration, and a witness in the test file is what catches it: a diagnostic in a declaration file would mean
        // the copy was merely malformed.
        assert.deepEqual(diagnostics.filter((diagnostic) => !diagnostic.includes(`/${project.testFile}(`)), [], `${name}: the copy fails in the test file only`);
      }
    });
  }
}
