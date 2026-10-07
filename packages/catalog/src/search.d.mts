export const MAX_QUERY_LENGTH: 256;
export const MAX_QUERY_TERMS: 16;

export type SearchQueryRule = 'query.search.text' | 'query.search.terms';

/** The query's terms, or the rule `searchArtifacts` rejects it under. */
export type ParsedSearchQuery =
  | { terms: string[]; rule?: undefined }
  | { rule: SearchQueryRule; terms?: undefined };

export function parseSearchQuery(query: unknown): ParsedSearchQuery;
export function matchSearchTerm(indexedTerm: string, queryTerm: string): 'exact' | 'prefix' | null;
