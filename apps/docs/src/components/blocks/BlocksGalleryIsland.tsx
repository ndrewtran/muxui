import { Link, Text } from '@muxui/react';
import { useEffect, useRef, useState } from 'react';
import { useBrowseState } from '../../scripts/blocks-browse.ts';
import { onSiteThemeChange, setFrameTheme, siteTheme } from '../../scripts/blocks-dom.ts';

export interface GalleryBlock {
	slug: string;
	name: string;
	summary: string;
	/** The block's first variant page. */
	href: string;
	previewSrc: string;
	variantCount: number;
}

export interface GalleryCategory {
	category: string;
	label: string;
	blocks: readonly GalleryBlock[];
}

export interface BlocksGalleryProps {
	categories: readonly GalleryCategory[];
}

// Thumbnails render the real preview at a fixed logical size and scale it to the card.
const THUMB_WIDTH = 1024;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function Thumbnail({ src }: { src: string }) {
	const thumbRef = useRef<HTMLDivElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [scale, setScale] = useState<number | null>(null);

	useEffect(() => {
		const element = thumbRef.current;
		if (!element) return undefined;
		const fit = () => setScale(element.clientWidth / THUMB_WIDTH);
		const observer = new ResizeObserver(fit);
		observer.observe(element);
		fit();
		return () => observer.disconnect();
	}, []);
	// A thumbnail follows the site theme, not the block viewer's preview theme.
	useEffect(() => {
		const apply = () => iframeRef.current && setFrameTheme(iframeRef.current, siteTheme());
		apply();
		return onSiteThemeChange(apply);
	}, []);

	return (
		<div className="blocks-thumb" ref={thumbRef} aria-hidden="true" inert>
			<iframe
				ref={iframeRef}
				src={src}
				title=""
				loading="lazy"
				tabIndex={-1}
				style={scale === null ? undefined : { transform: `scale(${scale})` }}
				onLoad={(event) => setFrameTheme(event.currentTarget, siteTheme())}
			/>
		</div>
	);
}

/** Every block as a card, narrowed by the rail's filter. Cards hide in place so their previews keep loading. */
export default function BlocksGalleryIsland({ categories }: BlocksGalleryProps) {
	const { matched } = useBrowseState();
	const blocks = categories.flatMap((category) => category.blocks);
	const isShown = (block: GalleryBlock) => matched === null || matched.has(block.slug);
	const shown = blocks.filter(isShown);
	const variants = shown.reduce((sum, block) => sum + block.variantCount, 0);

	return (
		<div className="blocks-scroll" data-blocks-gallery>
			<div className="blocks-ohead">
				<Text as="h1" variant="heading" size="sm">All blocks</Text>
				<Text as="p" color="muted" role="status" data-gallery-count>{plural(shown.length, 'block')}, {plural(variants, 'variant')}</Text>
			</div>
			{blocks.length === 0 && <Text as="p" color="muted" className="blocks-empty">The catalog has no blocks yet.</Text>}
			{categories.map((category) => (
				<section
					key={category.category}
					className="blocks-section"
					data-category={category.category}
					aria-labelledby={`blocks-section-${category.category}`}
					hidden={!category.blocks.some(isShown)}
				>
					<Text as="h2" variant="title" size="sm" id={`blocks-section-${category.category}`}>{category.label}</Text>
					<ul className="blocks-cards">
						{category.blocks.map((block) => (
							<li key={block.slug} data-block={block.slug} data-variants={block.variantCount} hidden={!isShown(block)}>
								<div className="blocks-card">
									<Thumbnail src={block.previewSrc} />
									<div className="blocks-card-row">
										<Link className="blocks-card-link" href={block.href}>{block.name}</Link>
										<Text size="xs" color="muted">{plural(block.variantCount, 'variant')}</Text>
									</div>
									<Text as="p" size="xs" color="muted">{block.summary}</Text>
								</div>
							</li>
						))}
					</ul>
				</section>
			))}
			<Text as="p" color="muted" className="blocks-empty" hidden={shown.length > 0 || blocks.length === 0} data-gallery-none>No blocks match.</Text>
		</div>
	);
}
