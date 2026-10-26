import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { glob, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import * as RAC from 'react-aria-components';
import { compilePureTokenGraph, cssDeclaration } from '@muxui/tokens/core';
import { catalogStateKinds, establishedClasses, partFailures, readCatalog, stateFailures } from './support/styling-inventory.mjs';
import { booleanStates, enumeratedStates, stateAttribute, substrateStateAttributes } from '../src/styling-contract.ts';
import { mappedParts, noElementParts, partClass, publicSharedClasses, sharedParts } from './support/styling-parts.ts';
import {
  attributeFindingsIn, auditedReactAria, booleanValueSelectors, foreignAttributes, historicalPaths, listSources, probePaths, renamedPropAttributes, racStateWriters, reactAriaImportProblems, reactAriaVersionProblems, reviewedRacImports, reviewedRacWriters,
  scriptAttributeFindings, styleAttributeFindings, substrateWrappers,
} from './support/attribute-guard.mjs';
import { leakedStateAttributes, leakProblems, mountedCases, renderMounted, renderServer, serverCases, shownStates } from './support/state-matrix.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const manifestPath = resolve(packageRoot, 'package.json');
const sourceRoot = resolve(packageRoot, 'src');
const reactAriaNames = Object.keys(substrateStateAttributes);
const { wrapped } = substrateWrappers(await readFile(resolve(sourceRoot, 'substrate.ts'), 'utf8'));

const source = JSON.parse(await readFile(resolve(packageRoot, '../../catalog/tokens/default-theme.json'), 'utf8'));
const tokenGraph = compilePureTokenGraph(source);
const tokenNames = new Set(Object.values(tokenGraph.tokens).flatMap((token) => [
  ...cssDeclaration(token, tokenGraph.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu),
].map(([, name]) => name)));
const styles = [];
for await (const path of glob('src/**/*.css', { cwd: packageRoot })) {
  styles.push({ path, css: await readFile(resolve(packageRoot, path), 'utf8') });
}

test('all authored component styles resolve design tokens through semantic or component roles', () => {
  const failures = [];
  for (const { path, css } of styles) {
    const localHooks = new Set([...css.matchAll(/(--muxui-component-[\w-]+)\s*:/gu)].map(([, name]) => name));
    for (const [match, variable, fallback] of css.matchAll(/var\((--muxui-(?:reference|semantic|component)-[\w-]+)(\s*,)?/gu)) {
      // Renderer-owned geometry hooks may be locally defined or expose a fallback;
      // semantic token references must always exist in the canonical theme.
      const geometryHook = variable.startsWith('--muxui-component-') && (localHooks.has(variable) || fallback);
      if (!tokenNames.has(variable) && !geometryHook) failures.push(`${path}: unknown ${match}`);
      if (variable.startsWith('--muxui-reference-')) failures.push(`${path}: reference-layer styling ${match}`);
    }
  }
  assert.deepEqual(failures, []);
});

// A component token no authored rule reads is a recipe entry that does nothing. This is static reachability: a token is read
// when an authored rule var()s one of the custom properties it compiles to (a structured token compiles to several) or a
// token that depends on it is read. Comments are not reads. It does not show that a read reaches a painted property; the
// browser tests of the families do.
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, '');
const dependents = new Map();
for (const id of Object.keys(tokenGraph.tokens)) {
  for (const dependency of tokenGraph.dependencies[id] ?? []) dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
}
const declaredNames = (id) => [...cssDeclaration(tokenGraph.tokens[id], tokenGraph.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu)].map(([, name]) => name);

function unreadComponentTokens(css) {
  const reads = new Set([...stripComments(css).matchAll(/var\(\s*(--muxui-[\w-]+)/gu)].map(([, name]) => name));
  const read = (id, seen = new Set()) => !seen.has(id) && (seen.add(id), declaredNames(id).some((name) => reads.has(name)) || (dependents.get(id) ?? []).some((next) => read(next, seen)));
  return Object.keys(tokenGraph.tokens).filter((id) => id.startsWith('component.') && !read(id));
}

// The one token no rule reads. A grouped disclosure's icon and label have no Mux element to style, and wiring the gap
// to the trigger would change its default from 14px to 8px, so the canonical example sets the label gap itself. The
// example must carry the read as a style declaration, not in a comment.
const exampleReads = {
  'component.disclosuregroup.label-gap': {
    file: '../../catalog/components/disclosure-group/examples/react/basic.tsx',
    read: /\bgap:\s*'var\(--muxui-component-disclosuregroup-label-gap\)'/u,
  },
};
const stripCodeComments = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, '');

test('every component token is read by an authored rule, by a token that is, or by the canonical example it names', async () => {
  const authored = styles.map(({ css }) => css).join('\n');
  const unread = unreadComponentTokens(authored);
  assert.deepEqual(unread, Object.keys(exampleReads));
  for (const [id, { file, read }] of Object.entries(exampleReads)) {
    assert.match(stripCodeComments(await readFile(resolve(packageRoot, file), 'utf8')), read, `${id} is read by ${file}`);
    const mention = "// gap: 'var(--muxui-component-disclosuregroup-label-gap)'\n/* gap: 'var(--muxui-component-disclosuregroup-label-gap)' */";
    assert.doesNotMatch(stripCodeComments(mention), read, `a comment is not a read of ${id}`);
  }
  // The guard fails when reads go. It reports what a mutant newly leaves unread.
  const newlyUnread = (css) => unreadComponentTokens(css).filter((id) => !unread.includes(id));
  const buttonRoles = ['component.button.background', 'component.button.foreground', 'component.button.radius'];
  assert.deepEqual(newlyUnread(authored.replaceAll(/var\(--muxui-component-button-(?:background|foreground|radius)\b/gu, 'var(--x')), buttonRoles, 'the Button reads removed');
  assert.deepEqual(newlyUnread(authored.replaceAll(/var\(--muxui-component-disclosuregroup-transition-[\w-]+\)/gu, 'var(--x)')),
    ['component.disclosuregroup.motion-duration', 'component.disclosuregroup.transition'], 'the transition part reads removed');
  // A comment that names the properties restores nothing: the Button reads back to their fallbacks, plus the comment.
  const fallbacksOnly = authored.replaceAll(/var\(--muxui-component-button-(?:background|foreground|radius), (var\(--muxui-[\w-]+\))\)/gu, '$1');
  assert.notEqual(fallbacksOnly, authored, 'the Button reads exist to remove');
  assert.deepEqual(newlyUnread(`${fallbacksOnly}\n/* var(--muxui-component-button-background) var(--muxui-component-button-foreground) var(--muxui-component-button-radius) */`), buttonRoles, 'the Button reads replaced by a comment');
});

test('component spacing declarations keep gaps separate from padding and geometry', () => {
  const failures = [];
  for (const { path, css } of styles) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
    for (const [, property, value] of withoutComments.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/gu)) {
      const refs = [...value.matchAll(/var\((--muxui-(?:semantic|component)-[\w-]+)/gu)].map(([, name]) => name);
      for (const ref of refs) {
        const switchLabelGap = property === 'padding-inline-start' && value.includes('--muxui-component-switch-track-width');
        if (!switchLabelGap && (/^padding(?:-|$)/u.test(property) || /padding|inset/u.test(property) || /^(?:top|right|bottom|left|(?:min-|max-)?(?:width|height|inline-size|block-size)|inset(?:-.+)?)$/u.test(property)) && /-gap$/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (/(?:^|-)gap$/u.test(property) && /(?:padding|inset|radius|typography)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (/^margin(?:-|$)/u.test(property) && /(?:padding|inset|radius)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        if (property.includes('radius') && /(?:layout|padding|typography)/u.test(ref)) {
          failures.push(`${path}: ${property} must not borrow ${ref}`);
        }
        // Size calculations may include padding or viewport clearance, but an
        // inset alone must not stand in for an indicator's width or height.
        if (/^(?:min-|max-)?(?:width|height|inline-size|block-size)$/u.test(property) && /(?:padding|inset)/u.test(ref) && !value.includes('calc(')) {
          failures.push(`${path}: ${property} must use a size role instead of ${ref}`);
        }
        if (/background|border|outline|box-shadow/u.test(property) && ref.startsWith('--muxui-semantic-content-')) {
          failures.push(`${path}: ${property} must use a surface, border, selection, or focus role instead of ${ref}`);
        }
        if ((property === 'color' || property.endsWith('foreground')) && /--muxui-semantic-(?:surface-|border-|feedback-invalid-border$)/u.test(ref)) {
          failures.push(`${path}: ${property} must use a foreground role instead of ${ref}`);
        }
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('semantic styling roles compile across all declared mode combinations', () => {
  const combinations = Object.entries(source.theme.modeAxes).reduce((rows, [axis, values]) =>
    rows.flatMap((row) => values.map((value) => ({ ...row, [axis]: value }))), [{}]);
  for (const modes of combinations) {
    const graph = compilePureTokenGraph(source, { modes });
    assert.equal(Object.keys(graph.tokens).length, Object.keys(source.tokens).length);
  }
});

// The styling contract inventory (CSS Stage 2). It proves the contract covers every catalog state and anatomy
// entry, not that a class is emitted on the right element; that proof comes with the class scheme PR.
const catalog = await readCatalog(resolve(packageRoot, '../..'));
const { selected, isEstablished } = await establishedClasses(packageRoot, styles.map(({ css }) => css));
const parts = { mapped: mappedParts, shared: sharedParts, noElement: noElementParts };

// React Aria spells every state data-<name> except read-only (data-readonly); the Mux spelling replaces it.
const reactAriaName = (state) => `data-${state === 'read-only' ? 'readonly' : state}`;
const closedStates = [...booleanStates, ...Object.keys(enumeratedStates)];
// States no authored rule selects, which the closed list keeps because consumers style them and the docs name them.
const notSelectedByStyles = ['has-submenu'];

test('the closed state list is spelled once and the authored styles select exactly its states, in the Mux spelling', () => {
  assert.equal(new Set(closedStates).size, closedStates.length);
  assert.ok(!closedStates.includes('readonly'), 'the catalog spells read-only');
  const css = styles.map((style) => style.css).join('\n');
  const selectedStates = new Set([...css.matchAll(/\[data-muxui-state-([a-z-]+)/gu)].map(([, name]) => name));
  for (const state of closedStates) assert.equal(selectedStates.has(state), !notSelectedByStyles.includes(state), `${state} is selected by an authored style`);
  assert.deepEqual([...selectedStates].filter((name) => !closedStates.includes(name)), [], 'a selected state is on the closed list');
  // The old spelling is gone from the styles; only the Mux spelling matches.
  for (const state of closedStates) assert.equal(css.includes(`[${reactAriaName(state)}`), false, `${reactAriaName(state)} is not selected`);
  assert.equal(stateAttribute('read-only'), 'data-muxui-state-read-only');
  assert.equal(stateAttribute('orientation'), 'data-muxui-state-orientation');

  // A boolean state is selected by presence; only enumerated states carry a value a selector may compare.
  assert.deepEqual(booleanValueSelectors(css, booleanStates), [], 'no authored selector compares the value of a boolean state');
  assert.deepEqual(booleanValueSelectors(".a[data-muxui-state-disabled='true'] { color: red; }", booleanStates), ["[data-muxui-state-disabled='true']"], 'an equality on a boolean');
  assert.deepEqual(booleanValueSelectors('.a:not([data-muxui-state-read-only~=x], :disabled) { color: red; }', booleanStates), ['[data-muxui-state-read-only~=x]'], 'a word match on a boolean');
  assert.deepEqual(booleanValueSelectors('.a[ data-muxui-state-selected ^= "t" ] { color: red; }', booleanStates), ['[ data-muxui-state-selected ^= "t" ]'], 'a prefix match on a boolean');
  assert.deepEqual(booleanValueSelectors("[data-muxui-state-orientation='vertical'], [data-muxui-state-placement^='top'], [data-muxui-state-disabled], .a[data-muxui-state-selected]:not([data-muxui-state-disabled]), /* [data-muxui-state-disabled='true'] */ .b { color: red; }", booleanStates), [], 'enumerated values, presence selectors and comments are free');
});

test('the substrate table maps each React Aria state spelling to its Mux spelling, once per state', () => {
  assert.deepEqual(substrateStateAttributes, Object.fromEntries(closedStates.map((state) => [reactAriaName(state), stateAttribute(state)])));
});

test('every catalog state is classified by meaning, none is left open, and a status names an attribute a family writes', async () => {
  assert.deepEqual(stateFailures(catalog.states), []);
  assert.deepEqual(Object.entries(catalogStateKinds).filter(([, [kind]]) => kind === 'unresolved').map(([name]) => name), [], 'no state is left unresolved');
  const sources = (await Promise.all((await listSources(sourceRoot, ['.ts', '.mjs'])).map((file) => readFile(resolve(sourceRoot, file), 'utf8')))).join('\n');
  const statuses = Object.entries(catalogStateKinds).filter(([, [kind]]) => kind === 'status');
  assert.deepEqual(statuses.map(([name]) => name), ['loaded', 'fallback', 'error']);
  for (const [name, [, status]] of statuses) assert.ok(sources.includes(`'data-muxui-${status}'`), `${name} is written as data-muxui-${status}`);
});

test('the state classification refuses an unclassified name, a stale entry and a target outside the closed list', () => {
  assert.match(stateFailures(new Set([...catalog.states, 'glowing'])).join(), /unclassified state glowing/u);
  assert.match(stateFailures(new Set([...catalog.states].filter((name) => name !== 'wrap'))).join(), /stale classification wrap/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, hovered: ['state', 'hover'] }).join(), /hovered names hover/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, vertical: ['enum', 'orientation', 'sideways'] }).join(), /vertical names orientation=sideways/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, error: ['unresolved'] }).join(), /error is unresolved without a reason and a PR/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, error: ['status'] }).join(), /error is a status without the attribute it names/u);
});

test('every catalog anatomy entry is in the part map exactly once with an established class or a reason', () => {
  assert.deepEqual(partFailures(catalog.anatomy, parts, isEstablished), []);
  assert.equal(mappedParts.length + sharedParts.length + noElementParts.length, [...catalog.anatomy.values()].flat().length);
});

test('the part map check refuses a bogus class, a duplicate, a missing entry and keys the catalog lacks', () => {
  const failures = (changes) => partFailures(catalog.anatomy, { ...parts, ...changes }, isEstablished).join('\n');
  const withValue = (rows, family, part, value) => rows.map((row) => row[0] === family && row[1] === part ? [family, part, value] : row);
  const without = (rows, family, part) => rows.filter((row) => row[0] !== family || row[1] !== part);
  // A mapping is not a hook because its key exists: the class must be selected by a rule or spelled in source.
  assert.equal(isEstablished('muxui-button__bogus'), false);
  assert.match(failures({ mapped: withValue(mappedParts, 'button', 'root', 'muxui-button__bogus') }), /button\.root: muxui-button__bogus is not an established class/u);
  assert.match(failures({ shared: withValue(sharedParts, 'autocomplete', 'label', 'muxui-field-bogus') }), /autocomplete\.label: muxui-field-bogus is not an established class/u);
  assert.match(failures({ noElement: [...noElementParts, ['button', 'root', 'Both.']] }), /button\.root: listed as mapped and noElement/u);
  assert.match(failures({ mapped: without(mappedParts, 'activity', 'header') }), /activity\.header: not mapped/u);
  assert.match(failures({ mapped: [...mappedParts, ['nope', 'root', 'muxui-button']] }), /nope\.root: unknown family/u);
  assert.match(failures({ mapped: [...mappedParts, ['button', 'nope', 'muxui-button']] }), /button\.nope: unknown part/u);
  assert.match(failures({ noElement: withValue(noElementParts, 'alert-dialog', 'root', '') }), /alert-dialog\.root: noElement without a reason/u);
});

test('every family root class is selected by a style rule except the recorded gaps', () => {
  const roots = mappedParts.filter(([, part]) => part === 'root');
  // AlertDialog.Root renders no element. Lightbox and Text emit the root class and no rule selects it.
  assert.deepEqual(noElementParts.filter(([, part]) => part === 'root').map(([family]) => family), ['alert-dialog']);
  assert.deepEqual(roots.filter(([, , name]) => !selected.has(name)).map(([family]) => family), ['lightbox', 'text']);
  // Input and Menu roots differ from the class their control carries, which the root rule of the same name styles.
  assert.deepEqual(roots.filter(([family, , name]) => name !== `muxui-${family}`).map(([family]) => family), ['input', 'menu']);
});

test('the class naming function agrees with every BEM part class that exists, and the public shared classes are in use', () => {
  assert.equal(partClass('button', 'root'), 'muxui-button');
  assert.equal(partClass('text-editor', 'color-popup'), 'muxui-text-editor__color-popup');
  const mapped = new Map(mappedParts.map(([family, part, name]) => [`${family}.${part}`, name]));
  for (const [family, list] of catalog.anatomy) {
    for (const part of list.filter((name) => name !== 'root' && selected.has(partClass(family, name)))) {
      assert.equal(mapped.get(`${family}.${part}`), partClass(family, part), `${family}.${part} is already the BEM class`);
    }
  }
  for (const name of publicSharedClasses) {
    assert.ok(selected.has(name) && sharedParts.some(([, , shared]) => shared === name), `${name} is styled and shared`);
  }
});

// The substrate adapter (src/substrate.ts) is the one place React Aria components are wrapped. A component left raw
// would render the React Aria state names, so the shape of every export is checked on the syntax tree.
test('every substrate export is a pure-annotated internal wrapper of one React Aria component', async () => {
  const text = await readFile(resolve(packageRoot, 'src/substrate.ts'), 'utf8');
  const { problems, wrapped } = substrateWrappers(text);
  assert.deepEqual(problems, []);
  assert.ok(wrapped.length > 70 && wrapped.includes('Button') && wrapped.includes('DateInput') && wrapped.includes('ColorSwatchPicker'));

  const problemsOf = (change) => substrateWrappers(change(text)).problems.join('\n');
  assert.match(problemsOf((t) => t.replace('export const AriaDateInput = /*#__PURE__*/ withMuxInputState(/*#__PURE__*/ withMuxState(RAC.DateInput, \'div\'));', 'export const AriaDateInput = RAC.DateInput;')), /AriaDateInput: not built by withMuxState/u, 'a raw export');
  assert.match(problemsOf((t) => `${t}\nexport { Button } from 'react-aria-components';`), /not a wrapper declaration/u, 'a re-export');
  assert.match(problemsOf((t) => `${t}\nexport function helper() {}`), /only Aria wrappers are exported/u, 'another kind of export');
  assert.match(problemsOf((t) => t.replace('withMuxState(RAC.Button,', 'withMuxState(RAC.ToggleButton,')), /AriaButton: wraps ToggleButton/u, 'the wrong component');
  assert.match(problemsOf((t) => t.replace('/*#__PURE__*/ withMuxState(RAC.Button,', 'withMuxState(RAC.Button,')), /AriaButton: no \/\*#__PURE__\*\/ annotation/u, 'a wrapper without the tree-shaking annotation');
  assert.match(problemsOf((t) => t.replace('withMuxState(RAC.Button, \'button\')', 'withMuxState(RAC.Button)')), /AriaButton: no element/u, 'a wrapper without an element');
  assert.match(problemsOf((t) => `${t}\n/** @internal */\nexport const AriaButton2 = /*#__PURE__*/ withMuxState(RAC.Button, 'button');`), /Button is wrapped twice/u, 'a duplicate');
});

// A React Aria upgrade can add a reader of a state attribute the rename would break (today the only one is the date
// segments' data-placeholder). Bumping a version fails here until the audit is repeated and the table is updated.
test('the audited React Aria versions are the declared and installed ones', () => {
  const manifestPath = resolve(packageRoot, 'package.json');
  assert.deepEqual(reactAriaVersionProblems(manifestPath), []);
  assert.match(reactAriaVersionProblems(manifestPath, { ...auditedReactAria, 'react-aria': '3.50.0' }).join(), /react-aria is declared as 3\.51\.0, audited at 3\.50\.0/u);
  assert.match(reactAriaVersionProblems(manifestPath, { ...auditedReactAria, 'react-stately': '3.48.0' }).join(), /react-stately is installed at 3\.49\.0, audited at 3\.48\.0/u);
});

// A family that imports a wrapped component straight from React Aria Components renders the React Aria state names.
test('every React Aria import outside the substrate is a wrapper import or a reviewed name', async () => {
  const problems = [];
  for (const file of await listSources(sourceRoot, ['.ts', '.tsx', '.mjs'])) {
    if (file === 'substrate.ts') continue;
    for (const problem of reactAriaImportProblems(await readFile(resolve(sourceRoot, file), 'utf8'), file, wrapped)) problems.push(`${file} ${problem}`);
  }
  assert.deepEqual(problems, []);

  const problemsOf = (code) => reactAriaImportProblems(code, 'family.ts', wrapped).join('\n');
  assert.match(problemsOf("import { Button } from 'react-aria-components';"), /Button is wrapped; import AriaButton from the substrate/u, 'a wrapped component');
  assert.match(problemsOf("import { UNSTABLE_Toast as Toast } from 'react-aria-components';"), /UNSTABLE_Toast is wrapped; import AriaToast/u, 'an aliased wrapped component');
  assert.match(problemsOf("import { ColumnResizer } from 'react-aria-components';"), /ColumnResizer from react-aria-components is neither wrapped nor reviewed/u, 'an unreviewed name');
  assert.match(problemsOf("import * as RAC from 'react-aria-components';"), /a namespace import/u, 'a namespace');
  assert.match(problemsOf("import RAC from 'react-aria-components';"), /a default import/u, 'a default import');
  assert.match(problemsOf("export { Button } from 'react-aria-components';"), /Button is re-exported/u, 'a re-export');
  assert.match(problemsOf("export * from 'react-aria-components';"), /export \* from/u, 'a star re-export');
  assert.match(problemsOf("const RAC = await import('react-aria-components');"), /a dynamic import or require/u, 'a dynamic import');
  assert.match(problemsOf("const { Button } = require('react-aria-components');"), /a dynamic import or require/u, 'a require');
  assert.match(problemsOf("import { useButton } from 'react-aria';"), /useButton from react-aria is not reviewed/u, 'an unreviewed hook');
  // Every form reaches a wrapped component, so every form is classified by name or refused, whatever the specifier.
  assert.match(problemsOf("import { ColorThumb } from 'react-aria-components/ColorThumb';"), /ColorThumb is wrapped; import AriaColorThumb/u, 'a wrapped component from a subpath');
  assert.match(problemsOf("import { ColumnResizer } from 'react-aria-components/Table';"), /ColumnResizer from react-aria-components is neither wrapped nor reviewed/u, 'an unreviewed name from a subpath');
  assert.match(problemsOf("import * as Thumb from 'react-aria-components/ColorThumb';"), /a namespace import from react-aria-components\/ColorThumb/u, 'a namespace of a subpath');
  assert.match(problemsOf("import Thumb from 'react-aria-components/ColorThumb';"), /a default import from react-aria-components\/ColorThumb/u, 'a default import of a subpath');
  assert.match(problemsOf("import 'react-aria-components/ColorThumb';"), /a bare import of react-aria-components\/ColorThumb/u, 'a bare import of a subpath');
  assert.match(problemsOf("import { Label } from 'react-aria-components/private/utils';"), /react-aria-components\/private\/utils is a private subpath/u, 'a private subpath');
  assert.match(problemsOf("export { ColorThumb } from 'react-aria-components/ColorThumb';"), /ColorThumb is re-exported from react-aria-components\/ColorThumb/u, 'a re-export from a subpath');
  assert.match(problemsOf("export * from 'react-aria-components/ColorThumb';"), /export \* from react-aria-components\/ColorThumb/u, 'a star re-export from a subpath');
  assert.match(problemsOf("export * as Thumb from 'react-aria-components/ColorThumb';"), /export \* from react-aria-components\/ColorThumb/u, 'a namespace re-export from a subpath');
  assert.match(problemsOf("const { ColorThumb } = await import('react-aria-components/ColorThumb');"), /a dynamic import or require of react-aria-components\/ColorThumb/u, 'a dynamic import of a subpath');
  assert.match(problemsOf("const { ColorThumb } = require('react-aria-components/ColorThumb');"), /a dynamic import or require of react-aria-components\/ColorThumb/u, 'a require of a subpath');
  assert.match(problemsOf('const load = (name) => import(name);'), /specifier is not a string literal/u, 'a dynamic import that cannot be read');
  assert.match(problemsOf("import RAC = require('react-aria-components');"), /an import-equals of react-aria-components/u, 'an import-equals');
  assert.match(problemsOf("import { ColorThumb } from '../node_modules/react-aria-components/dist/ColorThumb.mjs';"), /reaches into a package directory/u, 'a path into node_modules');
  assert.match(problemsOf("export { ColorThumb } from './react-aria-components/ColorThumb';"), /reaches into a package directory/u, 'a path named after the package');
  assert.equal(problemsOf("import { Label } from 'react-aria-components/Label';\nimport type { ColorThumbProps } from 'react-aria-components/ColorThumb';\nexport type { ColorThumbProps } from 'react-aria-components/ColorThumb';"), '', 'reviewed names and types from a subpath are free');
  assert.equal(problemsOf("import type { ButtonProps } from 'react-aria-components';\nimport { Label, parseColor } from 'react-aria-components';\nimport { type Button, Text } from 'react-aria-components';\nimport { useField } from 'react-aria';"), '', 'types and reviewed names are free');
  assert.deepEqual(wrapped.filter((name) => reviewedRacImports.includes(name)), [], 'a name is wrapped or reviewed, not both');
});

// The wrapped list and the reviewed list are claims about the installed package, so they are recomputed from it.
test('every React Aria Components export that can write a state attribute is wrapped or reviewed', () => {
  const writers = racStateWriters(manifestPath, reactAriaNames);
  const accounted = (names) => (name) => names.includes(name) || name in reviewedRacWriters;
  assert.deepEqual([...writers.keys()].filter((name) => !accounted(wrapped)(name)), [], 'a writer that is neither wrapped nor reviewed');
  assert.deepEqual(wrapped.filter((name) => !writers.has(name)), [], 'a wrapper of a component that writes no state');
  assert.deepEqual(Object.keys(reviewedRacWriters).filter((name) => !writers.has(name)), [], 'a reviewed writer that no longer writes');
  assert.deepEqual(reviewedRacImports.filter((name) => writers.has(name) && !(name in reviewedRacWriters)), [], 'a reviewed import that writes');
  // Controls: dropping a wrapper leaves its component unaccounted for, and a writer set read for no attribute is empty.
  assert.deepEqual([...writers.keys()].filter((name) => !accounted(wrapped.filter((wrappedName) => wrappedName !== 'DateInput'))(name)), ['DateInput']);
  assert.equal(racStateWriters(manifestPath, ['data-not-written-by-anything']).size, 0);
});

// Where a React Aria state attribute name still appears in a source file it is a read or a write the rename missed.
test('no authored source or stylesheet names a React Aria state attribute', async () => {
  // Tiptap's Placeholder extension writes data-placeholder itself and the editor stylesheet reads it with attr(). The README
  // text in generate.mjs names the two attributes React Aria keeps (the date segments' data-placeholder and the hidden
  // picker input's data-disabled), so a reader of the README knows not to rely on them.
  const foreign = { 'text-editor/text-editor.css': ['data-placeholder'], 'generate.mjs': ['data-placeholder', 'data-disabled'] };
  const exempt = new Set(['substrate.ts', 'styling-contract.ts']);
  const findings = [];
  for (const file of await listSources(sourceRoot, ['.ts', '.tsx', '.mjs', '.css'])) {
    if (exempt.has(file)) continue;
    const text = await readFile(resolve(sourceRoot, file), 'utf8');
    const found = file.endsWith('.css') ? styleAttributeFindings(text, reactAriaNames) : scriptAttributeFindings(text, file, reactAriaNames);
    for (const { attribute, via, line } of found) if (!foreign[file]?.includes(attribute)) findings.push(`${file}${line ? `:${line}` : ''} ${attribute} (${via})`);
  }
  assert.deepEqual(findings, []);

  const scriptFindings = (code) => scriptAttributeFindings(code, 'family.ts', reactAriaNames).map(({ attribute, via }) => `${attribute} ${via}`);
  assert.deepEqual(scriptFindings("el.hasAttribute('data-disabled')"), ['data-disabled string'], 'a method argument');
  assert.deepEqual(scriptFindings("h('div', { 'data-hovered': true })"), ['data-hovered string'], 'an object key');
  assert.deepEqual(scriptFindings("const selector = '[data-focus-visible]';"), ['data-focus-visible string'], 'a selector');
  assert.deepEqual(scriptFindings('el.dataset.focusVisible'), ['data-focus-visible dataset'], 'a dataset property');
  assert.deepEqual(scriptFindings("el.dataset['selected']"), ['data-selected dataset'], 'a dataset key');
  assert.deepEqual(scriptFindings('el.dataset[key]'), ['dataset[...] dataset'], 'a computed dataset key');
  assert.deepEqual(scriptFindings('el.hasAttribute(`data-${state}`)'), ['data-${...} template'], 'a name built at run time');
  assert.deepEqual(scriptFindings('el.matches(/\\[data-pressed\\]/)'), ['data-pressed regex'], 'a regular expression');
  assert.deepEqual(scriptAttributeFindings('const a = <div data-open />;', 'family.tsx', reactAriaNames).map(({ attribute }) => attribute), ['data-open'], 'a JSX attribute');
  assert.deepEqual(scriptFindings("el.hasAttribute('data-muxui-state-disabled')"), [], 'the Mux spelling');
  assert.deepEqual(scriptFindings('// data-disabled in a comment'), [], 'a comment');
  const styleFindings = (css) => styleAttributeFindings(css, reactAriaNames).map(({ attribute, via }) => `${attribute} ${via}`);
  assert.deepEqual(styleFindings('.a[data-hovered] { color: red; }'), ['data-hovered selector']);
  assert.deepEqual(styleFindings(".a:not([data-disabled='true']) { color: red; }"), ['data-disabled selector']);
  assert.deepEqual(styleFindings('.a::before { content: attr(data-placeholder); }'), ['data-placeholder attr']);
  assert.deepEqual(styleFindings('/* [data-hovered] */ .a[data-muxui-state-hovered] { color: red; }'), []);
});

// The two attributes React Aria keeps are disclosed in the README a consumer reads, beside the contract they sit outside.
test('the README discloses the date segments\' data-placeholder and the hidden picker input\'s data-disabled', async () => {
  const readme = await readFile(resolve(packageRoot, 'README.md'), 'utf8');
  assert.match(readme, /Date and time field segments keep `data-placeholder` beside `data-muxui-state-placeholder`/u);
  assert.match(readme, /The hidden form input inside DatePicker and DateRangePicker keeps `data-disabled`/u);
  assert.match(readme, /No Mux UI style selects either one/u);
});

// The static scans cannot see a component that renders another one (DateInput renders a Group and an Input), so the
// markup of real families in real states is checked too: server rendered, and mounted for overlays and calendars.
test('no family renders a React Aria state attribute and each renders the states it is put in', async () => {
  const problems = [];
  for (const [name, [element, states, allowed = []]] of Object.entries(serverCases)) problems.push(...leakProblems(`${name} (server)`, renderServer(element), states, allowed, reactAriaNames));
  for (const [name, [element, states, allowed = []]] of Object.entries(mountedCases)) problems.push(...leakProblems(`${name} (mounted)`, await renderMounted(element), states, allowed, reactAriaNames));
  assert.deepEqual(problems, []);

  // Controls: a component left raw leaks its name, a state the markup lacks is reported, and only a date segment may keep data-placeholder.
  const raw = renderServer(() => React.createElement(RAC.Button, { isDisabled: true }, 'Save'));
  assert.deepEqual(leakedStateAttributes(raw, reactAriaNames), ['data-disabled@button']);
  assert.equal(shownStates(raw).has('disabled'), false);
  const segment = { tag: 'span', isDateSegment: true, attributes: ['data-placeholder', 'data-muxui-state-placeholder'] };
  assert.deepEqual(leakedStateAttributes([segment], reactAriaNames), []);
  assert.deepEqual(leakedStateAttributes([{ ...segment, tag: 'div', isDateSegment: false }], reactAriaNames), ['data-placeholder@div']);
  assert.deepEqual([...shownStates([segment])], ['placeholder']);

  // The hidden input inside a picker is the one other exception, and it is exact: the input must be hidden and carry data-rac,
  // and each occurrence is one expected leak, so a visible input, a second hidden input or a lost one is reported.
  const [pickerElement, pickerStates, pickerAllowed] = serverCases.DatePicker;
  const picker = renderServer(pickerElement);
  const problemsOf = (elements, allowed = pickerAllowed) => leakProblems('DatePicker (server)', elements, pickerStates, allowed, reactAriaNames);
  const hiddenInput = { tag: 'input', isDateSegment: false, attributes: ['hidden', 'data-rac', 'data-disabled'] };
  assert.deepEqual(problemsOf(picker), [], 'the picker as it renders');
  assert.deepEqual(problemsOf([...picker, { ...hiddenInput, attributes: ['data-rac', 'data-disabled'] }]), ['DatePicker (server) renders data-disabled@input[data-rac]'], 'a visible input with data-disabled');
  assert.deepEqual(problemsOf([...picker, { ...hiddenInput, attributes: ['data-disabled'] }]), ['DatePicker (server) renders data-disabled@input'], 'a bare input with data-disabled');
  assert.deepEqual(problemsOf([...picker, { ...hiddenInput, attributes: ['hidden', 'data-disabled'] }]), ['DatePicker (server) renders data-disabled@input[hidden]'], 'a hidden input without data-rac');
  assert.deepEqual(problemsOf([...picker, hiddenInput]), ['DatePicker (server) renders data-disabled@input[hidden][data-rac]'], 'one hidden input more than the exception counts');
  assert.deepEqual(problemsOf(picker.filter((element) => !(element.tag === 'input' && element.attributes.includes('data-disabled')))), pickerAllowed.map((leak) => `DatePicker (server) no longer renders ${leak}, so its exception is stale`), 'the exception when it no longer occurs');
  assert.deepEqual(problemsOf(picker, []), pickerAllowed.map((leak) => `DatePicker (server) renders ${leak}`), 'the exception when it is not granted');
  assert.deepEqual(problemsOf([...picker, { tag: 'div', isDateSegment: false, attributes: ['data-disabled'] }]), ['DatePicker (server) renders data-disabled@div'], 'another element');
});

// The shipped names are the whole contract, so after the rename every tracked file speaks them. This is the lasting
// backstop for what the targeted scans cannot see (docs prose, catalog JSON, consumers, tests): a React Aria state or a
// reflected prop under its old name fails here unless the name is another product's, listed with whose.
test('no tracked file names an attribute under its name before the rename, except where the name is not Mux\'s', async () => {
  const repositoryRoot = resolve(packageRoot, '../..');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean)
    .filter((file) => !/\.(?:png|jpe?g|gif|webp|avif|woff2?|ico|pdf|zip|gz|lock)$/u.test(file) && !file.endsWith('pnpm-lock.yaml'));
  const forbidden = [...reactAriaNames, ...Object.keys(renamedPropAttributes)];
  const foreignFor = (file) => foreignAttributes.filter(({ path }) => file === path || (path.endsWith('/') && file.startsWith(path)));
  const findings = [];
  const seenForeign = new Map();
  for (const file of files) {
    if (probePaths.includes(file) || Object.keys(historicalPaths).some((path) => file.startsWith(path))) continue;
    const text = await readFile(resolve(repositoryRoot, file), 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    const allowed = foreignFor(file);
    for (const { attribute, via, line } of attributeFindingsIn(file, text, forbidden)) {
      const entry = allowed.find(({ names }) => names.includes(attribute));
      if (entry) seenForeign.set(`${entry.path} ${attribute}`, true);
      else findings.push(`${file}${line ? `:${line}` : ''} ${attribute} (${via})`);
    }
  }
  assert.deepEqual(findings, []);
  assert.deepEqual(foreignAttributes.flatMap(({ path, names }) => names.map((name) => `${path} ${name}`)).filter((key) => !seenForeign.has(key)), [], 'an exemption that no longer applies');

  // Every renamed prop is still written somewhere under its new name, so the table cannot drift from the code.
  const written = (await Promise.all((await listSources(sourceRoot, ['.ts', '.mjs', '.css'])).map((file) => readFile(resolve(sourceRoot, file), 'utf8')))).join('\n');
  assert.deepEqual(Object.values(renamedPropAttributes).filter((name) => !written.includes(name)), [], 'a renamed prop that no source writes or styles');
  assert.equal(Object.keys(renamedPropAttributes).length, 41);
  assert.deepEqual(Object.entries(renamedPropAttributes).filter(([old, next]) => next !== old.replace('data-', 'data-muxui-')).map(([old]) => old), ['data-density'], 'the one prop that does not take the plain prefix');
  assert.equal(Object.keys(substrateStateAttributes).length + Object.keys(renamedPropAttributes).length, 75);

  // Controls: each kind of file reports an old name, and a new name or an unrelated one passes.
  const found = (file, text) => attributeFindingsIn(file, text, forbidden).map(({ attribute }) => attribute);
  assert.deepEqual(found('a.css', '.a[data-size="lg"] { color: red; }'), ['data-size']);
  assert.deepEqual(found('a.mjs', "el.getAttribute('data-variant')"), ['data-variant']);
  assert.deepEqual(found('a.tsx', 'const a = <div data-card-type="visa" />;'), ['data-card-type']);
  assert.deepEqual(found('a.md', 'Style it with `[data-collapsed]` and data-density.'), ['data-collapsed', 'data-density']);
  assert.deepEqual(found('a.json', '{"note": "carries data-image-state"}'), ['data-image-state']);
  assert.deepEqual(found('a.mjs', "el.hasAttribute('data-muxui-size') && el.dataset.muxuiSize"), []);
  assert.deepEqual(found('a.md', 'data-sizes and my-data-size are other names'), []);
  assert.deepEqual(found('a.mjs', 'el.dataset.cardType'), ['data-card-type']);
});
