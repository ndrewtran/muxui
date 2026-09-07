import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface CatalogSummary {
	id: string;
	kind: 'component';
	name: string;
	summary: string;
	lifecycle: string;
	platforms: readonly string[];
	source: { record: string };
}

export interface CatalogGuide {
	id: string;
	kind: 'guide';
	name: string;
	summary: string;
	lifecycle: string;
	platforms: readonly string[];
	keywords: readonly string[];
	source: { content: string; record: string; contentDigest?: string };
	content: string;
}

interface CatalogIntent {
	useWhen?: readonly string[];
	avoidWhen?: readonly string[];
}

export interface CatalogBinding {
	api: {
		props: readonly string[];
		events: readonly string[];
		parts: readonly string[];
		defaults: Readonly<Record<string, unknown>>;
	};
	behavior?: readonly string[];
	accessibility?: readonly string[];
	lifecycle: string;
	strategy: string;
}

export interface CatalogArtifact extends CatalogSummary {
	intent?: CatalogIntent;
	states: readonly string[];
	anatomy: readonly string[];
	accessibility: { nameRequired: boolean; obligations: readonly string[] };
	bindings: Readonly<Record<string, CatalogBinding>>;
}

export interface CatalogExample {
	id: string;
	kind: 'example';
	name: string;
	summary: string;
	lifecycle: string;
	platforms: readonly string[];
	source: { content: string; record: string; contentDigest?: string };
}

interface CatalogModule {
	getArtifact(request: Record<string, unknown>): unknown;
	listArtifacts(request: Record<string, unknown>): unknown;
}

interface CatalogListResponse {
	type: 'artifact.list';
	data: { items: readonly unknown[] };
	meta: { nextCursor: string | null; truncated: boolean };
}

interface CatalogDetailResponse {
	type: 'artifact.detail';
	data: { artifact?: unknown; relations?: readonly unknown[]; value?: readonly unknown[] };
}

const loadedCatalog: unknown = createRequire(import.meta.url)('@muxui/catalog');

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCatalogModule(value: unknown): value is CatalogModule {
	return isRecord(value)
		&& typeof value.getArtifact === 'function'
		&& typeof value.listArtifacts === 'function';
}

if (!isCatalogModule(loadedCatalog)) {
	throw new Error('Mux UI docs could not load the canonical catalog query API.');
}

const catalog = loadedCatalog;

function isCanonicalRepositoryRoot(candidate: string): boolean {
	return existsSync(resolve(candidate, 'catalog'))
		&& existsSync(resolve(candidate, 'packages/catalog/package.json'));
}

const configuredRepositoryRoot = process.env.MUXUI_REPOSITORY_ROOT;
const repositoryCandidates = [
	configuredRepositoryRoot === undefined ? undefined : resolve(configuredRepositoryRoot),
	resolve(process.cwd(), '../..'),
	resolve(import.meta.dirname, '../../../../'),
	resolve(import.meta.dirname, '../../../../../'),
	resolve(process.cwd()),
].filter((candidate): candidate is string => candidate !== undefined);
const repositoryRoot = repositoryCandidates.find(isCanonicalRepositoryRoot);

if (!repositoryRoot) {
	throw new Error('Mux UI docs could not locate the canonical catalog sources. Set MUXUI_REPOSITORY_ROOT to the repository root when running from a generated output directory.');
}
export const canonicalRepositoryRoot = repositoryRoot;

function requiredString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Canonical catalog response is missing ${field}.`);
	}
	return value;
}

function stringArray(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new Error(`Canonical catalog response has an invalid ${field}.`);
	}
	return Object.freeze([...value]);
}

function readSummary(value: unknown, expectedKind: CatalogSummary['kind'] | CatalogExample['kind']): CatalogSummary | CatalogExample {
	if (!isRecord(value) || value.kind !== expectedKind) {
		throw new Error(`Canonical catalog response has an invalid ${expectedKind} summary.`);
	}
	const source = isRecord(value.source) ? value.source : undefined;
	if (!source) throw new Error('Canonical catalog response is missing an example or artifact source.');
	const base = {
		id: requiredString(value.id, 'id'),
		name: requiredString(value.name, 'name'),
		summary: requiredString(value.summary, 'summary'),
		lifecycle: requiredString(value.lifecycle, 'lifecycle'),
		platforms: stringArray(value.platforms, 'platforms'),
	};
	if (expectedKind === 'component') {
		return Object.freeze({
			...base,
			kind: 'component' as const,
			source: { record: requiredString(source.record, 'source.record') },
		});
	}
	return Object.freeze({
		...base,
		kind: 'example' as const,
		source: {
			content: requiredString(source.content, 'source.content'),
			record: requiredString(source.record, 'source.record'),
			...(source.contentDigest === undefined ? {} : { contentDigest: requiredString(source.contentDigest, 'source.contentDigest') }),
		},
	});
}

function readComponentSummary(value: unknown): CatalogSummary {
	const summary = readSummary(value, 'component');
	if (summary.kind !== 'component') throw new Error('Canonical catalog returned a non-component summary.');
	return summary;
}

function readExampleSummary(value: unknown): CatalogExample {
	const summary = readSummary(value, 'example');
	if (summary.kind !== 'example') throw new Error('Canonical catalog returned a non-example summary.');
	return summary;
}

function readGuideSummary(value: unknown): Omit<CatalogGuide, 'keywords' | 'content'> {
	if (!isRecord(value) || value.kind !== 'guide' || !isRecord(value.source)) {
		throw new Error('Canonical catalog response has an invalid guide summary.');
	}
	return Object.freeze({
		id: requiredString(value.id, 'id'),
		kind: 'guide' as const,
		name: requiredString(value.name, 'name'),
		summary: requiredString(value.summary, 'summary'),
		lifecycle: requiredString(value.lifecycle, 'lifecycle'),
		platforms: stringArray(value.platforms, 'platforms'),
		source: {
			content: requiredString(value.source.content, 'guide.source.content'),
			record: requiredString(value.source.record, 'guide.source.record'),
			...(value.source.contentDigest === undefined ? {} : { contentDigest: requiredString(value.source.contentDigest, 'guide.source.contentDigest') }),
		},
	});
}

function readGuide(value: unknown, summary: Omit<CatalogGuide, 'keywords' | 'content'>): CatalogGuide {
	if (!isRecord(value) || value.kind !== 'guide') {
		throw new Error(`Canonical guide ${summary.id} has an invalid detail response.`);
	}
	const keywords = stringArray(value.keywords, 'guide.keywords');
	const sourcePath = resolve(canonicalRepositoryRoot, summary.source.content);
	if (!sourcePath.startsWith(`${canonicalRepositoryRoot}/catalog/guides/`) || !existsSync(sourcePath)) {
		throw new Error(`Canonical guide ${summary.id} points to a missing source: ${summary.source.content}.`);
	}
	const content = readFileSync(sourcePath, 'utf8');
	if (summary.source.contentDigest !== undefined) {
		const contentDigest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
		if (contentDigest !== summary.source.contentDigest) {
			throw new Error(`Canonical guide ${summary.id} source content does not match its catalog digest.`);
		}
	}
	return Object.freeze({
		...summary,
		keywords,
		content,
	});
}

function listResponse(value: unknown): CatalogListResponse {
	if (!isRecord(value) || value.type !== 'artifact.list' || !isRecord(value.data) || !Array.isArray(value.data.items) || !isRecord(value.meta)) {
		throw new Error('Mux UI docs received an unexpected component inventory response.');
	}
	if ((value.meta.nextCursor !== null && typeof value.meta.nextCursor !== 'string') || typeof value.meta.truncated !== 'boolean') {
		throw new Error('Mux UI docs received invalid component inventory pagination metadata.');
	}
	return {
		type: 'artifact.list',
		data: { items: value.data.items },
		meta: { nextCursor: value.meta.nextCursor, truncated: value.meta.truncated },
	};
}

function detailResponse(value: unknown): CatalogDetailResponse {
	if (!isRecord(value) || value.type !== 'artifact.detail' || !isRecord(value.data)) {
		throw new Error('Mux UI docs received an unexpected artifact detail response.');
	}
	const relations = value.data.relations;
	const examples = value.data.value;
	if (relations !== undefined && !Array.isArray(relations)) {
		throw new Error('Mux UI docs received invalid artifact relations.');
	}
	if (examples !== undefined && !Array.isArray(examples)) {
		throw new Error('Mux UI docs received invalid artifact examples.');
	}
	return {
		type: 'artifact.detail',
		data: {
			artifact: value.data.artifact,
			relations,
			value: examples,
		},
	};
}

function readBinding(value: unknown): CatalogBinding {
	if (!isRecord(value) || !isRecord(value.api)) {
		throw new Error('Canonical artifact is missing its React binding API.');
	}
	const defaults = value.api.defaults;
	if (!isRecord(defaults)) throw new Error('Canonical React binding is missing API defaults.');
	return Object.freeze({
		api: Object.freeze({
			props: stringArray(value.api.props, 'binding.api.props'),
			events: stringArray(value.api.events, 'binding.api.events'),
			parts: stringArray(value.api.parts, 'binding.api.parts'),
			defaults: Object.freeze({ ...defaults }),
		}),
		...(value.behavior === undefined ? {} : { behavior: stringArray(value.behavior, 'binding.behavior') }),
		...(value.accessibility === undefined ? {} : { accessibility: stringArray(value.accessibility, 'binding.accessibility') }),
		lifecycle: requiredString(value.lifecycle, 'binding.lifecycle'),
		strategy: requiredString(value.strategy, 'binding.strategy'),
	});
}

function readArtifact(value: unknown, summary: CatalogSummary): CatalogArtifact {
	if (!isRecord(value) || value.kind !== 'component' || !Array.isArray(value.states) || !Array.isArray(value.anatomy) || !isRecord(value.accessibility) || !isRecord(value.bindings)) {
		throw new Error('Canonical artifact is missing component reference fields.');
	}
	const accessibility = value.accessibility;
	if (typeof accessibility.nameRequired !== 'boolean') {
		throw new Error('Canonical artifact is missing its accessibility name requirement.');
	}
	const binding = value.bindings['web.react'];
	if (binding === undefined) throw new Error('Canonical artifact has no web.react binding.');
	const intent = value.intent;
	if (intent !== undefined && !isRecord(intent)) throw new Error('Canonical artifact has invalid intent guidance.');
	return Object.freeze({
		...summary,
		intent: intent === undefined ? undefined : {
			...(intent.useWhen === undefined ? {} : { useWhen: stringArray(intent.useWhen, 'intent.useWhen') }),
			...(intent.avoidWhen === undefined ? {} : { avoidWhen: stringArray(intent.avoidWhen, 'intent.avoidWhen') }),
		},
		states: stringArray(value.states, 'states'),
		anatomy: stringArray(value.anatomy, 'anatomy'),
		accessibility: Object.freeze({
			nameRequired: accessibility.nameRequired,
			obligations: stringArray(accessibility.obligations, 'accessibility.obligations'),
		}),
		bindings: Object.freeze({ 'web.react': readBinding(binding) }),
	});
}

const componentItems: unknown[] = [];
let componentCursor: string | undefined;
do {
	const response = listResponse(catalog.listArtifacts({
		kind: 'component',
		platform: 'web.react',
		detail: 'brief',
		limit: 100,
		...(componentCursor === undefined ? {} : { cursor: componentCursor }),
	}));
	componentItems.push(...response.data.items);
	if (response.meta.truncated && response.meta.nextCursor === null) {
		throw new Error('Mux UI component inventory was truncated without a continuation cursor.');
	}
	componentCursor = response.meta.nextCursor ?? undefined;
} while (componentCursor !== undefined);
export const componentSummaries: readonly CatalogSummary[] = Object.freeze(
	componentItems.map(readComponentSummary),
);
export const componentSidebar = Object.freeze(componentSummaries.map(({ id, name }) => ({
	label: name,
	link: `/components/${id.slice(id.lastIndexOf(':') + 1)}/`,
})));

const guideItems: readonly Omit<CatalogGuide, 'keywords' | 'content'>[] = Object.freeze(
	(() => {
		const items: Omit<CatalogGuide, 'keywords' | 'content'>[] = [];
		let cursor: string | undefined;
		do {
			const response = listResponse(catalog.listArtifacts({
				kind: 'guide',
				platform: 'web.react',
				detail: 'brief',
				limit: 100,
				...(cursor === undefined ? {} : { cursor }),
			}));
			items.push(...response.data.items.map(readGuideSummary));
			if (response.meta.truncated && response.meta.nextCursor === null) {
				throw new Error('Mux UI guide inventory was truncated without a continuation cursor.');
			}
			cursor = response.meta.nextCursor ?? undefined;
		} while (cursor !== undefined);
		return items;
	})(),
);

export const guideSummaries: readonly CatalogGuide[] = Object.freeze(guideItems.map((summary) => {
		const response = detailResponse(catalog.getArtifact({
			id: summary.id,
			platform: 'web.react',
			detail: 'full',
		}));
		if (response.data.artifact === undefined) throw new Error(`Mux UI docs received no guide for ${summary.id}.`);
		return readGuide(response.data.artifact, summary);
}));

export function getGuide(id: string): CatalogGuide | null {
	return guideSummaries.find((guide) => guide.id === id) ?? null;
}

function guidesForComponent(summary: CatalogSummary): readonly CatalogGuide[] {
	const matches = guideSummaries.filter((guide) => guide.name === `${summary.name} usage`);
	if (matches.length > 1) throw new Error(`Mux UI docs found multiple usage guides for ${summary.id}.`);
	return Object.freeze(matches);
}

export interface ComponentPage {
	summary: CatalogSummary;
	artifact: CatalogArtifact;
	relations: readonly unknown[];
	examples: readonly CatalogExample[];
	guides: readonly CatalogGuide[];
}

export function getComponentPage(slug: string): ComponentPage | null {
	const summary = componentSummaries.find((item) => item.id.endsWith(`:${slug}`));
	if (!summary) return null;

	const detail = detailResponse(catalog.getArtifact({
		id: summary.id,
		platform: 'web.react',
		detail: 'full',
	}));
	const examples = detailResponse(catalog.getArtifact({
		id: summary.id,
		platform: 'web.react',
		detail: 'full',
		section: 'examples',
	}));
	if (detail.data.artifact === undefined) throw new Error(`Mux UI docs received no artifact for ${summary.id}.`);
	const exampleItems = examples.data.value ?? [];
	if (exampleItems.length === 0) throw new Error(`Mux UI docs received no executable React examples for ${summary.id}.`);
	return Object.freeze({
		summary,
		artifact: readArtifact(detail.data.artifact, summary),
		relations: Object.freeze([...(detail.data.relations ?? [])]),
		examples: Object.freeze(exampleItems.map(readExampleSummary)),
		guides: guidesForComponent(summary),
	});
}
