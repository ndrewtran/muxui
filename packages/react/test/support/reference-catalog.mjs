// Checks the committed declaration reference against the catalog's web.react API (Decision 0031).
//
// The two sources divide the work: the declarations supply type, requiredness, ref, comment and the exact
// callback signature; the catalog supplies defaults, enums, event channels and provenance. So the check is not
// "no disagreement": every catalog prop and event of a derived family is looked up in the part that owns it, in
// every alternative that part declares, and each difference that remains is classified and verified here.
// An unexplained difference is a `problem`; an explained one is returned in `differences` for the test to pin.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mergeDerivedApis } from '@muxui/schema';
import { DERIVED_API_COMPONENTS } from '../../api-extraction/derived-apis.mjs';
import { printCallSignature, printType } from '../../reference-reader/printer.mjs';

export const repositoryRoot = resolve(import.meta.dirname, '../../../..');
export const referenceDirectory = join(repositoryRoot, 'packages/react/reference');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** The committed reference: the inventory and every owner's file, by file name. */
export function loadReference(directory = referenceDirectory) {
  const files = new Map(readdirSync(directory).sort().map((name) => [name, readJson(join(directory, name))]));
  const inventory = files.get('inventory.json');
  files.delete('inventory.json');
  return { inventory, files };
}

/** The catalog's web.react API of a family: the authored one, with its derived API merged in when it has one. */
export function catalogApi(slug) {
  const artifact = readJson(join(repositoryRoot, `catalog/components/${slug}/artifact.json`));
  const derived = join(repositoryRoot, `packages/react/api/${slug}.json`);
  const merged = readdirSync(join(repositoryRoot, 'packages/react/api')).includes(`${slug}.json`)
    ? mergeDerivedApis(artifact, { 'web.react': readJson(derived) })
    : artifact;
  return merged.bindings['web.react'].api;
}

/** A catalog type (its closed grammar) as the graph's type tree, so the reader's printer writes it. */
function treeOf(type) {
  const signatureOf = (fn) => ({
    parameters: fn.parameters.map((parameter) => ({ name: parameter.name, type: treeOf(parameter.type), ...(parameter.required === false && { optional: true }), ...(parameter.rest && { rest: true }) })),
    returnType: treeOf(fn.returns),
  });
  switch (type.kind) {
    case 'string': case 'number': case 'boolean': case 'void': case 'undefined': case 'never': case 'unknown': return { kind: 'keyword', name: type.kind };
    case 'null': return { kind: 'literal', value: null };
    case 'literal': return { kind: 'literal', value: type.value };
    case 'reference': return { kind: 'reference', id: type.name, name: type.name };
    case 'host': return { kind: 'host', name: type.name, typeArguments: type.typeArguments?.map(treeOf) };
    case 'union': return { kind: 'union', members: type.members.map(treeOf) };
    case 'array': {
      const array = { kind: 'array', element: treeOf(type.element) };
      return type.readonly ? { kind: 'readonly', type: array } : array;
    }
    // A tuple is its required prefix, then at most one rest array: [A, ...B[]] is elements [A] and rest B.
    case 'tuple': return {
      kind: 'tuple',
      elements: [
        ...type.elements.map((element) => ({ type: treeOf(element) })),
        ...(type.rest === undefined ? [] : [{ type: { kind: 'array', element: treeOf(type.rest) }, rest: true }]),
      ],
    };
    case 'function': return { kind: 'function', ...signatureOf(type) };
    case 'object': return {
      kind: 'object',
      members: type.members.map((member) => (member.method
        // A method keeps method syntax (its parameters are bivariant), which a function property does not.
        ? { member: 'method', name: member.name, optional: member.required === false, ...signatureOf(member.type) }
        : { member: 'property', name: member.name, optional: member.required === false, readonly: Boolean(member.readonly), type: treeOf(member.type) })),
    };
    case 'record': return { kind: 'object', members: [{ member: 'index', parameter: { name: 'key', type: { kind: 'keyword', name: 'string' } }, readonly: Boolean(type.readonly), type: treeOf(type.value) }] };
    default: throw new Error(`the catalog type grammar has a kind this check does not read: ${type.kind}`);
  }
}
export const catalogTypeText = (type) => printType(treeOf(type));
/** A named type's member as the model prints it: a method as its call signature, any other member as its type. */
const catalogMemberType = (member) => (member.method ? printCallSignature(treeOf(member.type)) : catalogTypeText(member.type));

/** The layout of a printed declaration, so a type compares by what it says: one line, no trailing member `;`, one index-signature name. */
const normalized = (text) => text
  .replace(/\s+/gu, ' ')
  .replace(/;\s*\}/gu, ' }')
  .replace(/\s+\}/gu, ' }')
  .replace(/\[\w+: (string|number)\]/gu, '[key: $1]')
  .trim();

/** The member texts of a type literal, with the bases an interface extends listed first. */
function flattenedMembers(entry, byId, trail = []) {
  const bases = (entry.extends ?? []).flatMap((base) => {
    const [id, ...more] = base.refs ?? [];
    const target = byId.get(id);
    if (more.length > 0 || target === undefined || base.type !== target.name || target.typeParameters) return null;
    if (trail.includes(id)) return null;
    return flattenedMembers(target, byId, [...trail, id]) ?? [null];
  });
  if (bases.includes(null)) return null;
  const own = (entry.members ?? []).map((member) => ({ name: member.name, text: `${member.readonly ? 'readonly ' : ''}${member.name}${member.optional ? '?' : ''}: ${member.type}` }));
  const merged = new Map([...bases, ...own].map((member) => [member.name, member]));
  return [...merged.values()];
}

/** The owner part of a derived family's root, from the entry in DERIVED_API_COMPONENTS. */
function targetsOf(component, api, file) {
  const entry = file.exports.find(({ name }) => name === component.name);
  if (entry?.kind !== 'component') return { problems: [`${component.slug}: the model has no component export ${component.name}`], targets: [] };
  const problems = [];
  const find = (member, label) => {
    const part = entry.parts.find((candidate) => (candidate.member ?? null) === member);
    if (part === undefined) problems.push(`${label}: the model has no part ${component.name}.${member ?? '(callable)'}`);
    return part;
  };
  const targets = [{ label: component.slug, api, part: find(component.part ?? null, component.slug) }];
  for (const [anatomy, partApi] of Object.entries(api.partApis ?? {})) {
    targets.push({ label: `${component.slug}.${anatomy}`, api: partApi, part: find(partApi.member, `${component.slug}.${anatomy}`) });
  }
  for (const also of component.also ?? []) {
    const part = find(also.member, `${component.slug}+${also.member}`);
    // The widened prop is declared by the other member as well, which is what `also` promises.
    for (const prop of also.widen ?? []) {
      if (part !== undefined && !armsOf(part).some((arm) => arm.has(prop))) problems.push(`${component.slug}+${also.member}.${prop}: declared by no alternative`);
    }
  }
  return { problems, targets: targets.filter(({ part }) => part !== undefined) };
}

/** A part's alternatives as one map of members each (the shared members, then the alternative's own). */
export function armsOf(part) {
  const shared = part.members ?? [];
  const arms = part.alternatives ?? [{ members: [] }];
  return arms.map((arm) => new Map([...shared, ...arm.members].map((member) => [member.name, member])));
}

/** The catalog comment on `prop` is the comment of a same-named member of one of the file's OwnProps types. */
const ownPropsDocOf = (file, prop, description) => file.types.some((type) => type.name.endsWith('OwnProps')
  && type.members?.some((member) => member.name === prop && member.doc === description));

/**
 * Checks every catalog prop, event and named type of the derived families against the model.
 * @returns {{ counts: Record<string, number>, differences: string[], problems: string[] }}
 */
export function crossCheckDerived({ files, components = DERIVED_API_COMPONENTS }) {
  const counts = { families: 0, parts: 0, props: 0, events: 0, types: 0, references: 0 };
  const differences = [];
  const problems = [];
  const explain = (kind, key) => differences.push(`${kind} ${key}`);

  for (const component of components) {
    const api = catalogApi(component.slug);
    const file = files.get(`${component.slug}.json`);
    if (file === undefined) { problems.push(`${component.slug}: the model has no file`); continue; }
    counts.families += 1;
    const byId = new Map(file.types.map((type) => [type.id, type]));
    const byName = new Map(file.types.map((type) => [type.name, type]));
    const { problems: ownerProblems, targets } = targetsOf(component, api, file);
    problems.push(...ownerProblems);
    const namedTypes = new Map();

    for (const { label, api: part, part: model } of targets) {
      counts.parts += 1;
      const arms = armsOf(model);
      const everyMember = (name) => arms.map((arm) => arm.get(name));

      for (const prop of part.props) {
        counts.props += 1;
        const key = `${label}.${prop}`;
        const detail = part.propDetails[prop];
        const declared = everyMember(prop);
        if (declared.every((member) => member === undefined)) { problems.push(`${key}: no alternative of ${model.member ?? 'the callable'} declares it`); continue; }
        const live = declared.filter((member) => member !== undefined && !member.never);

        // Requiredness: required only if every alternative declares it, without `?`.
        const required = declared.every((member) => member !== undefined && !member.optional);
        if (required !== detail.required) problems.push(`${key}: catalog required ${detail.required}, declared ${required}`);

        // Enum: the finite values of the live alternatives.
        if (detail.enum) {
          const values = [...new Set(live.flatMap((member) => member.values ?? []))];
          if (live.some((member) => member.values === undefined) || values.length !== detail.enum.length || !detail.enum.every((value) => values.includes(value))) {
            problems.push(`${key}: catalog enum [${detail.enum}], declared [${values}]`);
          }
        }

        // Type: the live alternatives declare the catalog's type, or one finite domain that equals its enum.
        const catalogText = catalogTypeText(detail.type);
        const declaredTexts = [...new Set(live.map((member) => member.type))];
        if (!(declaredTexts.length === 1 && declaredTexts[0] === catalogText) && !(detail.enum && live.every((member) => member.values))) {
          if (declaredTexts.length === 1 && catalogText.replace(/\bNumberFormatOptions\b/u, 'Intl.NumberFormatOptions') === declaredTexts[0] && detail.type.kind === 'host') explain('lib-namespace', key);
          else problems.push(`${key}: catalog type ${catalogText}, declared ${declaredTexts.join(' || ')}`);
        }

        // Comment: the live alternatives carry the catalog's description, or the OwnProps member does.
        const liveDocs = [...new Set(live.map((member) => member.doc))];
        if (!(liveDocs.length === 1 && liveDocs[0] === detail.description)) {
          // The arm re-declares the member without its comment (`own-props-comment`), or with one of its own
          // (`arm-comment`); either way the catalog carries the comment of the OwnProps member.
          if (detail.description !== undefined && ownPropsDocOf(file, prop, detail.description)) explain(liveDocs.every((doc) => doc === undefined) ? 'own-props-comment' : 'arm-comment', key);
          else problems.push(`${key}: catalog description ${JSON.stringify(detail.description)}, declared ${JSON.stringify(liveDocs)}`);
        }
      }

      for (const [channel, event] of Object.entries(part.eventDetails ?? {})) {
        counts.events += 1;
        const key = `${label}.${channel}`;
        const members = everyMember(event.prop).filter((member) => member !== undefined && !member.never);
        if (members.length === 0) { problems.push(`${key}: no alternative declares ${event.prop}`); continue; }
        if (members.some((member) => Boolean(member.optional) === event.required)) problems.push(`${key}: catalog required ${event.required}, declared ${members.map((member) => !member.optional)}`);
        const catalogText = catalogTypeText(event.type);
        const texts = [...new Set(members.map((member) => member.type))];
        if (!(texts.length === 1 && texts[0] === catalogText)) {
          // React's UIEventHandler<E> is the alias of (event: UIEvent<E>) => void; the compiler probes assert it.
          const alias = /^\(event: React\.UIEvent<(\w+)>\) => void$/u.exec(catalogText);
          if (alias && texts.length === 1 && texts[0] === `React.UIEventHandler<${alias[1]}>`) explain('event-alias', key);
          else problems.push(`${key}: catalog event type ${catalogText}, declared ${texts.join(' || ')}`);
        }
        if (members.some((member) => member.doc !== event.description)) problems.push(`${key}: catalog description differs from the declared comment`);
      }

      for (const [name, definition] of Object.entries(part.types ?? {})) namedTypes.set(name, definition);
    }

    // Named types: each one the catalog defines (the payloads of events and the props' types) is a type the model prints.
    for (const [name, definition] of namedTypes) {
      counts.types += 1;
      const key = `${component.slug}.${name}`;
      const entry = byName.get(name);
      if (entry === undefined) { problems.push(`${key}: not in the model`); continue; }
      if (definition.type.kind === 'object') {
        const catalogMembers = definition.type.members.map((member) => `${member.readonly ? 'readonly ' : ''}${member.name}${member.required === false ? '?' : ''}: ${catalogMemberType(member)}`);
        const own = (entry.members ?? []).map((member) => `${member.readonly ? 'readonly ' : ''}${member.name}${member.optional ? '?' : ''}: ${member.type}`);
        if (JSON.stringify(catalogMembers) === JSON.stringify(own)) continue;
        const flattened = flattenedMembers(entry, byId)?.map(({ text }) => text);
        if (flattened && JSON.stringify(catalogMembers) === JSON.stringify(flattened)) explain('flattened-bases', key);
        else problems.push(`${key}: catalog members ${catalogMembers.join('; ')} vs declared ${(flattened ?? own).join('; ')}`);
      } else {
        const body = entry.text.replace(/^(?:export )?type [^=]*= /u, '').replace(/;$/u, '');
        const catalogText = catalogTypeText(definition.type);
        if (catalogText === body) continue;
        if (normalized(catalogText) === normalized(body)) explain('type-layout', key);
        else problems.push(`${key}: catalog ${catalogText} vs declared ${body}`);
      }
    }

    // Every name a catalog type mentions resolves to a catalog type or a type the model prints, so no payload is left undefined.
    const mentioned = new Set();
    const collect = (node) => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(collect); return; }
      if (node.kind === 'reference') mentioned.add(node.name);
      Object.values(node).forEach(collect);
    };
    collect(api);
    for (const name of mentioned) {
      counts.references += 1;
      if (!byName.has(name)) problems.push(`${component.slug}: the catalog names ${name}, which the model does not print`);
    }
  }
  return { counts, differences: differences.sort(), problems };
}

/**
 * The owner of each catalog prop of the authored families, which the catalog lists without types. A prop is owned
 * by the one part that declares it; the others are entered in `table`, with how the declarations carry them:
 *   - `parts`: several parts declare it, and the catalog lists the name once for the family;
 *   - `native`: no part declares it, and the part's native attribute envelope carries it;
 *   - `hook`: the options or result of a hook export declare it.
 * `unlistedEvents` names the channels whose `on` handler the catalog does not list among the props.
 * @param {{ files: Map<string, any>, table: Record<string, any>, authored: string[], unlistedEvents: Set<string> }} options
 */
export function crossCheckAuthored({ files, table, authored, unlistedEvents }) {
  const counts = { families: 0, props: 0, unique: 0, listed: 0, events: 0 };
  const problems = [];
  const used = new Set();
  const seenEvents = new Set();
  for (const slug of authored) {
    const api = catalogApi(slug);
    const file = files.get(`${slug}.json`);
    counts.families += 1;
    const components = file.exports.filter((entry) => entry.kind === 'component');
    const parts = components.flatMap((entry) => entry.parts.filter((part) => part.form !== undefined).map((part) => ({ export: entry.name, part, label: part.member ?? entry.name })));
    const declares = (part, prop) => armsOf(part).some((arm) => arm.has(prop));
    for (const prop of api.props) {
      counts.props += 1;
      const key = `${slug}.${prop}`;
      const owners = parts.filter(({ part }) => declares(part, prop)).map(({ label }) => label);
      const listed = table[key];
      if (listed === undefined) {
        if (owners.length === 1) counts.unique += 1;
        else problems.push(`${key}: ${owners.length === 0 ? 'no part declares it' : `declared by ${owners.join(', ')}`} and the table does not say why`);
        continue;
      }
      used.add(key);
      counts.listed += 1;
      if (listed.parts) {
        if (JSON.stringify(owners) !== JSON.stringify(listed.parts)) problems.push(`${key}: declared by ${owners.join(', ')}, the table says ${listed.parts.join(', ')}`);
      } else if (listed.native) {
        const owner = parts.find(({ label }) => label === listed.native);
        const natives = owner?.part.natives ?? [];
        if (owners.length > 0) problems.push(`${key}: the table says native, but ${owners.join(', ')} declares it`);
        else if (!natives.some((native) => /^React\.\w*HTMLAttributes</u.test(native.type) && !(native.omit ?? []).includes(prop))) problems.push(`${key}: ${listed.native} has no native attribute envelope that carries it`);
      } else if (listed.hook) {
        const hook = file.exports.find(({ name, kind }) => name === listed.hook && kind === 'function');
        const type = file.types.find(({ name }) => name === listed.type);
        if (hook === undefined || type === undefined || !type.members?.some((member) => member.name === prop)) problems.push(`${key}: ${listed.hook} (${listed.type}) does not declare it`);
        else if (!(hook.parameters.some((parameter) => parameter.refs?.includes(type.id)) || hook.returns.refs?.includes(type.id))) problems.push(`${key}: ${listed.hook} does not use ${listed.type}`);
      }
    }
    // Each event channel is the `on` handler a part (or a hook) declares; the props normally list it too.
    for (const channel of api.events) {
      counts.events += 1;
      const handler = `on${channel[0].toUpperCase()}${channel.slice(1)}`;
      const key = `${slug}.${channel}`;
      if (!parts.some(({ part }) => declares(part, handler)) && table[`${slug}.${handler}`] === undefined) problems.push(`${key}: no part or hook declares ${handler}`);
      seenEvents.add(key);
      if (api.props.includes(handler) === unlistedEvents.has(key)) problems.push(`${key}: the props ${api.props.includes(handler) ? 'list' : 'do not list'} ${handler}, ${unlistedEvents.has(key) ? 'against' : 'and nothing explains it'}`);
    }
  }
  for (const key of Object.keys(table)) if (!used.has(key)) problems.push(`${key}: the table lists a prop the catalog no longer has`);
  for (const key of unlistedEvents) if (!seenEvents.has(key)) problems.push(`${key}: listed as an unlisted event the catalog no longer has`);
  return { counts, problems };
}
