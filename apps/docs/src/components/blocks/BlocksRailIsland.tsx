import { Disclosure, DisclosureGroup, Link, SearchField, SelectNative, Text } from '@muxui/react';
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

/** The block browser: search and "Uses" filters over the catalog index, and the Group > Category > Block > Variant tree. */
export default function BlocksRailIsland({ groups, usesOptions, allHref, currentPath }: BlocksRailProps) {
	const { filter, matched, unavailable } = useBrowseState();
	const pathname = usePathname(currentPath);
	const isShown = (block: RailBlock) => matched === null || matched.has(block.slug);
	const isCurrent = (block: RailBlock, variant: RailVariant) => pathname === variant.href || (pathname === block.address && variant === block.variants[0]);
	const blocks = groups.flatMap((group) => group.categories.flatMap((category) => category.blocks));
	const shown = blocks.filter(isShown).length;

	return (
		<aside className="blocks-rail" aria-label="Block browser" data-blocks-rail>
			<div className="blocks-filters" role="search">
				<SearchField aria-label="Search blocks" placeholder="Search blocks" value={filter.query} onChange={(query) => setFilter({ query })} />
				<SelectNative label="Uses component" value={filter.uses} onChange={(event) => setFilter({ uses: event.target.value })}>
					<option value="">Any component</option>
					{usesOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
				</SelectNative>
				<Text as="p" variant="mono" size="xs" color="muted" role="status" data-blocks-count>
					{unavailable ? 'Filters are unavailable. Change the filter to try again.' : `${shown} of ${plural(blocks.length, 'block')}`}
				</Text>
			</div>
			<div className="blocks-all">
				<Link href={allHref} current={pathname === allHref}>All blocks</Link>
			</div>
			<nav aria-label="Blocks">
				<Text as="p" color="muted" className="blocks-none" hidden={shown > 0} data-blocks-none>No blocks match.</Text>
				<ul className="blocks-tree">
					{groups.map((group) => (
						<li key={group.group} data-group={group.group} hidden={!group.categories.some(({ blocks: inCategory }) => inCategory.some(isShown))}>
							<Text as="h2" variant="label" size="xs" color="muted">{group.label}</Text>
							<DisclosureGroup defaultExpandedIds={group.categories.map(({ category }) => category)}>
								{group.categories.map((category) => {
									const inCategory = category.blocks.filter(isShown).length;
									return (
										<Disclosure
											key={category.category}
											id={category.category}
											title={<span>{category.label} <Text variant="mono" size="xs" color="muted">{inCategory}</Text></span>}
											hidden={inCategory === 0}
											data-category={category.category}
										>
											<ul>
												{category.blocks.map((block) => (
													<li key={block.slug} data-block={block.slug} hidden={!isShown(block)}>
														<Link href={block.variants[0].href} data-block-link>{block.name}</Link>
														<ul>
															{block.variants.map((variant) => (
																<li key={variant.slug}>
																	<Link href={variant.href} current={isCurrent(block, variant)} data-variant-link>{variant.name}</Link>
																</li>
															))}
														</ul>
													</li>
												))}
											</ul>
										</Disclosure>
									);
								})}
							</DisclosureGroup>
						</li>
					))}
				</ul>
			</nav>
		</aside>
	);
}
