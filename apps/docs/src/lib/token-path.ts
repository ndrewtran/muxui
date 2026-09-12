import React, { type ReactNode } from 'react';
import type { FoundationToken } from './foundations.ts';

/**
 * The token path grammar is deliberately limited to canonical dot segments.
 * Hyphenated leaves (for example `font-size` or `brand-60`) stay together so
 * the syntax explains the source path instead of inventing a second hierarchy.
 */
export type TokenPathSegmentKind = 'prefix' | 'separator' | 'layer' | 'category' | 'group' | 'property' | 'scale' | 'state';

export type TokenPathMetadata = Pick<FoundationToken, 'id' | 'cssName' | 'layer' | 'type'>;

export type TokenPathSegment = {
	text: string;
	kind: TokenPathSegmentKind;
	className: string;
};

export type TokenPathMatch = {
	value: string;
	start: number;
	end: number;
	metadata: TokenPathMetadata;
	segments: readonly TokenPathSegment[];
};

type TokenPathNode = {
	type: string;
	tagName?: string;
	value?: string;
	children?: TokenPathNode[];
	properties?: Record<string, unknown>;
};

type ShikiDecoration = {
	start: number;
	end: number;
	tagName: 'span';
	properties: { class: string; 'data-token-path-kind': TokenPathSegmentKind };
	alwaysWrap: true;
};

type ShikiTransformer = {
	name?: string;
	preprocess?: (code: string, options: { decorations?: readonly unknown[] }) => string | void;
};

const CSS_VARIABLE_PREFIX = '--muxui-';
const CANONICAL_LAYER_NAMES = new Set(['reference', 'semantic', 'component']);
const CATEGORY_NAMES = new Set(['color', 'typography', 'dimension', 'duration', 'number', 'string', 'effect', 'motion']);
const STATE_SUFFIXES = /(?:^|-)\b(?:active|checked|disabled|dragging|error|expanded|focus|hover|invalid|open|pressed|selected|visited)\b$/u;
const SCALE_SUFFIX = /(?:^|-)\b(?:2xs|3xs|4xs|5xs|xs|s|m|l|xl|2xl|3xl|4xl|5xl|\d+)\b$/u;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function segmentClass(kind: TokenPathSegmentKind, metadata: TokenPathMetadata | undefined, canonicalSegment = ''): string {
	const classes = [`mux-token-path__segment`, `mux-token-path__segment--${kind}`];
	if (kind === 'layer' && metadata && CANONICAL_LAYER_NAMES.has(canonicalSegment)) {
		classes.push(`mux-token-path__segment--layer-${metadata.layer}`);
	}
	if (metadata && kind === 'category' && CATEGORY_NAMES.has(canonicalSegment)) {
		classes.push(`mux-token-path__segment--category-${canonicalSegment}`);
	}
	return classes.join(' ');
}

function classifySegment(segment: string, index: number, segments: readonly string[], metadata: TokenPathMetadata | undefined): TokenPathSegmentKind {
	if (index === 0 && CANONICAL_LAYER_NAMES.has(segment)) return 'layer';
	if (index === 1 && CATEGORY_NAMES.has(segment)) return 'category';
	if (index === segments.length - 1) {
		if (STATE_SUFFIXES.test(segment)) return 'state';
		if (SCALE_SUFFIX.test(segment)) return 'scale';
		return 'property';
	}
	if (metadata?.layer === 'reference' && index === 1) return 'category';
	return 'group';
}

function canonicalValue(value: string, metadata?: TokenPathMetadata): string | undefined {
	if (metadata && value === metadata.cssName) return metadata.id;
	return metadata && value === metadata.id ? metadata.id : undefined;
}

function createCanonicalSegments(value: string, metadata?: TokenPathMetadata): TokenPathSegment[] | undefined {
	const canonical = canonicalValue(value, metadata);
	if (!canonical) return undefined;
	const parts = canonical.split('.');
	const segments: TokenPathSegment[] = [];
	for (const [index, part] of parts.entries()) {
		if (index > 0) segments.push({ text: '.', kind: 'separator', className: segmentClass('separator', metadata) });
		const kind = classifySegment(part, index, parts, metadata);
		segments.push({
			text: part,
			kind,
			className: segmentClass(kind, metadata, part),
		});
	}
	return segments;
}

function createCssVariableSegments(value: string, metadata: TokenPathMetadata): TokenPathSegment[] | undefined {
	if (value !== metadata.cssName) return undefined;
	const parts = metadata.id.split('.');
	const segments: TokenPathSegment[] = [{ text: CSS_VARIABLE_PREFIX, kind: 'prefix', className: segmentClass('prefix', metadata) }];
	for (const [index, part] of parts.entries()) {
		if (index > 0) segments.push({ text: '-', kind: 'separator', className: segmentClass('separator', metadata) });
		const kind = classifySegment(part, index, parts, metadata);
		segments.push({
			text: part,
			kind,
			className: segmentClass(kind, metadata, part),
		});
	}
	return segments;
}

/** Return coloured segments only for a canonical ID or generated Mux CSS variable. */
export function tokenPathSegments(value: string, metadata?: TokenPathMetadata): readonly TokenPathSegment[] {
	if (!metadata) return [];
	return createCssVariableSegments(value, metadata) ?? createCanonicalSegments(value, metadata) ?? [];
}

function pathMatches(tokens: readonly TokenPathMetadata[]): Map<string, TokenPathMetadata> {
	const matches = new Map<string, TokenPathMetadata>();
	for (const token of tokens) {
		matches.set(token.id, token);
		matches.set(token.cssName, token);
	}
	return matches;
}

function createMatcher(matches: ReadonlyMap<string, TokenPathMetadata>): RegExp {
	const values = [...matches.keys()].sort((left, right) => right.length - left.length).map(escapeRegExp);
	if (values.length === 0) return /(?!)/gu;
	return new RegExp(`(?<![A-Za-z0-9_.-])(?:${values.join('|')})(?![A-Za-z0-9_.-])`, 'gu');
}

function findTokenPathMatches(value: string, matches: ReadonlyMap<string, TokenPathMetadata>, matcher: RegExp): TokenPathMatch[] {
	const tokenMatches: TokenPathMatch[] = [];
	matcher.lastIndex = 0;
	for (const match of value.matchAll(matcher)) {
		const matchedValue = match[0];
		const start = match.index ?? -1;
		const metadata = matches.get(matchedValue);
		if (!metadata || start < 0) continue;
		tokenMatches.push({
			value: matchedValue,
			start,
			end: start + matchedValue.length,
			metadata,
			segments: tokenPathSegments(matchedValue, metadata),
		});
	}
	return tokenMatches;
}

/** Find only exact canonical IDs and generated Mux CSS variables in text. */
export function tokenPathMatches(value: string, tokens: readonly TokenPathMetadata[]): readonly TokenPathMatch[] {
	const matches = pathMatches(tokens);
	return findTokenPathMatches(value, matches, createMatcher(matches));
}

function decorationsForCode(code: string, matches: ReadonlyMap<string, TokenPathMetadata>, matcher: RegExp): ShikiDecoration[] {
	const decorations: ShikiDecoration[] = [];
	for (const match of findTokenPathMatches(code, matches, matcher)) {
		let offset = match.start;
		for (const segment of match.segments) {
			if (segment.text.length > 0) {
				decorations.push({
					start: offset,
					end: offset + segment.text.length,
					tagName: 'span',
					properties: { class: segment.className, 'data-token-path-kind': segment.kind },
					alwaysWrap: true,
				});
			}
			offset += segment.text.length;
		}
	}
	return decorations;
}

/**
 * Shiki's decoration hook keeps syntax colour coding in the build pipeline.
 * It does not alter source text, so rendered code and clipboard output remain
 * byte-for-byte compatible with the canonical example.
 */
export function createTokenPathTransformer(tokens: readonly TokenPathMetadata[]): ShikiTransformer {
	const matches = pathMatches(tokens);
	const matcher = createMatcher(matches);
	return {
		name: 'muxui-canonical-token-paths',
		preprocess(code, options) {
			const decorations = decorationsForCode(code, matches, matcher);
			if (decorations.length > 0) options.decorations = [...(options.decorations ?? []), ...decorations];
		},
	};
}

function textNode(value: string): TokenPathNode {
	return { type: 'text', value };
}

function segmentNode(segment: TokenPathSegment): TokenPathNode {
	return {
		type: 'element',
		tagName: 'span',
		properties: { class: segment.className, 'data-token-path-kind': segment.kind },
		children: [textNode(segment.text)],
	};
}

function decorateText(value: string, matches: ReadonlyMap<string, TokenPathMetadata>, matcher: RegExp): TokenPathNode[] {
	const nodes: TokenPathNode[] = [];
	let cursor = 0;
	for (const match of findTokenPathMatches(value, matches, matcher)) {
		if (match.start > cursor) nodes.push(textNode(value.slice(cursor, match.start)));
		for (const segment of match.segments) nodes.push(segmentNode(segment));
		cursor = match.end;
	}
	if (cursor < value.length) nodes.push(textNode(value.slice(cursor)));
	return nodes.length > 0 ? nodes : [textNode(value)];
}

export function TokenPath({ value, token }: { value: string; token?: TokenPathMetadata }): ReactNode {
	const segments = tokenPathSegments(value, token);
	if (segments.length === 0) return value;
	return React.createElement(
		'span',
		{ className: 'mux-token-path', 'data-token-path': token?.id ?? value, 'data-token-type': token?.type },
		segments.map((segment, index) => React.createElement('span', { className: segment.className, 'data-token-path-kind': segment.kind, key: `${segment.text}-${index}` }, segment.text)),
	);
}

function reactNode(node: TokenPathNode, key: string): ReactNode {
	if (node.type === 'text') return node.value ?? '';
	const className = node.properties?.class;
	return React.createElement(
		node.tagName ?? 'span',
		{
			className: typeof className === 'string' ? className : undefined,
			'data-token-path-kind': node.properties?.['data-token-path-kind'],
			key,
		},
		(node.children ?? []).map((child, index) => reactNode(child, `${key}-${index}`)),
	);
}

/** Render var(), declarations, and other expressions while preserving every character. */
export function TokenExpression({ value, tokens }: { value: string; tokens: readonly TokenPathMetadata[] }): ReactNode {
	const matches = pathMatches(tokens);
	const matcher = createMatcher(matches);
	const nodes = decorateText(value, matches, matcher);
	if (nodes.length === 1 && nodes[0]?.type === 'text') return value;
	return React.createElement('span', { className: 'mux-token-expression' }, nodes.map((node, index) => reactNode(node, `expression-${index}`)));
}
