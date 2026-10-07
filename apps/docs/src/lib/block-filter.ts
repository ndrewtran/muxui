import { matchSearchTerm, parseSearchQuery } from '@muxui/catalog/search';

/** The rail's filter data. It is derived from the catalog at build time and shipped as JSON; it owns no fact. */
export interface BlockFilterIndex {
	/** Every term of the catalog search index that belongs to a pattern, with the block slugs that carry it. */
	terms: Readonly<Record<string, readonly string[]>>;
	/** A component ArtifactRef to the block slugs that use it, as the catalog `uses` selector answers. */
	uses: Readonly<Record<string, readonly string[]>>;
}

export interface BlockFilter {
	query: string;
	/** A component ArtifactRef, or an empty string for any component. */
	uses: string;
}

/**
 * The slugs of the blocks a filter keeps, or null when no filter is active.
 *
 * The query is the catalog's own: `parseSearchQuery` tokenizes it and `matchSearchTerm`
 * matches each term, so any one matching term keeps a block, and a query the API would
 * reject (over-long, or with no ASCII letter or number) keeps none. A blank query is
 * no query. `uses` keeps only blocks that reference the component.
 */
export function matchingBlocks(index: BlockFilterIndex, { query, uses }: BlockFilter): ReadonlySet<string> | null {
	let matched: Set<string> | null = null;
	if (query.trim() !== '') {
		matched = new Set();
		const parsed = parseSearchQuery(query);
		if (parsed.terms) {
			for (const [indexed, slugs] of Object.entries(index.terms)) {
				if (parsed.terms.some((term) => matchSearchTerm(indexed, term) !== null)) for (const slug of slugs) matched.add(slug);
			}
		}
	}
	if (uses !== '') {
		const using = new Set(index.uses[uses] ?? []);
		matched = matched === null ? using : new Set([...matched].filter((slug) => using.has(slug)));
	}
	return matched;
}
