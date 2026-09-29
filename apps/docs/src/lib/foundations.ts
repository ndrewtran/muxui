import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import defaultThemeSource from '../../../../catalog/tokens/default-theme.json' with { type: 'json' };
import { canonicalRepositoryRoot } from './catalog.ts';

export { FOUNDATION_OVERVIEW, FOUNDATION_PAGES, foundationPage, type FoundationPage } from './foundation-pages.ts';

type TokenType = 'color' | 'dimension' | 'duration' | 'number' | 'string' | 'effect' | 'easing' | 'transition';
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
