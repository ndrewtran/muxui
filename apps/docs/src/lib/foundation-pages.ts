/**
 * The single list of foundation pages. It stays free of Node-only imports so
 * the Astro config sidebar and the client-side explorer can both read it.
 */
export type FoundationPage = {
	slug: string;
	label: string;
	title: string;
	description: string;
	kind: 'overview' | 'layer' | 'category';
	layer?: string;
	category?: string;
};

/** A routed foundation page plus the shorter card copy shown on the overview grid. */
export type FoundationPageEntry = FoundationPage & {
	card: { eyebrow: string; description: string };
};

export const FOUNDATION_PAGES: readonly FoundationPageEntry[] = Object.freeze([
	{
		slug: 'reference-tokens',
		label: 'Reference tokens',
		title: 'Reference tokens',
		description: 'Stable scales and primitives that give semantic roles a shared vocabulary.',
		kind: 'layer',
		layer: 'reference',
		card: { eyebrow: 'Layer 01', description: 'Stable primitives for colour, dimensions, type, motion, and effects.' },
	},
	{
		slug: 'semantic-tokens',
		label: 'Semantic tokens',
		title: 'Semantic tokens',
		description: 'Role-based tokens for content, surfaces, borders, actions, type, and interaction.',
		kind: 'layer',
		layer: 'semantic',
		card: { eyebrow: 'Layer 02', description: 'Interface roles for content, surfaces, actions, states, and layout.' },
	},
	{
		slug: 'colour',
		label: 'Colour',
		title: 'Colour',
		description: 'Palette ramps and semantic colour roles shown in their actual interface contexts.',
		kind: 'category',
		category: 'colour',
		card: { eyebrow: 'Category', description: 'Full canonical ramps plus role-based interface colour specimens.' },
	},
	{
		slug: 'typography',
		label: 'Typography',
		title: 'Typography',
		description: 'Font families, sizes, weights, leading, and tracking rendered as real type specimens.',
		kind: 'category',
		category: 'typography',
		card: { eyebrow: 'Category', description: 'Real type specimens mapped to the theme’s role and variant graph.' },
	},
	{
		slug: 'spacing',
		label: 'Spacing',
		title: 'Spacing and dimensions',
		description: 'The dimension scales behind layout rhythm, control sizing, and responsive recipes.',
		kind: 'category',
		category: 'spacing',
		card: { eyebrow: 'Category', description: 'Rulers, gaps, insets, control sizing, and the complete dimension inventory.' },
	},
	{
		slug: 'shape',
		label: 'Shape',
		title: 'Shape',
		description: 'Corner-radius roles shown at the same size so their intended hierarchy is easy to compare.',
		kind: 'category',
		category: 'shape',
		card: { eyebrow: 'Category', description: 'Equal-size corner specimens for reference and semantic radius roles.' },
	},
	{
		slug: 'elevation',
		label: 'Elevation',
		title: 'Elevation and effects',
		description: 'Typed shadows and surface depth, resolved by the same compiler used by consumers.',
		kind: 'category',
		category: 'elevation',
		card: { eyebrow: 'Category', description: 'Typed shadows and equal-size surfaces at each depth level.' },
	},
	{
		slug: 'motion',
		label: 'Motion',
		title: 'Motion',
		description: 'Finite, user-triggered timing and easing specimens with a reduced-motion-safe mode.',
		kind: 'category',
		category: 'motion',
		card: { eyebrow: 'Category', description: 'User-triggered timing and easing replays with reduced-motion safety.' },
	},
	{
		slug: 'component-tokens',
		label: 'Component tokens',
		title: 'Component tokens',
		description: 'Component-owned customization points and the semantic roles they consume.',
		kind: 'layer',
		layer: 'component',
		card: { eyebrow: 'Layer 03', description: 'Component-owned aliases with honest property previews.' },
	},
]);

export const FOUNDATION_OVERVIEW: FoundationPage = Object.freeze({
	slug: 'overview',
	label: 'Overview',
	title: 'Foundations',
	description: 'A visual index of the canonical Mux UI token system, from reference primitives through semantic and component roles.',
	kind: 'overview',
});

export function foundationPage(slug: string): FoundationPage | undefined {
	return slug === FOUNDATION_OVERVIEW.slug
		? FOUNDATION_OVERVIEW
		: FOUNDATION_PAGES.find((page) => page.slug === slug);
}
