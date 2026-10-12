import { SearchField, SelectNative, Sidebar, Text, type SidebarNavEntry } from '@muxui/react';
import { useEffect, useState } from 'react';
import { setFilter, useBrowseState, usePathname } from '../../scripts/blocks-browse.ts';

export interface RailVariant {
	slug: string;
	name: string;
	href: string;
}

export interface RailBlock {
	slug: string;
	name: string;
	/** The block's own address, which opens its first variant. */
	address: string;
	variants: readonly RailVariant[];
}

export interface RailCategory {
	category: string;
	label: string;
	blocks: readonly RailBlock[];
}

export interface RailGroup {
	group: string;
	label: string;
	categories: readonly RailCategory[];
}

export interface BlocksRailProps {
	groups: readonly RailGroup[];
	usesOptions: readonly { id: string; name: string }[];
	allHref: string;
	/** The page the server rendered, so the first client render agrees with it. */
	currentPath: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const categoryKey = (category: RailCategory) => `category:${category.category}`;
const blockKey = (block: RailBlock) => `block:${block.slug}`;
const isCurrentVariant = (pathname: string, block: RailBlock, variant: RailVariant) =>
	pathname === variant.href || (pathname === block.address && variant === block.variants[0]);

/** The groups that must be open for `pathname` to show: the category and the block that hold its variant. */
function ancestorKeys(groups: readonly RailGroup[], pathname: string): string[] {
	for (const { categories } of groups) {
		for (const category of categories) {
			for (const block of category.blocks) {
				if (block.variants.some((variant) => isCurrentVariant(pathname, block, variant))) return [categoryKey(category), blockKey(block)];
			}
		}
	}
	return [];
}

/**
 * The block browser: search and "Uses" filters over the catalog index, and the Group > Category > Block > Variant tree
 * as Sidebar navigation. Groups start open. A collapsed group stays collapsed through in-place navigation, and opening a
 * page opens the groups that hold it.
 */
export default function BlocksRailIsland({ groups, usesOptions, allHref, currentPath }: BlocksRailProps) {
	const { filter, matched, unavailable } = useBrowseState();
	const pathname = usePathname(currentPath);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	const isShown = (block: RailBlock) => matched === null || matched.has(block.slug);
	const blocks = groups.flatMap((group) => group.categories.flatMap((category) => category.blocks));
	const shown = blocks.filter(isShown).length;

	useEffect(() => {
		const keys = ancestorKeys(groups, pathname);
		setCollapsed((previous) => {
			if (!keys.some((key) => previous.has(key))) return previous;
			const next = new Set(previous);
			keys.forEach((key) => next.delete(key));
			return next;
		});
	}, [groups, pathname]);

	/** Expansion props that keep one group's state in `collapsed`. */
	const expansion = (key: string) => ({
		expanded: !collapsed.has(key),
		onExpandedChange: (open: boolean) => setCollapsed((previous) => {
			const next = new Set(previous);
			if (open) next.delete(key); else next.add(key);
			return next;
		}),
	});
	const blockEntry = (block: RailBlock): SidebarNavEntry => ({
		id: block.slug,
		label: block.name,
		href: block.variants[0].href,
		...expansion(blockKey(block)),
		items: block.variants.map((variant) => ({ id: variant.slug, label: variant.name, href: variant.href, current: isCurrentVariant(pathname, block, variant) })),
	});

	return (
		<Sidebar.Root className="blocks-rail" aria-label="Block browser" density="compact" hideBorder data-blocks-rail>
			<Sidebar.Header className="blocks-filters" role="search">
				<SearchField aria-label="Search blocks" placeholder="Search blocks" value={filter.query} onChange={(query) => setFilter({ query })} />
				<SelectNative label="Uses component" value={filter.uses} onChange={(event) => setFilter({ uses: event.target.value })}>
					<option value="">Any component</option>
					{usesOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
				</SelectNative>
				<Text as="p" variant="mono" size="xs" color="muted" role="status" data-blocks-count>
					{unavailable ? 'Filters are unavailable. Change the filter to try again.' : `${shown} of ${plural(blocks.length, 'block')}`}
				</Text>
			</Sidebar.Header>
			<Text as="p" color="muted" className="blocks-none" hidden={shown > 0} data-blocks-none>No blocks match.</Text>
			<Sidebar.NavList aria-label="Blocks">
				<Sidebar.NavItem href={allHref} current={pathname === allHref}>All blocks</Sidebar.NavItem>
				{groups.map((group) => {
					const categories = group.categories.filter((category) => category.blocks.some(isShown));
					if (categories.length === 0) return null;
					return (
						<Sidebar.Section key={group.group} label={group.label} data-group={group.group}>
							{categories.map((category) => {
								const inCategory = category.blocks.filter(isShown);
								return (
									<Sidebar.NavItem key={category.category} badge={inCategory.length} {...expansion(categoryKey(category))} items={inCategory.map(blockEntry)}>
										{category.label}
									</Sidebar.NavItem>
								);
							})}
						</Sidebar.Section>
					);
				})}
			</Sidebar.NavList>
		</Sidebar.Root>
	);
}
