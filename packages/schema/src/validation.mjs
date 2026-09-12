import { canonicalJson, parseJsonStrict, sha256Digest } from './canonical.mjs';
import { platformSafetyRequirementIds } from '../generated/platform-safety-contract.mjs';
import {
  loadFamilySchema,
  loadJsonDocument,
  requiredFieldOwnershipContexts,
  requiredReservedFields,
  resolveSchemaReference,
} from './contracts.mjs';

export class SchemaValidationError extends Error {
  constructor(code, issues) {
    super(`${code}: ${issues.map(({ path, message }) => `${path} ${message}`).join('; ')}`);
    this.name = 'SchemaValidationError';
    this.code = code;
    this.issues = issues;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function decodeSectionCursor(value) {
  const match = /^c1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/u.exec(value);
  if (!match) throw new Error('cursor syntax');
  const bytes = Buffer.from(match[1], 'base64url').toString('utf8');
  if (Buffer.from(bytes, 'utf8').toString('base64url') !== match[1]) {
    throw new Error('cursor encoding');
  }
  if (sha256Digest(bytes).slice(7) !== match[2]) throw new Error('cursor digest');
  const payload = parseJsonStrict(bytes);
  const keys = [
    'catalogDigest',
    'nextPosition',
    'queryApiVersion',
    'section',
    'selectorDigest',
    'tokenSourceContentRevision',
  ];
  if (
    !isObject(payload)
    || canonicalJson(Object.keys(payload).sort()) !== canonicalJson(keys)
    || !['1.2.0', '2.0.0'].includes(payload.queryApiVersion)
    || !/^sha256:[a-f0-9]{64}$/u.test(payload.catalogDigest)
    || !/^sha256:[a-f0-9]{64}$/u.test(payload.tokenSourceContentRevision)
    || !['tokens', 'source-crosswalk'].includes(payload.section)
    || !/^sha256:[a-f0-9]{64}$/u.test(payload.selectorDigest)
    || !Number.isInteger(payload.nextPosition)
    || payload.nextPosition < 1
    || payload.nextPosition > 4294967295
    || canonicalJson(payload) !== bytes
  ) throw new Error('cursor payload');
  return payload;
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isObject(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function discriminatedBranchIndex(branches, value) {
  if (!isObject(value)) return null;
  const keys = Object.keys(value).sort().filter((key) => branches.every((branch) => {
    const property = branch.properties?.[key];
    return isObject(property) && (property.const !== undefined || Array.isArray(property.enum));
  }));
  for (const key of keys) {
    const matches = branches.flatMap((branch, index) => {
      const property = branch.properties[key];
      const matched = property.const !== undefined
        ? sameValue(value[key], property.const)
        : property.enum.some((item) => sameValue(value[key], item));
      return matched ? [index] : [];
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

function evaluate(schema, value, path, currentFile, issues, documents) {
  if (schema === true) return;
  if (schema === false) {
    issues.push({ path, message: 'is denied by the closed schema' });
    return;
  }
  if (schema.$ref) {
    const resolved = resolveSchemaReference(schema.$ref, currentFile, documents);
    evaluate(resolved.schema, value, path, resolved.fileName, issues, documents);
  }
  if (schema.allOf) {
    for (const item of schema.allOf) evaluate(item, value, path, currentFile, issues, documents);
  }
  if (schema.anyOf) {
    const matches = schema.anyOf.some((item) => {
      const candidateIssues = [];
      evaluate(item, value, path, currentFile, candidateIssues, documents);
      return candidateIssues.length === 0;
    });
    if (!matches) issues.push({ path, message: 'matches no allowed schema' });
  }
  if (schema.oneOf) {
    const candidates = schema.oneOf.map((item) => {
      const candidateIssues = [];
      evaluate(item, value, path, currentFile, candidateIssues, documents);
      return candidateIssues;
    });
    const matches = candidates.filter((candidateIssues) => candidateIssues.length === 0).length;
    if (matches === 0) {
      const branchIndex = discriminatedBranchIndex(schema.oneOf, value);
      if (branchIndex !== null) issues.push(...candidates[branchIndex]);
      else issues.push({ path, message: 'must match exactly one schema; matched 0' });
    } else if (matches !== 1) {
      issues.push({ path, message: `must match exactly one schema; matched ${matches}` });
    }
  }
  if (schema.not) {
    const candidateIssues = [];
    evaluate(schema.not, value, path, currentFile, candidateIssues, documents);
    if (candidateIssues.length === 0) issues.push({ path, message: 'matches a forbidden schema' });
  }
  if (schema.const !== undefined && !sameValue(value, schema.const)) {
    issues.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
    return;
  }
  if (schema.enum && !schema.enum.some((item) => sameValue(value, item))) {
    issues.push({ path, message: `must be one of ${schema.enum.join(', ')}` });
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      issues.push({ path, message: `must be ${types.join(' or ')}` });
      return;
    }
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `must have length at least ${schema.minLength}` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `does not match ${schema.pattern}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `must have length at most ${schema.maxLength}` });
    }
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) {
    issues.push({ path, message: `must be at least ${schema.minimum}` });
  }
  if (typeof value === 'number' && schema.maximum !== undefined && value > schema.maximum) {
    issues.push({ path, message: `must be at most ${schema.maximum}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `must contain at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `must contain at most ${schema.maxItems} items` });
    }
    if (schema.uniqueItems) {
      const unique = new Set(value.map((item) => canonicalJson(item)));
      if (unique.size !== value.length) issues.push({ path, message: 'must contain unique items' });
    }
    if (schema.items) {
      value.forEach((item, index) => evaluate(
        schema.items,
        item,
        `${path}/${index}`,
        currentFile,
        issues,
        documents,
      ));
    }
  }
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      issues.push({ path, message: `must contain at least ${schema.minProperties} properties` });
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        issues.push({
          path: `${path}/${escapeJsonPointer(required)}`,
          message: `is missing required field ${required}`,
        });
      }
    }
    for (const key of keys) {
      if (schema.propertyNames) {
        evaluate(schema.propertyNames, key, `${path}/{propertyName}`, currentFile, issues, documents);
      }
      const propertySchema = Object.hasOwn(schema.properties ?? {}, key)
        ? schema.properties[key]
        : undefined;
      if (propertySchema !== undefined) {
        evaluate(propertySchema, value[key], `${path}/${key}`, currentFile, issues, documents);
        continue;
      }
      const patternSchema = Object.entries(schema.patternProperties ?? {})
        .find(([pattern]) => new RegExp(pattern).test(key))?.[1];
      if (patternSchema) {
        evaluate(patternSchema, value[key], `${path}/${key}`, currentFile, issues, documents);
      } else if (schema.additionalProperties === false) {
        issues.push({ path: `${path}/${key}`, message: 'is an unknown field' });
      } else if (isObject(schema.additionalProperties)) {
        evaluate(
          schema.additionalProperties,
          value[key],
          `${path}/${key}`,
          currentFile,
          issues,
          documents,
        );
      }
    }
  }
}

function walkObjects(value, visit, path = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkObjects(item, visit, `${path}/${index}`));
  } else if (isObject(value)) {
    visit(value, path);
    for (const [key, item] of Object.entries(value)) {
      walkObjects(item, visit, `${path}/${key}`);
    }
  }
}

function semanticIssues(family, value, ownership) {
  const issues = [];
  const prototypeKeys = new Set(['__proto__', 'constructor', 'prototype']);
  walkObjects(value, (object, path) => {
    for (const key of Object.keys(object)) {
      if (prototypeKeys.has(key)) {
        issues.push({ path: `${path}/${key}`, message: 'prototype-bearing keys are forbidden' });
      }
    }
  });
  if (['binding', 'capability', 'component', 'example', 'guide', 'token-source'].includes(family)) {
    const ownershipRegistry = ownership ?? loadJsonDocument('field-ownership.json');
    const forbidden = new Set(
      [...ownershipRegistry.fields, ...(ownershipRegistry.reservedFields ?? [])]
        .filter((field) => field.forbiddenInAuthoredSource)
        .map((field) => field.name),
    );
    const sourceContexts = [{ object: value, path: '$' }];
    const bindingContexts = [];
    if (family === 'binding') {
      bindingContexts.push({ object: value, path: '$' });
    } else if (family === 'component') {
      for (const [bindingId, binding] of Object.entries(value.bindings ?? {})) {
        bindingContexts.push({ object: binding, path: `$/bindings/${bindingId}` });
      }
    }
    const runtimeProfileContexts = bindingContexts.flatMap(({ object, path }) =>
      Object.entries(object.runtimeProfiles ?? {}).map(([runtimeProfileId, runtimeProfile]) => ({
        object: runtimeProfile,
        path: `${path}/runtimeProfiles/${runtimeProfileId}`,
        runtimeProfileId,
      })));
    sourceContexts.push(...bindingContexts, ...runtimeProfileContexts);
    const uniqueSourceContexts = new Map(
      sourceContexts.map((context) => [context.path, context]),
    );
    for (const { object, path } of uniqueSourceContexts.values()) {
      for (const key of Object.keys(object)) {
        if (forbidden.has(key)) {
          issues.push({ path: `${path}/${key}`, message: 'is derived or proved and cannot be authored' });
        }
      }
      if (object.extensions && object.lifecycle !== 'experimental') {
        issues.push({ path: `${path}/extensions`, message: 'requires experimental lifecycle' });
      }
    }
    for (const { object, path, runtimeProfileId } of [
      ...bindingContexts,
      ...runtimeProfileContexts,
    ]) {
      if (object.strategy) {
        const runtimeProfile = runtimeProfileId !== undefined;
        const expectedValidationProfiles = {
          ios: 'native.ios',
          android: 'native.android',
          'native.react-native-web': 'native.react-native-web',
        };
        if (object.strategy === 'unsupported') {
          if (object.lifecycle !== undefined || object.validationProfile !== undefined) {
            issues.push({ path, message: 'unsupported disposition must omit lifecycle and validationProfile' });
          }
          if (!object.reason) {
            issues.push({ path, message: 'unsupported disposition requires a reason' });
          }
        } else {
          if (object.reason !== undefined || object.alternative !== undefined) {
            issues.push({ path, message: 'implemented disposition must omit reason and alternative' });
          }
          if (!object.lifecycle) issues.push({ path, message: 'implemented disposition requires lifecycle' });
          if (runtimeProfile && !object.validationProfile) {
            issues.push({ path, message: 'supported runtime profile requires validationProfile' });
          } else if (
            runtimeProfile
            && object.validationProfile !== (
              Object.hasOwn(expectedValidationProfiles, runtimeProfileId)
                ? expectedValidationProfiles[runtimeProfileId]
                : undefined
            )
          ) {
            issues.push({
              path: `${path}/validationProfile`,
              message: `must equal ${
                Object.hasOwn(expectedValidationProfiles, runtimeProfileId)
                  ? expectedValidationProfiles[runtimeProfileId]
                  : 'a declared validation profile'
              }`,
            });
          }
        }
      }
    }
    const platformSafetyIds = new Set(platformSafetyRequirementIds);
    for (const { object, path } of bindingContexts) {
      for (const [declarationIndex, declaration] of (object.platformSafety ?? []).entries()) {
        for (const [requirementIndex, requirement] of (declaration.requirements ?? []).entries()) {
          if (!platformSafetyIds.has(requirement.id)) {
            issues.push({
              path: `${path}/platformSafety/${declarationIndex}/requirements/${requirementIndex}/id`,
              message: 'must be owned by the architecture platform-safety registry',
            });
          }
        }
      }
    }
  }
  if (family === 'query-envelope') {
    const platformSafetyIds = new Set(platformSafetyRequirementIds);
    const unitsByType = {
      color: 'hex',
      dimension: 'px',
      duration: 'ms',
      number: 'unitless',
      string: 'string',
    };
    walkObjects(value, (object, path) => {
      if (Array.isArray(object.dispositions) && Object.hasOwn(object, 'contractDigest')) {
        for (const [index, disposition] of object.dispositions.entries()) {
          if (!platformSafetyIds.has(disposition.id)) {
            issues.push({
              path: `${path}/dispositions/${index}/id`,
              message: 'must be owned by the architecture platform-safety registry',
            });
          }
        }
      }
      if (
        typeof object.token === 'string'
        && typeof object.layer === 'string'
        && typeof object.type === 'string'
        && typeof object.unit === 'string'
        && Object.hasOwn(object, 'resolved')
        && Array.isArray(object.dependencies)
      ) {
        const tokenLayer = object.token.split('.')[0];
        if (object.layer !== tokenLayer) {
          issues.push({
            path: `${path}/layer`,
            message: `must equal the ${tokenLayer} token namespace`,
          });
        }
        const expectedUnit = unitsByType[object.type];
        if (expectedUnit !== undefined && object.unit !== expectedUnit) {
          issues.push({
            path: `${path}/unit`,
            message: `must equal ${expectedUnit} for ${object.type}`,
          });
        }
        const expectsNumber = ['dimension', 'duration', 'number'].includes(object.type);
        if (
          (expectsNumber && (typeof object.resolved !== 'number' || !Number.isFinite(object.resolved)))
          || (!expectsNumber && typeof object.resolved !== 'string')
        ) {
          issues.push({
            path: `${path}/resolved`,
            message: `must be a ${expectsNumber ? 'finite number' : 'string'} for ${object.type}`,
          });
        } else if (
          object.type === 'color'
          && !/^#[a-fA-F0-9]{6}(?:[a-fA-F0-9]{2})?$/u.test(object.resolved)
        ) {
          issues.push({
            path: `${path}/resolved`,
            message: 'must be a six- or eight-digit hex color',
          });
        }
      }
    });
    const artifact = value.type === 'artifact.detail' ? value.data?.artifact : null;
    if (artifact?.kind === 'token') {
      if (Object.hasOwn(artifact, 'sourceCrosswalk')) {
        issues.push({ path: '$/data/artifact/sourceCrosswalk', message: 'authored crosswalk is sectional-only' });
      }
      if (value.apiVersion === '2.0.0' && value.meta?.detail !== 'brief') {
        const exactFields = value.meta?.detail === 'compact'
          ? [
            'availableSections', 'contentRevision', 'id', 'kind', 'lifecycle', 'name',
            'platforms', 'source', 'sourceCrosswalkDigest', 'summary', 'tokenCount',
            'tokenSourceContentRevision',
          ]
          : [
            'availableSections', 'bindingSpecRevisions', 'contentRevision', 'id', 'kind',
            'lifecycle', 'name', 'platformSafetyRequirementSetDigests', 'schemaVersion',
            'source', 'sourceCrosswalkDigest', 'summary', 'theme', 'tokenContractVersion',
            'tokenCount', 'tokenRequirementSetDigests', 'tokenSourceContentRevision',
          ];
        if (canonicalJson(Object.keys(artifact).sort()) !== canonicalJson(exactFields)) {
          issues.push({
            path: '$/data/artifact',
            message: `must contain exactly the closed query API 2.0 ${value.meta?.detail} token fields`,
          });
        }
        const requiredSummary = [
          'availableSections',
          'sourceCrosswalkDigest',
          'tokenCount',
          'tokenSourceContentRevision',
        ];
        for (const field of requiredSummary) {
          if (!Object.hasOwn(artifact, field)) {
            issues.push({ path: `$/data/artifact/${field}`, message: 'is required by query API 2.0 token summary' });
          }
        }
        if (Object.hasOwn(artifact, 'tokens')) {
          issues.push({ path: '$/data/artifact/tokens', message: 'query API 2.0 requires sectional token retrieval' });
        }
        const expectedSections = artifact.sourceCrosswalkDigest === null
          ? ['tokens']
          : ['tokens', 'source-crosswalk'];
        if (canonicalJson(artifact.availableSections) !== canonicalJson(expectedSections)) {
          issues.push({ path: '$/data/artifact/availableSections', message: 'must use the canonical section order' });
        }
        if (
          artifact.sourceCrosswalkDigest !== null
          && !/^sha256:[a-f0-9]{64}$/u.test(artifact.sourceCrosswalkDigest)
        ) issues.push({ path: '$/data/artifact/sourceCrosswalkDigest', message: 'must be null or a canonical digest' });
        if (!Number.isInteger(artifact.tokenCount) || artifact.tokenCount < 0) {
          issues.push({ path: '$/data/artifact/tokenCount', message: 'must be a non-negative integer' });
        }
        if (artifact.tokenSourceContentRevision !== value.meta?.revisions?.conceptContent) {
          issues.push({ path: '$/data/artifact/tokenSourceContentRevision', message: 'must bind the selected token source revision' });
        }
      } else if (
        ['1.1.0', '1.2.0'].includes(value.apiVersion)
        && value.meta?.detail === 'full'
        && !Object.hasOwn(artifact, 'tokens')
      ) {
        issues.push({ path: '$/data/artifact/tokens', message: 'historical full token response requires inline tokens' });
      }
    }
  }
  if (family === 'section-page') {
    const { entries, meta, page } = value;
    if (value.schemaVersion !== meta?.queryApiVersion) {
      issues.push({ path: '$/schemaVersion', message: 'must equal meta.queryApiVersion' });
    }
    if (
      typeof meta?.catalogVersion === 'string'
      && (
        !SEMVER_PATTERN.test(meta.catalogVersion)
        || Buffer.byteLength(meta.catalogVersion, 'utf8') > 64
      )
    ) issues.push({ path: '$/meta/catalogVersion', message: 'must be SemVer within 64 UTF-8 bytes' });
    if (
      typeof meta?.artifactId === 'string'
      && Buffer.byteLength(meta.artifactId, 'utf8') > 256
    ) issues.push({ path: '$/meta/artifactId', message: 'must be within 256 UTF-8 bytes' });
    if (entries?.status === 'available') {
      const items = entries.items ?? [];
      if (meta?.section === 'tokens') {
        const complete = items.every((item) => (
          isObject(item) && Object.hasOwn(item, 'id') && Object.hasOwn(item, 'definition')
        ));
        if (!complete) {
          issues.push({ path: '$/entries/items', message: 'tokens section requires complete token entries' });
        }
        const ids = complete ? items.map(({ id }) => id) : [];
        if (complete && canonicalJson(ids) !== canonicalJson([...ids].sort())) {
          issues.push({ path: '$/entries/items', message: 'token entries must use bytewise ID order' });
        }
      } else if (meta?.section === 'source-crosswalk') {
        const complete = items.every((item) => (
          isObject(item) && Object.hasOwn(item, 'occurrence') && Object.hasOwn(item, 'disposition')
        ));
        if (!complete) {
          issues.push({ path: '$/entries/items', message: 'source-crosswalk section requires complete occurrence entries' });
        }
        const order = complete ? items.map((item) => ({
          ordinal: item.occurrence?.ordinal,
          bytes: canonicalJson(item),
        })) : [];
        if (complete && order.some((item, index) => index > 0 && (
          item.ordinal < order[index - 1].ordinal
          || (item.ordinal === order[index - 1].ordinal && item.bytes <= order[index - 1].bytes)
        ))) {
          issues.push({
            path: '$/entries/items',
            message: 'source-crosswalk entries must use strict ordinal and canonical-byte order',
          });
        }
        for (const [index, item] of items.entries()) {
          const path = `$/entries/items/${index}`;
          if (meta.queryApiVersion === '1.2.0' && Object.hasOwn(item, 'group')) {
            issues.push({ path: `${path}/group`, message: 'v1.2 retains only the historical groupId projection' });
          }
          if (meta.queryApiVersion === '2.0.0') {
            if ((item.groupId === undefined) !== (item.group === undefined)) {
              issues.push({ path, message: 'v2 group detail must be present exactly when groupId is present' });
            }
            if (item.group !== undefined) {
              const { group } = item;
              if (group.id !== item.groupId || group.member?.ordinal !== item.occurrence?.ordinal) {
                issues.push({ path: `${path}/group`, message: 'must bind the exact occurrence and groupId' });
              }
              const expectedMode = group.relationship === 'mode-variants'
                ? group.member?.role === 'default' ? 'motion.full'
                  : ['reduced-system', 'reduced-explicit'].includes(group.member?.role) ? 'motion.reduced' : null
                : undefined;
              const allowedRole = group.relationship === 'equivalent-source-values'
                ? group.member?.role === 'equivalent-source-value'
                : group.relationship === 'selector-variants'
                  ? ['base', 'web-responsive'].includes(group.member?.role)
                  : expectedMode !== null;
              if (!allowedRole || group.member?.mode !== expectedMode) {
                issues.push({ path: `${path}/group/member`, message: 'relationship, member role, and mode are inconsistent' });
              }
            }
          }
        }
      }
    }
    if (entries?.status === 'absent' && meta?.section !== 'source-crosswalk') {
      issues.push({ path: '$/entries/status', message: 'typed absence requires section source-crosswalk' });
    }
    if (
      entries?.status === 'absent'
      && meta?.queryApiVersion === '2.0.0'
      && entries.reason !== 'token-source-omits-source-crosswalk'
    ) issues.push({ path: '$/entries/reason', message: 'query API 2.0 requires schema-2.1 omitted absence' });
    if (page && entries) {
      if (page.returned !== entries.items?.length) {
        issues.push({ path: '$/page/returned', message: 'must equal entries.items length' });
      }
      const measuredEntryTokens = (entries.items ?? []).reduce(
        (total, entry) => total + (canonicalJson(entry).match(/[\p{L}\p{N}_]+/gu)?.length ?? 0),
        0,
      );
      if (page.entryTokens !== measuredEntryTokens) {
        issues.push({ path: '$/page/entryTokens', message: 'must equal the complete-entry lexeme cost' });
      }
      if (page.position + page.returned > 4294967295) {
        issues.push({ path: '$/page/returned', message: 'must not overflow the cursor position bound' });
      }
      if ((page.remaining > 0) !== (page.nextCursor !== null)) {
        issues.push({ path: '$/page/nextCursor', message: 'must be non-null exactly when entries remain' });
      }
      if (page.nextCursor !== null && typeof page.nextCursor === 'string') {
        try {
          const cursor = decodeSectionCursor(page.nextCursor);
          if (
            cursor.nextPosition !== page.position + page.returned
            || cursor.queryApiVersion !== meta?.queryApiVersion
            || cursor.catalogDigest !== meta?.catalogDigest
            || cursor.tokenSourceContentRevision !== meta?.tokenSourceContentRevision
            || cursor.section !== meta?.section
            || cursor.selectorDigest !== meta?.selectorDigest
          ) {
            issues.push({ path: '$/page/nextCursor', message: 'must bind the exact page continuation and metadata' });
          }
        } catch {
          issues.push({ path: '$/page/nextCursor', message: 'must be one canonical integrity-bound section cursor' });
        }
      }
      if (page.remaining > 0 && page.returned < 1) {
        issues.push({ path: '$/page/returned', message: 'must make one-entry minimum progress' });
      }
      if (page.position === 4294967295 && page.nextCursor !== null) {
        issues.push({ path: '$/page/nextCursor', message: 'maximum position must be terminal' });
      }
      if (entries.status === 'absent' && (
        page.position !== 0
        || page.returned !== 0
        || page.remaining !== 0
        || page.nextCursor !== null
        || page.entryTokens !== 0
      )) {
        issues.push({ path: '$/page', message: 'typed absence must use the canonical empty page' });
      }
    }
  }
  if (family === 'token-section-page-budget-profile') {
    const expectedProfileId = {
      '1.2.0': 'muxui-token-section-page-budget-1-2-0',
      '2.0.0': 'muxui-token-section-page-budget-2-0-0',
    }[value.queryApiVersion];
    if (expectedProfileId !== value.id) {
      issues.push({ path: '$/id', message: 'must identify the exact queryApiVersion budget profile' });
    }
    const expectedBindings = [
      'queryApiVersion',
      'catalogDigest',
      'tokenSourceContentRevision',
      'section',
      'selectorDigest',
      'nextPosition',
    ];
    if (canonicalJson(value.cursorBindings) !== canonicalJson(expectedBindings)) {
      issues.push({ path: '$/cursorBindings', message: 'must use the canonical cursor payload field order' });
    }
    if (value.maximumEntryTokens + value.envelopeReserveTokens !== value.densePageBudgetTokens) {
      issues.push({ path: '$/densePageBudgetTokens', message: 'must equal entry budget plus envelope reserve' });
    }
    if (value.measuredWorstCaseEnvelopeTokens > value.envelopeReserveTokens) {
      issues.push({ path: '$/measuredWorstCaseEnvelopeTokens', message: 'must fit within the envelope reserve' });
    }
    if (value.defaultItemLimit > value.maximumItemLimit) {
      issues.push({ path: '$/defaultItemLimit', message: 'must not exceed maximumItemLimit' });
    }
    if (value.artifactIdMaximumLexemes > value.maximumEntryTokens) {
      issues.push({ path: '$/artifactIdMaximumLexemes', message: 'must fit within the maximum entry budget' });
    }
    if (value.catalogVersionMaximumLexemes > value.envelopeReserveTokens) {
      issues.push({ path: '$/catalogVersionMaximumLexemes', message: 'must fit within the envelope reserve' });
    }
  }
  if (family === 'example') {
    const implementationPurposes = new Set(['generation', 'validation', 'migration']);
    if (
      value.binding?.guidanceImpact === 'editorial'
      && value.binding.purposes?.some((purpose) => implementationPurposes.has(purpose))
    ) {
      issues.push({
        path: '$/binding/guidanceImpact',
        message: 'implementation-relevant examples must be normative',
      });
    }
  }
  if (family === 'component') {
    const requiredNativeProfiles = ['ios', 'android', 'native.react-native-web'];
    for (const [bindingId, binding] of Object.entries(value.bindings ?? {})) {
      const runtimeProfileIds = Object.keys(binding.runtimeProfiles ?? {});
      if (bindingId !== 'native.react-native' && runtimeProfileIds.length > 0) {
        issues.push({
          path: `$/bindings/${bindingId}/runtimeProfiles`,
          message: 'runtime profiles are owned only by native.react-native',
        });
      }
      if (bindingId === 'native.react-native' && binding.strategy !== 'unsupported') {
        for (const profileId of requiredNativeProfiles) {
          if (!runtimeProfileIds.includes(profileId)) {
            issues.push({
              path: `$/bindings/${bindingId}/runtimeProfiles`,
              message: `is missing required disposition ${profileId}`,
            });
          }
        }
      }
    }
  }
  if (family === 'token-source') {
    for (const [tokenId, definition] of Object.entries(value.tokens ?? {})) {
      const declaredLayer = tokenId.split('.')[0];
      if (definition.layer !== declaredLayer) {
        issues.push({
          path: `$/tokens/${tokenId}/layer`,
          message: `must explicitly equal the ${declaredLayer} token namespace`,
        });
      }
      if (definition.layer === 'reference' && definition.overridePolicy !== 'fixed') {
        issues.push({
          path: `$/tokens/${tokenId}/overridePolicy`,
          message: 'reference tokens are fixed canonical inputs',
        });
      }
      for (const modeKey of Object.keys(definition.modes ?? {})) {
        const [axis, mode] = modeKey.split('.');
        if (!value.theme?.modeAxes?.[axis]?.includes(mode)) {
          issues.push({
            path: `$/tokens/${tokenId}/modes/${modeKey}`,
            message: 'must reference a declared mode axis value',
          });
        }
      }
    }
  }
  return issues;
}

export function validateFamily(family, value, { schemas, ownership } = {}) {
  const { fileName, schema } = loadFamilySchema(family, schemas);
  const issues = [];
  evaluate(schema, value, '$', fileName, issues, schemas);
  issues.push(...semanticIssues(family, value, ownership));
  if (issues.length > 0) throw new SchemaValidationError('MUXUI_SCHEMA_INVALID', issues);
  return value;
}

/** Validates an internal closed contract without admitting a public catalog family. */
export function validateContractDocument(fileName, value, { schemas } = {}) {
  const schema = schemas?.[fileName] ?? loadJsonDocument(fileName);
  const issues = [];
  evaluate(schema, value, '$', fileName, issues, schemas);
  if (issues.length > 0) throw new SchemaValidationError('MUXUI_SCHEMA_INVALID', issues);
  return value;
}

function escapeJsonPointer(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function collectSchemaFieldDeclarations(schema, pointer = '#', declarations = []) {
  if (Array.isArray(schema)) {
    schema.forEach((item, index) => collectSchemaFieldDeclarations(
      item,
      `${pointer}/${index}`,
      declarations,
    ));
    return declarations;
  }
  if (!isObject(schema)) return declarations;
  for (const [keyword, value] of Object.entries(schema)) {
    const keywordPointer = `${pointer}/${escapeJsonPointer(keyword)}`;
    if (keyword === 'properties' && isObject(value)) {
      for (const [name, propertySchema] of Object.entries(value)) {
        const schemaPointer = `${keywordPointer}/${escapeJsonPointer(name)}`;
        declarations.push({ name, schemaPointer });
        collectSchemaFieldDeclarations(propertySchema, schemaPointer, declarations);
      }
    } else {
      collectSchemaFieldDeclarations(value, keywordPointer, declarations);
    }
  }
  return declarations;
}

export function validateFieldOwnershipRegistry(
  registry = loadJsonDocument('field-ownership.json'),
  { schemas } = {},
) {
  if (!Array.isArray(registry.classes) || !Array.isArray(registry.fields)) {
    throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
      { path: '$', message: 'must declare classes and contextual fields' },
    ]);
  }
  const requiredContexts = new Map(
    requiredFieldOwnershipContexts.map((context) => [context.file, context]),
  );
  const contexts = new Map();
  for (const governed of registry.governedSchemas ?? []) {
    const requiredContext = requiredContexts.get(governed.file);
    if (
      contexts.has(governed.file)
      || !registry.classes.includes(governed.class)
      || !governed.owner
      || governed.class !== requiredContext?.class
      || governed.owner !== requiredContext?.owner
    ) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
        {
          path: `$/governedSchemas/${governed.file}`,
          message: 'must match the locked canonical class and owner',
        },
      ]);
    }
    contexts.set(governed.file, governed);
  }
  if (
    contexts.size !== requiredFieldOwnershipContexts.length
    || requiredFieldOwnershipContexts.some(({ file }) => !contexts.has(file))
  ) {
    throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
      {
        path: '$/governedSchemas',
        message: `must cover the locked schemas: ${requiredFieldOwnershipContexts
          .map(({ file }) => file)
          .join(', ')}`,
      },
    ]);
  }
  const expected = new Map();
  for (const governed of contexts.values()) {
    for (const declaration of collectSchemaFieldDeclarations(
      schemas?.[governed.file] ?? loadJsonDocument(governed.file),
    )) {
      const key = `${governed.file}${declaration.schemaPointer}`;
      expected.set(key, { ...declaration, ...governed });
    }
  }
  const declared = new Set();
  for (const field of registry.fields) {
    const key = `${field.schema}${field.schemaPointer}`;
    const context = expected.get(key);
    if (declared.has(key)) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
        { path: `$/fields/${key}`, message: 'has more than one owner declaration' },
      ]);
    }
    declared.add(key);
    if (
      !context
      || field.name !== context.name
      || field.class !== context.class
      || field.owner !== context.owner
    ) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
        {
          path: `$/fields/${key}`,
          message: 'must match one governed schema field, class, and canonical owner',
        },
      ]);
    }
  }
  for (const key of expected.keys()) {
    if (!declared.has(key)) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
        { path: `$/fields/${key}`, message: 'is missing an ownership declaration' },
      ]);
    }
  }
  const requiredReserved = new Map(
    requiredReservedFields.map((field) => [field.name, field]),
  );
  const reservedNames = new Set();
  for (const field of registry.reservedFields ?? []) {
    const requiredField = requiredReserved.get(field.name);
    if (
      reservedNames.has(field.name)
      || !registry.classes.includes(field.class)
      || !field.owner
      || field.class !== requiredField?.class
      || field.owner !== requiredField?.owner
      || field.forbiddenInAuthoredSource !== requiredField?.forbiddenInAuthoredSource
    ) {
      throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
        {
          path: `$/reservedFields/${field.name}`,
          message: 'must match one locked reserved class, owner, and authored-source prohibition',
        },
      ]);
    }
    reservedNames.add(field.name);
  }
  if (
    reservedNames.size !== requiredReservedFields.length
    || requiredReservedFields.some(({ name }) => !reservedNames.has(name))
  ) {
    throw new SchemaValidationError('MUXUI_FIELD_OWNERSHIP_INVALID', [
      {
        path: '$/reservedFields',
        message: `must cover the locked reserved fields: ${requiredReservedFields
          .map(({ name }) => name)
          .join(', ')}`,
      },
    ]);
  }
  return registry;
}

export function validateRelationRegistry() {
  const registrySchema = loadJsonDocument('relation.schema.json');
  const registry = {
    schemaVersion: registrySchema.schemaVersion,
    relations: registrySchema['x-muxui-registry'],
  };
  const issues = [];
  evaluate(registrySchema, registry, '$', 'relation.schema.json', issues);
  if (issues.length > 0) throw new SchemaValidationError('MUXUI_RELATION_INVALID', issues);
  return registry;
}

const kindFamilies = Object.freeze({
  capability: 'capability',
  component: 'component',
  example: 'example',
  guide: 'guide',
  token: 'token-source',
});

export function relationEdges(records) {
  const edges = [];
  for (const record of records) {
    if (record.kind === 'component') {
      for (const [bindingId, binding] of Object.entries(record.bindings)) {
        const bindingRef = `${record.id}#${bindingId}`;
        edges.push({ type: 'implemented-by', source: record.id, target: bindingRef });
        if (binding.tokenRecipe?.source) {
          edges.push({ type: 'uses', source: bindingRef, target: binding.tokenRecipe.source });
        }
      }
    } else if (record.kind === 'example') {
      edges.push({ type: 'example-of', source: record.id, target: record.binding.ref });
    } else if (record.kind === 'capability') {
      for (const target of record.availableOn) {
        edges.push({ type: 'available-on', source: record.id, target });
      }
    }
  }
  return edges;
}

export function validateCatalogRecords(records, { schemas, ownership } = {}) {
  validateFieldOwnershipRegistry(
    ownership ?? loadJsonDocument('field-ownership.json'),
    { schemas },
  );
  validateRelationRegistry();
  const ids = new Map();
  for (const record of records) {
    const family = Object.hasOwn(kindFamilies, record.kind)
      ? kindFamilies[record.kind]
      : undefined;
    if (!family) {
      throw new SchemaValidationError('MUXUI_SCHEMA_INVALID', [
        { path: '$/kind', message: `${record.kind} record behavior is unavailable in G0.1` },
      ]);
    }
    validateFamily(family, record, { schemas, ownership });
    if (ids.has(record.id)) {
      throw new SchemaValidationError('MUXUI_ARTIFACT_ID_INVALID', [
        { path: '$/id', message: `${record.id} is duplicated` },
      ]);
    }
    ids.set(record.id, record);
  }

  const bindingRefs = new Map();
  for (const record of records.filter(({ kind }) => kind === 'component')) {
    for (const [bindingId, binding] of Object.entries(record.bindings)) {
      bindingRefs.set(`${record.id}#${bindingId}`, binding);
    }
  }
  const issues = [];
  for (const record of records) {
    if (record.kind === 'example') {
      for (const prerequisite of record.prerequisites) {
        if (!ids.has(prerequisite)) {
          issues.push({
            path: '$/prerequisites',
            message: `${prerequisite} does not exist`,
          });
        }
      }
    }
    if (record.kind === 'component') {
      for (const [bindingId, binding] of Object.entries(record.bindings)) {
        const alternatives = [
          binding.alternative,
          ...Object.values(binding.runtimeProfiles ?? {}).map((profile) => profile.alternative),
        ].filter(Boolean);
        for (const alternative of alternatives) {
          if (!ids.has(alternative)) {
            issues.push({
              path: `$/bindings/${bindingId}/alternative`,
              message: `${alternative} does not exist`,
            });
          }
        }
      }
    }
  }
  for (const edge of relationEdges(records)) {
    if (edge.type === 'implemented-by' && !bindingRefs.has(edge.target)) {
      issues.push({ path: '$/relations', message: `${edge.target} does not exist` });
    } else if (edge.type === 'example-of' && !bindingRefs.has(edge.target)) {
      issues.push({ path: '$/binding/ref', message: `${edge.target} does not exist` });
    } else if (edge.type === 'example-of') {
      const example = ids.get(edge.source);
      const binding = bindingRefs.get(edge.target);
      if (binding.strategy === 'unsupported') {
        issues.push({
          path: '$/binding/ref',
          message: `${edge.target} is unsupported and cannot own an example`,
        });
      }
      const targetProfiles = binding.runtimeProfiles ?? {};
      for (const runtimeProfileId of example.binding.runtimeProfiles ?? []) {
        const runtimeProfile = Object.hasOwn(targetProfiles, runtimeProfileId)
          ? targetProfiles[runtimeProfileId]
          : undefined;
        if (!runtimeProfile || runtimeProfile.strategy === 'unsupported') {
          issues.push({
            path: '$/binding/runtimeProfiles',
            message: `${runtimeProfileId} is not supported by ${edge.target}`,
          });
        }
      }
    } else if (edge.type === 'uses' && !ids.has(edge.target)) {
      issues.push({ path: '$/tokenRecipe/source', message: `${edge.target} does not exist` });
    }
  }
  if (issues.length > 0) throw new SchemaValidationError('MUXUI_RELATION_INVALID', issues);
  return { records, edges: relationEdges(records) };
}

export function assertAppendOnlyErrorCodes(previousCodes, nextCodes) {
  const missing = previousCodes.filter((code) => !nextCodes.includes(code));
  if (missing.length > 0) {
    throw new SchemaValidationError('MUXUI_SCHEMA_VERSION_UNSUPPORTED', [
      { path: '$/errorCodes', message: `removed append-only codes: ${missing.join(', ')}` },
    ]);
  }
  return nextCodes;
}
