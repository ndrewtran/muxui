import { loadJsonDocument } from './contracts.mjs';

const artifactRefSchema = loadJsonDocument('artifact-ref.schema.json');
const errorCodeSchema = loadJsonDocument('error-code.schema.json');
const queryEnvelopeSchema = loadJsonDocument('query-envelope.schema.json');

export const ARTIFACT_KINDS = Object.freeze([...artifactRefSchema['x-muxui-kinds']]);
export const ENABLED_RECORD_KINDS = Object.freeze([
  ...artifactRefSchema['x-muxui-enabled-record-kinds'],
]);
export const ARTIFACT_REF_PATTERN = artifactRefSchema.pattern;
export const ERROR_CODES = Object.freeze([...errorCodeSchema.enum]);
export const QUERY_RESPONSE_TYPES = Object.freeze([
  ...queryEnvelopeSchema['x-muxui-response-types'],
]);
export const QUERY_ENVELOPE_SCHEMA_ID = queryEnvelopeSchema.$id;
export const QUERY_SELECTORS = Object.freeze(
  Object.fromEntries(
    Object.entries(queryEnvelopeSchema['x-muxui-selectors'])
      .map(([key, values]) => [key, Object.freeze([...values])]),
  ),
);
export const SCHEMA_VERSION = '2.1.0';
export const API_VERSION = '2.0.0';
export const QUERY_SCHEMA_VERSION = '2.0.0';
export const QUERY_API_VERSIONS = Object.freeze(['1.1.0', '1.2.0', '2.0.0']);
export const PHASE_A_QUERY_API_VERSIONS = Object.freeze(['1.1.0', '1.2.0']);
export const PHASE_B_QUERY_API_VERSIONS = QUERY_API_VERSIONS;

export function parseArtifactRef(value, { requireEnabledRecordKind = false } = {}) {
  const match = new RegExp(ARTIFACT_REF_PATTERN).exec(value);
  if (!match) throw new Error(`MUXUI_ARTIFACT_ID_INVALID: ${value}`);
  const [, kind, slug] = /^muxui:([^:]+):(.+)$/.exec(value);
  if (requireEnabledRecordKind && !ENABLED_RECORD_KINDS.includes(kind)) {
    throw new Error(`MUXUI_SCHEMA_INVALID: ${kind} record behavior is unavailable in G0.1`);
  }
  return { value, kind, slug };
}

export {
  CanonicalJsonError,
  canonicalDigest,
  canonicalJson,
  parseJsonStrict,
  sha256Digest,
} from './canonical.mjs';
export {
  classifySchemaChange,
  negotiateSchemaVersion,
  parseSchemaVersion,
} from './evolution.mjs';
export {
  migrateBindingV1ToV2,
  migrateComponentBindingsV1ToV2,
  migrateTokenSourceV1ToV2,
  migrateTokenSourceV2ToV2_1,
} from './migrations.mjs';
export {
  authoringMetadata,
  authoringMetadataDigest,
  resolveAuthoringField,
  validateAuthoringMetadata,
} from './authoring.mjs';
export {
  bindingContentRevisionPreimage,
  bindingContentRevision,
  bindingSpecRevisionPreimage,
  bindingSpecRevision,
  contentRevisionPreimage,
  contentRevision,
} from './revisions.mjs';
export {
  SchemaValidationError,
  assertAppendOnlyErrorCodes,
  relationEdges,
  validateCatalogRecords,
  validateContractDocument,
  validateFamily,
  validateFieldOwnershipRegistry,
  validateRelationRegistry,
} from './validation.mjs';
export {
  PlatformSafetyContractError,
  assertPlatformSafetyRequirementSet,
  compilePlatformSafetyRequirementSets,
  validatePlatformSafetyContract,
} from './platform-safety.mjs';
