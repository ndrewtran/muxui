import {
  API_VERSION,
  ARTIFACT_KINDS,
  ARTIFACT_REF_PATTERN,
  QUERY_ENVELOPE_SCHEMA_ID,
  QUERY_RESPONSE_TYPES,
  QUERY_SCHEMA_VERSION,
  QUERY_API_VERSIONS,
  QUERY_SELECTORS,
  canonicalDigest,
  canonicalJson,
  parseJsonStrict,
  sha256Digest,
  validateCatalogRecords,
  validateFamily,
} from '@muxui/schema';
import { catalogJson } from '../generated/catalog.mjs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_QUERY_LENGTH = 256;
const MAX_QUERY_TERMS = 16;
const OPERATIONS = {
  getManifest: {
    available: true,
    requestKeys: ['detail'],
    responseType: 'catalog.manifest',
  },
  listArtifacts: {
    available: true,
    requestKeys: ['cursor', 'detail', 'kind', 'limit', 'platform', 'purpose'],
    responseType: 'artifact.list',
  },
  searchArtifacts: {
    available: true,
    requestKeys: ['cursor', 'detail', 'limit', 'platform', 'purpose', 'query'],
    responseType: 'artifact.search',
  },
  getArtifact: {
    available: true,
    requestKeys: ['cursor', 'detail', 'id', 'limit', 'platform', 'purpose', 'queryApiVersion', 'section'],
    responseType: 'artifact.detail',
  },
  planComposition: {
    available: false,
    requestKeys: [],
    responseType: null,
  },
};

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

function assertBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: catalog bundle must be an object');
  }
  const { catalogDigest, ...preimage } = bundle;
  if (catalogDigest !== canonicalDigest(preimage)) {
    throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: catalog digest does not match bundle');
  }
  if (!Array.isArray(bundle.artifacts)) {
    throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: catalog artifacts must be an array');
  }
  validateCatalogRecords(bundle.artifacts.map(({ record }) => record));
  if (
    !QUERY_API_VERSIONS.includes(bundle.apiVersion)
    || !Array.isArray(bundle.supportedQueryApiVersions)
    || bundle.supportedQueryApiVersions.length === 0
    || bundle.supportedQueryApiVersions.some((version) => !QUERY_API_VERSIONS.includes(version))
    || new Set(bundle.supportedQueryApiVersions).size !== bundle.supportedQueryApiVersions.length
    || !bundle.supportedQueryApiVersions.includes(bundle.apiVersion)
  ) {
    throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: invalid selected query descriptor');
  }
  for (const artifact of bundle.artifacts ?? []) {
    if (artifact.kind !== 'token') continue;
    validateFamily('token-source', artifact.record);
    const expectedCrosswalkDigest = artifact.record.sourceCrosswalk === undefined
      ? null
      : canonicalDigest(artifact.record.sourceCrosswalk);
    if (artifact.sourceCrosswalkDigest !== expectedCrosswalkDigest) {
      throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: token crosswalk digest does not match its sole canonical field');
    }
  }
  validateFamily('token-section-page-budget-profile', bundle.pageBudgetProfile);
  return deepFreeze(structuredClone(bundle));
}

export function createCatalogDiagnostic({
  code,
  ruleId,
  message,
  details,
  retryable = false,
  nextCommand,
  apiVersion = API_VERSION,
}) {
  const response = {
    apiVersion,
    type: 'error',
    error: {
      code,
      ruleId,
      message,
      retryable,
      details,
      ...(nextCommand === undefined ? {} : { nextCommand }),
    },
  };
  validateFamily('query-envelope', response);
  return deepFreeze(response);
}

function queryError(code, ruleId, message, details, retryable = false, apiVersion = API_VERSION) {
  return createCatalogDiagnostic({ code, ruleId, message, details, retryable, apiVersion });
}

function success(type, data, meta, { apiVersion = API_VERSION, warnings = [] } = {}) {
  const response = { apiVersion, type, data, meta, warnings };
  validateFamily('query-envelope', response);
  return deepFreeze(response);
}

export function validateTokenDetailSummary({ responseArtifact, selectedArtifact }) {
  if (
    !responseArtifact
    || responseArtifact.kind !== 'token'
    || !selectedArtifact
    || selectedArtifact.kind !== 'token'
  ) {
    throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: token summary requires one selected token artifact');
  }
  const expected = {
    availableSections: tokenAvailableSections(selectedArtifact),
    sourceCrosswalkDigest: selectedArtifact.sourceCrosswalkDigest,
    tokenCount: Object.keys(selectedArtifact.record.tokens).length,
    tokenSourceContentRevision: selectedArtifact.contentRevision,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (canonicalJson(responseArtifact[field]) !== canonicalJson(value)) {
      throw new Error(`MUXUI_CATALOG_INTEGRITY_MISMATCH: token summary ${field} does not match the selected artifact`);
    }
  }
  return true;
}

function tokenAvailableSections(artifact) {
  return Array.isArray(artifact.record.sourceCrosswalk?.entries)
    ? ['tokens', 'source-crosswalk']
    : ['tokens'];
}

function normalizeRequest(request, operation, bundle) {
  const currentQueryApiVersion = bundle.apiVersion;
  const supportedQueryApiVersions = bundle.supportedQueryApiVersions;
  if (request === undefined) request = {};
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    return { error: queryError(
      'MUXUI_QUERY_INVALID',
      'query.request.object',
      `${operation} request must be an object.`,
      { operation },
      false,
      currentQueryApiVersion,
    ) };
  }
  const operationKeys = OPERATIONS[operation]?.requestKeys ?? [];
  const allowed = new Set(operationKeys);
  const unknown = Object.keys(request).filter((key) => !allowed.has(key)).sort(compareText);
  if (unknown.length > 0) {
    return { error: queryError(
      'MUXUI_QUERY_INVALID',
      'query.request.unknown-field',
      `${operation} request contains unknown fields.`,
      { operation, fields: unknown },
      false,
      currentQueryApiVersion,
    ) };
  }
  const pagedSection = operation === 'getArtifact'
    && ['tokens', 'source-crosswalk'].includes(request.section ?? null);
  const defaultLimit = pagedSection
    ? bundle.pageBudgetProfile.defaultItemLimit
    : DEFAULT_LIMIT;
  const maximumLimit = pagedSection
    ? bundle.pageBudgetProfile.maximumItemLimit
    : MAX_LIMIT;
  const normalized = {
    detail: request.detail ?? 'compact',
    limit: request.limit ?? defaultLimit,
    platform: request.platform ?? null,
    purpose: request.purpose ?? null,
    section: request.section ?? null,
    cursor: request.cursor ?? null,
    queryApiVersion: request.queryApiVersion ?? currentQueryApiVersion,
  };
  for (const key of operationKeys) {
    if (!Object.hasOwn(normalized, key)) normalized[key] = request[key] ?? null;
  }
  const failures = [];
  if (!QUERY_API_VERSIONS.includes(normalized.queryApiVersion)) failures.push('queryApiVersion');
  if (!QUERY_SELECTORS.detail.includes(normalized.detail)) failures.push('detail');
  if (normalized.platform !== null && !QUERY_SELECTORS.platform.includes(normalized.platform)) {
    failures.push('platform');
  }
  if (normalized.purpose !== null && !QUERY_SELECTORS.purpose.includes(normalized.purpose)) {
    failures.push('purpose');
  }
  if (normalized.section !== null && !QUERY_SELECTORS.section.includes(normalized.section)) {
    failures.push('section');
  }
  if (!Number.isInteger(normalized.limit) || normalized.limit < 1 || normalized.limit > maximumLimit) {
    failures.push('limit');
  }
  if (normalized.cursor !== null && typeof normalized.cursor !== 'string') failures.push('cursor');
  if (failures.length > 0) {
    return { error: queryError(
      'MUXUI_QUERY_INVALID',
      'query.request.selector',
      `${operation} request has invalid selectors.`,
      { operation, fields: failures.sort(compareText) },
      false,
      currentQueryApiVersion,
    ) };
  }
  if (!supportedQueryApiVersions.includes(normalized.queryApiVersion)) {
    return { error: unsupportedQueryVersion(
      normalized.queryApiVersion,
      supportedQueryApiVersions,
      currentQueryApiVersion,
    ) };
  }
  return { normalized };
}

function unsupportedQueryVersion(version, supported, currentQueryApiVersion = API_VERSION) {
  return queryError(
    'MUXUI_QUERY_API_VERSION_UNSUPPORTED',
    'query.api-version.supported',
    `Query API ${version} is not supported by the selected catalog.`,
    { queryApiVersion: version, supportedQueryApiVersions: supported },
    false,
    currentQueryApiVersion,
  );
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  return parseJsonStrict(Buffer.from(value, 'base64url').toString('utf8'));
}

function countLexemes(value) {
  return canonicalJson(value).match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

function encodeSectionCursor(payload, profile) {
  const bytes = canonicalJson(payload);
  if (profile.cursorProfile !== 'muxui-section-cursor-v1') {
    throw new Error('invalid cursor profile');
  }
  return `c1.${Buffer.from(bytes, 'utf8').toString('base64url')}.${sha256Digest(bytes).slice(7)}`;
}

function decodeSectionCursor(value, profile) {
  if (
    profile.cursorProfile !== 'muxui-section-cursor-v1'
    || typeof value !== 'string'
    || Buffer.byteLength(value, 'utf8') > profile.cursorMaximumBytes
  ) throw new Error('invalid cursor');
  const match = /^c1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/u.exec(value);
  if (!match) throw new Error('invalid cursor');
  const bytes = Buffer.from(match[1], 'base64url').toString('utf8');
  if (Buffer.from(bytes, 'utf8').toString('base64url') !== match[1]) throw new Error('invalid cursor');
  if (sha256Digest(bytes).slice(7) !== match[2]) throw new Error('invalid cursor');
  const payload = parseJsonStrict(bytes);
  const keys = [...profile.cursorBindings].sort(compareText);
  if (
    payload === null
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || canonicalJson(Object.keys(payload).sort(compareText)) !== canonicalJson(keys)
  ) throw new Error('invalid cursor');
  return payload;
}

function sectionPage(bundle, artifact, request) {
  const profile = bundle.pageBudgetProfile;
  if (!['1.2.0', '2.0.0'].includes(request.queryApiVersion)) {
    return { error: queryError(
      'MUXUI_QUERY_INVALID',
      'query.section.version',
      'Sectional token retrieval requires query API 1.2.0 or 2.0.0.',
      { queryApiVersion: request.queryApiVersion, section: request.section },
      false,
      request.queryApiVersion,
    ) };
  }
  if (artifact.kind !== 'token') {
    return { error: queryError(
      'MUXUI_QUERY_INVALID',
      'query.section.artifact-kind',
      'Token sections require a token artifact.',
      { id: artifact.id, section: request.section },
      false,
      request.queryApiVersion,
    ) };
  }
  if (
    Buffer.byteLength(artifact.id, 'utf8') > profile.artifactIdMaximumBytes
    || Buffer.byteLength(bundle.catalogVersion, 'utf8') > profile.catalogVersionMaximumBytes
  ) {
    return { error: queryError(
      profile.envelopeOversizeCode,
      'query.page.envelope-bound',
      'The requested page identity exceeds the accepted envelope bound.',
      { artifactId: artifact.id, catalogVersion: bundle.catalogVersion },
      false,
      request.queryApiVersion,
    ) };
  }
  const tokenSourceContentRevision = (
    request.queryApiVersion === '1.2.0'
    && artifact.record.schemaVersion === '2.1.0'
    && artifact.record.sourceCrosswalk === undefined
  ) ? canonicalDigest({
      ...artifact.record,
      schemaVersion: '2.0.0',
    }) : artifact.contentRevision;
  const selectorDigest = canonicalDigest({
    artifactId: artifact.id,
    platform: request.platform,
    detail: request.detail,
    purpose: request.purpose,
    section: request.section,
    limit: request.limit,
  });
  const sourceCrosswalk = artifact.record.sourceCrosswalk;
  const available = request.section === 'tokens'
    || (request.section === 'source-crosswalk' && Array.isArray(sourceCrosswalk?.entries));
  const groupByOrdinal = new Map((sourceCrosswalk?.groups ?? []).flatMap((group) => (
    group.members.map((member) => [member.ordinal, { group, member }])
  )));
  const values = request.section === 'tokens'
    ? Object.entries(artifact.record.tokens)
      .map(([id, definition]) => ({ id, definition }))
      .sort((left, right) => compareText(left.id, right.id))
    : available
      ? sourceCrosswalk.entries.map((entry) => {
        if (request.queryApiVersion !== '2.0.0' || entry.groupId === undefined) return entry;
        const match = groupByOrdinal.get(entry.occurrence.ordinal);
        if (!match || match.group.id !== entry.groupId) {
          throw new Error('MUXUI_CATALOG_INTEGRITY_MISMATCH: validated crosswalk group projection is incomplete');
        }
        return {
          ...entry,
          group: {
            id: match.group.id,
            relationship: match.group.relationship,
            ...(match.group.muxuiTokenId === undefined ? {} : { muxuiTokenId: match.group.muxuiTokenId }),
            member: match.member,
          },
        };
      }).sort((left, right) => (
        left.occurrence.ordinal - right.occurrence.ordinal
        || compareText(canonicalJson(left), canonicalJson(right))
      ))
      : [];
  let position = 0;
  if (request.cursor !== null) {
    try {
      const payload = decodeSectionCursor(request.cursor, profile);
      if (
        payload.queryApiVersion !== request.queryApiVersion
        || payload.catalogDigest !== bundle.catalogDigest
        || payload.tokenSourceContentRevision !== tokenSourceContentRevision
        || payload.section !== request.section
        || payload.selectorDigest !== selectorDigest
        || !Number.isInteger(payload.nextPosition)
        || payload.nextPosition < 1
        || payload.nextPosition > profile.cursorPositionMaximum
        || payload.nextPosition > values.length
      ) throw new Error('cursor identity mismatch');
      position = payload.nextPosition;
    } catch {
      return { error: queryError(
        'MUXUI_CURSOR_INVALID',
        'query.section.cursor.identity',
        'The section cursor does not belong to this catalog, source, version, and selector.',
        { artifactId: artifact.id, section: request.section },
        true,
        request.queryApiVersion,
      ) };
    }
  }
  const items = [];
  let entryTokens = 0;
  for (const entry of values.slice(position, position + request.limit)) {
    const cost = countLexemes(entry);
    if (cost > profile.maximumEntryTokens) {
      return { error: queryError(
        profile.oversizeCode,
        'query.page.entry-bound',
        'One complete section entry exceeds the accepted page-entry budget.',
        { artifactId: artifact.id, section: request.section, entryId: entry.id, entryTokens: cost },
        false,
        request.queryApiVersion,
      ) };
    }
    if (
      entryTokens + cost
      > profile.densePageBudgetTokens - profile.envelopeReserveTokens
    ) break;
    items.push(entry);
    entryTokens += cost;
  }
  if (position < values.length && items.length === 0) {
    return { error: queryError(
      profile.oversizeCode,
      'query.page.minimum-progress',
      'The page cannot make the required one-entry minimum progress.',
      { artifactId: artifact.id, section: request.section, position },
      false,
      request.queryApiVersion,
    ) };
  }
  const nextPosition = position + items.length;
  const remaining = values.length - nextPosition;
  if (remaining > 0 && nextPosition >= profile.cursorPositionMaximum) {
    return { error: queryError(
      'MUXUI_CURSOR_INVALID',
      'query.section.cursor.position-overflow',
      'The next section position exceeds the cursor profile.',
      { artifactId: artifact.id, section: request.section, position: nextPosition },
      false,
      request.queryApiVersion,
    ) };
  }
  const nextCursor = remaining > 0 ? encodeSectionCursor({
    catalogDigest: bundle.catalogDigest,
    nextPosition,
    queryApiVersion: request.queryApiVersion,
    section: request.section,
    selectorDigest,
    tokenSourceContentRevision,
  }, profile) : null;
  if (
    nextCursor !== null
    && Buffer.byteLength(nextCursor, 'utf8') > profile.cursorMaximumBytes
  ) {
    return { error: queryError(
      profile.envelopeOversizeCode,
      'query.page.cursor-bound',
      'The next section cursor exceeds the accepted envelope bound.',
      { artifactId: artifact.id, section: request.section },
      false,
      request.queryApiVersion,
    ) };
  }
  const response = {
    schemaVersion: request.queryApiVersion,
    responseType: 'artifact.detail.section-page',
    meta: {
      queryApiVersion: request.queryApiVersion,
      catalogVersion: bundle.catalogVersion,
      catalogDigest: bundle.catalogDigest,
      tokenSourceContentRevision,
      artifactId: artifact.id,
      section: request.section,
      selectorDigest,
    },
    entries: available
      ? { status: 'available', items }
      : {
        status: 'absent',
        reason: artifact.record.schemaVersion === '2.0.0'
          ? 'token-source-schema-does-not-declare-source-crosswalk'
          : 'token-source-omits-source-crosswalk',
        tokenSourceSchemaVersion: artifact.record.schemaVersion,
        items: [],
      },
    page: {
      position,
      returned: items.length,
      remaining,
      nextCursor,
      entryTokens,
      densePageBudget: profile.densePageBudgetTokens,
    },
    diagnostics: [],
  };
  const { entries: _entries, ...normalizedEnvelope } = response;
  if (countLexemes(normalizedEnvelope) > profile.envelopeReserveTokens) {
    return { error: queryError(
      profile.envelopeOversizeCode,
      'query.page.envelope-budget',
      'The section page envelope exceeds the accepted token reserve.',
      { artifactId: artifact.id, section: request.section },
      false,
      request.queryApiVersion,
    ) };
  }
  validateFamily('section-page', response);
  return { response: deepFreeze(response) };
}

function paginate(values, operation, request, catalogDigest) {
  const requestWithoutCursor = { ...request, cursor: null };
  const requestDigest = canonicalDigest({ operation, request: requestWithoutCursor });
  let offset = 0;
  if (request.cursor !== null) {
    try {
      const decoded = decodeCursor(request.cursor);
      if (
        decoded.catalogDigest !== catalogDigest
        || decoded.operation !== operation
        || decoded.requestDigest !== requestDigest
        || !Number.isInteger(decoded.offset)
        || decoded.offset < 0
        || decoded.offset > values.length
      ) {
        throw new Error('mismatch');
      }
      offset = decoded.offset;
    } catch {
      return { error: queryError(
        'MUXUI_CURSOR_INVALID',
        'query.cursor.identity',
        'The cursor does not belong to this catalog and request.',
        { operation, catalogDigest },
        true,
        request.queryApiVersion,
      ) };
    }
  }
  const items = values.slice(offset, offset + request.limit);
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < values.length
    ? encodeCursor({ catalogDigest, operation, requestDigest, offset: nextOffset })
    : null;
  return { items, nextCursor, truncated: nextCursor !== null };
}

function summary(artifact, detail = 'compact') {
  const brief = {
    id: artifact.id,
    kind: artifact.kind,
    name: artifact.name,
    summary: artifact.summary,
    lifecycle: artifact.lifecycle,
    platforms: artifact.platforms,
    source: artifact.source,
  };
  if (detail === 'brief') return brief;
  return {
    ...brief,
    contentRevision: artifact.contentRevision,
  };
}

function tokenSectionSummary(artifact) {
  return {
    availableSections: tokenAvailableSections(artifact),
    sourceCrosswalkDigest: artifact.sourceCrosswalkDigest,
    tokenCount: Object.keys(artifact.record.tokens).length,
    tokenSourceContentRevision: artifact.contentRevision,
  };
}

function appliesToPlatform(artifact, platform) {
  return platform === null || artifact.platforms.length === 0 || artifact.platforms.includes(platform);
}

function appliesToPurpose(artifact, purpose) {
  return purpose === null
    || artifact.kind !== 'example'
    || artifact.record.binding.purposes.includes(purpose);
}

function related(bundle, artifactId) {
  return bundle.relations.filter(({ source, target }) => (
    source === artifactId
    || target === artifactId
    || source.startsWith(`${artifactId}#`)
    || target.startsWith(`${artifactId}#`)
  ));
}

function bindingForPlatform(record, platform) {
  if (record.kind !== 'component' || platform === null) return null;
  if (platform === 'native.react-native-web') {
    const binding = record.bindings['native.react-native'];
    return binding ? {
      bindingId: 'native.react-native',
      binding,
      runtimeProfileId: 'native.react-native-web',
      runtimeProfile: binding.runtimeProfiles?.['native.react-native-web'] ?? null,
    } : null;
  }
  const binding = record.bindings[platform];
  return binding ? {
    bindingId: platform,
    binding,
    runtimeProfileId: null,
    runtimeProfile: null,
  } : null;
}

function selectedSection(bundle, artifact, request) {
  const record = artifact.record;
  const selectedBinding = bindingForPlatform(record, request.platform);
  if (request.section === 'source') return artifact.source;
  if (request.section === 'api') {
    if (record.kind !== 'component') return null;
    if (selectedBinding) return selectedBinding;
    return Object.fromEntries(Object.entries(record.bindings).map(([id, binding]) => [id, binding.api ?? null]));
  }
  if (request.section === 'accessibility') {
    return record.kind === 'component'
      ? { concept: record.accessibility, binding: selectedBinding?.binding.accessibility ?? null }
      : null;
  }
  if (request.section === 'styling') {
    return record.kind === 'component'
      ? (selectedBinding
        ? {
          recipe: selectedBinding.binding.tokenRecipe,
          requirementSets: Object.fromEntries(Object.entries(artifact.tokenRequirementSets)
            .filter(([key]) => key.startsWith(`${selectedBinding.bindingId}:`))),
          platformSafetyRequirementSets: Object.fromEntries(
            Object.entries(artifact.platformSafetyRequirementSets)
              .filter(([key]) => key.startsWith(`${selectedBinding.bindingId}:`)),
          ),
        }
        : {
          recipes: Object.fromEntries(Object.entries(record.bindings)
            .filter(([, binding]) => binding.strategy !== 'unsupported')
            .map(([id, binding]) => [id, binding.tokenRecipe])),
          requirementSets: artifact.tokenRequirementSets,
          platformSafetyRequirementSets: artifact.platformSafetyRequirementSets,
        })
      : null;
  }
  if (request.section === 'guidance') {
    return { summary: record.summary, intent: record.intent ?? null };
  }
  if (request.section === 'decision-context') return null;
  if (request.section === 'examples') {
    const prefix = `${artifact.id}#`;
    const selectedRef = selectedBinding === null
      ? null
      : `${artifact.id}#${selectedBinding.bindingId}`;
    return bundle.artifacts
      .filter(({ kind, record: candidate }) => (
        kind === 'example'
        && candidate.binding.ref.startsWith(prefix)
        && (selectedRef === null || candidate.binding.ref === selectedRef)
        && (
          selectedBinding?.runtimeProfileId == null
          || (candidate.binding.runtimeProfiles ?? []).includes(selectedBinding.runtimeProfileId)
        )
        && (request.purpose === null || candidate.binding.purposes.includes(request.purpose))
      ))
      .map((candidate) => summary(candidate, request.detail));
  }
  return null;
}

function assertResolutionContext(bundle, input) {
  if (input === undefined) {
    return deepFreeze({
      authority: 'advisory',
      compatibility: 'unresolved',
      catalogSource: 'package',
      sourceRevision: bundle.sourceRevision,
      targetPackages: {},
      muxuiVersion: '0.0.0',
    });
  }
  const allowed = [
    'authority', 'compatibility', 'catalogSource', 'sourceRevision',
    'targetPackages', 'muxuiVersion',
  ];
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).some((key) => !allowed.includes(key))
    || input.authority !== 'installed-local'
    || input.compatibility !== 'exact'
    || !['project', 'cache'].includes(input.catalogSource)
    || input.sourceRevision !== bundle.sourceRevision
    || input.targetPackages === null
    || typeof input.targetPackages !== 'object'
    || Array.isArray(input.targetPackages)
    || Object.values(input.targetPackages).some((version) => (
      typeof version !== 'string' || version.length === 0
    ))
    || input.targetPackages['@muxui/catalog'] !== bundle.catalogVersion
    || typeof input.muxuiVersion !== 'string'
  ) {
    throw new Error(
      'MUXUI_CATALOG_RESOLUTION_CONTEXT_INVALID: expected one verified installed-local context',
    );
  }
  return deepFreeze(structuredClone(input));
}

function baseMeta(bundle, resolutionContext, request = {}, revisions = {}) {
  return {
    schemaVersion: request.queryApiVersion ?? QUERY_SCHEMA_VERSION,
    authority: resolutionContext.authority,
    revisions,
    muxuiVersion: resolutionContext.muxuiVersion,
    catalogVersion: bundle.catalogVersion,
    catalogDigest: bundle.catalogDigest,
    sourceRevision: bundle.sourceRevision,
    resolution: {
      authority: resolutionContext.authority,
      compatibility: resolutionContext.compatibility,
      catalogSource: resolutionContext.catalogSource,
      sourceRevision: resolutionContext.sourceRevision,
      revisions,
      targetPackages: resolutionContext.targetPackages,
    },
    platform: request.platform ?? null,
    detail: request.detail ?? 'full',
    truncated: false,
    nextCursor: null,
  };
}

function resolvedCliRegistry(bundle) {
  const registry = structuredClone(bundle.commandRegistry);
  const available = bundle.artifacts
    .find(({ kind }) => kind === 'capability')
    .record.availableOn.includes('cli');
  const capability = {
    available,
    effect: registry.surfacePolicy.cli.effect,
    requiresConfirmation: registry.surfacePolicy.cli.requiresConfirmation,
  };
  registry.surfacePolicy.cli = capability;
  registry.commands = registry.commands.map((command) => ({
    ...command,
    responseType: OPERATIONS[command.operation]?.responseType ?? null,
    responseSchema: QUERY_ENVELOPE_SCHEMA_ID,
    capability,
  }));
  registry.unavailableCommands = registry.unavailableCommands.map((command) => ({
    ...command,
    capability: { available: false },
  }));
  return registry;
}

function cliRegistryForDetail(bundle, detail) {
  const registry = resolvedCliRegistry(bundle);
  if (detail === 'brief') {
    return {
      name: registry.cli.name,
      version: registry.cli.version,
      commands: registry.commands.map(({ name }) => name),
    };
  }
  if (detail === 'compact') {
    return {
      cli: registry.cli,
      commands: registry.commands.map(({
        name, summary, responseType, responseSchema, tokenBudgets,
      }) => ({
        name,
        summary,
        responseType,
        responseSchema,
        tokenBudgets,
      })),
      outputModes: registry.outputModes,
      unavailableCommands: registry.unavailableCommands,
    };
  }
  return registry;
}

export function createCatalogApi(inputBundle, options = {}) {
  const bundle = assertBundle(inputBundle);
  if (
    options === null
    || typeof options !== 'object'
    || Array.isArray(options)
    || Object.keys(options).some((key) => !['availableBindings', 'resolution'].includes(key))
  ) {
    throw new Error('MUXUI_CATALOG_API_OPTIONS_INVALID: options must be a closed object');
  }
  const resolutionContext = assertResolutionContext(bundle, options.resolution);
  if (
    options.availableBindings !== undefined
    && (
      !Array.isArray(options.availableBindings)
      || options.availableBindings.some((binding) => typeof binding !== 'string')
      || new Set(options.availableBindings).size !== options.availableBindings.length
    )
  ) {
    throw new Error('MUXUI_CATALOG_AVAILABLE_BINDINGS_INVALID: bindings must be unique strings');
  }
  const availableBindings = options.availableBindings === undefined
    ? null
    : new Set(options.availableBindings);
  const artifactsById = new Map(bundle.artifacts.map((artifact) => [artifact.id, artifact]));
  const indexById = new Map(bundle.searchIndex.map((entry) => [entry.id, entry]));

  function implementationAvailable(artifact, platform) {
    if (availableBindings === null || platform === null) return true;
    if (artifact.kind === 'component') {
      const selected = bindingForPlatform(artifact.record, platform);
      return selected === null || availableBindings.has(`${artifact.id}#${selected.bindingId}`);
    }
    if (artifact.kind === 'example') return availableBindings.has(artifact.record.binding.ref);
    return true;
  }

  function getManifest(request) {
    const parsed = normalizeRequest(request, 'getManifest', bundle);
    if (parsed.error) return parsed.error;
    const { normalized } = parsed;
    return success('catalog.manifest', {
      formatVersion: bundle.formatVersion,
      catalogVersion: bundle.catalogVersion,
      catalogDigest: bundle.catalogDigest,
      sourceRevision: bundle.sourceRevision,
      operations: OPERATIONS,
      responseTypes: QUERY_RESPONSE_TYPES,
      selectors: QUERY_SELECTORS,
      artifactKinds: [...new Set(bundle.artifacts.map(({ kind }) => kind))].sort(compareText),
      platforms: QUERY_SELECTORS.platform,
      capabilities: bundle.artifacts
        .filter(({ kind }) => kind === 'capability')
        .map(({ record }) => record),
      cli: cliRegistryForDetail(bundle, normalized.detail),
    }, baseMeta(bundle, resolutionContext, normalized), {
      apiVersion: normalized.queryApiVersion,
    });
  }

  function listArtifacts(request) {
    const parsed = normalizeRequest(request, 'listArtifacts', bundle);
    if (parsed.error) return parsed.error;
    const { normalized } = parsed;
    if (normalized.kind !== null && !ARTIFACT_KINDS.includes(normalized.kind)) {
      return queryError(
        'MUXUI_QUERY_INVALID',
        'query.list.kind',
        'listArtifacts kind must be an enabled ArtifactKind.',
        { kind: normalized.kind },
        false,
        normalized.queryApiVersion,
      );
    }
    const values = bundle.artifacts
      .filter((artifact) => (
        (normalized.kind === null || artifact.kind === normalized.kind)
        && appliesToPlatform(artifact, normalized.platform)
        && implementationAvailable(artifact, normalized.platform)
        && appliesToPurpose(artifact, normalized.purpose)
      ))
      .map((artifact) => summary(artifact, normalized.detail));
    const page = paginate(values, 'listArtifacts', normalized, bundle.catalogDigest);
    if (page.error) return page.error;
    return success('artifact.list', { items: page.items }, {
      ...baseMeta(bundle, resolutionContext, normalized),
      truncated: page.truncated,
      nextCursor: page.nextCursor,
    }, { apiVersion: normalized.queryApiVersion });
  }

  function searchArtifacts(request) {
    const parsed = normalizeRequest(request, 'searchArtifacts', bundle);
    if (parsed.error) return parsed.error;
    const { normalized } = parsed;
    if (
      typeof normalized.query !== 'string'
      || normalized.query.trim().length === 0
      || normalized.query.length > MAX_QUERY_LENGTH
    ) {
      return queryError(
        'MUXUI_QUERY_INVALID',
        'query.search.text',
        `searchArtifacts query must contain 1-${MAX_QUERY_LENGTH} characters.`,
        { query: normalized.query },
        false,
        normalized.queryApiVersion,
      );
    }
    const queryTerms = [...new Set(
      normalized.query.toLowerCase().match(/[a-z0-9]+/g) ?? [],
    )].slice(0, MAX_QUERY_TERMS);
    if (queryTerms.length === 0) {
      return queryError(
        'MUXUI_QUERY_INVALID',
        'query.search.terms',
        'searchArtifacts query must contain an ASCII letter or number.',
        { query: normalized.query },
        false,
        normalized.queryApiVersion,
      );
    }
    const matches = [];
    for (const artifact of bundle.artifacts) {
      if (
        !appliesToPlatform(artifact, normalized.platform)
        || !implementationAvailable(artifact, normalized.platform)
        || !appliesToPurpose(artifact, normalized.purpose)
      ) {
        continue;
      }
      const reasons = [];
      let score = 0;
      for (const term of queryTerms) {
        for (const indexed of indexById.get(artifact.id).terms) {
          const match = indexed.term === term ? 'exact' : indexed.term.startsWith(term) ? 'prefix' : null;
          if (match) {
            // An artifact's own identity must outrank an incidental match in
            // many relation records (for example, `default-theme` references
            // several Button variants). Keep relation matches useful for
            // discovery, but make an exact id/name match decisive.
            const identityMatch = indexed.field === 'id' || indexed.field === 'name';
            const points = identityMatch
              ? (match === 'exact' ? 1000 : 500) + (indexed.field === 'name' ? 25 : 0)
              : (match === 'exact' ? 20 : 10);
            score += points;
            reasons.push({
              queryTerm: term,
              field: indexed.field,
              value: indexed.value,
              match,
              points,
            });
          }
        }
      }
      if (score > 0) {
        reasons.sort((left, right) => (
          compareText(left.queryTerm, right.queryTerm)
          || compareText(left.field, right.field)
          || compareText(left.value, right.value)
          || compareText(left.match, right.match)
        ));
        matches.push({ ...summary(artifact, normalized.detail), score, matchReasons: reasons });
      }
    }
    matches.sort((left, right) => right.score - left.score || compareText(left.id, right.id));
    const page = paginate(matches, 'searchArtifacts', normalized, bundle.catalogDigest);
    if (page.error) return page.error;
    return success('artifact.search', { query: normalized.query, items: page.items }, {
      ...baseMeta(bundle, resolutionContext, normalized),
      truncated: page.truncated,
      nextCursor: page.nextCursor,
    }, { apiVersion: normalized.queryApiVersion });
  }

  function getArtifact(request) {
    const parsed = normalizeRequest(request, 'getArtifact', bundle);
    if (parsed.error) return parsed.error;
    const { normalized } = parsed;
    if (
      typeof normalized.id !== 'string'
      || !new RegExp(ARTIFACT_REF_PATTERN).test(normalized.id)
    ) {
      return queryError(
        'MUXUI_QUERY_INVALID',
        'query.get.id',
        'getArtifact id must be an ArtifactRef string.',
        { id: normalized.id },
        false,
        normalized.queryApiVersion,
      );
    }
    const artifact = artifactsById.get(normalized.id);
    if (
      !artifact
      || !appliesToPlatform(artifact, normalized.platform)
      || !implementationAvailable(artifact, normalized.platform)
      || !appliesToPurpose(artifact, normalized.purpose)
    ) {
      return queryError(
        'MUXUI_ARTIFACT_NOT_FOUND',
        'artifact.resolve.exists',
        `No artifact matched ${JSON.stringify(normalized.id)}.`,
        { id: normalized.id, platform: normalized.platform },
        true,
        normalized.queryApiVersion,
      );
    }
    if (['tokens', 'source-crosswalk'].includes(normalized.section)) {
      const page = sectionPage(bundle, artifact, normalized);
      return page.error ?? page.response;
    }
    if (normalized.cursor !== null) {
      return queryError(
        'MUXUI_QUERY_INVALID',
        'query.get.cursor-section',
        'getArtifact cursor requires section=tokens or section=source-crosswalk.',
        { section: normalized.section },
        false,
        normalized.queryApiVersion,
      );
    }
    const relations = related(bundle, artifact.id);
    const selectedBinding = bindingForPlatform(artifact.record, normalized.platform);
    let data;
    if (normalized.section !== null) {
      data = {
        artifact: summary(artifact, normalized.detail),
        section: normalized.section,
        value: selectedSection(bundle, artifact, normalized),
      };
    } else if (normalized.detail === 'brief') {
      data = { artifact: summary(artifact, 'brief') };
    } else if (normalized.detail === 'compact') {
      data = {
        artifact: {
          ...summary(artifact),
          ...(normalized.queryApiVersion === '2.0.0' && artifact.kind === 'token'
            ? tokenSectionSummary(artifact)
            : {}),
        },
        relations,
      };
    } else {
      const selectedRequirementSets = selectedBinding === null
        ? undefined
        : Object.fromEntries(Object.entries(artifact.tokenRequirementSets)
          .filter(([key]) => key.startsWith(`${selectedBinding.bindingId}:`)));
      const selectedPlatformSafetyRequirementSets = selectedBinding === null
        ? undefined
        : Object.fromEntries(Object.entries(artifact.platformSafetyRequirementSets)
          .filter(([key]) => key.startsWith(`${selectedBinding.bindingId}:`)));
      const {
        sourceCrosswalk: _sourceCrosswalk,
        tokens: _tokens,
        extensions: _extensions,
        ...tokenRecordSummary
      } = artifact.record;
      const selectedRecord = artifact.kind === 'token'
        ? normalized.queryApiVersion === '2.0.0'
          ? { ...tokenRecordSummary, ...tokenSectionSummary(artifact) }
          : { ...tokenRecordSummary, tokens: artifact.record.tokens }
        : artifact.record;
      data = {
        artifact: {
          ...selectedRecord,
          contentRevision: artifact.contentRevision,
          bindingSpecRevisions: artifact.bindingSpecRevisions,
          tokenRequirementSetDigests: Object.fromEntries(Object.entries(artifact.tokenRequirementSets)
            .map(([key, value]) => [key, value.digest])),
          ...(selectedRequirementSets === undefined ? {} : { tokenRequirementSets: selectedRequirementSets }),
          platformSafetyRequirementSetDigests: Object.fromEntries(
            Object.entries(artifact.platformSafetyRequirementSets)
              .map(([key, value]) => [key, value.digest]),
          ),
          ...(selectedPlatformSafetyRequirementSets === undefined ? {} : {
            platformSafetyRequirementSets: selectedPlatformSafetyRequirementSets,
          }),
          source: artifact.source,
        },
        relations,
      };
    }
    const revisions = {
      conceptContent: artifact.contentRevision,
      bindingContent: selectedBinding?.bindingId
        ? (artifact.bindingContentRevisions[selectedBinding.bindingId] ?? null)
        : null,
      bindingSpec: selectedBinding?.bindingId
        ? (artifact.bindingSpecRevisions[selectedBinding.bindingId] ?? null)
        : null,
    };
    const warnings = normalized.queryApiVersion === '1.2.0'
      && normalized.section === null
      && normalized.detail === 'full'
      && artifact.kind === 'token'
      ? [{
        code: 'MUXUI_QUERY_INLINE_TOKENS_DEPRECATED',
        ruleId: 'query.inline-tokens.deprecated',
        message: 'Inline token retrieval is deprecated and is removed in query API 2.0.0.',
        retryable: false,
        details: {
          replacement: 'section=tokens',
          noticeBoundary: 'complete separately human-accepted Phase A release',
        },
      }]
      : [];
    const meta = baseMeta(bundle, resolutionContext, normalized, revisions);
    const response = success(
      'artifact.detail',
      data,
      meta,
      { apiVersion: normalized.queryApiVersion, warnings },
    );
    if (
      normalized.queryApiVersion === '2.0.0'
      && normalized.section === null
      && normalized.detail !== 'brief'
      && artifact.kind === 'token'
    ) {
      validateTokenDetailSummary({ responseArtifact: response.data.artifact, selectedArtifact: artifact });
    }
    return response;
  }

  return deepFreeze({ getManifest, listArtifacts, searchArtifacts, getArtifact });
}

const defaultApi = createCatalogApi(parseJsonStrict(catalogJson));

export const getManifest = defaultApi.getManifest;
export const listArtifacts = defaultApi.listArtifacts;
export const searchArtifacts = defaultApi.searchArtifacts;
export const getArtifact = defaultApi.getArtifact;

export function migrateCatalogPackageV1ToV2(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('MUXUI_CATALOG_PACKAGE_INVALID: descriptor must be an object');
  }
  if (input.schema === 'muxui-catalog-package-v2') {
    if (
      !Array.isArray(input.supportedQueryApiVersions)
      || !input.supportedQueryApiVersions.includes(input.queryApiVersion)
    ) throw new Error('MUXUI_CATALOG_PACKAGE_INVALID: v2 query versions are inconsistent');
    return deepFreeze(structuredClone(input));
  }
  if (input.schema !== 'muxui-catalog-package-v1' || typeof input.queryApiVersion !== 'string') {
    throw new Error('MUXUI_CATALOG_PACKAGE_INVALID: expected a v1 or v2 descriptor');
  }
  return deepFreeze({
    ...structuredClone(input),
    schema: 'muxui-catalog-package-v2',
    supportedQueryApiVersions: [input.queryApiVersion],
  });
}
