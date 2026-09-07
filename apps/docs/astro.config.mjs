// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

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

// https://astro.build/config
export default defineConfig({
	vite: {
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
			customCss: ['./src/styles/mux-docs.css'],
			sidebar: [
				{ label: 'Home', slug: 'index' },
				{ label: 'Installation', link: '/installation/' },
				{ label: 'Themes & tokens', link: '/themes/' },
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
			},
		}),
	],
});
