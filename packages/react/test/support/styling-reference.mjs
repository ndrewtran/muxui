// The styling reference (CSS Stage 2 PR 4, X-006): everything the docs "Styling" section and the Storybook Anatomy table print about one
// component's hooks, tokens and override rules, derived from sources and never written per family.
//
//   readStylingFacts(root)  reads the five sources once: the part map and the catalog state classification, the built stylesheet,
//                           the token graph, the README's cascade text, and motion.mjs (all from `root`, so a test can point it at a
//                           mutated copy of the repository)
//   stylingFor(input)       is pure: one family's `styling` object from the facts, its compiled catalog record and, optionally,
//                           observations (server renders of its catalog examples)
//
// `apps/component-reference.mjs` returns the result as `styling` when its caller passes `stylingFacts`; Storybook's generator and
// the docs page are its callers. They derive nothing themselves. Facts are opaque to them: pass them through.
//
// Two kinds of evidence are kept apart on every row. `selectedOn` is what the stylesheet says (a rule selects the attribute on that
// part's hook). `emittedOn` is what a render showed (an element of that part carried the attribute). Observed element tags, companion
// hooks and the Rendered DOM are observations of the catalog's examples, labelled with their render, and never a contract.
//
// The recipe is copyable CSS for the family, from the same facts and the family's Basic example (its first example). Each step names
// an element that render shows, so the docs preview can measure it. A token step is made only where the rule that reads the role is
// the one that wins on that element, found by a small model of the cascade over the shipped components layer: a Button whose variant
// is danger sets its own colors, so none of the Button color roles is a step for it. The model decides each declaration by importance,
// specificity, order and position. What it cannot decide (a pseudo-class it does not model, a condition it cannot evaluate, a custom
// property redeclared on the element itself) it leaves unknown, which is never a step; a declaration that may set the property (a
// logical counterpart, a shorthand it has no table for) competes as if it did, so a step is dropped where it wins.
//
// The model is not complete and cannot be: no static reading of a cascade is complete against an arbitrary stylesheet. It is a
// conservative generator for the stylesheet that ships, and it is not the authority. The authority is the Chromium sweep
// (test/browser/styling-recipes.test.mjs, in the `browser-chromium-only` group the planner runs for this module), which applies every
// generated step to the real stylesheet in light and dark, fails when a step does not change its property, and fails when a step that
// paints text or its surface leaves it under 3:1. The adversarial cases in `cascade-cases.mjs` are hypothetical future stylesheets; a
// real stylesheet change that breaks a step is caught by the sweep.
//
// Every selector, from the stylesheet, the part map or a reader, goes through one parser (`parseSelectorList`), which throws on syntax it
// does not model, so a selector is read whole or not at all.
//
// The reader is plain JavaScript on purpose (relative imports of the part map, which is erasable TypeScript, happen by dynamic import
// so a mutated mirror root is what is read). Nothing here ships: this file lives in test support and is imported by path.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultRoot = resolve(import.meta.dirname, '../../../..');

// ---------------------------------------------------------------------------------------------------------------------------
// The frozen interface, as types. Everything `stylingFor` returns is deeply frozen.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * One example render. `source` is the repository-relative example file, `html` its server-rendered markup.
 * @typedef {object} Observation
 * @property {string} family The catalog family slug.
 * @property {string} source For example `catalog/components/button/examples/react/basic.tsx`.
 * @property {string} html
 */

/**
 * One row of the Hooks block.
 * @typedef {object} HookRow
 * @property {'class' | 'state' | 'reflected'} kind
 * @property {string | null} hook The selector as a consumer writes it (`.muxui-button__label`, `button.muxui-card`,
 *   `.muxui-text-field .muxui-field-label`), or the attribute name; null for a part with no hook (internal, no element).
 * @property {string} [part] The part, for a class row.
 * @property {'class' | 'root-element' | 'field' | 'composed' | 'internal' | 'none'} [disposition]
 * @property {'part' | 'catalog' | 'interaction' | 'observed' | 'prop'} origin Where the row comes from.
 * @property {string[]} selectedOn Parts whose documented hook a stylesheet rule selects this on (what the CSS says).
 * @property {string[]} emittedOn Parts an element of which carried this in a supplied render (what a render showed); empty when none.
 * @property {string[]} tags Observed element tags (class rows), in first-seen order.
 * @property {boolean} inRoot Every observed element of a class row is a descendant of the family root's element.
 * @property {string} on The final text of the On cell.
 * @property {string[]} [values] Enumerated or declared values, for a state or reflected row.
 * @property {string} [default] The prop default, when the values come from the declared type.
 * @property {string[]} [catalog] The catalog state names that classify to this attribute.
 * @property {string} [qualifier] The element predicate of a root-element row (`button` for Card.Button).
 * @property {string} [conditional] Why the element depends on the caller, for a `callerSupplied` row.
 * @property {string} [composedOf] The family whose root class the element also carries (`button`).
 * @property {boolean} [hookOnly] No Mux rule styles the hook.
 * @property {string} [noElement] Why a `none` row renders no element (provider, children, substrate, caller, state).
 * @property {string} [companion] For a reflected row selected through a companion hook: that hook.
 * @property {string} note The final printed note.
 * @property {string[]} provenance Observation sources behind `tags`, `emittedOn` and `companion`; empty when none.
 */

/**
 * @typedef {object} ReadSelector
 * @property {string} selector The rule's selector, verbatim.
 * @property {string[]} conditions The at-rules around it other than the layer (`@media (forced-colors: active)`).
 * @property {string} property The property whose value reads the token.
 * @property {boolean} public Every Mux class the selector names is a documented hook.
 */

/**
 * @typedef {object} ReadBy
 * @property {'rules' | 'parts' | 'compiled' | 'none'} kind
 * @property {ReadSelector[]} selectors The rules that read it (`rules` and `parts`).
 * @property {string[]} through The custom properties read (`parts`) or the dependent token ids that are read (`compiled`).
 * @property {string[]} [examples] For `none`: the catalog example files that read the role in their own markup.
 * @property {string} note The final printed sentence.
 */

/**
 * @typedef {object} TokenRow
 * @property {string} token The token id, `component.button.background`.
 * @property {string} cssVar `--muxui-component-button-background`.
 * @property {string} requirement `required`, `optional`, ...
 * @property {string[]} [profiles]
 * @property {'component' | 'semantic'} group
 * @property {string} meaning
 * @property {'theme' | 'fixed'} policy
 * @property {string} type The token type (`color`, `dimension`, ...).
 * @property {string | null} alias The authored alias target, when the light value is an alias.
 * @property {string | null} darkAlias The authored alias target of the dark scheme, when the dark value is an alias.
 * @property {string} light The resolved light-scheme value.
 * @property {string} dark The resolved dark-scheme value.
 * @property {ReadBy | null} readBy Component roles only.
 */

/**
 * @typedef {object} WhoWinsRow
 * @property {number} id One to seven; the Chromium test names its cases by it.
 * @property {string} declaration
 * @property {string} against
 * @property {'You' | 'Mux' | 'You, but do not'} winner
 */

/**
 * One change the recipe makes, with where to read its effect in the Basic example's preview.
 * @typedef {object} RecipeStep
 * @property {'token' | 'part' | 'state'} kind
 * @property {string} selector The selector as printed in `rules`: `.my-scope` for a token step, else the rule's selector.
 * @property {string} declaration As printed in `rules`, without its semicolon.
 * @property {string} target The element the effect is read on, a selector evaluated inside the scope wrapper.
 * @property {string} property The computed longhand to compare before and after.
 * @property {'wrapper' | 'unavailable'} scope `wrapper`: the target is in the Basic example at rest. `unavailable`: it is not, and
 *   `reason` says what the preview needs (a state step for a state the example does not show).
 * @property {string} [reason] Why a step is unavailable.
 * @property {boolean} observedText The target held text in the observation (else the change is computed only).
 */

/**
 * The generated recipe: CSS a consumer can copy, the markup it goes with, and the steps it takes.
 * @typedef {object} Recipe
 * @property {string} css The whole recipe: the README's layer statement and import, then `rules`.
 * @property {string} rules The recipe without the layer statement and the import, which the docs stylesheet already provides.
 * @property {string} markup The wrapper the tokens and rules are scoped to.
 * @property {'my-scope'} scope
 * @property {RecipeStep[]} steps
 * @property {string[]} notes One sentence for each step that has no candidate, and for roles the examples do not reach.
 */

/**
 * What `stylingFor` adds to `styling` (beside `anatomy`, `states`, `tokenSource` and `tokenGroups`, which the reference already had).
 * @typedef {object} FamilyStyling
 * @property {{ groups: { id: 'root' | 'part' | 'state' | 'reflected', rows: HookRow[] }[], notSet: HookRow[],
 *   renderedDom: { source: string, text: string, note: string } | null, observationNote: string }} hooks
 * @property {{ groups: { id: 'component' | 'semantic', label: string, caption: string, collapsed: boolean, rows: TokenRow[] }[] }} tokens
 * @property {{ paragraphs: string[], layerIntro: string, layerCode: string, layerClosing: string, limit: string, motion: string,
 *   whoWins: WhoWinsRow[], important: { total: number, byCause: Record<string, number> } | null }} overrides
 * @property {Recipe} recipe
 * @property {string[]} sources Tracked paths behind the Styling block.
 */

/** The 12 states React Aria reports for an interaction, which a consumer styles whether or not the catalog declares them. */
export const interactionStates = Object.freeze([
  'focused', 'focus-visible', 'focus-within', 'hovered', 'pressed', 'dragging', 'drop-target', 'entering', 'exiting', 'open', 'opening', 'closing',
]);

/** Why a part-map row renders no element, as a phrase for the note. */
const noElementPhrases = Object.freeze({
  provider: 'a provider',
  children: 'the caller\'s children',
  substrate: 'React Aria renders it',
  caller: 'the caller\'s element',
  state: 'a state, not an element',
});

const collapse = (text) => text.replace(/\s+/gu, ' ').trim();
const pascal = (slug) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
const unique = (list) => [...new Set(list)];
const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

// ---------------------------------------------------------------------------------------------------------------------------
// The stylesheet reader. It is not a CSS parser: it walks braces, comments and strings, and it fails closed on anything it does not
// model (a nested rule, an unknown at-rule, an unbalanced brace) instead of skipping it, so a future syntax change breaks a test.
// ---------------------------------------------------------------------------------------------------------------------------

const groupingAtRules = new Set(['layer', 'media', 'supports', 'scope', 'container']);
const leafAtRules = new Set(['font-face', 'keyframes', 'property']);
const statementAtRules = new Set(['layer', 'import', 'charset', 'namespace']);

/**
 * Every style rule of a stylesheet with the at-rules around it (`chain`, outermost first), and every grouping at-rule block.
 * @param {string} css
 * @returns {{ rules: { selector: string, chain: string[], declarations: { property: string, value: string, important: boolean }[] }[], blocks: { prelude: string, chain: string[] }[] }}
 */
export function readStyleRules(css) {
  const rules = [];
  const blocks = [];
  let index = 0;
  const fail = (message) => {
    throw new Error(`stylesheet: ${message} (line ${css.slice(0, index).split('\n').length})`);
  };
  /** A comment (a space) or a string (its text) at the cursor, advancing past it; null when neither starts here. */
  const trivia = () => {
    const char = css[index];
    if (char === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2);
      if (end < 0) fail('unterminated comment');
      index = end + 2;
      return ' ';
    }
    if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < css.length && css[end] !== char) end += css[end] === '\\' ? 2 : 1;
      if (end >= css.length) fail('unterminated string');
      const text = css.slice(index, end + 1);
      index = end + 1;
      return text;
    }
    return null;
  };
  /** Skips a block whose opening brace was just consumed. */
  const skipBlock = () => {
    let depth = 1;
    while (index < css.length && depth > 0) {
      if (trivia() !== null) continue;
      if (css[index] === '{') depth += 1;
      else if (css[index] === '}') depth -= 1;
      index += 1;
    }
    if (depth !== 0) fail('unbalanced opening brace');
  };
  const readDeclarations = () => {
    const found = [];
    let text = '';
    let parentheses = 0;
    const flush = () => {
      const statement = text.trim();
      text = '';
      if (statement === '') return;
      const match = /^([^:]+):([\s\S]*)$/u.exec(statement);
      if (!match) fail(`a declaration without a colon: ${statement.slice(0, 40)}`);
      const important = /\s*!\s*important\s*$/iu.test(match[2]);
      found.push({ property: collapse(match[1]), value: collapse(match[2].replace(/\s*!\s*important\s*$/iu, '')), important });
    };
    while (index < css.length) {
      const skipped = trivia();
      if (skipped !== null) { text += skipped; continue; }
      const char = css[index];
      if (char === '{') {
        // A custom property value may hold a block; anything else here is a nested rule, which this reader does not model.
        if (!/^\s*--[^\s:]*\s*:/u.test(text)) fail(`a nested rule in a declaration block: ${collapse(text).slice(0, 60)}`);
        index += 1;
        skipBlock();
        text += '{}';
        continue;
      }
      if (char === '}') { flush(); index += 1; return found; }
      if (char === ';' && parentheses === 0) { flush(); index += 1; continue; }
      if (char === '(') parentheses += 1;
      else if (char === ')') parentheses -= 1;
      text += char;
      index += 1;
    }
    return fail('unbalanced opening brace');
  };
  const walk = (chain) => {
    let text = '';
    while (index < css.length) {
      const skipped = trivia();
      if (skipped !== null) { text += skipped; continue; }
      const char = css[index];
      if (char === '{') {
        const prelude = collapse(text);
        text = '';
        index += 1;
        if (prelude === '') fail('a block without a prelude');
        if (prelude.startsWith('@')) {
          const name = /^@([\w-]+)/u.exec(prelude)?.[1];
          if (name && groupingAtRules.has(name)) {
            blocks.push({ prelude, chain });
            walk([...chain, prelude]);
          } else if (name && leafAtRules.has(name)) skipBlock();
          else fail(`unknown at-rule ${prelude.slice(0, 40)}`);
        } else rules.push({ selector: prelude, chain, declarations: readDeclarations() });
      } else if (char === '}') {
        if (chain.length === 0) fail('unbalanced closing brace');
        index += 1;
        return;
      } else if (char === ';') {
        const statement = collapse(text);
        text = '';
        index += 1;
        const name = /^@([\w-]+)/u.exec(statement)?.[1];
        if (!name || !statementAtRules.has(name)) fail(`a statement that is not an at-rule statement: ${statement.slice(0, 40)}`);
      } else {
        text += char;
        index += 1;
      }
    }
    if (chain.length > 0) fail('unbalanced opening brace');
    if (collapse(text) !== '') fail(`text outside a rule: ${collapse(text).slice(0, 40)}`);
  };
  walk([]);
  return { rules, blocks };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Selectors: one parser for the stylesheet's rules, the part map's selectors and the recipe's readers. It reads the syntax the shipped
// sheets use (a type or `*`, classes, attribute tests with `=` `^=` `$=` `*=` and an `i` flag, pseudo-classes and pseudo-elements,
// the four combinators, and `:not()` `:is()` `:where()` `:has()` of selectors) and throws on anything else, so a selector it does not
// understand fails a test and is never half-read.
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {object} AttributeTest
 * @property {string} name
 * @property {'' | '=' | '^=' | '$=' | '*='} operator The empty operator tests only that the attribute is present.
 * @property {string} [value]
 * @property {boolean} insensitive The `i` flag.
 */

/**
 * @typedef {object} Pseudo
 * @property {string} name Lower case, without the colon.
 * @property {Complex[] | null} selectors The argument of `:not()`, `:is()`, `:where()` and `:has()`; null for every other pseudo-class.
 */

/**
 * One compound selector, with the combinator that joins it to the compound before it.
 * @typedef {object} Compound
 * @property {string} [tag] Lower case; absent for no type and for `*`.
 * @property {string[]} classes
 * @property {AttributeTest[]} attributes
 * @property {Pseudo[]} pseudos
 * @property {string | null} element The pseudo-element the compound ends in (`before`), when it does.
 * @property {' ' | '>' | '+' | '~'} combinator
 */

/**
 * @typedef {object} Complex
 * @property {string} text The selector as written, trimmed.
 * @property {Compound[]} compounds Left to right; the last is the element the selector selects.
 */

/**
 * What one element must carry, as one selector says it.
 * @typedef {object} Facet
 * @property {string[]} classes
 * @property {AttributeTest[]} attributes
 */

const attributeOperators = new Set(['=', '^=', '$=', '*=']);
const selectorLists = new Map();

/**
 * A selector list as a tree. Throws on syntax the sheets do not use (an attribute operator beyond the four above, an id, a
 * namespace, an escape, `&`) instead of dropping what it cannot read: a dropped test would make a selector match more than it says.
 * @param {string} text
 * @returns {Complex[]}
 */
export function parseSelectorList(text) {
  const cached = selectorLists.get(text);
  if (cached) return cached;
  let index = 0;
  const fail = (message) => {
    throw new Error(`selector ${JSON.stringify(text)}: ${message} at ${index}`);
  };
  const skipSpace = () => { while (index < text.length && /\s/u.test(text[index])) index += 1; };
  const take = (pattern) => {
    pattern.lastIndex = index;
    const match = pattern.exec(text);
    if (match) index += match[0].length;
    return match?.[0] ?? null;
  };
  const name = () => take(/[\w-]+/uy) ?? fail('expected a name');
  /** Skips the argument of a pseudo-class this reader does not look into; its opening parenthesis was just consumed. */
  const skipArgument = () => {
    let depth = 1;
    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === '"' || char === '\'') {
        const close = text.indexOf(char, index + 1);
        if (close < 0) fail('unterminated string');
        index = close + 1;
        continue;
      }
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    if (depth > 0) fail('unbalanced parenthesis');
  };
  const attribute = () => {
    index += 1;
    skipSpace();
    const attributeName = name();
    skipSpace();
    if (text[index] === ']') { index += 1; return { name: attributeName, operator: '', insensitive: false }; }
    const operator = take(/[~|^$*]?=/uy) ?? fail('expected an attribute operator or ]');
    if (!attributeOperators.has(operator)) fail(`unsupported attribute operator ${operator}`);
    skipSpace();
    let value;
    if (text[index] === '"' || text[index] === '\'') {
      const close = text.indexOf(text[index], index + 1);
      if (close < 0) fail('unterminated string');
      value = text.slice(index + 1, close);
      index = close + 1;
    } else value = take(/[^\]\s]+/uy) ?? fail('expected an attribute value');
    if (value.includes('\\')) fail('an escape in an attribute value');
    skipSpace();
    const flag = take(/[is](?=\s*\])/iuy);
    skipSpace();
    if (text[index] !== ']') fail('expected ]');
    index += 1;
    return { name: attributeName, operator, value, insensitive: flag?.toLowerCase() === 'i' };
  };
  const pseudo = (compound) => {
    index += 1;
    if (text[index] === ':') {
      index += 1;
      compound.element = name().toLowerCase();
      if (text[index] === '(') { index += 1; skipArgument(); }
      return;
    }
    const pseudoName = name().toLowerCase();
    let selectors = null;
    if (text[index] === '(') {
      index += 1;
      if (['not', 'is', 'where', 'has'].includes(pseudoName)) {
        selectors = list(pseudoName === 'has');
        if (text[index] !== ')') fail('expected )');
        index += 1;
      } else skipArgument();
    }
    compound.pseudos.push({ name: pseudoName, selectors });
  };
  const compound = (combinator) => {
    const parsed = { classes: [], attributes: [], pseudos: [], element: null, combinator };
    const start = index;
    if (text[index] === '*') index += 1;
    else {
      const tag = take(/[a-zA-Z][\w-]*/uy);
      if (tag) parsed.tag = tag.toLowerCase();
    }
    for (;;) {
      if (text[index] === '.') { index += 1; parsed.classes.push(name()); }
      else if (text[index] === '[') parsed.attributes.push(attribute());
      else if (text[index] === ':') pseudo(parsed);
      else break;
    }
    if (index === start) fail('expected a selector');
    return parsed;
  };
  /** One complex selector; a `:has()` argument may start with a combinator. */
  const complex = (relative) => {
    skipSpace();
    const start = index;
    let combinator = ' ';
    if (relative && '>+~'.includes(text[index] ?? ' ')) { combinator = text[index]; index += 1; skipSpace(); }
    const compounds = [];
    for (;;) {
      compounds.push(compound(combinator));
      const end = index;
      skipSpace();
      const next = text[index];
      if (next === undefined || next === ',' || next === ')') return { text: text.slice(start, end), compounds };
      if ('>+~'.includes(next)) { combinator = next; index += 1; skipSpace(); }
      else if (index > end) combinator = ' ';
      else fail(`unexpected ${next}`);
    }
  };
  function list(relative) {
    const complexes = [complex(relative)];
    while (text[index] === ',') { index += 1; complexes.push(complex(relative)); }
    return complexes;
  }
  const parsed = list(false);
  if (index < text.length) fail(`unexpected ${text[index]}`);
  selectorLists.set(text, deepFreeze(parsed));
  return parsed;
}

/**
 * The elements a selector list describes, as the classes and attribute tests each carries. `subject` are the elements the list
 * selects, `context` the ones around them (ancestors, earlier siblings), `conditions` the ones `:has()` asks for. Every test belongs
 * to the compound it is written in: each branch of `:is()` and `:where()` stands alone, a test in `:not()` counts for the element
 * the `:not()` is on, and a test in `:has()` belongs to the element asked for, never to the element that asks.
 * @param {Complex[]} list
 * @returns {{ subject: Facet[], context: Facet[], conditions: Facet[] }}
 */
export function describeElements(list) {
  const found = { subject: [], context: [], conditions: [] };
  /** The facets of the last compound of `complex` (the element it selects); those of the compounds before it are added to `others`. */
  const subjectOf = (complex, others) => {
    let subject = [];
    complex.compounds.forEach((compound, position) => {
      const facets = facetsOf(compound, others);
      if (position === complex.compounds.length - 1) subject = facets;
      else others.push(...facets);
    });
    return subject;
  };
  const facetsOf = (compound, others) => {
    let branches = [{ classes: [...compound.classes], attributes: [...compound.attributes] }];
    for (const { name, selectors } of compound.pseudos) {
      if (name === 'is' || name === 'where') {
        branches = branches.flatMap((branch) => selectors.flatMap((inner) => subjectOf(inner, others)
          .map((facet) => ({ classes: [...branch.classes, ...facet.classes], attributes: [...branch.attributes, ...facet.attributes] }))));
      } else if (name === 'not') {
        const tests = selectors.flatMap((inner) => subjectOf(inner, []).flatMap(({ attributes }) => attributes));
        for (const branch of branches) branch.attributes.push(...tests);
      } else if (name === 'has') {
        for (const inner of selectors) found.conditions.push(...subjectOf(inner, found.conditions));
      }
    }
    return branches;
  };
  for (const complex of list) found.subject.push(...subjectOf(complex, found.context));
  return found;
}

/** Every class a selector list names, anywhere in it: inside `:not()` and `:has()` as well. */
function mentionedClasses(list) {
  return list.flatMap(({ compounds }) => compounds.flatMap((compound) => [
    ...compound.classes,
    ...compound.pseudos.flatMap(({ selectors }) => (selectors ? mentionedClasses(selectors) : [])),
  ]));
}

const muxClasses = (classes) => classes.filter((name) => name.startsWith('muxui-'));

// ---------------------------------------------------------------------------------------------------------------------------
// Observations: a server render of a catalog example, read into a small tree. The reader models what React's server renderer writes
// (balanced tags, quoted attributes, `<!-- -->` separators, inert `<template>` collection content) and throws on anything else.
// support/catalog-example-renders.mjs is the producer; the unit test cross-checks this tree with jsdom's on all 217 renders.
// ---------------------------------------------------------------------------------------------------------------------------

const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** Elements whose content is code, not text: it is kept on the element and never counted in an ancestor's text. */
const codeElements = new Set(['script', 'style']);
/** Elements whose content is text with entities and no markup (the HTML parser's RCDATA): a `<textarea>`'s value, a `<title>`. */
const textOnlyElements = new Set(['textarea', 'title']);
const namedEntities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
const decode = (text) => text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/giu, (whole, hex, decimal, name) => hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : decimal ? String.fromCodePoint(Number(decimal)) : namedEntities[name] ?? whole);

/**
 * @typedef {object} ObservedElement
 * @property {string} tag
 * @property {Map<string, string>} attributes
 * @property {string[]} classes
 * @property {ObservedElement | null} parent
 * @property {(ObservedElement | string)[]} nodes Child elements and text, in order.
 * @property {string} text All descendant text, entities decoded (the DOM's `textContent`), without the content of a descendant
 *   `<script>` or `<style>`, which is code. A `<textarea>` and a `<title>` hold their content as text.
 */

/**
 * The live elements of a server render, in document order. Elements inside a `<template>` are inert (React Aria renders its collection
 * there) and are left out, as a browser leaves them out of `querySelectorAll`.
 * @param {string} html
 * @returns {{ elements: ObservedElement[] }}
 */
export function parseObservation(html) {
  const root = { tag: '#root', attributes: new Map(), classes: [], parent: null, nodes: [], text: '', inert: false };
  const elements = [];
  let current = root;
  let index = 0;
  const fail = (message) => {
    throw new Error(`observation HTML: ${message} at ${index}: ${html.slice(Math.max(0, index - 20), index + 30)}`);
  };
  /** Adds a text node to `holder` and its text to every ancestor's; a template's content is inert and holds none. */
  const addText = (holder, text) => {
    if (holder.inert || text === '') return;
    holder.nodes.push(text);
    for (let node = holder; node.tag !== '#root'; node = node.parent) node.text += text;
  };
  while (index < html.length) {
    if (html.startsWith('<!--', index)) {
      const end = html.indexOf('-->', index + 4);
      if (end < 0) fail('unterminated comment');
      index = end + 3;
    } else if (html.startsWith('</', index)) {
      const end = html.indexOf('>', index);
      if (end < 0) fail('unterminated end tag');
      const name = html.slice(index + 2, end).trim().toLowerCase();
      if (current.tag !== name) fail(`end tag ${name} closes ${current.tag}`);
      current = current.parent;
      index = end + 1;
    } else if (html[index] === '<' && /[a-zA-Z]/u.test(html[index + 1] ?? '')) {
      let cursor = index + 1;
      while (cursor < html.length && /[^\s/>]/u.test(html[cursor])) cursor += 1;
      const tag = html.slice(index + 1, cursor).toLowerCase();
      const attributes = new Map();
      let selfClosing = false;
      for (;;) {
        while (cursor < html.length && /\s/u.test(html[cursor])) cursor += 1;
        if (cursor >= html.length) { index = cursor; fail('unterminated tag'); }
        if (html[cursor] === '>') { cursor += 1; break; }
        if (html[cursor] === '/' && html[cursor + 1] === '>') { selfClosing = true; cursor += 2; break; }
        let end = cursor;
        while (end < html.length && /[^\s=/>]/u.test(html[end])) end += 1;
        const name = html.slice(cursor, end);
        if (name === '') { index = cursor; fail('an attribute without a name'); }
        cursor = end;
        let value = '';
        if (html[cursor] === '=') {
          cursor += 1;
          if (html[cursor] === '"' || html[cursor] === '\'') {
            const close = html.indexOf(html[cursor], cursor + 1);
            if (close < 0) { index = cursor; fail('unterminated attribute value'); }
            value = decode(html.slice(cursor + 1, close));
            cursor = close + 1;
          } else {
            end = cursor;
            while (end < html.length && /[^\s>]/u.test(html[end])) end += 1;
            value = decode(html.slice(cursor, end));
            cursor = end;
          }
        }
        attributes.set(name, value);
      }
      const element = { tag, attributes, classes: (attributes.get('class') ?? '').split(/\s+/u).filter(Boolean), parent: current, nodes: [], text: '', inert: current.inert };
      if (!current.inert) { current.nodes.push(element); elements.push(element); }
      index = cursor;
      if ((codeElements.has(tag) || textOnlyElements.has(tag)) && !selfClosing) {
        const end = html.indexOf(`</${tag}`, index);
        if (end < 0) fail(`unterminated ${tag}`);
        const content = html.slice(index, end);
        if (codeElements.has(tag)) element.text = content;
        // The HTML parser drops one newline right after `<textarea>`, and React writes one back when the value starts with one.
        else addText(element, decode(tag === 'textarea' ? content.replace(/^\r?\n/u, '') : content));
        index = html.indexOf('>', end) + 1;
      } else if (!selfClosing && !voidElements.has(tag)) {
        current = element;
        if (tag === 'template') element.inert = true;
      }
    } else {
      const next = html.indexOf('<', index + 1);
      const end = next < 0 ? html.length : next;
      addText(current, decode(html.slice(index, end)));
      index = end;
    }
  }
  if (current !== root) fail(`unclosed ${current.tag}`);
  return { elements };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Matching a selector against an observation. A match is `true`, `false` or `null` (unknown): a pseudo-class the caller does not model
// makes its compound unknown, and unknown stays unknown through every combination, negation included, instead of becoming a
// definite no.
// ---------------------------------------------------------------------------------------------------------------------------

/** What a pseudo-class does when the caller supplies no model for it. */
const refusePseudo = ({ name }) => {
  throw new Error(`:${name} is not modelled`);
};

function attributeMatches({ name, operator, value, insensitive }, element) {
  const actual = element.attributes.get(name);
  if (actual === undefined) return false;
  if (operator === '') return true;
  const [left, right] = insensitive ? [actual.toLowerCase(), value.toLowerCase()] : [actual, value];
  if (operator === '=') return left === right;
  // CSS: a prefix, suffix or substring test with an empty value matches nothing.
  if (right === '') return false;
  return operator === '^=' ? left.startsWith(right) : operator === '$=' ? left.endsWith(right) : left.includes(right);
}

/** Whether `element` is what one compound describes: `true`, `false`, or `null` when a pseudo-class decides and is unknown. */
function matchCompound(compound, element, pseudo) {
  if (compound.element !== null) return false;
  if (compound.tag !== undefined && element.tag !== compound.tag) return false;
  if (!compound.classes.every((name) => element.classes.includes(name))) return false;
  if (!compound.attributes.every((test) => attributeMatches(test, element))) return false;
  let result = true;
  for (const entry of compound.pseudos) {
    const decided = pseudo(entry, element);
    if (decided === false) return false;
    if (decided === null) result = null;
  }
  return result;
}

const elementsOf = (parent) => parent.nodes.filter((node) => typeof node !== 'string');

/** Whether `element` is the compound at `position` and the elements before it satisfy the compounds before that. */
function matchAt(compounds, position, element, pseudo) {
  const own = matchCompound(compounds[position], element, pseudo);
  if (own === false || position === 0) return own;
  const { combinator } = compounds[position];
  let related = [];
  if (combinator === '>') related = element.parent.tag === '#root' ? [] : [element.parent];
  else if (combinator === ' ') for (let node = element.parent; node.tag !== '#root'; node = node.parent) related.push(node);
  else {
    const siblings = elementsOf(element.parent);
    const before = siblings.slice(0, siblings.indexOf(element));
    related = combinator === '+' ? before.slice(-1) : before;
  }
  let outer = false;
  for (const candidate of related) {
    const found = matchAt(compounds, position - 1, candidate, pseudo);
    if (found === true) { outer = true; break; }
    if (found === null) outer = null;
  }
  return outer === false ? false : own === null || outer === null ? null : true;
}

/**
 * Whether a complex selector matches an observed element. `pseudo(entry, element)` answers for each pseudo-class and may return
 * `true`, `false` or `null`; without it, a pseudo-class is an error.
 * @param {Complex} complex
 * @param {ObservedElement} element
 * @param {(entry: Pseudo, element: ObservedElement) => boolean | null} [pseudo]
 * @returns {boolean | null}
 */
export function matchComplex(complex, element, pseudo = refusePseudo) {
  return matchAt(complex.compounds, complex.compounds.length - 1, element, pseudo);
}

/**
 * The elements of a parsed render that match a chain of compounds joined by descendant or child combinators, in document order. A
 * list, a sibling combinator or a pseudo-class is refused: the part map's selectors are chains, and a reader that quietly ignored the
 * rest would select more than the selector says.
 */
export function selectObserved(parsed, selector) {
  const list = parseSelectorList(selector);
  const [complex] = list;
  if (list.length !== 1 || complex.compounds.some((compound, position) => compound.pseudos.length > 0 || compound.element !== null || (position > 0 && compound.combinator !== ' ' && compound.combinator !== '>'))) {
    throw new Error(`selector ${selector} is not a chain of compounds`);
  }
  return parsed.elements.filter((element) => matchComplex(complex, element) === true);
}

// ---------------------------------------------------------------------------------------------------------------------------
// The facts: the five sources, read once from `root`.
// ---------------------------------------------------------------------------------------------------------------------------

/** Property names of the three attributes a "not set by" row can name; a family that spells one in its runtime source writes it. */
const reflectedProbeNames = Object.freeze(['size', 'variant', 'color']);
/** The README section the override text is read from, and the shape it must keep. */
const cascadeHeading = '## Cascade layers';

/**
 * The README's cascade text, verbatim: three paragraphs, the sentence that introduces the layer statement, its code block and the
 * closing sentence. A README that stops having this shape fails here, so the docs never print a half of it.
 * @param {string} readme
 */
export function readCascadeText(readme) {
  const start = readme.indexOf(`\n${cascadeHeading}\n`);
  if (start < 0) throw new Error(`README.md has no "${cascadeHeading}" section`);
  const rest = readme.slice(start + cascadeHeading.length + 2);
  const end = rest.search(/^## /mu);
  const blocks = (end < 0 ? rest : rest.slice(0, end)).trim().split(/\n\n+/u);
  const fence = blocks.findIndex((block) => block.startsWith('```'));
  const closing = blocks.slice(fence + 1);
  if (blocks.length !== 6 || fence !== 4 || closing.length !== 1 || !blocks[4].endsWith('```')) {
    throw new Error(`README.md "${cascadeHeading}" is not three paragraphs, a layer introduction, a code block and a closing sentence`);
  }
  const layerCode = blocks[4].replace(/^```[a-z]*\n/u, '').replace(/\n```$/u, '');
  if (!layerCode.startsWith('@layer ')) throw new Error(`README.md "${cascadeHeading}" code block is not the layer statement`);
  const sentences = blocks[2].split(/(?<=\.) (?=[A-Z])/u);
  const limit = sentences.at(-1);
  if (!limit.startsWith('It protects only the properties it names')) throw new Error(`README.md "${cascadeHeading}" no longer ends its !important paragraph with the property limit`);
  return { paragraphs: blocks.slice(0, 3), layerIntro: blocks[3], layerCode, layerClosing: closing[0], limit };
}

/**
 * What motion.mjs reads to decide that motion is reduced, so the printed paragraph is the code's, not a recollection of it.
 * @param {string} motion The text of packages/react/src/motion.mjs.
 * @param {string} overlays The text of packages/react/src/overlays.ts.
 */
export function readMotionInputs(motion, overlays) {
  const mediaQuery = /matchMedia\('\((prefers-reduced-motion: reduce)\)'\)/u.exec(motion)?.[1];
  const scope = /getAttribute\('(data-muxui-motion)'\) === '(reduced)'/u.exec(motion);
  const marker = /toggleAttribute\('(data-muxui-motion-reduced)'/u.exec(overlays)?.[1];
  // The node's ancestors, and the trigger's: an overlay is reduced by a scope on either side.
  const triggerToo = /hasReducedScope\(node\) \|\| hasReducedScope\(triggerNode\)/u.test(motion);
  if (!mediaQuery || !scope || !marker || !triggerToo) throw new Error('motion.mjs and overlays.ts no longer read the reduced-motion inputs the override paragraph describes');
  return { mediaQuery, scopeAttribute: scope[1], scopeValue: scope[2], marker };
}

/** The seven rows of the What-wins table. The Chromium test `styling-overrides` runs each against the shipped stylesheet. */
export const whoWinsRows = deepFreeze([
  { id: 1, declaration: 'Unlayered rule, normal', against: 'Mux rule in `muxui.components`', winner: 'You' },
  { id: 2, declaration: 'Rule in `@layer muxui.utilities`, normal', against: 'Mux rule in `muxui.components`', winner: 'You' },
  { id: 3, declaration: 'Rule in your layer ranked after `muxui.components`, normal. Your layer is ranked after when your order statement lists it after Mux\'s layers, or when it is first named after them (CSS that loads after Mux and names no order)', against: 'Mux rule in `muxui.components`', winner: 'You' },
  { id: 4, declaration: 'Rule in your layer ranked before `muxui.components`, normal. Your layer is ranked before when your order statement lists it first, or when it is first named before Mux\'s CSS loads', against: 'Mux rule in `muxui.components`', winner: 'Mux' },
  { id: 5, declaration: 'Any normal declaration', against: 'Mux `!important` (forced colors, reduced motion)', winner: 'Mux' },
  { id: 6, declaration: '`!important` unlayered, in `muxui.utilities` or in a layer ranked after Mux\'s', against: 'Mux `!important`', winner: 'Mux' },
  { id: 7, declaration: '`!important` in a layer ranked before Mux\'s (`reset`, `muxui.tokens`) or inline `style`', against: 'Mux `!important`', winner: 'You, but do not' },
]);

/** The authored stylesheets under packages/react/src, as repository-relative paths. */
function authoredStylesheets(root) {
  const base = join(root, 'packages/react/src');
  return readdirSync(base, { recursive: true }).filter((path) => String(path).endsWith('.css')).map((path) => `packages/react/src/${String(path).split('\\').join('/')}`).sort();
}

/**
 * @typedef {object} StylingFacts
 * Opaque: pass it to `stylingFor` or `componentReference`. Its fields are read-only and may change; the contract is `FamilyStyling`.
 */

/**
 * Reads the styling sources from a repository root: the part map and the state classification, the built stylesheet, the token
 * graph, the README's cascade text and the motion code. The part map and the token core are imported from `root`, not from this
 * file's own repository, so a copy of the repository with one source changed is what the facts describe.
 * @param {string} [root] The repository root; this repository by default.
 * @returns {Promise<StylingFacts>}
 */
export async function readStylingFacts(root = defaultRoot) {
  const load = (path) => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href);
  const [partMap, contract, core] = await Promise.all([
    load('packages/react/test/support/styling-parts.ts'),
    load('packages/react/src/styling-contract.ts'),
    load('packages/tokens/src/core.mjs'),
  ]);
  const text = (path) => {
    const file = join(root, path);
    if (!existsSync(file)) throw new Error(`${path} is missing under ${root}${path.includes('/generated/') ? ' (run pnpm generate)' : ''}`);
    return readFileSync(file, 'utf8');
  };

  const stylesheet = readStyleRules(text('packages/react/generated/styles.css'));
  const rules = stylesheet.rules.filter(({ chain }) => chain.some((prelude) => prelude === '@layer muxui.components')).map((rule) => ({ ...rule, selectors: parseSelectorList(rule.selector) }));
  const authored = authoredStylesheets(root).map((path) => ({
    path,
    // The classes a file's rules style: those of each selector's subject (the element it selects), not of its ancestors.
    classes: new Set(readStyleRules(text(path)).rules.flatMap(({ selector }) => describeElements(parseSelectorList(selector)).subject.flatMap(({ classes }) => muxClasses(classes)))),
  }));

  // Which classes the stylesheet selects, and which attributes (with the values of an equality test) on an element that carries the
  // class. A test belongs to the element of the compound it is written in (see `describeElements`).
  const selectedClasses = new Set();
  const selection = new Map();
  for (const { selectors } of rules) {
    const { subject, context, conditions } = describeElements(selectors);
    for (const { classes } of [...subject, ...context]) for (const name of muxClasses(classes)) selectedClasses.add(name);
    for (const { classes, attributes } of [...subject, ...context, ...conditions]) {
      for (const { name, operator, value } of attributes) {
        if (!name.startsWith('data-muxui-')) continue;
        const byClass = selection.get(name) ?? new Map();
        for (const className of muxClasses(classes)) {
          const values = byClass.get(className) ?? new Set();
          if (operator === '=') values.add(value);
          byClass.set(className, values);
        }
        selection.set(name, byClass);
      }
    }
  }

  // The rules that mark a declaration !important, by what they are for. The cause is read from the selector as well as the at-rule
  // chain: Button's reduced-motion rules that key on the scope attribute sit in no media query.
  const causeOf = ({ selector, chain }) => {
    if (chain.some((prelude) => /^@media[^{]*forced-colors/u.test(prelude))) return 'forced-colors';
    if (chain.some((prelude) => /^@media[^{]*prefers-reduced-motion/u.test(prelude))) return 'reduced-motion-media';
    if (/\[data-muxui-motion=['"]reduced['"]\]|\[data-muxui-motion-reduced/u.test(selector)) return 'reduced-motion-attribute';
    return 'other';
  };
  const important = rules.flatMap((rule) => {
    const count = rule.declarations.filter(({ important: flag }) => flag).length;
    return count === 0 ? [] : [{ classes: new Set(muxClasses(mentionedClasses(rule.selectors))), count, cause: causeOf(rule) }];
  });

  // The tokens: light and dark graphs, which custom properties each token declares, and which rules read a custom property.
  const source = JSON.parse(text('catalog/tokens/default-theme.json'));
  const graph = (modes) => core.compilePureTokenGraph(source, { modes: { ...source.theme.defaultModes, ...modes }, responsive: false });
  const light = graph({});
  const dark = graph({ colorScheme: 'dark' });
  const declaredNames = (id) => [...core.cssDeclaration(light.tokens[id], light.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu)].map(([, name]) => name);
  const reads = new Map();
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      for (const [, name] of value.matchAll(/var\(\s*(--muxui-[\w-]+)/gu)) {
        reads.set(name, [...(reads.get(name) ?? []), { selector: rule.selector, chain: rule.chain, property }]);
      }
    }
  }
  const dependents = new Map();
  for (const id of Object.keys(light.tokens)) {
    for (const dependency of light.dependencies[id] ?? []) dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
  }

  // How each component role is read: by a rule, through its structured parts, through a token that depends on it, or by nothing.
  // A role nothing reads is searched for in the catalog's own examples, which may read it themselves.
  const documentedHook = (name) => partMap.partRows.some((row) => row.hook === name && ['class', 'root-element', 'field', 'composed'].includes(row.disposition)) || partMap.publicSharedClasses.includes(name);
  const readOf = (name) => (reads.get(name) ?? []).map(({ selector, chain, property }) => ({
    selector,
    conditions: chain.filter((prelude) => prelude !== '@layer muxui.components'),
    property,
    public: muxClasses(mentionedClasses(parseSelectorList(selector))).every(documentedHook),
  }));
  const isRead = (name) => (reads.get(name) ?? []).length > 0;
  const exampleFiles = readdirSync(join(root, 'catalog/components'), { recursive: true }).map(String).filter((path) => /^[^/]+\/examples\/react\/[^/]+\.tsx$/u.test(path)).sort();
  const stripCodeComments = (code) => code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gmu, '');
  const tokenReads = new Map();
  for (const id of Object.keys(light.tokens).filter((token) => token.startsWith('component.'))) {
    const base = core.cssName(id);
    const names = declaredNames(id);
    const dependentRead = (token, seen = new Set()) => !seen.has(token) && (seen.add(token), (dependents.get(token) ?? []).flatMap((next) => (declaredNames(next).some(isRead) ? [next] : dependentRead(next, seen))));
    const through = unique(dependentRead(id));
    let readBy;
    if (isRead(base)) {
      readBy = { kind: 'rules', selectors: unique(names.flatMap(readOf).map(JSON.stringify)).map(JSON.parse), through: [] };
    } else if (names.some(isRead)) {
      readBy = { kind: 'parts', selectors: unique(names.flatMap(readOf).map(JSON.stringify)).map(JSON.parse), through: names.filter(isRead) };
    } else if (through.length > 0) {
      readBy = { kind: 'compiled', selectors: [], through };
    } else {
      const readers = exampleFiles.filter((path) => stripCodeComments(readFileSync(join(root, 'catalog/components', path), 'utf8')).includes(`var(${base})`)).map((path) => `catalog/components/${path}`);
      readBy = { kind: 'none', selectors: [], through: [], examples: readers };
    }
    tokenReads.set(id, readBy);
  }

  // Documented hooks, and which family writes which of size, variant and color in its own runtime source.
  const documented = ['class', 'root-element', 'field', 'composed'];
  const publicHooks = new Set(partMap.partRows.filter((row) => row.hook !== undefined && documented.includes(row.disposition)).map((row) => row.hook));
  const runtime = JSON.parse(text('packages/react/generated/r1-6-contract.json').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
  const runtimeText = new Map();
  const runtimeWrites = new Map(runtime.components.map(({ slug, source: path }) => {
    if (!runtimeText.has(path)) runtimeText.set(path, text(path));
    return [slug, new Set(reflectedProbeNames.filter((name) => new RegExp(`data-muxui-${name}(?![\\w-])`, 'u').test(runtimeText.get(path))))];
  }));
  const runtimeSource = new Map(runtime.components.map(({ slug, source: path }) => [slug, path]));

  const motion = readMotionInputs(text('packages/react/src/motion.mjs'), text('packages/react/src/overlays.ts'));
  const countIn = (pattern) => stylesheet.rules.reduce((total, { selector }) => total + (selector.match(pattern) ?? []).length, 0);
  const motionCauses = {
    markerSelectors: countIn(/\[data-muxui-motion-reduced/gu),
    scopeAttributeSelectors: countIn(/\[data-muxui-motion=['"]reduced['"]\]/gu),
    mediaBlocks: stylesheet.blocks.filter(({ prelude }) => /^@media[^{]*prefers-reduced-motion/u.test(prelude)).length,
  };

  const cascade = readCascadeText(text('packages/react/README.md'));
  return Object.freeze({
    root,
    parts: partMap,
    contract,
    rules,
    authored,
    selectedClasses,
    selection,
    important,
    tokens: { core, source, light, dark, declaredNames, reads, dependents, tokenReads },
    publicHooks,
    runtimeWrites,
    runtimeSource,
    motion,
    motionCauses,
    cascade,
    importantTotals: {
      declarations: stylesheet.rules.reduce((total, rule) => total + rule.declarations.filter(({ important: flag }) => flag).length, 0),
      rules: stylesheet.rules.filter((rule) => rule.declarations.some(({ important: flag }) => flag)).length,
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// One family.
// ---------------------------------------------------------------------------------------------------------------------------

const documentedDispositions = ['class', 'root-element', 'field', 'composed'];
const tagText = (tags) => tags.map((tag) => `<${tag}>`).join(', ');
const listText = (list) => list.join(', ');

/**
 * What a family's observations show: each render parsed once, the elements of each part with an element, the family's root elements,
 * and the public root hooks that sit on every one of them (companions).
 */
function observeFamily({ slug, rows, observations, facts }) {
  const { selectorOf } = facts.parts;
  const renders = observations.filter((observation) => observation.family === slug).map(({ source, html }) => ({ source, parsed: parseObservation(html) }));
  const withElement = rows.filter((row) => row.disposition !== 'none' && row.disposition !== 'internal');
  const rootRow = rows.find((row) => row.part === 'root') ?? rows.find((row) => row.disposition === 'root-element');
  const rootSelector = rootRow && rootRow.disposition !== 'none' ? selectorOf(rootRow) : null;
  /** @type {Map<string, { source: string, elements: ObservedElement[], roots: ObservedElement[] }[]>} */
  const matches = new Map(withElement.map((row) => [row.part, renders.map(({ source, parsed }) => ({
    source,
    elements: selectObserved(parsed, selectorOf(row)),
    roots: rootSelector ? selectObserved(parsed, rootSelector) : [],
  })).filter(({ elements }) => elements.length > 0)]));
  // A public root class on every observed root element of the family: IconButton's root is also a Button.
  const rootHooks = new Map(facts.parts.partRows.filter((row) => row.family !== slug && (row.part === 'root' || row.disposition === 'root-element') && row.disposition !== 'none' && row.disposition !== 'internal' && row.hook).map((row) => [row.hook, row.family]));
  const rootMatches = matches.get(rootRow?.part) ?? [];
  const rootElements = rootMatches.flatMap(({ elements }) => elements);
  // A root the caller supplies may be a native element that carries no companion, so a render cannot prove one for it.
  const companions = rootElements.length === 0 || rootRow?.callerSupplied !== undefined ? [] : [...rootHooks].filter(([hook]) => rootElements.every((element) => element.classes.includes(hook)))
    .map(([hook, owner]) => ({ hook, owner, sources: rootMatches.map(({ source }) => source) }));
  return { renders, matches, rootRow, rootElements: new Map(renders.map(({ source }) => [source, rootMatches.find((match) => match.source === source)?.elements ?? []])), companions };
}

/** Whether an observed element has an ancestor among `roots`. */
const insideAny = (element, roots) => { for (let node = element.parent; node && node.tag !== '#root'; node = node.parent) if (roots.includes(node)) return true; return false; };

/**
 * The parts of a family whose documented hook a rule selects with `attribute`, in anatomy order. A companion hook the root element also
 * carries adds the root part when no hook of the family's own selects the attribute there.
 */
function selectedParts({ attribute, rows, observed, facts }) {
  const byClass = facts.selection.get(attribute);
  if (!byClass) return { parts: [], internal: [], companion: null };
  const own = rows.filter((row) => documentedDispositions.includes(row.disposition) && byClass.has(row.hook)).map((row) => row.part);
  const internal = unique(rows.filter((row) => row.disposition === 'internal' && byClass.has(row.hook)).map((row) => row.part));
  const rootPart = observed.rootRow?.part;
  const found = observed.companions.find(({ hook }) => byClass.has(hook));
  const companion = found && rootPart && !own.includes(rootPart) ? found : null;
  const parts = unique(companion ? [...own, rootPart] : own);
  return { parts: rows.map((row) => row.part).filter((part) => parts.includes(part)), internal, companion };
}

/** The parts with an element in some render that carries `attribute`, and the renders that show it. */
function emittedParts({ attribute, rows, observed }) {
  const parts = [];
  const sources = [];
  for (const row of rows) {
    for (const { source, elements } of observed.matches.get(row.part) ?? []) {
      if (elements.some((element) => element.attributes.has(attribute))) {
        if (!parts.includes(row.part)) parts.push(row.part);
        if (!sources.includes(source)) sources.push(source);
      }
    }
  }
  return { parts, sources };
}

/** The final text of the On cell of a state or reflected row: emitted parts, then selected-only parts marked `styled`. */
function onText(emittedOn, selectedOn) {
  const styledOnly = selectedOn.filter((part) => !emittedOn.includes(part));
  return [...emittedOn, ...styledOnly.map((part) => `${part} styled`)].join(', ') || '-';
}

/** The note of a class row. One function builds every note so the docs and Storybook print the same words. */
function classNote(row, { qualifierTag, owner, rootHook, observedAnywhere, hasRenders }) {
  const sentences = [];
  if (row.disposition === 'none') return `Renders no element (${noElementPhrases[row.reason]}).`;
  if (row.disposition === 'internal') return 'Internal: no hook.';
  sentences.push(`Anatomy ${row.part}.`);
  if (row.disposition === 'root-element') sentences.push(`The ${row.family} root${qualifierTag ? ` as a native ${qualifierTag}` : ' element'}.`);
  if (row.disposition === 'field') sentences.push(`Shared field part, scoped by ${row.selector ? row.selector.slice(0, row.selector.lastIndexOf(' ')) : `.${rootHook}`}.`);
  if (row.disposition === 'composed') sentences.push(`Composed from ${pascal(owner)}: select ${row.selector ?? `.${row.hook}`}.`);
  if (row.callerSupplied !== undefined) sentences.push(row.callerSupplied);
  else if (row.composedOf !== undefined) sentences.push(`Composed from ${pascal(row.composedOf)}: also carries .muxui-${row.composedOf}.`);
  if (row.exception !== undefined) sentences.push(row.exception);
  if (row.hookOnly !== undefined) sentences.push('Hook only: no Mux rule styles it.');
  if (hasRenders && !observedAnywhere) sentences.push('Not in a catalog example.');
  return sentences.join(' ');
}

function hookRows({ slug, rows, observed, facts }) {
  const { selectorOf, partRows } = facts.parts;
  const root = rows.find((row) => row.part === 'root');
  const rootHook = root?.hook ?? facts.parts.partClass(slug, 'root');
  const ownerOf = (hook) => partRows.find((row) => row.hook === hook && ['class', 'root-element'].includes(row.disposition))?.family;
  const hasRenders = observed.renders.length > 0;
  return rows.map((row) => {
    const selector = row.disposition === 'none' ? null : selectorOf(row);
    const documented = documentedDispositions.includes(row.disposition);
    const found = documented ? (observed.matches.get(row.part) ?? []) : [];
    const elements = found.flatMap(({ elements: list }) => list);
    const tags = unique(elements.map(({ tag }) => tag));
    const qualifierTag = row.disposition === 'root-element' && row.selector ? /^([a-z]+)\./u.exec(row.selector)?.[1] : undefined;
    const roots = [...observed.rootElements.values()].flat();
    const inRoot = row.part !== 'root' && elements.length > 0 && elements.every((element) => insideAny(element, roots));
    const on = row.disposition === 'none' || row.disposition === 'internal' ? '-'
      : row.callerSupplied !== undefined ? 'caller\'s element'
        : tags.length > 0 ? `${tagText(tags)}${inRoot ? ' in root' : ''}`
          : qualifierTag ? tagText([qualifierTag]) : '-';
    return {
      kind: 'class',
      hook: documented ? selector : null,
      part: row.part,
      disposition: row.disposition,
      origin: 'part',
      selectedOn: documented && facts.selectedClasses.has(row.hook) ? [row.part] : [],
      emittedOn: elements.length > 0 ? [row.part] : [],
      tags,
      inRoot,
      on,
      ...(qualifierTag && { qualifier: qualifierTag }),
      ...(row.callerSupplied !== undefined && { conditional: row.callerSupplied }),
      ...(row.composedOf !== undefined && { composedOf: row.composedOf }),
      ...(row.hookOnly !== undefined && { hookOnly: true }),
      ...(row.disposition === 'none' && { noElement: row.reason }),
      note: classNote(row, { qualifierTag, owner: ownerOf(row.hook) ?? slug, rootHook, observedAnywhere: elements.length > 0, hasRenders: hasRenders && documented }),
      provenance: found.map(({ source }) => source),
    };
  });
}

/** Where a catalog state name lands: an attribute, or nothing (a prop, an environment, a derived state). */
function catalogAttributes(states, facts) {
  const attributes = new Map();
  for (const name of states) {
    const classification = facts.parts.catalogStateKinds[name];
    if (!classification) throw new Error(`catalog state ${name} is not classified`);
    const [kind, ...target] = classification;
    const attribute = kind === 'state' || kind === 'enum' ? `data-muxui-state-${target[0]}` : kind === 'status' ? `data-muxui-${target[0]}` : null;
    if (attribute === null) continue;
    attributes.set(attribute, { kind, names: [...(attributes.get(attribute)?.names ?? []), name], enumeration: kind === 'enum' ? target[0] : attributes.get(attribute)?.enumeration });
  }
  return attributes;
}

/**
 * Every state attribute a stylesheet rule selects on a hook of the family, declared or not. `own` counts only the family's own class and
 * root-element hooks and its root companions, which is where an undeclared interaction state is attributed to it. `wide` also counts
 * the shared field hooks and the composed roots: those add selection evidence to a row that exists, and never a row of their own,
 * because a shared hook is selected for the states of every family that uses it.
 */
function styledStateAttributes({ rows, observed, facts }) {
  const hooksOf = (dispositions) => new Set([...rows.filter((row) => dispositions.includes(row.disposition) && row.hook).map((row) => row.hook), ...observed.companions.map(({ hook }) => hook)]);
  const states = [...facts.selection].filter(([attribute]) => attribute.startsWith('data-muxui-state-'));
  const styledOn = (hooks) => states.filter(([, byClass]) => [...byClass.keys()].some((name) => hooks.has(name))).map(([attribute]) => attribute);
  return { own: styledOn(hooksOf(['class', 'root-element'])), wide: styledOn(hooksOf(documentedDispositions)) };
}

function stateRows({ artifact, rows, observed, facts }) {
  const declared = catalogAttributes(artifact.states, facts);
  const styled = styledStateAttributes({ rows, observed, facts });
  const enumerated = facts.contract.enumeratedStates;
  const base = ({ attribute, origin, names, note }) => {
    const selected = selectedParts({ attribute, rows, observed, facts });
    const emitted = emittedParts({ attribute, rows, observed });
    const enumeration = declared.get(attribute)?.enumeration ?? (attribute.startsWith('data-muxui-state-') && Object.hasOwn(enumerated, attribute.slice('data-muxui-state-'.length)) ? attribute.slice('data-muxui-state-'.length) : undefined);
    return {
      kind: 'state',
      hook: attribute,
      origin,
      selectedOn: selected.parts,
      emittedOn: emitted.parts,
      tags: [],
      inRoot: false,
      on: onText(emitted.parts, selected.parts),
      ...(enumeration && { values: [...enumerated[enumeration]] }),
      ...(names && { catalog: names }),
      note: note({ selected, emitted, names }),
      provenance: emitted.sources,
    };
  };
  const out = [];
  for (const [attribute, { kind, names }] of declared) {
    out.push(base({
      attribute,
      origin: 'catalog',
      names,
      note: ({ selected }) => {
        if (kind === 'status') return 'Status row from the catalog.';
        const label = `Catalog state${names.length > 1 ? 's' : ''} ${listText(names)}.`;
        if (selected.parts.length > 0) return `${label} Styled by Mux on ${listText(selected.parts)}.`;
        if (selected.internal.length > 0) return `${label} Selected by Mux CSS only on an internal part (${listText(selected.internal)}), which has no documented hook.`;
        return `${label} No Mux rule selects this attribute on a documented hook.`;
      },
    }));
  }
  const named = (attribute) => attribute.slice('data-muxui-state-'.length);
  for (const attribute of interactionStates.map((name) => `data-muxui-state-${name}`).filter((attribute) => styled.own.includes(attribute) && !declared.has(attribute))) {
    out.push(base({
      attribute,
      origin: 'interaction',
      note: ({ selected }) => `Interaction state. Selected by Mux CSS on ${listText(selected.parts)}. Not declared in the catalog for this component. It appears on an element only while React Aria reports that state for it; not every hook reports every state.`,
    }));
  }
  for (const attribute of styled.wide.filter((candidate) => !declared.has(candidate) && !interactionStates.includes(named(candidate))).sort()) {
    const emitted = emittedParts({ attribute, rows, observed });
    if (emitted.parts.length === 0) continue;
    out.push(base({ attribute, origin: 'observed', note: () => `Styled by Mux and observed in ${listText(emitted.sources)}; not declared in the catalog.` }));
  }
  return out;
}

/**
 * Attributes a stylesheet selects on a documented hook of the family that the catalog does not declare, are not an interaction state
 * and that no supplied render shows. They are not printed; the derivation test reports them as drift between the catalog and the CSS.
 */
export function undeclaredUnobservedStates({ slug, artifact, facts, observations = [] }) {
  const rows = facts.parts.partRows.filter((row) => row.family === slug);
  const observed = observeFamily({ slug, rows, observations, facts });
  const declared = catalogAttributes(artifact.states, facts);
  return styledStateAttributes({ rows, observed, facts }).wide
    .filter((attribute) => !declared.has(attribute) && !interactionStates.includes(attribute.slice('data-muxui-state-'.length)) && emittedParts({ attribute, rows, observed }).parts.length === 0)
    .sort();
}

/**
 * The values and default of a reflected prop: the declared enum, else the declared literal union (resolving a named type through the
 * derived API), else the values the stylesheet selects, with no default. A named type that does not resolve to literals is an error:
 * the stylesheet's partial list would pass for the real one (TextField's omits `md`).
 */
function propValues({ api, prop, stylesheetValues }) {
  const detail = api.propDetails?.[prop];
  const literals = (members) => {
    const values = members.filter(({ kind }) => kind !== 'undefined' && kind !== 'null');
    return values.length > 0 && values.every(({ kind }) => kind === 'literal') ? values.map(({ value }) => String(value)) : null;
  };
  let values = detail?.enum ? detail.enum.map(String) : null;
  if (values === null && detail?.type?.kind === 'union') values = literals(detail.type.members);
  if (values === null && detail?.type?.kind === 'reference') {
    const target = api.types?.[detail.type.name]?.type;
    values = target?.kind === 'union' ? literals(target.members) : null;
    if (values === null) throw new Error(`${prop}: the type ${detail.type.name} does not resolve to a union of literals in the derived API`);
  }
  if (values !== null) return { values, default: api.defaults?.[prop] === undefined ? undefined : String(api.defaults[prop]) };
  return { values: [...stylesheetValues], default: undefined };
}

function reflectedRows({ artifact, name, rows, observed, facts }) {
  const api = artifact.bindings['web.react'].api;
  const props = new Set(api.props ?? []);
  const declared = catalogAttributes(artifact.states, facts);
  const out = [];
  for (const [attribute, byClass] of facts.selection) {
    if (attribute.startsWith('data-muxui-state-') || !attribute.startsWith('data-muxui-') || declared.has(attribute)) continue;
    const prop = attribute.slice('data-muxui-'.length);
    if (!props.has(prop)) continue;
    const selected = selectedParts({ attribute, rows, observed, facts });
    if (selected.parts.length === 0) continue;
    const emitted = emittedParts({ attribute, rows, observed });
    const stylesheetValues = unique([...byClass].filter(([className]) => rows.some((row) => row.hook === className) || observed.companions.some(({ hook }) => hook === className)).flatMap(([, values]) => [...values]));
    const { values, default: fallback } = propValues({ api, prop, stylesheetValues });
    const shown = values.map((value) => value === fallback ? `${value} (default)` : value);
    out.push({
      kind: 'reflected',
      hook: attribute,
      origin: 'prop',
      selectedOn: selected.parts,
      emittedOn: emitted.parts,
      tags: [],
      inRoot: false,
      on: onText(emitted.parts, selected.parts),
      values,
      ...(fallback !== undefined && { default: fallback }),
      ...(selected.companion && { companion: `.${selected.companion.hook}` }),
      note: `${values.length > 0 ? `Prop ${prop}: ${shown.join(', ')}.` : `Prop ${prop}. The value is the prop value.`}${selected.companion ? ` Selected through .${selected.companion.hook}, which the root element also carries (${pascal(selected.companion.owner)}).` : ''}`,
      provenance: unique([...emitted.sources, ...(selected.companion?.sources ?? [])]),
    });
  }
  return out.sort((left, right) => left.hook.localeCompare(right.hook));
}

/** Bounded "not set by" rows: size, variant and color a family that styles reflected props neither declares nor writes. */
function notSetRows({ slug, name, artifact, reflected, observed, facts }) {
  if (reflected.length === 0) return [];
  const props = new Set(artifact.bindings['web.react'].api.props ?? []);
  const shown = new Set(reflected.map(({ hook }) => hook));
  const everyElement = observed.renders.flatMap(({ parsed }) => parsed.elements);
  return reflectedProbeNames.filter((probe) => !props.has(probe)
    && !shown.has(`data-muxui-${probe}`)
    && !facts.runtimeWrites.get(slug)?.has(probe)
    && !observed.companions.some(({ owner }) => facts.runtimeWrites.get(owner)?.has(probe))
    && !everyElement.some((element) => element.attributes.has(`data-muxui-${probe}`)))
    .map((probe) => ({
      kind: 'reflected', hook: `data-muxui-${probe}`, origin: 'prop', selectedOn: [], emittedOn: [], tags: [], inRoot: false, on: '-',
      note: `${name} has no ${probe} prop and its source writes no data-muxui-${probe}.`, provenance: [],
    }));
}

// ---------------------------------------------------------------------------------------------------------------------------
// The Rendered DOM: the public shape of one observed render, flattened and trimmed.
// ---------------------------------------------------------------------------------------------------------------------------

const renderedLineLimit = 40;
const renderedTextLimit = 40;

function renderedDom({ renders, examples, facts }) {
  if (renders.length === 0) return null;
  const preferred = renders.find(({ source }) => /\/basic\.tsx$/u.test(source))
    ?? renders.find(({ source }) => source === examples[0]?.source?.content)
    ?? renders[0];
  const keep = (element) => element.classes.some((name) => facts.publicHooks.has(name)) || [...element.attributes.keys()].some((name) => name.startsWith('data-muxui-'));
  const openTag = (element) => {
    const classes = element.classes.filter((name) => facts.publicHooks.has(name));
    const attributes = [...element.attributes].filter(([name]) => name.startsWith('data-muxui-')).map(([name, value]) => value === '' ? name : `${name}="${value}"`);
    return `<${[element.tag, ...(classes.length > 0 ? [`class="${classes.join(' ')}"`] : []), ...attributes].join(' ')}>`;
  };
  const trim = (text) => { const value = collapse(text); return value.length > renderedTextLimit ? `${value.slice(0, renderedTextLimit - 3)}...` : value; };
  /** The kept descendants of a node and its text, with unkept elements flattened into their parent. */
  const flatten = (nodes) => nodes.flatMap((node) => typeof node === 'string' ? [node] : keep(node) ? [node] : flatten(node.nodes));
  const lines = [];
  const emit = (element, depth) => {
    const indent = '  '.repeat(depth);
    const children = flatten(element.nodes);
    const elementsBelow = children.filter((node) => typeof node !== 'string');
    const text = trim(children.filter((node) => typeof node === 'string').join(' '));
    if (elementsBelow.length === 0) {
      lines.push(voidElements.has(element.tag) ? `${indent}${openTag(element)}` : `${indent}${openTag(element)}${text}</${element.tag}>`);
      return;
    }
    lines.push(`${indent}${openTag(element)}`);
    if (text) lines.push(`${indent}  ${text}`);
    for (const child of elementsBelow) emit(child, depth + 1);
    lines.push(`${indent}</${element.tag}>`);
  };
  const tops = flatten(parseTopNodes(preferred.parsed)).filter((node) => typeof node !== 'string');
  for (const top of tops) emit(top, 0);
  if (lines.length === 0) return null;
  const clipped = lines.length > renderedLineLimit ? [...lines.slice(0, renderedLineLimit - 1), '...'] : lines;
  return {
    source: preferred.source,
    text: clipped.join('\n'),
    note: 'Observed from a server render of the Basic example. Attributes and elements can differ with props and state; internal classes are left out.',
  };
}

/** The top-level nodes of a parsed render (those with no element parent). */
function parseTopNodes(parsed) {
  return parsed.elements.filter((element) => element.parent.tag === '#root');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tokens, override rules and sources.
// ---------------------------------------------------------------------------------------------------------------------------

const longGroupThreshold = 24;

function readByNote(readBy) {
  const selectorText = ({ selector, conditions, public: isPublic }) => `${selector}${conditions.length > 0 ? ` (${conditions.join(' ')})` : ''}${isPublic ? '' : ' [implementation selector, not a public hook]'}`;
  if (readBy.kind === 'rules') return `Read by ${readBy.selectors.map(selectorText).join('; ')}.`;
  if (readBy.kind === 'parts') return `Read through its structured parts (${readBy.through.join(', ')}) by ${readBy.selectors.map(selectorText).join('; ')}.`;
  if (readBy.kind === 'compiled') return `Read through ${readBy.through.join(', ')}, which depends on it.`;
  const own = readBy.examples.length > 0 ? ` ${readBy.examples.join(', ')} reads it in its own markup.` : '';
  return `Declared. No Mux CSS rule reads this role today.${own}`;
}

function tokenGroups({ artifact, name, facts }) {
  const { core, source, light, dark, tokenReads } = facts.tokens;
  const rows = artifact.bindings['web.react'].tokenRecipe.requirements.map(({ token, requirement, profiles }) => {
    const definition = source.tokens[token];
    if (!definition || !light.tokens[token]) throw new Error(`${token} is not in the token record`);
    const layer = token.split('.')[0];
    if (layer !== 'component' && layer !== 'semantic') throw new Error(`${token} is a ${layer} token, which a recipe does not require`);
    const readBy = layer === 'component' ? tokenReads.get(token) : null;
    const darkAlias = definition.modes?.['colorScheme.dark']?.alias ?? null;
    return {
      token,
      cssVar: core.cssName(token),
      requirement,
      ...(profiles && { profiles }),
      group: layer,
      meaning: definition.meaning,
      policy: definition.overridePolicy,
      type: definition.type,
      alias: definition.alias ?? null,
      darkAlias,
      light: core.cssValue(light.tokens[token]),
      dark: core.cssValue(dark.tokens[token]),
      readBy: readBy && { ...readBy, note: readByNote(readBy) },
    };
  });
  const group = (id, label, caption) => {
    const list = rows.filter(({ group: owner }) => owner === id);
    return list.length === 0 ? [] : [{ id, label, caption, collapsed: id === 'semantic' && list.length > longGroupThreshold, rows: list }];
  };
  return [
    ...group('component', 'Component roles', `Override these to customize ${name}.`),
    ...group('semantic', 'Semantic roles', `${name} reads these. They are shared, so changing one changes every family that reads it.`),
  ];
}

/** The reduced-motion paragraph, from what motion.mjs reads: two public inputs and an internal marker that is not an input. */
function motionParagraph({ mediaQuery, scopeAttribute, scopeValue, marker }) {
  return `Mux UI treats motion as reduced when the system asks for it (\`${mediaQuery}\`) or when \`${scopeAttribute}="${scopeValue}"\` is on the component or one of its ancestors; for an overlay, also on its trigger or the trigger's ancestors. Some overlays copy that result onto an internal \`${marker}\` marker; it is not an input.`;
}

function importantOf({ rows, facts }) {
  const hooks = new Set(rows.filter((row) => ['class', 'root-element', 'composed'].includes(row.disposition)).map((row) => row.hook));
  const byCause = {};
  let total = 0;
  for (const rule of facts.important) {
    if (![...rule.classes].some((name) => hooks.has(name))) continue;
    total += rule.count;
    byCause[rule.cause] = (byCause[rule.cause] ?? 0) + rule.count;
  }
  const ordered = Object.fromEntries(['forced-colors', 'reduced-motion-media', 'reduced-motion-attribute', 'other'].filter((cause) => byCause[cause]).map((cause) => [cause, byCause[cause]]));
  return total === 0 ? null : { total, byCause: ordered };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The recipe: CSS a consumer can copy for this family, generated from the same facts, with up to three changes (a theme token,
// a part and a state). Every step names an element the family's Basic example renders, so what it claims is something the preview
// can show; a step with no such element is dropped and one sentence says why.
// ---------------------------------------------------------------------------------------------------------------------------

const recipeScope = 'my-scope';
/**
 * Colors a token step assigns. What a role paints decides which: a lone color is a mid-tone (relative luminance about 0.17), 3:1 or
 * more against the near-white and the near-black the shipped sheet paints text and surfaces with, so it reads against the example's own
 * text and surface in light and in dark. A text color and a surface color that the same example paints one on the other are assigned
 * together and get a pair that contrasts with each other in either scheme. The generator does not compute contrast: the Chromium sweep
 * measures it for every step that paints text or its surface, in light and dark, and fails under 3:1.
 */
const recipeMidTones = Object.freeze(['#7e62c9', '#287f72', '#a06724']);
const recipePair = Object.freeze({ surface: '#1e1b4b', text: '#ffffff' });
const recipeTokenLimit = 3;
const recipePart = Object.freeze({ declaration: 'letter-spacing: 0.04em', property: 'letter-spacing' });
const recipeState = Object.freeze({ declaration: 'text-decoration: line-through', property: 'text-decoration-line' });
/** Roles that are never a step: label-gap is declared and read by no Mux rule, and a duration is not a color or a size. */
const neverStepped = /^(?:label-gap|motion-duration|transition)(?:-|$)/u;
/** Catalog states a consumer can set by hand on the Basic example's element, so a state step on one is printed even when it is not shown. */
const settableStates = new Set(['disabled', 'read-only', 'required', 'invalid', 'selected', 'expanded', 'open']);
const statePrefix = 'data-muxui-state-';

const mappedLonghands = Object.freeze({
  background: 'background-color', 'border-radius': 'border-top-left-radius', 'text-decoration': 'text-decoration-line', padding: 'padding-top',
  'padding-inline': 'padding-inline-start', 'padding-block': 'padding-block-start', gap: 'row-gap',
});
const otherShorthands = /^(?:margin(?:-inline|-block)?|inset(?:-inline|-block)?|outline|font|flex|grid(?:-[\w-]+)?|list-style|overflow|columns|mask|offset|place-[\w-]+|animation|transition|border-width|border-style|border-image|scroll-[\w-]+|text-emphasis)$/u;

/**
 * The longhand to compare for a declared property, or null when there is none: a custom property, or a shorthand that sets many.
 * A `border` shorthand compares the color of its first side for a color token and the width for a size.
 */
function longhandOf(property, type) {
  if (property.startsWith('--')) return null;
  const border = /^border(?:-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?(?:-(color))?$/u.exec(property);
  if (border) return `border-${{ inline: 'inline-start', block: 'block-start' }[border[1]] ?? border[1] ?? 'top'}-${border[2] === 'color' || type === 'color' ? 'color' : 'width'}`;
  if (Object.hasOwn(mappedLonghands, property)) return mappedLonghands[property];
  return otherShorthands.test(property) ? null : property;
}

// Which declared property competes with a target longhand. A shorthand sets its longhands, so a rule that declares one competes with a
// rule that declares the other, in order. A physical longhand and its logical counterpart (`padding-top` and `padding-block-start`) are
// the same property in some writing mode or direction, and the model does not know which, so a declaration of one may be the target
// itself. A shorthand it has no table for is unknown for every target: unknown never makes a step.

const physicalSides = Object.freeze(['top', 'right', 'bottom', 'left']);
const borderKinds = Object.freeze(['color', 'style', 'width']);
/** The longhands of each shorthand whose longhands do not simply start with its name. */
const expansions = new Map();
for (const base of ['margin', 'padding', 'scroll-margin', 'scroll-padding']) {
  expansions.set(base, physicalSides.map((side) => `${base}-${side}`));
  for (const axis of ['block', 'inline']) expansions.set(`${base}-${axis}`, [`${base}-${axis}-start`, `${base}-${axis}-end`]);
}
expansions.set('inset', [...physicalSides]);
for (const axis of ['block', 'inline']) expansions.set(`inset-${axis}`, [`inset-${axis}-start`, `inset-${axis}-end`]);
for (const kind of borderKinds) {
  expansions.set(`border-${kind}`, physicalSides.map((side) => `border-${side}-${kind}`));
  for (const axis of ['block', 'inline']) expansions.set(`border-${axis}-${kind}`, [`border-${axis}-start-${kind}`, `border-${axis}-end-${kind}`]);
}
for (const side of [...physicalSides, 'block-start', 'block-end', 'inline-start', 'inline-end']) expansions.set(`border-${side}`, borderKinds.map((kind) => `border-${side}-${kind}`));
for (const axis of ['block', 'inline']) expansions.set(`border-${axis}`, borderKinds.flatMap((kind) => [`border-${axis}-start-${kind}`, `border-${axis}-end-${kind}`]));
expansions.set('border', physicalSides.flatMap((side) => borderKinds.map((kind) => `border-${side}-${kind}`)));
expansions.set('border-radius', ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']);
expansions.set('gap', ['row-gap', 'column-gap']);
expansions.set('grid-gap', ['row-gap', 'column-gap']);
expansions.set('columns', ['column-width', 'column-count']);
expansions.set('flex-flow', ['flex-direction', 'flex-wrap']);
expansions.set('place-items', ['align-items', 'justify-items']);
expansions.set('place-content', ['align-content', 'justify-content']);
expansions.set('place-self', ['align-self', 'justify-self']);
expansions.set('grid-area', ['grid-row-start', 'grid-row-end', 'grid-column-start', 'grid-column-end']);
expansions.set('contain-intrinsic-size', ['contain-intrinsic-width', 'contain-intrinsic-height']);
/** Shorthands whose longhands start with their name (`background-color`, `font-size`, `transition-duration`). */
const prefixShorthands = new Set([
  'animation', 'background', 'border-image', 'column-rule', 'container', 'flex', 'font', 'grid', 'grid-column', 'grid-row', 'grid-template', 'list-style', 'mask', 'offset',
  'outline', 'overflow', 'overscroll-behavior', 'scroll-timeline', 'text-decoration', 'text-emphasis', 'text-wrap', 'transition', 'view-timeline', 'white-space',
]);
/** What a prefix shorthand sets beyond its prefix, and what its prefix names that it does not set. */
const prefixExtras = Object.freeze({ font: ['line-height'], border: ['border-image-source'] });
const prefixExceptions = Object.freeze({ outline: ['outline-offset'] });
/** Shorthands this model has no table for: any of them may set any target. */
const unmodelledShorthands = new Set(['mask-border', 'position-try', 'font-synthesis']);
/** `all` sets every property but these, and custom properties. */
const outsideAll = new Set(['direction', 'unicode-bidi']);

/** The family of a physical or logical longhand and which of the two it is, or null: margins, paddings, insets, border sides, radii, sizes. */
function aliasFamily(property) {
  let match;
  if ((match = /^(margin|padding|scroll-margin|scroll-padding)-(?:top|right|bottom|left)$/u.exec(property))) return [match[1], false];
  if ((match = /^(margin|padding|scroll-margin|scroll-padding)-(?:block|inline)-(?:start|end)$/u.exec(property))) return [match[1], true];
  if (/^(?:top|right|bottom|left)$/u.test(property)) return ['inset', false];
  if (/^inset-(?:block|inline)-(?:start|end)$/u.test(property)) return ['inset', true];
  if ((match = /^border-(?:top|right|bottom|left)-(color|style|width)$/u.exec(property))) return [`border-${match[1]}`, false];
  if ((match = /^border-(?:block|inline)-(?:start|end)-(color|style|width)$/u.exec(property))) return [`border-${match[1]}`, true];
  if (/^border-(?:top|bottom)-(?:left|right)-radius$/u.test(property)) return ['radius', false];
  if (/^border-(?:start|end)-(?:start|end)-radius$/u.test(property)) return ['radius', true];
  if ((match = /^(min-|max-)?(?:width|height)$/u.exec(property))) return [`${match[1] ?? ''}size`, false];
  if ((match = /^(min-|max-)?(?:inline-size|block-size)$/u.exec(property))) return [`${match[1] ?? ''}size`, true];
  return null;
}
const mayAlias = (left, right) => {
  const [one, other] = [aliasFamily(left), aliasFamily(right)];
  return one !== null && other !== null && one[0] === other[0] && one[1] !== other[1];
};

const relations = new Map();
/**
 * How a declaration of `declared` bears on `target`: `'same'` (it is the target), `'covers'` (a shorthand that sets it), `'maybe'` (it may be
 * the target or may set it: a logical counterpart, a logical shorthand of a physical target, a shorthand with no table) or false.
 * @param {string} declared
 * @param {string} target
 * @returns {'same' | 'covers' | 'maybe' | false}
 */
export function relation(declared, target) {
  const key = `${declared}|${target}`;
  const cached = relations.get(key);
  if (cached !== undefined) return cached;
  let result = false;
  if (declared === target) result = 'same';
  else if (declared.startsWith('--') || target.startsWith('--') || declared.startsWith('-')) result = false;
  else if (declared === 'all') result = outsideAll.has(target) ? false : 'covers';
  else if (expansions.has(declared)) {
    const longhands = expansions.get(declared);
    result = longhands.includes(target) || (prefixExtras[declared] ?? []).includes(target) ? 'covers' : longhands.some((longhand) => mayAlias(longhand, target)) ? 'maybe' : false;
  } else if (prefixShorthands.has(declared)) {
    result = target.startsWith(`${declared}-`) && !(prefixExceptions[declared] ?? []).includes(target) || (prefixExtras[declared] ?? []).includes(target) ? 'covers' : false;
  } else if (unmodelledShorthands.has(declared)) result = 'maybe';
  else if (mayAlias(declared, target)) result = 'maybe';
  relations.set(key, result);
  return result;
}

const mediaHolds = new Set(['@media (forced-colors: none)', '@media not (forced-colors: active)']);
const mediaNever = new Set(['@media (forced-colors: active)', '@media (prefers-reduced-motion: reduce)', '@media (prefers-contrast: more)']);
/**
 * What a rule's at-rule chain means for the Basic example at rest: true when it applies, false when a condition is false at rest (a
 * forced-colors, reduced-motion or contrast preference) and null when it is unknown. The components layer may sit anywhere in the
 * chain. A second layer, `@scope`, `@supports`, `@container` and every other media query (a viewport width) are unknown.
 * @param {string[]} chain
 * @returns {boolean | null}
 */
export function conditionAtRest(chain) {
  let layers = 0;
  let result = true;
  for (const prelude of chain) {
    if (prelude === '@layer muxui.components') { layers += 1; continue; }
    if (mediaNever.has(prelude)) return false;
    if (!mediaHolds.has(prelude)) result = null;
  }
  return layers === 1 ? result : null;
}
/** Pseudo-classes that need an interaction, so they are false on the Basic example at rest. */
const interactionPseudos = new Set(['hover', 'active', 'focus', 'focus-visible', 'focus-within']);

/**
 * What a pseudo-class is on an element of the Basic example at rest. `:not()`, `:is()` and `:where()` are decided by their
 * arguments and an interaction pseudo-class is false. Every other one (`:disabled`, `:first-child`, `:has()`) is unknown, and unknown
 * stays unknown through `:not()` and `:is()`: a rule that depends on it is never read as not applying.
 * @returns {boolean | null}
 */
function atRest({ name, selectors }, element) {
  if (name === 'is' || name === 'where') return anyMatches(selectors, element);
  if (name === 'not') {
    const found = anyMatches(selectors, element);
    return found === null ? null : !found;
  }
  // The example's elements are inside the body; none is the document element.
  if (name === 'root') return false;
  return interactionPseudos.has(name) ? false : null;
}

/** Whether some selector of a list matches `element` at rest: true, false, or null when none does for sure and one may. */
function anyMatches(selectors, element) {
  let result = false;
  for (const complex of selectors) {
    const found = matchAtRest(complex, element);
    if (found === true) return true;
    if (found === null) result = null;
  }
  return result;
}

/**
 * Whether a selector of the sheets matches an element of a render at rest: true, false, or null when a pseudo-class it depends on is unknown.
 * @param {Complex} complex
 * @param {ObservedElement} element
 */
export const matchAtRest = (complex, element) => matchComplex(complex, element, atRest);

/**
 * The element `querySelector` returns for a selector of the sheets in a render, when the model can say: the first element in
 * document order that definitely matches it, unless an earlier one may (a pseudo-class it does not model), in which case the browser
 * may return that one and the target is unknown.
 */
function firstMatch(parsed, complex) {
  for (const element of parsed.elements) {
    const found = matchAtRest(complex, element);
    if (found === true) return element;
    if (found === null) return undefined;
  }
  return undefined;
}

const addPairs = ([left, leftTypes], [right, rightTypes]) => [left + right, leftTypes + rightTypes];
const higher = (left, right) => (left[0] !== right[0] ? left[0] > right[0] : left[1] > right[1]);
/** A selector's specificity as [classes, attributes and pseudo-classes; types and pseudo-elements]; the sheets use no ids. */
function specificityOf(complex) {
  let total = [0, 0];
  for (const compound of complex.compounds) {
    total = addPairs(total, [compound.classes.length + compound.attributes.length, (compound.tag === undefined ? 0 : 1) + (compound.element === null ? 0 : 1)]);
    for (const { name, selectors } of compound.pseudos) {
      if (name === 'where') continue;
      // `:not()`, `:is()` and `:has()` weigh as their most specific argument; any other pseudo-class as one class.
      total = addPairs(total, selectors ? selectors.map(specificityOf).reduce((best, next) => (higher(next, best) ? next : best), [0, 0]) : [1, 0]);
    }
  }
  return total;
}

/**
 * Every declaration of the shipped components layer that can apply at rest, by the property it names, with what the cascade compares:
 * importance, the selector's specificity, the rule's order and the declaration's position in its block. A rule under a condition
 * that is false at rest is left out; one under a condition the model cannot decide (a color-scheme `@scope`, a viewport query) is
 * kept as unknown, so it makes the winner unknown wherever its selector may match.
 */
const declarationIndexes = new WeakMap();
function declarationIndex(facts) {
  const cached = declarationIndexes.get(facts);
  if (cached) return cached;
  const index = new Map();
  facts.rules.forEach((rule, order) => {
    const condition = conditionAtRest(rule.chain);
    if (condition === false) return;
    for (const complex of rule.selectors) {
      // A rule on a pseudo-element styles that, not the element.
      if (complex.compounds.at(-1).element !== null) continue;
      const specificity = specificityOf(complex);
      rule.declarations.forEach(({ property, value, important }, position) => {
        const entries = index.get(property) ?? [];
        entries.push({ complex, specificity, order, position, value, important, unknown: condition === null });
        index.set(property, entries);
      });
    }
  });
  declarationIndexes.set(facts, index);
  return index;
}

/** Whether `left` beats `right` in the cascade: importance, specificity, rule order, then position in the block. */
const beats = (left, right) => (left.important !== right.important ? left.important
  : left.specificity[0] !== right.specificity[0] || left.specificity[1] !== right.specificity[1] ? higher(left.specificity, right.specificity)
    : left.order !== right.order ? left.order > right.order : left.position > right.position);

/**
 * The declaration that wins for `element` among those that set `property`, a shorthand that covers it, or a declaration that may set it
 * (see `relation`: a logical counterpart, a shorthand with no table). Declarations are compared one by one, so a later shorthand beats an
 * earlier longhand of the same rule and an `!important` one beats a later normal one, as the browser decides it. One that may set the
 * property competes as if it did: when it wins the property is not the reader's, and when it loses the reader wins whether or not it
 * applies. Null when a rule that may apply is unknown (see `atRest`) or is under a condition the model cannot decide, because then the
 * winner is not known. Undefined when nothing applies.
 */
function winnerOf(index, element, property) {
  let best;
  for (const [name, entries] of index) {
    if (relation(name, property) === false) continue;
    for (const entry of entries) {
      const found = matchAtRest(entry.complex, element);
      if (found === false) continue;
      if (found === null || entry.unknown) return null;
      if (!best || beats(entry, best)) best = entry;
    }
  }
  return best;
}

/**
 * The custom properties a value reads with `var()`: those it reads first (`primary`), and those that only appear in the fallback of
 * another (`fallback`). A role that is only a fallback is reached by an assignment only if the primary one is unset, which the model
 * cannot know.
 */
export function varReads(value) {
  const primary = new Set();
  const fallback = new Set();
  const scan = (text, inFallback) => {
    for (let index = 0; index < text.length; index += 1) {
      if (!text.startsWith('var(', index) || /[\w-]/u.test(text[index - 1] ?? '')) continue;
      let depth = 1;
      let end = index + 4;
      for (; end < text.length && depth > 0; end += 1) depth += text[end] === '(' ? 1 : text[end] === ')' ? -1 : 0;
      const inner = text.slice(index + 4, end - 1);
      const comma = inner.indexOf(',');
      (inFallback ? fallback : primary).add((comma < 0 ? inner : inner.slice(0, comma)).trim());
      if (comma >= 0) scan(inner.slice(comma + 1), true);
      index = end - 1;
    }
  };
  scan(value, false);
  return { primary, fallback };
}
const readsVariable = (value, name) => varReads(value).primary.has(name);

/** Whether a declaration of the custom property `name` may reach `element` or an ancestor in the render: it then shadows what a wrapper assigns. */
function shadowed(index, element, name) {
  for (let node = element; node && node.tag !== '#root'; node = node.parent) if (winnerOf(index, node, name) !== undefined) return true;
  return false;
}

/**
 * The property a token finally paints on `element`, or null when some other rule wins there. A rule often reads a token into a local
 * custom property that another rule paints with, so up to two such hops are followed, and at each the declaration that wins for the
 * element must be the one that reads the name before it. A Button's danger variant sets that custom property itself, so a Button
 * role never reaches it.
 */
function paintedBy({ element, source, property, type, index, facts, hops = 0 }) {
  const target = property.startsWith('--') ? property : longhandOf(property, type);
  if (!target) return null;
  const winner = winnerOf(index, element, target);
  if (!winner || !readsVariable(winner.value, source)) return null;
  // The role is assigned on a wrapper and inherited down: a declaration of it on the element or an ancestor of the example wins over that.
  if (hops === 0 && shadowed(index, element, source)) return null;
  if (!property.startsWith('--')) return target;
  if (hops >= 2) return null;
  for (const next of unique((facts.tokens.reads.get(property) ?? []).map(({ property: painted }) => painted))) {
    const painted = paintedBy({ element, source: property, property: next, type, index, facts, hops: hops + 1 });
    if (painted) return painted;
  }
  return null;
}

const hasText = (element) => element.text.trim() !== '';
/** The first element of a render that a chain of compounds matches, or undefined. */
const first = (parsed, selector) => selectObserved(parsed, selector)[0];

/** Whether a token row could be a step: a theme color, or a size in a unit a sum can use, that a Mux rule reads and that is not a never-stepped role. */
const canBeStep = (row) => row.group === 'component' && row.policy === 'theme' && ['color', 'dimension'].includes(row.type) && row.readBy.kind === 'rules'
  && !neverStepped.test(row.token.split('.').at(-1)) && (row.type === 'color' || /^-?(?:\d+|\d*\.\d+)(?:px|rem|em)$/u.test(row.light));

/** The wrapper-scoped token steps: at most three theme color and size roles that win on the first element the Basic example shows for their rule. */
function tokenSteps({ tokenRows, basic, rootElements, facts }) {
  const inRoot = (element) => rootElements.includes(element) || insideAny(element, rootElements);
  const index = declarationIndex(facts);
  const candidates = [];
  for (const row of tokenRows) {
    if (!canBeStep(row)) continue;
    // A reader may be qualified by pseudo-classes (`:where(.x):not([data-muxui-state-invalid]) .label`); it counts where the Basic
    // example definitely matches it, and not where a pseudo-class is unknown.
    const found = row.readBy.selectors.flatMap((reader) => parseSelectorList(reader.selector).flatMap((complex) => {
      const element = firstMatch(basic.parsed, complex);
      const property = element && inRoot(element) && paintedBy({ element, source: row.cssVar, property: reader.property, type: row.type, index, facts });
      return property ? [{ row, target: complex.text, property, element }] : [];
    }));
    // Every element the role paints, for pairing; the first is the step.
    if (found.length > 0) candidates.push({ ...found[0], paints: found });
  }
  // One size when there is one (a radius first), and colors for the rest.
  const size = candidates.find(({ row, property }) => row.type === 'dimension' && /radius/u.test(property)) ?? candidates.find(({ row }) => row.type === 'dimension');
  const colors = candidates.filter(({ row }) => row.type === 'color').slice(0, recipeTokenLimit - (size ? 1 : 0));
  // A text color drawn on a surface color that this recipe also assigns: the two get a pair that contrasts.
  const paired = new Map();
  for (const surface of colors) {
    const surfaces = surface.paints.filter(({ property }) => property === 'background-color').map(({ element }) => element);
    const text = colors.find((candidate) => candidate !== surface && candidate.property === 'color' && !paired.has(candidate) && surfaces.some((element) => candidate.element === element || insideAny(candidate.element, [element])));
    if (text && !paired.has(surface)) { paired.set(surface, recipePair.surface); paired.set(text, recipePair.text); }
  }
  let single = 0;
  const colorValue = (candidate) => paired.get(candidate) ?? recipeMidTones[single++];
  return [...colors, ...(size ? [size] : [])].map((candidate) => {
    const { row, target, property, element } = candidate;
    const value = row.type === 'color' ? colorValue(candidate) : /radius/u.test(property) ? '999px' : `calc(${row.light} + 0.5rem)`;
    return { kind: 'token', selector: `.${recipeScope}`, declaration: `${row.cssVar}: ${value}`, target, property, scope: 'wrapper', observedText: hasText(element) };
  });
}

/** The part step: the first part with text inside the root, else the root, else the first part inside the root. */
function partStep({ classRows, basic, rootElements, observed }) {
  const inRoot = (element) => rootElements.includes(element) || insideAny(element, rootElements);
  const rootPart = observed.rootRow?.part;
  const found = classRows.filter(({ hook }) => hook !== null).flatMap((row) => {
    const element = first(basic.parsed, row.hook);
    return element && inRoot(element) ? [{ row, element }] : [];
  });
  const pick = found.find(({ row, element }) => row.part !== rootPart && hasText(element)) ?? found.find(({ row }) => row.part === rootPart) ?? found[0];
  if (!pick) return null;
  return { kind: 'part', selector: `.${recipeScope} ${pick.row.hook}`, declaration: recipePart.declaration, target: pick.row.hook, property: recipePart.property, scope: 'wrapper', observedText: hasText(pick.element) };
}

/**
 * The state step. The first boolean state row, in the order the Hooks block prints them, whose attribute the Basic example shows on an
 * element inside the root; else the first catalog boolean a consumer can set by hand, marked unavailable because the example does not show it.
 */
function stateStep({ stateRowList, classRows, basic, rootElements, facts }) {
  const inRoot = (element) => rootElements.includes(element) || insideAny(element, rootElements);
  const hooks = classRows.filter(({ hook }) => hook !== null);
  const hookOf = (part) => hooks.find((row) => row.part === part)?.hook;
  // A state is a boolean attribute; an enumerated one (layout, orientation) is always present and shows nothing by being there.
  const rows = stateRowList.filter(({ origin, hook }) => (origin === 'catalog' || origin === 'observed') && hook.startsWith(statePrefix) && facts.contract.booleanStates.includes(hook.slice(statePrefix.length)));
  const step = (row, hook, element, extra) => ({
    kind: 'state', selector: `.${recipeScope} ${hook}[${row.hook}]`, declaration: recipeState.declaration, target: `${hook}[${row.hook}]`,
    property: recipeState.property, observedText: hasText(element), ...extra,
  });
  for (const row of rows) {
    for (const { hook } of hooks) {
      const element = first(basic.parsed, `${hook}[${row.hook}]`);
      if (element && inRoot(element)) return step(row, hook, element, { scope: 'wrapper' });
    }
  }
  for (const row of rows.filter(({ hook }) => settableStates.has(hook.slice(statePrefix.length)))) {
    for (const part of row.selectedOn) {
      const hook = hookOf(part);
      const element = hook && first(basic.parsed, hook);
      if (element && inRoot(element)) return step(row, hook, element, { scope: 'unavailable', reason: 'needs the state' });
    }
  }
  return null;
}

/** The layer statement and the stylesheet import, from the README's own code block. */
function recipeHeader(facts) {
  const lines = facts.cascade.layerCode.split('\n');
  const statement = lines[0];
  const stylesImport = lines.find((line) => /^@import\b.*styles\.css/u.test(line));
  if (!statement.startsWith('@layer ') || !stylesImport) throw new Error('the README layer code is no longer a layer statement and an import of styles.css');
  return [statement, stylesImport];
}

/**
 * The recipe for one family. Without a render of its Basic example no target is known, so the recipe has no steps and says so.
 * @param {object} input
 */
function recipeFor({ name, tokenRows, classRows, stateRowList, observed, examples, facts }) {
  const [statement, stylesImport] = recipeHeader(facts);
  const basicSource = examples[0]?.source.content;
  const render = observed.renders.find(({ source }) => source === basicSource) ?? observed.renders[0];
  const notes = [];
  const noRoot = observed.rootRow?.disposition === 'none';
  const rootElements = render ? (observed.rootElements.get(render.source) ?? []) : [];
  const basic = render && { source: render.source, parsed: render.parsed };
  const steps = [];
  if (!basic) {
    notes.push('No steps: no example render was supplied, so the recipe cannot name an element the example shows.');
  } else {
    const tokens = rootElements.length > 0 ? tokenSteps({ tokenRows, basic, rootElements, facts }) : [];
    if (tokens.length === 0) {
      notes.push(!tokenRows.some(({ group }) => group === 'component') ? `No token step: ${name} has no component roles.`
        : !tokenRows.some(canBeStep) ? `No token step: ${name} has no color or size role that a Mux rule reads.`
          : `No token step: no color or size role of ${name} is read by a rule that provably wins on an element its Basic example renders at rest. They can apply inside overlays, in states or in variants the example does not show; assign them on the theme scope that contains the portal container (README, Cascade layers).`);
    }
    const part = partStep({ classRows, basic, rootElements, observed });
    if (!part) notes.push(`No part step: the Basic example renders no element of ${name}'s documented hooks${noRoot ? `, and its root renders no element (${noElementPhrases[observed.rootRow.reason]})` : ''}.`);
    const state = stateStep({ stateRowList, classRows, basic, rootElements, facts });
    if (!state) notes.push(`No state step: ${name} declares no state its Basic example shows or that you can set by hand.`);
    steps.push(...tokens, ...[part, state].filter(Boolean));
  }
  const tokenStepList = steps.filter(({ kind }) => kind === 'token');
  const ruleSteps = steps.filter(({ kind }) => kind !== 'token');
  const sections = [];
  const numbered = (title) => `/* ${sections.length + 1}. ${title} */`;
  if (tokenStepList.length > 0) {
    sections.push(`${numbered('Tokens: assign on a wrapper that contains the component (theme policy)')}\n.${recipeScope} {\n${tokenStepList.map(({ declaration }) => `  ${declaration};`).join('\n')}\n}`);
  }
  if (ruleSteps.length > 0) {
    const kinds = ruleSteps.map(({ kind }) => `a ${kind} hook`).join(' and ');
    sections.push(`${numbered(`${kinds.charAt(0).toUpperCase()}${kinds.slice(1)}, in your layer`)}\n@layer muxui.utilities {\n${ruleSteps.map(({ selector, declaration }) => `  ${selector} { ${declaration}; }`).join('\n')}\n}`);
  }
  const rules = sections.length > 0 ? `${sections.join('\n\n')}\n` : '';
  return {
    css: `${statement}\n${stylesImport}\n${rules === '' ? '' : `\n${rules}`}`,
    rules,
    markup: `<div className="${recipeScope}">\n  {/* your ${name}, as in the Basic example */}\n</div>\n`,
    scope: recipeScope,
    steps,
    notes,
  };
}

const partMapPath = 'packages/react/test/support/styling-parts.ts';
const referencePath = 'packages/react/test/support/styling-reference.mjs';
const tokenRecordPath = 'catalog/tokens/default-theme.json';
const readmePath = 'packages/react/README.md';

/**
 * Tracked files behind a family's Styling block. The built stylesheet is not tracked, so the authored files that select its hooks
 * stand for it: those of the family's own hooks and of the companion hooks its root element also carries (IconButton's root is a
 * Button, and the Hooks block reads Button's rules for it).
 */
function sourcePaths({ rows, observed, facts }) {
  const hooks = new Set([...rows.filter((row) => documentedDispositions.includes(row.disposition)).map((row) => row.hook), ...observed.companions.map(({ hook }) => hook)]);
  // A file styles a hook when a rule's subject is the hook or one of its modifiers (`muxui-text--sm`).
  const styles = facts.authored.filter(({ classes }) => [...hooks].some((name) => classes.has(name) || [...classes].some((candidate) => candidate.startsWith(`${name}--`)))).map(({ path }) => path);
  return [partMapPath, referencePath, ...styles, tokenRecordPath, readmePath];
}

/**
 * One family's styling: the hooks block, the token rows, the override rules and the tracked sources behind them.
 * Pure. Without `observations`, the observed fields are empty and the object is still valid.
 * @param {object} input
 * @param {string} input.slug The family slug.
 * @param {{ name?: string, states: readonly string[], bindings: Record<string, any> }} input.artifact The compiled catalog record.
 * @param {readonly { name?: string, source: { content: string } }[]} [input.examples] The family's catalog examples, in order.
 * @param {StylingFacts} input.facts From `readStylingFacts`.
 * @param {readonly Observation[]} [input.observations] Server renders of catalog examples; only this family's are read.
 * @returns {FamilyStyling}
 */
export function stylingFor({ slug, artifact, examples = [], facts, observations = [] }) {
  if (!artifact.bindings?.['web.react']) throw new Error(`${slug} has no web.react binding`);
  const rows = facts.parts.partRows.filter((row) => row.family === slug);
  if (rows.length === 0) throw new Error(`the part map has no rows for ${slug}`);
  const name = artifact.name ?? pascal(slug);
  const observed = observeFamily({ slug, rows, observations, facts });
  const classRows = hookRows({ slug, rows, observed, facts });
  const rootPart = observed.rootRow?.part;
  const reflected = reflectedRows({ artifact, name, rows, observed, facts });
  const states = stateRows({ artifact, rows, observed, facts });
  const tokens = tokenGroups({ artifact, name, facts });
  const groups = [
    { id: 'root', rows: classRows.filter(({ part }) => part === rootPart) },
    { id: 'part', rows: classRows.filter(({ part }) => part !== rootPart) },
    { id: 'state', rows: states },
    { id: 'reflected', rows: reflected },
  ].filter(({ rows: list }) => list.length > 0);
  return deepFreeze({
    hooks: {
      groups,
      notSet: notSetRows({ slug, name, artifact, reflected, observed, facts }),
      renderedDom: renderedDom({ renders: observed.renders, examples, facts }),
      observationNote: observed.renders.length === 0
        ? 'Not observed: no example render was supplied.'
        : 'Tags are observed in this component\'s catalog examples (server render), not a guarantee: a part can render another element when you change its props.',
    },
    tokens: { groups: tokens },
    overrides: {
      paragraphs: [...facts.cascade.paragraphs],
      layerIntro: facts.cascade.layerIntro,
      layerCode: facts.cascade.layerCode,
      layerClosing: facts.cascade.layerClosing,
      limit: facts.cascade.limit,
      motion: motionParagraph(facts.motion),
      whoWins: whoWinsRows,
      important: importantOf({ rows, facts }),
    },
    recipe: recipeFor({ name, tokenRows: tokens.flatMap(({ rows: list }) => list), classRows, stateRowList: states, observed, examples, facts }),
    sources: sourcePaths({ rows, observed, facts }),
  });
}
