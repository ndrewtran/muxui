// The generated recipe (CSS Stage 2 PR 4a): copyable CSS for each of the 84 families, and the static proof that it is valid. Every
// recipe is checked against facts it was not derived from (the README's own text, the family's Hooks and token rows, a jsdom parse of
// the Basic example), then two stylesheet mutants show the checks have teeth. That the changes work in a browser is the Chromium
// test's job (browser/styling-recipes.test.mjs); this file proves what is true for every family without one.
//
// What this file does not claim: the static cascade model cannot be complete against an arbitrary stylesheet, and the cases below that
// change the stylesheet (support/cascade-cases.mjs) are hypothetical future ones, checked for the one failure that matters, a step the
// browser would not bear out. The authority is the Chromium sweep in browser/styling-recipes.test.mjs, which applies every generated
// step to the real stylesheet in light and dark and fails when a step does not change its property or leaves its text under the WCAG rule for its
// size and weight (4.5:1 for normal text, 3:1 for large text and for a glyph).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { cssName } from '@muxui/tokens/core';
import { renderCatalogExamples } from './support/catalog-example-renders.mjs';
import { withMirror } from './support/repository-mirror.mjs';
import { cascadeCases, claimsStep } from './support/cascade-cases.mjs';
import { contrastRatio, luminance, over, parseHex } from './support/contrast.mjs';
import { conditionAtRest, matchAtRest, parseObservation, parseSelectorList, readStyleRules, readStylingFacts, recipePalette, relation, stylingFor, varReads } from './support/styling-reference.mjs';
import { booleanStates } from '../src/styling-contract.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const slugs = readdirSync(resolve(repositoryRoot, 'catalog/components'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

/** A compiled catalog record for the fields the reference reads: the raw record with the package's derived API. */
function readRecord(root, slug) {
  const raw = JSON.parse(readFileSync(resolve(root, `catalog/components/${slug}/artifact.json`), 'utf8'));
  const { api } = JSON.parse(readFileSync(resolve(root, `packages/react/api/${slug}.json`), 'utf8'));
  return { ...raw, bindings: { 'web.react': { ...raw.bindings['web.react'], api } } };
}

const facts = await readStylingFacts(repositoryRoot);
const renders = await renderCatalogExamples(slugs);
const observations = renders.map(({ family, source, html }) => ({ family, source, html }));
const examplesOf = (slug) => observations.filter(({ family }) => family === slug).map(({ source }) => ({ source: { content: source } }));
const stylingOf = (slug, overrides = {}) => stylingFor({ slug, artifact: readRecord(repositoryRoot, slug), examples: examplesOf(slug), facts, observations, ...overrides });
const all = new Map(slugs.map((slug) => [slug, stylingOf(slug)]));

// What the recipe must open with, read from the README by a pattern of its own and not through the module.
const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');
const [, layerStatement, stylesImport] = /^```css\n(@layer reset, [^\n]+;)\n(@import '@muxui\/react\/styles\.css';)\n/mu.exec(readme) ?? [];
assert.ok(layerStatement && stylesImport, 'the README still opens its cascade example with the layer statement and the styles import');

/** Shorthands whose computed value a step cannot compare. A step's property is a longhand. */
const shorthands = new Set(['background', 'border', 'border-color', 'border-radius', 'border-width', 'padding', 'padding-inline', 'padding-block', 'margin', 'gap', 'text-decoration', 'transition', 'font', 'flex', 'grid', 'outline', 'inset', 'overflow']);
const settable = new Set(['disabled', 'read-only', 'required', 'invalid', 'selected', 'expanded', 'open']);
const colors = ['#1e1b4b', '#ffffff', '#7e62c940', '#287f7240', '#a0672440', '#7e62c9', '#287f72', '#a06724'];

/**
 * What is wrong with one family's recipe, as one message per problem. Everything it compares against comes from outside the generator:
 * the README text above, the family's token and hook rows, and a jsdom parse of the Basic example.
 */
function recipeFailures({ slug, recipe, tokenRows, hookRows, html }) {
  const failures = [];
  const fail = (message) => failures.push(`${slug}: ${message}`);
  const lines = recipe.css.split('\n');
  if (lines[0] !== layerStatement) fail(`opens with ${lines[0]}, not the README's layer statement`);
  if (lines[1] !== stylesImport) fail(`its second line is ${lines[1]}, not the README's styles import`);
  if (recipe.scope !== 'my-scope' || !recipe.markup.includes('className="my-scope"')) fail('the wrapper is not my-scope');
  if (recipe.rules !== '' && !recipe.css.endsWith(recipe.rules)) fail('rules is not the end of css');
  let parsed;
  try {
    parsed = readStyleRules(recipe.css);
  } catch (error) {
    fail(`css does not parse: ${error.message}`);
    return failures;
  }
  if (parsed.rules.some(({ declarations }) => declarations.some(({ important }) => important))) fail('the recipe uses !important');
  for (const rule of parsed.rules) {
    if (rule.chain.length === 0) {
      if (rule.selector !== '.my-scope' || rule.declarations.some(({ property }) => !property.startsWith('--muxui-component-'))) fail(`an unlayered rule that is not the wrapper's component roles: ${rule.selector}`);
    } else if (rule.chain.join('|') !== '@layer muxui.utilities' || !rule.selector.startsWith('.my-scope ')) {
      fail(`${rule.selector} is not a wrapper-scoped rule in muxui.utilities`);
    }
  }
  const printed = new Set(parsed.rules.flatMap((rule) => rule.declarations.map(({ property, value }) => `${rule.selector}|${property}: ${value}`)));
  if (printed.size !== recipe.steps.length) fail(`${printed.size} printed declarations for ${recipe.steps.length} steps`);

  const document = new JSDOM(html).window.document;
  const roots = [...document.querySelectorAll(hookRows.find(({ part }) => part === hookRows.rootPart)?.hook ?? ':not(*)')];
  const inRoot = (element) => roots.some((root) => root === element || root.contains(element));
  const elementsOf = (selector) => [...document.querySelectorAll(selector)].filter(inRoot);
  const hookClasses = new Set(hookRows.class.flatMap(({ hook }) => (hook ?? '').match(/muxui-[\w-]+/gu) ?? []));
  const hookAttributes = new Set(hookRows.attribute);

  const count = (kind) => recipe.steps.filter((step) => step.kind === kind).length;
  if (count('token') > 3 || count('part') > 1 || count('state') > 1) fail(`${count('token')} token, ${count('part')} part and ${count('state')} state steps`);
  for (const step of recipe.steps) {
    const label = `${step.kind} step ${step.declaration}`;
    if (!printed.has(`${step.selector}|${step.declaration}`)) fail(`${label} is not printed in the css`);
    if (!step.target || !step.property) fail(`${label} has no target or property`);
    if (shorthands.has(step.property) || step.property.startsWith('--')) fail(`${label} compares ${step.property}, which is not a longhand`);
    if (/label-gap|motion-duration|transition/u.test(`${step.selector} ${step.declaration} ${step.target} ${step.property}`)) fail(`${label} is one of the roles and properties a recipe never uses`);
    if ((step.scope === 'unavailable') !== (step.reason !== undefined)) fail(`${label}: a reason goes with an unavailable step and only with one`);
    if (step.kind === 'token') {
      const [name, value] = step.declaration.split(': ');
      const row = tokenRows.find(({ cssVar }) => cssVar === name);
      if (!row) { fail(`${label} names no token of the family`); continue; }
      if (!row.token.startsWith('component.') || cssName(row.token) !== name) fail(`${label}: ${row.token} is not a component role named by cssName`);
      if (row.policy !== 'theme') fail(`${row.token} is ${row.policy} policy, so a wrapper cannot assign it`);
      if (row.readBy?.kind !== 'rules') fail(`${row.token} is not read by a Mux rule`);
      if (row.type === 'color' ? !colors.includes(value) : ![ '999px', `calc(${row.light} + 0.5rem)`].includes(value)) fail(`${label} assigns an unexpected value`);
      if (step.selector !== '.my-scope' || step.scope !== 'wrapper') fail(`${label} is not assigned on the wrapper`);
      const found = elementsOf(step.target);
      if (found.length === 0) fail(`${label}: ${step.target} matches nothing inside the root of the Basic example`);
      if (step.observedText !== found.some((element) => element.textContent.trim() !== '')) fail(`${label}: observedText disagrees with the example`);
    } else {
      const withoutScope = step.selector.slice('.my-scope '.length);
      for (const [, name] of withoutScope.matchAll(/\.(muxui-[\w-]+)/gu)) if (!hookClasses.has(name)) fail(`${label}: .${name} is not a row of the family's Hooks`);
      for (const [, name] of withoutScope.matchAll(/\[([\w-]+)\]/gu)) if (!hookAttributes.has(name)) fail(`${label}: [${name}] is not a state or reflected row of the family's Hooks`);
      const attribute = /\[([\w-]+)\]$/u.exec(step.target)?.[1];
      const base = attribute ? step.target.slice(0, -attribute.length - 2) : step.target;
      if (step.kind === 'state' && !attribute) fail(`${label} has no state attribute`);
      if (step.kind === 'state' && attribute && !booleanStates.includes(attribute.replace(/^data-muxui-state-/u, ''))) fail(`${label}: ${attribute} is not a boolean state`);
      if (step.kind === 'part' && attribute) fail(`${label} is a part step with an attribute`);
      if (step.kind === 'state' && step.scope === 'unavailable') {
        if (!settable.has(attribute.replace(/^data-muxui-state-/u, ''))) fail(`${label}: ${attribute} is not a state you can set by hand`);
        if (step.reason !== 'needs the state') fail(`${label} has the reason ${step.reason}`);
        if (elementsOf(step.target).length > 0) fail(`${label}: the example already shows ${attribute}, so it is not unavailable`);
      } else if (elementsOf(step.target).length === 0) {
        fail(`${label}: ${step.target} matches nothing inside the root of the Basic example`);
      }
      const found = elementsOf(base);
      if (found.length === 0) fail(`${label}: ${base} matches nothing inside the root of the Basic example`);
      const measured = step.scope === 'wrapper' ? elementsOf(step.target) : found;
      if (step.observedText !== measured.some((element) => element.textContent.trim() !== '')) fail(`${label}: observedText disagrees with the example`);
    }
  }
  return failures;
}

/** The rows `recipeFailures` compares against, taken from a family's styling. */
function rowsOf(styling) {
  const groups = styling.hooks.groups;
  const rootRows = groups.find(({ id }) => id === 'root')?.rows ?? [];
  const classRows = [...rootRows, ...(groups.find(({ id }) => id === 'part')?.rows ?? [])];
  return {
    tokenRows: styling.tokens.groups.flatMap(({ rows }) => rows),
    hookRows: Object.assign(classRows, {
      rootPart: rootRows[0]?.part,
      class: classRows,
      attribute: groups.filter(({ id }) => id === 'state' || id === 'reflected').flatMap(({ rows }) => rows.map(({ hook }) => hook)),
    }),
  };
}
const failuresOf = (slug, styling = all.get(slug), recipe = styling.recipe) => {
  const basic = examplesOf(slug)[0]?.source.content;
  return recipeFailures({ slug, recipe, ...rowsOf(styling), html: observations.find(({ source }) => source === basic)?.html ?? '' });
};

// The notes of a family that start with `start`, the Basic example it describes read by jsdom, and its documented class hooks.
const notesOf = (slug, start, styling = all.get(slug)) => styling.recipe.notes.filter((note) => note.startsWith(start));
const basicDocument = (slug) => new JSDOM(observations.find(({ family, source }) => family === slug && source.endsWith('/basic.tsx')).html).window.document;
/** The documented class hooks of a family's Hooks rows, in the order the rows print them. */
const documentedHooks = (slug) => all.get(slug).hooks.groups.flatMap(({ rows }) => rows).filter(({ kind, hook }) => kind === 'class' && hook !== null).map(({ hook }) => hook);

// ---------------------------------------------------------------------------------------------------------------------------
// All 84 families.
// ---------------------------------------------------------------------------------------------------------------------------

test('all 84 recipes are valid: the README\'s layer statement, wrapper-scoped rules, theme roles with a reader, real hooks and observed targets', () => {
  assert.equal(slugs.length, 84);
  const failures = slugs.flatMap((slug) => failuresOf(slug));
  assert.deepEqual(failures, []);
  // Each family has a Basic example to take targets from.
  for (const slug of slugs) assert.ok(examplesOf(slug).length > 0, `${slug} has an example render`);
});

test('the Mux layers the recipe relies on are as the README says: muxui.utilities is declared and empty in every shipped sheet', () => {
  for (const name of ['styles.css', 'supplemental.css', 'themes.css']) {
    const { rules } = readStyleRules(readFileSync(resolve(packageRoot, `generated/${name}`), 'utf8'));
    assert.deepEqual(rules.filter(({ chain }) => chain.some((prelude) => prelude === '@layer muxui.utilities')).map(({ selector }) => selector), [], `${name} has no rule in muxui.utilities`);
  }
  assert.match(readFileSync(resolve(packageRoot, 'generated/styles.css'), 'utf8'), /@layer muxui\.utilities[,;]|, muxui\.utilities[,;]/u);
});

test('the picks: which families get a token step and which of their roles, how many get none, and how the other steps fall', () => {
  const declarations = (slug, kind) => all.get(slug).recipe.steps.filter((step) => step.kind === kind).map(({ declaration }) => declaration);
  const tokens = Object.fromEntries(slugs.filter((slug) => declarations(slug, 'token').length > 0).map((slug) => [slug, declarations(slug, 'token')]));
  assert.deepEqual(tokens, {
    // The Basic example is a danger Button, which paints its own colors: only the radius reaches it.
    button: ['--muxui-component-button-radius: 999px'],
    // The checked box and its mark, found on the selected indicator the Basic example renders.
    // A color is chosen by the property its role paints, not by its position: a surface and the text drawn on it, when the recipe assigns
    // both, get a navy and white pair; a fill and the mark drawn on it, when neither holds text, get a violet and white pair that stands
    // apart from the page in light and dark; and every other color role is left out and says why (see the notes below): text on the
    // page (no fixed color reads on both pages), a surface under text (it lowers that text in one scheme), and a part drawn on something
    // the recipe does not set (Switch's thumb is on a track).
    checkbox: ['--muxui-component-checkbox-selected-background: #7e62c9', '--muxui-component-checkbox-selected-foreground: #ffffff'],
    'checkbox-field': ['--muxui-component-checkbox-selected-background: #7e62c9', '--muxui-component-checkbox-selected-foreground: #ffffff'],
    // The background is a surface under text, left out; the size is not a color.
    'disclosure-group': ['--muxui-component-disclosuregroup-icon-size: calc(1.5rem + 0.5rem)'],
    // Its Basic example is a primary Button holding an icon, which the background and foreground roles drive.
    'icon-button': ['--muxui-component-button-background: #7e62c9', '--muxui-component-button-foreground: #ffffff'],
    'tag-group': ['--muxui-component-taggroup-tag-background: #1e1b4b', '--muxui-component-taggroup-tag-foreground: #ffffff'],
  });
  // A family with roles and no token step says why, and the reason is the one that holds: Activity's only role is a transition, which is
  // never a step; for seven others no rule that reads a color or size role matches an element the Basic example renders (checked against
  // the example by jsdom in the notes test below); and for DataDiff, Switch, Tabs and TextField the roles are ones the recipe leaves out.
  const reachless = slugs.filter((slug) => all.get(slug).tokens.groups.some(({ id }) => id === 'component') && declarations(slug, 'token').length === 0);
  assert.deepEqual(reachless, ['activity', 'code-block', 'data-diff', 'date-picker', 'date-range-picker', 'drop-zone', 'header-nav', 'select-native', 'sidebar', 'switch', 'tabs', 'text-field']);
  const tokenNote = (slug) => all.get(slug).recipe.notes.find((note) => note.startsWith('No token step:'));
  const droppedNote = (slug) => all.get(slug).recipe.notes.find((note) => note.startsWith('No token step for '));
  assert.equal(tokenNote('activity'), 'No token step: Activity has no color or size role that a Mux rule reads.');
  const roles = (slug) => all.get(slug).tokens.groups.flatMap(({ id, rows }) => (id === 'component' ? rows : []));
  assert.deepEqual(roles('activity').map(({ type }) => type), ['transition']);
  const leftOut = ['data-diff', 'switch', 'tabs', 'text-field'];
  for (const slug of reachless.filter((candidate) => !['activity', ...leftOut].includes(candidate))) {
    assert.match(tokenNote(slug), /^No token step: no rule that reads [A-Za-z]+'s color or size roles matches an element its Basic example renders \(for example .+\), so a role assigned on a wrapper would change nothing there\.$/u, slug);
    assert.equal(droppedNote(slug), undefined, slug);
    assert.ok(roles(slug).some(({ type, policy }) => policy === 'theme' && ['color', 'dimension'].includes(type)), `${slug} has a color or size role to explain`);
  }
  for (const slug of leftOut) assert.equal(tokenNote(slug), undefined, `${slug}: the roles it has are left out, and the notes say that and nothing else`);
  // Each note names the roles it leaves out with the property and element they paint, and gives the reason for that kind of role.
  const onPage = 'it paints text on the page, and the recipe assigns fixed colors, none of which reads at 4.5:1 on both the light page and the dark page.';
  assert.equal(droppedNote('text-field'), `No token step for --muxui-component-textfield-label (color of :where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label): ${onPage}`);
  assert.equal(droppedNote('tabs'), `No token step for --muxui-component-tabs-panel-foreground (color of .muxui-tabs__panel): ${onPage}`);
  assert.equal(droppedNote('tag-group'), `No token step for --muxui-component-taggroup-label (color of .muxui-tag-group .muxui-field-label): ${onPage}`);
  // A surface under text: DataDiff's two rows, in one note, and DisclosureGroup's background beside the size step it keeps.
  const underText = 'the surface under text, and a fixed color for it lowers that text\'s contrast on the light page or the dark page; the generator cannot tell how much the text has to spare, so it assigns none.';
  assert.equal(droppedNote('data-diff'), `No token step for --muxui-component-datadiff-added-background (background-color of .muxui-data-diff__row[data-muxui-change='added']), --muxui-component-datadiff-removed-background (background-color of .muxui-data-diff__row[data-muxui-change='removed']): they paint ${underText}`);
  assert.equal(droppedNote('disclosure-group'), `No token step for --muxui-component-disclosuregroup-background (background-color of .muxui-disclosure-group > .muxui-disclosure): it paints ${underText}`);
  // A part that holds no text and is half of no pair: Switch's thumb, beside its label, which is text on the page. One note for each reason.
  assert.deepEqual(notesOf('switch', 'No token step for '), [
    `No token step for --muxui-component-switch-label (color of .muxui-switch__label): ${onPage}`,
    'No token step for --muxui-component-switch-selected-thumb (background-color of .muxui-switch[data-muxui-state-selected] .muxui-switch__indicator): it paints a part that holds no text, and the generator cannot tell what that part is drawn on (a track, a fill or the page), so it cannot choose a color that stands apart from it in both schemes.',
  ]);
  // A family that keeps another step still says which role it left out; the rest say nothing of the kind.
  assert.deepEqual(slugs.filter((slug) => droppedNote(slug) !== undefined), ['data-diff', 'disclosure-group', 'switch', 'tabs', 'tag-group', 'text-field']);
  for (const slug of Object.keys(tokens)) assert.equal(tokenNote(slug), undefined, `${slug} has a token step and no such note`);
  // Seven families have nothing to target in their Basic example (closed overlays and providers), and each says why in a note.
  const empty = slugs.filter((slug) => all.get(slug).recipe.steps.length === 0);
  assert.deepEqual(empty, ['alert-dialog', 'dialog', 'menu', 'popover', 'preview-trigger', 'toast', 'tooltip']);
  for (const slug of empty) assert.ok(all.get(slug).recipe.notes.length >= 2 && all.get(slug).recipe.rules === '', slug);
  // Steps by kind: 10 token steps in 6 families, a part step in 77, a state step in 54 of which 41 need the state.
  const steps = slugs.flatMap((slug) => all.get(slug).recipe.steps);
  assert.deepEqual(['token', 'part', 'state'].map((kind) => steps.filter((step) => step.kind === kind).length), [10, 77, 54]);
  assert.equal(steps.filter((step) => step.scope === 'unavailable').length, 41);
  assert.ok(steps.filter((step) => step.scope === 'unavailable').every((step) => step.kind === 'state'));
  assert.equal(steps.filter((step) => !step.observedText).length, 26, 'steps whose target holds no text are computed only');
});

test('a closed overlay\'s portal parts are never a target, and a provider with no element has no step', () => {
  const targets = (slug) => all.get(slug).recipe.steps.map(({ target }) => target);
  for (const slug of ['date-picker', 'date-range-picker']) {
    assert.deepEqual(all.get(slug).recipe.steps.filter(({ kind }) => kind === 'token'), [], `${slug}: its popover role is read by a rule on the portal, not inside the wrapper`);
    assert.ok(targets(slug).every((target) => !/popover|popup/u.test(target)), slug);
  }
  assert.deepEqual(all.get('alert-dialog').recipe.steps, []);
  assert.deepEqual(all.get('dialog').recipe.steps, []);
});

test('label-gap, motion-duration and transition are never a step, and DisclosureGroup says label-gap has no reader', () => {
  const recipes = slugs.map((slug) => JSON.stringify(all.get(slug).recipe));
  for (const name of ['label-gap', 'motion-duration', 'transition']) assert.ok(recipes.every((text) => !text.includes(name)), name);
  const labelGap = all.get('disclosure-group').tokens.groups.flatMap(({ rows }) => rows).find(({ token }) => token === 'component.disclosuregroup.label-gap');
  assert.equal(labelGap.readBy.kind, 'none');
  assert.match(labelGap.readBy.note, /^Declared\. No Mux CSS rule reads this role today\./u);
});

test('without a render there is nothing to target: no steps and one sentence saying so', () => {
  const bare = stylingOf('button', { observations: [], examples: [] });
  assert.deepEqual(bare.recipe.steps, []);
  assert.equal(bare.recipe.rules, '');
  assert.deepEqual(bare.recipe.notes, ['No steps: no example render was supplied, so the recipe cannot name an element the example shows.']);
  assert.equal(bare.recipe.css, `${layerStatement}\n${stylesImport}\n`);
});

test('the recipe targets the Basic example, which is the first one, and not another example that happens to show more', () => {
  // Button's disabled example shows a disabled Button; its Basic example does not, so the state step is unavailable.
  const state = all.get('button').recipe.steps.find(({ kind }) => kind === 'state');
  assert.deepEqual([state.scope, state.reason, state.target], ['unavailable', 'needs the state', '.muxui-button[data-muxui-state-disabled]']);
  assert.ok(observations.some(({ family, html }) => family === 'button' && html.includes('data-muxui-state-disabled')), 'another Button example does show it');
  // Putting that example first makes it the Basic one, and the step is then a state the example shows.
  const examples = examplesOf('button');
  const states = examples.find(({ source }) => source.content.endsWith('/states.tsx'));
  const reordered = stylingOf('button', { examples: [states, ...examples.filter((example) => example !== states)] }).recipe.steps.find(({ kind }) => kind === 'state');
  assert.deepEqual([reordered.scope, reordered.reason, reordered.target], ['wrapper', undefined, '.muxui-button[data-muxui-state-disabled]']);
});

// ---------------------------------------------------------------------------------------------------------------------------
// The cascade model: what a pseudo-class is at rest, and what an order or a condition decides.
// ---------------------------------------------------------------------------------------------------------------------------

test('a selector at rest is true, false or unknown: interaction pseudo-classes are false, and unknown stays unknown through :not(), :is(), :where() and :has()', () => {
  const element = parseObservation('<div class="x"></div>').elements[0];
  const at = (selector) => matchAtRest(parseSelectorList(selector)[0], element);
  for (const [selector, expected] of [
    ['.x', true], ['.y', false],
    ['.x:hover', false], ['.x:active', false], ['.x:focus', false], ['.x:focus-visible', false], ['.x:focus-within', false],
    ['.x:disabled', null], ['.x:first-child', null], ['.x:dir(rtl)', null],
    ['.x:not(:hover)', true], ['.x:not(:focus-visible)', true], ['.x:not(.y)', true], ['.x:not(.x)', false],
    ['.x:not(:disabled)', null], ['.x:not(.y, :disabled)', null], ['.x:not(.x, :disabled)', false], ['.x:not(:not(:disabled))', null],
    ['.x:is(:disabled, .x)', true], ['.x:is(:disabled, .y)', null], ['.x:is(.y, :hover)', false], ['.x:where(:disabled)', null], ['.x:where(.x)', true],
    ['.x:has(.y)', null], ['.x:not(:has(.y))', null], ['.x:is(:has(.y), .z)', null],
    [':where(.x):not([data-muxui-state-invalid])', true],
  ]) assert.equal(at(selector), expected, selector);
  assert.equal(matchAtRest(parseSelectorList(':where(.x):not([data-muxui-state-invalid])')[0], parseObservation('<div class="x" data-muxui-state-invalid=""></div>').elements[0]), false);
});

test('the cascade model follows the browser where an order, a condition, a fallback, a shadow or a shorthand decides: a claimed step is one that changes the target, and anything it cannot decide claims nothing', async () => {
  assert.ok(all.get('button').recipe.steps.some(({ declaration }) => declaration.startsWith('--muxui-component-button-radius:')), 'the real stylesheet claims it');
  const artifacts = new Map(['button', 'checkbox', 'text-field'].map((slug) => [slug, readRecord(repositoryRoot, slug)]));
  for (const one of cascadeCases) {
    const claimed = await claimsStep(one, { root: repositoryRoot, artifact: artifacts.get(one.family), observations });
    assert.equal(claimed, one.claims, one.name);
    // A claim the browser would not bear out is the one failure the model must not have; the Chromium test measures `changes`.
    assert.ok(!claimed || one.changes, `${one.name}: a claimed step changes the target`);
  }
});

test('relation: which declarations set a longhand for sure, which may, and which do not', () => {
  for (const [declared, target, expected] of [
    ['border-top-left-radius', 'border-top-left-radius', 'same'], ['border-radius', 'border-top-left-radius', 'covers'], ['border-radius', 'border-top-color', false],
    ['border-color', 'border-top-color', 'covers'], ['border', 'border-top-color', 'covers'], ['border-top', 'border-top-color', 'covers'], ['border-top', 'border-left-color', false],
    ['all', 'border-top-color', 'covers'], ['all', 'direction', false], ['all', '--muxui-x', false],
    // A logical shorthand sets a physical side in some writing mode: it is not known to, so it is not known not to.
    ['border-block-color', 'border-top-color', 'maybe'], ['border-inline-color', 'border-top-color', 'maybe'], ['border-block', 'border-top-width', 'maybe'],
    ['inset-inline', 'left', 'maybe'], ['margin-inline', 'margin-left', 'maybe'], ['padding-block', 'padding-top', 'maybe'], ['margin-block-start', 'margin-top', 'maybe'], ['margin-top', 'margin-block-start', 'maybe'],
    ['margin-top', 'margin-left', false], ['margin', 'margin-left', 'covers'], ['padding-inline', 'margin-left', false],
    ['background', 'background-color', 'covers'], ['background-color', 'background', false], ['outline', 'outline-offset', false], ['font', 'line-height', 'covers'], ['mask-border', 'color', 'maybe'],
    ['--muxui-x', 'color', false], ['color', 'border-top-color', false],
  ]) assert.equal(relation(declared, target), expected, `${declared} on ${target}`);
});

test('varReads: only the first var() of a fallback chain is read; a name that appears only in a fallback is not', () => {
  const reads = (value) => { const { primary, fallback } = varReads(value); return [[...primary], [...fallback]]; };
  assert.deepEqual(reads('var(--a)'), [['--a'], []]);
  assert.deepEqual(reads('var(--a, var(--b))'), [['--a'], ['--b']]);
  assert.deepEqual(reads('var(--a, var(--b, var(--c)))'), [['--a'], ['--b', '--c']]);
  assert.deepEqual(reads('calc(var(--a) + var(--b, 1px))'), [['--a', '--b'], []]);
  assert.deepEqual(reads('color-mix(in srgb, var(--a, red) 40%, transparent)'), [['--a'], []]);
  assert.deepEqual(reads('1px'), [[], []]);
});

test('conditionAtRest: the components layer anywhere in a rule\'s chain holds, and a condition the model cannot evaluate is unknown', () => {
  const components = '@layer muxui.components';
  for (const [chain, expected] of [
    [[components], true], [[], null], [['@layer muxui.tokens'], null],
    [['@media (forced-colors: none)', components], true], [[components, '@media (forced-colors: none)'], true],
    [['@media (forced-colors: active)', components], false], [[components, '@media (prefers-reduced-motion: reduce)'], false],
    [[components, '@media (min-width: 40rem)'], null], [[components, '@supports (display: grid)'], null], [[components, '@container (width > 10px)'], null],
    [[components, '@scope (.x)'], null], [[components, components], null],
  ]) assert.equal(conditionAtRest(chain), expected, chain.join(' > '));
});

test('a pseudo-qualified reader is decided on the Basic example: TextField\'s label role paints it at rest, and not once the example is invalid', () => {
  // The model finds the label role on the valid field (the generator then leaves it out, since it is text on the page: see the palette
  // test below), and finds nothing once the field is invalid.
  const left = 'No token step for --muxui-component-textfield-label (color of :where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label): it paints text on the page, and the recipe assigns fixed colors, none of which reads at 4.5:1 on both the light page and the dark page.';
  assert.deepEqual(all.get('text-field').recipe.steps.filter(({ kind }) => kind === 'token'), []);
  assert.deepEqual(notesOf('text-field', 'No token step'), [left]);
  const basic = observations.find(({ family, source }) => family === 'text-field' && source.endsWith('/basic.tsx'));
  const html = basic.html.replace('class="muxui-text-field"', 'class="muxui-text-field" data-muxui-state-invalid=""');
  assert.notEqual(html, basic.html);
  const invalid = stylingOf('text-field', { observations: observations.map((observation) => (observation === basic ? { ...observation, html } : observation)) });
  assert.deepEqual(notesOf('text-field', 'No token step', invalid), ['No token step: no rule that reads TextField\'s color or size roles matches an element its Basic example renders (for example :where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label), so a role assigned on a wrapper would change nothing there.']);
});

test('the palette against the theme\'s own page colors: pairs read with margin in light and dark, a fill stands apart from both pages, and no fixed color suits text on the page, a surface under text or a lone part', () => {
  const { core, light, dark } = facts.tokens;
  const page = (token, scheme) => parseHex(core.cssValue((scheme === 'light' ? light : dark).tokens[token]));
  const margin = 1.5;
  const { text: textPair, mark: markPair } = recipePalette.pairs;
  // Text on its surface: 4.5:1 with the margin, whatever the scheme.
  assert.ok(contrastRatio(parseHex(textPair.text), parseHex(textPair.surface)) >= 4.5 * margin);
  // A mark on its fill: 3:1 with room to spare (white on this violet is 4.69:1), and the fill stands apart from the light page and the dark
  // page at 3:1 too, since a fill that holds no text is what shows the control. That is a narrow window, and the margin does not fit in it.
  assert.ok(contrastRatio(parseHex(markPair.text), parseHex(markPair.surface)) >= 3 * margin);
  for (const scheme of ['light', 'dark']) assert.ok(contrastRatio(parseHex(markPair.surface), page('semantic.surface.canvas', scheme)) >= 3, `${scheme}: the fill on the page`);
  const lightL = luminance(page('semantic.surface.canvas', 'light')) + 0.05;
  const darkL = luminance(page('semantic.surface.canvas', 'dark')) + 0.05;
  const fillL = luminance(parseHex(markPair.surface));
  const window = [3 * darkL - 0.05, 1.05 / (3 * margin) - 0.05];
  assert.ok(fillL >= window[0] && fillL <= window[1], `the fill's luminance ${fillL.toFixed(3)} is in the window ${window.map((value) => value.toFixed(3)).join(' to ')}`);
  // The navy of the text pair is not in that window: it is 16:1 under white and 1.19:1 on the dark page, which is why a fill with no text
  // on it is not navy.
  assert.ok(contrastRatio(parseHex(textPair.surface), page('semantic.surface.canvas', 'dark')) < 1.2);
  // Text on the page needs 4.5:1 on the light canvas, which caps the color's luminance, and on the dark one, which floors it. The cap is under
  // the floor, so no fixed color satisfies both and the palette for such a role is empty. Contrast depends on luminance alone, so this is every
  // color, and a translucent one only blends toward the page.
  const cap = lightL / 4.5 - 0.05;
  const floor = 4.5 * darkL - 0.05;
  assert.ok(cap < floor, `a color at most ${cap.toFixed(3)} bright on the light page and at least ${floor.toFixed(3)} on the dark one does not exist`);
  assert.deepEqual(recipePalette.text, []);
  // The best a single color does on both pages is the geometric mean: below 4.5 on the pages the theme has, which is why TextField's label
  // read at 4.16:1 and 4.05:1 in the mid-tone it was given.
  assert.ok(Math.sqrt(lightL / darkL) < 4.5, `${Math.sqrt(lightL / darkL).toFixed(2)}:1 is the most one color reads at on both pages`);
  // A surface under the page's text: to leave that text as readable on both pages it would have to be at least as light as the light page
  // (dark text on it) and at most as light as the dark page (light text on it), and the light page is lighter than the dark one. Every
  // surface lowers the text on it in one scheme, so none is assigned unless the text can spare it, and the generator cannot tell.
  assert.ok(lightL > darkL);
  assert.deepEqual(recipePalette.surfaces, []);
  // A part drawn on something the recipe does not set has to stand apart from that, not from the page. Switch's thumb sits on a track that
  // is 3.6:1 under white on the dark scheme and 1.7:1 under the mid-tone that once stood for a part, so the palette has none.
  assert.deepEqual(recipePalette.parts, []);
});

test('a color role on an element that holds no text and is half of no pair is a part the generator cannot place: it is left out and says so', () => {
  // TextField's label with its text removed: the role still paints the label's color, but there is no text to read, so it is not text on
  // the page. It is a part, and the recipe cannot tell what it is drawn on.
  const basic = observations.find(({ family, source }) => family === 'text-field' && source.endsWith('/basic.tsx'));
  const html = basic.html.replace('>Name</label>', '></label>');
  assert.notEqual(html, basic.html);
  const empty = stylingOf('text-field', { observations: observations.map((observation) => (observation === basic ? { ...observation, html } : observation)) });
  assert.deepEqual(empty.recipe.steps.filter(({ kind }) => kind === 'token'), []);
  assert.deepEqual(notesOf('text-field', 'No token step', empty), ['No token step for --muxui-component-textfield-label (color of :where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label): it paints a part that holds no text, and the generator cannot tell what that part is drawn on (a track, a fill or the page), so it cannot choose a color that stands apart from it in both schemes.']);
});

test('a surface and its text are taken together or not at all: a second pair does not fill the third slot with half of it', async () => {
  // TagGroup's tag is a pair. Add a second pair on the cell inside the tag (amber selected background and foreground): the recipe
  // takes at most three colors, and a pair that does not fit whole is left out, so no surface is assigned without its text.
  const second = (text) => `${text}\n@layer muxui.components {\n  .muxui-tag-group__tag > div { background-color: var(--muxui-component-taggroup-amber-selected-background); color: var(--muxui-component-taggroup-amber-selected-foreground); }\n}\n`;
  await withMirror(repositoryRoot, { 'packages/react/generated/styles.css': second }, async (directory) => {
    const changed = stylingOf('tag-group', { facts: await readStylingFacts(directory) });
    assert.deepEqual(changed.recipe.steps.filter(({ kind }) => kind === 'token').map(({ declaration }) => declaration.split(':')[0]), ['--muxui-component-taggroup-tag-background', '--muxui-component-taggroup-tag-foreground']);
    assert.deepEqual(failuresOf('tag-group', changed), []);
  });
});

test('a textarea\'s value is the target\'s text: a part step on it is observed text, and an empty one is computed only', () => {
  const basic = observations.find(({ family, source }) => family === 'text-area' && source.endsWith('/basic.tsx'));
  const swapped = (html) => stylingOf('text-area', { observations: observations.map((observation) => (observation === basic ? { ...observation, html } : observation)) });
  const withoutLabel = basic.html.replace('>Notes</label>', '></label>').replace('<span class="muxui-text-area__description" id="react-aria-_R_0H3_" slot="description">Keep it concise.</span>', '');
  assert.notEqual(withoutLabel, basic.html);
  const part = (styling) => styling.recipe.steps.find(({ kind }) => kind === 'part');
  assert.deepEqual([part(swapped(withoutLabel)).target, part(swapped(withoutLabel)).observedText], ['.muxui-text-area', false], 'with no text anywhere the root is the target and holds none');
  const filled = withoutLabel.replace('></textarea>', '>Saved &amp; ready</textarea>');
  assert.deepEqual([part(swapped(filled)).target, part(swapped(filled)).observedText], ['.muxui-text-area__textarea', true], 'the value is text, so the textarea is the part with text');
});

// ---------------------------------------------------------------------------------------------------------------------------
// The notes: each says what the Basic example renders and why that is not a step, and agrees with the example read by jsdom.
// ---------------------------------------------------------------------------------------------------------------------------

const scopedRule = 'A part rule is scoped to a wrapper around the component, so its target has to be inside the component\'s root to be reached.';

test('a missing part step says what the Basic example renders: nothing, or a hook the generator cannot show inside the root', () => {
  // The generator rejects a candidate for want of the root as an ancestor; it does not say the example lacks the element.
  assert.deepEqual(notesOf('menu', 'No part step'), [`No part step: the Basic example renders .muxui-menu__item, but Menu's root renders no element in that example, so the generator cannot show that it is inside the root. ${scopedRule}`]);
  assert.deepEqual(notesOf('alert-dialog', 'No part step'), [`No part step: the Basic example renders .muxui-alert-dialog__trigger, but AlertDialog's root renders no element (a provider), so the generator cannot show that it is inside the root. ${scopedRule}`]);
  assert.deepEqual(notesOf('dialog', 'No part step'), ['No part step: the Basic example renders no element of Dialog\'s documented hooks.']);
  // Against the example as jsdom reads it, for every family without a part step, and against the Rendered DOM block the page prints.
  const without = slugs.filter((slug) => notesOf(slug, 'No part step').length > 0);
  assert.deepEqual(without, ['alert-dialog', 'dialog', 'menu', 'popover', 'preview-trigger', 'toast', 'tooltip']);
  for (const slug of without) {
    const document = basicDocument(slug);
    const rendered = documentedHooks(slug).filter((hook) => document.querySelector(hook) !== null);
    const [note] = notesOf(slug, 'No part step');
    const dom = all.get(slug).hooks.renderedDom?.text ?? '';
    if (rendered.length === 0) {
      assert.match(note, /^No part step: the Basic example renders no element of [A-Za-z]+'s documented hooks\.$/u, slug);
    } else {
      assert.ok(note.startsWith(`No part step: the Basic example renders ${rendered.join(', ')}, but `), `${slug}: ${note}`);
      for (const hook of rendered) assert.match(dom, new RegExp(`class="([^"]* )?${hook.slice(1)}( [^"]*)?"`, 'u'), `${slug}: the Rendered DOM shows ${hook}`);
    }
  }
});

test('a missing state step names the reason that holds: no boolean state, none the example shows or you set by hand, no hook to put it on, or a hook it does not render or cannot show inside the root', () => {
  const note = (slug) => notesOf(slug, 'No state step')[0];
  const noRule = (list, verb) => `No state step: ${list} ${verb} declared, but no Mux rule selects`;
  assert.equal(note('avatar'), 'No state step: none of Avatar\'s declared states (loading, loaded, fallback, error, sm, md, lg) is a boolean data-muxui-state-* attribute, which a state step needs.');
  assert.equal(note('activity'), 'No state step: Activity\'s Basic example shows none of its boolean states (focused) on a documented hook inside its root, and none is one a recipe sets by hand (disabled, read-only, required, invalid, selected, expanded, open).');
  assert.equal(note('alert-dialog'), 'No state step: open, disabled are declared, but no Mux rule selects them on a hook of AlertDialog, so the recipe has no hook to put them on.');
  assert.equal(note('virtualizer'), 'No state step: disabled is declared and selected on .muxui-virtualizer__item, but the Basic example does not render that hook.');
  assert.equal(note('menu'), 'No state step: disabled is declared and selected on .muxui-menu__item. The Basic example renders .muxui-menu__item, but Menu\'s root renders no element in that example, so the generator cannot show that it is inside the root.');
  assert.ok(note('dialog').startsWith(noRule('open', 'is')));
  // Every state a note names is one the catalog declares and a hook can carry as a boolean attribute, and a hook it says the example
  // renders (or does not) is one jsdom finds (or does not) in the Basic example. The old sentence, "declares no state", is gone.
  const without = slugs.filter((slug) => notesOf(slug, 'No state step').length > 0);
  assert.equal(without.length, 30);
  for (const slug of without) {
    const text = note(slug);
    assert.ok(!/declares no state/u.test(text), slug);
    const declared = readRecord(repositoryRoot, slug).states;
    const booleans = declared.filter((name) => booleanStates.includes(name));
    if (text.startsWith('No state step: none of ')) {
      assert.deepEqual(booleans, [], `${slug}: no declared state is a boolean attribute`);
      assert.ok(declared.every((name) => text.includes(name)), slug);
      continue;
    }
    assert.ok(booleans.length > 0, `${slug} declares a boolean state`);
    const document = basicDocument(slug);
    const rendered = [...new Set(text.match(/\.muxui-[\w-]+/gu) ?? [])].filter((hook) => document.querySelector(hook) !== null);
    if (text.includes('. The Basic example renders ')) assert.ok(text.includes(`The Basic example renders ${rendered.join(', ')}, but `), `${slug}: ${text}`);
    else if (text.includes('but the Basic example does not render')) assert.deepEqual(rendered, [], `${slug}: ${text}`);
  }
});

test('a hook the example renders outside the root element is outside it, not unprovable', () => {
  // Menu's Basic example renders no root element. Put one beside the items: the root now exists and the items are not in it.
  const basic = observations.find(({ family, source }) => family === 'menu' && source.endsWith('/basic.tsx'));
  const beside = observations.map((observation) => (observation === basic ? { ...observation, html: `<div class="muxui-menu__root"></div>${basic.html}` } : observation));
  const styling = stylingOf('menu', { observations: beside });
  assert.deepEqual(notesOf('menu', 'No state step', styling), ['No state step: disabled is declared and selected on .muxui-menu__item. The Basic example renders .muxui-menu__item, but it is outside Menu\'s root element.']);
});

test('a missing token step says what the rules that read the roles do on the Basic example: they match nothing it renders, or they match and cannot be shown to win', async () => {
  // jsdom reads the example: no selector of a rule that reads a color or size role matches an element of it.
  for (const slug of ['code-block', 'date-picker', 'date-range-picker', 'drop-zone', 'header-nav', 'select-native', 'sidebar']) {
    const document = basicDocument(slug);
    const readers = all.get(slug).tokens.groups.flatMap(({ rows }) => rows).filter(({ group, policy, type, readBy }) => group === 'component' && policy === 'theme' && ['color', 'dimension'].includes(type) && readBy.kind === 'rules').flatMap(({ readBy }) => readBy.selectors.map(({ selector }) => selector));
    assert.ok(readers.length > 0, slug);
    for (const selector of readers) assert.equal(document.querySelector(selector), null, `${slug}: ${selector} matches nothing in the Basic example`);
    assert.ok(notesOf(slug, 'No token step')[0].includes(`(for example ${readers[0]})`), slug);
  }
  // The other reason: DropZone with the state its reader needs matches, and a rule that wins over the role there leaves no step.
  const dropZone = observations.find(({ family, source }) => family === 'drop-zone' && source.endsWith('/basic.tsx'));
  const shown = observations.map((observation) => (observation === dropZone ? { ...observation, html: dropZone.html.replace('class="muxui-drop-zone"', 'class="muxui-drop-zone" data-muxui-state-drop-target=""') } : observation));
  assert.notEqual(shown, observations);
  assert.deepEqual(all.get('drop-zone').recipe.steps.filter(({ kind }) => kind === 'token'), []);
  // The role is then found, and left out as a surface under text: a note that names it, not a missing-step note.
  const found = stylingOf('drop-zone', { observations: shown });
  assert.deepEqual(found.recipe.steps.filter(({ kind }) => kind === 'token'), []);
  const [note, ...more] = notesOf('drop-zone', 'No token step', found);
  assert.deepEqual(more, []);
  assert.match(note, /^No token step for --muxui-component-dropzone-drop-target-background \(background-color of \.muxui-drop-zone\[data-muxui-state-drop-target\]\): it paints the surface under text, and/u);
  const wins = (text) => `${text}\n@layer muxui.components {\n  .muxui-drop-zone[data-muxui-state-drop-target] { background-color: rgb(1, 2, 3) !important; }\n}\n`;
  await withMirror(repositoryRoot, { 'packages/react/generated/styles.css': wins }, async (directory) => {
    const changed = stylingOf('drop-zone', { facts: await readStylingFacts(directory), observations: shown });
    assert.deepEqual(changed.recipe.steps.filter(({ kind }) => kind === 'token'), []);
    assert.deepEqual(notesOf('drop-zone', 'No token step', changed), ['No token step: rules that read DropZone\'s color or size roles match elements its Basic example renders, but the generator cannot show that a role is what paints any of them (another rule may win, or a state it cannot decide may apply).']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Controls: the checks have teeth.
// ---------------------------------------------------------------------------------------------------------------------------

test('control: a stylesheet that stops reading a role fails that family\'s check, and the regenerated recipe drops the role', async () => {
  const stripped = (text) => text.replaceAll('var(--muxui-component-button-radius', 'var(--muxui-gone-button-radius');
  await withMirror(repositoryRoot, { 'packages/react/generated/styles.css': stripped }, async (directory) => {
    const mirrored = await readStylingFacts(directory);
    const changed = stylingOf('button', { facts: mirrored });
    const radius = changed.tokens.groups.flatMap(({ rows }) => rows).find(({ token }) => token === 'component.button.radius');
    assert.equal(radius.readBy.kind, 'none', 'the changed stylesheet has no reader for the role');
    // The recipe written before the change is no longer valid against the rows after it.
    const stale = failuresOf('button', changed, all.get('button').recipe);
    assert.deepEqual(stale.filter((message) => /component\.button\.radius/u.test(message)), ['button: component.button.radius is not read by a Mux rule']);
    // And the generator does not keep claiming it: the regenerated recipe is valid and takes the next size role instead.
    assert.deepEqual(failuresOf('button', changed), []);
    assert.deepEqual(changed.recipe.steps.filter(({ kind }) => kind === 'token').map(({ declaration }) => declaration), ['--muxui-component-button-min-height: calc(2.25rem + 0.5rem)']);
  });
});

test('a role is a step only where its rule wins: the danger Button of the Basic example ignores the roles the primary IconButton follows', () => {
  const rows = (slug) => all.get(slug).tokens.groups.flatMap(({ rows: list }) => list);
  const background = (slug) => rows(slug).find(({ token }) => token === 'component.button.background');
  // Both families list the role, and a Mux rule reads it for both.
  assert.equal(background('button').readBy.kind, 'rules');
  assert.equal(background('icon-button').readBy.kind, 'rules');
  const declared = (slug) => all.get(slug).recipe.steps.filter(({ kind }) => kind === 'token').map(({ declaration }) => declaration.split(':')[0]);
  assert.deepEqual(declared('button'), ['--muxui-component-button-radius']);
  assert.deepEqual(declared('icon-button'), ['--muxui-component-button-background', '--muxui-component-button-foreground']);
  // The reason is in the stylesheet, not the generator: the danger variant sets the custom property the role feeds.
  const { rules } = readStyleRules(readFileSync(resolve(packageRoot, 'generated/styles.css'), 'utf8'));
  const danger = rules.find(({ selector, chain }) => selector === ".muxui-button[data-muxui-variant='danger']" && chain.length === 1 && chain[0] === '@layer muxui.components');
  assert.match(danger.declarations.find(({ property }) => property === '--muxui-button-background').value, /^var\(--muxui-semantic-action-danger-background/u);
  // A Basic example whose Button is primary would get the colors back: the same record with the example swapped.
  const primary = stylingOf('button', { observations: observations.map((observation) => (observation.family === 'button' && observation.source.endsWith('/basic.tsx')
    ? { ...observation, html: observation.html.replace('data-muxui-variant="danger"', 'data-muxui-variant="primary"') } : observation)) });
  assert.deepEqual(primary.recipe.steps.filter(({ kind }) => kind === 'token').map(({ declaration }) => declaration.split(':')[0]), ['--muxui-component-button-background', '--muxui-component-button-foreground', '--muxui-component-button-radius']);
});

test('control: a stylesheet that adds a label-gap reader flips its Tokens row from none to rules, and the role is still not a step', async () => {
  // Icon-size is the first size role DisclosureGroup would pick, so the changed stylesheet stops reading it: the size slot is then free
  // for label-gap, which a rule on the root now reads, unless the role is excluded by name.
  const reads = (text) => `${text.replaceAll('var(--muxui-component-disclosuregroup-icon-size', 'var(--muxui-gone-icon-size')}\n@layer muxui.components {\n  .muxui-disclosure-group { row-gap: var(--muxui-component-disclosuregroup-label-gap); }\n}\n`;
  await withMirror(repositoryRoot, { 'packages/react/generated/styles.css': reads }, async (directory) => {
    const mirrored = await readStylingFacts(directory);
    const changed = stylingOf('disclosure-group', { facts: mirrored });
    const labelGap = (styling) => styling.tokens.groups.flatMap(({ rows }) => rows).find(({ token }) => token === 'component.disclosuregroup.label-gap').readBy;
    assert.deepEqual([labelGap(all.get('disclosure-group')).kind, labelGap(changed).kind], ['none', 'rules']);
    assert.match(labelGap(changed).note, /^Read by \.muxui-disclosure-group/u);
    // The background is a surface under text and is left out, so no token step is left: a size step for label-gap would be the only one.
    assert.deepEqual(changed.recipe.steps.filter(({ kind }) => kind === 'token'), []);
    assert.ok(!JSON.stringify(changed.recipe).includes('label-gap'));
  });
});

test('control: a rule that comes later but is less specific does not win, so a role is still not a step where a variant sets its own color', async () => {
  // Appended after every Button rule, so it wins on order alone; the danger variant's rule beats it on specificity.
  const later = (text) => `${text}\n@layer muxui.components {\n  .muxui-button { --muxui-button-background: var(--muxui-component-button-background); }\n}\n`;
  await withMirror(repositoryRoot, { 'packages/react/generated/styles.css': later }, async (directory) => {
    const changed = stylingOf('button', { facts: await readStylingFacts(directory) });
    assert.deepEqual(changed.recipe.steps.filter(({ kind }) => kind === 'token').map(({ declaration }) => declaration.split(':')[0]), ['--muxui-component-button-radius']);
  });
});
