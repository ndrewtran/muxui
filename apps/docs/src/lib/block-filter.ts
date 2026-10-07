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

// The catalog search accepts at most 16 distinct terms.
const MAX_QUERY_TERMS = 16;

/** The query terms catalog search derives: distinct lowercase ASCII words. */
export function queryTerms(query: string): string[] {
	return [...new Set(query.toLowerCase().match(/[a-z0-9]+/gu) ?? [])].slice(0, MAX_QUERY_TERMS);
}

/**
 * The slugs of the blocks a filter keeps, or null when no filter is active.
 * Mirrors the catalog: a term matches every indexed term it prefixes, any one
 * term is enough, and `uses` keeps only blocks that reference the component.
 */
export function matchingBlocks(index: BlockFilterIndex, { query, uses }: BlockFilter): ReadonlySet<string> | null {
	const terms = queryTerms(query);
	if (terms.length === 0 && uses === '') return null;
	let matched: Set<string> | null = null;
	if (terms.length > 0) {
		matched = new Set();
		for (const [indexed, slugs] of Object.entries(index.terms)) {
			if (terms.some((term) => indexed.startsWith(term))) for (const slug of slugs) matched.add(slug);
		}
	}
	if (uses !== '') {
		const using = new Set(index.uses[uses] ?? []);
		matched = matched === null ? using : new Set([...matched].filter((slug) => using.has(slug)));
	}
	return matched;
}
