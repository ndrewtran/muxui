// The closed class vocabulary (Decision 0031 item 16): every Mux class is one of
//   muxui-<slug>   muxui-<slug>--<modifier>   muxui-<slug>__<part>   muxui-<slug>__<part>--<modifier>
// with each segment lowercase words joined by single dashes and <slug> a catalog family, or one of 13 shared helpers. The checks work on
// text, so a mutant is a changed string and the guard can be run against it. They do not import the part map.

import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const WORDS = '[a-z0-9]+(?:-[a-z0-9]+)*';

/** Classes several families share, or that no family owns. The four muxui-field-* are documented hooks; the rest are internal. */
export const sharedHelpers = Object.freeze([
  'muxui-field-label', 'muxui-field-input', 'muxui-field-description', 'muxui-field-error',
  'muxui-date-input', 'muxui-date-segment', 'muxui-date-trigger', 'muxui-date-dialog', 'muxui-date-popover',
  'muxui-icon', 'muxui-icon--sm', 'muxui-value-label', 'muxui-value-output',
]);

/**
 * `muxui-` tokens that are not classes: a storage key, schema and contract names, id suffixes. Each is pinned to the source file that
 * spells it and the exact count, so a new occurrence anywhere (or as a class in CSS, where nothing is exempt) fails.
 */
export const nonClassTokens = Object.freeze({
  'button.ts': { 'muxui-button-label': 1 },
  'button-fixture.mjs': { 'muxui-r1-button': 1 },
  'r1-contracts.mjs': { 'muxui-react-r1-5-closure-v1': 2, 'muxui-renderer-descriptor-v1': 1, 'muxui-react-release-candidate-v1': 1, 'muxui-react-r1-6-contract-v1': 1 },
  'supplemental-mapping.mjs': { 'muxui-react-r1-6-supplemental-components-v2': 1 },
  'supplemental/color-mode-toggle.ts': { 'muxui-color-mode': 1 },
  'supplemental/input-tags.ts': { 'muxui-input-tags-label': 1, 'muxui-input-tags-description': 1, 'muxui-input-tags-error': 1, 'muxui-input-tags-input': 1 },
  'supplemental/multi-select.ts': { 'muxui-multi-select-label': 1, 'muxui-multi-select-description': 1, 'muxui-multi-select-error': 1, 'muxui-multi-select-status': 1 },
});

/**
 * Source sites that build a name from a `muxui-` head and `${...}` or `+`. A head is accepted when the head and one more word is a
 * valid class (`muxui-avatar--` + size, `muxui-code-block__token-` + role); the rest are pinned: a root built from a slug or a
 * name, a root with a conditional tail, and the id builders.
 */
export const pinnedBuilderHeads = Object.freeze([
  'calendar.ts muxui-', 'r1-contracts.mjs muxui-', 'components.ts muxui-checkbox',
  'button.ts muxui-button-label-', 'text-editor/index.ts muxui-text-editor-',
  'supplemental/input-tags.ts muxui-input-tags-label-', 'supplemental/input-tags.ts muxui-input-tags-description-',
  'supplemental/input-tags.ts muxui-input-tags-error-', 'supplemental/input-tags.ts muxui-input-tags-input-',
  'supplemental/multi-select.ts muxui-multi-select-label-', 'supplemental/multi-select.ts muxui-multi-select-description-',
  'supplemental/multi-select.ts muxui-multi-select-error-', 'supplemental/multi-select.ts muxui-multi-select-status-',
]);

/** The predicate for a valid class name, given the catalog family slugs. Longest slugs first, so the anchored grammar backtracks cleanly. */
export function classGrammar(slugs) {
  const grammar = new RegExp(`^muxui-(?:${[...slugs].sort((a, b) => b.length - a.length).join('|')})(?:__${WORDS})?(?:--${WORDS})?$`, 'u');
  return (name) => sharedHelpers.includes(name) || grammar.test(name);
}

// CSS with comments and string literals blanked, so a class named in either is not read as a selector.
const codeOf = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/'[^'\n]*'|"[^"\n]*"/gu, '""');

/** Every `muxui-` class named anywhere in CSS code: selectors, `:not()` and `:is()` arguments and at-rule preludes such as `@scope`. */
export function cssClassNames(css) {
  return [...codeOf(css).matchAll(/\.(muxui-[A-Za-z0-9_-]+)/gu)].map(([, name]) => name);
}

const sourceToken = /(?<![\w-])muxui-[a-z0-9]+(?:(?:__|--|-)[a-z0-9_]+)*/gu;
const builderHead = /(?<![\w-])(muxui-[a-z0-9_-]*)(?=\$\{|['"`]\s*\+)/gu;

/**
 * What breaks the vocabulary in authored CSS (`css`: path to text) and React source (`sources`: path under src to text).
 * `spelled` is every valid class named in either, for the emitted-DOM check. Every message names the file and the name.
 */
export function vocabularyFindings({ css, sources, slugs }) {
  const isClass = classGrammar(slugs);
  const findings = [];
  const spelled = new Set();
  for (const [file, text] of Object.entries(css)) {
    for (const name of cssClassNames(text)) {
      if (isClass(name)) spelled.add(name);
      else findings.push(`css ${file}: ${name} is not in the class vocabulary`);
    }
  }
  const pinned = new Set(pinnedBuilderHeads);
  const nonClass = new Set(Object.values(nonClassTokens).flatMap((tokens) => Object.keys(tokens)));
  for (const [file, text] of Object.entries(sources)) {
    const counts = new Map();
    for (const [name] of text.matchAll(sourceToken)) {
      if (nonClass.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
      else if (isClass(name)) spelled.add(name);
      else findings.push(`src ${file}: ${name} is not in the class vocabulary`);
    }
    for (const [name, count] of counts) {
      const expected = nonClassTokens[file]?.[name] ?? 0;
      if (count !== expected) findings.push(`src ${file}: non-class token ${name} appears ${count} times, pinned ${expected}`);
    }
    for (const [name, expected] of Object.entries(nonClassTokens[file] ?? {})) {
      if (!counts.has(name)) findings.push(`src ${file}: pinned non-class token ${name} no longer appears, pinned ${expected}`);
    }
    for (const [, head] of text.matchAll(builderHead)) {
      if (!isClass(`${head}x`) && !pinned.has(`${file} ${head}`)) findings.push(`src ${file}: a name built from ${head} is neither a class prefix nor pinned`);
    }
  }
  return { findings, spelled };
}

/**
 * What breaks the vocabulary in the classes a rendered fixture carries. A class must be a valid name and spelled by CSS or source
 * (a built modifier such as `--md` is accepted when its base is spelled), unless the example defines it for itself.
 */
export function emittedFindings(emitted, { spelled, slugs, owned = new Set() }) {
  const isClass = classGrammar(slugs);
  const findings = [];
  for (const name of emitted) {
    if (owned.has(name)) continue;
    if (!isClass(name)) findings.push(`emitted ${name} is not a valid class`);
    else if (!spelled.has(name) && !spelled.has(name.replace(/--.*$/u, ''))) findings.push(`emitted ${name} is not spelled by CSS or source`);
  }
  return findings;
}

/**
 * The authored CSS (path under src to text) and React source (`.ts` and `.mjs` under src, without the README generator, whose
 * prose names old classes on purpose) that the vocabulary check reads.
 */
export async function readAuthored(packageRoot) {
  const root = resolve(packageRoot, 'src');
  const paths = (await readdir(root, { recursive: true })).sort();
  const read = async (selected) => Object.fromEntries(await Promise.all(selected.map(async (path) => [path, await readFile(resolve(root, path), 'utf8')])));
  return {
    css: await read(paths.filter((path) => path.endsWith('.css'))),
    sources: await read(paths.filter((path) => /\.(?:ts|mjs)$/u.test(path) && !/\.d\.m?ts$/u.test(path) && path !== 'generate.mjs')),
  };
}
