import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Button } from '../../generated/index.mjs';
import { renderCatalogExamples } from '../support/catalog-example-renders.mjs';
import { cascadeCases, claimsStep } from '../support/cascade-cases.mjs';
import { contrastRatio, requiredContrast } from '../support/contrast.mjs';
import { readStylingFacts, stylingFor } from '../support/styling-reference.mjs';
import { launchBrowser, packageRoot, pageShell, repositoryRoot, startServer } from './harness.mjs';

// The generated recipe, run in Chromium: the authority for the recipe. The static cascade model that picks the steps cannot be
// complete against an arbitrary stylesheet, so this file is what holds it to the stylesheet that ships: the sweep at the end applies
// every step the generator makes, for all 84 families, to the real stylesheet in light and dark, and fails when a step does not change
// its property or when a step that paints a color leaves what it paints under the contrast guard (below). A real stylesheet change that
// breaks a step is caught here (this file runs in the `browser-chromium-only` group the planner selects for the module); the cascade
// cases below are hypothetical stylesheets that show the model never claims a step the browser would not bear out.
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
      ['token', '--muxui-component-button-background: #7e62c9', ".muxui-button[data-muxui-variant='primary']", 'background-color', 'wrapper'],
      ['token', '--muxui-component-button-foreground: #ffffff', ".muxui-button[data-muxui-variant='primary']", 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-icon-button', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-icon-button[data-muxui-state-disabled]', 'text-decoration-line', 'wrapper'],
    ] },
    // The box holds a mark and no text: a violet fill that stands apart from the page in light and dark, with a white mark on it.
    { slug: 'checkbox', steps: [
      ['token', '--muxui-component-checkbox-selected-background: #7e62c9', '.muxui-checkbox__indicator[data-muxui-state-selected]', 'border-top-color', 'wrapper'],
      ['token', '--muxui-component-checkbox-selected-foreground: #ffffff', '.muxui-checkbox__indicator svg', 'color', 'wrapper'],
      ['part', 'letter-spacing: 0.04em', '.muxui-checkbox__label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-checkbox[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
    // The label is text on the page, which no fixed color reads on in light and dark. The thumb is drawn on a track the recipe cannot set
    // (a pseudo-element's), so no color for it can be shown to stand apart from that: neither role is a token step.
    { slug: 'switch', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-switch__label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-switch[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
    // The panel's foreground is text on the page: no token step.
    { slug: 'tabs', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-tabs__list', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-tabs__tab[data-muxui-state-selected]', 'text-decoration-line', 'wrapper'],
    ] },
  ]],
  ['Collections and shared fields', [
    // The label is text on the page, so only the tag's surface and the text drawn on it are token steps: navy and white, 16:1 in either scheme.
    { slug: 'tag-group', steps: [
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
    // The label role is read by `:where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label`, which the Basic example (not
    // invalid) matches, and the cascade test below shows the role changing that label. It is text on the page, which no single color
    // reads on in light and dark, so the recipe leaves it out and says so.
    { slug: 'text-field', steps: [
      ['part', 'letter-spacing: 0.04em', '.muxui-text-field .muxui-field-label', 'letter-spacing', 'wrapper'],
      ['state', 'text-decoration: line-through', '.muxui-text-field[data-muxui-state-disabled]', 'text-decoration-line', 'unavailable'],
    ] },
    // Both roles are surfaces under text, including the + and - that say what changed (1.9:1 and 3.9:1 on the light page before any recipe):
    // a color lowers one of them in light or in dark, so neither is a token step.
    { slug: 'data-diff', steps: [
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
    // The background is a surface under text, and the open panel's muted text has 5.7:1 on the light page to start with: only the icon size.
    { slug: 'disclosure-group', steps: [
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

/**
 * The contrast guard. For each color step it reads EVERY element the step's target matches (not the first), in the scoped pane and, as
 * what the recipe changed it from, the same element in the bare pane, and holds it to a bar:
 * - text: every element under the match that holds text a reader sees, at 1.5x the WCAG rule for its own computed size and weight (4.5:1
 *   under 24px, or 18.66px when bold; 3:1 above), against the surface it is drawn on. Seen is a visible box of 2px or more; `aria-hidden`
 *   is not a reason to skip, since DataDiff's + and - are meant to be read by sight (their twins "Added row" are screen-reader text with
 *   no box, and are not read). No element is exempted as decorative.
 * - a mark (a `color` step on a match with no text: a check, an icon): 3:1 against the fill it is drawn on.
 * - a fill (a background or border color on a match with no text: a box, a thumb): 3:1 against what is behind it. A fill that holds no text
 *   is what shows the control, so it has to stand apart from the page, or the track it is drawn on; a fill that holds text is identified
 *   by its text and is held to the text rule only.
 * Non-text parts get the plain 3:1 and no margin: a fill that stands apart from the page in light and dark and carries a white mark has a
 * luminance window of 0.115 to 0.183, and the violet in it reads between 4.05 and 4.69 in each pairing. And nothing is lowered: an element that
 * is under its bar before the recipe has to stay at least where it was.
 * What is drawn on what comes from the ancestors' backgrounds, and from `underlays`: the parts that sit on a box a pseudo-element paints
 * (the thumb of a Switch sits on the track, which is the label's `::before`, and its label does not). A small reviewed list, because a
 * pseudo-element is not in the tree and the page cannot say which children it is behind.
 * Returns, for each step, null (a step that paints no color) or the readings and the text that has no box.
 */
const underlays = [{ part: '.muxui-switch__indicator', host: '.muxui-switch', pseudo: '::before' }];

async function contrasts(page, { html, rules, steps, scheme }) {
  await page.setContent(documentOf({ html, rules, scheme }));
  return page.evaluate(async ({ list, behind }) => {
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
    const flatten = (layers) => [...layers].reverse().reduce((base, layer) => over(layer, base), { r: 255, g: 255, b: 255, a: 1 });
    /** What `part` is drawn on, from `element` up: backgrounds up to the first opaque one, translucent layers composited. */
    const surface = (element, part = element) => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        // A host's pseudo-element is drawn over the host's own background and under its children, for the parts the list names.
        const painted = [...behind.filter((entry) => part.closest(entry.part) !== null && node.matches(entry.host)).map(({ pseudo }) => getComputedStyle(node, pseudo).backgroundColor), getComputedStyle(node).backgroundColor].map(parse);
        for (const color of painted) {
          if (color.a > 0) layers.push(color);
          if (color.a === 1) return flatten(layers);
        }
      }
      return flatten(layers);
    };
    const holdsText = (element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
    // An element with `display: contents` has no box of its own (TagGroup's cell): its text is drawn in the nearest box above it.
    const seen = (element) => {
      let boxed = element;
      while (boxed.parentElement && getComputedStyle(boxed).display === 'contents') boxed = boxed.parentElement;
      const box = boxed.getBoundingClientRect();
      return box.width >= 2 && box.height >= 2 && getComputedStyle(element).visibility === 'visible';
    };
    const label = (element) => `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className ? `.${element.className.split(' ')[0]}` : ''} ${JSON.stringify(element.textContent.trim().slice(0, 16))}`;
    const family = (root) => [root, ...root.querySelectorAll('*')].filter((element) => !['SCRIPT', 'STYLE', 'TEMPLATE'].includes(element.tagName));
    return list.map(({ target, property }) => {
      if (!property.endsWith('color')) return null;
      const readings = [];
      const unseen = [];
      const bare = [...document.querySelectorAll(`#bare ${target}`)];
      [...document.querySelectorAll(`#scoped ${target}`)].forEach((match, index) => {
        // The same markup sits in both panes, so the element at the same place is what this one was before the recipe.
        const here = family(match);
        const there = family(bare[index]);
        const sample = (element, kind) => {
          const style = getComputedStyle(element);
          // A fill is the paint the step set, against what is behind the element; text and a mark are drawn on the element's own surface.
          return kind === 'fill' ? { foreground: parse(style.getPropertyValue(property)), surface: surface(element.parentElement, element) } : { foreground: parse(style.color), surface: surface(element) };
        };
        const read = (position, kind) => {
          const style = getComputedStyle(here[position]);
          return { match: index, label: label(here[position]), kind, fontSize: Number.parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), after: sample(here[position], kind), before: sample(there[position], kind) };
        };
        const holders = here.map((element, position) => position).filter((position) => holdsText(here[position]));
        for (const position of holders) (seen(here[position]) ? readings.push(read(position, 'text')) : unseen.push(label(here[position])));
        if (holders.length === 0) readings.push(read(0, property === 'color' ? 'mark' : 'fill'));
      });
      return { readings, unseen };
    });
  }, { list: steps.map(({ target, property }) => ({ target, property })), behind: underlays });
}

/** The room a generated step keeps over the rule for text: the palette is tuned to one theme, and a drift in its colors is caught before a step crosses the rule. */
const contrastMargin = 1.5;

/** The readings of `contrasts` with their ratio after the recipe, before it, the rule for the element and the bar it is held to. */
const ratiosOf = (readings) => readings.map((entry) => {
  const required = requiredContrast({ ...entry, text: entry.kind === 'text' });
  const ratio = contrastRatio(entry.after.foreground, entry.after.surface);
  const was = contrastRatio(entry.before.foreground, entry.before.surface);
  // The rule with the margin for text, the plain rule for a part, and no lower than it was when it was under that already.
  return { ...entry, ratio, was, required, bar: Math.min(entry.kind === 'text' ? required * contrastMargin : required, was) };
});

/** The readings that miss their bar, worded for a failure. */
const shortfalls = (readings, where) => ratiosOf(readings).filter(({ ratio, bar }) => ratio < bar)
  .map((entry) => `${where}: match ${entry.match}, ${entry.label} (${entry.kind}${entry.kind === 'text' ? ` ${entry.fontSize}px/${entry.fontWeight}` : ''}) reads ${entry.ratio.toFixed(2)}:1, was ${entry.was.toFixed(2)}:1, and has to keep ${entry.bar.toFixed(2)}:1`);

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
  const kinds = { text: 0, mark: 0, fill: 0 };
  let steps = 0;
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
        // A token step that paints a color must leave everything it paints under the contrast guard.
        const tokenSteps = recipe.steps.filter(({ kind }) => kind === 'token');
        const measured = tokenSteps.length > 0 ? await contrasts(page, { html, rules: recipe.rules, steps: tokenSteps, scheme }) : [];
        for (const [index, step] of tokenSteps.entries()) {
          for (const { kind } of measured[index]?.readings ?? []) kinds[kind] += 1;
          unreadable.push(...shortfalls(measured[index]?.readings ?? [], `${slug} ${scheme}: ${step.declaration} on ${step.target}`));
        }
      }
    }
  } finally {
    await page.close();
  }
  assert.deepEqual(unchanged, []);
  assert.deepEqual(unreadable, [], `every element a color step paints keeps the contrast guard: text 1.5x the WCAG rule for its size and weight, a mark or a fill that holds no text 3:1, nothing lower than it was`);
  // The readings: every element each color step paints, in light and in dark.
  assert.deepEqual(kinds, { text: 12, mark: 6, fill: 6 }, 'readings: TagGroup\'s three tags under both its steps, then the mark and the fill of Checkbox, CheckboxField and IconButton, in two color schemes');
  assert.equal(steps, 282, 'steps measured: 141 steps in 77 families, each in two color schemes');
});

test('the rule the guard holds text to: 4.5:1 for normal text, 3:1 for large text and for a glyph, by the element\'s own size and weight', () => {
  const rule = (fontSize, fontWeight, text = true) => requiredContrast({ text, fontSize, fontWeight });
  assert.deepEqual([rule(13.33, 400), rule(13.33, 500), rule(16, 400), rule(18.65, 700), rule(18.66, 400), rule(23.99, 400), rule(18.66, 699)], [4.5, 4.5, 4.5, 4.5, 4.5, 4.5, 4.5], 'normal text');
  assert.deepEqual([rule(18.66, 700), rule(19, 700), rule(24, 400), rule(32, 500)], [3, 3, 3, 3], 'large text: 24px, or 18.66px when bold');
  assert.deepEqual([rule(13.33, 400, false), rule(16, 500, false)], [3, 3], 'a glyph holds no text');
});

test('the contrast guard has teeth: the colors the recipe once assigned are rejected, on every element they paint, and what it assigns now is not', { timeout: 240_000 }, async () => {
  const page = await browser.newPage();
  try {
    const readingsOf = async (slug, rules, steps, scheme) => (await contrasts(page, { html: basicHtml(slug), rules, steps, scheme })).map((measured) => ratiosOf(measured.readings));
    const entriesOf = async (slug, rules, step, scheme) => (await readingsOf(slug, rules, [step], scheme))[0];
    const lowestOf = (entries) => entries.reduce((lowest, entry) => (entry.ratio < lowest.ratio ? entry : lowest));
    const round = (entries) => entries.map(({ ratio }) => Number(ratio.toFixed(2)));
    const missed = (entries) => entries.filter(({ ratio, bar }) => ratio < bar);

    // DataDiff's removed rows in the opaque teal the palette once had: 13.3px text at 3.05:1 on the light page and 3.36:1 on the dark.
    // The old guard asked 3:1 and passed them; the rule for 13.3px text is 4.5:1.
    const removed = { target: ".muxui-data-diff__row[data-muxui-change='removed']", property: 'background-color' };
    const tealRows = '.my-scope { --muxui-component-datadiff-removed-background: #287f72; }';
    for (const [scheme, expected] of [['light', 3.05], ['dark', 3.36]]) {
      const cells = (await entriesOf('data-diff', tealRows, removed, scheme)).filter(({ label }) => label.startsWith('td'));
      assert.equal(cells.length, 4, 'two cells in each of two removed rows');
      assert.ok(cells.every(({ ratio, required, fontSize }) => required === 4.5 && Math.abs(ratio - expected) < 0.02 && Math.abs(fontSize - 13.3) < 0.05), `${scheme}: 13.3px text at ${expected}:1`);
      assert.ok(cells.every(({ ratio, required }) => ratio >= 3 && ratio < required), 'a 3:1 guard accepts it and the rule rejects it');
    }
    // White rows under the dark scheme's light text (the colors once assigned by position) are under 3:1 too.
    const white = await entriesOf('data-diff', '.my-scope { --muxui-component-datadiff-removed-background: #ffffff; }', removed, 'dark');
    assert.ok(lowestOf(white).ratio < 3, 'white rows under the dark scheme\'s light text');

    // DataDiff's tints (the palette's surfaces): the text cells keep their contrast, but the + and - are text a reader sees and are read,
    // though they are `aria-hidden` (the screen reader has "Added row"). Each is lowered below what the shipped example gives it.
    const tints = '.my-scope { --muxui-component-datadiff-added-background: #7e62c940; --muxui-component-datadiff-removed-background: #287f7240; }';
    const rows = [{ target: ".muxui-data-diff__row[data-muxui-change='added']", property: 'background-color' }, removed];
    for (const [scheme, lowered] of [['light', [[1.55, 1.94], [3.34, 3.94], [3.34, 3.94]]], ['dark', [[6.13, 6.98], [6.44, 7.19], [6.44, 7.19]]]]) {
      const measured = await contrasts(page, { html: basicHtml('data-diff'), rules: tints, steps: rows, scheme });
      const entries = measured.flatMap((one) => ratiosOf(one.readings));
      const glyphs = entries.filter(({ label }) => label.startsWith('span.muxui-data-diff__change'));
      assert.deepEqual(glyphs.map(({ label }) => label.at(-2)), ['+', '−', '−'], 'the three marks are read');
      assert.deepEqual(missed(entries), glyphs, `${scheme}: only the marks miss`);
      assert.deepEqual(glyphs.map(({ ratio, was }) => [Number(ratio.toFixed(2)), Number(was.toFixed(2))]), lowered, `${scheme}: the marks, lowered by the tints`);
      assert.deepEqual(measured.flatMap(({ unseen }) => unseen).sort(), ['span.muxui-data-diff__sr-only "Added row, Outli"', 'span.muxui-data-diff__sr-only "Removed row, Cor"', 'span.muxui-data-diff__sr-only "Removed row, Gut"'], 'the screen-reader twins have no box, and are not read');
    }

    // The bar is the rule with its margin, or no lower than the element was when it was under that already. A white tint raises the marks on
    // the light page (the + from 1.94:1 to 2.17:1, still under the rule, and not a miss); on the dark page it lowers them from 7.0:1 to 3.6:1.
    const lightening = '.my-scope { --muxui-component-datadiff-added-background: #ffffff40; --muxui-component-datadiff-removed-background: #ffffff40; }';
    const lightRows = (await contrasts(page, { html: basicHtml('data-diff'), rules: lightening, steps: rows, scheme: 'light' })).flatMap((one) => ratiosOf(one.readings));
    assert.deepEqual(missed(lightRows), [], 'light: nothing is lowered');
    const lightMarks = lightRows.filter(({ label }) => label.startsWith('span.muxui-data-diff__change'));
    assert.ok(lightMarks.every(({ ratio, was }) => ratio > was) && lightMarks[0].ratio < lightMarks[0].required, 'light: the marks are raised, and the + is still under the rule');
    const darkRows = (await contrasts(page, { html: basicHtml('data-diff'), rules: lightening, steps: rows, scheme: 'dark' })).flatMap((one) => ratiosOf(one.readings));
    assert.ok(missed(darkRows).some(({ label }) => label.startsWith('span.muxui-data-diff__change')), 'dark: the marks are lowered');

    // DisclosureGroup's tint: every item is read, and only the fourth, whose panel is open, misses (16px text with 5.7:1 on the light page
    // to start with). A guard that read the first item only would pass it.
    const item = { target: '.muxui-disclosure-group > .muxui-disclosure', property: 'background-color' };
    for (const [scheme, shown] of [['light', [4.52, 5.72]], ['dark', [5.89, 7.21]]]) {
      const entries = await entriesOf('disclosure-group', '.my-scope { --muxui-component-disclosuregroup-background: #7e62c940; }', item, scheme);
      assert.deepEqual([...new Set(entries.map(({ match }) => match))], [0, 1, 2, 3, 4, 5], 'all six items are read');
      assert.deepEqual(missed(entries).map(({ match }) => match), [3], `${scheme}: only the open item misses`);
      assert.deepEqual(missed(entries).map(({ ratio, was }) => [Number(ratio.toFixed(2)), Number(was.toFixed(2))]), [shown]);
      assert.deepEqual(missed(entries.filter(({ match }) => match === 0)), [], 'the first item passes');
    }

    // Switch's thumb in the mid-tone the palette once gave a part: 1.7:1 against the light track and 1.3:1 against the dark, where the
    // thumb it replaces has 7.0:1 and 4.5:1. The track is the label's `::before`, which is why the guard lists it.
    const thumb = { target: '.muxui-switch[data-muxui-state-selected] .muxui-switch__indicator', property: 'background-color' };
    for (const [scheme, shown] of [['light', [1.75, 7.05]], ['dark', [1.31, 4.55]]]) {
      const entries = await entriesOf('switch', '.my-scope { --muxui-component-switch-selected-thumb: #7e62c9; }', thumb, scheme);
      assert.deepEqual(missed(entries).map(({ kind, ratio, was }) => [kind, Number(ratio.toFixed(2)), Number(was.toFixed(2))]), [['fill', ...shown]], `${scheme}: the thumb on its track`);
    }

    // Checkbox's box in the navy the pair once had: white on it is 16:1, but the box is 1.19:1 against the dark page, where the box it
    // replaces has 5.3:1, so a selected Checkbox disappears. The violet pair stands apart from the page and carries the mark.
    const box = (checkbox) => [checkbox.steps.find(({ property }) => property === 'border-top-color'), checkbox.steps.find(({ property }) => property === 'color')];
    const navyBox = '.my-scope { --muxui-component-checkbox-selected-background: #1e1b4b; --muxui-component-checkbox-selected-foreground: #ffffff; }';
    const checkbox = await recipeOf('checkbox');
    for (const [scheme, navy, violet] of [['light', [14.17, 15.99], [4.16, 4.69]], ['dark', [1.19, 15.99], [4.05, 4.69]]]) {
      const [fill, mark] = await readingsOf('checkbox', navyBox, box(checkbox), scheme);
      assert.deepEqual([...round(fill), ...round(mark)], navy, `${scheme}: navy fill, then its mark`);
      assert.deepEqual(missed([...fill, ...mark]).map(({ kind }) => kind), scheme === 'dark' ? ['fill'] : [], `${scheme}: only the dark page misses`);
      const [fillNow, markNow] = await readingsOf('checkbox', checkbox.rules, box(checkbox), scheme);
      assert.deepEqual([...round(fillNow), ...round(markNow)], violet, `${scheme}: what the recipe assigns now`);
      assert.deepEqual(missed([...fillNow, ...markNow]), []);
      assert.deepEqual([...fillNow, ...markNow].map(({ kind, required }) => [kind, required]), [['fill', 3], ['mark', 3]], 'a part that holds no text is held to 3:1');
    }

    // TextField's label in the mid-tone the palette once had: 13.3px at 4.16:1 on the light page and 4.05:1 on the dark, the best any
    // fixed color can do on both (see the static palette test).
    const label = { target: ':where(.muxui-text-field):not([data-muxui-state-invalid]) .muxui-field-label', property: 'color' };
    const violet = '.my-scope { --muxui-component-textfield-label: #7e62c9; }';
    for (const scheme of ['light', 'dark']) {
      const [entry] = await entriesOf('text-field', violet, label, scheme);
      assert.ok(entry.required === 4.5 && entry.ratio >= 3 && entry.ratio < 4.5, `${scheme}: ${entry.ratio.toFixed(2)} is under the 4.5:1 rule for ${entry.fontSize}px text and over a 3:1 guard`);
    }
    // The rule follows the element's own size and weight: the same color on the same label is enough once the label is large.
    const sized = async (declaration) => (await entriesOf('text-field', `${violet} .my-scope .muxui-field-label { ${declaration} }`, label, 'light'))[0];
    assert.equal((await sized('font-size: 24px')).required, 3);
    assert.equal((await sized('font-size: 19px; font-weight: 700')).required, 3);
    assert.equal((await sized('font-size: 18px; font-weight: 700')).required, 4.5);
    assert.equal((await sized('font-size: 23px; font-weight: 400')).required, 4.5);
    // Text drawn on the page's canvas is measured against the scheme's canvas: navy reads on the light one and not on the dark one, so a
    // page that is not themed would let it pass.
    const switchLabel = { target: '.muxui-switch__label', property: 'color' };
    const navy = '.my-scope { --muxui-component-switch-label: #1e1b4b; }';
    assert.ok(lowestOf(await entriesOf('switch', navy, switchLabel, 'light')).ratio >= 4.5, 'navy text on the light canvas');
    assert.ok(lowestOf(await entriesOf('switch', navy, switchLabel, 'dark')).ratio < 3, 'navy text on the dark canvas');
    // What the recipe assigns now holds: TagGroup's tags, text on its surface at 16:1.
    const tags = await recipeOf('tag-group');
    for (const scheme of ['light', 'dark']) {
      const entries = (await readingsOf('tag-group', tags.rules, tags.steps.filter(({ kind }) => kind === 'token'), scheme)).flat();
      assert.deepEqual(missed(entries), []);
      assert.ok(entries.every(({ kind, ratio }) => kind === 'text' && ratio > 15.9), `${scheme}: white on navy`);
    }
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
