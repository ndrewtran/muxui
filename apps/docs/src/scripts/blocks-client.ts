import { announce, part } from './blocks-dom.ts';
import { setPathname } from './blocks-browse.ts';

/*
 * In-place navigation. The rail's filters, the gallery, and the block viewer are React islands that
 * own their own state; this script only swaps the pane when a Blocks link is followed, so the rail
 * and its filters stay mounted. Without it every link still works as a normal page load.
 */

const pane = part(document, '[data-blocks-pane]');

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

/**
 * Finishes removing the pane's islands the way Astro's own router does. A removed island waits for `astro:after-swap`: it
 * unmounts its framework root then and drops its document listener, which a plain swap never gives it, so every swap
 * would keep each island it removed.
 */
function finishSwap() {
	document.dispatchEvent(new Event('astro:after-swap'));
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
		pane.replaceChildren(...Array.from(next.childNodes, (node) => document.importNode(node, true)));
		finishSwap();
		pane.scrollTop = 0;
		document.title = page.title;
		if (push) history.pushState(null, '', `${url.pathname}${location.search}`);
		setPathname(url.pathname);
		if (hadFocus) pane.focus();
		announce(document.title);
	} catch {
		// Without the in-place swap the link still works as a normal page load.
		if (current === navigation) location.assign(url.href);
	}
}

/** A link to a Blocks page from the rail or the pane; its preview routes and the site header's links load normally. */
function blocksLink(target: EventTarget | null): HTMLAnchorElement | null {
	const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
	if (!link || !link.closest('[data-blocks-rail], [data-blocks-pane]') || link.origin !== location.origin || (link.target !== '' && link.target !== '_self')) return null;
	return link.pathname.startsWith('/blocks/') && !link.pathname.endsWith('/preview/') ? link : null;
}

// Capture phase: the Mux Link stops the click's propagation after it handles the press.
document.addEventListener('click', (event) => {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	const link = blocksLink(event.target);
	if (!link) return;
	event.preventDefault();
	if (link.pathname !== location.pathname) void navigate(link.href, true);
}, { capture: true });
window.addEventListener('popstate', () => { void navigate(location.href, false); });
