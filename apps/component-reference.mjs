import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stylingFor } from '../packages/react/test/support/styling-reference.mjs';

/**
 * Component reference facts, projected from one canonical component record.
 *
 * Applications show a component's usage, behavior, accessibility, anatomy,
 * token requirements, imports and sources through this module, never from
 * hand-written per-family text. A compound whose parts own Mux UI props lists
 * each one beside the root's (`parts`), so an application that shows the root's
 * props and events shows the parts' too.
 *
 * The prop types, refs and exact callback signatures come from the declarations the
 * package ships (Decision 0031), read into the committed declaration reference,
 * `packages/react/reference/`. `readDeclarationReference` loads it and
 * `componentDeclarations` selects one component's share; `componentReference`
 * carries that share as `declarations` only when its caller passes the reference in.
 * The data is exposed as the reader wrote it: printed type text, referenced ids, and the
 * alternatives of a props type. An application renders it and never re-reads a type string.
 *
 * The styling projection (hooks, tokens, override rules) is derived by the React package's styling reference
 * (`packages/react/test/support/styling-reference.mjs`) and carried as `styling` only when a caller passes the
 * facts it read (`stylingFacts`), so an application that has not opted in sees `styling` as it always was.
 */

const manifestPath = 'packages/react/package.json';
const descriptorPath = 'packages/react/generated/descriptor.json';
const contractPath = 'packages/react/generated/r1-6-contract.json';
const contractSchema = 'muxui-react-r1-6-contract-v1';
const stylesheetSubpath = './styles.css';
const referenceDirectory = 'packages/react/reference';
const referenceSchema = 'muxui-declaration-reference-v1';
const inventorySchema = 'muxui-declaration-inventory-v1';
/** More token requirements than this are grouped by their first two path segments. */
const tokenGroupThreshold = 8;

/**
 * @typedef {object} TokenRequirement
 * @property {string} token
 * @property {string} requirement
 * @property {readonly string[]} [profiles]
 */

/**
 * One part's API in a derived binding: the part of the export that renders it and the
 * Mux UI-owned props, events, and defaults of that part alone.
 * @typedef {object} PartApi
 * @property {string} member The export member that renders the part, such as Item for ListBox.Item.
 * @property {readonly string[]} props
 * @property {readonly string[]} events
 * @property {Readonly<Record<string, unknown>>} defaults
 */

/**
 * @typedef {object} ReactBindingRecord
 * @property {{ events: readonly string[], partApis?: Readonly<Record<string, PartApi>> }} api
 * @property {readonly string[]} [behavior]
 * @property {readonly string[]} [accessibility]
 * @property {{ source: string, requirements: readonly TokenRequirement[] }} tokenRecipe
 */

/**
 * The part of a canonical component record this module reads, with the binding under `web.react`.
 * Docs' typed artifact satisfies it, and so does a record read straight from the catalog.
 * @typedef {object} ComponentRecord
 * @property {string} id
 * @property {{ record: string }} source
 * @property {{ useWhen?: readonly string[], avoidWhen?: readonly string[] }} [intent]
 * @property {readonly string[]} anatomy
 * @property {readonly string[]} states
 * @property {{ nameRequired: boolean, obligations: readonly string[] }} accessibility
 * @property {Readonly<Record<string, ReactBindingRecord>>} bindings
 */

/**
 * One declared member of a props type or a named type, as the declaration wrote it.
 * @typedef {object} DeclarationMember
 * @property {string} name
 * @property {true} [optional] Declared with `?`.
 * @property {true} [readonly]
 * @property {true} [method] Declared as a method signature; `type` is then its call signature.
 * @property {true} [never] Declared `never`, which is not the same as not declared.
 * @property {true} [explicitUndefined] Declared `?: T | undefined`.
 * @property {string} type The printed type.
 * @property {readonly (string | number | boolean | null)[]} [values] The finite values of a literal union.
 * @property {readonly string[]} [refs] The ids of the Mux UI types `type` names.
 * @property {string} [doc] The declaration's own comment; absent when the declaration has none.
 */

/**
 * A forwarded ref: the element type, or `never` for a part that takes none (`required` when the declaration
 * writes `ref: never` rather than `ref?: never`), or null when the part declares no ref.
 * @typedef {{ type: string, refs?: readonly string[] } | { never: true, required?: true } | null} DeclarationRef
 */

/**
 * A host surface a part extends, such as `React.HTMLAttributes<HTMLDivElement>`, less what it omits.
 * @typedef {object} DeclarationNative
 * @property {string} type
 * @property {readonly string[]} [omit]
 * @property {readonly string[]} [refs]
 */

/**
 * One alternative of a props type: only what differs from the part's shared members.
 * @typedef {object} DeclarationAlternative
 * @property {readonly DeclarationMember[]} members Members this alternative declares; one it does not list is not declared in it.
 * @property {DeclarationRef} [ref]
 * @property {readonly DeclarationNative[]} [natives]
 */

/**
 * @typedef {object} DeclarationPart
 * @property {string | null} member The export member that is the part, or null for the export itself.
 * @property {string} [form] How it is declared: forwardRef, function, FC, ComponentType or call.
 * @property {readonly { name: string, constraint?: string, default?: string, refs?: readonly string[] }[]} [typeParameters]
 * @property {readonly DeclarationMember[]} [members] Members every alternative shares.
 * @property {readonly DeclarationAlternative[]} [alternatives]
 * @property {DeclarationRef} [ref]
 * @property {readonly DeclarationNative[]} [natives]
 * @property {string} [sameAs] The member this part is the same as.
 */

/**
 * A parameter of a function export, as the declaration wrote it.
 * @typedef {object} DeclarationParameter
 * @property {string} name
 * @property {true} [optional]
 * @property {true} [rest]
 * @property {string} type The printed type.
 * @property {readonly string[]} [refs] The ids of the Mux UI types `type` names.
 */

/**
 * An export of the package: a component with its parts, a function, or a value. A component has `parts`; a
 * function has its printed `signature` and the pieces it was printed from; a value has its printed `type`.
 * @typedef {object} DeclarationExport
 * @property {string} name
 * @property {string} entry The export-map key, such as `.` or `./text-editor`.
 * @property {string} module
 * @property {'component' | 'function' | 'value'} kind
 * @property {string} [doc] The declaration's own comment; absent when the declaration has none.
 * @property {readonly DeclarationPart[]} [parts]
 * @property {string} [signature] A function's printed signature, such as `useToast(): ToastManager`.
 * @property {readonly { name: string, constraint?: string, default?: string, refs?: readonly string[] }[]} [typeParameters] A function's type parameters.
 * @property {readonly DeclarationParameter[]} [parameters]
 * @property {{ type: string, predicate?: true, refs?: readonly string[] }} [returns]
 * @property {string} [type] A value's printed type.
 * @property {readonly string[]} [refs] The ids of the Mux UI types a value's `type` names.
 */

/**
 * A Mux UI type, printed as its declaration, with the types it names listed by id.
 * @typedef {object} DeclarationType
 * @property {string} id
 * @property {string} name
 * @property {string} module
 * @property {readonly { entry: string, name: string }[]} [public] Where a consumer can import it; absent for an internal type.
 * @property {string} [owner] The owner of the public type, which is the page or section that documents it: a family slug, `shared` or `package-level`; absent for an internal type.
 * @property {string} text The printed declaration.
 * @property {readonly { type: string, refs?: readonly string[] }[]} [extends] The bases an interface (or `Base & { ... }`) extends.
 * @property {readonly DeclarationMember[]} [members]
 * @property {readonly (string | number | boolean | null)[]} [values]
 * @property {readonly string[]} [refs]
 */

/**
 * A Mux UI value a type reaches through `typeof`, printed as its declaration.
 * @typedef {object} DeclarationValue
 * @property {string} id `module#Name:value`, so a value never shares an id with a type of the same name.
 * @property {string} name
 * @property {string} module
 * @property {'const' | 'function'} kind
 * @property {readonly { entry: string, name: string }[]} [public] Where a consumer can import it; absent for an internal value.
 * @property {string} text The printed declaration.
 * @property {string} [doc]
 * @property {readonly string[]} [refs]
 */

/**
 * One owner's file of the declaration reference: its exports and every Mux UI type and value they reach.
 * @typedef {object} DeclarationFile
 * @property {string} schema
 * @property {string} owner A family slug, `shared` or `package-level`.
 * @property {Readonly<Record<string, string>>} sources The source each declaration module was generated from.
 * @property {readonly DeclarationExport[]} exports
 * @property {readonly DeclarationType[]} types
 * @property {readonly DeclarationValue[]} [values] Absent when no export reaches a value.
 */

/**
 * @typedef {object} DeclarationInventory
 * @property {string} schema
 * @property {string} package
 * @property {readonly ({ key: string, untyped: true, reason: string } | { key: string, exports: readonly { name: string, kind: string, owner: string, module: string, alias?: string, reason?: string }[] })[]} entries Every entry of the package's export map.
 * @property {Readonly<Record<string, string>>} owners The file of each owner.
 */

/**
 * The committed declaration reference, whole.
 * @typedef {object} DeclarationReference
 * @property {DeclarationInventory} inventory
 * @property {ReadonlyMap<string, DeclarationFile>} files By owner.
 */

/**
 * A component's share of the declaration reference.
 * @typedef {object} ComponentDeclarations
 * @property {string} owner
 * @property {string} source The reference file that holds it.
 * @property {DeclarationExport} export
 * @property {readonly DeclarationExport[]} related Every other export of the owner's file, in the order it lists them: the hooks, helpers, providers and flat parts that belong with the component.
 * @property {readonly DeclarationType[]} types Every Mux UI type the export reaches, printed in full.
 * @property {readonly DeclarationValue[]} [values] Every Mux UI value those types name through `typeof`, when there are any.
 * @property {Readonly<Record<string, string>>} sources
 */

/**
 * @typedef {object} ReactPackageFacts
 * @property {string} packageName
 * @property {string} manifestPath The package manifest the import specifiers are verified against.
 * @property {string} stylesheet The import specifier of the package stylesheet.
 * @property {ReadonlyMap<string, { export: string, specifier: string }>} bindings By binding ref, such as `muxui:component:button#web.react`.
 * @property {ReadonlyMap<string, string>} runtimeSources The runtime file of every family, by slug.
 */

/**
 * Read the React package facts imports and sources need: the renderer descriptor
 * and the renderer contract (both generated), and the package manifest. Fails
 * when they disagree.
 * @param {string} repositoryRoot
 * @returns {ReactPackageFacts}
 */
export function readReactPackageFacts(repositoryRoot) {
  /** @param {string} path */
  const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
  const manifest = readJson(manifestPath);
  const descriptor = readJson(descriptorPath);
  // The contract is generated with two marker comment lines ahead of its JSON.
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, contractPath), 'utf8').split('\n').filter((line) => !line.startsWith('// @generated-')).join('\n'));
  if (descriptor.package !== manifest.name) {
    throw new Error(`The renderer descriptor is for ${descriptor.package}, not ${manifest.name}.`);
  }
  if (contract.schema !== contractSchema) {
    throw new Error(`${contractPath} is not ${contractSchema}.`);
  }
  /** @param {string} subpath */
  const exported = (subpath) => Object.hasOwn(manifest.exports, subpath);
  /** @param {string} subpath */
  const specifier = (subpath) => subpath === '.' ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
  if (!exported(stylesheetSubpath)) throw new Error(`${manifestPath} does not export ${stylesheetSubpath}.`);
  return Object.freeze({
    packageName: manifest.name,
    manifestPath,
    stylesheet: specifier(stylesheetSubpath),
    bindings: new Map(descriptor.bindings.map((/** @type {{ binding: string, export: string, module: string }} */ binding) => {
      if (!exported(binding.module)) throw new Error(`${binding.binding} imports from ${binding.module}, which ${manifestPath} does not export.`);
      return [binding.binding, { export: binding.export, specifier: specifier(binding.module) }];
    })),
    runtimeSources: new Map(contract.components.map((/** @type {{ slug: string, source: string }} */ component) => [component.slug, component.source])),
  });
}

/**
 * Read the committed declaration reference: the inventory of every export-map entry and each owner's file.
 * Fails when a file is not the schema the inventory promises or belongs to another owner.
 * @param {string} repositoryRoot
 * @returns {DeclarationReference}
 */
export function readDeclarationReference(repositoryRoot) {
  /** @param {string} path */
  const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
  /** @type {DeclarationInventory} */
  const inventory = readJson(`${referenceDirectory}/inventory.json`);
  if (inventory.schema !== inventorySchema) throw new Error(`${referenceDirectory}/inventory.json is not ${inventorySchema}.`);
  return Object.freeze({
    inventory,
    files: new Map(Object.entries(inventory.owners).map(([owner, name]) => {
      const path = `${referenceDirectory}/${name}`;
      /** @type {DeclarationFile} */
      const file = readJson(path);
      if (file.schema !== referenceSchema) throw new Error(`${path} is not ${referenceSchema}.`);
      if (file.owner !== owner) throw new Error(`${path} is for ${file.owner}, not ${owner}.`);
      return [owner, file];
    })),
  });
}

/**
 * The declarations of one component: its export with every part, alternative, ref and member, and the
 * types it reaches. The component is found by the export and entry point the renderer descriptor binds it to.
 * @param {{ artifact: { id: string }, packageFacts: ReactPackageFacts, declarations: DeclarationReference }} input
 * @returns {ComponentDeclarations}
 */
export function componentDeclarations({ artifact, packageFacts, declarations }) {
  const ref = `${artifact.id}#web.react`;
  const exported = packageFacts.bindings.get(ref);
  if (exported === undefined) throw new Error(`The renderer descriptor has no export for ${ref}.`);
  const entryKey = exported.specifier === packageFacts.packageName ? '.' : `.${exported.specifier.slice(packageFacts.packageName.length)}`;
  const entry = declarations.inventory.entries.find(({ key }) => key === entryKey);
  const item = entry !== undefined && 'exports' in entry ? entry.exports.find(({ name }) => name === exported.export) : undefined;
  if (item === undefined) throw new Error(`The declaration reference has no export ${exported.export} from ${entryKey}.`);
  const file = declarations.files.get(item.owner);
  const record = file?.exports.find(({ name, entry: key }) => name === exported.export && key === entryKey);
  if (file === undefined || record === undefined || record.kind !== 'component') {
    throw new Error(`The declaration reference does not hold ${exported.export} from ${entryKey} as a component.`);
  }
  return Object.freeze({
    owner: item.owner,
    source: `${referenceDirectory}/${declarations.inventory.owners[item.owner]}`,
    export: record,
    related: file.exports.filter((candidate) => candidate !== record),
    types: file.types,
    ...(file.values !== undefined && { values: file.values }),
    sources: file.sources,
  });
}

/**
 * The id of a component's own usage guide. Guides are related by this declared
 * id, never by display name. A usage guide whose id names no component, such as
 * `muxui:guide:control-sizing-usage`, is shared guidance and belongs to no family.
 * @param {string} componentId
 */
export function usageGuideId(componentId) {
  return `muxui:guide:${componentId.slice(componentId.lastIndexOf(':') + 1)}-usage`;
}

/**
 * @param {readonly TokenRequirement[]} requirements
 * @returns {{ prefix?: string, tokens: readonly TokenRequirement[] }[]}
 */
function groupTokens(requirements) {
  if (requirements.length <= tokenGroupThreshold) return [{ tokens: requirements }];
  /** @type {Map<string, TokenRequirement[]>} */
  const groups = new Map();
  for (const requirement of requirements) {
    const prefix = requirement.token.split('.').slice(0, 2).join('.');
    groups.set(prefix, [...(groups.get(prefix) ?? []), requirement]);
  }
  return [...groups].map(([prefix, tokens]) => ({ prefix, tokens }));
}

/**
 * The parts of a compound that own Mux UI props, in anatomy order (a compiled record may key
 * them in any order), each with the owner a reader recognises: the export and the member that renders the part.
 * @param {string} exportName
 * @param {Readonly<Record<string, PartApi>> | undefined} partApis
 * @param {readonly string[]} anatomy
 */
function partReferences(exportName, partApis, anatomy) {
  const position = (/** @type {string} */ part) => anatomy.indexOf(part);
  return Object.freeze(Object.entries(partApis ?? {}).sort(([left], [right]) => position(left) - position(right)).map(([part, api]) => Object.freeze({
    part,
    owner: `${exportName}.${api.member}`,
    props: api.props,
    events: api.events,
    defaults: api.defaults,
  })));
}

/**
 * @typedef {import('../packages/react/test/support/styling-reference.mjs').StylingFacts} StylingFacts
 * @typedef {import('../packages/react/test/support/styling-reference.mjs').Observation} Observation
 */

/**
 * @param {{ artifact: ComponentRecord, examples: readonly { source: { content: string } }[], packageFacts: ReactPackageFacts, declarations?: DeclarationReference, stylingFacts?: StylingFacts, observations?: readonly Observation[] }} input
 * `declarations` is opt-in: pass it to receive the component's declarations (`componentDeclarations`) as `declarations`;
 * without it the result is what it was before the declaration reference existed.
 * `stylingFacts` is opt-in too (`readStylingFacts` of the styling reference): pass it to receive the hooks, tokens, override
 * rules and sources of the component in `styling`, beside the four fields `styling` always had. `observations` are server
 * renders of the catalog's examples (support/catalog-example-renders.mjs); without them the observed fields are empty.
 */
export function componentReference({ artifact, examples, packageFacts, declarations, stylingFacts, observations }) {
  const binding = artifact.bindings['web.react'];
  const ref = `${artifact.id}#web.react`;
  const exported = packageFacts.bindings.get(ref);
  if (exported === undefined) throw new Error(`The renderer descriptor has no export for ${ref}.`);
  const slug = artifact.id.slice(artifact.id.lastIndexOf(':') + 1);
  const runtimeSource = packageFacts.runtimeSources.get(slug);
  if (runtimeSource === undefined) throw new Error(`The renderer contract has no runtime source for ${artifact.id}.`);
  const obligations = artifact.accessibility.obligations;
  const bindingObligations = binding.accessibility ?? [];

  return Object.freeze({
    imports: Object.freeze({
      stylesheet: packageFacts.stylesheet,
      component: exported.export,
      specifier: exported.specifier,
      code: `import '${packageFacts.stylesheet}';\nimport { ${exported.export} } from '${exported.specifier}';\n`,
    }),
    usage: Object.freeze({
      useWhen: artifact.intent?.useWhen ?? [],
      avoidWhen: artifact.intent?.avoidWhen ?? [],
    }),
    behavior: binding.behavior ?? [],
    events: binding.api.events,
    /** The API of each part beside the root's, such as ListBox.Item; empty for a component with one part. */
    parts: partReferences(exported.export, binding.api.partApis, artifact.anatomy),
    accessibility: Object.freeze({
      nameRequired: artifact.accessibility.nameRequired,
      obligations,
      /** The React binding's own list, left out when it repeats the component obligations. */
      binding: JSON.stringify(bindingObligations) === JSON.stringify(obligations) ? [] : bindingObligations,
    }),
    styling: Object.freeze({
      anatomy: artifact.anatomy,
      states: artifact.states,
      tokenSource: binding.tokenRecipe.source,
      tokenGroups: groupTokens(binding.tokenRecipe.requirements),
      ...(stylingFacts !== undefined && stylingFor({ slug, artifact, examples, facts: stylingFacts, observations })),
    }),
    ...(declarations !== undefined && { declarations: componentDeclarations({ artifact, packageFacts, declarations }) }),
    sources: [
      { label: 'Component record', paths: [artifact.source.record] },
      { label: 'Examples', paths: examples.map(({ source }) => source.content) },
      { label: 'Runtime', paths: [runtimeSource] },
      { label: 'Package imports', paths: [packageFacts.manifestPath] },
    ],
  });
}
