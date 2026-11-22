// What the docs browser proofs (docs-*.test.mjs) share: the built site served over HTTP, the Chrome that opens it, and the waits and the pool the
// Styling proofs use. Run `pnpm --filter @muxui/docs build` first; the proofs read `apps/docs/dist`.
import assert from 'node:assert/strict';
import { createReadStream, readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { chromeExecutable } from './chrome.mjs';
import { deadline, step } from './deadlines.mjs';

export const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

function staticDocsServer() {
	return createServer(async (request, response) => {
		const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
		const file = normalize(join(docsRoot, pathname.endsWith('/') ? `${pathname}index.html` : pathname));
		if (!file.startsWith(`${docsRoot}/`)) {
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
}

/**
 * Serves the built docs and launches headless Chrome. `ready` is a page the build must have written (`blocks/index.html`). `close` closes both,
 * the server even when the browser fails to launch or to close, and may be called more than once.
 */
export async function openSite(ready) {
	await access(join(docsRoot, ready));
	const server = staticDocsServer();
	await new Promise((listening) => server.listen(0, '127.0.0.1', listening));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const closeServer = () => {
		server.closeAllConnections();
		return new Promise((done) => server.close(() => done()));
	};
	let browser;
	try {
		browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
	} catch (error) {
		await closeServer();
		throw error;
	}
	let closing;
	return {
		origin,
		browser,
		// Playwright kills a browser that has not closed within its own timeout, so this ends.
		close: () => (closing ??= browser.close().finally(closeServer)),
	};
}

/**
 * Runs `run({ origin, newPage, withPage })` against the site, then fails if any page raised an error. `newPage` opens a page in a context of
 * its own; `withPage(options, work)` does, runs `work(page)` and closes the context whatever happens. `within` is a deadline for the whole of
 * `run`, behind the deadlines of its steps: when it passes the site closes, which fails whatever is still waiting.
 */
export async function withSite(ready, run, { colorScheme: defaultScheme = 'dark', within } = {}) {
	const site = await openSite(ready);
	const errors = [];
	const newPage = async ({ width = 1280, height = 900, colorScheme = defaultScheme, reducedMotion = 'no-preference' } = {}) => {
		const page = await step('opening a page', async () => (await site.browser.newContext({ viewport: { width, height }, colorScheme, reducedMotion })).newPage());
		page.on('pageerror', (error) => errors.push(error.message));
		return page;
	};
	const withPage = async (options, work) => {
		const page = await newPage(options);
		try {
			return await work(page);
		} finally {
			// A context that does not close goes with the browser; the work's own failure is the one to report.
			await step('closing a page', page.context().close()).catch(() => {});
		}
	};
	try {
		const running = run({ origin: site.origin, newPage, withPage });
		// The work's own failure is thrown as it is: it already names the family and the step.
		await (within === undefined ? running : deadline('the proof as a whole', running, within));
		assert.deepEqual(errors, [], 'the pages raised no page errors');
	} finally {
		await site.close();
	}
}

/** The families whose page has previews, and the heights their previews reserve. */
export const reservedHeights = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/src/lib/preview-heights.json'), 'utf8'));

/** Waits until the previews have hydrated and the computed table holds a measurement in every cell the page can measure. */
export async function measured(page, timeout = 15000) {
	await page.waitForFunction(() => {
		const cells = [...document.querySelectorAll('#styling [data-styling-table="computed"] td[data-measure="before"], #styling [data-styling-table="computed"] td[data-measure="after"]')];
		return cells.length > 0 && cells.every((cell) => cell.textContent !== 'Not measured yet.');
	}, undefined, { timeout });
}

/** Waits until both previews have rendered their example (a client-only island is empty, then shows "Loading example"). */
export const previewsRendered = (page, timeout = 30000) => page.waitForFunction(() => {
	const islands = [...document.querySelectorAll('#styling [data-styling-pane] astro-island')];
	return islands.length === 2 && islands.every((island) => island.firstElementChild !== null && island.querySelector('.example-loading') === null);
}, undefined, { timeout });

/** Runs `work` over `items`, a few at a time: the work is waiting for pages. */
export async function pool(items, size, work) {
	const queue = [...items];
	await Promise.all(Array.from({ length: size }, async () => {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
	}));
}
