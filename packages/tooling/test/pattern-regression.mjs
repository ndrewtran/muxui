// Catalog pattern regression measurement (E-BL1-11).
//
// `measureRegression` reads discovery precision, component search stability, and dense budgets from a catalog API;
// `regressionFailures` compares them with `pattern-regression-thresholds.json`. `pattern-regression.test.mjs` holds
// the shipped patterns to the thresholds in the working tree.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCatalogApi } from '../../catalog/src/index.mjs';
import { compileCatalog } from '../../catalog/src/compiler.mjs';
import { commandRegistry } from '../generated/command-surface.mjs';
import {
  countTokens,
  executeCommand,
  parseCliArguments,
  renderDense,
  tokenBudgetFor,
} from '../src/index.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const thresholdsPath = resolve(import.meta.dirname, 'pattern-regression-thresholds.json');

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

/** The thresholds in the working tree, refused when a discovery query repeats. */
export async function loadThresholds() {
  const thresholds = JSON.parse(await readFile(thresholdsPath, 'utf8'));
  assertUniqueQueries(thresholds);
  return thresholds;
}

/** The catalog API compiled from the source manifest with `keep` deciding which records stay. */
async function compileApi(keep) {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'packages/catalog/catalog-sources.json'), 'utf8'));
  manifest.records = manifest.records.filter(keep);
  const directory = await mkdtemp(join(tmpdir(), 'muxui-pattern-regression-'));
  try {
    const sourceManifestPath = join(directory, 'catalog-sources.json');
    await writeFile(sourceManifestPath, JSON.stringify(manifest));
    return createCatalogApi((await compileCatalog({ repositoryRoot, sourceManifestPath })).bundle);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The real catalog with every pattern and variant example left out. */
export const compileApiWithoutPatterns = () => compileApi(({ path }) => !path.startsWith('catalog/patterns/'));

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
