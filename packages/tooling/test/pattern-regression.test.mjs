import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { catalogJson } from '@muxui/catalog/bundle';
import {
  compileApiWithCrowdedFamily,
  compileApiWithoutPatterns,
  loadThresholds,
  measureRegression,
  regressionFailures,
} from './pattern-regression.mjs';

const thresholds = await loadThresholds();
const api = createCatalogApi(JSON.parse(catalogJson));
const measured = measureRegression({ api, baselineApi: await compileApiWithoutPatterns(), thresholds });

/** Every search result for `query`, across all pages, in the order the API ranks them. */
function searchAll(target, query) {
  const items = [];
  let cursor = null;
  do {
    const { data, meta } = target.searchArtifacts({ query, limit: 100, cursor });
    items.push(...data.items);
    cursor = meta.nextCursor;
  } while (cursor !== null);
  return items;
}

/** The 1-based place of `id` in `items`, or 0 when it is missing. */
const placeOf = (items, id) => items.findIndex((item) => item.id === id) + 1;

/** `items` in score order alone, ties by id: the ranking before a family's examples were grouped. */
const byScore = (items) => [...items].sort((left, right) => right.score - left.score || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

// Every block holds the thresholds in the working tree (E-BL1-11). A pull request may change a limit or a budget in
// pattern-regression-thresholds.json, and these tests follow it.
test('E-BL1-11: the shipped patterns hold the regression thresholds', () => {
  assert.deepEqual(regressionFailures(measured, thresholds), []);
  // The measurement saw every shipped pattern, not an empty set.
  const shipped = api.listArtifacts({ kind: 'pattern', limit: 100 }).data.items.map(({ id }) => id);
  assert.deepEqual(measured.denseBudgets.patterns.map(({ id }) => id), shipped);
  assert.ok(thresholds.seedSet.every((id) => shipped.includes(id)));
  assert.equal(measured.search.componentQueries, api.listArtifacts({ kind: 'component', limit: 100 }).data.items.length);
});

test('E-BL1-11: each threshold fails when its measurement worsens', () => {
  const mutate = (change) => {
    const copy = structuredClone(measured);
    change(copy);
    return regressionFailures(copy, thresholds);
  };
  const [pattern] = measured.denseBudgets.patterns;
  const { tokensPerVariant, envelopeTokens, variantSourceLexemes } = thresholds.denseBudgets.examplesSection;
  const only = (failures, pattern_) => {
    assert.equal(failures.length, 1, JSON.stringify(failures));
    assert.match(failures[0], pattern_);
  };
  only(mutate((copy) => { copy.discovery.queries[0].first = 'muxui:component:button'; }), /search "poster grid" ranks muxui:component:button first/u);
  // One rank past the first within-rank expectation, whatever a growth pull request revises that limit to.
  const { expectedWithin } = thresholds.discovery.queries.find((query) => query.expectedWithin);
  only(mutate((copy) => { copy.discovery.queries.find((query) => query.expectedWithin).rank = expectedWithin + 1; }), new RegExp(`expected within ${expectedWithin}$`, 'u'));
  only(mutate((copy) => { copy.discovery.queries.find(({ expectedWithin }) => expectedWithin).rank = 0; }), /nowhere/u);
  only(mutate((copy) => { copy.discovery.meanPrecisionAt3 = 0.2; }), /mean precision at 3 is 0\.200/u);
  only(mutate((copy) => { copy.search.displaced.push({ query: 'Button', baselineFirst: 'a', first: 'b' }); }), /displace the first result of 1 component searches: Button/u);
  only(mutate((copy) => { copy.denseBudgets.patterns[0].rows[0].tokens = copy.denseBudgets.patterns[0].rows[0].budget + 1; }), /list pattern .* the registry budget is/u);
  only(mutate((copy) => { copy.denseBudgets.patterns[0].examples.tokens = tokensPerVariant * pattern.examples.variants + envelopeTokens + 1; }), /get --section examples takes .* the ceiling is/u);
  // One lexeme past the size limit the thresholds set, whatever a pull request sets it to.
  only(mutate((copy) => { copy.denseBudgets.patterns[0].examples.variantSourceLexemes[0].lexemes = variantSourceLexemes + 1; }), new RegExp(`source has ${variantSourceLexemes + 1} lexemes; the ceiling is ${variantSourceLexemes}$`, 'u'));
});

// Every example id carries its family slug, so each example of a family a query names matches at about the family's
// own score. Ten test-only Tooltip examples must move no first result and no expected rank: "tool calls" keeps the
// Agent trace pattern within its limit, although each fixture matches the query.
test('ten more examples of one family move no expected result', async () => {
  const crowdedApi = await compileApiWithCrowdedFamily();
  for (const { query, expectedId } of thresholds.discovery.queries) {
    const crowdedItems = searchAll(crowdedApi, query);
    const items = searchAll(api, query);
    assert.equal(crowdedItems[0]?.id, items[0]?.id, `first result of "${query}"`);
    if (expectedId !== undefined) assert.equal(placeOf(crowdedItems, expectedId), placeOf(items, expectedId), `${expectedId} for "${query}"`);
  }
  const { expectedId, expectedWithin } = thresholds.discovery.queries.find(({ query }) => query === 'tool calls');
  const toolCalls = searchAll(crowdedApi, 'tool calls');
  assert.equal(toolCalls.filter(({ id }) => id.startsWith('muxui:example:tooltip-crowd-')).length, 10);
  const place = placeOf(toolCalls, expectedId);
  assert.ok(place >= 1 && place <= expectedWithin, `"tool calls" ranks ${expectedId} at ${place}; expected within ${expectedWithin}`);
});

// A query that names an example, by its whole id or its exact name, keeps that example where its score puts it.
test('a query naming an example keeps it where its score ranks it', () => {
  for (const [query, id] of [
    ['muxui:example:toggle-button-quiet-react', 'muxui:example:toggle-button-quiet-react'],
    ['Quiet ToggleButton', 'muxui:example:toggle-button-quiet-react'],
    ['muxui:example:tooltip-icon-button-react', 'muxui:example:tooltip-icon-button-react'],
    ['Tooltip on an icon button', 'muxui:example:tooltip-icon-button-react'],
  ]) {
    assert.equal(searchAll(api, query)[0].id, id, query);
  }
  // The basic Menu example outscores the grouped one for the grouped one's own id. The named example still keeps the
  // place its score gives it, second, instead of following the other results as a further Menu example.
  const id = 'muxui:example:menu-grouped-react';
  const items = searchAll(api, id);
  assert.equal(placeOf(byScore(items), id), 2);
  assert.ok(placeOf(items, id) >= 1 && placeOf(items, id) <= placeOf(byScore(items), id), `${id} ranks at ${placeOf(items, id)}`);
  // Each of these queries names the Quiet example, by every word of its name or of its id slug, and adds the word
  // basic, which the example misses and the basic ToggleButton example matches. The Quiet example still keeps the
  // place its score gives it instead of following the other results as a further ToggleButton example.
  const quiet = 'muxui:example:toggle-button-quiet-react';
  for (const [query, place] of [['Basic Quiet ToggleButton React', 3], ['toggle-button-quiet-react basic', 4]]) {
    const named = searchAll(api, query);
    assert.equal(placeOf(byScore(named), quiet), place, `score place for "${query}"`);
    assert.equal(placeOf(named, quiet), place, query);
  }
});

// An example that matches every word of the query answers the whole query, so it keeps the place its score gives it,
// whatever its family. "react sidebar" keeps every Sidebar example where score order puts it, the first seven, and a
// five-result page of "sidebar" still shows at least four of them.
test('an example that matches every query word keeps its place', () => {
  const sidebarExamples = (items) => items.filter(({ id }) => id.startsWith('muxui:example:sidebar-'));
  const items = searchAll(api, 'react sidebar');
  const scored = byScore(items);
  const places = sidebarExamples(scored).map(({ id }) => placeOf(scored, id));
  assert.deepEqual(places, places.map((_, index) => index + 1));
  assert.deepEqual(sidebarExamples(items).map(({ id }) => placeOf(items, id)), places);
  assert.ok(sidebarExamples(api.searchArtifacts({ query: 'sidebar', limit: 5 }).data.items).length >= 4);
});
