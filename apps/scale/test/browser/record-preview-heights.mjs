// Records the height each component page's two Styling previews must reserve (apps/docs/src/lib/preview-heights.json).
//
//   pnpm --filter @muxui/docs build
//   node apps/scale/test/browser/record-preview-heights.mjs                    record every page
//   node apps/scale/test/browser/record-preview-heights.mjs --check text,tabs  record those pages and fail if the file is more than 1px from it
//
// A preview is a client-only island: it is empty until its example renders, and an empty frame that then grows pushes everything under it
// down (a layout shift). The page therefore reserves the example's own height up front. This script opens every page that has previews in
// Chromium, lets both examples render, and records the tallest the example gets across a range of widths, once for the single-column layout
// (`narrow`) and once for the two-column layout (`wide`), in whole pixels. `docs-styling.test.mjs` fails when an example is taller than what
// is recorded for it, so a changed example means running this again.
//
// What is recorded is the example's INTRINSIC height, read with motion off so that a spring is never caught in flight (preview-heights.mjs holds
// both rules). Recording is therefore repeatable: the same build gives the same file, whatever the load on the machine.
import { createReadStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromeExecutable } from './chrome.mjs';
import { measureIntrinsicHeights, motionOff, previewMargin } from './preview-heights.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs');
const dist = join(docsRoot, 'dist');
const output = join(docsRoot, 'src/lib/preview-heights.json');
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const server = createServer(async (request, response) => {
	const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
	const file = normalize(join(dist, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
	if (!file.startsWith(`${dist}/`)) {
		response.writeHead(403).end();
		return;
	}
	try {
		await access(file);
		response.writeHead(200, { 'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream' });
		createReadStream(file).pipe(response);
	} catch {
		response.writeHead(404).end();
	}
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });

const checking = process.argv.includes('--check');
const only = checking ? (process.argv[process.argv.indexOf('--check') + 1] ?? '').split(',').filter(Boolean) : [];
const slugs = readdirSync(join(dist, 'components')).filter((slug) => readFileSync(join(dist, 'components', slug, 'index.html'), 'utf8').includes('data-styling-compare')).filter((slug) => only.length === 0 || only.includes(slug)).sort();
const recorded = {};

async function record(slug) {
	const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, ...motionOff })).newPage();
	await page.goto(`${origin}/components/${slug}/`);
	await page.waitForFunction(() => {
		const islands = [...document.querySelectorAll('#styling [data-styling-pane] astro-island')];
		return islands.length === 2 && islands.every((island) => island.firstElementChild !== null && island.querySelector('.example-loading') === null);
	}, undefined, { timeout: 30000 });
	const heights = await measureIntrinsicHeights(page);
	await page.context().close();
	return heights;
}

// Several pages at once: the work is waiting.
const queue = [...slugs];
await Promise.all(Array.from({ length: 6 }, async () => {
	for (let slug = queue.shift(); slug !== undefined; slug = queue.shift()) {
		const { narrow, wide } = await record(slug);
		recorded[slug] = { narrow: narrow + previewMargin, wide: wide + previewMargin };
	}
}));
await browser.close();
await new Promise((done) => server.close(done));

const sorted = Object.fromEntries(Object.entries(recorded).sort(([left], [right]) => left.localeCompare(right)));
if (checking) {
	const committed = JSON.parse(readFileSync(output, 'utf8'));
	const close = (left, right) => left !== undefined && right !== undefined && Math.abs(left - right) <= 1;
	const different = Object.entries(sorted).filter(([slug, heights]) => !close(heights.narrow, committed[slug]?.narrow) || !close(heights.wide, committed[slug]?.wide)).map(([slug, heights]) => `${slug}: recorded ${JSON.stringify(committed[slug])}, measured ${JSON.stringify(heights)}`);
	console.log(different.length === 0 ? `Recording again gives the committed heights for ${slugs.length} pages.` : `Recording again gives other heights than ${output}:\n${different.join('\n')}`);
	process.exit(different.length === 0 ? 0 : 1);
}
writeFileSync(output, `${JSON.stringify(sorted, null, '\t')}\n`);
const tallest = Object.entries(sorted).sort(([, left], [, right]) => right.narrow - left.narrow).slice(0, 5).map(([slug, { narrow, wide }]) => `${slug} ${narrow}/${wide}`);
console.log(`Recorded the preview heights of ${slugs.length} pages in ${output}. Tallest (narrow/wide): ${tallest.join(', ')}.`);
