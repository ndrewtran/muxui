// The inventory checks for the provisional styling contract in styling-contract.ts. They prove the contract
// covers every catalog state and anatomy entry. They do not prove a class is emitted on the right element;
// that proof comes with the class scheme PR.
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleRuleClasses } from './scan-surface.mjs';
import { booleanStates, enumeratedStates } from './styling-contract.ts';

const names = (list) => Object.fromEntries(list.map((name) => [name, ['state', name]]));
const kinds = (kind, list) => Object.fromEntries(list.map((name) => [name, [kind]]));
const undecided = (reason) => ['unresolved', reason, 'CSS Stage 2 PR 2'];

/**
 * How each catalog state name relates to the contract: `state` is a boolean state, `enum` an enumerated state
 * and value, `prop` a reflected prop, `environment` a scheme or viewport, `derived` a state computed from others
 * (a missing state, a value range, a lifecycle phase). Only `unresolved` entries are open work, each with its
 * reason and the PR that settles it. A name used for two meanings (`collapsed`) takes the one with an attribute today.
 */
export const catalogStateKinds = {
  ...names([
    'disabled', 'focused', 'focus-visible', 'hovered', 'pressed', 'invalid', 'read-only', 'required', 'pending',
    'selected', 'indeterminate', 'expanded', 'open', 'current', 'empty', 'drop-target',
  ]),
  opening: ['state', 'entering'],
  closing: ['state', 'exiting'],
  horizontal: ['enum', 'orientation', 'horizontal'],
  vertical: ['enum', 'orientation', 'vertical'],
  ...kinds('prop', [
    'sm', 'md', 'lg', 'radius-full', 'radius-lg', 'radius-md', 'radius-sm', 'elevated', 'outlined', 'attached',
    'below', 'inline', 'wrap', 'diff', 'truncated', 'external', 'collapsed', 'streaming', 'running', 'failed',
    'timed', 'visa', 'mastercard', 'amex', 'discover', 'unknown',
  ]),
  ...kinds('environment', ['dark', 'light', 'desktop', 'mobile']),
  ...kinds('derived', [
    'checked', 'unchecked', 'unselected', 'mixed', 'closed', 'dismissed', 'visible', 'idle', 'default', 'complete',
    'partial', 'zero', 'progress', 'filled', 'filtered', 'submitting', 'tag-focused', 'color-open',
  ]),
  loading: undecided('Avatar and Image set a Mux load status that is not on the closed list.'),
  loaded: undecided('Avatar and Image set a Mux load status that is not on the closed list.'),
  fallback: undecided('Avatar and Image set a Mux load status that is not on the closed list.'),
  error: undecided('Avatar and Image set data-error for a failed load; PromptComposer means something else.'),
  selection: undecided('TextEditor owns its selection and selection request flow.'),
  'selection-collapsed': undecided('TextEditor owns its selection and selection request flow.'),
  'selection-request-error': undecided('TextEditor owns its selection and selection request flow.'),
  'selection-request-pending': undecided('TextEditor owns its selection and selection request flow.'),
  'selection-request-review': undecided('TextEditor owns its selection and selection request flow.'),
};

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
    .filter((path) => /\.(?:ts|mjs)$/u.test(path) && !path.endsWith('.d.mts') && path !== 'generate.mjs');
  const sources = (await Promise.all(files.map((path) => readFile(resolve(root, path), 'utf8')))).join('\n');
  const spelled = new Set(sources.match(/(?<![\w-])muxui-[a-z0-9]+(?:(?:__|--|-)[a-z0-9]+)*(?![\w-])/gu));
  return { selected, isEstablished: (name) => selected.has(name) || spelled.has(name) };
}

/** What is wrong with a state classification: an unclassified name, a stale entry, or a target outside the closed list. */
export function stateFailures(catalogStates, classification = catalogStateKinds) {
  const failures = [];
  for (const name of catalogStates) if (!Object.hasOwn(classification, name)) failures.push(`unclassified state ${name}`);
  for (const [name, [kind, ...target]] of Object.entries(classification)) {
    if (!catalogStates.has(name)) failures.push(`stale classification ${name}`);
    if (kind === 'state' && !booleanStates.includes(target[0])) failures.push(`${name} names ${target[0]}, which is not a boolean state`);
    if (kind === 'enum' && !enumeratedStates[target[0]]?.includes(target[1])) failures.push(`${name} names ${target.join('=')}, which is not an enumerated state value`);
    if (kind === 'unresolved' && !(target[0] && target[1])) failures.push(`${name} is unresolved without a reason and a PR`);
    if (!['state', 'enum', 'prop', 'environment', 'derived', 'unresolved'].includes(kind)) failures.push(`${name} has unknown kind ${kind}`);
  }
  return failures;
}

/**
 * What is wrong with a part map: an anatomy entry that is not mapped exactly once, a family or part the catalog
 * lacks, a class that is not established, or a no-element or pending entry without a reason. `parts` holds the
 * four row lists; each row is [family, part, class or reason].
 */
export function partFailures(anatomy, parts, isEstablished) {
  const failures = [];
  const seen = new Map();
  for (const [kind, rows] of Object.entries(parts)) {
    for (const [family, part, value] of rows) {
      const key = `${family}.${part}`;
      if (!anatomy.has(family)) failures.push(`${key}: unknown family`);
      else if (!anatomy.get(family).includes(part)) failures.push(`${key}: unknown part`);
      if (seen.has(key)) failures.push(`${key}: listed as ${seen.get(key)} and ${kind}`);
      seen.set(key, kind);
      if ((kind === 'mapped' || kind === 'shared') && !isEstablished(value)) failures.push(`${key}: ${value} is not an established class`);
      if ((kind === 'noElement' || kind === 'pending') && !value) failures.push(`${key}: ${kind} without a reason`);
    }
  }
  for (const [family, list] of anatomy) {
    for (const part of list) if (!seen.has(`${family}.${part}`)) failures.push(`${family}.${part}: not mapped`);
  }
  return failures;
}
