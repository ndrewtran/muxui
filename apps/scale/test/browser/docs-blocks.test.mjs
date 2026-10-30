// Browser proof for the private Blocks section of the built docs site
// (E-BL1-05 behaviour, E-BL1-06 overflow). Run after `pnpm --filter @muxui/docs build`.
//
// MUXUI_BLOCKS_CAPTURE_DIR=<dir> also writes the E-BL1-06 captures and overflow
// report there, each image at the full height of the block. The test reads blocks
// from the built rail, so it covers any number of patterns and categories without naming one.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { pageWidths, toolbarPresets } from '../../../docs/src/lib/block-presets.ts';
import { chromeExecutable } from './chrome.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const captureDir = process.env.MUXUI_BLOCKS_CAPTURE_DIR;
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
// The toolbar presets and the marketing page widths come from the one module the toolbar reads.
const THEMES = ['light', 'dark'];
// The old header's theme picker overshot its content box by its own 8px inline margin; a phone header may not do worse.
const OLD_HEADER_OVERFLOW = 8;

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

// The rail is Sidebar navigation. A block is a link group: a row holding the block link and its toggle, and the list of
// its variants beside the row. Groups are the Sidebar sections.
const railRows = '[data-blocks-rail] .muxui-sidebar__nav-row';
const railVariantLink = (page, href) => page.locator(`[data-blocks-rail] .muxui-sidebar__nav-children .muxui-sidebar__nav-children a[href="${href}"]`);
const railBlockToggle = (page, href) => page.locator(railRows, { has: page.locator(`a[href="${href}"]`) }).getByRole('button');

/** Blocks and variants as the built rail lists them, with each block's derived group. */
async function railVariants(page) {
	return page.evaluate(() => [...document.querySelectorAll('[data-blocks-rail] [data-group]')].flatMap((section) => [...section.querySelectorAll('.muxui-sidebar__nav-row')].flatMap((row) => {
		const block = new URL(row.querySelector('a').href).pathname.split('/')[2];
		return [...row.parentElement.querySelectorAll(':scope > ul a[href]')].map((link) => ({
			block,
			group: section.dataset.group,
			name: link.textContent.trim(),
			href: link.getAttribute('href'),
		}));
	})));
}

/** Waits for Astro to initialize the page's islands; React's first commit can still be pending. */
const islandsReady = (page) => page.waitForFunction(() => document.querySelector('astro-island[ssr]') === null);

/** Waits until the page's islands have hydrated and the preview document is loaded with its example island hydrated. */
async function previewReady(page) {
	await islandsReady(page);
	await page.waitForFunction(() => {
		const doc = document.querySelector('[data-iframe]')?.contentDocument;
		return doc?.readyState === 'complete' && doc.querySelector('astro-island') !== null && doc.querySelector('astro-island[ssr]') === null;
	});
}

const previewDocument = (page) => page.locator('[data-iframe]').evaluate((frame) => frame.contentDocument.documentElement.dataset.theme);

// The toolbar's three groups are Mux ToggleButtonGroups: single-selection radio groups of radio buttons.
const toolbarGroup = (page, name) => page.getByRole('radiogroup', { name, exact: true });
const toolbarButton = (page, group, name) => toolbarGroup(page, group).getByRole('radio', { name, exact: true });
const widthButton = (page, name) => toolbarButton(page, 'Preview width', name);
const widthLabels = toolbarPresets.map(({ key, width }) => `${key} ${width}`);
/** Whether a radio group shows its selection: exactly the named radio is checked. */
const checkedRadios = (group) => group.getByRole('radio').evaluateAll((radios) => radios.filter((radio) => radio.getAttribute('aria-checked') === 'true').map((radio) => radio.textContent.trim()));

/** Waits until the standalone preview page's example island is hydrated. */
const standalonePreviewReady = (page) => page.waitForFunction(() => document.querySelector('astro-island') !== null && document.querySelector('astro-island[ssr]') === null);

/**
 * Writes the standalone preview of a variant at `width` as one full-height image. The toolbar's frame is only as tall as the window
 * and scrolls the preview inside it, so a screenshot of the frame would clip a long block; the standalone route scrolls the page.
 */
async function capturePreview(page, url, width, path) {
	await page.setViewportSize({ width, height: 900 });
	await page.goto(url);
	await standalonePreviewReady(page);
	await page.screenshot({ path, fullPage: true });
}

test('the Blocks section: rail, filters, presets, handle, theme, views, and copy', { timeout: 180_000 }, async () => {
	await withSite(async ({ page, origin }) => {
		await page.goto(`${origin}/blocks/`);
		await page.locator('[data-blocks-gallery]').waitFor();
		await islandsReady(page);
		const variants = await railVariants(page);
		assert.ok(variants.length > 0, 'the rail lists variants');
		const blocks = new Set(variants.map(({ block }) => block));
		assert.equal(await page.locator('[data-gallery-count]').textContent(), `${blocks.size} block${blocks.size === 1 ? '' : 's'}, ${variants.length} variant${variants.length === 1 ? '' : 's'}`);
		assert.equal(await page.locator('[data-blocks-gallery] li[data-block]').count(), blocks.size);
		await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

		// Every rail variant opens its block in place, without a document reload.
		await page.evaluate(() => { window.__sameDocument = true; });
		for (const variant of variants) {
			await railVariantLink(page, variant.href).click();
			await page.waitForURL(`**${variant.href}`);
			await page.locator('[data-blocks-detail] h1').waitFor();
			assert.equal(await page.locator('[data-blocks-detail] h1').textContent(), variant.name);
			assert.equal(await page.evaluate(() => window.__sameDocument), true, `${variant.href} swapped in place`);
			assert.deepEqual(await page.locator('[data-blocks-rail] [aria-current="page"]').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), [variant.href]);
			assert.equal(await page.locator('[data-blocks-detail] [aria-current]').count(), 0, 'only the rail link marks the current page');
			assert.equal(await page.locator('[data-iframe]').getAttribute('src'), `${variant.href}preview/`);
			assert.notEqual((await page.locator('[data-iframe]').getAttribute('title')).trim(), '');
		}
		const [first, second = first] = variants;
		await railVariantLink(page, first.href).click();
		await page.waitForURL(`**${first.href}`);
		await previewReady(page);

		// Width presets set the preview's logical width; the readout and the checked radio follow.
		assert.deepEqual(await toolbarGroup(page, 'Preview width').getByRole('radio').allTextContents(), [...widthLabels, 'Full']);
		const frameWidth = () => page.locator('[data-iframe]').evaluate((frame) => frame.contentWindow.innerWidth);
		for (const { key, width } of toolbarPresets) {
			await widthButton(page, `${key} ${width}`).click();
			assert.equal(await frameWidth(), width);
			assert.deepEqual(await checkedRadios(toolbarGroup(page, 'Preview width')), [`${key} ${width}`]);
			assert.match(await page.locator('[data-readout]').textContent(), new RegExp(`^${width} px`, 'u'));
		}
		await widthButton(page, 'Full').click();
		const available = await page.locator('[data-frame]').evaluate((frame) => frame.clientWidth - 24);
		assert.equal(await frameWidth(), available);

		// The handle resizes from the keyboard and by dragging, and exposes its value.
		const handle = page.getByRole('separator', { name: 'Resize preview' });
		await widthButton(page, widthLabels[0]).click();
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
		assert.deepEqual(await checkedRadios(toolbarGroup(page, 'Preview width')), ['Full']);
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
			await toolbarButton(page, 'Preview theme', `${theme === 'light' ? 'Light' : 'Dark'} preview`).click();
			assert.equal(await previewDocument(page), theme);
			await page.waitForFunction((expected) => document.querySelector('[data-iframe]').contentDocument.documentElement.dataset.muxuiColorScheme === expected, theme);
			assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), siteTheme, 'the site theme did not change');
		}

		// Preview, Code, and Split.
		const stage = page.locator('[data-stage]');
		await toolbarButton(page, 'View', 'Code').click();
		assert.equal(await stage.getAttribute('data-mode'), 'code');
		assert.equal(await page.locator('[data-frame]').isVisible(), false);
		assert.equal(await page.locator('[data-code]').isVisible(), true);
		// The groups that only apply to the preview are disabled, and the Mux disabled state dims them.
		for (const group of ['Preview width', 'Preview theme']) {
			const radios = toolbarGroup(page, group).getByRole('radio');
			assert.equal(await radios.evaluateAll((nodes) => nodes.every((node) => node.disabled)), true, `${group} rests while only code shows`);
			assert.ok(Number(await radios.first().evaluate((node) => getComputedStyle(node).opacity)) < 1, `${group} dims while disabled`);
		}
		await toolbarButton(page, 'View', 'Split').click();
		assert.equal(await page.locator('[data-frame]').isVisible() && await page.locator('[data-code]').isVisible(), true);
		for (const group of ['Preview width', 'Preview theme']) {
			assert.equal(await toolbarGroup(page, group).getByRole('radio').first().evaluate((node) => getComputedStyle(node).opacity), '1', `${group} is not dimmed while the preview shows`);
		}
		await toolbarButton(page, 'View', 'Preview').click();
		assert.equal(await page.locator('[data-code]').isVisible(), false);

		// Copy puts the exact Code view text on the clipboard.
		await toolbarButton(page, 'View', 'Split').click();
		const codeText = await page.locator('[data-code-body] code').evaluate((node) => node.textContent);
		await page.getByRole('button', { name: 'Copy', exact: true }).click();
		assert.equal(await page.evaluate(() => navigator.clipboard.readText()), codeText);
		assert.equal(await page.locator('[data-copy]').textContent(), 'Copied');

		// The toolbar's width, theme, and view survive a move to another variant.
		await widthButton(page, widthLabels[1]).click();
		await toolbarButton(page, 'Preview theme', 'Light preview').click();
		await railVariantLink(page, second.href).click();
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

		// A block the reader collapsed stays collapsed through in-place navigation, and reaching it again opens it.
		const other = variants.find(({ block }) => block !== first.block);
		if (other) {
			const blockToggle = railBlockToggle(page, first.href);
			assert.equal(await blockToggle.getAttribute('aria-expanded'), 'true', 'the rail starts with the block open');
			await blockToggle.click();
			assert.equal(await blockToggle.getAttribute('aria-expanded'), 'false');
			assert.equal(await railVariantLink(page, first.href).isVisible(), false, 'a collapsed block hides its variants');
			await railVariantLink(page, other.href).click();
			await page.waitForURL(`**${other.href}`);
			await page.locator('[data-blocks-detail] h1').waitFor();
			assert.equal(await blockToggle.getAttribute('aria-expanded'), 'false', 'the collapsed block survives the in-place swap');
			await page.getByRole('link', { name: 'All blocks', exact: true }).click();
			await page.locator('[data-blocks-gallery]').waitFor();
			await page.locator(`[data-blocks-gallery] a.blocks-card-link[href="${first.href}"]`).click();
			await page.waitForURL(`**${first.href}`);
			await page.locator('[data-blocks-detail] h1').waitFor();
			assert.equal(await blockToggle.getAttribute('aria-expanded'), 'true', 'reaching a block opens the groups that hold it');
			assert.equal(await railVariantLink(page, first.href).getAttribute('aria-current'), 'page');
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
		assert.equal(await page.locator(railRows).count(), 0);
		await search.fill(first.block.split('-')[0]);
		await page.waitForFunction(({ rows, slug }) => [...document.querySelectorAll(`${rows} > a`)].some((link) => link.pathname.split('/')[2] === slug), { rows: railRows, slug: first.block });
		assert.ok(new URL(page.url()).searchParams.get('q') !== null, 'the query is kept in the URL');
		await search.fill('');
		const participants = await page.getByLabel('Uses component').locator('option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
		assert.ok(participants.length > 0, 'the Uses filter lists participant components');
		const usesIndex = (await page.evaluate(async () => (await fetch('/blocks/filter-index.json')).json())).uses;
		for (const component of participants) {
			await page.getByLabel('Uses component').selectOption(component);
			const wanted = [...usesIndex[component]].sort();
			await page.waitForFunction(({ rows, slugs }) => {
				const shown = [...document.querySelectorAll(`${rows} > a`)].map((link) => link.pathname.split('/')[2]).sort();
				return shown.join() === slugs.join();
			}, { rows: railRows, slugs: wanted });
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

/** Opens the first variant the built rail lists. */
async function openFirstVariant(page, origin) {
	await page.goto(`${origin}/blocks/`);
	await islandsReady(page);
	const [first] = await railVariants(page);
	await page.goto(`${origin}${first.href}`);
	await islandsReady(page);
	return first;
}

test('Copy returns to its label after clicks inside the confirmation', async () => {
	await withSite(async ({ page, origin }) => {
		await openFirstVariant(page, origin);
		await toolbarButton(page, 'View', 'Split').click();
		const copy = page.locator('[data-copy]');
		await copy.click();
		await copy.click();
		assert.equal(await copy.textContent(), 'Copied');
		// The first click's timer must not leave a second "Copied" to stick: the label returns to its own.
		await page.waitForFunction(() => document.querySelector('[data-copy]').textContent === 'Copy', null, { timeout: 5000 });
		assert.equal(await copy.textContent(), 'Copy');
	});
});

test('history steps restore the filters in the URL, the search field, the Uses select, and the blocks shown', async () => {
	await withSite(async ({ page, origin }) => {
		await page.goto(`${origin}/blocks/`);
		await islandsReady(page);
		const variants = await railVariants(page);
		const blocks = [...new Set(variants.map(({ block }) => block))];
		const usesIndex = (await page.evaluate(async () => (await fetch('/blocks/filter-index.json')).json())).uses;
		// A component that only some blocks use, so the Uses filter narrows the list.
		const component = Object.keys(usesIndex).find((name) => usesIndex[name].length > 0 && usesIndex[name].length < blocks.length);
		assert.ok(component, 'a Uses value narrows the rail');
		const [slug] = usesIndex[component];
		const search = page.getByRole('searchbox', { name: 'Search blocks' });
		const uses = page.getByLabel('Uses component');
		const shown = () => page.evaluate((rows) => [...new Set([...document.querySelectorAll(`${rows} > a`)].map((link) => link.pathname.split('/')[2]))].sort(), railRows);
		const filters = () => ({ q: new URL(page.url()).searchParams.get('q'), uses: new URL(page.url()).searchParams.get('uses') });
		/** Waits for the field, the select, and the rail to show one filter: the blocks `wanted`, or, with none given, some but not all of them. */
		const expectFilter = async (query, component, wanted, message) => {
			await page.waitForFunction(({ rows, query, component, wanted, total }) => {
				const field = document.querySelector('input[type="search"][aria-label="Search blocks"]');
				const select = [...document.querySelectorAll('select')].find((node) => node.labels?.[0]?.textContent === 'Uses component');
				const list = [...new Set([...document.querySelectorAll(`${rows} > a`)].map((link) => link.pathname.split('/')[2]))].sort();
				return field.value === query && select.value === component && (wanted ? list.join() === wanted.join() : list.length > 0 && list.length < total);
			}, { rows: railRows, query, component, wanted: wanted && [...wanted].sort(), total: blocks.length }, { timeout: 10_000 }).catch(async () => { throw new Error(`${message}: shown ${JSON.stringify(await shown())}, field "${await search.inputValue()}", select "${await uses.inputValue()}", URL ${page.url()}`); });
		};
		// Filter, open a block, then clear the filter on that page: the entry the history step returns to keeps its own filters.
		// selectOption skips the pointer interaction that hydrates the native select before its value changes.
		await uses.click();
		await uses.press('Escape');
		await uses.selectOption(component);
		await search.fill(slug.split('-')[0]);
		await expectFilter(slug.split('-')[0], component, null, 'the filter applies');
		const kept = await shown();
		assert.deepEqual(filters(), { q: slug.split('-')[0], uses: component });
		await railVariantLink(page, variants.find((variant) => variant.block === kept[0]).href).click();
		await page.locator('[data-blocks-detail] h1').waitFor();
		assert.deepEqual(filters(), { q: slug.split('-')[0], uses: component }, 'the filters travel with the swap');
		await search.fill('');
		await uses.selectOption('');
		await expectFilter('', '', blocks, 'clearing shows every block');
		assert.deepEqual(filters(), { q: null, uses: null });
		await page.goBack();
		await page.locator('[data-blocks-gallery]').waitFor();
		assert.deepEqual(filters(), { q: slug.split('-')[0], uses: component }, 'Back returns to the entry with its filters');
		await expectFilter(slug.split('-')[0], component, kept, 'Back restores the field, the select, and the shown blocks');
		await page.goForward();
		await page.locator('[data-blocks-detail] h1').waitFor();
		assert.deepEqual(filters(), { q: null, uses: null });
		await expectFilter('', '', blocks, 'Forward clears them again');
	});
});

test('rapid history navigation disposes gallery and viewer roots after their pending hydration commits', async () => {
	await withSite(async ({ page, origin }) => {
		await page.addInitScript(() => {
			// Hold React's MessageChannel work, without delaying navigation, fetches, or real input.
			// This makes the gap between Astro's ssr removal and React's first commit deterministic.
			window.__blocksScheduler = { hold: false, waiting: [], commits: [] };
			const NativeMessageChannel = window.MessageChannel;
			window.MessageChannel = class extends NativeMessageChannel {
				constructor() {
					super();
					const port = this.port1;
					Object.defineProperty(port, 'onmessage', { set(callback) {
						port.addEventListener('message', (event) => {
							const run = () => callback.call(port, event);
							if (window.__blocksScheduler.hold) window.__blocksScheduler.waiting.push(run);
							else run();
						});
						port.start();
					} });
				}
			};
			// Observe actual commits/disposal through React's DevTools integration; do not replace a root method.
			window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
				supportsFiber: true,
				inject: () => 1,
				onCommitFiberRoot: (_renderer, root) => {
					window.__blocksScheduler.commits.push({ island: root.containerInfo, mounted: root.current.child !== null });
				},
				onCommitFiberUnmount: () => {},
			};
		});
		await page.goto(`${origin}/blocks/`);
		await page.waitForFunction(() => window.__blocksScheduler.commits.some(({ island, mounted }) => mounted && island.querySelector('[data-blocks-gallery]')));
		const [first] = await railVariants(page);
		await page.evaluate(() => { window.__sameDocument = true; });
		await railVariantLink(page, first.href).click();
		await page.waitForURL(`**${first.href}`);
		await page.waitForFunction(() => window.__blocksScheduler.commits.some(({ island, mounted }) => mounted && island.querySelector('[data-stage]')));

		await page.evaluate(() => { window.__blocksScheduler.hold = true; });
		await page.goBack();
		await page.locator('[data-blocks-gallery]').waitFor();
		await islandsReady(page);
		await page.waitForFunction(() => window.__blocksScheduler.waiting.length > 0);
		await page.evaluate(() => {
			window.__pendingGallery = document.querySelector('[data-blocks-gallery]').closest('astro-island');
		});
		await page.goForward();
		await page.locator('[data-blocks-detail] h1').waitFor();
		await islandsReady(page);
		await page.evaluate(() => {
			window.__pendingViewer = document.querySelector('[data-stage]').closest('astro-island');
		});
		await page.goBack();
		await page.locator('[data-blocks-gallery]').waitFor();
		await islandsReady(page);
		assert.equal(await page.evaluate(() => window.__sameDocument), true, 'rapid Back/Forward still swaps in place');
		assert.equal(await page.evaluate(() => [window.__pendingGallery, window.__pendingViewer].every((island) =>
			!island.isConnected && !island.hasAttribute('ssr') && !window.__blocksScheduler.commits.some((commit) => commit.island === island))), true,
		'both islands were removed after Astro setup but before React committed, without forcing an early unmount');

		await page.evaluate(() => {
			window.__blocksScheduler.hold = false;
			window.__blocksScheduler.waiting.splice(0).forEach((run) => run());
		});
		await page.waitForFunction(() => [window.__pendingGallery, window.__pendingViewer].every((island) =>
			window.__blocksScheduler.commits.some((commit) => commit.island === island && !commit.mounted)));
		assert.deepEqual(await page.evaluate(() => [window.__pendingGallery, window.__pendingViewer].map((island) =>
			window.__blocksScheduler.commits.filter((commit) => commit.island === island).map(({ mounted }) => mounted)
				// Effects and external stores can commit again; require the mounted -> disposed transition, with no remount.
				.filter((mounted, index, states) => index === 0 || mounted !== states[index - 1]))), [[true, false], [true, false]],
		'each detached root first commits and is then actually unmounted, with no later remount');
		await page.getByRole('searchbox', { name: 'Search blocks' }).fill('zzzzqq');
		await page.waitForFunction(() => document.querySelector('[data-blocks-count]').textContent.startsWith('0 of'));
		assert.equal(await page.locator('[data-blocks-gallery] li[data-block]:visible').count(), 0, 'the current gallery still follows the rail filter');
	});
});

test('pane swaps leave no document listener behind for the islands they remove', async () => {
	await withSite(async ({ page, origin }) => {
		// Astro parks a one-shot `astro:after-swap` listener on the document when it removes an island, and it only drops it when that event fires.
		// Track the ones that are still waiting, so a swap that never sends the event shows up as a count that grows.
		await page.addInitScript(() => {
			const live = new Set();
			const wrappers = new Map();
			const { addEventListener, removeEventListener } = document;
			window.__afterSwap = { live, registered: 0 };
			document.addEventListener = function (type, listener, options) {
				if (type !== 'astro:after-swap') return addEventListener.call(this, type, listener, options);
				window.__afterSwap.registered += 1;
				live.add(listener);
				const once = typeof options === 'object' && options !== null && options.once === true;
				const wrapper = once ? (event) => { live.delete(listener); wrappers.delete(listener); return listener.call(document, event); } : listener;
				wrappers.set(listener, wrapper);
				return addEventListener.call(this, type, wrapper, options);
			};
			document.removeEventListener = function (type, listener, options) {
				if (type !== 'astro:after-swap') return removeEventListener.call(this, type, listener, options);
				live.delete(listener);
				const wrapper = wrappers.get(listener) ?? listener;
				wrappers.delete(listener);
				return removeEventListener.call(this, type, wrapper, options);
			};
		});
		await page.goto(`${origin}/blocks/`);
		await islandsReady(page);
		const [first] = await railVariants(page);
		const waiting = () => page.evaluate(() => ({ live: window.__afterSwap.live.size, registered: window.__afterSwap.registered }));
		// The gallery and the block viewer are islands in the pane, so alternating between them removes hydrated islands on every swap.
		for (let swap = 0; swap < 8; swap += 1) {
			if (swap % 2 === 0) {
				await railVariantLink(page, first.href).click();
				await page.waitForURL(`**${first.href}`);
				await page.locator('[data-blocks-detail] h1').waitFor();
			} else {
				await page.getByRole('link', { name: 'All blocks', exact: true }).click();
				await page.waitForURL('**/blocks/');
				await page.locator('[data-blocks-gallery]').waitFor();
			}
			await islandsReady(page);
			assert.equal((await waiting()).live, 0, `swap ${swap + 1} left no island waiting on a swap event`);
		}
		assert.ok((await waiting()).registered >= 8, 'the probe saw the islands the swaps removed');
	});
});

test('a filter index that fails to load shows a status, and the next change retries', async () => {
	await withSite(async ({ page, origin }) => {
		await page.route('**/blocks/filter-index.json', (route) => route.abort());
		await page.goto(`${origin}/blocks/`);
		await islandsReady(page);
		const search = page.getByRole('searchbox', { name: 'Search blocks' });
		const status = page.locator('[data-blocks-count]');
		await search.fill('poster');
		await page.waitForFunction(() => /unavailable/u.test(document.querySelector('[data-blocks-count]').textContent), null, { timeout: 5000 });
		assert.equal(await status.isVisible(), true, 'the status is visible');
		assert.equal(await page.locator(railRows).count() > 0, true, 'blocks stay listed');
		await page.unroute('**/blocks/filter-index.json');
		await search.fill('poster ');
		await page.waitForFunction(() => /^\d+ of \d+ block/u.test(document.querySelector('[data-blocks-count]').textContent));
	});
});

/** The header's controls against the end of its content box, and whether any touches the menu button. */
const headerFit = (page) => page.evaluate(() => {
	const header = document.querySelector('header.header, header.blocks-header');
	const box = header.getBoundingClientRect();
	const innerRight = box.right - parseFloat(getComputedStyle(header).paddingRight);
	const shown = (element) => {
		const rect = element?.getBoundingClientRect();
		return rect && rect.width > 0 && rect.height > 0 ? rect : null;
	};
	const controls = [...header.querySelectorAll('.mux-site-title, .mux-site-nav a, starlight-theme-select select')].map(shown).filter(Boolean);
	const menu = shown(document.querySelector('.sl-menu-button'));
	return {
		controls: controls.length,
		overflow: Math.max(...controls.map((rect) => rect.right - innerRight)),
		hasMenu: menu !== null,
		touchesMenu: menu !== null && controls.some((rect) => rect.right > menu.left && rect.left < menu.right),
		actionsGap: innerRight - header.querySelector('.mux-header-actions').getBoundingClientRect().right,
		searchShown: shown(header.querySelector('.mux-header-search')) !== null,
		pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
	};
});

test('the Blocks header keeps its actions at the end, with search shown or hidden', async () => {
	await withSite(async ({ page, origin }) => {
		for (const [width, searchShown] of [[1440, true], [480, false]]) {
			await page.setViewportSize({ width, height: 800 });
			await page.goto(`${origin}/blocks/`);
			await islandsReady(page);
			const fit = await headerFit(page);
			assert.equal(fit.searchShown, searchShown, `search at ${width}px`);
			assert.ok(Math.abs(fit.actionsGap) <= 1, `the actions end ${fit.actionsGap}px from the header's end at ${width}px`);
		}
	});
});

test('the site header fits a phone on Starlight docs pages and Blocks pages', async () => {
	await withSite(async ({ page, origin }) => {
		for (const route of ['/installation/', '/blocks/']) {
			for (const width of [320, 360]) {
				await page.setViewportSize({ width, height: 800 });
				await page.goto(`${origin}${route}`);
				await islandsReady(page);
				const fit = await headerFit(page);
				const name = `${route} at ${width}px`;
				assert.equal(fit.hasMenu, route === '/installation/', `${name} shows the menu button only with a sidebar`);
				assert.ok(fit.controls >= 3, `${name} shows the title and nav`);
				assert.equal(fit.touchesMenu, false, `${name}: a header control overlaps the menu button`);
				assert.ok(Math.round(fit.overflow) <= OLD_HEADER_OVERFLOW, `${name}: the header overflows by ${fit.overflow}px, more than the old ${OLD_HEADER_OVERFLOW}px`);
				assert.ok(fit.pageOverflow <= 0, `${name}: the page scrolls sideways by ${fit.pageOverflow}px`);
			}
		}
	});
});

test('E-BL1-06: every variant fits every width preset, light and dark, and marketing variants fit every page width', { timeout: 600_000 }, async () => {
	await withSite(async ({ page, origin }) => {
		if (captureDir) await mkdir(captureDir, { recursive: true });
		await page.goto(`${origin}/blocks/`);
		await islandsReady(page);
		const variants = await railVariants(page);
		assert.ok(variants.length > 0, 'the rail lists variants');
		const report = [];
		// Preset images come from a second page, so the toolbar page keeps its theme and preset while each is captured.
		const capturePage = captureDir ? await page.context().newPage() : null;
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
				await toolbarButton(page, 'Preview theme', `${theme === 'light' ? 'Light' : 'Dark'} preview`).click();
				await page.waitForFunction((expected) => document.querySelector('[data-iframe]').contentDocument.documentElement.dataset.muxuiColorScheme === expected, theme);
				const radios = toolbarGroup(page, 'Preview width').getByRole('radio');
				// A preset's key is its pixel width, or `full`, as in the capture file names.
				const widths = (await radios.allTextContents()).map((label) => (label === 'Full' ? 'full' : label.split(' ').at(-1)));
				for (const [index, width] of widths.entries()) {
					await radios.nth(index).click();
					await page.waitForFunction(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))));
					const name = `${slug}--${theme}--preset-${width}`;
					const entry = { kind: 'preset', block: variant.block, variant: variant.href, theme, preset: width, ...await measure(page.locator('[data-iframe]')) };
					entry.logicalWidth = await page.locator('[data-iframe]').evaluate((frame) => frame.contentWindow.innerWidth);
					await record(entry, (path) => capturePreview(capturePage, `${origin}${variant.href}preview/?theme=${theme}`, entry.logicalWidth, path), name);
				}
			}

			// A marketing section is judged as a page: the standalone preview at each page width.
			if (variant.group === 'marketing') {
				for (const theme of THEMES) {
					for (const width of pageWidths) {
						await page.setViewportSize({ width, height: 900 });
						await page.goto(`${origin}${variant.href}preview/?theme=${theme}`);
						await standalonePreviewReady(page);
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
		await capturePage?.close();
		if (captureDir) await writeFile(join(captureDir, 'overflow-report.json'), `${JSON.stringify({ pageWidths, measurements: report }, null, 2)}\n`);
	});
});
