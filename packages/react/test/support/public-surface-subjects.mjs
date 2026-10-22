// What the public-surface check compares. A subject is one type a consumer can name or reach from an
// entry point of the package's export map:
//   type   an exported interface or type alias (a generic one at its defaults or constraints)
//   value  `typeof` an exported value, with its call and construct signatures and statics
//   props  `ComponentProps<typeof X>` of an exported component
//   part   `ComponentProps` of a static part of an exported value, at any depth (`Sidebar.Provider`)
//   partValue  `typeof` that static part itself, so its own statics (`displayName`) are held too
// `listSubjects` reads them off one snapshot's declarations, `inventoryProblems` holds them against the
// recorded manifest, and `classifyMembers` says, for the subjects both snapshots share, which callable
// members need a handler probe.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeBuilderFlags, SignatureKind, SymbolFlags, TypeFlags } from 'typescript/unstable/sync';
import { exportedDeclarations, withDeclarationProject } from './declaration-surface.mjs';
import { createSnapshots, entrySpecifier, loadBaseline, loadCurrent } from './public-surface-snapshots.mjs';

// Bundler resolution reads the package export maps the way the packed consumer does.
export const PROJECT_OPTIONS = { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', skipLibCheck: false };
const SPELLING = NodeBuilderFlags.UseFullyQualifiedType | NodeBuilderFlags.NoTruncation;
// The readonly bit of a property symbol's check flags (TypeScript's CheckFlags.Readonly, which the API does not
// export): a mapped or instantiated property carries its own, where a declared one has the modifier of its declaration.
const READONLY_CHECK_FLAG = 8;
// The depth static parts are followed to (`Sidebar.AccountCard.Something`); a cycle stops sooner.
const MAX_PART_DEPTH = 4;
// The depth of object members the readonly probe follows (`settings.data.options.flags`); a chain that goes deeper stops the check.
export const MAX_NESTED_DEPTH = 4;

const calls = (checker, type) => checker.getSignaturesOfType(type, SignatureKind.Call).length;
const isObjectLike = (type) => (type.flags & (TypeFlags.Object | TypeFlags.Intersection)) !== 0;

/** The names `kind` and `name` identify a subject by across the two snapshots. */
const subjectId = (entry, kind, name) => `${entry}:${kind}:${name}`;

/**
 * The type expression of `subject` in the namespace import `ns` of its entry point. A generic type
 * takes `args` (the text of its defaults or constraints in that snapshot); a part is reached from its
 * root value by indexed access, which needs no identifier-shaped names.
 */
export function subjectExpression(subject, ns) {
  const part = () => subject.path.slice(1).reduce((expression, key) => `${expression}[${JSON.stringify(key)}]`, `(typeof ${ns}.${subject.path[0]})`);
  switch (subject.kind) {
    case 'type': return `${ns}.${subject.name}${subject.args ? `<${subject.args.join(', ')}>` : ''}`;
    case 'value': return `typeof ${ns}.${subject.name}`;
    case 'props': return `React.ComponentProps<typeof ${ns}.${subject.name}>`;
    case 'partValue': return part();
    default: return `React.ComponentProps<${part()}>`;
  }
}

/** Every subject of one snapshot, in a stable order, as `{ id, entry, kind, name, args?, path? }`. */
export function listSubjects(snapshots, snapshot) {
  const classify = join(snapshots.root, 'classify.ts');
  writeFileSync(classify, "import type { JSXElementConstructor } from 'react';\nexport type Component = JSXElementConstructor<never>;\n");
  return withDeclarationProject({ files: [classify, ...snapshot.entries.map(({ path }) => path)], directory: snapshots.root, compilerOptions: PROJECT_OPTIONS }, ({ checker, program }) => {
    const [componentSymbol] = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(classify)));
    const componentType = checker.getDeclaredTypeOfSymbol(componentSymbol);
    // A component is an uppercase name a JSX tag can use that React accepts as an element constructor.
    const isComponent = (name, type) => /^[A-Z]/u.test(name) && checker.isTypeAssignableTo(checker.getNonNullableType(type), componentType);
    const subjects = [];

    const walkParts = (entry, type, path, seen) => {
      if (path.length > MAX_PART_DEPTH || seen.has(type.id)) return;
      seen.add(type.id);
      for (const property of checker.getPropertiesOfType(type)) {
        if (!/^[A-Z]/u.test(property.name)) continue;
        const declared = checker.getTypeOfSymbol(property);
        const propertyType = declared && checker.getNonNullableType(declared);
        if (!propertyType) continue;
        const partPath = [...path, property.name];
        if (isComponent(property.name, propertyType)) {
          for (const kind of ['part', 'partValue']) subjects.push({ id: subjectId(entry, kind, partPath.join('.')), entry, kind, name: partPath.join('.'), path: partPath });
          walkParts(entry, propertyType, partPath, seen);
        } else if (calls(checker, propertyType) === 0) {
          walkParts(entry, propertyType, partPath, seen);
        }
      }
    };

    for (const { key, path: file } of snapshot.entries) {
      const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(file)));
      for (const exported of exports) {
        const { symbol } = exportedDeclarations(checker, exported);
        const name = exported.name;
        if (symbol.flags & SymbolFlags.Type) {
          const declaration = symbol.declarations.map((handle) => handle.resolve()).find((node) => node?.typeParameters?.length > 0);
          const parameters = declaration?.typeParameters ?? [];
          // A type whose every parameter has a default is named bare; otherwise each parameter takes its default, else its constraint, else unknown.
          const args = parameters.every((parameter) => parameter.defaultType) ? undefined : parameters.map((parameter) => {
            const node = parameter.defaultType ?? parameter.constraint;
            return node ? checker.typeToString(checker.getTypeFromTypeNode(node), undefined, SPELLING) : 'unknown';
          });
          subjects.push({ id: subjectId(key, 'type', name), entry: key, kind: 'type', name, ...(args?.length ? { args } : {}) });
        }
        if (symbol.flags & SymbolFlags.Value) {
          const type = checker.getTypeOfSymbol(symbol);
          subjects.push({ id: subjectId(key, 'value', name), entry: key, kind: 'value', name });
          if (isComponent(name, type)) subjects.push({ id: subjectId(key, 'props', name), entry: key, kind: 'props', name });
          walkParts(key, type, [name], new Set());
        }
      }
    }
    return subjects.sort((left, right) => (left.id < right.id ? -1 : 1));
  });
}

/** The subjects as the manifest records them: `{ [entry]: { types, values, components, parts, partValues } }`, each list of names sorted. */
export function inventoryOf(subjects) {
  const lists = { type: 'types', value: 'values', props: 'components', part: 'parts', partValue: 'partValues' };
  const inventory = {};
  for (const { entry, kind, name } of subjects) (inventory[entry] ??= { types: [], values: [], components: [], parts: [], partValues: [] })[lists[kind]].push(name);
  for (const entry of Object.values(inventory)) for (const names of Object.values(entry)) names.sort();
  return Object.fromEntries(Object.entries(inventory).sort(([left], [right]) => left.localeCompare(right)));
}

/** The ids of an inventory, `<entry>:<list>:<name>`. */
const inventoryIds = (inventory) => new Set(Object.entries(inventory).flatMap(([entry, lists]) => Object.entries(lists).flatMap(([list, names]) => names.map((name) => `${entry}:${list}:${name}`))));

/**
 * Compares the snapshots' subjects with the recorded manifest `{ baseline, added }` and returns three
 * lists of `<entry>:<list>:<name>` ids:
 * - `drifted`: the baseline enumerated differently from its record (the enumerator or the fixture changed);
 * - `vanished`: a baseline subject, or one recorded as added, that the current build no longer exports;
 * - `added`: subjects the current build exports beyond the baseline and the record, to be reported and recorded.
 */
export function inventoryProblems({ baseline, current, manifest }) {
  const baselineIds = inventoryIds(inventoryOf(baseline));
  const currentIds = inventoryIds(inventoryOf(current));
  const recordedBaseline = inventoryIds(manifest.baseline);
  const recordedAdded = inventoryIds(manifest.added);
  const missing = (from, within) => [...from].filter((id) => !within.has(id)).sort();
  return {
    drifted: [...missing(baselineIds, recordedBaseline).map((id) => `${id} is not in the recorded baseline`), ...missing(recordedBaseline, baselineIds).map((id) => `${id} is recorded but no longer enumerated`)],
    vanished: missing(new Set([...baselineIds, ...recordedAdded]), currentIds),
    added: missing(currentIds, new Set([...baselineIds, ...recordedAdded])),
  };
}

/**
 * The scratch-root module that aliases every common subject in both snapshots (`S<i>_O`, `S<i>_N`), and
 * the record of which alias names which subject. The probe program starts with the same text, so the
 * members are read from the types the compiler will check.
 */
export function aliasModule(snapshots, common) {
  const entries = [...new Set([...snapshots.baseline.entries, ...snapshots.current.entries].map(({ key }) => key))].sort();
  const namespace = (side, key) => `${side}${entries.indexOf(key)}`;
  const lines = ["import type * as React from 'react';"];
  for (const [side, snapshot] of [['O', snapshots.baseline], ['N', snapshots.current]]) {
    for (const entry of snapshot.entries) lines.push(`import type * as ${namespace(side, entry.key)} from '${entrySpecifier(snapshots, snapshot, entry)}';`);
  }
  const names = new Map();
  common.forEach(({ old, new: current }, index) => {
    names.set(old.id, { old: `S${index}_O`, new: `S${index}_N` });
    lines.push(`export type S${index}_O = ${subjectExpression(old, namespace('O', old.entry))};`, `export type S${index}_N = ${subjectExpression(current, namespace('N', current.entry))};`);
  });
  return { lines, names };
}

/** The subjects both snapshots hold, paired as `{ old, new }`; the shape comes from the current spelling of generic arguments. */
export function commonSubjects(baseline, current) {
  const byId = new Map(current.map((subject) => [subject.id, subject]));
  return baseline.filter(({ id }) => byId.has(id)).map((old) => ({ old, new: byId.get(old.id) }));
}

/**
 * For each common subject, how it is probed: `{ shape, selfCallable, examined, callable, inherited }`.
 * - `shape` is `object` when either snapshot's type has an object or intersection arm, else `value`.
 * - `selfCallable`: an exported callback type, probed as a handler target itself.
 * - `examined`: the members the probe looks at by name, because some declaration of theirs is in a
 *   snapshot's own files, or an inherited one is not the same declaration, resolved type and readonly
 *   modifier on both sides (React's own members that are, are not examined: the shared checker shows
 *   them identical);
 * - `callable`: the examined members that are callable, which get the handler probes;
 * - `inherited`: every other member, the ones skipped as identical (absent for a `value` or `partValue`, which
 *   are not probed by name). `examined` and `inherited` together are the keys the compiler enumerates for the
 *   subject, which the probe checks (`members`) so that a member that loses its classification fails.
 * Arms of a union are paired by mutual assignability; a subject with an unpaired arm examines every member.
 */
export function classifyMembers(snapshots, common) {
  const { lines, names } = aliasModule(snapshots, common);
  const source = join(snapshots.root, 'subjects.ts');
  writeFileSync(source, `${lines.join('\n')}\n`);
  const own = [snapshots.baseline.dir, snapshots.current.dir].map((dir) => `${dir.toLowerCase()}/`);
  const isOwn = (handle) => own.some((dir) => handle.path.toLowerCase().startsWith(dir));
  return withDeclarationProject({ files: [source], directory: snapshots.root, compilerOptions: PROJECT_OPTIONS }, ({ checker, program }) => {
    const aliases = new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(source))).map((symbol) => [symbol.name, checker.getDeclaredTypeOfSymbol(symbol)]));
    // An array or tuple has only the library's members, which differ in identity with the element type.
    const armsOf = (type) => (type.isUnionType() ? type.getTypes() : [type]).filter((arm) => isObjectLike(arm) && !checker.isArrayType(arm) && !checker.isTupleType(arm));
    const mutual = (left, right) => checker.isTypeAssignableTo(left, right) && checker.isTypeAssignableTo(right, left);
    const declarationKey = (property) => property.declarations.map(({ path, index }) => `${path}#${index}`).sort().join(',');
    // The probe varies the parameters of a callback by position, which a rest parameter (variadic or a tuple's) has none to name.
    const rejectVariadic = (type, where) => {
      if (checker.getSignaturesOfType(type, SignatureKind.Call).some((signature) => signature.hasRestParameter)) {
        throw new Error(`${where} is a callback with a rest parameter, which the handler probes do not cover: extend them to vary the rest element before accepting one`);
      }
    };
    // The declared type of each exported type: a member typed by one is that subject's own, not a nested object of this one.
    const subjectTypes = new Set(common.filter(({ old }) => old.kind === 'type').flatMap(({ old }) => [aliases.get(names.get(old.id).old).id, aliases.get(names.get(old.id).new).id]));
    // A nested object is neither callable nor constructable (a class or React.ComponentType is a callback's kind), nor an array.
    const isNestedObject = (type) => isObjectLike(type) && !checker.isArrayType(type) && !checker.isTupleType(type) && !subjectTypes.has(type.id)
      && calls(checker, type) === 0 && checker.getSignaturesOfType(type, SignatureKind.Construct).length === 0;
    const membersOf = (arms) => arms.map((arm) => new Map(checker.getPropertiesOfType(arm).map((property) => [property.name, property])));
    const hasOwnDeclaration = (property) => (property.declarations ?? []).some(isOwn);

    // The names of the members of two sets of arms a probe reads: own ones, and inherited ones that are not the same declaration,
    // resolved type and readonly modifier in the arms that pair. Arms are paired by mutual assignability; with an unpaired arm
    // every member is examined. `own` stops at the own members, for a value, whose statics have no inherited twin to compare.
    const examine = (oldArms, newArms, { own: ownOnly = false } = {}) => {
      const properties = membersOf([...oldArms, ...newArms]);
      const allNames = new Set(properties.flatMap((map) => [...map.keys()]));
      const examined = new Set();
      if (ownOnly) {
        for (const name of allNames) if (properties.some((map) => map.has(name) && hasOwnDeclaration(map.get(name)))) examined.add(name);
        return { properties, oldCount: oldArms.length, examined, allNames };
      }
      const pairs = oldArms.flatMap((oldArm, i) => newArms.flatMap((newArm, j) => (mutual(oldArm, newArm) ? [[i, j]] : [])));
      const paired = oldArms.every((_, i) => pairs.some(([a]) => a === i)) && newArms.every((_, j) => pairs.some(([, b]) => b === j));
      for (const name of allNames) {
        const symbols = properties.map((map) => map.get(name)).filter(Boolean);
        if (!paired || symbols.some(hasOwnDeclaration)) {
          examined.add(name);
          continue;
        }
        // Inherited only: the same declaration with the same resolved type, arm for arm.
        const identical = pairs.every(([i, j]) => {
          const [left, right] = [properties[i].get(name), properties[oldArms.length + j].get(name)];
          if (!left || !right) return !left && !right;
          return left.declarations && right.declarations && declarationKey(left) === declarationKey(right) && checker.getTypeOfSymbol(left)?.id === checker.getTypeOfSymbol(right)?.id
            && (left.checkFlags & READONLY_CHECK_FLAG) === (right.checkFlags & READONLY_CHECK_FLAG);
        });
        if (!identical) examined.add(name);
      }
      return { properties, oldCount: oldArms.length, examined, allNames };
    };

    // The object types one side holds under `name`: the constituents of the member's type, without null and undefined.
    const objectsOf = (maps, name) => {
      const found = new Map();
      for (const map of maps) {
        const type = map.has(name) && checker.getTypeOfSymbol(map.get(name));
        for (const part of type ? (type.isUnionType() ? type.getTypes() : [type]) : []) if (isNestedObject(part)) found.set(part.id, part);
      }
      return [...found.values()].sort((left, right) => left.id - right.id);
    };

    // The object-typed members of a subject, at any depth, whose readonly modifiers the probe reads: `[{ path, examined }]`. A type
    // that is the same on both sides (React's) has nothing to compare, a cycle stops where it repeats, and the depth is bounded:
    // a bound that is reached stops the check.
    const nestedMembers = (id, level, chain) => {
      const found = [];
      const visit = ({ properties, oldCount, examined }, path, ancestors) => {
        for (const name of [...examined].sort()) {
          // Own members only: an inherited one that differs is React's, retyped by this package's type arguments.
          if (name.startsWith('__@') || !properties.some((map) => map.has(name) && hasOwnDeclaration(map.get(name)))) continue;
          const [before, after] = [objectsOf(properties.slice(0, oldCount), name), objectsOf(properties.slice(oldCount), name)];
          const [beforeKey, afterKey] = [before, after].map((types) => types.map((type) => type.id).join(','));
          const key = `${beforeKey}|${afterKey}`;
          if (before.length + after.length === 0 || beforeKey === afterKey || ancestors.has(key)) continue;
          if (path.length >= MAX_NESTED_DEPTH) throw new Error(`${id} nests object members more than ${MAX_NESTED_DEPTH} levels deep at ${[...path, name].join('.')}, which the readonly probe does not follow`);
          const inner = examine(before, after);
          found.push({ path: [...path, name], examined: [...inner.examined].sort() });
          visit(inner, [...path, name], new Set([...ancestors, key]));
        }
      };
      visit(level, [], chain);
      return found;
    };

    const result = new Map();
    for (const { old } of common) {
      const [oldType, newType] = [aliases.get(names.get(old.id).old), aliases.get(names.get(old.id).new)];
      for (const type of [oldType, newType]) if (type.isErrorType()) throw new Error(`${old.id} resolves to an error type`);
      const [oldArms, newArms] = [armsOf(oldType), armsOf(newType)];
      if (oldArms.length + newArms.length === 0) {
        result.set(old.id, { shape: 'value', selfCallable: false, examined: [], callable: [], nested: [] });
        continue;
      }
      const selfCallable = old.kind === 'type' && [...oldArms, ...newArms].some((arm) => calls(checker, arm) > 0);
      if (selfCallable) [...oldArms, ...newArms].forEach((arm) => rejectVariadic(arm, old.id));
      const chain = new Set([`${oldType.id}|${newType.id}`]);
      if (old.kind === 'value' || old.kind === 'partValue') {
        result.set(old.id, { shape: 'object', selfCallable: false, examined: [], callable: [], nested: nestedMembers(old.id, examine(oldArms, newArms, { own: true }), chain) });
        continue;
      }
      const level = examine(oldArms, newArms);
      const { properties, examined, allNames } = level;
      const callable = [...examined].filter((name) => {
        if (name.startsWith('__@')) throw new Error(`${old.id} has the symbol-keyed member ${name}, which the probe cannot name`);
        return properties.some((map) => {
          const type = map.has(name) && checker.getTypeOfSymbol(map.get(name));
          return type && (type.isUnionType() ? type.getTypes() : [type]).some((member) => {
            rejectVariadic(member, `${old.id} member ${name}`);
            return calls(checker, member) > 0;
          });
        });
      });
      result.set(old.id, { shape: 'object', selfCallable, examined: [...examined].sort(), callable: callable.sort(), inherited: [...allNames].filter((name) => !examined.has(name)).sort(), nested: nestedMembers(old.id, level, chain) });
    }
    return result;
  });
}

// Prints the manifest: node test/support/public-surface-subjects.mjs > test/fixtures/public-surface-inventory.json
// `baseline` is every subject of the frozen declarations, and `added` what the current build exports beyond them.
// Run it to record a reviewed addition, so that removing it later fails the check.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const snapshots = createSnapshots({ baseline: loadBaseline(), current: loadCurrent() });
  try {
    const baseline = listSubjects(snapshots, snapshots.baseline);
    const known = new Set(baseline.map(({ id }) => id));
    const added = listSubjects(snapshots, snapshots.current).filter(({ id }) => !known.has(id));
    const note = 'The subjects test/public-surface-baseline.test.mjs compares, per entry point of the export map: baseline lists those of the declarations before the TypeScript moves (frozen with them), added the ones the package has gained since. A subject may not drop out of the current build; a new one is reported until it is recorded here (node test/support/public-surface-subjects.mjs > test/fixtures/public-surface-inventory.json).';
    console.log(JSON.stringify({ note, baseline: inventoryOf(baseline), added: inventoryOf(added) }, null, 2));
  } finally {
    snapshots.dispose();
  }
}
