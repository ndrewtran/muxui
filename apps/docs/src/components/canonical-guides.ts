import type { CatalogGuide } from '../lib/catalog.ts';

export type GuideHeading = {
	depth: number;
	slug: string;
	text: string;
};

export type CanonicalGuideModule = {
	Content: (props?: Record<string, unknown>) => unknown;
	getHeadings: () => readonly GuideHeading[];
};

const guideModules = import.meta.glob<CanonicalGuideModule>('../../../../catalog/guides/*.md', {
	eager: true,
});

export function getCanonicalGuideModule(guide: CatalogGuide): CanonicalGuideModule {
	const guideModule = Object.entries(guideModules).find(([path]) => path.endsWith(guide.source.content))?.[1];
	if (!guideModule) throw new Error(`Missing canonical guide module for ${guide.source.content}.`);
	return guideModule;
}
