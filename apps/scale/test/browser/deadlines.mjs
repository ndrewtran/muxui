// A deadline for every wait of the docs browser proofs. Playwright gives page.evaluate, setViewportSize, addStyleTag and context.close no
// timeout of their own, so a renderer that stops answering would stall a file without a line of output until the CI job is cancelled.
import { AssertionError } from 'node:assert/strict';

/** The deadline of a call that normally answers in milliseconds, sized for a runner shared with other browsers. */
export const stepWithin = 30_000;

/**
 * Awaits `work` (a promise, or a function that returns one), failing as `<what>: did not finish within <n>s` if it is still pending after
 * `within` ms. An error of the work's own is thrown as it is.
 */
export async function deadline(what, work, within) {
	const pending = typeof work === 'function' ? work() : work;
	// Work abandoned at its deadline rejects later, when the page or browser closes under it: that must not land in another test.
	pending.catch(() => {});
	let timer;
	try {
		return await Promise.race([pending, new Promise((_, reject) => {
			timer = setTimeout(() => reject(new Error(`${what}: did not finish within ${within / 1000}s`)), within);
		})]);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * `deadline`, naming `what`, the family and the step, in every failure: an error of the work's own is thrown again as `<what>: <message>`.
 * Give a call that has a timeout of its own a longer `within`, so that its own, more precise error comes first, and work made of steps that
 * have deadlines `Infinity`, which only names it.
 */
export async function step(what, work, within = stepWithin) {
	try {
		// An infinite `within` only names the work (setTimeout would fire it at once).
		return await (Number.isFinite(within) ? deadline(what, work, within) : typeof work === 'function' ? work() : work);
	} catch (error) {
		// An assertion is the proof's own finding, and says what it found.
		if (error instanceof AssertionError || (error instanceof Error && error.message.startsWith(`${what}: `))) throw error;
		throw new Error(`${what}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
}
