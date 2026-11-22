// How tall a component page's Styling previews are, for record-preview-heights.mjs (which records it) and docs-styling-heights.test.mjs (which holds the
// page to it). One rule for both, so that they cannot disagree about when an example has settled.
//
// The page must be opened with `reducedMotion: 'reduce'` (`motionOff`). Mux's springs (the DisclosureGroup and Activity panels re-measure when
// the window changes) honour it and land on their height in the frame they start. A spring left running is read wherever it happens to be when
// a sample lands, and it overshoots its height by up to 4px: the earlier rule (two readings within 0.5px, 100ms apart) took the peak, where the
// height barely moves, for the end, and recorded the page up to 3px too tall under load. With motion off the heights are the ones the springs
// settle on (identical to the layout unit, 1/64px, on every page at every width below), so nothing is lost by not waiting for them.

import { deadline, step, stepWithin } from './deadlines.mjs';

export const previewWidths = [320, 360, 390, 430, 600, 768, 900, 1024, 1180, 1280, 1440, 1700, 1920];
/** Added to what is measured: a sub-pixel difference of another machine's font must not push the page. */
export const previewMargin = 2;
export const motionOff = { reducedMotion: 'reduce' };
/** How long the page waits for a layout to stop changing. */
const settleWithin = 15_000;

/**
 * The tallest each example gets across `previewWidths`, in whole pixels, once for the single-column layout (`narrow`) and once for the
 * two-column layout (`wide`, the narrow height where no width is two columns). `page` has rendered both examples and was opened with `motionOff`.
 *
 * It is the example's INTRINSIC height: the frame's reservation is taken off while it measures (`min-height: 0`), because the demo frame stretches
 * to fill the reservation, and a frame measured with its own reservation reads that reservation back, so that recording again could only grow it.
 */
export async function measureIntrinsicHeights(page) {
	if (!(await step('reading the motion setting', page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)))) throw new Error('measureIntrinsicHeights needs a page opened with motionOff: a spring in flight has no settled height to read.');
	await step('loading the fonts', page.evaluate(() => document.fonts.ready));
	await step('taking the reservation off', page.addStyleTag({ content: '.styling-frame { min-height: 0 !important; }' }));
	const heights = { narrow: 0, wide: 0 };
	for (const width of previewWidths) {
		await step(`resizing to ${width}px`, page.setViewportSize({ width, height: 900 }));
		// The page gives up after 15s, but only from an animation frame: this ends the wait when frames stop. A failure says what the page was doing.
		const { columns, height } = await step(`settling at ${width}px`, settledLayout(page), settleWithin + stepWithin).catch(async (error) => {
			throw new Error(`${error.message}; the page: ${await settling(page)}`, { cause: error });
		});
		const key = columns > 1 ? 'wide' : 'narrow';
		heights[key] = Math.max(heights[key], Math.ceil(height));
	}
	return { narrow: heights.narrow, wide: heights.wide === 0 ? heights.narrow : heights.wide };
}

/**
 * The layout once it has stopped changing: the same column count and height on every animation frame for 200ms (and three frames, so that a
 * frame stalled by load does not count as 200ms of quiet). A resize reaches an example a frame or two later, through its ResizeObserver and
 * React, which is what this waits out. A layout that has not settled in 15s (the proof shares its machine with other browsers) throws: an
 * unsettled reading must never be recorded.
 */
function settledLayout(page) {
	return page.evaluate((within) => new Promise((resolve, reject) => {
		const read = () => ({
			columns: getComputedStyle(document.querySelector('#styling [data-styling-compare]')).gridTemplateColumns.split(' ').length,
			height: Math.max(...[...document.querySelectorAll('#styling [data-styling-pane] .demo-frame')].map((frame) => frame.getBoundingClientRect().height)),
		});
		const start = performance.now();
		let last = read();
		let since = start;
		let frames = 0;
		// What `settling` reports if this never ends: the frames seen and the last readings, as [ms since the start, height, columns].
		const trace = { start, frames: 0, lastFrame: null, readings: [] };
		window.__muxuiSettling = trace;
		const look = () => {
			const now = performance.now();
			const seen = read();
			trace.frames += 1;
			trace.lastFrame = now;
			trace.readings = [...trace.readings, [Math.round(now - start), seen.height, seen.columns]].slice(-8);
			if (seen.columns !== last.columns || seen.height !== last.height) {
				last = seen;
				since = now;
				frames = 0;
			} else frames += 1;
			if (frames >= 3 && now - since >= 200) resolve(last);
			else if (now - start > within) reject(new Error(`the previews were still changing after ${within / 1000}s (${last.height}px, ${last.columns} columns)`));
			else requestAnimationFrame(look);
		};
		requestAnimationFrame(look);
	}), settleWithin);
}

/**
 * What a page whose layout did not settle was doing, as text for the failure: the frames the settle check saw and how long ago the last
 * came, its last readings, whether frames run now (counted over 500ms), the page's visibility and focus, and its running animations. A page
 * that does not answer in 5s has a busy main thread or a renderer that has stopped.
 */
function settling(page) {
	const report = page.evaluate(() => new Promise((resolve) => {
		const trace = window.__muxuiSettling;
		const now = performance.now();
		let framesNow = 0;
		let counting = true;
		const count = () => {
			framesNow += 1;
			if (counting) requestAnimationFrame(count);
		};
		requestAnimationFrame(count);
		setTimeout(() => {
			counting = false;
			resolve({
				settleFrames: trace?.frames ?? null,
				msSinceStart: trace ? Math.round(now - trace.start) : null,
				msSinceLastFrame: trace?.lastFrame == null ? null : Math.round(now - trace.lastFrame),
				readings: trace?.readings ?? null,
				framesIn500ms: framesNow,
				visibility: document.visibilityState,
				focused: document.hasFocus(),
				animations: document.getAnimations().filter((animation) => animation.playState === 'running').map((animation) => ({
					name: animation.animationName ?? animation.transitionProperty ?? animation.constructor.name,
					time: Math.round(Number(animation.currentTime)),
					target: animation.effect?.target?.className?.toString().slice(0, 60) ?? null,
				})),
			});
		}, 500);
	}));
	return deadline('reading the page', report, 5000).then((found) => JSON.stringify(found), (error) => `${error.message} (its main thread is busy or its renderer has stopped)`);
}
