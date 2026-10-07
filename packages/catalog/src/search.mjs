// The catalog's search grammar. It imports nothing, so `searchArtifacts` and a
// browser filter run the same code without loading the generated bundle.

export const MAX_QUERY_LENGTH = 256;
export const MAX_QUERY_TERMS = 16;

/**
 * Parses a query as `searchArtifacts` does: the distinct lowercase ASCII words,
 * at most MAX_QUERY_TERMS of them. A query the API rejects returns the rule it
 * fails: `query.search.text` for a blank or over-long query, and
 * `query.search.terms` for one with no ASCII letter or number.
 */
export function parseSearchQuery(query) {
  if (typeof query !== 'string' || query.trim().length === 0 || query.length > MAX_QUERY_LENGTH) {
    return { rule: 'query.search.text' };
  }
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].slice(0, MAX_QUERY_TERMS);
  return terms.length === 0 ? { rule: 'query.search.terms' } : { terms };
}

/**
 * How an indexed term answers a query term: `exact`, `prefix` (the indexed term
 * starts with the query term), or null for no match.
 */
export function matchSearchTerm(indexedTerm, queryTerm) {
  return indexedTerm === queryTerm ? 'exact' : indexedTerm.startsWith(queryTerm) ? 'prefix' : null;
}
