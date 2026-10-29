// What the Styling section of a built component page must show, derived from the sources and never from the projection that prints it.
//
// The page is printed from `componentReference({ stylingFacts })`. This module does not call it: it reads the part map, the catalog
// record, the token record and its graph, the README, the built stylesheet, the renderer contract, the repository's tracked files and the
// page's own built examples, and compares what the page shows with what those say. A change to the page's markup, to the projection or to
// a source that the page does not follow is a difference here.
//
//   loadStylingSources(root)            read once: the sources above
//   checkStyling({ sources, ... })      the problems of one page's Styling section (each starts with the route)
//   expectedStylingSources(...)         the paths the page's Sources "Styling" group must list, in order
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFragment } from 'parse5';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';
import { selectionIndex, splitTopLevel, splitTopLevelCombinators } from './styling-selectors.mjs';

const collapse = (value) => value.replace(/\s+/gu, ' ').trim();
const text = (node) => collapse(textContent(node));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const unique = (list) => [...new Set(list)];

/** The paths the Styling group always lists, in this order around the stylesheets. */
export const partMapPath = 'packages/react/test/support/styling-parts.ts';
export const referencePath = 'packages/react/test/support/styling-reference.mjs';
export const tokenRecordPath = 'catalog/tokens/default-theme.json';
export const readmePath = 'packages/react/README.md';
export const previewHeightsPath = 'apps/docs/src/lib/preview-heights.json';

/**
 * The page script of the Styling section as the build has it. The docs serve one file for every page, at a name that carries the first 12
 * hexadecimal digits of the SHA-256 of its content (`/_muxui/styling-measure.<hash>.js`), so a cached copy can never be paired with the page
 * of another build. Returns the URL every page must load (from the hash of the content, not from the name), the content, and the problems
 * with the build's files: none or several copies, an unversioned copy, a name that is not its content's hash.
 */
export function measuredScript(dist) {
	const names = readdirSync(resolve(dist, '_muxui')).filter((name) => name.startsWith('styling-measure'));
	const named = names.filter((name) => /^styling-measure\.[0-9a-f]{12}\.js$/u.test(name));
	const problems = [];
	if (names.length !== 1 || named.length !== 1) problems.push(`_muxui holds ${JSON.stringify(names)} for the Styling page script, expected exactly one file named styling-measure.<12 hexadecimal digits>.js.`);
	if (named.length === 0) return { url: null, content: '', problems };
	const content = readFileSync(resolve(dist, '_muxui', named[0]), 'utf8');
	const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
	if (named[0] !== `styling-measure.${hash}.js`) problems.push(`_muxui/${named[0]} is named for another content than it holds: the hash of its content is ${hash}.`);
	return { url: `/_muxui/styling-measure.${hash}.js`, content, problems };
}

/** The three families of property a family may or may not write, and the only attributes a "not set by" row may name. */
const notSetNames = ['size', 'variant', 'color'];
/**
 * The states a pointer, a key or a transition sets, which a consumer styles whether or not the catalog declares them. Written here, apart from the
 * reference that prints the section: a state a rule selects on a family's own hook and the catalog does not declare is an "interaction" row when it
 * is in this list, and an "observed" row when it is not. Each name must be a state of the runtime's contract (checked when the sources load).
 */
export const interactionStates = ['focused', 'focus-visible', 'focus-within', 'hovered', 'pressed', 'dragging', 'drop-target', 'entering', 'exiting', 'open'];

/**
 * The What-wins table, written here and not taken from the reference that prints it. The wording of a row is authored (twice, so a rewording on
 * either side is a difference); the winner of a row is not: it is worked out below by the cascade, from where each competing declaration is
 * written (unlayered, in a layer ranked before, after or equal to Mux's, in the `style` attribute) and whether it is `!important`.
 */
const whoWinsModel = [
	{ id: 1, declaration: 'Unlayered rule, normal', against: 'Mux rule in muxui.components', yours: [{ at: 'unlayered', important: false }], mux: { important: false } },
	{ id: 2, declaration: 'Rule in @layer muxui.utilities, normal', against: 'Mux rule in muxui.components', yours: [{ at: 'utilities', important: false }], mux: { important: false } },
	{ id: 3, declaration: 'Rule in your layer ranked after muxui.components, normal. Your layer is ranked after when your order statement lists it after Mux\'s layers, or when it is first named after them (CSS that loads after Mux and names no order)', against: 'Mux rule in muxui.components', yours: [{ at: 'after', important: false }], mux: { important: false } },
	{ id: 4, declaration: 'Rule in your layer ranked before muxui.components, normal. Your layer is ranked before when your order statement lists it first, or when it is first named before Mux\'s CSS loads', against: 'Mux rule in muxui.components', yours: [{ at: 'before', important: false }], mux: { important: false } },
	{ id: 5, declaration: 'Any normal declaration', against: 'Mux !important (forced colors, reduced motion)', yours: ['unlayered', 'utilities', 'after', 'before', 'inline'].map((at) => ({ at, important: false })), mux: { important: true } },
	{ id: 6, declaration: '!important unlayered, in muxui.utilities or in a layer ranked after Mux\'s', against: 'Mux !important', yours: ['unlayered', 'utilities', 'after'].map((at) => ({ at, important: true })), mux: { important: true } },
	{ id: 7, declaration: '!important in a layer ranked before Mux\'s (reset, muxui.tokens) or inline style', against: 'Mux !important', yours: ['before', 'inline'].map((at) => ({ at, important: true })), mux: { important: true } },
];

/** Whether `yours` beats the Mux declaration it competes with for one property: importance first, then the style attribute, then the layers. */
function beatsMux(yours, mux) {
	if (yours.important !== mux.important) return yours.important;
	const rank = { before: 0, utilities: 2, after: 2 };
	// Normal declarations: the style attribute, then unlayered rules, then layers from the last ranked to the first. Important ones: the same
	// but the layers (and unlayered rules, which rank last of all) reversed.
	const weight = (declaration) => {
		if (declaration.at === 'inline') return 1000;
		const layer = declaration.at === 'mux' ? 1 : rank[declaration.at];
		if (yours.important) return declaration.at === 'unlayered' ? -1 : -layer;
		return declaration.at === 'unlayered' ? 100 : layer;
	};
	return weight(yours) > weight({ at: 'mux' });
}

/** The rows of the What-wins table with the winner the cascade gives each. */
export function whoWinsRows() {
	return whoWinsModel.map(({ id, declaration, against, yours, mux }) => {
		const results = yours.map((declared) => beatsMux(declared, mux));
		if (results.some((wins) => wins !== results[0])) throw new Error(`What-wins row ${id} competes declarations the cascade settles differently`);
		return { id: String(id), declaration, against, winner: results[0] ? (mux.important ? 'You, but do not' : 'You') : 'Mux' };
	});
}

/** Phrases no Styling section may print: an absolute the sources do not support, or a claim of a check that was not made for the page. */
const bannedPhrases = [
	/cannot be defeated/iu,
	/two triggers and no others/iu,
	/forced colors: required/iu,
	/platformSafety/u,
	/applied in a browser, each row/iu,
	/muxui-button-content/u,
];
/** Role names a recipe never assigns: label-gap's rule sets the gap of the caller's own title node, not of a Mux part, and the others are structured. */
const neverAssigned = [/label-gap/u, /motion-duration/u, /-transition(?:-|:|\s|$)/u];
const groupLabels = { root: 'Root class', part: 'Part classes', state: 'State attributes', reflected: 'Reflected prop attributes' };
/** What each group's heading says beside its name: a boolean state is selected by presence, an enumerated one by its value. */
const groupHints = { root: null, part: 'from the catalog anatomy', state: 'a boolean state by presence, an enumerated one by its value', reflected: 'the value is the prop value' };
/** The semantic group of a family opens collapsed only when it is both secondary and long. */
const collapseAbove = 24;

// ---------------------------------------------------------------------------------------------------------------------------
// The sources
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * A small walk of a stylesheet: every rule that holds declarations, with the preludes of the at-rules around it. It reads the built
 * sheet only to count and to find selectors, so it does not model anything else, and a brace that does not balance is an error.
 */
export function walkRules(css) {
	const source = css.replace(/\/\*[\s\S]*?\*\//gu, '');
	const rules = [];
	const stack = [];
	let start = 0;
	let depth = 0;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (character === '"' || character === '\'') {
			index = source.indexOf(character, index + 1);
			if (index < 0) throw new Error('an unterminated string in the stylesheet');
		} else if (character === '{') {
			stack.push(collapse(source.slice(start, index)));
			depth += 1;
			start = index + 1;
		} else if (character === '}') {
			if (depth === 0) throw new Error('an unbalanced brace in the stylesheet');
			const body = source.slice(start, index);
			const prelude = stack.pop();
			depth -= 1;
			if (!prelude.startsWith('@') && body.includes(':') && !body.includes('{')) rules.push({ selector: prelude, chain: [...stack], body });
			start = index + 1;
		} else if (character === ';' && (stack.length === 0 || stack.at(-1).startsWith('@'))) {
			// A statement (`@layer a, b;`, `@import ...;`) ends here; inside a rule a semicolon only separates declarations.
			start = index + 1;
		}
	}
	if (depth !== 0) throw new Error('an unbalanced brace in the stylesheet');
	return rules;
}

/** The classes in the subject (the last compound) of each selector of a rule's list: `.a .b:hover, .c` is `b` and `c`. */
export function subjectClasses(selector) {
	const out = [];
	for (const part of splitTopLevel(selector, ',')) {
		const subject = splitTopLevelCombinators(part).at(-1) ?? '';
		// A negation or a relational test belongs to the element it is written on, but names no class the element has.
		const kept = subject.replace(/:(?:not|has)\((?:[^()]|\([^()]*\))*\)/gu, '');
		for (const [, name] of kept.matchAll(/\.(muxui-[\w-]+)/gu)) out.push(name);
	}
	return out;
}

/** Everything read from the repository once: the part map, the token graph, the README, the stylesheet and the tracked files. */
export async function loadStylingSources(root) {
	const load = (path) => import(pathToFileURL(resolve(root, path)).href);
	// The part map and the token core are the shared readings; the runtime's state contract is the list of states React Aria drives. This module
	// reads neither the reference module that prints the section nor any page component (the independence test scans its imports for both).
	const [partMap, core, stateContract] = await Promise.all([load(partMapPath), load('packages/tokens/src/core.mjs'), load('packages/react/src/styling-contract.ts')]);
	for (const name of interactionStates) {
		if (!stateContract.booleanStates.includes(name)) throw new Error(`${name} is listed as an interaction state here and is not a state of packages/react/src/styling-contract.ts`);
	}
	const tokenSource = JSON.parse(readFileSync(resolve(root, tokenRecordPath), 'utf8'));
	const graph = (modes) => core.compilePureTokenGraph(tokenSource, { modes: { ...tokenSource.theme.defaultModes, ...modes }, responsive: false });
	const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean));
	const css = readFileSync(resolve(root, 'packages/react/generated/styles.css'), 'utf8');
	const contract = JSON.parse(readFileSync(resolve(root, 'packages/react/generated/r1-6-contract.json'), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
	const rules = walkRules(css);
	const authoredCss = [...tracked].filter((path) => /^packages\/react\/src\/.*\.css$/u.test(path)).sort();
	return {
		root,
		partMap,
		core,
		interactionStates,
		tokenSource,
		light: graph({}),
		dark: graph({ colorScheme: 'dark' }),
		tracked,
		css,
		rules,
		selection: selectionIndex(rules),
		// What the rules of the components layer declare: a role is read where a component rule's value names it, not in the token layer.
		reads: readsByName(rules),
		componentDeclarations: rules.filter(({ chain }) => chain.includes('@layer muxui.components')).map(({ body }) => body).join('\n'),
		readme: readFileSync(resolve(root, readmePath), 'utf8'),
		previewHeights: JSON.parse(readFileSync(resolve(root, previewHeightsPath), 'utf8')),
		motion: readFileSync(resolve(root, 'packages/react/src/motion.mjs'), 'utf8'),
		contract,
		authored: authoredCss.map((path) => ({ path, rules: walkRules(readFileSync(resolve(root, path), 'utf8')) })),
		read: (path) => readFileSync(resolve(root, path), 'utf8'),
	};
}

/** The README's "Cascade layers" blocks: paragraphs, the sentence before the fence, the fence's text and the closing sentence. */
export function readmeCascade(readme) {
	const start = readme.indexOf('\n## Cascade layers\n');
	if (start < 0) throw new Error('README.md has no Cascade layers section');
	const rest = readme.slice(start + '\n## Cascade layers\n'.length);
	const end = rest.search(/^## /mu);
	const blocks = (end < 0 ? rest : rest.slice(0, end)).trim().split(/\n\n+/u);
	const fence = blocks.findIndex((block) => block.startsWith('```'));
	if (fence < 3 || fence !== blocks.length - 2) throw new Error('the README cascade section no longer has three paragraphs, an introduction, a code block and a closing sentence');
	return {
		paragraphs: blocks.slice(0, fence - 1).map((block) => collapse(block.replaceAll('`', ''))),
		intro: collapse(blocks[fence - 1].replaceAll('`', '')),
		code: blocks[fence].replace(/^```[a-z]*\n/u, '').replace(/\n```$/u, ''),
		closing: collapse(blocks[fence + 1].replaceAll('`', '')),
	};
}

// ---------------------------------------------------------------------------------------------------------------------------
// The page's own examples: what an observed tag or the Rendered DOM block must find
// ---------------------------------------------------------------------------------------------------------------------------

/** Every element of the page's rendered examples (the Basic example and the named ones), template content left out as a browser leaves it. */
function exampleElements(root) {
	const sections = elements(root).filter((node) => node.tagName === 'section' && ['basic', 'examples'].includes(attributeValue(node, 'id')));
	return sections.flatMap((section) => elements(section).filter(insideLive));
}

/** Whether an element is inside a demo's live frame, where the example renders. */
function insideLive(node) {
	for (let parent = node.parentNode; parent?.tagName !== undefined; parent = parent.parentNode) if (classNames(parent).has('demo-live')) return true;
	return false;
}

/** Whether an element is what a documented hook selects: a chain of compounds (`.a .b`, `button.c`), each an optional tag and classes. */
function matchesHook(node, hook) {
	const compounds = hook.split(/\s+|\s*>\s*/u).filter(Boolean).map((compound) => /^([a-z][a-z0-9]*)?((?:\.[\w-]+)*)(?:\[[^\]]*\])*$/u.exec(compound));
	if (compounds.some((compound) => compound === null)) return false;
	const is = (candidate, [, tag, classes]) => (tag === undefined || candidate.tagName === tag) && classes.split('.').filter(Boolean).every((name) => classNames(candidate).has(name));
	if (!is(node, compounds.at(-1))) return false;
	let parent = node.parentNode;
	for (const compound of compounds.slice(0, -1).reverse()) {
		while (parent?.tagName !== undefined && !is(parent, compound)) parent = parent.parentNode;
		if (parent?.tagName === undefined) return false;
		parent = parent.parentNode;
	}
	return true;
}

const ancestors = (node) => {
	const list = [];
	for (let parent = node.parentNode; parent?.tagName !== undefined; parent = parent.parentNode) list.push(parent);
	return list;
};

// ---------------------------------------------------------------------------------------------------------------------------
// What the family's sources say
// ---------------------------------------------------------------------------------------------------------------------------

const documentedDispositions = ['class', 'root-element', 'field', 'composed'];

/** The family's part-map rows, and the hook each documented row has (null where it has none). */
function expectedClassRows(sources, slug) {
	const { partRows, selectorOf } = sources.partMap;
	return partRows.filter((row) => row.family === slug).map((row) => ({
		part: row.part,
		disposition: row.disposition,
		hook: documentedDispositions.includes(row.disposition) ? selectorOf(row) : null,
		row,
	}));
}

/** The attribute each catalog state lands on, by the part map's classification, with the catalog names that land on it (in catalog order). */
function catalogAttributes(sources, states) {
	const attributes = new Map();
	for (const name of states) {
		const classification = sources.partMap.catalogStateKinds[name];
		if (classification === undefined) continue;
		const [kind, target] = classification;
		const attribute = kind === 'state' || kind === 'enum' ? `data-muxui-state-${target}` : kind === 'status' ? `data-muxui-${target}` : null;
		if (attribute !== null) attributes.set(attribute, { kind, names: [...(attributes.get(attribute)?.names ?? []), name] });
	}
	return attributes;
}

/** The family's root row: the part named root, else the part that is the root element itself (Toast, Tooltip). */
const rootRowOf = (classRows) => classRows.find((row) => row.part === 'root') ?? classRows.find((row) => row.disposition === 'root-element') ?? classRows[0];

/**
 * The public root classes of other families that every root element of this family carries in the page's examples (IconButton's root is
 * also a Button). A root the caller supplies may be a native element, so no render proves a companion for it.
 */
function companionClasses(sources, slug, classRows, exampleNodes) {
	const root = rootRowOf(classRows);
	if (root.row.hook === undefined || root.row.callerSupplied !== undefined) return [];
	const roots = exampleNodes.filter((node) => classNames(node).has(root.row.hook));
	if (roots.length === 0) return [];
	const otherRoots = new Set(sources.partMap.partRows.filter((row) => row.family !== slug && (row.part === 'root' || row.disposition === 'root-element') && !['none', 'internal'].includes(row.disposition) && row.hook !== undefined).map((row) => row.hook));
	return [...otherRoots].filter((hook) => roots.every((node) => classNames(node).has(hook)));
}

/** The values and default of a reflected prop: the declared enum, else the declared literal union (a named type through the derived API), else the values a rule selects. */
function propValues(api, prop, stylesheetValues) {
	const detail = api.propDetails?.[prop];
	const literals = (members) => {
		const values = members.filter(({ kind }) => kind !== 'undefined' && kind !== 'null');
		return values.length > 0 && values.every(({ kind }) => kind === 'literal') ? values.map(({ value }) => String(value)) : null;
	};
	let values = detail?.enum ? detail.enum.map(String) : null;
	if (values === null && detail?.type?.kind === 'union') values = literals(detail.type.members);
	if (values === null && detail?.type?.kind === 'reference') {
		const target = api.types?.[detail.type.name]?.type;
		values = target?.kind === 'union' ? literals(target.members) : null;
	}
	const fallback = api.defaults?.[prop] === undefined ? undefined : String(api.defaults[prop]);
	return values === null ? { values: stylesheetValues, fallback: undefined } : { values, fallback };
}

/**
 * Every row the Hooks table of a family must have, in order, with where each attribute is selected by a rule of the stylesheet and
 * where an example of the page carries it. Nothing here reads the projection: the part map, the catalog's states, the selection index
 * of the stylesheet and the page's own examples decide.
 */
function expectedHooks({ sources, slug, artifact, binding, classRows, exampleNodes }) {
	const { selection, interactionStates } = sources;
	const rootRow = rootRowOf(classRows);
	const companions = companionClasses(sources, slug, classRows, exampleNodes);
	const order = classRows.map(({ part }) => part);
	const documented = classRows.filter(({ disposition }) => documentedDispositions.includes(disposition));
	const carriers = new Map(documented.map((entry) => [entry.part, exampleNodes.filter((node) => matchesHook(node, entry.hook))]));
	const emittedOf = (attribute) => documented.filter(({ part }) => carriers.get(part).some((node) => attributeValue(node, attribute) !== undefined)).map(({ part }) => part);
	const selectedOf = (attribute) => {
		const byClass = selection.get(attribute);
		if (byClass === undefined) return { parts: [], internal: [], companion: null };
		const own = documented.filter(({ row }) => byClass.has(row.hook)).map(({ part }) => part);
		const internal = unique(classRows.filter(({ disposition, row }) => disposition === 'internal' && byClass.has(row.hook)).map(({ part }) => part));
		const found = companions.find((hook) => byClass.has(hook));
		const companion = found !== undefined && rootRow !== undefined && !own.includes(rootRow.part) ? found : null;
		const parts = unique(companion === null ? own : [...own, rootRow.part]);
		return { parts: order.filter((part) => parts.includes(part)), internal, companion };
	};
	const declared = catalogAttributes(sources, artifact.states);
	const hooksOf = (dispositions) => new Set([...classRows.filter(({ disposition, row }) => dispositions.includes(disposition) && row.hook !== undefined).map(({ row }) => row.hook), ...companions]);
	const styledOn = (hooks) => [...selection].filter(([attribute, byClass]) => attribute.startsWith('data-muxui-state-') && [...byClass.keys()].some((name) => hooks.has(name))).map(([attribute]) => attribute);
	const styledOwn = styledOn(hooksOf(['class', 'root-element']));
	const styledWide = styledOn(hooksOf(documentedDispositions));
	const stateName = (attribute) => attribute.slice('data-muxui-state-'.length);
	const states = [
		...[...declared].map(([attribute, { kind, names }]) => ({ attribute, origin: 'catalog', kind, names })),
		...interactionStates.map((name) => `data-muxui-state-${name}`).filter((attribute) => styledOwn.includes(attribute) && !declared.has(attribute)).map((attribute) => ({ attribute, origin: 'interaction' })),
		...styledWide.filter((attribute) => !declared.has(attribute) && !interactionStates.includes(stateName(attribute)) && emittedOf(attribute).length > 0).sort().map((attribute) => ({ attribute, origin: 'observed' })),
	].map((entry) => ({ ...entry, selected: selectedOf(entry.attribute), emitted: emittedOf(entry.attribute) }));

	const props = new Set(binding.api.props ?? []);
	const owners = companions.map((hook) => sources.partMap.partRows.find((row) => row.hook === hook && (row.part === 'root' || row.disposition === 'root-element'))?.family);
	const reflected = [];
	for (const [attribute, byClass] of selection) {
		if (attribute.startsWith('data-muxui-state-') || declared.has(attribute)) continue;
		const prop = attribute.slice('data-muxui-'.length);
		if (!props.has(prop)) continue;
		const selected = selectedOf(attribute);
		if (selected.parts.length === 0) continue;
		const stylesheetValues = unique([...byClass].filter(([className]) => classRows.some(({ row }) => row.hook === className) || companions.includes(className)).flatMap(([, values]) => [...values]));
		reflected.push({ attribute, prop, selected, emitted: emittedOf(attribute), ...propValues(binding.api, prop, stylesheetValues) });
	}
	reflected.sort((left, right) => left.attribute.localeCompare(right.attribute));

	// The attributes a family neither has as a prop, nor selects, nor writes: size, variant and color, only where it styles reflected props.
	const runtimeWrites = (family) => {
		const source = sources.contract.components.find((entry) => entry.slug === family)?.source;
		return (probe) => source !== undefined && new RegExp(`data-muxui-${probe}(?![\\w-])`, 'u').test(sources.read(source));
	};
	const everyAttribute = new Set(exampleNodes.flatMap((node) => (node.attrs ?? []).map(({ name }) => name)));
	const shown = new Set(reflected.map(({ attribute }) => attribute));
	const notSet = reflected.length === 0 ? [] : notSetNames.filter((probe) => !props.has(probe) && !shown.has(`data-muxui-${probe}`) && !runtimeWrites(slug)(probe)
		&& !owners.some((owner) => owner !== undefined && runtimeWrites(owner)(probe)) && !everyAttribute.has(`data-muxui-${probe}`)).map((probe) => `data-muxui-${probe}`);

	// A class row: the tags of the elements its hook selects in the page's examples and whether every one is inside a root element.
	const rootElements = rootRow === undefined || rootRow.hook === null ? [] : exampleNodes.filter((node) => matchesHook(node, rootRow.hook));
	const classes = classRows.map((entry) => {
		const found = documented.includes(entry) ? carriers.get(entry.part) : [];
		const qualifier = entry.disposition === 'root-element' ? /^([a-z]+)\./u.exec(entry.row.selector ?? '')?.[1] : undefined;
		const tags = unique(found.map((node) => node.tagName));
		return { ...entry, found, tags: tags.length > 0 ? tags : qualifier === undefined ? [] : [qualifier], inRoot: entry.part !== 'root' && found.length > 0 && found.every((node) => ancestors(node).some((parent) => rootElements.includes(parent))) };
	});
	return { classes, states, reflected, notSet, rootRow, companions };
}

/** Which rules of the components layer read each custom property: `var(--name` in a declaration's value, with the selector, the at-rules around the rule and the property set. */
function readsByName(rules) {
	const reads = new Map();
	for (const { selector, chain, body } of rules) {
		if (!chain.includes('@layer muxui.components')) continue;
		for (const [, property, value] of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]*)/gu)) {
			for (const [, name] of value.matchAll(/var\(\s*(--muxui-[\w-]+)/gu)) {
				reads.set(name, [...(reads.get(name) ?? []), { selector, conditions: chain.filter((prelude) => prelude !== '@layer muxui.components'), property }]);
			}
		}
	}
	return reads;
}

/**
 * What a component role's "Read by" cell must say, worked out from the stylesheet alone: the rules that read the role's custom property (or the
 * ones its structured parts declare), each with the at-rules around it and whether every Mux class it names is a documented hook; else the
 * dependent token that is read; else that nothing reads it.
 * Returns `{ kind, text }`, where `text` is what a reader sees (the rules form is the page's own markup, the others a sentence).
 */
export function expectedReadBy(sources, id) {
	const { core, light, reads, partMap } = sources;
	const base = core.cssName(id);
	const names = [...core.cssDeclaration(light.tokens[id], light.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu)].map(([, name]) => name);
	const isRead = (name) => (reads.get(name) ?? []).length > 0;
	const documentedHook = (name) => partMap.partRows.some((row) => row.hook === name && ['class', 'root-element', 'field', 'composed'].includes(row.disposition)) || partMap.publicSharedClasses.includes(name);
	const classesOf = (selector) => [...new Set([...selector.replace(/(["'])(?:(?!\1).)*\1/gu, '').matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name))];
	const readOf = (name) => (reads.get(name) ?? []).map(({ selector, conditions, property }) => ({ selector, conditions, property, public: classesOf(selector).every(documentedHook) }));
	const unique = (list) => [...new Map(list.map((item) => [JSON.stringify(item), item])).values()];
	const readers = unique(names.flatMap(readOf));
	const condition = ({ conditions }) => (conditions.length > 0 ? ` (${conditions.join(' ')})` : '');
	if (isRead(base)) {
		return { kind: 'rules', text: `Read by ${readers.map((reader) => `${reader.selector}${condition(reader)}${reader.public ? '' : ' implementation selector, not a public hook'}`).join('; ')}.` };
	}
	const sentenceOf = (reader) => `${reader.selector}${condition(reader)}${reader.public ? '' : ' [implementation selector, not a public hook]'}`;
	if (names.some(isRead)) {
		return { kind: 'parts', text: `Read through its structured parts (${names.filter(isRead).join(', ')}) by ${readers.map(sentenceOf).join('; ')}.` };
	}
	const dependents = new Map();
	for (const token of Object.keys(light.tokens)) for (const dependency of light.dependencies[token] ?? []) dependents.set(dependency, [...(dependents.get(dependency) ?? []), token]);
	const declaredNames = (token) => [...core.cssDeclaration(light.tokens[token], light.dependencies).matchAll(/^\s+(--muxui-[\w-]+):/gmu)].map(([, name]) => name);
	const dependentRead = (token, seen = new Set()) => (seen.has(token) ? [] : (seen.add(token), (dependents.get(token) ?? []).flatMap((next) => (declaredNames(next).some(isRead) ? [next] : dependentRead(next, seen)))));
	const through = [...new Set(dependentRead(id))];
	if (through.length > 0) return { kind: 'compiled', text: `Read through ${through.join(', ')}, which depends on it.` };
	return { kind: 'none', text: 'Declared. No Mux CSS rule reads this role today.' };
}

/** Whether a rule of the stylesheet reads a custom property: `var(--x)` or `var(--x,`. */
const readsDirectly = (css, name) => new RegExp(`var\\(\\s*${name}(?![\\w-])`, 'u').test(css);

function importantOf(sources, slug) {
	const hooks = new Set(sources.partMap.partRows.filter((row) => row.family === slug && ['class', 'root-element', 'composed'].includes(row.disposition) && row.hook !== undefined).map((row) => row.hook));
	const byCause = {};
	let total = 0;
	for (const { selector, chain, body } of sources.rules) {
		if (!chain.some((prelude) => prelude === '@layer muxui.components')) continue;
		const count = (body.match(/!important/gu) ?? []).length;
		if (count === 0) continue;
		const mentioned = [...selector.matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name);
		if (!mentioned.some((name) => hooks.has(name))) continue;
		const cause = chain.some((prelude) => /^@media[^{]*forced-colors/u.test(prelude)) ? 'forced-colors'
			: chain.some((prelude) => /^@media[^{]*prefers-reduced-motion/u.test(prelude)) ? 'reduced-motion-media'
				: /\[data-muxui-motion=['"]reduced['"]\]|\[data-muxui-motion-reduced/u.test(selector) ? 'reduced-motion-attribute' : 'other';
		byCause[cause] = (byCause[cause] ?? 0) + count;
		total += count;
	}
	return { total, byCause };
}

/** The paths the Sources "Styling" group must list: the part map, the reference, the stylesheets that style the family's hooks, the token record and the README. */
export function expectedStylingSources(sources, { slug, root: pageRoot }) {
	const exampleNodes = exampleElements(pageRoot);
	const rows = expectedClassRows(sources, slug);
	const hooks = new Set([...rows.filter(({ row }) => documentedDispositions.includes(row.disposition) && row.hook !== undefined).map(({ row }) => row.hook), ...companionClasses(sources, slug, rows, exampleNodes)]);
	const styles = sources.authored.filter(({ rules }) => rules.some(({ selector }) => subjectClasses(selector).some((name) => hooks.has(name) || [...hooks].some((hook) => name.startsWith(`${hook}--`))))).map(({ path }) => path);
	return [partMapPath, referencePath, ...styles, tokenRecordPath, readmePath];
}

// ---------------------------------------------------------------------------------------------------------------------------
// The page's Styling section, read as a reader would
// ---------------------------------------------------------------------------------------------------------------------------

const byAttribute = (node, name) => elements(node).filter((child) => attributeValue(child, name) !== undefined);
const byTag = (node, tag) => elements(node).filter((child) => child.tagName === tag);

function renderedHooks(section) {
	const table = byAttribute(section, 'data-styling-table').find((node) => attributeValue(node, 'data-styling-table') === 'hooks');
	if (table === undefined) return null;
	return byTag(table, 'tbody').map((tbody) => ({
		group: attributeValue(tbody, 'data-styling-group'),
		label: text({ childNodes: (byTag(tbody, 'th').find((th) => attributeValue(th, 'scope') === 'rowgroup') ?? { childNodes: [] }).childNodes.filter((node) => !(node.tagName === 'span' && classNames(node).has('styling-hint'))) }),
		hint: (() => { const heading = byTag(tbody, 'th').find((th) => attributeValue(th, 'scope') === 'rowgroup'); const node = heading === undefined ? undefined : byTag(heading, 'span').find((span) => classNames(span).has('styling-hint')); return node === undefined ? null : text(node); })(),
		rows: byTag(tbody, 'tr').filter((tr) => !classNames(tr).has('styling-group-row')).map((tr) => {
			const [head, on, notes] = [byTag(tr, 'th')[0], ...byTag(tr, 'td')];
			const code = byTag(head, 'code')[0];
			// The On cell of a state or reflected row: the parts a render showed, and the parts only a rule selects (each followed by `styled`).
			const emitted = [];
			const styled = [];
			for (const node of on.childNodes ?? []) {
				if (node.tagName === 'code') emitted.push(text(node));
				else if (node.tagName === 'span' && classNames(node).has('styling-evidence') && emitted.length > 0) styled.push(emitted.pop());
			}
			return {
				hook: text(code),
				noHook: attributeValue(code, 'data-styling-no-hook') !== undefined,
				notSet: classNames(tr).has('styling-not-set'),
				on: text(on),
				tags: byTag(on, 'code').map((node) => text(node)).filter((value) => /^<[a-z0-9-]+>$/u.test(value)),
				emitted,
				styled,
				notes: text(notes),
			};
		}),
	}));
}

/** The Default cell of a role as structure: an alias printed once, then one line, or a light and a dark line, each with its swatch. */
function defaultsOf(cell) {
	const swatchOf = (node) => /--s:\s*([^;]+)/u.exec(attributeValue(node, 'style') ?? '')?.[1]?.trim() ?? '';
	const readLine = (node) => {
		const line = { scheme: null, alias: null, swatch: null, value: '' };
		for (const child of node.childNodes ?? []) {
			if (child.nodeName === '#text') line.value += child.value;
			else if (classNames(child).has('styling-scheme')) line.scheme = text(child);
			else if (classNames(child).has('styling-alias')) line.alias = text(child);
			else if (classNames(child).has('styling-swatch')) line.swatch = swatchOf(child);
		}
		return { ...line, value: collapse(line.value) };
	};
	const lines = [];
	let alias = null;
	for (const child of cell.childNodes ?? []) {
		if (child.tagName === undefined) continue;
		if (classNames(child).has('styling-alias')) alias = text(child);
		else if (classNames(child).has('styling-value')) lines.push(readLine(child));
	}
	return { alias, lines: lines.length > 0 ? lines : [readLine({ childNodes: (cell.childNodes ?? []).filter((child) => child.nodeName === '#text' || classNames(child).has('styling-swatch')) })] };
}

function renderedTokens(section) {
	return byAttribute(section, 'data-styling-group').filter((node) => ['div', 'details'].includes(node.tagName) && attributeValue(node, 'data-styling-table') === undefined && byAttribute(node, 'data-styling-table').some((table) => attributeValue(table, 'data-styling-table').startsWith('tokens-'))).map((group) => {
		const table = byAttribute(group, 'data-styling-table')[0];
		return {
			id: attributeValue(group, 'data-styling-group'),
			details: group.tagName === 'details',
			label: text(byTag(group, 'h4')[0]),
			headingId: attributeValue(byTag(group, 'h4')[0], 'id'),
			rows: byTag(table, 'tbody').flatMap((tbody) => byTag(tbody, 'tr')).map((tr) => {
				const head = byTag(tr, 'th')[0];
				const cells = byTag(tr, 'td');
				const subs = byTag(head, 'span').filter((node) => classNames(node).has('styling-sub'));
				const readBy = subs.find((node) => attributeValue(node, 'data-styling-read-by') !== undefined);
				return {
					token: text(byTag(head, 'code')[0]),
					cssVar: text(subs[0]),
					requirement: (() => { const node = subs.find((candidate) => attributeValue(candidate, 'data-styling-requirement') !== undefined); return node === undefined ? null : text(node); })(),
					readKind: readBy === undefined ? null : attributeValue(readBy, 'data-styling-read-by'),
					readText: readBy === undefined ? null : text(readBy),
					meaning: text(cells[0]),
					policy: text(cells[1]),
					fixedClass: classNames(cells[1]).has('styling-fixed'),
					defaults: text(cells[2]),
					shape: defaultsOf(cells[2]),
				};
			}),
		};
	});
}

function renderedOverrides(section) {
	const prose = byAttribute(section, 'data-styling-override-text')[0];
	const who = byAttribute(section, 'data-styling-table').find((node) => attributeValue(node, 'data-styling-table') === 'who-wins');
	const first = (name) => byAttribute(section, name)[0];
	return {
		readme: prose === undefined ? [] : byAttribute(prose, 'data-styling-readme').map((node) => text(node)),
		layerCode: byAttribute(section, 'data-styling-layer-code').map((node) => textContent(node)),
		motion: first('data-styling-motion') === undefined ? null : text(first('data-styling-motion')),
		who: who === undefined ? [] : byTag(who, 'tr').filter((tr) => attributeValue(tr, 'data-styling-who') !== undefined).map((tr) => ({ id: attributeValue(tr, 'data-styling-who'), declaration: text(byTag(tr, 'th')[0]), against: text(byTag(tr, 'td')[0]), winner: text(byTag(tr, 'td')[1]) })),
		limit: first('data-styling-limit') === undefined ? null : text(first('data-styling-limit')),
		important: first('data-styling-important') === undefined ? null : text(first('data-styling-important')),
	};
}

/** The changes a recipe's CSS makes, in the order it prints them: the theme roles it assigns, then each part or state rule. */
export function recipeChanges(css) {
	const rules = css.slice(css.indexOf('\n\n') + 2);
	return [
		...[...rules.matchAll(/(--muxui-[\w-]+)\s*:\s*([^;}]+)/gu)].map(([, name, value]) => ({ kind: 'token', selector: '.my-scope', property: name, value: collapse(value), declaration: `${name}: ${collapse(value)}` })),
		...[...rules.matchAll(/(?:^|\s)(\.my-scope [^{]+?)\s*\{\s*([a-z-]+)\s*:\s*([^;}]+)/gu)].map(([, selector, property, value]) => ({ kind: /\[data-muxui-/u.test(selector) ? 'state' : 'part', selector: collapse(selector), property, value: collapse(value), declaration: `${property}: ${collapse(value)}` })),
	];
}

/** The two previews and the computed-change table of the Recipe block. */
function renderedPreviews(section) {
	const sourceOf = (island) => { try { return JSON.parse(attributeValue(island, 'props') ?? '{}').source?.[1] ?? null; } catch { return null; } };
	const panes = byAttribute(section, 'data-styling-pane').map((pane) => ({
		name: attributeValue(pane, 'data-styling-pane'),
		islands: byTag(pane, 'astro-island').map((island) => ({ source: sourceOf(island), client: attributeValue(island, 'client'), scoped: ancestors(island).some((parent) => classNames(parent).has('my-scope')) })),
		scopes: elements(pane).filter((node) => classNames(node).has('my-scope')).length,
		styles: byTag(pane, 'style').map((node) => collapse(textContent(node))),
	}));
	const compare = byAttribute(section, 'data-styling-compare')[0];
	const reserve = compare === undefined ? null : { narrow: Number(/--preview-h-narrow:\s*(\d+)px/u.exec(attributeValue(compare, 'style') ?? '')?.[1] ?? Number.NaN), wide: Number(/--preview-h-wide:\s*(\d+)px/u.exec(attributeValue(compare, 'style') ?? '')?.[1] ?? Number.NaN) };
	const table = byAttribute(section, 'data-styling-table').find((node) => attributeValue(node, 'data-styling-table') === 'computed');
	return {
		panes,
		reserve,
		// How many examples each my-scope wrapper of the section holds.
		scopeIslands: elements(section).filter((node) => classNames(node).has('my-scope')).map((scope) => byTag(scope, 'astro-island').length),
		computed: table === undefined ? null : byTag(table, 'tbody').flatMap((tbody) => byTag(tbody, 'tr')).map((tr) => ({
			kind: attributeValue(tr, 'data-step-kind'),
			target: attributeValue(tr, 'data-step-target'),
			property: attributeValue(tr, 'data-step-property'),
			scope: attributeValue(tr, 'data-step-scope'),
			stepText: attributeValue(tr, 'data-step-text'),
			head: text(byTag(tr, 'th')[0]),
			headCodes: byTag(byTag(tr, 'th')[0], 'code').map((node) => text(node)),
			cells: byTag(tr, 'td').map((node) => ({ text: text(node), colspan: attributeValue(node, 'colspan') ?? null, measure: attributeValue(node, 'data-measure') ?? null, hidden: attributeValue(node, 'hidden') !== undefined })),
		})),
	};
}

function renderedRecipe(section) {
	const block = (id) => elements(section).find((node) => attributeValue(node, 'id') === id);
	const codeOf = (id) => { const node = block(id); const code = node === undefined ? undefined : byTag(node, 'code')[0]; return code === undefined ? null : textContent(code); };
	return {
		css: codeOf('styling-recipe-css'),
		markup: codeOf('styling-recipe-markup'),
		opening: byAttribute(section, 'data-styling-recipe-count').map((node) => text(node)),
		checks: byAttribute(section, 'data-styling-checks').flatMap((node) => byTag(node, 'li')).map((node) => text(node)),
		notes: byAttribute(section, 'data-styling-recipe-note').map((node) => text(node)),
		ci: byAttribute(section, 'data-styling-ci').map((node) => text(node)),
	};
}

/** The Styling section of a built page as data: what was printed, so a comparison needs no further reading of the markup. */
export function renderedStyling(root) {
	const section = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'styling');
	if (section === undefined) return null;
	const heading = byTag(section, 'h2')[0];
	const dom = byAttribute(section, 'data-styling-dom')[0];
	return {
		section,
		h2: heading === undefined ? null : text(heading),
		aliases: elements(root).filter((node) => attributeValue(node, 'id') === 'anatomy-and-styling').map((node) => ({ tag: node.tagName, inH2: heading !== undefined && elements(heading).includes(node), empty: text(node) === '', href: attributeValue(node, 'href'), tabindex: attributeValue(node, 'tabindex') })),
		h3: byTag(section, 'h3').map((node) => [attributeValue(node, 'id'), text(node)]),
		hooks: renderedHooks(section),
		dom: dom === undefined ? null : textContent(dom),
		tokens: renderedTokens(section),
		overrides: renderedOverrides(section),
		recipe: renderedRecipe(section),
		previews: renderedPreviews(section),
		scripts: elements(root).filter((node) => node.tagName === 'script').map((node) => ({ src: attributeValue(node, 'src') ?? null, attributes: node.attrs.map(({ name }) => name).sort(), inline: textContent(node) })),
		scopeClasses: elements(root).filter((node) => classNames(node).has('my-scope')).length,
		text: text(section),
	};
}

/** The longhands a browser reports for a property that a rule may declare as a shorthand or by its logical name. */
const reported = {
	background: ['background-color'],
	border: ['border-top-color', 'border-top-width', 'border-top-style'],
	'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
	'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
	'inline-size': ['width'],
	'block-size': ['height'],
	'text-decoration': ['text-decoration-line'],
};
const reportedFor = (property) => reported[property] ?? [property];

/**
 * The rules of the components layer that read a custom property in a declaration: the selector each names and the property it sets. A role
 * that a rule hands to a private custom property (`--x: var(--role)`) is followed to the rules that read that property, with their own
 * selectors, because the value inherits to them.
 */
function readersOf(sources, cssVar, seen = new Set()) {
	if (seen.has(cssVar)) return [];
	seen.add(cssVar);
	const readers = [];
	for (const { selector, chain, body } of sources.rules) {
		if (!chain.includes('@layer muxui.components')) continue;
		for (const [, property, value] of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]*)/gu)) {
			if (!new RegExp(`var\\(\\s*${cssVar}(?![\\w-])`, 'u').test(value)) continue;
			const selectors = splitTopLevel(selector, ',').map((part) => collapse(part));
			if (property.startsWith('--')) readers.push(...selectors.map((part) => ({ selector: part, property, through: true })), ...readersOf(sources, property, seen));
			else readers.push(...selectors.map((part) => ({ selector: part, property })));
		}
	}
	return readers;
}

// ---------------------------------------------------------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * The differences between the Styling section of a built page and what its sources say. `root` is the parsed page: the examples it
 * rendered are where an observed tag or the Rendered DOM block must find its elements.
 */
export function checkStyling({ sources, slug, artifact, root, route, measureUrl }) {
	const problems = [];
	const report = (message) => problems.push(`${route} ${message}`);
	const rendered = renderedStyling(root);
	if (rendered === null) {
		report('has no Styling section (section#styling).');
		return problems;
	}
	const binding = artifact.bindings['web.react'];
	const exampleNodes = exampleElements(root);
	// A family whose examples the page renders only in the browser (TimeField's client-only host) has no example markup to tie an observed tag or the Rendered DOM to.
	// That is the one exception, and it holds only while the page really has none.
	const rendersMux = exampleNodes.some((node) => [...classNames(node)].some((name) => name.startsWith('muxui-')));
	const clientOnly = !rendersMux && exampleNodes.some((node) => node.tagName === 'astro-island' && attributeValue(node, 'client') === 'only');
	if (!rendersMux && !clientOnly) report('renders no example markup with a Mux class, so its observed tags and Rendered DOM cannot be tied to the page.');

	// The section: one h2, the legacy alias in it, four h3 in order.
	if (rendered.h2 !== 'Styling') report(`Styling section heading reads "${rendered.h2}".`);
	if (rendered.aliases.length !== 1 || !rendered.aliases[0].inH2 || rendered.aliases[0].tag !== 'a' || !rendered.aliases[0].empty || rendered.aliases[0].href !== undefined || rendered.aliases[0].tabindex !== undefined) {
		report(`must keep #anatomy-and-styling as one empty, unlinked, unfocusable alias inside the Styling heading; it has ${JSON.stringify(rendered.aliases)}.`);
	}
	if (!same(rendered.h3, [['styling-hooks', 'Hooks'], ['styling-tokens', 'Tokens'], ['styling-override-rules', 'Override rules'], ['styling-recipe', 'Recipe']])) {
		report(`Styling sub-blocks are ${JSON.stringify(rendered.h3)}, expected Hooks, Tokens, Override rules and Recipe with their ids.`);
	}
	// The page script is one shared, versioned file: the page names the build's copy with a single deferred script tag, and no page carries a copy of it.
	const measureTags = rendered.scripts.filter(({ src }) => (src ?? '').includes('styling-measure'));
	if (measureTags.length !== 1 || measureTags[0].src !== measureUrl || !same(measureTags[0].attributes, ['defer', 'src']) || measureTags[0].inline !== '') {
		report(`must load ${measureUrl} (the hash of the script's content) with exactly one deferred script tag that holds nothing; it has ${JSON.stringify(measureTags)}.`);
	}
	const copies = rendered.scripts.filter(({ src, inline }) => src === null && /#styling|data-step-|data-styling-/u.test(inline));
	if (copies.length > 0) report(`carries ${copies.length} inline script${copies.length === 1 ? '' : 's'} that read the Styling section; the docs serve that script once, at ${measureUrl}.`);
	for (const pattern of bannedPhrases) if (pattern.test(rendered.text)) report(`Styling section prints "${pattern.exec(rendered.text)[0]}", which the sources do not support.`);

	// Hooks: the rows of every group, their order, where each attribute is selected by a rule and where an example carries it, all derived
	// from the part map, the catalog, the stylesheet and the page's own examples.
	const hooks = rendered.hooks;
	const classRows = expectedClassRows(sources, slug);
	if (hooks === null) {
		report('has no Hooks table.');
	} else {
		const expected = expectedHooks({ sources, slug, artifact, binding, classRows, exampleNodes });
		const group = (id) => hooks.find((candidate) => candidate.group === id);
		const printedOrder = hooks.map(({ group: id }) => id);
		const expectedOrder = ['root', 'part', 'state', 'reflected'].filter((id) => ({ root: true, part: classRows.length > 1, state: expected.states.length > 0, reflected: expected.reflected.length > 0 || expected.notSet.length > 0 })[id]);
		if (!same(printedOrder, expectedOrder)) report(`Hooks groups are ${printedOrder.join(', ')}, expected ${expectedOrder.join(', ')}.`);
		for (const candidate of hooks) {
			if (candidate.label.replace(/\s+/gu, ' ') !== groupLabels[candidate.group]) report(`Hooks group ${candidate.group} is labelled "${candidate.label}".`);
			if (candidate.hint !== groupHints[candidate.group]) report(`Hooks group ${candidate.group} says ${JSON.stringify(candidate.hint)} beside its name, expected ${JSON.stringify(groupHints[candidate.group])}.`);
		}
		const rootRow = expected.rootRow;
		const expectedRoot = [rootRow].map((row) => row.hook ?? row.part);
		const expectedParts = classRows.filter((row) => row !== rootRow).map((row) => row.hook ?? row.part);
		const printedClass = (id) => (group(id)?.rows ?? []).map(({ hook }) => hook);
		if (!same(printedClass('root'), expectedRoot)) report(`Hooks root class is ${JSON.stringify(printedClass('root'))}, the part map says ${JSON.stringify(expectedRoot)}.`);
		if (!same(printedClass('part'), expectedParts)) report(`Hooks part classes are ${JSON.stringify(printedClass('part'))}, the part map says ${JSON.stringify(expectedParts)}.`);
		for (const row of [...(group('root')?.rows ?? []), ...(group('part')?.rows ?? [])]) {
			const entry = expected.classes.find((candidate) => (candidate.hook ?? candidate.part) === row.hook);
			if (entry === undefined) continue;
			if ((entry.hook === null) !== row.noHook) report(`Hooks row ${row.hook} ${row.noHook ? 'shows no hook' : 'shows a hook'}, the part map's disposition is ${entry.disposition}.`);
			if (entry.row.hookOnly !== undefined && !/Hook only/u.test(row.notes)) report(`Hooks row ${row.hook} does not say that no Mux rule styles it (the part map marks it hook-only).`);
			if (entry.row.hookOnly === undefined && /Hook only/u.test(row.notes)) report(`Hooks row ${row.hook} says no Mux rule styles it, and the part map does not mark it hook-only.`);
			if (entry.row.callerSupplied !== undefined && !row.notes.includes('caller') && !/native/iu.test(row.notes)) report(`Hooks row ${row.hook} drops the condition the part map records for it (${entry.row.callerSupplied.slice(0, 60)}).`);
			if (clientOnly || !documentedDispositions.includes(entry.disposition) || entry.row.callerSupplied !== undefined) continue;
			// The tags are those of the elements the hook selects in the page's own examples, exactly; "in root" holds for all of them or the cell does not say it.
			const printedTags = row.tags.map((tag) => tag.slice(1, -1));
			if (!same([...printedTags].sort(), [...entry.tags].sort())) report(`Hooks row ${row.hook} shows the tags ${JSON.stringify(printedTags)}, the page's own examples give ${JSON.stringify(entry.tags)} for it.`);
			if (/ in root$/u.test(row.on) !== entry.inRoot) report(`Hooks row ${row.hook} ${/ in root$/u.test(row.on) ? 'says "in root"' : 'does not say "in root"'}, and ${entry.inRoot ? 'every' : 'not every'} element of the page's own examples that it selects is inside a root.`);
			if (entry.found.length === 0 !== /Not in a catalog example\./u.test(row.notes)) report(`Hooks row ${row.hook} ${entry.found.length === 0 ? 'is carried by no example of the page and does not say so' : 'says it is in no example, and an example of the page carries it'}.`);
		}

		// State attributes: the catalog's, the interaction states a rule selects on the family's own hooks, and those a render shows that a rule selects.
		const stateRows = group('state')?.rows ?? [];
		if (!same(stateRows.map(({ hook }) => hook), expected.states.map(({ attribute }) => attribute))) {
			report(`Hooks state rows are ${JSON.stringify(stateRows.map(({ hook }) => hook))}, the catalog, the stylesheet and the examples give ${JSON.stringify(expected.states.map(({ attribute }) => attribute))}.`);
		}
		for (const state of expected.states) {
			const row = stateRows.find(({ hook }) => hook === state.attribute);
			if (row === undefined) continue;
			const styledOnly = state.selected.parts.filter((part) => !state.emitted.includes(part));
			if (clientOnly) {
				// The examples of this page render only in the browser, so no markup shows where an attribute is carried; every part a rule selects must still be named.
				if (!state.selected.parts.every((part) => [...row.emitted, ...row.styled].includes(part))) report(`Hooks row ${state.attribute} leaves out a part a rule selects it on (${JSON.stringify(state.selected.parts)}): ${JSON.stringify([...row.emitted, ...row.styled])}.`);
			} else {
				if (!same(row.emitted, state.emitted)) report(`Hooks row ${state.attribute} says a render shows it on ${JSON.stringify(row.emitted)}, the examples of the page show it on ${JSON.stringify(state.emitted)}.`);
				if (!same(row.styled, styledOnly)) report(`Hooks row ${state.attribute} says only a rule selects it on ${JSON.stringify(row.styled)}, the stylesheet selects it on ${JSON.stringify(styledOnly)} beyond the examples.`);
				if ((row.on === '-') !== (state.emitted.length === 0 && styledOnly.length === 0)) report(`Hooks row ${state.attribute} has the location "${row.on}".`);
			}
			const saysCatalog = /^(?:Catalog states? |Status row from the catalog)/u.test(row.notes);
			if ((state.origin === 'catalog') !== saysCatalog) report(`Hooks row ${state.attribute} ${state.origin === 'catalog' ? 'is declared by the catalog and does not say so' : 'says the catalog declares it, and the catalog does not'}.`);
			if (state.origin === 'catalog' && state.kind !== 'status') {
				const label = `Catalog state${state.names.length > 1 ? 's' : ''} ${state.names.join(', ')}.`;
				if (!row.notes.startsWith(label)) report(`Hooks row ${state.attribute} names the catalog states differently from "${label}": ${JSON.stringify(row.notes.slice(0, 80))}.`);
				const selects = /Styled by Mux on (.+?)\.(?: |$)/u.exec(row.notes)?.[1];
				if (state.selected.parts.length > 0 ? selects !== state.selected.parts.join(', ') : selects !== undefined) report(`Hooks row ${state.attribute} says a rule selects it on ${JSON.stringify(selects ?? null)}, the stylesheet selects it on ${JSON.stringify(state.selected.parts)}.`);
				if (state.selected.parts.length === 0) {
					const internal = /only on an internal part \((.+?)\)/u.exec(row.notes)?.[1];
					if (state.selected.internal.length > 0 ? internal !== state.selected.internal.join(', ') : internal !== undefined || !/No Mux rule selects this attribute on a documented hook\./u.test(row.notes)) report(`Hooks row ${state.attribute} says ${JSON.stringify(row.notes.slice(label.length + 1))}, the stylesheet selects it on the internal parts ${JSON.stringify(state.selected.internal)} and on no documented hook.`);
				}
			}
			if (state.origin === 'interaction') {
				const selects = /^Interaction state\. Selected by Mux CSS on (.+?)\. /u.exec(row.notes)?.[1];
				if (selects !== state.selected.parts.join(', ')) report(`Hooks row ${state.attribute} says a rule selects it on ${JSON.stringify(selects ?? null)}, the stylesheet selects it on ${JSON.stringify(state.selected.parts)}.`);
			}
		}

		// Reflected attributes: the props of the family that a rule selects on one of its hooks, with their declared values and default.
		const reflectedRows = (group('reflected')?.rows ?? []).filter(({ notSet }) => !notSet);
		if (!same(reflectedRows.map(({ hook }) => hook), expected.reflected.map(({ attribute }) => attribute))) {
			report(`Hooks reflected rows are ${JSON.stringify(reflectedRows.map(({ hook }) => hook))}, the props and the stylesheet give ${JSON.stringify(expected.reflected.map(({ attribute }) => attribute))}.`);
		}
		for (const reflected of expected.reflected) {
			const row = reflectedRows.find(({ hook }) => hook === reflected.attribute);
			if (row === undefined) continue;
			const styledOnly = reflected.selected.parts.filter((part) => !reflected.emitted.includes(part));
			if (clientOnly) {
				if (!reflected.selected.parts.every((part) => [...row.emitted, ...row.styled].includes(part))) report(`Hooks row ${reflected.attribute} leaves out a part a rule selects it on (${JSON.stringify(reflected.selected.parts)}): ${JSON.stringify([...row.emitted, ...row.styled])}.`);
			} else {
				if (!same(row.emitted, reflected.emitted)) report(`Hooks row ${reflected.attribute} says a render shows it on ${JSON.stringify(row.emitted)}, the examples of the page show it on ${JSON.stringify(reflected.emitted)}.`);
				if (!same(row.styled, styledOnly)) report(`Hooks row ${reflected.attribute} says only a rule selects it on ${JSON.stringify(row.styled)}, the stylesheet selects it on ${JSON.stringify(styledOnly)} beyond the examples.`);
			}
			const shown = reflected.values.map((value) => value === reflected.fallback ? `${value} (default)` : value);
			const wantNote = reflected.values.length > 0 ? `Prop ${reflected.prop}: ${shown.join(', ')}.` : `Prop ${reflected.prop}. The value is the prop value.`;
			if (!row.notes.startsWith(wantNote)) report(`Hooks row ${reflected.attribute} reads "${row.notes}", the declared values are ${JSON.stringify(reflected.values)} with the default ${JSON.stringify(reflected.fallback ?? null)}.`);
			if ((reflected.selected.companion !== null) !== /Selected through \.[\w-]+/u.test(row.notes)) report(`Hooks row ${reflected.attribute} ${reflected.selected.companion === null ? 'names a companion hook' : 'does not name the companion hook'} (${reflected.selected.companion}).`);
		}
		// "Not set by" rows: exactly the bounded names a family that styles reflected props neither has, selects nor writes.
		const notSetRows = (group('reflected')?.rows ?? []).filter(({ notSet }) => notSet);
		if (!clientOnly && !same(notSetRows.map(({ hook }) => hook), expected.notSet)) report(`Hooks "not set" rows are ${JSON.stringify(notSetRows.map(({ hook }) => hook))}, the props, the runtime source and the examples give ${JSON.stringify(expected.notSet)}.`);
		for (const row of notSetRows) if (row.on !== '-') report(`Hooks "not set" row ${row.hook} has the location "${row.on}".`);

		// Every hook the notes and the legend mention is a hook of the part map or a row of the table.
		const known = new Set([...sources.partMap.partRows.flatMap((row) => row.hook === undefined ? [] : [`.${row.hook}`]), ...hooks.flatMap(({ rows }) => rows.flatMap(({ hook }) => [...hook.matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => `.${name}`)))]);
		const attributesKnown = new Set(hooks.flatMap(({ rows }) => rows.map(({ hook }) => hook)));
		for (const { notes, hook } of hooks.flatMap(({ rows }) => rows)) {
			for (const [mention] of notes.matchAll(/\.muxui-[\w-]+/gu)) if (!known.has(mention)) report(`Hooks row ${hook} mentions ${mention}, which is not a hook.`);
			for (const [mention] of notes.matchAll(/data-muxui-[\w-]+/gu)) if (!attributesKnown.has(mention)) report(`Hooks row ${hook} mentions ${mention}, which is not a row.`);
		}
	}

	// Rendered DOM: every element and class it names is in the page's own Basic example, and so is every state or reflected attribute.
	if (rendered.dom !== null && /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u.test(rendered.dom)) report('Rendered DOM prints an invisible character instead of its escape.');
	if (rendered.dom !== null && !clientOnly) {
		const basic = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'basic');
		const basicNodes = basic === undefined ? [] : elements(basic).filter(insideLive);
		const fragment = parseFragment(rendered.dom.replaceAll('...', ''));
		const named = [];
		const walk = (node) => { for (const child of node.childNodes ?? []) if (child.tagName !== undefined) { named.push(child); walk(child); } };
		walk(fragment);
		if (named.length === 0 || named.length > 40) report(`Rendered DOM names ${named.length} elements, expected 1 to 40.`);
		for (const node of named) {
			const wantedClasses = [...classNames(node)];
			const wantedAttributes = (node.attrs ?? []).filter(({ name }) => name !== 'class');
			const found = basicNodes.some((candidate) => candidate.tagName === node.tagName && wantedClasses.every((className) => classNames(candidate).has(className)) && wantedAttributes.every(({ name, value }) => attributeValue(candidate, name) === value));
			if (!found) report(`Rendered DOM names <${node.tagName}${wantedClasses.length > 0 ? ` class="${wantedClasses.join(' ')}"` : ''}${wantedAttributes.map(({ name, value }) => ` ${name}="${value}"`).join('')}>, and the Basic example of the page renders no such element.`);
		}
	} else if (rendered.dom === null && basicHasHooks(root)) {
		report('has no Rendered DOM block although its Basic example renders elements with a hook.');
	}

	// Tokens.
	const requirements = binding.tokenRecipe.requirements;
	const { core, tokenSource, light, dark } = sources;
	const expectedGroups = [['component', 'Component roles'], ['semantic', 'Semantic roles']].map(([id, label]) => [id, label, requirements.filter(({ token }) => token.startsWith(`${id}.`))]).filter(([, , list]) => list.length > 0);
	if (!same(rendered.tokens.map(({ id, label }) => [id, label]), expectedGroups.map(([id, label]) => [id, label]))) {
		report(`Tokens groups are ${JSON.stringify(rendered.tokens.map(({ id, label }) => [id, label]))}, expected ${JSON.stringify(expectedGroups.map(([id, label]) => [id, label]))}.`);
	}
	for (const [id, , list] of expectedGroups) {
		const printed = rendered.tokens.find((candidate) => candidate.id === id);
		if (printed === undefined) continue;
		const wantCollapsed = id === 'semantic' && list.length > collapseAbove;
		if (printed.details !== wantCollapsed) report(`Tokens ${id} group has ${list.length} roles and is ${printed.details ? 'collapsed' : 'open'}; only a secondary group over ${collapseAbove} collapses.`);
		if (!same(printed.rows.map(({ token }) => token), list.map(({ token }) => token))) report(`Tokens ${id} rows are ${printed.rows.length} roles in another order or with other names than the ${list.length} the recipe requires.`);
		for (const row of printed.rows) {
			const requirement = list.find(({ token }) => token === row.token);
			const definition = tokenSource.tokens[row.token];
			if (requirement === undefined || definition === undefined || light.tokens[row.token] === undefined) continue;
			const cssVar = core.cssName(row.token);
			if (row.cssVar !== cssVar) report(`Tokens row ${row.token} shows the name ${row.cssVar}, expected ${cssVar}.`);
			if (row.meaning !== collapse(definition.meaning)) report(`Tokens row ${row.token} meaning differs from the token record.`);
			if (row.policy !== definition.overridePolicy || row.fixedClass !== (definition.overridePolicy === 'fixed')) report(`Tokens row ${row.token} shows policy ${row.policy}, the token record says ${definition.overridePolicy}.`);
			const wantNote = requirement.requirement === 'required' ? null : [requirement.requirement, ...(requirement.profiles ?? [])].join(', ');
			if (row.requirement !== wantNote) report(`Tokens row ${row.token} annotation is ${JSON.stringify(row.requirement)}, the recipe says ${JSON.stringify(wantNote)}.`);
			// The default, exactly: the alias once when both schemes share it, then one line when the schemes agree or a light and a dark line.
			const lightValue = core.cssValue(light.tokens[row.token]);
			const darkValue = core.cssValue(dark.tokens[row.token]);
			const alias = definition.alias ?? null;
			const darkAlias = definition.modes?.['colorScheme.dark']?.alias ?? alias;
			const sameAlias = darkAlias === alias;
			const swatchOf = (value) => (definition.type === 'color' && /^#[0-9a-f]{3,8}$/iu.test(value) ? value : null);
			const expectedDefault = lightValue === darkValue && sameAlias
				? { alias, lines: [{ scheme: null, alias: null, swatch: swatchOf(lightValue), value: lightValue }] }
				: { alias: sameAlias ? alias : null, lines: [{ scheme: 'light', alias: sameAlias ? null : alias, swatch: swatchOf(lightValue), value: lightValue }, { scheme: 'dark', alias: sameAlias ? null : darkAlias, swatch: swatchOf(darkValue), value: darkValue }] };
			if (!same(row.shape, expectedDefault)) report(`Tokens row ${row.token} default reads ${JSON.stringify(row.shape)}, the token record resolves ${JSON.stringify(expectedDefault)}.`);
			if (id === 'component') {
				const readBy = expectedReadBy(sources, row.token);
				if (row.readKind === null) report(`Tokens row ${row.token} says nothing about what reads it.`);
				else if (row.readKind !== readBy.kind) report(`Tokens row ${row.token} says it is read ${JSON.stringify(row.readKind)}, the stylesheet makes it ${JSON.stringify(readBy.kind)}.`);
				// The text, exactly: every reader's selector and condition, in the stylesheet's order, and the hint on one that is no documented hook.
				if (row.readText !== readBy.text) report(`Tokens row ${row.token} reads ${JSON.stringify(row.readText)}, the stylesheet gives ${JSON.stringify(readBy.text)}.`);
			} else if (row.readKind !== null) {
				report(`Tokens row ${row.token} is a semantic role and says what reads it.`);
			}
		}
	}

	// Override rules: the README's text, verbatim; the pinned What-wins table; the scoped motion paragraph.
	const cascade = readmeCascade(sources.readme);
	const overrides = rendered.overrides;
	const expectedReadme = [...cascade.paragraphs, cascade.intro, cascade.closing];
	if (!same(overrides.readme, expectedReadme)) {
		const at = overrides.readme.findIndex((paragraph, index) => paragraph !== expectedReadme[index]);
		report(`Override rules text differs from README.md at paragraph ${at < 0 ? overrides.readme.length : at + 1}: ${JSON.stringify((overrides.readme[at] ?? '').slice(0, 80))}, the README says ${JSON.stringify((expectedReadme[at] ?? '').slice(0, 80))}.`);
	}
	if (!same(overrides.layerCode, [cascade.code])) report(`Override rules layer statement differs from the README's code block.`);
	for (const sentence of ['Where Mux UI declares a property `!important`'.replaceAll('`', ''), 'It protects only the properties it names']) {
		if (!overrides.readme.some((paragraph) => paragraph.includes(sentence))) report(`Override rules lost the README's property-specific !important text ("${sentence}").`);
	}
	const motion = overrides.motion ?? '';
	if (!/prefers-reduced-motion: reduce/u.test(motion) || !/data-muxui-motion="reduced"/u.test(motion) || !/data-muxui-motion-reduced marker; it is not an input/u.test(motion) || /no others|two triggers/iu.test(motion)) {
		report(`Override rules motion paragraph does not state the two inputs motion.mjs reads and the internal marker that is not an input: ${JSON.stringify(motion.slice(0, 120))}.`);
	}
	if (!/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/u.test(sources.motion) || !/data-muxui-motion/u.test(sources.motion)) report('motion.mjs no longer reads the two inputs the motion paragraph names.');
	// The seven rows: the wording is written in this module and the winner of each is worked out by the cascade (`whoWinsRows`), not read from the reference.
	const wins = whoWinsRows();
	const plain = (value) => collapse(value.replaceAll('`', ''));
	if (overrides.who.length !== wins.length) report(`What wins has ${overrides.who.length} rows, expected ${wins.length}.`);
	for (const [index, wanted] of wins.entries()) {
		const row = overrides.who[index];
		if (row === undefined) continue;
		if (row.id !== wanted.id || row.winner !== wanted.winner || row.declaration !== plain(wanted.declaration) || row.against !== plain(wanted.against)) {
			report(`What wins row ${index + 1} reads ${JSON.stringify(row)}, the cascade gives ${JSON.stringify({ id: wanted.id, declaration: plain(wanted.declaration), against: plain(wanted.against), winner: wanted.winner })}.`);
		}
	}
	const important = importantOf(sources, slug);
	if (important.total === 0 && overrides.important !== null) report(`Override rules prints an !important count for ${slug}, which has none on its own hooks.`);
	if (important.total > 0) {
		const expectedLine = `Mux marks ${important.total} ${important.total === 1 ? 'declaration' : 'declarations'} !important on ${artifact.name}'s own hooks: ${Object.entries(important.byCause).sort(([left], [right]) => ['forced-colors', 'reduced-motion-media', 'reduced-motion-attribute', 'other'].indexOf(left) - ['forced-colors', 'reduced-motion-media', 'reduced-motion-attribute', 'other'].indexOf(right)).map(([cause, count]) => `${count} for ${{ 'forced-colors': 'forced colors', 'reduced-motion-media': 'reduced motion by media query', 'reduced-motion-attribute': 'reduced motion by attribute', other: 'other causes' }[cause]}`).join(', ')}.`;
		if (overrides.important !== expectedLine) report(`Override rules !important line reads ${JSON.stringify(overrides.important)}, the stylesheet gives ${JSON.stringify(expectedLine)}.`);
	}

	// Recipe: what a reader copies is checked against the page's own tables and the stylesheet.
	const recipe = rendered.recipe;
	if (recipe.css === null || recipe.markup === null) {
		report('has no recipe code block.');
	} else {
		// The opening sentence counts the changes the recipe makes and names their kinds.
		const changes = recipeChanges(recipe.css);
		const kindsText = [['token', 'a theme role', 'theme roles'], ['part', 'a part rule', 'part rules'], ['state', 'a state rule', 'state rules']].flatMap(([kind, one, many]) => {
			const total = changes.filter((change) => change.kind === kind).length;
			return total === 0 ? [] : [total === 1 ? one : `${total} ${many}`];
		});
		const opening = changes.length === 0 ? `No change was generated for ${artifact.name}.` : `Copy this into your own CSS and wrap the component in the scope. ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}: ${kindsText.join(', ')}.`;
		if (!same(recipe.opening, [opening])) report(`Recipe opens with ${JSON.stringify(recipe.opening)}, the recipe makes ${changes.length} ${changes.length === 1 ? 'change' : 'changes'} and its opening sentence reads ${JSON.stringify(opening)}.`);
		const [statement, importLine] = cascade.code.split('\n');
		if (!recipe.css.startsWith(`${statement}\n${importLine}\n`)) report('Recipe does not start with the README\'s layer statement and styles import.');
		if (!/className="my-scope"/u.test(recipe.markup)) report('Recipe markup does not wrap the component in the my-scope wrapper.');
		if (recipe.css.includes('!important')) report('Recipe uses !important.');
		const printedHooks = new Set((hooks ?? []).flatMap(({ rows }) => rows.map(({ hook }) => hook)));
		const printedClasses = new Set([...printedHooks].flatMap((hook) => [...hook.matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name)));
		const rules = recipe.css.slice(recipe.css.indexOf('\n\n') + 1);
		const names = new Set();
		for (const [, className] of rules.matchAll(/\.(muxui-[\w-]+)/gu)) {
			names.add(className);
			if (!printedClasses.has(className)) report(`Recipe selects .${className}, which is not a row of the Hooks table.`);
		}
		for (const [, attribute] of rules.matchAll(/\[(data-muxui-[\w-]+)/gu)) {
			names.add(attribute);
			if (!printedHooks.has(attribute)) report(`Recipe selects ${attribute}, which is not a row of the Hooks table.`);
		}
		const assigned = [...rules.matchAll(/(--muxui-[\w-]+)\s*:/gu)].map(([, name]) => name);
		const roleRows = new Map(rendered.tokens.flatMap(({ rows }) => rows).map((row) => [row.cssVar, row]));
		for (const variable of assigned) {
			names.add(variable);
			const row = roleRows.get(variable);
			if (row === undefined || !variable.startsWith('--muxui-component-')) report(`Recipe assigns ${variable}, which is not a component role of ${slug}.`);
			else if (row.policy !== 'theme') report(`Recipe assigns ${variable}, whose policy is ${row.policy}.`);
			else if (!readsDirectly(sources.componentDeclarations, variable)) report(`Recipe assigns ${variable}, which no rule of the stylesheet reads.`);
			for (const pattern of neverAssigned) if (pattern.test(variable)) report(`Recipe assigns ${variable}, which is structured or sets a caller's own node, and is never a recipe step.`);
		}
		if (/@layer muxui\.utilities/u.test(rules) !== /\.muxui-[\w-]+/u.test(rules)) report('Recipe has part or state rules outside @layer muxui.utilities, or a layer with no rule.');
		const claim = recipe.checks.find((line) => /^The recipe uses \d+ names? /u.test(line));
		const count = recipe.css === '' ? 0 : names.size;
		if (count > 0 && (claim === undefined || !claim.startsWith(`The recipe uses ${count} ${count === 1 ? 'name' : 'names'} (`))) report(`Recipe says "${claim ?? 'nothing'}" about its names, and it uses ${count}.`);
		if (count === 0 && recipe.checks.length > 0) report('Recipe prints checks although it makes no change.');
		if (recipe.ci.length !== 1 || !/Chromium test/u.test(recipe.ci[0])) report('Recipe does not say, once, which test proves the recipes in a browser.');
	}
	if (recipe.checks.some((line) => /browser/iu.test(line))) report('Recipe checks claim a browser result for every page, which only a sample proves.');

	// Previews and the computed-change table: two panes that run the page's own Basic example, the recipe's own text in one of them, and a
	// row for each change the recipe makes, bound to the recipe it prints and to the stylesheet that reads it; its cells say only what this page
	// can say before a browser measures them.
	const previews = rendered.previews;
	const rulesText = recipe.css === null ? '' : recipe.css.slice(recipe.css.indexOf('\n\n') + 2);
	const changes = recipe.css === null ? [] : recipeChanges(recipe.css);
	const basicSection = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'basic');
	const basicSources = unique(basicSection === undefined ? [] : byTag(basicSection, 'astro-island').map((island) => { try { return JSON.parse(attributeValue(island, 'props') ?? '{}').source?.[1] ?? null; } catch { return null; } }));
	if (changes.length === 0) {
		if (previews.panes.length > 0 || previews.computed !== null) report('shows previews or a computed-change table although the recipe makes no change.');
		if (rendered.scopeClasses !== 0) report('has a my-scope wrapper although the recipe makes no change.');
	} else {
		const [first, second, ...others] = previews.panes;
		if (first?.name !== 'default' || second?.name !== 'recipe' || others.length > 0) report(`previews are ${JSON.stringify(previews.panes.map(({ name }) => name))}, expected Default then With the recipe.`);
		for (const pane of previews.panes) {
			if (pane.islands.length !== 1 || basicSources.length !== 1 || pane.islands[0].source !== basicSources[0]) report(`${pane.name} preview runs ${JSON.stringify(pane.islands.map(({ source }) => source))}, the page's Basic example is ${JSON.stringify(basicSources)}.`);
		}
		// The wrapper holds the example of the With-the-recipe preview, and only that one: an empty wrapper beside it would change nothing.
		if (rendered.scopeClasses !== 1 || second?.scopes !== 1 || first?.scopes !== 0) report(`must put the my-scope wrapper on the With-the-recipe preview only; the page has it ${rendered.scopeClasses} times (${first?.scopes ?? 0} in Default, ${second?.scopes ?? 0} in With).`);
		if (!same(previews.scopeIslands, [1]) || second?.islands.some(({ scoped }) => !scoped) || first?.islands.some(({ scoped }) => scoped)) report(`must run the With-the-recipe example inside the my-scope wrapper and the Default example outside it; the wrapper holds ${JSON.stringify(previews.scopeIslands)} examples.`);
		if (!same(second?.styles ?? [], [collapse(rulesText)])) report('With-the-recipe preview does not run the recipe text it prints.');
		// The height each preview reserves is the recorded one of the family, so the examples do not push the page when they render.
		const recorded = sources.previewHeights[slug];
		if (recorded === undefined || !same(previews.reserve, { narrow: recorded.narrow, wide: recorded.wide })) report(`reserves ${JSON.stringify(previews.reserve)} for its previews, the recorded heights (${previewHeightsPath}) say ${JSON.stringify(recorded ?? null)}.`);
		const computed = previews.computed;
		if (computed === null) {
			report('has no computed-change table.');
		} else {
			if (computed.length !== changes.length) report(`computed-change table has ${computed.length} rows, the recipe makes ${changes.length} changes.`);
			const basicNodes = basicSection === undefined ? [] : elements(basicSection).filter(insideLive);
			for (const [index, row] of computed.entries()) {
				const change = changes[index];
				if (change === undefined) continue;
				const at = `computed-change row ${index + 1}`;
				if (row.kind !== change.kind) report(`${at} is a ${row.kind} step, the recipe's change ${index + 1} is a ${change.kind}.`);
				// The row shows the measured property, the declaration the recipe makes (exactly) and the element it is measured on, and the script measures
				// what the row says: the attributes it reads are the printed ones.
				if (row.headCodes.length !== 3) report(`${at} shows ${row.headCodes.length} code values, expected the property, the declaration and the target.`);
				const [printedProperty, printedDeclaration, printedTarget] = row.headCodes;
				if (printedDeclaration !== change.declaration) report(`${at} shows the declaration ${JSON.stringify(printedDeclaration)}, the recipe makes ${JSON.stringify(change.declaration)}.`);
				if (printedProperty !== row.property || printedTarget !== row.target) report(`${at} prints ${JSON.stringify([printedProperty, printedTarget])} and measures ${JSON.stringify([row.property, row.target])}.`);
				if (change.kind === 'token') {
					// A theme role is measured where a rule of the stylesheet reads it: on that rule's selector, as the property the rule sets.
					const readers = readersOf(sources, change.property);
					if (!readers.some((reader) => reader.selector === row.target && (reader.through || reportedFor(reader.property).includes(row.property))) || !readers.some((reader) => !reader.through && reportedFor(reader.property).includes(row.property))) report(`${at} measures ${row.property} on ${row.target}, and no rule of the stylesheet reads ${change.property} there (the readers are ${JSON.stringify(readers)}).`);
				} else {
					// A part or a state is measured on the selector the recipe prints, as the property it declares.
					const wantTarget = change.selector.replace(/^\.my-scope /u, '');
					if (row.target !== wantTarget) report(`${at} measures ${row.target}, the recipe's rule is on ${wantTarget}.`);
					if (!reportedFor(change.property).includes(row.property)) report(`${at} measures ${row.property}, the recipe declares ${change.property}.`);
				}
				if (row.scope === 'unavailable') {
					const [one, two, ...rest] = row.cells;
					if (row.kind !== 'state' || rest.length > 0 || one?.colspan !== '2' || !/^needs the state/u.test(one?.text ?? '') || two?.hidden !== true || two?.text !== '') report(`${at} is unavailable and does not say "needs the state" in one cell over both columns, with its second cell hidden: ${JSON.stringify(row.cells)}.`);
				} else if (row.scope === 'wrapper') {
					if (row.cells.length !== 2 || row.cells.some((cell) => cell.measure === null || cell.hidden || cell.colspan !== null || cell.text !== 'Not measured yet.')) report(`${at} claims a measurement before a browser made one: ${JSON.stringify(row.cells.map(({ text: value }) => value))}.`);
					const classesNamed = [...(row.target ?? '').matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name);
					if (!clientOnly && !classesNamed.every((name) => basicNodes.some((node) => classNames(node).has(name)))) report(`${at} reads ${row.target}, and the page's Basic example renders no such element.`);
					// Whether the measured element holds text, where its selector is plain enough to find it in the page's own example: a change to an element
					// with none is marked `computed only`, and one with some is not.
					if (!clientOnly && /^[a-z]*(?:\.[\w-]+)+(?:\s+[a-z]*(?:\.[\w-]+)+)*$/u.test(row.target ?? '')) {
						const element = basicNodes.find((node) => matchesHook(node, row.target));
						if (element !== undefined && (row.stepText === 'text') !== (textContent(element).trim() !== '')) report(`${at} says ${row.target} holds ${row.stepText === 'text' ? 'text' : 'no text'}, and the first one in the page's Basic example holds ${textContent(element).trim() === '' ? 'none' : 'some'}.`);
					}
				} else {
					report(`${at} has the scope ${JSON.stringify(row.scope)}.`);
				}
			}
		}
	}

	return problems;
}

/** Whether the page's Basic example renders an element that carries a documented hook (so a Rendered DOM block is expected). */
function basicHasHooks(root) {
	const basic = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'basic');
	return basic !== undefined && elements(basic).filter(insideLive).some((node) => [...classNames(node)].some((name) => name.startsWith('muxui-')));
}
