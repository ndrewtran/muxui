// Browser proof for how the typed API reference of the built docs opens. Run after `pnpm --filter @muxui/docs build`.
//
// Most parts and types of a long component page are closed when it loads. A link has to open what it names, including a saved link
// to a heading the earlier layout had.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { chromeExecutable } from './chrome.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const { anchors: legacyAnchors } = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../docs/src/lib/legacy-part-anchors.json'), 'utf8'));

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

async function withSite(run) {
	await access(join(docsRoot, 'components/command-palette/index.html'));
	const server = staticDocsServer();
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
	const errors = [];
	const newPage = async (viewport = { width: 1280, height: 900 }) => {
		const page = await (await browser.newContext({ viewport })).newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		return page;
	};
	try {
		await run({ origin, newPage });
		assert.deepEqual(errors, [], 'the pages raised no page errors');
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}

// A row inside a closed details element still has a box, but the browser skips it: checkVisibility() is false for it, which is what
// a reader (and a printed page) does not see.

/** Whether the heading of a part is on screen and not under something that covers it, such as the fixed header. */
const headingShown = (page, heading) => page.evaluate((name) => {
	const h3 = document.querySelector(`details.api-part[data-api-part="${name}"] h3`);
	const { top, bottom, left, width } = h3.getBoundingClientRect();
	const covering = document.elementFromPoint(left + Math.min(width, 4) / 2, (top + bottom) / 2);
	return { top, bottom, viewport: window.innerHeight, covered: covering === null || !h3.contains(covering) };
}, heading);

test('a saved link to a part of the earlier layout opens the part it now names and brings its heading into view', async () => {
	await withSite(async ({ origin, newPage }) => {
		let checked = 0;
		for (const [slug, ids] of Object.entries(legacyAnchors)) {
			for (const [id, heading] of Object.entries(ids)) {
				const page = await newPage();
				await page.goto(`${origin}/components/${slug}/#${id}`);
				const part = page.locator(`details.api-part[data-api-part="${heading}"]`);
				await part.waitFor();
				assert.equal(await part.evaluate((node) => node.open), true, `/components/${slug}/#${id} opens ${heading}`);
				const shown = await headingShown(page, heading);
				assert.ok(shown.top >= 0 && shown.bottom <= shown.viewport && !shown.covered, `/components/${slug}/#${id} brings ${heading} into view: ${JSON.stringify(shown)}`);
				checked += 1;
			}
		}
		assert.equal(checked, 13);
	});
});
