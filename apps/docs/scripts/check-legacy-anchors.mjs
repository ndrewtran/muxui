// Every fragment a part of a component page used to have still reaches that part.
//
//   node scripts/check-legacy-anchors.mjs [dist]          check a build against src/lib/legacy-part-anchors.json
//   node scripts/check-legacy-anchors.mjs --record <dist> rewrite that file from a build of the base the anchors came from
//
// Before the typed tables, each part of a derived family had a heading whose id was `api-reference-<anatomy part>`, such as
// `#api-reference-option` on /components/select/ for what is now `Select.Item`. A bookmarked link to one of those must still land on
// the part (and open it, when the page keeps it closed). The old ids are read from a build of origin/main 29cfd6ae, not written
// by hand: `--record` finds every heading of a built component page whose id starts with `api-reference-` and records the id with
// the heading's text. The page renders each as an empty alias in the heading of the part with that text.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';

const docsRoot = resolve(import.meta.dirname, '..');
const listPath = resolve(docsRoot, 'src/lib/legacy-part-anchors.json');
const base = 'origin/main 29cfd6ae';

const routeOf = (dist, slug) => resolve(dist, 'components', slug, 'index.html');

/** The part headings of a built base page: id and text of each h3 in the API reference section whose id starts `api-reference-`. */
function recorded(dist) {
	const anchors = {};
	for (const entry of readdirSync(resolve(dist, 'components'), { withFileTypes: true })) {
		if (!entry.isDirectory() || !existsSync(routeOf(dist, entry.name))) continue;
		const root = parse(readFileSync(routeOf(dist, entry.name), 'utf8'));
		const section = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'api-reference');
		if (section === undefined) continue;
		for (const heading of elements(section).filter((node) => node.tagName === 'h3' && attributeValue(node, 'id')?.startsWith('api-reference-'))) {
			(anchors[entry.name] ??= {})[attributeValue(heading, 'id')] = textContent(heading).trim();
		}
	}
	return Object.fromEntries(Object.entries(anchors).sort(([left], [right]) => left.localeCompare(right)).map(([slug, ids]) => [slug, Object.fromEntries(Object.entries(ids).sort(([left], [right]) => left.localeCompare(right)))]));
}

if (process.argv[2] === '--record') {
	if (process.argv[3] === undefined) throw new Error('Pass the dist of a build of the base: --record <dist>.');
	const anchors = recorded(resolve(process.argv[3]));
	writeFileSync(listPath, `${JSON.stringify({ source: `The part headings (h3 ids starting api-reference-) of the built component pages of ${base}.`, anchors }, null, '\t')}\n`);
	console.log(`Recorded ${Object.values(anchors).reduce((total, ids) => total + Object.keys(ids).length, 0)} part anchors on ${Object.keys(anchors).length} pages in ${listPath}.`);
} else {
	const dist = process.argv[2] === undefined ? resolve(docsRoot, 'dist') : resolve(process.argv[2]);
	const { anchors } = JSON.parse(readFileSync(listPath, 'utf8'));
	const problems = [];
	let checked = 0;
	for (const [slug, ids] of Object.entries(anchors)) {
		const route = `/components/${slug}/`;
		if (!existsSync(routeOf(dist, slug))) {
			problems.push(`${route} is not built, but ${Object.keys(ids).join(', ')} used to be on it.`);
			continue;
		}
		const root = parse(readFileSync(routeOf(dist, slug), 'utf8'));
		const all = elements(root);
		for (const [id, heading] of Object.entries(ids)) {
			checked += 1;
			const targets = all.filter((node) => attributeValue(node, 'id') === id);
			if (targets.length !== 1) {
				problems.push(`${route}#${id} (${heading}) is on ${targets.length} elements, expected one.`);
				continue;
			}
			// The target sits in the heading of the part with the old heading's text, which is inside that part's details element.
			let part;
			for (let node = targets[0].parentNode; node?.tagName !== undefined && part === undefined; node = node.parentNode) {
				if (node.tagName === 'details' && classNames(node).has('api-part')) part = node;
			}
			if (part === undefined || attributeValue(part, 'data-api-part') !== heading) {
				problems.push(`${route}#${id} should reach the part ${heading}, and reaches ${part === undefined ? 'no part' : attributeValue(part, 'data-api-part')}.`);
			}
		}
		// No alias the list does not know: each is an element marked as legacy.
		for (const node of all.filter((candidate) => attributeValue(candidate, 'data-api-legacy') !== undefined)) {
			if (!Object.hasOwn(ids, attributeValue(node, 'id') ?? '')) problems.push(`${route}#${attributeValue(node, 'id')} is an alias of no recorded anchor.`);
		}
	}
	for (const slug of readdirSync(resolve(dist, 'components'))) {
		if (Object.hasOwn(anchors, slug) || !existsSync(routeOf(dist, slug))) continue;
		const root = parse(readFileSync(routeOf(dist, slug), 'utf8'));
		if (elements(root).some((node) => attributeValue(node, 'data-api-legacy') !== undefined)) problems.push(`/components/${slug}/ has an alias, but none was recorded for it.`);
	}
	if (problems.length > 0) throw new Error(`A fragment of a component page no longer reaches its part:\n${problems.map((line) => `- ${line}`).join('\n')}`);
	console.log(`Legacy anchor contract passed: all ${checked} part fragments of ${base} on ${Object.keys(anchors).length} component pages still reach the part with the same heading, and no other alias exists.`);
}
