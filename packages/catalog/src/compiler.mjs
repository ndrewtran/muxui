import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  QUERY_API_VERSIONS,
  SCHEMA_VERSION,
  bindingContentRevision,
  bindingSpecRevision,
  canonicalDigest,
  canonicalJson,
  compilePlatformSafetyRequirementSets,
  contentRevision,
  parseJsonStrict,
  sha256Digest,
  validateCatalogRecords,
  validateFamily,
} from '@muxui/schema';
import { compileTokenRequirementSet, validateSourceCrosswalk } from '@muxui/tokens';
const SOURCE_MANIFEST_SCHEMA = 'muxui-catalog-source-manifest-v1';

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortByKeys(values, keys) {
  return [...values].sort((left, right) => {
    for (const key of keys) {
      const comparison = compareText(String(left[key]), String(right[key]));
      if (comparison !== 0) return comparison;
    }
    return 0;
  });
}

function assertRelativePath(path, field) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.startsWith('/')
    || path.split('/').includes('..')
  ) {
    throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: ${field} must be repository-relative`);
  }
}

function validateSourceManifest(manifest) {
  if (
    manifest === null
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.schema !== SOURCE_MANIFEST_SCHEMA
    || !Array.isArray(manifest.records)
    || manifest.records.length === 0
    || Object.keys(manifest).some((key) => ![
      'schema',
      'authorityDecisionPath',
      'commandRegistryPath',
      'pageBudgetProfilePath',
      'platformSafetyContractPath',
      'queryApiVersion',
      'records',
      'supportedQueryApiVersions',
    ].includes(key))
    || typeof manifest.authorityDecisionPath !== 'string'
    || typeof manifest.commandRegistryPath !== 'string'
    || typeof manifest.pageBudgetProfilePath !== 'string'
    || typeof manifest.platformSafetyContractPath !== 'string'
    || !QUERY_API_VERSIONS.includes(manifest.queryApiVersion)
    || !Array.isArray(manifest.supportedQueryApiVersions)
    || manifest.supportedQueryApiVersions.length === 0
    || manifest.supportedQueryApiVersions.some((version) => !QUERY_API_VERSIONS.includes(version))
    || new Set(manifest.supportedQueryApiVersions).size !== manifest.supportedQueryApiVersions.length
    || !manifest.supportedQueryApiVersions.includes(manifest.queryApiVersion)
  ) {
    throw new Error('MUXUI_CATALOG_SOURCE_INVALID: invalid catalog source manifest');
  }
  const paths = new Set();
  assertRelativePath(manifest.authorityDecisionPath, 'authorityDecisionPath');
  assertRelativePath(manifest.commandRegistryPath, 'commandRegistryPath');
  assertRelativePath(manifest.pageBudgetProfilePath, 'pageBudgetProfilePath');
  assertRelativePath(manifest.platformSafetyContractPath, 'platformSafetyContractPath');
  for (const [index, entry] of manifest.records.entries()) {
    if (
      entry === null
      || typeof entry !== 'object'
      || Array.isArray(entry)
      || !['capability', 'component', 'example', 'guide', 'token-source'].includes(entry.family)
      || Object.keys(entry).some((key) => !['baselineOccurrencesPath', 'family', 'path', 'sourcePath'].includes(key))
    ) {
      throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: invalid records/${index}`);
    }
    assertRelativePath(entry.path, `records/${index}/path`);
    if (entry.baselineOccurrencesPath !== undefined) {
      assertRelativePath(entry.baselineOccurrencesPath, `records/${index}/baselineOccurrencesPath`);
      if (entry.family !== 'token-source') {
        throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: records/${index}/baselineOccurrencesPath requires token-source`);
      }
    }
    if (entry.sourcePath !== undefined) {
      assertRelativePath(entry.sourcePath, `records/${index}/sourcePath`);
    }
    if (paths.has(entry.path)) {
      throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: duplicate ${entry.path}`);
    }
    paths.add(entry.path);
  }
  return {
    schema: manifest.schema,
    authorityDecisionPath: manifest.authorityDecisionPath,
    commandRegistryPath: manifest.commandRegistryPath,
    pageBudgetProfilePath: manifest.pageBudgetProfilePath,
    platformSafetyContractPath: manifest.platformSafetyContractPath,
    queryApiVersion: manifest.queryApiVersion,
    records: [...manifest.records].sort((left, right) => compareText(left.path, right.path)),
    supportedQueryApiVersions: [...manifest.supportedQueryApiVersions],
  };
}

function countLexemes(value) {
  return canonicalJson(value).match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

function currentPageProfileIdentity(profile) {
  const legacySlugPrefix = `${['core', 'ui'].join('-')}-`;
  const legacyDiagnosticPrefix = ['CORE', '_'].join('');
  const replacePrefix = (value, prefix, replacement) => (
    value.startsWith(prefix) ? `${replacement}${value.slice(prefix.length)}` : value
  );
  return {
    ...profile,
    schema: 'muxui-token-section-page-budget-profile-v1',
    id: replacePrefix(profile.id, legacySlugPrefix, 'muxui-'),
    lexerVersion: replacePrefix(profile.lexerVersion, legacySlugPrefix, 'muxui-'),
    oversizeCode: replacePrefix(profile.oversizeCode, legacyDiagnosticPrefix, 'MUXUI_'),
    cursorProfile: replacePrefix(profile.cursorProfile, legacySlugPrefix, 'muxui-'),
    envelopeOversizeCode: replacePrefix(profile.envelopeOversizeCode, legacyDiagnosticPrefix, 'MUXUI_'),
  };
}

export function assertAcceptedQueryProfile({ manifest, pageBudgetProfile, authorityDecision }) {
  validateFamily('token-section-page-budget-profile', pageBudgetProfile);
  const acceptedPageProfile = authorityDecision.pageProfiles?.find(
    ({ queryApiVersion }) => queryApiVersion === manifest.queryApiVersion,
  );
  const expectedPhase = manifest.queryApiVersion === '2.0.0' ? 'B' : 'A';
  const phase = authorityDecision.queryCompatibility?.phases?.find(
    ({ phase: phaseId }) => phaseId === expectedPhase,
  );
  if (!acceptedPageProfile || !phase) {
    throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: accepted Phase ${expectedPhase} profile is missing`);
  }
  const { normalizedWorstCaseEnvelopePreimage, ...acceptedPageValues } = acceptedPageProfile;
  const expectedPageBudgetProfile = currentPageProfileIdentity({
    schema: 'muxui-token-section-page-budget-profile-v1',
    ...acceptedPageValues,
  });
  if (
    canonicalJson(pageBudgetProfile) !== canonicalJson(expectedPageBudgetProfile)
    || canonicalDigest(normalizedWorstCaseEnvelopePreimage)
      !== pageBudgetProfile.normalizedWorstCaseEnvelopeSha256
    || countLexemes(normalizedWorstCaseEnvelopePreimage)
      !== pageBudgetProfile.measuredWorstCaseEnvelopeTokens
    || manifest.queryApiVersion !== phase.selectedCatalogQueryApiVersion
    || canonicalJson(manifest.supportedQueryApiVersions)
      !== canonicalJson(phase.selectedCatalogSupportedQueryApiVersions)
  ) {
    throw new Error(`MUXUI_CATALOG_SOURCE_INVALID: Phase ${expectedPhase} profile differs from accepted authority`);
  }
  return pageBudgetProfile;
}

export const assertPhaseAQueryProfile = assertAcceptedQueryProfile;

function tokenize(value) {
  return String(value).toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function collectSearchFields(record, relations) {
  const fields = [
    ['id', record.id],
    ['name', record.name],
    ['summary', record.summary],
  ];
  for (const keyword of record.keywords ?? []) fields.push(['keyword', keyword]);
  for (const value of record.intent?.useWhen ?? []) fields.push(['intent.useWhen', value]);
  for (const value of record.intent?.avoidWhen ?? []) fields.push(['intent.avoidWhen', value]);
  for (const relation of relations) {
    if (relation.source === record.id || relation.target === record.id) {
      fields.push(['relation', `${relation.type} ${relation.source} ${relation.target}`]);
    }
  }
  const terms = [];
  const claimed = new Set();
  for (const [field, value] of fields) {
    for (const term of tokenize(value)) {
      const key = `${field}\0${term}\0${value}`;
      if (!claimed.has(key)) {
        claimed.add(key);
        terms.push({ field, term, value });
      }
    }
  }
  return sortByKeys(terms, ['term', 'field', 'value']);
}

function recordPlatforms(record) {
  if (record.kind === 'component') {
    const platforms = Object.entries(record.bindings)
      .filter(([, binding]) => binding.strategy !== 'unsupported')
      .map(([bindingId]) => bindingId);
    const nativeWeb = record.bindings['native.react-native']
      ?.runtimeProfiles?.['native.react-native-web'];
    if (nativeWeb && nativeWeb.strategy !== 'unsupported') {
      platforms.push('native.react-native-web');
    }
    return platforms.sort(compareText);
  }
  if (record.kind === 'example') {
    return [record.binding.ref.split('#')[1], ...(record.binding.runtimeProfiles ?? [])]
      .sort(compareText);
  }
  if (record.kind === 'guide') return [...record.platforms].sort(compareText);
  return [];
}

function bindingProfiles(bindingId, binding) {
  if (bindingId !== 'native.react-native') return [bindingId];
  return Object.values(binding.runtimeProfiles ?? {})
    .filter(({ strategy }) => strategy !== 'unsupported')
    .map(({ validationProfile }) => validationProfile)
    .sort(compareText);
}

export async function compileCatalog({
  repositoryRoot,
  sourceManifestPath = 'packages/catalog/catalog-sources.json',
} = {}) {
  if (!repositoryRoot) {
    throw new Error('MUXUI_CATALOG_SOURCE_INVALID: repositoryRoot is required');
  }
  const packageManifest = parseJsonStrict(await readFile(
    resolve(repositoryRoot, 'packages/catalog/package.json'),
    'utf8',
  ));
  const catalogVersion = packageManifest.version;
  const manifestBytes = await readFile(resolve(repositoryRoot, sourceManifestPath), 'utf8');
  const manifest = validateSourceManifest(parseJsonStrict(manifestBytes));
  const commandRegistryBytes = await readFile(
    resolve(repositoryRoot, manifest.commandRegistryPath),
    'utf8',
  );
  const commandRegistry = parseJsonStrict(commandRegistryBytes);
  const queryVersionOption = commandRegistry.selectors?.find(
    ({ requestKey }) => requestKey === 'queryApiVersion',
  );
  if (
    !queryVersionOption
    || canonicalJson(queryVersionOption.choices) !== canonicalJson(QUERY_API_VERSIONS)
  ) {
    throw new Error('MUXUI_CATALOG_SOURCE_INVALID: query-version CLI choices must project schema grammar');
  }
  const authorityDecisionBytes = await readFile(
    resolve(repositoryRoot, manifest.authorityDecisionPath),
    'utf8',
  );
  const authorityDecision = parseJsonStrict(authorityDecisionBytes);
  const pageBudgetProfileBytes = await readFile(
    resolve(repositoryRoot, manifest.pageBudgetProfilePath),
    'utf8',
  );
  const pageBudgetProfile = parseJsonStrict(pageBudgetProfileBytes);
  assertAcceptedQueryProfile({ manifest, pageBudgetProfile, authorityDecision });
  const platformSafetyContractBytes = await readFile(
    resolve(repositoryRoot, manifest.platformSafetyContractPath),
    'utf8',
  );
  const platformSafetyContract = parseJsonStrict(platformSafetyContractBytes);
  const loaded = [];

  for (const entry of manifest.records) {
    const recordBytes = await readFile(resolve(repositoryRoot, entry.path), 'utf8');
    const record = parseJsonStrict(recordBytes);
    validateFamily(entry.family, record);
    let sourceBytes;
    let baselineOccurrencesBytes;
    if (entry.sourcePath !== undefined) {
      sourceBytes = await readFile(resolve(repositoryRoot, entry.sourcePath), 'utf8');
      if (record.source !== entry.sourcePath) {
        throw new Error(
          `MUXUI_CATALOG_SOURCE_INVALID: ${entry.path} must point to ${entry.sourcePath}`,
        );
      }
    }
    if (entry.baselineOccurrencesPath !== undefined) {
      baselineOccurrencesBytes = await readFile(
        resolve(repositoryRoot, entry.baselineOccurrencesPath),
        'utf8',
      );
    }
    if (record.kind === 'token') {
      const baselineOccurrences = baselineOccurrencesBytes === undefined
        ? undefined
        : parseJsonStrict(baselineOccurrencesBytes);
      validateSourceCrosswalk(record, { baselineOccurrences });
    }
    loaded.push({
      entry,
      record,
      recordBytes,
      sourceBytes,
      baselineOccurrencesBytes,
    });
  }

  const records = loaded.map(({ record }) => record);
  const { edges } = validateCatalogRecords(records);
  const relations = sortByKeys(edges, ['type', 'source', 'target']);
  const examples = records.filter(({ kind }) => kind === 'example');
  const tokens = records.filter(({ kind }) => kind === 'token');
  const exampleSources = Object.fromEntries(
    loaded
      .filter(({ record }) => record.kind === 'example')
      .map(({ record, sourceBytes }) => [record.id, sourceBytes]),
  );

  const artifacts = loaded.map(({ entry, record, sourceBytes }) => {
    const revision = contentRevision(entry.family, record, { sourceBytes });
    const tokenRequirementSets = record.kind === 'component'
      ? Object.fromEntries(Object.entries(record.bindings)
        .filter(([, binding]) => binding.strategy !== 'unsupported')
        .flatMap(([bindingId, binding]) => {
          const source = tokens.find(({ id }) => id === binding.tokenRecipe.source);
          if (!source) throw new Error(`MUXUI_RELATION_INVALID: missing ${binding.tokenRecipe.source}`);
          return bindingProfiles(bindingId, binding).map((profile) => {
            const requirementSet = compileTokenRequirementSet({
              source,
              recipe: binding.tokenRecipe,
              bindingId,
              profile,
            });
            return [`${bindingId}:${profile}`, requirementSet];
          });
        }).sort(([left], [right]) => compareText(left, right)))
      : {};
    const platformSafetyRequirementSets = record.kind === 'component'
      ? Object.fromEntries(Object.entries(record.bindings)
        .flatMap(([bindingId, binding]) => Object.entries(compilePlatformSafetyRequirementSets({
          contract: platformSafetyContract,
          bindingId,
          binding,
        })).map(([profile, requirementSet]) => [
          `${bindingId}:${profile}`,
          requirementSet,
        ]))
        .sort(([left], [right]) => compareText(left, right)))
      : {};
    const bindingSpecRevisions = record.kind === 'component'
      ? Object.fromEntries(
        Object.entries(record.bindings)
          .map(([bindingId]) => [bindingId, bindingSpecRevision({
            component: record,
            bindingId,
            examples: examples.filter((example) => example.binding.ref.startsWith(`${record.id}#`)),
            exampleSources: Object.fromEntries(
              examples
                .filter((example) => example.binding.ref.startsWith(`${record.id}#`))
                .map((example) => [example.id, exampleSources[example.id]]),
            ),
            tokenSources: tokens,
            tokenRequirementSets: Object.entries(tokenRequirementSets)
              .filter(([key]) => key.startsWith(`${bindingId}:`))
              .map(([, value]) => value),
            platformSafetyRequirementSets: Object.entries(platformSafetyRequirementSets)
              .filter(([key]) => key.startsWith(`${bindingId}:`))
              .map(([, value]) => value),
          })]),
      )
      : {};
    const bindingContentRevisions = record.kind === 'component'
      ? Object.fromEntries(
        Object.entries(record.bindings)
          .map(([bindingId, binding]) => [bindingId, bindingContentRevision(binding)]),
      )
      : {};
    return {
      id: record.id,
      kind: record.kind,
      name: record.name,
      summary: record.summary,
      lifecycle: record.lifecycle,
      platforms: recordPlatforms(record),
      contentRevision: revision,
      bindingContentRevisions,
      bindingSpecRevisions,
      tokenRequirementSets,
      platformSafetyRequirementSets,
      ...(record.kind === 'token' ? {
        sourceCrosswalkDigest: record.sourceCrosswalk === undefined
          ? null
          : canonicalDigest(record.sourceCrosswalk),
      } : {}),
      source: {
        record: entry.path,
        ...(entry.sourcePath === undefined ? {} : {
          content: entry.sourcePath,
          contentDigest: sha256Digest(sourceBytes),
        }),
      },
      record,
    };
  }).sort((left, right) => compareText(left.id, right.id));

  const sourceRevision = canonicalDigest({
    manifest,
    authorityDecisionDigest: sha256Digest(authorityDecisionBytes),
    commandRegistryDigest: sha256Digest(commandRegistryBytes),
    pageBudgetProfileDigest: sha256Digest(pageBudgetProfileBytes),
    platformSafetyContractDigest: canonicalDigest(platformSafetyContract),
    inputs: loaded.map(({ entry, recordBytes, sourceBytes, baselineOccurrencesBytes }) => ({
      path: entry.path,
      digest: sha256Digest(recordBytes),
      ...(entry.sourcePath === undefined ? {} : {
        sourcePath: entry.sourcePath,
        sourceDigest: sha256Digest(sourceBytes),
      }),
      ...(entry.baselineOccurrencesPath === undefined ? {} : {
        baselineOccurrencesPath: entry.baselineOccurrencesPath,
        baselineOccurrencesDigest: sha256Digest(baselineOccurrencesBytes),
      }),
    })),
  });
  const searchIndex = artifacts.map(({ id, record }) => ({
    id,
    terms: collectSearchFields(record, relations),
  }));
  const preimage = {
    formatVersion: '1.0.0',
    apiVersion: manifest.queryApiVersion,
    supportedQueryApiVersions: manifest.supportedQueryApiVersions,
    schemaVersion: SCHEMA_VERSION,
    catalogVersion,
    sourceRevision,
    commandRegistry,
    pageBudgetProfile,
    platformSafetyContract,
    platformSafetyContractDigest: canonicalDigest(platformSafetyContract),
    artifacts,
    relations,
    searchIndex,
  };
  const catalogDigest = canonicalDigest(preimage);
  const bundle = { ...preimage, catalogDigest };
  return { bundle, bytes: canonicalJson(bundle) };
}
