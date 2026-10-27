// The styling reference (CSS Stage 2 PR 4a): what the docs "Styling" section and the Storybook Anatomy table print about a component,
// derived from five sources by one code path for all 84 families. These tests pin the derived facts to numbers the plan measured
// separately, recompute the ones that can be recomputed another way (jsdom's parse of the renders, an independent selector scan), and
// run source mutants through a mirror of the repository, so the reference is shown to read the sources it says it reads.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { compilePureTokenGraph, cssDeclaration, cssName, cssValue } from '@muxui/tokens/core';
import { renderCatalogExamples } from './support/catalog-example-renders.mjs';
import { importantCategory, importantDeclarations } from './support/important-declarations.mjs';
import { withMirror } from './support/repository-mirror.mjs';
import {
  describeElements, interactionStates, matchComplex, parseObservation, parseSelectorList, readCascadeText, readMotionInputs, readStyleRules, readStylingFacts, selectObserved, stylingFor,
  undeclaredUnobservedStates, whoWinsRows,
} from './support/styling-reference.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const slugs = readdirSync(resolve(repositoryRoot, 'catalog/components'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

/** A compiled catalog record for the fields the reference reads: the raw record with the package's derived API (same as the catalog compiles). */
function readRecord(root, slug) {
  const raw = JSON.parse(readFileSync(resolve(root, `catalog/components/${slug}/artifact.json`), 'utf8'));
  const { api } = JSON.parse(readFileSync(resolve(root, `packages/react/api/${slug}.json`), 'utf8'));
  return { ...raw, bindings: { 'web.react': { ...raw.bindings['web.react'], api } } };
}
const records = new Map(slugs.map((slug) => [slug, readRecord(repositoryRoot, slug)]));

const facts = await readStylingFacts(repositoryRoot);
const renders = await renderCatalogExamples(slugs);
const observations = renders.map(({ family, source, html }) => ({ family, source, html }));
const examplesOf = (slug) => observations.filter(({ family }) => family === slug).map(({ source }) => ({ source: { content: source } }));
const stylingOf = (slug, overrides = {}) => stylingFor({ slug, artifact: records.get(slug), examples: examplesOf(slug), facts, observations, ...overrides });
const all = new Map(slugs.map((slug) => [slug, stylingOf(slug)]));

const groupRows = (styling, id) => styling.hooks.groups.find((group) => group.id === id)?.rows ?? [];
const classRows = (styling) => [...groupRows(styling, 'root'), ...groupRows(styling, 'part')];
const stateRowsOf = (styling) => groupRows(styling, 'state');
const reflectedRowsOf = (styling) => groupRows(styling, 'reflected');
const everyRow = (styling) => styling.hooks.groups.flatMap(({ rows }) => rows);
const allRows = (pick) => slugs.flatMap((slug) => pick(all.get(slug)).map((row) => ({ slug, row })));

// ---------------------------------------------------------------------------------------------------------------------------
// The stylesheet reader.
// ---------------------------------------------------------------------------------------------------------------------------

test('the stylesheet reader models the shipped sheets and refuses what it does not model', () => {
  const read = (name) => readStyleRules(readFileSync(resolve(packageRoot, `generated/${name}`), 'utf8'));
  assert.equal(read('styles.css').rules.length, 2087);
  assert.equal(read('supplemental.css').rules.length, 518);
  assert.equal(read('themes.css').rules.length, 60);
  // The shapes it models: grouping at-rules with a chain, statements, leaf at-rules it skips, !important, a block in a custom property.
  const parsed = readStyleRules('@layer a, b;\n@layer a { @media (forced-colors: active) { .x:where(.y) { color: red !important; --z: { a: b }; } } }\n@keyframes k { from { top: 0 } to { top: 1px } }\n@font-face { font-family: f; }');
  assert.deepEqual(parsed.rules.map(({ selector, chain }) => [selector, chain]), [['.x:where(.y)', ['@layer a', '@media (forced-colors: active)']]]);
  assert.deepEqual(parsed.rules[0].declarations.map(({ property, important }) => [property, important]), [['color', true], ['--z', false]]);
  // Fail closed: a nested rule, an unknown at-rule, an unbalanced brace, an unterminated comment or string, and a stray declaration.
  assert.throws(() => readStyleRules('.a { color: red; .b { color: blue; } }'), /a nested rule in a declaration block/u);
  assert.throws(() => readStyleRules('.a { &:hover { color: blue; } }'), /a nested rule in a declaration block/u);
  assert.throws(() => readStyleRules('@document url(x) { .a { color: red; } }'), /unknown at-rule @document/u);
  assert.throws(() => readStyleRules('@starting-style { .a { color: red; } }'), /unknown at-rule @starting-style/u);
  assert.throws(() => readStyleRules('@layer a { .a { color: red; }'), /unbalanced opening brace/u);
  assert.throws(() => readStyleRules('.a { color: red; } }'), /unbalanced closing brace/u);
  assert.throws(() => readStyleRules('.a { color: red;'), /unbalanced opening brace/u);
  assert.throws(() => readStyleRules('/* open'), /unterminated comment/u);
  assert.throws(() => readStyleRules('.a::after { content: "open }'), /unterminated string/u);
  assert.throws(() => readStyleRules('color: red;'), /a statement that is not an at-rule statement/u);
  assert.throws(() => readStyleRules('.a { color red }'), /a declaration without a colon/u);
});

// ---------------------------------------------------------------------------------------------------------------------------
// Observations.
// ---------------------------------------------------------------------------------------------------------------------------

test('the observation reader agrees with jsdom on every element of the 217 renders and refuses markup it does not model', () => {
  assert.equal(renders.length, 217);
  const signature = (tag, classes, attributes) => `${tag}|${classes.join(' ')}|${[...attributes].filter(([name]) => name.startsWith('data-muxui')).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',')}`;
  // The DOM's text of an element, without the content of a descendant script or style (code, which the reader keeps out of an ancestor's text).
  const domText = (node, top = true) => (node.nodeType === 3 ? node.data
    : node.nodeType === 1 && (top || !['STYLE', 'SCRIPT'].includes(node.tagName)) ? [...node.childNodes].map((child) => domText(child, false)).join('') : '');
  let elements = 0;
  for (const { name, html } of renders) {
    const mine = parseObservation(html).elements;
    const theirs = [...new JSDOM(`<!doctype html><body>${html}`).window.document.body.querySelectorAll('*')];
    assert.deepEqual(
      mine.map((element) => signature(element.tag, element.classes, element.attributes)),
      theirs.map((element) => signature(element.localName, [...element.classList], new Map([...element.attributes].map(({ name: attribute, value }) => [attribute, value])))),
      `${name}: the same elements, classes and data-muxui attributes in the same order`,
    );
    assert.deepEqual(mine.map((element) => element.text), theirs.map((element) => domText(element)), `${name}: the same text in every element`);
    elements += mine.length;
  }
  assert.equal(elements, 3752);
  // A <template> holds React Aria's collection and is inert: the template is an element, its content is not.
  const inert = parseObservation('<template><b class="muxui-x">in</b></template><i>out</i>');
  assert.deepEqual(inert.elements.map(({ tag }) => tag), ['template', 'i']);
  // Entities, boolean attributes, void elements and raw text.
  const mixed = parseObservation('<div data-a="1 &amp; 2" hidden class="a  b">x &lt; y<!-- --><br/><style>.a>.b{}</style></div>');
  assert.deepEqual(mixed.elements.map(({ tag }) => tag), ['div', 'br', 'style']);
  assert.equal(mixed.elements[0].attributes.get('data-a'), '1 & 2');
  assert.equal(mixed.elements[0].attributes.get('hidden'), '');
  assert.deepEqual(mixed.elements[0].classes, ['a', 'b']);
  assert.equal(mixed.elements[0].text, 'x < y');
  // A <textarea> and a <title> hold text with entities and no markup: the value is the element's text and its ancestors', decoded, and
  // the newline the HTML parser drops after <textarea> is dropped. A <style> holds code, which no ancestor counts as text.
  const values = parseObservation('<div><textarea name="n">Saved &amp; ready</textarea><style>a&amp;b{}</style></div><textarea>\nfirst &lt;b&gt;</textarea><title>T &amp; U</title>');
  assert.deepEqual(values.elements.map(({ tag, text }) => [tag, text]), [['div', 'Saved & ready'], ['textarea', 'Saved & ready'], ['style', 'a&amp;b{}'], ['textarea', 'first <b>'], ['title', 'T & U']]);
  assert.deepEqual(values.elements[0].nodes.filter((node) => typeof node === 'string'), [], 'a div holds elements, not the textarea\'s text as its own node');
  assert.deepEqual(values.elements[1].nodes, ['Saved & ready'], 'the textarea holds its value as a text node');
  const dom = new JSDOM('<!doctype html><body><div><textarea name="n">Saved &amp; ready</textarea></div>').window.document;
  assert.equal(dom.querySelector('div').textContent, values.elements[0].text, 'jsdom agrees');  // Refused: an end tag that closes another element, an unclosed element, an unterminated tag or comment, a bare attribute value.
  assert.throws(() => parseObservation('<div><span></div>'), /end tag div closes span/u);
  assert.throws(() => parseObservation('<div>'), /unclosed div/u);
  assert.throws(() => parseObservation('<div class="a'), /unterminated attribute value/u);
  assert.throws(() => parseObservation('<div'), /unterminated tag/u);
  assert.throws(() => parseObservation('<!-- open'), /unterminated comment/u);
});

test('a selector matches by tag, class, attribute, ancestor and parent, and refuses what it cannot read instead of dropping it', () => {
  const parsed = parseObservation('<div class="muxui-a"><button class="muxui-b" role="status"><span class="muxui-c"></span></button></div><button class="muxui-b"></button>');
  const tags = (selector) => selectObserved(parsed, selector).map(({ tag, classes }) => `${tag}.${classes.join('.')}`);
  assert.deepEqual(tags('.muxui-b'), ['button.muxui-b', 'button.muxui-b']);
  assert.deepEqual(tags('.muxui-a .muxui-b'), ['button.muxui-b'], 'an ancestor');
  assert.deepEqual(tags('button.muxui-b[role="status"]'), ['button.muxui-b'], 'a tag and an attribute');
  assert.deepEqual(tags('.muxui-a .muxui-c'), ['span.muxui-c'], 'a deeper descendant');
  assert.deepEqual(tags('a.muxui-b'), [], 'a tag that does not match');
  assert.deepEqual(tags('.muxui-c .muxui-a'), [], 'the ancestor order');
  assert.deepEqual(tags('.muxui-a > .muxui-b'), ['button.muxui-b'], 'a child');
  assert.deepEqual(tags('.muxui-a>.muxui-b'), ['button.muxui-b'], 'a child without spaces');
  assert.deepEqual(tags('.muxui-a > .muxui-c'), [], 'a grandchild is not a child');
  assert.deepEqual(tags('.muxui-a .muxui-b > .muxui-c'), ['span.muxui-c'], 'a descendant, then a child');
  for (const refused of ['.muxui-a:hover', '.muxui-a + .muxui-b', '.muxui-a ~ .muxui-b', '.muxui-a, .muxui-b', '.muxui-a::before']) {
    assert.throws(() => selectObserved(parsed, refused), /not a chain of compounds/u, refused);
  }
  for (const malformed of ['> .muxui-b', '.muxui-a >', '', '.muxui-a)', '.muxui-a[role']) {
    assert.throws(() => selectObserved(parsed, malformed), /^Error: selector|selector ".*": /u, malformed);
  }
  // The attribute tests the sheets use. An operator it cannot test is an error, never a test that is silently dropped: a dropped
  // `[role~="status"]` would have matched both buttons.
  assert.deepEqual(tags('.muxui-b[role]'), ['button.muxui-b'], 'presence');
  assert.deepEqual(tags('.muxui-b[role^="sta"]'), ['button.muxui-b'], 'prefix');
  assert.deepEqual(tags('.muxui-b[role$=\'tus\']'), ['button.muxui-b'], 'suffix');
  assert.deepEqual(tags('.muxui-b[role*=atu]'), ['button.muxui-b'], 'substring, unquoted');
  assert.deepEqual(tags('.muxui-b[role="STATUS" i]'), ['button.muxui-b'], 'the case-insensitive flag');
  assert.deepEqual(tags('.muxui-b[role="STATUS"]'), [], 'case-sensitive without it');
  assert.deepEqual(tags('.muxui-b[role^=""]'), [], 'an empty prefix matches nothing');
  for (const [selector, operator] of [['.muxui-b[role~="status"]', '~='], ['.muxui-b[role|="status"]', '|=']]) {
    assert.throws(() => selectObserved(parsed, selector), new RegExp(`unsupported attribute operator ${operator.replace('|', '\\|')}`, 'u'), selector);
  }
  for (const unsupported of ['#id', '.muxui-b[ns|role]', '.a\\:b', '&.muxui-b', '.muxui-b[role="a\\"b"]']) assert.throws(() => selectObserved(parsed, unsupported), /selector ".*": /u, unsupported);
});

test('the selector parser reads the sheets\' syntax into a tree: combinators, pseudo-classes of selectors, pseudo-elements, and the text of each complex selector', () => {
  const [first, second] = parseSelectorList(':where(.muxui-a) > .muxui-b:not([data-x=\'1\'], .muxui-c)::before , .muxui-d:has(> .muxui-e) + *');
  assert.equal(first.text, ':where(.muxui-a) > .muxui-b:not([data-x=\'1\'], .muxui-c)::before');
  assert.deepEqual(first.compounds.map(({ combinator, classes, element }) => [combinator, classes, element]), [[' ', [], null], ['>', ['muxui-b'], 'before']]);
  assert.deepEqual(first.compounds[1].pseudos[0].selectors.map(({ text }) => text), ['[data-x=\'1\']', '.muxui-c']);
  assert.deepEqual(second.compounds.map(({ combinator, tag }) => [combinator, tag]), [[' ', undefined], ['+', undefined]]);
  assert.equal(second.compounds[0].pseudos[0].selectors[0].compounds[0].combinator, '>', 'a :has() argument keeps its leading combinator');
  // A pseudo-class this reader does not look into keeps its name and drops its argument; it is the matcher that treats it as unknown.
  assert.deepEqual(parseSelectorList('.x:dir(rtl):nth-child(2n+1)')[0].compounds[0].pseudos.map(({ name, selectors }) => [name, selectors]), [['dir', null], ['nth-child', null]]);
  assert.throws(() => parseSelectorList('.x'.concat(':is(')), /selector/u);
  // Every selector the module reads out of the shipped sheets parses, which is also what proves the grammar covers them.
  assert.ok(facts.rules.length > 2000 && facts.rules.every(({ selector, selectors }) => selectors.map(({ text }) => text).join(', ').replace(/\s+/gu, '') === selector.replace(/\s+/gu, '')));
});

test('a match is true, false or unknown: a pseudo-class the caller answers null for makes its compound unknown, through ancestors and siblings too', () => {
  const parsed = parseObservation('<div class="muxui-a"><p class="muxui-b"></p><p class="muxui-c"></p></div>');
  const [, b, c] = parsed.elements;
  const matches = (selector, element, answers = {}) => matchComplex(parseSelectorList(selector)[0], element, (entry) => answers[entry.name] ?? null);
  assert.equal(matches('.muxui-b', b), true);
  assert.equal(matches('.muxui-b:hover', b, { hover: false }), false);
  assert.equal(matches('.muxui-b:hover', b, { hover: true }), true);
  assert.equal(matches('.muxui-b:disabled', b), null, 'an undecided pseudo-class is unknown');
  assert.equal(matches('.muxui-c:disabled', b), false, 'unknown does not make a different class match');
  assert.equal(matches('.muxui-a:disabled .muxui-b', b), null, 'unknown through an ancestor');
  assert.equal(matches('.muxui-a:disabled .muxui-c', b), false, 'false still wins over an unknown ancestor');
  assert.equal(matches('.muxui-a > .muxui-b + .muxui-c', c), true, 'an adjacent sibling');
  assert.equal(matches('.muxui-b ~ .muxui-c', c), true, 'a later sibling');
  assert.equal(matches('.muxui-c + .muxui-b', b), false, 'sibling order');
  assert.equal(matches('.muxui-b::before', b), false, 'a rule on a pseudo-element is not a rule on the element');
  assert.throws(() => matchComplex(parseSelectorList('.muxui-b:hover')[0], b), /:hover is not modelled/u, 'with no model for a pseudo-class, the matcher refuses it');
});

// ---------------------------------------------------------------------------------------------------------------------------
// The hooks block.
// ---------------------------------------------------------------------------------------------------------------------------

const { partRows, selectorOf } = facts.parts;

test('every part-map row is a class row of its family, once and in anatomy order, with the note its fields call for', () => {
  assert.equal(slugs.length, 84);
  let total = 0;
  for (const slug of slugs) {
    const expected = partRows.filter((row) => row.family === slug);
    const rows = classRows(all.get(slug));
    assert.deepEqual([...rows].map(({ part }) => part).sort(), expected.map(({ part }) => part).sort(), `${slug}: one class row per part-map row`);
    assert.deepEqual(rows.map(({ part }) => part), (() => {
      const root = expected.find((row) => row.part === 'root') ?? expected.find((row) => row.disposition === 'root-element');
      return [root.part, ...expected.filter((row) => row !== root).map(({ part }) => part)];
    })(), `${slug}: the root first, then the parts in anatomy order`);
    total += rows.length;
    for (const row of rows) {
      const source = expected.find(({ part }) => part === row.part);
      assert.equal(row.disposition, source.disposition);
      assert.equal(row.hook, ['none', 'internal'].includes(source.disposition) ? null : selectorOf(source), `${slug}.${row.part}: the hook is the contract selector, and none for an internal or element-less part`);
      assert.equal(row.kind, 'class');
      assert.equal(row.origin, 'part');
    }
  }
  assert.equal(total, 448);
  const dispositions = Object.groupBy(allRows(classRows), ({ row }) => row.disposition);
  assert.deepEqual(Object.fromEntries(Object.entries(dispositions).map(([name, list]) => [name, list.length])), { class: 352, 'root-element': 8, field: 48, composed: 11, internal: 10, none: 19 });
  const byNote = (pattern) => allRows(classRows).filter(({ row }) => pattern.test(row.note));
  assert.equal(allRows(classRows).filter(({ row }) => row.hookOnly).length, 12);
  assert.equal(byNote(/Hook only: no Mux rule styles it\./u).length, 12);
  assert.equal(byNote(/^Internal: no hook\.$/u).length, 10);
  assert.equal(byNote(/^Renders no element \(/u).length, 19);
});

test('class notes keep the part map\'s conditions: caller-supplied elements, composed roots, wrapper exceptions and scopes', () => {
  const row = (slug, part) => classRows(all.get(slug)).find((candidate) => candidate.part === part);
  // A caller-supplied element keeps the part map's own condition and prints as the caller's element.
  for (const [slug, part] of [['file-trigger', 'root'], ['popover', 'trigger']]) {
    const source = partRows.find((candidate) => candidate.family === slug && candidate.part === part);
    assert.equal(row(slug, part).conditional, source.callerSupplied);
    assert.equal(row(slug, part).on, 'caller\'s element');
    assert.match(row(slug, part).note, /a native button child carries|a native button carries/u);
    assert.doesNotMatch(row(slug, part).note, /Composed from Button/u, 'the condition replaces the unconditional claim');
  }
  assert.equal(allRows(classRows).filter(({ row: candidate }) => candidate.conditional !== undefined).length, 2);
  // The other composedOf rows say Composed from Button, and the family they are composed of is data.
  const composedOf = allRows(classRows).filter(({ row: candidate }) => candidate.composedOf !== undefined && candidate.conditional === undefined);
  assert.equal(composedOf.length, 15);
  for (const { row: candidate } of composedOf) assert.match(candidate.note, /Composed from Button: also carries \.muxui-button\./u);
  // The three wrapper exceptions keep their explanation; the six scoped rows name their scope.
  assert.match(row('input', 'root').note, /Input\.Root renders the wrapper as muxui-input__root/u);
  assert.match(row('input', 'input').note, /The control carries the family class itself/u);
  assert.match(row('menu', 'root').note, /Menu\.Root renders the wrapper as muxui-menu__root/u);
  assert.equal(row('text-field', 'label').hook, '.muxui-text-field .muxui-field-label');
  assert.match(row('text-field', 'label').note, /^Anatomy label\. Shared field part, scoped by \.muxui-text-field\.$/u);
  assert.match(row('checkbox-group', 'label').note, /scoped by \.muxui-checkbox-group__field\./u);
  assert.equal(row('card', 'button').hook, 'button.muxui-card');
  assert.equal(row('card', 'button').qualifier, 'button');
  assert.equal(row('card', 'button').note, 'Anatomy button. The card root as a native button.');
  assert.match(row('color-picker', 'field').note, /Composed from ColorField: select \.muxui-color-field\./u);
  assert.match(row('date-picker', 'calendar').note, /Composed from Calendar: select \.muxui-date-picker__popover \.muxui-calendar\./u);
  assert.match(row('alert-dialog', 'root').note, /^Renders no element \(a provider\)\.$/u);
});

test('observed tags come from this family\'s own examples, name their renders, and are labelled as observations', () => {
  const button = all.get('button');
  const row = (styling, part) => classRows(styling).find((candidate) => candidate.part === part);
  assert.deepEqual([row(button, 'root').tags, row(button, 'root').on, row(button, 'root').inRoot], [['button'], '<button>', false]);
  assert.deepEqual([row(button, 'label').tags, row(button, 'label').on, row(button, 'label').inRoot], [['span'], '<span> in root', true]);
  assert.ok(row(button, 'root').provenance.every((source) => /^catalog\/components\/button\/examples\/react\/[a-z-]+\.tsx$/u.test(source)));
  assert.ok(row(button, 'root').provenance.length > 1, 'the sources are every render that showed it');
  assert.equal(button.hooks.observationNote, 'Tags are observed in this component\'s catalog examples (server render), not a guarantee: a part can render another element when you change its props.');
  // Several tags are listed in first-seen order; a root-element row shows its qualifier tag when no render matched.
  const card = all.get('card');
  assert.deepEqual(row(card, 'root').tags, ['div', 'button']);
  assert.equal(row(card, 'root').on, '<div>, <button>');
  assert.equal(row(card, 'button').on, '<button>');
  // A part that no example renders says so: '-' and the note, with no tag.
  const dialog = all.get('alert-dialog');
  assert.equal(row(dialog, 'popup').on, '-');
  assert.match(row(dialog, 'popup').note, /Not in a catalog example\.$/u);
  assert.deepEqual(row(dialog, 'popup').emittedOn, []);
  // Every tag of every row is the tag of an element that jsdom finds under that selector in a render of the same family.
  const documents = new Map(renders.map(({ name, html, family }) => [name, { family, document: new JSDOM(`<!doctype html><body>${html}`).window.document }]));
  let checked = 0;
  for (const { slug, row: candidate } of allRows(classRows)) {
    if (candidate.tags.length === 0) continue;
    const found = [...documents.values()].filter(({ family }) => family === slug).flatMap(({ document }) => [...document.querySelectorAll(candidate.hook)]);
    assert.deepEqual([...new Set(found.map((element) => element.localName))], candidate.tags, `${slug}.${candidate.part}: the tags jsdom finds`);
    checked += 1;
  }
  assert.ok(checked > 250, `${checked} rows have observed tags`);
});

test('without observations the object is valid and less detailed: no tags, no Rendered DOM, no companion', () => {
  const bare = stylingOf('button', { observations: [], examples: [] });
  assert.ok(classRows(bare).every((row) => row.tags.length === 0 && row.provenance.length === 0 && row.emittedOn.length === 0));
  assert.equal(bare.hooks.renderedDom, null);
  assert.equal(bare.hooks.observationNote, 'Not observed: no example render was supplied.');
  assert.ok(classRows(bare).every((row) => !/Not in a catalog example/u.test(row.note)), 'no render, so nothing to say a render lacked');
  // Without a render IconButton has no companion, so its variant row (selected through Button's hook) is the one thing it loses.
  assert.ok(!reflectedRowsOf(stylingOf('icon-button', { observations: [] })).some(({ hook }) => hook === 'data-muxui-variant'));
  assert.ok(reflectedRowsOf(all.get('icon-button')).some(({ hook }) => hook === 'data-muxui-variant'));
  // Another family's renders are never read.
  assert.deepEqual(stylingOf('button', { observations: observations.filter(({ family }) => family !== 'button') }), stylingOf('button', { observations: [] }));
});

test('families with one part, with no state, and with a hook-only root degrade as the plan says', () => {
  const singleRoot = ['button-group', 'color-mode-toggle', 'color-swatch', 'image', 'separator', 'text'];
  assert.deepEqual(slugs.filter((slug) => partRows.filter((row) => row.family === slug).length === 1), singleRoot);
  for (const slug of singleRoot) assert.equal(classRows(all.get(slug)).length, 1, `${slug}: a one-row Hooks table`);
  // Meter, Toast and Text declare no state, so they have no State group unless an interaction or observed row exists.
  for (const slug of ['meter', 'toast', 'text']) assert.deepEqual(records.get(slug).states.map((name) => facts.parts.catalogStateKinds[name]?.[0]).filter((kind) => kind === 'state' || kind === 'enum' || kind === 'status'), [], `${slug} declares no state`);
  assert.ok(!all.get('toast').hooks.groups.some(({ id }) => id === 'state'));
  assert.ok(!all.get('text').hooks.groups.some(({ id }) => id === 'state'));
  // Every family has a root row (Toast and Tooltip name the root element after the family) and at least one token requirement.
  for (const slug of slugs) {
    assert.ok(classRows(all.get(slug)).length > 0, `${slug} has class rows`);
    assert.ok(all.get(slug).tokens.groups.reduce((total, group) => total + group.rows.length, 0) > 0, `${slug} has token rows`);
  }
  assert.deepEqual(groupRows(all.get('toast'), 'root').map(({ part }) => part), ['toast']);
  assert.deepEqual(groupRows(all.get('tooltip'), 'root').map(({ part }) => part), ['tooltip']);
  assert.equal(groupRows(all.get('alert-dialog'), 'root')[0].noElement, 'provider');
});

// ---------------------------------------------------------------------------------------------------------------------------
// State rows: what the stylesheet selects against what a render emitted.
// ---------------------------------------------------------------------------------------------------------------------------

const kindsOfState = facts.parts.catalogStateKinds;
const statusAttributes = new Set(['data-muxui-loaded', 'data-muxui-fallback', 'data-muxui-error']);
const isStatus = (row) => statusAttributes.has(row.hook);
const attributeOfState = (name) => {
  const [kind, ...target] = kindsOfState[name];
  return kind === 'state' || kind === 'enum' ? `data-muxui-state-${target[0]}` : kind === 'status' ? `data-muxui-${target[0]}` : null;
};

/**
 * A second reading of which attributes a stylesheet selects on which classes, by rewriting instead of parsing, sharing no code with
 * the module: each selector becomes plain selectors (`:is()` and `:where()` are distributed over their branches, a `:not()` is
 * reduced to the attribute tests it holds, a `:has()` moves out to selectors of its own), and each compound of a plain selector is
 * then read with two patterns. A pair is an attribute test and a class written in one compound. The rules are found by pattern in
 * the built stylesheet, not by the module's brace walker.
 */
const depthBefore = (text) => {
  const depths = [];
  let depth = 0;
  let quote = null;
  for (const char of text) {
    if (quote) { depths.push(depth); if (char === quote) quote = null; continue; }
    if (char === '"' || char === '\'') quote = char;
    if (char === ')' || char === ']') depth -= 1;
    depths.push(depth);
    if (char === '(' || char === '[') depth += 1;
  }
  return depths;
};
const splitAtTop = (text, accepts) => {
  const depths = depthBefore(text);
  const parts = [''];
  for (const [index, char] of [...text].entries()) {
    if (depths[index] === 0 && accepts(char)) parts.push('');
    else parts[parts.length - 1] += char;
  }
  return parts;
};
/** The [from, to) spans of the compounds of a selector: the stretches between combinators at the top level. */
const compoundSpans = (text) => {
  const depths = depthBefore(text);
  const spans = [];
  let from = null;
  for (let index = 0; index <= text.length; index += 1) {
    const separator = index === text.length || (depths[index] === 0 && /[\s>+~]/u.test(text[index]));
    if (!separator && from === null) from = index;
    if (separator && from !== null) { spans.push([from, index]); from = null; }
  }
  return spans;
};
function plainSelectors(selector) {
  const depths = depthBefore(selector);
  for (const match of selector.matchAll(/:(is|where|not|has)\(/gu)) {
    if (depths[match.index] !== 0) continue;
    const open = match.index + match[0].length - 1;
    const close = [...selector].findIndex((char, index) => index > open && depths[index] === 0 && char === ')');
    const [from, to] = compoundSpans(selector).find(([start, end]) => start <= match.index && match.index < end);
    const [head, before, after, tail] = [selector.slice(0, from), selector.slice(from, match.index), selector.slice(close + 1, to), selector.slice(to)];
    const alternatives = splitAtTop(selector.slice(open + 1, close), (char) => char === ',').map((text) => text.trim());
    const lastCompound = (alternative) => alternative.slice(compoundSpans(alternative).at(-1)[0]);
    if (match[1] === 'is' || match[1] === 'where') {
      return alternatives.flatMap((alternative) => plainSelectors(`${head}${alternative.slice(0, alternative.length - lastCompound(alternative).length)}${lastCompound(alternative)}${before}${after}${tail}`));
    }
    if (match[1] === 'not') {
      const tests = alternatives.flatMap((alternative) => [...lastCompound(alternative).matchAll(/\[[^\]]*\]/gu)].map(([test]) => test));
      return plainSelectors(`${head}${before}${tests.join('')}${after}${tail}`);
    }
    return [...plainSelectors(`${head}${before}${after}${tail}`), ...alternatives.flatMap((alternative) => plainSelectors(alternative.replace(/^[>+~\s]+/u, '')))];
  }
  return [selector];
}
/** The `attribute|class` pairs one selector list writes in one compound. */
function independentPairsOf(selectorList) {
  const pairs = new Set();
  for (const complex of splitAtTop(selectorList, (char) => char === ',')) {
    for (const selector of plainSelectors(complex.trim())) {
      for (const [from, to] of compoundSpans(selector)) {
        const compound = selector.slice(from, to);
        const attributes = [...compound.matchAll(/\[\s*(data-muxui-[\w-]+)/gu)].map(([, name]) => name);
        const classes = [...compound.replace(/\[[^\]]*\]/gu, '').matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name);
        for (const attribute of attributes) for (const name of classes) pairs.add(`${attribute}|${name}`);
      }
    }
  }
  return pairs;
}
function independentPairs() {
  const css = readFileSync(resolve(packageRoot, 'generated/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, ' ');
  const pairs = new Set();
  for (const [, prelude] of css.matchAll(/([^{};]+)\{/gu)) {
    if (!prelude.trim().startsWith('@')) for (const pair of independentPairsOf(prelude)) pairs.add(pair);
  }
  return pairs;
}
const second = independentPairs();
const secondHas = (attribute, name) => second.has(`${attribute}|${name}`);
/** The same pairs from the module's tree, for one selector list. */
const modulePairsOf = (selectorList) => {
  const { subject, context, conditions } = describeElements(parseSelectorList(selectorList));
  return new Set([...subject, ...context, ...conditions].flatMap(({ classes, attributes }) => attributes.flatMap(({ name }) => classes.map((className) => `${name}|${className}`))));
};

test('the selection index is a second reading of the stylesheet, pair for pair, and each test belongs to the compound it is written in', () => {
  const mine = new Set([...facts.selection].flatMap(([attribute, byClass]) => [...byClass.keys()].map((name) => `${attribute}|${name}`)));
  assert.deepEqual([...second].filter((pair) => !mine.has(pair)).sort(), [], 'a pair the second reading finds and the module lacks');
  assert.deepEqual([...mine].filter((pair) => !second.has(pair)).sort(), [], 'a pair the module holds and the second reading does not');
  assert.equal(mine.size, 492);
  // The scoping rules, on selectors written for them, by both readings. An attribute in :has() belongs to the element asked for;
  // each :where() / :is() branch stands alone; a :not() test counts for the element it is on; an ancestor's tests are its own.
  const cases = [
    ['.muxui-a:has(.muxui-b[data-muxui-state-x])', ['data-muxui-state-x|muxui-b']],
    ['.muxui-a[data-muxui-state-y]:has(.muxui-b[data-muxui-state-x])', ['data-muxui-state-x|muxui-b', 'data-muxui-state-y|muxui-a']],
    [':where(.muxui-a[data-muxui-state-x], .muxui-b[data-muxui-state-y])', ['data-muxui-state-x|muxui-a', 'data-muxui-state-y|muxui-b']],
    ['.muxui-a:is(.muxui-b[data-muxui-state-x], .muxui-c)', ['data-muxui-state-x|muxui-a', 'data-muxui-state-x|muxui-b']],
    ['.muxui-a:not([data-muxui-state-x]) .muxui-b', ['data-muxui-state-x|muxui-a']],
    ['.muxui-a:not(.muxui-b[data-muxui-state-x])', ['data-muxui-state-x|muxui-a']],
    ['.muxui-a[data-muxui-state-x] > .muxui-b, .muxui-c[data-muxui-state-y]', ['data-muxui-state-x|muxui-a', 'data-muxui-state-y|muxui-c']],
    ['.muxui-a .muxui-b[data-muxui-state-x]::before', ['data-muxui-state-x|muxui-b']],
    [':where(.muxui-a:not([data-muxui-state-x])) .muxui-b[data-muxui-state-y]', ['data-muxui-state-x|muxui-a', 'data-muxui-state-y|muxui-b']],
  ];
  for (const [selector, expected] of cases) {
    assert.deepEqual([...modulePairsOf(selector)].sort(), expected, `${selector}: the module's tree`);
    assert.deepEqual([...independentPairsOf(selector)].sort(), expected, `${selector}: the second reading`);
  }
  // The shipped case the pairs got wrong: a ToggleButtonGroup's buttons are disabled and selected, the group is neither.
  for (const attribute of ['data-muxui-state-disabled', 'data-muxui-state-selected']) {
    assert.ok(!facts.selection.get(attribute).has('muxui-toggle-button-group'), `${attribute} is not selected on the group`);
    assert.deepEqual(stateRowsOf(all.get('toggle-button-group')).find(({ hook }) => hook === attribute).selectedOn, ['button']);
  }
});

test('catalog state rows: one per attribute and family, in catalog order, with the validated counts under the same definition', () => {
  const catalogRows = allRows(stateRowsOf).filter(({ row }) => row.origin === 'catalog');
  assert.equal(catalogRows.length, 264, '258 state and enumerated pairs plus 6 status rows');
  assert.deepEqual(catalogRows.filter(({ row }) => isStatus(row)).map(({ slug, row }) => `${slug} ${row.hook}`), [
    'avatar data-muxui-loaded', 'avatar data-muxui-fallback', 'avatar data-muxui-error', 'image data-muxui-fallback', 'image data-muxui-error', 'prompt-composer data-muxui-error',
  ]);
  // The attribute set of each family is its catalog states mapped through the classification, deduplicated, in declared order.
  for (const slug of slugs) {
    const expected = [...new Set(records.get(slug).states.map(attributeOfState).filter(Boolean))];
    assert.deepEqual(stateRowsOf(all.get(slug)).filter(({ origin }) => origin === 'catalog').map(({ hook }) => hook), expected, `${slug}: the catalog attributes in order`);
  }
  // The enumerated attribute is one row whose values are the enumeration; the two catalog names are listed.
  const orientation = stateRowsOf(all.get('separator')).find(({ hook }) => hook === 'data-muxui-state-orientation');
  assert.deepEqual([orientation.values, orientation.catalog, orientation.origin], [['horizontal', 'vertical'], ['horizontal', 'vertical'], 'catalog']);
  assert.match(orientation.note, /^Catalog states horizontal, vertical\./u);
  // 258 pairs. The plan counted 126 of them as selected on a class or root-element hook of the family, reading a test in :has() or in
  // another :where() branch as the outer class's (ToggleButtonGroup's disabled and selected, which are the buttons', landed on the
  // group). Counted per compound by a second reading of the stylesheet, 124 are, and 134 are not. The module also counts shared field
  // hooks, composed roots and a root companion, which can only add pairs, and the extra ones are named.
  const pairs = catalogRows.filter(({ row }) => !isStatus(row));
  assert.equal(pairs.length, 258);
  const ownHooks = (slug) => new Set(partRows.filter((row) => row.family === slug && ['class', 'root-element'].includes(row.disposition)).map((row) => row.hook));
  const own = pairs.filter(({ slug, row }) => [...ownHooks(slug)].some((name) => secondHas(row.hook, name)));
  assert.equal(own.length, 124, 'selected on a class or root-element hook of the family');
  assert.equal(pairs.length - own.length, 134);
  assert.ok(own.every(({ row }) => row.selectedOn.length > 0));
  // The two ToggleButtonGroup rows leave the first count and join this one: its buttons are composed Buttons, and Button's rules select them.
  assert.deepEqual(pairs.filter(({ row }) => row.selectedOn.length > 0).length - own.length, 12, 'selected only through a shared field hook, a composed root or a companion');
  // Each pair that no documented hook selects says so exactly: either only an internal part does, or nothing does.
  for (const { slug, row } of pairs.filter(({ row: candidate }) => candidate.selectedOn.length === 0)) {
    assert.match(row.note, /No Mux rule selects this attribute on a documented hook\.|only on an internal part/u, `${slug} ${row.hook}`);
  }
  assert.deepEqual(pairs.filter(({ row }) => /only on an internal part/u.test(row.note)).map(({ slug, row }) => `${slug} ${row.hook}`), [
    'date-field data-muxui-state-read-only', 'date-picker data-muxui-state-read-only', 'time-field data-muxui-state-read-only',
  ]);
});

test('interaction rows: per family, only for a state the CSS selects on the family\'s own class hooks, labelled as such', () => {
  const interaction = allRows(stateRowsOf).filter(({ row }) => row.origin === 'interaction');
  assert.equal(interaction.length, 84);
  assert.equal(new Set(interaction.map(({ slug }) => slug)).size, 40);
  const names = interaction.map(({ row }) => row.hook.replace('data-muxui-state-', ''));
  assert.ok(names.every((name) => interactionStates.includes(name)));
  assert.equal(interactionStates.length, 12);
  for (const { slug, row } of interaction) {
    assert.ok(row.selectedOn.length > 0, `${slug} ${row.hook} is selected somewhere`);
    assert.equal(row.note, `Interaction state. Selected by Mux CSS on ${row.selectedOn.join(', ')}. Not declared in the catalog for this component. It appears on an element only while React Aria reports that state for it; not every hook reports every state.`);
    assert.ok(!records.get(slug).states.some((state) => attributeOfState(state) === row.hook), `${slug} ${row.hook} is not a catalog row`);
  }
  // Recounted from the part map and the second reading: an undeclared interaction state on a class or root-element hook of the family.
  const recount = [];
  for (const slug of slugs) {
    const declared = new Set(records.get(slug).states.map(attributeOfState));
    const hooks = new Set(partRows.filter((row) => row.family === slug && ['class', 'root-element'].includes(row.disposition)).map((row) => row.hook));
    for (const name of interactionStates) {
      const attribute = `data-muxui-state-${name}`;
      if (!declared.has(attribute) && [...hooks].some((hook) => secondHas(attribute, hook))) recount.push(`${slug} ${attribute}`);
    }
  }
  assert.equal(recount.length, 84, 'the plan\'s 84 rows over 40 families, own class hooks');
  assert.equal(new Set(recount.map((entry) => entry.split(' ')[0])).size, 40);
  const printed = new Set(interaction.map(({ slug, row }) => `${slug} ${row.hook}`));
  assert.deepEqual(recount.filter((entry) => !printed.has(entry)), []);
  assert.deepEqual([...printed].filter((entry) => !recount.includes(entry)), [], 'a root companion adds no interaction row today');
  // Shared field hooks never add an interaction row of their own: TextField's input is selected for focused and open, and neither is a row.
  assert.deepEqual(stateRowsOf(all.get('text-field')).map(({ hook }) => hook), ['data-muxui-state-disabled', 'data-muxui-state-read-only', 'data-muxui-state-required', 'data-muxui-state-invalid']);
});

test('selectedOn and emittedOn are separate facts: a render shows what the CSS does not name, and the CSS names what no render shows', () => {
  const rowOf = (slug, hook) => everyRow(all.get(slug)).find((row) => row.hook === hook);
  // Styled and emitted at rest.
  assert.deepEqual([rowOf('button', 'data-muxui-state-disabled').selectedOn, rowOf('button', 'data-muxui-state-disabled').emittedOn], [['root'], ['root']]);
  // Styled, and no example puts Button in a pending state.
  assert.deepEqual([rowOf('button', 'data-muxui-state-pending').selectedOn, rowOf('button', 'data-muxui-state-pending').emittedOn], [['root'], []]);
  assert.equal(rowOf('button', 'data-muxui-state-pending').on, 'root styled');
  // Emitted where the CSS names no hook of the family: ButtonGroup's orientation.
  const orientation = rowOf('button-group', 'data-muxui-state-orientation');
  assert.deepEqual([orientation.selectedOn, orientation.emittedOn, orientation.on], [[], ['root'], 'root']);
  // The On cell lists emitted parts first, then the selected-only parts with the styled suffix.
  const checkbox = rowOf('checkbox', 'data-muxui-state-selected');
  assert.deepEqual([checkbox.selectedOn, checkbox.emittedOn, checkbox.on], [['root', 'indicator'], ['root', 'indicator'], 'root, indicator']);
  const tabs = rowOf('tabs', 'data-muxui-state-selected');
  assert.ok(tabs.on === 'tab' || /^tab/u.test(tabs.on));
  // Every emittedOn entry is real: jsdom finds an element of that part carrying the attribute in a render of the family.
  const documents = renders.map(({ family, html }) => ({ family, document: new JSDOM(`<!doctype html><body>${html}`).window.document }));
  let emittedRows = 0;
  for (const slug of slugs) {
    for (const row of everyRow(all.get(slug)).filter(({ kind }) => kind !== 'class')) {
      for (const part of row.emittedOn) {
        const source = partRows.find((candidate) => candidate.family === slug && candidate.part === part);
        const found = documents.filter(({ family }) => family === slug).some(({ document }) => [...document.querySelectorAll(selectorOf(source))].some((element) => element.hasAttribute(row.hook)));
        assert.ok(found, `${slug} ${row.hook} is emitted on ${part}`);
        emittedRows += 1;
      }
      for (const part of row.selectedOn) assert.ok(partRows.some((candidate) => candidate.family === slug && candidate.part === part), `${slug} ${row.hook}: ${part} is a part`);
    }
  }
  assert.ok(emittedRows > 50, `${emittedRows} emitted attributes were checked against jsdom`);
});

test('undeclared styled states are interaction rows, observed rows, or findings: the catalog and the CSS disagree about 27 pairs', () => {
  const observed = allRows(stateRowsOf).filter(({ row }) => row.origin === 'observed');
  assert.deepEqual(observed.map(({ slug, row }) => `${slug}:${row.hook.replace('data-muxui-state-', '')}`), [
    'checkbox-field:selected', 'checkbox-group:orientation', 'grid-list:layout', 'grid-list:orientation', 'list-box:layout', 'list-box:orientation', 'radio-group:orientation',
    'select:placeholder', 'slider:orientation', 'switch-field:selected', 'table:allows-sorting', 'table:sort-direction', 'tabs:orientation', 'toggle-button-group:orientation', 'tree:has-child-items',
  ]);
  for (const { row } of observed) {
    assert.ok(row.emittedOn.length > 0 && row.provenance.length > 0);
    assert.match(row.note, /^Styled by Mux and observed in catalog\/components\/[a-z-]+\/examples\/react\/[a-z-]+\.tsx(?:, [^;]+)*; not declared in the catalog\.$/u);
  }
  // The rest are not printed. They are drift between the catalog and the CSS, reported here and not hidden.
  const findings = slugs.flatMap((slug) => undeclaredUnobservedStates({ slug, artifact: records.get(slug), facts, observations }).map((attribute) => `${slug}:${attribute.replace('data-muxui-state-', '')}`));
  assert.deepEqual(findings, [
    'calendar:outside-month', 'calendar:today', 'calendar:unavailable', 'color-mode-toggle:selected', 'color-picker:invalid', 'color-picker:required', 'color-slider:invalid', 'color-slider:required',
    'combo-box:required', 'combo-box:selected', 'command-palette:invalid', 'command-palette:selected', 'disclosure:pending', 'markdown:current', 'markdown:disabled',
    'menu:selected', 'preview-trigger:placement', 'prompt-composer:invalid', 'range-calendar:outside-month', 'range-calendar:selection-end', 'range-calendar:selection-start', 'range-calendar:today',
    'range-calendar:unavailable', 'select:required', 'slider:invalid', 'slider:required', 'tooltip:placement',
  ]);
  // With no render, every undeclared non-interaction state is a finding, and none is printed.
  assert.equal(slugs.flatMap((slug) => undeclaredUnobservedStates({ slug, artifact: records.get(slug), facts, observations: [] })).length, findings.length + observed.length);
});

test('status rows print the catalog row and claim nothing about who writes it', () => {
  for (const { slug, row } of allRows(stateRowsOf).filter(({ row: candidate }) => isStatus(candidate))) {
    assert.equal(row.note, 'Status row from the catalog.', `${slug} ${row.hook}`);
    assert.equal(row.origin, 'catalog');
  }
});

// ---------------------------------------------------------------------------------------------------------------------------
// Reflected rows (Rule P2) and the bounded "not set by" rows.
// ---------------------------------------------------------------------------------------------------------------------------

test('reflected rows: a prop the stylesheet selects on a hook the family\'s element carries, with the 35 validated pairs and the companion one', () => {
  const pairs = allRows(reflectedRowsOf).map(({ slug, row }) => `${slug}.${row.hook.slice('data-muxui-'.length)}`);
  assert.equal(pairs.length, 36);
  assert.equal(new Set(pairs.map((pair) => pair.split('.')[0])).size, 33);
  // Recounted from the derived APIs and the second reading of the stylesheet, on the family's own class and root-element hooks.
  const recount = [];
  for (const slug of slugs) {
    const props = new Set(records.get(slug).bindings['web.react'].api.props);
    const hooks = partRows.filter((row) => row.family === slug && ['class', 'root-element'].includes(row.disposition)).map((row) => row.hook);
    for (const [attribute, byClass] of facts.selection) {
      if (!attribute.startsWith('data-muxui-state-') && props.has(attribute.slice('data-muxui-'.length)) && hooks.some((name) => byClass.has(name))) recount.push(`${slug}.${attribute.slice('data-muxui-'.length)}`);
    }
  }
  assert.equal(recount.length, 35, 'Rule P: 35 pairs over 33 families');
  assert.equal(new Set(recount.map((pair) => pair.split('.')[0])).size, 33);
  assert.deepEqual(pairs.filter((pair) => !recount.includes(pair)), ['icon-button.variant'], 'the one pair a companion hook adds');
  assert.deepEqual(recount.filter((pair) => !pairs.includes(pair)), []);
  // Per attribute: size 28, variant 3 (+1), shape, color, wrap and sender once each.
  const byName = {};
  for (const pair of pairs) byName[pair.split('.')[1]] = (byName[pair.split('.')[1]] ?? 0) + 1;
  assert.deepEqual(byName, { size: 28, variant: 4, wrap: 1, shape: 1, sender: 1, color: 1 });
});

test('IconButton\'s variant is selected through the Button hook its root element also carries, and says so', () => {
  const variant = reflectedRowsOf(all.get('icon-button')).find(({ hook }) => hook === 'data-muxui-variant');
  assert.equal(variant.companion, '.muxui-button');
  assert.deepEqual(variant.selectedOn, ['root']);
  assert.match(variant.note, /Selected through \.muxui-button, which the root element also carries \(Button\)\.$/u);
  assert.ok(variant.provenance.length > 0 && variant.provenance.every((source) => source.startsWith('catalog/components/icon-button/')));
  // Its size is selected on its own hook as well, so it names no companion.
  const size = reflectedRowsOf(all.get('icon-button')).find(({ hook }) => hook === 'data-muxui-size');
  assert.equal(size.companion, undefined);
  // The companion must be on every observed root element: a caller-supplied root names none, and a family that is not composed has none.
  assert.equal(allRows(reflectedRowsOf).filter(({ row }) => row.companion !== undefined).length, 1);
});

test('values and defaults come from the declared type, named references resolve, and an unresolvable one is an error', () => {
  const row = (slug, name) => reflectedRowsOf(all.get(slug)).find(({ hook }) => hook === `data-muxui-${name}`);
  assert.deepEqual([row('button', 'variant').values, row('button', 'variant').default], [['primary', 'neutral', 'ghost', 'danger', 'danger-neutral', 'danger-ghost', 'inverse'], 'primary']);
  assert.match(row('button', 'variant').note, /^Prop variant: primary \(default\), neutral, ghost, danger, danger-neutral, danger-ghost, inverse\./u);
  // TextField\'s stylesheet selects sm and lg only; the declared type and default hold md.
  const stylesheetSizes = [...facts.selection.get('data-muxui-size').get('muxui-text-field')].sort();
  assert.deepEqual(stylesheetSizes, ['lg', 'sm']);
  assert.deepEqual([row('text-field', 'size').values, row('text-field', 'size').default], [['sm', 'md', 'lg'], 'md']);
  assert.deepEqual(row('icon-button', 'variant').default, 'ghost', 'the family\'s own default, not Button\'s');
  // A prop with no declared literal type falls back to the stylesheet\'s values and has no default.
  assert.deepEqual([row('code-block', 'wrap').values, row('code-block', 'wrap').default], [[], undefined]);
  assert.equal(row('code-block', 'wrap').note, 'Prop wrap. The value is the prop value.');
  for (const { slug, row: candidate } of allRows(reflectedRowsOf)) {
    const api = records.get(slug).bindings['web.react'].api;
    const prop = candidate.hook.slice('data-muxui-'.length);
    const kind = api.propDetails[prop].type.kind;
    assert.ok(['reference', 'union', 'boolean', 'string'].includes(kind), `${slug}.${prop} is a ${kind}`);
    if (kind === 'reference' || kind === 'union') assert.ok(candidate.values.length > 1, `${slug}.${prop}: declared values, not the stylesheet's`);
    if (candidate.default !== undefined) assert.ok(candidate.values.includes(candidate.default), `${slug}.${prop}: the default is one of the values`);
  }
  assert.equal(allRows(reflectedRowsOf).filter(({ slug, row: candidate }) => records.get(slug).bindings['web.react'].api.propDetails[candidate.hook.slice(11)].type.kind === 'reference').length, 14 + 1, '14 named references (and IconButton\'s variant)');
  // A named type that is not in the derived API, or is not a union of literals, fails and never degrades to the stylesheet\'s list.
  const change = (edit) => {
    const record = structuredClone(records.get('button'));
    edit(record.bindings['web.react'].api);
    return record;
  };
  const without = (record) => stylingFor({ slug: 'button', artifact: record, facts, observations });
  assert.throws(() => without(change((api) => { delete api.propDetails.variant.enum; delete api.types.ButtonVariant; })), /variant: the type ButtonVariant does not resolve to a union of literals/u);
  assert.throws(() => without(change((api) => { delete api.propDetails.variant.enum; api.types.ButtonVariant = { type: { kind: 'object', members: [] } }; })), /does not resolve to a union of literals/u);
  assert.deepEqual(reflectedRowsOf(without(change((api) => { delete api.propDetails.variant.enum; }))).find(({ hook }) => hook === 'data-muxui-variant').values, row('button', 'variant').values, 'resolved through the named type when the enum is absent');
});

test('"not set by" rows need positive evidence: no prop, no literal in the runtime source, no companion that writes it, and no render that shows it', () => {
  const notSet = (slug) => all.get(slug).hooks.notSet.map(({ hook }) => hook);
  assert.deepEqual(notSet('button'), ['data-muxui-color']);
  assert.deepEqual(notSet('text-field'), ['data-muxui-variant', 'data-muxui-color']);
  assert.deepEqual(notSet('icon-button'), ['data-muxui-color'], 'IconButton declares size and variant');
  assert.equal(allRows((styling) => styling.hooks.notSet).length, 38);
  assert.match(all.get('button').hooks.notSet[0].note, /^Button has no color prop and its source writes no data-muxui-color\.$/u);
  // Only a family that styles at least one reflected attribute gets any; and never a name outside the closed list.
  for (const slug of slugs) {
    const styling = all.get(slug);
    if (styling.hooks.notSet.length > 0) assert.ok(reflectedRowsOf(styling).length > 0, `${slug}: has reflected rows`);
    for (const row of styling.hooks.notSet) {
      assert.match(row.hook, /^data-muxui-(?:size|variant|color)$/u);
      assert.deepEqual([row.selectedOn, row.emittedOn, row.on], [[], [], '-']);
      const api = records.get(slug).bindings['web.react'].api;
      assert.ok(!api.props.includes(row.hook.slice(11)), `${slug}: no ${row.hook} prop`);
      // A render of the family never shows the attribute, on any element.
      for (const { html } of observations.filter(({ family }) => family === slug)) assert.ok(!new RegExp(`${row.hook}(?![\\w-])`, 'u').test(html), `${slug}: no render shows ${row.hook}`);
    }
  }
  // The control: a family that writes the attribute in its source or in a render is not "not set". Hiding Button\'s variant prop
  // and its reflected row leaves the render that shows data-muxui-variant to keep it out of the list.
  const hidden = structuredClone(records.get('button'));
  hidden.bindings['web.react'].api.props = hidden.bindings['web.react'].api.props.filter((name) => name !== 'variant');
  const shown = stylingFor({ slug: 'button', artifact: hidden, facts, observations });
  assert.ok(!shown.hooks.notSet.some(({ hook }) => hook === 'data-muxui-variant'), 'the render and the runtime source write it');
  assert.ok(!reflectedRowsOf(shown).some(({ hook }) => hook === 'data-muxui-variant'));
});

// ---------------------------------------------------------------------------------------------------------------------------
// Tokens.
// ---------------------------------------------------------------------------------------------------------------------------

const tokenSource = JSON.parse(readFileSync(resolve(repositoryRoot, 'catalog/tokens/default-theme.json'), 'utf8'));
const modes = (extra) => ({ ...tokenSource.theme.defaultModes, ...extra });
const lightGraph = compilePureTokenGraph(tokenSource, { modes: modes({}), responsive: false });
const darkGraph = compilePureTokenGraph(tokenSource, { modes: modes({ colorScheme: 'dark' }), responsive: false });
const tokenRows = (styling) => styling.tokens.groups.flatMap(({ rows }) => rows);

test('token rows are the recipe requirements, each with the record\'s meaning, policy, alias and light and dark values', () => {
  const rows = allRows(tokenRows);
  assert.equal(rows.length, 839);
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(rows, ({ row }) => row.group)).map(([name, list]) => [name, list.length])), { semantic: 628, component: 211 });
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(rows, ({ row }) => row.policy)).map(([name, list]) => [name, list.length])), { theme: 768, fixed: 71 });
  assert.deepEqual([...new Set(rows.filter(({ row }) => row.policy === 'fixed').map(({ row }) => row.token))], ['semantic.focus.ring']);
  assert.equal(new Set(rows.filter(({ row }) => row.group === 'component').map(({ row }) => row.token)).size, 196);
  assert.equal(new Set(rows.filter(({ row }) => row.group === 'component').map(({ slug }) => slug)).size, 18);
  for (const slug of slugs) {
    const required = records.get(slug).bindings['web.react'].tokenRecipe.requirements;
    assert.deepEqual(tokenRows(all.get(slug)).map(({ token }) => token).sort(), required.map(({ token }) => token).sort(), `${slug}: every requirement is a row`);
  }
  for (const { slug, row } of rows) {
    const definition = tokenSource.tokens[row.token];
    assert.equal(row.cssVar, cssName(row.token));
    assert.deepEqual([row.meaning, row.policy, row.alias, row.type], [definition.meaning, definition.overridePolicy, definition.alias ?? null, definition.type], `${slug} ${row.token}`);
    assert.equal(row.light, cssValue(lightGraph.tokens[row.token]), `${row.token} light`);
    assert.equal(row.dark, cssValue(darkGraph.tokens[row.token]), `${row.token} dark`);
    assert.equal(row.readBy === null, row.group === 'semantic');
  }
  const darkAlias = rows.find(({ row }) => row.token === 'component.textfield.label').row;
  assert.deepEqual([darkAlias.alias, darkAlias.darkAlias], ['semantic.content.default', 'semantic.color.neutral-default-40']);
  assert.notEqual(darkAlias.light, darkAlias.dark);
});

test('groups: component roles first, semantic roles second, and only the long secondary groups collapse', () => {
  const tag = all.get('tag-group');
  assert.deepEqual(tag.tokens.groups.map(({ id, rows }) => [id, rows.length, rows.length > 24]), [['component', 155, true], ['semantic', 5, false]]);
  assert.equal(tokenRows(tag).length, 160);
  assert.ok(tag.tokens.groups.every(({ collapsed }) => !collapsed), 'TagGroup\'s principal group stays open');
  const collapsed = slugs.flatMap((slug) => all.get(slug).tokens.groups.filter(({ collapsed: closed }) => closed).map(({ id, rows }) => `${slug} ${id} ${rows.length}`));
  assert.deepEqual(collapsed, ['code-block semantic 30', 'data-diff semantic 25', 'text semantic 50']);
  assert.ok(slugs.every((slug) => all.get(slug).tokens.groups.every(({ id, label, caption }, index) => (id === 'component' ? index === 0 && label === 'Component roles' : label === 'Semantic roles') && caption.length > 0)));
  const noRoles = slugs.filter((slug) => !all.get(slug).tokens.groups.some(({ id }) => id === 'component'));
  assert.equal(noRoles.length, 66, '66 families have no component role');
  assert.equal(slugs.length - noRoles.length, 18);
});

test('read-by: 193 roles are read by rules, one through structured parts, one through a compiled dependency, and label-gap by nothing', () => {
  const components = new Map();
  for (const { row } of allRows(tokenRows)) if (row.group === 'component') components.set(row.token, row.readBy);
  assert.equal(components.size, 196);
  const kinds = Object.groupBy([...components], ([, readBy]) => readBy.kind);
  assert.deepEqual(Object.fromEntries(Object.entries(kinds).map(([name, list]) => [name, list.length])), { rules: 193, parts: 1, compiled: 1, none: 1 });
  assert.deepEqual(kinds.parts.map(([id]) => id), ['component.disclosuregroup.transition']);
  assert.deepEqual(kinds.compiled.map(([id]) => id), ['component.disclosuregroup.motion-duration']);
  assert.deepEqual(kinds.none.map(([id]) => id), ['component.disclosuregroup.label-gap']);
  // The same classification from the authored sources by the rule the tokens test uses for reachability: a role is read when a rule
  // var()s a custom property it compiles to, or a token that depends on it is read.
  const authored = readdirSync(resolve(packageRoot, 'src'), { recursive: true }).map(String).filter((name) => name.endsWith('.css')).map((name) => readFileSync(resolve(packageRoot, 'src', name), 'utf8')).join('\n');
  const reads = new Set([...authored.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/var\(\s*(--muxui-[\w-]+)/gu)].map(([, name]) => name));
  const dependents = new Map();
  for (const id of Object.keys(lightGraph.tokens)) for (const dependency of lightGraph.dependencies[id] ?? []) dependents.set(dependency, [...(dependents.get(dependency) ?? []), id]);
  const names = (id) => [...cssDeclaration(lightGraph.tokens[id], lightGraph.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu)].map(([, name]) => name);
  const read = (id, seen = new Set()) => !seen.has(id) && (seen.add(id), names(id).some((name) => reads.has(name)) || (dependents.get(id) ?? []).some((next) => read(next, seen)));
  for (const [id, readBy] of components) assert.equal(readBy.kind !== 'none', read(id), `${id}: read by something`);
  // label-gap: declared, no Mux CSS reader, the Basic example reads it in its own markup. It is never presented as a working role.
  const gap = components.get('component.disclosuregroup.label-gap');
  assert.equal(gap.note, 'Declared. No Mux CSS rule reads this role today. catalog/components/disclosure-group/examples/react/basic.tsx reads it in its own markup.');
  assert.deepEqual(gap.selectors, []);
  assert.deepEqual(components.get('component.disclosuregroup.transition').through.every((name) => name.startsWith('--muxui-component-disclosuregroup-transition-')), true);
  assert.match(components.get('component.disclosuregroup.motion-duration').note, /^Read through component\.disclosuregroup\.transition, which depends on it\.$/u);
  // Selectors are verbatim, with their conditions, and a selector naming a class that is not a documented hook says so.
  const selectors = [...components.values()].flatMap(({ selectors: list }) => list);
  const distinct = new Set();
  let entries = 0; const internalTokens = new Set();
  for (const [id, readBy] of components) for (const entry of readBy.selectors) { distinct.add(`${id}|${entry.selector}`); entries += 1; if (!entry.public) internalTokens.add(id); }
  assert.equal(distinct.size, 236, '236 token and selector pairs');
  const implementation = new Set();
  for (const [id, readBy] of components) for (const entry of readBy.selectors) if (!entry.public) implementation.add(`${id}|${entry.selector}`);
  assert.equal(implementation.size, 9, '9 of the 236 are implementation selectors');
  assert.equal(internalTokens.size, 7, 'in 7 tokens');
  assert.ok(selectors.length >= distinct.size && entries === selectors.length);
  const buttonBackground = components.get('component.button.background');
  assert.deepEqual(buttonBackground.selectors.map(({ selector, property }) => [selector, property]).sort(), [
    ['.muxui-button', '--muxui-button-background'],
    ['.muxui-button[data-muxui-variant=\'primary\']', '--muxui-button-background'],
  ].sort(), 'the base rule and the primary variant read it, each into Button\'s own custom property');
  const forced = [...components.values()].flatMap(({ selectors: list }) => list).filter(({ conditions }) => conditions.some((condition) => /forced-colors/u.test(condition)));
  assert.ok(forced.length > 0 && forced.every(({ conditions }) => conditions.every((condition) => condition !== '@layer muxui.components')), 'conditions exclude the layer itself');
});

// ---------------------------------------------------------------------------------------------------------------------------
// Override rules.
// ---------------------------------------------------------------------------------------------------------------------------

const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');
const walk = (value, visit) => {
  if (typeof value === 'string') visit(value);
  else if (value !== null && typeof value === 'object') for (const child of Object.values(value)) walk(child, visit);
};

test('the override text is the README\'s own, verbatim: three paragraphs, the layer statement, its introduction and its closing sentence', () => {
  const section = /\n## Cascade layers\n([\s\S]*?)\n## /u.exec(readme)[1].trim().split(/\n\n+/u);
  const { overrides } = all.get('button');
  assert.deepEqual(overrides.paragraphs, section.slice(0, 3));
  assert.equal(overrides.layerIntro, section[3]);
  assert.equal(overrides.layerCode, '@layer reset, muxui.tokens, muxui.components, muxui.utilities, app;\n@import \'@muxui/react/styles.css\';\n@import \'@muxui/react/themes.css\';');
  assert.ok(section[4].includes(overrides.layerCode));
  assert.equal(overrides.layerClosing, section[5]);
  // The property-specific nuance is kept word for word: a Mux !important beats the same property later or unlayered, an earlier layer
  // or an inline declaration can win, and it protects only the properties it names.
  assert.match(overrides.paragraphs[2], /`!important` reverses the layer order, and it works per property\. Where Mux UI declares a property `!important` \(forced colors and reduced motion\), that declaration beats a competing declaration of the same property, normal or `!important`, in a later layer or in your unlayered CSS\. It can lose to an `!important` declaration in a layer you rank before Mux UI's layers, or in a `style` attribute\./u);
  assert.equal(overrides.limit, 'It protects only the properties it names: where forced colors work through a component\'s own custom properties, a direct unlayered `background` declaration of yours is not blocked.');
  assert.ok(overrides.paragraphs[2].endsWith(overrides.limit));
  // The same text for every family, and the reader refuses a README that lost the shape.
  for (const slug of slugs) assert.deepEqual(all.get(slug).overrides.paragraphs, overrides.paragraphs);
  assert.throws(() => readCascadeText(readme.replace('## Cascade layers', '## Layers')), /has no "## Cascade layers" section/u);
  assert.throws(() => readCascadeText(readme.replace('\n```css\n@layer reset', '\nplain\n@layer reset')), /is not three paragraphs/u);
  assert.throws(() => readCascadeText(readme.replace('```css\n@layer reset', '```css\n@import \'x.css\';\n@layer reset')), /code block is not the layer statement/u);
  assert.throws(() => readCascadeText(readme.replace('The first `@layer` statement that names a layer', 'The first `@layer` statement that names a layer.\n\nAn extra closing paragraph.\n\nThe first `@layer` statement that names a layer')), /is not three paragraphs/u);
  assert.throws(() => readCascadeText(readme.replace('It protects only the properties it names', 'It protects everything')), /no longer ends its !important paragraph with the property limit/u);
});

test('no printed claim is absolute: nothing says an adaptation cannot be defeated, or that reduced motion has two triggers and no others', () => {
  const forbidden = [/cannot be defeated/iu, /two triggers/iu, /and no others/iu, /forced colors: required/iu, /platformSafety/u, /no other triggers/iu, /always applies/iu, /cannot be (?:overridden|changed)/iu];
  let strings = 0;
  for (const slug of slugs) {
    walk(all.get(slug), (text) => {
      strings += 1;
      for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `${slug}: ${text.slice(0, 80)}`);
    });
  }
  assert.ok(strings > 20_000, `${strings} printed strings were read`);
  // The control: the check fires on the sentences the mock carried.
  assert.ok(forbidden.some((pattern) => pattern.test('Cannot be defeated: forced colors')));
  assert.ok(forbidden.some((pattern) => pattern.test('Reduced motion has two triggers and no others')));
});

test('the What-wins table has seven rows, with the corrected row 4, and each row names the Chromium case that pins it', () => {
  const rows = all.get('button').overrides.whoWins;
  assert.deepEqual(rows, whoWinsRows);
  assert.deepEqual(rows.map(({ id, winner }) => [id, winner]), [[1, 'You'], [2, 'You'], [3, 'You'], [4, 'Mux'], [5, 'Mux'], [6, 'Mux'], [7, 'You, but do not']]);
  assert.match(rows[2].declaration, /first named after them \(CSS that loads after Mux and names no order\)/u);
  assert.match(rows[3].declaration, /lists it first, or when it is first named before Mux's CSS loads/u);
  assert.doesNotMatch(rows[3].declaration, /no layer statement/u, 'the v1 wording was wrong');
  assert.match(rows[6].declaration, /`reset`, `muxui\.tokens`/u);
});

test('reduced motion: two public inputs and an internal marker, as motion.mjs reads them, and the cause counts are the stylesheet\'s', () => {
  const motion = readFileSync(resolve(packageRoot, 'src/motion.mjs'), 'utf8');
  const overlays = readFileSync(resolve(packageRoot, 'src/overlays.ts'), 'utf8');
  // Read independently: the media query, the scope attribute on the node or an ancestor, the trigger, and the marker an overlay writes.
  assert.ok(motion.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches"));
  assert.ok(motion.includes("current.getAttribute('data-muxui-motion') === 'reduced'") && motion.includes('current = current.parentElement'));
  assert.ok(motion.includes('systemReduced || hasReducedScope(node) || hasReducedScope(triggerNode)'));
  assert.ok(overlays.includes("node.toggleAttribute('data-muxui-motion-reduced', reduced)"));
  assert.equal(all.get('button').overrides.motion, 'Mux UI treats motion as reduced when the system asks for it (`prefers-reduced-motion: reduce`) or when `data-muxui-motion="reduced"` is on the component or one of its ancestors; for an overlay, also on its trigger or the trigger\'s ancestors. Some overlays copy that result onto an internal `data-muxui-motion-reduced` marker; it is not an input.');
  assert.deepEqual(facts.motion, { mediaQuery: 'prefers-reduced-motion: reduce', scopeAttribute: 'data-muxui-motion', scopeValue: 'reduced', marker: 'data-muxui-motion-reduced' });
  // 3 selectors on the internal marker beside 16 on the public attribute and 8 media blocks: not three independent triggers.
  const css = readFileSync(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const literal = (pattern) => (css.match(pattern) ?? []).length;
  assert.deepEqual(facts.motionCauses, { markerSelectors: 3, scopeAttributeSelectors: 16, mediaBlocks: 8 });
  assert.deepEqual([literal(/\[data-muxui-motion-reduced/gu), literal(/\[data-muxui-motion='reduced'\]/gu), literal(/@media[^{]*prefers-reduced-motion/gu)], [3, 16, 8]);
  // The paragraph is built from what the code reads, so a changed input is a changed paragraph, and a removed one fails.
  assert.throws(() => readMotionInputs(motion.replace("'(prefers-reduced-motion: reduce)'", "'(prefers-reduced-motion: no-preference)'"), overlays), /no longer read the reduced-motion inputs/u);
  assert.throws(() => readMotionInputs(motion, overlays.replace("toggleAttribute('data-muxui-motion-reduced'", "toggleAttribute('data-muxui-motion-quiet'")), /no longer read the reduced-motion inputs/u);
  assert.throws(() => readMotionInputs(motion.replace('hasReducedScope(node) || hasReducedScope(triggerNode)', 'hasReducedScope(node)'), overlays), /no longer read the reduced-motion inputs/u);
});

test('!important counts are classified by selector and at-rule chain, per family, and agree with a second walk of the stylesheet', () => {
  assert.deepEqual(facts.importantTotals, { declarations: 86, rules: 42 });
  const css = readFileSync(resolve(packageRoot, 'generated/styles.css'), 'utf8');
  const walked = importantDeclarations(css);
  assert.equal(walked.length, 86 + walked.filter(({ chain }) => chain.some((prelude) => prelude.startsWith('@layer muxui.tokens'))).length, 'the second walk finds the same declarations');
  const hooksOf = (slug) => new Set(partRows.filter((row) => row.family === slug && ['class', 'root-element', 'composed'].includes(row.disposition)).map((row) => row.hook));
  const classesIn = (text) => [...text.replace(/\[[^\]]*\]/gu, '').matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name);
  let withImportant = 0;
  for (const slug of slugs) {
    const byCause = {};
    let total = 0;
    for (const declaration of walked.filter(({ chain }) => chain.some((prelude) => prelude === '@layer muxui.components'))) {
      const selector = declaration.chain.at(-1);
      if (!classesIn(selector).some((name) => hooksOf(slug).has(name))) continue;
      const at = declaration.chain.slice(0, -1);
      const cause = importantCategory({ chain: at }) !== 'structural' ? importantCategory({ chain: at }).replace('reduced-motion-media', 'reduced-motion-media')
        : /\[data-muxui-motion=['"]reduced['"]\]|\[data-muxui-motion-reduced/u.test(selector) ? 'reduced-motion-attribute' : 'other';
      byCause[cause] = (byCause[cause] ?? 0) + 1;
      total += 1;
    }
    const expected = total === 0 ? null : { total, byCause: Object.fromEntries(['forced-colors', 'reduced-motion-media', 'reduced-motion-attribute', 'other'].filter((name) => byCause[name]).map((name) => [name, byCause[name]])) };
    assert.deepEqual(all.get(slug).overrides.important, expected, slug);
    if (total > 0) withImportant += 1;
  }
  assert.equal(withImportant, 50);
  assert.equal(slugs.length - withImportant, 34, '34 families have none on their own hooks');
  // Button: 8 forced colors, 2 reduced motion by media query and 2 by the scope attribute (the v1 count called those two other).
  assert.deepEqual(all.get('button').overrides.important, { total: 12, byCause: { 'forced-colors': 8, 'reduced-motion-media': 2, 'reduced-motion-attribute': 2 } });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Sources, the Rendered DOM, the schema.
// ---------------------------------------------------------------------------------------------------------------------------

test('sources are tracked files: the part map, this module, the authored sheets that style the family\'s hooks, the token record and the README', () => {
  const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean));
  for (const slug of slugs) {
    const { sources } = all.get(slug);
    assert.deepEqual([sources[0], sources[1], sources.at(-2), sources.at(-1)], ['packages/react/test/support/styling-parts.ts', 'packages/react/test/support/styling-reference.mjs', 'catalog/tokens/default-theme.json', 'packages/react/README.md']);
    for (const path of sources) assert.ok(tracked.has(path), `${slug}: ${path} is tracked`);
    assert.ok(sources.slice(2, -2).length > 0 && sources.slice(2, -2).every((path) => /^packages\/react\/src\/.+\.css$/u.test(path)), `${slug}: at least one authored sheet`);
    assert.deepEqual(sources.slice(2, -2), [...sources.slice(2, -2)].sort());
  }
  assert.ok(all.get('button').sources.includes('packages/react/src/styles/components.css'));
  assert.ok(all.get('code-block').sources.includes('packages/react/src/supplemental/code-block.css'));
  // A companion hook the root element also carries brings its sheets: IconButton's root is a Button, whose rules the Hooks block reads
  // for it. The companion is an observation, so a family with no render has none, and its sources are only its own hooks'.
  const iconButton = (observed) => stylingOf('icon-button', observed ? {} : { observations: [], examples: [] }).sources;
  assert.ok(iconButton(true).includes('packages/react/src/styles/components.css'), 'IconButton lists the sheet of Button\'s hook');
  assert.ok(!iconButton(false).includes('packages/react/src/styles/components.css'), 'and does not when no render shows the companion');
  assert.equal(all.get('icon-button').hooks.groups.flatMap(({ rows }) => rows).filter(({ companion }) => companion !== undefined).length, 1);
  assert.ok(!all.get('code-block').sources.includes('packages/react/generated/styles.css'), 'the built stylesheet is not tracked');
});

test('the Rendered DOM is the Basic example\'s public shape: hooks and data-muxui attributes, no internal class, short lines', () => {
  const text = (slug) => all.get(slug).hooks.renderedDom?.text;
  assert.equal(text('button'), '<button class="muxui-button" data-muxui-variant="danger" data-muxui-size="md">\n  <span class="muxui-button__label">Delete</span>\n</button>');
  assert.equal(all.get('button').hooks.renderedDom.source, 'catalog/components/button/examples/react/basic.tsx');
  assert.equal(all.get('button').hooks.renderedDom.note, 'Observed from a server render of the Basic example. Attributes and elements can differ with props and state; internal classes are left out.');
  const publicClasses = new Set(facts.publicHooks);
  for (const slug of slugs) {
    const dom = all.get(slug).hooks.renderedDom;
    if (dom === null) continue;
    const lines = dom.text.split('\n');
    assert.ok(lines.length <= 40, `${slug}: ${lines.length} lines`);
    for (const line of lines) {
      for (const [, list] of line.matchAll(/class="([^"]*)"/gu)) for (const name of list.split(' ')) assert.ok(publicClasses.has(name), `${slug}: ${name} is a public hook`);
      assert.doesNotMatch(line, /\s(?:id|style|aria-[a-z]+|role|tabindex|type|data-rac|for|href)=/u, `${slug}: only hooks and data-muxui attributes are kept`);
      assert.ok(line.replace(/^\s+/u, '').length < 400);
    }
    // Every element named in the text is an element of a render of that family.
    const source = observations.find((observation) => observation.source === dom.source);
    const tags = new Set(parseObservation(source.html).elements.map((element) => element.tag));
    for (const [, tag] of dom.text.matchAll(/<([a-z][a-z0-9-]*)[ >]/gu)) assert.ok(tags.has(tag), `${slug}: <${tag}> is in ${dom.source}`);
  }
  // A long text is trimmed, a family with no kept element prints nothing, and a deep render is cut at 40 lines.
  assert.ok(text('data-diff').split('\n').length === 40 && text('data-diff').endsWith('...'));
  assert.equal(text('preview-trigger'), undefined);
  assert.ok(Object.values(Object.fromEntries(slugs.map((slug) => [slug, text(slug)]))).filter(Boolean).every((value) => !/[^\n]{200,}/u.test(value)));
});

test('a textarea\'s value is text: the Rendered DOM prints it decoded, as the DOM reads it', () => {
  const basic = observations.find(({ family, source }) => family === 'text-area' && source.endsWith('/basic.tsx'));
  const html = basic.html.replace('></textarea>', '>Saved &amp; ready</textarea>');
  assert.notEqual(html, basic.html);
  const styling = stylingOf('text-area', { observations: observations.map((observation) => (observation === basic ? { ...observation, html } : observation)) });
  assert.match(styling.hooks.renderedDom.text, /^ {2}<textarea class="muxui-text-area__textarea">Saved & ready<\/textarea>$/mu);
  assert.equal(new JSDOM(html).window.document.querySelector('textarea').textContent, 'Saved & ready', 'jsdom reads the same text');
});

test('the object is plain data: deeply frozen, JSON-safe, deterministic, with the keys each row type promises', () => {
  const isFrozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(isFrozen));
  for (const slug of slugs) {
    const styling = all.get(slug);
    assert.ok(isFrozen(styling), `${slug} is deeply frozen`);
    assert.deepEqual(JSON.parse(JSON.stringify(styling)), styling, `${slug} survives JSON unchanged (no undefined, no Map)`);
    assert.deepEqual(stylingOf(slug), styling, `${slug} is deterministic`);
    assert.deepEqual(Object.keys(styling), ['hooks', 'tokens', 'overrides', 'sources']);
    assert.deepEqual(Object.keys(styling.hooks), ['groups', 'notSet', 'renderedDom', 'observationNote']);
    assert.deepEqual(styling.hooks.groups.map(({ id }) => id), ['root', 'part', 'state', 'reflected'].filter((id) => styling.hooks.groups.some((group) => group.id === id)));
    const parts = new Set(partRows.filter((row) => row.family === slug).map((row) => row.part));
    for (const { id, rows } of styling.hooks.groups) {
      for (const row of rows) {
        assert.deepEqual(row.kind, id === 'root' || id === 'part' ? 'class' : id);
        for (const key of ['selectedOn', 'emittedOn', 'tags', 'provenance']) assert.ok(Array.isArray(row[key]), `${slug} ${row.hook}: ${key}`);
        assert.ok(typeof row.note === 'string' && row.note.length > 0 && typeof row.on === 'string' && typeof row.inRoot === 'boolean');
        assert.ok([...row.selectedOn, ...row.emittedOn].every((part) => parts.has(part)), `${slug} ${row.hook}: selectedOn and emittedOn name parts`);
        assert.ok(['part', 'catalog', 'interaction', 'observed', 'prop'].includes(row.origin));
        if (row.kind !== 'class') assert.match(row.hook, /^data-muxui-/u);
      }
    }
  }
});

/** The properties a JSDoc typedef of the module declares, as [name, optional]: the contract the docs, Storybook and the next PRs read. */
function declaredProperties(typeName) {
  const source = readFileSync(resolve(packageRoot, 'test/support/styling-reference.mjs'), 'utf8');
  const block = new RegExp(`@typedef \\{object\\} ${typeName}\\n([\\s\\S]*?)\\*/`, 'u').exec(source)?.[1];
  assert.ok(block, `${typeName} is declared in the module`);
  return [...block.matchAll(/^ \* @property \{.*?\} (\[)?([A-Za-z]+)/gmu)].map(([, optional, name]) => [name, optional !== undefined]);
}

test('every object the reference returns has the keys its typedef declares: none undeclared, every required one present, every optional one used', () => {
  const rows = (pick) => slugs.flatMap((slug) => pick(all.get(slug)));
  const hookRows = rows((styling) => [...styling.hooks.groups.flatMap((group) => group.rows), ...styling.hooks.notSet]);
  const tokenRowList = rows(tokenRows);
  const readByList = tokenRowList.map(({ readBy }) => readBy).filter(Boolean);
  const instances = [
    ['HookRow', hookRows],
    ['TokenRow', tokenRowList],
    ['ReadBy', readByList],
    ['ReadSelector', readByList.flatMap(({ selectors }) => selectors)],
    ['WhoWinsRow', rows((styling) => styling.overrides.whoWins)],
  ];
  for (const [typeName, list] of instances) {
    const declared = declaredProperties(typeName);
    assert.ok(list.length > 0 && declared.length > 0, typeName);
    const names = declared.map(([name]) => name);
    const used = new Set(list.flatMap((value) => Object.keys(value)));
    assert.deepEqual([...used].filter((key) => !names.includes(key)), [], `${typeName}: a key no typedef declares`);
    assert.deepEqual(declared.filter(([name, optional]) => !optional && list.some((value) => !Object.hasOwn(value, name))).map(([name]) => name), [], `${typeName}: a required key a value lacks`);
    assert.deepEqual(declared.filter(([name, optional]) => optional && !used.has(name)).map(([name]) => name), [], `${typeName}: an optional key no value uses`);
  }
  // The two the review found missing: the dark alias of a token, and the examples that read a role no rule does.
  assert.ok(declaredProperties('TokenRow').some(([name]) => name === 'darkAlias') && declaredProperties('ReadBy').some(([name, optional]) => name === 'examples' && optional));
});

// ---------------------------------------------------------------------------------------------------------------------------
// Source mutants through a mirror of the repository: the reference must read the sources it says it reads.
// ---------------------------------------------------------------------------------------------------------------------------

const throughMirror = (changes, slug) => withMirror(repositoryRoot, changes, async (directory) => {
  const mirrored = await readStylingFacts(directory);
  return stylingFor({ slug, artifact: readRecord(directory, slug), examples: examplesOf(slug), facts: mirrored, observations });
});

test('source mutants through the mirror change the output: a part row, a state classification, a token read, the README and a catalog state', async () => {
  const baseline = JSON.stringify(stylingOf('button'));
  // The control: an unchanged mirror gives the original output, so a difference below is the mutation and not the mirror.
  assert.equal(JSON.stringify(await throughMirror({}, 'button')), baseline);
  const partMap = 'packages/react/test/support/styling-parts.ts';

  const dropped = await throughMirror({ [partMap]: (text) => text.replace("  { family: 'button', part: 'label', disposition: 'class', hook: 'muxui-button__label' },\n", '') }, 'button');
  assert.deepEqual(classRows(dropped).map(({ part }) => part), ['root'], 'a dropped part row is a dropped hook row');

  const classified = await throughMirror({ [partMap]: (text) => text.replace("error: ['status', 'error'],", "error: ['status', 'failure'],") }, 'avatar');
  assert.ok(stateRowsOf(classified).some(({ hook }) => hook === 'data-muxui-failure') && !stateRowsOf(classified).some(({ hook }) => hook === 'data-muxui-error'), 'a changed classification moves the status row');

  const stripped = await throughMirror({ 'packages/react/generated/styles.css': (text) => text.replaceAll('var(--muxui-component-button-radius', 'var(--muxui-gone') }, 'button');
  const radius = (styling) => tokenRows(styling).find(({ token }) => token === 'component.button.radius').readBy.kind;
  assert.deepEqual([radius(all.get('button')), radius(stripped)], ['rules', 'none'], 'a stripped token read flips the read-by row');
  const loses = await throughMirror({ 'packages/react/generated/styles.css': (text) => text.replaceAll("[data-muxui-state-disabled]", '[data-muxui-state-gone]') }, 'button');
  assert.ok(stateRowsOf(loses).find(({ hook }) => hook === 'data-muxui-state-disabled').selectedOn.length === 0, 'a stylesheet that stops selecting a state loses its selection');

  const readmeChanged = await throughMirror({ 'packages/react/README.md': (text) => text.replace('For ordinary declarations, CSS outside a layer', 'For ordinary declarations, CSS outside any layer') }, 'button');
  assert.match(readmeChanged.overrides.paragraphs[1], /^For ordinary declarations, CSS outside any layer/u);

  const token = await throughMirror({ 'catalog/tokens/default-theme.json': (text) => text.replace('"meaning": "Button background role that themes assign; it defaults to the action background."', '"meaning": "Changed."') }, 'button');
  assert.equal(tokenRows(token).find(({ token: id }) => id === 'component.button.background').meaning, 'Changed.');

  const state = await throughMirror({ 'catalog/components/button/artifact.json': (text) => text.replace('"disabled"', '"disabled", "required"') }, 'button');
  assert.ok(stateRowsOf(state).some(({ hook, origin }) => hook === 'data-muxui-state-required' && origin === 'catalog'), 'a changed catalog state is a changed row');

  // A selector the parser cannot read fails the facts, in the built stylesheet and in an authored sheet, and is never read without its test.
  const unreadable = (path, rule) => throughMirror({ [path]: (text) => `${text}\n${rule}\n` }, 'button');
  await assert.rejects(unreadable('packages/react/generated/styles.css', '@layer muxui.components {\n  .muxui-button[role~="status"] { color: red; }\n}'), /unsupported attribute operator ~=/u);
  await assert.rejects(unreadable('packages/react/src/styles/components.css', '.muxui-button[role|="status"] { color: red; }'), /unsupported attribute operator \|=/u);

  // The module the tests import is unchanged by any of it.
  assert.equal(JSON.stringify(stylingOf('button')), baseline);
});
