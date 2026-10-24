import React from 'react';

const h = React.createElement;
const sourceUrl = (path) => `https://github.com/ndrewtran/muxui/blob/main/${path}`;

/**
 * The sections of every component Docs page, in order. Each is an h2 with a
 * stable id. Used in blocks appears only for a component that a Block uses.
 */
const docsSections = Object.freeze([
  ['basic', 'Basic example'],
  ['installation', 'Installation and imports'],
  ['usage', 'Usage'],
  ['behavior', 'Behavior'],
  ['examples', 'Examples'],
  ['used-in-blocks', 'Used in blocks'],
  ['api-reference', 'API reference'],
  ['events', 'Events'],
  ['accessibility', 'Accessibility'],
  ['anatomy-and-styling', 'Anatomy and styling'],
  ['sources', 'Sources'],
]);

/** Headings in Markdown shown below the page's own, each rendered as the given deeper level. */
const demoting = (levels) => Object.fromEntries(Object.entries(levels).map(([from, to]) => [from, ({ children }) => h(to, null, children)]));
/** A guide's own headings sit below the page's sections. */
const headingOverrides = demoting({ h2: 'h4', h3: 'h5', h4: 'h6' });
/** The shared accessibility sections sit under an h3 each, so their own subsections are h4. */
const sectionHeadingOverrides = demoting({ h3: 'h4', h4: 'h5' });

function List({ items, fact }) {
  return h('ul', { 'data-fact': fact }, items.map((item, index) => h('li', { key: index }, item)));
}

function Codes({ items, fact }) {
  return h('p', { 'data-fact': fact, className: 'muxui-docs-codes' }, items.map((item, index) => h('code', { key: index }, item)));
}

function SourceLink({ path, children = path }) {
  return h('a', { href: sourceUrl(path), target: '_blank', rel: 'noreferrer' }, children);
}

/** True when a Storybook manager hosts this frame, so it can open another page. A server render has no frame and assumes one. */
function hasManager() {
  if (typeof window === 'undefined') return true;
  try {
    return window.parent !== window && window.parent.document.getElementById('storybook-preview-iframe')?.contentWindow === window;
  } catch {
    return false;
  }
}

/**
 * The address, in this frame, of a manager page such as `?path=/docs/<id>`. It is built from the current address, so the
 * hosting base path and the globals stay when Docs is served on its own (iframe.html) under a subpath.
 */
function standaloneAddress(managerHref) {
  const [, viewMode, id] = /^\?path=\/(docs|story)\/([^&#]+)/u.exec(managerHref) ?? [];
  if (id === undefined) return managerHref;
  const address = new URL(window.location.href);
  address.searchParams.set('viewMode', viewMode);
  address.searchParams.set('id', id);
  address.searchParams.delete('args');
  return `${address.pathname}${address.search}`;
}

/**
 * A link to another Storybook page, given as its manager address. The manager's Anchor opens the page in the whole
 * Storybook and swallows the click, which does nothing without a manager. Docs served on their own get a real link instead.
 */
function PageLink({ Anchor, href, children, ...props }) {
  return hasManager()
    ? h(Anchor, { href, ...props }, children)
    : h('a', { href: standaloneAddress(href), ...props }, children);
}

/** A literal for a finite value or a default, written as TypeScript does. */
const literal = (value) => typeof value === 'string' ? `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'` : JSON.stringify(value);
const slug = (text) => text.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '').toLowerCase();
const typeAnchor = (id) => `type-${slug(id)}`;
const partLabel = (exported, part) => part.member === null ? exported.name : `${exported.name}.${part.member}`;
const exportAnchor = (exported) => `api-${slug(exported.name)}`;
const partAnchor = (exported, part) => part.member === null ? `${exportAnchor(exported)}-component` : `${exportAnchor(exported)}-${slug(part.member)}`;
const importLine = (exported) => exported.kind === 'type'
  ? `import type { ${exported.name} } from '${exported.specifier}';`
  : `import { ${exported.name} } from '${exported.specifier}';`;
/** A part with more members than this shows only the first behind its heading; the rest open on demand. */
const collapsedFrom = 8;

/** The names a type text shares with the Mux UI types it refers to link to those types' printed declarations. */
function TypeText({ text, refs = [], className }) {
  const links = new Map(refs.map((id) => [id.slice(id.indexOf('#') + 1), id]));
  const pieces = text.split(/('(?:[^'\\]|\\.)*'|[A-Za-z_$][\w$]*)/u).map((piece, index) => links.has(piece)
    ? h('a', { key: index, href: `#${typeAnchor(links.get(piece))}` }, piece)
    : piece);
  return h('code', { className }, pieces);
}

function InlineCodes({ items }) {
  return h('span', { className: 'muxui-docs-codes' }, items.map((item, index) => h('code', { key: index }, item)));
}

/**
 * How an alternative is named in the unified table's "Applies when" column, from its own members alone: the finite
 * values of the member every alternative declares with disjoint literals, else the members it requires and another
 * alternative does not, else `otherwise`. Two alternatives that read alike are numbered.
 */
function alternativeLabels(alternatives) {
  const names = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))];
  const find = (alternative, name) => alternative.members.find((member) => member.name === name);
  const discriminant = names.find((name) => {
    const members = alternatives.map((alternative) => find(alternative, name));
    if (members.some((member) => member === undefined || member.never === true || member.values === undefined)) return false;
    const values = members.flatMap((member) => member.values);
    return new Set(values).size === values.length;
  });
  const required = (alternative, name) => { const member = find(alternative, name); return member !== undefined && member.optional !== true && member.never !== true; };
  const labels = alternatives.map((alternative) => {
    if (discriminant !== undefined) return `${discriminant} = ${find(alternative, discriminant).values.map(literal).join(' | ')}`;
    const own = names.filter((name) => required(alternative, name) && alternatives.some((other) => !required(other, name)));
    return own.length > 0 ? `requires ${own.join(', ')}` : 'otherwise';
  });
  return labels.map((label, index) => labels.indexOf(label) === labels.lastIndexOf(label) ? label : `${label} (${index + 1})`);
}

/**
 * The groups of a part's unified table (layout C): the members every alternative shares first, then one group per
 * alternative, each closing with the members it declares `never` (not allowed) and the members only other
 * alternatives declare (not declared). A part without alternatives is one unlabelled group.
 */
function partGroups(part) {
  const alternatives = part.alternatives ?? [];
  if (alternatives.length === 0) return [{ label: null, members: part.members ?? [], notAllowed: [], notDeclared: [] }];
  const labels = alternativeLabels(alternatives);
  const declared = [...new Set(alternatives.flatMap(({ members }) => members.map(({ name }) => name)))];
  return [
    ...((part.members ?? []).length > 0 ? [{ label: 'Common', common: true, members: part.members, notAllowed: [], notDeclared: [] }] : []),
    ...alternatives.map((alternative, index) => ({
      label: labels[index],
      ref: alternative.ref,
      natives: alternative.natives,
      members: alternative.members.filter(({ never }) => never !== true),
      notAllowed: alternative.members.filter(({ never }) => never === true).map(({ name }) => name),
      notDeclared: declared.filter((name) => !alternative.members.some((member) => member.name === name)),
    })),
  ];
}

/** True when a part declares a member or a ref `never`, so the page explains what that means. */
const usesNever = (part) => [part, ...(part.alternatives ?? [])].some((body) => body.ref?.never === true || (body.members ?? []).some(({ never }) => never === true));

function RefText({ ref: declared }) {
  if (declared === undefined || declared === null) return h('span', { className: 'muxui-docs-none' }, 'none declared');
  if (declared.never === true) return h(React.Fragment, null, 'not allowed, ', h('code', null, declared.required === true ? 'ref: never' : 'ref?: never'));
  return h(TypeText, { text: declared.type, refs: declared.refs });
}

function NativeText({ natives }) {
  if (natives === undefined || natives.length === 0) return h('span', { className: 'muxui-docs-none' }, 'none declared');
  return natives.map((native, index) => h('span', { key: index, className: 'muxui-docs-native' },
    h(TypeText, { text: native.type, refs: native.refs }),
    native.omit?.length > 0 && h(React.Fragment, null, ' except ', h(InlineCodes, { items: native.omit }))));
}

/**
 * The catalog's default for a prop, where it applies to this declaration of it: not to a required member, and not
 * where the member's finite values leave the default out (Virtualizer's `layout` defaults to stack, which its grid
 * alternative does not admit).
 */
function DefaultCell({ member, part, provenance }) {
  const applies = part.defaults !== undefined && Object.hasOwn(part.defaults, member.name)
    && member.optional === true && (member.values === undefined || member.values.includes(part.defaults[member.name]));
  if (!applies) return h('span', { className: 'muxui-docs-none' }, 'none listed');
  return h(React.Fragment, null,
    h('code', null, literal(part.defaults[member.name])),
    provenance === 'authored' && h('span', { className: 'muxui-docs-authored' }, 'authored'));
}

/** One member as a row: its name (and the event channel it reports), what applies, type, requiredness, default and comment. */
function MemberRow({ member, part, provenance, applies }) {
  const expanded = member.values !== undefined && member.values.map(literal).join(' | ') !== member.type;
  return h('tr', { 'data-prop': member.name },
    h('th', { scope: 'row' },
      h('code', { className: 'muxui-docs-name' }, member.name),
      part.events?.[member.name] !== undefined && h('span', { className: 'muxui-docs-event', 'data-event': part.events[member.name] }, `event ${part.events[member.name]}`)),
    applies !== undefined && h('td', { 'data-cell': 'applies', className: applies === null ? 'muxui-docs-always' : undefined }, applies === null ? 'always' : h('code', null, applies)),
    h('td', { 'data-cell': 'type' },
      h(TypeText, { text: member.type, refs: member.refs, className: 'muxui-docs-type' }),
      expanded && h('span', { className: 'muxui-docs-values' }, member.values.map(literal).join(' | '))),
    h('td', { 'data-cell': 'required', className: member.optional === true ? 'muxui-docs-optional' : 'muxui-docs-required' },
      member.optional === true ? 'optional' : 'required',
      member.readonly === true && h('span', { className: 'muxui-docs-flag' }, 'readonly')),
    h('td', { 'data-cell': 'default' }, h(DefaultCell, { member, part, provenance })),
    h('td', { 'data-cell': 'description' }, member.doc));
}

/** A closing row: the names an alternative declares `never`, or does not declare at all. */
function ClosingRow({ names, state, columns }) {
  return h('tr', { className: 'muxui-docs-closing', [`data-${state.replace(' ', '-')}`]: names.join(',') },
    h('td', { colSpan: columns - 3 }, h(InlineCodes, { items: names })),
    h('td', { 'data-cell': 'required', className: 'muxui-docs-absent' }, state),
    h('td'),
    h('td'));
}

function PartTable({ exported, part, provenance }) {
  const groups = partGroups(part);
  const alternatives = (part.alternatives ?? []).length > 0;
  const columns = alternatives ? 6 : 5;
  const head = ['Prop', ...(alternatives ? ['Applies when'] : []), 'Type', 'Required', 'Default', 'Description'];
  return h('table', { className: 'muxui-docs-table', 'data-columns': columns },
    h('caption', { className: 'muxui-docs-visually-hidden' }, `${partLabel(exported, part)} props${alternatives ? ' by alternative' : ''}`),
    h('thead', null, h('tr', null, head.map((title) => h('th', { key: title, scope: 'col' }, title)))),
    groups.map((group, index) => h('tbody', { key: index, 'data-group': group.label ?? 'props' },
      group.label !== null && h('tr', { className: 'muxui-docs-group' },
        h('th', { scope: 'rowgroup', colSpan: columns },
          group.common ? group.label : h('code', null, group.label),
          group.ref !== undefined && h('span', { className: 'muxui-docs-group-ref' }, 'Ref ', h(RefText, { ref: group.ref })),
          group.natives !== undefined && h('span', { className: 'muxui-docs-group-ref' }, 'Native ', h(NativeText, { natives: group.natives })))),
      group.members.map((member) => h(MemberRow, {
        key: member.name, member, part, provenance, applies: alternatives ? (group.common ? null : group.label) : undefined,
      })),
      group.notAllowed.length > 0 && h(ClosingRow, { names: group.notAllowed, state: 'not allowed', columns }),
      group.notDeclared.length > 0 && h(ClosingRow, { names: group.notDeclared, state: 'not declared', columns }))));
}

/** A part: its import, how it is declared, generics, ref and native envelope, then its unified table. */
function PartReference({ exported, part, provenance, heading, collapsible }) {
  const label = partLabel(exported, part);
  const hasAlternativeRef = (part.alternatives ?? []).some((alternative) => alternative.ref !== undefined);
  const hasAlternativeNative = (part.alternatives ?? []).some((alternative) => alternative.natives !== undefined);
  const meta = h('dl', { key: 'meta', className: 'muxui-docs-meta' },
    h('dt', null, 'Import'), h('dd', { 'data-meta': 'import' }, h('code', null, importLine(exported))),
    part.form !== undefined && [h('dt', { key: 'form-title' }, 'Declared as'), h('dd', { key: 'form', 'data-meta': 'form' }, h('code', null, part.form))],
    part.typeParameters !== undefined && [h('dt', { key: 'generics-title' }, 'Generics'), h('dd', { key: 'generics', 'data-meta': 'generics' },
      part.typeParameters.map((parameter, index) => h(React.Fragment, { key: parameter.name },
        index > 0 && ', ',
        h(TypeText, { text: `${parameter.name}${parameter.constraint ? ` extends ${parameter.constraint}` : ''}${parameter.default ? ` = ${parameter.default}` : ''}`, refs: parameter.refs }))))],
    part.sameAs !== undefined && [h('dt', { key: 'same-title' }, 'Same as'), h('dd', { key: 'same', 'data-meta': 'same-as' }, h('code', null, `${exported.name}.${part.sameAs}`))],
    (part.ref !== undefined || !hasAlternativeRef) && [h('dt', { key: 'ref-title' }, 'Ref'), h('dd', { key: 'ref', 'data-meta': 'ref' }, h(RefText, { ref: part.ref }))],
    (part.natives !== undefined || !hasAlternativeNative) && [h('dt', { key: 'native-title' }, 'Native'), h('dd', { key: 'native', 'data-meta': 'native' }, h(NativeText, { natives: part.natives }))]);
  const body = [meta, part.sameAs === undefined && h(PartTable, { key: 'table', exported, part, provenance })];
  const count = new Set([...(part.members ?? []), ...(part.alternatives ?? []).flatMap(({ members }) => members)].map(({ name }) => name)).size;
  const title = h('h4', { 'data-part-title': true }, h('code', null, label));
  const props = { id: partAnchor(exported, part), className: 'muxui-docs-part', 'data-part': label };
  if (collapsible) {
    return h('details', props, h('summary', null, title, h('span', { className: 'muxui-docs-count' }, `${count} ${count === 1 ? 'prop' : 'props'}`)), body);
  }
  return h('div', props, heading && title, body);
}

/** A component export: each of its parts, behind its own heading when it has more than one. */
function ComponentReference({ exported, provenance }) {
  const collapsible = exported.parts.length > collapsedFrom;
  return h('div', { id: exportAnchor(exported), className: 'muxui-docs-export', 'data-export': exported.name },
    h('h3', null, h('code', null, exported.name), !exported.primary && h('span', { className: 'muxui-docs-count' }, 'related export')),
    exported.parts.map((part, index) => h(PartReference, {
      key: part.member ?? '', exported, part, provenance, heading: exported.parts.length > 1, collapsible: collapsible && index > 0,
    })));
}

function ValueReference({ exported }) {
  return h('div', { id: exportAnchor(exported), className: 'muxui-docs-export', 'data-export': exported.name },
    h('h4', null, h('code', null, exported.name), h('span', { className: 'muxui-docs-count' }, exported.kind === 'function' ? 'function' : 'value')),
    h('dl', { className: 'muxui-docs-meta' },
      h('dt', null, 'Import'), h('dd', { 'data-meta': 'import' }, h('code', null, importLine(exported))),
      h('dt', null, exported.kind === 'function' ? 'Signature' : 'Type'),
      h('dd', { 'data-meta': exported.kind === 'function' ? 'signature' : 'type' }, h(TypeText, { text: exported.kind === 'function' ? exported.signature : exported.type, refs: exported.refs ?? [] }))),
    exported.doc !== undefined && h('p', { 'data-fact': 'typed.doc' }, exported.doc));
}

/** Every part and related export with the exact import that reaches it. */
function ExportsIndex({ typed }) {
  const rows = typed.exports.flatMap((exported) => [
    h('tr', { key: exported.name, 'data-export': exported.name, 'data-kind': exported.kind },
      h('th', { scope: 'row' }, h('a', { href: `#${exported.kind === 'type' ? typeAnchor(exported.id) : exportAnchor(exported)}` }, h('code', null, exported.name))),
      h('td', null, exported.kind),
      h('td', null, h('code', null, importLine(exported)), exported.reason !== undefined && h('span', { className: 'muxui-docs-reason' }, exported.reason))),
    ...(exported.kind === 'component' ? exported.parts.filter(({ member }) => member !== null).map((part) => h('tr', { key: `${exported.name}.${part.member}`, 'data-part': `${exported.name}.${part.member}` },
      h('th', { scope: 'row', className: 'muxui-docs-indent' }, h('a', { href: `#${partAnchor(exported, part)}` }, h('code', null, `${exported.name}.${part.member}`))),
      h('td', null, 'part'),
      h('td', null, h('code', null, importLine(exported))))) : []),
  ]);
  return h('table', { className: 'muxui-docs-table muxui-docs-exports', 'data-columns': 3 },
    h('caption', { className: 'muxui-docs-visually-hidden' }, 'Parts and related exports'),
    h('thead', null, h('tr', null, ['Export', 'Kind', 'Import'].map((title) => h('th', { key: title, scope: 'col' }, title)))),
    h('tbody', null, rows));
}

/** Opens the collapsed part or type that an id names, and what contains it, so following a link shows what it points to. */
function reveal(id) {
  for (let node = document.getElementById(id)?.closest('details'); node; node = node.parentElement?.closest('details')) node.open = true;
}

function TypeDeclaration({ type }) {
  return h('details', { id: typeAnchor(type.id), className: 'muxui-docs-type-declaration', 'data-type': type.name },
    h('summary', null, h('code', null, type.name), h('span', { className: 'muxui-docs-count' }, type.public === undefined ? 'not exported' : 'exported')),
    (type.public ?? []).map((where) => h('p', { key: `${where.entry}:${where.name}`, className: 'muxui-docs-import' }, h('code', null, importLine({ kind: 'type', name: where.name, specifier: where.specifier })))),
    h('pre', null, h('code', null, type.text)));
}

/**
 * The family's typed reference (Decision 0031), laid out from `entry.typed`: its parts and related exports, each
 * component part as a unified table, the functions and values, and the types they name.
 */
function TypedReference({ typed }) {
  const hasNever = typed.exports.some((exported) => exported.kind === 'component' && exported.parts.some(usesNever));
  const components = typed.exports.filter(({ kind }) => kind === 'component');
  const others = typed.exports.filter(({ kind }) => kind === 'function' || kind === 'value');
  React.useEffect(() => reveal(decodeURIComponent(window.location.hash.slice(1))), []);
  const follow = (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (link) reveal(decodeURIComponent(link.hash.slice(1)));
  };
  return h('div', { className: 'muxui-docs-reference', 'data-typed-reference': typed.owner, onClick: follow },
    h('p', { className: 'muxui-docs-caption', 'data-fact': 'typed.provenance' },
      'Types, requiredness, refs and comments come from the declarations the package ships. Defaults come from the catalog: ',
      typed.provenance === 'authored' ? 'this family\'s are authored by hand, so each is marked authored. ' : 'each is the default its source executes. ',
      'none listed means the catalog lists no default for the prop; a native or layout default may still apply.'),
    hasNever && h('p', { className: 'muxui-docs-caption', 'data-fact': 'typed.never' },
      'not allowed marks a prop an alternative declares as never; not declared marks one it does not declare at all. With exactOptionalPropertyTypes, ',
      h('code', null, '?: never'), ' rejects an explicit ', h('code', null, 'undefined'), '; without it TypeScript accepts one.'),
    h('h3', { id: 'api-exports' }, 'Parts and related exports'),
    h(ExportsIndex, { typed }),
    h('p', { className: 'muxui-docs-caption', 'data-fact': 'typed.package' },
      'The package-level exports (the compatibility record, the supplemental family list and the theme presets) and the types several families share are listed, with their imports, in ',
      h(SourceLink, { path: typed.packageSources[0] }, typed.packageSources[0].slice(typed.packageSources[0].lastIndexOf('/') + 1)), ' and ',
      h(SourceLink, { path: typed.packageSources[1] }, typed.packageSources[1].slice(typed.packageSources[1].lastIndexOf('/') + 1)),
      '. The shared types this family names are printed under Types.'),
    components.map((exported) => h(ComponentReference, { key: exported.name, exported, provenance: typed.provenance })),
    typed.unplacedDefaults !== undefined && h('p', { className: 'muxui-docs-caption', 'data-fact': 'typed.unplaced' },
      'The catalog lists these defaults without naming the part that has them: ',
      typed.unplacedDefaults.map(({ name, value }, index) => h(React.Fragment, { key: name }, index > 0 && ', ', h('code', null, `${name} = ${literal(value)}`))), '.'),
    others.length > 0 && h('h3', { id: 'api-functions' }, 'Functions and values'),
    others.map((exported) => h(ValueReference, { key: exported.name, exported })),
    typed.types.length > 0 && h('h3', { id: 'api-types' }, 'Types'),
    typed.types.map((type) => h(TypeDeclaration, { key: type.id, type })));
}

/** The catalog facts of a family, laid out as the continuous reference. Everything it shows comes from `entry`. */
export function ComponentDocs({ entry, blocks }) {
  const { Title, Primary, Controls, Source, Markdown, Anchor } = blocks;
  const [basic, ...others] = entry.examples;
  const { usage, accessibility, accessibilityGuide, styling } = entry;
  const partEvents = entry.parts.filter(({ events }) => events.length > 0);
  // A link to another family, written as its docs path, goes to that family's Docs page. Other links stay as written.
  const guideLink = ({ href, children, ...props }) => entry.guide.links[href] === undefined
    ? h('a', { href, ...props }, children)
    : h(PageLink, { Anchor, href: entry.guide.links[href], ...props }, children);

  // A link in the shared accessibility text to a docs site route opens the file that owns what the route shows.
  const sharedLink = ({ href, children, ...props }) => accessibilityGuide.links[href] === undefined
    ? h('a', { href, ...props }, children)
    : h('a', { ...props, href: sourceUrl(accessibilityGuide.links[href]), target: '_blank', rel: 'noreferrer' }, children);

  const bodies = {
    basic: () => [
      h(Primary, { key: 'primary' }),
      h('p', { key: 'label', className: 'muxui-docs-caption' }, 'Canonical React example, static source: ', h(SourceLink, { path: basic.source }, basic.name)),
      h(Source, { key: 'source', code: basic.code, language: 'tsx' }),
    ],
    installation: () => [
      h('p', { key: 'guidance' }, 'Package versions and installation steps: ', h(SourceLink, { path: entry.installationGuide }, 'React package guidance')),
      h(Source, { key: 'imports', code: entry.imports.code, language: 'tsx' }),
    ],
    usage: () => [
      usage.useWhen.length > 0 && h(React.Fragment, { key: 'use' }, h('h3', null, 'Use when'), h(List, { items: usage.useWhen, fact: 'intent.useWhen' })),
      usage.avoidWhen.length > 0 && h(React.Fragment, { key: 'avoid' }, h('h3', null, 'Avoid when'), h(List, { items: usage.avoidWhen, fact: 'intent.avoidWhen' })),
      usage.useWhen.length === 0 && usage.avoidWhen.length === 0 && entry.guide === null
        && h('p', { key: 'none' }, 'No usage guidance is declared for this component.'),
      entry.guide && h('div', { key: 'guide', className: 'muxui-docs-guide', 'data-guide-id': entry.guide.id },
        h('h3', null, 'Related usage guidance'),
        h('p', { className: 'muxui-docs-caption' }, `${entry.guide.name}: `, h(SourceLink, { path: entry.guide.source })),
        h(Markdown, { options: { overrides: { ...headingOverrides, a: guideLink } } }, entry.guide.markdown)),
    ],
    behavior: () => entry.behavior.length > 0
      ? h(List, { items: entry.behavior, fact: 'binding.behavior' })
      : h('p', null, 'This binding does not declare behavior notes.'),
    examples: () => others.length > 0
      ? others.map((example) => h('div', { key: example.source, className: 'muxui-docs-example' },
        h('h3', null, example.name),
        h('p', null, example.summary),
        h(Source, { code: example.code, language: 'tsx' }),
        h('p', { className: 'muxui-docs-caption' }, 'Canonical React example, static source: ', h(SourceLink, { path: example.source }))))
      : h('p', null, 'No additional named examples are declared for this component yet.'),
    'used-in-blocks': () => h('ul', null, entry.usedIn.map(({ name, storyId, roles }) => h('li', { key: storyId },
      h(PageLink, { Anchor, href: `?path=/story/${storyId}` }, name),
      h('span', { className: 'muxui-docs-roles' }, roles.map(({ role, requirement }) => requirement === 'optional' ? `${role} (optional)` : role).join(', '))))),
    // The typed reference lists every part as its declarations wrote it. Controls follows it as the live editor of the props the stories drive.
    'api-reference': () => [
      h(TypedReference, { key: 'typed', typed: entry.typed }),
      h('h3', { key: 'controls-title', id: 'api-controls' }, 'Controls'),
      h(Controls, { key: 'controls' }),
    ],
    // The root's events, then each part's under its owner, so Item events read as ListBox.Item's.
    events: () => [
      entry.events.length > 0
        ? h(Codes, { key: 'root', items: entry.events, fact: 'binding.api.events' })
        : h('p', { key: 'root', 'data-fact': 'binding.api.events' }, partEvents.length > 0 ? 'The root declares no events.' : 'This binding does not declare events.'),
      ...partEvents.map(({ part, owner, events }) => h(React.Fragment, { key: part },
        h('h3', null, h('code', null, owner)),
        h(Codes, { items: events, fact: `binding.api.partApis.${part}.events` }))),
    ],
    accessibility: () => [
      h('p', { key: 'name', 'data-fact': 'accessibility.nameRequired' }, `Accessible name required: ${accessibility.nameRequired ? 'yes' : 'no'}`),
      h('h3', { key: 'obligations-title' }, 'Obligations'),
      h(List, { key: 'obligations', items: accessibility.obligations, fact: 'accessibility.obligations' }),
      accessibility.binding.length > 0 && h(React.Fragment, { key: 'binding' }, h('h3', null, 'React binding'), h(List, { items: accessibility.binding, fact: 'binding.accessibility' })),
      // The obligations above are this family's. What is claimed, proved and left to the consumer is the shared guide's, cut from it.
      h('div', { key: 'shared', className: 'muxui-docs-guide', 'data-shared-guide': accessibilityGuide.id },
        accessibilityGuide.sections.map(({ heading, markdown }) => h(React.Fragment, { key: heading }, h('h3', null, heading),
          h(Markdown, { options: { overrides: { ...sectionHeadingOverrides, a: sharedLink } } }, markdown))),
        h('p', { className: 'muxui-docs-caption' }, 'Full guide: ', h(SourceLink, { path: accessibilityGuide.source }))),
    ],
    'anatomy-and-styling': () => [
      h('h3', { key: 'anatomy-title' }, 'Anatomy'),
      h(Codes, { key: 'anatomy', items: styling.anatomy, fact: 'anatomy' }),
      h('h3', { key: 'states-title' }, 'States'),
      h(Codes, { key: 'states', items: styling.states, fact: 'states' }),
      h('h3', { key: 'tokens-title' }, 'Token requirements'),
      h('p', { key: 'source', 'data-fact': 'tokenRecipe.source' }, 'Token source: ', h('code', null, styling.tokenSource)),
      ...styling.tokenGroups.map((group) => h(React.Fragment, { key: group.prefix ?? 'tokens' },
        group.prefix && h('h4', { className: 'muxui-docs-token-group' }, group.prefix),
        h('ul', { className: 'muxui-docs-tokens', 'data-fact': 'tokenRecipe.requirements' }, group.tokens.map(({ token, requirement, profiles }) => h('li', { key: token },
          h('code', null, token),
          requirement !== 'required' && h('span', { className: 'muxui-docs-token-requirement' }, [requirement, ...(profiles ?? [])].join(', '))))))),
    ],
    sources: () => h('dl', { className: 'muxui-docs-sources' }, entry.sources.map(({ label, paths }) => h(React.Fragment, { key: label },
      h('dt', null, label),
      paths.map((path) => h('dd', { key: path }, h(SourceLink, { path })))))),
  };

  return h(React.Fragment, null,
    h(Title),
    h('p', { className: 'muxui-docs-summary' }, entry.summary),
    h('p', { className: 'muxui-docs-binding' }, h('code', null, 'web.react'), ` binding. Lifecycle: ${entry.lifecycle}. Import: `, h('code', null, entry.imports.specifier)),
    docsSections
      .filter(([id]) => id !== 'used-in-blocks' || entry.usedIn.length > 0)
      .map(([id, title]) => h('section', { key: id, id, className: 'muxui-docs-section', 'aria-labelledby': `${id}-title` },
        h('h2', { id: `${id}-title` }, title),
        bodies[id]())));
}
