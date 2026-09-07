import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsRoot = resolve(repositoryRoot, 'apps/docs');
const canonicalCatalog = createRequire(import.meta.url)('@muxui/catalog');

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function listComponents() {
	const components = [];
	let cursor;
	do {
		const response = canonicalCatalog.listArtifacts({
			kind: 'component',
			platform: 'web.react',
			detail: 'brief',
			limit: 100,
			...(cursor === undefined ? {} : { cursor }),
		});
		assert(response.type === 'artifact.list', 'The canonical component inventory query failed.');
		components.push(...response.data.items);
		assert(!response.meta.truncated || response.meta.nextCursor !== null, 'The canonical component inventory was truncated without a cursor.');
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return components;
}

function listGuides() {
	const guides = [];
	let cursor;
	do {
		const response = canonicalCatalog.listArtifacts({
			kind: 'guide',
			platform: 'web.react',
			detail: 'brief',
			limit: 100,
			...(cursor === undefined ? {} : { cursor }),
		});
		assert(response.type === 'artifact.list', 'The canonical guide inventory query failed.');
		guides.push(...response.data.items);
		assert(!response.meta.truncated || response.meta.nextCursor !== null, 'The canonical guide inventory was truncated without a cursor.');
		cursor = response.meta.nextCursor ?? undefined;
	} while (cursor !== undefined);
	return guides;
}

const components = listComponents();
const guides = listGuides();
const slugs = components.map(({ id }) => id.slice(id.lastIndexOf(':') + 1));
assert(new Set(slugs).size === slugs.length, 'The canonical component inventory contains duplicate route slugs.');
assert(slugs.every((slug) => slug.length > 0 && !slug.includes(':')), 'The canonical component inventory contains an invalid route slug.');

for (const component of components) {
	const response = canonicalCatalog.getArtifact({
		id: component.id,
		platform: 'web.react',
		detail: 'full',
		section: 'examples',
	});
	assert(response.type === 'artifact.detail', `Could not retrieve examples for ${component.id}.`);
	const examples = response.data.value ?? [];
	assert(examples.length > 0, `The enabled component ${component.id} has no executable React example.`);
	for (const example of examples) {
		const source = example.source?.content;
		assert(typeof source === 'string' && source.length > 0, `The example ${example.id} has no canonical source path.`);
		const sourcePath = resolve(repositoryRoot, source);
		assert(sourcePath.startsWith(`${repositoryRoot}/catalog/components/`), `The example ${example.id} points outside the canonical component catalog.`);
		assert(existsSync(sourcePath), `The example ${example.id} source is missing: ${source}.`);
		const sourceText = readFileSync(sourcePath, 'utf8');
		const executableExports = [...sourceText.matchAll(/^\s*export\s+(?:function|const|default)\b/gmu)];
		assert(executableExports.length === 1, `The example ${example.id} must declare exactly one executable export.`);
	}
}

for (const guide of guides) {
	const source = guide.source?.content;
	assert(typeof source === 'string' && source.length > 0, `The guide ${guide.id} has no canonical source path.`);
	const sourcePath = resolve(repositoryRoot, source);
	assert(sourcePath.startsWith(`${repositoryRoot}/catalog/guides/`), `The guide ${guide.id} points outside the canonical guide catalog.`);
	assert(existsSync(sourcePath), `The guide ${guide.id} source is missing: ${source}.`);
	const sourceText = readFileSync(sourcePath, 'utf8');
	assert(sourceText.trim().length > 0, `The guide ${guide.id} source is empty.`);
	if (guide.source.contentDigest !== undefined) {
		assert(`sha256:${createHash('sha256').update(sourceText).digest('hex')}` === guide.source.contentDigest, `The guide ${guide.id} source digest is stale.`);
	}
}

const missing = canonicalCatalog.getArtifact({
	id: 'muxui:component:does-not-exist',
	platform: 'web.react',
	detail: 'full',
});
assert(missing.type === 'error', 'An unknown component query did not return a canonical error.');

const sourceStyle = readFileSync(resolve(docsRoot, 'src/styles/mux-docs.css'), 'utf8');
assert(!/(?:#[0-9a-f]{3,8}\b|rgba?\()/iu.test(sourceStyle), 'Authored docs CSS contains a raw color value.');
assert(sourceStyle.includes("@import '@muxui/react/styles.css';"), 'Docs CSS does not import the generated Mux UI stylesheet.');
const generatedMuxStyles = readFileSync(resolve(repositoryRoot, 'packages/react/generated/styles.css'), 'utf8');
const generatedMuxVariables = new Set([...generatedMuxStyles.matchAll(/(--muxui-[a-z0-9-]+)\s*:/giu)].map(([, name]) => name));
const referencedMuxVariables = new Set([...sourceStyle.matchAll(/var\(\s*(--muxui-[a-z0-9-]+)/giu)].map(([, name]) => name));
assert([...referencedMuxVariables].every((name) => generatedMuxVariables.has(name)), 'Docs CSS references a Mux UI variable missing from the generated stylesheet.');

const routeSource = readFileSync(resolve(docsRoot, 'src/pages/components/[slug].astro'), 'utf8');
assert(routeSource.includes('getComponentPage') && routeSource.includes('<ExampleHost'), 'Component pages are not backed by the catalog route and executable example host.');
assert(routeSource.includes('id="basic"') && routeSource.includes('id="api-reference"'), 'Component page anchors are incomplete.');

console.log(`Docs contract passed: ${components.length} enabled web.react component pages, ${guides.length} canonical guides, and ${components.reduce((count, component) => count + (canonicalCatalog.getArtifact({ id: component.id, platform: 'web.react', detail: 'full', section: 'examples' }).data.value?.length ?? 0), 0)} canonical examples.`);
