// Browser proof that a component page does not move when its Styling previews render. Run after `pnpm --filter @muxui/docs build`.
//
// A preview is empty until its example hydrates, so the page reserves the example's height up front (apps/docs/src/lib/preview-heights.json,
// recorded by record-preview-heights.mjs). This holds the page to it: every family reserves the height of its example, the reservation is the
// example's intrinsic height plus the fixed margin, recording again gives the committed file, and the page does not shift when its scripts
// come late. The rest of the Styling section is docs-styling.test.mjs.
//
// These run beside the other docs files on a shared runner, so their waits are two to three times what an idle machine needs (the settle
// deadline in preview-heights.mjs and the recorder's render wait carry the same allowance). Every wait has a deadline that names the family and
// the step (deadlines.mjs), and each test one for the whole of it, so a stalled browser fails the file instead of holding the job until it is
// cancelled; pages close in `finally`, the browser and the server in `withSite`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { step } from './deadlines.mjs';
import { measured, pool, previewsRendered, reservedHeights, withSite as withDocsSite } from './docs-site.mjs';
import { measureIntrinsicHeights, motionOff, previewMargin } from './preview-heights.mjs';

// The deadline for each test as a whole is four times or more what it takes on a busy local machine: up to 70s and 100s for the walks over
// every family, 135s for the late scripts.
const withSite = (run, within) => withDocsSite('components/button/index.html', run, { within });
const measuredWithin = 30_000;
const renderedWithin = 60_000;
/** The deadline of a wait that has a timeout of its own: long enough for that timeout's own error to come first. */
const after = (timeout) => timeout + 15_000;

test('every family reserves the height of its example: a preview does not grow when it renders', async () => {
	await withSite(async ({ origin, withPage }) => {
		const grown = [];
		await pool(Object.keys(reservedHeights), 6, (slug) => withPage({}, async (page) => {
			await step(`${slug}: opening the page`, page.goto(`${origin}/components/${slug}/`), after(30_000));
			await step(`${slug}: rendering the previews`, previewsRendered(page, renderedWithin), after(renderedWithin));
			for (const width of [360, 768, 1280]) {
				await step(`${slug} at ${width}px: resizing`, async () => {
					await page.setViewportSize({ width, height: 900 });
					await page.waitForTimeout(250);
				});
				const frames = await step(`${slug} at ${width}px: reading the frames`, page.evaluate(() => [...document.querySelectorAll('#styling .styling-frame')].map((frame) => ({ height: frame.getBoundingClientRect().height, reserved: Number.parseFloat(getComputedStyle(frame).minHeight) }))));
				for (const frame of frames) if (frame.height > frame.reserved + 0.5) grown.push(`${slug} at ${width}px: the frame is ${frame.height}px, it reserves ${frame.reserved}px`);
			}
		}));
		assert.deepEqual(grown, [], 'record-preview-heights.mjs records the heights again when an example changes');
	}, 300_000);
});

test('a family reserves the intrinsic height of its example plus the fixed margin, not the height of its own reservation', async () => {
	await withSite(async ({ origin, withPage }) => {
		// Measured with the rule record-preview-heights.mjs records with (preview-heights.mjs: the reservation taken off, motion off), against what the
		// page prints.
		const off = [];
		await pool(Object.keys(reservedHeights), 6, (slug) => withPage(motionOff, async (page) => {
			await step(`${slug}: opening the page`, page.goto(`${origin}/components/${slug}/`), after(30_000));
			await step(`${slug}: rendering the previews`, previewsRendered(page, renderedWithin), after(renderedWithin));
			const printed = await step(`${slug}: reading the reserved heights`, page.evaluate(() => {
				const style = document.querySelector('#styling [data-styling-compare]').style;
				return { narrow: Number.parseFloat(style.getPropertyValue('--preview-h-narrow')), wide: Number.parseFloat(style.getPropertyValue('--preview-h-wide')) };
			}));
			// Each of its steps has a deadline of its own; this one only adds the family to the message.
			const intrinsic = await step(`${slug}: measuring the intrinsic heights`, measureIntrinsicHeights(page), Number.POSITIVE_INFINITY);
			const wanted = { narrow: intrinsic.narrow + previewMargin, wide: intrinsic.wide + previewMargin };
			for (const key of ['narrow', 'wide']) if (Math.abs(printed[key] - wanted[key]) > 1) off.push(`${slug} ${key}: reserves ${printed[key]}px, the example needs ${wanted[key] - previewMargin}px (+${previewMargin}px)`);
			assert.deepEqual(printed, reservedHeights[slug], `${slug}: the page prints the recorded heights`);
		}));
		assert.deepEqual(off, [], 'a reservation that is not the example\'s own height plus the margin within 1px');
	}, 480_000);
});

test('recording the preview heights again gives the committed file', { timeout: 300_000 }, () => {
	// A sample that has the tall, the wrapping (Text at 320px), the short and the two-column families; the page already reserves its heights, which is what
	// a re-recording measures: it has to read the example and not its own reservation, or each recording would grow the file.
	const sample = ['text', 'calendar', 'sidebar', 'disclosure-group', 'activity', 'button', 'tag-group', 'separator'];
	const run = spawnSync(process.execPath, [resolve(import.meta.dirname, 'record-preview-heights.mjs'), '--check', sample.join(',')], { encoding: 'utf8', timeout: 280_000 });
	assert.equal(run.status, 0, `${run.error?.code === 'ETIMEDOUT' ? 'the recorder did not finish within 280s and was stopped\n' : ''}${run.stdout}${run.stderr}`);
	assert.match(run.stdout, /gives the committed heights for 8 pages/u);
});

test('the page does not move when the previews render, even when its scripts come late', async () => {
	await withSite(async ({ origin, withPage }) => {
		// The tallest examples, and the two a review measured moving the page most before the heights were reserved.
		const tallest = Object.entries(reservedHeights).sort(([, left], [, right]) => right.narrow - left.narrow).slice(0, 4).map(([slug]) => slug);
		const moved = [];
		for (const slug of new Set([...tallest, 'calendar', 'code-block'])) {
			for (const width of [360, 1280]) {
				await withPage({ width, height: 800, colorScheme: 'light' }, async (page) => {
					await step(`${slug} at ${width}px: delaying the scripts`, async () => {
						await page.route('**/*.js', async (route) => {
							await new Promise((done) => setTimeout(done, 1800));
							// The page may have closed meanwhile, after a failure.
							await route.continue().catch(() => {});
						});
						await page.addInitScript(() => {
							window.__shift = 0;
							new PerformanceObserver((list) => {
								for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
							}).observe({ type: 'layout-shift', buffered: true });
						});
					});
					// Open on the previews, so that they are on screen when they render.
					await step(`${slug} at ${width}px: opening the page`, page.goto(`${origin}/components/${slug}/#styling-pane-default`), after(30_000));
					await step(`${slug} at ${width}px: measuring the previews`, measured(page, measuredWithin), after(measuredWithin));
					await step(`${slug} at ${width}px: waiting out the last shift`, page.waitForTimeout(300));
					const shift = await step(`${slug} at ${width}px: reading the shift`, page.evaluate(() => window.__shift));
					if (shift >= 0.1) moved.push(`${slug} at ${width}px: ${shift.toFixed(3)}`);
				});
			}
		}
		assert.deepEqual(moved, [], 'a shift of 0.1 or more');
	}, 600_000);
});
