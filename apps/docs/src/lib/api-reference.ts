// The typed API reference of one component page (Decision 0031), as data the Astro components render.
//
// The declarations the package ships, read into `packages/react/reference/`, supply each row's type text,
// requiredness, comment, ref and alternatives; the catalog supplies defaults and which callback reports which
// event channel. This module only arranges them: it reads no type string for meaning, adds no sentence, and
// leaves a comment absent when the declaration has none.
import type {
	ComponentDeclarations,
	DeclarationAlternative,
	DeclarationExport,
	DeclarationFile,
	DeclarationInventory,
	DeclarationMember,
	DeclarationPart,
	DeclarationRef,
	DeclarationType,
} from '../../../component-reference.mjs';

/** A run of type text, linked to the declaration of the Mux UI type it names. */
export interface Segment {
	text: string;
	href?: string;
}

export interface ApiDefault {
	text: string;
	/** Written in the component record by hand, not read from the code that runs: its family has not moved to TypeScript yet. */
	authored: boolean;
}

export interface ApiRow {
	name: string;
	/** `always` for a member every alternative shares, otherwise the label of the group the row sits in. */
	appliesWhen: string;
	type: readonly Segment[];
	/** The finite values of a literal union, when the printed type is not already that union. */
	values?: string;
	state: 'required' | 'optional';
	default?: ApiDefault;
	doc?: string;
	/** The catalog event channel this callback reports. */
	event?: string;
}

/** A closing row of a group: members it declares `never` ("not allowed"), or that a sibling alternative declares and it does not ("not declared"). */
export interface ApiClosing {
	state: 'not allowed' | 'not declared';
	names: readonly string[];
}

export interface ApiNative {
	type: string;
	omit: readonly string[];
}

export interface ApiGroup {
	/** Null for the only group of a part with no alternatives. */
	label: string | null;
	appliesWhen: string;
	/** The ref of this alternative, shown only when the alternative declares its own. */
	ref?: string;
	natives: readonly ApiNative[];
	rows: readonly ApiRow[];
	closing: readonly ApiClosing[];
}

export interface ApiPart {
	heading: string;
	anchor: string;
	/** The import of the export that holds the part. */
	import: string;
	/** The ref line: the element, `not allowed`, `per alternative`, or `none declared`. */
	ref: string;
	natives: readonly ApiNative[];
	generics: readonly string[];
	/** Set when the part is the same component as another member, so it has no table of its own. */
	sameAs?: { heading: string; anchor: string };
	hasAlternatives: boolean;
	groups: readonly ApiGroup[];
	rowCount: number;
}

export interface ApiExport {
	name: string;
	kind: 'component' | 'hook' | 'function' | 'value';
	import: string;
	/** A function's signature or `name: type` for a value. */
	signature?: readonly Segment[];
	doc?: string;
	/** Why a package-level export belongs to the package and not to a component, from the inventory. */
	reason?: string;
	/** The table of the export's own part, for a component without member parts. */
	anchor?: string;
	parts: readonly { heading: string; anchor: string }[];
}

export interface ApiType {
	name: string;
	anchor: string;
	imports: readonly string[];
	text: string;
	segments: readonly Segment[];
	/** Why a shared or package-level type belongs where it is, from the inventory. */
	reason?: string;
}

export interface ApiEvent {
	channel: string;
	handler: string;
	signatures: readonly { segments: readonly Segment[]; text: string; declaredBy: readonly string[] }[];
}

export interface ApiEventGroup {
	/** The anatomy part the catalog lists the events under; null for the root's. */
	part: string | null;
	owner: string | null;
	events: readonly ApiEvent[];
}

/** The catalog's web.react API as the docs loader reads it. */
export interface ApiCatalog {
	/** Its defaults are executed; otherwise they are authored in the component record. */
	derived: boolean;
	props: readonly string[];
	events: readonly string[];
	defaults: Readonly<Record<string, unknown>>;
	partApis?: Readonly<Record<string, { member: string; props: readonly string[]; events: readonly string[]; defaults: Readonly<Record<string, unknown>> }>>;
}

export interface ApiReference {
	parts: readonly ApiPart[];
	exports: readonly ApiExport[];
	types: readonly ApiType[];
	events: readonly ApiEventGroup[];
	/** Catalog props no part declares as a member, by owner: the host element or a hook's options carry them. */
	catalogOnly: readonly { owner: string | null; names: readonly string[] }[];
}

export const packageExportsPath = '/package-exports/';

/** A page with more parts than this opens only its first part; every part stays listed and reachable by its anchor. */
export const collapsePartsAbove = 8;

/** The default a row shows is formatted as a literal in the type text's own style. */
export function literal(value: string | number | boolean | null): string {
	return typeof value === 'string' ? `'${value}'` : String(value);
}

function formatDefault(value: unknown): string {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return literal(value);
	return JSON.stringify(value);
}

export function slugify(value: string): string {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
}

export function partHeading(exportName: string, part: DeclarationPart): string {
	return part.member === null ? exportName : `${exportName}.${part.member}`;
}

export function partAnchor(heading: string): string {
	return `api-reference-${slugify(heading)}`;
}

export function typeAnchor(name: string): string {
	return `type-${name}`;
}

export function importLine(packageName: string, entry: string, name: string, type = false): string {
	const specifier = entry === '.' ? packageName : `${packageName}${entry.slice(1)}`;
	return `import ${type ? 'type ' : ''}{ ${name} } from '${specifier}';`;
}

const isRoot = (part: DeclarationPart) => part.member === null || part.member === 'Root';

/** The names a part declares, in every alternative it has. */
function declaredNames(part: DeclarationPart): ReadonlySet<string> {
	return new Set([...(part.members ?? []), ...(part.alternatives ?? []).flatMap(({ members }) => members)].map(({ name }) => name));
}

const handlerOf = (channel: string) => `on${channel[0].toUpperCase()}${channel.slice(1)}`;

/** Where a link to a type goes: its own page's section, or the page or section of the owner that exports it. */
export function typeHref(type: DeclarationType, owner: string): string | undefined {
	if (type.public === undefined || type.owner === undefined) return undefined;
	const anchor = `#${typeAnchor(type.name)}`;
	if (type.owner === owner) return anchor;
	return type.owner === 'shared' || type.owner === 'package-level' ? `${packageExportsPath}${anchor}` : `/components/${type.owner}/${anchor}`;
}

/**
 * Splits type text into runs, linking each name the member's `refs` list. A name inside a string literal or after a
 * `.` is left alone. This does not read meaning from the text: the model already says which Mux UI types it names.
 */
export function typeSegments(text: string, hrefs: ReadonlyMap<string, string>): readonly Segment[] {
	if (hrefs.size === 0) return [{ text }];
	const segments: Segment[] = [];
	let plain = '';
	const token = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[A-Za-z_$][\w$]*/gu;
	let last = 0;
	for (const match of text.matchAll(token)) {
		const [value] = match;
		const href = hrefs.get(value);
		if (href === undefined || text[match.index - 1] === '.') continue;
		plain += text.slice(last, match.index);
		if (plain !== '') segments.push({ text: plain });
		plain = '';
		segments.push({ text: value, href });
		last = match.index + value.length;
	}
	plain += text.slice(last);
	if (plain !== '') segments.push({ text: plain });
	return segments;
}

interface Context {
	owner: string;
	types: ReadonlyMap<string, DeclarationType>;
}

function segmentsFor(text: string, refs: readonly string[] | undefined, context: Context): readonly Segment[] {
	const hrefs = new Map<string, string>();
	for (const id of refs ?? []) {
		const type = context.types.get(id);
		const href = type === undefined ? undefined : typeHref(type, context.owner);
		if (type !== undefined && href !== undefined) hrefs.set(type.name, href);
	}
	return typeSegments(text, hrefs);
}

/** Every `refs` array under a model item. */
function collectRefs(node: unknown, found = new Set<string>()): Set<string> {
	if (Array.isArray(node)) {
		for (const item of node) collectRefs(item, found);
	} else if (node !== null && typeof node === 'object') {
		for (const [key, value] of Object.entries(node)) {
			if (key === 'refs' && Array.isArray(value)) for (const id of value) found.add(String(id));
			else collectRefs(value, found);
		}
	}
	return found;
}

function refText(ref: DeclarationRef | undefined): string | undefined {
	if (ref === null || ref === undefined) return undefined;
	return 'never' in ref ? 'not allowed' : ref.type;
}

function nativesOf(natives: DeclarationPart['natives']): readonly ApiNative[] {
	return (natives ?? []).map(({ type, omit }) => ({ type, omit: omit ?? [] }));
}

function genericOf(parameter: NonNullable<DeclarationPart['typeParameters']>[number]): string {
	return `${parameter.name}${parameter.constraint === undefined ? '' : ` extends ${parameter.constraint}`}${parameter.default === undefined ? '' : ` = ${parameter.default}`}`;
}

/**
 * What the label of an alternative says, from its members alone: the member that tells the alternatives apart by
 * disjoint literal values (`layout = 'grid'`), else the members it alone requires (`requires aria-label`), else `otherwise`.
 */
export function alternativeLabel(alternatives: readonly DeclarationAlternative[], index: number): string {
	const alternative = alternatives[index];
	const maps = alternatives.map(({ members }) => new Map(members.map((member) => [member.name, member])));
	for (const member of alternative.members) {
		if (member.never === true || member.values === undefined) continue;
		const all = maps.map((map) => map.get(member.name));
		if (all.some((other) => other === undefined || other.never === true || other.values === undefined || other.values.length === 0)) continue;
		const values = all.flatMap((other) => other?.values ?? []);
		if (new Set(values).size === values.length) return `${member.name} = ${member.values.map(literal).join(' | ')}`;
	}
	const distinct = alternative.members.filter((member) => member.optional !== true && member.never !== true && maps.some((map, other) => {
		const sibling = map.get(member.name);
		return other !== index && (sibling === undefined || sibling.optional === true || sibling.never === true);
	}));
	return distinct.length > 0 ? `requires ${distinct.map(({ name }) => name).join(', ')}` : 'otherwise';
}

interface Catalog {
	defaults: Readonly<Record<string, unknown>>;
	authored: boolean;
	events: readonly string[];
}

const none: Catalog = { defaults: {}, authored: false, events: [] };

/**
 * The catalog facts each part of the component owns. A derived family's root API belongs to its root parts (the export
 * itself, and `Root`), and each `partApis` entry to the part that renders it. An authored family lists everything flat,
 * so a name goes to the root when it declares it, else to the only part that does, and to no part when several others
 * share it: no default is borrowed across parts.
 */
function catalogOwnership(catalog: ApiCatalog, parts: readonly DeclarationPart[]): (part: DeclarationPart) => Catalog {
	if (catalog.derived) {
		return (part) => {
			if (isRoot(part)) return { defaults: catalog.defaults, authored: false, events: catalog.events };
			const api = Object.values(catalog.partApis ?? {}).find(({ member }) => member === part.member);
			return api === undefined ? none : { defaults: api.defaults, authored: false, events: api.events };
		};
	}
	const names = new Map(parts.map((part) => [part, declaredNames(part)]));
	const ownersOf = (name: string) => {
		const declaring = parts.filter((part) => names.get(part)?.has(name));
		const atRoot = declaring.filter(isRoot);
		return atRoot.length > 0 ? atRoot : declaring.length === 1 ? declaring : [];
	};
	return (part) => ({
		defaults: Object.fromEntries(Object.entries(catalog.defaults).filter(([name]) => ownersOf(name).includes(part))),
		authored: true,
		events: catalog.events.filter((channel) => ownersOf(handlerOf(channel)).includes(part)),
	});
}

function defaultOf(member: DeclarationMember, catalog: Catalog): ApiDefault | undefined {
	if (member.optional !== true || member.never === true || !Object.hasOwn(catalog.defaults, member.name)) return undefined;
	const value = catalog.defaults[member.name];
	// A default that cannot be one of the member's finite values does not apply to it in this alternative.
	if (member.values !== undefined && !member.values.some((candidate) => Object.is(candidate, value))) return undefined;
	return { text: formatDefault(value), authored: catalog.authored };
}

function rowOf(member: DeclarationMember, appliesWhen: string, catalog: Catalog, context: Context): ApiRow {
	const expanded = member.values === undefined ? undefined : member.values.map(literal).join(' | ');
	const fallback = defaultOf(member, catalog);
	const event = catalog.events.find((channel) => handlerOf(channel) === member.name);
	return {
		name: member.name,
		appliesWhen,
		type: segmentsFor(member.type, member.refs, context),
		...(expanded !== undefined && expanded !== member.type && { values: expanded }),
		state: member.optional === true ? 'optional' : 'required',
		...(fallback !== undefined && { default: fallback }),
		...(member.doc !== undefined && { doc: member.doc }),
		...(event !== undefined && { event }),
	};
}

/**
 * Finds the part an alias names. The model writes `sameAs` as the export's own name (the component itself, as in
 * `Root: TextEditorComponent`) or the name of a sibling member. An alias that names neither is a broken reference, which fails.
 */
function aliasResolver(item: DeclarationExport, label: string, siblings: readonly DeclarationPart[]): (alias: DeclarationPart) => Canonical {
	return (alias) => {
		const target = alias.sameAs === item.name ? siblings.find(({ member }) => member === null) : siblings.find(({ member }) => member === alias.sameAs);
		if (target === undefined || target.sameAs !== undefined) throw new Error(`${label}.${alias.member ?? ''} is the same as ${alias.sameAs}, which is no part of ${item.name} with a description of its own.`);
		return { part: target, label };
	};
}

/** What a part says about its element and its attribute surface, which an alias shares with the part it names. */
function surfaceOf(part: DeclarationPart) {
	const alternatives = part.alternatives ?? [];
	return {
		natives: nativesOf(part.natives),
		generics: (part.typeParameters ?? []).map(genericOf),
		ref: refText(part.ref) ?? (alternatives.some(({ ref }) => refText(ref) !== undefined) ? 'per alternative' : 'none declared'),
	};
}

/** The members a part itself declares `never`: closing "not allowed" names for the group that holds its shared members. */
function forbiddenOf(members: readonly DeclarationMember[]): readonly ApiClosing[] {
	const names = members.filter(({ never }) => never === true).map(({ name }) => name);
	return names.length > 0 ? [{ state: 'not allowed', names }] : [];
}

/** Where a part that is the same component as another is described: the part it names, and the label of the export that holds it. */
interface Canonical {
	part: DeclarationPart;
	label: string;
}

function partView(exportName: string, importFrom: string, part: DeclarationPart, catalog: Catalog, context: Context, canonical: (alias: DeclarationPart) => Canonical): ApiPart {
	const heading = partHeading(exportName, part);
	const alternatives = part.alternatives ?? [];
	const base = { heading, anchor: partAnchor(heading), import: importFrom };
	if (part.sameAs !== undefined) {
		// An alias is the same component, so its ref, native surface and generics are those of the part it names, not "none declared".
		const target = canonical(part);
		const targetHeading = partHeading(target.label, target.part);
		return { ...base, ...surfaceOf(target.part), hasAlternatives: false, sameAs: { heading: targetHeading, anchor: partAnchor(targetHeading) }, groups: [], rowCount: 0 };
	}
	const rowsOf = (members: readonly DeclarationMember[], appliesWhen: string) => members.filter(({ never }) => never !== true).map((member) => rowOf(member, appliesWhen, catalog, context));
	const common = rowsOf(part.members ?? [], 'always');
	const commonClosing = forbiddenOf(part.members ?? []);
	const groups: ApiGroup[] = alternatives.length === 0
		? [{ label: null, appliesWhen: 'always', natives: [], rows: common, closing: commonClosing }]
		: [
			{ label: 'Common', appliesWhen: 'always', natives: [], rows: common, closing: commonClosing },
			...alternatives.map((alternative, index): ApiGroup => {
				const label = alternativeLabel(alternatives, index);
				const own = new Set(alternative.members.map(({ name }) => name));
				const absent = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))].filter((name) => !own.has(name));
				const ref = refText(alternative.ref);
				return {
					label,
					appliesWhen: label,
					...(ref !== undefined && { ref }),
					natives: nativesOf(alternative.natives),
					rows: rowsOf(alternative.members, label),
					closing: [
						...forbiddenOf(alternative.members),
						...(absent.length > 0 ? [{ state: 'not declared' as const, names: absent }] : []),
					],
				};
			}),
		];
	return {
		...base,
		...surfaceOf(part),
		hasAlternatives: alternatives.length > 0,
		groups,
		rowCount: groups.reduce((count, group) => count + group.rows.length + group.closing.length, 0),
	};
}

/** The member a handler prop of this name is declared with, in a part's shared members or any alternative. */
function declarationsOf(name: string, part: DeclarationPart): readonly DeclarationMember[] {
	return [...(part.members ?? []), ...(part.alternatives ?? []).flatMap(({ members }) => members)].filter((member) => member.name === name && member.never !== true);
}

/**
 * The events of one owner: each channel the catalog lists, the prop that reports it, and the exact signatures the parts in
 * `scope` declare for that prop. A prop no part declares is an option of a hook the family exports. `named` says whose
 * declaration each signature is, which a flat (authored) family needs because the catalog does not say which part owns an event.
 */
function eventGroup(
	owner: string | null,
	part: string | null,
	channels: readonly string[],
	scope: readonly DeclarationPart[],
	headings: (part: DeclarationPart) => string,
	hooks: readonly { name: string; members: readonly DeclarationMember[] }[],
	named: boolean,
	context: Context,
): ApiEventGroup {
	return {
		part,
		owner,
		events: channels.map((channel) => {
			const handler = handlerOf(channel);
			const found = scope.flatMap((candidate) => declarationsOf(handler, candidate).map((member) => ({ member, by: headings(candidate), hook: false })));
			const declared = found.length > 0 ? found : hooks.flatMap(({ name, members }) => members.filter((member) => member.name === handler).map((member) => ({ member, by: name, hook: true })));
			const signatures: { text: string; refs: readonly string[]; declaredBy: string[] }[] = [];
			for (const { member, by, hook } of declared) {
				const existing = signatures.find(({ text }) => text === member.type);
				const entry = existing ?? { text: member.type, refs: member.refs ?? [], declaredBy: [] };
				if (existing === undefined) signatures.push(entry);
				if ((named || hook) && !entry.declaredBy.includes(by)) entry.declaredBy.push(by);
			}
			return {
				channel,
				handler,
				signatures: signatures.map(({ text, refs, declaredBy }) => ({ text, segments: segmentsFor(text, refs, context), declaredBy })),
			};
		}),
	};
}

/**
 * Everything a component page shows of its types: a table per part, the parts and related exports with their
 * imports, the types it exports, and the events with their exact signatures.
 * @param input.packageName the import specifier of the package, such as `@muxui/react`
 * @param input.exportName the export the page is for
 * @param input.anatomy the record's anatomy, which orders the parts of a derived family's `partApis`
 */
export function buildApiReference({ packageName, exportName, anatomy, catalog, declarations }: {
	packageName: string;
	exportName: string;
	anatomy: readonly string[];
	catalog: ApiCatalog;
	declarations: ComponentDeclarations;
}): ApiReference {
	const context: Context = { owner: declarations.owner, types: new Map(declarations.types.map((type) => [type.id, type])) };
	const main = declarations.export;
	const mainParts = (main.parts ?? []).filter((part) => part.form !== undefined || part.sameAs !== undefined);
	const owned = catalogOwnership(catalog, mainParts);
	const flat = declarations.related.filter((item) => item.kind === 'component');
	const parts: ApiPart[] = [
		...mainParts.map((part) => partView(exportName, importLine(packageName, main.entry, main.name), part, owned(part), context, aliasResolver(main, exportName, mainParts))),
		...flat.flatMap((item) => (item.parts ?? []).filter((part) => part.form !== undefined || part.sameAs !== undefined).map((part) => partView(item.name, importLine(packageName, item.entry, item.name), part, none, context, aliasResolver(item, item.name, item.parts ?? [])))),
	];

	const exports: ApiExport[] = [main, ...declarations.related].map((item) => exportView(item, packageName, parts, context, item === main ? exportName : item.name));
	const types = typesView(declarations.types, declarations.owner, packageName, undefined, context);

	const position = (part: string) => anatomy.indexOf(part);
	const partApis = Object.entries(catalog.partApis ?? {}).sort(([left], [right]) => position(left) - position(right));
	const hooks = declarations.related.filter(({ kind }) => kind === 'function').map((item) => ({
		name: item.name,
		members: (item.parameters ?? []).flatMap(({ refs }) => (refs ?? []).flatMap((id) => context.types.get(id)?.members ?? [])),
	}));
	const rootParts = mainParts.filter(isRoot);
	const headingOf = (part: DeclarationPart) => partHeading(exportName, part);
	const events: ApiEventGroup[] = [];
	const rootChannels = catalog.events;
	if (rootChannels.length > 0) {
		events.push(eventGroup(null, null, rootChannels, catalog.derived ? rootParts : mainParts, headingOf, hooks, !catalog.derived, context));
	}
	for (const [part, api] of partApis) {
		if (api.events.length === 0) continue;
		events.push(eventGroup(`${exportName}.${api.member}`, part, api.events, mainParts.filter(({ member }) => member === api.member), headingOf, hooks, false, context));
	}

	const rootNames = new Set(rootParts.flatMap((part) => [...declaredNames(part)]));
	const allNames = new Set(mainParts.flatMap((part) => [...declaredNames(part)]));
	const catalogOnly: { owner: string | null; names: string[] }[] = [];
	const missingRoot = catalog.props.filter((name) => !(catalog.derived ? rootNames : allNames).has(name));
	if (missingRoot.length > 0) catalogOnly.push({ owner: null, names: missingRoot });
	if (catalog.derived) {
		for (const [, api] of partApis) {
			const names = new Set(mainParts.filter(({ member }) => member === api.member).flatMap((part) => [...declaredNames(part)]));
			const missing = api.props.filter((name) => !names.has(name));
			if (missing.length > 0) catalogOnly.push({ owner: `${exportName}.${api.member}`, names: missing });
		}
	}
	return { parts, exports, types, events, catalogOnly };
}

function exportView(item: DeclarationExport, packageName: string, parts: readonly ApiPart[], context: Context, label: string): ApiExport {
	const kind = item.kind === 'function' ? (/^use[A-Z]/u.test(item.name) ? 'hook' : 'function') : item.kind;
	const own = (item.parts ?? []).filter((part) => part.form !== undefined || part.sameAs !== undefined);
	const views = own.map((part) => parts.find(({ heading }) => heading === partHeading(label, part))).filter((part): part is ApiPart => part !== undefined);
	const signatureText = item.kind === 'function' ? item.signature : item.kind === 'value' ? `${item.name}: ${item.type}` : undefined;
	const memberParts = views.filter((_, index) => own[index].member !== null);
	return {
		name: item.name,
		kind,
		import: importLine(packageName, item.entry, item.name),
		...(signatureText !== undefined && { signature: segmentsFor(signatureText, [...collectRefs(item)], context) }),
		...(item.doc !== undefined && { doc: item.doc }),
		...(own.some(({ member }) => member === null) && { anchor: views.find((_, index) => own[index].member === null)?.anchor }),
		parts: memberParts.map(({ heading, anchor }) => ({ heading, anchor })),
	};
}

/** The types a file exports under one owner, with the import of each public name. */
export function typesView(types: readonly DeclarationType[], owner: string, packageName: string, reasons: ReadonlyMap<string, string> | undefined, context: Context): readonly ApiType[] {
	return types.filter((type) => type.public !== undefined && type.owner === owner).map((type) => ({
		name: type.name,
		anchor: typeAnchor(type.name),
		imports: (type.public ?? []).map(({ entry, name }) => importLine(packageName, entry, name, true)),
		text: type.text,
		segments: segmentsFor(type.text, type.refs, context),
		...(reasons?.has(type.name) && { reason: reasons.get(type.name) }),
	}));
}

export interface PackageExportEntry {
	key: string;
	specifier: string;
	/** Why the entry carries no declarations, for an untyped one. */
	untyped?: string;
	exports: number;
}

export interface PackageExports {
	entries: readonly PackageExportEntry[];
	packageLevel: readonly ApiExport[];
	packageTypes: readonly ApiType[];
	sharedTypes: readonly ApiType[];
}

/**
 * The exports no family page holds: every entry of the package's export map, the values and types of the `package-level`
 * owner, and the types the families share. Their destination is the package exports page.
 */
export function buildPackageExports(reference: { inventory: DeclarationInventory; files: ReadonlyMap<string, DeclarationFile> }, packageName: string): PackageExports {
	const reasons = new Map<string, string>();
	for (const entry of reference.inventory.entries) {
		if ('exports' in entry) for (const item of entry.exports) if (item.reason !== undefined) reasons.set(item.name, item.reason);
	}
	const specifier = (key: string) => (key === '.' ? packageName : `${packageName}${key.slice(1)}`);
	const entries = reference.inventory.entries.map((entry): PackageExportEntry => ({
		key: entry.key,
		specifier: specifier(entry.key),
		...('untyped' in entry && { untyped: entry.reason }),
		exports: 'exports' in entry ? entry.exports.length : 0,
	}));
	const packageFile = reference.files.get('package-level');
	const sharedFile = reference.files.get('shared');
	const context = (file: DeclarationFile | undefined, owner: string): Context => ({ owner, types: new Map((file?.types ?? []).map((type) => [type.id, type])) });
	const packageContext = context(packageFile, 'package-level');
	return {
		entries,
		packageLevel: (packageFile?.exports ?? []).map((item) => ({ ...exportView(item, packageName, [], packageContext, item.name), ...(reasons.has(item.name) && { reason: reasons.get(item.name) }) })),
		packageTypes: typesView(packageFile?.types ?? [], 'package-level', packageName, reasons, packageContext),
		sharedTypes: typesView(sharedFile?.types ?? [], 'shared', packageName, reasons, context(sharedFile, 'shared')),
	};
}
