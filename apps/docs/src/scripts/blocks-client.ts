import { matchingBlocks, type BlockFilterIndex } from '../lib/block-filter.ts';
import { announce, part } from './blocks-dom.ts';
import { initDetail } from './blocks-frame.ts';
import { initGallery } from './blocks-gallery.ts';

const FILTER_INDEX_URL = '/blocks/filter-index.json';

const rail = part(document, '[data-blocks-rail]');
const pane = part(document, '[data-blocks-pane]');
const queryInput = part<HTMLInputElement>(rail, '[data-blocks-query]');
const usesSelect = part<HTMLSelectElement>(rail, '[data-blocks-uses]');
const countOutput = part(rail, '[data-blocks-count]');
const noneMessage = part(rail, '[data-blocks-none]');

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function isSlugMap(value: unknown): value is Record<string, string[]> {
	return typeof value === 'object' && value !== null
		&& Object.values(value).every((list) => Array.isArray(list) && list.every((slug) => typeof slug === 'string'));
}

function isFilterIndex(value: unknown): value is BlockFilterIndex {
	return typeof value === 'object' && value !== null && 'terms' in value && 'uses' in value
		&& isSlugMap(value.terms) && isSlugMap(value.uses);
}

/* Filters: search and "Uses", answered from the derived catalog index. */

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

function hideUnmatched(scope: ParentNode, matched: ReadonlySet<string> | null): number {
	let shown = 0;
	scope.querySelectorAll<HTMLElement>('li[data-block]').forEach((item) => {
		const visible = matched === null || matched.has(item.dataset.block ?? '');
		item.hidden = !visible;
		if (visible) shown += 1;
	});
	// A category or group with nothing left to show leaves too.
	scope.querySelectorAll<HTMLElement>('[data-category]').forEach((category) => {
		const visible = category.querySelectorAll('li[data-block]:not([hidden])').length;
		category.hidden = visible === 0;
		const count = category.querySelector('[data-category-count]');
		if (count) count.textContent = String(visible);
	});
	scope.querySelectorAll<HTMLElement>('[data-group]').forEach((group) => {
		group.hidden = group.querySelectorAll('li[data-block]:not([hidden])').length === 0;
	});
	return shown;
}

function applyFilters() {
	const filter = { query: queryInput.value, uses: usesSelect.value };
	const active = filter.query.trim() !== '' || filter.uses !== '';
	if (active && filterIndex === null) {
		void loadFilterIndex().then(() => {
			if (filterIndex !== null) applyFilters();
			else countOutput.textContent = 'Filters are unavailable. Change the filter to try again.';
		});
		return;
	}
	const matched = filterIndex === null ? null : matchingBlocks(filterIndex, filter);
	const total = rail.querySelectorAll('li[data-block]').length;
	const shown = hideUnmatched(rail, matched);
	countOutput.textContent = `${shown} of ${plural(total, 'block')}`;
	noneMessage.hidden = shown > 0;

	const gallery = pane.querySelector<HTMLElement>('[data-blocks-gallery]');
	if (gallery) {
		const cards = hideUnmatched(gallery, matched);
		const variants = [...gallery.querySelectorAll<HTMLElement>('li[data-block]:not([hidden])')]
			.reduce((sum, card) => sum + Number(card.dataset.variants ?? 0), 0);
		part(gallery, '[data-gallery-count]').textContent = `${plural(cards, 'block')}, ${plural(variants, 'variant')}`;
		part(gallery, '[data-gallery-none]').hidden = cards > 0 || total === 0;
	}

	const url = new URL(location.href);
	url.searchParams.delete('q');
	url.searchParams.delete('uses');
	if (filter.query !== '') url.searchParams.set('q', filter.query);
	if (filter.uses !== '') url.searchParams.set('uses', filter.uses);
	history.replaceState(history.state, '', url);
}

queryInput.addEventListener('input', applyFilters);
usesSelect.addEventListener('change', applyFilters);

/* Panes: the gallery and a block detail swap in place, so the rail's state and the toolbar's persist. */

let disposePane: (() => void) | null = null;

function initPane() {
	disposePane?.();
	disposePane = null;
	const detail = pane.querySelector<HTMLElement>('[data-blocks-detail]');
	const gallery = pane.querySelector<HTMLElement>('[data-blocks-gallery]');
	if (detail) disposePane = initDetail(detail);
	else if (gallery) disposePane = initGallery(gallery);
	applyFilters();
}

// Only the variant rows and "All blocks" are pages of their own; a block row just opens its first variant.
function markCurrent(pathname: string) {
	rail.querySelectorAll<HTMLAnchorElement>('a.blocks-variant, a.blocks-all').forEach((link) => {
		if (link.pathname === pathname) link.setAttribute('aria-current', 'page');
		else link.removeAttribute('aria-current');
	});
	rail.querySelectorAll<HTMLElement>('li[data-block]').forEach((item) => {
		item.toggleAttribute('data-current', item.querySelector('a[aria-current="page"]') !== null);
	});
}

const pages = new Map<string, Promise<Document>>();

function fetchPage(pathname: string): Promise<Document> {
	let page = pages.get(pathname);
	if (!page) {
		page = fetch(pathname)
			.then((response) => {
				if (!response.ok) throw new Error(`${pathname} returned ${response.status}.`);
				return response.text();
			})
			.then((html) => new DOMParser().parseFromString(html, 'text/html'));
		pages.set(pathname, page);
		page.catch(() => pages.delete(pathname));
	}
	return page;
}

let navigation = 0;

async function navigate(href: string, push: boolean) {
	const url = new URL(href, location.href);
	const current = ++navigation;
	try {
		const page = await fetchPage(url.pathname);
		const next = page.querySelector('[data-blocks-pane]');
		if (!next) throw new Error('The next page has no Blocks pane.');
		if (current !== navigation) return;
		const hadFocus = pane.contains(document.activeElement);
		disposePane?.();
		disposePane = null;
		pane.replaceChildren(...Array.from(next.childNodes, (node) => document.importNode(node, true)));
		pane.scrollTop = 0;
		document.title = page.title;
		if (push) history.pushState(null, '', `${url.pathname}${location.search}`);
		markCurrent(url.pathname);
		initPane();
		if (hadFocus) pane.focus();
		announce(document.title);
	} catch {
		// Without the in-place swap the link still works as a normal page load.
		if (current === navigation) location.assign(url.href);
	}
}

document.addEventListener('click', (event) => {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-blocks-link]') : null;
	if (!link || link.origin !== location.origin) return;
	event.preventDefault();
	if (link.pathname !== location.pathname) void navigate(link.href, true);
});
window.addEventListener('popstate', () => { void navigate(location.href, false); });

/* Start from the URL's filters. */

const params = new URL(location.href).searchParams;
queryInput.value = params.get('q') ?? '';
usesSelect.value = params.get('uses') ?? '';
initPane();
