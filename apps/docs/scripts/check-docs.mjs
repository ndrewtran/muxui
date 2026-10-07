import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { authoredPatternReference } from './authored-pattern-reference.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsRoot = resolve(repositoryRoot, 'apps/docs');
const canonicalCatalog = createRequire(import.meta.url)('@muxui/catalog');
const { executeCommand, parseCliArguments } = createRequire(import.meta.url)('@muxui/tooling');
const { commandRegistry } = createRequire(import.meta.url)('@muxui/tooling/registry');

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
const commandPalette = components.find(({ id }) => id === 'muxui:component:command-palette');
assert(commandPalette?.name === 'CommandPalette', 'The admitted CommandPalette component is missing from the docs inventory.');
assert(slugs.includes('command-palette'), 'The admitted CommandPalette docs route is missing from the component inventory.');

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

const discoveryGuide = guides.find(({ id }) => id === 'muxui:guide:discovery');
assert(discoveryGuide !== undefined, 'The canonical Discovery & CLI guide is missing from the guide inventory.');
const discoverySource = discoveryGuide.source?.content;
assert(typeof discoverySource === 'string' && discoverySource.length > 0, 'The canonical Discovery & CLI guide has no source path.');
const discoveryText = readFileSync(resolve(repositoryRoot, discoverySource), 'utf8');
const commandExamples = new Set(commandRegistry.commands.flatMap(({ examples }) => examples));
const discoveryCommands = [...discoveryText.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/gu)]
	.flatMap(([, block]) => block.split('\n').map((line) => line.trim()).filter(Boolean));
assert(discoveryCommands.length > 0, 'The canonical Discovery & CLI guide has no shell examples.');
const discoveredCommandNames = new Set();
for (const commandLine of discoveryCommands) {
	assert(commandExamples.has(commandLine), `The Discovery & CLI guide contains a command absent from the canonical CLI registry: ${commandLine}`);
	const tokens = commandLine.split(/\s+/u);
	assert(tokens.shift() === 'muxui', `The Discovery & CLI guide command must begin with muxui: ${commandLine}`);
	const parsed = parseCliArguments(tokens);
	assert(parsed.kind === 'command' && parsed.error === undefined, `The Discovery & CLI guide command failed canonical parsing: ${commandLine}`);
	discoveredCommandNames.add(parsed.command);
	const output = executeCommand(parsed.command, parsed.request, canonicalCatalog);
	const definition = commandRegistry.commands.find(({ name }) => name === parsed.command);
	assert(definition !== undefined, `The parsed Discovery & CLI command is absent from the canonical CLI registry: ${commandLine}`);
	assert(
		typeof output === 'object'
			&& output !== null
			&& !Array.isArray(output)
			&& output.type !== 'error'
			&& (output.type === definition.responseType || (parsed.command === 'get' && output.type === 'artifact.detail.section-page')),
		`The Discovery & CLI guide command did not return its canonical success envelope: ${commandLine}`,
	);
}
for (const { name } of commandRegistry.commands) {
	assert(discoveredCommandNames.has(name), `The Discovery & CLI guide does not demonstrate canonical CLI command ${name}.`);
}

const missing = canonicalCatalog.getArtifact({
	id: 'muxui:component:does-not-exist',
	platform: 'web.react',
	detail: 'full',
});
assert(missing.type === 'error', 'An unknown component query did not return a canonical error.');

const sourceStyle = readFileSync(resolve(docsRoot, 'src/styles/mux-docs.css'), 'utf8');
const authoredStyles = ['mux-docs.css', 'blocks.css', 'blocks-preview.css']
	.map((file) => [file, readFileSync(resolve(docsRoot, 'src/styles', file), 'utf8')]);
for (const [file, css] of authoredStyles) {
	assert(!/(?:#[0-9a-f]{3,8}\b|rgba?\()/iu.test(css), `Authored docs CSS ${file} contains a raw color value.`);
}
assert(sourceStyle.includes("@import '@muxui/react/styles.css';"), 'Docs CSS does not import the generated Mux UI stylesheet.');
assert(authoredStyles.find(([file]) => file === 'blocks-preview.css')[1].includes("@import '@muxui/react/styles.css';"), 'Block preview CSS does not import the generated Mux UI stylesheet.');
const generatedMuxStyles = readFileSync(resolve(repositoryRoot, 'packages/react/generated/styles.css'), 'utf8');
const generatedMuxVariables = new Set([...generatedMuxStyles.matchAll(/(--muxui-[a-z0-9-]+)\s*:/giu)].map(([, name]) => name));
for (const [file, css] of authoredStyles) {
	const referencedMuxVariables = new Set([...css.matchAll(/var\(\s*(--muxui-[a-z0-9-]+)/giu)].map(([, name]) => name));
	assert([...referencedMuxVariables].every((name) => generatedMuxVariables.has(name)), `Docs CSS ${file} references a Mux UI variable missing from the generated stylesheet.`);
}

const routeSource = readFileSync(resolve(docsRoot, 'src/pages/components/[slug].astro'), 'utf8');
assert(routeSource.includes('getComponentPage') && routeSource.includes('<ExampleHost'), 'Component pages are not backed by the catalog route and executable example host.');
assert(routeSource.includes('id="basic"') && routeSource.includes('id="api-reference"'), 'Component page anchors are incomplete.');

// The Blocks section is a projection: no pattern, variant, or example fact may be authored in the docs app.
const blockPatterns = [];
let blockCursor;
do {
	const response = canonicalCatalog.listArtifacts({ kind: 'pattern', platform: 'web.react', detail: 'brief', limit: 100, ...(blockCursor === undefined ? {} : { cursor: blockCursor }) });
	assert(response.type === 'artifact.list', 'The canonical pattern inventory query failed.');
	blockPatterns.push(...response.data.items);
	assert(!response.meta.truncated || response.meta.nextCursor !== null, 'The canonical pattern inventory was truncated without a cursor.');
	blockCursor = response.meta.nextCursor ?? undefined;
} while (blockCursor !== undefined);
const docsSourceFiles = readdirSync(resolve(docsRoot, 'src'), { recursive: true })
	.filter((file) => /\.(?:astro|mjs|ts|tsx)$/u.test(file));
for (const file of docsSourceFiles) {
	const text = readFileSync(resolve(docsRoot, 'src', file), 'utf8');
	for (const { id } of blockPatterns) {
		const reference = authoredPatternReference(text, id);
		assert(reference === null, `The docs source ${file} authors the pattern ${id} as ${reference}; Blocks data must come from the catalog.`);
	}
}
for (const route of ['index.astro', '[pattern]/index.astro', '[pattern]/[variant]/index.astro', '[pattern]/[variant]/preview.astro', 'filter-index.json.ts']) {
	assert(existsSync(resolve(docsRoot, 'src/pages/blocks', route)), `The Blocks route source is missing: ${route}.`);
}
const previewSource = readFileSync(resolve(docsRoot, 'src/pages/blocks/[pattern]/[variant]/preview.astro'), 'utf8');
assert(previewSource.includes('<ExampleHost') && previewSource.includes('assertExampleSource'), 'Block previews are not backed by the canonical example host.');
for (const pattern of blockPatterns) {
	const examples = canonicalCatalog.getArtifact({ id: pattern.id, platform: 'web.react', detail: 'compact', section: 'examples' });
	assert(examples.type === 'artifact.detail' && (examples.data.value ?? []).length > 0, `The enabled pattern ${pattern.id} has no variant example.`);
	for (const example of examples.data.value) {
		const sourcePath = resolve(repositoryRoot, example.source.content);
		assert(sourcePath.startsWith(`${repositoryRoot}/catalog/patterns/`) && existsSync(sourcePath), `The variant ${example.id} source is missing or outside the pattern catalog.`);
		assert(readFileSync(sourcePath, 'utf8') === example.code, `The variant ${example.id} catalog source differs from its file.`);
		assert([...example.code.matchAll(/^\s*export\s+(?:function|const|default)\b/gmu)].length === 1, `The variant ${example.id} must declare exactly one executable export.`);
	}
}

console.log(`Docs contract passed: ${components.length} enabled web.react component pages, ${guides.length} canonical guides, and ${components.reduce((count, component) => count + (canonicalCatalog.getArtifact({ id: component.id, platform: 'web.react', detail: 'full', section: 'examples' }).data.value?.length ?? 0), 0)} canonical examples, and ${blockPatterns.length} enabled block ${blockPatterns.length === 1 ? 'pattern' : 'patterns'}.`);
