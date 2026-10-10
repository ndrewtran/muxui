import { blocksPath } from './block-paths.ts';

/** The header tabs. Each owns a part of the site: the header, the sidebar, and prev/next stay inside it. */
export type Section = 'docs' | 'components' | 'blocks';

export const componentsPath = '/components/';

/** The section a request path belongs to. Anything outside Blocks and Components is Docs. */
export function sectionOf(pathname: string): Section {
	if (pathname.startsWith(blocksPath)) return 'blocks';
	if (pathname.startsWith(componentsPath)) return 'components';
	return 'docs';
}
