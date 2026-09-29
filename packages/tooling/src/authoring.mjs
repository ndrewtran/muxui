import { readFile } from 'node:fs/promises';
import { dirname, posix, resolve } from 'node:path';
import {
  SchemaValidationError,
  authoringMetadata,
  bindingContentRevision,
  bindingContentRevisionPreimage,
  bindingSpecRevision,
  bindingSpecRevisionPreimage,
  canonicalDigest,
  canonicalJson,
  classifySchemaChange,
  contentRevision,
  contentRevisionPreimage,
  parseJsonStrict,
  resolveAuthoringField,
  validateFamily,
} from '@muxui/schema';
import {
  discoverWorkspacePackages,
} from '../../../tooling/audits/repository-policy/src/workspace-packages.mjs';
import { compileCatalog } from '@muxui/catalog/compiler';

const SOURCE_MANIFEST_SCHEMA = 'muxui-catalog-source-manifest-v1';
const EFFECT_ORDER = Object.freeze({ editorial: 0, compatible: 1, incompatible: 2 });
const DERIVED_COMPONENT_FIELDS = new Set(['schemaVersion', 'id', 'kind']);

export class AuthoringPolicyError extends Error {
  constructor(ruleId, message, details = {}) {
    super(`${ruleId}: ${message}`);
    this.name = 'AuthoringPolicyError';
    this.code = 'MUXUI_SCHEMA_INVALID';
    this.ruleId = ruleId;
    this.details = details;
  }
}
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRelativePath(path, field) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.startsWith('/')
    || path.split('/').includes('..')
    || path.includes('\\')
  ) {
    throw new AuthoringPolicyError(
      'authoring.path.relative',
      `${field} must be repository-relative`,
      { field },
    );
  }
  return path;
}

function assertExactKeys(value, allowed, ruleId) {
  if (!isObject(value)) {
    throw new AuthoringPolicyError(ruleId, 'input must be an object');
  }
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort(compareText);
  if (unknown.length > 0) {
    throw new AuthoringPolicyError(ruleId, 'input contains unknown fields', { fields: unknown });
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function scaffoldComponent({ slug, recordPath, decisions, authoring = {} } = {}) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new AuthoringPolicyError(
      'authoring.scaffold.slug',
      'slug must use the canonical lower-kebab convention',
      { field: 'slug' },
    );
  }
  assertRelativePath(recordPath, 'recordPath');
  if (!recordPath.endsWith('.json')) {
    throw new AuthoringPolicyError(
      'authoring.scaffold.record-path',
      'recordPath must identify a canonical JSON source',
      { field: 'recordPath' },
    );
  }
  assertExactKeys(decisions, new Set(
    authoringMetadata('component', authoring)
      .filter(({ schema, schemaPointer }) => (
        schema === 'component.schema.json'
        && schemaPointer.startsWith('#/properties/')
        && schemaPointer.split('/').length === 3
      ))
      .map(({ field }) => field)
      .filter((field) => !DERIVED_COMPONENT_FIELDS.has(field)),
  ), 'authoring.scaffold.decisions');
  for (const field of ['name', 'summary', 'lifecycle', 'intent', 'anatomy', 'states', 'accessibility', 'bindings']) {
    if (!Object.hasOwn(decisions, field)) {
      throw new AuthoringPolicyError(
        'authoring.scaffold.decision-required',
        `the caller must supply ${field}`,
        { field },
      );
    }
  }
  const record = {
    schemaVersion: '1.0.0',
    id: `muxui:component:${slug}`,
    kind: 'component',
    ...structuredClone(decisions),
  };
  validateFamily('component', record, authoring);
  const bytes = `${canonicalJson(record)}\n`;
  return deepFreeze({
    mode: 'preview-only',
    family: 'component',
    recordPath,
    record,
    writeSet: [{ path: recordPath, bytes }],
  });
}

async function readJson(repositoryRoot, path) {
  return parseJsonStrict(await readFile(resolve(repositoryRoot, path), 'utf8'));
}

function validateManifest(manifest) {
  if (
    !isObject(manifest)
    || manifest.schema !== SOURCE_MANIFEST_SCHEMA
    || typeof manifest.authorityDecisionPath !== 'string'
    || typeof manifest.commandRegistryPath !== 'string'
    || typeof manifest.pageBudgetProfilePath !== 'string'
    || typeof manifest.platformSafetyContractPath !== 'string'
    || typeof manifest.queryApiVersion !== 'string'
    || !Array.isArray(manifest.supportedQueryApiVersions)
    || !Array.isArray(manifest.records)
  ) {
    throw new AuthoringPolicyError(
      'authoring.source.manifest',
      'the declared catalog source manifest is invalid',
    );
  }
  assertRelativePath(manifest.authorityDecisionPath, 'authorityDecisionPath');
  assertRelativePath(manifest.commandRegistryPath, 'commandRegistryPath');
  assertRelativePath(manifest.pageBudgetProfilePath, 'pageBudgetProfilePath');
  assertRelativePath(manifest.platformSafetyContractPath, 'platformSafetyContractPath');
  for (const [index, entry] of manifest.records.entries()) {
    if (!isObject(entry) || typeof entry.family !== 'string') {
      throw new AuthoringPolicyError(
        'authoring.source.manifest-entry',
        'a catalog source entry is invalid',
        { index },
      );
    }
    assertRelativePath(entry.path, `records/${index}/path`);
  }
}

export async function loadRepositoryAuthoringContext({
  repositoryRoot,
  expectedSourceRevision,
  sourceManifestPath = 'packages/catalog/catalog-sources.json',
  catalogBundlePath = 'packages/catalog/generated/catalog.json',
  repositoryPolicyPath = 'tooling/audits/repository-policy/repository-policy.json',
  typeProjectionPath = 'packages/schema/schemas/type-projection.json',
} = {}) {
  if (!repositoryRoot) {
    throw new AuthoringPolicyError(
      'authoring.context.repository-root',
      'repositoryRoot is required',
    );
  }
  for (const [field, path] of Object.entries({
    sourceManifestPath,
    catalogBundlePath,
    repositoryPolicyPath,
    typeProjectionPath,
  })) assertRelativePath(path, field);
  const [sourceManifest, catalogBundle, repositoryPolicy, typeProjection, workspacePackages] =
    await Promise.all([
      readJson(repositoryRoot, sourceManifestPath),
      readJson(repositoryRoot, catalogBundlePath),
      readJson(repositoryRoot, repositoryPolicyPath),
      readJson(repositoryRoot, typeProjectionPath),
      discoverWorkspacePackages(repositoryRoot),
    ]);
  validateManifest(sourceManifest);
  const compiled = await compileCatalog({ repositoryRoot, sourceManifestPath });
  if (
    compiled.bundle.sourceRevision !== catalogBundle.sourceRevision
    || compiled.bundle.catalogDigest !== catalogBundle.catalogDigest
    || compiled.bytes !== canonicalJson(catalogBundle)
  ) {
    throw new AuthoringPolicyError(
      'authoring.source.bundle-drift',
      'the live manifest and canonical inputs do not compile to the declared catalog bundle',
      {
        compiledSourceRevision: compiled.bundle.sourceRevision,
        declaredSourceRevision: catalogBundle.sourceRevision ?? null,
        compiledCatalogDigest: compiled.bundle.catalogDigest,
        declaredCatalogDigest: catalogBundle.catalogDigest ?? null,
      },
    );
  }
  if (
    typeof expectedSourceRevision !== 'string'
    || expectedSourceRevision !== catalogBundle.sourceRevision
  ) {
    throw new AuthoringPolicyError(
      'authoring.source.revision-stale',
      'the requested source revision does not match the declared compiled catalog',
      {
        expectedSourceRevision: expectedSourceRevision ?? null,
        actualSourceRevision: catalogBundle.sourceRevision ?? null,
      },
    );
  }
  return deepFreeze({
    sourceRevision: catalogBundle.sourceRevision,
    sourceManifestPath,
    catalogBundlePath,
    repositoryPolicyPath,
    typeProjectionPath,
    sourceManifest,
    catalogBundle,
    repositoryPolicy,
    typeProjection,
    workspacePackages,
  });
}

function sourceEntry(context, recordPath, family) {
  return context.sourceManifest.records.find((entry) => (
    entry.path === recordPath && entry.family === family
  ));
}

function sourceDiagnostic(ruleId, message, { record, recordPath, path = '$', owner = null }) {
  return {
    code: 'MUXUI_SCHEMA_INVALID',
    ruleId,
    message,
    retryable: false,
    details: {
      artifactId: typeof record?.id === 'string' ? record.id : null,
      source: { record: recordPath, path },
      owner,
    },
    nextCommand: {
      command: 'pnpm --filter @muxui/schema check',
      effect: 'read-only',
      requiresConfirmation: false,
    },
  };
}

export function diagnoseCanonicalSource({
  context,
  family,
  record,
  recordPath,
  authoring = {},
} = {}) {
  assertRelativePath(recordPath, 'recordPath');
  if (!sourceEntry(context, recordPath, family)) {
    return deepFreeze({
      valid: false,
      diagnostics: [sourceDiagnostic(
        'authoring.source.declared-owner',
        'The source is not declared by the exact catalog source manifest.',
        { record, recordPath },
      )],
    });
  }
  try {
    validateFamily(family, record, authoring);
    return deepFreeze({ valid: true, diagnostics: [] });
  } catch (error) {
    if (!(error instanceof SchemaValidationError)) throw error;
    const diagnostics = error.issues.map(({ path, message }) => {
      let owner = null;
      try {
        const field = resolveAuthoringField(family, path, authoring);
        owner = {
          name: field.owner,
          schema: field.schema,
          schemaPointer: field.schemaPointer,
        };
      } catch {
        owner = { name: `${family}-contract`, schema: `${family}.schema.json`, schemaPointer: '#' };
      }
      return sourceDiagnostic(
        'authoring.source.schema-invalid',
        `The canonical source is invalid: ${message}`,
        { record, recordPath, path, owner },
      );
    });
    return deepFreeze({ valid: false, diagnostics });
  }
}

function normalizedInputRows(value, path = '$', rows = []) {
  if (Array.isArray(value)) {
    if (value.length === 0) rows.push({ path, value: [] });
    else value.forEach((item, index) => normalizedInputRows(item, `${path}/${index}`, rows));
  } else if (isObject(value)) {
    const keys = Object.keys(value).sort(compareText);
    if (keys.length === 0) rows.push({ path, value: {} });
    for (const key of keys) {
      normalizedInputRows(value[key], `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`, rows);
    }
  } else {
    rows.push({ path, value });
  }
  return rows;
}

function revisionAxis(name, preimage) {
  const normalized = JSON.parse(canonicalJson(preimage));
  return {
    name,
    digest: canonicalDigest(preimage),
    normalizedInputs: normalizedInputRows(normalized),
  };
}

export function explainRevisions({
  family,
  record,
  sourceBytes,
  bindingId,
  examples = [],
  exampleSources = {},
  tokenSources = [],
  tokenRequirementSets = {},
  platformSafetyRequirementSets = {},
  authoring = {},
} = {}) {
  const axes = [revisionAxis(
    'contentRevision',
    contentRevisionPreimage(family, record, { sourceBytes, ...authoring }),
  )];
  if (family === 'binding') {
    axes.push(revisionAxis(
      'bindingContentRevision',
      bindingContentRevisionPreimage(record, authoring),
    ));
  }
  if (family === 'component' && bindingId !== undefined) {
    const componentExamples = examples.filter((example) => example.binding?.ref?.startsWith(`${record.id}#`));
    axes.push(revisionAxis(
      'bindingContentRevision',
      bindingContentRevisionPreimage(record.bindings[bindingId], authoring),
    ));
    axes.push(revisionAxis('bindingSpecRevision', bindingSpecRevisionPreimage({
      component: record,
      bindingId,
      examples: componentExamples,
      exampleSources: Object.fromEntries(componentExamples.map((example) => [example.id, exampleSources[example.id]])),
      tokenSources,
      tokenRequirementSets: Array.isArray(tokenRequirementSets)
        ? tokenRequirementSets
        : Object.entries(tokenRequirementSets)
          .filter(([key]) => key.startsWith(`${bindingId}:`))
          .map(([, value]) => value),
      platformSafetyRequirementSets: Array.isArray(platformSafetyRequirementSets)
        ? platformSafetyRequirementSets
        : Object.entries(platformSafetyRequirementSets)
          .filter(([key]) => key.startsWith(`${bindingId}:`))
          .map(([, value]) => value),
      ...authoring,
    })));
  }
  return deepFreeze({ family, artifactId: record.id ?? null, bindingId: bindingId ?? null, axes });
}

function diffValues(before, after, path = '$', changes = []) {
  if (canonicalJson(before) === canonicalJson(after)) return changes;
  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeKeys = before.map((value) => canonicalJson(value));
    const afterKeys = after.map((value) => canonicalJson(value));
    const lengths = Array.from(
      { length: before.length + 1 },
      () => Array(after.length + 1).fill(0),
    );
    for (let left = before.length - 1; left >= 0; left -= 1) {
      for (let right = after.length - 1; right >= 0; right -= 1) {
        lengths[left][right] = beforeKeys[left] === afterKeys[right]
          ? lengths[left + 1][right + 1] + 1
          : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
      }
    }
    let left = 0;
    let right = 0;
    while (left < before.length || right < after.length) {
      if (
        left < before.length
        && right < after.length
        && beforeKeys[left] === afterKeys[right]
      ) {
        left += 1;
        right += 1;
      } else if (
        right < after.length
        && (left === before.length || lengths[left][right + 1] >= lengths[left + 1][right])
      ) {
        changes.push({ path: `${path}/${right}`, operation: 'add', after: after[right] });
        right += 1;
      } else {
        changes.push({ path: `${path}/${left}`, operation: 'remove', before: before[left] });
        left += 1;
      }
    }
    return changes;
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(compareText);
    for (const key of keys) {
      const nextPath = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
      if (!Object.hasOwn(before, key)) {
        changes.push({ path: nextPath, operation: 'add', after: after[key] });
      } else if (!Object.hasOwn(after, key)) {
        changes.push({ path: nextPath, operation: 'remove', before: before[key] });
      } else {
        diffValues(before[key], after[key], nextPath, changes);
      }
    }
    return changes;
  }
  changes.push({ path, operation: 'replace', before, after });
  return changes;
}

function versionEffectFor(effect, changes) {
  if (changes.length === 0) return 'none';
  const changeType = effect === 'editorial'
    ? 'description-or-annotation'
    : effect === 'compatible'
      ? 'optional-stable-field'
      : changes.some(({ operation }) => operation === 'remove')
        ? 'field-removal'
        : 'required-field';
  return classifySchemaChange(changeType).versionEffect;
}

function componentRevisionDelta(record, context, authoring) {
  const content = contentRevision('component', record, authoring);
  const bindings = {};
  const componentExamples = (context.examples ?? []).filter((example) => example.binding?.ref?.startsWith(`${record.id}#`));
  for (const [bindingId, binding] of Object.entries(record.bindings)) {
    bindings[bindingId] = {
      content: bindingContentRevision(binding, authoring),
      ...(binding.strategy === 'unsupported' ? {} : {
        spec: bindingSpecRevision({
          component: record,
          bindingId,
          examples: componentExamples,
          exampleSources: Object.fromEntries(componentExamples.map((example) => [example.id, context.exampleSources?.[example.id]])),
          tokenSources: context.tokenSources ?? [],
          tokenRequirementSets: Object.entries(context.tokenRequirementSets ?? {})
            .filter(([key]) => key.startsWith(`${bindingId}:`))
            .map(([, value]) => value),
          platformSafetyRequirementSets: Object.entries(
            context.platformSafetyRequirementSets ?? {},
          )
            .filter(([key]) => key.startsWith(`${bindingId}:`))
            .map(([, value]) => value),
          ...authoring,
        }),
      }),
    };
  }
  return { content, bindings };
}

export function semanticDiff({
  family = 'component',
  before,
  after,
  revisionContext = {},
  authoring = {},
} = {}) {
  validateFamily(family, before, authoring);
  validateFamily(family, after, authoring);
  const changes = diffValues(before, after).map((change) => {
    const field = resolveAuthoringField(family, change.path, authoring);
    return {
      ...change,
      effect: field.effects[change.operation],
      revisionAxes: field.revisionAxes,
      owner: {
        name: field.owner,
        schema: field.schema,
        schemaPointer: field.schemaPointer,
      },
    };
  });
  const effect = changes.reduce(
    (current, change) => (
      EFFECT_ORDER[change.effect] > EFFECT_ORDER[current] ? change.effect : current
    ),
    'editorial',
  );
  let revisions;
  if (family === 'component') {
    const beforeRevisions = componentRevisionDelta(before, revisionContext, authoring);
    const afterRevisions = componentRevisionDelta(after, revisionContext, authoring);
    revisions = {
      contentRevision: {
        before: beforeRevisions.content,
        after: afterRevisions.content,
        changed: beforeRevisions.content !== afterRevisions.content,
      },
      bindings: Object.fromEntries(
        [...new Set([
          ...Object.keys(beforeRevisions.bindings),
          ...Object.keys(afterRevisions.bindings),
        ])].sort(compareText).map((bindingId) => {
          const left = beforeRevisions.bindings[bindingId] ?? null;
          const right = afterRevisions.bindings[bindingId] ?? null;
          return [bindingId, {
            bindingContentRevision: {
              before: left?.content ?? null,
              after: right?.content ?? null,
              changed: left?.content !== right?.content,
            },
            bindingSpecRevision: {
              before: left?.spec ?? null,
              after: right?.spec ?? null,
              changed: left?.spec !== right?.spec,
            },
          }];
        }),
      ),
    };
  } else {
    revisions = {
      contentRevision: {
        before: contentRevision(family, before, authoring),
        after: contentRevision(family, after, authoring),
        changed: contentRevision(family, before, authoring)
          !== contentRevision(family, after, authoring),
      },
    };
  }
  return deepFreeze({
    family,
    artifactId: before.id ?? after.id ?? null,
    effect: changes.length === 0 ? 'editorial' : effect,
    versionEffect: versionEffectFor(effect, changes),
    changes,
    revisions,
  });
}

function pointerSegments(path) {
  const value = path.startsWith('$/') ? path.slice(2) : path.replace(/^\//u, '');
  return value.split('/').filter(Boolean).map((segment) => (
    segment.replaceAll('~1', '/').replaceAll('~0', '~')
  ));
}

function valueAt(root, path) {
  return pointerSegments(path).reduce((value, segment) => value?.[segment], root);
}

function setAt(root, path, value) {
  const segments = pointerSegments(path);
  const field = segments.pop();
  const parent = segments.reduce((current, segment) => current[segment], root);
  parent[field] = value;
}

export function previewAutofix({
  family = 'component',
  record,
  path,
  autofix = 'trim-outer-whitespace',
  authoring = {},
} = {}) {
  let field;
  try {
    field = resolveAuthoringField(family, path, authoring);
  } catch {
    throw new AuthoringPolicyError(
      'authoring.autofix.field-denied',
      'autofix is denied because the path has no schema-owned mechanical policy',
      { path, autofix },
    );
  }
  if (!field.autofixes.includes(autofix)) {
    throw new AuthoringPolicyError(
      'authoring.autofix.semantic-denied',
      'autofix is denied for product meaning and review-owned fields',
      { path, autofix, owner: field.owner },
    );
  }
  const current = valueAt(record, path);
  if (typeof current !== 'string') {
    throw new AuthoringPolicyError(
      'authoring.autofix.value-denied',
      'the selected mechanical autofix requires a string value',
      { path, autofix },
    );
  }
  const next = current.trim();
  const preview = structuredClone(record);
  setAt(preview, path, next);
  validateFamily(family, preview, authoring);
  return deepFreeze({
    mode: 'preview-only',
    autofix,
    record: preview,
    changedPaths: current === next ? [] : [path],
  });
}

function schemaSources(authoring = {}) {
  return new Set(authoringMetadata('component', authoring)
    .concat(authoringMetadata('binding', authoring))
    .map(({ schema }) => `packages/schema/schemas/${schema}`));
}

function isCatalogSource(context, path) {
  return context.sourceManifest.authorityDecisionPath === path
    || context.sourceManifest.commandRegistryPath === path
    || context.sourceManifest.pageBudgetProfilePath === path
    || context.sourceManifest.platformSafetyContractPath === path
    || context.sourceManifest.records.some((entry) => entry.path === path)
    // Content files are named by their record's `source`, not the manifest.
    || context.catalogBundle.artifacts.some(({ source }) => source.content === path);
}

function packageForPath(packages, path) {
  return packages
    .filter((item) => path === item.path || path.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0] ?? null;
}

function dependencyNames(manifest) {
  return new Set(Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.devDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
  }));
}

function dependentClosure(packages, seedNames) {
  const selected = new Set(seedNames);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of packages) {
      if (
        !selected.has(item.name)
        && [...dependencyNames(item.manifest)].some((name) => selected.has(name))
      ) {
        selected.add(item.name);
        changed = true;
      }
    }
  }
  return packages.filter(({ name }) => selected.has(name));
}

function artifactIdFromEndpoint(endpoint, ids) {
  if (ids.has(endpoint)) return endpoint;
  const concept = endpoint.split('#')[0];
  return ids.has(concept) ? concept : null;
}

function relatedArtifactIds(bundle, initialIds) {
  const known = new Set(bundle.artifacts.map(({ id }) => id));
  const affected = new Set(initialIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of bundle.relations) {
      const source = artifactIdFromEndpoint(edge.source, known);
      const target = artifactIdFromEndpoint(edge.target, known);
      if (source && target && (affected.has(source) || affected.has(target))) {
        for (const id of [source, target]) {
          if (!affected.has(id)) {
            affected.add(id);
            changed = true;
          }
        }
      }
    }
  }
  return affected;
}

export function affectedClosure({
  context,
  sourcePaths = [],
  artifactIds = [],
  authoring = {},
} = {}) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new AuthoringPolicyError(
      'authoring.closure.source-required',
      'at least one exact canonical source path is required',
    );
  }
  const declaredSchemaSources = schemaSources(authoring);
  for (const path of sourcePaths) {
    assertRelativePath(path, 'sourcePaths');
    if (!isCatalogSource(context, path) && !declaredSchemaSources.has(path)) {
      throw new AuthoringPolicyError(
        'authoring.closure.source-undeclared',
        'affected closure refuses undeclared or inferred sources',
        { path },
      );
    }
  }
  const sourceArtifacts = context.catalogBundle.artifacts.filter(({ source }) => (
    sourcePaths.includes(source.record) || sourcePaths.includes(source.content)
  ));
  const schemaFamilies = new Set(sourcePaths
    .filter((path) => declaredSchemaSources.has(path))
    .map((path) => posix.basename(path).replace('.schema.json', '')));
  const schemaArtifacts = context.catalogBundle.artifacts.filter((artifact) => (
    schemaFamilies.has(artifact.kind)
    || (schemaFamilies.has('binding') && artifact.kind === 'component')
  ));
  const initialIds = new Set([
    ...artifactIds,
    ...sourceArtifacts.map(({ id }) => id),
    ...schemaArtifacts.map(({ id }) => id),
  ]);
  const knownIds = new Set(context.catalogBundle.artifacts.map(({ id }) => id));
  for (const id of initialIds) {
    if (!knownIds.has(id)) {
      throw new AuthoringPolicyError(
        'authoring.closure.artifact-undeclared',
        'affected closure refuses an artifact absent from the exact catalog revision',
        { id },
      );
    }
  }
  const relatedIds = relatedArtifactIds(context.catalogBundle, initialIds);
  const relatedArtifacts = context.catalogBundle.artifacts.filter(({ id }) => relatedIds.has(id));
  const canonicalSources = new Set(sourcePaths);
  for (const artifact of relatedArtifacts) {
    canonicalSources.add(artifact.source.record);
    if (artifact.source.content) canonicalSources.add(artifact.source.content);
  }

  const seedPackages = new Set();
  const catalogOwner = packageForPath(
    context.workspacePackages,
    dirname(context.sourceManifestPath),
  );
  for (const path of canonicalSources) {
    const directOwner = packageForPath(context.workspacePackages, path);
    if (directOwner) seedPackages.add(directOwner.name);
    if (isCatalogSource(context, path) && catalogOwner) seedPackages.add(catalogOwner.name);
  }
  const packages = dependentClosure(context.workspacePackages, seedPackages);
  const projections = new Set();
  if ([...canonicalSources].some((path) => isCatalogSource(context, path))) {
    for (const projection of context.repositoryPolicy.strictJsonProjections ?? []) {
      projections.add(projection.path);
      projections.add(projection.provenance);
    }
  }
  for (const path of canonicalSources) {
    if (!declaredSchemaSources.has(path)) continue;
    const schemaFile = posix.basename(path);
    if (context.typeProjection.projections.some(({ source }) => source.startsWith(`${schemaFile}#`))) {
      projections.add(context.typeProjection.output);
    }
  }
  const requiredChecks = [
    ...packages
      .filter(({ manifest }) => Object.hasOwn(manifest.scripts ?? {}, 'check'))
      .map(({ name }) => `pnpm --filter ${name} check`),
    'pnpm check',
    'pnpm generate:check',
  ];
  return deepFreeze({
    sourceRevision: context.sourceRevision,
    canonicalSources: [...canonicalSources].sort(compareText),
    artifacts: relatedArtifacts.map(({ id }) => id).sort(compareText),
    relations: context.catalogBundle.relations.filter(({ source, target }) => (
      relatedIds.has(artifactIdFromEndpoint(source, knownIds))
      || relatedIds.has(artifactIdFromEndpoint(target, knownIds))
    )),
    projections: [...projections].sort(compareText),
    packages: packages.map(({ name, path }) => ({ name, path })),
    requiredChecks,
    deferred: [{
      capability: 'renderer-proof-evaluation-closure',
      readiness: 'unavailable',
      earliestBoundary: 'Gate 1',
    }],
  });
}

/**
 * Builds a read-only impact preview for one validated canonical source change.
 * The returned write set identifies the source owner only; no operation is
 * authorized or executed by this helper.
 */
export function previewChangeIntent({
  context,
  family = 'component',
  recordPath,
  before,
  after,
  objective,
  revisionContext = {},
  authoring = {},
} = {}) {
  if (!isObject(context) || !isObject(context.catalogBundle) || !isObject(context.sourceManifest)) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.context-required',
      'a validated repository authoring context is required',
    );
  }
  if (typeof objective !== 'string' || objective.trim().length === 0) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.objective-required',
      'the proposed change must declare a non-empty objective',
    );
  }
  assertRelativePath(recordPath, 'recordPath');
  const entry = sourceEntry(context, recordPath, family);
  if (!entry) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.source-undeclared',
      'the proposed change must target an exact declared canonical source',
      { family, recordPath },
    );
  }
  const canonical = context.catalogBundle.artifacts.find(({ kind, source }) => (
    kind === family && source?.record === recordPath
  ));
  if (!canonical) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.artifact-missing',
      'the canonical source is absent from the validated catalog revision',
      { family, recordPath },
    );
  }
  if (canonicalJson(canonical.record) !== canonicalJson(before)) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.base-drift',
      'the proposed before-image is not the exact canonical record at the source revision',
      { artifactId: canonical.id, recordPath, sourceRevision: context.sourceRevision },
    );
  }
  let semantic;
  try {
    semantic = semanticDiff({
      family,
      before,
      after,
      revisionContext,
      authoring,
    });
  } catch (error) {
    if (!(error instanceof SchemaValidationError)) throw error;
    throw new AuthoringPolicyError(
      'authoring.change-intent.proposed-invalid',
      'the proposed after-image is not a valid canonical source record',
      { artifactId: canonical.id, recordPath, diagnostics: error.issues },
    );
  }
  if (semantic.changes.length === 0) {
    throw new AuthoringPolicyError(
      'authoring.change-intent.no-op',
      'the proposed after-image does not change the canonical record',
      { artifactId: canonical.id, recordPath },
    );
  }
  const closure = affectedClosure({
    context,
    sourcePaths: [recordPath],
    artifactIds: [canonical.id],
    authoring,
  });
  return deepFreeze({
    mode: 'preview-only',
    base: {
      sourceRevision: context.sourceRevision,
      artifactId: canonical.id,
      recordPath,
    },
    objective: objective.trim(),
    writeSet: [{ path: recordPath, artifactId: canonical.id, bytes: `${canonicalJson(after)}\n` }],
    semantic: {
      effect: semantic.effect,
      changes: semantic.changes,
      revisions: semantic.revisions,
    },
    invalidated: {
      artifacts: closure.artifacts,
      projections: closure.projections,
      packages: closure.packages,
      checks: closure.requiredChecks,
    },
    versionEffect: semantic.versionEffect,
    proofEffects: {
      status: 'pending',
      deferred: closure.deferred,
      checks: closure.requiredChecks,
    },
    readiness: {
      status: 'not-ready',
      reason: 'preview-only; required checks and proof remain unexecuted',
    },
    confirmationPolicy: {
      mode: 'read-only',
      requiresConfirmation: false,
      authorization: 'not applicable',
    },
  });
}
