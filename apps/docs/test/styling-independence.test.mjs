// The independent reading of the Styling section (scripts/styling-expectation.mjs and the selector reader it uses) must not read what it checks: not
// the reference module that prints the section's facts, not the docs' catalog projection, not a component that prints the page. A check that borrows
// a list from the thing it checks passes when the list is wrong on both sides (removing `hovered` from the shared list removed it from the page and
// from the expectation, and nothing was reported). So this scan fails when the reading imports any of them, however it does so.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const scripts = resolve(import.meta.dirname, '../scripts');
const independent = ['styling-expectation.mjs', 'styling-selectors.mjs'];

/** Paths the reading must never load: the reference module, the component reference projection, the docs catalog reader and any page component. */
const forbidden = [/styling-reference/u, /component-reference/u, /src\/lib\/catalog/u, /components\/styling\//u, /\.astro(?:['"`]|$)/u];

/** The string constants a module declares (`const partMapPath = '...'`), to resolve an identifier passed to a loader. */
function constantsOf(source) {
	return new Map([...source.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])((?:(?!\2).)*)\2\s*;/gu)].map(([, name, , value]) => [name, value]));
}

/**
 * Everything a module loads: the specifier of each static import and re-export, and the argument of each `import()` and of each call to a
 * local `load()` (how the loaders read the sources), as the string it names. An identifier is resolved through the module's string constants.
 */
export function loadedBy(source) {
	const constants = constantsOf(source);
	const found = [];
	for (const [, specifier] of source.matchAll(/\b(?:import|export)\s+(?:[^'"`;]*?\sfrom\s+)?(['"`])([^'"`]+)\1/gu).map((match) => [match[0], match[2]])) found.push(specifier);
	for (const [, argument] of source.matchAll(/\b(?:import|load)\(\s*([^()]*?)\s*[),]/gu)) {
		const literal = /^(['"`])(.*)\1$/u.exec(argument);
		found.push(literal === null ? (constants.get(argument) ?? argument) : literal[2]);
	}
	return found;
}

const violations = (source) => loadedBy(source).filter((path) => forbidden.some((pattern) => pattern.test(path)));

test('the independent reading of the Styling section loads neither the reference, the catalog projection nor a page component', () => {
	for (const file of independent) {
		const source = readFileSync(resolve(scripts, file), 'utf8');
		assert.deepEqual(violations(source), [], `${file} loads a source it checks`);
	}
	// The scan sees the loads the reading does make (the part map and the token core are the shared readings).
	const loaded = loadedBy(readFileSync(resolve(scripts, 'styling-expectation.mjs'), 'utf8'));
	assert.ok(loaded.includes('packages/react/test/support/styling-parts.ts') && loaded.includes('packages/tokens/src/core.mjs'), `the expectation's loads: ${loaded.join(', ')}`);
});

test('the scan names every way of loading the reference or a page component (a mutant of the reading for each)', () => {
	const real = readFileSync(resolve(scripts, 'styling-expectation.mjs'), 'utf8');
	const mutants = {
		'a static import of the reference': `import { interactionStates } from '../../../packages/react/test/support/styling-reference.mjs';\n${real}`,
		'a re-export from the reference': `${real}\nexport { whoWinsRows } from '../../../packages/react/test/support/styling-reference.mjs';`,
		'a dynamic import of the reference': `${real}\nconst reference = await import('../../../packages/react/test/support/styling-reference.mjs');`,
		'the loader given the reference path': real.replace("load(partMapPath), load('packages/tokens/src/core.mjs')", "load(partMapPath), load(referencePath), load('packages/tokens/src/core.mjs')"),
		'the loader given the reference as a literal': real.replace("load('packages/tokens/src/core.mjs')", "load('packages/react/test/support/styling-reference.mjs')"),
		'the docs catalog reader': `import { getStylingFacts } from '../src/lib/catalog.ts';\n${real}`,
		'a page component': `import StylingHooks from '../src/components/styling/StylingHooks.astro';\n${real}`,
		'the component reference projection': `import { componentReference } from '../../component-reference.mjs';\n${real}`,
	};
	for (const [label, source] of Object.entries(mutants)) {
		assert.notEqual(source, real, `${label}: the mutant changes the module`);
		assert.notDeepEqual(violations(source), [], `${label} is not named by the scan`);
	}
});
