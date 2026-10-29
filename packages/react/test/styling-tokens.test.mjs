import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { glob, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import * as RAC from 'react-aria-components';
import { compilePureTokenGraph, cssDeclaration } from '@muxui/tokens/core';
import { classGrammar, cssClassNames, emittedFindings, vocabularyFindings } from './support/class-vocabulary.mjs';
import { classTokens, hasClassToken } from './support/class-tokens.mjs';
import { topLevelConstructs } from './support/scan-surface.mjs';
import { establishedClasses, guardedPrefixes, partFailures, readCatalog, stateFailures } from './support/styling-inventory.mjs';
import { booleanStates, enumeratedStates, stateAttribute, substrateStateAttributes } from '../src/styling-contract.ts';
import { catalogStateKinds, dispositions, elementQualifiers, noElementReasons, partClass, partRow, partRows, partSelector, publicSharedClasses, scopeClasses, selectorOf } from './support/styling-parts.ts';
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

test('every component token is read by an authored rule or by a token that is', () => {
  const authored = styles.map(({ css }) => css).join('\n');
  assert.deepEqual(unreadComponentTokens(authored), []);
  // The guard fails when reads go. It reports what a mutant leaves unread.
  const buttonRoles = ['component.button.background', 'component.button.foreground', 'component.button.radius'];
  assert.deepEqual(unreadComponentTokens(authored.replaceAll(/var\(--muxui-component-button-(?:background|foreground|radius)\b/gu, 'var(--x')), buttonRoles, 'the Button reads removed');
  assert.deepEqual(unreadComponentTokens(authored.replaceAll(/var\(--muxui-component-disclosuregroup-transition-[\w-]+\)/gu, 'var(--x)')),
    ['component.disclosuregroup.motion-duration', 'component.disclosuregroup.transition'], 'the transition part reads removed');
  assert.deepEqual(unreadComponentTokens(authored.replaceAll('var(--muxui-component-disclosuregroup-label-gap)', 'var(--x)')), ['component.disclosuregroup.label-gap'], 'the label-gap read removed');
  // A comment that names the properties restores nothing: the Button reads back to their fallbacks, plus the comment.
  const fallbacksOnly = authored.replaceAll(/var\(--muxui-component-button-(?:background|foreground|radius), (var\(--muxui-[\w-]+\))\)/gu, '$1');
  assert.notEqual(fallbacksOnly, authored, 'the Button reads exist to remove');
  assert.deepEqual(unreadComponentTokens(`${fallbacksOnly}\n/* var(--muxui-component-button-background) var(--muxui-component-button-foreground) var(--muxui-component-button-radius) */`), buttonRoles, 'the Button reads replaced by a comment');
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

// The styling contract inventory (CSS Stage 2). It proves the contract covers every catalog state and anatomy entry and that each
// row has the shape its disposition needs; styling-emission.test.mjs proves the class is emitted on the right element.
const catalog = await readCatalog(resolve(packageRoot, '../..'));
const { selected, isEstablished } = await establishedClasses(packageRoot, styles.map(({ css }) => css));
const contract = { partClass, publicSharedClasses, scopeClasses, elementQualifiers, noElementReasons, dispositions };
const rowKey = (row) => `${row.family}.${row.part}`;
const rowFailures = (rows = partRows) => partFailures(catalog.anatomy, rows, contract, { selected, isEstablished });

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
  assert.deepEqual(stateFailures(catalog.states, catalogStateKinds), []);
  assert.deepEqual(Object.entries(catalogStateKinds).filter(([, [kind]]) => kind === 'unresolved').map(([name]) => name), [], 'no state is left unresolved');
  const sources = (await Promise.all((await listSources(sourceRoot, ['.ts', '.mjs'])).map((file) => readFile(resolve(sourceRoot, file), 'utf8')))).join('\n');
  const statuses = Object.entries(catalogStateKinds).filter(([, [kind]]) => kind === 'status');
  assert.deepEqual(statuses.map(([name]) => name), ['loaded', 'fallback', 'error']);
  for (const [name, [, status]] of statuses) assert.ok(sources.includes(`'data-muxui-${status}'`), `${name} is written as data-muxui-${status}`);
});

test('the state classification refuses an unclassified name, a stale entry and a target outside the closed list', () => {
  assert.match(stateFailures(new Set([...catalog.states, 'glowing']), catalogStateKinds).join(), /unclassified state glowing/u);
  assert.match(stateFailures(new Set([...catalog.states].filter((name) => name !== 'wrap')), catalogStateKinds).join(), /stale classification wrap/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, hovered: ['state', 'hover'] }).join(), /hovered names hover/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, vertical: ['enum', 'orientation', 'sideways'] }).join(), /vertical names orientation=sideways/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, error: ['unresolved'] }).join(), /error is unresolved without a reason and a PR/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, error: ['status'] }).join(), /error is a status without the attribute it names/u);
});

test('every catalog anatomy entry has one part-map row with a disposition, and every documented hook is selected or hookOnly', () => {
  assert.deepEqual(rowFailures(), []);
  assert.equal(partRows.length, [...catalog.anatomy.values()].flat().length);
});

test('the lookups the Storybook and Figma readers use return the contract selector and throw on a part it does not hold', () => {
  assert.equal(partSelector('button', 'label'), '.muxui-button__label');
  assert.equal(partSelector('text-field', 'label'), '.muxui-text-field .muxui-field-label');
  assert.equal(partSelector('input', 'root'), '.muxui-input__root');
  assert.throws(() => partRow('button', 'nope'), /button\.nope/u);
  assert.throws(() => partRow('nope', 'root'), /nope\.root/u);
  assert.throws(() => partSelector('button', 'nope'), /button\.nope/u);
  const none = partRows.find((row) => row.disposition === 'none');
  assert.throws(() => partSelector(none.family, none.part), /renders no element/u);
});

test('the part map check refuses a missing row, a duplicate, an unknown key and a row that breaks its disposition', () => {
  const find = (key) => partRows.find((row) => `${row.family}.${row.part}` === key);
  const change = (key, changes) => rowFailures(partRows.map((row) => row === find(key) ? { ...row, ...changes } : row)).join('\n');
  const add = (row) => rowFailures([...partRows, row]).join('\n');
  assert.match(rowFailures(partRows.filter((row) => row !== find('activity.header'))).join('\n'), /activity\.header: not mapped/u);
  assert.match(add({ ...find('button.root') }), /button\.root: listed twice/u);
  assert.match(add({ ...find('button.root'), family: 'nope' }), /nope\.root: unknown family/u);
  assert.match(add({ ...find('button.root'), part: 'nope' }), /button\.nope: unknown part/u);
  assert.match(change('button.root', { disposition: 'maybe' }), /button\.root: unknown disposition maybe/u);
  // A mapping is not a hook because its key exists: the class must be selected by a rule or spelled in source.
  assert.equal(isEstablished('muxui-button__bogus'), false);
  assert.match(change('button.root', { hook: 'muxui-button__bogus', exception: 'x' }), /button\.root: muxui-button__bogus is not an established class/u);
  assert.match(change('activity.header', { hook: 'muxui-activity__headline' }), /activity\.header: muxui-activity__headline is not muxui-activity__header and the row records no exception/u);
  assert.match(change('activity.header', { exception: 'because' }), /activity\.header: exception on a row whose hook is muxui-activity__header/u);
  // none rows carry a reason from the closed set and name no element.
  assert.match(change('alert-dialog.root', { reason: undefined }), /alert-dialog\.root: none without a reason/u);
  assert.match(change('alert-dialog.root', { reason: 'because' }), /alert-dialog\.root: none without a reason/u);
  assert.match(change('alert-dialog.root', { hook: 'muxui-alert-dialog' }), /alert-dialog\.root: a none row names no element/u);
  assert.match(change('button.root', { reason: 'caller' }), /button\.root: only a none row has a reason/u);
  // A field row is one of the four shared classes, named for its part; a root-element row is the family root.
  assert.match(change('select.label', { hook: 'muxui-field-bogus' }), /select\.label: muxui-field-bogus is not one of the shared field classes/u);
  assert.match(change('select.label', { hook: 'muxui-field-input' }), /select\.label: muxui-field-input does not match the part/u);
  assert.match(change('tooltip.tooltip', { hook: 'muxui-tooltip__bogus' }), /tooltip\.tooltip: a root-element row's hook is the family root muxui-tooltip/u);
  assert.match(change('range-calendar.grid', { hook: 'muxui-range-calendar' }), /range-calendar\.grid: muxui-range-calendar is not a documented hook of another family/u);
  assert.match(change('meter.label', { hook: 'muxui-field-label' }), /meter\.label: muxui-field-label is documented elsewhere, so it is not internal/u);
  // A documented hook with no authored rule is hookOnly with a reason; a hookOnly hook a rule selects is stale.
  assert.ok(!selected.has('muxui-menu__list'));
  assert.match(change('menu.list', { hookOnly: undefined }), /menu\.list: no authored rule selects muxui-menu__list and the row is not hookOnly/u);
  assert.match(change('menu.list', { hookOnly: '' }), /menu\.list: hookOnly without a reason/u);
  assert.match(change('button.root', { hookOnly: 'x' }), /button\.root: hookOnly, but an authored rule now selects muxui-button/u);
  // A selector names the hook, the family root, one of the five scope classes and the recorded element predicates, and nothing else.
  assert.match(change('switch.description', { selector: '.muxui-switch-field .muxui-field-label' }), /switch\.description: selector \.muxui-switch-field \.muxui-field-label does not contain \.muxui-field-description/u);
  assert.match(change('switch.description', { selector: '.muxui-switch__label .muxui-field-description' }), /switch\.description: selector class muxui-switch__label is neither the hook, the family root nor a scope class/u);
  assert.match(change('date-picker.calendar', { selector: '.muxui-calendar .muxui-date-picker__popover' }), /date-picker\.calendar: the hook is not in the last compound/u);
  assert.match(change('card.button', { selector: 'span.muxui-card' }), /card\.button: selector tag span is not a recorded element predicate/u);
  assert.match(change('code-block.status', { selector: '.muxui-code-block__status[aria-live]' }), /code-block\.status: selector attribute \[aria-live\] is not a recorded element predicate/u);
  // The qualifiers and exceptions the plan decided are asserted, not only documented.
  assert.match(change('code-block.status', { selector: undefined }), /code-block\.status: a shared status class needs the \[role="status"\] qualifier/u);
  assert.match(change('prompt-composer.status', { selector: '.muxui-prompt-composer__status' }), /prompt-composer\.status: a shared status class needs the \[role="status"\] qualifier/u);
  assert.match(change('sidebar.nav-button', { selector: undefined }), /sidebar\.nav-button: a shared class on three elements needs the anchor qualifier/u);
  assert.match(change('card.button', { selector: undefined }), /card\.button: must be a root-element row with hook muxui-card and selector button\.muxui-card/u);
  assert.match(change('card.button', { disposition: 'class', hook: 'muxui-card--button', exception: 'x', selector: undefined }), /card\.button: must be a root-element row/u);
  for (const key of ['input.root', 'input.input', 'menu.root']) assert.match(change(key, { exception: undefined }), new RegExp(`${key.replace('.', '\\.')}: a root or control exception must be recorded`, 'u'));
});

// A documented hook no authored rule selects is `hookOnly`, which is a description of the hook and not an exemption from item 19's
// CSS proof: support/hook-only.css holds one consumer rule per such row, and test/browser/hook-only-reach.test.mjs shows each
// reaches the element with the shipped styles loaded. This is the static half: the rules and the rows are the same set, each rule
// is unlayered and only paints the probe colour, so it is a consumer's rule and nothing else.
const probeRule = /^outline-color: rgb\(1, 2, 3\);$/u;
function hookOnlyRuleFailures(css, rows) {
  const failures = [];
  const rules = topLevelConstructs(css).filter(({ kind }) => kind === 'block');
  const selectors = rules.map(({ prelude }) => prelude);
  for (const selector of selectors) if (selector.startsWith('@')) failures.push(`${selector} wraps a rule in an at-rule, so it is not a consumer's rule`);
  const expected = rows.filter((row) => row.hookOnly !== undefined).map(selectorOf);
  for (const selector of expected) if (!selectors.includes(selector)) failures.push(`${selector}: a hookOnly row without a fixture rule`);
  for (const selector of selectors) if (!expected.includes(selector) && !selector.startsWith('@')) failures.push(`${selector}: a fixture rule for a row that is not hookOnly`);
  if (new Set(selectors).size !== selectors.length) failures.push('a selector has two fixture rules');
  for (const body of css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/\{([^}]*)\}/gu)) if (!probeRule.test(body[1].trim())) failures.push(`rule body ${body[1].trim()} is not the probe colour`);
  return failures;
}

test('the hookOnly fixture stylesheet has one unlayered consumer rule for each hookOnly row and no other', async () => {
  const css = await readFile(new URL('./support/hook-only.css', import.meta.url), 'utf8');
  assert.deepEqual(hookOnlyRuleFailures(css, partRows), []);
  assert.equal(partRows.filter((row) => row.hookOnly !== undefined).length, 12);
  // Controls: a missing rule, an extra one, a layered one, a duplicate and a rule that paints something else each fail.
  const failures = (changed, rows = partRows) => hookOnlyRuleFailures(changed, rows).join('\n');
  assert.match(failures(css.replace('.muxui-menu__list { outline-color: rgb(1, 2, 3); }\n', '')), /\.muxui-menu__list: a hookOnly row without a fixture rule/u);
  assert.match(failures(`${css}.muxui-button { outline-color: rgb(1, 2, 3); }\n`), /\.muxui-button: a fixture rule for a row that is not hookOnly/u);
  assert.match(failures(`@layer muxui.components { ${css} }`), /wraps a rule in an at-rule/u);
  assert.match(failures(`${css}.muxui-menu__list { outline-color: rgb(1, 2, 3); }\n`), /a selector has two fixture rules/u);
  assert.match(failures(css.replace('.muxui-text { outline-color: rgb(1, 2, 3); }', '.muxui-text { color: red; }')), /rule body color: red; is not the probe colour/u);
  assert.match(failures(css, partRows.map((row) => rowKey(row) === 'menu.list' ? { ...row, hookOnly: undefined } : row)), /\.muxui-menu__list: a fixture rule for a row that is not hookOnly/u);
});

test('every family root is selected, hookOnly, or renders no element, and the rows say which', () => {
  const roots = partRows.filter(({ part }) => part === 'root');
  // Toast and Tooltip have no root part: the part named for the family is the root element (a root-element row).
  assert.deepEqual([...catalog.anatomy].filter(([, parts]) => !parts.includes('root')).map(([family]) => family), ['toast', 'tooltip']);
  assert.equal(roots.length, catalog.anatomy.size - 2, 'every other family has a root row');
  // A root that is not selected names why (Lightbox and Text emit the class and style only the parts or modifiers); one with no
  // element is a provider (AlertDialog.Root renders nothing).
  for (const row of roots) {
    if (row.disposition === 'none') assert.equal(row.reason, 'provider', `${row.family} root`);
    else assert.ok(selected.has(row.hook) || row.hookOnly, `${row.family} root ${row.hook} is selected or hookOnly`);
  }
  // Input and Menu roots differ from the class their control carries; the rows record why and no other family needs to.
  assert.deepEqual(roots.filter((row) => row.disposition === 'class' && row.hook !== `muxui-${row.family}`).map((row) => row.family), ['input', 'menu']);
});

test('the class naming function agrees with every BEM part class that exists, and the public shared classes are in use', () => {
  assert.equal(partClass('button', 'root'), 'muxui-button');
  assert.equal(partClass('text-editor', 'color-popup'), 'muxui-text-editor__color-popup');
  const hooks = new Map(partRows.map((row) => [`${row.family}.${row.part}`, row.hook]));
  for (const [family, list] of catalog.anatomy) {
    // A field row's hook is the shared muxui-field-* class; the family's own BEM alias beside it (muxui-select__label) stays internal.
    for (const part of list.filter((name) => name !== 'root' && selected.has(partClass(family, name)) && partRow(family, name).disposition !== 'field')) {
      assert.equal(hooks.get(`${family}.${part}`), partClass(family, part), `${family}.${part} is already the BEM class`);
    }
  }
  for (const name of publicSharedClasses) {
    assert.ok(selected.has(name) && partRows.some((row) => row.hook === name && row.disposition === 'field'), `${name} is styled and has field rows`);
  }
  // Every scope class is real: spelled in source, and no row names one as a part hook. muxui-switch-field is also the root of the
  // SwitchField family, which Switch renders as the wrapper around its label, description and error.
  for (const name of scopeClasses) {
    assert.ok(isEstablished(name), `${name} is established`);
    assert.deepEqual(partRows.filter((row) => row.hook === name).map((row) => `${row.family}.${row.part}`), name === 'muxui-switch-field' ? ['switch-field.root'] : [], `${name} is a scope, not a part`);
  }
});

// The class vocabulary is closed (Decision 0031 item 16): a class is muxui-<family>, muxui-<family>--<modifier>,
// muxui-<family>__<part> or muxui-<family>__<part>--<modifier>, or one of 13 shared helpers. The scan reads every selector and
// at-rule prelude of authored CSS and every muxui- token and every name-building site of React source; styling-emission.test.mjs
// applies the same grammar to the classes rendered fixtures carry, which is the half that sees a name built at run time.
const slugs = [...catalog.anatomy.keys()];
const cssFiles = Object.fromEntries(styles.map(({ path, css }) => [path.replace(/^src\//u, ''), css]));
const sourceFiles = Object.fromEntries(await Promise.all((await listSources(sourceRoot, ['.ts', '.mjs']))
  .filter((file) => file !== 'generate.mjs')
  .map(async (file) => [file, await readFile(resolve(sourceRoot, file), 'utf8')])));
const vocabulary = vocabularyFindings({ css: cssFiles, sources: sourceFiles, slugs });
const vocabularyWith = ({ css = {}, sources = {} }) => vocabularyFindings({
  css: { ...cssFiles, ...Object.fromEntries(Object.entries(css).map(([file, text]) => [file, `${cssFiles[file]}\n${text}\n`])) },
  sources: { ...sourceFiles, ...Object.fromEntries(Object.entries(sources).map(([file, text]) => [file, `${sourceFiles[file]}\n${text}\n`])) },
  slugs,
}).findings;

test('every Mux class in authored CSS and React source is in the closed vocabulary', () => {
  assert.deepEqual(vocabulary.findings, []);
  // The scan reads what it should: the authored sheets, the sources, and a vocabulary as large as the part map's.
  assert.ok(Object.keys(cssFiles).length >= 17 && Object.keys(sourceFiles).length > 100);
  for (const row of partRows) if (row.hook) assert.ok(vocabulary.spelled.has(row.hook), `${row.family}.${row.part}: ${row.hook} is spelled`);
});

test('the vocabulary guard refuses a dash-form class, a malformed name, a dynamic builder and a pinned token used as a class', () => {
  const fails = (changes, pattern) => assert.match(vocabularyWith(changes).join('\n'), pattern);
  // A name built at run time: the head muxui-separator- plus a variable is neither a class prefix nor pinned.
  fails({ sources: { 'components.ts': 'const probe = (orientation: string) => `muxui-separator-${orientation}`;' } }, /components\.ts: a name built from muxui-separator- is neither a class prefix nor pinned/u);
  // A non-class token (an id suffix) is pinned to its file and count, and is never a class in CSS.
  fails({ sources: { 'button.ts': "const again = 'muxui-button-label';" } }, /button\.ts: non-class token muxui-button-label appears 2 times, pinned 1/u);
  fails({ sources: { 'components.ts': "const stray = 'muxui-input-tags-label';" } }, /components\.ts: non-class token muxui-input-tags-label appears 1 times, pinned 0/u);
  fails({ css: { 'styles/base.css': '.muxui-button-label { color: red; }' } }, /css styles\/base\.css: muxui-button-label is not in the class vocabulary/u);
  // The whole name is checked: a modifier before a part, a part inside a part, a legacy dash form.
  fails({ sources: { 'components.ts': "const a = 'muxui-button--x__y';" } }, /components\.ts: muxui-button--x__y is not in the class vocabulary/u);
  fails({ sources: { 'components.ts': "const a = 'muxui-text__a__b';" } }, /components\.ts: muxui-text__a__b is not in the class vocabulary/u);
  fails({ sources: { 'components.ts': "const a = 'muxui-tab-label-new';" } }, /components\.ts: muxui-tab-label-new is not in the class vocabulary/u);
  fails({ sources: { 'components.ts': "const a = 'muxui-tabs-motion-edge';" } }, /components\.ts: muxui-tabs-motion-edge is not in the class vocabulary/u);
  // At-rule preludes count: a class in @scope is a class node, and a :not() argument is read.
  fails({ css: { 'styles/base.css': '@scope (.muxui-tab-list) { :scope { color: red; } }' } }, /css styles\/base\.css: muxui-tab-list is not in the class vocabulary/u);
  fails({ css: { 'styles/base.css': '.muxui-button:not(.muxui-button-content) { color: red; }' } }, /muxui-button-content is not in the class vocabulary/u);
  // Comments and strings are not classes.
  assert.deepEqual(cssClassNames("/* .muxui-tab-list */ [class*='muxui-tab-list'] { content: '.muxui-tab-list'; } .muxui-tabs__list {}"), ['muxui-tabs__list']);
  // The emitted-DOM check, which no source scan can replace: a rendered legacy class, and a class no CSS or source spells.
  const spelled = vocabulary.spelled;
  assert.deepEqual(emittedFindings(['muxui-tabs__list', 'muxui-button--md'], { spelled, slugs }), []);
  assert.match(emittedFindings(['muxui-separator-vertical'], { spelled, slugs }).join(), /emitted muxui-separator-vertical is not a valid class/u);
  assert.match(emittedFindings(['muxui-tabs__ghost'], { spelled, slugs }).join(), /emitted muxui-tabs__ghost is not spelled by CSS or source/u);
  assert.deepEqual(emittedFindings(['muxui-number-field-sizing-case'], { spelled, slugs, owned: new Set(['muxui-number-field-sizing-case']) }), []);
});

// Canonical examples are what consumers copy, so they rely on no internal hook: every Mux class an example spells is a documented
// hook of the part map, or one the example defines for itself (the number-field sizing example styles four names of its own).
const exampleFiles = [];
for await (const path of glob('catalog/{components,patterns}/*/examples/react/*.tsx', { cwd: resolve(packageRoot, '../..') })) exampleFiles.push(path);
const documentedHooks = new Set(partRows.filter((row) => ['class', 'root-element', 'field', 'composed'].includes(row.disposition)).map((row) => row.hook));
const isMuxClass = classGrammar(slugs);
/** The Mux classes an example spells that are neither documented hooks nor its own: the internal hooks it relies on. */
function internalHooksOf(text) {
  const spelled = new Set([...text.matchAll(/(?<![\w-])muxui-[a-z0-9]+(?:(?:__|--|-)[a-z0-9]+)*(?![\w-])/gu)]
    .filter((match) => text.slice(Math.max(0, match.index - 2), match.index) !== '--').map(([name]) => name));
  return [...spelled].filter((name) => !documentedHooks.has(name)
    && (isMuxClass(name) || !text.includes(`.${name}`)));
}

test('canonical examples rely on no internal hook', async () => {
  assert.ok(exampleFiles.length > 217, `the scan reaches the component and pattern examples (${exampleFiles.length})`);
  const offenders = [];
  for (const file of exampleFiles) {
    const internal = internalHooksOf(await readFile(resolve(packageRoot, '../..', file), 'utf8'));
    if (internal.length > 0) offenders.push(`${file}: ${internal.join(', ')}`);
  }
  assert.deepEqual(offenders, []);
  // The scan sees what it should: an internal class or modifier, a legacy dash class and an undefined Mux-prefixed name each count; a documented
  // hook, a custom property and a class the example styles for itself do not.
  assert.deepEqual(internalHooksOf('<i className="muxui-calendar__next" />'), ['muxui-calendar__next']);
  assert.deepEqual(internalHooksOf('<i className="muxui-tag" />'), ['muxui-tag']);
  assert.deepEqual(internalHooksOf('<i className="muxui-button muxui-button--sm" />'), ['muxui-button--sm']);
  assert.deepEqual(internalHooksOf('<i className="muxui-tabs__list muxui-button muxui-field-label" style={{ color: "var(--muxui-semantic-text)" }} />'), []);
  assert.deepEqual(internalHooksOf('<i className="muxui-sizing-case" /><style>{`.muxui-sizing-case { gap: 1rem }`}</style>'), []);
  assert.deepEqual(internalHooksOf('<i className="muxui-sizing-case" />'), ['muxui-sizing-case']);
});

test('the prefixes the guards key on are spelled by the sources, so none is vacuous', () => {
  const spelled = (prefix) => [...vocabulary.spelled].some((name) => name.startsWith(prefix));
  assert.ok(spelled(guardedPrefixes.codeBlockToken), `${guardedPrefixes.codeBlockToken} is spelled`);
  for (const family of guardedPrefixes.modeAwareFamilies) {
    assert.ok(catalog.anatomy.has(family), `${family} is a catalog family`);
    assert.ok(vocabulary.spelled.has(`muxui-${family}`), `${family} root is spelled`);
  }
  // The control: the spelling the rename left behind in three guards matches nothing, which is how they passed vacuously.
  assert.ok(!spelled('muxui-code-block-token-'));
  assert.ok(!spelled('muxui-tab-'));
});

test('the class-token check proves a root class and not a part class that contains its name', () => {
  assert.equal(hasClassToken('<ul class="muxui-tag-group__list">', 'muxui-tag-group'), false);
  assert.equal(hasClassToken('<div class="muxui-radio-group__field muxui-radio-group__radio--lg">', 'muxui-radio-group'), false);
  assert.equal(hasClassToken('<div data-x="class=\'muxui-tag-group\'" classes="muxui-tag-group">', 'muxui-tag-group'), false);
  assert.equal(hasClassToken('<div class="muxui-tag-group muxui-tag-group--md"><ul class="muxui-tag-group__list">', 'muxui-tag-group'), true);
  assert.deepEqual([...classTokens('<a class=" one  two"><b class="three">')], ['one', 'two', 'three']);
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

// The README's class paragraph is written in src/generate.mjs and says what the part map says: the same shared classes, the same five
// scope classes, the same wrapper exceptions and the same Card.Button selector, and every class it names exists.
test('the README class hooks section agrees with the part map', async () => {
  const readme = await readFile(resolve(packageRoot, 'README.md'), 'utf8');
  const section = /^## Class hooks\n([\s\S]*?)(?=^## )/mu.exec(readme)?.[1];
  assert.ok(section, 'the README has a Class hooks section');
  for (const name of publicSharedClasses) assert.ok(section.includes(`\`${name}\``), `${name} is named`);
  for (const name of scopeClasses) assert.ok(section.includes(name), `${name} is named`);
  for (const row of partRows.filter((candidate) => candidate.exception)) assert.ok(section.includes(`\`${row.hook}\``), `${row.family}.${row.part}: ${row.hook} is named, since the row records an exception`);
  assert.ok(section.includes(`\`${partRows.find((row) => row.family === 'card' && row.part === 'button').selector}\``), 'Card.Button is named with its selector');
  assert.ok(section.includes('`muxui-menu__root`') && section.includes('`muxui-input__root`'), 'both wrapper roots are named');
  assert.ok(partRows.filter((row) => row.selector && (row.disposition === 'field' || row.disposition === 'composed')).length === 6, 'six parts have another scope');
  assert.match(section, /Six parts have another scope/u);
  assert.match(section, /there is no alias/u);
  assert.match(section, /the server and client markup of one page must come from the same installed version/u);
  // Every class the section names is real: spelled by CSS or source, or the one dash form it gives as the old spelling.
  for (const [, name] of section.matchAll(/(?<![\w-])(muxui-[a-z0-9]+(?:(?:__|--|-)[a-z0-9]+)*)/gu)) {
    if (name === 'muxui-tab-list') continue;
    assert.ok(isEstablished(name), `${name} is a class`);
  }
  assert.ok(!section.includes('muxui-<family>--'), 'no claim the package does not make');
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
