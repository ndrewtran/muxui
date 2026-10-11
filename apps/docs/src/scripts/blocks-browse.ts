import { useSyncExternalStore } from 'react';
import { matchingBlocks, type BlockFilter, type BlockFilterIndex } from '../lib/block-filter.ts';
import { isRecord } from './blocks-dom.ts';

/**
 * What the rail and the gallery share while you browse: the filter (kept in the URL as `q` and
 * `uses`), the blocks it keeps, and the page that is open. The islands read it with the hooks
 * below; the pane swap in `blocks-client.ts` is the only writer of the page.
 */

const FILTER_INDEX_URL = '/blocks/filter-index.json';

export interface BrowseState {
	filter: BlockFilter;
	/** The slugs the filter keeps, or null while no filter is active or its index is still loading. */
	matched: ReadonlySet<string> | null;
	/** The filter index failed to load; the next filter change retries. */
	unavailable: boolean;
}

const serverState: BrowseState = { filter: { query: '', uses: '' }, matched: null, unavailable: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
};

function isSlugMap(value: unknown): value is Record<string, string[]> {
	return isRecord(value) && Object.values(value).every((list) => Array.isArray(list) && list.every((slug) => typeof slug === 'string'));
}

function isFilterIndex(value: unknown): value is BlockFilterIndex {
	return isRecord(value) && isSlugMap(value.terms) && isSlugMap(value.uses);
}

let filterIndex: BlockFilterIndex | null = null;
let filterIndexRequest: Promise<void> | null = null;

function loadFilterIndex(): Promise<void> {
	filterIndexRequest ??= fetch(FILTER_INDEX_URL)
		.then((response) => {
			if (!response.ok) throw new Error(`${FILTER_INDEX_URL} returned ${response.status}.`);
			return response.json();
		})
		.then((data: unknown) => {
			if (!isFilterIndex(data)) throw new Error('The block filter index is invalid.');
			filterIndex = data;
		})
		// The next filter change retries.
		.catch(() => { filterIndexRequest = null; });
	return filterIndexRequest;
}

const isActive = ({ query, uses }: BlockFilter) => query.trim() !== '' || uses !== '';

function writeUrl({ query, uses }: BlockFilter) {
	const url = new URL(location.href);
	url.searchParams.delete('q');
	url.searchParams.delete('uses');
	if (query !== '') url.searchParams.set('q', query);
	if (uses !== '') url.searchParams.set('uses', uses);
	history.replaceState(history.state, '', url);
}

let state: BrowseState = serverState;

/** Applies a filter. An active filter waits for the index; until it arrives every block stays listed. */
function applyFilter(filter: BlockFilter) {
	state = { filter, matched: filterIndex === null ? null : matchingBlocks(filterIndex, filter), unavailable: false };
	emit();
	if (!isActive(filter) || filterIndex !== null) return;
	void loadFilterIndex().then(() => {
		// A newer filter change owns the state now.
		if (state.filter !== filter) return;
		state = filterIndex === null
			? { filter, matched: null, unavailable: true }
			: { filter, matched: matchingBlocks(filterIndex, filter), unavailable: false };
		emit();
	});
}

export function setFilter(patch: Partial<BlockFilter>) {
	const filter = { ...state.filter, ...patch };
	writeUrl(filter);
	applyFilter(filter);
}

let pathname = typeof location === 'undefined' ? '' : location.pathname;

/** Records the open page after a pane swap or a history step. */
export function setPathname(next: string) {
	if (next === pathname) return;
	pathname = next;
	emit();
}

const urlFilter = (): BlockFilter => {
	const params = new URL(location.href).searchParams;
	return { query: params.get('q') ?? '', uses: params.get('uses') ?? '' };
};

/** Takes the filter from the URL after a history step, which can land on an entry whose `q` and `uses` differ from the filter shown. */
export function syncFilterFromUrl() {
	const filter = urlFilter();
	if (filter.query !== state.filter.query || filter.uses !== state.filter.uses) applyFilter(filter);
}

/** The browser starts from the URL's filters. */
if (typeof location !== 'undefined') applyFilter(urlFilter());

/** The filter and what it keeps. The server and the first client render show every block. */
export function useBrowseState(): BrowseState {
	return useSyncExternalStore(subscribe, () => state, () => serverState);
}

/** The open page. `fallback` is the path the server rendered, so hydration agrees with it. */
export function usePathname(fallback: string): string {
	return useSyncExternalStore(subscribe, () => pathname, () => fallback);
}
