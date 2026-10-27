// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { buildSync } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { muxTokenPathTransformer } from './src/components/code-theme.ts';
import { FOUNDATION_OVERVIEW, FOUNDATION_PAGES } from './src/lib/foundation-pages.ts';
import { groupComponentNavigation } from '../component-navigation.mjs';
import { componentRecordCategory } from './src/lib/component-categories.ts';

const docsRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const repositoryRoot = resolve(docsRoot, '../..');

// The Blocks layout sits outside Starlight's page, so it loads the foundation sheets Starlight's Page loads.
// @astrojs/starlight 0.42.0 exports only `style/markdown.css`; its layers, props, reset, and util sheets sit
// beside it. Resolve the directory from that export and fail loudly if an upgrade moves or drops a sheet.
const starlightStyleDirectory = dirname(createRequire(import.meta.url).resolve('@astrojs/starlight/style/markdown.css'));
for (const sheet of ['layers.css', 'props.css', 'reset.css', 'util.css']) {
	if (!existsSync(resolve(starlightStyleDirectory, sheet))) {
		throw new Error(`@astrojs/starlight no longer ships style/${sheet} beside style/markdown.css (pinned at 0.42.0). Update the starlight-style alias in astro.config.mjs and the imports in BlocksLayout.astro.`);
	}
}
// Browser scripts the docs serve as static files under /_muxui/, each built once from its source. A page that loads one of them with a script tag
// carries a line, not a copy of the script, and the browser caches the file across pages. A script with a `version` is served at a URL that
// names its content (`/_muxui/styling-measure.<hash of the script>.js`), so a page and the script it was built with can never be paired with
// another build's copy from a cache: the page reads its URL from the `virtual:muxui-served-scripts` module below.
const servedScripts = Object.entries({
	'theme-prepaint': { entry: 'src/theme-prepaint-entry.mjs', version: false },
	'styling-measure': { entry: 'src/components/styling/styling-measure.ts', version: true },
}).map(([name, { entry, version }]) => {
	const source = buildSync({
		entryPoints: [resolve(docsRoot, entry)],
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2022',
		minify: true,
		write: false,
	}).outputFiles[0].text;
	return { name, source, url: `/_muxui/${name}${version ? `.${createHash('sha256').update(source).digest('hex').slice(0, 12)}` : ''}.js` };
});
const servedScriptsModule = 'virtual:muxui-served-scripts';
const stylingMeasureUrl = servedScripts.find(({ name }) => name === 'styling-measure')?.url;
if (stylingMeasureUrl === undefined) throw new Error('astro.config.mjs no longer builds the Styling page script');

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is { listArtifacts: (request: Record<string, unknown>) => unknown }} */
function isCatalog(value) {
	return isRecord(value) && typeof value.listArtifacts === 'function';
}

/** @param {unknown} value @returns {value is { type: 'artifact.list', data: { items: Array<{ id: string, name: string }> }, meta: { nextCursor: string | null, truncated: boolean } }} */
function isComponentInventory(value) {
	if (!isRecord(value) || value.type !== 'artifact.list' || !isRecord(value.data) || !Array.isArray(value.data.items) || !isRecord(value.meta)) return false;
	return value.data.items.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string')
		&& (value.meta.nextCursor === null || typeof value.meta.nextCursor === 'string')
		&& typeof value.meta.truncated === 'boolean';
}

/** @type {unknown} */
const loadedCatalog = createRequire(import.meta.url)('@muxui/catalog');
if (!isCatalog(loadedCatalog)) {
	throw new Error('Mux UI docs could not load the canonical catalog query API.');
}
const listArtifacts = loadedCatalog.listArtifacts;

const componentItems = [];
let componentCursor;
do {
	const componentInventory = listArtifacts({
		kind: 'component',
		platform: 'web.react',
		detail: 'brief',
		limit: 100,
		...(componentCursor === undefined ? {} : { cursor: componentCursor }),
	});
	if (!isComponentInventory(componentInventory)) {
		throw new Error('Mux UI docs could not resolve the complete React component inventory.');
	}
	componentItems.push(...componentInventory.data.items);
	if (componentInventory.meta.truncated && componentInventory.meta.nextCursor === null) {
		throw new Error('Mux UI component inventory was truncated without a continuation cursor.');
	}
	componentCursor = componentInventory.meta.nextCursor ?? undefined;
} while (componentCursor !== undefined);
const componentSidebar = groupComponentNavigation(componentItems, ({ id }) => componentRecordCategory(id.slice(id.lastIndexOf(':') + 1)))
	.map(({ label, items }) => ({
		label,
		items: items.map(({ id, name }) => ({ label: name, link: `/components/${id.slice(id.lastIndexOf(':') + 1)}/` })),
	}));

const foundationSidebar = [
	{ label: FOUNDATION_OVERVIEW.label, link: '/foundations/' },
	...FOUNDATION_PAGES.map(({ label, slug }) => ({ label, link: `/foundations/${slug}/` })),
];

// https://astro.build/config
export default defineConfig({
	devToolbar: { enabled: false },
	vite: {
		plugins: [{
			name: 'muxui-served-scripts',
			resolveId(id) {
				return id === servedScriptsModule ? `\0${servedScriptsModule}` : undefined;
			},
			load(id) {
				return id === `\0${servedScriptsModule}` ? `export const stylingMeasureUrl = ${JSON.stringify(stylingMeasureUrl)};` : undefined;
			},
			configureServer(server) {
				server.middlewares.use((request, response, next) => {
					const served = servedScripts.find(({ url }) => url === request.url);
					if (served === undefined) return next();
					response.statusCode = 200;
					response.setHeader('content-type', 'application/javascript; charset=utf-8');
					response.end(served.source);
				});
			},
			generateBundle() {
				for (const { url, source } of servedScripts) this.emitFile({ type: 'asset', fileName: url.slice(1), source });
			},
		}],
		resolve: {
			alias: [
				{ find: /^starlight-style\//u, replacement: `${starlightStyleDirectory}/` },
				{ find: /^@muxui\/react\/styles\.css$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/styles.css') },
				{ find: /^@muxui\/react\/compatibility$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/compatibility.mjs') },
				{ find: /^@muxui\/react\/markdown$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/markdown.js') },
				{ find: /^@muxui\/react\/text-editor$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/text-editor.js') },
				{ find: '@muxui/react', replacement: resolve(repositoryRoot, 'packages/react/generated/index.mjs') },
			],
		},
		ssr: {
			external: true,
		},
	},
	integrations: [
		react(),
		starlight({
			title: 'Mux UI',
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 6 },
			expressiveCode: {
				shiki: { transformers: [muxTokenPathTransformer] },
				plugins: [{
					name: 'muxui-dark-code-blocks',
					hooks: {
						postprocessRenderedBlockGroup({ renderData }) {
							// Keep syntax highlighting and Mux tokens in the same local dark scope.
							renderData.groupAst.properties['data-theme'] = 'dark';
							renderData.groupAst.properties['data-muxui-color-scheme'] = 'dark';
						},
					},
				}],
			},
			customCss: ['./src/styles/mux-docs.css'],
			routeMiddleware: './src/starlight-route-data.ts',
			sidebar: [
				{ label: 'Home', slug: 'index' },
				{ label: 'Installation', link: '/installation/' },
				{ label: 'Package exports', link: '/package-exports/' },
				{ label: 'Themes & tokens', link: '/themes/' },
				{ label: 'Token migration', link: '/token-migration/' },
				{ label: 'Foundations', items: foundationSidebar },
				{ label: 'Scale', link: '/scale/' },
				{ label: 'Accessibility', link: '/accessibility/' },
				{ label: 'Control sizing', link: '/control-sizing/' },
				{ label: 'Discovery & CLI', link: '/discovery/' },
				{ label: 'Lifecycle', link: '/lifecycle/' },
				{ label: 'Authoring', link: '/contribution/' },
				...componentSidebar,
			],
			components: {
				Header: './src/components/Header.astro',
				SiteTitle: './src/components/SiteTitle.astro',
				Sidebar: './src/components/Sidebar.astro',
				PageTitle: './src/components/PageTitle.astro',
				TwoColumnContent: './src/components/TwoColumnContent.astro',
				ThemeProvider: './src/components/ThemeProvider.astro',
			},
		}),
	],
});
