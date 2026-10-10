import { defineRouteMiddleware, type StarlightRouteData } from '@astrojs/starlight/route-data';
import { componentsPath, sectionOf } from './lib/site-sections.ts';

type SidebarEntry = StarlightRouteData['sidebar'][number];

function linkHrefs(entry: SidebarEntry): string[] {
	return entry.type === 'link' ? [entry.href] : entry.entries.flatMap(linkHrefs);
}

/** A component entry is a link or group whose links all open component pages, however the sidebar groups them. */
function isComponentEntry(entry: SidebarEntry) {
	const hrefs = linkHrefs(entry);
	return hrefs.length > 0 && hrefs.every((href) => href.startsWith(componentsPath));
}

/**
 * Starlight builds one sidebar for every page. The header tabs split it: Docs pages list the guides,
 * component pages list the component groups. Blocks pages use their own layout and never reach this.
 */
export const onRequest = defineRouteMiddleware(({ url, locals }) => {
	const section = sectionOf(url.pathname);
	if (section === 'blocks') return;
	const { starlightRoute } = locals;
	starlightRoute.sidebar = starlightRoute.sidebar.filter((entry) => isComponentEntry(entry) === (section === 'components'));
	// Prev/next walk the full sidebar, so the last guide would otherwise link to the first component and back.
	const { prev, next } = starlightRoute.pagination;
	starlightRoute.pagination = {
		prev: prev && sectionOf(prev.href) === section ? prev : undefined,
		next: next && sectionOf(next.href) === section ? next : undefined,
	};
});
