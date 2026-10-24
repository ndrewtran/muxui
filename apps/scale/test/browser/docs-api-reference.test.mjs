// Browser proof for how the typed API reference of the built docs opens and prints. Run after `pnpm --filter @muxui/docs build`.
//
// Most parts and types of a long component page are closed when it loads. A link has to open what it names (including a saved link
// to a heading the earlier layout had, and a link to the fragment the page is already at), and printing has to show all of it.
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
const disclosures = 'details.api-part, details.api-type-entry';

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

test('a link to the part that is already the page\'s fragment opens it again after it was closed', async () => {
	await withSite(async ({ origin, newPage }) => {
		const page = await newPage();
		/** The details element once it is open, which a hashchange does a moment after the click that causes it. */
		const opens = (selector, message) => page.waitForFunction((query) => document.querySelector(query).open, selector, { timeout: 3000 }).then(() => undefined, () => assert.fail(message));
		await page.goto(`${origin}/components/command-palette/`);
		const link = page.locator('[data-api-parts] a', { hasText: /^CommandPalette\.Input$/u });
		const input = 'details.api-part[data-api-part="CommandPalette.Input"]';
		const part = page.locator(input);
		assert.equal(await part.evaluate((node) => node.open), false, 'Input is closed when the page loads');
		await link.click();
		await opens(input, 'following the link opens Input');
		const hash = await page.evaluate(() => window.location.hash);
		await part.locator('summary').click();
		assert.equal(await part.evaluate((node) => node.open), false, 'Input collapses');
		await link.click();
		assert.equal(await page.evaluate(() => window.location.hash), hash, 'the hash is the same, so no hashchange fires');
		await opens(input, 'following the same link again opens Input again');
		// A link to a type opens the declaration in the same way, whether or not the hash changes.
		await page.goto(`${origin}/components/button/`);
		const typeLink = page.locator('#api-reference td.api-type a[href^="#type-"]').first();
		const target = await typeLink.getAttribute('href');
		const typeSelector = `details.api-type-entry[id="${target.slice(1)}"]`;
		assert.equal(await page.locator(typeSelector).evaluate((node) => node.open), false, `${target} is closed when the page loads`);
		await typeLink.click();
		await opens(typeSelector, `${target} opens`);
		await page.locator(typeSelector).locator('summary').click();
		assert.equal(await page.locator(typeSelector).evaluate((node) => node.open), false, `${target} collapses`);
		await typeLink.click();
		await opens(typeSelector, `${target} opens again`);
	});
});

test('printing shows every part and type, and puts back the ones it opened', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const route of ['/components/command-palette/', '/package-exports/']) {
			const page = await newPage();
			await page.goto(`${origin}${route}`);
			const tableRows = '#api-reference tr.api-row';
			// The reader has opened one disclosure of their own, which must stay as they left it.
			await page.locator(disclosures).last().locator('summary').click();
			const before = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((node) => node.open), disclosures);
			assert.ok(before.includes(false) && before.includes(true), `${route} starts with some disclosures closed and one open`);
			const rowsAtScreen = await page.evaluate((selector) => [...document.querySelectorAll(selector)].filter((row) => row.checkVisibility()).length, tableRows);
			// The recorder listens after the page's own handlers, so it sees what printing leaves open.
			await page.evaluate(({ closed, rows }) => {
				const measure = () => ({
					closed: document.querySelectorAll(closed).length,
					rows: [...document.querySelectorAll(rows)].filter((row) => row.checkVisibility()).length,
					declarations: [...document.querySelectorAll('pre.api-declaration')].filter((pre) => pre.checkVisibility()).length,
				});
				window.printLog = [];
				window.addEventListener('beforeprint', () => window.printLog.push(['beforeprint', measure()]));
				window.addEventListener('afterprint', () => window.printLog.push(['afterprint', measure()]));
			}, { closed: 'details.api-part:not([open]), details.api-type-entry:not([open])', rows: tableRows });
			// The browser's own print path (a PDF of the page) dispatches beforeprint and afterprint.
			await page.pdf({ format: 'A4' });
			const [[, during], [, after]] = await page.evaluate(() => window.printLog);
			const totals = await page.evaluate(({ rows }) => ({ rows: document.querySelectorAll(rows).length, declarations: document.querySelectorAll('pre.api-declaration').length }), { rows: tableRows });
			assert.equal(during.closed, 0, `${route} prints with every disclosure open`);
			assert.equal(during.rows, totals.rows, `${route} prints all ${totals.rows} rows (the page shows ${rowsAtScreen} of them)`);
			assert.equal(during.declarations, totals.declarations, `${route} prints all ${totals.declarations} type declarations`);
			assert.deepEqual(await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((node) => node.open), disclosures), before, `${route} puts back what printing opened and keeps what the reader opened`);
			assert.equal(after.closed, before.filter((open) => !open).length, `${route} is closed again after printing`);
			if (route === '/components/command-palette/') assert.ok(rowsAtScreen < totals.rows, 'the page hides most rows until they are opened, so printing has something to open');
		}
	});
});

test('where the browser can show a closed details element\'s content, a printed page needs no script to show every row', async () => {
	await withSite(async ({ origin, newPage }) => {
		const page = await newPage();
		await page.goto(`${origin}/components/command-palette/`);
		if (!await page.evaluate(() => CSS.supports('selector(::details-content)'))) return;
		const visibleRows = () => page.evaluate(() => ({
			shown: [...document.querySelectorAll('#api-reference tr.api-row')].filter((row) => row.checkVisibility()).length,
			total: document.querySelectorAll('#api-reference tr.api-row').length,
			open: document.querySelectorAll('details.api-part[open]').length,
		}));
		const screen = await visibleRows();
		assert.ok(screen.shown < screen.total, 'on screen most rows are hidden');
		await page.emulateMedia({ media: 'print' });
		const print = await visibleRows();
		assert.equal(print.shown, print.total, 'in print every row is shown');
		assert.equal(print.open, screen.open, 'without opening anything: no script ran');
	});
});

test('every row of a table fills the table\'s columns at 1920, 1280 and 390 px, so a closing row\'s state sits under Required', async () => {
	await withSite(async ({ origin, newPage }) => {
		// DataDiff has no alternatives (five columns), Virtualizer has (six), SwitchField's root has no closing row.
		for (const [slug, heading] of [['data-diff', 'DataDiff'], ['virtualizer', 'Virtualizer'], ['switch-field', 'SwitchField.Root']]) {
			for (const width of [1920, 1280, 390]) {
				const page = await newPage({ width, height: 1080 });
				await page.goto(`${origin}/components/${slug}/`);
				const layout = await page.evaluate((name) => {
					const part = document.querySelector(`details.api-part[data-api-part="${name}"]`);
					const table = part.querySelector('table.api-table');
					const box = (node) => node.getBoundingClientRect();
					const required = [...table.querySelectorAll('thead th')].find((th) => th.textContent.trim() === 'Required');
					const section = document.querySelector('#api-reference');
					const rows = [...table.querySelectorAll('tbody tr')].map((row) => {
						const cells = [...row.children].filter((cell) => getComputedStyle(cell).display !== 'none');
						const state = row.querySelector('td.api-state');
						return {
							what: row.classList.contains('api-group-row') ? 'group header' : row.classList.contains('api-closing') ? 'closing row' : `row ${row.querySelector('.api-name')?.textContent}`,
							rightmost: Math.max(...cells.map((cell) => box(cell).right)),
							rowRight: box(row).right,
							state: state === null ? null : { left: box(state).left, right: box(state).right },
						};
					});
					return {
						display: getComputedStyle(table).display,
						columns: [...table.querySelectorAll('thead th')].length,
						required: { left: box(required).left, right: box(required).right },
						tableRight: box(table).right,
						rows,
						sectionOverflow: section.scrollWidth - section.clientWidth,
					};
				}, heading);
				const where = `${slug} at ${width}px`;
				assert.ok(layout.sectionOverflow <= 0, `${where}: the API reference does not scroll sideways`);
				for (const row of layout.rows) {
					assert.ok(row.rightmost <= row.rowRight + 1, `${where}: a ${row.what} has no cell past its own edge (${row.rightmost} > ${row.rowRight})`);
					if (layout.display !== 'table') continue;
					// The real table: no row is wider than the table, and every state cell is the Required column.
					assert.ok(row.rightmost <= layout.tableRight + 1, `${where}: a ${row.what} makes no column of its own`);
					if (row.state !== null) assert.ok(Math.abs(row.state.left - layout.required.left) <= 1 && Math.abs(row.state.right - layout.required.right) <= 1, `${where}: the state of a ${row.what} is under Required (${JSON.stringify(row.state)} against ${JSON.stringify(layout.required)})`);
				}
				if (width === 1920) assert.equal(layout.display, 'table', `${where}: the wide layout is a real table`);
				assert.equal(layout.columns, slug === 'virtualizer' ? 6 : 5, `${where}: the table has the columns of a part ${slug === 'virtualizer' ? 'with' : 'without'} alternatives`);
			}
		}
	});
});
