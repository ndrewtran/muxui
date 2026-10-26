// The inventory checks for the styling contract: the states in src/styling-contract.ts and the part map. They prove the contract
// covers every catalog state and anatomy entry and that each part row has the shape its disposition needs. They do not prove a class
// is emitted on the right element; the emission test does. This module names neither the part map file nor its readers: other tests
// import it for `guardedPrefixes`, and the planner follows a text mention of a file name to every test that imports this module.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleRuleClasses } from './scan-surface.mjs';
import { booleanStates, enumeratedStates } from '../../src/styling-contract.ts';

/**
 * Class names that tests assert are absent, or that a guard keys on. A guard on a prefix nothing spells passes vacuously, as the
 * muxui-code-block-token- guards did after the part classes became BEM, so the class vocabulary test requires each of these to
 * match a class the sources spell.
 */
export const guardedPrefixes = Object.freeze({
  // CodeBlock marks a highlighted token with muxui-code-block__token-<role>; an unhighlighted render must carry none.
  codeBlockToken: 'muxui-code-block__token-',
  // Families whose parts paint mode-aware tokens: Figma variables hold one value per mode, so no scheme-scoped rule may style them.
  modeAwareFamilies: Object.freeze(['checkbox', 'checkbox-field', 'switch', 'switch-field', 'text-field', 'tabs', 'tag-group', 'select-native']),
});

/** The anatomy parts and state names of every component in the catalog. */
export async function readCatalog(repositoryRoot) {
  const root = resolve(repositoryRoot, 'catalog/components');
  const slugs = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const anatomy = new Map();
  const states = new Set();
  for (const slug of slugs) {
    const artifact = JSON.parse(await readFile(resolve(root, slug, 'artifact.json'), 'utf8'));
    anatomy.set(slug, artifact.anatomy);
    for (const state of artifact.states) states.add(state);
  }
  return { anatomy, states };
}

/**
 * Whether a class is established: a style rule selects it, or a `muxui-` token in the package sources spells it.
 * A class that is neither is not a hook, whatever mapping names it.
 */
export async function establishedClasses(packageRoot, stylesheets) {
  const selected = new Set(stylesheets.flatMap((css) => [...styleRuleClasses(css)]));
  const root = resolve(packageRoot, 'src');
  const files = (await readdir(root, { recursive: true }))
    // The contract is the inventory's subject, so it never counts as spelling an established class.
    .filter((path) => /\.(?:ts|mjs)$/u.test(path) && !path.endsWith('.d.mts') && path !== 'generate.mjs' && path !== 'styling-contract.ts');
  const sources = (await Promise.all(files.map((path) => readFile(resolve(root, path), 'utf8')))).join('\n');
  const spelled = new Set(sources.match(/(?<![\w-])muxui-[a-z0-9]+(?:(?:__|--|-)[a-z0-9]+)*(?![\w-])/gu));
  return { selected, isEstablished: (name) => selected.has(name) || spelled.has(name) };
}

/**
 * What is wrong with a state classification: an unclassified name, a stale entry, or a target outside the closed list. The
 * classification is the caller's, so a test can pass a changed one.
 */
export function stateFailures(catalogStates, classification) {
  const failures = [];
  for (const name of catalogStates) if (!Object.hasOwn(classification, name)) failures.push(`unclassified state ${name}`);
  for (const [name, [kind, ...target]] of Object.entries(classification)) {
    if (!catalogStates.has(name)) failures.push(`stale classification ${name}`);
    if (kind === 'state' && !booleanStates.includes(target[0])) failures.push(`${name} names ${target[0]}, which is not a boolean state`);
    if (kind === 'enum' && !enumeratedStates[target[0]]?.includes(target[1])) failures.push(`${name} names ${target.join('=')}, which is not an enumerated state value`);
    if (kind === 'status' && !target[0]) failures.push(`${name} is a status without the attribute it names`);
    if (kind === 'unresolved' && !(target[0] && target[1])) failures.push(`${name} is unresolved without a reason and a PR`);
    if (!['state', 'enum', 'prop', 'status', 'environment', 'derived', 'unresolved'].includes(kind)) failures.push(`${name} has unknown kind ${kind}`);
  }
  return failures;
}

/**
 * What is wrong with the part map, as one message per problem. `contract` carries the closed sets of the part map module, passed in
 * so that this helper does not import it; `selected` is the set of classes an authored rule selects and `isEstablished` says whether a class is selected or spelled.
 *
 * Every anatomy entry has one row and every row names a real family and part. Each disposition has the shape its meaning needs
 * (a class hook is `partClass(family, part)` unless the row says why, a field hook is one of the four shared classes, a `none`
 * row has a reason and no hook), a `selector` uses only the hook, the family root, one of the five scope classes and the recorded
 * element predicates, and the rows the plan names carry their exception or qualifier. Every documented hook is selected by an
 * authored rule unless its row is `hookOnly`, and a `hookOnly` hook no rule selects (a stale one fails).
 */
export function partFailures(anatomy, rows, contract, { selected, isEstablished }) {
  const { partClass, publicSharedClasses, scopeClasses, elementQualifiers, noElementReasons, dispositions } = contract;
  const failures = [];
  const keyOf = (row) => `${row.family}.${row.part}`;
  const seen = new Set();
  for (const row of rows) {
    const key = keyOf(row);
    if (!anatomy.has(row.family)) failures.push(`${key}: unknown family`);
    else if (!anatomy.get(row.family).includes(row.part)) failures.push(`${key}: unknown part`);
    if (seen.has(key)) failures.push(`${key}: listed twice`);
    seen.add(key);
  }
  for (const [family, list] of anatomy) {
    for (const part of list) if (!seen.has(`${family}.${part}`)) failures.push(`${family}.${part}: not mapped`);
  }
  const byKey = new Map(rows.map((row) => [keyOf(row), row]));
  const documented = ['class', 'root-element', 'field', 'composed'];
  const documentedHooks = new Set(rows.filter((row) => documented.includes(row.disposition) && row.disposition !== 'composed').map((row) => row.hook));
  const rootHook = (family) => byKey.get(`${family}.root`)?.hook ?? partClass(family, 'root');

  for (const row of rows) {
    const key = keyOf(row);
    const { disposition, hook, selector, exception, hookOnly, reason, composedOf, callerSupplied } = row;
    if (!dispositions.includes(disposition)) { failures.push(`${key}: unknown disposition ${disposition}`); continue; }
    if (disposition === 'none') {
      if (hook !== undefined || selector !== undefined || hookOnly !== undefined || composedOf !== undefined || callerSupplied !== undefined) failures.push(`${key}: a none row names no element`);
      if (!noElementReasons.includes(reason)) failures.push(`${key}: none without a reason from ${noElementReasons.join(', ')}`);
      continue;
    }
    if (reason !== undefined) failures.push(`${key}: only a none row has a reason`);
    if (!hook) { failures.push(`${key}: ${disposition} without a hook`); continue; }
    if (!isEstablished(hook)) failures.push(`${key}: ${hook} is not an established class`);
    if (disposition === 'class') {
      const expected = partClass(row.family, row.part);
      if (hook !== expected && !exception) failures.push(`${key}: ${hook} is not ${expected} and the row records no exception`);
      if (hook === expected && exception) failures.push(`${key}: exception on a row whose hook is ${expected}`);
    } else if (exception) failures.push(`${key}: only a class row records an exception`);
    if (disposition === 'root-element' && hook !== partClass(row.family, 'root')) failures.push(`${key}: a root-element row's hook is the family root ${partClass(row.family, 'root')}, not ${hook}`);
    if (disposition === 'field') {
      if (!publicSharedClasses.includes(hook)) failures.push(`${key}: ${hook} is not one of the shared field classes`);
      else if (hook !== `muxui-field-${row.part}`) failures.push(`${key}: ${hook} does not match the part`);
    }
    if (disposition === 'composed' && !rows.some((other) => other.family !== row.family && ['class', 'root-element'].includes(other.disposition) && other.hook === hook)) {
      failures.push(`${key}: ${hook} is not a documented hook of another family`);
    }
    if (disposition === 'internal' && (documentedHooks.has(hook) || publicSharedClasses.includes(hook))) failures.push(`${key}: ${hook} is documented elsewhere, so it is not internal`);
    if (composedOf !== undefined && !anatomy.has(composedOf)) failures.push(`${key}: composedOf ${composedOf} is not a family`);
    if (callerSupplied !== undefined && (composedOf === undefined || !callerSupplied)) failures.push(`${key}: callerSupplied qualifies composedOf, so it needs both a composedOf and a reason`);
    if (selector !== undefined) failures.push(...selectorFailures(key, row, rootHook(row.family), { scopeClasses, elementQualifiers }));
    if (documented.includes(disposition)) {
      const isSelected = selected.has(hook);
      if (hookOnly !== undefined && !hookOnly) failures.push(`${key}: hookOnly without a reason`);
      if (!isSelected && hookOnly === undefined) failures.push(`${key}: no authored rule selects ${hook} and the row is not hookOnly`);
      if (isSelected && hookOnly !== undefined) failures.push(`${key}: hookOnly, but an authored rule now selects ${hook}`);
    } else if (hookOnly !== undefined) failures.push(`${key}: hookOnly applies to a documented hook`);
  }

  // The rows that carry a qualifier or an exception by decision, so the decision is asserted and not only documented.
  const need = (key, condition, message) => { const row = byKey.get(key); if (row && !condition(row)) failures.push(`${key}: ${message}`); };
  for (const key of ['code-block.status', 'prompt-composer.status']) need(key, (row) => row.selector?.includes('[role="status"]'), 'a shared status class needs the [role="status"] qualifier');
  need('sidebar.nav-button', (row) => /(^|\s)a\./u.test(row.selector ?? ''), 'a shared class on three elements needs the anchor qualifier');
  need('card.button', (row) => row.disposition === 'root-element' && row.hook === 'muxui-card' && row.selector === 'button.muxui-card', 'must be a root-element row with hook muxui-card and selector button.muxui-card');
  for (const key of ['input.root', 'input.input', 'menu.root']) need(key, (row) => Boolean(row.exception), 'a root or control exception must be recorded');
  return failures;
}

// A selector is compounds joined by spaces: [tag] .class... [attribute]. The hook is in the last compound; the other classes are the
// family root or a scope class, and a tag or attribute is one of the recorded element predicates.
function selectorFailures(key, row, root, { scopeClasses, elementQualifiers }) {
  const failures = [];
  const compounds = row.selector.trim().split(/\s+/u);
  const pattern = /^(?<tag>[a-z]+)?(?<classes>(?:\.[a-z0-9_-]+)+)(?<attributes>(?:\[[^\]]+\])*)$/u;
  const parsed = compounds.map((compound) => pattern.exec(compound)?.groups);
  if (parsed.some((groups) => groups === undefined)) return [`${key}: selector ${row.selector} is not a compound-selector chain of classes with an optional tag and attributes`];
  const classes = parsed.flatMap(({ classes: list }) => list.slice(1).split('.'));
  if (!classes.includes(row.hook)) failures.push(`${key}: selector ${row.selector} does not contain .${row.hook}`);
  else if (!parsed.at(-1).classes.slice(1).split('.').includes(row.hook)) failures.push(`${key}: the hook is not in the last compound of ${row.selector}`);
  for (const name of classes) {
    if (name !== row.hook && name !== root && !scopeClasses.includes(name)) failures.push(`${key}: selector class ${name} is neither the hook, the family root nor a scope class`);
  }
  for (const { tag, attributes } of parsed) {
    if (tag && !elementQualifiers.includes(tag)) failures.push(`${key}: selector tag ${tag} is not a recorded element predicate`);
    for (const attribute of attributes.match(/\[[^\]]+\]/gu) ?? []) if (!elementQualifiers.includes(attribute)) failures.push(`${key}: selector attribute ${attribute} is not a recorded element predicate`);
  }
  return failures;
}
