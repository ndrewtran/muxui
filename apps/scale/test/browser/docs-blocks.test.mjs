// Browser proof for the private Blocks section of the built docs site
// (E-BL1-05 behaviour, E-BL1-06 overflow). Run after `pnpm --filter @muxui/docs build`.
//
// MUXUI_BLOCKS_CAPTURE_DIR=<dir> also writes the E-BL1-06 captures and overflow
// report there. The test reads blocks from the built rail, so it covers any number
// of patterns and categories without naming one.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { chromeExecutable } from './chrome.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const captureDir = process.env.MUXUI_BLOCKS_CAPTURE_DIR;
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
// Page widths a marketing section meets on a real page, narrowest to widest. The toolbar presets are read from the page.
const PAGE_WIDTHS = [360, 768, 1024, 1280, 1920];
const THEMES = ['light', 'dark'];

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
	await access(join(docsRoot, 'blocks/index.html'));
	const server = staticDocsServer();
	await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
	const origin = `http://127.0.0.1:${server.address().port}`;
	const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await run({ page, origin, errors });
		assert.deepEqual(errors, [], 'the Blocks section raised no page errors');
	} finally {
		await browser.close();
		await new Promise((done) => server.close(done));
	}
}

/** Blocks and variants as the built rail lists them, with each block's derived group. */
async function railVariants(page) {
	return page.evaluate(() => [...document.querySelectorAll('[data-blocks-rail] li[data-block]')].flatMap((item) => {
		const group = item.closest('[data-group]')?.dataset.group;
		return [...item.querySelectorAll('a.blocks-variant')].map((link) => ({
			block: item.dataset.block,
			group,
			name: link.textContent.trim(),
			href: link.getAttribute('href'),
		}));
	}));
}

/** Waits until the preview document is loaded and its example island hydrated. */
async function previewReady(page) {
	await page.waitForFunction(() => {
		const doc = document.querySelector('[data-iframe]')?.contentDocument;
		return doc?.readyState === 'complete' && doc.querySelector('astro-island') !== null && doc.querySelector('astro-island[ssr]') === null;
	});
}

const previewDocument = (page) => page.locator('[data-iframe]').evaluate((frame) => frame.contentDocument.documentElement.dataset.theme);

test('the Blocks section: rail, filters, presets, handle, theme, views, and copy', { timeout: 180_000 }, async () => {
	await withSite(async ({ page, origin }) => {
		await page.goto(`${origin}/blocks/`);
		await page.locator('[data-blocks-gallery]').waitFor();
		const variants = await railVariants(page);
		assert.ok(variants.length > 0, 'the rail lists variants');
		const blocks = new Set(variants.map(({ block }) => block));
		assert.equal(await page.locator('[data-gallery-count]').textContent(), `${blocks.size} block${blocks.size === 1 ? '' : 's'}, ${variants.length} variant${variants.length === 1 ? '' : 's'}`);
		assert.equal(await page.locator('[data-blocks-gallery] li[data-block]').count(), blocks.size);
		await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

		// Every rail variant opens its block in place, without a document reload.
		await page.evaluate(() => { window.__sameDocument = true; });
		for (const variant of variants) {
			await page.locator(`.blocks-rail a.blocks-variant[href="${variant.href}"]`).click();
			await page.waitForURL(`**${variant.href}`);
			await page.locator('[data-blocks-detail] h1').waitFor();
			assert.equal(await page.locator('[data-blocks-detail] h1').textContent(), variant.name);
			assert.equal(await page.evaluate(() => window.__sameDocument), true, `${variant.href} swapped in place`);
			assert.deepEqual(await page.locator('.blocks-rail [aria-current="page"]').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), [variant.href]);
			assert.equal(await page.locator('[data-iframe]').getAttribute('src'), `${variant.href}preview/`);
			assert.notEqual((await page.locator('[data-iframe]').getAttribute('title')).trim(), '');
		}
		const [first, second = first] = variants;
		await page.locator(`.blocks-rail a.blocks-variant[href="${first.href}"]`).click();
		await page.waitForURL(`**${first.href}`);
		await previewReady(page);

		// Width presets set the preview's logical width; the readout and aria-pressed follow.
		const presets = await page.locator('[data-width-group] button[data-width]:not([data-width="full"])').evaluateAll((buttons) => buttons.map((button) => Number(button.dataset.width)));
		assert.deepEqual(presets, [360, 768, 1280]);
		const frameWidth = () => page.locator('[data-iframe]').evaluate((frame) => frame.contentWindow.innerWidth);
		for (const width of presets) {
			await page.locator(`[data-width-group] button[data-width="${width}"]`).click();
			assert.equal(await frameWidth(), width);
			assert.equal(await page.locator(`[data-width-group] button[data-width="${width}"]`).getAttribute('aria-pressed'), 'true');
			assert.match(await page.locator('[data-readout]').textContent(), new RegExp(`^${width} px`, 'u'));
		}
		await page.locator('[data-width-group] button[data-width="full"]').click();
		const available = await page.locator('[data-frame]').evaluate((frame) => frame.clientWidth - 24);
		assert.equal(await frameWidth(), available);

		// The handle resizes from the keyboard and by dragging, and exposes its value.
		const handle = page.getByRole('separator', { name: 'Resize preview' });
		await page.locator('[data-width-group] button[data-width="360"]').click();
		// A key press puts the page in keyboard modality, so programmatic focus matches :focus-visible.
		await page.keyboard.press('Shift');
		await handle.focus();
		assert.equal(await handle.evaluate((node) => getComputedStyle(node).outlineStyle), 'solid', 'the handle shows a visible focus ring');
		await page.keyboard.press('ArrowRight');
		assert.equal(await handle.getAttribute('aria-valuenow'), '376');
		await page.keyboard.press('Shift+ArrowRight');
		assert.equal(await handle.getAttribute('aria-valuenow'), '440');
		await page.keyboard.press('ArrowLeft');
		assert.equal(await handle.getAttribute('aria-valuenow'), '424');
		await page.keyboard.press('Home');
		assert.equal(await handle.getAttribute('aria-valuenow'), '280');
		await page.keyboard.press('End');
		assert.equal(await page.locator('[data-width-group] button[data-width="full"]').getAttribute('aria-pressed'), 'true');
		const box = await handle.boundingBox();
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x - 300, box.y + box.height / 2, { steps: 6 });
		await page.mouse.up();
		const dragged = Number(await handle.getAttribute('aria-valuenow'));
		assert.ok(dragged >= 280 && dragged < available, `dragging narrowed the preview (${dragged})`);
		assert.equal(await frameWidth(), dragged);

		// The preview theme is independent of the site theme.
		const siteTheme = await page.evaluate(() => document.documentElement.dataset.theme);
		for (const theme of ['light', 'dark']) {
			await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} preview` }).click();
			assert.equal(await previewDocument(page), theme);
			await page.waitForFunction((expected) => document.querySelector('[data-iframe]').contentDocument.documentElement.dataset.muxuiColorScheme === expected, theme);
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), siteTheme, 'the site theme did not change');
		}

		// Preview, Code, and Split.
		const stage = page.locator('[data-stage]');
		await page.getByRole('button', { name: 'Code', exact: true }).click();
		assert.equal(await stage.getAttribute('data-mode'), 'code');
		assert.equal(await page.locator('[data-frame]').isVisible(), false);
		assert.equal(await page.locator('[data-code]').isVisible(), true);
		assert.equal(await page.locator('.blocks-width').evaluate((node) => node.inert), true, 'width controls rest while only code shows');
		await page.getByRole('button', { name: 'Split', exact: true }).click();
		assert.equal(await page.locator('[data-frame]').isVisible() && await page.locator('[data-code]').isVisible(), true);
		await page.getByRole('button', { name: 'Preview', exact: true }).click();
		assert.equal(await page.locator('[data-code]').isVisible(), false);

		// Copy puts the exact Code view text on the clipboard.
		await page.getByRole('button', { name: 'Split', exact: true }).click();
		const codeText = await page.locator('[data-code-body] code').evaluate((node) => node.textContent);
		await page.getByRole('button', { name: 'Copy', exact: true }).click();
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), codeText);
		assert.equal(await page.locator('[data-copy]').textContent(), 'Copied');

		// The toolbar's width, theme, and view survive a move to another variant.
		await page.locator('[data-width-group] button[data-width="768"]').click();
		await page.getByRole('button', { name: 'Light preview' }).click();
		await page.locator(`.blocks-rail a.blocks-variant[href="${second.href}"]`).click();
		await page.waitForURL(`**${second.href}`);
		await previewReady(page);
		assert.equal(await page.locator('[data-stage]').getAttribute('data-mode'), 'split');
		assert.equal(await frameWidth(), 768);
		assert.equal(await previewDocument(page), 'light');

		// Back returns to the previous variant in place.
		if (second.href !== first.href) {
			await page.goBack();
			await page.waitForURL(`**${first.href}`);
			assert.equal(await page.locator('[data-blocks-detail] h1').textContent(), first.name);
			assert.equal(await page.evaluate(() => window.__sameDocument), true);
		}

		// Search and the Uses filter narrow the rail by the catalog's own terms.
		const search = page.getByRole('searchbox', { name: 'Search blocks' });
		const count = page.locator('[data-blocks-count]');
		const total = blocks.size;
		const noun = (n) => `${n} of ${total} block${total === 1 ? '' : 's'}`;
		assert.equal(await count.textContent(), noun(total));
		await search.fill('zzzzqq');
		await page.waitForFunction(() => document.querySelector('[data-blocks-count]').textContent.startsWith('0 of'));
		assert.equal(await page.locator('[data-blocks-none]').isVisible(), true);
		assert.equal(await page.locator('.blocks-rail li[data-block]:not([hidden])').count(), 0);
		await search.fill(first.block.split('-')[0]);
		await page.waitForFunction((slug) => document.querySelector(`.blocks-rail li[data-block="${slug}"]`)?.hidden === false, first.block);
		assert.ok(new URL(page.url()).searchParams.get('q') !== null, 'the query is kept in the URL');
		await search.fill('');
		const participants = await page.locator('[data-blocks-uses] option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
		assert.ok(participants.length > 0, 'the Uses filter lists participant components');
		const usesIndex = (await page.evaluate(async () => (await fetch('/blocks/filter-index.json')).json())).uses;
		for (const component of participants) {
			await page.getByLabel('Uses component').selectOption(component);
			const wanted = [...usesIndex[component]].sort();
			await page.waitForFunction((slugs) => {
				const shown = [...document.querySelectorAll('.blocks-rail li[data-block]:not([hidden])')].map((item) => item.dataset.block).sort();
				return shown.join() === slugs.join();
			}, wanted);
			assert.equal(await count.textContent(), noun(wanted.length));
		}
		await page.getByLabel('Uses component').selectOption('');
		assert.equal(await count.textContent(), noun(total));

		// The gallery opens a block from a card, and its rail entry returns to the gallery.
		await page.getByRole('link', { name: 'All blocks', exact: true }).click();
		await page.locator('[data-blocks-gallery]').waitFor();
		await page.locator('[data-blocks-gallery] a.blocks-card-link').first().click();
		await page.locator('[data-blocks-detail]').waitFor();
		assert.equal(await page.evaluate(() => window.__sameDocument), true);
	});
});

test('E-BL1-06: every variant fits every width preset, light and dark, and marketing variants fit every page width', { timeout: 600_000 }, async () => {
	await withSite(async ({ page, origin }) => {
		if (captureDir) await mkdir(captureDir, { recursive: true });
		await page.goto(`${origin}/blocks/`);
		const variants = await railVariants(page);
		const report = [];
		const record = async (entry, screenshot, name) => {
			report.push(entry);
			assert.equal(entry.overflowX, false, `${name} overflows horizontally (${entry.scrollWidth} > ${entry.clientWidth})`);
			if (captureDir) await screenshot(join(captureDir, `${name}.png`));
		};
		const measure = (frame) => frame.evaluate((node) => {
			const root = node.contentDocument.documentElement;
			return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, overflowX: root.scrollWidth > root.clientWidth };
		});

		for (const variant of variants) {
			const slug = `${variant.block}--${variant.href.split('/').at(-2)}`;
			for (const theme of THEMES) {
				await page.goto(`${origin}${variant.href}`);
				await previewReady(page);
				await page.getByRole('button', { name: `${theme === 'light' ? 'Light' : 'Dark'} preview` }).click();
				await page.waitForFunction((expected) => document.querySelector('[data-iframe]').contentDocument.documentElement.dataset.muxuiColorScheme === expected, theme);
				const widths = await page.locator('[data-width-group] button[data-width]').evaluateAll((buttons) => buttons.map((button) => button.dataset.width));
				for (const width of widths) {
					await page.locator(`[data-width-group] button[data-width="${width}"]`).click();
					await page.waitForFunction(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))));
					const name = `${slug}--${theme}--preset-${width}`;
					const entry = { kind: 'preset', block: variant.block, variant: variant.href, theme, preset: width, ...await measure(page.locator('[data-iframe]')) };
					entry.logicalWidth = await page.locator('[data-iframe]').evaluate((frame) => frame.contentWindow.innerWidth);
					await record(entry, (path) => page.locator('[data-frame]').screenshot({ path }), name);
				}
			}

			// A marketing section is judged as a page: the standalone preview at each page width.
			if (variant.group === 'marketing') {
				for (const theme of THEMES) {
					for (const width of PAGE_WIDTHS) {
						await page.setViewportSize({ width, height: 900 });
						await page.goto(`${origin}${variant.href}preview/?theme=${theme}`);
						await page.waitForFunction(() => document.querySelector('astro-island') !== null && document.querySelector('astro-island[ssr]') === null);
						const entry = await page.evaluate(() => {
							const root = document.documentElement;
							return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, overflowX: root.scrollWidth > root.clientWidth };
						});
						await record({ kind: 'page-width', block: variant.block, variant: variant.href, theme, pageWidth: width, ...entry }, (path) => page.screenshot({ path, fullPage: true }), `${slug}--${theme}--page-${width}`);
					}
				}
				await page.setViewportSize({ width: 1440, height: 900 });
			}
		}
		assert.ok(report.length >= variants.length * THEMES.length * 4, 'every variant was measured at every preset in both themes');
		if (captureDir) await writeFile(join(captureDir, 'overflow-report.json'), `${JSON.stringify({ pageWidths: PAGE_WIDTHS, measurements: report }, null, 2)}\n`);
	});
});
