import assert from 'node:assert/strict';
import test from 'node:test';
import { searchArtifacts } from '../src/index.mjs';
import { MAX_QUERY_LENGTH, MAX_QUERY_TERMS, matchSearchTerm, parseSearchQuery } from '../src/search.mjs';

test('parseSearchQuery tokenizes as searchArtifacts does and names the rule a rejected query fails', () => {
  assert.deepEqual(parseSearchQuery('Poster, GRID poster!').terms, ['poster', 'grid']);
  const words = Array.from({ length: MAX_QUERY_TERMS + 4 }, (_, index) => `w${index}`);
  assert.deepEqual(parseSearchQuery(words.join(' ')).terms, words.slice(0, MAX_QUERY_TERMS));

  for (const query of ['', '   ', '!!!', 'é ü', 'a'.repeat(MAX_QUERY_LENGTH + 1), 'a '.repeat(MAX_QUERY_LENGTH)]) {
    const response = searchArtifacts({ query, platform: 'web.react', detail: 'brief' });
    assert.equal(parseSearchQuery(query).rule, response.error?.ruleId, JSON.stringify(query.slice(0, 12)));
  }
  assert.equal(parseSearchQuery('a'.repeat(MAX_QUERY_LENGTH)).rule, undefined);
  assert.equal(searchArtifacts({ query: 'a'.repeat(MAX_QUERY_LENGTH), platform: 'web.react' }).error, undefined);
});

test('matchSearchTerm is exact, prefix, or no match', () => {
  assert.equal(matchSearchTerm('grid', 'grid'), 'exact');
  assert.equal(matchSearchTerm('gridlist', 'grid'), 'prefix');
  assert.equal(matchSearchTerm('grid', 'gridlist'), null);
  assert.equal(matchSearchTerm('data', 'ata'), null);
});
