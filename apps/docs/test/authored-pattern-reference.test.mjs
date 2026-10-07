// The Blocks drift guard flags an authored pattern id or slug, and nothing else.
import assert from 'node:assert/strict';
import test from 'node:test';
import { authoredPatternReference } from '../scripts/authored-pattern-reference.mjs';

const hero = 'muxui:pattern:hero';
const pricing = 'muxui:pattern:pricing';
const posterGrid = 'muxui:pattern:poster-grid';

test('flags a quoted id or slug and a path segment', () => {
	assert.equal(authoredPatternReference("const id = 'muxui:pattern:hero';", hero), 'muxui:pattern:hero');
	assert.equal(authoredPatternReference('const slug = "hero";', hero), '"hero"');
	assert.equal(authoredPatternReference('const link = `hero`;', hero), '`hero`');
	assert.equal(authoredPatternReference("href: '/blocks/pricing/'", pricing), '/pricing');
	assert.equal(authoredPatternReference("'/blocks/pricing'", pricing), '/pricing');
	assert.equal(authoredPatternReference('<a href="/blocks/poster-grid/css/preview/">', posterGrid), '/poster-grid');
	assert.equal(authoredPatternReference('import x from "../../catalog/patterns/hero/artifact.json";', hero), '/hero');
});

test('passes words, identifiers, selectors, and longer names that only contain the slug', () => {
	for (const text of [
		'A hero image sits above the fold.',
		'The pricing table compares plans.',
		'// pricing and hero are marketing categories',
		'const hero = 1; function pricing() {}',
		'.hero { color: var(--x); } .pricing-card { }',
		"const heroes = ['heroic'];",
		"const label = 'Hero banner';",
		"'/blocks/heroes/'",
		"'/blocks/hero-split/'",
		"'muxui:pattern:hero-split'",
		"'muxui:pattern:superhero'",
		'<h1 class="hero-title">Pricing</h1>',
	]) {
		assert.equal(authoredPatternReference(text, hero) ?? authoredPatternReference(text, pricing), null, text);
	}
});

test('a hyphenated slug is matched whole', () => {
	assert.equal(authoredPatternReference("'poster-grid'", posterGrid), "'poster-grid'");
	assert.equal(authoredPatternReference("'poster'", posterGrid), null);
	assert.equal(authoredPatternReference("'/blocks/poster-grid-wide/'", posterGrid), null);
});
