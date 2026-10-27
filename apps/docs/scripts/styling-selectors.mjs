// What the rules of the shipped stylesheet say about which attribute an element with which class may carry.
//
// This is the independent reading of the Styling check: it does not use the selector parser of the reference module. A rule is read
// compound by compound (the parts of a selector between combinators), and every test belongs to the compound it is written in:
// each branch of `:is()` and `:where()` stands alone, a test inside `:not()` counts for the element the `:not()` is on, and the
// compounds inside `:has()` are the elements asked for. The result is `selection`: attribute -> class -> the values of its `=` tests.

/** The index of the bracket that closes the one at `open`, counting parentheses and brackets and skipping quoted text. */
function closeOf(text, open) {
	let depth = 0;
	for (let index = open; index < text.length; index += 1) {
		const character = text[index];
		if (character === '"' || character === '\'') {
			index = text.indexOf(character, index + 1);
			if (index < 0) break;
		} else if (character === '(' || character === '[') {
			depth += 1;
		} else if (character === ')' || character === ']') {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	throw new Error(`an unbalanced bracket in the selector ${text}`);
}

/** The parts of a list at its top level only (`.a, :is(.b, .c)` is two). */
export function splitTopLevel(text, separator) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === '"' || character === '\'') {
			index = text.indexOf(character, index + 1);
			if (index < 0) throw new Error(`an unterminated string in the selector ${text}`);
		} else if (character === '(' || character === '[') depth += 1;
		else if (character === ')' || character === ']') depth -= 1;
		else if (character === separator && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts.map((part) => part.trim()).filter(Boolean);
}

/** The compounds of one complex selector: the parts between combinators, at the top level. */
export function splitTopLevelCombinators(selector) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < selector.length; index += 1) {
		const character = selector[index];
		if (character === '"' || character === '\'') {
			index = selector.indexOf(character, index + 1);
			if (index < 0) throw new Error(`an unterminated string in the selector ${selector}`);
		} else if (character === '(' || character === '[') depth += 1;
		else if (character === ')' || character === ']') depth -= 1;
		else if (depth === 0 && /[\s>+~]/u.test(character)) {
			if (index > start) parts.push(selector.slice(start, index));
			start = index + 1;
		}
	}
	if (start < selector.length) parts.push(selector.slice(start));
	return parts;
}

const attributePattern = /\[\s*(data-muxui-[\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?[^\]]*\]/gu;

/** The Mux classes and data-muxui attribute tests of a piece of a compound that holds no functional pseudo-class. */
function plainTests(piece) {
	return {
		classes: [...piece.matchAll(/\.(muxui-[\w-]+)/gu)].map(([, name]) => name),
		attributes: [...piece.matchAll(attributePattern)].map(([, name, operator, quoted, single, bare]) => ({ name, operator: operator ?? null, value: quoted ?? single ?? bare ?? null })),
	};
}

/**
 * The facets (a set of classes and attribute tests that one element carries) of one compound. Elements the compound refers to but
 * does not select (the context of an `:is()` branch, the elements `:has()` asks for) are appended to `others`.
 */
function compoundFacets(compound, others) {
	let rest = '';
	const functional = [];
	for (let index = 0; index < compound.length; index += 1) {
		if (compound[index] === '[') {
			const close = closeOf(compound, index);
			rest += compound.slice(index, close + 1);
			index = close;
		} else if (compound[index] === ':' && compound[index + 1] !== ':') {
			const found = /^:([a-z-]+)\(/u.exec(compound.slice(index));
			if (found === null) {
				rest += compound[index];
			} else {
				const open = index + found[0].length - 1;
				const close = closeOf(compound, open);
				functional.push({ name: found[1], inner: compound.slice(open + 1, close) });
				index = close;
			}
		} else {
			rest += compound[index];
		}
	}
	let branches = [plainTests(rest)];
	for (const { name, inner } of functional) {
		const list = splitTopLevel(inner, ',');
		if (name === 'is' || name === 'where') {
			branches = branches.flatMap((branch) => list.flatMap((item) => subjectFacets(item, others)
				.map((facet) => ({ classes: [...branch.classes, ...facet.classes], attributes: [...branch.attributes, ...facet.attributes] }))));
		} else if (name === 'not') {
			const tested = list.flatMap((item) => subjectFacets(item, []).flatMap(({ attributes }) => attributes));
			branches = branches.map((branch) => ({ classes: branch.classes, attributes: [...branch.attributes, ...tested] }));
		} else if (name === 'has') {
			for (const item of list) others.push(...everyFacet(item));
		}
	}
	return branches;
}

/** The facets of the element a complex selector selects (its last compound); the ones before it are appended to `others`. */
function subjectFacets(complex, others) {
	const compounds = splitTopLevelCombinators(complex);
	let subject = [];
	compounds.forEach((compound, position) => {
		const facets = compoundFacets(compound, others);
		if (position === compounds.length - 1) subject = facets;
		else others.push(...facets);
	});
	return subject;
}

/** The facets of every compound of a complex selector. */
function everyFacet(complex) {
	const out = [];
	for (const compound of splitTopLevelCombinators(complex)) out.push(...compoundFacets(compound, out));
	return out;
}

/** The facets of every element a selector list describes: what it selects, what surrounds it and what `:has()` asks for. */
export function selectorFacets(selector) {
	const facets = [];
	for (const complex of splitTopLevel(selector, ',')) {
		const others = [];
		facets.push(...subjectFacets(complex, others), ...others);
	}
	return facets;
}

/** attribute -> class -> values: the rules of the components layer, read once. */
export function selectionIndex(rules) {
	const selection = new Map();
	for (const { selector, chain } of rules) {
		if (!chain.includes('@layer muxui.components')) continue;
		for (const { classes, attributes } of selectorFacets(selector)) {
			for (const { name, operator, value } of attributes) {
				const byClass = selection.get(name) ?? new Map();
				for (const className of classes) {
					const values = byClass.get(className) ?? new Set();
					if (operator === '=' && value !== null) values.add(value);
					byClass.set(className, values);
				}
				selection.set(name, byClass);
			}
		}
	}
	return selection;
}
