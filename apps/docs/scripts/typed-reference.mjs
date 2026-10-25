// What a built component page must show of its types, derived from the committed declaration reference and the catalog,
// and read back from the page. The expectation is written here from the reference JSON and the catalog record alone: it
// shares no code with the page's view of the same data (`src/lib/api-reference.ts`), so a page that drops or invents a
// row, a ref, an import or a part differs from it.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attributeValue, classNames, elements, textContent } from './html-tree.mjs';

/** Collapse the whitespace a template adds between inline pieces. */
export const text = (node) => textContent(node).replace(/\s+/gu, ' ').trim();
/** The text of an element the page may be missing, which then reads as null so the page's difference is reported, not a crash. */
const read = (node) => (node === undefined ? null : text(node));
/** How many columns a table row spans: its cells, each counted by its colspan. */
const spanOf = (row) => row.childNodes.filter((cell) => cell.tagName === 'th' || cell.tagName === 'td').reduce((total, cell) => total + Number(attributeValue(cell, 'colspan') ?? 1), 0);

/** A page with more parts than this opens only its first part. */
export const collapsePartsAbove = 8;

/** The reference as the JSON files hold it: the inventory and each owner's file, by owner. */
export function loadReference(directory) {
	const readJson = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
	const inventory = readJson('inventory.json');
	const files = new Map(Object.entries(inventory.owners).map(([owner, name]) => [owner, readJson(name)]));
	return { inventory, files };
}

const handlerOf = (channel) => `on${channel.charAt(0).toUpperCase()}${channel.slice(1)}`;
const quoted = (value) => (typeof value === 'string' ? `'${value}'` : String(value));
const unionOf = (values) => values.map(quoted).join(' | ');
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const memberNames = (part) => new Set([...(part.members ?? []), ...(part.alternatives ?? []).flatMap((alternative) => alternative.members)].map((member) => member.name));
const isRootPart = (part) => part.member === null || part.member === 'Root';
const isPartOf = (part) => part.form !== undefined || part.sameAs !== undefined;

function defaultText(value) {
	return value === null || ['string', 'number', 'boolean'].includes(typeof value) ? quoted(value) : JSON.stringify(value);
}

function refLine(ref) {
	if (ref === null || ref === undefined) return undefined;
	return 'never' in ref ? 'not allowed' : ref.type;
}

/** The name of an alternative, from its members alone. */
function labelOf(alternatives, index) {
	const own = alternatives[index];
	const byName = alternatives.map((alternative) => new Map(alternative.members.map((member) => [member.name, member])));
	for (const member of own.members) {
		if (member.never || member.values === undefined) continue;
		const siblings = byName.map((map) => map.get(member.name));
		if (siblings.some((sibling) => sibling === undefined || sibling.never || sibling.values === undefined || sibling.values.length === 0)) continue;
		const all = siblings.flatMap((sibling) => sibling.values);
		if (new Set(all).size === all.length) return `${member.name} = ${unionOf(member.values)}`;
	}
	const only = own.members.filter((member) => !member.optional && !member.never && byName.some((map, other) => {
		const sibling = map.get(member.name);
		return other !== index && (sibling === undefined || sibling.optional || sibling.never);
	}));
	return only.length > 0 ? `requires ${only.map((member) => member.name).join(', ')}` : 'otherwise';
}

/** The href a link to a type has, from where its owner documents it. */
function hrefOf(type, pageOwner) {
	if (type.owner === pageOwner) return `#type-${type.name}`;
	return type.owner === 'shared' || type.owner === 'package-level' ? `/package-exports/#type-${type.name}` : `/components/${type.owner}/#type-${type.name}`;
}

/** The links a piece of type text carries: each public type its refs name, where the whole word stands outside a string literal. */
function linksOf(typeText, refs, file, pageOwner) {
	const bare = typeText.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/gu, (literal) => ' '.repeat(literal.length));
	const found = [];
	for (const id of refs ?? []) {
		const type = file.types.find((candidate) => candidate.id === id);
		if (type === undefined || type.public === undefined || type.owner === undefined) continue;
		const word = new RegExp(`(?<![.\\w$])${type.name.replace(/\$/gu, '\\$')}(?![\\w$])`, 'u');
		if (word.test(bare)) found.push([type.name, hrefOf(type, pageOwner)]);
	}
	return [...new Set(found.map((pair) => pair.join(' -> ')))].sort();
}

/**
 * What the page must show for one component.
 * @param {object} input
 * @param {string} input.exportName the descriptor's export
 * @param {string} input.entry the export-map key of its module
 * @param {string} input.packageName
 * @param {{ inventory: any, files: Map<string, any> }} input.reference
 * @param {any} input.binding the catalog's web.react binding of the component
 * @param {readonly string[]} input.anatomy
 */
export function expectedComponent({ exportName, entry, packageName, reference, binding, anatomy }) {
	const item = reference.inventory.entries.find(({ key }) => key === entry)?.exports?.find(({ name }) => name === exportName);
	if (item === undefined) throw new Error(`the reference has no export ${exportName} from ${entry}`);
	const owner = item.owner;
	const file = reference.files.get(owner);
	const main = file.exports.find(({ name, entry: key }) => name === exportName && key === entry);
	const related = file.exports.filter((candidate) => candidate !== main);
	const derived = binding.api.propDetails !== undefined;
	const mainParts = (main.parts ?? []).filter(isPartOf);
	const heading = (exportOf, part) => (part.member === null ? exportOf : `${exportOf}.${part.member}`);

	// Catalog facts: a derived family's root API is its root parts' and each partApis entry its part's; an authored family's
	// flat list goes to the root part that declares a name, else to the only part that does, else to none.
	const declarers = (name) => mainParts.filter((part) => memberNames(part).has(name));
	const flatOwners = (name) => {
		const all = declarers(name);
		const roots = all.filter(isRootPart);
		return roots.length > 0 ? roots : all.length === 1 ? all : [];
	};
	const catalogOf = (part) => {
		if (derived) {
			if (isRootPart(part)) return { defaults: binding.api.defaults, events: binding.api.events, authored: false };
			const api = Object.values(binding.api.partApis ?? {}).find(({ member }) => member === part.member);
			return { defaults: api?.defaults ?? {}, events: api?.events ?? [], authored: false };
		}
		return {
			defaults: Object.fromEntries(Object.entries(binding.api.defaults).filter(([name]) => flatOwners(name).includes(part))),
			events: binding.api.events.filter((channel) => flatOwners(handlerOf(channel)).includes(part)),
			authored: true,
		};
	};

	const rowFor = (member, when, catalog) => {
		const defaultApplies = member.optional && !member.never && Object.hasOwn(catalog.defaults, member.name)
			&& (member.values === undefined || member.values.some((value) => Object.is(value, catalog.defaults[member.name])));
		const expanded = member.values === undefined ? undefined : unionOf(member.values);
		const event = catalog.events.find((channel) => handlerOf(channel) === member.name);
		return {
			name: member.name,
			when,
			type: member.type,
			links: linksOf(member.type, member.refs, file, owner),
			...(expanded !== undefined && expanded !== member.type && { values: expanded }),
			state: member.optional ? 'optional' : 'required',
			default: defaultApplies ? { text: defaultText(catalog.defaults[member.name]), authored: catalog.authored } : null,
			doc: member.doc === undefined ? null : member.doc.replaceAll('`', '').replace(/\s+/gu, ' ').trim(),
			event: event ?? null,
		};
	};
	const natives = (list) => (list ?? []).map(({ type, omit }) => ({ type, omit: omit ?? [] }));
	// What a part says about its element and attribute surface; an alias says what the part it names says.
	const surface = (part) => ({
		natives: natives(part.natives),
		generics: (part.typeParameters ?? []).map(({ name, constraint, default: fallback }) => `${name}${constraint === undefined ? '' : ` extends ${constraint}`}${fallback === undefined ? '' : ` = ${fallback}`}`),
		ref: refLine(part.ref) ?? ((part.alternatives ?? []).some((alternative) => refLine(alternative.ref) !== undefined) ? 'per alternative' : 'none declared'),
	});
	const forbidden = (members) => {
		const names = members.filter((member) => member.never).map((member) => member.name);
		return names.length > 0 ? [{ state: 'not allowed', names }] : [];
	};
	const partOf = (exportOf, importFrom, part, catalog, siblings) => {
		const alternatives = part.alternatives ?? [];
		const base = { heading: heading(exportOf, part), import: importFrom };
		if (part.sameAs !== undefined) {
			// `sameAs` is the export's own name (the component itself) or a sibling member.
			const target = siblings.find(({ member }) => member === (part.sameAs === exportOf ? null : part.sameAs));
			if (target === undefined) throw new Error(`${base.heading} is the same as ${part.sameAs}, which the reference does not hold`);
			return { ...base, ...surface(target), sameAs: heading(exportOf, target), groups: [] };
		}
		const rows = (members, when) => members.filter((member) => !member.never).map((member) => rowFor(member, when, catalog));
		const groups = alternatives.length === 0
			? [{ label: null, ref: null, natives: [], rows: rows(part.members ?? [], 'always'), closing: forbidden(part.members ?? []) }]
			: [
				{ label: 'Common', ref: null, natives: [], rows: rows(part.members ?? [], 'always'), closing: forbidden(part.members ?? []) },
				...alternatives.map((alternative, index) => {
					const label = labelOf(alternatives, index);
					const listed = new Set(alternative.members.map((member) => member.name));
					const everywhere = [...new Set(alternatives.flatMap((other) => other.members.map((member) => member.name)))];
					const absent = everywhere.filter((name) => !listed.has(name));
					return {
						label,
						ref: refLine(alternative.ref) ?? null,
						natives: natives(alternative.natives),
						rows: rows(alternative.members, label),
						closing: [
							...forbidden(alternative.members),
							...(absent.length > 0 ? [{ state: 'not declared', names: absent }] : []),
						],
					};
				}),
			];
		return { ...base, ...surface(part), groups };
	};
	const specifier = (key) => (key === '.' ? packageName : `${packageName}${key.slice(1)}`);
	const importOf = (candidate) => `import { ${candidate.name} } from '${specifier(candidate.entry)}';`;
	const parts = [
		...mainParts.map((part) => partOf(exportName, importOf(main), part, catalogOf(part), mainParts)),
		...related.filter(({ kind }) => kind === 'component').flatMap((flat) => (flat.parts ?? []).filter(isPartOf).map((part) => partOf(flat.name, importOf(flat), part, { defaults: {}, events: [], authored: false }, flat.parts))),
	];

	const exportsOf = [main, ...related].map((candidate) => {
		const label = candidate === main ? exportName : candidate.name;
		const own = (candidate.parts ?? []).filter(isPartOf);
		return {
			name: candidate.name,
			kind: candidate.kind === 'function' ? (/^use[A-Z]/u.test(candidate.name) ? 'hook' : 'function') : candidate.kind,
			import: `import { ${candidate.name} } from '${specifier(candidate.entry)}';`,
			signature: candidate.kind === 'function' ? candidate.signature : candidate.kind === 'value' ? `${candidate.name}: ${candidate.type}` : null,
			doc: candidate.doc === undefined ? null : candidate.doc.replaceAll('`', '').replace(/\s+/gu, ' ').trim(),
			parts: own.filter((part) => part.member !== null).map((part) => heading(label, part)),
			table: own.some((part) => part.member === null) ? heading(label, own.find((part) => part.member === null)) : null,
		};
	});

	// The types the owner exports come from the inventory, the independent list of what the package exports.
	const exportedTypes = reference.inventory.entries.flatMap((candidate) => (candidate.exports ?? []).filter((x) => x.kind === 'type' && x.owner === owner).map((x) => ({ entry: candidate.key, name: x.name })));
	const types = file.types.filter((type) => type.public !== undefined && type.owner === owner).map((type) => ({
		name: type.name,
		imports: type.public.map((where) => `import type { ${where.name} } from '${specifier(where.entry)}';`),
		text: type.text,
	}));
	const inventoryTypeNames = [...new Set(exportedTypes.map(({ name }) => name))].sort();

	const position = (part) => anatomy.indexOf(part);
	const events = [];
	const eventsFor = (channels, scope, named) => channels.map((channel) => {
		const handler = handlerOf(channel);
		const declared = scope.flatMap((part) => [...(part.members ?? []), ...(part.alternatives ?? []).flatMap((alternative) => alternative.members)]
			.filter((member) => member.name === handler && !member.never).map((member) => ({ type: member.type, by: heading(exportName, part) })));
		const signatures = [];
		for (const { type, by } of declared) {
			let entry = signatures.find((candidate) => candidate.text === type);
			if (entry === undefined) signatures.push(entry = { text: type, declaredBy: [] });
			if (named && !entry.declaredBy.includes(by)) entry.declaredBy.push(by);
		}
		return { channel, handler, signatures };
	});
	if (binding.api.events.length > 0) events.push({ owner: null, fact: 'binding.api.events', events: eventsFor(binding.api.events, derived ? mainParts.filter(isRootPart) : mainParts, !derived) });
	const partApis = Object.entries(binding.api.partApis ?? {}).sort(([left], [right]) => position(left) - position(right));
	for (const [part, api] of partApis) {
		if (api.events.length > 0) events.push({ owner: `${exportName}.${api.member}`, fact: `binding.api.partApis.${part}.events`, events: eventsFor(api.events, mainParts.filter(({ member }) => member === api.member), false) });
	}

	const rootNames = new Set(mainParts.filter(isRootPart).flatMap((part) => [...memberNames(part)]));
	const everyName = new Set(mainParts.flatMap((part) => [...memberNames(part)]));
	const catalogOnly = [];
	const rootMissing = binding.api.props.filter((name) => !(derived ? rootNames : everyName).has(name));
	if (rootMissing.length > 0) catalogOnly.push({ owner: null, names: rootMissing });
	if (derived) {
		for (const [, api] of partApis) {
			const names = new Set(mainParts.filter(({ member }) => member === api.member).flatMap((part) => [...memberNames(part)]));
			const missing = api.props.filter((name) => !names.has(name));
			if (missing.length > 0) catalogOnly.push({ owner: `${exportName}.${api.member}`, names: missing });
		}
	}
	return { owner, derived, parts, exports: exportsOf, types, inventoryTypeNames, events, catalogOnly };
}

// ---- reading a built page ----

const nativesOf = (node) => elements(node).filter((child) => child.tagName === 'span' && classNames(child).has('api-native')).map((native) => {
	const codes = elements(native).filter((child) => child.tagName === 'code').map((code) => text(code));
	return { type: codes[0], omit: codes.slice(1) };
});

/** The typed API reference of one built component route, as the page shows it. */
export function renderedComponent(root) {
	const api = elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === 'api-reference');
	if (api === undefined) throw new Error('the page has no API reference section');
	const inApi = elements(api);
	const exportsList = inApi.find((node) => node.tagName === 'dl' && attributeValue(node, 'data-api-exports') !== undefined);
	const exportsRendered = exportsList === undefined ? [] : elements(exportsList).filter((node) => node.tagName === 'div' && classNames(node).has('api-export')).map((node) => {
		const parts = elements(node).find((child) => child.tagName === 'ul' && attributeValue(child, 'data-api-parts') !== undefined);
		const signature = elements(node).find((child) => child.tagName === 'code' && classNames(child).has('api-signature'));
		const doc = elements(node).find((child) => child.tagName === 'p' && classNames(child).has('api-export-doc'));
		const link = elements(node).find((child) => child.tagName === 'a' && elements(child).some((code) => classNames(code).has('api-name')));
		return {
			name: text(elements(node).find((child) => child.tagName === 'code' && classNames(child).has('api-name'))),
			kind: attributeValue(node, 'data-api-kind'),
			kindText: text(elements(node).find((child) => child.tagName === 'span' && classNames(child).has('api-kind'))),
			import: text(elements(node).find((child) => child.tagName === 'code' && attributeValue(child, 'data-api-import') !== undefined)),
			signature: signature === undefined ? null : text(signature),
			doc: doc === undefined ? null : text(doc),
			parts: parts === undefined ? [] : elements(parts).filter((child) => child.tagName === 'a').map((anchor) => ({ text: text(anchor), href: attributeValue(anchor, 'href') })),
			tableHref: link === undefined ? null : attributeValue(link, 'href'),
		};
	});
	const partsRendered = inApi.filter((node) => node.tagName === 'details' && classNames(node).has('api-part')).map((node) => {
		const inside = elements(node);
		const find = (predicate) => inside.find(predicate);
		const heading = find((child) => child.tagName === 'h3');
		const generics = find((child) => attributeValue(child, 'data-api-generics') !== undefined);
		const natives = find((child) => attributeValue(child, 'data-api-natives') !== undefined);
		const sameAs = find((child) => attributeValue(child, 'data-api-same-as') !== undefined);
		const sameAsLink = sameAs === undefined ? undefined : elements(sameAs).find((child) => child.tagName === 'a');
		const table = find((child) => child.tagName === 'table' && classNames(child).has('api-table'));
		const rendered = {
			heading: read(heading),
			anchor: heading === undefined ? null : (attributeValue(heading, 'id') ?? null),
			import: read(find((child) => attributeValue(child, 'data-api-part-import') !== undefined)),
			open: attributeValue(node, 'open') !== undefined,
			ref: read(find((child) => attributeValue(child, 'data-api-ref') !== undefined)),
			natives: natives === undefined ? [] : nativesOf(natives),
			generics: generics === undefined ? [] : elements(generics).filter((child) => child.tagName === 'code').map((code) => text(code)),
			sameAs: sameAsLink === undefined ? null : text(sameAsLink),
			sameAsHref: sameAsLink === undefined ? null : attributeValue(sameAsLink, 'href'),
			hasTable: table !== undefined,
			hasAlternatives: table !== undefined && classNames(table).has('api-table-alternatives'),
			// The columns the table's header has, which every row of every group must fill exactly.
			columns: table === undefined ? 0 : elements(table).filter((child) => child.tagName === 'thead').flatMap((head) => head.childNodes.filter((row) => row.tagName === 'tr')).reduce((widest, row) => Math.max(widest, spanOf(row)), 0),
			groups: [],
		};
		if (table === undefined) return rendered;
		rendered.groups = elements(table).filter((child) => child.tagName === 'tbody').map((group) => {
			const inGroup = elements(group);
			const header = inGroup.find((child) => child.tagName === 'tr' && classNames(child).has('api-group-row'));
			const headerCell = header === undefined ? undefined : elements(header).find((child) => child.tagName === 'th');
			const ref = inGroup.find((child) => attributeValue(child, 'data-api-group-ref') !== undefined);
			const groupNatives = inGroup.filter((child) => attributeValue(child, 'data-api-group-native') !== undefined).map((child) => {
				const codes = elements(child).filter((code) => code.tagName === 'code').map((code) => text(code));
				return { type: codes[0], omit: codes.slice(1) };
			});
			// Every row in the order the page has it, as a row or a closing row, so the order itself can be compared.
			const sequence = inGroup.filter((child) => child.tagName === 'tr' && classNames(child).has('api-row')).map((row) => {
				const cell = (name) => elements(row).find((child) => attributeValue(child, name) !== undefined);
				const stateCell = cell('data-api-state');
				const state = read(stateCell);
				// The text a reader sees, and the attribute the colour and the checker key on, must say the same.
				const marked = stateCell === undefined ? null : (attributeValue(stateCell, 'data-api-state') ?? null);
				if (classNames(row).has('api-closing')) {
					return {
						closing: true,
						state,
						marked: [marked, attributeValue(row, 'data-api-closing') ?? null],
						names: elements(row).filter((child) => child.tagName === 'code').map((code) => text(code)),
					};
				}
				const typeCell = cell('data-api-type');
				const typeText = typeCell === undefined ? undefined : elements(typeCell).find((child) => child.tagName === 'code' && classNames(child).has('api-type-text'));
				const values = typeCell === undefined ? undefined : elements(typeCell).find((child) => attributeValue(child, 'data-api-values') !== undefined);
				const defaultCell = cell('data-api-default');
				const when = cell('data-api-when');
				const event = cell('data-api-event');
				const docCell = cell('data-api-doc');
				return {
					closing: false,
					name: read(elements(row).find((child) => child.tagName === 'code' && classNames(child).has('api-name'))),
					when: when === undefined ? 'always' : text(when),
					type: read(typeText),
					links: typeCell === undefined ? [] : [...new Set(elements(typeCell).filter((child) => child.tagName === 'a').map((anchor) => `${text(anchor)} -> ${attributeValue(anchor, 'href')}`))].sort(),
					...(values !== undefined && { values: text(values) }),
					state,
					marked: [marked],
					default: defaultCell === undefined ? undefined : (elements(defaultCell).some((child) => classNames(child).has('api-none')) ? null : { text: read(elements(defaultCell).find((child) => child.tagName === 'code')), authored: elements(defaultCell).some((child) => attributeValue(child, 'data-api-authored') !== undefined) }),
					doc: docCell === undefined ? undefined : (text(docCell) || null),
					event: event === undefined ? null : text(event).replace(/^event /u, ''),
				};
			});
			// What each row spans, in the page's order: a row that spans more or fewer columns than the header has makes a column of its own.
			const spans = group.childNodes.filter((child) => child.tagName === 'tr').map((row) => ({
				what: classNames(row).has('api-group-row') ? 'group header' : classNames(row).has('api-closing') ? `closing row ${elements(row).filter((child) => child.tagName === 'code').map((code) => text(code)).join(', ')}` : `row ${read(elements(row).find((child) => child.tagName === 'code' && classNames(child).has('api-name')))}`,
				span: spanOf(row),
			}));
			return {
				spans,
				label: headerCell === undefined ? null : (() => {
					const code = elements(headerCell).find((child) => child.tagName === 'code');
					return code === undefined ? headerCell.childNodes.filter((child) => child.nodeName === '#text').map((child) => child.value).join('').trim() : text(code);
				})(),
				ref: ref === undefined ? null : text(elements(ref).find((child) => child.tagName === 'code' || (child.tagName === 'span' && classNames(child).has('api-none')))),
				natives: groupNatives,
				order: sequence.map(({ closing }) => (closing ? 'closing' : 'row')),
				rows: sequence.filter(({ closing }) => !closing),
				closing: sequence.filter(({ closing }) => closing),
			};
		});
		return rendered;
	});
	const typesList = inApi.find((node) => node.tagName === 'div' && attributeValue(node, 'data-api-types') !== undefined);
	const typesRendered = typesList === undefined ? [] : elements(typesList).filter((node) => node.tagName === 'details' && classNames(node).has('api-type-entry')).map((node) => ({
		name: attributeValue(node, 'data-api-type-entry'),
		id: attributeValue(node, 'id'),
		imports: elements(node).filter((child) => child.tagName === 'code' && attributeValue(child, 'data-api-import') !== undefined).map((code) => text(code)),
		text: textContent(elements(node).find((child) => child.tagName === 'pre')),
		links: elements(node).filter((child) => child.tagName === 'a').length,
	}));
	const catalogOnly = inApi.find((node) => attributeValue(node, 'data-api-catalog-only') !== undefined);
	const catalogOnlyRendered = catalogOnly === undefined ? [] : (() => {
		const result = [];
		let owner = null;
		for (const child of catalogOnly.childNodes) {
			if (child.tagName === 'code' && !classNames(child).has('inline-code')) owner = text(child);
			else if (child.tagName === 'code') {
				let group = result.find((entry) => entry.owner === owner);
				if (group === undefined) result.push(group = { owner, names: [] });
				group.names.push(text(child));
			}
		}
		return result;
	})();
	return {
		legend: inApi.some((node) => attributeValue(node, 'data-api-legend') !== undefined),
		exports: exportsRendered,
		parts: partsRendered,
		types: typesRendered,
		catalogOnly: catalogOnlyRendered,
		typeCells: inApi.filter((node) => node.tagName === 'td' && attributeValue(node, 'data-api-type') !== undefined).length,
	};
}

/** The Events section of a built route: each group's owner heading and fact, with its rows. */
export function renderedEvents(section) {
	const groups = [];
	let owner = null;
	for (const node of elements(section)) {
		if (node.tagName === 'h3') owner = text(node);
		const fact = attributeValue(node, 'data-fact');
		if (fact === undefined || !fact.endsWith('events')) continue;
		groups.push({
			owner: fact === 'binding.api.events' ? null : owner,
			fact,
			sentence: node.tagName === 'p' ? text(node) : null,
			events: node.tagName === 'p' ? [] : elements(node).filter((row) => row.tagName === 'tr').map((row) => {
				const signatures = elements(row).find((child) => attributeValue(child, 'data-api-signatures') !== undefined);
				return {
					channel: text(elements(row).find((child) => child.tagName === 'th')),
					handler: text(elements(row).filter((child) => child.tagName === 'td')[0]),
					signatures: elements(signatures).filter((child) => child.tagName === 'span' && classNames(child).has('api-signature-entry')).map((entry) => ({
						text: text(elements(entry).find((child) => child.tagName === 'code' && classNames(child).has('api-signature'))),
						declaredBy: elements(entry).filter((child) => attributeValue(child, 'data-api-declared-by') !== undefined).flatMap((by) => elements(by).filter((code) => code.tagName === 'code').map((code) => text(code))),
					})),
					none: elements(signatures).some((child) => classNames(child).has('api-none')),
				};
			}),
		});
	}
	return groups;
}

/** Whether a built reference route exists in a dist. */
export const routeFile = (dist, route) => resolve(dist, route.replace(/^\//u, ''), 'index.html');
export const routeExists = (dist, route) => existsSync(routeFile(dist, route));

// ---- comparing ----

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** The differences between what a component page must show and what it shows. */
export function compareComponent(expected, rendered, events, route, { collapseAbove }) {
	const problems = [];
	const report = (message) => problems.push(`${route} ${message}`);
	if (!rendered.legend) report('has no legend for the table states.');
	// Parts, each under its owner heading, in the model's order.
	const headings = rendered.parts.map(({ heading }) => heading);
	if (!same(headings, expected.parts.map(({ heading }) => heading))) report(`part headings are ${headings.join(', ')}, expected ${expected.parts.map(({ heading }) => heading).join(', ')}.`);
	const collapsed = expected.parts.length > collapseAbove;
	for (const [index, part] of expected.parts.entries()) {
		const shown = rendered.parts.find(({ heading }) => heading === part.heading);
		if (shown === undefined) continue;
		const where = `${part.heading}`;
		if (shown.anchor !== `api-reference-${slug(part.heading)}`) report(`${where} has the anchor ${shown.anchor}.`);
		if (shown.open !== (!collapsed || index === 0)) report(`${where} is ${shown.open ? 'open' : 'closed'}, expected ${!collapsed || index === 0 ? 'open' : 'closed'} by the page's part count.`);
		if (shown.import !== part.import) report(`${where} import line is "${shown.import}", expected "${part.import}".`);
		if (shown.ref !== part.ref) report(`${where} ref line is "${shown.ref}", expected "${part.ref}".`);
		if (!same(shown.natives, part.natives)) report(`${where} native line is ${JSON.stringify(shown.natives)}, expected ${JSON.stringify(part.natives)}.`);
		if (!same(shown.generics, part.generics)) report(`${where} generics are ${JSON.stringify(shown.generics)}, expected ${JSON.stringify(part.generics)}.`);
		if (part.sameAs !== undefined) {
			if (shown.sameAs !== part.sameAs || shown.hasTable) report(`${where} is not shown as the same component as ${part.sameAs}.`);
			continue;
		}
		if (!shown.hasTable || shown.hasAlternatives !== (part.groups.length > 1)) report(`${where} table ${shown.hasTable ? 'has' : 'lacks'} the Applies when column wrongly.`);
		// Prop, Applies when (only with alternatives), Type, Required, Default, Description: every row fills those and no more.
		const columns = part.groups.length > 1 ? 6 : 5;
		if (shown.columns !== columns) report(`${where} table has ${shown.columns} columns, expected ${columns}.`);
		for (const group of shown.groups) {
			for (const { what, span } of group.spans) {
				if (span !== columns) report(`${where}${group.label === null ? '' : ` (${group.label})`} ${what} spans ${span} columns, the table has ${columns}.`);
			}
		}
		if (!same(shown.groups.map(({ label }) => label), part.groups.map(({ label }) => label))) {
			report(`${where} groups are ${JSON.stringify(shown.groups.map(({ label }) => label))}, expected ${JSON.stringify(part.groups.map(({ label }) => label))}.`);
			continue;
		}
		for (const [at, group] of part.groups.entries()) {
			const got = shown.groups[at];
			const context = `${where}${group.label === null ? '' : ` (${group.label})`}`;
			if (got.ref !== group.ref) report(`${context} group ref is ${JSON.stringify(got.ref)}, expected ${JSON.stringify(group.ref)}.`);
			if (!same(got.natives, group.natives)) report(`${context} group native line differs.`);
			// The rows come first in the model's order and the closing rows finish the group; the page's whole order is that.
			const wantedOrder = [...group.rows.map(() => 'row'), ...group.closing.map(() => 'closing')];
			if (!same(got.order, wantedOrder)) report(`${context} shows its rows in the order ${got.order.join(', ')}, expected ${group.rows.length} rows then ${group.closing.length} closing rows.`);
			if (!same(got.rows.map(({ name }) => name), group.rows.map(({ name }) => name))) {
				report(`${context} rows are ${got.rows.map(({ name }) => name).join(', ')}, expected ${group.rows.map(({ name }) => name).join(', ')}.`);
				continue;
			}
			for (const [rowAt, row] of group.rows.entries()) {
				const seen = got.rows[rowAt];
				const diff = ['when', 'type', 'state', 'doc', 'event'].filter((key) => seen[key] !== row[key]);
				if (!same(seen.values, row.values)) diff.push('values');
				if (!same(seen.default, row.default)) diff.push('default');
				if (!same(seen.links, row.links)) diff.push('links');
				if (!same(seen.marked, [row.state])) diff.push('state marker');
				if (diff.length > 0) report(`${context} row ${row.name} differs in ${diff.join(', ')}: ${JSON.stringify(Object.fromEntries(diff.map((key) => [key, [seen[key], row[key]]])))}.`);
			}
			// A closing row is what a reader sees: the state it shows and the names it lists, not only what it is marked with.
			const closing = got.closing.map(({ state, names }) => ({ state, names }));
			if (!same(closing, group.closing)) report(`${context} closing rows are ${JSON.stringify(closing)}, expected ${JSON.stringify(group.closing)}.`);
			for (const row of got.closing) {
				if (row.marked.some((marked) => marked !== row.state)) report(`${context} closing row ${row.names.join(', ')} shows "${row.state}" but is marked ${JSON.stringify(row.marked)}.`);
			}
		}
	}
	// "No type cell without a model source": every type cell on the page belongs to a row the model has.
	const expectedCells = expected.parts.reduce((total, part) => total + part.groups.reduce((sum, group) => sum + group.rows.length, 0), 0);
	if (rendered.typeCells !== expectedCells) report(`shows ${rendered.typeCells} type cells, the model has ${expectedCells} rows.`);

	// Parts and related exports, with the exact import of each.
	const names = rendered.exports.map(({ name }) => name);
	if (!same(names, expected.exports.map(({ name }) => name))) report(`exports are ${names.join(', ')}, expected ${expected.exports.map(({ name }) => name).join(', ')}.`);
	for (const item of expected.exports) {
		const shown = rendered.exports.find(({ name }) => name === item.name);
		if (shown === undefined) continue;
		const diff = [];
		if (shown.kind !== item.kind || shown.kindText !== item.kind) diff.push(`kind ${shown.kind}/${shown.kindText}`);
		if (shown.import !== item.import) diff.push(`import "${shown.import}", expected "${item.import}"`);
		if (shown.signature !== item.signature) diff.push(`signature "${shown.signature}", expected "${item.signature}"`);
		if (shown.doc !== item.doc) diff.push('doc');
		if (!same(shown.parts.map(({ text: label }) => label), item.parts)) diff.push(`parts ${shown.parts.map(({ text: label }) => label).join(', ')}, expected ${item.parts.join(', ')}`);
		for (const link of shown.parts) if (!rendered.parts.some(({ anchor }) => `#${anchor}` === link.href)) diff.push(`part link ${link.href} reaches no table`);
		if ((item.table === null) !== (shown.tableHref === null) || (item.table !== null && shown.tableHref !== `#api-reference-${slug(item.table)}`)) diff.push('table link');
		if (diff.length > 0) report(`export ${item.name} differs: ${diff.join('; ')}.`);
	}
	// Types: the owner's exported types by the inventory, each with its imports and its declaration as written.
	const typeNames = rendered.types.map(({ name }) => name).sort();
	if (!same(typeNames, expected.inventoryTypeNames)) report(`types are ${typeNames.join(', ')}, the inventory exports ${expected.inventoryTypeNames.join(', ')}.`);
	if (!same(rendered.types.map(({ name }) => name), expected.types.map(({ name }) => name))) report('types are not in the model\'s order.');
	for (const type of expected.types) {
		const shown = rendered.types.find(({ name }) => name === type.name);
		if (shown === undefined) continue;
		if (shown.id !== `type-${type.name}`) report(`type ${type.name} has the anchor ${shown.id}.`);
		if (!same(shown.imports, type.imports)) report(`type ${type.name} imports ${JSON.stringify(shown.imports)}, expected ${JSON.stringify(type.imports)}.`);
		if (shown.text !== type.text) report(`type ${type.name} declaration differs from the model.`);
	}
	// Catalog props with no member of their own.
	if (!same(rendered.catalogOnly, expected.catalogOnly)) report(`catalog-only props are ${JSON.stringify(rendered.catalogOnly)}, expected ${JSON.stringify(expected.catalogOnly)}.`);

	// Events: the catalog's channels, each with the prop that reports it and the signatures the declarations give it.
	const expectedEvents = expected.events.map((group) => ({ owner: group.owner, fact: group.fact }));
	const shownEvents = events.filter(({ sentence }) => sentence === null).map(({ owner, fact }) => ({ owner, fact }));
	if (!same(shownEvents, expectedEvents)) report(`event groups are ${JSON.stringify(shownEvents)}, expected ${JSON.stringify(expectedEvents)}.`);
	for (const group of expected.events) {
		const shown = events.find(({ fact }) => fact === group.fact);
		if (shown === undefined) continue;
		const got = shown.events.map(({ channel, handler, signatures }) => ({ channel, handler, signatures: signatures.map(({ text: signature, declaredBy }) => ({ text: signature, declaredBy })) }));
		if (!same(got, group.events)) report(`${group.owner ?? 'root'} events differ: ${JSON.stringify(got)}, expected ${JSON.stringify(group.events)}.`);
	}
	return problems;
}

// ---- the sources a page links ----

const repositoryUrl = 'https://github.com/ndrewtran/muxui/blob/main/';

/** A source link as a reader gets it: the repository path its href reaches (the whole href when it reaches elsewhere) and the text it shows. */
function sourceLink(link) {
	if (link === undefined) return null;
	const href = attributeValue(link, 'href') ?? '';
	return { path: href.startsWith(repositoryUrl) ? href.slice(repositoryUrl.length) : href, text: text(link) };
}

/** The declarations a family's tables were read from: its reference file, then the source of each declaration module that file was generated from. */
export function declarationSources(reference, owner) {
	return [`packages/react/reference/${reference.inventory.owners[owner]}`, ...Object.values(reference.files.get(owner).sources)];
}

/** What a component page's Sources section must list, in order: the record, its examples, the runtime file, the manifest and the declarations. */
export function expectedSources({ record, examples, runtime, reference, owner }) {
	return [
		{ label: 'Component record', paths: [record] },
		{ label: 'Examples', paths: examples.map(({ source }) => source.content) },
		{ label: 'Runtime', paths: [runtime] },
		{ label: 'Package imports', paths: ['packages/react/package.json'] },
		{ label: 'Declarations', paths: declarationSources(reference, owner) },
	];
}

/** The Sources section of a built page: each label with every link under it, in order (an entry with no link reads as null). */
export function renderedSources(section) {
	const groups = [];
	for (const node of elements(section)) {
		if (node.tagName === 'dt') groups.push({ label: text(node), links: [] });
		if (node.tagName === 'dd') {
			const links = elements(node).filter((child) => child.tagName === 'a');
			groups.at(-1)?.links.push(...(links.length === 0 ? [null] : links.map(sourceLink)));
		}
	}
	return groups;
}

/** The differences between the sources a page must list and the ones it links. */
export function compareSources(expected, rendered, route) {
	const problems = [];
	const report = (message) => problems.push(`${route} ${message}`);
	if (!same(rendered.map(({ label }) => label), expected.map(({ label }) => label))) report(`source groups are ${rendered.map(({ label }) => label).join(', ')}, expected ${expected.map(({ label }) => label).join(', ')}.`);
	for (const group of expected) {
		const shown = rendered.find(({ label }) => label === group.label);
		if (shown === undefined) continue;
		const paths = shown.links.map((link) => link?.path ?? null);
		if (!same(paths, group.paths)) report(`${group.label} sources are ${JSON.stringify(paths)}, expected ${JSON.stringify(group.paths)}.`);
		else if (shown.links.some((link) => link.text !== link.path)) report(`${group.label} sources show text other than the path they link.`);
	}
	return problems;
}

// ---- the package exports page and the inventory ----

/** The entries, package-level exports and shared types the package exports page must show, from the manifest and inventory. */
export function expectedPackageExports({ manifest, reference }) {
	const packageName = manifest.name;
	const specifier = (key) => (key === '.' ? packageName : `${packageName}${key.slice(1)}`);
	const entries = Object.keys(manifest.exports).map((key) => {
		const entry = reference.inventory.entries.find((candidate) => candidate.key === key);
		return {
			key,
			specifier: specifier(key),
			declarations: entry === undefined ? 'missing from the inventory' : entry.untyped ? `None: ${entry.reason}` : `${entry.exports.length} exports`,
		};
	});
	const owned = (owner) => reference.inventory.entries.flatMap((entry) => (entry.exports ?? []).filter((item) => item.owner === owner).map((item) => ({ ...item, entry: entry.key })));
	const packageFile = reference.files.get('package-level');
	return {
		entries,
		inventoryKeys: reference.inventory.entries.map(({ key }) => key),
		// A value or type shows the source of the module the inventory says declares it, whatever its own record says.
		packageLevel: owned('package-level').filter(({ kind }) => kind === 'value').map((item) => {
			const declared = packageFile.exports.find((candidate) => candidate.name === item.name && candidate.entry === item.entry);
			return {
				name: item.name,
				import: `import { ${item.name} } from '${specifier(item.entry)}';`,
				signature: declared?.kind === 'function' ? declared.signature : `${item.name}: ${declared?.type}`,
				reason: item.reason,
				module: item.module,
				source: packageFile.sources[item.module],
			};
		}),
		packageTypes: owned('package-level').filter(({ kind }) => kind === 'type').map(({ name, entry, reason, module }) => ({ name, module, source: packageFile.sources[module], imports: [`import type { ${name} } from '${specifier(entry)}';`], text: packageFile.types.find((type) => type.name === name)?.text, reason })),
		sharedTypes: owned('shared').filter(({ kind }) => kind === 'type').map(({ name, entry, reason, module }) => ({ name, module, source: reference.files.get('shared').sources[module], imports: [`import type { ${name} } from '${specifier(entry)}';`], text: reference.files.get('shared').types.find((type) => type.name === name)?.text, reason })),
	};
}

/** The package exports page of a dist, as it shows these. */
export function renderedPackageExports(root) {
	const section = (id) => elements(root).find((node) => node.tagName === 'section' && attributeValue(node, 'id') === id);
	const entries = section('entry-points');
	// Every source note under a node, each as the links it holds: a page must show exactly one note with one link.
	const sourcesOf = (node) => elements(node).filter((child) => attributeValue(child, 'data-api-source') !== undefined).map((note) => elements(note).filter((child) => child.tagName === 'a').map(sourceLink));
	const types = (node) => elements(node).filter((child) => child.tagName === 'details' && classNames(child).has('api-type-entry')).map((entry) => ({
		name: attributeValue(entry, 'data-api-type-entry'),
		imports: elements(entry).filter((child) => child.tagName === 'code' && attributeValue(child, 'data-api-import') !== undefined).map((code) => text(code)),
		text: textContent(elements(entry).find((child) => child.tagName === 'pre')),
		reason: (() => {
			const reason = elements(entry).find((child) => attributeValue(child, 'data-api-reason') !== undefined);
			return reason === undefined ? undefined : text(reason);
		})(),
		sources: sourcesOf(entry),
	}));
	const packageLevel = section('package-level');
	return {
		entries: elements(entries).filter((node) => node.tagName === 'tr' && attributeValue(node, 'data-package-entry') !== undefined).map((row) => ({
			key: attributeValue(row, 'data-package-entry'),
			specifier: text(elements(row).find((child) => child.tagName === 'code')),
			declarations: text(elements(row).find((child) => child.tagName === 'td')),
		})),
		packageLevel: elements(packageLevel).filter((node) => node.tagName === 'div' && classNames(node).has('api-export')).map((node) => ({
			name: text(elements(node).find((child) => child.tagName === 'code' && classNames(child).has('api-name'))),
			import: text(elements(node).find((child) => child.tagName === 'code' && attributeValue(child, 'data-api-import') !== undefined)),
			signature: text(elements(node).find((child) => child.tagName === 'code' && classNames(child).has('api-signature'))),
			reason: (() => {
				const reason = elements(node).find((child) => attributeValue(child, 'data-api-reason') !== undefined);
				return reason === undefined ? undefined : text(reason);
			})(),
			sources: sourcesOf(node),
		})),
		packageTypes: types(packageLevel),
		sharedTypes: types(section('shared-types')),
	};
}

export function comparePackageExports(expected, rendered, manifestKeys) {
	const problems = [];
	const report = (message) => problems.push(`/package-exports/ ${message}`);
	if (!same([...manifestKeys].sort(), [...expected.inventoryKeys].sort())) report(`the inventory lists ${expected.inventoryKeys.join(', ')}, the package exports ${manifestKeys.join(', ')}.`);
	if (!same(rendered.entries, expected.entries)) report(`entry points are ${JSON.stringify(rendered.entries)}, expected ${JSON.stringify(expected.entries)}.`);
	if (!same(rendered.packageLevel.map(({ sources, ...shown }) => shown), expected.packageLevel.map(({ module, source, ...wanted }) => wanted))) report(`package-level exports are ${JSON.stringify(rendered.packageLevel.map(({ name }) => name))}, expected ${JSON.stringify(expected.packageLevel.map(({ name }) => name))}, or an import or signature differs.`);
	// Every value and type shows the source of its declaration module: no family page's source list names it.
	const checkSources = (wanted, shown) => {
		for (const item of wanted) {
			const got = shown.find(({ name }) => name === item.name);
			if (item.source === undefined) report(`${item.name} has no source: the reference lists none for its module ${item.module}.`);
			else if (got !== undefined && !same(got.sources, [[{ path: item.source, text: item.source }]])) report(`${item.name} shows ${JSON.stringify(got.sources)} as its source notes, expected exactly one note with one link, to ${item.source}.`);
		}
	};
	checkSources(expected.packageLevel, rendered.packageLevel);
	for (const kind of ['packageTypes', 'sharedTypes']) {
		const shown = rendered[kind].map(({ name, imports, text: declaration, reason }) => ({ name, imports, text: declaration, ...(reason !== undefined && { reason }) }));
		const wanted = expected[kind].map(({ name, imports, text: declaration, reason }) => ({ name, imports, text: declaration, ...(reason !== undefined && { reason }) }));
		if (!same(shown.map(({ name }) => name).sort(), wanted.map(({ name }) => name).sort())) report(`${kind} are ${shown.map(({ name }) => name).join(', ')}, expected ${wanted.map(({ name }) => name).join(', ')}.`);
		for (const type of wanted) {
			const got = shown.find(({ name }) => name === type.name);
			if (got !== undefined && !same(got, type)) report(`${type.name} differs from the inventory and the model.`);
		}
		checkSources(expected[kind], rendered[kind]);
	}
	return problems;
}
