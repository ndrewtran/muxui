/**
 * The two width lists the Blocks toolbar and its browser checks share. Both are display
 * choices, not catalog facts, so they live here once and `BlockDetail.astro` and the
 * docs-blocks browser test read the same lists.
 */

/** The toolbar's width presets, in pixels. `Full` fills the stage and is not a preset. */
export const toolbarPresets = [
	{ key: 'S', width: 360 },
	{ key: 'M', width: 768 },
	{ key: 'L', width: 1280 },
] as const;

/** The page widths a marketing section is judged at on a real page, narrowest to widest. */
export const pageWidths = [360, 768, 1024, 1280, 1920] as const;
