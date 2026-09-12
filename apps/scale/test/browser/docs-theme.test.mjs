import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright-core';
import { createScaleDocument, DEFAULT_SETTINGS } from '../../src/theme-contract.mjs';
import { chromeExecutable } from './chrome.mjs';

const docsRoot = resolve(import.meta.dirname, '../../../docs/dist');
const mimeTypes = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function staticDocsServer() {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = normalize(join(docsRoot, relative));
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

async function waitForScale(page) {
  await page.getByRole('heading', { name: 'Theme Playground', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function screenshot(page, name) {
  const directory = process.env.MUXUI_DOCS_SCREENSHOT_DIR;
  if (!directory) return;
  await page.addStyleTag({ content: '*, *::before, *::after { animation-duration: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; }' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(180);
  await page.screenshot({ path: join(directory, `${name}.png`) });
	await page.screenshot({ path: join(directory, `${name}-full.png`), fullPage: true });
}

async function resolveToken(page, property, token) {
	return page.evaluate(({ property: cssProperty, token: tokenName }) => {
		const probe = document.createElement('span');
		probe.style.setProperty(cssProperty, `var(${tokenName})`);
		document.body.append(probe);
		const value = getComputedStyle(probe).getPropertyValue(cssProperty);
		probe.remove();
		return value;
	}, { property, token });
}

async function inspectSearch(page, screenshotName) {
	await page.locator('button[data-open-modal]').first().click();
	const dialog = page.locator('site-search dialog[open]');
	await dialog.waitFor();
	const input = page.locator('#starlight__search .pagefind-ui__search-input');
	await input.waitFor();
	await input.fill('button');
	await page.waitForFunction(() => document.querySelectorAll('#starlight__search .pagefind-ui__result').length > 0);
	const values = await page.evaluate(() => {
		const root = document.documentElement;
		const resolve = (property, token) => {
			const probe = document.createElement('span');
			probe.style.setProperty(property, `var(${token})`);
			document.body.append(probe);
			const value = getComputedStyle(probe).getPropertyValue(property);
			probe.remove();
			return value;
		};
		const resultTitle = document.querySelector('#starlight__search .pagefind-ui__result-title');
		const resultExcerpt = document.querySelector('#starlight__search .pagefind-ui__result-excerpt');
		if (!resultTitle || !resultExcerpt) throw new Error('Missing Pagefind result content');
		const inputStyles = getComputedStyle(document.querySelector('#starlight__search .pagefind-ui__search-input'));
		const dialogStyles = getComputedStyle(document.querySelector('site-search dialog[open]'));
		const titleStyles = getComputedStyle(resultTitle);
		const excerptStyles = getComputedStyle(resultExcerpt);
		return {
			dialogBackground: dialogStyles.backgroundColor,
			dialogBorder: dialogStyles.borderTopColor,
			dialogRadius: dialogStyles.borderTopLeftRadius,
			dialogShadow: dialogStyles.boxShadow,
			backdropFilter: getComputedStyle(document.querySelector('site-search dialog[open]'), '::backdrop').backdropFilter,
			backdropBackground: getComputedStyle(document.querySelector('site-search dialog[open]'), '::backdrop').backgroundColor,
			inputBackground: inputStyles.backgroundColor,
			inputBorder: inputStyles.borderTopColor,
			inputColor: inputStyles.color,
			inputRadius: inputStyles.borderTopLeftRadius,
			inputFont: inputStyles.fontFamily,
			inputPlaceholder: getComputedStyle(document.querySelector('#starlight__search .pagefind-ui__search-input'), '::placeholder').color,
			resultTitleFont: titleStyles.fontFamily,
			resultTitleSize: titleStyles.fontSize,
			resultTitleRadius: titleStyles.borderTopLeftRadius,
			resultExcerptColor: excerptStyles.color,
			resultExcerptFont: excerptStyles.fontFamily,
			resultCount: document.querySelectorAll('#starlight__search .pagefind-ui__result').length,
			mux: {
				canvas: resolve('background-color', '--muxui-semantic-surface-canvas'),
				raised: resolve('background-color', '--muxui-semantic-surface-raised'),
				background: resolve('background-color', '--muxui-semantic-surface-background'),
				border: resolve('border-color', '--muxui-semantic-border-default'),
				focusBorder: resolve('border-color', '--muxui-semantic-content-link'),
				controlRadius: resolve('border-radius', '--muxui-semantic-control-radius'),
				overlayRadius: resolve('border-radius', '--muxui-semantic-shape-overlay-radius'),
				titleSize: resolve('font-size', '--muxui-semantic-typography-title-s-font-size'),
				textColor: resolve('color', '--muxui-semantic-content-default'),
				strongColor: resolve('color', '--muxui-semantic-content-strong'),
				mutedColor: resolve('color', '--muxui-semantic-content-muted'),
				placeholderColor: resolve('color', '--muxui-semantic-content-default'),
				scrim: resolve('background-color', '--muxui-semantic-effect-scrim'),
			},
		};
	});
	if (screenshotName) await screenshot(page, screenshotName);
	await page.keyboard.press('Escape');
	await dialog.waitFor({ state: 'hidden' });
	return values;
}

test('docs Scale applies one validated theme across shell, islands and portals', { timeout: 120_000 }, async () => {
  await access(join(docsRoot, 'scale/index.html'));
  const server = staticDocsServer();
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  const address = server.address();
  assert.equal(typeof address, 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ executablePath: await chromeExecutable(), headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${url}/components/button/`);
    await page.locator('.mux-page-title h1').waitFor();
    assert.equal(await page.locator('.scale-app').count(), 0, 'ordinary docs pages do not mount the editor');
    assert.equal((await page.locator('script[src="/_muxui/theme-prepaint.js"]').count()), 1);
    const defaultHeading = await page.locator('.mux-page-title h1').evaluate((node) => {
      const styles = getComputedStyle(node);
      return { fontSize: styles.fontSize, fontWeight: styles.fontWeight, lineHeight: styles.lineHeight, fontFamily: styles.fontFamily };
    });

    await page.goto(`${url}/scale/`);
    await waitForScale(page);
    assert.equal(await page.locator('h1').count(), 1, 'embedded editor does not add a second page h1');
    assert.equal(await page.locator('.right-sidebar-container').evaluate((node) => getComputedStyle(node).display), 'none');
    assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Load', exact: true }).count(), 0);
    const defaultBrand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim());
    const defaultShellBackground = await page.evaluate(() => getComputedStyle(document.querySelector('.header')).backgroundColor);
    assert.notEqual(defaultShellBackground, 'rgba(0, 0, 0, 0)');

    await page.getByRole('button', { name: 'Forest', exact: true }).click();
    await page.getByRole('button', { name: 'Apply to site', exact: true }).click();
    await page.getByText('Applied', { exact: true }).waitFor();
    assert.equal(await page.locator('#muxui-applied-theme').count(), 1);
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('muxui-applied-theme')), true);
    const appliedBrand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim());
    const appliedShellBackground = await page.evaluate(() => getComputedStyle(document.querySelector('.header')).backgroundColor);
    assert.notEqual(appliedBrand, defaultBrand);
    assert.notEqual(appliedShellBackground, defaultShellBackground);
    assert.equal(await page.locator('.scale-app').getAttribute('data-muxui-color-scheme'), 'light');

    const themeSelect = page.locator('starlight-theme-select select').first();
    await themeSelect.selectOption('dark');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiColorScheme === 'dark');
    const darkReadability = await page.evaluate(() => {
      const checkbox = document.querySelector('.preview-canvas .muxui-checkbox');
      const field = document.querySelector('.preview-canvas .muxui-field-input');
      if (!checkbox || !field) throw new Error('Missing embedded checkbox or field preview');
      return { checkbox: getComputedStyle(checkbox).color, field: getComputedStyle(field).color, root: getComputedStyle(document.documentElement).getPropertyValue('--muxui-semantic-color-neutral-default-20').trim() };
    });
    const darkShellBackground = await page.evaluate(() => getComputedStyle(document.querySelector('.header')).backgroundColor);
    assert.notEqual(darkReadability.checkbox, 'rgba(0, 0, 0, 0)');
    assert.notEqual(darkReadability.field, 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), appliedBrand);
    await screenshot(page, 'scale-dark');

    await page.getByRole('combobox', { name: 'Motion preference', exact: true }).selectOption('reduced');
    await page.waitForFunction(() => document.documentElement.dataset.muxuiMotion === 'reduced');
    await page.getByRole('combobox', { name: 'Density preference', exact: true }).selectOption('compact');
    await page.waitForFunction(() => document.documentElement.dataset.muxuiDensity === 'compact');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiMotion === 'reduced' && document.querySelector('.scale-app')?.dataset.muxuiDensity === 'compact');
    const portalPage = await context.newPage();
    await portalPage.goto(`${url}/components/select/`);
    await portalPage.locator('.muxui-select-trigger').first().waitFor();
    await portalPage.locator('.muxui-select-trigger').first().click();
    await portalPage.locator('.muxui-select-popover').waitFor();
    const portal = portalPage.locator('.muxui-select-popover');
    assert.notEqual(await portal.evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await portal.evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-reference-color-brand-60').trim()), appliedBrand);
    assert.equal(await portal.evaluate((node) => getComputedStyle(node).boxSizing), 'content-box');

    await portalPage.goto(`${url}/components/number-field/`);
    const numberStepper = portalPage.locator('.muxui-number-stepper').first();
    await numberStepper.waitFor();
    const numberStepperGeometry = await numberStepper.evaluate((node) => {
      const styles = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { boxSizing: styles.boxSizing, width: rect.width, height: rect.height };
    });
    assert.equal(numberStepperGeometry.boxSizing, 'border-box');
    assert.ok(Math.abs(numberStepperGeometry.width - 36) < 0.5, `number stepper width drifted: ${JSON.stringify(numberStepperGeometry)}`);
    assert.ok(Math.abs(numberStepperGeometry.height - 36) < 0.5, `number stepper height drifted: ${JSON.stringify(numberStepperGeometry)}`);

    await portalPage.goto(`${url}/components/date-picker/`);
    const dateTrigger = portalPage.locator('.muxui-date-trigger').first();
    await dateTrigger.waitFor();
    const dateTriggerGeometry = await dateTrigger.evaluate((node) => {
      const styles = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { boxSizing: styles.boxSizing, width: rect.width, height: rect.height };
    });
    assert.equal(dateTriggerGeometry.boxSizing, 'border-box');
    assert.ok(Math.abs(dateTriggerGeometry.width - 36) < 0.5, `date trigger width drifted: ${JSON.stringify(dateTriggerGeometry)}`);
    assert.ok(Math.abs(dateTriggerGeometry.height - 36) < 0.5, `date trigger height drifted: ${JSON.stringify(dateTriggerGeometry)}`);

    await portalPage.setViewportSize({ width: 1280, height: 900 });
    await portalPage.goto(`${url}/components/dialog/`);
    const dialogTrigger = portalPage.locator('.muxui-dialog-trigger').first();
    await dialogTrigger.waitFor();
    await dialogTrigger.click();
    const dialog = portalPage.locator('.muxui-dialog');
    await dialog.waitFor();
    const desktopDialog = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    assert.ok(Math.abs(desktopDialog.width - 521.6) < 1, `desktop dialog geometry drifted: ${JSON.stringify(desktopDialog)}`);

    await portalPage.setViewportSize({ width: 390, height: 844 });
    const mobileDialog = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth };
    });
    assert.ok(mobileDialog.left >= 0 && mobileDialog.right <= mobileDialog.viewport, `mobile dialog overflows viewport: ${JSON.stringify(mobileDialog)}`);
    await portalPage.close();
    const calendarGeometry = await page.locator('.preview-canvas .muxui-calendar').evaluate((calendar) => {
      const grid = calendar.querySelector('.muxui-calendar-grid');
      if (!grid) throw new Error('Missing calendar grid');
      const calendarRect = calendar.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      return { calendarRight: calendarRect.right, gridRight: gridRect.right, calendarWidth: calendarRect.width, gridWidth: gridRect.width };
    });
    assert.ok(calendarGeometry.gridRight <= calendarGeometry.calendarRight + 1, `calendar grid overflows root: ${JSON.stringify(calendarGeometry)}`);
    assert.ok(calendarGeometry.gridWidth <= calendarGeometry.calendarWidth + 1, `calendar grid is wider than root: ${JSON.stringify(calendarGeometry)}`);
    await page.goto(`${url}/themes/`);
    await page.goto(`${url}/components/button/`);
    await page.locator('.muxui-button').first().waitFor();
    assert.notEqual(await page.locator('.muxui-button').first().evaluate((node) => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), appliedBrand);
    await page.goBack();
    await page.goBack();
    await waitForScale(page);
    assert.equal(await page.locator('html').getAttribute('data-muxui-density'), 'compact');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), appliedBrand);
    await page.reload();
    await waitForScale(page);
    assert.equal(await page.locator('html').getAttribute('data-muxui-motion'), 'reduced');
    assert.equal(await page.locator('html').getAttribute('data-muxui-density'), 'compact');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.header')).backgroundColor), darkShellBackground);
    await themeSelect.selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiColorScheme === 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), appliedBrand);
    await screenshot(page, 'scale-light');

    await themeSelect.selectOption('dark');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiColorScheme === 'dark');
    const imported = createScaleDocument({
      ...DEFAULT_SETTINGS,
      namedColor: '#663399',
      curvature: 0,
      additionalOverrides: {
        'semantic.typography.display-line-height': { type: 'number', unit: 'unitless', value: 1.25 },
        'semantic.typography.display-font-weight': { type: 'number', unit: 'unitless', value: 700 },
      },
    }, { slug: 'embedded-import' });
    await page.locator('input[type=file]').setInputFiles({ name: 'embedded-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.getByRole('status').filter({ hasText: 'Apply to site when ready' }).waitFor();
    assert.equal(await page.locator('.scale-app').getAttribute('data-muxui-color-scheme'), 'dark');
    await page.getByRole('button', { name: 'Apply to site', exact: true }).click();
    await page.getByText('Applied', { exact: true }).waitFor();
    const importedBrand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim());
    assert.notEqual(importedBrand, appliedBrand);

    await page.goto(`${url}/installation/`);
    await page.locator('.mux-page-title h1').waitFor();
    const importedHeading = await page.locator('.mux-page-title h1').evaluate((node) => {
      const styles = getComputedStyle(node);
      return { fontSize: styles.fontSize, fontWeight: styles.fontWeight, lineHeight: styles.lineHeight, fontFamily: styles.fontFamily };
    });
    assert.notEqual(importedHeading.lineHeight, defaultHeading.lineHeight);
    assert.equal(importedHeading.fontWeight, '700');
    assert.match(importedHeading.fontFamily, /Inter/u);
    const headingLineHeight = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const heading = getComputedStyle(document.querySelector('.mux-page-title h1'));
      const expected = Number(root.getPropertyValue('--muxui-semantic-typography-display-line-height').trim());
      return Number.parseFloat(heading.lineHeight) / Number.parseFloat(heading.fontSize) - expected;
    });
    assert.ok(Math.abs(headingLineHeight) < 0.01, `heading line-height does not use display role: ${headingLineHeight}`);
    const pagination = page.locator('.pagination-links a').first();
    await pagination.waitFor();
    const paginationStyles = await pagination.evaluate((node) => {
      const styles = getComputedStyle(node);
      return { background: styles.backgroundColor, border: styles.borderTopColor, radius: styles.borderTopLeftRadius, shadow: styles.boxShadow };
    });
    assert.equal(paginationStyles.background, await resolveToken(page, 'background-color', '--muxui-semantic-surface-raised'));
    assert.equal(paginationStyles.border, await resolveToken(page, 'border-color', '--muxui-semantic-border-default'));
    assert.equal(paginationStyles.radius, await resolveToken(page, 'border-radius', '--muxui-semantic-shape-container-radius'));
    assert.equal(paginationStyles.shadow, await resolveToken(page, 'box-shadow', '--muxui-semantic-elevation-floating'));
    const darkSearch = await inspectSearch(page, 'theme-b-search-dark');
    assert.ok(darkSearch.resultCount > 0, 'Pagefind returned no real search results');
    assert.equal(darkSearch.dialogBackground, darkSearch.mux.raised);
    assert.equal(darkSearch.dialogBorder, darkSearch.mux.border);
    assert.equal(darkSearch.dialogRadius, darkSearch.mux.overlayRadius);
    assert.equal(darkSearch.dialogShadow, await resolveToken(page, 'box-shadow', '--muxui-semantic-elevation-modal'));
    assert.equal(darkSearch.backdropFilter, 'none');
    assert.equal(darkSearch.backdropBackground, darkSearch.mux.scrim);
    assert.equal(darkSearch.inputBackground, darkSearch.mux.background);
    assert.equal(darkSearch.inputBorder, darkSearch.mux.focusBorder);
    assert.equal(darkSearch.inputRadius, darkSearch.mux.controlRadius);
    assert.match(darkSearch.inputFont, /Inter/u);
    assert.equal(darkSearch.inputPlaceholder, darkSearch.mux.placeholderColor);
    assert.equal(darkSearch.resultTitleSize, darkSearch.mux.titleSize);
    assert.equal(darkSearch.resultTitleRadius, darkSearch.mux.controlRadius);
    assert.match(darkSearch.resultTitleFont, /Inter/u);
    assert.match(darkSearch.resultExcerptFont, /Inter/u);
    assert.equal(darkSearch.resultExcerptColor, darkSearch.mux.textColor);
    await screenshot(page, 'theme-b-dark');

    await page.goto(`${url}/components/button/`);
    await page.locator('.muxui-button[data-variant="primary"]').first().waitFor();
    const inlineButton = page.locator('.muxui-button[data-variant="primary"]').first();
    const inlineButtonStyles = await inlineButton.evaluate((node) => {
      const styles = getComputedStyle(node);
      return { background: styles.backgroundColor, radius: styles.borderTopLeftRadius, font: styles.fontFamily };
    });
    assert.equal(inlineButtonStyles.background, await resolveToken(page, 'background-color', '--muxui-semantic-selection-track'));
    assert.equal(inlineButtonStyles.radius, await resolveToken(page, 'border-radius', '--muxui-semantic-control-radius'));
    assert.match(inlineButtonStyles.font, /Inter/u);
    const importedButtonBrand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim());
    assert.equal(importedButtonBrand, importedBrand);

    const importedPortalPage = await context.newPage();
    await importedPortalPage.goto(`${url}/components/select/`);
    await importedPortalPage.locator('.muxui-select-trigger').first().waitFor();
    await importedPortalPage.locator('.muxui-select-trigger').first().click();
    await importedPortalPage.locator('.muxui-select-popover').waitFor();
    const importedPortal = importedPortalPage.locator('.muxui-select-popover');
    assert.equal(await importedPortal.evaluate((node) => getComputedStyle(node).borderTopLeftRadius), await resolveToken(importedPortalPage, 'border-radius', '--muxui-semantic-control-radius'));
    assert.equal(await importedPortal.evaluate((node) => getComputedStyle(node).getPropertyValue('--muxui-reference-color-brand-60').trim()), importedBrand);
    await importedPortalPage.close();

    await page.goto(`${url}/scale/`);
    await waitForScale(page);
    const importedThemeSelect = page.locator('starlight-theme-select select').first();
    await importedThemeSelect.selectOption('light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiColorScheme === 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), importedBrand);
    await screenshot(page, 'theme-b-light');
    await page.goto(`${url}/installation/`);
    const lightSearch = await inspectSearch(page, 'theme-b-search-light');
    assert.ok(lightSearch.resultCount > 0, 'Pagefind light search returned no real results');
    assert.equal(lightSearch.inputBackground, lightSearch.mux.background);
    assert.equal(lightSearch.inputBorder, lightSearch.mux.focusBorder);
		assert.equal(lightSearch.inputRadius, lightSearch.mux.controlRadius);
    assert.equal(lightSearch.inputPlaceholder, lightSearch.mux.placeholderColor);
    assert.equal(lightSearch.backdropFilter, 'none');
    assert.equal(lightSearch.backdropBackground, lightSearch.mux.scrim);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${url}/components/button/`);
    await page.locator('.muxui-button[data-variant="primary"]').first().waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const mobileMenu = page.locator('.sl-menu-button');
    const mobileTocSummary = page.locator('#starlight__on-this-page--mobile');
    await mobileMenu.waitFor();
    await mobileTocSummary.waitFor();
    const mobileClosedStyles = await page.evaluate(() => {
      const menu = document.querySelector('.sl-menu-button');
      const summary = document.querySelector('#starlight__on-this-page--mobile');
      const toggle = summary?.querySelector('.toggle');
      if (!menu || !summary || !toggle) throw new Error('Missing mobile shell controls');
      const menuStyles = getComputedStyle(menu);
      const toggleStyles = getComputedStyle(toggle);
      return {
        menuRadius: menuStyles.borderTopLeftRadius,
        menuBackground: menuStyles.backgroundColor,
        menuColor: menuStyles.color,
        toggleRadius: toggleStyles.borderTopLeftRadius,
        toggleBackground: toggleStyles.backgroundColor,
        toggleColor: toggleStyles.color,
        toggleFont: toggleStyles.fontFamily,
      };
    });
    assert.equal(mobileClosedStyles.menuRadius, await resolveToken(page, 'border-radius', '--muxui-semantic-control-radius'));
    assert.equal(mobileClosedStyles.menuBackground, await resolveToken(page, 'background-color', '--muxui-semantic-surface-background'));
    assert.equal(mobileClosedStyles.toggleRadius, await resolveToken(page, 'border-radius', '--muxui-semantic-control-radius'));
    assert.equal(mobileClosedStyles.toggleBackground, await resolveToken(page, 'background-color', '--muxui-semantic-surface-background'));
    assert.match(mobileClosedStyles.toggleFont, /Inter/u);
    await mobileTocSummary.click();
    const mobileOpenStyles = await page.locator('#starlight__mobile-toc .dropdown').evaluate((node) => {
      const styles = getComputedStyle(node);
      return { background: styles.backgroundColor, radius: styles.borderTopLeftRadius, bottomRadius: styles.borderBottomLeftRadius, shadow: styles.boxShadow };
    });
    assert.equal(mobileOpenStyles.background, await resolveToken(page, 'background-color', '--muxui-semantic-surface-canvas'));
    assert.equal(mobileOpenStyles.bottomRadius, await resolveToken(page, 'border-radius', '--muxui-semantic-shape-container-radius'));
    assert.equal(mobileOpenStyles.shadow, await resolveToken(page, 'box-shadow', '--muxui-semantic-elevation-floating'));
    await screenshot(page, 'theme-b-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${url}/scale/`);
    await waitForScale(page);
    await page.locator('starlight-theme-select select').first().selectOption('dark');
    await page.waitForFunction(() => document.querySelector('.scale-app')?.dataset.muxuiColorScheme === 'dark');
    await page.getByRole('button', { name: 'Reset draft', exact: true }).click();
    assert.equal(await page.locator('.scale-app').getAttribute('data-muxui-color-scheme'), 'dark');
    await page.getByRole('button', { name: 'Reset applied', exact: true }).click();
    await page.getByText('Site theme reset to defaults. Draft remains available.', { exact: true }).waitFor();
    assert.equal(await page.locator('#muxui-applied-theme').count(), 0);
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('muxui-applied-theme')), false);
    const resetBrand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim());
    const resetShellBackground = await page.evaluate(() => getComputedStyle(document.querySelector('.header')).backgroundColor);
    assert.notEqual(resetBrand, appliedBrand);
    assert.notEqual(resetShellBackground, appliedShellBackground);
    await themeSelect.selectOption('dark');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('muxui-applied-theme')), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--muxui-reference-color-brand-60').trim()), resetBrand);
    await page.evaluate(() => localStorage.setItem('muxui-scale:applied:v1', '{malformed'));
    await page.reload();
    await waitForScale(page);
    await page.getByRole('alert').filter({ hasText: 'Saved site theme rejected' }).waitFor();
    await page.evaluate(() => {
      const oldValue = localStorage.getItem('muxui-scale:applied:v1');
      localStorage.removeItem('muxui-scale:applied:v1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'muxui-scale:applied:v1', oldValue, newValue: null, storageArea: localStorage }));
    });
    await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes('Saved site theme rejected'));
    assert.equal(await page.locator('#muxui-applied-theme').count(), 0);
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('muxui-applied-theme')), false);

    const restricted = createScaleDocument({ ...DEFAULT_SETTINGS }, { slug: 'restricted-motion' });
    restricted.modes = { colorScheme: ['light', 'dark'], contrast: ['standard', 'more'], motion: ['full'], density: ['comfortable', 'compact'], direction: ['ltr', 'rtl'] };
    const restrictedContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(`${url}/scale/`);
    await restrictedPage.evaluate((value) => localStorage.setItem('muxui-scale:applied:v1', JSON.stringify(value)), restricted);
    await restrictedPage.reload();
    await waitForScale(restrictedPage);
    await restrictedPage.getByRole('alert').filter({ hasText: 'motion' }).waitFor();
    await restrictedPage.locator('input[type=file]').setInputFiles({ name: 'restricted-motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restricted)) });
    await restrictedPage.getByRole('status').filter({ hasText: 'preview unavailable' }).waitFor();
    assert.equal(await restrictedPage.locator('[data-muxui-scale-theme]').count(), 0);
    assert.equal(await restrictedPage.locator('.scale-app').getAttribute('data-muxui-motion'), null);
    assert.equal(await restrictedPage.locator('.preview-canvas').count(), 0);
    await restrictedContext.close();

    const unavailableContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await unavailableContext.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
    });
    const unavailablePage = await unavailableContext.newPage();
    await unavailablePage.goto(`${url}/scale/`);
    await waitForScale(unavailablePage);
    await unavailablePage.getByRole('button', { name: 'Apply to site', exact: true }).click();
    await unavailablePage.getByRole('status').filter({ hasText: 'page only' }).waitFor();
    await unavailableContext.close();

    await page.setViewportSize({ width: 360, height: 780 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await screenshot(page, 'scale-mobile');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});
