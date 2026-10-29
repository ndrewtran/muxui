// How tall a component page's Styling previews are, for record-preview-heights.mjs (which records it) and docs-styling.test.mjs (which holds the
// page to it). One rule for both, so that they cannot disagree about when an example has settled.
//
// The page must be opened with `reducedMotion: 'reduce'` (`motionOff`). Mux's springs (the DisclosureGroup and Activity panels re-measure when
// the window changes) honour it and land on their height in the frame they start. A spring left running is read wherever it happens to be when
// a sample lands, and it overshoots its height by up to 4px: the earlier rule (two readings within 0.5px, 100ms apart) took the peak, where the
// height barely moves, for the end, and recorded the page up to 3px too tall under load. With motion off the heights are the ones the springs
// settle on (identical to the layout unit, 1/64px, on every page at every width below), so nothing is lost by not waiting for them.

export const previewWidths = [320, 360, 390, 430, 600, 768, 900, 1024, 1180, 1280, 1440, 1700, 1920];
/** Added to what is measured: a sub-pixel difference of another machine's font must not push the page. */
export const previewMargin = 2;
export const motionOff = { reducedMotion: 'reduce' };

/**
 * The tallest each example gets across `previewWidths`, in whole pixels, once for the single-column layout (`narrow`) and once for the
 * two-column layout (`wide`, the narrow height where no width is two columns). `page` has rendered both examples and was opened with `motionOff`.
 *
 * It is the example's INTRINSIC height: the frame's reservation is taken off while it measures (`min-height: 0`), because the demo frame stretches
 * to fill the reservation, and a frame measured with its own reservation reads that reservation back, so that recording again could only grow it.
 */
export async function measureIntrinsicHeights(page) {
	if (!(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))) throw new Error('measureIntrinsicHeights needs a page opened with motionOff: a spring in flight has no settled height to read.');
	await page.evaluate(() => document.fonts.ready);
	await page.addStyleTag({ content: '.styling-frame { min-height: 0 !important; }' });
	const heights = { narrow: 0, wide: 0 };
	for (const width of previewWidths) {
		await page.setViewportSize({ width, height: 900 });
		const { columns, height } = await settledLayout(page);
		const key = columns > 1 ? 'wide' : 'narrow';
		heights[key] = Math.max(heights[key], Math.ceil(height));
	}
	return { narrow: heights.narrow, wide: heights.wide === 0 ? heights.narrow : heights.wide };
}

/**
 * The layout once it has stopped changing: the same column count and height on every animation frame for 200ms (and three frames, so that a
 * frame stalled by load does not count as 200ms of quiet). A resize reaches an example a frame or two later, through its ResizeObserver and
 * React, which is what this waits out. A layout that has not settled in 5s throws: an unsettled reading must never be recorded.
 */
function settledLayout(page) {
	return page.evaluate(() => new Promise((resolve, reject) => {
		const read = () => ({
			columns: getComputedStyle(document.querySelector('#styling [data-styling-compare]')).gridTemplateColumns.split(' ').length,
			height: Math.max(...[...document.querySelectorAll('#styling [data-styling-pane] .demo-frame')].map((frame) => frame.getBoundingClientRect().height)),
		});
		const start = performance.now();
		let last = read();
		let since = start;
		let frames = 0;
		const look = () => {
			const now = performance.now();
			const seen = read();
			if (seen.columns !== last.columns || seen.height !== last.height) {
				last = seen;
				since = now;
				frames = 0;
			} else frames += 1;
			if (frames >= 3 && now - since >= 200) resolve(last);
			else if (now - start > 5000) reject(new Error(`the previews were still changing after 5s (${last.height}px, ${last.columns} columns)`));
			else requestAnimationFrame(look);
		};
		requestAnimationFrame(look);
	}));
}
