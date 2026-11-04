// The version effect each version unit needs between a prior release and the current sources (`E-P2.1-04`), and the
// checks that a release proposes versions carrying it. Architecture "Version units and compatibility" owns the change
// table; this module applies it and reuses the authoring semantic diff (component, pattern, and example records) and
// `schema-evolution.json` (schema documents) rather than classifying changes a second way.
//
// Governing principle (root decision): under-classifying a change is a defect, and over-classifying is safe. The precise
// rules are few: the authoring semantic diff's field-ownership effects for component, pattern, and example records, a new
// artifact (minor), an editorial-only record field (patch), a token value-only edit (patch), a schema annotation (patch)
// or optional property (minor), and a renderer change confined to its implementation (patch). Every other change is
// `major` for the units it can affect, and `reasons` says why: a schema edit outside those, a token field outside the
// contract and data fields, a guide's wording, a capability edit, a platform-safety contract change, a binding spec
// revision no record change explains, and a prior record the current schema rejects (Decision 0016: no old-format reader).
//
// Units: the catalog (its package version is `catalogVersion`), each renderer package, and the schema, query API, and
// token contract versions. The schema and tooling packages are not units (Decision 0032 item 7): they publish when the
// contract or implementation they ship changed.
//
// Prerelease rule (root decision; Decision 0023 keeps React's `0.1.0-rc.N` sequence and Decision 0016 removes
// compatibility obligations before a stable release, so the change table binds only a release of a supported contract):
// a unit is judged against its last stable (non-prerelease) release `S`. A proposed version `P` with base `B` (`X.Y.Z`
// without its prerelease tag) must have `bump(S to B)` cover the effect of the change; an rc of `S`'s own base covers
// nothing. With no stable release, the unit's first base admits any change, because its rc series is a prerelease of a
// version never released. Versions strictly increase per package (the next rc, or a higher base): a repeated or lower
// version is rejected, and a unit whose effect is `none` is not released at all. Before 1.0 the leftmost nonzero part is
// the breaking one, so a minor bump claims `major` and a patch bump claims `minor`, matching the `^0.1.0-0` range a
// catalog derives for `@muxui/react`. A bump larger than required is accepted. `S` is the prior manifest's version when
// that is stable, or the `stable` map a caller passes for a unit whose prior release is an rc.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve, sep } from 'node:path';
import {
  SchemaValidationError,
  bindingSpecRevision,
  classifySchemaChange,
  compilePlatformSafetyRequirementSets,
  mergeDerivedApis,
} from '@muxui/schema';
import { compileTokenRequirementSet } from '@muxui/tokens';
import { semanticDiff } from '@muxui/tooling/authoring';
import { canonicalJson } from './canonical-json.mjs';
import { PORTFOLIO_SCHEMA, caretAllows, readIndexedArtifact, readRetainedManifests, releaseIdFor, sha256 } from './release-manifest.mjs';
import { releaseVersions, reusedNames } from './release-set.mjs';

const SCHEMA_PACKAGE = '@muxui/schema';
const CATALOG_PACKAGE = '@muxui/catalog';
const TOOLING_PACKAGE = '@muxui/tooling';
/** The package that renders each binding id; a binding without an entry here has no published renderer. */
export const RENDERER_PACKAGES = Object.freeze({ 'web.react': '@muxui/react' });
/** The three packages new in P2.1; each publishes only prereleases (Decision 0032 item 6). */
export const NEW_PACKAGES = Object.freeze([SCHEMA_PACKAGE, CATALOG_PACKAGE, TOOLING_PACKAGE]);
/** The schema documents that define query responses; the others define source records. */
const QUERY_API_DOCUMENTS = new Set(['query-envelope.schema.json', 'section-page.schema.json', 'token-section-page-budget-profile.schema.json']);
/**
 * What a package ships is what its manifest says: the `files` entries and the targets of `publishConfig.exports` and
 * `bin`, less `README.md`, plus the manifest itself (less version, scripts, and devDependencies). These tracked sources
 * also change what it ships, because the generator reads them to write its untracked `generated` files.
 */
export const GENERATION_INPUTS = Object.freeze({
  [SCHEMA_PACKAGE]: ['packages/schema/schemas', 'packages/schema/src'],
  [CATALOG_PACKAGE]: ['packages/catalog/src', 'packages/catalog/token-section-page-budget-profile.json'],
  [TOOLING_PACKAGE]: ['packages/tooling/command-registry.json', 'packages/tooling/src/generate.mjs'],
  '@muxui/react': ['packages/react/src', 'packages/react/build', 'packages/react/api', 'packages/react/types', 'packages/react/tsconfig.build.json'],
});
const SOURCE_PATHS = ['catalog', 'packages/catalog/catalog-sources.json', 'packages/react/api', 'packages/schema/schemas', 'packages/schema/src/index.mjs', 'strategy/platform-safety-contract.json'];
/** The environment a release gives `resolvePriorRelease`: a prior manifest path, or the flag that this is the first release. */
export const PRIOR_RELEASE_VARIABLE = 'MUXUI_PRIOR_RELEASE_MANIFEST';
export const FIRST_RELEASE_VARIABLE = 'MUXUI_FIRST_PORTFOLIO_RELEASE';

export const EFFECTS = Object.freeze(['none', 'patch', 'minor', 'major']);
const rank = (effect) => EFFECTS.indexOf(effect);
const maxEffect = (...effects) => effects.reduce((best, effect) => (rank(effect) > rank(best) ? effect : best), 'none');

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const union = (...maps) => [...new Set(maps.flatMap((map) => Object.keys(map ?? {})))];
/** A source the current rules reject (schema, token recipe, platform-safety declaration): it cannot be compared. */
const isSourceError = (error) => error instanceof SchemaValidationError || /^MUXUI_/u.test(String(error?.code ?? error?.message ?? ''));

// ---------------------------------------------------------------------------------------------------------------------
// Versions

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u.exec(version ?? '');
  if (!match) fail('P2_1_VERSION_UNSUPPORTED', `${JSON.stringify(version)} is not a semantic version`);
  return { core: match.slice(1, 4).map(Number), pre: match[4] };
}

/** The effect a move from the stable release `stable` to `next` claims, by base version (see the prerelease rule above). */
export function movedEffect(stable, next) {
  const from = parseVersion(stable);
  const to = parseVersion(next);
  const level = from.core.findIndex((part, index) => part !== to.core[index]);
  if (level === -1) return 'none';
  if (to.core[level] < from.core[level]) fail('P2_1_VERSION_NOT_AHEAD', `${next} is behind ${stable}`);
  // Before 1.0 a minor bump is the breaking one and a patch bump the compatible one.
  const shift = from.core[0] === 0 && level > 0 ? 1 : 0;
  return ['major', 'minor', 'patch'][level - shift];
}

/** Orders two versions as node-semver does: a prerelease sorts below its release, and `rc.N` by N. */
export function compareVersions(left, right) {
  const [a, b] = [parseVersion(left), parseVersion(right)];
  const level = a.core.findIndex((part, index) => part !== b.core[index]);
  if (level !== -1) return Math.sign(a.core[level] - b.core[level]);
  if (a.pre === b.pre) return 0;
  if (a.pre === undefined || b.pre === undefined) return a.pre === undefined ? 1 : -1;
  const [x, y] = [a.pre, b.pre].map((pre) => /^rc\.(\d+)$/u.exec(pre)?.[1]);
  return x !== undefined && y !== undefined ? Math.sign(Number(x) - Number(y)) : Math.sign(a.pre.localeCompare(b.pre));
}

// ---------------------------------------------------------------------------------------------------------------------
// Schema documents

const ANNOTATIONS = new Set(['description', 'title', '$comment', 'examples', 'x-muxui-authoring']);
/** Inside these the polarity of a constraint is not tracked (`not` inverts it); a schema they reach by `$ref` is judged the same. */
const COMBINATORS = new Set(['not', 'anyOf', 'oneOf', 'allOf', 'if', 'then', 'else']);

/**
 * The `schema-evolution.json` change types between two versions of a JSON Schema node. Only three edits have a precise
 * rule: an annotation (patch) and an optional property added under `properties` (minor). A required property, a removed
 * one, and any `required` change are major, an edit inside a property, `items`, or a definition recurses, and every other
 * difference (`patternProperties`, `additionalProperties`, `propertyNames`, `dependentSchemas`, a constraint keyword, a
 * combinator, a new or removed definition) counts as a changed interpretation, so an edit with no rule is never below major.
 */
function schemaChangeTypes(before, after, out = []) {
  for (const key of union(before, after)) {
    const left = before[key];
    const right = after[key];
    if (same(left, right)) continue;
    if (ANNOTATIONS.has(key)) {
      out.push('description-or-annotation');
    } else if (key === 'properties' && isObject(left) && isObject(right)) {
      for (const name of union(left, right)) {
        if (left[name] === undefined) out.push(after.required?.includes(name) ? 'required-field' : 'optional-stable-field');
        else if (right[name] === undefined) out.push('field-removal');
        else if (isObject(left[name]) && isObject(right[name])) schemaChangeTypes(left[name], right[name], out);
        else out.push('changed-interpretation');
      }
    } else if ((key === '$defs' || key === 'definitions') && isObject(left) && isObject(right)) {
      for (const name of union(left, right)) {
        if (isObject(left[name]) && isObject(right[name])) schemaChangeTypes(left[name], right[name], out);
        else out.push('changed-interpretation');
      }
    } else if (key === 'items' && isObject(left) && isObject(right)) {
      schemaChangeTypes(left, right, out);
    } else if (key === 'required') {
      out.push('required-field');
    } else {
      out.push('changed-interpretation');
    }
  }
  return out;
}

/**
 * The schemas a logical combinator reaches through `$ref`, as `document#name` (`document#` for a whole document): their
 * polarity is not tracked either, whether the reference is direct or through another schema.
 */
function combinatorReach(documents) {
  const keyOf = (document, ref) => {
    const [file, pointer = ''] = ref.split('#');
    return `${file === '' ? document : file}#${/^\/(?:\$defs|definitions)\/([^/]+)/u.exec(pointer)?.[1] ?? ''}`;
  };
  const refsIn = (node, document, inside, found) => {
    if (Array.isArray(node)) {
      for (const item of node) refsIn(item, document, inside, found);
    } else if (isObject(node)) {
      if (inside && typeof node.$ref === 'string') found.add(keyOf(document, node.$ref));
      for (const [key, child] of Object.entries(node)) refsIn(child, document, inside || COMBINATORS.has(key), found);
    }
  };
  const pending = new Set();
  for (const [document, schema] of Object.entries(documents)) refsIn(schema, document, false, pending);
  const reached = new Set();
  for (const key of pending) {
    if (reached.has(key)) continue;
    reached.add(key);
    const [document, name] = key.split('#');
    const root = documents[document];
    const found = new Set();
    refsIn(name === '' ? root : root?.$defs?.[name] ?? root?.definitions?.[name], document, true, found);
    for (const next of found) pending.add(next);
  }
  return reached;
}

const VERSION_MARKER = /^(?:apiVersion|queryApiVersion|schemaVersion)$/u;
const MARKER_PLACEHOLDER = '<own version>';

/**
 * The document with its unit's own version markers (a `*Version` property pinned to the unit's version by `const` or
 * a one-value `enum`, equal to its side's version) replaced by a placeholder, so raising the version does not read as a
 * breaking enum change. `found` collects every `*Version` pin so a stale marker can be reported.
 */
function withoutVersionMarkers(document, ownVersions, found) {
  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (!isObject(node)) return node;
    return Object.fromEntries(Object.entries(node).map(([key, child]) => {
      if (key !== 'properties' || !isObject(child)) return [key, walk(child)];
      return [key, Object.fromEntries(Object.entries(child).map(([name, schema]) => {
        const value = isObject(schema) && VERSION_MARKER.test(name) ? schema.const ?? (schema.enum?.length === 1 ? schema.enum[0] : undefined) : undefined;
        if (typeof value !== 'string') return [name, walk(schema)];
        found.push({ name, value });
        if (!ownVersions.has(value)) return [name, walk(schema)];
        return [name, schema.const === undefined ? { ...schema, enum: [MARKER_PLACEHOLDER] } : { ...schema, const: MARKER_PLACEHOLDER }];
      }))];
    }));
  };
  return walk(document);
}

const changeTypesEffect = (types) => maxEffect(...types.map((type) => classifySchemaChange(type).versionEffect));

/**
 * The schema and query API effects: the documents that define query responses, and those that define source records.
 * A query document's own version markers are set aside and held to the proposed version instead (`problems`).
 */
function classifySchemaDocuments(prior, current) {
  const effects = { schema: 'none', queryApi: 'none' };
  const reasons = [];
  const problems = [];
  const own = (side) => new Set([side.contracts?.queryApiVersion, side.contracts?.querySchemaVersion].filter(Boolean));
  const documents = [prior.schemas ?? {}, current.schemas ?? {}];
  const reach = new Set([...combinatorReach(documents[0]), ...combinatorReach(documents[1])]);
  for (const name of union(...documents).sort()) {
    const [before, after] = documents.map((set, index) => {
      if (set[name] === undefined || !QUERY_API_DOCUMENTS.has(name)) return set[name];
      const found = [];
      const normalized = withoutVersionMarkers(set[name], own(index === 0 ? prior : current), found);
      // A marker still pinned to the prior version after the unit's version moved was not raised with it.
      if (index === 1) {
        for (const { name: marker, value } of found) {
          if (own(prior).has(value) && !own(current).has(value)) problems.push(`${name} still pins ${marker} to ${value}, but the proposed query API version is ${[...own(current)].join(' / ') || 'undeclared'}`);
        }
      }
      return normalized;
    });
    const types = before === undefined ? ['capability-gated-kind']
      : after === undefined ? ['field-removal']
        : schemaChangeTypes(before, after);
    // A schema a combinator reaches by `$ref` is judged as if inside it.
    for (const group of ['$defs', 'definitions']) {
      for (const def of union(before?.[group], after?.[group])) if (reach.has(`${name}#${def}`) && !same(before?.[group]?.[def], after?.[group]?.[def])) types.push('changed-interpretation');
    }
    if (reach.has(`${name}#`) && types.length > 0) types.push('changed-interpretation');
    const effect = changeTypesEffect(types);
    const unit = QUERY_API_DOCUMENTS.has(name) ? 'queryApi' : 'schema';
    effects[unit] = maxEffect(effects[unit], effect);
    if (effect !== 'none') reasons.push(`${unit} ${effect}: ${name} (${[...new Set(types)].join(', ')})`);
  }
  // A source record schema is reachable from a response (a `get` returns records), so any schema change moves the query API
  // at least as far.
  if (rank(effects.schema) > rank(effects.queryApi)) {
    effects.queryApi = effects.schema;
    reasons.push(`queryApi ${effects.schema}: a source schema changed and responses carry its records`);
  }
  return { ...effects, reasons, problems };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokens

/** The catalog source family of a token source. */
const TOKEN_FAMILY = 'token-source';
/**
 * The fields that carry a token's value in the default theme: editing only them is patch. Every other entry field (layer,
 * type, unit, meaning, alias, override policy, platform restrictions, equivalence) is the contract, and an unknown one has
 * no rule: all are major.
 */
const TOKEN_DATA_FIELDS = new Set(['value', 'fluid', 'formula', 'relative', 'mix', 'modes']);
/** The artifact's editorial fields; extensions are inert (Architecture "Schema evolution and extensions"). */
const TOKEN_EDITORIAL_FIELDS = new Set(['name', 'summary', 'extensions']);

/**
 * The token contract effect. A token source that is new is minor, a removed one is major. Within one, a value-only edit
 * and an editorial field are patch. Everything else is major for want of a rule: a token added or removed (a theme may
 * have to assign it), a changed contract field, a mode axis, any theme field, lifecycle, or an unknown field.
 * `tokenContractVersion` itself is the answer, not an input.
 */
function classifyTokens(prior, current) {
  const entries = new Map();
  const why = new Map();
  let effect = 'none';
  const raise = (name, next, because) => {
    entries.set(name, maxEffect(entries.get(name) ?? 'none', next));
    effect = maxEffect(effect, next);
    if (because && next === effect) why.set(name, because);
  };
  const priorById = new Map(prior.map(({ record }) => [record.id, record]));
  const currentById = new Map(current.map(({ record }) => [record.id, record]));
  for (const id of new Set([...priorById.keys(), ...currentById.keys()])) {
    const before = priorById.get(id);
    const after = currentById.get(id);
    if (before === undefined || after === undefined) {
      raise(id, before === undefined ? 'minor' : 'major');
      continue;
    }
    for (const name of union(before.tokens, after.tokens)) {
      const [left, right] = [before.tokens[name], after.tokens[name]];
      if (same(left, right)) continue;
      if (left === undefined || right === undefined) {
        raise(name, 'major', left === undefined ? 'added' : 'removed');
      } else {
        const contract = union(left, right).filter((field) => !same(left[field], right[field]) && !TOKEN_DATA_FIELDS.has(field));
        raise(name, contract.length > 0 ? 'major' : 'patch', contract.join(', '));
      }
    }
    for (const field of union(before.theme, after.theme)) {
      if (!same(before.theme?.[field], after.theme?.[field])) raise(`${id}#theme.${field}`, 'major', 'no rule for the theme');
    }
    for (const field of union(before, after)) {
      if (['tokens', 'theme', 'tokenContractVersion'].includes(field) || same(before[field], after[field])) continue;
      raise(`${id}#${field}`, TOKEN_EDITORIAL_FIELDS.has(field) ? 'patch' : 'major', 'no rule for this token source field');
    }
  }
  return { effect, entries, why };
}

// ---------------------------------------------------------------------------------------------------------------------
// Guides and capabilities

/** Editorial fields are patch (a guide's `source` is the path of its content); every other field has no rule and is major. */
const GUIDE_FIELDS = new Set(['name', 'summary', 'keywords', 'source']);
const CAPABILITY_FIELDS = new Set(['name', 'summary']);
/** A guide's content with whitespace and punctuation removed: a change to what is left is a change to what it says. */
const wording = (text = '') => text.replace(/[\s\p{P}]+/gu, '');

/**
 * The effect of an edit to a guide or capability record: an editorial field is patch and any other field is major. A
 * guide's content follows the same line: an edit of whitespace or punctuation alone is patch, and any other edit,
 * whatever its headings, is major.
 */
function classifyAuthoredRecord(before, after, editorial) {
  const found = [];
  for (const field of union(before.record, after.record)) {
    if (!same(before.record[field], after.record[field])) found.push([editorial.has(field) ? 'patch' : 'major', editorial.has(field) ? field : `${field} (no rule)`]);
  }
  if (before.source !== after.source) {
    found.push(wording(before.source) === wording(after.source) ? ['patch', 'whitespace or punctuation'] : ['major', 'content changed']);
  }
  return { effect: maxEffect(...found.map(([effect]) => effect)), because: found.map(([effect, what]) => `${what} (${effect})`).join(', ') };
}

// ---------------------------------------------------------------------------------------------------------------------
// The catalog and its renderers

// A semantic diff effect as a version effect, through the same table the diff uses for a record.
const FIELD_CHANGE_TYPES = { editorial: 'description-or-annotation', compatible: 'optional-stable-field', incompatible: 'required-field' };
const fieldEffect = (effect) => classifySchemaChange(FIELD_CHANGE_TYPES[effect]).versionEffect;

/** What one side's records give a revision: every example with its source, and every token source. */
function contextOf(side) {
  const examples = side.records.filter(({ family }) => family === 'example');
  return {
    examples: examples.map(({ record }) => record),
    exampleSources: Object.fromEntries(examples.map(({ record, source }) => [record.id, source])),
    tokenSources: side.records.filter(({ family }) => family === TOKEN_FAMILY).map(({ record }) => record),
  };
}

const supportedBindings = (record) => Object.entries(record.bindings ?? {}).filter(([, binding]) => binding.strategy !== 'unsupported').map(([id]) => id);

// The profiles a binding resolves requirement sets for, as the catalog compiler chooses them.
function bindingProfiles(bindingId, binding) {
  if (bindingId !== 'native.react-native') return [bindingId];
  return Object.values(binding.runtimeProfiles ?? {}).filter(({ strategy }) => strategy !== 'unsupported').map(({ validationProfile }) => validationProfile).sort();
}

/**
 * The binding spec revision of each supported binding of a component, as the catalog compiler computes it: with the
 * resolved token and platform-safety requirement sets, from the given examples, token sources, and platform-safety
 * contract. Passing each from a different side attributes a changed revision to the input that moved it.
 */
function specRevisions({ record, derivedApis }, { examples, exampleSources, tokenSources, platformSafetyContract }) {
  const component = mergeDerivedApis(record, derivedApis ?? {});
  const own = examples.filter((example) => example.binding?.ref?.startsWith(`${record.id}#`));
  return Object.fromEntries(supportedBindings(component).map((bindingId) => {
    const binding = component.bindings[bindingId];
    const source = tokenSources.find(({ id }) => id === binding.tokenRecipe.source);
    return [bindingId, bindingSpecRevision({
      component,
      bindingId,
      examples: own,
      exampleSources,
      tokenSources,
      tokenRequirementSets: source === undefined ? [] : bindingProfiles(bindingId, binding)
        .map((profile) => compileTokenRequirementSet({ source, recipe: binding.tokenRecipe, bindingId, profile })),
      platformSafetyRequirementSets: platformSafetyContract === undefined ? []
        : Object.values(compilePlatformSafetyRequirementSets({ contract: platformSafetyContract, bindingId, binding, owner: record.id })),
    })];
  }));
}

/** A revision of any kind moved: the artifact's content changed, so the catalog moves by a patch at least. */
const revisionMoved = (diff) => diff.revisions?.contentRevision?.changed === true
  || diff.revisions?.patternRevision?.changed === true
  || Object.values(diff.revisions?.bindings ?? {}).some(({ bindingContentRevision, bindingSpecRevision: spec }) => bindingContentRevision.changed || spec.changed);

/**
 * The version effect each unit needs for the change from `prior` to `current` (both source sides, see `readSourceSide`),
 * the packages that must publish for it, in publish order, and `problems` in what the sources themselves declare. A
 * `null` prior is the first portfolio release. `renderers` maps a binding id to the package that renders it.
 */
export function classifyReleaseEffects({ prior, current, packageNames, renderers = RENDERER_PACKAGES }) {
  if (prior === null) return { first: true, units: null, publish: [...packageNames], reasons: ['first portfolio release: there is no prior release to compare'], problems: [] };
  const reasons = [];
  const rendererUnits = Object.fromEntries([...new Set(Object.values(renderers))].map((name) => [name, 'none']));
  const raiseRenderer = (bindingId, effect, because) => {
    const name = renderers[bindingId];
    if (name === undefined || rank(effect) <= rank(rendererUnits[name])) return;
    rendererUnits[name] = effect;
    reasons.push(`${name} ${effect}: ${because}`);
  };
  let catalog = 'none';
  const raiseCatalog = (effect, because) => {
    if (rank(effect) <= rank(catalog)) return;
    catalog = effect;
    reasons.push(`catalog ${effect}: ${because}`);
  };

  const documents = classifySchemaDocuments(prior, current);
  reasons.push(...documents.reasons);
  const familyRecords = (side, family) => side.records.filter((entry) => entry.family === family);
  const tokens = classifyTokens(familyRecords(prior, TOKEN_FAMILY), familyRecords(current, TOKEN_FAMILY));
  const tokenSourcesChanged = !same(familyRecords(prior, TOKEN_FAMILY).map(({ record }) => record), familyRecords(current, TOKEN_FAMILY).map(({ record }) => record));
  if (tokens.effect !== 'none') {
    reasons.push(`tokenContract ${tokens.effect}: ${[...tokens.entries].filter(([, effect]) => effect === tokens.effect).map(([name]) => `${name}${tokens.why.has(name) ? ` [${tokens.why.get(name)}]` : ''}`).join(', ')}`);
  }
  // The catalog bundle embeds the schema, query API, token sources, and platform-safety contract, and renderer
  // stylesheets are generated from the tokens.
  raiseCatalog(maxEffect(documents.schema, documents.queryApi, tokens.effect), 'its bundle embeds the schema, query API, and token contract');
  // A renderer ships every token (its stylesheets are generated from the token sources), so a token change reaches it whether
  // a recipe requires the token, falls back to it, or reaches it through an alias.
  for (const bindingId of Object.keys(renderers)) raiseRenderer(bindingId, tokens.effect, 'its stylesheets are generated from the token sources');
  const safetyContractChanged = !same(prior.platformSafetyContract, current.platformSafetyContract);
  if (safetyContractChanged) raiseCatalog('major', 'the platform-safety contract changed (its digest is in every requirement set)');

  const priorContext = contextOf(prior);
  const currentContext = contextOf(current);
  const priorById = new Map(prior.records.map((entry) => [entry.record.id, entry]));
  const currentById = new Map(current.records.map((entry) => [entry.record.id, entry]));
  // A pair's semantic diff reads the current side's sources, with each side's own derived APIs and example sources.
  const diffOf = (before, after) => semanticDiff({
    family: after.family,
    before: before.record,
    after: after.record,
    revisionContext: { ...currentContext, before: { ...priorContext, derivedApis: before.derivedApis ?? {} }, after: { ...currentContext, derivedApis: after.derivedApis ?? {} } },
  });
  // Decision 0016: there is no old-format reader, so a prior record the current rules reject cannot be compared. It
  // changed incompatibly, and every renderer binding of it with it.
  const compare = (id, before, after, compareRecords) => {
    try {
      compareRecords();
    } catch (error) {
      if (!isSourceError(error)) throw error;
      raiseCatalog('major', `${id} cannot be compared (${error.message.slice(0, 160)})`);
      for (const bindingId of Object.keys(renderers)) {
        if ([before, after].some(({ record }) => supportedBindings(record).includes(bindingId))) raiseRenderer(bindingId, 'major', `${id}#${bindingId} cannot be compared`);
      }
    }
  };
  const describe = (diff) => diff.changes.map(({ path, operation }) => `${path} (${operation})`).join(', ') || 'revision context';
  const changedExamples = new Set();
  for (const id of [...new Set([...priorById.keys(), ...currentById.keys()])].sort()) {
    const before = priorById.get(id);
    const after = currentById.get(id);
    const { family } = before ?? after;
    if (family === TOKEN_FAMILY || (before !== undefined && after !== undefined && same(before, after))) continue;
    if (family === 'example') changedExamples.add((after ?? before).record.binding?.ref?.split('#')[0]);
    if (before === undefined || after === undefined) {
      const added = before === undefined;
      raiseCatalog(added ? 'minor' : 'major', `${id} ${added ? 'added' : 'removed'}`);
      if (family === 'component') {
        for (const bindingId of supportedBindings((added ? after : before).record)) raiseRenderer(bindingId, added ? 'minor' : 'major', `${id}#${bindingId} ${added ? 'added' : 'removed'}`);
      }
    } else if (family === 'guide' || family === 'capability') {
      const { effect, because } = classifyAuthoredRecord(before, after, family === 'guide' ? GUIDE_FIELDS : CAPABILITY_FIELDS);
      raiseCatalog(effect, `${id} ${because}`);
    } else if (family !== 'component') {
      compare(id, before, after, () => {
        const diff = diffOf(before, after);
        raiseCatalog(maxEffect(diff.versionEffect, revisionMoved(diff) ? 'patch' : 'none'), `${id} ${describe(diff)}`);
      });
    }
  }
  // A component's binding spec revision folds its record, derived API, normative examples, and the token and
  // platform-safety requirement sets, so it moves for a changed example, token source, or platform-safety contract even
  // when the record itself did not change. Each is attributed by recomputing the prior revision with that input alone
  // from the current side; a revision no classified input explains is major.
  const attempt = (compute) => {
    try {
      return compute();
    } catch (error) {
      if (!isSourceError(error)) throw error;
      return undefined;
    }
  };
  for (const [id, after] of currentById) {
    const before = priorById.get(id);
    if (after.family !== 'component' || before === undefined) continue;
    const recordChanged = !same(before, after);
    if (!recordChanged && !changedExamples.has(id) && !tokenSourcesChanged && !safetyContractChanged) continue;
    compare(id, before, after, () => {
      const diff = recordChanged ? diffOf(before, after) : { versionEffect: 'none', changes: [] };
      raiseCatalog(maxEffect(diff.versionEffect, revisionMoved(diff) ? 'patch' : 'none'), `${id} ${describe(diff)}`);
      const specs = (entry, { examples = priorContext, tokens: tokenContext = priorContext, safety = prior } = {}) => specRevisions(entry, {
        examples: examples.examples,
        exampleSources: examples.exampleSources,
        tokenSources: tokenContext.tokenSources,
        platformSafetyContract: safety.platformSafetyContract,
      });
      const baseline = specs(before);
      const target = specs(after, { examples: currentContext, tokens: currentContext, safety: current });
      const moved = Object.keys(renderers).filter((bindingId) => baseline[bindingId] !== target[bindingId]);
      const alone = moved.length === 0 ? {} : {
        examples: attempt(() => specs(before, { examples: currentContext })),
        tokens: attempt(() => specs(before, { tokens: currentContext })),
        safety: attempt(() => specs(before, { safety: current })),
      };
      for (const bindingId of Object.keys(renderers)) {
        const ownChange = (path) => !path.startsWith('$/bindings/') || path === `$/bindings/${bindingId}` || path.startsWith(`$/bindings/${bindingId}/`);
        const fields = diff.changes.filter(({ path, revisionAxes }) => revisionAxes.includes('binding-spec') && ownChange(path)).map(({ effect }) => fieldEffect(effect));
        const causes = [];
        if (moved.includes(bindingId)) {
          if (fields.length > 0) causes.push(...fields);
          if (alone.examples?.[bindingId] !== baseline[bindingId]) causes.push('patch');
          if (alone.tokens?.[bindingId] !== baseline[bindingId]) causes.push('patch');
          if (alone.safety?.[bindingId] !== baseline[bindingId]) {
            causes.push('major');
            raiseCatalog('major', `${id}#${bindingId} platform-safety requirement set changed with no record change`);
          }
          if (causes.length === 0) {
            causes.push('major');
            raiseCatalog('major', `${id}#${bindingId} binding spec revision changed for no classified reason`);
          }
        }
        raiseRenderer(bindingId, maxEffect(...causes), `${id}#${bindingId} binding spec revision`);
      }
    });
  }

  const implementationChanged = (name) => !same(prior.implementation?.[name], current.implementation?.[name]);
  for (const name of packageNames) {
    if (!implementationChanged(name)) continue;
    if (name === CATALOG_PACKAGE) raiseCatalog('patch', 'its shipped sources changed');
    for (const [bindingId, owner] of Object.entries(renderers)) if (owner === name) raiseRenderer(bindingId, 'patch', 'its shipped implementation changed');
  }
  const units = { catalog, tokenContract: tokens.effect, schema: documents.schema, queryApi: documents.queryApi, renderers: rendererUnits };
  const publish = packageNames.filter((name) => {
    if (name === SCHEMA_PACKAGE) return units.schema !== 'none' || units.queryApi !== 'none' || implementationChanged(name);
    if (name === CATALOG_PACKAGE) return catalog !== 'none';
    if (name === TOOLING_PACKAGE) return units.queryApi !== 'none' || implementationChanged(name);
    if (rendererUnits[name] === undefined) fail('P2_1_PACKAGE_UNCLASSIFIED', `${name} is neither a known package nor a renderer`);
    return rendererUnits[name] !== 'none';
  });
  return { first: false, units, publish, reasons, problems: documents.problems };
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking proposed versions

const PORTFOLIO_SCHEMA_PREFIX = 'muxui-portfolio-release-';

/**
 * Problems (strings) in a prior portfolio manifest, judged against the publish set it must inventory in full: the
 * schema (an unknown portfolio version is refused), the source commit, the digest and release id recomputed from its
 * content, every package once and in order with a valid version, valid contract versions, and exactly the publish set's
 * runtime edges, each with a range that admits the recorded version of its target.
 */
export function findPriorManifestProblems(manifest, publishSet) {
  if (manifest?.schema !== PORTFOLIO_SCHEMA) {
    return [typeof manifest?.schema === 'string' && manifest.schema.startsWith(PORTFOLIO_SCHEMA_PREFIX)
      ? `${manifest.schema} is an unknown portfolio release schema version (this tool reads ${PORTFOLIO_SCHEMA})`
      : `it is not a ${PORTFOLIO_SCHEMA} document`];
  }
  const packageNames = publishSet.packages.map(({ name }) => name);
  const problems = [];
  const versionProblem = (version) => {
    try {
      parseVersion(version);
      return null;
    } catch {
      return `${JSON.stringify(version)} is not a semantic version`;
    }
  };
  if (!/^[0-9a-f]{40}$/u.test(manifest.source?.revision ?? '')) problems.push('it records no source commit');
  const { digest, preparation: _preparation, ...body } = manifest;
  if (digest !== sha256(canonicalJson(body))) problems.push('its digest does not match its content');
  const records = Array.isArray(manifest.packages) ? manifest.packages : [];
  if (!same(records.map(({ name }) => name), packageNames)) problems.push(`it lists ${records.map(({ name }) => name).join(', ') || 'no packages'}, not the publish set ${packageNames.join(', ')} in order`);
  for (const { name, version, role } of records) {
    const bad = versionProblem(version);
    if (bad) problems.push(`${name}: ${bad}`);
    if (!['published', 'reused'].includes(role)) problems.push(`${name} has role ${JSON.stringify(role)}`);
  }
  for (const key of ['schemaVersion', 'queryApiVersion', 'tokenContractVersion']) {
    const bad = versionProblem(manifest.contracts?.[key]);
    if (bad) problems.push(`contracts.${key}: ${bad}`);
  }
  if (problems.length === 0 && manifest.id !== releaseIdFor({ revision: manifest.source.revision, published: records.filter(({ role }) => role === 'published') })) {
    problems.push('its release id does not name its commit and published versions');
  }
  const recorded = new Map(records.map(({ name, version }) => [name, version]));
  const edges = Array.isArray(manifest.compatibility?.edges) ? manifest.compatibility.edges : [];
  const expected = publishSet.packages.flatMap(({ name, runtimeEdges }) => runtimeEdges.map((to) => `${name} > ${to}`));
  const actual = edges.map((edge) => `${edge?.from} > ${edge?.to}`);
  if (!same([...actual].sort(), [...expected].sort())) problems.push(`its edges are ${actual.join(', ') || 'none'}, not the publish set's runtime edges ${expected.join(', ')}`);
  for (const edge of edges) {
    if (!recorded.has(edge?.from) || !recorded.has(edge?.to)) continue;
    if (edge.version !== recorded.get(edge.to)) problems.push(`the edge ${edge.from} to ${edge.to} records ${edge.version}, not ${recorded.get(edge.to)}`);
    else if (!caretAllows(edge.range, edge.version)) problems.push(`${edge.from} requires ${edge.to}@${edge.range}, which does not admit ${edge.version}`);
  }
  return problems;
}

/**
 * Problems (`{ code, detail }`) in the versions a release proposes against the effects the change requires. `versions`
 * maps each package of `publishSet` to its proposed version, and a package the release reuses proposes the prior release's
 * version (so reusing an unchanged package is no change, and reusing a changed one is refused as a repeated version);
 * `contracts` holds the current source's contract versions; both are compared with `priorManifest`, the portfolio manifest
 * of the prior release, which must inventory the whole set and its edges. Every package must move forward when it changes version. A unit whose contract changed must move by at
 * least its effect, and one whose contract did not change must not be released. A package whose shipped contract or
 * implementation changed must publish a new version. A package that stays at its prior version keeps the dependency
 * ranges its release recorded, so one of those ranges that does not admit a sibling's new version forces the package
 * to publish too (at least a patch for a unit). `stable` maps a unit to its last stable release when the prior
 * release's version is an rc.
 */
export function findVersionEffectProblems({ effects, priorManifest, publishSet, versions, contracts, stable = new Map() }) {
  const problems = [];
  const add = (code, detail) => problems.push({ code, detail });
  const inventory = findPriorManifestProblems(priorManifest, publishSet);
  if (inventory.length > 0) return inventory.map((detail) => ({ code: 'P2_1_PRIOR_RELEASE_INVALID', detail: `the prior release manifest is unusable: ${detail}` }));
  const missing = publishSet.packages.filter(({ name }) => !versions.has(name)).map(({ name }) => name);
  if (missing.length > 0) return [{ code: 'P2_1_RELEASE_VERSIONS_INVALID', detail: `no proposed version for ${missing.join(', ')}` }];
  const judge = (label, before, after, required) => {
    const order = compareVersions(after, before);
    if (order < 0) add('P2_1_VERSION_NOT_AHEAD', `${label} goes back from ${before} to ${after}`);
    else if (required === 'none') {
      if (order > 0) add('P2_1_VERSION_UNIT_UNCHANGED', `${label} moves ${before} to ${after}, but its contract did not change`);
    } else if (order === 0) {
      add('P2_1_VERSION_NOT_AHEAD', `${label} repeats ${before}, but the change needs a new version`);
    } else {
      // S is the last stable release; with none, the unit's first base admits any change.
      const last = stable.get(label) ?? (parseVersion(before).pre === undefined ? before : undefined);
      const moved = last === undefined ? undefined : movedEffect(last, after);
      if (moved !== undefined && rank(moved) < rank(required)) add('P2_1_VERSION_EFFECT_TOO_SMALL', `${label} moves the stable ${last} to ${after} (${moved}), but the change needs ${required}`);
    }
  };

  const priorVersions = new Map(priorManifest.packages.map(({ name, version }) => [name, version]));
  const forced = new Map();
  for (const { from, to, range } of priorManifest.compatibility?.edges ?? []) {
    if (versions.get(to) !== undefined && !caretAllows(range, versions.get(to))) forced.set(from, `${from} requires ${to}@${range}, which does not admit ${versions.get(to)}`);
  }
  for (const [name, after] of versions) {
    const before = priorVersions.get(name);
    if (compareVersions(after, before) < 0) {
      add('P2_1_VERSION_NOT_AHEAD', `${name} goes back from ${before} to ${after}`);
      continue;
    }
    if (forced.has(name) && before === after) {
      add('P2_1_VERSION_RANGE_BROKEN', `${forced.get(name)}; ${name} must publish`);
      continue;
    }
    const unit = name === CATALOG_PACKAGE ? effects.units.catalog : effects.units.renderers[name];
    if (unit !== undefined) {
      judge(name, before, after, forced.has(name) ? maxEffect(unit, 'patch') : unit);
    } else if (effects.publish.includes(name)) {
      if (before === after) add('P2_1_VERSION_PUBLICATION_MISSING', `${name} stays ${before}, but its shipped contract or implementation changed`);
    } else if (before !== after && !forced.has(name)) {
      add('P2_1_VERSION_UNIT_UNCHANGED', `${name} moves ${before} to ${after}, but nothing it ships changed`);
    }
  }
  for (const [unit, key] of [['schema', 'schemaVersion'], ['queryApi', 'queryApiVersion'], ['tokenContract', 'tokenContractVersion']]) {
    judge(key, priorManifest.contracts[key], contracts[key], effects.units[unit]);
  }
  return problems;
}

/**
 * Problems in an installed candidate set (`E-P2.1-04`): each new package is installed at its prerelease candidate
 * version, the catalog's package version is its `catalogVersion`, and tooling's own range on the catalog admits it.
 * `installed` maps a package to the manifest version the consumer holds.
 */
export function findCandidateSetProblems({ versions, installed, toolingCatalogRange, catalogVersion }) {
  const problems = [];
  for (const name of NEW_PACKAGES) {
    const version = installed.get(name);
    if (version !== versions.get(name)) problems.push(`${name} installs ${version}, not the candidate ${versions.get(name)}`);
    else if (!/^\d+\.\d+\.\d+-rc\.[1-9]\d*$/u.test(version)) problems.push(`${name}@${version} is not an rc prerelease`);
  }
  if (catalogVersion !== installed.get(CATALOG_PACKAGE)) problems.push(`the catalog installs ${installed.get(CATALOG_PACKAGE)} but declares catalogVersion ${catalogVersion}`);
  else if (!caretAllows(toolingCatalogRange, catalogVersion)) problems.push(`${TOOLING_PACKAGE} requires ${CATALOG_PACKAGE}@${toolingCatalogRange}, which does not admit ${catalogVersion}`);
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a side from a commit

const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

/**
 * One side of the comparison, read from a source tree: the authored catalog records (a component with its derived API
 * documents, an example or guide with its content), the schema documents, the platform-safety contract the catalog
 * declares, and the contract versions.
 */
export function readSourceSide(root) {
  const manifest = readJson(root, 'packages/catalog/catalog-sources.json');
  const records = manifest.records.map(({ family, path }) => {
    const record = readJson(root, path);
    const entry = { family, record };
    if (record.source !== undefined) entry.source = readFileSync(join(root, record.source), 'utf8');
    if (family === 'component') {
      const derivedApis = {};
      for (const [bindingId, directory] of Object.entries(manifest.derivedApiSources ?? {})) {
        try {
          derivedApis[bindingId] = readJson(root, posix.join(directory, `${record.id.slice('muxui:component:'.length)}.json`));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      if (Object.keys(derivedApis).length > 0) entry.derivedApis = derivedApis;
    }
    return entry;
  });
  const schemas = Object.fromEntries(readdirSync(join(root, 'packages/schema/schemas')).filter((name) => name.endsWith('.schema.json')).sort()
    .map((name) => [name, readJson(root, `packages/schema/schemas/${name}`)]));
  const schemaSource = readFileSync(join(root, 'packages/schema/src/index.mjs'), 'utf8');
  const declared = (name) => new RegExp(`export const ${name} = '([^']+)';`, 'u').exec(schemaSource)?.[1];
  const token = records.find(({ family }) => family === TOKEN_FAMILY);
  return {
    records,
    schemas,
    platformSafetyContract: manifest.platformSafetyContractPath === undefined ? undefined : readJson(root, manifest.platformSafetyContractPath),
    contracts: {
      schemaVersion: declared('SCHEMA_VERSION'),
      queryApiVersion: declared('API_VERSION'),
      querySchemaVersion: declared('QUERY_SCHEMA_VERSION'),
      tokenContractVersion: token?.record.tokenContractVersion,
    },
  };
}

// The paths a manifest names as shipped: its `files` and the targets of its exports and bin, as repository-relative prefixes.
function shippedPrefixes(manifest, directory) {
  const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value ?? {}).flatMap(targets));
  return [...(manifest.files ?? []), ...targets(manifest.publishConfig?.exports ?? manifest.exports), ...targets(manifest.bin)]
    .map((entry) => entry.replace(/^\.\//u, '').replace(/\/?\*+$/u, ''))
    .filter((entry) => !['', 'README.md', 'package.json'].includes(entry))
    .map((entry) => posix.join(directory, entry));
}

/**
 * A digest of what each package ships at `revision`: the tracked files its manifest names (its `files` and the targets
 * of `publishConfig.exports` and `bin`), its generation inputs, and the manifest less version, scripts, and devDependencies,
 * from git's blob ids. An unpublished workspace entry (tooling's `authoring.mjs`) is in none of them.
 */
function readImplementation(revision, cwd) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const packages = Object.entries(GENERATION_INPUTS).map(([name, inputs]) => {
    const directory = `packages/${name.slice('@muxui/'.length)}`;
    const { version: _version, scripts: _scripts, devDependencies: _devDependencies, ...manifest } = JSON.parse(git('show', `${revision}:${directory}/package.json`));
    return { name, manifest, prefixes: [...new Set([...shippedPrefixes(manifest, directory), ...inputs])] };
  });
  const listing = git('ls-tree', '-r', revision, '--', ...new Set(packages.flatMap(({ prefixes }) => prefixes))).split('\n').filter(Boolean)
    .map((line) => [line.slice(line.indexOf('\t') + 1), line.split(' ')[2].split('\t')[0]]);
  return Object.fromEntries(packages.map(({ name, manifest, prefixes }) => {
    const files = listing.filter(([path]) => prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)));
    return [name, sha256(canonicalJson({ manifest, files }))];
  }));
}

/** A side for a commit: its sources extracted to a scratch directory that this call removes, and its implementation digests. */
export function readCommittedSide(revision, cwd) {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-effects-'));
  const extract = (paths) => execFileSync('tar', ['-x', '-C', root], {
    input: execFileSync('git', ['archive', '--format=tar', revision, '--', ...paths], { cwd, maxBuffer: 512 * 1024 * 1024 }),
  });
  try {
    extract(SOURCE_PATHS);
    // The catalog declares where its platform-safety contract lives; read it from there on this side.
    const declared = readJson(root, 'packages/catalog/catalog-sources.json').platformSafetyContractPath;
    if (declared !== undefined && !existsSync(join(root, declared))) extract([declared]);
    return { ...readSourceSide(root), implementation: readImplementation(revision, cwd) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The blobs of a tree as buffers, in one `git cat-file --batch`, keyed by object id. */
function readBlobs(ids, cwd) {
  const output = execFileSync('git', ['cat-file', '--batch'], { cwd, input: `${ids.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024 });
  const blobs = new Map();
  for (let offset = 0; offset < output.length;) {
    const end = output.indexOf(0x0a, offset);
    const [id, , size] = output.toString('utf8', offset, end).split(' ');
    blobs.set(id, output.subarray(end + 1, end + 1 + Number(size)));
    offset = end + 1 + Number(size) + 1;
  }
  return blobs;
}

/**
 * Every tracked file at `revision` that parses as a JSON object whose `schema` is a portfolio release schema, of any
 * version, wherever it lives and however it is spaced: the first release has none. Files are judged by content, so a
 * manifest does not escape by its name, its folder, or its formatting.
 */
function portfolioManifestsIn(revision, cwd) {
  const listing = execFileSync('git', ['ls-tree', '-r', '-z', '-l', revision], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\0').filter(Boolean).map((line) => /^\d+ blob ([0-9a-f]+)\s+(\d+)\t(.*)$/su.exec(line)).filter(Boolean)
    .map(([, id, , path]) => ({ id, path }));
  const blobs = readBlobs([...new Set(listing.map(({ id }) => id))], cwd);
  const found = [];
  for (const { id, path } of listing) {
    const text = blobs.get(id)?.toString('utf8').trimStart() ?? '';
    if (!text.startsWith('{')) continue;
    let schema;
    try {
      schema = JSON.parse(text)?.schema;
    } catch {
      continue;
    }
    if (typeof schema === 'string' && schema.startsWith(PORTFOLIO_SCHEMA_PREFIX)) found.push(`${path} (${schema})`);
  }
  return found;
}

/**
 * What a release compares with. It must say so: `MUXUI_PRIOR_RELEASE_MANIFEST` is the path of the prior portfolio
 * manifest, or `MUXUI_FIRST_PORTFOLIO_RELEASE=true` declares there is none, which holds only while no tracked file at
 * `revision` is a portfolio release manifest of any schema version. Neither, both, or a flag that contradicts the evidence
 * is refused, so a later release cannot skip the check by leaving the variable unset. The prior manifest is the one
 * committed at `revision`, listed with its digest by its evidence route's index (`readIndexedArtifact`).
 */
export function resolvePriorRelease({ environment, revision, cwd }) {
  const path = environment[PRIOR_RELEASE_VARIABLE] ?? '';
  const first = environment[FIRST_RELEASE_VARIABLE] ?? '';
  if (path !== '' && first !== '') fail('P2_1_PRIOR_RELEASE_AMBIGUOUS', `set ${PRIOR_RELEASE_VARIABLE} or ${FIRST_RELEASE_VARIABLE}, not both`);
  if (path === '' && first === '') {
    fail('P2_1_PRIOR_RELEASE_REQUIRED', `set ${PRIOR_RELEASE_VARIABLE} to the prior portfolio release manifest, or ${FIRST_RELEASE_VARIABLE}=true for the first portfolio release`);
  }
  if (first !== '') {
    if (first !== 'true') fail('P2_1_PRIOR_RELEASE_REQUIRED', `${FIRST_RELEASE_VARIABLE} must be true, not ${JSON.stringify(first)}`);
    const retained = portfolioManifestsIn(revision, cwd);
    if (retained.length > 0) fail('P2_1_FIRST_RELEASE_CONTRADICTED', `${FIRST_RELEASE_VARIABLE}=true, but ${retained.join(', ')} is a portfolio release; give ${PRIOR_RELEASE_VARIABLE}`);
    return { first: true };
  }
  // The prior manifest is the one the repository retains at the release commit, not whatever file the path names.
  const retainedPath = relative(cwd, resolve(cwd, path)).split(sep).join(posix.sep);
  try {
    return { first: false, priorManifest: JSON.parse(readIndexedArtifact({ path: retainedPath, revision, cwd }).toString('utf8')) };
  } catch (error) {
    return fail('P2_1_PRIOR_RELEASE_UNAVAILABLE', `${PRIOR_RELEASE_VARIABLE} ${path} cannot be read as retained evidence (${error.message.split('\n')[0]})`);
  }
}

/**
 * The records a release reuses: for each package whose version input is empty (`names`), its record in the prior
 * release's manifest, with the version, integrity, and provenance that release recorded. Reuse is only possible against
 * a prior release (never the first), whose manifest inventories the whole set. The records are what
 * `buildPortfolioManifest` keeps for a reused package. Whether the package really is unchanged is the version check
 * (`findVersionEffectProblems`): a reused package stays at its prior version there, so a change to it is refused.
 */
export function reusedRecords({ names, priorRelease, publishSet }) {
  if (names.length === 0) return new Map();
  if (priorRelease.first) {
    fail('P2_1_REUSE_NEEDS_PRIOR_RELEASE', `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} reused, and the first portfolio release has no prior release to reuse from`);
  }
  const unusable = findPriorManifestProblems(priorRelease.priorManifest, publishSet);
  if (unusable.length > 0) fail('P2_1_PRIOR_RELEASE_INVALID', `the prior release manifest is unusable: ${unusable.join('; ')}`);
  return new Map(names.map((name) => [name, priorRelease.priorManifest.packages.find((record) => record.name === name)]));
}

/**
 * What a release that reuses packages is: the records it keeps (`reusedRecords`, for every member of the set the
 * published versions `published` leave out), the manifests that published them (the prior release's, and for a package
 * the prior release itself reused, the manifest of the release before, retained at `revision` as
 * `tests/evidence/**\/release-manifest.json`; a reuse whose origin is not retained stops here), and the version of every
 * member of the set. A release that reuses nothing needs no prior release.
 */
export function planReuse({ publishSet, published, priorRelease, revision, cwd, readRetained = readRetainedManifests }) {
  const reused = reusedRecords({ names: reusedNames(publishSet, published), priorRelease, publishSet });
  const priorManifests = readRetained({ ids: [...reused.values()].map(({ provenance }) => provenance?.releaseId), revision, cwd });
  if (!priorRelease.first) priorManifests.set(priorRelease.priorManifest.id, priorRelease.priorManifest);
  for (const [name, { version, provenance }] of reused) {
    if (!priorManifests.has(provenance?.releaseId)) {
      fail('P2_1_REUSE_ORIGIN_UNAVAILABLE', `${name}@${version} was published by ${provenance?.releaseId}, whose manifest is not retained as tests/evidence/**/release-manifest.json at ${revision}`);
    }
  }
  return { reused, priorManifests, versions: releaseVersions(publishSet, published, reused) };
}

/**
 * Release preparation's check (`E-P2.1-04`): classifies what changed since the release `priorManifest` records and
 * rejects proposed `versions` that do not carry it. Returns the record the preparation data keeps. `revision` is the
 * release commit, in `cwd`'s clone.
 */
export function assertVersionEffects({ priorManifest, revision, cwd, versions, publishSet, stable, renderers = RENDERER_PACKAGES }) {
  const packageNames = publishSet.packages.map(({ name }) => name);
  const unusable = findPriorManifestProblems(priorManifest, publishSet);
  if (unusable.length > 0) fail('P2_1_PRIOR_RELEASE_INVALID', `the prior release manifest is unusable: ${unusable.join('; ')}`);
  let prior;
  try {
    prior = readCommittedSide(priorManifest.source.revision, cwd);
  } catch (error) {
    fail('P2_1_PRIOR_RELEASE_UNAVAILABLE', `the prior release commit ${priorManifest.source.revision} cannot be read (${error.message.split('\n')[0]}); fetch its history`);
  }
  for (const key of ['schemaVersion', 'queryApiVersion', 'tokenContractVersion']) {
    if (prior.contracts[key] !== priorManifest.contracts[key]) fail('P2_1_PRIOR_RELEASE_MISMATCH', `${key} is ${prior.contracts[key]} at ${priorManifest.source.revision}, but its manifest records ${priorManifest.contracts[key]}`);
  }
  const current = readCommittedSide(revision, cwd);
  const effects = classifyReleaseEffects({ prior, current, packageNames, renderers });
  const problems = [
    ...findVersionEffectProblems({ effects, priorManifest, publishSet, versions, contracts: current.contracts, stable }),
    ...effects.problems.map((detail) => ({ code: 'P2_1_VERSION_MARKER_MISMATCH', detail })),
  ];
  if (problems.length > 0) {
    fail('P2_1_VERSION_EFFECTS_REJECTED', `${problems.map(({ code, detail }) => `${detail} (${code})`).join('; ')}. Changes: ${effects.reasons.join('; ') || 'none'}`);
  }
  return { status: 'checked', priorRelease: priorManifest.id, priorRevision: priorManifest.source.revision, units: effects.units, publish: effects.publish };
}
