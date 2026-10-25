// choice-select.types.test.tsx and text.types.test.tsx hold what MultiSelect, TagSelect and Text promise about the type they are generic
// over: the item, and the element. They are only worth having if they fail when the declarations lose that. Here each is compiled against
// the emitted declarations, and against copies in which the parameter is lost in each way a public type could lose it, under both compilers.
// Every exported generic form is mutated on its own (the props type, the root props type and the call signature of Root for the choice
// controls; the props type and the call signature for Text), because a form built from another passes whatever the other keeps: a default
// changed in MultiSelectRootProps alone is invisible to a witness that only uses MultiSelectProps. A copy must stay a valid declaration
// and still fail the test file, so that it is a witness that catches it and not a broken declaration.
// A default is also compared exactly: the printed parameter list of every generic form is recorded below, so a default that adds a member,
// narrows a union or swaps the type for another that the witnesses happen to accept still changes the text, and each such copy has to fail
// two checks, the printed forms and the test file.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { consumerTsc, tscDiagnostics, typeScript7Tsc } from './support/declaration-surface.mjs';
import { genericForms } from './support/generic-forms.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const compilers = [['TypeScript 7', typeScript7Tsc()], ['TypeScript 6', consumerTsc()]];

/** The emitted declarations of `module`, edited by `edits` ([from, to] pairs, each present once). */
function emittedWith(module, edits = []) {
  return edits.reduce((current, [from, to]) => {
    assert.equal(current.split(from).length, 2, `${module}.d.ts has ${JSON.stringify(from)} once`);
    return current.replace(from, to);
  }, readFileSync(resolve(packageRoot, 'generated', `${module}.d.ts`), 'utf8'));
}

/**
 * Every generic form the three modules emit, as printed: the parameter list of each declaration and call signature that has one, and the
 * plain alias such a list names. A form added, dropped or changed in a parameter, a constraint, a default or the alias a list names fails
 * the test below, and so does each default mutation in this file.
 */
const FORMS = {
  'multi-select': {
    forms: {
      MultiSelectOwnProps: 'T extends MultiSelectItem = MultiSelectItem',
      MultiSelectProps: 'T extends MultiSelectItem = MultiSelectItem',
      MultiSelectRootProps: 'T extends MultiSelectItem = MultiSelectItem',
      'MultiSelectRootComponent call signature': 'T extends MultiSelectItem = MultiSelectItem',
    },
    aliases: { MultiSelectItem: '{ id: Key; [key: string]: unknown; }' },
  },
  'tag-select': {
    forms: {
      TagSelectOwnProps: 'T extends TagSelectItem = TagSelectItem',
      TagSelectProps: 'T extends TagSelectItem = TagSelectItem',
      TagSelectRootProps: 'T extends TagSelectItem = TagSelectItem',
      'TagSelectRootComponent call signature': 'T extends TagSelectItem = TagSelectItem',
    },
    aliases: { TagSelectItem: '{ id: Key; [key: string]: unknown; }' },
  },
  text: {
    forms: {
      TextOwnProps: "T extends TextElement = 'span'",
      TextProps: "T extends TextElement = 'span'",
      'TextComponent call signature': "T extends TextElement = 'span'",
    },
    aliases: { TextElement: "'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div' | 'label'" },
  },
};

/** Whether the printed generic forms of any of `modules` differ from the committed ones once `edits` are applied. */
const formsDiffer = (modules, edits = {}) => modules.some((module) => !isDeepStrictEqual(genericForms(emittedWith(module, edits[module])), FORMS[module]));

test('the generic forms of the emitted declarations are the committed ones: parameters, constraints, defaults and the aliases they name', () => {
  for (const module of Object.keys(FORMS)) assert.deepEqual(genericForms(emittedWith(module)), FORMS[module], module);
});

/** Diagnostics of `testFile` against the emitted declarations of `modules`, each text edited by `edits[module]` ([from, to] pairs, each present once). */
function diagnosticsWith(tsc, { testFile, modules }, edits = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'muxui-generic-types-'));
  try {
    mkdirSync(join(directory, 'node_modules/@types'), { recursive: true });
    symlinkSync(resolve(packageRoot, 'node_modules/@types/react'), join(directory, 'node_modules/@types/react'), 'junction');
    for (const module of modules) writeFileSync(join(directory, `${module}.d.ts`), emittedWith(module, edits[module]));
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
  // The defaults a form could take instead of the item, each one the witnesses might accept: it adds an optional member (an item with
  // the member is the item, and the item is assignable to it), adds a required member, narrows the key an id is to a string, or loses the
  // index signature. Each form is given each, on its own.
  const forms = [
    [`${name}Props`, (value) => [[props, `export type ${name}Props<T extends ${item} = ${value}> =`]]],
    [`${name}RootProps`, (value) => [[rootProps, `export type ${name}RootProps<T extends ${item} = ${value}> = ${name}Props<T>;`]]],
    ['the call signature of Root', (value) => [[root, `<T extends ${item} = ${value}>(props: ${name}RootProps<T> &`]]],
  ];
  const values = [
    ['adds an optional member', `${item} & { special?: number }`],
    ['adds a required member', `${item} & { special: number }`],
    ['narrows the id to a string', `${item} & { id: string }`],
    ['loses the index signature', '{ id: Key }'],
  ];
  const defaults = Object.fromEntries(forms.flatMap(([form, edit]) => values.map(([what, value]) => [`${name}: the default of ${form} ${what}`, { [module]: edit(value) }])));
  const mutations = {
    // The item replaced by its constraint where a member names it: the list, the render function, and the label function.
    [`${name}: a member replaced by its constraint`]: { [module]: [
      [`items?: ${items('T')};`, `items?: ${items(`${name}Item`)};`],
      ['children?: ReactNode | ((item: T) => ReactNode);', `children?: ReactNode | ((item: ${name}Item) => ReactNode);`],
      ...(label ? [['getItemLabel?: (item: T) => string;', `getItemLabel?: (item: ${name}Item) => string;`]] : []),
    ] },
    [`${name}: a lost binder`]: { [module]: [[root, `(props: ${name}RootProps<${name}Item> &`]] },
    [`${name}: a changed constraint`]: { [module]: [[`export type ${name}Item = {\n    id: Key;`, `export type ${name}Item = {\n    id?: Key;`]] },
    [`${name}: a const binder`]: { [module]: [[root, `<const T extends ${item} = ${item}>(props: ${name}RootProps<T> &`]] },
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
  return { mutations, defaults };
};

const multiSelect = choice('MultiSelect', 'multi-select', (item) => `Iterable<${item}>`, false);
const tagSelect = choice('TagSelect', 'tag-select', (item) => `${item}[]`, true);

// Text's defaults: another element, the whole union the constraint is, and a union of two.
const textDefault = (form, value) => (form === 'TextProps'
  ? [["export type TextProps<T extends TextElement = 'span'> =", `export type TextProps<T extends TextElement = ${value}> =`]]
  : [["export interface TextComponent {\n    <T extends TextElement = 'span'>", `export interface TextComponent {\n    <T extends TextElement = ${value}>`]]);
const textDefaults = Object.fromEntries(['TextProps', 'the call signature of Text'].flatMap((form) => [
  ['is label', "'label'"],
  ['is p', "'p'"],
  ['is the whole union of elements', 'TextElement'],
  ['is a union of span and p', "'span' | 'p'"],
].map(([what, value]) => [`Text: the default of ${form} ${what}`, { text: textDefault(form === 'TextProps' ? form : 'TextComponent', value) }])));

const PROJECTS = [
  {
    label: 'MultiSelect and TagSelect',
    testFile: 'choice-select.types.test.tsx',
    modules: ['multi-select', 'tag-select'],
    mutations: { ...multiSelect.mutations, ...tagSelect.mutations },
    defaults: { ...multiSelect.defaults, ...tagSelect.defaults },
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
    defaults: textDefaults,
  },
];

for (const [label, tsc] of compilers) {
  for (const project of PROJECTS) {
    test(`the ${project.label} types hold on the emitted declarations: ${label}`, () => {
      assert.deepEqual(diagnosticsWith(tsc, project), []);
    });

    const failsInTheTestFile = (name, edits) => {
      const diagnostics = diagnosticsWith(tsc, project, edits);
      assert.notDeepEqual(diagnostics, [], name);
      // The copy is a valid declaration, and a witness in the test file is what catches it: a diagnostic in a declaration file would mean
      // the copy was merely malformed.
      assert.deepEqual(diagnostics.filter((diagnostic) => !diagnostic.includes(`/${project.testFile}(`)), [], `${name}: the copy fails in the test file only`);
    };

    test(`the ${project.label} types fail when the declarations lose the parameter in any of ${Object.keys(project.mutations).length} ways: ${label}`, () => {
      for (const [name, edits] of Object.entries(project.mutations)) failsInTheTestFile(name, edits);
    });

    test(`the ${project.label} types fail when a form takes another default, in any of ${Object.keys(project.defaults).length} ways, each failing the printed forms and the test file: ${label}`, () => {
      for (const [name, edits] of Object.entries(project.defaults)) {
        assert.ok(formsDiffer(project.modules, edits), `${name}: the printed forms differ from the committed ones`);
        failsInTheTestFile(name, edits);
      }
    });
  }
}
