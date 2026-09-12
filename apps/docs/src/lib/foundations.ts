import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import defaultThemeSource from '../../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { canonicalRepositoryRoot } from './catalog.ts';

export type FoundationPage = {
	slug: string;
	label: string;
	title: string;
	description: string;
	kind: 'overview' | 'layer' | 'category';
	layer?: string;
	category?: string;
};

export const FOUNDATION_PAGES: readonly FoundationPage[] = Object.freeze([
	{
		slug: 'reference-tokens',
		label: 'Reference tokens',
		title: 'Reference tokens',
		description: 'Stable scales and primitives that give semantic roles a shared vocabulary.',
		kind: 'layer',
		layer: 'reference',
	},
	{
		slug: 'semantic-tokens',
		label: 'Semantic tokens',
		title: 'Semantic tokens',
		description: 'Role-based tokens for content, surfaces, borders, actions, type, and interaction.',
		kind: 'layer',
		layer: 'semantic',
	},
	{
		slug: 'colour',
		label: 'Colour',
		title: 'Colour',
		description: 'Palette ramps and semantic colour roles shown in their actual interface contexts.',
		kind: 'category',
		category: 'colour',
	},
	{
		slug: 'typography',
		label: 'Typography',
		title: 'Typography',
		description: 'Font families, sizes, weights, leading, and tracking rendered as real type specimens.',
		kind: 'category',
		category: 'typography',
	},
	{
		slug: 'spacing',
		label: 'Spacing',
		title: 'Spacing and dimensions',
		description: 'The dimension scales behind layout rhythm, control sizing, and responsive recipes.',
		kind: 'category',
		category: 'spacing',
	},
	{
		slug: 'shape',
		label: 'Shape',
		title: 'Shape',
		description: 'Corner-radius roles shown at the same size so their intended hierarchy is easy to compare.',
		kind: 'category',
		category: 'shape',
	},
	{
		slug: 'elevation',
		label: 'Elevation',
		title: 'Elevation and effects',
		description: 'Typed shadows and surface depth, resolved by the same compiler used by consumers.',
		kind: 'category',
		category: 'elevation',
	},
	{
		slug: 'motion',
		label: 'Motion',
		title: 'Motion',
		description: 'Finite, user-triggered timing and easing specimens with a reduced-motion-safe mode.',
		kind: 'category',
		category: 'motion',
	},
	{
		slug: 'component-tokens',
		label: 'Component tokens',
		title: 'Component tokens',
		description: 'Component-owned customization points and the semantic roles they consume.',
		kind: 'layer',
		layer: 'component',
	},
]);

export const FOUNDATION_OVERVIEW: FoundationPage = Object.freeze({
	slug: 'overview',
	label: 'Overview',
	title: 'Foundations',
	description: 'A visual index of the canonical Mux UI token system, from reference primitives through semantic and component roles.',
	kind: 'overview',
});

export function foundationPage(slug: string): FoundationPage | undefined {
	return slug === FOUNDATION_OVERVIEW.slug
		? FOUNDATION_OVERVIEW
		: FOUNDATION_PAGES.find((page) => page.slug === slug);
}

type TokenType = 'color' | 'dimension' | 'duration' | 'number' | 'string' | 'effect';
type TokenLayer = 'reference' | 'semantic' | 'component';

type TokenDefinition = {
	layer: TokenLayer;
	type: TokenType;
	unit: string;
	meaning: string;
	overridePolicy: string;
	value?: unknown;
	alias?: string;
	modes?: Record<string, { value?: unknown; alias?: string }>;
};

type CompiledToken = {
	id: string;
	layer: TokenLayer;
	type: TokenType;
	unit: string;
	value: unknown;
	overridePolicy: string;
	source: string;
	effect?: unknown;
	fluid?: unknown;
	relative?: unknown;
	formula?: unknown;
	mix?: unknown;
};

type TokenCore = {
	compilePureTokenGraph: (source: unknown, options: { modes: Record<string, string>; responsive: boolean }) => {
		modes: Record<string, string>;
		tokens: Record<string, CompiledToken>;
		dependencies: Record<string, readonly string[]>;
	};
	cssName: (id: string) => string;
	cssValue: (token: CompiledToken) => string;
	cssDeclaration: (token: CompiledToken, dependencies: Record<string, readonly string[]>) => string;
};

// Reuse the package-owned pure graph and CSS serializers. Docs only projects the result.
const tokenCore = createRequire(import.meta.url)(resolve(canonicalRepositoryRoot, 'packages/tokens/src/core.mjs')) as unknown as TokenCore;
const source = defaultThemeSource as unknown as {
	id: string;
	theme: { name: string; defaultModes: Record<string, string>; typography: unknown; scale: unknown };
	tokens: Record<string, TokenDefinition>;
};
const graph = tokenCore.compilePureTokenGraph(source, {
	modes: source.theme.defaultModes,
	responsive: false,
});

export type FoundationToken = {
	id: string;
	cssName: string;
	layer: TokenLayer;
	type: TokenType;
	unit: string;
	meaning: string;
	overridePolicy: string;
	sourceKind: string;
	authoredValue: unknown;
	authoredAlias?: string;
	aliasChain: readonly string[];
	defaultValue: unknown;
	defaultCssValue: string;
	defaultDeclaration: string;
	dependencies: readonly string[];
};

function authoredAlias(definition: TokenDefinition): string | undefined {
	return definition.alias;
}

function aliasChain(id: string): readonly string[] {
	const chain: string[] = [];
	const visited = new Set<string>();
	let current: string | undefined = id;
	while (current && !visited.has(current)) {
		visited.add(current);
		chain.push(current);
		const compiled: CompiledToken | undefined = graph.tokens[current];
		const dependencies: readonly string[] = graph.dependencies[current] ?? [];
		current = compiled?.source === 'alias' && dependencies.length === 1 ? dependencies[0] : undefined;
	}
	return Object.freeze(chain);
}

const tokenIds = Object.keys(source.tokens).sort((left, right) => left.localeCompare(right));
export const FOUNDATION_TOKENS: readonly FoundationToken[] = Object.freeze(tokenIds.map((id) => {
	const definition = source.tokens[id];
	const compiled = graph.tokens[id];
	if (!compiled) throw new Error(`Missing compiled foundation token: ${id}.`);
	return Object.freeze({
		id,
		cssName: tokenCore.cssName(id),
		layer: definition.layer,
		type: definition.type,
		unit: definition.unit,
		meaning: definition.meaning,
		overridePolicy: definition.overridePolicy,
		sourceKind: compiled.source,
		authoredValue: definition.value,
		authoredAlias: authoredAlias(definition),
		aliasChain: aliasChain(id),
		defaultValue: compiled.value,
		defaultCssValue: tokenCore.cssValue(compiled),
		defaultDeclaration: tokenCore.cssDeclaration(compiled, graph.dependencies),
		dependencies: Object.freeze([...(graph.dependencies[id] ?? [])]),
	});
}));

export type TypographyRole = {
	name: string;
	fontFamily: string;
	color: string;
	variants: readonly { name: string; fontSize: string; fontWeight: string; lineHeight: string; letterSpacing: string }[];
};

const themeTypography = source.theme.typography as { roles: Record<string, { fontFamily: string; color: string; variants: Record<string, Record<string, string>> }> };
export const TYPOGRAPHY_ROLES: readonly TypographyRole[] = Object.freeze(Object.entries(themeTypography.roles).map(([name, role]) => Object.freeze({
	name,
	fontFamily: role.fontFamily,
	color: role.color,
	variants: Object.freeze(Object.entries(role.variants).map(([variantName, variant]) => Object.freeze({
		name: variantName,
		fontSize: variant.fontSize,
		fontWeight: variant.fontWeight,
		lineHeight: variant.lineHeight,
		letterSpacing: variant.letterSpacing,
	}))),
})));

export const FOUNDATION_DATA = Object.freeze({
	sourceId: source.id,
	themeName: source.theme.name,
	defaultModes: Object.freeze({ ...source.theme.defaultModes }),
	tokenCount: FOUNDATION_TOKENS.length,
	tokens: FOUNDATION_TOKENS,
	typographyRoles: TYPOGRAPHY_ROLES,
	scale: source.theme.scale,
});
