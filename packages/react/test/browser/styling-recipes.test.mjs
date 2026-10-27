import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button } from '../../generated/index.mjs';
import { renderCatalogExamples } from '../support/catalog-example-renders.mjs';
import { cascadeCases, claimsStep } from '../support/cascade-cases.mjs';
import { readStylingFacts, stylingFor } from '../support/styling-reference.mjs';
import { launchBrowser, packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';

// The generated recipe, run in Chromium: the authority for the recipe. The static cascade model that picks the steps cannot be
// complete against an arbitrary stylesheet, so this file is what holds it to the stylesheet that ships: the sweep at the end applies
// every step the generator makes, for all 84 families, to the real stylesheet in light and dark, and fails when a step does not change
// its property or when a step that paints text or its surface leaves it under 3:1. A real stylesheet change that breaks a step is
// caught here (this file runs in the `browser-chromium-only` group the planner selects for the module); the cascade cases below are
// hypothetical stylesheets that show the model never claims a step the browser would not bear out.
//
// The static test (test/styling-recipes.test.mjs) proves every recipe is valid for all 84
// families; this proves that the changes work in a browser, for 18 families chosen by what could go wrong: a role reached from the
// wrapper, a field or collection scoped through a shared hook, a role read through a state, a change or a pseudo-class, a popup that
// portals out of the wrapper, a root that renders no element, motion, and elements with no text. Each family has one explicit fixture
// below, and the test asserts the recipe the
// generator makes equals it, so a generator change fails here by name instead of passing by accident.
//
// For each family the page holds the Basic example's server render twice: once bare, once inside `<div class="my-scope">` under the
// recipe's rules. Each step's target is read in both, in light and in dark, after transitions settle, and must differ. A token's
// value must also be the one the recipe assigned. The examples are server markup, not hydrated: computed style needs no script.
const facts = await readStylingFacts(repositoryRoot);
const stylesheet = await readFile(resolve(packageRoot, 'generated/styles.css'), 'utf8');
const readRecord = async (slug) => {
  const raw = JSON.parse(await readFile(resolve(repositoryRoot, `catalog/components/${slug}/artifact.json`), 'utf8'));
  const { api } = JSON.parse(await readFile(resolve(packageRoot, `api/${slug}.json`), 'utf8'));
  return { ...raw, bindings: { 'web.react': { ...raw.bindings['web.react'], api } } };
};

// [kind, declaration, target, property, scope]. A token step is assigned on the wrapper; the others are rules in muxui.utilities.
const fixtures = [
  ['Component roles reachable from the wrapper', [
    // Button's Basic example is a danger Button, which paints its own colors: only the radius reaches it. The primary Button the
    // control below uses is the one the background and foreground roles reach.
    { slug: 'button', steps: [
      ['token', '--muxui-component-button-radius: 999px', '.muxui-button', 'border-top-left-radius', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-button__label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-button[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    { slug: 'icon-button', steps: [
      ['token', '--muxui-component-button-background: #1e1b4b', ".muxui-button[data-muxui-variant='primary']", 'background-color', 'wrapper'],
      ['token', '--muxui-component-button-foreground: #ffffff', ".muxui-button[data-muxui-variant='primary']", 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-icon-button', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-icon-button[data-muxui-state-disabled]', 'text-decoration-line', 'wrapper'],
    ] },
    { slug: 'checkbox', steps: [
      ['token', '--muxui-component-checkbox-selected-background: #1e1b4b', '.muxui-checkbox__indicator[data-muxui-state-selected]', 'border-top-color', 'wrapper'],
      ['token', '--muxui-component-checkbox-selected-foreground: #ffffff', '.muxui-checkbox__indicator svg', 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-checkbox__label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-checkbox[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
    { slug: 'switch', steps: [
      ['token', '--muxui-component-switch-label: #7e62c9', '.muxui-switch__label', 'color', 'wrapper'],
      ['token', '--muxui-component-switch-selected-thumb: #287f72', '.muxui-switch[data-muxui-state-selected] .muxui-switch__indicator', 'background-color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-switch__label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-switch[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
    { slug: 'tabs', steps: [
      ['token', '--muxui-component-tabs-panel-foreground: #7e62c9', '.muxui-tabs__panel', 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-tabs__list', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-tabs__tab[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
  ]],
  ['Collections and shared fields', [
    { slug: 'tag-group', steps: [
      ['token', '--muxui-component-taggroup-label: #7e62c9', '.muxui-tag-group .muxui-field-label', 'color', 'wrapper'],
      ['token', '--muxui-component-taggroup-tag-background: #1e1b4b', '.muxui-tag-group__tag', 'background-color', 'wrapper'],
      ['token', '--muxui-component-taggroup-tag-foreground: #ffffff', '.muxui-tag-group__tag', 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-tag-group .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-tag-group__tag[data-muxui-state-selected]', 'text-decoration-line', 'unavailable'],
    ] },
    { slug: 'list-box', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-list-box__item', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-list-box__item[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    { slug: 'select', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-select .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-select__value[data-muxui-state-placeholder]', 'text-decoration-line', 'wrapper'],
    ] },
  ]],
  ['Roles read through a pseudo-class, a state or a change', [
    // The label role is read by `:where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label`: the Basic example is not invalid.
    { slug: 'text-field', steps: [
      ['token', '--muxui-component-textfield-label: #7e62c9', ':where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label', 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-text-field .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-text-field[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    { slug: 'data-diff', steps: [
      ['token', '--muxui-component-datadiff-added-background: #7e62c9', ".muxui-data-diff__row[data-muxui-change='added']", 'background-color', 'wrapper'],
      ['token', '--muxui-component-datadiff-removed-background: #287f72', ".muxui-data-diff__row[data-muxui-change='removed']", 'background-color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-data-diff__header', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-data-diff__row[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
  ]],
  ['Portals and overlays', [
    // Their popup roles are read by a rule on the portal, so there is no token step; the parts are the closed picker's own.
    { slug: 'date-picker', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-date-picker .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-date-picker[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    { slug: 'date-range-picker', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-date-range-picker .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-date-range-picker[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    // A closed dialog renders only its trigger's markup, none of it Dialog's own, so there is nothing to target.
    { slug: 'dialog', steps: [] },
  ]],
  ['A root that renders no element', [
    { slug: 'alert-dialog', steps: [] },
  ]],
  ['Motion', [
    { slug: 'disclosure-group', steps: [
      ['token', '--muxui-component-disclosuregroup-background: #7e62c9', '.muxui-disclosure-group > .muxui-disclosure', 'background-color', 'wrapper'],
      ['token', '--muxui-component-disclosuregroup-icon-size: calc(1.5rem + 0.5rem)', '.muxui-disclosure-group > .muxui-disclosure > .muxui-disclosure__header > .muxui-disclosure__trigger > .muxui-disclosure__trigger-icon', 'width', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-disclosure', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-disclosure[data-muxui-state-expanded]', 'text-decoration-line', 'wrapper'],
    ] },
    { slug: 'activity', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-activity__header', 'letter-spacing', 'wrapper'],
    ] },
  ]],
  ['Textless and root-only', [
    { slug: 'separator', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-separator', 'letter-spacing', 'wrapper'],
    ] },
    { slug: 'text', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-text', 'letter-spacing', 'wrapper'],
    ] },
  ]],
];
const families = fixtures.flatMap(([, list]) => list);

// One browser serves every test in the file; each test opens its own page.
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
assert.equal(families.length, 18);

const renders = await renderCatalogExamples(families.map(({ slug }) => slug));
const observations = renders.map(({ family, source, html }) => ({ family, source, html }));
const recipeOf = async (slug) => {
  const examples = observations.filter(({ family }) => family === slug).map(({ source }) => ({ source: { content: source } }));
  return stylingFor({ slug, artifact: await readRecord(slug), examples, facts, observations }).recipe;
};
const basicHtml = (slug) => observations.find(({ family }) => family === slug).html;

/** The document: the layer statement, the stylesheet, the recipe's rules, and the Basic example bare and inside the wrapper. */
const documentOf = ({ html, rules, css = stylesheet, scheme, wrapperStyle = '' }) => `<!doctype html><html data-muxui-color-scheme="${scheme}"><head><meta charset="utf-8">`
  + `<style>@layer reset, muxui.tokens, muxui.components, muxui.utilities, app;</style><style>${css}</style><style>${rules}</style>`
  // The page is a themed one: its canvas and text are the scheme's, as a docs page's are.
  + '<style>body { margin: 0; background: var(--muxui-semantic-surface-canvas); color: var(--muxui-semantic-content-default); }</style></head>'
  + `<body><div id="bare">${html}</div><div id="scoped" class="my-scope"${wrapperStyle ? ` style="${wrapperStyle}"` : ''}>${html}</div></body></html>`;

/**
 * Reads each step's property on its target, bare and scoped, once transitions have settled. A step the Basic example already shows is
 * read first. A state step marked unavailable is then shown the state by hand (its attribute is added to the hook's element in both
 * panes) and read: reading it first would change what the other steps are reading, since a selected tag paints another background.
 */
async function measure(page, { html, rules, steps, scheme, css, wrapperStyle }) {
  await page.setContent(documentOf({ html, rules, scheme, css, wrapperStyle }));
  return page.evaluate(async (list) => {
    // A change that starts a transition is read once the transition ends; a second frame lets styles that depend on it recompute.
    const settle = async () => {
      await Promise.race([Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))), new Promise((done) => setTimeout(done, 1000))]);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    };
    const read = (pane, target, property) => {
      const element = document.querySelector(`${pane} ${target}`);
      return element ? getComputedStyle(element).getPropertyValue(property) : null;
    };
    const results = new Array(list.length);
    const take = (scope) => list.forEach(({ target, property, scope: own }, index) => {
      if (own === scope) results[index] = { bare: read('#bare', target, property), scoped: read('#scoped', target, property) };
    });
    await settle();
    take('wrapper');
    for (const { target, scope } of list) {
      if (scope !== 'unavailable') continue;
      const [, base, attribute] = /^(.*)\[([\w-]+)\]$/u.exec(target);
      for (const pane of ['#bare', '#scoped']) for (const element of document.querySelectorAll(`${pane} ${base}`)) element.setAttribute(attribute, '');
    }
    await settle();
    take('unavailable');
    return results;
  }, steps.map(({ target, property, scope }) => ({ target, property, scope })));
}

/** The WCAG contrast the text or icon color at least has to have, and the threshold the sweep holds every step that paints text or its surface to. */
const minimumContrast = 3;

/**
 * The contrast ratio, in the scoped pane, of each step that paints text or its surface: the target's `color` against the surface it is
 * drawn on (the first opaque background up the tree, composited, over the page canvas), for a `color` step, and for a
 * `background-color` step the same of a target that holds text. Null for every other step. Both colors are the computed ones, so the
 * ratio is what a reader sees.
 */
async function contrasts(page, { html, rules, steps, scheme }) {
  await page.setContent(documentOf({ html, rules, scheme }));
  return page.evaluate(async (list) => {
    await Promise.race([Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))), new Promise((done) => setTimeout(done, 1000))]);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const parse = (text) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = '#000000';
      canvas.fillStyle = text;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const surface = (element) => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.a > 0) layers.push(color);
        if (color.a === 1) break;
      }
      return layers.reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
    };
    const luminance = ({ r, g, b }) => {
      const linear = (value) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    };
    const ratio = (one, other) => {
      const [high, low] = [luminance(one), luminance(other)].sort((left, right) => right - left);
      return (high + 0.05) / (low + 0.05);
    };
    return list.map(({ target, property }) => {
      const element = document.querySelector(`#scoped ${target}`);
      if (!element || (property !== 'color' && property !== 'background-color')) return null;
      if (property === 'background-color' && element.textContent.trim() === '') return null;
      const background = surface(element);
      return ratio(over(parse(getComputedStyle(element).color), background), background);
    });
  }, steps.map(({ target, property }) => ({ target, property })));
}

/** What a declaration of `property` computes to on its own, taken from a probe element in the same page. */
const computedOf = (page, property, value) => page.evaluate(([name, text]) => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden';
  probe.style.setProperty(name, text);
  document.body.append(probe);
  const computed = getComputedStyle(probe).getPropertyValue(name);
  probe.remove();
  return computed;
}, [property, value]);

for (const [category, list] of fixtures) {
  test(`recipes work in Chromium, light and dark: ${category}`, { timeout: 180_000 }, async () => {
    const page = await browser.newPage();
    try {
      for (const fixture of list) {
        const recipe = await recipeOf(fixture.slug);
        // The generated recipe is the fixture's: kind, declaration, target, property and scope of every step, in order.
        assert.deepEqual(recipe.steps.map((step) => [step.kind, step.declaration, step.target, step.property, step.scope]), fixture.steps, `${fixture.slug}: the generated steps are the fixture`);
        if (fixture.steps.length === 0) {
          assert.equal(recipe.rules, '', `${fixture.slug}: no steps, no rules`);
          assert.ok(recipe.notes.length > 0, `${fixture.slug}: it says why`);
          continue;
        }
        for (const scheme of ['light', 'dark']) {
          const results = await measure(page, { html: basicHtml(fixture.slug), rules: recipe.rules, steps: recipe.steps, scheme });
          for (const [index, step] of recipe.steps.entries()) {
            const { bare, scoped } = results[index];
            const label = `${fixture.slug} ${scheme}: ${step.declaration} on ${step.target}`;
            assert.ok(bare !== null && scoped !== null, `${label}: the target exists in the Basic example, bare and scoped`);
            assert.notEqual(scoped, bare, `${label}: ${step.property} changed (${bare})`);
            if (step.kind === 'token') {
              const value = step.declaration.split(': ')[1];
              assert.equal(scoped, await computedOf(page, step.property, value), `${label}: ${step.property} is the value the recipe assigned`);
            }
          }
        }
      }
    } finally {
      await page.close();
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Negative controls: the three Button roles that no Mux rule read before this stage.
// ---------------------------------------------------------------------------------------------------------------------------

test('control: the three Button roles change a primary Button on the real stylesheet and change nothing once their reads are removed', { timeout: 120_000 }, async () => {
  const roles = [
    { token: 'background', cssProperty: 'background-color', value: '#7c3aed', before: 'rgb(2, 87, 104)', after: 'rgb(124, 58, 237)' },
    { token: 'foreground', cssProperty: 'color', value: '#123456', before: 'rgb(230, 240, 240)', after: 'rgb(18, 52, 86)' },
    { token: 'radius', cssProperty: 'border-top-left-radius', value: '24px', before: '8px', after: '24px' },
  ];
  const wrapperStyle = roles.map(({ token, value }) => `--muxui-component-button-${token}: ${value}`).join('; ');
  const removed = roles.reduce((css, { token }) => css.replaceAll(`var(--muxui-component-button-${token}`, `var(--muxui-gone-button-${token}`), stylesheet);
  for (const { token } of roles) {
    const read = `var(--muxui-component-button-${token}`;
    assert.ok(stylesheet.includes(read) && !removed.includes(read), `${token}: the real stylesheet reads the role and the mutant does not`);
  }
  const steps = roles.map(({ cssProperty }) => ({ target: '.muxui-button', property: cssProperty, scope: 'wrapper' }));
  // The default Button is primary, which is the variant these roles drive; the Basic example's danger Button is not.
  const html = renderToString(React.createElement(Button, null, 'Save'));
  assert.match(html, /data-muxui-variant="primary"/u);
  const page = await browser.newPage();
  try {
    const real = await measure(page, { html, rules: '', steps, scheme: 'light', wrapperStyle });
    const mutant = await measure(page, { html, rules: '', steps, scheme: 'light', css: removed, wrapperStyle });
    for (const [index, role] of roles.entries()) {
      assert.deepEqual([real[index].bare, real[index].scoped], [role.before, role.after], `${role.token}: the real stylesheet reads the role`);
      assert.deepEqual([mutant[index].bare, mutant[index].scoped], [role.before, role.before], `${role.token}: a stylesheet that does not read the role ignores it`);
    }
    // The Basic example's danger Button is the case the generator leaves the colors out for: the same wrapper changes only its radius.
    const danger = await measure(page, { html: basicHtml('button'), rules: '', steps, scheme: 'light', wrapperStyle });
    assert.deepEqual(danger.map(({ bare, scoped }) => bare !== scoped), [false, false, true], 'a danger Button ignores the background and foreground roles and follows the radius');
  } finally {
    await page.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// The cascade model against the browser: the orders, conditions, fallbacks, shadows and shorthands of support/cascade-cases.mjs.
// ---------------------------------------------------------------------------------------------------------------------------

test('the cascade model agrees with Chromium on orders, conditions, fallbacks, shadows and shorthands: it claims a step only where the role changes the target', { timeout: 300_000 }, async () => {
  const artifacts = new Map(await Promise.all(['button', 'checkbox', 'text-field'].map(async (slug) => [slug, await readRecord(slug)])));
  const page = await browser.newPage();
  try {
    // The unmutated stylesheet: the role moves the radius of the Basic example's danger Button, and the generator claims it.
    const [real] = await measure(page, { html: basicHtml('button'), rules: '', steps: [{ target: '.muxui-button', property: 'border-top-left-radius', scope: 'wrapper' }], scheme: 'light', wrapperStyle: '--muxui-component-button-radius: 24px' });
    assert.deepEqual([real.bare, real.scoped], ['8px', '24px']);
    for (const one of cascadeCases) {
      const { name, family, role, value, target, property, change, markup = (html) => html, claims, changes } = one;
      const [seen] = await measure(page, { html: markup(basicHtml(family)), rules: '', steps: [{ target, property, scope: 'wrapper' }], scheme: 'light', css: change(stylesheet), wrapperStyle: `${role}: ${value}` });
      assert.ok(seen.bare !== null, `${name}: the target exists`);
      assert.equal(seen.bare !== seen.scoped, changes, `${name}: Chromium ${JSON.stringify(seen)}`);
      const claimed = await claimsStep(one, { root: repositoryRoot, artifact: artifacts.get(family), observations });
      assert.equal(claimed, claims, `${name}: the generator`);
      assert.ok(!claimed || seen.bare !== seen.scoped, `${name}: a claimed step changes the target`);
    }
    // TextField's label: the reader holds on the Basic example, and the same wrapper role does nothing once the field is invalid.
    const labels = [{ target: '.muxui-field-label', property: 'color', scope: 'wrapper' }];
    const label = '--muxui-component-textfield-label: rgb(200, 0, 0)';
    const [valid] = await measure(page, { html: basicHtml('text-field'), rules: '', steps: labels, scheme: 'light', wrapperStyle: label });
    assert.notEqual(valid.bare, valid.scoped, 'the role changes the Basic example\'s label');
    assert.equal(valid.scoped, 'rgb(200, 0, 0)');
    const invalidHtml = basicHtml('text-field').replace('class="muxui-text-field"', 'class="muxui-text-field" data-muxui-state-invalid=""');
    assert.notEqual(invalidHtml, basicHtml('text-field'));
    const [invalid] = await measure(page, { html: invalidHtml, rules: '', steps: labels, scheme: 'light', wrapperStyle: label });
    assert.equal(invalid.bare, invalid.scoped, 'an invalid field keeps the feedback color');
  } finally {
    await page.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Every family: a step the generator makes is a step that changes something. No fixture table; the 18 above are the gate for what
// each category shows, and this is the check that no other family's recipe claims an effect its Basic example does not have.
// ---------------------------------------------------------------------------------------------------------------------------

test('every family\'s recipe changes what it says it changes, in light and dark', { timeout: 600_000 }, async () => {
  const slugs = (await readdir(resolve(repositoryRoot, 'catalog/components'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const everything = await renderCatalogExamples(slugs);
  const all = everything.map(({ family, source, html }) => ({ family, source, html }));
  const unchanged = [];
  const unreadable = [];
  let steps = 0;
  let contrastSteps = 0;
  const page = await browser.newPage();
  try {
    for (const slug of slugs) {
      const examples = all.filter(({ family }) => family === slug).map(({ source }) => ({ source: { content: source } }));
      const recipe = stylingFor({ slug, artifact: await readRecord(slug), examples, facts, observations: all }).recipe;
      if (recipe.steps.length === 0) continue;
      const html = all.find(({ source }) => source === examples[0].source.content).html;
      for (const scheme of ['light', 'dark']) {
        const results = await measure(page, { html, rules: recipe.rules, steps: recipe.steps, scheme });
        for (const [index, step] of recipe.steps.entries()) {
          steps += 1;
          const { bare, scoped } = results[index];
          if (bare === null || scoped === null || bare === scoped) unchanged.push(`${slug} ${scheme}: ${step.declaration} on ${step.target} (${JSON.stringify([bare, scoped])})`);
        }
        // A token step that paints text or its surface must leave that text readable: the contrast guard.
        const tokenSteps = recipe.steps.filter(({ kind }) => kind === 'token');
        const ratios = tokenSteps.length > 0 ? await contrasts(page, { html, rules: recipe.rules, steps: tokenSteps, scheme }) : [];
        for (const [index, step] of tokenSteps.entries()) {
          if (ratios[index] === null) continue;
          contrastSteps += 1;
          if (ratios[index] < minimumContrast) unreadable.push(`${slug} ${scheme}: ${step.declaration} on ${step.target} has contrast ${ratios[index].toFixed(2)}`);
        }
      }
    }
  } finally {
    await page.close();
  }
  assert.deepEqual(unchanged, []);
  assert.deepEqual(unreadable, [], `a step that paints text or its surface leaves it under ${minimumContrast}:1`);
  assert.ok(contrastSteps > 20, `${contrastSteps} contrast measurements`);
  assert.equal(steps, 298, 'steps measured: 149 steps in 77 families, each in two color schemes');
});

test('the contrast guard has teeth: the white rows the generator once assigned DataDiff and navy text on the dark canvas are under 3:1, and what it assigns now is not', { timeout: 120_000 }, async () => {
  const recipe = await recipeOf('data-diff');
  const removed = recipe.steps.find(({ declaration }) => declaration.startsWith('--muxui-component-datadiff-removed-background'));
  const page = await browser.newPage();
  try {
    const ratioOf = async (rules, scheme) => (await contrasts(page, { html: basicHtml('data-diff'), rules, steps: [removed], scheme }))[0];
    const positional = '.my-scope { --muxui-component-datadiff-removed-background: #ffffff; }';
    assert.ok((await ratioOf(positional, 'dark')) < minimumContrast, 'white rows under the dark scheme\'s light text');
    for (const scheme of ['light', 'dark']) assert.ok((await ratioOf(recipe.rules, scheme)) >= minimumContrast, `the generated rows read in ${scheme}`);
    // Text drawn on the page's canvas is measured against the scheme's canvas: navy reads on the light one and not on the dark one, so a
    // page that is not themed would let it pass.
    const label = (await recipeOf('switch')).steps.find(({ declaration }) => declaration.startsWith('--muxui-component-switch-label'));
    const navy = '.my-scope { --muxui-component-switch-label: #1e1b4b; }';
    const labelRatio = async (scheme) => (await contrasts(page, { html: basicHtml('switch'), rules: navy, steps: [label], scheme }))[0];
    assert.ok((await labelRatio('light')) >= minimumContrast, 'navy text on the light canvas');
    assert.ok((await labelRatio('dark')) < minimumContrast, 'navy text on the dark canvas');
  } finally {
    await page.close();
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Portals: a popup renders outside the wrapper, so a role on the wrapper does not reach it and the recipe makes no claim about it.
// ---------------------------------------------------------------------------------------------------------------------------

const PICKERS = `function PickerFixture() {
  const h = React.createElement;
  React.useEffect(() => { document.documentElement.dataset.ready = 'true'; }, []);
  return h('div', { className: 'my-scope', id: 'scope' },
    h(DatePicker, { label: 'Due' }),
    h(DateRangePicker, { label: 'Stay' }));
}`;

test('portals: the DatePicker and DateRangePicker popups render outside the wrapper, so a wrapper role does not reach them and a scope that contains the portal container does', { timeout: 180_000 }, async () => {
  const entry = `import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { DatePicker, DateRangePicker } from '/src/fields.ts';
    ${PICKERS}
    createRoot(document.getElementById('root')).render(React.createElement(PickerFixture));`;
  const { url, close } = await startServer({
    entries: ['src/fields.ts'],
    pages: { '/pickers.html': pageShell({ head: '<link rel="stylesheet" href="/generated/styles.css">', body: '<div id="root"></div>', entry: '/pickers-entry.mjs' }) },
    modules: { '/pickers-entry.mjs': entry },
  });
  const context = await browser.newContext({ viewport: { width: 900, height: 900 } });
  try {
    const page = await context.newPage();
    await page.goto(`${url}/pickers.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
    // The roles the recipe never assigns for these families: the popup's own, read by a rule on the portal.
    const role = '--muxui-component-datepicker-popover-shadow-color';
    for (const picker of ['date-picker', 'date-range-picker']) {
      await page.locator(`.muxui-${picker} .muxui-date-trigger`).click();
      const popover = page.locator('.muxui-date-popover');
      await popover.waitFor();
      const outside = await page.evaluate((selector) => {
        const popup = document.querySelector(selector);
        const scope = document.querySelector('.my-scope');
        return { inside: scope.contains(popup), closest: popup.closest('.my-scope') !== null, container: popup.parentElement === document.body || popup.closest('body') !== null };
      }, '.muxui-date-popover');
      assert.deepEqual(outside, { inside: false, closest: false, container: true }, `${picker}: the popup is not a descendant of the wrapper`);
      const shadow = () => page.evaluate(() => getComputedStyle(document.querySelector('.muxui-date-popover')).boxShadow);
      const bare = await shadow();
      await page.evaluate((name) => document.querySelector('.my-scope').style.setProperty(name, 'rgb(255, 0, 0)'), role);
      assert.equal(await shadow(), bare, `${picker}: a role on the wrapper does not reach the popup`);
      await page.evaluate((name) => document.body.style.setProperty(name, 'rgb(255, 0, 0)'), role);
      assert.notEqual(await shadow(), bare, `${picker}: the same role on the scope that contains the portal container does`);
      await page.evaluate((name) => { document.querySelector('.my-scope').style.removeProperty(name); document.body.style.removeProperty(name); }, role);
      await page.keyboard.press('Escape');
      await popover.waitFor({ state: 'detached' });
    }
  } finally {
    await context.close();
    await close();
  }
});
