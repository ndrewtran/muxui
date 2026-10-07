import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogApi } from '@muxui/catalog';
import { catalogJson } from '@muxui/catalog/bundle';
import {
  compileApiWithoutPatterns,
  loadThresholds,
  measureRegression,
  regressionFailures,
} from '../../../tests/evidence/bl1/regression.mjs';

const thresholds = await loadThresholds();
const api = createCatalogApi(JSON.parse(catalogJson));
const measured = measureRegression({ api, baselineApi: await compileApiWithoutPatterns(), thresholds });

// Every block holds the thresholds committed before the BL1 baseline was captured (E-BL1-11).
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
  const only = (failures, pattern_) => {
    assert.equal(failures.length, 1, JSON.stringify(failures));
    assert.match(failures[0], pattern_);
  };
  only(mutate((copy) => { copy.discovery.queries[0].first = 'muxui:component:button'; }), /search "poster grid" ranks muxui:component:button first/u);
  only(mutate((copy) => { copy.discovery.queries.find(({ expectedWithin }) => expectedWithin).rank = 4; }), /expected within 3/u);
  only(mutate((copy) => { copy.discovery.queries.find(({ expectedWithin }) => expectedWithin).rank = 0; }), /nowhere/u);
  only(mutate((copy) => { copy.discovery.meanPrecisionAt3 = 0.2; }), /mean precision at 3 is 0\.200/u);
  only(mutate((copy) => { copy.search.displaced.push({ query: 'Button', baselineFirst: 'a', first: 'b' }); }), /displace the first result of 1 component searches: Button/u);
  only(mutate((copy) => { copy.denseBudgets.patterns[0].rows[0].tokens = copy.denseBudgets.patterns[0].rows[0].budget + 1; }), /list pattern .* the registry budget is/u);
  only(mutate((copy) => { copy.denseBudgets.patterns[0].examples.tokens = 1000 * pattern.examples.variants + 401; }), /get --section examples takes .* the ceiling is/u);
  only(mutate((copy) => { copy.denseBudgets.patterns[0].examples.variantSourceLexemes[0].lexemes = 701; }), /source has 701 lexemes; the ceiling is 700/u);
});
