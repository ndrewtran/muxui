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

// Every block holds the thresholds in the working tree (E-BL1-11). A pull request may change a limit or a budget in
// tests/evidence/bl1/regression-thresholds.json, logged in provenance.revisions (Decision 0029), and these tests follow it.
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
