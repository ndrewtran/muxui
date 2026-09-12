import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { FOUNDATION_TOKENS } from '../src/lib/foundations.ts';
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

console.log(`Token path contract passed: ${decoratedCanonicalCodes} canonical code values preserve exact text and syntax decorations; dotted, CSS, mismatch, unknown, hyphenated, and inline guide cases covered.`);
