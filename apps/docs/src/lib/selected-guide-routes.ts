import { FOUNDATION_PAGES } from './foundation-pages.ts';

/** The current standalone shared routes, including the existing installation projection. */
export const SHARED_GUIDE_ROUTES = [
	{ slug: 'accessibility', id: 'muxui:guide:accessibility' },
	{ slug: 'contribution', id: 'muxui:guide:contribution' },
	{ slug: 'control-sizing', id: 'muxui:guide:control-sizing-usage' },
	{ slug: 'discovery', id: 'muxui:guide:discovery' },
	{ slug: 'installation', id: 'installation' },
	{ slug: 'lifecycle', id: 'muxui:guide:lifecycle' },
	{ slug: 'themes', id: 'muxui:guide:themes' },
	{ slug: 'token-migration', id: 'muxui:guide:token-migration' },
];

/** Selected canonical guides only; Installation is a package projection, not a guide. */
export const SELECTED_GUIDE_ROUTES = [
	...SHARED_GUIDE_ROUTES.filter(({ id }) => id !== 'installation').map(({ slug, id }) => ({ route: `/${slug}/`, id })),
	{ route: '/foundations/', id: 'muxui:guide:foundations' },
	...FOUNDATION_PAGES.map(({ slug }) => ({ route: `/foundations/${slug}/`, id: `muxui:guide:foundations-${slug}` })),
];
