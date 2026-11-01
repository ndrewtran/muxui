// The version effect each version unit needs between a prior release and the current sources (`E-P2.1-04`), and the
// checks that a release proposes versions carrying it. Architecture "Version units and compatibility" owns the change
// table; this module applies it and reuses the authoring semantic diff (component, pattern, and example records) and
// `schema-evolution.json` (schema documents) rather than classifying changes a second way.
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
// version never released. Versions strictly increase per unit (the next rc, or a higher base): a repeated or lower
// version is rejected, and a unit whose effect is `none` is not released at all. Before 1.0 the leftmost nonzero part is
// the breaking one, so a minor bump claims `major` and a patch bump claims `minor`, matching the `^0.1.0-0` range a
// catalog derives for `@muxui/react`. A bump larger than required is accepted. `S` is the prior manifest's version when
// that is stable, or the `stable` map a caller passes for a unit whose prior release is an rc.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { SchemaValidationError, bindingSpecRevision, classifySchemaChange, mergeDerivedApis } from '@muxui/schema';
import { semanticDiff } from '@muxui/tooling/authoring';
import { canonicalJson } from './canonical-json.mjs';
import { PORTFOLIO_SCHEMA, caretAllows } from './release-manifest.mjs';

const SCHEMA_PACKAGE = '@muxui/schema';
const CATALOG_PACKAGE = '@muxui/catalog';
const TOOLING_PACKAGE = '@muxui/tooling';
/** The package that renders each binding id; a binding without an entry here has no published renderer. */
export const RENDERER_PACKAGES = Object.freeze({ 'web.react': '@muxui/react' });
/** The three packages new in P2.1; each publishes only prereleases (Decision 0032 item 6). */
export const NEW_PACKAGES = Object.freeze([SCHEMA_PACKAGE, CATALOG_PACKAGE, TOOLING_PACKAGE]);
/** The schema documents that define query responses; the others define source records. */
const QUERY_API_DOCUMENTS = new Set(['query-envelope.schema.json', 'section-page.schema.json', 'token-section-page-budget-profile.schema.json']);
/** Tracked files and directories whose change alters what a package ships (generated output is built from them). */
export const IMPLEMENTATION_ROOTS = Object.freeze({
  [SCHEMA_PACKAGE]: ['packages/schema/src', 'packages/schema/schemas'],
  [CATALOG_PACKAGE]: ['packages/catalog/src/index.mjs', 'packages/catalog/src/search.mjs', 'packages/catalog/src/search.d.mts', 'packages/catalog/token-section-page-budget-profile.json'],
  [TOOLING_PACKAGE]: ['packages/tooling/bin', 'packages/tooling/src', 'packages/tooling/command-registry.json'],
  '@muxui/react': ['packages/react/src', 'packages/react/build', 'packages/react/assets', 'packages/react/licenses'],
});
const SOURCE_PATHS = ['catalog', 'packages/catalog/catalog-sources.json', 'packages/react/api', 'packages/schema/schemas', 'packages/schema/src/index.mjs'];

export const EFFECTS = Object.freeze(['none', 'patch', 'minor', 'major']);
const rank = (effect) => EFFECTS.indexOf(effect);
const maxEffect = (...effects) => effects.reduce((best, effect) => (rank(effect) > rank(best) ? effect : best), 'none');

function fail(code, detail) {
  throw new Error(`${code}: ${detail}`);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (left, right) => canonicalJson(left) === canonicalJson(right);

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
const LOWER_BOUNDS = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties'];
const UPPER_BOUNDS = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties'];
const isMapKey = (key) => ['properties', '$defs', 'definitions', 'patternProperties'].includes(key) || key.startsWith('x-muxui-');

/**
 * The `schema-evolution.json` change types between two versions of a JSON Schema node. A shape change this does not
 * recognise counts as a changed interpretation, so an unknown edit never classifies below `major`.
 */
function schemaChangeTypes(before, after, out = []) {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const left = before[key];
    const right = after[key];
    if (same(left, right)) continue;
    if (ANNOTATIONS.has(key)) {
      out.push('description-or-annotation');
    } else if (key === 'required') {
      if ((right ?? []).some((name) => !(left ?? []).includes(name))) out.push('required-field');
      if ((left ?? []).some((name) => !(right ?? []).includes(name))) out.push('relaxed-constraint');
    } else if (key === 'enum') {
      if (left === undefined) out.push('tightened-constraint');
      else if (right === undefined) out.push('relaxed-constraint');
      else {
        if (right.some((value) => !left.some((other) => same(value, other)))) out.push('closed-enum-value');
        if (left.some((value) => !right.some((other) => same(value, other)))) out.push('tightened-constraint');
      }
    } else if (LOWER_BOUNDS.includes(key) || UPPER_BOUNDS.includes(key)) {
      const tighter = left === undefined || (right !== undefined && (LOWER_BOUNDS.includes(key) ? right > left : right < left));
      out.push(tighter ? 'tightened-constraint' : 'relaxed-constraint');
    } else if (isObject(left) && isObject(right) && isMapKey(key)) {
      for (const name of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (left[name] === undefined) out.push(key === 'properties' && after.required?.includes(name) ? 'required-field' : 'optional-stable-field');
        else if (right[name] === undefined) out.push('field-removal');
        else if (isObject(left[name]) && isObject(right[name])) schemaChangeTypes(left[name], right[name], out);
        else if (!same(left[name], right[name])) out.push('changed-interpretation');
      }
    } else if (isObject(left) && isObject(right)) {
      schemaChangeTypes(left, right, out);
    } else if (left === undefined) {
      out.push(isMapKey(key) ? 'optional-stable-field' : 'tightened-constraint');
    } else if (right === undefined) {
      out.push(isMapKey(key) ? 'field-removal' : 'relaxed-constraint');
    } else {
      out.push('changed-interpretation');
    }
  }
  return out;
}

const changeTypesEffect = (types) => maxEffect(...types.map((type) => classifySchemaChange(type).versionEffect));

/** The schema and query API effects: the documents that define query responses, and those that define source records. */
function classifySchemaDocuments(prior = {}, current = {}) {
  const effects = { schema: 'none', queryApi: 'none' };
  const reasons = [];
  for (const name of [...new Set([...Object.keys(prior), ...Object.keys(current)])].sort()) {
    const types = prior[name] === undefined ? ['capability-gated-kind']
      : current[name] === undefined ? ['field-removal']
        : schemaChangeTypes(prior[name], current[name]);
    const effect = changeTypesEffect(types);
    const unit = QUERY_API_DOCUMENTS.has(name) ? 'queryApi' : 'schema';
    effects[unit] = maxEffect(effects[unit], effect);
    if (effect !== 'none') reasons.push(`${unit} ${effect}: ${name} (${[...new Set(types)].join(', ')})`);
  }
  return { ...effects, reasons };
}

// ---------------------------------------------------------------------------------------------------------------------
// Tokens

/** The catalog source family of a token source. */
const TOKEN_FAMILY = 'token-source';
const TOKEN_CONTRACT_FIELDS = ['type', 'layer', 'unit', 'alias', 'overridePolicy'];

/**
 * The token contract effect and the effect on each token. A public token name, type, layer, unit, alias, or override
 * policy is the contract: removing or changing one is major and adding one is minor. A value, meaning, or other
 * authored data change is patch. Mode axes follow the same rule by value. `tokenContractVersion` itself is the answer,
 * not an input.
 */
function classifyTokens(prior, current) {
  const entries = new Map();
  let effect = 'none';
  const raise = (name, next) => {
    entries.set(name, maxEffect(entries.get(name) ?? 'none', next));
    effect = maxEffect(effect, next);
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
    for (const name of new Set([...Object.keys(before.tokens), ...Object.keys(after.tokens)])) {
      const left = before.tokens[name];
      const right = after.tokens[name];
      if (same(left, right)) continue;
      if (left === undefined) raise(name, 'minor');
      else if (right === undefined) raise(name, 'major');
      else raise(name, TOKEN_CONTRACT_FIELDS.some((field) => !same(left[field], right[field])) ? 'major' : 'patch');
    }
    for (const axis of new Set([...Object.keys(before.theme?.modeAxes ?? {}), ...Object.keys(after.theme?.modeAxes ?? {})])) {
      const [left, right] = [before, after].map((record) => record.theme?.modeAxes?.[axis] ?? []);
      if (left.some((mode) => !right.includes(mode))) raise(`${id}#mode.${axis}`, 'major');
      else if (right.some((mode) => !left.includes(mode))) raise(`${id}#mode.${axis}`, 'minor');
    }
    const rest = ({ tokens: _tokens, tokenContractVersion: _version, theme, ...record }) => ({ ...record, theme: { ...theme, modeAxes: undefined } });
    if (!same(rest(before), rest(after))) raise(id, 'patch');
  }
  return { effect, entries };
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

/** The binding spec revision of each supported binding of a component, with one side's own examples and token sources. */
function specRevisions({ record, derivedApis }, context) {
  const component = mergeDerivedApis(record, derivedApis ?? {});
  const examples = context.examples.filter((example) => example.binding?.ref?.startsWith(`${record.id}#`));
  return Object.fromEntries(supportedBindings(component).map((bindingId) => [
    bindingId,
    bindingSpecRevision({ component, bindingId, examples, exampleSources: context.exampleSources, tokenSources: context.tokenSources }),
  ]));
}

/**
 * The version effect each unit needs for the change from `prior` to `current` (both source sides, see `readSourceSide`),
 * and the packages that must publish for it, in publish order. A `null` prior is the first portfolio release.
 * `renderers` maps a binding id to the package that renders it.
 */
export function classifyReleaseEffects({ prior, current, packageNames, renderers = RENDERER_PACKAGES }) {
  if (prior === null) return { first: true, units: null, publish: [...packageNames], reasons: ['first portfolio release: there is no prior release to compare'] };
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

  const documents = classifySchemaDocuments(prior.schemas, current.schemas);
  reasons.push(...documents.reasons);
  const familyRecords = (side, family) => side.records.filter((entry) => entry.family === family);
  const tokens = classifyTokens(familyRecords(prior, TOKEN_FAMILY), familyRecords(current, TOKEN_FAMILY));
  const tokenSourcesChanged = !same(familyRecords(prior, TOKEN_FAMILY).map(({ record }) => record), familyRecords(current, TOKEN_FAMILY).map(({ record }) => record));
  if (tokens.effect !== 'none') reasons.push(`tokenContract ${tokens.effect}: ${[...tokens.entries].filter(([, effect]) => effect === tokens.effect).map(([name]) => name).join(', ')}`);
  // The catalog bundle embeds the schema, query API, and token sources, and renderer stylesheets are generated from the tokens.
  raiseCatalog(maxEffect(documents.schema, documents.queryApi, tokens.effect), 'its bundle embeds the schema, query API, and token contract');
  if (tokens.effect !== 'none') for (const bindingId of Object.keys(renderers)) raiseRenderer(bindingId, 'patch', 'its stylesheets are generated from the token sources');

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
  // Decision 0016: there is no old-format reader, so a prior record the current schema rejects cannot be compared. It
  // changed incompatibly, and every renderer binding of it with it.
  const incomparable = (id, error, records) => {
    raiseCatalog('major', `${id} cannot be compared (${error.message.slice(0, 160)})`);
    for (const bindingId of Object.keys(renderers)) {
      if (records.some(({ record }) => supportedBindings(record).includes(bindingId))) raiseRenderer(bindingId, 'major', `${id}#${bindingId} cannot be compared`);
    }
  };
  const compare = (id, before, after, compareRecords) => {
    try {
      compareRecords();
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) throw error;
      incomparable(id, error, [before, after]);
    }
  };
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
    } else if (family === 'guide') {
      raiseCatalog('patch', `${id} edited`);
    } else if (family === 'capability') {
      raiseCatalog('major', `${id} edited (a capability has no field table)`);
    } else if (family !== 'component') {
      compare(id, before, after, () => {
        const diff = diffOf(before, after);
        raiseCatalog(diff.versionEffect, `${id} ${diff.changes.map(({ path, operation }) => `${path} (${operation})`).join(', ')}`);
      });
    }
  }
  // A component's binding spec revision folds its record, derived API, normative examples, and token contract version, so
  // it moves for a changed example or token source even when the record itself did not change.
  for (const [id, after] of currentById) {
    const before = priorById.get(id);
    if (after.family !== 'component' || before === undefined) continue;
    const recordChanged = !same(before, after);
    if (!recordChanged && !changedExamples.has(id) && !tokenSourcesChanged) continue;
    compare(id, before, after, () => {
      const diff = recordChanged ? diffOf(before, after) : { versionEffect: 'none', changes: [] };
      raiseCatalog(diff.versionEffect, `${id} ${diff.changes.map(({ path, operation }) => `${path} (${operation})`).join(', ')}`);
      const priorSpecs = specRevisions(before, priorContext);
      const currentSpecs = specRevisions(after, currentContext);
      for (const bindingId of Object.keys(renderers)) {
        const specChanged = priorSpecs[bindingId] !== currentSpecs[bindingId];
        const ownChange = (path) => !path.startsWith('$/bindings/') || path === `$/bindings/${bindingId}` || path.startsWith(`$/bindings/${bindingId}/`);
        const fields = diff.changes.filter(({ path, revisionAxes }) => revisionAxes.includes('binding-spec') && ownChange(path)).map(({ effect }) => fieldEffect(effect));
        const required = [before, after].flatMap(({ record }) => record.bindings?.[bindingId]?.tokenRecipe?.requirements ?? []).map(({ token }) => tokens.entries.get(token) ?? 'none');
        // A moved spec revision means the descriptor must be rebuilt: at least a patch, even when no field of this binding changed.
        raiseRenderer(bindingId, maxEffect(specChanged ? 'patch' : 'none', ...(specChanged ? fields : []), ...required), `${id}#${bindingId} binding spec revision or required token`);
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
  return { first: false, units, publish, reasons };
}

// ---------------------------------------------------------------------------------------------------------------------
// Checking proposed versions

/**
 * Problems (`{ code, detail }`) in the versions a release proposes against the effects the change requires. `versions`
 * maps each package to its proposed version and `contracts` holds the current source's contract versions; both are
 * compared with `priorManifest`, the portfolio manifest of the prior release. A unit whose contract changed must move by
 * at least its effect, and one whose contract did not change must not be released. A package whose shipped contract or
 * implementation changed must publish a new version. A package that stays at its prior version keeps the dependency
 * ranges its release recorded, so one of those ranges that does not admit a sibling's new version forces the package
 * to publish too (at least a patch for a unit). `stable` maps a unit to its last stable release when the prior
 * release's version is an rc.
 */
export function findVersionEffectProblems({ effects, priorManifest, versions, contracts, stable = new Map() }) {
  const problems = [];
  const add = (code, detail) => problems.push({ code, detail });
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
    if (before === undefined) continue;
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
 * documents, an example or guide with its content), the schema documents, and the contract versions.
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
    contracts: { schemaVersion: declared('SCHEMA_VERSION'), queryApiVersion: declared('API_VERSION'), tokenContractVersion: token?.record.tokenContractVersion },
  };
}

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** A digest of the tracked sources each package ships at `revision`, from git's blob ids and its manifest less version and scripts. */
function readImplementation(revision, cwd) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const listing = git('ls-tree', '-r', revision, '--', ...Object.values(IMPLEMENTATION_ROOTS).flat()).split('\n').filter(Boolean)
    .map((line) => [line.slice(line.indexOf('\t') + 1), line.split(' ')[2].split('\t')[0]]);
  return Object.fromEntries(Object.entries(IMPLEMENTATION_ROOTS).map(([name, roots]) => {
    const { version: _version, scripts: _scripts, devDependencies: _devDependencies, ...manifest } = JSON.parse(git('show', `${revision}:packages/${name.slice('@muxui/'.length)}/package.json`));
    const files = listing.filter(([path]) => roots.some((root) => path === root || path.startsWith(`${root}/`)));
    return [name, sha256(canonicalJson({ manifest, files }))];
  }));
}

/** A side for a commit: its sources extracted to a scratch directory that this call removes, and its implementation digests. */
export function readCommittedSide(revision, cwd) {
  const root = mkdtempSync(join(tmpdir(), 'muxui-release-effects-'));
  try {
    const archive = execFileSync('git', ['archive', '--format=tar', revision, '--', ...SOURCE_PATHS], { cwd, maxBuffer: 512 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', root], { input: archive });
    return { ...readSourceSide(root), implementation: readImplementation(revision, cwd) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Release preparation's check (`E-P2.1-04`): classifies what changed since the release `priorManifest` records and
 * rejects proposed `versions` that do not carry it. Returns the record the preparation data keeps. `revision` is the
 * release commit, in `cwd`'s clone.
 */
export function assertVersionEffects({ priorManifest, revision, cwd, versions, packageNames, stable, renderers = RENDERER_PACKAGES }) {
  if (priorManifest?.schema !== PORTFOLIO_SCHEMA || !/^[0-9a-f]{40}$/u.test(priorManifest.source?.revision ?? '')) {
    fail('P2_1_PRIOR_RELEASE_INVALID', `the prior release manifest is not a ${PORTFOLIO_SCHEMA} document with a source commit`);
  }
  let prior;
  try {
    prior = readCommittedSide(priorManifest.source.revision, cwd);
  } catch (error) {
    fail('P2_1_PRIOR_RELEASE_UNAVAILABLE', `the prior release commit ${priorManifest.source.revision} cannot be read (${error.message.split('\n')[0]}); fetch its history`);
  }
  for (const key of ['schemaVersion', 'queryApiVersion', 'tokenContractVersion']) {
    if (prior.contracts[key] !== priorManifest.contracts?.[key]) fail('P2_1_PRIOR_RELEASE_MISMATCH', `${key} is ${prior.contracts[key]} at ${priorManifest.source.revision}, but its manifest records ${priorManifest.contracts?.[key]}`);
  }
  const current = readCommittedSide(revision, cwd);
  const effects = classifyReleaseEffects({ prior, current, packageNames, renderers });
  const problems = findVersionEffectProblems({ effects, priorManifest, versions, contracts: current.contracts, stable });
  if (problems.length > 0) {
    fail('P2_1_VERSION_EFFECTS_REJECTED', `${problems.map(({ code, detail }) => `${detail} (${code})`).join('; ')}. Changes: ${effects.reasons.join('; ') || 'none'}`);
  }
  return { status: 'checked', priorRelease: priorManifest.id, priorRevision: priorManifest.source.revision, units: effects.units, publish: effects.publish };
}
