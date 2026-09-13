import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { FOUNDATION_TOKENS } from '../src/lib/foundations.ts';
import { normalizeAppliedNumericValue } from '../src/lib/foundation-values.ts';
import {
	createTokenPathTransformer,
	tokenPathMatches,
	tokenPathSegments,
} from '../src/lib/token-path.ts';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const docsDist = process.argv[2] === undefined
	? resolve(repositoryRoot, 'apps/docs/dist')
	: resolve(process.argv[2]);

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function textContent(node) {
	return (node.childNodes ?? []).map((child) => {
		if (child.nodeName === '#text') return child.value;
		if (child.nodeName === '#comment') return '';
		return textContent(child);
	}).join('');
}

function classNames(node) {
	return new Set((node.attrs?.find(({ name }) => name === 'class')?.value ?? '').split(/\s+/u).filter(Boolean));
}

function hasTokenPathDecoration(node) {
	return classNames(node).has('mux-token-path')
		|| node.attrs?.some(({ name }) => name === 'data-token-path-kind') === true
		|| (node.childNodes ?? []).some((child) => child.tagName !== undefined && hasTokenPathDecoration(child));
}

function htmlFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filePath = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...htmlFiles(filePath));
		else if (entry.isFile() && entry.name === 'index.html') files.push(filePath);
	}
	return files;
}

function walk(node, ancestors, callback) {
	callback(node, ancestors);
	for (const child of node.childNodes ?? []) walk(child, [...ancestors, node], callback);
}

function descendants(node) {
	const result = [];
	for (const child of node.childNodes ?? []) {
		if (child.tagName === undefined) continue;
		result.push(child, ...descendants(child));
	}
	return result;
}

function attributeValue(node, name) {
	return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

const semanticAction = FOUNDATION_TOKENS.find(({ id }) => id === 'semantic.action.background');
assert(semanticAction !== undefined, 'The canonical semantic.action.background token is missing.');
const semanticSegments = tokenPathSegments(semanticAction.id, semanticAction);
assert(semanticSegments.map(({ text }) => text).join('') === semanticAction.id, 'Dotted token path text changed.');
assert(semanticSegments.find(({ text }) => text === 'semantic')?.kind === 'layer', 'Semantic layer was not classified as a layer segment.');
assert(semanticSegments.find(({ text }) => text === 'action')?.kind === 'group', 'Semantic action category was misclassified as a primitive type.');
assert(semanticSegments.find(({ text }) => text === 'background')?.kind === 'property', 'Semantic property was not classified as a property segment.');

const cssSegments = tokenPathSegments(semanticAction.cssName, semanticAction);
assert(cssSegments.map(({ text }) => text).join('') === semanticAction.cssName, 'CSS variable token path text changed.');
assert(cssSegments[0]?.kind === 'prefix', 'CSS variable prefix was not classified.');
assert(cssSegments.filter(({ kind }) => kind === 'separator').length === semanticAction.id.split('.').length - 1, 'CSS variable separators changed.');

assert(tokenPathSegments('semantic.action.not-canonical', semanticAction).length === 0, 'A mismatched dotted value was decorated.');
assert(tokenPathSegments(semanticAction.id, { ...semanticAction, id: 'semantic.action.other' }).length === 0, 'A token path was decorated with mismatched metadata.');
assert(tokenPathMatches(`unknown ${semanticAction.id}x`, FOUNDATION_TOKENS).length === 0, 'A token embedded in a larger identifier was decorated.');
assert(normalizeAppliedNumericValue('2rem', 'px', 16) === 32, 'Active rem dimensions were not normalized to canonical pixels.');
assert(normalizeAppliedNumericValue('0.12s', 'ms', 16) === 120, 'Active second durations were not normalized to canonical milliseconds.');
assert(normalizeAppliedNumericValue('calc(2 * 1rem)', 'px', 16) === undefined, 'Unsupported active numeric expressions should use canonical fallback values.');

const fontSize = FOUNDATION_TOKENS.find(({ id }) => id.endsWith('.text-m-font-size'));
assert(fontSize !== undefined, 'The canonical hyphenated font-size token is missing.');
const fontSegments = tokenPathSegments(fontSize.id, fontSize);
assert(fontSegments.some(({ text, kind }) => text === 'text-m-font-size' && kind === 'property'), 'Hyphenated token leaf was split or misclassified.');

const transformer = createTokenPathTransformer(FOUNDATION_TOKENS);
const source = `var(${semanticAction.cssName})`;
const options = { decorations: [] };
const transformed = transformer.preprocess(source, options);
assert(transformed === undefined || transformed === source, 'The Shiki transformer changed source text.');
assert(options.decorations.length > 0, 'The Shiki transformer produced no canonical path decorations.');

const expectedInlineGuides = new Map([
	['foundations/shape/index.html', ['semantic.shape.container-radius', 'semantic.shape.overlay-radius', 'semantic.shape.pill-radius']],
	['foundations/spacing/index.html', ['semantic.control.size-sm', 'semantic.control.size-md', 'semantic.control.size-lg']],
]);
const canonicalValues = new Set(FOUNDATION_TOKENS.flatMap(({ id, cssName }) => [id, cssName]));
let renderedCanonicalCodes = 0;
let decoratedCanonicalCodes = 0;
const inlineGuideMatches = new Map();

for (const filePath of htmlFiles(docsDist)) {
	const tree = parse(readFileSync(filePath, 'utf8'));
	const relativePath = filePath.slice(`${docsDist}/`.length);
	walk(tree, [], (node, ancestors) => {
		if (node.tagName !== 'code' || ancestors.some(({ tagName }) => tagName === 'pre')) return;
		const value = textContent(node);
		const inventoryName = [...ancestors].reverse().find((ancestor) => classNames(ancestor).has('foundation-token-row-name'));
		const inventoryRow = [...ancestors].reverse().find((ancestor) => classNames(ancestor).has('foundation-token-row'));
		const inventoryTokenId = inventoryRow?.attrs?.find(({ name }) => name === 'data-token-id')?.value;
		if (inventoryName !== undefined && inventoryTokenId !== undefined) {
			assert(value === inventoryTokenId, `Displayed inventory token text does not match its data-token-id in ${relativePath}: ${inventoryTokenId}`);
		}
		if (!canonicalValues.has(value)) return;
		renderedCanonicalCodes += 1;
		if (hasTokenPathDecoration(node)) decoratedCanonicalCodes += 1;
		const guideProjection = [...ancestors].reverse().find((ancestor) => classNames(ancestor).has('guide-projection'));
		if (guideProjection !== undefined) {
			const guideValues = inlineGuideMatches.get(relativePath) ?? new Set();
			guideValues.add(value);
			inlineGuideMatches.set(relativePath, guideValues);
		}
	});
}

assert(renderedCanonicalCodes > 0, 'No canonical token paths were found in the built docs.');
assert(decoratedCanonicalCodes === renderedCanonicalCodes, `Only ${decoratedCanonicalCodes}/${renderedCanonicalCodes} canonical code values have token path decorations.`);
for (const [relativePath, expectedValues] of expectedInlineGuides) {
	const actualValues = inlineGuideMatches.get(relativePath) ?? new Set();
	for (const value of expectedValues) assert(actualValues.has(value), `Inline guide token was not decorated or its text changed: ${relativePath} ${value}`);
	}

const expectedFoundationFamilies = new Map([
	['foundations/spacing/index.html', new Map([
		['reference-space', ['reference.dimension.space-4xs', 'reference.dimension.space-4xl']],
		['semantic-control-sizes', ['semantic.control.size-sm', 'semantic.control.size-lg']],
		['semantic-navigation-insets', ['semantic.layout.navigation-inset-block', 'semantic.layout.navigation-inset-inline']],
		['semantic-control-padding', ['semantic.control.padding-block', 'semantic.control.padding-inline']],
	])],
	['foundations/shape/index.html', new Map([
		['reference-radii', ['reference.dimension.radius-none', 'reference.dimension.radius-full']],
		['semantic-shape-roles', ['semantic.shape.container-radius', 'semantic.control.radius']],
	])],
	['foundations/elevation/index.html', new Map([
		['reference-shadows', ['reference.effect.shadow-xs', 'reference.effect.shadow-xl']],
		['semantic-elevation-roles', ['semantic.elevation.flat', 'semantic.elevation.toast']],
	])],
	['foundations/motion/index.html', new Map([
		['reference-durations', ['reference.duration.instant', 'reference.duration.deliberate']],
		['semantic-progress-durations', ['semantic.motion.progress-update-duration', 'semantic.motion.progress-travel-duration']],
		['reference-easings', ['reference.motion.easing-linear', 'reference.motion.easing-emphasized']],
		['semantic-easings', ['semantic.motion.constant-easing', 'semantic.motion.state-easing']],
	])],
]);

for (const [relativePath, expectedGroups] of expectedFoundationFamilies) {
	const filePath = resolve(docsDist, relativePath);
	const tree = parse(readFileSync(filePath, 'utf8'));
	const actualGroups = new Map();
	walk(tree, [], (node) => {
		const familyId = attributeValue(node, 'data-foundation-family');
		if (familyId === undefined) return;
		const tokens = new Set();
		const widths = new Map();
		const orderedTokens = [];
		for (const descendant of descendants(node)) {
			const tokenId = attributeValue(descendant, 'data-foundation-token');
			if (tokenId === undefined) continue;
			if (!tokens.has(tokenId)) orderedTokens.push(tokenId);
			tokens.add(tokenId);
			for (const nested of descendants(descendant)) {
				const scaleWidth = attributeValue(nested, 'data-foundation-scale-width');
				if (scaleWidth !== undefined) widths.set(tokenId, scaleWidth);
			}
		}
		actualGroups.set(familyId, { tokens, widths, orderedTokens });
	});
	for (const [familyId, expectedTokens] of expectedGroups) {
		const actual = actualGroups.get(familyId);
		assert(actual !== undefined, `Foundation family is missing from ${relativePath}: ${familyId}`);
		for (const tokenId of expectedTokens) assert(actual.tokens.has(tokenId), `Foundation family ${familyId} does not contain ${tokenId} in ${relativePath}`);
	}
	const coveredTokenIds = [...actualGroups.values()].flatMap(({ tokens }) => [...tokens]);
	const coverageCounts = new Map();
	for (const tokenId of coveredTokenIds) coverageCounts.set(tokenId, (coverageCounts.get(tokenId) ?? 0) + 1);
	const expectedCoverage = relativePath === 'foundations/spacing/index.html'
		? FOUNDATION_TOKENS.filter(({ id, type }) => type === 'dimension' && (/^reference\.dimension\.(?:space|section-space)-/u.test(id) || id.startsWith('semantic.layout.') || id.startsWith('semantic.control.')))
		: relativePath === 'foundations/shape/index.html'
			? FOUNDATION_TOKENS.filter(({ id }) => id.startsWith('reference.dimension.radius-') || id.startsWith('semantic.shape.') || id === 'semantic.control.radius')
			: relativePath === 'foundations/elevation/index.html'
				? FOUNDATION_TOKENS.filter(({ id, type }) => type === 'effect' || id.startsWith('semantic.elevation.'))
				: FOUNDATION_TOKENS.filter(({ id, type }) => type === 'duration' && !id.startsWith('reference.motion.duration-'));
	for (const { id } of expectedCoverage) assert(coverageCounts.get(id) === 1, `Canonical token is missing or appears in multiple families in ${relativePath}: ${id}`);
	if (relativePath === 'foundations/spacing/index.html') {
		const controlWidths = actualGroups.get('semantic-control-sizes')?.widths;
		const controlSizes = FOUNDATION_TOKENS.filter(({ id }) => id.startsWith('semantic.control.size-'));
		const maximum = Math.max(...controlSizes.map(({ defaultValue }) => Number(defaultValue)));
		for (const token of controlSizes) {
			const expectedWidth = `${Math.max(0, Math.min(100, Number(token.defaultValue) / maximum * 100))}%`;
			assert(controlWidths?.get(token.id) === expectedWidth, `Control ruler width is not relative to its family maximum: ${token.id}`);
		}
		for (const [familyId, prefix] of [['semantic-layout-insets', 'semantic.layout.inset-'], ['semantic-control-sizes', 'semantic.control.size-']]) {
			const expectedOrder = FOUNDATION_TOKENS.filter(({ id }) => id.startsWith(prefix)).sort((left, right) => Number(left.defaultValue) - Number(right.defaultValue)).map(({ id }) => id);
			assert(JSON.stringify(actualGroups.get(familyId)?.orderedTokens) === JSON.stringify(expectedOrder), `Foundation family order is not numeric for ${familyId}.`);
		}
	}
	if (relativePath === 'foundations/motion/index.html') {
		const easingMarkers = [];
		walk(tree, [], (node) => {
			if (classNames(node).has('foundation-motion-marker')) easingMarkers.push(attributeValue(node, 'style') ?? '');
		});
		assert(easingMarkers.length > 0 && easingMarkers.every((style) => style.includes('animation-duration:var(--muxui-reference-duration-fast)')), 'Easing replays must use one shared reference duration for curve comparison.');
	}
}

console.log(`Token path contract passed: ${decoratedCanonicalCodes} canonical code values preserve exact text and syntax decorations; dotted, CSS, mismatch, unknown, hyphenated, and inline guide cases covered.`);
