// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { muxTokenPathTransformer } from './src/components/code-theme.ts';

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const themePrepaintBundle = buildSync({
	entryPoints: [resolve(fileURLToPath(new URL('.', import.meta.url)), 'src/theme-prepaint-entry.mjs')],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'es2022',
	minify: true,
	write: false,
}).outputFiles[0].text;

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

const componentSidebar = [];
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
	for (const { id, name } of componentInventory.data.items ?? []) {
		componentSidebar.push({
			label: name,
			link: `/components/${id.slice(id.lastIndexOf(':') + 1)}/`,
		});
	}
	if (componentInventory.meta.truncated && componentInventory.meta.nextCursor === null) {
		throw new Error('Mux UI component inventory was truncated without a continuation cursor.');
	}
	componentCursor = componentInventory.meta.nextCursor ?? undefined;
} while (componentCursor !== undefined);

const foundationSidebar = [
	{ label: 'Overview', link: '/foundations/' },
	{ label: 'Reference tokens', link: '/foundations/reference-tokens/' },
	{ label: 'Semantic tokens', link: '/foundations/semantic-tokens/' },
	{ label: 'Colour', link: '/foundations/colour/' },
	{ label: 'Typography', link: '/foundations/typography/' },
	{ label: 'Spacing', link: '/foundations/spacing/' },
	{ label: 'Shape', link: '/foundations/shape/' },
	{ label: 'Elevation', link: '/foundations/elevation/' },
	{ label: 'Motion', link: '/foundations/motion/' },
	{ label: 'Component tokens', link: '/foundations/component-tokens/' },
];

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [{
			name: 'muxui-theme-prepaint',
			configureServer(server) {
				server.middlewares.use((request, response, next) => {
					if (request.url !== '/_muxui/theme-prepaint.js') return next();
					response.statusCode = 200;
					response.setHeader('content-type', 'application/javascript; charset=utf-8');
					response.end(themePrepaintBundle);
				});
			},
			generateBundle() {
				this.emitFile({ type: 'asset', fileName: '_muxui/theme-prepaint.js', source: themePrepaintBundle });
			},
		}],
		resolve: {
			alias: [
				{ find: /^@muxui\/react\/styles\.css$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/styles.css') },
				{ find: /^@muxui\/react\/markdown$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/markdown.mjs') },
				{ find: /^@muxui\/react\/text-editor$/u, replacement: resolve(repositoryRoot, 'packages/react/generated/text-editor.mjs') },
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
			expressiveCode: {
				shiki: { transformers: [muxTokenPathTransformer] },
			},
			customCss: ['./src/styles/mux-docs.css'],
			sidebar: [
				{ label: 'Home', slug: 'index' },
				{ label: 'Installation', link: '/installation/' },
				{ label: 'Themes & tokens', link: '/themes/' },
				{ label: 'Foundations', items: foundationSidebar },
				{ label: 'Scale', link: '/scale/' },
				{ label: 'Accessibility', link: '/accessibility/' },
				{ label: 'Discovery & CLI', link: '/discovery/' },
				{ label: 'Lifecycle', link: '/lifecycle/' },
				{ label: 'Authoring', link: '/contribution/' },
				{ label: 'Components', items: componentSidebar },
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
