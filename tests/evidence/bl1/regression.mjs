// Catalog regression measurement for the BL1 Blocks showcase (E-BL1-11).
//
// `measureRegression` reads discovery precision, component search stability, and
// dense budgets from a catalog API; `regressionFailures` compares them with
// `regression-thresholds.json`, which was committed before the baseline was
// captured (its provenance names the expectations revised after a first
// measurement). `tests/evidence/capture-bl1.mjs` records the baseline, and
// `packages/tooling/test/pattern-regression.test.mjs` holds every later block to
// the current thresholds. A capture reads the thresholds as committed at the
// revision it binds, so editing the file later leaves retained records valid.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCatalogApi } from '../../../packages/catalog/src/index.mjs';
import { compileCatalog } from '../../../packages/catalog/src/compiler.mjs';
import { canonicalJson } from '../../../tooling/audits/repository-policy/src/canonical-json.mjs';
import { readAtRevision } from '../../../tooling/audits/repository-policy/src/evidence-verify.mjs';
import { commandRegistry } from '../../../packages/tooling/generated/command-surface.mjs';
import {
  countTokens,
  executeCommand,
  parseCliArguments,
  renderDense,
  tokenBudgetFor,
} from '../../../packages/tooling/src/index.mjs';

export const repositoryRoot = resolve(import.meta.dirname, '../../..');
export const thresholdsPath = 'tests/evidence/bl1/regression-thresholds.json';

/** The thresholds file's bytes: the working tree's, or, with `revision`, as committed at that revision. */
export async function readThresholds(revision) {
  return revision === undefined ? readFile(resolve(repositoryRoot, thresholdsPath)) : readAtRevision(repositoryRoot, revision, thresholdsPath);
}

/**
 * Throws when two discovery queries share a key. Measurement counts every entry, but a comparison keyed by
 * query would merge them, so a duplicate could change the measured precision with no reported change.
 */
export function assertUniqueQueries(thresholds) {
  const seen = new Set();
  for (const { query } of thresholds.discovery.queries) {
    if (seen.has(query)) throw new Error(`BL1_THRESHOLDS_DUPLICATE_QUERY: the discovery query "${query}" is listed more than once`);
    seen.add(query);
  }
}

/** The thresholds in `bytes`, refused when a discovery query repeats. */
export function parseThresholds(bytes) {
  const thresholds = JSON.parse(bytes.toString('utf8'));
  assertUniqueQueries(thresholds);
  return thresholds;
}

export async function loadThresholds(revision) {
  return parseThresholds(await readThresholds(revision));
}

const leaves = (value, path = '') => (value !== null && typeof value === 'object' && !Array.isArray(value)
  ? Object.entries(value).flatMap(([key, child]) => leaves(child, path === '' ? key : `${path}.${key}`))
  : [[path, canonicalJson(value)]]);

/**
 * How `after` differs from `before`, so a growth capture shows what a block changed in the thresholds it
 * is held to: queries added or removed, queries whose expectation was revised, every other value that
 * moved (limits, budgets, provenance), and the seed set.
 */
export function thresholdChanges(before, after) {
  assertUniqueQueries(before);
  assertUniqueQueries(after);
  const byQuery = (thresholds) => new Map(thresholds.discovery.queries.map((entry) => [entry.query, entry]));
  const [was, now] = [byQuery(before), byQuery(after)];
  const rest = ({ discovery: { queries: _queries, ...discovery }, seedSet: _seedSet, ...others }) => ({ ...others, discovery });
  const [oldLeaves, newLeaves] = [new Map(leaves(rest(before))), new Map(leaves(rest(after)))];
  return {
    addedQueries: [...now.keys()].filter((query) => !was.has(query)),
    removedQueries: [...was.keys()].filter((query) => !now.has(query)),
    revisedQueries: [...now].filter(([query, entry]) => was.has(query) && canonicalJson(was.get(query)) !== canonicalJson(entry)).map(([query, entry]) => ({ query, before: was.get(query), after: entry })),
    changedValues: [...new Set([...oldLeaves.keys(), ...newLeaves.keys()])].filter((path) => oldLeaves.get(path) !== newLeaves.get(path)).sort().map((path) => ({ path, before: oldLeaves.get(path) ?? null, after: newLeaves.get(path) ?? null })),
    seedSet: { added: after.seedSet.filter((id) => !before.seedSet.includes(id)), removed: before.seedSet.filter((id) => !after.seedSet.includes(id)) },
  };
}

const hasExpectation = ({ expectedFirst, firstWithoutPatterns, expectedId, expectedWithin }) => Boolean(expectedFirst || firstWithoutPatterns || (expectedId && expectedWithin));

/**
 * What a change from the thresholds `before` to `after` leaves unlogged or takes away (Decision 0029), as sentences; an empty
 * list means every change is on the record. A pull request may change a query, a limit, or a budget, but it states the change
 * and its reason before measuring and logs it in `provenance.revisions`; it never removes an expectation, and a change made
 * after its result was seen is also listed in `provenance.revisedAfterFirstMeasurement`.
 * - Every revised query, and every limit or budget that moved (any changed value outside `provenance`), has a log entry that is new
 *   since `before`, so an entry for an earlier revision of the same query or value does not cover a later one.
 * - No query is removed, every query keeps an expectation, and the flag that makes the expectations bind stays true.
 * - A log entry names a query or a value that exists and says what changed and why. An entry made after a first
 *   measurement names a query listed in `revisedAfterFirstMeasurement`; a limit or budget is never changed after its result was seen.
 * - The log and `revisedAfterFirstMeasurement` only grow.
 */
export function thresholdRevisionProblems(before, after) {
  const problems = [];
  const { removedQueries, revisedQueries, changedValues } = thresholdChanges(before, after);
  const log = after.provenance?.revisions ?? [];
  const earlier = before.provenance?.revisions ?? [];
  const fresh = log.filter((entry) => !earlier.some((kept) => canonicalJson(kept) === canonicalJson(entry)));
  const afterLeaves = new Map(leaves(after));
  for (const query of removedQueries) problems.push(`the query "${query}" was removed; an expectation is never removed`);
  for (const entry of after.discovery.queries) if (!hasExpectation(entry)) problems.push(`the query "${entry.query}" has no expectation (expectedFirst, firstWithoutPatterns, or expectedId with expectedWithin)`);
  if (after.discovery.everyQueryMeetsItsExpectation !== true) problems.push('discovery.everyQueryMeetsItsExpectation is not true, so the expectations no longer bind');
  for (const { query } of revisedQueries) {
    if (!fresh.some((entry) => entry.query === query)) problems.push(`the query "${query}" was revised with no new entry in provenance.revisions`);
  }
  for (const { path } of changedValues.filter(({ path: changed }) => changed !== 'provenance' && !changed.startsWith('provenance.'))) {
    if (!fresh.some((entry) => entry.limit === path)) problems.push(`${path} changed with no new entry in provenance.revisions`);
  }
  const afterMeasurement = new Set(after.provenance?.revisedAfterFirstMeasurement ?? []);
  for (const [position, entry] of log.entries()) {
    const label = `provenance.revisions[${position}]`;
    if ((entry.query === undefined) === (entry.limit === undefined)) problems.push(`${label} names exactly one of a query or a limit`);
    else if (entry.query !== undefined && !after.discovery.queries.some(({ query }) => query === entry.query)) problems.push(`${label} names the query "${entry.query}", which is not in the thresholds`);
    else if (entry.limit !== undefined && !afterLeaves.has(entry.limit)) problems.push(`${label} names the value ${entry.limit}, which is not in the thresholds`);
    for (const field of ['change', 'reason']) if (typeof entry[field] !== 'string' || entry[field].trim() === '') problems.push(`${label} does not say its ${field}`);
    if (entry.afterFirstMeasurement === true && entry.limit !== undefined) problems.push(`${label} changes ${entry.limit} after its result was seen; a limit or budget is never fitted to a result`);
    else if (entry.afterFirstMeasurement === true && !afterMeasurement.has(entry.query)) problems.push(`${label} was made after a first measurement, so "${entry.query}" must be listed in provenance.revisedAfterFirstMeasurement`);
  }
  for (const entry of earlier) {
    if (!log.some((kept) => canonicalJson(kept) === canonicalJson(entry))) problems.push(`provenance.revisions dropped or changed an earlier entry for ${entry.query ?? entry.limit}; the log only grows`);
  }
  for (const query of before.provenance?.revisedAfterFirstMeasurement ?? []) {
    if (!afterMeasurement.has(query)) problems.push(`revisedAfterFirstMeasurement dropped "${query}"; the list only grows`);
  }
  return problems;
}

/**
 * Refuses (`BL1_THRESHOLDS_UNLOGGED`) a thresholds file whose changes are not on the record, and returns the empty list otherwise. Against
 * the close-out every revised query, limit, or budget must have a log entry; against the capture being replaced (`previousRevision`, when
 * there is one) each must have an entry new since it, so an old entry for a query does not cover a later revision of it.
 */
export async function assertThresholdsLogged({ closeoutRevision, previousRevision = null, thresholds }) {
  const problems = [
    ...thresholdRevisionProblems(await loadThresholds(closeoutRevision), thresholds),
    ...(previousRevision === null ? [] : thresholdRevisionProblems(await loadThresholds(previousRevision), thresholds).map((problem) => `since the capture at ${previousRevision.slice(0, 8)}: ${problem}`)),
  ];
  if (problems.length > 0) throw new Error(`BL1_THRESHOLDS_UNLOGGED: the thresholds changed since the close-out at ${closeoutRevision.slice(0, 8)} in ways the log does not cover:\n${problems.join('\n')}`);
  return problems;
}

/** The compile result of the source manifest with `keep` deciding which records stay, read from the tree at `root`. */
export async function compileBundle(keep = () => true, root = repositoryRoot) {
  const manifest = JSON.parse(await readFile(resolve(root, 'packages/catalog/catalog-sources.json'), 'utf8'));
  manifest.records = manifest.records.filter(keep);
  const directory = await mkdtemp(join(tmpdir(), 'muxui-bl1-regression-'));
  try {
    const sourceManifestPath = join(directory, 'catalog-sources.json');
    await writeFile(sourceManifestPath, JSON.stringify(manifest));
    return await compileCatalog({ repositoryRoot: root, sourceManifestPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const isPatternSource = ({ path }) => path.startsWith('catalog/patterns/');

/** The catalog API compiled from the source manifest with `keep` deciding which records stay. */
export async function compileApi(keep) {
  return createCatalogApi((await compileBundle(keep)).bundle);
}

/** The real catalog with every pattern and variant example left out. */
export const compileApiWithoutPatterns = () => compileApi((entry) => !isPatternSource(entry));

function dense(api, args) {
  const parsed = parseCliArguments([...args, '--dense']);
  if (parsed.kind !== 'command') throw new Error(`regression request did not parse: ${args.join(' ')}`);
  const response = executeCommand(parsed.command, parsed.request, api);
  if (response.type === 'error') throw new Error(`regression request failed: ${args.join(' ')}: ${response.error.code}`);
  return { command: parsed.command, tokens: countTokens(renderDense(response)), response };
}

/** Measures the catalog `api` against the fixed query set; `baselineApi` has no pattern compiled. */
export function measureRegression({ api, baselineApi, thresholds }) {
  assertUniqueQueries(thresholds);
  const ranked = (target, query) => target.searchArtifacts({ query, limit: 100 }).data.items.map(({ id }) => id);

  const queries = thresholds.discovery.queries.map(({ query, expectedFirst, firstWithoutPatterns, expectedId, expectedWithin, relevant }) => {
    const results = ranked(api, query);
    const top = results.slice(0, 3);
    return {
      query,
      // A component query expects what the catalog without patterns already ranks first.
      expectedFirst: firstWithoutPatterns ? (ranked(baselineApi, query)[0] ?? null) : (expectedFirst ?? null),
      ...(expectedWithin === undefined ? {} : { expectedId, expectedWithin, rank: results.indexOf(expectedId) + 1 }),
      first: results[0] ?? null,
      top3: top,
      results: results.length,
      precisionAt3: top.length === 0 ? 0 : top.filter((id) => relevant.includes(id)).length / top.length,
    };
  });
  const meanPrecisionAt3 = queries.reduce((sum, { precisionAt3 }) => sum + precisionAt3, 0) / queries.length;

  const components = api.listArtifacts({ kind: 'component', limit: 100 }).data.items;
  const displaced = [];
  for (const { id, name } of components) {
    const baselineFirst = ranked(baselineApi, name)[0] ?? null;
    const first = ranked(api, name)[0] ?? null;
    if (first !== baselineFirst) displaced.push({ component: id, query: name, baselineFirst, first });
  }

  const patterns = api.listArtifacts({ kind: 'pattern', limit: 100 }).data.items.map(({ id }) => {
    const rows = [];
    const measure = (label, args, details = ['brief', 'compact', 'full']) => {
      for (const detail of details) {
        const { command, tokens } = dense(api, [...args, '--detail', detail]);
        rows.push({ label, command, detail, tokens, budget: tokenBudgetFor(commandRegistry, command, detail) });
      }
    };
    measure('list pattern', ['list', 'pattern', '--limit', '1']);
    for (const { query } of thresholds.discovery.queries.filter(({ expectedFirst }) => expectedFirst === id)) {
      measure(`search ${query}`, ['search', query, '--limit', '1']);
    }
    measure('get', ['get', id]);
    const section = dense(api, ['get', id, '--section', 'examples']);
    const variants = section.response.data.value;
    return {
      id,
      rows,
      examples: {
        variants: variants.length,
        tokens: section.tokens,
        variantSourceLexemes: variants.map(({ id: variant, code }) => ({ id: variant, lexemes: countTokens(code) })),
      },
    };
  });

  return { discovery: { queries, meanPrecisionAt3 }, search: { componentQueries: components.length, displaced }, denseBudgets: { patterns } };
}

/** Every threshold the measurement breaks, as sentences. An empty list means the catalog holds the baseline. */
export function regressionFailures(measured, thresholds) {
  const failures = [];
  const { discovery, search, denseBudgets } = thresholds;
  if (discovery.everyQueryMeetsItsExpectation) {
    for (const { query, expectedFirst, first, expectedId, expectedWithin, rank } of measured.discovery.queries) {
      if (expectedFirst !== null && first !== expectedFirst) failures.push(`search "${query}" ranks ${first} first; expected ${expectedFirst}`);
      if (expectedWithin !== undefined && (rank === 0 || rank > expectedWithin)) {
        failures.push(`search "${query}" ranks ${expectedId} ${rank === 0 ? 'nowhere' : `at ${rank}`}; expected within ${expectedWithin}`);
      }
    }
  }
  if (measured.discovery.meanPrecisionAt3 < discovery.minimumMeanPrecisionAt3) {
    failures.push(`mean precision at 3 is ${measured.discovery.meanPrecisionAt3.toFixed(3)}; the floor is ${discovery.minimumMeanPrecisionAt3}`);
  }
  if (measured.search.displaced.length > search.maximumDisplacedComponentQueries) {
    failures.push(`patterns displace the first result of ${measured.search.displaced.length} component searches: ${measured.search.displaced.map(({ query }) => query).join(', ')}`);
  }
  const { tokensPerVariant, envelopeTokens, variantSourceLexemes } = denseBudgets.examplesSection;
  for (const { id, rows, examples } of measured.denseBudgets.patterns) {
    for (const { label, detail, tokens, budget } of rows) {
      if (tokens > budget) failures.push(`${id} ${label} (${detail}) takes ${tokens} dense tokens; the registry budget is ${budget}`);
    }
    const ceiling = tokensPerVariant * examples.variants + envelopeTokens;
    if (examples.tokens > ceiling) failures.push(`${id} get --section examples takes ${examples.tokens} dense tokens; the ceiling is ${ceiling}`);
    for (const { id: variant, lexemes } of examples.variantSourceLexemes) {
      if (lexemes > variantSourceLexemes) failures.push(`${variant} source has ${lexemes} lexemes; the ceiling is ${variantSourceLexemes}`);
    }
  }
  return failures;
}
