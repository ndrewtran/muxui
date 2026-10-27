// Browser proof for the Styling section of the built docs. Run after `pnpm --filter @muxui/docs build`.
//
// The docs check proves what the section says against its sources. This proves how it behaves for a reader: the headings and the legacy
// fragment, the tables' header associations, keyboard focus on the collapsed groups and on the scrollers, a 360 px layout without page
// overflow, print with every closed group showing, the contrast of the quiet text in both schemes, and the previews measured in the
// browser (a value pair where the table promises one, an honest label where it cannot), the headings of the examples kept out of the page's
// outline, the state rows read once a preview shows the state, the contrast of everything the previews paint, the measurement whichever of the shared script and
// the previews comes last, and a page that does not move when the previews render (every family reserves the height of its example; the
// worst of them are loaded with their scripts delayed).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createReadStream, readFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { chromeExecutable } from './chrome.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// One page for each risk the section has: a plain component, a shared field, a portal, a provider with no element, a textless root, the long
// collapsed groups and the long principal group.
const sample = ['button', 'text-field', 'date-picker', 'alert-dialog', 'separator', 'code-block', 'data-diff', 'text', 'tag-group'];

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
	await access(join(docsRoot, 'components/button/index.html'));
	const server = staticDocsServer();
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
	const errors = [];
	const newPage = async ({ width = 1280, height = 900, colorScheme = 'dark' } = {}) => {
		const page = await (await browser.newContext({ viewport: { width, height }, colorScheme })).newPage();
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

/** Waits until the previews have hydrated and the computed table holds a measurement in every cell the page can measure. */
async function measured(page) {
	await page.waitForFunction(() => {
		const cells = [...document.querySelectorAll('#styling [data-styling-table="computed"] td[data-measure="before"], #styling [data-styling-table="computed"] td[data-measure="after"]')];
		return cells.length > 0 && cells.every((cell) => cell.textContent !== 'Not measured yet.');
	}, undefined, { timeout: 15000 });
}

/** The rows of the computed-change table: the declaration each prints, and the text of the cells a reader sees (a hidden cell is not one). */
const computedRows = (page) => page.evaluate(() => [...document.querySelectorAll('#styling [data-styling-table="computed"] tbody > tr')].map((row) => ({
	property: row.dataset.stepProperty,
	target: row.dataset.stepTarget,
	scope: row.dataset.stepScope,
	kind: row.dataset.stepKind,
	text: row.dataset.stepText,
	declaration: row.querySelectorAll('th code')[1].textContent,
	cells: [...row.querySelectorAll('td')].filter((cell) => !cell.hidden).map((cell) => cell.textContent),
})));

/** What a recipe declaration (`--role: #7e62c9`, `letter-spacing: 0.04em`) computes to, where a browser reports it as the same value or as rgb(); null where it does not. */
function computedOf(declaration) {
	const value = declaration.slice(declaration.indexOf(':') + 1).trim();
	const hex = /^#([0-9a-f]{6})$/iu.exec(value)?.[1];
	if (hex !== undefined) return `rgb(${[0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
	return /^\d+(\.\d+)?px$/u.test(value) ? value : null;
}

/** The families whose page has previews, and the heights their previews reserve. */
const reserved = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../docs/src/lib/preview-heights.json'), 'utf8'));

/** Runs `work` over `items`, a few at a time: the work is waiting for pages. */
async function pool(items, size, work) {
	const queue = [...items];
	await Promise.all(Array.from({ length: size }, async () => {
		for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item);
	}));
}

test('the Styling section has one heading structure, and the earlier fragment reaches it', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const slug of sample) {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			const structure = await page.evaluate(() => {
				const section = document.getElementById('styling');
				const headings = [...section.querySelectorAll('h2, h3, h4, h5, h6')].filter((node) => node.closest('.styling-frame') === null).map((node) => [Number(node.tagName.slice(1)), node.id, node.textContent.trim()]);
				return { section: section.tagName, headings, aliases: [...document.querySelectorAll('[id="anatomy-and-styling"]')].map((node) => ({ tag: node.tagName, inH2: node.parentElement?.tagName === 'H2' && node.parentElement.parentElement === section, text: node.textContent, tabindex: node.getAttribute('tabindex'), href: node.getAttribute('href') })) };
			});
			assert.equal(structure.section, 'SECTION', slug);
			assert.deepEqual(structure.headings[0].filter((_, index) => index !== 1), [2, 'Styling'], `${slug} section opens with its h2`);
			const ids = structure.headings.slice(1).map(([, id]) => id);
			assert.equal(new Set(ids).size, ids.length, `${slug} heading ids are unique`);
			assert.ok(ids.every((id) => id.startsWith('styling-')), `${slug} headings are named styling-*`);
			// Levels never skip: an h4 follows an h3 and an h3 an h2.
			let previous = 1;
			for (const [level, id] of structure.headings) {
				assert.ok(level <= previous + 1, `${slug} ${id || 'h2'} is an h${level} after an h${previous}`);
				previous = level;
			}
			assert.deepEqual(structure.headings.filter(([level]) => level === 3).map(([, id]) => id), ['styling-hooks', 'styling-tokens', 'styling-override-rules', 'styling-recipe'], slug);
			assert.deepEqual(structure.aliases.length, 1, `${slug} has one #anatomy-and-styling`);
			assert.deepEqual(structure.aliases[0], { tag: 'A', inH2: true, text: '', tabindex: null, href: null }, `${slug} the alias is an empty anchor with no href, inside the Styling heading`);
		}
		// Both fragments bring the same heading into view, and the alias takes no focus.
		for (const fragment of ['styling', 'anatomy-and-styling']) {
			const page = await newPage();
			await page.goto(`${origin}/components/button/#${fragment}`);
			await page.waitForFunction(() => window.scrollY > 100);
			const shown = await page.evaluate(() => {
				const { top, bottom } = document.querySelector('#styling > h2').getBoundingClientRect();
				return { top, bottom, viewport: innerHeight };
			});
			assert.ok(shown.top >= 0 && shown.bottom <= shown.viewport, `#${fragment} brings the Styling heading into view: ${JSON.stringify(shown)}`);
			const focusable = await page.evaluate(() => { const alias = document.getElementById('anatomy-and-styling'); alias.focus(); return document.activeElement === alias; });
			assert.equal(focusable, false, 'the alias takes no focus');
		}
		// The outline lists the section and its four blocks.
		const page = await newPage();
		await page.goto(`${origin}/components/tag-group/`);
		const outline = await page.evaluate(() => [...document.querySelectorAll('starlight-toc a')].map((link) => link.getAttribute('href')).filter((href) => href.startsWith('#styling')));
		assert.deepEqual([...new Set(outline)], ['#styling', '#styling-hooks', '#styling-tokens', '#styling-override-rules', '#styling-recipe']);
	});
});

test('every table has a caption, column headers and row headers, and a closed group is a details element around a whole table', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const slug of sample) {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			const problems = await page.evaluate(() => {
				const out = [];
				for (const table of document.querySelectorAll('#styling table')) {
					const name = table.dataset.stylingTable;
					const caption = table.querySelector(':scope > caption');
					if (caption === null || caption.textContent.trim() === '') out.push(`${name} has no caption`);
					const columns = [...table.querySelectorAll(':scope > thead > tr > th')];
					if (columns.length === 0 || columns.some((th) => th.getAttribute('scope') !== 'col')) out.push(`${name} column headers are not scope=col`);
					const body = [...table.querySelectorAll(':scope > tbody')];
					if (body.length === 0) out.push(`${name} has no tbody`);
					for (const row of table.querySelectorAll(':scope > tbody > tr')) {
						const [first, ...rest] = row.children;
						const rowgroup = first.tagName === 'TH' && first.getAttribute('scope') === 'rowgroup';
						const header = first.tagName === 'TH' && first.getAttribute('scope') === 'row';
						if (!rowgroup && !header) out.push(`${name} row "${row.textContent.trim().slice(0, 30)}" has no row header`);
						if (rest.some((cell) => cell.tagName === 'TH')) out.push(`${name} row "${first.textContent.trim().slice(0, 30)}" has a second header cell`);
						const span = [...row.children].filter((cell) => !cell.hidden).reduce((total, cell) => total + Number(cell.getAttribute('colspan') ?? 1), 0);
						if (span !== columns.length) out.push(`${name} row "${first.textContent.trim().slice(0, 30)}" fills ${span} of ${columns.length} columns`);
					}
					// A table is never inside a table row group's details: a details element wraps a whole table, never rows.
					if (table.closest('tbody, thead, tr, td') !== null) out.push(`${name} is nested in a table`);
				}
				for (const details of document.querySelectorAll('#styling details')) {
					if (details.querySelector(':scope > summary > h4') === null) out.push('a group disclosure has no heading in its summary');
					if (details.querySelectorAll(':scope > .styling-scroll > table').length !== 1) out.push('a group disclosure does not hold exactly one table');
				}
				return out;
			});
			assert.deepEqual(problems, [], slug);
		}
		// Only the three long secondary groups are closed; the principal group of TagGroup is a plain, open table.
		const closed = {};
		for (const slug of sample) {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			closed[slug] = await page.evaluate(() => [...document.querySelectorAll('#styling details.styling-group')].map((node) => [node.dataset.stylingGroup, node.open, node.querySelectorAll('tbody tr').length]));
		}
		assert.deepEqual(closed, {
			button: [], 'text-field': [], 'date-picker': [], 'alert-dialog': [], separator: [], 'tag-group': [],
			'code-block': [['semantic', false, 30]], 'data-diff': [['semantic', false, 25]], text: [['semantic', false, 50]],
		});
		const page = await newPage();
		await page.goto(`${origin}/components/tag-group/`);
		assert.equal(await page.evaluate(() => document.querySelectorAll('#styling [data-styling-group="component"] tbody tr').length), 155);
	});
});

test('a group opens with Enter and Space, shows its focus ring, and opens for the fragment that names it', async () => {
	await withSite(async ({ origin, newPage }) => {
		const page = await newPage();
		await page.goto(`${origin}/components/code-block/`);
		const details = page.locator('#styling details.styling-group');
		const summary = details.locator('> summary');
		// The sequential focus starting point is the Tokens heading: the next stop is the closed group's summary.
		await page.locator('#styling-tokens').click();
		await page.keyboard.press('Tab');
		assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#styling details.styling-group > summary')), true, 'Tab reaches the summary');
		const ring = await summary.evaluate((node) => { const style = getComputedStyle(node); return { style: style.outlineStyle, width: style.outlineWidth, matches: node.matches(':focus-visible') }; });
		assert.deepEqual(ring, { style: 'solid', width: '2px', matches: true }, 'the summary shows a focus ring for keyboard focus');
		assert.equal(await details.evaluate((node) => node.open), false);
		await page.keyboard.press('Enter');
		assert.equal(await details.evaluate((node) => node.open), true, 'Enter opens it');
		await page.keyboard.press('Space');
		assert.equal(await details.evaluate((node) => node.open), false, 'Space closes it');
		await page.keyboard.press('Space');
		assert.equal(await details.evaluate((node) => node.open), true, 'Space opens it');
		// A fragment that names the group's heading opens it, a second time too.
		const fresh = await newPage();
		await fresh.goto(`${origin}/components/code-block/#styling-tokens-semantic`);
		await fresh.waitForFunction(() => document.querySelector('#styling details.styling-group').open);
		const shown = await fresh.evaluate(() => { const { top, bottom } = document.getElementById('styling-tokens-semantic').getBoundingClientRect(); return top >= 0 && bottom <= innerHeight; });
		assert.equal(shown, true, 'the heading of the group is in view');
		await fresh.locator('#styling details.styling-group > summary').click();
		assert.equal(await fresh.evaluate(() => document.querySelector('#styling details.styling-group').open), false, 'a click closes it');
		await fresh.evaluate(() => { location.hash = ''; location.hash = '#styling-tokens-semantic'; });
		await fresh.waitForFunction(() => document.querySelector('#styling details.styling-group').open);
	});
});

test('at 360 px the section does not overflow the page, and a scroller is named and reachable only where it scrolls', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const slug of sample) {
			for (const [width, narrow] of [[360, true], [1280, false]]) {
				const page = await newPage({ width, height: 800 });
				await page.goto(`${origin}/components/${slug}/`);
				await page.waitForLoadState('networkidle');
				const layout = await page.evaluate(() => ({
					// The section alone: a live example elsewhere on a page (the DataDiff table) can be wider than 360 px on main too.
					overflow: Math.max(document.getElementById('styling').scrollWidth - document.getElementById('styling').clientWidth, document.getElementById('styling').getBoundingClientRect().right - document.documentElement.clientWidth, 0),
					regions: [...document.querySelectorAll('#styling [data-styling-scroll]')].map((node) => ({
						scrolls: node.scrollWidth > node.clientWidth + 1,
						role: node.getAttribute('role'),
						label: node.getAttribute('aria-label'),
						tabindex: node.getAttribute('tabindex'),
					})),
				}));
				assert.equal(layout.overflow, 0, `${slug} at ${width}px: nothing in the Styling section reaches past the page`);
				for (const region of layout.regions) {
					if (region.scrolls) {
						assert.equal(region.role, 'region', `${slug} ${width}px: a scroller is a region`);
						assert.match(region.label, /\S \(scrollable\)$/u, `${slug} ${width}px: a scroller is named`);
						assert.equal(region.tabindex, '0', `${slug} ${width}px: a scroller is reachable from the keyboard`);
					} else {
						assert.deepEqual([region.role, region.label, region.tabindex], [null, null, null], `${slug} ${width}px: a region that fits adds no tab stop`);
					}
				}
				if (narrow) assert.ok(layout.regions.some(({ scrolls }) => scrolls), `${slug}: at 360 px the tables scroll in a region`);
			}
		}
		// A scroller takes keyboard focus and shows it.
		const page = await newPage({ width: 360, height: 800 });
		await page.goto(`${origin}/components/button/`);
		await page.locator('#styling-hooks').click();
		await page.keyboard.press('Tab');
		const focused = await page.evaluate(() => { const node = document.activeElement; const style = getComputedStyle(node); return { region: node.getAttribute('aria-label'), outline: style.outlineStyle, focusVisible: node.matches(':focus-visible') }; });
		assert.deepEqual(focused, { region: 'Button hooks (scrollable)', outline: 'solid', focusVisible: true });
	});
});

test('printing shows every row of every closed group, and the scrollers do not clip', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const slug of ['code-block', 'data-diff', 'text', 'tag-group']) {
			const page = await newPage({ width: 1000, height: 800 });
			await page.goto(`${origin}/components/${slug}/`);
			await page.emulateMedia({ media: 'print' });
			const hidden = await page.evaluate(() => [...document.querySelectorAll('#styling tbody tr')].filter((row) => !row.checkVisibility()).map((row) => row.textContent.trim().slice(0, 40)));
			assert.deepEqual(hidden, [], `${slug}: every row of every table is visible in print`);
			const closed = await page.evaluate(() => [...document.querySelectorAll('#styling details.styling-group')].map((node) => node.open));
			assert.ok(closed.every((open) => open === false), `${slug}: the groups were closed, and the print rule alone shows them`);
			const clipped = await page.evaluate(() => [...document.querySelectorAll('#styling .styling-scroll')].filter((node) => getComputedStyle(node).overflowX !== 'visible').length);
			assert.equal(clipped, 0, `${slug}: a scroller does not clip in print`);
		}
	});
});

test('the quiet text of the section has at least 4.5:1 contrast in light and dark', async () => {
	await withSite(async ({ origin, newPage }) => {
		const measure = (page) => page.evaluate(() => {
			const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
			const rgba = (css) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = '#000'; canvas.fillStyle = css; canvas.fillRect(0, 0, 1, 1); const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
			const luminance = ([r, g, b]) => 0.2126 * ((r / 255) <= 0.04045 ? r / 255 / 12.92 : (((r / 255) + 0.055) / 1.055) ** 2.4) + 0.7152 * ((g / 255) <= 0.04045 ? g / 255 / 12.92 : (((g / 255) + 0.055) / 1.055) ** 2.4) + 0.0722 * ((b / 255) <= 0.04045 ? b / 255 / 12.92 : (((b / 255) + 0.055) / 1.055) ** 2.4);
			const backdrop = (node) => { for (let current = node; current !== null; current = current.parentElement) { const [r, g, b, a] = rgba(getComputedStyle(current).backgroundColor); if (a > 0.99) return [r, g, b]; } return [255, 255, 255]; };
			const ratio = (node, color) => { const foreground = rgba(color); const background = backdrop(node); const [high, low] = [luminance(foreground), luminance(background)].sort((left, right) => right - left); return (high + 0.05) / (low + 0.05); };
			const targets = [
				['hint', '#styling .styling-hint'], ['sub line', '#styling .styling-sub'], ['caption', '#styling .styling-caption'], ['note', '#styling .styling-note'],
				['legend', '#styling .styling-legend li'], ['evidence', '#styling .styling-evidence'], ['not set row', '#styling .styling-not-set td'],
				['table head', '#styling .styling-table thead th'], ['alias', '#styling .styling-alias'], ['scheme', '#styling .styling-scheme'], ['cell', '#styling .styling-table td'],
				['row header', '#styling .styling-table th[scope="row"]'], ['policy fixed', '#styling .styling-fixed'],
			];
			const results = [];
			for (const [label, selector] of targets) {
				for (const node of [...document.querySelectorAll(selector)].slice(0, 3)) {
					if (node.closest('details:not([open])') !== null || node.getClientRects().length === 0) continue;
					results.push({ label, ratio: ratio(node, getComputedStyle(node).color), text: node.textContent.trim().slice(0, 30) });
				}
			}
			const mark = document.querySelector('#styling .styling-checks li');
			if (mark !== null) results.push({ label: 'pass mark', ratio: ratio(mark, getComputedStyle(mark, '::before').color), text: 'pass' });
			return results;
		});
		for (const colorScheme of ['dark', 'light']) {
			for (const slug of ['button', 'text-field', 'tag-group']) {
				const page = await newPage({ colorScheme });
				await page.goto(`${origin}/components/${slug}/`);
				const results = await measure(page);
				assert.ok(results.length >= 10, `${slug} ${colorScheme}: the text was found (${results.length})`);
				const low = results.filter(({ ratio }) => ratio < 4.5);
				assert.deepEqual(low, [], `${slug} ${colorScheme}: text under 4.5:1`);
			}
		}
	});
});

/** Waits until both previews have rendered their example (a client-only island is empty, then shows "Loading example"). */
const previewsRendered = (page) => page.waitForFunction(() => {
	const islands = [...document.querySelectorAll('#styling [data-styling-pane] astro-island')];
	return islands.length === 2 && islands.every((island) => island.firstElementChild !== null && island.querySelector('.example-loading') === null);
}, undefined, { timeout: 30000 });

test('the examples in the previews keep their headings out of the outline, once they have rendered', async () => {
	await withSite(async ({ origin, newPage }) => {
		for (const slug of ['text', 'button', 'tag-group']) {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			await measured(page);
			// Text's example is a page of headings: they are on screen in the frames, and must not be in the outline.
			const inFrames = await page.locator('#styling .styling-frame :is(h1, h2, h3, h4, h5, h6)').count();
			if (slug === 'text') assert.ok(inFrames >= 4, `Text's previews render their example headings (${inFrames})`);
			// The accessibility tree is what an outline reads: the headings of #styling in Chromium's own computation.
			const client = await page.context().newCDPSession(page);
			await client.send('DOM.enable');
			await client.send('Accessibility.enable');
			const { root } = await client.send('DOM.getDocument', { depth: 0 });
			const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#styling' });
			const { node } = await client.send('DOM.describeNode', { nodeId });
			const { nodes } = await client.send('Accessibility.queryAXTree', { backendNodeId: node.backendNodeId, role: 'heading' });
			const outline = nodes.filter(({ ignored }) => !ignored).map((entry) => [entry.properties.find(({ name }) => name === 'level').value.value, entry.name.value.trim()]);
			const own = await page.evaluate(() => [...document.querySelectorAll('#styling :is(h2, h3, h4, h5, h6)')].filter((heading) => heading.closest('.styling-frame') === null).map((heading) => [Number(heading.tagName.slice(1)), heading.textContent.trim()]));
			assert.deepEqual(outline, own, `${slug}: the outline of the section is the page's own headings`);
			let previous = 1;
			for (const [level, name] of outline) {
				assert.ok(level >= 2 && level <= previous + 1, `${slug}: "${name}" is an h${level} after an h${previous}`);
				previous = level;
			}
		}
	});
});

test('a step that needs a state is read once both previews show it, and says so again when one stops', async () => {
	await withSite(async ({ origin, newPage }) => {
		const page = await newPage({ colorScheme: 'light' });
		await page.goto(`${origin}/components/disclosure/`);
		await measured(page);
		const stateRow = async () => (await computedRows(page)).find((row) => row.scope === 'unavailable');
		const visibleCells = (count) => page.waitForFunction((wanted) => [...document.querySelector('#styling [data-step-scope="unavailable"]').querySelectorAll('td')].filter((cell) => !cell.hidden).length === wanted, count, { timeout: 10000 });
		const initial = await stateRow();
		assert.equal(initial.cells.length, 1, 'one cell over both columns while no preview shows the state');
		assert.match(initial.cells[0], /^needs the state/u);
		const trigger = (pane) => page.locator(`#styling [data-styling-pane="${pane}"] .muxui-disclosure__trigger`).first();
		// One preview open is not enough to compare, and the cell says which one has it.
		await trigger('default').click();
		await page.waitForFunction(() => /preview only/u.test(document.querySelector('#styling [data-step-scope="unavailable"] td').textContent), undefined, { timeout: 10000 });
		assert.match((await stateRow()).cells[0], /^the state is on in the Default preview only/u);
		await trigger('recipe').click();
		await visibleCells(2);
		const measuredRow = await stateRow();
		const declared = measuredRow.declaration.slice(measuredRow.declaration.indexOf(':') + 1).trim();
		assert.notEqual(measuredRow.cells[0], declared, 'the Default preview does not have the recipe value');
		assert.equal(measuredRow.cells[1], declared, 'the preview with the recipe has it');
		assert.equal(await page.locator('#styling [data-step-scope="unavailable"] td[hidden]').count(), 0, 'both cells are shown');
		await trigger('recipe').click();
		await visibleCells(1);
		assert.match((await stateRow()).cells[0], /^the state is on in the Default preview only/u, 'closing the state in the preview with the recipe says so');
	});
});

test('the previews are measured in the browser: every step the table claims changes a value, and a step it cannot show says so', async () => {
	await withSite(async ({ origin, newPage }) => {
		const families = ['button', 'text-field', 'date-picker', 'separator', 'tag-group', 'data-diff', 'code-block', 'text', 'icon-button', 'tabs', 'checkbox'];
		const withTokenStep = new Set();
		const withoutTokenStep = new Set();
		for (const colorScheme of ['light', 'dark']) {
			for (const slug of families) {
				const page = await newPage({ colorScheme });
				await page.goto(`${origin}/components/${slug}/`);
				await measured(page);
				const rows = await computedRows(page);
				const opening = await page.locator('#styling [data-styling-recipe-count]').textContent();
				assert.equal(Number(/(\d+) changes?:/u.exec(opening)?.[1]), rows.length, `${slug}: the opening sentence counts the rows of the table ("${opening}")`);
				// A family whose recipe has no token step says why, and shows no token row; one that has token steps shows only measured ones.
				const tokenSteps = rows.filter((row) => row.kind === 'token').length;
				const noTokenNotes = (await page.locator('#styling [data-styling-recipe-note]').allTextContents()).filter((note) => /^No token step/u.test(note.trim()));
				if (tokenSteps === 0) assert.ok(noTokenNotes.length > 0, `${slug}: a recipe with no token step says why`);
				(tokenSteps === 0 ? withoutTokenStep : withTokenStep).add(slug);
				const notMeasured = ['Not measured yet.', 'no matching element in the example'];
				for (const row of rows) {
					const label = `${slug} ${colorScheme} ${row.kind} ${row.property}`;
					if (row.scope === 'unavailable') {
						assert.equal(row.cells.length, 1, `${label}: one cell for a step the example cannot show`);
						assert.match(row.cells[0], /^needs the state/u, label);
						continue;
					}
					const [before, after] = row.cells;
					assert.ok(!notMeasured.includes(before) && !before.startsWith('not measured'), `${label}: measured, not "${before}"`);
					const value = after.replace(/ \(computed only: no text in the target\)$/u, '');
					assert.notEqual(value, 'unchanged', `${label}: the step changes the value`);
					assert.ok(!notMeasured.includes(value) && !value.startsWith('not measured'), `${label}: measured, not "${after}"`);
					assert.notEqual(value, before, `${label}: ${before} to ${value}`);
					// What the recipe declares is what the browser reports, where it reports it the same way (a hex color as rgb(), a length).
					const wanted = row.kind === 'token' ? computedOf(row.declaration) : null;
					if (wanted !== null) assert.equal(value, wanted, `${label}: the recipe declares ${row.declaration}`);
					assert.equal(after.endsWith('(computed only: no text in the target)'), row.text === 'no-text', `${label}: a target with no text says the change is computed only`);
				}
				// The example of the preview with the recipe is inside the wrapper the recipe's rules name; the Default one is outside it.
				const scoped = await page.evaluate(() => ({
					recipe: document.querySelectorAll('#styling [data-styling-pane="recipe"] .my-scope astro-island').length,
					default: document.querySelectorAll('#styling [data-styling-pane="default"] .my-scope, #styling [data-styling-pane="default"] astro-island').length === 1 && document.querySelectorAll('#styling [data-styling-pane="default"] .my-scope').length === 0,
					wrappers: document.querySelectorAll('.my-scope').length,
				}));
				assert.deepEqual(scoped, { recipe: 1, default: true, wrappers: 1 }, `${slug}: the my-scope wrapper holds the example of the preview with the recipe, and only that`);
			}
		}

		// AlertDialog is a provider with no element: no previews, no table.
		const dialog = await newPage();
		await dialog.goto(`${origin}/components/alert-dialog/`);
		assert.equal(await dialog.locator('#styling [data-styling-pane]').count(), 0);
		assert.equal(await dialog.locator('#styling [data-styling-table="computed"]').count(), 0);

		assert.ok(withTokenStep.size > 0 && withoutTokenStep.size > 0, `the sample has families with a token step (${[...withTokenStep]}) and without one (${[...withoutTokenStep]})`);
		// TextField and Tabs paint text on the page, which no fixed color reads on both schemes: their recipes drop the token step and say so.
		for (const slug of ['text-field', 'tabs']) {
			assert.ok(withoutTokenStep.has(slug), `${slug} has no token step`);
			const page = await newPage({ colorScheme: 'light' });
			await page.goto(`${origin}/components/${slug}/`);
			const notes = await page.locator('#styling [data-styling-recipe-note]').allTextContents();
			assert.ok(notes.some((note) => note.startsWith(`No token step for --muxui-component-${slug.replace('-', '')}-`) && /4\.5:1/u.test(note)), `${slug} says why: ${JSON.stringify(notes)}`);
			assert.equal(await page.locator('#styling [data-step-kind="token"]').count(), 0, `${slug} shows no token row`);
		}

		// The cell tells the truth when an element goes missing, and the theme changes the value that is read: on IconButton, whose recipe
		// paints a surface (its Basic example is a primary button) in the Default preview and in the preview with the recipe.
		const page = await newPage({ colorScheme: 'light' });
		await page.goto(`${origin}/components/icon-button/`);
		await measured(page);
		const surface = (await computedRows(page)).find((row) => row.kind === 'token' && row.property === 'background-color');
		assert.ok(surface !== undefined, 'IconButton has a token step that paints its background');
		const surfaceRow = async () => (await computedRows(page)).find((row) => row.kind === 'token' && row.property === 'background-color' && row.target === surface.target);
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.waitForFunction(([target, previous]) => {
			const row = [...document.querySelectorAll('#styling [data-styling-table="computed"] tbody > tr')].find((candidate) => candidate.dataset.stepKind === 'token' && candidate.dataset.stepProperty === 'background-color' && candidate.dataset.stepTarget === target);
			return row.querySelector('td[data-measure="before"]').textContent !== previous;
		}, [surface.target, surface.cells[0]], { timeout: 10000 });
		assert.equal((await surfaceRow()).cells[1].replace(/ \(computed only: no text in the target\)$/u, ''), computedOf(surface.declaration), 'the recipe color is the same in both schemes');
		await page.evaluate((target) => { for (const node of document.querySelectorAll(`#styling [data-styling-pane="default"] ${target}`)) node.remove(); }, surface.target);
		await page.waitForFunction(() => [...document.querySelectorAll('#styling [data-styling-table="computed"] td[data-measure]')].some((cell) => cell.textContent === 'no matching element in the example'), undefined, { timeout: 10000 });
		assert.deepEqual((await surfaceRow()).cells, ['no matching element in the example', 'no matching element in the example']);
	});
});

test('every family reserves the height of its example: a preview does not grow when it renders', async () => {
	await withSite(async ({ origin, newPage }) => {
		const grown = [];
		await pool(Object.keys(reserved), 6, async (slug) => {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			await previewsRendered(page);
			for (const width of [360, 768, 1280]) {
				await page.setViewportSize({ width, height: 900 });
				await page.waitForTimeout(250);
				const frames = await page.evaluate(() => [...document.querySelectorAll('#styling .styling-frame')].map((frame) => ({ height: frame.getBoundingClientRect().height, reserved: Number.parseFloat(getComputedStyle(frame).minHeight) })));
				for (const frame of frames) if (frame.height > frame.reserved + 0.5) grown.push(`${slug} at ${width}px: the frame is ${frame.height}px, it reserves ${frame.reserved}px`);
			}
			await page.context().close();
		});
		assert.deepEqual(grown, [], 'record-preview-heights.mjs records the heights again when an example changes');
	});
});

test('a family reserves the intrinsic height of its example plus the fixed margin, not the height of its own reservation', async () => {
	await withSite(async ({ origin, newPage }) => {
		// The widths record-preview-heights.mjs looks at. Measured here with the reservation taken off (the demo frame stretches to fill it, so a frame
		// measured with its reservation reads the reservation back), independently of the recorder, against what the page prints.
		const widths = [320, 360, 390, 430, 600, 768, 900, 1024, 1180, 1280, 1440, 1700, 1920];
		const margin = 2;
		const off = [];
		await pool(Object.keys(reserved), 6, async (slug) => {
			const page = await newPage();
			await page.goto(`${origin}/components/${slug}/`);
			await previewsRendered(page);
			const printed = await page.evaluate(() => {
				const style = document.querySelector('#styling [data-styling-compare]').style;
				return { narrow: Number.parseFloat(style.getPropertyValue('--preview-h-narrow')), wide: Number.parseFloat(style.getPropertyValue('--preview-h-wide')) };
			});
			await page.addStyleTag({ content: '.styling-frame { min-height: 0 !important; }' });
			const intrinsic = { narrow: 0, wide: 0 };
			for (const width of widths) {
				await page.setViewportSize({ width, height: 900 });
				// Where the example settles (a spring overshoots, which the margin is for): the same height twice running, 100ms apart.
				let last = null;
				let seen;
				for (let look = 0; look < 30; look += 1) {
					await page.waitForTimeout(100);
					seen = await page.evaluate(() => ({
						columns: getComputedStyle(document.querySelector('#styling [data-styling-compare]')).gridTemplateColumns.split(' ').length,
						height: Math.max(...[...document.querySelectorAll('#styling [data-styling-pane] .demo-frame')].map((frame) => frame.getBoundingClientRect().height)),
					}));
					if (last !== null && Math.abs(seen.height - last) < 0.5) break;
					last = seen.height;
				}
				const key = seen.columns > 1 ? 'wide' : 'narrow';
				intrinsic[key] = Math.max(intrinsic[key], Math.ceil(seen.height));
			}
			const wanted = { narrow: intrinsic.narrow + margin, wide: (intrinsic.wide === 0 ? intrinsic.narrow : intrinsic.wide) + margin };
			for (const key of ['narrow', 'wide']) if (Math.abs(printed[key] - wanted[key]) > 1) off.push(`${slug} ${key}: reserves ${printed[key]}px, the example needs ${wanted[key] - margin}px (+${margin}px)`);
			assert.deepEqual(printed, reserved[slug], `${slug}: the page prints the recorded heights`);
			await page.context().close();
		});
		assert.deepEqual(off, [], 'a reservation that is not the example\'s own height plus the margin within 1px');
	});
});

test('recording the preview heights again gives the committed file', { timeout: 300_000 }, () => {
	// A sample that has the tall, the wrapping (Text at 320px), the short and the two-column families; the page already reserves its heights, which is what
	// a re-recording measures: it has to read the example and not its own reservation, or each recording would grow the file.
	const sample = ['text', 'calendar', 'sidebar', 'disclosure-group', 'activity', 'button', 'tag-group', 'separator'];
	const run = spawnSync(process.execPath, [resolve(import.meta.dirname, 'record-preview-heights.mjs'), '--check', sample.join(',')], { encoding: 'utf8', timeout: 280_000 });
	assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
	assert.match(run.stdout, /gives the committed heights for 8 pages/u);
});

test('the page does not move when the previews render, even when its scripts come late', async () => {
	await withSite(async ({ origin, newPage }) => {
		// The tallest examples, and the two a review measured moving the page most before the heights were reserved.
		const tallest = Object.entries(reserved).sort(([, left], [, right]) => right.narrow - left.narrow).slice(0, 4).map(([slug]) => slug);
		const moved = [];
		for (const slug of new Set([...tallest, 'calendar', 'code-block'])) {
			for (const width of [360, 1280]) {
				const page = await newPage({ width, height: 800, colorScheme: 'light' });
				await page.route('**/*.js', async (route) => {
					await new Promise((done) => setTimeout(done, 1800));
					await route.continue();
				});
				await page.addInitScript(() => {
					window.__shift = 0;
					new PerformanceObserver((list) => {
						for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
					}).observe({ type: 'layout-shift', buffered: true });
				});
				// Open on the previews, so that they are on screen when they render.
				await page.goto(`${origin}/components/${slug}/#styling-pane-default`);
				await measured(page);
				await page.waitForTimeout(300);
				const shift = await page.evaluate(() => window.__shift);
				if (shift >= 0.1) moved.push(`${slug} at ${width}px: ${shift.toFixed(3)}`);
				await page.context().close();
			}
		}
		assert.deepEqual(moved, [], 'a shift of 0.1 or more');
	});
});

test('the measurement waits for whichever comes last, the shared script or the previews, and a page without the script says "Not measured yet."', async () => {
	await withSite(async ({ origin, newPage }) => {
		const delayed = async (pattern, milliseconds) => {
			const page = await newPage({ colorScheme: 'light' });
			await page.route(pattern, async (route) => {
				await new Promise((done) => setTimeout(done, milliseconds));
				await route.continue();
			});
			return page;
		};
		const values = (page) => computedRows(page).then((rows) => rows.filter((row) => row.scope !== 'unavailable').map((row) => row.cells));
		// The script arrives after the previews rendered, then before them.
		for (const pattern of ['**/_muxui/styling-measure.*.js', '**/_astro/*.js']) {
			const page = await delayed(pattern, 2500);
			await page.goto(`${origin}/components/button/`);
			await measured(page);
			const rows = await values(page);
			assert.ok(rows.length > 0 && rows.every(([before, after]) => before !== 'Not measured yet.' && after !== 'Not measured yet.'), `${pattern}: every step is measured`);
			assert.ok(rows.some(([, after]) => after !== 'unchanged'), `${pattern}: a step changed`);
		}
		// Without the script nothing is measured, and nothing else claims a measurement.
		const bare = await newPage({ colorScheme: 'light' });
		await bare.route('**/_muxui/styling-measure.*.js', (route) => route.abort());
		await bare.goto(`${origin}/components/button/`);
		await bare.waitForFunction(() => [...document.querySelectorAll('#styling [data-styling-pane] astro-island')].every((island) => island.firstElementChild !== null && island.querySelector('.example-loading') === null), undefined, { timeout: 15000 });
		await bare.waitForTimeout(500);
		const rows = await values(bare);
		assert.ok(rows.length > 0 && rows.every((cells) => cells.every((cell) => cell === 'Not measured yet.')), `without the script every cell reads "Not measured yet.": ${JSON.stringify(rows)}`);
	});
});

test('the recipe lowers nothing a preview paints under the contrast rule, in light and dark: 4.5:1 for normal text, 3:1 for large text, a glyph and a fill', async () => {
	await withSite(async ({ origin, newPage }) => {
		// Every element of the two previews of every family that has them, with the rule 4a's guard holds a recipe step to: text by its own
		// computed size and weight (4.5:1, or 3:1 from 24px or 18.66px bold), a glyph (an svg) and a fill that holds no text 3:1 against
		// what is behind them. The Default preview is what Mux paints without the recipe, so nothing is held to more than it had there:
		// an element that is already under the rule (Mux's own, not the recipe's) has to stay where it was.
		const worse = [];
		const painted = new Map();
		await pool(Object.keys(reserved), 6, async (slug) => {
			for (const colorScheme of ['light', 'dark']) {
				const page = await newPage({ colorScheme });
				await page.goto(`${origin}/components/${slug}/`);
				await measured(page);
				const found = await page.evaluate(() => {
					const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
					const rgba = (css) => { canvas.clearRect(0, 0, 1, 1); canvas.fillStyle = '#000'; canvas.fillStyle = css; canvas.fillRect(0, 0, 1, 1); const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
					const linear = (value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
					const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
					const over = ([fr, fg, fb, fa], [br, bg, bb]) => [fr * fa + br * (1 - fa), fg * fa + bg * (1 - fa), fb * fa + bb * (1 - fa)];
					// What is behind an element: every translucent background from it up to the first opaque one, laid over each other.
					const backdrop = (node) => {
						const layers = [];
						for (let current = node; current !== null; current = current.parentElement) {
							const layer = rgba(getComputedStyle(current).backgroundColor);
							if (layer[3] > 0) layers.push(layer);
							if (layer[3] >= 0.99) break;
						}
						return layers.reverse().reduce((below, layer) => over(layer, below), [255, 255, 255]);
					};
					const ratioOf = (foreground, surface) => { const [high, low] = [luminance(over(foreground, surface)), luminance(surface)].sort((left, right) => right - left); return (high + 0.05) / (low + 0.05); };
					const holdsText = (node) => [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '');
					/** What a pane paints, in document order: text, glyphs and fills with the contrast each has and the rule for it. */
					const measure = (pane) => [...document.querySelectorAll(`#styling [data-styling-pane="${pane}"] .styling-frame *`)].flatMap((node) => {
						const style = getComputedStyle(node);
						// An inactive control is exempt (WCAG 1.4.3, 1.4.11); an element without a box paints nothing.
						if (node.closest('[disabled], [aria-disabled="true"], [data-muxui-state-disabled]') !== null || style.visibility !== 'visible') return [];
						const box = node.getBoundingClientRect();
						if (box.width < 2 || box.height < 2 || ['script', 'style', 'template', 'astro-island'].includes(node.tagName.toLowerCase())) return [];
						const label = `${node.tagName.toLowerCase()}${typeof node.className === 'string' && node.className ? `.${node.className.split(' ')[0]}` : ''}`;
						if (holdsText(node)) {
							const size = Number.parseFloat(style.fontSize);
							const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
							return [{ label: `${label} "${node.textContent.trim().slice(0, 24)}"`, kind: 'text', ratio: ratioOf(rgba(style.color), backdrop(node)), required: large ? 3 : 4.5 }];
						}
						if (node instanceof SVGSVGElement) {
							// A glyph is what its shapes paint: every path, line, circle... with its fill and with its stroke, as the browser computes them (currentColor
							// resolved), at the opacity they are drawn with, in paint order. Each is read against what is behind it: the surface under the svg, and the
							// fills of earlier shapes of the same svg that cover its middle.
							const base = backdrop(node.parentElement);
							const filled = [];
							const opacityOf = (shape) => {
								let drawn = 1;
								for (let current = shape; current !== null; current = current.parentElement) {
									drawn *= Number(getComputedStyle(current).opacity);
									if (current === node) break;
								}
								return drawn;
							};
							return [...node.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse')].flatMap((shape, index) => {
								const painted = getComputedStyle(shape);
								if (painted.visibility !== 'visible' || painted.display === 'none') return [];
								const area = shape.getBoundingClientRect();
								const middle = [area.left + area.width / 2, area.top + area.height / 2];
								const behind = filled.filter(({ rect }) => middle[0] >= rect.left && middle[0] <= rect.right && middle[1] >= rect.top && middle[1] <= rect.bottom).reduce((under, { color }) => over(color, under), base);
								return [['fill', 'fill-opacity'], ['stroke', 'stroke-opacity']].flatMap(([channel, opacity]) => {
									const paint = painted.getPropertyValue(channel);
									if (paint === 'none' || paint.startsWith('url(') || (channel === 'stroke' && !(Number.parseFloat(painted.strokeWidth) > 0))) return [];
									const ink = rgba(paint);
									ink[3] *= Number(painted.getPropertyValue(opacity)) * opacityOf(shape);
									if (!(ink[3] > 0)) return [];
									if (channel === 'fill') filled.push({ rect: area, color: ink });
									return [{ label: `${label} > ${shape.tagName.toLowerCase()}[${index}] (${channel})`, kind: 'glyph', ratio: ratioOf(ink, behind), required: 3 }];
								});
							});
						}
						const fill = rgba(style.backgroundColor);
						return fill[3] > 0 ? [{ label: `${label} (fill)`, kind: 'fill', ratio: ratioOf(fill, backdrop(node.parentElement)), required: 3 }] : [];
					}).concat([...document.querySelectorAll(`#styling [data-styling-pane="${pane}"] .styling-frame *`)].flatMap((node) => {
						// A box a pseudo-element paints (a Switch's track) is a fill too, drawn over the host's own background.
						if (node.closest('[disabled], [aria-disabled="true"], [data-muxui-state-disabled]') !== null) return [];
						return ['::before', '::after'].flatMap((pseudo) => {
							const style = getComputedStyle(node, pseudo);
							const fill = rgba(style.backgroundColor);
							if (['none', 'normal'].includes(style.content) || fill[3] === 0 || style.display === 'none' || !(Number.parseFloat(style.width) >= 2 && Number.parseFloat(style.height) >= 2)) return [];
							return [{ label: `${node.tagName.toLowerCase()}${typeof node.className === 'string' && node.className ? `.${node.className.split(' ')[0]}` : ''}${pseudo} (fill)`, kind: 'fill', ratio: ratioOf(fill, backdrop(node)), required: 3 }];
						});
					}));
					const plain = measure('default');
					const recipe = measure('recipe');
					return {
						count: recipe.length,
						same: plain.length === recipe.length && plain.every(({ label }, index) => label === recipe[index].label),
						// Nothing lowered under the rule, and nothing lowered at all where it was already under it.
						worse: recipe.flatMap((entry, index) => (plain[index] !== undefined && entry.ratio + 0.005 < Math.min(entry.required, plain[index].ratio) ? [`${entry.label} ${entry.ratio.toFixed(2)}:1, needs ${Math.min(entry.required, plain[index].ratio).toFixed(2)}:1 (${plain[index].ratio.toFixed(2)}:1 without the recipe)`] : [])),
					};
				});
				assert.ok(found.same, `${slug} ${colorScheme}: the two previews paint the same elements`);
				painted.set(slug, (painted.get(slug) ?? 0) + found.count);
				for (const entry of found.worse) worse.push(`${slug} ${colorScheme} ${entry}`);
				await page.context().close();
			}
		});
		// A part drawn only by a background image or a border (ColorModeToggle's icon) is not an element this reads; the selector must still find most.
		assert.ok([...painted.values()].filter((count) => count > 0).length >= Object.keys(reserved).length * 0.9, `most previews paint elements this reads: ${[...painted].filter(([, count]) => count === 0).map(([slug]) => slug)} paint none`);
		assert.deepEqual(worse, [], 'the recipe lowers what a preview paints under the contrast rule');
	});
});
