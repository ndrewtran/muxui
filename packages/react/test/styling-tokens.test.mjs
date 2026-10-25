import assert from 'node:assert/strict';
import { glob, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { compilePureTokenGraph, cssDeclaration } from '@muxui/tokens/core';
import { catalogStateKinds, establishedClasses, partFailures, readCatalog, stateFailures } from './support/styling-inventory.mjs';
import {
  booleanStates, enumeratedStates, mappedParts, noElementParts, partClass, pendingParts, publicSharedClasses, sharedParts, stateAttribute,
} from './support/styling-contract.ts';

const packageRoot = resolve(import.meta.dirname, '..');
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
const parts = { mapped: mappedParts, shared: sharedParts, noElement: noElementParts, pending: pendingParts };

test('the closed state list is spelled once and every name is a substrate attribute the styles select today', () => {
  const names = [...booleanStates, ...Object.keys(enumeratedStates)];
  assert.equal(new Set(names).size, names.length);
  assert.ok(!names.includes('readonly'), 'the catalog spells read-only');
  const css = styles.map((style) => style.css).join('\n');
  // React Aria spells read-only without the hyphen; the contract uses the catalog's spelling.
  for (const name of names) assert.ok(css.includes(`[data-${name === 'read-only' ? 'readonly' : name}`), `${name} is selected by an authored style`);
  assert.equal(stateAttribute('read-only'), 'data-muxui-state-read-only');
  assert.equal(stateAttribute('orientation'), 'data-muxui-state-orientation');
});

test('every catalog state is classified by meaning and only unresolved ones are open work', () => {
  assert.deepEqual(stateFailures(catalog.states), []);
  const unresolved = Object.values(catalogStateKinds).filter(([kind]) => kind === 'unresolved');
  assert.ok(unresolved.length <= 9, 'the unresolved allowlist only shrinks');
});

test('the state classification refuses an unclassified name, a stale entry and a target outside the closed list', () => {
  assert.match(stateFailures(new Set([...catalog.states, 'glowing'])).join(), /unclassified state glowing/u);
  assert.match(stateFailures(new Set([...catalog.states].filter((name) => name !== 'wrap'))).join(), /stale classification wrap/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, hovered: ['state', 'hover'] }).join(), /hovered names hover/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, vertical: ['enum', 'orientation', 'sideways'] }).join(), /vertical names orientation=sideways/u);
  assert.match(stateFailures(catalog.states, { ...catalogStateKinds, error: ['unresolved'] }).join(), /error is unresolved without a reason and a PR/u);
});

test('every catalog anatomy entry is in the part map exactly once with an established class or a reason', () => {
  assert.deepEqual(partFailures(catalog.anatomy, parts, isEstablished), []);
  assert.equal(mappedParts.length + sharedParts.length + noElementParts.length + pendingParts.length, [...catalog.anatomy.values()].flat().length);
  // The pending list only shrinks; an entry leaves it with a decision, never by being called no-element.
  assert.ok(pendingParts.length <= 12);
});

test('the part map check refuses a bogus class, a duplicate, a missing entry and keys the catalog lacks', () => {
  const failures = (changes) => partFailures(catalog.anatomy, { ...parts, ...changes }, isEstablished).join('\n');
  const withValue = (rows, family, part, value) => rows.map((row) => row[0] === family && row[1] === part ? [family, part, value] : row);
  const without = (rows, family, part) => rows.filter((row) => row[0] !== family || row[1] !== part);
  // A mapping is not a hook because its key exists: the class must be selected by a rule or spelled in source.
  assert.equal(isEstablished('muxui-button__bogus'), false);
  assert.match(failures({ mapped: withValue(mappedParts, 'button', 'root', 'muxui-button__bogus') }), /button\.root: muxui-button__bogus is not an established class/u);
  assert.match(failures({ shared: withValue(sharedParts, 'autocomplete', 'label', 'muxui-field-bogus') }), /autocomplete\.label: muxui-field-bogus is not an established class/u);
  assert.match(failures({ pending: [...pendingParts, ['button', 'root', 'Both.']] }), /button\.root: listed as mapped and pending/u);
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
