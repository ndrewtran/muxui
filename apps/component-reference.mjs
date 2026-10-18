import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Component reference facts, projected from one canonical component record.
 *
 * Applications show a component's usage, behavior, accessibility, anatomy,
 * token requirements, imports and sources through this module, never from
 * hand-written per-family text. It carries no prop types or event signatures;
 * Decision 0031 derives those from the React TypeScript source later.
 */

const manifestPath = 'packages/react/package.json';
const descriptorPath = 'packages/react/generated/descriptor.json';
const supplementalPath = 'catalog/react-r1-6/supplemental-components.json';
const supplementalSchema = 'muxui-react-r1-6-supplemental-components-v2';
const stylesheetSubpath = './styles.css';
/** More token requirements than this are grouped by their first two path segments. */
const tokenGroupThreshold = 8;

/**
 * @typedef {object} TokenRequirement
 * @property {string} token
 * @property {string} requirement
 * @property {readonly string[]} [profiles]
 */

/**
 * @typedef {object} ReactBindingRecord
 * @property {{ events: readonly string[] }} api
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
 * @typedef {object} ReactPackageFacts
 * @property {string} packageName
 * @property {string} manifestPath The package manifest the import specifiers are verified against.
 * @property {string} stylesheet The import specifier of the package stylesheet.
 * @property {ReadonlyMap<string, { export: string, specifier: string }>} bindings By binding ref, such as `muxui:component:button#web.react`.
 * @property {ReadonlyMap<string, string>} runtimeSources The declared runtime file of each supplemental family, by slug.
 */

/**
 * Read the React package facts imports and sources need: the renderer descriptor
 * (generated), the package manifest, and the supplemental mapping. Fails when
 * the three disagree.
 * @param {string} repositoryRoot
 * @returns {ReactPackageFacts}
 */
export function readReactPackageFacts(repositoryRoot) {
  /** @param {string} path */
  const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
  const manifest = readJson(manifestPath);
  const descriptor = readJson(descriptorPath);
  const supplemental = readJson(supplementalPath);
  if (descriptor.package !== manifest.name) {
    throw new Error(`The renderer descriptor is for ${descriptor.package}, not ${manifest.name}.`);
  }
  if (supplemental.schema !== supplementalSchema) {
    throw new Error(`${supplementalPath} is not ${supplementalSchema}.`);
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
    runtimeSources: new Map(supplemental.components.map((/** @type {{ slug: string, runtimeSource: string }} */ component) => [component.slug, component.runtimeSource])),
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
 * @param {{ artifact: ComponentRecord, examples: readonly { source: { content: string } }[], packageFacts: ReactPackageFacts }} input
 */
export function componentReference({ artifact, examples, packageFacts }) {
  const binding = artifact.bindings['web.react'];
  const ref = `${artifact.id}#web.react`;
  const exported = packageFacts.bindings.get(ref);
  if (exported === undefined) throw new Error(`The renderer descriptor has no export for ${ref}.`);
  const slug = artifact.id.slice(artifact.id.lastIndexOf(':') + 1);
  const runtimeSource = packageFacts.runtimeSources.get(slug);
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
    }),
    sources: [
      { label: 'Component record', paths: [artifact.source.record] },
      { label: 'Examples', paths: examples.map(({ source }) => source.content) },
      ...(runtimeSource === undefined ? [] : [{ label: 'Runtime', paths: [runtimeSource] }]),
      { label: 'Package imports', paths: [packageFacts.manifestPath] },
    ],
  });
}
