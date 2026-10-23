/**
 * Pass 2c: the model. From the declaration graph and the owner of every public export, builds what the
 * applications read: one self-contained file per owner (a family, or `shared` and `package-level`) holding
 * its exports with their parts, and every Mux UI type those reach, printed as the declaration wrote it; and
 * an inventory of every entry of the package's export map.
 *
 * Types are stored as printed text plus the ids they reference, so a reader displays and links them and
 * never re-reads meaning from a type string. Structure is stored where meaning lives in it: the
 * alternatives of a props type, whether a member is optional, readonly, a method or declared `never`, and
 * the finite values of a literal union. Comments are the declarations' own member comments, absent when
 * absent.
 */
import { ReferenceReadError } from './errors.mjs';
import { createComponentReader, modelMember } from './components.mjs';
import { valuesOf } from './expand.mjs';
import { assignOwners } from './ownership.mjs';
import { printCallSignature, printDeclaration, printType, printValueDeclaration, referencedIds } from './printer.mjs';

export const REFERENCE_SCHEMA = 'muxui-declaration-reference-v1';
export const INVENTORY_SCHEMA = 'muxui-declaration-inventory-v1';

/** Export-map entries that carry no declarations, and why the inventory still lists them. */
export const UNTYPED_ENTRIES = Object.freeze({
  './compatibility': 'a JavaScript module the package ships without declarations',
  './styles.css': 'a stylesheet',
  './themes.css': 'a stylesheet',
  './testing': 'a JavaScript module the package ships without declarations',
});

const byName = (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

function modelTypeParameters(typeParameters) {
  return typeParameters?.map((parameter) => {
    const refs = [...referencedIds([parameter.constraint, parameter.default].filter(Boolean))];
    return {
      name: parameter.name,
      ...(parameter.constraint && { constraint: printType(parameter.constraint) }),
      ...(parameter.default && { default: printType(parameter.default) }),
      ...(refs.length > 0 && { refs }),
    };
  });
}

function modelFunction(declaration) {
  const parameters = declaration.parameters.map((parameter) => {
    const refs = [...referencedIds(parameter.type)];
    return {
      name: parameter.name,
      ...(parameter.optional && { optional: true }),
      ...(parameter.rest && { rest: true }),
      type: printType(parameter.type),
      ...(refs.length > 0 && { refs }),
    };
  });
  const returnRefs = [...referencedIds(declaration.returnType)];
  const typeParameters = modelTypeParameters(declaration.typeParameters);
  return {
    signature: `${declaration.name}${printCallSignature(declaration)}`,
    ...(typeParameters && { typeParameters }),
    parameters,
    returns: {
      type: printType(declaration.returnType),
      ...(declaration.returnType.kind === 'predicate' && { predicate: true }),
      ...(returnRefs.length > 0 && { refs: returnRefs }),
    },
  };
}

/** Every `refs` array in a model item, which is how the closure of reachable types finds its next ids. */
function collectRefs(node, found = new Set()) {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
    return found;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'refs') value.forEach((id) => found.add(id));
    else collectRefs(value, found);
  }
  return found;
}

/**
 * @param {object} options
 * @param {{ entries: object[], types: object[], values: object[] }} options.graph
 * @param {readonly { slug: string, exportName: string, source: string, module: string }[]} options.families
 * @param {ReadonlyMap<string, string>} options.sources The source each declaration module was generated from, by module.
 * @param {{ name: string, exports: Record<string, unknown> }} options.manifest
 * @param {Record<string, string>} [options.untypedEntries] The export-map entries without declarations, with why each is listed.
 */
export function buildReference({ graph, families, sources, manifest, exceptions, untypedEntries = UNTYPED_ENTRIES }) {
  const types = new Map(graph.types.map((declaration) => [declaration.id, declaration]));
  const values = new Map(graph.values.map((declaration) => [declaration.id, declaration]));
  const owners = assignOwners({ entries: graph.entries, families, sources, ...(exceptions && { exceptions }) });
  const reader = createComponentReader({ types, values });
  const keyOrder = Object.keys(manifest.exports);
  const entries = [...graph.entries].sort((left, right) => keyOrder.indexOf(left.key) - keyOrder.indexOf(right.key));

  // Public names of each type id and each value id, in entry and name order, and the exports each owner holds.
  const publicNames = new Map();
  const valueNames = new Map();
  const holdings = new Map();
  const holdingOf = (owner) => {
    if (!holdings.has(owner)) holdings.set(owner, { exports: [], types: new Set(), modules: new Set() });
    return holdings.get(owner);
  };
  for (const entry of entries) {
    for (const item of entry.exports) {
      const { owner } = owners.get(`${entry.key}\0${item.name}`);
      const holding = holdingOf(owner);
      if (item.type) {
        publicNames.set(item.type, [...(publicNames.get(item.type) ?? []), { entry: entry.key, name: item.name, owner }]);
        holding.types.add(item.type);
        holding.modules.add(types.get(item.type).module);
      }
      if (item.value) {
        valueNames.set(item.value, [...(valueNames.get(item.value) ?? []), { entry: entry.key, name: item.name }]);
        const declaration = values.get(item.value);
        const parts = reader.componentParts(declaration);
        const base = { name: item.name, entry: entry.key, module: declaration.module, ...(item.alias && { alias: item.alias }) };
        // A component's own comment describes its implementation and is the catalog's job to summarise, so only a
        // function's or a constant's comment, which is all the documentation that API has, is carried.
        if (parts !== null) holding.exports.push({ ...base, kind: 'component', parts });
        else if (declaration.kind === 'function') holding.exports.push({ ...base, kind: 'function', ...(declaration.doc && { doc: declaration.doc }), ...modelFunction(declaration) });
        else {
          const refs = [...referencedIds(declaration.type)];
          holding.exports.push({ ...base, kind: 'value', ...(declaration.doc && { doc: declaration.doc }), type: printType(declaration.type), ...(refs.length > 0 && { refs }) });
        }
        holding.modules.add(declaration.module);
      }
    }
  }

  function modelType(declaration) {
    const publics = (publicNames.get(declaration.id) ?? []).map(({ entry, name }) => ({ entry, name }));
    const owner = publicNames.get(declaration.id)?.[0]?.owner;
    // An alias of `Base & { ... }` is an interface that extends Base: its references are its bases, its literals its members.
    const parts = declaration.kind === 'alias' && declaration.type.kind === 'intersection'
      && declaration.type.members.every((part) => part.kind === 'object' || (part.kind === 'reference' && !part.typeArguments))
      ? declaration.type.members
      : null;
    const object = declaration.kind === 'interface'
      ? declaration.members
      : (declaration.type.kind === 'object' ? declaration.type.members : parts?.filter(({ kind }) => kind === 'object').flatMap(({ members: literal }) => literal));
    const members = object?.filter((member) => member.member === 'property' || member.member === 'method').map((member) => modelMember(member, types));
    const finite = declaration.kind === 'alias' && !declaration.typeParameters ? valuesOf(declaration.type, types) : null;
    const refs = [...referencedIds(declaration.kind === 'interface' ? [declaration.extends, declaration.members, declaration.typeParameters] : [declaration.type, declaration.typeParameters])].filter((id) => id !== declaration.id);
    const typeParameters = modelTypeParameters(declaration.typeParameters);
    // The bases an interface extends, as the declaration writes them; their own members are not repeated in `members`.
    const bases = (declaration.extends ?? parts?.filter(({ kind }) => kind === 'reference'))?.map((base) => {
      const baseRefs = [...referencedIds(base)];
      return { type: printType(base), ...(baseRefs.length > 0 && { refs: baseRefs }) };
    });
    return {
      id: declaration.id,
      name: declaration.name,
      module: declaration.module,
      ...(publics.length > 0 && { public: publics }),
      ...(owner && { owner }),
      ...(typeParameters && { typeParameters }),
      ...(bases && { extends: bases }),
      text: printDeclaration(declaration),
      ...(members && members.length > 0 && { members }),
      ...(finite !== null && { values: finite }),
      ...(refs.length > 0 && { refs }),
    };
  }

  // A value a type reaches through `typeof`, printed as its declaration, so the type that names it is not left dangling.
  function modelValue(declaration) {
    const refs = [...referencedIds(declaration.kind === 'function' ? [declaration.typeParameters, declaration.parameters, declaration.returnType] : declaration.type)].filter((id) => id !== declaration.id);
    const publics = valueNames.get(declaration.id) ?? [];
    return {
      id: declaration.id,
      name: declaration.name,
      module: declaration.module,
      kind: declaration.kind,
      ...(publics.length > 0 && { public: publics }),
      text: printValueDeclaration(declaration),
      ...(declaration.doc && { doc: declaration.doc }),
      ...(refs.length > 0 && { refs }),
    };
  }

  const files = new Map();
  for (const [owner, holding] of [...holdings].sort(([left], [right]) => (left < right ? -1 : 1))) {
    holding.exports.sort((left, right) => keyOrder.indexOf(left.entry) - keyOrder.indexOf(right.entry) || byName(left, right));
    // The closure of Mux UI types and values the owner's exports and public types reach.
    const queue = [...holding.types, ...[...collectRefs(holding.exports)].filter((id) => types.has(id) || values.has(id))];
    const reached = new Map();
    const reachedValues = new Map();
    const visited = new Set();
    // An id can name a type and a value at once (`interface X` beside `declare const X`), and `typeof X` means the value.
    while (queue.length > 0) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const entries = [];
      if (types.has(id)) {
        const entry = modelType(types.get(id));
        reached.set(id, entry);
        entries.push(entry);
      }
      if (values.has(id)) {
        const entry = modelValue(values.get(id));
        reachedValues.set(id, entry);
        entries.push(entry);
      }
      for (const entry of entries) for (const next of entry.refs ?? []) if (types.has(next) || values.has(next)) queue.push(next);
    }
    const typeEntries = [...reached.values()].sort((left, right) => (left.id < right.id ? -1 : 1));
    const valueEntries = [...reachedValues.values()].sort((left, right) => (left.id < right.id ? -1 : 1));
    const modules = new Set([...holding.modules, ...typeEntries.map(({ module }) => module), ...valueEntries.map(({ module }) => module)]);
    const provenance = Object.fromEntries([...modules].sort().map((module) => {
      const source = sources.get(module);
      if (source === undefined) throw new ReferenceReadError('INVENTORY', module, 'the declaration file has no @generated-from source');
      return [module, source];
    }));
    files.set(`${owner}.json`, {
      schema: REFERENCE_SCHEMA,
      owner,
      sources: provenance,
      exports: holding.exports,
      types: typeEntries,
      ...(valueEntries.length > 0 && { values: valueEntries }),
    });
  }

  const inventoryEntries = keyOrder.map((key) => {
    const entry = entries.find((candidate) => candidate.key === key);
    if (entry !== undefined) {
      return {
        key,
        exports: entry.exports.map((item) => {
          const ownership = owners.get(`${key}\0${item.name}`);
          const declaration = types.get(item.type) ?? values.get(item.value);
          return {
            name: item.name,
            kind: item.type && item.value ? 'type and value' : (item.type ? 'type' : 'value'),
            owner: ownership.owner,
            module: declaration.module,
            ...(item.alias && { alias: item.alias }),
            ...(ownership.reason && { reason: ownership.reason }),
          };
        }),
      };
    }
    const reason = untypedEntries[key];
    if (reason === undefined) {
      throw new ReferenceReadError('INVENTORY', key, 'the export map has an entry the inventory neither reads nor classifies; add it to UNTYPED_ENTRIES with its reason');
    }
    return { key, untyped: true, reason };
  });
  const unused = Object.keys(untypedEntries).filter((key) => !keyOrder.includes(key));
  if (unused.length > 0) throw new ReferenceReadError('INVENTORY', unused.join(', '), 'classified as an untyped entry but absent from the export map');

  const inventory = {
    schema: INVENTORY_SCHEMA,
    package: manifest.name,
    entries: inventoryEntries,
    owners: Object.fromEntries([...files.keys()].map((file) => [file.replace(/\.json$/u, ''), file])),
  };
  return { inventory, files };
}
